import { guard, handle, stateResponse } from "@/server/http";

export const dynamic = "force-dynamic";

/** GET the whole workspace: processes, steps, draft designs, latest baselines and the caller's role. */
export async function GET(_req: Request, ctx: { params: Promise<{ ws: string }> }) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db, user, access } = await guard(ws, "workspace.read");
    return stateResponse(db, user, access);
  });
}
