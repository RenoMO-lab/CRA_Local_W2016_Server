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

function Resolve-Executable {
  param([string[]]$Candidates)
  foreach ($candidate in $Candidates) {
    if (-not $candidate) { continue }
    try {
      if ($candidate -match "[\\/]") {
        if (Test-Path $candidate) { return $candidate }
      } else {
        $resolved = (Get-Command $candidate -ErrorAction Stop).Source
        if ($resolved) { return $resolved }
      }
    } catch {
      # Try next candidate.
    }
  }
  return $null
}

function Get-BackupPrefixFromName {
  param([string]$Name)
  $n = String($Name)
  if ($n -match '^(?<p>[A-Za-z0-9._-]+)\.dump$') { return $matches['p'] }
  if ($n -match '^(?<p>[A-Za-z0-9._-]+)_globals\.sql$') { return $matches['p'] }
  if ($n -match '^(?<p>[A-Za-z0-9._-]+)_manifest\.json$') { return $matches['p'] }
  return $null
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

function Log([string]$Message) {
  Add-Content -Path $logFile -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message) -Encoding ASCII
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dbNameForFile = if ($PgDatabase) { $PgDatabase } else { "postgres" }
$backupPrefix = "{0}_{1}" -f $dbNameForFile, $timestamp
$backupFile = Join-Path $BackupDir ("{0}.dump" -f $backupPrefix)
$globalsFile = Join-Path $BackupDir ("{0}_globals.sql" -f $backupPrefix)
$manifestFile = Join-Path $BackupDir ("{0}_manifest.json" -f $backupPrefix)

$appRoot = $AppPath
if ((Split-Path $AppPath -Leaf) -ieq "app") {
  $appRoot = Split-Path $AppPath -Parent
}

$pgDumpCandidates = @()
if ($envVars["PG_DUMP_PATH"]) { $pgDumpCandidates += $envVars["PG_DUMP_PATH"] }
if ($envVars["PG_BIN_DIR"]) { $pgDumpCandidates += (Join-Path $envVars["PG_BIN_DIR"] "pg_dump.exe") }
$pgDumpCandidates += (Join-Path $AppPath "tools\postgresql\bin\pg_dump.exe")
$pgDumpCandidates += (Join-Path $appRoot "tools\postgresql\bin\pg_dump.exe")
$pgDumpCandidates += "pg_dump.exe"
$pgDumpCandidates += "pg_dump"

$pgDumpAllCandidates = @()
if ($envVars["PG_DUMPALL_PATH"]) { $pgDumpAllCandidates += $envVars["PG_DUMPALL_PATH"] }
if ($envVars["PG_BIN_DIR"]) { $pgDumpAllCandidates += (Join-Path $envVars["PG_BIN_DIR"] "pg_dumpall.exe") }
$pgDumpAllCandidates += (Join-Path $AppPath "tools\postgresql\bin\pg_dumpall.exe")
$pgDumpAllCandidates += (Join-Path $appRoot "tools\postgresql\bin\pg_dumpall.exe")
$pgDumpAllCandidates += "pg_dumpall.exe"
$pgDumpAllCandidates += "pg_dumpall"

$pgDump = Resolve-Executable -Candidates $pgDumpCandidates
if (-not $pgDump) {
  throw "pg_dump not found. Set PG_DUMP_PATH/PG_BIN_DIR, install PostgreSQL client tools, or add pg_dump to PATH."
}

$pgDumpAll = Resolve-Executable -Candidates $pgDumpAllCandidates
if (-not $pgDumpAll) {
  throw "pg_dumpall not found. Set PG_DUMPALL_PATH/PG_BIN_DIR, install PostgreSQL client tools, or add pg_dumpall to PATH."
}

Log "Starting database backup set: prefix=$backupPrefix"

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

  $globalsOutput = & $pgDumpAll --globals-only -h $PgHost -p $PgPort -U $PgUser 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dumpall --globals-only failed with exit code $LASTEXITCODE"
  }
  [System.IO.File]::WriteAllLines($globalsFile, [string[]]$globalsOutput)

  $dumpVersion = (& $pgDump --version 2>&1 | Select-Object -First 1)
  $dumpAllVersion = (& $pgDumpAll --version 2>&1 | Select-Object -First 1)
  $dumpInfo = Get-Item $backupFile
  $globalsInfo = Get-Item $globalsFile

  $manifest = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    database = $dbNameForFile
    host = $PgHost
    port = $PgPort
    files = [ordered]@{
      dump = [ordered]@{
        fileName = $dumpInfo.Name
        sizeBytes = $dumpInfo.Length
      }
      globals = [ordered]@{
        fileName = $globalsInfo.Name
        sizeBytes = $globalsInfo.Length
      }
    }
    tools = [ordered]@{
      pg_dump = [string]$dumpVersion
      pg_dumpall = [string]$dumpAllVersion
    }
  }
  $manifest | ConvertTo-Json -Depth 6 | Out-File -FilePath $manifestFile -Encoding ASCII

  Log "Backup created: $($dumpInfo.Name), $($globalsInfo.Name), $(Split-Path $manifestFile -Leaf)"
} finally {
  if (Test-Path Env:\PGPASSWORD) { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
}

# Retention policy:
# - keep latest backup set for today
# - keep latest backup set for yesterday
# - keep latest backup set for day-7 (week-1)
$todayStart = (Get-Date).Date
$tomorrowStart = $todayStart.AddDays(1)
$yesterdayStart = $todayStart.AddDays(-1)
$week1Start = $todayStart.AddDays(-7)
$week1End = $week1Start.AddDays(1)

$dumpFiles = Get-ChildItem -Path $BackupDir -Filter "*.dump" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending

$keptByBucket = @{}
$keptPrefixes = New-Object System.Collections.Generic.HashSet[string]
foreach ($file in $dumpFiles) {
  $bucket = $null
  if ($file.LastWriteTime -ge $todayStart -and $file.LastWriteTime -lt $tomorrowStart) {
    $bucket = "day"
  } elseif ($file.LastWriteTime -ge $yesterdayStart -and $file.LastWriteTime -lt $todayStart) {
    $bucket = "day-1"
  } elseif ($file.LastWriteTime -ge $week1Start -and $file.LastWriteTime -lt $week1End) {
    $bucket = "week-1"
  }

  if ($bucket -and (-not $keptByBucket.ContainsKey($bucket))) {
    $prefix = Get-BackupPrefixFromName -Name $file.Name
    if ($prefix) {
      $keptByBucket[$bucket] = $file.FullName
      [void]$keptPrefixes.Add($prefix)
    }
  }
}

$allArtifacts = Get-ChildItem -Path $BackupDir -File -ErrorAction SilentlyContinue
foreach ($file in $allArtifacts) {
  $prefix = Get-BackupPrefixFromName -Name $file.Name
  if (-not $prefix) { continue }
  if ($keptPrefixes.Contains($prefix)) { continue }
  try {
    Remove-Item -Force $file.FullName
    Log "Removed old backup artifact: $($file.FullName)"
  } catch {
    Log "Failed to remove old backup artifact ($($file.FullName)): $($_.Exception.Message)"
  }
}

$summary = @()
foreach ($bucketName in @("day", "day-1", "week-1")) {
  $value = if ($keptByBucket.ContainsKey($bucketName)) { $keptByBucket[$bucketName] } else { "none" }
  $summary += "$bucketName=$value"
}
Log ("Retention applied (" + ($summary -join ", ") + ").")
