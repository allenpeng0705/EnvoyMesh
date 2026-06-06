#!/usr/bin/env bash
# Stage OpenClaw gateway + envoymesh extension for Tauri desktop bundles.
#
# Preferred: build packages/openclaw and copy the full tree to
#   apps/tauri/src-tauri/resources/openclaw/
# Fallback: fetch-openclaw-sidecar.sh (standalone binary only — no envoymesh extension).
#
# Usage: bash scripts/stage-tauri-openclaw-bundle.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/packages/openclaw"
DEST="$ROOT/apps/tauri/src-tauri/resources/openclaw"

stage_from_source() {
  echo "Staging OpenClaw from $SOURCE → $DEST"

  if [ ! -f "$SOURCE/package.json" ] && [ ! -f "$SOURCE/openclaw.mjs" ]; then
    echo "  packages/openclaw missing — running install-openclaw.sh..."
    bash "$ROOT/scripts/install-openclaw.sh"
  fi

  if [ ! -f "$SOURCE/package.json" ] && [ ! -f "$SOURCE/openclaw.mjs" ]; then
    echo "  ✗ OpenClaw source not available after bootstrap" >&2
    return 1
  fi

  if [ -d "$ROOT/OpenClawExtension" ]; then
    echo "  Copying EnvoyMesh channel extension..."
    mkdir -p "$SOURCE/extensions"
    rm -rf "$SOURCE/extensions/envoymesh"
    cp -R "$ROOT/OpenClawExtension" "$SOURCE/extensions/envoymesh"
    rm -rf "$SOURCE/extensions/envoymesh/node_modules"
  fi

  if [ -f "$SOURCE/package.json" ]; then
    echo "  Building OpenClaw (pnpm install + build)..."
    cd "$SOURCE"
    if ! command -v pnpm >/dev/null 2>&1; then
      echo "  Installing pnpm..."
      npm install -g pnpm@9 2>/dev/null || corepack enable 2>/dev/null || true
    fi
    CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -8
    CI=true pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts 2>&1 | tail -3 || true
    CI=true pnpm run build 2>&1 | tail -8 || {
      echo "  ⚠ Full build failed — writing dist/entry.js bootstrap"
      mkdir -p dist
      cat > dist/entry.js << 'STUB'
export * from "../src/cli/run-main.ts";
STUB
    }
    cd "$ROOT"
  fi

  rm -rf "$DEST"
  mkdir -p "$DEST"
  rsync -a \
    --exclude .git \
    --exclude .turbo \
    --exclude target \
    "$SOURCE/" "$DEST/"

  if [ ! -f "$DEST/openclaw.mjs" ] && [ ! -f "$DEST/package.json" ]; then
    echo "  ✗ Staged tree missing openclaw.mjs/package.json" >&2
    return 1
  fi

  echo "  ✓ OpenClaw staged at $DEST"
}

if stage_from_source; then
  exit 0
fi

echo "  Falling back to standalone OpenClaw binary..."
bash "$ROOT/scripts/fetch-openclaw-sidecar.sh"
