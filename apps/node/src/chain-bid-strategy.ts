/**
 * Phase 40 — Default worker-side chain bid strategy.
 *
 * When a worker receives a `task.chain.propose`, this module computes its
 * bid (`proposedCostUsd`, `proposedEtaAt`, `bidExpiresAt`). The default
 * policy is conservative: cost = base × task-complexity-multiplier, with a
 * reputation discount for trusted peers; ETA = capability-local-ETA + 60s
 * slack; bidExpiresAt = min(proposal.deadline + 30s, now + 5 minutes).
 *
 * **Why this lives in its own module:** bid logic is testable in isolation
 * from the worker runtime. The worker calls `computeChainBid({ subtask,
 * workerContext })` and either sends the resulting bid via
 * `task.chain.bid` or declines (returning `{ ok: false }` when the cost
 * ceiling is exceeded).
 *
 * **Why the 5-minute cap:** workers may receive many proposals in quick
 * succession; a bid that lives forever would lock the worker out of bidding
 * on a better offer. The cap matches the design doc's recommendation and
 * keeps `bid_expired` audit events predictable.
 *
 * See docs/agent_network.md §7.3.
 */

import type { ChainSubtask, ChainSubtaskBid } from "@envoymesh/protocol";
import { ChainSubtaskBidSchema, createChainSubtaskId } from "@envoymesh/protocol";

// ---------------------------------------------------------------------------
// Inputs the strategy needs
// ---------------------------------------------------------------------------

export interface ChainBidWorkerContext {
  workerPeerId: string;
  workerOwnerId: string;
  /** Base cost in USD per subtask (e.g. capability-tag pricing). */
  baseCostUsd: number;
  /** Optional reputation-derived discount multiplier (1.0 = no discount, 0.8 = 20% off). */
  reputationDiscount?: number;
  /** Capability-local ETA in ms (e.g. "this task usually takes 60s"). */
  capabilityLocalEtaMs: number;
  /** Slack added to ETA before sending, ms. Defaults to 60_000. */
  etaSlackMs?: number;
}

export interface ComputeChainBidInput {
  subtask: ChainSubtask;
  worker: ChainBidWorkerContext;
  /** Optional override for "now" (useful in tests). */
  now?: Date;
}

export type ComputeChainBidResult =
  | { ok: true; bid: ChainSubtaskBid }
  | { ok: false; reason: "cost_ceiling_exceeded" | "invalid_subtask" | "invalid_worker" };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max bid TTL relative to "now" regardless of the proposal deadline. */
export const CHAIN_BID_MAX_TTL_MS = 5 * 60 * 1000; // 5 minutes
/** Standard extension past the proposal's deadline. */
export const CHAIN_BID_DEADLINE_SLACK_MS = 30 * 1000; // 30 seconds
/** Default ETA slack when the worker doesn't specify one. */
export const CHAIN_BID_DEFAULT_ETA_SLACK_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Strategy implementation
// ---------------------------------------------------------------------------

export function computeChainBid(input: ComputeChainBidInput): ComputeChainBidResult {
  const { subtask, worker } = input;
  const now = input.now ?? new Date();

  if (!worker.workerPeerId || !worker.workerOwnerId || worker.baseCostUsd < 0) {
    return { ok: false, reason: "invalid_worker" };
  }
  if (!subtask.subtaskId || subtask.depth < 1 || subtask.depth > 4) {
    return { ok: false, reason: "invalid_subtask" };
  }

  // Cost: base × task-complexity-multiplier (depth + 1), discounted by reputation.
  const taskComplexity = subtask.depth + 1;
  const discount = worker.reputationDiscount ?? 1.0;
  const rawCost = worker.baseCostUsd * taskComplexity * discount;

  // Per-subtask cost ceiling overrides the default mandate ceiling. If neither
  // is provided, treat as infinity (no cap).
  const ceiling = subtask.costCeilingUsd ?? Number.POSITIVE_INFINITY;
  if (rawCost > ceiling) {
    return { ok: false, reason: "cost_ceiling_exceeded" };
  }

  // ETA: capability-local + slack.
  const etaSlack = worker.etaSlackMs ?? CHAIN_BID_DEFAULT_ETA_SLACK_MS;
  const proposedEtaMs = now.getTime() + worker.capabilityLocalEtaMs + etaSlack;

  // bidExpiresAt = min(proposal.deadline + 30s, now + 5 min).
  // If the subtask has no explicit deadline, fall back to the 5-minute cap.
  let bidExpiresMs: number;
  if (subtask.deadlineAt) {
    const deadlineMs = Date.parse(subtask.deadlineAt);
    if (Number.isFinite(deadlineMs)) {
      bidExpiresMs = Math.min(
        deadlineMs + CHAIN_BID_DEADLINE_SLACK_MS,
        now.getTime() + CHAIN_BID_MAX_TTL_MS,
      );
    } else {
      bidExpiresMs = now.getTime() + CHAIN_BID_MAX_TTL_MS;
    }
  } else {
    bidExpiresMs = now.getTime() + CHAIN_BID_MAX_TTL_MS;
  }
  // The bid must remain valid long enough to be honored — never in the past.
  bidExpiresMs = Math.max(bidExpiresMs, now.getTime() + 1000);

  const etaMinutes = Math.max(1, Math.round((proposedEtaMs - now.getTime()) / 60_000));
  const bid = ChainSubtaskBidSchema.parse({
    version: "0.1",
    subtaskId: subtask.subtaskId,
    chainId: subtask.chainId,
    workerPeerId: worker.workerPeerId,
    workerOwnerId: worker.workerOwnerId,
    proposedCostUsd: Number(rawCost.toFixed(6)),
    proposedEtaAt: new Date(proposedEtaMs).toISOString(),
    bidExpiresAt: new Date(bidExpiresMs).toISOString(),
    // Surface the capability the worker is offering so the orchestrator's
    // composite ranker can score precision against the subtask's
    // requiredSkill without falling back to the peer-id proxy.
    capability: subtask.requiredSkill,
    rationale: `${subtask.requiredSkill}: $${Number(rawCost.toFixed(2))} · ~${etaMinutes} min`,
    createdAt: now.toISOString(),
  });
  return { ok: true, bid };
}

