import type { RelayLookupPayload } from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";
import { createRelayLookupRouter } from "../src/relay-lookup-router.js";
import { createRelayRoster, type RelayBookEntry } from "../src/relay-roster.js";

const baseLookup: RelayLookupPayload = {
  queryId: "query-1",
  capability: "mesh.discovery",
  maxResults: 10,
  maxHops: 2,
  maxFanout: 2,
  visibilityScope: "public",
  expiresAt: "2026-04-27T10:01:00.000Z",
};

describe("relay lookup router", () => {
  it("selects summary-matching relays first and enforces fanout", () => {
    const now = Date.parse("2026-04-27T10:00:00.000Z");
    const router = createRelayLookupRouter({ now: () => now });
    const decision = router.selectForwardTargets({
      payload: { ...baseLookup, maxFanout: 1 },
      relayBook: [
        relay("relay-sibling", "sibling"),
        relay("relay-parent", "parent"),
        relay("relay-match", "candidate"),
      ],
      summaries: [
        {
          relayId: "relay-match",
          lastSeenAt: now,
          expiresAt: now + 60_000,
          summary: {
            relayId: "relay-match",
            level: 2,
            livePeerCount: 5,
            childRelayCount: 0,
            topicBuckets: ["capability:mesh.discovery"],
            expiresAt: "2026-04-27T10:01:00.000Z",
          },
        },
      ],
      selfRelayId: "relay-self",
    });

    expect(decision.forwardTargets.map((target) => target.relayId)).toEqual(["relay-match"]);
  });

  it("does not forward when hops are exhausted", () => {
    const router = createRelayLookupRouter();
    const decision = router.selectForwardTargets({
      payload: { ...baseLookup, maxHops: 0 },
      relayBook: [relay("relay-parent", "parent")],
      summaries: [],
    });

    expect(decision.forwardTargets).toEqual([]);
  });

  it("suppresses duplicate query ids until the seen ttl expires", () => {
    let now = Date.parse("2026-04-27T10:00:00.000Z");
    const router = createRelayLookupRouter({ now: () => now, seenQueryTtlMs: 1_000 });

    expect(router.markSeen("query-1")).toBe(true);
    expect(router.markSeen("query-1")).toBe(false);
    now += 1_001;
    expect(router.markSeen("query-1")).toBe(true);
  });

  it("skips negatively cached relay misses until cache expiry", () => {
    let now = Date.parse("2026-04-27T10:00:00.000Z");
    const router = createRelayLookupRouter({ now: () => now, negativeCacheTtlMs: 1_000 });
    router.recordNegative(baseLookup, "relay-parent");

    expect(
      router.selectForwardTargets({
        payload: baseLookup,
        relayBook: [relay("relay-parent", "parent")],
        summaries: [],
      }).forwardTargets,
    ).toEqual([]);

    now += 1_001;
    expect(
      router.selectForwardTargets({
        payload: baseLookup,
        relayBook: [relay("relay-parent", "parent")],
        summaries: [],
      }).forwardTargets.map((target) => target.relayId),
    ).toEqual(["relay-parent"]);
  });

  it("tracks routing metrics for duplicate drops, selection, negatives, forwards, failures, and responses", () => {
    const now = Date.parse("2026-04-27T10:00:00.000Z");
    const router = createRelayLookupRouter({ now: () => now });

    expect(router.markSeen("query-1")).toBe(true);
    expect(router.markSeen("query-1")).toBe(false);
    expect(
      router.selectForwardTargets({
        payload: { ...baseLookup, maxFanout: 2 },
        relayBook: [relay("relay-parent", "parent"), relay("relay-sibling", "sibling")],
        summaries: [],
      }).forwardTargets.map((target) => target.relayId),
    ).toEqual(["relay-sibling", "relay-parent"]);

    router.recordNegative(baseLookup, "relay-parent");
    router.recordForwardedLookup(2);
    router.recordFailedForward();
    router.recordCollectedForwardResponse(1);

    expect(router.metrics()).toMatchObject({
      duplicateQueryDropCount: 1,
      selectedForwardTargetCount: 2,
      negativeCacheSize: 1,
      forwardedLookupCount: 2,
      failedForwardCount: 1,
      collectedForwardResponseCount: 1,
    });
  });

  it("routes an in-memory RelayA to RelayRoot to RelayB lookup", () => {
    const now = Date.parse("2026-04-27T10:00:00.000Z");
    const relayA = createRelayRoster({ now: () => now });
    const relayRoot = createRelayRoster({ now: () => now });
    const relayB = createRelayRoster({ now: () => now });
    const routerA = createRelayLookupRouter({ now: () => now });
    const routerRoot = createRelayLookupRouter({ now: () => now });

    relayA.registerRelay({
      relayId: "relay-root",
      relation: "parent",
      state: "verified",
      addrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-root"],
      expiresAt: "2026-04-27T10:05:00.000Z",
    });
    relayA.registerSummary(summary("relay-root", ["capability:mesh.discovery"]));
    relayRoot.registerRelay({
      relayId: "relay-b",
      relation: "child",
      state: "verified",
      addrs: ["/ip4/127.0.0.1/tcp/4002/p2p/relay-b"],
      expiresAt: "2026-04-27T10:05:00.000Z",
    });
    relayRoot.registerSummary(summary("relay-b", ["capability:mesh.discovery"]));
    relayB.checkin({
      peerId: "peer-b",
      relayReachableAddrs: [],
      capabilities: ["mesh.discovery"],
      advertisements: [{ capability: "mesh.discovery", visibility: "public" }],
      relayHints: [],
      expiresAt: "2026-04-27T10:01:00.000Z",
    });

    expect(
      routerA.selectForwardTargets({
        payload: baseLookup,
        relayBook: relayA.relayBook(),
        summaries: relayA.summaries(),
        selfRelayId: "relay-a",
      }).forwardTargets.map((target) => target.relayId),
    ).toEqual(["relay-root"]);
    expect(
      routerRoot.selectForwardTargets({
        payload: { ...baseLookup, maxHops: 1 },
        relayBook: relayRoot.relayBook(),
        summaries: relayRoot.summaries(),
        selfRelayId: "relay-root",
      }).forwardTargets.map((target) => target.relayId),
    ).toEqual(["relay-b"]);
    expect(
      relayB.lookup({
        payload: { ...baseLookup, maxHops: 0 },
        requesterPeerId: "peer-a",
        relayMultiaddrs: ["/ip4/127.0.0.1/tcp/4002/p2p/relay-b"],
        relayPeerId: "relay-b",
      }).peers.map((peer) => peer.peerId),
    ).toEqual(["peer-b"]);
  });
});

function relay(relayId: string, relation: RelayBookEntry["relation"]): RelayBookEntry {
  return {
    relayId,
    relation,
    state: "verified",
    addrs: [`/ip4/127.0.0.1/tcp/4001/p2p/${relayId}`],
    lastVerifiedAt: Date.parse("2026-04-27T10:00:00.000Z"),
    expiresAt: Date.parse("2026-04-27T10:05:00.000Z"),
    failureCount: 0,
  };
}

function summary(relayId: string, topicBuckets: string[]) {
  return {
    relayId,
    level: 2,
    livePeerCount: 1,
    childRelayCount: 0,
    topicBuckets,
    expiresAt: "2026-04-27T10:01:00.000Z",
  };
}
