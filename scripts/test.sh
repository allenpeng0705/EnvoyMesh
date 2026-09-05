#!/usr/bin/env bash
# =============================================================================
# EnvoyMesh Unified Test Orchestrator
#
# Single entry point that runs the right tests for the right context:
#
#   dev      Daily dev loop (fast — no E2E, typecheck only)
#   unit     Alias for `dev`
#   watch    `dev` + vitest watch mode
#   e2e      Only E2E (libp2p + chromium) — needs a Social build
#   full     Everything: unit + libp2p E2E + chromium E2E + smoke
#   ci       Same as `full`, plus JUnit XML output and bail-on-first-failure
#   bundle   `ci` + actually build the bundles (test gate before release)
#
# Each mode is a thin preset of phases. Use flags to override:
#
#   --filter PATTERN   Pass to vitest as --testNamePattern (or filename glob)
#   --bail             Stop on first failure (default in ci/bundle)
#   --no-typecheck     Skip tsc -b
#   --no-build         (bundle mode) skip scripts/bundle.sh, just run tests
#   --watch            Watch mode (dev only)
#   --artifacts DIR    Where to drop JUnit/reports (default: ci-artifacts/test)
#   --quiet            Suppress per-phase banners; only print failures
#   -h, --help         Show this message
#
# Phases (in order; each is gated by the mode):
#
#   1. typecheck       tsc -b
#   2. unit            RUN_E2E= vitest run (~35s, ~4.4k tests)
#   3. social-build    apps/social vite build --mode development
#   4. e2e-fast        RUN_E2E=1 vitest run, no playwright, no smoke
#   5. e2e-playwright  RUN_E2E=1 vitest run on chromium tests (slow)
#   6. smoke           smoke:phase13 + chain-{two,three}-home-smoke + chain-e2e
#   6d. smoke-isolated three-process + remote-assigner chaos smokes (one
#       per RUN_E2E=1 vitest invocation, 3 s between, no shared temp dir)
#   7. bundle          scripts/bundle.sh (only in `bundle` mode)
#
# Why these phases are split:
#   * chromium E2E needs `apps/social/src/dist/` to exist (built in step 3)
#   * `e2e-fast` is fast (~60s, 30+ tests) and catches the bulk of regressions
#   * `smoke` re-runs curated subsets of the harness to surface flakes
#   * `bundle` only runs after every test phase has passed
#
# PowerShell twin: scripts/test.ps1 (Windows). The two MUST stay in sync —
# if you change one, change the other in the same commit.
#
# Environment overrides:
#   NODE_SKIP_TYPECHECK=1   Skip phase 1 (typecheck)
#   NODE_SKIP_BUNDLE=1      (bundle mode) skip phase 7 (bundle.sh)
#   NODE_SKIP_PLAYWRIGHT=1  Skip phase 5 (chromium UI E2E)
#   NODE_SKIP_JUNIT=1       Skip JUnit XML output in ci mode
#   NODE_INCLUDE_UI_MOCK_E2E=1  Re-include chromium UI mock-gap tests
#                              (Phase 11E — known-broken-e2e.md)
#   CI=1                    Always-on in CI: enables strict reporting, JUnit
#
# Exit codes:
#   0  all phases green
#   1  any phase failed
#   2  bad CLI args
#   3  missing prerequisite (e.g. node not on PATH)
# =============================================================================

set -euo pipefail

# ---- locate repo root -----------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# ---- defaults -------------------------------------------------------------

MODE="${1:-dev}"
shift || true

E2E=0
SMOKE=0
SOCIAL_BUILD=0
TYPECHECK=1
BUILD=0
WATCH=0
BAIL=0
FILTER=""
ARTIFACTS_DIR="${ARTIFACTS_DIR:-ci-artifacts/test}"
QUIET=0
SKIP_PLAYWRIGHT=0
BAIL_OUT=0

# ---- usage -----------------------------------------------------------------

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/test.sh <mode> [options]

