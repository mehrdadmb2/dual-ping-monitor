# GitHub Actions reliability update (v3.1)

## What changed

- ICMP uses asynchronous `spawn()` instead of blocking `spawnSync()`. This lets HTTP requests and their timers complete while pings run.
- Probe errors include nested causes (for example `EAI_AGAIN`, connection reset, permission denied or timeout), instead of only printing `via none`.
- DNS server checks use DNS-over-HTTPS (DoH) over HTTP/2 on HTTPS endpoints defined in `targets.json`. That removes dependence on runner access to raw ICMP and outbound UDP/TCP port 53. This measures DNS resolution over the provider's encrypted DNS endpoint, rather than ICMP reachability of its DNS IP.
- The workflow fetches/rebases `origin/main` and retries the push up to four times, because Cloudflare Cron can commit another snapshot while the GitHub Action is running. The workflow does not force-push.

## Update the repository

Replace these three files in the `main` branch:

- `.github/scripts/ping.js`
- `.github/workflows/monitor.yml`
- `targets.json`

Keep the rest of the project intact. Commit and push these files, then manually run **Actions → Dual Ping Monitor → Run workflow**.

## What success looks like

The `Run resilient probes` step should finish substantially faster than the previous ~129 seconds, because it no longer blocks Node's event loop. Website failures include diagnostic reasons. DNS rows show `via dns/DoH/HTTP2` when the provider answers the DNS query. The final commit step should report `Monitoring snapshot pushed successfully.`

## Interpretation

The GitHub-hosted runner and Cloudflare Worker are independent observation points. Differences in their network routes and provider responses are legitimate. A single timeout is not enough to infer a broad outage; use the logged cause and compare with the other monitoring source.
