# =============================================================================
# Stage envoy-harness packages for Tauri desktop bundles.
#
# PowerShell twin of scripts/stage-tauri-envoy-harness-bundle.sh. Builds the
# sibling envoy-harness monorepo and copies dist/ into the Tauri resources/
# tree so the bundle is self-contained.
#
# Packages staged:
#   envoy-harness, envoy-harness-adapter, envoy-harness-client,
#   envoy-harness-peer, envoy-harness-tui
#
# This is the RELEASE counterpart to the DEV flow (which uses pnpm link:
# paths + live symlinks). See docs/envoy-harness-integration-EnvoyMesh.md
# section 5 for the full design.
#
# Usage (from the repo root, in PowerShell):
#   .\scripts\stage-tauri-envoy-harness-bundle.ps1
#
# Environment variables (read at invocation time):
#   $env:STAGE_ENVOY_HARNESS = "0"   Skip envoy-harness staging entirely
#                                   (debug only — bundle will not have
#                                   envoy-harness at runtime).
#   $env:STAGE_ENVOY_HARNESS = "1"   Force a clean rebuild + overwrite. Runs
#                                   `pnpm -F <pkg> clean` (best-effort —
#                                   swallows "no clean script" errors)
#                                   then `pnpm -F <pkg> build`. The clean
#                                   step clears .tsbuildinfo + dist/.
#                                   Use after switching sibling-repo
#                                   branches or when you want to be sure
#                                   the staged tree is from-scratch.
#                                   Default (unset): incremental rebuild —
#                                   pnpm's tsc skips unchanged sources.
#   $env:ENVOY_HARNESS_DIR  = "..."  Override the sibling monorepo path.
#                                   Default: $Root\..\envoy-harness.
#   $env:SMOKE_ENVOY_HARNESS = "0"  Skip the post-stage smoke (default 1).
# =============================================================================
param()

$ErrorActionPreference = "Stop"

# Prefer $PSScriptRoot — $MyInvocation.MyCommand.Path can be $null when the
# script is invoked via `& path.ps1` under some hosts, which then throws
# "You cannot call a method on a null-valued expression".
if ($PSScriptRoot) {
    $Root = Split-Path -Parent $PSScriptRoot
} else {
    $scriptPath = $MyInvocation.MyCommand.Path
    if (-not $scriptPath) { throw "Cannot resolve script path (PSScriptRoot and MyInvocation.MyCommand.Path are both empty)" }
    $Root = Split-Path -Parent (Split-Path -Parent $scriptPath)
}

# Sibling monorepo default: $Root\..\envoy-harness. Honour $env:ENVOY_HARNESS_DIR
# override (useful for CI where the sibling repo is checked out elsewhere).
$envHarnessDir = $env:ENVOY_HARNESS_DIR
if (-not $envHarnessDir) {
    $envHarnessDir = Join-Path (Split-Path -Parent $Root) "envoy-harness"
}
$DestBase = Join-Path $Root "apps\tauri\src-tauri\resources"
$StageMode = $env:STAGE_ENVOY_HARNESS
$SmokeEnabled = $true
if ($env:SMOKE_ENVOY_HARNESS -eq "0") { $SmokeEnabled = $false }

function Write-Info([string]$m) { Write-Host "  $m" }
function Write-Ok([string]$m) { Write-Host "  OK $m" -ForegroundColor Green }
function Write-Fail([string]$m) { Write-Host "  FAIL $m" -ForegroundColor Red; exit 1 }
function Write-Warn([string]$m) { Write-Host "  WARN $m" -ForegroundColor Yellow }

# ---- Skip gate ------------------------------------------------------------
if ($StageMode -eq "0") {
    Write-Host "[stage-tauri-envoy-harness-bundle] STAGE_ENVOY_HARNESS=0 — skipping envoy-harness resources staging."
    Write-Info "NOTE: apps/node still statically imports @envoymesh/envoy-harness-adapter (+ client/peer)."
    Write-Info "stage-bundle-node-runtime.ps1 will refuse STAGE_ENVOY_HARNESS=0 unless ENVOYMESH_ALLOW_BROKEN_HARNESS_SKIP=1 (non-runnable debug bundle)."
    exit 0
}

