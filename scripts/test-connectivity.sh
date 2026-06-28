#!/bin/bash
# Automated two-node connectivity test.
# Starts two nodes locally, verifies they can discover each other.
# Returns exit 0 on success, 1 on failure.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR="${ROOT}/data/test-conn"
N1="${TMPDIR}/n1"
N2="${TMPDIR}/n2"

cleanup() {
  kill %1 %2 %3 2>/dev/null || true
  wait 2>/dev/null || true
  rm -rf "${TMPDIR}"
}
trap cleanup EXIT

echo "=== Setup ==="
rm -rf "${TMPDIR}"
mkdir -p "${N1}" "${N2}"

echo "=== Start Node 1 (port 40111) ==="
cd "${ROOT}"
npx tsx apps/node/src/index.ts \
  --profile "${N1}" \
  --listen /ip4/127.0.0.1/tcp/40111 \
  --discovery-profile lan-fast \
  > "${TMPDIR}/n1.log" 2>&1 &
sleep 3

echo "=== Start Node 2 (port 40112) ==="
npx tsx apps/node/src/index.ts \
  --profile "${N2}" \
  --listen /ip4/127.0.0.1/tcp/40112 \
  --discovery-profile lan-fast \
  > "${TMPDIR}/n2.log" 2>&1 &
sleep 3

# Extract Peer IDs (BSD-compatible sed)
N1_PEER=$(sed -n 's/.*libp2p Peer ID: \([^ ]*\).*/\1/p' "${TMPDIR}/n1.log" | head -1)
N2_PEER=$(sed -n 's/.*libp2p Peer ID: \([^ ]*\).*/\1/p' "${TMPDIR}/n2.log" | head -1)

if [ -z "$N1_PEER" ] || [ -z "$N2_PEER" ]; then
  echo "FAIL: Could not extract Peer IDs"
  echo "=== N1 log ===" && tail -20 "${TMPDIR}/n1.log"
  echo "=== N2 log ===" && tail -20 "${TMPDIR}/n2.log"
  exit 1
fi

echo "N1 Peer: ${N1_PEER}"
echo "N2 Peer: ${N2_PEER}"

echo "=== Ping N1 → N2 ==="
npx tsx apps/node/src/index.ts \
  --profile "${N1}" \
  --listen /ip4/127.0.0.1/tcp/40113 \
  --ping-target "${N2_PEER}" \
  --discovery-profile lan-fast \
  > "${TMPDIR}/ping.log" 2>&1 &
sleep 10

echo "=== Check result ==="
# Grep for connectivity indicators
if grep -qE "Online|connected|reachable|bootstrap.*ok" "${TMPDIR}/n1.log" "${TMPDIR}/n2.log" 2>/dev/null; then
  echo "PASS: Connectivity detected"
  exit 0
elif grep -qE "peer:connect" "${TMPDIR}/n1.log" 2>/dev/null; then
  echo "PASS: peer:connect event detected"
  exit 0
else
  echo "FAIL"
  echo "=== N1 log (last 20) ===" && tail -20 "${TMPDIR}/n1.log"
  echo "=== N2 log (last 20) ===" && tail -20 "${TMPDIR}/n2.log"
  echo "=== Ping log ===" && tail -20 "${TMPDIR}/ping.log"
  exit 1
fi
