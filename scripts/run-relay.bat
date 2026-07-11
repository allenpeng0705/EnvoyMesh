@echo off
:: EnvoyMesh Relay Server Quick Start Script
:: For Windows
:: Usage: run-relay.bat [--profile DIR] [--port PORT] [--advertise IP] [--http-port PORT] [--public-mode]
::
:: Always rebuilds apps/relay and its workspace deps before launching.
:: tsc -b is incremental (1-3 s on no-op), and stale binaries are the #1
:: source of "why isn't my fix live" relay bugs.

setlocal enabledelayedexpansion

set "RELAY_DIR=%~dp0"
set "RELAY_DIR=%RELAY_DIR:~0,-1%"
set "PROFILE_DIR=%ENVOYMESH_PROFILE%"
if "%PROFILE_DIR%"=="" set "PROFILE_DIR=.\data\relay"
set "LISTEN_PORT=%RELAY_PORT%"
if "%LISTEN_PORT%"=="" set "LISTEN_PORT=4001"
set "ADVERTISE_ADDR="
set "HTTP_PORT="
set "SKIP_REBUILD=0"
set "PUBLIC_MODE=%ENVOYMESH_RELAY_PUBLIC_MODE%"
if "%PUBLIC_MODE%"=="" set "PUBLIC_MODE=0"

:: Parse arguments
:parse_args
if "%~1"=="" goto :run_relay
if "%~1"=="--profile" (
    set "PROFILE_DIR=%~2"
    shift
    shift
    goto :parse_args
)
if "%~1"=="--port" (
    set "LISTEN_PORT=%~2"
    shift
    shift
    goto :parse_args
)
if "%~1"=="--advertise" (
    set "ADVERTISE_ADDR=%~2"
    shift
    shift
    goto :parse_args
)
if "%~1"=="--http-port" (
    set "HTTP_PORT=%~2"
    shift
    shift
    goto :parse_args
)
if "%~1"=="--public-mode" (
    :: Apply community-relay presets to circuit-relay-v2: 1024
    :: reservations, 30 min TTL, 4 MiB data, 60 min duration, 90 s
    :: hop timeout, 1024 outbound stop streams. Default (off) keeps
    :: libp2p's embedded-use defaults (15 reservations, 2 min TTL).
    :: Public mode is the only way a remote peer can reserve a slot
    :: on this relay when they're not on its allowlist.
    set "PUBLIC_MODE=1"
    shift
    goto :parse_args
)
if "%~1"=="--private-mode" (
    :: Explicit opt-out. Useful when the env var accidentally enabled
    :: public mode but the operator wants embedded defaults for this run.
    set "PUBLIC_MODE=0"
    shift
    goto :parse_args
)
if "%~1"=="--rebuild" (
    :: Accepted for backward compat — build is always on now.
    shift
    goto :parse_args
)
if "%~1"=="--no-rebuild" (
    set "SKIP_REBUILD=1"
    shift
    goto :parse_args
)
if "%~1"=="--help" goto :show_help
if "%~1"=="-h" goto :show_help
echo Unknown option: %~1
exit /b 1

:show_help
echo EnvoyMesh Relay Server
echo.
echo Usage: run-relay.bat [options]
echo.
echo Options:
echo   --profile ^<dir^>    Profile directory (default: .\data\relay)
echo   --port ^<port^>      Listen port (default: 4001)
echo   --advertise ^<IP^>   Public IP for advertise address
echo   --http-port ^<port^>  HTTP port for /info endpoint (optional)
echo   --public-mode      Apply community-relay presets to circuit-relay-v2
echo                      (1024 reservations, 30 min TTL, 4 MiB data, etc.).
echo                      Default is private mode (libp2p embedded defaults,
echo                      15 reservations, 2 min TTL) which only serves peers
echo                      on the relay's allowlist. Public mode accepts any peer.
echo   --private-mode     Force private mode for this run (overrides env var).
echo   --rebuild          (legacy no-op — build is always on)
echo   --no-rebuild       Skip the pre-launch build (escape hatch)
echo   --help, -h         Show this help
echo.
echo Environment variables:
echo   ENVOYMESH_PROFILE          Profile directory
echo   ENVOYMESH_BOOTSTRAP        Bootstrap peers (comma-separated)
echo   RELAY_PORT                 Default listen port
echo   ENVOYMESH_RELAY_PUBLIC_MODE  Set to 1 to enable public mode (default: 0)
exit /b 0

:run_relay
:: Always rebuild protocol + api + network + relay before launch.
:: The relay's prebuild hook runs `tsc -p ../../packages/network/tsconfig.json`,
:: so `npm run relay:build` covers network. We also build protocol and api
:: explicitly so their dist/ is current for the relay to import.
if "%SKIP_REBUILD%"=="0" (
    echo Building relay server ^(incremental^)...
    echo   protocol
    pushd "%RELAY_DIR%\packages\protocol"
    call npx tsc -p tsconfig.json
    popd
    echo   api
    pushd "%RELAY_DIR%\packages\api"
    call npx tsc -p tsconfig.json
    popd
    echo   network ^(tsc -b pulls @envoymesh/identity in transitively^)
    pushd "%RELAY_DIR%"
    call npm run build -w @envoymesh/network
    popd
    echo   relay
    pushd "%RELAY_DIR%"
    call npm run relay:build
    popd
    echo Build done.
) else (
    echo Skipping build ^(--no-rebuild^).
)

:: Create profile directory
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

:: Build listen address
set "LISTEN_ADDR=/ip4/0.0.0.0/tcp/%LISTEN_PORT%"

:: Build command
set "CMD=node %RELAY_DIR%apps\relay\dist\index.js --profile %PROFILE_DIR% --listen %LISTEN_ADDR%"

:: Add advertise address if provided
if not "%ADVERTISE_ADDR%"=="" (
    set "CMD=!CMD! --advertise-addr /ip4/%ADVERTISE_ADDR%/tcp/%LISTEN_PORT%"
)

:: Add HTTP port if provided
if not "%HTTP_PORT%"=="" (
    set "CMD=!CMD! --http-port !HTTP_PORT!"
)

:: Add public-mode flag if requested
if "%PUBLIC_MODE%"=="1" (
    set "CMD=!CMD! --relay-public-mode"
)

:: Add bootstrap peers if set
if not "%ENVOYMESH_BOOTSTRAP%"=="" (
    for %%P in (%ENVOYMESH_BOOTSTRAP%) do (
        set "CMD=!CMD! --bootstrap %%P"
    )
)

echo ==========================================
echo   EnvoyMesh Relay Server
echo ==========================================
echo   Profile: %PROFILE_DIR%
echo   Listen:  %LISTEN_ADDR%
if not "%ADVERTISE_ADDR%"=="" (
    echo   Advertise: /ip4/%ADVERTISE_ADDR%/tcp/%LISTEN_PORT%
)
if not "%HTTP_PORT%"=="" (
    echo   HTTP Info: port %HTTP_PORT% (/info endpoint)
)
if "%PUBLIC_MODE%"=="1" (
    echo   Mode:    PUBLIC ^(1024 reservations, 30 min TTL, 4 MiB data^)
) else (
    echo   Mode:    PRIVATE ^(libp2p defaults: 15 reservations, 2 min TTL^)
    echo            Use --public-mode to accept reservations from non-allowlisted peers
)
echo ==========================================
echo.

:: Run relay
echo Running: %CMD%
call %CMD%