"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useWorkspace } from "@/lib/store";

const PROCESS = "customer-service";

const NAV: Array<{ href: string; label: string; dot?: "find" | "build" | "run"; group?: string }> = [
  { href: "/", label: "Overview" },
  { href: "/templates", label: "Templates" },
  { href: `/processes/${PROCESS}/map`, label: "Find · Map & redesign", dot: "find", group: "Customer service" },
  { href: `/processes/${PROCESS}/fit`, label: "Build · Agent fit", dot: "build" },
  { href: `/processes/${PROCESS}/value`, label: "Build · Value case", dot: "build" },
  { href: `/processes/${PROCESS}/monitor`, label: "Run · Monitor", dot: "run" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { state, error, saving, reset } = useWorkspace();
  return (
    <div className="app">
      <aside className="rail">
        <div>
          <Link className="logo" href="/" aria-label="Buildway, overview">
            <span className="t">B D</span>
            <span className="b">W Y</span>
          </Link>
          <p className="prod">Loop</p>
        </div>
        <div className="ws">
          <small>Workspace</small>
          <b>{state?.workspace.name ?? "Loading…"}</b>
          {state?.workspace.isExample && <small>Example customer</small>}
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <div key={n.href} style={{ display: "contents" }}>
              {n.group && <p className="nav-h">{n.group}</p>}
              <Link href={n.href} aria-current={path === n.href ? "page" : undefined}>
                {n.dot && <span className={`dot d-${n.dot}`} />}
                {n.label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="rail-foot">
          <span className="role"><span className="dot d-run" />Signed in as Buildway advisor</span>
          {state?.workspace.isExample && <button className="linkbtn" onClick={reset}>Reset example data</button>}
          <span aria-live="polite">{saving ? "Saving…" : state ? "All changes saved" : ""}</span>
        </div>
      </aside>
      <main>
        <div className="wrap view">
          {error && <p className="banner" role="alert">{error}</p>}
          {state ? children : !error && <p className="muted">Loading workspace…</p>}
        </div>
      </main>
    </div>
  );
}
