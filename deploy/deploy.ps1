param(
  [string]$AppPath = "C:\apps\CRA_Local",
  [string]$ServiceName = "CRA_Local"
)

$ErrorActionPreference = "Stop"

Set-Location $AppPath

$backupScript = Join-Path $AppPath "deploy\db-backup.ps1"
if (Test-Path $backupScript) {
  try {
    & $backupScript -AppPath $AppPath
  } catch {
    Write-Warning ("Database backup failed; continuing deployment. Error: {0}" -f $_.Exception.Message)
  }
} else {
  Write-Warning "db-backup.ps1 not found. Skipping backup."
}

$env:NODE_ENV = "production"

git fetch --prune
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0) {
  throw "git rev-parse failed"
}
if ($currentBranch -ne "main") {
  git checkout main --quiet
}
git pull --ff-only

# Server 2016: keep tooling simple and predictable (npm + package-lock.json).
# Use npm.cmd to avoid PowerShell execution policy issues with npm.ps1.
#
# NOTE: Even in production we must install devDependencies to run `vite build`.
& npm.cmd ci --include=dev
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

& npm.cmd run migrate
if ($LASTEXITCODE -ne 0) { throw "npm run migrate failed" }

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

function Restart-AppService {
  param(
    [string]$Name
  )

  # Prefer NSSM if available (service is managed by it), but don't assume it's on PATH.
  $nssmCmd = $null
  try {
    $nssmCmd = (Get-Command nssm -ErrorAction Stop).Source
  } catch {
    $nssmCmd = $null
  }
  if (-not $nssmCmd) {
    $candidate = "C:\nssm\nssm.exe"
    if (Test-Path $candidate) {
      $nssmCmd = $candidate
    }
  }

  if ($nssmCmd) {
    & $nssmCmd restart $Name
    return
  }

  # Fallback: normal Windows service restart.
  Restart-Service -Name $Name -Force
}

Restart-AppService -Name $ServiceName
