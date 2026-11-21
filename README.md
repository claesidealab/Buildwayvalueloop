# Buildway Loop

Buildway's platform for helping companies become AI-native, one process at a time.

It runs one closed loop over a shared process model:

```
Find (map & redesign) → Build (agent fit & value case) → Run (monitor) → back to Find
```

Advisors at Buildway use it first in customer redesigns. The goal is a self-serve platform sold as licences, with advisory, forward-deployed engineers (FDEs) and managed services on top. See [docs/PLAN.md](docs/PLAN.md).

## Status

Phase 1 groundwork. What works today:

| Area | State |
|---|---|
| Domain model and value model | Done, with unit tests (`src/domain`) |
| Customer service template v1 | Done (`src/templates`) |
| Overview, templates, redesign canvas, agent fit, value case, monitor | Working screens |
| Database and API | Done: Postgres via Drizzle, migrations, REST API, audit log, tests |
| Sign-in, workspaces and roles | Done: Microsoft and Google sign-in, sessions, four roles, invitations, members page |
| Monitoring actuals | Done: CSV upload with per-line validation; monitor and overview use real figures (example data only until the first upload) |
| History and report | Done: baseline history, activity log, printable one-page value case (save as PDF) |
| CI | GitHub Actions: tests, types, build, and database tests on Postgres 16 |

The original clickable prototype is kept in [docs/prototype/buildway-loop.html](docs/prototype/buildway-loop.html).

## Run it

Requires Node 20 or later. No database server is needed for development: without `DATABASE_URL` the app uses an embedded Postgres (PGlite) stored in `.data/pglite`, creates the tables and loads the example workspace on first request. Delete `.data/` to start over.

To use a real Postgres, copy `.env.example` to `.env.local` and set `DATABASE_URL`.

### Signing in

In development (`npm run dev`) the login page offers a **developer sign-in** with four example people, one per role. It is off in production unless `AUTH_DEV_LOGIN=true`.

For real sign-in, register the app with Microsoft and/or Google and set the keys in `.env.local` (see `.env.example`). The redirect URI to register is `<AUTH_URL>/api/auth/callback/microsoft-entra-id` or `<AUTH_URL>/api/auth/callback/google`.

- **Microsoft (Entra ID):** Azure portal → App registrations → New registration. Use tenant `organizations` to accept any company's work account. Add a client secret.
- **Google:** Google Cloud console → APIs & Services → Credentials → OAuth client ID (web application).

People whose email domain is in `BUILDWAY_EMAIL_DOMAINS` (default `buildway.se`) are Buildway staff: they can create workspaces and are added to the example workspace as advisors. Everyone else sees only the workspaces they have been invited to.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # all tests (database tests on embedded PGlite)
npm run test:pg    # database tests on a real Postgres: set TEST_DATABASE_URL to a throwaway database
npm run typecheck
npm run build
```

## Structure

```
src/
  domain/      types, autonomy levels, agent-fit scoring, value model (+ tests)
  templates/   process templates (customer service v1)
  server/      database schema and connection, repository (data access), HTTP helpers
  lib/         API types, client workspace store and hooks
  components/  app shell and shared UI (route track, traffic light, badges)
  app/         Next.js pages and API routes (app/api)
drizzle/       generated SQL migrations
docs/          plan, architecture, prototype
```

## Docs

- [Product plan](docs/PLAN.md): vision, modules, business model, roadmap
- [Architecture](docs/ARCHITECTURE.md): stack, data model, value model, integrations