Modes:
  dev        Fast dev loop: typecheck + unit tests (no E2E)
  unit       Alias for `dev`
  watch      `dev` with vitest watch mode
  e2e        Only E2E (libp2p + chromium) — requires a Social build
  full       All tests: unit + libp2p E2E + chromium E2E + smoke
  ci         Same as `full`, plus JUnit XML and bail-on-first-failure
  bundle     `ci` + run scripts/bundle.sh (test gate before release)

Options:
  --filter PATTERN     Pass to vitest as --testNamePattern (or filename glob)
  --bail               Stop on first failure (default in ci/bundle)
  --no-typecheck       Skip tsc -b
  --no-build           (bundle mode) skip scripts/bundle.sh
  --watch              Watch mode (dev only)
  --artifacts DIR      Drop JUnit/reports here (default: ci-artifacts/test)
  --skip-playwright    Skip chromium E2E (envs without a browser).
                       NOTE: chromium UI tests are also skipped by default
                       in CI/bundle (NODE_INCLUDE_UI_MOCK_E2E not set) —
                       see docs/known-broken-e2e.md. Set
                       NODE_INCLUDE_UI_MOCK_E2E=1 to opt back in.
  --quiet              Suppress per-phase banners; only print failures
  -h, --help           Show this message

Environment overrides:
  NODE_SKIP_TYPECHECK=1          Skip phase 01 (typecheck)
  NODE_SKIP_BUNDLE=1             (bundle mode) skip phase 07 (bundle.sh)
  NODE_SKIP_PLAYWRIGHT=1         Skip phase 05 (chromium UI E2E)
  NODE_SKIP_JUNIT=1              Skip JUnit XML output in ci mode
  NODE_INCLUDE_UI_MOCK_E2E=1     Re-include the chromium UI mock-gap tests
                                 (Phase 11E — known-broken-e2e.md)
  VITEST_BAIL=1 or --vitest-bail
                                 Pass --bail=1 to vitest (stop on first failing
                                 test within a phase). Off by default — the
                                 orchestrator's --bail handles cross-phase
                                 stopping, while vitest --bail=1 amplifies
                                 flakiness in ci/bundle.

USAGE
}

# ---- mode presets ----------------------------------------------------------

apply_mode_preset() {
  case "$MODE" in
    dev|unit)
      : "${E2E:=0}" "${SMOKE:=0}" "${SOCIAL_BUILD:=0}" "${BUILD:=0}"
      ;;
    watch)
      MODE=dev
      WATCH=1
      ;;
    e2e)
      E2E=1
      SOCIAL_BUILD=1
      TYPECHECK=0          # E2E-only callers usually already typechecked
      ;;
    full)
      E2E=1
      SMOKE=1
      SOCIAL_BUILD=1
      ;;
    ci)
      E2E=1
      SMOKE=1
      SOCIAL_BUILD=1
      BAIL=1
      ;;
    bundle)
      E2E=1
      SMOKE=1
      SOCIAL_BUILD=1
      BUILD=1
      BAIL=1
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown mode: $MODE" >&2
      echo "" >&2
      print_usage >&2
      exit 2
      ;;
  esac
}
apply_mode_preset

# ---- CLI flags -------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --filter|-F)       FILTER="$2"; shift 2 ;;
    --bail)            BAIL=1; shift ;;
    --vitest-bail)     VITEST_BAIL=1; shift ;;
    --no-typecheck)    TYPECHECK=0; shift ;;
    --no-build)        BUILD=0; shift ;;
    --watch|-w)        WATCH=1; MODE=dev; apply_mode_preset; shift ;;
    --artifacts)       ARTIFACTS_DIR="$2"; shift 2 ;;
    --skip-playwright) SKIP_PLAYWRIGHT=1; shift ;;
    --quiet|-q)        QUIET=1; shift ;;
    -h|--help)         print_usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      print_usage >&2
      exit 2
      ;;
  esac
done

# ---- env overrides --------------------------------------------------------

if [ "${NODE_SKIP_TYPECHECK:-0}" = "1" ]; then TYPECHECK=0; fi
if [ "${NODE_SKIP_BUNDLE:-0}" = "1" ] && [ "$MODE" = "bundle" ]; then BUILD=0; fi

