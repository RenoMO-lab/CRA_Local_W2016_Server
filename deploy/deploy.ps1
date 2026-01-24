param(
  [string]$AppPath = "C:\\apps\\CRA_Local",
  [string]$ServiceName = "CRA_Local"
)

$ErrorActionPreference = "Stop"

Set-Location $AppPath

git fetch --prune
git checkout main
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
