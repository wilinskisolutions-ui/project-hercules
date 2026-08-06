# Recomp Ledger

A private performance dashboard for daily weight and macros, body measurements, training logs, trend coaching, and cross-device sync.

## Architecture

```text
React/Vite dashboard
  → /api/ledger (Netlify Function, same-origin/no-store)
    → Supabase Edge Function (passphrase + validation)
      → Supabase Postgres (row-level persistence)
```

- `src/` — React application, calculations, API client, and tests
- `netlify/functions/ledger.mjs` — thin transport proxy; forwards auth and body only
- `supabase/functions/ledger/index.ts` — authoritative API contract and validation
- `supabase/migrations/` — database schema and transactional RPCs
- `tests/` — Playwright browser smoke tests

The browser never receives a service-role key. Public tables have RLS enabled with no anon policies; database access happens through the Edge Function’s service role after passphrase verification.

## Develop

Requires Node 22.12+.

```bash
npm install
npm run dev
```

Open `http://localhost:3456`. Local Vite development calls the Supabase Edge Function directly; production uses the Netlify same-origin proxy.

## Quality checks

```bash
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## Deploy

Netlify configuration is in `netlify.toml`:

- Build: `npm run build`
- Publish: `dist`
- Functions: `netlify/functions`

The production site is `https://hercules0.netlify.app`.

Supabase project: `wfvwciawsbsekkypzzwd`.

Deploy the Edge Function after schema migrations:

```bash
npx supabase db push --project-ref wfvwciawsbsekkypzzwd
npx supabase functions deploy ledger \
  --project-ref wfvwciawsbsekkypzzwd \
  --no-verify-jwt
```

The hosted Edge Function reads `LEDGER_PASSPHRASE` when configured; otherwise it falls back to the protected singleton `settings.passphrase`. The current passphrase is `EMIL`.

## API contract

`GET /api/ledger` returns the full normalized bootstrap payload.

`POST /api/ledger` accepts:

- `upsert_daily`, `delete_daily`
- `upsert_measurement`, `delete_measurement`
- `upsert_workout`, `delete_workout`
- `update_settings`
- `apply_adjustment`
- `import_state`
- `reset`

Every request includes `X-Ledger-Passphrase`. Errors use:

```json
{ "error": "Human-readable message", "code": "STABLE_CODE" }
```

## Data recovery

Use **Export JSON** for a complete local backup or **Export CSV** for daily logs, measurements, and workouts. When the cloud is empty and browser cache contains old data, the dashboard shows **Import history** before allowing another cloud mutation.
