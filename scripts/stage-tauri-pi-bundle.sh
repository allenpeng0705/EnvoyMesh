#!/usr/bin/env bash
# Stage the Pi coding-agent sidecar for Tauri desktop bundles.
#
# Pi is a Node.js package, not a prebuilt per-OS binary. The staging
# pipeline is therefore:
#   1. Delegate to fetch-pi-sidecar.sh — npm-installs Pi + all transitive
#      deps into apps/tauri/src-tauri/resources/pi/node_modules/.
#   2. Prune non-runtime files from the staged tree to keep the bundle
#      lean (tests, source maps, .github metadata, TypeScript sources).
#   3. Verify the CLI entry point exists and the bundle is importable.
#
# The bash twin of fetch-pi-sidecar.ps1 already lays out a self-contained
# tree under resources/pi/, so this script's main work is the prune +
# verify pass.
#
# Usage: bash scripts/stage-tauri-pi-bundle.sh
#
# Environment variables:
#   STAGE_PI_BUNDLE=1     Force re-fetch + re-stage (default: reuse cached tree)
#   STAGE_PI_BUNDLE=0     Skip entirely (debug escape hatch — bundle will not
#                         contain Pi; the Pi chat panel will be disabled at
#                         runtime via piEnabled)
#   ENVOYMESH_PI_VERSION  Override the pinned Pi version. Single source of
#                         truth across build-desktop.{sh,ps1} +
#                         fetch-pi-sidecar.{sh,ps1} + this script.
#                         Default: 0.82.1.
#   PI_VERSION=0.82.1     (legacy) Override the pinned Pi version; takes
#                         precedence over ENVOYMESH_PI_VERSION for
#                         backwards compatibility.
#   SMOKE_PI=0            Skip the post-stage smoke (default: 1)
#   SMOKE_TIMEOUT=60      Smoke timeout in seconds (default: 60)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Precedence: PI_VERSION (legacy) → ENVOYMESH_PI_VERSION → default pin.
if [ -n "${PI_VERSION:-}" ]; then
  : # legacy env var wins
elif [ -n "${ENVOYMESH_PI_VERSION:-}" ]; then
  PI_VERSION="${ENVOYMESH_PI_VERSION}"
else
  PI_VERSION="0.82.1"
fi
DEST="${ROOT}/apps/tauri/src-tauri/resources/pi"

# Escape hatch: skip Pi staging entirely.
if [ "${STAGE_PI_BUNDLE:-1}" = "0" ]; then
  echo "  ⚠ STAGE_PI_BUNDLE=0 — skipping Pi sidecar staging."
  echo "    The bundle will NOT contain Pi; the Pi chat panel will be"
  echo "    disabled at runtime (piEnabled defaults false on slim builds)."
  exit 0
fi

# Pi CLI entry point — the canonical "is it staged?" marker.
PI_CLI="${DEST}/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"

# Reuse gate: if the requested version is already staged and the CLI
# entry exists, skip the fetch. Override with STAGE_PI_BUNDLE=1.
NEED_FETCH=0
if [ "${STAGE_PI_BUNDLE:-}" = "1" ]; then
  NEED_FETCH=1
elif [ ! -f "${PI_CLI}" ]; then
  NEED_FETCH=1
elif [ -f "${DEST}/.pi-version" ] && [ "$(cat "${DEST}/.pi-version")" != "${PI_VERSION}" ]; then
  NEED_FETCH=1
fi

if [ "${NEED_FETCH}" = "1" ]; then
  echo "  Staging Pi ${PI_VERSION}..."
  # Pass PI_VERSION explicitly as $1 — fetch-pi-sidecar.sh also honours
  # ENVOYMESH_PI_VERSION on its own, but the explicit positional form
  # wins precedence and keeps the call self-documenting in build logs.
  PI_VERSION="${PI_VERSION}" bash "${ROOT}/scripts/fetch-pi-sidecar.sh" "${PI_VERSION}"
