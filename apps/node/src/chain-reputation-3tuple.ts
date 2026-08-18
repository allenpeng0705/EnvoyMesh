/**
 * 3-tuple reputation (Phase 41 / MAP, Sprint 2).
 *
 * Reputation is a function of verdict history, not a self-reported number.
 * Keyed by `(peerId, runtime, skillId)` so OpenClaw translate and Hermes
 * translate are tracked separately.
 *
 * **Storage**: the verdict ledger lives in the existing `ArbitrationStore`
 * (see `chain-arbitration.ts` — `recordVerdictEntry` / `getVerdictsFor`).
 * This module is *derived state*: it computes reputation on read from an
 * iterable of `VerdictEntry` — single source of truth, two views.
 *
 * Scoring (design §7.2):
 * - rolling window of the last N verdicts per key
 * - `score = (pass + 0.5·partial) / total`, recency-weighted (newer verdicts
 *   count more)
 * - failures are weighted higher than passes (defensive bias): a fail counts
 *   twice in the denominator while contributing 0 to the numerator.
 *
 * @see docs/improving-agent-network.en.md §7
 */

import type { AgentRuntime, ReputationScore, SkillId, VerdictEntry } from "@envoymesh/protocol";

/** Default verdict window per reputation key (design §7.2). */
export const DEFAULT_REPUTATION_WINDOW = 50;

/** `peerId::runtime::skillId` — one score slot per (peer, runtime, skill). */
export type ReputationKey = `${string}::${AgentRuntime}::${string}`;

/** Recency floor for the oldest verdict in the window (newest = 1.0). */
const RECENCY_FLOOR = 0.2;

function clamp01(v: number): ReputationScore {
  return Math.min(1, Math.max(0, v));
}

/** Contribution in [0, 1] of a verdict to the numerator. */
export function verdictContribution(v: VerdictEntry["verdict"]): number {
  switch (v.kind) {
    case "pass":
      return v.score;
    case "partial":
      return 0.5 * v.score;
    case "fail":
      return 0;
    case "disputed":
      return 0.5;
  }
}

/**
 * Defensive bias: failures count double in the denominator while adding
 * nothing to the numerator.
 */
export function verdictWeight(v: VerdictEntry["verdict"]): number {
  return v.kind === "fail" ? 2 : 1;
}

/**
 * Weighted rolling-window score for a set of verdicts (already keyed to one
 * (peer, runtime, skill) slot). Empty → 0. Returns a `ReputationScore` in
 * [0, 1].
 */
export function scoreFromVerdicts(
  verdicts: readonly VerdictEntry[],
  opts?: { windowSize?: number },
): ReputationScore {
  const windowSize = opts?.windowSize ?? DEFAULT_REPUTATION_WINDOW;
  const window = verdicts.slice(-windowSize);
  const n = window.length;
  if (n === 0) return 0;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const entry = window[i]!;
    // Linear recency ramp: newest verdict weighs 1.0, oldest 0.2.
    const recency = n === 1 ? 1 : RECENCY_FLOOR + (1 - RECENCY_FLOOR) * (i / (n - 1));
    const weight = verdictWeight(entry.verdict);
    numerator += recency * weight * verdictContribution(entry.verdict);
    denominator += recency * weight;
  }
  return clamp01(denominator === 0 ? 0 : numerator / denominator);
}

/** In-memory derived reputation book; `recordVerdict` is the only write seam. */
export class ReputationBook3Tuple {
  private readonly history = new Map<ReputationKey, VerdictEntry[]>();
  private readonly windowSize: number;

  constructor(windowSize: number = DEFAULT_REPUTATION_WINDOW) {
    this.windowSize = windowSize;
  }

  key(peerId: string, runtime: AgentRuntime, skillId: SkillId): ReputationKey {
    return `${peerId}::${runtime}::${skillId}`;
  }

  /** Append a verdict to the rolling window for its (peer, runtime, skill). */
  recordVerdict(entry: VerdictEntry): void {
    const key = this.key(entry.workerPeerId, entry.workerRuntime, entry.skillId);
    const window = this.history.get(key) ?? [];
    window.push(entry);
    if (window.length > this.windowSize) window.splice(0, window.length - this.windowSize);
    this.history.set(key, window);
  }

  getScore(peerId: string, runtime: AgentRuntime, skillId: SkillId): ReputationScore {
    return scoreFromVerdicts(this.history.get(this.key(peerId, runtime, skillId)) ?? [], {
      windowSize: this.windowSize,
    });
  }

  getVerdictCount(peerId: string, runtime: AgentRuntime, skillId: SkillId): number {
    return (this.history.get(this.key(peerId, runtime, skillId)) ?? []).length;
  }

  /** All skills for one (peer, runtime) as a score map — for manifest broadcast. */
  snapshotFor(peerId: string, runtime: AgentRuntime): Record<SkillId, ReputationScore> {
    const prefix: ReputationKey = `${peerId}::${runtime}::`;
    const out: Record<string, ReputationScore> = {};
    for (const [key, window] of this.history) {
      if (!key.startsWith(prefix)) continue;
      const skill = key.slice(prefix.length) as SkillId;
      out[skill] = scoreFromVerdicts(window, { windowSize: this.windowSize });
    }
    return out;
  }
}

/**
 * Projection for the Assigner roster: aggregate a peer's verdicts across
 * runtimes per skill. The Assigner does not know a worker's runtime ahead of
 * assignment, so the 3-tuple is flattened to per-(peer, skill). Returns
 * `undefined` when the peer has no verdicts at all.
 */
export function deriveReputationBySkillForPeer(
  verdicts: readonly VerdictEntry[],
  peerId: string,
): Record<SkillId, ReputationScore> | undefined {
  const bySkill = new Map<SkillId, VerdictEntry[]>();
  for (const entry of verdicts) {
    if (entry.workerPeerId !== peerId) continue;
    const arr = bySkill.get(entry.skillId) ?? [];
    arr.push(entry);
    bySkill.set(entry.skillId, arr);
  }
  if (bySkill.size === 0) return undefined;
  const out: Record<string, ReputationScore> = {};
  for (const [skillId, entries] of bySkill) {
    out[skillId] = scoreFromVerdicts(entries);
  }
  return out;
}
