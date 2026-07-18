#!/usr/bin/env bash
# Post-stage smoke for the OpenClaw bundle staged by
# scripts/stage-tauri-openclaw-bundle.sh.
#
# Runs the staged `openclaw.mjs` in gateway mode on a unique loopback port
# and asserts the gateway registers its HTTP route within a timeout.
# Catches the class of bundle defects that escape pre-flight validation
# (validateOpenClawTree in apps/node/src/openclaw-gateway-spawn.ts) and
# only show up as "Gateway not reachable after 90s" at runtime.
#
# Usage:  bash scripts/smoke-openclaw-bundle.sh
# Env:
#   OPENCLAW_DIR   Override staged tree path (default:
#                  apps/tauri/src-tauri/resources/openclaw)
#   NODE_BIN       Override Node binary   (default: process.execPath via node)
#   SMOKE_TIMEOUT  Seconds to wait        (default: 60)
#
# Exit codes:
#   0  gateway registered its HTTP route in time
#   2  missing staged tree or dist/entry.js
#   3  openclaw.mjs refused to start (init/validation error)
#   4  timed out before seeing the registration marker
#   5  node_modules/openclaw/ self-reference is missing (the bug class
#      this smoke was written to catch)

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OPENCLAW_DIR="${OPENCLAW_DIR:-$ROOT/apps/tauri/src-tauri/resources/openclaw}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-60}"

# Discover Node. If the user is on macOS and the .app's bundled node is
# what'll actually run, prefer that — but for a smoke the system `node`
# is fine when it's >= 22 (matches the runtime requirement).
NODE_BIN="${NODE_BIN:-}"
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node || true)"
fi
if [ -z "$NODE_BIN" ]; then
  echo "[smoke] ✗ node not found in PATH" >&2
  exit 2
fi

# Pick an unusual loopback port to avoid colliding with anything live.
# Math: PRNG seeded by pid so re-runs in the same second still differ.
PORT=$(( 39000 + (RANDOM % 4000) ))
SMOKE_LOG="/tmp/envoymesh-openclaw-smoke.$$.log"
SMOKE_PID_FILE="/tmp/envoymesh-openclaw-smoke.$$.pid"

cleanup() {
  if [ -f "$SMOKE_PID_FILE" ]; then
    pid="$(cat "$SMOKE_PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      # Give it 2s to exit cleanly, then SIGKILL.
      for _ in 1 2 3 4; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$SMOKE_PID_FILE"
  fi
}
trap cleanup EXIT INT TERM

echo "[smoke] OpenClaw bundle smoke @ $OPENCLAW_DIR"
echo "[smoke] Node: $NODE_BIN ($( "$NODE_BIN" -v 2>&1 || true))"
echo "[smoke] Gateway port: $PORT (timeout ${SMOKE_TIMEOUT}s)"

# Existence checks: bail with a clear, actionable error before we spawn.
missing=()
[ -f "$OPENCLAW_DIR/openclaw.mjs" ]      || missing+=("openclaw.mjs")
[ -f "$OPENCLAW_DIR/package.json" ]      || missing+=("package.json")
[ -f "$OPENCLAW_DIR/dist/entry.js" ]     || missing+=("dist/entry.js")
[ -f "$OPENCLAW_DIR/extensions/envoymesh/index.js" ] \
                                          || missing+=("extensions/envoymesh/index.js")
[ -f "$OPENCLAW_DIR/dist/config/config.js" ] \
                                          || missing+=("dist/config/config.js")
