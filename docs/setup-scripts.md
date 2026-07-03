# Setup Scripts (`scripts/setup.sh`, `scripts/setup.ps1`)

Aimed at three audiences:

1. **Developers running setup** — what flags exist, what each step does.
2. **Maintainers editing the scripts** — the cross-platform sync contract and
   design decisions so future changes don't undo recent fixes.
3. **First-time contributors** — how to add a new flag, how to verify both
   twins still work.

The two scripts are deliberately kept as twins: same six steps, same flags,
same order of operations. They differ only in shell dialect (POSIX `bash`
vs. Windows `PowerShell`).

| Platform | Script | PowerShell target | Tested |
| --- | --- | --- | --- |
| macOS, Linux | `scripts/setup.sh` | bash 3.2+ (macOS ships `/bin/bash` 3.2.57) | macOS 15 (bash 3.2) |
| Windows | `scripts/setup.ps1` | Windows PowerShell 5.1 + PowerShell 7+ (`pwsh`) | pwsh 7.3+ |

> **Twin-script contract.** If you change one, change the other in the same
> commit. The header of each script states this. CI does not yet enforce it
> automatically — review carefully when one side diverges.

---

## Quick reference

```bash
# macOS / Linux
./scripts/setup.sh [--local /path/to/openclaw] [--skip-openclaw-build] [--skip-typecheck] [--help]
```

```powershell
# Windows PowerShell 5.1 + 7+
.\scripts\setup.ps1 [-LocalOpenClawPath <path>] [-SkipOpenClawBuild] [-SkipTypecheck] [-?]
```

The default invocation (`./scripts/setup.sh` or `.\scripts\setup.ps1` with
no flags) runs all six steps end-to-end and smoke-tests the OpenClaw
webhook on a random free loopback port.

---

## CLI flags

Flags have **shell-native spelling** on each platform. Both scripts expose
the same three behaviors:

| Behavior | `setup.sh` (mac/Linux) | `setup.ps1` (Windows) | Type |
| --- | --- | --- | --- |
| Skip GitHub clone, copy from a local checkout | `--local <path>` | `-LocalOpenClawPath <path>` | string |
| Skip steps 4–4.7 (OpenClaw build + smoke) | `--skip-openclaw-build` | `-SkipOpenClawBuild` | switch / boolean |
| Skip step 6 (TypeScript typecheck) | `--skip-typecheck` | `-SkipTypecheck` | switch / boolean |
| Show usage and exit | `-h`, `--help` | `-?`, `-h`, `-Help` | — |

Unknown flags:

- `setup.sh` prints an error and the usage block, then `exit 1`.
- `setup.ps1` raises a `ParameterBindingException` from
  `[CmdletBinding()]` — the same default PowerShell error format you'd get
  for any cmdlet.

`--local` without a value on `setup.sh` is treated as a usage error and
exits 1.

### Idempotency

Both scripts are designed to be re-runnable:

- A second `setup.sh` skips cloning if `packages/openclaw/` is already
  populated (the "Bundled found" branch in `install-openclaw.sh`).
- `--local` is only consulted if `packages/openclaw` is missing — it does
  **not** wipe an existing checkout. If you want to *replace* the bundled
  OpenClaw with a different local source, remove `packages/openclaw/`
  first or pass `--local` to a fresh clone.
- The bridge config copy in step 5 only fires if
  `apps/node/data/default/bridge-config.json` doesn't already exist.

---

## Six steps, in order

Both scripts print a `[N/6]` header for each step and a colored
`✓ / ⚠ / ✗` marker for sub-results. The numbering is identical across
platforms so output is comparable.

### Step 0 — Clean stale artifacts

- Drop an incomplete `packages/openclaw/dist` directory (one that exists
  but is missing `dist/entry.js`, so we don't mistake it for a built
  gateway).
- mac/Linux: also `rm -rf /tmp/envoymesh-gateway-*`. Windows: skip (each
  user has their own `$env:TEMP`; there is no shared `/tmp` to scrub).

### Step 1 — Toolchain check

- Verify `node` is on PATH and ≥ 22 (warnings only if older — Node 22+
  is what the project compiles against today).
- If `pnpm` is missing, install it globally with `npm install -g pnpm`.
- Print the resolved versions (running `pnpm -v` from outside the repo
  root, because `pnpm` warns on `package.json` `workspaces` inside the
  monorepo).

### Step 2 — Install EnvoyMesh dependencies

