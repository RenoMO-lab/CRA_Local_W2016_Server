param(
  [string]$AppPath = "C:\apps\CRA_Local",
  [string]$ServiceName = "CRA_Local"
)

$ErrorActionPreference = "Stop"

Set-Location $AppPath

$backupScript = Join-Path $AppPath "deploy\db-backup.ps1"
if (Test-Path $backupScript) {
  & $backupScript -AppPath $AppPath
} else {
  Write-Warning "db-backup.ps1 not found. Skipping backup."
}

git fetch --prune
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0) {
  throw "git rev-parse failed"
}
if ($currentBranch -ne "main") {
  git checkout main --quiet
}
git pull --ff-only

if (Get-Command bun -ErrorAction SilentlyContinue) {
  bun install --frozen-lockfile
  bun run migrate
  bun run build
} else {
  npm ci
  npm run migrate
  npm run build
}

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if ($nssm) {
  nssm restart $ServiceName
} else {
  Write-Warning "NSSM not found. Restart the service manually."
}
