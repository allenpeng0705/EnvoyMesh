# envoy-harness integration — v1.11 sub-plan (wire the scoreboard into the orchestrator)

> **Status:** ✅ **DONE** (2026-08-21). 1 commit
> on `envoy_harness_integration` branch (the
> user delegates the commit). Foundation chunk
> extension: builds on v1.10's
> `reputationFromVerdicts` producer. ~10 new
> unit tests + 252 pre-existing tests
> regression-clean on the affected paths. No
> new type errors expected.
>
> **What this doc covers:** v1.11 in
> **concrete detail** — every file path,
> every type, every test, every commit
> boundary, and the design questions for
> team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 + v1.6 + v1.7 + v1.8 + v1.9 +
> v1.10 are done. v1.10 ships the scoreboard
> formula (the **producer**) — a pure function
> that takes `VerdictEntry[]` and returns
> `[-1, 1]`. v1.11 ships the **wiring helper**
> that reads the verdicts from the chain's
> `ArbitrationStore` + calls the formula +
> maps the result to the consumer's expected
> scale. The actual integration into the
> orchestrator's call site (the worker
> picker's `reputationBySkill` field) is
> **v1.13** (next chunk).

## 1. Goal

**Ship the wiring helper that reads the
3-tuple reputation from the
`ArbitrationStore` and returns the score in
the consumer's expected scale.** v1.10 ships
the formula (`reputationFromVerdicts`); v1.11
adds the I/O layer that reads from the store.
The helper is a small, pure function that
takes the store + the 3-tuple criteria and
returns the worker's reputation in `[0, 1]`
(or `undefined` when there's no usable
signal). The actual integration into the
worker picker's `reputationBySkill` field is
**v1.13** (the call site that builds the
`PlanAssignRosterEntry` for the picker).

