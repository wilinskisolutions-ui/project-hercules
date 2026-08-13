# Agent notes

## Cursor Cloud specific instructions

- Node 22+ is required (see `.nvmrc`). Dependencies install via `npm ci` during environment builds.
- Dev server: `npm run dev` (Vite on port 3456). Local `/api/ledger` is proxied to the hosted Supabase Edge Function.
- Quality checks: `npm run lint`, `npm test`, `npm run build`.
- Browser e2e: `npx playwright install chromium` once per machine if needed, then `npm run test:e2e`.
- Unlock the dashboard UI with the ledger passphrase when exercising the live API; do not commit secrets.
