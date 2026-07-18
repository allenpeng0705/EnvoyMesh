#!/usr/bin/env bash
# Stage OpenClaw gateway + envoymesh extension for Tauri desktop bundles.
#
# Preferred: build packages/openclaw and copy the full tree to
#   apps/tauri/src-tauri/resources/openclaw/
# Fallback: fetch-openclaw-sidecar.sh (standalone binary only — no envoymesh extension).
#
# Usage: bash scripts/stage-tauri-openclaw-bundle.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/packages/openclaw"
DEST="$ROOT/apps/tauri/src-tauri/resources/openclaw"

# Reuse-path gate. Default behavior: reuse the staged tree at $DEST
# and skip pnpm install (network) on rebuilds. STAGE_OPENCLAW_BUNDLE=1
# forces a re-stage; =0 skips the gate entirely (debug escape hatch).
# The reuse-path also self-heals prune artefacts and the workspace
# self-reference (see below).
#
# Require node_modules/openclaw/package.json (the runtime plugin-SDK
# self-reference) to actually exist — a missing self-ref makes the
# gateway refuse to start with "OpenClaw tree is incomplete", so fall
# through to a fresh stage when it's absent instead of silently
# reusing broken cached state.
if [ "${STAGE_OPENCLAW_BUNDLE:-0}" = "0" ]; then
  : # debug escape hatch — skip the gate, fall through to stage_from_source
