# project-hercules

Recomp Ledger — a single-page tracking app with cross-device sync (Netlify Blobs + passphrase).

## Deploy on Netlify

1. Log in at [Netlify](https://www.netlify.com) → **Add new site** → **Import an existing project**
2. Connect GitHub → choose `wilinskisolutions-ui/project-hercules`
3. Publish directory: `.` (or leave blank; `netlify.toml` handles it) → Deploy
4. **Site configuration → Environment variables** → add:
   - `LEDGER_PASSPHRASE` = `EMIL`
5. Trigger a redeploy after saving the env var
6. Open the Netlify URL → unlock with **EMIL** → start logging

On each new browser/device, unlock once with the same passphrase. Data syncs to Netlify Blobs (last write wins). Local cache is used if you go offline.

Anyone with the site URL and passphrase can read and write the ledger. Export JSON/CSV remains available for backups.
