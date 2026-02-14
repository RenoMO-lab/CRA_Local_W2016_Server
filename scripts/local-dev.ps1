<#
.SYNOPSIS
  Local dev bootstrap for Windows 11 using Docker Desktop (PostgreSQL).

.DESCRIPTION
  - Starts/creates a local Postgres container (cra-pg)
  - Writes a local .env if missing (NOT committed to Git)
  - Runs npm ci + migrations
  - Launches API + UI dev servers in separate windows

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\local-dev.ps1

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\local-dev.ps1 -ResetDb
#>

[CmdletBinding()]
param(
  [switch]$ResetDb,
  [int]$DbPort = 5432
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$msg) { Write-Host "[local-dev] $msg" -ForegroundColor Cyan }
function Write-Warn([string]$msg) { Write-Host "[local-dev] $msg" -ForegroundColor Yellow }

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"

$containerName = "cra-pg"
$dbUser = "cra_app"
$dbPass = "cra_dev_pass"
$dbName = "cra_local_dev"

Set-Location $repoRoot

try {
  docker --version | Out-Null
} catch {
  # Docker Desktop may be installed but not yet on PATH for this session.
  $dockerBin = "C:\\Program Files\\Docker\\Docker\\resources\\bin"
  if (Test-Path (Join-Path $dockerBin "docker.exe")) {
    $env:Path = "$dockerBin;$env:Path"
  } else {
    throw "Docker is not available. Install Docker Desktop and make sure 'docker' works in PowerShell."
  }
}

# Ensure Docker Desktop backend is started.
try {
  $svc = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -ne "Running") {
    Write-Info "Starting Docker service (com.docker.service)..."
    Start-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
  }
} catch {
  # Non-fatal: Docker Desktop can still be started via the app.
}

try {
  $desktopExe = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"
  if (Test-Path $desktopExe) {
    $already = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
    if (-not $already) {
      Write-Info "Launching Docker Desktop..."
      Start-Process -FilePath $desktopExe | Out-Null
    }
  }
} catch {}

# Wait for engine to become ready.
Write-Info "Waiting for Docker engine to be ready..."
$ready = $false
for ($i = 0; $i -lt 36; $i++) {
  try {
    docker info | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Seconds 5
  }
}
if (-not $ready) {
  throw "Docker is installed but the engine is not ready. Reboot your PC, then open Docker Desktop once (to finish setup), then rerun this script."
}

if ($ResetDb) {
  Write-Warn "Reset requested: removing container '$containerName' (data will be lost)."
  docker rm -f $containerName 2>$null | Out-Null
}

$existing = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $containerName } | Select-Object -First 1
if (-not $existing) {
  Write-Info "Creating Postgres container '$containerName' on port $DbPort..."
  docker run --name $containerName `
    -e "POSTGRES_USER=$dbUser" `
    -e "POSTGRES_PASSWORD=$dbPass" `
    -e "POSTGRES_DB=$dbName" `
    -p "$DbPort`:5432" `
    -d postgres:16 | Out-Null
} else {
  $running = docker ps --format "{{.Names}}" | Where-Object { $_ -eq $containerName } | Select-Object -First 1
  if (-not $running) {
    Write-Info "Starting existing container '$containerName'..."
    docker start $containerName | Out-Null
  } else {
    Write-Info "Container '$containerName' is already running."
  }
}

if (-not (Test-Path $envPath)) {
  Write-Info "Writing local .env (kept on this PC only): $envPath"
  @"
HOST=0.0.0.0
PORT=3000

# Local test DB (Docker)
PGHOST=localhost
PGPORT=$DbPort
PGDATABASE=$dbName
PGUSER=$dbUser
PGPASSWORD=$dbPass

JSON_BODY_LIMIT=50mb
"@ | Set-Content -LiteralPath $envPath -Encoding ASCII
} else {
  Write-Info ".env already exists; leaving it unchanged."
}

Write-Info "Installing dependencies (npm ci)..."
cmd /c "npm ci" | Out-Host

Write-Info "Running migrations against local DB..."
cmd /c "npm run migrate" | Out-Host

Write-Info "Launching API dev server (npm run dev:api) in a new window..."
Start-Process powershell -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-NoExit",
  "-Command", "cd `"$repoRoot`"; cmd /c `"npm run dev:api`""
)

Write-Info "Launching UI dev server (npm run dev) in a new window..."
Start-Process powershell -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-NoExit",
  "-Command", "cd `"$repoRoot`"; cmd /c `"npm run dev`""
)

Write-Info "Done. Open the UI at http://127.0.0.1:5173"
