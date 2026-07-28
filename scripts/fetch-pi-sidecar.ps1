# Fetch the upstream Pi coding-agent package (Windows twin of fetch-pi-sidecar.sh).
# Called during Tauri build to bundle Pi inside the app on Windows.
#
# Unlike OpenClaw (prebuilt per-OS binaries), Pi is a Node.js package
# (@earendil-works/pi-coding-agent) that runs under the bundled Node
# runtime. So we install it (and its transitive deps) into a clean
# staging dir via npm.
#
# Usage: .\scripts\fetch-pi-sidecar.ps1 [-Version <ver>]
#   -Version: Pi version to fetch (default: 0.82.1 — pinned, see §4 of
#             docs/pi-integration-design.md; bump deliberately, never "latest")
#
# Output: a self-contained Pi install at $OutputDir containing:
#   $OutputDir\
#     package.json                  # synthetic manifest
#     .pi-version                   # records staged version for idempotency
#     node_modules\                 # Pi + all transitive deps, npm-installed
#       @earendil-works\pi-coding-agent\
#         dist\cli.js               # the `pi` CLI entry (bin field)
#         dist\index.js             # the SDK entry (main field)
#         package.json
#       @earendil-works\pi-ai\
#       @earendil-works\pi-agent-core\
#       @earendil-works\pi-tui\
#       chalk\, cross-spawn\, ...   # ~16 other npm deps
#
# Re-runs are idempotent: if the requested version is already staged,
# this script exits 0 without re-downloading. Force a re-fetch with
# -Force, or by removing $OutputDir.

param(
    [string]$Version = "0.82.1",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$OutputDir = Join-Path $RepoRoot "apps\tauri\src-tauri\resources\pi"
$StagedVersionFile = Join-Path $OutputDir ".pi-version"
$PiCli = Join-Path $OutputDir "node_modules\@earendil-works\pi-coding-agent\dist\cli.js"

Write-Host "Fetching Pi coding-agent $Version..."

# Idempotency: skip if the same version is already staged AND the CLI
# entry point exists. -Force overrides.
if (-not $Force -and (Test-Path $StagedVersionFile) -and (Get-Content $StagedVersionFile -Raw).Trim() -eq $Version) {
    if (Test-Path $PiCli) {
        Write-Host "  ✓ Pi $Version already staged at $($OutputDir.Replace($RepoRoot + '\', ''))"
        exit 0
    }
}

# Clean any prior staging (different version, or partial install).
if (Test-Path $OutputDir) {
    Remove-Item -Recurse -Force $OutputDir
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# Install Pi + all transitive deps into this dir's node_modules. We need
# a minimal package.json so npm treats this dir as the project root and
# hoists deps here (not to the repo root).
$pkgJson = @{
    name    = "@envoymesh/pi-bundle"
    version = $Version
    private = $true
    type    = "module"
    dependencies = @{
        "@earendil-works/pi-coding-agent" = $Version
    }
} | ConvertTo-Json -Depth 5
Set-Content -Path (Join-Path $OutputDir "package.json") -Value $pkgJson -Encoding UTF8

Write-Host "  Installing @earendil-works/pi-coding-agent@$Version + transitive deps..."
Push-Location $OutputDir
try {
    & npm install --omit=dev --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm install failed for Pi $Version"
        exit 1
    }
} finally {
    Pop-Location
}

# Verify the CLI entry point landed where we expect it.
if (-not (Test-Path $PiCli)) {
    Write-Error "Pi CLI entry point missing at node_modules\@earendil-works\pi-coding-agent\dist\cli.js"
    exit 1
}

# Record the staged version so subsequent runs skip re-installing.
Set-Content -Path $StagedVersionFile -Value $Version -Encoding UTF8 -NoNewline

# Report what we got.
$stagedSize = (Get-ChildItem -Path $OutputDir -Recurse -ErrorAction SilentlyContinue |
               Measure-Object -Property Length -Sum).Sum / 1MB
$envoymeshScope = Join-Path $OutputDir "node_modules\@earendil-works"
$piDeps = if (Test-Path $envoymeshScope) {
    (Get-ChildItem $envoymeshScope -Directory | Select-Object -ExpandProperty Name) -join " "
} else { "(none)" }
Write-Host ("  ✓ Pi $Version staged at $($OutputDir.Replace($RepoRoot + '\', '')) ({0:N1} MB)" -f $stagedSize)
Write-Host "    @earendil-works packages: $piDeps"
Write-Host "    CLI entry: node_modules\@earendil-works\pi-coding-agent\dist\cli.js"
