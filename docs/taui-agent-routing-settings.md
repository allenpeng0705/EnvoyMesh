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

These Settings panel controls are the **owner-
wide defaults**. The Tauri team will add new
`NodeService` methods to read + write them
(similar to the v1.4 `getSignalOptIn` /
`setSignalOptIn` pattern). The exact method
names are a Tauri-side implementation
detail; the rough shape is:

- `getDefaultProvider(): Promise<"default" | "openai" | "ollama" | "anthropic">`
- `setDefaultProvider(value: ...): Promise<...>`
- `getDefaultSpendingLimit(): Promise<number | undefined>`
- `setDefaultSpendingLimit(value: number | undefined): Promise<number | undefined>`

**v1.5 scope (what landed):** the v1.5
backend ships **per-prompt** hint parsing
+ threading (`extractPromptHints` +
the dispatch integration). The v1.5
backend does **NOT** ship the owner-wide
default settings — that's a future
chunk, picked up alongside the Tauri UI
implementation. The Tauri team has the
doc to design against; the Node-side
methods land in a future v1.5.x or v1.5+
chunk.

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

## 12. v1.6 — `!openclaw` per-prompt opt-out

> **Status:** Phase 8 v1.6. The Tauri team
> picks up the chat badge mapping in their
> workstream. v1.6 ships the backend (`!openclaw`
> prefix + the opt-out branch in `routeUserPrompt`
> + the v0 corner-case fix).

### 12.1 The chat input — the hint is the power-user escape hatch

The `!openclaw` hint is the **per-prompt mirror
of the v1.4 per-node opt-in toggle**. The owner
types `!openclaw translate this` at the start
of the prompt; the router routes to OpenClaw
unconditionally. The two compose:

- **v1.4 per-node opt-in toggle** — decides
  whether the signal router runs at all.
- **v1.6 per-prompt `!openclaw`** — overrides
  the signal router's choice for a single
  message.

Like the v1.5 inline hints, the Tauri UI is
the primary UX (the regular user never sees
the hint syntax). A tooltip on the chat input
surfaces the hint syntax to power users:

> "**Tip:** you can also type `!openclaw` at
> the start of your message to force the free
> built-in assistant for one message."

### 12.2 The chat badge — `routingReason: "opt-out-explicit"`

The dispatch exposes a new `routingReason`
value when the opt-out fires. The Tauri team
maps the internal value to a user-friendly
label:

| Internal value | Owner-visible label |
|---|---|
| `"opt-out-explicit"` | "Used the free built-in assistant for this one" |

The badge is identical in style to the v1.4
chat badge (a small tag above the reply). The
signal token (`!openclaw`) is in the
`routingSignals` array — the Tauri team can
surface it for power users (developer-mode
debug panel) but the default badge just shows
the user-friendly label.

### 12.3 The Settings panel — no change

The v1.6 hint is **per-prompt only** — there
is no per-node "always opt-out" toggle (the
v1.4 per-node opt-in toggle is the per-node
equivalent). The Settings panel is unchanged
for v1.6.

### 12.4 The v0 corner-case fix (background)

v1.6 also fixes a v0 corner case: a v1.5
inline hint before a v0 prefix (e.g.
`/cost:0.5 !eh translate this`) would mask
the v0 prefix. v1.6 re-scans the
`cleanPrompt` (post v1.5 strip) for v0
prefixes; if the cleanPrompt has a v0
prefix that the original missed (because a
v1.5 hint masked it), the cleanPrompt's
prefix wins. The fix is **partial** — it
works when the v1.5 hint is at the START of
the prompt, but not when the v1.5 hint is in
the middle (the v0 prefix scan only checks
the start of the prompt). The full fix is a
v1.6+ future.

### 12.5 Out of scope (v1.6+ future)

- **Per-prompt opt-in** (`!eh` is the v0
  opt-in; the v1.6 per-prompt opt-out is the
  per-message equivalent of the v1.4 per-node
  opt-in toggle. The v0 `!eh` already exists.)
- **Per-runtime opt-out** (`!openclaw` for
  OpenClaw, `!ext` for ext runtime, etc.) —
  v1.6 is OpenClaw-only. Per-runtime opt-out
  is a v1.6+ future.
- **Full v0 corner-case fix** — scanning the
  WHOLE prompt for v0 prefixes (vs. just the
  start). The v1.6 fix only works when the
  v1.5 hint is at the start. A future chunk
  could scan the whole prompt.

## 13. v1.7 — OpenClaw tags as negative signals

> **Status:** Phase 8 v1.7. The Tauri team
> picks up the chat badge mapping in their
> workstream. v1.7 ships the backend
> (`extractOpenClawTags` + the negative-signal
> scan in `routeUserPrompt`).

### 13.1 The routing layer — the inverse rule

v1.7 implements the **inverse** of the v1.1
positive rule: when a prompt matches a tag
from an **OpenClaw** skill in the merged
manifest, the router routes to OpenClaw
regardless of any positive (envoy-harness)
signals. The two rules compose:

- **v1.1 positive rule:** EH tag in prompt →
  route to EH (when EH is ready).
- **v1.7 negative rule:** OpenClaw tag in
  prompt → route to OpenClaw (regardless of
  positive signals).

The negative rule **vetoes** the positive rule
(Q2 of the v1.7 sub-plan). The user can use
`!eh` to force EH when there's an OpenClaw
tag conflict (the explicit prefix overrides
the implicit tag).

**Shared tags:** when a tag is in BOTH the EH
list and the OpenClaw list (e.g. "mesh" if
both adapters define it), the positive rule
wins (Q4 of the v1.7 sub-plan). The user can
use `!openclaw` to force OpenClaw for the
shared tag.

### 13.2 The chat badge — `routingReason: "openclaw-tag-match"`

