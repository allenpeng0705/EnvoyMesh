#!/bin/bash
# EnvoyMesh + OpenClaw unified installer
# Installs OpenClaw alongside EnvoyMesh using the best available method.
#
# Usage: ./scripts/install-openclaw.sh
#
# Detection order:
#   1. npm: npm install @openclaw/core
#   2. binary: download from GitHub releases
#   3. source: git clone + npm install + npm run build

set -e

BIN_DIR="packages/openclaw-runtime/bin"
OPENCLAW_REPO="https://github.com/openclaw/openclaw.git"
SOURCE_DIR="packages/openclaw"

echo "=== EnvoyMesh + OpenClaw Installer ==="
echo ""

# Method 1: Try npm
echo "[1/3] Trying npm package @openclaw/core..."
if npm install @openclaw/core --save-optional 2>/dev/null; then
    echo "  ✓ @openclaw/core installed via npm"
    echo ""
    echo "OpenClaw is ready. Start EnvoyMesh normally:"
    echo "  npm run node:dev"
    exit 0
fi
echo "  - @openclaw/core not available on npm (open source — needs local install)"

# Method 2: Download binary
echo ""
echo "[2/3] Downloading OpenClaw binary..."
mkdir -p "$BIN_DIR"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "  ! Unsupported architecture: $ARCH"; ARCH="unsupported" ;;
esac

if [ "$ARCH" != "unsupported" ]; then
    BINARY_URL="https://github.com/openclaw/openclaw/releases/latest/download/openclaw-${OS}-${ARCH}"
    echo "  Downloading: $BINARY_URL"
    if curl -fsSL "$BINARY_URL" -o "$BIN_DIR/openclaw" 2>/dev/null; then
        chmod +x "$BIN_DIR/openclaw"
        echo "  ✓ Binary installed to $BIN_DIR/openclaw"
        echo ""
        echo "OpenClaw is ready. Start EnvoyMesh normally:"
        echo "  npm run node:dev"
        exit 0
    fi
    echo "  - Binary not found at $BINARY_URL"
fi

# Method 3: Clone and build from source
echo ""
echo "[3/3] Building OpenClaw from source..."
if [ ! -d "$SOURCE_DIR" ]; then
    echo "  Cloning $OPENCLAW_REPO..."
    git clone --depth 1 "$OPENCLAW_REPO" "$SOURCE_DIR"
fi

cd "$SOURCE_DIR"
echo "  Installing dependencies..."
npm install --production
echo "  Building..."
npm run build
cd ../..

# Symlink the built binary
if [ -f "$SOURCE_DIR/bin/openclaw" ]; then
    ln -sf "../../openclaw/bin/openclaw" "$BIN_DIR/openclaw"
    echo "  ✓ OpenClaw built and linked to $BIN_DIR/openclaw"
else
    echo "  ! Build succeeded but no binary found at $SOURCE_DIR/bin/openclaw"
    echo "  ! Check the OpenClaw build output for the correct entry point."
    exit 1
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "OpenClaw is ready. Start EnvoyMesh normally:"
echo "  npm run node:dev"
echo ""
echo "To verify: $BIN_DIR/openclaw --version"
