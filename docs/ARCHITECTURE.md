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
cases / yr        = cases per month × 12
case share        = share of cases that pass through a step (default 100%)
automated share   = AUTOMATION_SHARE[level]   (0, 0.2, 0.45, 0.7, 0.9)
                    × agent quality / 80 for agent-led steps, capped at 0.98
minutes today     = Σ over today's steps (phase both or as-is) of minutes × case share
minutes after     = Σ over redesigned steps (phase both or to-be) of minutes × case share × (1 − automated share)
hours released    = cases / yr × (minutes today − minutes after) / 60
labour benefit    = hours released × cost per hour
oversight         = labour benefit × oversight share   (0 if the redesign adds work)
AI cost           = cases / yr × Σ case share × (1 agent-led | 0.5 assisted) × cost per step and case
net               = labour benefit − oversight − AI cost − fixed cost
range             = net − 25% … net + 15% of |labour benefit|   (until simulation, phase 2)
```

A step removed in the redesign (phase `as-is`) saves all its time; a new manual step (phase `to-be`) adds time.

Actuals (`src/domain/actuals.ts`, covered by `actuals.test.ts`):

```
realised value / month = hours_released × cost per hour × (1 − oversight share)
                         − AI cost (ai_cost_sek if uploaded, else plan AI cost / 12)
                         − fixed cost / 12
plan / month           = baseline net (or current case) / 12, or, when the process is linked to a
                         flow in the chosen scenario: net / 12 × the scenario's ramp share at mid-month
                         (one time model, src/domain/progress.ts measureBasis)
realised share         = Σ realised ÷ Σ plan, over months with hours_released
stage                  = furthest of stored stage, find (steps), build (baseline), run (actuals)
light                  = with actuals: green ≥ 90% realised share, amber ≥ 70%, red below
step alert             = agent success < 80% or escalation > 15% in the latest month
AI cost in a month     = ai_cost_sek if uploaded, else Σ agent_cost_sek when every agent step reports one, else plan AI cost / 12
```

CSV: `month,metric,step,value`, comma or semicolon separated (decimal comma allowed with semicolons). Metrics: `hours_released`, `ai_cost_sek`, `cases`, `handled_without_human`, `cost_per_case`, `csat` (process level) and `success_rate`, `escalation_rate` (per step). Uploads are all or nothing: any bad row and nothing is stored; the response lists problems by line. Re-uploading a month replaces its values (unique per process, step, metric, month and source).

Strategy scenarios (`src/domain/strategy.ts`, covered by `strategy.test.ts`):

```
per flow in a scenario: go-live half-year, months to full value (ramp), value per year at full run-rate
ramp share at month m   = 0 before go-live, then linear to 1 over the ramp months
value realised in year  = Σ flows Σ months (run-rate / 12 × ramp share at mid-month)
run-rate at year end    = Σ flows run-rate × ramp share at year end
total cost in year      = one-off cash + running cash + own staff FTE × own time rate
net in year             = value realised − total cost; cumulative net adds the years
value after the plan    = run-rate at the end of the last year − that year's running cost
payback year            = first year cumulative net ≥ 0; if after the plan, projected with value after the plan
flow priority (0–100)   = value 35/20/5 + evidence 25/15/5 + waiting 25/15/5 + volume 15/10/3
suggested decision      = redesign if priority ≥ 70 and waiting and evidence aren't low; improve if ≥ 45; else leave; new flows: build
plan for a month        = value per year / 12 × ramp share at mid-month   (plannedForMonth)
what-if drivers         = run-rate × value %, go-live ± half-years (not before the plan), ramp × ramp %,
                          cash costs × cost %, own staff FTE × own time %   (applyDrivers; not saved unless copied)
sensitivity             = net over the plan with each driver alone at value ±20%, go-live ±6 months,
                          ramp ±50%, costs ±20%; rows sorted by the larger distance from the base
value against ease      = value (value + waiting + volume points) / 75 × 100; ease = evidence 85/50/15
value case in scenario terms (like-for-like bottom-up check):
  comparable run-rate   = labour benefit − oversight
  running costs         = AI cost + fixed cost   (go in the scenario's running cost lines, not the flow's value)
