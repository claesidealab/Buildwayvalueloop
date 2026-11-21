import { guard, handle, stateResponse } from "@/server/http";
import { resetExample } from "@/server/repo";
import { getAccess } from "@/server/access";

/** POST: restore an example workspace to its seeded state. Advisors only; refused for real workspaces. */
export async function POST(_req: Request, ctx: { params: Promise<{ ws: string }> }) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { db, user } = await guard(ws, "workspace.reset");
    await resetExample(db, ws);
    // Reset recreates memberships; look the caller's access up again.
    return stateResponse(db, user, await getAccess(db, ws, user));
  });
}
