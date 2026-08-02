#!/usr/bin/env bash
# Always compile OpenClawExtension → resources/openclaw-envoymesh (seed),
# then install that seed into the staged OpenClaw tree.
#
# This deliberately runs on EVERY desktop build — even when OpenClaw itself
# is reused from cache — so a stale/partial openclaw tree can never ship
# without extensions/envoymesh/index.js.
#
# Usage: bash scripts/stage-openclaw-envoymesh-extension.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_SRC="$ROOT/OpenClawExtension"
SEED="$ROOT/apps/tauri/src-tauri/resources/openclaw-envoymesh"
OC="$ROOT/apps/tauri/src-tauri/resources/openclaw"

die() { echo "error: $*" >&2; exit 1; }

[ -d "$EXT_SRC" ] || die "OpenClawExtension/ missing at repo root"
[ -f "$EXT_SRC/index.ts" ] || die "OpenClawExtension/index.ts missing"

echo "[stage-openclaw-envoymesh] Compiling seed -> $SEED"
rm -rf "$SEED"
mkdir -p "$SEED"
cp -R "$EXT_SRC"/. "$SEED/"
rm -rf "$SEED/node_modules"
# Drop OpenClaw package tsconfig — it extends ../tsconfig.package-boundary.base.json
# which is missing under the seed path and makes esbuild warn on every file.
rm -f "$SEED"/tsconfig.json "$SEED"/tsconfig.*.json \
  "$SEED"/.oxlintrc.json "$SEED"/.oxfmtrc.jsonc 2>/dev/null || true
rm -rf "$SEED/docs" "$SEED/examples" "$SEED/test" "$SEED/tests" "$SEED/.git" 2>/dev/null || true

(
  cd "$SEED"
  # Prefer local esbuild from packages/openclaw when available.
  ESBUILD="npx esbuild"
  if [ -x "$ROOT/packages/openclaw/node_modules/.bin/esbuild" ]; then
    ESBUILD="$ROOT/packages/openclaw/node_modules/.bin/esbuild"
  fi
  shopt -s nullglob
  inputs=(./*.ts)
  if [ -d src ]; then
    for f in src/*.ts; do
      case "$(basename "$f")" in *.test.ts|*.e2e.test.ts|*.live.test.ts) continue ;; esac
      inputs+=("$f")
    done
  fi
  [ "${#inputs[@]}" -gt 0 ] || die "no .ts sources found in seed"
  # Single invocation — preserves src/ layout via relative entry paths.
  $ESBUILD "${inputs[@]}" \
    --bundle=false --format=esm --platform=node \
    --outdir=. --out-extension:.js=.js --allow-overwrite \
    --log-level=warning
)

[ -f "$SEED/index.js" ] || die "seed index.js not produced — is esbuild available?"

# Drop .ts from seed — runtime only needs .js
find "$SEED" -name '*.ts' -type f -delete
# Rewrite package.json entry points to .js
if [ -f "$SEED/package.json" ] && command -v node >/dev/null 2>&1; then
  node -e "
    const fs=require('fs');
    const p=process.argv[1];
    let s=fs.readFileSync(p,'utf8');
    s=s.replace(/\.\/index\.ts/g,'./index.js').replace(/\.\/setup-entry\.ts/g,'./setup-entry.js');
    fs.writeFileSync(p,s);
  " "$SEED/package.json"
fi

echo "  ✓ seed ready ($(find "$SEED" -name '*.js' | wc -l | tr -d ' ') .js files)"

if [ ! -d "$OC" ] || [ ! -f "$OC/openclaw.mjs" ]; then
  echo "  ⚠ staged OpenClaw missing at $OC — seed only (run OpenClaw staging first for full install)"
  exit 0
fi

echo "[stage-openclaw-envoymesh] Installing seed into OpenClaw tree..."
install_into() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  cp -R "$SEED" "$dest"
}
install_into "$OC/extensions/envoymesh"
mkdir -p "$OC/dist/extensions"
install_into "$OC/dist/extensions/envoymesh"
if [ -d "$OC/dist-runtime" ]; then
  mkdir -p "$OC/dist-runtime/extensions"
  install_into "$OC/dist-runtime/extensions/envoymesh"
fi

[ -f "$OC/extensions/envoymesh/index.js" ] || die "install failed: $OC/extensions/envoymesh/index.js"
[ -f "$OC/dist/extensions/envoymesh/index.js" ] || die "install failed: $OC/dist/extensions/envoymesh/index.js"
echo "  ✓ envoymesh installed into extensions/ and dist/extensions/"
