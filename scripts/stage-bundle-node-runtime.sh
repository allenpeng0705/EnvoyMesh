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
# Dynamically discover all workspace packages that have a dist/ directory
# instead of hardcoding a list (new packages were being missed).
for pkg_dir in "$ROOT/packages"/*/; do
  pkg="$(basename "$pkg_dir")"
  # Skip vendored/unrelated packages
  case "$pkg" in
    openclaw) continue ;;
  esac
  if [ -d "$ROOT/packages/$pkg/dist" ]; then
    copy_workspace_pkg "$pkg"
  fi
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

# Safety net: scan declared deps from THREE sources and copy any that are
# missing from the staged node_modules. Catches transitive deps that
# `npm ls` silently drops (peer-dep warnings, workspace-resolution quirks).
# Without this, the bundle ships and the node process crashes at startup
# with ERR_MODULE_NOT_FOUND.
#
# Sources:
#   1. apps/node/package.json            (direct runtime deps like ws, yaml)
#   2. staged @envoymesh/*/package.json  (workspace pkg deps like zod)
#   3. packages/openclaw/package.json    (deps imported via @envoymesh/openclaw-runtime)
root_node_modules="$ROOT/node_modules"
envoymesh_scope="$DEST/node_modules/@envoymesh"
safety_net_copied=0

# Build the list of package.json files to scan.
pkg_jsons_to_scan=()
[ -f "$ROOT/apps/node/package.json" ] && pkg_jsons_to_scan+=("$ROOT/apps/node/package.json")
if [ -d "$envoymesh_scope" ]; then
  while IFS= read -r p; do
    pkg_jsons_to_scan+=("$p")
  done < <(find "$envoymesh_scope" -name package.json -type f 2>/dev/null)
fi
[ -f "$ROOT/packages/openclaw/package.json" ] && pkg_jsons_to_scan+=("$ROOT/packages/openclaw/package.json")

for pkg_json in "${pkg_jsons_to_scan[@]}"; do
  [ -f "$pkg_json" ] || continue
  # Extract dep names from package.json (handles @scope/name correctly)
  dep_names="$(node -e "
    try { const p=require(process.argv[1]); const d=p.dependencies||{}; process.stdout.write(Object.keys(d).filter(k=>!k.startsWith('@envoymesh/')).join('\n')); }
    catch(e) { /* skip */ }
  " "$pkg_json" 2>/dev/null || true)"
  [ -z "$dep_names" ] && continue
  while IFS= read -r dep_name; do
    [ -z "$dep_name" ] && continue
    dest_dep="$DEST/node_modules/$dep_name"
    [ -d "$dest_dep" ] && continue
    src_dep="$root_node_modules/$dep_name"
    [ -d "$src_dep" ] || continue
    mkdir -p "$(dirname "$dest_dep")"
    cp -R "$src_dep" "$dest_dep"
    safety_net_copied=$((safety_net_copied + 1))
  done <<< "$dep_names"
done
if [ "$safety_net_copied" -gt 0 ]; then
  echo "  Safety net: copied $safety_net_copied missing deps from root node_modules (npm ls dropped them)"
fi

# Sanity check: verify a handful of known-critical runtime deps are present.
# If any are missing, fail loudly rather than shipping a broken bundle.
for dep in zod ws yaml; do
  if [ ! -d "$DEST/node_modules/$dep" ]; then
    echo "error: critical runtime dep '$dep' missing from staged tree" >&2
    echo "       The node process will crash at startup with ERR_MODULE_NOT_FOUND." >&2
    echo "       Check that 'npm install' succeeded in the repo root." >&2
    exit 1
  fi
done

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
