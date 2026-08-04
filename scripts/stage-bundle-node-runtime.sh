#!/usr/bin/env bash
# Stage compiled EnvoyMesh node runtime (dist + workspace packages + prod npm deps).
# Used by scripts/bundle.sh and scripts/stage-tauri-node-bundle.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:?usage: stage-bundle-node-runtime.sh <dest-dir>}"

# Project version comes from the VERSION file at repo root (same source of
# truth as scripts/sync-version.mjs). Reading it here keeps the bundled
# node's synthetic package.json in sync without manual edits on every bump.
BUNDLE_VERSION="$(cat "${ROOT}/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "0.0.0")"
if ! printf '%s' "$BUNDLE_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
  echo "error: invalid VERSION '${BUNDLE_VERSION}' in ${ROOT}/VERSION" >&2
  exit 1
fi

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

cat > "$DEST/package.json" <<EOF
{
  "name": "@envoymesh/node-bundle",
  "version": "${BUNDLE_VERSION}",
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
# Safety net: FIXPOINT LOOP that repeatedly scans every package.json in
# the staged tree + seed sources, copies any missing deps from the source
# roots, until no new packages are added (fixpoint reached). Handles
# transitive deps of any depth — e.g. main-event is declared by
# @libp2p/interface, which is itself a transitive dep of @envoymesh/network.
# A single-pass scan misses these because @libp2p/interface isn't in the
# initial scan list; the fixpoint loop discovers it on pass 2 (after
# @libp2p/interface is staged), then main-event on pass 3.
#
# Without this, the bundle ships and the node process crashes at startup
# with ERR_MODULE_NOT_FOUND for whatever transitive dep is deepest.
envoymesh_scope="$DEST/node_modules/@envoymesh"
staged_node_modules="$DEST/node_modules"
dep_search_roots=(
  "$ROOT/node_modules"
  "$ROOT/apps/node/node_modules"
  "$ROOT/packages/openclaw/node_modules"
)
seed_pkgs=()
[ -f "$ROOT/apps/node/package.json" ] && seed_pkgs+=("$ROOT/apps/node/package.json")
[ -f "$ROOT/packages/openclaw/package.json" ] && seed_pkgs+=("$ROOT/packages/openclaw/package.json")

safety_net_copied=0
max_iterations=15  # fixpoint convergence guard; nested deps add depth
iter=0
while [ "$iter" -lt "$max_iterations" ]; do
  iter=$((iter + 1))
  # Build scan list: seeds + EVERY staged package's package.json,
  # INCLUDING packages nested inside other packages' node_modules/.
  # We must scan nested packages too — their declared deps need to be
  # hoisted to the top of the staged tree so Node's resolver can find
  # them. The fixpoint loop's idempotency check ([ -d $dest_dep ])
  # makes scanning nested package.json files safe.
  scan_list=("${seed_pkgs[@]}")
  if [ -d "$staged_node_modules" ]; then
    while IFS= read -r p; do
      scan_list+=("$p")
    done < <(find "$staged_node_modules" -name package.json -type f 2>/dev/null | grep -v '/node_modules/\.bin/' || true)
  fi
  copied_this_iter=0
  for pkg_json in "${scan_list[@]}"; do
    [ -f "$pkg_json" ] || continue
    # Extract non-@envoymesh dep names from package.json.
    # Include optionalDependencies — sharp's @img/sharp-<platform> natives live there.
    dep_names="$(node -e "
      try {
        const p=require(process.argv[1]);
        const keys=new Set([
          ...Object.keys(p.dependencies||{}),
          ...Object.keys(p.optionalDependencies||{}),
        ]);
        process.stdout.write([...keys].filter(k=>!k.startsWith('@envoymesh/')).join('\n'));
      } catch(e) { /* skip */ }
    " "$pkg_json" 2>/dev/null || true)"
    [ -z "$dep_names" ] && continue
    while IFS= read -r dep_name; do
      [ -z "$dep_name" ] && continue
      dest_dep="$staged_node_modules/$dep_name"
      [ -d "$dest_dep" ] && continue
      # Search all known node_modules locations for this dep.
      src_dep=""
      for nm_root in "${dep_search_roots[@]}"; do
        if [ -d "$nm_root/$dep_name" ]; then
          src_dep="$nm_root/$dep_name"
          break
        fi
      done
      [ -z "$src_dep" ] && continue
      mkdir -p "$(dirname "$dest_dep")"
      cp -R "$src_dep" "$dest_dep"
      copied_this_iter=$((copied_this_iter + 1))
    done <<< "$dep_names"
  done
  safety_net_copied=$((safety_net_copied + copied_this_iter))
  [ "$copied_this_iter" -eq 0 ] && break  # fixpoint reached
done
if [ "$safety_net_copied" -gt 0 ]; then
  echo "  Safety net: copied $safety_net_copied missing deps in $iter pass(es) (npm ls dropped them)"
fi

# Sanity check: verify a handful of known-critical runtime deps are present.
# If any are missing, fail loudly rather than shipping a broken bundle.
case "$(uname -s)" in
  Darwin) SHARP_OS=darwin ;;
  Linux) SHARP_OS=linux ;;
  MINGW*|MSYS*|CYGWIN*) SHARP_OS=win32 ;;
  *) SHARP_OS=linux ;;
