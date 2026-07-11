#!/bin/bash
# EnvoyMesh Relay Server Quick Start Script
# For Linux and macOS
# Usage: ./run-relay.sh [--profile DIR] [--port PORT] [--advertise IP] [--http-port PORT] [--public-mode]
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
PUBLIC_MODE="${ENVOYMESH_RELAY_PUBLIC_MODE:-0}"

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
            # hop timeout, 1024 outbound stop streams. Default (off) keeps
            # libp2p's embedded-use defaults (15 reservations, 2 min TTL).
            # Public mode is the only way a remote peer can reserve a slot
            # on this relay when they're not on its allowlist.
            PUBLIC_MODE=1
            shift
            ;;
        --private-mode)
            # Explicit opt-out. Useful when the env var accidentally
            # enabled public mode but the operator wants embedded defaults
            # for this run.
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
            echo "  --advertise <IP>   Public IP for advertise address"
            echo "  --http-port <port> HTTP port for /info endpoint (optional)"
            echo "  --public-mode      Apply community-relay presets to circuit-relay-v2"
            echo "                     (1024 reservations, 30 min TTL, 4 MiB data, etc.)."
            echo "                     Default is private mode (libp2p embedded defaults,"
            echo "                     15 reservations, 2 min TTL) which only serves peers"
            echo "                     on the relay's allowlist. Public mode accepts any peer."
            echo "  --private-mode     Force private mode for this run (overrides env var)."
            echo "  --rebuild          (legacy no-op — build is always on)"
            echo "  --no-rebuild       Skip the pre-launch build (escape hatch)"
            echo "  --help, -h         Show this help"
            echo ""
            echo "Environment variables:"
            echo "  ENVOYMESH_PROFILE          Profile directory"
            echo "  ENVOYMESH_BOOTSTRAP        Bootstrap peers (comma-separated)"
            echo "  RELAY_PORT                 Default listen port"
            echo "  ENVOYMESH_RELAY_PUBLIC_MODE  Set to 1 to enable public mode (default: 0)"
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

# Add public-mode flag if requested
if [ "$PUBLIC_MODE" = "1" ]; then
    CMD="$CMD --relay-public-mode"
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
if [ "$PUBLIC_MODE" = "1" ]; then
    echo "  Mode:    PUBLIC (1024 reservations, 30 min TTL, 4 MiB data)"
else
    echo "  Mode:    PRIVATE (libp2p defaults: 15 reservations, 2 min TTL)"
    echo "           Use --public-mode to accept reservations from non-allowlisted peers"
fi
echo "=========================================="
echo ""

# Run relay
echo "$CMD"
exec $CMD