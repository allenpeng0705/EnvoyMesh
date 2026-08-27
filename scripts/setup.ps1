#!/usr/bin/env pwsh
# =============================================================================
# EnvoyMesh Unified Setup (Windows / PowerShell)
#
# This is the PowerShell twin of scripts/setup.sh. The two scripts MUST stay
# in sync step-for-step — when you change one, change the other. Both aim to
# produce a working:
#
#   * EnvoyMesh home node (apps/node)
#   * Built-in OpenClaw (EnvoyAI) gateway in packages/openclaw
#   * envoymesh channel extension copied into the OpenClaw extensions tree
#   * Default bridge-config.json if none exists
#   * A typecheck pass on packages/api + apps/node
#
# Usage (from the repo root, in PowerShell):
#   .\scripts\setup.ps1 [-LocalOpenClawPath <path>] [-SkipOpenClawBuild] [-SkipTypecheck] [-?]
#
# Flags (see docs/setup-scripts.md for the full reference):
#   -LocalOpenClawPath <path>   Use a local OpenClaw checkout instead of
#                                cloning from GitHub (forwarded to
#                                install-openclaw.ps1). Only consulted when
#                                packages/openclaw is missing.
#   -SkipOpenClawBuild          Skip pnpm install + build + smoke for OpenClaw
#                                (step 4). Useful for fast re-runs once the
#                                build is already verified.
#   -SkipTypecheck              Skip the final TypeScript typecheck (step 6).
#   -?                          Print this message and exit.
#
# After setup:
#   npm run node:dev     # starts bridge :3031 + OpenClaw gateway :18789 + EnvoyAI
#   npm run social:dev   # Social UI (terminal 2)
#
# Tested on:
#   - Windows 10 / 11 with stock PowerShell 5.1
#   - PowerShell 7+ (pwsh)
# =============================================================================

[CmdletBinding()]
param(
    # Path to a local checkout of openclaw (mirrors install-openclaw.sh --local).
    # If provided and packages/openclaw is missing, it is copied in.
    [string]$LocalOpenClawPath = "",

    # Skip the long OpenClaw build (pnpm install + metadata + build + smoke).
    # Useful for quick smoke tests or when the gateway is not needed.
    [switch]$SkipOpenClawBuild,

    # Skip the TypeScript typecheck at the end.
    [switch]$SkipTypecheck
)

$ErrorActionPreference = "Stop"

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "[$Message]" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host "  $Message"
}

function Write-Ok {
    param([string]$Message)
    Write-Host "  ✓ $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  ⚠ $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  ✗ $Message" -ForegroundColor Red
}

function Require-Command {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        Write-Fail "$Name not found in PATH. Install $Name and re-run."
        throw "$Name-missing"
    }
    return $cmd
}

# Run a command, capture exit code, print stderr on failure.
# Returns $true on success, $false on failure. Does NOT throw.
function Invoke-Step {
    param(
        [string]$Message,
        [scriptblock]$Block
    )
    Write-Info $Message
    try {
        & $Block | Out-Null
        if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
            return $false
        }
        return $true
    } catch {
        Write-Warn "$Message failed: $_"
        return $false
    }
}

function Test-OpenClawGatewayReady {
    param([string]$Root = ".")
    $ocDir = Join-Path $Root "packages/openclaw"
    if (-not (Test-Path (Join-Path $ocDir "openclaw.mjs"))) {
        return $false
    }
    if (-not (Test-Path (Join-Path $ocDir "node_modules/tsx/dist/cli.mjs"))) {
        return $false
    }
    # Must match apps/node validateOpenClawTree — a stub entry.js alone is not enough.
    if (-not (Test-Path (Join-Path $ocDir "dist/config/config.js"))) {
        return $false
    }
    $entry = Join-Path $ocDir "dist/entry.js"
    if (-not (Test-Path $entry)) {
        return $false
    }
    $entryHead = Get-Content -Path $entry -TotalCount 1 -ErrorAction SilentlyContinue
    if ($entryHead -and ($entryHead -match "EnvoyMesh bootstrap")) {
        return $false
    }
    if (-not (Test-Path (Join-Path $ocDir "extensions/envoymesh/index.js"))) {
        return $false
    }
    return $true
}

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

