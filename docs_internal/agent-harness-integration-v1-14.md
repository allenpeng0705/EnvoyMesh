# envoy-harness integration — v1.14 sub-plan (per-runtime routing extension)

> **Status:** 🔄 **IN PROGRESS** (2026-08-21).
> Sub-plan written; implementation in
> progress. 1 commit target on
> `envoy_harness_integration` branch
> (the user delegates the commit; bundled
> v1.14.1 + v1.14.2 into a single commit
> at the end of v1.14, per the v1.4-v1.13
> pattern). ~10 new unit tests + 268
> pre-existing tests regression-clean on
> the affected paths expected. No new
> type errors expected.
>
> **What this doc covers:** v1.14 in
> **concrete detail** — every file path,
> every type, every test, every commit
> boundary, and the design questions for
> team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 + v1.6 + v1.7 + v1.8 + v1.9 +
> v1.10 + v1.11 + v1.13 are done. v1.9
> ships the data structure (the
> per-runtime tag map). v1.14 ships the
> **actual routing extension** — the
> router now scans all 7 runtimes' tag
> lists (not just EH + OpenClaw) + the
> dispatch falls back to OpenClaw when
> the matched runtime isn't supported
> on the home node. The home node today
> only has adapters for EH + OpenClaw;
> pi / hermes / codex / openhuman are
> future runtime support. v1.14 ships
> the routing vocabulary + the dispatch
> fallback; the actual runtime adapters
> are a v1.14+ future.

## 1. Goal

**Extend the Tauri chat router to scan all
7 runtimes' tag lists + extend the
dispatch to handle the 5 new runtimes
(with a fallback to OpenClaw when the
runtime isn't supported on the home
node).** v1.9 ships the data structure
(`extractTagsByRuntime` +
`runtimeTags: Partial<Record<AgentRuntime, ReadonlyArray<string>>>`);
v1.14 consumes that data structure to
make the routing decision.

**Why now (the v1.9 "Out of scope"
section):** v1.9 ships the per-runtime
tag map; the actual per-runtime routing
extension is a v1.9+ future. v1.14 is
that future. v1.14 is a **routing
vocabulary extension** — the router
can now recommend any of the 7
runtimes, but the dispatch is EH +
OpenClaw only (other runtimes fall
back to OpenClaw with a warning). The
actual runtime adapters for pi /
hermes / codex / openhuman are a
v1.14+ future.

**The v1.14 scope:** the type change
(`RouteUserPromptDecision.runtime` →
`AgentRuntime`) + the scan extension
(7 runtimes instead of 2) + the
precedence extension (the v1.6 + v1.7
precedence extends to 5 new runtimes) +
the dispatch fallback (non-EH + non-OpenClaw
runtimes fall back to OpenClaw) + tests
+ doc closeout. The actual runtime
adapters (the home-node-side support

## v1.15 status note (2026-08-21)

v1.15 ships the **Tauri-team handoff** for
the per-runtime tag map UI panel. v1.14
ships the routing consumption
(`runtimeTags` is consumed by the
`OTHER_RUNTIMES` scan); v1.15 is the
sub-plan + the Tauri design doc section
that tells the Tauri team what to build +
how to call the backend. The actual Tauri
UI implementation is the Tauri team's
work (out of scope for our repo).
Detailed plan:
[`agent-harness-integration-v1-15.md`](./agent-harness-integration-v1-15.md).
for pi / hermes / codex / openhuman)
are a v1.14+ future.

## 2. Existing pieces (what we build on)

### 2.1 v1.9 `runtimeTags` per-runtime tag map

**File:** `apps/node/src/user-prompt-router.ts:376` + `apps/node/src/node-service-handlers-run-owner-agent-turn.ts:547`

The v1.9 router input gains a
`runtimeTags?: Partial<Record<AgentRuntime, ReadonlyArray<string>>>`
field. The dispatch's
`readManifestView` returns the
per-runtime tag map. v1.14 consumes
the map for all 7 runtimes (not just
EH + OpenClaw).

### 2.2 v1.7 OpenClaw veto semantics

**File:** `apps/node/src/user-prompt-router.ts:691-707`

The v1.7 negative rule: when a prompt
matches an OpenClaw tag, the router
routes to OpenClaw regardless of
positive signals (veto semantics).
v1.14 preserves this; the OpenClaw
veto extends to the new runtimes (a
prompt matching an EH tag + an
OpenClaw tag still routes to OpenClaw
per the v1.7 precedence).

