# envoy-harness integration — v1.4 sub-plan (Tauri UI for opt-in toggle + signal-routed badge)

> **Status:** ✅ **DONE** (2026-08-21). 1 commit on
> `envoy_harness_integration` branch (the user
> delegated commit; bundled v1.4.1 + v1.4.2 +
> v1.4.3 into a single commit at the end of v1.4).
> 88 new tests (16 node-config-loader + 12
> node-config-store-v1-4 + 11 chain-verify-loop
> additions + 4 run-loop e2e + 15
> node-service-v1-4 settings API + 30 misc
> regression checks) + 277 pre-existing tests
> regression-clean on the affected paths. No new
> type errors (pre-existing multiformats/ArrayBuffer
> conflict in `packages/network/src/index.ts:2791`
> is unchanged).
>
> **What this doc covers:** v1.4 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 are
> done + pushed. v1.4 gives owners **visibility
> into the routing decisions** v1.1 + v1.2 + v1.3
> make — opt-in toggle, verifyMode dropdown, and
> the signal-routed badge. The actual Tauri UI
> lives in the Tauri monorepo; v1.4 ships the
> backend + a design doc (Q5 default — backend +
> design doc only).

## 1. Goal

**The Tauri Social UI gets the affordances to:
1. Toggle the per-node signal-based opt-in
   (currently `ENVOY_HARNESS_SIGNAL_OPT_IN=disabled`
   env var).
2. Set the per-node `verifyMode` default
   (currently `defaultVerifyModeForWorker(runtime)`
   — a fixed per-runtime value).
3. Show a "routed to skill X" badge in the chat
   reply (data already exposed by v1.2's
   `targetSkill` + `routingReason: "signal-skill"`).
4. Show a status indicator (mesh / EH ready / opt-in
   state) for quick troubleshooting.**

**What this chunk does:**
- **Backend (Node side, this PR):** add
  `signalOptIn` + `verifyModeDefault` to the
  persisted node config. Add Tauri settings API
  methods (`setSignalOptIn` / `getSignalOptIn` /
  `setVerifyModeDefault` / `getVerifyModeDefault`).
  Add a Tauri UI design doc (in `docs/`) for the
  team to pick up.
- **Tauri team (separate work):** build the
  Settings panel + the chat UI badge. The Tauri
  UI calls the new settings API; the chat UI
  renders the badge from the existing
  `OwnerAgentTurnResult` fields (no API change
  needed for the badge — v1.2's `targetSkill` +
  `routingReason` are already exposed).

## 2. Existing pieces (what we build on)

### 2.1 v0 mechanism — env-var opt-in

**File:** `apps/node/src/user-prompt-router.ts:534-540`
(`readSignalOptInEnv`)

The v0 router reads `process.env.ENVOY_HARNESS_SIGNAL_OPT_IN`
at the call site. The host threads the value
through as `input.signalOptIn`. Default = enabled.

**The v0 limitation:** the env var is process-wide.
Restart the node process → env var read again.
No UI affordance; owners have to set the env var
in the Tauri settings (manually editing the launch
config).

**The v1.4 change:** the persisted config
overrides the env var (with the env var as
fallback). The Tauri UI writes the persisted
config via a new settings API.

### 2.2 v0 mechanism — per-runtime verifyMode

**File:** `apps/node/src/chain-verify-loop.ts`
(`defaultVerifyModeForWorker(runtime)`)

The chain-verify-loop has a fixed per-runtime
default: `envoy-harness` → `"cross-runtime"`,
`openclaw` / `ext` → `"rule-only"`. The Team-job
author can override per-ChainMandate (Step 6
added `ChainMandate.verifyMode`).

**The v1.4 change:** the persisted config
overrides the per-runtime default. The Tauri UI
lets the owner pick "strict" / "cross" / "rule-only"
once, and it applies to all Team jobs on the node
(unless the job author overrides per-mandate).

### 2.3 The `OwnerAgentTurnResult` API (v1.2 + v1.3)

**File:** `packages/api/src/owner-agent-loop.ts`

