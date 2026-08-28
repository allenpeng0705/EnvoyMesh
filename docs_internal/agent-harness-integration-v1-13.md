# envoy-harness integration — v1.13 sub-plan (worker ranking integration)

> **Status:** ✅ **DONE** (2026-08-21). 1 commit
> on `envoy_harness_integration` branch (the
> user delegates the commit; bundled v1.13.1
> + v1.13.2 into a single commit at the end
> of v1.13, per the v1.4-v1.11 pattern). ~6
> new unit tests + 262 pre-existing tests
> regression-clean on the affected paths. No
> new type errors expected.
>
> **What this doc covers:** v1.13 in
> **concrete detail** — every file path,
> every type, every test, every commit
> boundary, and the design questions for
> team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 + v1.6 + v1.7 + v1.8 + v1.9 +
> v1.10 + v1.11 are done. v1.10 ships the
> scoreboard formula (the **producer**).
> v1.11 ships the **wiring helper** that
> reads the 3-tuple from the store. v1.13
> ships the **consumer-side integration**
> — the worker picker's
> `reputationBySkill` field is populated
> from the v1.11 helper, replacing the v0
> `chain-reputation-3tuple.ts` producer
> for the worker-picker call site.

## 1. Goal

**Wire the v1.11 `getWorkerReputation`
helper into the worker picker's
`reputationBySkill` field.** The worker
picker already has a consumer-side
mechanism (`chain-plan-assign.ts:PlanAssignRosterEntry.reputationBySkill`
+ the `skillReputation` +
`blendScoreWithReputation` functions +
the `REPUTATION_BLEND_WEIGHT = 0.2`
constant). v1.13 ships the **producer**
that populates `reputationBySkill` from
the v1.10 scoreboard formula, replacing
the v0 `chain-reputation-3tuple.ts:deriveReputationBySkillForPeer`
producer for the worker-picker call
site. The v0 module is **left in place**
(it has other callers; v1.13 only
replaces the worker-picker producer).

**Why now:** v1.10 ships the formula;
v1.11 ships the per-3-tuple wiring
helper. The worker picker's existing
consumer is **ready** — it just needs
a producer. v1.13 closes the loop.

**The v1.13 scope:** the per-peer
projection helper (`getReputationBySkillForPeer`)
+ the worker-picker call-site swap
(replace `deriveRosterReputation` in
`node-service-chain-orchestration.ts`
to use the new helper) + tests + doc
closeout. The v0
`chain-reputation-3tuple.ts` module is
**left in place** (other callers may
depend on it; the v0 module is not

## v1.12 status note (2026-08-21)

v1.12 ships the **Tauri-team handoff** for
the scoreboard badge UI. v1.13 ships
the per-peer projection helper
(`getReputationBySkillForPeer`); v1.12
is the sub-plan + the Tauri design doc
section that tells the Tauri team how
to call the helper + the per-skill
reputation display. The actual Tauri UI
implementation is the Tauri team's
work (out of scope for our repo).
Detailed plan:
[`agent-harness-integration-v1-12.md`](./agent-harness-integration-v1-12.md).
broken — just superseded for this
specific use).

## 2. Existing pieces (what we build on)

### 2.1 v1.11 `getWorkerReputation` (per-3-tuple wiring)

**File:** `apps/node/src/chain-scoreboard.ts:307-355`

The v1.11 helper reads the verdicts for a
single `(peer, runtime, skill)` 3-tuple
from the store + calls
`reputationFromVerdicts` + maps the
result. v1.13 builds a higher-level helper
on top of v1.11: the per-peer projection
that iterates over all (runtime, skill)
combinations.

### 2.2 The v0 3-tuple reputation book

**File:** `apps/node/src/chain-reputation-3tuple.ts`

The v0 module ships:
- `scoreFromVerdicts(verdicts, opts)` — the
  v0 weighted formula (recency-weighted;
  returns `[0, 1]`)
- `ReputationBook3Tuple` — an in-memory
  class (not currently used by the worker
  picker)
