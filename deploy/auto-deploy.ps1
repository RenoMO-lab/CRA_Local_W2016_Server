param(
  [string]$AppPath = "C:\apps\CRA_Local",
  [string]$Branch = "main",
  [string]$LogDir = "C:\apps\CRA_Local\deploy\logs",
  [string]$DeployScript = "C:\apps\CRA_Local\deploy\deploy.ps1",
  [string]$SshKeyPath = "C:\Users\Administrator\.ssh\github_actions",
  [string]$KnownHostsPath = "C:\ProgramData\ssh\known_hosts",
  [int]$CheckIntervalMinutes = 5,
  [int]$MaxLogMB = 10,
  [bool]$PreferSsh443 = $true
)

$ErrorActionPreference = "Stop"

function Write-Log {
  param(
    [string]$Message,
    [string]$Level = "INFO"
  )
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$ts] [$Level] $Message"
  Add-Content -Path $script:LogFile -Value $line -Encoding ASCII
}

function Rotate-LogIfNeeded {
  if (-not (Test-Path $script:LogFile)) { return }
  try {
    $len = (Get-Item $script:LogFile).Length
    if ($len -lt ($MaxLogMB * 1024 * 1024)) { return }

    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    $archived = Join-Path (Split-Path $script:LogFile -Parent) ("auto-deploy.$ts.log")
    Move-Item -Force -Path $script:LogFile -Destination $archived

    # Keep last 10 archives.
    Get-ChildItem -Path (Split-Path $script:LogFile -Parent) -Filter "auto-deploy.*.log" -File |
      Sort-Object LastWriteTime -Descending |
      Select-Object -Skip 10 |
      Remove-Item -Force -ErrorAction SilentlyContinue
  } catch {
    # Never block deployments because of log rotation.
  }
}

function Get-RemoteHash {
  param(
    [string]$BranchName
  )
  $remoteLine = git ls-remote origin "refs/heads/$BranchName" 2>&1
  if ($LASTEXITCODE -ne 0 -or -not $remoteLine) {
    Write-Log ("git ls-remote failed: {0}" -f ($remoteLine -join " ")) "ERROR"
    return $null
  }
  return ($remoteLine -split '\s+')[0]
}

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
$script:LogFile = Join-Path $LogDir "auto-deploy.log"
$lockPath = Join-Path $LogDir "auto-deploy.lock"

