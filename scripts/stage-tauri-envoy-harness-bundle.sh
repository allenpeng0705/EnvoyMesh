#!/usr/bin/env bash
# Stage envoy-harness + envoy-harness-adapter for Tauri desktop bundles.
#
# Builds the sibling envoy-harness monorepo (Package 1 + Package 3) and
# copies their dist/ into the Tauri resources/ tree. The Tauri bundle
# ships those vendored files so users get a self-contained release
# without the envoy-harness monorepo on their machine.
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
  echo "[stage-tauri-envoy-harness-bundle] STAGE_ENVOY_HARNESS=0 — skipping envoy-harness staging."
  echo "  (debug escape hatch — bundle will lack envoy-harness at runtime)"
  exit 0
fi

# ---- Locate the sibling monorepo -----------------------------------------
if [ ! -d "$ENVOY_HARNESS_DIR" ]; then
  die "ENVOY_HARNESS_DIR=$ENVOY_HARNESS_DIR not found. Set ENVOY_HARNESS_DIR=/path/to/envoy-harness, or place the sibling monorepo at $ROOT/../envoy-harness. Use STAGE_ENVOY_HARNESS=0 to skip for debug."
fi

if [ ! -d "$ENVOY_HARNESS_DIR/packages/envoy-harness" ] || \
   [ ! -d "$ENVOY_HARNESS_DIR/packages/envoy-harness-adapter" ]; then
  die "$ENVOY_HARNESS_DIR/packages/envoy-harness{,-adapter} missing — wrong repo at ENVOY_HARNESS_DIR?"
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
      # clean is in the package.json scripts; it's a `rm -rf dist *.tsbuildinfo`.
      pnpm -F "$pkg" clean >/dev/null 2>&1 || true
    fi
    # tail -20 mirrors the openclaw vendor script's output limit. pipefail +
    # `|| die` ensures a failing build exits non-zero.
    pnpm -F "$pkg" build 2>&1 | tail -20
  ) || die "$label build failed — see output above. Aborting."
}

build_pkg "@envoymesh/envoy-harness" "Package 1 (envoy-harness)"
build_pkg "@envoymesh/envoy-harness-adapter" "Package 3 (envoy-harness-adapter)"

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
  # Restore the .keep sentinel so the working tree stays clean after staging.
  # Empty content is fine; .keep only exists to keep the empty dir tracked.
  touch "$dest_dir/.keep"

  local count
  count=$(find "$dest_dir" -type f | wc -l | tr -d ' ')
  echo "  ✓ $count files staged at resources/$dest_name/"
}

stage_dist "envoy-harness" "envoy-harness"
stage_dist "envoy-harness-adapter" "envoy-harness-adapter"

# ---- Post-stage smoke -----------------------------------------------------
# Asserts the staged tree has both packages, each with a non-trivial file
# count, and the main index.js + index.d.ts entry files exist + are
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

  # 1. Both staged trees have a non-trivial number of files.
  harness_count=$(find "$HARNESS_DEST" -type f 2>/dev/null | wc -l | tr -d ' ')
  adapter_count=$(find "$ADAPTER_DEST" -type f 2>/dev/null | wc -l | tr -d ' ')
  [ "$harness_count" -gt 50 ]  || die "smoke FAIL: envoy-harness staged tree has only $harness_count files (expected 100+)"
  [ "$adapter_count" -gt 5 ]   || die "smoke FAIL: envoy-harness-adapter staged tree has only $adapter_count files (expected 10+)"

  # 2. Both staged trees have the main entry file. The source package.json
  #    says main: "./dist/index.js", and the stage script copies dist/ to
  #    the root of the dest dir, so the main entry is at index.js.
  [ -f "$HARNESS_DEST/index.js" ]  || die "smoke FAIL: $HARNESS_DEST/index.js missing"
  [ -f "$HARNESS_DEST/index.d.ts" ] || die "smoke FAIL: $HARNESS_DEST/index.d.ts missing"
  [ -f "$ADAPTER_DEST/index.js" ]  || die "smoke FAIL: $ADAPTER_DEST/index.js missing"
  [ -f "$ADAPTER_DEST/index.d.ts" ] || die "smoke FAIL: $ADAPTER_DEST/index.d.ts missing"

  # 3. Both entry files are non-empty (a 0-byte file would suggest a
  #    broken build, not a missing file).
  for f in "$HARNESS_DEST/index.js" "$HARNESS_DEST/index.d.ts" \
           "$ADAPTER_DEST/index.js" "$ADAPTER_DEST/index.d.ts"; do
    [ -s "$f" ] || die "smoke FAIL: $f is 0 bytes (build may be broken)"
  done

  echo "  ✓ Post-stage smoke passed ($harness_count + $adapter_count files, all entry points present and non-empty)"
fi

echo "[stage-tauri-envoy-harness-bundle] Done."
echo "  Tauri will pick up resources/envoy-harness/ and resources/envoy-harness-adapter/ via"
echo "  the globs in apps/tauri/src-tauri/tauri.conf.json (added in this commit)."