elif [ "${STAGE_OPENCLAW_BUNDLE:-0}" != "1" ] \
   && [ -f "$DEST/openclaw.mjs" ] \
   && [ -f "$DEST/package.json" ] \
   && [ -d "$DEST/node_modules" ] \
   && [ -f "$DEST/node_modules/openclaw/package.json" ]; then
  echo "[stage-tauri-openclaw-bundle] Reusing staged OpenClaw at $DEST"
  echo "[stage-tauri-openclaw-bundle] Set STAGE_OPENCLAW_BUNDLE=1 to force re-stage."

  # Always clean stale source-only dirs that should never be in resources/
  # (even if cached from before the exclusions were added). Tauri scans
  # ALL files under resources/ for cargo:rerun-if-changed, so 130K+ source
  # files in src/ui/apps/test/docs etc. overwhelm the build.
  STALE_DIRS="src apps docs qa test packages scripts ui config data deploy git-hooks"
  for d in $STALE_DIRS; do
    if [ -d "$DEST/$d" ]; then
      echo "  Removing stale dir: $d/"
      rm -rf "$DEST/$d"
    fi
  done

  # Validate dist/entry.js exists and is a proper build, not a broken stub.
  # EnvoyMesh writes bootstrap stubs at runtime — these reference run-main
  # and won't work without src/ (or a compiled dist/cli/run-main.js).
  # Missing dist/ entirely also triggers a re-stage.
  need_restage=false
  if [ ! -f "$DEST/dist/entry.js" ]; then
    echo "  ⚠ dist/entry.js is missing — forcing re-stage"
    echo "  Set STAGE_OPENCLAW_BUNDLE=0 to skip this check."
    need_restage=true
  elif grep -qE "EnvoyMesh bootstrap|from.*src/cli/run-main" "$DEST/dist/entry.js" 2>/dev/null; then
    echo "  ⚠ dist/entry.js is a broken stub — forcing re-stage"
    echo "  Set STAGE_OPENCLAW_BUNDLE=0 to skip this check."
    need_restage=true
  fi

  if [ "$need_restage" = false ]; then
    # Self-heal: if a previous build's pnpm prune --prod ran in the staged
    # tree (without pnpm-workspace.yaml), it moved production deps to
    # node_modules/.ignored/. Restore them — the compiled dist/*.js files
    # import these at runtime. Must handle scoped packages (@scope/name)
    # by moving individual sub-packages, not the scope directory.
    if [ -d "$DEST/node_modules/.ignored" ]; then
      restored=0
      for pkg in "$DEST/node_modules/.ignored/"*; do
        [ -d "$pkg" ] || continue
        name="$(basename "$pkg")"
        dest="$DEST/node_modules/$name"
        if [ -d "$dest" ]; then
          # Scope dir or package already exists — merge sub-packages.
          for sub in "$pkg"/*; do
            [ -d "$sub" ] || continue
            sub_name="$(basename "$sub")"
            [ -d "$dest/$sub_name" ] || { mv "$sub" "$dest/$sub_name"; restored=$((restored + 1)); }
          done
        else
          mv "$pkg" "$dest"; restored=$((restored + 1))
        fi
      done
      # Clean up empty scope dirs left behind.
      find "$DEST/node_modules/.ignored" -mindepth 1 -maxdepth 1 -type d -empty -delete 2>/dev/null || true
      rmdir "$DEST/node_modules/.ignored" 2>/dev/null || true
      if [ "$restored" -gt 0 ]; then
        echo "  Restored $restored package(s) from node_modules/.ignored/ (prune artefact)"
      fi
    fi

    # Self-heal: workspace staging doesn't create a node_modules/openclaw/
    # self-reference.  dist/*.js uses `import "openclaw/..."` for the
    # plugin SDK, and a stray pnpm prune --prod can additionally remove
    # the dir entirely.  This is the missing piece the .ignored heal
    # cannot restore (openclaw is the package being installed, not a
    # dependency of it).  Idempotent — safe to run on every reuse.
    if [ ! -f "$DEST/node_modules/openclaw/package.json" ]; then
      mkdir -p "$DEST/node_modules/openclaw"
      [ -f "$DEST/package.json" ] && ln -sfn ../../package.json "$DEST/node_modules/openclaw/package.json"
      [ -f "$DEST/openclaw.mjs" ]  && ln -sfn ../../openclaw.mjs  "$DEST/node_modules/openclaw/openclaw.mjs"
      for top in dist extensions skills; do
        if [ -d "$DEST/$top" ]; then
          ln -sfn "../../$top" "$DEST/node_modules/openclaw/$top"
        fi
      done
      if [ -f "$DEST/node_modules/openclaw/package.json" ]; then
        echo "  Restored node_modules/openclaw/ self-reference (workspace staging fix)"
      else
        echo "  ⚠ Could not restore node_modules/openclaw/ — staged tree is missing package.json" >&2
      fi
    fi
    exit 0
  fi
  # Fall through to stage_from_source below.
fi

stage_from_source() {
  echo "Staging OpenClaw from $SOURCE → $DEST"

  if [ ! -f "$SOURCE/package.json" ] && [ ! -f "$SOURCE/openclaw.mjs" ]; then
    echo "  packages/openclaw missing — running install-openclaw.sh..."
    bash "$ROOT/scripts/install-openclaw.sh"
  fi

  # If the source entry.js is a broken stub (from dev-node run or a failed
  # setup.sh build), refuse to stage it — the stub references src/ which
  # doesn't survive the rsync that excludes src/.  Rebuild openclaw to
  # produce a proper compiled entry.js first.
  # Stub markers: "EnvoyMesh bootstrap" (our runtime stub) or
  #   "from.*src/cli/run-main" (setup.sh fallback stub).
  if [ -f "$SOURCE/dist/entry.js" ] && grep -qE "EnvoyMesh bootstrap|from.*src/cli/run-main" "$SOURCE/dist/entry.js" 2>/dev/null; then
    echo "  ⚠ packages/openclaw/dist/entry.js is a stub — rebuilding openclaw source..."
    (cd "$SOURCE" && CI=true pnpm run build 2>&1 | tail -5) || {
      echo "  ✗ openclaw rebuild failed — aborting stage" >&2
      return 1
    }
    echo "  ✓ openclaw rebuilt — proper compiled entry.js ready"
  fi

  if [ ! -f "$SOURCE/package.json" ] && [ ! -f "$SOURCE/openclaw.mjs" ]; then
    echo "  ✗ OpenClaw source not available after bootstrap" >&2
    return 1
  fi

  if [ -d "$ROOT/OpenClawExtension" ]; then
    echo "  Copying EnvoyMesh channel extension..."
    mkdir -p "$SOURCE/extensions"
    rm -rf "$SOURCE/extensions/envoymesh"
    cp -R "$ROOT/OpenClawExtension" "$SOURCE/extensions/envoymesh"
    rm -rf "$SOURCE/extensions/envoymesh/node_modules"

    # Compile the extension's .ts sources to .js so the gateway can load
    # them at runtime.  The openclaw build uses `git ls-files` to discover
    # extensions — our copied extension is not git-tracked, so it won't
    # be compiled by `pnpm run build`.  We use esbuild (already in
    # openclaw's node_modules) for fast single-pass transpilation.
    echo "  Compiling EnvoyMesh extension (.ts → .js)..."
    (
      cd "$SOURCE/extensions/envoymesh"
      npx esbuild ./*.ts \
        --bundle=false --format=esm --platform=node \
        --outdir=. --out-extension:.js=.js --allow-overwrite
      # Compile src/*.ts (skip test files)
      for f in src/*.ts; do
        case "$(basename "$f")" in *.test.ts|*.e2e.test.ts|*.live.test.ts) continue;; esac
        npx esbuild "$f" \
          --bundle=false --format=esm --platform=node \
          --outdir=src --out-extension:.js=.js --allow-overwrite
      done
    ) || {
      echo "  ✗ EnvoyMesh extension compilation FAILED — aborting stage" >&2
      echo "  Ensure esbuild is available: cd packages/openclaw && pnpm install" >&2
      return 1
    }
    # Verify the critical entry point was produced
    if [ ! -f "$SOURCE/extensions/envoymesh/index.js" ]; then
      echo "  ✗ EnvoyMesh extension index.js not produced — aborting stage" >&2
      return 1
    fi
    echo "  ✓ EnvoyMesh extension compiled ($(find "$SOURCE/extensions/envoymesh" -name '*.js' | wc -l | tr -d ' ') .js files)"
  fi

  if [ -f "$SOURCE/package.json" ]; then
    echo "  Building OpenClaw (pnpm install + build)..."
    cd "$SOURCE"
    if ! command -v pnpm >/dev/null 2>&1; then
      echo "  Installing pnpm..."
      npm install -g pnpm@9 2>/dev/null || corepack enable 2>/dev/null || true
    fi
    CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -8
    CI=true pnpm exec tsx scripts/generate-bundled-channel-config-metadata.ts 2>&1 | tail -3 || true
    if CI=true pnpm run build 2>&1 | tail -8; then
      : # build succeeded
    else
      echo "  ⚠ Full build failed — writing dist/entry.js bootstrap"
      mkdir -p dist
      # Prefer the already-compiled JS over the .ts source so the stub
      # works even when src/ is excluded from the Tauri resource rsync.
      if [ -f "$SOURCE/dist/cli/run-main.js" ]; then
        cat > dist/entry.js << 'STUB'
import { runCli } from "./cli/run-main.js";
STUB
      else
        cat > dist/entry.js << 'STUB'
export * from "../src/cli/run-main.ts";
STUB
        echo "  ⚠ WARNING: entry.js references src/ — ensure src/ is not excluded from rsync"
      fi
    fi
    cd "$ROOT"
  fi

  rm -rf "$DEST"
  mkdir -p "$DEST"
  # IMPORTANT: all excludes must start with "/" to anchor to the top-level of
  # the source tree.  Without the leading slash, rsync matches the pattern at
  # EVERY directory depth — e.g. "--exclude src" also drops dist/plugin-sdk/src/
  # (4200+ runtime .js files!) and "--exclude config" drops dist/config/config.js.
  rsync -a \
    --exclude /.git \
    --exclude /.turbo \
    --exclude /target \
    --exclude /node_modules \
    --exclude /src \
    --exclude /apps \
    --exclude /docs \
    --exclude /ui \
    --exclude /scripts \
    --exclude /qa \
    --exclude /test \
    --exclude /packages \
    --exclude /config \
    --exclude /data \
    --exclude /deploy \
    --exclude /git-hooks \
    --exclude /pnpm-workspace.yaml \
    "$SOURCE/" "$DEST/"

  # Copy node_modules separately (needed at runtime).
  if [ -d "$SOURCE/node_modules" ]; then
    cp -R "$SOURCE/node_modules" "$DEST/node_modules"
  fi

  # Install clawhub CLI into the staged tree so the "Installed" skills tab
  # works in the DMG.  clawhub is a separate npm package (not part of
  # openclaw's deps) — without it, `clawhub list` fails and the tab shows
  # "__clawhub_missing__".
  if [ ! -f "$DEST/node_modules/.bin/clawhub" ] || [ ! -f "$DEST/node_modules/clawhub/package.json" ]; then
    echo "  Installing clawhub CLI into staged node_modules..."
    (cd "$DEST" && npm install --no-save clawhub 2>&1 | tail -3) || {
      echo "  ⚠ clawhub install failed — 'Installed' skills tab will be unavailable"
    }
    if [ -f "$DEST/node_modules/.bin/clawhub" ]; then
      echo "  ✓ clawhub CLI installed"
    fi
  fi

  # Sanity check: dist/ should have >10,000 files (13K+ is normal).
  # A broken rsync or exclude misconfiguration can silently strip files.
  dist_count=$(find "$DEST/dist" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "$dist_count" -lt 10000 ]; then
    echo "  ⚠ WARNING: dist/ has only $dist_count files (expected 13000+). Staged tree may be incomplete."
    echo "  Run: STAGE_OPENCLAW_BUNDLE=1 bash scripts/stage-tauri-openclaw-bundle.sh"
  fi

  # Self-heal: if the source tree had pnpm prune --prod run without
  # pnpm-workspace.yaml (e.g. stray build), packages may be in .ignored/.
  # Restore them so the staged tree has everything dist/*.js imports.
  # Must handle scoped packages by merging sub-packages.
  if [ -d "$DEST/node_modules/.ignored" ]; then
    restored=0
    for pkg in "$DEST/node_modules/.ignored/"*; do
      [ -d "$pkg" ] || continue
      name="$(basename "$pkg")"
      dest="$DEST/node_modules/$name"
      if [ -d "$dest" ]; then
        for sub in "$pkg"/*; do
          [ -d "$sub" ] || continue
          sub_name="$(basename "$sub")"
          [ -d "$dest/$sub_name" ] || { mv "$sub" "$dest/$sub_name"; restored=$((restored + 1)); }
        done
      else
        mv "$pkg" "$dest"; restored=$((restored + 1))
      fi
    done
    find "$DEST/node_modules/.ignored" -mindepth 1 -maxdepth 1 -type d -empty -delete 2>/dev/null || true
    rmdir "$DEST/node_modules/.ignored" 2>/dev/null || true
    if [ "$restored" -gt 0 ]; then
      echo "  Restored $restored package(s) from node_modules/.ignored/"
    fi
  fi

  # Self-heal: workspace staging doesn't create a node_modules/openclaw/
  # self-reference.  dist/*.js uses `import "openclaw/..."` for the plugin
  # SDK, and a stray pnpm prune --prod can additionally remove the dir
  # entirely.  Point node_modules/openclaw at the staged tree root via
  # symlinks so import resolution matches a published-tarball install.
  # This is the missing piece the .ignored heal cannot restore (openclaw
  # is the package being installed, not a dependency of it).
  if [ ! -f "$DEST/node_modules/openclaw/package.json" ]; then
    mkdir -p "$DEST/node_modules/openclaw"
    # package.json + openclaw.mjs: top-level files in the staged tree.
    if [ -f "$DEST/package.json" ]; then
      ln -sfn ../../package.json "$DEST/node_modules/openclaw/package.json"
    fi
    if [ -f "$DEST/openclaw.mjs" ]; then
      ln -sfn ../../openclaw.mjs "$DEST/node_modules/openclaw/openclaw.mjs"
    fi
    # dist/, extensions/, skills/: top-level dirs the plugin SDK reads.
    for top in dist extensions skills; do
      if [ -d "$DEST/$top" ]; then
        ln -sfn "../../$top" "$DEST/node_modules/openclaw/$top"
      fi
    done
    if [ -f "$DEST/node_modules/openclaw/package.json" ]; then
      echo "  Restored node_modules/openclaw/ as self-reference (workspace staging fix)"
    else
      echo "  ⚠ Could not restore node_modules/openclaw/ — staged tree is missing package.json" >&2
    fi
  fi

  # Install the compiled envoymesh extension into the OpenClaw plugin discovery
  # directories.  OpenClaw's resolveBundledDirFromPackageRoot() scans:
  #   1. dist/extensions/     (source checkout with built tree)
  #   2. dist-runtime/extensions/  (runtime tree — preferred in DMG bundles)
  #   3. extensions/         (source tree fallback)
  # In the DMG (not a source checkout), if BOTH dist/extensions/ AND
  # dist-runtime/extensions/ exist, it picks dist-runtime/extensions/.
  # The envoymesh extension is in extensions/ but must also be in whichever
  # discovery root OpenClaw actually picks.  Install into ALL of them.
  #
  # Also fix package.json entry points: the source declares
  #   "openclaw.extensions": ["./index.ts"]
  # but in the DMG only .js files exist (no tsx/jiti). Rewrite to .js.
  OPENCLAW_BUNDLED_EXT_DIRS="$DEST/dist/extensions $DEST/dist-runtime/extensions $DEST/extensions"
  if [ -d "$DEST/extensions/envoymesh" ]; then
    for ext_target_base in $OPENCLAW_BUNDLED_EXT_DIRS; do
      [ -d "$ext_target_base" ] || continue
      [ -d "$ext_target_base/envoymesh" ] && continue  # already installed
      echo "  Installing envoymesh into $(basename "$(dirname "$ext_target_base")")/$(basename "$ext_target_base")/..."
      cp -R "$DEST/extensions/envoymesh" "$ext_target_base/envoymesh"
      # Remove leftover .ts source files — only .js is needed at runtime
      find "$ext_target_base/envoymesh" -name '*.ts' -delete 2>/dev/null || true
      # Fix package.json: replace .ts references with .js
      if [ -f "$ext_target_base/envoymesh/package.json" ]; then
        if command -v python3 >/dev/null 2>&1; then
          python3 -c "
import json, sys
p = sys.argv[1]
with open(p) as f: d = json.load(f)
oc = d.get('openclaw', {})
if 'extensions' in oc:
  oc['extensions'] = [e.replace('.ts', '.js') for e in oc['extensions']]
if 'setupEntry' in oc:
  oc['setupEntry'] = oc['setupEntry'].replace('.ts', '.js')
d['openclaw'] = oc
with open(p, 'w') as f: json.dump(d, f, indent=2); f.write('\n')
" "$ext_target_base/envoymesh/package.json"
        else
          sed -i '' 's|"./index.ts"|"./index.js"|g; s|"./setup-entry.ts"|"./setup-entry.js"|g' \
            "$ext_target_base/envoymesh/package.json"
        fi
      fi
      # Verify the critical files exist
      if [ ! -f "$ext_target_base/envoymesh/index.js" ] || \
         [ ! -f "$ext_target_base/envoymesh/openclaw.plugin.json" ]; then
        echo "  ✗ envoymesh plugin incomplete in $ext_target_base — aborting" >&2
        return 1
      fi
    done
    js_count=$(find "$DEST/extensions/envoymesh" -name '*.js' | wc -l | tr -d ' ')
    echo "  ✓ envoymesh installed in all plugin discovery roots ($js_count .js files each)"
  fi

  # Prune unused OpenClaw extensions — the full set is ~143 dirs with
  # production node_modules deps totalling ~2.2 GB. EnvoyMesh only uses
  # ~13 (envoymesh channel + web search providers). Keeping all of them
  # pushes the NSIS installer past its 2 GB hard cap and the build fails.
  # Prune ALL extension directories: dist/extensions/, dist-runtime/extensions/,
  # and extensions/.
  OPENCLAW_EXTENSIONS_ALLOWLIST="envoymesh duckduckgo brave exa firecrawl google xai moonshot minimax ollama perplexity searxng tavily"
  for ext_base in $OPENCLAW_BUNDLED_EXT_DIRS; do
    [ -d "$ext_base" ] || continue
    removed=0
    for ext_dir in "$ext_base"/*/; do
      ext_name="$(basename "$ext_dir")"
      # shellcheck disable=SC2086
      if ! echo " $OPENCLAW_EXTENSIONS_ALLOWLIST " | grep -q " $ext_name "; then
        rm -rf "$ext_dir"
        removed=$((removed + 1))
      fi
    done
    if [ "$removed" -gt 0 ]; then
      echo "  Pruned $removed unused extensions from $(basename "$(dirname "$ext_base")")/$(basename "$ext_base")/"
    fi
  done

  # NOTE: We do NOT run `pnpm prune --prod` here in the staged tree.
  # The staged tree is missing pnpm-workspace.yaml and packages/, so pnpm
  # sees it as a plain single package. The root package.json has hundreds of
  # dependencies that pnpm resolves via workspace sub-packages — without
  # those sub-packages, pnpm concludes most deps (json5, chalk, express, ws,
  # etc.) are orphaned and moves them to node_modules/.ignored/. But the
  # compiled dist/*.js files still import them at runtime → ERR_MODULE_NOT_FOUND.
  # The first prune (in the source tree, above) already removed devDeps while
  # the workspace structure was intact, so the copied node_modules is correct.

  # Clean up dangling symlinks in node_modules/.bin/ left behind by prune.
  # Tauri scans every file under resources/ and fails on missing targets.
  if [ -d "$DEST/node_modules/.bin" ]; then
    cleaned=0
    for bin in "$DEST/node_modules/.bin/"*; do
      [ -L "$bin" ] && [ ! -e "$bin" ] && { rm "$bin"; cleaned=$((cleaned + 1)); }
    done
    if [ "$cleaned" -gt 0 ]; then
      echo "  Removed $cleaned dangling symlinks from node_modules/.bin/"
    fi
  fi

  if [ ! -f "$DEST/openclaw.mjs" ] && [ ! -f "$DEST/package.json" ]; then
    echo "  ✗ Staged tree missing openclaw.mjs/package.json" >&2
    return 1
  fi

  echo "  ✓ OpenClaw staged at $DEST"

  # Post-stage smoke: spawn the gateway on an unused loopback port and
  # assert it registers its HTTP route within SMOKE_TIMEOUT seconds.
  # Catches "OpenClaw tree is incomplete" and similar bundle defects
  # at staging time instead of letting them ship and then fail inside
  # the user's `.app`. Disable with SMOKE_OPENCLAW=0.
  if [ "${SMOKE_OPENCLAW:-1}" = "1" ]; then
    echo
    echo "[stage-tauri-openclaw-bundle] Running post-stage smoke (set SMOKE_OPENCLAW=0 to skip)..."
    if ! SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-60}" \
         OPENCLAW_DIR="$DEST" \
         bash "$ROOT/scripts/smoke-openclaw-bundle.sh"; then
      echo "  ✗ Post-stage smoke FAILED — gateway could not start cleanly" >&2
      echo "  Re-run with SMOKE_OPENCLAW=0 to bypass (NOT recommended for release builds)" >&2
      return 1
    fi
  fi
}

if stage_from_source; then
  exit 0
fi

echo "  Falling back to standalone OpenClaw binary..."
bash "$ROOT/scripts/fetch-openclaw-sidecar.sh"
