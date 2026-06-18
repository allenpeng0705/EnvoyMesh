#!/usr/bin/env bash
# Phase 38 WebRTC voice-call E2E smoke test.
#
# Serves a pre-built Social UI via static HTTP, launches two Chromium pages,
# injects mock WebSocket events, and verifies the full call lifecycle.
#
# ONE-TIME SETUP:
#   npm run build -w @envoymesh/social -- --mode development
#   npx playwright install chromium
#
# Usage: bash scripts/smoke-webrtc-call.sh
#        npm run smoke:webrtc-call

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cleanup() { kill "$SERVE_PID" 2>/dev/null || true; }
trap cleanup EXIT

# --- serve pre-built Social UI ---
PORT=5200
npx serve "$ROOT/apps/social/dist" -p "$PORT" --no-clipboard >/dev/null 2>&1 &
SERVE_PID=$!
for _ in $(seq 1 15); do
  if curl -s -o /dev/null "http://localhost:$PORT"; then break; fi
  sleep 1
done

# --- run ---
npx playwright test apps/social/test/e2e/webrtc-call.smoke.ts --reporter=list --timeout=120000
