# Always compile OpenClawExtension → resources\openclaw-envoymesh (seed),
# then install that seed into the staged OpenClaw tree.
#
# Runs on EVERY desktop build — even when OpenClaw is reused from cache —
# so a stale/partial openclaw tree can never ship without
# extensions\envoymesh\index.js.
#
# Usage: .\scripts\stage-openclaw-envoymesh-extension.ps1
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ExtSrc = Join-Path $Root "OpenClawExtension"
$Seed = Join-Path $Root "apps\tauri\src-tauri\resources\openclaw-envoymesh"
$Oc = Join-Path $Root "apps\tauri\src-tauri\resources\openclaw"

function Write-Info([string]$m) { Write-Host "  $m" }
function Write-Ok([string]$m) { Write-Host "  ✓ $m" -ForegroundColor Green }
function Write-Fail([string]$m) { Write-Host "  ✗ $m" -ForegroundColor Red }

if (-not (Test-Path (Join-Path $ExtSrc "index.ts"))) {
    Write-Fail "OpenClawExtension\index.ts missing at repo root"
    exit 1
}

Write-Host "[stage-openclaw-envoymesh] Compiling seed → $Seed"
if (Test-Path $Seed) { Remove-Item -Recurse -Force $Seed }
New-Item -ItemType Directory -Force -Path $Seed | Out-Null
Copy-Item -Recurse -Force (Join-Path $ExtSrc "*") $Seed
$seedNm = Join-Path $Seed "node_modules"
if (Test-Path $seedNm) { Remove-Item -Recurse -Force $seedNm }

$esbuildCmd = $null
$esbuildLocal = Join-Path $Root "packages\openclaw\node_modules\.bin\esbuild.cmd"
$esbuildLocalUnix = Join-Path $Root "packages\openclaw\node_modules\.bin\esbuild"
if (Test-Path $esbuildLocal) { $esbuildCmd = $esbuildLocal }
elseif (Test-Path $esbuildLocalUnix) { $esbuildCmd = $esbuildLocalUnix }

Push-Location $Seed
try {
    $topTs = @(Get-ChildItem -Path "." -Filter "*.ts" -File -ErrorAction SilentlyContinue)
    if ($topTs.Count -gt 0) {
        if ($esbuildCmd) {
            & $esbuildCmd @($topTs.FullName) --bundle=false --format=esm --platform=node --outdir=. --out-extension:.js=.js --allow-overwrite
        } else {
            & npx esbuild @($topTs.FullName) --bundle=false --format=esm --platform=node --outdir=. --out-extension:.js=.js --allow-overwrite
        }
        if ($LASTEXITCODE -ne 0) { throw "esbuild top-level failed (exit $LASTEXITCODE)" }
    }
    $srcDir = Join-Path $Seed "src"
    if (Test-Path $srcDir) {
        Get-ChildItem -Path $srcDir -Filter "*.ts" -File -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Name -match '\.test\.ts$') { return }
            if ($esbuildCmd) {
                & $esbuildCmd $_.FullName --bundle=false --format=esm --platform=node --outdir=src --out-extension:.js=.js --allow-overwrite
            } else {
                & npx esbuild $_.FullName --bundle=false --format=esm --platform=node --outdir=src --out-extension:.js=.js --allow-overwrite
            }
            if ($LASTEXITCODE -ne 0) { throw "esbuild src/$($_.Name) failed (exit $LASTEXITCODE)" }
        }
    }
} finally { Pop-Location }

if (-not (Test-Path (Join-Path $Seed "index.js"))) {
    Write-Fail "seed index.js not produced — is esbuild available?"
    exit 1
}

Get-ChildItem -Path $Seed -Filter "*.ts" -Recurse -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

$pkgJson = Join-Path $Seed "package.json"
if (Test-Path $pkgJson) {
    $content = Get-Content -Path $pkgJson -Raw -Encoding UTF8
    $content = $content -replace '"\.\/index\.ts"', '"./index.js"'
    $content = $content -replace '"\.\/setup-entry\.ts"', '"./setup-entry.js"'
    Set-Content -Path $pkgJson -Value $content -Encoding UTF8 -NoNewline
}

$jsCount = @(Get-ChildItem -Path $Seed -Filter "*.js" -Recurse -File).Count
Write-Ok "seed ready ($jsCount .js files)"

if (-not (Test-Path (Join-Path $Oc "openclaw.mjs"))) {
    Write-Info "staged OpenClaw missing at $Oc — seed only (run OpenClaw staging first for full install)"
    exit 0
}

Write-Host "[stage-openclaw-envoymesh] Installing seed into OpenClaw tree..."
function Install-Into([string]$Dest) {
    $parent = Split-Path $Dest -Parent
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
    Copy-Item -Recurse -Force $Seed $Dest
}

Install-Into (Join-Path $Oc "extensions\envoymesh")
New-Item -ItemType Directory -Force -Path (Join-Path $Oc "dist\extensions") | Out-Null
Install-Into (Join-Path $Oc "dist\extensions\envoymesh")
if (Test-Path (Join-Path $Oc "dist-runtime")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Oc "dist-runtime\extensions") | Out-Null
    Install-Into (Join-Path $Oc "dist-runtime\extensions\envoymesh")
}

if (-not (Test-Path (Join-Path $Oc "extensions\envoymesh\index.js"))) {
    Write-Fail "install failed: extensions\envoymesh\index.js"
    exit 1
}
if (-not (Test-Path (Join-Path $Oc "dist\extensions\envoymesh\index.js"))) {
    Write-Fail "install failed: dist\extensions\envoymesh\index.js"
    exit 1
}
Write-Ok "envoymesh installed into extensions\ and dist\extensions\"
