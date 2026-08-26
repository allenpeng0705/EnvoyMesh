#!/usr/bin/env bash
# Stage envoy-harness packages for Tauri desktop bundles.
#
# Builds the sibling envoy-harness monorepo and copies dist/ into the
# Tauri resources/ tree. Packages staged:
#   envoy-harness, envoy-harness-adapter, envoy-harness-client,
#   envoy-harness-peer, envoy-harness-tui
#
# The Tauri bundle ships those vendored files so users get a
# self-contained release without the envoy-harness monorepo on their
# machine.
#
# This is the RELEASE counterpart to the DEV flow (which uses
# pnpm link: paths + live symlinks). See
# docs/envoy-harness-integration-EnvoyMesh.md §5 for the full design.
#
# Usage: bash scripts/stage-tauri-envoy-harness-bundle.sh
#
# Environment variables:
#   STAGE_ENVOY_HARNESS unset  Default. Re-runs `pnpm -F ... build` (incremental
#                              — pnpm skips unchanged sources) and re-copies
#                              dist/ into resources/. Idempotent: re-runs
#                              always overwrite the staged tree.
#   STAGE_ENVOY_HARNESS=0      Skip envoy-harness staging entirely (debug
#                              only — bundle will lack envoy-harness at
#                              runtime)
#   STAGE_ENVOY_HARNESS=1      Force a clean rebuild + overwrite. Runs
#                              `pnpm -F ... clean` first (best-effort,
#                              swallows "no clean script" errors) and
#                              then `pnpm -F ... build`. The clean step
#                              clears .tsbuildinfo + dist/ in the sibling
#                              repo. Use after switching sibling-repo
#                              branches or when you want to be sure the
#                              staged tree is from-scratch.
#   ENVOY_HARNESS_DIR <path>   Override the sibling monorepo path.
#                              Default: $ROOT/../envoy-harness.
#                              Useful for CI when the sibling repo
#                              is checked out elsewhere.
#   SMOKE_ENVOY_HARNESS=0      Skip the post-stage smoke (default 1).
#                              The smoke asserts the staged tree has both
#                              packages, each with a non-trivial file count,
#                              and the main index.js + index.d.ts entries
#                              exist + are non-empty.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVOY_HARNESS_DIR="${ENVOY_HARNESS_DIR:-$ROOT/../envoy-harness}"
DEST_BASE="$ROOT/apps/tauri/src-tauri/resources"
STAGE_MODE="${STAGE_ENVOY_HARNESS:-}"

die() { echo "[stage-tauri-envoy-harness-bundle] error: $*" >&2; exit 1; }

# ---- Skip gate ------------------------------------------------------------
if [ "$STAGE_MODE" = "0" ]; then
  echo "[stage-tauri-envoy-harness-bundle] STAGE_ENVOY_HARNESS=0 — skipping envoy-harness resources staging."
  echo "  NOTE: apps/node still statically imports @envoymesh/envoy-harness-adapter."
  echo "  stage-bundle-node-runtime.sh will refuse STAGE_ENVOY_HARNESS=0 unless"
  echo "  ENVOYMESH_ALLOW_BROKEN_HARNESS_SKIP=1 (non-runnable debug bundle)."
  exit 0
fi

# ---- Locate the sibling monorepo -----------------------------------------
if [ ! -d "$ENVOY_HARNESS_DIR" ]; then
  die "ENVOY_HARNESS_DIR=$ENVOY_HARNESS_DIR not found. Set ENVOY_HARNESS_DIR=/path/to/envoy-harness, or place the sibling monorepo at $ROOT/../envoy-harness. Use STAGE_ENVOY_HARNESS=0 to skip for debug."
fi

if [ ! -d "$ENVOY_HARNESS_DIR/packages/envoy-harness" ] || \
   [ ! -d "$ENVOY_HARNESS_DIR/packages/envoy-harness-adapter" ] || \
   [ ! -d "$ENVOY_HARNESS_DIR/packages/envoy-harness-client" ] || \
   [ ! -d "$ENVOY_HARNESS_DIR/packages/envoy-harness-peer" ] || \
   [ ! -d "$ENVOY_HARNESS_DIR/packages/envoy-harness-tui" ]; then
  die "$ENVOY_HARNESS_DIR/packages/envoy-harness{,-adapter,-client,-peer,-tui} missing — wrong repo at ENVOY_HARNESS_DIR?"
fi

echo "[stage-tauri-envoy-harness-bundle] Sibling monorepo: $ENVOY_HARNESS_DIR"

# ---- pnpm sanity check ----------------------------------------------------
if ! command -v pnpm >/dev/null 2>&1; then
  die "pnpm not on PATH. Install pnpm 9+ or activate via corepack."
fi

# ---- Build Package 1 (envoy-harness itself) -------------------------------
# When STAGE_ENVOY_HARNESS=1, run `pnpm -F <pkg> clean` first so tsc's
# incremental cache (.tsbuildinfo) is dropped. Default = incremental build
# (tsc skips unchanged sources — fast for the common case where the
# sibling repo hasn't changed since last build).
FORCE_REBUILD=0
if [ "$STAGE_MODE" = "1" ]; then
  FORCE_REBUILD=1
  echo "  STAGE_ENVOY_HARNESS=1 — clean rebuild of both packages."
