/**
 * AI-drafted as-is map: Claude reads SOPs, work instructions or interview notes and drafts
 * today's process as steps with handling times, case shares and agent-fit ratings. People
 * review the draft and choose to add it; nothing is saved until they do.
 *
 * Needs ANTHROPIC_API_KEY, like flow discovery. Without one the endpoint answers 503 and the
 * screen explains how to turn it on.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { DiscoveryDeclinedError, DiscoveryUnavailableError, MODEL, type DiscoveryClient } from "./discovery";
import type { FitFactors } from "@/domain/types";

const rating = z.enum(["low", "medium", "high"]);

export const DraftSchema = z.object({
  unit: z.string().describe("What one case is called, singular, e.g. 'invoice' or 'contact'"),
  steps: z.array(z.object({
    name: z.string().describe("Two or three words, verb first where natural, e.g. 'Check credit'"),
    description: z.string().describe("One sentence: what happens in the step today"),
    minutesPerCase: z.number().describe("Hands-on minutes a person spends per case that passes the step; the material's figure, else a careful estimate"),
    caseShare: z.number().describe("Percent of all cases that pass this step, 0-100"),
    fit: z.object({ volume: rating, ruleBased: rating, dataReady: rating, errorRisk: rating }),
    note: z.string().describe("Short: where the numbers come from, or what to ask to confirm them"),
  })).describe("Today's steps in the order work flows, 3 to 14 steps"),
  branches: z.array(z.object({ from: z.number(), to: z.number() })).describe("Extra arrows beyond the straight sequence, as 0-based step positions, e.g. an escalation that skips ahead. Usually empty."),
});

export type Draft = z.infer<typeof DraftSchema>;

export interface DraftStep {
  name: string;
  description: string;
  minutesPerCase: number;
  caseShare: number;
  fit: FitFactors;
  note: string;
}

export interface MapDraft {
  unit: string;
  steps: DraftStep[];
  /** Arrows as 0-based positions: the sequence plus any branches. */
  edges: Array<[number, number]>;
}

export const DRAFT_PROMPT = `You map how work is done today so a team can redesign it for AI agents.

Read the material (SOPs, work instructions, interview notes) and draft today's process as it actually runs: the steps people do from trigger to outcome, in order. Merge tiny actions into steps a workshop would recognise; split a step when different people or systems do the parts. Leave out steps the material doesn't support.

For each step give the hands-on minutes per case and the percent of cases that pass it. Use figures from the material when there are any; otherwise estimate carefully and say so in the note. Rate agent fit low, medium or high:
- volume: how often the step runs
- ruleBased: how much it follows fixed rules rather than judgement
- dataReady: how available and structured the data the step needs is
- errorRisk: the cost of getting it wrong

Write in plain English, short and specific.`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** Cleans Claude's draft: trims text, clamps numbers, drops arrows to steps that don't exist, adds the sequence. */
export function toMapDraft(d: Draft): MapDraft {
  const steps = d.steps.slice(0, 20).map((s) => ({
    name: s.name.trim().slice(0, 60) || "Step", description: s.description.trim().slice(0, 500),
    minutesPerCase: Math.round(clamp(s.minutesPerCase, 0, 1440) * 10) / 10, caseShare: Math.round(clamp(s.caseShare, 0, 100)),
    fit: s.fit, note: s.note.trim().slice(0, 300),
  }));
  const edges: Array<[number, number]> = steps.slice(1).map((_, i) => [i, i + 1]);
  for (const b of d.branches) {
    const a = Math.round(b.from), c = Math.round(b.to);
    if (a !== c && a >= 0 && c >= 0 && a < steps.length && c < steps.length && !edges.some(([x, y]) => x === a && y === c)) edges.push([a, c]);
  }
  return { unit: d.unit.trim().slice(0, 30) || "case", steps, edges };
}

export async function draftMap(text: string, processName: string, client?: DiscoveryClient): Promise<MapDraft> {
  let c = client;
  if (!c) {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new DiscoveryUnavailableError("Drafting with AI isn't set up. Add an ANTHROPIC_API_KEY to the site's environment variables.");
    }
    c = new Anthropic();
  }
  try {
    const response = await c.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: DRAFT_PROMPT,
      output_config: { effort: "high", format: betaZodOutputFormat(DraftSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: `<process>${processName}</process>\n<material>\n${text}\n</material>` }],
    });
    if (response.stop_reason === "refusal") throw new DiscoveryDeclinedError("Claude declined to read this material. Try removing sensitive details.");
    if (response.stop_reason === "max_tokens") throw new DiscoveryDeclinedError("The answer was cut off. Try a shorter text.");
    if (!response.parsed_output) throw new DiscoveryDeclinedError("Claude's answer couldn't be read. Please try again.");
    return toMapDraft(response.parsed_output);
  } catch (e) {
    if (e instanceof DiscoveryDeclinedError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new DiscoveryUnavailableError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new DiscoveryUnavailableError("Claude is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.APIConnectionError) throw new DiscoveryUnavailableError("Couldn't reach Claude. Check the site's network access.");
    throw e;
  }
}
