/**
 * Actuals: measured results after go-live, uploaded as CSV (later: connectors).
 *
 * CSV, one value per row (comma or semicolon separated; with semicolons a decimal comma is allowed):
 *
 *   month,metric,step,value
 *   2026-01,hours_released,,1450
 *   2026-01,handled_without_human,,52
 *   2026-01,success_rate,resolve,71
 *
 * Realised value per month, compared with the plan for that month. The plan is the baseline
 * net / 12, or, when the process is in the chosen strategy scenario, the same net following
 * the scenario's go-live and ramp (see plannedForMonth in strategy.ts):
 *
 *   realised = hours_released × cost per hour × (1 − oversight share)
 *              − AI cost (ai_cost_sek if uploaded, else the sum of agent_cost_sek per step if any,
 *                         else the plan's AI cost / 12)
 *              − fixed cost / 12
 */
import type { Assumptions } from "./types";

export type MetricScope = "process" | "step";

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  scope: MetricScope;
  min: number;
  max: number;
}

export const METRICS: MetricDef[] = [
  { key: "hours_released", label: "Hours released", unit: "h", scope: "process", min: 0, max: 10_000_000 },
  { key: "ai_cost_sek", label: "AI cost", unit: "SEK", scope: "process", min: 0, max: 1_000_000_000 },
  { key: "cases", label: "Cases handled", unit: "", scope: "process", min: 0, max: 100_000_000 },
  { key: "handled_without_human", label: "Resolved without a human", unit: "%", scope: "process", min: 0, max: 100 },
  { key: "cost_per_case", label: "Cost per case", unit: "SEK", scope: "process", min: 0, max: 1_000_000 },
  { key: "csat", label: "CSAT", unit: "/5", scope: "process", min: 1, max: 5 },
  { key: "success_rate", label: "Agent success", unit: "%", scope: "step", min: 0, max: 100 },
  { key: "escalation_rate", label: "Escalation", unit: "%", scope: "step", min: 0, max: 100 },
  { key: "agent_runs", label: "Agent runs", unit: "", scope: "step", min: 0, max: 1_000_000_000 },
  { key: "agent_cost_sek", label: "Agent cost", unit: "SEK", scope: "step", min: 0, max: 1_000_000_000 },
];

const METRIC = new Map(METRICS.map((m) => [m.key, m]));

/** Realised value for one month, by the formula above; null when hours_released is missing. */
export function realisedForMonth(points: ActualPoint[], period: string, plan: { aiCost: number; assumptions: Assumptions }): number | null {
  const get = (metric: string) => points.find((p) => p.period === period && p.metric === metric && p.step === null)?.value;
  const hours = get("hours_released");
  if (hours === undefined) return null;
  const a = plan.assumptions;
  const agentCosts = points.filter((p) => p.period === period && p.metric === "agent_cost_sek" && p.step !== null);
  const ai = get("ai_cost_sek") ?? (agentCosts.length ? agentCosts.reduce((t, p) => t + p.value, 0) : plan.aiCost / 12);
  return hours * a.costPerHour * (1 - a.oversightShare / 100) - ai - a.fixedCostPerYear / 12;
}

export interface ActualPoint {
  /** First day of the month, YYYY-MM-01. */
  period: string;
  metric: string;
  /** Step key, or null for process-level metrics. */
  step: string | null;
  value: number;
}

export interface CsvError { line: number; message: string }

const MAX_ROWS = 10_000;

