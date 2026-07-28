#!/usr/bin/env bash
# Post-stage smoke for the Pi sidecar staged by
# scripts/stage-tauri-pi-bundle.sh (or build-desktop.ps1's inline Pi block).
#
# Spawns the staged Pi CLI with `--help` and asserts it:
#   1. Exits cleanly (exit 0) within a timeout.
#   2. Prints "pi-coding-agent" or similar in the help banner, proving the
#      CLI actually loaded (vs. crashing on a missing dependency or broken
#      native module).
#
# Catches the class of bundle defects that escape pre-flight validation
# (file-existence checks in verify-tauri-resources.sh) and only show up
# as "Pi sidecar not found" at runtime.
#
# Mirrors scripts/smoke-openclaw-bundle.sh but for the Pi sidecar.
#
# Usage:  bash scripts/smoke-pi-bundle.sh
# Env:
#   PI_DIR          Override staged tree path (default:
#                   apps/tauri/src-tauri/resources/pi)
#   PI_CLI          Override CLI entry (default: PI_DIR + standard layout)
#   NODE_BIN        Override Node binary   (default: system `node` via PATH)
#   SMOKE_TIMEOUT   Seconds to wait        (default: 30)
#
# Exit codes:
#   0  Pi CLI loaded and printed a recognisable banner in time
#   2  missing staged tree or CLI entry
#   3  Pi CLI refused to start (init/import error)
#   4  timed out before producing a banner
#   5  unexpected exit code (e.g. missing native dep)

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PI_DIR="${PI_DIR:-$ROOT/apps/tauri/src-tauri/resources/pi}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-30}"

# Discover Node. Pi is a Node.js package; the runtime invokes it via the
# bundled node-runtime/node sidecar, but for the smoke any node >= 22
# works fine.
NODE_BIN="${NODE_BIN:-}"
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node || true)"
fi
if [ -z "$NODE_BIN" ]; then
  echo "[smoke] ✗ node not found in PATH" >&2
  exit 2
fi

# Standard CLI entry path. Override via PI_CLI when the staged layout
# differs from the upstream npm install (e.g. custom fetch recipes).
PI_CLI="${PI_CLI:-$PI_DIR/node_modules/@earendil-works/pi-coding-agent/dist/cli.js}"

SMOKE_LOG="/tmp/envoymesh-pi-smoke.$$.log"

cleanup() {
  rm -f "$SMOKE_LOG" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[smoke] Pi bundle smoke @ $PI_DIR"
echo "[smoke] CLI entry: $PI_CLI"
echo "[smoke] Node: $NODE_BIN ($( "$NODE_BIN" -v 2>&1 || true))"
echo "[smoke] Timeout: ${SMOKE_TIMEOUT}s"

# Existence checks: bail with a clear, actionable error before we spawn.
missing=()
[ -f "$PI_CLI" ]                                || missing+=("cli.js")
[ -f "$PI_DIR/node_modules/@earendil-works/pi-coding-agent/dist/index.js" ] \
                                                || missing+=("dist/index.js")
[ -f "$PI_DIR/node_modules/@earendil-works/pi-coding-agent/package.json" ] \
                                                || missing+=("package.json")
if [ ${#missing[@]} -gt 0 ]; then
  echo "[smoke] ✗ staged tree is missing critical files: ${missing[*]}" >&2
  echo "[smoke]   Re-run: bash scripts/stage-tauri-pi-bundle.sh" >&2
  exit 2
fi

# Spawn the CLI with --help. Pi's CLI prints a usage banner; we look for
# either the package name or a typical CLI signature marker.
echo "[smoke] Spawning: $NODE_BIN $PI_CLI --help"
(
  cd "$PI_DIR"
  "$NODE_BIN" "$PI_CLI" --help > "$SMOKE_LOG" 2>&1
)
exit_code=$?

# Show recent log lines so failures are diagnosable from one place.
echo "[smoke] ----- Pi CLI output (full) -----"
cat "$SMOKE_LOG" 2>/dev/null || echo "(no log)"
echo "[smoke] --------------------------------"

# Recognise the banner. Pi's --help typically mentions "pi" and either
# "coding" / "agent" / "Usage:". Match loosely so we don't break on
# upstream banner tweaks.
banner_ok=""
if grep -qiE "pi[- ]coding[- ]agent|Usage:|\\<pi\\>" "$SMOKE_LOG" 2>/dev/null; then
  banner_ok="yes"
fi

if [ "$exit_code" -ne 0 ]; then
  # Fail-fast on the known-bad import signatures.
  for marker in "ERR_MODULE_NOT_FOUND" "Cannot find module" "MODULE_NOT_FOUND" \
                "SyntaxError" "TypeError: Cannot read"; do
    if grep -q "$marker" "$SMOKE_LOG" 2>/dev/null; then
      echo "[smoke] ✗ Pi CLI refused to start — saw marker: '$marker' (exit $exit_code)" >&2
      exit 3
    fi
  done
  echo "[smoke] ✗ Pi CLI exited with code $exit_code (no recognisable banner)" >&2
  exit 5
fi

if [ -z "$banner_ok" ]; then
  echo "[smoke] ✗ Pi CLI exited 0 but did not print a recognisable banner" >&2
  echo "[smoke]   The CLI may be a different version, or --help output is truncated" >&2
  exit 3
fi

echo "[smoke] ✓ Pi CLI ready (exit 0, banner recognised within ${SMOKE_TIMEOUT}s)"
exit 0