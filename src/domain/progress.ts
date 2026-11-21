/**
 * Where a process is on its route, derived from what has happened rather than set by hand.
 *
 *   stage = the furthest of: the stored stage, find (has steps), build (baseline approved),
 *           run (actuals uploaded)
 *   gate  = with actuals: green when realised ≥ 90% of plan to date, amber ≥ 70%, red below;
 *           without actuals: the stored light
 */
import type { Gate, Stage } from "./types";
import { computeValueCase } from "./value-model";
import { plannedForMonth, scenarioFlowForProcess, type ScenarioFlow, type StrategyPlan } from "./strategy";
import type { Assumptions, Baseline, ProcessDesign, StepDefinition } from "./types";

const ORDER: Stage[] = ["not-started", "find", "build", "run"];

export function effectiveStage(stored: Stage, p: { stepCount: number; hasBaseline: boolean; hasActuals: boolean }): Stage {
  const derived: Stage = p.hasActuals ? "run" : p.hasBaseline ? "build" : p.stepCount > 0 ? "find" : "not-started";
  return ORDER[Math.max(ORDER.indexOf(stored), ORDER.indexOf(derived))];
}

export function gateFromRealised(stored: Gate, realisedShare: number | null): Gate {
  if (realisedShare === null) return stored;
  return realisedShare >= 0.9 ? "green" : realisedShare >= 0.7 ? "amber" : "red";
}

/* ---------- what a process is measured against ---------- */


export interface MeasureBasis {
  /** Net value per year: the approved baseline, else the current value case. */
  net: number;
  aiCost: number;
  assumptions: Assumptions;
  /** Steps carried by agents in the measured design; their telemetry costs can stand in for the AI cost. */
  agentSteps: string[];
  /** Go-live and ramp from the chosen scenario, when the process is in it. */
  entry: Pick<ScenarioFlow, "goLive" | "rampMonths"> | null;
  scenarioName: string | null;
  /** Planned value for a month "YYYY-MM-01": net / 12, following the scenario ramp when there is one. */
  planFor: (period: string) => number;
}

/** One plan for a process, used by the monitor, the overview and gate checks alike. */
export function measureBasis(
  p: { id: string; steps: StepDefinition[]; design: ProcessDesign; assumptions: Assumptions; baseline: Baseline | null },
  strategy: StrategyPlan | null,
): MeasureBasis {
  const assumptions = p.baseline?.assumptions ?? p.assumptions;
  const vc = computeValueCase(p.baseline?.steps ?? p.steps, p.baseline?.design ?? p.design, assumptions);
  const net = p.baseline?.net ?? vc.net;
  const link = strategy ? scenarioFlowForProcess(strategy, p.id) : null;
  const entry = link ? { goLive: link.entry.goLive, rampMonths: link.entry.rampMonths } : null;
  return {
    net, aiCost: vc.aiCost, assumptions, agentSteps: vc.steps.filter((s) => s.lane === "agent").map((s) => s.step.id), entry, scenarioName: link?.scenario.name ?? null,
    planFor: (period) => (entry && strategy ? plannedForMonth(strategy, entry, net, period) : net / 12),
  };
}
