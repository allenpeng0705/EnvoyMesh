# =============================================================================
# Stage envoy-harness + envoy-harness-adapter for Tauri desktop bundles.
#
# PowerShell twin of scripts/stage-tauri-envoy-harness-bundle.sh. Builds the
# sibling envoy-harness monorepo (Package 1 + Package 3) and copies their
# dist/ into the Tauri resources/ tree so the bundle is self-contained.
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
#                                   The smoke asserts the staged tree has
#                                   both packages, each with a non-trivial
#                                   file count, and the main index.js +
#                                   index.d.ts entries exist + are non-empty.
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
    Write-Info "NOTE: apps/node still statically imports @envoymesh/envoy-harness-adapter."
    Write-Info "stage-bundle-node-runtime.ps1 will refuse STAGE_ENVOY_HARNESS=0 unless ENVOYMESH_ALLOW_BROKEN_HARNESS_SKIP=1 (non-runnable debug bundle)."
    exit 0
}

# ---- Locate the sibling monorepo -----------------------------------------
if (-not (Test-Path $envHarnessDir)) {
    Write-Fail "ENVOY_HARNESS_DIR=$envHarnessDir not found. Set `$env:ENVOY_HARNESS_DIR=/path/to/envoy-harness, or place the sibling monorepo at $envHarnessDir. Use `$env:STAGE_ENVOY_HARNESS=0 to skip for debug."
}

$pkg1Src = Join-Path $envHarnessDir "packages\envoy-harness"
$pkg3Src = Join-Path $envHarnessDir "packages\envoy-harness-adapter"
if (-not (Test-Path $pkg1Src) -or -not (Test-Path $pkg3Src)) {
    Write-Fail "$envHarnessDir\packages\envoy-harness{,-adapter} missing — wrong repo at ENVOY_HARNESS_DIR?"
}

Write-Host "[stage-tauri-envoy-harness-bundle] Sibling monorepo: $envHarnessDir"

# ---- pnpm sanity check ----------------------------------------------------
$pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpmCmd) {
    Write-Fail "pnpm not on PATH. Install pnpm 9+ or activate via corepack."
}

# ---- Build Package 1 (envoy-harness itself) -------------------------------
# When STAGE_ENVOY_HARNESS=1, run `pnpm -F <pkg> clean` first so tsc's
# incremental cache (.tsbuildinfo) is dropped. Default = incremental build
# (tsc skips unchanged sources — fast for the common case where the
# sibling repo hasn't changed since last build).
$forceRebuild = $false
if ($StageMode -eq "1") {
    $forceRebuild = $true
    Write-Info "STAGE_ENVOY_HARNESS=1 — clean rebuild of both packages."
}

function Build-Package([string]$PkgFilter, [string]$Label) {
    Write-Info "Building $Label (Package: $PkgFilter)..."
    # tail -20 mirrors the openclaw vendor script's output limit.
    if ($forceRebuild) {
        # clean is in the package.json scripts; it's a `rm -rf dist *.tsbuildinfo`.
        # Swallow non-zero exit (some packages may not define `clean`); only
        # the build's exit code matters.
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
Build-Package "@envoymesh/envoy-harness-adapter"   "Package 3 (envoy-harness-adapter)"

# ---- Stage dist/ → resources/ -------------------------------------------
# Idempotency: rm -rf before copy. Re-runs do not accumulate stale files.
# .keep is re-touched after copy so the git-tracked sentinel (which
# survives only the empty-dir state on a fresh clone) stays in place
# after rm -rf. Without the touch, `git status` would show
# "D .keep" after every build.
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
        ($out | ConvertTo-Json -Depth 5) + "`n" | Set-Content -Path (Join-Path $destDir "package.json") -Encoding UTF8 -NoNewline
    }
    # Restore the .keep sentinel so the working tree stays clean after staging.
    # Empty content is fine; .keep only exists to keep the empty dir tracked.
    New-Item -ItemType File -Force -Path (Join-Path $destDir ".keep") | Out-Null

    $count = @(Get-ChildItem -Path $destDir -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Ok "$count files staged at resources\$DestName\"
}

Stage-Dist "envoy-harness"            "envoy-harness"
Stage-Dist "envoy-harness-adapter"   "envoy-harness-adapter"

# ---- Post-stage smoke -----------------------------------------------------
# Mirrors the bash script: assert the staged tree has both packages, each
# with a non-trivial file count, and the main index.js + index.d.ts entry
# files exist + are non-empty. Does NOT do a dynamic import — the staged
# dist/ has no node_modules of its own (envoy-harness's runtime deps ship
# with the host process, not the bundle), so a dynamic import would fail
# for environment reasons unrelated to bundling correctness. Catches
# "stage ran but tree is broken" before Tauri bundles the .dmg / NSIS /
# AppImage.
if ($SmokeEnabled) {
    Write-Host ""
    Write-Host "[stage-tauri-envoy-harness-bundle] Running post-stage smoke (set SMOKE_ENVOY_HARNESS=0 to skip)..."

    $harnessDest = Join-Path $DestBase "envoy-harness"
    $adapterDest = Join-Path $DestBase "envoy-harness-adapter"

    # 1. Both staged trees have a non-trivial number of files.
    $harnessCount = @(Get-ChildItem -Path $harnessDest -Recurse -File -ErrorAction SilentlyContinue).Count
    $adapterCount = @(Get-ChildItem -Path $adapterDest -Recurse -File -ErrorAction SilentlyContinue).Count
    if ($harnessCount -lt 50) { Write-Fail "smoke FAIL: envoy-harness staged tree has only $harnessCount files (expected 100+)" }
    if ($adapterCount -lt 5)  { Write-Fail "smoke FAIL: envoy-harness-adapter staged tree has only $adapterCount files (expected 10+)" }

    # 2. Both staged trees have the main entry file. The source package.json
    #    says main: "./dist/index.js", and the stage script copies dist/ to
    #    the root of the dest dir, so the main entry is at index.js.
    foreach ($f in @(
        (Join-Path $harnessDest "index.js"),
        (Join-Path $harnessDest "index.d.ts"),
        (Join-Path $harnessDest "package.json"),
        (Join-Path $adapterDest "index.js"),
        (Join-Path $adapterDest "index.d.ts"),
        (Join-Path $adapterDest "package.json")
    )) {
        if (-not (Test-Path $f)) { Write-Fail "smoke FAIL: $f missing" }
        if ((Get-Item $f).Length -eq 0) { Write-Fail "smoke FAIL: $f is 0 bytes (build may be broken)" }
    }

    Write-Ok "Post-stage smoke passed ($harnessCount + $adapterCount files, all entry points present and non-empty)"
}

Write-Host "[stage-tauri-envoy-harness-bundle] Done."
Write-Info "Tauri will pick up resources\envoy-harness\ and resources\envoy-harness-adapter\ via the globs in apps\tauri\src-tauri\tauri.conf.json."
Write-Info "Runtime resolve goes through resources\node\node_modules\@envoymesh\ (wired by stage-bundle-node-runtime.ps1 — required for first launch)."