# Git writes CRLF hints to stderr; PowerShell treats that as a terminating error.
function Invoke-GitQuiet {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & git -c core.autocrlf=false -c core.safecrlf=false @GitArgs 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

# pnpm/npm often log to stderr; suppress NativeCommandError noise on Windows PowerShell.
function Invoke-ExternalQuiet {
    param(
        [string]$Exe,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$ToolArgs
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & $Exe @ToolArgs 2>&1 | Out-Null
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

# Pick a random free loopback port in the user-private range. Used by the
# gateway smoke test so we never collide with the historical hard-coded
# port (something else may already be listening there).
function Get-FreeLoopbackPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

# -----------------------------------------------------------------------------
# Resolve repo root from this script (works even if cwd is packages/openclaw).
# -----------------------------------------------------------------------------

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

Write-Host "============================================"
Write-Host "  EnvoyMesh Setup (PowerShell)" -ForegroundColor Cyan
Write-Host "  Repo: $RepoRoot"
Write-Host "============================================"
Write-Host ""

# -----------------------------------------------------------------------------
# Step 0: Clean stale artifacts
# -----------------------------------------------------------------------------

Write-Step "0/6  Cleaning up stale artifacts..."

# packages/openclaw is pnpm-managed separately (not an npm workspace). Keep node_modules
# across setup re-runs; drop an incomplete dist (missing config.js or stub entry).
$ocDistIncomplete = $false
if (Test-Path "packages/openclaw/dist") {
    if (-not (Test-Path "packages/openclaw/dist/config/config.js")) {
        $ocDistIncomplete = $true
    } elseif (Test-Path "packages/openclaw/dist/entry.js") {
        $entryHead = Get-Content -Path "packages/openclaw/dist/entry.js" -TotalCount 1 -ErrorAction SilentlyContinue
        if ($entryHead -and ($entryHead -match "EnvoyMesh bootstrap")) {
            $ocDistIncomplete = $true
        }
    }
}
if ($ocDistIncomplete) {
    Write-Info "Removing incomplete packages/openclaw/dist..."
    Remove-Item -Recurse -Force "packages/openclaw/dist" -ErrorAction SilentlyContinue
}

# /tmp equivalents on Windows: TEMP is per-user, not shared. We don't try to
# clean up other users' temp dirs (no equivalent of `rm /tmp/envoymesh-gateway-*`).
# The macOS/Linux version scrubs /tmp/envoymesh-gateway-* which only exists on
# those platforms.

# -----------------------------------------------------------------------------
# Step 1: Node.js + pnpm
# -----------------------------------------------------------------------------

Write-Step "1/6  Checking toolchain..."

try {
    Require-Command "node"
} catch {
    Write-Fail "Node.js not found. Install Node 22+ first: https://nodejs.org"
    exit 1
}

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 22) {
    Write-Warn "Node $nodeMajor detected — Node 22+ recommended"
}

if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
    Write-Info "Installing pnpm..."
    npm install -g pnpm
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Could not install pnpm"
        exit 1
    }
}
# pnpm warns on npm "workspaces" in root package.json — check version outside repo root.
$pnpmVersion = "?"
Push-Location $env:TEMP
try {
    $pnpmVersion = (pnpm -v 2>$null)
    if ($LASTEXITCODE -ne 0) { $pnpmVersion = "?" }
} finally {
    Pop-Location
}
Write-Ok "node $(node -v), pnpm $pnpmVersion"

# -----------------------------------------------------------------------------
# Step 2: EnvoyMesh dependencies
# -----------------------------------------------------------------------------

Write-Step "2/6  Installing EnvoyMesh dependencies..."

pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Fail "pnpm install failed"
    exit 1
}
Write-Ok "EnvoyMesh dependencies installed"

# -----------------------------------------------------------------------------
# Step 3: OpenClaw bootstrap + extension copy
# -----------------------------------------------------------------------------

Write-Step "3/6  OpenClaw bootstrap..."

