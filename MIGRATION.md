# Migration checklist

1. Replace `.github/scripts/ping.js` with the v2 file.
2. Replace `.github/scripts/merge.js` with the v2 file.
3. Add `.github/workflows/monitor.yml`.
4. Delete or disable the old `ping-check.yml`, `ping-github.yml`, and `merge-data.yml` workflows.
5. Replace `targets.json`.
6. Replace everything under `docs/` with the new dashboard.
7. Optionally deploy `cloudflare/worker.js` and set its URL from the dashboard.
8. Run the new workflow once from **Actions → Dual Ping Monitor → Run workflow**.
9. Verify that a new `data/index.json` and today's `data/merged/YYYY-MM-DD.json` are committed.
10. Open GitHub Pages and hard-refresh once (`Ctrl+F5`) so the browser does not reuse an older JS/CSS cache.

## Expected behavior

The previous data can legitimately show 100% packet loss because ICMP was the only availability test. The new snapshots may show `UP` with a non-zero or unavailable ICMP signal. That is not a contradiction; it is the point of the new probe model.
