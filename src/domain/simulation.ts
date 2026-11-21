/**
 * Light simulation of a redesigned process: what happens to the people's queue, and how wide
 * the value range really is. Deterministic for a given seed.
 *
 * Workload (minutes of people's time per case):
 *   today      = Σ today's steps of minutes × case share
 *   after      = Σ redesigned steps of minutes × case share × (1 − automated share)
 *              + escalation rework: Σ agent steps of minutes × case share × automated share × escalation rate
 *
 * Queue (Erlang C, one pooled team, arrivals spread over working hours):
 *   arrivals / hour  = cases per month × (1 + peak) ÷ (working days × hours per day)
 *   load (Erlangs)   = arrivals / hour × workload / 60
 *   P(wait)          = Erlang C(load, people); average wait = P(wait) × workload ÷ (people − load)
 *   within target    = 1 − P(wait) × e^(−(people − load) × target ÷ workload)
 *   utilisation      = load ÷ people (≥ 100% means the queue grows without limit)
 *
 * Value range (Monte Carlo, 1000 runs): agent quality ±10 points, volume ±15%, escalation rate
 * ±50% of its setting, each uniform; every run computes the value case and subtracts the
 * escalation rework at the cost per hour. P10, P50 and P90 of net value per year.
 */
import { computeValueCase } from "./value-model";
import type { Assumptions, ProcessDesign, StepDefinition } from "./types";

export interface SimInput {
  /** Share of agent-handled cases handed back to a person, 0–100. */
  escalationPct: number;
  /** Extra volume in the busiest month, 0–100. */
  peakPct: number;
  /** People working the queue (FTE) after the redesign. */
  people: number;
  /** Answer target in minutes, for the share answered within target. */
  targetMinutes: number;
  workingDays?: number;
  hoursPerDay?: number;
}

export interface QueueResult {
  workloadMinutes: number;
  load: number;
  utilisation: number;
  stable: boolean;
  /** Average wait in minutes; null when the queue grows without limit. */
  avgWaitMinutes: number | null;
  withinTarget: number | null;
}

export interface SimResult {
  today: QueueResult;
  after: QueueResult;
  /** People needed today at the same utilisation as after, for comparison. */
  peopleToday: number;
  escalationHoursPerYear: number;
  range: { p10: number; p50: number; p90: number };
}

const share = (s: StepDefinition) => (s.caseShare ?? 100) / 100;

/** Erlang C probability that a case waits, computed without factorial overflow. */
export function erlangC(load: number, servers: number): number {
  if (servers <= 0) return 1;
  if (load >= servers) return 1;
  let term = 1, sum = 1; // k = 0
  for (let k = 1; k < servers; k++) { term *= load / k; sum += term; }
  const last = term * (load / servers) * (servers / (servers - load));
  return last / (sum + last);
}

export function queue(casesPerMonth: number, workloadMinutes: number, people: number, s: Pick<SimInput, "peakPct" | "targetMinutes" | "workingDays" | "hoursPerDay">): QueueResult {
  const hours = (s.workingDays ?? 21) * (s.hoursPerDay ?? 8);
  const perHour = (casesPerMonth * (1 + s.peakPct / 100)) / hours;
  const load = (perHour * workloadMinutes) / 60;
  const c = Math.max(0, Math.round(people));
  const stable = load < c && workloadMinutes > 0;
  if (workloadMinutes <= 0) return { workloadMinutes, load: 0, utilisation: 0, stable: true, avgWaitMinutes: 0, withinTarget: 1 };
  if (!stable) return { workloadMinutes, load, utilisation: c ? load / c : Infinity, stable: false, avgWaitMinutes: null, withinTarget: null };
  const pw = erlangC(load, c);
  return {
    workloadMinutes, load, utilisation: load / c, stable: true,
    avgWaitMinutes: (pw * workloadMinutes) / (c - load),
    withinTarget: 1 - pw * Math.exp((-(c - load) * s.targetMinutes) / workloadMinutes),
  };
}

/** Minutes of people's time per case today and after the redesign, with escalation rework. */
export function workload(steps: StepDefinition[], design: ProcessDesign, a: Assumptions, escalationPct: number) {
  const vc = computeValueCase(steps, design, a);
  const today = steps.filter((s) => (s.phase ?? "both") !== "to-be").reduce((t, s) => t + s.minutesPerCase * share(s), 0);
  let after = 0, rework = 0;
  for (const sv of vc.steps) {
    if (sv.status === "removed") continue;
    after += sv.step.minutesPerCase * share(sv.step) * (1 - sv.automatedShare);
    if (sv.lane === "agent") rework += sv.step.minutesPerCase * share(sv.step) * sv.automatedShare * (escalationPct / 100);
  }
  return { vc, today, after: after + rework, rework };
}

/** Small deterministic random generator (mulberry32). */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];

export function simulate(steps: StepDefinition[], design: ProcessDesign, a: Assumptions, input: SimInput, seed = 1, runs = 1000): SimResult {
  const w = workload(steps, design, a, input.escalationPct);
  const after = queue(a.casesPerMonth, w.after, input.people, input);
  // Staff today at the utilisation the redesign runs at (or 85% if that is unstable), for comparison.
  const targetUtil = after.stable && after.utilisation > 0 ? after.utilisation : 0.85;
  const todayLoad = queue(a.casesPerMonth, w.today, 1, input).load;
  const peopleToday = Math.max(1, Math.ceil(todayLoad / targetUtil));
  const today = queue(a.casesPerMonth, w.today, peopleToday, input);
  const escalationHoursPerYear = (a.casesPerMonth * 12 * w.rework) / 60;

  const r = rng(seed);
  const nets: number[] = [];
  for (let i = 0; i < runs; i++) {
    const q = Math.min(100, Math.max(0, a.agentQuality + (r() * 2 - 1) * 10));
    const vol = a.casesPerMonth * (1 + (r() * 2 - 1) * 0.15);
    const esc = Math.max(0, input.escalationPct * (1 + (r() * 2 - 1) * 0.5));
    const aa = { ...a, agentQuality: q, casesPerMonth: vol };
    const ww = workload(steps, design, aa, esc);
    nets.push(ww.vc.net - ((vol * 12 * ww.rework) / 60) * a.costPerHour);
  }
  nets.sort((x, y) => x - y);
  return { today, after, peopleToday, escalationHoursPerYear, range: { p10: quantile(nets, 0.1), p50: quantile(nets, 0.5), p90: quantile(nets, 0.9) } };
}
