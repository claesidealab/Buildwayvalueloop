import type { ProcessTemplate } from "@/domain/types";

/** Customer service, template v1. Numbers are example defaults to adjust with each customer. */
export const customerService: ProcessTemplate = {
  id: "customer-service",
  name: "Customer service",
  summary: "Contact intake to resolution and quality review.",
  version: "1.1",
  unit: "contact",
  steps: [
    { id: "intake", name: "Intake", description: "Contacts arrive by chat, email, phone and web form.", minutesPerCase: 1.0, fit: { volume: "high", ruleBased: "high", dataReady: "high", errorRisk: "low" } },
    { id: "triage", name: "Triage", description: "Classify reason and urgency, route to the right queue.", minutesPerCase: 1.5, fit: { volume: "high", ruleBased: "high", dataReady: "high", errorRisk: "low" } },
    { id: "identify", name: "Identify", description: "Verify the customer and fetch account and order data.", minutesPerCase: 1.0, fit: { volume: "high", ruleBased: "high", dataReady: "high", errorRisk: "medium" } },
    { id: "knowledge", name: "Knowledge", description: "Find the right article, policy or earlier case.", minutesPerCase: 2.0, fit: { volume: "high", ruleBased: "medium", dataReady: "medium", errorRisk: "low" } },
    { id: "resolve", name: "Resolve", description: "Answer the question or carry out the fix.", minutesPerCase: 4.0, fit: { volume: "high", ruleBased: "medium", dataReady: "medium", errorRisk: "medium" } },
    { id: "escalate", name: "Escalate", description: "Hand complex or sensitive cases to a specialist, with a summary.", minutesPerCase: 1.5, caseShare: 20, fit: { volume: "medium", ruleBased: "low", dataReady: "medium", errorRisk: "high" } },
    { id: "close", name: "Close", description: "Confirm the outcome, follow up and close the case.", minutesPerCase: 1.0, fit: { volume: "high", ruleBased: "high", dataReady: "high", errorRisk: "low" } },
    { id: "review", name: "Review", description: "Quality review of a sample of cases, with feedback into the knowledge base.", minutesPerCase: 1.0, caseShare: 15, fit: { volume: "medium", ruleBased: "medium", dataReady: "high", errorRisk: "medium" } },
  ],
  defaultDesign: {
    levels: { intake: 4, triage: 4, identify: 4, knowledge: 3, resolve: 3, escalate: 2, close: 3, review: 2 },
    systemSteps: ["identify"],
  },
  defaultAssumptions: {
    casesPerMonth: 10_000,
    costPerHour: 420,
    agentQuality: 80,
    oversightShare: 15,
    aiCostPerStepCase: 0.35,
    fixedCostPerYear: 300_000,
  },
  agentPatterns: [
    "Triage and routing agent",
    "Self-service resolution agent",
    "Assistant for human agents",
    "Case summary on escalation",
    "Automated quality review",
  ],
  kpis: ["Resolved without a human", "First-contact resolution", "Average handling time", "Cost per contact", "CSAT and backlog"],
};
