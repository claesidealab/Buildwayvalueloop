import { guard, handle, stateResponse, stepPatchSchema } from "@/server/http";
import { updateStep } from "@/server/repo";
import type { AutonomyLevel } from "@/domain/types";

type Params = { params: Promise<{ ws: string; process: string; step: string }> };

/** PATCH { autonomy?: 0–4, isSystem?: boolean } on a step in the draft design. Needs design.edit. */
export async function PATCH(req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, process, step } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.edit");
    const body = stepPatchSchema.parse(await req.json());
    await updateStep(db, ws, process, step, { autonomy: body.autonomy as AutonomyLevel | undefined, isSystem: body.isSystem }, user.id);
    return stateResponse(db, user, access);
  });
}
