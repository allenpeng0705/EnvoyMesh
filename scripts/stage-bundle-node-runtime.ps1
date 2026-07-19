# Stage compiled EnvoyMesh node runtime (dist + workspace packages + prod npm deps).
# Used by scripts/bundle.ps1 and Tauri staging on Windows.
param(
    [Parameter(Mandatory = $true)]
    [string]$Dest
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Src = Join-Path $Root "apps/node/dist"

if (-not (Test-Path (Join-Path $Src "src/index.js"))) {
    Write-Error "Missing $Src/src/index.js — run: npm run node:build"
}

if (Test-Path $Dest) {
    Remove-Item -Recurse -Force $Dest
}
New-Item -ItemType Directory -Force -Path (Join-Path $Dest "node_modules") | Out-Null

Write-Host "  Copying compiled node entrypoints..."
$distDest = Join-Path $Dest "dist"
New-Item -ItemType Directory -Force -Path $distDest | Out-Null
Copy-Item -Recurse -Force "$Src/*" $distDest

@'
{
  "name": "@envoymesh/node-bundle",
  "version": "0.1.0",
  "type": "module",
  "private": true
}
'@ | Set-Content -Path (Join-Path $Dest "package.json") -Encoding UTF8

# Discover workspace packages dynamically. We used to hardcode a list, but
# new packages (kb-obsidian, mobile-*, openclaw-runtime) kept getting missed
# on Windows — npm ls silently dropped them and the hardcoded list didn't
# include them. Mirror the bash twin's dynamic discovery instead.
Write-Host "  Staging @envoymesh workspace packages..."
$stagedWorkspacePkgs = 0
foreach ($pkgDir in (Get-ChildItem -Path (Join-Path $Root "packages") -Directory -ErrorAction SilentlyContinue)) {
    $pkg = $pkgDir.Name
    # packages/openclaw is pnpm-managed separately and staged as a flat
    # tree under resources/openclaw/, not as @envoymesh/openclaw.
    if ($pkg -eq "openclaw") { continue }
    $srcPkg = $pkgDir.FullName
    if (-not (Test-Path (Join-Path $srcPkg "dist"))) { continue }
    $destPkg = Join-Path $Dest "node_modules/@envoymesh/$pkg"
    New-Item -ItemType Directory -Force -Path $destPkg | Out-Null
    Copy-Item -Force (Join-Path $srcPkg "package.json") $destPkg
    Copy-Item -Recurse -Force (Join-Path $srcPkg "dist") $destPkg
    $stagedWorkspacePkgs++
}
Write-Host "  Staged $stagedWorkspacePkgs @envoymesh workspace packages"

Write-Host "  Staging production npm dependencies..."
$npmLines = @()
try {
    $npmLines = npm ls --omit=dev -w @envoymesh/node --all --parseable 2>$null
} catch {
    $npmLines = @()
}

foreach ($modPath in $npmLines) {
    if ([string]::IsNullOrWhiteSpace($modPath)) { continue }
    switch -Wildcard ($modPath) {
        "$Root" { continue }
        "$Root/apps/node" { continue }
        "$Root/node_modules/@envoymesh/node" { continue }
        "$Root/packages/*" { continue }
        "$Root/node_modules/@envoymesh/*" { continue }
    }
    if (-not (Test-Path (Join-Path $modPath "package.json"))) { continue }
    # Read package.json via PowerShell instead of `node -e` — the `node -e`
    # form breaks on Windows because `process.argv[1]` for `node -e` is the
    # literal string "[eval]" (not the user-supplied path), so `require()`
    # throws "Cannot find module '[eval]'" and the node process exits
    # non-zero. Callers that check $LASTEXITCODE would then see a false
    # failure even though the copy below succeeded.
    $pkgJson = $null
    try {
        $pkgJson = Get-Content (Join-Path $modPath "package.json") -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    } catch {
        continue
    }
    $pkgName = $pkgJson.name
    if ([string]::IsNullOrWhiteSpace($pkgName)) { continue }
    if ($pkgName -like "@envoymesh/*") { continue }
    $destMod = Join-Path $Dest "node_modules/$pkgName"
    if (Test-Path $destMod) { continue }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destMod) | Out-Null
    Copy-Item -Recurse -Force $modPath $destMod
}

# Safety net: scan every staged @envoymesh/* package's declared dependencies
# and copy any that are missing from the staged node_modules. This catches
# transitive deps that `npm ls --omit=dev -w @envoymesh/node` silently drops
# on Windows when peer-dep or workspace-resolution warnings cause it to emit
# partial output (PowerShell's try/catch can't distinguish partial from
# complete — the missing packages ship and the node process crashes at
# startup with ERR_MODULE_NOT_FOUND).
#
# Without this, the bundle builds successfully but fails at runtime with
# errors like "Cannot find package 'zod' imported from .../protocol/index.js".
#
# We use a FIXPOINT LOOP: repeatedly scan every package.json in the staged
# tree (and the seed sources), copy any missing deps from the source roots,
# until no new packages are added. This handles transitive deps of any
# depth — e.g. main-event is declared by @libp2p/interface, which itself
# is a transitive dep of @envoymesh/network. A single-pass scan misses
# these because @libp2p/interface isn't in the initial scan list; the
# fixpoint loop discovers it on the second pass after @libp2p/interface
# is staged, then discovers main-event on the third pass.
#
# Seed sources (scanned on pass 1 to bootstrap the loop):
#   - apps/node/package.json            (direct runtime deps)
#   - packages/openclaw/package.json    (deps imported via openclaw-runtime)
# And on every pass, every staged @envoymesh/* + non-workspace package.json.
$depSearchRoots = @(
    (Join-Path $Root "node_modules"),
    (Join-Path $Root "apps/node/node_modules"),
    (Join-Path $Root "packages/openclaw/node_modules")
)
$stagedNodeModules = Join-Path $Dest "node_modules"
$seedPkgs = @()
$appsNodePkg = Join-Path $Root "apps/node/package.json"
if (Test-Path $appsNodePkg) { $seedPkgs += $appsNodePkg }
$openclawPkg = Join-Path $Root "packages/openclaw/package.json"
if (Test-Path $openclawPkg) { $seedPkgs += $openclawPkg }

