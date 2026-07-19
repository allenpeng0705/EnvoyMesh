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

$workspacePkgs = @(
    "protocol", "identity", "bonds", "network", "vault",
    "local-store", "api", "models", "rag", "ipfs-helia"
)

Write-Host "  Staging @envoymesh workspace packages..."
foreach ($pkg in $workspacePkgs) {
    $srcPkg = Join-Path $Root "packages/$pkg"
    $destPkg = Join-Path $Dest "node_modules/@envoymesh/$pkg"
    if (-not (Test-Path (Join-Path $srcPkg "dist"))) {
        Write-Error "Missing dist for @envoymesh/$pkg — run: npm run node:build"
    }
    New-Item -ItemType Directory -Force -Path $destPkg | Out-Null
    Copy-Item -Force (Join-Path $srcPkg "package.json") $destPkg
    Copy-Item -Recurse -Force (Join-Path $srcPkg "dist") $destPkg
}

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
$envoymeshScope = Join-Path $Dest "node_modules/@envoymesh"
$rootNodeModules = Join-Path $Root "node_modules"
$safetyNetCopied = 0
if (Test-Path $envoymeshScope) {
    foreach ($pkgJsonPath in (Get-ChildItem -Path $envoymeshScope -Recurse -Filter "package.json" -ErrorAction SilentlyContinue)) {
        try {
            $pkgMeta = Get-Content $pkgJsonPath.FullName -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        } catch { continue }
        $deps = $pkgMeta.dependencies
        if (-not $deps) { continue }
        foreach ($depName in $deps.PSObject.Properties.Name) {
            # Skip workspace packages — they're staged separately above.
            if ($depName -like "@envoymesh/*") { continue }
            $destDep = Join-Path $Dest "node_modules/$depName"
            if (Test-Path $destDep) { continue }
            # Look for the dep in the root node_modules (npm workspace
            # hoists most deps there). If absent, skip — we can't stage
            # what we don't have.
            $srcDep = Join-Path $rootNodeModules $depName
            if (-not (Test-Path $srcDep)) { continue }
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destDep) | Out-Null
            Copy-Item -Recurse -Force $srcDep $destDep
            $safetyNetCopied++
        }
    }
}
if ($safetyNetCopied -gt 0) {
    Write-Host "  Safety net: copied $safetyNetCopied missing deps from root node_modules (npm ls dropped them)"
}

# Sanity check: verify a handful of known-critical runtime deps are present.
# If any are missing, fail loudly rather than shipping a broken bundle.
$criticalDeps = @("zod", "ws", "yaml")
$missing = @()
foreach ($dep in $criticalDeps) {
    if (-not (Test-Path (Join-Path $Dest "node_modules/$dep"))) {
        $missing += $dep
    }
}
if ($missing.Count -gt 0) {
    Write-Error "Critical runtime deps missing from staged tree: $($missing -join ', '). The node process will crash at startup with ERR_MODULE_NOT_FOUND. Check that 'npm install' succeeded in the repo root."
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
