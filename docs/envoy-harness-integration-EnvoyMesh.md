# envoy-harness integration into EnvoyMesh — implementation guide

> **Status:** Draft (2026-08-20). Companion to
> [`agent-harness-integration.md`](./agent-harness-integration.md) (the
> design doc). **This file is the implementation guide** — dev flow,
> release flow, build scripts, step-by-step procedure. Read the design
> doc first for "why"; read this for "how".
>
> **Audience:** engineers implementing Phase 8 (envoy-harness as an
> EnvoyMesh built-in) AND release engineers shipping EnvoyMesh with
> envoy-harness bundled.
>
> **Related:**
> - [agent-harness-integration.md](./agent-harness-integration.md) —
>   the design plan (cooperation model + 6 injection steps + Q1-Q5)
> - [envoy-harness boundary](../../envoy-harness/packages/envoy-harness/docs/boundary.en.md)
>   — what envoy-harness-adapter is and isn't allowed to know
> - [scripts/build-desktop.sh](../scripts/build-desktop.sh) and
>   [scripts/build-desktop.ps1](../scripts/build-desktop.ps1) — the
>   Tauri release flow
> - [scripts/stage-tauri-envoy-harness-bundle.sh](../scripts/stage-tauri-envoy-harness-bundle.sh)
>   and the PowerShell twin — the new vendor script

---

## 1. Overview — two flows, one product

The integration has **two distinct flows** that solve different problems.
They run in different environments (your dev machine vs the release
pipeline). Same end-state: EnvoyMesh can use envoy-harness.

| Flow | What it does | Mechanism | When |
|---|---|---|---|
| **Dev** | Active dev loop where envoy-harness code changes are visible in EnvoyMesh immediately | `link:` paths + live symlinks | Day-to-day dev on either monorepo |
| **Release** | Self-contained Tauri bundle that ships to users without the envoy-harness monorepo | Vendor script: build envoy-harness + copy `dist/` into Tauri `resources/` | Every EnvoyMesh release |

Both flows are **Option A** (link-based for dev, vendor at build time
for release) from the design discussion. Rejected alternatives
(unify monorepos, tarball install) and the link problem that almost
scuttled the project are in §3.

The end state for a user running EnvoyMesh is the same either way:
envoy-harness is a registered AI Engine alongside OpenClaw, selected
via signal-based routing (Q3 D) and cross-verified by OpenClaw
(Q4 A) by default.

---

## 2. Cooperation model recap

One paragraph before the procedure. The full design is in
`agent-harness-integration.md` §3-4; this is the minimum you need to
make the steps below make sense.

- **Q1 C — Cross-runtime protocol**: `LocalCrossRuntimeSubmitter`.
  envoy-harness doesn't import OpenClaw's protocol; the bridge
  wraps the local call.
- **Q2 B — Skill namespace**: merged manifest at node level. One
  manifest per node = `envoy-harness.skills ∪ OpenClaw.skills`,
  tagged `runtime: "envoy-harness" | "openclaw"`.
- **Q3 D — Tauri user prompt default**: **OpenClaw default** +
  signal-based opt-in to envoy-harness. Signals: mesh keywords,
  `lsp_*` / `FanOutSpec` / federated-scoreboard needs, cost cap,
  multi-provider LLM switch.
- **Q4 A — Cross-verify default**: envoy-writes + OpenClaw-verifies.
  Per-job override to (b) in `team.toml [verify] mode`.
- **Q5 — Team job routing**: per-node primary + best-fit skill
  fallback. Whole-job routing v0.
- **Cooperation patterns A + B + E** (skill delegation + sub-agent
  delegation + capability routing) — not a single pattern; a
  layered mix.
- **Strategic direction**: Differentiation (envoy-harness keeps novel
  focus on mesh / federated / lsp_* / multi-provider / cost cap) +
  B-class critical EnvoyMesh skills (sponsor-friend, peer-list,
  relay-status) live canonically in `envoy-harness-adapter` as the
  bridge impl. OpenClaw keeps community skills + bond protocol +
  DMG first-contact UX.

---

## 3. The cross-monorepo link problem (and the option we picked)

envoy-harness lives in a sibling monorepo. The naive `pnpm install
file:../envoy-harness` doesn't work because:

