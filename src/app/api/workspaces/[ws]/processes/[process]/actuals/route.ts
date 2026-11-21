import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, handle, stateResponse } from "@/server/http";
import { clearActuals, getWorkspaceState, importActuals, NotFoundError } from "@/server/repo";
import { parseActualsCsv } from "@/domain/actuals";

type Params = { params: Promise<{ ws: string; process: string }> };
const MAX_BYTES = 1_000_000;

/**
 * POST { csv }: upload actuals. All or nothing: if any row has a problem, nothing is stored
 * and the response (422) lists every problem by line. Needs actuals.import.
 */
export async function POST(req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db, user, access } = await guard(ws, "actuals.import");
    const { csv } = z.object({ csv: z.string().max(MAX_BYTES, "The file is larger than 1 MB") }).strict().parse(await req.json());
    const proc = (await getWorkspaceState(db, ws)).processes.find((p) => p.id === process);
    if (!proc) throw new NotFoundError(`Process ${process} not found`);
    const { rows, errors } = parseActualsCsv(csv, proc.steps.map((s) => s.id));
    if (errors.length) return NextResponse.json({ error: `${errors.length} row${errors.length === 1 ? "" : "s"} need fixing. Nothing was imported.`, problems: errors.slice(0, 50) }, { status: 422 });
    if (!rows.length) return NextResponse.json({ error: "The file has no values to import" }, { status: 422 });
    await importActuals(db, ws, process, rows, user.id);
    return stateResponse(db, user, access);
  });
}

/** DELETE: remove all uploaded actuals for the process. Needs actuals.import. */
export async function DELETE(_req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db, user, access } = await guard(ws, "actuals.import");
    await clearActuals(db, ws, process, user.id);
    return stateResponse(db, user, access);
  });
}