### 2.3 v1.6 precedence: `!openclaw` > `!eh` / `/eh`

**File:** `apps/node/src/user-prompt-router.ts:637-789`

The v1.6 precedence: explicit prefixes
win over implicit tags.
`HINT_PREFIXES = ["!openclaw", "!eh", "/eh"]`.
v1.14 preserves this; the new runtimes
don't add new hint prefixes (the
existing `!openclaw` and `!eh` cover
the opt-out cases).

### 2.4 The dispatch's runtime handling

**File:** `apps/node/src/node-service-handlers-run-owner-agent-turn.ts:260-280`

The dispatch currently handles two
runtime values:
- `"envoy-harness"` — routes to the EH
  runtime via `NodeServiceImpl.askEnvoyHarnessSkill`
- `"openclaw"` — routes to OpenClaw
  (the default; handled by the existing
  `runOwnerAgentTurnViaRuntime` flow)

For v1.14, the dispatch needs to
handle 5 more runtime values (pi /
hermes / codex / codex-cli / openhuman).
The home node today doesn't have
adapters for these; v1.14 falls
back to OpenClaw with a `chain.warn`
log for the unsupported runtime.

## 3. Design

### 3.1 The type change

**File:** `apps/node/src/user-prompt-router.ts:405` (modify)

```ts
// Before (v1.13):
export interface RouteUserPromptDecision {
  // ...
  runtime: "openclaw" | "envoy-harness";
  // ...
}

// After (v1.14):
export interface RouteUserPromptDecision {
  // ...
  runtime: AgentRuntime; // v1.14 — all 7 values
  // ...
}
```

The `AgentRuntime` type is the protocol
type from
`@envoymesh/protocol:AgentRuntimeSchema`
(7 values: `"envoy-harness"` |
`"openclaw"` | `"pi"` | `"hermes"` |
`"codex"` | `"codex-cli"` | `"openhuman"`).
The type change is a **widening** (the
existing 2-value union is a subset of
`AgentRuntime`); all existing callers
that use the 2-value union are
backward compatible.

### 3.2 The scan extension

**File:** `apps/node/src/user-prompt-router.ts:596-635` (modify)

The v1.14 router scans all 7 runtimes'
tag lists. The scan logic is the same
word-boundary algorithm (v1.1's
`findTagInPrompt`); the only change
is the vocabulary source (the
per-runtime tag map, not just EH +
OpenClaw).

```ts
// v1.14 — scan all 7 runtimes' tag lists
const allRuntimes: AgentRuntime[] = [
  "envoy-harness",
  "openclaw",
  "pi",
  "hermes",
  "codex",
  "codex-cli",
  "openhuman",
];
const runtimeSignals: Array<{
  runtime: AgentRuntime;
  matched: string; // the matched tag
}> = [];
for (const runtime of allRuntimes) {
  const vocabulary =
    input.runtimeTags?.[runtime] ?? [];
  for (const tag of vocabulary) {
    if (findTagInPrompt(input.prompt, tag)) {
      runtimeSignals.push({ runtime, matched: tag });
      break; // first match per runtime wins
    }
  }
}
```

The scan iterates over all 7 runtimes
+ records the first match per runtime.
The precedence logic (v1.6 + v1.7)
determines which runtime wins.

### 3.3 The precedence extension

**File:** `apps/node/src/user-prompt-router.ts:637-789` (modify)

The v1.6 + v1.7 precedence extends to
the 5 new runtimes. The order is:

1. `!openclaw` prefix → OpenClaw
   (opt-out-explicit; Q1 + Q3 + Q4 of
   v1.6)
2. `!eh` / `/eh` prefix → EH
   (opt-in-explicit; v0)
3. OpenClaw tag match → OpenClaw
   (veto; v1.7 Q2)
4. EH tag match → EH (v1.1 positive)
5. Other-runtime tag match → that
   runtime (v1.14 positive)
6. No match → OpenClaw (default; v0)

**Why this order (not symmetric
veto):** the v1.7 design was
"OpenClaw tags veto EH specifically"
(OpenClaw is the mature default; an
OpenClaw tag means the prompt is
OpenClaw-flavored). The v1.14
extension preserves this asymmetric
veto: OpenClaw still vetoes (matches
the v1.7 rationale); other runtimes'
tags don't veto (they're positive-only
— matching a pi tag means "route to
pi", not "block other runtimes").

