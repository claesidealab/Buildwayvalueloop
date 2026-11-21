import { NextResponse } from "next/server";
import { guard, handle } from "@/server/http";
import { recordDecision } from "@/server/strategy-repo";
import { decisionSchema } from "@/server/strategy-schema";

/** POST { kind, attendees, text }: record a decision taken in the room. Needs strategy.edit. */
export async function POST(req: Request, ctx: { params: Promise<{ ws: string }> }) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db, user } = await guard(ws, "strategy.edit");
    const body = decisionSchema.parse(await req.json());
    return NextResponse.json(await recordDecision(db, ws, body, user.id), { status: 201 });
  });
}
