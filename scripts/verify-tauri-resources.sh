#!/usr/bin/env bash
# Verify Tauri desktop resources are staged before `tauri build`.
# Shared by build-desktop.sh (macOS/Linux) and build-desktop.ps1 (Windows via Git Bash).
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

NODE_SIDECAR="$RES/node-runtime/node"
if [ ! -f "$NODE_SIDECAR" ] && [ -f "$RES/node-runtime/node.exe" ]; then
  NODE_SIDECAR="$RES/node-runtime/node.exe"
fi
require_file "$NODE_SIDECAR" "Node.js sidecar"
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

SELF_REF="$RES/openclaw/node_modules/openclaw/package.json"
if [ ! -f "$SELF_REF" ]; then
  fail "OpenClaw node_modules/openclaw/package.json is missing — gateway will refuse to start"
fi
echo "  OpenClaw node_modules/openclaw/ self-reference OK"

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
  # Check both the native name (macOS/Linux) and the .exe form (Windows).
  # The Windows case is the default because most contributors are on Windows;
  # the uname-based dispatch is unreliable when invoked from WSL bash on
  # Windows (uname -s reports "Linux" but the actual binary is fd.exe).
  for bin_name in fd rg; do
    found=""
    for candidate in "$PI_DIR/bin/$bin_name" "$PI_DIR/bin/$bin_name.exe"; do
      if [ -f "$candidate" ]; then
        found="ok"
        break
      fi
    done
    if [ -z "$found" ]; then
      fail "Pi tool $bin_name missing at $PI_DIR/bin/$bin_name (or $bin_name.exe) — run scripts/fetch-pi-tools.{sh,ps1}"
    fi
  done
  pi_version_file="$PI_DIR/.pi-version"
  if [ -f "$pi_version_file" ]; then
    echo "  Pi version:    $(cat "$pi_version_file")"
  fi
  # Pi folder picker is a custom Tauri command — must be in capabilities ACL
  # or Social shows "Command pick_directory not allowed by ACL".
  CAP_FILE="$ROOT/apps/tauri/src-tauri/capabilities/default.json"
  if [ ! -f "$CAP_FILE" ]; then
    fail "missing Tauri capabilities at $CAP_FILE"
  fi
  if ! grep -q 'allow-pick-directory' "$CAP_FILE"; then
    fail "capabilities/default.json missing allow-pick-directory — Pi Browse… will fail with ACL error"
  fi
  echo "  Pi folder picker ACL (allow-pick-directory)"
else
  # Slim build (no Pi bundled) — acceptable. The runtime disables the Pi panel.
  warn "Pi sidecar not bundled (slim build) — Pi chat panel will be disabled at runtime"
fi

require_file "$SOCIAL_DIST" "built Social UI (apps/social/src/dist)"

# envoy-harness (Phase 8). Optional on debug builds — set STAGE_ENVOY_HARNESS=0
# *and* ENVOYMESH_ALLOW_BROKEN_HARNESS_SKIP=1. The node statically imports the
# adapter, so a skip without wiring into node_modules crashes on first launch.
ENVOY_HARNESS_DIR="$RES/envoy-harness"
ENVOY_HARNESS_ADAPTER_DIR="$RES/envoy-harness-adapter"
ENVOY_HARNESS_CLIENT_DIR="$RES/envoy-harness-client"
ENVOY_HARNESS_PEER_DIR="$RES/envoy-harness-peer"
ENVOY_HARNESS_TUI_DIR="$RES/envoy-harness-tui"
ENVOY_HARNESS_NODE_MOD="$RES/node/node_modules/@envoymesh/envoy-harness"
ENVOY_HARNESS_ADAPTER_NODE_MOD="$RES/node/node_modules/@envoymesh/envoy-harness-adapter"
ENVOY_HARNESS_CLIENT_NODE_MOD="$RES/node/node_modules/@envoymesh/envoy-harness-client"
ENVOY_HARNESS_PEER_NODE_MOD="$RES/node/node_modules/@envoymesh/envoy-harness-peer"
ENVOY_HARNESS_TUI_NODE_MOD="$RES/node/node_modules/@envoymesh/envoy-harness-tui"
if [ -d "$ENVOY_HARNESS_DIR" ]; then
  require_file "$ENVOY_HARNESS_DIR/index.js" "envoy-harness main entry"
  require_file "$ENVOY_HARNESS_DIR/index.d.ts" "envoy-harness type definitions"
  require_file "$ENVOY_HARNESS_DIR/package.json" "envoy-harness package.json (flattened resource tree)"
  require_file "$ENVOY_HARNESS_DIR/cli/acp-stdio.js" "envoy-harness ACP stdio entry"
  require_dir_nonempty "$ENVOY_HARNESS_DIR" "envoy-harness staged tree"
  require_file "$ENVOY_HARNESS_ADAPTER_DIR/index.js" "envoy-harness-adapter main entry"
  require_file "$ENVOY_HARNESS_ADAPTER_DIR/package.json" "envoy-harness-adapter package.json (flattened resource tree)"
  require_dir_nonempty "$ENVOY_HARNESS_ADAPTER_DIR" "envoy-harness-adapter staged tree"
  require_file "$ENVOY_HARNESS_CLIENT_DIR/index.js" "envoy-harness-client main entry"
  require_file "$ENVOY_HARNESS_CLIENT_DIR/package.json" "envoy-harness-client package.json"
  require_file "$ENVOY_HARNESS_PEER_DIR/index.js" "envoy-harness-peer main entry"
  require_file "$ENVOY_HARNESS_PEER_DIR/package.json" "envoy-harness-peer package.json"
  require_file "$ENVOY_HARNESS_TUI_DIR/bin.js" "envoy-harness-tui bin entry (Terminal → Envoy)"
  require_file "$ENVOY_HARNESS_TUI_DIR/package.json" "envoy-harness-tui package.json"