// ---------------------------------------------------------------------------
// Convenience: build a worker-side `bidExpiredAt` check
// ---------------------------------------------------------------------------

/**
 * True when `bidExpiresAt` is in the past at `nowMs`. Workers use this in
 * `chain-worker.ts` to reject stale `task.chain.accept` envelopes with a
 * `chain.bid_expired` audit event.
 */
export function isChainBidExpired(bidExpiresAt: string, nowMs: number): boolean {
  const expiresMs = Date.parse(bidExpiresAt);
  if (!Number.isFinite(expiresMs)) return true;
  return nowMs >= expiresMs;
}

// ---------------------------------------------------------------------------
// Phase 41C — Composite bid scoring (reputation + freshness + precision)
// ---------------------------------------------------------------------------

export interface BidScoreInput {
  bid: ChainSubtaskBid;
  /** Peer reputation score (0–100), from Phase 8K. Default 50 if unknown. */
  reputationScore?: number;
  /** Reference time for freshness calculation. Defaults to now. */
  now?: Date;
  /** The required capability tag for the subtask. */
  requiredSkill?: string;
}

export interface BidRankingWeights {
  cost: number;
  reputation: number;
  freshness: number;
  precision: number;
}

/** Default weights from the design doc: cost 35%, reputation 30%, freshness 20%, precision 15%. */
export const DEFAULT_BID_WEIGHTS: BidRankingWeights = {
  cost: 0.35,
  reputation: 0.30,
  freshness: 0.20,
  precision: 0.15,
};

/**
 * Freshness decay function. Bids closer to expiration score lower.
 * Returns 0 if expired, up to 1 if just created.
 */
export function freshnessDecay(bidExpiresAt: string, now: Date): number {
  const remaining = new Date(bidExpiresAt).getTime() - now.getTime();
  if (remaining <= 0) return 0;
  const maxWindow = 300_000; // 5 minutes
  return Math.min(1, remaining / maxWindow);
}

/**
 * Capability-match precision score. Exact match = 1, pre/postfix match = 0.5, no match = 0.
 */
export function capabilityMatchPrecision(
  workerCapability: string,
  requiredSkill: string,
): number {
  if (!workerCapability || !requiredSkill) return 0.5;
  if (workerCapability === requiredSkill) return 1;
  if (workerCapability.includes(requiredSkill) || requiredSkill.includes(workerCapability)) return 0.5;
  return 0;
}

/**
 * Composite bid score (0–1). Combines cost, reputation, freshness, and precision.
 * Higher is better. Expired bids score 0 regardless of other factors.
 */
export function bidScore(
  input: BidScoreInput,
  weights: BidRankingWeights = DEFAULT_BID_WEIGHTS,
  costCeiling?: number,
): number {
  const { bid } = input;
  const now = input.now ?? new Date();
  const repScore = input.reputationScore ?? 50;
  const ceiling = costCeiling ?? 50;

  // Expired bids score 0 regardless of other factors
  const fresh = freshnessDecay(bid.bidExpiresAt, now);
  if (fresh <= 0) return 0;

  // Cost: lower cost = higher score (1 − cost/ceiling)
  const costNorm = Math.max(0, Math.min(1, 1 - bid.proposedCostUsd / Math.max(ceiling, 0.01)));

  // Reputation: 0–100 → 0–1
  const repNorm = Math.max(0, Math.min(1, repScore / 100));

  // Freshness
  // Precision: check if the worker's offered capability matches the required
  // capability. Prefer `bid.capability` (Phase 40 protocol field); fall back
  // to the legacy `workerPeerId` proxy when an older worker omitted it, so we
  // don't regress ranking for peers that haven't upgraded yet.
  let precision = 1;
  if (input.requiredSkill) {
    const offered = bid.capability ?? bid.workerPeerId;
    precision = capabilityMatchPrecision(offered, input.requiredSkill);
  }

  const score =
    weights.cost * costNorm +
    weights.reputation * repNorm +
    weights.freshness * fresh +
    weights.precision * precision;

  return Math.max(0, Math.min(1, score));
}

/**
 * Rank an array of bids by composite score (descending). Expired bids are excluded.
 */
export function rankBids(
  bids: Array<{ bid: ChainSubtaskBid; reputationScore?: number }>,
  options: { weights?: BidRankingWeights; costCeiling?: number; requiredSkill?: string; now?: Date } = {},
): Array<{ bid: ChainSubtaskBid; score: number }> {
  const now = options.now ?? new Date();
  const weights = options.weights ?? DEFAULT_BID_WEIGHTS;

  const scored = bids
    .map((b) => ({
      bid: b.bid,
      score: bidScore(
        { bid: b.bid, reputationScore: b.reputationScore, now, requiredSkill: options.requiredSkill },
        weights,
        options.costCeiling,
      ),
    }))
    .filter((s) => s.score > 0) // exclude expired (score 0)
    .sort((a, b) => b.score - a.score); // descending

  return scored;
}

// Re-export so consumers can construct placeholder subtasks in tests.
export { createChainSubtaskId };