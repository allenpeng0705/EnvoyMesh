#!/usr/bin/env bash
# Restart loop for a headless home node (24×7 without Tauri guardian).
#
# Prefer the desktop Tauri app for everyday machines — it already respawns on
# /health timeout. Use this script (or launchd/systemd KeepAlive) when you must
# run `npm run node:dev` headless overnight.
#
# Pairs with:
#   - in-process sibling liveness watchdog (SIGKILL on /health timeout)
#   - ENVOYMESH_GUARDIAN_EXIT_ON_LAG=1 (exit so this loop can restart)
#
# Usage:
#   ./scripts/supervise-home-node.sh
#   ./scripts/supervise-home-node.sh --profile ./apps/node/data/default
#   HOME_NODE_NPM_SCRIPT=node:dev ./scripts/supervise-home-node.sh
#
# Env:
#   HOME_NODE_NPM_SCRIPT   default: node:dev:4030
#   SUPERVISE_RESTART_SEC  sleep before respawn (default 3)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SCRIPT="${HOME_NODE_NPM_SCRIPT:-node:dev:4030}"
RESTART_SEC="${SUPERVISE_RESTART_SEC:-3}"

export ENVOYMESH_GUARDIAN_EXIT_ON_LAG="${ENVOYMESH_GUARDIAN_EXIT_ON_LAG:-1}"

echo "[supervise-home-node] script=$SCRIPT guardianExitOnLag=$ENVOYMESH_GUARDIAN_EXIT_ON_LAG"
echo "[supervise-home-node] prefer Tauri for desktop; this is the headless 24×7 path"

while true; do
  set +e
  npm run "$SCRIPT" -- "$@"
  code=$?
  set -e
  echo "[supervise-home-node] exited code=$code — restarting in ${RESTART_SEC}s"
  sleep "$RESTART_SEC"
done
