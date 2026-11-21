import { describe, expect, it } from "vitest";
import { parseOtlpJson, TelemetryError, type TelemetryAgent } from "./telemetry";

const agents: TelemetryAgent[] = [
  { step: "triage", stepName: "Triage", name: "Triage agent", priceIn: 30, priceOut: 150 },
  { step: "resolve", stepName: "Resolve", name: "Resolve bot", priceIn: null, priceOut: null },
];
const s = (v: string) => ({ stringValue: v });
const i = (v: number) => ({ intValue: String(v) });
const jan = String(Date.UTC(2027, 0, 15) * 1e6);
const feb = String(Date.UTC(2027, 1, 2) * 1e6);

const span = (o: { trace: string; id: string; parent?: string; start?: string; attrs: Record<string, unknown>; error?: boolean }) => ({
  traceId: o.trace, spanId: o.id, parentSpanId: o.parent ?? "", name: "x", startTimeUnixNano: o.start ?? jan,
  attributes: Object.entries(o.attrs).map(([key, value]) => ({ key, value })), status: { code: o.error ? 2 : 1 },
});
const file = (spans: unknown[]) => JSON.stringify({ resourceSpans: [{ resource: { attributes: [] }, scopeSpans: [{ spans }] }] });

describe("parseOtlpJson", () => {
  it("counts runs, errors and tokens per agent and month, with child spans inheriting the agent", () => {
    const r = parseOtlpJson(file([
      span({ trace: "t1", id: "a", attrs: { "gen_ai.operation.name": s("invoke_agent"), "gen_ai.agent.name": s("Triage agent"), "gen_ai.usage.input_tokens": i(999) } }),
      span({ trace: "t1", id: "b", parent: "a", attrs: { "gen_ai.operation.name": s("chat"), "gen_ai.usage.input_tokens": i(1_000_000), "gen_ai.usage.output_tokens": i(100_000) } }),
      span({ trace: "t2", id: "c", error: true, attrs: { "gen_ai.operation.name": s("invoke_agent"), "gen_ai.agent.name": s("triage") } }),
      span({ trace: "t3", id: "d", start: feb, attrs: { "gen_ai.operation.name": s("invoke_agent"), "gen_ai.agent.name": s("Triage agent"), "valueloop.escalated": { boolValue: true } } }),
    ]), agents);
    const get = (period: string, metric: string) => r.rows.find((x) => x.period === period && x.metric === metric && x.step === "triage")?.value;
    expect(get("2027-01-01", "agent_runs")).toBe(2);
    expect(get("2027-01-01", "success_rate")).toBe(50);
    // Child usage only (the parent's 999 tokens aren't double counted): 1M × 30 + 0.1M × 150.
    expect(get("2027-01-01", "agent_cost_sek")).toBe(45);
    expect(get("2027-01-01", "escalation_rate")).toBeUndefined();
    expect(get("2027-02-01", "escalation_rate")).toBe(100);
    expect(r.months).toEqual(["2027-01", "2027-02"]);
    expect(r.matchedSpans).toBe(4);
  });

  it("reports agents it can't match and agents without prices", () => {
    const r = parseOtlpJson(file([
      span({ trace: "t1", id: "a", attrs: { "gen_ai.operation.name": s("invoke_agent"), "gen_ai.agent.name": s("Mystery agent") } }),
      span({ trace: "t2", id: "b", attrs: { "gen_ai.operation.name": s("invoke_agent"), "gen_ai.agent.name": s("Resolve bot"), "gen_ai.usage.output_tokens": i(10) } }),
    ]), agents);
    expect(r.unmatched).toEqual(["Mystery agent"]);
    expect(r.unpriced).toEqual(["Resolve bot"]);
    expect(r.rows.some((x) => x.metric === "agent_cost_sek")).toBe(false);
  });

  it("counts traces as runs when a file has no invoke_agent spans", () => {
    const r = parseOtlpJson(file([
      span({ trace: "t1", id: "a", attrs: { "gen_ai.operation.name": s("chat"), "valueloop.step": s("resolve") } }),
      span({ trace: "t2", id: "b", attrs: { "gen_ai.operation.name": s("chat"), "valueloop.step": s("resolve") } }),
    ]), agents);
    expect(r.rows.find((x) => x.metric === "agent_runs")?.value).toBe(2);
  });

  it("rejects files that aren't OTLP JSON", () => {
    expect(() => parseOtlpJson("not json", agents)).toThrow(TelemetryError);
    expect(() => parseOtlpJson("{}", agents)).toThrow(/resourceSpans/);
  });
});
