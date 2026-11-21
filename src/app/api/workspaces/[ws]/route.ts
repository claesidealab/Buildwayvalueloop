import { app, handle, stateResponse } from "@/server/http";

export const dynamic = "force-dynamic";

/** GET the whole workspace: processes, steps, draft designs and latest baselines. */
export async function GET(_req: Request, ctx: { params: Promise<{ ws: string }> }) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db } = await app();
    return stateResponse(db, ws);
  });
}
