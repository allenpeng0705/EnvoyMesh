import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMultiHopDiscoveryStore } from "../src/multihop-discovery-store.js";

describe("multihop-discovery-store", () => {
  let profileDir: string;

  afterEach(async () => {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("merges matches by owner id keeping closest hop", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-mh-store-"));
    const store = createMultiHopDiscoveryStore(profileDir);
    await store.upsertSession({
      correlationId: "corr-1",
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      bondsQueried: 2,
      pendingForwardApprovals: 1,
      matches: [
        {
          ownerId: "envoy:owner:a",
          peerId: "peer-a",
          hopDistance: 1,
          matchedCapabilities: ["music"],
          matchedTagHashes: [],
        },
      ],
    });

    const updated = await store.appendMatches("corr-1", [
      {
        ownerId: "envoy:owner:a",
        peerId: "peer-a2",
        hopDistance: 2,
        matchedCapabilities: ["music"],
        matchedTagHashes: [],
      },
      {
        ownerId: "envoy:owner:b",
        peerId: "peer-b",
        hopDistance: 2,
        matchedCapabilities: ["music"],
        matchedTagHashes: [],
        trustPath: "you → bond → envoy:owner:b",
      },
    ]);

    expect(updated?.matches).toHaveLength(2);
    expect(updated?.matches.find((row) => row.ownerId === "envoy:owner:a")?.hopDistance).toBe(1);
    expect(updated?.matches.find((row) => row.ownerId === "envoy:owner:b")?.hopDistance).toBe(2);
  });
});
