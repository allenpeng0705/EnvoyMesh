#!/usr/bin/env bash
# Stage EnvoyMesh node runtime (JS + production deps) for Tauri desktop bundles.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/apps/tauri/src-tauri/resources/node"

bash "$ROOT/scripts/stage-bundle-node-runtime.sh" "$DEST"
echo "Staged node bundle at $DEST"
