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
  it("excludes bonded contacts and keeps unknown discovery matches", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerStore = createLocalPeerDirectoryStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:alice", level: "direct" });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:bob", level: "public" });

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
    await taskStore.appendDiscoveryEvent(
      createDiscoveryEvent({
        direction: "inbound",
        intent: "discovery.response",
        ownerId: "envoy:owner:carol",
        matchCount: 2,
        outcome: "record",
        summary: "carol matches",
      }),
    );

    const digest = buildMorningReportDigest({
      trustRecords: await trustStore.listTrustRecords(),
      peerDirectoryRecords: await peerStore.listPeerRecords(),
      discoveryEvents: await taskStore.readDiscoveryEvents(),
      limit: 5,
    });

    expect(digest).toHaveLength(1);
    expect(digest[0]?.ownerId).toBe("envoy:owner:carol");
    expect(digest[0]?.trustLevel).toBe("unknown");
    expect(digest[0]?.discoveryMatchCount).toBe(2);
  });
});
