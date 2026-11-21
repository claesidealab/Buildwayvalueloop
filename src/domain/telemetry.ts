/**
 * Agent telemetry from OpenTelemetry (OTLP/JSON, GenAI semantic conventions), as exported by
 * agent platforms or by Langfuse, LangSmith, Arize Phoenix and other OTel-compatible tools.
 *
 * Spans are matched to an agent by gen_ai.agent.name (or gen_ai.agent.id, or valueloop.step),
 * against the registry name, the step key or the step name; child spans inherit the agent of
 * the invoke_agent span above them. Per agent and calendar month (UTC, from the span start):
 *
 *   agent_runs      = invoke_agent spans (or distinct traces when a file has none for the agent)
 *   tokens          = Σ gen_ai.usage.input_tokens / output_tokens on model calls under the agent
 *                     (the invoke_agent span's own usage is used only when no child reports any)
 *   agent_cost_sek  = input tokens / 1M × price in + output tokens / 1M × price out  (needs prices)
 *   success_rate    = (runs − runs with status ERROR) ÷ runs × 100
 *   escalation_rate = runs with valueloop.escalated = true ÷ runs × 100  (only if the attribute is used)
 */
import type { ActualPoint } from "./actuals";

type AnyValue = { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean };
interface OtlpSpan {
  traceId?: string; spanId?: string; parentSpanId?: string; name?: string; startTimeUnixNano?: string | number;
  attributes?: Array<{ key: string; value?: AnyValue }>; status?: { code?: number | string };
}
interface OtlpFile { resourceSpans?: Array<{ resource?: { attributes?: Array<{ key: string; value?: AnyValue }> }; scopeSpans?: Array<{ spans?: OtlpSpan[] }> }> }

export interface TelemetryAgent { step: string; stepName: string; name: string; priceIn: number | null; priceOut: number | null }

export interface TelemetryResult {
  rows: ActualPoint[];
  spans: number;
  matchedSpans: number;
  /** Agent names in the file that match no agent in the registry. */
  unmatched: string[];
  /** Agents with token usage but no prices, so no cost could be computed. */
  unpriced: string[];
  months: string[];
}

const val = (v?: AnyValue): string | number | boolean | undefined =>
  v?.stringValue ?? (v?.intValue !== undefined ? Number(v.intValue) : undefined) ?? v?.doubleValue ?? v?.boolValue;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export class TelemetryError extends Error {}

