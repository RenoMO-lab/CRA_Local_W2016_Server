param(
  [int]$Port = 3100
)

$ErrorActionPreference = "Stop"

$conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) {
  Write-Host "No listener found on port $Port"
  exit 0
}

try {
  Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
} catch {}

Start-Sleep -Milliseconds 400
$still = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($still) {
  throw "Failed to stop listener on port $Port (PID=$($still.OwningProcess))."
}

Write-Host "Stopped listener on port $Port"

