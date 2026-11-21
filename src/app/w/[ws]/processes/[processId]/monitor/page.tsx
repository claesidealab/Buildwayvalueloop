"use client";

import Link from "next/link";
import { use } from "react";
import { useProcess } from "@/lib/useProcess";
import { formatMSEK } from "@/domain/value-model";
import { LevelBadge, PageHead, TrafficLight } from "@/components/ui";
import { NotFound } from "@/components/NotFound";

/**
 * Example actuals until the first connector (CSV upload, then Zendesk or ServiceNow) lands.
 * Ratios are actual / plan per month; agent stats are success and escalation rates.
 */
const EXAMPLE_RATIOS = [0.55, 0.62, 0.68, 0.72, 0.74, 0.75, 0.76, 0.76, 0.76];
const EXAMPLE_AGENT_STATS: Record<string, [number, number]> = {
  intake: [97, 2], triage: [96, 3], identify: [99, 1], knowledge: [91, 6], resolve: [71, 24], escalate: [88, 9], close: [93, 5], review: [90, 7],
};

export default function MonitorPage({ params }: { params: Promise<{ processId: string }> }) {
  const { processId } = use(params);
  const { process, value, loading, path } = useProcess(processId);
  if (loading) return null;
  if (!process || !value) return <NotFound />;

  const plan = process.baseline?.net ?? value.net;
  const W = 640, H = 240, L = 44, R = 12, T = 14, B = 30;
  const maxV = Math.max(plan, 0.1);
  const x = (i: number) => L + ((W - L - R) * i) / 12;
  const y = (v: number) => T + (H - T - B) * (1 - v / maxV);
  const planPts = Array.from({ length: 13 }, (_, i) => `${x(i)},${y((plan * i) / 12)}`).join(" ");
  const cum = [0, ...EXAMPLE_RATIOS.map((r, i) => ((plan * (i + 1)) / 12) * r)];
  const actPts = cum.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const month = EXAMPLE_RATIOS.length;
  const last = cum[month];
  const automated = value.steps.filter((s) => s.lane !== "human");

  return (
    <>
      <PageHead dot="run" eyebrow={`Run · ${process.name}`} title="Monitor"
        sub="Value against the approved case, the process, and each agent. Gaps trace back to a step you can redesign."
        right={<span className="example">{process.baseline ? "Measured against approved baseline" : "No baseline approved: using current case"} · example actuals</span>} />
      <div className="tiles">
        <div className="tile"><span className="label">Value realised vs plan</span><span className="v num">{Math.round((last / ((plan * month) / 12)) * 100)}%</span><small className="num">{formatMSEK(last)} of {formatMSEK((plan * month) / 12)} MSEK to date</small></div>
        <div className="tile"><span className="label">Resolved without a human</span><span className="v num">58%</span><small>Plan 65%</small></div>
        <div className="tile"><span className="label">Cost per contact</span><span className="v num">−31%</span><small>vs as-is baseline</small></div>
        <div className="tile"><span className="label">CSAT</span><span className="v num">4.4</span><small>+0.2 vs as-is</small></div>
      </div>
      <div className="gap">
        <TrafficLight gate="amber" />
        <p><b>Gap traced to Resolve.</b> Billing cases escalate at 24% against 12% planned. That explains most of the shortfall.</p>
        <Link className="btn btn-pri" href={path(`/processes/${process.id}/map?step=resolve`)}>Open Resolve in redesign</Link>
      </div>
      <div className="mgrid">
        <section className="panel">
          <div className="panel-h">
            <h2>Cumulative value, MSEK</h2>
            <div className="key" style={{ margin: 0 }}>
              <span><svg width="28" height="6" aria-hidden="true"><line x1="0" y1="3" x2="28" y2="3" stroke="var(--muted)" strokeWidth="2.5" strokeDasharray="6 5" /></svg>Plan</span>
              <span><svg width="28" height="6" aria-hidden="true"><line x1="0" y1="3" x2="28" y2="3" stroke="var(--rust)" strokeWidth="4" /></svg>Actual</span>
            </div>
          </div>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cumulative value: actual at ${Math.round(EXAMPLE_RATIOS[month - 1] * 100)} percent of plan in month ${month}`}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={L} x2={W - R} y1={y(maxV * f)} y2={y(maxV * f)} stroke="var(--line)" strokeWidth="1" />
                <text x={L - 8} y={y(maxV * f) + 4} textAnchor="end">{formatMSEK(maxV * f)}</text>
              </g>
            ))}
            {[1, 3, 6, 9, 12].map((m) => <text key={m} x={x(m)} y={H - 8} textAnchor="middle">M{m}</text>)}
            <polyline points={planPts} fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeDasharray="7 6" />
            <polygon points={`${x(0)},${y(0)} ${actPts} ${x(month)},${y(0)}`} fill="var(--coral)" fillOpacity=".15" />
            <polyline points={actPts} fill="none" stroke="var(--rust)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(month)} cy={y(last)} r="6" fill="var(--rust)" />
          </svg>
        </section>
        <section className="panel">
          <div className="panel-h"><h2>Agents</h2><span className="muted" style={{ fontSize: 13 }}>Last 30 days · example</span></div>
          <div className="agents">
            <div className="agent h"><span>Step</span><span>Success</span><span>Escal.</span><span>Status</span></div>
            {automated.map((s) => {
              const [ok, esc] = EXAMPLE_AGENT_STATS[s.step.id] ?? [90, 5];
              const warn = ok < 80;
              return (
                <div className="agent" key={s.step.id}>
                  <span><b>{s.step.name}</b> <LevelBadge level={s.level} lane={s.lane} /></span>
                  <span className="num">{ok}%</span><span className="num">{esc}%</span>
                  <span className={warn ? "st-warn" : "st-ok"}>{warn ? "Check" : "On track"}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
