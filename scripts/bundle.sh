#!/usr/bin/env bash
# =============================================================================
# EnvoyMesh Bundle Builder (macOS / Linux)
#
# Produces a self-contained, portable EnvoyMesh bundle that includes:
#   * EnvoyMesh node  (built from apps/node)
#   * Social UI       (built from apps/social)
#   * OpenClaw gateway (built from packages/openclaw, source or prebuilt)
#   * Node.js runtime (fetched per-platform sidecar)
#   * Cross-platform runtime orchestrator (bin/envoymesh-bundle.mjs)
#   * Tiny launchers (./start.sh, ./start.bat) that exec the orchestrator
#
# And packages the bundle as a portable .tar.gz archive (headless runtime).
# Native installers (.dmg, .deb, .exe) are produced by scripts/build-desktop.sh
# (Tauri desktop app), not by this script.
#
# Usage: ./scripts/bundle.sh [--out <dir>] [--version <ver>] [--skip-typecheck]
#                          [--skip-openclaw-build] [--use-openclaw-binary]
#                          [--no-bundled-node] [-h|--help]
#
# Output (default):
#   release/envoymesh-{version}-{platform}-{arch}/       staged directory
#   release/envoymesh-{version}-{platform}-{arch}.tar.gz portable archive
#
# PowerShell twin: scripts/bundle.ps1 (Windows). The two MUST stay in sync —
# if you change one, change the other in the same commit. See
# docs/bundle-scripts.md for the contract and the full flag reference.
#
# Sister script: scripts/setup.sh bootstraps the dev environment. Bundle is
# the "release" counterpart and assumes setup.sh has been run, but it
# re-verifies prereqs in case you call it from a CI machine.
# =============================================================================

set -e
set -o pipefail

# ---- CLI flag parsing -----------------------------------------------------

OUT_DIR="release"
VERSION=""
SKIP_TYPECHECK=0
SKIP_OPENCLAW_BUILD=0
USE_OPENCLAW_BINARY=0
NO_BUNDLED_NODE=0

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/bundle.sh [options]

Options:
  --out <dir>               Output directory (default: release/)
  --version <ver>           Bundle version (default: from package.json)
  --skip-typecheck          Skip tsc -b before bundling
  --skip-openclaw-build     Use existing packages/openclaw/dist if present;
                           don't run pnpm install / pnpm build
  --use-openclaw-binary     Fetch a prebuilt OpenClaw binary instead of
                           building from source (faster; uses
                           scripts/fetch-openclaw-sidecar.sh)
  --no-bundled-node         Skip the Node.js sidecar fetch. The bundle will
                            require Node 22+ on the target machine.
  -h, --help                Show this message and exit

Output (default):
  release/envoymesh-{version}-{platform}-{arch}/       staged directory
  release/envoymesh-{version}-{platform}-{arch}.tar.gz portable archive
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --out)                [ $# -ge 2 ] || { echo "Missing value for --out" >&2; exit 1; }
                          OUT_DIR="$2"; shift 2 ;;
    --version)            [ $# -ge 2 ] || { echo "Missing value for --version" >&2; exit 1; }
                          VERSION="$2"; shift 2 ;;
    --skip-typecheck)     SKIP_TYPECHECK=1; shift ;;
    --skip-openclaw-build) SKIP_OPENCLAW_BUILD=1; shift ;;
    --use-openclaw-binary) USE_OPENCLAW_BINARY=1; shift ;;
    --no-bundled-node)    NO_BUNDLED_NODE=1; shift ;;
    --skip-installer|--no-archive)
                          echo "  ⚠ $1 is deprecated — bundle.sh only produces .tar.gz now." >&2
                          shift ;;
    -h|--help)            print_usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; print_usage >&2; exit 1 ;;
  esac
done

# ---- resolve repo root ----------------------------------------------------

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ---- platform detection ---------------------------------------------------

