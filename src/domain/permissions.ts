import type { Role } from "./types";

/**
 * What each workspace role may do.
 *
 * viewer          read everything
 * process_owner   + change designs and assumptions, upload actuals
 * customer_admin  + approve baselines, manage members, edit the strategy (scenarios, flows, ambition)
 * advisor         + reset example workspaces (Buildway staff on an engagement)
 */
export type Permission = "workspace.read" | "design.edit" | "actuals.import" | "baseline.approve" | "members.manage" | "strategy.edit" | "workspace.reset";

const GRANTS: Record<Role, Permission[]> = {
  viewer: ["workspace.read"],
  "process-owner": ["workspace.read", "design.edit", "actuals.import"],
  "customer-admin": ["workspace.read", "design.edit", "actuals.import", "baseline.approve", "members.manage", "strategy.edit"],
  advisor: ["workspace.read", "design.edit", "actuals.import", "baseline.approve", "members.manage", "strategy.edit", "workspace.reset"],
};

export const ROLES: ReadonlyArray<{ role: Role; label: string; description: string }> = [
  { role: "advisor", label: "Buildway advisor", description: "Runs the engagement. Full access." },
  { role: "customer-admin", label: "Admin", description: "Approves baselines, manages members, owns the strategy." },
  { role: "process-owner", label: "Process owner", description: "Redesigns processes and edits assumptions." },
  { role: "viewer", label: "Viewer", description: "Can see everything, change nothing." },
];

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && GRANTS[role].includes(permission);
}

export function permissionsOf(role: Role): Permission[] {
  return [...GRANTS[role]];
}

/** Only Buildway staff may hold or hand out the advisor role. */
export function canAssignRole(actor: { role: Role; isBuildway: boolean }, target: Role): boolean {
  if (!can(actor.role, "members.manage")) return false;
  if (target === "advisor") return actor.isBuildway;
  return true;
}
