import { guard, handle, stateResponse, stepPatchSchema } from "@/server/http";
import { removeStep, updateStep } from "@/server/repo";
import type { StepPatch } from "@/lib/api-types";

type Params = { params: Promise<{ ws: string; process: string; step: string }> };

/** PATCH a step: autonomy and system flag in the draft design, and its definition (name, times, share, fit, position). Needs design.edit. */
export async function PATCH(req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, process, step } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.edit");
    const body = stepPatchSchema.parse(await req.json()) as StepPatch;
    await updateStep(db, ws, process, step, body, user.id);
    return stateResponse(db, user, access);
  });
}

/** DELETE ?view=to-be|as-is: remove the step from that version of the process. Needs design.edit. */
export async function DELETE(req: Request, ctx: Params) {
  return handle(async () => {
    const { ws, process, step } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.edit");
    const view = new URL(req.url).searchParams.get("view") === "as-is" ? "as-is" : "to-be";
    await removeStep(db, ws, process, step, view, user.id);
    return stateResponse(db, user, access);
  });
}
