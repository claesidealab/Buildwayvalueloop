/** Shapes exchanged between the API and the client. No React or server imports here. */
import type { Assumptions, AutonomyLevel, Baseline, Gate, ProcessDesign, Stage, StepDefinition } from "@/domain/types";

export interface ProcessInstance {
  /** URL slug, unique within the workspace. */
  id: string;
  name: string;
  templateId: string | null;
  templateVersion: string | null;
  unit: string;
  stage: Stage;
  gate: Gate;
  note: string;
  steps: StepDefinition[];
  design: ProcessDesign;
  assumptions: Assumptions;
  baseline: Baseline | null;
}

export interface WorkspaceState {
  workspace: { id: string; name: string; isExample: boolean };
  processes: ProcessInstance[];
}

export type StepPatch = { autonomy?: AutonomyLevel; isSystem?: boolean };
export type AssumptionsPatch = Partial<Assumptions>;
