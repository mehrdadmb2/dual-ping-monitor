# Dual Ping Monitor v2

A resilient, dependency-light network observatory for websites and DNS services. The original project treated an ICMP failure as a complete outage, so GitHub Runner snapshots could report almost everything as `DOWN`. Version 2 changes the measurement model: HTTPS is the primary availability signal for websites, direct DNS resolution is primary for DNS targets, TCP/53 and ICMP are secondary signals, and the dashboard exposes which probe established availability.

## What changed

- **Resilient probing:** HTTPS + ICMP for sites; direct DNS + TCP/53 + ICMP for DNS.
- **No false-down from blocked ICMP:** a reachable HTTPS service remains `UP` even when ICMP is filtered.
- **Parallel checks with bounded concurrency:** faster runs without spawning an unbounded amount of work.
- **Safer ping execution:** no shell interpolation of targets.
- **Versioned dataset:** daily JSON snapshots plus a generated `data/index.json` for date discovery.
- **Single scheduled workflow:** avoids the previous race between ping and merge jobs.
- **Zero frontend framework:** no React/Vue/build step required.
- **No Chart.js / Google Fonts dependency:** the dashboard uses native SVG charts and system fonts.
- **Interactive dashboard:** search, category filters, sorting, detail modal, CSV/JSON export, auto-refresh, keyboard shortcuts, theme switch, Cloudflare endpoint support.
- **Murphy-safe design:** the dashboard stays useful when one data source or one measurement method fails.

## Important migration step

The old repository contains these workflows:

- `.github/workflows/ping-check.yml`
- `.github/workflows/ping-github.yml`
- `.github/workflows/merge-data.yml`

Remove or disable those three old workflows after installing `.github/workflows/monitor.yml`; otherwise multiple schedules will keep writing overlapping data.

## GitHub Pages

Keep the Pages source as `main` / `docs` (the existing project layout). Replace the contents of `docs/`, `.github/scripts/`, `targets.json` and add the new `.github/workflows/monitor.yml`. Historical files in `data/` can remain.

After the workflow runs, the dashboard reads:

- `../data/index.json`
- `../data/merged/YYYY-MM-DD.json`

and automatically falls back over the previous 14 UTC dates when the index is unavailable.

## Optional Cloudflare Edge

The Cloudflare Worker is intentionally optional. It performs independent HTTPS edge probes; arbitrary third-party DNS resolver probing is not falsely simulated because Cloudflare Workers do not expose raw UDP/TCP sockets to port 53. Deploy `cloudflare/worker.js` with `cloudflare/wrangler.toml`, then open the dashboard and use **تنظیم Cloudflare**. The endpoint is stored only in browser local storage; no secret is embedded into the Git repository.

Example:

```bash
cd cloudflare
npx wrangler deploy
```

The Worker returns the same v2 snapshot shape as GitHub Actions so the dashboard can compare two independent observation sources.

## Data model

Each target has a `status`, `latency`, `availability_basis`, and per-method diagnostics. A site can be `up` with `availability_basis=https` while `icmp_status=down`; this is deliberate and reflects real-world networks where ICMP is filtered.

## Operational behavior

The GitHub workflow runs every 10 minutes and can also be started manually. It uses a concurrency lock, Node.js 20, bounded probe concurrency, and a 12-minute job timeout. The job writes `data/github/YYYY-MM-DD.json`, rebuilds the merged file and refreshes the lightweight date index.

## License

The original project license remains applicable.
