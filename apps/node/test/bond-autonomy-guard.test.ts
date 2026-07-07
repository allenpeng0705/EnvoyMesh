/**
 * Tests for the bond-autonomy evaluateBondAutonomy guard fix.
 *
 * The bug: `evaluateBondAutonomy` required `deps.agentIdentity` to be truthy,
 * but the inbound auto-accept path legitimately passes `agentIdentity: null`
 * (it writes the trust record directly instead of sending a wire bond.accept).
 * The fix removed agentIdentity from the evaluation guard.
 *
 * These tests verify the guard no longer blocks when agentIdentity is null,
 * while still blocking when disabled or when no policy is set.
 */
import { describe, it, expect, vi } from "vitest";
import { evaluateBondAutonomy } from "../src/bond-autonomy-worker.js";
import type { BondAutonomyWorkerDeps } from "../src/bond-autonomy-worker.js";
import type { NodeProfile, LocalTrustStore, LocalTaskStore } from "@envoymesh/local-store";

function makeDeps(overrides: Partial<BondAutonomyWorkerDeps> = {}): BondAutonomyWorkerDeps {
  return {
    enabled: true,
    posturePolicy: {
      maxAutoBondsPerDay: 50,
      requireReferralProof: false,
      maxAutoBondTier: "direct" as never,
      minTrustOverlapScore: 0,
      notifyOwnerOnAutoBond: true,
    },
    agentIdentity: null, // the key condition: inbound path passes null
    profile: { owner: { ownerId: "envoy:owner:me", publicKeyPem: "pk", privateKeyPem: "sk" } } as unknown as NodeProfile,
    trustStore: { getTrustRecord: vi.fn().mockResolvedValue(null) } as unknown as LocalTrustStore,
    taskStore: {} as unknown as LocalTaskStore,
    getDailyAutoBondCount: vi.fn().mockResolvedValue(0),
    incrementDailyAutoBondCount: vi.fn().mockResolvedValue(undefined),
    sendMeshEnvelope: vi.fn().mockResolvedValue(0),
    hasIntroCorrelation: vi.fn().mockResolvedValue(false),
    getTrustOverlapScore: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("evaluateBondAutonomy — agentIdentity guard fix", () => {
  it("allows evaluation when agentIdentity is null (inbound auto-accept path)", async () => {
    const deps = makeDeps({ agentIdentity: null });
    const result = await evaluateBondAutonomy(
      {
        requesterOwnerId: "envoy:owner:peer",
        requesterPeerId: "peer-remote",
        requestedLevel: "direct",
      },
      deps,
    );
    // Should NOT be the "no agent identity" rejection — it should pass the guard.
    expect(result.allowed).toBe(true);
    expect(result.reason).not.toContain("no agent identity");
  });

  it("still blocks when disabled", async () => {
    const deps = makeDeps({ enabled: false });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(false);
  });

  it("still blocks when no posture policy", async () => {
    const deps = makeDeps({ posturePolicy: null });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(false);
  });

  it("blocks when sponsor proof token mismatches", async () => {
    const deps = makeDeps({ sponsorProofToken: "expected-secret" });
    const result = await evaluateBondAutonomy(
      {
        requesterOwnerId: "envoy:owner:peer",
        requesterPeerId: "peer",
        proofOfContext: "wrong-secret",
        requestedLevel: "direct",
      },
      deps,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("sponsor proof token");
  });

  it("allows when sponsor proof token matches, even with agentIdentity null", async () => {
    const deps = makeDeps({ sponsorProofToken: "fleet-secret-42" });
    const result = await evaluateBondAutonomy(
      {
        requesterOwnerId: "envoy:owner:peer",
        requesterPeerId: "peer",
        proofOfContext: "fleet-secret-42",
        requestedLevel: "direct",
      },
      deps,
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks when daily cap is reached", async () => {
    const deps = makeDeps({ getDailyAutoBondCount: vi.fn().mockResolvedValue(50) });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("daily");
  });
});