else
  echo "  ✓ Pi ${PI_VERSION} already staged — reusing (set STAGE_PI_BUNDLE=1 to force)."
fi

# Re-check after fetch (in case fetch failed silently — it shouldn't,
# but defense-in-depth).
if [ ! -f "${PI_CLI}" ]; then
  echo "  ✗ Pi CLI entry missing at ${PI_CLI/$ROOT\//} after staging" >&2
  exit 1
fi

# ---- Prune non-runtime files from the staged tree ----
# Pi ships with test fixtures, TypeScript sources, source maps, and
# GitHub metadata that the runtime never imports. Trimming them keeps
# the bundle lean and avoids shipping dev-only code. Idempotent — safe
# to run on every stage, including reused trees.
echo "  Pruning non-runtime files from Pi bundle..."
PRUNED_COUNT=0

prune_pattern() {
  local pattern="$1"
  local label="$2"
  local count
  count=$(find "${DEST}" -type f \( ${pattern} \) 2>/dev/null | wc -l | tr -d ' ')
  if [ "${count}" -gt 0 ]; then
    find "${DEST}" -type f \( ${pattern} \) -delete 2>/dev/null || true
    echo "    ${label}: removed ${count}"
    PRUNED_COUNT=$((PRUNED_COUNT + count))
  fi
}

# Source maps — large, never needed at runtime (debugging only).
# Includes *.d.ts.map — on Windows these often exceed MAX_PATH under nested
# @mistralai/.../operations/ and break NSIS if left in place.
prune_pattern '-name "*.map"' "source maps"
# TypeScript sources + declarations — runtime only needs compiled .js.
# (Declarations used to be kept; they add the longest Windows paths.)
prune_pattern '-name "*.ts" -o -name "*.mts" -o -name "*.cts"' "TypeScript sources/declarations"
# Test files — *.test.js, *.spec.js, __tests__/, __mocks__/
prune_pattern '-name "*.test.js" -o -name "*.spec.js" -o -name "*.test.d.ts"' "test files"
find "${DEST}" -type d \( -name "__tests__" -o -name "__mocks__" -o -name "test" -o -name "tests" \) -not -path "*/node_modules/.bin/*" -exec rm -rf {} + 2>/dev/null || true
# GitHub / CI metadata — never imported at runtime.
find "${DEST}" -type d \( -name ".github" -o -name ".husky" -o -name ".vscode" -o -name ".pi" \) -exec rm -rf {} + 2>/dev/null || true
# License files we keep; this is informational only.
LICENSE_COUNT=$(find "${DEST}" -type f \( -iname "license*" -o -iname "copying*" \) 2>/dev/null | wc -l | tr -d ' ')
echo "    (kept ${LICENSE_COUNT} license files)"

# Remove empty directories left by pruning.
find "${DEST}" -type d -empty -delete 2>/dev/null || true

# ---- Prune cross-platform native modules ----
# Pi's native deps (@mariozechner/clipboard-*, @earendil-works/pi-tui/native/*)
# ship prebuilt .node bindings for every OS+arch combo. We only need the
# host platform's bindings at runtime — drop the rest. Saves ~5-7 MB.
# Keep it conservative: only delete prebuilds that clearly belong to a
# different platform, never the host's.
HOST_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"   # darwin | linux | win32
HOST_ARCH="$(uname -m)"                                # arm64 | x86_64 | ...
# Normalize arch to Node's naming (x86_64 → x64).
case "${HOST_ARCH}" in
  x86_64|amd64) HOST_ARCH_NORM="x64" ;;
  arm64|aarch64) HOST_ARCH_NORM="arm64" ;;
  *) HOST_ARCH_NORM="${HOST_ARCH}" ;;
