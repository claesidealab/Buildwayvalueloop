/**
 * Gate checks: a gate with a measurable condition is checked against the linked process's
 * uploaded actuals. The check suggests a status; the leadership team still decides it.
 *
 *   value_vs_plan = Σ realised value / Σ planned value over the half-year's months with hours_released
 *                   (plan follows the scenario's go-live and ramp; see plannedForMonth)
 *   other metrics = the process metric's value in the last month of the half-year that has it
 *
 *   suggestion    = met when the measured value passes the target (≥ or ≤), missed when not,
 *                   no-data when nothing is uploaded for the half-year yet
 */
import { METRICS, realisedForMonth, type ActualPoint } from "./actuals";
import { monthsOfHalf, plannedForMonth, type Gate, type ScenarioFlow, type StrategyPlan } from "./strategy";
import type { Assumptions } from "./types";

export interface GateProcessData {
  actuals: ActualPoint[];
  /** Net value per year the process is measured against (approved baseline, else current case). */
  net: number;
  aiCost: number;
  assumptions: Assumptions;
  agentSteps?: string[];
  /** The process's flow entry in the scenario the gate belongs to; null = flat plan (net / 12). */
  entry: Pick<ScenarioFlow, "goLive" | "rampMonths"> | null;
}

export interface GateResult {
  suggestion: "met" | "missed" | "no-data";
  measured: number | null;
  /** Human-readable, e.g. "82% of plan in 2027 H2" */
  detail: string;
}

export const GATE_METRICS: Array<{ key: string; label: string; unit: string }> = [
  { key: "value_vs_plan", label: "Value realised vs plan", unit: "%" },
  ...METRICS.filter((m) => m.scope === "process").map((m) => ({ key: m.key, label: m.label, unit: m.unit })),
];

const half = (p: string) => p.replace("-", " ");

export function evaluateGate(plan: Pick<StrategyPlan, "startYear">, gate: Pick<Gate, "period" | "check">, data: GateProcessData | null): GateResult | null {
  const c = gate.check;
  if (!c) return null;
  if (!data) return { suggestion: "no-data", measured: null, detail: "The linked process was not found" };
  const months = monthsOfHalf(gate.period);
  let measured: number | null = null;
  let where = "";

  if (c.metric === "value_vs_plan") {
    let realised = 0, planned = 0, n = 0;
    for (const m of months) {
      const r = realisedForMonth(data.actuals, m, data);
      if (r === null) continue;
      realised += r; n++;
      planned += data.entry ? plannedForMonth(plan, data.entry, data.net, m) : data.net / 12;
    }
    if (n === 0) return { suggestion: "no-data", measured: null, detail: `No hours_released uploaded for ${half(gate.period)}` };
    if (planned <= 0) return { suggestion: "no-data", measured: null, detail: `Nothing was planned before go-live in ${half(gate.period)}` };
    measured = (realised / planned) * 100;
    where = `of plan over ${n} month${n === 1 ? "" : "s"} of ${half(gate.period)}`;
  } else {
    const series = data.actuals.filter((p) => p.metric === c.metric && p.step === null && months.includes(p.period)).sort((a, b) => a.period.localeCompare(b.period));
    const last = series.at(-1);
    if (!last) return { suggestion: "no-data", measured: null, detail: `No ${c.metric} uploaded for ${half(gate.period)}` };
    measured = last.value;
    where = `in ${new Date(last.period + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}`;
  }
  const pass = c.op === "gte" ? measured >= c.target : measured <= c.target;
  const unit = GATE_METRICS.find((m) => m.key === c.metric)?.unit ?? "";
  const fmt = (v: number) => `${Math.round(v * 10) / 10}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
  return { suggestion: pass ? "met" : "missed", measured, detail: `${fmt(measured)} ${where}; target ${c.op === "gte" ? "≥" : "≤"} ${fmt(c.target)}` };
}
