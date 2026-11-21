/**
 * Example strategy for the example workspace: a made-up Nordic B2B services company,
 * about 450 employees and SEK 900 million revenue. Every figure is an example, built on
 * patterns reported in published research and practice; it is not any real company's plan.
 *
 * The scenarios follow a common progression:
 *   1. AI added to today's work: assistants and copilots, no redesign.
 *   2. Conservative: two flows redesigned, starting later and slower.
 *   3. Base: four flows redesigned, one at a time, each priced by the one before.
 *   4. Ambitious: the same four flows six months earlier, as tools keep improving.
 */
import type { CostLine, Gate, Scenario, StrategyFlow, StrategyPlan } from "@/domain/strategy";
import { DEFAULT_AMBITION } from "@/domain/strategy";

const M = 1_000_000;

export const EXAMPLE_FLOWS: StrategyFlow[] = [
  {
    id: "request-to-resolution", name: "Request to resolution", area: "Support, Delivery", owner: "Head of Support",
    description: "From a customer's request in any channel to a solved case.",
    scores: { value: "high", evidence: "high", waiting: "high", volume: "high" }, decision: "redesign", processId: "customer-service",
    rationale: "High volume, many handovers, and the strongest published evidence (support assistants raised issues resolved per hour by 14%).",
  },
  {
    id: "order-to-cash", name: "Order to cash", area: "Sales, Delivery, Finance", owner: "CFO",
    description: "From a signed order to delivery, invoice and payment.",
    scores: { value: "high", evidence: "medium", waiting: "high", volume: "high" }, decision: "redesign", processId: null,
    rationale: "Orders are retyped between systems and wait for approvals; rules are clear, so fixed checks can carry most cases.",
  },
  {
    id: "lead-to-renewal", name: "Lead to renewal", area: "Sales, Account management", owner: "Sales Director",
    description: "Capture, qualify, plan, propose and renew customer accounts.",
    scores: { value: "high", evidence: "medium", waiting: "medium", volume: "medium" }, decision: "redesign", processId: null,
    rationale: "Selling time is lost to preparation and admin; evidence is good for tasks, weaker for revenue.",
  },
  {
    id: "field-service", name: "Field service planning", area: "Service, Logistics", owner: "Head of Service",
    description: "Plan technicians, parts and visits from incoming service needs.",
    scores: { value: "high", evidence: "medium", waiting: "high", volume: "medium" }, decision: "redesign", processId: null,
    rationale: "Planning waits on several teams; better routing and preparation free technician time.",
  },
  {
    id: "employee-onboarding", name: "Employee onboarding", area: "HR, IT", owner: "HR Director",
    description: "From signed contract to a productive first week.",
    scores: { value: "medium", evidence: "medium", waiting: "high", volume: "low" }, decision: "improve", processId: null,
    rationale: "Real waiting, but too few cases a year to pay for a full redesign. Add AI to today's process.",
  },
  {
    id: "financial-close", name: "Financial close", area: "Finance", owner: "CFO",
    description: "Reconciliation, accruals and monthly reporting.",
    scores: { value: "medium", evidence: "high", waiting: "medium", volume: "low" }, decision: "improve", processId: null,
    rationale: "Matching and reconciliation assistants are proven; the flow itself works.",
  },
  {
    id: "proactive-service", name: "Proactive service", area: "Service, Product", owner: "Service Owner", isNew: true,
    description: "Watch customer installations and fix issues before the customer notices. Doesn't exist today.",
    scores: { value: "high", evidence: "low", waiting: "low", volume: "medium" }, decision: "build", processId: null,
    rationale: "Strategic, but evidence is weak so far. Pilot with a few customers before deciding.",
  },
  {
    id: "product-development", name: "Product development", area: "Product", owner: "CPO",
    description: "Vetting and developing new services.",
    scores: { value: "low", evidence: "low", waiting: "medium", volume: "low" }, decision: "leave", processId: null,
    rationale: "Few cases a year, heavy on judgement. AI supports research and analysis only.",
  },
];

const cost = (id: string, label: string, kind: CostLine["kind"], perYear: number[]): CostLine => ({ id, label, kind, perYear });

const gate = (id: string, period: Gate["period"], criterion: string): Gate => ({ id, period, criterion, status: "open" });

const baseGates = (shift = 0): Gate[] => {
  const p = (i: number) => (["2027-H1", "2027-H2", "2028-H1", "2028-H2", "2029-H1", "2029-H2"] as const)[Math.max(0, i - shift)];
  return [
    gate("g1", "2027-H1", "Baselines measured for every flow in the plan; 80% of support staff use the assistant daily"),
    gate("g2", "2027-H2", "10% of support contacts resolved without a person; order to cash mapped"),
    gate("g3", "2028-H1", "20% resolved without a person; orders flow from contract to invoice without retyping"),
    gate("g4", "2028-H2", "30% resolved; account plan for every key customer; selling time up"),
    gate("g5", p(4), "Field service planning live; cost per service visit falling"),
    gate("g6", "2029-H2", "Run-rate verified by finance; roles built around supervising agents"),
  ];
};

