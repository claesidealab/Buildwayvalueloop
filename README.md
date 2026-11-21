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
| Sign-in, workspaces and roles | Next (schema ready, every request acts as the example advisor) |
| Monitoring actuals | Example data; CSV upload and first connector are planned |

The original clickable prototype is kept in [docs/prototype/buildway-loop.html](docs/prototype/buildway-loop.html).

## Run it

Requires Node 20 or later. No database server is needed for development: without `DATABASE_URL` the app uses an embedded Postgres (PGlite) stored in `.data/pglite`, creates the tables and loads the example workspace on first request. Delete `.data/` to start over.

To use a real Postgres, copy `.env.example` to `.env.local` and set `DATABASE_URL`.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # domain, value-model and database tests
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
