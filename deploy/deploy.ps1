param(
  [string]$AppPath = "C:\CRA_Local_Main\app",
  [string]$ServiceName = "CRA_Local_App",
  [string]$Branch = "main",
  [string]$TargetCommit = "",
  [string]$ToolsRoot = "C:\CRA_Local_Main\tools"
)

$ErrorActionPreference = "Stop"

function Ensure-PathExists {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if (-not (Test-Path $Path)) {
    throw "$Label not found: $Path"
  }
}

$script:GitCmd = Join-Path $ToolsRoot "git\cmd\git.exe"
$script:NodeExe = Join-Path $ToolsRoot "node\node.exe"
$script:NpmCmd = Join-Path $ToolsRoot "node\npm.cmd"
$script:NssmExe = Join-Path $ToolsRoot "nssm.exe"

Ensure-PathExists -Path $script:GitCmd -Label "Git executable"
Ensure-PathExists -Path $script:NodeExe -Label "Node executable"
Ensure-PathExists -Path $script:NpmCmd -Label "npm executable"

function Resolve-EffectiveAppPath {
  param(
    [Parameter(Mandatory = $true)][string]$RequestedPath,
    [Parameter(Mandatory = $true)][string]$Service
  )

  if (-not (Test-Path $script:NssmExe)) {
    return $RequestedPath
  }

  $nssmOutput = & $script:NssmExe get $Service AppDirectory 2>$null
  if ($LASTEXITCODE -ne 0) {
    return $RequestedPath
  }

  $servicePath = (($nssmOutput | ForEach-Object { "$_" }) -join "`n").Trim()
  if ([string]::IsNullOrWhiteSpace($servicePath)) {
    return $RequestedPath
  }

  if ($servicePath -ne $RequestedPath) {
    Write-Warning ("AppPath override: using NSSM AppDirectory '{0}' instead of requested '{1}'." -f $servicePath, $RequestedPath)
  }
  return $servicePath
}

$AppPath = Resolve-EffectiveAppPath -RequestedPath $AppPath -Service $ServiceName
Ensure-PathExists -Path $AppPath -Label "AppPath"

$nodeDir = Split-Path $script:NodeExe -Parent
if (-not ($env:Path -split ';' | Where-Object { $_ -eq $nodeDir })) {
  $env:Path = "$nodeDir;$env:Path"
}

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)][string[]]$Args,
    [bool]$Capture = $false
  )

  if ($Capture) {
    $out = & $script:GitCmd @Args 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw ("git command failed ({0}): {1}" -f ($Args -join " "), (($out | ForEach-Object { "$_" }) -join " "))
    }
    return (($out | ForEach-Object { "$_" }) -join "`n").Trim()
  }

  & $script:GitCmd @Args
  if ($LASTEXITCODE -ne 0) {
    throw ("git command failed: {0}" -f ($Args -join " "))
  }
}

function Invoke-NodeScript {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [string[]]$Args = @()
  )

  & $script:NodeExe $ScriptPath @Args
  if ($LASTEXITCODE -ne 0) {
    throw ("node command failed: {0} {1}" -f $ScriptPath, ($Args -join " "))
  }
}

function Invoke-NpmCiWithFallback {
  $ciOutput = & $script:NpmCmd --prefix $AppPath ci --include=dev 2>&1
  if ($LASTEXITCODE -eq 0) {
    return
  }

  Write-Warning ("npm ci failed; switching to node.exe + npm-cli.js fallback. Error: {0}" -f (($ciOutput | ForEach-Object { "$_" }) -join " "))

  $npmCli = Join-Path $ToolsRoot "node\node_modules\npm\bin\npm-cli.js"
  if (-not (Test-Path $npmCli)) {
    throw "Fallback npm-cli.js not found: $npmCli"
  }

  & $script:NodeExe $npmCli --prefix $AppPath ci --include=dev --ignore-scripts
  if ($LASTEXITCODE -ne 0) {
    throw "Fallback npm ci failed."
  }

  $esbuildInstall = Join-Path $AppPath "node_modules\esbuild\install.js"
  if (Test-Path $esbuildInstall) {
    Invoke-NodeScript -ScriptPath $esbuildInstall
  }
}

function Restart-AppService {
  param(
    [string]$Name
  )

  if (Test-Path $script:NssmExe) {
    & $script:NssmExe restart $Name | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "nssm restart failed for service '$Name' (exit code $LASTEXITCODE)."
    }
    return
  }

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
$env:GIT_EXECUTABLE = $script:GitCmd

Invoke-Git -Args @("fetch", "--prune", "origin")
Invoke-Git -Args @("checkout", $Branch, "--quiet")

if (-not $TargetCommit) {
  $TargetCommit = Invoke-Git -Args @("rev-parse", "origin/$Branch") -Capture $true
}
if (-not $TargetCommit -or $TargetCommit -notmatch "^[0-9a-fA-F]{7,40}$") {
  throw "TargetCommit must be a valid git commit hash. Received: '$TargetCommit'"
}

Invoke-Git -Args @("reset", "--hard", $TargetCommit)
$deployedCommit = Invoke-Git -Args @("rev-parse", "HEAD") -Capture $true
if ($deployedCommit -ne $TargetCommit) {
  throw "Pinned hash mismatch after reset (expected $TargetCommit, got $deployedCommit)."
}

Invoke-NpmCiWithFallback
Invoke-NodeScript -ScriptPath (Join-Path $AppPath "server\migrate.js")
Invoke-NodeScript -ScriptPath (Join-Path $AppPath "node_modules\vite\bin\vite.js") -Args @("build")
Invoke-NodeScript -ScriptPath (Join-Path $AppPath "scripts\write-build-info.mjs")

$buildInfoPath = Join-Path $AppPath "dist\build-info.json"
Ensure-PathExists -Path $buildInfoPath -Label "Build info file"
$buildInfoRaw = Get-Content -Path $buildInfoPath -Raw -ErrorAction Stop
$buildInfo = $buildInfoRaw | ConvertFrom-Json
if (-not $buildInfo.hash) {
  throw "dist/build-info.json hash is empty."
}
if ($buildInfo.hash -ne $deployedCommit) {
  throw "dist/build-info.json hash mismatch (expected $deployedCommit, got $($buildInfo.hash))."
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

$deployInfo = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/deploy-info" -TimeoutSec 20
$liveHash = $null
if ($deployInfo -and $deployInfo.build -and $deployInfo.build.hash) {
  $liveHash = [string]$deployInfo.build.hash
} elseif ($deployInfo -and $deployInfo.git -and $deployInfo.git.hash) {
  $liveHash = [string]$deployInfo.git.hash
}

if ([string]::IsNullOrWhiteSpace($liveHash)) {
  throw "Live deploy hash is missing from /api/admin/deploy-info."
}
if ($liveHash -ne $deployedCommit) {
  throw ("Live deploy hash mismatch (expected {0}, got {1})." -f $deployedCommit, $liveHash)
}

Write-Host ("Deployment completed. Commit={0} Service={1}" -f $deployedCommit, $ServiceName)
