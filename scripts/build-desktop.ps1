#!/usr/bin/env pwsh
# =============================================================================
# EnvoyMesh Tauri Desktop Builder (Windows / PowerShell)
#
# PowerShell twin of scripts/build-desktop.sh. Builds the native Windows
# installer (NSIS .exe by default; WiX .msi is opt-in) for the Tauri desktop
# app, with OpenClaw gateway + EnvoyMesh Node.js runtime bundled inside.
#
# Feature packaging notes (family network / push / EnvoyGo l10n):
#   - Family network: ships in compiled apps/node + Social UI — no extra assets.
#   - Push (iOS APNs + Android FCM for EnvoyGo): stage-tauri-push-credentials.ps1
#     copies repo-root push-config.json + AuthKey_LKPCR48WHW.p8 +
#     serviceAccountKey.json into resources\node\ after node staging.
#     Default REQUIRE_PUSH_CREDENTIALS=1 — build fails if those secrets are
#     missing when push-config.json is present. Set
#     $env:REQUIRE_PUSH_CREDENTIALS="0" to allow packaging without push.
#   - EnvoyGo localization is Flutter-only (apps/envoygo) — not part of this
#     desktop bundle; Social i18n locales are included via npm run social:build.
#
# Usage (from the repo root, in PowerShell):
#   .\scripts\build-desktop.ps1 [-Out <dir>] [-Version <ver>] [-ForceOpenClaw]
#                                [-ForceNodeSidecar] [-SkipTypecheck]
#                                [-SkipMsi[:$false]] [-OpenClawExtensions <filter>]
#                                [-?]
#
# Flags:
#   -Out <dir>               Output directory (default: release\)
#   -Version <ver>            Override bundle version (default: from package.json)
#   -ForceOpenClaw            Re-stage OpenClaw even if apps\tauri\src-tauri\resources\openclaw
#                             is already populated
#   -ForceNodeSidecar         Re-download the Node.js sidecar even if it is already
#                             staged at apps\tauri\src-tauri\resources\node-runtime
#   -SkipTypecheck            Skip tsc -b before bundling
#   -SkipMsi                  Default $true — pass --bundles nsis to tauri build
#                             so the slow WiX .msi step is skipped (3 GB resource
#                             tree takes 10-20 min for light.exe). Use -SkipMsi:$false
#                             to build both NSIS and MSI.
#   -OpenClawExtensions <val> Extension filter: "default" (built-in allowlist),
#                             "all" (keep everything), or "ext1,ext2" (custom list).
#                             Default: "default" (NSIS 2 GB cap)
#   -?                        Print this message and exit
#
# Output (copied from Cargo target dir into the repo):
#   release\envoymesh-desktop-{version}-windows-x64.exe   NSIS installer
#   release\envoymesh-desktop-{version}-windows-x64.msi   WiX MSI (only if -SkipMsi:$false)
#   release\envoymesh-desktop-{version}-windows-x64\       Folder with both
#
# Slim / Full / default presets (Phase 49 — Pi optional on Windows):
#   default       Uses tauri.conf.json           — includes Pi + OpenClaw + Kubo.
#   -Full         Uses tauri.conf.full.json      — explicit "all sidecars" preset.
#                 Same as default; useful when paired with -SkipPi to force a
#                 known config without runtime guessing.
#   -SkipPi       Switches to tauri.conf.slim.json — omits resources/pi/**/* AND
#                 resources/kubo/**/* to stay well under NSIS's 2 GB cap.
#                 The Pi chat panel will be auto-disabled at runtime by the
#                 defensive isPiEnabledViaRuntime() check.
#
#   The presets map 1:1 onto scripts in apps/tauri/package.json:
#     build:win        → tauri.conf.slim.json   (mirrors -SkipPi)
#     build:win:full   → tauri.conf.full.json   (mirrors -Full)
#     build            → tauri.conf.json        (default)
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

    # Re-stage Pi (local coding agent) even if already populated.
    # Pi is a built-in sidecar alongside OpenClaw; see Phase 49.
    [switch]$ForcePi,

    # Skip Pi sidecar staging entirely AND switch the active Tauri config
    # to tauri.conf.slim.json (which omits resources/pi/**/*). Used for
    # Windows slim builds that need to stay under NSIS's 2 GB cap.
    #
    # Without the config switch the bundle would ship with an empty
    # resources/pi/ directory (staging skipped, tauri.conf.json still
    # references it) and the Social UI would show the Pi panel enabled
    # while the runtime silently no-ops. -SkipPi wires both ends together.
    #
    # Runtime safety net: apps/node/src/node-service-pi.ts now defensively
    # calls discoverPiCli() inside isPiEnabledViaRuntime() — even if the
    # slim/full config switch is bypassed, Pi is auto-disabled when the
    # sidecar is missing.
    [switch]$SkipPi,

    # Skip the Pi sidecar prune pass. Default: $false (always prune source
    # maps, TypeScript sources, test files, and cross-platform native
    # prebuilds to keep the Windows installer small). Mirrors the bash
    # twin scripts/stage-tauri-pi-bundle.sh which always prunes.
    # Use -SkipPiPrune only if you've manually curated the staged tree
    # and know what you're doing.
    [switch]$SkipPiPrune,

    # Force the "full" Tauri config preset (tauri.conf.full.json). Same
    # resource set as the default but explicit. Useful when -SkipPi is
    # NOT set and you want to be sure no slim config is silently picked
    # up by the environment.
    [switch]$Full,

    # Re-download Node sidecar even if already staged
    [switch]$ForceNodeSidecar,

    # Skip tsc -b before bundling
    [switch]$SkipTypecheck,

    # Skip the WiX .msi bundle (default: $true). The .msi build is slow on
    # large resource trees; NSIS is the de-facto Windows installer format.
    # Use -SkipMsi:$false to also produce a .msi (for enterprise deployment).
    [switch]$SkipMsi = $true,

    # Skip the staged-OpenClaw pnpm prune step. Default: $false (always prune
    # the staged tree's devDependencies — required to stay under NSIS's 2 GB
    # installer limit). Use -SkipOpenClawPrune only if you've manually
    # curated the staged tree and know what you're doing.
    [switch]$SkipOpenClawPrune,

    # Extension filter for OpenClaw. Controls which extensions are kept in
    # the staged bundle — the rest are pruned (deleted) to save space.
    #   "default"     Keep only the built-in allowlist (envoymesh + web search)
    #   "all"         Keep every extension (no pruning)
    #   "ext1,ext2"   Keep only the named extensions (comma-separated)
    # Default: "default" (Windows NSIS has a 2 GB cap)
    [string]$OpenClawExtensions = "default"
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

# Built-in allowlist: envoy channel + web search providers.
$script:OpenClawDefaultAllowlist = @(
    "envoymesh", "device-pair", "webhooks", "policy",
    "browser", "file-transfer", "openshell",
    "memory-wiki", "active-memory", "llm-task", "canvas",
    "diffs", "diffs-language-pack",
    "duckduckgo", "brave", "exa", "firecrawl", "google", "xai",
    "moonshot", "minimax", "ollama", "perplexity", "searxng", "tavily"
)

# Resolve the extension filter into an allowlist (array of extension names to
# keep). Returns $null when all extensions should be kept (no pruning).
function Resolve-OpenClawExtAllowlist {
    param([string]$Filter)
    switch ($Filter) {
        "default" { return $script:OpenClawDefaultAllowlist }
        "all"     { return $null }
        default   {
            # Treat as comma-separated list of extension names to keep
            return ($Filter -split "," | ForEach-Object { $_.Trim() })
        }
    }
}

