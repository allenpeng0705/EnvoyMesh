#!/usr/bin/env bash
# Phase 46 P2 — live dual-relay miss-forward + circuit dial signoff.
#
# Prerequisites: two running apps/relay instances with mutual --bootstrap.
# Do NOT point both vars at the same community cn-relay.
#
# Usage:
#   TEST_RELAY_A=/ip4/.../tcp/.../p2p/... \
#   TEST_RELAY_B=/ip4/.../tcp/.../p2p/... \
#   ./scripts/multi-relay-fleet-live-signoff.sh
#
# Or pass addrs as args:
#   ./scripts/multi-relay-fleet-live-signoff.sh "$ADDR_A" "$ADDR_B"

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" != "" ]]; then
  export TEST_RELAY_A="$1"
fi
if [[ "${2:-}" != "" ]]; then
  export TEST_RELAY_B="$2"
fi

if [[ -z "${TEST_RELAY_A:-}" || -z "${TEST_RELAY_B:-}" ]]; then
  echo "Set TEST_RELAY_A and TEST_RELAY_B to two distinct relay multiaddrs." >&2
  echo "Example:" >&2
  echo "  TEST_RELAY_A=/ip4/1.2.3.4/tcp/4001/p2p/12D3... \\" >&2
  echo "  TEST_RELAY_B=/ip4/5.6.7.8/tcp/4001/p2p/12D3... \\" >&2
  echo "  $0" >&2
  exit 1
fi

if [[ "$TEST_RELAY_A" == "$TEST_RELAY_B" ]]; then
  echo "TEST_RELAY_A and TEST_RELAY_B must be different relays." >&2
  exit 1
fi

echo "==> Phase 46 live dual-relay signoff"
echo "    TEST_RELAY_A=$TEST_RELAY_A"
echo "    TEST_RELAY_B=$TEST_RELAY_B"

RUN_E2E=1 npx vitest run apps/node/test/multi-relay-fleet-live-e2e.test.ts
echo "==> OK"
