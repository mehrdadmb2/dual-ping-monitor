# Dual Ping Monitor 4.0

A production-style static network command center for **GitHub-origin** and **Cloudflare-edge** telemetry.

## Architecture

```text
                           GitHub Pages
                    docs/ interactive dashboard
                              │
                         reads JSON
                              ▼
                       data/latest.json
                       data/index.json
                     ┌────────┴────────┐
                     │                 │
              data/github/*     data/cloudflare/*
                     ▲                 ▲
                     │                 │
            GitHub Actions      Cloudflare Worker
            origin-side probe   edge-side probe
            + GitHub token      + Cloudflare-held
              (built in)          GITHUB_TOKEN
```

### Important token rule

This repository deliberately contains **no Cloudflare token** and **no Cloudflare deployment workflow**.

GitHub Actions only writes:

- `data/github/YYYY-MM-DD.json`
- `data/github/latest.json`
- `data/latest.json`
- `data/index.json`
- `data/merged/YYYY-MM-DD.json`

GitHub Actions never stages `data/cloudflare/*`.

The Cloudflare Worker is responsible for:

- probing websites from the Cloudflare edge,
- writing `data/cloudflare/YYYY-MM-DD.json`,
- writing `data/cloudflare/latest.json`.

Put the GitHub token in Cloudflare as a Worker secret:

```text
GITHUB_TOKEN
```

Normal Worker variables:

```text
GITHUB_OWNER=mehrdadmb2
GITHUB_REPO=dual-ping-monitor
GITHUB_BRANCH=main
REQUEST_TIMEOUT_MS=8000
```

For a manually callable `POST /run`, optionally add:

```text
RUN_KEY
```

Without `RUN_KEY`, `/run` is intentionally disabled.

## What changed in 4.0

### Data reliability

- Relative `./data/...` frontend paths work on GitHub Pages project sites.
- No synthetic/fake telemetry.
- Website targets use HTTP/HTTPS probing, not ICMP.
- `HEAD` is attempted first, with `GET + Range` fallback for `405/501`.
- Redirects, HTTP status, final URL, protocol, method, latency, timeout and retry information are captured.
- DNS targets keep ICMP measurement with a resolver-health fallback.
- Atomic JSON writes reduce corruption risk.
- Bounded daily history prevents unlimited file growth.
- Schema is versioned (`schema_version: 4`).

### Cloudflare separation

- No `deploy-cloudflare.yml`.
- No Cloudflare secret in GitHub.
- The Worker owns the `data/cloudflare/*` publishing responsibility.
- The GitHub workflow never adds or deletes Cloudflare files.
- The Worker `request.cf` bug from the earlier version is fixed by passing the request explicitly into probe functions.
- Public `GET /` is preview-only and does not publish.
- `POST /run` can be locked with `RUN_KEY`.

### Dashboard

- English is the default language.
- Persian toggle is retained.
- Large typography was reduced to a dense monitoring-console scale.
- Ambient animated gradient orbs move behind the glass layers.
- Cursor-following illumination changes glass highlights and shadows.
- Pointer-reactive 3D tilt on panels and target cards.
- Magnetic primary/ghost buttons.
- Animated signal radar with status nodes.
- Target search and category/status filtering.
- Grid/table switch.
- Incident radar.
- Dual-plane comparison.
- SLA/availability ring.
- Historical run browser.
- Interactive canvas latency timeline.
- Target inspector modal.
- Cached/offline snapshot behavior.
- Service worker shell caching.
- Fully responsive desktop/tablet/mobile layout.

## Files

```text
.github/
  scripts/
    ping.js
    merge.js
  workflows/
    ping-github.yml

cloudflare-worker/
  src/
    index.js

docs/
  index.html
  style.css
  script.js
  config.js
  manifest.webmanifest
  sw.js

targets.json
wrangler.toml
README.md
APPLY_UPGRADE.ps1
```

## Deploy GitHub Pages

Publish the `docs/` directory from your repository settings.

The UI loads:

```text
./data/latest.json
./data/index.json
./data/github/latest.json
./data/cloudflare/latest.json
```

No absolute `/dual-ping-monitor/...` path is hardcoded, so the dashboard also works on a custom domain.

## Deploy Cloudflare Worker yourself

Use the Worker code in:

```text
cloudflare-worker/src/index.js
```

or copy the file into the Cloudflare Workers editor.

### Secrets

```bash
wrangler secret put GITHUB_TOKEN
wrangler secret put RUN_KEY
```

`RUN_KEY` is optional.

### Worker endpoints

```text
GET  /
GET  /health
POST /run
```

- `GET /` probes but does **not** publish.
- `GET /health` is safe for the public dashboard.
- `POST /run` publishes and is protected when `RUN_KEY` exists.
- Cron runs every 10 minutes.

## GitHub workflow

The only GitHub telemetry workflow is:

```text
.github/workflows/ping-github.yml
```

It runs every 10 minutes and commits only GitHub-owned/public index files.

## Existing repositories: applying the upgrade

### PowerShell

```powershell
.\APPLY_UPGRADE.ps1 -RepoRoot "C:\Path\To\dual-ping-monitor"
```

The script also removes obsolete workflows from an older installation:

```text
.github/workflows/ping-check.yml
.github/workflows/merge-data.yml
.github/workflows/deploy-cloudflare.yml
```

Then:

```bash
git add -A
git commit -m "feat: rebuild dual ping monitor 4.0"
git push
```

## Target format

```json
{
  "sites": [
    {
      "id": "github",
      "name": "GitHub",
      "url": "github.com",
      "category": "Global",
      "enabled": true
    }
  ],
  "dns": [
    {
      "id": "cloudflare-dns",
      "name": "Cloudflare DNS",
      "ip": "1.1.1.1",
      "category": "DNS",
      "enabled": true
    }
  ]
}
```

## Local syntax checks

```bash
node --check .github/scripts/ping.js
node --check .github/scripts/merge.js
node --check docs/script.js
node --check cloudflare-worker/src/index.js
```

## Security

Never commit:

- `GITHUB_TOKEN`
- `RUN_KEY`
- Cloudflare account credentials
- Wrangler auth files

The dashboard configuration contains only public URLs.

## License

MIT
