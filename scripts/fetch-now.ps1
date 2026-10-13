# Starts the invitation fetcher on GitHub now (new invitations to bid -> map). GitHub's own schedule is
# delayed or skipped for hours, so this PC's Task Scheduler runs this every 20 minutes during the day
# ("HPD fetch invitations"). Skips if a fetch is already running or one finished in the last 15 minutes.
# Also confirms bid faxes from HumbleFax's emails (scripts/check_bid_faxes.py) while you're bidding.
# Uses the GitHub CLI and Gmail logins already on this PC.
$ErrorActionPreference = "Stop"
$repo = "UNITEDANGEL/HPD-Bid-Dashboard-2026"
$log = Join-Path $env:LOCALAPPDATA "hpd-fetch-now.log"
function Log($m) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm} {1}" -f (Get-Date), $m) }
try {
  $hour = (Get-Date).Hour
  if ($hour -lt 7 -or $hour -ge 22) { exit 0 }
  $runs = gh run list --repo $repo --workflow run-fetcher.yml --limit 1 --json status,createdAt,updatedAt | ConvertFrom-Json
  if ($runs.Count -gt 0) {
    $last = $runs[0]
    $age = (Get-Date).ToUniversalTime() - ([datetime]$last.updatedAt).ToUniversalTime()
    $skip = if ($last.status -ne "completed") { "a fetch is running" } elseif ($age.TotalMinutes -lt 15) { "last fetch {0:N0} min ago" -f $age.TotalMinutes } else { "" }
  }
  if ($skip) { Log "fetch skipped: $skip" } else {
  gh workflow run run-fetcher.yml --repo $repo --ref main -f days_back=14 | Out-Null
  Log "fetch started"
  }
} catch {
  Log ("error: " + $_.Exception.Message)
}
# Bid faxes: confirm from HumbleFax's emails on this PC (only reads Gmail while you're bidding).
$ErrorActionPreference = "Continue"
try {
  Push-Location "D:\dev\HPD-Bid-Dashboard-2026"
  $out = python scripts/check_bid_faxes.py --days 3 2>&1 | Select-String -Pattern "^Bid faxes|^  E[QR]" | ForEach-Object { $_.Line }
  Pop-Location
  if ($out) { Log ("faxes: " + ($out -join " | ")) }
} catch {
  Log ("error: " + $_.Exception.Message)
  exit 1
}
