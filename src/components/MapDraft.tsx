"use client";

import { useState } from "react";
import { call, type MapImport } from "@/lib/store";
import type { FitFactors } from "@/domain/types";

interface DraftStep { name: string; description: string; minutesPerCase: number; caseShare: number; fit: FitFactors; note: string }
interface MapDraftResult { unit: string; steps: DraftStep[]; edges: Array<[number, number]> }

/**
 * Paste an SOP or interview notes; Claude drafts today's steps. People review the draft and
 * untick steps they don't want before adding it to the map.
 */
export function MapDraft({ apiBase, processName, hasSteps, onImport }: {
  apiBase: string; processName: string; hasSteps: boolean; onImport: (body: MapImport) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(!hasSteps);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<MapDraftResult | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);

  const run = async () => {
    setBusy(true); setError(null); setDraft(null);
    try {
      const r = await call<{ draft: MapDraftResult }>("POST", `${apiBase}/draft`, { text });
      setDraft(r.draft); setKeep(r.draft.steps.map(() => true));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const add = async () => {
    if (!draft) return;
    const idx = draft.steps.map((_, i) => i).filter((i) => keep[i]);
    const pos = new Map(idx.map((i, k) => [i, k]));
    // Keep arrows between kept steps, and bridge over removed ones in the sequence.
    const edges: Array<[number, number]> = idx.slice(1).map((_, k) => [k, k + 1]);
    for (const [a, b] of draft.edges) if (pos.has(a) && pos.has(b) && b !== a + 1) edges.push([pos.get(a)!, pos.get(b)!]);
    const ok = await onImport({ steps: idx.map((i) => { const s = draft.steps[i]; return { name: s.name, description: s.description, minutesPerCase: s.minutesPerCase, caseShare: s.caseShare, fit: s.fit }; }), edges });
    if (ok) { setDraft(null); setText(""); setOpen(false); }
  };

  if (!open) return <button className="btn btn-sm" onClick={() => setOpen(true)}>Draft from documents</button>;
  return (
    <section className="panel ai-panel map-draft">
      <div className="panel-h"><h2>Draft today&apos;s process from documents</h2><span className="pill">Claude</span>
        <button className="linkbtn" onClick={() => setOpen(false)}>Close</button></div>
      <p className="muted" style={{ fontSize: 14 }}>Paste an SOP, work instructions or interview notes for {processName}. Claude drafts the steps with times and agent-fit ratings; you review them before anything is added{hasSteps ? ", after the steps already on the map" : ""}.</p>
      <label className="field" htmlFor="draft-text" style={{ marginTop: 12 }}><span>Material</span>
        <textarea id="draft-text" rows={6} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="For example: Invoices arrive by email to the AP mailbox. A clerk registers each invoice in the ERP, about 3 minutes…" />
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <button className="btn btn-pri" onClick={run} disabled={busy || text.trim().length < 40}>{busy ? "Reading the material…" : "Draft the steps"}</button>
        <span className="muted" style={{ fontSize: 13 }}>The text is sent to Anthropic&apos;s Claude. Leave out personal data.</span>
      </div>
      {error && <p className="banner" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      {draft && (
        <div className="draft-steps">
          <p className="label">Draft: {draft.steps.length} steps · one case is one {draft.unit}</p>
          <ol>
            {draft.steps.map((s, i) => (
              <li key={i}>
                <label className="check">
                  <input type="checkbox" checked={keep[i] ?? true} onChange={(e) => setKeep(keep.map((k, j) => (j === i ? e.target.checked : k)))} />
                  <span><b>{s.name}</b> · {s.minutesPerCase} min · {s.caseShare}% of cases</span>
                </label>
                <p className="muted" style={{ fontSize: 13, marginLeft: 28 }}>{s.description} {s.note && <i>({s.note})</i>}</p>
              </li>
            ))}
          </ol>
          <button className="btn btn-pri" disabled={!keep.some(Boolean)} onClick={add}>Add {keep.filter(Boolean).length} steps to the map</button>
        </div>
      )}
    </section>
  );
}
