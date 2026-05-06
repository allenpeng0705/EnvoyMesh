import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundBroadcastRequest, handleInboundBroadcastResponse } from "../src/broadcast-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-broadcast-"));
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

function signedBroadcastEnvelope(profile: NodeProfile, payload: unknown) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-broadcaster",
      senderPublicKey: profile.device.publicKeyPem,
      intent: "broadcast.request",
      payload,
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: "broadcast-msg-1",
    }),
    signature: "sig",
  };
}

function signedBroadcastResponseEnvelope(profile: NodeProfile, payload: unknown) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-responder",
      senderPublicKey: profile.device.publicKeyPem,
      intent: "broadcast.response",
      payload,
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: "broadcast-response-1",
    }),
    signature: "sig",
  };
}

describe("handleInboundBroadcastRequest", () => {
  it("accepts referred requester and returns broadcast response payload", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:broadcaster",
      level: "referred",
    });

    const envelope = signedBroadcastEnvelope(profile, {
      queryId: "q-001",
      ttl: 1,
      maxResponses: 5,
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:broadcaster",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-broadcaster",
      receivedAt: Date.now(),
      correlationId: "corr-b1",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "contacts-only",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload?.queryId).toBe("q-001");
      expect(result.responsePayload?.responderOwnerId).toBe(profile.owner.ownerId);
      expect(result.responsePayload?.matchedCapabilities).toContain("task.execute");
    }
  });

  it("rejects broadcast.request from public requester when mode is contacts-only", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope = signedBroadcastEnvelope(profile, {
      queryId: "q-002",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: ["hash:music"],
      requestedCapabilities: [],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:stranger",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "contacts-only",
    });

    expect(result).toEqual({
      ok: false,
      reason: "anonymous broadcast mode is contacts-only; public callers are rejected",
    });
  });

  it("silently drops broadcast.request from public requester when mode is off", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope = signedBroadcastEnvelope(profile, {
      queryId: "q-003",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: ["hash:music"],
      requestedCapabilities: [],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:stranger",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "off",
    });

    expect(result).toEqual({
      ok: false,
      reason: "anonymous broadcast is disabled",
    });
  });

  it("rejects blocked sender", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:blocked-sender", level: "blocked" });

    const envelope = signedBroadcastEnvelope(profile, {
      queryId: "q-004",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: [],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:blocked-sender",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-blocked",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
    });

    expect(result).toEqual({
      ok: false,
      reason: "sender is blocked",
    });
  });

  it("rejects broadcast.request with no match (no tags, no capability match)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:friend", level: "referred" });

    const envelope = signedBroadcastEnvelope(profile, {
      queryId: "q-005",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: [], // no tags
      requestedCapabilities: ["nonexistent.capability"], // no caps match device cert
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:friend",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-friend",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
    });

    // No manifest, no tags, no cap match → no match
    expect(result).toEqual({
      ok: false,
      reason: "no match",
    });
  });

  it("allows referred requester with public-preview mode and matched capabilities", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:friend", level: "referred" });

    const envelope = signedBroadcastEnvelope(profile, {
      queryId: "q-006",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: [],
      requestedCapabilities: ["mesh.listen"],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:friend",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-friend",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload?.matchedCapabilities).toContain("mesh.listen");
    }
  });
});

describe("handleInboundBroadcastResponse", () => {
  it("records inbound broadcast.response and returns parsed payload", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedBroadcastResponseEnvelope(profile, {
      queryId: "q-001",
      responderOwnerId: "envoy:owner:peer-responder",
      responderPeerId: "peer-responder",
      matchedTagHashes: ["hash:books"],
      matchedCapabilities: ["mesh.listen"],
      done: true,
    });

    const result = await handleInboundBroadcastResponse({
      envelope,
      taskStore,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.queryId).toBe("q-001");
      expect(result.responsePayload.responderOwnerId).toBe("envoy:owner:peer-responder");
      expect(result.responsePayload.matchedCapabilities).toContain("mesh.listen");
      expect(result.responsePayload.done).toBe(true);
    }
  });

  it("rejects malformed broadcast.response payload", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedBroadcastResponseEnvelope(profile, {
      queryId: 123, // should be string
      responderOwnerId: "envoy:owner:peer-responder",
      responderPeerId: "peer-responder",
      matchedTagHashes: [],
      matchedCapabilities: [],
      done: true,
    });

    const result = await handleInboundBroadcastResponse({
      envelope,
      taskStore,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("invalid broadcast.response payload");
  });
});
