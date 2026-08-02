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
$ExtSrc = Join-Path $Root "OpenClawExtension"
$Seed = Join-Path $Root "apps\tauri\src-tauri\resources\openclaw-envoymesh"
$Oc = Join-Path $Root "apps\tauri\src-tauri\resources\openclaw"

function Write-Info([string]$m) { Write-Host "  $m" }
function Write-Ok([string]$m) { Write-Host "  OK $m" -ForegroundColor Green }
function Write-Fail([string]$m) { Write-Host "  FAIL $m" -ForegroundColor Red }

if (-not (Test-Path (Join-Path $ExtSrc "index.ts"))) {
    Write-Fail "OpenClawExtension\index.ts missing at repo root"
    exit 1
}

# ASCII arrows — Windows consoles often mojibake Unicode (→ / —).
Write-Host "[stage-openclaw-envoymesh] Compiling seed -> $Seed"
if (Test-Path $Seed) { Remove-Item -Recurse -Force $Seed }
New-Item -ItemType Directory -Force -Path $Seed | Out-Null
Copy-Item -Recurse -Force (Join-Path $ExtSrc "*") $Seed
$seedNm = Join-Path $Seed "node_modules"
if (Test-Path $seedNm) { Remove-Item -Recurse -Force $seedNm }
# OpenClawExtension/tsconfig.json extends ../tsconfig.package-boundary.base.json
# which does not exist under the seed path — esbuild would spam a warning per
# file. Drop TS project files; we only need a plain transpile.
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $Seed "tsconfig.json")
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $Seed ".oxlintrc.json")
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $Seed ".oxfmtrc.jsonc")
Get-ChildItem -Path $Seed -Filter "tsconfig.*.json" -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
foreach ($drop in @("docs", "examples", "test", "tests", ".git")) {
    $p = Join-Path $Seed $drop
    if (Test-Path $p) { Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue }
}

$esbuildCmd = $null
$esbuildLocal = Join-Path $Root "packages\openclaw\node_modules\.bin\esbuild.cmd"
$esbuildLocalUnix = Join-Path $Root "packages\openclaw\node_modules\.bin\esbuild"
if (Test-Path $esbuildLocal) { $esbuildCmd = $esbuildLocal }
elseif (Test-Path $esbuildLocalUnix) { $esbuildCmd = $esbuildLocalUnix }

# One esbuild invocation for top-level + src (skip *.test.ts) — quieter/faster.
# Relative entry paths preserve src/ layout under --outdir=.
$esbuildArgs = @(
    "--bundle=false", "--format=esm", "--platform=node",
    "--out-extension:.js=.js", "--allow-overwrite", "--log-level=warning"
)

Push-Location $Seed
try {
    # PS 5.1-safe relative paths (no Resolve-Path -Relative).
    $relInputs = @()
    $relInputs += @(Get-ChildItem -Path "." -Filter "*.ts" -File -ErrorAction SilentlyContinue |
        ForEach-Object { ".\$($_.Name)" })
    $srcDir = Join-Path $Seed "src"
    if (Test-Path $srcDir) {
        $relInputs += @(Get-ChildItem -Path $srcDir -Filter "*.ts" -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch '\.test\.ts$' } |
            ForEach-Object { ".\src\$($_.Name)" })
    }
    if ($relInputs.Count -eq 0) { throw "no .ts sources found in seed" }
    if ($esbuildCmd) {
        & $esbuildCmd @relInputs @esbuildArgs --outdir=.
    } else {
        & npx esbuild @relInputs @esbuildArgs --outdir=.
    }
    if ($LASTEXITCODE -ne 0) { throw "esbuild failed (exit $LASTEXITCODE)" }
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
