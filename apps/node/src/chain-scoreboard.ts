/**
 * Phase 8 / v1.10 — 3-tuple reputation scorebook (the
 * federated scoreboard's producer side).
 *
 * The 3-tuple reputation book is keyed by
 * `(workerPeerId, workerRuntime, skillId)`. The
 * authoritative entries are the signed `VerdictEntry`
 * records in the chain's `ArbitrationStore`
 * (see `chain-arbitration.ts:46-154`). This module
 * is the **derived view**: given a filtered
 * `VerdictEntry[]` for one 3-tuple, it computes the
 * reputation score and the Tauri UI's trust
 * category.
 *
 * **Why a separate file (not `chain-verify-loop.ts`):**
 * `chain-verify-loop.ts` is the orchestrator's
 * verify-loop (the producer of the verdicts). This
 * module is the consumer of the verdicts (the
 * score-aggregator). Mixing the two would make the
 * 700+ line `chain-verify-loop.ts` even bigger and
 * blur the "produce vs. consume" boundary.
 *
 * **Why a separate file (not `chain-arbitration.ts`):**
 * `chain-arbitration.ts` is the store API (record +
 * read + converge). This module is the derived view
 * (the on-demand reputation score). Mixing the two
 * would make the store's API less clear.
 *
 * **On-demand computation (Q4):** no separate store.
 * The function is O(n) where `n` is the number of
 * verdicts for the 3-tuple. The `ArbitrationStore`
 * is the source of truth (append-only); the
 * reputation is a derived view. Per-query cost is
 * acceptable because the 3-tuple book's verdict
 * count per `(peer, runtime, skill)` is bounded by
 * the number of subtasks completed by that worker.
 *
 * @see docs/agent-harness-integration-v1-10.md
 * @see docs/agent-harness-integration-v1-8.md
 *   (the v1.8 `verifierModel` field is the
 *   foundation; v1.10 ships the weighting the
 *   field enabled)
 * @see docs/agent-harness-integration-v1-9.md
 *   (the v1.9 per-runtime tag map; v1.10 builds
 *   on the v1.9 foundation)
 */

import type { AgentRuntime, VerdictEntry, VerifierSource } from "@envoymesh/protocol";

import {
  getVerdictsFor,
  isVerdictEntry,
  type ArbitrationStore,
} from "./chain-arbitration.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Phase 8 / v1.10 — source weights for the
 * scoreboard formula. The cross verifier (a
 * second runtime, different model family — the
 * v1.8 F9.5 proxy) gets a `1.5x` weight because
 * the cross-verify path catches model-specific
 * biases that a same-model verifier would miss.
 * Human verdicts get a `2.0x` weight because
 * they're the most expensive + the most trusted.
 *
 * **Why a hardcoded table (not the per-node
 * config):** the source WEIGHT is a global
 * design choice (not a per-node tuning). The
 * cross verifier's value over a rule verifier
 * is the same on every node. v1.10+ future may
 * make these per-node (Tauri UI tuning) — for
 * v1.10, the defaults are the spec.
 *
 * **Locked decision (Q3 of the v1.10 design
 * questions):** these values are the spec. Tests
 * pin the table; a change requires a new
 * sub-plan doc.
 */
export const SCOREBOARD_SOURCE_WEIGHTS: Record<VerifierSource, number> = {
  rule: 1.0,
  llm: 1.0,
  cross: 1.5,
  human: 2.0,
};

/**
 * Phase 8 / v1.10 — trust thresholds for the
 * Tauri UI categorization.
 *
 * - `trusted ≥ 0.7` (strong positive)
 * - `untrusted < 0.3` (strong negative)
 * - `mixed 0.3 - 0.7` (in between)
 * - `no-history = empty input` (separate from
 *   the `score === 0` "neutral" case)
 *
 * **Why 0.7 / 0.3 (not 0.6 / 0.4 from
 * `MIN_REP_FOR_SENSITIVITY`):** the UI
 * thresholds are a separate decision from the
 * gate thresholds. The gate thresholds answer
 * "can this worker take this job?" (binary
 * per-tier). The UI thresholds answer "should
 * the owner see a friendly trust badge?"
 * (3-way trust signal). 0.7 / 0.3 gives a
 * clear "trusted" / "untrusted" band, with a
 * wide "mixed" middle for workers with mixed
 * history.
 *
 * **Locked decision (Q5 of the v1.10 design
 * questions):** these values are the spec. Tests
 * pin the table; a change requires a new
 * sub-plan doc.
 */