- `npm install` at the workspace root.
- `set -e` / `$ErrorActionPreference = "Stop"` aborts on any non-zero
  exit.

### Step 3 — OpenClaw bootstrap + extension copy

- Delegate to `scripts/install-openclaw.{sh,ps1}`:
  - If `packages/openclaw/` already has `openclaw.mjs` or `package.json`,
    bootstrap the runtime wrapper in `packages/openclaw-runtime/bin/`
    and the `dist/entry.js` stub. No re-clone.
  - Otherwise, if `--local` / `-LocalOpenClawPath` was given, copy from
    the user-provided path. Otherwise, `git clone --depth 1` from
    `https://github.com/openclaw/openclaw.git`.
- After bootstrap, copy `OpenClawExtension/` (the envoymesh channel
  extension source) into `packages/openclaw/extensions/envoymesh/` and
  strip any nested `node_modules`.

### Step 4 — Build OpenClaw gateway + smoke-test

This is the longest step. Skipped entirely with `--skip-openclaw-build` /
`-SkipOpenClawBuild`.

If `packages/openclaw/package.json` is missing, the step prints a warning
instead of building — the rest of EnvoyMesh still works (EnvoyAI just
falls back to whatever LLM provider the bridge config points at).

Otherwise it runs, in order:

1. Drop a conflicting `../../.pnpm-store` if it leaked in from the
   workspace.
2. `CI=true pnpm install --no-frozen-lockfile`, with a one-shot retry
   after `rm -rf node_modules` if it fails.
3. Install the `@pierre/diffs` dev dependency if `pnpm` skipped it
   (transitive direct-dep in some OpenClaw versions).
4. Stage the untracked `extensions/envoymesh` into a throwaway
   `GIT_INDEX_FILE` so OpenClaw's metadata generator sees it via
   `git ls-files`, then run `pnpm exec tsx
   scripts/generate-bundled-channel-config-metadata.ts`. The throwaway
   index leaves OpenClaw's own git state untouched.
5. `pnpm run build`. On failure, write a `dist/entry.js` stub that
   re-exports the TS source. This is a deliberate degraded fallback so
   the gateway can still boot — TypeScript errors don't block a fresh
   dev setup. The build log is the source of truth for diagnosing what
   went wrong.
6. Smoke-test the gateway on a **random free loopback port** in the
   user-private range. The probe uses `bash /dev/tcp` on mac/Linux and
   `[System.Net.Sockets.TcpListener]` on Windows; both pick an ephemeral
   port and verify it's currently free before binding it. The smoke
   test starts `openclaw.mjs gateway` with `--auth none
   --allow-unconfigured` and posts `{}` to `/webhook/envoymesh` for up
   to 45 seconds. Any non-`000` / non-`404` HTTP code is treated as the
   gateway being up.
7. Verify `node_modules/tsx/dist/cli.mjs` + `openclaw.mjs` exist; that
   combination is what the runtime needs to actually start the gateway.

### Step 5 — Bridge config template

If `apps/node/data/default/bridge-config.openclaw.example.json` exists
and `apps/node/data/default/bridge-config.json` doesn't, copy the example
into place. Print the canonical URLs (`assistantAgentUrl` → built-in
OpenClaw at `:18789/webhook/envoymesh`, `agentUrl` → external agent the
user configures).

### Step 6 — TypeScript typecheck

Skipped entirely with `--skip-typecheck` / `-SkipTypecheck`.

Otherwise, in order:

```bash
npm exec -w @envoymesh/api  -- tsc -p tsconfig.json 2>&1 | tail -3
npm exec -w @envoymesh/node -- tsc -p tsconfig.json 2>&1 | tail -3
```

