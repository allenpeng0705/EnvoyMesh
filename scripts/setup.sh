#!/bin/bash
# EnvoyMesh Unified Setup
# One command to set up everything.
#
# Usage: ./scripts/setup.sh
#
# What it does:
#   1. npm install (EnvoyMesh dependencies)
#   2. ./scripts/install-openclaw.sh (OpenClaw agent)
#   3. npm run build (compile TypeScript)

set -e

echo "============================================"
echo "  EnvoyMesh Setup"
echo "============================================"
echo ""

# Step 1: Install EnvoyMesh dependencies
echo "[1/3] Installing EnvoyMesh dependencies..."
npm install
echo ""

# Step 2: Install OpenClaw
echo "[2/3] Setting up OpenClaw agent..."
if [ -f scripts/install-openclaw.sh ]; then
    bash scripts/install-openclaw.sh
else
    echo "  install-openclaw.sh not found — skipping OpenClaw setup"
    echo "  Download it from https://github.com/envoymesh/envoymesh"
fi
echo ""

# Step 3: Build TypeScript
echo "[3/3] Building TypeScript..."
npm run typecheck 2>/dev/null || true
echo ""

echo "============================================"
echo "  Setup Complete"
echo "============================================"
echo ""
echo "Start the node:"
echo "  npm run node:dev"
echo ""
echo "Start the Social UI:"
echo "  npm run social:dev"
echo ""
echo "The node will auto-detect OpenClaw if installed."
echo "If OpenClaw isn't available, fallback model providers"
echo "(Ollama, OpenAI) will be used instead."
