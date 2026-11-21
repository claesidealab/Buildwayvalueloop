import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type DB } from "./db";
import { auditLog, designSteps, workspaces } from "./db/schema";
import { approveBaseline, ConflictError, ensureAdvisor, EXAMPLE_WORKSPACE as WS, getWorkspaceState, NotFoundError, resetExample, seedExample, updateAssumptions, updateStep } from "./repo";
import { computeValueCase } from "@/domain/value-model";
import { customerService } from "@/templates";

let db: DB;
let advisor: string;

beforeEach(async () => {
  db = await createDb({ memory: true });
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