**Why now (per the v1.10 sub-plan's "Out of
scope" section):** v1.10 ships the producer
side; the consumer side needs the I/O layer
(v1.11) + the call-site integration (v1.13).
v1.11 is the small wiring chunk that closes
the gap between the formula and the store.
v1.13 is the bigger chunk that plugs the
wiring into the worker picker.

**The v1.11 scope:** the wiring helper +
tests + a doc closeout. The call-site
integration (where the orchestrator's worker
picker reads the reputation to populate
`reputationBySkill`) is v1.13.

## v1.12 status note (2026-08-21)

v1.12 ships the **Tauri-team handoff** for
the scoreboard badge UI. v1.11 ships
the per-3-tuple wiring helper
(`getWorkerReputation`); v1.12 is the
sub-plan + the Tauri design doc section
that tells the Tauri team how to call
the helper. The actual Tauri UI
implementation is the Tauri team's work
(out of scope for our repo). Detailed
plan:
[`agent-harness-integration-v1-12.md`](./agent-harness-integration-v1-12.md).

## 2. Existing pieces (what we build on)

### 2.1 v1.10 `reputationFromVerdicts`

**File:** `apps/node/src/chain-scoreboard.ts:186-225`

The v1.10 producer takes `VerdictEntry[]` and
returns a `[-1, 1]` score. v1.11 calls this
function; no change to the formula.

### 2.2 `getVerdictsFor` (the store reader)

**File:** `apps/node/src/chain-arbitration.ts:137-154`

The store's verdict reader takes an
`ArbitrationStore` + optional 3-tuple criteria
(`workerPeerId?`, `workerRuntime?`, `skillId?`)
and returns the matching `VerdictEntry[]`
sorted by `issuedAt`. v1.11 calls this with
all three criteria set (the 3-tuple).

### 2.3 The `requiresReputationApproval` consumer (sensitivity gate)

**File:** `apps/node/src/chain-sensitivity-gate.ts:76-100`

The sensitivity gate takes
`workerReputation: number` (in `[0, 1]`, per
the `MIN_REP_FOR_SENSITIVITY` thresholds) +
`workerVerdictCount: number`. **Currently
defined but never called** in the production
code path. v1.11 doesn't wire the new helper
into the gate (the gate has no call site
yet); v1.13 is for the worker picker (which
does have a call site).

### 2.4 The `reputationBySkill` consumer (worker picker)

**File:** `apps/node/src/chain-plan-assign.ts:67-72, 86-108`

The worker picker's `PlanAssignRosterEntry`
has a `reputationBySkill?` field (per-skill
reputation in `[0, 1]`). The
`skillReputation` + `blendScoreWithReputation`
functions consume the field as a soft
tiebreaker (with `REPUTATION_BLEND_WEIGHT =
0.2`). **The field has no producer** — it's
set by an external caller. v1.11 ships the
producer; v1.13 wires the producer into the
caller (where the orchestrator builds the
`PlanAssignRosterEntry`).

## 3. Design

### 3.1 The wiring helper

**File:** `apps/node/src/chain-scoreboard.ts` (modify)

Add `getWorkerReputation(store, criteria)`
alongside the v1.10
`reputationFromVerdicts`:

```ts
import type { AgentRuntime, VerdictEntry } from "@envoymesh/protocol";
import { getVerdictsFor, type ArbitrationStore } from "./chain-arbitration.js";

/**
 * Phase 8 / v1.11 — the 3-tuple reputation
 * wiring helper. Reads the worker's verdicts
 * from the `ArbitrationStore` for the given
 * `(peer, runtime, skill)` 3-tuple + calls
 * `reputationFromVerdicts` (the v1.10
 * producer) + maps the result to the
 * consumer's expected scale.
 *
 * **Why a separate function (not inlined in
 * the caller):** the 3-tuple reputation
 * lookup is the canonical way to read a
 * worker's reputation. Centralizing the
 * store-read + formula-call + scale-mapping
 * keeps the consumer-side code (v1.13's
 * worker picker integration) clean. The
 * helper also encapsulates the "empty /
 * disputed → no signal" decision
 * (the function returns `undefined` when
 * there's no usable signal; the consumer
 * treats `undefined` as "no reputation" per
 * the existing `chain-plan-assign.ts`
 * convention).
 *
 * **Scale mapping:** the v1.10 producer
 * returns `[-1, 1]` (the natural range for a
 * weighted-average formula with `fail =
 * -weight`). The consumers
 * (`chain-plan-assign.ts:78-79` `clamp01` +
 * `chain-sensitivity-gate.ts:27-31`
 * `MIN_REP_FOR_SENSITIVITY`) expect `[0, 1]`.
 * The helper maps via `(score + 1) / 2`:
 * - `raw = -1.0` → `0.0` (worst)
 * - `raw =  0.0` → `0.5` (neutral)
 * - `raw = +1.0` → `1.0` (best)
 *
 * **Why map at the wiring point (not in the
 * formula):** the formula is the
 * mathematical spec — `[-1, 1]` is the
 * natural range for a weighted average with
 * negative contributions. Changing the
 * formula to return `[0, 1]` would either
 * lose the `fail` direction (no way to
 * distinguish "neutral" from "worst") or
 * require a different formula structure.
 * Mapping at the wiring point keeps the
 * formula pure + reusable (e.g. for the
 * future Tauri UI, which might want to show
 * a -100 to +100 bar; the formula's
 * `[-1, 1]` is the right shape for that).
 *
 * **Empty input (Q3 of the v1.11 design
 * questions):** returns `undefined` (the
 * consumer treats `undefined` as "no
 * reputation" — preserves the existing
 * `chain-plan-assign.ts:skillReputation`
 * convention). The caller doesn't need to
 * distinguish "no history" from "neutral";
 * the existing convention handles both.
 *
 * **All-disputed input:** returns
 * `undefined` (the verifier couldn't decide
 * for any of the verdicts; no usable signal;
 * same as empty input). The formula's
 * `disputed = 0` semantics (Q3 of v1.10) is
 * preserved — the disputed verdicts are
 * skipped, not counted.
 *
 * @param store The chain's
 *   `ArbitrationStore` (the authoritative
 *   verdict ledger).
 * @param criteria The 3-tuple to query:
 *   - `workerPeerId` — the worker's peer id
 *   - `workerRuntime` — the worker's runtime
 *   - `skillId` — the skill being judged
 * @returns The worker's reputation in
 *   `[0, 1]`, or `undefined` when there's
 *   no usable signal (empty / all-disputed).
 */
export function getWorkerReputation(
  store: ArbitrationStore,
  criteria: {
    workerPeerId: string;
    workerRuntime: AgentRuntime;
    skillId: string;
  },
): number | undefined {
  const verdicts = getVerdictsFor(store, criteria);
  if (verdicts.length === 0) return undefined; // no history
  // Check whether any verdict has a usable
  // signal (not disputed). If all are
  // disputed, return `undefined` (no usable
  // signal).
  const hasUsableSignal = verdicts.some(
    (v: VerdictEntry) => v.verdict.kind !== "disputed",
  );
  if (!hasUsableSignal) return undefined;
  const raw = reputationFromVerdicts(verdicts); // [-1, 1]
  // Map [-1, 1] to [0, 1].
  return (raw + 1) / 2;
}
```

### 3.2 Why map at the wiring point (not in the formula)

The v1.10 formula's `[-1, 1]` is the
mathematical spec for a weighted average with
`fail = -weight`. Changing the formula to
return `[0, 1]` would either:
- Lose the `fail` direction (no way to
  distinguish "neutral" from "worst"), or
- Require a different formula structure
  (e.g. `sum(contribution * 0.5 + 0.5) /
  sum(weight)` — convoluted, harder to
  reason about, doesn't match the v1.10
  spec).

Mapping at the wiring point is the
cleanest: the formula stays pure (v1.10's
locked spec), the consumers get the scale
they expect (`[0, 1]`), and the mapping
itself is a one-liner (`(raw + 1) / 2`)
that's trivial to test.

### 3.3 Test strategy

**Unit tests in `chain-scoreboard.test.ts` (extend the existing v1.10 file):**

1. `getWorkerReputation(store, 3-tuple)` with no verdicts → `undefined`
2. With all `pass` (rule) at score 1.0 → `1.0` (the mapped max)
3. With all `fail` (rule) → `0.0` (the mapped min)
4. With mixed `pass` (0.5) → `0.75` (raw 0.5 → mapped 0.75)
5. With all `disputed` → `undefined` (no usable signal)
6. Filter works: verdicts for OTHER (peer, runtime, skill) are excluded
7. Mapping check: raw `0` (neutral) → mapped `0.5`; raw `1` → mapped `1`; raw `-1` → mapped `0`
8. Mixed-source case: human pass + rule fail → mapped to the correct `[0, 1]` value
9. The function uses `getVerdictsFor` correctly (the 3-tuple filter is honored)
10. The function returns a number in `[0, 1]` (or `undefined`) for any input

**Total: ~10 new unit tests** (extends the existing 30 tests; the file becomes 40 total).

## 4. Design questions for team sign-off

> These are the choices that need a decision
> before implementation starts. **Defaults
> proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Function name | **`getWorkerReputation(store, criteria)`** — reads the 3-tuple from the store + returns the mapped reputation | `readWorkerReputation` (verb prefix; less common in this codebase); or `reputationFromStore` (matches the v1.10 `reputationFromVerdicts` naming) |
| **Q2** | Scale mapping | **`(raw + 1) / 2`** at the wiring point (raw `[-1, 1]` → consumer `[0, 1]`) | Update `MIN_REP_FOR_SENSITIVITY` to `[-1, 1]` (changes existing gate behavior; risks breaking changes) |
| **Q3** | Empty input | **Return `undefined`** (the existing `chain-plan-assign.ts:skillReputation` convention treats `undefined` as "no reputation") | Return `0.5` (the mapped neutral; requires the consumer to treat `0.5` as "neutral" not "no history") |
| **Q4** | All-disputed input | **Return `undefined`** (no usable signal; same as empty input) | Return `0.5` (the mapped neutral; same problem as Q3 alt) |
| **Q5** | Tauri UI scope | **Backend + design doc only** (consistent with v1.4-v1.10; the Tauri team picks up the UI) | Bundle the Tauri UI work in this chunk (significant scope) |
| **Q6** | Call-site integration | **v1.13** (the actual worker-picker integration is a separate chunk; v1.11 is the wiring helper only) | Bundle the call-site integration in v1.11 (larger scope; risks scope creep) |
| **Q7** | `requiresReputationApproval` consumer | **No call site** in v1.11 (the gate is defined but never called in production; v1.13 is the call-site integration for the worker picker; the gate is a separate concern) | Wire the new helper into the gate's caller in v1.11 (no caller exists yet, so this is moot) |
| **Q8** | Sub-chunk granularity | **Single commit** (v1.11 is small: 1 function + tests + doc closeout) | Split into 2 sub-chunks (formula-call + scale-mapping; not worth the overhead for a 1-function chunk) |

**Defaults at-default (Q1-Q8):** I have no
strong opinion on Q1 (`getWorkerReputation`
matches the codebase's verb-prefix
convention; `reputationFromStore` matches
the v1.10 `reputationFromVerdicts`
naming), Q2 (mapping at the wiring point
is the cleanest; changing the formula
breaks the v1.10 spec), Q3 (the
`undefined` convention is the existing
`chain-plan-assign.ts` pattern; changing
it would break the consumer), Q4 (same
reasoning as Q3), Q5 (consistent with
v1.4-v1.10), Q6 (v1.11 is the small
wiring chunk; v1.13 is the call-site
integration), Q7 (no caller exists for
the gate; v1.13 is the picker
integration, not the gate), Q8 (single
commit is the right granularity for a
1-function chunk).

## 5. Plan

### Sub-chunk v1.11.1 — the wiring helper + tests (1 commit)

- Modify: `apps/node/src/chain-scoreboard.ts` —
  add `getWorkerReputation(store, criteria)`
  function. Imports `getVerdictsFor` +
  `ArbitrationStore` from `chain-arbitration.ts`.
- Modify: `apps/node/test/chain-scoreboard.test.ts`
  — add ~10 unit tests for the new helper
  (empty input / all-pass / all-fail /
  all-disputed / mixed / mapping / filter
  correctness / boundary cases).

### Sub-chunk v1.11.2 — doc closeout (1 commit)

- New: `docs/agent-harness-integration-v1-11.md`
  — this sub-plan + DONE stamp.
- Modify: `docs/agent-harness-integration.md` —
  add v1.11 status to the change log.
- Modify: `docs/agent-harness-integration-v1-10.md`
  — v1.11 status note (v1.11 ships the
  consumer-side wiring the v1.10 producer
  needs; the worker picker integration is
  v1.13).
- Modify: `docs/taui-agent-routing-settings.md`
  — §17 (Tauri UI for the worker trust
  badge; the `getWorkerReputation` helper
  is what the Tauri team calls from the
  Tauri side).

**Total: 2 sub-chunks, bundled into 1 commit at
the end of v1.11** (per the v1.4-v1.10 commit
pattern). On `envoy_harness_integration` branch.

## 6. Out of scope (deferred)

- **Worker picker integration (v1.13)** —
  v1.11 ships the wiring helper; the
  orchestrator's call site that populates
  `reputationBySkill` is v1.13. v1.11 is
  the small wiring chunk; v1.13 is the
  call-site integration.
- **Tauri UI for the worker trust badge
  (v1.12)** — the `getWorkerReputation`
  helper is the backend interface; the
  Tauri team picks up the actual UI. v1.12
  ships the design + the backend exposure
  pattern; the Tauri team implements the
  panel.
- **`requiresReputationApproval` call
  site** — the gate is defined but
  uncalled. v1.13 is the worker picker
  integration (which uses
  `chain-plan-assign.ts:reputationBySkill`,
  NOT the gate). The gate's first caller
  is a separate concern; deferred until
  there's a use case.
- **Worker ranking replacement (the
  v1.13 prototype is "tiebreaker", not
  "replacement")** — v1.13 ships the
  additive tiebreaker (matches the
  existing `chain-plan-assign.ts`
  `REPUTATION_BLEND_WEIGHT = 0.2`
  design). Replacing the picker's
  primary + best-fit strategy with a
  fully scoreboard-driven rank is a
  v1.13+ future.
- **Per-node source weight tuning** — the
  v1.10 `SCOREBOARD_SOURCE_WEIGHTS` is
  a hardcoded global table. Per-node
  tuning (Tauri UI override) is a v1.10+
  future.

## 7. References

- [`agent-harness-integration-v1-10.md`](./agent-harness-integration-v1-10.md)
  (the v1.10 scoreboard formula — v1.11
  adds the wiring helper that calls
  `reputationFromVerdicts`)
- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — the orchestrator's worker
  picker is the consumer)
