/** Shapes exchanged between the API and the client. No React or server imports here. */
import type { Assumptions, AutonomyLevel, Baseline, FitFactors, Gate, ProcessDesign, ProcessEdge, Role, Stage, StepDefinition } from "@/domain/types";
import type { Permission } from "@/domain/permissions";
import type { ActualPoint } from "@/domain/actuals";
import type { AgentRecord } from "@/domain/agents";

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
  /** Measured results after go-live, oldest first. */
  actuals: ActualPoint[];
  /** Arrows on the process map. */
  edges: ProcessEdge[];
  /** True when the process has a design to edit (it can be mapped, even with no steps yet). */
  hasDraft: boolean;
  /** Discussion on steps, oldest first. */
  comments: StepComment[];
  /** Registered agents (agent-lane steps not listed here use defaults). */
  agents: AgentRecord[];
}

export interface StepComment {
  id: string;
  /** Step key. */
  step: string;
  author: string;
  body: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface WorkspaceState {
  workspace: { id: string; name: string; isExample: boolean };
  processes: ProcessInstance[];
  /** The signed-in user and what they may do in this workspace. */
  me: { name: string; email: string; isBuildway: boolean; role: Role; permissions: Permission[] };
}

export interface MeResponse {
  user: { id: string; email: string; name: string; isBuildway: boolean };
  workspaces: Array<{ slug: string; name: string; isExample: boolean; role: Role }>;
}

export interface MembersResponse {
  members: Array<{ userId: string; email: string; name: string; role: Role; lastSignInAt: string | null }>;
  invitations: Array<{ id: string; email: string; role: Role; createdAt: string }>;
}

export type StepPatch = {
  autonomy?: AutonomyLevel;
  isSystem?: boolean;
  name?: string;
  description?: string;
  minutesPerCase?: number;
  caseShare?: number;
  x?: number;
  fit?: Partial<FitFactors>;
};

export type NewStep = {
  name: string;
  /** Which view the step was added in. */
  view: "as-is" | "to-be";
  description?: string;
  minutesPerCase?: number;
  caseShare?: number;
  x?: number;
  autonomy?: AutonomyLevel;
  isSystem?: boolean;
  fit?: Partial<FitFactors>;
};
export type AssumptionsPatch = Partial<Assumptions>;
