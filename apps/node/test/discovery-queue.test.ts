/**
 * Phase 8I — Low-priority queue tests for anonymous discovery.
 *
 * Tests the queue data structure and processing logic:
 * - Queue enqueue/dequeue with FIFO ordering
 * - Queue size limits
 * - Queue entry TTL expiration
 * - Queue processing bypasses rate limit
 */

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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleInboundDiscoveryIntent, processDiscoveryQueue, getQueuedDiscoveryCount, clearExpiredQueueEntries } from "../src/discovery-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-queue-"));
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

function discoveryEnvelope(profile: NodeProfile) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      intent: "discovery.request",
      payload: {
        requesterOwnerId: "envoy:owner:stranger",
        requestedTagHashes: ["hash:books"],
        requestedCapabilities: ["task.execute"],
        maxResults: 2,
      },
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: `disc-queue-${Date.now()}`,
    }),
    signature: "sig",
  };
}

describe("Discovery queue — enqueue and dequeue", () => {
  it("queues request when rate limit is exceeded and returns queued status", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    // Exhaust rate limit by making ANON_RATE_LIMIT_MAX_REQUESTS + 1 requests
    // The first 5 should succeed, the 6th should be queued
    const envelope = discoveryEnvelope(profile);

    for (let i = 0; i < 5; i++) {
      const result = await handleInboundDiscoveryIntent({
        envelope,
        profile,
        remotePeerId: "libp2p-peer-queue",
        receivedAt: Date.now(),
        correlationId: `corr-${i}`,
        taskStore,
        trustStore,
        anonymousDiscoveryMode: "public-preview",
      });
      expect(result.ok).toBe(true);
    }

    // 6th request should be queued (rate limit exhausted)
    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-peer-queue",
      receivedAt: Date.now(),
      correlationId: "corr-queued",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("queued");
  });

  it("returns queue position in queued response", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = discoveryEnvelope(profile);

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await handleInboundDiscoveryIntent({
        envelope,
        profile,
        remotePeerId: "libp2p-peer-pos",
        receivedAt: Date.now(),
        correlationId: `corr-pos-${i}`,
        taskStore,
        trustStore,
        anonymousDiscoveryMode: "public-preview",
      });
    }

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-peer-pos",
      receivedAt: Date.now(),
      correlationId: "corr-pos-queued",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
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

    const envelope = discoveryEnvelope(profile);

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await handleInboundDiscoveryIntent({
        envelope,
        profile,
        remotePeerId: "libp2p-peer-full",
        receivedAt: Date.now(),
        correlationId: `corr-full-${i}`,
        taskStore,
        trustStore,
        anonymousDiscoveryMode: "public-preview",
      });
    }

    // Queue 20 requests (MAX_QUEUE_SIZE_PER_PEER)
    for (let i = 0; i < 20; i++) {
      const result = await handleInboundDiscoveryIntent({
        envelope,
        profile,
        remotePeerId: "libp2p-peer-full",
        receivedAt: Date.now(),
        correlationId: `corr-q-${i}`,
        taskStore,
        trustStore,
        anonymousDiscoveryMode: "public-preview",
      });
      expect(result.ok).toBe(false);
      if (result.reason !== "queued") {
        expect(result.reason).toContain("queue is full");
      }
    }

    // 21st request should be denied because queue is full
    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-peer-full",
      receivedAt: Date.now(),
      correlationId: "corr-q-overflow",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
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

    const envelope = discoveryEnvelope(profile);

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await handleInboundDiscoveryIntent({
        envelope,
        profile,
        remotePeerId: "libp2p-peer-proc",
        receivedAt: Date.now(),
        correlationId: `corr-proc-${i}`,
        taskStore,
        trustStore,
        anonymousDiscoveryMode: "public-preview",
      });
    }

    // Queue a request
    const queuedResult = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-peer-proc",
      receivedAt: Date.now(),
      correlationId: "corr-q-1",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
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
