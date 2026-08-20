# envoy-harness integration — Step 4 sub-plan (merged manifest at node level)

> **Status:** Draft (2026-08-20). Detailed sub-plan for
> Step 4. Companion to
> [`agent-harness-integration.md`](./agent-harness-integration.md) (the
> design) and
> [`agent-harness-integration-step3-4.md`](./agent-harness-integration-step3-4.md)
> (the high-level plan).
>
> **What this doc covers:** Step 4 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary. Read the design doc
> for "why"; read this for "exactly what to build".
>
> **Order:** Step 4 ships first (per user decision
> 2026-08-20). Step 3 (B-class skills) lands on top.

## 1. Goal

The orchestrator sees **one manifest per node** for
the Agent Network. The merged manifest is a **local
view** (not a wire format) that aggregates
`describeSkills()` from every registered adapter,
tagged with the runtime that owns each skill.

**Why this is a local view, not a wire format:**
the wire format `CapabilityManifest` (in
`@envoymesh/protocol/agent-adapter.ts:121`) is
**per-runtime** — one `runtime: AgentRuntime` per
manifest, with that runtime's `skills[]`. A node
with 2 runtimes broadcasts **2 separate manifests**
(one per runtime, on the wire). The merged manifest
is the host's **local aggregate** of what those 2
manifests would say, for the orchestrator to query
without iterating per-adapter.

**Why this matters today (Q5 routing):** the
orchestrator's "per-node primary + best-fit skill
fallback" routing decision needs to know "what
skills does this node have, and which runtime owns
each". The merged manifest answers that in one read.
Without it, the orchestrator would have to
instantiate each adapter, call `describeSkills()`,
union the results, and tag each with the adapter's
runtime — every routing decision.

**After Step 4:** `getNodeManifest()` returns the
merged manifest. The orchestrator's manifest picker
calls it once at startup + on adapter config
change; routing decisions become a local lookup.

## 2. Existing pieces (what we build on)

### 2.1 `AgentAdapter` interface

**File:** `packages/agent-adapter/src/agent-adapter.ts:116`

The canonical adapter interface. Every per-runtime
adapter (envoy-harness, OpenClaw, Pi, Hermes, ...)
implements it.

Key methods for Step 4:
- `readonly runtime: AgentRuntime` — line 122
- `describeSkills(): SkillDescriptor[]` — line 132
- `buildManifest(input): Promise<CapabilityManifest>` — line 142

The orchestrator's contract with adapters is
**entirely through this interface**. The orchestrator
never imports a concrete adapter class.

### 2.2 `AdapterRegistry`

**File:** `packages/agent-adapter/src/runtime-registry.ts:62`

A process-level registry of `AgentAdapter` instances,
indexed by `AgentRuntime`. **Today, this registry
is unused** — adapters are constructed on-demand per
subtask. Step 4 uses the registry pattern for the
merged manifest.

Key methods:
- `register(adapter)` — line 72
- `get(runtime)` — line 98
- `list()` — line 115 (returns `AgentRuntime[]`)
- `listAdapters()` — line 122 (returns `AgentAdapter[]`)
- `size` — line 130

`DuplicateAdapterError` — line 41 (throws on
duplicate registration; the orchestrator cannot
dispatch to two adapters for the same runtime).

### 2.3 `OpenClawAdapter` + `OPENCLAW_SKILLS`

**File:** `packages/agent-adapter/src/openclaw-adapter.ts:98` (class), line 37 (skills)

- `OpenClawAdapter` class implements `AgentAdapter`
- `OPENCLAW_SKILLS: SkillDescriptor[]` is the
  static list of 4 skills (`research`, `summarize`,
  `translate`, `draft`)
- `describeSkills()` returns `OPENCLAW_SKILLS`
- `runtime: "openclaw"` — line 99
- `buildManifest(input)` returns the unsigned
  `CapabilityManifest` with `runtime: "openclaw"`
  and `skills: OPENCLAW_SKILLS`

### 2.4 `EnvoyHarnessAdapter` (from envoy-harness-adapter)

**File:** `envoy-harness/packages/envoy-harness-adapter/src/adapter.ts`

