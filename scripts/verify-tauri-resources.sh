#!/usr/bin/env bash
# Verify Tauri desktop resources are staged before `tauri build`.
# A healthy macOS .app is typically hundreds of MB once node + OpenClaw are bundled.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RES="$ROOT/apps/tauri/src-tauri/resources"
SOCIAL_DIST="$ROOT/apps/social/src/dist/index.html"

fail() {
  echo "error: $1" >&2
  exit 1
}

warn() {
  echo "  ⚠ $1" >&2
}

require_file() {
  local path="$1"
  local label="$2"
  if [ ! -f "$path" ]; then
    fail "missing $label at $path — run ./scripts/build-desktop.sh from repo root (steps 1–2 must succeed)"
  fi
}

require_dir_nonempty() {
  local path="$1"
  local label="$2"
  if [ ! -d "$path" ]; then
    fail "missing $label directory at $path"
  fi
  if [ -z "$(ls -A "$path" 2>/dev/null)" ]; then
    fail "$label directory is empty at $path"
  fi
}

echo "Verifying Tauri bundle resources..."

require_file "$RES/node-runtime/node" "Node.js sidecar (macOS/Linux)"
require_file "$RES/node/dist/src/index.js" "compiled EnvoyMesh node"
require_file "$RES/openclaw/openclaw.mjs" "OpenClaw gateway entry"
require_dir_nonempty "$RES/openclaw/node_modules" "OpenClaw node_modules"
require_file "$SOCIAL_DIST" "built Social UI (apps/social/src/dist)"

node_mb="$(du -sm "$RES/node" 2>/dev/null | awk '{print $1}')"
openclaw_mb="$(du -sm "$RES/openclaw" 2>/dev/null | awk '{print $1}')"
runtime_mb="$(du -sm "$RES/node-runtime" 2>/dev/null | awk '{print $1}')"

echo "  node-runtime:  ${runtime_mb:-?} MB"
echo "  node:          ${node_mb:-?} MB"
echo "  openclaw:      ${openclaw_mb:-?} MB"

if [ "${node_mb:-0}" -lt 20 ]; then
  warn "node bundle looks too small (${node_mb} MB) — production deps may be missing"
fi
if [ "${openclaw_mb:-0}" -lt 50 ]; then
  warn "openclaw tree looks too small (${openclaw_mb} MB) — run scripts/stage-tauri-openclaw-bundle.sh"
fi

echo "  ✓ Tauri resources look complete"
