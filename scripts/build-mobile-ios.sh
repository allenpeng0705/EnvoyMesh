#!/bin/bash
# Build and deploy the EnvoyMesh mobile app to a connected iOS device.
# Run from the repo root.

set -euo pipefail

echo "=== 1. Cleaning old dist ==="
rm -rf apps/mobile/dist apps/social/dist

echo ""
echo "=== 2. Building mobile app (TypeScript + Vite) ==="
npm run build -w @envoymesh/mobile

echo ""
echo "=== 3. Syncing Capacitor (copies web assets → ios/) ==="
cd apps/mobile
npx cap sync ios

echo ""
echo "=== 4. Running pod install ==="
cd ios/App
pod install
cd ../..

echo ""
echo "=== 5. Opening Xcode ==="
npx cap open ios

echo ""
echo "Done. In Xcode: select your device, then Product → Run (⌘R)"
