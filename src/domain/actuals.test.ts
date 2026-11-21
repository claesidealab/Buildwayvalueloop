import { describe, expect, it } from "vitest";
import { actualsTemplateCsv, parseActualsCsv, stepNeedsAttention, summariseActuals } from "./actuals";
import { customerService as cs } from "@/templates/customer-service";

const steps = cs.steps.map((s) => s.id);

describe("parseActualsCsv", () => {
  it("reads comma-separated rows", () => {
    const { rows, errors } = parseActualsCsv("month,metric,step,value\n2026-01,hours_released,,1450\n2026-01,success_rate,resolve,71\n", steps);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { period: "2026-01-01", metric: "hours_released", step: null, value: 1450 },
      { period: "2026-01-01", metric: "success_rate", step: "resolve", value: 71 },
    ]);
  });

  it("reads Swedish Excel files: semicolons, decimal commas, BOM and CRLF", () => {
    const { rows, errors } = parseActualsCsv("﻿month;metric;step;value\r\n2026-02;csat;;4,3\r\n2026-02;hours_released;;1 520\r\n", steps);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.value)).toEqual([4.3, 1520]);
  });

  it("reports each bad row by line number and keeps the good ones", () => {
    const csv = [
      "month,metric,step,value",
      "2026-13,csat,,4",           // bad month
      "2026-01,happiness,,4",      // unknown metric
      "2026-01,success_rate,,80",  // step missing
      "2026-01,success_rate,nope,80", // unknown step
      "2026-01,csat,resolve,4",    // process metric with step
      "2026-01,csat,,9",           // out of range
      "2026-01,csat,,abc",         // not a number
      "2026-01,csat,,4.5",         // ok
      "2026-01,csat,,4.6",         // duplicate
    ].join("\n");
    const { rows, errors } = parseActualsCsv(csv, steps);
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 10]);
  });

  it("requires the header", () => {
    expect(parseActualsCsv("2026-01,csat,,4", steps).errors[0].message).toMatch(/name the columns/);
    expect(parseActualsCsv("   \n", steps).errors[0].message).toMatch(/empty/);
  });

  it("produces a template that parses with only empty-value errors", () => {
    const tpl = actualsTemplateCsv(steps, "2026-11", 2);
    expect(tpl.split("\n")[0]).toBe("month,metric,step,value");
    expect(tpl).toContain("2026-12,success_rate,resolve,");
    const { errors } = parseActualsCsv(tpl, steps);
    expect(errors.every((e) => /not a number/.test(e.message))).toBe(true);
  });
});

describe("summariseActuals", () => {
  const a = cs.defaultAssumptions; // 420 SEK/h, 15% oversight, 300k fixed
  const plan = { net: 6_000_000, aiCost: 252_000, assumptions: a };

  it("computes realised value per month from hours released", () => {
    const s = summariseActuals([{ period: "2026-01-01", metric: "hours_released", step: null, value: 1000 }], plan);
    const expected = 1000 * 420 * 0.85 - 252_000 / 12 - 300_000 / 12;
    expect(s.months[0].realised).toBeCloseTo(expected, 6);
    expect(s.months[0].plan).toBe(500_000);
    expect(s.realisedShare).toBeCloseTo(expected / 500_000, 6);
  });

  it("uses uploaded AI cost instead of the plan's", () => {
    const s = summariseActuals([
      { period: "2026-01-01", metric: "hours_released", step: null, value: 1000 },
      { period: "2026-01-01", metric: "ai_cost_sek", step: null, value: 10_000 },
    ], plan);
    expect(s.months[0].realised).toBeCloseTo(1000 * 420 * 0.85 - 10_000 - 25_000, 6);
  });

  it("leaves months without hours out of the realised share", () => {
    const s = summariseActuals([
      { period: "2026-01-01", metric: "hours_released", step: null, value: 1000 },
      { period: "2026-02-01", metric: "csat", step: null, value: 4.1 },
    ], plan);
    expect(s.months[1].realised).toBeNull();
    expect(s.planToDate).toBe(500_000);
  });

  it("returns latest KPIs and the latest month's step stats", () => {
    const s = summariseActuals([
      { period: "2026-01-01", metric: "csat", step: null, value: 4.0 },
      { period: "2026-02-01", metric: "csat", step: null, value: 4.4 },
      { period: "2026-01-01", metric: "success_rate", step: "resolve", value: 60 },
      { period: "2026-02-01", metric: "success_rate", step: "resolve", value: 71 },
      { period: "2026-02-01", metric: "escalation_rate", step: "resolve", value: 24 },
    ], plan);
    expect(s.latest.csat).toEqual({ value: 4.4, period: "2026-02-01", first: 4.0 });
    expect(s.steps.resolve).toEqual({ period: "2026-02-01", success: 71, escalation: 24 });
    expect(stepNeedsAttention(s.steps.resolve)).toBe(true);
    expect(stepNeedsAttention({ success: 95, escalation: 3 })).toBe(false);
  });
});
