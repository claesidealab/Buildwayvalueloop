import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "./db";
import { createTestDb } from "./test-db";
import { workspaces } from "./db/schema";
import { ConflictError, ensureAdvisor, EXAMPLE_WORKSPACE as WS, getWorkspaceState, listActivity, NotFoundError, seedExample } from "./repo";
import { createProcessFromFlow, getStrategy, recordDecision, saveStrategy } from "./strategy-repo";
import { buildUserMessage, discoverFlows, toSuggestedFlows, type DiscoveryClient, type Suggestions } from "./discovery";
import { planSchema } from "./strategy-schema";
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
