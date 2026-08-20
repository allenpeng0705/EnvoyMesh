# envoy-harness integration — Step 3 + Step 4 plan

> **Status:** Step 4 ✅ DONE (2026-08-20). Step 3
> pending. Companion to
> [`agent-harness-integration.md`](./agent-harness-integration.md) (the
> design) and [`envoy-harness-integration-EnvoyMesh.md`](./envoy-harness-integration-EnvoyMesh.md)
> (the implementation guide). **This doc covers the two
> remaining Phase 8 Step 2 sub-chunks that ship after the
> b2/b3 work:** Step 3 (B-class critical EnvoyMesh skills
> in the bridge) and Step 4 (merged manifest at node
> level).
>
> **Audience:** engineers picking up the Step 3 / Step 4
> work after the b2+b3 commit. Read the design doc's
> Step 3 + Step 4 + Q1-Q5 for "why"; read this for
> "what's left, in what order, with what sub-chunks".
>
> **Why this doc exists separately:** the design doc
> covers the high-level plan in a paragraph each. The
> b2-b3 doc zooms in on the b2/b3 work. This doc zooms
> in on Step 3 + Step 4. Each one is small enough to
> commit in a single PR but big enough to need its own
> rationale.

## 1. Where b2/b3 leaves us

b1 / b2 / b3 + b3.live are all done and committed on
the `envoy_harness_integration` branch:

- **b1** (committed `43d67f7e plan`): the
  `LocalRuntimeRegistry.submitToEnvoyHarness` method is
  real; the registry delegates to a host-injected
  `LocalMeshSubmitter` with `buildSubagent` + `workerPeerId`
  injected. E2E B at the registry seam.
- **b2** (committed `bcce4272`): the OpenClaw →
  envoy-harness bridge skill (`createBridgeToEnvoyHarnessSkill`)
  is exposed. Lives in `apps/node/src/agent-runtime-envoy/`
  (not `packages/openclaw-runtime/`), so the bridge stays
  a single seam. 13 tests.
- **b3** (committed `bcce4272`): the real
  `createRealEnvoyHarnessRuntime` constructs the full
  stack (ModelAdapter + LocalMeshSubmitter +
  LocalRuntimeRegistry + LocalCrossRuntimeSubmitter +
  EnvoyHarnessAdapter). 12 tests + FakeModel e2e.
- **b3.live.1** (committed in `e7747842`): envoy-harness
  inherits the host's `ModelProviderConfig` model +
  `ENVOY_HARNESS_MODEL` env var overrides.
  `resolveEnvoyHarnessHostModel` helper + 19 tests.
- **b3.live.2** (committed in `e7747842`): envoy-harness
  inherits the host's `ModelProviderConfig.apiKey`;
  the live test no longer falls back to
  `DEEPSEEK_API_KEY`. `resolveEnvoyHarnessHostConfig`
  helper + 17 tests. Live test exercised with
  `ENVOY_HARNESS_LIVE_TESTS=1` + real DeepSeek.

**What we have today:**

- `LocalMeshSubmitter` (real, in `envoy-harness/`)
- `LocalCrossRuntimeSubmitter` (real, in
  `envoy-harness-adapter/`)
- `LocalRuntimeRegistry.submitToEnvoyHarness` (real,
  host-injected `buildSubagent`)
- `createRealEnvoyHarnessRuntime` (real, lazy
  construction)
- 5 envoy-harness skills (`code-edit`, `code-review`,
  `doc-search`, `bash-run`, `plan`)
- 4 OpenClaw skills (`research`, `summarize`,
  `translate`, `draft`)
- Cross-runtime sub-agent delegation (both directions)
- `bridge-to-envoy-harness` skill (OpenClaw →
  envoy-harness, **opt-in only** in Step 5)

**What we don't have yet:**

- B-class skills (sponsor-friend / peer-list /
  relay-status) are not in any skill manifest. They
  exist as CLI commands in `developer-cli.ts` and as
  `node-service-setup-sponsor-friend.ts` in `apps/node/src/`.
  The OpenClaw adapter doesn't expose them as
  `SkillDescriptor`s, and the envoy-harness adapter
  doesn't either.