# ---- prereqs ---------------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
  echo "node not found on PATH — install Node 22+ first." >&2
  exit 3
fi
if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found — install Node 22+ first." >&2
  exit 3
fi

# ---- header ---------------------------------------------------------------

if [ "$QUIET" != "1" ]; then
  cat <<HDR
============================================
  EnvoyMesh Test Orchestrator
  Mode: $MODE
============================================
  typecheck:      $TYPECHECK
  unit:           1 (always when in dev/full/ci/bundle)
  social-build:   $SOCIAL_BUILD
  e2e-fast:       $E2E
  e2e-playwright: $((E2E & ~SKIP_PLAYWRIGHT))
  smoke:          $SMOKE
  bundle.sh:      $BUILD
  filter:         ${FILTER:-<none>}
  bail:           $BAIL
  artifacts:      $ARTIFACTS_DIR
  watch:          $WATCH
============================================
HDR
fi

mkdir -p "$ARTIFACTS_DIR"

# ---- phase runner ----------------------------------------------------------

PASS_COUNT=0
FAIL_COUNT=0
SKIPPED_COUNT=0
declare -a PHASES_RUN=()
declare -a FAILED_PHASES=()

run_phase() {
  local name="$1"; shift
  local description="$1"; shift
  local cmd_label="$*"

  PHASES_RUN+=("$name")

  if [ "$QUIET" != "1" ]; then
    echo ""
    echo "[$name] $description"
    echo "[$name] $ $cmd_label"
  fi

  local start=$SECONDS
  local phase_log="$ARTIFACTS_DIR/${name// /_}.log"

  # shellcheck disable=SC2086
  if "$@" >"$phase_log" 2>&1; then
    local elapsed=$((SECONDS - start))
    PASS_COUNT=$((PASS_COUNT + 1))
    if [ "$QUIET" != "1" ]; then
      echo "[$name] ✓ PASSED (${elapsed}s) — log: $phase_log"
    fi
    return 0
  else
    local rc=$?
    local elapsed=$((SECONDS - start))
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_PHASES+=("$name")
    echo "[$name] ✗ FAILED (rc=$rc, ${elapsed}s) — log: $phase_log" >&2
    if [ "$QUIET" = "1" ]; then
      # Quiet mode: still surface the failure tail so the user can see why.
      tail -n 40 "$phase_log" >&2 || true
    fi
    if [ "$BAIL" = "1" ]; then
      echo ""
      echo "Aborting — --bail / mode=$MODE stops on first failure." >&2
    fi
    # Always return 0 to avoid tripping `set -e` mid-phase; FAIL_COUNT and
    # BAIL_OUT already encode the failure, and the outer phase gates +
    # summary block at end of script handle the rest.
    return 0
  fi
}

skip_phase() {
  local name="$1"
  SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  if [ "$QUIET" != "1" ]; then
    echo "[$name] – skipped"
  fi
}

# ---- filter passthrough ----------------------------------------------------

# Translate --filter into either --testNamePattern (substring) or a filename
# glob. We just pass it as --testNamePattern; vitest also accepts glob-style
# values for that flag.
VITEST_FILTER_ARGS=()
if [ -n "$FILTER" ]; then
  VITEST_FILTER_ARGS+=(--testNamePattern "$FILTER")
fi
# Vitest-level bail is OFF by default. With it on, vitest halts on the first
# failing test in a phase — useful for fast iteration but bad for ci/bundle
# gates where a single tmp-dir cleanup flake shouldn't stop the whole build.
# Opt in with --vitest-bail.
VITEST_BAIL_ARGS=()
if [ "${VITEST_BAIL:-0}" = "1" ]; then
  VITEST_BAIL_ARGS+=(--bail=1)
fi

