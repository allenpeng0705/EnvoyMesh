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

echo "==> Phase 15B physical two-NAT sign-off (automated + operator checklist)"
echo ""

echo "==> Step 1: automated relay baseline"
./scripts/wan-relay-signoff-staging.sh "$RELAY_ADDR"

echo ""
echo "==> Step 2: operator checklist"
npm run cli -w @envoymesh/node -- connectivity-signoff --physical-two-nat --checklist \
  --relay-addr "$RELAY_ADDR" \
  ${WAN_SIGNOFF_OPERATOR:+--operator "$WAN_SIGNOFF_OPERATOR"} \
  ${WAN_NAT_A_PEER:+--nat-a-peer "$WAN_NAT_A_PEER"} \
  ${WAN_NAT_B_PEER:+--nat-b-peer "$WAN_NAT_B_PEER"} \
  ${WAN_SIGNOFF_CHAT_VERIFIED:+--chat-verified} \
  ${WAN_SIGNOFF_AUTOMATED_OK:+--automated-ok}

if [[ "${WAN_SIGNOFF_COMPLETE:-}" == "1" ]]; then
  echo ""
  echo "==> Step 3: completed ledger row (paste into docs/wan-connectivity-signoff.md)"
  npm run cli -w @envoymesh/node -- connectivity-signoff --physical-two-nat --complete \
    --relay-addr "$RELAY_ADDR" \
    ${WAN_SIGNOFF_OPERATOR:+--operator "$WAN_SIGNOFF_OPERATOR"} \
    ${WAN_NAT_A_PEER:+--nat-a-peer "$WAN_NAT_A_PEER"} \
    ${WAN_NAT_B_PEER:+--nat-b-peer "$WAN_NAT_B_PEER"} \
    ${WAN_SIGNOFF_CHAT_VERIFIED:+--chat-verified} \
    --automated-ok
fi
