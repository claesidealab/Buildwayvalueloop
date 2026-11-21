import { AUTOMATION_SHARE, laneOf } from "./autonomy";
import type { Assumptions, ProcessDesign, StepDefinition, StepValue, ValueCase } from "./types";

/** Reference quality the automation shares are calibrated against. */
const REFERENCE_QUALITY = 80;
const MAX_SHARE = 0.98;

const share = (s: StepDefinition) => (s.caseShare ?? 100) / 100;
const phase = (s: StepDefinition) => s.phase ?? "both";

/**
 * Deterministic value case for a to-be design.
 *
 *   minutes per case today  = Σ over today's steps (both, as-is) of minutes × case share
 *   minutes per case after  = Σ over redesigned steps (both, to-be) of minutes × case share × (1 − automated share)
 *   hours released          = cases/yr × (today − after) / 60
 *   labour benefit          = hours × cost per hour
 *   oversight               = labour benefit × oversight share
 *   AI cost                 = cases/yr × Σ (case share × [1 agent-led | 0.5 assisted]) × cost per step and case
 *   net                     = labour benefit − oversight − AI cost − fixed cost
 *
 * A step removed in the redesign saves all its time; a new manual step adds time.
 * Agent-led steps (L3+, not systems) scale with agent quality. The range is
 * net −25% / +15% of the labour benefit until simulation replaces it.
 */
export function computeValueCase(steps: StepDefinition[], design: ProcessDesign, a: Assumptions): ValueCase {
  const casesPerYear = a.casesPerMonth * 12;
  const toHours = (minutesPerCase: number) => (casesPerYear * minutesPerCase) / 60;
  let aiUnits = 0;
  let stepsDoneByPeople = 0;

  const perStep: StepValue[] = steps.map((step) => {
    const p = phase(step);
    const sh = share(step);
    const before = p === "to-be" ? 0 : step.minutesPerCase * sh;

    if (p === "as-is") {
      return { step, level: 0, lane: "human", status: "removed", automatedShare: 1, hoursReleased: toHours(before) };
    }

    const level = design.levels[step.id] ?? 0;
    const lane = laneOf(step.id, level, design);
    let automatedShare = AUTOMATION_SHARE[level];
    if (lane === "agent") automatedShare = Math.min(MAX_SHARE, (automatedShare * a.agentQuality) / REFERENCE_QUALITY);
    const after = step.minutesPerCase * sh * (1 - automatedShare);

    if (lane === "agent") aiUnits += sh;
    else if (lane === "human" && level > 0) aiUnits += 0.5 * sh;
    if (lane === "human") stepsDoneByPeople += 1;

    return { step, level, lane, status: p === "to-be" ? "added" : "kept", automatedShare, hoursReleased: toHours(before - after) };
  });

  const hoursReleased = perStep.reduce((t, s) => t + s.hoursReleased, 0);
  const labourBenefit = hoursReleased * a.costPerHour;
  // Oversight is a share of a saving; there is nothing to oversee when the redesign adds work.
  const oversightCost = Math.max(0, (labourBenefit * a.oversightShare) / 100);
  const aiCost = casesPerYear * aiUnits * a.aiCostPerStepCase;
  const fixedCost = a.fixedCostPerYear;
  const net = labourBenefit - oversightCost - aiCost - fixedCost;
  const spread = Math.abs(labourBenefit);

  return {
    steps: perStep,
    hoursReleased,
    labourBenefit,
    oversightCost,
    aiCost,
    fixedCost,
    net,
    low: net - 0.25 * spread,
    high: net + 0.15 * spread,
    stepsDoneByPeople,
    asIsHours: toHours(steps.filter((s) => phase(s) !== "to-be").reduce((t, s) => t + s.minutesPerCase * share(s), 0)),
  };
}

/** Steps in the order they appear on the canvas (by x, then by original order). */
export function orderedSteps<T extends StepDefinition>(steps: T[]): T[] {
  return steps.map((s, i) => ({ s, i })).sort((a, b) => (a.s.x ?? a.i * 1000) - (b.s.x ?? b.i * 1000) || a.i - b.i).map((x) => x.s);
}

export const formatMSEK = (sek: number) => (sek / 1e6).toFixed(1);
export const formatInt = (n: number) => Math.round(n).toLocaleString("en-US");