- The orchestrator doesn't have a merged manifest. It
  reads from one adapter at a time (the chosen
  runtime). With 2 adapters, the orchestrator would
  need to read from both to know the full set of
  skills available on the node.

## 2. Recommended order: Step 4 first, then Step 3

**Why Step 4 first, not Step 3:**

1. **Step 4 is mostly plumbing.** It aggregates the
   existing 5 + 4 = 9 skills into one merged manifest,
   tagged by runtime. No new behavior — just a single
   read source for the orchestrator. Easier to review,
   easier to revert.
2. **Step 3 is the hard one.** Porting the B-class
   skills to the bridge means moving the canonical
   implementation from `apps/node/src/` to
   `envoy-harness-adapter/src/`. The `setup-sponsor-friend`
   impl in particular is 600+ lines with 7+ optional
   dependencies (mesh readiness probe, bond context
   listener, audit events, profile loader, etc.).
   That's a real refactor.
3. **Step 4 unblocks testing Step 3.** Once the merged
   manifest exists, we can drop Step 3's skills into
   it without changing the orchestrator's read path.
   Step 3's PR becomes "add 3 skills" instead of "add
   3 skills + plumb the manifest merge".
4. **Smaller first commit is lower-risk.** The merged
   manifest PR is mostly a new file + a single
   integration point in the orchestrator. If something
   goes wrong, it's easy to bisect.

**Alternative: Step 3 first, then Step 4** (as the
design doc §5 implies). This is also valid; the
rationale would be "land the canonical impl first, then
aggregate". The trade-off is the Step 3 PR is larger
(the impl + the merge) and harder to review.

**Recommendation: Step 4 first.** Land the merge
plumbing, then drop the B-class skills into the
already-merged manifest.

## 3. Step 4 — Merged manifest at node level (~1 week)

### 3.1 Goal

The orchestrator sees **one manifest per node**, with
skills tagged by runtime. The merged manifest is the
**single source of truth** for the Assigner.

### 3.2 Current state (the problem)

Today, each adapter exposes its own `describeSkills()`.
The orchestrator's `agent-adapter-broadcast.ts` walks
the registered adapters and emits per-adapter
manifests. The Assigner (in `agent-network-plan-assign`)
gets N manifests for N adapters and has to merge them
on its own (or ignore the others and pick the chosen
runtime's manifest). This is N×M work — the Assigner
doesn't know which skills are on this node, just
which skills are on the chosen runtime.

The merged manifest solves this: the host has one
`getNodeManifest()` call that returns the union
(`envoy-harness.skills ∪ OpenClaw.skills`, tagged
with `runtime: "envoy-harness" | "openclaw"`). The
Assigner reads from this; the per-adapter broadcast
stays (other consumers may still need it).

### 3.3 What changes

- **New:** `apps/node/src/agent-network-skills-aggregate.ts`
  — node-level manifest aggregator. Pulls
  `envoy-harness-adapter.listSkills()` and
  `OpenClawAdapter.listSkills()`, returns the union
  with `runtime` tag.
- **New:** `apps/node/src/agent-network-skills-aggregate.test.ts`
  — unit tests for the aggregator.
- **Update:** `agent-adapter-broadcast.ts` (the
  per-adapter broadcast) — add a new broadcast that
  reads the merged manifest. Existing per-adapter
  broadcast stays.
- **Update:** the orchestrator's manifest picker (in
  `agent-network-plan-assign.ts` or wherever the
  Assigner reads its input) — read from the merged
  manifest.
- **Update:** the doc (`agent-network-engine.md` §2)
  to document the new merged manifest as the single
  source of truth.

### 3.4 The merged manifest shape

