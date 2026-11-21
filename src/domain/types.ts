/**
 * Core domain model for Value Loop.
 *
 * Every module (redesign, agent fit, value case, monitoring) reads and writes
 * the same objects: Process → Step → Actor (lane) → Autonomy → Metrics → Value.
 * Nothing here is specific to customer service; templates supply the content.
 */

/** L0 manual · L1 assist · L2 draft & approve · L3 act & escalate · L4 autonomous */
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

/** Who performs a step in the to-be design. Derived from autonomy, see `laneOf`. */
export type Lane = "human" | "agent" | "system";

export type Rating = "low" | "medium" | "high";

/** Process stage, shown as a route: Find (Hitta) → Build (Bygga) → Run (Driva). */
export type Stage = "not-started" | "find" | "build" | "run";

/** Gate status before the next stage, shown as a traffic light. */
export type Gate = "red" | "amber" | "green";

export interface FitFactors {
  volume: Rating;
  ruleBased: Rating;
  dataReady: Rating;
  errorRisk: Rating;
}

export interface StepDefinition {
  id: string;
  name: string;
  description: string;
  /** Human handling time per case in the as-is process. */
  minutesPerCase: number;
  fit: FitFactors;
}

export interface Assumptions {
  casesPerMonth: number;
  /** Fully loaded cost per staff hour, SEK. */
  costPerHour: number;
  /** Agent resolution quality in percent; 80 is the template's reference. */
  agentQuality: number;
  /** Human oversight cost as a percent of the labour saving. */
  oversightShare: number;
  /** AI usage cost per agent-led step and case, SEK. Assisted steps cost half. */
  aiCostPerStepCase: number;
  /** Licences and run cost per year, SEK. */
  fixedCostPerYear: number;
}

/** The to-be design of a process: an autonomy level per step. */
export interface ProcessDesign {
  levels: Record<string, AutonomyLevel>;
  /** Steps at L4 that run as rule-based systems rather than AI agents. */
  systemSteps: string[];
}

export interface ProcessTemplate {
  id: string;
  name: string;
  summary: string;
  version: string;
  /** What one case is called in this process, e.g. "contact" or "invoice". */
  unit: string;
  steps: StepDefinition[];
  defaultDesign: ProcessDesign;
  defaultAssumptions: Assumptions;
  agentPatterns: string[];
  kpis: string[];
}

export interface StepValue {
  step: StepDefinition;
  level: AutonomyLevel;
  lane: Lane;
  automatedShare: number;
  hoursReleased: number;
}

export interface ValueCase {
  steps: StepValue[];
  hoursReleased: number;
  labourBenefit: number;
  oversightCost: number;
  aiCost: number;
  fixedCost: number;
  net: number;
  /** Simple range until simulation replaces it (phase 2). */
  low: number;
  high: number;
  stepsDoneByPeople: number;
  asIsHours: number;
}

export interface Baseline {
  approvedAt: string;
  approvedBy: string;
  net: number;
  design: ProcessDesign;
  assumptions: Assumptions;
}

export type Role = "advisor" | "customer-admin" | "process-owner" | "viewer";
