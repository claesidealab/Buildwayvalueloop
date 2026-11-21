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
| Overview, templates, redesign canvas, agent fit, value case, monitor | Working screens, data kept in the browser |
| Monitoring actuals | Example data; CSV and first connector are next |
| Database, auth, workspaces | Designed (`db/schema.sql`), not wired up |

The original clickable prototype is kept in [docs/prototype/buildway-loop.html](docs/prototype/buildway-loop.html).

## Run it

Requires Node 20 or later.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # domain and value-model tests
npm run typecheck
npm run build
```

## Structure

```
src/
  domain/      types, autonomy levels, agent-fit scoring, value model (+ tests)
  templates/   process templates (customer service v1)
  lib/         workspace store (browser storage for now) and hooks
  components/  app shell and shared UI (route track, traffic light, badges)
  app/         Next.js App Router pages
db/            Postgres schema draft
docs/          plan, architecture, prototype
```

## Docs

- [Product plan](docs/PLAN.md): vision, modules, business model, roadmap
- [Architecture](docs/ARCHITECTURE.md): stack, data model, value model, integrations