```ts
// New type in `apps/node/src/agent-network-skills-aggregate.ts`
export interface MergedSkillEntry {
  skillId: string;          // unique per node
  description: string;
  costCeilingUsd: number;
  maxSensitivity: SkillDescriptor["maxSensitivity"];
  tags: ReadonlyArray<string>;
  runtime: "envoy-harness" | "openclaw";
}

export interface NodeManifest {
  peerId: string;            // the node's peerId
  runtimes: ReadonlyArray<{
    runtime: "envoy-harness" | "openclaw";
    runtimeVersion: string;
  }>;
  skills: ReadonlyArray<MergedSkillEntry>;
}
```

**Why `runtime` per skill (not per manifest):** the
Assigner picks "the best runtime for this job's
required skills" (Q5 = per-node primary + best-fit
fallback). The skill's `runtime` tag tells the
Assigner which runtime to dispatch to when this
skill is the best fit. This is also the seam Step 5
(signal-based routing) will use.

**Why no `runtime: "bridge"` category yet:** B-class
skills (Step 3) live in the bridge, but they're
**invoked through** envoy-harness or OpenClaw
(not directly through the bridge). So at the
manifest level, the tag is the invoking runtime, not
the impl location. This may change if we add a
"bridge-direct" category later, but v0 doesn't
need it.

**Why skillId uniqueness:** the orchestrator assumes
skillIds are unique per node. The aggregator
**fails loud** on collision (two runtimes with the
same skillId). The test enforces this.

### 3.5 Sub-chunks

| # | Action | Files | Commit |
|---|---|---|---|
| 1 | Define `MergedSkillEntry` + `NodeManifest` types | `apps/node/src/agent-network-skills-aggregate.ts` (new) | (squash w/ 2) |
| 2 | Implement the aggregator: read both adapters, tag with runtime, fail loud on collision | same file | (squash w/ 1) |
| 3 | Unit tests for the aggregator: empty case / single runtime / both runtimes / collision / tag preservation | `apps/node/test/agent-network-skills-aggregate.test.ts` (new) | (squash w/ 1) |
| 4 | Wire the aggregator into the orchestrator's manifest picker | `agent-network-plan-assign.ts` (or wherever the Assigner reads) | (squash w/ 1) |
| 5 | E2E test: with 2 runtimes, the orchestrator sees a single merged manifest with all skills | `apps/node/test/agent-network-merged-manifest.e2e.test.ts` (new) | (squash w/ 1) |
| 6 | Update `agent-network-engine.md` §2 to document the merged manifest as the single source of truth | `docs/agent-network-engine.md` | (squash w/ 1) |

### 3.6 What Step 4 does NOT cover

- **Per-skill fan-out (whole-job routing only v0).** A
  job with `requiredSkill: ["code-review", "peer-list"]`
  routes to one runtime (the one with the most skills
  needed), not "code-review to envoy-harness +
  peer-list to OpenClaw". That's a future chunk.
- **Signal-based opt-in routing (Step 5).** Step 4 is
  a passive merge; the orchestrator still uses the
  existing engine picker to choose the primary.
  Step 5 layers signal-based routing on top.
- **B-class skills (Step 3).** Step 4 ships with the
  current 5 + 4 = 9 skills. Step 3 adds 3 B-class
  skills to the merged manifest (6 entries — one per
  runtime, since both runtimes can invoke them).

## 4. Step 3 — B-class critical EnvoyMesh skills in envoy-harness-adapter (~1-2 weeks)

### 4.1 Goal

The bridge (`envoy-harness-adapter`) is the **canonical
implementation** of mesh-touching capabilities that are
critical enough to require a backup. Both envoy-harness
and OpenClaw consume these from the bridge through
their respective adapter. envoy-harness can run a bond
flow **even if OpenClaw subprocess is down** — because
envoy-harness doesn't go through OpenClaw; it goes
through `envoy-harness-adapter`.

### 4.2 The 3 B-class skills

| Skill | Description | Today's location |
|---|---|---|
| `setup-sponsor-friend` | First-launch auto-bond with the canonical sponsor (the bundled-sponsor-friend URI). 600+ lines of mesh/bond/audit logic. | `apps/node/src/node-service-setup-sponsor-friend.ts` |
| `peer-list` | List observed peers (LAN + WAN). Currently a CLI command in `developer-cli.ts`. | `apps/node/src/developer-cli.ts` + `peer-directory-learn.ts` |
| `relay-status` | Show local relay manager snapshot. Currently a CLI command in `developer-cli.ts`. | `apps/node/src/developer-cli.ts` + `chain-relay.ts` |

