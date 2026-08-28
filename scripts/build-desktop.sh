#!/bin/bash
# Tauri Desktop App Builder
# Builds EnvoyMesh.app (.dmg on macOS), .AppImage/.deb (Linux)
# with OpenClaw + Node.js bundled inside (no separate install for end users).
#
# Feature packaging notes (family network / push / EnvoyGo l10n):
#   - Family network: ships in compiled apps/node + Social UI — no extra assets.
#   - Relay roster seed (Phase 46E Path C): stage-bundle-node-runtime.sh copies
#     repo-root relay-roster.json → resources/node/relay-roster.json (CN+US hubs
#     for first boot). Homes then poll live relays. verify-tauri-resources.sh
#     fails the build if the repo seed exists but was not staged.
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
# Output (copied from Cargo target dir into the repo):
#   release/envoymesh-desktop-{version}-macos-{arch}.dmg   (versioned archive)
#   release/envoymesh-desktop.dmg                          (stable mirror URL)
#   release/envoymesh-desktop-{version}-linux-{arch}.deb
#   release/envoymesh-desktop-{version}-linux-{arch}.AppImage
#   release/envoymesh-desktop-{version}-{platform}-{arch}/   (folder with all of the above)
#
# Stable mirror filenames (envoymesh-desktop.dmg / .exe on Windows) are overwritten
# on each publish. Sites link to https://gpt4people.online/EnvoyMesh/ with those
# fixed names so download URLs never change when VERSION bumps.
#
# Slim / Full / default presets (Phase 49 — Pi optional on Windows):
#   default     Uses tauri.conf.json           — includes Pi + OpenClaw
#               (no Kubo; Helia / system ipfs for IPFS). Linux Deb/AppImage
#               follow the same default here.
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
#   STAGE_KUBO_BUNDLE=1
#               Fetch Kubo into src-tauri/resources/kubo and build with
#               tauri.conf.full.json (matches CI release / -Full on Windows).
#
# envoy-harness staging (Phase 8):
#   STAGE_ENVOY_HARNESS=0
#               Skip envoy-harness *resources* staging. The node still has
#               static imports of @envoymesh/envoy-harness-adapter, so
#               stage-bundle-node-runtime.sh refuses this unless
#               ENVOYMESH_ALLOW_BROKEN_HARNESS_SKIP=1 (non-runnable debug
#               bundle). Default: stage.
#   STAGE_ENVOY_HARNESS=1
#               Force a clean rebuild + overwrite. Runs
#               `pnpm -F <pkg> clean` (best-effort) then
#               `pnpm -F <pkg> build` in the sibling repo. The clean
#               step clears .tsbuildinfo + dist/. Use after switching
#               sibling-repo branches or when you want to be sure the
#               staged tree is from-scratch. (Default unset:
#               incremental rebuild — pnpm's tsc skips unchanged
#               sources.)
#   ENVOY_HARNESS_DIR=<path>
#               Override the sibling envoy-harness monorepo location.
#               Default: $ROOT/../envoy-harness. The script builds
#               envoy-harness, envoy-harness-client, envoy-harness-adapter,
#               envoy-harness-peer, and envoy-harness-tui and copies their
#               dist/ into apps/tauri/src-tauri/resources/.
#               stage-bundle-node-runtime.sh also wires them into
#               resources/node/node_modules/@envoymesh/ (required for
#               first-launch module resolution + Terminal → Envoy).
#               See scripts/stage-tauri-envoy-harness-bundle.sh.
#   SMOKE_ENVOY_HARNESS=0
#               Skip the post-stage smoke (asserts entry files exist in
#               both staged trees). Default: smoke.
#
# Apple review build (opt-in, macOS/Linux only — NOT the default package):
#   APPLE_REVIEW=1 ./scripts/build-desktop.sh macos
#   One-off family-only review home for iOS/Android store submission. Stages
#   scripts/stage-apple-review-node-config.mjs into the node bundle. Set
#   APPLE_REVIEW_TOKEN=<secret> to reuse a token across rebuilds.
#   Do NOT use for normal releases. Windows builds do not support this —
#   use build-desktop.ps1 without APPLE_REVIEW.
#
# Apple Developer ID signing + notarization (macOS DMG — direct download, not App Store):
#   Fill the exports in apply_apple_signing_env() below, or copy
#   scripts/sign-macos-release.env.example → scripts/sign-macos-release.env
#   (gitignored). Tauri signs + notarizes during `tauri build` when set.
#   Full operator guide: docs/macos-mirror-signing.md
#
# Mac App Store (experimental — separate pipeline, not the website DMG):
#   MAC_APP_STORE=1 ./scripts/build-desktop.sh macos
#   Uses tauri.conf.appstore.json (App Sandbox, .app bundle, signed .pkg).
#   Fill scripts/sign-macos-appstore.env (see .example). Upload .pkg via Transporter
#   or altool. No in-app OTA updater (App Store handles updates). May fail review
#   due to bundled Node/OpenClaw home-node — acceptable for a trial build.
#
# OpenClaw extensions (macOS/Linux):
#   Default OPENCLAW_EXTENSIONS=default — EnvoyMesh agent allowlist only
#   (envoymesh + search/agent utils). Omits OpenClaw Diff UI and all
#   third-party chat channels (Discord/Telegram/…); Social is the chat UI.
#   Users can install extra extensions later via Skill Manager.
#   OPENCLAW_EXTENSIONS=all — ship the full OpenClaw extension tree.
#
#   Slim/full entry points for Windows live in apps/tauri/package.json:
#     npm run build:win:slim   → tauri.conf.slim.json   (mirrors PS -SkipPi)
#     npm run build:win:full   → tauri.conf.full.json   (Pi + Kubo)
#     npm run build:win        → build:win:full
#     npm run build            → tauri.conf.json        (default: Pi, no Kubo)
#
#   This script (mac/linux) defaults to tauri.conf.json. Set STAGE_PI_BUNDLE=0
#   for slim, or STAGE_KUBO_BUNDLE=1 for full (Kubo + Pi).
#
# Usage: ./scripts/build-desktop.sh [macos|linux|all]
#   all  = native host only (darwin→macos, linux→linux). Not a cross-compile.
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

