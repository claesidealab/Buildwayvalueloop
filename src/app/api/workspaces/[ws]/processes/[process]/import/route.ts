import { guard, handle, mapImportSchema, stateResponse } from "@/server/http";
import { importMap } from "@/server/repo";

/**
 * POST { steps, edges }: add reviewed steps and arrows to the map in one go, after any steps
 * already there (an AI draft or a BPMN file). Needs design.edit.
 */
export async function POST(req: Request, ctx: { params: Promise<{ ws: string; process: string }> }) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.edit");
    const { steps, edges } = mapImportSchema.parse(await req.json());
    await importMap(db, ws, process, steps.map((s) => ({ ...s, view: "as-is" as const })), edges, user.id);
    return stateResponse(db, user, access);
  });
}
