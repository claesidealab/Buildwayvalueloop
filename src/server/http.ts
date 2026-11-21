import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, type DB } from "./db";
import { ConflictError, ensureAdvisor, getWorkspaceState, NotFoundError, seedExample } from "./repo";

const g = globalThis as unknown as { __bwReady?: Promise<{ db: DB; actorId: string }> };

/** Database plus the acting user. Seeds the example workspace on first use. */
export function app() {
  g.__bwReady ??= (async () => {
    const db = await getDb();
    await seedExample(db);
    // Until sign-in exists, every request acts as the example Buildway advisor.
    return { db, actorId: await ensureAdvisor(db) };
  })().catch((e) => { g.__bwReady = undefined; throw e; });
  return g.__bwReady;
}

export async function stateResponse(db: DB, ws: string) {
  return NextResponse.json(await getWorkspaceState(db, ws));
}

/** Runs a handler and maps domain errors to HTTP status codes. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid request", issues: e.issues }, { status: 400 });
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong on the server" }, { status: 500 });
  }
}

export const stepPatchSchema = z
  .object({ autonomy: z.number().int().min(0).max(4).optional(), isSystem: z.boolean().optional() })
  .strict()
  .refine((v) => v.autonomy !== undefined || v.isSystem !== undefined, "Send autonomy or isSystem");

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
