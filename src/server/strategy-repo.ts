/**
 * Strategy plans: one versioned document per workspace (flows, scenarios, gates, ambition),
 * plus an append-only list of decisions recorded in leadership sessions.
 * Saves use optimistic concurrency: the caller sends the version it edited, and a newer
 * version on the server is a conflict, not a silent overwrite.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "./db";
import { auditLog, designs, processes, strategyPlans, users } from "./db/schema";
import { ConflictError, NotFoundError, workspaceBySlug, type Q } from "./repo";
import { emptyPlan, type StrategyDecision, type StrategyPlan } from "@/domain/strategy";
import { examplePlan } from "@/templates/strategy-example";
import { customerService } from "@/templates";

export interface StoredPlan { plan: StrategyPlan; version: number; updatedAt: string }

async function audit(q: Q, workspaceId: string, actorId: string | null, action: string, subject: unknown) {
  await q.insert(auditLog).values({ workspaceId, actorId, action, subject });
}

/** The workspace's plan. Example workspaces start from the example plan; others from an empty one. */
export async function getStrategy(db: DB, wsSlug: string): Promise<StoredPlan> {
  const ws = await workspaceBySlug(db, wsSlug);
  const [row] = await db.select().from(strategyPlans).where(eq(strategyPlans.workspaceId, ws.id));
  if (row) return { plan: row.data, version: row.version, updatedAt: row.updatedAt.toISOString() };
  const plan = ws.isExample ? examplePlan() : emptyPlan(new Date().getUTCFullYear() + 1);
  const [created] = await db.insert(strategyPlans).values({ workspaceId: ws.id, data: plan }).onConflictDoNothing().returning();
  if (created) return { plan: created.data, version: created.version, updatedAt: created.updatedAt.toISOString() };
  return getStrategy(db, wsSlug);
}

/** Saves an edited plan. Decisions can't be changed this way; they are kept from the stored plan. */
export async function saveStrategy(db: DB, wsSlug: string, plan: StrategyPlan, baseVersion: number, actorId: string): Promise<StoredPlan> {
  await getStrategy(db, wsSlug); // make sure a row exists
  return db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const [row] = await tx.select().from(strategyPlans).where(eq(strategyPlans.workspaceId, ws.id)).for("update");
    if (row.version !== baseVersion) throw new ConflictError("Someone else changed the plan. Reload to see their changes.");
    const next: StrategyPlan = { ...plan, decisions: row.data.decisions, isExample: row.data.isExample };
    const [saved] = await tx.update(strategyPlans)
      .set({ data: next, version: row.version + 1, updatedAt: new Date(), updatedBy: actorId })
      .where(eq(strategyPlans.workspaceId, ws.id)).returning();
    return { plan: saved.data, version: saved.version, updatedAt: saved.updatedAt.toISOString() };
  });
}

/** Records a decision taken in the room, with server time and the signed-in person's name. */
export async function recordDecision(db: DB, wsSlug: string, input: Pick<StrategyDecision, "kind" | "attendees" | "text">, actorId: string): Promise<StoredPlan> {
  await getStrategy(db, wsSlug);
  return db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const [row] = await tx.select().from(strategyPlans).where(eq(strategyPlans.workspaceId, ws.id)).for("update");
    const [who] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actorId));
    const decision: StrategyDecision = { id: randomUUID(), at: new Date().toISOString(), recordedBy: who?.name ?? "Unknown", ...input };
    const data: StrategyPlan = { ...row.data, decisions: [...row.data.decisions, decision] };
    const [saved] = await tx.update(strategyPlans).set({ data, version: row.version + 1, updatedAt: new Date(), updatedBy: actorId })
      .where(eq(strategyPlans.workspaceId, ws.id)).returning();
    await audit(tx, ws.id, actorId, "strategy.decision", { kind: input.kind, text: input.text });
    return { plan: saved.data, version: saved.version, updatedAt: saved.updatedAt.toISOString() };
  });
}

const slugify = (name: string) =>
  name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "process";

/** Creates an empty process for a flow so it can be mapped, and links the two. Returns the process id. */
export async function createProcessFromFlow(db: DB, wsSlug: string, flowId: string, actorId: string): Promise<{ processId: string; stored: StoredPlan }> {
  await getStrategy(db, wsSlug);
  return db.transaction(async (tx) => {
    const ws = await workspaceBySlug(tx, wsSlug);
    const [row] = await tx.select().from(strategyPlans).where(eq(strategyPlans.workspaceId, ws.id)).for("update");
    const flow = row.data.flows.find((f) => f.id === flowId);
    if (!flow) throw new NotFoundError("Flow not found");
    if (flow.processId) {
      const [existing] = await tx.select().from(processes).where(and(eq(processes.workspaceId, ws.id), eq(processes.slug, flow.processId)));
      if (existing) throw new ConflictError(`${flow.name} already has a process`);
    }
    const taken = new Set((await tx.select({ slug: processes.slug }).from(processes).where(eq(processes.workspaceId, ws.id))).map((p) => p.slug));
    const base = slugify(flow.name);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    const [p] = await tx.insert(processes).values({
      workspaceId: ws.id, slug, name: flow.name, unit: "case", stage: "find", gate: "amber", note: "Added from the strategy", position: taken.size,
    }).returning();
    // Generic starting assumptions; the team adjusts them in the value case.
    await tx.insert(designs).values({ workspaceId: ws.id, processId: p.id, version: 1, status: "draft", assumptions: { ...customerService.defaultAssumptions }, createdBy: actorId });
    const data: StrategyPlan = { ...row.data, flows: row.data.flows.map((f) => (f.id === flowId ? { ...f, processId: slug } : f)) };
    const [saved] = await tx.update(strategyPlans).set({ data, version: row.version + 1, updatedAt: new Date(), updatedBy: actorId })
      .where(eq(strategyPlans.workspaceId, ws.id)).returning();
    await audit(tx, ws.id, actorId, "strategy.process_created", { flow: flow.name, process: slug });
    return { processId: slug, stored: { plan: saved.data, version: saved.version, updatedAt: saved.updatedAt.toISOString() } };
  });
}
