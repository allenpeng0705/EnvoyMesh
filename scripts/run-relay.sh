#!/bin/bash
# EnvoyMesh Relay Server Quick Start Script
# For Linux and macOS
# Usage: ./run-relay.sh [--profile DIR] [--port PORT] [--advertise IP] [--http-port PORT] [--public-mode]
#
# Always rebuilds apps/relay via `tsc -b apps/relay` (full project-reference
# graph: protocol, identity, bonds, network, api, relay) before launching.
# Stale hand-picked builds used to miss identity → TS6305 on fresh hosts.
# If you really need to skip a build, use --no-rebuild.
#
# Admin Web UI: defaults to user admin / password envoymesh123456.
# Override before exposing publicly:
#   ENVOYMESH_RELAY_ADMIN_USER=ops
#   ENVOYMESH_RELAY_ADMIN_PASSWORD=...
# Put TLS (Caddy/nginx) in front for remote access — Basic Auth over plain HTTP
# leaks credentials. For hard restart from the UI, run under systemd/Docker with
# Restart=always (see docs/relay-supervisor-recipes.md).

set -e

RELAY_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_DIR="${ENVOYMESH_PROFILE:-./data/relay}"
LISTEN_PORT="${RELAY_PORT:-4001}"
ADVERTISE_ADDR=""
HTTP_PORT=""
# Empty = auto: --advertise-addr alone enables public mode in the binary.
# Set via --public-mode / --private-mode or ENVOYMESH_RELAY_PUBLIC_MODE=0|1.
PUBLIC_MODE="${ENVOYMESH_RELAY_PUBLIC_MODE-}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --profile)
            PROFILE_DIR="$2"
            shift 2
            ;;
        --port)
            LISTEN_PORT="$2"
            shift 2
            ;;
        --advertise)
            ADVERTISE_ADDR="$2"
            shift 2
            ;;
        --http-port)
            HTTP_PORT="$2"
            shift 2
            ;;
        --public-mode)
            # Apply community-relay presets to circuit-relay-v2: 1024
            # reservations, 30 min TTL, 4 MiB data, 60 min duration, 90 s
            # hop timeout, 1024 outbound stop streams.
            # Prefer --advertise <IP> for community relays: the binary
            # auto-enables public mode when --advertise-addr is set.
            PUBLIC_MODE=1
            shift
            ;;
        --private-mode)
            # Explicit opt-out of advertise→public auto-enable.
            PUBLIC_MODE=0
            shift
            ;;
        --rebuild)
            # Accepted for backward compat — build is always on now.
            shift
            ;;
        --no-rebuild)
            # Escape hatch if you really want to skip the build (e.g. CI cached it).
            SKIP_REBUILD=1
            shift
            ;;
        --help|-h)
            echo "EnvoyMesh Relay Server"
            echo ""
            echo "Usage: ./run-relay.sh [options]"
            echo ""
            echo "Options:"
            echo "  --profile <dir>    Profile directory (default: ./data/relay)"
            echo "  --port <port>      Listen port (default: 4001)"
            echo "  --advertise <IP>   Public IP for advertise address (auto public-mode in binary)"
            echo "  --http-port <port> HTTP port for /info, /health, and /admin (optional)"
            echo "  --public-mode      Force community-relay circuit-relay-v2 presets"
            echo "                     (1024 reservations, 30 min TTL, 4 MiB data, etc.)."
            echo "  --private-mode     Force private/embedded defaults (15 reservations, 2 min TTL)"
            echo "                     even when --advertise is set."
            echo "  --rebuild          (legacy no-op — build is always on)"
            echo "  --no-rebuild       Skip the pre-launch build (escape hatch)"
            echo "  --help, -h         Show this help"
            echo ""
            echo "Environment variables:"
            echo "  ENVOYMESH_PROFILE          Profile directory"
            echo "  ENVOYMESH_BOOTSTRAP        Bootstrap peers (comma-separated)"
            echo "  RELAY_PORT                 Default listen port"
            echo "  ENVOYMESH_RELAY_PUBLIC_MODE  1=force public, 0=force private; unset=auto"
            echo "  ENVOYMESH_RELAY_ADMIN_USER / ENVOYMESH_RELAY_ADMIN_PASSWORD"
            echo "                             Admin UI Basic Auth (default: admin / envoymesh123456)"
            echo "                             Also locks /info, /version, /reservations"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Always rebuild the relay and its TypeScript project-reference graph before
