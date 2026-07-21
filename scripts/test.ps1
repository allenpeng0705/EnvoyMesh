#!/usr/bin/env pwsh
# =============================================================================
# EnvoyMesh Unified Test Orchestrator (Windows / PowerShell)
#
# PowerShell twin of scripts/test.sh. Same modes (dev, e2e, full, ci, bundle),
# same flags, same artifacts. The two MUST stay in sync — if you change one,
# change the other in the same commit.
#
# Usage:
#   .\scripts\test.ps1 <mode> [options]
#
# Modes:
#   dev      Fast dev loop: typecheck + unit tests (no E2E)
#   e2e      Only E2E (libp2p + chromium) — requires a Social build
#   full     All tests: unit + libp2p E2E + chromium E2E + smoke
#   ci       Same as `full`, plus JUnit XML and bail-on-first-failure
#   bundle   `ci` + run scripts/bundle.ps1 (test gate before release)
#
# Options:
#   -Filter PATTERN    Pass to vitest as --testNamePattern (or filename glob)
#   -Bail              Stop on first failure (default in ci/bundle)
#   -NoTypecheck       Skip tsc -b
#   -NoBuild           (bundle mode) skip scripts/bundle.ps1
#   -SkipPlaywright    Skip chromium E2E (envs without a browser)
#   -ArtifactsDir DIR  Drop JUnit/reports here (default: ci-artifacts\test)
#   -Quiet             Suppress per-phase banners; only print failures
#   -? , -Help         Show this message
#
# Exit codes mirror scripts/test.sh:
#   0  all phases green
#   1  any phase failed
#   2  bad CLI args
#   3  missing prerequisite (e.g. node not on PATH)
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Position=0)] [string]$Mode = "dev",
  [string]$Filter = "",
  [switch]$Bail,
  [switch]$NoTypecheck,
  [switch]$NoBuild,
  [switch]$SkipPlaywright,
  [string]$ArtifactsDir = "ci-artifacts\test",
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

# ---- resolve repo root ----------------------------------------------------

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $ScriptDir "..")).Path
Push-Location $Root

# ---- normalize mode --------------------------------------------------------

$Mode = $Mode.ToLower()
$UseMode = switch ($Mode) {
  "watch"  { "dev"; $script:Watch = $true }
  "unit"   { "dev" }
  default  { $Mode }
}

# ---- apply mode preset -----------------------------------------------------

$E2E = 0; $SMOKE = 0; $SOCIAL_BUILD = 0; $BUILD = 0
$TYPECHECK = 1; $WATCH = $script:Watch; $BAIL_OUT = 0
$BAIL = $false

switch ($UseMode) {
  "dev"    { }
  "e2e"    { $E2E = 1; $SOCIAL_BUILD = 1; $TYPECHECK = 0 }
  "full"   { $E2E = 1; $SMOKE = 1; $SOCIAL_BUILD = 1 }
  "ci"     { $E2E = 1; $SMOKE = 1; $SOCIAL_BUILD = 1; $BAIL = $true }
  "bundle" { $E2E = 1; $SMOKE = 1; $SOCIAL_BUILD = 1; $BUILD = 1; $BAIL = $true }
  default  { Write-Host "Unknown mode: $Mode" -ForegroundColor Red; exit 2 }
}

# ---- flag overrides --------------------------------------------------------

if ($Bail)       { $BAIL = $true }
if ($NoTypecheck) { $TYPECHECK = 0 }
if ($NoBuild)    { $BUILD = 0 }
if ($env:NODE_SKIP_TYPECHECK -eq "1") { $TYPECHECK = 0 }
if ($UseMode -eq "bundle" -and $env:NODE_SKIP_BUNDLE -eq "1") { $BUILD = 0 }

# ---- prereqs ---------------------------------------------------------------

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "node not found on PATH — install Node 22+ first." -ForegroundColor Red
  exit 3
}
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Write-Host "npx not found — install Node 22+ first." -ForegroundColor Red
  exit 3
}

# ---- header ---------------------------------------------------------------

if (-not $Quiet) {
  Write-Host "============================================"
  Write-Host "  EnvoyMesh Test Orchestrator"
  Write-Host "  Mode: $Mode"
  Write-Host "============================================"
  Write-Host "  typecheck:      $TYPECHECK"
  Write-Host "  unit:           1 (always when in dev/full/ci/bundle)"
  Write-Host "  social-build:   $SOCIAL_BUILD"
  Write-Host "  e2e-fast:       $E2E"
  Write-Host "  e2e-playwright: $(-not $SkipPlaywright -and $E2E)"
  Write-Host "  smoke:          $SMOKE"
  Write-Host "  bundle.sh:      $BUILD"
  Write-Host "  filter:         $(if ($Filter) { $Filter } else { '<none>' })"
  Write-Host "  bail:           $BAIL"
  Write-Host "  artifacts:      $ArtifactsDir"
  Write-Host "  watch:          $WATCH"
  Write-Host "============================================"
}

New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null

# ---- phase counters --------------------------------------------------------

