/**
 * Strategy: the company-level plan above individual processes.
 *
 * - Flows: the inventory of cross-department flows, scored to decide which to redesign.
 * - Scenarios: which flows go live when, what the programme costs per year, and the net value.
 * - Gates: a checkpoint at the end of each half-year, decided in the leadership room.
 * - Ambition: AI-native targets per year, agreed with the leadership team.
 *
 * Money is in the plan's currency (SEK by default). Own staff time is counted in FTE
 * and valued at `ownTimeRate` per FTE-year, so total cost covers cash and people.
 */
import type { Rating, ValueCase } from "./types";

/** A half-year, written "2027-H1". */
export type HalfYear = `${number}-H${1 | 2}`;

export type FlowDecision = "redesign" | "build" | "improve" | "leave";

export interface FlowScores {
  /** Size of the prize if the flow is redesigned. */
  value: Rating;
  /** How strong the evidence is that AI works for this kind of work. */
  evidence: Rating;
  /** How much of the lead time is waiting and handovers between teams. */
  waiting: Rating;
  /** Number of cases per year. */
  volume: Rating;
}

export interface StrategyFlow {
  id: string;
  name: string;
  /** Departments the flow runs through, e.g. "Support, Delivery, Finance". */
  area: string;
  description: string;
  owner: string;
  scores: FlowScores;
  decision: FlowDecision;
  /** True for a flow that doesn't exist today and would be built new. */
  isNew?: boolean;
  /** Linked process in the workspace once the flow is mapped. */
  processId: string | null;
  rationale?: string;
  source?: "manual" | "ai";
}

export interface ScenarioFlow {
  flowId: string;
  goLive: HalfYear;
  /** Months from go-live to full run-rate. 0 = full value from go-live. */
  rampMonths: number;
  /** Gross yearly value at full run-rate, before running costs. */
  runRate: number;
}

export type CostKind = "one-off" | "running" | "own-time";

export interface CostLine {
  id: string;
  label: string;
  kind: CostKind;
  /** Per plan year: money for one-off and running, FTE for own time. */
  perYear: number[];
}

export type GateStatus = "open" | "met" | "missed";

/**
 * A measurable gate condition, checked against uploaded actuals of a linked process.
 * metric "value_vs_plan": realised value as a percent of plan in the gate's half-year.
 * Any other metric is a process-level actuals metric (e.g. handled_without_human), read in
 * the last month of the half-year that has data.
 */
export interface GateCheck {
  processId: string;
  metric: string;
  op: "gte" | "lte";
  target: number;
}

export interface Gate {
  id: string;
  period: HalfYear;
  criterion: string;
  status: GateStatus;
  decidedAt?: string;
  decidedBy?: string;
  check?: GateCheck;
}

export interface Scenario {
  id: string;
  name: string;
  summary: string;
  flows: ScenarioFlow[];
  costs: CostLine[];
  assumptions: Array<{ label: string; value: string }>;
  gates: Gate[];
}

export interface AmbitionMeasure {
  id: string;
  name: string;
  unit: string;
  /** Agreed target per plan year; null = not set yet. */
  targets: Array<number | null>;
}

export interface StrategyDecision {
  id: string;
  at: string;
  recordedBy: string;
  attendees: string;
  kind: "scenario" | "ambition" | "gate" | "other";
  text: string;
}

export interface StrategyPlan {
  currency: string;
  startYear: number;
  years: number;
  /** Value of one FTE-year of own staff time, in the plan's currency. */
  ownTimeRate: number;
  flows: StrategyFlow[];
  scenarios: Scenario[];
  chosenScenarioId: string | null;
  ambition: AmbitionMeasure[];
  decisions: StrategyDecision[];
  isExample?: boolean;
}

/* ---------- time ---------- */

export function halfYears(plan: Pick<StrategyPlan, "startYear" | "years">): HalfYear[] {
  const out: HalfYear[] = [];
  for (let y = 0; y < plan.years; y++) for (const h of [1, 2] as const) out.push(`${plan.startYear + y}-H${h}`);
  return out;
}

/** Months from the start of the plan to the start of a half-year. */
export function monthOf(plan: Pick<StrategyPlan, "startYear">, half: HalfYear): number {
  const [y, h] = half.split("-H").map(Number);
  return (y - plan.startYear) * 12 + (h === 2 ? 6 : 0);
}

/* ---------- flow scoring ---------- */

const POINTS: Record<keyof FlowScores, Record<Rating, number>> = {
  value: { high: 35, medium: 20, low: 5 },
  evidence: { high: 25, medium: 15, low: 5 },
  waiting: { high: 25, medium: 15, low: 5 },
  volume: { high: 15, medium: 10, low: 3 },
};

