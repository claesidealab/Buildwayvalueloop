import { commentSchema, guard, handle, stateResponse } from "@/server/http";
import { addComment } from "@/server/repo";

/** POST { step, body }: comment on a step. Needs design.comment (every role). */
export async function POST(req: Request, ctx: { params: Promise<{ ws: string; process: string }> }) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.comment");
    const { step, body } = commentSchema.parse(await req.json());
    await addComment(db, ws, process, step, body, user.id);
    return stateResponse(db, user, access);
  });
}