if [ ${#missing[@]} -gt 0 ]; then
  echo "[smoke] ✗ staged tree is missing critical files: ${missing[*]}" >&2
  echo "[smoke]   Re-run: bash scripts/stage-tauri-openclaw-bundle.sh" >&2
  exit 2
fi

# The actual bug class: node_modules/openclaw/ is empty or missing. The
# spawn below would otherwise fail with an opaque ENOENT during plugin
# resolution. Catch it explicitly here.
if [ ! -f "$OPENCLAW_DIR/node_modules/openclaw/package.json" ]; then
  echo "[smoke] ✗ node_modules/openclaw/package.json is missing" >&2
  echo "[smoke]   This is the bug class 'OpenClaw tree is incomplete'." >&2
  echo "[smoke]   Fix: STAGE_OPENCLAW_BUNDLE=1 bash scripts/stage-tauri-openclaw-bundle.sh" >&2
  exit 5
fi

# Spawn the gateway. Use the same CLI shape as the runtime
# (apps/node/src/openclaw-gateway-spawn.ts:166-175).
echo "[smoke] Spawning: $NODE_BIN $OPENCLAW_DIR/openclaw.mjs gateway --port $PORT --bind loopback --auth none --allow-unconfigured"
(
  cd "$OPENCLAW_DIR"
  OPENCLAW_BUNDLED_PLUGINS_DIR="$OPENCLAW_DIR/extensions" \
    "$NODE_BIN" "$OPENCLAW_DIR/openclaw.mjs" gateway \
      --port "$PORT" --bind loopback --auth none --allow-unconfigured \
      > "$SMOKE_LOG" 2>&1 &
  echo $! > "$SMOKE_PID_FILE"
)

# Wait for either:
#  - the gateway is operational: log line "[gateway] ready" AND
#    "[gateway] http server listening" AND a successful HTTP probe
#    (curl --max-time 2 to http://127.0.0.1:$PORT/).
#  - one of the failure markers we've seen in production:
#      "Init failed: OpenClaw tree is incomplete"
#      "tree is incomplete"
#      "Cannot find module"
#      "ERR_MODULE_NOT_FOUND"
#      "[openclaw] Built-in agent ready (EnvoyAI)" alone is NOT success —
#      it's the local fallback firing before the gateway came up.
end=$(( SECONDS + SMOKE_TIMEOUT ))
status="timeout"
last_marker=""
ready_seen=""
listen_seen=""
while [ "$SECONDS" -lt "$end" ]; do
  if [ -f "$SMOKE_LOG" ]; then
    # "ready" alone is suggestive; we want http server listening too.
    if [ -z "$ready_seen" ] && grep -q "\[gateway\] ready" "$SMOKE_LOG" 2>/dev/null; then
      ready_seen="yes"
    fi
    if [ -z "$listen_seen" ] && grep -q "\[gateway\] http server listening" "$SMOKE_LOG" 2>/dev/null; then
      listen_seen="yes"
    fi
    # Tolerate either the newer "http server listening" log OR an older
    # "Registered EnvoyMesh HTTP route" line for forward/back compat.
    if [ -n "$listen_seen" ] || grep -q "Registered EnvoyMesh HTTP route" "$SMOKE_LOG" 2>/dev/null; then
      # Stronger check: confirm the listener actually accepts connections.
      code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null || true)"
      # Any HTTP code (including 404 from a default handler) proves the
      # listener is up. Empty/000 = not listening yet.
      if [ -n "$code" ] && [ "$code" != "000" ]; then
        status="ok"; last_marker="http=$code"
        break
      fi
      # Match kept "listen_seen" so the loop doesn't re-grep forever;
      # without an HTTP response we keep polling for a few more seconds
      # in case the listener registration is still warming.
    fi
    # Fail-fast on the known-bad init signatures.
    for marker in \
      "OpenClaw tree is incomplete" \
      "tree is incomplete" \
      "ERR_MODULE_NOT_FOUND" \
      "Cannot find module"; do
      if grep -q "$marker" "$SMOKE_LOG" 2>/dev/null; then
        status="init-failed"; last_marker="$marker"; break 2
      fi
    done
  fi
  # Process died before registering — surface that.
  if [ -f "$SMOKE_PID_FILE" ]; then
    pid="$(cat "$SMOKE_PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      status="crashed"; break
    fi
  fi
  sleep 0.5
done

# Show recent log lines so failures are diagnosable from one place.
echo "[smoke] ----- gateway log (tail 30) -----"
tail -n 30 "$SMOKE_LOG" 2>/dev/null || echo "(no log)"
echo "[smoke] --------------------------------"

case "$status" in
  ok)
    echo "[smoke] ✓ Gateway ready on port $PORT within ${SMOKE_TIMEOUT}s ($last_marker)"
    exit 0
    ;;
  init-failed)
    echo "[smoke] ✗ Gateway refused to start — saw marker: '$last_marker'" >&2
    exit 3
    ;;
  crashed)
    echo "[smoke] ✗ Gateway process exited before listening" >&2
    exit 4
    ;;
  timeout)
    echo "[smoke] ✗ Gateway did not become ready within ${SMOKE_TIMEOUT}s" >&2
    echo "[smoke]   ready_seen='$ready_seen' listen_seen='$listen_seen'" >&2
    exit 4
    ;;
esac
