# Keeps the invitations coming through the day: every 20 minutes runs scripts/fetch-now.ps1 (starts the
# fetcher on GitHub, confirms bid faxes). Runs hidden in your Windows session; started from the Startup
# folder ("HPD invitations.cmd") so it comes back after a restart. Windows' Task Scheduler can't run tasks
# on this PC, and GitHub's own schedule is delayed for hours, so this is the dependable timer.
# Only one copy runs at a time.
$ErrorActionPreference = "Continue"
$me = "HPD-fetch-loop"
$mutex = New-Object System.Threading.Mutex($false, "Global\$me")
if (-not $mutex.WaitOne(0)) { exit 0 }
$script = "D:\dev\HPD-Bid-Dashboard-2026\scripts\fetch-now.ps1"
while ($true) {
  if (Test-Path $script) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script *>> (Join-Path $env:LOCALAPPDATA "hpd\task-output.log")
  }
  Start-Sleep -Seconds 1200
}