# Keep @envoymesh/* dependency pins in lockstep with VERSION. Stale pins
# make npm fetch the public registry and 404 on private workspace packages.
# Read VERSION *after* sync — package.json may have been stale vs the VERSION file.
echo "Syncing workspace package versions..."
node "${PROJECT_DIR}/scripts/sync-version.mjs"
echo ""

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

# Recompress the newest DMG under ${TAURI_TARGET_ROOT} to a stronger
# compression format (default UDBZ/bzip2 ≈ 10-20% smaller than Tauri's
# default UDZO/zlib, at the cost of slower creation). Override with
# DMG_COMPRESSION=UDZO|ULFO|UDBZ to pick a different format (or UDZO to
# keep Tauri's default). No-op when the DMG is already in the target
# format or when hdiutil is unavailable (non-macOS).
recompress_dmg() {
  local dmg cur fmt tmp
  # `newest_file` returns 1 when no DMG exists; `|| true` keeps this safe
  # under `set -e` regardless of how the caller invokes the function.
  dmg="$(newest_file '*/release/bundle/dmg/*.dmg')" || true
  [ -n "$dmg" ] || { echo "  (no DMG found — skipping recompression)"; return 0; }
  fmt="${DMG_COMPRESSION:-UDBZ}"
  # `hdiutil imageinfo` has no plain "Format:" line — the compression lives in
  # "Format Description:". Map the description back to the hdiutil format code
  # so we can skip recompression when the DMG is already in the target format.
  local cur_desc cur=""
  cur_desc="$(hdiutil imageinfo "$dmg" 2>/dev/null | sed -n 's/^Format Description: *//p' | tr -d '\r')" || true
  case "$cur_desc" in
    *zlib*)  cur="UDZO" ;;
    *bzip2*) cur="UDBZ" ;;
    *lzfse*) cur="ULFO" ;;
  esac
  if [ "$cur" = "$fmt" ]; then
    echo "  DMG already ${fmt}: $dmg ($(du -h "$dmg" | awk '{print $1}'))"
    return 0
  fi
  tmp="${dmg}.recompress"
  rm -f "$tmp"
  echo "  Recompressing DMG ${cur:-?} → ${fmt}: $dmg"
  hdiutil convert "$dmg" -format "$fmt" -ov -o "$tmp" >/dev/null 2>&1 || {
    echo "  ⚠ hdiutil recompress failed — keeping original DMG" >&2
    rm -f "$tmp"
    return 0
  }
  mv -f "$tmp" "$dmg"
  echo "  ✓ DMG ${fmt}: $dmg ($(du -h "$dmg" | awk '{print $1}'))"
}

