#!/bin/bash
# EnvoyMesh Unified Setup
# One command: EnvoyMesh + built-in OpenClaw (EnvoyAI) + envoymesh channel extension.
#
# PowerShell twin: scripts/setup.ps1 (Windows). The two scripts MUST stay
# in sync step-for-step. If you change this file, update setup.ps1 in the
# same commit and vice versa.
#
# Usage: ./scripts/setup.sh
#
# After setup:
#   npm run node:dev    # starts bridge :3031 + OpenClaw gateway :18789 + EnvoyAI
#   npm run social:dev  # Social UI (terminal 2)

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ORIG_DIR="$ROOT"
cd "$ROOT"

echo "============================================"
echo "  EnvoyMesh Setup"
echo "============================================"
echo ""

# ---- Step 0: Clean stale artifacts ----
echo "[0/6] Cleaning up stale artifacts..."
# packages/openclaw is pnpm-managed separately (not an npm workspace).
if [ -d packages/openclaw/dist ] && [ ! -f packages/openclaw/dist/entry.js ]; then
  echo "  Removing incomplete packages/openclaw/dist..."
  rm -rf packages/openclaw/dist
fi
rm -rf /tmp/envoymesh-gateway-* 2>/dev/null || true
echo ""

# ---- Step 1: Node.js + pnpm ----
echo "[1/6] Checking toolchain..."
if ! command -v node &> /dev/null; then
  echo "  ✗ Node.js not found. Install Node 22+ first."
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "  ⚠ Node $NODE_MAJOR detected — Node 22+ recommended"
fi
if ! command -v pnpm &> /dev/null; then
  echo "  Installing pnpm..."
  npm install -g pnpm || { echo "  ✗ Could not install pnpm"; exit 1; }
fi
# pnpm warns on npm "workspaces" in root package.json — check version outside repo root.
echo "  ✓ node $(node -v), pnpm $(cd /tmp && pnpm -v 2>/dev/null || echo '?')"
echo ""

# ---- Step 2: EnvoyMesh dependencies ----
echo "[2/6] Installing EnvoyMesh dependencies..."
npm install
echo ""

# ---- Step 3: OpenClaw bootstrap + extension ----
echo "[3/6] OpenClaw bootstrap..."
if [ ! -f packages/openclaw/openclaw.mjs ] && [ ! -f packages/openclaw/package.json ]; then
  echo "  packages/openclaw missing — install-openclaw will clone from GitHub..."
fi
if [ -f scripts/install-openclaw.sh ]; then
  bash scripts/install-openclaw.sh || { echo "  ✗ install-openclaw.sh failed"; exit 1; }
else
  echo "  install-openclaw.sh not found — skipping"
fi

if [ ! -f packages/openclaw/package.json ]; then
  echo "  ✗ packages/openclaw missing after bootstrap — check network and re-run setup"
  exit 1
fi

echo "  Installing EnvoyMesh channel extension..."
if [ -d packages/openclaw/extensions ] && [ -d OpenClawExtension ]; then
  EXT_DIR="packages/openclaw/extensions/envoymesh"
  rm -rf "$EXT_DIR"
  cp -R OpenClawExtension "$EXT_DIR"
  rm -rf "$EXT_DIR/node_modules"
  echo "  ✓ Extension copied to $EXT_DIR"
else
  echo "  ⚠ Skipping extension copy (packages/openclaw/extensions or OpenClawExtension missing)"
fi
echo ""

