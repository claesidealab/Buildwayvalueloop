"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { call, useWorkspace } from "@/lib/store";
import type { MeResponse } from "@/lib/api-types";
import { ROLES } from "@/domain/permissions";
import { Logo } from "./Logo";

const STAGES: Array<{ seg: string; label: string; dot: "find" | "build" | "run" }> = [
  { seg: "map", label: "Find · Map & redesign", dot: "find" },
  { seg: "fit", label: "Build · Agent fit", dot: "build" },
  { seg: "value", label: "Build · Value case", dot: "build" },
  { seg: "monitor", label: "Run · Monitor", dot: "run" },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { slug, state, error, saving, reset, can, path } = useWorkspace();
  const [workspaces, setWorkspaces] = useState<MeResponse["workspaces"]>([]);

  useEffect(() => { call<MeResponse>("GET", "/api/me").then((m) => setWorkspaces(m.workspaces)).catch(() => {}); }, []);

  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; };
  const roleLabel = state ? ROLES.find((r) => r.role === state.me.role)?.label : undefined;
  const mapped = state?.processes.filter((p) => p.steps.length) ?? [];
  const link = (href: string, label: ReactNode, dot?: string) => (
    <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
      {dot && <span className={`dot d-${dot}`} />}{label}
    </Link>
  );

  return (
    <div className="app">
      <aside className="rail">
        <div>
          <Logo href={path("")} />
          <p className="prod">Loop</p>
        </div>
        <div className="ws">
          <label htmlFor="ws-switch"><small>Workspace</small></label>
          {workspaces.length > 1 ? (
            <select id="ws-switch" className="ws-select" value={slug} onChange={(e) => router.push(`/w/${e.target.value}`)}>
              {workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.name}</option>)}
            </select>
          ) : (
            <b>{state?.workspace.name ?? "Loading…"}</b>
          )}
          {state?.workspace.isExample && <small>Example customer</small>}
        </div>
        <nav className="nav" aria-label="Main">
          {link(path(""), "Overview")}
          {link(path("/templates"), "Templates")}
          {mapped.map((p) => (
            <div key={p.id} style={{ display: "contents" }}>
              <p className="nav-h">{p.name}</p>
              {STAGES.map((s) => link(path(`/processes/${p.id}/${s.seg}`), s.label, s.dot))}
            </div>
          ))}
          <p className="nav-h">Workspace</p>
          {link(path("/members"), "Members")}
          {link(path("/history"), "History")}
        </nav>
        <div className="rail-foot">
          {state && (
            <span className="role"><span className="dot d-run" />{state.me.name} · {roleLabel}</span>
          )}
          {state?.workspace.isExample && can("workspace.reset") && <button className="linkbtn" onClick={reset}>Reset example data</button>}
          <button className="linkbtn" onClick={signOut}>Sign out</button>
          <span aria-live="polite">{saving ? "Saving…" : state && can("design.edit") ? "All changes saved" : ""}</span>
        </div>
      </aside>
      <main>
        <div className="wrap view">
          {error && <p className="banner" role="alert">{error}</p>}
          {state && !can("design.edit") && <p className="readonly">View only. Your role ({roleLabel}) can see everything but not change it.</p>}
          {state ? children : !error && <p className="muted">Loading workspace…</p>}
        </div>
      </main>
    </div>
  );
}
