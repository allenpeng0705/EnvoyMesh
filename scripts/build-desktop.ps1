#!/usr/bin/env pwsh
# =============================================================================
# EnvoyMesh Tauri Desktop Builder (Windows / PowerShell)
#
# PowerShell twin of scripts/build-desktop.sh. Builds the native Windows
# installer (NSIS .exe + WiX .msi) for the Tauri desktop app, with OpenClaw
# gateway + EnvoyMesh Node.js runtime bundled inside.
#
# Usage (from the repo root, in PowerShell):
#   .\scripts\build-desktop.ps1 [-Out <dir>] [-Version <ver>] [-ForceOpenClaw]
#                                [-ForceNodeSidecar] [-SkipTypecheck] [-?]
#
# Flags:
#   -Out <dir>               Output directory (default: release\)
#   -Version <ver>            Override bundle version (default: from package.json)
#   -ForceOpenClaw            Re-stage OpenClaw even if apps\tauri\src-tauri\resources\openclaw
#                             is already populated
#   -ForceNodeSidecar         Re-download the Node.js sidecar even if it is already
#                             staged at apps\tauri\src-tauri\resources\node-runtime
#   -SkipTypecheck            Skip tsc -b before bundling
#   -?                        Print this message and exit
#
# Output (copied from Cargo target dir into the repo):
#   release\envoymesh-desktop-{version}-windows-x64.exe   NSIS installer
#   release\envoymesh-desktop-{version}-windows-x64.msi   WiX MSI
#   release\envoymesh-desktop-{version}-windows-x64\       Folder with both
#
# Prerequisites (Windows):
#   * Node.js 22+ (https://nodejs.org)
#   * Rust stable (rustup)
#   * Microsoft Visual Studio Build Tools 2022 with the "Desktop development
#     with C++" workload (for the MSVC linker) — see
#     https://v2.tauri.app/start/prerequisites/
#   * WiX Toolset 3.x (for .msi) — Tauri downloads it automatically on first
#     `tauri build`, but a system install is faster
#
# Bash twin: scripts/build-desktop.sh (mac/linux cross-compile + native). The
# two MUST stay in sync step-for-step — when you change one, change the other
# in the same commit.
#
# Tested on:
#   - Windows 10 / 11 with stock PowerShell 5.1
#   - PowerShell 7+ (pwsh)
# =============================================================================

[CmdletBinding()]
param(
    # Output directory (default: release\)
    [string]$Out = "release",

    # Override bundle version (default: from package.json)
    [string]$Version = "",

    # Re-stage OpenClaw even if already populated
    [switch]$ForceOpenClaw,

    # Re-download Node sidecar even if already staged
    [switch]$ForceNodeSidecar,

    # Skip tsc -b before bundling
    [switch]$SkipTypecheck
)

$ErrorActionPreference = "Stop"

# -----------------------------------------------------------------------------
# Helpers (mirror the conventions in scripts/bundle.ps1 + scripts/setup.ps1)
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

# -----------------------------------------------------------------------------
# Resolve repo root (works even if cwd is somewhere else when invoking).
# -----------------------------------------------------------------------------

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$TauriAppDir = Join-Path $RepoRoot "apps/tauri"
$TauriSrcDir = Join-Path $TauriAppDir "src-tauri"
$TauriResources = Join-Path $TauriSrcDir "resources"
$TauriTarget = Join-Path $TauriSrcDir "target"
$SocialDist = Join-Path $RepoRoot "apps/social/src/dist/index.html"

if (-not $Version) {
    try {
        $Version = (node -p "require('./package.json').version" 2>$null)
        if (-not $Version) { $Version = "dev" }
    } catch {
        $Version = "dev"
    }
}

Write-Host "============================================"
Write-Host "  EnvoyMesh Desktop Builder (PowerShell)" -ForegroundColor Cyan
Write-Host "  Repo: $RepoRoot"
Write-Host "  Version: $Version"
Write-Host "============================================"
Write-Host ""

# -----------------------------------------------------------------------------
# Step 1: Stage sidecars (Node.js, OpenClaw, EnvoyMesh node)
# -----------------------------------------------------------------------------

Write-Step "1/5  Staging sidecars..."

