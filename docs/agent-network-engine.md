# Agent Network — worker AI Engine policy

> **Status:** Canonical product policy (2026-08). Step 1 shipped; Step 2 (Ext) shipped for node-local engine choice + sync Ext ask.  
> **Audience:** engineers implementing Team job worker execution.  
> **Related:** [agent-network-vocabulary.md](./agent-network-vocabulary.md),
> [agent-network-config.md](./agent-network-config.md) (chat AI Engine flags),
> [agent-network-plan-assign.md](./agent-network-plan-assign.md).

## 1. Separation of concerns

| Who decides | What |
|-------------|------|
| **Team job creator / Assigner** | Which **peer (node)** works on each step — membership → skills → online / LAN / profile |
| **Owner of each home node** | Which **local AI Engine** executes Agent Network work **on that node** |

The Assigner never picks OpenClaw vs Ext Agent. Peers advertise skills; the
orchestrator assigns peers.

Chat / bridge AI Engine toggles (`openclawEnabled`, `bridgeEnabled`) remain as
documented in [agent-network-config.md](./agent-network-config.md). This doc
covers **Agent Network worker execution** only.

## 2. Per-node Agent Network engine

| Mode | Who runs accepted Team-job subtasks on this node |
|------|--------------------------------------------------|
| **Default (step 1)** | **Built-in OpenClaw** (EnvoyAI) |
| **Step 2** | **Ext Agent** — owner selects on **their** node (`agentNetworkWorkerEngine`) |
| **Phase 8 Step 1+** | **envoy-harness** — the home-team agent harness from the sibling monorepo, via `@envoymesh/envoy-harness-adapter` |

### 2.2 Phase 8 / Step 5 — Tauri user-prompt signal-based opt-in

**Owner-facing summary:** the Tauri EnvoyAI chat routes
ordinary prompts to Built-in OpenClaw (default).
**Signal-bearing prompts auto opt-in to envoy-harness.**
The owner can disable signal routing per node with an
env var. This is the Q3 D design decision from the
Phase 8 design doc.

**Why this matters:** OpenClaw is mature. envoy-harness
has novel features (mesh-native sub-agents, federated
scoreboard, `lsp_*` tools, multi-provider LLM, cost cap,
3-tuple reputation, `JsonLinesTracer`, persisted sessions)
that OpenClaw does not have and will not add. The signal
router lets envoy-harness **earn** its place on the tasks
where its features matter, without disrupting ordinary
chat.

**The default routing table:**

| Prompt category | Routed to | Trigger |
|---|---|---|
| Ordinary local chat | **OpenClaw** (default) | No signal matched |
| **Mesh keyword**: `mesh`, `federated`, `cross-node` | envoy-harness | Case-insensitive substring in the prompt |
| **Tool name**: `RemoteMeshSubmitter`, `FanOutSpec`, `lsp_*` | envoy-harness | Case-insensitive substring (lsp_ uses word-boundary regex) |
| **Explicit hint**: `!eh` or `/eh` at the start | envoy-harness | User explicitly forces routing; prefix is stripped before dispatch |
| Signal matched + envoy-harness not ready | **OpenClaw** (fallback) | `routingReason: "envoy-harness-unready"`; signals still populated in result |
| Owner disabled signal routing | **OpenClaw** (regardless of signals) | `ENVOY_HARNESS_SIGNAL_OPT_IN=disabled` env var |

**Where the router lives:**

- Pure function: `apps/node/src/user-prompt-router.ts`
  (41 unit tests in `apps/node/test/user-prompt-router.test.ts`)
- Host wiring: `apps/node/src/node-service-handlers-run-owner-agent-turn.ts`
  (23 e2e tests in
  `apps/node/test/run-owner-agent-turn-routing.test.ts`)

**How the dispatch flows:**

```text
Tauri user prompt
   ↓
runOwnerAgentTurnViaRuntime(ctx, message)
   ↓
routeUserPrompt({ prompt, isEnvoyHarnessReady, signalOptIn })
   ↓
   ├─ signalOptIn === "disabled"   →  { runtime: "openclaw", reason: "opt-in-disabled" }
   ├─ no signal matched            →  { runtime: "openclaw", reason: "default" }
   ├─ signal matched & EH ready    →  { runtime: "envoy-harness", reason: "signal" }
   └─ signal matched & EH unready  →  { runtime: "openclaw", reason: "envoy-harness-unready", signals: [...] }
   ↓
dispatch(ctx, message, decision)  ← strips hint prefix from prompt before any LLM call
   ↓
OwnerAgentTurnResult {
  modelUsed: "openclaw" | "envoy-harness" | "scripted-tutor" | "native",
  routingReason,
  routingSignals: ReadonlyArray<string>
}
```

**Per-node opt-out:**

