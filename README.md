# Dual-Ping Monitor v3

Dual-source monitoring dashboard using real HTTP/HTTPS probes from GitHub Actions and Cloudflare Workers. Static site is served from GitHub Pages (`/docs`). Cloudflare runs independent edge probes and can persist daily samples to `data/cloudflare/YYYY-MM-DD.json` through a GitHub token stored only as a Cloudflare Worker secret.

## Important facts
- Cloudflare Workers cannot send raw ICMP echo packets. Cloudflare metrics are genuine HTTP/HTTPS response checks; ICMP metrics are only available from the GitHub Actions runner where supported.
- HTTP 4xx means the host answered and is counted as reachable; HTTP 5xx and transport/timeout failures are marked down in the current dashboard schema.
- Dashboard values come from real JSON snapshots. If no dataset exists, it shows an error/no-data state rather than invented sample metrics.

## Repository contents
- `docs/` — responsive interactive dashboard, charts, filters, detail panel, CSV/JSON export, theme and auto-refresh.
- `.github/scripts/ping.js` — GitHub Actions probe engine.
- `.github/scripts/merge.js` — merges source snapshots and updates the date index.
- `.github/workflows/monitor.yml` — single scheduled GitHub runner workflow.
- `cloudflare/worker.js` — Cloudflare Worker HTTP probe API, cron, optional KV cache, optional GitHub persistence.
- `cloudflare/wrangler.toml` — Wrangler configuration.
- `targets.json` — targets for GitHub runner checks.

## Deploy GitHub Pages
In repository Settings → Pages, choose Deploy from a branch → `main` → `/docs`. The workflow requires `contents: write` to commit monitoring snapshots using the built-in `GITHUB_TOKEN`. It does not deploy or configure Cloudflare.

## Deploy Cloudflare Worker
```powershell
cd cloudflare
npx wrangler login
npx wrangler deploy
```
The configured Worker name is `dual-ping-worker`. If the workers.dev subdomain remains `game-developer-mb`, the endpoint will be `https://dual-ping-worker.game-developer-mb.workers.dev`.

### Enable Cloudflare-to-GitHub snapshot storage
Create a fine-grained GitHub token restricted to `mehrdadmb2/dual-ping-monitor` with **Contents: Read and write**. Then, inside `cloudflare/`, run:
```powershell
npx wrangler secret put GH_TOKEN
```
Paste the token at the hidden prompt. Do not put the token in source files, GitHub Actions variables, `docs/`, or this repository. `GH_REPO` and `GH_BRANCH` are non-secret vars in `wrangler.toml`. The scheduled Worker stores a rolling array of samples per UTC day and the existing GitHub workflow merges that file into the dashboard dataset.

### Optional KV cache
```powershell
npx wrangler kv namespace create DPM_MONITOR
```
Add the returned ID under `[[kv_namespaces]]` in `wrangler.toml`, uncomment the binding and deploy. KV stores the latest snapshot only; daily sample history remains in GitHub.

## Validate deployment
```powershell
curl.exe -i https://dual-ping-worker.game-developer-mb.workers.dev/health
curl.exe -sS https://dual-ping-worker.game-developer-mb.workers.dev/api/status
curl.exe -sS https://dual-ping-worker.game-developer-mb.workers.dev/api/config
```
The root URL also returns a live snapshot for compatibility with the dashboard. `/api/status` serves KV cache when configured, otherwise runs probes. `POST /api/probe` is disabled unless a `PROBE_TOKEN` secret is configured.

## Custom Cloudflare targets
Add a `TARGETS_JSON` variable in Worker Settings → Variables. Use a JSON array of objects with `id`, `name`, `url`, and optional `category`. Only HTTP/HTTPS targets are accepted; obvious localhost/private-network and cloud metadata addresses are rejected. Limit to 30 targets and keep the timeout/schedule reasonable for your Cloudflare plan.

## Deploy checklist
See `CLOUDFLARE-DEPLOY.md` and `MIGRATION.md` for exact steps. After deploy, run the GitHub Actions workflow manually and confirm the `data/index.json` and `data/merged/YYYY-MM-DD.json` files update.
