"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Rating } from "@/domain/types";
import { useWorkspace } from "@/lib/store";
import { useStrategy } from "@/lib/strategy-store";

/** Number field that saves on blur or Enter. `scale` shows money in millions (1e6). */
export function NumField({ id, value, onSave, scale = 1, step = 0.1, min, max, disabled, label, suffix, width = 90 }: {
  id: string; value: number | null; onSave: (v: number | null) => void; scale?: number; step?: number; min?: number; max?: number;
  disabled?: boolean; label: string; suffix?: string; width?: number;
}) {
  const shown = value === null || value === undefined ? "" : String(Math.round((value / scale) * 100) / 100);
  const [v, setV] = useState(shown);
  useEffect(() => setV(shown), [shown]);
  const commit = () => {
    if (v.trim() === shown) return;
    if (v.trim() === "") return onSave(null);
    const n = Number(v.replace(",", ".").replace(/\s/g, ""));
    if (!Number.isFinite(n)) return setV(shown);
    onSave(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)) * scale);
  };
  return (
    <span className="numfield">
      <input id={id} aria-label={label} type="text" inputMode="decimal" value={v} disabled={disabled} style={{ width }} step={step}
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      {suffix && <span className="muted">{suffix}</span>}
    </span>
  );
}

/** Text field that saves on blur. */
export function TextField({ id, value, onSave, disabled, label, multiline, placeholder, rows = 2 }: {
  id: string; value: string; onSave: (v: string) => void; disabled?: boolean; label: string; multiline?: boolean; placeholder?: string; rows?: number;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onSave(v.trim()); };
  return multiline ? (
    <textarea id={id} aria-label={label} rows={rows} value={v} disabled={disabled} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
  ) : (
    <input id={id} aria-label={label} type="text" value={v} disabled={disabled} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

const RATING_LABEL: Record<Rating, string> = { low: "Low", medium: "Medium", high: "High" };

export function RatingSelect({ id, value, onChange, disabled, label }: { id: string; value: Rating; onChange: (r: Rating) => void; disabled?: boolean; label: string }) {
  return (
    <select id={id} aria-label={label} className={`rating r-${value}`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Rating)}>
      {(["low", "medium", "high"] as const).map((r) => <option key={r} value={r}>{RATING_LABEL[r]}</option>)}
    </select>
  );
}

/** Tabs for the strategy area, plus save status and errors. */
export function StrategyTabs() {
  const { path } = useWorkspace();
  const { plan, error, saving, editable } = useStrategy();
  const pathname = usePathname();
  const chosen = plan?.chosenScenarioId ?? plan?.scenarios[0]?.id;
  const tabs = [
    { href: path("/strategy"), label: "Overview" },
    { href: path("/strategy/discover"), label: "Discover flows" },
    { href: chosen ? path(`/strategy/scenarios/${chosen}`) : path("/strategy"), label: "Scenarios", match: path("/strategy/scenarios") },
    { href: path("/strategy/ambition"), label: "Ambition and decisions" },
  ];
  return (
    <>
      <nav className="subtabs" aria-label="Strategy">
        {tabs.map((t) => {
          const active = t.match ? pathname.startsWith(t.match) : pathname === t.href;
          return <Link key={t.label} href={t.href} aria-current={active ? "page" : undefined}>{t.label}</Link>;
        })}
        <Link href={path("/strategy/board")} aria-current={pathname === path("/strategy/board") ? "page" : undefined}>Board pack</Link>
        <span className="subtabs-status muted" aria-live="polite">{!editable ? "View only" : saving ? "Saving…" : plan ? "All changes saved" : ""}</span>
      </nav>
      {plan?.isExample && <p className="readonly">This is an <b>example plan</b> for a made-up company, based on patterns reported in research and practice. Replace it with your own figures.</p>}
      {error && <p className="banner" role="alert">{error}</p>}
    </>
  );
}

export const money = (v: number, currency: string) => `${(v / 1e6).toFixed(Math.abs(v) >= 10e6 ? 0 : 1)} M${currency}`;
export const signedMoney = (v: number, currency: string) => `${v >= 0 ? "+" : "−"}${money(Math.abs(v), currency)}`;
