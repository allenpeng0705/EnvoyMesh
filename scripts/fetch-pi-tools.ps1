# Fetch pinned fd + ripgrep into resources\pi\bin\ (Windows twin of fetch-pi-tools.sh).
# See that script for why — Pi hangs in GUI apps without these on PATH.
param()

$ErrorActionPreference = "Stop"
if (-not $PSScriptRoot) { throw "PSScriptRoot empty — run as .\scripts\fetch-pi-tools.ps1" }
$Root = Split-Path -Parent $PSScriptRoot
$Dest = Join-Path $Root "apps\tauri\src-tauri\resources\pi\bin"

$FdVersion = if ($env:ENVOYMESH_FD_VERSION) { $env:ENVOYMESH_FD_VERSION } else { "10.2.0" }
$RgVersion = if ($env:ENVOYMESH_RG_VERSION) { $env:ENVOYMESH_RG_VERSION } else { "14.1.1" }

# Desktop Windows installers in this repo are always x86_64-pc-windows-msvc
# (tauri build --target x86_64-pc-windows-msvc). Do NOT follow the build
# host CPU — ARM64 Windows would otherwise stage aarch64 fd/rg that the
# x64 Node/Pi child cannot run. Override with ENVOYMESH_PI_TOOLS_TARGET.
$target = if ($env:ENVOYMESH_PI_TOOLS_TARGET) {
    $env:ENVOYMESH_PI_TOOLS_TARGET
} else {
    "x86_64-pc-windows-msvc"
}
$fdExe = "fd.exe"
$rgExe = "rg.exe"
$marker = Join-Path $Dest ".tools-version"
$want = "fd=$FdVersion;rg=$RgVersion;target=$target"

if ((Test-Path (Join-Path $Dest $fdExe)) -and (Test-Path (Join-Path $Dest $rgExe)) -and (Test-Path $marker)) {
    $have = (Get-Content $marker -Raw).Trim()
    if ($have -eq $want) {
        Write-Host "  ✓ Pi tools already staged ($want)"
        exit 0
    }
}

Write-Host "  Fetching fd $FdVersion + ripgrep $RgVersion for $target..."
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("envoymesh-pi-tools-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
    $fdUrl = "https://github.com/sharkdp/fd/releases/download/v$FdVersion/fd-v$FdVersion-$target.zip"
    $rgUrl = "https://github.com/BurntSushi/ripgrep/releases/download/$RgVersion/ripgrep-$RgVersion-$target.zip"
    $fdZip = Join-Path $tmp "fd.zip"
    $rgZip = Join-Path $tmp "rg.zip"
    $downloaded = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Invoke-WebRequest -Uri $fdUrl -OutFile $fdZip -UseBasicParsing
            Invoke-WebRequest -Uri $rgUrl -OutFile $rgZip -UseBasicParsing
            $downloaded = $true
            break
        } catch {
            Write-Host "    retry $attempt download failed: $($_.Exception.Message)"
            Start-Sleep -Seconds (2 * $attempt)
        }
    }
    if (-not $downloaded) {
        $cache = Join-Path $env:USERPROFILE ".pi\agent\bin"
        $cacheFd = Join-Path $cache $fdExe
        $cacheRg = Join-Path $cache $rgExe
        if ((Test-Path $cacheFd) -and (Test-Path $cacheRg)) {
            # Smoke-test: refuse wrong-arch cache binaries.
            $fdOk = $false
            $rgOk = $false
            try { & $cacheFd --version 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $fdOk = $true } } catch { }
            try { & $cacheRg --version 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $rgOk = $true } } catch { }
            if ($fdOk -and $rgOk) {
                Write-Host "  ⚠ GitHub download failed — copying fd/rg from $cache"
                New-Item -ItemType Directory -Force -Path $Dest | Out-Null
                Copy-Item -Force $cacheFd (Join-Path $Dest $fdExe)
                Copy-Item -Force $cacheRg (Join-Path $Dest $rgExe)
                Set-Content -Path $marker -Value "$want;source=user-cache" -Encoding UTF8 -NoNewline
                Write-Host "  ✓ Pi tools staged from user cache at $Dest"
                exit 0
            }
            Write-Host "  ⚠ cache tools present but not runnable on this host — skipping cache fallback"
        }
        throw "Failed to download fd/rg from GitHub and no usable $cache cache. Install with: winget install sharkdp.fd BurntSushi.ripgrep.MSVC"
    }

    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    $fdExtract = Join-Path $tmp "fd-extract"
    $rgExtract = Join-Path $tmp "rg-extract"
    New-Item -ItemType Directory -Force -Path $fdExtract, $rgExtract | Out-Null
    Expand-Archive -Path $fdZip -DestinationPath $fdExtract -Force
    Expand-Archive -Path $rgZip -DestinationPath $rgExtract -Force

    $fdFound = Get-ChildItem -Path $fdExtract -Recurse -Filter $fdExe -File | Select-Object -First 1
    $rgFound = Get-ChildItem -Path $rgExtract -Recurse -Filter $rgExe -File | Select-Object -First 1
    if (-not $fdFound) { throw "fd.exe not found in downloaded archive" }
    if (-not $rgFound) { throw "rg.exe not found in downloaded archive" }

    Copy-Item -Force $fdFound.FullName (Join-Path $Dest $fdExe)
    Copy-Item -Force $rgFound.FullName (Join-Path $Dest $rgExe)
    Set-Content -Path $marker -Value $want -Encoding UTF8 -NoNewline
    Write-Host "  ✓ Pi tools staged at $Dest ($fdExe, $rgExe)"
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
