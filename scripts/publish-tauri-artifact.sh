#!/bin/bash
# Publish the most recent Tauri bundle artifact to release/ with a consistent
# name:  envoymesh-desktop-{version}-{platform}-{arch}.{ext}
#
# The arch is detected from the Rust target triple in the file path
# (e.g. aarch64-apple-darwin → arm64, x86_64-pc-windows-msvc → x64).
#
# Used by `npm run tauri:build:mac` etc. after the Tauri build finishes.
# Also callable standalone:  bash scripts/publish-tauri-artifact.sh macos
#
# Produces the SAME file name as scripts/build-desktop.sh so that regardless
# of which build command you use, the output in release/ is always consistent:
#   release/envoymesh-desktop-0.1.0-macos-arm64.dmg
#   release/envoymesh-desktop-0.1.0-windows-x64.exe
set -euo pipefail

PLATFORM="${1:?usage: publish-tauri-artifact.sh <macos|windows|linux>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('${ROOT}/package.json').version" 2>/dev/null || echo dev)"
TAURI_TARGET_ROOT="${ROOT}/apps/tauri/src-tauri/target"
OUT_DIR="${ROOT}/release"

case "$PLATFORM" in
  mac|macos)
    PATTERN="*/release/bundle/dmg/*.dmg"
    EXT="dmg"
    PLATFORM="macos"
    ;;
  win|windows)
    PATTERN="*/release/bundle/nsis/*.exe"
    EXT="exe"
    PLATFORM="windows"
    ;;
  linux)
    PATTERN="*/release/bundle/deb/*.deb"
    EXT="deb"
    ;;
  *)
    echo "error: unknown platform '$PLATFORM' (use macos|windows|linux)" >&2
    exit 1
    ;;
esac

# Find the newest matching artifact
ARTIFACT=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if [ -z "$ARTIFACT" ] || [ "$f" -nt "$ARTIFACT" ]; then
    ARTIFACT="$f"
  fi
done < <(find "$TAURI_TARGET_ROOT" -path "$PATTERN" -type f 2>/dev/null)

if [ -z "$ARTIFACT" ]; then
  echo "error: no $EXT artifact found under $TAURI_TARGET_ROOT" >&2
  exit 1
fi

# Detect arch from the Rust target triple in the file path.
# Examples: aarch64-apple-darwin, x86_64-pc-windows-msvc, x86_64-unknown-linux-gnu
ARCH="unknown"
case "$ARTIFACT" in
  *aarch64-apple-darwin*|*aarch64-unknown-linux*) ARCH="arm64" ;;
  *x86_64-apple-darwin*|*x86_64-unknown-linux*|*x86_64-pc-windows*) ARCH="x64" ;;
  *aarch64-pc-windows*) ARCH="arm64" ;;
  *universal-apple-darwin*) ARCH="universal" ;;
esac

BASE="envoymesh-desktop-${VERSION}-${PLATFORM}-${ARCH}"
mkdir -p "$OUT_DIR"
DEST="$OUT_DIR/${BASE}.${EXT}"

cp -f "$ARTIFACT" "$DEST"
echo "✓ Published $DEST ($(du -h "$DEST" | awk '{print $1}'))"