# ---- Locate the sibling monorepo -----------------------------------------
if (-not (Test-Path $envHarnessDir)) {
    Write-Fail "ENVOY_HARNESS_DIR=$envHarnessDir not found. Set `$env:ENVOY_HARNESS_DIR=/path/to/envoy-harness, or place the sibling monorepo at $envHarnessDir. Use `$env:STAGE_ENVOY_HARNESS=0 to skip for debug."
}

$requiredPkgs = @(
    "envoy-harness",
    "envoy-harness-adapter",
    "envoy-harness-client",
    "envoy-harness-peer",
    "envoy-harness-tui"
)
foreach ($pkg in $requiredPkgs) {
    $pkgPath = Join-Path $envHarnessDir "packages\$pkg"
    if (-not (Test-Path $pkgPath)) {
        Write-Fail "$envHarnessDir\packages\$pkg missing — wrong repo at ENVOY_HARNESS_DIR?"
    }
}

Write-Host "[stage-tauri-envoy-harness-bundle] Sibling monorepo: $envHarnessDir"

# ---- pnpm sanity check ----------------------------------------------------
$pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpmCmd) {
    Write-Fail "pnpm not on PATH. Install pnpm 9+ or activate via corepack."
}

# ---- Build packages -------------------------------------------------------
# When STAGE_ENVOY_HARNESS=1, run `pnpm -F <pkg> clean` first so tsc's
# incremental cache (.tsbuildinfo) is dropped. Default = incremental build.
$forceRebuild = $false
if ($StageMode -eq "1") {
    $forceRebuild = $true
    Write-Info "STAGE_ENVOY_HARNESS=1 — clean rebuild of envoy-harness packages."
}

function Build-Package([string]$PkgFilter, [string]$Label) {
    Write-Info "Building $Label (Package: $PkgFilter)..."
    if ($forceRebuild) {
        & pnpm -C $envHarnessDir -F $PkgFilter clean 2>&1 | Out-Null
    }
    $output = & pnpm -C $envHarnessDir -F $PkgFilter build 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Host $output
        Write-Fail "$Label build failed (exit $LASTEXITCODE). Aborting."
    }
    Write-Host ($output -split "`n" | Select-Object -Last 5)
}

Build-Package "@envoymesh/envoy-harness"            "Package 1 (envoy-harness)"
Build-Package "@envoymesh/envoy-harness-client"     "Package client (ACP client)"
Build-Package "@envoymesh/envoy-harness-adapter"   "Package 3 (envoy-harness-adapter)"
Build-Package "@envoymesh/envoy-harness-peer"      "Package peer (mesh submitter)"
Build-Package "@envoymesh/envoy-harness-tui"       "Package TUI (terminal host)"

