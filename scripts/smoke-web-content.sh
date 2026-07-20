#!/usr/bin/env bash
# Phase 45 Web Content Browsing E2E smoke (Playwright).
#
# Spawns two real EnvoyMesh node OS processes via NodeSpawner, serves a
# pre-built Social UI via static HTTP, opens Chromium, and drives the
# Browser view to verify the end-to-end flow.
#
# ONE-TIME SETUP (matches smoke-webrtc-call.sh):
#   npm install
#   npx playwright install chromium
#   npm run build -w @envoymesh/social -- --mode development
#
# Usage: bash scripts/smoke-web-content.sh
#        npm run smoke:web-content

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cleanup() { kill "$SERVE_PID" 2>/dev/null || true; }
trap cleanup EXIT

# --- serve pre-built Social UI ---
PORT=5201
npx serve "$ROOT/apps/social/dist" -p "$PORT" --no-clipboard >/dev/null 2>&1 &
SERVE_PID=$!
for _ in $(seq 1 15); do
  if curl -s -o /dev/null "http://localhost:$PORT"; then break; fi
  sleep 1
done

# --- run ---
PLAYWRIGHT_BASE_URL="http://localhost:$PORT" \
  npx playwright test apps/social/test/e2e/web-content-browse.smoke.ts \
    --reporter=list --timeout=120000