/** 0–100: how strong a candidate the flow is for redesign. */
export function flowPriority(s: FlowScores): number {
  return POINTS.value[s.value] + POINTS.evidence[s.evidence] + POINTS.waiting[s.waiting] + POINTS.volume[s.volume];
}

/**
 * The rule from practice: redesign where waiting and handovers dominate, volume is high
 * and evidence exists. Build new only for flows that don't exist yet. Improve in place where
 * value is real but the flow isn't worth redrawing; leave the rest for now.
 */
export function suggestedDecision(s: FlowScores, isNew = false): FlowDecision {
  if (isNew) return s.value === "low" ? "leave" : "build";
  const p = flowPriority(s);
  if (p >= 70 && s.waiting !== "low" && s.evidence !== "low") return "redesign";
  if (p >= 45) return "improve";
  return "leave";
}

/* ---------- scenario results ---------- */

/** Share of full run-rate reached at a point in time (months from plan start). */
export function rampAt(f: ScenarioFlow, goLiveMonth: number, month: number): number {
  if (month <= goLiveMonth) return 0;
  if (f.rampMonths <= 0) return 1;
  return Math.min(1, (month - goLiveMonth) / f.rampMonths);
}

export interface YearResult {
  year: number;
  oneOff: number;
  running: number;
  ownTimeFte: number;
  ownTimeCost: number;
  cash: number;
  totalCost: number;
  /** Value that reaches the accounts in the year. */
  valueRealised: number;
  net: number;
  cumulativeNet: number;
  cumulativeCashNet: number;
  /** Gross value per year at the end of the year. */
  runRateEnd: number;
  /** Run-rate at year end net of that year's running costs. */
  netRunRateEnd: number;
}

export interface ScenarioResult {
  years: YearResult[];
  totalCost: number;
  totalCash: number;
  totalOwnTimeCost: number;
  totalValue: number;
  netOverPlan: number;
  /** Net value per year once the plan is done: final run-rate less running costs. */
  valueAfterPlan: number;
  /** Year in which cumulative net turns positive, counting own time; may be after the plan. */
  paybackYear: number | null;
  paybackYearCash: number | null;
  /** Gross run-rate at the end of each half-year. */
  runRateByHalf: Array<{ period: HalfYear; runRate: number; netRunRate: number }>;
  flowsLive: number;
}

function paybackAfter(cum: number, lastYear: number, perYearAfter: number): number | null {
  if (cum >= 0) return null;
  if (perYearAfter <= 0) return null;
  return lastYear + Math.ceil(-cum / perYearAfter);
}

export function computeScenario(plan: Pick<StrategyPlan, "startYear" | "years" | "ownTimeRate">, s: Scenario): ScenarioResult {
  const n = plan.years;
  const goLive = new Map(s.flows.map((f) => [f, monthOf(plan, f.goLive)]));
  const sumKind = (kind: CostKind, y: number) => s.costs.filter((c) => c.kind === kind).reduce((t, c) => t + (c.perYear[y] ?? 0), 0);

  const years: YearResult[] = [];
  let cum = 0;
  let cumCash = 0;
  for (let y = 0; y < n; y++) {
    let value = 0;
    for (const f of s.flows) {
      const g = goLive.get(f)!;
      // Monthly value, using the ramp at mid-month.
      for (let m = y * 12; m < y * 12 + 12; m++) value += (f.runRate / 12) * rampAt(f, g, m + 0.5);
    }
    const oneOff = sumKind("one-off", y);
    const running = sumKind("running", y);
    const ownTimeFte = sumKind("own-time", y);
    const ownTimeCost = ownTimeFte * plan.ownTimeRate;
    const cash = oneOff + running;
    const totalCost = cash + ownTimeCost;
    const net = value - totalCost;
    cum += net;
    cumCash += value - cash;
    const runRateEnd = s.flows.reduce((t, f) => t + f.runRate * rampAt(f, goLive.get(f)!, (y + 1) * 12), 0);
    years.push({
      year: plan.startYear + y, oneOff, running, ownTimeFte, ownTimeCost, cash, totalCost,
      valueRealised: value, net, cumulativeNet: cum, cumulativeCashNet: cumCash, runRateEnd, netRunRateEnd: runRateEnd - running,
    });
  }

  const last = years[n - 1];
  const valueAfterPlan = last ? last.runRateEnd - last.running : 0;
  const findPayback = (key: "cumulativeNet" | "cumulativeCashNet") => {
    const hit = years.find((r) => r[key] >= 0 && r.valueRealised > 0);
    if (hit) return hit.year;
    return last ? paybackAfter(last[key], last.year, valueAfterPlan) : null;
  };

  const runRateByHalf = halfYears(plan).map((period, i) => {
    const end = (i + 1) * 6;
    const y = Math.floor(i / 2);
    const rr = s.flows.reduce((t, f) => t + f.runRate * rampAt(f, goLive.get(f)!, end), 0);
    return { period, runRate: rr, netRunRate: rr - (years[y]?.running ?? 0) };
  });

  return {
    years,
    totalCost: years.reduce((t, r) => t + r.totalCost, 0),
    totalCash: years.reduce((t, r) => t + r.cash, 0),
    totalOwnTimeCost: years.reduce((t, r) => t + r.ownTimeCost, 0),
    totalValue: years.reduce((t, r) => t + r.valueRealised, 0),
    netOverPlan: cum,
    valueAfterPlan,
    paybackYear: findPayback("cumulativeNet"),
    paybackYearCash: findPayback("cumulativeCashNet"),
    runRateByHalf,
    flowsLive: s.flows.filter((f) => monthOf(plan, f.goLive) < n * 12).length,
  };
}