- `deriveReputationBySkillForPeer(verdicts, peerId)`
  — the v0 per-peer projection (mixes
  runtimes per skill; returns a
  `Record<SkillId, ReputationScore>`)

**v1.13 doesn't deprecate the v0 module.**
The v0 module has its own tests +
`getLocalRuntimePassRate` (a
federated-scoreboard consumer with
different semantics). v1.13 only replaces
the worker-picker producer.

### 2.3 The worker picker's `reputationBySkill` consumer

**File:** `apps/node/src/chain-plan-assign.ts:67-72, 86-108`

The consumer is already wired:
- `PlanAssignRosterEntry.reputationBySkill?: Readonly<Record<string, number>>`
- `skillReputation(entry, skillKey)` — extracts
  the per-skill reputation
- `blendScoreWithReputation(baseScore, reputation)`
  — soft addend (`REPUTATION_BLEND_WEIGHT = 0.2`)
- The picker's prompt (line 247) tells the
  LLM: "When reputationBySkill is present
  for the step's requiredSkill, use it as
  a further tiebreaker (higher reputation
  wins)."

The consumer is **ready** — it just needs
a producer. v1.13 ships the producer.

### 2.4 The current producer (`deriveRosterReputation`)

**File:** `apps/node/src/node-service-chain-orchestration.ts:279-285`

The current producer is:
```ts
function deriveRosterReputation(peerId: string): Record<string, number> | undefined {
  const verdicts: VerdictEntry[] = [];
  for (const store of chainArbitrationStores.values()) {
    verdicts.push(...getVerdictsFor(store, { workerPeerId: peerId }));
  }
  return deriveReputationBySkillForPeer(verdicts, peerId);
}
```

This iterates over all chain stores +
groups verdicts by skill (mixing runtimes
per skill) + calls the v0
`scoreFromVerdicts`. v1.13 replaces the
v0 call with the v1.10
`reputationFromVerdicts` (via a new
per-peer projection helper).

## 3. Design

### 3.1 The per-peer projection helper

**File:** `apps/node/src/chain-scoreboard.ts` (modify — extend v1.11)

Add `getReputationBySkillForPeer(store, peerId)`
alongside the v1.11 `getWorkerReputation`:

```ts
/**
 * Phase 8 / v1.13 — the per-peer projection
 * helper. Iterates over all chain stores
 * for a given peerId + calls
 * `getWorkerReputation` (the v1.11
 * per-3-tuple wiring) for each
 * `(runtime, skill)` combination + builds
 * a per-skill reputation map.
 *
 * **Why a separate function (not inline in
 * the orchestrator):** the per-peer
 * projection is the canonical way to feed
 * the worker picker's `reputationBySkill`
 * field. Centralizing the projection
 * keeps the orchestrator's call site
 * clean + lets us test the projection
 * directly.
 *
 * **Flatten-across-runtimes semantic:**
 * the worker picker doesn't know a
 * worker's runtime ahead of assignment,
 * so the per-skill map mixes verdicts
 * across runtimes. For each skill, we
 * take the MAX reputation across all
 * (runtime, skill) tuples (the worker's
 * best historical performance on the
 * skill, regardless of runtime). The MAX
 * is the right "best foot forward"
 * semantic for tiebreaking — a worker
 * who excelled on OpenClaw is a better
 * pick than a worker who only ran the
 * skill badly.
 *
 * **Why MAX (not MEAN or LATEST):**
 * - MEAN: dilutes the strong signal; a
 *   worker with one good run + one bad
 *   run looks "average" — wrong for
 *   tiebreaking.
 * - LATEST: rewards recency; a worker
 *   with a recent bad run after a long
 *   history of good runs is unfairly
 *   penalized.
 * - MAX: rewards the best performance;
 *   the worker's history of bad runs
 *   doesn't override the good ones for
 *   tiebreaking purposes.
 *
 * **Empty input (Q3):** returns
 * `undefined` (the picker treats
 * `undefined` as "no reputation" per the
 * existing `chain-plan-assign.ts:skillReputation`
 * convention).
 *
 * @param stores The chain stores to
 *   search (the orchestrator passes all
 *   `chainArbitrationStores.values()`).
 *   The function does NOT own the store
 *   list — the caller passes them in.
 * @param peerId The peer's id.
 * @returns The per-skill reputation map
 *   in `[0, 1]`, or `undefined` when
 *   the peer has no usable signal.
 */
export function getReputationBySkillForPeer(
  stores: Iterable<ArbitrationStore>,
  peerId: string,
): Record<string, number> | undefined {
  const bySkill = new Map<string, number>();
  for (const store of stores) {
    // Iterate over the store's verdict entries
    // for this peer; group by (runtime, skill);
    // take the per-3-tuple reputation via
    // getWorkerReputation; flatten to per-skill
    // via MAX across runtimes.
    for (const verdict of store.values()) {
      if (!isVerdictEntry(verdict)) continue;
      if (verdict.workerPeerId !== peerId) continue;
      const rep = getWorkerReputation(store, {
        workerPeerId: verdict.workerPeerId,
        workerRuntime: verdict.workerRuntime,
        skillId: verdict.skillId,
      });
      if (rep === undefined) continue; // no usable signal for this 3-tuple
      const key = verdict.skillId;
      const current = bySkill.get(key);
      if (current === undefined || rep > current) {
        bySkill.set(key, rep);
      }
    }
  }
  if (bySkill.size === 0) return undefined;
  return Object.fromEntries(bySkill);
}
```