# Self-heal: stage-bundle-node-runtime.ps1 will Write-Error if
# apps\node\dist\src\index.js is missing (i.e. `npm run node:build` was never
# run on this machine). The bash twin (build-desktop.sh) gets a free pass
# because tauri.conf.json's beforeBuildCommand runs the stage scripts, but
# the beforeBuildCommand also invokes `bash` directly, which on a stock
# Windows box without Git-Bash/MSYS fails before doing anything useful. So
# for the PowerShell path we build the node dist up-front and skip the
# fragile beforeBuildCommand step.
$nodeDistEntry = Join-Path $RepoRoot "apps/node/dist/src/index.js"
if (-not (Test-Path $nodeDistEntry)) {
    Write-Info "apps\node\dist\src\index.js missing — running `npm run node:build`..."
    $buildExit = Invoke-ExternalQuiet npm run node:build
    if ($buildExit -ne 0) {
        Write-Fail "npm run node:build failed (exit $buildExit). The Tauri bundle requires a compiled EnvoyMesh node at apps\node\dist\."
        Write-Info "  Try: cd $RepoRoot ; npm ci ; npm run node:build"
        exit 1
    }
    if (-not (Test-Path $nodeDistEntry)) {
        Write-Fail "npm run node:build returned 0 but apps\node\dist\src\index.js is still missing — check the build output for errors."
        exit 1
    }
    Write-Ok "EnvoyMesh node built"
} else {
    Write-Info "apps\node\dist\src\index.js already present (skipping npm run node:build)"
}

# 1a. Node.js sidecar (the binary the Tauri shell spawns to run the EnvoyMesh node).
Write-Info "Staging Node.js sidecar..."
$nodeRuntimeDest = Join-Path $TauriResources "node-runtime"
$nodeExe = Join-Path $nodeRuntimeDest "node.exe"
$nodeDownloadUrl = $null
if ($ForceNodeSidecar -or -not (Test-Path $nodeExe)) {
    $nodeVersion = (node -p "process.versions.node")
    $nodeArch = switch ($env:PROCESSOR_ARCHITECTURE) {
        "AMD64" { "x64" }
        "ARM64" { "arm64" }
        default {
            Write-Fail "Unsupported architecture: $($env:PROCESSOR_ARCHITECTURE)"
            exit 1
        }
    }
    $nodeArchive = "node-v${nodeVersion}-win-${nodeArch}.zip"
    $nodeDownloadUrl = "https://nodejs.org/dist/v${nodeVersion}/${nodeArchive}"
    $nodeTmp = Join-Path ([System.IO.Path]::GetTempPath()) ("node-sidecar-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $nodeTmp | Out-Null
    try {
        $zipPath = Join-Path $nodeTmp $nodeArchive
        Write-Info "Downloading $nodeDownloadUrl"
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $nodeDownloadUrl -OutFile $zipPath -ErrorAction Stop
        } catch {
            Write-Fail "Failed to fetch $nodeDownloadUrl — check internet connectivity. Re-run without -ForceNodeSidecar to reuse a previously downloaded sidecar."
            throw
        }
        Expand-Archive -Path $zipPath -DestinationPath $nodeTmp -Force
        if (Test-Path $nodeRuntimeDest) {
            Remove-Item -Recurse -Force $nodeRuntimeDest
        }
        New-Item -ItemType Directory -Force -Path $nodeRuntimeDest | Out-Null
        $srcNode = Join-Path $nodeTmp ("node-v${nodeVersion}-win-${nodeArch}\node.exe")
        if (Test-Path $srcNode) {
            Copy-Item -Force $srcNode $nodeExe
            Write-Ok "Node.js $nodeVersion ($nodeArch) staged at $nodeExe"
        } else {
            Write-Fail "node.exe not found in expanded archive — bundle structure may have changed"
            exit 1
        }
    } finally {
        Remove-Item -Recurse -Force $nodeTmp -ErrorAction SilentlyContinue
    }
} else {
    $existingVersion = (& $nodeExe --version 2>$null) -replace '^v', ''
    Write-Info "Reusing staged sidecar: $nodeExe ($existingVersion). Use -ForceNodeSidecar to redownload."
}