# Compile OpenClawExtension into $OpenClawRoot\extensions\envoymesh and mirror
# into dist/extensions + dist-runtime/extensions (plugin discovery roots).
# Returns $true on success. Used by full stage and by reuse-path self-heal.
function Install-EnvoyMeshOpenClawExtension {
    param(
        [Parameter(Mandatory = $true)][string]$OpenClawRoot,
        [Parameter(Mandatory = $true)][string]$ExtensionSrc
    )
    if (-not (Test-Path $ExtensionSrc)) {
        Write-Warn "OpenClawExtension source missing at $ExtensionSrc"
        return $false
    }
    $extDst = Join-Path $OpenClawRoot "extensions\envoymesh"
    New-Item -ItemType Directory -Force -Path (Join-Path $OpenClawRoot "extensions") | Out-Null
    if (Test-Path $extDst) { Remove-Item -Recurse -Force $extDst }
    Copy-Item -Recurse -Force $ExtensionSrc $extDst
    if (Test-Path (Join-Path $extDst "node_modules")) {
        Remove-Item -Recurse -Force (Join-Path $extDst "node_modules")
    }

    Write-Info "Compiling EnvoyMesh extension (.ts -> .js)..."
    $compileError = $null
    Push-Location $extDst
    try {
        $topTs = @(Get-ChildItem -Path "." -Filter "*.ts" -File -ErrorAction SilentlyContinue)
        if ($topTs.Count -gt 0) {
            & npx esbuild ($topTs.FullName) `
                --bundle=false --format=esm --platform=node `
                --outdir=. --out-extension:.js=.js --allow-overwrite
            if ($LASTEXITCODE -ne 0) { $compileError = "esbuild top-level failed (exit $LASTEXITCODE)" }
        }
        $srcDir = Join-Path $extDst "src"
        if (Test-Path $srcDir) {
            Get-ChildItem -Path $srcDir -Filter "*.ts" -File -ErrorAction SilentlyContinue | ForEach-Object {
                if ($_.Name -match '\.test\.ts$') { return }
                & npx esbuild $_.FullName `
                    --bundle=false --format=esm --platform=node `
                    --outdir=src --out-extension:.js=.js --allow-overwrite
                if ($LASTEXITCODE -ne 0 -and -not $compileError) {
                    $compileError = "esbuild src/$($_.Name) failed (exit $LASTEXITCODE)"
                }
            }
        }
    } finally { Pop-Location }

    if ($compileError) {
        Write-Warn "Extension compilation issue: $compileError"
    }
    if (-not (Test-Path (Join-Path $extDst "index.js"))) {
        Write-Warn "EnvoyMesh extension index.js not produced under $extDst"
        return $false
    }

    # Mirror into plugin discovery roots (skip the source extensions/ itself).
    # Always ensure dist/extensions exists — OpenClaw prefers that discovery root.
    foreach ($distExtDir in @(
        (Join-Path $OpenClawRoot "dist\extensions"),
        (Join-Path $OpenClawRoot "dist-runtime\extensions")
    )) {
        # dist-runtime is optional; dist/extensions is required for verify + discovery.
        if ($distExtDir -match "dist-runtime" -and -not (Test-Path (Split-Path $distExtDir -Parent))) {
            continue
        }
        New-Item -ItemType Directory -Force -Path $distExtDir | Out-Null
        $envExtDst = Join-Path $distExtDir "envoymesh"
        if (Test-Path $envExtDst) { Remove-Item -Recurse -Force $envExtDst }
        Copy-Item -Recurse -Force $extDst $envExtDst
        Get-ChildItem -Path $envExtDst -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue |
            Remove-Item -Force -ErrorAction SilentlyContinue
        $pkgJson = Join-Path $envExtDst "package.json"
        if (Test-Path $pkgJson) {
            $content = Get-Content -Path $pkgJson -Raw -Encoding UTF8
            $content = $content -replace '"\.\/index\.ts"', '"./index.js"'
            $content = $content -replace '"\.\/setup-entry\.ts"', '"./setup-entry.js"'
            Set-Content -Path $pkgJson -Value $content -Encoding UTF8 -NoNewline
        }
    }
    # Also rewrite package.json in extensions/envoymesh for runtime (no tsx).
    $rootPkg = Join-Path $extDst "package.json"
    if (Test-Path $rootPkg) {
        $content = Get-Content -Path $rootPkg -Raw -Encoding UTF8
        $content = $content -replace '"\.\/index\.ts"', '"./index.js"'
        $content = $content -replace '"\.\/setup-entry\.ts"', '"./setup-entry.js"'
        Set-Content -Path $rootPkg -Value $content -Encoding UTF8 -NoNewline
    }
    Write-Ok "EnvoyMesh extension installed under $OpenClawRoot\extensions\envoymesh"
    return $true
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

# Source vcvars64.bat from a Visual Studio install so cl.exe / link.exe / the
# Windows SDK are on PATH and INCLUDE / LIB are set. By design, VS Build Tools
# does NOT add MSVC to the global PATH — Microsoft expects you to use a
# Developer Command Prompt. We auto-detect any VS install (Build Tools, Community,
# Professional, Enterprise) and pull its env vars into the current process.
#
# No-op if cl.exe is already on PATH (e.g. user is in a Developer Command Prompt).
function Import-VcVarsIfNeeded {
    if (Get-Command "cl.exe" -ErrorAction SilentlyContinue) {
        return  # already in a VS dev environment
    }
    # vswhere.exe ships with the VS Installer and is the supported way to find
    # any VS install on the box. Default path: C:\Program Files (x86)\Microsoft
    # Visual Studio\Installer\vswhere.exe
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $vswhere)) {
        return  # no VS Installer, no MSVC install possible — let the build fail with a clear error
    }
    $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if (-not $installPath) {
        return  # VS Installer present but no MSVC workload installed — build will fail loudly below
    }
    $vcvars = Join-Path $installPath "VC\Auxiliary\Build\vcvars64.bat"
    if (-not (Test-Path $vcvars)) {
        return
    }
    # Source the .bat and harvest its env vars into the current process.
    # cmd /c "... && set" prints the final env, which we parse and apply.
    Write-Info "Sourcing MSVC env from $vcvars"
    $envLines = & cmd.exe /c "`"$vcvars`" >NUL && set" 2>$null
    foreach ($line in $envLines) {
        if ($line -match '^([A-Za-z_][A-Za-z0-9_()]*)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
        }
    }
    if (Get-Command "cl.exe" -ErrorAction SilentlyContinue) {
        Write-Info "MSVC env active: cl.exe is now reachable"
    } else {
        Write-Warn "Sourced $vcvars but cl.exe is still not reachable — the C++ workload may not be installed"
    }
}

function Invoke-ExternalQuiet {
    param(
        [string]$Exe,
        # CONSUME THE REST: anything after `$Exe` on the call site flows
        # here. This MUST be the last param before any switches.
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$ToolArgs,
        # Stream output live to the console as well as the log. Off by
        # default for short ops; on for the Tauri build so the user can
        # see what stage actually failed.
        [switch]$Stream
    )
    # Lines from the tail of the log to show on failure. Hardcoded (was
    # an `[int]$TailLines` param, but PowerShell's positional binding
    # consumes the second positional ("run" in `npm run typecheck`) into
    # the int param BEFORE the ValueFromRemainingArguments param above
    # can collect the rest — `npm run typecheck` blew up with
    # "Cannot convert value 'run' to type 'System.Int32'"). Override
    # with $env:ENVOYMESH_TAIL_LINES if you need a different depth.
    $TailLines = 100
    if ($env:ENVOYMESH_TAIL_LINES -and $env:ENVOYMESH_TAIL_LINES -match '^\d+$') {
        $TailLines = [int]$env:ENVOYMESH_TAIL_LINES
    }
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    # Capture every byte (stdout + stderr) to a log so we can tail it on
    # failure. The log lives under the repo's scripts/build-logs/ dir (not
    # $env:TEMP) — TEMP logs were hard to find and the path was getting
    # lost across PowerShell sessions.
    #
    # CAPTURE STRATEGY: PowerShell's call operator `&` correctly handles
    # .cmd shims (npx, npm, tsc) which Start-Process cannot launch directly
    # ("%1 is not a valid Win32 application"). So we always use `& $Exe`.
    #
    # For OUTPUT capture, the `*> $log` and `2>&1 | Tee-Object` forms silently
    # drop output from native processes that write via direct console buffer
    # I/O (cargo progress bars, makensis, ANSI escapes) on PowerShell 5.1.
    # The only reliable cross-version capture is `cmd /c "..." > file 2>&1`,
    # which delegates to cmd.exe's redirect (kernel-level file handles).
    # We use cmd /c for the actual work and PowerShell's `&` only to launch
    # cmd.exe itself.
    $logDir = Join-Path $PSScriptRoot "..\build-logs"
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    }
    $logName = "envoymesh-build-$([guid]::NewGuid()).log"
    $logPath = Join-Path $logDir $logName
    # Pre-create the log so the path always exists even if the command
    # writes zero bytes (helps with "missing log file" reports).
    $logPath = (Resolve-Path -LiteralPath (New-Item -ItemType File -Path $logPath -Force).FullName).Path
    $exit = 0
    try {
        # Build a cmd.exe invocation that runs $Exe with all args, redirecting
        # both stdout and stderr to the log file. The inner quoting protects
        # args containing spaces or special chars.
        # Quote the exe path if it contains spaces (e.g. "C:\Program Files\...").
        $exeForCmd = if ($Exe -match '\s') { "`"$Exe`"" } else { $Exe }
        # Each arg: quote if it contains spaces. Pass through otherwise.
        # We do NOT escape cmd metacharacters here — these are build-tool
        # args (paths, flags) that don't contain & | < > etc.
        $quotedArgs = ($ToolArgs | ForEach-Object {
            if ($_ -match '\s') { "`"$_`"" } else { "$_" }
        }) -join ' '
        $cmdLine = "$exeForCmd $quotedArgs"
        if ($Stream) {
            # Stream live to console AND capture to file. We use cmd /c with
            # the redirect, but first print the command being run so the
            # user knows what's happening. cmd /c output goes to the file;
            # we read the file periodically would be ideal but complex.
            # Simpler: just run with `&` for the streaming case (user sees
            # progress) and let the empty-log fallback (below) catch
            # swallowed output.
            & $Exe @ToolArgs 2>&1 | ForEach-Object {
                $line = if ($_ -is [System.Management.Automation.ErrorRecord]) {
                    $_.Exception.Message
                } else {
                    [string]$_
                }
                Write-Host $line
                Add-Content -LiteralPath $logPath -Value $line -ErrorAction SilentlyContinue
            }
            $exit = $LASTEXITCODE
            # Fallback: if pipeline produced empty log AND command failed,
            # the child used direct console writes. Re-run via cmd /c with
            # kernel redirect to capture everything. cmd.exe is always a
            # real .exe so Start-Process issues don't apply.
            if ($exit -ne 0 -and -not (Get-Content $logPath -ErrorAction SilentlyContinue)) {
                Write-Host "    (first-pass capture was empty — re-running via cmd /c to capture direct console output)" -ForegroundColor DarkGray
                & cmd.exe /c "$cmdLine > `"$logPath`" 2>&1"
                $exit = $LASTEXITCODE
            }
        } else {
            # Quiet: cmd /c with redirect only, no console output.
            & cmd.exe /c "$cmdLine > `"$logPath`" 2>&1"
            $exit = $LASTEXITCODE
        }
        if ($exit -ne 0) {
            $cmdDesc = if ($ToolArgs.Count -gt 0) { "$Exe $($ToolArgs -join ' ')" } else { $Exe }
            $lines = @(Get-Content $logPath -ErrorAction SilentlyContinue)
            $lineCount = $lines.Count
            Write-Host ""
            Write-Host "    --- $cmdDesc failed (exit $exit) ---" -ForegroundColor DarkGray
            if ($lineCount -gt 0) {
                $shown = [Math]::Min($TailLines, $lineCount)
                Write-Host "    --- Last $shown of $lineCount lines from $logPath ---" -ForegroundColor DarkGray
                $lines | Select-Object -Last $shown | ForEach-Object {
                    Write-Host "      $_" -ForegroundColor DarkGray
                }
            } else {
                Write-Host "    --- (no captured output — the command was silent, or its output went elsewhere) ---" -ForegroundColor DarkGray
                Write-Host "    --- Try running it directly to see live output: ---" -ForegroundColor DarkGray
                Write-Host "    ---   $cmdDesc ---" -ForegroundColor DarkGray
            }
            Write-Host "    --- Full log preserved at: $logPath ---" -ForegroundColor DarkGray
            Write-Host "    --- end ---" -ForegroundColor DarkGray
            Write-Host ""
        }
        return $exit
    } finally {
        $ErrorActionPreference = $prevEap
        # Only delete the log on success. On failure, the operator needs the
        # full log to diagnose — this is the single most useful thing we can
        # leave behind. The next successful run gets a fresh log.
        if ($exit -eq 0) {
            Remove-Item $logPath -ErrorAction SilentlyContinue
        }
    }
}

# -----------------------------------------------------------------------------
# Resolve repo root (works even if cwd is somewhere else when invoking).
# -----------------------------------------------------------------------------

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

# Keep @envoymesh/* dependency pins in lockstep with VERSION. Stale pins
# (e.g. "0.1.0" while packages are 0.2.1) make npm fetch the public registry
# and fail with E404 on private workspace packages.
Write-Info "Syncing workspace package versions..."
node (Join-Path $RepoRoot "scripts\sync-version.mjs")
if ($LASTEXITCODE -ne 0) {
    Write-Fail "scripts/sync-version.mjs failed"
    exit 1
}

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

# Fail-closed: sharp's Windows native must be present before we stage the
# node runtime. Missing @img/sharp-win32-x64 used to ship a broken EXE that
# crashed on first launch ("Could not load the sharp module using win32-x64").
Write-Info "Ensuring sharp platform natives for this host..."
$sharpOs = "win32"
$sharpCpu = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString() -eq "Arm64") { "arm64" } else { "x64" }
$sharpPlat = "@img/sharp-$sharpOs-$sharpCpu"
$sharpPlatRel = Join-Path "@img" "sharp-$sharpOs-$sharpCpu"
$sharpPlatPath = Join-Path (Join-Path $RepoRoot "node_modules") $sharpPlatRel
if (-not (Test-Path $sharpPlatPath)) {
    $sharpPlatPath = Join-Path (Join-Path $RepoRoot "apps\node\node_modules") $sharpPlatRel
}
if (-not (Test-Path $sharpPlatPath)) {
    Write-Info "  $sharpPlat missing — running: npm install --os=$sharpOs --cpu=$sharpCpu --include=optional sharp"
    Push-Location $RepoRoot
    try {
        & npm install --os=$sharpOs --cpu=$sharpCpu --include=optional sharp
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm install sharp failed — image features need the win32 native"
            exit 1
        }
    } finally { Pop-Location }
}
$sharpPlatPath = Join-Path (Join-Path $RepoRoot "node_modules") $sharpPlatRel
if (-not (Test-Path $sharpPlatPath)) {
    $sharpPlatPath = Join-Path (Join-Path $RepoRoot "apps\node\node_modules") $sharpPlatRel
}
if (-not (Test-Path $sharpPlatPath)) {
    Write-Fail "$sharpPlat still missing after npm install. Aborting — a Windows EXE without it crashes at boot."
    exit 1
}
Write-Ok "sharp platform native present ($sharpPlat)"

Write-Info "Building workspace packages..."

$nodeDistEntry = Join-Path $RepoRoot "apps/node/dist/src/index.js"

if (-not $SkipTypecheck) {
    Write-Info "TypeScript build (tsc -b)..."
    $tcExit = Invoke-ExternalQuiet npm run node:build
    if ($tcExit -ne 0) {
        Write-Fail "npm run node:build failed (exit $tcExit). The Tauri bundle requires a compiled EnvoyMesh node at apps\node\dist\."
        Write-Info "  Try: cd $RepoRoot ; npm ci ; npm run node:build"
        exit 1
    }
    if (-not (Test-Path $nodeDistEntry)) {
        Write-Fail "npm run node:build returned 0 but apps\node\dist\src\index.js is still missing — check the build output for errors."
        exit 1
    }
    Write-Ok "EnvoyMesh node compiled"
} else {
    Write-Info "-SkipTypecheck: skipping npm run node:build"
    if (-not (Test-Path $nodeDistEntry)) {
        Write-Fail "apps\node\dist\src\index.js missing and -SkipTypecheck was passed — cannot continue"
        exit 1
    }
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

# 1b2. Push credentials (push-config.json + APNs .p8 + FCM service account).
# Must run AFTER node staging (which recreates resources\node\). Secrets live
# only on the packager's machine (gitignored at repo root); relative paths in
# push-config.json resolve via ENVOYMESH_NODE_BUNDLE_DIR at runtime.
# Default: fail if push-config.json exists but AuthKey / serviceAccountKey missing.
if (-not $env:REQUIRE_PUSH_CREDENTIALS) {
    $env:REQUIRE_PUSH_CREDENTIALS = "1"
}
Write-Info "Staging push credentials (REQUIRE_PUSH_CREDENTIALS=$($env:REQUIRE_PUSH_CREDENTIALS))..."
$stagePushPs1 = Join-Path $PSScriptRoot "stage-tauri-push-credentials.ps1"
if (Test-Path $stagePushPs1) {
    & $stagePushPs1 -RepoRoot $RepoRoot -Dest (Join-Path $TauriResources "node")
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
        Write-Fail "stage-tauri-push-credentials.ps1 failed (exit $LASTEXITCODE)"
        exit 1
    }
} else {
    Write-Fail "stage-tauri-push-credentials.ps1 missing — cannot stage APNs/FCM secrets for EnvoyGo push"
    exit 1
}

# 1c. OpenClaw gateway.
Write-Info "Staging OpenClaw gateway..."
$openclawSrc = Join-Path $RepoRoot "packages/openclaw"
$openclawDest = Join-Path $TauriResources "openclaw"
# Self-healing: if the staged tree's node_modules exists from a previous run
# AND we still have access to the source, re-prune in the SOURCE (where pnpm's
# preinstall scripts live) and copy the pruned node_modules to staged. This
# is the safety net for the NSIS 2 GB limit: a staged tree with devDeps
# still present blows past 2 GB and makensis crashes with "Internal compiler
# error #12345: error mmapping file ... is out of range". The user should
# never need -ForceOpenClaw just to get a working bundle.
# (Earlier we tried to prune in the staged copy, but the staged copy excludes
# `scripts/` so pnpm's preinstall script crashed. Pruning has to happen where
# pnpm can actually find its postinstall scripts — that's the source.)
if (-not $SkipOpenClawPrune -and `
    (Test-Path (Join-Path $openclawSrc "package.json")) -and `
    (Test-Path (Join-Path $openclawSrc "node_modules")) -and `
    (Test-Path (Join-Path $openclawDest "node_modules"))) {
    Write-Info "Pruning devDependencies from OpenClaw source (idempotent — safe to skip with -SkipOpenClawPrune)..."
    Push-Location $openclawSrc
    try {
        & pnpm prune --prod 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            # Re-copy the freshly-pruned node_modules to staged.
            $nmSrc = Join-Path $openclawSrc "node_modules"
            $nmDst = Join-Path $openclawDest "node_modules"
            if (Test-Path $nmDst) { Remove-Item -Recurse -Force $nmDst }
            Copy-Item -Recurse -Force $nmSrc $nmDst
            Write-Ok "Re-copied pruned node_modules to staged tree"
        } else {
            Write-Warn "pnpm prune --prod failed in source (continuing — bundle may exceed 2 GB NSIS limit)"
        }
    } finally {
        Pop-Location
    }
}
$openclawStaged = (Test-Path (Join-Path $openclawDest "openclaw.mjs")) -and `
                  (Test-Path (Join-Path $openclawDest "package.json")) -and `
                  (Test-Path (Join-Path $openclawDest "node_modules")) -and `
                  (Test-Path (Join-Path $openclawDest "node_modules/openclaw/package.json"))
# Tightened reuse gate: also require node_modules/openclaw/package.json
# (the runtime plugin-SDK self-reference). A missing self-ref makes the
# gateway refuse to start with "OpenClaw tree is incomplete", so force
# a fresh re-stage instead of silently reusing broken cached state.
# Matches the gate in scripts/stage-tauri-openclaw-bundle.sh.
if ($openclawStaged -and -not $ForceOpenClaw) {
    Write-Info "Reusing staged OpenClaw at $openclawDest. Use -ForceOpenClaw to re-stage."

    # Validate dist/entry.js — if it's missing or a broken stub, force re-stage.
    # EnvoyMesh writes bootstrap stubs at runtime that reference src/ (excluded
    # from Tauri resources). The bash twin does the same check in
    # stage-tauri-openclaw-bundle.sh.
    $stagedEntry = Join-Path $openclawDest "dist/entry.js"
    $needRestage = $false
    if (-not (Test-Path $stagedEntry)) {
        Write-Info "  dist/entry.js is missing — forcing re-stage"
        $needRestage = $true
    } else {
        $entryContent = Get-Content $stagedEntry -Raw -ErrorAction SilentlyContinue
        if ($entryContent -and ($entryContent -match "EnvoyMesh bootstrap" -or $entryContent -match "from.*src/cli/run-main")) {
            Write-Info "  dist/entry.js is a broken stub — forcing re-stage"
            $needRestage = $true
        }
    }

    if (-not $needRestage) {
        # Self-heal: if a previous build's pnpm prune --prod ran in the staged
        # tree (without pnpm-workspace.yaml), it moved production deps to
        # node_modules/.ignored/. Restore them — the compiled dist/*.js files
        # import these at runtime. Must handle scoped packages (@scope/name)
        # by merging individual sub-packages, not the scope directory.
        $ignoredDir = Join-Path $openclawDest "node_modules/.ignored"
        $nmDir = Join-Path $openclawDest "node_modules"
        if (Test-Path $ignoredDir) {
            $restored = 0
            foreach ($pkg in (Get-ChildItem -Path $ignoredDir -Directory -ErrorAction SilentlyContinue)) {
                $destPkg = Join-Path $nmDir $pkg.Name
                if (Test-Path $destPkg) {
                    # Scope dir or package exists — merge sub-packages.
                    foreach ($sub in (Get-ChildItem -Path $pkg.FullName -Directory -ErrorAction SilentlyContinue)) {
                        $destSub = Join-Path $destPkg $sub.Name
                        if (-not (Test-Path $destSub)) {
                            Move-Item -Force $sub.FullName $destSub
                            $restored++
                        }
                    }
                } else {
                    Move-Item -Force $pkg.FullName $destPkg
                    $restored++
                }
            }
            Remove-Item -Recurse -Force $ignoredDir -ErrorAction SilentlyContinue
            if ($restored -gt 0) {
                Write-Info "Restored $restored package(s) from node_modules\.ignored/ (prune artefact)"
            }
        }

        # Self-heal: workspace staging doesn't create a node_modules/openclaw/
        # self-reference. dist/*.js uses `import "openclaw/..."` for the
        # plugin SDK, and a stray pnpm prune --prod can additionally remove
        # the dir entirely. This is the missing piece the .ignored heal
        # cannot restore (openclaw is the package being installed, not a
        # dependency of it). Idempotent — safe to run on every reuse.
        # Mirrors the heal in scripts/stage-tauri-openclaw-bundle.sh.
        $selfRefPath = Join-Path $openclawDest "node_modules/openclaw/package.json"
        if (-not (Test-Path $selfRefPath)) {
            $selfRefDir = Split-Path $selfRefPath -Parent
            New-Item -ItemType Directory -Force -Path $selfRefDir | Out-Null
            $rootPkg = Join-Path $openclawDest "package.json"
            if (Test-Path $rootPkg) {
                # New-Item -ItemType SymbolicLink requires admin or developer-mode
                # on Windows; use cmd /c mklink (works without elevation in dev mode)
                # and fall back to a deep copy if symlink creation fails.
                $symlinked = $false
                try {
                    & cmd.exe /c "mklink `"$selfRefPath`" `"..\..\package.json`"" 2>&1 | Out-Null
                    if ($LASTEXITCODE -eq 0) { $symlinked = $true }
                } catch { }
                if (-not $symlinked) {
                    Copy-Item -Force $rootPkg $selfRefPath
                    Write-Warn "node_modules/openclaw self-ref was a deep copy (symlink creation failed — likely missing developer mode)"
                }
            }
            $rootMjs = Join-Path $openclawDest "openclaw.mjs"
            $selfRefMjs = Join-Path $selfRefDir "openclaw.mjs"
            if (Test-Path $rootMjs) {
                $created = $false
                try {
                    & cmd.exe /c "mklink `"$selfRefMjs`" `"..\..\openclaw.mjs`"" 2>&1 | Out-Null
                    if ($LASTEXITCODE -eq 0) { $created = $true }
                } catch { }
                if (-not $created) { Copy-Item -Force $rootMjs $selfRefMjs }
            }
            foreach ($top in @("dist", "extensions", "skills")) {
                $rootTop = Join-Path $openclawDest $top
                $selfRefTop = Join-Path $selfRefDir $top
                if (Test-Path $rootTop) {
                    $created = $false
                    try {
                        & cmd.exe /c "mklink /D `"$selfRefTop`" `"..\..\$top`"" 2>&1 | Out-Null
                        if ($LASTEXITCODE -eq 0) { $created = $true }
                    } catch { }
                    if (-not $created) {
                        if (Test-Path $selfRefTop) { Remove-Item -Recurse -Force $selfRefTop }
                        Copy-Item -Recurse -Force $rootTop $selfRefTop
                    }
                }
            }
            if (Test-Path $selfRefPath) {
                Write-Info "Restored node_modules\openclaw\ self-reference (workspace staging fix)"
            } else {
                Write-Warn "Could not restore node_modules\openclaw\ — staged tree is missing package.json"
            }
        }

        # Prune unused extensions on reuse — the cache may predate the
        # allowlist (3 GB of 143 extensions exceeds NSIS 2 GB cap).
        # Controlled by -OpenClawExtensions (see param block).
        $openclawExtAllowlist = Resolve-OpenClawExtAllowlist -Filter $OpenClawExtensions
        if ($null -ne $openclawExtAllowlist) {
            foreach ($extDir in @(
                (Join-Path $openclawDest "dist\extensions"),
                (Join-Path $openclawDest "dist-runtime\extensions"),
                (Join-Path $openclawDest "extensions")
            )) {
                if (Test-Path $extDir) {
                    $removedCount = 0
                    Get-ChildItem -Path $extDir -Directory | Where-Object {
                        -not ($openclawExtAllowlist -contains $_.Name)
                    } | ForEach-Object {
                        Remove-Item -Recurse -Force $_.FullName
                        $removedCount++
                    }
                    if ($removedCount -gt 0) {
                        $rel = $extDir.Substring($openclawDest.Length + 1)
                        Write-Info "Pruned $removedCount unused extensions from $rel on reuse"
                    }
                }
            }
        } else {
            Write-Info "Keeping all OpenClaw extensions (-OpenClawExtensions all)"
        }

        # Self-heal: cached OpenClaw trees often predate the compiled
        # envoymesh channel (or lost it during a prune/pack). Without
        # extensions/envoymesh/index.js the home node refuses to start
        # OpenClaw with "OpenClaw tree is incomplete".
        $envExtJs = Join-Path $openclawDest "extensions\envoymesh\index.js"
        if (-not (Test-Path $envExtJs)) {
            Write-Info "extensions\envoymesh\index.js missing from staged OpenClaw — healing..."
            $extSrcRoot = Join-Path $RepoRoot "OpenClawExtension"
            $healed = Install-EnvoyMeshOpenClawExtension -OpenClawRoot $openclawDest -ExtensionSrc $extSrcRoot
            if (-not $healed -or -not (Test-Path $envExtJs)) {
                Write-Info "  Could not heal envoymesh extension — forcing full OpenClaw re-stage"
                $needRestage = $true
            }
        }

        # NOTE: We do NOT run pnpm prune --prod in the staged tree here.
        # The staged tree lacks pnpm-workspace.yaml and packages/, so
        # pnpm would orphan most production deps (json5, chalk, express,
        # ws, etc.) → ERR_MODULE_NOT_FOUND at runtime. The first prune in
        # the source tree already removed devDeps correctly.
    }
    if ($needRestage) {
        # dist/entry.js broken and/or envoymesh missing — fall through to
        # the full re-stage logic below by clearing the staged flag.
        $openclawStaged = $false
    }
}
if (-not $openclawStaged -or $ForceOpenClaw) {
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

            # Compile the extension's .ts sources to .js so the gateway can
            # load them at runtime.  The openclaw build uses git ls-files to
            # discover extensions — our copied extension is not git-tracked,
            # so it won't be compiled by pnpm run build.  We use esbuild
            # (already in openclaw's node_modules) for fast transpilation.
            Write-Info "Compiling EnvoyMesh extension (.ts -> .js)..."
            $compileError = $null
            Push-Location $extDst
            try {
                & npx esbuild (Get-ChildItem -Path "." -Filter "*.ts").FullName `
                    --bundle=false --format=esm --platform=node `
                    --outdir=. --out-extension:.js=.js --allow-overwrite
                if ($LASTEXITCODE -ne 0) { $compileError = "esbuild top-level failed (exit $LASTEXITCODE)" }
                Get-ChildItem -Path "src" -Filter "*.ts" | ForEach-Object {
                    if ($_.Name -match '\.test\.ts$') { return }
                    & npx esbuild $_.FullName `
                        --bundle=false --format=esm --platform=node `
                        --outdir=src --out-extension:.js=.js --allow-overwrite
                    if ($LASTEXITCODE -ne 0 -and -not $compileError) { $compileError = "esbuild src/$($_.Name) failed (exit $LASTEXITCODE)" }
                }
            } finally { Pop-Location }
            if ($compileError) {
                Write-Warn "Extension compilation issue: $compileError (extension may be incomplete)"
            }
            if (-not (Test-Path (Join-Path $extDst "index.js"))) {
                Write-Fail "EnvoyMesh extension index.js not produced — aborting build"
                exit 1
            }
            Write-Ok "EnvoyMesh extension compiled"
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
            # write a stub dist/entry.js. Prefer the already-compiled JS
            # over the .ts source so the stub works even when src/ is
            # excluded from the Tauri resource copy.
            Write-Warn "OpenClaw build returned non-zero (exit $buildExit) — writing dist\entry.js bootstrap fallback"
            if (-not (Test-Path "dist")) {
                New-Item -ItemType Directory -Force -Path "dist" | Out-Null
            }
            if (Test-Path "dist\cli\run-main.js") {
                $entryStub = @"
// EnvoyMesh bootstrap — fallback entry when full build failed.
// Uses the pre-compiled JS chunk so src/ exclusion is safe.
import { runCli } from "./cli/run-main.js";
"@
            } else {
                $entryStub = @"
// EnvoyMesh bootstrap — re-exports the gateway from TS source (runtime
// uses tsx to execute this directly when the full build is unavailable).
// WARNING: requires src/ to be present — will fail if src/ is excluded.
export * from "../src/cli/run-main.ts";
"@
            }
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
        "tsconfig.json", "vitest.config.ts", "tsdown.config.ts",
        "pnpm-workspace.yaml",
        # Release notes and lock files — not used at runtime, just bulk.
        "CHANGELOG.md", "npm-shrinkwrap.json", "pnpm-lock.yaml",
        "CONTRIBUTING.md", "SECURITY.md", "README.md"
    )
    Get-ChildItem -Path $openclawSrc -Force | Where-Object {
        -not ($exclude -contains $_.Name)
    } | ForEach-Object {
        Copy-Item -Recurse -Force $_.FullName (Join-Path $openclawDest $_.Name)
    }
    if (Test-Path (Join-Path $openclawSrc "node_modules")) {
        Copy-Item -Recurse -Force (Join-Path $openclawSrc "node_modules") (Join-Path $openclawDest "node_modules")
    }

    # Install clawhub CLI into the staged tree so the "Installed" skills tab
    # works in the Windows installer.  clawhub is a separate npm package
    # (not part of openclaw's deps) — without it, `clawhub list` fails.
    $clawhubBin = Join-Path $openclawDest "node_modules\.bin\clawhub"
    if (-not (Test-Path $clawhubBin)) {
        Write-Info "Installing clawhub CLI into staged node_modules..."
        Push-Location $openclawDest
        try {
            & npm install --no-save clawhub 2>&1 | Select-Object -Last 3
        } finally { Pop-Location }
        if (Test-Path $clawhubBin) {
            Write-Ok "clawhub CLI installed"
        } else {
            Write-Warn "clawhub install failed — 'Installed' skills tab will be unavailable"
        }
    }

    # Self-heal: if the source tree had pnpm prune --prod run without
    # pnpm-workspace.yaml (e.g. stray build), packages may be in .ignored/.
    # Restore them so the staged tree has everything dist/*.js imports.
    # Must handle scoped packages by merging individual sub-packages.
    $ignoredDir = Join-Path $openclawDest "node_modules/.ignored"
    $nmDir = Join-Path $openclawDest "node_modules"
    if (Test-Path $ignoredDir) {
        $restored = 0
        foreach ($pkg in (Get-ChildItem -Path $ignoredDir -Directory -ErrorAction SilentlyContinue)) {
            $destPkg = Join-Path $nmDir $pkg.Name
            if (Test-Path $destPkg) {
                foreach ($sub in (Get-ChildItem -Path $pkg.FullName -Directory -ErrorAction SilentlyContinue)) {
                    $destSub = Join-Path $destPkg $sub.Name
                    if (-not (Test-Path $destSub)) {
                        Move-Item -Force $sub.FullName $destSub
                        $restored++
                    }
                }
            } else {
                Move-Item -Force $pkg.FullName $destPkg
                $restored++
            }
        }
        Remove-Item -Recurse -Force $ignoredDir -ErrorAction SilentlyContinue
        if ($restored -gt 0) {
            Write-Info "Restored $restored package(s) from node_modules\.ignored/"
        }
    }

    # Install the compiled envoymesh extension into the OpenClaw plugin discovery
    # directories.  OpenClaw's resolveBundledDirFromPackageRoot() scans:
    #   1. dist/extensions/          (source checkout with built tree)
    #   2. dist-runtime/extensions/  (runtime tree — preferred in DMG bundles)
    #   3. extensions/              (source tree fallback)
    # In the DMG (not a source checkout), if BOTH dist/extensions/ AND
    # dist-runtime/extensions/ exist, it picks dist-runtime/extensions/.
    # Install into ALL of them so whichever root is chosen, envoymesh is found.
    #
    # Also fix package.json entry points: the source declares
    #   "openclaw.extensions": ["./index.ts"]
    # but in the DMG only .js files exist (no tsx/jiti). Rewrite to .js.
    $envExtSrc = Join-Path $openclawDest "extensions\envoymesh"
    $bundledExtDirs = @(
        (Join-Path $openclawDest "dist\extensions"),
        (Join-Path $openclawDest "dist-runtime\extensions"),
        (Join-Path $openclawDest "extensions")
    )
    if (-not (Test-Path (Join-Path $envExtSrc "index.js"))) {
        # Source copy/compile may have been skipped (missing OpenClawExtension
        # or packages/openclaw/extensions). Heal into the staged tree directly.
        Write-Info "Staged extensions\envoymesh\index.js missing — installing from OpenClawExtension..."
        $ok = Install-EnvoyMeshOpenClawExtension `
            -OpenClawRoot $openclawDest `
            -ExtensionSrc (Join-Path $RepoRoot "OpenClawExtension")
        if (-not $ok -or -not (Test-Path (Join-Path $envExtSrc "index.js"))) {
            Write-Fail "extensions\envoymesh\index.js missing after OpenClaw stage — OpenClaw will not start. Ensure OpenClawExtension/ exists at repo root."
            exit 1
        }
    }
    if (Test-Path $envExtSrc) {
        foreach ($distExtDir in $bundledExtDirs) {
            if (-not (Test-Path $distExtDir)) { continue }
            $envExtDst = Join-Path $distExtDir "envoymesh"
            if (Test-Path $envExtDst) { continue }  # already installed
            Write-Info "Installing envoymesh into $(Split-Path (Split-Path $distExtDir -Parent) -Leaf)\$(Split-Path $distExtDir -Leaf)\..."
            Copy-Item -Recurse -Force $envExtSrc $envExtDst
            # Remove leftover .ts source files — only .js is needed at runtime
            Get-ChildItem -Path $envExtDst -Filter "*.ts" -Recurse | Remove-Item -Force
            # Fix package.json: replace .ts references with .js
            $pkgJson = Join-Path $envExtDst "package.json"
            if (Test-Path $pkgJson) {
                $content = Get-Content -Path $pkgJson -Raw -Encoding UTF8
                $content = $content -replace '"\.\/index\.ts"', '"./index.js"'
                $content = $content -replace '"\.\/setup-entry\.ts"', '"./setup-entry.js"'
                Set-Content -Path $pkgJson -Value $content -Encoding UTF8 -NoNewline
            }
            # Verify critical files
            if (-not (Test-Path (Join-Path $envExtDst "index.js")) -or
                -not (Test-Path (Join-Path $envExtDst "openclaw.plugin.json"))) {
                Write-Fail "envoymesh plugin incomplete in $distExtDir — aborting"
                exit 1
            }
        }
        $jsCount = (Get-ChildItem -Path $envExtSrc -Filter "*.js" -Recurse).Count
        Write-Ok "envoymesh installed in all plugin discovery roots ($jsCount .js files each)"
    }

    # Prune unused OpenClaw extensions — the full set is ~143 dirs with
    # production node_modules deps totalling ~2.2 GB. EnvoyMesh only uses
    # ~13 (envoymesh channel + web search providers). Keeping all of them
    # pushes the NSIS installer past its 2 GB hard cap and the build fails.
    # Prune ALL extension directories: dist/extensions/, dist-runtime/extensions/,
    # and extensions/. Controlled by -OpenClawExtensions (see param block).
    $openclawExtAllowlist = Resolve-OpenClawExtAllowlist -Filter $OpenClawExtensions
    if ($null -ne $openclawExtAllowlist) {
        foreach ($extBase in $bundledExtDirs) {
            if (Test-Path $extBase) {
                $removedCount = 0
                Get-ChildItem -Path $extBase -Directory | Where-Object {
                    -not ($openclawExtAllowlist -contains $_.Name)
                } | ForEach-Object {
                    Remove-Item -Recurse -Force $_.FullName
                    $removedCount++
                }
                if ($removedCount -gt 0) {
                    Write-Info "Pruned $removedCount unused extensions from $(Split-Path (Split-Path $extBase -Parent) -Leaf)\$(Split-Path $extBase -Leaf)\"
                }
            }
        }
    } else {
        Write-Info "Keeping all OpenClaw extensions (-OpenClawExtensions all)"
    }

    # NOTE: We do NOT run `pnpm prune --prod` here in the staged tree.
    # The staged tree is missing pnpm-workspace.yaml and packages/, so pnpm
    # sees it as a plain single package. The root package.json has hundreds
    # of dependencies that pnpm resolves via workspace sub-packages — without
    # those sub-packages, pnpm concludes most deps (json5, chalk, express,
    # ws, etc.) are orphaned and moves them to node_modules/.ignored/. But the
    # compiled dist/*.js files still import them at runtime →
    # ERR_MODULE_NOT_FOUND crash. The first prune (in the source tree, above)
    # already removed devDeps while the workspace structure was intact, so the
    # copied node_modules is correct.

    # Clean up dangling symlinks in node_modules/.bin/ left behind by prune.
    # Tauri scans every file under resources/ and fails on missing targets.
    # The bash twin does the same in stage-tauri-openclaw-bundle.sh.
    $openclawBinDir = Join-Path $openclawDest "node_modules/.bin"
    if (Test-Path $openclawBinDir) {
        $cleaned = 0
        Get-ChildItem -Path $openclawBinDir -Force | Where-Object {
            # On Windows, junction points and symlinks both report IsTrue in
            # Attributes. Check if the target exists.
            $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint
        } | ForEach-Object {
            $target = $_.FullName
            # Use Resolve-Path with ErrorAction SilentlyContinue — if it
            # resolves, the target exists. If not, it's dangling.
            try {
                $null = $_.ResolveLinkTarget($false)
                # Re-check the actual file exists (ResolveLinkTarget succeeds
                # on some dangling links on Windows). Test-Path is authoritative.
                if (-not (Test-Path $target)) {
                    Remove-Item -Force $target -ErrorAction SilentlyContinue
                    $cleaned++
                }
            } catch {
                # ResolveLinkTarget failed — link is dangling
                Remove-Item -Force $target -ErrorAction SilentlyContinue
                $cleaned++
            }
        }
        if ($cleaned -gt 0) {
            Write-Info "Removed $cleaned dangling symlinks from node_modules\.bin/"
        }
    }

    # Self-heal: workspace staging doesn't create node_modules/openclaw/
    # self-reference. dist/*.js uses `import "openclaw/..."` for the
    # plugin SDK, and a stray pnpm prune --prod can additionally remove
    # the dir entirely. This is the missing piece the .ignored heal
    # cannot restore (openclaw is the package being installed, not a
    # dependency of it). Idempotent — also runs in the reuse path above.
    # Mirrors the heal in scripts/stage-tauri-openclaw-bundle.sh.
    $selfRefPath = Join-Path $openclawDest "node_modules/openclaw/package.json"
    if (-not (Test-Path $selfRefPath)) {
        $selfRefDir = Split-Path $selfRefPath -Parent
        New-Item -ItemType Directory -Force -Path $selfRefDir | Out-Null
        $rootPkg = Join-Path $openclawDest "package.json"
        if (Test-Path $rootPkg) {
            $symlinked = $false
            try {
                & cmd.exe /c "mklink `"$selfRefPath`" `"..\..\package.json`"" 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) { $symlinked = $true }
            } catch { }
            if (-not $symlinked) { Copy-Item -Force $rootPkg $selfRefPath }
        }
        $rootMjs = Join-Path $openclawDest "openclaw.mjs"
        $selfRefMjs = Join-Path $selfRefDir "openclaw.mjs"
        if (Test-Path $rootMjs) {
            $created = $false
            try {
                & cmd.exe /c "mklink `"$selfRefMjs`" `"..\..\openclaw.mjs`"" 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) { $created = $true }
            } catch { }
            if (-not $created) { Copy-Item -Force $rootMjs $selfRefMjs }
        }
        foreach ($top in @("dist", "extensions", "skills")) {
            $rootTop = Join-Path $openclawDest $top
            $selfRefTop = Join-Path $selfRefDir $top
            if (Test-Path $rootTop) {
                $created = $false
                try {
                    & cmd.exe /c "mklink /D `"$selfRefTop`" `"..\..\$top`"" 2>&1 | Out-Null
                    if ($LASTEXITCODE -eq 0) { $created = $true }
                } catch { }
                if (-not $created) {
                    if (Test-Path $selfRefTop) { Remove-Item -Recurse -Force $selfRefTop }
                    Copy-Item -Recurse -Force $rootTop $selfRefTop
                }
            }
        }
        if (Test-Path $selfRefPath) {
            Write-Info "Restored node_modules\openclaw\ self-reference (workspace staging fix)"
        } else {
            Write-Warn "Could not restore node_modules\openclaw\ — staged tree is missing package.json"
        }
    }

    Write-Ok "OpenClaw staged at $openclawDest"
}

