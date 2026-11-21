/**
 * Agent registry: every step that an AI agent carries (L3 or higher, not a rule-based system)
 * is an agent. The registry adds who owns it, where it runs, its status and risk class, a
 * monthly budget and token prices for costing telemetry.
 *
 *   cost this month   = agent_cost_sek for the latest month with data (telemetry or CSV)
 *   cost per run      = cost this month ÷ agent_runs that month
 *   over budget       = cost this month > monthly budget (when a budget is set)
 */
import type { ActualPoint } from "./actuals";
import type { Lane } from "./types";

export type AgentStatus = "planned" | "shadow" | "live" | "paused";
export type AgentRisk = "minimal" | "limited" | "high";

export const AGENT_STATUSES: Array<{ s: AgentStatus; label: string }> = [
  { s: "planned", label: "Planned" },
  { s: "shadow", label: "Shadow mode" },
  { s: "live", label: "Live" },
  { s: "paused", label: "Paused" },
];
export const AGENT_RISKS: Array<{ r: AgentRisk; label: string }> = [
  { r: "minimal", label: "Minimal" },
  { r: "limited", label: "Limited (transparency duties)" },
  { r: "high", label: "High (EU AI Act Annex III)" },
];
export const PLATFORMS = ["Microsoft Copilot Studio", "Salesforce Agentforce", "ServiceNow AI Agents", "Claude (Anthropic)", "OpenAI", "Google Vertex AI", "In-house", "Other"];

export interface AgentRecord {
  /** Step key; one agent per step. */
  step: string;
  name: string;
  platform: string;
  owner: string;
  model: string;
  status: AgentStatus;
  risk: AgentRisk;
  /** Budget per month in the workspace currency; null = not set. */
  monthlyBudget: number | null;
  /** Price per million input and output tokens, for costing telemetry; null = not set. */
  priceIn: number | null;
  priceOut: number | null;
}

export function defaultAgent(step: { id: string; name: string }): AgentRecord {
  return { step: step.id, name: `${step.name} agent`, platform: "", owner: "", model: "", status: "planned", risk: "minimal", monthlyBudget: null, priceIn: null, priceOut: null };
}

export interface AgentRow extends AgentRecord {
  stepName: string;
  level: number;
  registered: boolean;
  latest: { period: string; cost?: number; runs?: number; success?: number; escalation?: number } | null;
  costPerRun: number | null;
  overBudget: boolean;
}

/** The registry for one process: agent-lane steps, with stored records where they exist and the latest figures. */
export function agentRows(
  steps: Array<{ step: { id: string; name: string }; lane: Lane; level: number }>,
  records: AgentRecord[],
  actuals: ActualPoint[],
): AgentRow[] {
  return steps.filter((s) => s.lane === "agent").map((s) => {
    const rec = records.find((r) => r.step === s.step.id);
    const base = rec ?? defaultAgent(s.step);
    const mine = actuals.filter((a) => a.step === s.step.id);
    const last = [...new Set(mine.map((a) => a.period))].sort().at(-1);
    const at = (m: string) => mine.find((a) => a.period === last && a.metric === m)?.value;
    const latest = last ? { period: last, cost: at("agent_cost_sek"), runs: at("agent_runs"), success: at("success_rate"), escalation: at("escalation_rate") } : null;
    const costPerRun = latest?.cost !== undefined && latest.runs ? latest.cost / latest.runs : null;
    const overBudget = base.monthlyBudget !== null && latest?.cost !== undefined && latest.cost > base.monthlyBudget;
    return { ...base, stepName: s.step.name, level: s.level, registered: !!rec, latest, costPerRun, overBudget };
  });
}
