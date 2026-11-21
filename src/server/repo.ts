/**
 * Data access for workspaces and processes. Every function is scoped by workspace slug,
 * and every query filters on workspace_id. Value cases are always computed here with the
 * domain model, never taken from the client.
 */
import { and, asc, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { DB } from "./db";
import { actuals, auditLog, baselines, designSteps, designs, memberships, processEdges, processes, steps, users, workspaces } from "./db/schema";
import type { ActualPoint } from "@/domain/actuals";
import type { Assumptions, AutonomyLevel, Baseline, FitFactors, ProcessDesign, ProcessEdge, Stage, StepDefinition, StepPhase } from "@/domain/types";
import { computeValueCase } from "@/domain/value-model";
import type { AssumptionsPatch, NewStep, ProcessInstance, StepPatch, WorkspaceState } from "@/lib/api-types";
import { customerService } from "@/templates";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Q = DB | Tx;

const toStage = (s: "not_started" | "find" | "build" | "run"): Stage => (s === "not_started" ? "not-started" : s);
const fromStage = (s: Stage): "not_started" | "find" | "build" | "run" => (s === "not-started" ? "not_started" : s);

/* ---------- reads ---------- */

type StepRow = typeof steps.$inferSelect;
const toStepDef = (s: StepRow): StepDefinition => ({
  id: s.key, name: s.name, description: s.description, minutesPerCase: s.minutesPerCase,
  caseShare: s.caseShare, phase: s.phase, x: s.posX,
  fit: { volume: s.fitVolume, ruleBased: s.fitRuleBased, dataReady: s.fitDataReady, errorRisk: s.fitErrorRisk },
});
const activeSteps = (rows: StepRow[]) => rows.filter((s) => !s.archivedAt).sort((a, b) => a.posX - b.posX || a.position - b.position);

async function workspaceBySlug(q: Q, slug: string) {
  const [ws] = await q.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (!ws) throw new NotFoundError(`Workspace ${slug} not found`);
  return ws;
}

async function processBySlug(q: Q, workspaceId: string, slug: string) {
  const [p] = await q.select().from(processes).where(and(eq(processes.workspaceId, workspaceId), eq(processes.slug, slug)));
  if (!p) throw new NotFoundError(`Process ${slug} not found`);
  return p;
}

async function draftOf(q: Q, workspaceId: string, processId: string) {
  const [d] = await q.select().from(designs).where(and(eq(designs.workspaceId, workspaceId), eq(designs.processId, processId), eq(designs.status, "draft")));
  if (!d) throw new NotFoundError("Process has no draft design");
  return d;
}

async function designLevels(q: Q, designId: string, stepRows: Array<{ id: string; key: string }>): Promise<ProcessDesign> {
  const rows = await q.select().from(designSteps).where(eq(designSteps.designId, designId));
  const keyOf = new Map(stepRows.map((s) => [s.id, s.key]));
  const levels: Record<string, AutonomyLevel> = {};
  const systemSteps: string[] = [];
  for (const r of rows) {
    const key = keyOf.get(r.stepId);
    if (!key) continue;
    levels[key] = r.autonomy as AutonomyLevel;
    if (r.isSystem) systemSteps.push(key);
  }
  return { levels, systemSteps };
}

export async function getWorkspaceState(db: DB, wsSlug: string): Promise<Omit<WorkspaceState, "me">> {
  const ws = await workspaceBySlug(db, wsSlug);
  const procs = await db.select().from(processes).where(eq(processes.workspaceId, ws.id)).orderBy(asc(processes.position));
  const allSteps = procs.length
    ? await db.select().from(steps).where(and(eq(steps.workspaceId, ws.id), inArray(steps.processId, procs.map((p) => p.id)))).orderBy(asc(steps.position))
    : [];

  const out: ProcessInstance[] = [];
  for (const p of procs) {
    const stepRows = allSteps.filter((s) => s.processId === p.id);
    const live = activeSteps(stepRows);
    const stepDefs: StepDefinition[] = live.map(toStepDef);
    const [draft] = await db.select().from(designs).where(and(eq(designs.processId, p.id), eq(designs.status, "draft")));
    const design = draft ? await designLevels(db, draft.id, stepRows) : { levels: {}, systemSteps: [] };

    let baseline: Baseline | null = null;
    const [b] = await db
      .select({ b: baselines, approver: users.name, d: designs })
      .from(baselines)
      .innerJoin(users, eq(users.id, baselines.approvedBy))
      .innerJoin(designs, eq(designs.id, baselines.designId))
      .where(and(eq(baselines.workspaceId, ws.id), eq(baselines.processId, p.id)))
      .orderBy(desc(baselines.approvedAt))
      .limit(1);
    if (b) {
      baseline = {
        approvedAt: b.b.approvedAt.toISOString(), approvedBy: b.approver, net: b.b.netValueSek,
        design: await designLevels(db, b.d.id, stepRows), assumptions: b.d.assumptions,
        // Baselines approved before snapshots existed fall back to today's steps.
        steps: b.d.stepsSnapshot ?? stepDefs,
      };
    }

    const keyOfStep = new Map(stepRows.map((s) => [s.id, s.key]));
    const actualRows = await db.select().from(actuals).where(and(eq(actuals.workspaceId, ws.id), eq(actuals.processId, p.id))).orderBy(asc(actuals.periodStart));
    const actualPoints: ActualPoint[] = actualRows.map((r) => ({ period: r.periodStart, metric: r.metric, step: r.stepId ? keyOfStep.get(r.stepId) ?? null : null, value: r.value }));

    const liveIds = new Set(live.map((s) => s.id));
    const edgeRows = await db.select().from(processEdges).where(and(eq(processEdges.workspaceId, ws.id), eq(processEdges.processId, p.id)));
    const edges: ProcessEdge[] = edgeRows
      .filter((e) => liveIds.has(e.fromStepId) && liveIds.has(e.toStepId))
      .map((e) => ({ id: e.id, from: keyOfStep.get(e.fromStepId)!, to: keyOfStep.get(e.toStepId)!, ...(e.label ? { label: e.label } : {}) }));

    out.push({
      id: p.slug, name: p.name, templateId: p.templateId, templateVersion: p.templateVersion, unit: p.unit,
      stage: toStage(p.stage), gate: p.gate, note: p.note, steps: stepDefs, design,
      assumptions: draft?.assumptions ?? customerService.defaultAssumptions, baseline, actuals: actualPoints, edges,
    });
  }
  return { workspace: { id: ws.slug, name: ws.name, isExample: ws.isExample }, processes: out };
}

/* ---------- writes ---------- */

async function audit(q: Q, workspaceId: string, actorId: string | null, action: string, subject: unknown) {
  await q.insert(auditLog).values({ workspaceId, actorId, action, subject });
}

export async function updateStep(db: DB, wsSlug: string, processSlug: string, stepKey: string, patch: StepPatch, actorId: string | null) {
  await db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const p = await processBySlug(tx, ws.id, processSlug);
    const step = await stepByKey(tx, p.id, stepKey);
    const draft = await draftOf(tx, ws.id, p.id);

    // Step definition: name, times, share of cases, fit, canvas position.
    const def: Partial<typeof steps.$inferInsert> = {};
    if (patch.name !== undefined) def.name = patch.name;
    if (patch.description !== undefined) def.description = patch.description;
    if (patch.minutesPerCase !== undefined) def.minutesPerCase = patch.minutesPerCase;
    if (patch.caseShare !== undefined) def.caseShare = patch.caseShare;
    if (patch.x !== undefined) def.posX = patch.x;
    if (patch.fit) {
      if (patch.fit.volume) def.fitVolume = patch.fit.volume;
      if (patch.fit.ruleBased) def.fitRuleBased = patch.fit.ruleBased;
      if (patch.fit.dataReady) def.fitDataReady = patch.fit.dataReady;
      if (patch.fit.errorRisk) def.fitErrorRisk = patch.fit.errorRisk;
    }
    if (Object.keys(def).length) {
      await tx.update(steps).set(def).where(eq(steps.id, step.id));
      // Moving a step on the canvas is too frequent to be worth logging; everything else is.
      const logged = Object.keys(def).filter((k) => k !== "posX");
      if (logged.length) await audit(tx, ws.id, actorId, "step.edited", { process: processSlug, step: stepKey, changes: Object.fromEntries(logged.map((k) => [k, (def as Record<string, unknown>)[k]])) });
    }

    // Autonomy in the draft design.
    if (patch.autonomy !== undefined || patch.isSystem !== undefined) {
      const [cur] = await tx.select().from(designSteps).where(and(eq(designSteps.designId, draft.id), eq(designSteps.stepId, step.id)));
      const autonomy = patch.autonomy ?? ((cur?.autonomy ?? 0) as AutonomyLevel);
      // Only L4 steps can run as rule-based systems.
      const isSystem = autonomy >= 4 ? (patch.isSystem ?? cur?.isSystem ?? false) : false;
      await tx.insert(designSteps).values({ designId: draft.id, stepId: step.id, autonomy, isSystem })
        .onConflictDoUpdate({ target: [designSteps.designId, designSteps.stepId], set: { autonomy, isSystem } });
      await audit(tx, ws.id, actorId, "design.step_changed", { process: processSlug, step: stepKey, from: cur ? { autonomy: cur.autonomy, isSystem: cur.isSystem } : null, to: { autonomy, isSystem } });
    }
    await tx.update(designs).set({ updatedAt: new Date() }).where(eq(designs.id, draft.id));
  });
}

