import { guard, handle, stateResponse } from "@/server/http";
import { approveBaseline } from "@/server/repo";

type Params = { params: Promise<{ ws: string; process: string }> };

/** POST: approve the current draft as the baseline. Needs baseline.approve. The value is computed on the server. */
export async function POST(_req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db, user, access } = await guard(ws, "baseline.approve");
    await approveBaseline(db, ws, process, user.id);
    return stateResponse(db, user, access);
  });
}
