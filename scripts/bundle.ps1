#!/usr/bin/env pwsh
# =============================================================================
# EnvoyMesh Bundle Builder (Windows / PowerShell)
#
# PowerShell twin of scripts/bundle.sh. Produces a self-contained, portable
# EnvoyMesh bundle that includes:
#   * EnvoyMesh node  (built from apps/node)
#   * Social UI       (built from apps/social)
#   * OpenClaw gateway (built from packages/openclaw, source or prebuilt)
#   * Node.js runtime (fetched per-platform sidecar)
#   * Cross-platform runtime orchestrator (bin/envoymesh-bundle.mjs)
#   * Tiny launchers (./start.sh, ./start.bat) that exec the orchestrator
#
# And packages that bundle as a portable .tar.gz archive (headless runtime).
# Native installers (.exe, .msi) are produced by scripts/build-desktop.sh
# (Tauri desktop app), not by this script.
#
# Usage (from the repo root, in PowerShell):
#   .\scripts\bundle.ps1 [-Out <dir>] [-Version <ver>] [-SkipTypecheck]
#                        [-SkipOpenClawBuild] [-UseOpenClawBinary]
#                        [-NoBundledNode] [-?]
#
# Output (default):
#   release\envoymesh-{version}-{platform}-{arch}\        staged directory
#   release\envoymesh-{version}-{platform}-{arch}.tar.gz portable archive
#
# Bash twin: scripts/bundle.sh (mac/linux). The two MUST stay in sync — if you
# change one, change the other in the same commit. See docs/bundle-scripts.md
# for the contract and the full flag reference.
#
# Tested on:
#   - Windows 10 / 11 with stock PowerShell 5.1
#   - PowerShell 7+ (pwsh)
# =============================================================================

[CmdletBinding()]
param(
    # Output directory (default: release\)
    [string]$Out = "release",

    # Override bundle version (default: from package.json)
    [string]$Version = "",

    # Skip tsc -b before bundling
    [switch]$SkipTypecheck,

    # Use existing packages/openclaw/dist if present; don't run pnpm install
    [switch]$SkipOpenClawBuild,

    # Fetch a prebuilt OpenClaw binary instead of building from source
    [switch]$UseOpenClawBinary,

    # Skip the Node.js sidecar fetch — target must have Node 22+ on PATH
    [switch]$NoBundledNode
)

$ErrorActionPreference = "Stop"

# -----------------------------------------------------------------------------
# Helpers (mirror those in scripts/setup.ps1)
# -----------------------------------------------------------------------------

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "[$Message]" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host "  $Message"
}

function Write-Ok {
    param([string]$Message)
    Write-Host "  ✓ $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  ⚠ $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  ✗ $Message" -ForegroundColor Red
}

function Require-Command {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        Write-Fail "$Name not found in PATH. Install $Name and re-run."
        throw "$Name-missing"
    }
    return $cmd
}

function Invoke-ExternalQuiet {
    param(
        [string]$Exe,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$ToolArgs
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & $Exe @ToolArgs 2>&1 | Out-Null
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

# -----------------------------------------------------------------------------
# Resolve repo root (works even if cwd is somewhere else when invoking).
# -----------------------------------------------------------------------------

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

Write-Host "============================================"
Write-Host "  EnvoyMesh Bundle Builder" -ForegroundColor Cyan
Write-Host "  Repo: $RepoRoot"
Write-Host "============================================"
Write-Host ""

# -----------------------------------------------------------------------------
# Platform detection
# -----------------------------------------------------------------------------

$OsName = $env:OS
if ($OsName -ne "Windows_NT") {
    Write-Fail "This is the Windows twin. On $OsName use scripts/bundle.sh."
    exit 1
}

$Platform = "win"
switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { $Arch = "x64" }
    "ARM64" { $Arch = "arm64" }
    default {
        Write-Fail "Unsupported architecture: $($env:PROCESSOR_ARCHITECTURE)"
        exit 1
    }
}

Write-Host "Version: $(if ($Version) { $Version } else { '(from package.json)' })"
Write-Host "Platform: $Platform-$Arch"
Write-Host ""

# -----------------------------------------------------------------------------
# Step 1: Toolchain check
# -----------------------------------------------------------------------------

Write-Step "1/8  Checking toolchain..."

try {
    Require-Command "node"
} catch {
    Write-Fail "Node.js not found. Install Node 22+ first: https://nodejs.org"
    exit 1
}
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 22) {
    Write-Warn "Node $nodeMajor detected - Node 22+ recommended"
}

