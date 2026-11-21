import { guard, handle, newStepSchema, stateResponse } from "@/server/http";
import { addStep } from "@/server/repo";
import type { NewStep } from "@/lib/api-types";

/** POST: add a step to the process map. Needs design.edit. */
export async function POST(req: Request, ctx: { params: Promise<{ ws: string; process: string }> }) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.edit");
    const body = newStepSchema.parse(await req.json()) as NewStep;
    await addStep(db, ws, process, body, user.id);
    return stateResponse(db, user, access);
  });
}