# Developer ID + notarization for macOS DMG (direct download — not Mac App Store).
# Fill the four exports below, or use scripts/sign-macos-release.env (gitignored).
apply_apple_signing_env() {
  local sign_env="${SCRIPT_DIR}/sign-macos-release.env"
  if [ -f "$sign_env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$sign_env"
    set +a
  fi

  export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: …}"
  export APPLE_ID="${APPLE_ID:-…}"
  export APPLE_PASSWORD="${APPLE_PASSWORD:-…}"
  export APPLE_TEAM_ID="${APPLE_TEAM_ID:-…}"

  if [ "$APPLE_SIGNING_IDENTITY" = "Developer ID Application: …" ] || \
     [ "$APPLE_ID" = "…" ] || [ "$APPLE_PASSWORD" = "…" ] || [ "$APPLE_TEAM_ID" = "…" ]; then
    unset APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
    echo "  Apple signing: skipped (unsigned DMG — fill exports in build-desktop.sh or sign-macos-release.env)"
    return 0
  fi

  echo "  Apple signing: Developer ID + notarization enabled"
}

# Mac App Store: Apple Distribution + sandbox entitlements + .pkg (not Developer ID DMG).
prepare_appstore_bundle_files() {
  local tauri_src="${PROJECT_DIR}/apps/tauri/src-tauri"
  local team_id="${APPLE_TEAM_ID:-}"
  local template="${tauri_src}/Entitlements.appstore.plist.template"
  local entitlements="${tauri_src}/Entitlements.appstore.plist"

  if [ -z "$team_id" ] || [ "$team_id" = "…" ]; then
    echo "error: MAC_APP_STORE=1 requires APPLE_TEAM_ID (scripts/sign-macos-appstore.env)" >&2
    exit 1
  fi
  if [ ! -f "$template" ]; then
    echo "error: missing ${template}" >&2
    exit 1
  fi
  sed "s/__APPLE_TEAM_ID__/${team_id}/g" "$template" > "$entitlements"
  echo "  ✓ Generated Entitlements.appstore.plist (team ${team_id})"

  local profile_src="${MAC_APPSTORE_PROVISION_PROFILE:-}"
  local profile_dest="${tauri_src}/EnvoyMesh_AppStore.provisionprofile"
  if [ -n "$profile_src" ] && [ "$profile_src" != "…" ] && [ -f "$profile_src" ]; then
    cp -f "$profile_src" "$profile_dest"
    echo "  ✓ Staged Mac App Store provisioning profile"
  elif [ ! -f "$profile_dest" ]; then
    echo "  ⚠ No provisioning profile — place EnvoyMesh_AppStore.provisionprofile in src-tauri/" >&2
    echo "    or set MAC_APPSTORE_PROVISION_PROFILE in sign-macos-appstore.env" >&2
  fi
}

