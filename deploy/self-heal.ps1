param(
  [string]$AppPath = "C:\apps\CRA_Local",
  [string]$ServiceName = "CRA_Local",
  [string]$HealthUrl = "http://localhost:3000/",
  [string]$UpdateHealthUrl = "http://localhost:3000/api/admin/client-update-health",
  [string]$LogDir = "",
  [int]$FailureThreshold = 3,
  [int]$MaxLogMB = 10
)

$ErrorActionPreference = "Stop"

if (-not $LogDir) {
  $LogDir = Join-Path $AppPath "deploy\logs"
}
if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

$script:LogFile = Join-Path $LogDir "self-heal.log"
$stateFile = Join-Path $LogDir "self-heal.state.json"

function Write-Log {
  param(
    [string]$Message,
    [string]$Level = "INFO"
  )
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $script:LogFile -Value "[$ts] [$Level] $Message" -Encoding ASCII
}

function Rotate-LogIfNeeded {
  if (-not (Test-Path $script:LogFile)) { return }
  try {
    $len = (Get-Item $script:LogFile).Length
    if ($len -lt ($MaxLogMB * 1024 * 1024)) { return }
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    $archived = Join-Path (Split-Path $script:LogFile -Parent) ("self-heal.$ts.log")
    Move-Item -Force -Path $script:LogFile -Destination $archived
    Get-ChildItem -Path (Split-Path $script:LogFile -Parent) -Filter "self-heal.*.log" -File |
      Sort-Object LastWriteTime -Descending |
      Select-Object -Skip 20 |
      Remove-Item -Force -ErrorAction SilentlyContinue
  } catch {}
}

function Load-State {
  if (-not (Test-Path $stateFile)) { return @{ failCount = 0 } }
  try {
    $raw = Get-Content -Path $stateFile -Raw -ErrorAction Stop
    $parsed = $raw | ConvertFrom-Json
    $count = [int]($parsed.failCount)
    if ($count -lt 0) { $count = 0 }
    return @{ failCount = $count }
  } catch {
    return @{ failCount = 0 }
  }
}

function Save-State([int]$FailCount) {
  $payload = @{
    failCount = [Math]::Max(0, $FailCount)
    updatedAt = (Get-Date).ToString("o")
  } | ConvertTo-Json -Compress
  Set-Content -Path $stateFile -Value $payload -Encoding ASCII
}

function Invoke-UrlCheck {
  param(
    [string]$Url,
    [int]$ExpectedStatus = 200
  )
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 15
    if ([int]$resp.StatusCode -ne $ExpectedStatus) {
      return @{
        ok = $false
        detail = "unexpected status $($resp.StatusCode) (expected $ExpectedStatus)"
      }
    }
    return @{
      ok = $true
      detail = "status=$($resp.StatusCode)"
    }
  } catch {
    return @{
      ok = $false
      detail = $_.Exception.Message
    }
  }
}

function Restart-AppService {
  param(
    [string]$Name
  )

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
    & $nssmCmd restart $Name | Out-Null
    return
  }

  Restart-Service -Name $Name -Force
}

Rotate-LogIfNeeded
$state = Load-State
$failCount = [int]$state.failCount

$serviceOk = $true
try {
  $svc = Get-Service -Name $ServiceName -ErrorAction Stop
  if ($svc.Status -ne "Running") {
    $serviceOk = $false
    Write-Log "Service '$ServiceName' is $($svc.Status)." "WARN"
  }
} catch {
  $serviceOk = $false
  Write-Log "Service '$ServiceName' not found: $($_.Exception.Message)" "ERROR"
}

$appCheck = Invoke-UrlCheck -Url $HealthUrl -ExpectedStatus 200
$updateCheck = Invoke-UrlCheck -Url $UpdateHealthUrl -ExpectedStatus 200
$healthy = $serviceOk -and $appCheck.ok -and $updateCheck.ok

if ($healthy) {
  if ($failCount -ne 0) {
    Write-Log "Recovered. Resetting fail counter from $failCount to 0. app=[$($appCheck.detail)] update=[$($updateCheck.detail)]"
  } else {
    Write-Log "Healthy. app=[$($appCheck.detail)] update=[$($updateCheck.detail)]"
  }
  Save-State -FailCount 0
  exit 0
}

$failCount += 1
Write-Log "Probe failed ($failCount/$FailureThreshold). app=[$($appCheck.detail)] update=[$($updateCheck.detail)] serviceOk=$serviceOk" "WARN"
Save-State -FailCount $failCount

if ($failCount -lt $FailureThreshold) {
  exit 0
}

try {
  Write-Log "Failure threshold reached; restarting service '$ServiceName'." "ERROR"
  Restart-AppService -Name $ServiceName
  Start-Sleep -Seconds 5
  $postCheck = Invoke-UrlCheck -Url $HealthUrl -ExpectedStatus 200
  if ($postCheck.ok) {
    Write-Log "Service restart recovered app health. $($postCheck.detail)"
    Save-State -FailCount 0
    exit 0
  }
  Write-Log "Service restart completed but app health check still failing: $($postCheck.detail)" "ERROR"
  Save-State -FailCount $FailureThreshold
  exit 1
} catch {
  Write-Log "Service restart failed: $($_.Exception.Message)" "ERROR"
  Save-State -FailCount $FailureThreshold
  exit 1
}