/** Parses and validates an actuals CSV. Returns every valid row and a list of problems by line number. */
export function parseActualsCsv(text: string, stepKeys: string[]): { rows: ActualPoint[]; errors: CsvError[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const rows: ActualPoint[] = [];
  const errors: CsvError[] = [];
  const steps = new Set(stepKeys);
  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  if (headerIdx < 0) return { rows, errors: [{ line: 1, message: "The file is empty" }] };

  const header = lines[headerIdx];
  const delim = header.includes(";") ? ";" : ",";
  const cols = header.split(delim).map((c) => c.trim().toLowerCase());
  const at = (name: string) => cols.indexOf(name);
  const [iMonth, iMetric, iStep, iValue] = [at("month"), at("metric"), at("step"), at("value")];
  if (iMonth < 0 || iMetric < 0 || iValue < 0) {
    return { rows, errors: [{ line: headerIdx + 1, message: "The first row must name the columns: month, metric, step, value" }] };
  }

  const seen = new Set<string>();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "") continue;
    const lineNo = i + 1;
    if (rows.length + errors.length >= MAX_ROWS) { errors.push({ line: lineNo, message: `Too many rows; the limit is ${MAX_ROWS}` }); break; }
    const f = raw.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    const month = f[iMonth] ?? "";
    const metricKey = (f[iMetric] ?? "").toLowerCase();
    const stepKey = iStep >= 0 ? (f[iStep] ?? "").toLowerCase() : "";
    const valueText = (f[iValue] ?? "").replace(/\s/g, "");

    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m || +m[2] < 1 || +m[2] > 12) { errors.push({ line: lineNo, message: `Month "${month}" should look like 2026-01` }); continue; }
    const def = METRIC.get(metricKey);
    if (!def) { errors.push({ line: lineNo, message: `Unknown metric "${metricKey}"` }); continue; }
    if (def.scope === "step") {
      if (!stepKey) { errors.push({ line: lineNo, message: `${def.key} needs a step` }); continue; }
      if (!steps.has(stepKey)) { errors.push({ line: lineNo, message: `Unknown step "${stepKey}"` }); continue; }
    } else if (stepKey) { errors.push({ line: lineNo, message: `${def.key} is for the whole process; leave step empty` }); continue; }

    const normalised = delim === ";" ? valueText.replace(",", ".") : valueText;
    const value = Number(normalised);
    if (normalised === "" || !Number.isFinite(value)) { errors.push({ line: lineNo, message: `Value "${valueText}" is not a number` }); continue; }
    if (value < def.min || value > def.max) { errors.push({ line: lineNo, message: `${def.label} must be between ${def.min} and ${def.max}` }); continue; }

    const key = `${month}|${def.key}|${stepKey}`;
    if (seen.has(key)) { errors.push({ line: lineNo, message: `Duplicate row for ${def.key}${stepKey ? ` / ${stepKey}` : ""} in ${month}` }); continue; }
    seen.add(key);
    rows.push({ period: `${month}-01`, metric: def.key, step: def.scope === "step" ? stepKey : null, value });
  }
  return { rows, errors };
}

/** A starter CSV with the next months and every metric, for people to fill in. */
export function actualsTemplateCsv(stepKeys: string[], startMonth: string, months = 3): string {
  const out = ["month,metric,step,value"];
  const [y, mo] = startMonth.split("-").map(Number);
  for (let k = 0; k < months; k++) {
    const d = new Date(Date.UTC(y, mo - 1 + k, 1));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    for (const def of METRICS) {
      if (def.scope === "process") out.push(`${month},${def.key},,`);
      else for (const s of stepKeys) out.push(`${month},${def.key},${s},`);
    }
  }
  return out.join("\n") + "\n";
}

export interface MonthResult { period: string; plan: number; realised: number | null }

export interface ActualsSummary {
  months: MonthResult[];
  planToDate: number;
  realisedToDate: number;
  /** realisedToDate / planToDate over months that have hours_released. */
  realisedShare: number | null;
  latest: Record<string, { value: number; period: string; first: number } | undefined>;
  steps: Record<string, { success?: number; escalation?: number; period: string }>;
}

/** Monthly plan vs realised value, latest process KPIs and latest step stats. */
export function summariseActuals(
  points: ActualPoint[],
  plan: { net: number; aiCost: number; assumptions: Assumptions; planFor?: (period: string) => number },
): ActualsSummary {
  const periods = [...new Set(points.map((p) => p.period))].sort();
  const months: MonthResult[] = periods.map((period) => {
    const realised = realisedForMonth(points, period, plan);
    return { period, plan: plan.planFor ? plan.planFor(period) : plan.net / 12, realised };
  });
  const measured = months.filter((m) => m.realised !== null);
  const planToDate = measured.reduce((t, m) => t + m.plan, 0);
  const realisedToDate = measured.reduce((t, m) => t + (m.realised as number), 0);

  const latest: ActualsSummary["latest"] = {};
  for (const def of METRICS.filter((d) => d.scope === "process")) {
    const series = points.filter((p) => p.metric === def.key && p.step === null).sort((x, y) => x.period.localeCompare(y.period));
    if (series.length) latest[def.key] = { value: series[series.length - 1].value, period: series[series.length - 1].period, first: series[0].value };
  }

  const steps: ActualsSummary["steps"] = {};
  const stepPeriods = periods.filter((p) => points.some((x) => x.period === p && x.step !== null));
  const last = stepPeriods[stepPeriods.length - 1];
  if (last) {
    for (const p of points.filter((x) => x.period === last && x.step)) {
      const s = (steps[p.step!] ??= { period: last });
      if (p.metric === "success_rate") s.success = p.value;
      if (p.metric === "escalation_rate") s.escalation = p.value;
    }
  }

  return { months, planToDate, realisedToDate, realisedShare: planToDate > 0 ? realisedToDate / planToDate : null, latest, steps };
}

/** Thresholds for flagging an automated step in monitoring. */
export const STEP_ALERT = { minSuccess: 80, maxEscalation: 15 };

export function stepNeedsAttention(s: { success?: number; escalation?: number }): boolean {
  return (s.success !== undefined && s.success < STEP_ALERT.minSuccess) || (s.escalation !== undefined && s.escalation > STEP_ALERT.maxEscalation);
}
