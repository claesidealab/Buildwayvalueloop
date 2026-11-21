import { describe, expect, it } from "vitest";
import { computeValueCase } from "./value-model";
import { fitScore, suggestedLevel } from "./fit";
import { laneOf } from "./autonomy";
import { customerService as cs } from "@/templates/customer-service";
import type { ProcessDesign } from "./types";

const allManual: ProcessDesign = { levels: Object.fromEntries(cs.steps.map((s) => [s.id, 0])) as ProcessDesign["levels"], systemSteps: [] };

describe("computeValueCase", () => {
  it("releases no hours when every step is manual, and costs only the fixed cost", () => {
    const v = computeValueCase(cs.steps, allManual, cs.defaultAssumptions);
    expect(v.hoursReleased).toBe(0);
    expect(v.aiCost).toBe(0);
    expect(v.net).toBe(-cs.defaultAssumptions.fixedCostPerYear);
    expect(v.stepsDoneByPeople).toBe(8);
  });

  it("matches the hand calculation for the customer service default design", () => {
    const v = computeValueCase(cs.steps, cs.defaultDesign, cs.defaultAssumptions);
    // Σ minutes × share = 0.9 + 1.35 + 0.9 + 1.4 + 2.8 + 0.675 + 0.7 + 0.45 = 9.175
    expect(v.hoursReleased).toBeCloseTo((120_000 * 9.175) / 60, 6);
    expect(v.labourBenefit).toBeCloseTo(18_350 * 420, 4);
    // 5 agent-led steps (identify is a system) + 2 assisted steps × 0.5 = 6 units
    expect(v.aiCost).toBeCloseTo(120_000 * 6 * 0.35, 6);
    expect(v.stepsDoneByPeople).toBe(2);
    expect(v.net).toBeGreaterThan(5.5e6);
    expect(v.low).toBeLessThan(v.net);
    expect(v.high).toBeGreaterThan(v.net);
  });

  it("scales agent-led steps with agent quality but leaves systems and humans alone", () => {
    const base = computeValueCase(cs.steps, cs.defaultDesign, cs.defaultAssumptions);
    const better = computeValueCase(cs.steps, cs.defaultDesign, { ...cs.defaultAssumptions, agentQuality: 90 });
    const id = (v: typeof base, step: string) => v.steps.find((s) => s.step.id === step)!;
    expect(id(better, "resolve").automatedShare).toBeGreaterThan(id(base, "resolve").automatedShare);
    expect(id(better, "identify").automatedShare).toBe(id(base, "identify").automatedShare);
    expect(id(better, "escalate").automatedShare).toBe(id(base, "escalate").automatedShare);
  });

  it("caps the automated share", () => {
    const v = computeValueCase(cs.steps, cs.defaultDesign, { ...cs.defaultAssumptions, agentQuality: 200 });
    expect(Math.max(...v.steps.map((s) => s.automatedShare))).toBeLessThanOrEqual(0.98);
  });
});

describe("laneOf", () => {
  it("puts L0–L2 with people, L3–L4 with agents, and flagged L4 steps in systems", () => {
    expect(laneOf("x", 2, { systemSteps: [] })).toBe("human");
    expect(laneOf("x", 3, { systemSteps: ["x"] })).toBe("agent");
    expect(laneOf("x", 4, { systemSteps: ["x"] })).toBe("system");
  });
});

describe("fit", () => {
  it("scores an ideal step 100 and suggests L4", () => {
    const f = { volume: "high", ruleBased: "high", dataReady: "high", errorRisk: "low" } as const;
    expect(fitScore(f)).toBe(100);
    expect(suggestedLevel(f)).toBe(4);
  });

  it("caps high-risk steps at L2", () => {
    expect(suggestedLevel({ volume: "high", ruleBased: "high", dataReady: "high", errorRisk: "high" })).toBe(2);
  });
});
