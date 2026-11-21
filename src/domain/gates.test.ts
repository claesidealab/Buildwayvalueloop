import { describe, expect, it } from "vitest";
import { evaluateGate, type GateProcessData } from "./gates";
import type { ActualPoint } from "./actuals";
import type { Assumptions } from "./types";

const plan = { startYear: 2027 };
const a: Assumptions = { casesPerMonth: 1000, costPerHour: 100, agentQuality: 80, oversightShare: 0, aiCostPerStepCase: 0, fixedCostPerYear: 0 };
const pt = (period: string, metric: string, value: number): ActualPoint => ({ period, metric, step: null, value });

// 1 200 000 a year → 100 000 a month at full value; each 1000 hours released realise 100 000.
const data = (actuals: ActualPoint[], entry: GateProcessData["entry"] = null): GateProcessData => ({ actuals, net: 1_200_000, aiCost: 0, assumptions: a, entry });

describe("evaluateGate", () => {
  it("is null for a gate without a measure", () => {
    expect(evaluateGate(plan, { period: "2027-H2" }, data([]))).toBeNull();
  });

  it("checks value against a flat plan", () => {
    const g = { period: "2027-H2" as const, check: { processId: "p", metric: "value_vs_plan", op: "gte" as const, target: 80 } };
    const r = evaluateGate(plan, g, data([pt("2027-07-01", "hours_released", 900), pt("2027-08-01", "hours_released", 700)]));
    expect(r?.measured).toBeCloseTo(80, 6);
    expect(r?.suggestion).toBe("met");
  });

  it("measures against the scenario ramp, not a flat line", () => {
    const g = { period: "2027-H2" as const, check: { processId: "p", metric: "value_vs_plan", op: "gte" as const, target: 90 } };
    // Go-live 2027-H2 with no ramp: plan is 100 000 a month from July.
    const r = evaluateGate(plan, g, data([pt("2027-07-01", "hours_released", 500)], { goLive: "2027-H2", rampMonths: 0 }));
    expect(r?.measured).toBeCloseTo(50, 6);
    expect(r?.suggestion).toBe("missed");
  });

  it("reads a KPI in the last month of the half-year that has it", () => {
    const g = { period: "2027-H2" as const, check: { processId: "p", metric: "handled_without_human", op: "gte" as const, target: 40 } };
    const r = evaluateGate(plan, g, data([pt("2027-11-01", "handled_without_human", 35), pt("2027-12-01", "handled_without_human", 44), pt("2028-01-01", "handled_without_human", 10)]));
    expect(r?.measured).toBe(44);
    expect(r?.suggestion).toBe("met");
  });

  it("supports at-most targets", () => {
    const g = { period: "2027-H2" as const, check: { processId: "p", metric: "cost_per_case", op: "lte" as const, target: 50 } };
    expect(evaluateGate(plan, g, data([pt("2027-09-01", "cost_per_case", 55)]))?.suggestion).toBe("missed");
  });

  it("says no data when nothing is uploaded for the half-year or the process is gone", () => {
    const g = { period: "2028-H1" as const, check: { processId: "p", metric: "value_vs_plan", op: "gte" as const, target: 80 } };
    expect(evaluateGate(plan, g, data([pt("2027-07-01", "hours_released", 900)]))?.suggestion).toBe("no-data");
    expect(evaluateGate(plan, g, null)?.suggestion).toBe("no-data");
  });
});
