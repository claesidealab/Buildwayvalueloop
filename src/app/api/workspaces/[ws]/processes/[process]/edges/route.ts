import { edgeSchema, guard, handle, stateResponse } from "@/server/http";
import { addEdge } from "@/server/repo";

/** POST { from, to }: draw an arrow between two steps. Needs design.edit. */
export async function POST(req: Request, ctx: { params: Promise<{ ws: string; process: string }> }) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.edit");
    const { from, to } = edgeSchema.parse(await req.json());
    await addEdge(db, ws, process, from, to, user.id);
    return stateResponse(db, user, access);
  });
}
