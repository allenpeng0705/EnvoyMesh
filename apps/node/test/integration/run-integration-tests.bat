@echo off
REM
REM Run Relay Bootstrap Integration Tests
REM
REM These tests need a reachable relay; by default they use the EnvoyMesh
REM community relay (repo-root .env TEST_RELAY_ADDR, falling back to cn-relay).
REM No local relay is required. Override with TEST_RELAY_ADDR / --relay-addr.
REM
REM The test file is gated behind RUN_E2E=1 RUN_WAN_RELAY_TESTS=1; this script
REM sets both, so it runs the file for real instead of reporting a vacuous pass.
REM
REM Usage:
REM   run-integration-tests.bat                          # Community relay
REM   run-integration-tests.bat --relay-addr=xxx        # Custom relay
REM   run-integration-tests.bat --presets=public-libp2p  # Use specific presets
REM   run-integration-tests.bat --verbose               # Verbose output
REM
REM Environment variables:
REM   TEST_RELAY_ADDR   - Relay server multiaddr
REM   TEST_BOOTSTRAP_PRESETS - Comma-separated presets
REM

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PROJECT_ROOT=%SCRIPT_DIR%\..\..\..\.."

REM Default values
set "RELAY_ADDR=%TEST_RELAY_ADDR%"
set "PRESETS=%TEST_BOOTSTRAP_PRESETS%"
if "%PRESETS%"=="" set "PRESETS=public-libp2p"
set "VERBOSE="
set "TEST_FILE=apps\node\test\integration\bootstrap-relay.test.ts"

REM Parse arguments
:parse_args
if "%~1"=="" goto :run_tests
if "%~1"=="--relay-addr" (
    set "RELAY_ADDR=%~2"
    shift
    shift
    goto :parse_args
)
if "%~1"=="--relay-addr=*" (
    set "RELAY_ADDR=%~1"
    set "RELAY_ADDR=!RELAY_ADDR:*--relay-addr=!"
    shift
    goto :parse_args
)
if "%~1"=="--presets" (
    set "PRESETS=%~2"
    shift
    shift
    goto :parse_args
)
if "%~1"=="--presets=*" (
    set "PRESETS=%~1"
    set "PRESETS=!PRESETS:*--presets=!"
    shift
    goto :parse_args
)
if "%~1"=="--verbose" goto :parse_args
if "%~1"=="-v" (
    set "VERBOSE=--reporter=verbose"
    shift
    goto :parse_args
)
if "%~1"=="--help" goto :show_help
if "%~1"=="-h" goto :show_help
echo Unknown option: %~1
exit /b 1

:show_help
echo Usage: run-integration-tests.bat [options]
echo.
echo Options:
echo   --relay-addr ^<addr^>   Relay server multiaddr
echo   --presets ^<presets^>   Bootstrap presets (comma-separated)
echo   --verbose, -v          Verbose output
echo   --help, -h             Show this help
echo.
echo Environment variables:
echo   TEST_RELAY_ADDR         Relay server multiaddr
echo   TEST_BOOTSTRAP_PRESETS  Bootstrap presets
exit /b 0

:run_tests
echo ========================================
echo   Relay Bootstrap Integration Tests
echo ========================================
echo.
echo Configuration:
echo   Relay Address: %RELAY_ADDR%
echo   Presets:      %PRESETS%
echo   Test File:    %TEST_FILE%
echo.

if "%RELAY_ADDR%"=="" (
    echo TEST_RELAY_ADDR not set - using the built-in community cn-relay.
    echo Set TEST_RELAY_ADDR to point at a private relay.
    echo.
)

REM Export for tests
set "TEST_RELAY_ADDR=%RELAY_ADDR%"
set "TEST_BOOTSTRAP_PRESETS=%PRESETS%"
REM Gates: without these vitest excludes/skips the file entirely.
set "RUN_E2E=1"
set "RUN_WAN_RELAY_TESTS=1"

REM Change to project root
cd /d "%PROJECT_ROOT%"

echo Running tests...
echo.

npx vitest run "%TEST_FILE%" %VERBOSE%
if errorlevel 1 (
    echo.
    echo ========================================
    echo   Tests failed!
    echo ========================================
    exit /b 1
) else (
    echo.
    echo ========================================
    echo   All tests passed!
    echo ========================================
    exit /b 0
)
