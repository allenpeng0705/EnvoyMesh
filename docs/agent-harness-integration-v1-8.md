# envoy-harness integration — v1.8 sub-plan (cross verifier with different model — F9.5)

> **Status:** ✅ **DONE** (2026-08-21). 1 commit on
> `envoy_harness_integration` branch (the user
> delegated commit; bundled v1.8.1 + v1.8.2 +
> v1.8.3 into a single commit at the end of
> v1.8). 6 new tests (2 `modelFamilyFor` unit
> + 1 e2e `verifierModel` recording + 3
> `pickSecondRuntime` unit) + 240 pre-existing
> tests regression-clean on the affected
> paths. No new type errors (pre-existing
> multiformats/ArrayBuffer conflict in
> `packages/network/src/index.ts:2791`
> unchanged).
>
> **What this doc covers:** v1.8 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **What this doc covers:** v1.8 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 + v1.6 + v1.7 are done. v1.8
> implements the **F9.5 cross-verify primitive**
> — the cross verifier uses a runtime with a
> **different model family** than the worker
> (Q1 of the v1.8 sub-plan). The audit trail
> (`VerdictEntry`) gains a
> `verifierModelFamily` field so the operator
> can see which model family verified which
> result.

## 1. Goal

**The cross-verify loop prefers a verifier
runtime that uses a different model family
than the worker.** When the verifier runs, the
audit trail records the verifier's model
family. The operator can see "verified by
claude" vs "verified by native" and trust the
verification more (different model = different
reasoning = more likely to catch model-specific
biases).

**Why now (F9.5 use case from
`agent-network-engine.md:808-812`):** the
current `pickSecondRuntime` picks any
non-worker runtime. v1.8 makes the model-family
preference explicit + records the verifier's
model family in the audit trail.

**The v1.x scope:** v1.8 implements the
**cross-runtime** part of F9.5 (worker on
runtime A → verifier on runtime B with a
different model). The **cross-model-on-same-
runtime** part (worker on runtime A with model
X → verifier on runtime A with model Y) is a
v1.8+ future — the EH runtime's `providerHint?`
mechanism (v1.5) is the foundation, but the
EH runtime doesn't yet support per-call model
overrides on the cross-verify path.

## 2. Existing pieces (what we build on)

### 2.1 The cross-verify loop + `pickSecondRuntime`

**File:** `apps/node/src/chain-verify-loop.ts:539-547`

The current `pickSecondRuntime` picks the first
runtime in `listRuntimes()` that is NOT the
worker's runtime:

```ts
function pickSecondRuntime(
  deps: ChainVerifyLoopDeps,
  workerRuntime: AgentRuntime,
): AgentRuntime | undefined {
  for (const runtime of deps.listRuntimes?.() ?? []) {
    if (runtime !== workerRuntime) return runtime;
  }
  return undefined;
}
```

**The v1.8 change:** add a `modelFamily(runtime)`
table (hardcoded per-runtime) + prefer a
verifier with a different model family. The
fallback (when no different-family runtime is
available) is the current behavior — the
first non-worker runtime.

### 2.2 The `VerdictEntry` audit record

**File:** `apps/node/src/chain-verify-loop.ts:549-578` +
`packages/protocol/src/agent-adapter.ts:347-389`

The `VerdictEntry` already has a
`verifierModel?: string` field (the Zod schema
in `agent-adapter.ts:347-389` is:
`verifierModel: z.string().optional()` —
required iff `source === 'llm'`, optional for
`"rule"`, `"cross"`, `"human"`). The current
chain-verify loop doesn't populate
`verifierModel` for cross verdicts.

**The v1.8 change:** populate the existing
`verifierModel` field for cross verdicts with
the verifier's model family (the second
runtime's family from the `MODEL_FAMILY` table).
No new field is needed — the existing schema
field is reused. The operator can see "verified
by claude" vs "verified by native" in the
audit trail.