export async function updateAssumptions(db: DB, wsSlug: string, processSlug: string, patch: AssumptionsPatch, actorId: string | null) {
  await db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const p = await processBySlug(tx, ws.id, processSlug);
    const draft = await draftOf(tx, ws.id, p.id);
    const next: Assumptions = { ...draft.assumptions, ...patch };
    await tx.update(designs).set({ assumptions: next, updatedAt: new Date() }).where(eq(designs.id, draft.id));
    await audit(tx, ws.id, actorId, "design.assumptions_changed", { process: processSlug, patch });
  });
}

async function stepByKey(q: Q, processId: string, key: string) {
  const [step] = await q.select().from(steps).where(and(eq(steps.processId, processId), eq(steps.key, key), isNull(steps.archivedAt)));
  if (!step) throw new NotFoundError(`Step ${key} not found`);
  return step;
}

const slugify = (name: string) =>
  name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "step";

const DEFAULT_FIT: FitFactors = { volume: "medium", ruleBased: "medium", dataReady: "medium", errorRisk: "medium" };

/** Adds a step. In the to-be view it is new in the redesign; in the as-is view it exists in both. Returns its key. */
export async function addStep(db: DB, wsSlug: string, processSlug: string, input: NewStep, actorId: string | null): Promise<string> {
  return db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const p = await processBySlug(tx, ws.id, processSlug);
    const draft = await draftOf(tx, ws.id, p.id);
    const existing = await tx.select({ key: steps.key, position: steps.position, posX: steps.posX }).from(steps).where(eq(steps.processId, p.id));
    const taken = new Set(existing.map((s) => s.key));
    const base = slugify(input.name);
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
    const position = existing.reduce((m, s) => Math.max(m, s.position), -1) + 1;
    const x = input.x ?? existing.reduce((m, s) => Math.max(m, s.posX), -220) + 220;
    const phase: StepPhase = input.view === "to-be" ? "to-be" : "both";
    const fit = { ...DEFAULT_FIT, ...input.fit };
    const [row] = await tx.insert(steps).values({
      workspaceId: ws.id, processId: p.id, key, name: input.name, description: input.description ?? "", position, posX: x,
      minutesPerCase: input.minutesPerCase ?? 1, caseShare: input.caseShare ?? 100, phase,
      fitVolume: fit.volume, fitRuleBased: fit.ruleBased, fitDataReady: fit.dataReady, fitErrorRisk: fit.errorRisk,
    }).returning();
    const autonomy = input.autonomy ?? 0;
    await tx.insert(designSteps).values({ designId: draft.id, stepId: row.id, autonomy, isSystem: autonomy >= 4 && !!input.isSystem });
    await audit(tx, ws.id, actorId, "step.added", { process: processSlug, step: key, name: input.name, phase });
    return key;
  });
}

