#!/usr/bin/env bash
# Prune unused OpenClaw extensions from the staged Tauri resources.
#
# Called by build:win / build:linux (and optionally build:mac) to keep the
# staged openclaw tree under NSIS's 2 GB hard cap. The full set is ~143
# extensions with ~2.2 GB of production node_modules deps; EnvoyMesh only
# uses ~13.
#
# This script is a no-op if the openclaw tree is missing or already pruned.
#
# Usage: bash scripts/prune-openclaw-extensions.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$ROOT/apps/tauri/src-tauri/resources/openclaw/extensions"

if [ ! -d "$EXT_DIR" ]; then
  echo "[prune-openclaw-extensions] No extensions dir — nothing to prune"
  exit 0
fi

ALLOWLIST="envoymesh duckduckgo brave exa firecrawl google xai moonshot minimax ollama perplexity searxng tavily"

removed=0
for ext_dir in "$EXT_DIR"/*/; do
  [ -d "$ext_dir" ] || continue
  ext_name="$(basename "$ext_dir")"
  # shellcheck disable=SC2086
  if ! echo " $ALLOWLIST " | grep -q " $ext_name "; then
    rm -rf "$ext_dir"
    removed=$((removed + 1))
  fi
done

kept=$(echo $ALLOWLIST | wc -w | tr -d ' ')
if [ "$removed" -gt 0 ]; then
  echo "[prune-openclaw-extensions] Removed $removed extensions (kept $kept in allowlist)"

  # Prune orphaned extension deps from staged tree.
  if [ -f "$ROOT/apps/tauri/src-tauri/resources/openclaw/package.json" ]; then
    echo "[prune-openclaw-extensions] Running pnpm prune --prod to clean orphaned deps..."
    (cd "$ROOT/apps/tauri/src-tauri/resources/openclaw" && pnpm prune --prod 2>/dev/null) || \
      echo "[prune-openclaw-extensions] pnpm prune --prod failed — staged tree will be larger"
  fi
else
  echo "[prune-openclaw-extensions] Already pruned ($kept extensions in allowlist)"
fi
