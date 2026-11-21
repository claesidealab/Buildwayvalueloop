"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProcess } from "@/lib/useProcess";
import { AUTONOMY_LEVELS, laneOf } from "@/domain/autonomy";
import { fitScore, suggestedLevel } from "@/domain/fit";
import { formatInt, formatMSEK } from "@/domain/value-model";
import type { AutonomyLevel, Lane } from "@/domain/types";
import { PageHead } from "@/components/ui";
import { NotFound } from "@/components/NotFound";

const LANES: Array<{ key: Lane; label: string; dot: string }> = [
  { key: "human", label: "Human", dot: "d-run" },
  { key: "agent", label: "AI agent", dot: "d-build" },
  { key: "system", label: "System", dot: "d-find" },
];

export default function MapPage({ params }: { params: Promise<{ processId: string }> }) {
  const { processId } = use(params);
  const { process, template, value, setLevel, setSystemStep } = useProcess(processId);
  const initial = useSearchParams().get("step");
  const [mode, setMode] = useState<"asis" | "tobe">("tobe");
  const [sel, setSel] = useState<string>(initial ?? "resolve");
  if (!process || !template || !value) return <NotFound />;

  const tobe = mode === "tobe";
  const step = template.steps.find((s) => s.id === sel) ?? template.steps[0];
  const sv = value.steps.find((s) => s.step.id === step.id)!;
  const perYear = process.assumptions.casesPerMonth * 12;

  return (
    <>
      <PageHead dot="find" eyebrow={`Find · ${process.name}`} title="Map and redesign" sub="Click a step to set who does it and at what autonomy. Value updates as you go." />
      <div className="canvas-grid">
        <section className="panel">
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Version">
              <button aria-pressed={!tobe} onClick={() => setMode("asis")}>As-is</button>
              <button aria-pressed={tobe} onClick={() => setMode("tobe")}>To-be</button>
            </div>
            <div className="key"><span><i className="dot d-run" />Human</span><span><i className="dot d-build" />AI agent</span><span><i className="dot d-find" />System</span></div>
          </div>
          <div className="scroller">
            <div className="lanes">
              <div className="hd" />
              {template.steps.map((s) => <div key={s.id} className={`hd ${s.id === step.id ? "sel" : ""}`}>{s.name}</div>)}
              {LANES.map((ln, i) => (
                <div key={ln.key} style={{ display: "contents" }}>
                  <div className={`lk ${i % 2 ? "alt" : ""}`}><i className={`dot ${ln.dot}`} />{ln.label}</div>
                  {template.steps.map((s) => {
                    const level = tobe ? (process.design.levels[s.id] ?? 0) : 0;
                    const lane = tobe ? laneOf(s.id, level, process.design) : "human";
                    return (
                      <div key={s.id} className={`cell ${i % 2 ? "alt" : ""}`}>
                        {lane === ln.key && (
                          <button className={`step s-${lane} ${s.id === step.id ? "sel" : ""}`} onClick={() => setSel(s.id)} aria-label={`${s.name}, level ${level}`}>
                            <b>L{level}</b>{s.name}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="summary">
            <div><small>Net value / yr</small><b className="num">{tobe ? `${formatMSEK(value.net)} MSEK` : "—"}</b></div>
            <div><small>Steps done by people</small><b className="num">{tobe ? value.stepsDoneByPeople : template.steps.length} of {template.steps.length}</b></div>
            <div><small>Hours released / yr</small><b className="num">{tobe ? formatInt(value.hoursReleased) : 0}</b></div>
            <div className="go"><Link className="btn" href={`/processes/${process.id}/value`}>Open value case</Link></div>
          </div>
        </section>

        <aside className="panel insp">
          <p className="label">{tobe ? "Selected step" : "As-is"}</p>
          <h2>{step.name}</h2>
          <p className="muted">{step.description}</p>
          {tobe ? (
            <>
              <div>
                <p className="label" style={{ marginBottom: 8 }}>Autonomy</p>
                <div className="levels" role="group" aria-label="Autonomy level">
                  {AUTONOMY_LEVELS.map((L) => (
                    <button key={L.level} aria-pressed={L.level === sv.level} title={`${L.name}: ${L.description}`} onClick={() => setLevel(process.id, step.id, L.level as AutonomyLevel)}>
                      <b>L{L.level}</b><span>{L.short}</span>
                    </button>
                  ))}
                </div>
                <p className="muted" style={{ marginTop: 8, fontSize: 14 }}><b>{AUTONOMY_LEVELS[sv.level].name}.</b> {AUTONOMY_LEVELS[sv.level].description}</p>
              </div>
              <label className="check">
                <input type="checkbox" checked={process.design.systemSteps.includes(step.id)} disabled={sv.level < 4} onChange={(e) => setSystemStep(process.id, step.id, e.target.checked)} />
                Run as a rule-based system, not an AI agent
              </label>
              <dl className="kv">
                <dt>Done by</dt><dd>{sv.lane === "agent" ? "AI agent" : sv.lane === "system" ? "System" : sv.level ? "Human with AI help" : "Human"}</dd>
                <dt>Handling time today</dt><dd className="num">{step.minutesPerCase.toFixed(1)} min / {template.unit}</dd>
                <dt>Share automated</dt><dd className="num">{Math.round(sv.automatedShare * 100)}%</dd>
                <dt>Hours released / yr</dt><dd className="num">{formatInt(sv.hoursReleased)}</dd>
                <dt>Agent fit score</dt><dd className="num">{fitScore(step.fit)} · suggests L{suggestedLevel(step.fit)}</dd>
              </dl>
              {fitScore(step.fit) < 60 && <p className="note">Low fit: high error risk and few fixed rules. Keep a person in charge.</p>}
            </>
          ) : (
            <>
              <dl className="kv">
                <dt>Done by</dt><dd>Human</dd>
                <dt>Handling time</dt><dd className="num">{step.minutesPerCase.toFixed(1)} min / {template.unit}</dd>
                <dt>Hours / yr</dt><dd className="num">{formatInt((perYear * step.minutesPerCase) / 60)}</dd>
              </dl>
              <p className="note">Switch to To-be to redesign this step.</p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