The result already exposes:
- `modelUsed: "openclaw" | "envoy-harness" | "native" | "scripted-tutor"`
- `routingSignals: ReadonlyArray<string>`
- `routingReason: "default" | "signal" | "signal-skill" | "envoy-harness-unready" | "opt-in-disabled"`
- `targetSkill?: string`

**The v1.4 Tauri UI uses these directly.** No
new result fields. The Tauri UI renders:
- "Routed to `setup-sponsor-friend`" (when `routingReason: "signal-skill"` + `targetSkill: "setup-sponsor-friend"`)
- "Routed by `mesh`" (when `routingReason: "signal"` + `routingSignals: ["mesh"]`)
- "OpenClaw (default)" (when `routingReason: "default"`)
- "envoy-harness not ready" (when `routingReason: "envoy-harness-unready"`)
- "Opt-in disabled" (when `routingReason: "opt-in-disabled"`)

## 3. Design

### 3.1 Persisted config schema

**File:** `apps/node/src/node-config-store.ts` (modify)

The existing `PersistedNodeConfig` type gets
two new fields:

```ts
export interface PersistedNodeConfig {
  // ... existing fields ...

  /**
   * Phase 8 / v1.4 — per-node opt-in flag for the
   * signal router. When `"disabled"`, the router
   * never picks envoy-harness regardless of
   * signals. Default (when undefined): use the
   * env var (`ENVOY_HARNESS_SIGNAL_OPT_IN`) or
   * the implicit default (`"enabled"`).
   */
  signalOptIn?: "enabled" | "disabled";

  /**
   * Phase 8 / v1.4 — per-node default for the
   * chain verify mode. Overrides the per-runtime
   * default (`defaultVerifyModeForWorker`).
   * Default (when undefined): use the per-runtime
   * default.
   */
  verifyModeDefault?:
    | "rule-only"
    | "cross-runtime"
    | "cross-runtime-strict";
}
```

**Why `undefined` vs explicit `"enabled"` /
`"disabled"`:** the persisted config is
additive. An existing node without these fields
(undefined) keeps its current behavior (env var
+ per-runtime default). The Tauri UI sets the
field explicitly when the owner toggles the
switch.

### 3.2 The host wiring — `readEffectiveSignalOptIn()`

**File:** `apps/node/src/node-config-loader.ts` (modify)

```ts
/**
 * Read the effective signal opt-in flag for
 * the current node. Order of precedence:
 * 1. The persisted config (`nodeConfig.signalOptIn`)
 *    when the field is set.
 * 2. The env var (`ENVOY_HARNESS_SIGNAL_OPT_IN`).
 * 3. The implicit default (`"enabled"`).
 *
 * The persisted config takes precedence over the
 * env var so the Tauri UI can override the env
 * var's one-time set with a durable per-node
 * value. The env var is still useful for
 * headless / dev / CI setups where the Tauri UI
 * isn't available.
 */
export function readEffectiveSignalOptIn(
  nodeConfig: PersistedNodeConfig | undefined,
): "enabled" | "disabled" {
  if (nodeConfig?.signalOptIn !== undefined) {
    return nodeConfig.signalOptIn;
  }
  return readSignalOptInEnv();
}
```

The current call site (`node-service-impl-service-deps.ts:556`,
`signalOptIn: readSignalOptInEnv()`) is updated
to:
```ts
signalOptIn: readEffectiveSignalOptIn(host.getNodeConfig()),
```

This is a 1-line change; the env-var fallback
is preserved for v0 setups.

### 3.3 The host wiring — `readEffectiveVerifyModeDefault()`

**File:** `apps/node/src/node-config-loader.ts` (modify)

```ts
/**
 * Read the effective verify-mode default for
 * a given runtime. Order of precedence:
 * 1. The persisted config (`nodeConfig.verifyModeDefault`)
 *    when the field is set.
 * 2. The per-runtime default
 *    (`defaultVerifyModeForWorker(runtime)`).
 *
 * The persisted config takes precedence over the
 * per-runtime default so the Tauri UI can set a
 * node-wide override.
 */
export function readEffectiveVerifyModeDefault(
  nodeConfig: PersistedNodeConfig | undefined,
  runtime: AgentRuntime,
): VerifyMode {
  if (nodeConfig?.verifyModeDefault !== undefined) {
    return nodeConfig.verifyModeDefault;
  }
  return defaultVerifyModeForWorker(runtime);
}
```

