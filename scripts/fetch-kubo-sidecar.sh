#!/usr/bin/env bash
# Download Kubo sidecar binary into apps/tauri/src-tauri/resources/kubo/.
# That path is what tauri.conf.full.json bundles (resources/kubo/**/* relative
# to src-tauri/). The legacy apps/tauri/resources/kubo/ tree is only a README
# pointer for older docs — do not stage binaries there.
# Usage: ./scripts/fetch-kubo-sidecar.sh [version]
set -euo pipefail

VERSION="${1:-0.32.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/apps/tauri/src-tauri/resources/kubo"
mkdir -p "$DEST"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac
case "$OS" in
  darwin) PLATFORM="darwin" ;;
  linux) PLATFORM="linux" ;;
  mingw*|msys*|cygwin*) PLATFORM="windows" ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

TARBALL="kubo_v${VERSION}_${PLATFORM}-${ARCH}.tar.gz"
URL="https://dist.ipfs.tech/kubo/v${VERSION}/${TARBALL}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ "$PLATFORM" = "windows" ]; then
  ARCHIVE="kubo_v${VERSION}_windows-${ARCH}.zip"
  URL="https://dist.ipfs.tech/kubo/v${VERSION}/${ARCHIVE}"
  echo "Fetching $URL"
  curl -fsSL "$URL" -o "$TMP/kubo.zip"
  unzip -q "$TMP/kubo.zip" -d "$TMP"
  install -m 755 "$TMP/kubo/ipfs.exe" "$DEST/ipfs.exe"
  echo "Installed $DEST/ipfs.exe ($( "$DEST/ipfs.exe" version -n ))"
  exit 0
fi

echo "Fetching $URL"
curl -fsSL "$URL" -o "$TMP/kubo.tgz"
tar -xzf "$TMP/kubo.tgz" -C "$TMP"

install -m 755 "$TMP/kubo/ipfs" "$DEST/ipfs"
echo "Installed $DEST/ipfs ($( "$DEST/ipfs" version -n ))"