A failure prints a warning but does **not** abort — the developer can
re-run `npm run typecheck` later to see full diagnostics. The
`tail -3` is output-damping, not error-suppression: see
[Recent robustness decisions](#recent-robustness-decisions) below.

---

## Recent robustness decisions

These were deliberate fixes. They are easy to "innocently" revert during
future refactors, so each one is called out here with its rationale.

### `set -o pipefail` in setup.sh (and PowerShell's `$LASTEXITCODE` quirk)

`bash`'s `set -e` does **not** catch failed commands inside a pipeline
unless `set -o pipefail` is also set. The original `setup.sh` had four
cases of the pattern:

```bash
CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -5 || {
  echo "  ⚠ Retrying..."; ...
}
```

Without `pipefail`, `tail`'s exit (always 0) is the pipeline's exit, so
the `|| { retry }` block never fires. A failed `pnpm install` was
silently treated as success. Setup.ps1 didn't have this bug — PowerShell
tracks `$LASTEXITCODE` to the last native command in the pipeline
regardless of trailing `Out-Null` — but the fix on the bash side
guarantees parity.

If you add a new pipeline with `tail`, keep `pipefail` set. If you
deliberately want to suppress a non-zero exit, capture `${PIPESTATUS[0]}`
explicitly:

```bash
out=$(some_cmd 2>&1)
real_exit=$?
```

### Free loopback port for the gateway smoke test

Hard-coding port `18799` was a false-positive hazard: a stray dev server
already listening on that port would respond to the smoke test's
`curl`/`Invoke-WebRequest`, and the script would report the gateway
healthy when in fact nothing was running.

The fix probes for a free port in the user-private range (18000–22999)
before each smoke run. On mac/Linux it uses `bash /dev/tcp`, which is
part of bash's built-in `/dev/tcp` pseudo-filesystem and works on bash
3.2+. On Windows it uses `[System.Net.Sockets.TcpListener]` on port 0
(OS-assigned). If no free port is found after 25 attempts (network race
in a pathological host), the smoke test is skipped and a warning is
printed instead of looping forever.

### Trap-based cleanup in setup.sh / try/finally in setup.ps1

The smoke test forks a background `pnpm exec tsx openclaw.mjs gateway`
process. If the script was killed mid-test (Ctrl-C, a failed step ahead,
terminal closed), the gateway and its temp state directory would leak:

- `setup.sh`: a `cleanup_smoke` function registered with
  `trap cleanup_smoke EXIT INT TERM` kills the gateway and removes the
  temp dir on **every** exit path.
- `setup.ps1`: the polling loop runs inside `try { ... } finally { ... }`
  that does the same, plus restores `$env:CI`, `$env:OPENCLAW_*`, and
  `$env:ENVOYMESH_BRIDGE_URL` to whatever they were before the script
  ran (so a subsequent command in the same PowerShell session doesn't
  inherit a polluted `$env:CI = "true"`).

If you extend the smoke test, do the cleanup inside the existing
`finally`/`trap`. Do **not** add a second `Stop-Process` outside the
guard — it will race with the in-finally teardown.

### `2>/dev/null` is not a substitute for `pipefail`

The original step 6 used `2>/dev/null` to suppress TypeScript's noisy
stderr:

```bash
npm exec -w @envoymesh/api -- tsc -p tsconfig.json 2>/dev/null && ...
```

That hides the failure, not the failure-handler. Replaced with
`2>&1 | tail -3` which keeps the last few lines visible *and* preserves
the real exit code under `pipefail`.

### `seq 1 45` → `for ((;;))`

`seq` is GNU coreutils. Stock macOS doesn't ship it (Xcode CLT adds it,
but not every macOS developer has CLT installed). Both scripts now use
the bash/PowerShell-native C-style for loop, which is portable to every
modern shell.

If you find yourself reaching for `seq 1 N`, replace with
`for ((i = 1; i <= N; i++))` instead. The same applies to `seq 1 30` /
`seq 1 15` in `scripts/relay-e2e-env.sh:63` and
`scripts/smoke-webrtc-call.sh:25` — not yet migrated, but same fix.

---

## Cross-platform notes for maintainers

### Shared between both scripts

- Always quote variables when interpolating into shell strings, including
  the gateway `--port "$SMOKE_PORT"` style we use in setup.sh.
- Use `.json5` / `JSON.parse` / `Get-Content` (not `jq` / `ConvertFrom-Json`
  with `-AsHashtable`) for the smoke config — both shells are robust to
  JSON.
- Don't depend on `bc`, `awk`, `tac`, `wc -l`, or other POSIX tools with
  inconsistent feature flags. macOS ships BSD versions; Linux usually
  ships GNU.

### setup.sh specifics

- Target bash 3.2+ for macOS compatibility (macOS still ships
  `/bin/bash` 3.2.57 because Apple refuses to ship GPLv3). Avoid
  `${var,,}` (lowercase), `[[ ]]` globbing, and `mapfile` (4+).
  Use `$(...)`, `[ ]`, `case`, and `mktemp -d` only.
- `bash /dev/tcp/host/port` is available in 3.2+ but is **not** POSIX
  sh. Since this script's shebang is `#!/bin/bash`, it's fine — just
  don't refactor it to `#!/bin/sh`.

