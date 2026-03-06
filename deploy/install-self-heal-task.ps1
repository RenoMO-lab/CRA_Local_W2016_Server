param(
  [string]$TaskName = "CRA_Local_SelfHeal",
  [string]$AppPath = "C:\apps\CRA_Local",
  [string]$ServiceName = "CRA_Local",
  [int]$IntervalMinutes = 2
)

$ErrorActionPreference = "Stop"

if ($IntervalMinutes -lt 1) {
  throw "IntervalMinutes must be at least 1."
}

if (-not (Test-Path $AppPath)) {
  throw "AppPath not found: $AppPath"
}

$scriptPath = Join-Path $AppPath "deploy\self-heal.ps1"
if (-not (Test-Path $scriptPath)) {
  throw "self-heal.ps1 not found at $scriptPath"
}

$ps = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -AppPath `"$AppPath`" -ServiceName `"$ServiceName`""

schtasks.exe /Create /F `
  /TN $TaskName `
  /SC MINUTE `
  /MO $IntervalMinutes `
  /RU SYSTEM `
  /RL HIGHEST `
  /TR $ps | Out-Null

Write-Host "Installed/updated scheduled task '$TaskName' to run every $IntervalMinutes minute(s)."
