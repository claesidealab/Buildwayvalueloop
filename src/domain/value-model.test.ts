import { describe, expect, it } from "vitest";
import { computeValueCase } from "./value-model";
import { fitScore, suggestedLevel } from "./fit";
import { laneOf, levelForLane } from "./autonomy";
import { orderedSteps } from "./value-model";
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
    // Saved minutes per contact: 0.9 + 1.35 + 0.9 + 1.4 + 2.8 + 1.5×0.2×0.45 + 0.7 + 1×0.15×0.45 = 8.2525
    expect(v.hoursReleased).toBeCloseTo((120_000 * 8.2525) / 60, 6);
    expect(v.labourBenefit).toBeCloseTo(v.hoursReleased * 420, 4);
    // 5 agent-led steps at 100% + assisted escalate (0.5 × 20%) + assisted review (0.5 × 15%) = 5.175 units
    expect(v.aiCost).toBeCloseTo(120_000 * 5.175 * 0.35, 6);
    expect(v.stepsDoneByPeople).toBe(2);
    // Today: 10.5 minutes on every contact + 1.5 × 20% + 1 × 15% = 10.95 minutes
    expect(v.asIsHours).toBeCloseTo((120_000 * 10.95) / 60, 6);
    expect(v.net).toBeCloseTo(v.labourBenefit * 0.85 - v.aiCost - 300_000, 6);
    expect(v.low).toBeLessThan(v.net);
    expect(v.high).toBeGreaterThan(v.net);
  });

  it("counts a step removed in the redesign as fully saved", () => {
    const steps = cs.steps.map((s) => (s.id === "identify" ? { ...s, phase: "as-is" as const } : s));
    const v = computeValueCase(steps, allManual, cs.defaultAssumptions);
    const identify = v.steps.find((s) => s.step.id === "identify")!;
    expect(identify.status).toBe("removed");
    expect(v.hoursReleased).toBeCloseTo((120_000 * 1.0) / 60, 6);
  });

  it("counts a new manual step as extra work", () => {
    const extra = { id: "callback", name: "Call back", description: "", minutesPerCase: 3, caseShare: 50, phase: "to-be" as const, fit: cs.steps[0].fit };
    const v = computeValueCase([...cs.steps, extra], allManual, cs.defaultAssumptions);
    expect(v.steps.find((s) => s.step.id === "callback")!.status).toBe("added");
    expect(v.hoursReleased).toBeCloseTo(-(120_000 * 1.5) / 60, 6);
    expect(v.oversightCost).toBe(0);
    expect(v.asIsHours).toBeCloseTo((120_000 * 10.95) / 60, 6);
  });

  it("weights steps by the share of cases that pass through them", () => {
    const one = [{ ...cs.steps[0], caseShare: 25 }];
    const v = computeValueCase(one, { levels: { intake: 4 }, systemSteps: [] }, cs.defaultAssumptions);
    expect(v.hoursReleased).toBeCloseTo((120_000 * 1.0 * 0.25 * 0.9) / 60, 6);
    expect(v.aiCost).toBeCloseTo(120_000 * 0.25 * 0.35, 6);
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

describe("levelForLane", () => {
  it("maps a drop on the canvas to an autonomy level", () => {
    expect(levelForLane("agent", 1)).toEqual({ level: 3, isSystem: false });
    expect(levelForLane("agent", 4)).toEqual({ level: 4, isSystem: false });
    expect(levelForLane("human", 4)).toEqual({ level: 2, isSystem: false });
    expect(levelForLane("human", 1)).toEqual({ level: 1, isSystem: false });
    expect(levelForLane("system", 0)).toEqual({ level: 4, isSystem: true });
  });
});

describe("orderedSteps", () => {
  it("orders by canvas position", () => {
    const [a, b] = cs.steps;
    expect(orderedSteps([{ ...a, x: 500 }, { ...b, x: 100 }]).map((s) => s.id)).toEqual(["triage", "intake"]);
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
