/**
 * Weighted scoring for Agent Network worker selection.
 *
 * Specialty tags are soft rank signals. Hard eligibility (opt-in + can execute)
 * is enforced upstream when building the worker pool.
 */

import type { AgentNetworkProfile } from "@envoymesh/protocol";
import { DEFAULT_AGENT_NETWORK_PROFILE } from "@envoymesh/protocol";

export interface WorkerScoreWeights {
  capability: number;
  context: number;
  freshness: number;
  spendPosture: number;
  throughput: number;
  sameLan: number;
}

/**
 * Soft specialty still matters, but throughput / LAN / profile fill gaps when
 * tags are missing — never leave a step unassigned for a mapping miss.
 */
export const DEFAULT_WORKER_SCORE_WEIGHTS: WorkerScoreWeights = {
  capability: 0.3,
  context: 0.2,
  freshness: 0.15,
  spendPosture: 0.1,
  throughput: 0.15,
  sameLan: 0.1,
};

export interface WorkerScoreBreakdown {
  capability: number;
  context: number;
  freshness: number;
  spendPosture: number;
  throughput: number;
  sameLan: number;
}

export interface WorkerScoreResult {
  score: number;
  breakdown: WorkerScoreBreakdown;
  summary: string;
}

const CONTEXT_SCORE: Record<string, number> = {
  "128k": 0.25,
  "256k": 0.5,
  "512k": 0.75,
  "1M+": 1,
};

const SPEND_SCORE: Record<string, number> = {
  subscription: 1,
  metered: 0.55,
  unknown: 0.35,
};

/** Map attested tokens/s into 0..1 (soft ceiling ~200 tok/s). */
export function throughputFit(tokensPerSec: number | undefined): number {
  if (tokensPerSec === undefined || !(tokensPerSec > 0)) return 0.35;
  return Math.max(0, Math.min(1, tokensPerSec / 200));
}

function normalizeWeights(weights: WorkerScoreWeights): WorkerScoreWeights {
  const sum =
    weights.capability +
    weights.context +
    weights.freshness +
    weights.spendPosture +
    weights.throughput +
    weights.sameLan;
  if (!(sum > 0)) return { ...DEFAULT_WORKER_SCORE_WEIGHTS };
  return {
    capability: weights.capability / sum,
    context: weights.context / sum,
    freshness: weights.freshness / sum,
    spendPosture: weights.spendPosture / sum,
    throughput: weights.throughput / sum,
    sameLan: weights.sameLan / sum,
  };
}

function capabilityFit(
  requiredCapability: string,
  cardCapabilities: readonly string[],
  strengths: readonly string[],
): number {
  const req = requiredCapability.toLowerCase();
  const strengthHit = strengths.some(
    (s) => s.toLowerCase() === req || req.includes(s.toLowerCase()) || s.toLowerCase().includes(req),
  );
  if (strengthHit) return 1;
  const capHit = cardCapabilities.some((c) => c.toLowerCase() === req);
  if (capHit) return 0.7;
  if (cardCapabilities.includes("task.execute")) return 0.45;
  return 0.2;
}

/**
 * Score a candidate worker for a required capability / strength hint.
 * Missing profile uses conservative defaults (does not invent "newest").
 */
export function scoreAgentNetworkWorker(input: {
  requiredCapability: string;
  cardCapabilities: readonly string[];
  profile?: Partial<AgentNetworkProfile> | null;
  weights?: Partial<WorkerScoreWeights>;
  displayName?: string;
  /** Soft boost when peer appears same-LAN / low RTT. */
  sameLan?: boolean;
}): WorkerScoreResult {
  const profile: AgentNetworkProfile = {
    ...DEFAULT_AGENT_NETWORK_PROFILE,
    ...input.profile,
    strengths: input.profile?.strengths ?? DEFAULT_AGENT_NETWORK_PROFILE.strengths,
  };
  const weights = normalizeWeights({
    ...DEFAULT_WORKER_SCORE_WEIGHTS,
    ...input.weights,
  });

  const breakdown: WorkerScoreBreakdown = {
    capability: capabilityFit(
      input.requiredCapability,
      input.cardCapabilities,
      profile.strengths,
    ),
    context: CONTEXT_SCORE[profile.contextWindow] ?? 0.25,
    freshness: Math.max(0, Math.min(1, (profile.modelFreshness - 1) / 9)),
    spendPosture: SPEND_SCORE[profile.spendPosture] ?? 0.35,
    throughput: throughputFit(profile.throughputTokensPerSec),
    sameLan: input.sameLan === true ? 1 : 0.35,
  };

  const score =
    weights.capability * breakdown.capability +
    weights.context * breakdown.context +
    weights.freshness * breakdown.freshness +
    weights.spendPosture * breakdown.spendPosture +
    weights.throughput * breakdown.throughput +
    weights.sameLan * breakdown.sameLan;

  const name = input.displayName?.trim() || "worker";
  const tok =
    profile.throughputTokensPerSec !== undefined
      ? `${profile.throughputTokensPerSec} tok/s`
      : "tok/s n/a";
  const lan = input.sameLan === true ? "lan" : "wan?";
  const summary = `${name}: score ${score.toFixed(2)} (cap ${breakdown.capability.toFixed(2)}, ctx ${profile.contextWindow}, fresh ${profile.modelFreshness}/10, ${profile.spendPosture}, ${tok}, ${lan})`;

  return { score, breakdown, summary };
}

/** Sort peer ids by descending score; stable for ties. */
export function rankWorkersByScore<T extends { peerId: string; score: number }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.peerId.localeCompare(b.peerId);
  });
}

/**
 * Pick an assignee for every step. Never skips a step when the pool is non-empty.
 * Sole worker → all steps; otherwise prefer specialty then best remaining score.
 */
export function assignWorkersToSteps(input: {
  steps: Array<{ stepKey: string; requiredCapability: string }>;
  rankedPeerIds: string[];
  scoreFor: (peerId: string, requiredCapability: string) => number;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.rankedPeerIds.length === 0) return out;
  if (input.rankedPeerIds.length === 1) {
    const only = input.rankedPeerIds[0]!;
    for (const step of input.steps) out[step.stepKey] = only;
    return out;
  }
  for (const step of input.steps) {
    let best = input.rankedPeerIds[0]!;
    let bestScore = input.scoreFor(best, step.requiredCapability);
    for (const peerId of input.rankedPeerIds.slice(1)) {
      const s = input.scoreFor(peerId, step.requiredCapability);
      if (s > bestScore) {
        best = peerId;
        bestScore = s;
      }
    }
    out[step.stepKey] = best;
  }
  return out;
}
