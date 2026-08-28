# =============================================================================
# Bootstrap the sibling envoy-harness monorepo (coding-agent runtime).
#
# Twin of scripts/install-envoy-harness.sh. EnvoyMesh resolves
# @envoymesh/envoy-harness* via file:../envoy-harness/... so the checkout
# must sit next to EnvoyMesh (or be linked there).
#
# Usage (from repo root):
#   .\scripts\install-envoy-harness.ps1
#   .\scripts\install-envoy-harness.ps1 -LocalEnvoyHarnessPath D:\src\envoy-harness
#   .\scripts\install-envoy-harness.ps1 -SkipBuild
# =============================================================================

[CmdletBinding()]
param(
    [string]$LocalEnvoyHarnessPath = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$m) { Write-Host "  $m" }
function Write-Ok([string]$m) { Write-Host "  OK $m" -ForegroundColor Green }
function Write-Warn([string]$m) { Write-Host "  WARN $m" -ForegroundColor Yellow }
function Write-Fail([string]$m) { Write-Host "  FAIL $m" -ForegroundColor Red; throw $m }

function Invoke-GitQuiet {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & git -c core.autocrlf=false -c core.safecrlf=false @GitArgs 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Test-HarnessDistReady {
    param([string]$Dir)
    $need = @(
        "packages/envoy-harness/package.json",
        "packages/envoy-harness/dist/index.js",
        "packages/envoy-harness-adapter/dist/index.js",
        "packages/envoy-harness-client/dist/index.js"
    )
    foreach ($rel in $need) {
        if (-not (Test-Path (Join-Path $Dir $rel))) { return $false }
    }
    return $true
}

function Ensure-SiblingLink {
    param([string]$Src, [string]$Dest)
    if (Test-Path $Dest) {
        Write-Info "Sibling already present at $Dest — leaving in place"
        return
    }
    $parent = Split-Path -Parent $Dest
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    # Junction does not need admin; works for directories on Windows.
    try {
        New-Item -ItemType Junction -Path $Dest -Target $Src | Out-Null
        Write-Ok "Junction $Dest -> $Src"
        return
    } catch {
        Write-Warn "Junction failed ($_) — copying (slower)..."
    }
    Copy-Item -Recurse -Force $Src $Dest
    Write-Ok "Copied to $Dest"
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoUrl = if ($env:ENVOY_HARNESS_REPO_URL) { $env:ENVOY_HARNESS_REPO_URL } else { "https://github.com/allenpeng0705/envoy-harness.git" }
$DefaultSibling = Join-Path (Split-Path -Parent $Root) "envoy-harness"
$HarnessDir = if ($env:ENVOY_HARNESS_DIR) { $env:ENVOY_HARNESS_DIR } else { $DefaultSibling }

Write-Host "=== EnvoyMesh envoy-harness bootstrap ==="
Write-Host ""

if ($LocalEnvoyHarnessPath) {
    if (-not (Test-Path (Join-Path $LocalEnvoyHarnessPath "packages/envoy-harness/package.json"))) {
        Write-Fail "--LocalEnvoyHarnessPath missing packages/envoy-harness/package.json: $LocalEnvoyHarnessPath"
    }
    $LocalEnvoyHarnessPath = (Resolve-Path $LocalEnvoyHarnessPath).Path
    Write-Info "Using -LocalEnvoyHarnessPath: $LocalEnvoyHarnessPath"
    if ($LocalEnvoyHarnessPath -ne $HarnessDir) {
        if ($HarnessDir -eq $DefaultSibling -or -not $env:ENVOY_HARNESS_DIR) {
            Ensure-SiblingLink -Src $LocalEnvoyHarnessPath -Dest $DefaultSibling
            $HarnessDir = $DefaultSibling
        } else {
            $HarnessDir = $LocalEnvoyHarnessPath
            Write-Warn "ENVOY_HARNESS_DIR=$HarnessDir — ensure package.json file: paths resolve (symlink/junction ../envoy-harness if needed)"
        }
    } else {
        $HarnessDir = $LocalEnvoyHarnessPath
    }
}

if (-not (Test-Path $HarnessDir)) {
    if ($HarnessDir -ne $DefaultSibling) {
        Write-Fail "ENVOY_HARNESS_DIR=$HarnessDir not found. Clone envoy-harness there, or unset ENVOY_HARNESS_DIR."
    }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Fail "git not found — cannot clone envoy-harness"
    }
    Write-Info "Cloning $RepoUrl -> $DefaultSibling"
    if (-not (Invoke-GitQuiet clone --depth 1 $RepoUrl $DefaultSibling)) {
        Write-Fail "git clone failed"
    }
    $HarnessDir = $DefaultSibling
} elseif (-not (Test-Path (Join-Path $HarnessDir "packages/envoy-harness/package.json"))) {
    Write-Fail "$HarnessDir exists but is not an envoy-harness monorepo"
} else {
    Write-Info "Found envoy-harness at $HarnessDir"
}

if (-not (Test-Path $DefaultSibling) -and ($HarnessDir -ne $DefaultSibling)) {
    Write-Info "Linking default sibling path for npm file: deps..."
    Ensure-SiblingLink -Src $HarnessDir -Dest $DefaultSibling
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Info "Installing pnpm..."
    npm install -g pnpm
    if ($LASTEXITCODE -ne 0) { Write-Fail "Could not install pnpm" }
}

if ($SkipBuild -and (Test-HarnessDistReady $HarnessDir)) {
    Write-Ok "envoy-harness dist ready (-SkipBuild)"
    return
}
if ($SkipBuild) {
    Write-Warn "-SkipBuild requested but dist incomplete — building anyway"
}

Write-Info "pnpm install + build in $HarnessDir ..."
Push-Location $HarnessDir
try {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    pnpm install 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "pnpm install failed in envoy-harness" }
    pnpm --filter @envoymesh/envoy-harness-client run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "envoy-harness-client build failed" }
    pnpm -r run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "envoy-harness pnpm -r run build failed" }
    $ErrorActionPreference = $prevEap
} finally {
    Pop-Location
}

if (-not (Test-HarnessDistReady $HarnessDir)) {
    Write-Fail "envoy-harness build did not produce expected dist/ entries"
}

Write-Ok "envoy-harness ready at $HarnessDir"
