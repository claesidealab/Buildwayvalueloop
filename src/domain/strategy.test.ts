import { describe, expect, it } from "vitest";
import { computeScenario, flowPriority, halfYears, monthOf, suggestedDecision, type Scenario } from "./strategy";
import { examplePlan } from "@/templates/strategy-example";

const plan = { startYear: 2027, years: 3, ownTimeRate: 1_000_000 };
const M = 1_000_000;

const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: "s", name: "S", summary: "", assumptions: [], gates: [],
  flows: [{ flowId: "f", goLive: "2027-H1", rampMonths: 0, runRate: 12 * M }],
  costs: [], ...over,
});

describe("time", () => {
  it("lists half-years and months from the plan start", () => {
    expect(halfYears(plan)).toEqual(["2027-H1", "2027-H2", "2028-H1", "2028-H2", "2029-H1", "2029-H2"]);
    expect(monthOf(plan, "2028-H2")).toBe(18);
  });
});

describe("computeScenario", () => {
  it("realises full value from go-live without a ramp", () => {
    const r = computeScenario(plan, scenario());
    expect(r.years.map((y) => y.valueRealised)).toEqual([12 * M, 12 * M, 12 * M]);
    expect(r.years[0].runRateEnd).toBe(12 * M);
  });

  it("realises half a year for a flow going live in H2", () => {
    const r = computeScenario(plan, scenario({ flows: [{ flowId: "f", goLive: "2027-H2", rampMonths: 0, runRate: 12 * M }] }));
    expect(r.years[0].valueRealised).toBeCloseTo(6 * M, 6);
  });

  it("ramps linearly to full run-rate", () => {
    const r = computeScenario(plan, scenario({ flows: [{ flowId: "f", goLive: "2027-H1", rampMonths: 12, runRate: 12 * M }] }));
    // Average ramp over the first 12 months is 0.5
    expect(r.years[0].valueRealised).toBeCloseTo(6 * M, 6);
    expect(r.years[0].runRateEnd).toBeCloseTo(12 * M, 6);
    expect(r.runRateByHalf[0].runRate).toBeCloseTo(6 * M, 6);
  });

  it("counts cash and own time, net, cumulative net and value after the plan", () => {
    const r = computeScenario(plan, scenario({
      costs: [
        { id: "a", label: "one-off", kind: "one-off", perYear: [10 * M, 0, 0] },
        { id: "b", label: "running", kind: "running", perYear: [1 * M, 2 * M, 3 * M] },
        { id: "c", label: "people", kind: "own-time", perYear: [5, 2, 1] },
      ],
    }));
    expect(r.years[0]).toMatchObject({ cash: 11 * M, ownTimeCost: 5 * M, totalCost: 16 * M, net: -4 * M });
    expect(r.years[2].cumulativeNet).toBeCloseTo(-4 * M + 8 * M + 8 * M, 6);
    expect(r.totalCash).toBe(16 * M);
    expect(r.valueAfterPlan).toBe(9 * M);
    expect(r.paybackYear).toBe(2028);
    expect(r.paybackYearCash).toBe(2027);
  });

  it("projects payback after the plan from the value per year after it", () => {
    const r = computeScenario(plan, scenario({
      flows: [{ flowId: "f", goLive: "2029-H2", rampMonths: 0, runRate: 10 * M }],
      costs: [{ id: "a", label: "x", kind: "one-off", perYear: [10 * M, 10 * M, 0] }],
    }));
    // −20 + 5 = −15 after the plan, 10 a year after → two more years
    expect(r.netOverPlan).toBeCloseTo(-15 * M, 6);
    expect(r.paybackYear).toBe(2031);
  });

  it("gives no payback year when the plan never earns back", () => {
    const r = computeScenario(plan, scenario({ flows: [], costs: [{ id: "a", label: "x", kind: "one-off", perYear: [1 * M, 0, 0] }] }));
    expect(r.paybackYear).toBeNull();
  });
});

describe("flow scoring", () => {
  it("redesigns high-value, high-waiting flows with evidence", () => {
    expect(flowPriority({ value: "high", evidence: "high", waiting: "high", volume: "high" })).toBe(100);
    expect(suggestedDecision({ value: "high", evidence: "medium", waiting: "high", volume: "medium" })).toBe("redesign");
  });
  it("improves in place when waiting is low, and leaves weak cases", () => {
    expect(suggestedDecision({ value: "high", evidence: "high", waiting: "low", volume: "high" })).toBe("improve");
    expect(suggestedDecision({ value: "low", evidence: "low", waiting: "medium", volume: "low" })).toBe("leave");
  });
  it("builds new flows unless they have little value", () => {
    expect(suggestedDecision({ value: "high", evidence: "low", waiting: "low", volume: "medium" }, true)).toBe("build");
    expect(suggestedDecision({ value: "low", evidence: "low", waiting: "low", volume: "low" }, true)).toBe("leave");
  });
});

