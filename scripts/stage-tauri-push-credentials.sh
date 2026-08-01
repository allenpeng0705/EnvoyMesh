#!/usr/bin/env bash
# Stage push-notification credentials into the Tauri node bundle dir.
#
# Copies from the repo root (gitignored secrets kept only on the packager's machine):
#   push-config.json
#   AuthKey_*.p8  (or whatever apns.keyPath names)
#   serviceAccountKey.json (or whatever fcm.serviceAccountJsonPath names)
#
# Destination: apps/tauri/src-tauri/resources/node/
# At runtime Tauri sets ENVOYMESH_NODE_BUNDLE_DIR to that directory, and
# apps/node/src/push-notification.ts loads push-config.json from there and
# resolves relative keyPath / serviceAccountJsonPath against the same dir.
#
# Must run AFTER scripts/stage-tauri-node-bundle.sh (which rm -rf's the dest).
#
# Behaviour:
#   - Missing push-config.json → warn and skip (CI / builds without push still work)
#   - push-config present but a referenced secret missing → fail if
#     REQUIRE_PUSH_CREDENTIALS=1 (build-desktop.sh/ps1 default), else warn.
#     Expected repo-root files (names from push-config.json):
#       AuthKey_LKPCR48WHW.p8  (apns.keyPath)
#       serviceAccountKey.json (fcm.serviceAccountJsonPath)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/apps/tauri/src-tauri/resources/node"
CONFIG_SRC="$ROOT/push-config.json"
REQUIRE="${REQUIRE_PUSH_CREDENTIALS:-0}"

warn() { echo "  ⚠ $*" >&2; }
fail() { echo "error: $*" >&2; exit 1; }
ok() { echo "  ✓ $*"; }

if [ ! -d "$DEST" ]; then
  fail "node bundle dir missing at $DEST — run stage-tauri-node-bundle.sh first"
fi

if [ ! -f "$CONFIG_SRC" ]; then
  warn "No push-config.json at repo root — skipping push credential staging."
  warn "Drop push-config.json + AuthKey_*.p8 + serviceAccountKey.json at the repo root, then re-run."
  exit 0
fi

# Read relative filenames from push-config (fallback to known defaults).
read_cfg() {
  node -e "
    const fs = require('fs');
    const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const keyPath = (c.apns && c.apns.keyPath) || 'AuthKey_LKPCR48WHW.p8';
    const saPath = (c.fcm && c.fcm.serviceAccountJsonPath) || 'serviceAccountKey.json';
    process.stdout.write(JSON.stringify({ keyPath, saPath }));
  " "$CONFIG_SRC"
}

CFG_JSON="$(read_cfg)"
KEY_REL="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.keyPath)" "$CFG_JSON")"
SA_REL="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.saPath)" "$CFG_JSON")"

# Only allow basename staging (never copy absolute paths into the bundle).
key_base="$(basename "$KEY_REL")"
sa_base="$(basename "$SA_REL")"

KEY_SRC="$ROOT/$key_base"
SA_SRC="$ROOT/$sa_base"
# Older packager layouts used firebase-service-account.json; copy under the
# basename named in push-config.json so relative path resolution still works.
if [ ! -f "$SA_SRC" ] && [ -f "$ROOT/firebase-service-account.json" ]; then
  SA_SRC="$ROOT/firebase-service-account.json"
fi

missing=0
copy_one() {
  local src="$1"
  local dest_name="$2"
  local label="$3"
  if [ ! -f "$src" ]; then
    warn "Missing $label at $src"
    missing=1
    return
  fi
  cp -f "$src" "$DEST/$dest_name"
  chmod 600 "$DEST/$dest_name" 2>/dev/null || true
  ok "Staged $dest_name → resources/node/"
}

echo "Staging push credentials into resources/node/..."
cp -f "$CONFIG_SRC" "$DEST/push-config.json"
ok "Staged push-config.json → resources/node/"
copy_one "$KEY_SRC" "$key_base" "APNs AuthKey (.p8)"
copy_one "$SA_SRC" "$sa_base" "FCM service account JSON"

if [ "$missing" = "1" ]; then
  msg="push-config.json references secrets that are not at the repo root"
  if [ "$REQUIRE" = "1" ]; then
    fail "$msg (REQUIRE_PUSH_CREDENTIALS=1)"
  fi
  warn "$msg — packaged app will not send push until they are present."
  warn "Expected: $KEY_SRC and $SA_SRC"
  exit 0
fi

ok "Push credentials staged (APNs + FCM) for macOS/Windows/Linux desktop bundles"
