import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundDiscoveryIntent } from "../src/discovery-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-discovery-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

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
      capabilities: ["message.send", "mesh.listen", "mesh.discovery", "task.execute"],
    }),
  };
}

function signedEnvelope(profile: NodeProfile, intent: EnvoyEnvelope["intent"], payload: unknown): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      intent,
      payload,
      createdAt: "2026-04-27T10:00:00.000Z",
      messageId: "discovery-msg-1",
    }),
    signature: "signature",
  };
}

describe("handleInboundDiscoveryIntent", () => {
  it("accepts referred requester and returns discovery response payload", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:peer-a",
      level: "referred",
    });

    const envelope = signedEnvelope(profile, "discovery.request", {
      requesterOwnerId: "envoy:owner:peer-a",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      maxResults: 3,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "disc-corr-1",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload?.responderOwnerId).toBe(profile.owner.ownerId);
      expect(result.responsePayload?.requestMessageId).toBe(envelope.messageId);
      expect(result.responsePayload?.matches.length).toBeGreaterThan(0);
    }
  });

  it("rejects discovery.request from public requester", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope = signedEnvelope(profile, "discovery.request", {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: [],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
    });

    expect(result).toEqual({
      ok: false,
      reason: "discovery.request requires referred/direct trust (got public)",
    });
  });
});
