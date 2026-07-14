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
function Is-Windows { return [System.IO.Path]::DirectorySeparatorChar -eq "\" }
function Tool([string]$Command) {
  if (Is-Windows) {
    foreach ($candidate in @("$Command.cmd", "$Command.exe", $Command)) {
      if (Get-Command $candidate -ErrorAction SilentlyContinue) { return $candidate }
    }
  }
  return $Command
}
function Have([string]$Command) { [bool](Get-Command (Tool $Command) -ErrorAction SilentlyContinue) }
function Add-PathEntries([System.Collections.Generic.List[string]]$Parts, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return }
  foreach ($part in ($Value -split [Regex]::Escape([string][IO.Path]::PathSeparator))) {
    if (-not [string]::IsNullOrWhiteSpace($part)) { $Parts.Add($part.Trim()) }
  }
}
function Add-ExistingChildPath([System.Collections.Generic.List[string]]$Parts, [string]$Base, [string]$Child) {
  if ([string]::IsNullOrWhiteSpace($Base)) { return }
  $candidate = Join-Path $Base $Child
  if (Test-Path $candidate) { $Parts.Add($candidate) }
}
function Normalize-PathForCompare([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  $path = [Environment]::ExpandEnvironmentVariables($Value).Trim()
  while ($path.EndsWith("\") -or $path.EndsWith("/")) {
    $path = $path.Substring(0, $path.Length - 1)
  }
  if (Is-Windows) { return $path.ToLowerInvariant() }
  return $path
}
function Path-Contains([string]$PathValue, [string]$Entry) {
  if ([string]::IsNullOrWhiteSpace($PathValue) -or [string]::IsNullOrWhiteSpace($Entry)) { return $false }
  $needle = Normalize-PathForCompare $Entry
  foreach ($part in ($PathValue -split [Regex]::Escape([string][IO.Path]::PathSeparator))) {
    if ((Normalize-PathForCompare $part) -eq $needle) { return $true }
  }
  return $false
}
function Append-PathValue([string]$PathValue, [string]$Entry) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return $Entry }
  return "$PathValue$([string][IO.Path]::PathSeparator)$Entry"
}
function Ensure-PathContains([string]$Entry, [switch]$PersistUser) {
  if ([string]::IsNullOrWhiteSpace($Entry)) { return }
  $expanded = [Environment]::ExpandEnvironmentVariables($Entry).Trim()
  if ([string]::IsNullOrWhiteSpace($expanded)) { return }

  if (-not (Path-Contains $env:Path $expanded)) {
    $env:Path = Append-PathValue $env:Path $expanded
  }

  if ($PersistUser -and (Is-Windows)) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (Path-Contains $userPath $expanded)) {
      [Environment]::SetEnvironmentVariable("Path", (Append-PathValue $userPath $expanded), "User")
      Say "Added $expanded to your user PATH for future PowerShell windows."
    }
  }
}
function Refresh-ProcessPath {
  $parts = New-Object System.Collections.Generic.List[string]
  Add-PathEntries $parts ([Environment]::GetEnvironmentVariable("Path", "Process"))
  Add-PathEntries $parts ([Environment]::GetEnvironmentVariable("Path", "User"))
  Add-PathEntries $parts ([Environment]::GetEnvironmentVariable("Path", "Machine"))

  # Installers launched by winget often update User/Machine PATH but not this PowerShell process.
  # Add the standard install locations as a belt-and-suspenders fallback so the same run can continue.
  $programFiles = [Environment]::GetFolderPath("ProgramFiles")
  $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
  Add-ExistingChildPath $parts $programFiles "Git\cmd"
  Add-ExistingChildPath $parts $programFilesX86 "Git\cmd"
  Add-ExistingChildPath $parts $localAppData "Programs\Git\cmd"
  Add-ExistingChildPath $parts $programFiles "nodejs"
  Add-ExistingChildPath $parts $programFilesX86 "nodejs"
  Add-ExistingChildPath $parts $localAppData "Programs\Python\Launcher"
  Add-ExistingChildPath $parts $localAppData "Microsoft\WindowsApps"

  $seen = @{}
  $deduped = New-Object System.Collections.Generic.List[string]
  foreach ($part in $parts) {
    $expanded = [Environment]::ExpandEnvironmentVariables($part).Trim()
    if ([string]::IsNullOrWhiteSpace($expanded)) { continue }
    $key = if (Is-Windows) { $expanded.ToLowerInvariant() } else { $expanded }
    if (-not $seen.ContainsKey($key)) {
      $seen[$key] = $true
      $deduped.Add($expanded)
    }
  }
  if ($deduped.Count -gt 0) {
    $env:Path = [string]::Join([string][IO.Path]::PathSeparator, $deduped.ToArray())
  }
}
function HavePython { (Have "python") -or (Have "py") }
function PythonVersion {
  if (Have "python") { return (& (Tool "python") --version) -replace '^Python ', '' }
  if (Have "py") { return (& (Tool "py") -3 --version) -replace '^Python ', '' }
  return "not found"
}

