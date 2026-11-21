/**
 * AI-assisted discovery: Claude reads a description of the company, interview notes or
 * process documents and suggests cross-department flows to put in the inventory, scored with
 * the same rule people use (value, evidence, waiting, volume). People review every suggestion
 * before it is added.
 *
 * Needs ANTHROPIC_API_KEY (or another credential the Anthropic SDK finds). Without one the
 * endpoint answers 503 and the screen explains how to turn it on.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { suggestedDecision, type FlowDecision, type FlowScores } from "@/domain/strategy";

export class DiscoveryUnavailableError extends Error {}
export class DiscoveryDeclinedError extends Error {}

const rating = z.enum(["low", "medium", "high"]);

export const SuggestionsSchema = z.object({
  flows: z.array(z.object({
    name: z.string().describe("Short flow name from start to end, e.g. 'Order to cash'"),
    area: z.string().describe("Departments the flow runs through, comma-separated"),
    description: z.string().describe("One sentence: where the flow starts and where it ends"),
    owner: z.string().describe("Role that should own the flow, e.g. 'CFO'"),
    isNew: z.boolean().describe("True only for a flow that does not exist today and would be built new"),
    scores: z.object({ value: rating, evidence: rating, waiting: rating, volume: rating }),
    rationale: z.string().describe("Two sentences at most: why these scores, citing what the text says"),
  })),
});

export type Suggestions = z.infer<typeof SuggestionsSchema>;

export interface SuggestedFlow {
  name: string;
  area: string;
  description: string;
  owner: string;
  isNew: boolean;
  scores: FlowScores;
  rationale: string;
  decision: FlowDecision;
  /** Matches an existing flow by name; shown so people don't add duplicates. */
  duplicateOf: string | null;
}

export const MODEL = "claude-opus-5-5";

export const SYSTEM_PROMPT = `You help a leadership team decide which of their company's processes to redesign so AI agents can carry the routine work.

Read the material and identify the company's main cross-department flows: work that runs from a trigger to an outcome through several teams (for example request to resolution, order to cash, lead to renewal, hire to productive). Name flows by start and end, not by department. Include flows that are only implied when the text gives good reason, and say so in the rationale. Suggest at most one flow that does not exist today (isNew: true), and only if the text points to it.

Score each flow on four dimensions, low, medium or high:
- value: the size of the gain if the flow were redesigned (volume of work, cost, revenue or customer impact).
- evidence: how strong published evidence is that AI agents do this kind of work well today. Customer support, document handling and rule-based back-office work are strongest; complex sales, product development and judgement-heavy work are weaker.
- waiting: how much of the lead time is queues, approvals and handovers between teams rather than work itself.
- volume: how many cases a year.

Base every score on what the material says. When it says little, score medium and say what you'd ask in the rationale. Write in plain English, short and specific. Return 4 to 10 flows, ordered by how strong a redesign candidate each is.`;

const normaliseName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Adds the suggested decision and flags likely duplicates of flows already in the inventory. */
export function toSuggestedFlows(s: Suggestions, existingNames: string[]): SuggestedFlow[] {
  const existing = existingNames.map((n) => ({ n, key: normaliseName(n) }));
  return s.flows.map((f) => {
    const key = normaliseName(f.name);
    const dup = existing.find((e) => e.key === key || e.key.includes(key) || key.includes(e.key));
    return {
      name: f.name.trim().slice(0, 80), area: f.area.trim().slice(0, 120), description: f.description.trim().slice(0, 600),
      owner: f.owner.trim().slice(0, 80), isNew: f.isNew, scores: f.scores, rationale: f.rationale.trim().slice(0, 1000),
      decision: suggestedDecision(f.scores, f.isNew), duplicateOf: dup?.n ?? null,
    };
  });
}

export function buildUserMessage(text: string, existingNames: string[]): string {
  const known = existingNames.length ? `\n\nFlows already in the inventory (don't repeat them):\n${existingNames.map((n) => `- ${n}`).join("\n")}` : "";
  return `<material>\n${text}\n</material>${known}`;
}

/** Minimal client surface, so tests can pass a fake. */
export interface DiscoveryClient {
  beta: { messages: { parse: Anthropic["beta"]["messages"]["parse"] } };
}

export async function discoverFlows(text: string, existingNames: string[], client?: DiscoveryClient): Promise<SuggestedFlow[]> {
  let c = client;
  if (!c) {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new DiscoveryUnavailableError("AI discovery isn't set up. Add an ANTHROPIC_API_KEY to the site's environment variables.");
    }
    c = new Anthropic();
  }
  try {
    const response = await c.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "high", format: betaZodOutputFormat(SuggestionsSchema) },
      // If the model declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: buildUserMessage(text, existingNames) }],
    });
    if (response.stop_reason === "refusal") throw new DiscoveryDeclinedError("Claude declined to analyse this material. Try rephrasing or removing sensitive details.");
    if (response.stop_reason === "max_tokens") throw new DiscoveryDeclinedError("The answer was cut off. Try a shorter text.");
    if (!response.parsed_output) throw new DiscoveryDeclinedError("Claude's answer couldn't be read. Please try again.");
    return toSuggestedFlows(response.parsed_output, existingNames);
  } catch (e) {
    if (e instanceof DiscoveryDeclinedError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new DiscoveryUnavailableError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new DiscoveryUnavailableError("Claude is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.APIConnectionError) throw new DiscoveryUnavailableError("Couldn't reach Claude. Check the site's network access.");
    throw e;
  }
}
