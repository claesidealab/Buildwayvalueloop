"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useWorkspace } from "@/lib/store";
import { useStrategy } from "@/lib/strategy-store";
import { computeScenario, emptyPlan } from "@/domain/strategy";
import { PageHead } from "@/components/ui";
import { money, NumField, signedMoney, StrategyTabs } from "@/components/strategy-ui";

const LINE_COLORS = ["var(--sage)", "var(--human)", "var(--rust)", "var(--coral)", "var(--amber)", "var(--muted)"];

export default function StrategyOverview() {
  const { path } = useWorkspace();
  const { plan, editable, update } = useStrategy();
  const results = useMemo(() => (plan ? plan.scenarios.map((s) => ({ s, r: computeScenario(plan, s) })) : []), [plan]);
  if (!plan) return <><PageHead eyebrow="Strategy" title="AI-native plan" /><StrategyTabs /></>;
  const c = plan.currency;
  const lastYear = plan.startYear + plan.years - 1;

  // Cumulative net per scenario, for the chart.
  const W = 640, H = 220, L = 56, R = 40, T = 12, B = 28;
  const all = results.flatMap(({ r }) => [0, ...r.years.map((y) => y.cumulativeNet)]);
  const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
  const x = (i: number) => L + ((W - L - R) * i) / plan.years;
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));

  const addScenario = () => update((p) => {
    const id = `scenario-${Date.now().toString(36)}`;
    return { ...p, scenarios: [...p.scenarios, { id, name: "New scenario", summary: "", flows: [], costs: [], assumptions: [], gates: [] }] };
  });

  return (
    <>
      <PageHead eyebrow="Strategy" title="AI-native plan"
        sub={`Scenarios for ${plan.startYear} to ${lastYear}: what each costs, cash and own staff time, and the net value it brings. Pick the plan together, then follow it gate by gate.`} />
      <StrategyTabs />

      {plan.scenarios.length === 0 ? (
        <section className="panel">
          <h2>No scenarios yet</h2>
          <p className="muted" style={{ marginTop: 8 }}>Start by discovering and scoring the company's flows, then add a scenario for each level of ambition.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <Link className="btn btn-pri" href={path("/strategy/discover")}>Discover flows</Link>
            {editable && <button className="btn" onClick={addScenario}>Add a scenario</button>}
          </div>
        </section>
      ) : (
        <div className="scen-grid">
          {results.map(({ s, r }) => {
            const chosen = s.id === plan.chosenScenarioId;
            return (
              <Link key={s.id} href={path(`/strategy/scenarios/${s.id}`)} className={`scen-card ${chosen ? "chosen" : ""}`}>
                <div className="scen-top"><span className="label">{s.name}</span>{chosen && <span className="pill pill-rust">Chosen plan</span>}</div>
                <div><span className="scen-big num">{money(r.valueAfterPlan, c)}</span><span className="muted scen-sub">net value per year from {lastYear + 1}</span></div>
                <dl className="kv scen-kv">
                  <dt>Total cost {plan.startYear}–{lastYear}</dt><dd className="num">{money(r.totalCost, c)}</dd>
                  <dt>of which cash</dt><dd className="num">{money(r.totalCash, c)}</dd>
                  <dt>Value realised</dt><dd className="num">{money(r.totalValue, c)}</dd>
                  <dt>Net by end of {lastYear}</dt><dd className={`num ${r.netOverPlan < 0 ? "neg-num" : ""}`}>{signedMoney(r.netOverPlan, c)}</dd>
                  <dt>Payback, own time included</dt><dd className="num">{r.paybackYear ?? "Not in sight"}</dd>
                  <dt>Flows in the plan</dt><dd className="num">{s.flows.length}</dd>
                </dl>
                <p className="muted scen-summary">{s.summary}</p>
              </Link>
            );
          })}
        </div>
      )}

      {results.length > 0 && (
        <div className="mgrid">
          <section className="panel">
            <div className="panel-h">
              <h2>Cumulative net, M{c}</h2>
              <div className="key" style={{ margin: 0 }}>
                {results.map(({ s }, i) => <span key={s.id}><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={s.id === plan.chosenScenarioId ? 5 : 3} /></svg>{s.name}</span>)}
              </div>
            </div>
            <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative net value per scenario by year">
              {[lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                <g key={v}>
                  <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--muted)" : "var(--line)"} strokeWidth="1" />
                  <text x={L - 8} y={y(v) + 4} textAnchor="end">{(v / 1e6).toFixed(0)}</text>
                </g>
              ))}
              {Array.from({ length: plan.years + 1 }, (_, i) => <text key={i} x={x(i)} y={H - 8} textAnchor={i === plan.years ? "end" : i === 0 ? "start" : "middle"}>{i === 0 ? `Start ${plan.startYear}` : `End ${plan.startYear + i - 1}`}</text>)}
              {results.map(({ s, r }, i) => (
                <polyline key={s.id} fill="none" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={s.id === plan.chosenScenarioId ? 5 : 3} strokeLinejoin="round"
                  points={[0, ...r.years.map((yy) => yy.cumulativeNet)].map((v, j) => `${x(j)},${y(v)}`).join(" ")} />
              ))}
            </svg>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Value realised less total cost, cash and own staff time, added up year by year. Below zero means not yet paid back.</p>
          </section>
          <section className="panel">
            <div className="panel-h"><h2>Plan settings</h2></div>
            <div className="settings">
              <label className="field" htmlFor="set-currency"><span>Currency</span>
                <select id="set-currency" value={plan.currency} disabled={!editable} onChange={(e) => update((p) => ({ ...p, currency: e.target.value }))}>
                  {["SEK", "NOK", "DKK", "EUR", "USD", "GBP"].map((cur) => <option key={cur}>{cur}</option>)}
                </select>
              </label>
              <label className="field" htmlFor="set-start"><span>First year</span>
                <NumField id="set-start" label="First year" value={plan.startYear} step={1} min={2000} max={2100} disabled={!editable} width={90}
                  onSave={(v) => v !== null && update((p) => ({ ...p, startYear: Math.round(v) }))} />
              </label>
              <label className="field" htmlFor="set-years"><span>Years in the plan</span>
                <NumField id="set-years" label="Years in the plan" value={plan.years} step={1} min={1} max={10} disabled={!editable} width={60}
                  onSave={(v) => v !== null && update((p) => resizeYears(p, Math.round(v)))} />
              </label>
              <label className="field" htmlFor="set-rate"><span>Own staff time, per FTE-year</span>
                <NumField id="set-rate" label="Own staff time per FTE-year" value={plan.ownTimeRate} scale={1e6} min={0} disabled={!editable} suffix={`M${c}`}
                  onSave={(v) => v !== null && update((p) => ({ ...p, ownTimeRate: v }))} />
              </label>
            </div>
            {editable && <button className="btn btn-sm" style={{ marginTop: 16 }} onClick={addScenario}>+ Add a scenario</button>}
          </section>
        </div>
      )}
    </>
  );
}

/** Changes the number of plan years, padding or trimming every per-year list. */
function resizeYears(p: ReturnType<typeof emptyPlan>, years: number) {
  const fit = <T,>(arr: T[], fill: T) => (arr.length >= years ? arr.slice(0, years) : [...arr, ...Array(years - arr.length).fill(fill)]);
  return {
    ...p, years,
    scenarios: p.scenarios.map((s) => ({ ...s, costs: s.costs.map((cst) => ({ ...cst, perYear: fit(cst.perYear, 0) })) })),
    ambition: p.ambition.map((m) => ({ ...m, targets: fit(m.targets, null) })),
  };
}
