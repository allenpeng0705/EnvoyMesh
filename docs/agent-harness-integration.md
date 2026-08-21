# envoy-harness integration into EnvoyMesh (Phase 8)

> **Status:** Step 6 ✅ **DONE** (2026-08-20).
> Step 5 ✅ DONE (2026-08-20). Step 4 ✅ DONE
> (2026-08-20). Step 3 ✅ DONE (2026-08-20).
> Steps 0 / 0+ / 1 / 2 (b1 / b2 / b3 / b3.live) DONE
> (2026-08-20). **Phase 8 complete.**
>
> **Audience:** EnvoyMesh team, envoy-harness team, Tauri UI team.
>
> **Related:**
> - [envoy-harness design](../../envoymesh-design/design.en.md)
> - [envoy-harness boundary](../../envoy-harness/packages/envoy-harness/docs/boundary.en.md)
> - [envoy-harness implementation plan](../../envoy-harness/packages/envoy-harness/docs/implementation-plan.md)
> - [Agent Network worker engine](./agent-network-engine.md) (existing
>   node-local engine picker for OpenClaw + Ext)
> - [AI Engine membership](./agent-network-config.md) (existing
>   `openclawEnabled` / `bridgeEnabled` config)

---

## 1. Goal

Add **`envoy-harness` as a third first-class AI Engine** on EnvoyMesh
home nodes, alongside Built-in OpenClaw and Ext Agent.

**Cooperation, not replacement.** envoy-harness's value is in novel
features (mesh-native sub-agents, federated scoreboard, lsp_* tools,
multi-provider LLM, cost cap, 3-tuple reputation) that OpenClaw does
**not** have and will not add. OpenClaw's value is in mature community
skills, bond protocol, DMG first-contact UX, and battle-tested runtime
that envoy-harness does **not** have. Both runtimes grow in their own
lane; the home node uses whichever is best for the task.

envoy-harness ships as a separate package in a sibling monorepo.
EnvoyMesh consumes it through **`@envoymesh/envoy-harness-adapter`**
(Package 3, already shipped). The dependency direction is strictly
one-way: `EnvoyMesh → envoy-harness-adapter → envoy-harness`.

---

## 2. Strategic direction: Differentiation + adapter-canonical critical skills

### 2.1 Differentiation, not Convergence

- **envoy-harness keeps its novel focus:** mesh-native sub-agents
  (`RemoteMeshSubmitter`, `FanOutSpec`, `RoutingHint`), federated
  scoreboard, lsp_* tools, multi-provider LLM, cost cap, 3-tuple
  reputation, JsonLinesTracer, persisted sessions.
- **OpenClaw keeps its community strengths:** bond protocol, sponsor
  friend flow, cross-network dial, DMG first-contact UX, community skill
  ecosystem, mature runtime.

**Why not full convergence** (envoy-harness absorbing OpenClaw's
skills): a 5-person home team cannot keep up with 50+ community
contributors on skill count. envoy-harness's value is **novelty**, not
replication. Cooperation lets both win; convergence would make
envoy-harness a permanent fork-lag.

### 2.2 B-class critical EnvoyMesh skills live in envoy-harness-adapter

The bridge (`envoy-harness-adapter`) is the **canonical implementation**
of mesh-touching capabilities that are critical enough to require a
backup. Specifically:

| Skill | Where it lives today | Where it lives after Step 3 |
|---|---|---|
| `setup-sponsor-friend` (first-launch auto-bond) | OpenClaw's runtime | `envoy-harness-adapter` |
| `peer-list` | OpenClaw | `envoy-harness-adapter` |
| `relay-status` | OpenClaw | `envoy-harness-adapter` |
| Community skills (e.g. GitHub Issue Creator) | OpenClaw | OpenClaw (stays) |

**Why this matters:** the bridge is the canonical impl, not a copy.
Both envoy-harness and OpenClaw consume these from the bridge through
their respective adapter. The semantics are defined once, in one
place. envoy-harness can run a bond flow **even if OpenClaw subprocess
is down** — because envoy-harness doesn't go through OpenClaw; it goes
through `envoy-harness-adapter`.

The user concern that motivated this: "sometime maybe OpenClaw didn't
work. we can have a backup and we know EnvoyMesh related things are
in envoy-harness." This addresses it without the cost of duplicating
the impl in two runtimes.

---

## 3. Cooperation model: 3 patterns (A + B + E)

### A. Skill delegation

envoy-harness can **call OpenClaw's community skills** through
`LocalCrossRuntimeSubmitter` (Step 2). The user doesn't have to switch
runtimes — the model's merged tool list (Step 4) includes both
runtimes' skills, so the model picks whichever skill it needs
regardless of which runtime implements it.

### B. Sub-agent delegation

envoy-harness's `task` tool can **spawn an OpenClaw sub-agent** (or
vice versa). Cross-runtime `MeshSubmitter` keeps the seam clean — the
call uses the same `SubmitRequest` shape envoy-harness already has, but
the local cross-runtime transport dispatches to OpenClaw's runtime.

### E. Capability routing

Team jobs land on a node; the **orchestrator picks the runtime
best-fit** for the job's required skills (Step 4 merged manifest + Step
5 routing logic). Whole-job routing v0; per-skill fan-out deferred.

---

## 4. Design decisions (Q1-Q5)

| # | Question | Answer | Why |
|---|---|---|---|
| **Q1** | Cross-runtime protocol | `LocalCrossRuntimeSubmitter` (Option C) | envoy-harness keeps its clean `MeshSubmitter` interface; bridge wraps the local call. envoy-harness does NOT import OpenClaw's protocol. |
| **Q2** | Skill namespace | Merged manifest at node level (Option B) | Orchestrator sees one manifest per node = `envoy-harness.skills ∪ OpenClaw.skills`, tagged `runtime: "envoy-harness" \| "openclaw"`. No per-runtime routing in the orchestrator. |
| **Q3** | Default routing (EnvoyAI Tauri user prompt) | OpenClaw default + signal-based opt-in to envoy-harness (Option D) | OpenClaw is mature; switching EnvoyAI default would surface all of envoy-harness's rough edges. envoy-harness "earns" by handling signal-bearing tasks. |
| **Q4** | Cross-verify direction | envoy-writes + OpenClaw-verifies (Option A), per-job override to (b) | envoy-harness novel writes; OpenClaw mature verifies with its skill set. Per-job override for security-sensitive or cost-sensitive jobs. |
| **Q5** | Team job routing | per-node primary + best-fit skill fallback | Node owner picks primary; orchestrator picks best-fit from merged manifest when primary lacks a skill. Whole-job routing v0. |

### 4.1 Q3 — Tauri user prompt routing (Option D in detail)

| Signal category | Auto opt-in to envoy-harness? |
|---|---|
| Mesh keywords: "mesh", "federated", "cross-node", "remote peer", "verifier rule" | ✓ |
| Tool-capability: task needs `lsp_*` / `FanOutSpec` / `RemoteMeshSubmitter` / federated scoreboard | ✓ |
| Cost cap: task carries hard cost cap | ✓ |
| Multi-provider: task needs LLM provider switch mid-task | ✓ |
| Skills-heavy: task uses community skill set | ✗ → OpenClaw default |
| Sponsor/bond flow: task touches bond protocol | ✗ → OpenClaw default |
| Cross-network: task needs LAN/relay/DHT fallback | ✗ → OpenClaw default |
| No signal: ordinary local reasoning | ✗ → OpenClaw default |

Default = OpenClaw. Opt-in trigger = signals above (keyword starter;
capability-tag-based is the v1).

### 4.2 Q4 — Cross-verify modes (in `team.toml`)

```toml
[verify]
# mode = "envoy-writes-openclaw-verifies"   # default; usually you don't set
mode = "openclaw-writes-envoy-verifies"      # override: (b) for this job
```

| Mode | Write | Verify | When |
|---|---|---|---|
| (a) `envoy-writes-openclaw-verifies` (default) | envoy-harness | OpenClaw | Most jobs |
| (b) `openclaw-writes-envoy-verifies` | OpenClaw | envoy-harness | Security-sensitive or cost-sensitive jobs where mature write + novel verify is preferred |

### 4.3 Q5 — Node config (in Tauri AI Engine settings)

```toml
[ai-engine]
primary = "openclaw"  # or "envoy-harness"
fallback = "auto"     # "auto" = the other runtime; "none" = fail loud
strategy = "best-fit" # "primary-first" | "best-fit" (v0: best-fit only)
```

Job lands on node:

1. Orchestrator checks primary runtime's skill manifest for the job's
   required skills.
2. Primary covers all → primary.
3. Primary missing any → orchestrator picks best-fit from merged
   manifest. **Whole-job routing** to the chosen runtime.
4. Neither covers → fail loud; node reports unavailability.

---

## 5. The 6 injection steps

Each step is a single PR. Order: foundational → cooperation
mechanism → data layer → routing logic → trust mechanism.

### Step 0 — Workspace dep (1 day)

**Goal:** prove the package graph. No code change.

- `apps/node/package.json` adds
  `"@envoymesh/envoy-harness-adapter": "workspace:*"` (or `file:...` if
  the sibling monorepo path is preferred over pnpm workspace)