/**
 * Removes a step from one view of the process.
 * To-be view: a step in both versions becomes "removed in the redesign"; a new step is deleted.
 * As-is view: a step in both versions becomes "new in the redesign"; a step only in today's process is deleted.
 * Deleted steps are archived, so baselines and uploaded figures that use them still resolve.
 */
export async function removeStep(db: DB, wsSlug: string, processSlug: string, stepKey: string, view: "as-is" | "to-be", actorId: string | null) {
  await db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const p = await processBySlug(tx, ws.id, processSlug);
    const step = await stepByKey(tx, p.id, stepKey);
    let result: "archived" | StepPhase;
    if (step.phase === "both") result = view === "to-be" ? "as-is" : "to-be";
    else if (step.phase === view) result = "archived";
    else throw new ConflictError(`${step.name} isn't in the ${view} process`);
    if (result === "archived") await tx.update(steps).set({ archivedAt: new Date() }).where(eq(steps.id, step.id));
    else await tx.update(steps).set({ phase: result }).where(eq(steps.id, step.id));
    await audit(tx, ws.id, actorId, "step.removed", { process: processSlug, step: stepKey, name: step.name, view, result });
  });
}

/** Puts a step removed in the redesign back into the to-be process. */
export async function restoreStep(db: DB, wsSlug: string, processSlug: string, stepKey: string, actorId: string | null) {
  await db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const p = await processBySlug(tx, ws.id, processSlug);
    const step = await stepByKey(tx, p.id, stepKey);
    if (step.phase !== "as-is") throw new ConflictError(`${step.name} is already in the redesign`);
    await tx.update(steps).set({ phase: "both" }).where(eq(steps.id, step.id));
    await audit(tx, ws.id, actorId, "step.restored", { process: processSlug, step: stepKey, name: step.name });
  });
}

