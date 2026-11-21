"use client";

import { useRef, useState } from "react";
import { useWorkspace } from "@/lib/store";
import type { WorkspaceState } from "@/lib/api-types";
import { METRICS } from "@/domain/actuals";

type Problem = { line: number; message: string };

/** Upload panel for actuals CSV files, with a template download and a per-line problem list. */
export function ActualsUpload({ processId, hasData }: { processId: string; hasData: boolean }) {
  const { slug, replace } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; problems?: Problem[] } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const base = `/api/workspaces/${slug}/processes/${processId}/actuals`;

  const upload = async (file: File) => {
    setBusy(true); setMsg(null);
    try {
      const csv = await file.text();
      const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv }) });
      const body = await res.json();
      if (res.ok) { replace(body as WorkspaceState); setMsg({ kind: "ok", text: `${file.name} imported.` }); }
      else setMsg({ kind: "err", text: body.error ?? "Upload failed", problems: body.problems });
    } catch { setMsg({ kind: "err", text: "Could not read or send the file." }); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  const clear = async () => {
    setConfirmClear(false); setBusy(true);
    const res = await fetch(base, { method: "DELETE" });
    if (res.ok) { replace(await res.json()); setMsg({ kind: "ok", text: "Uploaded figures removed." }); }
    else setMsg({ kind: "err", text: "Could not remove the figures." });
    setBusy(false);
  };

  return (
    <section className="panel">
      <div className="panel-h">
        <h2>Upload actual figures</h2>
        <a className="btn btn-sm" href={`${base}/template`}>Download template</a>
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        One value per row: <code>month, metric, step, value</code>. Excel files saved as CSV with semicolons work too.
        Uploading a month again replaces its values. Metrics: {METRICS.map((m) => m.key).join(", ")}.
      </p>
      <div className="upload-row">
        <input ref={input} id="actuals-file" type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {hasData && !confirmClear && <button className="btn btn-sm" onClick={() => setConfirmClear(true)} disabled={busy}>Remove uploaded figures</button>}
        {confirmClear && (
          <span className="confirm">Remove all uploaded figures for this process?
            <button className="btn btn-sm btn-pri" onClick={clear}>Remove</button>
            <button className="btn btn-sm" onClick={() => setConfirmClear(false)}>Keep</button>
          </span>
        )}
      </div>
      {busy && <p className="muted" aria-live="polite">Working…</p>}
      {msg && (
        <div className={msg.kind === "err" ? "banner" : "okmsg"} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
          {msg.problems && (
            <ul className="problems">{msg.problems.map((p) => <li key={`${p.line}-${p.message}`}>Line {p.line}: {p.message}</li>)}</ul>
          )}
        </div>
      )}
    </section>
  );
}