# ---- Stage dist/ → resources/ -------------------------------------------
function Stage-Dist([string]$SrcPkg, [string]$DestName) {
    $srcDist = Join-Path $envHarnessDir (Join-Path "packages\$SrcPkg" "dist")
    $destDir = Join-Path $DestBase $DestName

    if (-not (Test-Path $srcDist)) {
        Write-Fail "$srcDist not found after build. Build output missing."
    }

    if (Test-Path $destDir) { Remove-Item -Recurse -Force $destDir }
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -Recurse -Force (Join-Path $srcDist "*") $destDir
    # Flattened dist/ needs a package.json whose main/exports point at
    # ./index.js (not ./dist/index.js). Mirrors the bash twin.
    $srcPkgJson = Join-Path $envHarnessDir "packages\$SrcPkg\package.json"
    if (Test-Path $srcPkgJson) {
        $src = Get-Content $srcPkgJson -Raw | ConvertFrom-Json
        $out = [ordered]@{
            name = $src.name
            version = if ($src.version) { $src.version } else { "0.0.0" }
            type = "module"
            main = "./index.js"
            types = "./index.d.ts"
            exports = [ordered]@{
                "." = [ordered]@{
                    types = "./index.d.ts"
                    import = "./index.js"
                }
            }
        }
        # TUI entry is bin.js (not index.js) — keep main honest for the flatten.
        if ($SrcPkg -eq "envoy-harness-tui") {
            $out.main = "./bin.js"
            $out.exports = [ordered]@{
                "." = [ordered]@{
                    types = "./index.d.ts"
                    import = "./index.js"
                }
            }
        }
        ($out | ConvertTo-Json -Depth 5) + "`n" | Set-Content -Path (Join-Path $destDir "package.json") -Encoding UTF8 -NoNewline
    }
    New-Item -ItemType File -Force -Path (Join-Path $destDir ".keep") | Out-Null

    $count = @(Get-ChildItem -Path $destDir -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Ok "$count files staged at resources\$DestName\"
}

Stage-Dist "envoy-harness"            "envoy-harness"
Stage-Dist "envoy-harness-adapter"   "envoy-harness-adapter"
Stage-Dist "envoy-harness-client"    "envoy-harness-client"
Stage-Dist "envoy-harness-peer"      "envoy-harness-peer"
Stage-Dist "envoy-harness-tui"       "envoy-harness-tui"

# ---- Post-stage smoke -----------------------------------------------------
if ($SmokeEnabled) {
    Write-Host ""
    Write-Host "[stage-tauri-envoy-harness-bundle] Running post-stage smoke (set SMOKE_ENVOY_HARNESS=0 to skip)..."

    $harnessDest = Join-Path $DestBase "envoy-harness"
    $adapterDest = Join-Path $DestBase "envoy-harness-adapter"
    $clientDest = Join-Path $DestBase "envoy-harness-client"
    $peerDest = Join-Path $DestBase "envoy-harness-peer"
    $tuiDest = Join-Path $DestBase "envoy-harness-tui"

    $harnessCount = @(Get-ChildItem -Path $harnessDest -Recurse -File -ErrorAction SilentlyContinue).Count
    $adapterCount = @(Get-ChildItem -Path $adapterDest -Recurse -File -ErrorAction SilentlyContinue).Count
    $clientCount = @(Get-ChildItem -Path $clientDest -Recurse -File -ErrorAction SilentlyContinue).Count
    $peerCount = @(Get-ChildItem -Path $peerDest -Recurse -File -ErrorAction SilentlyContinue).Count
    $tuiCount = @(Get-ChildItem -Path $tuiDest -Recurse -File -ErrorAction SilentlyContinue).Count
    if ($harnessCount -lt 50) { Write-Fail "smoke FAIL: envoy-harness staged tree has only $harnessCount files (expected 100+)" }
    if ($adapterCount -lt 5)  { Write-Fail "smoke FAIL: envoy-harness-adapter staged tree has only $adapterCount files (expected 10+)" }
    if ($clientCount -lt 2)   { Write-Fail "smoke FAIL: envoy-harness-client staged tree has only $clientCount files (expected 3+)" }
    if ($peerCount -lt 5)     { Write-Fail "smoke FAIL: envoy-harness-peer staged tree has only $peerCount files (expected 10+)" }
    if ($tuiCount -lt 10)     { Write-Fail "smoke FAIL: envoy-harness-tui staged tree has only $tuiCount files (expected 20+)" }

    foreach ($f in @(
        (Join-Path $harnessDest "index.js"),
        (Join-Path $harnessDest "index.d.ts"),
        (Join-Path $harnessDest "package.json"),
        (Join-Path $harnessDest "cli\acp-stdio.js"),
        (Join-Path $adapterDest "index.js"),
        (Join-Path $adapterDest "index.d.ts"),
        (Join-Path $adapterDest "package.json"),
        (Join-Path $clientDest "index.js"),
        (Join-Path $clientDest "index.d.ts"),
        (Join-Path $clientDest "package.json"),
        (Join-Path $peerDest "index.js"),
        (Join-Path $peerDest "package.json"),
        (Join-Path $tuiDest "bin.js"),
        (Join-Path $tuiDest "package.json")
    )) {
        if (-not (Test-Path $f)) { Write-Fail "smoke FAIL: $f missing" }
        if ((Get-Item $f).Length -eq 0) { Write-Fail "smoke FAIL: $f is 0 bytes (build may be broken)" }
    }

    Write-Ok "Post-stage smoke passed ($harnessCount + $adapterCount + $clientCount + $peerCount + $tuiCount files, all entry points present and non-empty)"
}

Write-Host "[stage-tauri-envoy-harness-bundle] Done."
Write-Info "Tauri will pick up resources\envoy-harness{,-adapter,-client,-peer,-tui}\ via the globs in apps\tauri\src-tauri\tauri.conf.json."
Write-Info "ACP stdio entry: resources\envoy-harness\cli\acp-stdio.js (12b)."
Write-Info "TUI entry: resources\envoy-harness-tui\bin.js (Terminal → Envoy)."
Write-Info "Runtime resolve goes through resources\node\node_modules\@envoymesh\ (wired by stage-bundle-node-runtime.ps1 — required for first launch)."
