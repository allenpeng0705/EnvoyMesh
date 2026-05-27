import { derivePeerId, generateDeviceIdentity, generateOwnerIdentity, createDeviceCertificate } from "@envoymesh/identity";
import {
  createCapabilityManifestStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createDiscoveryRequestPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { createDiscoveryReferralAttestation } from "@envoymesh/api";
import { buildForwardedDiscoveryPayload } from "../src/discovery-forward.js";
import { handleInboundDiscoveryIntent, __resetDiscoveryState } from "../src/discovery-inbound.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-mh-forward-"));
  __resetDiscoveryState();
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function profile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send"],
    }),
  };
}

describe("multihop forward inbound", () => {
  it("matches anonymized hop-1 request via referral trust + attestation", async () => {
    const carol = profile();
    const bob = generateOwnerIdentity();
    const alice = generateOwnerIdentity();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({ peerOwnerId: bob.ownerId, level: "direct", displayName: "Bob" });

    const manifestStore = createCapabilityManifestStore(profileDir);
    const now = new Date().toISOString();
    await manifestStore.saveManifest({
      version: "0.1",
      id: "manifest_music",
      versionTag: "1",
      visibility: "contacts-only",
      sensitivityCeiling: "friends",
      keywords: ["music"],
      capabilities: ["music"],
      approvedAt: now,
      updatedAt: now,
    });
    const capabilityManifest = await manifestStore.loadManifest();

    const hop0 = createDiscoveryRequestPayload({
      requesterOwnerId: alice.ownerId,
      requestedCapabilities: ["music"],
      maxHops: 2,
      currentHop: 0,
    });
    const forwardBase = buildForwardedDiscoveryPayload(hop0, alice.ownerId, bob.ownerId, "corr-1");
    const forward = createDiscoveryRequestPayload({
      ...forwardBase,
      referralAttestation: createDiscoveryReferralAttestation(
        {
          referralOwnerId: bob.ownerId,
          requestMessageId: "req-msg-1",
          correlationId: "corr-1",
          anonymizedRequesterId: forwardBase.requesterOwnerId,
        },
        bob.privateKeyPem,
      ),
    });
    const envelope = {
      ...createUnsignedEnvelope({
        intent: "discovery.request",
        senderPeerId: "peer-bob",
        senderPublicKey: carol.device.publicKeyPem,
        payload: forward,
        correlationId: "corr-1",
      }),
      signature: "sig",
    };

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile: carol,
      remotePeerId: "peer-bob",
      receivedAt: Date.now(),
      correlationId: "corr-1",
      taskStore,
      trustStore,
      capabilityManifest,
      anonymousDiscoveryMode: "off",
      profileDir,
      resolveReferralOwnerPublicKey: async () => bob.publicKeyPem,
    });

    expect(result.ok).toBe(true);
    if (result.ok && "responsePayload" in result) {
      expect(result.responsePayload?.matches.length).toBeGreaterThan(0);
      expect(result.responsePayload?.matches[0]?.ownerId).toBe(carol.owner.ownerId);
    }
  });

  it("denies anonymous hop>0 forward without referral attestation", async () => {
    const carol = profile();
    const bob = generateOwnerIdentity();
    const alice = generateOwnerIdentity();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({ peerOwnerId: bob.ownerId, level: "direct", displayName: "Bob" });

    const hop0 = createDiscoveryRequestPayload({
      requesterOwnerId: alice.ownerId,
      requestedCapabilities: ["music"],
      maxHops: 2,
      currentHop: 0,
    });
    const forward = buildForwardedDiscoveryPayload(hop0, alice.ownerId, bob.ownerId, "corr-2");
    const envelope = {
      ...createUnsignedEnvelope({
        intent: "discovery.request",
        senderPeerId: "peer-bob",
        senderPublicKey: carol.device.publicKeyPem,
        payload: forward,
        correlationId: "corr-2",
      }),
      signature: "sig",
    };

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile: carol,
      remotePeerId: "peer-bob",
      receivedAt: Date.now(),
      correlationId: "corr-2",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "off",
      profileDir,
      resolveReferralOwnerPublicKey: async () => bob.publicKeyPem,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("referralAttestation");
    }
  });
});