else
  if [ "${STAGE_ENVOY_HARNESS:-}" = "0" ]; then
    warn "envoy-harness resources not bundled (STAGE_ENVOY_HARNESS=0)"
  else
    fail "envoy-harness staged tree missing at $ENVOY_HARNESS_DIR — run scripts/stage-tauri-envoy-harness-bundle.sh (or set STAGE_ENVOY_HARNESS=0 + ENVOYMESH_ALLOW_BROKEN_HARNESS_SKIP=1)"
  fi
fi

# Critical: Node resolves bare imports from resources/node/node_modules, not
# from the sibling resources/envoy-harness* trees. Without these, first launch
# crashes with ERR_MODULE_NOT_FOUND for @envoymesh/envoy-harness-adapter.
if [ "${STAGE_ENVOY_HARNESS:-}" != "0" ] || [ "${ENVOYMESH_ALLOW_BROKEN_HARNESS_SKIP:-}" != "1" ]; then
  require_file "$ENVOY_HARNESS_NODE_MOD/package.json" "envoy-harness in node_modules (runtime resolve)"
  require_file "$ENVOY_HARNESS_NODE_MOD/dist/index.js" "envoy-harness dist entry in node_modules"
  require_file "$ENVOY_HARNESS_ADAPTER_NODE_MOD/package.json" "envoy-harness-adapter in node_modules"
  require_file "$ENVOY_HARNESS_ADAPTER_NODE_MOD/dist/index.js" "envoy-harness-adapter dist entry in node_modules"
  require_file "$ENVOY_HARNESS_CLIENT_NODE_MOD/package.json" "envoy-harness-client in node_modules"
  require_file "$ENVOY_HARNESS_CLIENT_NODE_MOD/dist/index.js" "envoy-harness-client dist entry in node_modules"
  require_file "$ENVOY_HARNESS_PEER_NODE_MOD/package.json" "envoy-harness-peer in node_modules"
  require_file "$ENVOY_HARNESS_PEER_NODE_MOD/dist/index.js" "envoy-harness-peer dist entry in node_modules"
  require_file "$ENVOY_HARNESS_TUI_NODE_MOD/package.json" "envoy-harness-tui in node_modules"
  require_file "$ENVOY_HARNESS_TUI_NODE_MOD/dist/bin.js" "envoy-harness-tui bin in node_modules"
  if [ ! -d "$RES/node/node_modules/smol-toml" ]; then
    fail "smol-toml missing from resources/node/node_modules — envoy-harness config loader will fail at runtime"
  fi
  if [ ! -d "$RES/node/node_modules/@envoymesh/agent-adapter" ]; then
    fail "@envoymesh/agent-adapter missing from resources/node/node_modules — required by envoy-harness-adapter"
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

# Phase 46E Path C — home seed roster (CN+US hubs) for first boot.
ROSTER_STAGED="$RES/node/relay-roster.json"
ROSTER_ROOT="$ROOT/relay-roster.json"
ROSTER_EXAMPLE="$ROOT/docs/examples/relay-roster.example.json"
if [ -f "$ROSTER_ROOT" ] || [ -f "$ROSTER_EXAMPLE" ]; then
  if [ ! -f "$ROSTER_STAGED" ]; then
    fail "repo has relay-roster.json (or example) but it was not staged into resources/node/ — re-run stage-bundle-node-runtime.sh / stage-tauri-node-bundle.sh"
  fi
  echo "  relay-roster:  bundled in resources/node/ (Path C seed)"
elif [ -f "$ROSTER_STAGED" ]; then
  echo "  relay-roster:  present in resources/node/"
else
  warn "No relay-roster.json in resources/node/ — homes will rely on live relay HTTP only"
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

# Root-owned staged natives make codesign fail with errSecInternalComponent
# ("unable to build chain" is a red herring). Usually caused by running a
# staging step under sudo. Do NOT auto-sudo here — require an explicit fix.
# Check the whole resources/ tree (node, openclaw-envoymesh, etc.).
if [ "$(uname -s)" = "Darwin" ] && [ -d "$RES" ]; then
  root_sample="$(find "$RES" -user root 2>/dev/null | head -1 || true)"
  if [ -n "$root_sample" ]; then
    echo "error: staged Tauri resources include root-owned files — Apple codesign / re-stage will fail." >&2
    echo "  Example: $root_sample" >&2
    echo "  Fix once (never run build-desktop.sh / stage-*.sh with sudo):" >&2
    echo "    sudo chown -R \"\$(whoami):staff\" \"$RES\"" >&2
    echo "  Then re-run: ./scripts/build-desktop.sh macos" >&2
    exit 1
  fi
fi

echo "  ✓ Tauri resources look complete"
