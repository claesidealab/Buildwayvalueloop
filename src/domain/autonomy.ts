import type { AutonomyLevel, Lane, ProcessDesign } from "./types";

export const AUTONOMY_LEVELS: ReadonlyArray<{ level: AutonomyLevel; name: string; short: string; description: string }> = [
  { level: 0, name: "Manual", short: "Manual", description: "People do the work." },
  { level: 1, name: "Assist", short: "Assist", description: "AI suggests, a person acts." },
  { level: 2, name: "Draft & approve", short: "Draft", description: "AI prepares, a person approves." },
  { level: 3, name: "Act & escalate", short: "Act", description: "AI acts, people handle exceptions." },
  { level: 4, name: "Autonomous", short: "Autonomous", description: "AI owns the step, people monitor." },
];

/** Share of the step's human handling time removed at each level, before quality adjustment. */
export const AUTOMATION_SHARE: Record<AutonomyLevel, number> = { 0: 0, 1: 0.2, 2: 0.45, 3: 0.7, 4: 0.9 };

/**
 * L0–L2: a person does or approves the work (with AI help from L1).
 * L3–L4: an AI agent does it. L4 steps flagged as systems run as rule-based automation.
 */
export function laneOf(stepId: string, level: AutonomyLevel, design: Pick<ProcessDesign, "systemSteps">): Lane {
  if (level >= 4 && design.systemSteps.includes(stepId)) return "system";
  return level >= 3 ? "agent" : "human";
}

export function isAutonomyLevel(n: number): n is AutonomyLevel {
  return Number.isInteger(n) && n >= 0 && n <= 4;
}
