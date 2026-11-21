"use client";

import { useMemo } from "react";
import { useWorkspace } from "./store";
import { computeValueCase } from "@/domain/value-model";

/** A process with its live value case. `value` is undefined for processes without steps yet. */
export function useProcess(id: string) {
  const store = useWorkspace();
  const process = store.getProcess(id);
  const value = useMemo(
    () => (process && process.steps.length ? computeValueCase(process.steps, process.design, process.assumptions) : undefined),
    [process],
  );
  return { ...store, process, value, loading: !store.state && !store.error };
}
