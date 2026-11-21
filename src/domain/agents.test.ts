import { describe, expect, it } from "vitest";
import { agentRows, defaultAgent, type AgentRecord } from "./agents";

const steps = [
  { step: { id: "triage", name: "Triage" }, lane: "agent" as const, level: 4 },
  { step: { id: "identify", name: "Identify" }, lane: "system" as const, level: 4 },
  { step: { id: "escalate", name: "Escalate" }, lane: "human" as const, level: 2 },
];

describe("agentRows", () => {
  it("lists only agent-lane steps, with defaults until registered", () => {
    const rows = agentRows(steps, [], []);
    expect(rows.map((r) => r.step)).toEqual(["triage"]);
    expect(rows[0]).toMatchObject({ name: "Triage agent", status: "planned", registered: false, latest: null, overBudget: false });
  });

  it("uses the stored record and the latest month's figures for cost per run and budget", () => {
    const rec: AgentRecord = { ...defaultAgent({ id: "triage", name: "Triage" }), name: "Router", status: "live", monthlyBudget: 1000 };
    const rows = agentRows(steps, [rec], [
      { period: "2027-01-01", metric: "agent_cost_sek", step: "triage", value: 500 },
      { period: "2027-02-01", metric: "agent_cost_sek", step: "triage", value: 1200 },
      { period: "2027-02-01", metric: "agent_runs", step: "triage", value: 400 },
      { period: "2027-02-01", metric: "success_rate", step: "triage", value: 96 },
    ]);
    expect(rows[0]).toMatchObject({ name: "Router", registered: true, overBudget: true, costPerRun: 3 });
    expect(rows[0].latest).toMatchObject({ period: "2027-02-01", cost: 1200, runs: 400, success: 96 });
  });
});
