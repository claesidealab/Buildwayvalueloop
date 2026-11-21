import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, type DB } from "./db";
import { ConflictError, getWorkspaceState, NotFoundError, seedExample } from "./repo";
import { authorize, ForbiddenError, UnauthorizedError, type Access, type SessionUser } from "./access";
import { requireUser } from "./session";
import { DiscoveryDeclinedError, DiscoveryUnavailableError } from "./discovery";
import { permissionsOf, type Permission } from "@/domain/permissions";
import type { Role } from "@/domain/types";

const g = globalThis as unknown as { __bwReady?: Promise<{ db: DB }> };

/** The database. Seeds the example workspace on first use. */
export function app() {
  g.__bwReady ??= (async () => {
    const db = await getDb();
    await seedExample(db);
    return { db };
  })().catch((e) => { g.__bwReady = undefined; throw e; });
  return g.__bwReady;
}

/** Signed-in user with the given permission in the workspace, or a 401/403/404 error. */
export async function guard(wsSlug: string, permission: Permission): Promise<{ db: DB; user: SessionUser; access: Access }> {
  const { db } = await app();
  const user = await requireUser(db);
  return { db, user, access: await authorize(db, wsSlug, user, permission) };
}

/** Full workspace state plus what the caller may do in it. */
export async function stateResponse(db: DB, user: SessionUser, access: Access) {
  const state = await getWorkspaceState(db, access.workspaceSlug);
  return NextResponse.json({ ...state, me: { name: user.name, email: user.email, isBuildway: user.isBuildway, role: access.role as Role, permissions: permissionsOf(access.role) } });
}

/** Runs a handler and maps domain errors to HTTP status codes. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid request", issues: e.issues }, { status: 400 });
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof DiscoveryUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof DiscoveryDeclinedError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong on the server" }, { status: 500 });
  }
}

const rating = z.enum(["low", "medium", "high"]);
const fitPatch = z.object({ volume: rating, ruleBased: rating, dataReady: rating, errorRisk: rating }).partial().strict();
const stepName = z.string().trim().min(1).max(60);

export const stepPatchSchema = z
  .object({
    autonomy: z.number().int().min(0).max(4),
    isSystem: z.boolean(),
    name: stepName,
    description: z.string().max(500),
    minutesPerCase: z.number().min(0).max(1440),
    caseShare: z.number().min(0).max(100),
    x: z.number().min(-100_000).max(100_000),
    fit: fitPatch,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Send at least one field");

export const newStepSchema = z
  .object({
    name: stepName,
    view: z.enum(["as-is", "to-be"]),
    description: z.string().max(500).optional(),
    minutesPerCase: z.number().min(0).max(1440).optional(),
    caseShare: z.number().min(0).max(100).optional(),
    x: z.number().min(-100_000).max(100_000).optional(),
    autonomy: z.number().int().min(0).max(4).optional(),
    isSystem: z.boolean().optional(),
    fit: fitPatch.optional(),
  })
  .strict();

export const commentSchema = z.object({ step: z.string().min(1).max(64), body: z.string().trim().min(1).max(2000) }).strict();
export const resolveSchema = z.object({ resolved: z.boolean() }).strict();
export const draftRequestSchema = z.object({ text: z.string().min(40, "Paste the SOP or notes: at least a few sentences").max(60_000) }).strict();
export const mapImportSchema = z.object({
  steps: z.array(z.object({
    name: stepName, description: z.string().max(500), minutesPerCase: z.number().min(0).max(1440), caseShare: z.number().min(0).max(100),
    fit: z.object({ volume: rating, ruleBased: rating, dataReady: rating, errorRisk: rating }).strict(),
  }).strict()).min(1).max(40),
  edges: z.array(z.tuple([z.number().int().min(0).max(39), z.number().int().min(0).max(39)])).max(120),
}).strict();

export const edgeSchema = z.object({ from: z.string().min(1).max(64), to: z.string().min(1).max(64) }).strict();

export const assumptionsPatchSchema = z
  .object({
    casesPerMonth: z.number().int().min(0).max(10_000_000),
    costPerHour: z.number().min(0).max(10_000),
    agentQuality: z.number().min(0).max(100),
    oversightShare: z.number().min(0).max(100),
    aiCostPerStepCase: z.number().min(0).max(1_000),
    fixedCostPerYear: z.number().min(0).max(1_000_000_000),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Send at least one assumption");

export const roleSchema = z.enum(["advisor", "customer-admin", "process-owner", "viewer"]);
