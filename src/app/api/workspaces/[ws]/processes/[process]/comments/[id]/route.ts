import { guard, handle, resolveSchema, stateResponse } from "@/server/http";
import { resolveComment } from "@/server/repo";

/** PATCH { resolved }: mark a comment resolved or open again. Needs design.comment. */
export async function PATCH(req: Request, ctx: { params: Promise<{ ws: string; process: string; id: string }> }) {
  return handle(async () => {
    const { ws, process, id } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.comment");
    const { resolved } = resolveSchema.parse(await req.json());
    await resolveComment(db, ws, process, id, resolved, user.id);
    return stateResponse(db, user, access);
  });
}
