import { describe, expect, it } from "vitest";
import { effectiveStage, gateFromRealised, measureBasis } from "./progress";
import { customerService } from "@/templates";
import { examplePlan } from "@/templates/strategy-example";

describe("effectiveStage", () => {
  it("moves forward with what has happened", () => {
    expect(effectiveStage("not-started", { stepCount: 0, hasBaseline: false, hasActuals: false })).toBe("not-started");
    expect(effectiveStage("not-started", { stepCount: 3, hasBaseline: false, hasActuals: false })).toBe("find");
    expect(effectiveStage("find", { stepCount: 3, hasBaseline: true, hasActuals: false })).toBe("build");
    expect(effectiveStage("find", { stepCount: 3, hasBaseline: true, hasActuals: true })).toBe("run");
  });
  it("never moves back from a stored stage", () => {
    expect(effectiveStage("run", { stepCount: 3, hasBaseline: false, hasActuals: false })).toBe("run");
  });
});

describe("gateFromRealised", () => {
  it("keeps the stored light without actuals and follows realised value with them", () => {
    expect(gateFromRealised("amber", null)).toBe("amber");
    expect(gateFromRealised("red", 0.95)).toBe("green");
    expect(gateFromRealised("green", 0.75)).toBe("amber");
    expect(gateFromRealised("green", 0.5)).toBe("red");
  });
});

describe("measureBasis", () => {
  const p = { id: "customer-service", steps: customerService.steps, design: customerService.defaultDesign, assumptions: customerService.defaultAssumptions, baseline: null };

  it("spreads the value case evenly without a strategy", () => {
    const b = measureBasis(p, null);
    expect(b.entry).toBeNull();
    expect(b.planFor("2027-07-01")).toBeCloseTo(b.net / 12, 6);
  });

  it("follows the chosen scenario's go-live and ramp for a linked process", () => {
    const s = examplePlan();
    const b = measureBasis(p, s);
    expect(b.entry).not.toBeNull();
    expect(b.scenarioName).toBeTruthy();
    // Nothing before go-live, full monthly value once the ramp is done.
    const goLiveYear = Number(b.entry!.goLive.slice(0, 4));
    expect(b.planFor(`${goLiveYear - 1}-12-01`)).toBe(0);
    expect(b.planFor(`${goLiveYear + 3}-01-01`)).toBeCloseTo(b.net / 12, 6);
  });
});