fi

build_pkg() {
  local pkg="$1"
  local label="$2"
  echo "  Building $label (Package: $pkg)..."
  (
    cd "$ENVOY_HARNESS_DIR"
    if [ "$FORCE_REBUILD" = "1" ]; then
      # clean is in the package.json scripts (rm -rf dist *.tsbuildinfo).
      pnpm -F "$pkg" clean >/dev/null 2>&1 || true
    fi
    # tail -20 mirrors the openclaw vendor script's output limit. pipefail +
    # die on failure ensures a failing build exits non-zero.
    pnpm -F "$pkg" build 2>&1 | tail -20
  ) || die "$label build failed — see output above. Aborting."
}

# Build order: core → client/adapter → peer → tui.
# apps/node statically imports harness, adapter, client, and peer.
# Terminal → Envoy needs the TUI bin in the packaged resources.
build_pkg "@envoymesh/envoy-harness" "Package 1 (envoy-harness)"
build_pkg "@envoymesh/envoy-harness-client" "Package client (ACP client)"
build_pkg "@envoymesh/envoy-harness-adapter" "Package 3 (envoy-harness-adapter)"
build_pkg "@envoymesh/envoy-harness-peer" "Package peer (mesh submitter)"
build_pkg "@envoymesh/envoy-harness-tui" "Package TUI (terminal host)"

# ---- Stage dist/ → resources/ -------------------------------------------
# Idempotency: rm -rf before copy. Re-runs do not accumulate stale files.
# .keep is re-touched after copy so the git-tracked sentinel (which
# survives only the empty-dir state on a fresh clone) stays in place
# after rm -rf. Without the touch, `git status` would show
# "D .keep" after every build.
stage_dist() {
  local src_pkg="$1"
  local dest_name="$2"
  local src_dist="$ENVOY_HARNESS_DIR/packages/$src_pkg/dist"
  local dest_dir="$DEST_BASE/$dest_name"

  if [ ! -d "$src_dist" ]; then
    die "$src_dist not found after build. Build output missing."
  fi

  rm -rf "$dest_dir"
  mkdir -p "$dest_dir"
  cp -R "$src_dist"/. "$dest_dir/"
  # Flattened dist/ needs a package.json whose main/exports point at
  # ./index.js (not ./dist/index.js). Without this, any future NODE_PATH /
  # resolve against resources/envoy-harness would fail. The node_modules
  # wiring in stage-bundle-node-runtime.sh uses the source package.json +
  # dist/ layout instead; this file keeps the resource tree self-describing.
  local src_pkg_json="$ENVOY_HARNESS_DIR/packages/$src_pkg/package.json"
  if [ -f "$src_pkg_json" ]; then
    node -e '
      const fs = require("fs");
      const src = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const isTui = src.name === "@envoymesh/envoy-harness-tui";
      const out = {
        name: src.name,
        version: src.version || "0.0.0",
        type: "module",
        main: isTui ? "./bin.js" : "./index.js",
        types: "./index.d.ts",
        exports: {
          ".": { types: "./index.d.ts", import: "./index.js" },
        },
      };
      fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + "\n");
    ' "$src_pkg_json" "$dest_dir/package.json"
  fi
  # Restore the .keep sentinel so the working tree stays clean after staging.
  # Empty content is fine; .keep only exists to keep the empty dir tracked.
  touch "$dest_dir/.keep"

  local count
  count=$(find "$dest_dir" -type f | wc -l | tr -d ' ')
  echo "  ✓ $count files staged at resources/$dest_name/"
}

stage_dist "envoy-harness" "envoy-harness"
stage_dist "envoy-harness-adapter" "envoy-harness-adapter"
stage_dist "envoy-harness-client" "envoy-harness-client"
stage_dist "envoy-harness-peer" "envoy-harness-peer"
stage_dist "envoy-harness-tui" "envoy-harness-tui"

