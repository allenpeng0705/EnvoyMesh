# Stage push-notification credentials into the Tauri node bundle dir.
#
# Twin of scripts/stage-tauri-push-credentials.sh. Copies from the repo root:
#   push-config.json
#   AuthKey_*.p8 (or apns.keyPath basename)
#   serviceAccountKey.json (or fcm.serviceAccountJsonPath basename)
#
# Destination: apps\tauri\src-tauri\resources\node\
# Must run AFTER stage-bundle-node-runtime.ps1 (which recreates the dest).
#
# Set REQUIRE_PUSH_CREDENTIALS=1 to fail the build when secrets are missing.

[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$Dest = ""
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
if (-not $Dest) {
    $Dest = Join-Path $RepoRoot "apps\tauri\src-tauri\resources\node"
}

function Write-Ok([string]$msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-WarnMsg([string]$msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-FailMsg([string]$msg) { Write-Host "error: $msg" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $Dest -PathType Container)) {
    Write-FailMsg "node bundle dir missing at $Dest — run stage-bundle-node-runtime.ps1 first"
}

$configSrc = Join-Path $RepoRoot "push-config.json"
$require = if ($env:REQUIRE_PUSH_CREDENTIALS) { $env:REQUIRE_PUSH_CREDENTIALS } else { "0" }

if (-not (Test-Path $configSrc -PathType Leaf)) {
    Write-WarnMsg "No push-config.json at repo root — skipping push credential staging."
    Write-WarnMsg "Drop push-config.json + AuthKey_*.p8 + serviceAccountKey.json at the repo root, then re-run."
    exit 0
}

$config = Get-Content -Raw -Path $configSrc | ConvertFrom-Json
$keyRel = if ($config.apns -and $config.apns.keyPath) { [string]$config.apns.keyPath } else { "AuthKey_LKPCR48WHW.p8" }
$saRel = if ($config.fcm -and $config.fcm.serviceAccountJsonPath) { [string]$config.fcm.serviceAccountJsonPath } else { "serviceAccountKey.json" }

$keyBase = [System.IO.Path]::GetFileName($keyRel)
$saBase = [System.IO.Path]::GetFileName($saRel)
$keySrc = Join-Path $RepoRoot $keyBase
$saSrc = Join-Path $RepoRoot $saBase
# Older packager layouts used firebase-service-account.json; copy under the
# basename named in push-config.json so relative path resolution still works.
$firebaseFallback = Join-Path $RepoRoot "firebase-service-account.json"
if (-not (Test-Path $saSrc -PathType Leaf) -and (Test-Path $firebaseFallback -PathType Leaf)) {
    $saSrc = $firebaseFallback
}

Write-Host "Staging push credentials into resources\node\..."
Copy-Item -Force $configSrc (Join-Path $Dest "push-config.json")
Write-Ok "Staged push-config.json → resources\node\"

$missing = $false
function Copy-Secret([string]$src, [string]$destName, [string]$label) {
    if (-not (Test-Path $src -PathType Leaf)) {
        Write-WarnMsg "Missing $label at $src"
        $script:missing = $true
        return
    }
    Copy-Item -Force $src (Join-Path $Dest $destName)
    Write-Ok "Staged $destName → resources\node\"
}

Copy-Secret $keySrc $keyBase "APNs AuthKey (.p8)"
Copy-Secret $saSrc $saBase "FCM service account JSON"

if ($missing) {
    $msg = "push-config.json references secrets that are not at the repo root"
    if ($require -eq "1") {
        Write-FailMsg "$msg (REQUIRE_PUSH_CREDENTIALS=1)"
    }
    Write-WarnMsg "$msg — packaged app will not send push until they are present."
    Write-WarnMsg "Expected: $keySrc and $saSrc"
    exit 0
}

Write-Ok "Push credentials staged (APNs + FCM) for Windows/macOS/Linux desktop bundles"
