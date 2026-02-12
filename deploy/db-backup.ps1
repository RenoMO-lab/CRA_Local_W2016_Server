param(
  [string]$AppPath = "C:\CRA_Local_W2016_Main",
  [string]$BackupDir = "",
  # Deprecated: kept for backwards compatibility with older task definitions.
  [int]$RetentionDays = 7,
  [string]$DatabaseUrl,
  [string]$PgHost,
  [int]$PgPort = 5432,
  [string]$PgDatabase,
  [string]$PgUser,
  [string]$PgPassword
)

$ErrorActionPreference = "Stop"

if (-not $BackupDir) {
  $leaf = Split-Path $AppPath -Leaf
  if ($leaf -ieq "app") {
    $BackupDir = Join-Path (Split-Path $AppPath -Parent) "backups\postgres"
  } else {
    $BackupDir = Join-Path $AppPath "backups\postgres"
  }
}

function Parse-EnvFile {
  param([string]$Path)
  $vars = @{}
  if (-not (Test-Path $Path)) { return $vars }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith("#")) { return }
    if ($line -match '^(\w+)=(.*)$') {
      $key = $matches[1]
      $value = $matches[2]
      if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
        $value = $value.Substring(1, $value.Length - 2)
      } elseif ($value.StartsWith("'") -and $value.EndsWith("'") -and $value.Length -ge 2) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $vars[$key] = $value
    }
  }
  return $vars
}

$envPath = Join-Path $AppPath ".env"
$envVars = Parse-EnvFile -Path $envPath

if (-not $DatabaseUrl) { $DatabaseUrl = $envVars["DATABASE_URL"] }
if (-not $PgHost) { $PgHost = $envVars["PGHOST"] }
if (-not $PgDatabase) { $PgDatabase = $envVars["PGDATABASE"] }
if (-not $PgUser) { $PgUser = $envVars["PGUSER"] }
if (-not $PgPassword) { $PgPassword = $envVars["PGPASSWORD"] }
if ($envVars["PGPORT"]) { $PgPort = [int]$envVars["PGPORT"] }

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}

$logDir = Join-Path $AppPath "deploy\logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}
$logFile = Join-Path $logDir "db-backup.log"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dbNameForFile = if ($PgDatabase) { $PgDatabase } else { "postgres" }
$backupFile = Join-Path $BackupDir ("{0}_{1}.dump" -f $dbNameForFile, $timestamp)

function Log([string]$Message) {
  Add-Content -Path $logFile -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message) -Encoding ASCII
}

Log "Starting pg_dump backup to $backupFile"

$pgDump = $null
$pgDumpCandidates = @()
if ($envVars["PG_DUMP_PATH"]) { $pgDumpCandidates += $envVars["PG_DUMP_PATH"] }
if ($envVars["PG_BIN_DIR"]) { $pgDumpCandidates += (Join-Path $envVars["PG_BIN_DIR"] "pg_dump.exe") }
$pgDumpCandidates += (Join-Path $AppPath "tools\postgresql\bin\pg_dump.exe")
$pgDumpCandidates += "pg_dump.exe"
$pgDumpCandidates += "pg_dump"

foreach ($candidate in $pgDumpCandidates) {
  if (-not $candidate) { continue }
  try {
    if ($candidate -match "[\\/]") {
      if (Test-Path $candidate) {
        $pgDump = $candidate
        break
      }
    } else {
      $resolved = (Get-Command $candidate -ErrorAction Stop).Source
      if ($resolved) {
        $pgDump = $resolved
        break
      }
    }
  } catch {
    # try next candidate
  }
}

if (-not $pgDump) {
  throw "pg_dump not found. Set PG_DUMP_PATH/PG_BIN_DIR, install PostgreSQL client tools, or add pg_dump to PATH."
}

try {
  if ($PgPassword) { $env:PGPASSWORD = $PgPassword }

  if ($DatabaseUrl) {
    & $pgDump --no-owner --no-acl -Fc --file $backupFile --dbname $DatabaseUrl
  } else {
    if (-not $PgHost -or -not $PgDatabase -or -not $PgUser) {
      throw "Missing Postgres connection settings. Provide DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD."
    }
    & $pgDump --no-owner --no-acl -Fc --file $backupFile -h $PgHost -p $PgPort -U $PgUser $PgDatabase
  }

  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE"
  }
} finally {
  if (Test-Path Env:\PGPASSWORD) { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
}

Log "Backup completed"

# Retention policy:
# - keep latest backup for today
# - keep latest backup for yesterday
# - keep latest backup for day-7 (week-1)
$todayStart = (Get-Date).Date
$tomorrowStart = $todayStart.AddDays(1)
$yesterdayStart = $todayStart.AddDays(-1)
$week1Start = $todayStart.AddDays(-7)
$week1End = $week1Start.AddDays(1)

$files = Get-ChildItem -Path $BackupDir -Filter "*.dump" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending

$keptByBucket = @{}
foreach ($file in $files) {
  $bucket = $null
  if ($file.LastWriteTime -ge $todayStart -and $file.LastWriteTime -lt $tomorrowStart) {
    $bucket = "day"
  } elseif ($file.LastWriteTime -ge $yesterdayStart -and $file.LastWriteTime -lt $todayStart) {
    $bucket = "day-1"
  } elseif ($file.LastWriteTime -ge $week1Start -and $file.LastWriteTime -lt $week1End) {
    $bucket = "week-1"
  }

  if ($bucket -and (-not $keptByBucket.ContainsKey($bucket))) {
    $keptByBucket[$bucket] = $file.FullName
  }
}

$keptPaths = @($keptByBucket.Values)
foreach ($file in $files) {
  if ($keptPaths -notcontains $file.FullName) {
    try {
      Remove-Item -Force $file.FullName
      Log "Removed old backup: $($file.FullName)"
    } catch {
      Log "Failed to remove old backup ($($file.FullName)): $($_.Exception.Message)"
    }
  }
}

$summary = @()
foreach ($bucketName in @("day", "day-1", "week-1")) {
  $value = if ($keptByBucket.ContainsKey($bucketName)) { $keptByBucket[$bucketName] } else { "none" }
  $summary += "$bucketName=$value"
}
Log ("Retention applied (" + ($summary -join ", ") + ").")
