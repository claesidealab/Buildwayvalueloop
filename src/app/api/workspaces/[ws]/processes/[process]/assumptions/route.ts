import { app, assumptionsPatchSchema, handle, stateResponse } from "@/server/http";
import { updateAssumptions } from "@/server/repo";

type Params = { params: Promise<{ ws: string; process: string }> };

/** PATCH a subset of the draft design's assumptions. */
export async function PATCH(req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const body = assumptionsPatchSchema.parse(await req.json());
    const { db, actorId } = await app();
    await updateAssumptions(db, ws, process, body, actorId);
    return stateResponse(db, ws);
  });
}