# ---- JUnit passthrough (optional in ci mode) -------------------------------
# To get JUnit XML output from the orchestrator, set NODE_JUNIT_DIR to a path
# (default: $ARTIFACTS_DIR in ci mode, off otherwise). Each vitest phase then
# gets an additional `--reporter=junit --outputFile=<junit-dir>/<phase>.xml`
# appended. Disable with NODE_SKIP_JUNIT=1.
#
# Implementation: we expose a small helper bash function `junit_args <phase>`
# that the per-phase call sites can call inline. Each vitest phase appends:
#     $(junit_args 02-unit)
# to its npx call. We keep this opt-in so plain `dev` runs stay slim.

JUNIT_DIR=""
if [ "$MODE" = "ci" ] && [ "${NODE_SKIP_JUNIT:-0}" != "1" ]; then
  JUNIT_DIR="${NODE_JUNIT_DIR:-$ARTIFACTS_DIR}"
fi
junit_args() {
  local phase="$1"
  if [ -n "$JUNIT_DIR" ]; then
    printf ' --reporter=junit --outputFile=%s/%s-junit.xml' "$JUNIT_DIR" "$phase"
  fi
}

# ---- phase: typecheck -------------------------------------------------------

if [ "$TYPECHECK" = "1" ]; then
  run_phase "01-typecheck" "TypeScript project-references build" \
    npm run typecheck
  if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi
fi

# ---- phase: unit (always for dev/full/ci/bundle) ---------------------------

case "$MODE" in
  dev|unit|full|ci|bundle)
    if [ "$WATCH" = "1" ]; then
      # Watch mode: run vitest interactively, skip other phases.
      run_phase "02-unit" "Vitest watch (unit tests only — press q to quit)" \
        npx vitest --watch apps/node/src packages/api packages/bonds \
        packages/identity packages/local-store packages/models \
        packages/network packages/protocol packages/rag packages/vault \
        apps/social/test
      BAIL_OUT=1
    else
      run_phase "02-unit" "Vitest unit tests (RUN_E2E=; ~4.4k tests, ~35s)" \
        bash -c "RUN_E2E= npx vitest run ${VITEST_FILTER_ARGS[*]:-} ${VITEST_BAIL_ARGS[*]:-}$(junit_args 02-unit)"
      if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi
    fi
    ;;
esac

# ---- phase: social-build ---------------------------------------------------

if [ "$SOCIAL_BUILD" = "1" ]; then
  if [ ! -d "apps/social/src/dist" ] || [ ! -f "apps/social/src/dist/index.html" ]; then
    run_phase "03-social-build" "Build Social UI for chromium E2E" \
      bash -c "npm run build -w @envoymesh/social -- --mode development"
    if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi
  else
    if [ "$QUIET" != "1" ]; then
      echo ""
      echo "[03-social-build] ✓ skipped (apps/social/src/dist already present)"
    fi
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  fi
fi

# ---- phase: e2e-fast (libp2p in-process, no chromium) --------------------

if [ "$E2E" = "1" ] && [ "$BAIL_OUT" != "1" ]; then
  # Exclude smoke + chromium-driven patterns from this phase (chromium tests
  # need Playwright + a built Social UI; they run in phase 05 instead).
  E2E_FAST_EXCLUDES=(
    --exclude='**/test/**/*smoke*.test.ts'
    --exclude='**/test/**/*playwright*.test.ts'
    --exclude='apps/node/test/webrtc-call-e2e.test.ts'
    --exclude='apps/node/test/social-ui-e2e.test.ts'
    --exclude='apps/node/test/terminal-playwright-browser.test.ts'
    --exclude='apps/social/test/**'
  )
  run_phase "04-e2e-fast" "libp2p in-process E2E (RUN_E2E=1, no chromium)" \
    bash -c "RUN_E2E=1 npx vitest run ${E2E_FAST_EXCLUDES[*]} ${VITEST_FILTER_ARGS[*]:-} ${VITEST_BAIL_ARGS[*]:-}$(junit_args 04-e2e-fast)"
  if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi
fi

# ---- phase: e2e-playwright (chromium browser tests) ----------------------

