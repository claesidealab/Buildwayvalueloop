import { NextResponse } from "next/server";
import { draftRequestSchema, guard, handle } from "@/server/http";
import { getWorkspaceState, NotFoundError } from "@/server/repo";
import { draftMap } from "@/server/process-draft";

export const maxDuration = 300;

/** POST { text }: Claude drafts today's process from SOPs or notes. Nothing is saved. Needs design.edit. */
export async function POST(req: Request, ctx: { params: Promise<{ ws: string; process: string }> }) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db } = await guard(ws, "design.edit");
    const { text } = draftRequestSchema.parse(await req.json());
    const p = (await getWorkspaceState(db, ws)).processes.find((x) => x.id === process);
    if (!p) throw new NotFoundError(`Process ${process} not found`);
    return NextResponse.json({ draft: await draftMap(text, p.name) });
  });
}