**Why these 3 (and not others):** they're the
mesh-touching capabilities that an installer
**needs to run on first launch** without depending
on OpenClaw being up. `setup-sponsor-friend` is the
biggest one (auto-bond is the installer's primary
onboarding step). `peer-list` + `relay-status` are
diagnostics — if OpenClaw is down, the installer
still needs to see "what's my network status".

**Why not `morning-report`, `vault-search`, etc.:**
those are LLM-style skills that go through the model.
The bridge doesn't need to own them; envoy-harness
and OpenClaw each have their own.

### 4.3 The "canonical in the bridge" pattern

**The problem:** today, the B-class skill impls live
in `apps/node/src/`. That's an EnvoyMesh-specific
location — the bridge can't import from
`apps/node/src/`. So if we want the bridge to be
canonical, we have to MOVE the impls.

**The move:**
1. The canonical impl moves to
   `envoy-harness-adapter/src/b-class-skills/<name>.ts`.
2. The impl is a pure function: `(deps, args) =>
   result`. The deps are abstracted (mesh readiness
   probe, bond context, audit events, profile
   loader, etc.). The bridge defines the dep
   interface; EnvoyMesh provides the impl.
3. EnvoyMesh's `apps/node/src/` keeps a thin
   wrapper that calls the bridge's canonical impl
   with the actual deps (from the running
   `NodeServiceImpl`). The wrapper preserves the
   existing public API
   (`runSetupSponsorFriend`, `listObservedPeers`,
   `showRelayStatus`) so existing callers don't break.

**Why move the impl, not just add a bridge wrapper:**
the user's concern was "sometime maybe OpenClaw
didn't work. we can have a backup and we know
EnvoyMesh related things are in envoy-harness."
A wrapper doesn't help — the wrapper still calls
OpenClaw, which is the thing that might be down.
Moving the impl means envoy-harness can run the
skill directly without going through OpenClaw.

**Snapshot test:** the canonical impl's output
should match OpenClaw's local output (modulo
non-deterministic fields like timestamps). Step 3
includes a snapshot test that runs both impls on
the same input and verifies they produce the same
result. This catches regressions in the canonical
move.

### 4.4 What changes

- **New:** `envoy-harness-adapter/src/b-class-skills/setup-sponsor-friend.ts`
  — the canonical `setup-sponsor-friend` impl. Pure
  function with the deps as parameters. The complex
  loop / retry / cooldown logic moves here.
- **New:** `envoy-harness-adapter/src/b-class-skills/peer-list.ts`
  — canonical `peer-list` impl. Pure function
  reading from the libp2p peerstore.
- **New:** `envoy-harness-adapter/src/b-class-skills/relay-status.ts`
  — canonical `relay-status` impl. Pure function
  reading from the libp2p circuit-relay.
- **Update:** `envoy-harness-adapter/src/skills.ts` —
  add the 3 B-class skills to `ENVOY_HARNESS_SKILLS`.
- **Update:** `envoy-harness-adapter/src/adapter.ts` —
  expose the 3 B-class skills as BUILTIN_TOOLS (via
  `defaultBuildAgentFactory` or a custom factory).
  The tool invocations route through the bridge.
- **Update:** `packages/agent-adapter/src/openclaw-adapter.ts` —
  add the 3 B-class skills to `OPENCLAW_SKILLS`.
- **Update:** `apps/node/src/agent-runtime-envoy/manifest.ts` —
  re-export the new skills (so `ENVOY_HARNESS_RUNTIME_SKILLS`
  includes them).
- **Update:** `apps/node/src/node-service-setup-sponsor-friend.ts`
  — replace the impl with a thin wrapper that
  calls the bridge's canonical impl.
- **Update:** `apps/node/src/developer-cli.ts` — the
  3 B-class CLI commands become thin wrappers that
  call the bridge's canonical impl.

