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
#   .\scripts\setup.ps1
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

# -----------------------------------------------------------------------------
# Resolve repo root (script may live anywhere; jump to the caller's cwd).
# -----------------------------------------------------------------------------

$RepoRoot = (Get-Location).Path
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

if (Test-Path "packages/openclaw/node_modules") {
    Write-Info "Removing stale packages/openclaw/node_modules..."
    Remove-Item -Recurse -Force "packages/openclaw/node_modules" -ErrorAction SilentlyContinue
}
$entryExists = $false
if (Test-Path "packages/openclaw/dist/entry.js") { $entryExists = $true }
if ((Test-Path "packages/openclaw/dist") -and -not $entryExists) {
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
$pnpmVersion = (pnpm -v 2>$null)
if ($LASTEXITCODE -ne 0) { $pnpmVersion = "?" }
Write-Ok "node $(node -v), pnpm $pnpmVersion"

# -----------------------------------------------------------------------------
# Step 2: EnvoyMesh dependencies
# -----------------------------------------------------------------------------

Write-Step "2/6  Installing EnvoyMesh dependencies..."

npm install
if ($LASTEXITCODE -ne 0) {
    Write-Fail "npm install failed"
    exit 1
}
Write-Ok "EnvoyMesh dependencies installed"

# -----------------------------------------------------------------------------
# Step 3: OpenClaw bootstrap + extension copy
# -----------------------------------------------------------------------------

Write-Step "3/6  OpenClaw bootstrap..."

# If packages/openclaw is missing, try the submodule first, then the local path.
if (-not (Test-Path "packages/openclaw/openclaw.mjs") -and -not (Test-Path "packages/openclaw/package.json")) {
    Write-Info "packages/openclaw missing — initializing submodule or clone..."
    git submodule update --init packages/openclaw 2>$null | Out-Null
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
} else {
    Write-Info "install-openclaw.ps1 not found — skipping wrapper"
}

Write-Info "Installing EnvoyMesh channel extension..."
if ((Test-Path "packages/openclaw/extensions") -and (Test-Path "OpenClawExtension")) {
    $extDir = "packages/openclaw/extensions/envoymesh"
    if (Test-Path $extDir) {
        Remove-Item -Recurse -Force $extDir
    }
    Copy-Item -Recurse -Force "OpenClawExtension" $extDir
    if (Test-Path "$extDir/node_modules") {
        Remove-Item -Recurse -Force "$extDir/node_modules"
    }
    Write-Ok "Extension copied to $extDir"
} else {
    Write-Warn "Skipping extension copy (packages/openclaw/extensions or OpenClawExtension missing)"
}

# -----------------------------------------------------------------------------
# Step 4: Build OpenClaw gateway
# -----------------------------------------------------------------------------

if ($SkipOpenClawBuild) {
    Write-Step "4/6  Building OpenClaw gateway (SKIPPED — -SkipOpenClawBuild)"
} elseif (-not (Test-Path "packages/openclaw/package.json")) {
    Write-Step "4/6  Building OpenClaw gateway..."
    Write-Warn "packages/openclaw not found — EnvoyAI will use native LLM fallback only"
    Write-Info "Fix: git submodule update --init packages/openclaw"
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
    $pnpmlog = pnpm install --no-frozen-lockfile 2>&1 | Select-Object -Last 5
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Retrying with clean node_modules..."
        if (Test-Path "node_modules") {
            Remove-Item -Recurse -Force "node_modules"
        }
        pnpm install --no-frozen-lockfile 2>&1 | Select-Object -Last 5 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "pnpm install failed"
            Pop-Location
            exit 1
        }
    }

    if (-not (Test-Path "node_modules/@pierre/diffs")) {
        Write-Info "Installing @pierre/diffs (fallback)..."
        npm install @pierre/diffs --save-dev 2>&1 | Select-Object -Last 2 | Out-Null
    }

    # Generate the bundled-channel-config metadata. We use a throwaway
    # GIT_INDEX_FILE so the untracked envoymesh extension is visible to
    # OpenClaw's `git ls-files` walk — without modifying OpenClaw's own
    # git state.
    Write-Info "Generating channel metadata (envoymesh)..."
    if (Test-Path "extensions/envoymesh") {
        $tmpIdx = [System.IO.Path]::GetTempFileName()
        try {
            $env:GIT_INDEX_FILE = $tmpIdx
            $readTreeOk = $true
            git read-tree HEAD 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { $readTreeOk = $false }
            if ($readTreeOk) {
                git add extensions/envoymesh 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) { $readTreeOk = $false }
            }
            $metaLog = pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts 2>&1 | Select-Object -Last 3
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "Metadata generation failed — extension may still work at runtime"
            }
        } finally {
            Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
            Remove-Item -Force $tmpIdx -ErrorAction SilentlyContinue
        }
    } else {
        pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts 2>&1 | Select-Object -Last 3 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Metadata generation failed — extension may still work at runtime"
        }
    }

    Write-Info "Building..."
    pnpm run build 2>&1 | Select-Object -Last 8 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Full build failed — creating tsx bootstrap..."
        if (-not (Test-Path "dist")) {
            New-Item -ItemType Directory -Force -Path "dist" | Out-Null
        }
        $entryStub = @"