export function parseOtlpJson(text: string, agents: TelemetryAgent[]): TelemetryResult {
  let file: OtlpFile;
  try { file = JSON.parse(text) as OtlpFile; } catch { throw new TelemetryError("The file isn't valid JSON. Export traces as OTLP/JSON."); }
  if (!file || !Array.isArray(file.resourceSpans)) throw new TelemetryError("No resourceSpans found. Export traces as OTLP/JSON (the OpenTelemetry collector's file exporter format).");

  const byName = new Map<string, TelemetryAgent>();
  for (const a of agents) for (const k of [a.name, a.step, a.stepName]) if (k) byName.set(norm(k), a);

  type S = { span: OtlpSpan; attrs: Map<string, string | number | boolean | undefined>; agentKey?: string };
  const all: S[] = [];
  for (const rs of file.resourceSpans) {
    const resAttrs = new Map((rs.resource?.attributes ?? []).map((a) => [a.key, val(a.value)]));
    for (const ss of rs.scopeSpans ?? []) for (const span of ss.spans ?? []) {
      const attrs = new Map((span.attributes ?? []).map((a) => [a.key, val(a.value)]));
      if (!attrs.has("gen_ai.agent.name") && resAttrs.has("gen_ai.agent.name")) attrs.set("gen_ai.agent.name", resAttrs.get("gen_ai.agent.name"));
      all.push({ span, attrs });
    }
  }

  // Attribute spans to agents, inheriting from ancestors in the same trace.
  const byId = new Map(all.filter((s) => s.span.spanId).map((s) => [`${s.span.traceId}/${s.span.spanId}`, s]));
  const own = (s: S) => {
    const k = s.attrs.get("valueloop.step") ?? s.attrs.get("gen_ai.agent.name") ?? s.attrs.get("gen_ai.agent.id");
    return typeof k === "string" && k.trim() ? k.trim() : undefined;
  };
  const resolve = (s: S, depth = 0): string | undefined => {
    if (s.agentKey !== undefined || depth > 50) return s.agentKey;
    const mine = own(s);
    if (mine) return (s.agentKey = mine);
    const parent = s.span.parentSpanId ? byId.get(`${s.span.traceId}/${s.span.parentSpanId}`) : undefined;
    return (s.agentKey = parent ? resolve(parent, depth + 1) : undefined);
  };

  type Acc = { runs: number; errors: number; escalated: number; escSeen: boolean; traces: Set<string>; inTok: number; outTok: number; parentIn: number; parentOut: number; childUsage: boolean };
  const acc = new Map<string, Acc>(); // `${step}|${month}`
  const unmatched = new Set<string>();
  let matched = 0;
  for (const s of all) {
    const key = resolve(s);
    if (!key) continue;
    const agent = byName.get(norm(key));
    if (!agent) { unmatched.add(key); continue; }
    matched++;
    const ns = Number(s.span.startTimeUnixNano ?? 0);
    if (!Number.isFinite(ns) || ns <= 0) continue;
    const d = new Date(ns / 1e6);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const k = `${agent.step}|${month}`;
    const a = acc.get(k) ?? { runs: 0, errors: 0, escalated: 0, escSeen: false, traces: new Set(), inTok: 0, outTok: 0, parentIn: 0, parentOut: 0, childUsage: false };
    acc.set(k, a);
    if (s.span.traceId) a.traces.add(s.span.traceId);
    const inTok = Number(s.attrs.get("gen_ai.usage.input_tokens") ?? 0) || 0;
    const outTok = Number(s.attrs.get("gen_ai.usage.output_tokens") ?? 0) || 0;
    if (s.attrs.get("gen_ai.operation.name") === "invoke_agent") {
      a.runs++;
      const code = s.span.status?.code;
      if (code === 2 || code === "STATUS_CODE_ERROR") a.errors++;
      if (s.attrs.has("valueloop.escalated")) { a.escSeen = true; if (s.attrs.get("valueloop.escalated") === true) a.escalated++; }
      a.parentIn += inTok; a.parentOut += outTok;
    } else if (inTok || outTok) {
      a.inTok += inTok; a.outTok += outTok; a.childUsage = true;
    }
  }

  const rows: ActualPoint[] = [];
  const unpriced = new Set<string>();
  for (const [k, a] of acc) {
    const [step, period] = k.split("|");
    const agent = agents.find((x) => x.step === step)!;
    const runs = a.runs || a.traces.size;
    const inTok = a.childUsage ? a.inTok : a.parentIn;
    const outTok = a.childUsage ? a.outTok : a.parentOut;
    rows.push({ period, metric: "agent_runs", step, value: runs });
    if (inTok || outTok) {
      if (agent.priceIn === null && agent.priceOut === null) unpriced.add(agent.name);
      else rows.push({ period, metric: "agent_cost_sek", step, value: Math.round(((inTok / 1e6) * (agent.priceIn ?? 0) + (outTok / 1e6) * (agent.priceOut ?? 0)) * 100) / 100 });
    }
    if (a.runs) rows.push({ period, metric: "success_rate", step, value: Math.round(((a.runs - a.errors) / a.runs) * 1000) / 10 });
    if (a.runs && a.escSeen) rows.push({ period, metric: "escalation_rate", step, value: Math.round((a.escalated / a.runs) * 1000) / 10 });
  }
  rows.sort((x, y) => x.period.localeCompare(y.period) || (x.step ?? "").localeCompare(y.step ?? "") || x.metric.localeCompare(y.metric));
  return { rows, spans: all.length, matchedSpans: matched, unmatched: [...unmatched], unpriced: [...unpriced], months: [...new Set(rows.map((r) => r.period.slice(0, 7)))].sort() };
}
