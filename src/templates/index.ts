import type { ProcessTemplate } from "@/domain/types";
import { customerService } from "./customer-service";

export const TEMPLATES: ProcessTemplate[] = [customerService];

/** Templates on the roadmap, shown in the library but not usable yet. */
export const UPCOMING_TEMPLATES = [
  { id: "it-service-desk", name: "IT service desk", summary: "Incidents, requests and access.", status: "Next" },
  { id: "order-to-cash", name: "Order-to-cash", summary: "Order, invoice and collect.", status: "Planned" },
  { id: "financial-close", name: "Financial close", summary: "Reconcile, report and close.", status: "Planned" },
  { id: "hr-onboarding", name: "HR onboarding", summary: "From signed offer to first day.", status: "Planned" },
] as const;

export function getTemplate(id: string): ProcessTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export { customerService };
