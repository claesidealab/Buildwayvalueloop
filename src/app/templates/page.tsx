"use client";

import Link from "next/link";
import { useState } from "react";
import { TEMPLATES, UPCOMING_TEMPLATES } from "@/templates";
import { PageHead } from "@/components/ui";

export default function Templates() {
  const [selected, setSelected] = useState<string>(TEMPLATES[0].id);
  const tpl = TEMPLATES.find((t) => t.id === selected);
  const upcoming = UPCOMING_TEMPLATES.find((t) => t.id === selected);

  return (
    <>
      <PageHead eyebrow="New process" title="Start from a template" sub="The core model works for any process. A template gives you a tested starting point: steps, numbers, agent patterns and KPIs." />
      <div className="tgrid">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="tcard" aria-pressed={selected === t.id} onClick={() => setSelected(t.id)}>
            <span className="pill pill-rust">Ready · v{t.version}</span><h3>{t.name}</h3><p className="muted">{t.summary}</p>
          </button>
        ))}
        {UPCOMING_TEMPLATES.map((t) => (
          <button key={t.id} className="tcard" aria-pressed={selected === t.id} onClick={() => setSelected(t.id)}>
            <span className="pill">{t.status}</span><h3>{t.name}</h3><p className="muted">{t.summary}</p>
          </button>
        ))}
        <button className="tcard" aria-pressed={selected === "own"} onClick={() => setSelected("own")}>
          <span className="pill">Custom</span><h3>Your own process</h3><p className="muted">Draft a map from SOPs, interview notes or a blank canvas.</p>
        </button>
      </div>
      <section className="panel">
        {tpl ? (
          <>
            <div className="panel-h"><h2>{tpl.name}</h2><Link className="btn btn-pri" href="/processes/customer-service/map">Use this template</Link></div>
            <div className="tdetail">
              <div><p className="label">Steps</p><ul>{tpl.steps.map((s) => <li key={s.id}>{s.name}</li>)}</ul></div>
              <div><p className="label">Agent patterns</p><ul>{tpl.agentPatterns.map((a) => <li key={a}>{a}</li>)}</ul></div>
              <div><p className="label">KPIs</p><ul>{tpl.kpis.map((k) => <li key={k}>{k}</li>)}</ul></div>
            </div>
          </>
        ) : (
          <>
            <div className="panel-h"><h2>{upcoming?.name ?? "Your own process"}</h2><span className="example">Coming later</span></div>
            <p className="muted">{upcoming ? "This template is on the roadmap." : "Upload SOPs or workshop notes and the platform drafts a map you can correct. Planned for phase 1."}</p>
          </>
        )}
      </section>
    </>
  );
}
