#!/bin/bash
# EnvoyMesh Unified Setup
# One command: EnvoyMesh + built-in OpenClaw (EnvoyAI) + envoymesh channel extension.
#
# PowerShell twin: scripts/setup.ps1 (Windows). The two scripts MUST stay
# in sync step-for-step. If you change this file, update setup.ps1 in the
# same commit and vice versa.
#
# Usage: ./scripts/setup.sh [--local /path/to/openclaw]
#                          [--skip-openclaw-build] [--skip-typecheck] [-h|--help]
#
# Flags (see docs/setup-scripts.md for the full reference):
#   --local /path/to/openclaw   Use a local OpenClaw checkout instead of
#                               cloning from GitHub (forwarded to
#                               install-openclaw.sh). Only consulted when
#                               packages/openclaw is missing.
#   --skip-openclaw-build       Skip pnpm install + build + smoke for OpenClaw
#                               (step 4). Useful for fast re-runs once the
#                               build is already verified.
#   --skip-typecheck            Skip the final TypeScript typecheck (step 6).
#   -h, --help                  Print this message and exit.
#
# After setup:
#   npm run node:dev    # starts bridge :3031 + OpenClaw gateway :18789 + EnvoyAI
#   npm run social:dev  # Social UI (terminal 2)

# Keep semantics tight: an error anywhere aborts the script, AND pipeline
# commands (e.g. `pnpm install ... 2>&1 | tail -5`) propagate the *real*
# exit code instead of `tail`'s. Without pipefail, a failing pnpm or build
# step would silently look like success and the script would march on.
set -e
set -o pipefail

# ---- CLI flags (kept symmetric with scripts/setup.ps1) ----
LOCAL_OPENCLAW_PATH=""
SKIP_OPENCLAW_BUILD=0
SKIP_TYPECHECK=0
print_usage() {
  cat <<'USAGE'
Usage: ./scripts/setup.sh [options]

Options:
  --local /path/to/openclaw   Use a local OpenClaw checkout instead of cloning
                              from GitHub (forwarded to install-openclaw.sh).
  --skip-openclaw-build       Skip pnpm install / build / smoke for OpenClaw.
  --skip-typecheck            Skip the final TypeScript typecheck pass.
  -h, --help                  Show this message and exit.
USAGE
}
while [ $# -gt 0 ]; do
  case "$1" in
    --local)
      [ $# -ge 2 ] || { echo "Missing value for --local" >&2; exit 1; }
      LOCAL_OPENCLAW_PATH="$2"; shift 2 ;;
    --skip-openclaw-build) SKIP_OPENCLAW_BUILD=1; shift ;;
    --skip-typecheck)      SKIP_TYPECHECK=1; shift ;;
    -h|--help)             print_usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; print_usage >&2; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ORIG_DIR="$ROOT"
cd "$ROOT"

echo "============================================"
echo "  EnvoyMesh Setup"
echo "============================================"
echo ""

# ---- helpers (OpenClaw readiness; keep in sync with setup.ps1) ----
# Runtime validateOpenClawTree requires a real compiled dist — a stub
# entry.js that re-exports src/ is not enough (missing dist/config/config.js).
openclaw_dist_incomplete() {
  local oc="${1:-packages/openclaw}"
  [ -d "$oc/dist" ] || return 1
  if [ ! -f "$oc/dist/config/config.js" ]; then
    return 0
  fi
  if [ -f "$oc/dist/entry.js" ] && head -n 1 "$oc/dist/entry.js" 2>/dev/null | grep -q "EnvoyMesh bootstrap"; then
    return 0
  fi
  # Legacy stub from older setup.sh (no EnvoyMesh comment, only src re-export).
  if [ -f "$oc/dist/entry.js" ] \
      && grep -q 'from "../src/cli/run-main.ts"' "$oc/dist/entry.js" 2>/dev/null \
      && [ ! -d "$oc/dist/cli" ]; then
    return 0
  fi
  return 1
}

openclaw_gateway_ready() {
  local oc="${1:-packages/openclaw}"
  [ -f "$oc/openclaw.mjs" ] || return 1
  [ -f "$oc/node_modules/tsx/dist/cli.mjs" ] || return 1
  [ -f "$oc/dist/config/config.js" ] || return 1
  [ -f "$oc/dist/entry.js" ] || return 1
  if head -n 1 "$oc/dist/entry.js" 2>/dev/null | grep -q "EnvoyMesh bootstrap"; then
    return 1
  fi
  [ -f "$oc/extensions/envoymesh/index.js" ] || return 1
  return 0
}

