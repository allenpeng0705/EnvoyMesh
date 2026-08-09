#!/bin/bash
# EnvoyMesh OpenClaw bootstrap
#
# Prepares the bundled packages/openclaw for in-process gateway spawn.
# Full pnpm install + build runs in setup.sh step 4.
#
# Usage:
#   ./scripts/install-openclaw.sh
#   ./scripts/install-openclaw.sh --local /path/to/openclaw   # optional external copy

set -e

LOCAL_PATH=""
if [ "$1" = "--local" ] && [ -n "$2" ]; then
  LOCAL_PATH="$2"
fi

BIN_DIR="packages/openclaw-runtime/bin"
SOURCE_DIR="packages/openclaw"
OPENCLAW_REPO="https://github.com/openclaw/openclaw.git"
ORIG_DIR="$(pwd)"

write_runtime_wrapper() {
  mkdir -p "$BIN_DIR"
  cat > "$BIN_DIR/openclaw" << 'RUNNER'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/../../openclaw"
exec pnpm exec tsx openclaw.mjs "$@"
RUNNER
  chmod +x "$BIN_DIR/openclaw"
}

echo "=== EnvoyMesh OpenClaw Bootstrap ==="
echo ""

# ---- Preferred: bundled monorepo (packages/openclaw) ----
if [ -f "$SOURCE_DIR/openclaw.mjs" ] || [ -f "$SOURCE_DIR/package.json" ]; then
  echo "[1/2] Bundled OpenClaw found at $SOURCE_DIR"
  write_runtime_wrapper
  # Do NOT write a stub dist/entry.js here — EnvoyAI requires a real
  # compiled dist (dist/config/config.js). setup.sh step 4 builds it.
  if [ ! -f "$SOURCE_DIR/dist/config/config.js" ]; then
    echo "  ⚠ dist/ not built yet — setup.sh will pnpm install + build"
  fi
  echo "  ✓ Runtime wrapper: $BIN_DIR/openclaw"
  echo "  ✓ setup.sh will pnpm install + build the gateway"
  echo ""
  echo "[2/2] ClawHub CLI (skill marketplace)..."
  if npm install -g clawhub@latest 2>/dev/null; then
    echo "  ✓ ClawHub installed — run: clawhub login"
  else
    echo "  ⚠ ClawHub optional — install later: npm i -g clawhub"
  fi
  echo ""
  echo "OpenClaw bootstrap complete. Continue with: ./scripts/setup.sh"
  exit 0
fi

# ---- --local copy into packages/openclaw ----
if [ -n "$LOCAL_PATH" ]; then
  echo "[1/3] Copying OpenClaw from --local $LOCAL_PATH"
  if [ -d "$LOCAL_PATH" ]; then
    rm -rf "$SOURCE_DIR"
    mkdir -p "$(dirname "$SOURCE_DIR")"
    cp -R "$LOCAL_PATH" "$SOURCE_DIR"
    write_runtime_wrapper
    echo "  ✓ Copied to $SOURCE_DIR"
    echo "  ⚠ Run ./scripts/setup.sh to build OpenClaw (needs dist/config/config.js)"
    exit 0
  fi
  echo "  ✗ Path not found: $LOCAL_PATH"
  exit 1
fi

# ---- PATH binary (standalone CLI, not used for bundled gateway) ----
echo "[1/4] Checking OpenClaw on PATH..."
if command -v openclaw &> /dev/null; then
  echo "  ✓ openclaw on PATH at $(command -v openclaw)"
  echo "  Note: EnvoyMesh spawns gateway from packages/openclaw — clone it for full integration."
fi

# ---- Clone source if missing ----
echo "[2/4] Cloning OpenClaw source..."
if [ ! -d "$SOURCE_DIR" ]; then
  if ! git clone --depth 1 "$OPENCLAW_REPO" "$SOURCE_DIR" 2>/dev/null; then
    echo "  ✗ Could not clone $OPENCLAW_REPO"
    echo ""
    echo "  Try:"
    echo "    git clone --depth 1 $OPENCLAW_REPO packages/openclaw"
    echo "    ./scripts/install-openclaw.sh --local /path/to/openclaw"
    exit 1
  fi
  echo "  ✓ Cloned to $SOURCE_DIR"
else
  echo "  ✓ $SOURCE_DIR already exists"
fi

write_runtime_wrapper

# ---- Optional binary fallback (legacy) ----
echo "[3/4] Optional binary download..."
mkdir -p "$BIN_DIR"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) ARCH="unsupported" ;;
esac
if [ "$ARCH" != "unsupported" ]; then
  BINARY_URL="https://github.com/openclaw/openclaw/releases/latest/download/openclaw-${OS}-${ARCH}"
  if curl -fsSL "$BINARY_URL" -o "$BIN_DIR/openclaw-standalone" 2>/dev/null; then
    chmod +x "$BIN_DIR/openclaw-standalone"
    echo "  ✓ Standalone binary at $BIN_DIR/openclaw-standalone (EnvoyMesh uses pnpm wrapper instead)"
  fi
fi

echo "[4/4] ClawHub CLI..."
if npm install -g clawhub@latest 2>/dev/null; then
  echo "  ✓ ClawHub installed"
else
  echo "  ⚠ ClawHub optional"
fi

echo ""
echo "=== Bootstrap Complete ==="
echo "Run ./scripts/setup.sh to install deps, copy the envoymesh extension, and build OpenClaw."
