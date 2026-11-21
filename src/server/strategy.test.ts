import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "./db";
import { createTestDb } from "./test-db";
import { workspaces } from "./db/schema";
import { ConflictError, ensureAdvisor, EXAMPLE_WORKSPACE as WS, getWorkspaceState, listActivity, NotFoundError, seedExample } from "./repo";
import { createProcessFromFlow, getStrategy, recordDecision, saveStrategy } from "./strategy-repo";
import { buildUserMessage, discoverFlows, toSuggestedFlows, type DiscoveryClient, type Suggestions } from "./discovery";
import { planSchema } from "./strategy-schema";
import { describe as d2 } from "vitest";

d2("gate checks in saved plans", () => {
  it("accepts a measurable gate and rejects a malformed one", () => {
    const p = examplePlan();
    const g = p.scenarios[0].gates[0] ?? { id: "g", period: "2027-H2", criterion: "x", status: "open" as const };
    const withCheck = { ...p, scenarios: [{ ...p.scenarios[0], gates: [{ ...g, check: { processId: "customer-service", metric: "value_vs_plan", op: "gte", target: 80 } }] }] };
    expect(planSchema.safeParse(withCheck).success).toBe(true);
    const bad = { ...p, scenarios: [{ ...p.scenarios[0], gates: [{ ...g, check: { processId: "customer-service", metric: "value_vs_plan", op: "about", target: 80 } }] }] };
    expect(planSchema.safeParse(bad).success).toBe(false);
  });
});
import { examplePlan } from "@/templates/strategy-example";

let db: DB;
let advisor: string;

beforeEach(async () => {
  db = await createTestDb();
  await seedExample(db);
  advisor = await ensureAdvisor(db);
});

