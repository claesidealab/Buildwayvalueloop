import { app, handle, stateResponse } from "@/server/http";
import { resetExample } from "@/server/repo";

/** POST: restore an example workspace to its seeded state. Refused for real workspaces. */
export async function POST(_req: Request, ctx: { params: Promise<{ ws: string }> }) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db } = await app();
    await resetExample(db, ws);
    return stateResponse(db, ws);
  });
}