### 4.5 The dep abstraction

The bridge's `setup-sponsor-friend` impl needs the
following deps (currently injected as optional
parameters in
`node-service-setup-sponsor-friend.ts:SetupSponsorFriendDeps`):

- `probeMeshReady?(): Promise<boolean>` — libp2p
  mesh readiness probe
- `loadNodeProfile()` — load the local node profile
- `isAlreadyBondedWith?(ownerId)` — check if the
  sponsor is already in the local trust store
- `waitForBondEstablished?(ownerId, timeoutMs)` —
  wait for the bond to be established
- `peerMultiaddrs?` / `getPeerMultiaddrs?()` —
  sponsor's known multiaddrs
- `localDiscoveryProfile?` — local LAN opt-in
- `appendAudit?(event)` — audit log
- `now?()` — for cooldown calculation
- `assertOnline()` — runtime check

**The dep interface lives in the bridge** (in
`envoy-harness-adapter/src/b-class-skills/setup-sponsor-friend.ts`):
the bridge defines `BClassSetupSponsorFriendDeps` with
the same fields, but as required (the bridge impl
assumes they're all present; missing deps are a
configuration error).

**EnvoyMesh wraps the bridge:** in
`apps/node/src/node-service-setup-sponsor-friend.ts`,
the existing `SetupSponsorFriendDeps` (with optional
fields) gets a thin layer that maps to
`BClassSetupSponsorFriendDeps` (with required fields).
Missing optional fields get sensible defaults
(throw on `probeMeshReady` if not provided, etc.).

**Snapshot test:** the bridge's canonical impl +
a synthetic dep implementation produces the same
output as the existing `apps/node/src/` impl for
the same input. The test catches accidental
behavior changes during the move.

### 4.6 Sub-chunks (revised per user decision 2026-08-20: 1 commit for all 3 impls)

| # | Action | Files | Commit |
|---|---|---|---|
| 1 | **All 3 canonical impls + snapshot tests** (atomic) | `envoy-harness-adapter/src/b-class-skills/{setup-sponsor-friend,peer-list,relay-status}.ts` (new) + `apps/node/src/node-service-setup-sponsor-friend.ts` (rewrite as wrapper) + `apps/node/src/developer-cli.ts` (wrappers) + `envoy-harness-adapter/test/b-class-skills/*.test.ts` (snapshot tests) | **standalone commit** |
| 2 | Manifest updates: add to `ENVOY_HARNESS_SKILLS` + `OPENCLAW_SKILLS` + `ENVOY_HARNESS_RUNTIME_SKILLS`; expose as BUILTIN_TOOLS in the bridge | `envoy-harness-adapter/src/skills.ts` + `envoy-harness-adapter/src/adapter.ts` + `packages/agent-adapter/src/openclaw-adapter.ts` + `apps/node/src/agent-runtime-envoy/manifest.ts` | **standalone commit** |
| 3 | E2E test (envoy-harness can run `setup-sponsor-friend` end-to-end without OpenClaw, using a synthetic sponsor) + design doc update (`agent-harness-integration.md` §2.2) | `envoy-harness-adapter/test/b-class-skills/setup-sponsor-friend.e2e.test.ts` (new) + `docs/agent-harness-integration.md` | **standalone commit** |

**3 commits total for Step 3.**

### 4.7 What Step 3 does NOT cover

- **More skills beyond the 3 B-class.** Step 3 is
  scoped to the 3 mesh-touching skills that the user
  identified as critical. `morning-report` /
  `vault-search` / `discover-topic` etc. stay in
  OpenClaw (or in envoy-harness if/when they're
  ported).
- **Replacing OpenClaw's local impl entirely.** The
  `apps/node/src/` wrappers preserve the existing
  public API; OpenClaw's local impl is still
  available as a thin wrapper. The migration is
  incremental — users calling OpenClaw see no
  change.
- **Cross-runtime invocation of B-class skills.** The
  3 B-class skills are exposed on BOTH runtimes'
  manifests. The Assigner (Step 4) picks the
  primary runtime per job. A future chunk could
  add "if the primary doesn't have the B-class
  skill, delegate via `LocalCrossRuntimeSubmitter`" —
  but that's a routing decision (Q5) and lands in
  Step 5+.