**Multi-runtime match (Q3):** when
multiple runtimes match at the same
precedence level, the tie is broken
by the runtime order in the
`allRuntimes` array (envoy-harness
first, then openclaw, then pi, etc.).
The "primary" runtime wins. This is
the v1.14 default; a v1.14+ future
chunk may add a more sophisticated
tie-breaking strategy (e.g. the
v1.13 reputation score, or a
user-configured preference order).

### 3.4 The dispatch fallback

**File:** `apps/node/src/node-service-handlers-run-owner-agent-turn.ts:260-280` (modify)

The dispatch's runtime handling gains
a fallback for the 5 new runtimes
(pi / hermes / codex / codex-cli /
openhuman). The home node today
doesn't have adapters for these;
the fallback routes to OpenClaw
with a `chain.warn` log:

```ts
// v1.14 — dispatch runtime handling
const SUPPORTED_RUNTIMES: AgentRuntime[] = [
  "envoy-harness",
  "openclaw",
];
let dispatchRuntime = decision.runtime;
if (!SUPPORTED_RUNTIMES.includes(dispatchRuntime)) {
  chainWarn(
    "routing",
    `runtime ${dispatchRuntime} not supported on this node; falling back to openclaw`,
    { matchedTag: decision.signals[0]?.token },
  );
  dispatchRuntime = "openclaw";
}
```

The `chain.warn` log is the
audit-trail signal for "router
recommended runtime X, but the home
node doesn't have an adapter for X,
fell back to OpenClaw." This is
operator-visible (the Tauri team can
surface it in the chain report).

### 3.5 Test strategy

**Unit tests in `user-prompt-router.test.ts` (extend the existing file):**

1. `runtime: AgentRuntime` type change: the decision's `runtime` is now the full `AgentRuntime` (not just the 2-value union)
2. Single-runtime match: a prompt with a pi tag → routes to pi
3. Multi-runtime match: a prompt with both an EH tag and a pi tag → routes to EH (v1.14 precedence; EH wins)
4. OpenClaw veto preserved: a prompt with both an EH tag and an OpenClaw tag → routes to OpenClaw (v1.7 veto)
5. `!openclaw` opt-out preserved: a prompt starting with `!openclaw` and containing a pi tag → routes to OpenClaw (v1.6 precedence)
6. Default: a prompt with no tag → routes to OpenClaw (v0 default)
7. The 5 new runtimes' tag lists are scanned (verified by mocking runtimeTags)
8. Fallback: a non-supported runtime in the decision → falls back to OpenClaw with a `chain.warn` log
9. The dispatch's runtime handling: EH → askEnvoyHarnessSkill; OpenClaw → default; other → fallback
10. The scan order is preserved (envoy-harness first, then openclaw, etc.)

**Total: ~10 new unit tests** (extends the existing 6 + 9 + 3 + 3 + 6 = 27 tests; the file becomes 37 total).

## 4. Design questions for team sign-off

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Type change | **`RouteUserPromptDecision.runtime: AgentRuntime`** (all 7 values; widening) | Keep the 2-value union + add a separate `recommendedRuntime: AgentRuntime` field (less intrusive; breaks the existing API surface) |
| **Q2** | Precedence: OpenClaw veto | **Asymmetric (extend v1.7)** — OpenClaw still vetoes; other runtimes have positive-only semantics | Symmetric — any non-target tag vetoes (more conservative; harder to predict) |
| **Q3** | Multi-runtime match tie-break | **Runtime order in `allRuntimes`** (envoy-harness first, then openclaw, then pi, etc.) | First match wins (no order preference) |
| **Q4** | Dispatch fallback for unsupported runtimes | **Fall back to OpenClaw with a `chain.warn` log** | Throw an error (fail loud; the operator sees "router recommended pi, but pi is not supported" as an error) |
| **Q5** | Tauri UI for the per-runtime routing | **Backend + design doc only** (consistent with v1.4-v1.13) | Bundle the Tauri UI work in this chunk |
| **Q6** | Runtime adapters (pi / hermes / codex / openhuman) | **v1.14+ future** (the home node gains adapters for the new runtimes over time) | Bundle one or more adapter in v1.14 (scope creep; significant) |
| **Q7** | Sub-chunk granularity | **Single commit** (v1.14 is medium: type change + scan extension + precedence + dispatch fallback + tests + doc closeout) | Split into 2 sub-chunks (router + dispatch; not worth the overhead) |
| **Q8** | Test isolation | **Existing test files** (`user-prompt-router.test.ts` for the router; `run-owner-agent-turn-routing.test.ts` for the dispatch) | New test file (the per-runtime routing is a new concern; merits a new file) |

