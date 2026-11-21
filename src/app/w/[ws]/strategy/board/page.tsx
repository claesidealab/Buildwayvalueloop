"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useWorkspace } from "@/lib/store";
import { useStrategy } from "@/lib/strategy-store";
import { computeScenario, flowPriority, sensitivity } from "@/domain/strategy";
import { evaluateGate } from "@/domain/gates";
import { measureBasis } from "@/domain/progress";
import { money, signedMoney } from "@/components/strategy-ui";

const date = (iso: string | Date) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const DEC: Record<string, string> = { redesign: "Redesign", build: "Build new", improve: "Improve in place", leave: "Leave for now" };

/** A leadership pack: scenarios side by side, the chosen plan year by year, gates, ambition and decisions. Print or save as PDF. */
export default function BoardPage() {
  const { state, path } = useWorkspace();
  const { plan } = useStrategy();
  const results = useMemo(() => (plan ? plan.scenarios.map((s) => ({ s, r: computeScenario(plan, s) })) : []), [plan]);
  if (!plan || !state) return null;
  const c = plan.currency;
  const chosen = results.find((x) => x.s.id === plan.chosenScenarioId) ?? results[0];
  const sens = chosen ? sensitivity(plan, chosen.s) : null;
  const years = chosen?.r.years ?? [];
  const yearLabels = Array.from({ length: plan.years }, (_, i) => plan.startYear + i);
  const flowName = (id: string) => plan.flows.find((f) => f.id === id)?.name ?? "Unknown flow";
  const gateRows = chosen ? chosen.s.gates.map((g) => {
    let measured = null;
    if (g.check) {
      const flow = plan.flows.find((f) => f.processId === g.check!.processId);
      const entry = flow ? chosen.s.flows.find((x) => x.flowId === flow.id) ?? null : null;
      const p = state.processes.find((x) => x.id === g.check!.processId && x.steps.length);
      const b = p ? measureBasis(p, null) : null;
      measured = evaluateGate(plan, g, p && b ? { actuals: p.actuals, net: b.net, aiCost: b.aiCost, assumptions: b.assumptions, agentSteps: b.agentSteps, entry } : null);
    }
    return { g, measured };
  }) : [];
  const top = [...plan.flows].sort((a, b) => flowPriority(b.scores) - flowPriority(a.scores)).slice(0, 8);
  const decisions = [...plan.decisions].slice(-8).reverse();
  const maxRR = Math.max(1, ...(chosen?.r.runRateByHalf.map((h) => h.netRunRate) ?? [1]));

  return (
    <>
      <div className="no-print report-bar">
        <Link className="btn btn-sm" href={path("/strategy")}>Back to strategy</Link>
        <button className="btn btn-pri" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <article className="report board">
        <header className="report-head">
          <div>
            <p className="eyebrow">{state.workspace.name} · Leadership pack</p>
            <h1>AI-native plan {plan.startYear}–{plan.startYear + plan.years - 1}</h1>
            <p className="muted">Printed {date(new Date())}{chosen ? ` · Chosen plan: ${chosen.s.name}` : ""}{plan.isExample ? " · Example plan for a made-up company" : ""}</p>
          </div>
          <div className="report-logo" aria-hidden="true"><span className="t">B D</span><span className="b">W Y</span></div>
        </header>

        <section>
          <h2>Scenarios side by side, M{c}</h2>
          <table className="tbl report-tbl">
            <thead><tr><th>Scenario</th><th className="num">Total cost</th><th className="num">of which own time</th><th className="num">Value realised</th><th className="num">Net over the plan</th><th className="num">Net value per year after</th><th className="num">Payback</th><th className="num">Flows</th></tr></thead>
            <tbody>
              {results.map(({ s, r }) => (
                <tr key={s.id} className={s.id === plan.chosenScenarioId ? "tot" : ""}>
                  <td><b>{s.name}</b>{s.id === plan.chosenScenarioId ? " (chosen)" : ""}</td>
                  <td className="num">{(r.totalCost / 1e6).toFixed(1)}</td>
                  <td className="num">{(r.totalOwnTimeCost / 1e6).toFixed(1)}</td>
                  <td className="num">{(r.totalValue / 1e6).toFixed(1)}</td>
                  <td className="num">{signedMoney(r.netOverPlan, "").replace(" M", "")}</td>
                  <td className="num">{(r.valueAfterPlan / 1e6).toFixed(1)}</td>
                  <td className="num">{r.paybackYear ?? "—"}</td>
                  <td className="num">{r.flowsLive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {chosen && (
          <>
            <div className="report-cols">
              <section>
                <h2>{chosen.s.name}: year by year, M{c}</h2>
                <table className="tbl report-tbl">
                  <thead><tr><th /><>{years.map((y) => <th key={y.year} className="num">{y.year}</th>)}</></tr></thead>
                  <tbody>
                    <tr><td>Total cost</td>{years.map((y) => <td key={y.year} className="num">{(y.totalCost / 1e6).toFixed(1)}</td>)}</tr>
                    <tr><td>Value realised</td>{years.map((y) => <td key={y.year} className="num">{(y.valueRealised / 1e6).toFixed(1)}</td>)}</tr>
                    <tr className="tot"><td>Net</td>{years.map((y) => <td key={y.year} className="num">{signedMoney(y.net, "").replace(" M", "")}</td>)}</tr>
                    <tr><td>Cumulative net</td>{years.map((y) => <td key={y.year} className="num">{(y.cumulativeNet / 1e6).toFixed(1)}</td>)}</tr>
                  </tbody>
                </table>
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{chosen.s.summary}</p>
              </section>
              <section>
                <h2>Net value per year reached, by half-year</h2>
                <div className="board-bars">
                  {chosen.r.runRateByHalf.map((h) => (
                    <div key={h.period} className="bb-col">
                      <div className="bb-wrap"><div className="bb" style={{ height: `${Math.max(2, (Math.max(0, h.netRunRate) / maxRR) * 100)}%` }} /></div>
                      <span className="num">{(h.netRunRate / 1e6).toFixed(1)}</span>
                      <span className="muted">{h.period.replace("-", " ")}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="report-cols">
              <section>
                <h2>Flows in the plan</h2>
                <table className="tbl report-tbl">
                  <thead><tr><th>Flow</th><th>Go-live</th><th className="num">Months to full value</th><th className="num">Value / yr, M{c}</th></tr></thead>
                  <tbody>{chosen.s.flows.map((f, i) => <tr key={i}><td>{flowName(f.flowId)}</td><td>{f.goLive.replace("-", " ")}</td><td className="num">{f.rampMonths}</td><td className="num">{(f.runRate / 1e6).toFixed(1)}</td></tr>)}</tbody>
                </table>
              </section>
              {sens && (
                <section>
                  <h2>What moves net over the plan most</h2>
                  <table className="tbl report-tbl">
                    <thead><tr><th>Driver</th><th className="num">Pessimistic</th><th className="num">Optimistic</th></tr></thead>
                    <tbody>{sens.rows.map((r) => <tr key={r.driver}><td>{r.label}</td><td className="num">{r.lowLabel}: {signedMoney(r.low - sens.base, c)}</td><td className="num">{r.highLabel}: {signedMoney(r.high - sens.base, c)}</td></tr>)}</tbody>
                  </table>
                </section>
              )}
            </div>

            {gateRows.length > 0 && (
              <section>
                <h2>Gates</h2>
                <table className="tbl report-tbl">
                  <thead><tr><th>Half-year</th><th>What must be true</th><th>Measured</th><th>Decision</th></tr></thead>
                  <tbody>{gateRows.map(({ g, measured }) => (
                    <tr key={g.id}><td>{g.period.replace("-", " ")}</td><td>{g.criterion}</td><td>{measured ? measured.detail : "Decided in the room"}</td><td>{g.status === "open" ? "Open" : g.status === "met" ? "Met" : "Missed"}</td></tr>
                  ))}</tbody>
                </table>
              </section>
            )}
          </>
        )}

        <div className="report-cols">
          <section>
            <h2>AI-native ambition</h2>
            <table className="tbl report-tbl">
              <thead><tr><th>Measure</th>{yearLabels.map((y) => <th key={y} className="num">{y}</th>)}</tr></thead>
              <tbody>{plan.ambition.map((a) => <tr key={a.id}><td>{a.name} <span className="muted">({a.unit})</span></td>{yearLabels.map((y, i) => <td key={y} className="num">{a.targets[i] ?? "—"}</td>)}</tr>)}</tbody>
            </table>
          </section>
          <section>
            <h2>Flow inventory, by priority</h2>
            <table className="tbl report-tbl">
              <thead><tr><th>Flow</th><th className="num">Priority</th><th>Decision</th></tr></thead>
              <tbody>{top.map((f) => <tr key={f.id}><td>{f.name}</td><td className="num">{flowPriority(f.scores)}</td><td>{DEC[f.decision]}</td></tr>)}</tbody>
            </table>
          </section>
        </div>

        {decisions.length > 0 && (
          <section>
            <h2>Decisions</h2>
            <table className="tbl report-tbl">
              <thead><tr><th>Date</th><th>Decision</th><th>Recorded by</th><th>In the room</th></tr></thead>
              <tbody>{decisions.map((d) => <tr key={d.id}><td>{date(d.at)}</td><td>{d.text}</td><td>{d.recordedBy}</td><td>{d.attendees || "—"}</td></tr>)}</tbody>
            </table>
          </section>
        )}

        <footer className="report-foot muted">
          Cost covers cash and own staff time at {money(plan.ownTimeRate, c)} per FTE-year. Value realised follows each flow&apos;s go-live and ramp; net value per year after the plan is the final run-rate less running costs.
          Sensitivity moves one driver at a time. Buildway Value Loop.
        </footer>
      </article>
    </>
  );
}
