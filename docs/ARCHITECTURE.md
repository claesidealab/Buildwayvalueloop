# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router), React, TypeScript | One codebase for UI and API routes; easy to host in the EU |
| Domain | Plain TypeScript in `src/domain`, no framework imports | Testable, reusable on server and client |
| Database | Postgres via Drizzle ORM; embedded PGlite when `DATABASE_URL` is unset | Relational model fits processes, steps and baselines; no database server needed in development or tests |
| Validation | zod at the API boundary | Reject bad input before it reaches the database |
| Auth | Own session handling plus OAuth/OpenID Connect via `arctic` (Microsoft Entra ID, Google) | Work-account sign-in for enterprise customers; few moving parts |
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

Actuals (`src/domain/actuals.ts`, covered by `actuals.test.ts`):

```
realised value / month = hours_released × cost per hour × (1 − oversight share)
                         − AI cost (ai_cost_sek if uploaded, else plan AI cost / 12)
                         − fixed cost / 12
plan / month           = baseline net (or current case) / 12
realised share         = Σ realised ÷ Σ plan, over months with hours_released
step alert             = agent success < 80% or escalation > 15% in the latest month
```

CSV: `month,metric,step,value`, comma or semicolon separated (decimal comma allowed with semicolons). Metrics: `hours_released`, `ai_cost_sek`, `cases`, `handled_without_human`, `cost_per_case`, `csat` (process level) and `success_rate`, `escalation_rate` (per step). Uploads are all or nothing: any bad row and nothing is stored; the response lists problems by line. Re-uploading a month replaces its values (unique per process, step, metric, month and source).

Agent fit (`src/domain/fit.ts`) scores 0–100 from four ratings (volume, rule-based, data ready, error risk) and suggests a level. High error risk caps the suggestion at L2.

## Sign-in, workspaces and roles

- **Sign-in** (`src/server/auth-config.ts`, `src/app/api/auth/*`): OAuth with PKCE and state cookies, then the ID token's claims (email, name, subject) from the provider's token endpoint. Microsoft identities are keyed on `tenant:object id`; Google requires a verified email. A provider is shown only when its keys are set.
- **Sessions** (`src/server/access.ts`, `src/server/session.ts`): a random 32-byte token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production); only its SHA-256 hash is stored. Sessions last 30 days and are extended when less than 15 days remain. Sign-out deletes the session.
- **Users and identities:** one user per email; an identity row links each provider account to it. First sign-in creates the user, links by email, and accepts any pending invitations for that email.
- **Buildway staff:** email domain in `BUILDWAY_EMAIL_DOMAINS`. Only they can create workspaces or hold the advisor role.
- **Membership is the only way into a workspace.** Non-members get 404, so workspace names don't leak.
- **Developer sign-in:** signs in as an existing example user; on by default only outside production.
- **CSRF:** cookies are `SameSite=Lax`, and `src/middleware.ts` refuses non-GET API calls whose `Origin` is another site.

| Role | Read | Edit designs and assumptions | Upload actuals | Approve baselines | Manage members | Reset example |
|---|---|---|---|---|---|---|
| Viewer | ✓ | | | | | |
| Process owner | ✓ | ✓ | ✓ | | | |
| Admin (customer) | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Buildway advisor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Permissions live in `src/domain/permissions.ts`. Every API route calls `guard(workspace, permission)` in `src/server/http.ts`, which signs the user in from the cookie and checks the role. The UI hides or disables what the role can't do, but the server is what enforces it. A workspace always keeps at least one admin or advisor.

## Integrations (in order)

1. CSV upload of monthly actuals per KPI
2. One ticketing or CRM system (Zendesk or ServiceNow, depending on design partners)
3. Agent platforms (Copilot Studio, Agentforce, Claude- or OpenAI-based agents) through OpenTelemetry and connectors

## Persistence

- Schema: `src/server/db/schema.ts` is the source of truth. After changing it, run `npx drizzle-kit generate --name <change>` and commit the new file in `drizzle/`. Migrations run automatically on first connection.
- Connection: `src/server/db/index.ts`. `DATABASE_URL` set: node-postgres. Unset: PGlite in `PGLITE_DIR` (default `.data/pglite`). Tests use an in-memory PGlite per test, or a real Postgres when `TEST_DATABASE_URL` is set (`npm run test:pg`; CI runs both).
- Data access: `src/server/repo.ts`. Every function takes a workspace slug and filters on `workspace_id`. Domain errors (`NotFoundError`, `ConflictError`) map to 404 and 409 in `src/server/http.ts`.
- Designs: each process has one mutable **draft** design (enforced by a partial unique index). Approving a baseline copies the draft into a new immutable **approved** design and records the baseline with the value computed on the server. The client never sends the value.
- Every change writes an `audit_log` row: design edits, assumptions, baselines, uploads, and member and workspace changes. The History page shows them in plain language.
- The example workspace (`acme-support`) is seeded on first request and can be reset; real workspaces cannot.

## API

Workspace calls return the full workspace state (`WorkspaceState` in `src/lib/api-types.ts`), including `me`: the caller's role and permissions. Pages live under `/w/:ws/...`.

| Method | Path | Body | Permission |
|---|---|---|---|
| GET | `/api/auth/providers` | – | public |
| GET | `/api/auth/login/:provider`, `/api/auth/callback/:provider` | – | public (OAuth flow) |
| POST | `/api/auth/dev-login` | `{ email }` | developer sign-in only |
| POST | `/api/auth/logout` | – | signed in |
| GET | `/api/me` | – | signed in |
| POST | `/api/workspaces` | `{ name, slug }` | Buildway staff |
| GET | `/api/workspaces/:ws` | – | workspace.read |
| PATCH | `/api/workspaces/:ws/processes/:process/steps/:step` | `{ autonomy?: 0–4, isSystem?: boolean }` | design.edit |
| PATCH | `/api/workspaces/:ws/processes/:process/assumptions` | any subset of `Assumptions` | design.edit |
| POST | `/api/workspaces/:ws/processes/:process/baselines` | – | baseline.approve |
| POST | `/api/workspaces/:ws/reset` | – (example workspaces only) | workspace.reset |
| GET, POST | `/api/workspaces/:ws/members` | POST `{ email, role }` | read / members.manage |
| PATCH, DELETE | `/api/workspaces/:ws/members/:userId` | PATCH `{ role }` | members.manage |
| DELETE | `/api/workspaces/:ws/invitations/:id` | – | members.manage |
| POST, DELETE | `/api/workspaces/:ws/processes/:process/actuals` | POST `{ csv }` (max 1 MB) | actuals.import |
| GET | `/api/workspaces/:ws/processes/:process/actuals/template` | – (CSV file) | workspace.read |
| GET | `/api/workspaces/:ws/history` | – | workspace.read |

Errors: 400 invalid input, 401 not signed in, 403 role doesn't allow it, 404 not found or not a member, 409 conflict, 422 CSV with problems.

The client store (`src/lib/store.tsx`) applies changes optimistically, sends slider changes after 300 ms of rest, and ignores responses that arrive after a newer change.

## Current gaps

- Microsoft and Google sign-in are implemented but not yet tried against real accounts (needs app registrations).
- Invitations are not emailed: tell people to sign in with the invited address. Email delivery comes with an email provider.
- Postgres row-level security as a second line of defence is not switched on yet; isolation relies on the repository's workspace filters, covered by tests.
- No rate limiting on sign-in routes yet; add at the hosting layer.