case "$(uname -s)" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *) echo "Unsupported platform: $(uname -s). Use scripts/bundle.ps1 on Windows." >&2
     exit 1 ;;
esac

case "$(uname -m)" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

# ---- header ---------------------------------------------------------------

echo "============================================"
echo "  EnvoyMesh Bundle Builder"
echo "  Platform: $PLATFORM-$ARCH"
echo "============================================"
echo ""

# ---- version --------------------------------------------------------------

if [ -z "$VERSION" ]; then
  VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "dev")"
fi
echo "Version: $VERSION"
echo ""

# ---- toolchain check ------------------------------------------------------

echo "[1/8] Checking toolchain..."
if ! command -v node &> /dev/null; then
  echo "  ✗ Node.js not found. Install Node 22+ first." >&2
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
echo "  ✓ node $(node -v), pnpm $(cd /tmp && pnpm -v 2>/dev/null || echo '?')"
echo ""

# ---- npm install (idempotent) ---------------------------------------------

if [ ! -d "node_modules" ]; then
  echo "[2/8] Installing EnvoyMesh dependencies..."
  npm install
else
  echo "[2/8] EnvoyMesh dependencies already installed (skipping)"
fi
echo ""

# ---- OpenClaw bootstrap (delegates to install-openclaw.sh) ----------------

echo "[3/8] OpenClaw bootstrap..."
if [ ! -f "packages/openclaw/openclaw.mjs" ] && [ ! -f "packages/openclaw/package.json" ]; then
  echo "  packages/openclaw missing — install-openclaw.sh will clone from GitHub"
fi
if [ -f scripts/install-openclaw.sh ]; then
  bash scripts/install-openclaw.sh || { echo "  ✗ install-openclaw.sh failed" >&2; exit 1; }
else
  echo "  ⚠ install-openclaw.sh not found — skipping"
fi
echo ""

# ---- OpenClaw build -------------------------------------------------------

if [ "$USE_OPENCLAW_BINARY" = "1" ]; then
  echo "[4/8] Fetching OpenClaw prebuilt binary..."
  if [ -f scripts/fetch-openclaw-sidecar.sh ]; then
    bash scripts/fetch-openclaw-sidecar.sh
  else
    echo "  ✗ scripts/fetch-openclaw-sidecar.sh not found" >&2
    exit 1
  fi
  echo "  ✓ OpenClaw binary fetched"
elif [ "$SKIP_OPENCLAW_BUILD" = "1" ]; then
  echo "[4/8] OpenClaw build (SKIPPED -- --skip-openclaw-build)..."
  if [ ! -f "packages/openclaw/openclaw.mjs" ] && [ ! -f "packages/openclaw/dist/entry.js" ]; then
    echo "  ✗ packages/openclaw not built and --skip-openclaw-build was set." >&2
    echo "    Drop --skip-openclaw-build, or run scripts/setup.sh first." >&2
    exit 1
  fi
