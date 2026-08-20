# envoy-harness integration — b2 + b3 follow-up plan

> **Status:** Draft (2026-08-20). Companion to
> [`agent-harness-integration.md`](./agent-harness-integration.md) (the
> design) and [`envoy-harness-integration-EnvoyMesh.md`](./envoy-harness-integration-EnvoyMesh.md)
> (the implementation guide). **This doc covers the two
> remaining Phase 8 Step 2 sub-chunks:** b2 (OpenClaw's
> `BridgeToEnvoyHarness` skill) and b3 (full `Agent` e2e
> with a real `defaultBuildSubagentFactory` + `ModelAdapter`).
>
> **Audience:** engineers picking up the b2/b3 work after b1
> is committed. Read the design doc's Step 2 + Q1 for "why";
> read this for "what's left and in what order".
>
> **Step 2 status:** the **seam is done** as of b1 — the
> `LocalRuntimeRegistry.submitToEnvoyHarness` method is
> real (delegates to a host-injected `LocalMeshSubmitter`).
> What remains is wiring the real callers (OpenClaw
> in b2, real `buildAgent` in b3).

## 1. Where b1 leaves us

### b1.1 — read `LocalMeshSubmitter` constructor + `AgentResult` shape ✓

Confirmed:

- `Agent` is a `class` with `constructor(options: AgentOptions)`.
  `AgentOptions` requires `model`, `tools`, `session`;
  everything else optional. `agent.run(prompt)` returns
  `AgentResult`.
- `LocalMeshSubmitter` is in `@envoymesh/envoy-harness`'s
  `subagent/local-mesh-submitter.ts` (public re-export from
  the package root).
- `SubagentResult` has `status`, `content`, `workerPeerId`,
  `workerRuntime`, `costUsd`, `durationMs`, `verdict`,
  `signature`.

### b1.2 — rewrite `submitToEnvoyHarness` ✓

`LocalRuntimeRegistry` now:

- Accepts `buildSubagent: (input) => Agent` + `workerPeerId: string`
  in `CreateLocalRuntimeRegistryOptions` (DI symmetric to
  `askOpenClaw` on the openclaw side).
- Constructs a `LocalMeshSubmitter` once in the constructor
  (stateful — the `SubagentRecord[]` registry persists
  across calls; matches the registry's per-process
  lifetime).
- `submitToEnvoyHarness(input, signal)` delegates to
  `this.envoyHarnessSubmitter.submit(input, signal)` and
  returns the result.

### b1.3 — e2e B test at the registry seam ✓

The new "e2e B at registry seam" test exercises the
end-to-end flow at the **registry seam** (NOT through
`LocalCrossRuntimeSubmitter`, which only routes to the
bridge for `preferredRuntime: "openclaw"`):

1. Build a `LocalRuntimeRegistry` with a mock
   `buildSubagent` + a real `LocalMeshSubmitter` inside.
2. Call `registry.submitToEnvoyHarness(input, signal)`
   (the call an OpenClaw skill would make).
3. Verify the factory was called once with the input +
   the result flows back with the right
   `workerRuntime: "envoy-harness"` + `workerPeerId` +
   `costUsd` + `verdict`.

22/22 Phase 8 tests pass (7 factory + 15 registry). The
adapter's 103 tests still pass — the bridge seam is
unchanged.

## 2. b2 — OpenClaw's `BridgeToEnvoyHarness` skill (~2-3 days)

### Goal

OpenClaw can call `submitToEnvoyHarness` to spawn an
envoy-harness sub-agent. The end-to-end flow becomes:

```
OpenClaw model emits ask
  → OpenClaw's BridgeToEnvoyHarness skill fires
    → LocalRuntimeRegistry.submitToEnvoyHarness(input, signal)
      → LocalMeshSubmitter.submit(input, signal)
        → buildSubagent(input) → Agent
        → agent.run(input.objective)
      → SubagentResult back to OpenClaw
```

The skill is OpenClaw's "how to call another local
runtime" surface. It's a thin adapter that translates
OpenClaw's ask shape into the bridge's `SubagentInput`
shape, and translates the `SubagentResult` back into
OpenClaw's response shape.

### Open question — where the skill lives

OpenClaw's plugin surface in EnvoyMesh is in
`apps/node/src/` (peer of `node-service-impl.ts` —
see `node-service-setup-sponsor-friend.ts` for the
canonical pattern of a "cross-package skill"). The
OpenClaw runtime package itself is a thin subprocess
wrapper (`packages/openclaw-runtime/`), not the
skill surface. Two options for the skill:

