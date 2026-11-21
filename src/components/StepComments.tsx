"use client";

import { useState } from "react";
import type { StepComment } from "@/lib/api-types";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Discussion on one step: open comments first, resolved ones folded away. */
export function StepComments({ comments, canComment, onAdd, onResolve }: {
  comments: StepComment[]; canComment: boolean;
  onAdd: (body: string) => Promise<boolean>; onResolve: (id: string, resolved: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const open = comments.filter((c) => !c.resolvedAt);
  const done = comments.filter((c) => c.resolvedAt);
  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    if (await onAdd(text.trim())) setText("");
    setBusy(false);
  };
  const item = (c: StepComment) => (
    <li key={c.id} className={`comment ${c.resolvedAt ? "comment-done" : ""}`}>
      <p className="comment-meta"><b>{c.author}</b> · {when(c.createdAt)}</p>
      <p className="comment-body">{c.body}</p>
      {canComment && <button className="linkbtn" onClick={() => onResolve(c.id, !c.resolvedAt)}>{c.resolvedAt ? "Reopen" : "Resolve"}</button>}
      {c.resolvedAt && c.resolvedBy && <p className="comment-meta">Resolved by {c.resolvedBy}</p>}
    </li>
  );
  return (
    <section className="comments" aria-label="Comments on this step">
      <p className="label">Comments{open.length ? ` · ${open.length} open` : ""}</p>
      {open.length === 0 && !canComment && <p className="muted" style={{ fontSize: 13 }}>No comments.</p>}
      {open.length > 0 && <ul>{open.map(item)}</ul>}
      {canComment && (
        <div className="comment-new">
          <label className="sr-only" htmlFor="comment-text">Add a comment</label>
          <textarea id="comment-text" rows={2} value={text} placeholder="Ask a question or propose a change…" maxLength={2000}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }} />
          <button className="btn btn-sm" disabled={busy || !text.trim()} onClick={submit}>Comment</button>
        </div>
      )}
      {done.length > 0 && (
        <details>
          <summary className="muted" style={{ fontSize: 13 }}>{done.length} resolved</summary>
          <ul>{done.map(item)}</ul>
        </details>
      )}
    </section>
  );
}
