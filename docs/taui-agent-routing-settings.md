# Tauri UI: Agent Routing Settings + Chat Routing Badge (Phase 8 / v1.4)

> **Status:** Design doc (Tauri team picks up
> the implementation in their own
> workstream). v1.4 ships the backend +
> this doc; the actual Tauri UI lives in
> the Tauri monorepo.
>
> **Companion to:**
> [`agent-harness-integration-v1-4.md`](./agent-harness-integration-v1-4.md)
> (the v1.4 sub-plan + DONE stamp).
>
> **Audience:** the Tauri team building
> the Social UI + Settings panel.
>
> **End-user-first:** every user-visible
> string in this doc uses plain language.
> Developer jargon is in the
> `[debug details:]` blocks at the bottom
> of the verbose failure surfaces. See
> AGENTS.md → Important Nuances → "EnvoyMesh
> is an end-user product" for the
> underlying principle.

## 1. Why this doc

The v1.4 backend (Node side) exposes the
**opt-in toggle** + the **verifyMode
default** + the **chat routing badge** as
**durable, owner-controlled affordances**.
Before v1.4, the only way to disable
signal-based routing was to set the
`ENVOY_HARNESS_SIGNAL_OPT_IN=disabled`
env var. The verifyMode default was a
fixed per-runtime policy. The chat user
saw no indication of which skill handled
the reply.

v1.4 makes these three things visible +
controllable. The Tauri team picks up the
UI in their own workstream; this doc is
the contract.

## 2. The data model (already implemented)

The Tauri UI uses three existing sources
+ four new RPC methods. **No new fields
are needed on `OwnerAgentTurnResult`** —
the existing v1.2 fields
(`routingReason` + `targetSkill`) carry
everything the chat badge needs.

### 2.1 Read path (the Tauri UI calls these)

#### `getSignalOptIn(): Promise<"enabled" | "disabled">`

Returns the **effective** signal opt-in
flag — the value the signal router
**actually uses** on the next user
prompt, not just the persisted field.

Resolution order (handled by the host):