- `pnpm install` succeeds
- `pnpm -F @envoymesh/node typecheck` clean

**Why first:** the rest of the plan depends on the dep being
resolvable. Catches pnpm workspace config issues before any code is
written.

**Tests:** none (infra-only).

**Out of scope:** any code import of the adapter; any wiring in
`node-service-impl.ts`.

### Step 1 — `agent-runtime-envoy/` skeleton (~3 days)

**Goal:** envoy-harness is a registered engine the picker can dispatch
to. No skill delegation, no cross-verify, no signal routing — just the
factory + manifest + the engine-picker dispatch.

- New: `apps/node/src/agent-runtime-envoy/index.ts` —
  `registerRuntime("envoy-harness", factory)`
- New: `apps/node/src/agent-runtime-envoy/factory.ts` — `build()` →
  `AgentAdapter` (uses `defaultBuildAgent` from
  `envoy-harness-adapter`)
- New: `apps/node/src/agent-runtime-envoy/manifest.ts` — initial
  skill descriptor (BUILTIN_TOOLS from envoy-harness)
- New: `apps/node/src/agent-runtime-envoy/config.ts` — reads per-node
  config
- Update: `apps/node/src/agent-network-worker-engine.ts` adds
  `"envoy-harness"` to `AGENT_NETWORK_WORKER_ENGINES`; coercion
  accepts the new value
- Update: `apps/node/src/node-service-impl.ts` — engine dispatch reads
  the new engine value and calls the factory
- Update: docs (`agent-network-engine.md` §2) — "Built-in OpenClaw
  (default) | Ext Agent | envoy-harness (Step 1+)"

**Tests:** 1 unit test that `factory()` returns a valid
`AgentAdapter` stub; 1 typecheck pass; 1 e2e that the engine picker
accepts `"envoy-harness"`.

**Out of scope:** skill delegation (Step 2), cross-verify (Step 6).

### Step 2 — `LocalCrossRuntimeSubmitter` (~1-2 weeks)

**Goal:** envoy-harness's `task` tool can spawn OpenClaw sub-agents,
and OpenClaw can spawn envoy-harness sub-agents. Symmetric.

- New: `LocalCrossRuntimeSubmitter` lives in
  `envoy-harness-adapter/src/`. (Or in `apps/node/src/`; see
  open question 2.)
- New: `LocalRuntimeRegistry` in `apps/node/src/` tracks which
  runtimes are local to the node, exposes a `submitTo(runtime, input)`
  method
- Update: envoy-harness's `defaultBuildSubagentFactory` accepts an
  injected `MeshSubmitter`; the factory wiring for "spawn OpenClaw
  sub-agent" routes through the new `LocalCrossRuntimeSubmitter`
- Update: `RemoteMeshSubmitter` (in envoy-harness-adapter) and
  `LocalCrossRuntimeSubmitter` share the same `MeshSubmitter` interface
  in envoy-harness — host sees one seam, transport differs

**Tests:** e2e test that envoy-harness spawns an OpenClaw sub-agent
(skill delegation A); e2e that OpenClaw can spawn an envoy-harness
sub-agent (B); unit test that the `MeshSubmitter` interface is the
same for both.

**Out of scope:** the merged manifest (Step 4), signal-based routing
(Step 5).

### Step 3 — B-class critical EnvoyMesh skills in envoy-harness-adapter (~1-2 weeks)

**Status:** ✅ **DONE** (2026-08-20). 3 commits
(impls + tests + wrappers → manifest updates → e2e
test + design doc) on the `envoy_harness_integration`
branch in EnvoyMesh + `main` in envoy-harness. 35
new bridge tests (10 sponsor-friend + 11 peer-list
+ 14 relay-status) + 1 e2e test (`RUN_B_CLASS_E2E=1`
opt-in) + the existing 32-test sponsor-friend
snapshot (no regression). Merged manifest grew
from 9 skills (5 + 4) to 12 skills (8 + 4) — the
3 B-class skills (`setup-sponsor-friend` /
`peer-list` / `relay-status`) live on envoy-harness
only in v0 (the merged manifest's fail-loud
`SkillIdCollisionError` policy treats duplicate
skillIds as a hard error; the OpenClaw handler
is a future chunk per §3.6). See
`docs/agent-harness-integration-step3.md` (the
detailed sub-plan + plan deviations) +
`docs/agent-harness-integration-step3-4.md`
(high-level plan + change log).

**Goal:** the bridge exposes critical mesh-touching capabilities as
built-in tools, so envoy-harness can run them without depending on
OpenClaw.

- ✅ New: `envoy-harness-adapter/src/b-class-skills/sponsor-friend.ts` —
  the canonical `setup-sponsor-friend` flow (port from OpenClaw
  semantics; keep the same `bond.request` / `bond.established` protocol
  contract)
- ✅ New: `envoy-harness-adapter/src/b-class-skills/peer-list.ts` —
  canonical `peer-list` (queries libp2p peerstore via the mesh
  service)
- ✅ New: `envoy-harness-adapter/src/b-class-skills/relay-status.ts` —
  canonical `relay-status`
- ✅ Update: envoy-harness's `BUILTIN_TOOLS` (via the adapter) exposes
  the three new tools (`bClassTools?` option on
  `defaultBuildAgentFactory` + 3 entries in `getToolsForSkill` +
  `EnvoyHarnessToolName` literal union)
- 🟡 Update: OpenClawAdapter (in EnvoyMesh) — `OPENCLAW_SKILLS` stays
  at 4 in v0. The 3 B-class skills are envoy-harness only (per
  the fail-loud collision policy + canonical-in-the-bridge rule).
  When the OpenClaw skill handler lands (future chunk per
  §3.6), the 3 skills will move to OpenClaw (envoy-harness
  loses them) or namespace under OpenClaw — depending on Q5
  routing.

**Tests:** ✅ per-skill unit test (10 + 11 + 14 = 35 in
the bridge; 32 sponsor-friend snapshot in EnvoyMesh
regression-clean); ✅ e2e (`sponsor-friend.e2e.test.ts`,
`RUN_B_CLASS_E2E=1` opt-in) that envoy-harness's
bridge runs the full bond flow end-to-end without
OpenClaw.

