# envoy-harness integration — v1.16 sub-plan (cross-model-on-same-runtime — F9.5 full primitive)

> **Status:** ✅ **DONE** (2026-08-22) — seam + production wiring.
> The EH runtime now supports per-call
> model overrides; the v1.16 primitive is
> implemented end-to-end (see "The
> implementation" below). The former
> blocker is closed: `ExecuteInput`
> gained an optional `verifierModel`
> field, `EnvoyHarnessAdapter.execute`
> forwards it to `buildAgent` as
> `providerHint`, and the EH runtime's
> buildAgent factory honors it by
> constructing a per-call `ModelAdapter`
> via `modelFactory` (parse helper:
> `parseProviderHint`, exported from
> `agent-runtime-envoy`). Production wiring: `PersistedNodeConfig.
> verifierProviderHint` (per-node config source),
> `ChainOrchestrationContext.getEnvoyHarnessAdapter()` (the live runtime
> adapter), the chain-verify pool includes `envoy-harness` when
> `isEnvoyHarnessReady()`, `buildAdapter("envoy-harness")` returns the
> live adapter, and `pickSecondRuntime` allows same-runtime verification
> when the hint is set (envoy-harness only, per Q3). Operator opt-in:
> set `verifierProviderHint` in the node config.
>
> **What this doc covers:** v1.16 in
> **concrete detail** — every file
> path, every type, the design
> questions for team sign-off, and
> the external blocker.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 + v1.6 + v1.7 + v1.8 + v1.9 +
> v1.10 + v1.11 + v1.13 + v1.14 + v1.12
> + v1.15 + v1.17 are done. v1.8 ships
> the cross-runtime primitive (F9.5
> proxy) — the cross-verify prefers a
> different model family than the
> worker. v1.16 ships the full F9.5
> primitive — the cross-verify uses a
> different **model** than the worker
> (the worker on runtime A with model
> X → verifier on runtime A with
> model Y). The cross-model-on-same-
> runtime primitive is blocked on the
> EH runtime's per-call model override
> support.

## 1. Goal

**Ship the cross-model-on-same-runtime
primitive** (the full F9.5). v1.8
ships the cross-runtime primitive (the
cross-verify prefers a different model
family). v1.16 ships the
cross-model-on-same-runtime primitive
(the cross-verify uses a different
model on the **same** runtime).

**Why now (and why blocked):** the
v1.8 `verifierModel` field is the
foundation; v1.10 uses it to weight
the cross verdicts (the `cross=1.5x`
source weight). v1.16 extends the
cross-verify path to support a
per-call `providerHint?` so the
verifier can use a different model
than the worker on the same runtime.

**The external blocker:** the EH
runtime today uses a fixed model for
the cross-verify path. v1.16 requires
the EH runtime to honor a per-call
`providerHint?` on the cross-verify
path (the same `providerHint?`
mechanism v1.5 introduced for the
free-form LLM ask). The EH runtime
implementation is a separate
envoy-harness team effort; v1.16
can't land until the EH runtime
supports the per-call model
override.

**The v1.16 scope:** the design doc
+ the design questions. The
implementation is deferred until
the EH runtime support lands.

## 2. The design (deferred implementation)

### 2.1 The v1.8 primitive (already shipped)

v1.8's `MODEL_FAMILY` table +
`pickSecondRuntime` + the cross
`VerdictEntry.verifierModel` field.
The cross-verify prefers a different
model family than the worker
(worker on envoy-harness → verifier
on openclaw; or worker on openclaw →
verifier on envoy-harness).

### 2.2 The v1.16 primitive (proposed)

The cross-verify on the same runtime
uses a different model. For example:
- Worker: envoy-harness + claude
- Verifier: envoy-harness + claude-instant
  (a different model on the same
  runtime)

The verifier's model is specified
via the `providerHint?` mechanism
(v1.5). The cross-verify path's
`providerHint?` is set by the
`buildEnvoyHarnessAdapterWithCrossVerify`
factory (the bridge's cross-verify
primitive).

### 2.3 The implementation

**File:** `apps/node/src/chain-verify-loop.ts:515-528` (modify — the cross-verify branch)

The cross-verify branch passes
`providerHint: "<verifier-model>"`
to `secondAdapter.execute(input)`. The
verifier model is the "different model
on the same runtime" — the v1.16
spec.

**File:** `packages/openclaw-runtime/src/agent-adapter.ts` (modify — the bridge's cross-verify factory)

The `buildEnvoyHarnessAdapterWithCrossVerify`
factory accepts a `verifierProviderHint?`
option. The option is passed to
`defaultCrossVerify(openClawAdapter, { providerHint: ... })`.

**File:** `apps/node/src/node-service-impl.ts` (modify — the host wiring)

The host's `createEnvoyHarnessAdapter`
forwards the `verifierProviderHint?`
to the bridge's factory.

### 2.4 The cross-verify prompt

The v1.16 verifier prompt is the
subtask's objective (matches v1.8
Q5). The verifier's `providerHint?`
is the model the verifier uses; the
verifier's prompt is the same as the
worker's (the subtask's objective).

### 2.5 The audit trail

