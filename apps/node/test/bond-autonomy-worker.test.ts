/**
 * Phase 19E — Bond Autonomy Worker tests.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  evaluateBondAutonomy,
  sendAgentBondAccept,
  runBondAutonomyPass,
  type BondAutonomyWorkerDeps,
} from "../src/bond-autonomy-worker.js";
import type { AgentCredential, BondAutonomyPosturePolicy } from "@envoymesh/protocol";

// Mock identity module to avoid real Ed25519 crypto
vi.mock("@envoymesh/identity", () => ({
  derivePeerId: (publicKeyPem: string) => `envoy_mock_peer_${publicKeyPem.slice(0, 8)}`,
  signUnsignedEnvelope: (unsigned: any, _privateKey: string) => ({
    ...unsigned,
    signature: "mock-signature",
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeCredential(overrides?: Partial<AgentCredential>): AgentCredential {
  return {
    version: "0.1",
    credentialId: "cred-test",
    ownerId: "envoy:owner:local",
    ownerPublicKeyPem: "owner-pem",
    agentId: "envoy:agent:local",
    agentPeerId: "envoy_agent_test",
    agentPublicKeyPem: "agent-pem",
    scope: ["emp.bond_autonomy"],
    issuedAt: new Date().toISOString(),
    expiresAt: null,
    signature: "sig",
    ...overrides,
  };
}

function makePolicy(overrides?: Partial<BondAutonomyPosturePolicy>): BondAutonomyPosturePolicy {
  return {
    maxAutoBondsPerDay: 5,
    requireReferralProof: true,
    maxAutoBondTier: "direct",
    minTrustOverlapScore: 0.3,
    notifyOwnerOnAutoBond: true,
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<BondAutonomyWorkerDeps>): BondAutonomyWorkerDeps {
  return {
    profile: {
      owner: {
        ownerId: "envoy:owner:local",
        publicKeyPem: "owner-pem",
        privateKeyPem: "owner-priv",
      },
      device: {
        peerId: "envoy_device_test",
        publicKeyPem: "device-pem",
        privateKeyPem: "device-priv",
      },
      deviceCertificate: null as any,
    },
    agentIdentity: {
      agentId: "envoy:agent:local",
      agentPeerId: "envoy_agent_test",
      publicKeyPem: "agent-pem",
      privateKeyPem: "agent-priv",
      credential: makeCredential(),
    },
    posturePolicy: makePolicy(),
    enabled: true,
    trustStore: {
      getTrustRecord: vi.fn().mockResolvedValue(null),
      setTrustRecord: vi.fn().mockResolvedValue(undefined),
    } as any,
    taskStore: {
      appendAuditEvent: vi.fn().mockResolvedValue(undefined),
    } as any,
    getDailyAutoBondCount: vi.fn().mockResolvedValue(0),
    incrementDailyAutoBondCount: vi.fn().mockResolvedValue(undefined),
    sendMeshEnvelope: vi.fn().mockResolvedValue(42),
    hasIntroCorrelation: vi.fn().mockResolvedValue(true),
    getTrustOverlapScore: vi.fn().mockResolvedValue(0.5),
    ...overrides,
  };
}

describe("evaluateBondAutonomy", () => {
  it("rejects when bond_autonomy is disabled", async () => {
    const deps = makeDeps({ enabled: false });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not enabled");
  });

  it("rejects when posture policy is null", async () => {
    const deps = makeDeps({ posturePolicy: null });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(false);
  });

  it("rejects when no agent identity", async () => {
    const deps = makeDeps({ agentIdentity: null });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(false);
  });

  it("rejects when daily cap is reached", async () => {
    const deps = makeDeps({
      posturePolicy: makePolicy({ maxAutoBondsPerDay: 3 }),
      getDailyAutoBondCount: vi.fn().mockResolvedValue(3),
    });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("daily auto-bond cap");
  });

  it("rejects when referral proof required but missing", async () => {
    const deps = makeDeps({
      posturePolicy: makePolicy({ requireReferralProof: true }),
    });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("referral proof required");
  });

  it("accepts when referral proof is present (proofOfContext)", async () => {
    const deps = makeDeps({
      posturePolicy: makePolicy({ requireReferralProof: true }),
    });
    const result = await evaluateBondAutonomy(
      {
        requesterOwnerId: "envoy:owner:peer",
        requesterPeerId: "peer-1",
        requestedLevel: "direct",
        proofOfContext: "mutual friend",
      },
      deps,
    );
    expect(result.allowed).toBe(true);
  });

  it("rejects when sponsor proof token mismatches", async () => {
    const deps = makeDeps({
      sponsorProofToken: "expected-token",
      posturePolicy: makePolicy({ requireReferralProof: true }),
    });
    const result = await evaluateBondAutonomy(
      {
        requesterOwnerId: "envoy:owner:peer",
        requesterPeerId: "peer-1",
        requestedLevel: "direct",
        proofOfContext: "wrong-token",
      },
      deps,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("sponsor proof");
  });

  it("accepts when sponsor proof token matches", async () => {
    const deps = makeDeps({
      sponsorProofToken: "fleet-secret",
      posturePolicy: makePolicy({ requireReferralProof: true }),
    });
    const result = await evaluateBondAutonomy(
      {
        requesterOwnerId: "envoy:owner:peer",
        requesterPeerId: "peer-1",
        requestedLevel: "direct",
        proofOfContext: "fleet-secret",
      },
      deps,
    );
    expect(result.allowed).toBe(true);
  });

  it("rejects when intro correlation not found", async () => {
    const deps = makeDeps({
      posturePolicy: makePolicy({ requireReferralProof: true }),
      hasIntroCorrelation: vi.fn().mockResolvedValue(false),
    });
    const result = await evaluateBondAutonomy(
      {
        requesterOwnerId: "envoy:owner:peer",
        requesterPeerId: "peer-1",
        requestedLevel: "direct",
        introCorrelationId: "intro-1",
      },
      deps,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("intro correlation not found");
  });

  it("accepts with valid intro correlation", async () => {
    const deps = makeDeps({
      posturePolicy: makePolicy({ requireReferralProof: true }),
      hasIntroCorrelation: vi.fn().mockResolvedValue(true),
    });
    const result = await evaluateBondAutonomy(
      {
        requesterOwnerId: "envoy:owner:peer",
        requesterPeerId: "peer-1",
        requestedLevel: "direct",
        introCorrelationId: "intro-1",
      },
      deps,
    );
    expect(result.allowed).toBe(true);
  });

  it("accepts when referral proof not required", async () => {
    const deps = makeDeps({
      posturePolicy: makePolicy({ requireReferralProof: false }),
    });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(true);
  });

  it("rejects when trust overlap score too low", async () => {
    const deps = makeDeps({
      posturePolicy: makePolicy({ requireReferralProof: false, minTrustOverlapScore: 0.5 }),
      getTrustOverlapScore: vi.fn().mockResolvedValue(0.1),
    });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("trust overlap score");
  });

  it("skips trust overlap check when minTrustOverlapScore is 0", async () => {
    const deps = makeDeps({
      posturePolicy: makePolicy({ requireReferralProof: false, minTrustOverlapScore: 0 }),
    });
    const result = await evaluateBondAutonomy(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1", requestedLevel: "direct" },
      deps,
    );
    expect(result.allowed).toBe(true);
  });
});

describe("sendAgentBondAccept", () => {
  it("rejects when no agent identity", async () => {
    const deps = makeDeps({ agentIdentity: null });
    const result = await sendAgentBondAccept(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1" },
      deps,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no agent identity");
  });

  it("sends bond.accept with agent credential", async () => {
    const sendSpy = vi.fn().mockResolvedValue(42);
    const deps = makeDeps({ sendMeshEnvelope: sendSpy });
    const result = await sendAgentBondAccept(
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1" },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(sendSpy).toHaveBeenCalledOnce();
    // Verify senderRole=agent was set
    const callArg = sendSpy.mock.calls[0][1] as any;
    expect(callArg.senderRole).toBe("agent");
    expect(callArg.agentCredential).toBeDefined();
    expect(callArg.agentCredential.scope).toContain("emp.bond_autonomy");
  });
});

describe("runBondAutonomyPass", () => {
  it("rejects all when disabled", async () => {
    const deps = makeDeps({ enabled: false });
    const result = await runBondAutonomyPass(deps, [
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1", requestedLevel: "direct", messageId: "m1" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
  });

  it("accepts eligible request", async () => {
    const deps = makeDeps({
      posturePolicy: makePolicy({ requireReferralProof: false }),
      getTrustOverlapScore: vi.fn().mockResolvedValue(0.5),
    });
    const result = await runBondAutonomyPass(deps, [
      { requesterOwnerId: "envoy:owner:peer", requesterPeerId: "peer-1", requestedLevel: "direct", messageId: "m1" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    // Side effects: trust record written, daily counter incremented, mesh send called
    expect(deps.trustStore.setTrustRecord).toHaveBeenCalledWith(
      expect.objectContaining({ peerOwnerId: "envoy:owner:peer", level: "direct" }),
    );
    expect(deps.incrementDailyAutoBondCount).toHaveBeenCalledOnce();
    expect(deps.sendMeshEnvelope).toHaveBeenCalledOnce();
  });
});