# ---- Post-stage smoke -----------------------------------------------------
# Asserts the staged tree has the packages apps/node needs at runtime, each
# with a non-trivial file count, and the main entry files exist + are
# non-empty. Does NOT do a dynamic import — the staged dist/ has no
# node_modules of its own (envoy-harness's runtime deps ship with the
# host process, not the bundle), so a dynamic import would fail for
# environment reasons unrelated to bundling correctness. Disable with
# SMOKE_ENVOY_HARNESS=0.
if [ "${SMOKE_ENVOY_HARNESS:-1}" = "1" ]; then
  echo
  echo "[stage-tauri-envoy-harness-bundle] Running post-stage smoke (set SMOKE_ENVOY_HARNESS=0 to skip)..."

  HARNESS_DEST="$DEST_BASE/envoy-harness"
  ADAPTER_DEST="$DEST_BASE/envoy-harness-adapter"
  CLIENT_DEST="$DEST_BASE/envoy-harness-client"
  PEER_DEST="$DEST_BASE/envoy-harness-peer"
  TUI_DEST="$DEST_BASE/envoy-harness-tui"

  # 1. Staged trees have a non-trivial number of files.
  harness_count=$(find "$HARNESS_DEST" -type f 2>/dev/null | wc -l | tr -d ' ')
  adapter_count=$(find "$ADAPTER_DEST" -type f 2>/dev/null | wc -l | tr -d ' ')
  client_count=$(find "$CLIENT_DEST" -type f 2>/dev/null | wc -l | tr -d ' ')
  peer_count=$(find "$PEER_DEST" -type f 2>/dev/null | wc -l | tr -d ' ')
  tui_count=$(find "$TUI_DEST" -type f 2>/dev/null | wc -l | tr -d ' ')
  [ "$harness_count" -gt 50 ]  || die "smoke FAIL: envoy-harness staged tree has only $harness_count files (expected 100+)"
  [ "$adapter_count" -gt 5 ]   || die "smoke FAIL: envoy-harness-adapter staged tree has only $adapter_count files (expected 10+)"
  [ "$client_count" -gt 2 ]    || die "smoke FAIL: envoy-harness-client staged tree has only $client_count files (expected 3+)"
  [ "$peer_count" -gt 5 ]      || die "smoke FAIL: envoy-harness-peer staged tree has only $peer_count files (expected 10+)"
  [ "$tui_count" -gt 10 ]      || die "smoke FAIL: envoy-harness-tui staged tree has only $tui_count files (expected 20+)"

  # 2. Main entry files present. Source package.json says main: "./dist/index.js";
  #    stage copies dist/ to dest root, so the main entry is index.js.
  [ -f "$HARNESS_DEST/index.js" ]  || die "smoke FAIL: $HARNESS_DEST/index.js missing"
  [ -f "$HARNESS_DEST/index.d.ts" ] || die "smoke FAIL: $HARNESS_DEST/index.d.ts missing"
  [ -f "$HARNESS_DEST/package.json" ] || die "smoke FAIL: $HARNESS_DEST/package.json missing"
  [ -f "$HARNESS_DEST/cli/acp-stdio.js" ] || die "smoke FAIL: $HARNESS_DEST/cli/acp-stdio.js missing (12b ACP entry)"
  [ -f "$ADAPTER_DEST/index.js" ]  || die "smoke FAIL: $ADAPTER_DEST/index.js missing"
  [ -f "$ADAPTER_DEST/index.d.ts" ] || die "smoke FAIL: $ADAPTER_DEST/index.d.ts missing"
  [ -f "$ADAPTER_DEST/package.json" ] || die "smoke FAIL: $ADAPTER_DEST/package.json missing"
  [ -f "$CLIENT_DEST/index.js" ]  || die "smoke FAIL: $CLIENT_DEST/index.js missing"
  [ -f "$CLIENT_DEST/index.d.ts" ] || die "smoke FAIL: $CLIENT_DEST/index.d.ts missing"
  [ -f "$CLIENT_DEST/package.json" ] || die "smoke FAIL: $CLIENT_DEST/package.json missing"
  [ -f "$PEER_DEST/index.js" ]  || die "smoke FAIL: $PEER_DEST/index.js missing"
  [ -f "$PEER_DEST/package.json" ] || die "smoke FAIL: $PEER_DEST/package.json missing"
  [ -f "$TUI_DEST/bin.js" ]  || die "smoke FAIL: $TUI_DEST/bin.js missing (Terminal → Envoy entry)"
  [ -f "$TUI_DEST/package.json" ] || die "smoke FAIL: $TUI_DEST/package.json missing"

  # 3. Entry files are non-empty (0-byte suggests a broken build).
  for f in "$HARNESS_DEST/index.js" "$HARNESS_DEST/index.d.ts" \
           "$HARNESS_DEST/package.json" "$HARNESS_DEST/cli/acp-stdio.js" \
           "$ADAPTER_DEST/index.js" "$ADAPTER_DEST/index.d.ts" \
           "$ADAPTER_DEST/package.json" \
           "$CLIENT_DEST/index.js" "$CLIENT_DEST/index.d.ts" \
           "$CLIENT_DEST/package.json" \
           "$PEER_DEST/index.js" "$PEER_DEST/package.json" \
           "$TUI_DEST/bin.js" "$TUI_DEST/package.json"; do
    [ -s "$f" ] || die "smoke FAIL: $f is 0 bytes (build may be broken)"
  done

  echo "  ✓ Post-stage smoke passed ($harness_count + $adapter_count + $client_count + $peer_count + $tui_count files, all entry points present and non-empty)"
fi

echo "[stage-tauri-envoy-harness-bundle] Done."
echo "  Tauri will pick up resources/envoy-harness{,-adapter,-client,-peer,-tui}/ via"
echo "  the globs in apps/tauri/src-tauri/tauri.conf.json."
echo "  ACP stdio entry: resources/envoy-harness/cli/acp-stdio.js (12b)."
echo "  TUI entry: resources/envoy-harness-tui/bin.js (Terminal → Envoy)."
echo "  Runtime resolve goes through resources/node/node_modules/@envoymesh/"
echo "  (wired by scripts/stage-bundle-node-runtime.sh — required for first launch)."
