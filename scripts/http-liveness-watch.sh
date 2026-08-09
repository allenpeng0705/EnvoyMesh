#!/usr/bin/env bash
# External liveness watchdog for EnvoyMesh home/relay processes.
#
# Exit-based supervisors (systemd Restart=, launchd KeepAlive, Tauri exit-code
# guardian) do NOT notice an alive-but-wedged process (port LISTEN, event loop
# starved). This script probes GET /health and kills the target PID when the
# probe fails repeatedly so the outer supervisor can restart it.
#
# Usage:
#   scripts/http-liveness-watch.sh --url http://127.0.0.1:3030/health --pid-file /path/to.pid
#   scripts/http-liveness-watch.sh --url http://127.0.0.1:15432/health --pid 12345
#   scripts/http-liveness-watch.sh --url http://127.0.0.1:15432/health --systemctl envoymesh-relay
#
# --systemctl UNIT (default): read MainPID and SIGTERM/SIGKILL it. Works when the
#   watchdog runs as the same User= as the relay (systemd Restart=always respawns).
#   Does NOT require root / polkit for `systemctl restart`.
# --systemctl-restart UNIT: call `systemctl restart` (needs root or a sudoers rule).
#
# Env overrides:
#   LIVENESS_INTERVAL_SEC=15 LIVENESS_TIMEOUT_SEC=2 LIVENESS_FAILS=3 LIVENESS_GRACE_SEC=90

set -euo pipefail

URL=""
PID=""
PID_FILE=""
SYSTEMCTL_UNIT=""
SYSTEMCTL_RESTART=0
INTERVAL_SEC="${LIVENESS_INTERVAL_SEC:-15}"
TIMEOUT_SEC="${LIVENESS_TIMEOUT_SEC:-2}"
FAILS_NEEDED="${LIVENESS_FAILS:-3}"
GRACE_SEC="${LIVENESS_GRACE_SEC:-90}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --pid) PID="${2:-}"; shift 2 ;;
    --pid-file) PID_FILE="${2:-}"; shift 2 ;;
    --systemctl) SYSTEMCTL_UNIT="${2:-}"; SYSTEMCTL_RESTART=0; shift 2 ;;
    --systemctl-restart) SYSTEMCTL_UNIT="${2:-}"; SYSTEMCTL_RESTART=1; shift 2 ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$URL" ]]; then
  echo "--url is required" >&2
  exit 2
fi
if [[ -z "$PID" && -z "$PID_FILE" && -z "$SYSTEMCTL_UNIT" ]]; then
  echo "one of --pid, --pid-file, --systemctl, or --systemctl-restart is required" >&2
  exit 2
fi

resolve_pid() {
  if [[ -n "$PID" ]]; then
    echo "$PID"
    return
  fi
  if [[ -n "$PID_FILE" && -f "$PID_FILE" ]]; then
    tr -d '[:space:]' <"$PID_FILE"
    return
  fi
  if [[ -n "$SYSTEMCTL_UNIT" ]]; then
    systemctl show -p MainPID --value "$SYSTEMCTL_UNIT" 2>/dev/null || true
    return
  fi
  echo ""
}

kill_pid() {
  local target="$1"
  if [[ -z "$target" || "$target" == "0" ]]; then
    echo "[liveness] no pid to kill" >&2
    return 1
  fi
  echo "[liveness] killing wedged pid $target (TERM then KILL); supervisor should Restart=always"
  kill -TERM "$target" 2>/dev/null || true
  sleep 3
  if kill -0 "$target" 2>/dev/null; then
    kill -KILL "$target" 2>/dev/null || true
  fi
}

kill_target() {
  if [[ -n "$SYSTEMCTL_UNIT" && "$SYSTEMCTL_RESTART" == "1" ]]; then
    echo "[liveness] systemctl restart $SYSTEMCTL_UNIT"
    if ! systemctl restart "$SYSTEMCTL_UNIT"; then
      echo "[liveness] systemctl restart failed (need root, or use --systemctl to kill MainPID instead)" >&2
      return 1
    fi
    return 0
  fi

  if [[ -n "$SYSTEMCTL_UNIT" ]]; then
    local target
    target="$(resolve_pid)"
    echo "[liveness] unit=$SYSTEMCTL_UNIT MainPID=${target:-unknown}"
    kill_pid "$target"
    return
  fi

  kill_pid "$(resolve_pid)"
}

echo "[liveness] watching $URL every ${INTERVAL_SEC}s (fail=${FAILS_NEEDED}, timeout=${TIMEOUT_SEC}s, grace=${GRACE_SEC}s)"
STARTED_AT="$(date +%s)"
FAILS=0

while true; do
  sleep "$INTERVAL_SEC"
  NOW="$(date +%s)"
  if (( NOW - STARTED_AT < GRACE_SEC )); then
    continue
  fi

  if curl -fsS --max-time "$TIMEOUT_SEC" "$URL" >/dev/null 2>&1; then
    if (( FAILS > 0 )); then
      echo "[liveness] recovered after $FAILS failure(s)"
    fi
    FAILS=0
    continue
  fi

  FAILS=$((FAILS + 1))
  echo "[liveness] probe failed ($FAILS/$FAILS_NEEDED) url=$URL"
  if (( FAILS >= FAILS_NEEDED )); then
    kill_target || true
    FAILS=0
    STARTED_AT="$(date +%s)"
  fi
done