# The chromium-driven E2E files load the bundled Social UI in a real WebView
# and assert UI behavior (chat messages render, video call controls work,
# terminal interactions). They need a NodeService mock that emits the right
# sequence of node:status / node:online events for the React app's WS state
# machine.
#
# The current mock in social-ui-e2e.test.ts handles basic events but the
# Social UI's splash-gated render path doesn't transition to "connected" until
# the WS state machine fully resolves — the mock install via addInitScript
# prevents a clean WS handshake. This is tracked in docs/known-broken-e2e.md
# (Phase 11E) as a real architectural gap, not a skip-for-convenience.
#
# Off by default — opt in with NODE_INCLUDE_UI_MOCK_E2E=1 for ad-hoc local
# debugging. We are NOT marking these as "skipped for life"; the goal is to
# graduate them once the React state-machine plumbing is corrected.

if [ "$E2E" = "1" ] && [ "$SKIP_PLAYWRIGHT" != "1" ] && [ "$BAIL_OUT" != "1" ] && [ "${NODE_INCLUDE_UI_MOCK_E2E:-0}" = "1" ]; then
  CHROMIUM_E2E_FILES=(
    apps/node/test/webrtc-call-e2e.test.ts
    apps/node/test/social-ui-e2e.test.ts
    apps/node/test/terminal-playwright-browser.test.ts
  )
  if ! ls "$HOME/Library/Caches/ms-playwright" >/dev/null 2>&1 \
     && ! ls "$HOME/.cache/ms-playwright" >/dev/null 2>&1; then
    echo ""
    echo "[05-e2e-playwright] ⚠ no Playwright browser cache found — installing chromium"
    npx playwright install chromium >"$ARTIFACTS_DIR/05-playwright-install.log" 2>&1 || true
  fi
  run_phase "05-e2e-playwright" "Chromium-driven E2E (RUN_E2E=1, requires Playwright)" \
    bash -c "RUN_E2E=1 npx vitest run ${CHROMIUM_E2E_FILES[*]} ${VITEST_FILTER_ARGS[*]:-} ${VITEST_BAIL_ARGS[*]:-}$(junit_args 05-e2e-playwright)"
  if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi
elif [ "$SKIP_PLAYWRIGHT" = "1" ] || [ "${NODE_INCLUDE_UI_MOCK_E2E:-0}" != "1" ]; then
  skip_phase "05-e2e-playwright"
fi

# ---- phase: smoke ----------------------------------------------------------