esac
echo "  Pruning cross-platform native prebuilds (keeping ${HOST_OS}-${HOST_ARCH_NORM})..."
NATIVE_PRUNED=0
# Pattern: any dir under prebuilds/ named for a different OS/arch combo.
while IFS= read -r prebuild_dir; do
  [ -d "${prebuild_dir}" ] || continue
  parent="$(dirname "${prebuild_dir}")"
  for sibling in "${parent}"/*; do
    [ -d "${sibling}" ] || continue
    name="$(basename "${sibling}")"
    # Keep the host platform+arch dir; drop everything else.
    case "${name}" in
      "${HOST_OS}-${HOST_ARCH_NORM}"|"${HOST_OS}"|"${HOST_ARCH_NORM}") continue ;;
      *-x64|*-arm64|*-armv7l|*-ia32|*-universal|darwin-*|linux-*|win32-*)
        rm -rf "${sibling}" 2>/dev/null && NATIVE_PRUNED=$((NATIVE_PRUNED + 1))
        ;;
    esac
  done
done < <(find "${DEST}" -type d -name "prebuilds" 2>/dev/null)
if [ "${NATIVE_PRUNED}" -gt 0 ]; then
  echo "    removed ${NATIVE_PRUNED} cross-platform native prebuild dir(s)"
fi

if [ "${PRUNED_COUNT}" -gt 0 ] || [ "${NATIVE_PRUNED}" -gt 0 ]; then
  echo "  ✓ Pruned ${PRUNED_COUNT} non-runtime files + ${NATIVE_PRUNED} native prebuild dirs"
fi

# ---- Verify the staged tree ----
echo "  Verifying Pi bundle..."
FINAL_SIZE=$(du -sh "${DEST}" | awk '{print $1}')

# Required files for the Pi runtime.
REQUIRED=(
  "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
  "node_modules/@earendil-works/pi-coding-agent/dist/index.js"
  "node_modules/@earendil-works/pi-coding-agent/package.json"
)
for rel in "${REQUIRED[@]}"; do
  if [ ! -f "${DEST}/${rel}" ]; then
    echo "  ✗ Required file missing: ${rel}" >&2
    exit 1
  fi
done

# The 3 sibling @earendil-works packages should be present (Pi's deps).
# npm may NOT hoist them to the top level — they can be nested under
# pi-coding-agent/node_modules/@earendil-works/. Accept either layout
# (Node's resolver finds both).
PI_PKG_DIR="${DEST}/node_modules/@earendil-works/pi-coding-agent"
find_earendil_pkg() {
  local pkg="$1"
  for base in "${DEST}/node_modules/@earendil-works" "${PI_PKG_DIR}/node_modules/@earendil-works"; do
    if [ -d "${base}/${pkg}" ]; then
      echo "${base}/${pkg}"
      return 0
    fi
  done
  return 1
}
for pkg in pi-ai pi-agent-core pi-tui; do
  if ! find_earendil_pkg "${pkg}" >/dev/null; then
    echo "  ✗ Missing sibling package: @earendil-works/${pkg}" >&2
    exit 1
  fi
done

echo "  ✓ Pi ${PI_VERSION} staged at ${DEST/$ROOT\//} (${FINAL_SIZE})"
echo "    CLI entry: node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
echo "    SDK entry: node_modules/@earendil-works/pi-coding-agent/dist/index.js"

# Post-stage smoke: spawn the Pi CLI on a known-good invocation and
# assert it loads cleanly. Catches "staged tree looks fine but the CLI
# crashes on import" class of defects that escape the file-existence
# verify above. Mirrors scripts/smoke-openclaw-bundle.sh.
# Disable with SMOKE_PI=0.
if [ "${SMOKE_PI:-1}" = "1" ]; then
    echo
    echo "[stage-tauri-pi-bundle] Running post-stage smoke (set SMOKE_PI=0 to skip)..."
    if ! SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-30}" \
         PI_DIR="$DEST" \
         bash "$ROOT/scripts/smoke-pi-bundle.sh"; then
        echo "  ✗ Post-stage smoke FAILED — Pi CLI could not load cleanly" >&2
        echo "  Re-run with SMOKE_PI=0 to bypass (NOT recommended for release builds)" >&2
        exit 1
    fi
fi
