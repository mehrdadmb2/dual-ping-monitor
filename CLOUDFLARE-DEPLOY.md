# Cloudflare Worker v3 deployment

This Worker makes real HTTP/HTTPS requests from Cloudflare's edge. Cloudflare Workers do not support raw ICMP echo sockets, so it does not fake ping results or claim ICMP data.

## Deploy with Wrangler

```powershell
cd cloudflare
npx wrangler login
npx wrangler deploy
```

The worker name is `dual-ping-worker`; if your account's workers.dev subdomain is `game-developer-mb`, its URL should be `https://dual-ping-worker.game-developer-mb.workers.dev`.

## Add GitHub persistence secret (optional)

The Worker can write each scheduled Cloudflare snapshot to `data/cloudflare/YYYY-MM-DD.json`. Create a GitHub fine-grained PAT with **Contents: Read and write** for only `mehrdadmb2/dual-ping-monitor`, then set it as a Worker secret (never commit it):

```powershell
npx wrangler secret put GH_TOKEN
```

Paste the token only at the interactive prompt. `GH_REPO` and `GH_BRANCH` are already set in `wrangler.toml`. If the token is not set, the Worker still probes live and serves JSON, but it won't persist snapshots to GitHub.

## Optional KV latest-snapshot cache

```powershell
npx wrangler kv namespace create DPM_MONITOR
```

Copy the returned ID into the commented `[[kv_namespaces]]` binding in `wrangler.toml`, uncomment it, and deploy again. KV caches only the latest snapshot; GitHub JSON files hold daily snapshots.

## Smoke tests

```powershell
curl.exe -i https://dual-ping-worker.game-developer-mb.workers.dev/health
curl.exe -sS https://dual-ping-worker.game-developer-mb.workers.dev/api/status
curl.exe -sS https://dual-ping-worker.game-developer-mb.workers.dev/api/config
```

Expected status JSON fields: `timestamp`, `source`, `version`, `total`, `up`, `down`, `duration_ms`, and `results[]`. Each result includes real `http_status`, `latency`, `availability_basis`, and per-request diagnostics. `4xx` is treated as reachable because an HTTP response proves the server answered; `5xx` or transport/timeout failures are marked down in this schema.

## Security and limits

- Never put `GH_TOKEN` in the repository or browser configuration.
- The optional token is only used server-side by Cloudflare.
- The Worker accepts only HTTP/HTTPS targets and rejects obvious localhost/private-IP/metadata targets.
- Keep `TARGETS_JSON` under 30 entries. Every probe is bounded by `PROBE_TIMEOUT_MS`.
- The cron runs every five minutes. Do not set a very short schedule for a large target list on a free plan.