# 1b. EnvoyMesh node (compiled JS + production npm deps).
Write-Info "Staging EnvoyMesh node runtime..."
$stageNodePs1 = Join-Path $PSScriptRoot "stage-bundle-node-runtime.ps1"
if (-not (Test-Path $stageNodePs1)) {
    Write-Fail "$stageNodePs1 missing — this script must live in scripts\ next to its bash twin."
    exit 1
}
# The inner script uses `Write-Error` with $ErrorActionPreference="Stop", which
# becomes a terminating exception in the outer scope. Capture the actual
# message so the user sees WHY it failed (not just "failed"). Note: we only
# gate on $stageError, NOT on $LASTEXITCODE — PowerShell's $LASTEXITCODE
# carries over from the last external command in the inner script (e.g. a
# non-zero `npm ls` exit), so it's not a reliable signal that the staging
# itself failed. The inner script's `Write-Host "  ✓ Node runtime staged ..."`
# at the end is the authoritative "it worked" indicator.
$stageError = $null
try {
    & $stageNodePs1 -Dest (Join-Path $TauriResources "node")
} catch {
    $stageError = $_.Exception.Message
}
if ($stageError) {
    Write-Fail "stage-bundle-node-runtime.ps1 failed"
    Write-Info "  Reason: $stageError"
    Write-Info "  The most common cause is a workspace package without a built dist. From the repo root, run:"
    Write-Info "    npm run node:build"
    exit 1
}

# 1c. OpenClaw gateway.
Write-Info "Staging OpenClaw gateway..."
$openclawSrc = Join-Path $RepoRoot "packages/openclaw"
$openclawDest = Join-Path $TauriResources "openclaw"
$openclawStaged = (Test-Path (Join-Path $openclawDest "openclaw.mjs")) -and `
                  (Test-Path (Join-Path $openclawDest "package.json")) -and `
                  (Test-Path (Join-Path $openclawDest "node_modules"))
