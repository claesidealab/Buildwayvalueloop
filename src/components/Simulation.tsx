"use client";

import { useMemo, useState } from "react";
import { simulate, type QueueResult } from "@/domain/simulation";
import { formatInt, formatMSEK } from "@/domain/value-model";
import type { Assumptions, ProcessDesign, StepDefinition } from "@/domain/types";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const wait = (q: QueueResult) => (!q.stable ? "Grows without limit" : q.avgWaitMinutes! < 1 ? "Under a minute" : `${q.avgWaitMinutes!.toFixed(q.avgWaitMinutes! < 10 ? 1 : 0)} min`);

/**
 * What the redesign does to the people's queue, and the value range when quality, volume and
 * escalation vary. Settings are for exploring; nothing is saved.
 */
export function Simulation({ steps, design, assumptions, unit }: { steps: StepDefinition[]; design: ProcessDesign; assumptions: Assumptions; unit: string }) {
  const [esc, setEsc] = useState(15);
  const [peak, setPeak] = useState(20);
  const [target, setTarget] = useState(20);
  const base = useMemo(() => simulate(steps, design, assumptions, { escalationPct: esc, peakPct: peak, people: 1, targetMinutes: target }, 1, 1), [steps, design, assumptions, esc, peak, target]);
  // Default team: enough to keep the redesigned queue at about 85% utilisation.
  const suggested = Math.max(1, Math.ceil(base.after.load / 0.85));
  const [people, setPeople] = useState<number | null>(null);
  const team = people ?? suggested;
  const r = useMemo(() => simulate(steps, design, assumptions, { escalationPct: esc, peakPct: peak, people: team, targetMinutes: target }), [steps, design, assumptions, esc, peak, team, target]);

  const slider = (id: string, label: string, v: number, set: (n: number) => void, min: number, max: number, step: number, suffix: string) => (
    <div className="sl">
      <div className="sl-top"><label htmlFor={id}>{label}</label><b className="num">{v}{suffix}</b></div>
      <input id={id} type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );

  return (
    <section className="panel">
      <div className="panel-h"><h2>Simulate the redesign</h2><span className="example">For exploring; not saved</span></div>
      <div className="wi-grid">
        <div>
          {slider("sim-esc", "Agent cases handed back to a person", esc, setEsc, 0, 60, 1, "%")}
          {slider("sim-peak", "Extra volume in the busiest month", peak, setPeak, 0, 100, 5, "%")}
          {slider("sim-people", "People working the queue after", team, (n) => setPeople(n), 1, Math.max(20, suggested * 3), 1, " FTE")}
          {slider("sim-target", "Answer target", target, setTarget, 1, 240, 1, " min")}
        </div>
        <div>
          <table className="tbl" style={{ minWidth: 0 }}>
            <thead><tr><th /><th className="num">Today</th><th className="num">After</th></tr></thead>
            <tbody>
              <tr><td>People&apos;s time per {unit}</td><td className="num">{r.today.workloadMinutes.toFixed(1)} min</td><td className="num">{r.after.workloadMinutes.toFixed(1)} min</td></tr>
              <tr><td>People working the queue</td><td className="num">{r.peopleToday}</td><td className="num">{team}</td></tr>
              <tr><td>Utilisation in the busiest month</td><td className="num">{pct(r.today.utilisation)}</td><td className={`num ${!r.after.stable || r.after.utilisation > 0.9 ? "st-warn" : ""}`}>{pct(r.after.utilisation)}</td></tr>
              <tr><td>Average wait</td><td className="num">{wait(r.today)}</td><td className={`num ${!r.after.stable ? "st-warn" : ""}`}>{wait(r.after)}</td></tr>
              <tr><td>Answered within {target} min</td><td className="num">{pct(r.today.withinTarget)}</td><td className="num">{pct(r.after.withinTarget)}</td></tr>
            </tbody>
          </table>
          <div className="sim-range">
            <p className="label">Simulated net value per year · MSEK</p>
            <p><span className="num big-sm">{formatMSEK(r.range.p50)}</span> <span className="muted">median; 8 in 10 runs between <b className="num">{formatMSEK(r.range.p10)}</b> and <b className="num">{formatMSEK(r.range.p90)}</b></span></p>
            <p className="muted" style={{ fontSize: 13 }}>1,000 runs with agent quality ±10 points, volume ±15% and hand-backs ±50%. Hand-backs cost {formatInt(r.escalationHoursPerYear)} hours a year at the current setting.</p>
          </div>
          {!r.after.stable && <p className="banner" role="status" style={{ marginTop: 10 }}>With {team} people the queue keeps growing in the busiest month. Add people, lower hand-backs or automate more.</p>}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>People today: the number needed to run today&apos;s process at the same utilisation as the redesign. The queue is one pooled team over 21 working days of 8 hours (Erlang C).</p>
    </section>
  );
}
