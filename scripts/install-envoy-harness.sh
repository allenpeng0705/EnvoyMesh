#!/usr/bin/env bash
# Bootstrap the sibling envoy-harness monorepo (coding-agent runtime).
#
# EnvoyMesh depends on @envoymesh/envoy-harness* via file:../envoy-harness/...
# so the checkout must sit next to EnvoyMesh (or ENVOY_HARNESS_DIR / --local).
# PowerShell twin: scripts/install-envoy-harness.ps1
#
# Usage:
#   ./scripts/install-envoy-harness.sh
#   ./scripts/install-envoy-harness.sh --local /path/to/envoy-harness
#   ./scripts/install-envoy-harness.sh --skip-build
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_URL="${ENVOY_HARNESS_REPO_URL:-https://github.com/allenpeng0705/envoy-harness.git}"
LOCAL_PATH=""
SKIP_BUILD=0

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/install-envoy-harness.sh [options]

Options:
  --local /path/to/envoy-harness  Use an existing checkout (symlink as sibling if needed).
  --skip-build                    Skip pnpm install + build when dist already looks ready.
  -h, --help                      Show this message and exit.

Env:
  ENVOY_HARNESS_DIR       Override sibling path (default: <EnvoyMesh>/../envoy-harness)
  ENVOY_HARNESS_REPO_URL  Override git clone URL
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --local)
      [ $# -ge 2 ] || { echo "Missing value for --local" >&2; exit 1; }
      LOCAL_PATH="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; print_usage >&2; exit 1 ;;
  esac
done

DEFAULT_SIBLING="$(cd "$ROOT/.." && pwd)/envoy-harness"
HARNESS_DIR="${ENVOY_HARNESS_DIR:-$DEFAULT_SIBLING}"

harness_dist_ready() {
  local d="$1"
  [ -f "$d/packages/envoy-harness/package.json" ] || return 1
  [ -f "$d/packages/envoy-harness/dist/index.js" ] || return 1
  [ -f "$d/packages/envoy-harness-adapter/dist/index.js" ] || return 1
  [ -f "$d/packages/envoy-harness-client/dist/index.js" ] || return 1
  return 0
}

link_or_copy_local() {
  local src="$1"
  local dest="$2"
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    echo "  Sibling already present at $dest — leaving in place"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  if ln -s "$src" "$dest" 2>/dev/null; then
    echo "  ✓ Symlinked $dest -> $src"
    return 0
  fi
  echo "  Symlink failed — copying (slower)..."
  cp -R "$src" "$dest"
  echo "  ✓ Copied to $dest"
}

echo "=== EnvoyMesh envoy-harness bootstrap ==="
echo ""

# Prefer --local / ENVOY_HARNESS_DIR when pointing at a real tree.
if [ -n "$LOCAL_PATH" ]; then
  LOCAL_PATH="$(cd "$LOCAL_PATH" && pwd)"
  if [ ! -f "$LOCAL_PATH/packages/envoy-harness/package.json" ]; then
    echo "  ✗ --local path missing packages/envoy-harness/package.json: $LOCAL_PATH" >&2
    exit 1
  fi
  if [ "$LOCAL_PATH" != "$HARNESS_DIR" ]; then
    echo "  Using --local checkout: $LOCAL_PATH"
    # npm file: deps resolve ../envoy-harness from EnvoyMesh — ensure that path exists.
    if [ "$HARNESS_DIR" = "$DEFAULT_SIBLING" ]; then
      link_or_copy_local "$LOCAL_PATH" "$DEFAULT_SIBLING"
      HARNESS_DIR="$DEFAULT_SIBLING"
    else
      HARNESS_DIR="$LOCAL_PATH"
      echo "  ENVOY_HARNESS_DIR=$HARNESS_DIR (ensure package.json file: paths match, or symlink ../envoy-harness)"
    fi
  else
    HARNESS_DIR="$LOCAL_PATH"
  fi
fi

if [ ! -d "$HARNESS_DIR" ]; then
  if [ "$HARNESS_DIR" != "$DEFAULT_SIBLING" ]; then
    echo "  ✗ ENVOY_HARNESS_DIR=$HARNESS_DIR not found" >&2
    echo "    Clone envoy-harness there, or unset ENVOY_HARNESS_DIR to use ../envoy-harness" >&2
    exit 1
  fi
  if ! command -v git >/dev/null 2>&1; then
    echo "  ✗ git not found — cannot clone envoy-harness" >&2
    exit 1
  fi
  echo "  Cloning $REPO_URL -> $DEFAULT_SIBLING"
  git clone --depth 1 "$REPO_URL" "$DEFAULT_SIBLING"
  HARNESS_DIR="$DEFAULT_SIBLING"
elif [ ! -f "$HARNESS_DIR/packages/envoy-harness/package.json" ]; then
  echo "  ✗ $HARNESS_DIR exists but is not an envoy-harness monorepo" >&2
  exit 1
else
  echo "  Found envoy-harness at $HARNESS_DIR"
fi

# npm file:../envoy-harness must resolve from EnvoyMesh root.
if [ ! -e "$DEFAULT_SIBLING" ] && [ "$HARNESS_DIR" != "$DEFAULT_SIBLING" ]; then
  echo "  Linking default sibling path for npm file: deps..."
  link_or_copy_local "$HARNESS_DIR" "$DEFAULT_SIBLING"
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "  Installing pnpm..."
  npm install -g pnpm || { echo "  ✗ Could not install pnpm" >&2; exit 1; }
fi

if [ "$SKIP_BUILD" = "1" ] && harness_dist_ready "$HARNESS_DIR"; then
  echo "  ✓ envoy-harness dist ready (--skip-build)"
  exit 0
fi

if [ "$SKIP_BUILD" = "1" ]; then
  echo "  ⚠ --skip-build requested but dist incomplete — building anyway"
fi

echo "  pnpm install + build in $HARNESS_DIR ..."
(
  cd "$HARNESS_DIR"
  pnpm install
  # Match EnvoyMesh package.json "build:envoy-harness" order (client first, then all).
  pnpm --filter @envoymesh/envoy-harness-client run build
  pnpm -r run build
)

if ! harness_dist_ready "$HARNESS_DIR"; then
  echo "  ✗ envoy-harness build did not produce expected dist/ entries" >&2
  exit 1
fi

echo "  ✓ envoy-harness ready at $HARNESS_DIR"
