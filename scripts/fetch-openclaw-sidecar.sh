#!/bin/bash
# Fetch OpenClaw binary for the target platform.
# Called during Tauri build to bundle OpenClaw inside the app.
#
# Usage: bash scripts/fetch-openclaw-sidecar.sh [version]
#   version: OpenClaw version to fetch (default: latest)
#
# Downloads OpenClaw binary to apps/tauri/src-tauri/resources/openclaw/

set -e

VERSION="${1:-latest}"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

# Map to OpenClaw release naming
case "${PLATFORM}" in
    darwin)  OPENCLAW_PLATFORM="macos" ;;
    linux)   OPENCLAW_PLATFORM="linux" ;;
    msys*|mingw*|cygwin*) OPENCLAW_PLATFORM="windows" ;;
    *)       echo "Unsupported platform: ${PLATFORM}"; exit 1 ;;
esac

case "${ARCH}" in
    x86_64|amd64)  OPENCLAW_ARCH="x64" ;;
    arm64|aarch64) OPENCLAW_ARCH="arm64" ;;
    *)             echo "Unsupported architecture: ${ARCH}"; exit 1 ;;
esac

OUTPUT_DIR="apps/tauri/src-tauri/resources/openclaw"
mkdir -p "${OUTPUT_DIR}"

OPENCLAW_FILENAME="openclaw-${OPENCLAW_PLATFORM}-${OPENCLAW_ARCH}"
if [ "${OPENCLAW_PLATFORM}" = "windows" ]; then
    OPENCLAW_FILENAME="${OPENCLAW_FILENAME}.exe"
fi

DOWNLOAD_URL="https://github.com/envoymesh/openclaw/releases/${VERSION}/download/${OPENCLAW_FILENAME}"

echo "Downloading OpenClaw ${VERSION} for ${OPENCLAW_PLATFORM}-${OPENCLAW_ARCH}..."
echo "  ${DOWNLOAD_URL}"

# Try GitHub releases first, fall back to local builds
if command -v curl &> /dev/null; then
    curl -fsSL "${DOWNLOAD_URL}" -o "${OUTPUT_DIR}/openclaw" 2>/dev/null || {
        echo "  GitHub release not found — checking local install..."
        # Fallback: use locally installed openclaw
        if command -v openclaw &> /dev/null; then
            cp "$(command -v openclaw)" "${OUTPUT_DIR}/openclaw"
            echo "  Bundled local openclaw"
        elif [ -f packages/openclaw-runtime/bin/openclaw ]; then
            cp packages/openclaw-runtime/bin/openclaw "${OUTPUT_DIR}/openclaw"
            echo "  Bundled from packages/openclaw-runtime/bin/"
        else
            echo "  OpenClaw not available — skipping bundle"
            echo "  App will use fallback model providers instead"
            exit 0
        fi
    }
elif command -v wget &> /dev/null; then
    wget -q "${DOWNLOAD_URL}" -O "${OUTPUT_DIR}/openclaw" 2>/dev/null || {
        echo "  Download failed — skipping OpenClaw bundle"
        exit 0
    }
else
    echo "  No curl or wget available — skipping OpenClaw bundle"
    exit 0
fi

chmod +x "${OUTPUT_DIR}/openclaw"
echo "  OpenClaw bundled at ${OUTPUT_DIR}/openclaw"
