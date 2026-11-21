/** Plain-language descriptions of audit log entries. */
import { ROLES } from "@/domain/permissions";
import type { Role } from "@/domain/types";

type Subject = Record<string, unknown>;
const roleLabel = (r: unknown) => ROLES.find((x) => x.role === r)?.label ?? String(r);
const msek = (n: unknown) => `${(Number(n) / 1e6).toFixed(1)} MSEK`;
const ASSUMPTION_LABELS: Record<string, string> = {
  casesPerMonth: "cases per month", costPerHour: "cost per staff hour", agentQuality: "agent quality",
  oversightShare: "oversight share", aiCostPerStepCase: "AI cost per step", fixedCostPerYear: "licences and run",
};

export function describeActivity(action: string, s: Subject, names: { process: (slug: string) => string; step: (proc: string, key: string) => string }): string {
  const proc = typeof s.process === "string" ? names.process(s.process) : "";
  switch (action) {
    case "design.step_changed": {
      const to = s.to as { autonomy: number; isSystem: boolean };
      const from = s.from as { autonomy: number } | null;
      return `set ${names.step(String(s.process), String(s.step))} in ${proc} to L${to.autonomy}${to.isSystem ? " (system)" : ""}${from ? `, was L${from.autonomy}` : ""}`;
    }
    case "design.assumptions_changed":
      return `changed ${Object.entries(s.patch as Subject).map(([k, v]) => `${ASSUMPTION_LABELS[k] ?? k} to ${v}`).join(", ")} in ${proc}`;
    case "baseline.approved": return `approved a baseline for ${proc}: ${msek(s.net)} a year`;
    case "actuals.imported": return `uploaded ${s.rows} figures for ${proc} (${(s.months as string[]).join(", ")})`;
    case "actuals.cleared": return `removed ${s.rows} uploaded figures for ${proc}`;
    case "member.invited": return `invited ${s.email} as ${roleLabel(s.role as Role)}`;
    case "member.added": return `added ${s.email} as ${roleLabel(s.role as Role)}`;
    case "member.role_changed": return `changed ${s.email ?? "a member"} from ${roleLabel(s.from)} to ${roleLabel(s.to)}`;
    case "member.removed": return `removed ${s.email ?? "a member"}`;
    case "invitation.revoked": return `withdrew the invitation for ${s.email}`;
    case "workspace.created": return `created the workspace`;
    case "step.added": return `added the step ${s.name} to ${proc}${s.phase === "to-be" ? " (new in the redesign)" : ""}`;
    case "step.removed": return s.result === "archived" ? `deleted the step ${s.name} in ${proc}` : s.result === "as-is" ? `removed ${s.name} from the redesign of ${proc}` : `removed ${s.name} from today's ${proc} process`;
    case "step.restored": return `put ${s.name} back into the redesign of ${proc}`;
    case "step.edited": return `edited ${names.step(String(s.process), String(s.step))} in ${proc} (${Object.keys(s.changes as Subject).map((k) => ({ name: "name", description: "description", minutesPerCase: "time", caseShare: "share of cases" } as Record<string, string>)[k] ?? (k.startsWith("fit") ? "fit" : k)).join(", ")})`;
    case "edge.added": return `drew an arrow from ${names.step(String(s.process), String(s.from))} to ${names.step(String(s.process), String(s.to))} in ${proc}`;
    case "edge.removed": return `removed an arrow in ${proc}`;
    default: return action;
  }
}