export async function addEdge(db: DB, wsSlug: string, processSlug: string, fromKey: string, toKey: string, actorId: string | null) {
  if (fromKey === toKey) throw new ConflictError("An arrow needs two different steps");
  await db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const p = await processBySlug(tx, ws.id, processSlug);
    const from = await stepByKey(tx, p.id, fromKey);
    const to = await stepByKey(tx, p.id, toKey);
    await tx.insert(processEdges).values({ workspaceId: ws.id, processId: p.id, fromStepId: from.id, toStepId: to.id }).onConflictDoNothing();
    await audit(tx, ws.id, actorId, "edge.added", { process: processSlug, from: fromKey, to: toKey });
  });
}

export async function removeEdge(db: DB, wsSlug: string, processSlug: string, edgeId: string, actorId: string | null) {
  await db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const p = await processBySlug(tx, ws.id, processSlug);
    const removed = await tx.delete(processEdges).where(and(eq(processEdges.workspaceId, ws.id), eq(processEdges.processId, p.id), eq(processEdges.id, edgeId))).returning();
    if (!removed.length) throw new NotFoundError("Arrow not found");
    await audit(tx, ws.id, actorId, "edge.removed", { process: processSlug });
  });
}

/** Snapshot the draft as an approved design and record a baseline with a server-computed value case. */
export async function approveBaseline(db: DB, wsSlug: string, processSlug: string, actorId: string) {
  return db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const p = await processBySlug(tx, ws.id, processSlug);
    const draft = await draftOf(tx, ws.id, p.id);
    const stepRows = activeSteps(await tx.select().from(steps).where(eq(steps.processId, p.id)));
    if (!stepRows.length) throw new ConflictError("Process has no steps to value");
    const design = await designLevels(tx, draft.id, stepRows);
    const defs: StepDefinition[] = stepRows.map(toStepDef);
    const value = computeValueCase(defs, design, draft.assumptions);

    const [{ v }] = await tx.select({ v: max(designs.version) }).from(designs).where(eq(designs.processId, p.id));
    const [approved] = await tx.insert(designs).values({
      workspaceId: ws.id, processId: p.id, version: (v ?? 0) + 1, status: "approved", assumptions: draft.assumptions, stepsSnapshot: defs, createdBy: actorId,
    }).returning();
    const draftSteps = await tx.select().from(designSteps).where(eq(designSteps.designId, draft.id));
    if (draftSteps.length) await tx.insert(designSteps).values(draftSteps.map((r) => ({ ...r, designId: approved.id })));
    const [baseline] = await tx.insert(baselines).values({
      workspaceId: ws.id, processId: p.id, designId: approved.id, netValueSek: value.net, lowSek: value.low, highSek: value.high, approvedBy: actorId,
    }).returning();
    await audit(tx, ws.id, actorId, "baseline.approved", { process: processSlug, baselineId: baseline.id, net: value.net, designVersion: approved.version });
    return baseline;
  });
}

