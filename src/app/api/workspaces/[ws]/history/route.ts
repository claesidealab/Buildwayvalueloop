import { NextResponse } from "next/server";
import { guard, handle } from "@/server/http";
import { listActivity, listBaselines } from "@/server/repo";

export const dynamic = "force-dynamic";

/** GET: approved baselines (newest first) and the latest 200 activity entries. */
export async function GET(_req: Request, ctx: { params: Promise<{ ws: string }> }) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db } = await guard(ws, "workspace.read");
    return NextResponse.json({ baselines: await listBaselines(db, ws), activity: await listActivity(db, ws) });
  });
}
