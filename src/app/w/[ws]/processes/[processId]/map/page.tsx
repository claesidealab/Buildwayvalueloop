"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProcess } from "@/lib/useProcess";
import { AUTONOMY_LEVELS } from "@/domain/autonomy";
import { fitScore, suggestedLevel } from "@/domain/fit";
import { formatInt, formatMSEK } from "@/domain/value-model";
import type { AutonomyLevel, FitFactors, Rating, StepDefinition } from "@/domain/types";
import { PageHead } from "@/components/ui";
import { NotFound } from "@/components/NotFound";
import { ProcessCanvas } from "@/components/ProcessCanvas";
import { StepComments } from "@/components/StepComments";
import { MapDraft } from "@/components/MapDraft";

const FIT_LABELS: Array<[keyof FitFactors, string]> = [["volume", "Volume"], ["ruleBased", "Rule-based"], ["dataReady", "Data ready"], ["errorRisk", "Error risk"]];
const RATINGS: Rating[] = ["low", "medium", "high"];

/** Text or number field that saves when you leave it (or press Enter). */
function Field({ id, label, value, onSave, type = "text", disabled, suffix, min, max, step }: {
  id: string; label: string; value: string | number; onSave: (v: string) => void; type?: "text" | "number" | "textarea";
  disabled?: boolean; suffix?: string; min?: number; max?: number; step?: number;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { if (v.trim() !== String(value)) onSave(v.trim()); };
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {type === "textarea" ? (
        <textarea id={id} rows={2} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={commit} />
      ) : (
        <span className="field-row">
          <input id={id} type={type} value={v} disabled={disabled} min={min} max={max} step={step}
            onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          {suffix && <span className="muted">{suffix}</span>}
        </span>
      )}
    </label>
  );
}