# If packages/openclaw is missing, install-openclaw.ps1 clones from GitHub (no git submodule in this repo).
if (-not (Test-Path "packages/openclaw/openclaw.mjs") -and -not (Test-Path "packages/openclaw/package.json")) {
    Write-Info "packages/openclaw missing — install-openclaw will clone from GitHub..."
}

# If a local path was provided, copy it in (mirrors install-openclaw.sh --local).
if ($LocalOpenClawPath -and -not (Test-Path "packages/openclaw/package.json")) {
    if (Test-Path $LocalOpenClawPath) {
        Write-Info "Copying OpenClaw from --local $LocalOpenClawPath"
        if (Test-Path "packages/openclaw") {
            Remove-Item -Recurse -Force "packages/openclaw"
        }
        New-Item -ItemType Directory -Force -Path (Split-Path "packages/openclaw") | Out-Null
        Copy-Item -Recurse -Force $LocalOpenClawPath "packages/openclaw"
        Write-Ok "Copied to packages/openclaw"
    } else {
        Write-Fail "Local OpenClaw path not found: $LocalOpenClawPath"
        exit 1
    }
}

# Delegate the runtime wrapper + entry.js bootstrap to install-openclaw.ps1 if
# present, otherwise inline the same logic (mirrors bash sub-call).
$installPs1 = Join-Path $PSScriptRoot "install-openclaw.ps1"
if (Test-Path $installPs1) {
    $installArgs = @{}
    if ($LocalOpenClawPath) { $installArgs["LocalOpenClawPath"] = $LocalOpenClawPath }
    & $installPs1 @installArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "install-openclaw.ps1 failed"
        exit 1
    }
} else {
    Write-Info "install-openclaw.ps1 not found — skipping wrapper"
}

if (-not (Test-Path "packages/openclaw/package.json")) {
    Write-Fail "packages/openclaw missing after bootstrap — check network and re-run setup"
    exit 1
}

