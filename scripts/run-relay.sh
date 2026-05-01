#!/bin/bash
# EnvoyMesh Relay Server Quick Start Script
# For Linux and macOS
# Usage: ./run-relay.sh [--profile DIR] [--port PORT] [--advertise IP] [--http-port PORT]

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

# Build relay if not exists
if [ ! -f "$PROJECT_ROOT/apps/relay/dist/index.js" ]; then
    echo "Building relay server..."
    cd "$PROJECT_ROOT"
    npm run relay:build
    cd - > /dev/null
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