```

Gate checks (`src/domain/gates.ts`, covered by `gates.test.ts`):

```
value_vs_plan = Σ realised ÷ Σ planned over the half-year's months with hours_released (plan follows the ramp)
other metrics = the process metric's value in the last month of the half-year that has it
suggestion    = met if measured passes the target (≥ or ≤), missed if not, no-data without uploads
```

Agent registry and telemetry (`src/domain/agents.ts`, `src/domain/telemetry.ts`, covered by tests):

```
agents             = steps in the AI agent lane (L3+, not systems), with a registry record or defaults
cost this month    = agent_cost_sek in the latest month with data; cost per run = cost ÷ agent_runs
over budget        = cost this month > monthly budget
OTLP/JSON import   = spans matched by gen_ai.agent.name (or gen_ai.agent.id, valueloop.step) to the
                     registry name, step key or step name; children inherit the invoke_agent span's agent
  agent_runs       = invoke_agent spans per month (distinct traces if there are none)
  agent_cost_sek   = input tokens / 1M × price in + output tokens / 1M × price out (child model calls;
                     the invoke_agent span's own usage only when no child reports any)
  success_rate     = runs without status ERROR ÷ runs; escalation_rate = runs with valueloop.escalated ÷ runs
```

Agent fit (`src/domain/fit.ts`) scores 0–100 from four ratings (volume, rule-based, data ready, error risk) and suggests a level. High error risk caps the suggestion at L2.

## Sign-in, workspaces and roles

- **Sign-in** (`src/server/auth-config.ts`, `src/app/api/auth/*`): OAuth with PKCE and state cookies, then the ID token's claims (email, name, subject) from the provider's token endpoint. Microsoft identities are keyed on `tenant:object id`; Google requires a verified email. A provider is shown only when its keys are set.
- **Sessions** (`src/server/access.ts`, `src/server/session.ts`): a random 32-byte token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production); only its SHA-256 hash is stored. Sessions last 30 days and are extended when less than 15 days remain. Sign-out deletes the session.
- **Users and identities:** one user per email; an identity row links each provider account to it. First sign-in creates the user, links by email, and accepts any pending invitations for that email.
- **Buildway staff:** email domain in `BUILDWAY_EMAIL_DOMAINS`. Only they can create workspaces or hold the advisor role.
- **Membership is the only way into a workspace.** Non-members get 404, so workspace names don't leak.
- **Developer sign-in:** signs in as an existing example user; on by default only outside production.
- **CSRF:** cookies are `SameSite=Lax`, and `src/middleware.ts` refuses non-GET API calls whose `Origin` is another site.

| Role | Read | Comment on steps | Edit designs and assumptions | Upload actuals | Approve baselines | Manage members | Edit strategy | Reset example |
|---|---|---|---|---|---|---|---|---|
| Viewer | ✓ | ✓ | | | | | | |
| Process owner | ✓ | ✓ | ✓ | ✓ | | | | |
| Admin (customer) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Buildway advisor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

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
- Process map: steps have a canvas position (`pos_x`, also their order), a share of cases and a phase (`both`, `as-is` = removed in the redesign, `to-be` = new in the redesign). Arrows are rows in `process_edges`. Deleting a step archives it (`archived_at`) so baselines and uploaded figures that use it still resolve. Approved designs store a snapshot of the step definitions they were valued with (`designs.steps_snapshot`), so later edits never change an approved baseline.
- Canvas: `src/components/ProcessCanvas.tsx` (React Flow). Lanes are bands of autonomy: dropping a step in the Human lane caps it at L2, the AI agent lane makes it at least L3, the System lane makes it an L4 rule-based system (`levelForLane` in `src/domain/autonomy.ts`).
- Comments: `step_comments` holds discussion per step (author name kept if the user is removed), resolved or open. They come with the process in the workspace state and show on the canvas as a count of open comments.
- Agent registry: `agents` has one row per agent-carried step (name as in telemetry, platform, owner, model, status planned/shadow/live/paused, EU AI Act risk class, monthly budget, token prices). Telemetry is stored as actuals with source `telemetry`; when CSV and telemetry give the same month, metric and step, the latest import wins.
- Map import: `importMap` adds several steps and arrows in one transaction, after the steps already on the map. Used for the AI-drafted as-is map (`src/server/process-draft.ts`, Claude with structured output, reviewed before adding) and BPMN files.
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
| POST | `/api/workspaces/:ws/processes/:process/steps` | `{ name, view, minutesPerCase?, caseShare?, x?, autonomy?, isSystem?, fit? }` | design.edit |
| PATCH | `/api/workspaces/:ws/processes/:process/steps/:step` | any of `autonomy`, `isSystem`, `name`, `description`, `minutesPerCase`, `caseShare`, `x`, `fit` | design.edit |
| DELETE | `/api/workspaces/:ws/processes/:process/steps/:step?view=to-be\|as-is` | – | design.edit |
| POST | `/api/workspaces/:ws/processes/:process/steps/:step/restore` | – | design.edit |
| POST, DELETE | `/api/workspaces/:ws/processes/:process/edges[/:id]` | POST `{ from, to }` | design.edit |
| PATCH | `/api/workspaces/:ws/processes/:process/assumptions` | any subset of `Assumptions` | design.edit |
| POST | `/api/workspaces/:ws/processes/:process/comments` | `{ step, body }` | design.comment |
| PATCH | `/api/workspaces/:ws/processes/:process/comments/:id` | `{ resolved }` | design.comment |
| POST | `/api/workspaces/:ws/processes/:process/draft` | `{ text }`: Claude drafts today's steps; nothing is saved (503 without `ANTHROPIC_API_KEY`) | design.edit |
| PUT | `/api/workspaces/:ws/processes/:process/agents/:step` | `{ name, platform, owner, model, status, risk, monthlyBudget, priceIn, priceOut }` | design.edit |
| POST | `/api/workspaces/:ws/processes/:process/telemetry` | `{ otlp }`: OTLP/JSON traces (max 5 MB) | actuals.import |
| POST | `/api/workspaces/:ws/processes/:process/import` | `{ steps, edges }`: add reviewed steps and arrows at once | design.edit |
| POST | `/api/workspaces/:ws/processes/:process/baselines` | – | baseline.approve |
| POST | `/api/workspaces/:ws/reset` | – (example workspaces only) | workspace.reset |
| GET, POST | `/api/workspaces/:ws/members` | POST `{ email, role }` | read / members.manage |
| PATCH, DELETE | `/api/workspaces/:ws/members/:userId` | PATCH `{ role }` | members.manage |
| DELETE | `/api/workspaces/:ws/invitations/:id` | – | members.manage |
| POST, DELETE | `/api/workspaces/:ws/processes/:process/actuals` | POST `{ csv }` (max 1 MB) | actuals.import |
| GET | `/api/workspaces/:ws/processes/:process/actuals/template` | – (CSV file) | workspace.read |
| GET | `/api/workspaces/:ws/history` | – | workspace.read |
| GET, PUT | `/api/workspaces/:ws/strategy` | PUT `{ plan, version }` (409 if someone saved since) | read / strategy.edit |
| POST | `/api/workspaces/:ws/strategy/decisions` | `{ kind, attendees, text }` | strategy.edit |
| POST | `/api/workspaces/:ws/strategy/flows/:flowId/process` | – (creates an empty process and links it) | strategy.edit + design.edit |
| POST | `/api/workspaces/:ws/strategy/discover` | `{ text }` (Claude suggests flows; nothing saved) | strategy.edit |

Errors: 400 invalid input, 401 not signed in, 403 role doesn't allow it, 404 not found or not a member, 409 conflict, 422 CSV with problems.

The client store (`src/lib/store.tsx`) applies changes optimistically, sends slider changes after 300 ms of rest, and ignores responses that arrive after a newer change.

## Strategy module

- One plan per workspace in `strategy_plans`: flows, scenarios with gates, ambition targets and decisions, stored as a versioned JSON document (`src/server/strategy-repo.ts`, validated by `src/server/strategy-schema.ts`). Saves send the version they edited; a newer version on the server is a 409, so two people editing in the room never overwrite each other silently.
- Decisions are append-only: they are added through their own endpoint, stamped with server time and the signed-in person, and ignored on plan saves.
- Example workspaces start from `src/templates/strategy-example.ts`, a made-up company with four scenarios in SEK; other workspaces start empty.
- AI discovery (`src/server/discovery.ts`) calls Claude (`claude-opus-5-5`, structured output, server-side fallback on refusal) with the material people paste. It needs `ANTHROPIC_API_KEY`; without it the endpoint answers 503 and the screen says how to turn it on. Suggestions are shown for review and saved only when someone adds them.
- Bottom-up check: a scenario flow linked to a process shows that process's value case beside the top-down estimate, on the same basis (before running costs), with a button to use it in the scenario.
- Gates can carry a measure (a linked process, a metric, a target). The scenario page checks it against uploaded actuals and suggests met or missed; the room still decides.
- The strategy plan is loaded for the whole workspace, so monitoring and the overview measure against the chosen scenario's timing.

## Current gaps

- Microsoft and Google sign-in are implemented but not yet tried against real accounts (needs app registrations).
- Invitations are not emailed: tell people to sign in with the invited address. Email delivery comes with an email provider.
- Postgres row-level security as a second line of defence is not switched on yet; isolation relies on the repository's workspace filters, covered by tests.
- No rate limiting on sign-in routes yet; add at the hosting layer.
- AI discovery has been tested with a stand-in for Claude, not yet against the live API.
