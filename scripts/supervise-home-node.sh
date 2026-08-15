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
#   npm run node:supervised -- --profile ./apps/node/data/coco
#   HOME_NODE_NPM_SCRIPT=node:dev ./scripts/supervise-home-node.sh
#
# Env:
#   HOME_NODE_NPM_SCRIPT   default: node:dev:4030
#   SUPERVISE_RESTART_SEC  sleep before respawn (default 3)
#   SUPERVISE_BACKOFF_MAX_SEC  cap exponential backoff after crashes (default 60)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SCRIPT="${HOME_NODE_NPM_SCRIPT:-node:dev:4030}"
RESTART_SEC="${SUPERVISE_RESTART_SEC:-3}"
BACKOFF_MAX_SEC="${SUPERVISE_BACKOFF_MAX_SEC:-60}"

export ENVOYMESH_GUARDIAN_EXIT_ON_LAG="${ENVOYMESH_GUARDIAN_EXIT_ON_LAG:-1}"

echo "[supervise-home-node] script=$SCRIPT guardianExitOnLag=$ENVOYMESH_GUARDIAN_EXIT_ON_LAG"
echo "[supervise-home-node] prefer Tauri for desktop; this is the headless 24×7 path"

delay="$RESTART_SEC"
while true; do
  set +e
  npm run "$SCRIPT" -- "$@"
  code=$?
  set -e
  echo "[supervise-home-node] exited code=$code — restarting in ${delay}s"
  sleep "$delay"
  # Soft exit (0) or clean supervisor exit (2 = lag guardian): reset backoff.
  # Hard crashes / SIGKILL (137): grow delay up to BACKOFF_MAX_SEC.
  if [[ "$code" -eq 0 || "$code" -eq 2 ]]; then
    delay="$RESTART_SEC"
  else
    delay=$(( delay * 2 ))
    if [[ "$delay" -gt "$BACKOFF_MAX_SEC" ]]; then
      delay="$BACKOFF_MAX_SEC"
    fi
  fi
done
