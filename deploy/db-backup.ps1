param(
  [string]$AppPath = "C:\apps\CRA_Local",
  [string]$BackupDir = "C:\db_backups\CRA_Local",
  [int]$RetentionDays = 7,
  [string]$DatabaseUrl,
  [string]$PgHost,
  [int]$PgPort = 5432,
  [string]$PgDatabase,
  [string]$PgUser,
  [string]$PgPassword
)

$ErrorActionPreference = "Stop"

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
try {
  $pgDump = (Get-Command pg_dump -ErrorAction Stop).Source
} catch {
  $pgDump = $null
}

if (-not $pgDump) {
  throw "pg_dump not found in PATH. Install PostgreSQL client tools or add it to PATH."
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

$cutoff = (Get-Date).AddDays(-1 * $RetentionDays)
Get-ChildItem -Path $BackupDir -Filter ("{0}_*.dump" -f $dbNameForFile) -File | Where-Object {
  $_.LastWriteTime -lt $cutoff
} | ForEach-Object {
  Remove-Item -Force $_.FullName
}