- `EnvoyHarnessAdapter` class implements `AgentAdapter`
- `ENVOY_HARNESS_SKILLS: SkillDescriptor[]` is the
  static list of 5 skills (`code-edit`, `code-review`,
  `doc-search`, `bash-run`, `plan`) — see
  `envoy-harness/packages/envoy-harness-adapter/src/skills.ts:50`
- `describeSkills()` returns `ENVOY_HARNESS_SKILLS`
- `runtime: "envoy-harness"` — the bridge's
  `AdapterRuntime` is `"envoy-harness"`
- `buildManifest(input)` returns the unsigned
  `CapabilityManifest` with `runtime: "envoy-harness"`

**Step 3 will add 3 B-class skills to this list**;
Step 4 doesn't touch the B-class skills, just the
aggregation.

### 2.5 The current broadcast flow

**File:** `apps/node/src/agent-adapter-broadcast.ts`

The current per-adapter broadcaster:
- `buildSignedCapabilityManifest(input)` — line 59
  builds a per-runtime `SignedCapabilityManifest`
  (one runtime, one signature).
- `startManifestBroadcaster(deps)` — line 174 starts
  the periodic broadcast (every 5 min, TTL/2).

**Today:** the broadcaster is called per-adapter
(one per registered adapter). **Step 4 doesn't
change the broadcaster** — it stays per-adapter on
the wire. The merged manifest is for **local
queries**, not wire broadcast.

### 2.6 `agent-network-skills-aggregate.ts` (the existing file — don't confuse)

**File:** `apps/node/src/agent-network-skills-aggregate.ts`

Aggregates `AgentNetworkProfile.skills` (owner's
declared skills + OpenClaw workspace skills) for
the **mesh profile** (the owner's mesh-facing
profile card). **This is a different concern from
Step 4.** Step 4 is about **adapter manifests**
(envoy-harness + OpenClaw adapter skill catalogs),
not profile skills.

The new file is named
`apps/node/src/agent-adapter-manifest-aggregate.ts`
to keep the parallel with
`apps/node/src/agent-adapter-broadcast.ts` and
avoid the name collision.

## 3. What Step 4 builds

### 3.1 The aggregator

**New file:** `apps/node/src/agent-adapter-manifest-aggregate.ts`

A pure function that takes a list of `AgentAdapter`
instances + the node's peerId and returns the
merged `NodeManifest`.

```ts
// Type definitions (placed at top of file)

import type {
  AgentRuntime,
  SkillDescriptor,
} from "@envoymesh/protocol";
import type { AgentAdapter } from "@envoymesh/agent-adapter";

/** A single skill entry in the merged manifest, tagged with its runtime. */
export interface MergedSkillEntry {
  skillId: string;
  description: string;
  costCeilingUsd: number | undefined;
  maxSensitivity: SkillDescriptor["maxSensitivity"];
  tags: ReadonlyArray<string>;
  /** The runtime that owns this skill (where the model can call it). */
  runtime: AgentRuntime;
}

/** A runtime entry in the merged manifest. */
export interface MergedRuntimeEntry {
  runtime: AgentRuntime;
  runtimeVersion: string;
}

/** The local merged manifest for this node. */
export interface NodeManifest {
  peerId: string;
  runtimes: ReadonlyArray<MergedRuntimeEntry>;
  skills: ReadonlyArray<MergedSkillEntry>;
}

/** Thrown when two adapters expose the same skillId. */
export class SkillIdCollisionError extends Error {
  constructor(
    public readonly skillId: string,
    public readonly runtimeA: AgentRuntime,
    public readonly runtimeB: AgentRuntime,
  ) {
    super(
      `skillId collision: '${skillId}' is in both ` +
        `runtime '${runtimeA}' and runtime '${runtimeB}'`,
    );
    this.name = "SkillIdCollisionError";
  }
}
```

The aggregator function:

