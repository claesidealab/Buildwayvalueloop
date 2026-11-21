# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router), React, TypeScript | One codebase for UI and API routes; easy to host in the EU |
| Domain | Plain TypeScript in `src/domain`, no framework imports | Testable, reusable on server and client |
| Database | Postgres (phase 1) | Relational model fits processes, steps and baselines; row-level security for tenants |
| Auth | To decide: Auth.js or a managed provider with SSO (Entra ID, Google) | Enterprise customers need SSO |
| AI | Claude via the Anthropic API | Draft maps from documents, suggest placements, explain value |
| Simulation | Python service (phase 2) | Discrete-event or Monte Carlo simulation of the to-be |
| Telemetry | OpenTelemetry GenAI conventions plus connectors (phase 2) | Vendor-neutral agent monitoring |
| Hosting | EU region | Data residency for Nordic customers |

## Domain model

```
Workspace (tenant) ─┬─ Member (role)
                    └─ Process ─┬─ Step (from template, editable)
                                ├─ Design (version: autonomy per step, system flags)
                                ├─ Assumptions (per design version)
                                ├─ Baseline (approved design + assumptions + net value)
                                └─ Actuals (metric time series, per process and per step)
Template ── StepDefinition, default design, default assumptions, agent patterns, KPIs
```

- **Lane** is derived, not stored: L0–L2 human (with AI help from L1), L3–L4 AI agent, L4 flagged steps run as a rule-based system. See `src/domain/autonomy.ts`.
- **Templates** are versioned code today (`src/templates`). They move to the database when customers can save their own.
- **Baselines** are immutable snapshots. Monitoring always compares actuals with the latest approved baseline.

## Value model

`src/domain/value-model.ts`, covered by `value-model.test.ts`:

```
cases / yr       = cases per month × 12
automated share  = AUTOMATION_SHARE[level]   (0, 0.2, 0.45, 0.7, 0.9)
                   × agent quality / 80 for agent-led steps, capped at 0.98
hours released   = cases / yr × Σ (minutes per case × automated share) / 60
labour benefit   = hours released × cost per hour
oversight        = labour benefit × oversight share
AI cost          = cases / yr × (agent-led steps + 0.5 × assisted steps) × cost per step and case
net              = labour benefit − oversight − AI cost − fixed cost
range            = net − 25% … net + 15% of labour benefit   (until simulation, phase 2)
```

Agent fit (`src/domain/fit.ts`) scores 0–100 from four ratings (volume, rule-based, data ready, error risk) and suggests a level. High error risk caps the suggestion at L2.

## Multi-tenancy and roles

- Every row carries `workspace_id`; Postgres row-level security enforces it.
- Roles: `advisor` (Buildway, may belong to many workspaces), `customer_admin`, `process_owner`, `viewer`.
- Advisors approve baselines in phase 1; customer admins can approve in the self-serve stage.

## Integrations (in order)

1. CSV upload of monthly actuals per KPI
2. One ticketing or CRM system (Zendesk or ServiceNow, depending on design partners)
3. Agent platforms (Copilot Studio, Agentforce, Claude- or OpenAI-based agents) through OpenTelemetry and connectors

## Current state of the code

- Workspace data lives in the browser (`src/lib/store.tsx`, localStorage) so screens can be tested with design partners. The store's shape mirrors `db/schema.sql`, so swapping in an API is a contained change.
- Monitoring uses example actuals marked in the UI.
