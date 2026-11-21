"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/store";
import { useStrategy } from "@/lib/strategy-store";
import { caseInScenarioTerms, computeScenario, halfYears, type CostKind, type Gate, type GateCheck, type GateStatus, type HalfYear, type Scenario } from "@/domain/strategy";
import { computeValueCase } from "@/domain/value-model";
import { evaluateGate, GATE_METRICS } from "@/domain/gates";
import { measureBasis } from "@/domain/progress";
import { PageHead } from "@/components/ui";
import { money, NumField, signedMoney, StrategyTabs, TextField } from "@/components/strategy-ui";

const KIND_LABEL: Record<CostKind, string> = { "one-off": "One-off cash", running: "Running cash", "own-time": "Own staff time (FTE)" };
const halfLabel = (h: HalfYear) => h.replace("-", " ");
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export default function ScenarioPage({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = use(params);
  const router = useRouter();
  const { path, state, can } = useWorkspace();
  const { plan, editable, update, recordDecision } = useStrategy();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scenario = plan?.scenarios.find((s) => s.id === scenarioId);
  const result = useMemo(() => (plan && scenario ? computeScenario(plan, scenario) : null), [plan, scenario]);

  if (!plan) return <><PageHead eyebrow="Strategy" title="Scenario" /><StrategyTabs /></>;
  if (!scenario || !result) {
    return <><PageHead eyebrow="Strategy" title="Scenario not found" /><StrategyTabs /><p><Link className="btn" href={path("/strategy")}>Back to the overview</Link></p></>;
  }
  const c = plan.currency;
  const halves = halfYears(plan);
  const years = result.years;
  const setScenario = (fn: (s: Scenario) => Scenario) => update((p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === scenarioId ? fn(s) : s)) }));
  const flowName = (id: string) => plan.flows.find((f) => f.id === id)?.name ?? "Unknown flow";
  const candidates = plan.flows.filter((f) => f.decision !== "leave" && !scenario.flows.some((sf) => sf.flowId === f.id));

  // Bottom-up check: the linked process's own value case, in the scenario's terms (before running costs).
  const bottomUp = (flowId: string) => {
    const pid = plan.flows.find((f) => f.id === flowId)?.processId;
    const p = pid ? state?.processes.find((x) => x.id === pid) : undefined;
    if (!p || !p.steps.length) return null;
    const vc = computeValueCase(p.baseline?.steps ?? p.steps, p.baseline?.design ?? p.design, p.baseline?.assumptions ?? p.assumptions);
    return { ...caseInScenarioTerms(vc), approved: !!p.baseline, href: path(`/processes/${p.id}/value`) };
  };

  // Processes linked to flows in this scenario: what a gate can be checked against.
  const linked = scenario.flows.flatMap((sf) => {
    const flow = plan.flows.find((f) => f.id === sf.flowId);
    const p = flow?.processId ? state?.processes.find((x) => x.id === flow.processId && x.steps.length) : undefined;
    return p ? [{ p, sf }] : [];
  });
  const gateResult = (g: Gate) => {
    if (!g.check) return null;
    const l = linked.find((x) => x.p.id === g.check!.processId);
    if (!l) return evaluateGate(plan, g, null);
    const basis = measureBasis(l.p, null);
    return evaluateGate(plan, g, { actuals: l.p.actuals, net: basis.net, aiCost: basis.aiCost, assumptions: basis.assumptions, entry: l.sf });
  };
  const setCheck = (gateId: string, check: GateCheck | undefined) =>
    setScenario((s) => ({ ...s, gates: s.gates.map((x) => (x.id === gateId ? { ...x, check } : x)) }));

  const choose = async () => {
    update((p) => ({ ...p, chosenScenarioId: scenario.id }));
    await recordDecision({ kind: "scenario", attendees: "", text: `Chose "${scenario.name}" as the plan.` });
  };

  const duplicate = () => {
    const id = newId("scenario");
    update((p) => ({ ...p, scenarios: [...p.scenarios, { ...structuredClone(scenario), id, name: `${scenario.name} (copy)` }] }));
    router.push(path(`/strategy/scenarios/${id}`));
  };

  const remove = () => {
    update((p) => ({ ...p, scenarios: p.scenarios.filter((s) => s.id !== scenarioId), chosenScenarioId: p.chosenScenarioId === scenarioId ? null : p.chosenScenarioId }));
    router.push(path("/strategy"));
  };

  const setGate = (id: string, status: GateStatus) => setScenario((s) => ({
    ...s, gates: s.gates.map((g) => (g.id === id ? { ...g, status, decidedAt: status === "open" ? undefined : new Date().toISOString(), decidedBy: status === "open" ? undefined : "" } : g)),
  }));
  const maxRR = Math.max(1, ...result.runRateByHalf.map((h) => h.netRunRate));

  return (
    <>
      <PageHead eyebrow="Strategy · Scenario" title={scenario.name} sub={scenario.summary || "Describe what this scenario means in one or two sentences."}
        right={
          <div className="ph-actions">
            {scenario.id === plan.chosenScenarioId ? <span className="pill pill-rust">Chosen plan</span>
              : editable && <button className="btn btn-pri" onClick={choose}>Choose as the plan</button>}
            {editable && <button className="btn" onClick={duplicate}>Duplicate</button>}
          </div>
        } />
      <StrategyTabs />
      <nav className="scen-switch" aria-label="Scenarios">
        {plan.scenarios.map((s) => <Link key={s.id} href={path(`/strategy/scenarios/${s.id}`)} aria-current={s.id === scenarioId ? "page" : undefined}>{s.name}</Link>)}
      </nav>

      <div className="tiles">
        <div className="tile"><span className="label">Total cost {plan.startYear}–{years.at(-1)!.year}</span><span className="v num">{money(result.totalCost, c)}</span><small>{money(result.totalCash, c)} cash, {money(result.totalOwnTimeCost, c)} own staff time</small></div>
        <div className="tile"><span className="label">Value realised</span><span className="v num">{money(result.totalValue, c)}</span><small>Before programme costs</small></div>
        <div className="tile"><span className="label">Net over the plan</span><span className={`v num ${result.netOverPlan < 0 ? "neg-num" : ""}`}>{signedMoney(result.netOverPlan, c)}</span><small>Payback {result.paybackYear ?? "not in sight"}; cash only {result.paybackYearCash ?? "not in sight"}</small></div>
        <div className="tile"><span className="label">Net value per year after</span><span className="v num">{money(result.valueAfterPlan, c)}</span><small>Run-rate less running costs, from {years.at(-1)!.year + 1}</small></div>
      </div>

      <section className="panel">
        <div className="panel-h"><h2>Cost and value per year, M{c}</h2></div>
        <div className="scroller">
          <table className="tbl ytbl">
            <thead><tr><th></th>{years.map((y) => <th key={y.year} className="num">{y.year}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>
              <tr><td>One-off cash</td>{years.map((y) => <td key={y.year} className="num">{(y.oneOff / 1e6).toFixed(1)}</td>)}<td className="num">{(years.reduce((t, y) => t + y.oneOff, 0) / 1e6).toFixed(1)}</td></tr>
              <tr><td>Running cash</td>{years.map((y) => <td key={y.year} className="num">{(y.running / 1e6).toFixed(1)}</td>)}<td className="num">{(years.reduce((t, y) => t + y.running, 0) / 1e6).toFixed(1)}</td></tr>
              <tr><td>Own staff time <span className="muted">(FTE)</span></td>{years.map((y) => <td key={y.year} className="num">{(y.ownTimeCost / 1e6).toFixed(1)} <span className="muted">({y.ownTimeFte})</span></td>)}<td className="num">{(result.totalOwnTimeCost / 1e6).toFixed(1)}</td></tr>
              <tr className="tot"><td>Total cost</td>{years.map((y) => <td key={y.year} className="num">{(y.totalCost / 1e6).toFixed(1)}</td>)}<td className="num">{(result.totalCost / 1e6).toFixed(1)}</td></tr>
              <tr><td>Value realised in the year</td>{years.map((y) => <td key={y.year} className="num">{(y.valueRealised / 1e6).toFixed(1)}</td>)}<td className="num">{(result.totalValue / 1e6).toFixed(1)}</td></tr>
              <tr className="tot"><td>Net, value less total cost</td>{years.map((y) => <td key={y.year} className={`num ${y.net < 0 ? "neg-num" : ""}`}>{signedMoney(y.net, "").replace(" M", "")}</td>)}<td className={`num ${result.netOverPlan < 0 ? "neg-num" : ""}`}>{signedMoney(result.netOverPlan, "").replace(" M", "")}</td></tr>
              <tr><td>Cumulative net</td>{years.map((y) => <td key={y.year} className={`num ${y.cumulativeNet < 0 ? "neg-num" : ""}`}>{(y.cumulativeNet / 1e6).toFixed(1)}</td>)}<td /></tr>
              <tr><td>Net value per year reached at year end</td>{years.map((y) => <td key={y.year} className="num">{(y.netRunRateEnd / 1e6).toFixed(1)}</td>)}<td /></tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          Value realised is what reaches the accounts in the year; it is lower than the year-end level because flows go live part-way through and ramp up.
          Own staff time is valued at {money(plan.ownTimeRate, c)} per FTE-year.
        </p>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Flows in this scenario</h2><Link className="btn btn-sm" href={path("/strategy/discover")}>Flow inventory</Link></div>
        <div className="scroller">
          <table className="tbl">
            <thead><tr><th>Flow</th><th>Go-live</th><th>Months to full value</th><th>Value per year at full run-rate</th><th>Bottom-up check</th><th /></tr></thead>
            <tbody>
              {scenario.flows.map((sf, i) => {
                const bu = bottomUp(sf.flowId);
                return (
                  <tr key={`${sf.flowId}-${i}`}>
                    <td><b>{flowName(sf.flowId)}</b></td>
                    <td>
                      <select aria-label={`Go-live for ${flowName(sf.flowId)}`} value={sf.goLive} disabled={!editable}
                        onChange={(e) => setScenario((s) => ({ ...s, flows: s.flows.map((f, j) => (j === i ? { ...f, goLive: e.target.value as HalfYear } : f)) }))}>
                        {halves.map((h) => <option key={h} value={h}>{halfLabel(h)}</option>)}
                        {!halves.includes(sf.goLive) && <option value={sf.goLive}>{halfLabel(sf.goLive)}</option>}
                      </select>
                    </td>
                    <td><NumField id={`ramp-${i}`} label="Months to full value" value={sf.rampMonths} step={1} min={0} max={60} disabled={!editable} width={60}
                      onSave={(v) => v !== null && setScenario((s) => ({ ...s, flows: s.flows.map((f, j) => (j === i ? { ...f, rampMonths: Math.round(v) } : f)) }))} /></td>
                    <td><NumField id={`rr-${i}`} label="Value per year at full run-rate" value={sf.runRate} scale={1e6} min={0} disabled={!editable} suffix={`M${c}`}
                      onSave={(v) => v !== null && setScenario((s) => ({ ...s, flows: s.flows.map((f, j) => (j === i ? { ...f, runRate: v } : f)) }))} /></td>
                    <td className="muted" style={{ fontSize: 13 }}>
                      {bu ? (
                        <div className="bu">
                          <Link href={bu.href}>{money(bu.runRate, c)}/yr from the {bu.approved ? "approved" : "draft"} value case</Link>
                          <span>{Math.abs(bu.runRate - sf.runRate) < 0.05e6 ? "Matches this scenario" : `${bu.runRate > sf.runRate ? "Higher" : "Lower"} than this scenario by ${money(Math.abs(bu.runRate - sf.runRate), c)}`}</span>
                          {bu.runningCosts > 0 && <span>AI usage and licences, {money(bu.runningCosts, c)}/yr, belong in running costs below</span>}
                          {editable && Math.abs(bu.runRate - sf.runRate) >= 0.05e6 && (
                            <button className="btn btn-sm" onClick={() => setScenario((s) => ({ ...s, flows: s.flows.map((f, j) => (j === i ? { ...f, runRate: Math.round(bu.runRate) } : f)) }))}>Use in scenario</button>
                          )}
                        </div>
                      ) : "No detailed value case yet"}
                    </td>
                    <td>{editable && <button className="btn btn-sm" aria-label={`Remove ${flowName(sf.flowId)}`} onClick={() => setScenario((s) => ({ ...s, flows: s.flows.filter((_, j) => j !== i) }))}>Remove</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable && candidates.length > 0 && (
          <div className="add-row">
            <label htmlFor="add-flow" className="muted">Add a flow</label>
            <select id="add-flow" value="" onChange={(e) => e.target.value && setScenario((s) => ({ ...s, flows: [...s.flows, { flowId: e.target.value, goLive: halves[1] ?? halves[0], rampMonths: 12, runRate: 0 }] }))}>
              <option value="">Choose a flow…</option>
              {candidates.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Top-down estimates per flow, as value per year before running costs. Once a flow is mapped as a process, its value case appears beside it on the same basis: labour benefit less oversight. The value case&apos;s AI usage and licences are running costs, so list them under costs rather than in the flow&apos;s value.</p>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Costs per year</h2></div>
        <div className="scroller">
          <table className="tbl">
            <thead><tr><th>Cost</th><th>Type</th>{years.map((y) => <th key={y.year}>{y.year}</th>)}<th /></tr></thead>
            <tbody>
              {scenario.costs.map((cl, i) => (
                <tr key={cl.id}>
                  <td><TextField id={`cost-label-${i}`} label="Cost" value={cl.label} disabled={!editable} onSave={(v) => setScenario((s) => ({ ...s, costs: s.costs.map((x, j) => (j === i ? { ...x, label: v } : x)) }))} /></td>
                  <td>
                    <select aria-label="Type of cost" value={cl.kind} disabled={!editable} onChange={(e) => setScenario((s) => ({ ...s, costs: s.costs.map((x, j) => (j === i ? { ...x, kind: e.target.value as CostKind } : x)) }))}>
                      {(Object.keys(KIND_LABEL) as CostKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                  </td>
                  {years.map((y, yi) => (
                    <td key={y.year}>
                      <NumField id={`cost-${i}-${yi}`} label={`${cl.label}, ${y.year}`} value={cl.perYear[yi] ?? 0} scale={cl.kind === "own-time" ? 1 : 1e6} min={0} disabled={!editable} width={70}
                        suffix={cl.kind === "own-time" ? "FTE" : "M"}
                        onSave={(v) => setScenario((s) => ({ ...s, costs: s.costs.map((x, j) => (j === i ? { ...x, perYear: years.map((_, k) => (k === yi ? v ?? 0 : x.perYear[k] ?? 0)) } : x)) }))} />
                    </td>
                  ))}
                  <td>{editable && <button className="btn btn-sm" aria-label={`Remove ${cl.label}`} onClick={() => setScenario((s) => ({ ...s, costs: s.costs.filter((_, j) => j !== i) }))}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => setScenario((s) => ({ ...s, costs: [...s.costs, { id: newId("cost"), label: "New cost", kind: "one-off", perYear: years.map(() => 0) }] }))}>+ Add a cost</button>}
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Roadmap and gates</h2><span className="muted" style={{ fontSize: 13 }}>Decide each gate together at the end of the half-year</span></div>
        <div className="roadmap">
          {result.runRateByHalf.map((h) => (
            <div key={h.period} className="rm-col">
              <p className="label">{halfLabel(h.period)}</p>
              <div className="rm-bar-wrap"><div className="rm-bar" style={{ height: `${Math.max(2, (Math.max(0, h.netRunRate) / maxRR) * 100)}%` }} /></div>
              <p className="num rm-val">{(h.netRunRate / 1e6).toFixed(1)} <span className="muted">M{c}/yr</span></p>
              {scenario.gates.filter((g) => g.period === h.period).map((g) => (
                <div key={g.id} className={`gate gate-${g.status}`}>
                  <TextField id={`gate-${g.id}`} label="Gate criterion" multiline rows={5} value={g.criterion} disabled={!editable}
                    onSave={(v) => setScenario((s) => ({ ...s, gates: s.gates.map((x) => (x.id === g.id ? { ...x, criterion: v } : x)) }))} />
                  <GateCheckEditor gate={g} linked={linked.map((l) => ({ id: l.p.id, name: l.p.name }))} editable={editable} onChange={(chk) => setCheck(g.id, chk)} />
                  {(() => {
                    const r = gateResult(g);
                    if (!r) return null;
                    return (
                      <p className={`gate-check gc-${r.suggestion}`}>
                        <b>{r.suggestion === "met" ? "Measured: met" : r.suggestion === "missed" ? "Measured: missed" : "No data yet"}</b> · {r.detail}
                        {editable && r.suggestion !== "no-data" && r.suggestion !== g.status && <button className="linkbtn" onClick={() => setGate(g.id, r.suggestion as GateStatus)}>Mark {r.suggestion}</button>}
                      </p>
                    );
                  })()}
                  <div className="gate-actions" role="group" aria-label="Gate status">
                    {(["open", "met", "missed"] as GateStatus[]).map((st) => (
                      <button key={st} className="btn btn-sm" aria-pressed={g.status === st} disabled={!editable} onClick={() => setGate(g.id, st)}>{st === "open" ? "Open" : st === "met" ? "Met" : "Missed"}</button>
                    ))}
                  </div>
                </div>
              ))}
              {editable && <button className="linkbtn" onClick={() => setScenario((s) => ({ ...s, gates: [...s.gates, { id: newId("gate"), period: h.period, criterion: "What must be true to continue", status: "open" }] }))}>+ Gate</button>}
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Bars show net value per year reached at the end of each half-year. Give a gate a measure and it is checked against the linked process&apos;s uploaded figures; the room still decides.</p>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Assumptions</h2></div>
        <div className="assumptions">
          {scenario.assumptions.map((a, i) => (
            <div key={i} className="assumption">
              <TextField id={`as-l-${i}`} label="Assumption" value={a.label} disabled={!editable} onSave={(v) => setScenario((s) => ({ ...s, assumptions: s.assumptions.map((x, j) => (j === i ? { ...x, label: v } : x)) }))} />
              <TextField id={`as-v-${i}`} label="Value" value={a.value} disabled={!editable} onSave={(v) => setScenario((s) => ({ ...s, assumptions: s.assumptions.map((x, j) => (j === i ? { ...x, value: v } : x)) }))} />
              {editable && <button className="btn btn-sm" aria-label="Remove assumption" onClick={() => setScenario((s) => ({ ...s, assumptions: s.assumptions.filter((_, j) => j !== i) }))}>Remove</button>}
            </div>
          ))}
        </div>
        {editable && <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => setScenario((s) => ({ ...s, assumptions: [...s.assumptions, { label: "Assumption", value: "" }] }))}>+ Add an assumption</button>}
        {editable && (
          <div className="scen-meta">
            <label className="field" htmlFor="scen-name"><span>Scenario name</span><TextField id="scen-name" label="Scenario name" value={scenario.name} onSave={(v) => v && setScenario((s) => ({ ...s, name: v }))} /></label>
            <label className="field" htmlFor="scen-summary"><span>Summary</span><TextField id="scen-summary" label="Summary" multiline value={scenario.summary} onSave={(v) => setScenario((s) => ({ ...s, summary: v }))} /></label>
            {plan.scenarios.length > 1 && (confirmDelete ? (
              <span className="confirm">Delete this scenario?<button className="btn btn-sm btn-pri" onClick={remove}>Delete</button><button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button></span>
            ) : <button className="btn btn-sm" onClick={() => setConfirmDelete(true)}>Delete scenario</button>)}
          </div>
        )}
      </section>
      {!can("strategy.edit") && <p className="muted" style={{ fontSize: 13 }}>Only admins and Buildway advisors can change the strategy.</p>}
    </>
  );
}


/** Optional measurable condition for a gate: a linked process, a measure, and a target. */
function GateCheckEditor({ gate, linked, editable, onChange }: {
  gate: Gate; linked: Array<{ id: string; name: string }>; editable: boolean; onChange: (c: GateCheck | undefined) => void;
}) {
  const c = gate.check;
  if (!c) {
    if (!editable || !linked.length) return null;
    return <button className="linkbtn" onClick={() => onChange({ processId: linked[0].id, metric: "value_vs_plan", op: "gte", target: 80 })}>+ Measure this gate</button>;
  }
  const unit = GATE_METRICS.find((m) => m.key === c.metric)?.unit ?? "";
  return (
    <div className="gate-measure">
      <select aria-label="Process to check" value={c.processId} disabled={!editable} onChange={(e) => onChange({ ...c, processId: e.target.value })}>
        {linked.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        {!linked.some((l) => l.id === c.processId) && <option value={c.processId}>Process not in this scenario</option>}
      </select>
      <select aria-label="Measure" value={c.metric} disabled={!editable} onChange={(e) => onChange({ ...c, metric: e.target.value })}>
        {GATE_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
      <span className="gm-row">
        <select aria-label="Comparison" value={c.op} disabled={!editable} onChange={(e) => onChange({ ...c, op: e.target.value as GateCheck["op"] })}>
          <option value="gte">at least</option><option value="lte">at most</option>
        </select>
        <input type="number" aria-label="Target" value={c.target} disabled={!editable} onChange={(e) => e.target.value !== "" && onChange({ ...c, target: Number(e.target.value) })} />
        <span className="muted">{unit}</span>
      </span>
      {editable && <button className="linkbtn" onClick={() => onChange(undefined)}>Remove measure</button>}
    </div>
  );
}