### setup.ps1 specifics

- Tested with `pwsh 7.3.11`. `[CmdletBinding()]` + `param(...)` is
  needed for switch parameters to bind correctly; without it, `-SkipTypecheck`
  would be `$true` typed but PowerShell would warn.
- `[System.IO.Path]::GetTempPath()` returns a per-user directory on
  Windows — no need for shared `/tmp` cleanup.
- `Invoke-WebRequest -UseBasicParsing` skips the legacy IE-based parser;
  recommended on PowerShell 5.1. Newer pwsh ignores it but accepts it.
- `Start-Process -NoNewWindow -RedirectStandardOutput/Error` keeps the
  gateway subprocess visible to the user (in a fresh terminal window on
  Windows). For the smoke test we explicitly **don't** want a new
  window — that's why we use `-NoNewWindow`.
- Wrap cleanup-sensitive logic in `try { ... } finally { ... }` so Ctrl-C
  propagates correctly with `$ErrorActionPreference = "Stop"`.

---

## Adding a new flag (developer guide)

To add a flag to both scripts:

1. **Decide the shell-native spelling.** Use a long lower-case flag for
   bash; a Pascal-cased parameter with `[switch]` for boolean or
   `[string]` for value parameters in PowerShell.

2. **In `scripts/setup.sh`**:

   - Declare the variable near the existing CLI flag block (top of file,
     after `set -o pipefail`).
   - Add a `case` arm to the `while [ $# -gt 0 ]; do case "$1" in ... esac`
     loop. Use `shift 2` for value flags, `shift` for switches.
   - Document the flag in `print_usage` so `-h` shows it.
   - Reference the variable in the script body where the flag controls
     behavior.
   - Add a comment explaining *why* the flag exists (one line).

3. **In `scripts/setup.ps1`**:

   - Add the parameter to the `param(...)` block right after
     `[CmdletBinding()]`.
   - PowerShell style: prefer `[string]$Foo = ""` over a `switch` when
     it's an optional path-like value; `[switch]$SkipFoo` for boolean
     toggles that read clearly as `-SkipFoo`.
   - Document the parameter with a `# comment` immediately above the
     declaration line — PowerShell's help parser surfaces that as
     `<#...#>` blocks if you switch to comment-based help, but a
     plain `#` comment is fine for in-source context.
   - Reference `$Foo` (or `$SkipFoo` — PowerShell exposes switches as
     `$true`/`$false`) where behavior depends on it.

4. **In `QuickStart.md`**:

   - Add a row to the **Setup flags** table.
   - Add an example if the flag is non-obvious.

5. **In this file (`docs/setup-scripts.md`)**:

   - Add a row to the **CLI flags** table.
   - Mention the flag in the **Six steps, in order** section if the
     step changes shape when the flag is set.

6. **Verify both twins**:

   ```bash
   bash -n scripts/setup.sh                  # bash syntax
   ```

   ```powershell
   # PowerShell parse-check (any pwsh 7+ works)
   pwsh -NoProfile -Command "
     \$errs = \$null; \$null =
       [System.Management.Automation.Language.Parser]::ParseFile(
         (Resolve-Path 'scripts/setup.ps1').Path,
         [ref]\$null, [ref]\$errs);
     if (\$errs.Count -gt 0) { \$errs | % { \$_.Message }; exit 1 }
   "
   ```

   ```bash
   ./scripts/setup.sh --help
   .\scripts\setup.ps1 -?    # PowerShell convention
   ```

   The `--help` output on both sides should mention the new flag.

7. **Document the rationale**. If the flag exists because of a specific
   developer workflow (CI, air-gapped setup, a known bug, etc.), write
   one short sentence in the **Recent robustness decisions** section
   above explaining *why*. Future maintainers will thank you.

---

## Where to look next

- [`docs/manual_test.md`](manual_test.md) — manual smoke tests that
  exercise the local node after a successful setup.
- [`docs/packaging.md`](packaging.md) — packaging matrix for desktop
  bundles, which uses `setup.sh` as the dev path.
- [`docs/implementation-plan.md`](implementation-plan.md) — the unified
  installer track (29E) that `setup.sh` came out of.
- `scripts/install-openclaw.{sh,ps1}` — the gateway-bootstrap helpers
  delegated from step 3. Same twin-script contract; same `set -e` /
  `$ErrorActionPreference = "Stop"` discipline; `--local` is forwarded
  here from `setup.{sh,ps1}`.
