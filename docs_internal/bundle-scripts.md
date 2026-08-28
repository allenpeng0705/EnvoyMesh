# Bundle Scripts (`scripts/bundle.sh`, `scripts/bundle.ps1`)

Aimed at the same three audiences as `docs/setup-scripts.md`:

1. **Release engineers** — how to produce a portable bundle, what flags exist.
2. **Maintainers editing the scripts** — the twin-script contract, the
   bundle layout, and the design decisions so future changes don't undo
   them.
3. **First-time contributors** — how to add a flag, how to verify both
   twins still work.

The two scripts are deliberately kept as twins: same 8 steps, same flags,
same output layout. They differ only in shell dialect and platform
defaults (POSIX `bash` for mac/Linux, Windows `pwsh` for Windows).

| Platform | Script | Shell | Output archive |
| --- | --- | --- | --- |
| macOS, Linux | `scripts/bundle.sh` | bash 3.2+ | `*.tar.gz` |
| Windows | `scripts/bundle.ps1` | PowerShell 5.1+ / 7+ | `*.zip` |

> **Twin-script contract.** If you change one, change the other in the same
> commit. The header of each script states this. See `docs/setup-scripts.md`
> for the broader pattern.

The bundle scripts are the **release counterpart** of `scripts/setup.sh`:
setup.sh gives you a working dev environment; bundle.sh packages that
environment into a self-contained directory you can hand to a user.

---

## Quick reference

```bash
# macOS / Linux — full bundle with Node sidecar, source-built OpenClaw
./scripts/bundle.sh

# Build for a specific version
./scripts/bundle.sh --version 0.2.0 --out dist

# Smaller bundle that requires Node on the target
./scripts/bundle.sh --no-bundled-node

# Skip the OpenClaw rebuild (you already have packages/openclaw/dist)
./scripts/bundle.sh --skip-openclaw-build

# Keep the staged directory only; skip tar/zip
./scripts/bundle.sh --no-archive
```

```powershell
# Windows — full bundle with Node sidecar, source-built OpenClaw
.\scripts\bundle.ps1

# Same flags in PowerShell spelling
.\scripts\bundle.ps1 -Version 0.2.0 -Out dist
.\scripts\bundle.ps1 -NoBundledNode
.\scripts\bundle.ps1 -SkipOpenClawBuild
.\scripts\bundle.ps1 -NoArchive
```

---

## What the bundle contains

After `./scripts/bundle.sh` runs successfully, you'll have a staged
directory + a `.tar.gz` (or `.zip` on Windows):

```
release/envoymesh-{version}-{platform}-{arch}/
├── bin/
│   ├── envoymesh-bundle.mjs     # Cross-platform runtime orchestrator
│   └── node                     # Bundled Node.js binary (or node.exe on Windows)
├── node/                        # Compiled EnvoyMesh node + workspace packages
│   ├── dist/
│   ├── node_modules/@envoymesh/{api,bonds,identity,local-store,models,network,protocol,vault,rag,ipfs-helia}/
│   ├── node_modules/{ws,yaml,@chainsafe/*,…}/   # production npm deps (via npm ls)
│   ├── skills/                  # bundled OpenClaw skills (from apps/node/skills)
│   ├── package.json
│   └── envoymesh.node.example.yaml
├── openclaw/                    # Built OpenClaw + envoymesh channel extension
│   ├── dist/
│   ├── extensions/envoymesh/    # Auto-copied from OpenClawExtension/
│   ├── node_modules/
│   ├── openclaw.mjs
│   └── package.json
├── social/                      # Built Social UI (static)
│   ├── dist/index.html
│   └── (index.html — when present)
├── start.sh                     # mac/linux launcher
├── start.bat                    # Windows launcher
├── README.md                    # Bundle-specific README
└── VERSION                      # Plain text version
```

