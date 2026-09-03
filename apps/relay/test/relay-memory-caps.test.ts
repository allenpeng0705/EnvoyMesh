import { describe, expect, it } from "vitest";
import { createRelayLookupRouter } from "../src/relay-lookup-router.js";
import { createRelayRoster, MAX_CHECKIN_CAPABILITIES } from "../src/relay-roster.js";

describe("relay lookup negativeCache cap", () => {
  it("bounds negativeCache under unique-key flood", () => {
    const router = createRelayLookupRouter({ negativeCacheTtlMs: 60_000 });
    for (let i = 0; i < 25_000; i++) {
      router.recordNegative(
        {
          queryId: `q-${i}`,
          maxResults: 5,
          maxHops: 1,
          maxFanout: 2,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          targetPeerId: `peer-${i}`,
        },
        `relay-${i % 10}`,
      );
    }
    expect(router.metrics().negativeCacheSize).toBeLessThanOrEqual(20_000);
  });
});

describe("relay roster checkin slice", () => {
  it("caps capabilities and advertisements on checkin", () => {
    const roster = createRelayRoster({ maxRosterEntries: 100 });
    const caps = Array.from({ length: MAX_CHECKIN_CAPABILITIES + 20 }, (_, i) => `cap.${i}`);
    const ads = Array.from({ length: 80 }, (_, i) => ({
      visibility: "public" as const,
      topicHash: `topic-${i}`,
    }));
    const { entry } = roster.checkin({
      peerId: "12D3KooWSlicePeer",
      capabilities: caps,
      advertisements: ads,
      relayReachableAddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWSlicePeer"],
      relayHints: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(entry.capabilities.length).toBe(MAX_CHECKIN_CAPABILITIES);
    expect(entry.advertisements.length).toBeLessThanOrEqual(64);
  });
});