describe("strategy storage", () => {
  it("starts the example workspace from the example plan, and others from an empty plan", async () => {
    const { plan, version } = await getStrategy(db, WS);
    expect(version).toBe(1);
    expect(plan.isExample).toBe(true);
    expect(plan.scenarios.map((s) => s.id)).toEqual(["ai-added", "conservative", "base", "ambitious"]);
    expect(plan.currency).toBe("SEK");

    await db.insert(workspaces).values({ slug: "real", name: "Real AB" });
    const empty = await getStrategy(db, "real");
    expect(empty.plan.flows).toEqual([]);
    expect(empty.plan.ambition).toHaveLength(5);
  });

  it("saves with a version check and rejects stale saves", async () => {
    const { plan, version } = await getStrategy(db, WS);
    const saved = await saveStrategy(db, WS, { ...plan, currency: "EUR" }, version, advisor);
    expect(saved.version).toBe(2);
    expect((await getStrategy(db, WS)).plan.currency).toBe("EUR");
    await expect(saveStrategy(db, WS, { ...plan, currency: "NOK" }, version, advisor)).rejects.toBeInstanceOf(ConflictError);
  });

  it("keeps decisions append-only: a save can't remove them", async () => {
    await recordDecision(db, WS, { kind: "scenario", attendees: "CEO, CFO", text: "We plan on the base scenario." }, advisor);
    const { plan, version } = await getStrategy(db, WS);
    expect(plan.decisions).toHaveLength(1);
    expect(plan.decisions[0]).toMatchObject({ kind: "scenario", attendees: "CEO, CFO", recordedBy: "Buildway advisor" });
    await saveStrategy(db, WS, { ...plan, decisions: [] }, version, advisor);
    expect((await getStrategy(db, WS)).plan.decisions).toHaveLength(1);
    expect((await listActivity(db, WS))[0].action).toBe("strategy.decision");
  });

  it("creates an empty, mappable process for a flow and links it", async () => {
    const { processId, stored } = await createProcessFromFlow(db, WS, "order-to-cash", advisor);
    expect(processId).toBe("order-to-cash");
    expect(stored.plan.flows.find((f) => f.id === "order-to-cash")?.processId).toBe("order-to-cash");
    const p = (await getWorkspaceState(db, WS)).processes.find((x) => x.id === processId)!;
    expect(p).toMatchObject({ name: "Order to cash", stage: "find", hasDraft: true });
    expect(p.steps).toEqual([]);
    await expect(createProcessFromFlow(db, WS, "order-to-cash", advisor)).rejects.toBeInstanceOf(ConflictError);
    await expect(createProcessFromFlow(db, WS, "nope", advisor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("accepts the example plan in its own validation schema", () => {
    expect(planSchema.safeParse(examplePlan()).success).toBe(true);
  });
});

describe("AI discovery", () => {
  const answer: Suggestions = {
    flows: [
      { name: "Order to Cash", area: "Sales, Finance", description: "Order to payment.", owner: "CFO", isNew: false, scores: { value: "high", evidence: "medium", waiting: "high", volume: "high" }, rationale: "Orders are retyped." },
      { name: "Supplier onboarding", area: "Procurement", description: "New supplier to first order.", owner: "Head of Procurement", isNew: false, scores: { value: "low", evidence: "low", waiting: "medium", volume: "low" }, rationale: "Few cases." },
    ],
  };

  it("adds the suggested decision and flags duplicates of existing flows", () => {
    const out = toSuggestedFlows(answer, ["Order to cash", "Request to resolution"]);
    expect(out[0]).toMatchObject({ decision: "redesign", duplicateOf: "Order to cash" });
    expect(out[1]).toMatchObject({ decision: "leave", duplicateOf: null });
  });

  it("sends the material and the known flows, and returns parsed suggestions", async () => {
    let sent: { model: string; system?: unknown; messages: Array<{ content: unknown }> } | null = null;
    const fake = { beta: { messages: { parse: async (params: never) => { sent = params; return { stop_reason: "end_turn", parsed_output: answer }; } } } } as unknown as DiscoveryClient;
    const out = await discoverFlows("We are a services company with long order handling times.", ["Request to resolution"], fake);
    expect(out).toHaveLength(2);
    expect(sent!.model).toBe("claude-opus-5-5");
    expect(String(sent!.messages[0].content)).toContain("Request to resolution");
    expect(buildUserMessage("x", [])).toBe("<material>\nx\n</material>");
  });

  it("explains a refusal instead of returning nothing", async () => {
    const fake = { beta: { messages: { parse: async () => ({ stop_reason: "refusal", parsed_output: null }) } } } as unknown as DiscoveryClient;
    await expect(discoverFlows("Some text about the company and its processes.", [], fake)).rejects.toThrow(/declined/);
  });
});

import { draftMap, toMapDraft, type Draft } from "./process-draft";

describe("AI-drafted as-is map", () => {
  const fit = { volume: "high", ruleBased: "medium", dataReady: "medium", errorRisk: "low" } as const;
  const answer: Draft = {
    unit: " invoice ",
    steps: [
      { name: "Receive invoice", description: "Arrives by email.", minutesPerCase: 1, caseShare: 100, fit, note: "" },
      { name: "Check", description: "Match to order.", minutesPerCase: 5000, caseShare: 140, fit, note: "Estimate" },
      { name: "Approve", description: "Manager approves.", minutesPerCase: 2, caseShare: 30, fit, note: "" },
    ],
    branches: [{ from: 0, to: 2 }, { from: 1, to: 1 }, { from: 0, to: 9 }],
  };

  it("cleans the draft and adds the sequence plus valid branches", () => {
    const d = toMapDraft(answer);
    expect(d.unit).toBe("invoice");
    expect(d.steps[1]).toMatchObject({ minutesPerCase: 1440, caseShare: 100 });
    expect(d.edges).toEqual([[0, 1], [1, 2], [0, 2]]);
  });

  it("calls Claude with the material and returns the cleaned draft", async () => {
    let sent: { model: string; messages: Array<{ content: unknown }> } | undefined;
    const fake = { beta: { messages: { parse: async (params: never) => { sent = params; return { stop_reason: "end_turn", parsed_output: answer }; } } } } as unknown as DiscoveryClient;
    const d = await draftMap("Invoices arrive by email and are checked against the order.", "Invoice handling", fake);
    expect(d.steps).toHaveLength(3);
    expect(sent!.model).toBe("claude-opus-5-5");
    expect(String(sent!.messages[0].content)).toContain("Invoice handling");
  });

  it("explains how to turn it on without a key", async () => {
    const key = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    const tok = process.env.ANTHROPIC_AUTH_TOKEN; delete process.env.ANTHROPIC_AUTH_TOKEN;
    await expect(draftMap("x".repeat(50), "P")).rejects.toThrow(/ANTHROPIC_API_KEY/);
    if (key) process.env.ANTHROPIC_API_KEY = key;
    if (tok) process.env.ANTHROPIC_AUTH_TOKEN = tok;
  });
});
