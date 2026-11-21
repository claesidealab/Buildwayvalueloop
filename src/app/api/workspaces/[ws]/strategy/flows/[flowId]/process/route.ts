import { NextResponse } from "next/server";
import { guard, handle } from "@/server/http";
import { createProcessFromFlow } from "@/server/strategy-repo";

/** POST: create an empty process for a flow so it can be mapped. Needs strategy.edit and design.edit. */
export async function POST(_req: Request, ctx: { params: Promise<{ ws: string; flowId: string }> }) {
  return handle(async () => {
    const { ws, flowId } = await ctx.params;
    const { db, user } = await guard(ws, "strategy.edit");
    await guard(ws, "design.edit");
    return NextResponse.json(await createProcessFromFlow(db, ws, flowId, user.id), { status: 201 });
  });
}