The call site in `chain-verify-loop.ts` is updated
to read the effective value:
```ts
const verifyMode = chainMandate.verifyMode
  ?? readEffectiveVerifyModeDefault(
    getNodeConfig(),
    workerRuntime,
  );
```

### 3.4 The Tauri settings API

**File:** `packages/api/src/node-service.ts` (modify)

```ts
export interface NodeService {
  // ... existing methods ...

  /**
   * Phase 8 / v1.4 — get the effective signal
   * opt-in flag (resolved from persisted config
   * + env var). Tauri UI calls this to show the
   * current state in the Settings panel.
   */
  getSignalOptIn(): Promise<"enabled" | "disabled">;

  /**
   * Phase 8 / v1.4 — set the persisted signal
   * opt-in flag. When the owner toggles the
   * switch in the Settings panel, the Tauri UI
   * calls this. The host persists the value +
   * returns the new effective state.
   */
  setSignalOptIn(value: "enabled" | "disabled"): Promise<"enabled" | "disabled">;

  /**
   * Phase 8 / v1.4 — get the effective verify-mode
   * default for a given runtime.
   */
  getVerifyModeDefault(runtime: AgentRuntime): Promise<VerifyMode>;

  /**
   * Phase 8 / v1.4 — set the persisted verify-mode
   * default. Applies to all runtimes on the node
   * unless per-ChainMandate overrides.
   */
  setVerifyModeDefault(
    value: VerifyMode | undefined,
  ): Promise<VerifyMode | undefined>;
}
```

The Tauri side just calls these. The actual
persistence + resolve logic is on the Node host.

### 3.5 The Tauri UI design doc

**File:** `docs/taui-agent-routing-settings.md` (NEW)

A design doc for the Tauri team:

- **Settings panel:** opt-in toggle (signal-based
  routing) + verifyMode dropdown (rule-only /
  cross-runtime / cross-runtime-strict). Both are
  per-node; the persisted value survives restart.
- **Chat UI badge:** when `routingReason` is
  `signal` or `signal-skill`, show a small badge
  above the reply: "Routed to `setup-sponsor-friend`"
  / "Routed by `mesh`". The badge uses the existing
  `routingReason` + `targetSkill` + `routingSignals`
  fields.
- **Status indicator:** a small icon in the chat
  header showing mesh state + envoy-harness
  readiness + opt-in state. The data is read from
  the existing `getNodeStatus` + `isEnvoyHarnessReady`
  + `getSignalOptIn` methods.

The doc describes the data model + the UI affordances
+ the API surface the Tauri UI uses. The Tauri team
picks up the implementation in their own workstream.

### 3.6 Test strategy

**Unit tests in `node-config-loader.test.ts` (NEW):**
- `readEffectiveSignalOptIn(undefined)` → env var value
- `readEffectiveSignalOptIn({ signalOptIn: "enabled" })` → `"enabled"`
- `readEffectiveSignalOptIn({ signalOptIn: "disabled" })` → `"disabled"`
- Persisted wins over env var (when both set)
- `readEffectiveVerifyModeDefault(undefined, "envoy-harness")` → per-runtime default
- `readEffectiveVerifyModeDefault({ verifyModeDefault: "rule-only" }, "envoy-harness")` → `"rule-only"` (overrides per-runtime)
- `readEffectiveVerifyModeDefault({ verifyModeDefault: undefined }, "envoy-harness")` → per-runtime default

**E2E tests in `node-service.test.ts` (modify):**
- `getSignalOptIn` returns the env-var default when no persisted value
- `setSignalOptIn("disabled")` persists + the next call returns `"disabled"`
- `getVerifyModeDefault("envoy-harness")` returns `"cross-runtime"` by default
- `setVerifyModeDefault("rule-only")` overrides the per-runtime default

**Persisted config test in `node-config-store.test.ts` (modify):**
- `signalOptIn` field round-trips (save + load)
- `verifyModeDefault` field round-trips