$script:Pass = 0
$script:Fail = 0
$script:Skipped = 0
$script:PhasesRun = @()

function Run-Phase {
  param([string]$Name, [string]$Description, [scriptblock]$Cmd)

  $script:PhasesRun += $Name
  $logPath = Join-Path $ArtifactsDir ($Name -replace " ", "_") + ".log"

  if (-not $Quiet) {
    Write-Host ""
    Write-Host "[$Name] $Description"
    Write-Host "[$Name] $ $($Cmd.ToString().Trim() -replace '\s+', ' ')"
  }

  $start = Get-Date
  try {
    & $Cmd 2>&1 | Tee-Object -FilePath $logPath | Out-Null
    $elapsed = (Get-Date) - $start
    $script:Pass++
    if (-not $Quiet) { Write-Host "[$Name] ✓ PASSED ($([int]$elapsed.TotalSeconds)s) — log: $logPath" -ForegroundColor Green }
  } catch {
    $elapsed = (Get-Date) - $start
    $script:Fail++
    Write-Host "[$Name] ✗ FAILED ($([int]$elapsed.TotalSeconds)s) — log: $logPath" -ForegroundColor Red
    if ($BAIL) { Write-Host "Aborting — bail on first failure." -ForegroundColor Red; $script:BAIL_OUT = 1 }
  }
}

function Skip-Phase {
  param([string]$Name)
  $script:Skipped++
  if (-not $Quiet) { Write-Host "[$Name] – skipped" -ForegroundColor DarkGray }
}

# ---- vitest filter passthrough --------------------------------------------

$VITEST_FILTER_ARGS = @()
if ($Filter) { $VITEST_FILTER_ARGS += @("--testNamePattern", $Filter) }
$VITEST_BAIL_ARGS = @()
if ($BAIL) { $VITEST_BAIL_ARGS += "--bail=1" }

# ---- JUnit passthrough (ci mode; matches bash twin) ------------------------

$JUNIT_DIR = ""
if ($UseMode -eq "ci" -and $env:NODE_SKIP_JUNIT -ne "1") {
  $JUNIT_DIR = if ($env:NODE_JUNIT_DIR) { $env:NODE_JUNIT_DIR } else { $ArtifactsDir }
}

function JUnit-Args {
  param([string]$Phase)
  if ($JUNIT_DIR) {
    return ,@("--reporter=junit", "--outputFile=$JUNIT_DIR/$Phase-junit.xml")
  }
  return @()
}

# ---- phase: typecheck ------------------------------------------------------

if ($TYPECHECK) {
  Run-Phase "01-typecheck" "TypeScript project-references build" { npm run typecheck }
  if ($BAIL_OUT) { goto summary }
}

# ---- phase: unit -----------------------------------------------------------

switch ($UseMode) {
  "dev" { Run-Phase "02-unit" "Vitest unit tests (RUN_E2E=; ~4.4k tests, ~35s)" {
      $env:RUN_E2E = ""
      npx vitest run @VITEST_FILTER_ARGS @VITEST_BAIL_ARGS @JUnit-Args -Phase "02-unit"
    } ; if ($BAIL_OUT) { goto summary } }
  "e2e" { } # unit is skipped in e2e mode
  "full" { Run-Phase "02-unit" "Vitest unit tests" {
      $env:RUN_E2E = ""
      npx vitest run @VITEST_FILTER_ARGS @VITEST_BAIL_ARGS @JUnit-Args -Phase "02-unit"
    } ; if ($BAIL_OUT) { goto summary } }
  "ci" { Run-Phase "02-unit" "Vitest unit tests" {
      $env:RUN_E2E = ""
      npx vitest run @VITEST_FILTER_ARGS @VITEST_BAIL_ARGS @JUnit-Args -Phase "02-unit"
    } ; if ($BAIL_OUT) { goto summary } }
  "bundle" { Run-Phase "02-unit" "Vitest unit tests" {
      $env:RUN_E2E = ""
      npx vitest run @VITEST_FILTER_ARGS @VITEST_BAIL_ARGS @JUnit-Args -Phase "02-unit"
    } ; if ($BAIL_OUT) { goto summary } }
}

# ---- phase: social-build ---------------------------------------------------

if ($SOCIAL_BUILD) {
  $distIndex = Join-Path $Root "apps\social\src\dist\index.html"
  if (-not (Test-Path $distIndex)) {
    Run-Phase "03-social-build" "Build Social UI for chromium E2E" {
      npm run build -w @envoymesh/social -- --mode development
    }
    if ($BAIL_OUT) { goto summary }
  } else {
    if (-not $Quiet) {
      Write-Host ""
      Write-Host "[03-social-build] ✓ skipped (apps\social\src\dist already present)"
    }
    $script:Skipped++
  }
}

# ---- phase: e2e-fast -------------------------------------------------------

