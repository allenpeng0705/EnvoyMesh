#!/bin/bash
# Tauri Desktop App Builder
# Builds EnvoyMesh.app (.dmg on macOS), .AppImage/.deb (Linux)
# with OpenClaw + Node.js bundled inside (no separate install for end users).
#
# Feature packaging notes (family network / push / EnvoyGo l10n):
#   - Family network: ships in compiled apps/node + Social UI — no extra assets.
#   - Push (iOS APNs + Android FCM for EnvoyGo): stage-tauri-push-credentials.sh
#     copies repo-root push-config.json + AuthKey_LKPCR48WHW.p8 +
#     serviceAccountKey.json into resources/node/ after node staging.
#     Default REQUIRE_PUSH_CREDENTIALS=1 — build fails if those secrets are
#     missing when push-config.json is present (so installed home nodes can
#     notify EnvoyGo). Set REQUIRE_PUSH_CREDENTIALS=0 to allow packaging
#     without push (CI / machines without keys).
#   - EnvoyGo localization is Flutter-only (apps/envoygo) — not part of this
#     desktop bundle; Social i18n locales are included via npm run social:build.
#
# Windows builds are NOT supported by this script — use scripts/build-desktop.ps1
# on a Windows host. Cross-compiling Tauri to x86_64-pc-windows-msvc from macOS
# or Linux requires xwin + lld + MSVC header splicing, which is fragile and
# out of scope for this project.
#
# Usage: ./scripts/build-desktop.sh [macos|linux|all]
#
# Output (copied from Cargo target dir into the repo):
#   release/envoymesh-desktop-{version}-macos-{arch}.dmg
#   release/envoymesh-desktop-{version}-linux-{arch}.deb
#   release/envoymesh-desktop-{version}-linux-{arch}.AppImage
#   release/envoymesh-desktop-{version}-{platform}-{arch}/   (folder with all of the above)
#
# Slim / Full / default presets (Phase 49 — Pi optional on Windows):
#   default     Uses tauri.conf.json           — includes Pi + OpenClaw + Kubo.
#               Linux DMG/Deb/AppImage are always full builds in this script
#               (slim is a Windows-specific escape hatch for the NSIS 2 GB cap).
#
#   STAGE_PI_BUNDLE=0
#               Skip Pi staging only (Node/OpenClaw/EnvoyMesh node still stage),
#               then build with tauri.conf.slim.json. Mirrors
#               build-desktop.ps1 -SkipPi. Never use this to skip OpenClaw.
#
#   STAGE_PI_BUNDLE=1
#               Force re-fetch of Pi even when a matching version is cached
#               (passed through to stage-tauri-pi-bundle.sh).
#
#   Slim/full entry points for Windows live in apps/tauri/package.json:
#     npm run build:win        → tauri.conf.slim.json   (mirrors PS -SkipPi)
#     npm run build:win:full   → tauri.conf.full.json
#     npm run build            → tauri.conf.json        (default)
#
#   This script (mac/linux) defaults to the full preset. Set STAGE_PI_BUNDLE=0
#   for a slim build, or use the package.json slim scripts directly.
#
# Pi pin override (advanced): export ENVOYMESH_PI_VERSION=<version> to
#   override the pinned 0.82.1 default. fetch-pi-sidecar.sh,
#   stage-tauri-pi-bundle.sh, and the PowerShell twin all honour it.
#
# Prerequisites:
#   macOS: Xcode Command Line Tools
#   Linux: libwebkit2gtk-4.1-dev, libgtk-3-dev, etc.

set -euo pipefail

TARGET="${1:-all}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${OUT_DIR:-release}"
TAURI_TARGET_ROOT="${PROJECT_DIR}/apps/tauri/src-tauri/target"
VERSION="$(node -p "require('${PROJECT_DIR}/package.json').version" 2>/dev/null || echo dev)"

echo "============================================"
echo "  EnvoyMesh Desktop Builder (Tauri)"
echo "  Version: ${VERSION}"
echo "============================================"
echo ""

# Keep @envoymesh/* dependency pins in lockstep with VERSION. Stale pins
# make npm fetch the public registry and 404 on private workspace packages.
echo "Syncing workspace package versions..."
node "${PROJECT_DIR}/scripts/sync-version.mjs"
echo ""