esac
case "$(uname -m)" in
  arm64|aarch64) SHARP_CPU=arm64 ;;
  *) SHARP_CPU=x64 ;;
esac
# sharp@0.35: libvips is a sibling optionalDep on darwin/linux; on win32 it is
# embedded inside @img/sharp-win32-* (no @img/sharp-libvips-win32-* package).
SHARP_PLATFORM_DEPS=("@img/sharp-${SHARP_OS}-${SHARP_CPU}")
LIBVIPS_PKG="@img/sharp-libvips-${SHARP_OS}-${SHARP_CPU}"
SHARP_PKG_JSON=""
for cand in "$ROOT/node_modules/sharp/package.json" "$ROOT/apps/node/node_modules/sharp/package.json"; do
  [ -f "$cand" ] && SHARP_PKG_JSON="$cand" && break
done
PLATFORM_PKG_JSON=""
for cand in \
  "$ROOT/node_modules/@img/sharp-${SHARP_OS}-${SHARP_CPU}/package.json" \
  "$ROOT/apps/node/node_modules/@img/sharp-${SHARP_OS}-${SHARP_CPU}/package.json"
do
  [ -f "$cand" ] && PLATFORM_PKG_JSON="$cand" && break
done
if LIBVIPS_PKG="$LIBVIPS_PKG" node -e "
  const want = process.env.LIBVIPS_PKG;
  for (const f of process.argv.slice(1)) {
    if (!f) continue;
    try {
      const j = require(f);
      if ((j.optionalDependencies || {})[want]) process.exit(0);
    } catch { /* ignore */ }
  }
  process.exit(1);
" "$SHARP_PKG_JSON" "$PLATFORM_PKG_JSON" 2>/dev/null; then
  SHARP_PLATFORM_DEPS+=("$LIBVIPS_PKG")
fi

missing=""
for dep in zod ws yaml sharp main-event "@libp2p/interface" "@envoymesh/kb-obsidian" "@envoymesh/openclaw-runtime" psl "${SHARP_PLATFORM_DEPS[@]}"; do
  if [ ! -d "$DEST/node_modules/$dep" ]; then
    missing="$missing $dep"
  fi
done
if [ -n "$missing" ]; then
  echo "" >&2
  echo "  CRITICAL: missing runtime deps:$missing" >&2
  echo "  These were declared in a package.json but not found in ANY of:" >&2
  for root in "${dep_search_roots[@]}"; do echo "    - $root" >&2; done
  echo "" >&2
  echo "  Likely causes:" >&2
  echo "    1. 'npm install' did not complete successfully in the repo root" >&2
  echo "    2. The dep is nested deeper than the search roots (rare)" >&2
  echo "    3. The dep was pruned by 'npm prune --production' but is needed at runtime" >&2
  echo "    4. sharp platform optionalDeps omitted — run: npm install --os=$SHARP_OS --cpu=$SHARP_CPU sharp" >&2
  echo "" >&2
  echo "  Diagnostic: npm ls <dep> to find where it actually lives" >&2
  exit 1
fi
echo "  + sharp platform packages present (${SHARP_PLATFORM_DEPS[*]})"

