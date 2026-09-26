# Verify Tauri desktop resources are staged before `tauri build`.
# PowerShell twin of scripts/verify-tauri-resources.sh -- used by
# build-desktop.ps1 so Windows builds do not require Git Bash.
#
# Usage (from repo root):
#   .\scripts\verify-tauri-resources.ps1

$ErrorActionPreference = "Stop"

if ($PSScriptRoot) {
    $Root = Split-Path -Parent $PSScriptRoot
} else {
    $Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

$Res = Join-Path $Root "apps\tauri\src-tauri\resources"
$SocialDist = Join-Path $Root "apps\social\src\dist\index.html"

function Write-Fail([string]$m) {
    Write-Host "error: $m" -ForegroundColor Red
    exit 1
}
function Write-WarnMsg([string]$m) {
    Write-Host "  ! $m" -ForegroundColor Yellow
}
function Require-File([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Write-Fail "missing $Label at $Path -- run .\scripts\build-desktop.ps1 from repo root (steps 1-2 must succeed)"
    }
}
function Require-DirNonEmpty([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        Write-Fail "missing $Label directory at $Path"
    }
    $any = Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $any) {
        Write-Fail "$Label directory is empty at $Path"
    }
}
function Get-DirSizeMB([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try {
        $bytes = (Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum
        if ($null -eq $bytes) { return 0 }
        return [int][math]::Round($bytes / 1MB)
    } catch { return $null }
}

Write-Host "Verifying Tauri bundle resources..."

$nodeSidecar = Join-Path $Res "node-runtime\node.exe"
if (-not (Test-Path -LiteralPath $nodeSidecar)) {
    $nodeSidecar = Join-Path $Res "node-runtime\node"
}
Require-File $nodeSidecar "Node.js sidecar"
Require-File (Join-Path $Res "node\dist\src\index.js") "compiled EnvoyMesh node"
Require-File (Join-Path $Res "openclaw\openclaw.mjs") "OpenClaw gateway entry"
Require-File (Join-Path $Res "openclaw\dist\entry.js") "OpenClaw compiled entry.js"
Require-File (Join-Path $Res "openclaw\dist\config\config.js") "OpenClaw config module"
Require-File (Join-Path $Res "openclaw\extensions\envoymesh\index.js") "EnvoyMesh channel extension (compiled)"
Require-File (Join-Path $Res "openclaw\dist\extensions\envoymesh\index.js") "EnvoyMesh channel extension (in dist/extensions/ -- plugin discovery root)"
Require-File (Join-Path $Res "openclaw\dist\extensions\envoymesh\openclaw.plugin.json") "EnvoyMesh plugin manifest (in dist/extensions/)"
Require-File (Join-Path $Res "openclaw-envoymesh\index.js") "EnvoyMesh extension seed (runtime heal source)"
Require-File (Join-Path $Res "openclaw\dist\cli\run-main.js") "OpenClaw CLI runtime entry"
Require-DirNonEmpty (Join-Path $Res "openclaw\node_modules") "OpenClaw node_modules"

$nmRoot = Join-Path $Res "openclaw\node_modules"
$nmTop = @(Get-ChildItem -LiteralPath $nmRoot -Directory -Force -ErrorAction SilentlyContinue).Count
$pnpmStore = Join-Path $nmRoot ".pnpm"
if (Test-Path -LiteralPath $pnpmStore -PathType Container) {
    $pnpmCount = @(Get-ChildItem -LiteralPath $pnpmStore -Directory -Force -ErrorAction SilentlyContinue).Count
    if ($pnpmCount -lt 100) {
        Write-WarnMsg "node_modules/.pnpm has only $pnpmCount dirs (expected 100+) -- may be incomplete"
    } else {
        Write-Host "  OpenClaw node_modules: pnpm layout ($nmTop top-level, $pnpmCount .pnpm entries)"
    }
} elseif ($nmTop -lt 500) {
    Write-WarnMsg "node_modules has only $nmTop directories (expected 600+) -- may be incomplete"
}

$entryJs = Join-Path $Res "openclaw\dist\entry.js"
$entryText = Get-Content -LiteralPath $entryJs -Raw -ErrorAction SilentlyContinue
if ($entryText -and ($entryText -match "EnvoyMesh bootstrap|from\s+[`"'].*src/cli/run-main")) {
    Write-Fail "openclaw dist/entry.js is a runtime stub -- rebuild OpenClaw or set STAGE_OPENCLAW_BUNDLE=1"
}

$selfRef = Join-Path $Res "openclaw\node_modules\openclaw\package.json"
Require-File $selfRef "OpenClaw node_modules/openclaw/package.json (self-reference)"
Write-Host "  OpenClaw node_modules/openclaw/ self-reference OK"

$piDir = Join-Path $Res "pi"
if (Test-Path -LiteralPath $piDir -PathType Container) {
    Require-File (Join-Path $piDir "node_modules\@earendil-works\pi-coding-agent\dist\cli.js") "Pi CLI entry"
    Require-File (Join-Path $piDir "node_modules\@earendil-works\pi-coding-agent\dist\index.js") "Pi SDK entry"
    Require-File (Join-Path $piDir "node_modules\@earendil-works\pi-coding-agent\package.json") "Pi package.json"
    Require-DirNonEmpty (Join-Path $piDir "node_modules\@earendil-works") "Pi @earendil-works packages"
    foreach ($binName in @("fd", "rg")) {
        $found = $false
        foreach ($cand in @((Join-Path $piDir "bin\$binName"), (Join-Path $piDir "bin\$binName.exe"))) {
            if (Test-Path -LiteralPath $cand -PathType Leaf) { $found = $true; break }
        }
        if (-not $found) {
            Write-Fail "Pi tool $binName missing at $piDir\bin\$binName (or $binName.exe) -- run scripts/fetch-pi-tools.ps1"
        }
    }
    $piVersionFile = Join-Path $piDir ".pi-version"
    if (Test-Path -LiteralPath $piVersionFile) {
        Write-Host "  Pi version:    $((Get-Content -LiteralPath $piVersionFile -Raw).Trim())"
    }
    $capFile = Join-Path $Root "apps\tauri\src-tauri\capabilities\default.json"
    Require-File $capFile "Tauri capabilities"
    $capText = Get-Content -LiteralPath $capFile -Raw
    if ($capText -notmatch "allow-pick-directory") {
        Write-Fail "capabilities/default.json missing allow-pick-directory -- Pi Browse will fail with ACL error"
    }
    Write-Host "  Pi folder picker ACL (allow-pick-directory)"
} else {
    Write-WarnMsg "Pi sidecar not bundled (slim build) -- Pi chat panel will be disabled at runtime"
}

Require-File $SocialDist "built Social UI (apps/social/src/dist)"

$ehDir = Join-Path $Res "envoy-harness"
$ehAdapterDir = Join-Path $Res "envoy-harness-adapter"
$ehClientDir = Join-Path $Res "envoy-harness-client"
$ehPeerDir = Join-Path $Res "envoy-harness-peer"
$ehTuiDir = Join-Path $Res "envoy-harness-tui"

if (Test-Path -LiteralPath $ehDir -PathType Container) {
    Require-File (Join-Path $ehDir "index.js") "envoy-harness main entry"
    Require-File (Join-Path $ehDir "index.d.ts") "envoy-harness type definitions"
    Require-File (Join-Path $ehDir "package.json") "envoy-harness package.json"
    Require-File (Join-Path $ehDir "cli\acp-stdio.js") "envoy-harness ACP stdio entry"
    Require-DirNonEmpty $ehDir "envoy-harness staged tree"
    Require-File (Join-Path $ehAdapterDir "index.js") "envoy-harness-adapter main entry"
    Require-File (Join-Path $ehAdapterDir "package.json") "envoy-harness-adapter package.json"
    Require-DirNonEmpty $ehAdapterDir "envoy-harness-adapter staged tree"
    Require-File (Join-Path $ehClientDir "index.js") "envoy-harness-client main entry"
    Require-File (Join-Path $ehClientDir "package.json") "envoy-harness-client package.json"
    Require-File (Join-Path $ehPeerDir "index.js") "envoy-harness-peer main entry"
    Require-File (Join-Path $ehPeerDir "package.json") "envoy-harness-peer package.json"
    Require-File (Join-Path $ehTuiDir "bin.js") "envoy-harness-tui bin entry"
    Require-File (Join-Path $ehTuiDir "package.json") "envoy-harness-tui package.json"
} else {
    if ($env:STAGE_ENVOY_HARNESS -eq "0") {
        Write-WarnMsg "envoy-harness resources not bundled (STAGE_ENVOY_HARNESS=0)"
    } else {
        Write-Fail "envoy-harness staged tree missing at $ehDir -- run scripts/stage-tauri-envoy-harness-bundle.ps1"
    }
}

if ($env:STAGE_ENVOY_HARNESS -ne "0" -or $env:ENVOYMESH_ALLOW_BROKEN_HARNESS_SKIP -ne "1") {
    $nm = Join-Path $Res "node\node_modules\@envoymesh"
    Require-File (Join-Path $nm "envoy-process\package.json") "envoy-process in node_modules"
    Require-File (Join-Path $nm "envoy-process\dist\index.js") "envoy-process dist entry in node_modules"
    Require-File (Join-Path $nm "envoy-harness\package.json") "envoy-harness in node_modules"
    Require-File (Join-Path $nm "envoy-harness\dist\index.js") "envoy-harness dist entry in node_modules"
    Require-File (Join-Path $nm "envoy-harness-adapter\package.json") "envoy-harness-adapter in node_modules"
    Require-File (Join-Path $nm "envoy-harness-adapter\dist\index.js") "envoy-harness-adapter dist entry in node_modules"
    Require-File (Join-Path $nm "envoy-harness-client\package.json") "envoy-harness-client in node_modules"
    Require-File (Join-Path $nm "envoy-harness-client\dist\index.js") "envoy-harness-client dist entry in node_modules"
    Require-File (Join-Path $nm "envoy-harness-peer\package.json") "envoy-harness-peer in node_modules"
    Require-File (Join-Path $nm "envoy-harness-peer\dist\index.js") "envoy-harness-peer dist entry in node_modules"
    Require-File (Join-Path $nm "envoy-harness-tui\package.json") "envoy-harness-tui in node_modules"
    Require-File (Join-Path $nm "envoy-harness-tui\dist\bin.js") "envoy-harness-tui bin in node_modules"
    if (-not (Test-Path -LiteralPath (Join-Path $Res "node\node_modules\smol-toml"))) {
        Write-Fail "smol-toml missing from resources/node/node_modules -- envoy-harness config loader will fail at runtime"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $nm "agent-adapter"))) {
        Write-Fail "@envoymesh/agent-adapter missing from resources/node/node_modules -- required by envoy-harness-adapter"
    }
}

$nodeMb = Get-DirSizeMB (Join-Path $Res "node")
$openclawMb = Get-DirSizeMB (Join-Path $Res "openclaw")
$runtimeMb = Get-DirSizeMB (Join-Path $Res "node-runtime")
$piMb = Get-DirSizeMB $piDir
$ehMb = Get-DirSizeMB $ehDir
$ehAdapterMb = Get-DirSizeMB $ehAdapterDir

Write-Host "  node-runtime:  $(if ($null -ne $runtimeMb) { $runtimeMb } else { '?' }) MB"
Write-Host "  node:          $(if ($null -ne $nodeMb) { $nodeMb } else { '?' }) MB"
Write-Host "  openclaw:      $(if ($null -ne $openclawMb) { $openclawMb } else { '?' }) MB"
Write-Host "  pi:            $(if ($null -ne $piMb) { $piMb } else { '(not bundled)' }) MB"
Write-Host "  envoy-harness: $(if ($null -ne $ehMb) { $ehMb } else { '(not bundled)' }) MB (incl. $(if ($null -ne $ehAdapterMb) { $ehAdapterMb } else { 0 }) MB adapter)"

if (($null -ne $nodeMb) -and ($nodeMb -lt 20)) {
    Write-WarnMsg "node bundle looks too small ($nodeMb MB) -- production deps may be missing"
}
if (($null -ne $openclawMb) -and ($openclawMb -lt 50)) {
    Write-WarnMsg "openclaw tree looks too small ($openclawMb MB) -- re-stage OpenClaw"
}
if ((Test-Path -LiteralPath $piDir) -and ($null -ne $piMb) -and ($piMb -lt 5)) {
    Write-WarnMsg "pi tree looks too small ($piMb MB) -- run scripts/stage-tauri-pi-bundle / fetch-pi"
}
if ((Test-Path -LiteralPath $ehDir) -and ($null -ne $ehMb) -and ($ehMb -lt 1)) {
    Write-WarnMsg "envoy-harness tree looks too small ($ehMb MB)"
}

$rosterStaged = Join-Path $Res "node\relay-roster.json"
$rosterRoot = Join-Path $Root "relay-roster.json"
$rosterExample = Join-Path $Root "docs\examples\relay-roster.example.json"
if ((Test-Path -LiteralPath $rosterRoot) -or (Test-Path -LiteralPath $rosterExample)) {
    if (-not (Test-Path -LiteralPath $rosterStaged)) {
        Write-Fail "repo has relay-roster.json (or example) but it was not staged into resources/node/"
    }
    Write-Host "  relay-roster:  bundled in resources/node/ (Path C seed)"
} elseif (Test-Path -LiteralPath $rosterStaged) {
    Write-Host "  relay-roster:  present in resources/node/"
} else {
    Write-WarnMsg "No relay-roster.json in resources/node/ -- homes will rely on live relay HTTP only"
}

$pushCfg = Join-Path $Res "node\push-config.json"
$rootPush = Join-Path $Root "push-config.json"
if (Test-Path -LiteralPath $rootPush) {
    if (-not (Test-Path -LiteralPath $pushCfg)) {
        Write-Fail "repo-root push-config.json exists but was not staged into resources/node/"
    }
    Write-Host "  push-config:   bundled in resources/node/"
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $keyBase = & node -e "const c=require('fs').readFileSync(process.argv[1],'utf8'); const j=JSON.parse(c); const p=(j.apns&&j.apns.keyPath)||''; process.stdout.write(require('path').basename(p||'AuthKey_LKPCR48WHW.p8'))" $pushCfg
        $saBase = & node -e "const c=require('fs').readFileSync(process.argv[1],'utf8'); const j=JSON.parse(c); const p=(j.fcm&&j.fcm.serviceAccountJsonPath)||''; process.stdout.write(require('path').basename(p||'serviceAccountKey.json'))" $pushCfg
        if (Test-Path -LiteralPath (Join-Path $Res "node\$keyBase")) {
            Write-Host "  APNs key:      $keyBase"
        } else {
            Write-Fail "push-config.json bundled but missing $keyBase in resources/node/"
        }
        if (Test-Path -LiteralPath (Join-Path $Res "node\$saBase")) {
            Write-Host "  FCM account:   $saBase"
        } else {
            Write-Fail "push-config.json bundled but missing $saBase in resources/node/"
        }
    }
} elseif (Test-Path -LiteralPath $pushCfg) {
    Write-Host "  push-config:   present in resources/node/"
} else {
    Write-WarnMsg "No push-config.json in resources/node/ -- desktop push will need env vars or a profile-dir config"
}

Write-Host "  OK Tauri resources look complete"
