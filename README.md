# Dual Ping Monitor v4

A bilingual-ready, Persian-first network observatory for monitoring Iranian and international websites, personal projects, and DNS-over-HTTPS resolvers from two independent vantage points:

- **GitHub Actions** — HTTP(S), ICMP sampling, and DNS-over-HTTPS over HTTP/2.
- **Cloudflare Workers** — edge HTTP(S) and DNS-over-HTTPS probes, with optional GitHub-backed history.

The project is designed to distinguish *service reachability* from *application health*. A server returning an HTTP error is not the same as a server that cannot be reached.

## v4 highlights

### Monitoring engine

- 38 website endpoints and 6 DNS resolvers in a versioned `targets.json` catalog.
- Iranian services, global infrastructure/services, personal GitHub Pages projects, and regional/global DNS providers.
- HTTP status semantics: `2xx/3xx = up`, `4xx = degraded/reachable`, `5xx = down/application failure`.
- HTTP `HEAD` with a `GET` fallback for `405/501`, bounded retries for transient failures, request timeouts, redirect-aware behavior, and structured error details.
- GitHub runner ICMP measurements with three samples, average latency, jitter, and packet-loss percentage. ICMP failure alone never marks a website down when HTTP still succeeds.
- Actual DNS-over-HTTPS queries with response-ID, response-flag, truncation, RCODE, and answer validation. DNS latency is measured independently of ICMP.
- Cloudflare probes intentionally do not claim ICMP support: Workers use `fetch()` and cannot open raw ICMP echo sockets.
- A composite network-health score, 24-hour sample-based availability, dual-vantage comparison, and incident summaries.

### Dashboard

- Responsive RTL dashboard with a dedicated animated boot screen.
- Five visual themes: Aurora, Obsidian, Arctic, Amethyst, and Ember.
- Layered glass surfaces, subtle animated ambient lighting, gradients, deep shadows, and reduced-motion support.
- Search, category filters, group filters, sorting, and per-target diagnostics.
- Low-cost scheduled Cloudflare snapshot refresh plus an on-demand full edge probe alongside GitHub Actions history.
- 1-hour, 6-hour, 24-hour, and 7-day latency chart windows.
- JSON and CSV export, keyboard shortcuts, PWA manifest, and offline shell caching.

### Data and reliability

- Compact v4 snapshots reduce the size of daily JSON history files.
- Separate write ownership: GitHub Actions owns `data/github`, `data/merged`, and the index; Cloudflare owns `docs/data/cloudflare`. This avoids both writers updating the same daily file.
- The dashboard reads GitHub Pages data from `docs/data/`. Automatic refresh uses `/api/latest` (KV or the last public GitHub history snapshot) to avoid launching 44 probes for every browser poll; manual refresh uses `/api/status` for an immediate full edge probe.
- Worker history writes use GitHub Contents API SHA checks, a bounded retry, and a raw-file fallback when the Contents API omits large file content.
- GitHub Actions rebases before pushing and never force-pushes.
- Built-in validation checks target IDs, HTTPS URLs, target budgets, required files, and equality between `targets.json` and the Worker’s bundled target catalog.

## Repository layout

```text
.github/
  scripts/
    ping.js           # GitHub Actions probe engine
    merge.js          # Daily history merge and index generation
    validate.js       # Target and release validation
  workflows/
    monitor.yml       # Scheduled / manual GitHub monitoring workflow
cloudflare/
  worker.js           # Cloudflare edge API and scheduled persistence
  wrangler.toml       # Worker name, variables, compatibility date and cron
data/
  github/             # GitHub runner history
  merged/             # Daily two-source history
  index.json          # Available history dates
 docs/
  index.html          # Dashboard shell
  style.css           # Theme system and responsive glass UI
  script.js           # Dashboard data, chart, filters and diagnostics
  config.js           # Public frontend configuration
  targets.json        # Published catalog for GitHub Pages
 data/
    github/           # Published GitHub history
    cloudflare/       # Cloudflare Worker-owned history
    merged/           # Published merged history
    index.json        # Published history index
 targets.json         # Canonical target catalog
```

## Deployment

See **[UPGRADE-GUIDE-FA.md](UPGRADE-GUIDE-FA.md)** for the complete replacement and deployment sequence, including the Cloudflare secret and GitHub Pages settings.

Quick deployment commands, from the repository root:

```powershell
npx wrangler login
npx wrangler secret put GH_TOKEN --config cloudflare/wrangler.toml
npx wrangler deploy --config cloudflare/wrangler.toml
```

If `GH_TOKEN` is already configured on the Worker, a redeploy does not require setting it again. The token is a Cloudflare Worker secret, not a file in this repository.

## Public endpoints

- Dashboard: `https://mehrdadmb2.github.io/dual-ping-monitor/`
- Worker health: `https://dual-ping-worker.game-developer-mb.workers.dev/health`
- Live probe API: `https://dual-ping-worker.game-developer-mb.workers.dev/api/status`
- Target configuration: `https://dual-ping-worker.game-developer-mb.workers.dev/api/config`
- JSON API: `https://dual-ping-worker.game-developer-mb.workers.dev/`

## Status interpretation

| State | Meaning |
|---|---|
| `up` | HTTP `2xx/3xx`, or a valid DNS answer. |
| `degraded` | HTTP `4xx` (the endpoint answered but may deny, rate-limit, or challenge the request), or ICMP can reach a host while HTTP fails. |
| `down` | HTTP `5xx`, DNS failure, timeout, TLS/transport failure, or no successful signal. |
| `unknown` | No usable sample is available yet. |

A `403`, `404`, or `429` is therefore not blindly reported as a full outage. It is recorded as a reachable but restricted response. A `5xx` is treated as an application-side failure even when the web server itself responded.

## Security notes

- Do not commit `GH_TOKEN`, `PROBE_TOKEN`, API keys, or any other secrets.
- The Cloudflare Worker only probes configured HTTP(S) targets and rejects obvious localhost/private/metadata destinations in override configuration.
- `GH_TOKEN` should be a fine-grained token restricted to this repository with **Contents: Read and write** access.
- `POST /api/probe` is disabled unless `PROBE_TOKEN` is configured. Public live monitoring uses `GET /api/status`.
- Keep the target catalog within the validator's 44-target budget. Increase it only after reviewing the Worker plan's current subrequest and connection limits.

## Operational notes

- GitHub Actions runs every 10 minutes; Cloudflare Cron runs every 5 minutes.
- Cloudflare's edge probe is HTTP(S) + DNS-over-HTTPS only. It intentionally does not fabricate ICMP values.
- If the Worker cannot write history because its GitHub secret is missing or invalid, `/api/status` can still serve live measurements; only persistence is affected.
- GitHub Pages must publish the `main` branch's `/docs` directory.
- Old JSON history is kept in place and can be read by the dashboard's legacy normalizer. New writes use compact v4 rows.
