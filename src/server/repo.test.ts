import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "./db";
import { createTestDb } from "./test-db";
import { auditLog, designSteps, workspaces } from "./db/schema";
import { addEdge, addStep, removeEdge, removeStep, restoreStep, approveBaseline, clearActuals, importActuals, listActivity, listBaselines, ConflictError, ensureAdvisor, EXAMPLE_WORKSPACE as WS, getWorkspaceState, NotFoundError, resetExample, seedExample, updateAssumptions, updateStep } from "./repo";
import { computeValueCase } from "@/domain/value-model";
import { customerService } from "@/templates";

let db: DB;
let advisor: string;

beforeEach(async () => {
  db = await createTestDb();
  await seedExample(db);
  advisor = await ensureAdvisor(db);
});

const cs = async () => (await getWorkspaceState(db, WS)).processes.find((p) => p.id === "customer-service")!;

describe("seed", () => {
  it("creates the example workspace once, with the template's steps and default design", async () => {
    expect(await seedExample(db)).toBe(false);
    const state = await getWorkspaceState(db, WS);
    expect(state.workspace).toEqual({ id: WS, name: "Acme Support", isExample: true });
    expect(state.processes.map((p) => p.id)).toEqual(["customer-service", "it-service-desk", "invoice-handling", "hr-onboarding"]);
    const p = await cs();
    expect(p.steps.map((s) => s.id)).toEqual(customerService.steps.map((s) => s.id));
    expect(p.design).toEqual({ levels: customerService.defaultDesign.levels, systemSteps: ["identify"] });
    expect(p.baseline).toBeNull();
  });
});

