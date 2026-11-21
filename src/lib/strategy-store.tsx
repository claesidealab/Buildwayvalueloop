"use client";

/**
 * Strategy plan on the client. Edits show at once and are saved shortly after, one save at a
 * time, each from the version the previous save returned. If someone else saved in between,
 * the server refuses (409) and the plan is reloaded with a message, so nothing is overwritten.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StrategyDecision, StrategyPlan } from "@/domain/strategy";
import { call, useWorkspace } from "./store";

interface Stored { plan: StrategyPlan; version: number; updatedAt: string }

export interface SuggestedFlow {
  name: string; area: string; description: string; owner: string; isNew: boolean;
  scores: StrategyPlan["flows"][number]["scores"]; rationale: string; decision: StrategyPlan["flows"][number]["decision"]; duplicateOf: string | null;
}

interface StrategyStore {
  plan: StrategyPlan | null;
  error: string | null;
  saving: boolean;
  editable: boolean;
  update: (fn: (p: StrategyPlan) => StrategyPlan) => void;
  recordDecision: (d: Pick<StrategyDecision, "kind" | "attendees" | "text">) => Promise<boolean>;
  createProcess: (flowId: string) => Promise<string | null>;
  discover: (text: string) => Promise<SuggestedFlow[]>;
}

const Ctx = createContext<StrategyStore | null>(null);

export function StrategyProvider({ children }: { children: ReactNode }) {
  const { slug, can, refresh } = useWorkspace();
  const base = `/api/workspaces/${slug}/strategy`;
  const [plan, setPlan] = useState<StrategyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const version = useRef(0);
  const latest = useRef<StrategyPlan | null>(null);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const apply = useCallback((s: Stored) => { version.current = s.version; latest.current = s.plan; setPlan(s.plan); }, []);

  const load = useCallback(async () => {
    try { apply(await call<Stored>("GET", base)); }
    catch (e) { setError(`Could not load the strategy: ${(e as Error).message}`); }
  }, [base, apply]);

  useEffect(() => { void load(); }, [load]);

  const flush = useCallback(async () => {
    if (inFlight.current || !dirty.current || !latest.current) return;
    inFlight.current = true; dirty.current = false; setSaving(true);
    try {
      const saved = await call<Stored>("PUT", base, { plan: latest.current, version: version.current });
      version.current = saved.version;
      setError(null);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("changed the plan") ? "Someone else changed the plan at the same time. Showing their version; please redo your last change." : `Could not save: ${msg}`);
      dirty.current = false;
      await load();
    } finally {
      inFlight.current = false; setSaving(false);
      if (dirty.current) void flush();
    }
  }, [base, load]);

  const store = useMemo<StrategyStore>(() => ({
    plan, error, saving, editable: can("strategy.edit"),
    update: (fn) => {
      if (!latest.current) return;
      const next = fn(latest.current);
      latest.current = next; setPlan(next); dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 600);
    },
    recordDecision: async (d) => {
      try { apply(await call<Stored>("POST", `${base}/decisions`, d)); return true; }
      catch (e) { setError(`Could not record the decision: ${(e as Error).message}`); return false; }
    },
    createProcess: async (flowId) => {
      try {
        const r = await call<{ processId: string; stored: Stored }>("POST", `${base}/flows/${flowId}/process`);
        apply(r.stored); await refresh(); return r.processId;
      } catch (e) { setError(`Could not create the process: ${(e as Error).message}`); return null; }
    },
    discover: async (text) => (await call<{ flows: SuggestedFlow[] }>("POST", `${base}/discover`, { text })).flows,
  }), [plan, error, saving, can, flush, apply, base, refresh]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStrategy(): StrategyStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStrategy must be used inside StrategyProvider");
  return s;
}