- **(a) In OpenClaw-runtime:** add a new
  `bridge-to-envoy-harness.ts` skill module there.
  Would require adding `@envoymesh/envoy-harness-adapter`
  as a dep (the bridge exports the `LocalRuntimeBridge`
  type the skill needs).
- **(b) In envoy-harness side (EnvoyMesh):** add the
  skill in `apps/node/src/agent-runtime-envoy/`
  (peer of `runtime.ts`, which already imports the
  bridge). Matches the existing skill pattern
  (`setupSponsorFriend` + other cross-package skills
  in `apps/node/src/`).

**Recommendation (revised after b1 review, 2026-08-20):
(b) — skill lives in
`apps/node/src/agent-runtime-envoy/`.** The bridge
is already a dep of `apps/node` (Step 0+). The skill
module becomes a thin translation layer that:
1. Takes an OpenClaw ask (text prompt) +
   the host's `LocalRuntimeRegistry`.
2. Returns a `(prompt) => Promise<string>` closure
   that calls `bridge.submitToEnvoyHarness` +
   extracts the first text block.
3. Exports an `OpenClawToEnvoyHarnessBridge`
   interface for the type seam.

The wiring into OpenClaw's actual ask path
(when does the host call this skill instead of
the real `askOpenClaw`?) is a Step 5 concern
(signal-based opt-in). For b2 v0, the skill is
exposed but not auto-wired.

### Sub-chunks

| # | Action | Files | Commit |
|---|---|---|---|
| 1 | Add a `bridge-to-envoy-harness-skill.ts` module | `apps/node/src/agent-runtime-envoy/bridge-to-envoy-harness-skill.ts` | (squash w/ 2-4) |
| 2 | Add a typed `OpenClawToEnvoyHarnessBridge` interface (the ask → SubagentInput translation) | same file | (squash w/ 1) |
| 3 | Re-export the skill from `apps/node/src/agent-runtime-envoy/index.ts` | `apps/node/src/agent-runtime-envoy/index.ts` | (squash w/ 1) |
| 4 | Add unit tests (mock LocalRuntimeRegistry; verify translation + result flow) | `apps/node/test/agent-runtime-envoy-bridge-skill.test.ts` | (squash w/ 1) |

**Tests** (b2 acceptance):

1. Skill translates an OpenClaw ask (string prompt) into
   a `SubagentInput` (objective = prompt,
   `capabilityTag` = a configured value or
   `"envoy-harness-bridge"`,
   `costCeilingUsd` + `deadlineMs` from the OpenClaw
   ask's metadata).
2. Skill calls `LocalRuntimeRegistry.submitToEnvoyHarness`
   with the translated input.
3. Skill translates the `SubagentResult` back into
   OpenClaw's response shape (extract the first
   `text` content block; ignore the rest).
4. Skill handles `verdict.kind === "fail"` by
   throwing / returning an error (OpenClaw's surface
   is text-in/text-out; failures are errors, not
   silent empty strings).

### What b2 does NOT cover

- **The cross-verify path (Q4 A):** OpenClaw
  verifying an envoy-harness result is a separate
  concern (Q4 A = "envoy-writes + OpenClaw-verifies").
  That's Step 6 of the (B) plan, not Step 2.
- **The merged manifest (Step 4):** the openclaw
  skill's surface is independent of the node-level
  merged manifest. b2 only wires the call path.
- **Signal-based opt-in (Step 5):** the skill fires
  on demand (OpenClaw decides). Signal-based
  auto-routing is Step 5.

## 3. b3 — full `Agent` e2e with real `buildAgent` + `ModelAdapter` (~1 week)

### Goal

The mock `buildSubagent` in `LocalRuntimeRegistry` gets
replaced with a real factory that uses envoy-harness's
`defaultBuildSubagentFactory` + a real `ModelAdapter`
resolved from the host's runtime config. The end-to-end
e2e runs a real sub-agent with a real model.

### What changes

`apps/node/src/agent-runtime-envoy/factory.ts` already
has `resolveEnvoyHarnessProvider()` (Step 1) and a stub
`createEnvoyHarnessAdapter()`. b3 promotes the stub to
real:

1. The factory resolves the model adapter from
   `loadEnvoyHarnessRuntimeConfig()` + the provider
   helper (already done in Step 1).
