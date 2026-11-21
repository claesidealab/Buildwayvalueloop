import { z } from "zod";
import { guard, handle, stateResponse } from "@/server/http";
import { removeEdge } from "@/server/repo";

/** DELETE: remove an arrow. Needs design.edit. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ ws: string; process: string; id: string }> }) {
  return handle(async () => {
    const { ws, process, id } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.edit");
    await removeEdge(db, ws, process, z.string().uuid().parse(id), user.id);
    return stateResponse(db, user, access);
  });
}