# 1c-bis. Scrub dev-only tooling from staged OpenClaw node_modules.
# OpenClaw's package.json lists typescript/vite/esbuild/etc. as PRODUCTION
# dependencies (not devDeps), so `pnpm prune --prod` cannot remove them.
# These packages are verified unused by dist/*.js (grepped: 0 importers)
# and together account for ~250 MB on Mac / ~500-700 MB on Windows (native
# win32-x64 binaries are 2-3x larger). Scrubbing them is what brings the
# bundle back under NSIS's 2 GB cap.
# KEEP highlight.js (used by sessions-*.js for runtime syntax highlighting).
$script:OpenClawDevOnlyPackages = @(
    "typescript", "@typescript",
    "@oxlint", "@oxlint-tsgolint",
    "vite", "@rolldown",
    "esbuild", "@esbuild",
    "vitest", "@vitest",
    "playwright-core", "playwright",
    "jsdom",
    "tree-sitter-bash", "tree-sitter",
    "@shikijs",
    "@babel",
    "webpack", "rollup"
)
$scrubbedNmDir = Join-Path $openclawDest "node_modules"
$scrubbedCount = 0
$scrubbedBytes = 0
foreach ($pkg in $script:OpenClawDevOnlyPackages) {
    $pkgPath = Join-Path $scrubbedNmDir $pkg
    if (Test-Path $pkgPath) {
        try {
            $sz = (Get-ChildItem -Path $pkgPath -Recurse -File -ErrorAction SilentlyContinue |
                   Measure-Object -Property Length -Sum).Sum
            $scrubbedBytes += [int]$sz
            Remove-Item -Recurse -Force $pkgPath -ErrorAction SilentlyContinue
            $scrubbedCount++
        } catch { }
    }
}
# Also clean dangling .bin/ entries left by the scrubbed packages.
$binDir = Join-Path $scrubbedNmDir ".bin"
if (Test-Path $binDir) {
    Get-ChildItem -Path $binDir -Force | Where-Object {
        $_.LinkType -ne $null -and -not (Test-Path $_.Target[0])
    } | ForEach-Object {
        Remove-Item -Force $_.FullName -ErrorAction SilentlyContinue
    }
}
if ($scrubbedCount -gt 0) {
    $scrubbedMB = [math]::Round($scrubbedBytes / 1MB, 1)
    Write-Ok "Scrubbed $scrubbedCount dev-only packages from node_modules (~$scrubbedMB MB)"
}