export const EXAMPLE_SCENARIOS: Scenario[] = [
  {
    id: "ai-added", name: "AI added to today's work", summary: "Assistants and copilots in today's processes. No flow is redesigned.",
    flows: [
      { flowId: "request-to-resolution", goLive: "2027-H1", rampMonths: 18, runRate: 2.0 * M },
      { flowId: "lead-to-renewal", goLive: "2027-H2", rampMonths: 12, runRate: 1.0 * M },
      { flowId: "financial-close", goLive: "2027-H2", rampMonths: 12, runRate: 0.8 * M },
    ],
    costs: [
      cost("c1", "Training and small set-up work", "one-off", [0.4 * M, 0.3 * M, 0.2 * M]),
      cost("c2", "Licences for AI built into our systems", "running", [0.6 * M, 1.2 * M, 1.5 * M]),
      cost("c3", "Part-time lead and line staff", "own-time", [1.0, 1.5, 1.5]),
    ],
    assumptions: [
      { label: "Support contacts resolved without a person, end of plan", value: "15%" },
      { label: "Flows redesigned", value: "None" },
      { label: "Typical outcome", value: "Gains stay in single tasks and often don't reach the accounts" },
    ],
    gates: [
      gate("g1", "2027-H1", "Baselines measured; assistant used daily by 80% of support staff"),
      gate("g2", "2028-H2", "Decide whether to step up to a redesign programme"),
    ],
  },
  {
    id: "conservative", name: "Conservative", summary: "Two flows redesigned, starting in 2028, with a slower ramp.",
    flows: [
      { flowId: "request-to-resolution", goLive: "2028-H1", rampMonths: 12, runRate: 6.0 * M },
      { flowId: "order-to-cash", goLive: "2028-H2", rampMonths: 12, runRate: 3.5 * M },
      { flowId: "lead-to-renewal", goLive: "2027-H2", rampMonths: 12, runRate: 1.0 * M },
      { flowId: "financial-close", goLive: "2027-H2", rampMonths: 12, runRate: 0.8 * M },
    ],
    costs: [
      cost("c1", "Redesign help, integration, data and training", "one-off", [1.0 * M, 3.5 * M, 2.0 * M]),
      cost("c2", "Licences and model usage", "running", [0.5 * M, 2.0 * M, 3.0 * M]),
      cost("c3", "Programme lead, developers and process owners", "own-time", [2.0, 4.5, 3.5]),
    ],
    assumptions: [
      { label: "Support contacts resolved without a person, end of plan", value: "30%" },
      { label: "Flows redesigned", value: "2" },
      { label: "Ramp to full value", value: "12 months per flow" },
    ],
    gates: baseGates(),
  },
  {
    id: "base", name: "Base", summary: "Four flows redesigned one at a time. The first one prices the others.",
    flows: [
      { flowId: "request-to-resolution", goLive: "2027-H2", rampMonths: 12, runRate: 8.0 * M },
      { flowId: "order-to-cash", goLive: "2028-H1", rampMonths: 12, runRate: 5.0 * M },
      { flowId: "lead-to-renewal", goLive: "2028-H2", rampMonths: 12, runRate: 6.0 * M },
      { flowId: "field-service", goLive: "2029-H1", rampMonths: 12, runRate: 4.0 * M },
      { flowId: "financial-close", goLive: "2027-H2", rampMonths: 12, runRate: 0.8 * M },
    ],
    costs: [
      cost("c1", "Redesign help, integration, data and training", "one-off", [2.0 * M, 6.0 * M, 4.0 * M]),
      cost("c2", "Licences and model usage", "running", [0.5 * M, 3.5 * M, 5.0 * M]),
      cost("c3", "Programme lead, developers and process owners", "own-time", [4.0, 8.0, 7.0]),
    ],
    assumptions: [
      { label: "Support contacts resolved without a person, end of plan", value: "45%" },
      { label: "Flows redesigned", value: "4, one every six months" },
      { label: "Own staff time valued at", value: "SEK 0.9 million per FTE-year" },
      { label: "Not included", value: "Proactive service, and the value of faster service" },
    ],
    gates: baseGates(),
  },
  {
    id: "ambitious", name: "Ambitious", summary: "The same four flows, up to six months earlier, as AI tools keep improving and get cheaper. 2027 is unchanged: it is limited by people, not technology.",
    flows: [
      { flowId: "request-to-resolution", goLive: "2027-H2", rampMonths: 9, runRate: 10.0 * M },
      { flowId: "order-to-cash", goLive: "2028-H1", rampMonths: 9, runRate: 6.5 * M },
      { flowId: "lead-to-renewal", goLive: "2028-H1", rampMonths: 12, runRate: 7.5 * M },
      { flowId: "field-service", goLive: "2028-H2", rampMonths: 9, runRate: 5.0 * M },
      { flowId: "financial-close", goLive: "2027-H2", rampMonths: 12, runRate: 1.0 * M },
    ],
    costs: [
      cost("c1", "Redesign help, integration, data and training", "one-off", [2.0 * M, 4.5 * M, 3.0 * M]),
      cost("c2", "Licences and model usage", "running", [0.5 * M, 3.5 * M, 4.5 * M]),
      cost("c3", "Programme lead, developers and process owners", "own-time", [4.0, 6.5, 5.5]),
    ],
    assumptions: [
      { label: "Support contacts resolved without a person, end of plan", value: "60%" },
      { label: "Developer time to build integrations and agents", value: "About a third less than base, as coding agents mature" },
      { label: "Why it's the upside, not the plan", value: "Relies on tools improving as projected; companies that pushed too fast have had to rehire" },
    ],
    gates: baseGates(1),
  },
];

export function examplePlan(): StrategyPlan {
  const ambition = DEFAULT_AMBITION(3);
  const targets: Record<string, number[]> = {
    "agent-share": [10, 30, 45],
    "flows-live": [1, 3, 4],
    capacity: [5, 12, 22],
    redeployed: [2, 8, 14],
    "net-value": [4, 13, 19],
  };
  for (const m of ambition) m.targets = targets[m.id] ?? m.targets;
  return {
    currency: "SEK", startYear: 2027, years: 3, ownTimeRate: 900_000,
    flows: structuredClone(EXAMPLE_FLOWS), scenarios: structuredClone(EXAMPLE_SCENARIOS), chosenScenarioId: "base",
    ambition, decisions: [], isExample: true,
  };
}