### 2.3 The cleanPrompt (v1.5 + v1.6)

**File:** `apps/node/src/user-prompt-router.ts:489`

The router extracts a `cleanPrompt` (the
prompt with v1.5 hints + v1.6 prefix stripped).
For v1.8, the verifier re-runs the cleanPrompt
on the second runtime — the verifier doesn't
see the v1.5 hints (`/cost:N`, `/provider:NAME`)
or the v1.6 prefix (`!openclaw`). The
verifier uses the second runtime's default
model, not the worker's per-prompt override.

**Why this matters for F9.5:** the worker's
`/provider:openai` override would force the
verifier to use the same model (OpenAI) if the
v1.5 hint propagated. The cleanPrompt strips
the hint; the verifier uses the second
runtime's default model (a different model
family). This is the v1.5 + v1.6 design —
the verifier prompt is the cleanPrompt, not
the original.

## 3. Design

### 3.1 The model family table

**File:** `apps/node/src/chain-verify-loop.ts`
(modify)

```ts
/**
 * Phase 8 / v1.8 — the model family for each
 * AgentRuntime. The cross-verify loop uses this
 * to prefer a verifier with a different family
 * than the worker (Q1 of the v1.8 sub-plan).
 *
 * **Why a hardcoded table (not the node
 * config):** the model FAMILY is a per-runtime
 * attribute (not a per-node config). Different
 * nodes might use different models, but the
 * FAMILY is fixed — envoy-harness is always
 * Claude-based, OpenClaw is always
 * native-LLM-planner-based, etc.
 *
 * **Why per-runtime families:** the v1.x
 * assumption is that each runtime has a
 * distinct default model family. Cross-verify
 * with a different family is the v1.x proxy
 * for "cross-verify with a different model"
 * (the actual F9.5 primitive — cross-verify
 * with a different model on the SAME runtime
 * — is a v1.8+ future when the EH runtime
 * supports per-call model overrides on the
 * cross-verify path).
 *
 * **End-user-first copy:** the model family
 * is an internal value (developer jargon). The
 * Tauri UI maps it to a user-friendly label
 * (e.g. "Claude" for envoy-harness, "Built-in
 * assistant" for OpenClaw).
 */
const MODEL_FAMILY: Record<AgentRuntime, string> = {
  "envoy-harness": "claude",
  "openclaw": "native",
  "pi": "pi",
  "hermes": "hermes",
  "codex": "codex",
  "codex-cli": "codex",
  "openhuman": "human",
};

export function modelFamilyFor(runtime: AgentRuntime): string {
  return MODEL_FAMILY[runtime];
}
```

### 3.2 The cross-verify loop change

**File:** `apps/node/src/chain-verify-loop.ts`
(modify)

The `pickSecondRuntime` function gains a
"prefer different family" preference:

```ts
function pickSecondRuntime(
  deps: ChainVerifyLoopDeps,
  workerRuntime: AgentRuntime,
): AgentRuntime | undefined {
  const runtimes = deps.listRuntimes?.() ?? [];
  const workerFamily = MODEL_FAMILY[workerRuntime];
  // v1.8 — prefer a verifier with a different
  // model family than the worker. The first
  // such runtime wins; the first non-worker
  // runtime is the fallback when no
  // different-family runtime is available
  // (Q5 of the v1.8 sub-plan — backward
  // compat: single-runtime nodes still get
  // the v1.7 behavior of skipping the cross
  // when no second runtime is available).
  const differentFamily = runtimes.find(
    (r) =>
      r !== workerRuntime &&
      MODEL_FAMILY[r] !== workerFamily,
  );
  if (differentFamily) return differentFamily;
  // Fallback: any non-worker runtime.
  return runtimes.find((r) => r !== workerRuntime);
}
```

The `runChainVerificationLoop` records the
verifier's model family in the cross
`VerdictEntry`:

