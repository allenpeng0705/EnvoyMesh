/**
 * Phase 41C — Composite bid scoring tests.
 *
 * Tests bidScore(), rankBids(), freshnessDecay(), and capabilityMatchPrecision().
 *
 * Run: npx vitest run apps/node/test/chain-bid-strategy-composite.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  bidScore,
  rankBids,
  freshnessDecay,
  capabilityMatchPrecision,
  DEFAULT_BID_WEIGHTS,
  type BidScoreInput,
  type BidRankingWeights,
} from "../src/chain-bid-strategy.js";
import type { ChainSubtaskBid } from "@envoymesh/protocol";

function makeBid(overrides: Partial<ChainSubtaskBid> = {}): ChainSubtaskBid {
  return {
    version: "0.1",
    subtaskId: "sub_test_001",
    chainId: "chain_test",
    workerPeerId: "12D3KooW-test",
    workerOwnerId: "envoy:owner:test",
    proposedCostUsd: 5.0,
    proposedEtaAt: new Date(Date.now() + 60_000).toISOString(),
    bidExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  } as ChainSubtaskBid;
}

// ---------------------------------------------------------------------------
// freshnessDecay
// ---------------------------------------------------------------------------

describe("freshnessDecay", () => {
  it("returns 1 for a bid that just expires", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const expiresAt = new Date("2026-06-15T12:05:00Z").toISOString(); // 5 min = maxWindow
    expect(freshnessDecay(expiresAt, now)).toBeCloseTo(1, 1);
  });

  it("returns 0 for an expired bid", () => {
    const now = new Date("2026-06-15T12:10:00Z");
    const expiresAt = new Date("2026-06-15T12:00:00Z").toISOString(); // 10 min ago
    expect(freshnessDecay(expiresAt, now)).toBe(0);
  });

  it("returns ~0.5 for a bid halfway through its window", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const expiresAt = new Date("2026-06-15T12:02:30Z").toISOString(); // 2.5 min = half of 5 min
    expect(freshnessDecay(expiresAt, now)).toBeCloseTo(0.5, 1);
  });

  it("returns 0 for exactly expired bid", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const expiresAt = now.toISOString();
    expect(freshnessDecay(expiresAt, now)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// capabilityMatchPrecision
// ---------------------------------------------------------------------------

describe("capabilityMatchPrecision", () => {
  it("returns 1 for exact match", () => {
    expect(capabilityMatchPrecision("translation", "translation")).toBe(1);
  });

  it("returns 0.5 for prefix match", () => {
    expect(capabilityMatchPrecision("translation_en", "translation")).toBe(0.5);
    expect(capabilityMatchPrecision("translation", "translation_en")).toBe(0.5);
  });

  it("returns 0 for no match", () => {
    expect(capabilityMatchPrecision("translation", "search")).toBe(0);
  });

  it("returns 0.5 when one input is empty", () => {
    expect(capabilityMatchPrecision("", "translation")).toBe(0.5);
    expect(capabilityMatchPrecision("search", "")).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// bidScore
// ---------------------------------------------------------------------------

describe("bidScore", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("scores a cheap, fresh, reputable bid highly", () => {
    const bid = makeBid({
      proposedCostUsd: 2.0,
      bidExpiresAt: new Date("2026-06-15T12:05:00Z").toISOString(),
    });
    const score = bidScore({ bid, reputationScore: 90, now }, DEFAULT_BID_WEIGHTS, 10);
    expect(score).toBeGreaterThan(0.6);
  });

  it("scores an expensive, low-reputation bid low", () => {
    const bid = makeBid({
      proposedCostUsd: 9.5,
      bidExpiresAt: new Date("2026-06-15T12:01:00Z").toISOString(),
    });
    const score = bidScore({ bid, reputationScore: 10, now }, DEFAULT_BID_WEIGHTS, 10);
    expect(score).toBeLessThan(0.5);
  });

  it("returns 0 for an expired bid", () => {
    const bid = makeBid({
      proposedCostUsd: 1,
      bidExpiresAt: new Date("2026-06-15T11:00:00Z").toISOString(), // 1 hour ago
    });
    const score = bidScore({ bid, reputationScore: 100, now }, DEFAULT_BID_WEIGHTS, 10);
    expect(score).toBe(0);
  });

  it("defaults reputation to 50 when not provided", () => {
    const bid = makeBid();
    const score = bidScore({ bid, now }, DEFAULT_BID_WEIGHTS, 10);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("applies custom weights correctly", () => {
    // All cost weight — should heavily favor cheap bids
    const costBid = makeBid({ proposedCostUsd: 1 });
    const expensiveBid = makeBid({ proposedCostUsd: 9 });
    const cheapWeights: BidRankingWeights = { cost: 1, reputation: 0, freshness: 0, precision: 0 };

    const cheapScore = bidScore({ bid: costBid, now }, cheapWeights, 10);
    const expScore = bidScore({ bid: expensiveBid, now }, cheapWeights, 10);

    expect(cheapScore).toBeGreaterThan(expScore);
  });

  it("clamps score to 0..1 range", () => {
    // Even with perfect inputs, score should not exceed 1
    const bid = makeBid({
      proposedCostUsd: 0.01,
      bidExpiresAt: new Date("2026-06-15T12:05:00Z").toISOString(),
    });
    const score = bidScore({ bid, reputationScore: 100, now }, DEFAULT_BID_WEIGHTS, 10);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("precision penalty applies with requiredSkill", () => {
    // When requiredSkill is provided, the bid's workerPeerId is used as a
    // proxy for capability matching. Same peerId = exact match = no penalty.
    const bid = makeBid({ workerPeerId: "same" });
    const score = bidScore({ bid, now, requiredSkill: "same" }, DEFAULT_BID_WEIGHTS, 10);
    // Without requiredSkill, the same bid would get precision=1.
    // With it, workerPeerId "same" matches "same" → 1. So scores should be equal.
    const scoreNoReq = bidScore({ bid, now }, DEFAULT_BID_WEIGHTS, 10);
    expect(score).toBe(scoreNoReq);
  });
});

// ---------------------------------------------------------------------------
// rankBids
// ---------------------------------------------------------------------------

describe("rankBids", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("ranks bids by composite score (descending)", () => {
    const bids = [
      { bid: makeBid({ proposedCostUsd: 9.5, workerPeerId: "expensive" }), reputationScore: 50 },
      { bid: makeBid({ proposedCostUsd: 2.0, workerPeerId: "cheap" }), reputationScore: 50 },
      { bid: makeBid({ proposedCostUsd: 5.0, workerPeerId: "mid" }), reputationScore: 50 },
    ];

    const ranked = rankBids(bids, { now, costCeiling: 10 });
    expect(ranked.length).toBe(3);
    expect(ranked[0].bid.workerPeerId).toBe("cheap"); // lowest cost
    expect(ranked[2].bid.workerPeerId).toBe("expensive"); // highest cost
  });

  it("excludes expired bids", () => {
    const expired = makeBid({
      proposedCostUsd: 1.0,
      bidExpiresAt: new Date("2026-06-15T11:00:00Z").toISOString(),
      workerPeerId: "expired",
    });
    const valid = makeBid({ proposedCostUsd: 5.0, workerPeerId: "valid" });

    const ranked = rankBids(
      [
        { bid: expired, reputationScore: 50 },
        { bid: valid, reputationScore: 50 },
      ],
      { now, costCeiling: 10 },
    );
    expect(ranked.length).toBe(1);
    expect(ranked[0].bid.workerPeerId).toBe("valid");
  });

  it("ranks by reputation when costs are similar", () => {
    const bids = [
      { bid: makeBid({ proposedCostUsd: 5.0, workerPeerId: "low_rep" }), reputationScore: 10 },
      { bid: makeBid({ proposedCostUsd: 5.1, workerPeerId: "high_rep" }), reputationScore: 90 },
    ];

    const ranked = rankBids(bids, { now, costCeiling: 10 });
    // high_rep should rank higher despite slightly higher cost
    expect(ranked[0].bid.workerPeerId).toBe("high_rep");
  });

  it("respects custom weights", () => {
    // All reputation weight — should rank by reputation alone
    const bids = [
      { bid: makeBid({ proposedCostUsd: 1.0, workerPeerId: "cheap_low_rep" }), reputationScore: 10 },
      { bid: makeBid({ proposedCostUsd: 9.0, workerPeerId: "expensive_high_rep" }), reputationScore: 90 },
    ];
    const repWeights: BidRankingWeights = { cost: 0, reputation: 1, freshness: 0, precision: 0 };

    const ranked = rankBids(bids, { now, costCeiling: 10, weights: repWeights });
    expect(ranked[0].bid.workerPeerId).toBe("expensive_high_rep");
  });

  it("returns empty array when all bids expired", () => {
    const bids = [
      { bid: makeBid({ bidExpiresAt: new Date("2026-06-15T11:00:00Z").toISOString() }), reputationScore: 50 },
    ];
    const ranked = rankBids(bids, { now });
    expect(ranked).toEqual([]);
  });
});
