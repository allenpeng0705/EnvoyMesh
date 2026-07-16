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

# Reuse an already-staged OpenClaw tree to skip pnpm install (network) on
# rebuilds. Override with STAGE_OPENCLAW_BUNDLE=1 to force re-stage.
if [ -f "$DEST/openclaw.mjs" ] && [ -f "$DEST/package.json" ] && [ -d "$DEST/node_modules" ] && [ "${STAGE_OPENCLAW_BUNDLE:-0}" != "1" ]; then
  echo "[stage-tauri-openclaw-bundle] Reusing staged OpenClaw at $DEST"
  echo "[stage-tauri-openclaw-bundle] Set STAGE_OPENCLAW_BUNDLE=1 to force re-stage."

  # Always clean stale source-only dirs that should never be in resources/
  # (even if cached from before the exclusions were added). Tauri scans
  # ALL files under resources/ for cargo:rerun-if-changed, so 130K+ source
  # files in src/ui/apps/test/docs etc. overwhelm the build.
  STALE_DIRS="src apps docs qa test packages scripts ui config data deploy git-hooks"
  for d in $STALE_DIRS; do
    if [ -d "$DEST/$d" ]; then
      echo "  Removing stale dir: $d/"
      rm -rf "$DEST/$d"
    fi
  done

  exit 0
fi

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
    --exclude node_modules \
    --exclude src \
    --exclude apps \
    --exclude docs \
    --exclude ui \
    --exclude scripts \
    --exclude qa \
    --exclude test \
    --exclude packages \
    --exclude config \
    --exclude data \
    --exclude deploy \
    --exclude git-hooks \
    --exclude pnpm-workspace.yaml \
    "$SOURCE/" "$DEST/"

  # Copy node_modules separately (needed at runtime).
  if [ -d "$SOURCE/node_modules" ]; then
    cp -R "$SOURCE/node_modules" "$DEST/node_modules"
  fi

  # Prune unused OpenClaw extensions — the full set is ~143 dirs with
  # production node_modules deps totalling ~2.2 GB. EnvoyMesh only uses
  # ~13 (envoymesh channel + web search providers). Keeping all of them
  # pushes the NSIS installer past its 2 GB hard cap and the build fails.
  OPENCLAW_EXTENSIONS_ALLOWLIST="envoymesh duckduckgo brave exa firecrawl google xai moonshot minimax ollama perplexity searxng tavily"
  if [ -d "$DEST/extensions" ]; then
    removed=0
    for ext_dir in "$DEST/extensions"/*/; do
      ext_name="$(basename "$ext_dir")"
      # shellcheck disable=SC2086
      if ! echo " $OPENCLAW_EXTENSIONS_ALLOWLIST " | grep -q " $ext_name "; then
        rm -rf "$ext_dir"
        removed=$((removed + 1))
      fi
    done
    if [ "$removed" -gt 0 ]; then
      kept_count=$(echo $OPENCLAW_EXTENSIONS_ALLOWLIST | wc -w | tr -d ' ')
      echo "  Pruned $removed unused OpenClaw extensions (kept $kept_count in allowlist)"
    fi
  fi

  # Prune devDependencies and orphaned extension deps from staged tree.
  # Without pnpm-workspace.yaml, pnpm treats this as a plain package and
  # only keeps deps referenced by the remaining package.json files.
  if [ -f "$DEST/package.json" ]; then
    echo "  Pruning devDependencies + orphaned deps (pnpm prune --prod)..."
    (cd "$DEST" && pnpm prune --prod 2>/dev/null) || \
      echo "  ⚠ pnpm prune --prod failed — staged tree will be larger"
  fi

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