export default function MapPage({ params }: { params: Promise<{ processId: string }> }) {
  const { processId } = use(params);
  const { process, value, loading, can, path, slug, patchStep, addStep, removeStep, restoreStep, addEdge, removeEdge, addComment, resolveComment, importMap } = useProcess(processId);
  const initial = useSearchParams().get("step");
  const [view, setView] = useState<"as-is" | "to-be">("to-be");
  const [sel, setSel] = useState<string | null>(initial ?? "resolve");
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => setConfirmRemove(false), [sel, view]);
  if (loading) return null;
  if (!process || !value) return <NotFound />;

  const editable = can("design.edit");
  const tobe = view === "to-be";
  const inView = (s: StepDefinition) => (tobe ? s.phase !== "as-is" : s.phase !== "to-be");
  const step = process.steps.find((s) => s.id === sel && inView(s)) ?? null;
  const sv = step ? value.steps.find((v) => v.step.id === step.id) : undefined;
  const removed = process.steps.filter((s) => s.phase === "as-is");
  const added = process.steps.filter((s) => s.phase === "to-be");
  const perYear = process.assumptions.casesPerMonth * 12;
  const num = (v: string, fallback: number) => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : fallback; };

  // A new step goes after the selected one and is joined to it with an arrow.
  const onAdd = async () => {
    const after = step;
    const id = await addStep(process.id, { name: "New step", view, minutesPerCase: 1, autonomy: 0, ...(after ? { x: (after.x ?? 0) + 220 } : {}) });
    if (id) { setSel(id); if (after) addEdge(process.id, after.id, id); }
  };

  return (
    <>
      <PageHead dot="find" eyebrow={`Find · ${process.name}`} title="Map and redesign"
        sub={editable ? "Drag steps to reorder them or move them between lanes. Drag from a step's right edge to another step to draw an arrow." : "The process before and after the redesign."} />
      <div className="map-grid">
        <section className="panel">
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Version">
              <button aria-pressed={!tobe} onClick={() => setView("as-is")}>As-is</button>
              <button aria-pressed={tobe} onClick={() => setView("to-be")}>To-be</button>
            </div>
            {editable && <button className="btn btn-sm" onClick={onAdd} title={step ? `Adds a step after ${step.name}` : undefined}>+ Add step</button>}
            <div className="key">
              {tobe ? <><span><i className="dot d-run" />Human</span><span><i className="dot d-build" />AI agent</span><span><i className="dot d-find" />System</span></> : <span>Today, people do every step</span>}
            </div>
          </div>
          {editable && !tobe && <div style={{ marginBottom: 12 }}><MapDraft apiBase={`/api/workspaces/${slug}/processes/${process.id}`} processName={process.name} hasSteps={process.steps.length > 0} onImport={(b) => importMap(process.id, b)} /></div>}
          {editable && tobe && process.steps.length === 0 && <p className="muted">Start in the As-is view: map today&apos;s process by hand or draft it from documents.</p>}
          <p className="muted canvas-hint">Scroll or drag the background to move around; the corner button fits the whole process.</p>
          <ProcessCanvas
            process={process} value={value} view={view} editable={editable} selected={step?.id ?? null}
            onSelect={setSel}
            onPatch={(id, patch) => patchStep(process.id, id, patch)}
            onConnect={(from, to) => addEdge(process.id, from, to)}
            onRemoveEdge={(id) => removeEdge(process.id, id)}
          />
          {tobe && (removed.length > 0 || added.length > 0) && (
            <div className="changes">
              {removed.length > 0 && (
                <div><span className="label">Removed in the redesign</span>
                  <div className="chips">{removed.map((s) => (
                    <span key={s.id} className="chip-removed"><s>{s.name}</s>{editable && <button className="linkbtn" onClick={() => restoreStep(process.id, s.id)}>Put back</button>}</span>
                  ))}</div>
                </div>
              )}
              {added.length > 0 && <div><span className="label">New in the redesign</span><div className="chips">{added.map((s) => <button key={s.id} className="chip-added" onClick={() => setSel(s.id)}>{s.name}</button>)}</div></div>}
            </div>
          )}
          <div className="summary">
            <div><small>Net value / yr</small><b className="num">{formatMSEK(value.net)} MSEK</b></div>
            <div><small>Steps done by people</small><b className="num">{tobe ? value.stepsDoneByPeople : process.steps.filter(inView).length} of {process.steps.filter(inView).length}</b></div>
            <div><small>Hours released / yr</small><b className="num">{formatInt(value.hoursReleased)}</b></div>
            <div className="go"><Link className="btn" href={path(`/processes/${process.id}/value`)}>Open value case</Link></div>
          </div>
        </section>

        <aside className="panel insp insp-wide">
          {!step ? (
            <>
              <p className="label">Inspector</p>
              <p className="muted">Select a step on the map to see and edit it.{editable ? " Select an arrow and press Delete, or use Remove arrow, to take it away." : ""}</p>
            </>
          ) : (
            <>
              <p className="label">{tobe ? (step.phase === "to-be" ? "New step in the redesign" : "Step in the redesign") : "Step today"}</p>
              <Field id="step-name" label="Name" value={step.name} disabled={!editable} onSave={(v) => v && patchStep(process.id, step.id, { name: v })} />
              <Field id="step-desc" label="What happens" type="textarea" value={step.description} disabled={!editable} onSave={(v) => patchStep(process.id, step.id, { description: v })} />
              <div className="field-pair">
                <Field id="step-min" label="Time when done by a person" type="number" min={0} max={1440} step={0.1} suffix={`min / ${process.unit}`} value={step.minutesPerCase} disabled={!editable}
                  onSave={(v) => patchStep(process.id, step.id, { minutesPerCase: Math.max(0, num(v, step.minutesPerCase)) })} />
                <Field id="step-share" label="Share of cases" type="number" min={0} max={100} step={1} suffix="%" value={step.caseShare ?? 100} disabled={!editable}
                  onSave={(v) => patchStep(process.id, step.id, { caseShare: Math.min(100, Math.max(0, num(v, step.caseShare ?? 100))) })} />
              </div>

              {tobe && sv && (
                <div>
                  <p className="label" style={{ marginBottom: 8 }}>Autonomy</p>
                  <div className="levels" role="group" aria-label="Autonomy level">
                    {AUTONOMY_LEVELS.map((L) => (
                      <button key={L.level} disabled={!editable} aria-pressed={L.level === sv.level} title={`${L.name}: ${L.description}`}
                        onClick={() => patchStep(process.id, step.id, { autonomy: L.level as AutonomyLevel })}>
                        <b>L{L.level}</b><span>{L.short}</span>
                      </button>
                    ))}
                  </div>
                  <p className="muted" style={{ marginTop: 8, fontSize: 14 }}><b>{AUTONOMY_LEVELS[sv.level].name}.</b> {AUTONOMY_LEVELS[sv.level].description}</p>
                  <label className="check" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={process.design.systemSteps.includes(step.id)} disabled={!editable || sv.level < 4}
                      onChange={(e) => patchStep(process.id, step.id, { isSystem: e.target.checked })} />
                    Run as a rule-based system, not an AI agent
                  </label>
                </div>
              )}

              <dl className="kv">
                {tobe && sv && <><dt>Done by</dt><dd>{sv.lane === "agent" ? "AI agent" : sv.lane === "system" ? "System" : sv.level ? "Person with AI help" : "Person"}</dd></>}
                {tobe && sv && <><dt>Share automated</dt><dd className="num">{Math.round(sv.automatedShare * 100)}%</dd></>}
                {tobe && sv ? <><dt>Hours released / yr</dt><dd className="num">{formatInt(sv.hoursReleased)}</dd></>
                  : <><dt>Hours / yr today</dt><dd className="num">{formatInt((perYear * step.minutesPerCase * (step.caseShare ?? 100)) / 100 / 60)}</dd></>}
                <dt>Agent fit</dt><dd className="num">{fitScore(step.fit)} · suggests L{suggestedLevel(step.fit)}</dd>
              </dl>

              <details className="fit-edit">
                <summary>Agent fit factors</summary>
                <div className="fit-grid">
                  {FIT_LABELS.map(([k, label]) => (
                    <label key={k} className="field" htmlFor={`fit-${k}`}>
                      <span>{label}</span>
                      <select id={`fit-${k}`} value={step.fit[k]} disabled={!editable} onChange={(e) => patchStep(process.id, step.id, { fit: { [k]: e.target.value as Rating } })}>
                        {RATINGS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </details>

              <StepComments comments={process.comments.filter((c) => c.step === step.id)} canComment={can("design.comment")}
                onAdd={(body) => addComment(process.id, step.id, body)} onResolve={(id, r) => resolveComment(process.id, id, r)} />

              {editable && (
                confirmRemove ? (
                  <div className="confirm">
                    {tobe ? (step.phase === "to-be" ? "Delete this new step?" : "Remove this step from the redesign? Its time counts as saved.") : (step.phase === "both" ? "Remove from today's process? It stays as a new step in the redesign." : "Delete this step?")}
                    <button className="btn btn-sm btn-pri" onClick={() => { removeStep(process.id, step.id, view); setSel(null); }}>Remove</button>
                    <button className="btn btn-sm" onClick={() => setConfirmRemove(false)}>Keep</button>
                  </div>
                ) : (
                  <button className="btn btn-sm" onClick={() => setConfirmRemove(true)}>{tobe && step.phase === "both" ? "Remove from redesign" : "Remove step"}</button>
                )
              )}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