## 5. Open questions

1. **Order: Step 4 first or Step 3 first?**
   - **My recommendation: Step 4 first.** Smaller
     first commit, lower-risk, easier to review.
     Step 3 lands on top of the already-merged
     manifest.
   - **Alternative: Step 3 first** (as the design
     doc §5 implies). Land the canonical impl first,
     then aggregate. Larger first commit.
   - **Default: Step 4 first.** Override if you
     prefer Step 3 first.

2. **B-class scope: 3 skills (sponsor-friend,
   peer-list, relay-status) or more?**
   - **My recommendation: 3.** These are the
     mesh-touching capabilities the user identified
     as "critical enough to require a backup".
   - **Possible additions:** `morning-report`
     (LLM-style, can wait), `vault-search`
     (LLM-style, can wait), `discover-topic`
     (LLM-style, can wait). These don't fail if
     OpenClaw is down (they're not first-launch
     critical).
   - **Default: 3.** Override if you want more.

3. **B-class skills in the merged manifest: how are
   they tagged?**
   - **My recommendation: tagged with the invoking
     runtime** (`runtime: "envoy-harness" | "openclaw"`).
     The bridge impl is shared, but the manifest
     entry is duplicated (one per runtime that
     exposes it). The Assigner picks the runtime
     to dispatch to.
   - **Alternative: a third `runtime: "bridge"`
     category.** The bridge manifest is its own
     thing. Both runtimes can invoke bridge skills
     via the cross-runtime transport.
   - **Default: invoking runtime tag.** Override
     if you want a separate "bridge" category.

4. **Snapshot test fidelity: how strict?**
   - **My recommendation: strict on the data
     fields, loose on timestamps / nonces.**
     Timestamps always differ; the test should
     normalize them before comparing.
   - **Default: strict on data, loose on
     timestamps.** Override if you want a different
     policy.

5. **Migration of OpenClaw's `setupSponsorFriend`:
   preserve the existing API exactly, or break it
   for a cleaner design?**
   - **My recommendation: preserve.** The
     `runSetupSponsorFriend` public API stays
     identical. The internals become a wrapper
     around the bridge impl. No breaking change
     for existing callers.
   - **Default: preserve.** Override if you want
     a breaking change.

