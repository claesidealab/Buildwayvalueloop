import { guard, handle, stateResponse } from "@/server/http";
import { restoreStep } from "@/server/repo";

/** POST: put a step that was removed in the redesign back into it. Needs design.edit. */
export async function POST(_req: Request, ctx: { params: Promise<{ ws: string; process: string; step: string }> }) {
  return handle(async () => {
    const { ws, process, step } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.edit");
    await restoreStep(db, ws, process, step, user.id);
    return stateResponse(db, user, access);
  });
}