if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
    Write-Info "Installing pnpm..."
    npm install -g pnpm
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Could not install pnpm"
        exit 1
    }
}
# pnpm warns on npm "workspaces" in root package.json — check version outside repo root.
$pnpmVersion = "?"
Push-Location $env:TEMP
try {
    $pnpmVersion = (pnpm -v 2>$null)
    if ($LASTEXITCODE -ne 0) { $pnpmVersion = "?" }
} finally {
    Pop-Location
}
Write-Ok "node $(node -v), pnpm $pnpmVersion"

# -----------------------------------------------------------------------------
# Step 2: EnvoyMesh dependencies (idempotent)
# -----------------------------------------------------------------------------

Write-Step "2/8  Installing EnvoyMesh dependencies..."

if (-not (Test-Path "node_modules")) {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install failed"
        exit 1
    }
} else {
    Write-Info "node_modules already present (skipping)"
}

# -----------------------------------------------------------------------------
# Step 3: OpenClaw bootstrap (delegates to install-openclaw.ps1)
# -----------------------------------------------------------------------------

Write-Step "3/8  OpenClaw bootstrap..."

if (-not (Test-Path "packages/openclaw/openclaw.mjs") -and -not (Test-Path "packages/openclaw/package.json")) {
    Write-Info "packages/openclaw missing - install-openclaw.ps1 will clone from GitHub"
}

$installPs1 = Join-Path $PSScriptRoot "install-openclaw.ps1"
if (Test-Path $installPs1) {
    & $installPs1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "install-openclaw.ps1 failed"
        exit 1
    }
} else {
    Write-Warn "install-openclaw.ps1 not found - skipping"
}

if (-not (Test-Path "packages/openclaw/package.json")) {
    Write-Fail "packages/openclaw missing after bootstrap"
    exit 1
}

# -----------------------------------------------------------------------------
# Step 4: OpenClaw build (or prebuilt binary)
# -----------------------------------------------------------------------------

Write-Step "4/8  OpenClaw build..."

if ($UseOpenClawBinary) {
    Write-Info "Fetching OpenClaw prebuilt binary..."
    $fetchScript = Join-Path $PSScriptRoot "fetch-openclaw-sidecar.sh"
    if (Test-Path $fetchScript) {
        # The shell sidecar fetcher is bash-only; on Windows we fall back to
        # the manual download path. Tweak here if/when OpenClaw ships a
        # native PowerShell fetcher.
        Write-Warn "fetch-openclaw-sidecar.sh is bash-only. Falling back to source build."
        $UseOpenClawBinary = $false
    } else {
        Write-Fail "fetch-openclaw-sidecar.sh not found"
        exit 1
    }
}

