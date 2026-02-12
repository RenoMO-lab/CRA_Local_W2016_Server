param(
  [string]$TaskName = "CRA_Local_DailyDbBackup",
  [string]$AppPath = "C:\CRA_Local_W2016_Main",
  [string]$BackupDir = "",
  # Deprecated: retained for backwards compatibility with existing commands.
  [int]$RetentionDays = 14,
  [string]$StartTime = "01:00"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $AppPath)) {
  throw "AppPath not found: $AppPath"
}

$scriptPath = Join-Path $AppPath "deploy\db-backup.ps1"
if (-not (Test-Path $scriptPath)) {
  throw "db-backup.ps1 not found at $scriptPath"
}

if (-not $BackupDir) {
  $BackupDir = Join-Path $AppPath "db-backups"
}

if ($StartTime -notmatch '^([01][0-9]|2[0-3]):[0-5][0-9]$') {
  throw "StartTime must be in 24-hour HH:mm format (example: 01:00)"
}

$ps = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -AppPath `"$AppPath`" -BackupDir `"$BackupDir`""

# Use schtasks for compatibility with Windows Server 2016.
schtasks.exe /Create /F `
  /TN $TaskName `
  /SC DAILY `
  /ST $StartTime `
  /RU SYSTEM `
  /RL HIGHEST `
  /TR $ps | Out-Null

Write-Host "Installed/updated scheduled task '$TaskName' (daily at $StartTime)."
Write-Host "Backup directory: $BackupDir"
Write-Host "Retention policy: keep latest day, day-1, and week-1 backups."
