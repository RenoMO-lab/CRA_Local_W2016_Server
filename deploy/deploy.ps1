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

function Invoke-HttpHealthCheck {
  param(
    [string]$Url,
    [int]$ExpectedStatus = 200
  )
  $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 20
  if ([int]$resp.StatusCode -ne $ExpectedStatus) {
    throw "Health check failed for $Url (status $($resp.StatusCode), expected $ExpectedStatus)"
  }
}

function Wait-ForHttpHealthy {
  param(
    [string]$Url,
    [int]$ExpectedStatus = 200,
    [int]$MaxAttempts = 15,
    [int]$DelaySeconds = 4
  )

  $lastError = ""
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      Invoke-HttpHealthCheck -Url $Url -ExpectedStatus $ExpectedStatus
      Write-Host "Health check passed: $Url (attempt $attempt/$MaxAttempts)"
      return
    } catch {
      $lastError = $_.Exception.Message
      Write-Warning "Health check attempt $attempt/$MaxAttempts failed for ${Url}: $lastError"
      if ($attempt -lt $MaxAttempts) {
        Start-Sleep -Seconds $DelaySeconds
      }
    }
  }

  throw "Health check failed for $Url after $MaxAttempts attempts: $lastError"
}

$selfHealInstaller = Join-Path $AppPath "deploy\install-self-heal-task.ps1"
if (Test-Path $selfHealInstaller) {
  try {
    $selfHealTaskName = ("{0}_SelfHeal" -f ($ServiceName -replace "\s+", "_"))
    & $selfHealInstaller -TaskName $selfHealTaskName -AppPath $AppPath -ServiceName $ServiceName
  } catch {
    Write-Warning ("Failed to install/update self-heal task: {0}" -f $_.Exception.Message)
  }
} else {
  Write-Warning "install-self-heal-task.ps1 not found. Skipping self-heal task install."
}

Restart-AppService -Name $ServiceName

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
  throw "Service '$ServiceName' not found after restart."
}
if ($svc.Status -ne "Running") {
  throw "Service '$ServiceName' is not running after restart (status: $($svc.Status))."
}

Wait-ForHttpHealthy -Url "http://localhost:3000/" -ExpectedStatus 200 -MaxAttempts 20 -DelaySeconds 3
Wait-ForHttpHealthy -Url "http://localhost:3000/api/admin/client-update-health" -ExpectedStatus 200 -MaxAttempts 10 -DelaySeconds 3