else
  echo "[4/8] Building OpenClaw..."
  cd "$ROOT/packages/openclaw"
  if [ -d "$ROOT/packages/openclaw/dist" ] && [ ! -f "$ROOT/packages/openclaw/dist/entry.js" ]; then
    echo "  Removing incomplete dist..."
    rm -rf "$ROOT/packages/openclaw/dist"
  fi

  echo "  pnpm install..."
  CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -5 || {
    echo "  ⚠ Retrying with clean node_modules..."
    rm -rf node_modules
    CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -5 || {
      echo "  ✗ pnpm install failed" >&2
      cd "$ROOT"
      exit 1
    }
  }

  if [ ! -d "node_modules/@pierre/diffs" ]; then
    echo "  Installing @pierre/diffs (fallback)..."
    npm install @pierre/diffs --save-dev 2>&1 | tail -2 || true
  fi

  echo "  Generating channel metadata (envoymesh)..."
  if [ -d "extensions/envoymesh" ]; then
    _oc_tmp_idx=$(mktemp)
    if GIT_INDEX_FILE="$_oc_tmp_idx" git read-tree HEAD >/dev/null 2>&1 \
        && GIT_INDEX_FILE="$_oc_tmp_idx" git add extensions/envoymesh >/dev/null 2>&1; then
      GIT_INDEX_FILE="$_oc_tmp_idx" CI=true pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts 2>&1 | tail -3 || \
        echo "  ⚠ Metadata generation failed — extension may still work at runtime"
    else
      CI=true pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts 2>&1 | tail -3 || \
        echo "  ⚠ Metadata generation failed — extension may still work at runtime"
    fi
    rm -f "$_oc_tmp_idx"
  else
    CI=true pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts 2>&1 | tail -3 || \
      echo "  ⚠ Metadata generation failed — extension may still work at runtime"
  fi

  echo "  Building..."
  CI=true pnpm run build 2>&1 | tail -8 || {
    echo "  ⚠ Full build failed — creating tsx bootstrap..."
    mkdir -p dist
    cat > dist/entry.js << 'STUB'
export * from "../src/cli/run-main.ts";
STUB
  }
  if [ -f "dist/entry.js" ]; then
    echo "  ✓ dist/entry.js ready"
  else
    echo "  ✗ dist/entry.js missing — gateway will not start" >&2
    cd "$ROOT"
    exit 1
  fi

  # Build is done — NOW it's safe to drop dev deps from node_modules
  # (typescript, vitest, playwright, @types/*, etc.). Pruning earlier would
  # remove the build tools (e.g. `tsdown`) and break the step above.
  echo "  Pruning dev dependencies from node_modules..."
  CI=true pnpm prune --prod 2>&1 | tail -5 || \
    echo "  ⚠ pnpm prune failed — bundle will include dev deps (still works, just larger)"

  cd "$ROOT"
fi
echo ""

# ---- EnvoyMesh node build -------------------------------------------------

echo "[5/8] Building EnvoyMesh node..."
if [ ! -d "apps/node/dist" ] || [ ! -f "apps/node/dist/src/index.js" ]; then
  if [ "$SKIP_TYPECHECK" = "1" ]; then
    npm run node:build 2>&1 | tail -10 || { echo "  ✗ EnvoyMesh node build failed" >&2; exit 1; }
  else
    npm run typecheck 2>&1 | tail -10
    npm run node:build 2>&1 | tail -10 || { echo "  ✗ EnvoyMesh node build failed" >&2; exit 1; }
  fi
else
  echo "  apps/node/dist already present (skipping rebuild). Pass --skip-typecheck=false to force."
fi
echo ""

# ---- Social UI build ------------------------------------------------------

echo "[6/8] Building Social UI..."
if [ ! -d "apps/social/dist" ]; then
  (cd apps/social && npm run build 2>&1 | tail -10) || {
    echo "  ⚠ Social UI build failed — bundle will run without the UI"
  }
else
  echo "  apps/social/dist already present (skipping rebuild)"
fi
echo ""

# ---- stage bundle ---------------------------------------------------------

BUNDLE_NAME="envoymesh-${VERSION}-${PLATFORM}-${ARCH}"
BUNDLE_DIR="$ROOT/$OUT_DIR/$BUNDLE_NAME"
echo "[7/8] Staging bundle into $BUNDLE_DIR..."

rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/bin"
mkdir -p "$BUNDLE_DIR/node"
mkdir -p "$BUNDLE_DIR/openclaw"
mkdir -p "$BUNDLE_DIR/social"

# EnvoyMesh node (dist + workspace packages + production npm deps)
echo "  Staging EnvoyMesh node runtime..."
bash "$ROOT/scripts/stage-bundle-node-runtime.sh" "$BUNDLE_DIR/node"