**Defaults at-default (Q1-Q8):** I have no strong opinion on Q1 (the type widening is the cleanest; the new-field alternative is less intrusive but breaks the existing API surface), Q2 (the v1.7 design rationale extends cleanly to v1.14; symmetric veto is more conservative but harder to predict), Q3 (runtime order is a deterministic default; first-match-wins is also valid but less predictable), Q4 (fall back to OpenClaw is the safe default; fail-loud is more explicit but breaks the user's flow), Q5 (consistent with v1.4-v1.13), Q6 (the home node gaining adapters is a significant effort; v1.14+ future is the right scope), Q7 (single commit is the right granularity for a medium change), Q8 (extend the existing test files; the per-runtime routing is not a new concern — it's an extension of the existing router + dispatch).

## 5. Plan

### Sub-chunk v1.14.1 — the type + scan + precedence + dispatch + tests (1 commit)

- Modify: `apps/node/src/user-prompt-router.ts` —
  - `RouteUserPromptDecision.runtime: AgentRuntime`
  - Scan all 7 runtimes' tag lists (the
    per-runtime tag map)
  - Extend the precedence: OpenClaw
    veto (preserved) + EH positive +
    other-runtime positive
- Modify: `apps/node/src/node-service-handlers-run-owner-agent-turn.ts` —
  - Add the `SUPPORTED_RUNTIMES` check
    + the OpenClaw fallback + the
    `chain.warn` log
- Modify: `apps/node/test/user-prompt-router.test.ts` —
  - Add ~7 unit tests for the new scan
    + precedence
- Modify: `apps/node/test/run-owner-agent-turn-routing.test.ts` —
  - Add ~3 unit tests for the dispatch
    fallback

### Sub-chunk v1.14.2 — doc closeout (1 commit)

- New: `docs/agent-harness-integration-v1-14.md` —
  this sub-plan + DONE stamp.
- Modify: `docs/agent-harness-integration.md` —
  add v1.14 status to the change log.
- Modify: `docs/agent-harness-integration-v1-9.md` —
  v1.14 status note (v1.14 ships the
  actual routing extension the v1.9
  data structure enabled; the home
  node's adapters for pi / hermes /
  codex / openhuman are a v1.14+
  future).
- Modify: `docs/taui-agent-routing-settings.md` —
  §19 (Tauri UI for the per-runtime
  routing surface; the chain report
  shows the recommended runtime + the
  dispatch fallback).

**Total: 2 sub-chunks, bundled into 1 commit at
the end of v1.14** (per the v1.4-v1.13 commit
pattern).

## 6. Out of scope (deferred)

- **Runtime adapters for pi / hermes /
  codex / openhuman (v1.14+ future)** —
  the home node today has adapters for
  EH + OpenClaw only. v1.14 ships the
  routing vocabulary + the dispatch
  fallback; the actual adapters are a
  separate effort.
