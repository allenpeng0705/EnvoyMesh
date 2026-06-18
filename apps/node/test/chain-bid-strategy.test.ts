/**
 * Phase 40 — chain-bid-strategy tests.
 *
 * Covers the worker-side bid policy:
 * - Happy path: computeChainBid returns a valid bid with cost = base × depth × discount
 * - Cost-ceiling exceeded: returns ok=false (cost_ceiling_exceeded)
 * - bidExpiresAt is min(deadline + 30s, now + 5 min)
 * - bidExpiresAt defaults to now + 5 min when no deadline
 * - bidExpiresAt is never in the past
 * - Invalid worker / invalid subtask rejections
 * - reputationDiscount applies (e.g. 0.8 → 20% off)
 * - ETA includes capability-local + slack (default 60s slack)
 * - isChainBidExpired returns true for past, false for future, true for malformed
 */

import { describe, expect, it } from "vitest";

import {
  CHAIN_BID_DEADLINE_SLACK_MS,
  CHAIN_BID_MAX_TTL_MS,
  computeChainBid,
  isChainBidExpired,
  type ChainBidWorkerContext,
} from "../src/chain-bid-strategy.js";
import {
  ChainSubtaskSchema,
  createChainSubtaskId,
  type ChainSubtask,
} from "@envoymesh/protocol";

const NOW = new Date("2026-06-18T00:00:00.000Z");
const NOW_MS = NOW.getTime();
const DEADLINE_AT = new Date(NOW_MS + 10 * 60 * 1000).toISOString(); // 10 minutes from now

function subtask(overrides: Partial<ChainSubtask> = {}): ChainSubtask {
  return ChainSubtaskSchema.parse({
    version: "0.1",
    subtaskId: createChainSubtaskId(),
    chainId: "chain_test-1",
    chainMandateId: "chainmandate_test-1",
    depth: 1,
    requiredCapability: "task.execute",
    objective: "summarize the Q3 report",
    requestedResult: "markdown summary",
    constraints: [],
    dependsOn: [],
    createdAt: NOW.toISOString(),
    ...overrides,
  });
}

function worker(overrides: Partial<ChainBidWorkerContext> = {}): ChainBidWorkerContext {
  return {
    workerPeerId: "12D3KooW-worker",
    workerOwnerId: "envoy:owner:worker",
    baseCostUsd: 1,
    capabilityLocalEtaMs: 60_000,
    ...overrides,
  };
}

