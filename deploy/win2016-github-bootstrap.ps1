param(
  [string]$Root = "C:\CRA_Local_Main",
  [string]$RepoUrl = "https://github.com/RenoMO-lab/CRA_Local_W2016_Server.git",
  [string]$Branch = "main",
  # Set $true only after PostgreSQL is installed and .env points at a reachable DB.
  [bool]$RunMigrate = $false,
  # Set $true only after DB is reachable; otherwise the service will crash-loop.
  [bool]$InstallService = $false,
  [string]$ServiceName = "CRA_Local_App"
)

$ErrorActionPreference = "Stop"

# Win2016 often defaults to older TLS; force TLS1.2 for downloads.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$AppPath = Join-Path $Root "app"
$Tools = Join-Path $Root "tools"
$Downloads = Join-Path $Tools "downloads"
$Logs = Join-Path $Root "logs"
$Shared = Join-Path $Root "shared"
$Backups = Join-Path $Root "backups\postgres"

@($Root, $Tools, $Downloads, $Logs, $Shared, $Backups) | ForEach-Object {
  New-Item -ItemType Directory -Force -Path $_ | Out-Null
}

function Write-Step([string]$Message) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$ts] $Message"
}

function Download-File {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$OutFile
  )
  if (Test-Path $OutFile) { return }
  Write-Step "Downloading: $Url"
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

function Get-JsonFromUrl {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [hashtable]$Headers = $null
  )
  $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -Headers $Headers
  return ($resp.Content | ConvertFrom-Json)
}

function Ensure-Node20 {
  $nodeDir = Join-Path $Tools "node"
  $nodeExe = Join-Path $nodeDir "node.exe"
  if (Test-Path $nodeExe) {
    Write-Step "Node already present: $nodeExe"
    return
  }

  Write-Step "Resolving latest Node.js v20.x win-x64 zip..."
  $index = Get-JsonFromUrl -Url "https://nodejs.org/dist/index.json"
  $ver = ($index | Where-Object { $_.version -like "v20.*" } | Select-Object -First 1 -ExpandProperty version)
  if (-not $ver) { throw "Could not find Node v20.* in index.json" }

  $zipName = "node-$ver-win-x64.zip"
  $zipPath = Join-Path $Downloads $zipName
  Download-File -Url "https://nodejs.org/dist/$ver/$zipName" -OutFile $zipPath

  $tmp = Join-Path $Tools "_node_tmp"
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null

  Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
  $extracted = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
  if (-not $extracted) { throw "Node zip did not contain a top-level folder." }

  if (Test-Path $nodeDir) { Remove-Item -Recurse -Force $nodeDir }
  Move-Item -Path $extracted.FullName -Destination $nodeDir

  if (-not (Test-Path $nodeExe)) { throw "node.exe not found after extract: $nodeExe" }
  Write-Step "Installed Node: $nodeExe"
}

function Ensure-Git {
  $gitDir = Join-Path $Tools "git"
  $gitCmd = Join-Path $gitDir "cmd\git.exe"
  if (Test-Path $gitCmd) {
    Write-Step "Git already present: $gitCmd"
    $script:GitCmd = $gitCmd
    return
  }

  Write-Step "Resolving latest MinGit (zip)..."
  $rel = Get-JsonFromUrl -Url "https://api.github.com/repos/git-for-windows/git/releases/latest" -Headers @{
    "User-Agent" = "CRA-Deploy"
  }
  $asset = $rel.assets | Where-Object { $_.name -match "^MinGit-.*-64-bit\.zip$" } | Select-Object -First 1
  if (-not $asset) { throw "MinGit-*-64-bit.zip asset not found in latest release." }

  $zip = Join-Path $Downloads $asset.name
  Download-File -Url $asset.browser_download_url -OutFile $zip

  if (Test-Path $gitDir) { Remove-Item -Recurse -Force $gitDir }
  New-Item -ItemType Directory -Force -Path $gitDir | Out-Null

  Write-Step "Extracting $($asset.name) -> $gitDir"
  Expand-Archive -Path $zip -DestinationPath $gitDir -Force

  if (-not (Test-Path $gitCmd)) {
    $found = Get-ChildItem -Path $gitDir -Recurse -Filter "git.exe" -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $gitCmd = $found.FullName }
  }
  if (-not (Test-Path $gitCmd)) { throw "git.exe not found after MinGit extraction." }

  Write-Step "Installed Git: $gitCmd"
  $script:GitCmd = $gitCmd
}

