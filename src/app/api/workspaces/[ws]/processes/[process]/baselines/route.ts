import { app, handle, stateResponse } from "@/server/http";
import { approveBaseline } from "@/server/repo";

type Params = { params: Promise<{ ws: string; process: string }> };

/** POST: approve the current draft as the baseline. The value is computed on the server. */
export async function POST(_req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db, actorId } = await app();
    await approveBaseline(db, ws, process, actorId);
    return stateResponse(db, ws);
  });
}
