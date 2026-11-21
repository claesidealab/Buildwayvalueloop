"use client";

/**
 * Workspace store backed by the API (/api/workspaces/[ws]).
 * Mutations apply optimistically, then the server's state replaces the local copy.
 * Responses that arrive after a newer mutation are ignored, so fast slider drags stay consistent.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Assumptions, AutonomyLevel } from "@/domain/types";
import type { NewStep, ProcessInstance, StepPatch, WorkspaceState } from "./api-types";
import type { Permission } from "@/domain/permissions";

export type { ProcessInstance, WorkspaceState };

interface Store {
  slug: string;
  state: WorkspaceState | null;
  /** Whether the signed-in user's role allows this in the current workspace. */
  can: (p: Permission) => boolean;
  /** Path inside the current workspace, e.g. path("/templates"). */
  path: (p: string) => string;
  error: string | null;
  saving: boolean;
  getProcess: (id: string) => ProcessInstance | undefined;
  setLevel: (processId: string, stepId: string, level: AutonomyLevel) => void;
  setSystemStep: (processId: string, stepId: string, isSystem: boolean) => void;
  setAssumption: (processId: string, key: keyof Assumptions, value: number) => void;
  approveBaseline: (processId: string) => void;
  /** Replace local state with a server response (e.g. after an upload). */
  replace: (s: WorkspaceState) => void;
  reset: () => void;
  /** Edit a step's definition and/or autonomy. Updates the screen at once. */
  patchStep: (processId: string, stepId: string, patch: StepPatch) => void;
  /** Add a step; resolves with the new step's id once saved. */
  addStep: (processId: string, step: NewStep) => Promise<string | null>;
  removeStep: (processId: string, stepId: string, view: "as-is" | "to-be") => void;
  restoreStep: (processId: string, stepId: string) => void;
  addEdge: (processId: string, from: string, to: string) => void;
  removeEdge: (processId: string, edgeId: string) => void;
}

const Ctx = createContext<Store | null>(null);

export class AuthError extends Error {}

export async function call<T = WorkspaceState>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new AuthError("Please sign in");
  }
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error as string).catch(() => res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json();
}

export function WorkspaceProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const base = `/api/workspaces/${slug}`;
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const seq = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const load = useCallback(async () => {
    try { setState(await call("GET", base)); setError(null); }
    catch (e) { setError(`Could not load the workspace: ${(e as Error).message}`); }
  }, [base]);

  useEffect(() => { setState(null); void load(); }, [load]);

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
    slug,
    state,
    can: (p) => !!state?.me.permissions.includes(p),
    path: (p) => `/w/${slug}${p}`,
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
    replace: (s) => { seq.current++; setState(s); },
    approveBaseline: (pid) => mutate((s) => s, () => call("POST", `${base}/processes/${pid}/baselines`)),
    reset: () => mutate((s) => s, () => call("POST", `${base}/reset`)),
    patchStep: (pid, stepId, patch) =>
      mutate(
        patchProcess(pid, (p) => {
          const { autonomy, isSystem, fit, ...def } = patch;
          const steps = p.steps.map((st) => (st.id === stepId ? { ...st, ...def, fit: { ...st.fit, ...fit } } : st));
          let design = p.design;
          if (autonomy !== undefined || isSystem !== undefined) {
            const level = autonomy ?? p.design.levels[stepId] ?? 0;
            const sys = level >= 4 && (isSystem ?? p.design.systemSteps.includes(stepId));
            design = { levels: { ...p.design.levels, [stepId]: level }, systemSteps: [...p.design.systemSteps.filter((x) => x !== stepId), ...(sys ? [stepId] : [])] };
          }
          return { ...p, steps, design };
        }),
        () => call("PATCH", `${base}/processes/${pid}/steps/${stepId}`, patch),
      ),
    addStep: async (pid, step) => {
      const before = new Set(state?.processes.find((p) => p.id === pid)?.steps.map((x) => x.id) ?? []);
      try {
        const server = await call("POST", `${base}/processes/${pid}/steps`, step);
        seq.current++;
        setState(server);
        return server.processes.find((p) => p.id === pid)?.steps.find((x) => !before.has(x.id))?.id ?? null;
      } catch (e) { setError(`Could not add the step: ${(e as Error).message}`); return null; }
    },
    removeStep: (pid, stepId, view) =>
      mutate((s) => s, () => call("DELETE", `${base}/processes/${pid}/steps/${stepId}?view=${view}`)),
    restoreStep: (pid, stepId) => mutate((s) => s, () => call("POST", `${base}/processes/${pid}/steps/${stepId}/restore`)),
    addEdge: (pid, from, to) =>
      mutate(
        patchProcess(pid, (p) => (p.edges.some((e) => e.from === from && e.to === to) ? p : { ...p, edges: [...p.edges, { id: `pending-${from}-${to}`, from, to }] })),
        () => call("POST", `${base}/processes/${pid}/edges`, { from, to }),
      ),
    removeEdge: (pid, edgeId) =>
      mutate(patchProcess(pid, (p) => ({ ...p, edges: p.edges.filter((e) => e.id !== edgeId) })), () => call("DELETE", `${base}/processes/${pid}/edges/${edgeId}`)),
  }), [slug, base, state, error, pending, mutate]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return s;
}