export const SCOREBOARD_TRUST_THRESHOLDS = {
  trusted: 0.7,
  untrusted: 0.3,
} as const;

/** Phase 8 / v1.10 — internal category identifiers for the Tauri UI. */
export type ReputationCategory =
  | "trusted"
  | "mixed"
  | "untrusted"
  | "no-history";

// ---------------------------------------------------------------------------
// Reputation formula (Q1 — `reputationFromVerdicts`)
// ---------------------------------------------------------------------------

/**
 * Phase 8 / v1.10 — the 3-tuple reputation
 * producer. Takes a list of signed
 * `VerdictEntry` records (typically the filtered
 * output of
 * `getVerdictsFor(store, { workerPeerId, workerRuntime, skillId })`
 * from `chain-arbitration.ts:137-154`) and
 * computes a reputation score in `[-1, 1]`.
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
 * **`weight`** is
 * `SCOREBOARD_SOURCE_WEIGHTS[verdict.source]`.
 *
 * **Final score:**
 * `sum(contribution) / sum(weight)`, normalized
 * to `[-1, 1]`. The formula is naturally
 * bounded — each contribution is in
 * `[-weight, +weight]` (partial is in
 * `[0, 0.5 * weight]`), and the divisor is
 * the sum of weights, so the result is in
 * `[-1, 1]`. A `clamp` is applied for
 * floating-point safety.
 *
 * **Empty input (Q2):** returns `0` (neutral;
 * the caller distinguishes "no history" via
 * `verdicts.length === 0`).
 *
 * **All-disputed input:** returns `0` (the
 * divisor is `0` when all verdicts are
 * disputed; the function guards against
 * divide-by-zero).
 *
 * **Why on-demand (Q4):** no separate store.
 * The `ArbitrationStore` is the source of
 * truth (append-only); the reputation is a
 * derived view. The 3-tuple book's verdict
 * count per `(peer, runtime, skill)` is
 * bounded by the number of subtasks completed
 * by that worker, so the per-query cost is
 * acceptable.
 *
 * @param verdicts The signed verdicts to
 *   aggregate. Typically filtered to a single
 *   `(workerPeerId, workerRuntime, skillId)`
 *   3-tuple by the caller (via
 *   `chain-arbitration.getVerdictsFor`).
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
      // decide; the score is left to the rule
      // + cross verdicts that did decide.
      continue;
    }
    if (v.verdict.kind === "fail") {
      sumContribution += -weight;
      sumWeight += weight;
      continue;
    }
    // `pass` or `partial` — both carry a
    // `score` in `[0, 1]`.
    const partialFactor = v.verdict.kind === "partial" ? 0.5 : 1.0;
    sumContribution += v.verdict.score * weight * partialFactor;
    sumWeight += weight;
  }
  if (sumWeight === 0) return 0; // all disputed
  const result = sumContribution / sumWeight;
  return clamp(result, -1, 1);
}

/**
 * Clamp `value` to `[min, max]`. Internal
 * helper for the score's floating-point safety
 * guard.
 */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// ---------------------------------------------------------------------------
