import { NextResponse } from "next/server";
import { guard, handle } from "@/server/http";
import { getStrategy } from "@/server/strategy-repo";
import { discoverSchema } from "@/server/strategy-schema";
import { discoverFlows } from "@/server/discovery";

export const maxDuration = 300;

/**
 * POST { text }: Claude suggests flows from a description, interview notes or documents.
 * Nothing is saved; people add the suggestions they agree with. Needs strategy.edit.
 */
export async function POST(req: Request, ctx: { params: Promise<{ ws: string }> }) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db } = await guard(ws, "strategy.edit");
    const { text } = discoverSchema.parse(await req.json());
    const { plan } = await getStrategy(db, ws);
    const flows = await discoverFlows(text, plan.flows.map((f) => f.name));
    return NextResponse.json({ flows });
  });
}
