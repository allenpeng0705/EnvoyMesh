# External liveness watchdog for EnvoyMesh home/relay processes (Windows).
#
# Exit-based service managers (NSSM AppExit Restart, WinSW onfailure) do NOT
# notice an alive-but-wedged process. This script probes GET /health and
# restarts the Windows service (or kills a PID) when probes fail repeatedly.
#
# Usage (PowerShell as Administrator for service restart):
#   .\scripts\http-liveness-watch.ps1 -Url http://127.0.0.1:15432/health -ServiceName EnvoyMeshRelay
#   .\scripts\http-liveness-watch.ps1 -Url http://127.0.0.1:15432/health -ProcessId 12345
#
# Env overrides (optional):
#   $env:LIVENESS_INTERVAL_SEC=15
#   $env:LIVENESS_TIMEOUT_SEC=2
#   $env:LIVENESS_FAILS=3
#   $env:LIVENESS_GRACE_SEC=90

param(
  [Parameter(Mandatory = $true)]
  [string]$Url,

  [string]$ServiceName = "",

  [int]$ProcessId = 0,

  [int]$IntervalSec = 0,
  [int]$TimeoutSec = 0,
  [int]$FailsNeeded = 0,
  [int]$GraceSec = 0
)

$ErrorActionPreference = "Continue"

if ($IntervalSec -le 0) {
  $IntervalSec = if ($env:LIVENESS_INTERVAL_SEC) { [int]$env:LIVENESS_INTERVAL_SEC } else { 15 }
}
if ($TimeoutSec -le 0) {
  $TimeoutSec = if ($env:LIVENESS_TIMEOUT_SEC) { [int]$env:LIVENESS_TIMEOUT_SEC } else { 2 }
}
if ($FailsNeeded -le 0) {
  $FailsNeeded = if ($env:LIVENESS_FAILS) { [int]$env:LIVENESS_FAILS } else { 3 }
}
if ($GraceSec -le 0) {
  $GraceSec = if ($env:LIVENESS_GRACE_SEC) { [int]$env:LIVENESS_GRACE_SEC } else { 90 }
}

if (-not $ServiceName -and $ProcessId -le 0) {
  Write-Error "Provide -ServiceName or -ProcessId"
  exit 2
}

function Test-Liveness([string]$ProbeUrl, [int]$Timeout) {
  try {
    $resp = Invoke-WebRequest -Uri $ProbeUrl -UseBasicParsing -TimeoutSec $Timeout
    return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Restart-Target {
  if ($ServiceName) {
    Write-Host "[liveness] restarting service $ServiceName"
    Restart-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    return
  }
  if ($ProcessId -gt 0) {
    Write-Host "[liveness] killing wedged pid $ProcessId (then rely on service manager to respawn if any)"
    try {
      Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    } catch {
      Write-Host "[liveness] Stop-Process failed: $_"
    }
  }
}

Write-Host "[liveness] watching $Url every ${IntervalSec}s (fail=$FailsNeeded, timeout=${TimeoutSec}s, grace=${GraceSec}s)"
$startedAt = Get-Date
$fails = 0

while ($true) {
  Start-Sleep -Seconds $IntervalSec
  $elapsed = ((Get-Date) - $startedAt).TotalSeconds
  if ($elapsed -lt $GraceSec) {
    continue
  }

  if (Test-Liveness -ProbeUrl $Url -Timeout $TimeoutSec) {
    if ($fails -gt 0) {
      Write-Host "[liveness] recovered after $fails failure(s)"
    }
    $fails = 0
    continue
  }

  $fails++
  Write-Host "[liveness] probe failed ($fails/$FailsNeeded) url=$Url"
  if ($fails -ge $FailsNeeded) {
    Restart-Target
    $fails = 0
    $startedAt = Get-Date
  }
}
