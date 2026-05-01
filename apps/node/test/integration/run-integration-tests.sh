#!/bin/bash
#
# Run Relay Bootstrap Integration Tests
#
# This script runs integration tests for the relay bootstrap functionality.
# It requires a running relay server to connect to.
#
# Usage:
#   ./run-integration-tests.sh                        # Use default local relay
#   ./run-integration-tests.sh --relay-addr=/ip4/1.2.3.4/tcp/4001/p2p/Qm...   # Custom relay
#   ./run-integration-tests.sh --presets=public-libp2p    # Use specific presets
#   ./run-integration-tests.sh --verbose                 # Verbose output
#
# Environment variables:
#   TEST_RELAY_ADDR   - Relay server multiaddr
#   TEST_BOOTSTRAP_PRESETS - Comma-separated presets (e.g., "public-libp2p,public-libp2p-am6")
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"

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
            echo "  --presets=<presets>  Bootstrap presets (comma-separated)"
            echo "  --verbose, -v        Verbose output"
            echo "  --help, -h            Show this help"
            echo ""
            echo "Environment variables:"
            echo "  TEST_RELAY_ADDR       Relay server multiaddr"
            echo "  TEST_BOOTSTRAP_PRESETS  Bootstrap presets"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# If no relay address provided, try to use a default or skip tests that need it
if [[ -z "$RELAY_ADDR" ]]; then
    echo -e "${YELLOW}WARNING: TEST_RELAY_ADDR not set.${NC}"
    echo -e "${YELLOW}Some tests will be skipped or may fail.${NC}"
    echo ""
    echo "To run with a relay server:"
    echo "  export TEST_RELAY_ADDR='/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW...'"
    echo "  # OR"
    echo "  $0 --relay-addr=/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."
    echo ""
fi

# Export for tests
export TEST_RELAY_ADDR
export TEST_BOOTSTRAP_PRESETS="$PRESETS"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Relay Bootstrap Integration Tests${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Configuration:"
echo "  Relay Address: ${RELAY_ADDR:-<not set>}"
echo "  Presets:       $PRESETS"
echo "  Test File:     $TEST_FILE"
echo ""

# Change to project root
cd "$PROJECT_ROOT"

# Run the tests
echo -e "${YELLOW}Running tests...${NC}"
echo ""

if npm test -- "$TEST_FILE" $VERBOSE; then
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