1. EnvoyMesh's root `package.json` uses the deprecated `workspaces`
   field (pnpm 10+ requires `pnpm-workspace.yaml`).
2. pnpm 10 ignores `file:` for some packages in this layout.
3. The envoy-harness-adapter's `package.json` has a self-referential
   `"@envoymesh/envoy-harness": "workspace:*"` which only resolves
   inside the envoy-harness monorepo.

We considered three options:

| Option | Verdict | Why |
|---|---|---|
| **A: link-based dev + vendor-at-release** | **Picked** | 1-line dev fix + 1 new build script. Boundary contract preserved (adapter is the only thing that knows about both). env-harness's 4 design targets ("Self-contained, fully independently testable") stay intact. |
| B: Unify the monorepos | Rejected | Changes project topology, CI, lockfile merge. Two repos, two release cadences, two teams. The boundary is real — collapsing it loses optionality. |
| C: Tarball-based install | Rejected | Slow iteration. `pnpm pack` + manual copy is a worse dev loop than `link:`. |

**Option A's two pieces:**

1. **Dev (1-line fix in envoy-harness repo)** —
   `packages/envoy-harness-adapter/package.json` changes
   `"@envoymesh/envoy-harness": "workspace:*"` →
   `"@envoymesh/envoy-harness": "link:../envoy-harness"`. The
   adapter is already cross-monorepo (3/4 of its deps use
   `link:../../../EnvoyMesh/...`). The 4th dep was the outlier.
2. **Release (1 new build script in EnvoyMesh repo)** —
   `scripts/stage-tauri-envoy-harness-bundle.{sh,ps1}` builds the
   sibling envoy-harness monorepo and copies the `dist/` artifacts
   into `apps/tauri/src-tauri/resources/`.

**EnvoyMesh pnpm config issues (pre-existing, deferred)** — the
deprecated `workspaces` field in root `package.json` and the Huawei
mirror without private `@envoymesh/*` packages are real but out of
scope for Step 0 (a 1-day infra check). They're tracked as a
follow-up; not blockers for Phase 8.

---

## 4. Dev flow (Option A: live link)

### 4.1 Pre-requisite (one-time, in the envoy-harness repo)

**The cross-monorepo link fix** is in
`envoy-harness/packages/envoy-harness-adapter/package.json`. Change:

```diff
   "dependencies": {
     "@envoymesh/agent-adapter": "link:../../../EnvoyMesh/packages/agent-adapter",
-    "@envoymesh/envoy-harness": "workspace:*",
+    "@envoymesh/envoy-harness": "link:../envoy-harness",
     "@envoymesh/identity": "link:../../../EnvoyMesh/packages/identity",
     "@envoymesh/protocol": "link:../../../EnvoyMesh/packages/protocol"
   }
```

**Why this fix:** the adapter is a cross-monorepo bridge. It already
uses `link:` for 3 of its 4 deps. The `@envoymesh/envoy-harness` dep
used `workspace:*` — a same-monorepo mechanism. The fix replaces it
with the same `link:` pattern the other 3 deps use. **One-line
change.**

After this change:

- `pnpm -F @envoymesh/envoy-harness-adapter build` in the
  envoy-harness monorepo produces a fresh `dist/`.
- pnpm's `link:` creates a symlink from any consumer's
  `node_modules/@envoymesh/envoy-harness` to
  `envoy-harness/packages/envoy-harness`.
- The consumer (EnvoyMesh) sees the change via the symlink.

**Commit message (this is one commit, in the envoy-harness repo):**

```
fix(envoy-harness-adapter): self-contained cross-monorepo dep (workspace:* → link:)

The adapter is a cross-monorepo bridge; 3/4 deps already use
link: paths. The @envoymesh/envoy-harness dep used workspace:* which
only works in the adapter's home monorepo. Replacing with the
matching link: pattern makes the adapter self-contained — no
dependency on envoy-harness monorepo layout.

After this change, EnvoyMesh (the cross-monorepo consumer) can
install the adapter via file: and pnpm creates the symlink chain
correctly.
```

### 4.2 Step 0 in EnvoyMesh (the dev loop starts)

