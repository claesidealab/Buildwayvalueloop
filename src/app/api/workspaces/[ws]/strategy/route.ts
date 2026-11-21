import { NextResponse } from "next/server";
import { guard, handle } from "@/server/http";
import { getStrategy, saveStrategy } from "@/server/strategy-repo";
import { saveSchema } from "@/server/strategy-schema";
import type { StrategyPlan } from "@/domain/strategy";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ ws: string }> };

/** GET the workspace's strategy plan and its version. */
export async function GET(_req: Request, ctx: Params) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db } = await guard(ws, "workspace.read");
    return NextResponse.json(await getStrategy(db, ws));
  });
}

/** PUT { plan, version }: save the plan edited from `version`. 409 if someone saved since. Needs strategy.edit. */
export async function PUT(req: Request, ctx: Params) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db, user } = await guard(ws, "strategy.edit");
    const body = saveSchema.parse(await req.json());
    return NextResponse.json(await saveStrategy(db, ws, body.plan as StrategyPlan, body.version, user.id));
  });
}