// EnvoyMesh bootstrap — re-exports the gateway from TS source.
export * from "../src/cli/run-main.ts";
"@
        Set-Content -Path "dist/entry.js" -Value $entryStub -Encoding UTF8
    }

    if (Test-Path "dist/entry.js") {
        Write-Ok "dist/entry.js ready"
    } else {
        Write-Fail "dist/entry.js missing — gateway will not start"
    }

    $metaFile = "src/config/bundled-channel-config-metadata.generated.ts"
    if ((Test-Path $metaFile) -and (Select-String -Path $metaFile -Pattern '"envoymesh"' -SimpleMatch -Quiet)) {
        Write-Ok "envoymesh channel in bundled metadata"
    } else {
        Write-Warn "envoymesh not in metadata — run from packages\openclaw: pnpm exec tsx scripts\generate-bundled-channel-config-metadata.ts"
    }

    # Smoke-test the gateway + envoymesh webhook on a free high port.
    Write-Info "Smoke-testing gateway webhook..."
    $gwState = Join-Path ([System.IO.Path]::GetTempPath()) ("envoymesh-gateway-smoke-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $gwState | Out-Null
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
    Set-Content -Path (Join-Path $gwState "openclaw.json") -Value $gwConfig -Encoding UTF8
    $smokePort = 18799
    $env:OPENCLAW_STATE_DIR = $gwState
    $env:OPENCLAW_CONFIG_PATH = (Join-Path $gwState "openclaw.json")
    $env:OPENCLAW_BUNDLED_PLUGINS_DIR = (Resolve-Path "extensions").Path
    $env:ENVOYMESH_BRIDGE_URL = "http://127.0.0.1:3031/bridge/send"
    $env:CI = "true"
    $gwProc = Start-Process -FilePath "pnpm" -ArgumentList @("exec","tsx","openclaw.mjs","gateway","--port",$smokePort,"--bind","loopback","--auth","none","--allow-unconfigured") -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $gwState "gw.out.log") -RedirectStandardError (Join-Path $gwState "gw.err.log")
    $gwOk = $false
    for ($i = 1; $i -le 45; $i++) {
        try {
            $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Method POST -Uri "http://127.0.0.1:$smokePort/webhook/envoymesh" -ContentType "application/json" -Body "{}" -ErrorAction Stop
            $code = [int]$resp.StatusCode
        } catch {
            $code = 0
        }
        if ($code -ne 0 -and $code -ne 404) {
            Write-Ok "Gateway webhook responded (HTTP $code)"
            $gwOk = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $gwOk) {
        Write-Warn "Webhook smoke test timed out — check packages\openclaw build logs"
    }
    # Tear down the smoke-test gateway. Stop-Process is best-effort.
    try { Stop-Process -Id $gwProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Milliseconds 500
    Remove-Item -Recurse -Force $gwState -ErrorAction SilentlyContinue

    Pop-Location
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