/* ---------- actuals ---------- */

/** Stores validated actuals. Re-uploading a month replaces its values; other months are kept. */
export async function importActuals(db: DB, wsSlug: string, processSlug: string, rows: ActualPoint[], actorId: string, source = "csv") {
  return db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const p = await processBySlug(tx, ws.id, processSlug);
    const stepRows = await tx.select().from(steps).where(eq(steps.processId, p.id));
    const idOf = new Map(stepRows.map((s) => [s.key, s.id]));
    const values = rows.map((r) => {
      const stepId = r.step ? idOf.get(r.step) : null;
      if (r.step && !stepId) throw new NotFoundError(`Step ${r.step} not found`);
      return { workspaceId: ws.id, processId: p.id, stepId: stepId ?? null, metric: r.metric, periodStart: r.period, value: r.value, source, importedBy: actorId };
    });
    for (let i = 0; i < values.length; i += 500) {
      await tx.insert(actuals).values(values.slice(i, i + 500)).onConflictDoUpdate({
        target: [actuals.processId, actuals.stepId, actuals.metric, actuals.periodStart, actuals.source],
        set: { value: sql`excluded.value`, importedBy: actorId, importedAt: new Date() },
      });
    }
    const months = [...new Set(rows.map((r) => r.period.slice(0, 7)))].sort();
    await audit(tx, ws.id, actorId, "actuals.imported", { process: processSlug, rows: rows.length, months, source });
    return { rows: rows.length, months };
  });
}

/** Removes all uploaded (CSV) actuals for a process. */
export async function clearActuals(db: DB, wsSlug: string, processSlug: string, actorId: string) {
  await db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const p = await processBySlug(tx, ws.id, processSlug);
    const removed = await tx.delete(actuals).where(and(eq(actuals.workspaceId, ws.id), eq(actuals.processId, p.id), eq(actuals.source, "csv"))).returning({ id: actuals.id });
    await audit(tx, ws.id, actorId, "actuals.cleared", { process: processSlug, rows: removed.length });
  });
}

/* ---------- history ---------- */

export interface BaselineRecord { id: string; process: string; processName: string; approvedAt: string; approvedBy: string; net: number; low: number; high: number; designVersion: number }
export interface ActivityRecord { id: number; at: string; actor: string | null; action: string; subject: Record<string, unknown> }

export async function listBaselines(db: DB, wsSlug: string): Promise<BaselineRecord[]> {
  const ws = await workspaceBySlug(db, wsSlug);
  const rows = await db.select({ b: baselines, who: users.name, p: processes, v: designs.version })
    .from(baselines)
    .innerJoin(users, eq(users.id, baselines.approvedBy))
    .innerJoin(processes, eq(processes.id, baselines.processId))
    .innerJoin(designs, eq(designs.id, baselines.designId))
    .where(eq(baselines.workspaceId, ws.id))
    .orderBy(desc(baselines.approvedAt));
  return rows.map((r) => ({
    id: r.b.id, process: r.p.slug, processName: r.p.name, approvedAt: r.b.approvedAt.toISOString(), approvedBy: r.who,
    net: r.b.netValueSek, low: r.b.lowSek, high: r.b.highSek, designVersion: r.v,
  }));
}

export async function listActivity(db: DB, wsSlug: string, limit = 200): Promise<ActivityRecord[]> {
  const ws = await workspaceBySlug(db, wsSlug);
  const rows = await db.select({ a: auditLog, who: users.name })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId))
    .where(eq(auditLog.workspaceId, ws.id))
    .orderBy(desc(auditLog.at), desc(auditLog.id)).limit(limit);
  return rows.map((r) => ({ id: r.a.id, at: r.a.at.toISOString(), actor: r.who, action: r.a.action, subject: r.a.subject as Record<string, unknown> }));
}

/* ---------- example workspace ---------- */

export const EXAMPLE_WORKSPACE = "acme-support";
export const EXAMPLE_ADVISOR_EMAIL = "advisor@buildway.example";

/** Example people, one per role. They can only sign in through the developer sign-in. */
export const EXAMPLE_USERS = [
  { email: EXAMPLE_ADVISOR_EMAIL, name: "Buildway advisor", isBuildway: true, role: "advisor" },
  { email: "admin@acme.example", name: "Anna Admin (example)", isBuildway: false, role: "customer_admin" },
  { email: "owner@acme.example", name: "Olle Owner (example)", isBuildway: false, role: "process_owner" },
  { email: "viewer@acme.example", name: "Vera Viewer (example)", isBuildway: false, role: "viewer" },
] as const;