### 3.2 Why MAX across runtimes (not MEAN)

The v0 `deriveReputationBySkillForPeer`
**averages** verdicts across runtimes per
skill (one formula call per skill with
all verdicts mixed). This is OK for a
soft tiebreaker (the v0 score is just a
number in `[0, 1]`; the picker uses
`REPUTATION_BLEND_WEIGHT = 0.2`).

For v1.13, the cleaner approach is to
**iterate per 3-tuple** + take the MAX
across runtimes. The MAX semantic is:
"the worker's best historical
performance on this skill, regardless
of runtime." This is the right "best foot
forward" tiebreaker semantic.

The v0 MEAN approach is also valid; both
are within the v1.13 scope. v1.13 picks
MAX because it gives the picker a
stronger signal (the worker's best, not
the worker's average). If the user
prefers MEAN, the swap is trivial (one
line in the helper).

### 3.3 The orchestrator call-site swap

**File:** `apps/node/src/node-service-chain-orchestration.ts:279-285` (modify)

Replace `deriveRosterReputation` to use
the new helper:

```ts
import { getReputationBySkillForPeer } from "./chain-scoreboard.js";

function deriveRosterReputation(peerId: string): Record<string, number> | undefined {
  return getReputationBySkillForPeer(
    chainArbitrationStores.values(),
    peerId,
  );
}
```

The orchestrator still passes the same
data (all `chainArbitrationStores.values()`)
+ the same `peerId`. The producer is
replaced; the consumer (the worker
picker's `reputationBySkill` field) is
unchanged.

### 3.4 The v0 module is left in place

The v0 `chain-reputation-3tuple.ts`
module is **not touched** in v1.13:

- `scoreFromVerdicts` is still used by
  `getLocalRuntimePassRate` (a
  federated-scoreboard consumer with
  different semantics)
- `ReputationBook3Tuple` is an in-memory
  class (not used by the worker picker)
- `deriveReputationBySkillForPeer` is no
  longer used by the worker picker (the
  v1.13 call site replaces it), but the
  v0 function still works for any other
  caller

The v0 module is **deprecated but not
removed**. v1.13 doesn't introduce a
deprecation warning (that would be
intrusive); a v1.13+ future chunk can
remove the v0 module + the
`getLocalRuntimePassRate` consumer (or
migrate it to the v1.10 + v1.11 producer).

### 3.5 Test strategy

**Unit tests in `chain-scoreboard.test.ts` (extend the existing v1.10 + v1.11 file):**

1. `getReputationBySkillForPeer(stores, peerId)` with no stores → `undefined`
2. With no verdicts for the peer → `undefined`
3. With verdicts for a single (runtime, skill) → returns `{ skill: reputation }`
4. With verdicts for the same skill on multiple runtimes → returns the MAX across runtimes
5. With verdicts for multiple skills → returns all of them in the map
6. With verdicts that have no usable signal (all-disputed) → the skill is excluded
7. The flatten-across-runtimes semantic: a worker with a high rep on runtime A and a low rep on runtime B gets the MAX

**Total: ~6 new unit tests** (extends the existing 40 tests; the file becomes 46 total).

## 4. Design questions for team sign-off

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Function name | **`getReputationBySkillForPeer(stores, peerId)`** — matches the v0 naming (the v0 function is `deriveReputationBySkillForPeer`; the v1.13 is a v1.10-based equivalent) | `reputationBySkillForPeer` (drop the "get" prefix) |
| **Q2** | Flatten-across-runtimes semantic | **MAX** across runtimes per skill (best foot forward; rewards the worker's best historical performance) | MEAN (the v0 semantic; dilutes strong signals); LATEST (rewards recency; unfair to workers with old good runs) |
| **Q3** | Empty input | **Return `undefined`** (the existing `chain-plan-assign.ts:skillReputation` convention) | Return `{}` (forces the caller to handle the "no history" case explicitly) |
| **Q4** | No usable signal per 3-tuple | **Skip the 3-tuple** (the skill is excluded from the map) | Include the 3-tuple with `0` (penalizes the worker for disputed verdicts) |
| **Q5** | Stores parameter | **`Iterable<ArbitrationStore>`** (the orchestrator passes `chainArbitrationStores.values()`) | Take a single store + iterate over `chainArbitrationStores` inside the function (couples to the orchestrator's global state) |
| **Q6** | v0 module deprecation | **Leave the v0 module in place** (other callers may depend on it; v1.13 only replaces the worker-picker producer) | Add a deprecation warning (intrusive; risks breaking external callers) |
| **Q7** | `getLocalRuntimePassRate` consumer | **No change in v1.13** (the federated-scoreboard consumer has different semantics; not the v1.13 scope) | Migrate `getLocalRuntimePassRate` to the v1.10 producer in v1.13 (scope creep; separate chunk) |
| **Q8** | Sub-chunk granularity | **Single commit** (v1.13 is small: 1 function + 1 call-site swap + tests + doc closeout) | Split into 2 sub-chunks (helper + call-site swap; not worth the overhead for a small change) |

**Defaults at-default (Q1-Q8):** I have no strong opinion on Q1 (`getReputationBySkillForPeer` is the natural name; matches the v0 convention), Q2 (MAX is the right "best foot forward" semantic; MEAN is also valid but less informative), Q3 (the `undefined` convention is the existing `chain-plan-assign.ts` pattern), Q4 (skipping the 3-tuple is consistent with the v1.11 `undefined` convention; including `0` would penalize the worker unfairly), Q5 (taking `Iterable<ArbitrationStore>` keeps the function decoupled from the orchestrator's global state; the caller passes the stores in), Q6 (leaving the v0 module in place is the safe default; the v0 module has its own tests + other callers), Q7 (the federated-scoreboard consumer is a different concern; v1.13 is the worker-picker integration), Q8 (single commit is the right granularity for a small change).

## 5. Plan

### Sub-chunk v1.13.1 — the projection helper + call-site swap + tests (1 commit)

- Modify: `apps/node/src/chain-scoreboard.ts` —
  add `getReputationBySkillForPeer(stores, peerId)`
  function. Imports `isVerdictEntry` from
  `chain-arbitration.ts`.
- Modify: `apps/node/src/node-service-chain-orchestration.ts`
  — replace `deriveRosterReputation` to
  use the new helper. The orchestrator
  still passes `chainArbitrationStores.values()`.
- Modify: `apps/node/test/chain-scoreboard.test.ts`
  — add ~6 unit tests for the new helper
  (empty / single-3-tuple / multi-runtime
  MAX / multi-skill / all-disputed /
  no-verdicts).

### Sub-chunk v1.13.2 — doc closeout (1 commit)

- New: `docs/agent-harness-integration-v1-13.md`
  — this sub-plan + DONE stamp.
- Modify: `docs/agent-harness-integration.md`
  — add v1.13 status to the change log.
- Modify: `docs/agent-harness-integration-v1-11.md`
  — v1.13 status note (v1.13 wires the
  v1.11 helper into the worker picker's
  `reputationBySkill` field; the v0
  `chain-reputation-3tuple.ts` module
  is left in place for other callers).
- Modify: `docs/taui-agent-routing-settings.md`
  — §18 (Tauri UI for the per-skill
  reputation display; the
  `getReputationBySkillForPeer` helper
  is the backend the Tauri team calls).

**Total: 2 sub-chunks, bundled into 1 commit at
the end of v1.13** (per the v1.4-v1.11 commit
pattern).

## 6. Out of scope (deferred)

- **Worker picker replacement** — v1.13
  is the **additive tiebreaker** (the
  existing `chain-plan-assign.ts:REPUTATION_BLEND_WEIGHT = 0.2`
  design). Replacing the picker's
  primary + best-fit strategy with a
  fully scoreboard-driven rank is a
  v1.13+ future.
- **v0 module deprecation / removal** —
  the v0 `chain-reputation-3tuple.ts`
  module is left in place; a v1.13+
  future chunk can remove it (after
  all callers have migrated).
- **`getLocalRuntimePassRate` migration**
  — the federated-scoreboard consumer
  in `node-service-chain-orchestration.ts:293-302`
  uses the v0 `scoreFromVerdicts`. A
  v1.13+ future chunk can migrate it to
  the v1.10 producer.
- **Per-runtime routing extension
  (v1.14)** — separate chunk.
- **Tauri UI for the scoreboard badge
  (v1.12)** — the Tauri team picks up
  the actual UI. v1.12 ships the design
  + the backend exposure pattern; v1.13
  is the orchestrator-side integration.
- **Federated scoreboard trust (v1.10+
  future)** — deferred per the design
  (mesh-wide identity layer is the
  blocker).

## 7. References

- [`agent-harness-integration-v1-10.md`](./agent-harness-integration-v1-10.md)
  (the v1.10 scoreboard formula — v1.13
  is the worker-picker consumer of the
  v1.10 + v1.11 producer)
- [`agent-harness-integration-v1-11.md`](./agent-harness-integration-v1-11.md)
  (the v1.11 per-3-tuple wiring helper —
  v1.13 builds the per-peer projection on
  top of v1.11)
- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — the worker picker is
  the consumer)
- [`chain-scoreboard.ts`](../../apps/node/src/chain-scoreboard.ts)
  (the v1.10 producer + the v1.11
  per-3-tuple helper + the v1.13
  per-peer projection; all three in the
  same module)
- [`chain-arbitration.ts`](../../apps/node/src/chain-arbitration.ts)
  (the `ArbitrationStore` + the
  `isVerdictEntry` guard + the
  `getVerdictsFor` reader; v1.13 uses
  the store iteration pattern)
- [`chain-reputation-3tuple.ts`](../../apps/node/src/chain-reputation-3tuple.ts)
  (the v0 3-tuple reputation book;
  v1.13 leaves it in place for other
  callers)
- [`chain-plan-assign.ts`](../../apps/node/src/chain-plan-assign.ts)
  (the worker picker's `reputationBySkill`
  consumer; the v1.13 producer populates
  the field but the consumer is unchanged)
- [`node-service-chain-orchestration.ts`](../../apps/node/src/node-service-chain-orchestration.ts)
  (the orchestrator's `deriveRosterReputation`
  call site; v1.13 swaps the v0 producer
  for the v1.10-based equivalent)
- [`taui-agent-routing-settings.md`](./taui-agent-routing-settings.md)
  (the Tauri UI design doc — v1.13 adds
  §18 for the per-skill reputation display)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Function name | **`getReputationBySkillForPeer(stores, peerId)`** — matches the v0 naming; the v0 function is `deriveReputationBySkillForPeer` (different semantic — MEAN, v0 formula); the v1.13 is the v1.10-based equivalent with MAX |
| **Q2** | Flatten-across-runtimes semantic | **MAX** across runtimes per skill (best foot forward; rewards the worker's best historical performance) |
| **Q3** | Empty input | **Return `undefined`** (the existing `chain-plan-assign.ts:skillReputation` convention) |
| **Q4** | No usable signal per 3-tuple | **Skip the 3-tuple** (the skill is excluded from the map) |
| **Q5** | Stores parameter | **`Iterable<ArbitrationStore>`** (the orchestrator passes `chainArbitrationStores.values()`; the function is decoupled from the orchestrator's global state) |
| **Q6** | v0 module deprecation | **Leave the v0 module in place** (other callers may depend on it; v1.13 only replaces the worker-picker producer) |
| **Q7** | `getLocalRuntimePassRate` consumer | **No change in v1.13** (the federated-scoreboard consumer has different semantics; not the v1.13 scope) |
| **Q8** | Sub-chunk granularity | **Single commit** (v1.13 is small: 1 function + 1 call-site swap + tests + doc closeout) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.13.1 + v1.13.2 bundled | 1 commit on `envoy_harness_integration` branch. v1.13.1: `getReputationBySkillForPeer(stores, peerId)` added to `apps/node/src/chain-scoreboard.ts` (imports `isVerdictEntry` from `chain-arbitration.ts`). The orchestrator's `deriveRosterReputation` (in `node-service-chain-orchestration.ts:279-285`) is swapped to use the new helper. 6 new unit tests in `apps/node/test/chain-scoreboard.test.ts` (empty / single-3-tuple / multi-runtime MAX / multi-skill / all-disputed skip / no-verdicts). v1.13.2: doc closeout (this DONE stamp + `agent-harness-integration.md` change log entry + `agent-harness-integration-v1-11.md` v1.13 status note + `taui-agent-routing-settings.md` §18). |

**Total:** 1 commit, 6 new tests, 262 pre-existing tests regression-clean on the affected paths. No new type errors.

## What landed in v1.13 (key file references)

**Backend (Node side):**
- `apps/node/src/chain-scoreboard.ts` — new `getReputationBySkillForPeer(stores, peerId)` function (the v1.13 per-peer projection). Iterates over the chain stores + calls `getWorkerReputation` (v1.11) for each `(runtime, skill)` combination + builds a per-skill reputation map (MAX across runtimes per skill).
- `apps/node/src/node-service-chain-orchestration.ts` — `deriveRosterReputation` swapped to use the new helper. The v0 `deriveReputationBySkillForPeer` import is dropped (no longer used in this file). The v0 `chain-reputation-3tuple.ts` module is **left in place** for other callers (e.g. `getLocalRuntimePassRate` still uses the v0 `scoreFromVerdicts`).

**Tests:**
- `apps/node/test/chain-scoreboard.test.ts` — 6 new unit tests (no stores / no verdicts / single 3-tuple / MAX across runtimes / multi-skill / all-disputed skip).

**Docs:**
- `docs/agent-harness-integration-v1-13.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-harness-integration-v1-11.md` — v1.13 status note (v1.13 wires the v1.11 helper into the worker picker's `reputationBySkill` field; the v0 module is left in place for other callers)
- `docs/taui-agent-routing-settings.md` — §18 (Tauri UI for the per-skill reputation display; the `getReputationBySkillForPeer` helper is the backend the Tauri team calls)
