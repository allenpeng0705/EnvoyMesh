#!/usr/bin/env bash
# Prune unused OpenClaw extensions from the staged Tauri resources.
#
# Called by build:win / build:linux (and optionally build:mac) to keep the
# staged openclaw tree under NSIS's 2 GB hard cap. The full set is ~143
# extensions with ~2.2 GB of production node_modules deps; EnvoyMesh uses
# the agent allowlist (envoymesh + search/agent utils; no Diff UI / chat channels).
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

ALLOWLIST="envoymesh device-pair webhooks policy browser file-transfer openshell memory-wiki active-memory llm-task canvas duckduckgo brave exa firecrawl google xai moonshot minimax ollama perplexity searxng tavily"

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

  # NOTE: We do NOT run `pnpm prune --prod` here. The staged tree is missing
  # pnpm-workspace.yaml and packages/, so pnpm sees it as a plain single
  # package. Without those workspace sub-packages, pnpm concludes most deps
  # (json5, chalk, express, ws, etc.) are orphaned and moves them to
  # node_modules/.ignored/. But the compiled dist/*.js files still import
  # them at runtime → ERR_MODULE_NOT_FOUND crash.
else
  echo "[prune-openclaw-extensions] Already pruned ($kept extensions in allowlist)"
fi
