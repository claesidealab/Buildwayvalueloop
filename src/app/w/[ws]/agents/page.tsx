"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useWorkspace, type TelemetrySummary } from "@/lib/store";
import { computeValueCase } from "@/domain/value-model";
import { AGENT_RISKS, AGENT_STATUSES, agentRows, PLATFORMS, type AgentRecord, type AgentRow } from "@/domain/agents";
import { stepNeedsAttention } from "@/domain/actuals";
import { LevelBadge, PageHead } from "@/components/ui";

const monthLabel = (period: string) => new Date(period + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const kr = (v: number) => `${Math.round(v).toLocaleString("en-US")} kr`;

function AgentEditor({ row, onSave, onClose }: { row: AgentRow; onSave: (r: Omit<AgentRecord, "step">) => void; onClose: () => void }) {
  const [r, setR] = useState<Omit<AgentRecord, "step">>({ name: row.name, platform: row.platform, owner: row.owner, model: row.model, status: row.status, risk: row.risk, monthlyBudget: row.monthlyBudget, priceIn: row.priceIn, priceOut: row.priceOut });
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v)));
  return (
    <div className="agent-edit">
      <div className="ae-grid">
        <label className="field"><span>Agent name (as in telemetry)</span><input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
        <label className="field"><span>Platform</span>
          <select value={r.platform} onChange={(e) => setR({ ...r, platform: e.target.value })}><option value="">Not chosen</option>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
        </label>
        <label className="field"><span>Owner</span><input value={r.owner} placeholder="Role or name" onChange={(e) => setR({ ...r, owner: e.target.value })} /></label>
        <label className="field"><span>Model</span><input value={r.model} placeholder="e.g. claude-opus-5-5" onChange={(e) => setR({ ...r, model: e.target.value })} /></label>
        <label className="field"><span>Status</span>
          <select value={r.status} onChange={(e) => setR({ ...r, status: e.target.value as AgentRecord["status"] })}>{AGENT_STATUSES.map((s) => <option key={s.s} value={s.s}>{s.label}</option>)}</select>
        </label>
        <label className="field"><span>Risk class</span>
          <select value={r.risk} onChange={(e) => setR({ ...r, risk: e.target.value as AgentRecord["risk"] })}>{AGENT_RISKS.map((x) => <option key={x.r} value={x.r}>{x.label}</option>)}</select>
        </label>
        <label className="field"><span>Budget per month (kr)</span><input type="number" min={0} value={r.monthlyBudget ?? ""} onChange={(e) => setR({ ...r, monthlyBudget: num(e.target.value) })} /></label>
        <label className="field"><span>Price per 1M input tokens (kr)</span><input type="number" min={0} step="0.01" value={r.priceIn ?? ""} onChange={(e) => setR({ ...r, priceIn: num(e.target.value) })} /></label>
        <label className="field"><span>Price per 1M output tokens (kr)</span><input type="number" min={0} step="0.01" value={r.priceOut ?? ""} onChange={(e) => setR({ ...r, priceOut: num(e.target.value) })} /></label>
      </div>
      <div className="ph-actions" style={{ marginTop: 10 }}>
        <button className="btn btn-sm btn-pri" disabled={!r.name.trim()} onClick={() => { onSave({ ...r, name: r.name.trim() }); onClose(); }}>Save</button>
        <button className="btn btn-sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function TelemetryUpload({ processId, processName, onImport }: { processId: string; processName: string; onImport: (pid: string, text: string) => Promise<TelemetrySummary> }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const r = await onImport(processId, await f.text());
      const notes = [r.unmatched.length ? `Not matched: ${r.unmatched.slice(0, 5).join(", ")}.` : "", r.unpriced.length ? `No token prices for ${r.unpriced.join(", ")}, so no cost.` : ""].filter(Boolean).join(" ");
      setMsg({ ok: true, text: `Imported ${r.matchedSpans} of ${r.spans} spans for ${r.months.join(", ")}. ${notes}` });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  return (
    <div className="telemetry">
      <label className="btn btn-sm" htmlFor={`otlp-${processId}`}>{busy ? "Importing…" : `Import telemetry for ${processName}`}</label>
      <input id={`otlp-${processId}`} type="file" accept=".json,application/json" className="sr-only" disabled={busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {msg && <p className={msg.ok ? "ok" : "banner"} role="status" style={{ fontSize: 13 }}>{msg.text}</p>}
    </div>
  );
}

export default function AgentsPage() {
  const { state, path, can, saveAgent, importTelemetry } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(null);
  const groups = useMemo(() => (state?.processes ?? []).filter((p) => p.steps.length).map((p) => {
    const vc = computeValueCase(p.steps, p.design, p.assumptions);
    return { p, rows: agentRows(vc.steps, p.agents, p.actuals) };
  }).filter((g) => g.rows.length), [state]);
  if (!state) return null;
  const all = groups.flatMap((g) => g.rows);
  const live = all.filter((r) => r.status === "live").length;
  const monthCost = all.reduce((t, r) => t + (r.latest?.cost ?? 0), 0);
  const attention = all.filter((r) => r.overBudget || (r.latest && stepNeedsAttention(r.latest)) || r.status === "paused").length;
  const high = all.filter((r) => r.risk === "high").length;
  const editable = can("design.edit");

  return (
    <>
      <PageHead eyebrow="Run · Across processes" title="Agents"
        sub="Every agent in one place: who owns it, where it runs, what it costs and how it performs. Import telemetry from any OpenTelemetry-compatible tool."
        right={state.workspace.isExample ? <span className="example">Example data</span> : undefined} />
      <div className="tiles">
        <div className="tile"><span className="label">Agents</span><span className="v num">{all.length}</span><small>{live} live</small></div>
        <div className="tile"><span className="label">Cost, latest month</span><span className="v num">{monthCost ? kr(monthCost) : "—"}</span><small>{monthCost ? "From telemetry or uploaded figures" : "Import telemetry to see cost"}</small></div>
        <div className="tile"><span className="label">Need attention</span><span className="v num">{attention}</span><small>Over budget, under alert levels or paused</small></div>
        <div className="tile"><span className="label">High-risk</span><span className="v num">{high}</span><small>EU AI Act Annex III use</small></div>
      </div>
      {groups.length === 0 && <section className="panel"><p className="muted">No agents yet. Put a step in the AI agent lane on a process map and it appears here.</p></section>}
      {groups.map(({ p, rows }) => (
        <section className="panel" key={p.id}>
          <div className="panel-h">
            <h2><Link href={path(`/processes/${p.id}/map`)}>{p.name}</Link></h2>
            {can("actuals.import") && <TelemetryUpload processId={p.id} processName={p.name} onImport={importTelemetry} />}
          </div>
          <div className="scroller">
            <table className="tbl agent-tbl">
              <thead><tr><th>Agent</th><th>Platform · owner</th><th>Status</th><th>Risk</th><th className="num">Runs</th><th className="num">Success</th><th className="num">Cost · per run</th><th className="num">Budget</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const warn = r.latest ? stepNeedsAttention(r.latest) : false;
                  return (
                    <Fragment key={r.step}>
                      <tr>
                        <td><b>{r.name}</b> <LevelBadge level={r.level as 0 | 1 | 2 | 3 | 4} lane="agent" /><br /><span className="muted" style={{ fontSize: 13 }}>Step: {r.stepName}{!r.registered && " · not registered yet"}</span></td>
                        <td>{r.platform || <span className="muted">Not set</span>}<br /><span className="muted" style={{ fontSize: 13 }}>{r.owner || "No owner"}</span></td>
                        <td><span className={`status status-${r.status}`}>{AGENT_STATUSES.find((s) => s.s === r.status)?.label}</span></td>
                        <td>{r.risk === "high" ? <b className="st-warn">High</b> : AGENT_RISKS.find((x) => x.r === r.risk)?.label.split(" ")[0]}</td>
                        <td className="num">{r.latest?.runs !== undefined ? r.latest.runs.toLocaleString("en-US") : "—"}</td>
                        <td className={`num ${warn ? "st-warn" : ""}`}>{r.latest?.success !== undefined ? `${r.latest.success}%` : "—"}</td>
                        <td className="num">{r.latest?.cost !== undefined ? <>{kr(r.latest.cost)}{r.costPerRun !== null && <span className="muted"> · {r.costPerRun.toFixed(2)}</span>}</> : "—"}</td>
                        <td className={`num ${r.overBudget ? "st-warn" : ""}`}>{r.monthlyBudget !== null ? `${kr(r.monthlyBudget)}${r.overBudget ? " · over" : ""}` : "—"}</td>
                        <td>
                          {editable && <button className="btn btn-sm" onClick={() => setEditing(editing === `${p.id}/${r.step}` ? null : `${p.id}/${r.step}`)}>{r.registered ? "Edit" : "Register"}</button>}
                          {editable && r.registered && r.status !== "paused" && <button className="linkbtn" style={{ marginLeft: 8 }} onClick={() => saveAgent(p.id, r.step, { ...r, status: "paused" })}>Pause</button>}
                        </td>
                      </tr>
                      {editing === `${p.id}/${r.step}` && (
                        <tr><td colSpan={9}><AgentEditor row={r} onSave={(rec) => saveAgent(p.id, r.step, rec)} onClose={() => setEditing(null)} /></td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.some((r) => r.latest) && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Figures for {monthLabel(rows.map((r) => r.latest?.period ?? "").filter(Boolean).sort().at(-1)!)}. Agent cost counts as the process&apos;s AI cost on the Monitor page when no total AI cost is uploaded.</p>}
        </section>
      ))}
      <details className="panel">
        <summary><b>How to send telemetry</b></summary>
        <div className="muted" style={{ fontSize: 14, marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <p>Export traces as OTLP/JSON from your agent platform, OpenTelemetry collector (file exporter) or an observability tool such as Langfuse, LangSmith or Arize Phoenix.</p>
          <p>Value Loop reads the OpenTelemetry GenAI conventions: <code>gen_ai.operation.name</code> (<code>invoke_agent</code> marks one run), <code>gen_ai.agent.name</code>, <code>gen_ai.usage.input_tokens</code> and <code>output_tokens</code>, and the span status for errors. Add <code>valueloop.escalated = true</code> to runs handed to a person to track escalation.</p>
          <p>Name agents in the registry the way they are named in the telemetry, and set token prices to get cost.</p>
        </div>
      </details>
    </>
  );
}
