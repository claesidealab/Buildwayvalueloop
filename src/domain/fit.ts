import type { AutonomyLevel, FitFactors, Rating } from "./types";

const POINTS = {
  volume: { high: 25, medium: 15, low: 5 },
  ruleBased: { high: 30, medium: 18, low: 6 },
  dataReady: { high: 25, medium: 15, low: 5 },
  // Lower error risk is better for an agent.
  errorRisk: { low: 20, medium: 10, high: 0 },
} satisfies Record<keyof FitFactors, Record<Rating, number>>;

/** 0–100: how well a step suits an AI agent. */
export function fitScore(f: FitFactors): number {
  return POINTS.volume[f.volume] + POINTS.ruleBased[f.ruleBased] + POINTS.dataReady[f.dataReady] + POINTS.errorRisk[f.errorRisk];
}

/** Suggested autonomy from the fit score. High error risk caps the suggestion at L2. */
export function suggestedLevel(f: FitFactors): AutonomyLevel {
  const s = fitScore(f);
  const level: AutonomyLevel = s >= 90 ? 4 : s >= 70 ? 3 : s >= 50 ? 2 : s >= 30 ? 1 : 0;
  return f.errorRisk === "high" ? (Math.min(level, 2) as AutonomyLevel) : level;
}

/** Whether a factor counts for or against an agent, for colouring in the UI. */
export function factorTone(factor: keyof FitFactors, rating: Rating): "good" | "neutral" | "poor" {
  const best = factor === "errorRisk" ? "low" : "high";
  const worst = factor === "errorRisk" ? "high" : "low";
  return rating === best ? "good" : rating === worst ? "poor" : "neutral";
}
