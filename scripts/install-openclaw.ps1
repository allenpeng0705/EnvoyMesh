#!/usr/bin/env pwsh
# =============================================================================
# EnvoyMesh OpenClaw bootstrap (Windows / PowerShell)
#
# PowerShell twin of scripts/install-openclaw.sh. Prepares the bundled
# packages/openclaw for in-process gateway spawn. The full pnpm install +
# build runs in setup.ps1 step 4.
#
# Usage:
#   .\scripts\install-openclaw.ps1
#   .\scripts\install-openclaw.ps1 -LocalOpenClawPath C:\path\to\openclaw
#
# After this, run:
#   .\scripts\setup.ps1
# =============================================================================

[CmdletBinding()]
param(
    [string]$LocalOpenClawPath = ""
)

$ErrorActionPreference = "Stop"

$BinDir = "packages/openclaw-runtime/bin"
$SourceDir = "packages/openclaw"
$OpenClawRepo = "https://github.com/openclaw/openclaw.git"

function Write-RuntimeWrapper {
    if (-not (Test-Path $BinDir)) {
        New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    }
    $wrapper = @'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/../../openclaw"
exec pnpm exec tsx openclaw.mjs "$@"
'@
    Set-Content -Path (Join-Path $BinDir "openclaw") -Value $wrapper -Encoding UTF8
}

function Write-EntryBootstrap {
    param([string]$TargetDir)
    $dist = Join-Path $TargetDir "dist"
    if (-not (Test-Path $dist)) {
        New-Item -ItemType Directory -Force -Path $dist | Out-Null
    }
    $entry = @'
// EnvoyMesh bootstrap — re-exports the gateway from TS source.
export * from "../src/cli/run-main.ts";
'@
    Set-Content -Path (Join-Path $dist "entry.js") -Value $entry -Encoding UTF8
}

Write-Host "=== EnvoyMesh OpenClaw Bootstrap ===" -ForegroundColor Cyan
Write-Host ""

# ---- Preferred: bundled monorepo (packages/openclaw) ----
if ((Test-Path "$SourceDir/openclaw.mjs") -or (Test-Path "$SourceDir/package.json")) {
    Write-Host "[1/2] Bundled OpenClaw found at $SourceDir"
    Write-RuntimeWrapper
    if (-not (Test-Path "$SourceDir/dist/entry.js")) {
        Write-Host "  Creating dist/entry.js bootstrap..."
        Write-EntryBootstrap $SourceDir
    }
    Write-Host "  Runtime wrapper: $BinDir/openclaw" -ForegroundColor Green
    Write-Host "  setup.ps1 will pnpm install + build the gateway" -ForegroundColor Green
    Write-Host ""
    Write-Host "[2/2] ClawHub CLI (skill marketplace)..."
    $clawhubOk = $true
    try {
        npm install -g clawhub@latest 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { $clawhubOk = $false }
    } catch { $clawhubOk = $false }
    if ($clawhubOk) {
        Write-Host "  ClawHub installed — run: clawhub login" -ForegroundColor Green
    } else {
        Write-Host "  ClawHub optional — install later: npm i -g clawhub" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "OpenClaw bootstrap complete. Continue with: .\scripts\setup.ps1" -ForegroundColor Green
    exit 0
}

# ---- --local copy into packages/openclaw ----
if ($LocalOpenClawPath) {
    Write-Host "[1/3] Copying OpenClaw from --local $LocalOpenClawPath"
    if (Test-Path $LocalOpenClawPath) {
        if (Test-Path $SourceDir) {
            Remove-Item -Recurse -Force $SourceDir
        }
        $parent = Split-Path $SourceDir -Parent
        if (-not (Test-Path $parent)) {
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
        }
        Copy-Item -Recurse -Force $LocalOpenClawPath $SourceDir
        Write-RuntimeWrapper
        Write-EntryBootstrap $SourceDir
        Write-Host "  Copied to $SourceDir" -ForegroundColor Green
        exit 0
    }
    Write-Host "  Path not found: $LocalOpenClawPath" -ForegroundColor Red
    exit 1
}

# ---- PATH binary (standalone CLI, not used for bundled gateway) ----
Write-Host "[1/4] Checking OpenClaw on PATH..."
$openclawOnPath = Get-Command "openclaw" -ErrorAction SilentlyContinue
if ($openclawOnPath) {
    Write-Host "  openclaw on PATH at $($openclawOnPath.Source)" -ForegroundColor Green
    Write-Host "  Note: EnvoyMesh spawns gateway from packages/openclaw — clone it for full integration."
}

# ---- Clone source if missing ----
Write-Host "[2/4] Cloning OpenClaw source..."
if (-not (Test-Path $SourceDir)) {
    $cloneOk = $true
    try {
        git clone --depth 1 $OpenClawRepo $SourceDir 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { $cloneOk = $false }
    } catch { $cloneOk = $false }
    if (-not $cloneOk) {
        Write-Host "  Could not clone $OpenClawRepo" -ForegroundColor Red
        Write-Host ""
        Write-Host "  Try:"
        Write-Host "    git clone --depth 1 $OpenClawRepo packages/openclaw"
        Write-Host "    .\scripts\install-openclaw.ps1 -LocalOpenClawPath C:\path\to\openclaw"
        exit 1
    }
    Write-Host "  Cloned to $SourceDir" -ForegroundColor Green
} else {
    Write-Host "  $SourceDir already exists" -ForegroundColor Green
}

Write-RuntimeWrapper
Write-EntryBootstrap $SourceDir

# ---- Optional binary fallback (legacy) ----
Write-Host "[3/4] Optional binary download..."
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
}
$arch = "unsupported"
switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { $arch = "x64" }
    "ARM64" { $arch = "arm64" }
    default { $arch = "unsupported" }
}
$os = "windows"
if ($arch -ne "unsupported") {
    $binaryUrl = "https://github.com/openclaw/openclaw/releases/latest/download/openclaw-$os-$arch.exe"
    $tmpBin = Join-Path ([System.IO.Path]::GetTempPath()) "openclaw-standalone.exe"
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $binaryUrl -OutFile $tmpBin -ErrorAction Stop
        $destBin = Join-Path $BinDir "openclaw-standalone.exe"
        Move-Item -Force $tmpBin $destBin
        Write-Host "  Standalone binary at $destBin (EnvoyMesh uses pnpm wrapper instead)" -ForegroundColor Green
    } catch {
        Write-Host "  Optional binary download skipped (offline or no release)" -ForegroundColor Yellow
    }
}

Write-Host "[4/4] ClawHub CLI..."
$clawhubOk = $true
try {
    npm install -g clawhub@latest 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $clawhubOk = $false }
} catch { $clawhubOk = $false }
if ($clawhubOk) {
    Write-Host "  ClawHub installed" -ForegroundColor Green
} else {
    Write-Host "  ClawHub optional" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Bootstrap Complete ===" -ForegroundColor Green
Write-Host "Run .\scripts\setup.ps1 to install deps, copy the envoymesh extension, and build OpenClaw."