# OpenClaw — prefer the source tree if it has openclaw.mjs, else the binary
echo "  Copying OpenClaw..."
if [ -f "packages/openclaw/openclaw.mjs" ] || [ -f "packages/openclaw/dist/entry.js" ]; then
  # The OpenClaw source tree carries its own apps/, docs/, ui/, test/,
  # packages/, dev configs, etc. — none of which are needed at gateway
  # runtime. Exclude them so the bundle isn't 2+ GB.
  # Also exclude src/ (we ship dist/), qa/, .github/, .vscode/, oxlint/oxfmt
  # configs, tsconfig*, vitest.config.ts, tsdown.config.ts, and *.md docs.
  # Runtime files we DO keep: dist/, dist-runtime/, extensions/, node_modules/
  # (already pruned above), openclaw.mjs, package.json, npm-shrinkwrap.json,
  # patches/, skills/, security/. If the runtime needs something else from
  # this tree, add it to this exclude list AND document the choice in
  # docs/bundle-scripts.md.
  rsync -a \
    --exclude=.git --exclude=.gitattributes --exclude=.gitignore \
    --exclude=.turbo --exclude=target \
    --exclude=.agents --exclude=.artifacts --exclude=.claude \
    --exclude=.github --exclude=.vscode --exclude=.npmrc \
    --exclude=.oxfmtrc.jsonc --exclude=.oxlintrc.json \
    --exclude=.crabbox.yaml --exclude=.dockerignore --exclude=.semgrepignore \
    --exclude=/apps --exclude=/docs --exclude=/ui --exclude=/scripts \
    --exclude=/src --exclude=/qa --exclude=/test --exclude=/packages \
    --exclude=/config --exclude=/data --exclude=/deploy --exclude=/git-hooks \
    --exclude=docker-compose.yml --exclude=Dockerfile --exclude=fly.toml \
    --exclude=appcast.xml \
    --exclude=tsconfig.json --exclude='tsconfig.*.json' \
    --exclude=vitest.config.ts --exclude=tsdown.config.ts \
    --exclude='*.yaml' --exclude='*.yml' \
    --exclude=LICENSE --exclude=README.md \
    --exclude=CHANGELOG.md --exclude=CONTRIBUTING.md \
    --exclude=AGENTS.md --exclude=CLAUDE.md \
    --exclude=VISION.md --exclude=THIRD_PARTY_NOTICES.md --exclude=SECURITY.md \
    --exclude=.env.example \
    --include=/dist/config --include='/dist/config/**' \
    "$ROOT/packages/openclaw/" "$BUNDLE_DIR/openclaw/" 2>/dev/null \
    || cp -R "$ROOT/packages/openclaw/." "$BUNDLE_DIR/openclaw/"
  # Always re-include node_modules (rsync excluded it above). It IS needed
  # at runtime for OpenClaw's deps.
  if [ -d "$ROOT/packages/openclaw/node_modules" ]; then
    cp -R "$ROOT/packages/openclaw/node_modules" "$BUNDLE_DIR/openclaw/"
  fi
else
  # Binary fallback — copy whatever fetch-openclaw-sidecar.sh produced
  BINARY_DIR="$ROOT/apps/tauri/src-tauri/resources/openclaw"
  if [ -d "$BINARY_DIR" ]; then
    cp -R "$BINARY_DIR/." "$BUNDLE_DIR/openclaw/"
  else
    echo "  ✗ No OpenClaw source or binary found in packages/openclaw or $BINARY_DIR" >&2
    exit 1
  fi
fi

# Social UI
if [ -d "apps/social/dist" ]; then
  echo "  Copying Social UI..."
  cp -R "apps/social/dist" "$BUNDLE_DIR/social/"
# apps/social's vite.config.ts sets `root: "src"`, so `vite build` actually
# writes to apps/social/src/dist/. The dual-path check below handles both.
elif [ -d "apps/social/src/dist" ]; then
  echo "  Copying Social UI (from src/dist)..."
  cp -R "apps/social/src/dist" "$BUNDLE_DIR/social/dist"
  cp -R "apps/social/src" "$BUNDLE_DIR/social/"  # index.html + assets
