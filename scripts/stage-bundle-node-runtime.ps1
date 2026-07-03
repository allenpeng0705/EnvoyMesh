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
    $pkgName = node -e "const p=require(process.argv[1]); process.stdout.write(p.name||'')" (Join-Path $modPath "package.json")
    if ([string]::IsNullOrWhiteSpace($pkgName)) { continue }
    if ($pkgName -like "@envoymesh/*") { continue }
    $destMod = Join-Path $Dest "node_modules/$pkgName"
    if (Test-Path $destMod) { continue }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destMod) | Out-Null
    Copy-Item -Recurse -Force $modPath $destMod
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