apply_apple_appstore_signing_env() {
  local sign_env="${SCRIPT_DIR}/sign-macos-appstore.env"
  if [ -f "$sign_env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$sign_env"
    set +a
  fi

  export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Apple Distribution: …}"
  export MAC_APPSTORE_PKG_SIGNING_IDENTITY="${MAC_APPSTORE_PKG_SIGNING_IDENTITY:-3rd Party Mac Developer Installer: …}"
  export APPLE_TEAM_ID="${APPLE_TEAM_ID:-…}"
  export MAC_APPSTORE_PROVISION_PROFILE="${MAC_APPSTORE_PROVISION_PROFILE:-…}"

  if [ "$APPLE_SIGNING_IDENTITY" = "Apple Distribution: …" ] || \
     [ "$MAC_APPSTORE_PKG_SIGNING_IDENTITY" = "3rd Party Mac Developer Installer: …" ] || \
     [ "$APPLE_TEAM_ID" = "…" ]; then
    echo "  ⚠ Mac App Store signing incomplete — fill scripts/sign-macos-appstore.env"
    echo "    (build may produce an unsigned .app; .pkg packaging will be skipped)"
    unset APPLE_SIGNING_IDENTITY
    return 0
  fi

  prepare_appstore_bundle_files
  echo "  Mac App Store signing: Apple Distribution enabled"
}