# Compile OpenClawExtension → packages/openclaw/extensions/envoymesh (index.js).
# Mirrors setup.ps1 Install-EnvoyMeshOpenClawExtension / stage-openclaw-envoymesh-extension.sh.
install_envoymesh_extension() {
  local oc_root="${1:-packages/openclaw}"
  local ext_src="$ROOT/OpenClawExtension"
  local ext_dir="$oc_root/extensions/envoymesh"

  if [ ! -d "$ext_src" ]; then
    echo "  ⚠ OpenClawExtension/ missing — cannot install envoymesh channel"
    return 1
  fi
  if [ ! -d "$oc_root/extensions" ]; then
    echo "  ⚠ $oc_root/extensions missing — cannot install envoymesh channel"
    return 1
  fi

  rm -rf "$ext_dir"
  cp -R "$ext_src" "$ext_dir"
  rm -rf "$ext_dir/node_modules"
  rm -f "$ext_dir"/tsconfig.json "$ext_dir"/tsconfig.*.json \
    "$ext_dir"/.oxlintrc.json "$ext_dir"/.oxfmtrc.jsonc 2>/dev/null || true
  rm -rf "$ext_dir/docs" "$ext_dir/examples" "$ext_dir/test" "$ext_dir/tests" "$ext_dir/.git" 2>/dev/null || true

  (
    cd "$ext_dir"
    ESBUILD=""
    if [ -f "$ROOT/$oc_root/node_modules/esbuild/bin/esbuild" ]; then
      ESBUILD="node $ROOT/$oc_root/node_modules/esbuild/bin/esbuild"
    elif [ -x "$ROOT/$oc_root/node_modules/.bin/esbuild" ]; then
      ESBUILD="$ROOT/$oc_root/node_modules/.bin/esbuild"
    else
      ESBUILD="npx --yes esbuild"
    fi
    # bash 3.2-safe: build argv without mapfile
    set --
    for f in ./*.ts; do
      [ -f "$f" ] || continue
      set -- "$@" "$f"
    done
    if [ -d src ]; then
      for f in src/*.ts; do
        [ -f "$f" ] || continue
        case "$(basename "$f")" in
          *.test.ts|*.e2e.test.ts|*.live.test.ts) continue ;;
        esac
        set -- "$@" "$f"
      done
    fi
    if [ "$#" -eq 0 ]; then
      echo "  ⚠ No .ts sources in $ext_dir" >&2
      exit 1
    fi
    $ESBUILD "$@" \
      --bundle=false --format=esm --platform=node \
      --outdir=. --out-extension:.js=.js --allow-overwrite \
      --log-level=warning
  ) || {
    echo "  ⚠ esbuild failed for envoymesh extension"
    return 1
  }

  find "$ext_dir" -name '*.ts' -type f -delete
  if [ -f "$ext_dir/package.json" ] && command -v node >/dev/null 2>&1; then
    # node writeFileSync = UTF-8 without BOM (safe for OpenClaw JSON.parse).
    # Keep this -e script free of `$` / `$'` — bash would expand them inside "...".
    node -e '
      const fs=require("fs");
      const p=process.argv[1];
      let s=fs.readFileSync(p,"utf8");
      s=s.replace(/\.\/index\.ts/g,"./index.js").replace(/\.\/setup-entry\.ts/g,"./setup-entry.js");
      fs.writeFileSync(p, s.replace(/\s*$/, "") + "\n");
    ' "$ext_dir/package.json"
  fi

  if [ ! -f "$ext_dir/index.js" ]; then
    echo "  ⚠ envoymesh index.js missing after compile"
    return 1
  fi

  mkdir -p "$oc_root/dist/extensions"
  rm -rf "$oc_root/dist/extensions/envoymesh"
  cp -R "$ext_dir" "$oc_root/dist/extensions/envoymesh"
  if [ -d "$oc_root/dist-runtime" ]; then
    mkdir -p "$oc_root/dist-runtime/extensions"
    rm -rf "$oc_root/dist-runtime/extensions/envoymesh"
    cp -R "$ext_dir" "$oc_root/dist-runtime/extensions/envoymesh"
  fi

  echo "  ✓ envoymesh extension compiled -> $ext_dir (+ dist/extensions mirror)"
  return 0
}

# ---- Step 0: Clean stale artifacts ----
echo "[0/6] Cleaning up stale artifacts..."
# packages/openclaw is pnpm-managed separately (not an npm workspace).
# Drop incomplete dist (missing config.js or stub entry) so re-runs rebuild.
if openclaw_dist_incomplete packages/openclaw; then
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

# Forward --local to install-openclaw.sh. If the local checkout already
# populated packages/openclaw on a previous run, install-openclaw.sh's
# "bundled found" short-circuit skips the copy — which is the right call,
# the user probably wants idempotence there.
INSTALL_OC_ARGS=()
if [ -n "$LOCAL_OPENCLAW_PATH" ]; then
  echo "  Using local OpenClaw checkout: $LOCAL_OPENCLAW_PATH"
  INSTALL_OC_ARGS=(--local "$LOCAL_OPENCLAW_PATH")
fi

if [ -f scripts/install-openclaw.sh ]; then
  if [ "${#INSTALL_OC_ARGS[@]}" -gt 0 ]; then
    bash scripts/install-openclaw.sh "${INSTALL_OC_ARGS[@]}" || { echo "  ✗ install-openclaw.sh failed"; exit 1; }
  else
  bash scripts/install-openclaw.sh || { echo "  ✗ install-openclaw.sh failed"; exit 1; }
  fi
else
  echo "  install-openclaw.sh not found — skipping"
fi

if [ ! -f packages/openclaw/package.json ]; then
  echo "  ✗ packages/openclaw missing after bootstrap — check network and re-run setup"
  exit 1
fi

# EnvoyMesh gateway spawn validates extensions/envoymesh/index.js (compiled).
# Copying OpenClawExtension/*.ts alone is not enough — compile after pnpm
# install (needs esbuild from packages/openclaw/node_modules).
echo "  EnvoyMesh channel extension will be compiled after OpenClaw pnpm install (needs esbuild)"
echo ""

# ---- Step 4: Build OpenClaw gateway ----
if [ "$SKIP_OPENCLAW_BUILD" = "1" ]; then
  echo "[4/6] Building OpenClaw gateway (SKIPPED -- --skip-openclaw-build)..."
  if ! openclaw_gateway_ready packages/openclaw; then
    echo "  ✗ OpenClaw tree incomplete after --skip-openclaw-build"
    echo "    Need dist/config/config.js + compiled extensions/envoymesh/index.js"
    echo "    Re-run without --skip-openclaw-build (or: cd packages/openclaw && pnpm run build)"
    exit 1
  fi
  echo "  ✓ OpenClaw gateway ready (packages/openclaw)"
elif [ ! -f packages/openclaw/package.json ]; then
  echo "[4/6] Building OpenClaw gateway..."
  echo "  ⚠ packages/openclaw not found — EnvoyAI will use native LLM fallback only"
  echo "    Fix: ./scripts/install-openclaw.sh"
  echo "    or:  ./scripts/setup.sh --local /path/to/openclaw"
  echo "    or:  git clone --depth 1 https://github.com/openclaw/openclaw.git packages/openclaw"
else
  echo "[4/6] Building OpenClaw gateway..."
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

  # Compile envoymesh now that esbuild is installed under packages/openclaw.
  cd "$ORIG_DIR"
  echo "  Installing EnvoyMesh channel extension (compiled index.js)..."
  install_envoymesh_extension packages/openclaw || {
    echo "  ⚠ envoymesh extension install incomplete — EnvoyAI/OpenClaw may refuse to start"
  }
  cd packages/openclaw

  echo "  Generating channel metadata (envoymesh)..."
  # OpenClaw's metadata generator uses `git ls-files` to enumerate bundled
  # extensions. The envoymesh extension was just installed and is therefore
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
  if ! CI=true pnpm run build 2>&1 | tail -8; then
    echo "  ✗ OpenClaw pnpm run build failed"
    echo "    A stub dist/entry.js is NOT enough — EnvoyAI needs dist/config/config.js."
    echo "    Fix the build error above, then re-run ./scripts/setup.sh"
    cd "$ORIG_DIR"
    exit 1
  fi

  if [ ! -f dist/config/config.js ] || [ ! -f dist/entry.js ]; then
    echo "  ✗ OpenClaw build did not produce dist/config/config.js (+ dist/entry.js)"
    echo "    EnvoyAI will refuse to start until a full build succeeds."
    cd "$ORIG_DIR"
    exit 1
  fi
  echo "  ✓ dist/entry.js + dist/config/config.js ready"

  # Re-install compiled envoymesh after OpenClaw build — `pnpm run build`
  # can wipe/refresh dist/ and leave extensions/envoymesh without index.js.
  cd "$ORIG_DIR"
  echo "  Re-staging compiled envoymesh extension after OpenClaw build..."
  install_envoymesh_extension packages/openclaw || {
    echo "  ⚠ Post-build envoymesh stage failed — check packages/openclaw/extensions/envoymesh/index.js"
  }
  cd packages/openclaw

  if grep -q '"envoymesh"' src/config/bundled-channel-config-metadata.generated.ts 2>/dev/null; then
    echo "  ✓ envoymesh channel in bundled metadata"
  else
    echo "  ⚠ envoymesh not in metadata — run: cd packages/openclaw && pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts"
  fi

  # ---- Smoke test gateway + envoymesh webhook ----
  # Pick a free loopback port (random in 18000-22999) instead of hard-coding
  # 18799 — the historical port could already be occupied by a stray dev
  # server, which would give us a false-positive response.
  # The trap below guarantees the gateway is killed and GW_STATE is removed
  # on every exit path: Ctrl-C, error, or normal completion.
  echo "  Smoke-testing gateway webhook..."
  GW_STATE=$(mktemp -d)
  GW_STATE_CREATED=1
  GW_PID=""
  cleanup_smoke() {
    # Tear down the background gateway and the temp state dir. Idempotent.
    if [ -n "${GW_PID:-}" ] && kill -0 "$GW_PID" 2>/dev/null; then
      kill "$GW_PID" 2>/dev/null || true
      wait "$GW_PID" 2>/dev/null || true
    fi
    if [ -n "${GW_STATE_CREATED:-}" ] && [ -d "${GW_STATE:-}" ]; then
      rm -rf "$GW_STATE" 2>/dev/null || true
    fi
  }
  trap cleanup_smoke EXIT INT TERM

  SMOKE_PORT=""
  for ((_probe = 0; _probe < 25; _probe++)); do
    _candidate=$(( 18000 + RANDOM % 5000 ))
    # bash /dev/tcp fails (non-zero subshell exit) when nothing is listening.
    if ! (exec 3<>/dev/tcp/127.0.0.1/"$_candidate") 2>/dev/null; then
      SMOKE_PORT="$_candidate"
      break
    fi
  done

  if [ -z "$SMOKE_PORT" ]; then
    echo "  ⚠ Could not find a free loopback port after 25 attempts — skipping smoke test"
  else
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
    CI=true pnpm exec tsx openclaw.mjs gateway --port "$SMOKE_PORT" --bind loopback --auth none --allow-unconfigured &
    GW_PID=$!
    GW_OK=false
    # C-style for loop works in bash 3.2+; `seq 1 45` is not guaranteed on
    # stock macOS (Xcode CLT only) so we avoid it for portability.
    for ((i = 1; i <= 45; i++)); do
      CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$SMOKE_PORT/webhook/envoymesh" \
        -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "000")
      if [ "$CODE" != "000" ] && [ "$CODE" != "404" ]; then
        echo "  ✓ Gateway webhook responded (HTTP $CODE on port $SMOKE_PORT)"
        GW_OK=true
        break
      fi
      sleep 1
    done
    if [ "$GW_OK" = "false" ]; then
      echo "  ⚠ Webhook smoke test timed out — check packages/openclaw build logs"
    fi
  fi
  cleanup_smoke
  GW_PID=""
  GW_STATE_CREATED=""
  trap - EXIT INT TERM

  cd "$ORIG_DIR"
  if ! openclaw_gateway_ready packages/openclaw; then
    echo "  ✗ OpenClaw gateway not ready — need compiled dist/config/config.js,"
    echo "    dist/entry.js (not a stub), extensions/envoymesh/index.js, tsx, openclaw.mjs"
    exit 1
  fi
  echo "  ✓ OpenClaw gateway ready (packages/openclaw)"
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
if [ "$SKIP_TYPECHECK" = "1" ]; then
  echo "[6/6] TypeScript check (SKIPPED -- --skip-typecheck)..."
else
  echo "[6/6] TypeScript check (packages/api + apps/node)..."
  # pipefail is now set, so tsc's exit code propagates through `2>/dev/null`.
  npm exec -w @envoymesh/api -- tsc -p tsconfig.json 2>&1 | tail -3 && \
    npm exec -w @envoymesh/node -- tsc -p tsconfig.json 2>&1 | tail -3 && \
    echo "  ✓ Core packages typecheck OK" || \
    echo "  ⚠ Typecheck warnings — run: npm run typecheck"
fi
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