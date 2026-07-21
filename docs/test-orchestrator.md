# Test Orchestrator (`scripts/test.sh` / `scripts/test.ps1`)

A single entry point that runs the right tests for the right context.

## Modes

| Mode       | typecheck | unit | social-build | e2e-fast (libp2p) | e2e-playwright (chromium) | smoke | bundle.sh | JUnit | bail |
|------------|:---------:|:----:|:------------:|:------------------:|:-------------------------:|:-----:|:---------:|:-----:|:----:|
| `dev`      | ✓         | ✓    | –            | –                  | –                         | –     | –         | –     | –    |
| `unit`     | ✓         | ✓    | –            | –                  | –                         | –     | –         | –     | –    |
| `e2e`      | –         | –    | ✓            | ✓                  | ✓                         | –     | –         | –     | –    |
| `full`     | ✓         | ✓    | ✓            | ✓                  | ✓                         | ✓     | –         | –     | –    |
| `ci`       | ✓         | ✓    | ✓            | ✓                  | ✓                         | ✓     | –         | ✓     | ✓    |
| `bundle`   | ✓         | ✓    | ✓            | ✓                  | ✓                         | ✓     | ✓         | –     | ✓    |

**`watch`** is an alias for `dev --watch`.

## Common flags

```
--filter PATTERN     Pass to vitest as --testNamePattern (or filename glob)
--bail               Stop on first failure (default in ci/bundle)
--no-typecheck       Skip tsc -b
--no-build           (bundle mode) skip scripts/bundle.sh
--watch              Watch mode (dev only)
--artifacts DIR      Drop JUnit/reports here (default: ci-artifacts/test)
--skip-playwright    Skip chromium E2E (envs without a browser)
--quiet              Suppress per-phase banners; only print failures
-h, --help           Show help
```

## Phases

| # | Name               | What                                                       | Time   |
|---|--------------------|------------------------------------------------------------|--------|
| 1 | `typecheck`        | `tsc -b`                                                   | ~30s   |
| 2 | `unit`             | `RUN_E2E= vitest run` (~4.4k tests; Capacitor `apps/mobile` + `packages/mobile-*` excluded — product mobile is EnvoyGo) | ~35s   |
| 3 | `social-build`     | `vite build --mode development` (for chromium E2E)         | ~60s   |
| 4 | `e2e-fast`         | `RUN_E2E=1 vitest run` excluding smoke + chromium (includes Phase 46 `multi-relay-fleet-e2e` + `multi-relay-fleet-process-e2e`; live dual-relay suite skips unless `TEST_RELAY_A`+`TEST_RELAY_B`) | ~60–180s |
| 5 | `e2e-playwright`   | `RUN_E2E=1 vitest run` on chromium tests                    | ~120s  |
| 6 | `smoke`            | `smoke:phase13` + chain homes + `smoke:web-content` (06c)   | ~90s   |
| 7 | `bundle`           | `scripts/bundle.sh` (only in `bundle` mode)                | ~5min  |

Each phase logs to `ci-artifacts/test/<phase>.log` and is independent — failures in one don't block the others (unless `--bail` is set or the mode defaults to bail).

## Typical workflows

**Daily development — fast feedback:**
```bash
./scripts/test.sh dev                    # ~35s, no E2E
# or
npm run test:dev                       # same thing, npm-style
```

**Iterating on a specific test:**
```bash
./scripts/test.sh dev --filter nodeService-fleet-manifest --watch
```

**Pre-release validation — full E2E:**
```bash
./scripts/test.sh full                  # typecheck + unit + all E2E + smoke
```

**Pre-bundle gate — same as `full` but bail + build:**
```bash
./scripts/test.sh bundle                # tests + scripts/bundle.sh
# or
npm run test:bundle
```

**CI / GitHub Actions — JUnit output + strict:**
```bash
./scripts/test.sh ci                    # JUnit XML in ci-artifacts/test/
```

**Just the libp2p E2E (ad-hoc, no chromium):**
```bash
./scripts/test.sh e2e --skip-playwright
```

**Envs without a browser (e.g. minimal CI runners):**
```bash
./scripts/test.sh full --skip-playwright
```

## Exit codes

| Code | Meaning                                                |
|------|--------------------------------------------------------|
| 0    | All phases green                                       |
| 1    | One or more phases failed                              |
| 2    | Bad CLI args (unknown mode / flag)                     |
| 3    | Missing prerequisite (e.g. node not on PATH)           |

## Artifacts

Each run drops per-phase logs into `ci-artifacts/test/<phase>.log`. The
`ci` mode additionally writes JUnit XML files for vitest's CI integrations.

In CI, the workflow's `actions/upload-artifact` step should pick up the entire
`ci-artifacts/` directory:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: test-artifacts
    path: ci-artifacts/**
```

## npm script aliases

The orchestrator is also exposed via npm scripts for convenience:

| npm script              | Equivalent to                            |
|-------------------------|------------------------------------------|
| `npm run test:dev`      | `bash scripts/test.sh dev`               |
| `npm run test:full`     | `bash scripts/test.sh full`              |
| `npm run test:e2e`      | `bash scripts/test.sh e2e`               |
| `npm run test:ci`       | `bash scripts/test.sh ci`                |
| `npm run test:bundle`   | `bash scripts/test.sh bundle`            |
| `npm run test:orchestrator` | `bash scripts/test.sh` (with args)    |

The legacy `npm test`, `npm run test:unit`, `npm run test:e2e` etc. are
preserved for back-compat. New code should prefer the orchestrator.

## Environment overrides

- `NODE_SKIP_TYPECHECK=1` — skip phase 1
- `NODE_SKIP_BUNDLE=1` — (bundle mode) skip phase 7

## Cross-platform

- `scripts/test.sh` — macOS / Linux
- `scripts/test.ps1` — Windows

The two MUST stay in sync. If you change one, change the other in the same
commit.

## CI/CD integration

The recommended GitHub Actions step is:

```yaml
- name: Run unit + E2E tests
  run: ./scripts/test.sh ci

- name: Upload test artifacts
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: test-artifacts
    path: ci-artifacts/**
```

For PR-only signal (faster), use `dev` in a job that gates the heavy `ci` run.

### JUnit output

`ci` mode emits one JUnit XML per vitest phase into `$ARTIFACTS_DIR`
(default `ci-artifacts/test/`):

- `02-unit-junit.xml` — unit test results
- `04-e2e-fast-junit.xml` — libp2p in-process E2E
- `05-e2e-playwright-junit.xml` — chromium E2E
- `06b-smoke-chain-homes-junit.xml` — chain-of-homes smoke

Pair with `dorny/test-reporter` for GitHub Actions UI rendering, or just
upload the whole `ci-artifacts/` directory for postmortem.

Disable with `NODE_SKIP_JUNIT=1`. To redirect to a custom dir, set
`NODE_JUNIT_DIR=/tmp/junit`.
