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
