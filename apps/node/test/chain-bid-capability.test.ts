/**
 * Tests for the bid-capability precision ranking fix.
 *
 * The bug: `bidScore` used `bid.workerPeerId` as a proxy for the worker's
 * capability because bids didn't carry one. The fix added an optional
 * `capability` field to `ChainSubtaskBidSchema` and the ranker now prefers
 * `bid.capability ?? bid.workerPeerId`.
 *
 * Also tests that `computeChainBid` now populates `capability` from the
 * subtask's `requiredSkill`.
 */
import { describe, it, expect } from "vitest";
import {
  bidScore,
  computeChainBid,
  capabilityMatchPrecision,
  type BidScoreInput,
} from "../src/chain-bid-strategy.js";
import { ChainSubtaskBidSchema, type ChainSubtask } from "@envoymesh/protocol";

function makeBid(overrides: Partial<{ capability: string; workerPeerId: string; proposedCostUsd: number }> = {}): BidScoreInput["bid"] {
  return ChainSubtaskBidSchema.parse({
    version: "0.1",
    subtaskId: "subtask_1",
    chainId: "chain_1",
    workerPeerId: overrides.workerPeerId ?? "12D3KooW-worker",
    workerOwnerId: "envoy:owner:worker",
    proposedCostUsd: overrides.proposedCostUsd ?? 2,
    proposedEtaAt: new Date(Date.now() + 120_000).toISOString(),
    bidExpiresAt: new Date(Date.now() + 300_000).toISOString(),
    capability: overrides.capability,
    createdAt: new Date().toISOString(),
  });
}

describe("bidScore — capability precision (post-fix)", () => {
  it("uses bid.capability when present, not workerPeerId", () => {
    const now = new Date();
    // Bid with a matching capability should score higher precision (1.0) than
    // one whose workerPeerId doesn't match the required capability.
    const goodBid = makeBid({ capability: "research" });
    const badBid = makeBid({ capability: "translation" });

    const goodScore = bidScore(
      { bid: goodBid, now, requiredSkill: "research" },
      { cost: 0.25, reputation: 0.25, freshness: 0.25, precision: 0.25 },
      10,
    );
    const badScore = bidScore(
      { bid: badBid, now, requiredSkill: "research" },
      { cost: 0.25, reputation: 0.25, freshness: 0.25, precision: 0.25 },
      10,
    );
    expect(goodScore).toBeGreaterThan(badScore);
  });

  it("falls back to workerPeerId proxy when bid.capability is absent (backward compat)", () => {
    const now = new Date();
    // No capability field — old-style bid. Should still produce a score > 0
    // (uses peer-id proxy).
    const bid = makeBid({ workerPeerId: "12D3KooW-research-peer" });
    const score = bidScore(
      { bid, now, requiredSkill: "research" },
      { cost: 0.25, reputation: 0.25, freshness: 0.25, precision: 0.25 },
      10,
    );
    // peer-id "12D3KooW-research-peer" contains "research" → precision 0.5
    expect(score).toBeGreaterThan(0);
  });

  it("exact capability match scores higher than substring match", () => {
    expect(capabilityMatchPrecision("research", "research")).toBe(1);
    expect(capabilityMatchPrecision("research-analyst", "research")).toBe(0.5);
    expect(capabilityMatchPrecision("translation", "research")).toBe(0);
  });
});

describe("computeChainBid — populates bid.capability", () => {
  it("sets capability to the subtask's requiredSkill", () => {
    const subtask: ChainSubtask = {
      version: "0.1",
      subtaskId: "subtask_1",
      chainId: "chain_1",
      depth: 1,
      requiredSkill: "code_review",
      objective: "Review the Rust code",
      dependsOn: [],
      createdAt: new Date().toISOString(),
    };
    const result = computeChainBid({
      subtask,
      worker: {
        workerPeerId: "12D3KooW-worker",
        workerOwnerId: "envoy:owner:worker",
        baseCostUsd: 1,
        capabilityLocalEtaMs: 60_000,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bid.capability).toBe("code_review");
  });
});