1. `PersistedNodeConfig.signalOptIn`
   (the Tauri UI's durable toggle)
2. `ENVOY_HARNESS_SIGNAL_OPT_IN` env var
   (the v0 fallback for headless / dev /
   CI)
3. The implicit default (`"enabled"`)

#### `getVerifyModeDefault(runtime: AgentRuntime): Promise<VerifyMode>`

Returns the **effective** verifyMode
default for a given worker runtime
(envoy-harness, openclaw, ext, pi, …).
The persisted field is the same for all
runtimes (Q3 of the v1.4 sub-plan — a
single value, not a per-runtime map).

Resolution order:

1. `PersistedNodeConfig.verifyModeDefault`
2. The per-runtime default
   (`defaultVerifyModeForWorker(runtime)`)

The Tauri UI can pass any runtime — the
field is the same for all, so the
returned value will be the same regardless
of the runtime arg.

### 2.2 Write path (the Tauri UI calls these when the owner toggles)

#### `setSignalOptIn(value: "enabled" | "disabled"): Promise<"enabled" | "disabled">`

Persists the new value and returns the
**new effective state** (which the Tauri
UI shows as confirmation). The method
delegates to `updateNodeConfig` (the same
auth path as the other node-config
writers), so it's owner-only.

#### `setVerifyModeDefault(value: VerifyMode | undefined): Promise<VerifyMode | undefined>`

Persists the new value. Pass `undefined`
to clear the override (the chain-verify
loop falls back to the per-runtime
default). Same owner-only auth as
`setSignalOptIn`.

### 2.3 Chat reply routing fields (no API change)

The chat UI reads these from
`OwnerAgentTurnResult` (no new fields
needed — the v1.2 fields are enough):

| Field | Type | What it means |
|---|---|---|
| `routingReason` | `"default" \| "signal" \| "signal-skill" \| "envoy-harness-unready" \| "opt-in-disabled"` | Why the router picked the runtime it did |
| `targetSkill?` | `string` | When `routingReason === "signal-skill"`, the skillId that was invoked (e.g. `"setup-sponsor-friend"`) |
| `routingSignals` | `ReadonlyArray<string>` | The matching tokens in the user's prompt (e.g. `["mesh", "sponsor"]` for `setup-sponsor-friend`) |
| `modelUsed` | `"openclaw" \| "envoy-harness" \| "native" \| "scripted-tutor"` | The runtime that actually produced the reply |

**Why no new fields:** the v1.2 router
already surfaces the routing decision
fully. The Tauri UI renders the badge
from the existing fields.

## 3. The Settings panel

### 3.1 Layout (Tauri Settings → Agent Network)

```
┌─────────────────────────────────────────────┐
│ Agent Network                               │
│                                             │
│ Auto-routing                                │
│ ┌─────────────────────────────────────────┐ │
│ │ Auto-route mesh queries    [  ON  ]     │ │
│ │ When ON, envoy-harness answers prompts  │ │
│ │ that mention mesh, federated, or your   │ │
│ │ custom tools. When OFF, all chat goes   │ │
│ │ to the built-in assistant.              │ │
│ │                                         │ │
│ │ Last changed: today, 2:14 PM            │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Verification mode                           │
│ ┌─────────────────────────────────────────┐ │
│ │ How carefully to verify Team jobs       │ │
│ │ before showing the result.              │ │
│ │                                         │ │
│ │   ◯  Light                              │ │
│ │      Quick rule check. No cross-check.  │ │
│ │      Best for low-stakes tasks.         │ │
│ │                                         │ │
│ │   ●  Standard                           │ │
│ │      Rule check + a second runtime      │ │
│ │      cross-checks. Recommended.         │ │
│ │                                         │ │
│ │   ◯  Strict                             │ │
│ │      Always cross-check; the second     │ │
│ │      runtime's verdict wins.            │ │
│ │      Best for high-stakes or private    │ │
│ │      jobs.                              │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 3.2 The opt-in toggle

**Owner-visible label (Q5 of v1.4 — end-user-first):**
- "Auto-route mesh queries" (NOT "signalOptIn=enabled")

**Owner-visible description:**
- "When ON, envoy-harness answers prompts that mention mesh, federated, or your custom tools. When OFF, all chat goes to the built-in assistant."

**Persistence:** the Tauri UI calls
`setSignalOptIn("enabled" | "disabled")`
when the owner toggles the switch. The
host writes to `node-config.json` and
returns the new effective state.

**State shown:** the switch position
reflects the **effective** state
(`getSignalOptIn()`), not the persisted
field. This way the owner sees the
correct value even when the env var is
the active source.

### 3.3 The verifyMode dropdown

**Owner-visible labels (Q3 of v1.4 — end-user-first, plain language):**

| DB value | Owner-visible label | Owner-visible description |
|---|---|---|
| `"rule-only"` | **Light** | "Quick rule check. No cross-check. Best for low-stakes tasks." |
| `"cross-runtime"` | **Standard** | "Rule check + a second runtime cross-checks. Recommended." |
| `"cross-runtime-strict"` | **Strict** | "Always cross-check; the second runtime's verdict wins. Best for high-stakes or private jobs." |

**Default selection:** the Tauri UI
shows the **effective** value via
`getVerifyModeDefault("envoy-harness")`.
When the field is unset, the dropdown
shows "Standard" (the per-runtime
default for envoy-harness) selected.

**Persistence:** the Tauri UI calls
`setVerifyModeDefault(value)` when the
owner picks a value. Pass `undefined`
to clear (the loop falls back to the
per-runtime default — useful when the
owner wants "use the default for each
runtime").

### 3.4 The "last changed" timestamp

The Settings panel shows when the
owner last changed the toggle or the
dropdown. The Tauri UI can read this
from `getNodeConfig().updatedAt` (the
persisted file's `updatedAt` is bumped
on every save).

**Why show it:** the owner can
troubleshoot "why did this change?" by
looking at the timestamp.

## 4. The chat UI badge

### 4.1 When to show the badge

Show the badge above any chat reply
where `routingReason !== "default"`
— i.e. the router made an active
choice. When the default OpenClaw
path took over, no badge is needed
(the user expected that).

### 4.2 The badge content

| `routingReason` | Badge text | Visual |
|---|---|---|
| `"signal-skill"` + `targetSkill: "setup-sponsor-friend"` | "Routed to `setup-sponsor-friend`" | Blue pill |
| `"signal-skill"` + `targetSkill: "peer-list"` | "Routed to `peer-list`" | Blue pill |
| `"signal-skill"` + `targetSkill: "relay-status"` | "Routed to `relay-status`" | Blue pill |
| `"signal-skill"` + any other skillId | "Routed to `<skillId>`" | Blue pill |
| `"signal"` | "Routed by `mesh`" (uses the first token of `routingSignals`) | Gray pill |
| `"envoy-harness-unready"` | "envoy-harness not ready" + `[debug details: <reason>]` | Yellow pill (with collapsible debug) |
| `"opt-in-disabled"` | "Signal routing off" | Gray pill |
| `"default"` | (no badge) | — |

### 4.3 The "[debug details: ...]" collapse

For `"envoy-harness-unready"`, the
chat reply includes a small "Show
details" toggle that expands to
the raw debug info (the
`envoy-harness-unready` reason
string). This is the v1.3
end-user-first ordering: developer
jargon at the bottom, plain
language at the top.

```
┌────────────────────────────────────────────┐
│ envoy-harness not ready                    │
│ The auto-router is set up, but the model   │
│ isn't configured yet. Add an API key in   │
│ Settings → AI to enable.                   │
│                                            │
│ [Show details]                             │
│ ▼                                          │
│ envoy_harness_stub_phase_8_step_1          │
│ modelProviders.mode = disabled             │
└────────────────────────────────────────────┘
```

## 5. The status indicator (chat header)

A small icon in the chat header
showing mesh state + envoy-harness
readiness + opt-in state. The data is
read from existing methods + the new
ones:

| Icon state | Reads from |
|---|---|
| Mesh online | `getConnectionStatus()` |
| Envoy-harness ready | `isEnvoyHarnessReady()` (existing) |
| Opt-in state | `getSignalOptIn()` (new in v1.4) |
| VerifyMode posture | `getVerifyModeDefault("envoy-harness")` (new in v1.4) |

**Owner-visible behavior:**
- Green dot: mesh online, envoy-harness ready, opt-in enabled
- Yellow dot: mesh online, envoy-harness not ready (the model isn't configured)
- Gray dot: mesh online, opt-in disabled
- Red dot: mesh offline

Hovering the icon shows a tooltip with
the underlying values (the
"end-user-first" details — for owners
who want to debug, not for chat users).

## 6. Owner-visible copy cheat sheet

When the Tauri team writes the UI
strings, use the **owner-visible** column
on the left. The **developer-visible**
column is for the audit log + the
`[debug details:]` blocks.

| Owner-visible | Developer-visible (audit log) |
|---|---|
| Auto-route mesh queries | `signalOptIn` |
| Auto-route ON / OFF | `enabled` / `disabled` |
| Light / Standard / Strict | `rule-only` / `cross-runtime` / `cross-runtime-strict` |
| Routed to `<skill>` | `routingReason: "signal-skill"` + `targetSkill` |
| Routed by `mesh` | `routingReason: "signal"` + `routingSignals: ["mesh"]` |
| envoy-harness not ready | `routingReason: "envoy-harness-unready"` |
| Signal routing off | `routingReason: "opt-in-disabled"` |

## 7. Migration / backward compat

**For owners with the v0 env var set
(legacy `ENVOY_HARNESS_SIGNAL_OPT_IN=disabled`):**

- The Tauri UI's "Auto-route mesh queries" toggle starts OFF (matches the
  env var's effective state).
- When the owner toggles ON, the Tauri
  UI calls `setSignalOptIn("enabled")`,
  which writes the persisted field. The
  env var is now shadowed by the
  persisted value (Q2 — persisted
  wins, env var as fallback).

**For owners with no env var + no
persisted field (default case):**

- The toggle starts ON (the implicit
  default).
- No migration step is needed; the v0
  behavior is preserved (Q6 — `undefined`
  = use existing default).

**For owners with the v0 `defaultVerifyModeForWorker(runtime)` policy:**

- The "Verification mode" dropdown
  shows "Standard" (the envoy-harness
  default) selected.
- When the owner picks a different
  value, the Tauri UI calls
  `setVerifyModeDefault(value)`. The
  per-runtime default is now shadowed by
  the per-node value (Q3 — persisted
  wins over per-runtime default).

## 8. Out of scope (deferred to v1.5+)

- **Cost cap + multi-provider signal
  hints** (`/cost:0.5`, `/provider:openai`)
  — v1.5.
- **Per-prompt opt-out** `!openclaw` —
  v1.6.
- **OpenClaw tags as negative signals**
  — v1.7.
- **Per-runtime opt-in** (per-runtime
  opt-in instead of per-node) — Q3
  alternative of v1.4, deferred.
- **Per-runtime verifyMode** (per-runtime
  map instead of per-node single value) —
  Q3 alternative of v1.4, deferred.

## 9. References

- [`agent-harness-integration-v1-4.md`](./agent-harness-integration-v1-4.md)
  (the v1.4 sub-plan + DONE stamp)
- [`agent-harness-integration-v1-1.md`](./agent-harness-integration-v1-1.md)
  (the v1.1 dynamic vocabulary)
- [`agent-harness-integration-v1-2.md`](./agent-harness-integration-v1-2.md)
  (the v1.2 per-skill routing — `targetSkill` + `routingReason: "signal-skill"` for the chat badge)
- [`agent-harness-integration-v1-3.md`](./agent-harness-integration-v1-3.md)
  (the v1.3 B-class per-skill result formatter — what the chat user sees for B-class skills)
- [`user-prompt-router.ts`](../apps/node/src/user-prompt-router.ts)
  (the v0 + v1.1 + v1.2 router — `readSignalOptInEnv`, `routeUserPrompt`, `extractEnvoyHarnessTags` + `extractEnvoyHarnessSkills`, `pickTargetSkill`)
- [`node-config-loader.ts`](../apps/node/src/node-config-loader.ts) (NEW in v1.4)
  (the `readEffectiveSignalOptIn` + `readEffectiveVerifyModeDefault` helpers)
- [`chain-verify-loop.ts`](../apps/node/src/chain-verify-loop.ts)
  (the v0 + v1.4 chain-verify loop — `defaultVerifyModeForWorker`, `getNodeConfig` dep, `effectiveVerifyMode` opt)
- [`agent-network.ts`](../packages/protocol/src/agent-network.ts)
  (the `VerifyMode` type — `rule-only` / `cross-runtime` / `cross-runtime-strict`)
- [`node-config-store.ts`](../apps/node/src/node-config-store.ts)
  (the `PersistedNodeConfig` type + `signalOptIn?` + `verifyModeDefault?` + `peek()`)
- [`owner-agent-loop.ts`](../packages/api/src/owner-agent-loop.ts)
  (the `OwnerAgentTurnResult` — `routingReason` + `targetSkill` + `modelUsed` for the chat badge)

## 10. v1.5 — Model provider + spending limit (dormant cost)

> **Status:** Phase 8 v1.5. The Tauri team
> picks up the implementation in their
> workstream. v1.5 ships the backend
> (`extractPromptHints` + the dispatch
> integration); the actual Tauri UI lives
> in the Tauri monorepo.
>
> **End-user-first principle (the v1.5
> framing):** the Tauri UI is the **primary
> UX** (friendly dropdowns + sliders). The
> prompt hints (`/provider:NAME`,
> `/cost:N`) are the **power-user escape
> hatch** (developer-style syntax). The
> regular user never sees the hint syntax;
> the power user can use it for per-message
> control. **The cost feature is dormant**
> (off by default) — the Tauri UI may
> show a "Spending limit" slider, but the
> runtime uses the per-skill default until
> `ENVOY_HARNESS_COST_CAP_ENABLED=1` is set.

### 10.1 The chat input area — Model dropdown

```
┌────────────────────────────────────────────┐
│ Type a message…                             │
│                                            │
│ [Model: Default ▾]  ←  a small dropdown     │
│                                            │
│ [ Send ]                                   │
└────────────────────────────────────────────┘
```

**Owner-visible labels** (end-user-first, plain language):

| DB value | Owner-visible label |
|---|---|
| `undefined` (no hint) | **Default** (the node's default model) |
| `"openai"` | **OpenAI** |
| `"ollama"` | **Ollama (local)** |
| `"anthropic"` | **Anthropic** |

**Per-message vs owner-wide:**
- The chat input dropdown is **per-message** (the user's choice for this one message).
- The Settings panel has a separate **owner-wide default** that the Tauri UI sets via a new `NodeService` method (similar to the v1.4 `setSignalOptIn`).

**Discovery:** the dropdown shows a tooltip on hover: "**Tip:** you can also type `/provider:openai` in your message to override the model for one message." This is the bridge between the friendly Tauri UI and the developer-style prompt hint.

### 10.2 The chat input area — Spending limit slider (dormant)

> **Dormant by design** (Q9 + Q10 of the
> v1.5 sub-plan). The Tauri UI shows the
> control, but the runtime uses the
> per-skill default until the EH runtime
> has real cost tracking. The
> `ENVOY_HARNESS_COST_CAP_ENABLED=1` env
> var flips on the runtime enforcement.

```
┌────────────────────────────────────────────┐
│ Spending limit for this message            │
│                                            │
│  $0.10   $0.50   $1.00   Unlimited          │
│   ●                                  ○     │
│                                            │
│ What this does:                             │
│ When ON, the built-in AI caps spending at   │
│ the chosen amount and falls back to the     │
│ free built-in assistant if the cap is hit.  │
│ This is a power-user feature.               │
└────────────────────────────────────────────┘
```

**Owner-visible labels:**

| DB value | Owner-visible label |
|---|---|
| `0.10` | "$0.10 (cheap — quick reply)" |
| `0.50` | "$0.50 (balanced — recommended)" |
| `1.00` | "$1.00 (deep — long answer)" |
| `undefined` | "Unlimited" |

**Per-message vs owner-wide:**
- The chat input slider is **per-message** (the user's choice for this one message).
- The Settings panel has a separate **owner-wide default** ("Default spending limit for mesh queries") that the Tauri UI sets via a new `NodeService` method.

### 10.3 Settings panel additions

```
┌────────────────────────────────────────────┐
│ Model (default for mesh queries)            │
│ ◯ Default                                  │
│ ● OpenAI                                   │
│ ◯ Ollama (local)                            │
│ ◯ Anthropic                                 │
│                                            │
│ Default spending limit                       │
│ ● $0.50 (balanced)                          │
│ ◯ $0.10 (cheap)                              │
│ ◯ $1.00 (deep)                              │
│ ◯ Unlimited                                 │
└────────────────────────────────────────────┘
```

These Settings panel controls map to new
`NodeService` methods (added in v1.5.3):

- `getDefaultProvider(): Promise<"default" | "openai" | "ollama" | "anthropic">`
- `setDefaultProvider(value: ...): Promise<...>`
- `getDefaultSpendingLimit(): Promise<number | undefined>`
- `setDefaultSpendingLimit(value: number | undefined): Promise<number | undefined>`

(Or similar — the exact method names are
a v1.5.3 implementation detail.)

### 10.4 The power-user escape hatch

The Tauri UI is for the regular user. The
prompt hints are for the power user. The
two surfaces coexist:

- **Regular user** (90%+ of owners): uses the Tauri UI dropdowns + sliders. Doesn't need to know the hint syntax.
- **Power user** (developers, advanced owners): types `/provider:openai /cost:0.50` in the prompt for one-message control.

**The hint syntax is not user-friendly.**
The Tauri team shouldn't surface the hint
syntax in the primary UI. A tooltip on
the dropdown + a link to the docs is
enough.

### 10.5 Out of scope (v1.5+ future)

- **Per-prompt provider override via Tauri UI** (the dropdown is a v1.5.3 design; the implementation is a future chunk).
- **Spending limit history** ("you've spent $X this month") — a future chunk.
- **Per-runtime provider override** (different providers for envoy-harness vs openclaw vs ext) — a future chunk.

## 11. v1.5 — Out of scope (deferred to v1.6+)

> The v1.5 backend ships the
> `extractPromptHints` helper + the
> dispatch integration (provider hint is
> logged for the audit trail; cost cap is
> gated by `ENVOY_HARNESS_COST_CAP_ENABLED`).
> The Tauri UI work lives in the Tauri
> monorepo.
>
> **Out of scope for v1.5** (deferred to
> v1.6+): per-prompt opt-out `!openclaw`
> hint, OpenClaw tags as negative signals,
> cross verifier with different model,
> per-runtime tags, scoreboard formula.

## 12. References

- [`agent-harness-integration-v1-5.md`](./agent-harness-integration-v1-5.md)
  (the v1.5 sub-plan + DONE stamp)
- [`user-prompt-router.ts`](../apps/node/src/user-prompt-router.ts)
  (the v1.5 `extractPromptHints` helper +
  `INLINE_HINT_REGEX` + `COST_CAP_ENABLED_ENV_VAR`)
- [`node-service-impl.ts`](../apps/node/src/node-service-impl.ts)
  (the v1.5 `readEffectiveCostCapUsd` helper +
  `askEnvoyHarness` / `askEnvoyHarnessSkill`
  accept the new `opts?` for hints)
- [`node-service-handlers-run-owner-agent-turn.ts`](../apps/node/src/node-service-handlers-run-owner-agent-turn.ts)
  (the v1.5 dispatch — passes the hints
  to the ask methods)
- [`agent-runtime-envoy/runtime.ts`](../apps/node/src/agent-runtime-envoy/runtime.ts)
  (the v1.5 EH runtime — `providerHint?`
  on the options; logs the hint in the
  audit trail)
