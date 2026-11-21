# Value Loop: notes for Claude

- Read `docs/PLAN.md` and `docs/ARCHITECTURE.md` before larger changes.
- Keep `src/domain` free of React and Next.js imports. Any change to the value model or fit scoring needs a test in `src/domain/*.test.ts`, and an update to the formula block in `docs/ARCHITECTURE.md`.
- Nothing customer-service-specific belongs in `src/domain` or shared components; put it in `src/templates`.
- Brand: tokens live at the top of `src/app/globals.css` (cream, dark green ink, rust accent, Bricolage Grotesque and Instrument Sans). Stage colours: Find = sage, Build = coral, Run = dark green. Lanes use the same colours: human = dark green, agent = coral, system = sage.
- Mark example or placeholder data as such in the UI.
- Database: change `src/server/db/schema.ts`, then `npx drizzle-kit generate --name <change>` and commit the migration. Never edit an existing migration.
- All data access goes through `src/server/repo.ts` (workspace content), `src/server/access.ts` (users, sessions, members) and `src/server/strategy-repo.ts` (strategy plan), scoped by workspace.
- Any change to scenario calculations or flow scoring in `src/domain/strategy.ts` needs a test in `src/domain/strategy.test.ts` and an update to the strategy formula block in `docs/ARCHITECTURE.md`.
- Claude API calls live in `src/server/`, use the official SDK and `claude-opus-5-5`, and must work without a key (explain how to turn the feature on).
- Every workspace API route must start with `guard(ws, permission)` from `src/server/http.ts`, before reading the body. New permissions go in `src/domain/permissions.ts` with a test. Compute values on the server with `src/domain`; never trust values sent by the client.
- Repository and access changes need tests in `src/server/repo.test.ts` or `src/server/access.test.ts` (in-memory PGlite).
- Before committing: `npm test`, `npm run typecheck`, `npm run build`. For schema or query changes also run `npm run test:pg` against a throwaway Postgres (CI does this on Postgres 16).