// Tauri UI helpers (Q5 + Q6)
// ---------------------------------------------------------------------------

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
 * user-friendly labels ("Trusted" / "Mixed
 * history" / "Low trust" / "No history yet" —
 * or similar; the exact copy is the Tauri
 * team's call). The internal names are
 * developer jargon; the Tauri team translates
 * to owner-readable strings.
 *
 * @param score The reputation score in
 *   `[-1, 1]`. Typically the output of
 *   `reputationFromVerdicts` (which returns
 *   `0` for empty input). The Tauri team
 *   pairs this with `verdicts.length === 0`
 *   to distinguish "no history" from
 *   "neutral" (call `isNoHistoryReputation`
 *   for the explicit check).
 * @returns The trust category.
 */
export function categorizeReputation(score: number): ReputationCategory {
  if (score >= SCOREBOARD_TRUST_THRESHOLDS.trusted) return "trusted";
  if (score >= SCOREBOARD_TRUST_THRESHOLDS.untrusted) return "mixed";
  return "untrusted";
}

/**
 * Phase 8 / v1.10 — Tauri UI helper for the
 * empty-input case. Pairs with
 * `reputationFromVerdicts([]) === 0` to give
 * the UI a distinct "no history" state (vs.
 * the `"mixed"` category that `0` falls into
 * — note that `0` is just below the
 * `untrusted` threshold, so the categorize
 * function returns `"untrusted"` for it; the
 * Tauri team uses `isNoHistoryReputation` to
 * override to `"no-history"` when the input
 * is empty).
 *
 * **Why a separate function (not a property
 * on the return):** the function returns a
 * `number` (per Q2 — return `0`, not `null`).
 * The "no history" distinction is a UI
 * concern; the Tauri team calls
 * `isNoHistoryReputation(verdicts.length)`
 * to decide whether to render the "No
 * history yet" label.
 *
 * @param verdictCount The number of verdicts
 *   the caller fed into
 *   `reputationFromVerdicts`.
 * @returns `true` when there were no verdicts.
 */
export function isNoHistoryReputation(verdictCount: number): boolean {
  return verdictCount === 0;
}

// ---------------------------------------------------------------------------
// 3-tuple reputation wiring (v1.11 — consumer-side)
// ---------------------------------------------------------------------------

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
 * The helper maps via `(raw + 1) / 2`:
 * - `raw = -1.0` → `0.0` (worst)
 * - `raw =  0.0` → `0.5` (neutral)
 * - `raw = +1.0` → `1.0` (best)
 *
 * **Why map at the wiring point (not in
 * the formula):** the formula is the
 * mathematical spec — `[-1, 1]` is the
 * natural range for a weighted average
 * with negative contributions. Changing
 * the formula to return `[0, 1]` would
 * either lose the `fail` direction (no
 * way to distinguish "neutral" from
 * "worst") or require a different
 * formula structure. Mapping at the wiring
 * point keeps the formula pure +
 * reusable (e.g. for the future Tauri UI,
 * which might want to show a -100 to +100
 * bar; the formula's `[-1, 1]` is the
 * right shape for that).
 *
 * **Empty input (Q3 of the v1.11 design
 * questions):** returns `undefined`
 * (the consumer treats `undefined` as
 * "no reputation" — preserves the
 * existing `chain-plan-assign.ts:skillReputation`
 * convention). The caller doesn't need
 * to distinguish "no history" from
 * "neutral"; the existing convention
 * handles both.
 *
 * **All-disputed input (Q4):** returns
 * `undefined` (the verifier couldn't
 * decide for any of the verdicts; no
 * usable signal; same as empty input).
 * The formula's `disputed = 0`
 * semantics (Q3 of v1.10) is preserved —
 * the disputed verdicts are skipped,
 * not counted.
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

// ---------------------------------------------------------------------------
// Per-peer projection (v1.13 — consumer-side integration)
// ---------------------------------------------------------------------------

/**
 * Phase 8 / v1.13 — the per-peer reputation
 * projection helper. Iterates over the
 * chain stores for a given peerId + calls
 * `getWorkerReputation` (the v1.11
 * per-3-tuple wiring) for each
 * `(runtime, skill)` combination + builds
 * a per-skill reputation map (MAX across
 * runtimes per skill).
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
 * `(runtime, skill)` tuples (the worker's
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
    for (const entry of store.values()) {
      if (!isVerdictEntry(entry)) continue;
      if (entry.workerPeerId !== peerId) continue;
      const rep = getWorkerReputation(store, {
        workerPeerId: entry.workerPeerId,
        workerRuntime: entry.workerRuntime,
        skillId: entry.skillId,
      });
      if (rep === undefined) continue;
      const key = entry.skillId;
      const current = bySkill.get(key);
      if (current === undefined || rep > current) {
        bySkill.set(key, rep);
      }
    }
  }
  if (bySkill.size === 0) return undefined;
  return Object.fromEntries(bySkill);
}
