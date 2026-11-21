import { guard, handle } from "@/server/http";
import { getWorkspaceState, NotFoundError } from "@/server/repo";
import { actualsTemplateCsv } from "@/domain/actuals";

export const dynamic = "force-dynamic";

/** GET: a CSV to fill in, with the coming three months and every metric and step. */
export async function GET(_req: Request, ctx: { params: Promise<{ ws: string; process: string }> }) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db } = await guard(ws, "workspace.read");
    const proc = (await getWorkspaceState(db, ws)).processes.find((p) => p.id === process);
    if (!proc) throw new NotFoundError(`Process ${process} not found`);
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    return new Response(actualsTemplateCsv(proc.steps.map((s) => s.id), month), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${process}-actuals.csv"` },
    });
  });
}