# Scrub orphaned heavy native packages left behind after extension pruning.
# These packages are dependencies of extensions we typically remove (copilot,
# codex, acpx, memory-lancedb, matrix, msteams, etc.) but pnpm's hoisting
# leaves them in node_modules/ even after the extension dir is gone.
# On Windows (where pnpm copies instead of symlinks), they total ~1.85 GB:
#   @node-llama-cpp (711 MB), @github (422 MB), @openai (279 MB),
#   @zed-industries (173 MB), @lancedb (158 MB), + smaller ones.
# Verified safe by grepping dist/*.js — none are imported at runtime.
# KEEP: @anthropic-ai/sdk (used by dist/anthropic-*.js), @larksuiteoapi
# (used by dist/monitor.account-*.js and dist/client-*.js).
#
# CONDITIONAL: only scrub a package when NONE of its dependent extensions
# are present in the staged tree. This makes the scrub safe whether the
# caller kept all extensions (Mac DMG via -OpenClawExtensions all) or
# pruned to an allowlist (Windows default).
$script:OpenClawOrphanedNativesWithDeps = @(
    # Format: @{ Pkg = "..."; Deps = @("ext1", "ext2") }
    # Scrub Pkg only when none of Deps exist under extensions/roots.
    @{ Pkg = "@node-llama-cpp";   Deps = @() },
    @{ Pkg = "node-llama-cpp";    Deps = @() },
    @{ Pkg = "@github";           Deps = @("copilot") },
    @{ Pkg = "@openai";           Deps = @("codex") },
    @{ Pkg = "@zed-industries";   Deps = @("acpx") },
    @{ Pkg = "@lancedb";          Deps = @("memory-lancedb") },
    @{ Pkg = "@matrix-org";       Deps = @("matrix") },
    @{ Pkg = "@azure";            Deps = @("msteams", "azure-speech") },
    @{ Pkg = "@opentelemetry";    Deps = @("diagnostics-otel", "diagnostics-prometheus") }
)
function Test-ExtensionKept {
    param([string[]]$Exts, [string]$TreeRoot)
    foreach ($ext in $Exts) {
        foreach ($sub in @("extensions", "dist\extensions", "dist-runtime\extensions")) {
            if (Test-Path (Join-Path $TreeRoot "$sub\$ext")) { return $true }
        }
    }
    return $false
}
$orphanCount = 0
$orphanBytes = 0
foreach ($entry in $script:OpenClawOrphanedNativesWithDeps) {
    $pkgPath = Join-Path $scrubbedNmDir $entry.Pkg
    if (Test-Path $pkgPath) {
        $keep = $false
        if ($entry.Deps.Count -gt 0) {
            $keep = Test-ExtensionKept -Exts $entry.Deps -TreeRoot $openclawDest
        }
        if (-not $keep) {
            try {
                $sz = (Get-ChildItem -Path $pkgPath -Recurse -File -ErrorAction SilentlyContinue |
                       Measure-Object -Property Length -Sum).Sum
                $orphanBytes += [int]$sz
                Remove-Item -Recurse -Force $pkgPath -ErrorAction SilentlyContinue
                $orphanCount++
            } catch { }
        } else {
            Write-Info "Kept $($entry.Pkg) — dependent extension present"
        }
    }
}
if ($orphanCount -gt 0) {
    $orphanMB = [math]::Round($orphanBytes / 1MB, 1)
    Write-Ok "Scrubbed $orphanCount orphaned native packages (~$orphanMB MB)"
}