# Wrap productbuild around the newest EnvoyMesh.app (Mac App Store upload artifact).
package_mac_appstore_pkg() {
  local app pkg_out pkg_sign
  app="$(newest_dir '*/release/bundle/macos/EnvoyMesh.app')"
  if [ -z "$app" ]; then
    echo "  ⚠ No EnvoyMesh.app found — cannot create .pkg" >&2
    return 1
  fi

  pkg_out="${PROJECT_DIR}/${OUT_DIR}/envoymesh-desktop-appstore-${VERSION}.pkg"
  mkdir -p "${PROJECT_DIR}/${OUT_DIR}"
  pkg_sign="${MAC_APPSTORE_PKG_SIGNING_IDENTITY:-}"

  if [ -z "$pkg_sign" ] || [ "$pkg_sign" = "3rd Party Mac Developer Installer: …" ]; then
    echo "  ⚠ Skipping signed .pkg — set MAC_APPSTORE_PKG_SIGNING_IDENTITY in sign-macos-appstore.env"
    echo "  App bundle ready at: $app"
    echo "$app"
    return 0
  fi

  echo "  Packaging Mac App Store .pkg (productbuild)..."
  rm -f "$pkg_out"
  xcrun productbuild --sign "$pkg_sign" --component "$app" /Applications "$pkg_out"
  echo "  ✓ ${OUT_DIR}/envoymesh-desktop-appstore-${VERSION}.pkg ($(du -h "$pkg_out" | awk '{print $1}'))"
  echo "  Upload with Transporter or: xcrun altool --upload-app --type macos --file \"$pkg_out\" ..."
  echo "$pkg_out"
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
      local versioned_dmg="${PROJECT_DIR}/${OUT_DIR}/${base}.dmg"
      if [ -f "$versioned_dmg" ]; then
        cp -f "$versioned_dmg" "${PROJECT_DIR}/${OUT_DIR}/envoymesh-desktop.dmg"
        echo "  ✓ ${OUT_DIR}/envoymesh-desktop.dmg (stable mirror — gpt4people.online/EnvoyMesh/)"
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
USE_FULL=0
if [ "${STAGE_PI_BUNDLE:-1}" = "0" ] && [ "${STAGE_KUBO_BUNDLE:-0}" = "1" ]; then
  echo "error: STAGE_PI_BUNDLE=0 and STAGE_KUBO_BUNDLE=1 are mutually exclusive" >&2
  echo "  (full config includes Pi; use default or STAGE_KUBO_BUNDLE=1 alone, or slim alone)." >&2
  exit 1
fi
if [ "${STAGE_PI_BUNDLE:-1}" = "0" ]; then
  SKIP_PI=1
  echo "  ⚠ STAGE_PI_BUNDLE=0 — skipping Pi sidecar staging."
  echo "    Tauri build will use tauri.conf.slim.json (omits resources/pi/**/*)."
elif [ "${STAGE_KUBO_BUNDLE:-0}" = "1" ]; then
  USE_FULL=1
  echo "  STAGE_KUBO_BUNDLE=1 — will fetch Kubo and use tauri.conf.full.json."
else
  # Ensure a previous slim run did not leave us without a Pi tree expectation;
  # staging is idempotent.
  :
fi

bash scripts/fetch-node-sidecar.sh
# EnvoyMesh Social is the chat UI/channel. Default OpenClaw staging keeps the
# agent allowlist only (no Diff UI, no Discord/Telegram/…). Override with
# OPENCLAW_EXTENSIONS=all for a full OpenClaw tree.
export OPENCLAW_EXTENSIONS="${OPENCLAW_EXTENSIONS:-default}"
echo "  OpenClaw extensions filter: OPENCLAW_EXTENSIONS=${OPENCLAW_EXTENSIONS}"
bash scripts/stage-tauri-openclaw-bundle.sh
# Always install envoymesh channel (independent of OpenClaw cache reuse).
bash scripts/stage-openclaw-envoymesh-extension.sh
# envoy-harness (Phase 8): vendor from the sibling envoy-harness monorepo
# into resources/envoy-harness*/. Honours STAGE_ENVOY_HARNESS=0 to skip
# (debug only) and ENVOY_HARNESS_DIR to override the sibling repo path.
# See scripts/stage-tauri-envoy-harness-bundle.sh for the cross-monorepo
# build + copy details.
bash scripts/stage-tauri-envoy-harness-bundle.sh
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
if [ "${USE_FULL}" = "1" ]; then
  bash scripts/fetch-kubo-sidecar.sh
  if [ ! -x "${PROJECT_DIR}/apps/tauri/src-tauri/resources/kubo/ipfs" ] && \
     [ ! -f "${PROJECT_DIR}/apps/tauri/src-tauri/resources/kubo/ipfs.exe" ]; then
    echo "error: STAGE_KUBO_BUNDLE=1 but Kubo binary missing under src-tauri/resources/kubo/" >&2
    exit 1
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
# Apple review vs Mac App Store are mutually exclusive packaging modes.
if [ "${APPLE_REVIEW:-0}" = "1" ] && [ "${MAC_APP_STORE:-0}" = "1" ]; then
  echo "error: APPLE_REVIEW=1 and MAC_APP_STORE=1 are mutually exclusive" >&2
  exit 1
fi
# Apple review build (opt-in: APPLE_REVIEW=1 only — not the default release).
# macOS/Linux via build-desktop.sh; not supported on Windows.
if [ "${APPLE_REVIEW:-0}" = "1" ]; then
  echo ""
  echo "  ⚠ APPLE_REVIEW=1 — building a FAMILY-ONLY review home:"
  echo "    • All QRs (incl. EnvoyGo) bind as family members, never the owner."
  echo "    • EnvoyGo QR is valid 30 days."
  echo "    • Do NOT ship this build to normal users."
  NODE_BUNDLE_DIR="${PROJECT_DIR}/apps/tauri/src-tauri/resources/node"
  node "${PROJECT_DIR}/scripts/stage-apple-review-node-config.mjs" \
    "${PROJECT_DIR}/node-config.json" "${NODE_BUNDLE_DIR}"
  echo ""
fi
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

# Step 3.5: Deep-sign nested Mach-O in staged resources (macOS notarization).
# Tauri codesigns the .app shell but not node_modules natives under resources/.
if [ "$(uname -s)" = "Darwin" ]; then
  case "${TARGET}" in
    all|macos)
      if [ "${MAC_APP_STORE:-0}" = "1" ]; then
        apply_apple_appstore_signing_env
      else
        apply_apple_signing_env
      fi
      if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
        echo "Signing nested Mach-O in Tauri resources (notarization)..."
        bash scripts/sign-macos-staged-resources.sh
        echo ""
      fi
      ;;
  esac
