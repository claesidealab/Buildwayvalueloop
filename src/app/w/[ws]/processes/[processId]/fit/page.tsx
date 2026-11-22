"use client";

import { use } from "react";
import { useProcess } from "@/lib/useProcess";
import { factorTone, fitScore, suggestedLevel } from "@/domain/fit";
import { laneOf } from "@/domain/autonomy";
import type { FitFactors } from "@/domain/types";
import { LevelBadge, PageHead } from "@/components/ui";
import { NotFound } from "@/components/NotFound";

const FACTORS: Array<[keyof FitFactors, string]> = [["volume", "Volume"], ["ruleBased", "Rule-based"], ["dataReady", "Data ready"], ["errorRisk", "Error risk"]];
const TONE = { good: "f-good", neutral: "f-mid", poor: "f-poor" } as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function FitPage({ params }: { params: Promise<{ processId: string }> }) {
  const { processId } = use(params);
  const { process, value, loading, setLevel, can } = useProcess(processId);
  const editable = can("design.edit");
  if (loading) return null;
  if (!process || !value) return <NotFound />;

  const toBe = process.steps.filter((s) => s.phase !== "as-is");
  const applyAll = () => toBe.forEach((s) => setLevel(process.id, s.id, suggestedLevel(s.fit)));

  return (
    <>
      <PageHead dot="build" eyebrow={`Build · ${process.name}`} title="Agent fit"
        sub="Each step is scored on volume, how rule-based it is, data readiness and the cost of an error. Apply a suggestion or keep your own level."
        right={editable ? <button className="btn btn-pri" onClick={applyAll}>Apply all suggestions</button> : undefined} />
      <section className="panel">
        <div className="scroller">
          <table className="tbl">
            <thead><tr><th>Step</th>{FACTORS.map(([, l]) => <th key={l}>{l}</th>)}<th>Fit score</th><th>Suggested</th><th>Current</th><th /></tr></thead>
            <tbody>
              {toBe.map((s) => {
                const score = fitScore(s.fit), sug = suggestedLevel(s.fit), cur = process.design.levels[s.id] ?? 0;
                return (
                  <tr key={s.id}>
                    <td><b>{s.name}</b></td>
                    {FACTORS.map(([k]) => <td key={k}><span className={`f ${TONE[factorTone(k, s.fit[k])]}`}>{cap(s.fit[k])}</span></td>)}
                    <td><span className={`fitcell num ${score >= 80 ? "fit-hi" : score >= 60 ? "fit-md" : "fit-lo"}`}>{score}</span></td>
                    <td>{(() => { const ln = laneOf(s.id, sug, process.design); return <span className={`sug sug-${ln}`}>{ln === "agent" ? "AI agent" : ln === "system" ? "System" : "Human"} · L{sug}</span>; })()}</td>
                    <td><LevelBadge level={cur} lane={laneOf(s.id, cur, process.design)} /></td>
                    <td>{cur === sug ? <span className="muted" style={{ fontSize: 13 }}>Applied</span> : !editable ? null : <button className="btn btn-sm" onClick={() => setLevel(process.id, s.id, sug)}>Apply</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>Cell colour: green favours an agent, grey is neutral, amber counts against. Fit score: coral 80 and above, light coral 60–79. High error risk caps the suggestion at L2.</p>
      </section>
    </>
  );
}
