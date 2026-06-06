#!/usr/bin/env bash
# Stage EnvoyMesh node runtime (JS + production deps) for Tauri desktop bundles.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/apps/node/dist"
DEST="$ROOT/apps/tauri/src-tauri/resources/node"

if [ ! -f "$SRC/src/index.js" ]; then
  echo "error: $SRC/src/index.js not found — run: npm run node:build" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST/node_modules"

echo "Copying compiled node entrypoints..."
cp -R "$SRC/." "$DEST/"

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

echo "Staging @envoymesh workspace packages..."
for pkg in protocol identity bonds network vault local-store api models rag ipfs-helia; do
  copy_workspace_pkg "$pkg"
done

echo "Staging production npm dependencies..."
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
  dest_mod="$DEST/node_modules/${pkg_name#@}"
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
  echo "Staging bundled OpenClaw skills..."
  rm -rf "$SKILLS_DEST"
  mkdir -p "$SKILLS_DEST"
  cp -R "$SKILLS_SRC/." "$SKILLS_DEST/"
  echo "  ✓ $(find "$SKILLS_DEST" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ') skill(s) at $SKILLS_DEST"
else
  echo "  ⚠ No apps/node/skills/ — bundled skills dir empty"
  mkdir -p "$SKILLS_DEST"
fi

echo "Staged node bundle at $DEST"