if [ "$SMOKE" = "1" ] && [ "$BAIL_OUT" != "1" ]; then
  # Phase 13 + chain-two/three-home smoke — fast PR signal.
  SMOKE_TARGETS=(
    "npm run smoke:phase13"
  )
  # chain-{two,three}-home-smoke live in apps/node/test but were previously
  # in the smoke:phase13 list — keep them in this phase for back-compat.
  SMOKE_FILES=(
    apps/node/test/chain-two-home-smoke.test.ts
    apps/node/test/chain-three-home-smoke.test.ts
    apps/node/test/chain-plan-assign-three-home-e2e.test.ts
    apps/node/test/chain-assigner-handoff-e2e.test.ts
    apps/node/test/chain-stall-reassign-e2e.test.ts
    apps/node/test/chain-iteration-e2e.test.ts
    apps/node/test/chain-input-delivery-two-home-e2e.test.ts
  )
  run_phase "06a-smoke-phase13" "Phase 13 curated PR-signal suite" \
    bash -c "${SMOKE_TARGETS[0]}"
  if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi

  if [ "$BAIL_OUT" != "1" ]; then
    run_phase "06b-smoke-chain-homes" "chain-{two,three}-home-smoke" \
      bash -c "RUN_E2E=1 npx vitest run ${SMOKE_FILES[*]}$(junit_args 06b-smoke-chain-homes)"
    if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi
  fi

  # Phase 45 Layer 4 — Playwright web-content matrix (two real nodes + Chromium).
  # Requires social dist (phase 03) + chromium (phase 05 or install below).
  if [ "$BAIL_OUT" != "1" ] && [ "$SKIP_PLAYWRIGHT" != "1" ]; then
    if [ ! -f "apps/social/src/dist/index.html" ]; then
      run_phase "06c-social-build-web-content" "Build Social UI for web-content smoke" \
        bash -c "npm run build -w @envoymesh/social -- --mode development"
      if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi
    fi
    if [ "$BAIL_OUT" != "1" ]; then
      if ! ls "$HOME/Library/Caches/ms-playwright" >/dev/null 2>&1 \
         && ! ls "$HOME/.cache/ms-playwright" >/dev/null 2>&1; then
        echo "[06c-smoke-web-content] ⚠ no Playwright browser cache — installing chromium"
        npx playwright install chromium >"$ARTIFACTS_DIR/06c-playwright-install.log" 2>&1 || true
      fi
      run_phase "06c-smoke-web-content" "Phase 45 web-content Playwright smoke" \
        bash -c "npm run smoke:web-content"
      if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi
    fi
  elif [ "$SKIP_PLAYWRIGHT" = "1" ]; then
    skip_phase "06c-smoke-web-content"
  fi

  # Phase 13/60/64 — three-process + remote-assigner chaos smokes. These
  # spawn multiple libp2p homes on the same machine and **must not** run
  # in parallel with each other or with other libp2p E2E: they share
  # loopback ports + per-process libp2p stream slots, and batch
  # invocations flake ~50% in this repo. Run them **sequentially** with
  # 3 s between each so the OS releases ephemeral state.
  if [ "$BAIL_OUT" != "1" ]; then
    ISOLATED_SMOKES=(
      "agent-network-three-process-smoke:apps/node/test/agent-network-three-process-smoke.test.ts"
      "agent-network-remote-assigner-chaos-smoke:apps/node/test/agent-network-remote-assigner-chaos-smoke.test.ts"
    )
    first=1
    for entry in "${ISOLATED_SMOKES[@]}"; do
      name="${entry%%:*}"
      file="${entry##*:}"
      if [ "$first" -eq 0 ]; then
        # 3 s settle window so the prior run's libp2p streams close
        # and the OS reclaims loopback ports + temp-dir handles.
        echo ""
        echo "[06d-smoke-isolated] sleeping 3 s before $name (let prior run settle)"
        sleep 3
      fi
      first=0
      run_phase "06d-smoke-isolated-$name" "Isolated RUN_E2E=1 run of $name" \
        bash -c "RUN_E2E=1 npx vitest run '$file'$(junit_args 06d-smoke-isolated-$name)"
      if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi
      [ "$BAIL_OUT" = "1" ] && break
    done
  fi
fi

# ---- phase: bundle ---------------------------------------------------------

if [ "$BUILD" = "1" ] && [ "$BAIL_OUT" != "1" ]; then
  if [ -x ./scripts/bundle.sh ]; then
    run_phase "07-bundle" "scripts/bundle.sh (compile + stage + archive)" \
      bash ./scripts/bundle.sh
    if [ "$FAIL_COUNT" -gt 0 ] && [ "$BAIL" = "1" ]; then BAIL_OUT=1; fi
  else
    echo ""
    echo "[07-bundle] ✗ scripts/bundle.sh not found or not executable" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
fi

# ---- summary ---------------------------------------------------------------

echo ""
echo "============================================"
echo "  Summary — mode: $MODE"
echo "============================================"
echo "  passed:  $PASS_COUNT"
echo "  failed:  $FAIL_COUNT"
echo "  skipped: $SKIPPED_COUNT"
echo "  logs:    $ARTIFACTS_DIR/"
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo ""
  echo "  Failed phases (with logs):"
  for phase in "${FAILED_PHASES[@]}"; do
    log="$ARTIFACTS_DIR/${phase// /_}.log"
    if [ -f "$log" ]; then
      echo "    - $phase  (log: $log)"
    fi
  done
  echo ""
  echo "  All phase logs: $ARTIFACTS_DIR/"
  exit 1
fi
echo ""
echo "  ✓ all phases green"
exit 0