$safetyNetCopied = 0
$maxIterations = 10  # fixpoint convergence guard — 10 levels of nesting is plenty
for ($iter = 1; $iter -le $maxIterations; $iter++) {
    # Collect package.json files to scan this iteration: seeds + every
    # staged package's package.json (recursive, picks up newly-staged
    # packages from the previous iteration).
    $scanList = @()
    $scanList += $seedPkgs
    if (Test-Path $stagedNodeModules) {
        $scanList += (Get-ChildItem -Path $stagedNodeModules -Recurse -Filter "package.json" -ErrorAction SilentlyContinue |
                      Where-Object { $_.FullName -notmatch '\\node_modules\\[^\\]+\\node_modules\\' }).FullName
    }
    $copiedThisIter = 0
    foreach ($pkgJsonPath in $scanList) {
        if (-not $pkgJsonPath) { continue }
        try {
            $pkgMeta = Get-Content $pkgJsonPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        } catch { continue }
        $deps = $pkgMeta.dependencies
        if (-not $deps) { continue }
        foreach ($depName in $deps.PSObject.Properties.Name) {
            # Skip workspace packages — they're staged separately above.
            if ($depName -like "@envoymesh/*") { continue }
            $destDep = Join-Path $stagedNodeModules $depName
            if (Test-Path $destDep) { continue }
            # Search all known node_modules locations for this dep.
            $srcDep = $null
            foreach ($nmRoot in $depSearchRoots) {
                $candidate = Join-Path $nmRoot $depName
                if (Test-Path $candidate) { $srcDep = $candidate; break }
            }
            if (-not $srcDep) { continue }
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destDep) | Out-Null
            Copy-Item -Recurse -Force $srcDep $destDep
            $copiedThisIter++
        }
    }
    $safetyNetCopied += $copiedThisIter
    if ($copiedThisIter -eq 0) { break }  # fixpoint reached
}
if ($safetyNetCopied -gt 0) {
    Write-Host "  Safety net: copied $safetyNetCopied missing deps in $iter pass(es) (npm ls dropped them)"
}

# Sanity check: verify a handful of known-critical runtime deps are present.
# If any are missing, fail loudly rather than shipping a broken bundle.
# Each is at a different transitive depth or workspace class — catches
# fixpoint-loop bugs, dynamic-discovery bugs, and npm ls drops.
$criticalDeps = @(
    # Direct npm deps
    "zod", "ws", "yaml",
    # Deep transitive deps (proves fixpoint loop ran)
    "main-event", "@libp2p/interface",
    # Workspace packages (proves dynamic discovery ran)
    "@envoymesh/kb-obsidian", "@envoymesh/openclaw-runtime"
)
$missing = @()
foreach ($dep in $criticalDeps) {
    if (-not (Test-Path (Join-Path $Dest "node_modules/$dep"))) {
        $missing += $dep
    }
}
if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "  CRITICAL: missing runtime deps: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "  These were declared in a package.json but not found in ANY of:" -ForegroundColor Red
    foreach ($root in $depSearchRoots) { Write-Host "    - $root" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Likely causes:" -ForegroundColor Yellow
    Write-Host "    1. 'npm install' did not complete successfully in the repo root" -ForegroundColor Yellow
    Write-Host "    2. The dep is nested deeper than the search roots (rare; check with 'npm ls <dep>')" -ForegroundColor Yellow
    Write-Host "    3. The dep was pruned by 'npm prune --production' but is actually needed at runtime" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Diagnostic commands:" -ForegroundColor Cyan
    foreach ($dep in $missing) {
        Write-Host "    npm ls $dep 2>&1 | head -20" -ForegroundColor Cyan
        Write-Host "    Get-ChildItem -Recurse -Filter '$dep' -Path node_modules,apps\node\node_modules,packages\openclaw\node_modules -Directory -ErrorAction SilentlyContinue | Select -First 5" -ForegroundColor Cyan
    }
    Write-Error "Critical runtime deps missing from staged tree: $($missing -join ', '). See diagnostic output above."
    exit 1
}

$skillsSrc = Join-Path $Root "apps/node/skills"
$skillsDest = Join-Path $Dest "skills"
if (Test-Path $skillsSrc) {
    Write-Host "  Staging bundled OpenClaw skills..."
    if (Test-Path $skillsDest) { Remove-Item -Recurse -Force $skillsDest }
    Copy-Item -Recurse -Force $skillsSrc $skillsDest
} else {
    New-Item -ItemType Directory -Force -Path $skillsDest | Out-Null
}

$exampleCfg = Join-Path $Root "envoymesh.node.example.yaml"
if (Test-Path $exampleCfg) {
    Copy-Item -Force $exampleCfg (Join-Path $Dest "envoymesh.node.example.yaml")
}

Write-Host "  ✓ Node runtime staged at $Dest"
