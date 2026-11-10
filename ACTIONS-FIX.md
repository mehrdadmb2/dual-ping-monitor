# GitHub Actions v4 monitoring notes

The v4 GitHub runner performs:

- HTTP(S) probes with bounded timeouts, `HEAD` plus a `GET` fallback for `405/501`, and retries for transient transport/5xx failures.
- Three ICMP samples per website, reporting average latency, jitter, and packet loss as a separate signal.
- DNS-over-HTTPS queries over HTTP/2 with validation of DNS response ID, flags, RCODE, answer count, and resolved IPv4 records.
- Compact v4 snapshot persistence in `data/github/YYYY-MM-DD.json`.
- Daily merge/index generation and publication under `docs/data/`.

## Status semantics

- HTTP `2xx/3xx`: `up`.
- HTTP `4xx`: `degraded` (the service responded, but it may reject, rate-limit, or challenge the probe).
- HTTP `5xx`: `down` (application/server-side failure).
- ICMP failure by itself does not mark a site down if HTTP succeeds.
- DNS success requires a valid DoH response with at least one answer record.

## Troubleshooting

1. Open GitHub → Actions → **Dual Ping Monitor v4**.
2. Inspect the **Validate source files** step first; a catalog/Worker mismatch intentionally stops execution before probes.
3. Inspect the **Run resilient probes** step for each target's HTTP status and ICMP signal.
4. Confirm repository workflow permissions include Contents write.
5. The workflow retries non-fast-forward pushes after rebasing `origin/main`; it never force-pushes.

The GitHub runner and Cloudflare Edge are independent vantage points, so latency and status differences can be real route-specific behavior. Compare both sources before attributing an outage to a provider or region.