function Ensure-Nssm {
  $nssmExe = Join-Path $Tools "nssm.exe"
  if (Test-Path $nssmExe) {
    Write-Step "NSSM already present: $nssmExe"
    return
  }

  $zip = Join-Path $Downloads "nssm-2.24.zip"
  Download-File -Url "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip

  $tmp = Join-Path $Tools "_nssm_tmp"
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null

  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $candidate = Get-ChildItem -Path $tmp -Recurse -Filter "nssm.exe" -File |
    Where-Object { $_.FullName -match "\\win64\\" } |
    Select-Object -First 1

  if (-not $candidate) { throw "Could not find win64\\nssm.exe in NSSM zip." }
  Copy-Item -Force -Path $candidate.FullName -Destination $nssmExe
  Write-Step "Installed NSSM: $nssmExe"
}

function Ensure-Repo {
  $git = $script:GitCmd
  if (-not $git -or -not (Test-Path $git)) { throw "git not found. Did Ensure-Git run?" }

  if (Test-Path (Join-Path $AppPath ".git")) {
    Write-Step "Updating repo in $AppPath"
    Set-Location $AppPath
    & $git fetch --prune
    & $git checkout $Branch --quiet
    & $git pull --ff-only
    return
  }

  if (Test-Path $AppPath) { Remove-Item -Recurse -Force $AppPath }
  New-Item -ItemType Directory -Force -Path $AppPath | Out-Null

  Write-Step "Cloning $RepoUrl ($Branch) -> $AppPath"
  & $git clone --branch $Branch $RepoUrl $AppPath
}

function Ensure-EnvFile {
  $sharedEnv = Join-Path $Shared ".env"
  $appEnv = Join-Path $AppPath ".env"
  $exampleEnv = Join-Path $AppPath ".env.example"

  if (-not (Test-Path $sharedEnv)) {
    if (-not (Test-Path $exampleEnv)) { throw "Missing .env.example: $exampleEnv" }
    Copy-Item -Force $exampleEnv $sharedEnv
    Write-Step "Created shared env: $sharedEnv"
  }

  if (-not (Test-Path $appEnv)) {
    Copy-Item -Force $sharedEnv $appEnv
    Write-Step "Created app env: $appEnv"
  } else {
    Write-Step "App env already exists (leaving as-is): $appEnv"
  }

  $text = Get-Content $appEnv -Raw
  if ($text -notmatch "(?m)^DB_BACKUP_DIR=") {
    Add-Content -Path $appEnv -Value "`nDB_BACKUP_DIR=$Backups`n" -Encoding ASCII
    Write-Step "Added DB_BACKUP_DIR to $appEnv"
  }
}

function Npm-CiBuild([bool]$DoMigrate) {
  $npm = Join-Path $Tools "node\npm.cmd"
  if (-not (Test-Path $npm)) { throw "npm.cmd not found: $npm" }

  Set-Location $AppPath
  $env:NODE_ENV = "production"

  Write-Step "npm ci"
  & $npm ci --no-audit --no-fund

  if ($DoMigrate) {
    Write-Step "npm run migrate"
    & $npm run migrate
  } else {
    Write-Step "Skipping migrations (RunMigrate=false)."
  }

  Write-Step "npm run build"
  & $npm run build
}

function Ensure-Service {
  $nssm = Join-Path $Tools "nssm.exe"
  $nodeExe = Join-Path $Tools "node\node.exe"
  $entry = Join-Path $AppPath "server\index.js"

  if (-not (Test-Path $nssm)) { throw "nssm.exe not found: $nssm" }
  if (-not (Test-Path $nodeExe)) { throw "node.exe not found: $nodeExe" }
  if (-not (Test-Path $entry)) { throw "Server entry not found: $entry" }

  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $svc) {
    Write-Step "Installing service: $ServiceName"
    & $nssm install $ServiceName $nodeExe $entry | Out-Null
    & $nssm set $ServiceName AppDirectory $AppPath | Out-Null
    & $nssm set $ServiceName AppStdout (Join-Path $Logs "app.stdout.log") | Out-Null
    & $nssm set $ServiceName AppStderr (Join-Path $Logs "app.stderr.log") | Out-Null
    & $nssm set $ServiceName AppRotateFiles 1 | Out-Null
    & $nssm set $ServiceName AppRotateOnline 1 | Out-Null
    & $nssm set $ServiceName AppRotateBytes (10 * 1024 * 1024) | Out-Null
    & $nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
  } else {
    Write-Step "Service already exists: $ServiceName"
  }

  Write-Step "Starting service: $ServiceName"
  & $nssm start $ServiceName | Out-Null
}

Write-Step "Bootstrapping at $Root"
Ensure-Node20
Ensure-Git
Ensure-Nssm

$node = Join-Path $Tools "node\node.exe"
$npm = Join-Path $Tools "node\npm.cmd"
$git = $script:GitCmd

Write-Step "Tool versions"
& $node --version
& $npm --version
& $git --version

Ensure-Repo
Ensure-EnvFile
Npm-CiBuild -DoMigrate:$RunMigrate

if ($InstallService) {
  Ensure-Service
} else {
  Write-Step "Skipping service install/start (InstallService=false)."
}

Write-Step "Bootstrap complete."
