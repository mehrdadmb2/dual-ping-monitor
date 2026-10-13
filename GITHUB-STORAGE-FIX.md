# GitHub storage + GitHub Pages fix

## Root cause addressed in this package

- Cloudflare Worker only writes historical snapshots when the `GH_TOKEN` secret and `GH_REPO` variable are present. `/health` now exposes a safe boolean `publisherConfigured` without revealing any secret.
- GitHub Pages configured to publish `main` → `/docs` cannot serve the top-level `/data` directory. The Actions workflow now copies `data/` to `docs/data/` after building the daily merged data.
- The dashboard now reads `data/` relative to the Pages site root and falls back to a live Cloudflare probe when static history has not been published yet.
- Live browser requests no longer write GitHub history. The scheduled Worker trigger writes one sample every five minutes, avoiding excessive GitHub API writes from dashboard refreshes.

## Apply the fix

1. Replace the repository contents with the contents of this package's `dual-ping-monitor-v3/` directory. Keep `.github/workflows/monitor.yml` on the `main` branch.
2. Confirm GitHub Pages is configured as **Deploy from a branch → `main` → `/docs`**.
3. From the package's `cloudflare/` folder, run `npx wrangler secret list`. If `GH_TOKEN` is missing, run `npx wrangler secret put GH_TOKEN` and paste a fine-grained PAT scoped to `mehrdadmb2/dual-ping-monitor` with **Contents: Read and write**.
4. Run `npx wrangler deploy` from that same `cloudflare/` folder.
5. Open `/health` on the Worker. Confirm `publisherConfigured` is `true`. This verifies configuration is present, not that GitHub accepted the token.
6. Run `npx wrangler tail`, then wait for the next five-minute scheduled run. Success is logged as `GitHub history saved: data/cloudflare/YYYY-MM-DD.json`. Errors include GitHub's HTTP status and response body.
7. In GitHub → Actions → **Dual Ping Monitor**, choose **Run workflow** once. The workflow creates/updates merged history and copies all current datasets under `docs/data/`.
8. Verify these URLs:
   - `https://dual-ping-worker.game-developer-mb.workers.dev/health`
   - `https://dual-ping-worker.game-developer-mb.workers.dev/api/status`
   - `https://mehrdadmb2.github.io/dual-ping-monitor/data/index.json`
   - `https://mehrdadmb2.github.io/dual-ping-monitor/data/merged/YYYY-MM-DD.json` (replace with the date shown in `index.json`)

## Common log interpretations

- `publisherConfigured: false`: set `GH_TOKEN` or correct `GH_REPO`.
- GitHub HTTP 401: token invalid/revoked/expired.
- GitHub HTTP 403: token does not have Contents write permission, repository access is missing, or the API rate limit was reached.
- GitHub HTTP 404 reading the file: often a branch/repository configuration issue. The code treats 404 for a new daily file as expected and then creates it.
- The Worker has a file under root `data/` but Pages still shows no history: rerun the `Dual Ping Monitor` Actions workflow and confirm `docs/data/` is committed and Pages publishes `/docs`.

## GitHub Actions fixes (v3.1)

The current Actions workflow previously called `spawnSync('ping', ...)` repeatedly while probing every target. `spawnSync` blocks Node.js's event loop; during that time in-flight HTTP requests and timeout handlers cannot complete, which can produce false `DOWN` results and very long runs. The updated `ping.js` uses asynchronous child processes and prints the nested HTTP/DNS/TCP/ICMP error details for every failed target.

The final workflow step also fetches and rebases `origin/main` and retries the push up to four times. This is required because Cloudflare's scheduled Worker independently writes snapshots to the same `main` branch. It intentionally does not force-push, so it cannot overwrite Worker history or other commits.

Replace these two files in the repository:

- `.github/scripts/ping.js`
- `.github/workflows/monitor.yml`

Then run **Actions → Dual Ping Monitor → Run workflow** manually. The probe step should finish much faster. If a target still fails, the log now prints the actual cause (for example DNS lookup failure, timeout, connection refusal, or ICMP permission restriction) instead of only `via none`.

The v3.1 Action update also changes DNS targets to use provider-specific DNS-over-HTTPS endpoints over HTTP/2. In this mode, the DNS result is an actual DNS query through that provider; the ICMP/TCP 53 fields are not used for DNS records because those transports can be filtered from hosted CI runners.
