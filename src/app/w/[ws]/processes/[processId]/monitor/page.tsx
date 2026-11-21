"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { useProcess } from "@/lib/useProcess";
import { computeValueCase, formatMSEK } from "@/domain/value-model";
import { stepNeedsAttention, summariseActuals, STEP_ALERT } from "@/domain/actuals";
import { measureBasis, type MeasureBasis } from "@/domain/progress";
import { useStrategy } from "@/lib/strategy-store";
import type { ProcessInstance } from "@/lib/api-types";
import type { ValueCase } from "@/domain/types";
import { LevelBadge, PageHead, TrafficLight } from "@/components/ui";
import { NotFound } from "@/components/NotFound";
import { ActualsUpload } from "@/components/ActualsUpload";

const monthLabel = (period: string) => new Date(period + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

/**
 * Cumulative plan vs actual chart. `planCum[i]` is the cumulative plan after month i (planCum[0] = 0);
 * `actual` holds cumulative values for the first n months (null = no data that month).
 */
function ValueChart({ planCum, months, actual, labels }: { planCum: number[]; months: number; actual: Array<number | null>; labels: string[] }) {
  const W = 640, H = 240, L = 48, R = 28, T = 14, B = 30;
  const cumPlan = (i: number) => planCum[i] ?? 0;
  const known = actual.filter((v): v is number => v !== null);
  const maxV = Math.max(cumPlan(months), ...known, 0.1);
  const minV = Math.min(0, ...known);
  const x = (i: number) => L + ((W - L - R) * i) / months;
  const y = (v: number) => T + (H - T - B) * (1 - (v - minV) / (maxV - minV));
  const planPts = Array.from({ length: months + 1 }, (_, i) => `${x(i)},${y(cumPlan(i))}`).join(" ");
  const pts: string[] = [`${x(0)},${y(0)}`];
  actual.forEach((v, i) => { if (v !== null) pts.push(`${x(i + 1)},${y(v)}`); });
  const lastIdx = actual.map((v, i) => (v === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
  const ticks = [minV, (minV + maxV) / 2, maxV];
  const step = Math.max(1, Math.ceil(months / 6));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative value, plan compared with actual">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end">{formatMSEK(t)}</text>
        </g>
      ))}
      {labels.map((lab, i) => ((i + 1) % step === 0 || i === 0 ? <text key={lab + i} x={x(i + 1)} y={H - 8} textAnchor="middle">{lab}</text> : null))}
      <polyline points={planPts} fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeDasharray="7 6" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--rust)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      {lastIdx >= 0 && <circle cx={x(lastIdx + 1)} cy={y(actual[lastIdx] as number)} r="6" fill="var(--rust)" />}
    </svg>
  );
}

function Legend() {
  return (
    <div className="key" style={{ margin: 0 }}>
      <span><svg width="28" height="6" aria-hidden="true"><line x1="0" y1="3" x2="28" y2="3" stroke="var(--muted)" strokeWidth="2.5" strokeDasharray="6 5" /></svg>Plan</span>
      <span><svg width="28" height="6" aria-hidden="true"><line x1="0" y1="3" x2="28" y2="3" stroke="var(--rust)" strokeWidth="4" /></svg>Actual</span>
    </div>
  );
}

