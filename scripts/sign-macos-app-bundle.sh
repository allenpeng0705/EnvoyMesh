#!/usr/bin/env bash
# Deep-sign EnvoyMesh.app with Developer ID + hardened runtime (timestamp retry/fallback).
#
# Used when Tauri bundling is run unsigned (TAURI_DEFER_APP_SIGN=1) so we can survive
# Apple timestamp.apple.com outages the same way as sign-macos-staged-resources.sh.
#
# Usage: APPLE_SIGNING_IDENTITY="Developer ID …" bash scripts/sign-macos-app-bundle.sh /path/EnvoyMesh.app
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=codesign-macos-lib.sh
source "${SCRIPT_DIR}/codesign-macos-lib.sh"

APP="${1:-}"
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "usage: sign-macos-app-bundle.sh /path/to/EnvoyMesh.app" >&2
  exit 1
fi

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "sign-macos-app-bundle: APPLE_SIGNING_IDENTITY not set — skip" >&2
  exit 1
fi

codesign_macos_init
codesign_macos_unlock_keychain

ENTITLEMENTS="${APP}/Contents/Entitlements.plist"
if [ -f "$ENTITLEMENTS" ]; then
  export CODESIGN_ENTITLEMENTS="$ENTITLEMENTS"
fi

echo "  Signing Mach-O inside $(basename "$APP") (inner → outer)…"

# Inner binaries first (depth-first). Skip the bundle root until last.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ "$f" = "$APP" ] && continue
  codesign_macos_is_macho "$f" || continue
  codesign_macos_sign_file "$f" || true
done < <(find "$APP" -depth -type f -print 2>/dev/null)

echo "  Signing app bundle container…"
codesign_macos_sign_bundle_container "$APP"

codesign_macos_print_summary "Mach-O + app bundle" || exit 1

echo "  Verifying signature…"
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | tail -3
