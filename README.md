# project-hercules

Recomp Ledger — physique tracking with Supabase Postgres sync (passphrase-gated Edge Function).

## Stack

- Static SPA: [`index.html`](index.html) + [`config.js`](config.js)
- Backend: Supabase project `recomp-ledger` — Postgres tables + Edge Function `ledger`
- Hosting: Netlify (static only)

## Local preview

```bash
npx serve .
# or
npm run dev
```

Open the site → unlock with passphrase **EMIL**.

If your browser still has old `localStorage` data and the cloud is empty, use **Import local data** after unlock.

## Environment / secrets

| Where | What |
|-------|------|
| [`config.js`](config.js) | `supabaseUrl` + anon/publishable key (public) |
| Supabase `settings.passphrase` | Unlock passphrase (service-role only; never returned to clients) |
| Optional Edge secret `LEDGER_PASSPHRASE` | Overrides DB passphrase if set via `supabase secrets set` |

## Data model

- `settings` — calorie/protein targets, height, passphrase
- `daily_logs` — unique by date
- `measurements` — unique by date
- `workouts` — UUID rows
- `adjustments` — calorie change history

All tables have RLS enabled with **no anon policies**. The browser talks only to the Edge Function.

## Deploy (Netlify)

1. Import `wilinskisolutions-ui/project-hercules` (or your fork)
2. Publish directory: `.`
3. No Netlify env vars required for sync (Supabase handles storage)
4. Redeploy after changing [`config.js`](config.js)

## Edge Function

Source: [`supabase/functions/ledger/index.ts`](supabase/functions/ledger/index.ts)

Redeploy (with Supabase MCP or CLI):

```bash
npx supabase functions deploy ledger --project-ref wfvwciawsbsekkypzzwd --no-verify-jwt
```
