import { assumptionsPatchSchema, guard, handle, stateResponse } from "@/server/http";
import { updateAssumptions } from "@/server/repo";

type Params = { params: Promise<{ ws: string; process: string }> };

/** PATCH a subset of the draft design's assumptions. Needs design.edit. */
export async function PATCH(req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.edit");
    const body = assumptionsPatchSchema.parse(await req.json());
    await updateAssumptions(db, ws, process, body, user.id);
    return stateResponse(db, user, access);
  });
}