# EnvoyMesh gateway spawn validates extensions/envoymesh/index.js (compiled).
# Copying OpenClawExtension/*.ts alone is not enough — compile like
# scripts/stage-openclaw-envoymesh-extension.sh.
# Must run AFTER packages/openclaw `pnpm install` so esbuild is available.
# Note: never invoke a relative *.cmd path with `&` — PowerShell treats
# `packages\...` as a module name. Always use absolute paths + `node …/esbuild`.
function Install-EnvoyMeshOpenClawExtension {
    param([string]$OpenClawRoot)
    $repoRoot = (Get-Location).Path
    $ocRoot = if ([System.IO.Path]::IsPathRooted($OpenClawRoot)) {
        $OpenClawRoot
    } else {
        Join-Path $repoRoot $OpenClawRoot
    }
    $extSrc = Join-Path $repoRoot "OpenClawExtension"
    if (-not (Test-Path $extSrc)) {
        Write-Warn "OpenClawExtension/ missing — cannot install envoymesh channel"
        return $false
    }
    if (-not (Test-Path (Join-Path $ocRoot "extensions"))) {
        Write-Warn "$ocRoot/extensions missing — cannot install envoymesh channel"
        return $false
    }

    $extDir = Join-Path $ocRoot "extensions\envoymesh"
    if (Test-Path $extDir) {
        Remove-Item -Recurse -Force $extDir
    }
    Copy-Item -Recurse -Force $extSrc $extDir
    if (Test-Path (Join-Path $extDir "node_modules")) {
        Remove-Item -Recurse -Force (Join-Path $extDir "node_modules")
    }
    Get-ChildItem -Path $extDir -Recurse -Include "tsconfig.json","tsconfig.*.json",".oxlintrc.json",".oxfmtrc.jsonc" -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
    foreach ($drop in @("docs","examples","test","tests",".git")) {
        $p = Join-Path $extDir $drop
        if (Test-Path $p) { Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue }
    }

    $esbuildJs = Join-Path $ocRoot "node_modules\esbuild\bin\esbuild"
    $useNpx = -not (Test-Path $esbuildJs)

    Push-Location $extDir
    try {
        $inputs = @(Get-ChildItem -Path . -Filter "*.ts" -File | ForEach-Object { $_.Name })
        if (Test-Path "src") {
            $inputs += @(Get-ChildItem -Path "src" -Filter "*.ts" -File |
                Where-Object { $_.Name -notmatch '\.(test|e2e\.test|live\.test)\.ts$' } |
                ForEach-Object { Join-Path "src" $_.Name })
        }
        if ($inputs.Count -eq 0) {
            Write-Warn "No .ts sources in $extDir"
            return $false
        }
        $flags = @(
            "--bundle=false", "--format=esm", "--platform=node",
            "--outdir=.", "--out-extension:.js=.js", "--allow-overwrite",
            "--log-level=warning"
        )
        if ($useNpx) {
            Write-Info "Compiling envoymesh via npx esbuild (local esbuild not found yet)..."
            & npx --yes esbuild @inputs @flags
        } else {
            # Absolute path + node — avoids PowerShell "module 'packages'" trap on *.cmd
            & node -- $esbuildJs @inputs @flags
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "esbuild failed for envoymesh extension (exit $LASTEXITCODE)"
            return $false
        }
        Get-ChildItem -Path . -Recurse -Filter "*.ts" -File | Remove-Item -Force
        $pkg = Join-Path $extDir "package.json"
        if (Test-Path $pkg) {
            # UTF-8 *without BOM* — Windows PowerShell 5.1's -Encoding UTF8
            # writes a BOM that breaks OpenClaw's JSON.parse (plugins:assets:build).
            $raw = Get-Content -Raw -Path $pkg
            $raw = $raw -replace '\./index\.ts', './index.js' -replace '\./setup-entry\.ts', './setup-entry.js'
            Write-Utf8NoBom -Path $pkg -Content ($raw.TrimEnd() + "`n")
        }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path (Join-Path $extDir "index.js"))) {
        Write-Warn "envoymesh index.js missing after compile"
        return $false
    }

    $distParent = Join-Path $ocRoot "dist\extensions"
    $distExt = Join-Path $distParent "envoymesh"
    if (-not (Test-Path $distParent)) {
        New-Item -ItemType Directory -Force -Path $distParent | Out-Null
    }
    if (Test-Path $distExt) {
        Remove-Item -Recurse -Force $distExt
    }
    Copy-Item -Recurse -Force $extDir $distExt

    if (Test-Path (Join-Path $ocRoot "dist-runtime")) {
        $rtParent = Join-Path $ocRoot "dist-runtime\extensions"
        if (-not (Test-Path $rtParent)) {
            New-Item -ItemType Directory -Force -Path $rtParent | Out-Null
        }
        $rtExt = Join-Path $rtParent "envoymesh"
        if (Test-Path $rtExt) { Remove-Item -Recurse -Force $rtExt }
        Copy-Item -Recurse -Force $extDir $rtExt
    }

    Write-Ok "envoymesh extension compiled -> $extDir (+ dist/extensions mirror)"
    return $true
}

Write-Info "EnvoyMesh channel extension will be compiled after OpenClaw pnpm install (needs esbuild)"

# -----------------------------------------------------------------------------
# Step 4: Build OpenClaw gateway
# -----------------------------------------------------------------------------

