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
# Apple's timestamp.apple.com flakes often ("The timestamp service is not available").
# Notarization still needs --timestamp, so retry with backoff instead of failing the build.
MAX_ATTEMPTS="${CODESIGN_TIMESTAMP_RETRIES:-5}"
RETRY_SLEEP_SEC="${CODESIGN_TIMESTAMP_RETRY_SLEEP:-3}"

# Match likely Mach-O paths first (avoid running `file` on every staged .js file).
candidate_paths() {
  find "$RESOURCES" -depth -type f \( \
    -name '*.node' -o -name '*.dylib' -o -name 'spawn-helper' \
    -o -path '*/bin/fd' -o -path '*/bin/rg' \
  \) 2>/dev/null
}

sign_one() {
  local f="$1"
  local attempt=1
  local err=""
  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    # Capture stderr: success still prints "replacing existing signature"
    if err=$(codesign --force --sign "$IDENTITY" --options runtime --timestamp "$f" 2>&1); then
      return 0
    fi
    case "$err" in
      *"timestamp service is not available"*|*"timestamp server"*|*"unable to contact"*)
        echo "  ↻ timestamp unavailable (attempt ${attempt}/${MAX_ATTEMPTS}): $(basename "$f")" >&2
        sleep $((RETRY_SLEEP_SEC * attempt))
        attempt=$((attempt + 1))
        ;;
      *)
        printf '%s\n' "$err" >&2
        return 1
        ;;
    esac
  done
  printf '%s\n' "$err" >&2
  return 1
}

while IFS= read -r f; do
  [ -n "$f" ] || continue
  is_macho "$f" || continue
  if sign_one "$f"; then
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
