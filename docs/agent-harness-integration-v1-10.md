# envoy-harness integration — v1.10 sub-plan (scoreboard formula)

> **Status:** ✅ **DONE** (2026-08-21). 1 commit
> on `envoy_harness_integration` branch (the
> user delegated the commit; bundled v1.10.1 +
> v1.10.2 into a single commit at the end of
> v1.10, per the v1.4-v1.9 pattern). 30 new
> tests (15 `reputationFromVerdicts` + 8
> `categorizeReputation` + 3
> `isNoHistoryReputation` + 2 + 2 constants) +
> 222 pre-existing tests regression-clean on
> the affected paths. No new type errors
> (pre-existing multiformats/ArrayBuffer
> conflict in `packages/network/src/index.ts:2791`
> unchanged).
>
> **What this doc covers:** v1.10 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 + v1.6 + v1.7 + v1.8 + v1.9 are
> done. v1.10 ships the **3-tuple reputation
> producer** (the scoreboard formula) for the
> federated scoreboard. v1.8's
> `VerdictEntry.verifierModel` field is the
> foundation — v1.10 uses it to weight the cross
> verdicts (the v1.8 cross-verify-with-different-
> model primitive, the F9.5 proxy). v1.10 is a
> **foundation chunk** — the formula is shipped +
> tested + documented, but **not** wired into
> `chain-sensitivity-gate.requiresReputationApproval`
> yet (that's v1.10+ future).

## 1. Goal

**Compute the 3-tuple reputation from
`VerdictEntry[]` using a weighted-average formula
that respects the source weight + kind
contribution + disputed = 0 semantics.** v1.10
ships the pure function (`reputationFromVerdicts`)
+ the Tauri UI categorization helper
(`categorizeReputation`) + the constants that
define the formula. The formula is the producer
side of the 3-tuple reputation book; the consumer
side (the existing
`chain-sensitivity-gate.requiresReputationApproval`)
takes the reputation + verdict count and decides
whether the worker can take the job. v1.10 ships
the producer; the consumer wiring is v1.10+
future.

**Why now (the v1 backlog says
"Scoreboard formula — weighting positive vs.
negative signals"):** v1.8 recorded the
verifier's model family on cross verdicts via
`verifierModel` (the existing Zod field). v1.10
is the chunk that uses that signal at the
reputation-aggregation layer — cross verdicts
(cross-runtime, different-family) get a 1.5x
weight, encoding the F9.5 design intent ("a
verifier with a different model is a stronger
signal"). The 3-tuple reputation book becomes
the canonical "trust score" for a worker's
reputation in the federated scoreboard.

**The v1.10 scope:** v1.10 ships the formula +
tests + a Tauri UI design doc. The actual
integration into `requiresReputationApproval`
(so the gate uses the new score) is a v1.10+
future. v1.10 makes the producer available;
whoever wires the consumer (likely Sprint 3 in
the Phase 41 / MAP plan) can do it without
touching the formula.

## 2. Existing pieces (what we build on)

### 2.1 `VerdictEntry` + `Verdict` schemas

**File:** `packages/protocol/src/agent-adapter.ts:279-389`

The protocol defines the four verdict kinds
(`pass` / `partial` / `fail` / `disputed`) and the
four sources (`rule` / `llm` / `cross` / `human`).
`pass` and `partial` carry a `score` in `[0, 1]`;
`fail` and `disputed` do not. The `verifierModel`
field is optional (required iff `source === "llm"`,
but reused by v1.8 for cross verdicts).

**The v1.10 change:** none — the formula operates
on the existing `VerdictEntry[]` shape. No
protocol change.

### 2.2 The `ArbitrationStore` + verdict ledger

**File:** `apps/node/src/chain-arbitration.ts:46-154`

The `ArbitrationStore` is a `Map<string, ArbitrationEntry>`
where `ArbitrationEntry` is a union of
`ChainArbitrationEntry` (Phase 40E, ownership
disputes) and `VerdictEntry` (Phase 41, signed
verdicts). The verdict ledger key is
`${subtaskId}::${workerRuntime}`. The
`getVerdictsFor(store, criteria)` function reads
verdicts filtered by the optional 3-tuple
criteria (`workerPeerId`, `workerRuntime`,
`skillId`), sorted by `issuedAt` (oldest first).

**The v1.10 change:** none. v1.10's
`reputationFromVerdicts(verdicts)` is a pure
function that takes the filtered `VerdictEntry[]`
(the caller does the 3-tuple filtering via
`getVerdictsFor`). The store + the reader are
unchanged.

### 2.3 The existing `requiresReputationApproval` consumer

**File:** `apps/node/src/chain-sensitivity-gate.ts:76-100`

The consumer takes `workerReputation: number` and
`workerVerdictCount: number` and decides whether
the worker can take a job at the mandate's
sensitivity tier (`public` / `friends` / `private`).
The thresholds: `public = 0% (no gate)`,
`friends ≥ 60%`, `private ≥ 85%` (with
`≥ 10` verdicts).

**The v1.10 change:** none. v1.10 ships the
producer (the function that computes
`workerReputation` from a `VerdictEntry[]`). The
caller (a future orchestrator handler) wires it
into the gate; that's v1.10+ future.

### 2.4 The Phase 24C `aggregateReputation` (DIFFERENT domain)

**File:** `apps/node/src/reputation-router.ts:48-55`

The Phase 24C `aggregateReputation(feedbackScores)`
is for **capability providers** — a different
domain. It takes `Array<{ score: number }>`
(raw feedback scores from `task.feedback`) and
returns `{ reputationScore, completedTaskCount }`.
It's used by the marketplace-aware orchestrator to
rank peers in the discovery flow.

**The v1.10 distinction:** the v1.10
`reputationFromVerdicts` is for **verifier
verdicts** — the 3-tuple reputation book. It
takes `VerdictEntry[]` (signed, structured) and
returns a `[-1, 1]` score. Different domain,
different function. To avoid naming collision,
v1.10 uses `reputationFromVerdicts` (Q1).

### 2.5 The v1.8 `verifierModel` + cross-verify preference

**File:** `apps/node/src/chain-verify-loop.ts:111-129, 624-639`

The v1.8 `MODEL_FAMILY` table + `modelFamilyFor`
helper + `pickSecondRuntime` preference
(different-family first). The cross `VerdictEntry`
records `verifierModel: modelFamilyFor(secondRuntime)`.

**The v1.10 change:** v1.10 consumes the
`verifierModel` field indirectly — the source
weight (`cross=1.5`) is the explicit encoding of
"different model = stronger signal". The
`verifierModel` field is not directly read by
`reputationFromVerdicts`; the source field
(`"cross"`) is the trigger.

## 3. Design

### 3.1 The formula

**File:** `apps/node/src/chain-scoreboard.ts` (NEW)

```ts
/**
 * Phase 8 / v1.10 — source weights for the
 * scoreboard formula. The cross verifier (a
 * second runtime, different model family — the
 * v1.8 F9.5 proxy) gets a 1.5x weight because
 * the cross-verify path catches model-specific
 * biases that a same-model verifier would miss.
 * Human verdicts get a 2.0x weight because
 * they're the most expensive + the most trusted.
 *
 * **Why a hardcoded table (not the per-node
 * config):** the source WEIGHT is a global
 * design choice (not a per-node tuning). The
 * cross verifier's value over a rule verifier
 * is the same on every node. v1.10+ future may
 * make these per-node (Tauri UI tuning) — for
 * v1.10, the defaults are the spec.
 */
export const SCOREBOARD_SOURCE_WEIGHTS: Record<VerifierSource, number> = {
  rule: 1.0,
  llm: 1.0,
  cross: 1.5,
  human: 2.0,
};

/**
 * Phase 8 / v1.10 — trust thresholds for the
 * Tauri UI categorization. `trusted ≥ 0.7`
 * (strong positive); `untrusted < 0.3` (strong
 * negative); `mixed` in between; `no-history`
 * is the empty-input case.
 *
 * **Why 0.7 / 0.3 (not 0.6 / 0.4 from
 * `MIN_REP_FOR_SENSITIVITY`):** the UI
 * thresholds are a separate decision from the
 * gate thresholds. The gate thresholds answer
 * "can this worker take this job?" (binary
 * per-tier). The UI thresholds answer "should
 * the owner see a friendly trust badge?" (3-way
 * trust signal). 0.7 / 0.3 gives a clear
 * "trusted" / "untrusted" band, with a wide
 * "mixed" middle for workers with mixed
 * history.
 */
export const SCOREBOARD_TRUST_THRESHOLDS = {
  trusted: 0.7,
  untrusted: 0.3,
} as const;

/**
 * Phase 8 / v1.10 — the 3-tuple reputation
 * producer. Takes a list of signed
 * `VerdictEntry` records (typically the
 * filtered output of
 * `getVerdictsFor(store, { workerPeerId, workerRuntime, skillId })`)
 * and computes a reputation score in
 * `[-1, 1]`.
 *
 * **Formula (per-verdict contribution):**
 *
 * | `verdict.kind` | contribution | added weight |
 * |---|---|---|
 * | `pass` | `score * weight` | `weight` |
 * | `partial` | `score * weight * 0.5` | `weight` |
 * | `fail` | `-weight` | `weight` |
 * | `disputed` | `0` | `0` (Q3) |
 *
 * **`weight`** is `SCOREBOARD_SOURCE_WEIGHTS[verdict.source]`.
 *
 * **Final score:**
 * `sum(contribution) / sum(weight)`, normalized
 * to `[-1, 1]`. The formula is naturally
 * bounded — each contribution is in
 * `[-weight, +weight]` (partial is in
 * `[0, 0.5*weight]`), and the divisor is the
 * sum of weights, so the result is in
 * `[-1, 1]`. A `clamp` is applied for
 * floating-point safety.
 *
 * **Empty input:** returns `0` (neutral; the
 * caller distinguishes "no history" from
 * "neutral" via `verdicts.length === 0`).
 * (Q2 — return 0, not `null` and not throw.)
 *
 * **All-disputed input:** returns `0` (the
 * divisor is `0` when all verdicts are
 * disputed; the function guards against
 * divide-by-zero).
 *
 * **Why on-demand (Q4):** no separate store.
 * The function is O(n) where n is the number
 * of verdicts for the 3-tuple. The
 * `ArbitrationStore` is the source of truth
 * (append-only); the reputation is a derived
 * view. The 3-tuple book's verdict count per
 * (peer, runtime, skill) is bounded by the
 * number of subtasks completed by that
 * worker, so the per-query cost is acceptable.
 *
 * @param verdicts The signed verdicts to
 *   aggregate. Typically filtered to a single
 *   (workerPeerId, workerRuntime, skillId)
 *   3-tuple by the caller.
 * @returns The reputation score in `[-1, 1]`.
 *   `0` = neutral (empty input or all
 *   disputed). Positive = good reputation;
 *   negative = poor reputation.
 */
export function reputationFromVerdicts(
  verdicts: readonly VerdictEntry[],
): number {
  if (verdicts.length === 0) return 0;
  let sumContribution = 0;
  let sumWeight = 0;
  for (const v of verdicts) {
    const weight = SCOREBOARD_SOURCE_WEIGHTS[v.source];
    if (v.verdict.kind === "disputed") {
      // Q3: disputed = 0; no contribution, no
      // weight added. The verifier couldn't
      // decide; the score is left to the rule +
      // cross verdicts that did decide.
      continue;
    }
    if (v.verdict.kind === "fail") {
      sumContribution += -weight;
      sumWeight += weight;
      continue;
    }
    // pass or partial — both carry a score in [0, 1].
    const partialFactor = v.verdict.kind === "partial" ? 0.5 : 1.0;
    sumContribution += v.verdict.score * weight * partialFactor;
    sumWeight += weight;
  }
  if (sumWeight === 0) return 0; // all disputed
  const result = sumContribution / sumWeight;
  return clamp(result, -1, 1);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Phase 8 / v1.10 — Tauri UI helper. Maps a
 * reputation score to a user-friendly trust
 * category.
 *
 * **Why a separate function (not inlined in
 * the UI):** the categorization rules are
 * shared between the Tauri chat surface
 * (current + future "worker trust" indicator)
 * and the chain report surface (Q1 of the
 * v1.8 sub-plan). Centralizing the rules in
 * the backend keeps the surfaces consistent.
 *
 * **End-user-first copy:** the internal
 * category names (`"trusted"` / `"mixed"` /
 * `"untrusted"` / `"no-history"`) are stable
 * identifiers. The Tauri team maps them to
 * user-friendly labels ("Trusted" /
 * "Mixed history" / "Low trust" / "No
 * history yet" — or similar; the exact copy
 * is the Tauri team's call).
 *
 * @param score The reputation score in
 *   `[-1, 1]`. Typically the output of
 *   `reputationFromVerdicts` (which returns 0
 *   for empty input). The Tauri team pairs
 *   this with `verdicts.length === 0` to
 *   distinguish "neutral" from "no history".
 * @returns The trust category.
 */
export function categorizeReputation(
  score: number,
): "trusted" | "mixed" | "untrusted" | "no-history" {
  if (score >= SCOREBOARD_TRUST_THRESHOLDS.trusted) return "trusted";
  if (score >= SCOREBOARD_TRUST_THRESHOLDS.untrusted) return "mixed";
  return "untrusted";
}

/**
 * Phase 8 / v1.10 — Tauri UI helper for the
 * empty-input case. Pairs with
 * `reputationFromVerdicts([]) === 0` to give
 * the UI a distinct "no history" state
 * (vs. the "mixed" category that 0 falls
 * into).
 *
 * **Why a separate function (not a property
 * on the return):** the function returns a
 * `number` (per Q2 — return 0, not null). The
 * "no history" distinction is a UI concern;
 * the Tauri team calls
 * `isNoHistoryReputation(verdicts.length)` to
 * decide whether to render the "No history
 * yet" label.
 *
 * @param verdictCount The number of verdicts
 *   the caller fed into `reputationFromVerdicts`.
 * @returns `true` when there were no verdicts.
 */
export function isNoHistoryReputation(verdictCount: number): boolean {
  return verdictCount === 0;
}
```

### 3.2 Why a new file (not `chain-verify-loop.ts`)

**File:** `apps/node/src/chain-scoreboard.ts` (NEW)

The v1.8 chunk added `MODEL_FAMILY` + `modelFamilyFor`
to `chain-verify-loop.ts` directly. v1.10's
function is a different concern — reputation
aggregation, not the cross-verify loop. Adding
it to `chain-verify-loop.ts` would make the file
even bigger (it's already 700+ lines) and mix two
concerns (verify-loop + reputation aggregation).
A new file is cleaner. The function is
self-contained (no cross-module dependencies
beyond the protocol types).

**Alternative considered:** add to
`chain-arbitration.ts` (the store lives there).
Rejected because the function is a derived
view, not a store operation. Mixing the store
API with the derived view makes the file harder
to navigate.

### 3.3 Test strategy

**Unit tests in `chain-scoreboard.test.ts` (NEW):**

1. `reputationFromVerdicts([])` returns `0` (empty input)
2. All `pass` (rule) at score 1.0 → `1.0`
3. All `pass` (rule) at score 0.5 → `0.5`
4. All `fail` (rule) → `-1.0`
5. All `disputed` → `0` (Q3; no contribution, no weight)
6. Mix of `pass` (rule, 0.7) + `fail` (rule) → `0` (cancels out)
7. `pass` (cross, 0.8) → `0.8` (the 1.5x weight cancels in the normalization; the score is preserved)
8. `pass` (human) + `fail` (rule) → `1/3` (human weight dominates; partial-positive)
9. `partial` (rule, 0.6) → `0.3` (partial × 0.5)
10. `pass` (human) + `fail` (rule) + `partial` (cross, 0.5) → `(-1 + 2 + 0.5*1.5*0.5) / (1 + 2 + 1.5) = 1.375 / 4.5 ≈ 0.3056`
11. `pass` (cross, 1.0) + `pass` (human, 1.0) → `(1.5 + 2) / (1.5 + 2) = 1.0` (max positive)
12. `fail` (cross) + `fail` (human) → `(-1.5 - 2) / (1.5 + 2) = -1.0` (max negative)
13. `pass` (rule, 0.5) + `disputed` (rule) → `0.5 / 1 = 0.5` (disputed ignored, doesn't add weight)
14. Score in floating-point safety range (e.g. very small positive) — clamp test
15. `categorizeReputation(0.8)` → `"trusted"`
16. `categorizeReputation(0.7)` → `"trusted"` (boundary)
17. `categorizeReputation(0.5)` → `"mixed"`
18. `categorizeReputation(0.3)` → `"mixed"` (boundary)
19. `categorizeReputation(0.1)` → `"untrusted"`
20. `categorizeReputation(-0.5)` → `"untrusted"`
21. `categorizeReputation(0)` → `"untrusted"` (just below 0.3; the "no-history" case is handled separately via `isNoHistoryReputation`)
22. `isNoHistoryReputation(0)` → `true`
23. `isNoHistoryReputation(1)` → `false`
24. `SCOREBOARD_SOURCE_WEIGHTS` has the locked values
25. `SCOREBOARD_TRUST_THRESHOLDS` has the locked values

**Total: ~25 unit tests** (consolidated into ~12 distinct test cases via `describe` blocks). The exact number depends on how the tests are grouped; expect 12-15 distinct test cases across the three concerns (formula, categorize, constants).

## 4. Design questions for team sign-off

> These are the choices that need a decision
> before implementation starts. **Defaults
> proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Function name | **`reputationFromVerdicts`** — distinct from the Phase 24C `aggregateReputation` in `reputation-router.ts:48` (different domain — verifier verdicts, not capability-provider feedback) | `aggregateVerifierReputation` (more verbose, but explicitly distinguishes from Phase 24C); or `aggregateReputation` (same name; module path disambiguates but risks future grep confusion) |
| **Q2** | Empty input | **Return `0`** (neutral; caller distinguishes "no history" via `verdicts.length === 0`) | Return `null` (forces the consumer to handle "no history" via the return type); or throw (strict; forces the caller to pre-check) |
| **Q3** | Disputed handling | **`disputed` contributes 0 and adds no weight** (the formula skips the verdict entirely — the verifier couldn't decide; the score is left to the verdicts that did decide) | `disputed` counts as `0` score but adds weight (penalizes the worker for getting disputed verdicts — too punishing) |
| **Q4** | Reputation storage | **On-demand computation** from `VerdictEntry[]` (no separate store; the `ArbitrationStore` is the source of truth; the reputation is a derived view) | Persisted score per 3-tuple (denormalized; faster reads but requires invalidation when new verdicts land) |
| **Q5** | Tauri UI trust thresholds | **`trusted ≥ 0.7`; `mixed 0.3-0.7`; `untrusted < 0.3`; `no-history = empty input`** (clear three-way trust signal with a wide mixed band) | `0.6 / 0.4` (mirror `MIN_REP_FOR_SENSITIVITY` in `chain-sensitivity-gate.ts`); or single threshold `0.5` (loses the "Mixed" category) |
| **Q6** | Tauri UI surface | **`categorizeReputation(score)` + `isNoHistoryReputation(verdictCount)`** (Tauri team maps the internal categories to user-friendly labels) | Inline the categorization in the Tauri UI (no shared helper; risks drift between surfaces) |
| **Q7** | Tauri UI scope | **Backend + design doc only** (consistent with v1.4-v1.9) | Bundle the actual Tauri UI in this chunk (significant scope; needs the Tauri team to pick it up) |
| **Q8** | Chunk scope | **Foundation chunk** (formula + tests + design doc; no integration into `chain-sensitivity-gate`) | Foundation + wire into the existing gate (larger; riskier); or foundation + wire + Tauri UI (significantly larger) |
| **Q9** | Worker ranking integration | **v1.10+ future** (the formula is available; the orchestrator doesn't use it yet for worker ranking) | Bundle the worker ranking in v1.10 (extends the orchestrator's worker picker; significant design change) |
| **Q10** | Federated scoreboard trust | **v1.10+ future** (mesh-federated scoreboard trust is deferred per the design — needs a mesh-wide identity layer that doesn't exist yet) | Bundle the federated trust in v1.10 (premature; the identity layer is the blocker) |

**Defaults at-default (Q1-Q10):** I have no
strong opinion on Q1 (`reputationFromVerdicts` is
the most descriptive name; `aggregateReputation`
is a naming-collision risk), Q2 (return `0` is
the cleanest; `null` adds nullability to every
consumer; throw adds boilerplate), Q3 (the
formula's intent is "weight the verdicts that
decided"; disputed verdicts are explicitly
"verifier couldn't decide" — adding weight would
penalize the worker for the verifier's
uncertainty, which is wrong), Q4 (on-demand is
the right call for a derived view; the
`ArbitrationStore` is the source of truth and
denormalizing would require invalidation), Q5
(0.7 / 0.3 gives a clear "trusted / untrusted"
band; the gate thresholds in
`chain-sensitivity-gate` are a separate
decision), Q6 (a shared helper keeps the chat
surface + chain report surface consistent), Q7
(consistent with v1.4-v1.9; the Tauri team picks
up the UI in their workstream), Q8 (foundation
chunk is the right scope; the consumer wiring is
a separate change with its own design
considerations), Q9 (worker ranking requires a
separate design discussion about how the formula
feeds the picker; v1.10 ships the producer), Q10
(federated trust is explicitly deferred per the
design — the identity layer is the blocker).

## 5. Plan

### Sub-chunk v1.10.1 — the formula + tests (1 commit)

- New: `apps/node/src/chain-scoreboard.ts` —
  `reputationFromVerdicts(verdicts): number`
  function (the formula) +
  `categorizeReputation(score)` Tauri UI helper
  + `isNoHistoryReputation(verdictCount)` helper
  + `SCOREBOARD_SOURCE_WEIGHTS` +
  `SCOREBOARD_TRUST_THRESHOLDS` constants. Pure
  functions, no I/O, no clock.
- New: `apps/node/test/chain-scoreboard.test.ts`
  — ~12 unit tests for the formula
  (empty / all-pass / all-fail / all-disputed /
  mixed sources / partial factor / cross
  weighting / human weighting / floating-point
  safety) + the categorize helper (5 thresholds
  + boundary tests) + the constants
  (1-2 tests).

### Sub-chunk v1.10.2 — doc closeout (1 commit)

- New: `docs/agent-harness-integration-v1-10.md`
  — this sub-plan + DONE stamp.
- Modify: `docs/agent-harness-integration.md` —
  add v1.10 status to the change log.
- Modify: `docs/agent-harness-integration-v1-8.md`
  — v1.10 status note (v1.10 ships the
  weighting the v1.8 `verifierModel` field
  enabled; the F9.5 intent is encoded as the
  `cross=1.5` source weight).
- Modify: `docs/agent-harness-integration-v1-9.md`
  — v1.10 status note (v1.10 builds on the v1.9
  per-runtime tag map; the runtimes that
  produce verdicts are the same runtimes whose
  tag lists v1.9 extracted).
- Modify: `docs/taui-agent-routing-settings.md` —
  §16 (chain report surface for the scoreboard
  category; Tauri team maps the internal
  categories to user-friendly labels).

**Total: 2 sub-chunks, bundled into 1 commit at
the end of v1.10** (per the v1.4-v1.9 commit
pattern). On `envoy_harness_integration` branch.

## 6. Out of scope (deferred)

- **Wiring into `chain-sensitivity-gate.requiresReputationApproval`**
  (Q8 default) — v1.10+ future. The consumer
  already takes `workerReputation: number` and
  `workerVerdictCount: number`; the caller
  (a future orchestrator handler) will compute
  the 3-tuple reputation from
  `getVerdictsFor(store, { workerPeerId, workerRuntime, skillId })`
  + `reputationFromVerdicts` and pass the result
  to the gate. v1.10 ships the producer; the
  wiring is a separate change.
- **Worker ranking integration** (Q9 default) —
  v1.10+ future. The formula is available; the
  orchestrator's worker picker doesn't use it
  yet. Adding it requires a design discussion
  about how the formula feeds the picker
  (replacing the current "primary + best-fit"
  strategy with a scoreboard-driven rank).
- **Federated scoreboard trust** (Q10 default) —
  v1.10+ future. The design explicitly defers
  this until a mesh-wide identity layer exists
  (the local 3-tuple reputation is the
  prerequisite). v1.10 is local-only; federation
  is a separate chunk.
- **Tauri UI for the scoreboard category** (Q7
  default) — the Tauri team picks up the
  actual UI in their workstream. v1.10 ships
  the backend + a design doc.
- **Per-node source weight tuning** — the
  `SCOREBOARD_SOURCE_WEIGHTS` is a hardcoded
  global table. Per-node tuning (Tauri UI
  override) is a v1.10+ future.
- **Per-node threshold tuning** — the
  `SCOREBOARD_TRUST_THRESHOLDS` is a hardcoded
  global table. Per-node tuning is a v1.10+
  future.

## 7. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — the scoreboard is the
  federated self-evolution track)
- [`agent-harness-integration-v1-8.md`](./agent-harness-integration-v1-8.md)
  (v1.8 `verifierModel` field — v1.10 ships
  the weighting the v1.8 field enabled; the
  F9.5 cross-verify intent is encoded as the
  `cross=1.5` source weight)
- [`agent-harness-integration-v1-9.md`](./agent-harness-integration-v1-9.md)
  (v1.9 per-runtime tag map — v1.10 builds on
  the v1.9 foundation; the runtimes that
  produce verdicts are the same runtimes whose
  tag lists v1.9 extracted)
- [`chain-verify-loop.ts`](../../apps/node/src/chain-verify-loop.ts)
  (the v1.8 cross-verify loop + the
  `MODEL_FAMILY` table; v1.10 is the consumer
  of the `verifierModel` field the v1.8
  cross-verify writes)
- [`chain-arbitration.ts`](../../apps/node/src/chain-arbitration.ts)
  (the `ArbitrationStore` + `getVerdictsFor`
  reader; the 3-tuple filtering the v1.10
  caller does on top of the v1.10 formula)
- [`chain-sensitivity-gate.ts`](../../apps/node/src/chain-sensitivity-gate.ts)
  (the `requiresReputationApproval` consumer;
  v1.10 ships the producer; the consumer
  wiring is v1.10+ future)
- [`reputation-router.ts`](../../apps/node/src/reputation-router.ts)
  (the Phase 24C `aggregateReputation` for
  capability providers; v1.10 is the verifier-
  verdict equivalent; distinct function
  names per Q1)
- [`agent-adapter.ts`](../../packages/protocol/src/agent-adapter.ts)
  (the `VerdictEntrySchema` + `VerdictSchema`;
  v1.10 reuses the existing shape; no
  protocol change)
- [`taui-agent-routing-settings.md`](./taui-agent-routing-settings.md)
  (the Tauri UI design doc — v1.10 adds the
  chain report surface for the scoreboard
  category)
- [`improving-agent-network.en.md`](../../envoymesh-design/improving-agent-network.en.md)
  (the Phase 41 / MAP design — the 3-tuple
  reputation book; the producer side; v1.10
  is the canonical implementation)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Function name | **`reputationFromVerdicts`** — distinct from the Phase 24C `aggregateReputation` in `reputation-router.ts:48` (different domain — verifier verdicts, not capability-provider feedback) |
| **Q2** | Empty input | **Return `0`** (neutral; caller distinguishes "no history" via `verdicts.length === 0` + the `isNoHistoryReputation` helper) |
| **Q3** | Disputed handling | **`disputed` contributes 0 and adds no weight** (the formula skips the verdict entirely — the verifier couldn't decide; the score is left to the verdicts that did decide) |
| **Q4** | Reputation storage | **On-demand computation** from `VerdictEntry[]` (no separate store; the `ArbitrationStore` is the source of truth; the reputation is a derived view) |
| **Q5** | Tauri UI trust thresholds | **`trusted ≥ 0.7`; `mixed 0.3-0.7`; `untrusted < 0.3`; `no-history = empty input`** (clear three-way trust signal with a wide mixed band) |
| **Q6** | Tauri UI surface | **`categorizeReputation(score)` + `isNoHistoryReputation(verdictCount)`** (Tauri team maps the internal categories to user-friendly labels) |
| **Q7** | Tauri UI scope | **Backend + design doc only** (consistent with v1.4-v1.9) |
| **Q8** | Chunk scope | **Foundation chunk** (formula + tests + design doc; no integration into `chain-sensitivity-gate`) |
| **Q9** | Worker ranking integration | **v1.10+ future** (the formula is available; the orchestrator doesn't use it yet for worker ranking) |
| **Q10** | Federated scoreboard trust | **v1.10+ future** (mesh-federated scoreboard trust is deferred per the design — needs a mesh-wide identity layer that doesn't exist yet) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.10.1 + v1.10.2 bundled | 1 commit on `envoy_harness_integration` branch. v1.10.1: new `apps/node/src/chain-scoreboard.ts` (the `reputationFromVerdicts(verdicts): number` formula + `categorizeReputation(score)` + `isNoHistoryReputation(verdictCount)` Tauri UI helpers + `SCOREBOARD_SOURCE_WEIGHTS` constant + `SCOREBOARD_TRUST_THRESHOLDS` constant) + 30 new unit tests in `apps/node/test/chain-scoreboard.test.ts` (empty input / all-pass / all-fail / all-disputed / mixed-source / partial-factor / cross-weighting / human-weighting / floating-point safety / categorize boundaries + the constants spec pinning). v1.10.2: doc closeout (this DONE stamp + `agent-harness-integration.md` change log entry + `agent-harness-integration-v1-8.md` v1.10 status note (v1.10 ships the weighting the v1.8 `verifierModel` field enabled) + `agent-harness-integration-v1-9.md` v1.10 status note (v1.10 builds on the v1.9 per-runtime tag map) + `taui-agent-routing-settings.md` §16 (chain report surface for the scoreboard category)). |

**Total:** 1 commit, 30 new tests, 222 pre-existing tests regression-clean on the affected paths. No new type errors.

## What landed in v1.10 (key file references)

**Backend (Node side):**
- `apps/node/src/chain-scoreboard.ts` (NEW) — `reputationFromVerdicts(verdicts): number` formula + `categorizeReputation(score)` Tauri UI helper + `isNoHistoryReputation(verdictCount)` empty-input helper + `SCOREBOARD_SOURCE_WEIGHTS` constant (the v1.8 F9.5 proxy — `cross=1.5` is the different-model weighting) + `SCOREBOARD_TRUST_THRESHOLDS` constant (0.7 / 0.3 UI thresholds)

**Tests:**
- `apps/node/test/chain-scoreboard.test.ts` (NEW) — 30 unit tests (15 `reputationFromVerdicts` covering empty input / all-pass / all-fail / all-disputed / mixed-source / partial-factor / cross-weighting / human-weighting / floating-point safety / max positive / max negative / disputed-ignored / floating-point clamp; 8 `categorizeReputation` covering trusted / mixed / untrusted / boundary scores; 3 `isNoHistoryReputation`; 3 `SCOREBOARD_SOURCE_WEIGHTS` constants spec pinning; 2 `SCOREBOARD_TRUST_THRESHOLDS` constants spec pinning)

**Docs:**
- `docs/agent-harness-integration-v1-10.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-harness-integration-v1-8.md` — v1.10 status note (v1.10 ships the weighting the v1.8 `verifierModel` field enabled; F9.5 intent encoded as the `cross=1.5` source weight)
- `docs/agent-harness-integration-v1-9.md` — v1.10 status note (v1.10 builds on the v1.9 per-runtime tag map; the runtimes that produce verdicts are the same runtimes whose tag lists v1.9 extracted)
- `docs/taui-agent-routing-settings.md` — §16 (chain report surface for the scoreboard category; Tauri team maps the internal categories to user-friendly labels; end-user-first copy; the `no-history` category is distinct from `untrusted`)

**Protocol:**
- **No protocol change.** The `VerdictEntry` shape is unchanged (the existing Zod schema in `packages/protocol/src/agent-adapter.ts:347-389`). v1.10 operates on the existing `VerdictEntry[]` and returns a `number` — no schema, no wire format, no field addition.
