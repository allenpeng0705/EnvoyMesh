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
require_file "$RES/openclaw/dist/entry.js" "OpenClaw compiled entry.js"
require_file "$RES/openclaw/dist/config/config.js" "OpenClaw config module"
require_file "$RES/openclaw/extensions/envoymesh/index.js" "EnvoyMesh channel extension (compiled)"
require_file "$RES/openclaw/dist/extensions/envoymesh/index.js" "EnvoyMesh channel extension (in dist/extensions/ — plugin discovery root)"
require_file "$RES/openclaw/dist/extensions/envoymesh/openclaw.plugin.json" "EnvoyMesh plugin manifest (in dist/extensions/)"
require_file "$RES/openclaw-envoymesh/index.js" "EnvoyMesh extension seed (runtime heal source)"
require_file "$RES/openclaw/dist/cli/run-main.js" "OpenClaw CLI runtime entry"
require_dir_nonempty "$RES/openclaw/node_modules" "OpenClaw node_modules"

# Sanity check: node_modules should have >500 packages (600+ is normal).
nm_count="$(find "$RES/openclaw/node_modules" -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"
if [ "${nm_count:-0}" -lt 500 ]; then
  warn "node_modules has only ${nm_count} directories (expected 600+) — may be incomplete"
fi

# Reject broken stub entry.js that was written by the dev node at runtime
# or by a failed setup.sh build. These won't work in the Tauri bundle
# where src/ is excluded.
if grep -qE "EnvoyMesh bootstrap|from.*src/cli/run-main" "$RES/openclaw/dist/entry.js" 2>/dev/null; then
  fail "openclaw dist/entry.js is a runtime stub — rebuild OpenClaw or set STAGE_OPENCLAW_BUNDLE=1"
fi

# Pi agent sidecar (Phase 49). Optional on slim builds — tauri.conf.slim.json
# omits resources/pi/**/* and the build is invoked with STAGE_PI_BUNDLE=0 or
# build-desktop.ps1 -SkipPi. So only require Pi when the resources/pi/ dir
# actually exists; if it's absent, the Pi chat panel is disabled at runtime.
PI_DIR="$RES/pi"
PI_CLI="$PI_DIR/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
if [ -d "$PI_DIR" ]; then
  require_file "$PI_CLI" "Pi CLI entry (node_modules/@earendil-works/pi-coding-agent/dist/cli.js)"
  require_file "$PI_DIR/node_modules/@earendil-works/pi-coding-agent/dist/index.js" "Pi SDK entry (node_modules/@earendil-works/pi-coding-agent/dist/index.js)"
  require_file "$PI_DIR/node_modules/@earendil-works/pi-coding-agent/package.json" "Pi package.json"
  require_dir_nonempty "$PI_DIR/node_modules/@earendil-works" "Pi @earendil-works packages (pi-ai, pi-agent-core, pi-tui)"
  # fd/rg — without these, GUI launches hang on Pi's GitHub auto-download.
  case "$(uname -s)" in
    Darwin|Linux)
      require_file "$PI_DIR/bin/fd" "Pi tool fd (run scripts/fetch-pi-tools.sh)"
      require_file "$PI_DIR/bin/rg" "Pi tool rg (run scripts/fetch-pi-tools.sh)"
      ;;
    *)
      require_file "$PI_DIR/bin/fd.exe" "Pi tool fd.exe (run scripts/fetch-pi-tools.ps1)"
      require_file "$PI_DIR/bin/rg.exe" "Pi tool rg.exe (run scripts/fetch-pi-tools.ps1)"
      ;;
  esac
  pi_version_file="$PI_DIR/.pi-version"
  if [ -f "$pi_version_file" ]; then
    echo "  Pi version:    $(cat "$pi_version_file")"
  fi
else
  # Slim build (no Pi bundled) — acceptable. The runtime disables the Pi panel.
  warn "Pi sidecar not bundled (slim build) — Pi chat panel will be disabled at runtime"
fi

require_file "$SOCIAL_DIST" "built Social UI (apps/social/src/dist)"

# envoy-harness (Phase 8). Optional on debug builds — set STAGE_ENVOY_HARNESS=0
# to skip staging. The runtime disables the envoy-harness engine when the
# staged tree is absent.
ENVOY_HARNESS_DIR="$RES/envoy-harness"
ENVOY_HARNESS_ADAPTER_DIR="$RES/envoy-harness-adapter"
if [ -d "$ENVOY_HARNESS_DIR" ]; then
  require_file "$ENVOY_HARNESS_DIR/index.js" "envoy-harness main entry"
  require_file "$ENVOY_HARNESS_DIR/index.d.ts" "envoy-harness type definitions"
  require_dir_nonempty "$ENVOY_HARNESS_DIR" "envoy-harness staged tree"
  require_file "$ENVOY_HARNESS_ADAPTER_DIR/index.js" "envoy-harness-adapter main entry"
  require_file "$ENVOY_HARNESS_ADAPTER_DIR/index.d.ts" "envoy-harness-adapter type definitions"
  require_dir_nonempty "$ENVOY_HARNESS_ADAPTER_DIR" "envoy-harness-adapter staged tree"