file_mtime() {
  local f="$1"
  if stat -f '%m' "$f" >/dev/null 2>&1; then
    stat -f '%m' "$f"
  else
    stat -c '%Y' "$f"
  fi
}

# Return the newest file whose path matches a glob under TAURI_TARGET_ROOT.
newest_file() {
  local pattern="$1"
  local best="" best_m=0
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    local m
    m="$(file_mtime "$f")"
    if [ "$m" -gt "$best_m" ]; then
      best_m="$m"
      best="$f"
    fi
  done < <(find "$TAURI_TARGET_ROOT" -path "$pattern" -type f 2>/dev/null)
  [ -n "$best" ] && echo "$best"
}

# Return the newest directory matching a path suffix (e.g. .../EnvoyMesh.app).
newest_dir() {
  local suffix="$1"
  local best="" best_m=0
  while IFS= read -r d; do
    [ -d "$d" ] || continue
    local probe="$d"
    [ -f "$d/Contents/Info.plist" ] && probe="$d/Contents/Info.plist"
    local m
    m="$(file_mtime "$probe")"
    if [ "$m" -gt "$best_m" ]; then
      best_m="$m"
      best="$d"
    fi
  done < <(find "$TAURI_TARGET_ROOT" -path "$suffix" -type d 2>/dev/null)
  [ -n "$best" ] && echo "$best"
}

arch_from_rust_target() {
  local path="$1"
  case "$path" in
    *universal-apple-darwin*) echo "universal" ;;
    *aarch64-apple-darwin*|*aarch64-unknown-linux*) echo "arm64" ;;
    *x86_64-apple-darwin*|*x86_64-unknown-linux*|*x86_64-pc-windows*) echo "x64" ;;
    *) echo "unknown" ;;
  esac
}

artifact_kind() {
  local f="$1"
  case "$f" in
    *.AppImage) echo "AppImage" ;;
    *.deb) echo "deb" ;;
    *.dmg) echo "dmg" ;;
    *.exe) echo "exe" ;;
    *.msi) echo "msi" ;;
    *) echo "${f##*.}" ;;
  esac
}

# Copy the newest Tauri bundle artifacts (one per pattern) into ${PROJECT_DIR}/${OUT_DIR}/.
publish_desktop_release() {
  local platform="$1"
  shift
  local patterns=("$@")

  local reference="" arch="" 
  for pattern in "${patterns[@]}"; do
    local f
    f="$(newest_file "$pattern")"
    if [ -n "$f" ]; then
      reference="$f"
      arch="$(arch_from_rust_target "$f")"
      break
    fi
  done

  if [ -z "$reference" ]; then
    echo "  ⚠ No ${platform} installer found under ${TAURI_TARGET_ROOT}" >&2
    return 1
  fi

  local base="envoymesh-desktop-${VERSION}-${platform}-${arch}"
  local dest="${PROJECT_DIR}/${OUT_DIR}/${base}"
  local copied=0

  rm -rf "$dest"
  mkdir -p "$dest"

  echo "  Publishing desktop release → ${PROJECT_DIR}/${OUT_DIR}/"

  for pattern in "${patterns[@]}"; do
    local f kind out
    f="$(newest_file "$pattern")"
    [ -n "$f" ] || continue
    kind="$(artifact_kind "$f")"
    out="${PROJECT_DIR}/${OUT_DIR}/${base}.${kind}"
    cp -f "$f" "$dest/$(basename "$f")"
    cp -f "$f" "$out"
    echo "  ✓ ${OUT_DIR}/${base}.${kind} ($(du -h "$out" | awk '{print $1}'))"
    copied=$((copied + 1))
  done

  case "$platform" in
    macos)
      local app
      app="$(newest_dir '*/release/bundle/macos/EnvoyMesh.app')"
      if [ -n "$app" ]; then
        cp -R "$app" "$dest/EnvoyMesh.app"
        echo "  ✓ ${OUT_DIR}/${base}/EnvoyMesh.app ($(du -sh "$dest/EnvoyMesh.app" | awk '{print $1}'))"
      fi
      ;;
  esac

  if [ "$copied" -eq 0 ]; then
    return 1
  fi

  echo "$dest"
}

# Step 1: Build workspace packages + Node runtime, then stage sidecars
echo "[1/6] Building workspace packages + Node runtime..."
cd "${PROJECT_DIR}"
npx tsc -b
echo ""
echo "[1/6] continued — Staging sidecars (Node.js, OpenClaw, Pi, EnvoyMesh node)..."
# Always stage Node + OpenClaw + EnvoyMesh node. Pi is optional:
#   STAGE_PI_BUNDLE=0  → skip Pi AND use tauri.conf.slim.json (mirrors
#                        build-desktop.ps1 -SkipPi). Do NOT wrap the other
#                        sidecars in this gate — that previously left
#                        installers without OpenClaw/Node when Pi was skipped.
#   STAGE_PI_BUNDLE=1  → force re-fetch Pi (passed through to stage-tauri-pi-bundle.sh)
#   unset              → include Pi, reuse staged tree when version matches
SKIP_PI=0
if [ "${STAGE_PI_BUNDLE:-1}" = "0" ]; then
  SKIP_PI=1
  echo "  ⚠ STAGE_PI_BUNDLE=0 — skipping Pi sidecar staging."
  echo "    Tauri build will use tauri.conf.slim.json (omits resources/pi/**/*)."
else
  # Ensure a previous slim run did not leave us without a Pi tree expectation;
  # staging is idempotent.
  :
fi

bash scripts/fetch-node-sidecar.sh
bash scripts/stage-tauri-openclaw-bundle.sh
# Always install envoymesh channel (independent of OpenClaw cache reuse).
bash scripts/stage-openclaw-envoymesh-extension.sh
if [ "${SKIP_PI}" = "0" ]; then
  bash scripts/stage-tauri-pi-bundle.sh
else
  # Avoid packaging a stale Pi tree if someone later builds with the
  # default config by mistake. Slim config omits the glob; clearing the
  # dir keeps verify + accidental full-config builds honest.
  if [ -d "${PROJECT_DIR}/apps/tauri/src-tauri/resources/pi" ]; then
    echo "  Removing staged resources/pi/ (slim build — will not be bundled)."
    rm -rf "${PROJECT_DIR}/apps/tauri/src-tauri/resources/pi"
  fi
fi
bash scripts/stage-tauri-node-bundle.sh
# Stage push-config.json + AuthKey_*.p8 + serviceAccountKey.json into
# resources/node/ (after node staging, which recreates that dir). Relative
# paths in push-config.json resolve via ENVOYMESH_NODE_BUNDLE_DIR at runtime.
# Covers iOS APNs + Android FCM for EnvoyGo clients talking to this home node.
# Family network needs no extra staging — it ships in the compiled node + Social UI.
# Default: fail the build if push-config.json exists but secrets are missing.
export REQUIRE_PUSH_CREDENTIALS="${REQUIRE_PUSH_CREDENTIALS:-1}"
bash scripts/stage-tauri-push-credentials.sh
echo ""

# Step 2: Run discovery E2E tests (fast — ~15ms, catches relay/DHT regressions)
echo "[2/6] Running discovery E2E tests..."
cd "${PROJECT_DIR}"
npx vitest run apps/node/test/discovery-search-roundtrip.test.ts || {
  echo "error: discovery E2E tests failed — aborting build. Fix tests before rebuilding." >&2
  exit 1
}
echo ""

# Step 3: Build Social UI (Tauri frontendDist → apps/social/src/dist)
# Use the workspace script from repo root — never `cd apps/social && npm install`.
# Nested install re-resolves @envoymesh/* against the public registry and 404s
# (those packages are private workspace links only).
# Social includes family-network Settings UI + all i18n locales (en/zh/ko/ja/fr/de/it).
echo "[3/6] Building Social UI..."
cd "${PROJECT_DIR}"
# Also require Tauri updater JS plugins — Social's tsc imports them for OTA.
# An older node_modules can have @envoymesh/api but miss these after a pull.
need_npm_install=0
for dep in \
  node_modules/@envoymesh/api \
  node_modules/@tauri-apps/plugin-updater \
  node_modules/@tauri-apps/plugin-process
do
  if [ ! -d "$dep" ]; then
    need_npm_install=1
    echo "  Missing dependency: $dep"
  fi
done
if [ "$need_npm_install" -eq 1 ]; then
  echo "  Installing workspace dependencies (root)..."
  npm install
fi
npm run social:build
if [ ! -f "apps/social/src/dist/index.html" ]; then
  echo "error: Social UI build did not produce apps/social/src/dist/index.html" >&2
  exit 1
fi
echo ""

# Verify sidecars + Social + push credentials only AFTER Social is built
# (verify-tauri-resources.sh requires apps/social/src/dist/index.html).
echo "Verifying Tauri bundle resources (post-Social)..."
bash scripts/verify-tauri-resources.sh
echo ""

# Step 4: Build Tauri
echo "[4/6] Building Tauri desktop app..."

install_tauri_cli() {
    if ! command -v cargo-tauri &> /dev/null && ! npx tauri --version &> /dev/null; then
        echo "  Installing @tauri-apps/cli..."
        cargo install tauri-cli || npm install -g @tauri-apps/cli
    fi
}

run_tauri_build() {
    # Install from repo root via workspace — never plain `npm install` inside
    # apps/tauri (that re-resolves private @envoymesh/* against the registry).
    # Pass-through "$@" only — do not copy into empty arrays; macOS /bin/bash
    # 3.2 + `set -u` treats `"${empty[@]}"` as unbound.
    cd "${PROJECT_DIR}"
    if [ ! -d "node_modules/@tauri-apps/cli" ] && [ ! -d "apps/tauri/node_modules/@tauri-apps/cli" ]; then
      echo "  Installing @envoymesh/tauri dependencies (workspace)..."
      npm install -w @envoymesh/tauri
    fi
    cd "${PROJECT_DIR}/apps/tauri"
    # Slim config when Pi was skipped — must match PowerShell -SkipPi so the
    # installer does not reference a missing resources/pi/**/* glob.
    if [ "${SKIP_PI:-0}" = "1" ]; then
      local slim_conf="src-tauri/tauri.conf.slim.json"
      if [ ! -f "${slim_conf}" ]; then
        echo "error: slim config missing at apps/tauri/${slim_conf} (required for STAGE_PI_BUNDLE=0)" >&2
        exit 1
      fi
      echo "  Using slim config: ${slim_conf} (Pi omitted)"
      if command -v cargo-tauri &> /dev/null; then
        cargo tauri build --config "${slim_conf}" "$@"
      else
        npx tauri build --config "${slim_conf}" "$@"
      fi
    else
      echo "  Using default config: tauri.conf.json (Pi + OpenClaw + Kubo)"
      if command -v cargo-tauri &> /dev/null; then
        cargo tauri build "$@"
      else
        npx tauri build "$@"
      fi
    fi
}

PUBLISHED=""

case "${TARGET}" in
    macos|all)
        echo "  Building for macOS..."
        install_tauri_cli
        if run_tauri_build --target universal-apple-darwin 2>&1; then
            :
        elif run_tauri_build --target aarch64-apple-darwin 2>&1; then
            :
        else
            echo "error: Tauri macOS build failed. Install Xcode CLT: xcode-select --install" >&2
            exit 1
        fi
        echo ""
        echo "[5/6] Publishing macOS artifacts to ${OUT_DIR}/..."
        PUBLISHED="$(publish_desktop_release macos '*/release/bundle/dmg/*.dmg')" || true
        ;;
    linux)
        echo "  Building for Linux..."
        install_tauri_cli
        run_tauri_build --target x86_64-unknown-linux-gnu
        echo ""
        echo "[5/6] Publishing Linux artifacts to ${OUT_DIR}/..."
        PUBLISHED="$(publish_desktop_release linux \
          '*/release/bundle/deb/*.deb' \
          '*/release/bundle/appimage/*.AppImage')" || true
        ;;
    *)
        echo "error: unknown target '$TARGET' (use macos|linux|all — for Windows use scripts/build-desktop.ps1)" >&2
        exit 1
        ;;
esac

cd "${PROJECT_DIR}"
echo ""

# Step 6: Summary
echo "[6/6] Build complete"
echo ""
echo "============================================"
echo "  Release output"
echo "============================================"
echo ""
if [ -n "$PUBLISHED" ]; then
  echo "  Folder:  $PUBLISHED"
  ls -lh "${PROJECT_DIR}/${OUT_DIR}"/envoymesh-desktop-"${VERSION}"-* 2>/dev/null || true
else
  echo "  (no artifacts published — check Tauri build logs above)"
fi
echo ""
echo "  Cargo still keeps intermediates under:"
echo "    apps/tauri/src-tauri/target/"
echo ""
echo "  A working desktop bundle is typically 300 MB – 2 GB."
echo "  For headless portable drops (no UI), use ./scripts/bundle.sh instead."
echo ""
