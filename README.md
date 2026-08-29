# 📡 Dual Ping Monitor

A production-oriented network telemetry dashboard with two probe engines:

- **GitHub Actions:** scheduled archive of real target measurements.
- **Cloudflare Edge Worker:** optional independent edge-side HTTP telemetry.
- **Frontend:** GitHub Pages-ready RTL dashboard with deep glassmorphism, animated radar UI, responsive target matrix, charting, history, CSV export, diagnostics, auto-refresh and offline shell caching.

## Why the previous version could show no useful data

1. `docs/index.html` is served as the GitHub Pages site root, while the frontend requested `../data/...`. That path escapes the repository site root. The correct web path is `data/...`.
2. The previous probe engine used ICMP `ping` for normal web sites. A site can be healthy while ignoring ICMP, producing false `DOWN` results.
3. The previous frontend generated artificial fallback measurements. Monitoring software should never present fake telemetry as real data.
4. The old schedules were split across multiple workflows, creating duplicated and unsynchronised data publication.

## GitHub Actions setup

The canonical workflow is `.github/workflows/ping-github.yml`.

It runs every 10 minutes and can also be launched manually from the Actions tab.

The workflow:

1. Runs `.github/scripts/ping.js`.
2. Uses **HTTP/HTTPS probes** for sites and **ICMP with a resolver fallback** for DNS targets.
3. Publishes daily JSON under `data/github/YYYY-MM-DD.json`.
4. Runs `.github/scripts/merge.js`.
5. Publishes `data/latest.json`, `data/index.json`, and `data/merged/YYYY-MM-DD.json`.

## Cloudflare Edge setup

The optional Worker lives at `cloudflare-worker/src/index.js` and is configured through `wrangler.toml`.

The Worker runs HTTP probes from Cloudflare edge locations when its endpoint is requested. DNS/ICMP targets intentionally stay on the GitHub engine because a Worker is not a raw ICMP/DNS socket host.

To enable automatic deployment, add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Then run **Cloudflare Edge Worker** from GitHub Actions. After deployment, copy the Worker URL into:

`docs/config.js`

```js
cloudflareApiUrl: 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev'
```

## GitHub Pages

Publish the `docs/` directory using GitHub Pages.

The frontend does not fabricate data. When the data endpoint is unavailable, it keeps the last valid state and exposes the failure through the banner and diagnostics panel.

## Data schema v2

Each sample contains:

- `timestamp`
- `source`
- `total`, `up`, `degraded`, `down`
- `measured`, `avg_latency`
- `duration_ms`
- `results[]`

Each target result can include:

- `status`
- `latency`
- `packet_loss`
- `jitter`
- `http_status`
- `protocol`
- `resolved_url`
- `method`
- `error`

## Local smoke test

```bash
node .github/scripts/ping.js
node .github/scripts/merge.js
```

Then serve the repository root with a static server and open `/docs/`.

## Reliability principles

The project intentionally prefers truthful failure states over attractive fake values. The dashboard distinguishes:

- `UP` — target responded successfully.
- `DEGRADED` — target responded, but the response indicates an unhealthy/partial condition or the probe needed a fallback.
- `DOWN` — the probe could not establish a usable service response.
- `UNKNOWN` — no valid observation exists.

## License

MIT