## 4. Design questions for team sign-off

> These are the choices that need a decision before implementation
> starts. **Defaults proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Persisted config schema location | **Flat** — `NodeConfig.signalOptIn` + `NodeConfig.verifyModeDefault` | Nested — `NodeConfig.agentRouting.{signalOptIn, verifyModeDefault}` (cleaner separation, breaks existing flat pattern) |
| **Q2** | Env var override behavior | **Persisted wins, env var as fallback** — when the Tauri UI sets the persisted value, the env var is ignored | Env var always wins (deprecated the persisted value when env var is set); or persisted always wins (env var deprecated) |
| **Q3** | verifyModeDefault field shape | **Single value** — `NodeConfig.verifyModeDefault: VerifyMode` (applies to all runtimes) | Per-runtime map — `NodeConfig.verifyModeDefaultByRuntime: Record<AgentRuntime, VerifyMode>` |
| **Q4** | Status banner data source | **Use the existing `OwnerAgentTurnResult` fields** — `routingReason` + `targetSkill` + `routingSignals` + `modelUsed` | Add a new `routingStatus` field with a structured payload |
| **Q5** | Tauri UI scope (this chunk) | **Backend + design doc only** — the Tauri team picks up the actual UI in their own workstream | Bundle the Tauri UI work in this chunk (the Tauri team commits in the same PR) |
| **Q6** | Backward compatibility | **`undefined` = use existing default** — existing nodes without the new fields keep their current behavior | Force every node to have explicit values (migration step that prompts the owner on first launch) |

**Defaults at-default (Q1-Q6):** I have no strong
opinion on Q1 (flat is consistent with the existing
pattern; nested is cleaner — pick one), Q2 (the
default is the most user-friendly — Tauri UI wins
when set), Q3 (single value is simpler; per-runtime
is more flexible — pick one based on whether owners
will want per-runtime overrides), Q4 (existing fields
are enough; new field is additive), Q5 (parallel
workstreams are cleaner), Q6 (`undefined` default
preserves backward compat; force-everywhere is more
aggressive).

## 5. Plan

### Sub-chunk v1.4.1 — persisted config + helpers (1 commit)

- Modify: `apps/node/src/node-config-store.ts` — add
  `signalOptIn?` + `verifyModeDefault?` to
  `PersistedNodeConfig`.
- New: `apps/node/src/node-config-loader.ts` —
  `readEffectiveSignalOptIn(nodeConfig)` +
  `readEffectiveVerifyModeDefault(nodeConfig, runtime)`
  + `defaultVerifyModeForWorker` re-export.
- Modify: `apps/node/src/node-service-impl-service-deps.ts` —
  `signalOptIn: readEffectiveSignalOptIn(host.getNodeConfig())`
  + `verifyMode: readEffectiveVerifyModeDefault(...)`
  on the relevant context.
- New: `apps/node/test/node-config-loader.test.ts` —
  ~10 unit tests.

### Sub-chunk v1.4.2 — Tauri settings API (1 commit)

- Modify: `packages/api/src/node-service.ts` —
  add `getSignalOptIn` / `setSignalOptIn` /
  `getVerifyModeDefault` / `setVerifyModeDefault`
  to the `NodeService` interface.
- Modify: `apps/node/src/node-service-impl.ts` —
  implement the 4 new methods. `setSignalOptIn` /
  `setVerifyModeDefault` calls the persisted
  config store's `saveNodeConfig` + returns the
  new effective state.
- Modify: `apps/node/test/node-service.test.ts` —
  ~4 e2e tests for the new API.

### Sub-chunk v1.4.3 — Tauri UI design doc (1 commit)

- New: `docs/taui-agent-routing-settings.md` —
  design doc for the Tauri team (Settings panel
  + chat UI badge + status indicator).
- Modify: `docs/agent-harness-integration.md` —
  add v1.4 status to §9 change log.
- Modify: `docs/agent-network-engine.md` §2.2.2 —
  note v1.4's Tauri UI affordances.
- Modify: `docs/agent-harness-integration-v1-3.md` —
  status note: v1.4 adds the Tauri UI layer.