```ts
export function aggregateNodeManifest(input: {
  peerId: string;
  adapters: ReadonlyArray<AgentAdapter>;
}): NodeManifest {
  const runtimes: MergedRuntimeEntry[] = [];
  const skills: MergedSkillEntry[] = [];
  const seenSkillIds = new Map<string, AgentRuntime>();

  for (const adapter of input.adapters) {
    // The adapter's runtimeVersion is on the manifest,
    // not the adapter itself. v0 uses "unknown" for
    // adapters that don't expose it; future: read from
    // buildManifest() output.
    runtimes.push({
      runtime: adapter.runtime,
      runtimeVersion: "unknown",
    });

    for (const skill of adapter.describeSkills()) {
      const existing = seenSkillIds.get(skill.skillId);
      if (existing !== undefined) {
        throw new SkillIdCollisionError(
          skill.skillId,
          existing,
          adapter.runtime,
        );
      }
      seenSkillIds.set(skill.skillId, adapter.runtime);
      skills.push({
        skillId: skill.skillId,
        description: skill.description,
        costCeilingUsd: skill.costCeilingUsd,
        maxSensitivity: skill.maxSensitivity,
        tags: skill.tags,
        runtime: adapter.runtime,
      });
    }
  }

  return {
    peerId: input.peerId,
    runtimes,
    skills,
  };
}
```

**Why this fails loud on collision:** the merged
manifest is the **single source of truth** for the
orchestrator. A `skillId` that exists in two
runtimes is a **bug in one of the runtimes** — the
model would see two skills with the same name in
its tool list, which is undefined behavior. We
fail loud at aggregation time, not silently.

**Why `runtimeVersion: "unknown"` v0:** the
`AgentAdapter` interface doesn't expose
`runtimeVersion` directly (it's on the manifest,
not the adapter). v0 hard-codes `"unknown"`; a
follow-up can add a `getRuntimeVersion()` method
to the interface.

**Why not call `buildManifest()` for each
adapter:** `buildManifest()` is async + takes
input (peerId, ownerId, reputationBySkill). The
aggregator is sync; for `describeSkills()` only,
sync is enough. v0 doesn't need the manifest's
`runtimeVersion`; future: replace the hard-code
with a small async variant that calls
`buildManifest()`.

### 3.2 Where it gets called

**New method on `NodeServiceImpl`:**
`getNodeManifest(): NodeManifest`

This is the **local query** the orchestrator uses.
The implementation:

1. Build a list of `AgentAdapter` instances
   (currently: `[openClawAdapter, envoyHarnessAdapter]`)
2. Call `aggregateNodeManifest({ peerId, adapters })`
3. Return the result

**Where the adapters come from:**

- **OpenClawAdapter:** the existing
  `runOpenClawMapPrimary` constructs a fresh
  `new OpenClawAdapter({...})` per subtask. For
  the merged manifest, we need a **stateless
  OpenClawAdapter** (just for `describeSkills()`).
  v0: construct a stub with `askViaRuntime: () => { throw }` and
  `isReady: () => true` — the stub is only used
  for `describeSkills()`; `askViaRuntime` is never
  called.

- **EnvoyHarnessAdapter:** the existing
  `createRealEnvoyHarnessRuntime` constructs a
  fresh `EnvoyHarnessAdapter` lazily on first
  `askEnvoyHarness` call. For the merged
  manifest, we need a **stateless
  EnvoyHarnessAdapter** (just for
  `describeSkills()`). v0: construct a stub with
  `buildAgent: () => { throw }` and
  `signResult: (u) => u` — the stub is only used
  for `describeSkills()`; `buildAgent` is never
  called.

**Why stubs (not the real adapters):** the merged
manifest is for the **capability view**, not the
execution view. The real adapters carry runtime
state (api keys, peer ids, ask closures); the
merged manifest doesn't need any of that. v0 uses
stubs that throw on `execute()` and `buildManifest()`
but return the correct `describeSkills()`.

**Where to construct the stubs:** in
`NodeServiceImpl.getNodeManifest()`, in a
`_getNodeManifestStubs()` private method. Test
seam: tests can inject custom stubs via
`setManifestStubsForTests(stubs)`.

### 3.3 What the orchestrator does with the merged manifest

The orchestrator's manifest picker (in
`agent-network-plan-assign.ts` or wherever the
Assigner reads its input) reads
`nodeService.getNodeManifest()` instead of
iterating per-adapter.