if (-not $UseOpenClawBinary) {
    if ($SkipOpenClawBuild) {
        Write-Info "Skipped (SkipOpenClawBuild)"
        if (-not (Test-Path "packages/openclaw/openclaw.mjs") -and -not (Test-Path "packages/openclaw/dist/entry.js")) {
            Write-Fail "packages/openclaw not built and -SkipOpenClawBuild was set. Drop the switch or run scripts/setup.ps1 first."
            exit 1
        }
    } else {
        Push-Location "packages/openclaw"
        try {
            if ((Test-Path "dist") -and -not (Test-Path "dist/entry.js")) {
                Write-Info "Removing incomplete dist..."
                Remove-Item -Recurse -Force "dist"
            }

            Write-Info "pnpm install..."
            $env:CI = "true"
            $pnpmExit = Invoke-ExternalQuiet pnpm install --no-frozen-lockfile
            if ($pnpmExit -ne 0) {
                Write-Warn "Retrying with clean node_modules..."
                if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
                $pnpmExit = Invoke-ExternalQuiet pnpm install --no-frozen-lockfile
                if ($pnpmExit -ne 0) {
                    Write-Fail "pnpm install failed"
                    Pop-Location
                    exit 1
                }
            }

            # Drop dev deps from node_modules (typescript, vitest, playwright,
            # @types/*, etc.) before staging — they account for hundreds of MB.
            # Runtime dependencies stay; only `devDependencies` are removed.
            $env:CI = "true"
            $pruneExit = Invoke-ExternalQuiet pnpm prune --prod
            if ($pruneExit -ne 0) {
                Write-Warn "pnpm prune failed - bundle will include dev deps (still works, just larger)"
            }

            if (-not (Test-Path "node_modules/@pierre/diffs")) {
                Write-Info "Installing @pierre/diffs (fallback)..."
                Invoke-ExternalQuiet npm install @pierre/diffs --save-dev | Out-Null
            }

            Write-Info "Generating channel metadata (envoymesh)..."
            if (Test-Path "extensions/envoymesh") {
                $tmpIdx = [System.IO.Path]::GetTempFileName()
                try {
                    $env:GIT_INDEX_FILE = $tmpIdx
                    $readTreeOk = Invoke-ExternalQuiet git read-tree HEAD
                    if ($readTreeOk -eq 0) {
                        Invoke-ExternalQuiet git add extensions/envoymesh | Out-Null
                    }
                    $metaExit = Invoke-ExternalQuiet pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts
                    if ($metaExit -ne 0) {
                        Write-Warn "Metadata generation failed - extension may still work at runtime"
                    }
                } finally {
                    Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
                    Remove-Item -Force $tmpIdx -ErrorAction SilentlyContinue
                }
            } else {
                $metaExit = Invoke-ExternalQuiet pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts
                if ($metaExit -ne 0) {
                    Write-Warn "Metadata generation failed - extension may still work at runtime"
                }
            }

            Write-Info "Building..."
            $buildExit = Invoke-ExternalQuiet pnpm run build
            if ($buildExit -ne 0) {
                Write-Warn "Full build failed - creating tsx bootstrap..."
                if (-not (Test-Path "dist")) {
                    New-Item -ItemType Directory -Force -Path "dist" | Out-Null
                }
                $entryStub = @"
// EnvoyMesh bootstrap - re-exports the gateway from TS source.
export * from "../src/cli/run-main.ts";
"@
                Set-Content -Path "dist/entry.js" -Value $entryStub -Encoding UTF8
            }
            if (Test-Path "dist/entry.js") {
                Write-Ok "dist/entry.js ready"
            } else {
                Write-Fail "dist/entry.js missing - gateway will not start"
                Pop-Location
                exit 1
            }

            # Build is done — NOW it's safe to drop dev deps from node_modules
            # (typescript, vitest, playwright, @types/*, etc.). Pruning earlier
            # would remove the build tools (e.g. `tsdown`) and break the step
            # above.
            $env:CI = "true"
            $pruneExit = Invoke-ExternalQuiet pnpm prune --prod
            if ($pruneExit -ne 0) {
                Write-Warn "pnpm prune failed - bundle will include dev deps (still works, just larger)"
            }
        } finally {
            Pop-Location
        }
    }
}

# -----------------------------------------------------------------------------
# Step 5: EnvoyMesh node build
# -----------------------------------------------------------------------------

Write-Step "5/8  Building EnvoyMesh node..."

if (-not (Test-Path "apps/node/dist/src/index.js")) {
    if ($SkipTypecheck) {
        $nodeBuildExit = Invoke-ExternalQuiet npm run node:build
        if ($nodeBuildExit -ne 0) {
            Write-Fail "EnvoyMesh node build failed"
            exit 1
        }
    } else {
        $typecheckExit = Invoke-ExternalQuiet npm run typecheck
        if ($typecheckExit -ne 0) {
            Write-Warn "typecheck had warnings (continuing)"
        }
        $nodeBuildExit = Invoke-ExternalQuiet npm run node:build
        if ($nodeBuildExit -ne 0) {
            Write-Fail "EnvoyMesh node build failed"
            exit 1
        }
    }
} else {
    Write-Info "apps/node/dist/src/index.js already present (skipping rebuild)"
}

# -----------------------------------------------------------------------------
# Step 6: Social UI build
# -----------------------------------------------------------------------------

Write-Step "6/8  Building Social UI..."

if (-not (Test-Path "apps/social/dist")) {
    Push-Location "apps/social"
    try {
        $socialExit = Invoke-ExternalQuiet npm run build
        if ($socialExit -ne 0) {
            Write-Warn "Social UI build failed - bundle will run without the UI"
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Info "apps/social/dist already present (skipping rebuild)"
}

# -----------------------------------------------------------------------------
# Step 7: Stage bundle
# -----------------------------------------------------------------------------

if (-not $Version) {
    try {
        $Version = (node -p "require('./package.json').version" 2>$null)
    } catch {
        $Version = "dev"
    }
}

$BundleName = "envoymesh-${Version}-${Platform}-${Arch}"
$BundleDir = Join-Path $RepoRoot (Join-Path $Out $BundleName)

Write-Step "7/8  Staging bundle into $BundleDir..."

if (Test-Path $BundleDir) {
    Remove-Item -Recurse -Force $BundleDir
}
New-Item -ItemType Directory -Force -Path (Join-Path $BundleDir "bin")       | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BundleDir "node")      | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BundleDir "openclaw")  | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BundleDir "social")    | Out-Null