6. **Sub-chunk granularity: 1 commit per skill, or
   1 commit per "all 3 skills"?**
   - **My recommendation: 1 commit per skill
     (3 commits for the impls) + 1 commit for
     "expose them as BUILTIN_TOOLS" (1 commit
     for the manifest updates). 4-5 commits total
     for Step 3.
   - **User decision (2026-08-20): 1 commit for
     all 3.** All 3 canonical impls land in a
     single atomic commit. The rationale is that
     the 3 B-class skills are conceptually one
     feature ("mesh-touching capabilities
     canonical in the bridge"), and the snapshot
     tests are the cross-check that catches
     regressions. Per-skill commits would create
     3 PRs that each leave the bridge in an
     inconsistent state (one skill canonical, two
     not yet). Single commit is cleaner.
   - **Result:** Step 3 has 3 commits total:
     1. All 3 canonical impls + snapshot tests
        (atomic, single commit)
     2. Manifest updates: add to
        `ENVOY_HARNESS_SKILLS` + `OPENCLAW_SKILLS`
        + `ENVOY_HARNESS_RUNTIME_SKILLS`, expose
        as BUILTIN_TOOLS in the bridge
     3. E2E test (envoy-harness can run
        `setup-sponsor-friend` end-to-end without
        OpenClaw) + doc update

## 6. Order

**Recommended: Step 4 first (~1 week), then Step 3
(~1-2 weeks). Total: 2-3 weeks.**

Rationale:

- **Step 4 is mostly plumbing.** It aggregates 5 + 4
  = 9 skills into one merged manifest. Easier to
  review, easier to revert.
- **Step 3 is the hard one.** Porting the B-class
  skills to the bridge is a real refactor
  (especially `setup-sponsor-friend` with 600+
  lines + 7+ deps).
- **Step 4 unblocks Step 3 testing.** Once the
  merged manifest exists, Step 3's skills show up
  automatically. Step 3 doesn't have to also
  plumb the manifest merge.
- **Smaller first commit is lower-risk.** Step 4
  is mostly a new file + a single integration
  point. If something goes wrong, it's easy to
  bisect.

**Alternative: Step 3 first, then Step 4** (as the
design doc §5 implies). Larger first commit
(Step 3 includes both the impl move + the
manifest merge).

**Default: Step 4 first.** Override if you prefer
Step 3 first.

## 7. What this plan does NOT cover

- **Step 5 (signal-based opt-in routing).** This
  doc is about Step 3 + Step 4. Step 5 is a
  separate follow-up.
- **Step 6 (cross-verify Q4 A).** Also a separate
  follow-up.
- **Adding more B-class skills.** Step 3 is
  scoped to the 3 identified. Future chunks can
  add more.
- **Per-skill fan-out (whole-job routing v0).** A
  job's `requiredSkill` list routes to one runtime,
  not multiple. Future chunk.

## 8. References

- Design doc: `docs/agent-harness-integration.md`
  §2.2 (B-class skills), §5 (the 6 injection steps,
  Step 3 + Step 4), §7 (open questions).
- b2/b3 follow-up: `docs/agent-harness-integration-b2-b3.md`.
- Implementation guide:
  `docs/envoy-harness-integration-EnvoyMesh.md`.
- Existing `setup-sponsor-friend` impl:
  `apps/node/src/node-service-setup-sponsor-friend.ts`.
- Existing `peer-list` / `relay-status` CLI commands:
  `apps/node/src/developer-cli.ts`.
- Bridge skills catalog:
  `envoy-harness/packages/envoy-harness-adapter/src/skills.ts`.
- Bridge adapter:
  `envoy-harness/packages/envoy-harness-adapter/src/adapter.ts`.
- OpenClaw adapter:
  `packages/agent-adapter/src/openclaw-adapter.ts`.
- Manifest aggregator (new in Step 4):
  `apps/node/src/agent-network-skills-aggregate.ts` (TBD).
- b3.live.1 / b3.live.2 (the API key + model
  inheritance): `docs/agent-harness-integration-b2-b3.md` §4.

## 9. Change log

- **2026-08-20 (initial draft):** Step 3 + Step 4
  plan written. Recommended order: Step 4 first
  (plumbing), then Step 3 (canonical B-class
  skills). Sub-chunks sized for single commits.
  Open questions §5 documented.
- **2026-08-20 (user decisions on §5 open
  questions):** confirmed all 4 recommendations
  + 1 override. Decisions:
  1. **Order:** Step 4 first (smaller first
     commit, plumbing first)
  2. **B-class scope:** 3 skills
     (sponsor-friend / peer-list / relay-status)
  3. **Merged manifest tag:** invoking runtime
     (`runtime: "envoy-harness" | "openclaw"`)
  4. **Sub-chunk granularity:** **1 commit for
     all 3 impls** (overrides my per-skill
     recommendation). Step 3 = 3 commits total
     (impls + manifest + e2e). §4.6 revised.
- **2026-08-20 (Step 4 ✅ DONE):** 4 commits shipped
  on `envoy_harness_integration` branch:
  - `5ac5f627 step 4-1` (aggregator + 9 unit tests)
  - `0947bd55 Update node-service-impl.ts`
    (host wiring)
  - `59f2abc0 Create agent-adapter-manifest-aggregate-host.test.ts`
    (5 host tests)
  - Doc update (operator-facing + design + impl
    guide changelogs + this sub-plan §8 + status
    banner)
  
  **14 new tests, all pass. Type-check clean.**
  Detailed plan in
  `docs/agent-harness-integration-step4.md`. Step 3
  (B-class skills) is the next chunk; the merged
  manifest will auto-pick up the 3 new B-class
  skills when Step 3 lands.
