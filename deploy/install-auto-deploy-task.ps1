param(
  [string]$TaskName = "CRA_Local_AutoDeploy",
  [string]$AppPath = "C:\apps\CRA_Local",
  [int]$IntervalMinutes = 5
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $AppPath "deploy\auto-deploy.ps1"
if (-not (Test-Path $scriptPath)) {
  throw "auto-deploy.ps1 not found at $scriptPath"
}

$ps = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

# Use schtasks for compatibility on Windows Server without relying on newer scheduled-task cmdlets.
schtasks.exe /Create /F `
  /TN $TaskName `
  /SC MINUTE `
  /MO $IntervalMinutes `
  /RU SYSTEM `
  /RL HIGHEST `
  /TR $ps | Out-Null

Write-Host "Installed/updated scheduled task '$TaskName' to run every $IntervalMinutes minute(s)."