The dispatch exposes a new `routingReason`
value when the negative rule fires. The Tauri
team maps the internal value to a user-
friendly label — the same label as
`"opt-out-explicit"` ("Used the free built-in
assistant for this one"). The chat user
doesn't need to distinguish between
`"opt-out-explicit"` and `"openclaw-tag-match"`
— both are "OpenClaw was the right call."

### 13.3 Precedence summary

| Signal | Result |
|---|---|
| Opt-in disabled | `opt-in-disabled` → OpenClaw (first branch) |
| `!openclaw` prefix | `opt-out-explicit` → OpenClaw (explicit) |
| `!eh` / `/eh` prefix | `signal` → EH (explicit; overrides OpenClaw tag) |
| OpenClaw tag in prompt | `openclaw-tag-match` → OpenClaw (veto) |
| EH tag in prompt | `signal` / `signal-skill` → EH (positive) |
| No signals | `default` → OpenClaw (v0 default) |

### 13.4 Out of scope (v1.7+ future)

- **Per-runtime negative signals** (e.g. `ext`
  skill tags as negative signals for EH) —
  v1.7 is OpenClaw-only. Per-runtime negative
  signals are a v1.7+ future.
- **A scoreboard formula** (weighting positive
  vs. negative signals) — v1.10 (per the v1
  backlog). v1.7 uses simple veto (any
  negative signal wins).
- **The Tauri UI implementation** — the actual
  chat badge for `"openclaw-tag-match"` lives
  in the Tauri monorepo. v1.7 ships the
  backend + a design doc.

## 14. v1.8 — Cross verifier with different model (F9.5)

> **Status:** Phase 8 v1.8. The Tauri team
> picks up the chain report surface in their
> workstream. v1.8 ships the backend
> (`MODEL_FAMILY` table + the
> `pickSecondRuntime` preference + the
> `verifierModel` verdict recording).

### 14.1 The chain report — verifier model surface

When a Team job runs cross-verify (per the v1.4
`verifyMode` setting), the verifier is a
**second runtime with a different model family**
than the worker (Q1 of the v1.8 sub-plan). The
chain report surface (a future Tauri panel;
not in v1.8's chat surface) shows the
verifier's model family for each cross
verdict. The end-user sees a friendly label
(Q8):

| Internal model family | Owner-visible label |
|---|---|
| `"claude"` | "Verified by Claude" |
| `"native"` | "Verified by the free built-in assistant" |
| `"pi"` | "Verified by Pi" |
| `"hermes"` | "Verified by Hermes" |
| `"codex"` | "Verified by Codex" |
| `"codex-cli"` | "Verified by Codex" |
| `"human"` | "Verified by a human" |

The internal `verifierModel` field is the
`VerdictEntry` field that's already in the
Zod schema (`packages/protocol/src/agent-adapter.ts:347-389`).
v1.8 reuses the existing field — no protocol
change. The Tauri team maps the internal value
to the user-friendly label.

### 14.2 The fallback — single-runtime + same-family nodes

When the node has only one runtime (e.g. only
envoy-harness), the cross-verify is skipped
(Q4 of the v1.8 sub-plan — single-runtime
node). When the node has multiple runtimes
but all have the same model family as the
worker, the cross-verify falls back to the
first non-worker runtime (Q3 — backward compat
with v1.7). In both cases, the audit trail
shows the fallback decision.

### 14.3 Out of scope (v1.8+ future)

- **Cross-model-on-same-runtime** (the full
  F9.5 primitive) — the EH runtime doesn't
  yet support per-call model overrides on
  the cross-verify path. v1.8 ships the
  cross-runtime primitive (worker on runtime
  A → verifier on runtime B with a different
  family); the cross-model-on-same-runtime
  primitive is v1.8+ future.
- **Tauri chain report UI** — the Tauri team
  picks up the chain report surface in their
  workstream. v1.8 ships the backend + a
  design doc.
- **Scoreboard formula** (v1.10) — the v1.8
  `verifierModel` field is the foundation for
  a future chunk that weights the verdict by
  the model (e.g. "verifier is the same model
  family as the worker" → less trustworthy).
  v1.8 just records the model; the weighting
  is v1.10.

## 15. References

- [`agent-harness-integration-v1-4.md`](./agent-harness-integration-v1-4.md)
  (the v1.4 sub-plan + DONE stamp)
- [`agent-harness-integration-v1-5.md`](./agent-harness-integration-v1-5.md)
  (the v1.5 sub-plan + DONE stamp)
- [`agent-harness-integration-v1-6.md`](./agent-harness-integration-v1-6.md)
  (the v1.6 sub-plan + DONE stamp)
- [`agent-harness-integration-v1-7.md`](./agent-harness-integration-v1-7.md)
  (the v1.7 sub-plan + DONE stamp)
- [`user-prompt-router.ts`](../apps/node/src/user-prompt-router.ts)
  (the v0 + v1.1 + v1.2 + v1.5 + v1.6 + v1.7
  router; v1.7 adds the negative-signal scan)
- [`manifest-envoy-harness-tags.ts`](../apps/node/src/manifest-envoy-harness-tags.ts)
  (the v1.1 `extractEnvoyHarnessTags` +
  v1.7 `extractOpenClawTags` extractors)
- [`node-service-handlers-run-owner-agent-turn.ts`](../apps/node/src/node-service-handlers-run-owner-agent-turn.ts)
  (the dispatch; v1.4 + v1.5 + v1.6 + v1.7
  all extend the `readManifestView` +
  `routeUserPrompt` call)
- [`agent-runtime-envoy/runtime.ts`](../apps/node/src/agent-runtime-envoy/runtime.ts)
  (the EH runtime — v1.5 added `providerHint?`
  on the options; logs the hint in the
  audit trail)
