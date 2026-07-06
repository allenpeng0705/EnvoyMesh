import { describe, expect, it, vi } from "vitest";
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import { createLocalTaskStore, createLocalTrustStore, type NodeProfile } from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tryBondAutonomyInboundAutoAccept } from "../src/bond-autonomy-inbound.js";

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["message.send", "mesh.listen", "mesh.discovery"],
    }),
  };
}

function signedEnvelope(profile: NodeProfile, intent: EnvoyEnvelope["intent"], payload: unknown): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: "local-peer",
      intent,
      payload,
    }),
    signature: "test-signature",
    messageId: "msg-test",
    createdAt: new Date().toISOString(),
  } as EnvoyEnvelope;
}

describe("tryBondAutonomyInboundAutoAccept", () => {
  const profileDir = mkdtempSync(join(tmpdir(), "bond-autonomy-inbound-"));

  it("auto-accepts when sponsor proof token matches", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope = signedEnvelope(profile, "bond.request", {
      requesterOwnerId: "envoy:owner:installer",
      requesterDisplayName: "Installer",
      message: "Hi",
      proofOfContext: "fleet-secret-42",
      requestedLevel: "direct",
    });

    const result = await tryBondAutonomyInboundAutoAccept({
      envelope,
      remotePeerId: "libp2p-installer",
      profile,
      trustStore,
      taskStore,
      config: {
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "disabled" },
        chatAssistEnabled: false,
        contactAiPreferences: [],
        updatedAt: new Date().toISOString(),
        bondAutonomyEnabled: true,
        bondAutonomySponsorProofToken: "fleet-secret-42",
        bondAutonomyRequireReferralProof: true,
      },
      getDailyAutoBondCount: vi.fn().mockResolvedValue(0),
      incrementDailyAutoBondCount: vi.fn().mockResolvedValue(undefined),
      hasIntroCorrelation: vi.fn().mockResolvedValue(false),
      getTrustOverlapScore: vi.fn().mockResolvedValue(0),
    });

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.requesterOwnerId).toBe("envoy:owner:installer");
    }
    const record = await trustStore.getTrustRecord("envoy:owner:installer");
    expect(record?.level).toBe("direct");
  });

  it("rejects when sponsor proof token mismatches", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope = signedEnvelope(profile, "bond.request", {
      requesterOwnerId: "envoy:owner:installer",
      proofOfContext: "wrong",
      requestedLevel: "direct",
    });

    const result = await tryBondAutonomyInboundAutoAccept({
      envelope,
      remotePeerId: "libp2p-installer",
      profile,
      trustStore,
      taskStore,
      config: {
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "disabled" },
        chatAssistEnabled: false,
        contactAiPreferences: [],
        updatedAt: new Date().toISOString(),
        bondAutonomyEnabled: true,
        bondAutonomySponsorProofToken: "expected",
      },
      getDailyAutoBondCount: vi.fn().mockResolvedValue(0),
      incrementDailyAutoBondCount: vi.fn().mockResolvedValue(undefined),
      hasIntroCorrelation: vi.fn().mockResolvedValue(false),
      getTrustOverlapScore: vi.fn().mockResolvedValue(0),
    });

    expect(result.accepted).toBe(false);
  });
});