/* ---------- drivers and sensitivity ---------- */

/**
 * What-if drivers applied on top of a scenario, for exploring in the room:
 *   value     = every flow's run-rate × valuePct / 100
 *   timing    = every go-live moved delayHalves half-years later (negative = earlier, not before the plan)
 *   ramp      = every ramp × rampPct / 100
 *   costs     = every cash cost line × costPct / 100; own staff FTE × ownTimePct / 100
 */
export interface Drivers {
  valuePct: number;
  delayHalves: number;
  rampPct: number;
  costPct: number;
  ownTimePct: number;
}

export const NEUTRAL_DRIVERS: Drivers = { valuePct: 100, delayHalves: 0, rampPct: 100, costPct: 100, ownTimePct: 100 };

export function shiftHalf(half: HalfYear, by: number, minYear: number): HalfYear {
  const [y, h] = half.split("-H").map(Number);
  const idx = Math.max((minYear) * 2, y * 2 + (h - 1) + by);
  return `${Math.floor(idx / 2)}-H${(idx % 2) + 1}` as HalfYear;
}

export function applyDrivers(plan: Pick<StrategyPlan, "startYear">, s: Scenario, d: Drivers): Scenario {
  return {
    ...s,
    flows: s.flows.map((f) => ({
      ...f,
      runRate: (f.runRate * d.valuePct) / 100,
      goLive: shiftHalf(f.goLive, d.delayHalves, plan.startYear),
      rampMonths: Math.min(60, Math.round((f.rampMonths * d.rampPct) / 100)),
    })),
    costs: s.costs.map((c) => ({ ...c, perYear: c.perYear.map((v) => (v * (c.kind === "own-time" ? d.ownTimePct : d.costPct)) / 100) })),
  };
}

export interface SensitivityRow {
  driver: keyof Drivers;
  label: string;
  lowLabel: string;
  highLabel: string;
  /** Net over the plan with the driver at its low and high setting. */
  low: number;
  high: number;
  /** Largest distance from the base result: the row's weight in a tornado chart. */
  swing: number;
}

/** Each driver moved alone to a pessimistic and an optimistic setting, sorted by how much net over the plan moves. */
export function sensitivity(plan: Pick<StrategyPlan, "startYear" | "years" | "ownTimeRate">, s: Scenario, metric: "netOverPlan" | "valueAfterPlan" = "netOverPlan"): { base: number; rows: SensitivityRow[] } {
  const run = (d: Partial<Drivers>) => computeScenario(plan, applyDrivers(plan, s, { ...NEUTRAL_DRIVERS, ...d }))[metric];
  const base = run({});
  // [driver, label, pessimistic setting, its label, optimistic setting, its label]
  const defs: Array<[keyof Drivers, string, number, string, number, string]> = [
    ["valuePct", "Value per flow", 80, "−20%", 120, "+20%"],
    ["delayHalves", "Go-live timing", 1, "6 months later", -1, "6 months earlier"],
    ["rampPct", "Time to full value", 150, "50% longer", 50, "50% shorter"],
    ["costPct", "Cash costs", 120, "+20%", 80, "−20%"],
    ["ownTimePct", "Own staff time", 120, "+20%", 80, "−20%"],
  ];
  const rows: SensitivityRow[] = defs.map(([driver, label, lo, lowLabel, hi, highLabel]) => {
    const low = run({ [driver]: lo });
    const high = run({ [driver]: hi });
    return { driver, label, lowLabel, highLabel, low, high, swing: Math.max(Math.abs(low - base), Math.abs(high - base)) };
  });
  return { base, rows: rows.sort((a, b) => b.swing - a.swing) };
}