**Edit `apps/node/package.json`:**

```diff
   "dependencies": {
     "@envoymesh/api": "0.2.2",
     "@envoymesh/agent-adapter": "0.2.2",
     "@envoymesh/bonds": "0.2.2",
+    "@envoymesh/envoy-harness-adapter": "file:../../../envoy-harness/packages/envoy-harness-adapter",
     "@envoymesh/identity": "0.2.2",
     ...
```

**Run `pnpm install` in EnvoyMesh root.** pnpm creates the symlink
chain:

```
EnvoyMesh/node_modules/@envoymesh/envoy-harness-adapter
  → ../../../envoy-harness/packages/envoy-harness-adapter
EnvoyMesh/node_modules/@envoymesh/envoy-harness
  → ../../../envoy-harness/packages/envoy-harness
```

(The first symlink is from EnvoyMesh's `file:`; the second is from
the adapter's `link:../envoy-harness`; pnpm resolves the relative
paths.)

**Verify:**

```sh
ls -la EnvoyMesh/node_modules/@envoymesh/envoy-harness
ls -la EnvoyMesh/node_modules/@envoymesh/envoy-harness-adapter
pnpm -F @envoymesh/node typecheck
```

Both should be symlinks pointing to the right places. Typecheck
passes (no code change yet — just dep resolution).

**Commit message (this is Step 0, in the EnvoyMesh repo):**

```
feat(phase-8): Step 0 — wire @envoymesh/envoy-harness-adapter as file: dep

No code change. Proves the package graph resolves across the two
monorepos. After this commit:
  pnpm install creates live symlinks
  pnpm -F @envoymesh/node typecheck passes

The companion fix in envoy-harness/packages/envoy-harness-adapter
replaces workspace:* with link:../envoy-harness so the adapter
is self-contained.

Refs: docs/agent-harness-integration.md §5 Step 0
```

### 4.3 Day-to-day dev loop

**Edit envoy-harness Package 1:**

```sh
cd /path/to/envoy-harness
# Edit files in packages/envoy-harness/src/...
pnpm -F @envoymesh/envoy-harness build
```

**EnvoyMesh sees it via symlink.** No `pnpm install` needed in
EnvoyMesh. The next `pnpm dev` / `pnpm -F @envoymesh/node dev` picks
up the new dist.

**Edit envoy-harness-adapter:**

```sh
cd /path/to/envoy-harness
# Edit files in packages/envoy-harness-adapter/src/...
pnpm -F @envoymesh/envoy-harness-adapter build
```

Same story. Adapter is in the sibling monorepo; the dist is at
`envoy-harness-adapter/dist/`; EnvoyMesh's `file:` symlink points
there; live updates.

**Edit EnvoyMesh code that uses the adapter:**

```sh
cd /path/to/EnvoyMesh
# Edit apps/node/src/...
pnpm -F @envoymesh/node typecheck
pnpm dev
```

Standard EnvoyMesh dev loop.

---

## 5. Release flow (Option A: vendor at build time)

The release flow vendors the envoy-harness `dist/` into
`apps/tauri/src-tauri/resources/`. Tauri bundles every file under
`resources/` (Tauri's `cargo:rerun-if-changed` is auto-derived from
the resource globs in `tauri.conf.json`). The vendored
`resources/envoy-harness*/` packages are imported by `apps/node` at
runtime — the `file:` symlink from dev becomes a real import in
release.

### 5.1 The new vendor script

`scripts/stage-tauri-envoy-harness-bundle.sh` (and the PowerShell
twin `scripts/stage-tauri-envoy-harness-bundle.ps1`) does the
cross-monorepo build + copy:

1. **Skip gate** — `STAGE_ENVOY_HARNESS=0` exits early (debug
   escape hatch, parallels `STAGE_OPENCLAW_BUNDLE=0`).