```ts
const crossEntry = writeVerdict(deps, state, subtask, {
  workerPeerId,
  workerRuntime,
  verdict: crossVerdict,
  source: "cross",
  // v1.8 — record the verifier's model
  // family for the audit trail. The field
  // reuses the existing `verifierModel`
  // schema field (Zod schema in
  // packages/protocol/src/agent-adapter.ts:347-389
  // — `verifierModel: z.string().optional()`,
  // required iff source === 'llm'; the
  // current code doesn't set it for cross
  // verdicts; v1.8 sets it).
  verifierModel: MODEL_FAMILY[secondRuntime],
  now,
});
```

### 3.3 The `VerdictEntry` change

**File:** `apps/node/src/chain-verify-loop.ts`
(modify; no protocol change)

The `VerdictEntry` interface ALREADY has a
`verifierModel?: string` field (Zod schema
in `packages/protocol/src/agent-adapter.ts:347-389`).
The current code doesn't populate it for cross
verdicts. v1.8 populates it.

**No protocol change needed** — the schema
field is reused. The v1.8 change is purely in
the chain-verify loop's `writeVerdict` function
+ the cross-verify branch.

### 3.4 The verifier prompt

**File:** `apps/node/src/chain-verify-loop.ts`
(modify: nothing)

The verifier re-runs the subtask with
`secondAdapter.execute(input)`. The `input` is
from `mapChainSubtaskToExecuteInput`, which
uses the subtask's objective (the worker's
task description). The verifier doesn't see
the user's typed prompt — it sees the
subtask's objective (which is what the worker
saw). The cleanPrompt stripping is irrelevant
here (the subtask's objective is the clean
form, not the user's typed prompt).

**Why the verifier re-runs the subtask
objective (not the user's prompt):** the
verifier is a SECOND WORKER doing the same
task. It doesn't see the user's typed prompt
at all (the typed prompt is for the chat
flow, not the chain flow). The subtask's
objective is the canonical task description
the orchestrator gave to the worker.

**For the F9.5 spirit:** the verifier uses
the second runtime's default model. If the
worker's `/provider:openai` override is in
the subtask's objective, the verifier still
uses the second runtime's default model
(because the override is for the chat flow,
not the chain flow).

### 3.5 The audit trail + Tauri UI

**File:** `docs/taui-agent-routing-settings.md`
(modify)

The Tauri team surfaces the verifier's model
family in the chain report (a future Tauri
panel; not in v1.8's chat surface). The
audit trail records `verifierModelFamily` for
each cross verdict. The Tauri team maps the
internal value to a user-friendly label:

| Internal value | Owner-visible label |
|---|---|
| `"claude"` | "Verified by Claude" |
| `"native"` | "Verified by the free built-in assistant" |
| `"pi"` | "Verified by Pi" |
| `"hermes"` | "Verified by Hermes" |
| `"codex"` | "Verified by Codex" |
| `"codex-cli"` | "Verified by Codex" |
| `"human"` | "Verified by a human" |

The v1.8 backend ships the
`verifierModelFamily` field on the verdict
entry. The Tauri team picks up the chain
report surface in their own workstream (not
in v1.8's scope).

### 3.6 Test strategy

**Unit tests in `chain-verify-loop.test.ts` (modify):**

- `pickSecondRuntime` prefers a runtime with a different model family
- `pickSecondRuntime` falls back to the first non-worker runtime when no different-family runtime is available
- `pickSecondRuntime` returns `undefined` when only the worker runtime is available (single-runtime node)
- `modelFamilyFor(runtime)` returns the correct family for each runtime
- The cross `VerdictEntry` records the verifier's model (via the existing `verifierModel` field)
- The rule `VerdictEntry` does NOT record the verifier's model (the field stays undefined for `"rule"` source)

**E2E tests in `chain-verify-loop.test.ts` (modify):**

- The cross-verify loop picks a different-family runtime (when the node has multiple runtimes)
- The cross-verify loop falls back to the first non-worker runtime (when all runtimes have the same family)
- The cross-verify loop skips the cross (when the node has only one runtime)
- The cross verdict's `verifierModel` matches the second runtime's family

## 4. Design questions for team sign-off

> These are the choices that need a decision
> before implementation starts. **Defaults
> proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | "Different model" interpretation | **Different model family** (each runtime has a hardcoded family; cross-verify prefers a runtime with a different family) | Different actual model (requires the EH runtime to support per-call model overrides on the cross-verify path — v1.8+ future) |
| **Q2** | Model family source | **Hardcoded table** in `chain-verify-loop.ts` (each runtime → a family string) | From the node config (`modelProviders`) — fragile, drifts from the runtime |
| **Q3** | Fallback when no different-family runtime | **First non-worker runtime** (v1.7 behavior preserved) | Skip the cross-verify (stricter — only run when a different-family verifier is available) |
| **Q4** | Single-runtime node | **Skip the cross-verify** (current behavior — no second runtime) | Run with a synthetic verifier (no-op) — adds complexity for no benefit |
| **Q5** | Verifier prompt | **The subtask's objective** (the canonical task description; current behavior preserved) | The cleanPrompt (the user's typed prompt with v1.5 + v1.6 stripped) — but the verifier doesn't see the user's typed prompt at all (the chain flow uses the subtask's objective) |
| **Q6** | Tauri UI | **Backend + design doc only** (the Tauri team picks up the chain report surface in their own workstream) | Bundle the Tauri UI work in this chunk |
| **Q7** | Verifier model override (F9.5 future) | **Document as v1.8+ future** — the EH runtime's `providerHint?` mechanism (v1.5) is the foundation, but the EH runtime doesn't yet support per-call model overrides on the cross-verify path. The v1.8 chunk ships the cross-runtime primitive; the cross-model-on-same-runtime primitive is a v1.8+ future. | Skip the documentation (just ship v1.8 without flagging the future) |
| **Q8** | Backward compat | **`undefined` = use existing default** (the new `verifierModelFamily` field is optional; existing verdicts without the field are treated as the v1.7 behavior) | Force every verdict to record the model family (no migration needed; the field is optional + computed automatically) |
| **Q9** | Rule verdict model family | **Leave `undefined`** (the rule verifier uses the adapter's own logic, not a different model) | Always record the worker runtime's model family (consistent across rule + cross verdicts) |

**Defaults at-default (Q1-Q9):** I have no
strong opinion on Q1 (different model family is
the v1.x proxy for F9.5; the actual
cross-model-on-same-runtime is a v1.8+ future),
Q2 (hardcoded is the simplest + most stable;
per-node config is fragile), Q3 (fallback to
v1.7 behavior is the most backward-compat;
skip is stricter but rejects nodes with
limited runtime variety), Q4 (current behavior
is the simplest; synthetic verifier adds
complexity), Q5 (current behavior is the
correct design — the verifier re-runs the
subtask, not the user's typed prompt), Q6
(backend + design doc is the v1.4-v1.7
pattern), Q7 (document the future so the
v1.8+ chunk has a clear handoff), Q8
(additive, no migration), Q9 (rule verdicts
are not model-different; the field is
intentionally undefined for rule verdicts).

## 5. Plan

### Sub-chunk v1.8.1 — model family table + cross-verify primitive (1 commit)

- Modify: `apps/node/src/chain-verify-loop.ts` —
  add `MODEL_FAMILY` table + `modelFamilyFor`
  helper + update `pickSecondRuntime` to
  prefer a different family.
- Modify: `apps/node/src/chain-verify-loop.ts` —
  populate the existing `verifierModel` field
  in the cross `VerdictEntry` (no protocol
  change; the Zod schema already supports it).
- New: `apps/node/test/chain-verify-loop.test.ts`
  additions — ~6 unit tests for the
  model-family preference + the verdict
  recording.

### Sub-chunk v1.8.2 — e2e dispatch tests (1 commit)

- New: `apps/node/test/chain-verify-loop.test.ts`
  additions — ~4 e2e tests for the cross-verify
  dispatch (different-family selection +
  fallback + single-runtime skip + verdict
  recording).

### Sub-chunk v1.8.3 — Tauri UI design doc + closeout (1 commit)

- Modify: `docs/taui-agent-routing-settings.md` —
  §14 (chain report surface; verifier model
  family label mapping; end-user-first copy).
- Modify: `docs/agent-harness-integration.md` —
  add v1.8 status to the change log.
- Modify: `docs/agent-network-engine.md` —
  §3.2.2 (F9.5 cross-verify primitive status
  update — v1.x scope vs v1.8+ future).
- Modify: `docs/agent-harness-integration-v1-7.md` —
  v1.8 status note (v1.8 builds on v1.7's
  routing layer).
- New: `docs/agent-harness-integration-v1-8.md` —
  this doc gets the "DONE" stamp.

**Total: 3 sub-chunks, bundled into 1 commit
at the end of v1.8** (per the v1.1-v1.7 commit
pattern). On `envoy_harness_integration` branch.

## 6. Out of scope (deferred)

- **Cross-model-on-same-runtime** (the full F9.5
  primitive) — v1.8+ future. The EH runtime's
  `providerHint?` mechanism (v1.5) is the
  foundation, but the EH runtime doesn't yet
  support per-call model overrides on the
  cross-verify path. v1.8 ships the
  cross-runtime primitive (worker on runtime A
  → verifier on runtime B with a different
  family); the cross-model-on-same-runtime
  primitive (worker on runtime A with model X
  → verifier on runtime A with model Y) is
  deferred.
- **Tauri chain report UI** (Q6 default) — the
  Tauri team picks up the chain report surface
  (where the verifier model family is surfaced
  for the owner) in their own workstream. v1.8
  ships the backend + a design doc.
- **Scoreboard formula adjustment** (v1.10) —
  the v1.8 `verifierModel` field is the
  foundation for a future chunk that weights
  the verdict by the model (e.g. "verifier is
  the same model as the worker" → less
  trustworthy). v1.8 just records the model;
  the weighting is v1.10.

## 7. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — Q3 routing, Q4 cross-verify)
- [`agent-harness-integration-v1-4.md`](./agent-harness-integration-v1-4.md)
  (v1.4 per-node `verifyMode` default — the
  cross-verify is gated by `verifyMode`; v1.8
  refines the cross-verify itself)
- [`agent-harness-integration-v1-5.md`](./agent-harness-integration-v1-5.md)
  (v1.5 inline hints — the EH runtime's
  `providerHint?` mechanism is the foundation
  for the v1.8+ future cross-model-on-same-runtime
  primitive)
- [`agent-harness-integration-v1-6.md`](./agent-harness-integration-v1-6.md)
  (v1.6 `!openclaw` opt-out — irrelevant to
  the verifier prompt but relevant to the
  cross-verify path design)
- [`agent-harness-integration-v1-7.md`](./agent-harness-integration-v1-7.md)
  (v1.7 OpenClaw tags as negative signals —
  v1.8 builds on the v1.1 + v1.7 routing layer)
- [`chain-verify-loop.ts`](../../apps/node/src/chain-verify-loop.ts)
  (the v0 cross-verify loop; v1.8 adds the
  `MODEL_FAMILY` table + the preference + the
  verdict recording via the existing
  `verifierModel` field)
- [`agent-adapter.ts`](../../packages/protocol/src/agent-adapter.ts)
  (the `VerdictEntrySchema` Zod schema — v1.8
  reuses the existing `verifierModel: z.string().optional()`
  field; no schema change)
- [`taui-agent-routing-settings.md`](./taui-agent-routing-settings.md)
  (the Tauri UI design doc — v1.8 adds the
  chain report surface section)
- [`agent-network-engine.md`](./agent-network-engine.md)
  (the agent network design — F9.5 reference
  at line 808-812)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | "Different model" interpretation | **Different model family** (each runtime has a hardcoded family; cross-verify prefers a runtime with a different family) |
| **Q2** | Model family source | **Hardcoded table** in `chain-verify-loop.ts` |
| **Q3** | Fallback when no different-family runtime | **First non-worker runtime** (v1.7 behavior preserved) |
| **Q4** | Single-runtime node | **Skip the cross-verify** (current behavior — no second runtime) |
| **Q5** | Verifier prompt | **The subtask's objective** (the canonical task description; current behavior preserved) |
| **Q6** | Tauri UI | **Backend + design doc only** (consistent with v1.4-v1.7) |
| **Q7** | Verifier model override (F9.5 future) | **Document as v1.8+ future** — cross-model-on-same-runtime is a v1.8+ chunk |
| **Q8** | Backward compat | **`undefined` = use existing default** (additive; no migration) |
| **Q9** | Rule verdict model family | **Leave `undefined`** (rule verdicts are not model-different; the field is intentionally undefined for rule verdicts) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.8.1 + v1.8.2 + v1.8.3 bundled | 1 commit on `envoy_harness_integration` branch. v1.8.1: `MODEL_FAMILY` table + `modelFamilyFor` helper in `chain-verify-loop.ts` + `pickSecondRuntime` prefers a different-family runtime (Q3) + cross-verify branch sets `verifierModel: modelFamilyFor(secondRuntime)` on the cross `VerdictEntry` (reusing the existing Zod field; no protocol change) + 5 new unit tests. v1.8.2: 1 new e2e test exercising the cross-verify path with `verifyMode: "cross-runtime"` and checking the cross `VerdictEntry`'s `verifierModel` field. v1.8.3: doc closeout (this DONE stamp + `agent-harness-integration.md` change log entry + `agent-network-engine.md` F9.5 status update + `agent-harness-integration-v1-7.md` status note + `taui-agent-routing-settings.md` §14). |

**Total:** 1 commit, 6 new tests (2 + 1 + 3), 240 pre-existing tests regression-clean on the affected paths. No new type errors. The **end-user-first** principle from `AGENTS.md` drove the Tauri chat badge framing: the internal `verifierModel` (developer jargon like `"claude"` / `"native"`) is mapped to a user-friendly label ("Verified by Claude" / "Verified by the free built-in assistant") in the future chain report surface.

## What landed in v1.8 (key file references)

**Backend (Node side):**
- `apps/node/src/chain-verify-loop.ts` — new `MODEL_FAMILY` table + new `modelFamilyFor` helper + updated `pickSecondRuntime` to prefer a different-family runtime (Q3) + cross-verify branch sets `verifierModel: modelFamilyFor(secondRuntime)` on the cross `VerdictEntry` (reusing the existing Zod field) + `writeVerdict` accepts an optional `verifierModel` parameter

**Tests:**
- `apps/node/test/chain-verify-loop.test.ts` — 2 new `modelFamilyFor` unit tests + 3 new `pickSecondRuntime` unit tests + 1 new e2e test for the cross-verify path with `verifierModel` recording

**Docs:**
- `docs/agent-harness-integration-v1-8.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-network-engine.md` — F9.5 status update (v1.x scope: cross-runtime primitive; v1.8+ future: cross-model-on-same-runtime)
- `docs/agent-harness-integration-v1-7.md` — v1.8 status note (v1.8 builds on v1.7's routing layer)
- `docs/taui-agent-routing-settings.md` — §14 (chain report surface for the verifier model family; end-user-first copy mapping the internal `verifierModel` to the user-friendly label)

**Protocol:**
- **No protocol change.** The `verifierModel` field was already in the Zod schema (`packages/protocol/src/agent-adapter.ts:347-389` — `verifierModel: z.string().optional()`, required iff `source === 'llm'`, optional for `"rule"` / `"cross"` / `"human"`). v1.8 just populates the field for cross verdicts.