/** The example Buildway advisor's user id (creates the user if needed). */
export async function ensureAdvisor(db: DB): Promise<string> {
  const [u] = await db.insert(users).values({ email: EXAMPLE_ADVISOR_EMAIL, name: "Buildway advisor", isBuildway: true })
    .onConflictDoUpdate({ target: users.email, set: { name: "Buildway advisor" } }).returning();
  return u.id;
}

/** Create the example workspace if it doesn't exist. Returns true if it was created. */
export async function seedExample(db: DB): Promise<boolean> {
  const advisorId = await ensureAdvisor(db);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(workspaces).where(eq(workspaces.slug, EXAMPLE_WORKSPACE));
    if (existing) return false;
    const [ws] = await tx.insert(workspaces).values({ slug: EXAMPLE_WORKSPACE, name: "Acme Support", isExample: true }).returning();
    for (const eu of EXAMPLE_USERS) {
      const [u] = await tx.insert(users).values({ email: eu.email, name: eu.name, isBuildway: eu.isBuildway })
        .onConflictDoUpdate({ target: users.email, set: { name: eu.name } }).returning();
      await tx.insert(memberships).values({ workspaceId: ws.id, userId: u.id, role: eu.role }).onConflictDoNothing();
    }

    const tpl = customerService;
    const [cs] = await tx.insert(processes).values({
      workspaceId: ws.id, slug: "customer-service", name: tpl.name, templateId: tpl.id, templateVersion: tpl.version, unit: tpl.unit,
      stage: "run", gate: "green", note: "Live, month 9 of 12", position: 0,
    }).returning();
    const stepRows = await tx.insert(steps).values(tpl.steps.map((s, i) => ({
      workspaceId: ws.id, processId: cs.id, key: s.id, name: s.name, description: s.description, position: i, minutesPerCase: s.minutesPerCase,
      caseShare: s.caseShare ?? 100, posX: i * 220,
      fitVolume: s.fit.volume, fitRuleBased: s.fit.ruleBased, fitDataReady: s.fit.dataReady, fitErrorRisk: s.fit.errorRisk,
    }))).returning();
    const [draft] = await tx.insert(designs).values({ workspaceId: ws.id, processId: cs.id, version: 1, status: "draft", assumptions: tpl.defaultAssumptions, createdBy: advisorId }).returning();
    await tx.insert(designSteps).values(stepRows.map((s) => ({
      designId: draft.id, stepId: s.id, autonomy: tpl.defaultDesign.levels[s.key] ?? 0, isSystem: tpl.defaultDesign.systemSteps.includes(s.key),
    })));
    const ordered = [...stepRows].sort((a, b) => a.position - b.position);
    await tx.insert(processEdges).values(ordered.slice(1).map((s, i) => ({ workspaceId: ws.id, processId: cs.id, fromStepId: ordered[i].id, toStepId: s.id })));

    const others: Array<[string, string, Stage, "red" | "amber" | "green", string]> = [
      ["it-service-desk", "IT service desk", "build", "amber", "Gate: data readiness"],
      ["invoice-handling", "Invoice handling", "find", "amber", "Next: redesign workshop"],
      ["hr-onboarding", "HR onboarding", "not-started", "red", "Owner not assigned"],
    ];
    await tx.insert(processes).values(others.map(([slug, name, stage, gate, note], i) => ({
      workspaceId: ws.id, slug, name, stage: fromStage(stage), gate, note, position: i + 1,
    })));
    return true;
  });
}

/** Delete and recreate the example workspace. Refuses for real customer workspaces. */
export async function resetExample(db: DB, wsSlug: string) {
  const ws = await workspaceBySlug(db, wsSlug);
  if (!ws.isExample) throw new ConflictError("Only example workspaces can be reset");
  await db.transaction(async (tx) => {
    // Baselines reference designs without cascade; remove them first.
    await tx.delete(baselines).where(eq(baselines.workspaceId, ws.id));
    await tx.delete(workspaces).where(eq(workspaces.id, ws.id));
  });
  await seedExample(db);
}
