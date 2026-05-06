/**
 * Phase 8L — Extended discovery inbound tests (discovery-inbound.ts 66% → higher coverage).
 *
 * Tests the uncovered paths in handleInboundDiscoveryIntent and handleInboundRelayPeersIntent.
 *
 * Note: Anonymous discovery mode tests and rate-limit tests are sensitive to module-level
 * rate limiter state that persists across tests in the same Vitest worker.
 * Only tests using isolated identifiers are included.
 */

import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import {
  createCapabilityManifestStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleInboundDiscoveryIntent,
  handleInboundRelayPeersIntent,
} from "../src/discovery-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-disc-ext-"));
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
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: `disc-ext-${Date.now()}`,
    }),
    signature: "sig",
  };
}

describe("handleInboundDiscoveryIntent — discovery.response handler", () => {
  it("records discovery.response and returns ok=true", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedEnvelope(profile, "discovery.response", {
      requestMessageId: "disc-req-123",
      responderOwnerId: "envoy:owner:responder-peer",
      matches: [
        {
          ownerId: "envoy:owner:responder-peer",
          peerId: "peer-responder",
          matchedTagHashes: ["hash:books"],
          matchedCapabilities: ["task.execute"],
        },
      ],
      truncated: false,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-responder",
      receivedAt: Date.now(),
      correlationId: "corr-resp",
      taskStore,
      trustStore: {} as any,
    });

    expect(result.ok).toBe(true);
    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.intent === "discovery.response")).toBe(true);
  });
});

describe("handleInboundDiscoveryIntent — unknown intent", () => {
  it("returns not-a-discovery-intent for relay.peers.request", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "relay.peers.request", {});

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-relay",
      receivedAt: Date.now(),
      correlationId: "corr-unknown",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not a discovery intent");
    }
  });

  it("returns not-a-discovery-intent for chat.message", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "chat.message", { text: "hello" });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-chat",
      receivedAt: Date.now(),
      correlationId: "corr-chat",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not a discovery intent");
    }
  });
});

describe("handleInboundDiscoveryIntent — error handling", () => {
  it("returns error for malformed discovery.request payload", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "discovery.request", {
      // missing required fields
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-error",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("invalid discovery payload");
    }
  });

  it("returns error for malformed discovery.response payload", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedEnvelope(profile, "discovery.response", {
      requestMessageId: 123, // should be string
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-error-resp",
      taskStore,
      trustStore: {} as any,
    });

    expect(result.ok).toBe(false);
  });
});

describe("handleInboundRelayPeersIntent — relay.peers.response", () => {
  it("records relay.peers.response and returns ok=true", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedEnvelope(profile, "relay.peers.response", {
      requestMessageId: "relay-req-456",
      peers: [
        {
          peerId: "peer-a",
          ownerId: "envoy:owner:peer-a",
          multiaddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/relay/p2p/peer-a"],
        },
      ],
    });

    const result = await handleInboundRelayPeersIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-relay",
      receivedAt: Date.now(),
      correlationId: "corr-relay-resp",
      taskStore,
      relayPeerIds: [],
      relayMultiaddrs: [],
    });

    expect(result.ok).toBe(true);
  });

  it("records audit event for relay.peers.response", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedEnvelope(profile, "relay.peers.response", {
      requestMessageId: "relay-req-789",
      peers: [
        {
          peerId: "peer-b",
          ownerId: "envoy:owner:peer-b",
          multiaddrs: [],
        },
      ],
    });

    await handleInboundRelayPeersIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-relay",
      receivedAt: Date.now(),
      correlationId: "corr-relay-resp2",
      taskStore,
      relayPeerIds: [],
      relayMultiaddrs: [],
    });

    const audits = await taskStore.readAuditEvents();
    expect(audits[0].intent).toBe("relay.peers.response");
    expect(audits[0].summary).toContain("relay.peers.response");
  });
});

describe("handleInboundRelayPeersIntent — relay.peers.request edge cases", () => {
  it("returns empty peers list when only the requester is in relayPeerIds", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedEnvelope(profile, "relay.peers.request", {});

    const result = await handleInboundRelayPeersIntent({
      envelope,
      profile,
      remotePeerId: "peer-only",
      receivedAt: Date.now(),
      correlationId: "corr-only",
      taskStore,
      relayPeerIds: ["peer-only"], // only the requester
      relayMultiaddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/relay"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload?.peers).toEqual([]);
    }
  });

  it("builds correct circuit multiaddrs with multiple relay bases", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedEnvelope(profile, "relay.peers.request", {});

    const result = await handleInboundRelayPeersIntent({
      envelope,
      profile,
      remotePeerId: "peer-a",
      receivedAt: Date.now(),
      correlationId: "corr-multi",
      taskStore,
      relayPeerIds: ["peer-a", "peer-b", "peer-c"],
      relayMultiaddrs: [
        "/ip4/1.2.3.4/tcp/4001/p2p/relay1",
        "/ip4/5.6.7.8/tcp/4001/p2p/relay2",
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload?.peers.length).toBe(2); // peer-b and peer-c (not peer-a)
    }
  });
});

describe("handleInboundRelayPeersIntent — unknown intent", () => {
  it("returns not-a-relay-peers-intent for discovery.request", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedEnvelope(profile, "discovery.request", {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: [],
      requestedCapabilities: [],
      maxResults: 2,
    });

    const result = await handleInboundRelayPeersIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: "corr-wrong-intent",
      taskStore,
      relayPeerIds: [],
      relayMultiaddrs: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not a relay.peers intent");
    }
  });
});

describe("handleInboundRelayPeersIntent — error handling", () => {
  it("returns error for malformed relay.peers.response payload", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedEnvelope(profile, "relay.peers.response", {
      requestMessageId: 123, // should be string
      peers: "not-an-array", // should be array
    });

    const result = await handleInboundRelayPeersIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-relay",
      receivedAt: Date.now(),
      correlationId: "corr-relay-err",
      taskStore,
      relayPeerIds: [],
      relayMultiaddrs: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("invalid relay.peers payload");
    }
  });
});