The cross `VerdictEntry.verifierModel`
field is set to the verifier's
`providerHint?` (e.g. `"claude-instant"`).
The audit trail shows the worker
model (from the `workerRuntime` +
worker's default model) + the verifier
model (from the v1.16 `verifierProviderHint?`).

## 3. Design questions for team sign-off

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Verifier model selection | **`verifierProviderHint?` per-call option** (the host sets it based on a config) | Per-node config (`PersistedNodeConfig.verifierProviderHint`) |
| **Q2** | Verifier model default | **`claude-instant`** (a faster, cheaper model than the worker's `claude`) | Same as the worker's model (no v1.16 value; the v1.8 primitive is sufficient) |
| **Q3** | Cross-model on `openclaw` (worker on openclaw + different model on openclaw) | **Out of scope for v1.16** (the openclaw runtime doesn't yet support per-call model overrides) | Bundle the openclaw support in v1.16 (scope creep) |
| **Q4** | Cross-verify prompt | **The subtask's objective** (matches v1.8 Q5) | A custom verifier prompt (out of scope; the subtask's objective is canonical) |
| **Q5** | Audit trail | **The cross `VerdictEntry.verifierModel` field** (already in v1.8) | A new field (out of scope; the v1.8 field is sufficient) |
| **Q6** | External blocker | **The EH runtime's per-call model override support** (the envoy-harness team's effort) | N/A (the blocker is external) |
| **Q7** | Sub-chunk granularity | **Sub-plan only** (no code; the implementation is blocked) | Bundle the implementation (premature; the blocker is external) |

**Defaults at-default (Q1-Q7):** I have no strong opinion on Q1 (per-call is the right granularity; per-node config is also valid), Q2 (claude-instant is the obvious faster/cheaper alternative; a v1.16+ future can add config-driven selection), Q3 (openclaw is a different runtime; the v1.16 scope is EH-only), Q4 (the subtask's objective is canonical), Q5 (the v1.8 field is sufficient), Q6 (the blocker is external), Q7 (sub-plan only is the right scope when blocked).

## 4. Plan

### Sub-chunk v1.16.1 — the sub-plan (deferred implementation)

- New: `docs/agent-harness-integration-v1-16.md` — this sub-plan + BLOCKED stamp.
- Modify: `docs/agent-harness-integration.md` — add v1.16 status to the change log (the sub-plan ships; the implementation is deferred).
- Modify: `docs/agent-harness-integration-v1-8.md` — v1.16 status note (v1.16 is the full F9.5 primitive; blocked on the EH runtime's per-call model override support).

**No code in v1.16.** The implementation is deferred until the EH runtime support lands.

## 5. Out of scope (deferred)

- **EH runtime's per-call model override
  support** — a separate envoy-harness
  team effort. v1.16 can't land until
  this lands.
- **Cross-model on openclaw (worker on
  openclaw + different model on openclaw)**
  — the openclaw runtime doesn't yet
  support per-call model overrides. A
  v1.16+ future chunk.
- **Per-node config for the verifier
  model** — v1.16 uses a fixed default
  (`claude-instant`). A v1.16+ future
  chunk can add a per-node config
  (`PersistedNodeConfig.verifierProviderHint`).

## 6. References

- [`agent-harness-integration-v1-8.md`](./agent-harness-integration-v1-8.md)
  (the v1.8 cross-runtime primitive; v1.16
  is the full F9.5 primitive — the
  cross-model-on-same-runtime extension)
- [`chain-verify-loop.ts`](../../apps/node/src/chain-verify-loop.ts)
  (the cross-verify loop; v1.16 would
  add the `providerHint?` to the
  cross-verify branch)
- [`chain-verify-loop.ts:111-129`](../../apps/node/src/chain-verify-loop.ts)
  (the v1.8 `MODEL_FAMILY` table +
  `modelFamilyFor` helper; v1.16 would
  extend the cross-verify branch with
  the `providerHint?` parameter)
- [`taui-agent-routing-settings.md`](./taui-agent-routing-settings.md)
  (the Tauri UI design doc; v1.16 would
  add a section for the chain report
  surface that shows the cross-verify
  model)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Verifier model selection | **`verifierProviderHint?` per-call option** (the host sets it based on a config) |
| **Q2** | Verifier model default | **`claude-instant`** (a faster, cheaper model than the worker's `claude`) |
| **Q3** | Cross-model on `openclaw` | **Out of scope for v1.16** (the openclaw runtime doesn't yet support per-call model overrides) |
| **Q4** | Cross-verify prompt | **The subtask's objective** (matches v1.8 Q5) |
| **Q5** | Audit trail | **The cross `VerdictEntry.verifierModel` field** (already in v1.8) |
| **Q6** | External blocker | **The EH runtime's per-call model override support** (the envoy-harness team's effort) |
| **Q7** | Sub-chunk granularity | **Sub-plan only** (no code; the implementation is blocked) |

## What this sub-plan accomplishes

- **Locks the design** (the
  `verifierProviderHint?` per-call
  option + the `claude-instant`
  default)
- **Identifies the external blocker**
  (the EH runtime's per-call model
  override support)
- **Documents the v1.16+ future**
  (per-node config for the verifier
  model + cross-model on openclaw)

When the EH runtime support lands, a
new sub-plan can pick up the
implementation. The v1.16 sub-plan
+ the v1.8 sub-plan together document
the full F9.5 design.