try {
  Rotate-LogIfNeeded

  try {
    $lockStream = [System.IO.File]::Open(
      $lockPath,
      [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
  } catch {
    Write-Log "Another run is in progress; skipping." "WARN"
    return
  }

  Write-Log "Starting auto-deploy check (interval: ${CheckIntervalMinutes}m)."

  if (-not (Test-Path $AppPath)) {
    if ($PSScriptRoot) {
      $fallbackPath = Split-Path $PSScriptRoot -Parent
      if (Test-Path $fallbackPath) {
        Write-Log "AppPath not found: $AppPath. Falling back to $fallbackPath" "WARN"
        $AppPath = $fallbackPath
        $LogDir = Join-Path $AppPath "deploy\logs"
        if (-not (Test-Path $LogDir)) {
          New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
        }
        $script:LogFile = Join-Path $LogDir "auto-deploy.log"
        $lockPath = Join-Path $LogDir "auto-deploy.lock"
      }
    }
  }

  if (-not (Test-Path $AppPath)) {
    Write-Log "AppPath not found: $AppPath" "ERROR"
    return
  }
  if (-not (Test-Path (Join-Path $AppPath ".git"))) {
    Write-Log "No git repo found at $AppPath" "ERROR"
    return
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Log "git not found in PATH." "ERROR"
    return
  }

  if (-not (Test-Path $SshKeyPath)) {
    Write-Log "SSH key not found: $SshKeyPath" "ERROR"
    return
  }
  $khDir = Split-Path $KnownHostsPath
  if (-not (Test-Path $khDir)) {
    New-Item -ItemType Directory -Force -Path $khDir | Out-Null
  }
  # Use a dedicated ssh command for Git operations. The scheduled task runs as SYSTEM,
  # so don't rely on per-user ssh-agent state.
  $sshKey = $SshKeyPath -replace '\\', '/'
  $knownHosts = $KnownHostsPath -replace '\\', '/'
  # Note: keep this compatible with Windows PowerShell 5.1 (no PowerShell 7-only syntax).
  # Use StrictHostKeyChecking=no to avoid interactive prompts and older OpenSSH clients
  # that might not support "accept-new". If you want strict host key pinning, pre-populate
  # $KnownHostsPath and switch this to "yes".
  $sshBase = "ssh -i `"$sshKey`" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=`"$knownHosts`" -o ConnectTimeout=10 -o ServerAliveInterval=30 -o ServerAliveCountMax=2"

  # Prefer SSH over 443 (more firewall-friendly) if requested, or if github.com:22 is flaky.
  if ($PreferSsh443) {
    $sshBase = "$sshBase -o HostName=ssh.github.com -p 443"
  }
  $env:GIT_SSH_COMMAND = $sshBase

  Set-Location $AppPath

  $status = git status --porcelain
  if ($status) {
    Write-Log ("Working tree dirty; skipping deploy. Status: {0}" -f ($status -join "; ")) "WARN"
    return
  }

  $remoteUrl = git remote get-url origin 2>$null
  if ($remoteUrl) {
    Write-Log "Origin: $remoteUrl"
  }
  if ($remoteUrl -and $remoteUrl -match "github.com") {
    $hostToCheck = "github.com"
    $portToCheck = 22
    if ($PreferSsh443) {
      $hostToCheck = "ssh.github.com"
      $portToCheck = 443
    }

    $dnsOk = $false
    for ($i = 0; $i -lt 3; $i++) {
      $dnsCheck = Resolve-DnsName $hostToCheck -ErrorAction SilentlyContinue
      if ($dnsCheck) { $dnsOk = $true; break }
      Start-Sleep -Seconds 2
    }
    if (-not $dnsOk) {
      Write-Log "DNS resolution failed for $hostToCheck. Fix DNS/network to reach GitHub." "ERROR"
      return
    }

    $tcpOk = $false
    for ($i = 0; $i -lt 3; $i++) {
      $tcpCheck = Test-NetConnection $hostToCheck -Port $portToCheck -InformationLevel Quiet
      if ($tcpCheck) { $tcpOk = $true; break }
      Start-Sleep -Seconds 2
    }
    if (-not $tcpOk) {
      Write-Log "Cannot reach ${hostToCheck}:${portToCheck}. Check firewall/NAT." "ERROR"
      return
    }
  }

  $local = git rev-parse "refs/heads/$Branch" 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $local) {
    Write-Log "Local branch '$Branch' not found." "ERROR"
    return
  }
  $remote = Get-RemoteHash -BranchName $Branch
  if (-not $remote) {
    Write-Log "Unable to resolve remote hash for '$Branch'. Check DNS/SSH access to GitHub." "ERROR"
    return
  }

  Write-Log "Local ${Branch}: $local"
  Write-Log "Remote origin/${Branch}: $remote"

  if ($local -eq $remote) {
    Write-Log "No changes on origin/$Branch."
    return
  }

  if (-not (Test-Path $DeployScript)) {
    Write-Log "Deploy script not found: $DeployScript" "ERROR"
    return
  }

  Write-Log "Changes detected ($local -> $remote). Running deploy."
  & $DeployScript -AppPath $AppPath
  Write-Log "Deploy finished successfully."
} catch {
  Write-Log "Deploy failed: $($_.Exception.Message)" "ERROR"
  # Do not crash the scheduled task; log and continue next interval.
  return
} finally {
  if ($lockStream) {
    $lockStream.Close()
    $lockStream.Dispose()
  }
}