fi

# EnvoyMesh icons (shared with Tauri desktop builds)
ICON_SRC="$ROOT/apps/tauri/src-tauri/icons"
if [ -d "$ICON_SRC" ]; then
  echo "  Copying EnvoyMesh icons..."
  mkdir -p "$BUNDLE_DIR/icons"
  [ -f "$ICON_SRC/icon.icns" ] && cp "$ICON_SRC/icon.icns" "$BUNDLE_DIR/icons/envoymesh.icns"
  [ -f "$ICON_SRC/icon.ico" ] && cp "$ICON_SRC/icon.ico" "$BUNDLE_DIR/icons/envoymesh.ico"
  if [ -f "$ICON_SRC/icon.png" ]; then
    cp "$ICON_SRC/icon.png" "$BUNDLE_DIR/icons/envoymesh.png"
  elif [ -f "$ICON_SRC/128x128@2x.png" ]; then
    cp "$ICON_SRC/128x128@2x.png" "$BUNDLE_DIR/icons/envoymesh.png"
  fi
fi

# Runtime orchestrator
echo "  Copying runtime orchestrator..."
cp "$ROOT/bin/envoymesh-bundle.mjs" "$BUNDLE_DIR/bin/"
chmod +x "$BUNDLE_DIR/bin/envoymesh-bundle.mjs"

# Launchers
cat > "$BUNDLE_DIR/start.sh" << 'LAUNCH'
#!/usr/bin/env bash
# Launcher for an EnvoyMesh bundle.
# Resolves the bundled node binary and execs the orchestrator.
set -e
BUNDLE_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$BUNDLE_DIR/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
    echo "[bundle] NOTE: bundled node missing — using system node ($(node -v))" >&2
  else
    echo "[bundle] ERROR: no node found. Build with --bundled-node, or install Node 22+ on the target." >&2
    exit 1
  fi
fi
exec "$NODE_BIN" "$BUNDLE_DIR/bin/envoymesh-bundle.mjs" "$@"
LAUNCH
chmod +x "$BUNDLE_DIR/start.sh"

cat > "$BUNDLE_DIR/start.bat" << 'LAUNCH_BAT'
@echo off
REM Launcher for an EnvoyMesh bundle (Windows).
setlocal
set "BUNDLE_DIR=%~dp0"
set "NODE_BIN=%BUNDLE_DIR%bin\node.exe"
if not exist "%NODE_BIN%" (
  where node >nul 2>&1
  if %ERRORLEVEL% EQU 0 (
    for /f "delims=" %%i in ('where node') do set "NODE_BIN=%%i"
    echo [bundle] NOTE: bundled node missing - using system node 1>&2
  ) else (
    echo [bundle] ERROR: no node found. Build with --bundled-node, or install Node 22+ on the target. 1>&2
    exit /b 1
  )
)
"%NODE_BIN%" "%BUNDLE_DIR%bin\envoymesh-bundle.mjs" %*
endlocal
LAUNCH_BAT

# Bundle README + VERSION
cat > "$BUNDLE_DIR/README.md" << README
# EnvoyMesh Bundle ($VERSION)

Built: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
Platform: $PLATFORM-$ARCH

## Run

