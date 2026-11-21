import { app, handle, stateResponse, stepPatchSchema } from "@/server/http";
import { updateStep } from "@/server/repo";
import type { AutonomyLevel } from "@/domain/types";

type Params = { params: Promise<{ ws: string; process: string; step: string }> };

/** PATCH { autonomy?: 0–4, isSystem?: boolean } on a step in the draft design. */
export async function PATCH(req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, process, step } = await ctx.params;
    const body = stepPatchSchema.parse(await req.json());
    const { db, actorId } = await app();
    await updateStep(db, ws, process, step, { autonomy: body.autonomy as AutonomyLevel | undefined, isSystem: body.isSystem }, actorId);
    return stateResponse(db, ws);
  });
}
