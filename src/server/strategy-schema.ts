/** Validation for strategy plans sent by the client. */
import { z } from "zod";

const rating = z.enum(["low", "medium", "high"]);
const id = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max);
const half = z.string().regex(/^\d{4}-H[12]$/, "Use a half-year like 2027-H1");
const money = z.number().min(-1e12).max(1e12);

export const flowSchema = z.object({
  id, name: text(80).min(1), area: text(120), description: text(600), owner: text(80),
  scores: z.object({ value: rating, evidence: rating, waiting: rating, volume: rating }).strict(),
  decision: z.enum(["redesign", "build", "improve", "leave"]),
  isNew: z.boolean().optional(),
  processId: z.string().max(64).nullable(),
  rationale: text(1000).optional(),
  source: z.enum(["manual", "ai"]).optional(),
}).strict();

const scenarioSchema = z.object({
  id, name: text(80).min(1), summary: text(600),
  flows: z.array(z.object({ flowId: id, goLive: half, rampMonths: z.number().min(0).max(60), runRate: money }).strict()).max(50),
  costs: z.array(z.object({ id, label: text(120), kind: z.enum(["one-off", "running", "own-time"]), perYear: z.array(money).max(10) }).strict()).max(40),
  assumptions: z.array(z.object({ label: text(200), value: text(300) }).strict()).max(30),
  gates: z.array(z.object({
    id, period: half, criterion: text(400), status: z.enum(["open", "met", "missed"]),
    decidedAt: z.string().max(40).optional(), decidedBy: text(120).optional(),
  }).strict()).max(20),
}).strict();

export const planSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code"),
  startYear: z.number().int().min(2000).max(2100),
  years: z.number().int().min(1).max(10),
  ownTimeRate: z.number().min(0).max(1e9),
  flows: z.array(flowSchema).max(100),
  scenarios: z.array(scenarioSchema).max(10),
  chosenScenarioId: z.string().max(64).nullable(),
  ambition: z.array(z.object({ id, name: text(160).min(1), unit: text(20), targets: z.array(z.number().nullable()).max(10) }).strict()).max(20),
  // Decisions are append-only and ignored on save; accepted so clients can send the plan back as they got it.
  decisions: z.array(z.any()).max(1000),
  isExample: z.boolean().optional(),
}).strict();

export const saveSchema = z.object({ plan: planSchema, version: z.number().int().min(1) }).strict();

export const decisionSchema = z.object({
  kind: z.enum(["scenario", "ambition", "gate", "other"]),
  attendees: text(400),
  text: text(2000).min(1),
}).strict();

export const discoverSchema = z.object({ text: z.string().min(20, "Describe the company or paste notes: at least a few sentences").max(60_000) }).strict();