# Scrub stray build artefacts that leak in via the reuse path (the exclude
# list above only filters the fresh copy; a cached tree from before these
# entries were added still carries them).
$ArtefactsToScrub = @(
    (Join-Path $openclawDest "CHANGELOG.md"),
    (Join-Path $openclawDest "npm-shrinkwrap.json"),
    (Join-Path $openclawDest "pnpm-lock.yaml"),
    (Join-Path $openclawDest "CONTRIBUTING.md"),
    (Join-Path $openclawDest "SECURITY.md"),
    (Join-Path $openclawDest "README.md"),
    (Join-Path $openclawDest "appcast.xml"),
    (Join-Path $openclawDest ".artifacts")
)
foreach ($art in $ArtefactsToScrub) {
    if (Test-Path $art) { Remove-Item -Recurse -Force $art -ErrorAction SilentlyContinue }
}
# Drop TypeScript incremental build caches and source maps (dev-only).
$tsbuildCount = (Get-ChildItem -Path $openclawDest -Recurse -Filter "*.tsbuildinfo" -File -ErrorAction SilentlyContinue).Count
if ($tsbuildCount -gt 0) {
    Get-ChildItem -Path $openclawDest -Recurse -Filter "*.tsbuildinfo" -File |
        ForEach-Object { Remove-Item -Force $_.FullName -ErrorAction SilentlyContinue }
}
# Source maps in control-ui — large, dev-only.
$controlUiDir = Join-Path $openclawDest "dist/control-ui/assets"
if (Test-Path $controlUiDir) {
    $mapCount = (Get-ChildItem -Path $controlUiDir -Filter "*.map" -ErrorAction SilentlyContinue).Count
    if ($mapCount -gt 0) {
        Get-ChildItem -Path $controlUiDir -Filter "*.map" |
            ForEach-Object { Remove-Item -Force $_.FullName -ErrorAction SilentlyContinue }
    }
}