if ($SkipOpenClawBuild) {
    Write-Step "4/6  Building OpenClaw gateway (SKIPPED — -SkipOpenClawBuild)"
    if (-not (Test-OpenClawGatewayReady $RepoRoot)) {
        Write-Fail "OpenClaw tree incomplete after -SkipOpenClawBuild"
        Write-Info "Need dist/config/config.js + compiled extensions/envoymesh/index.js"
        Write-Info "Re-run without -SkipOpenClawBuild (or: cd packages/openclaw; pnpm run build)"
        exit 1
    }
    Write-Ok "OpenClaw gateway ready (packages/openclaw)"
} elseif (-not (Test-Path "packages/openclaw/package.json")) {
    Write-Step "4/6  Building OpenClaw gateway..."
    Write-Warn "packages/openclaw not found — EnvoyAI will use native LLM fallback only"
    Write-Info "Fix: .\scripts\install-openclaw.ps1"
    Write-Info "  or: git clone --depth 1 https://github.com/openclaw/openclaw.git packages/openclaw"
} else {
    Write-Step "4/6  Building OpenClaw gateway..."

    Push-Location "packages/openclaw"

    # Mirror: remove conflicting workspace pnpm store if present.
    if (Test-Path "../../.pnpm-store") {
        Write-Info "Removing conflicting workspace pnpm store..."
        Remove-Item -Recurse -Force "../../.pnpm-store" -ErrorAction SilentlyContinue
    }

    Write-Info "pnpm install..."
    $env:CI = "true"
    $pnpmExit = Invoke-ExternalQuiet pnpm install --no-frozen-lockfile
    if ($pnpmExit -ne 0) {
        Write-Warn "Retrying with clean node_modules..."
        if (Test-Path "node_modules") {
            Remove-Item -Recurse -Force "node_modules"
        }
        $pnpmExit = Invoke-ExternalQuiet pnpm install --no-frozen-lockfile
        if ($pnpmExit -ne 0) {
            Write-Fail "pnpm install failed"
            Pop-Location
            exit 1
        }
    }

    if (-not (Test-Path "node_modules/@pierre/diffs")) {
        Write-Info "Installing @pierre/diffs (fallback)..."
        Invoke-ExternalQuiet npm install @pierre/diffs --save-dev | Out-Null
    }

    # Compile envoymesh now that esbuild is installed under packages/openclaw.
    Pop-Location
    Write-Info "Installing EnvoyMesh channel extension (compiled index.js)..."
    if (-not (Install-EnvoyMeshOpenClawExtension -OpenClawRoot "packages/openclaw")) {
        Write-Warn "envoymesh extension install incomplete — EnvoyAI/OpenClaw may refuse to start"
    }
    Push-Location "packages/openclaw"

    # Generate the bundled-channel-config metadata. We use a throwaway
    # GIT_INDEX_FILE so the untracked envoymesh extension is visible to
    # OpenClaw's `git ls-files` walk — without modifying OpenClaw's own
    # git state.
    Write-Info "Generating channel metadata (envoymesh)..."
    if (Test-Path "extensions/envoymesh") {
        $tmpIdx = [System.IO.Path]::GetTempFileName()
        try {
            $env:GIT_INDEX_FILE = $tmpIdx
            $readTreeOk = Invoke-GitQuiet read-tree HEAD
            if ($readTreeOk) {
                $readTreeOk = Invoke-GitQuiet add extensions/envoymesh
            }
            $metaExit = Invoke-ExternalQuiet pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts
            if ($metaExit -ne 0) {
                Write-Warn "Metadata generation failed — extension may still work at runtime"
            }
        } finally {
            Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
            Remove-Item -Force $tmpIdx -ErrorAction SilentlyContinue
        }
    } else {
        $metaExit = Invoke-ExternalQuiet pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts
        if ($metaExit -ne 0) {
            Write-Warn "Metadata generation failed — extension may still work at runtime"
        }
    }

    Write-Info "Building..."
    $buildExit = Invoke-ExternalQuiet pnpm run build
    if ($buildExit -ne 0) {
        Write-Fail "OpenClaw pnpm run build failed"
        Write-Info "A stub dist/entry.js is NOT enough — EnvoyAI needs dist/config/config.js."
        Write-Info "Fix the build error (common on Windows: UTF-8 BOM in extensions/*/package.json),"
        Write-Info "then re-run .\scripts\setup.ps1"
        Pop-Location
        exit 1
    }

    if (-not (Test-Path "dist/config/config.js") -or -not (Test-Path "dist/entry.js")) {
        Write-Fail "OpenClaw build did not produce dist/config/config.js (+ dist/entry.js)"
        Write-Info "EnvoyAI will refuse to start until a full build succeeds."
        Pop-Location
        exit 1
    }
    Write-Ok "dist/entry.js + dist/config/config.js ready"

    # Re-install compiled envoymesh after OpenClaw build — `pnpm run build`
    # can wipe/refresh dist/ and leave extensions/envoymesh without index.js.
    Pop-Location
    Write-Info "Re-staging compiled envoymesh extension after OpenClaw build..."
    if (-not (Install-EnvoyMeshOpenClawExtension -OpenClawRoot "packages/openclaw")) {
        Write-Warn "Post-build envoymesh stage failed — check packages/openclaw/extensions/envoymesh/index.js"
    }
    Push-Location "packages/openclaw"

    $metaFile = "src/config/bundled-channel-config-metadata.generated.ts"
    if ((Test-Path $metaFile) -and (Select-String -Path $metaFile -Pattern '"envoymesh"' -SimpleMatch -Quiet)) {
        Write-Ok "envoymesh channel in bundled metadata"
    } else {
        Write-Warn "envoymesh not in metadata — run from packages\openclaw: pnpm exec tsx scripts\generate-bundled-channel-config-metadata.ts"
    }

    # Smoke-test the gateway + envoymesh webhook on a free high port.
    # Everything below is wrapped in try/finally so Ctrl-C, errors, or a
    # successful pass all tear the gateway down and restore the env vars
    # (CI, OPENCLAW_*, ENVOYMESH_BRIDGE_URL) we mutated.
    Write-Info "Smoke-testing gateway webhook..."
    $gwState = Join-Path ([System.IO.Path]::GetTempPath()) ("envoymesh-gateway-smoke-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $gwState | Out-Null
    $envBackup = [ordered]@{
        "CI" = $env:CI
        "OPENCLAW_STATE_DIR" = $env:OPENCLAW_STATE_DIR
        "OPENCLAW_CONFIG_PATH" = $env:OPENCLAW_CONFIG_PATH
        "OPENCLAW_BUNDLED_PLUGINS_DIR" = $env:OPENCLAW_BUNDLED_PLUGINS_DIR
        "ENVOYMESH_BRIDGE_URL" = $env:ENVOYMESH_BRIDGE_URL
    }
    $gwConfig = @"
{
  "gateway": { "auth": { "mode": "none" } },
  "channels": {
    "envoymesh": {
      "enabled": true,
      "bridgeUrl": "http://127.0.0.1:3031/bridge/send",
      "webhookPath": "/webhook/envoymesh",
      "dmPolicy": "open",
      "allowedOwnerIds": ["*"]
    }
  }
}
"@
    Write-Utf8NoBom -Path (Join-Path $gwState "openclaw.json") -Content ($gwConfig.TrimEnd() + "`n")
    $smokePort = Get-FreeLoopbackPort
    $env:OPENCLAW_STATE_DIR = $gwState
    $env:OPENCLAW_CONFIG_PATH = (Join-Path $gwState "openclaw.json")
    $env:OPENCLAW_BUNDLED_PLUGINS_DIR = (Resolve-Path "extensions").Path
    $env:ENVOYMESH_BRIDGE_URL = "http://127.0.0.1:3031/bridge/send"
    $env:CI = "true"
    $gwOut = Join-Path $gwState "gw.out.log"
    $gwErr = Join-Path $gwState "gw.err.log"
    $gwProc = $null
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    $nodeExe = if ($nodeCmd) { $nodeCmd.Source } else { $null }
    $tsxCli = Join-Path (Get-Location) "node_modules\tsx\dist\cli.mjs"
    $openclawMjs = Join-Path (Get-Location) "openclaw.mjs"
    if ($nodeExe -and (Test-Path $tsxCli) -and (Test-Path $openclawMjs)) {
        try {
            $gwProc = Start-Process -FilePath $nodeExe -ArgumentList @(
                $tsxCli,
                $openclawMjs,
                "gateway",
                "--port", "$smokePort",
                "--bind", "loopback",
                "--auth", "none",
                "--allow-unconfigured"
            ) -PassThru -NoNewWindow -RedirectStandardOutput $gwOut -RedirectStandardError $gwErr
        } catch {
            Write-Warn "Could not start gateway smoke process: $_"
        }
    } else {
        Write-Warn "Skipping gateway smoke start (node or tsx/openclaw.mjs missing)"
    }
    $gwOk = $false
    try {
    for ($i = 1; $i -le 45; $i++) {
        try {
            $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Method POST -Uri "http://127.0.0.1:$smokePort/webhook/envoymesh" -ContentType "application/json" -Body "{}" -ErrorAction Stop
            $code = [int]$resp.StatusCode
        } catch {
            $code = 0
        }
        if ($code -ne 0 -and $code -ne 404) {
            Write-Ok "Gateway webhook responded (HTTP $code on port $smokePort)"
            $gwOk = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $gwOk) {
        Write-Warn "Webhook smoke test timed out — check packages\openclaw build logs"
    }
    } finally {
        # Always tear down the gateway + temp state, then restore env.
        if ($gwProc -and -not $gwProc.HasExited) {
            try { Stop-Process -Id $gwProc.Id -Force -ErrorAction SilentlyContinue } catch {}
            Start-Sleep -Milliseconds 500
        }
        if (Test-Path $gwState) {
            Remove-Item -Recurse -Force $gwState -ErrorAction SilentlyContinue
        }
        foreach ($k in $envBackup.Keys) {
            $orig = $envBackup[$k]
            if ($null -eq $orig) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
            else                  { Set-Item -Path "Env:$k" -Value $orig }
        }
    }

    Pop-Location

    if (-not (Test-OpenClawGatewayReady $RepoRoot)) {
        Write-Fail "OpenClaw gateway not ready — need compiled dist/config/config.js,"
        Write-Info "dist/entry.js (not a stub), extensions/envoymesh/index.js, tsx, openclaw.mjs"
        exit 1
    }
    Write-Ok "OpenClaw gateway ready (packages/openclaw)"
}

# -----------------------------------------------------------------------------
# Step 5: Bridge config template
# -----------------------------------------------------------------------------

Write-Step "5/6  Bridge config template..."
$example = "apps/node/data/default/bridge-config.openclaw.example.json"
if (Test-Path $example) {
    Write-Ok "Example config: $example"
    Write-Info "  assistantAgentUrl -> built-in OpenClaw (EnvoyAI)  :18789/webhook/envoymesh"
    Write-Info "  agentUrl          -> Ext Agent (HomeClaw, etc.)     (your external webhook)"
    if (-not (Test-Path "apps/node/data/default/bridge-config.json")) {
        Copy-Item -Force $example "apps/node/data/default/bridge-config.json"
        Write-Ok "Created apps/node/data/default/bridge-config.json from example"
    } else {
        Write-Info "Existing bridge-config.json kept (add assistantAgentUrl if missing)"
    }
} else {
    Write-Warn "$example not found"
}

# -----------------------------------------------------------------------------
# Step 6: Typecheck
# -----------------------------------------------------------------------------

if ($SkipTypecheck) {
    Write-Step "6/6  TypeScript check (SKIPPED — -SkipTypecheck)"
} else {
    Write-Step "6/6  TypeScript check (packages/api + apps/node)..."
    $apiOk = $true
    $nodeOk = $true
    try {
        npm exec -w @envoymesh/api -- tsc -p tsconfig.json 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { $apiOk = $false }
    } catch { $apiOk = $false }
    try {
        npm exec -w @envoymesh/node -- tsc -p tsconfig.json 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { $nodeOk = $false }
    } catch { $nodeOk = $false }
    if ($apiOk -and $nodeOk) {
        Write-Ok "Core packages typecheck OK"
    } else {
        Write-Warn "Typecheck warnings — run: npm run typecheck"
    }
}

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------

Write-Host ""
Write-Host "============================================"
Write-Host "  Setup Complete" -ForegroundColor Green
Write-Host "============================================"
Write-Host ""
Write-Host "Architecture:"
Write-Host "  EnvoyAI (built-in)  -> OpenClaw gateway :18789  (auto-started by node)"
Write-Host "  Ext Agent (bridge)  -> agentUrl in bridge-config.json (HomeClaw, etc.)"
Write-Host "  Mesh tools          -> bridge :3031/bridge/execute-tool"
Write-Host ""
Write-Host "Start:"
Write-Host "  npm run node:dev     # terminal 1"
Write-Host "  npm run social:dev   # terminal 2"
Write-Host ""
Write-Host "Verify in node logs:"
Write-Host "  [openclaw] Built-in agent ready (EnvoyAI)"
Write-Host "  [bridge] HTTP on http://127.0.0.1:3031/bridge/send"
Write-Host ""