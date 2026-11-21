"use client";

import { useMemo, useState } from "react";
import { applyDrivers, computeScenario, NEUTRAL_DRIVERS, sensitivity, type Drivers, type Scenario, type StrategyPlan } from "@/domain/strategy";
import { money, signedMoney } from "@/components/strategy-ui";

const SLIDERS: Array<{ key: keyof Drivers; label: string; min: number; max: number; step: number; fmt: (v: number) => string }> = [
  { key: "valuePct", label: "Value per flow", min: 50, max: 150, step: 5, fmt: (v) => `${v}%` },
  { key: "delayHalves", label: "Go-live timing", min: -2, max: 4, step: 1, fmt: (v) => (v === 0 ? "As planned" : `${Math.abs(v * 6)} months ${v > 0 ? "later" : "earlier"}`) },
  { key: "rampPct", label: "Time to full value", min: 50, max: 200, step: 10, fmt: (v) => `${v}%` },
  { key: "costPct", label: "Cash costs", min: 50, max: 200, step: 5, fmt: (v) => `${v}%` },
  { key: "ownTimePct", label: "Own staff time", min: 50, max: 200, step: 5, fmt: (v) => `${v}%` },
];

/**
 * Drivers on top of a scenario, recalculated as you move them, plus a tornado chart of which
 * driver moves net over the plan the most. Nothing is saved unless someone saves a copy.
 */
export function WhatIf({ plan, scenario, editable, onSaveCopy }: {
  plan: StrategyPlan; scenario: Scenario; editable: boolean; onSaveCopy: (s: Scenario) => void;
}) {
  const [d, setD] = useState<Drivers>(NEUTRAL_DRIVERS);
  const c = plan.currency;
  const base = useMemo(() => computeScenario(plan, scenario), [plan, scenario]);
  const adjusted = useMemo(() => applyDrivers(plan, scenario, d), [plan, scenario, d]);
  const r = useMemo(() => computeScenario(plan, adjusted), [plan, adjusted]);
  const sens = useMemo(() => sensitivity(plan, scenario), [plan, scenario]);
  const changed = (Object.keys(d) as Array<keyof Drivers>).some((k) => d[k] !== NEUTRAL_DRIVERS[k]);
  const span = Math.max(1, ...sens.rows.flatMap((x) => [Math.abs(x.low - sens.base), Math.abs(x.high - sens.base)]));
  const delta = (now: number, was: number) => (Math.abs(now - was) < 0.05e6 ? "" : ` (${signedMoney(now - was, c)})`);

  return (
    <section className="panel whatif">
      <div className="panel-h">
        <h2>What if</h2>
        <div className="ph-actions">
          {changed && <button className="btn btn-sm" onClick={() => setD(NEUTRAL_DRIVERS)}>Reset</button>}
          {changed && editable && (
            <button className="btn btn-sm btn-pri" onClick={() => onSaveCopy({ ...adjusted, name: `${scenario.name} (what if)`, summary: `${scenario.summary} Adjusted: ${SLIDERS.filter((x) => d[x.key] !== NEUTRAL_DRIVERS[x.key]).map((x) => `${x.label.toLowerCase()} ${x.fmt(d[x.key])}`).join(", ")}.`.trim() })}>Save as new scenario</button>
          )}
        </div>
      </div>
      <div className="wi-grid">
        <div className="wi-sliders">
          {SLIDERS.map((x) => (
            <div className="sl" key={x.key}>
              <div className="sl-top"><label htmlFor={`wi-${x.key}`}>{x.label}</label><b className="num">{x.fmt(d[x.key])}</b></div>
              <input id={`wi-${x.key}`} type="range" min={x.min} max={x.max} step={x.step} value={d[x.key]} onChange={(e) => setD({ ...d, [x.key]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
        <div className="wi-results">
          <dl className="kv">
            <dt>Net over the plan</dt><dd className={`num ${r.netOverPlan < 0 ? "neg-num" : ""}`}>{signedMoney(r.netOverPlan, c)}<span className="muted">{delta(r.netOverPlan, base.netOverPlan)}</span></dd>
            <dt>Net value per year after</dt><dd className="num">{money(r.valueAfterPlan, c)}<span className="muted">{delta(r.valueAfterPlan, base.valueAfterPlan)}</span></dd>
            <dt>Total cost</dt><dd className="num">{money(r.totalCost, c)}<span className="muted">{delta(r.totalCost, base.totalCost)}</span></dd>
            <dt>Payback, own time included</dt><dd className="num">{r.paybackYear ?? "Not in sight"}{r.paybackYear !== base.paybackYear && <span className="muted"> (was {base.paybackYear ?? "not in sight"})</span>}</dd>
          </dl>
          <p className="label" style={{ marginTop: 18 }}>What moves net over the plan most</p>
          <div className="tornado" role="table" aria-label="Sensitivity of net over the plan">
            {sens.rows.map((x) => {
              const lo = x.low - sens.base, hi = x.high - sens.base;
              const neg = Math.min(lo, hi), pos = Math.max(lo, hi);
              return (
                <div className="tn-row" role="row" key={x.driver}>
                  <span role="cell" className="tn-label">{x.label}</span>
                  <span role="cell" className="tn-bar" aria-label={`${x.lowLabel}: ${signedMoney(lo, c)}; ${x.highLabel}: ${signedMoney(hi, c)}`}>
                    <span className="tn-neg" style={{ width: `${(Math.abs(Math.min(0, neg)) / span) * 50}%` }} />
                    <span className="tn-pos" style={{ width: `${(Math.max(0, pos) / span) * 50}%` }} />
                  </span>
                  <span role="cell" className="tn-val num muted">{signedMoney(neg, c)} / {signedMoney(pos, c)}</span>
                </div>
              );
            })}
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Each driver moved alone: value ±20%, go-live six months either way, time to full value ±50%, costs ±20%.</p>
        </div>
      </div>
    </section>
  );
}