# ---- Step 4: Build OpenClaw gateway ----
echo "[4/6] Building OpenClaw gateway..."
if [ -f packages/openclaw/package.json ]; then
  cd packages/openclaw

  if [ -d "../../.pnpm-store" ]; then
    echo "  Removing conflicting workspace pnpm store..."
    rm -rf ../../.pnpm-store
  fi

  echo "  pnpm install..."
  CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -5 || {
    echo "  ⚠ Retrying with clean node_modules..."
    rm -rf node_modules
    CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -5 || {
      echo "  ✗ pnpm install failed"
      cd "$ORIG_DIR"
      exit 1
    }
  }

  if [ ! -d node_modules/@pierre/diffs ]; then
    npm install @pierre/diffs --save-dev 2>&1 | tail -2 || true
  fi

  echo "  Generating channel metadata (envoymesh)..."
  # OpenClaw's metadata generator uses `git ls-files` to enumerate bundled
  # extensions. The envoymesh extension was just `cp -R`'d in and is therefore
  # untracked from OpenClaw's perspective. Stage it in a throwaway index so
  # the generator sees it WITHOUT modifying OpenClaw's git state (we don't
  # own that repo and want clean upstream upgrades).
  if [ -d extensions/envoymesh ]; then
    _oc_tmp_idx=$(mktemp)
    if GIT_INDEX_FILE="$_oc_tmp_idx" git read-tree HEAD >/dev/null 2>&1 \
        && GIT_INDEX_FILE="$_oc_tmp_idx" git add extensions/envoymesh >/dev/null 2>&1; then
      GIT_INDEX_FILE="$_oc_tmp_idx" CI=true pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts 2>&1 | tail -3 || {
        echo "  ⚠ Metadata generation failed — extension may still work at runtime"
      }
    else
      CI=true pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts 2>&1 | tail -3 || {
        echo "  ⚠ Metadata generation failed — extension may still work at runtime"
      }
    fi
    rm -f "$_oc_tmp_idx"
  else
    CI=true pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts 2>&1 | tail -3 || {
      echo "  ⚠ Metadata generation failed — extension may still work at runtime"
    }
  fi

  echo "  Building..."
  CI=true pnpm run build 2>&1 | tail -8 || {
    echo "  ⚠ Full build failed — creating tsx bootstrap..."
    mkdir -p dist
    cat > dist/entry.js << 'STUB'
export * from "../src/cli/run-main.ts";
STUB
  }

  if [ -f dist/entry.js ]; then
    echo "  ✓ dist/entry.js ready"
  else
    echo "  ✗ dist/entry.js missing — gateway will not start"
  fi

  if grep -q '"envoymesh"' src/config/bundled-channel-config-metadata.generated.ts 2>/dev/null; then
    echo "  ✓ envoymesh channel in bundled metadata"
  else
    echo "  ⚠ envoymesh not in metadata — run: cd packages/openclaw && pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts"
  fi

  # Smoke test gateway + envoymesh webhook (no bridge required for listen check)
  echo "  Smoke-testing gateway webhook..."
  GW_STATE=$(mktemp -d)
  cat > "$GW_STATE/openclaw.json" << 'EOF'
{
  "gateway": { "auth": { "mode": "none" } },
  "channels": {
    "envoymesh": {
      "enabled": true,
      "bridgeUrl": "http://127.0.0.1:3031/bridge/send",
      "webhookPath": "/webhook/envoymesh",
      "dmPolicy": "open",
      "allowedOwnerIds": ["*"]
    }
  }
}
EOF
  OPENCLAW_STATE_DIR="$GW_STATE" \
  OPENCLAW_CONFIG_PATH="$GW_STATE/openclaw.json" \
  OPENCLAW_BUNDLED_PLUGINS_DIR="$(pwd)/extensions" \
  ENVOYMESH_BRIDGE_URL="http://127.0.0.1:3031/bridge/send" \
  CI=true pnpm exec tsx openclaw.mjs gateway --port 18799 --bind loopback --auth none --allow-unconfigured &
  GW_PID=$!
  GW_OK=false
  for i in $(seq 1 45); do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:18799/webhook/envoymesh \
      -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "000")
    if [ "$CODE" != "000" ] && [ "$CODE" != "404" ]; then
      echo "  ✓ Gateway webhook responded (HTTP $CODE)"
      GW_OK=true
      break
    fi
    sleep 1
  done
  if [ "$GW_OK" = "false" ]; then
    echo "  ⚠ Webhook smoke test timed out — check packages/openclaw build logs"
  fi
  kill $GW_PID 2>/dev/null || true
  wait $GW_PID 2>/dev/null || true
  rm -rf "$GW_STATE"

  if [ ! -f node_modules/tsx/dist/cli.mjs ] || [ ! -f openclaw.mjs ]; then
    echo "  ✗ OpenClaw gateway not ready — pnpm install did not produce tsx + openclaw.mjs"
    cd "$ORIG_DIR"
    exit 1
  fi
  echo "  ✓ OpenClaw gateway ready (packages/openclaw)"

  cd "$ORIG_DIR"
else
  echo "  ✗ packages/openclaw not found — EnvoyAI will use native LLM fallback only"
  echo "    Fix: ./scripts/install-openclaw.sh"
  echo "    or: git clone --depth 1 https://github.com/openclaw/openclaw.git packages/openclaw"
fi
echo ""

# ---- Step 5: Bridge config template ----
echo "[5/6] Bridge config template..."
EXAMPLE="apps/node/data/default/bridge-config.openclaw.example.json"
if [ -f "$EXAMPLE" ]; then
  echo "  ✓ Example config: $EXAMPLE"
  echo "    assistantAgentUrl → built-in OpenClaw (EnvoyAI)  :18789/webhook/envoymesh"
  echo "    agentUrl          → Ext Agent (HomeClaw, etc.)     (your external webhook)"
  if [ ! -f apps/node/data/default/bridge-config.json ]; then
    cp "$EXAMPLE" apps/node/data/default/bridge-config.json
    echo "  ✓ Created apps/node/data/default/bridge-config.json from example"
  else
    echo "  ℹ Existing bridge-config.json kept (add assistantAgentUrl if missing)"
  fi
else
  echo "  ⚠ $EXAMPLE not found"
fi
echo ""

# ---- Step 6: Typecheck ----
echo "[6/6] TypeScript check (packages/api + apps/node)..."
npm exec -w @envoymesh/api -- tsc -p tsconfig.json 2>/dev/null && \
  npm exec -w @envoymesh/node -- tsc -p tsconfig.json 2>/dev/null && \
  echo "  ✓ Core packages typecheck OK" || \
  echo "  ⚠ Typecheck warnings — run: npm run typecheck"
echo ""

echo "============================================"
echo "  Setup Complete"
echo "============================================"
echo ""
echo "Architecture:"
echo "  EnvoyAI (built-in)  → OpenClaw gateway :18789  (auto-started by node)"
echo "  Ext Agent (bridge)  → agentUrl in bridge-config.json (HomeClaw, etc.)"
echo "  Mesh tools          → bridge :3031/bridge/execute-tool"
echo ""
echo "Start:"
echo "  npm run node:dev     # terminal 1"
echo "  npm run social:dev   # terminal 2"
echo ""
echo "Verify in node logs:"
echo "  [openclaw] Built-in agent ready (EnvoyAI)"
echo "  [bridge] HTTP on http://127.0.0.1:3031/bridge/send"
echo ""
