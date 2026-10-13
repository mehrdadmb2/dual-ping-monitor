# Migration to v3

1. Download and unzip `dual-ping-monitor-v3-complete.zip`.
2. Upload the **contents of the `dual-ping-monitor-v3/` directory** to the repository root, replacing existing files. Keep GitHub Pages configured for `main` → `/docs`.
3. Disable/delete old overlapping monitoring workflows (`ping-check.yml`, `ping-github.yml`, `merge-data.yml`) if they still exist. Keep only `.github/workflows/monitor.yml` for the GitHub runner.
4. In `cloudflare/`, run `npx wrangler login` then `npx wrangler deploy`.
5. Add the Cloudflare Worker secret with `cd cloudflare; npx wrangler secret put GH_TOKEN`. Use a fine-grained token scoped only to this repository and Contents read/write. Never commit the token.
6. Verify `https://dual-ping-worker.game-developer-mb.workers.dev/health` returns `ok: true`.
7. Verify `/api/status` returns a `results` array and real latency/status values.
8. In GitHub → Actions, run **Dual Ping Monitor** manually. Confirm it commits `data/github/`, `data/cloudflare/`, `data/merged/`, `data/index.json`, and their published copies under `docs/data/`.
9. Open `https://mehrdadmb2.github.io/dual-ping-monitor/` and hard-refresh (`Ctrl+F5`). Cloudflare endpoint is preconfigured in the dashboard.

## If data is still missing
- Check Worker logs: `cd cloudflare; npx wrangler tail`.
- Check GitHub Actions logs for `Dual Ping Monitor`.
- Check Worker secret is named exactly `GH_TOKEN`; check token scope and repository access.
- Check Pages is configured to publish `/docs`. Static data must be mirrored under `docs/data/`; the workflow now does this automatically.
- Do not expect Cloudflare ICMP metrics: Workers support HTTP/HTTPS fetch probes, not raw ICMP sockets.
