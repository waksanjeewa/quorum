#!/usr/bin/env pwsh
<#
Quorum — Windows source install.

Installs/checks prerequisites, clones or updates the repo, builds it, and links the `quorum` CLI
globally. Environment knobs:
  QUORUM_REPO=https://github.com/waksanjeewa/quorum.git
  QUORUM_DIR=$HOME\.quorum-src
  QUORUM_PNPM_VERSION=11.10.0
  QUORUM_SKIP_SYSTEM_DEPS=1   # only check prerequisites; do not use winget
#>
[CmdletBinding()]
param(
  [string]$Repo = $(if ($env:QUORUM_REPO) { $env:QUORUM_REPO } else { "https://github.com/waksanjeewa/quorum.git" }),
  [string]$Dir = $(if ($env:QUORUM_DIR) { $env:QUORUM_DIR } else { Join-Path $HOME ".quorum-src" }),
  [string]$PnpmVersion = $(if ($env:QUORUM_PNPM_VERSION) { $env:QUORUM_PNPM_VERSION } else { "11.10.0" }),
  [switch]$SkipSystemDeps
)

$ErrorActionPreference = "Stop"
if ($env:QUORUM_SKIP_SYSTEM_DEPS -eq "1") { $SkipSystemDeps = $true }

function Say([string]$Message) { Write-Host $Message }
function Warn([string]$Message) { Write-Warning $Message }
function Die([string]$Message) { Write-Error $Message; exit 1 }
function Have([string]$Command) { [bool](Get-Command $Command -ErrorAction SilentlyContinue) }
function HavePython { (Have "python") -or (Have "py") }
function PythonVersion {
  if (Have "python") { return (& python --version) -replace '^Python ', '' }
  if (Have "py") { return (& py -3 --version) -replace '^Python ', '' }
  return "not found"
}

function NodeMajor {
  if (-not (Have "node")) { return 0 }
  try { return [int]((& node -p "Number(process.versions.node.split('.')[0])").Trim()) } catch { return 0 }
}

function NeedsNode {
  return (-not (Have "node")) -or ((NodeMajor) -lt 20)
}

function Install-WithWinget([string[]]$Ids) {
  if ($SkipSystemDeps) { return }
  if (-not $Ids -or $Ids.Count -eq 0) { return }
  if (-not (Have "winget")) {
    Die "Missing prerequisites and winget is not available. Install Git, Node.js >=20, npm, and Python 3, then rerun this script."
  }
  foreach ($id in $Ids) {
    Say "Installing $id with winget..."
    & winget install --id $id --exact --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
      Warn "winget could not install $id. If it is already installed, open a new PowerShell and rerun install.ps1."
    }
  }
}

function Install-SystemPackages {
  $missing = New-Object System.Collections.Generic.List[string]
  if (-not (Have "git")) { $missing.Add("Git.Git") }
  if (NeedsNode) { $missing.Add("OpenJS.NodeJS.LTS") }
  if (-not (HavePython)) { $missing.Add("Python.Python.3.12") }

  if ($missing.Count -gt 0) {
    if ($SkipSystemDeps) {
      Die "Missing prerequisites. Install Git, Node.js >=20/npm, and Python 3, then rerun without QUORUM_SKIP_SYSTEM_DEPS=1."
    }
    Install-WithWinget -Ids ($missing.ToArray())
  }
}

function Verify-Prerequisites {
  if (-not (Have "git")) { Die "git is required. Install Git for Windows, then rerun." }
  if (-not (Have "node")) { Die "Node.js >=20 is required. Install the current Node LTS from https://nodejs.org, then rerun." }
  if ((NodeMajor) -lt 20) { Die "Node.js >=20 is required; found $(& node -v). Install a current Node LTS, then rerun." }
  if (-not (Have "npm")) { Die "npm is required and should come with Node.js." }
  if (-not (HavePython)) { Die "Python 3 is required for common project tasks. Install Python 3, then rerun." }
}

function Ensure-Pnpm {
  if (Have "pnpm") { return }

  if (Have "corepack") {
    try {
      & corepack enable
      & corepack prepare "pnpm@$PnpmVersion" --activate
    } catch {
      Warn "corepack could not activate pnpm; falling back to npm install -g."
    }
  }

  if (-not (Have "pnpm")) {
    Say "Installing pnpm@$PnpmVersion with npm..."
    & npm install -g "pnpm@$PnpmVersion"
    if ($LASTEXITCODE -ne 0) { Die "npm could not install pnpm." }
  }
}

Install-SystemPackages
Verify-Prerequisites
Ensure-Pnpm

Say "Prerequisites:"
Say "  node $(& node -v)"
Say "  npm $(& npm -v)"
Say "  pnpm $(& pnpm -v)"
Say "  git $((& git --version) -replace '^git version ', '')"
Say "  python $(PythonVersion)"
Say "  Windows Credential Manager available (API-key storage)"

if (Test-Path (Join-Path $Dir ".git")) {
  Say "Updating $Dir..."
  & git -C $Dir pull --ff-only
  if ($LASTEXITCODE -ne 0) { Die "git pull failed for $Dir." }
} else {
  Say "Cloning into $Dir..."
  & git clone $Repo $Dir
  if ($LASTEXITCODE -ne 0) { Die "git clone failed." }
}

Push-Location $Dir
try {
  & pnpm install
  if ($LASTEXITCODE -ne 0) { Die "pnpm install failed." }
  & pnpm build
  if ($LASTEXITCODE -ne 0) { Die "pnpm build failed." }
  & pnpm --filter quorum exec npm link
  if ($LASTEXITCODE -ne 0) {
    Push-Location (Join-Path $Dir "packages\cli")
    try {
      & npm link
      if ($LASTEXITCODE -ne 0) { Die "npm link failed." }
    } finally {
      Pop-Location
    }
  }
} finally {
  Pop-Location
}

Write-Host ""
Say "✓ Installed. Next:"
Say "    quorum doctor          # see which models you're logged into"
Say "    quorum init            # scaffold a config in your project"
Say "    quorum start `"build me X`""
