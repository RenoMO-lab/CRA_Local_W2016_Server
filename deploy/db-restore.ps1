[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$AppPath = "C:\CRA_Local_W2016_Main\app",
  [string]$BackupDir = "",
  [string]$BackupPrefix = "",
  [string]$DumpFile = "",
  [string]$ServiceName = "CRA_Local_App",
  [switch]$SkipGlobals,
  [switch]$Force,
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

function Assert-SafeIdentifier {
  param([string]$Value, [string]$Label)
  if ($Value -notmatch '^[A-Za-z0-9_]+$') {
    throw "$Label contains unsupported characters: $Value"
  }
}

if (-not $BackupDir) {
  $leaf = Split-Path $AppPath -Leaf
  if ($leaf -ieq "app") {
    $BackupDir = Join-Path (Split-Path $AppPath -Parent) "backups\postgres"
  } else {
    $BackupDir = Join-Path $AppPath "backups\postgres"
  }
}

$appRoot = $AppPath
if ((Split-Path $AppPath -Leaf) -ieq "app") {
  $appRoot = Split-Path $AppPath -Parent
}

$envPath = Join-Path $AppPath ".env"
$envVars = Parse-EnvFile -Path $envPath

if (-not $DatabaseUrl) { $DatabaseUrl = $envVars["DATABASE_URL"] }
if (-not $PgHost) { $PgHost = $envVars["PGHOST"] }
if (-not $PgDatabase) { $PgDatabase = $envVars["PGDATABASE"] }
if (-not $PgUser) { $PgUser = $envVars["PGUSER"] }
if (-not $PgPassword) { $PgPassword = $envVars["PGPASSWORD"] }
if ($envVars["PGPORT"]) { $PgPort = [int]$envVars["PGPORT"] }

if (-not $PgHost) { $PgHost = "localhost" }
if (-not $PgPort) { $PgPort = 5432 }
if (-not $PgDatabase) { throw "Missing PGDATABASE/DATABASE_URL target database." }
if (-not $PgUser) { throw "Missing PGUSER/DATABASE_URL user." }

Assert-SafeIdentifier -Value $PgDatabase -Label "PGDATABASE"

if (-not (Test-Path $BackupDir)) {
  throw "BackupDir not found: $BackupDir"
}

$selectedDump = ""
if ($DumpFile) {
  $selectedDump = $DumpFile
} elseif ($BackupPrefix) {
  $selectedDump = Join-Path $BackupDir ("{0}.dump" -f $BackupPrefix)
} else {
  $latest = Get-ChildItem -Path $BackupDir -Filter "*.dump" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($latest) { $selectedDump = $latest.FullName }
}

if (-not $selectedDump -or -not (Test-Path $selectedDump)) {
  throw "Backup dump not found. Provide -DumpFile or -BackupPrefix."
}

$dumpName = Split-Path $selectedDump -Leaf
$prefix = $dumpName -replace '\.dump$', ''
$globalsFile = Join-Path $BackupDir ("{0}_globals.sql" -f $prefix)

$logDir = Join-Path $AppPath "deploy\logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}
$logFile = Join-Path $logDir "db-restore.log"

function Log([string]$Message) {
  Add-Content -Path $logFile -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message) -Encoding ASCII
}

$pgRestoreCandidates = @()
if ($envVars["PG_RESTORE_PATH"]) { $pgRestoreCandidates += $envVars["PG_RESTORE_PATH"] }
if ($envVars["PG_BIN_DIR"]) { $pgRestoreCandidates += (Join-Path $envVars["PG_BIN_DIR"] "pg_restore.exe") }
$pgRestoreCandidates += (Join-Path $AppPath "tools\postgresql\bin\pg_restore.exe")
$pgRestoreCandidates += (Join-Path $appRoot "tools\postgresql\bin\pg_restore.exe")
$pgRestoreCandidates += "pg_restore.exe"
$pgRestoreCandidates += "pg_restore"