**v0 wiring:** the orchestrator currently reads
the broadcast manifests from peer storage (per
remote node). The local merged manifest is a
**new** local query; it doesn't replace the
broadcast. The orchestrator may use both (local
query for "what can this node do", broadcast for
"what can remote nodes do").

**Where to wire:** for v0, add a method
`getNodeManifest()` on `NodeServiceImpl`; the
orchestrator's manifest picker is updated to call
it. The broadcast flow is unchanged.

### 3.4 Tests

**Unit tests:**
`apps/node/test/agent-adapter-manifest-aggregate.test.ts`

Cases:
1. Empty input (no adapters) → empty manifest
2. Single adapter → manifest with that adapter's
   skills, tagged with its runtime
3. Two adapters (envoy-harness + OpenClaw) →
   manifest with the union of skills, each tagged
   with its runtime
4. SkillId collision → throws
   `SkillIdCollisionError`
5. `runtimeVersion` is `"unknown"` for v0
6. `tags` + `costCeilingUsd` are preserved
7. `maxSensitivity` is preserved
8. Order of skills is preserved (insertion order)

**E2E test:**
`apps/node/test/agent-adapter-manifest-aggregate.e2e.test.ts`

Construct a real `NodeServiceImpl` with both
adapters; call `getNodeManifest()`; verify the
9 skills are present (5 envoy-harness + 4
OpenClaw), each tagged with the right runtime.

### 3.5 What Step 4 does NOT cover

- **Per-skill fan-out (whole-job routing v0).** A
  job with `requiredSkill: ["code-review",
  "peer-list"]` routes to one runtime, not
  multiple. Future chunk.
- **Signal-based opt-in routing (Step 5).** Step 4
  is a passive merge; the orchestrator still uses
  the existing engine picker to choose the
  primary. Step 5 layers signal-based routing on
  top.
- **B-class skills (Step 3).** Step 4 ships with
  the current 5 + 4 = 9 skills. Step 3 adds 3
  B-class skills to the merged manifest (6 entries
  — one per runtime, since both runtimes can invoke
  them).
- **Wire format change.** The `CapabilityManifest`
  wire format stays per-runtime. The merged
  manifest is local-only.
- **`runtimeVersion` on the aggregator.** v0
  hard-codes `"unknown"`. Future: read from
  `buildManifest()` (requires async aggregator).
- **Async aggregator.** v0 is sync (just calls
  `describeSkills()`). Future: an async variant
  that calls `buildManifest()` for runtime
  version + reputation.

## 4. Sub-chunks

### 4.1 Commit 1: aggregator + types + unit tests

| File | Action | Notes |
|---|---|---|
| `apps/node/src/agent-adapter-manifest-aggregate.ts` | New: types + `aggregateNodeManifest()` + `SkillIdCollisionError` | Pure function; no Node deps |
| `apps/node/test/agent-adapter-manifest-aggregate.test.ts` | New: 8 unit tests (see §3.4) | Hermetic; no Node bootstrap |

**Why this is a standalone commit:** the
aggregator is a pure function with no side
effects. It's the easiest piece to review and
the foundation for everything else.

**Test count:** 8 unit tests (covers empty,
single, both, collision, runtimeVersion,
tags/costCeiling/maxSensitivity preservation,
order).

### 4.2 Commit 2: `getNodeManifest()` on `NodeServiceImpl`

| File | Action | Notes |
|---|---|---|
| `apps/node/src/node-service-impl.ts` | Add `getNodeManifest()` method + `_getNodeManifestStubs()` private helper + `setManifestStubsForTests()` test setter | Wires the aggregator into the host |
| `apps/node/src/agent-adapter-manifest-aggregate.ts` | Re-export `NodeManifest` (no other change) | For external use |
| `apps/node/src/agent-runtime-envoy/index.ts` | Re-export `getNodeManifest` + types | Surface for the orchestrator |

**Why this is a standalone commit:** the host
wiring is one new method + one private helper.
Small, focused diff.