fi

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

    local tauri_inv
    if command -v cargo-tauri &> /dev/null; then
      tauri_inv=(cargo tauri build)
    else
      tauri_inv=(npx tauri build)
    fi

    # Mac App Store: sandbox + .app only (overrides slim/full/DMG).
    if [ "${MAC_APP_STORE:-0}" = "1" ]; then
      local appstore_conf="src-tauri/tauri.conf.appstore.json"
      if [ ! -f "${appstore_conf}" ]; then
        echo "error: app store config missing at apps/tauri/${appstore_conf}" >&2
        exit 1
      fi
      echo "  Using Mac App Store config: ${appstore_conf} (--bundles app, sandbox)"
      "${tauri_inv[@]}" --config "${appstore_conf}" --bundles app "$@"
      return $?
    fi

    # Config selection (mirrors build-desktop.ps1 -SkipPi / -Full):
    #   SKIP_PI=1     → tauri.conf.slim.json
    #   USE_FULL=1    → tauri.conf.full.json (Kubo + Pi)
    #   default       → tauri.conf.json (Pi, no Kubo)
    if [ "${SKIP_PI:-0}" = "1" ]; then
      local slim_conf="src-tauri/tauri.conf.slim.json"
      if [ ! -f "${slim_conf}" ]; then
        echo "error: slim config missing at apps/tauri/${slim_conf} (required for STAGE_PI_BUNDLE=0)" >&2
        exit 1
      fi
      echo "  Using slim config: ${slim_conf} (Pi omitted)"
      "${tauri_inv[@]}" --config "${slim_conf}" "$@"
    elif [ "${USE_FULL:-0}" = "1" ]; then
      local full_conf="src-tauri/tauri.conf.full.json"
      if [ ! -f "${full_conf}" ]; then
        echo "error: full config missing at apps/tauri/${full_conf} (required for STAGE_KUBO_BUNDLE=1)" >&2
        exit 1
      fi
      echo "  Using full config: ${full_conf} (Pi + Kubo)"
      "${tauri_inv[@]}" --config "${full_conf}" "$@"
    else
      echo "  Using default config: tauri.conf.json (Pi + OpenClaw; no Kubo)"
      "${tauri_inv[@]}" "$@"
    fi
}

PUBLISHED=""

# Resolve "all" → native host platform (never cross-compile Windows from here).
if [ "${TARGET}" = "all" ]; then
  case "$(uname -s)" in
    Darwin) TARGET="macos" ;;
    Linux) TARGET="linux" ;;
    *)
      echo "error: TARGET=all is only supported on macOS or Linux (got $(uname -s))." >&2
      echo "  For Windows use scripts/build-desktop.ps1 on a Windows host." >&2
      exit 1
      ;;
  esac
  echo "  TARGET=all → native ${TARGET}"
fi

case "${TARGET}" in
    macos)
        if [ "${MAC_APP_STORE:-0}" = "1" ]; then
          echo "  Building for Mac App Store (experimental)..."
          apply_apple_appstore_signing_env
          install_tauri_cli
          if run_tauri_build --target universal-apple-darwin 2>&1; then
              :
          elif run_tauri_build --target aarch64-apple-darwin 2>&1; then
              :
          else
              echo "error: Mac App Store Tauri build failed" >&2
              exit 1
          fi
          echo ""
          echo "[4.5/6] Packaging Mac App Store .pkg..."
          PUBLISHED="$(package_mac_appstore_pkg)" || true
        else
          echo "  Building for macOS (direct download DMG)..."
          apply_apple_signing_env
          install_tauri_cli
          if run_tauri_build --target universal-apple-darwin 2>&1; then
              :
          elif run_tauri_build --target aarch64-apple-darwin 2>&1; then
              :
          elif run_tauri_build --target x86_64-apple-darwin 2>&1; then
              :
          else
              echo "error: Tauri macOS build failed. Install Xcode CLT: xcode-select --install" >&2
              echo "  Also ensure rustup targets: rustup target add aarch64-apple-darwin x86_64-apple-darwin" >&2
              exit 1
          fi
          echo ""
          echo "[4.5/6] Recompressing DMG (default UDBZ — smaller download)..."
          recompress_dmg || true
          echo ""
          echo "[5/6] Publishing macOS artifacts to ${OUT_DIR}/..."
          PUBLISHED="$(publish_desktop_release macos '*/release/bundle/dmg/*.dmg')" || true
        fi
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
  ls -lh "${PROJECT_DIR}/${OUT_DIR}"/envoymesh-desktop-appstore-"${VERSION}".pkg 2>/dev/null || true
  ls -lh "${PROJECT_DIR}/${OUT_DIR}"/envoymesh-desktop.dmg 2>/dev/null || true
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
