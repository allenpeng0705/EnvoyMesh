#!/bin/bash
# EnvoyMesh Relay Server Quick Start Script
# For Linux and macOS
# Usage: ./run-relay.sh [--profile DIR] [--port PORT] [--advertise IP] [--http-port PORT]
#
# Always rebuilds apps/relay and its workspace deps before launching.
# tsc -b is incremental (1-3 s on no-op), and stale binaries are the #1
# source of "why isn't my fix live" relay bugs. If you really need to
# skip a build, comment out the build block below.

set -e

RELAY_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_DIR="${ENVOYMESH_PROFILE:-./data/relay}"
LISTEN_PORT="${RELAY_PORT:-4001}"
ADVERTISE_ADDR=""
HTTP_PORT=""

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
            echo "  --advertise <IP>   Public IP for advertise address"
            echo "  --http-port <port> HTTP port for /info endpoint (optional)"
            echo "  --rebuild          (legacy no-op — build is always on)"
            echo "  --no-rebuild       Skip the pre-launch build (escape hatch)"
            echo "  --help, -h         Show this help"
            echo ""
            echo "Environment variables:"
            echo "  ENVOYMESH_PROFILE   Profile directory"
            echo "  ENVOYMESH_BOOTSTRAP Bootstrap peers (comma-separated)"
            echo "  RELAY_PORT          Default listen port"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Always rebuild protocol + api + network + relay before launch.
# The relay's prebuild hook runs `tsc -p ../../packages/network/tsconfig.json`,
# so `npm run relay:build` covers network. We also build protocol and api
# explicitly so their dist/ is current for the relay to import.
if [ "${SKIP_REBUILD:-0}" != "1" ]; then
    echo "Building relay server (incremental)..."
    echo "  protocol"
    (cd "$PROJECT_ROOT/packages/protocol" && npx tsc -p tsconfig.json)
    echo "  api"
    (cd "$PROJECT_ROOT/packages/api" && npx tsc -p tsconfig.json)
    echo "  network (tsc -b pulls @envoymesh/identity in transitively)"
    (cd "$PROJECT_ROOT" && npm run build -w @envoymesh/network)
    echo "  relay"
    (cd "$PROJECT_ROOT" && npm run relay:build)
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
    echo "  HTTP Info: port $HTTP_PORT (/info endpoint)"
fi
echo "=========================================="
echo ""

# Run relay
echo "$CMD"
exec $CMD