- New: `docs/agent-harness-integration-v1-4.md` —
  this doc gets the "DONE" stamp.

**Total: 3 sub-chunks, bundled into 1 commit at the
end of v1.4 (per the v1.1 + v1.2 + v1.3 commit pattern).**
On `envoy_harness_integration` branch.

## 6. Out of scope (deferred)

- **The Tauri UI implementation** (Q5 default) —
  the actual Settings panel + chat badge code
  lives in the Tauri monorepo. v1.4 ships the
  backend + a design doc. The Tauri team picks
  up the implementation in their own workstream.
- **Tauri-side persisted config** — the Tauri
  side uses the existing `@envoymesh/api`
  client to call the new methods. The Tauri
  side doesn't persist anything; the Node host
  is the source of truth.
- **Real-time opt-in state push** — when the
  Tauri UI toggles the switch, the change takes
  effect on the next `routeUserPrompt` call. We
  don't push a real-time event to the chat
  (the user would have to re-type to see the new
  state). Future: an event stream.
- **Per-runtime opt-in** (not just per-node) —
  v1.4's toggle is per-node. Per-runtime is a
  future chunk (Q3 alternative; deferred).

## 7. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — Q3 routing, Q4 cross-verify, Q5
  node config)
- [`agent-harness-integration-v1-1.md`](./agent-harness-integration-v1-1.md)
  (the v1.1 dynamic vocabulary — owner opt-in)
- [`agent-harness-integration-v1-2.md`](./agent-harness-integration-v1-2.md)
  (the v1.2 per-skill routing — `targetSkill` +
  `routingReason: "signal-skill"` for the chat badge)
- [`agent-harness-integration-v1-3.md`](./agent-harness-integration-v1-3.md)
  (the v1.3 B-class formatter — what the chat
  user sees for B-class skills)
- [`user-prompt-router.ts`](../../apps/node/src/user-prompt-router.ts)
  (the v0 router — `readSignalOptInEnv` for the
  env-var fallback)
- [`chain-verify-loop.ts`](../../apps/node/src/chain-verify-loop.ts)
  (the v0 verifyMode default — `defaultVerifyModeForWorker`)
- [`agent-network.ts`](../../packages/protocol/src/agent-network.ts)
  (the `VerifyMode` type — `rule-only` /
  `cross-runtime` / `cross-runtime-strict`)
- [`node-config-store.ts`](../../apps/node/src/node-config-store.ts)
  (the `PersistedNodeConfig` type)
- [`owner-agent-loop.ts`](../../packages/api/src/owner-agent-loop.ts)
  (the `OwnerAgentTurnResult` — `routingReason` +
  `targetSkill` + `modelUsed` for the chat badge)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Persisted config schema location | **Flat** — `NodeConfig.signalOptIn` + `NodeConfig.verifyModeDefault` (matches the existing `NodeConfig` flat pattern) |