\`\`\`
# mac / linux
./start.sh

# windows
start.bat
\`\`\`

The launcher will start:
1. The bundled OpenClaw gateway on port 18789.
2. The bundled EnvoyMesh node (which connects to the gateway over the bridge URL).

Open \`var/\` for runtime state (profile, openclaw state, logs).

## Config

Edit \`node/envoymesh.node.example.yaml\` and pass it to the node via
\`ENVOYMESH_CONFIG\`. Or set env vars directly:

\`\`\`
ENVOYMESH_BRIDGE_PORT=3031 \\
ENVOYMESH_GATEWAY_PORT=18789 \\
ENVOYMESH_PROFILE=\$(pwd)/var/profile \\
./start.sh
\`\`\`

## What's inside

| Path | What |
| --- | --- |
| \`bin/envoymesh-bundle.mjs\` | Cross-platform runtime orchestrator |
| \`bin/node\` | Bundled Node.js (omit if built with \`--no-bundled-node\`) |
| \`node/\` | Compiled EnvoyMesh node + workspace packages |
| \`openclaw/\` | Built OpenClaw gateway + envoymesh channel extension |
| \`social/dist/\` | Built Social UI (static) |
| \`start.sh\` / \`start.bat\` | Launchers |
README

echo "$VERSION" > "$BUNDLE_DIR/VERSION"
echo "  ✓ Staged at $BUNDLE_DIR"

# ---- Node sidecar (unless suppressed) ------------------------------------

if [ "$NO_BUNDLED_NODE" = "1" ]; then
  echo "  ⚠ --no-bundled-node set — bundle is NOT self-contained."
  echo "    Target machine must have Node 22+ on PATH for the .app to launch."
  echo "    Re-run without --no-bundled-node to ship a self-contained bundle."
else
  echo "  Fetching Node.js sidecar..."
  NODE_VERSION="$(node -p "process.versions.node")"
  case "$PLATFORM" in
    macos) NODE_PLATFORM="darwin" ;;
    linux) NODE_PLATFORM="linux" ;;
  esac
  NODE_ARCHIVE="node-v${NODE_VERSION}-${NODE_PLATFORM}-${ARCH}.tar.gz"
  NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"

  NODE_TMP="$(mktemp -d)"
  trap 'rm -rf "$NODE_TMP"' EXIT
  if curl -fsSL --max-time 120 "$NODE_URL" -o "$NODE_TMP/$NODE_ARCHIVE" 2>&1 | tail -3; then
    tar -xzf "$NODE_TMP/$NODE_ARCHIVE" -C "$NODE_TMP"
    install -m 755 "$NODE_TMP/node-v${NODE_VERSION}-${NODE_PLATFORM}-${ARCH}/bin/node" "$BUNDLE_DIR/bin/node"
    echo "  ✓ Bundled node: $("$BUNDLE_DIR/bin/node" --version) at $BUNDLE_DIR/bin/node"
    echo "    Bundle is self-contained — no Node.js install required on the target."
  else
    echo "  ✗ Failed to fetch $NODE_URL"
    echo "    The bundle is NOT self-contained. Re-run with network access,"
    echo "    or use --no-bundled-node if you know the target has Node 22+."
    rm -rf "$BUNDLE_DIR/bin/node"
  fi
fi
echo ""

# ---- portable archive ---------------------------------------------------

ARCHIVE_PATH=""
echo "[8/8] Creating portable archive..."
(cd "$ROOT/$OUT_DIR" && tar -czf "${BUNDLE_NAME}.tar.gz" "$BUNDLE_NAME")
ARCHIVE_PATH="$ROOT/$OUT_DIR/${BUNDLE_NAME}.tar.gz"
ARCHIVE_SIZE="$(du -h "$ARCHIVE_PATH" 2>/dev/null | awk '{print $1}')"
echo "  ✓ $ARCHIVE_PATH ($ARCHIVE_SIZE)"
echo ""

# ---- summary --------------------------------------------------------------

echo "============================================"
echo "  Bundle Complete"
echo "============================================"
echo ""
echo "  Directory:   $BUNDLE_DIR"
echo "  Archive:     $ARCHIVE_PATH"
echo ""
echo "Extract and run:"
echo "  tar -xzf \"$ARCHIVE_PATH\""
echo "  cd \"$BUNDLE_NAME\""
echo "  ./start.sh"
echo ""
echo "For a desktop app with UI, build with ./scripts/build-desktop.sh instead."
echo ""
