#!/usr/bin/env bash
# Copy EnvoyMesh/OpenClawExtension into an OpenClaw checkout as extensions/envoymesh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/OpenClawExtension"
OPENCLAW_ROOT=""
INSTALL_DOCS=0

for arg in "$@"; do
  if [[ "$arg" == "--with-docs" ]]; then
    INSTALL_DOCS=1
  elif [[ -z "$OPENCLAW_ROOT" ]]; then
    OPENCLAW_ROOT="$arg"
  fi
done

if [[ -z "$OPENCLAW_ROOT" ]]; then
  echo "Usage: $0 <path-to-openclaw-repo> [--with-docs]" >&2
  echo "Example: $0 ../OpenClaw --with-docs" >&2
  exit 1
fi

if [[ ! -f "$SRC/index.ts" ]]; then
  echo "Missing OpenClawExtension at $SRC" >&2
  exit 1
fi

if [[ ! -d "$OPENCLAW_ROOT/extensions" ]]; then
  echo "Not an OpenClaw repo (no extensions/): $OPENCLAW_ROOT" >&2
  exit 1
fi

DEST="$OPENCLAW_ROOT/extensions/envoymesh"
mkdir -p "$DEST"

rsync -a \
  --exclude node_modules \
  --exclude dist \
  "$SRC/" "$DEST/"

if [[ "$INSTALL_DOCS" -eq 1 ]] && [[ -f "$SRC/docs/channels/envoymesh.md" ]]; then
  mkdir -p "$OPENCLAW_ROOT/docs/channels"
  cp "$SRC/docs/channels/envoymesh.md" "$OPENCLAW_ROOT/docs/channels/envoymesh.md"
  echo "Installed docs to $OPENCLAW_ROOT/docs/channels/envoymesh.md"
fi

echo "Installed EnvoyMesh channel to $DEST"
echo "Next:"
echo "  cd $OPENCLAW_ROOT && pnpm install"
echo "  openclaw onboard   # or configure channels.envoymesh in JSON"
echo "  See $ROOT/docs/openclaw-extension.md for EnvoyMesh bridge-config.json"
