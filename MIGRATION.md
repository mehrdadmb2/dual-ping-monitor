# Migration to Dual Ping Monitor v4

1. Back up the current repository, including `data/` and `docs/data/`.
2. Extract the v4 complete archive and upload its project contents to the repository root, replacing files with matching paths. Keep historical JSON files; v4 can read the legacy snapshot shape.
3. Confirm GitHub Actions workflow permissions include **Contents: Read and write**.
4. Confirm GitHub Pages publishes `main` → `/docs`.
5. Deploy the Worker from the repository root:

   ```powershell
   npx wrangler login
   npx wrangler deploy --config cloudflare/wrangler.toml
   ```

6. Ensure the Cloudflare Worker secret `GH_TOKEN` is configured with Contents read/write access for `mehrdadmb2/dual-ping-monitor`:

   ```powershell
   npx wrangler secret put GH_TOKEN --config cloudflare/wrangler.toml
   ```

7. Run **GitHub → Actions → Dual Ping Monitor v4 → Run workflow** once.
8. Verify `/health`, `/api/status`, the published `data/index.json`, and the dashboard.

See [UPGRADE-GUIDE-FA.md](UPGRADE-GUIDE-FA.md) for the full deployment sequence and troubleshooting table.
