#!/usr/bin/env bash
# Diagnostic for the home node's relay-tunnel pairing path.
# Run on the home machine (where `npm run node:dev` is running).
#
# Goal: figure out whether the home's RelayTunnelClient is connected to the
# relay and can reach its local ws-server (port 3030). The mobile "Connection
# closed" error is most often caused by one of:
#   (a) the home's RelayTunnelClient is not started (no /ws/home dial),
#   (b) the local ws-server (port 3030) is not bound,
#   (c) the local ws-server is bound but rejects the tunnel's dial.

set -uo pipefail

echo "============================================================"
echo "1. Is the local ws-server (port 3030) bound?"
echo "============================================================"
if command -v lsof >/dev/null 2>&1; then
  lsof -iTCP:3030 -sTCP:LISTEN 2>&1 || echo "(lsof returned nothing — port not listening)"
else
  netstat -an 2>/dev/null | grep -E "(\.|)3030.*LISTEN" || echo "(netstat returned nothing — port not listening)"
fi

echo ""
echo "============================================================"
echo "2. Can we dial 127.0.0.1:3030 from this machine?"
echo "============================================================"
nc -vz -w 3 127.0.0.1 3030 2>&1

echo ""
echo "============================================================"
echo "3. Can we dial the relay's /ws/home port (15432) from this machine?"
echo "============================================================"
nc -vz -w 5 47.93.11.212 15432 2>&1

echo ""
echo "============================================================"
echo "4. Recent home-node log lines mentioning 'relay-tunnel'"
echo "============================================================"
# Try to find the running node process's stdout. In dev, it's usually the
# terminal where you ran `npm run node:dev`. If you redirected stdout to a
# file, point LOG_FILE at it.
LOG_FILE="${LOG_FILE:-}"
if [ -n "$LOG_FILE" ] && [ -r "$LOG_FILE" ]; then
  echo "(reading from LOG_FILE=$LOG_FILE)"
  grep -E "relay-tunnel|relay-checkin|relay-tunnel-client" "$LOG_FILE" | tail -40
else
  echo "(LOG_FILE not set or not readable. Re-run with: LOG_FILE=/path/to/home.log bash scripts/diag-relay-tunnel.sh)"
  echo "Or paste the home's stdout from `npm run node:dev` directly."
fi

echo ""
echo "============================================================"
echo "5. What does the home think the relay URL is?"
echo "============================================================"
# Read the persisted node-config (where the Social UI saves `relayPublicWsUrl`).
# Default path: ~/Library/Application Support/EnvoyMesh/<profile>/node-config.json
# Adjust the glob if your profile lives elsewhere.
NODE_CFG=$(find "$HOME" -path "*/EnvoyMesh/*/node-config.json" 2>/dev/null | head -1)
if [ -n "$NODE_CFG" ]; then
  echo "(found $NODE_CFG)"
  if command -v jq >/dev/null 2>&1; then
    jq -r '.relayPublicWsUrl // "(unset — auto-discovery mode)"' "$NODE_CFG"
  else
    grep -E "relayPublicWsUrl" "$NODE_CFG" || echo "(no relayPublicWsUrl key — auto-discovery mode)"
  fi
else
  echo "(no node-config.json found under ~/EnvoyMesh — home may be in a non-default profile dir)"
fi

echo ""
echo "============================================================"
echo "If everything above looks right but pairing still fails, please"
echo "share:"
echo "  - the full output of this script"
echo "  - the home's full stdout around the time you tried to pair"
echo "    (look for '[relay-tunnel] connected to' or 'failed to open channel')"
echo "============================================================"