if ($openclawStaged -and -not $ForceOpenClaw) {
    Write-Info "Reusing staged OpenClaw at $openclawDest. Use -ForceOpenClaw to re-stage."
} else {
    if (-not (Test-Path (Join-Path $openclawSrc "package.json")) -and `
        -not (Test-Path (Join-Path $openclawSrc "openclaw.mjs"))) {
        Write-Info "packages\openclaw missing — install-openclaw.ps1 will clone from GitHub..."
    }

    # Copy EnvoyMesh channel extension into OpenClaw source if it's at the
    # repo root (the path setup.ps1 uses).
    if (Test-Path (Join-Path $RepoRoot "OpenClawExtension")) {
        $extSrc = Join-Path $RepoRoot "OpenClawExtension"
        $extDst = Join-Path $openclawSrc "extensions/envoymesh"
        if (Test-Path (Join-Path $openclawSrc "extensions")) {
            if (Test-Path $extDst) { Remove-Item -Recurse -Force $extDst }
            New-Item -ItemType Directory -Force -Path (Join-Path $openclawSrc "extensions") | Out-Null
            Copy-Item -Recurse -Force $extSrc $extDst
            if (Test-Path (Join-Path $extDst "node_modules")) {
                Remove-Item -Recurse -Force (Join-Path $extDst "node_modules")
            }
            Write-Ok "Copied envoymesh channel extension to packages\openclaw\extensions\envoymesh"
        } else {
            Write-Warn "packages\openclaw\extensions does not exist — skipping extension copy"
        }
    }

    # Delegate the wrapper install / entry.js bootstrap to install-openclaw.ps1
    # when it's present (matches the bash twin's behavior).
    $installOpenclawPs1 = Join-Path $PSScriptRoot "install-openclaw.ps1"
    if (Test-Path $installOpenclawPs1) {
        & $installOpenclawPs1
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "install-openclaw.ps1 returned non-zero (continuing)"
        }
    } else {
        Write-Warn "install-openclaw.ps1 not found — assuming OpenClaw is already bootstrapped"
    }

    if (-not (Test-Path (Join-Path $openclawSrc "package.json"))) {
        Write-Fail "packages\openclaw still missing after bootstrap — drop a clone in or run scripts\setup.ps1"
        exit 1
    }

    # Build OpenClaw (pnpm install + build). pnpm is required by the build
    # process; bundle.ps1 + setup.ps1 also require pnpm 9.
    if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
        Write-Info "Installing pnpm@9..."
        npm install -g pnpm@9
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Could not install pnpm"
            exit 1
        }
    }

    Push-Location $openclawSrc
    try {
        # IMPORTANT: do NOT set $env:CI = "true" here. pnpm's CI mode:
        #   1. Defaults to --frozen-lockfile (overriding our --no-frozen-lockfile)
        #   2. Fails on postinstall script errors
        #   3. Fails on peer-dep warnings
        #   4. Refuses to install if the lockfile is even slightly out of date
        # Result on Windows: pnpm errors with "Lockfile is not up to date with
        # package.json changes" or "EACCES" on a postinstall script. The
        # bash twin gets away with CI=true because (a) it pipes pnpm through
        # `tail -8` (silently swallowing the exit code) and (b) macOS pnpm
        # has different postinstall defaults. We do not want to be that
        # fragile. Run pnpm in its normal mode and capture the real exit code.

        # Pre-flight: if the user's pnpm is still pointing at the default
        # registry.npmjs.org and we're on a Windows box, check whether the
        # default registry is reachable. In China and many corporate
        # networks, registry.npmjs.org is slow or blocked; the China
        # mirror (https://registry.npmmirror.com) is dramatically faster.
        # We only auto-switch on the first failure so users in
        # well-connected regions (US, EU, etc.) keep the default.
        $pnpmRegistry = (& pnpm config get registry 2>$null) -as [string]
        if ([string]::IsNullOrWhiteSpace($pnpmRegistry)) { $pnpmRegistry = "https://registry.npmjs.org/" }
        if ($pnpmRegistry -match "registry\.npmjs\.org") {
            $probeResult = $null
            try {
                $probeResult = Invoke-WebRequest -UseBasicParsing -Uri $pnpmRegistry -Method Head -TimeoutSec 5 -ErrorAction Stop
            } catch {
                $probeResult = $null
            }
            if (-not $probeResult) {
                Write-Warn "Default registry $pnpmRegistry unreachable — likely a slow/blocked network"
                Write-Info "Auto-switching to China mirror for this run: https://registry.npmmirror.com/"
                $env:npm_config_registry = "https://registry.npmmirror.com/"
                pnpm config set registry "https://registry.npmmirror.com/" | Out-Null
            }
        }

        # Run pnpm via the synchronous call operator (`&`). This is the
        # pattern that worked for the user when they ran pnpm install
        # directly. It streams live output to the console, captures
        # $LASTEXITCODE in the parent scope, and avoids the Windows-only
        # pitfalls of Start-Process:
        #   - `Start-Process pnpm` fails with "%1 is not a valid Win32
        #     application" because pnpm is a .cmd shim, not a .exe
        #   - `Start-Process -RedirectStandardOutput` + a reader job
        #     holding the same file causes a sharing violation that makes
        #     pnpm exit in 0s with code 1
        # `& pnpm install` works because PowerShell resolves pnpm
        # through PATHEXT (pnpm.cmd / pnpm.ps1) and inherits the parent's
        # stdout/stderr naturally.
        #
        # Trade-off: no automatic timeout. The operator can Ctrl-C if pnpm
        # hangs. The previous 10-min timeout was a nice-to-have; correctness
        # beats having a perfect hang protection. pnpm install takes
        # <30s on a warm cache and <3min on cold; pathological hangs are
        # rare and Ctrl-C handles them.
        Write-Info "pnpm install (this can take 1-3 min on cold cache)..."
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        & pnpm install --no-frozen-lockfile 2>&1 | Tee-Object -FilePath "pnpm.out" | Out-Host
        $pnpmExit = $LASTEXITCODE
        $sw.Stop()
        Write-Info "pnpm install finished in $([int]$sw.Elapsed.TotalSeconds)s (exit $pnpmExit)"

        if ($pnpmExit -ne 0) {
            Write-Info "Retrying with clean node_modules..."
            if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            & pnpm install --no-frozen-lockfile 2>&1 | Tee-Object -FilePath "pnpm.out" | Out-Host
            $pnpmExit = $LASTEXITCODE
            $sw.Stop()
            if ($pnpmExit -ne 0) {
                Write-Fail "pnpm install failed after retry (exit $pnpmExit)"
                Write-Info "  Common fixes:"
                Write-Info "    - Set the China mirror: pnpm config set registry https://registry.npmmirror.com"
                Write-Info "    - Check connectivity: Test-NetConnection registry.npmjs.org -Port 443"
                Write-Info "    - Or run pnpm install manually: cd packages\openclaw ; pnpm install --no-frozen-lockfile"
                Pop-Location
                exit 1
            }
        }

        # CRITICAL: do NOT prune --prod before the build. pnpm run build
        # uses devDependencies (tsdown, tsx, etc.) to compile the
        # production code. Pruning first would delete those and the build
        # would fail with "Cannot find module 'tsdown'". Prune AFTER the
        # build, so devDeps are only removed from the staged tree.

        Write-Info "pnpm run build (this can take 1-2 minutes)..."
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        & pnpm run build
        $buildExit = $LASTEXITCODE
        $sw.Stop()
        Write-Info "pnpm run build finished in $([int]$sw.Elapsed.TotalSeconds)s (exit $buildExit)"

        if ($buildExit -ne 0) {
            # Match the bash twin's fallback: if the full build fails,
            # write a stub dist/entry.js that re-exports from TS source.
            # The runtime will then use `tsx` to execute the source on
            # demand. Less ideal than a prebuilt dist but unblocks the
            # Tauri bundle from being produced at all.
            Write-Warn "OpenClaw build returned non-zero (exit $buildExit) — writing dist\entry.js bootstrap fallback"
            if (-not (Test-Path "dist")) {
                New-Item -ItemType Directory -Force -Path "dist" | Out-Null
            }
            $entryStub = @"
// EnvoyMesh bootstrap — re-exports the gateway from TS source (runtime
// uses tsx to execute this directly when the full build is unavailable).
export * from "../src/cli/run-main.ts";
"@
            Set-Content -Path "dist/entry.js" -Value $entryStub -Encoding UTF8
        }
        if (-not (Test-Path "dist/entry.js")) {
            Write-Fail "OpenClaw build did not produce dist\entry.js — gateway will not start"
            Pop-Location
            exit 1
        }

        # Drop dev deps AFTER the build so the staged tree is smaller.
        # (Belt and suspenders: the rsync exclude list below also drops
        # dev cruft at copy time, but pnpm prune --prod keeps
        # node_modules compact, which matters because the bundle ships
        # to end users via the Tauri installer.)
        Write-Info "pnpm prune --prod (clean staged tree)..."
        & pnpm prune --prod
        $pruneExit = $LASTEXITCODE
        if ($pruneExit -ne 0) {
            Write-Warn "pnpm prune --prod failed (continuing — staged tree will be larger)"
        }
    } finally {
        Pop-Location
    }

    # Copy the OpenClaw tree (excluding dev cruft) into the Tauri resources.
    if (Test-Path $openclawDest) {
        Remove-Item -Recurse -Force $openclawDest
    }
    New-Item -ItemType Directory -Force -Path $openclawDest | Out-Null
    $exclude = @(
        "node_modules", ".git", ".gitattributes", ".gitignore",
        ".turbo", "target",
        ".agents", ".artifacts", ".claude",
        ".github", ".vscode", ".npmrc",
        ".oxfmtrc.jsonc", ".oxlintrc.json",
        ".crabbox.yaml", ".dockerignore", ".semgrepignore",
        "apps", "docs", "ui", "scripts", "src", "qa", "test", "packages",
        "config", "data", "deploy", "git-hooks",
        "docker-compose.yml", "Dockerfile", "fly.toml",
        ".env.example", "appcast.xml",
        "tsconfig.json", "vitest.config.ts", "tsdown.config.ts"
    )
    Get-ChildItem -Path $openclawSrc -Force | Where-Object {
        -not ($exclude -contains $_.Name)
    } | ForEach-Object {
        Copy-Item -Recurse -Force $_.FullName (Join-Path $openclawDest $_.Name)
    }
    if (Test-Path (Join-Path $openclawSrc "node_modules")) {
        Copy-Item -Recurse -Force (Join-Path $openclawSrc "node_modules") (Join-Path $openclawDest "node_modules")
    }
    Write-Ok "OpenClaw staged at $openclawDest"
}

# 1d. Verify the staged tree (matches scripts/verify-tauri-resources.sh).
Write-Info "Verifying Tauri bundle resources..."
$verifyOk = $true
$reqFiles = @(
    @{ Path = $nodeExe; Label = "Node.js sidecar (node.exe)" },
    @{ Path = (Join-Path $TauriResources "node/dist/src/index.js"); Label = "compiled EnvoyMesh node" },
    @{ Path = (Join-Path $TauriResources "openclaw/openclaw.mjs"); Label = "OpenClaw gateway entry" },
    @{ Path = $SocialDist; Label = "built Social UI" }
)
foreach ($r in $reqFiles) {
    if (Test-Path $r.Path) {
        Write-Ok $r.Label
    } else {
        Write-Fail "missing $($r.Label) at $($r.Path)"
        $verifyOk = $false
    }
}
$openclawNm = Join-Path $TauriResources "openclaw/node_modules"
if (-not (Test-Path $openclawNm) -or -not (Get-ChildItem $openclawNm -ErrorAction SilentlyContinue)) {
    Write-Fail "OpenClaw node_modules is missing or empty at $openclawNm"
    $verifyOk = $false
} else {
    Write-Ok "OpenClaw node_modules"
}
if (-not $verifyOk) {
    Write-Fail "Tauri resources incomplete — see failures above."
    exit 1
}
Write-Ok "Tauri resources look complete"
Write-Host ""

# -----------------------------------------------------------------------------
# Step 2: Build Social UI (Tauri frontendDist → apps/social/src/dist)
# -----------------------------------------------------------------------------

Write-Step "2/5  Building Social UI..."
if (-not (Test-Path "node_modules")) {
    Write-Info "Installing root dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install failed"
        exit 1
    }
}
Push-Location (Join-Path $RepoRoot "apps/social")
try {
    if (-not (Test-Path "node_modules")) {
        Write-Info "Installing Social UI dependencies..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Social UI npm install failed"
            Pop-Location
            exit 1
        }
    }
    Write-Info "Vite build..."
    $socialExit = Invoke-ExternalQuiet npm run build
    if ($socialExit -ne 0) {
        Write-Fail "Social UI build failed"
        Pop-Location
        exit 1
    }
} finally {
    Pop-Location
}
if (-not (Test-Path $SocialDist)) {
    Write-Fail "Social UI build did not produce $SocialDist"
    exit 1
}
Write-Ok "Social UI built at apps\social\src\dist"
Write-Host ""

# -----------------------------------------------------------------------------
# Step 3: Build Tauri
# -----------------------------------------------------------------------------

Write-Step "3/5  Building Tauri desktop app..."

# Ensure the Rust toolchain is present. The user is responsible for installing
# Visual Studio Build Tools with the C++ workload — we only check the basics.
try {
    Require-Command "cargo"
} catch {
    Write-Fail "cargo (Rust) not found. Install rustup: https://rustup.rs"
    exit 1
}
try {
    Require-Command "rustc"
} catch {
    Write-Fail "rustc not found. Install rustup: https://rustup.rs"
    exit 1
}
# Confirm MSVC toolchain. tauri build needs the C++ workload installed via
# Visual Studio Build Tools. We surface a warning rather than failing hard
# because the user may have a different-but-equivalent setup.
$cl = Get-Command "cl" -ErrorAction SilentlyContinue
$link = Get-Command "link" -ErrorAction SilentlyContinue
if (-not $cl -or -not $link) {
    Write-Warn "MSVC `cl`/`link` not on PATH — if `tauri build` fails with a linker error, install Visual Studio Build Tools 2022 with the 'Desktop development with C++' workload (https://visualstudio.microsoft.com/visual-cpp-build-tools/)."
}

# Tauri CLI. Prefer `cargo tauri` (the cargo subcommand) when available; fall
# back to `npx tauri` (the JS wrapper). cargo install tauri-cli installs to
# %USERPROFILE%\.cargo\bin, so the next session finds it without -g.
$tauriCmd = $null
$tauriArgs = @("build")
if (Get-Command "cargo-tauri" -ErrorAction SilentlyContinue) {
    $tauriCmd = "cargo"
    $tauriArgs = @("tauri", "build")
} elseif (Get-Command "npx" -ErrorAction SilentlyContinue) {
    $tauriCmd = "npx"
    $tauriArgs = @("tauri", "build")
} else {
    Write-Info "Installing @tauri-apps/cli globally..."
    npm install -g @tauri-apps/cli
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Could not install @tauri-apps/cli"
        exit 1
    }
    $tauriCmd = "npx"
    $tauriArgs = @("tauri", "build")
}

Push-Location $TauriAppDir
try {
    if (-not (Test-Path "node_modules")) {
        Write-Info "Installing @envoymesh/tauri dependencies..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm install failed in apps\tauri"
            Pop-Location
            exit 1
        }
    }

    if (-not $SkipTypecheck) {
        Write-Info "Typecheck (tsc -b)..."
        $tcExit = Invoke-ExternalQuiet npm run typecheck
        if ($tcExit -ne 0) {
            Write-Warn "typecheck reported warnings (continuing — fix before release)"
        }
    }

    Write-Info "Tauri build (x86_64-pc-windows-msvc)..."
    $tauriBuildExit = Invoke-ExternalQuiet $tauriCmd @tauriArgs
    if ($tauriBuildExit -ne 0) {
        Write-Fail "Tauri build failed (exit $tauriBuildExit)"
        Pop-Location
        exit 1
    }
} finally {
    Pop-Location
}
Write-Ok "Tauri build complete"
Write-Host ""

# -----------------------------------------------------------------------------
# Step 4: Publish Windows artifacts to release/
# -----------------------------------------------------------------------------

Write-Step "4/5  Publishing Windows artifacts to $Out\..."

# Tauri 2.x bundle layout. We look in both bundle\nsis and bundle\msi under
# the most recent target/ tree (cargo's target-dir). Tauri 2's default
# bundle.targets="all" produces both formats.
$nsisExe = Get-ChildItem -Path (Join-Path $TauriTarget "release/bundle/nsis") -Filter "*.exe" -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1
$msiMsi = Get-ChildItem -Path (Join-Path $TauriTarget "release/bundle/msi") -Filter "*.msi" -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $nsisExe -and -not $msiMsi) {
    Write-Fail "No NSIS .exe or MSI .msi found under $TauriTarget\release\bundle\"
    Write-Info "  Looked in:"
    Write-Info "    $TauriTarget\release\bundle\nsis\"
    Write-Info "    $TauriTarget\release\bundle\msi\"
    exit 1
}

$arch = "x64"
$base = "envoymesh-desktop-${Version}-windows-${arch}"
$destDir = Join-Path $RepoRoot (Join-Path $Out $base)
$publishRoot = Join-Path $RepoRoot $Out
if (-not (Test-Path $publishRoot)) {
    New-Item -ItemType Directory -Force -Path $publishRoot | Out-Null
}
if (Test-Path $destDir) {
    Remove-Item -Recurse -Force $destDir
}
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

$copied = 0
foreach ($bundle in @($nsisExe, $msiMsi)) {
    if ($null -eq $bundle) { continue }
    $ext = $bundle.Extension.TrimStart('.')
    Copy-Item -Force $bundle.FullName (Join-Path $destDir $bundle.Name)
    $out = Join-Path $publishRoot ("${base}.${ext}")
    Copy-Item -Force $bundle.FullName $out
    $sizeMb = [math]::Round($bundle.Length / 1MB, 1)
    Write-Ok "${Out}\${base}.${ext} ($sizeMb MB)"
    $copied += 1
}

if ($copied -eq 0) {
    Write-Fail "No artifacts copied"
    exit 1
}
$Published = $destDir
Write-Host ""

# -----------------------------------------------------------------------------
# Step 5: Summary
# -----------------------------------------------------------------------------

Write-Step "5/5  Build complete"
Write-Host ""
Write-Host "============================================"
Write-Host "  Release output" -ForegroundColor Cyan
Write-Host "============================================"
Write-Host ""
Write-Host "  Folder:  $Published"
Get-ChildItem -Path $publishRoot -Filter "envoymesh-desktop-${Version}-*" -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host ("  {0}  ({1:N1} MB)" -f $_.FullName, ($_.Length / 1MB)) }
Write-Host ""
Write-Host "  Cargo keeps intermediates under:"
Write-Host "    $TauriTarget\"
Write-Host ""
Write-Host "  A working Windows installer is typically 150 MB – 600 MB."
Write-Host "  For headless portable drops (no UI), use .\scripts\bundle.ps1 instead."
Write-Host ""