describe("computeChainBid", () => {
  it("returns a valid bid in the happy path", () => {
    const r = computeChainBid({
      subtask: subtask({ deadlineAt: DEADLINE_AT }),
      worker: worker({ baseCostUsd: 2 }),
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // depth=1 → complexity = 2 → cost = 2 × 2 = 4
    expect(r.bid.proposedCostUsd).toBe(4);
    // ETA = now + 60s (capability) + 60s (slack) = now + 120s
    expect(Date.parse(r.bid.proposedEtaAt) - NOW_MS).toBe(120_000);
    // bidExpiresAt = min(deadline+30s, now+5min) = min(now+630s, now+300s) = now+300s
    expect(Date.parse(r.bid.bidExpiresAt) - NOW_MS).toBe(CHAIN_BID_MAX_TTL_MS);
  });

  it("cost scales linearly with depth", () => {
    for (const depth of [1, 2, 3] as const) {
      const r = computeChainBid({
        subtask: subtask({ depth, deadlineAt: DEADLINE_AT }),
        worker: worker({ baseCostUsd: 1 }),
        now: NOW,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.bid.proposedCostUsd).toBe(depth + 1);
    }
  });

  it("reputationDiscount reduces cost proportionally", () => {
    const r = computeChainBid({
      subtask: subtask({ deadlineAt: DEADLINE_AT }),
      worker: worker({ baseCostUsd: 10, reputationDiscount: 0.8 }),
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 10 × 2 × 0.8 = 16
    expect(r.bid.proposedCostUsd).toBe(16);
  });

  it("returns ok=false when the bid would exceed the subtask cost ceiling", () => {
    const r = computeChainBid({
      subtask: subtask({ depth: 3, costCeilingUsd: 1, deadlineAt: DEADLINE_AT }),
      worker: worker({ baseCostUsd: 1 }),
      now: NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("cost_ceiling_exceeded");
  });

  it("bidExpiresAt = min(proposal.deadline + 30s, now + 5min)", () => {
    // Case A: deadline is far in the future → use the 5-min cap
    const rA = computeChainBid({
      subtask: subtask({
        deadlineAt: new Date(NOW_MS + 60 * 60 * 1000).toISOString(), // 1 hour
      }),
      worker: worker(),
      now: NOW,
    });
    expect(rA.ok).toBe(true);
    if (rA.ok) {
      expect(Date.parse(rA.bid.bidExpiresAt) - NOW_MS).toBe(CHAIN_BID_MAX_TTL_MS);
    }

    // Case B: deadline is soon → use deadline + 30s
    const deadlineSoon = new Date(NOW_MS + 60 * 1000).toISOString(); // 60s from now
    const rB = computeChainBid({
      subtask: subtask({ deadlineAt: deadlineSoon }),
      worker: worker(),
      now: NOW,
    });
    expect(rB.ok).toBe(true);
    if (rB.ok) {
      expect(Date.parse(rB.bid.bidExpiresAt) - NOW_MS).toBe(60_000 + CHAIN_BID_DEADLINE_SLACK_MS);
    }
  });

  it("bidExpiresAt defaults to now + 5min when subtask has no deadline", () => {
    const r = computeChainBid({
      subtask: subtask({ deadlineAt: undefined }),
      worker: worker(),
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Date.parse(r.bid.bidExpiresAt) - NOW_MS).toBe(CHAIN_BID_MAX_TTL_MS);
    }
  });

  it("bidExpiresAt is never in the past (clamped to now + 1s)", () => {
    const deadlineInPast = new Date(NOW_MS - 60 * 1000).toISOString();
    const r = computeChainBid({
      subtask: subtask({ deadlineAt: deadlineInPast }),
      worker: worker(),
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Date.parse(r.bid.bidExpiresAt) - NOW_MS).toBeGreaterThanOrEqual(1000);
    }
  });

  it("rejects invalid worker (missing peerId)", () => {
    const r = computeChainBid({
      subtask: subtask({ deadlineAt: DEADLINE_AT }),
      worker: worker({ workerPeerId: "" }),
      now: NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_worker");
  });

  it("rejects invalid worker (negative base cost)", () => {
    const r = computeChainBid({
      subtask: subtask({ deadlineAt: DEADLINE_AT }),
      worker: worker({ baseCostUsd: -1 }),
      now: NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_worker");
  });

  it("rejects invalid subtask (depth=0)", () => {
    // Schema-level: depth=0 is rejected at parse time, so we have to bypass
    // via a hand-built object. This is intentional defense-in-depth.
    const invalid = { ...subtask({ deadlineAt: DEADLINE_AT }), depth: 0 };
    const r = computeChainBid({
      subtask: invalid as unknown as ChainSubtask,
      worker: worker(),
      now: NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_subtask");
  });

  it("uses default ETA slack of 60s when worker does not specify", () => {
    const r = computeChainBid({
      subtask: subtask({ deadlineAt: DEADLINE_AT }),
      worker: worker({ capabilityLocalEtaMs: 30_000, etaSlackMs: undefined }),
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Date.parse(r.bid.proposedEtaAt) - NOW_MS).toBe(90_000); // 30 + 60
  });

  it("uses worker-specified ETA slack when provided", () => {
    const r = computeChainBid({
      subtask: subtask({ deadlineAt: DEADLINE_AT }),
      worker: worker({ capabilityLocalEtaMs: 30_000, etaSlackMs: 120_000 }),
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Date.parse(r.bid.proposedEtaAt) - NOW_MS).toBe(150_000); // 30 + 120
  });
});

describe("isChainBidExpired", () => {
  it("returns true when bidExpiresAt is in the past", () => {
    expect(isChainBidExpired(new Date(NOW_MS - 1000).toISOString(), NOW_MS)).toBe(true);
  });
  it("returns false when bidExpiresAt is in the future", () => {
    expect(isChainBidExpired(new Date(NOW_MS + 60_000).toISOString(), NOW_MS)).toBe(false);
  });
  it("returns true when bidExpiresAt == now (treat as already expired)", () => {
    expect(isChainBidExpired(new Date(NOW_MS).toISOString(), NOW_MS)).toBe(true);
  });
  it("returns true when bidExpiresAt is malformed", () => {
    expect(isChainBidExpired("not-a-date", NOW_MS)).toBe(true);
  });
});