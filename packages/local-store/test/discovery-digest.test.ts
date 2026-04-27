import {
  buildMorningReportDigest,
  createDiscoveryEvent,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "../src/index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-digest-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("discovery digest", () => {
  it("ranks direct trusted peers higher", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerStore = createLocalPeerDirectoryStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:alice", level: "direct" });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:bob", level: "public" });

    await peerStore.upsertPeerFromSignal({
      peerId: "peer-a",
      seenAt: new Date().toISOString(),
      payload: {
        ownerId: "envoy:owner:alice",
        ownerPublicKeyPem: "owner-key",
        deviceId: "envoy:device:a",
        deviceCertificate: {
          version: "0.1",
          certificateId: "cert-1",
          ownerId: "envoy:owner:alice",
          deviceId: "envoy:device:a",
          devicePublicKeyPem: "device-key-a",
          deviceProfile: "primary",
          capabilities: ["mesh.discovery"],
          issuedAt: "2026-01-01T00:00:00.000Z",
          expiresAt: null,
          signature: "sig",
        },
        deviceProfile: "primary",
        capabilities: ["mesh.discovery"],
        supportedProtocolVersions: ["emp/0.1"],
        listenAddrs: [],
        publicTopics: [],
        status: "online",
      },
    });

    await taskStore.appendDiscoveryEvent(
      createDiscoveryEvent({
        direction: "inbound",
        intent: "discovery.response",
        ownerId: "envoy:owner:alice",
        matchCount: 3,
        outcome: "record",
        summary: "alice matches",
      }),
    );
    await taskStore.appendDiscoveryEvent(
      createDiscoveryEvent({
        direction: "inbound",
        intent: "discovery.response",
        ownerId: "envoy:owner:bob",
        matchCount: 3,
        outcome: "record",
        summary: "bob matches",
      }),
    );

    const digest = buildMorningReportDigest({
      trustRecords: await trustStore.listTrustRecords(),
      peerDirectoryRecords: await peerStore.listPeerRecords(),
      discoveryEvents: await taskStore.readDiscoveryEvents(),
      limit: 5,
    });

    expect(digest[0]?.ownerId).toBe("envoy:owner:alice");
    expect(digest[0]?.score).toBeGreaterThan(digest[1]?.score ?? 0);
  });
});