- **More sophisticated tie-breaking
  (v1.14+ future)** — v1.14 uses
  runtime order; the v1.13 reputation
  score could be a future tie-breaker
  (e.g. "the matched runtime with the
  highest reputation wins").
- **Per-runtime Tauri UI (v1.15)** —
  the Tauri team picks up the actual UI.
  v1.14 ships the backend + a design
  doc.
- **Worker picker replacement
  (v1.13+ future)** — the v1.13
  tiebreaker is additive; the actual
  picker replacement is a separate
  chunk.

## 7. References

- [`agent-harness-integration-v1-9.md`](./agent-harness-integration-v1-9.md)
  (the v1.9 per-runtime tag map — v1.14
  consumes the data structure to make
  the routing decision)
- [`agent-harness-integration-v1-6.md`](./agent-harness-integration-v1-6.md)
  (the v1.6 `!openclaw` opt-out — v1.14
  preserves the precedence)
- [`agent-harness-integration-v1-7.md`](./agent-harness-integration-v1-7.md)
  (the v1.7 OpenClaw veto — v1.14
  preserves the asymmetric veto
  semantics)
- [`agent-harness-integration-v1-13.md`](./agent-harness-integration-v1-13.md)
  (the v1.13 worker picker integration
  — v1.14 + v1.13 are independent
  concerns; v1.13 is the worker
  picker; v1.14 is the Tauri chat
  router)
- [`user-prompt-router.ts`](../../apps/node/src/user-prompt-router.ts)
  (the router; v1.14 extends the type
  + the scan + the precedence)
- [`node-service-handlers-run-owner-agent-turn.ts`](../../apps/node/src/node-service-handlers-run-owner-agent-turn.ts)
  (the dispatch; v1.14 adds the
  unsupported-runtime fallback)
- [`chain-scoreboard.ts`](../../apps/node/src/chain-scoreboard.ts)
  (the v1.10 + v1.11 + v1.13 scoreboard
  — independent of v1.14; v1.14 is
  the Tauri chat router, not the
  worker picker)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Type change | **`RouteUserPromptDecision.runtime: AgentRuntime`** (all 7 values; widening; backward compatible) |
| **Q2** | Precedence: OpenClaw veto | **Asymmetric (extend v1.7)** — OpenClaw still vetoes; other runtimes have positive-only semantics |
| **Q3** | Multi-runtime match tie-break | **Runtime order in `allRuntimes`** (pi, hermes, codex, codex-cli, openhuman) |
| **Q4** | Dispatch fallback for unsupported runtimes | **Fall back to OpenClaw with a `chain.warn` log** |
| **Q5** | Tauri UI for the per-runtime routing | **Backend + design doc only** (consistent with v1.4-v1.13) |
| **Q6** | Runtime adapters (pi / hermes / codex / openhuman) | **v1.14+ future** (the home node gains adapters for the new runtimes over time) |
| **Q7** | Sub-chunk granularity | **Single commit** (v1.14 is medium: type change + scan extension + precedence + dispatch fallback + tests + doc closeout) |
| **Q8** | Test isolation | **Existing test files** (`user-prompt-router.test.ts` for the router; `run-owner-agent-turn-routing.test.ts` for the dispatch) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.14.1 + v1.14.2 bundled | 1 commit on `envoy_harness_integration` branch. v1.14.1: `RouteUserPromptDecision.runtime: AgentRuntime` (widening) + `reason: "signal-runtime"` + the v1.14 other-runtime scan (after the EH positive checks) + the dispatch's `SUPPORTED_RUNTIMES` check + the OpenClaw fallback + the `chain.warn` log. `OwnerAgentTurnResult.routingReason` gains `"signal-runtime"`. 10 new unit tests in `apps/node/test/user-prompt-router.test.ts` (single-runtime match / multi-runtime order / OpenClaw veto / EH precedence / `!openclaw` opt-out / default / empty tag list / AgentRuntime type contract). v1.14.2: doc closeout (this DONE stamp + `agent-harness-integration.md` change log entry + `agent-harness-integration-v1-9.md` v1.14 status note + `taui-agent-routing-settings.md` §19). |

**Total:** 1 commit, 10 new tests, 268 pre-existing tests regression-clean on the affected paths. No new type errors.

## What landed in v1.14 (key file references)

**Backend (Node side):**
- `apps/node/src/user-prompt-router.ts` — `RouteUserPromptDecision.runtime: AgentRuntime` (widening) + `reason: "signal-runtime"` + the v1.14 other-runtime scan (after the EH positive checks; the EH positive wins).
- `apps/node/src/node-service-handlers-run-owner-agent-turn.ts` — `SUPPORTED_RUNTIMES` check + the OpenClaw fallback for unsupported runtimes + the `chain.warn` log.
- `packages/api/src/owner-agent-loop.ts` — `OwnerAgentTurnResult.routingReason` gains `"signal-runtime"`.

**Tests:**
- `apps/node/test/user-prompt-router.test.ts` — 10 new unit tests (single-runtime match / multi-runtime order / OpenClaw veto / EH precedence / `!openclaw` opt-out / default / empty tag list / AgentRuntime type contract).

**Docs:**
- `docs/agent-harness-integration-v1-14.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-harness-integration-v1-9.md` — v1.14 status note (v1.14 ships the actual routing extension the v1.9 per-runtime tag map enabled)
- `docs/taui-agent-routing-settings.md` — §19 (Tauri UI for the per-runtime routing surface; the chat badge for `"signal-runtime"`; the dispatch fallback is operator-visible)
