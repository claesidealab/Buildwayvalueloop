import { agentSchema, guard, handle, stateResponse } from "@/server/http";
import { saveAgent } from "@/server/repo";

/** PUT { name, platform, owner, model, status, risk, monthlyBudget, priceIn, priceOut }: register or update the agent on a step. Needs design.edit. */
export async function PUT(req: Request, ctx: { params: Promise<{ ws: string; process: string; step: string }> }) {
  return handle(async () => {
    const { ws, process, step } = await ctx.params;
    const { db, user, access } = await guard(ws, "design.edit");
    const rec = agentSchema.parse(await req.json());
    await saveAgent(db, ws, process, step, rec, user.id);
    return stateResponse(db, user, access);
  });
}