2. The factory builds the `defaultBuildSubagentFactory`
   closure using:
   - `model: ModelAdapter` (from step 1)
   - `cwd: process.cwd()`
   - `permissionMode: "read-only"` (the sub-agent's
     own policy, NOT the requester's)
   - `systemPromptPrefix`: a Phase-8-specific prefix
     (e.g. "You are an envoy-harness sub-agent spawned
     from an OpenClaw parent. ...")
3. The factory wires the parent's session id
   (`parentSessionId`) into the sub-agent's
   `AgentOptions.subagentOf` so every trace event
   carries `subagentOf: <parentSessionId>`. (Already
   supported by `defaultBuildSubagentFactory`.)
4. The factory wires the parent's tracer so the
   sub-agent's `TraceEvent`s flow back to the parent
   (for progress streaming). (Already supported.)
5. The `LocalRuntimeRegistry` is constructed with the
   factory + the host's `workerPeerId` from
   `localNodeContext.peerId`.
6. The registry is passed to the `EnvoyHarnessAdapter`
   via the `meshSubmitter` option (the bridge's
   `LocalCrossRuntimeSubmitter` is the inner of the
   `EnvoyHarnessAdapter.meshSubmitter`).

### Real-Agent e2e test

Add an e2e test that:

1. Constructs a `LocalRuntimeRegistry` with a real
   `defaultBuildSubagentFactory` + a `FakeModel` (or
   a real model with a key).
2. Calls `registry.submitToEnvoyHarness(input, signal)`.
3. Verifies the sub-agent ran (via the trace events
   captured by the parent's tracer).
4. Verifies the result has the right `workerPeerId`,
   `workerRuntime: "envoy-harness"`, `costUsd > 0`
   (or 0 for `FakeModel`), `verdict.kind` is
   "pass" (or "fail" for error cases).
5. Verifies the sub-agent's `subagentOf` field
   contains the parent's session id.

### The chain-worker-executor wiring (the "real" caller)

The chain worker is the actual user of the
`EnvoyHarnessAdapter`. b3 wires the real
`EnvoyHarnessAdapter` (with the `LocalCrossRuntimeSubmitter`
+ the real `LocalRuntimeRegistry`) into
`createEnvoyHarnessChainSubtaskExecutor` in
`apps/node/src/chain-worker-executor.ts:182`.

Today, the executor throws the `envoy_harness_stub_phase_8_step_1`
error from `askEnvoyHarness` (Step 1 stub). b3 replaces
that throw with a real call to
`LocalRuntimeRegistry.submitToEnvoyHarness(input, signal)`.

The chain worker creates the `LocalRuntimeRegistry` once
at construction (per chain worker instance) and injects
the `buildSubagent` factory (closed over the
`ModelAdapter` from `loadEnvoyHarnessRuntimeConfig()`)
+ the `workerPeerId` (from
`localNodeContext.peerId`).

### Sub-chunks

| # | Action | Files | Commit |
|---|---|---|---|
| 1 | Build the real `buildSubagent` factory using `defaultBuildSubagentFactory` | `apps/node/src/agent-runtime-envoy/factory.ts` | (squash w/ 2) |
| 2 | Wire the factory into `LocalRuntimeRegistry` at the chain worker | `apps/node/src/chain-worker-executor.ts` | (squash w/ 1) |
| 3 | Wire the real `EnvoyHarnessAdapter` (with `LocalCrossRuntimeSubmitter` + `LocalRuntimeRegistry`) into the chain worker | `apps/node/src/chain-worker-executor.ts` | `feat(phase-8): Step 2 / b3 — chain-worker-executor uses real EnvoyHarnessAdapter` |
| 4 | Add e2e test with `FakeModel` (keyless) | `apps/node/test/chain-worker-executor-envoy-harness.test.ts` | (squash w/ 3) |
| 5 | Add e2e test with real model (live; needs `DEEPSEEK_API_KEY` or equivalent) | `apps/node/test/chain-worker-executor-envoy-harness.live.test.ts` | (squash w/ 3) |

**Tests** (b3 acceptance):

1. The chain worker creates a real
   `EnvoyHarnessAdapter` (no stub throw).
2. The factory uses the host's `ModelAdapter`.
3. The sub-agent's `subagentOf` field carries the
   parent's session id.
4. The sub-agent's trace events flow to the parent's
   tracer.
5. The result flows back to the chain worker
   unchanged (same `MeshSubmitter` contract).

### What b3 does NOT cover

- **b2 (OpenClaw skill):** b3 is the envoy-harness
  side. The OpenClaw side stays a stub until b2
  lands. The two are independent.
- **Cross-verify (Step 6):** the result is delivered
  as-is; no cross-verify yet. Future.
- **Signal-based opt-in (Step 5):** b3 keeps
  `isEnvoyHarnessReady() === false` as the default
  (Step 1 behavior). Step 5 changes that.

## 4. b3.live — model inheritance + live test (~1 day)

### Goal

Two small follow-ups to b3 (kept together because
they're closely related and share the same test
harness):

1. **Model inheritance from EnvoyMesh:** the
   `loadEnvoyHarnessRuntimeConfig` should default to
   EnvoyMesh's configured model (per
   `ModelProviderConfig` in `node-config.json`) when
   the user hasn't set `ENVOY_HARNESS_MODEL`. This
   matches the OpenClaw pattern: the host configures
   its LLM once; both runtimes (OpenClaw +
   envoy-harness) use it as the default; each can
   override with its own env var.

2. **Live test for b3:** end-to-end test that
   exercises the real `EnvoyHarnessAdapter` with a
   real `createProviderAdapter` + a real model.
   Self-skips when the API key env var is missing
   (per the `apps/node/test/phase18-minimax-config.ts`
   pattern).

### Why these are together

The live test needs a real model. The model
inheritance change makes the live test more
realistic (the host's actual model is what the
test uses, not just the hard-coded
`deepseek:deepseek-chat` default). They share the
"envoy-harness talks to a real model" theme.

### 4.1 Model inheritance

**Current behavior:** `loadEnvoyHarnessRuntimeConfig`
reads `ENVOY_HARNESS_MODEL` env var, defaulting to
`deepseek:deepseek-chat`. The host (EnvoyMesh's
`node-service-impl.ts`) passes no context.

**Target behavior:** the host passes its configured
model (from `ModelProviderConfig`) as a parameter.
The config function's precedence:

```
ENVOY_HARNESS_MODEL (env var)  >  hostModel (DI)  >  "deepseek:deepseek-chat" (default)
```

**Implementation:**

- `loadEnvoyHarnessRuntimeConfig({ hostModel?: string })` —
  new optional parameter. The function stays a pure
  read of `process.env` + the injected `hostModel`.
  No `getNodeConfig()` inside (the host injects).
- A small helper
  `resolveEnvoyHarnessHostModel(modelProviders: ModelProviderConfig): string | undefined`
  lives in `model.ts` (peer of `resolveEnvoyHarnessProvider`).
  Maps the host's `ModelProviderConfig` to
  `<provider>:<model>`. Returns `undefined` for
  unsupported modes (e.g. `mock`, `litellm` —
  envoy-harness doesn't have a `litellm` adapter
  today; use the `openai` adapter with the same
  endpoint for v0, or fall back to the default).
- `node-service-impl.ts` reads `getNodeConfig()` →
  `modelProviders` → `resolveEnvoyHarnessHostModel`
  → passes to `loadEnvoyHarnessRuntimeConfig`.

**Provider mapping (host → envoy-harness):**

| Host `mode` | envoy-harness provider | Notes |
|---|---|---|
| `"openai"` | `openai:<modelName>` | Direct |
| `"anthropic"` | `anthropic:<modelName>` | Direct |
| `"ollama"` | `ollama:<modelName>` | Direct (keyless) |
| `"litellm"` | `openai:<modelName>` with custom endpoint | Reuse the `openai` adapter; the endpoint is passed via `OpenAIAdapter.baseUrl` |
| `"mock"` | `undefined` (not supported) | `ready: false` |
| `"disabled"` | `undefined` (not supported) | `ready: false` |

**Why `litellm` → `openai`:** envoy-harness has
`openai` and `anthropic` adapters. `litellm` is
OpenAI-compatible; we can use the `openai` adapter
with a custom `baseUrl` (already supported by
`OpenAIAdapter`). For v0, the host's `litellm`
config is used with the `openai` provider; future:
add a `litellm` adapter if needed.

### 4.2 Live test

**File:** `apps/node/test/agent-runtime-envoy-runtime.live.test.ts`

**Self-skip condition:** `ENVOY_HARNESS_LIVE_TESTS=1`
opt-in + `DEEPSEEK_API_KEY` (or `ENVOY_HARNESS_API_KEY`)
env var present. Otherwise the test prints a skip
message and returns (no `describe` failure).

**What it tests:**

1. Construct `createRealEnvoyHarnessRuntime` with
   the real `createProviderAdapter` (no test
   `modelFactory`).
2. Call `runtime.ask("Say hello in 5 words")` with
   a real `signal` + `deadlineMs` (e.g. 30s).
3. Verify the result is non-empty text.
4. Verify `result.workerRuntime === "envoy-harness"`
   (stamped by the bridge's `localToWireResult`).
5. (Optional) Verify the cost was reported (`> 0`
   or `0` for free models).

**Why `agent-runtime-envoy-runtime.live.test.ts`
and not `*.test.ts`:** the test file naming pattern
in `apps/node/test/` is `<feature>.live.test.ts`
for live tests. The vitest config (or the user's
test runner) may run these separately. The
`<name>.live.test.ts` suffix is the canonical
"this needs a real API key" marker.

**Why opt-in via `ENVOY_HARNESS_LIVE_TESTS=1`:**
the test makes real network calls. Running
unconditionally would burn quota in CI. The opt-in
mirrors `ENVOY_PHASE18_LIVE_TESTS=1` (the existing
Phase 18 live test pattern).

### 4.3 Sub-chunks

| # | Action | Files | Commit |
|---|---|---|---|
| 1 | Add `hostModel` parameter to `loadEnvoyHarnessRuntimeConfig` | `apps/node/src/agent-runtime-envoy/config.ts` | (squash w/ 2-4) |
| 2 | Add `resolveEnvoyHarnessHostModel` helper to `model.ts` | `apps/node/src/agent-runtime-envoy/model.ts` | (squash w/ 1) |
| 3 | Wire `hostModel` from `node-service-impl.ts` (read `getNodeConfig().modelProviders` → helper → config) | `apps/node/src/node-service-impl.ts` | (squash w/ 1) |
| 4 | Add unit tests for model inheritance (3 cases: env override / host model / default) | `apps/node/test/agent-runtime-envoy-config.test.ts` (new) | (squash w/ 1) |
| 5 | Add live test (self-skip when no API key) | `apps/node/test/agent-runtime-envoy-runtime.live.test.ts` (new) | (squash w/ 1) |

### 4.4 What b3.live does NOT cover

- **The litellm adapter (Step 6+ if needed):** for
  v0, `litellm` mode reuses the `openai` adapter
  with a custom `baseUrl`. If the host needs a
  dedicated `litellm` adapter (e.g. for streaming
  differences), that's a future chunk.
- **The model UI in the Tauri settings:** Step 5.
  b3.live only changes the readiness probe; the
  UI wiring is independent.
- **Per-node model override via `settings.json`:**
  Step 5. b3.live reads the host's model via the
  same `getNodeConfig()` path; the user's ability
  to override it from the UI is Step 5.

## 6. Order

**Recommended order: b3 first, then b2.**

Rationale:

- **b3 is the "real" end of the seam we already
  built.** It's the envoy-harness side becoming
  real (with a real model). It's symmetric to b1
  in the sense that b1 added the seam and b3 fills
  it in on one side.
- **b2 is the OpenClaw side of the seam.** It
  depends on b3 to have a real `LocalRuntimeRegistry`
  to talk to (otherwise the skill calls a stub).
  Once b3 is real, b2 is a small skill wiring.
- **Both can be done independently** but b3
  unblocks the e2e test in b2 (the b2 e2e can
  test the skill → registry → real Agent path).
- **Test-by-test:** b3's "real-Agent e2e" with a
  `FakeModel` (keyless) is the highest-signal
  test we can add for the whole Phase 8. b2's
  skill is a thin layer on top.

**Alternative order: b2 first, then b3.** B2 is
smaller (2-3 days) and produces a self-contained
OpenClaw skill; b3 is bigger (1 week) and needs
the factory + chain-worker wiring. If a smaller
commit cadence is preferred, do b2 first to keep
the diff small. Either order works.

## 7. Open questions

1. **What `capabilityTag` does b2 use?** The
   `SubagentInput.capabilityTag` is a free-form
   string. The bridge doesn't validate it. Options:
   - `"envoy-harness-bridge"` (literal — the
     tag means "this came from the openclaw bridge")
   - `"openclaw-spawn"` (the inverse)
   - Configurable per skill instance
   **Recommendation: literal `"envoy-harness-bridge"`.**
   Simple, doesn't add config surface.

2. **What's the cost ceiling for b2's sub-agents?**
   OpenClaw's ask has no cost ceiling concept.
   Options:
   - Fixed default (e.g. $0.50 per sub-agent)
   - Configurable per skill instance
   - Pass through from the OpenClaw ask (if it
     has metadata)
   **Recommendation (revised after user feedback, 2026-08-20):
   hard-code `costCeilingUsd: 0` for v0 (= "no cap" per the
   harness's `AgentOptions.maxCostUsd` contract).** v0 is
   early adoption — we don't want a $0.50 arbitrary limit
   to block the first users. The DI seam stays open:
   `CreateBridgeToEnvoyHarnessSkillOptions.costCeilingUsd?: number`
   with default `0`. Step 5+ (Tauri settings UI) can
   inject a per-node or per-skill ceiling from
   `settings.json`; the skill's behavior is unchanged.
   The deadline (separate concern) keeps a safety net
   default of `5 * 60_000` (5 min) so a hanging sub-agent
   doesn't tie up the OpenClaw ask path forever.

3. **What `permissionMode` does the sub-agent get?**
   The sub-agent's permission is its own
   (invariant #10 — sub-agent permission is the
   worker's own, not the requester's). Default:
   `"read-only"`. The chain worker can override
   later (e.g. for "writable sub-agents") but v0
   is read-only.

4. **Does b2 need a new OpenClaw permission?**
   Today, OpenClaw's permission model is
   user-vs-skill. A new skill that spawns a
   sub-agent may need a new permission
   (e.g. "spawn_envoy_harness_subagent"). v0:
   skip — the skill is built-in, not user-
   installable. Future: add a permission
   gate if a user can disable the skill.

## 8. References

- Design doc: `docs/agent-harness-integration.md`
  §Step 2 (page 8), Q1-Q5 (page 14+),
  cooperation model A+B+E.
- Implementation guide: `docs/envoy-harness-integration-EnvoyMesh.md`
  §4 dev flow, §5 release flow, §6 procedure.
- Phase 8 Step 2 b1 commit (this branch): the
  `LocalRuntimeRegistry` rewrite + the e2e B
  test at the registry seam.
- `LocalMeshSubmitter`:
  `envoy-harness/packages/envoy-harness/src/subagent/local-mesh-submitter.ts`
- `defaultBuildSubagentFactory`: same file,
  lower section. The factory is the host's
  primary seam for "how to construct a sub-agent
  on this runtime".
- `LocalCrossRuntimeSubmitter`:
  `envoy-harness/packages/envoy-harness-adapter/src/local-cross-runtime-submitter.ts`
- `LocalRuntimeBridge`: same file, the bridge
  interface.

## 9. Change log

- **2026-08-20 (initial draft):** b2 + b3 plan
  written. b3 recommended first; b2 follows once
  the registry has a real `buildSubagent` factory
  to talk to. Open questions §5 documented
  (capabilityTag, cost ceiling, permission,
  openclaw permission).
- **2026-08-20 (b1, b2, b3 DONE):** §1 documents
  b1 status (LocalRuntimeRegistry.submitToEnvoyHarness
  is real, e2e B test at the registry seam). §2
  revised: skill location = `apps/node/src/`
  (matches the `setupSponsorFriend` pattern), cost
  ceiling = `0` for v0 (per user feedback "at the
  beginning, we may ignore it") with a DI seam
  for Step 5+ config. §3 documents the b3 done
  state (real `askEnvoyHarness`, 38/38 Phase 8
  EnvoyMesh + 105/105 bridge tests pass).
- **2026-08-20 (b3.live — IN PROGRESS):** §4 added.
  Two follow-ups to b3: (a) model inheritance from
  EnvoyMesh's `ModelProviderConfig` (envoy-harness
  defaults to the host's model, like OpenClaw does;
  `ENVOY_HARNESS_MODEL` env var is the explicit
  override; `litellm` reuses the `openai` adapter);
  (b) live test for b3 (`agent-runtime-envoy-runtime.live.test.ts`,
  opt-in via `ENVOY_HARNESS_LIVE_TESTS=1`, self-skips
  without a real `DEEPSEEK_API_KEY`). Provider
  mapping table documents the host → envoy-harness
  translation.
