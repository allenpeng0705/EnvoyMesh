@echo off
REM
REM Run Relay Bootstrap Integration Tests
REM
REM This script runs integration tests for the relay bootstrap functionality.
REM It requires a running relay server to connect to.
REM
REM Usage:
REM   run-integration-tests.bat                          # Use default local relay
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
    echo WARNING: TEST_RELAY_ADDR not set.
    echo Some tests will be skipped or may fail.
    echo.
    echo To run with a relay server:
    echo   set TEST_RELAY_ADDR=/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW...
    echo   run-integration-tests.bat
    echo.
)

REM Export for tests
set "TEST_RELAY_ADDR=%RELAY_ADDR%"
set "TEST_BOOTSTRAP_PRESETS=%PRESETS%"

REM Change to project root
cd /d "%PROJECT_ROOT%"

echo Running tests...
echo.

npm test -- "%TEST_FILE%" %VERBOSE%
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