const pctChange = (now: number, first: number) => (first ? Math.round(((now - first) / first) * 100) : 0);
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function RealMonitor({ process, planCase, basis, path }: { process: ProcessInstance; planCase: ValueCase; basis: MeasureBasis; path: (p: string) => string }) {
  const s = useMemo(() => summariseActuals(process.actuals, basis), [process, basis]);
  let cum = 0;
  const actual = s.months.map((m) => (m.realised === null ? null : (cum += m.realised)));
  const horizon = Math.max(12, s.months.length);
  const periods = Array.from({ length: horizon }, (_, i) => {
    const d = new Date(s.months[0].period + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + i);
    return d.toISOString().slice(0, 10);
  });
  const labels = periods.map(monthLabel);
  const planCum = [0];
  periods.forEach((p) => planCum.push(planCum.at(-1)! + basis.planFor(p)));
  const automated = planCase.steps.filter((st) => (process.design.levels[st.step.id] ?? 0) >= 3);
  const flagged = automated
    .map((st) => ({ st, stats: s.steps[st.step.id] }))
    .filter((x) => x.stats && stepNeedsAttention(x.stats))
    .sort((a, b) => (a.stats!.success ?? 100) - (b.stats!.success ?? 100));
  const L = s.latest;
  const share = s.realisedShare;

  return (
    <>
      <div className="tiles">
        <div className="tile"><span className="label">Value realised vs plan</span><span className="v num">{share === null ? "—" : `${Math.round(share * 100)}%`}</span><small className="num">{share === null ? "Upload hours_released to see this" : `${formatMSEK(s.realisedToDate)} of ${formatMSEK(s.planToDate)} MSEK to date`}</small></div>
        <div className="tile"><span className="label">Resolved without a human</span><span className="v num">{L.handled_without_human ? `${Math.round(L.handled_without_human.value)}%` : "—"}</span><small>{L.handled_without_human ? `${monthLabel(L.handled_without_human.period)} · first month ${Math.round(L.handled_without_human.first)}%` : "Not uploaded"}</small></div>
        <div className="tile"><span className="label">Cost per case</span><span className="v num">{L.cost_per_case ? `${Math.round(L.cost_per_case.value)} kr` : "—"}</span><small>{L.cost_per_case ? `${signed(pctChange(L.cost_per_case.value, L.cost_per_case.first))}% since first month` : "Not uploaded"}</small></div>
        <div className="tile"><span className="label">CSAT</span><span className="v num">{L.csat ? L.csat.value.toFixed(1) : "—"}</span><small>{L.csat ? `First month ${L.csat.first.toFixed(1)}` : "Not uploaded"}</small></div>
      </div>
      {flagged.length ? (
        <div className="gap">
          <TrafficLight gate="amber" />
          <p><b>{flagged[0].st.step.name} needs attention.</b> Agent success {flagged[0].stats!.success ?? "—"}%, escalation {flagged[0].stats!.escalation ?? "—"}% in {monthLabel(flagged[0].stats!.period)}. Alert levels: success under {STEP_ALERT.minSuccess}% or escalation over {STEP_ALERT.maxEscalation}%.</p>
          <Link className="btn btn-pri" href={path(`/processes/${process.id}/map?step=${flagged[0].st.step.id}`)}>Open {flagged[0].st.step.name} in redesign</Link>
        </div>
      ) : (
        <div className="gap gap-ok">
          <TrafficLight gate={share !== null && share < 0.9 ? "amber" : "green"} />
          <p>{share !== null && share < 0.9 ? <><b>Value is behind plan</b>, but no agent step is over its alert levels. Check volumes and the assumptions in the value case.</> : <><b>On track.</b> No agent step is over its alert levels.</>}</p>
        </div>
      )}
      <div className="mgrid">
        <section className="panel">
          <div className="panel-h"><h2>Cumulative value, MSEK</h2><Legend /></div>
          <ValueChart planCum={planCum} months={horizon} actual={actual} labels={labels} />
        </section>
        <section className="panel">
          <div className="panel-h"><h2>Agents</h2><span className="muted" style={{ fontSize: 13 }}>Latest month</span></div>
          <div className="agents">
            <div className="agent h"><span>Step</span><span>Success</span><span>Escal.</span><span>Status</span></div>
            {automated.map((st) => {
              const stats = s.steps[st.step.id];
              const warn = stats ? stepNeedsAttention(stats) : false;
              return (
                <div className="agent" key={st.step.id}>
                  <span><b>{st.step.name}</b> <LevelBadge level={st.level} lane={st.lane} /></span>
                  <span className="num">{stats?.success !== undefined ? `${stats.success}%` : "—"}</span>
                  <span className="num">{stats?.escalation !== undefined ? `${stats.escalation}%` : "—"}</span>
                  <span className={!stats ? "muted" : warn ? "st-warn" : "st-ok"}>{!stats ? "No data" : warn ? "Check" : "On track"}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

/** Shown until real figures are uploaded. Every number here is an example. */
const EXAMPLE_RATIOS = [0.55, 0.62, 0.68, 0.72, 0.74, 0.75, 0.76, 0.76, 0.76];
const EXAMPLE_AGENT_STATS: Record<string, [number, number]> = {
  intake: [97, 2], triage: [96, 3], identify: [99, 1], knowledge: [91, 6], resolve: [71, 24], escalate: [88, 9], close: [93, 5], review: [90, 7],
};

function ExampleMonitor({ process, value, path }: { process: ProcessInstance; value: ValueCase; path: (p: string) => string }) {
  const plan = process.baseline?.net ?? value.net;
  const actual = EXAMPLE_RATIOS.map((r, i) => ((plan * (i + 1)) / 12) * r);
  const month = EXAMPLE_RATIOS.length;
  const last = actual[month - 1];
  const automated = value.steps.filter((s) => s.lane !== "human");
  return (
    <>
      <p className="readonly">These are <b>example figures</b> to show how monitoring works. Upload your actual figures below to replace them.</p>
      <div className="tiles">
        <div className="tile"><span className="label">Value realised vs plan</span><span className="v num">{Math.round((last / ((plan * month) / 12)) * 100)}%</span><small className="num">{formatMSEK(last)} of {formatMSEK((plan * month) / 12)} MSEK · example</small></div>
        <div className="tile"><span className="label">Resolved without a human</span><span className="v num">58%</span><small>Example</small></div>
        <div className="tile"><span className="label">Cost per case</span><span className="v num">−31%</span><small>Example</small></div>
        <div className="tile"><span className="label">CSAT</span><span className="v num">4.4</span><small>Example</small></div>
      </div>
      <div className="gap">
        <TrafficLight gate="amber" />
        <p><b>Example: gap traced to Resolve.</b> Billing cases escalate at 24% against 12% planned.</p>
        <Link className="btn btn-pri" href={path(`/processes/${process.id}/map?step=resolve`)}>Open Resolve in redesign</Link>
      </div>
      <div className="mgrid">
        <section className="panel">
          <div className="panel-h"><h2>Cumulative value, MSEK</h2><Legend /></div>
          <ValueChart planCum={Array.from({ length: 13 }, (_, i) => (plan * i) / 12)} months={12} actual={actual} labels={Array.from({ length: 12 }, (_, i) => `M${i + 1}`)} />
        </section>
        <section className="panel">
          <div className="panel-h"><h2>Agents</h2><span className="muted" style={{ fontSize: 13 }}>Example</span></div>
          <div className="agents">
            <div className="agent h"><span>Step</span><span>Success</span><span>Escal.</span><span>Status</span></div>
            {automated.map((s) => {
              const [ok, esc] = EXAMPLE_AGENT_STATS[s.step.id] ?? [90, 5];
              const warn = stepNeedsAttention({ success: ok, escalation: esc });
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

export default function MonitorPage({ params }: { params: Promise<{ processId: string }> }) {
  const { processId } = use(params);
  const { process, value, loading, path, can } = useProcess(processId);
  const { plan: strategy } = useStrategy();
  const basis = useMemo(() => (process && process.steps.length ? measureBasis(process, strategy) : undefined), [process, strategy]);
  const planCase = useMemo(
    () => (process && process.steps.length ? computeValueCase(process.baseline?.steps ?? process.steps, process.baseline?.design ?? process.design, process.baseline?.assumptions ?? process.assumptions) : undefined),
    [process],
  );
  if (loading) return null;
  if (!process || !value || !planCase || !basis) return <NotFound />;
  const hasActuals = process.actuals.length > 0;

  return (
    <>
      <PageHead dot="run" eyebrow={`Run · ${process.name}`} title="Monitor"
        sub="Value against the approved case, the process, and each agent. Gaps trace back to a step you can redesign."
        right={<span className="example">{process.baseline ? "Measured against approved baseline" : "No baseline approved: using current case"}{hasActuals ? "" : " · example figures"}</span>} />
      {hasActuals && (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {basis.entry
            ? <>Plan follows the chosen scenario, <b>{basis.scenarioName}</b>: go-live {basis.entry.goLive.replace("-", " ")}, full value after {basis.entry.rampMonths} months. Same net value per year as the value case.</>
            : <>Plan is the value case spread evenly over the year. Link this process to a flow in the chosen scenario to follow its go-live and ramp.</>}
        </p>
      )}
      {hasActuals ? <RealMonitor process={process} planCase={planCase} basis={basis} path={path} /> : <ExampleMonitor process={process} value={value} path={path} />}
      {can("actuals.import") && <ActualsUpload processId={process.id} hasData={hasActuals} />}
    </>
  );
}