The user gets this entire directory (or the .tar.gz/.zip that wraps it).
They untar/unzip it, `./start.sh` (or `start.bat`), and the bundle
orchestrator starts the OpenClaw gateway + EnvoyMesh node together.
OpenClaw is **packaged in by default** — the user never has to run
`install-openclaw` on the target machine.

---

## CLI flags

Same flags on both scripts, shell-native spelling:

| Behavior | `bundle.sh` (mac/Linux) | `bundle.ps1` (Windows) | Default |
| --- | --- | --- | --- |
| Output directory | `--out <dir>` | `-Out <dir>` | `release/` |
| Bundle version | `--version <ver>` | `-Version <ver>` | from `package.json` |
| Skip `tsc -b` | `--skip-typecheck` | `-SkipTypecheck` | off |
| Skip OpenClaw rebuild | `--skip-openclaw-build` | `-SkipOpenClawBuild` | off |
| Use OpenClaw prebuilt binary | `--use-openclaw-binary` | `-UseOpenClawBinary` | off (source build) |
| Skip Node.js sidecar | `--no-bundled-node` | `-NoBundledNode` | off (include Node) |
| Skip archive (stage only) | `--no-archive` | `-NoArchive` | off (tar/zip) |
| Show usage | `-h`, `--help` | `-?`, `-h` | — |

### What `--use-openclaw-binary` does today

On mac/Linux, it calls `scripts/fetch-openclaw-sidecar.sh` to download a
prebuilt OpenClaw binary. On Windows it currently **falls back to the
source build** with a warning, because `fetch-openclaw-sidecar.sh` is
bash-only and there's no PowerShell equivalent yet. If/when a
`fetch-openclaw-sidecar.ps1` exists, the Windows twin should call it.

---

## Eight steps, in order

Both scripts print a `[N/8]` header for each step. Numbering is identical
across platforms so output is comparable.

### Step 1 — Toolchain check

Same as `setup.sh` step 1: verify Node ≥ 22, install pnpm if missing,
print versions.

### Step 2 — Install EnvoyMesh dependencies

`npm install` if `node_modules/` is missing. Idempotent.

### Step 3 — OpenClaw bootstrap

Delegates to `scripts/install-openclaw.{sh,ps1}`. Idempotent: a second
run skips cloning if `packages/openclaw/` is already populated.

### Step 4 — OpenClaw build (or prebuilt binary)

Three paths depending on flags:

| Flag | Behavior |
| --- | --- |
| (default) | Run `pnpm install --no-frozen-lockfile` + metadata + `pnpm run build` inside `packages/openclaw/`. Same retry-on-failure pattern as `setup.sh`. |
| `--skip-openclaw-build` | Reuse existing `packages/openclaw/dist/`. Fails if neither `openclaw.mjs` nor `dist/entry.js` exists. |
| `--use-openclaw-binary` | mac/Linux: call `fetch-openclaw-sidecar.sh`. Windows: warn and fall back to source build. |

### Step 5 — EnvoyMesh node build

Runs `npm run typecheck` (skippable) then `npm run node:build` to produce
`apps/node/dist/`. Skips if `dist/src/index.js` already exists.

### Step 6 — Social UI build

Runs `npm run build` in `apps/social/` to produce a static `dist/`. Warns
and continues if the build fails — the bundle still works without the
UI; the user just needs to interact with the CLI or the bridge.

### Step 7 — Stage the bundle

This is where the heavy lifting happens. The script:

1. Creates `release/envoymesh-{ver}-{platform}-{arch}/` with empty
   `bin/`, `node/`, `openclaw/`, `social/` subdirectories.
2. Runs `scripts/stage-bundle-node-runtime.{sh,ps1}` into `bundle/node/`:
   copies `apps/node/dist/`, all `@envoymesh/*` workspace packages (including
   `ipfs-helia`), **production npm dependencies** (`npm ls --omit=dev -w
   @envoymesh/node`), bundled skills, and `envoymesh.node.example.yaml`.
   Without the npm-deps step the node crashes immediately with
   `ERR_MODULE_NOT_FOUND` (e.g. `ws`, `@chainsafe/libp2p-noise`).