if ($E2E -and -not $BAIL_OUT) {
  $E2E_FAST_EXCLUDES = @(
    "--exclude=**/test/**/*smoke*.test.ts"
    "--exclude=**/test/**/*playwright*.test.ts"
    "--exclude=apps/node/test/webrtc-call-e2e.test.ts"
    "--exclude=apps/node/test/social-ui-e2e.test.ts"
    "--exclude=apps/node/test/terminal-playwright-browser.test.ts"
    "--exclude=apps/social/test/**"
  )
  Run-Phase "04-e2e-fast" "libp2p in-process E2E (RUN_E2E=1, no chromium)" {
    $env:RUN_E2E = "1"
    npx vitest run @E2E_FAST_EXCLUDES @VITEST_FILTER_ARGS @VITEST_BAIL_ARGS @JUnit-Args -Phase "04-e2e-fast"
  }
  if ($BAIL_OUT) { goto summary }
}

# ---- phase: e2e-playwright -------------------------------------------------

if ($E2E -and -not $SkipPlaywright -and -not $BAIL_OUT) {
  $CHROMIUM_E2E_FILES = @(
    "apps/node/test/webrtc-call-e2e.test.ts"
    "apps/node/test/social-ui-e2e.test.ts"
    "apps/node/test/terminal-playwright-browser.test.ts"
  )
  $playwrightRoot1 = Join-Path $env:USERPROFILE "AppData\Local\ms-playwright"
  $playwrightRoot2 = Join-Path $env:USERPROFILE ".cache\ms-playwright"
  if (-not (Test-Path $playwrightRoot1) -and -not (Test-Path $playwrightRoot2)) {
    Write-Host ""
    Write-Host "[05-e2e-playwright] ⚠ no Playwright browser cache — installing chromium"
    npx playwright install chromium 2>&1 | Out-File (Join-Path $ArtifactsDir "05-playwright-install.log")
  }
  Run-Phase "05-e2e-playwright" "Chromium-driven E2E (RUN_E2E=1, requires Playwright)" {
    $env:RUN_E2E = "1"
    npx vitest run @CHROMIUM_E2E_FILES @VITEST_FILTER_ARGS @VITEST_BAIL_ARGS @JUnit-Args -Phase "05-e2e-playwright"
  }
  if ($BAIL_OUT) { goto summary }
} elseif ($SkipPlaywright) {
  Skip-Phase "05-e2e-playwright"
}

# ---- phase: smoke ---------------------------------------------------------

if ($SMOKE -and -not $BAIL_OUT) {
  Run-Phase "06a-smoke-phase13" "Phase 13 curated PR-signal suite" { npm run smoke:phase13 }
  if ($BAIL_OUT) { goto summary }

  if (-not $BAIL_OUT) {
    $SMOKE_FILES = @(
      "apps/node/test/chain-two-home-smoke.test.ts"
      "apps/node/test/chain-three-home-smoke.test.ts"
    )
    Run-Phase "06b-smoke-chain-homes" "chain-{two,three}-home-smoke" {
      $env:RUN_E2E = "1"
      npx vitest run @SMOKE_FILES @JUnit-Args -Phase "06b-smoke-chain-homes"
    }
    if ($BAIL_OUT) { goto summary }
  }

  # Phase 45 Layer 4 — Playwright web-content matrix
  if (-not $BAIL_OUT -and -not $SkipPlaywright) {
    $distIndex = Join-Path $Root "apps\social\src\dist\index.html"
    if (-not (Test-Path $distIndex)) {
      Run-Phase "06c-social-build-web-content" "Build Social UI for web-content smoke" {
        npm run build -w @envoymesh/social -- --mode development
      }
      if ($BAIL_OUT) { goto summary }
    }
    Run-Phase "06c-smoke-web-content" "Phase 45 web-content Playwright smoke" {
      npm run smoke:web-content
    }
    if ($BAIL_OUT) { goto summary }
  } elseif ($SkipPlaywright) {
    Skip-Phase "06c-smoke-web-content"
  }
}

# ---- phase: bundle ---------------------------------------------------------

if ($BUILD -and -not $BAIL_OUT) {
  $bundlePs1 = Join-Path $Root "scripts\bundle.ps1"
  if (Test-Path $bundlePs1) {
    Run-Phase "07-bundle" "scripts/bundle.ps1 (compile + stage + archive)" {
      pwsh -ExecutionPolicy Bypass -File $bundlePs1
    }
  } else {
    Write-Host "[07-bundle] ✗ scripts\bundle.ps1 not found" -ForegroundColor Red
    $script:Fail++
  }
}

# ---- summary ---------------------------------------------------------------

:summary
Write-Host ""
Write-Host "============================================"
Write-Host "  Summary — mode: $Mode"
Write-Host "============================================"
Write-Host "  passed:  $script:Pass"
Write-Host "  failed:  $script:Fail"
Write-Host "  skipped: $script:Skipped"
Write-Host "  logs:    $ArtifactsDir\"
if ($script:Fail -gt 0) {
  Write-Host ""
  Write-Host "  ✗ one or more phases failed"
  exit 1
}
Write-Host ""
Write-Host "  ✓ all phases green"
exit 0
