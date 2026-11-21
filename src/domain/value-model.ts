import { AUTOMATION_SHARE, laneOf } from "./autonomy";
import type { Assumptions, ProcessDesign, StepDefinition, StepValue, ValueCase } from "./types";

/** Reference quality the automation shares are calibrated against. */
const REFERENCE_QUALITY = 80;
const MAX_SHARE = 0.98;

/**
 * Deterministic value case for a to-be design.
 *
 *   hours released = cases/yr × Σ (minutes × automated share) / 60
 *   labour benefit = hours × cost per hour
 *   oversight      = labour benefit × oversight share
 *   AI cost        = cases/yr × (agent-led steps + 0.5 × assisted steps) × cost per step and case
 *   net            = labour benefit − oversight − AI cost − fixed cost
 *
 * Agent-led steps (L3+, not systems) scale with agent quality. The range is
 * net −25% / +15% of the labour benefit until simulation replaces it.
 */
export function computeValueCase(steps: StepDefinition[], design: ProcessDesign, a: Assumptions): ValueCase {
  const casesPerYear = a.casesPerMonth * 12;
  let aiUnits = 0;
  let stepsDoneByPeople = 0;

  const perStep: StepValue[] = steps.map((step) => {
    const level = design.levels[step.id] ?? 0;
    const lane = laneOf(step.id, level, design);
    let automatedShare = AUTOMATION_SHARE[level];
    if (lane === "agent") automatedShare = Math.min(MAX_SHARE, (automatedShare * a.agentQuality) / REFERENCE_QUALITY);

    if (lane === "agent") aiUnits += 1;
    else if (lane === "human" && level > 0) aiUnits += 0.5;
    if (lane === "human") stepsDoneByPeople += 1;

    return { step, level, lane, automatedShare, hoursReleased: (casesPerYear * step.minutesPerCase * automatedShare) / 60 };
  });

  const hoursReleased = perStep.reduce((t, s) => t + s.hoursReleased, 0);
  const labourBenefit = hoursReleased * a.costPerHour;
  const oversightCost = (labourBenefit * a.oversightShare) / 100;
  const aiCost = casesPerYear * aiUnits * a.aiCostPerStepCase;
  const fixedCost = a.fixedCostPerYear;
  const net = labourBenefit - oversightCost - aiCost - fixedCost;

  return {
    steps: perStep,
    hoursReleased,
    labourBenefit,
    oversightCost,
    aiCost,
    fixedCost,
    net,
    low: net - 0.25 * labourBenefit,
    high: net + 0.15 * labourBenefit,
    stepsDoneByPeople,
    asIsHours: (casesPerYear * steps.reduce((t, s) => t + s.minutesPerCase, 0)) / 60,
  };
}

export const formatMSEK = (sek: number) => (sek / 1e6).toFixed(1);
export const formatInt = (n: number) => Math.round(n).toLocaleString("en-US");
