import { NextResponse } from "next/server";
import { guard, handle, stateResponse, telemetrySchema } from "@/server/http";
import { getWorkspaceState, importActuals, NotFoundError } from "@/server/repo";
import { parseOtlpJson, TelemetryError } from "@/domain/telemetry";
import { defaultAgent } from "@/domain/agents";
import { computeValueCase } from "@/domain/value-model";

/**
 * POST { otlp }: import agent telemetry exported as OTLP/JSON (OpenTelemetry GenAI conventions).
 * Spans are matched to the process's agents; runs, cost, success and escalation per month are
 * stored as actuals (source "telemetry"). Needs actuals.import.
 */
export async function POST(req: Request, ctx: { params: Promise<{ ws: string; process: string }> }) {
  return handle(async () => {
    const { ws, process } = await ctx.params;
    const { db, user, access } = await guard(ws, "actuals.import");
    const { otlp } = telemetrySchema.parse(await req.json());
    const p = (await getWorkspaceState(db, ws)).processes.find((x) => x.id === process);
    if (!p) throw new NotFoundError(`Process ${process} not found`);
    const vc = computeValueCase(p.steps, p.design, p.assumptions);
    const agentSteps = vc.steps.filter((s) => s.lane === "agent").map((s) => {
      const rec = p.agents.find((a) => a.step === s.step.id) ?? defaultAgent(s.step);
      return { step: s.step.id, stepName: s.step.name, name: rec.name, priceIn: rec.priceIn, priceOut: rec.priceOut };
    });
    let result;
    try { result = parseOtlpJson(otlp, agentSteps); }
    catch (e) { if (e instanceof TelemetryError) return NextResponse.json({ error: e.message }, { status: 422 }); throw e; }
    if (!result.rows.length) {
      return NextResponse.json({ error: `None of the ${result.spans} spans matched an agent in this process.${result.unmatched.length ? ` Agent names in the file: ${result.unmatched.slice(0, 8).join(", ")}. Give the agents these names in the registry, or set gen_ai.agent.name.` : ""}` }, { status: 422 });
    }
    await importActuals(db, ws, process, result.rows, user.id, "telemetry");
    const res = await stateResponse(db, user, access);
    const state = await res.json();
    return NextResponse.json({ ...state, telemetry: { spans: result.spans, matchedSpans: result.matchedSpans, unmatched: result.unmatched, unpriced: result.unpriced, months: result.months } });
  });
}
