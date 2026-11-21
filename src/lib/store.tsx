"use client";

/**
 * Client-side workspace store for the MVP shell.
 * Phase 1 replaces localStorage with the API and Postgres (see docs/ARCHITECTURE.md);
 * the shape of WorkspaceState is meant to match the database model.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Assumptions, AutonomyLevel, Baseline, Gate, ProcessDesign, Stage } from "@/domain/types";
import { customerService } from "@/templates";

export interface ProcessInstance {
  id: string;
  name: string;
  templateId: string | null;
  stage: Stage;
  gate: Gate;
  note: string;
  design: ProcessDesign;
  assumptions: Assumptions;
  baseline: Baseline | null;
}

export interface WorkspaceState {
  workspace: { id: string; name: string; isExample: boolean };
  processes: ProcessInstance[];
}

const STORAGE_KEY = "buildway-loop:v1";

function seed(): WorkspaceState {
  const placeholder = (id: string, name: string, stage: Stage, gate: Gate, note: string): ProcessInstance => ({
    id, name, stage, gate, note, templateId: null,
    design: { levels: {}, systemSteps: [] },
    assumptions: customerService.defaultAssumptions,
    baseline: null,
  });
  return {
    workspace: { id: "acme-support", name: "Acme Support", isExample: true },
    processes: [
      {
        id: "customer-service", name: "Customer service", templateId: customerService.id, stage: "run", gate: "green", note: "Live, month 9 of 12",
        design: structuredClone(customerService.defaultDesign),
        assumptions: { ...customerService.defaultAssumptions },
        baseline: null,
      },
      placeholder("it-service-desk", "IT service desk", "build", "amber", "Gate: data readiness"),
      placeholder("invoice-handling", "Invoice handling", "find", "amber", "Next: redesign workshop"),
      placeholder("hr-onboarding", "HR onboarding", "not-started", "red", "Owner not assigned"),
    ],
  };
}

interface Store {
  state: WorkspaceState;
  getProcess: (id: string) => ProcessInstance | undefined;
  setLevel: (processId: string, stepId: string, level: AutonomyLevel) => void;
  setSystemStep: (processId: string, stepId: string, isSystem: boolean) => void;
  setAssumption: (processId: string, key: keyof Assumptions, value: number) => void;
  approveBaseline: (processId: string, net: number) => void;
  reset: () => void;
}

const Ctx = createContext<Store | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(seed);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch { /* storage unavailable: keep the seed */ }
  }, []);

  const update = useCallback((fn: (s: WorkspaceState) => WorkspaceState) => {
    setState((prev) => {
      const next = fn(prev);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const patchProcess = useCallback(
    (id: string, fn: (p: ProcessInstance) => ProcessInstance) =>
      update((s) => ({ ...s, processes: s.processes.map((p) => (p.id === id ? fn(p) : p)) })),
    [update],
  );

  const store = useMemo<Store>(() => ({
    state,
    getProcess: (id) => state.processes.find((p) => p.id === id),
    setLevel: (pid, stepId, level) =>
      patchProcess(pid, (p) => ({
        ...p,
        design: {
          levels: { ...p.design.levels, [stepId]: level },
          systemSteps: level < 4 ? p.design.systemSteps.filter((s) => s !== stepId) : p.design.systemSteps,
        },
      })),
    setSystemStep: (pid, stepId, isSystem) =>
      patchProcess(pid, (p) => ({
        ...p,
        design: {
          ...p.design,
          systemSteps: isSystem ? [...new Set([...p.design.systemSteps, stepId])] : p.design.systemSteps.filter((s) => s !== stepId),
        },
      })),
    setAssumption: (pid, key, value) => patchProcess(pid, (p) => ({ ...p, assumptions: { ...p.assumptions, [key]: value } })),
    approveBaseline: (pid, net) =>
      patchProcess(pid, (p) => ({
        ...p,
        baseline: { approvedAt: new Date().toISOString(), approvedBy: "Buildway advisor", net, design: structuredClone(p.design), assumptions: { ...p.assumptions } },
      })),
    reset: () => update(() => seed()),
  }), [state, patchProcess, update]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return s;
}
