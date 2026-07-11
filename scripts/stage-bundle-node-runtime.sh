#!/usr/bin/env bash
# Stage compiled EnvoyMesh node runtime (dist + workspace packages + prod npm deps).
# Used by scripts/bundle.sh and scripts/stage-tauri-node-bundle.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:?usage: stage-bundle-node-runtime.sh <dest-dir>}"

SRC="$ROOT/apps/node/dist"
if [ ! -f "$SRC/src/index.js" ]; then
  echo "error: $SRC/src/index.js not found — run: npm run node:build" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST/node_modules"

echo "  Copying compiled node entrypoints..."
mkdir -p "$DEST/dist"
cp -R "$SRC/." "$DEST/dist/"

cat > "$DEST/package.json" <<'EOF'
{
  "name": "@envoymesh/node-bundle",
  "version": "0.1.0",
  "type": "module",
  "private": true
}
EOF

copy_workspace_pkg() {
  local pkg="$1"
  local src_pkg="$ROOT/packages/$pkg"
  local dest_pkg="$DEST/node_modules/@envoymesh/$pkg"
  if [ ! -d "$src_pkg/dist" ]; then
    echo "error: missing dist for @envoymesh/$pkg — run: npm run node:build" >&2
    exit 1
  fi
  mkdir -p "$dest_pkg"
  cp "$src_pkg/package.json" "$dest_pkg/"
  cp -R "$src_pkg/dist" "$dest_pkg/"
}

echo "  Staging @envoymesh workspace packages..."
for pkg in protocol identity bonds network vault local-store api models rag ipfs-helia openclaw-runtime; do
  copy_workspace_pkg "$pkg"
done

echo "  Staging production npm dependencies..."
while IFS= read -r mod_path; do
  [ -n "$mod_path" ] || continue
  case "$mod_path" in
    "$ROOT") continue ;;
    "$ROOT/apps/node") continue ;;
    "$ROOT/node_modules/@envoymesh/node") continue ;;
    "$ROOT/packages/"*) continue ;;
    "$ROOT/node_modules/@envoymesh/"*) continue ;;
  esac
  if [ ! -f "$mod_path/package.json" ]; then
    continue
  fi
  pkg_name="$(node -e "const p=require(process.argv[1]); process.stdout.write(p.name||'')" "$mod_path/package.json")"
  [ -n "$pkg_name" ] || continue
  case "$pkg_name" in
    @envoymesh/*) continue ;;
  esac
  dest_mod="$DEST/node_modules/$pkg_name"
  if [ -d "$dest_mod" ]; then
    continue
  fi
  mkdir -p "$(dirname "$dest_mod")"
  cp -R "$mod_path" "$dest_mod"
done < <(npm ls --omit=dev -w @envoymesh/node --all --parseable 2>/dev/null || true)

SKILLS_SRC="$ROOT/apps/node/skills"
SKILLS_DEST="$DEST/skills"
if [ -d "$SKILLS_SRC" ]; then
  echo "  Staging bundled OpenClaw skills..."
  rm -rf "$SKILLS_DEST"
  mkdir -p "$SKILLS_DEST"
  cp -R "$SKILLS_SRC/." "$SKILLS_DEST/"
else
  mkdir -p "$SKILLS_DEST"
fi

if [ -f "$ROOT/envoymesh.node.example.yaml" ]; then
  cp "$ROOT/envoymesh.node.example.yaml" "$DEST/" 2>/dev/null || true
fi

if [ -f "$ROOT/bundled-sponsor-friend.json" ]; then
  echo "  Staging bundled sponsor friend config..."
  cp "$ROOT/bundled-sponsor-friend.json" "$DEST/bundled-sponsor-friend.json"
elif [ -f "$ROOT/bundled-sponsor-friend.json.example" ] && [ "${ENVOYMESH_COPY_SPONSOR_EXAMPLE:-}" = "1" ]; then
  cp "$ROOT/bundled-sponsor-friend.json.example" "$DEST/bundled-sponsor-friend.json"
fi

if [ -f "$ROOT/node-config.json" ]; then
  echo "  Staging bundled node-config.json..."
  cp "$ROOT/node-config.json" "$DEST/node-config.json"
fi

echo "  ✓ Node runtime staged at $DEST"
