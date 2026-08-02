# Stage compiled EnvoyMesh node runtime (dist + workspace packages + prod npm deps).
# Used by scripts/bundle.ps1 and Tauri staging on Windows.
param(
    [Parameter(Mandatory = $true)]
    [string]$Dest
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Src = Join-Path $Root "apps/node/dist"

# Project version comes from the VERSION file at repo root (same source of
# truth as scripts/sync-version.mjs). Reading it here keeps the bundled
# node's synthetic package.json in sync without manual edits on every bump.
$versionFile = Join-Path $Root "VERSION"
$BundleVersion = "0.0.0"
if (Test-Path $versionFile) {
    $BundleVersion = (Get-Content $versionFile -Raw -ErrorAction Stop).Trim()
}
if (-not ($BundleVersion -match '^\d+\.\d+\.\d+')) {
    Write-Error "Invalid VERSION '$BundleVersion' in $versionFile"
}

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

@"
{
  "name": "@envoymesh/node-bundle",
  "version": "$BundleVersion",
  "type": "module",
  "private": true
}
"@ | Set-Content -Path (Join-Path $Dest "package.json") -Encoding UTF8

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
$maxIterations = 15  # fixpoint convergence guard; nested deps add depth
for ($iter = 1; $iter -le $maxIterations; $iter++) {
    # Collect package.json files to scan this iteration: seeds + EVERY
    # staged package's package.json (recursive, including packages nested
    # inside other packages' node_modules/). We must scan nested packages
    # too — their declared deps need to be hoisted to the top of the
    # staged tree so Node's resolver can find them. The fixpoint loop's
    # idempotency check (skip if already staged) makes this safe.
    $scanList = @()
    $scanList += $seedPkgs
    if (Test-Path $stagedNodeModules) {
        $scanList += (Get-ChildItem -Path $stagedNodeModules -Recurse -Filter "package.json" -ErrorAction SilentlyContinue |
                      Where-Object { $_.FullName -notmatch '\\node_modules\\.bin\\' }).FullName
    }
    $copiedThisIter = 0
    foreach ($pkgJsonPath in $scanList) {
        if (-not $pkgJsonPath) { continue }
        try {
            $pkgMeta = Get-Content $pkgJsonPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        } catch { continue }
        # Include optionalDependencies — sharp's @img/sharp-<platform> natives
        # live there. Skipping them ships a bundle that crashes on Windows with
        # "Could not load the sharp module using the win32-x64 runtime".
        $depNames = [System.Collections.Generic.HashSet[string]]::new()
        if ($pkgMeta.dependencies) {
            foreach ($n in @($pkgMeta.dependencies.PSObject.Properties.Name)) { [void]$depNames.Add($n) }
        }
        if ($pkgMeta.optionalDependencies) {
            foreach ($n in @($pkgMeta.optionalDependencies.PSObject.Properties.Name)) { [void]$depNames.Add($n) }
        }
        if ($depNames.Count -eq 0) { continue }
        foreach ($depName in $depNames) {
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
# sharp platform natives for THIS host (must be present before packaging).
$ridOs = if ($IsWindows -or $env:OS -match "Windows") { "win32" } elseif ($IsLinux) { "linux" } else { "darwin" }
$ridCpu = "x64"
try {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
    if ($arch -eq "Arm64") { $ridCpu = "arm64" }
} catch {
    if ($env:PROCESSOR_ARCHITECTURE -match "ARM64") { $ridCpu = "arm64" }
}
$sharpPlatformDeps = @(
    "@img/sharp-$ridOs-$ridCpu",
    "@img/sharp-libvips-$ridOs-$ridCpu"
)

$criticalDeps = @(
    # Direct npm deps
    "zod", "ws", "yaml", "sharp",
    # Deep transitive deps (proves fixpoint loop ran)
    "main-event", "@libp2p/interface",
    # Workspace packages (proves dynamic discovery ran)
    "@envoymesh/kb-obsidian", "@envoymesh/openclaw-runtime",
    # Nested-dep hoist: declared by tough-cookie which lives inside
    # request/node_modules/. Proves the loop scans nested packages.
    "psl"
) + $sharpPlatformDeps
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
    Write-Host "    4. sharp platform optionalDeps were omitted — run: npm install --os=$ridOs --cpu=$ridCpu sharp" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Diagnostic commands:" -ForegroundColor Cyan
    foreach ($dep in $missing) {
        Write-Host "    npm ls $dep 2>&1 | head -20" -ForegroundColor Cyan
        Write-Host "    Get-ChildItem -Recurse -Filter '$dep' -Path node_modules,apps\node\node_modules,packages\openclaw\node_modules -Directory -ErrorAction SilentlyContinue | Select -First 5" -ForegroundColor Cyan
    }
    Write-Error "Critical runtime deps missing from staged tree: $($missing -join ', '). See diagnostic output above."
    exit 1
}
Write-Host "  + sharp platform packages present ($($sharpPlatformDeps -join ', '))"

# End-to-end import check: actually run Node's module resolver against
# every module the runtime entry imports. This catches missing modules
# that the file-existence sanity check above can't — e.g. transitive
# deps of nested packages (psl, declared by tough-cookie which lives
# inside request/node_modules/), optional native bindings, and broken
# package.json "exports" maps. Failures here are converted from runtime
# crashes (which only surface after the user installs the bundle) into
# build-time errors with a clear list of what's missing.
Write-Host "  End-to-end import check..."
$nodeExe = if ($env:ENVOYMESH_NODE_EXE) { $env:ENVOYMESH_NODE_EXE } else { "node" }
$probeScript = @'
const mods = [
  // Direct npm deps
  "zod", "ws", "yaml", "psl", "nat-upnp", "sharp",
  // Deep transitive deps
  "main-event", "@libp2p/interface", "@multiformats/multiaddr",
  // Workspace packages
  "@envoymesh/protocol", "@envoymesh/api", "@envoymesh/identity",
  "@envoymesh/bonds", "@envoymesh/network", "@envoymesh/vault",
  "@envoymesh/local-store", "@envoymesh/models", "@envoymesh/rag",
  "@envoymesh/ipfs-helia", "@envoymesh/openclaw-runtime",
  "@envoymesh/kb-obsidian"
];
let failed = 0;
for (const m of mods) {
  try {
    await import(m);
  } catch (e) {
    // Fail on ANY import error — sharp throws a plain Error (not
    // ERR_MODULE_NOT_FOUND) when the platform binary is missing.
    console.error("FAIL: " + m + " — " + (e && e.message ? e.message.split("\n")[0] : e));
    failed++;
  }
}
if (failed > 0) {
  console.error("\n" + failed + " module(s) failed to resolve. The bundle will crash at startup.");
  process.exit(1);
}
console.error("All " + mods.length + " critical imports resolved.");
'@
$probePath = Join-Path $Dest "__import_probe.mjs"
Set-Content -Path $probePath -Value $probeScript -Encoding UTF8
# IMPORTANT: the probe writes "All N imports resolved." to stderr by design
# (Node's console.error). PowerShell's `2>&1` wraps stderr as ErrorRecord
# objects, and under $ErrorActionPreference="Stop" these would trigger the
# outer try/catch in build-desktop.ps1 as if the script had failed — even
# though the probe succeeded. We explicitly unwrap each record to a string
# via Write-Host, and read $LASTEXITCODE (not the pipeline) for the real
# pass/fail signal.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    Push-Location $Dest
    $probeOutput = & $nodeExe "__import_probe.mjs" 2>&1
    $probeExit = $LASTEXITCODE
    Pop-Location
    # Render each line (whether string or ErrorRecord) to the host without
    # letting ErrorRecords trigger terminating errors.
    foreach ($line in $probeOutput) {
        $text = if ($line -is [System.Management.Automation.ErrorRecord]) {
            $line.Exception.Message
        } else {
            [string]$line
        }
        Write-Host "    $text"
    }
    if ($probeExit -ne 0) {
        Write-Host "  ✗ End-to-end import probe failed — see FAIL lines above" -ForegroundColor Red
        Write-Host "    The node process would crash with ERR_MODULE_NOT_FOUND." -ForegroundColor Red
        exit 1
    }
} finally {
    $ErrorActionPreference = $prevEap
    Remove-Item $probePath -ErrorAction SilentlyContinue
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

# Bundled sponsor friend config. The setup wizard uses this to bootstrap
# the user's first mesh contact ("zero-step first friend"). Without it,
# the wizard shows "no sponsor configured" and auto-hello is disabled.
# Mirrors the bash twin's logic (stage real file, or copy .example if
# ENVOYMESH_COPY_SPONSOR_EXAMPLE=1 for testing).
$sponsorSrc = Join-Path $Root "bundled-sponsor-friend.json"
$sponsorExampleSrc = Join-Path $Root "bundled-sponsor-friend.json.example"
$sponsorDest = Join-Path $Dest "bundled-sponsor-friend.json"
if (Test-Path $sponsorSrc) {
    Write-Host "  Staging bundled sponsor friend config..."
    Copy-Item -Force $sponsorSrc $sponsorDest
} elseif ((Test-Path $sponsorExampleSrc) -and $env:ENVOYMESH_COPY_SPONSOR_EXAMPLE -eq "1") {
    Write-Host "  Staging sponsor friend example (ENVOYMESH_COPY_SPONSOR_EXAMPLE=1)..."
    Copy-Item -Force $sponsorExampleSrc $sponsorDest
}

# Also stage node-config.json if present (mirrors bash twin).
$nodeConfigSrc = Join-Path $Root "node-config.json"
if (Test-Path $nodeConfigSrc) {
    Write-Host "  Staging bundled node-config.json..."
    Copy-Item -Force $nodeConfigSrc (Join-Path $Dest "node-config.json")
}

# Phase 50 — stage push notification credentials into the bundle.
# These are optional secret files the operator places at the repo root
# before building. They get bundled into the exe so the home node can
# push to EnvoyGo without manual post-install file copying.
#
# Files (all optional — push silently skips if missing):
#   push-config.json              — credential config
#   AuthKey_*.p8                  — APNs private key
#   serviceAccountKey.json        — FCM service account (also accepts
#                                   firebase-service-account.json)
$pushConfigSrc = Join-Path $Root "push-config.json"
if (Test-Path $pushConfigSrc) {
    Write-Host "  Staging bundled push-config.json..."
    Copy-Item -Force $pushConfigSrc (Join-Path $Dest "push-config.json")
}
$p8Files = Get-ChildItem -Path $Root -Filter "AuthKey_*.p8" -ErrorAction SilentlyContinue
foreach ($p8File in $p8Files) {
    Write-Host "  Staging bundled APNs key: $($p8File.Name)"
    Copy-Item -Force $p8File.FullName (Join-Path $Dest $p8File.Name)
}
$fcmKeySrc = Join-Path $Root "serviceAccountKey.json"
$fcmKeyLegacy = Join-Path $Root "firebase-service-account.json"
if (Test-Path $fcmKeySrc) {
    Write-Host "  Staging bundled FCM service account JSON (serviceAccountKey.json)..."
    Copy-Item -Force $fcmKeySrc (Join-Path $Dest "serviceAccountKey.json")
} elseif (Test-Path $fcmKeyLegacy) {
    $destSa = "serviceAccountKey.json"
    if (Test-Path $pushConfigSrc) {
        try {
            $pcFcm = Get-Content -Raw $pushConfigSrc | ConvertFrom-Json
            if ($pcFcm.fcm -and $pcFcm.fcm.serviceAccountJsonPath) {
                $named = [System.IO.Path]::GetFileName([string]$pcFcm.fcm.serviceAccountJsonPath)
                if ($named) { $destSa = $named }
            }
        } catch { }
    }
    Write-Host "  Staging bundled FCM service account JSON (firebase-service-account.json → $destSa)..."
    Copy-Item -Force $fcmKeyLegacy (Join-Path $Dest $destSa)
}
# If push-config.json names different basenames, stage those too.
if (Test-Path $pushConfigSrc) {
    try {
        $pc = Get-Content -Raw $pushConfigSrc | ConvertFrom-Json
        if ($pc.apns -and $pc.apns.keyPath) {
            $keyBase = [System.IO.Path]::GetFileName([string]$pc.apns.keyPath)
            $keySrc = Join-Path $Root $keyBase
            $keyDest = Join-Path $Dest $keyBase
            if ((Test-Path $keySrc) -and -not (Test-Path $keyDest)) {
                Write-Host "  Staging bundled APNs key ($keyBase from push-config)..."
                Copy-Item -Force $keySrc $keyDest
            }
        }
        if ($pc.fcm -and $pc.fcm.serviceAccountJsonPath) {
            $saBase = [System.IO.Path]::GetFileName([string]$pc.fcm.serviceAccountJsonPath)
            $saSrc = Join-Path $Root $saBase
            $saDest = Join-Path $Dest $saBase
            if ((Test-Path $saSrc) -and -not (Test-Path $saDest)) {
                Write-Host "  Staging bundled FCM service account JSON ($saBase from push-config)..."
                Copy-Item -Force $saSrc $saDest
            }
        }
    } catch {
        Write-Host "  ⚠ Could not parse push-config.json for named credential paths: $($_.Exception.Message)"
    }
}

Write-Host "  ✓ Node runtime staged at $Dest"
