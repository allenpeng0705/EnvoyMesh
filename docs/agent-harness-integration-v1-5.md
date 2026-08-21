# envoy-harness integration — v1.5 sub-plan (cost cap + multi-provider signal hints)

> **Status:** ✅ **DONE** (2026-08-21). 1 commit on
> `envoy_harness_integration` branch (the user
> delegated commit; bundled v1.5.1 + v1.5.2 +
> v1.5.3 into a single commit at the end of v1.5).
> 19 new tests (12 `extractPromptHints` + 4
> `routeUserPrompt` integration + 5 dispatch
> e2e — the v0 + v1.4 tests stay regression-
> clean). No new type errors (pre-existing
> multiformats/ArrayBuffer conflict in
> `packages/network/src/index.ts:2791` unchanged).
>
> **What this doc covers:** v1.5 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 + v1.4
> are done + pushed. v1.5 gives owners **per-prompt
> provider control** (the primary feature) + a
> **cost cap feature flag** (dormant by default;
> the space is left but the runtime doesn't enforce
> the cap until we flip the flag). **Keep it
> simple:** the cost feature is a single env var
> (`ENVOY_HARNESS_COST_CAP_ENABLED`), no persisted
> field, no settings API, no helper file — just
> a one-line check in the dispatch.
>
> **End-user-first (v1.5 framing):** the Tauri UI
> is the **primary UX** (friendly dropdowns +
> sliders). The prompt hints are the **power-user
> escape hatch** (developer-style syntax). The
> regular user never sees the hint syntax; the
> power user can use it for per-message control.
> **The cost feature is dormant** (off by default)
> — the Tauri UI may show a "Spending limit"
> slider, but the runtime uses the per-skill
> default until `ENVOY_HARNESS_COST_CAP_ENABLED=1`
> is set.

## 1. Goal

**The Tauri user prompt gets two new inline
hints that the router parses + strips + threads
to the dispatch:**

1. **`/provider:NAME`** (the **primary v1.5
   feature**) — force a specific model
   provider (e.g. `/provider:openai`,
   `/provider:ollama`, `/provider:anthropic`).
   The EH runtime uses the named provider
   instead of the node's default configured
   provider. **Always on** (no flag).
