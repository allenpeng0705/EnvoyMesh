#!/usr/bin/env bash
# Phase 38 WebRTC voice-call E2E smoke test (Playwright + mock WebSocket).
#
# Starts the Social UI dev server, then runs Playwright tests that
# simulate a full call lifecycle using an injected mock WebSocket.
# No real EnvoyMesh nodes required — the RPC layer is mocked.
#
# Requires: npm install + npx playwright install chromium
#
# Usage:   bash scripts/smoke-webrtc-call.sh
#          npm run smoke:webrtc-call

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  set +e
  if [ -n "${VITE_PID:-}" ]; then kill "$VITE_PID" 2>/dev/null || true; fi
  echo -e "${GREEN}[smoke:webrtc] cleaned up${NC}"
}
trap cleanup EXIT INT TERM

# ---- check prerequisites ----
echo -e "${YELLOW}[smoke:webrtc] checking prerequisites…${NC}"

if ! npx playwright --version >/dev/null 2>&1; then
  echo -e "${RED}[smoke:webrtc] Playwright not found — run 'npm install' and 'npx playwright install chromium'${NC}"
  exit 1
fi

# ---- start social UI dev server ----
echo -e "${YELLOW}[smoke:webrtc] starting social UI dev server…${NC}"
npx vite apps/social --port 5199 --strictPort > /tmp/envoymesh-e2e-vite.log 2>&1 &
VITE_PID=$!

for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:5199 2>/dev/null; then
    echo -e "${GREEN}[smoke:webrtc] social UI ready at http://localhost:5199${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}[smoke:webrtc] social UI failed to start${NC}"
    cat /tmp/envoymesh-e2e-vite.log
    exit 1
  fi
  sleep 1
done

# ---- run playwright test ----
echo -e "${YELLOW}[smoke:webrtc] running Playwright E2E test…${NC}"

export PLAYWRIGHT_BASE_URL="http://localhost:5199"

npx playwright test --reporter=list --timeout=120000 2>&1 || {
  echo ""
  echo -e "${RED}[smoke:webrtc] ❌ E2E smoke test failed${NC}"
  exit 1
}

echo ""
echo -e "${GREEN}[smoke:webrtc] ✅ E2E smoke test passed${NC}"
