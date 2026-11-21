# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router), React, TypeScript | One codebase for UI and API routes; easy to host in the EU |
| Domain | Plain TypeScript in `src/domain`, no framework imports | Testable, reusable on server and client |
| Database | Postgres via Drizzle ORM; embedded PGlite when `DATABASE_URL` is unset | Relational model fits processes, steps and baselines; no database server needed in development or tests |
| Validation | zod at the API boundary | Reject bad input before it reaches the database |
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

- Every tenant-owned row carries `workspace_id`, and every repository query filters on it. Postgres row-level security is added with sign-in.
- Roles: `advisor` (Buildway, may belong to many workspaces), `customer_admin`, `process_owner`, `viewer`.
- Advisors approve baselines in phase 1; customer admins can approve in the self-serve stage.

## Integrations (in order)

1. CSV upload of monthly actuals per KPI
2. One ticketing or CRM system (Zendesk or ServiceNow, depending on design partners)
3. Agent platforms (Copilot Studio, Agentforce, Claude- or OpenAI-based agents) through OpenTelemetry and connectors

## Persistence

- Schema: `src/server/db/schema.ts` is the source of truth. After changing it, run `npx drizzle-kit generate --name <change>` and commit the new file in `drizzle/`. Migrations run automatically on first connection.
- Connection: `src/server/db/index.ts`. `DATABASE_URL` set: node-postgres. Unset: PGlite in `PGLITE_DIR` (default `.data/pglite`). Tests use an in-memory PGlite per test.
- Data access: `src/server/repo.ts`. Every function takes a workspace slug and filters on `workspace_id`. Domain errors (`NotFoundError`, `ConflictError`) map to 404 and 409 in `src/server/http.ts`.
- Designs: each process has one mutable **draft** design (enforced by a partial unique index). Approving a baseline copies the draft into a new immutable **approved** design and records the baseline with the value computed on the server. The client never sends the value.
- Every change writes an `audit_log` row.
- The example workspace (`acme-support`) is seeded on first request and can be reset; real workspaces cannot.

## API

All responses to successful calls return the full workspace state (`WorkspaceState` in `src/lib/api-types.ts`).

| Method | Path | Body |
|---|---|---|
| GET | `/api/workspaces/:ws` | – |
| PATCH | `/api/workspaces/:ws/processes/:process/steps/:step` | `{ autonomy?: 0–4, isSystem?: boolean }` |
| PATCH | `/api/workspaces/:ws/processes/:process/assumptions` | any subset of `Assumptions` |
| POST | `/api/workspaces/:ws/processes/:process/baselines` | – |
| POST | `/api/workspaces/:ws/reset` | – (example workspaces only) |

The client store (`src/lib/store.tsx`) applies changes optimistically, sends slider changes after 300 ms of rest, and ignores responses that arrive after a newer change.

## Current gaps

- No sign-in yet: every request acts as the seeded Buildway advisor, and the app shows one workspace (`NEXT_PUBLIC_WORKSPACE`, default `acme-support`). Phase 1, step 2 adds sign-in, memberships checks on every route and row-level security.
- Monitoring uses example actuals marked in the UI; the `actuals` table is ready for CSV upload.
