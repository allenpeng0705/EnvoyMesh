#!/bin/bash
#
# Run Relay Bootstrap Integration Tests
#
# These tests need a reachable relay; by default they use the EnvoyMesh
# community relay (repo-root .env TEST_RELAY_ADDR, falling back to cn-relay
# 47.93.11.212:4001). No local relay is required. Override with
# TEST_RELAY_ADDR / --relay-addr to point at a private relay.
#
# The test file is gated behind RUN_E2E=1 RUN_WAN_RELAY_TESTS=1 (it needs the
# public network). This script sets both, so it runs the file for real instead
# of letting vitest exclude/skip it and reporting a vacuous "all passed".
#
# Usage:
#   ./run-integration-tests.sh                              # Community relay
#   ./run-integration-tests.sh --relay-addr=/ip4/1.2.3.4/tcp/4001/p2p/Qm...
#   ./run-integration-tests.sh --presets=public-libp2p     # Bootstrap presets
#   ./run-integration-tests.sh --verbose                   # Verbose output
#
# Environment variables:
#   TEST_RELAY_ADDR        - Relay server multiaddr (default: community cn-relay)
#   TEST_BOOTSTRAP_PRESETS - Comma-separated presets (e.g. "public-libp2p,cn-relay")
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# apps/node/test/integration -> repo root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
RELAY_ADDR="${TEST_RELAY_ADDR:-}"
PRESETS="${TEST_BOOTSTRAP_PRESETS:-public-libp2p}"
VERBOSE=""
TEST_FILE="apps/node/test/integration/bootstrap-relay.test.ts"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --relay-addr=*)
            RELAY_ADDR="${1#*=}"
            shift
            ;;
        --relay-addr)
            RELAY_ADDR="$2"
            shift 2
            ;;
        --presets=*)
            PRESETS="${1#*=}"
            shift
            ;;
        --presets)
            PRESETS="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE="--reporter=verbose"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --relay-addr=<addr>   Relay server multiaddr"
            echo "  --presets=<presets>   Bootstrap presets (comma-separated)"
            echo "  --verbose, -v         Verbose output"
            echo "  --help, -h            Show this help"
            echo ""
            echo "Environment variables:"
            echo "  TEST_RELAY_ADDR        Relay server multiaddr"
            echo "  TEST_BOOTSTRAP_PRESETS Bootstrap presets"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Export for tests (only when set — an empty export would shadow .env)
if [[ -n "$RELAY_ADDR" ]]; then
    export TEST_RELAY_ADDR="$RELAY_ADDR"
else
    echo -e "${YELLOW}TEST_RELAY_ADDR not set — using the built-in community cn-relay.${NC}"
    echo "Set TEST_RELAY_ADDR (or pass --relay-addr) to use a private relay."
    echo ""
fi
export TEST_BOOTSTRAP_PRESETS="$PRESETS"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Relay Bootstrap Integration Tests${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Configuration:"
echo "  Relay Address: ${RELAY_ADDR:-<community cn-relay default>}"
echo "  Presets:       $PRESETS"
echo "  Test File:     $TEST_FILE"
echo ""

# Change to project root
cd "$PROJECT_ROOT"

# Run the tests — the RUN_E2E / RUN_WAN_RELAY_TESTS gates are what make this
# file run at all (vitest.config.ts excludes integration/** without RUN_E2E).
echo -e "${YELLOW}Running tests...${NC}"
echo ""

if RUN_E2E=1 RUN_WAN_RELAY_TESTS=1 npx vitest run "$TEST_FILE" $VERBOSE; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  All tests passed!${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}  Tests failed!${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi
