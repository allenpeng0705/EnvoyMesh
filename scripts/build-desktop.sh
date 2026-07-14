#!/bin/bash
# Tauri Desktop App Builder
# Builds EnvoyMesh.app (.dmg on macOS), .AppImage/.deb (Linux)
# with OpenClaw + Node.js bundled inside (no separate install for end users).
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
echo "[1/6] continued — Staging sidecars (Node.js, OpenClaw, EnvoyMesh node)..."
bash scripts/fetch-node-sidecar.sh
bash scripts/stage-tauri-openclaw-bundle.sh
bash scripts/stage-tauri-node-bundle.sh
bash scripts/verify-tauri-resources.sh
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
echo "[3/6] Building Social UI..."
cd "${PROJECT_DIR}/apps/social"
npm install
npm run build
if [ ! -f "src/dist/index.html" ]; then
  echo "error: Social UI build did not produce apps/social/src/dist/index.html" >&2
  exit 1
fi
cd "${PROJECT_DIR}"
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
    local extra_args=("$@")
    cd "${PROJECT_DIR}/apps/tauri"
    npm install
    if command -v cargo-tauri &> /dev/null; then
        cargo tauri build "${extra_args[@]}"
    else
        npx tauri build "${extra_args[@]}"
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
