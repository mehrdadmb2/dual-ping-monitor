param(
  [Parameter(Mandatory=$true)]
  [string]$RepoRoot
)

$source = Split-Path -Parent $MyInvocation.MyCommand.Path

$copy = @(
  ".github/scripts/ping.js",
  ".github/scripts/merge.js",
  ".github/workflows/ping-github.yml",
  "cloudflare-worker/src/index.js",
  "wrangler.toml",
  "docs/index.html",
  "docs/style.css",
  "docs/script.js",
  "docs/config.js",
  "docs/manifest.webmanifest",
  "docs/sw.js",
  "targets.json",
  "README.md"
)

foreach ($rel in $copy) {
  $src = Join-Path $source $rel
  $dst = Join-Path $RepoRoot $rel
  New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
  Copy-Item $src $dst -Force
}

$old = @(
  ".github/workflows/ping-check.yml",
  ".github/workflows/merge-data.yml",
  ".github/workflows/deploy-cloudflare.yml"
)

foreach ($rel in $old) {
  $p = Join-Path $RepoRoot $rel
  if (Test-Path $p) {
    Remove-Item $p -Force
    Write-Host "Removed obsolete workflow: $rel" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Dual Ping Monitor 4.0 applied successfully." -ForegroundColor Green
Write-Host "Cloudflare deployment remains fully outside GitHub Actions." -ForegroundColor Cyan
