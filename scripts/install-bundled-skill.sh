#!/usr/bin/env bash
# Install a ClawHub skill into apps/node/skills/ for bundling with EnvoyMesh.
#
# ClawHub installs into <workdir>/skills/<slug>/ — we stage under a temp workspace,
# then copy into the canonical bundled path used by ensureOpenClawWorkspace().
#
# Usage:
#   ./scripts/install-bundled-skill.sh tavily
#   ./scripts/install-bundled-skill.sh owner/slug   # if your clawhub version supports it
#
# Prerequisites: npm i -g clawhub && clawhub login

set -euo pipefail

if [ $# -lt 1 ] || [ -z "${1:-}" ]; then
  echo "Usage: $0 <skill-slug>" >&2
  echo "Example: $0 tavily" >&2
  exit 1
fi

SLUG="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$ROOT/.bundled-skills-staging/openclaw-workspace"
DEST="$ROOT/apps/node/skills"

if ! command -v clawhub >/dev/null 2>&1; then
  echo "clawhub CLI not found. Install: npm i -g clawhub && clawhub login" >&2
  exit 1
fi

mkdir -p "$STAGE/skills" "$DEST"

echo "Installing ClawHub skill '$SLUG' into staging workspace..."
clawhub install "$SLUG" --workdir "$STAGE"

BASENAME="$(basename "$SLUG")"
SRC="$STAGE/skills/$BASENAME"
if [ ! -d "$SRC" ]; then
  # ClawHub may use the full slug as directory name
  SRC="$STAGE/skills/$SLUG"
fi
if [ ! -f "$SRC/SKILL.md" ]; then
  echo "Install failed — expected $SRC/SKILL.md" >&2
  echo "Contents of $STAGE/skills:" >&2
  ls -la "$STAGE/skills" >&2 || true
  exit 1
fi

rm -rf "$DEST/$BASENAME"
cp -R "$SRC" "$DEST/$BASENAME"

echo ""
echo "✓ Bundled skill installed:"
echo "  $DEST/$BASENAME/"
echo ""
echo "Commit apps/node/skills/$BASENAME/ to ship with EnvoyMesh."
echo "Add API keys at runtime via bridge-config.json → skillApiKeys (do not commit secrets)."