3. **OpenClaw pruning and copying.** Before the rsync, `pnpm prune --prod`
   has already trimmed dev deps from `packages/openclaw/node_modules/`
   (see [Design decisions](#prune-order-build-first-then-prune) for why
   this happens after the build, not before). The rsync then copies the
   OpenClaw tree into `bundle/openclaw/` with a focused exclude list —
   see [Design decisions](#openclaw-exclude-list) for what we keep vs.
   drop. `node_modules/` is excluded by rsync and re-included wholesale
   afterward.
4. Copies `apps/social/dist/` (or `apps/social/src/dist/` if Vite wrote
   there — the `vite.config.ts` sets `root: "src"`) into
   `bundle/social/dist/`.
5. Copies `bin/envoymesh-bundle.mjs` (the orchestrator) into
   `bundle/bin/`.
6. Generates `start.sh` and `start.bat` launchers.
7. Generates `README.md` and `VERSION`.
8. Fetches a Node.js sidecar into `bundle/bin/node` (or `bin/node.exe`
   on Windows) unless `--no-bundled-node`.

### Step 8 — Archive

`tar -czf` on mac/Linux, `Compress-Archive` on Windows. Skipped if
`--no-archive`.

---

## The runtime orchestrator (`bin/envoymesh-bundle.mjs`)

This file lives **inside the bundle** at `bin/envoymesh-bundle.mjs`. It
is the single piece of runtime code that runs on the target machine —
everything else is data + launchers.

Responsibilities, in order:

1. Resolve the bundle root (it's `../` from `bin/`).
2. Verify the bundle has what it needs:
   - `openclaw/openclaw.mjs` *or* `openclaw/dist/entry.js`
   - `node/dist/src/index.js` *or* `node/dist/index.js`
   - Social UI is optional (warn but continue)
3. Create `var/openclaw/` and `var/profile/` for runtime state. These are
   **bundle-local** so they don't pollute the user's dev profile.
4. Set up the env vars the children need:
   - `OPENCLAW_ROOT`, `OPENCLAW_BUNDLED_PLUGINS_DIR`,
     `OPENCLAW_STATE_DIR`
   - `ENVOYMESH_BRIDGE_URL` (default `http://127.0.0.1:3031/bridge/send`)
   - `ENVOYMESH_GATEWAY_URL` (default `http://127.0.0.1:18789/webhook/envoymesh`)
   - `ENVOYMESH_PROFILE` (default `<bundle>/var/profile`)
   - `CI=true` so OpenClaw suppresses interactive prompts
5. Spawn the OpenClaw gateway with `--bind loopback --auth none
   --allow-unconfigured`. Wait up to 30 seconds for it to respond on
   `/webhook/envoymesh`.
6. Spawn the EnvoyMesh node.
7. Forward SIGINT/SIGTERM (and Windows Ctrl-C) to both children. Hard
   kill after 5 seconds if they don't exit.
8. Forward a child's non-zero exit to the orchestrator's own exit code.

The launchers (`start.sh` / `start.bat`) are tiny wrappers that locate a
usable node and `exec node bin/envoymesh-bundle.mjs`. They prefer the
bundled `bin/node` and fall back to system `node` if the bundle was built
with `--no-bundled-node`.

### Env-var overrides the orchestrator honors

| Var | Default | What |
| --- | --- | --- |
| `ENVOYMESH_GATEWAY_PORT` (alias `OPENCLAW_PORT`) | 18789 | Gateway webhook port |
| `ENVOYMESH_BRIDGE_PORT` | 3031 | EnvoyMesh bridge port |
| `ENVOYMESH_PROFILE` | `<bundle>/var/profile` | Profile directory |
| `ENVOYMESH_GATEWAY_URL` | derived from port | Override the gateway URL |
| `ENVOYMESH_BRIDGE_URL` | derived from port | Override the bridge URL |
| `CI` | `true` | Suppress interactive prompts |

> **Heads up about port collisions.** If you have a dev `node:dev` running
> (`npm run node:dev` from the source tree), it will already be on 3030/3031/3032/18789
> and the bundle will fail to bind. Either stop the dev process or run the
> bundle with `ENVOYMESH_GATEWAY_PORT=<other> ENVOYMESH_BRIDGE_PORT=<other>`.
> Two bundles can coexist on one machine by picking different ports.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Clean shutdown |
| 1 | Bundle is incomplete (missing built artifacts) |
| 2 | OpenClaw gateway exited before becoming ready |
| 3 | EnvoyMesh node failed to start |

---

## Cross-platform notes

### Shared

- The Node.js sidecar version is the **exact** version of Node running on
  the build host (`node -p "process.versions.node"`). Bundles produced on
  Node 22.13.0 carry a Node 22.13.0 sidecar. This is intentional — the
  sidecar matches what was tested.
- The bundle's `var/` directory holds runtime state. The user can wipe
  it for a fresh profile without touching the rest of the bundle.
- `OPENCLAW_ROOT` points at the bundled OpenClaw tree. Don't override
  it on the target machine unless you know what you're doing.

### `bundle.sh` specifics

- Targets bash 3.2+ (macOS ships 3.2.57). Same constraints as
  `setup.sh` — no `[[ ]]`, no `${var,,}`, no `mapfile`.
- Uses `rsync` for the OpenClaw tree copy when available, falls back to
  `cp -R`. macOS doesn't ship rsync by default; the fallback handles
  that.
- `node-v22.13.0-darwin-arm64.tar.gz` URL pattern; if the fetch fails
  (e.g. offline build host), the bundle falls back to system node on the
  target.

### `bundle.ps1` specifics

- Tested with `pwsh 7.3.11`. `[CmdletBinding()]` + `param(...)` is
  required for the switch parameters to bind cleanly.
- `Compress-Archive` produces a `.zip`. Windows users expect `.zip` for
  portable downloads, so we use it even though the mac/Linux twin
  produces `.tar.gz`.
- `Expand-Archive` handles the Node.js `.zip` sidecar natively; no
  external `unzip` dependency.
- The Windows twin currently falls back to a source build when
  `-UseOpenClawBinary` is set, because the sidecar fetcher is
  bash-only. A `fetch-openclaw-sidecar.ps1` would close this gap.

---

## Recent design decisions

These are deliberate. They are easy to "innocently" revert during
future refactors, so each is called out here.

### OpenClaw packaged in by default

The whole point of this script (vs. `package-release.sh`, the old
skeleton) is that **OpenClaw ships inside the bundle**. The bundle is
self-sufficient: the user does not need to run `install-openclaw` on
the target machine. If a future maintainer "simplifies" the staging
step and forgets to copy `packages/openclaw/`, the bundle silently loses
its EnvoyAI agent — please don't.

### Bundle-local `var/` directory for runtime state

The orchestrator uses `<bundle>/var/profile` and `<bundle>/var/openclaw`
for state, **not** the user's dev profile at `~/...` or the system-wide
`~/.envoymesh/`. This means:
- Running the bundle doesn't touch a dev profile.
- Two bundles can coexist on the same machine with different state.
- Wiping the bundle's `var/` gives a clean state without touching the
  bundle's code.

If you change this, think hard about the consequence for users who run
both `npm run node:dev` and `./start.sh` from the same repo checkout.

### `bin/envoymesh-bundle.mjs` is the only runtime code

The bundle ships **one** Node.js orchestrator, not platform-specific
shell scripts. Shell launchers (`start.sh`, `start.bat`) are thin
wrappers that just `exec node bin/envoymesh-bundle.mjs`. This means:
- Process orchestration (signals, spawn, polling) is consistent across
  platforms.
- Adding a new orchestration feature (e.g. health checks, auto-update)
  is a single-file change.
- The shell wrappers are short enough that they don't need their own
  twin-script contract.

### Node.js sidecar version matches the build host

`bundle.sh` and `bundle.ps1` both read `process.versions.node` from the
running node and fetch the matching sidecar. If you build on Node 22.13,
the sidecar is 22.13. We deliberately do not pin a "minimum supported"
version here — the bundle should run the exact Node it was tested with.

### Prune order: build first, then prune

`pnpm prune --prod` removes `devDependencies` from `node_modules/`. It
also removes the **build tools** (`tsdown`, `typescript`, `vitest`,
`playwright`, etc.) because those are typically `devDependencies`.

The build step in this script (step 4) **needs** those tools. So the
order is:

1. `pnpm install --no-frozen-lockfile` — full dev + prod deps
2. `pnpm exec tsx …generate-bundled-channel-config-metadata.ts` — uses tsx
3. `pnpm run build` — uses tsdown
4. **Now** `pnpm prune --prod` — safe to drop dev deps; the build is done
5. Stage the bundle (with the now-trimmed `node_modules`)

If you reorder prune before the build, the build will fail with
`Command "tsdown" not found` (we saw this — that's why the order
matters). If you remove the prune entirely, the bundle ships dev deps
that bloat it by hundreds of MB.

### OpenClaw exclude list

The OpenClaw source tree is large (~2.7 GB on disk before filtering).
We copy it with a focused `rsync --exclude` list that drops only
**dev** content:

| Drop | Why |
| --- | --- |
| `src/` | Source code. The runtime uses `dist/` (built output), not source. |
| `qa/`, `test/` | Test infrastructure. |
| `apps/`, `docs/`, `ui/`, `scripts/`, `packages/` | OpenClaw's own sub-workspaces; not loaded at runtime. |
| `config/`, `data/`, `deploy/`, `git-hooks/` | Dev-time config and ops artifacts. |
| `.github/`, `.vscode/`, `.npmrc`, `.oxfmtrc.jsonc`, `.oxlintrc.json` | Dev tooling. |
| `tsconfig*.json`, `vitest.config.ts`, `tsdown.config.ts` | Build configs. |
| `*.yaml`, `*.yml` | Deploy / CI configs. |
| `LICENSE`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `VISION.md`, `THIRD_PARTY_NOTICES.md`, `SECURITY.md` | Docs. The bundle ships its own README. |
| `docker-compose.yml`, `Dockerfile`, `fly.toml`, `appcast.xml`, `.env.example` | Deploy artifacts. |
| `node_modules/` (initial rsync pass) | Filtered out, then re-copied wholesale so we ship the *pruned* version. |

We keep:

| Keep | Why |
| --- | --- |
| `dist/`, `dist-runtime/` | Built JavaScript the runtime loads. |
| `extensions/` | Channel extensions, including the envoymesh channel. |
| `node_modules/` (post-prune) | All runtime deps for OpenClaw + extensions. |
| `openclaw.mjs`, `package.json`, `npm-shrinkwrap.json` | Entry point + entry resolution + reproducible install. |
| `patches/`, `skills/`, `security/` | Runtime features. |

**The `dist/config/` gotcha.** A naïve `--exclude=config` matches any path
ending in `config`, including `dist/config/` (4500+ runtime files that
the gateway imports at boot). The fix is to anchor the exclude with a
leading `/`: `--exclude=/config` only matches at the source root. We
also add an explicit `--include=/dist/config --include='/dist/config/**'`
belt-and-suspenders. If you reorder the rsync list, keep that pair
together or the bundle will ship a 4 KB stub `dist/` and the gateway
will fail with `Cannot find module 'dist/config/config.js'` at startup.

**PowerShell twin.** The exclude list on Windows uses an explicit array
of names plus a regex post-filter for globs (`tsconfig.*.json`, `*.yaml`,
`*.yml`). PowerShell's `-Exclude` is unreliable for globs, so the regex
post-filter is the cleanest portable approach. A separate post-copy pass
removes `.md` docs that might otherwise slip through.

### OpenClaw `--allow-unconfigured`

The orchestrator launches the gateway with `--auth none --allow-unconfigured`.
This is necessary because the bundle doesn't ship a pre-baked
`openclaw.json` — the user is expected to point EnvoyMesh at their
preferred model provider. The `--allow-unconfigured` flag tells
OpenClaw to start anyway and surface a "not configured" warning at
runtime instead of refusing to boot.

### `--use-openclaw-binary` falls back on Windows

Until a `fetch-openclaw-sidecar.ps1` exists, `-UseOpenClawBinary` on
Windows just falls back to the source build. This is documented but not
fixed — flag this as a follow-up if you need binary-only Windows builds.

### macOS `.dmg` ships with an `/Applications` symlink

When the `.dmg` mounts, the user sees the standard "drag to Applications"
view: `EnvoyMesh.app` and an `Applications` symlink next to each other.
The user drags the `.app` onto the alias and ejects the `.dmg`.

The symlink is created by `build_macos_dmg` in a small staging folder:

```
.dmg-staging/
├── EnvoyMesh.app/
└── Applications -> /Applications
```

That folder is then passed to `hdiutil create`. We do NOT generate a
`.DS_Store` for the Finder window layout — `hdiutil`'s `-layout` flag is
fragile across macOS versions, and a hand-crafted `.DS_Store` is a
~600-byte binary blob that's easy to get wrong. The default Finder
icon-view layout works fine.

### macOS `.app` is robust to read-only mounts

The orchestrator (`bin/envoymesh-bundle.mjs`) detects when the bundle
is on a read-only filesystem (e.g. the user double-clicked the `.app`
from inside a still-mounted `.dmg`) and falls back to a temp dir for
runtime state. The user gets a clear warning to drag the `.app` to
`/Applications` for a stable install.

```
[bundle] WARN: Bundle is on a read-only filesystem (/Volumes/EnvoyMesh/EnvoyMesh.app).
[bundle] WARN: Runtime state will live in /var/folders/.../envoymesh-user-PID and will be lost on reboot.
[bundle] WARN: Drag EnvoyMesh.app to /Applications and re-launch for a stable install.
```

Without this fallback, OpenClaw silently fails to create its state
directory and crashes a few seconds after launch. The detection uses
`accessSync(varDir, W_OK)` on the bundle's `var/`; if that fails
(either the dir doesn't exist or it's on a read-only mount), we use
`os.tmpdir()/envoymesh-{user}-{pid}/`.

Once the user copies the `.app` to `/Applications` and re-launches,
the bundle is on a writable filesystem and the orchestrator uses
`<bundle>/var/` directly — no temp fallback, no warning.

### macOS `.app` is ad-hoc signed at build time

`build_macos_dmg` runs `codesign --force --deep --sign -` on the `.app`
BEFORE packaging it into the `.dmg`. Without this, an unsigned `.app`
freshly installed from a `.dmg` is silently blocked by macOS
Gatekeeper when the user double-clicks it — no dialog, no log, the
app just doesn't launch. The user concludes the app "crashed" and
files a bug.

Ad-hoc signing is built into macOS (`codesign` with `-` instead of
a certificate name) and is sufficient for the Gatekeeper check. The
signed `.app`:

- Launches via Finder double-click, `open`, or Launch Services
- Survives being moved within the same Mac
- Does **not** survive a copy to a different Mac — the ad-hoc
  signature is bound to the original machine. The user re-running
  `bundle.sh` on the new machine regenerates the signature.

For a real distribution cert (Apple Developer ID, $99/year), the
build script would call `codesign --sign "Developer ID Application:
..."` instead. The ad-hoc path is the default since it has no
prerequisites.

### Windows `.exe` is Authenticode-signed at build time

`build_windows_exe_nsis` calls `sign_windows_exe` after `makensis`
produces the `.exe`. Without this, Windows SmartScreen blocks the
unsigned installer with "Windows protected your PC" and forces the
user to click "More info" → "Run anyway" every time they run it.

The default cert is a self-signed code-signing cert that `sign_windows_exe`
generates once and caches in the user's `Cert:\CurrentUser\My` store
(subject: `CN=EnvoyMesh Team`, 5-year validity). The user can either:

- Trust the SmartScreen warning and click "More info" → "Run anyway"
  the first time (most users), or
- Install the cert in Trusted Root Certification Authorities once
  (administrators / power users) — the warning then disappears for
  every machine they install on.

For a real distribution cert (DigiCert, Sectigo, etc., $200–$500/yr),
set the `ENVOYMESH_WINDOWS_CERT` env var to the `.pfx` file path
before running `bundle.ps1`:

```powershell
$env:ENVOYMESH_WINDOWS_CERT = "C:\path\to\codesign.pfx"
.\scripts\bundle.ps1
```

The build script loads the cert from that path and signs the `.exe`
with it. SmartScreen will trust the cert (after enough downloads
build reputation) without any user click.

If cert generation or signing fails for any reason, `sign_windows_exe`
prints a clear warning and continues. The `.exe` is still produced —
just unsigned, with SmartScreen's "Run anyway" prompt for the user.

---

## Adding a new flag (developer guide)

Same pattern as `docs/setup-scripts.md`:

1. **Decide the shell-native spelling.** Bash: `--lower-case-flag`.
   PowerShell: `-PascalCase` for value params, `[switch]$Foo` for
   booleans.
2. **In `scripts/bundle.sh`**:
   - Declare the variable near the existing flag block (top of file).
   - Add a `case` arm to the `while [ $# -gt 0 ]; do case "$1" in ...`
     loop. `shift 2` for value flags, `shift` for switches.
   - Document the flag in `print_usage` so `-h` shows it.
   - Reference the variable where the flag changes behavior.
3. **In `scripts/bundle.ps1`**:
   - Add the parameter to the `param(...)` block right after
     `[CmdletBinding()]`.
   - Reference `$Foo` (or `$SkipFoo`) where behavior depends on it.
4. **In `packaging.md`**: add a row to the **Build options** table.
5. **In this file**: add a row to the **CLI flags** table.
6. **Verify both twins**:
   ```bash
   bash -n scripts/bundle.sh
   pwsh -NoProfile -Command "
     \$errs = \$null; \$null =
       [System.Management.Automation.Language.Parser]::ParseFile(
         (Resolve-Path 'scripts/bundle.ps1').Path,
         [ref]\$null, [ref]\$errs);
     if (\$errs.Count -gt 0) { \$errs | % { \$_.Message }; exit 1 }
   "
   ```
7. **Document the rationale** in the **Recent design decisions** section
   so future maintainers don't undo it.

---

## Where to look next

- [`docs/setup-scripts.md`](setup-scripts.md) — the dev-environment twin
  of this script. Bundle is the release counterpart.
- [`packaging.md`](../packaging.md) — high-level packaging guide that
  now points here.
- [`scripts/build-desktop.sh`](../scripts/build-desktop.sh) — the
  Tauri-based native-installer path (`.dmg`, `.exe`, `.AppImage`).
  Different scope: native installers vs. portable bundles.
- `scripts/stage-tauri-{node,openclaw}-bundle.sh` — pre-Tauri-build
  helpers that stage the same content into Tauri resources. Some
  staging logic overlaps with `bundle.sh` step 7.
- [`bin/envoymesh-bundle.mjs`](../bin/envoymesh-bundle.mjs) — the
  cross-platform runtime orchestrator that lives inside every bundle.

