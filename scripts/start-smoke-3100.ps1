param(
  [string]$EnvFile = ".env.smoke",
  [int]$Port = 3100
)

$ErrorActionPreference = "Stop"

# Run from repo root.
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (!(Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

# Load KEY=VALUE pairs into current process environment.
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line) { return }
  if ($line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $name = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1).Trim()
  if ($name) {
    Set-Item -Path ("Env:" + $name) -Value $value
  }
}

if ($Port -gt 0) {
  Set-Item -Path "Env:PORT" -Value ([string]$Port)
}

# Stop any existing listener on the target port.
$conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  try { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Milliseconds 400
}

Write-Host "Running migrations..."
node server/migrate.js

Write-Host "Starting test server on http://127.0.0.1:$Port ..."
$p = Start-Process -FilePath "node" -ArgumentList @("server/index.js") -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 900

$listen = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listen) {
  throw "Server did not start listening on port $Port (process started: $($p.Id))."
}

Write-Host "OK. PID=$($listen.OwningProcess) Listening=$($listen.LocalAddress):$($listen.LocalPort)"

