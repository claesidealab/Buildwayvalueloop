import { describe, expect, it } from "vitest";
import { erlangC, queue, simulate, workload } from "./simulation";
import { customerService } from "@/templates";

const t = customerService;

describe("erlangC", () => {
  it("matches a textbook value and the edge cases", () => {
    // 2 Erlangs on 3 servers: P(wait) = 4/9 ≈ 0.444
    expect(erlangC(2, 3)).toBeCloseTo(4 / 9, 6);
    expect(erlangC(3, 3)).toBe(1);
    expect(erlangC(0.5, 1)).toBeCloseTo(0.5, 6);
  });
});

describe("queue", () => {
  it("is unstable when the load reaches the team size", () => {
    const q = queue(168 * 10, 60, 10, { peakPct: 0, targetMinutes: 20 }); // 10 cases/hour × 1 hour each on 10 people
    expect(q.stable).toBe(false);
    expect(q.avgWaitMinutes).toBeNull();
  });
  it("waits less with more people", () => {
    const a = queue(1680, 30, 6, { peakPct: 0, targetMinutes: 20 });
    const b = queue(1680, 30, 8, { peakPct: 0, targetMinutes: 20 });
    expect(a.load).toBeCloseTo(5, 6);
    expect(b.avgWaitMinutes!).toBeLessThan(a.avgWaitMinutes!);
    expect(b.withinTarget!).toBeGreaterThan(a.withinTarget!);
  });
});

describe("workload", () => {
  it("adds rework for escalated agent cases and none at zero escalation", () => {
    const zero = workload(t.steps, t.defaultDesign, t.defaultAssumptions, 0);
    const some = workload(t.steps, t.defaultDesign, t.defaultAssumptions, 20);
    expect(zero.rework).toBe(0);
    expect(some.after).toBeGreaterThan(zero.after);
    expect(zero.after).toBeLessThan(zero.today);
  });
});

describe("simulate", () => {
  const input = { escalationPct: 15, peakPct: 20, people: 30, targetMinutes: 20 };
  it("is deterministic for a seed and orders the range", () => {
    const a = simulate(t.steps, t.defaultDesign, t.defaultAssumptions, input, 7, 300);
    const b = simulate(t.steps, t.defaultDesign, t.defaultAssumptions, input, 7, 300);
    expect(a).toEqual(b);
    expect(a.range.p10).toBeLessThanOrEqual(a.range.p50);
    expect(a.range.p50).toBeLessThanOrEqual(a.range.p90);
    expect(a.escalationHoursPerYear).toBeGreaterThan(0);
  });
  it("lowers value as escalation rises", () => {
    const low = simulate(t.steps, t.defaultDesign, t.defaultAssumptions, { ...input, escalationPct: 5 }, 3, 300);
    const high = simulate(t.steps, t.defaultDesign, t.defaultAssumptions, { ...input, escalationPct: 40 }, 3, 300);
    expect(high.range.p50).toBeLessThan(low.range.p50);
  });
});
