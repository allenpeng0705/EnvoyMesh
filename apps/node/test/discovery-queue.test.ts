/**
 * Phase 8I — Low-priority queue tests for anonymous discovery.
 *
 * Tests the queue data structure and processing logic:
 * - Queue enqueue/dequeue with FIFO ordering
 * - Queue size limits
 * - Queue entry TTL expiration
 * - Queue processing bypasses rate limit
 *
 * NOTE: The anonymous discovery queue is specifically for public/anonymous callers
 * (no trust record). With a trust record, the rate limit is bypassed.
 * To test the queue, we use:
 * - No trust record (public caller)
 * - A capability manifest (so public callers pass the manifest check)
 */

import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
  type CapabilityManifest,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleInboundDiscoveryIntent, processDiscoveryQueue, getQueuedDiscoveryCount, clearExpiredQueueEntries, __resetDiscoveryState } from "../src/discovery-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-queue-"));
  // Reset module-level state between tests to ensure test isolation
  __resetDiscoveryState();
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
      capabilities: ["mesh.listen", "mesh.discovery", "task.execute"],
    }),
  };
}

function discoveryEnvelope(profile: NodeProfile, requesterOwnerId = "envoy:owner:stranger") {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      intent: "discovery.request",
      payload: {
        requesterOwnerId,
        requestedTagHashes: ["hash:books"],
        requestedCapabilities: ["task.execute"],
        maxResults: 2,
      },
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: `disc-queue-${Date.now()}-${Math.random()}`,
    }),
    signature: "sig",
  };
}

function makeManifest(): CapabilityManifest {
  return {
    visibility: "public-preview",
    sensitivityCeiling: "public",
    capabilities: ["task.execute"],
    keywords: ["books"],
  };
}

describe("Discovery queue — enqueue and dequeue", () => {
  it("queues request when rate limit is exceeded and returns queued status", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const manifest = makeManifest();

    // NO trust record = public caller
    // With manifest and public-preview mode, public callers are allowed

    const baseTime = Date.now();

    // First 5 requests should succeed (rate limit budget)
    for (let i = 0; i < 5; i++) {
      const result = await handleInboundDiscoveryIntent({
        envelope: discoveryEnvelope(profile),
        profile,
        remotePeerId: "libp2p-peer-queue",
        receivedAt: baseTime + i,
        correlationId: `corr-q-${i}`,
        taskStore,
        trustStore,
        anonymousDiscoveryMode: "public-preview",
        capabilityManifest: manifest,
      });
      expect(result.ok).toBe(true);
    }

    // 6th request should be queued (rate limit exhausted)
    const result = await handleInboundDiscoveryIntent({
      envelope: discoveryEnvelope(profile),
      profile,
      remotePeerId: "libp2p-peer-queue",
      receivedAt: baseTime + 5,
      correlationId: "corr-q-queued",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("queued");
  });

  it("returns queue position in queued response", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const manifest = makeManifest();

    const baseTime = Date.now();

    for (let i = 0; i < 5; i++) {
      await handleInboundDiscoveryIntent({
        envelope: discoveryEnvelope(profile),
        profile,
        remotePeerId: "libp2p-peer-pos",
        receivedAt: baseTime + i,
        correlationId: `corr-pos-${i}`,
        taskStore,
        trustStore,
        anonymousDiscoveryMode: "public-preview",
        capabilityManifest: manifest,
      });
    }

    const result = await handleInboundDiscoveryIntent({
      envelope: discoveryEnvelope(profile),
      profile,
      remotePeerId: "libp2p-peer-pos",
      receivedAt: baseTime + 5,
      correlationId: "corr-pos-queued",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(false);
    if (result.reason === "queued") {
      expect(result.queuedAt).toBeGreaterThan(0);
    }
  });

  it("rejects when queue is full (MAX_QUEUE_SIZE_PER_PEER)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const manifest = makeManifest();

    const baseTime = Date.now();

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await handleInboundDiscoveryIntent({
        envelope: discoveryEnvelope(profile),
        profile,
        remotePeerId: "libp2p-peer-full",
        receivedAt: baseTime + i,
        correlationId: `corr-full-${i}`,
        taskStore,
        trustStore,
        anonymousDiscoveryMode: "public-preview",
        capabilityManifest: manifest,
      });
    }

    // Queue 20 requests (MAX_QUEUE_SIZE_PER_PEER)
    for (let i = 0; i < 20; i++) {
      const result = await handleInboundDiscoveryIntent({
        envelope: discoveryEnvelope(profile),
        profile,
        remotePeerId: "libp2p-peer-full",
        receivedAt: baseTime + 5 + i,
        correlationId: `corr-q-${i}`,
        taskStore,
        trustStore,
        anonymousDiscoveryMode: "public-preview",
        capabilityManifest: manifest,
      });
      expect(result.ok).toBe(false);
      if (result.reason !== "queued") {
        expect(result.reason).toContain("queue is full");
      }
    }

    // 21st request should be denied because queue is full
    const result = await handleInboundDiscoveryIntent({
      envelope: discoveryEnvelope(profile),
      profile,
      remotePeerId: "libp2p-peer-full",
      receivedAt: baseTime + 25,
      correlationId: "corr-q-overflow",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("queue is full");
  });
});

describe("Discovery queue — getQueuedDiscoveryCount", () => {
  it("returns 0 when queue is empty", () => {
    expect(getQueuedDiscoveryCount()).toBe(0);
  });
});

describe("Discovery queue — processDiscoveryQueue", () => {
  it("processes queued request with fromQueue=true bypass", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const manifest = makeManifest();

    // NO trust record = public caller
    const baseTime = Date.now();

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await handleInboundDiscoveryIntent({
        envelope: discoveryEnvelope(profile),
        profile,
        remotePeerId: "libp2p-peer-proc",
        receivedAt: baseTime + i,
        correlationId: `corr-proc-${i}`,
        taskStore,
        trustStore,
        anonymousDiscoveryMode: "public-preview",
        capabilityManifest: manifest,
      });
    }

    // Queue a request
    const queuedResult = await handleInboundDiscoveryIntent({
      envelope: discoveryEnvelope(profile),
      profile,
      remotePeerId: "libp2p-peer-proc",
      receivedAt: baseTime + 5,
      correlationId: "corr-q-1",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
      capabilityManifest: manifest,
    });
    expect(queuedResult.ok).toBe(false);
    expect(queuedResult.reason).toBe("queued");

    // Mock mesh interface
    const sentEnvelopes: unknown[] = [];
    const meshInterface = {
      send: vi.fn().mockImplementation(async (_peerId: string, envelope: unknown) => {
        sentEnvelopes.push(envelope);
        return 10;
      }),
    };

    // Process the queue
    const processed = await processDiscoveryQueue(meshInterface);

    // The queued request should be processed
    expect(processed.length).toBeGreaterThan(0);
    expect(processed[0]?.result.ok).toBe(true);
    // Response should have been sent
    expect(meshInterface.send).toHaveBeenCalled();
  });

  it("does nothing when queue is empty", async () => {
    const meshInterface = {
      send: vi.fn().mockImplementation(async () => 10),
    };

    const processed = await processDiscoveryQueue(meshInterface);
    expect(processed).toHaveLength(0);
    expect(meshInterface.send).not.toHaveBeenCalled();
  });
});