# End-to-end import check: actually run Node's module resolver against
# every module the runtime entry imports. This catches missing modules
# that the file-existence check above can't — e.g. transitive deps of
# nested packages, optional native bindings, and broken "exports" maps.
# Failures here are converted from runtime crashes (which only surface
# after the user installs the bundle) into build-time errors with a
# clear list of what's missing.
echo "  End-to-end import check..."
NODE_BIN="${ENVOYMESH_NODE_EXE:-node}"
cat > "$DEST/__import_probe.mjs" <<'PROBE'
const mods = [
  // Direct npm deps
  "zod", "ws", "yaml", "psl", "nat-upnp", "sharp",
  // Deep transitive deps
  "main-event", "@libp2p/interface", "@multiformats/multiaddr",
  // Workspace packages
  "@envoymesh/protocol", "@envoymesh/api", "@envoymesh/identity",
  "@envoymesh/bonds", "@envoymesh/network", "@envoymesh/vault",
  "@envoymesh/local-store", "@envoymesh/models", "@envoymesh/rag",
  "@envoymesh/ipfs-helia", "@envoymesh/openclaw-runtime",
  "@envoymesh/kb-obsidian"
];
let failed = 0;
for (const m of mods) {
  try {
    await import(m);
  } catch (e) {
    // Fail on ANY import error — sharp throws a plain Error (not
    // ERR_MODULE_NOT_FOUND) when the platform binary is missing.
    console.error("FAIL: " + m + " — " + (e && e.message ? e.message.split("\n")[0] : e));
    failed++;
  }
}
if (failed > 0) {
  console.error("\n" + failed + " module(s) failed to resolve. The bundle will crash at startup.");
  process.exit(1);
}
console.error("All " + mods.length + " critical imports resolved.");
PROBE
(
  cd "$DEST" || exit 1
  "$NODE_BIN" ./__import_probe.mjs
)
probe_exit=$?
rm -f "$DEST/__import_probe.mjs"
if [ "$probe_exit" -ne 0 ]; then
  echo "error: end-to-end import probe failed. See FAIL lines above." >&2
  echo "       The node process would crash with ERR_MODULE_NOT_FOUND." >&2
  exit 1
fi

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

# Phase 50 — stage push notification credentials into the bundle.
# These are optional secret files the operator places at the repo root
# before building. They get bundled into the DMG/exe so the home node
# can push to EnvoyGo without the user manually copying files after install.
#
# Files (all optional — push silently skips if missing):
#   push-config.json              — credential config (keyId, teamId, topic, projectId)
#   AuthKey_*.p8                  — APNs private key (one or more)
#   serviceAccountKey.json        — FCM service account JSON (also accepts
#                                   firebase-service-account.json for older layouts)
#
# Security note: AuthKey_*.p8 and serviceAccountKey.json are SECRETS — never
# commit them (.gitignore). push-config.json may live at the repo root for
# packaging; it is copied into resources/node/ and loaded via
# ENVOYMESH_NODE_BUNDLE_DIR at runtime.
if [ -f "$ROOT/push-config.json" ]; then
  echo "  Staging bundled push-config.json..."
  cp "$ROOT/push-config.json" "$DEST/push-config.json"
fi
# Stage any .p8 APNs key files (glob — there may be one per environment).
for p8 in "$ROOT"/AuthKey_*.p8; do
  [ -f "$p8" ] || continue
  echo "  Staging bundled APNs key: $(basename "$p8")"
  cp "$p8" "$DEST/$(basename "$p8")"
done
# FCM service account — prefer the name used by push-config.json.
# If only firebase-service-account.json exists, stage it under the basename
# named in push-config (default serviceAccountKey.json) so relative paths work.
if [ -f "$ROOT/serviceAccountKey.json" ]; then
  echo "  Staging bundled FCM service account JSON (serviceAccountKey.json)..."
  cp "$ROOT/serviceAccountKey.json" "$DEST/serviceAccountKey.json"
elif [ -f "$ROOT/firebase-service-account.json" ]; then
  dest_sa="serviceAccountKey.json"
  if [ -f "$ROOT/push-config.json" ] && command -v node >/dev/null 2>&1; then
    named="$(node -e "
      try {
        const j = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
        const p = (j.fcm && j.fcm.serviceAccountJsonPath) || '';
        process.stdout.write(require('path').basename(p) || 'serviceAccountKey.json');
      } catch { process.stdout.write('serviceAccountKey.json'); }
    " "$ROOT/push-config.json" || echo "serviceAccountKey.json")"
    [ -n "$named" ] && dest_sa="$named"
  fi
  echo "  Staging bundled FCM service account JSON (firebase-service-account.json → $dest_sa)..."
  cp "$ROOT/firebase-service-account.json" "$DEST/$dest_sa"
