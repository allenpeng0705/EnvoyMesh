#!/usr/bin/env bash
# Sign Mach-O binaries embedded in Tauri resources/ before notarization.
#
# Tauri codesigns EnvoyMesh.app but does not deep-sign natives under
# resources/{node,openclaw,pi}/node_modules (node-pty, sharp, fsevents, …).
# Apple notarization rejects the bundle until every nested Mach-O has a
# Developer ID signature with hardened runtime and a secure timestamp.
#
# Requires APPLE_SIGNING_IDENTITY (set by apply_apple_signing_env in build-desktop.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RESOURCES="${1:-$ROOT/apps/tauri/src-tauri/resources}"

IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
if [ -z "$IDENTITY" ]; then
  echo "sign-macos-staged-resources: APPLE_SIGNING_IDENTITY not set — skip"
  exit 0
fi

if [ ! -d "$RESOURCES" ]; then
  echo "sign-macos-staged-resources: no resources dir at $RESOURCES — skip"
  exit 0
fi

is_macho() {
  local f="$1"
  case "$(file -b "$f" 2>/dev/null || true)" in
    Mach-O*) return 0 ;;
    *) return 1 ;;
  esac
}

signed=0
failed=0

# Match likely Mach-O paths first (avoid running `file` on every staged .js file).
candidate_paths() {
  find "$RESOURCES" -depth -type f \( \
    -name '*.node' -o -name '*.dylib' -o -name 'spawn-helper' \
    -o -path '*/bin/fd' -o -path '*/bin/rg' \
  \) 2>/dev/null
}

while IFS= read -r f; do
  [ -n "$f" ] || continue
  is_macho "$f" || continue
  if codesign --force --sign "$IDENTITY" --options runtime --timestamp "$f"; then
    signed=$((signed + 1))
  else
    echo "  ✗ codesign failed: $f" >&2
    failed=$((failed + 1))
  fi
done < <(candidate_paths)

echo "  ✓ Signed ${signed} nested Mach-O file(s) under resources/"
if [ "$failed" -gt 0 ]; then
  echo "error: ${failed} nested binary(ies) failed to sign" >&2
  exit 1
fi
