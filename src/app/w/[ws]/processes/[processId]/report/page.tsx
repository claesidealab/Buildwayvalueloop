"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useProcess } from "@/lib/useProcess";
import { computeValueCase, formatInt, formatMSEK } from "@/domain/value-model";
import { summariseActuals } from "@/domain/actuals";
import { AUTONOMY_LEVELS } from "@/domain/autonomy";
import { NotFound } from "@/components/NotFound";

const date = (iso: string | Date) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** A one-page value case for steering groups. Print it or save it as PDF from the browser. */
export default function ReportPage({ params }: { params: Promise<{ processId: string }> }) {
  const { processId } = use(params);
  const { process, state, loading, path } = useProcess(processId);
  const [which, setWhich] = useState<"baseline" | "draft" | null>(null);
  const version = which ?? (process?.baseline ? "baseline" : "draft");
  const design = version === "baseline" && process?.baseline ? process.baseline.design : process?.design;
  const assumptions = version === "baseline" && process?.baseline ? process.baseline.assumptions : process?.assumptions;
  const v = useMemo(() => (process && design && assumptions && process.steps.length ? computeValueCase(process.steps, design, assumptions) : undefined), [process, design, assumptions]);
  if (loading) return null;
  if (!process || !v || !assumptions || !state) return <NotFound />;

  const b = process.baseline;
  const hasHours = process.actuals.some((a) => a.metric === "hours_released");
  const realised = hasHours ? summariseActuals(process.actuals, { net: b?.net ?? v.net, aiCost: v.aiCost, assumptions }) : null;
  const lane = (l: string, level: number) => (l === "agent" ? "AI agent" : l === "system" ? "System" : level ? "Person with AI help" : "Person");

  return (
    <>
      <div className="no-print report-bar">
        <Link className="btn btn-sm" href={path(`/processes/${process.id}/value`)}>Back to value case</Link>
        {b && (
          <div className="seg" role="group" aria-label="Version">
            <button aria-pressed={version === "baseline"} onClick={() => setWhich("baseline")}>Approved baseline</button>
            <button aria-pressed={version === "draft"} onClick={() => setWhich("draft")}>Current draft</button>
          </div>
        )}
        <button className="btn btn-pri" onClick={() => window.print()}>Print or save as PDF</button>
      </div>

      <article className="report">
        <header className="report-head">
          <div>
            <p className="eyebrow">{state.workspace.name} · Value case</p>
            <h1>{process.name}</h1>
            <p className="muted">
              {version === "baseline" && b ? `Approved baseline, ${date(b.approvedAt)}, by ${b.approvedBy}` : "Draft, not approved"}
              {" · "}Printed {date(new Date())}
              {state.workspace.isExample ? " · Example data" : ""}
            </p>
          </div>
          <div className="report-logo" aria-hidden="true"><span className="t">B D</span><span className="b">W Y</span></div>
        </header>

        <section className="report-hero">
          <div><p className="label">Net value per year</p><p className="big num">{formatMSEK(v.net)} <span className="unit">MSEK</span></p><p className="muted num">Range {formatMSEK(v.low)} to {formatMSEK(v.high)} MSEK</p></div>
          <div><p className="label">Hours released per year</p><p className="mid-num num">{formatInt(v.hoursReleased)}</p><p className="muted num">of {formatInt(v.asIsHours)} handled by people today</p></div>
          <div><p className="label">Steps done by people</p><p className="mid-num num">{v.stepsDoneByPeople} of {process.steps.length}</p><p className="muted">after the redesign</p></div>
          {realised && <div><p className="label">Realised so far</p><p className="mid-num num">{realised.realisedShare === null ? "—" : `${Math.round(realised.realisedShare * 100)}%`}</p><p className="muted num">{formatMSEK(realised.realisedToDate)} of {formatMSEK(realised.planToDate)} MSEK planned</p></div>}
        </section>

        <section>
          <h2>Redesigned process</h2>
          <table className="tbl report-tbl">
            <thead><tr><th>Step</th><th>Today, min / {process.unit}</th><th>Autonomy</th><th>Done by</th><th>Automated</th><th>Hours released / yr</th></tr></thead>
            <tbody>
              {v.steps.map((s) => (
                <tr key={s.step.id}>
                  <td><b>{s.step.name}</b></td>
                  <td className="num">{s.step.minutesPerCase.toFixed(1)}</td>
                  <td>L{s.level} {AUTONOMY_LEVELS[s.level].name}</td>
                  <td>{lane(s.lane, s.level)}</td>
                  <td className="num">{Math.round(s.automatedShare * 100)}%</td>
                  <td className="num">{formatInt(s.hoursReleased)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="report-cols">
          <section>
            <h2>Benefits and costs per year</h2>
            <table className="tbl report-tbl">
              <tbody>
                <tr><td>Value of hours released</td><td className="num">+{formatMSEK(v.labourBenefit)} MSEK</td></tr>
                <tr><td>Human oversight</td><td className="num">−{formatMSEK(v.oversightCost)} MSEK</td></tr>
                <tr><td>AI usage</td><td className="num">−{formatMSEK(v.aiCost)} MSEK</td></tr>
                <tr><td>Licences and run</td><td className="num">−{formatMSEK(v.fixedCost)} MSEK</td></tr>
                <tr className="tot"><td><b>Net value</b></td><td className="num"><b>{formatMSEK(v.net)} MSEK</b></td></tr>
              </tbody>
            </table>
          </section>
          <section>
            <h2>Assumptions</h2>
            <table className="tbl report-tbl">
              <tbody>
                <tr><td>Cases per month</td><td className="num">{formatInt(assumptions.casesPerMonth)}</td></tr>
                <tr><td>Cost per staff hour</td><td className="num">{assumptions.costPerHour} SEK</td></tr>
                <tr><td>Agent resolution quality</td><td className="num">{assumptions.agentQuality}%</td></tr>
                <tr><td>Human oversight</td><td className="num">{assumptions.oversightShare}% of saving</td></tr>
                <tr><td>AI cost per step and case</td><td className="num">{assumptions.aiCostPerStepCase} SEK</td></tr>
                <tr><td>Licences and run</td><td className="num">{formatInt(assumptions.fixedCostPerYear / 1000)} kSEK / yr</td></tr>
              </tbody>
            </table>
          </section>
        </div>

        <footer className="report-foot muted">
          How it is calculated: hours released = cases per year × Σ (minutes per step × share automated at its autonomy level) ÷ 60.
          Agent-led steps scale with agent quality. Net value = value of hours − oversight − AI usage − licences.
          The range is −25% / +15% of the labour benefit until simulation is added. Buildway Value Loop.
        </footer>
      </article>
    </>
  );
}