- [`chain-scoreboard.ts`](../../apps/node/src/chain-scoreboard.ts)
  (the v1.10 producer + the v1.11 wiring
  helper; the new function extends the
  same module)
- [`chain-arbitration.ts`](../../apps/node/src/chain-arbitration.ts)
  (the `ArbitrationStore` + `getVerdictsFor`
  reader; the v1.11 helper reads verdicts
  via `getVerdictsFor(store, 3-tuple)`)
- [`chain-sensitivity-gate.ts`](../../apps/node/src/chain-sensitivity-gate.ts)
  (the `requiresReputationApproval` gate;
  defined but uncalled; not wired in v1.11)
- [`chain-plan-assign.ts`](../../apps/node/src/chain-plan-assign.ts)
  (the worker picker's `reputationBySkill`
  consumer; the v1.13 call-site integration
  plugs the v1.11 helper into this consumer)
- [`taui-agent-routing-settings.md`](./taui-agent-routing-settings.md)
  (the Tauri UI design doc — v1.11 adds
  §17 for the worker trust badge)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Function name | **`getWorkerReputation(store, criteria)`** — reads the 3-tuple from the store + returns the mapped reputation (or `undefined`) |
| **Q2** | Scale mapping | **`(raw + 1) / 2`** at the wiring point (raw `[-1, 1]` → consumer `[0, 1]`) |
| **Q3** | Empty input | **Return `undefined`** (the existing `chain-plan-assign.ts:skillReputation` convention treats `undefined` as "no reputation") |
| **Q4** | All-disputed input | **Return `undefined`** (no usable signal; same as empty input) |
| **Q5** | Tauri UI scope | **Backend + design doc only** (consistent with v1.4-v1.10) |
| **Q6** | Call-site integration | **v1.13** (the actual worker-picker integration is a separate chunk) |
| **Q7** | `requiresReputationApproval` consumer | **No call site** in v1.11 (the gate is defined but never called; v1.13 is the worker picker integration) |
| **Q8** | Sub-chunk granularity | **Single commit** (v1.11 is small: 1 function + tests + doc closeout) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.11.1 + v1.11.2 bundled | 1 commit on `envoy_harness_integration` branch. v1.11.1: `getWorkerReputation(store, criteria)` added to `apps/node/src/chain-scoreboard.ts` (imports `getVerdictsFor` + `ArbitrationStore` from `chain-arbitration.ts`). Maps `[-1, 1]` → `[0, 1]` at the wiring point. Returns `undefined` for empty + all-disputed inputs. 10 new unit tests in `apps/node/test/chain-scoreboard.test.ts`. v1.11.2: doc closeout (this DONE stamp + `agent-harness-integration.md` change log entry + `agent-harness-integration-v1-10.md` v1.11 status note (v1.11 ships the consumer-side wiring the v1.10 producer needs) + `taui-agent-routing-settings.md` §17 (Tauri UI for the worker trust badge; the `getWorkerReputation` helper is what the Tauri team calls)). |