| **Q2** | Env var override behavior | **Persisted wins, env var as fallback** — when the Tauri UI sets the persisted value, the env var is ignored (the env var is still useful for headless / dev / CI where the Tauri UI isn't available) |
| **Q3** | `verifyModeDefault` field shape | **Single value** — `NodeConfig.verifyModeDefault: VerifyMode` (applies to all runtimes; per-runtime overrides are a v1.4+ future) |
| **Q4** | Status banner data source | **Use the existing `OwnerAgentTurnResult` fields** — `routingReason` + `targetSkill` + `routingSignals` + `modelUsed`. The v1.2 + v1.3 chat reply is the source of truth for the chat user. **No new result fields** for v1.4. |
| **Q5** | Tauri UI scope (this chunk) | **Backend + design doc only** — the Tauri team picks up the actual UI in their own workstream. The design doc is `docs/taui-agent-routing-settings.md` (NEW). |
| **Q6** | Backward compatibility | **`undefined` = use existing default** — existing nodes without the new fields keep their current behavior (env var + per-runtime default). No migration step that prompts the owner on first launch. |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.4.1 + v1.4.2 + v1.4.3 bundled | 1 commit on `envoy_harness_integration` branch. v1.4.1: persisted config (`signalOptIn` + `verifyModeDefault` on `PersistedNodeConfig`) + new `node-config-loader.ts` (`readEffectiveSignalOptIn` + `readEffectiveVerifyModeDefault`) + `NodeConfigStore.peek()` sync accessor + `chain-verify-loop` reads the per-node default via a new `getNodeConfig` dep + the `node-service-impl-service-deps` wires `readEffectiveSignalOptIn(host._configStore.peek())` into the signal-router context + 39 new unit tests. v1.4.2: Tauri settings API (`getSignalOptIn` / `setSignalOptIn` / `getVerifyModeDefault` / `setVerifyModeDefault` on `NodeService` + `NodeServiceImpl`) + 15 new unit tests. v1.4.3: doc closeout (this DONE stamp + `agent-harness-integration.md` change log entry + `agent-network-engine.md` §2.2.2 update + `agent-harness-integration-v1-3.md` status note + NEW `docs/taui-agent-routing-settings.md` design doc). |

**Total:** 1 commit, 88 new tests (16 + 12 + 11 + 4 + 15 + 30 misc), 277 pre-existing tests regression-clean on the affected paths. No new type errors. The **end-user-first** principle from `AGENTS.md` drove the Tauri UI's label copy: "Auto-route mesh queries" (not "signalOptIn=enabled") + "Light" / "Standard" / "Strict" (not the raw `VerifyMode` enum values). Internal values stay in the audit log + the `getNodeConfig()` payload.

## What landed in v1.4 (key file references)

**Backend (Node side):**
- `apps/node/src/node-config-store.ts` — `signalOptIn?` + `verifyModeDefault?` on `PersistedNodeConfig` + `peek()` on `NodeConfigStore`
- `apps/node/src/node-config-loader.ts` (NEW) — `readEffectiveSignalOptIn` + `readEffectiveVerifyModeDefault` + `defaultVerifyModeForWorker` re-export
- `apps/node/src/chain-verify-loop.ts` — `getNodeConfig?` dep on `ChainVerifyLoopDeps` + `effectiveVerifyMode?` opt on `shouldEscalateToCrossAgent` + the loop resolves the effective verifyMode (per-mandate → per-node → per-runtime)
- `apps/node/src/node-service-chain-orchestration.ts` — `getPersistedNodeConfigSync?()` on `ChainOrchestrationContext` + the `chainVerify` deps wire it
- `apps/node/src/node-service-impl-service-deps.ts` — `signalOptIn: readEffectiveSignalOptIn(host._configStore.peek())` (was `readSignalOptInEnv()`)
- `apps/node/src/node-service-impl.ts` — 4 new `NodeService` methods: `getSignalOptIn` / `setSignalOptIn` / `getVerifyModeDefault` / `setVerifyModeDefault`
- `packages/api/src/node-service.ts` — the 4 new methods on the `NodeService` interface
- `packages/api/src/ws-protocol.ts` — `signalOptIn?` + `verifyModeDefault?` on `NodeConfig` + `UpdateNodeConfigParams`

**Tests:**
- `apps/node/test/node-config-loader.test.ts` (NEW, 16 unit tests)
- `apps/node/test/node-config-store-v1-4.test.ts` (NEW, 12 unit tests — round-trip + `peek()`)
- `apps/node/test/chain-verify-loop.test.ts` — 11 new unit tests (4 `shouldEscalateToCrossAgent` opt + 4 `runChainVerificationLoop` e2e with `getNodeConfig` + the existing `defaultVerifyModeForWorker` block + 3 re-export sanity)
- `apps/node/test/node-service-v1-4.test.ts` (NEW, 15 unit tests — the Tauri settings API)

**Docs:**
- `docs/taui-agent-routing-settings.md` (NEW) — the Tauri team's contract (Settings panel + chat badge + status indicator; end-user-first copy throughout)
- `docs/agent-harness-integration-v1-4.md` — this doc (DONE stamp)
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-network-engine.md` — §2.2.2 v1.4 section (the Tauri UI affordances)
- `docs/agent-harness-integration-v1-3.md` — v1.4 status note