$psqlCandidates = @()
if ($envVars["PSQL_PATH"]) { $psqlCandidates += $envVars["PSQL_PATH"] }
if ($envVars["PG_BIN_DIR"]) { $psqlCandidates += (Join-Path $envVars["PG_BIN_DIR"] "psql.exe") }
$psqlCandidates += (Join-Path $AppPath "tools\postgresql\bin\psql.exe")
$psqlCandidates += (Join-Path $appRoot "tools\postgresql\bin\psql.exe")
$psqlCandidates += "psql.exe"
$psqlCandidates += "psql"
$npmCandidates = @(
  (Join-Path $appRoot "tools\node\npm.cmd"),
  (Join-Path $AppPath "tools\node\npm.cmd"),
  "npm.cmd"
)

$pgRestore = Resolve-Executable -Candidates $pgRestoreCandidates
if (-not $pgRestore) { throw "pg_restore not found." }

$psql = Resolve-Executable -Candidates $psqlCandidates
if (-not $psql) { throw "psql not found." }

$npm = Resolve-Executable -Candidates $npmCandidates
if (-not $npm) { throw "npm.cmd not found." }

if (-not $Force) {
  $prompt = "Restore database '$PgDatabase' from '$dumpName'. Continue?"
  if (-not $PSCmdlet.ShouldContinue($prompt, "Database restore")) {
    Write-Host "Restore cancelled."
    return
  }
}

Log "Starting restore from dump: $selectedDump"

$nssm = Join-Path $appRoot "tools\nssm.exe"
$serviceExists = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

function Stop-AppService {
  if (-not $serviceExists) { return }
  try {
    if (Test-Path $nssm) {
      & $nssm stop $ServiceName | Out-Null
    } else {
      Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Log "Stopped service '$ServiceName'."
  } catch {
    Log "Failed to stop service '$ServiceName': $($_.Exception.Message)"
  }
}

function Start-AppService {
  if (-not $serviceExists) { return }
  try {
    if (Test-Path $nssm) {
      & $nssm start $ServiceName | Out-Null
    } else {
      Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Log "Started service '$ServiceName'."
  } catch {
    Log "Failed to start service '$ServiceName': $($_.Exception.Message)"
  }
}

Stop-AppService

try {
  if ($PgPassword) { $env:PGPASSWORD = $PgPassword }

  if ((-not $SkipGlobals) -and (Test-Path $globalsFile)) {
    Log "Restoring globals from $globalsFile"
    & $psql -v ON_ERROR_STOP=1 -h $PgHost -p $PgPort -U $PgUser -d postgres -f $globalsFile
    if ($LASTEXITCODE -ne 0) {
      throw "Globals restore failed with exit code $LASTEXITCODE"
    }
  } elseif (-not $SkipGlobals) {
    Log "Globals file not found for prefix '$prefix'. Continuing without globals restore."
  }

  $dbExists = (& $psql -tA -h $PgHost -p $PgPort -U $PgUser -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$PgDatabase';" 2>$null | Select-Object -First 1)
  if (String($dbExists).Trim() -ne "1") {
    Log "Database '$PgDatabase' does not exist. Creating it."
    & $psql -v ON_ERROR_STOP=1 -h $PgHost -p $PgPort -U $PgUser -d postgres -c "CREATE DATABASE $PgDatabase;"
    if ($LASTEXITCODE -ne 0) {
      throw "CREATE DATABASE failed with exit code $LASTEXITCODE"
    }
  }

  Log "Restoring dump into '$PgDatabase'."
  & $pgRestore --clean --if-exists --no-owner --no-privileges -h $PgHost -p $PgPort -U $PgUser -d $PgDatabase $selectedDump
  if ($LASTEXITCODE -ne 0) {
    throw "pg_restore failed with exit code $LASTEXITCODE"
  }

  Log "Running app migrations."
  Push-Location $AppPath
  try {
    & $npm run migrate
    if ($LASTEXITCODE -ne 0) {
      throw "npm run migrate failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  Start-AppService

  $port = if ($envVars["PORT"]) { [int]$envVars["PORT"] } else { 3000 }
  try {
    $probe = Invoke-WebRequest "http://127.0.0.1:$port/api/admin/db-backups" -UseBasicParsing -TimeoutSec 20
    Log "Health check HTTP status: $($probe.StatusCode)"
  } catch {
    Log "Health check failed: $($_.Exception.Message)"
  }

  Log "Restore completed."
  Write-Host "Restore completed from $selectedDump"
} finally {
  if (Test-Path Env:\PGPASSWORD) { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
}