**Why `setManifestStubsForTests`:** the e2e test
needs to inject custom adapters (mock adapters
that return a fixed skill list). The setter is
the test seam; production code never calls it.

### 4.3 Commit 3: e2e test (orchestrator sees merged manifest)

| File | Action | Notes |
|---|---|---|
| `apps/node/test/agent-adapter-manifest-aggregate.e2e.test.ts` | New: e2e test (construct NodeServiceImpl, call getNodeManifest, verify 9 skills) | The acceptance test |

**Why this is a standalone commit:** the e2e
test is the cross-check that the host wiring
works end-to-end. Separate from the unit tests
because it needs a real `NodeServiceImpl` (not
just the pure function).

**Test count:** 1 e2e test (verifies the 9
skills from both adapters, each tagged with the
right runtime).

### 4.4 Commit 4: doc update

| File | Action | Notes |
|---|---|---|
| `docs/agent-network-engine.md` | Update §2: add a "merged manifest" section documenting `getNodeManifest()` + the per-adapter broadcast flow | Operator-facing doc |
| `docs/agent-harness-integration.md` | Update §5 (Step 4) to mark as done | Status update |
| `docs/agent-harness-integration-EnvoyMesh.md` | Add changelog entry for Step 4 | Implementation guide changelog |

**Why a separate commit for the doc:** the doc
is the operator-facing surface; the user reviews
docs separately from code. Land code first
(commits 1-3), then doc (commit 4). If the user
wants to skip the doc commit, they can squash
it into commit 3.

## 5. Test coverage matrix

| Test case | Type | File |
|---|---|---|
| Empty input (no adapters) → empty manifest | Unit | §3.4 #1 |
| Single adapter → manifest with that adapter's skills | Unit | §3.4 #2 |
| Two adapters → union of skills, each tagged | Unit | §3.4 #3 |
| SkillId collision → throws `SkillIdCollisionError` | Unit | §3.4 #4 |
| `runtimeVersion: "unknown"` for v0 | Unit | §3.4 #5 |
| `tags` + `costCeilingUsd` preserved | Unit | §3.4 #6 |
| `maxSensitivity` preserved | Unit | §3.4 #7 |
| Order of skills is preserved (insertion order) | Unit | §3.4 #8 |
| E2E: 9 skills from both adapters, each tagged | E2E | §3.4 |

**Total: 8 unit + 1 e2e = 9 new tests.**

## 6. Open questions

1. **Aggregator location: `apps/node/src/` or
   `packages/agent-adapter/src/`?**
   - **My recommendation: `apps/node/src/`.** The
     aggregator is host-side (the host aggregates
     its own adapters). The bridge
     (`@envoymesh/agent-adapter`) is a pure
     registry of `AgentAdapter`; the aggregator
     is a higher-level concern.
   - **Alternative: `packages/agent-adapter/src/`.**
     A `nodeManifestAggregate()` function in the
     bridge could be reused by other consumers
     (Tauri UI, test harnesses).
   - **Default: `apps/node/src/`.** Override if
     you want the bridge to own the aggregator.

2. **Aggregator name: `agent-adapter-manifest-aggregate`
   or `runtime-manifest-aggregate`?**
   - **My recommendation: `agent-adapter-manifest-aggregate`.**
     Matches the parallel with
     `agent-adapter-broadcast.ts` and
     `agent-adapter-manifest-inbound.ts`.
   - **Default: `agent-adapter-manifest-aggregate`.**
     Override if you prefer a shorter name.

3. **Stubs vs real adapters for `getNodeManifest()`:**
   - **My recommendation: stubs.** The merged
     manifest is for the **capability view**;
     `describeSkills()` is the only thing we
     need. Stubs avoid the runtime state
     (`apiKey`, `peerId`, etc.) of the real
     adapters.
   - **Alternative: real adapters.** Pass the
     real `OpenClawAdapter` + `EnvoyHarnessAdapter`
     instances. Pros: no stub divergence. Cons:
     the merged manifest query now has the
     runtime side effects (e.g. `askOpenClaw`
     would throw if called).
   - **Default: stubs.** Override if you
     prefer real adapters.