describe("example plan", () => {
  it("matches its stated pattern and its decisions match the scoring rule", () => {
    const p = examplePlan();
    const r = Object.fromEntries(p.scenarios.map((s) => [s.id, computeScenario(p, s)]));
    expect(Math.abs(r["ai-added"].netOverPlan)).toBeLessThan(1 * M);
    expect(r.conservative.netOverPlan).toBeLessThan(0);
    expect(r.base.netOverPlan).toBeLessThan(0);
    expect(r.ambitious.netOverPlan).toBeGreaterThan(0);
    expect(r.base.valueAfterPlan).toBeGreaterThan(r.conservative.valueAfterPlan);
    for (const f of p.flows) expect(suggestedDecision(f.scores, f.isNew)).toBe(f.decision);
    const ids = new Set(p.flows.map((f) => f.id));
    for (const s of p.scenarios) for (const sf of s.flows) expect(ids.has(sf.flowId)).toBe(true);
  });
});

import { caseInScenarioTerms, monthIndex, monthsOfHalf, plannedForMonth, scenarioFlowForProcess } from "./strategy";

describe("one time model", () => {
  it("counts months from the plan start", () => {
    expect(monthIndex(plan, "2027-01-01")).toBe(0);
    expect(monthIndex(plan, "2028-07-01")).toBe(18);
  });

  it("lists the months of a half-year", () => {
    expect(monthsOfHalf("2027-H2")).toEqual(["2027-07-01", "2027-08-01", "2027-09-01", "2027-10-01", "2027-11-01", "2027-12-01"]);
  });

  it("plans nothing before go-live and follows the ramp after it", () => {
    const f = { goLive: "2027-H2" as const, rampMonths: 12 };
    expect(plannedForMonth(plan, f, 12 * M, "2027-06-01")).toBe(0);
    // July is month 6; at mid-month the ramp is 0.5 / 12.
    expect(plannedForMonth(plan, f, 12 * M, "2027-07-01")).toBeCloseTo(M * (0.5 / 12), 6);
    expect(plannedForMonth(plan, f, 12 * M, "2028-12-01")).toBeCloseTo(M, 6);
  });

  it("plans the full monthly value from go-live without a ramp", () => {
    expect(plannedForMonth(plan, { goLive: "2027-H1", rampMonths: 0 }, 12 * M, "2027-01-01")).toBe(M);
  });

  it("finds the chosen scenario's entry for a linked process", () => {
    const p = examplePlan();
    const hit = scenarioFlowForProcess(p, "customer-service");
    expect(hit?.scenario.id).toBe(p.chosenScenarioId);
    expect(hit?.flow.id).toBe("request-to-resolution");
    expect(scenarioFlowForProcess(p, "nothing")).toBeNull();
    expect(scenarioFlowForProcess({ ...p, chosenScenarioId: null }, "customer-service")).toBeNull();
  });
});

describe("caseInScenarioTerms", () => {
  it("compares the value case before running costs, which the scenario counts as costs", () => {
    const r = caseInScenarioTerms({ labourBenefit: 10 * M, oversightCost: 1.5 * M, aiCost: 0.5 * M, fixedCost: 0.3 * M });
    expect(r.runRate).toBe(8.5 * M);
    expect(r.runningCosts).toBe(0.8 * M);
    expect(r.net).toBeCloseTo(7.7 * M, 6);
  });
});

import { applyDrivers, flowMatrix, NEUTRAL_DRIVERS, sensitivity, shiftHalf } from "./strategy";

describe("drivers", () => {
  const s = scenario({
    flows: [{ flowId: "f", goLive: "2027-H2", rampMonths: 12, runRate: 10 * M }],
    costs: [{ id: "c", label: "Build", kind: "one-off", perYear: [2 * M, 0, 0] }, { id: "o", label: "Team", kind: "own-time", perYear: [2, 2, 2] }],
  });

  it("changes nothing at neutral settings", () => {
    expect(computeScenario(plan, applyDrivers(plan, s, NEUTRAL_DRIVERS))).toEqual(computeScenario(plan, s));
  });

  it("scales value, ramp and costs, and moves go-lives", () => {
    const d = applyDrivers(plan, s, { valuePct: 50, delayHalves: 1, rampPct: 50, costPct: 200, ownTimePct: 50 });
    expect(d.flows[0]).toMatchObject({ runRate: 5 * M, goLive: "2028-H1", rampMonths: 6 });
    expect(d.costs[0].perYear[0]).toBe(4 * M);
    expect(d.costs[1].perYear[0]).toBe(1);
  });

  it("never moves a go-live before the plan starts", () => {
    expect(shiftHalf("2027-H1", -2, 2027)).toBe("2027-H1");
    expect(shiftHalf("2028-H1", -1, 2027)).toBe("2027-H2");
  });

  it("ranks drivers by how much they move net over the plan", () => {
    const r = sensitivity(plan, s);
    expect(r.base).toBeCloseTo(computeScenario(plan, s).netOverPlan, 6);
    expect(r.rows).toHaveLength(5);
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i - 1].swing).toBeGreaterThanOrEqual(r.rows[i].swing);
    const value = r.rows.find((x) => x.driver === "valuePct")!;
    expect(value.low).toBeLessThan(r.base);
    expect(value.high).toBeGreaterThan(r.base);
    const delay = r.rows.find((x) => x.driver === "delayHalves")!;
    expect(delay.low).toBeLessThan(r.base);
  });
});

describe("flowMatrix", () => {
  it("places the prize on one axis and the evidence on the other", () => {
    expect(flowMatrix({ value: "high", evidence: "high", waiting: "high", volume: "high" })).toEqual({ value: 100, ease: 85 });
    expect(flowMatrix({ value: "low", evidence: "low", waiting: "low", volume: "low" })).toEqual({ value: 17, ease: 15 });
  });
});
