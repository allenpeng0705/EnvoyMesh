/**
 * Phase 8L — Extended broadcast inbound tests (broadcast-inbound.ts 71% → higher coverage).
 *
 * Tests the uncovered paths in handleInboundBroadcastRequest and handleInboundBroadcastResponse.
 *
 * Note: Rate limit tests are omitted because the rate limiter state is module-level and
 * persists across tests in the same Vitest worker, causing test interference.
 */

import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import {
  createCapabilityManifestStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleInboundBroadcastRequest,
  handleInboundBroadcastResponse,
} from "../src/broadcast-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-bc-ext-"));
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

function signedBroadcastEnvelope(profile: NodeProfile, payload: unknown, messageId?: string) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-broadcaster",
      senderPublicKey: profile.device.publicKeyPem,
      intent: "broadcast.request",
      payload,
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: messageId ?? `bc-ext-${Date.now()}`,
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
      messageId: `bc-resp-${Date.now()}`,
    }),
    signature: "sig",
  };
}

describe("handleInboundBroadcastRequest — capability manifest matching", () => {
  it("matches capabilities against manifest", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const manifestStore = createCapabilityManifestStore(profileDir);

    await manifestStore.createDefaultManifest({
      visibility: "public-preview",
      sensitivityCeiling: "public",
      capabilities: ["mesh.listen", "mesh.discovery"],
      keywords: ["tech", "books"],
    });
    const manifest = await manifestStore.loadManifest();

    // Use unique owner ID to avoid rate limit state pollution
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:cap-match", level: "referred" });

    const envelope = signedBroadcastEnvelope(profile, {
      queryId: "q-cap",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: [],
      requestedCapabilities: ["mesh.listen"],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:cap-match",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-cap-match",
      receivedAt: Date.now(),
      correlationId: "corr-cap",
      taskStore,
      trustStore,
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload?.matchedCapabilities).toContain("mesh.listen");
    }
  });

  it("denies when no capability or keyword match with manifest", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const manifestStore = createCapabilityManifestStore(profileDir);

    await manifestStore.createDefaultManifest({
      visibility: "public-preview",
      sensitivityCeiling: "public",
      capabilities: ["mesh.listen"],
      keywords: ["books"],
    });
    const manifest = await manifestStore.loadManifest();

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:no-match", level: "referred" });

    const envelope = signedBroadcastEnvelope(profile, {
      queryId: "q-no-match",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: ["hash:unknown"],
      requestedCapabilities: ["task.execute"], // not in manifest
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:no-match",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-no-match",
      receivedAt: Date.now(),
      correlationId: "corr-no-match",
      taskStore,
      trustStore,
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no match");
    }
  });
});

describe("handleInboundBroadcastRequest — error handling", () => {
  it("returns error for malformed broadcast.request payload", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedBroadcastEnvelope(profile, {
      // missing required fields
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-err",
      receivedAt: Date.now(),
      correlationId: "corr-bc-err",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("invalid broadcast payload");
    }
  });

  it("rejects non-broadcast.request intent", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "peer-remote",
        senderPublicKey: profile.device.publicKeyPem,
        intent: "discovery.request" as any,
        payload: {
          requesterOwnerId: "envoy:owner:stranger",
          requestedTagHashes: [],
          requestedCapabilities: [],
          maxResults: 2,
        },
        createdAt: "2026-05-06T10:00:00.000Z",
        messageId: "wrong-intent-bc",
      }),
      signature: "sig",
    };

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-wrong",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not a broadcast.request");
    }
  });
});

describe("handleInboundBroadcastResponse — extended", () => {
  it("records broadcast.response with multiple matched capabilities", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedBroadcastResponseEnvelope(profile, {
      queryId: "q-multi",
      responderOwnerId: "envoy:owner:peer-x",
      responderPeerId: "peer-x",
      matchedTagHashes: ["hash:books", "hash:tech"],
      matchedCapabilities: ["mesh.listen", "task.execute"],
      done: true,
    });

    const result = await handleInboundBroadcastResponse({
      envelope,
      taskStore,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.matchedCapabilities).toHaveLength(2);
      expect(result.responsePayload.matchedTagHashes).toHaveLength(2);
    }
  });

  it("records broadcast.response with done=false", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedBroadcastResponseEnvelope(profile, {
      queryId: "q-more",
      responderOwnerId: "envoy:owner:peer-y",
      responderPeerId: "peer-y",
      matchedTagHashes: [],
      matchedCapabilities: ["mesh.discovery"],
      done: false,
    });

    const result = await handleInboundBroadcastResponse({
      envelope,
      taskStore,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.done).toBe(false);
    }
  });

  it("rejects malformed broadcast.response with wrong type for queryId", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedBroadcastResponseEnvelope(profile, {
      queryId: 123, // should be string
      responderOwnerId: "envoy:owner:peer-z",
      responderPeerId: "peer-z",
      matchedTagHashes: [],
      matchedCapabilities: [],
      done: true,
    });

    const result = await handleInboundBroadcastResponse({
      envelope,
      taskStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("invalid broadcast.response payload");
    }
  });

  it("rejects broadcast.response with missing required fields", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedBroadcastResponseEnvelope(profile, {
      queryId: "q-incomplete",
      // missing responderOwnerId
      responderPeerId: "peer-incomplete",
      matchedTagHashes: [],
      matchedCapabilities: [],
      done: true,
    });

    const result = await handleInboundBroadcastResponse({
      envelope,
      taskStore,
    });

    expect(result.ok).toBe(false);
  });
});
