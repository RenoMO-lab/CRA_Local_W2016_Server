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

$runnerDir = Join-Path $env:ProgramData "CRA_Local"
New-Item -ItemType Directory -Path $runnerDir -Force | Out-Null

$safeTaskName = ($TaskName -replace '[^A-Za-z0-9_.-]', '_')
if (-not $safeTaskName) {
  $safeTaskName = "CRA_Local_SelfHeal"
}
$runnerPath = Join-Path $runnerDir "$safeTaskName.cmd"

$runnerLines = @(
  "@echo off",
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -AppPath `"$AppPath`" -ServiceName `"$ServiceName`""
)
Set-Content -Path $runnerPath -Value $runnerLines -Encoding ASCII -Force

$taskRunCommand = "cmd.exe /c `"$runnerPath`""
& schtasks.exe /Create /F `
  /TN $TaskName `
  /SC MINUTE `
  /MO $IntervalMinutes `
  /RU SYSTEM `
  /RL HIGHEST `
  /TR $taskRunCommand | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create scheduled task '$TaskName' (exit code $LASTEXITCODE)."
}

& schtasks.exe /Query /TN $TaskName | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Scheduled task '$TaskName' was not found after creation."
}

Write-Host "Installed/updated scheduled task '$TaskName' to run every $IntervalMinutes minute(s). Runner: $runnerPath"
