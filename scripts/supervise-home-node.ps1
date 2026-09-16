# Restart loop for a headless home node on Windows (24x7 without Tauri guardian).
#
# Prefer the desktop Tauri app for everyday machines. Use this script (or
# scripts/home-node-service.ps1) when the home node must keep running without UI.
#
# Pairs with:
#   - in-process sibling liveness watchdog (SIGKILL on /health timeout)
#   - ENVOYMESH_GUARDIAN_EXIT_ON_LAG=1 (exit so this loop can restart)
#
# Usage:
#   .\scripts\supervise-home-node.ps1
#   .\scripts\supervise-home-node.ps1 --profile .\apps\node\data\default
#   $env:HOME_NODE_NPM_SCRIPT = "node:dev"; .\scripts\supervise-home-node.ps1
#
# Env:
#   HOME_NODE_NPM_SCRIPT      default: node:dev
#   SUPERVISE_RESTART_SEC     sleep before respawn (default 3)
#   SUPERVISE_BACKOFF_MAX_SEC cap exponential backoff after crashes (default 60)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ScriptName = if ($env:HOME_NODE_NPM_SCRIPT) { $env:HOME_NODE_NPM_SCRIPT } else { "node:dev" }
$RestartSec = if ($env:SUPERVISE_RESTART_SEC) { [int]$env:SUPERVISE_RESTART_SEC } else { 3 }
$BackoffMaxSec = if ($env:SUPERVISE_BACKOFF_MAX_SEC) { [int]$env:SUPERVISE_BACKOFF_MAX_SEC } else { 60 }

if (-not $env:ENVOYMESH_GUARDIAN_EXIT_ON_LAG) {
  $env:ENVOYMESH_GUARDIAN_EXIT_ON_LAG = "1"
}

Write-Host "[supervise-home-node] script=$ScriptName guardianExitOnLag=$($env:ENVOYMESH_GUARDIAN_EXIT_ON_LAG)"
Write-Host "[supervise-home-node] prefer Tauri for desktop; this is the headless 24x7 path"

$delay = $RestartSec
while ($true) {
  & npm run $ScriptName -- @args
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 1 }
  Write-Host "[supervise-home-node] exited code=$code — restarting in ${delay}s"
  Start-Sleep -Seconds $delay
  if ($code -eq 0 -or $code -eq 2) {
    $delay = $RestartSec
  } else {
    $delay = $delay * 2
    if ($delay -gt $BackoffMaxSec) { $delay = $BackoffMaxSec }
  }
}