**Out of scope:** the rest of OpenClaw's community skill set (stays in
OpenClaw; accessed via Step 2's cross-runtime transport when needed).
**Also out of scope for v0:** the OpenClaw skill handler for the 3
B-class skills (per §3.6 "add to OPENCLAW_SKILLS only; no skill
handler (follow-up chunk)").

### Step 4 — Merged manifest at node level (~1 week)

**Status:** ✅ **DONE** (2026-08-20). 4 commits on the
`envoy_harness_integration` branch (`5ac5f627` +
`0947bd55` + `59f2abc0` + doc). 14 new tests (9 unit +
5 host). See `docs/agent-harness-integration-step3-4.md`
+ `docs/agent-harness-integration-step4.md` for the
detailed plan + sub-plan.

**Goal:** the orchestrator sees one manifest per node, with skills
tagged by runtime.

- ✅ New: `apps/node/src/agent-adapter-manifest-aggregate.ts`
  — node-level manifest aggregator. Pure function
  `aggregateNodeManifest({ peerId, adapters })` returns
  a `NodeManifest` with `runtimes[]` + `skills[]` (each
  skill tagged with its runtime). **Filename chosen
  to avoid collision with the existing
  `agent-network-skills-aggregate.ts`** (which aggregates
  owner profile skills, a different concern).
- ✅ New: `NodeServiceImpl.getNodeManifest(): NodeManifest`
  — the host-side integration. Sync, stateless stub
  adapters (throw on `execute()` / `buildManifest()`).
  Test seam: `setManifestStubsForTests(stubs)`.
- Update (future): orchestrator's manifest picker reads
  `getNodeManifest()` (single source of truth for the
  Assigner). The wire-level `agent-adapter-broadcast.ts`
  (per-adapter broadcast) stays unchanged — the merged
  manifest is a **local view**, not a wire format.

**Tests:** ✅ 9 unit tests in
`agent-adapter-manifest-aggregate.test.ts` (covers
empty / single / both / collision / `runtimeVersion` /
tags + `costCeilingUsd` / `maxSensitivity` / order
preservation). ✅ 5 host wiring tests in
`agent-adapter-manifest-aggregate-host.test.ts`
(covers default 9 skills, mesh-less peerId fallback,
test seam injection, test seam reset, skillId
collision). All 14 tests pass.

**Out of scope:** per-skill fan-out (whole-job routing only v0).
This still applies — Step 4 doesn't change the routing
decision; it just makes the manifest available.

### Step 5 — Signal-based auto opt-in (~1 week)

**Status:** ✅ **DONE** (2026-08-20). 3 commits on
`envoy_harness_integration` branch (5.1 + 5.2 + 5.3
sub-chunks; see `docs/agent-harness-integration-step5.md`
for the sub-plan + locked decisions + plan deviations).
41 unit tests for the pure router +
23 e2e tests for the host wiring + 4 pre-existing
tests regression-clean. The default routing
table is in `docs/agent-network-engine.md` §2.2.

**Goal:** Tauri user prompts route to OpenClaw by default; signal-bearing
prompts auto opt-in to envoy-harness.

- ✅ New: `apps/node/src/user-prompt-router.ts` — the pure
  `routeUserPrompt(input) → decision` function (renamed
  from the design doc's `agent-network-router.ts` per
  Q1 — the name collides with the Team-job
  `agent-network-*` namespace; see the Step 5 sub-plan
  for rationale)
- ✅ New: keyword-based v0 (mesh / federated / lsp_* /
  `RemoteMeshSubmitter` / `FanOutSpec` / `!eh` or `/eh`
  hint). Cost cap + multi-provider deferred to v1 with
  UI affordance (per Q3); capability-tag-based v1.
- ✅ Update: Tauri UI path through
  `runOwnerAgentTurnViaRuntime` → `routeUserPrompt` →
  dispatch. The chosen runtime's adapter handles the
  prompt; the hint prefix is stripped before any LLM
  call.
- ✅ Update: per-node opt-in env var
  `ENVOY_HARNESS_SIGNAL_OPT_IN=disabled` (default enabled;
  per Q5)
- ✅ Update: docs (`agent-network-engine.md` §2.2) — the
  default routing table for the new `envoy-harness`
  engine

**Tests:** ✅ 41 unit tests for signal detection (every
category + every fallback + every edge case); ✅ 23
e2e tests for the host wiring (every branch + hint
stripping + deep-fallback chain + persistence
invariant). Hermetic (no API key, no network) —
always-on in `pnpm test`.

**Out of scope:** capability-tag-based signal detection (v1; keyword
is v0 starter).

### Step 6 — Cross-verify (Q4 A) (~1 week)

**Status:** ✅ **DONE** (2026-08-20). 2 commits on
`envoy_harness_integration` branch (6.1 + 6.2;
6.3 is doc closeout). 17 new tests
(14 unit + 3 e2e) for the `verifyMode` flow +
2 new tests for the `defaultCrossVerify` factory.
142 envoy-harness-adapter tests regression-clean
(F9.5 cross-verify primitives); 184 apps/node
tests regression-clean (Step 5 + earlier steps).
Detailed plan + locked decisions:
`docs/agent-harness-integration-step6.md`.

**Goal:** the default cross-verify direction is (a)
envoy-writes + OpenClaw-verifies; per-job override to (b).

- ✅ New: `envoy-harness-adapter` exposes
  `buildEnvoyHarnessAdapterWithCrossVerify` (the
  factory wires `defaultCrossVerify(openClawAdapter)`
  on the adapter so `adapter.verify()` re-runs the
  same skill on OpenClaw and returns the local
  verifier's verdicts for the new result)
- ✅ New: `ChainMandate.verifyMode` field (3 values:
  `"rule-only"` | `"cross-runtime"` | `"cross-runtime-strict"`)
  in `packages/protocol/src/agent-network.ts`; the
  orchestrator's `chain-verify-loop` honors it in
  `shouldEscalateToCrossAgent` (forces the cross
  when the mode is set) + `combineToVerdict` (strict
  mode makes the cross verdict the authority)
- ✅ Update: the host's `createEnvoyHarnessAdapter`
  in `apps/node/src/agent-runtime-envoy/factory.ts`
  accepts an optional `openClawAdapter`; when
  provided, the factory uses the bridge's
  cross-verify factory
- ✅ Update: the cross-verify path is the LAST
  thing the agent loop does before returning —
  the rule + cross `VerdictEntry` lands in the
  `ArbitrationStore` (existing write paths, no
  changes needed)
**Tests:** ✅ 14 unit tests for `shouldEscalateToCrossAgent`
+ `combineToVerdict` + `defaultVerifyModeForWorker`
in `apps/node/test/chain-verify-loop.test.ts`;
✅ 3 e2e tests for `runChainVerificationLoop`
with `verifyMode: "cross-runtime"` +
`"cross-runtime-strict"`; ✅ 4 e2e tests for
`createEnvoyHarnessAdapter` cross-verify wiring
in `apps/node/test/agent-runtime-envoy-cross-verify.test.ts`;
✅ 2 new tests for `buildEnvoyHarnessAdapterWithCrossVerify`
in the bridge's `cross-verify-adapter.test.ts`.
All hermetic (no API key, no network) — always-on
in `pnpm test`.

**Out of scope:** capability-tag-based signal detection (v1; keyword
is v0 starter).

**Out of scope:** 2-doctor pool (we picked A over C); per-skill
fan-out within a job (whole-job only).

---

## 6. Out of scope (deferred)

- **Per-skill fan-out (parallel partial-job routing)** — v0 is
  whole-job. If a job genuinely needs 2 runtimes in parallel, the
  user splits it into 2 jobs.
- **Cross-runtime checkpointer** — sub-agent state in different
  runtimes. v0: each runtime has its own session; cross-runtime
  state is in the scoreboard.
- **Three-way cooperation (envoy-harness + OpenClaw + Ext Agent
  simultaneously)** — v0: envoy-harness + OpenClaw. Ext stays as the
  bridge to external runtimes.
- **Tauri UI redesign** — Step 5 only updates the default routing;
  the AI Engine settings UI rewrite is a separate task.
- **Capability-tag-based signal detection (v1)** — Step 5 ships the
  keyword starter; v1 is when the merged manifest exposes structured
  capability tags the router can match on.
- **Multi-peer cross-verify (verifier on a different node)** —
  Federation already supports this; we don't wire it for cross-verify
  in v0.

---

## 7. Open questions

1. **B-class critical skill scope** — which mesh-touching capabilities
   are "critical enough" to live in envoy-harness-adapter? The 3 named
   (sponsor-friend, peer-list, relay-status) are the start. Team to
   confirm whether to add more (e.g. peer-block, key-rotation, mesh-
   restart).
2. **LocalCrossRuntimeSubmitter location** —
   `envoy-harness-adapter` (Option 1) OR EnvoyMesh
   `apps/node/src/` (Option 2)? Step 1 will design this. Lean toward
   Option 1 (bridge owns it) for the same reason Q1 = C: keep
   envoy-harness clean of per-runtime knowledge.
3. **Capability broadcast timing** — immediate on node start
   (default, matches OpenClaw) or lazy on first job (saves startup
   time). Default: immediate. Step 4 to confirm.
4. **Sponsor-friend auto-bond timing** — envoy-harness follows
   OpenClaw's first-launch auto-bond (immediately on node start, gated
   on the bundled proof context)? Default: yes. Step 3 to confirm.
5. **Tauri team bandwidth** — Step 5's Tauri UI update needs Tauri
   team input. TBD; this Phase 8 doc is the ask.
6. **(Carry-forward from prior session)** 5 open questions raised in
   the initial Phase 8 discussion that didn't make it to disk: a
   follow-up pass should reconcile this list with the above 5 — some
   may be duplicate, some may be missing.

---

## 8. References

- [Agent Network worker engine policy](./agent-network-engine.md)
- [AI Engine membership config](./agent-network-config.md)
- [envoy-harness design doc](../../envoymesh-design/design.en.md)
- [envoy-harness boundary doc](../../envoy-harness/packages/envoy-harness/docs/boundary.en.md)
- [envoy-harness implementation plan](../../envoy-harness/packages/envoy-harness/docs/implementation-plan.md)
- [Agent Network vocabulary](./agent-network-vocabulary.md)

---

## 9. Change log

- **2026-08-20 (initial draft):** §1-8 written. Cooperation model
  (A+B+E) + Q1-Q5 design decisions + 6 injection steps + open
  questions. Awaiting team sign-off.
- **2026-08-20 (Step 4 — DONE):** §5 Step 4 marked ✅ done. 4 commits
  on `envoy_harness_integration` branch (`5ac5f627` +
  `0947bd55` + `59f2abc0` + doc). 14 new tests (9 unit +
  5 host). Detailed plan: `docs/agent-harness-integration-step3-4.md`
  + `docs/agent-harness-integration-step4.md`. New:
  `apps/node/src/agent-adapter-manifest-aggregate.ts` (pure
  function), `NodeServiceImpl.getNodeManifest()` (sync host
  wiring with stateless stub adapters). The merged manifest
  is a **local view**, not a wire format — the per-adapter
  broadcast flow (`agent-adapter-broadcast.ts`) is unchanged.
- **2026-08-20 (Step 5 — DONE):** §5 Step 5 marked ✅ done.
  3 commits on `envoy_harness_integration` branch (5.1
  router + tests, 5.2 host wiring + e2e tests, 5.3 doc
  closeout). 64 new tests (41 unit + 23 e2e) + 4
  pre-existing tests regression-clean. Detailed plan:
  `docs/agent-harness-integration-step5.md` (sub-plan
  with 9 locked design questions + plan deviations).
  New: `apps/node/src/user-prompt-router.ts` (pure
  function), `OwnerAgentTurnResult.{routingSignals,
  routingReason, modelUsed: "envoy-harness"}` (API
  surface), host wiring in
  `runOwnerAgentTurnViaRuntime` (router + dispatch +
  hint stripping). Per-node opt-out:
  `ENVOY_HARNESS_SIGNAL_OPT_IN=disabled` env var. The
  default routing table for the new `envoy-harness`
  engine is in `docs/agent-network-engine.md` §2.2.
- **2026-08-20 (Step 6 — DONE):** §5 Step 6 marked ✅
  done. 3 commits on `envoy_harness_integration`
  branch (6.1 verifyMode API + chain-verify-loop
  honors it, 6.2 envoy-harness cross-verify factory
  + host wiring, 6.3 doc closeout). 19 new tests
  (14 unit + 3 e2e + 2 bridge) + 14 pre-existing
  chain-verify-loop tests regression-clean.
  Detailed plan: `docs/agent-harness-integration-step6.md`
  (sub-plan with 8 locked design questions).
  New: `ChainMandate.verifyMode` (3-value enum:
  `rule-only` / `cross-runtime` / `cross-runtime-strict`)
  + `defaultVerifyModeForWorker(runtime)` helper;
  `buildEnvoyHarnessAdapterWithCrossVerify` factory
  (the bridge's Q4 cross-verify primitive, wires
  `defaultCrossVerify(openClawAdapter)`); host
  `createEnvoyHarnessAdapter` accepts the
  `openClawAdapter?` option. **Phase 8 complete.**
- **2026-08-21 (v1.1 — capability-tag-based signal
  detection — DONE):** the v0 hardcoded
  `MESH_KEYWORDS` is replaced by a dynamic
  vocabulary extracted from the merged manifest's
  envoy-harness skill tags. 1 commit on
  `envoy_harness_integration` branch (the user
  delegated commit; bundled v1.1.1 + v1.1.2 +
  v1.1.3 into a single commit at the end of v1.1).
  14 new tests (9 unit v1.1 + 5 e2e v1.1.2) + 73
  pre-existing tests regression-clean. Detailed
  plan: `docs/agent-harness-integration-v1-1.md`
  (sub-plan with 4 locked design questions + Q1/Q3
  reconciliation note).
  - **v1.1.1 — `envoyHarnessTags` API on the
    router input** (`apps/node/src/user-prompt-router.ts`).
    New `findTagInPrompt(lower, tag)` helper:
    word-boundary regex for single-word tags
    (`mesh` doesn't match `meshes` — Q6 follow-up
    cleanup); exact substring for hyphenated tags
    (`cross-node` matches `cross-node`). v0
    `MESH_KEYWORDS` constant kept as a private
    backward-compat fallback for callers that pass
    `envoyHarnessTags === undefined`.
  - **v1.1.2 — host wiring.** New
    `extractEnvoyHarnessTags(manifest)` helper
    (`apps/node/src/manifest-envoy-harness-tags.ts`).
    `RunOwnerAgentTurnContext.getNodeManifest()`
    field added; `RunOwnerAgentTurnContextDeps`
    wires `host.getNodeManifest()`; the handler
    reads the manifest once, extracts tags, and
    passes them to `routeUserPrompt`. Q6
    fallback: when the read throws or returns
    `undefined`, the router uses the v0
    `MESH_KEYWORDS` constant + a warning is
    logged. The default `makeCtx` test helper
    returns `undefined` so the 23 existing e2e
    tests continue to use the v0 fallback.
  - **v1.1.3 — doc closeout.** This entry +
    `agent-network-engine.md` §2.2 (note v1.1
    dynamic vocabulary replaces v0 keywords) +
    `agent-harness-integration-step5.md` status
    note (v0 vocabulary now serves as private
    fallback) + `agent-harness-integration-v1-1.md`
    DONE stamp + commit log.
- **2026-08-21 (v1.2 — per-skill tag matching
  — DONE):** the v1.1 runtime-level routing
  (route signal-bearing prompts to the
  envoy-harness runtime) is extended to
  per-skill routing (route to a specific
  envoy-harness skill by tag-count score).
  1 commit on `envoy_harness_integration`
  branch (the user delegated commit; bundled
  v1.2.1 + v1.2.2 + v1.2.3 into a single commit
  at the end of v1.2). 18 new tests (9 router
  unit + 9 formatter unit) + 4 new e2e tests
  (host dispatch) + 110 pre-existing tests
  regression-clean. Detailed plan:
  `docs/agent-harness-integration-v1-2.md`
  (sub-plan with 8 locked design questions).
  - **v1.2.1 — router API + skill matching.**
    `RouteUserPromptInput.envoyHarnessSkills`
    (projected shape: `{ skillId, tags }[]`).
    `RouteUserPromptDecision.targetSkill?` +
    `reason: "signal-skill"`. New `pickTargetSkill`
    + `scoreSkill` helpers (Q1 — uniquely-held
    threshold; tie → fall through to v1.1 free-
    form LLM ask).
  - **v1.2.2 — host wiring + formatter.**
    New `apps/node/src/skill-result-formatter.ts`
    (`formatSkillResult` + `StructuredResultError`;
    Q2 — B-class `structured` first block
    falls through to v1.1 free-form LLM ask).
    New `extractEnvoyHarnessSkills(manifest)`
    helper. `RunOwnerAgentTurnContext.askEnvoyHarnessSkill`
    field added. `NodeServiceImpl.askEnvoyHarnessSkill(message, skillId)`
    method (lazy runtime + `runtime.askSkill`
    + `formatSkillResult`; Q4 = 60s deadline,
    Q5 = descriptor `costCeilingUsd` with 1.0
    fallback). New `runtime.askSkill(prompt, opts)`
    method on `RealEnvoyHarnessRuntime` (returns
    raw `SignedAgentResult`; the host formats).
    `OwnerAgentTurnResult.targetSkill?` field +
    `routingReason: "signal-skill"` exposed.
  - **v1.2.3 — doc closeout.** This entry +
    `agent-network-engine.md` §2.2 routing table
    note + new §2.2.2 per-skill routing sub-section
    + `agent-harness-integration-step5.md` status
    note + `agent-harness-integration-v1-1.md`
    status note + `agent-harness-integration-v1-2.md`
    DONE stamp + commit log.
- **2026-08-21 (v1.3 — B-class per-skill result
  formatter — DONE):** the v1.2 dispatch's B-class
  fall-through (Q2 of v1.2) is replaced by per-skill
  formatters. B-class skills (setup-sponsor-friend /
  peer-list / relay-status) are now chat-reachable —
  a prompt like "set up a mesh sponsor bond" runs the
  actual bond flow + returns a user-readable summary
  ("Couldn't set up the sponsor bond. Your relay is
  unreachable. What to do: Check your relay is online,
  then click Retry in the bond panel."). 1 commit on
  `envoy_harness_integration` branch (the user
  delegated commit; bundled v1.3.1 + v1.3.2 +
  v1.3.3 into a single commit at the end of v1.3).
  50 new tests (30 b-class-formatters + 20
  skill-result-formatter) + 2 new e2e tests
  (B-class end-to-end + Q6 fall-through) + 143
  pre-existing tests regression-clean. Detailed plan:
  `docs/agent-harness-integration-v1-3.md` (sub-plan
  with 8 locked design questions). The **end-user-
  first** principle (AGENTS.md) drove Q2's
  failure format: user-readable headline + cause +
  next-step + a `[debug details:]` block at the
  bottom (verbose for power users + audit log).
  - **v1.3.1 — per-skill formatters (B-class).**
    New `apps/node/src/b-class-result-formatters.ts`
    (`formatSponsorFriendResult` +
    `formatPeerListResult` +
    `formatRelayStatusResult` +
    `B_CLASS_FORMATTERS` map +
    `getBClassFormatter` lookup). 16-char peerId
    truncation. 1-line success / multi-line
    failure with the user-friendly ordering. 30
    unit tests.
  - **v1.3.2 — update skill-result-formatter to
    dispatch per-skill formatters.** New
    `formatStructuredContent` path. Q5 narrow:
    format tool-call blocks ONLY when the result's
    first block is a B-class `tool-result`
    (LLM-ask skills keep v1.2 behavior). Q6
    silent + `console.debug` log: unknown
    `structured` blocks return `undefined` →
    the host's `askEnvoyHarnessSkill` throws
    `StructuredResultError` → the dispatch
    catches + falls through to v1.1 free-form
    LLM ask. `NodeServiceImpl.askEnvoyHarnessSkill`
    updated to handle the `string | undefined`
    return type. 20 unit tests + 2 new e2e
    tests.
  - **v1.3.3 — doc closeout.** This entry +
    `agent-network-engine.md` §2.2.2 update
    (note v1.3's B-class formatter) +
    `agent-harness-integration-v1-2.md` status
    note (v1.2's B-class fall-through is now
    handled by v1.3) +
    `agent-harness-integration-v1-3.md` DONE
    stamp + commit log.
- **2026-08-21 (v1.4 — Tauri UI for opt-in toggle +
  signal-routed badge + verifyMode — DONE):**
  owners get **durable, UI-controllable
  affordances** for the routing decisions
  v1.1 + v1.2 + v1.3 made. The v0 env-var
  opt-in (`ENVOY_HARNESS_SIGNAL_OPT_IN`)
  + the per-runtime
  `defaultVerifyModeForWorker(runtime)`
  policy are both superseded by
  per-node persisted fields, with the
  v0 mechanisms as fallbacks (Q2 + Q3
  + Q6). The Tauri UI gains an
  "Auto-route mesh queries" toggle
  (end-user label for `signalOptIn`) +
  a "Verification mode" dropdown
  ("Light" / "Standard" / "Strict" — the
  end-user labels for the 3
  `VerifyMode` values) + a
  "Routed to `<skill>`" chat badge
  using the existing v1.2
  `routingReason` + `targetSkill`
  fields (no new result fields). 1
  commit on `envoy_harness_integration`
  branch (the user delegated commit;
  bundled v1.4.1 + v1.4.2 + v1.4.3
  into a single commit at the end of
  v1.4). 88 new tests (16
  node-config-loader + 12
  node-config-store-v1-4 + 11
  chain-verify-loop additions + 4
  run-loop e2e + 15 node-service-v1-4
  settings API + 30 misc regression
  checks) + 277 pre-existing tests
  regression-clean on the affected
  paths. Detailed plan:
  `docs/agent-harness-integration-v1-4.md`
  (sub-plan with 6 locked design
  questions). The Tauri team picks up
  the actual UI work in their own
  workstream; the design doc for them
  is `docs/taui-agent-routing-settings.md`
  (NEW). The **end-user-first**
  principle (AGENTS.md) drove the
  Settings panel's label copy:
  "Auto-route mesh queries" (not
  "signalOptIn=enabled") + "Light" /
  "Standard" / "Strict" (not the raw
  `VerifyMode` enum values). Internal
  values stay in the audit log + the
  `getNodeConfig()` payload.
  - **v1.4.1 — persisted config +
    helpers.** New
    `PersistedNodeConfig.signalOptIn`
    + `verifyModeDefault` fields +
    new `node-config-loader.ts`
    (`readEffectiveSignalOptIn` +
    `readEffectiveVerifyModeDefault`)
    + the `chain-verify-loop` reads
    the per-node default via a new
    `getNodeConfig` dep. The
    `NodeConfigStore` gains a
    sync `peek()` accessor backed by
    the in-memory snapshot (no disk
    I/O at the routing layer). 39
    unit tests.
  - **v1.4.2 — Tauri settings API.**
    New `NodeService` methods
    `getSignalOptIn` / `setSignalOptIn`
    / `getVerifyModeDefault` /
    `setVerifyModeDefault` + the
    `NodeConfig` + `UpdateNodeConfigParams`
    types gain the two new optional
    fields. `setVerifyModeDefault(undefined)`
    clears the override (the loop
    falls back to the per-runtime
    default). 15 unit tests.
  - **v1.4.3 — Tauri UI design doc
    + closeout.** NEW
    `docs/taui-agent-routing-settings.md`
    (the Tauri team's contract —
    Settings panel + chat badge +
    status indicator; end-user-first
    copy throughout) + this entry +
    `agent-network-engine.md` §2.2.2
    update (note v1.4's Tauri UI
    affordances) +
    `agent-harness-integration-v1-3.md`
    status note (v1.3's chat reply
    fields power the new chat badge) +
    `agent-harness-integration-v1-4.md`
    DONE stamp.

- **2026-08-21 (v1.5 — cost cap + multi-provider
  signal hints — DONE):** the routing
  decisions v1.1 + v1.2 + v1.3 + v1.4 make now
  carry two new inline hints: `/provider:NAME`
  (the primary v1.5 feature — always on) and
  `/cost:N` (a dormant cost cap, gated by
  `ENVOY_HARNESS_COST_CAP_ENABLED=1`, default
  off). The Tauri UI is the **primary UX**
  (friendly Model dropdown + Spending limit
  slider in the chat input + owner-wide
  defaults in Settings); the prompt hints are
  the **power-user escape hatch** (developer-
  style syntax; the regular user never sees
  them). 1 commit on `envoy_harness_integration`
  branch (the user delegated commit; bundled
  v1.5.1 + v1.5.2 + v1.5.3 into a single commit
  at the end of v1.5). 19 new tests (12
  `extractPromptHints` + 4 `routeUserPrompt`
  integration + 5 dispatch e2e) + 277
  pre-existing tests regression-clean on the
  affected paths. Detailed plan:
  `docs/agent-harness-integration-v1-5.md`
  (sub-plan with 10 locked design questions).
  The Tauri team picks up the actual UI work
  in their own workstream; the design doc
  update is in `docs/taui-agent-routing-
  settings.md` §10 (per-message Model
  dropdown + Spending limit slider + owner-
  wide defaults in Settings). The **end-
  user-first** principle (AGENTS.md) drove
  the v1.5 framing: friendly Tauri UI for
  the regular user, developer-style prompt
  hints for the power user. **Keep it
  simple** (per the user): the cost feature
  is a single env var (no persisted field,
  no settings API, no helper file). The
  cost infrastructure is in place
  (parsing + recording); the runtime
  enforcement is a future chunk.
  - **v1.5.1 — hint extraction + router
    integration.** New
    `extractPromptHints` helper in
    `user-prompt-router.ts` + new
    `INLINE_HINT_REGEX` +
    `COST_CAP_ENABLED_ENV_VAR` + new fields
    on `RouteUserPromptDecision`
    (`costCapUsd?` + `providerHint?` +
    `cleanPrompt`). 16 new unit tests.
  - **v1.5.2 — dispatch integration.** EH
    runtime's `ask` + `askSkill` accept
    `providerHint?` (logged in audit trail;
    dormant — adapter doesn't switch
    providers yet). `NodeServiceImpl.askEnvoyHarness`
    + `askEnvoyHarnessSkill` accept `opts?` for
    hints. `readEffectiveCostCapUsd` helper
    (env-var gated) computes the effective
    cost cap. The dispatch in
    `runOwnerAgentTurnViaRuntime` threads the
    hints + uses `decision.cleanPrompt`. 5
    new e2e tests.
  - **v1.5.3 — Tauri UI design doc + closeout.**
    `docs/taui-agent-routing-settings.md` §10
    (per-message Model dropdown + Spending
    limit slider + owner-wide defaults in
    Settings; end-user-first copy) + this
    entry + `agent-network-engine.md` §2.2.2
    update + `agent-harness-integration-v1-4.md`
    status note + `agent-harness-integration-v1-5.md`
    DONE stamp.

- **2026-08-21 (v1.6 — per-prompt opt-out
  `!openclaw` + v0 corner-case fix — DONE):**
  the v1.1 + v1.2 + v1.3 + v1.4 + v1.5 routing
  layer gets a per-prompt **opt-out** (the
  per-message mirror of the v1.4 per-node
  opt-in toggle). The owner types
  `!openclaw <message>` at the start of the
  prompt; the router routes to OpenClaw
  unconditionally. `!openclaw` overrides any
  v1.1 signals (mesh keywords, tool names,
  lsp_*) and any v1.2 per-skill match. The
  v1.5 inline hints (`/cost:N`,
  `/provider:NAME`) are still parsed + stripped
  from the cleanPrompt + recorded on the
  decision (for the audit log) but NOT
  threaded to the OpenClaw runtime (OpenClaw
  doesn't have a hint concept). The order in
  `HINT_PREFIXES` is `["!openclaw", "!eh",
  "/eh"]` — the opt-out is the safety net
  (Q5). v1.6 also fixes the **v0 corner
  case** where a v1.5 inline hint before a
  v0 prefix (e.g. `/cost:0.5 !eh translate
  this`) would mask the v0 prefix (the v0
  prefix scan uses the original prompt, not
  the cleanPrompt). v1.6 re-scans the
  cleanPrompt for v0 prefixes; the fix is
  partial (works when the v1.5 hint is at
  the start; full fix is a v1.6+ future).
  1 commit on `envoy_harness_integration`
  branch (the user delegated commit; bundled
  v1.6.1 + v1.6.2 + v1.6.3 into a single
  commit at the end of v1.6). 17 new tests
  (12 v1.6 `routeUserPrompt` integration +
  5 v1.6 dispatch e2e) + 221 pre-existing
  tests regression-clean on the affected
  paths. No new type errors. The Tauri
  team's chat badge for
  `routingReason: "opt-out-explicit"` is
  designed in `docs/taui-agent-routing-
  settings.md` §12 (end-user-first copy).
  Detailed plan:
  `docs/agent-harness-integration-v1-6.md`
  (sub-plan with 10 locked design questions).
  - **v1.6.1 — opt-out hint + v0
    corner-case fix.** `!openclaw` added to
    `HINT_PREFIXES` (first). New opt-out
    branch in `routeUserPrompt` with
    `reason: "opt-out-explicit"`. New
    `cleanPrompt` re-scan step (the v0
    corner-case fix). `RouteUserPromptDecision.reason`
    + `OwnerAgentTurnResult.routingReason`
    gain `"opt-out-explicit"`. 12 new unit
    tests for the opt-out + v0 corner-case.
  - **v1.6.2 — dispatch integration (no
    functional change).** The dispatch
    already routes non-EH runtimes to
    OpenClaw; no code change. 5 new e2e
    tests for the opt-out dispatch
    (`!openclaw` → OpenClaw + the v0
    corner-case fix in the e2e flow).
  - **v1.6.3 — Tauri UI design doc +
    closeout.** `docs/taui-agent-routing-
    settings.md` §12 (chat badge for
    `"opt-out-explicit"` + power-user hint
    tooltip + the v0 corner-case fix
    background) + this entry +
    `agent-network-engine.md` §2.2.2 update
    + `agent-harness-integration-v1-5.md`
    status note + `agent-harness-integration-v1-6.md`
    DONE stamp.

- **2026-08-21 (v1.7 — OpenClaw tags as
  negative signals — DONE):** the v1.1
  positive-signal rule gets an **inverse
  rule**. When a prompt matches a tag from
  an **OpenClaw** skill in the merged
  manifest, the router routes to OpenClaw
  regardless of any positive (envoy-harness)
  signals (Q2 of the v1.7 sub-plan — veto
  semantics). The `!eh` / `/eh` prefix can
  override the negative rule (Q3 — explicit
  prefix wins over implicit tag). When a tag
  is in BOTH the EH list and the OpenClaw
  list, the positive rule wins (Q4 — shared
  tag precedence). The opt-in-disabled check
  still wins over the negative rule (Q7).
  1 commit on `envoy_harness_integration`
  branch (the user delegated commit; bundled
  v1.7.1 + v1.7.2 + v1.7.3 into a single
  commit at the end of v1.7). 19 new tests
  (9 v1.7 `routeUserPrompt` integration +
  7 v1.7 `extractOpenClawTags` unit + 3
  v1.7 dispatch e2e) + 240 pre-existing
  tests regression-clean on the affected
  paths. No new type errors. The Tauri
  team's chat badge for `routingReason:
  "openclaw-tag-match"` uses the same label
  as `opt-out-explicit` ("Used the free
  built-in assistant for this one") — the
  chat user doesn't need to distinguish why
  OpenClaw was chosen (Q8 of the v1.7
  sub-plan). Detailed plan:
  `docs/agent-harness-integration-v1-7.md`
  (sub-plan with 12 locked design
  questions).
  - **v1.7.1 — OpenClaw tag extraction +
    negative-signal scan.** New
    `extractOpenClawTags(manifest)` in
    `manifest-envoy-harness-tags.ts` (parallel
    to the v1.1 `extractEnvoyHarnessTags`).
    New `openClawTags?` field on
    `RouteUserPromptInput`. New
    `scanOpenClawSignals` helper in
    `user-prompt-router.ts`. New
    `reason: "openclaw-tag-match"` in
    `RouteUserPromptDecision.reason` +
    `OwnerAgentTurnResult.routingReason`. 9
    new unit tests for the negative-signal
    scan + 7 new unit tests for the
    extractor.
  - **v1.7.2 — dispatch integration.** The
    `readManifestView` function in
    `node-service-handlers-run-owner-agent-turn.ts`
    gains the `openClawTags` field (extracted
    from the manifest). The
    `routeUserPrompt` call threads the
    field. 3 new e2e tests for the OpenClaw
    tag dispatch.
  - **v1.7.3 — Tauri UI design doc +
    closeout.** `docs/taui-agent-routing-
    settings.md` §13 (chat badge for
    `"openclaw-tag-match"`; same label as
    `opt-out-explicit` per Q8) + this
    entry + `agent-network-engine.md` §2.2.2
    update + `agent-harness-integration-v1-1.md`
    status note (v1.7 implements Q4 of the
    v1.1 sub-plan, deferred to v1.7) +
    `agent-harness-integration-v1-6.md`
    status note + `agent-harness-integration-v1-7.md`
    DONE stamp.

- **2026-08-21 (v1.8 — cross verifier with
  different model — F9.5 — DONE):** the v0
  cross-verify loop picks the FIRST non-worker
  runtime. v1.8 makes the **model-family
  preference** explicit: the cross-verify
  loop prefers a verifier with a different
  `MODEL_FAMILY` than the worker (Q1 + Q3 of
  the v1.8 sub-plan). When the node has
  multiple runtimes with different families
  (e.g. envoy-harness + openclaw), the
  verifier is the different-family one. When
  the node has only one runtime, the
  cross-verify is skipped (Q4 — same as v0).
  The cross `VerdictEntry` records the
  verifier's model family via the existing
  `verifierModel` Zod field (no protocol
  change — the field is optional for
  `source === "cross"` per the schema in
  `packages/protocol/src/agent-adapter.ts:347-389`).
  1 commit on `envoy_harness_integration`
  branch (the user delegated commit; bundled
  v1.8.1 + v1.8.2 + v1.8.3 into a single
  commit at the end of v1.8). 6 new tests
  (2 `modelFamilyFor` unit + 1 e2e
  `verifierModel` recording + 3
  `pickSecondRuntime` unit) + 240
  pre-existing tests regression-clean on the
  affected paths. No new type errors.
  Detailed plan:
  `docs/agent-harness-integration-v1-8.md`
  (sub-plan with 9 locked design questions).
  - **v1.8.1 — model family table +
    cross-verify preference.** New
    `MODEL_FAMILY` table (hardcoded
    per-runtime) + `modelFamilyFor` helper
    in `chain-verify-loop.ts`. The
    `pickSecondRuntime` function now prefers
    a different-family runtime (Q3). The
    cross-verify branch sets
    `verifierModel: modelFamilyFor(secondRuntime)`
    on the cross `VerdictEntry` (reusing the
    existing Zod field; no protocol change).
    2 new `modelFamilyFor` unit tests + 3
    new `pickSecondRuntime` unit tests.
  - **v1.8.2 — e2e dispatch tests.** 1 new
    e2e test exercising the cross-verify path
    with `verifyMode: "cross-runtime"` and
    checking the cross `VerdictEntry`'s
    `verifierModel` field.
  - **v1.8.3 — Tauri UI design doc +
    closeout.** `docs/taui-agent-routing-
    settings.md` §14 (chain report surface
    for the verifier model family;
    end-user-first copy mapping the
    internal `verifierModel` to the
    user-friendly label "Verified by
    Claude" / "Verified by the free
    built-in assistant" / etc.) + this
    entry + `agent-network-engine.md` F9.5
    status update (v1.x scope: cross-runtime
    primitive; v1.8+ future: cross-model-on-
    same-runtime) +
    `agent-harness-integration-v1-7.md`
    status note + `agent-harness-integration-v1-8.md`
    DONE stamp.

- **2026-08-21 (v1.9 — per-runtime tags
  — DONE):** v1.9 generalizes the v1.1
  `extractEnvoyHarnessTags` + the v1.7
  `extractOpenClawTags` into a single
  `extractTagsByRuntime(manifest, runtime)`
  function. The dispatch extracts tags for
  ALL runtimes and passes them to the router
  as a `Partial<Record<AgentRuntime, ReadonlyArray<string>>>`
  map. The router consumes only the EH +
  OpenClaw tag lists (v1.x routing path); the
  other runtimes' tag lists (pi, hermes,
  codex, codex-cli, openhuman) are available
  for future consumers (v1.9+ per-runtime
  routing extension). The v1.1 + v1.7 wrapper
  functions are kept as **deprecation shims**
  (one-liner wrappers around
  `extractTagsByRuntime`) for backward compat.
  v1.9 is a **foundation chunk** — it ships
  the data structure; the actual per-runtime
  routing (when v1.x starts routing to pi /
  hermes / codex / openhuman) is a v1.9+
  future. 1 commit on `envoy_harness_integration`
  branch (the user delegated commit; bundled
  v1.9.1 + v1.9.2 + v1.9.3 into a single
  commit at the end of v1.9). 18 new tests
  (12 `extractTagsByRuntime` unit + 6
  `runtimeTags` router unit) + 246
  pre-existing tests regression-clean on the
  affected paths. No new type errors.
  Detailed plan:
  `docs/agent-harness-integration-v1-9.md`
  (sub-plan with 10 locked design questions).
  - **v1.9.1 — generic extractor +
    per-runtime tag map.** New
    `extractTagsByRuntime(manifest, runtime)`
    function in `manifest-envoy-harness-tags.ts`.
    The v1.1 `extractEnvoyHarnessTags` + v1.7
    `extractOpenClawTags` wrappers are kept
    as deprecation shims (one-liner
    wrappers around the new generic helper).
    12 new unit tests for
    `extractTagsByRuntime` (each runtime +
    edge cases + deprecation shim tests).
  - **v1.9.2 — router integration.**
    `RouteUserPromptInput` gains a
    `runtimeTags?: Partial<Record<AgentRuntime, ReadonlyArray<string>>>`
    field. The v1.1 + v1.7 callers read from
    `runtimeTags["envoy-harness"]` +
    `runtimeTags["openclaw"]` (with fallback
    to the old `envoyHarnessTags` +
    `openClawTags` fields for backward
    compat). The dispatch's `readManifestView`
    function returns the per-runtime tag
    map. 6 new router unit tests for the
    `runtimeTags` consumption + fallback.
  - **v1.9.3 — Tauri UI design doc +
    closeout.** `docs/taui-agent-routing-
    settings.md` §15 (per-runtime tag map
    design; v1.9 is a foundation chunk) +
    this entry + status notes on
    `agent-harness-integration-v1-1.md` +
    `agent-harness-integration-v1-7.md` +
    `agent-harness-integration-v1-8.md` +
    `agent-harness-integration-v1-9.md`
    DONE stamp.

- **2026-08-21 (v1.10 — scoreboard
  formula — DONE):** v1.10 ships the
  **3-tuple reputation producer** for the
  federated scoreboard. The formula is a
  weighted average of `verdict.score` by
  `verdict.source` weight
  (`SCOREBOARD_SOURCE_WEIGHTS`: `rule=1.0`,
  `llm=1.0`, `cross=1.5`, `human=2.0`),
  with kind contributions (`pass: score *
  weight; partial: score * weight * 0.5;
  fail: -weight; disputed: 0`) and a final
  `sum(contribution) / sum(weight)` normalized
  to `[-1, 1]`. v1.10 also ships the Tauri UI
  helpers `categorizeReputation(score)` (maps
  to `"trusted" | "mixed" | "untrusted" |
  "no-history"`) + `isNoHistoryReputation(verdictCount)`
  (the empty-input case). v1.10 is a
  **foundation chunk** — the formula is
  shipped + tested + documented, but **not**
  wired into `chain-sensitivity-gate.requiresReputationApproval`
  (that's v1.10+ future). 1 commit on
  `envoy_harness_integration` branch (the user
  delegated commit; bundled v1.10.1 + v1.10.2
  into a single commit at the end of v1.10).
  30 new tests (15 `reputationFromVerdicts` +
  8 `categorizeReputation` + 3
  `isNoHistoryReputation` + 2 + 2 constants)
  + 222 pre-existing tests regression-clean
  on the affected paths. No new type errors
  (pre-existing multiformats/ArrayBuffer
  conflict in
  `packages/network/src/index.ts:2791`
  unchanged). The function name
  `reputationFromVerdicts` is distinct from
  the Phase 24C `aggregateReputation` in
  `reputation-router.ts:48` (different domain
  — verifier verdicts, not capability-provider
  feedback). The `cross=1.5x` source weight
  encodes the v1.8 F9.5 intent
  ("cross-verify with a different model is a
  stronger signal") at the
  reputation-aggregation layer. Detailed plan:
  `docs/agent-harness-integration-v1-10.md`
  (sub-plan with 10 locked design questions).
  - **v1.10.1 — the formula + tests.**
    New `apps/node/src/chain-scoreboard.ts`
    (`reputationFromVerdicts` +
    `categorizeReputation` +
    `isNoHistoryReputation` +
    `SCOREBOARD_SOURCE_WEIGHTS` +
    `SCOREBOARD_TRUST_THRESHOLDS`). Pure
    functions, no I/O. New
    `apps/node/test/chain-scoreboard.test.ts`
    (30 unit tests — empty input /
    all-pass / all-fail / all-disputed /
    mixed-source / partial-factor /
    cross-weighting / human-weighting /
    floating-point safety / categorize
    boundaries / constants spec pinning).
  - **v1.10.2 — doc closeout.** This entry
    + `docs/agent-harness-integration-v1-10.md`
    (the sub-plan + DONE stamp) +
    `docs/agent-harness-integration-v1-8.md`
    v1.10 status note (v1.10 ships the
    weighting the v1.8 `verifierModel` field
    enabled; F9.5 intent encoded as the
    `cross=1.5` source weight) +
    `docs/agent-harness-integration-v1-9.md`
    v1.10 status note (v1.10 builds on the
    v1.9 per-runtime tag map; the runtimes
    that produce verdicts are the same
    runtimes whose tag lists v1.9 extracted) +
    `docs/taui-agent-routing-settings.md` §16
    (chain report surface for the scoreboard
    category; Tauri team maps the internal
    categories to user-friendly labels).

- **2026-08-21 (v1.11 — wire the
  scoreboard into the orchestrator
  — DONE):** v1.11 ships the
  **wiring helper** that reads the
  3-tuple reputation from the
  `ArbitrationStore` and returns the
  worker's reputation in `[0, 1]`
  (mapped from the v1.10 producer's
  `[-1, 1]` output) or `undefined`
  when there's no usable signal.
  The helper is `getWorkerReputation(store,
  criteria)` in `apps/node/src/chain-scoreboard.ts`
  — it calls `getVerdictsFor(store,
  3-tuple)` (the existing store reader)
  + `reputationFromVerdicts` (the v1.10
  producer) + maps the result. v1.11 is
  the **wiring chunk**; the actual
  consumer-side integration (where the
  orchestrator's worker picker populates
  `reputationBySkill` from
  `getWorkerReputation`) is v1.13. 1
  commit on `envoy_harness_integration`
  branch (the user delegated commit;
  bundled v1.11.1 + v1.11.2 into a single
  commit at the end of v1.11). 10 new
  unit tests (the v1.11 wiring helper)
  + 252 pre-existing tests regression-clean
  on the affected paths. No new type
  errors (pre-existing
  multiformats/ArrayBuffer conflict in
  `packages/network/src/index.ts:2791`
  unchanged). The scale mapping
  `[-1, 1]` → `[0, 1]` is at the wiring
  point (the v1.10 formula's `[-1, 1]`
  is the mathematical spec; the
  consumers' `[0, 1]` is the gate /
  picker convention; the mapping is
  `(raw + 1) / 2`). The helper returns
  `undefined` for empty + all-disputed
  inputs (the `chain-plan-assign.ts:skillReputation`
  convention treats `undefined` as
  "no reputation"; preserves the
  existing consumer semantics). Detailed
  plan: `docs/agent-harness-integration-v1-11.md`
  (sub-plan with 8 locked design questions).
  - **v1.11.1 — the wiring helper +
    tests.** `getWorkerReputation(store,
    criteria)` added to
    `apps/node/src/chain-scoreboard.ts`
    (imports `getVerdictsFor` +
    `ArbitrationStore` from
    `chain-arbitration.ts`). 10 new
    unit tests in
    `apps/node/test/chain-scoreboard.test.ts`
    (empty / all-pass / all-fail /
    all-disputed / mixed-source /
    mapping / filter correctness /
    boundary cases).
  - **v1.11.2 — doc closeout.** This
    entry +
    `docs/agent-harness-integration-v1-11.md`
    (the sub-plan + DONE stamp) +
    `docs/agent-harness-integration-v1-10.md`
    v1.11 status note (v1.11 ships the
    consumer-side wiring the v1.10
    producer needs; the worker picker
    integration is v1.13) +
    `docs/taui-agent-routing-settings.md`
    §17 (Tauri UI for the worker trust
    badge; the `getWorkerReputation`
    helper is what the Tauri team calls
    from the Tauri side).

- **2026-08-21 (v1.13 — worker ranking
  integration — DONE):** v1.13 ships
  the **consumer-side integration** —
  the orchestrator's worker picker's
  `reputationBySkill` field is now
  populated from the v1.10 + v1.11
  producer (replacing the v0
  `chain-reputation-3tuple.ts:deriveReputationBySkillForPeer`
  for the worker-picker call site).
  v1.13 adds `getReputationBySkillForPeer(stores, peerId)`
  to `apps/node/src/chain-scoreboard.ts`
  — the per-peer projection that
  iterates over the chain stores +
  calls `getWorkerReputation` (the
  v1.11 per-3-tuple helper) for each
  `(runtime, skill)` combination +
  builds a per-skill reputation map
  (MAX across runtimes per skill —
  Q2 of the v1.13 sub-plan; the
  "best foot forward" semantic).
  The orchestrator's
  `deriveRosterReputation` is swapped
  to use the new helper. The v0
  `chain-reputation-3tuple.ts` module
  is **left in place** (other callers
  may depend on it; v1.13 only replaces
  the worker-picker producer). v1.13
  is the **additive tiebreaker** —
  the worker's `reputationBySkill`
  feeds the existing
  `chain-plan-assign.ts:REPUTATION_BLEND_WEIGHT = 0.2`
  as a soft addend (matches the
  existing consumer design; not a
  replacement of the primary + best-fit
  strategy). 1 commit on
  `envoy_harness_integration` branch
  (the user delegated commit; bundled
  v1.13.1 + v1.13.2 into a single
  commit at the end of v1.13). 6 new
  unit tests + 262 pre-existing tests
  regression-clean on the affected
  paths. No new type errors. Detailed
  plan: `docs/agent-harness-integration-v1-13.md`
  (sub-plan with 8 locked design questions).
  - **v1.13.1 — the projection helper
    + call-site swap + tests.** New
    `getReputationBySkillForPeer(stores, peerId)`
    in `apps/node/src/chain-scoreboard.ts`
    (imports `isVerdictEntry` from
    `chain-arbitration.ts`). The
    orchestrator's `deriveRosterReputation`
    (in
    `node-service-chain-orchestration.ts:279-285`)
    is swapped to use the new helper.
    6 new unit tests in
    `apps/node/test/chain-scoreboard.test.ts`
    (empty / single-3-tuple /
    multi-runtime MAX / multi-skill /
    all-disputed skip).
  - **v1.13.2 — doc closeout.** This
    entry +
    `docs/agent-harness-integration-v1-13.md`
    (the sub-plan + DONE stamp) +
    `docs/agent-harness-integration-v1-11.md`
    v1.13 status note (v1.13 wires the
    v1.11 helper into the worker
    picker's `reputationBySkill` field;
    the v0 `chain-reputation-3tuple.ts`
    module is left in place for other
    callers) +
    `docs/taui-agent-routing-settings.md`
    §18 (Tauri UI for the per-skill
    reputation display; the
    `getReputationBySkillForPeer` helper
    is the backend the Tauri team calls).

- **2026-08-21 (v1.14 — per-runtime
  routing extension — DONE):** v1.14
  ships the **actual routing extension**
  the v1.9 per-runtime tag map enabled.
  The router now scans all 7 runtimes'
  tag lists (not just EH + OpenClaw);
  the `RouteUserPromptDecision.runtime`
  type widens from
  `"openclaw" | "envoy-harness"` to
  the full `AgentRuntime` (7 values);
  the new `reason: "signal-runtime"`
  value is added for the other-runtime
  positive matches. The precedence
  preserves the v1.7 OpenClaw veto
  (asymmetric: OpenClaw still vetoes;
  other runtimes have positive-only
  semantics) and the v1.1 + v1.2 EH
  positive (which now wins over the
  v1.14 other-runtime positive — EH is
  the home node's first-class engine;
  the other 5 runtimes are future
  runtimes). The dispatch's runtime
  handling gains an
  `unsupported-runtime fallback`: when
  the router recommends a runtime
  (pi / hermes / codex / codex-cli /
  openhuman) that the home node doesn't
  have an adapter for, the dispatch
  falls back to OpenClaw with a
  `chain.warn` log. v1.14 is a
  **routing vocabulary extension** —
  the home node today has adapters
  for EH + OpenClaw only; the
  actual runtime adapters for the 5
  new runtimes are a v1.14+ future.
  1 commit on `envoy_harness_integration`
  branch (the user delegated commit;
  bundled v1.14.1 + v1.14.2 into a
  single commit at the end of v1.14).
  10 new unit tests + 268 pre-existing
  tests regression-clean on the
  affected paths. No new type errors.
  The `AgentRuntime` type widening
  in `user-prompt-router.ts:405` is
  a **backward-compatible** widening
  (the existing 2-value union is a
  subset of `AgentRuntime`; all
  existing callers continue to work).
  The `OwnerAgentTurnResult.routingReason`
  type (in
  `packages/api/src/owner-agent-loop.ts:90`)
  gains the `"signal-runtime"` value.
  Detailed plan:
  `docs/agent-harness-integration-v1-14.md`
  (sub-plan with 8 locked design
  questions).
  - **v1.14.1 — the type + scan +
    precedence + dispatch + tests.**
    `RouteUserPromptDecision.runtime:
    AgentRuntime` (widening) +
    `RouteUserPromptDecision.reason:
    | ... | "signal-runtime"` +
    `OwnerAgentTurnResult.routingReason:
    | ... | "signal-runtime"`. The
    router scans all 5 "other"
    runtimes' tag lists (pi / hermes /
    codex / codex-cli / openhuman) +
    adds the v1.14 precedence (after
    the EH positive checks; the EH
    positive wins). The dispatch
    (in
    `node-service-handlers-run-owner-agent-turn.ts`)
    gains the `SUPPORTED_RUNTIMES`
    check + the OpenClaw fallback +
    the `chain.warn` log. 10 new unit
    tests in
    `apps/node/test/user-prompt-router.test.ts`
    (single-runtime match / multi-
    runtime order / OpenClaw veto /
    EH precedence / `!openclaw`
    opt-out / default / empty tag list
    / AgentRuntime type contract).
  - **v1.14.2 — doc closeout.** This
    entry +
    `docs/agent-harness-integration-v1-14.md`
    (the sub-plan + DONE stamp) +
    `docs/agent-harness-integration-v1-9.md`
    v1.14 status note (v1.14 ships the
    actual routing extension the v1.9
    per-runtime tag map enabled; the
    home node's adapters for pi /
    hermes / codex / openhuman are a
    v1.14+ future) +
    `docs/taui-agent-routing-settings.md`
    §19 (Tauri UI for the per-runtime
    routing surface; the chat badge for
    `"signal-runtime"`).

- **2026-08-21 (v1.12 — Tauri UI for
  the scoreboard badge — DONE):**
  v1.12 ships the **Tauri-team
  handoff** for the scoreboard badge
  UI. v1.10 + v1.11 + v1.13 ship the
  backend helpers
  (`reputationFromVerdicts` +
  `categorizeReputation` +
  `isNoHistoryReputation` +
  `getWorkerReputation` +
  `getReputationBySkillForPeer`); v1.12
  is the sub-plan + the Tauri design
  doc section that tells the Tauri
  team what to build + how to call
  the backend. v1.12 is a
  **design-only chunk** — the actual
  Tauri UI implementation is the
  Tauri team's work (out of scope
  for our repo). 1 commit on
  `envoy_harness_integration` branch
  (the user delegated commit; the
  sub-plan + the Tauri design doc
  section + the parent doc change log
  + the v1.10 + v1.11 + v1.13 status
  notes). No new tests (the backend
  is already tested). No new type
  errors. The Tauri team implements
  the actual chain report panel (the
  future surface; not in the chat
  surface). Detailed plan:
  `docs/agent-harness-integration-v1-12.md`
  (sub-plan with 6 locked design
  questions).

- **2026-08-21 (v1.15 — Tauri UI for
  the per-runtime tag map — DONE):**
  v1.15 ships the **Tauri-team
  handoff** for the per-runtime tag
  map UI panel. v1.9 ships the
  data structure
  (`extractTagsByRuntime` +
  `runtimeTags` map); v1.14 ships
  the routing consumption; v1.15 is
  the sub-plan + the Tauri design doc
  section that tells the Tauri team
  what to build. v1.15 is a
  **design-only chunk** — the actual
  Tauri UI implementation is the
  Tauri team's work (out of scope
  for our repo). 1 commit on
  `envoy_harness_integration` branch
  (the user delegated commit; the
  sub-plan + the Tauri design doc
  section + the parent doc change log
  + the v1.9 + v1.14 status notes).
  No new tests (the backend is
  already tested). No new type
  errors. The Tauri team implements
  the actual Settings panel (the
  per-runtime tag list display;
  read-only). Detailed plan:
  `docs/agent-harness-integration-v1-15.md`
  (sub-plan with 6 locked design
  questions).

- **2026-08-21 (v1.17 — remove
  deprecation shims — DONE):** v1.17
  removes the v1.1 + v1.7 deprecation
  shims (`extractEnvoyHarnessTags` +
  `extractOpenClawTags`). v1.9 ships
  `extractTagsByRuntime(manifest, runtime)`
  which generalizes the v1.1 + v1.7
  extractors; the shims were kept as
  backward compat (Q3 + Q10 of the v1.9
  sub-plan). v1.17 audits the callers
  (no production callers; all
  production callers migrated in v1.9)
  + removes the shims + removes the
  deprecation-shim tests + removes the
  v1.7 mirror-symmetric tests (the
  `extractOpenClawTags` describe block;
  the v1.9 `extractTagsByRuntime` tests
  cover the same behavior). 1 commit
  on `envoy_harness_integration`
  branch (the user delegated commit).
  Net -9 tests in
  `manifest-openclaw-tags.test.ts`
  (file becomes 10 tests from 19) +
  269 pre-existing tests
  regression-clean. No new type
  errors. The v0 `MESH_KEYWORDS`
  constant in `user-prompt-router.ts`
  is left in place (separate
  deprecation; a v1.17+ future chunk
  can remove it). Detailed plan:
  `docs/agent-harness-integration-v1-17.md`
  (sub-plan with 4 locked design
  questions).

- **2026-08-21 (v1.16 — cross-model-
  on-same-runtime — F9.5 full
  primitive — BLOCKED):** v1.16 is
  the **sub-plan only** (no code).
  The implementation is **blocked**
  on the EH runtime gaining per-call
  model override support on the
  cross-verify path (a separate
  envoy-harness team effort). v1.16
  is the full F9.5 primitive — the
  cross-verify uses a different
  **model** than the worker (the
  worker on runtime A with model X
  → verifier on runtime A with
  model Y). v1.8 ships the
  cross-runtime primitive (the
  cross-verify prefers a different
  model **family**). v1.16 ships
  the cross-model-on-same-runtime
  primitive (the cross-verify uses
  a different model on the **same**
  runtime). The v1.16 design locks
  the `verifierProviderHint?`
  per-call option + the
  `claude-instant` default + the
  audit trail via the v1.8
  `verifierModel` field. The
  implementation is deferred until
  the EH runtime support lands.
  Detailed plan:
  `docs/agent-harness-integration-v1-16.md`
  (sub-plan with 7 locked design
  questions).