```sh
# Default: signal routing is enabled.
ENVOY_HARNESS_SIGNAL_OPT_IN=disabled  # disable signal-based opt-in
```

The Tauri settings UI field for opt-in is a follow-up
task (out of scope for Step 5 v0). v0 ships with the
env-var surface; the UI rewrite is a separate work item.

**v0 signal set scope (deferred to v1):**

- Cost cap (requires a UI affordance the chat path
  doesn't have today)
- Multi-provider (same reason)
- Capability-tag-based detection (when the merged
  manifest exposes structured capability tags in v1)
- Word-boundary tightening (v0 accepts substring false
  positives like `"meshes"` matches `mesh`; v1 will
  tighten to a word-boundary regex)

**Why opt-in (default = OpenClaw) vs swap-the-default:**

Switching the default to envoy-harness would surface
every envoy-harness rough edge in every chat. The
signal router lets envoy-harness prove itself on
relevant tasks first; the v1 follow-up can revisit
the default policy when envoy-harness is mature
enough.

**What Step 5 does NOT cover (deferred):**

- Per-prompt opt-out (e.g. `!openclaw` hint) — v0 is
  per-node only.
- Social UI "routed by <token>" badge — the
  `routingReason` + `routingSignals` fields land in
  Step 5; rendering the badge is a Social-team task.
- Per-skill fan-out (per-skill routing within one
  job) — whole-job / whole-prompt routing only in v0.

Config field: `PersistedNodeConfig.agentNetworkWorkerEngine`: `"openclaw"` \| `"ext"` \| `"envoy-harness"` (default `"openclaw"`). Phase 8 widens the literal set; the persisted schema is unchanged.

Which Ext product (Pi / HomeClaw / Hermes / …, later Codex / Claude Code) remains **Settings → AI → Ext Agent** (`activeExtAgent` in bridge-config). AN only chooses OpenClaw vs that active Ext agent.

Rules:

1. **Default = OpenClaw.** Joining Agent Network implies this node’s worker
   path uses Built-in OpenClaw until the owner opts into Ext for AN.
2. **Manual, node-local.** Only the owner of that home node chooses (Social →
   Your worker profile → Team job engine). Not the Team job creator, not the
   Assigner, not a per-step UI. When this node is selected for a step, it runs
   the configured engine.
3. **One engine for Agent Network at a time.** If the owner selects Ext Agent
   for Agent Network, Built-in OpenClaw does **not** run AN worker subtasks on
   that node (and the reverse). Chat routing may still differ; AN is exclusive.
4. **Skills (v1):** ranking still uses owner domains (+ OpenClaw skill scan when
   engine is OpenClaw). Ext product names are **not** skills. Ext skill
   advertisement is deferred (see vocabulary).
5. **Phase 8 envoy-harness skill catalog** lives in the sibling monorepo's
   `@envoymesh/envoy-harness-adapter` (`ENVOY_HARNESS_SKILLS`). The
   `apps/node/src/agent-runtime-envoy/manifest.ts` re-export is the seam —
   adding a new skill in the bridge flows through automatically. In Step 1+
   `agentNetworkWorkerEngine = "envoy-harness"` returns
   `envoy_harness_unavailable` for any real call until Step 2 wires the
   model adapter.

### 2.1 Phase 8 / Step 4 — merged manifest at node level

**Owner-facing summary:** the orchestrator now sees **one
local manifest per node** for the Agent Network, with
every skill tagged by the runtime that owns it. A node
with `envoy-harness` + `openclaw` runs the orchestrator's
manifest picker as "9 skills across 2 runtimes" instead
of "iterate each adapter separately".

**The local view (not the wire format):** the wire
`CapabilityManifest` (in `@envoymesh/protocol/agent-adapter.ts`)
is **per-runtime** — one `runtime: AgentRuntime` per
manifest, broadcast over the mesh. The merged manifest
is the host's **local aggregate** of what those N
per-runtime manifests would say. The wire format is
unchanged; the merged manifest is for the orchestrator's
local routing decisions.

**What `getNodeManifest()` returns:**

```ts
interface NodeManifest {
  peerId: string;                                       // the node's mesh peerId
  runtimes: ReadonlyArray<{
    runtime: "envoy-harness" | "openclaw" | "pi" | ...;
    runtimeVersion: string;                             // v0: always "unknown"
  }>;
  skills: ReadonlyArray<{
    skillId: string;
    description: string;
    costCeilingUsd?: number;
    maxSensitivity: "public" | "friends" | "private";
    tags: ReadonlyArray<string>;
    runtime: AgentRuntime;                              // the runtime that owns this skill
  }>;
}
```

**How to use it:**

- The orchestrator's manifest picker reads
  `nodeService.getNodeManifest()` once at startup
  (or on adapter config change).
- Routing decisions become a local lookup: "which
  runtime owns `code-review`?" → return
  `runtime: "envoy-harness"`.
- The per-adapter broadcast flow
  (`agent-adapter-broadcast.ts`) is unchanged. A
  node with 2 runtimes still broadcasts **2 separate
  wire manifests** (one per runtime).

**Where the merged manifest lives:**

- Aggregator:
  `apps/node/src/agent-adapter-manifest-aggregate.ts`
  (pure function, no I/O)
- Host wiring:
  `NodeServiceImpl.getNodeManifest()`
  (sync, uses stateless stub adapters that throw on
  `execute()` / `buildManifest()`)
- Unit tests:
  `apps/node/test/agent-adapter-manifest-aggregate.test.ts`
  (9 tests: empty / single / both / collision /
  `runtimeVersion` / tags + `costCeilingUsd` /
  `maxSensitivity` / order preservation)
- Host wiring tests:
  `apps/node/test/agent-adapter-manifest-aggregate-host.test.ts`
  (5 tests: default 9 skills, mesh-less peerId
  fallback, test seam injection, test seam reset,
  skillId collision)

**Why this matters (Q5 routing):** the orchestrator's
"per-node primary + best-fit skill fallback" decision
needs to know "what skills does this node have, and
which runtime owns each". The merged manifest answers
that in one read. Without it, the orchestrator would
have to instantiate each adapter, call
`describeSkills()`, union the results, and tag each
with the adapter's runtime — every routing decision.

**SkillId collision policy:** the aggregator throws
`SkillIdCollisionError` when two runtimes expose the
same `skillId`. This is a bug in one of the runtimes
— the model would see two skills with the same name
in its tool list. We fail loud at aggregation time,
not silently.

**Why `runtimeVersion: "unknown"` v0:** the
`AgentAdapter` interface doesn't expose
`runtimeVersion` directly. v0 hard-codes `"unknown"`.
Future: read from `buildManifest()` (requires async
aggregator).

**What Step 4 does NOT cover:**

- **Per-skill fan-out (whole-job routing v0).** A
  job with `requiredSkill: ["code-review",
  "peer-list"]` routes to one runtime, not multiple.
- **Signal-based opt-in routing (Step 5).** Step 4
  is a passive merge; the orchestrator still uses
  the existing engine picker to choose the primary.
- **B-class skills (Step 3).** Step 4 ships with
  the current 5 + 4 = 9 skills. Step 3 adds 3
  B-class skills to the merged manifest (6 entries
  — one per runtime, since both runtimes can invoke
  them).

```text
Owner config (this node)          Assigner (Team job)
─────────────────────────         ───────────────────
AN engine: OpenClaw | Ext    →    pick peer by membership + skills
       ↓                          assign step → that peer
  execute subtask locally
```

**Phase 8 / Step 4 adds** the local merged manifest
between the owner's config and the Assigner's
routing decision:

```text
  NodeServiceImpl.getNodeManifest()       ←  Phase 8 / Step 4
       ↓ (one read, 9 skills, 2 runtimes)
  Assigner (Team job) — pick runtime by skill match
       ↓
  execute subtask locally
```

### 2.3 Phase 8 / Step 6 — cross-verify policy (Q4 A)

**Owner-facing summary:** the orchestrator's verify
loop (Phase 41 / MAP) re-runs the same Team-job
subtask on a SECOND runtime when the rule verdict
is `partial` / `disputed` AND the job is
high-criticality or private-and-expensive. Step 6
adds an explicit `verifyMode` to `ChainMandate` so
the owner can force the cross regardless of the
rule verdict (the Q4 (a) default for envoy-writes
jobs) or make the cross verdict the authority (Q4
(b) override for security-sensitive jobs).

**The modes** (per the Step 6 sub-plan's locked
decisions):

| `verifyMode` | Writer | Verifier | When |
|---|---|---|---|
| `"rule-only"` (default for OpenClaw-writes) | worker | worker (rule pass only) | OpenClaw is mature; no cross needed |
| `"cross-runtime"` (Q4 (a) default for envoy-writes) | worker | the OTHER runtime | Envoy-harness novel features get cross-checked by the mature runtime |
| `"cross-runtime-strict"` (Q4 (b) override) | worker | the OTHER runtime | Cross verdict wins (overrides rule pass on disagreement) |

**The per-worker-runtime default:**
`defaultVerifyModeForWorker(runtime)` in
`apps/node/src/chain-verify-loop.ts` returns
`"cross-runtime"` for `envoy-harness` and
`"rule-only"` for `openclaw` / `ext`. The owner
can override per-job by setting `ChainMandate.verifyMode`
explicitly.

**How the cross runs:**

The orchestrator's `chain-verify-loop` already
has the cross-agent infrastructure (Phase 41):
- `pickSecondRuntime(deps, workerRuntime)` picks
  the OTHER runtime (e.g. if worker is envoy-harness,
  second is OpenClaw)
- `secondAdapter.execute(input)` re-runs the same
  task on the second runtime
- `crossVerifier.verify({objective, resultA, resultB})`
  compares the two results
- Both rule + cross `VerdictEntry` land in the
  `ArbitrationStore` (the scoreboard / transcript)

Step 6's `verifyMode` adds:
- `shouldEscalateToCrossAgent` honors `verifyMode`
  (forces the cross when the mode is `cross-runtime`
  or `cross-runtime-strict`)
- `combineToVerdict(verdicts, verifyMode)` honors
  the strict mode (cross verdict wins)

**The bridge's adapter-level cross-verify**
(parallel primitive for non-orchestrator callers):

`buildEnvoyHarnessAdapterWithCrossVerify` (in
`@envoymesh/envoy-harness-adapter`) wires
`defaultCrossVerify(openClawAdapter)` on the
adapter so `adapter.verify(input)` re-runs the
same skill on OpenClaw and returns the local
verifier's verdicts for the new result. The
host's `createEnvoyHarnessAdapter` accepts an
optional `openClawAdapter?`; when provided, the
factory uses the cross-verify factory. v0
production always passes `openClawAdapter`
(OpenClaw is always available as the default AI
engine).

**What Step 6 does NOT cover (deferred):**

- Per-node config field for `verifyModeDefault` —
  the function `defaultVerifyModeForWorker(runtime)`
  is the v0 default. Per-node override is a
  follow-up (Tauri settings UI field + persisted
  config migration).
- Cross verifier with a different model on the
  SAME runtime (F9.5 use case, not Q4) — that's
  `defaultCrossVerify(anotherAdapterOnSameRuntime)`,
  used for cross-model verification. v0
  cross-verify is cross-runtime only.
- Scoreboard formula adjustment — the existing
  `aggregateReputation` reads the ArbitrationStore.
  v0 leaves the formula as-is; the cross verdict
  is one more `VerdictEntry` in the store.

## 3. Phasing

### Step 1 — OpenClaw (now)

- Wire `executeSubtask` so accepted Team-job work calls Built-in OpenClaw.
- If OpenClaw is not running / errors / returns empty: emit a **final failed
  partial** (`confidence` low, note starts with `Failed:`) — do **not** fake
  success with stub text.
- Orchestrator recovery remains peer-level: stall timeout → reassign once to
  another worker (existing `reassignStalledSubtask`). No Ext↔OpenClaw swap on
  the same node in step 1.

### Step 2 — Ext Agent for Agent Network (shipped — execution + config)

- Owner setting: `agentNetworkWorkerEngine` = `openclaw` \| `ext` (default OpenClaw).
- When Ext is selected: `createExtAgentChainSubtaskExecutor` → sync `forwardToAgent`
  (`/message`); empty/async-only replies → `AN_ENGINE_FAIL`.
- Readiness: Ext path requires bridge enabled + agent URL (propose/accept + local
  “You” online). OpenClaw path still uses gateway readiness.
- Ext skill advertisement for ranking: **not in this slice** (owner domains + role only).
- Same fail semantics: honest failure → stall / reassign to another peer.

## 4. Error handling summary

| Failure | Worker node | Orchestrator |
|---------|-------------|--------------|
| OpenClaw (or Ext) unavailable / timeout / empty | Decline bid/accept; if somehow awarded, final partial `Failed: …`. Local self ranked offline. | Prefer backup peer via stall/worker-failed reassign (≤1). If no backup, Failed note remains for the report. |
| Peer offline / no heartbeat | — | Stall → cancel → propose next ranked peer (≤1 reassign) |
| No backup peers | — | Job waits or completes with Failed content in report when exhausted |

Local engine fallback (OpenClaw → native `modelProviders`) is **out of scope for
step 1** Agent Network workers. Prefer clear failure over silent stub text so
the Assigner can reassign.

## 5. Implementation pointers

| Concern | Location |
|---------|----------|
| Policy (this doc) | `docs/agent-network-engine.md` |
| Membership / skills vocabulary | `docs/agent-network-vocabulary.md` |
| Worker accept → execute | `apps/node/src/chain-worker-executor.ts`, `buildChainWorkerDeps` |
| Engine coerce / default | `apps/node/src/agent-network-worker-engine.ts` |
| OpenClaw ask | `NodeService.askOpenClaw` / `askOpenClawViaRuntime` |
| Ext ask (AN) | `NodeService.askExtAgent` → `forwardToAgent` |
| Stall reassign | `apps/node/src/chain-orchestrator.ts` → `reassignStalledSubtask` |
| Social picker | `AgentNetworkProfilePanel` → Team job engine |
