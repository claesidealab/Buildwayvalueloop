"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/store";
import { useStrategy, type SuggestedFlow } from "@/lib/strategy-store";
import { flowPriority, suggestedDecision, type FlowDecision, type FlowScores, type StrategyFlow } from "@/domain/strategy";
import { PageHead } from "@/components/ui";
import { RatingSelect, StrategyTabs, TextField } from "@/components/strategy-ui";

const DECISIONS: Array<{ d: FlowDecision; label: string }> = [
  { d: "redesign", label: "Redesign" },
  { d: "build", label: "Build new" },
  { d: "improve", label: "Improve in place" },
  { d: "leave", label: "Leave for now" },
];
const decisionLabel = (d: FlowDecision) => DECISIONS.find((x) => x.d === d)?.label ?? d;
const SCORE_COLS: Array<[keyof FlowScores, string, string]> = [
  ["value", "Value", "Size of the gain if redesigned"],
  ["evidence", "Evidence", "How well AI is proven at this kind of work"],
  ["waiting", "Waiting", "Share of lead time spent in queues and handovers"],
  ["volume", "Volume", "Cases per year"],
];
const newId = () => `flow-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export default function DiscoverPage() {
  const router = useRouter();
  const { path, can } = useWorkspace();
  const { plan, editable, update, discover, createProcess } = useStrategy();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedFlow[] | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  if (!plan) return <><PageHead eyebrow="Strategy" title="Discover flows" /><StrategyTabs /></>;

  const flows = [...plan.flows].sort((a, b) => flowPriority(b.scores) - flowPriority(a.scores));
  const setFlow = (id: string, fn: (f: StrategyFlow) => StrategyFlow) => update((p) => ({ ...p, flows: p.flows.map((f) => (f.id === id ? fn(f) : f)) }));
  const addFlow = (f: Omit<StrategyFlow, "id">) => update((p) => ({ ...p, flows: [...p.flows, { ...f, id: newId() }] }));

  const runDiscovery = async () => {
    setBusy(true); setAiError(null); setSuggestions(null); setAdded(new Set());
    try { setSuggestions(await discover(text)); }
    catch (e) { setAiError((e as Error).message); }
    finally { setBusy(false); }
  };

  const toProcess = async (flowId: string) => {
    const pid = await createProcess(flowId);
    if (pid) router.push(path(`/processes/${pid}/map`));
  };

  return (
    <>
      <PageHead eyebrow="Strategy" title="Discover flows"
        sub="List the company's flows across departments and score them. Redesign where waiting and handovers dominate, volume is high and there is evidence that it works." />
      <StrategyTabs />

      {editable && (
        <section className="panel ai-panel">
          <div className="panel-h"><h2>Find flows with AI</h2><span className="pill">Claude</span></div>
          <p className="muted" style={{ fontSize: 14 }}>Paste a description of the company, interview notes or process documents. Claude suggests flows with scores and reasons; you choose which to add.</p>
          <label className="field" htmlFor="discover-text" style={{ marginTop: 12 }}>
            <span>Material</span>
            <textarea id="discover-text" rows={6} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="For example: We are a B2B services company with 450 employees. Customers contact support by phone and email; orders are entered by hand into the ERP and wait for credit approval…" />
          </label>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button className="btn btn-pri" onClick={runDiscovery} disabled={busy || text.trim().length < 20}>{busy ? "Reading the material…" : "Suggest flows"}</button>
            <span className="muted" style={{ fontSize: 13 }}>The text is sent to Anthropic's Claude to analyse. Leave out personal data.</span>
          </div>
          {aiError && <p className="banner" role="alert" style={{ marginTop: 12 }}>{aiError}</p>}
          {suggestions && (
            <div className="suggestions">
              {suggestions.length === 0 && <p className="muted">No flows found in the material. Add more detail and try again.</p>}
              {suggestions.map((s, i) => (
                <div key={i} className="suggestion">
                  <div>
                    <h3>{s.name}{s.isNew && <span className="pill" style={{ marginLeft: 8 }}>New flow</span>}</h3>
                    <p className="muted" style={{ fontSize: 13 }}>{s.area} · owner {s.owner}</p>
                    <p style={{ fontSize: 14, marginTop: 6 }}>{s.description}</p>
                    <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{s.rationale}</p>
                  </div>
                  <div className="suggestion-side">
                    <span className="score-badge num">{flowPriority(s.scores)}</span>
                    <span className="muted" style={{ fontSize: 13 }}>{decisionLabel(s.decision)}</span>
                    {s.duplicateOf && <span className="muted" style={{ fontSize: 12 }}>Similar to “{s.duplicateOf}”</span>}
                    {added.has(i) ? <span className="ok" style={{ fontSize: 13 }}>Added</span> : (
                      <button className="btn btn-sm" onClick={() => {
                        addFlow({ name: s.name, area: s.area, description: s.description, owner: s.owner, scores: s.scores, decision: s.decision, isNew: s.isNew, processId: null, rationale: s.rationale, source: "ai" });
                        setAdded((a) => new Set(a).add(i));
                      }}>Add</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <div className="panel-h">
          <h2>Flow inventory</h2>
          {editable && <button className="btn btn-sm" onClick={() => addFlow({ name: "New flow", area: "", description: "", owner: "", scores: { value: "medium", evidence: "medium", waiting: "medium", volume: "medium" }, decision: "improve", processId: null, source: "manual" })}>+ Add a flow</button>}
        </div>
        {flows.length === 0 && <p className="muted">No flows yet. Add them by hand or let Claude suggest them from your material.</p>}
        <div className="flows">
          {flows.map((f) => {
            const prio = flowPriority(f.scores);
            const sug = suggestedDecision(f.scores, f.isNew);
            const hasProcess = !!f.processId;
            return (
              <article key={f.id} className={`flow flow-${f.decision}`}>
                <div className="flow-main">
                  <div className="flow-head">
                    <TextField id={`name-${f.id}`} label="Flow name" value={f.name} disabled={!editable} onSave={(v) => v && setFlow(f.id, (x) => ({ ...x, name: v }))} />
                    {f.source === "ai" && <span className="pill">From AI</span>}
                    {f.isNew && <span className="pill">New flow</span>}
                  </div>
                  <TextField id={`desc-${f.id}`} label="What the flow covers" multiline value={f.description} placeholder="From … to …" disabled={!editable} onSave={(v) => setFlow(f.id, (x) => ({ ...x, description: v }))} />
                  <div className="flow-meta">
                    <label className="field" htmlFor={`area-${f.id}`}><span>Departments</span><TextField id={`area-${f.id}`} label="Departments" value={f.area} disabled={!editable} onSave={(v) => setFlow(f.id, (x) => ({ ...x, area: v }))} /></label>
                    <label className="field" htmlFor={`owner-${f.id}`}><span>Owner</span><TextField id={`owner-${f.id}`} label="Owner" value={f.owner} disabled={!editable} onSave={(v) => setFlow(f.id, (x) => ({ ...x, owner: v }))} /></label>
                  </div>
                  {f.rationale && <p className="muted" style={{ fontSize: 13 }}>{f.rationale}</p>}
                </div>
                <div className="flow-scores">
                  {SCORE_COLS.map(([k, label, help]) => (
                    <label key={k} className="field" htmlFor={`${k}-${f.id}`} title={help}><span>{label}</span>
                      <RatingSelect id={`${k}-${f.id}`} label={`${label} for ${f.name}`} value={f.scores[k]} disabled={!editable} onChange={(r) => setFlow(f.id, (x) => ({ ...x, scores: { ...x.scores, [k]: r } }))} />
                    </label>
                  ))}
                  <div className="prio"><span className="label">Priority</span><span className="score num"><b>{prio}</b><span className="bar"><i style={{ width: `${prio}%` }} /></span></span></div>
                </div>
                <div className="flow-decide">
                  <label className="field" htmlFor={`dec-${f.id}`}><span>Decision</span>
                    <select id={`dec-${f.id}`} value={f.decision} disabled={!editable} onChange={(e) => setFlow(f.id, (x) => ({ ...x, decision: e.target.value as FlowDecision }))}>
                      {DECISIONS.map((d) => <option key={d.d} value={d.d}>{d.label}</option>)}
                    </select>
                  </label>
                  {sug !== f.decision && <p className="muted" style={{ fontSize: 12 }}>The scoring rule suggests: {decisionLabel(sug)}</p>}
                  <label className="check" style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={!!f.isNew} disabled={!editable} onChange={(e) => setFlow(f.id, (x) => ({ ...x, isNew: e.target.checked }))} />
                    Doesn't exist today
                  </label>
                  {hasProcess ? <Link className="btn btn-sm" href={path(`/processes/${f.processId}/map`)}>Open process map</Link>
                    : (f.decision === "redesign" || f.decision === "build") && editable && can("design.edit")
                      ? <button className="btn btn-sm btn-pri" onClick={() => toProcess(f.id)}>Map this flow</button> : null}
                  {editable && !hasProcess && <button className="linkbtn" onClick={() => update((p) => ({ ...p, flows: p.flows.filter((x) => x.id !== f.id), scenarios: p.scenarios.map((s) => ({ ...s, flows: s.flows.filter((sf) => sf.flowId !== f.id) })) }))}>Remove flow</button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