4. **Test seam: `setManifestStubsForTests`
   setter or DI?**
   - **My recommendation: setter.** Mirrors the
     pattern in `setEnvoyHarnessHostModel` /
     `setEnvoyHarnessHostApiKey` from the b3
     work. Simpler than a full DI refactor.
   - **Default: setter.** Override if you want
     a DI seam.

5. **Should `getNodeManifest()` be sync or async?**
   - **My recommendation: sync.** v0 only calls
     `describeSkills()` (sync). The stubs don't
     do any I/O. The orchestrator reads the
     manifest on every routing decision; sync is
     simpler.
   - **Alternative: async.** Future: when
     `runtimeVersion` is read from
     `buildManifest()` (async), the aggregator
     becomes async. v0 doesn't need this.
   - **Default: sync.** Override if you want
     async from the start.

## 7. References

- Design doc: `docs/agent-harness-integration.md`
  §5 (Step 4), Q5 (Team job routing).
- High-level plan: `docs/agent-harness-integration-step3-4.md`
  §3 (Step 4 overview).
- Implementation guide: `docs/envoy-harness-integration-EnvoyMesh.md`.
- b2/b3 follow-up: `docs/agent-harness-integration-b2-b3.md`.
- Agent adapter interface:
  `packages/agent-adapter/src/agent-adapter.ts:116`.
- Adapter registry:
  `packages/agent-adapter/src/runtime-registry.ts:62`.
- OpenClaw adapter:
  `packages/agent-adapter/src/openclaw-adapter.ts:98`.
- Envoy-harness adapter:
  `envoy-harness/packages/envoy-harness-adapter/src/adapter.ts`.
- Wire `CapabilityManifest`:
  `packages/protocol/src/agent-adapter.ts:121`.
- Existing broadcaster:
  `apps/node/src/agent-adapter-broadcast.ts`.
- Existing profile-skill aggregator (don't
  confuse): `apps/node/src/agent-network-skills-aggregate.ts`.

## 8. Change log

- **2026-08-20 (initial draft):** Step 4 sub-plan
  written. 4 commits: aggregator + types + unit
  tests (1), host wiring (2), e2e test (3), doc
  update (4). 9 new tests. Open questions §6
  documented.
- **2026-08-20 (Step 4 build — DONE):** all 4 commits
  shipped on `envoy_harness_integration` branch:
  - `5ac5f627 step 4-1` — aggregator + types + 9 unit
    tests (`aggregateNodeManifest` + `NodeManifest` +
    `MergedSkillEntry` + `SkillIdCollisionError`).
  - `0947bd55 Update node-service-impl.ts` — host
    wiring (`getNodeManifest()` +
    `setManifestStubsForTests` + stateless stub
    adapters).
  - `59f2abc0 Create agent-adapter-manifest-aggregate-host.test.ts` —
    5 host wiring tests (default 9 skills, mesh-less
    peerId, test seam injection, test seam reset,
    skillId collision). **Filename changed from
    `*.e2e.test.ts` to `*-host.test.ts`** to avoid
    the vitest default-exclude on `*e2e*.test.ts` (no
    real mesh / network needed; the test is
    hermetic).
  - Doc update (this commit) — operator-facing
    `agent-network-engine.md` §2.1, design doc
    `agent-harness-integration.md` §5 + §9, impl
    guide `envoy-harness-integration-EnvoyMesh.md`
    changelog.

  **Test count: 14 new tests (9 unit + 5 host), all
  pass. Type-check clean. 80/80 cumulative Phase 8 +
  Step 4 + manifest tests pass.**

  **Plan deviations from sub-plan §6:**
  - **File location** (`apps-node`) ✅ as recommended.
  - **Stubs vs real adapters** (`stubs`) ✅ as
    recommended.
  - **Sync vs async** (`sync`) ✅ as recommended.
  - **Commit count** (`4-commits`) ✅ as recommended.
  - **Test file naming**: `*-host.test.ts` (not
    `*.e2e.test.ts`) — functional difference is
    none, but the vitest config treats `*e2e*.test.ts`
    as heavy (requires `RUN_E2E=1`). The host test
    is hermetic (no mesh, no network), so the
    lighter naming fits better.
