#!/usr/bin/env bash
set -euo pipefail

RELAY_ADDR="${1:-${TEST_RELAY_ADDR:-}}"
if [[ -z "$RELAY_ADDR" ]]; then
  echo "Usage: $0 /ip4/<host>/tcp/<port>/p2p/<peerId>" >&2
  echo "Or set TEST_RELAY_ADDR" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> typecheck"
npm run typecheck

echo "==> wan-relay-signoff e2e (TEST_RELAY_ADDR=$RELAY_ADDR)"
TEST_RELAY_ADDR="$RELAY_ADDR" npx vitest run apps/node/test/wan-relay-signoff-e2e.test.ts

SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo ""
echo "=== Sign-off ledger template (paste into docs/wan-connectivity-signoff.md) ==="
npm run cli -w @envoymesh/node -- connectivity-signoff --profile ./data/default ${RELAY_ADDR:+--relay-addr "$RELAY_ADDR"}
echo ""
echo "Physical two-NAT row (after manual §4 on two home routers):"
npm run cli -w @envoymesh/node -- connectivity-signoff --physical-two-nat ${RELAY_ADDR:+--relay-addr "$RELAY_ADDR"}