describe("updateStep", () => {
  it("persists an autonomy change and writes an audit entry", async () => {
    await updateStep(db, WS, "customer-service", "resolve", { autonomy: 1 }, advisor);
    expect((await cs()).design.levels.resolve).toBe(1);
    const log = await db.select().from(auditLog);
    expect(log.some((e) => e.action === "design.step_changed")).toBe(true);
  });

  it("clears the system flag when a step drops below L4", async () => {
    await updateStep(db, WS, "customer-service", "identify", { autonomy: 3 }, advisor);
    expect((await cs()).design.systemSteps).not.toContain("identify");
  });

  it("ignores a system flag on steps below L4", async () => {
    await updateStep(db, WS, "customer-service", "resolve", { isSystem: true }, advisor);
    expect((await cs()).design.systemSteps).not.toContain("resolve");
  });

  it("rejects unknown processes and steps", async () => {
    await expect(updateStep(db, WS, "nope", "resolve", { autonomy: 1 }, advisor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateStep(db, WS, "customer-service", "nope", { autonomy: 1 }, advisor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateStep(db, "other-ws", "customer-service", "resolve", { autonomy: 1 }, advisor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses autonomy outside 0–4 at the database level", async () => {
    await expect(updateStep(db, WS, "customer-service", "resolve", { autonomy: 7 as never }, advisor)).rejects.toThrow();
    expect(await db.select().from(designSteps)).toHaveLength(8);
  });
});

describe("assumptions and baselines", () => {
  it("merges assumption changes into the draft", async () => {
    await updateAssumptions(db, WS, "customer-service", { casesPerMonth: 20000 }, advisor);
    const p = await cs();
    expect(p.assumptions.casesPerMonth).toBe(20000);
    expect(p.assumptions.costPerHour).toBe(customerService.defaultAssumptions.costPerHour);
  });

  it("approves a baseline with a server-computed value and keeps it when the draft changes", async () => {
    const before = await cs();
    const expected = computeValueCase(before.steps, before.design, before.assumptions).net;
    const b = await approveBaseline(db, WS, "customer-service", advisor);
    expect(b.netValueSek).toBeCloseTo(expected, 6);

    await updateStep(db, WS, "customer-service", "resolve", { autonomy: 0 }, advisor);
    const after = await cs();
    expect(after.design.levels.resolve).toBe(0);
    expect(after.baseline?.design.levels.resolve).toBe(3);
    expect(after.baseline?.net).toBeCloseTo(expected, 6);
    expect(after.baseline?.approvedBy).toBe("Buildway advisor");
  });

  it("refuses to value a process that has not been mapped", async () => {
    await expect(approveBaseline(db, WS, "hr-onboarding", advisor)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("resetExample", () => {
  it("restores the example workspace, baselines included", async () => {
    await updateStep(db, WS, "customer-service", "resolve", { autonomy: 0 }, advisor);
    await approveBaseline(db, WS, "customer-service", advisor);
    await resetExample(db, WS);
    const p = await cs();
    expect(p.design.levels.resolve).toBe(3);
    expect(p.baseline).toBeNull();
  });

  it("refuses to reset a real workspace", async () => {
    await db.update(workspaces).set({ isExample: false });
    await expect(resetExample(db, WS)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("actuals", () => {
  const jan = [
    { period: "2026-01-01", metric: "hours_released", step: null, value: 1000 },
    { period: "2026-01-01", metric: "success_rate", step: "resolve", value: 70 },
  ];

  it("stores actuals and returns them with the process, step keys included", async () => {
    await importActuals(db, WS, "customer-service", jan, advisor);
    const p = await cs();
    expect(p.actuals).toEqual(expect.arrayContaining(jan));
    expect(p.actuals).toHaveLength(2);
  });

  it("replaces a month's value on re-upload and keeps other months", async () => {
    await importActuals(db, WS, "customer-service", jan, advisor);
    await importActuals(db, WS, "customer-service", [
      { period: "2026-01-01", metric: "hours_released", step: null, value: 1200 },
      { period: "2026-02-01", metric: "hours_released", step: null, value: 1300 },
    ], advisor);
    const hours = (await cs()).actuals.filter((a) => a.metric === "hours_released").map((a) => [a.period, a.value]);
    expect(hours).toEqual([["2026-01-01", 1200], ["2026-02-01", 1300]]);
    expect((await cs()).actuals.find((a) => a.metric === "success_rate")?.value).toBe(70);
  });

  it("rejects unknown steps and clears uploaded data", async () => {
    await expect(importActuals(db, WS, "customer-service", [{ period: "2026-01-01", metric: "success_rate", step: "nope", value: 1 }], advisor)).rejects.toBeInstanceOf(NotFoundError);
    await importActuals(db, WS, "customer-service", jan, advisor);
    await clearActuals(db, WS, "customer-service", advisor);
    expect((await cs()).actuals).toEqual([]);
  });
});

describe("history", () => {
  it("lists baselines newest first and the activity log", async () => {
    await approveBaseline(db, WS, "customer-service", advisor);
    await updateStep(db, WS, "customer-service", "resolve", { autonomy: 1 }, advisor);
    await approveBaseline(db, WS, "customer-service", advisor);
    const bs = await listBaselines(db, WS);
    expect(bs).toHaveLength(2);
    expect(bs[0].designVersion).toBeGreaterThan(bs[1].designVersion);
    expect(bs[0].net).toBeLessThan(bs[1].net);
    expect(bs[0].approvedBy).toBe("Buildway advisor");
    const acts = await listActivity(db, WS);
    expect(acts.map((a) => a.action)).toEqual(["baseline.approved", "design.step_changed", "baseline.approved"]);
    expect(acts[1].actor).toBe("Buildway advisor");
  });
});

describe("editing the process map", () => {
  it("seeds positions and arrows in order", async () => {
    const p = await cs();
    expect(p.steps.map((s) => s.x)).toEqual([0, 220, 440, 660, 880, 1100, 1320, 1540]);
    expect(p.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["intake>triage", "triage>identify", "identify>knowledge", "knowledge>resolve", "resolve>escalate", "escalate>close", "close>review"]);
    expect(p.steps.find((s) => s.id === "escalate")?.caseShare).toBe(20);
  });

  it("edits a step's definition and position", async () => {
    await updateStep(db, WS, "customer-service", "resolve", { name: "Solve", minutesPerCase: 5, caseShare: 80, x: 900, fit: { errorRisk: "low" } }, advisor);
    const r = (await cs()).steps.find((s) => s.id === "resolve")!;
    expect(r).toMatchObject({ name: "Solve", minutesPerCase: 5, caseShare: 80, x: 900 });
    expect(r.fit.errorRisk).toBe("low");
    expect(r.fit.volume).toBe("high");
  });

  it("refuses an out-of-range case share at the database level", async () => {
    await expect(updateStep(db, WS, "customer-service", "resolve", { caseShare: 150 }, advisor)).rejects.toThrow();
  });

  it("adds a step with a unique key; new in the redesign when added in the to-be view", async () => {
    const k1 = await addStep(db, WS, "customer-service", { name: "Call back", view: "to-be", autonomy: 3 }, advisor);
    const k2 = await addStep(db, WS, "customer-service", { name: "Call back", view: "as-is" }, advisor);
    expect([k1, k2]).toEqual(["call-back", "call-back-2"]);
    const p = await cs();
    expect(p.steps.find((s) => s.id === k1)).toMatchObject({ phase: "to-be", x: 1760 });
    expect(p.steps.find((s) => s.id === k2)?.phase).toBe("both");
    expect(p.design.levels[k1]).toBe(3);
  });

  it("removes a step from the redesign, restores it, and archives steps that are in no version", async () => {
    await removeStep(db, WS, "customer-service", "identify", "to-be", advisor);
    expect((await cs()).steps.find((s) => s.id === "identify")?.phase).toBe("as-is");
    await restoreStep(db, WS, "customer-service", "identify", advisor);
    expect((await cs()).steps.find((s) => s.id === "identify")?.phase).toBe("both");

    const key = await addStep(db, WS, "customer-service", { name: "Temp", view: "to-be" }, advisor);
    await removeStep(db, WS, "customer-service", key, "to-be", advisor);
    const p = await cs();
    expect(p.steps.some((s) => s.id === key)).toBe(false);
    await expect(updateStep(db, WS, "customer-service", key, { name: "x" }, advisor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("hides arrows to archived steps and adds and removes arrows", async () => {
    await addEdge(db, WS, "customer-service", "resolve", "close", advisor);
    let p = await cs();
    expect(p.edges.some((e) => e.from === "resolve" && e.to === "close")).toBe(true);
    await expect(addEdge(db, WS, "customer-service", "resolve", "resolve", advisor)).rejects.toBeInstanceOf(ConflictError);
    await removeEdge(db, WS, "customer-service", p.edges.find((e) => e.from === "resolve" && e.to === "close")!.id, advisor);
    const key = await addStep(db, WS, "customer-service", { name: "Temp", view: "to-be" }, advisor);
    await addEdge(db, WS, "customer-service", "close", key, advisor);
    await removeStep(db, WS, "customer-service", key, "to-be", advisor);
    p = await cs();
    expect(p.edges.some((e) => e.to === key)).toBe(false);
  });

  it("keeps a baseline's steps frozen when the map changes later", async () => {
    const before = await cs();
    const net = computeValueCase(before.steps, before.design, before.assumptions).net;
    await approveBaseline(db, WS, "customer-service", advisor);
    await updateStep(db, WS, "customer-service", "resolve", { minutesPerCase: 10 }, advisor);
    await removeStep(db, WS, "customer-service", "identify", "to-be", advisor);
    const after = await cs();
    expect(after.baseline!.steps.find((s) => s.id === "resolve")?.minutesPerCase).toBe(4);
    expect(after.baseline!.steps.find((s) => s.id === "identify")?.phase).toBe("both");
    expect(computeValueCase(after.baseline!.steps, after.baseline!.design, after.baseline!.assumptions).net).toBeCloseTo(net, 6);
  });
});