# launch. Hand-picking packages (protocol → api → …) missed identity and caused
# TS6305 on fresh hosts. `tsc -b apps/relay` builds protocol, identity, bonds,
# network, api, and relay in dependency order (incremental / fast when clean).
if [ "${SKIP_REBUILD:-0}" != "1" ]; then
    echo "Building relay server (tsc -b apps/relay — full project graph)..."
    (cd "$PROJECT_ROOT" && npx tsc -b apps/relay)
    echo "Build done."
else
    echo "Skipping build (--no-rebuild)."
fi

# Create profile directory
mkdir -p "$PROFILE_DIR"

# Build listen address
LISTEN_ADDR="/ip4/0.0.0.0/tcp/$LISTEN_PORT"

# Build command
CMD="node $PROJECT_ROOT/apps/relay/dist/index.js --profile $PROFILE_DIR --listen $LISTEN_ADDR"

# Add advertise address if provided
if [ -n "$ADVERTISE_ADDR" ]; then
    CMD="$CMD --advertise-addr /ip4/$ADVERTISE_ADDR/tcp/$LISTEN_PORT"
fi

# Add HTTP port if provided
if [ -n "$HTTP_PORT" ]; then
    CMD="$CMD --http-port $HTTP_PORT"
fi

# Public vs private circuit-relay-v2 presets.
# Unset PUBLIC_MODE → do not pass a mode flag; the binary auto-enables public
# mode when --advertise-addr is present. Only pass explicit flags when the
# operator (or env) requested them — never force private merely because the
# default env was empty/0.
if [ "$PUBLIC_MODE" = "1" ]; then
    CMD="$CMD --relay-public-mode"
elif [ "$PUBLIC_MODE" = "0" ]; then
    CMD="$CMD --relay-private-mode"
fi

# Add bootstrap peers if set
if [ -n "$ENVOYMESH_BOOTSTRAP" ]; then
    for PEER in $(echo "$ENVOYMESH_BOOTSTRAP" | tr ',' ' '); do
        CMD="$CMD --bootstrap $PEER"
    done
fi

echo "=========================================="
echo "  EnvoyMesh Relay Server"
echo "=========================================="
echo "  Profile: $PROFILE_DIR"
echo "  Listen:  $LISTEN_ADDR"
if [ -n "$ADVERTISE_ADDR" ]; then
    echo "  Advertise: /ip4/$ADVERTISE_ADDR/tcp/$LISTEN_PORT"
fi
if [ -n "$HTTP_PORT" ]; then
    echo "  HTTP:    port $HTTP_PORT (/health public; /info when admin unset)"
    echo "  Admin UI: http://0.0.0.0:${HTTP_PORT}/admin/ (default auth: admin / envoymesh123456)"
    echo "           Override with ENVOYMESH_RELAY_ADMIN_USER + _PASSWORD; put TLS in front."
fi
if [ -n "$ADVERTISE_ADDR" ] && [ "$PUBLIC_MODE" != "0" ]; then
    # Advertise implies public mode in the relay binary (unless --private-mode).
    EFFECTIVE_PUBLIC=1
elif [ "$PUBLIC_MODE" = "1" ]; then
    EFFECTIVE_PUBLIC=1
else
    EFFECTIVE_PUBLIC=0
fi
if [ "$EFFECTIVE_PUBLIC" = "1" ]; then
    echo "  Mode:    PUBLIC (1024 reservations, 30 min TTL, 4 MiB data)"
    if [ "$PUBLIC_MODE" != "1" ] && [ -n "$ADVERTISE_ADDR" ]; then
        echo "           (auto from --advertise; use --private-mode to opt out)"
    fi
else
    echo "  Mode:    PRIVATE (libp2p defaults: 15 reservations, 2 min TTL)"
    echo "           Use --public-mode (or --advertise) for community-relay presets"
fi
echo "=========================================="
echo ""

# Community/public relays must come back after SIGKILL from the sibling
# liveness watchdog. Prefer systemd Restart=always in production; this loop
# is the built-in fallback (stricter than home's optional supervise script).
# Disable: ENVOYMESH_RELAY_SUPERVISE=0
RESTART_SEC="${SUPERVISE_RESTART_SEC:-3}"
if [ "${ENVOYMESH_RELAY_SUPERVISE:-1}" = "1" ]; then
  echo "[supervise-relay] enabled (ENVOYMESH_RELAY_SUPERVISE=0 to disable)"
  echo "$CMD"
  while true; do
    set +e
    # shellcheck disable=SC2086
    eval $CMD
    code=$?
    set -e
    echo "[supervise-relay] exited code=$code — restarting in ${RESTART_SEC}s"
    sleep "$RESTART_SEC"
  done
else
  echo "$CMD"
  # shellcheck disable=SC2086
  exec $CMD
fi