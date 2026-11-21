# Buildway Loop: notes for Claude

- Read `docs/PLAN.md` and `docs/ARCHITECTURE.md` before larger changes.
- Keep `src/domain` free of React and Next.js imports. Any change to the value model or fit scoring needs a test in `src/domain/*.test.ts`, and an update to the formula block in `docs/ARCHITECTURE.md`.
- Nothing customer-service-specific belongs in `src/domain` or shared components; put it in `src/templates`.
- Brand: tokens live at the top of `src/app/globals.css` (cream, dark green ink, rust accent, Bricolage Grotesque and Instrument Sans). Stage colours: Find = sage, Build = coral, Run = dark green. Lanes use the same colours: human = dark green, agent = coral, system = sage.
- Mark example or placeholder data as such in the UI.
- Before committing: `npm test`, `npm run typecheck`, `npm run build`.
