# Cloudflare Worker v4 deployment

The v4 Worker uses the same Worker name and `workers.dev` endpoint as the previous deployment. It probes 38 websites and 6 DNS-over-HTTPS resolvers from Cloudflare Edge.

## Deploy

Run these commands from the repository root:

```powershell
npx wrangler login
npx wrangler deploy --config cloudflare/wrangler.toml
```

If Wrangler is already authenticated, skip `login`.

## Configure GitHub history persistence

Create a fine-grained GitHub token restricted to `mehrdadmb2/dual-ping-monitor` with **Contents: Read and write**. Set it as a Worker secret:

```powershell
npx wrangler secret put GH_TOKEN --config cloudflare/wrangler.toml
```

Paste the token at the hidden prompt. Never place it in this repository, `wrangler.toml`, frontend configuration, or GitHub Pages. An existing `GH_TOKEN` secret remains configured across a normal Worker deployment.

The Worker writes only to `docs/data/cloudflare/YYYY-MM-DD.json`. The GitHub Actions workflow owns `data/github/`, `data/merged/`, the date index, and their published copies. This separation avoids two automation systems overwriting the same daily data file.

If the token is absent or invalid, live probing still works; only historical persistence is affected.

## Endpoints

```text
GET https://dual-ping-worker.game-developer-mb.workers.dev/health
GET https://dual-ping-worker.game-developer-mb.workers.dev/api/health
GET https://dual-ping-worker.game-developer-mb.workers.dev/api/status
GET https://dual-ping-worker.game-developer-mb.workers.dev/api/latest
GET https://dual-ping-worker.game-developer-mb.workers.dev/api/config
```

`/api/latest` first returns the latest scheduled snapshot from KV (when configured) or the public GitHub history file; it falls back to a live probe only before the first stored sample. The dashboard uses this low-cost endpoint for automatic refresh. `/api/status` always performs a fresh probe and is used by the manual refresh action. `/health` returns runtime and publisher configuration metadata without performing a full probe. `/api/config` returns the active target catalog.

## Scheduled monitoring

The Cron trigger runs every five minutes. The Worker performs HTTP(S) and DNS-over-HTTPS probes. Raw ICMP sockets are not available in the Worker runtime; ICMP fields are therefore marked unsupported rather than fabricated.

The current target catalog is limited to 44 combined website/DNS entries, and the Worker uses a maximum of five simultaneous probe tasks. This preserves request budget for history reads/writes and retry handling. Keep redirects in manual mode: a `3xx` response proves that the endpoint answered, while following the redirect would consume another outbound request.

## Tail logs

```powershell
npx wrangler tail --config cloudflare/wrangler.toml
```

Useful log messages include `[DPM] Scheduled snapshot stored` and detailed GitHub API persistence errors.

## Smoke tests

```powershell
curl.exe -i https://dual-ping-worker.game-developer-mb.workers.dev/health
curl.exe -sS https://dual-ping-worker.game-developer-mb.workers.dev/api/status
curl.exe -sS https://dual-ping-worker.game-developer-mb.workers.dev/api/config
```

Expected live response fields include `timestamp`, `source`, `version`, `total`, `up`, `degraded`, `down`, `duration_ms`, and `results[]`. Each result includes a real HTTP status/latency or DNS response information.

## Failure interpretation

- `publisherConfigured: false`: `GH_TOKEN` is missing or `GH_REPO` is not configured.
- GitHub HTTP 401: the token is invalid, expired, or revoked.
- GitHub HTTP 403: repository Contents permission, repository access, or API rate limit issue.
- GitHub HTTP 404 while reading a new daily path: expected for the first write of a new day; the Worker creates the file.
- A successful `/api/status` with no new `docs/data/cloudflare/` history: live probing is working but GitHub persistence needs attention.
- HTTP 4xx website result: reachable but restricted/degraded; HTTP 5xx or transport timeout is down.

## Optional KV cache

KV is not required for the dashboard or history. The Worker can persist daily snapshots directly through the GitHub Contents API. To enable a latest-snapshot KV cache later, create a namespace:

```powershell
npx wrangler kv namespace create DPM_MONITOR
```

Add the returned namespace ID to the commented `[[kv_namespaces]]` section in `cloudflare/wrangler.toml`, uncomment the binding, and deploy again.
