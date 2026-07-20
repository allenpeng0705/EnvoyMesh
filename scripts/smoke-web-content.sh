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
# Vite root is apps/social/src → output lands in apps/social/src/dist
SOCIAL_DIST="$ROOT/apps/social/src/dist"
if [[ ! -f "$SOCIAL_DIST/index.html" ]]; then
  echo "error: $SOCIAL_DIST missing — run: npm run build -w @envoymesh/social -- --mode development" >&2
  exit 1
fi

PORT=5201
# Prefer python3 http.server — `npx serve` often fails when the npm registry
# mirror blocks the serve package (403). SPA only needs `/` for this smoke.
python3 -m http.server "$PORT" --directory "$SOCIAL_DIST" >/dev/null 2>&1 &
SERVE_PID=$!
ready=0
for _ in $(seq 1 15); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "error: Social static server failed to listen on :$PORT" >&2
  exit 1
fi

# Ensure Chromium is available (CI / fresh machines).
if [[ ! -d "${HOME}/Library/Caches/ms-playwright" ]] \
   && [[ ! -d "${HOME}/.cache/ms-playwright" ]]; then
  echo "Installing Playwright chromium…"
  npx playwright install chromium
fi

# --- run ---
# workers=1: NodeSpawner uses fixed Social WS offsets (3130/3140); parallel
# workers collide on those ports.
PLAYWRIGHT_BASE_URL="http://127.0.0.1:$PORT" \
  npx playwright test \
    apps/social/test/e2e/web-content-browse.smoke.ts \
    apps/social/test/e2e/web-content-author-browse.smoke.ts \
    apps/social/test/e2e/web-content-author-photowall.smoke.ts \
    apps/social/test/e2e/web-content-feed-notify.smoke.ts \
    --reporter=list --timeout=120000 --workers=1