/* ---------- value against ease ---------- */

/**
 * Where a flow sits in the value-against-ease matrix:
 *   value = (value 35/20/5 + waiting 25/15/5 + volume 15/10/3) / 75 × 100   (size of the prize)
 *   ease  = evidence high 85, medium 50, low 15                             (how proven AI is for the work)
 */
export function flowMatrix(s: FlowScores): { value: number; ease: number } {
  const value = ((POINTS.value[s.value] + POINTS.waiting[s.waiting] + POINTS.volume[s.volume]) / 75) * 100;
  const ease = { high: 85, medium: 50, low: 15 }[s.evidence];
  return { value: Math.round(value), ease };
}

/* ---------- one time model ---------- */

/** Months from the plan start to the first day of a month written "YYYY-MM-01" (or "YYYY-MM"). */
export function monthIndex(plan: Pick<StrategyPlan, "startYear">, period: string): number {
  const [y, m] = period.split("-").map(Number);
  return (y - plan.startYear) * 12 + (m - 1);
}

/**
 * Planned value for one calendar month of a flow, following the scenario's go-live and ramp:
 *   plan(month) = value per year / 12 × ramp share at mid-month
 * `perYear` is what the plan is measured in: the scenario's run-rate, or a process's net value case.
 */
export function plannedForMonth(plan: Pick<StrategyPlan, "startYear">, f: Pick<ScenarioFlow, "goLive" | "rampMonths">, perYear: number, period: string): number {
  return (perYear / 12) * rampAt(f as ScenarioFlow, monthOf(plan, f.goLive), monthIndex(plan, period) + 0.5);
}

/** The months ("YYYY-MM-01") of a half-year. */
export function monthsOfHalf(half: HalfYear): string[] {
  const [y, h] = half.split("-H").map(Number);
  return Array.from({ length: 6 }, (_, i) => `${y}-${String((h === 2 ? 7 : 1) + i).padStart(2, "0")}-01`);
}

/** The chosen scenario's entry for a process, through the flow it is linked to. */
export function scenarioFlowForProcess(plan: StrategyPlan, processId: string): { scenario: Scenario; flow: StrategyFlow; entry: ScenarioFlow } | null {
  const scenario = plan.scenarios.find((s) => s.id === plan.chosenScenarioId);
  const flow = plan.flows.find((f) => f.processId === processId);
  if (!scenario || !flow) return null;
  const entry = scenario.flows.find((f) => f.flowId === flow.id);
  return entry ? { scenario, flow, entry } : null;
}

/**
 * A process value case in the scenario's terms, so the two can be compared like for like.
 * The scenario's run-rate is value before programme running costs, and the scenario lists
 * running costs (AI usage, licences) as cost lines. So:
 *   comparable run-rate = labour benefit − oversight
 *   running costs       = AI cost + fixed cost   (belong in the scenario's running costs)
 *   net                 = comparable run-rate − running costs  (= the value case's net)
 */
export function caseInScenarioTerms(vc: Pick<ValueCase, "labourBenefit" | "oversightCost" | "aiCost" | "fixedCost">): { runRate: number; runningCosts: number; net: number } {
  const runRate = vc.labourBenefit - vc.oversightCost;
  const runningCosts = vc.aiCost + vc.fixedCost;
  return { runRate, runningCosts, net: runRate - runningCosts };
}

/** Short money format in millions: 1 250 000 → "1.3". */
export const millions = (v: number) => (v / 1e6).toFixed(Math.abs(v) >= 10e6 ? 0 : 1);

export function emptyPlan(startYear: number, currency = "SEK"): StrategyPlan {
  return {
    currency, startYear, years: 3, ownTimeRate: 900_000, flows: [], scenarios: [], chosenScenarioId: null,
    ambition: DEFAULT_AMBITION(3), decisions: [],
  };
}

/** The five default ambition measures, with no targets set. */
export const DEFAULT_AMBITION = (years: number): AmbitionMeasure[] => [
  { id: "agent-share", name: "Share of the work in redesigned flows carried by agents", unit: "%", targets: Array(years).fill(null) },
  { id: "flows-live", name: "Flows redesigned and in daily operation", unit: "flows", targets: Array(years).fill(null) },
  { id: "capacity", name: "More volume handled with today's team", unit: "%", targets: Array(years).fill(null) },
  { id: "redeployed", name: "Roles redeployed to new work", unit: "people", targets: Array(years).fill(null) },
  { id: "net-value", name: "Net value per year, run-rate at year end", unit: "MSEK", targets: Array(years).fill(null) },
];
