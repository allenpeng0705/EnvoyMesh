import { describe, expect, it } from "vitest";
import {
  BondAutonomyPosturePolicySchema,
  CapabilityProviderPosturePolicySchema,
  createSystemSignalPayload,
  createUnsignedEnvelope,
  createUnsignedMandate,
  DocumentAcquisitionPosturePolicySchema,
  EMP_AGENT_SCOPE_BOND_AUTONOMY,
  EmpCapabilitySchema,
  EMP_AGENT_SCOPE_CAPABILITY_PROVIDER,
  EMP_AGENT_SCOPE_DOCUMENT_ACQUISITION,
  EMP_AGENT_SCOPE_SOCIAL_PROXY,
  FederatedRagConfigSchema,
  MandateSchema,
  parseSystemSignalPayload,
  SocialProxyPosturePolicySchema,
  UnsignedAgentCredentialSchema,
} from "../src/index.js";

describe("EnvoyAI posture schemas (emp/0.1)", () => {
  it("parses standing social_proxy mandate fields", () => {
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:test",
      issuedToDeviceId: "envoy:device:test",
      issuedToAgentId: "envoy:agent:test",
      taskIntent: "emp.social_proxy",
      objective: "Represent owner socially within bounds",
      posture: "social_proxy",
      posturePolicy: SocialProxyPosturePolicySchema.parse({
        autoHello: true,
        maxNewIntrosPerDay: 3,
      }),
    });
    expect(unsigned.posture).toBe("social_proxy");
    expect(unsigned.issuedToAgentId).toBe("envoy:agent:test");
    const signed = MandateSchema.parse({ ...unsigned, signature: "sig" });
    expect(signed.posturePolicy).toMatchObject({ autoHello: true });
  });

  it("parses document_acquisition posture policy defaults", () => {
    const policy = DocumentAcquisitionPosturePolicySchema.parse({});
    expect(policy.searchBondedOnly).toBe(true);
    expect(policy.maxHops).toBe(0);
    expect(policy.maxActiveJobs).toBe(3);
    expect(policy.maxBroadcastResults).toBe(10);
    expect(policy.broadcastResponseTimeoutMs).toBe(30000);
  });

  it("parses social proxy policy schedule interval", () => {
    const policy = SocialProxyPosturePolicySchema.parse({ scheduleIntervalHours: 24 });
    expect(policy.scheduleIntervalHours).toBe(24);
  });

  it("accepts optional postureRef on envelope", () => {
    const env = createUnsignedEnvelope({
      senderPeerId: "envoy_peer_a",
      senderPublicKey: "pem",
      senderRole: "system",
      recipientRole: "agent",
      intent: "system.ping",
      payload: { nonce: "n1" },
      postureRef: "mandate-social-proxy-001",
    });
    expect(env.postureRef).toBe("mandate-social-proxy-001");
  });

  it("parses supportedCapabilities on system.signal", () => {
    const certificate = {
      version: "0.1" as const,
      certificateId: "cert-1",
      ownerId: "envoy:owner:x",
      deviceId: "envoy:device:x",
      devicePublicKeyPem: "pem",
      deviceProfile: "primary" as const,
      capabilities: ["message.send" as const],
      issuedAt: new Date().toISOString(),
      expiresAt: null,
      signature: "sig",
    };
    const payload = createSystemSignalPayload({
      deviceCertificate: certificate,
      ownerPublicKeyPem: "pem",
      supportedCapabilities: ["social-proxy", "document-acquisition"],
    });
    expect(parseSystemSignalPayload(payload).supportedCapabilities).toEqual([
      "social-proxy",
      "document-acquisition",
    ]);
    expect(EmpCapabilitySchema.safeParse("standing-delegation").success).toBe(true);
  });

  // Phase 19 — bond_autonomy posture
  it("parses bond_autonomy posture policy defaults", () => {
    const policy = BondAutonomyPosturePolicySchema.parse({});
    expect(policy.maxAutoBondsPerDay).toBe(5);
    expect(policy.requireReferralProof).toBe(true);
    expect(policy.maxAutoBondTier).toBe("direct");
    expect(policy.minTrustOverlapScore).toBe(0.3);
    expect(policy.notifyOwnerOnAutoBond).toBe(true);
  });

  it("parses bond_autonomy posture policy with custom values", () => {
    const policy = BondAutonomyPosturePolicySchema.parse({
      maxAutoBondsPerDay: 10,
      requireReferralProof: false,
      maxAutoBondTier: "referred",
      minTrustOverlapScore: 0.5,
      notifyOwnerOnAutoBond: false,
    });
    expect(policy.maxAutoBondsPerDay).toBe(10);
    expect(policy.requireReferralProof).toBe(false);
    expect(policy.maxAutoBondTier).toBe("referred");
    expect(policy.minTrustOverlapScore).toBe(0.5);
    expect(policy.notifyOwnerOnAutoBond).toBe(false);
  });

  it("creates bond_autonomy standing mandate", () => {
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:test",
      issuedToDeviceId: "envoy:device:test",
      issuedToAgentId: "envoy:agent:test",
      taskIntent: "emp.bond_autonomy",
      objective: "Auto-accept bond requests within policy bounds",
      posture: "bond_autonomy",
      posturePolicy: BondAutonomyPosturePolicySchema.parse({
        maxAutoBondsPerDay: 3,
        requireReferralProof: true,
        maxAutoBondTier: "direct",
      }),
    });
    expect(unsigned.posture).toBe("bond_autonomy");
    expect(unsigned.issuedToAgentId).toBe("envoy:agent:test");
    const signed = MandateSchema.parse({ ...unsigned, signature: "sig" });
    expect(signed.posturePolicy).toMatchObject({ maxAutoBondsPerDay: 3 });
  });

  it("bond_autonomy supportedCapability is recognized", () => {
    expect(EmpCapabilitySchema.safeParse("bond-autonomy").success).toBe(true);
  });

  it("emp.bond_autonomy credential scope constant is defined", () => {
    expect(EMP_AGENT_SCOPE_BOND_AUTONOMY).toBe("emp.bond_autonomy");
  });

  it("agent credential with bond_autonomy scope parses", () => {
    const cred = UnsignedAgentCredentialSchema.parse({
      version: "0.1",
      credentialId: "cred-bond-1",
      ownerId: "envoy:owner:test",
      ownerPublicKeyPem: "owner-pem",
      agentId: "envoy:agent:test",
      agentPeerId: "envoy_peer_test",
      agentPublicKeyPem: "agent-pem",
      scope: ["emp.bond_autonomy", "emp.social_proxy"],
      issuedAt: new Date().toISOString(),
      expiresAt: null,
    });
    expect(cred.scope).toContain("emp.bond_autonomy");
    expect(cred.scope).toContain("emp.social_proxy");
  });

  it("capability_provider posture policy defaults", () => {
    const policy = CapabilityProviderPosturePolicySchema.parse({});
    expect(policy.searchBondedOnly).toBe(true);
    expect(policy.maxActiveJobs).toBe(3);
    expect(policy.jobTtlHours).toBe(72);
    expect(policy.maxHops).toBe(0);
    expect(policy.maxBroadcastResults).toBe(10);
    expect(policy.broadcastResponseTimeoutMs).toBe(30000);
    expect(policy.allowUnbondedTaskExecution).toBe(false);
  });

  it("parses federated RAG config defaults (Phase 22)", () => {
    const config = FederatedRagConfigSchema.parse({});
    expect(config.enabled).toBe(false);
    expect(config.maxPeers).toBe(5);
    expect(config.queryTimeoutMs).toBe(15000);
    expect(config.maxSensitivity).toBe("public");
    expect(config.includeUnbondedPeers).toBe(false);
    expect(config.maxPeerResults).toBe(10);
  });

  it("parses federated RAG config with custom values", () => {
    const config = FederatedRagConfigSchema.parse({
      enabled: true,
      maxPeers: 10,
      queryTimeoutMs: 30000,
      maxSensitivity: "friends",
      includeUnbondedPeers: true,
      maxPeerResults: 20,
    });
    expect(config.enabled).toBe(true);
    expect(config.maxPeers).toBe(10);
    expect(config.maxSensitivity).toBe("friends");
    expect(config.includeUnbondedPeers).toBe(true);
  });

  it("all credential scope constants are defined", () => {
    expect(EMP_AGENT_SCOPE_SOCIAL_PROXY).toBe("emp.social_proxy");
    expect(EMP_AGENT_SCOPE_DOCUMENT_ACQUISITION).toBe("emp.document_acquisition");
    expect(EMP_AGENT_SCOPE_CAPABILITY_PROVIDER).toBe("emp.capability_provider");
    expect(EMP_AGENT_SCOPE_BOND_AUTONOMY).toBe("emp.bond_autonomy");
  });
});