2. **Build** the sibling envoy-harness monorepo. Default (unset) =
   `pnpm -F <pkg> build` (incremental — tsc skips unchanged sources
   via `.tsbuildinfo`). `STAGE_ENVOY_HARNESS=1` runs
   `pnpm -F <pkg> clean` first (best-effort — swallows errors
   if the package doesn't define `clean`) so the rebuild drops
   `.tsbuildinfo` + `dist/` and is from scratch:
   - `pnpm -F @envoymesh/envoy-harness build`
   - `pnpm -F @envoymesh/envoy-harness-adapter build`
3. **Copy** `dist/` artifacts (re-touching the `.keep` sentinel so
   the working tree stays clean after `rm -rf`):
   - `envoy-harness/packages/envoy-harness/dist/` →
     `EnvoyMesh/apps/tauri/src-tauri/resources/envoy-harness/`
   - `envoy-harness/packages/envoy-harness-adapter/dist/` →
     `EnvoyMesh/apps/tauri/src-tauri/resources/envoy-harness-adapter/`
4. **Idempotent** — `rm -rf` the destination before copy. Re-runs
   overwrite; no stale files accumulate.

**Why this approach:**

- Tauri bundles are `cargo:rerun-if-changed` on every file in
  `resources/` (per the existing OpenClaw vendor script's comment).
  Vendoring keeps that contract.
- Users don't need the envoy-harness monorepo. The bundle is
  self-contained.
- The vendor step is **idempotent**: re-running overwrites. The
  script `rm -rf`s the destination before copy.
- The script honors `STAGE_ENVOY_HARNESS=0` for debug-only
  no-op (parallels `STAGE_OPENCLAW_BUNDLE=0`).
- `ENVOY_HARNESS_DIR` env var overrides the default
  `$ROOT/../envoy-harness` location. Useful for CI when the
  sibling monorepo is checked out at a different path.

### 5.2 Tauri config update

`tauri.conf.json` (and the slim/full twins) need the resource globs
added so the vendored files are actually included in the bundle:

```diff
   "bundle": {
     "resources": [
       "resources/node/**/*",
       "resources/node-runtime/**/*",
       "resources/openclaw/",
       "resources/openclaw-envoymesh/",
       "resources/pi/**/*",
+      "resources/envoy-harness/**/*",
+      "resources/envoy-harness-adapter/**/*"
     ]
   }
```

This is in **3 files**: `tauri.conf.json`, `tauri.conf.slim.json`,
`tauri.conf.full.json`. All three.

### 5.3 build-desktop.sh update

**Insert one call** in the OpenClaw/EnvoyMesh-extension section
(after line 313, before the Pi/Kubo block):

```sh
# EnvoyMesh channel: keep independent of OpenClaw cache reuse.
bash scripts/stage-openclaw-envoymesh-extension.sh

# envoy-harness: vendor from sibling monorepo into resources/.
bash scripts/stage-tauri-envoy-harness-bundle.sh
```

Also document the new env var in the header comment block (~line 40):

```sh
#   STAGE_ENVOY_HARNESS=0
#               Skip envoy-harness staging (debug only). Default: stage.
#   STAGE_ENVOY_HARNESS=1
#               Force a clean rebuild + overwrite. Runs
#               `pnpm -F <pkg> clean` (best-effort) then
#               `pnpm -F <pkg> build` in the sibling repo before
#               re-staging. (Default unset: incremental rebuild —
#               pnpm's tsc skips unchanged sources.)
#   ENVOY_HARNESS_DIR=<path>
#               Sibling envoy-harness monorepo path (default: $ROOT/../envoy-harness).
```

The `[2/6]`-`[6/6]` sections (which build + bundle the Tauri app)
are unchanged — the vendored `resources/envoy-harness*/` get picked
up by Tauri's existing resource glob (now updated in §5.2).

### 5.4 build-desktop.ps1 update

Equivalent PowerShell insertion. New `& $stageEnvoyHarnessBundle`
call after the EnvoyMesh-channel stage. Same idempotency
guarantees; same `STAGE_ENVOY_HARNESS=0` escape hatch.

### 5.5 What the Tauri bundle ends up with

After the vendor step, the Tauri `resources/` looks like:

```
apps/tauri/src-tauri/resources/
├── envoy-harness/             # vendored from envoy-harness/packages/envoy-harness/dist
│   ├── index.js
│   ├── index.d.ts
│   └── ...
├── envoy-harness-adapter/     # vendored from envoy-harness/packages/envoy-harness-adapter/dist
│   ├── index.js
│   ├── index.d.ts
│   └── ...
├── openclaw/                  # existing — staged by stage-tauri-openclaw-bundle.sh
├── envoymesh/                 # existing — OpenClaw channel, staged by stage-openclaw-envoymesh-extension.sh
├── node/                      # existing — staged by fetch-node-sidecar.sh
├── pi/                        # existing — optional, staged by stage-tauri-pi-bundle.sh
└── kubo/                      # existing — optional, staged by fetch-kubo-sidecar.sh
```

The `resources/envoy-harness*/` packages are imported by
`apps/node` at runtime (the `file:` symlink in dev becomes a real
import in release).

---

## 6. Step-by-step procedure

### 6.1 Pre-requisites (do once)

| # | Action | Repo | File | Commit message |
|---|---|---|---|---|
| 1 | Change `@envoymesh/envoy-harness: "workspace:*"` → `"link:../envoy-harness"` | envoy-harness | `packages/envoy-harness-adapter/package.json` | `fix(envoy-harness-adapter): self-contained cross-monorepo dep (workspace:* → link:)` |
| 2 | Rebuild adapter (verify `dist/` regenerates) | envoy-harness | n/a (build only) | (no commit; build artifact) |
| 3 | Add `"@envoymesh/envoy-harness-adapter": "file:../../../envoy-harness/packages/envoy-harness-adapter"` to deps | EnvoyMesh | `apps/node/package.json` | `feat(phase-8): Step 0 — wire @envoymesh/envoy-harness-adapter as file: dep` |
| 4 | Run `pnpm install` in EnvoyMesh; verify symlinks; `pnpm -F @envoymesh/node typecheck` | EnvoyMesh | n/a | n/a |

After step 4, the dev loop (§4.3) is live.

### 6.2 For each EnvoyMesh release

The release procedure has two halves: **build envoy-harness first**
(envoy-harness team owns this), **then bundle EnvoyMesh with the
vendored artifacts** (EnvoyMesh team owns this). The envoy-harness
team should test their build against a recent EnvoyMesh release
before tagging.

#### 6.2.1 envoy-harness side (per release)

| # | Action | Command |
|---|---|---|
| 1 | Tag the envoy-harness version | `cd envoy-harness && git tag v0.1.0` |
| 2 | Verify build is clean (catches tag-on-broken-tree) | `cd envoy-harness && pnpm -r build && pnpm -r test` |
| 3 | Test against a recent EnvoyMesh build (CI) | manual — envoy-harness CI job runs against `envoy_harness_integration` |
| 4 | Push the tag | `cd envoy-harness && git push --tags` |
| 5 | Announce compatibility | "v0.X of envoy-harness is tested against EnvoyMesh ≥ vA.B" |

#### 6.2.2 EnvoyMesh side (per release)

| # | Action | Command |
|---|---|---|
| 1 | Ensure envoy-harness is at the tag you want | `cd envoy-harness && git checkout v0.X` |
| 2 | Run the vendor script | `bash scripts/stage-tauri-envoy-harness-bundle.sh` (or `.ps1`) |
| 3 | Verify vendored files | `ls apps/tauri/src-tauri/resources/envoy-harness/` (and `-adapter/`) |
| 4 | Run the Tauri build | `bash scripts/build-desktop.sh` (or `.ps1`) |
| 5 | Smoke test the bundle (install, run, exercise envoy-harness) | manual |
| 6 | Tag + push the EnvoyMesh release | `cd EnvoyMesh && git tag vA.B && git push --tags` |

The final artifact is
`release/envoymesh-desktop-{version}-{platform}-{arch}.dmg`
(or `.deb` / `.AppImage` / `.exe`) — a self-contained installer
with envoy-harness + adapter vendored inside.

### 6.3 Upgrade envoy-harness in a release (v0.2 → v0.3)

Same flow as 6.2 — the vendor step re-runs. EnvoyMesh's release
version is independent of envoy-harness's version (they're
separate monorepos). The vendored files are regenerated; the
Tauri bundle includes the new envoy-harness.

The two version numbers ARE related in the sense that "v0.3 of
envoy-harness should be tested against the in-flight EnvoyMesh
release." The envoy-harness team should:

- Test the new envoy-harness version against a recent EnvoyMesh
  build (CI) before tagging.
- Announce compatibility (e.g. "v0.3 of envoy-harness is tested
  against EnvoyMesh ≥ v0.2.x").

### 6.4 New developer onboarding (their first day)

A new dev wants to work on envoy-harness. Their first day:

```sh
# 1. Clone both monorepos as siblings.
mkdir -p ~/code && cd ~/code
git clone git@github.com:allenpeng0705/EnvoyMesh.git
git clone git@github.com:allenpeng0705/envoy-harness.git

# 2. (Already done once, in the envoy-harness repo by maintainer)
#    envoy-harness/packages/envoy-harness-adapter/package.json
#    should already have the link: fix from §4.1.

# 3. Install + verify.
cd EnvoyMesh
pnpm install
ls -la node_modules/@envoymesh/envoy-harness        # should be a symlink
ls -la node_modules/@envoymesh/envoy-harness-adapter # should be a symlink
pnpm -F @envoymesh/node typecheck                   # should pass

# 4. Dev loop. Edit envoy-harness, build, run EnvoyMesh — see changes via symlink.
cd ../envoy-harness
pnpm -F @envoymesh/envoy-harness build
cd ../EnvoyMesh
pnpm -F @envoymesh/node dev
```

### 6.5 Release checklist (copy-paste)

When cutting an EnvoyMesh release with envoy-harness bundled:

```sh
# --- envoy-harness side ---
cd /path/to/envoy-harness
git status                  # clean?
git checkout main && git pull
git tag v0.X                # bump as appropriate
git push --tags

# --- EnvoyMesh side ---
cd /path/to/EnvoyMesh
git status                  # clean?
git checkout main && git pull
git checkout envoy_harness_integration  # or your release branch
git merge main

# Vendor step (the new script).
bash scripts/stage-tauri-envoy-harness-bundle.sh
# PowerShell twin on Windows:
#   powershell -File scripts/stage-tauri-envoy-harness-bundle.ps1

# Verify the vendored files are fresh.
ls -la apps/tauri/src-tauri/resources/envoy-harness/
ls -la apps/tauri/src-tauri/resources/envoy-harness-adapter/

# Build the Tauri bundle.
bash scripts/build-desktop.sh macos   # or `all`
# PowerShell twin on Windows:
#   powershell -File scripts/build-desktop.ps1

# Smoke test the bundle.
open release/envoymesh-desktop-*-macos-*.dmg
# Install → launch → send a prompt with mesh keyword → confirm envoy-harness handles it

# Tag + ship.
git tag vA.B
git push --tags
```

---

## 7. Out of scope (deferred)

- **envoy-harness's own release flow** — independent from
  EnvoyMesh's. envoy-harness's own versioning + publishing is a
  separate concern (the user has been treating it as v0 private).
- **Version pinning matrix** — "which envoy-harness vX.Y is
  compatible with EnvoyMesh vA.B". Deferred until we have 2+
  versions in the wild.
- **Capability-tag-based signal detection (Phase 8 Step 5)** — the
  Q3 D detail; this doc covers the cross-monorepo wiring, the
  signal detection logic is a separate doc.
- **Auto-upgrade of vendored envoy-harness** — current flow is
  manual (re-run vendor script when envoy-harness tags a new
  version). Auto-upgrade is a CI/CD task for a future milestone.
- **Tests for the vendor script** — the script is integration-test
  by nature (builds envoy-harness, copies files, asserts files
  exist). A real test would need a fixture sibling monorepo.
  Deferred to "testability wins on tie" until a use case forces it.
- **EnvoyMesh pnpm workspace config cleanup** (deprecated
  `workspaces` field; Huawei mirror without private `@envoymesh/*`)
  — pre-existing issue, deferred as separate Phase 8 follow-up.

---

## 8. References

- [agent-harness-integration.md](./agent-harness-integration.md) —
  design plan, cooperation model, 6 injection steps
- [envoy-harness boundary](../../envoy-harness/packages/envoy-harness/docs/boundary.en.md)
- [scripts/build-desktop.sh](../scripts/build-desktop.sh) — Unix
  Tauri release flow
- [scripts/build-desktop.ps1](../scripts/build-desktop.ps1) —
  PowerShell Tauri release flow
- [scripts/stage-tauri-openclaw-bundle.sh](../scripts/stage-tauri-openclaw-bundle.sh)
  — the existing stage pattern this file follows
- [scripts/stage-tauri-envoy-harness-bundle.sh](../scripts/stage-tauri-envoy-harness-bundle.sh)
  — the new vendor script
- [scripts/stage-tauri-envoy-harness-bundle.ps1](../scripts/stage-tauri-envoy-harness-bundle.ps1)
  — PowerShell twin

---

## 9. Change log

- **2026-08-20 (initial draft):** §1-8 written. Dev flow (Option A:
  live link) + release flow (Option A: vendor at build time) +
  step-by-step procedure. The new vendor script and the
  build-desktop.sh / build-desktop.ps1 updates land in the
  same commit.
- **2026-08-20 (expanded):** added §2 cooperation-model recap, §3
  the cross-monorepo link problem, §5.2 Tauri config update
  specifics, §6.4 new-developer onboarding, §6.5 release
  checklist, and the commit-message column in the §6 tables.
- **2026-08-20 (Phase 8 Step 2 / b1.2):** `LocalRuntimeRegistry`
  rewrite. The `submitToEnvoyHarness` method is no longer a
  stub — it now constructs a `LocalMeshSubmitter` (from
  `@envoymesh/envoy-harness`) once in the constructor from
  the host-injected `buildSubagent: (input) => Agent` +
  `workerPeerId: string` (DI symmetric to `askOpenClaw` on
  the openclaw side). The e2e B test at the registry seam
  is real (mock Agent + canned `run()` result). The real
  `Agent` + `defaultBuildSubagentFactory` + `ModelAdapter`
  wiring (with a model from the host's config) lands in
  b3 when Step 2+'s `buildAgent` becomes real. The
  `LocalRuntimeRegistry` constructor's required options
  grew by 2 (`buildSubagent`, `workerPeerId`); no other
  consumers in `apps/node/src/` or `packages/` are affected
  (the registry is still only used by tests + future
  chain-worker wiring).
- **2026-08-20 (Phase 8 Step 2 / b1.5 — planned):** follow-up
  plan covers (b2) the OpenClaw `BridgeToEnvoyHarness` skill
  trigger that calls `submitToEnvoyHarness` from OpenClaw's
  runtime, and (b3) the full `Agent` e2e with a real
  `defaultBuildSubagentFactory` + `ModelAdapter`. See the
  follow-up plan doc.
- **2026-08-20 (Phase 8 Step 2 / b3 — DONE):** the
  chain-worker executor's `askEnvoyHarness` is now real
  (text-in/text-out closure backed by `EnvoyHarnessAdapter`
  + `LocalCrossRuntimeSubmitter` + `LocalRuntimeRegistry`).
  Two natural commit units land in this PR: the
  envoy-harness side (bridge: `defaultBuildAgentFactory`
  accepts a `meshSubmitter` option + pre-existing
  `local-cross-runtime-submitter.test.ts` exactOptional
  fix) and the EnvoyMesh side (new
  `agent-runtime-envoy/runtime.ts` with
  `createRealEnvoyHarnessRuntime`; the host's
  `isEnvoyHarnessReady()` + `askEnvoyHarness(prompt)`
  flip from stubs to a real closure; the config is now
  env-var-driven with `ready: true` when
  `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY` is set or the universal
  `ENVOY_HARNESS_API_KEY` override). 12 new tests
  cover the runtime (lazy init, model construction,
  cross-runtime submitter wiring, host `askOpenClaw`
  injection, empty-result handling, `workerPeerId`
  stamping, log events) + a `FakeModel` e2e that drives
  the chain worker end-to-end. 38/38 Phase 8 EnvoyMesh
  tests pass; 105/105 envoy-harness-adapter tests pass.
  Live test (needs `DEEPSEEK_API_KEY`) is a follow-up.
  Backward compatibility: `ENVOY_HARNESS_STUB_PHASE_8_STEP_1=1`
  still forces `ready: false` (the Step 1 escape hatch).
  See `docs/agent-harness-integration-b2-b3.md` §3 for
  the full b3 spec.