function NodeMajor {
  if (-not (Have "node")) { return 0 }
  try { return [int]((& (Tool "node") -p "Number(process.versions.node.split('.')[0])").Trim()) } catch { return 0 }
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
    & (Tool "winget") install --id $id --exact --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
      Warn "winget could not install $id. If it is already installed, open a new PowerShell and rerun install.ps1."
    }
    Refresh-ProcessPath
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
  Refresh-ProcessPath
  if (-not (Have "git")) { Die "git is required. Install Git for Windows, then rerun. If winget just installed it, open a new PowerShell window and rerun this installer." }
  if (-not (Have "node")) { Die "Node.js >=20 is required. Install the current Node LTS from https://nodejs.org, then rerun. If winget just installed it, open a new PowerShell window and rerun this installer." }
  if ((NodeMajor) -lt 20) { Die "Node.js >=20 is required; found $(& (Tool "node") -v). Install a current Node LTS, then rerun." }
  if (-not (Have "npm")) { Die "npm is required and should come with Node.js." }
  if (-not (HavePython)) { Die "Python 3 is required for common project tasks. Install Python 3, then rerun." }
}

function Ensure-Pnpm {
  $null = Ensure-NpmGlobalBinOnPath
  if (Have "pnpm") { return }

  if ((-not (Is-Windows)) -and (Have "corepack")) {
    try {
      & (Tool "corepack") enable
      & (Tool "corepack") prepare "pnpm@$PnpmVersion" --activate
    } catch {
      Warn "corepack could not activate pnpm; falling back to npm install -g."
    }
  } elseif ((Is-Windows) -and (Have "corepack")) {
    # `corepack enable` writes shims into C:\Program Files\nodejs and commonly fails without
    # elevation. A user-level npm global install avoids the admin prompt and PowerShell .ps1 policy.
    Say "Installing pnpm with npm on Windows (avoids system-level Corepack shims)."
  }

  if (-not (Have "pnpm")) {
    Say "Installing pnpm@$PnpmVersion with npm..."
    & (Tool "npm") install -g "pnpm@$PnpmVersion"
    $null = Ensure-NpmGlobalBinOnPath -PersistUser
    if ($LASTEXITCODE -ne 0) { Die "npm could not install pnpm." }
  }
}

function Get-NpmGlobalBin {
  if (-not (Have "npm")) { return $null }
  try {
    $prefix = (& (Tool "npm") prefix -g).Trim()
    if ([string]::IsNullOrWhiteSpace($prefix)) { return $null }
    if (Is-Windows) { return $prefix }
    return Join-Path $prefix "bin"
  } catch {
    return $null
  }
}

function Ensure-NpmGlobalBinOnPath([switch]$PersistUser) {
  $bin = Get-NpmGlobalBin
  if ([string]::IsNullOrWhiteSpace($bin)) { return $null }
  Ensure-PathContains $bin -PersistUser:$PersistUser
  return $bin
}