else
  if [ "${STAGE_ENVOY_HARNESS:-}" = "0" ]; then
    warn "envoy-harness not bundled (STAGE_ENVOY_HARNESS=0) — envoy-harness engine will be unavailable at runtime"
  else
    fail "envoy-harness staged tree missing at $ENVOY_HARNESS_DIR — run scripts/stage-tauri-envoy-harness-bundle.sh (or set STAGE_ENVOY_HARNESS=0 to skip)"
  fi
fi

node_mb="$(du -sm "$RES/node" 2>/dev/null | awk '{print $1}')"
openclaw_mb="$(du -sm "$RES/openclaw" 2>/dev/null | awk '{print $1}')"
runtime_mb="$(du -sm "$RES/node-runtime" 2>/dev/null | awk '{print $1}')"
pi_mb="$(du -sm "$RES/pi" 2>/dev/null | awk '{print $1}')"
envoy_harness_mb="$(du -sm "$RES/envoy-harness" 2>/dev/null | awk '{print $1}')"
envoy_harness_adapter_mb="$(du -sm "$RES/envoy-harness-adapter" 2>/dev/null | awk '{print $1}')"

echo "  node-runtime:  ${runtime_mb:-?} MB"
echo "  node:          ${node_mb:-?} MB"
echo "  openclaw:      ${openclaw_mb:-?} MB"
echo "  pi:            ${pi_mb:-(not bundled)} MB"
echo "  envoy-harness: ${envoy_harness_mb:-(not bundled)} MB (incl. ${envoy_harness_adapter_mb:-0} MB adapter)"

if [ "${node_mb:-0}" -lt 20 ]; then
  warn "node bundle looks too small (${node_mb} MB) — production deps may be missing"
fi
if [ "${openclaw_mb:-0}" -lt 50 ]; then
  warn "openclaw tree looks too small (${openclaw_mb} MB) — run scripts/stage-tauri-openclaw-bundle.sh"
fi
if [ -d "$PI_DIR" ] && [ "${pi_mb:-0}" -lt 5 ]; then
  warn "pi tree looks too small (${pi_mb} MB) — run scripts/stage-tauri-pi-bundle.sh"
fi
if [ -d "$ENVOY_HARNESS_DIR" ] && [ "${envoy_harness_mb:-0}" -lt 1 ]; then
  warn "envoy-harness tree looks too small (${envoy_harness_mb} MB) — run scripts/stage-tauri-envoy-harness-bundle.sh"
fi

# Push credentials — require push-config.json in the node bundle when present
# at the repo root (operator packaging with push enabled). Relative key paths
# resolve via ENVOYMESH_NODE_BUNDLE_DIR (= resources/node) on macOS + Windows.
PUSH_CFG="$RES/node/push-config.json"
ROOT_PUSH="$ROOT/push-config.json"
if [ -f "$ROOT_PUSH" ]; then
  if [ ! -f "$PUSH_CFG" ]; then
    fail "repo-root push-config.json exists but was not staged into resources/node/ — re-run stage-tauri-node-bundle.sh / stage-tauri-push-credentials.sh"
  fi
  echo "  push-config:   bundled in resources/node/"
  if command -v node >/dev/null 2>&1; then
    key_base="$(node -e "const c=require('fs').readFileSync(process.argv[1],'utf8'); const j=JSON.parse(c); const p=(j.apns&&j.apns.keyPath)||''; process.stdout.write(require('path').basename(p||'AuthKey_LKPCR48WHW.p8'))" "$PUSH_CFG")"
    sa_base="$(node -e "const c=require('fs').readFileSync(process.argv[1],'utf8'); const j=JSON.parse(c); const p=(j.fcm&&j.fcm.serviceAccountJsonPath)||''; process.stdout.write(require('path').basename(p||'serviceAccountKey.json'))" "$PUSH_CFG")"
    if [ -f "$RES/node/$key_base" ]; then
      echo "  APNs key:      $key_base"
    else
      fail "push-config.json bundled but missing $key_base in resources/node/ (required for EnvoyGo iOS push) — place it at repo root and re-run stage-tauri-push-credentials.sh"
    fi
    if [ -f "$RES/node/$sa_base" ]; then
      echo "  FCM account:   $sa_base"
    else
      fail "push-config.json bundled but missing $sa_base in resources/node/ (required for EnvoyGo Android push) — place it at repo root and re-run stage-tauri-push-credentials.sh"
    fi
  fi
elif [ -f "$PUSH_CFG" ]; then
  echo "  push-config:   present in resources/node/"
else
  warn "No push-config.json in resources/node/ — desktop push will need env vars or a profile-dir config"
fi

echo "  ✓ Tauri resources look complete"