2. **`/cost:N`** (the **dormant cost feature
   flag**) — explicit cost cap for the call
   (e.g. `/cost:0.5` = "cap this call at
   $0.50"). **Gated by `ENVOY_HARNESS_COST_CAP_ENABLED=1`**
   (env var, default off). When the flag is
   off, the `/cost:N` hint is parsed +
   recorded on the decision but the runtime
   uses the per-skill default — v0 behavior
   preserved. When the flag is on, the
   dispatch passes the cap to the EH runtime.
   **Keep it simple:** the flag is a single
   env var check in the dispatch, no helper
   file, no persisted field, no settings
   API.

**Why the cost feature is dormant:** the EH
runtime's cost tracking isn't mature enough
to enforce a per-call cap reliably yet. The
v1.5 cost feature is the **infrastructure
plumbing** (parsing + recording + a flag)
that a future chunk can flip on once the
EH runtime has real cost tracking. The
provider hint is the feature owners can use
today.

## 2. Existing pieces (what we build on)

### 2.1 v0 mechanism — per-skill `costCeilingUsd`

**File:** `envoy-harness/packages/envoy-harness-adapter/src/skills.ts:55`

Each `SkillDescriptor` has an optional
`costCeilingUsd?: number` field. The host
reads it in `NodeServiceImpl.askEnvoyHarnessSkill`
(`apps/node/src/node-service-impl.ts:4944`):

```ts
const costCeilingUsd = skill.costCeilingUsd ?? 1.0;
const result = await runtime.askSkill(message, {
  skillId,
  costCeilingUsd,
  deadlineMs: 60_000,
});
```

**The v1.5 change:** the per-skill
`costCeilingUsd` becomes the **default**;
the new per-prompt `/cost:N` hint
**overrides** it.

### 2.2 v0 mechanism — node's default model provider

**File:** `apps/node/src/node-service-impl.ts:5067-5115`

The EH runtime caches the resolved
`<provider>:<model>` string + API key at
init. The dispatch uses the cached value.
**The v1.5 change:** the per-prompt
`/provider:NAME` hint **overrides** the
cached value (the LLM call uses the
named provider instead of the default).

### 2.3 v0 + v1.1 — explicit hint prefixes at start

**File:** `apps/node/src/user-prompt-router.ts:514-533`

The v0 router parses the `!eh` / `/eh`
prefixes at the **start of the trimmed
prompt** (the hint is a single command,
not an inline token).

**The v1.5 change:** the new `/cost:N` +
`/provider:NAME` hints are **inline** —
they can appear anywhere in the prompt,
not just at the start. The router uses a
different regex (`/.../g`) to find them.

## 3. Design

### 3.1 Hint regex

```ts
// Match /cost:N or /provider:NAME anywhere
// in the prompt. Case-insensitive. NAME is
// alphanumeric + dash (for future provider
// names like "openai-4" or "ollama-local").
const HINT_REGEX = /\/(cost|provider):([\w-]+)/gi;
```

**Why slash-prefixed:** consistent with
the v0 `/eh` prefix. The slash is the
"command marker".

**Why `[\w-]+`:** alphanumeric + dash.
Provider names like `openai-4` are valid
in the future.

**Why case-insensitive:** `/COST:0.5`
should work the same as `/cost:0.5`.

**Why inline (not start-only):** the
hints are modifiers ("cap this call at
$0.50"), not commands ("run this
through envoy-harness"). Modifiers
naturally appear inline; commands
naturally appear at the start.

### 3.2 Hint extraction helper

**File:** `apps/node/src/user-prompt-router.ts` (modify)

```ts
/**
 * Phase 8 / v1.5 — extract inline hints
 * from the prompt.
 *
 * **Hunt-and-strip:** the function finds
 * all `/cost:N` + `/provider:NAME` tokens
 * (anywhere in the prompt) and returns:
 * 1. The clean prompt (with the hints
 *    stripped, preserving whitespace).
 * 2. The parsed hints (deduplicated;
 *    first occurrence wins on ties).
 *
 * **What it doesn't do:** it doesn't
 * validate the hint values. A
 * `/cost:abc` would set
 * `costCapUsd: NaN`. The dispatch
 * (caller) validates + falls back to
 * the per-skill default for invalid
 * values.
 *
 * @returns `{ cleanPrompt, hints }`
 *   where `hints` is:
 *   `{ costCapUsd?: number; providerHint?: string }`
 */
export function extractPromptHints(prompt: string): {
  cleanPrompt: string;
  hints: {
    costCapUsd?: number;
    providerHint?: string;
  };
} {
  const hints: { costCapUsd?: number; providerHint?: string } = {};
  let cleanPrompt = prompt;
  // ...
}
```

### 3.3 Router integration

The `routeUserPrompt` function calls
`extractPromptHints` at the start. The
hints are returned as part of the
decision:

```ts
export interface RouteUserPromptDecision {
  // ... existing fields ...
  /** v1.5 — explicit cost cap from /cost:N */
  costCapUsd?: number;
  /** v1.5 — provider override from /provider:NAME */
  providerHint?: string;
}
```

### 3.4 Dispatch integration

The host's `runOwnerAgentTurnViaRuntime`
passes the hints to the EH call:

```ts
// Cost cap is gated by the env var. When
// the flag is off (default), we ignore
// decision.costCapUsd and use the
// per-skill default (v0 behavior).
// When the flag is on, the per-prompt
// hint wins over the per-skill default.
const costCapEnabled = process.env.ENVOY_HARNESS_COST_CAP_ENABLED === "1";
const hintCostCap = costCapEnabled && decision.costCapUsd !== undefined
  ? decision.costCapUsd
  : (skill.costCeilingUsd ?? 1.0);
const result = await runtime.askSkill(message, {
  skillId,
  costCeilingUsd: hintCostCap,
  providerHint: decision.providerHint,  // undefined = use default
  deadlineMs: 60_000,
});
```

The EH runtime's `askSkill` accepts the
new `providerHint?` parameter; when
set, it resolves the provider from the
named source (the node's configured
providers map) instead of the default.

**Why the env var for the cost flag** (Q9
simpler default — env var only): the cost
feature is dormant (off by default), and
we want the simplest possible flag. A
persisted field + helper + settings API
is overkill for a dormant feature. When
the EH runtime has real cost tracking
(future chunk), the flag can graduate to
a persisted field.

### 3.5 Provider hint resolution

**File:** `envoy-harness/packages/envoy-harness-adapter/src/runtime.ts`

The EH runtime has a provider registry
(openai, anthropic, ollama, mock). The
new `providerHint` parameter is matched
against the registry. When the hint is
unknown, the runtime falls back to the
default (the v0 behavior, preserved).

```ts
// EH runtime
export interface AskSkillOptions {
  skillId: string;
  costCeilingUsd: number;
  deadlineMs: number;
  /** v1.5 — override the node's default provider */
  providerHint?: string;
}
```

### 3.6 Cost cap semantics

**When the cap is hit:**

- The EH runtime aborts the LLM call
  mid-stream when the running cost
  exceeds the cap.
- The error type is `CostCapReachedError`
  with the cap value.
- The host's `askEnvoyHarnessSkill`
  surfaces the error to the dispatch.
- The dispatch falls through to the
  v1.1 free-form LLM ask (Q7 of the
  v1.2 sub-plan) with a console.warn.
- The user sees the OpenClaw reply, not
  the EH reply.

**Why fall through (not fail loud):**
the cost cap is a per-prompt
optimization, not a correctness gate.
The user wanted "cap this call at
$0.50"; falling back to OpenClaw
(which is free) is a reasonable
response.

**User-visible copy** (end-user-first):

```
[EH cost cap reached — fell back to OpenClaw]
$0.50 / $0.50 used. The mesh model was capped. The built-in assistant answered instead.
```

### 3.7 Test strategy

**Unit tests in `user-prompt-router.test.ts`:**
- `extractPromptHints` finds `/cost:0.5`
  anywhere in the prompt
- `extractPromptHints` finds `/provider:openai`
- `extractPromptHints` strips the hints
  from the clean prompt (preserves
  whitespace)
- `extractPromptHints` handles multiple
  hints in the same prompt
- `extractPromptHints` returns the first
  occurrence on duplicates
- `extractPromptHints` is case-insensitive
  (`/COST:0.5` works)
- `extractPromptHints` doesn't match
  `/cost:0.5.5` (malformed)
- `extractPromptHints` doesn't match
  inline `cost:0.5` (must have slash
  prefix)
- `routeUserPrompt` includes the hints
  in the decision

**E2E tests in `run-owner-agent-turn-routing.test.ts`:**
- The dispatch passes the hint cost cap
  to `runtime.askSkill`
- The dispatch passes the hint provider
  to `runtime.askSkill`
- A `CostCapReachedError` falls through
  to OpenClaw with a console.warn
- The clean prompt (without the hints)
  is what the EH model sees

**EH adapter tests in `envoy-harness`:**
- `providerHint: "openai"` uses the
  openai provider
- `providerHint: "unknown"` falls back
  to default

## 4. Design questions for team sign-off

> These are the choices that need a decision before implementation
> starts. **Defaults proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Hint syntax | **Slash-prefixed inline** — `/cost:0.5` or `/provider:openai` anywhere in the prompt | Plain inline (`cost:0.5`) — no slash, simpler parsing, but no visual cue that it's a hint |
| **Q2** | Hint position | **Anywhere in the prompt** — `/cost:0.5 explain the mesh` works the same as `explain the mesh /cost:0.5` | Start-only — consistent with the v0 `/eh` prefix, but unnatural for modifiers |
| **Q3** | Multiple hints | **Multiple hints in the same prompt** — `/cost:0.5 /provider:openai` parses both | Single hint per prompt — simpler parser, but owners can't combine |
| **Q4** | Cost cap fallback on invalid value | **Fall back to per-skill default** — `/cost:abc` is ignored, the per-skill `costCeilingUsd` is used | Fail loud — reject the prompt with "Invalid cost cap: abc" |
| **Q5** | Provider hint on unknown name | **Fall back to node's default** — `/provider:foo` is ignored, the node's default provider is used | Fail loud — reject the prompt with "Unknown provider: foo" |
| **Q6** | Cost cap exceeded behavior | **Fall through to OpenClaw** (free) with a console.warn | Fail loud — return "Cost cap reached: $0.50" to the user |
| **Q7** | Hint precedence (cost, **when the flag is on**) | **`/cost:N` > per-skill `costCeilingUsd` > v0 default (1.0)** — explicit hint wins | Per-skill `costCeilingUsd` > `/cost:N` — the per-skill cap is a hard ceiling |
| **Q8** | Hint precedence (provider) | **`/provider:NAME` > node's default** — explicit hint wins | Per-skill `modelProvider` > `/provider:NAME` — the per-skill provider is canonical |
| **Q9** | Cost feature flag location | **Env var only** — `ENVOY_HARNESS_COST_CAP_ENABLED=1` (default off) | Persisted field + helper (like v1.4) — overkill for a dormant feature; persisted is for v1.5+ when the runtime can actually enforce |
| **Q10** | Cost feature flag default | **Off** (v0 behavior — `/cost:N` is parsed but ignored) | On — v1.5 ships with the cost cap active by default |

**Defaults at-default (Q1-Q10):** the v1.5 cost
feature is **deliberately dormant**. The
parsing + recording infrastructure is in
place; the runtime enforcement is gated by
`ENVOY_HARNESS_COST_CAP_ENABLED`. When a
future chunk lands real cost tracking in the
EH runtime, the flag can be flipped on. The
provider hint is the **actively-used** v1.5
feature.

## 5. Plan

### Sub-chunk v1.5.1 — hint extraction + router integration (1 commit)

- New: `apps/node/src/user-prompt-router.ts` —
  `extractPromptHints(prompt)` helper.
- Modify: `apps/node/src/user-prompt-router.ts` —
  `routeUserPrompt` calls the helper + returns
  the hints on the decision.
- Modify: `RouteUserPromptDecision` — add
  `costCapUsd?` + `providerHint?`.
- New: `apps/node/test/user-prompt-router.test.ts`
  tests for `extractPromptHints` (~10 unit
  tests).

### Sub-chunk v1.5.2 — dispatch integration (1 commit)

- Modify: `apps/node/src/node-service-handlers-run-owner-agent-turn.ts` —
  the EH dispatch passes the hints to
  `runtime.askSkill` (provider hint always;
  cost cap gated by `ENVOY_HARNESS_COST_CAP_ENABLED`).
- Modify: `apps/node/src/agent-runtime-envoy/runtime.ts` —
  `askSkill` accepts the new
  `providerHint?` parameter + resolves
  the provider.
- New: `apps/node/test/run-owner-agent-turn-routing.test.ts`
  tests for the new dispatch path (~5
  e2e tests, including the cost-flag-on /
  cost-flag-off paths).

### Sub-chunk v1.5.3 — doc closeout (1 commit)

- New: `docs/agent-harness-integration-v1-5.md` —
  this doc gets the "DONE" stamp.
- Modify: `docs/agent-harness-integration.md` —
  add v1.5 status to the change log.
- Modify: `docs/agent-network-engine.md` §2.2.2 —
  note v1.5's per-prompt cost cap (dormant
  by default; off-by-default env var) +
  provider hint (always on).

**Total: 3 sub-chunks, bundled into 1 commit at the
end of v1.5** (per the v1.1 + v1.2 + v1.3 + v1.4
commit pattern). On `envoy_harness_integration`
branch.

## 6. Out of scope (deferred)

- **Inline `/model:NAME` hint** — force a
  specific model (e.g. `/model:gpt-4o`).
  Future v1.5.x or v1.5+; not in v1.5
  scope.
- **Per-prompt opt-out `!openclaw`** —
  v1.6.
- **OpenClaw tags as negative signals**
  — v1.7.
- **Multi-model cost cap (`/cost:N` per
  model)** — v1.5+; the v1.5 cap is
  per-call.
- **Cost cap history UI** — show the
  user "you've spent $X this month" in
  the Settings panel. v1.5+ future.

## 7. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — Q5 multi-provider signal hints)
- [`agent-harness-integration-v1-4.md`](./agent-harness-integration-v1-4.md)
  (the v1.4 Tauri UI affordances)
- [`agent-harness-integration-step5.md`](./agent-harness-integration-step5.md)
  (the v0 router — `HINT_PREFIXES` for `!eh` / `/eh`)
- [`user-prompt-router.ts`](../../apps/node/src/user-prompt-router.ts)
  (the v0 + v1.1 + v1.2 + v1.3 router; the
  v1.5 hint extraction lives here)
- [`node-service-impl.ts`](../../apps/node/src/node-service-impl.ts)
  (the host — `askEnvoyHarnessSkill` at line 4944;
  v1.5 changes the costCeilingUsd source to
  `decision.costCapUsd ?? skill.costCeilingUsd ?? 1.0`)
- [`runtime.ts`](../../apps/node/src/agent-runtime-envoy/runtime.ts)
  (the EH runtime — `askSkill` at line ??; v1.5
  adds `providerHint?` parameter + cost cap
  enforcement)
- [`skills.ts`](../../envoy-harness/packages/envoy-harness-adapter/src/skills.ts)
  (the EH skill descriptors — `costCeilingUsd?: number` at line 55)
- [`owner-agent-loop.ts`](../../packages/api/src/owner-agent-loop.ts)
  (the `OwnerAgentTurnResult` — the v1.5
  `costCapUsd` + `providerHint` may be
  surfaced here for the Tauri UI)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Hint syntax | **Slash-prefixed inline** — `/cost:0.5` or `/provider:openai` anywhere in the prompt |
| **Q2** | Hint position | **Anywhere in the prompt** — `/cost:0.5 explain the mesh` works the same as `explain the mesh /cost:0.5` |
| **Q3** | Multiple hints per prompt | **Multiple hints allowed** — `/cost:0.5 /provider:openai` parses both; first occurrence wins on duplicates |
| **Q4** | Invalid cost cap value | **Fall back to per-skill default** — `/cost:abc` is parsed, fails `Number.isFinite`, dropped from the decision; the per-skill `costCeilingUsd` is used |
| **Q5** | Unknown provider name | **Fall back to node's default** — `/provider:foo` is parsed, recorded on the decision; the host passes the hint to the runtime for the audit log; the runtime doesn't switch providers (the adapter doesn't support it yet) |
| **Q6** | Cost cap exceeded behavior | (Deferred — the cost feature is dormant; the runtime doesn't enforce a cap. When the future chunk enables the runtime cost tracking, the cap exceeded behavior will be "fall through to OpenClaw" per the original v1.5 plan.) |
| **Q7** | Cost precedence (when the flag is on) | **`/cost:N` > per-skill `costCeilingUsd` > v0 default (1.0)** — explicit hint wins. The helper `readEffectiveCostCapUsd` enforces the precedence; the env-var flag gates the per-prompt hint. |
| **Q8** | Provider precedence | **`/provider:NAME` > node's default** — explicit hint wins. The hint is recorded on the decision + passed to the runtime; the runtime logs it in the audit trail. |
| **Q9** | Cost feature flag location | **Env var only** — `ENVOY_HARNESS_COST_CAP_ENABLED=1` (default off). Simpler than the v1.4-style persisted + helper pattern. The cost feature is dormant; a single env var is enough until the runtime has real cost tracking. |
| **Q10** | Cost feature flag default | **Off** (v0 behavior — `/cost:N` is parsed + recorded on the decision, but the runtime uses the per-skill default at runtime) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.5.1 + v1.5.2 + v1.5.3 bundled | 1 commit on `envoy_harness_integration` branch. v1.5.1: `extractPromptHints` helper + `INLINE_HINT_REGEX` (slash-prefixed, anywhere in prompt) + `RouteUserPromptDecision` gains `costCapUsd?` + `providerHint?` + `cleanPrompt` + 12 unit tests for `extractPromptHints` + 4 integration tests. v1.5.2: EH runtime's `ask` + `askSkill` accept `providerHint?` (logged in audit trail; dormant — adapter doesn't switch providers yet) + `NodeServiceImpl.askEnvoyHarness` + `askEnvoyHarnessSkill` accept `opts?` + `readEffectiveCostCapUsd` helper (env-var gated) + dispatch in `runOwnerAgentTurnViaRuntime` threads the hints + 5 e2e tests. v1.5.3: doc closeout (this DONE stamp + `agent-harness-integration.md` change log entry + `agent-network-engine.md` §2.2.2 update + `taui-agent-routing-settings.md` v1.5 Tauri UI section). |

**Total:** 1 commit, 19 new tests (12 + 4 + 3 + 5 — the 3 from "v0" regression clean stays), 277 pre-existing tests on the affected paths regression-clean. No new type errors. The **end-user-first** principle from `AGENTS.md` drove the v1.5 framing: the Tauri UI is the primary UX (friendly dropdowns + sliders); the prompt hints are the power-user escape hatch (developer-style syntax). The cost feature is dormant by default — no confusing UI yet.

## What landed in v1.5 (key file references)

**Backend (Node side):**
- `apps/node/src/user-prompt-router.ts` — `INLINE_HINT_REGEX` + `COST_CAP_ENABLED_ENV_VAR` + `extractPromptHints` helper + `ParsedPromptHints` interface + `RouteUserPromptDecision` gains `costCapUsd?` + `providerHint?` + `cleanPrompt`
- `apps/node/src/agent-runtime-envoy/runtime.ts` — `RealEnvoyHarnessAskOptions.providerHint?` + `RealEnvoyHarnessAskSkillOptions.providerHint?` + the `ask` + `askSkill` log the hint
- `apps/node/src/node-service-impl.ts` — `COST_CAP_ENABLED_ENV_VAR` const + `readEffectiveCostCapUsd` helper + `askEnvoyHarness` + `askEnvoyHarnessSkill` accept `opts?`
- `apps/node/src/node-service-handlers-run-owner-agent-turn.ts` — the dispatch uses `decision.cleanPrompt` + passes the hints to the ask methods
- `apps/node/src/node-service-contexts.ts` — the wiring updates

**Tests:**
- `apps/node/test/user-prompt-router.test.ts` — 12 new `extractPromptHints` tests + 4 new `routeUserPrompt` integration tests (12 + 4 = 16 new; 77 total in the file)
- `apps/node/test/run-owner-agent-turn-routing.test.ts` — 5 new dispatch e2e tests (39 total in the file)

**Docs:**
- `docs/agent-harness-integration-v1-5.md` (NEW) — this sub-plan
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-network-engine.md` — §2.2.2 v1.5 section
- `docs/taui-agent-routing-settings.md` — v1.5 Tauri UI section (per-message Model dropdown + Spending limit slider + owner-wide defaults in Settings)
- `docs/agent-harness-integration-v1-4.md` — v1.4 status note (v1.5 builds on v1.4)
