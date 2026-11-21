"use client";

import { useMemo } from "react";
import { useWorkspace } from "./store";
import { getTemplate } from "@/templates";
import { computeValueCase } from "@/domain/value-model";

/** A process with its template and live value case. */
export function useProcess(id: string) {
  const store = useWorkspace();
  const process = store.getProcess(id);
  const template = process?.templateId ? getTemplate(process.templateId) : undefined;
  const value = useMemo(
    () => (process && template ? computeValueCase(template.steps, process.design, process.assumptions) : undefined),
    [process, template],
  );
  return { ...store, process, template, value };
}
