"use client";

import Link from "next/link";
import { use } from "react";
import { useProcess } from "@/lib/useProcess";
import { formatInt, formatMSEK } from "@/domain/value-model";
import type { Assumptions } from "@/domain/types";
import { PageHead } from "@/components/ui";
import { NotFound } from "@/components/NotFound";

const SLIDERS: Array<{ key: keyof Assumptions; label: string; min: number; max: number; step: number; unit?: string; scale?: number }> = [
  { key: "casesPerMonth", label: "Contacts per month", min: 2000, max: 40000, step: 1000 },
  { key: "costPerHour", label: "Cost per staff hour (SEK)", min: 250, max: 700, step: 10 },
  { key: "agentQuality", label: "Agent resolution quality", min: 50, max: 95, step: 1, unit: "%" },
  { key: "oversightShare", label: "Human oversight (share of saving)", min: 0, max: 40, step: 1, unit: "%" },
  { key: "aiCostPerStepCase", label: "AI cost per step and contact (SEK)", min: 0.05, max: 1.5, step: 0.05 },
  { key: "fixedCostPerYear", label: "Licences and run (kSEK / yr)", min: 0, max: 1_500_000, step: 50_000, scale: 1000 },
];

export default function ValuePage({ params }: { params: Promise<{ processId: string }> }) {
  const { processId } = use(params);
  const { process, value, loading, setAssumption, approveBaseline, can, path } = useProcess(processId);
  if (loading) return null;
  if (!process || !value) return <NotFound />;

  const lo = Math.min(value.low, 0), hi = Math.max(value.high, 1), span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const maxH = Math.max(...value.steps.map((s) => Math.abs(s.hoursReleased)), 1);
  const b = process.baseline;

  return (
    <>
      <PageHead dot="build" eyebrow={`Build · ${process.name}`} title="Value case"
        sub="Assumptions come from the template. Adjust them with the customer, then approve the case as the baseline that Run measures against."
        right={
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {b && <span className="approved">● Baseline approved {new Date(b.approvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {formatMSEK(b.net)} MSEK</span>}
            <Link className="btn" href={path(`/processes/${process.id}/report`)}>Report</Link>
            {can("baseline.approve") && <button className="btn btn-pri" onClick={() => approveBaseline(process.id)}>{b ? "Re-approve baseline" : "Approve as baseline"}</button>}
          </div>
        } />
      <div className="vgrid">
        <section className="panel">
          <div className="panel-h"><h2>Assumptions</h2><span className="example">Template defaults</span></div>
          {SLIDERS.map((s) => {
            const raw = process.assumptions[s.key];
            const shown = s.scale ? raw / s.scale : raw;
            return (
              <div className="sl" key={s.key}>
                <div className="sl-top"><label htmlFor={s.key}>{s.label}</label><b className="num">{shown}{s.unit ?? ""}</b></div>
                <input type="range" id={s.key} min={s.min} max={s.max} step={s.step} value={raw} disabled={!can("design.edit")} onChange={(e) => setAssumption(process.id, s.key, Number(e.target.value))} />
              </div>
            );
          })}
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <section className="panel">
            <p className="label">Net annual value · MSEK</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
              <span className="big num">{formatMSEK(value.net)}</span>
              <p className="muted" style={{ paddingBottom: 8 }}>expected<br />range <span className="num">{formatMSEK(value.low)} to {formatMSEK(value.high)}</span></p>
            </div>
            <div className="range" aria-hidden="true">
              <span className="rail2" />
              <span className="band" style={{ left: `${pct(value.low)}%`, width: `${pct(value.high) - pct(value.low)}%` }} />
              <span className="mid" style={{ left: `calc(${pct(value.net)}% - 2px)` }} />
            </div>
            <div className="ledger">
              <div>
                <div className="lrow"><span>Hours released</span><b className="num">{formatInt(value.hoursReleased)} h</b></div>
                <div className="lrow tot"><span>Benefits</span><b className="num">+{formatMSEK(value.labourBenefit)}</b></div>
              </div>
              <div>
                <div className="lrow"><span>Human oversight</span><b className="num">−{formatMSEK(value.oversightCost)}</b></div>
                <div className="lrow"><span>AI usage</span><b className="num">−{formatMSEK(value.aiCost)}</b></div>
                <div className="lrow"><span>Licences and run</span><b className="num">−{formatMSEK(value.fixedCost)}</b></div>
                <div className="lrow tot"><span>Costs</span><b className="num">−{formatMSEK(value.oversightCost + value.aiCost + value.fixedCost)}</b></div>
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-h"><h2>Hours released per step</h2><Link className="btn btn-sm" href={path(`/processes/${process.id}/map`)}>Change in redesign</Link></div>
            <div className="hbars">
              {value.steps.map((s) => (
                <div className="hb" key={s.step.id}>
                  <span>{s.step.name}{s.status === "removed" ? " (removed)" : s.status === "added" ? " (new)" : ""}</span>
                  <span className="bar"><i className={s.hoursReleased < 0 ? "neg" : s.status === "removed" ? "r" : s.lane[0]} style={{ width: `${(Math.abs(s.hoursReleased) / maxH) * 100}%` }} /></span>
                  <span className="num muted" style={{ textAlign: "right" }}>{formatInt(s.hoursReleased)} h</span>
                </div>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>Range: expected value minus 25% and plus 15% of the labour benefit, until simulation replaces it in phase 2.</p>
          </section>
        </div>
      </div>
    </>
  );
}
