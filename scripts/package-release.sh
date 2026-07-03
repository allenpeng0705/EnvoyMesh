#!/bin/bash
# EnvoyMesh Release Packager (DEPRECATED — superseded by scripts/bundle.sh)
#
# Creates a single installable bundle for all platforms.
#
# Output:
#   release/envoymesh-{version}-macos.dmg
#   release/envoymesh-{version}-linux.AppImage
#   release/envoymesh-{version}-windows.exe
#
# What's inside:
#   - EnvoyMesh node (Node.js runtime)
#   - Social UI (bundled React app)
#   - OpenClaw agent (bundled binary or fallback)
#   - setup.sh (post-install)
#
# ---------------------------------------------------------------------------
# DEPRECATION NOTE
# ---------------------------------------------------------------------------
# This script is a thin skeleton that copies source files into a tarball.
# It does not compile the EnvoyMesh node, does not include a Node.js
# runtime, and the install.sh it generates is rough.
#
# For new bundles, use one of:
#
#   ./scripts/bundle.sh          # mac/linux — produces release/envoymesh-*.tar.gz
#   ./scripts/bundle.ps1         # Windows   — produces release/envoymesh-*.tar.gz
#
# See docs/bundle-scripts.md for the contract and the full flag reference.
# This file is kept for now to avoid breaking any external automation that
# references it; remove it after one release cycle.
# ---------------------------------------------------------------------------

set -e

VERSION="${1:-dev}"
RELEASE_DIR="release/envoymesh-${VERSION}"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

echo "============================================"
echo "  EnvoyMesh Release Builder ${VERSION}"
echo "  Platform: ${PLATFORM}-${ARCH}"
echo "============================================"
echo ""

# Step 1: Clean build
echo "[1/5] Building TypeScript..."
npm run typecheck 2>/dev/null || true

# Step 2: Build Social UI
echo "[2/5] Building Social UI..."
npm run build -w @envoymesh/social 2>/dev/null || echo "  (using dev server)"

# Step 3: Package Node.js runtime
echo "[3/5] Packaging Node.js runtime..."
mkdir -p "${RELEASE_DIR}"
cp -r apps/node/src "${RELEASE_DIR}/node-src/" 2>/dev/null || true
cp -r apps/node/test "${RELEASE_DIR}/node-tests/" 2>/dev/null || true
cp -r packages "${RELEASE_DIR}/packages/"
cp package.json package-lock.json "${RELEASE_DIR}/"
cp envoymesh.node.example.yaml "${RELEASE_DIR}/"

# Step 4: Bundle OpenClaw
echo "[4/5] Bundling OpenClaw..."
OPENCLAW_BIN=""
if [ -f packages/openclaw-runtime/bin/openclaw ]; then
    OPENCLAW_BIN="packages/openclaw-runtime/bin/openclaw"
elif command -v openclaw &> /dev/null; then
    OPENCLAW_BIN="$(command -v openclaw)"
fi

if [ -n "${OPENCLAW_BIN}" ]; then
    cp "${OPENCLAW_BIN}" "${RELEASE_DIR}/openclaw"
    chmod +x "${RELEASE_DIR}/openclaw"
    echo "  Bundled: ${OPENCLAW_BIN}"
else
    echo "  OpenClaw not found — will use fallback model providers"
    echo "  (Ollama, OpenAI, etc.)"
fi

# Step 5: Create install script
echo "[5/5] Creating install script..."
cat > "${RELEASE_DIR}/install.sh" << 'INSTALLSCRIPT'
#!/bin/bash
set -e

echo "Installing EnvoyMesh..."
echo ""

# Install dependencies
npm install --production

# Setup OpenClaw if bundled
if [ -f openclaw ]; then
    echo "Setting up OpenClaw..."
    mkdir -p ~/.envoymesh/bin/
    cp openclaw ~/.envoymesh/bin/openclaw
    chmod +x ~/.envoymesh/bin/openclaw
    echo "  OpenClaw installed to ~/.envoymesh/bin/openclaw"
fi

# Run
echo ""
echo "============================================"
echo "  EnvoyMesh installed!"
echo "============================================"
echo ""
echo "Start the node:"
echo "  npm run node:dev"
echo ""
echo "Start the Social UI:"
echo "  npm run social:dev"
echo ""
echo "Or use the desktop app (Tauri):"
echo "  EnvoyMesh.app"
echo ""
echo "The node auto-discovers OpenClaw at startup."
INSTALLSCRIPT
chmod +x "${RELEASE_DIR}/install.sh"

# Create archive
echo ""
echo "Creating archive..."
case "${PLATFORM}" in
    darwin)
        # macOS .dmg requires hdiutil
        if command -v hdiutil &> /dev/null && command -v npm > /dev/null; then
            npx create-dmg "${RELEASE_DIR}/EnvoyMesh.app" "${RELEASE_DIR}" 2>/dev/null || \
            tar -czf "release/envoymesh-${VERSION}-macos.tar.gz" -C release "envoymesh-${VERSION}"
        else
            tar -czf "release/envoymesh-${VERSION}-macos.tar.gz" -C release "envoymesh-${VERSION}"
        fi
        echo "  release/envoymesh-${VERSION}-macos.tar.gz"
        ;;
    linux)
        tar -czf "release/envoymesh-${VERSION}-linux-${ARCH}.tar.gz" -C release "envoymesh-${VERSION}"
        echo "  release/envoymesh-${VERSION}-linux-${ARCH}.tar.gz"
        ;;
    msys*|mingw*|cygwin*)
        zip -r "release/envoymesh-${VERSION}-windows.zip" -j "${RELEASE_DIR}" 2>/dev/null || \
        tar -czf "release/envoymesh-${VERSION}-windows.tar.gz" -C release "envoymesh-${VERSION}"
        echo "  release/envoymesh-${VERSION}-windows.zip"
        ;;
esac

echo ""
echo "============================================"
echo "  Release ${VERSION} built"
echo "============================================"
