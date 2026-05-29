import { describe, expect, it } from "vitest";
import {
  createSystemSignalPayload,
  createUnsignedEnvelope,
  createUnsignedMandate,
  DocumentAcquisitionPosturePolicySchema,
  EmpCapabilitySchema,
  MandateSchema,
  parseSystemSignalPayload,
  SocialProxyPosturePolicySchema,
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
});