function Remove-PowerShellShim([string]$Name) {
  if (-not (Is-Windows)) { return }
  $npmBin = Ensure-NpmGlobalBinOnPath -PersistUser
  if ([string]::IsNullOrWhiteSpace($npmBin)) { return }
  $ps1 = Join-Path $npmBin "$Name.ps1"
  $cmd = Join-Path $npmBin "$Name.cmd"
  if ((Test-Path $ps1) -and (Test-Path $cmd)) {
    Remove-Item -Force $ps1
    Say "Removed $ps1 so PowerShell can launch $Name through $Name.cmd under restricted execution policy."
  }
}

function Verify-QuorumCommand {
  $npmBin = if (Is-Windows) {
    Ensure-NpmGlobalBinOnPath -PersistUser
  } else {
    Ensure-NpmGlobalBinOnPath
  }

  if (Have "quorum") {
    $output = & (Tool "quorum") --version 2>&1
    $exitCode = $LASTEXITCODE
    $version = (($output | Out-String).Trim())
    if ($null -eq $exitCode -or $exitCode -eq 0) {
      if ([string]::IsNullOrWhiteSpace($version)) {
        Say "  quorum command available"
      } else {
        Say "  quorum $version"
      }
      return
    }
    $detail = if ([string]::IsNullOrWhiteSpace($version)) { "no output" } else { $version }
    Die "Quorum was linked, but `quorum --version` failed: $detail"
  }

  $hint = $null
  if (-not [string]::IsNullOrWhiteSpace($npmBin)) {
    $hint = Join-Path $npmBin $(if (Is-Windows) { "quorum.cmd" } else { "quorum" })
  }
  if ($hint -and (Test-Path $hint)) {
    Warn "Quorum was linked at $hint, but PowerShell cannot find it on PATH yet. Open a new PowerShell window and run `quorum`, or run `"$hint`" directly."
    return
  }

  $pathHint = if ($npmBin) { $npmBin } else { "the npm global bin directory" }
  Die "Quorum linked, but the `quorum` command is not on PATH. Add $pathHint to PATH, open a new PowerShell window, and rerun this installer."
}

Refresh-ProcessPath
Install-SystemPackages
Verify-Prerequisites
Ensure-Pnpm

Say "Prerequisites:"
Say "  node $(& (Tool "node") -v)"
Say "  npm $(& (Tool "npm") -v)"
Say "  pnpm $(& (Tool "pnpm") -v)"
Say "  git $((& (Tool "git") --version) -replace '^git version ', '')"
Say "  python $(PythonVersion)"
if (Is-Windows) {
  Say "  Windows Credential Manager available (API-key storage)"
} else {
  Say "  Windows Credential Manager available when run on Windows (API-key storage)"
}

if (Test-Path (Join-Path $Dir ".git")) {
  Say "Updating $Dir..."
  & (Tool "git") -C $Dir pull --ff-only
  if ($LASTEXITCODE -ne 0) { Die "git pull failed for $Dir." }
} else {
  Say "Cloning into $Dir..."
  & (Tool "git") clone $Repo $Dir
  if ($LASTEXITCODE -ne 0) { Die "git clone failed." }
}

Push-Location $Dir
try {
  & (Tool "pnpm") install
  if ($LASTEXITCODE -ne 0) { Die "pnpm install failed." }
  & (Tool "pnpm") build
  if ($LASTEXITCODE -ne 0) { Die "pnpm build failed." }
  & (Tool "pnpm") --filter quorum exec (Tool "npm") link
  if ($LASTEXITCODE -ne 0) {
    Push-Location (Join-Path $Dir "packages\cli")
    try {
      & (Tool "npm") link
      if ($LASTEXITCODE -ne 0) { Die "npm link failed." }
    } finally {
      Pop-Location
    }
  }
} finally {
  Pop-Location
}

Write-Host ""
Remove-PowerShellShim "quorum"
Verify-QuorumCommand
Say "✓ Installed. Next:"
Say "    quorum doctor          # see which models you're logged into"
Say "    quorum init            # scaffold a config in your project"
Say "    quorum start `"build me X`""