# 1c-ter. EnvoyMesh OpenClaw channel — ALWAYS (independent of OpenClaw cache).
# Reusing a stale openclaw tree used to ship without extensions/envoymesh/index.js
# and the home node refused to start OpenClaw. This step compiles a seed and
# installs it into the staged tree every build.
Write-Info "Staging EnvoyMesh OpenClaw extension (always — not tied to OpenClaw reuse)..."
$stageEnvoyExt = Join-Path $PSScriptRoot "stage-openclaw-envoymesh-extension.ps1"
if (-not (Test-Path $stageEnvoyExt)) {
    Write-Fail "missing $stageEnvoyExt"
    exit 1
}
& $stageEnvoyExt
if ($LASTEXITCODE -ne 0) {
    Write-Fail "stage-openclaw-envoymesh-extension.ps1 failed — OpenClaw will not start without extensions\envoymesh\index.js"
    exit 1
}
Write-Ok "EnvoyMesh OpenClaw extension staged"

# 1d. Pi agent (local coding sidecar).
#     Pi is a Node.js package, not a prebuilt binary, so staging = npm-install
#     the pinned upstream CLI + its transitive deps into resources/pi/.
#     Mirrors the OpenClaw reuse-vs-force pattern. -SkipPi is the slim-build
#     escape hatch (Pi is omitted from tauri.conf.slim.json — picked at step 3).
if (-not $SkipPi) {
    Write-Info "Staging Pi agent (local coding sidecar)..."
    $piDest = Join-Path $TauriResources "pi"
    $piCli = Join-Path $piDest "node_modules\@earendil-works\pi-coding-agent\dist\cli.js"
    $piStaged = (Test-Path $piCli) -and (Test-Path (Join-Path $piDest ".pi-version"))
    if ($piStaged -and -not $ForcePi) {
        $piVer = (Get-Content (Join-Path $piDest ".pi-version") -Raw).Trim()
        Write-Info "Reusing staged Pi $piVer at $($piDest.Replace($RepoRoot + '\', '')). Use -ForcePi to re-stage."
    } else {
        # Delegate to fetch-pi-sidecar.ps1 — npm-installs Pi + transitive deps.
        # Idempotent. The prune pass below trims the staged tree to runtime
        # essentials (source maps, .ts sources, test files, cross-platform
        # native prebuilds). Mirrors the bash twin scripts/stage-tauri-pi-bundle.sh.
        $fetchPs1 = Join-Path $PSScriptRoot "fetch-pi-sidecar.ps1"
        if (-not (Test-Path $fetchPs1)) {
            Write-Fail "fetch-pi-sidecar.ps1 not found at $fetchPs1"
            exit 1
        }
        # ENVOYMESH_PI_VERSION: single source of truth for the Pi pin.
        # Both fetch-pi-sidecar.{sh,ps1} and stage-tauri-pi-bundle.sh honour
        # it. Empty string → the script's own default (0.82.1) is used.
        if ($env:ENVOYMESH_PI_VERSION) {
            Write-Info "Using ENVOYMESH_PI_VERSION=$env:ENVOYMESH_PI_VERSION"
            & $fetchPs1 -Version $env:ENVOYMESH_PI_VERSION -Force:$ForcePi
        } else {
            & $fetchPs1 -Force:$ForcePi
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Pi sidecar staging failed — aborting build. Use -SkipPi to omit Pi from this bundle."
            exit 1
        }
    }

    # Prune pass — mirrors scripts/stage-tauri-pi-bundle.sh (the bash twin
    # delegates to this from build-desktop.sh). Skipped when -SkipPiPrune
    # is set; safe to leave on for every reuse (idempotent).
    #
    # CRITICAL (Windows / NSIS): Get-ChildItem cannot see paths >= ~260 chars
    # (MAX_PATH). Pi's nested @mistralai ...operations/<very-long-name>.d.ts.map
    # paths exceed that, so a naive "*.map" prune leaves them in place and
    # makensis fails with "failed opening file". Use \\?\ + .NET enumeration
    # for delete, and strip *.d.ts (runtime only needs .js).
    if (-not $SkipPiPrune) {
        Write-Info "Pruning non-runtime files from Pi bundle (long-path aware)..."
        $pruned = 0
        $pruneBytes = 0L

        function ConvertTo-Win32LongPath([string]$Path) {
            if ([string]::IsNullOrEmpty($Path)) { return $Path }
            if ($Path.StartsWith("\\?\")) { return $Path }
            if ($Path.StartsWith("\\")) { return "\\?\UNC\" + $Path.Substring(2) }
            return "\\?\" + $Path
        }
        function ConvertFrom-Win32LongPath([string]$Path) {
            if ($Path.StartsWith("\\?\UNC\")) { return "\\" + $Path.Substring(8) }
            if ($Path.StartsWith("\\?\")) { return $Path.Substring(4) }
            return $Path
        }
        function Remove-PiLongPathFile([string]$Path) {
            $long = ConvertTo-Win32LongPath $Path
            try {
                if ([System.IO.File]::Exists($long)) {
                    $size = [long](New-Object System.IO.FileInfo $long).Length
                    [System.IO.File]::Delete($long)
                    return $size
                }
            } catch { }
            return 0L
        }
        function Remove-PiLongPathDirectory([string]$Path) {
            $long = ConvertTo-Win32LongPath $Path
            try {
                if ([System.IO.Directory]::Exists($long)) {
                    [System.IO.Directory]::Delete($long, $true)
                    return $true
                }
            } catch { }
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
            return -not (Test-Path -LiteralPath $Path)
        }

        # Enumerate with \\?\ so paths > MAX_PATH are visible.
        $piFiles = New-Object System.Collections.Generic.List[string]
        try {
            $enumRoot = ConvertTo-Win32LongPath $piDest
            foreach ($f in [System.IO.Directory]::EnumerateFiles($enumRoot, "*", [System.IO.SearchOption]::AllDirectories)) {
                [void]$piFiles.Add((ConvertFrom-Win32LongPath $f))
            }
        } catch {
            Write-Warn "Long-path enumerate failed ($($_.Exception.Message)); falling back to Get-ChildItem (may miss deep paths)"
            Get-ChildItem -LiteralPath $piDest -Recurse -File -Force -ErrorAction SilentlyContinue |
                ForEach-Object { [void]$piFiles.Add($_.FullName) }
        }

        foreach ($path in $piFiles) {
            $name = [System.IO.Path]::GetFileName($path)
            $drop = $false
            # Source maps (incl. *.d.ts.map) — never needed at runtime; also the
            # files that most often exceed Windows MAX_PATH under @mistralai.
            if ($name -like "*.map") { $drop = $true }
            # Declarations — runtime only needs compiled .js.
            elseif ($name -like "*.d.ts" -or $name -like "*.d.mts" -or $name -like "*.d.cts") { $drop = $true }
            # TypeScript sources (not declarations — already handled above).
            elseif ($name -like "*.ts") { $drop = $true }
            elseif ($name -match '\.(test|spec)\.(js|mjs|cjs)$') { $drop = $true }

            if (-not $drop) { continue }
            $sz = Remove-PiLongPathFile $path
            if ($sz -gt 0) {
                $pruned++
                $pruneBytes += $sz
            }
        }

        # Test / CI scaffolding dirs (best-effort; short paths usually).
        foreach ($dirName in @("__tests__", "__mocks__", "test", "tests", ".github", ".husky", ".vscode", ".pi")) {
            Get-ChildItem -Path $piDest -Recurse -Directory -Filter $dirName -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -notmatch '[\\/]\.bin[\\/]' } |
                ForEach-Object {
                    $sz = 0L
                    try {
                        $long = ConvertTo-Win32LongPath $_.FullName
                        foreach ($f in [System.IO.Directory]::EnumerateFiles($long, "*", [System.IO.SearchOption]::AllDirectories)) {
                            try { $sz += [long](New-Object System.IO.FileInfo $f).Length } catch { }
                        }
                    } catch { }
                    if (Remove-PiLongPathDirectory $_.FullName) {
                        $pruneBytes += $sz
                    }
                }
        }

        # Cross-platform native prebuilds — Pi's native deps ship prebuilt
        # bindings for every OS/arch combo. Drop everything except the
        # host's. The Windows binary itself (x86_64-pc-windows-msvc) is
        # the only combo we ship on Windows.
        $hostOs = "win32"
        $hostArch = switch ($env:PROCESSOR_ARCHITECTURE) {
            "AMD64" { "x64" }
            "ARM64" { "arm64" }
            default { "x64" }
        }
        $prebuildDirs = @(Get-ChildItem -Path $piDest -Recurse -Directory -Filter "prebuilds" -ErrorAction SilentlyContinue)
        $nativePruned = 0
        foreach ($pbDir in $prebuildDirs) {
            $parent = $pbDir.Parent.FullName
            foreach ($sibling in @(Get-ChildItem -Path $parent -Directory -ErrorAction SilentlyContinue)) {
                $name = $sibling.Name
                if ($name -eq "${hostOs}-${hostArch}" -or
                    $name -eq $hostOs -or
                    $name -eq $hostArch -or
                    $name -eq "node-v127" -or
                    $name -eq "release" -or
                    $name -eq "debug") {
                    continue
                }
                if ($name -match '^(darwin|linux|win32|freebsd|openbsd)-' -or
                    $name -match '^armv7l$|^ia32$|^universal$' -or
                    $name -match '-(x64|arm64|armv7l|ia32|universal)$') {
                    if (Remove-PiLongPathDirectory $sibling.FullName) {
                        $nativePruned++
                    }
                }
            }
        }

        # Fail fast if anything still exceeds MAX_PATH — NSIS cannot pack it.
        $tooLong = New-Object System.Collections.Generic.List[string]
        try {
            $enumRoot = ConvertTo-Win32LongPath $piDest
            foreach ($f in [System.IO.Directory]::EnumerateFiles($enumRoot, "*", [System.IO.SearchOption]::AllDirectories)) {
                $normal = ConvertFrom-Win32LongPath $f
                if ($normal.Length -ge 260) { [void]$tooLong.Add($normal) }
            }
        } catch { }
        if ($tooLong.Count -gt 0) {
            Write-Fail ("Pi bundle still has {0} path(s) >= 260 chars (NSIS will fail). Example:`n  {1}`nRe-run with -ForcePi after pulling this prune fix, or use -SkipPi." -f $tooLong.Count, $tooLong[0])
            exit 1
        }

        if ($pruned -gt 0 -or $nativePruned -gt 0) {
            $pruneMb = [math]::Round($pruneBytes / 1MB, 1)
            Write-Ok "Pruned $pruned non-runtime files + $nativePruned cross-platform native prebuild dirs (~${pruneMb} MB)"
        } else {
            Write-Info "No prune targets found (already clean)"
        }
    } else {
        Write-Info "-SkipPiPrune: skipping Pi prune pass (-SkipPiPrune)"
    }

    # Post-stage smoke — mirrors scripts/smoke-pi-bundle.sh (bash twin runs
    # this inside stage-tauri-pi-bundle.sh). Catches "tree looks fine but
    # CLI crashes on import" before the NSIS link step.
    if ($env:SMOKE_PI -ne "0") {
        Write-Info "Running Pi post-stage smoke (set SMOKE_PI=0 to skip)..."
        $smokeNode = $null
        if (Test-Path $nodeExe) {
            $smokeNode = $nodeExe
        } elseif (Get-Command "node" -ErrorAction SilentlyContinue) {
            $smokeNode = (Get-Command "node").Source
        }
        if (-not $smokeNode) {
            Write-Fail "No Node binary available for Pi smoke"
            exit 1
        }
        $smokeLog = Join-Path ([System.IO.Path]::GetTempPath()) ("envoymesh-pi-smoke-" + [guid]::NewGuid().ToString("N") + ".log")
        $smokeOk = $false
        try {
            Push-Location $piDest
            try {
                $combined = & $smokeNode $piCli --help 2>&1 | Out-String
                $smokeExit = $LASTEXITCODE
            } finally {
                Pop-Location
            }
            Set-Content -LiteralPath $smokeLog -Value $combined -ErrorAction SilentlyContinue
            $bannerOk = $combined -match '(?i)pi[- ]coding[- ]agent|Usage:|\bpi\b'
            if ($smokeExit -ne 0) {
                Write-Host $combined
                Write-Fail "Pi smoke failed — CLI exited $smokeExit. Log: $smokeLog"
                exit 1
            }
            if (-not $bannerOk) {
                Write-Host $combined
                Write-Fail "Pi smoke failed — no recognisable --help banner. Log: $smokeLog"
                exit 1
            }
            $smokeOk = $true
            Write-Ok "Pi CLI smoke passed (exit 0, banner recognised)"
        } catch {
            Write-Fail "Pi smoke failed: $($_.Exception.Message)"
            exit 1
        } finally {
            if ($smokeOk) {
                Remove-Item -LiteralPath $smokeLog -ErrorAction SilentlyContinue
            }
        }
    } else {
        Write-Info "SMOKE_PI=0 — skipping Pi post-stage smoke"
    }
} else {
    Write-Info "Skipping Pi sidecar (-SkipPi). The bundle will NOT contain Pi; tauri.conf.slim.json (selected below) omits the resources/pi/**/* entry."
    # Clear a leftover Pi tree so a later full-config build cannot silently
    # pick up a half-staged copy from a previous run without re-verify.
    $piDestCleanup = Join-Path $TauriResources "pi"
    if (Test-Path $piDestCleanup) {
        Write-Info "Removing leftover resources\pi\ (slim build)."
        Remove-Item -Recurse -Force $piDestCleanup -ErrorAction SilentlyContinue
    }
}

# 1e. Sidecar smoke check (Social UI is verified after step 2 — Vite dist is
# not in git, so requiring it here breaks clean checkouts).
Write-Info "Sidecar smoke check (full verify runs after Social build)..."
$sidecarOk = $true
foreach ($r in @(
    @{ Path = $nodeExe; Label = "Node.js sidecar (node.exe)" },
    @{ Path = (Join-Path $TauriResources "node/dist/src/index.js"); Label = "compiled EnvoyMesh node" },
    @{ Path = (Join-Path $TauriResources "openclaw/openclaw.mjs"); Label = "OpenClaw gateway entry" },
    @{ Path = (Join-Path $TauriResources "openclaw/dist/entry.js"); Label = "OpenClaw compiled entry.js" }
)) {
    if (Test-Path $r.Path) {
        Write-Ok $r.Label
    } else {
        Write-Fail "missing $($r.Label) at $($r.Path)"
        $sidecarOk = $false
    }
}
if (-not $SkipPi) {
    $piCli = Join-Path $TauriResources "pi/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
    if (Test-Path $piCli) {
        Write-Ok "Pi CLI entry"
    } else {
        Write-Fail "missing Pi CLI entry at $piCli"
        $sidecarOk = $false
    }
}
if (-not $sidecarOk) {
    Write-Fail "Tauri sidecars incomplete — see failures above."
    exit 1
}
Write-Ok "Sidecars look complete (full resource verify after Social)"
Write-Host ""

# -----------------------------------------------------------------------------
# Step 2: Build Social UI (Tauri frontendDist → apps/social/src/dist)
# Social includes family-network Settings UI + all i18n locales.
# -----------------------------------------------------------------------------

Write-Step "2/5  Building Social UI..."
# Build via workspace from repo root — never `cd apps/social; npm install`.
# Nested install re-resolves @envoymesh/* against the public registry and 404s
# (those packages are private workspace links only).
# Also require Tauri updater JS plugins — Social's tsc imports them for OTA.
# An older node_modules can have @envoymesh/api but miss these after a pull.
$socialDepRoots = @(
    (Join-Path $RepoRoot "node_modules\@envoymesh\api"),
    (Join-Path $RepoRoot "node_modules\@tauri-apps\plugin-updater"),
    (Join-Path $RepoRoot "node_modules\@tauri-apps\plugin-process")
)
$missingSocialDeps = @($socialDepRoots | Where-Object { -not (Test-Path $_) })
if ($missingSocialDeps.Count -gt 0) {
    Write-Info "Installing root dependencies (missing: $($missingSocialDeps -join ', '))..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install failed"
        exit 1
    }
}
Write-Info "Vite build (npm run social:build)..."
$socialExit = Invoke-ExternalQuiet npm run social:build
if ($socialExit -ne 0) {
    Write-Fail "Social UI build failed"
    exit 1
}
if (-not (Test-Path $SocialDist)) {
    Write-Fail "Social UI build did not produce $SocialDist"
    exit 1
}
Write-Ok "Social UI built at apps\social\src\dist"
Write-Host ""

# Full verify after Social (mirrors scripts/verify-tauri-resources.sh).
Write-Info "Verifying Tauri bundle resources (post-Social)..."
$verifyOk = $true
$reqFiles = @(
    @{ Path = $nodeExe; Label = "Node.js sidecar (node.exe)" },
    @{ Path = (Join-Path $TauriResources "node/dist/src/index.js"); Label = "compiled EnvoyMesh node" },
    @{ Path = (Join-Path $TauriResources "openclaw/openclaw.mjs"); Label = "OpenClaw gateway entry" },
    @{ Path = (Join-Path $TauriResources "openclaw/dist/entry.js"); Label = "OpenClaw compiled entry.js" },
    @{ Path = (Join-Path $TauriResources "openclaw/extensions/envoymesh/index.js"); Label = "EnvoyMesh channel extension (compiled)" },
    @{ Path = (Join-Path $TauriResources "openclaw/dist/extensions/envoymesh/index.js"); Label = "EnvoyMesh channel extension (dist/extensions)" },
    @{ Path = (Join-Path $TauriResources "openclaw-envoymesh/index.js"); Label = "EnvoyMesh extension seed (runtime heal)" },
    @{ Path = $SocialDist; Label = "built Social UI" }
)
if (-not $SkipPi) {
    $reqFiles += @(
        @{ Path = (Join-Path $TauriResources "pi/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"); Label = "Pi CLI entry" },
        @{ Path = (Join-Path $TauriResources "pi/node_modules/@earendil-works/pi-coding-agent/dist/index.js"); Label = "Pi SDK entry" },
        @{ Path = (Join-Path $TauriResources "pi/node_modules/@earendil-works/pi-coding-agent/package.json"); Label = "Pi package.json" }
    )
}
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
$selfRef = Join-Path $TauriResources "openclaw/node_modules/openclaw/package.json"
if (-not (Test-Path $selfRef)) {
    Write-Fail "OpenClaw node_modules\openclaw\package.json is missing — gateway will refuse to start"
    Write-Info "  Re-run with -ForceOpenClaw to regenerate, or check that the heal above ran."
    $verifyOk = $false
} else {
    Write-Ok "OpenClaw node_modules\openclaw\ self-reference"
}
$stagedEntryJs = Join-Path $TauriResources "openclaw/dist/entry.js"
if (Test-Path $stagedEntryJs) {
    $entryContent = Get-Content $stagedEntryJs -Raw -ErrorAction SilentlyContinue
    if ($entryContent -and ($entryContent -match "EnvoyMesh bootstrap" -or $entryContent -match "from.*src/cli/run-main")) {
        Write-Fail "OpenClaw dist/entry.js is a runtime stub — rebuild OpenClaw or use -ForceOpenClaw"
        $verifyOk = $false
    }
} else {
    Write-Fail "OpenClaw dist/entry.js missing"
    $verifyOk = $false
}
if (-not $verifyOk) {
    Write-Fail "Tauri resources incomplete — see failures above."
    exit 1
}
Write-Ok "Tauri resources look complete"

# Push credentials — if repo-root push-config.json exists, it must be in the bundle.
# Enables iOS APNs + Android FCM from this home node to EnvoyGo clients.
$rootPushCfg = Join-Path $RepoRoot "push-config.json"
$pushCfg = Join-Path $TauriResources "node\push-config.json"
if (Test-Path $rootPushCfg) {
    if (-not (Test-Path $pushCfg)) {
        Write-Fail "repo-root push-config.json exists but was not staged into resources\node\ — re-run node staging / stage-tauri-push-credentials.ps1"
        exit 1
    }
    Write-Ok "push-config.json bundled in resources\node\"
    try {
        $pc = Get-Content -Raw $pushCfg | ConvertFrom-Json
        $keyBase = if ($pc.apns -and $pc.apns.keyPath) { [System.IO.Path]::GetFileName([string]$pc.apns.keyPath) } else { "AuthKey_LKPCR48WHW.p8" }
        $saBase = if ($pc.fcm -and $pc.fcm.serviceAccountJsonPath) { [System.IO.Path]::GetFileName([string]$pc.fcm.serviceAccountJsonPath) } else { "serviceAccountKey.json" }
        if (Test-Path (Join-Path $TauriResources "node\$keyBase")) {
            Write-Ok "APNs key: $keyBase"
        } else {
            Write-Fail "push-config.json bundled but missing $keyBase in resources\node\ (required for EnvoyGo iOS push)"
            exit 1
        }
        if (Test-Path (Join-Path $TauriResources "node\$saBase")) {
            Write-Ok "FCM account: $saBase"
        } else {
            Write-Fail "push-config.json bundled but missing $saBase in resources\node\ (required for EnvoyGo Android push)"
            exit 1
        }
    } catch {
        Write-Warn "Could not parse staged push-config.json: $($_.Exception.Message)"
    }
} elseif (Test-Path $pushCfg) {
    Write-Ok "push-config.json present in resources\node\"
} else {
    Write-Warn "No push-config.json in resources\node\ — desktop push will need env vars or a profile-dir config"
}
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
# If cl/link aren't on PATH, try to source vcvars64.bat from a Visual Studio
# install. VS Build Tools doesn't add MSVC to the global PATH by design, so
# this is the common case for anyone running the script from regular PowerShell.
Import-VcVarsIfNeeded
# Confirm MSVC toolchain. tauri build needs the C++ workload installed via
# Visual Studio Build Tools. We surface a warning rather than failing hard
# because the user may have a different-but-equivalent setup.
$cl = Get-Command "cl" -ErrorAction SilentlyContinue
$link = Get-Command "link" -ErrorAction SilentlyContinue
if (-not $cl -or -not $link) {
    Write-Warn "MSVC `cl`/`link` not on PATH — install Visual Studio Build Tools 2022 with the 'Desktop development with C++' workload (https://visualstudio.microsoft.com/visual-cpp-build-tools/). Run this script from a 'Developer Command Prompt for VS 2022' if the workload is installed but cl/link still aren't found."
}

# Tauri CLI. Prefer `cargo tauri` (the cargo subcommand) when available; fall
# back to `npx tauri` (the JS wrapper). cargo install tauri-cli installs to
# %USERPROFILE%\.cargo\bin, so the next session finds it without -g.
$tauriCmd = $null
if (Get-Command "cargo-tauri" -ErrorAction SilentlyContinue) {
    $tauriCmd = "cargo"
} elseif (Get-Command "npx" -ErrorAction SilentlyContinue) {
    $tauriCmd = "npx"
} else {
    Write-Info "Installing @tauri-apps/cli globally..."
    npm install -g @tauri-apps/cli
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Could not install @tauri-apps/cli"
        exit 1
    }
    $tauriCmd = "npx"
}
# Build the tauri args. -SkipMsi (default $true) restricts tauri to the NSIS
# bundle, dodging the slow light.exe link step on the 3 GB resource tree.
# Use -SkipMsi:$false to also produce a WiX .msi (for enterprise deployment).
#
# Slim / Full / default config selection (mirrors apps/tauri/package.json's
# build:win / build:win:full / build scripts):
#   -SkipPi   → --config src-tauri/tauri.conf.slim.json  (Pi + Kubo omitted)
#   -Full     → --config src-tauri/tauri.conf.full.json  (explicit full preset)
#   default   → no --config flag                         (uses tauri.conf.json)
#
# Refuse nonsensical combinations rather than silently picking one.
if ($SkipPi -and $Full) {
    Write-Fail "-SkipPi and -Full are mutually exclusive (-SkipPi picks the slim config)."
    exit 1
}
$tauriArgs = @("tauri", "build")
if ($SkipMsi) {
    $tauriArgs += @("--bundles", "nsis")
}
if ($SkipPi) {
    $slimConf = Join-Path $TauriSrcDir "tauri.conf.slim.json"
    if (-not (Test-Path $slimConf)) {
        Write-Fail "slim config not found at $slimConf (cannot honor -SkipPi)"
        exit 1
    }
    Write-Info "Slim config: tauri.conf.slim.json (Pi + Kubo omitted)"
    $tauriArgs += @("--config", $slimConf)
} elseif ($Full) {
    $fullConf = Join-Path $TauriSrcDir "tauri.conf.full.json"
    if (-not (Test-Path $fullConf)) {
        Write-Fail "full config not found at $fullConf (cannot honor -Full)"
        exit 1
    }
    Write-Info "Full config: tauri.conf.full.json (all sidecars explicit)"
    $tauriArgs += @("--config", $fullConf)
} else {
    Write-Info "Default config: tauri.conf.json (Pi + OpenClaw + Kubo)"
}

Push-Location $TauriAppDir
try {
    # Install from repo root via workspace — never plain `npm install` here.
    # Nested install walks the whole monorepo and tries to fetch private
    # @envoymesh/* packages from the public registry (E404).
    $tauriCli = @(
        (Join-Path $RepoRoot "node_modules\@tauri-apps\cli"),
        (Join-Path $TauriAppDir "node_modules\@tauri-apps\cli")
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $tauriCli) {
        Write-Info "Installing @envoymesh/tauri dependencies (workspace from repo root)..."
        Push-Location $RepoRoot
        try {
            $niExit = Invoke-ExternalQuiet npm install -w "@envoymesh/tauri" -Stream
            if ($niExit -ne 0) {
                Write-Fail "npm install -w @envoymesh/tauri failed"
                Pop-Location
                Pop-Location
                exit 1
            }
        } finally {
            Pop-Location
        }
    }

    # (Typecheck already done in Step 1.)

    # Resource size check — NSIS has a hard 2 GB installer cap. When the
    # bundled tree (Node sidecar + EnvoyMesh node + OpenClaw + Social UI)
    # approaches that, makensis fails deep inside the build with a vague
    # "stale temp file" message and the real error is hidden. Print the
    # staged size up-front so the next failure mode is at least visible.
    $resourceBytes = 0L
    if (Test-Path $TauriResources) {
        $sum = (Get-ChildItem -Path $TauriResources -Recurse -File -ErrorAction SilentlyContinue |
                Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
        if ($null -ne $sum) { $resourceBytes = [long]$sum }
    }
    $resourceMb = [math]::Round($resourceBytes / 1MB, 1)
    Write-Info "Staged Tauri resources: $resourceMb MB"
    if ($resourceBytes -gt 1.8GB) {
        Write-Fail "Resources exceed 1.8 GB — NSIS will likely fail. Switch to WiX with -SkipMsi:`$false or shrink the staged tree."
        Pop-Location
        exit 1
    } elseif ($resourceBytes -gt 1.5GB) {
        Write-Warn "Resources exceed 1.5 GB — NSIS (2 GB hard cap) is at risk. Consider WiX instead (-SkipMsi:`$false) or trim packages\openclaw\extensions\."
    }

    # Stream the Tauri build live. Tauri/Cargo/makensis together emit a
    # lot of output over 5-15 min, and the failure (if any) is usually
    # well above the last 30 lines. Tee-Object through -Stream means the
    # operator sees progress AND the full log lands in the temp file
    # that Invoke-ExternalQuiet preserves on failure.
    Write-Info "Tauri build (x86_64-pc-windows-msvc) — this can take 5-15 minutes..."
    $tauriBuildExit = Invoke-ExternalQuiet $tauriCmd @tauriArgs -Stream
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
