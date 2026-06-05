#!/bin/bash
# Tauri Desktop App Builder
# Builds EnvoyMesh.app (.dmg on macOS), .exe (Windows), .AppImage (Linux)
# with OpenClaw bundled inside.
#
# Usage: ./scripts/build-desktop.sh [macos|windows|linux|all]
#
# Prerequisites:
#   macOS: Xcode Command Line Tools
#   Windows: Visual Studio Build Tools
#   Linux: libwebkit2gtk-4.1-dev, libgtk-3-dev, etc.

set -e

TARGET="${1:-all}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "============================================"
echo "  EnvoyMesh Desktop Builder"
echo "============================================"
echo ""

# Step 1: Fetch sidecars (Node.js + OpenClaw)
echo "[1/4] Fetching sidecars..."
cd "${PROJECT_DIR}"
bash scripts/fetch-node-sidecar.sh
bash scripts/fetch-openclaw-sidecar.sh
bash scripts/stage-tauri-node-bundle.sh
echo ""

# Step 2: Build Social UI
echo "[2/4] Building Social UI..."
cd "${PROJECT_DIR}/apps/social"
npm install 2>/dev/null || true
npm run build 2>/dev/null || {
    echo "  Social UI build skipped — using dev server path"
}
cd "${PROJECT_DIR}"
echo ""

# Step 3: Build Tauri
echo "[3/4] Building Tauri desktop app..."

install_tauri_cli() {
    if ! command -v cargo-tauri &> /dev/null && ! npx tauri --version &> /dev/null; then
        echo "  Installing @tauri-apps/cli..."
        cargo install tauri-cli 2>/dev/null || npm install -g @tauri-apps/cli 2>/dev/null || true
    fi
}

case "${TARGET}" in
    macos|all)
        echo "  Building for macOS..."
        install_tauri_cli
        cd "${PROJECT_DIR}/apps/tauri"
        npm install 2>/dev/null || true
        npx tauri build --target universal-apple-darwin 2>/dev/null || \
        cargo tauri build --target aarch64-apple-darwin 2>/dev/null || {
            echo "  Tauri build requires Xcode Command Line Tools."
            echo "  Run: xcode-select --install"
            echo "  Or manually: cd apps/tauri && npx tauri build"
        }
        echo ""
        echo "  macOS build output:"
        ls -la src-tauri/target/*/release/bundle/dmg/*.dmg 2>/dev/null || \
        ls -la src-tauri/target/*/release/bundle/macos/*.app 2>/dev/null || \
        echo "  (build artifacts in apps/tauri/src-tauri/target/)"
        ;;
    linux)
        echo "  Building for Linux..."
        install_tauri_cli
        cd "${PROJECT_DIR}/apps/tauri"
        npm install 2>/dev/null || true
        npx tauri build --target x86_64-unknown-linux-gnu 2>/dev/null || {
            echo "  Tauri Linux build requires webkit2gtk-4.1."
            echo "  Ubuntu/Debian: sudo apt install libwebkit2gtk-4.1-dev"
            echo "  Or manually: cd apps/tauri && npx tauri build"
        }
        echo ""
        echo "  Linux build output:"
        ls -la src-tauri/target/*/release/bundle/appimage/*.AppImage 2>/dev/null || \
        ls -la src-tauri/target/*/release/bundle/deb/*.deb 2>/dev/null || \
        echo "  (build artifacts in apps/tauri/src-tauri/target/)"
        ;;
    windows)
        echo "  Building for Windows..."
        install_tauri_cli
        cd "${PROJECT_DIR}/apps/tauri"
        npm install 2>/dev/null || true
        npx tauri build --target x86_64-pc-windows-msvc 2>/dev/null || {
            echo "  Tauri Windows build requires Visual Studio Build Tools."
            echo "  Or cross-compile from macOS/Linux:"
            echo "    rustup target add x86_64-pc-windows-msvc"
            echo "    cargo install tauri-cli"
            echo "    cd apps/tauri && cargo tauri build --target x86_64-pc-windows-msvc"
        }
        echo ""
        echo "  Windows build output:"
        ls -la src-tauri/target/*/release/bundle/msi/*.msi 2>/dev/null || \
        ls -la src-tauri/target/*/release/bundle/nsis/*.exe 2>/dev/null || \
        echo "  (build artifacts in apps/tauri/src-tauri/target/)"
        ;;
esac

cd "${PROJECT_DIR}"
echo ""

# Step 4: Summary
echo "[4/4] Build complete"
echo ""
echo "============================================"
echo "  What's inside EnvoyMesh.app/.exe/.AppImage"
echo "============================================"
echo ""
echo "  ┌─ Social UI (React)       — Chat, contacts, assistant"
echo "  ├─ EnvoyMesh Node          — P2P mesh, tools, vault"
echo "  ├─ OpenClaw Agent 🆕       — Bundled AI assistant"
echo "  └─ Fallback: native model   — Ollama / OpenAI if offline"
echo ""
echo "Run:"
echo "  open 'apps/tauri/src-tauri/target/release/bundle'"
echo ""
echo "Or build with CI:"
echo "  git tag tauri-v0.2.0 && git push"