fi
# If push-config.json names a different basename, stage that too.
if [ -f "$ROOT/push-config.json" ] && command -v node >/dev/null 2>&1; then
  sa_named="$(node -e "
    try {
      const j = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
      const p = (j.fcm && j.fcm.serviceAccountJsonPath) || '';
      process.stdout.write(require('path').basename(p));
    } catch { /* ignore */ }
  " "$ROOT/push-config.json" || true)"
  if [ -n "${sa_named}" ] && [ -f "$ROOT/$sa_named" ] && [ ! -f "$DEST/$sa_named" ]; then
    echo "  Staging bundled FCM service account JSON ($sa_named from push-config)..."
    cp "$ROOT/$sa_named" "$DEST/$sa_named"
  fi
  key_named="$(node -e "
    try {
      const j = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
      const p = (j.apns && j.apns.keyPath) || '';
      process.stdout.write(require('path').basename(p));
    } catch { /* ignore */ }
  " "$ROOT/push-config.json" || true)"
  if [ -n "${key_named}" ] && [ -f "$ROOT/$key_named" ] && [ ! -f "$DEST/$key_named" ]; then
    echo "  Staging bundled APNs key ($key_named from push-config)..."
    cp "$ROOT/$key_named" "$DEST/$key_named"
  fi
fi

# Guard: auto-bond join-invite merge must filter circuit/LAN out of bootstrap.
# Stale packages/api/dist (pre-filter) would reintroduce the Windows 5G hang.
echo "  Verifying wan-join-invite bootstrap filter in staged @envoymesh/api..."
NODE_BIN="${ENVOYMESH_NODE_EXE:-node}"
FILTER_JS="$DEST/node_modules/@envoymesh/api/dist/wan-join-invite.js"
if [ ! -f "$FILTER_JS" ]; then
  echo "  CRITICAL: missing $FILTER_JS — run npx tsc -b before packaging" >&2
  exit 1
fi
if ! grep -q "isBootstrapRelayMultiaddr" "$FILTER_JS"; then
  echo "  CRITICAL: staged wan-join-invite.js lacks isBootstrapRelayMultiaddr (stale dist)" >&2
  echo "  Rebuild with: npx tsc -b" >&2
  exit 1
fi
if ! (
  cd "$DEST" && "$NODE_BIN" --input-type=module -e '
import {
  mergeWanJoinInviteBootstrap,
  isBootstrapRelayMultiaddr,
} from "./node_modules/@envoymesh/api/dist/wan-join-invite.js";
const community =
  "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
const circuit =
  community + "/p2p-circuit/p2p/12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR";
const lan =
  "/ip4/192.168.3.85/tcp/64589/p2p/12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCS";
if (typeof isBootstrapRelayMultiaddr !== "function") {
  throw new Error("isBootstrapRelayMultiaddr missing from staged wan-join-invite.js");
}
const merged = mergeWanJoinInviteBootstrap({
  bootstrapPeers: [],
  bootstrapPresets: [],
  invite: {
    v: 1,
    createdAt: "2026-07-13T00:00:00.000Z",
    targetPeerId: "12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR",
    targetMultiaddrs: [circuit],
    bootstrapPeers: [community, lan],
    bootstrapPresets: ["cn-relay"],
  },
});
if (merged.bootstrapPeers.length !== 1 || merged.bootstrapPeers[0] !== community) {
  throw new Error("bootstrapPeers must be community relay only, got: " + JSON.stringify(merged.bootstrapPeers));
}
if (!merged.seedAddrs.includes(circuit) || !merged.seedAddrs.includes(lan)) {
  throw new Error("seedAddrs must retain circuit + LAN dial hints");
}
if (isBootstrapRelayMultiaddr(circuit) || isBootstrapRelayMultiaddr(lan)) {
  throw new Error("circuit/LAN must not pass isBootstrapRelayMultiaddr");
}
console.log("  ✓ wan-join-invite bootstrap filter OK");
'
); then
  echo "  CRITICAL: staged @envoymesh/api failed wan-join-invite filter check" >&2
  echo "  Rebuild with: npx tsc -b   (do not package a stale packages/api/dist)" >&2
  exit 1
fi

echo "  ✓ Node runtime staged at $DEST"
