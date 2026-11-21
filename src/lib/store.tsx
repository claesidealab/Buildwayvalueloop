"use client";

/**
 * Workspace store backed by the API (/api/workspaces/[ws]).
 * Mutations apply optimistically, then the server's state replaces the local copy.
 * Responses that arrive after a newer mutation are ignored, so fast slider drags stay consistent.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Assumptions, AutonomyLevel } from "@/domain/types";
import type { ProcessInstance, WorkspaceState } from "./api-types";
import { WORKSPACE } from "./config";

export type { ProcessInstance, WorkspaceState };

interface Store {
  state: WorkspaceState | null;
  error: string | null;
  saving: boolean;
  getProcess: (id: string) => ProcessInstance | undefined;
  setLevel: (processId: string, stepId: string, level: AutonomyLevel) => void;
  setSystemStep: (processId: string, stepId: string, isSystem: boolean) => void;
  setAssumption: (processId: string, key: keyof Assumptions, value: number) => void;
  approveBaseline: (processId: string) => void;
  reset: () => void;
}

const Ctx = createContext<Store | null>(null);
const base = `/api/workspaces/${WORKSPACE}`;

async function call(method: string, url: string, body?: unknown): Promise<WorkspaceState> {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error as string).catch(() => res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json();
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const seq = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const load = useCallback(async () => {
    try { setState(await call("GET", base)); setError(null); }
    catch (e) { setError(`Could not load the workspace: ${(e as Error).message}`); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Optimistic local change, then a request whose response replaces state if it is still the newest. */
  const mutate = useCallback((local: (s: WorkspaceState) => WorkspaceState, request: () => Promise<WorkspaceState>) => {
    setState((s) => (s ? local(s) : s));
    const mine = ++seq.current;
    setPending((n) => n + 1);
    request()
      .then((server) => { if (mine === seq.current) setState(server); setError(null); })
      .catch((e: Error) => { setError(`Could not save: ${e.message}. Showing the last saved version.`); void load(); })
      .finally(() => setPending((n) => n - 1));
  }, [load]);

  const patchProcess = (id: string, fn: (p: ProcessInstance) => ProcessInstance) => (s: WorkspaceState) => ({
    ...s, processes: s.processes.map((p) => (p.id === id ? fn(p) : p)),
  });

  const store = useMemo<Store>(() => ({
    state,
    error,
    saving: pending > 0,
    getProcess: (id) => state?.processes.find((p) => p.id === id),
    setLevel: (pid, stepId, level) =>
      mutate(
        patchProcess(pid, (p) => ({
          ...p,
          design: {
            levels: { ...p.design.levels, [stepId]: level },
            systemSteps: level < 4 ? p.design.systemSteps.filter((s) => s !== stepId) : p.design.systemSteps,
          },
        })),
        () => call("PATCH", `${base}/processes/${pid}/steps/${stepId}`, { autonomy: level }),
      ),
    setSystemStep: (pid, stepId, isSystem) =>
      mutate(
        patchProcess(pid, (p) => ({
          ...p,
          design: { ...p.design, systemSteps: isSystem ? [...new Set([...p.design.systemSteps, stepId])] : p.design.systemSteps.filter((s) => s !== stepId) },
        })),
        () => call("PATCH", `${base}/processes/${pid}/steps/${stepId}`, { isSystem }),
      ),
    setAssumption: (pid, key, value) => {
      // Update the screen now; send the latest value once the slider settles.
      setState((s) => (s ? patchProcess(pid, (p) => ({ ...p, assumptions: { ...p.assumptions, [key]: value } }))(s) : s));
      const t = `${pid}:${key}`;
      clearTimeout(timers.current.get(t));
      timers.current.set(t, setTimeout(() => mutate((s) => s, () => call("PATCH", `${base}/processes/${pid}/assumptions`, { [key]: value })), 300));
    },
    approveBaseline: (pid) => mutate((s) => s, () => call("POST", `${base}/processes/${pid}/baselines`)),
    reset: () => mutate((s) => s, () => call("POST", `${base}/reset`)),
  }), [state, error, pending, mutate]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return s;
}