**Total:** 1 commit, 10 new tests, 252 pre-existing tests regression-clean on the affected paths. No new type errors.

## What landed in v1.11 (key file references)

**Backend (Node side):**
- `apps/node/src/chain-scoreboard.ts` — new `getWorkerReputation(store, criteria)` function (the v1.11 wiring helper). Reads the 3-tuple verdicts via `getVerdictsFor` + calls `reputationFromVerdicts` (v1.10 producer) + maps the result from `[-1, 1]` to `[0, 1]`. Returns `undefined` for empty + all-disputed inputs.

**Tests:**
- `apps/node/test/chain-scoreboard.test.ts` — 10 new unit tests (empty input / all-pass / all-fail / all-disputed / mixed-source / mapping / filter correctness / boundary cases / clamp invariant / `getVerdictsFor` integration).

**Docs:**
- `docs/agent-harness-integration-v1-11.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-harness-integration-v1-10.md` — v1.11 status note (v1.11 ships the consumer-side wiring the v1.10 producer needs)
- `docs/taui-agent-routing-settings.md` — §17 (Tauri UI for the worker trust badge; the `getWorkerReputation` helper is the backend the Tauri team calls)

## v1.13 status note (2026-08-21)

v1.13 ships the **consumer-side
integration** — the orchestrator's
worker picker's `reputationBySkill`
field is now populated from the v1.10
+ v1.11 producer (replacing the v0
`chain-reputation-3tuple.ts:deriveReputationBySkillForPeer`
for the worker-picker call site). v1.13
adds `getReputationBySkillForPeer(stores, peerId)`
to `apps/node/src/chain-scoreboard.ts`
— the per-peer projection that iterates
over the chain stores + calls
`getWorkerReputation` (the v1.11
per-3-tuple helper) for each
`(runtime, skill)` combination +
builds a per-skill reputation map (MAX
across runtimes per skill — the "best
foot forward" semantic). The
orchestrator's `deriveRosterReputation`
(in
`node-service-chain-orchestration.ts:279-285`)
is swapped to use the new helper. The
v0 `chain-reputation-3tuple.ts` module
is **left in place** (other callers may
depend on it; v1.13 only replaces the
worker-picker producer).

**v1.13 scope:** the projection helper
+ the call-site swap + tests + a doc
closeout. The actual worker-picker
replacement (a fully scoreboard-driven
rank instead of the current primary +
best-fit strategy) is a v1.13+ future.
Detailed plan:
[`agent-harness-integration-v1-13.md`](./agent-harness-integration-v1-13.md).
