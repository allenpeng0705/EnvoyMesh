#!/usr/bin/env bash
# Download Node.js runtime binary into apps/tauri/src-tauri/resources/node-runtime/.
# Usage: ./scripts/fetch-node-sidecar.sh [version]
set -euo pipefail

VERSION="${1:-22.13.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/apps/tauri/src-tauri/resources/node-runtime"
mkdir -p "$DEST"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac
case "$OS" in
  darwin) PLATFORM="darwin" ;;
  linux) PLATFORM="linux" ;;
  mingw*|msys*|cygwin*) PLATFORM="win" ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ "$PLATFORM" = "win" ]; then
  ARCHIVE="node-v${VERSION}-win-${ARCH}.zip"
  URL="https://nodejs.org/dist/v${VERSION}/${ARCHIVE}"
  echo "Fetching $URL"
  curl -fsSL "$URL" -o "$TMP/node.zip"
  unzip -q "$TMP/node.zip" -d "$TMP"
  install -m 755 "$TMP/node-v${VERSION}-win-${ARCH}/node.exe" "$DEST/node.exe"
  echo "Installed $DEST/node.exe ($("$DEST/node.exe" --version))"
  exit 0
fi

TARBALL="node-v${VERSION}-${PLATFORM}-${ARCH}.tar.gz"
URL="https://nodejs.org/dist/v${VERSION}/${TARBALL}"
echo "Fetching $URL"
curl -fsSL "$URL" -o "$TMP/node.tgz"
tar -xzf "$TMP/node.tgz" -C "$TMP"

install -m 755 "$TMP/node-v${VERSION}-${PLATFORM}-${ARCH}/bin/node" "$DEST/node"
echo "Installed $DEST/node ($("$DEST/node" --version))"