# EnvoyMesh node (dist + workspace packages + production npm deps)
Write-Info "Staging EnvoyMesh node runtime..."
$nodeDest = Join-Path $BundleDir "node"
& (Join-Path $RepoRoot "scripts/stage-bundle-node-runtime.ps1") -Dest $nodeDest

# OpenClaw
Write-Info "Copying OpenClaw..."
if ((Test-Path "packages/openclaw/openclaw.mjs") -or (Test-Path "packages/openclaw/dist/entry.js")) {
    # Exclude OpenClaw's own dev cruft so the bundle isn't 2+ GB.
    # Runtime files we DO keep: dist/, dist-runtime/, extensions/, node_modules/
    # (already pruned above by pnpm prune --prod), openclaw.mjs, package.json,
    # npm-shrinkwrap.json, patches/, skills/, security/. If the runtime needs
    # something else, add it to this exclude list AND document the choice in
    # docs/bundle-scripts.md.
    $exclude = @(
        "node_modules",".git",".gitattributes",".gitignore",
        ".turbo","target",
        ".agents",".artifacts",".claude",
        ".github",".vscode",".npmrc",
        ".oxfmtrc.jsonc",".oxlintrc.json",
        ".crabbox.yaml",".dockerignore",".semgrepignore",
        "apps","docs","ui","scripts","src","qa","test","packages",
        "config","data","deploy","git-hooks",
        "docker-compose.yml","Dockerfile","fly.toml",
        ".env.example","appcast.xml",
        "tsconfig.json","vitest.config.ts","tsdown.config.ts"
    )
    # Wildcard patterns handled by a regex post-filter (PowerShell -Exclude
    # is unreliable for globs).
    $excludeGlobs = @("tsconfig.*.json","*.yaml","*.yml")
    $excludeGlobRegex = ($excludeGlobs | ForEach-Object { [regex]::Escape($_) }) -join '|'
    Get-ChildItem -Path "packages/openclaw" -Force | Where-Object {
        -not ($exclude -contains $_.Name) -and
        -not ($_.Name -match "^($excludeGlobRegex)$")
    } | ForEach-Object {
        Copy-Item -Recurse -Force $_.FullName (Join-Path (Join-Path $BundleDir "openclaw") $_.Name)
    }
    # Drop common markdown docs and config files that escaped the top-level
    # filter (these live at the bundle root and add up).
    foreach ($docName in @("LICENSE","README.md","CHANGELOG.md","CONTRIBUTING.md",
                            "AGENTS.md","CLAUDE.md","VISION.md",
                            "THIRD_PARTY_NOTICES.md","SECURITY.md")) {
        $docPath = Join-Path (Join-Path $BundleDir "openclaw") $docName
        if (Test-Path $docPath) {
            Remove-Item -Force $docPath -ErrorAction SilentlyContinue
        }
    }
    if (Test-Path (Join-Path $BundleDir "openclaw/.env.example")) {
        Remove-Item -Force (Join-Path $BundleDir "openclaw/.env.example") -ErrorAction SilentlyContinue
    }
    if (Test-Path "packages/openclaw/node_modules") {
        Copy-Item -Recurse -Force "packages/openclaw/node_modules" (Join-Path $BundleDir "openclaw\")
    }
} else {
    $binaryDir = "apps/tauri/src-tauri/resources/openclaw"
    if (Test-Path $binaryDir) {
        Get-ChildItem -Path $binaryDir -Force | ForEach-Object {
            Copy-Item -Recurse -Force $_.FullName (Join-Path (Join-Path $BundleDir "openclaw") $_.Name)
        }
    } else {
        Write-Fail "No OpenClaw source or binary found"
        exit 1
    }
}

# Social UI
# apps/social's vite.config.ts sets `root: "src"`, so `vite build` writes to
# apps/social/src/dist/ rather than apps/social/dist/. Handle both layouts.
if (Test-Path "apps/social/dist") {
    Write-Info "Copying Social UI..."
    Copy-Item -Recurse -Force "apps/social/dist" (Join-Path $BundleDir "social\dist")
    if (Test-Path "apps/social/index.html") {
        Copy-Item -Force "apps/social/index.html" (Join-Path $BundleDir "social\")
    }
} elseif (Test-Path "apps/social/src/dist") {
    Write-Info "Copying Social UI (from src\dist)..."
    Copy-Item -Recurse -Force "apps/social/src/dist" (Join-Path $BundleDir "social\dist")
    if (Test-Path "apps/social/src/index.html") {
        Copy-Item -Force "apps/social/src/index.html" (Join-Path $BundleDir "social\index.html")
    }
}

# EnvoyMesh icons (shared with Tauri desktop builds)
$iconSrc = Join-Path $RepoRoot "apps/tauri/src-tauri/icons"
if (Test-Path $iconSrc) {
    Write-Info "Copying EnvoyMesh icons..."
    $iconDest = Join-Path $BundleDir "icons"
    New-Item -ItemType Directory -Force -Path $iconDest | Out-Null
    $icns = Join-Path $iconSrc "icon.icns"
    $ico = Join-Path $iconSrc "icon.ico"
    $png = Join-Path $iconSrc "icon.png"
    if (Test-Path $icns) { Copy-Item -Force $icns (Join-Path $iconDest "envoymesh.icns") }
    if (Test-Path $ico) { Copy-Item -Force $ico (Join-Path $iconDest "envoymesh.ico") }
    if (Test-Path $png) {
        Copy-Item -Force $png (Join-Path $iconDest "envoymesh.png")
    } elseif (Test-Path (Join-Path $iconSrc "128x128@2x.png")) {
        Copy-Item -Force (Join-Path $iconSrc "128x128@2x.png") (Join-Path $iconDest "envoymesh.png")
    }
}

# Runtime orchestrator
Write-Info "Copying runtime orchestrator..."
Copy-Item -Force "bin/envoymesh-bundle.mjs" (Join-Path $BundleDir "bin\envoymesh-bundle.mjs")

# Launchers
$startSh = @'
#!/usr/bin/env bash
# Launcher for an EnvoyMesh bundle.
# Resolves the bundled node binary and execs the orchestrator.
set -e
BUNDLE_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$BUNDLE_DIR/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
    echo "[bundle] NOTE: bundled node missing - using system node ($(node -v))" >&2
  else
    echo "[bundle] ERROR: no node found. Build with --bundled-node, or install Node 22+ on the target." >&2
    exit 1
  fi
fi
exec "$NODE_BIN" "$BUNDLE_DIR/bin/envoymesh-bundle.mjs" "$@"
'@
Set-Content -Path (Join-Path $BundleDir "start.sh") -Value $startSh -Encoding UTF8

$startBat = @'
@echo off
REM Launcher for an EnvoyMesh bundle (Windows).
setlocal
set "BUNDLE_DIR=%~dp0"
set "NODE_BIN=%BUNDLE_DIR%bin\node.exe"
if not exist "%NODE_BIN%" (
  where node >nul 2>&1
  if %ERRORLEVEL% EQU 0 (
    for /f "delims=" %%i in ('where node') do set "NODE_BIN=%%i"
    echo [bundle] NOTE: bundled node missing - using system node 1>&2
  ) else (
    echo [bundle] ERROR: no node found. Build with -NoBundledNode, or install Node 22+ on the target. 1>&2
    exit /b 1
  )
)
"%NODE_BIN%" "%BUNDLE_DIR%bin\envoymesh-bundle.mjs" %*
endlocal
'@
Set-Content -Path (Join-Path $BundleDir "start.bat") -Value $startBat -Encoding ASCII

# Bundle README + VERSION
$readme = @"
# EnvoyMesh Bundle ($Version)

Built: $(Get-Date -Format 'o')
Platform: $Platform-$Arch

## Run

```
# Windows
start.bat

# mac / linux
./start.sh
```

The launcher will start:
1. The bundled OpenClaw gateway on port 18789.
2. The bundled EnvoyMesh node (which connects to the gateway over the bridge URL).

Open `var\` for runtime state (profile, openclaw state, logs).

## Config

Edit `node\envoymesh.node.example.yaml` and pass it to the node via
`ENVOYMESH_CONFIG`. Or set env vars directly:

```
$env:ENVOYMESH_BRIDGE_PORT = 3031
$env:ENVOYMESH_GATEWAY_PORT = 18789
$env:ENVOYMESH_PROFILE = "$PWD\var\profile"
.\start.bat
```

## What's inside

| Path | What |
| --- | --- |
| `bin\envoymesh-bundle.mjs` | Cross-platform runtime orchestrator |
| `bin\node.exe` | Bundled Node.js (omit if built with `-NoBundledNode`) |
| `node\` | Compiled EnvoyMesh node + workspace packages |
| `openclaw\` | Built OpenClaw gateway + envoymesh channel extension |
| `social\dist\` | Built Social UI (static) |
| `start.sh` / `start.bat` | Launchers |
"@
Set-Content -Path (Join-Path $BundleDir "README.md") -Value $readme -Encoding UTF8
Set-Content -Path (Join-Path $BundleDir "VERSION") -Value $Version -Encoding UTF8
Write-Ok "Staged at $BundleDir"

# Node sidecar
if ($NoBundledNode) {
    Write-Warn "-NoBundledNode set - target machine must have Node 22+"
} else {
    Write-Info "Fetching Node.js sidecar..."
    $nodeVersion = (node -p "process.versions.node")
    $nodeArchive = "node-v${nodeVersion}-${Platform}-${Arch}.zip"
    $nodeUrl = "https://nodejs.org/dist/v${nodeVersion}/${nodeArchive}"
    $nodeTmp = Join-Path ([System.IO.Path]::GetTempPath()) ("node-sidecar-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $nodeTmp | Out-Null
    try {
        $zipPath = Join-Path $nodeTmp $nodeArchive
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $nodeUrl -OutFile $zipPath -ErrorAction Stop
        } catch {
            Write-Warn "Failed to fetch $nodeUrl - bundle will use system node on the target."
            return
        }
        Expand-Archive -Path $zipPath -DestinationPath $nodeTmp -Force
        $exeName = if ($Arch -eq "x64") { "node.exe" } else { "node.exe" } # both archs use node.exe on win
        $srcNode = Join-Path $nodeTmp "node-v${nodeVersion}-${Platform}-${Arch}\$exeName"
        if (Test-Path $srcNode) {
            Copy-Item -Force $srcNode (Join-Path $BundleDir "bin\node.exe")
            Write-Ok "Bundled node: $((Get-Item (Join-Path $BundleDir 'bin\node.exe')).VersionInfo.FileVersion) at bin\node.exe"
        } else {
            Write-Warn "node.exe not found after expanding $nodeArchive - target must have Node on PATH."
        }
    } finally {
        Remove-Item -Recurse -Force $nodeTmp -ErrorAction SilentlyContinue
    }
}

Write-Host ""

# -----------------------------------------------------------------------------
# Step 8: Portable .tar.gz archive
# -----------------------------------------------------------------------------

Write-Step "8/8  Creating portable archive..."

$archivePath = Join-Path $RepoRoot (Join-Path $Out "${BundleName}.tar.gz")
if (Test-Path $archivePath) { Remove-Item -Force $archivePath }

Push-Location (Join-Path $RepoRoot $Out)
try {
    $archiveFile = "${BundleName}.tar.gz"
    & tar -czf $archiveFile $BundleName
    if ($LASTEXITCODE -ne 0) {
        throw "tar exited with code $LASTEXITCODE"
    }
    $archivePath = Join-Path (Get-Location) $archiveFile
} finally {
    Pop-Location
}

if (Test-Path $archivePath) {
    $sizeBytes = (Get-Item $archivePath).Length
    $sizeLabel = if ($sizeBytes -gt 1GB) {
        "{0:N1} GB" -f ($sizeBytes / 1GB)
    } elseif ($sizeBytes -gt 1MB) {
        "{0:N1} MB" -f ($sizeBytes / 1MB)
    } else {
        "{0:N0} KB" -f ($sizeBytes / 1KB)
    }
    Write-Ok "$archivePath ($sizeLabel)"
} else {
    Write-Warn "Archive creation failed; staged directory still exists at $BundleDir"
    $archivePath = ""
}

Write-Host ""
Write-Host "============================================"
Write-Host "  Bundle Complete" -ForegroundColor Green
Write-Host "============================================"
Write-Host ""
Write-Host "  Directory:  $BundleDir"
if ($archivePath) { Write-Host "  Archive:    $archivePath" }
Write-Host ""
Write-Host "Extract and run:"
Write-Host "  tar -xzf `"$archivePath`""
Write-Host "  cd `"$BundleName`""
Write-Host "  .\start.bat"
Write-Host ""
Write-Host "For a desktop app with UI, build with scripts/build-desktop.sh instead."
Write-Host ""
