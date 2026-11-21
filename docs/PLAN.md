# Product plan

## Why

Most companies have AI pilots, but few have AI-native processes. Three gaps keep them there:

1. **Pilots without a process.** Agents get bolted onto old workflows, so the work around them stays the same.
2. **Value nobody can prove.** Business cases live in spreadsheets and are never checked against what happens after go-live.
3. **Agents nobody oversees.** As agents spread across vendors and teams, no one sees performance, cost and risk in one place.

Our point of view: AI-native starts with redesigning how work flows through each process. The unit of change is the process step: who does it (a person, an agent or a system), at what autonomy, and how we know it works.

## What the platform does

One closed loop, built on one shared model (Process → Step → Actor → Autonomy → Metrics → Value). The stages follow Buildway's own method: **Hitta / Bygga / Driva**, shown in the product as **Find / Build / Run**.

| Stage | Module | What the user does |
|---|---|---|
| Find | Map & redesign | Start from a template or from documents, map the as-is, design the to-be with an autonomy level (L0–L4) per step |
| Build | Agent fit | Score each step on volume, rules, data readiness and error risk, and apply suggested autonomy |
| Build | Value case | Adjust assumptions, see net value as a range with full costs, approve it as the baseline |
| Run | Monitor | Track value, process KPIs and each agent against the baseline; trace gaps to a step and reopen it in Find |

Autonomy levels: L0 manual, L1 assist, L2 draft & approve, L3 act & escalate, L4 autonomous.

### Capabilities beyond the loop

| Capability | Phase |
|---|---|
| Template library (customer service first) | 1 |
| Data and integration readiness per step | 2 |
| Workforce and change: role redesign, freed capacity | 2 |
| AI cost control per agent, model and outcome | 2 |
| Governance and risk: agent registry, approvals, audit trail, EU AI Act | 3 |
| Evaluation: test sets, shadow mode, regression on model change | 3 |
| Portfolio and roadmap across processes | 3 |
| Maturity index and benchmarks across customers | 3 |

**Positioning:** vendor-neutral control plane. We do not build the agent runtime; we design, measure and govern across whatever agent platforms the customer runs.

## Decisions taken

- **Owner:** Buildway.
- **Users:** Buildway advisors first, in customer redesigns. Built multi-tenant with roles from day one so it can become self-serve without a rewrite.
- **Process scope:** process-independent core, with templates. Customer service is the first template.
- **Revenue:** licences, advisory and FDEs, managed services.

## Business model

| Line | What | Platform role |
|---|---|---|
| Licence | Subscription per monitored process or agent, plus seats | Grows as more processes go AI-native |
| Advisory and FDEs | Redesign sprints, agent build and integration | Work happens in the platform and leaves reusable assets |
| Managed services | Buildway runs monitoring and agent operations | Monitoring and value reports are the delivery tool |

Land with advisory, expand with licences, retain with managed services.

## Path to self-serve

1. **Advisor-led:** Buildway advisors use the platform in engagements. We learn where the method needs product.
2. **Side by side:** customer teams work in the platform with our FDEs. Guided steps replace workshop steps.
3. **Self-serve:** customers start from templates with AI guidance. Buildway adds experts and managed services on demand.

## Roadmap

### Phase 0: validate (about 6 weeks)
- Discovery interviews with COOs, CIOs and heads of customer service
- Clickable prototype of the full loop (done: `docs/prototype`)
- 2–3 design partners for customer service

### Phase 1: MVP (about 3 months)
- [x] Domain model and value model with tests
- [x] Customer service template v1
- [x] Screens: overview, templates, redesign canvas, agent fit, value case, monitor
- [x] Postgres persistence and API, with audit log and server-computed baselines
- [x] Sign-in (Microsoft, Google, developer sign-in), workspaces, roles and invitations
- [ ] Draft an as-is map from SOPs and interview notes with Claude
- [x] Actuals via CSV upload
- [ ] First connector (Zendesk or ServiceNow)
- [x] Baseline history and activity log
- [x] Printable value case for steering groups (save as PDF from the browser)
- [x] CI on GitHub Actions, including Postgres 16

### Phase 2: close the loop (3–6 months after MVP)
- Simulation of the to-be (queues, escalation, confidence thresholds) replacing the simple range
- Connectors to agent platforms for agent telemetry (OpenTelemetry GenAI conventions)
- Value-realisation tracking per step
- AI cost control, data readiness, workforce view

### Phase 3: scale
- Governance and EU AI Act workflows, evaluation and shadow mode
- Process-mining import from event logs
- Portfolio view and benchmarks
- More templates (IT service desk next), self-serve onboarding

## Open questions

- Product name: "Buildway Loop" is a working name.
- UI language: English now; Swedish for Nordic customers?
- Licence metric: per monitored process, per agent, or per workspace?
- First connector: which ticketing system do the design partners use?
