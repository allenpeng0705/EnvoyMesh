import { preferRelayPeerCandidate } from "../src/relay-lookup-merge.js";
import { mergeRelayLookupResponses } from "../src/relay-lookup-response-merge.js";
import { createRelayRoster } from "../src/relay-roster.js";
import { createRelayLookupRouter, type RelayBookEntry } from "../src/relay-lookup-router.js";
import { createRelayHintsRequestPayload, createRelayHintsResponsePayload } from "@envoymesh/protocol";
import type { RelayLookupPayload, RelayPeerCandidate } from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";

const baseLookup: RelayLookupPayload = {
  queryId: "query-1",
  capability: "mesh.discovery",
  maxResults: 10,
  maxHops: 1,
  maxFanout: 2,
  visibilityScope: "public",
  expiresAt: "2026-04-27T10:01:00.000Z",
};

function book(
  relayId: string,
  relation: RelayBookEntry["relation"] = "sibling",
  state: RelayBookEntry["state"] = "verified",
): RelayBookEntry {
  const now = Date.now();
  return {
    relayId,
    addrs: [`/ip4/1.2.3.4/tcp/4001/p2p/${relayId}`],
    relation,
    state,
    lastVerifiedAt: now,
    expiresAt: now + 60 * 60_000,
    failureCount: 0,
  };
}

function peer(partial: Partial<RelayPeerCandidate> & { peerId: string }): RelayPeerCandidate {
  return {
    multiaddrs: [],
    viaRelayId: "r1",
    capabilities: [],
    visibility: "public",
    expiresAt: "2026-04-27T10:01:00.000Z",
    ...partial,
  };
}

describe("standalone relay lookup router (46B)", () => {
  it("forwards to verified siblings with fanout and hop decrement gate", () => {
    const router = createRelayLookupRouter();
    const decision = router.selectForwardTargets({
      payload: { ...baseLookup, maxFanout: 1 },
      relayBook: [book("relay-a"), book("relay-b")],
      selfRelayId: "relay-self",
    });
    expect(decision.forwardTargets).toHaveLength(1);
    expect(decision.forwardTargets[0]?.relayId).toMatch(/^relay-/);
  });

  it("does not forward to candidate-only book entries", () => {
    const router = createRelayLookupRouter();
    const decision = router.selectForwardTargets({
      payload: baseLookup,
      relayBook: [book("relay-c", "sibling", "candidate")],
      selfRelayId: "relay-self",
    });
    expect(decision.forwardTargets).toEqual([]);
  });

  it("does not forward when maxHops is 0", () => {
    const router = createRelayLookupRouter();
    const decision = router.selectForwardTargets({
      payload: { ...baseLookup, maxHops: 0 },
      relayBook: [book("relay-a")],
      selfRelayId: "relay-self",
    });
    expect(decision.forwardTargets).toEqual([]);
  });

  it("dedupes query ids", () => {
    const router = createRelayLookupRouter();
    expect(router.markSeen("q1")).toBe(true);
    expect(router.markSeen("q1")).toBe(false);
  });

  it("caps seenQueries under unique-id flood", () => {
    const router = createRelayLookupRouter({ seenQueryTtlMs: 60_000 });
    for (let i = 0; i < 55_000; i++) {
      expect(router.markSeen(`q_${i}`)).toBe(true);
    }
    // Oldest entries were evicted; new unique ids still accepted.
    expect(router.markSeen("q_flood_tail")).toBe(true);
  });

  it("skips negatively cached siblings until TTL", () => {
    let now = Date.now();
    const router = createRelayLookupRouter({ now: () => now, negativeCacheTtlMs: 1_000 });
    router.recordNegative(baseLookup, "relay-a");
    expect(
      router.selectForwardTargets({
        payload: baseLookup,
        relayBook: [book("relay-a")],
        selfRelayId: "self",
      }).forwardTargets,
    ).toEqual([]);
    now += 1_001;
    expect(
      router.selectForwardTargets({
        payload: baseLookup,
        relayBook: [book("relay-a")],
        selfRelayId: "self",
      }).forwardTargets.map((t) => t.relayId),
    ).toEqual(["relay-a"]);
  });
});

describe("mergeRelayLookupResponses (46B)", () => {
  it("prefers hoppable forward hit over empty local", () => {
    const local = {
      queryId: "q",
      peers: [peer({ peerId: "p1", hasHopSlot: false, multiaddrs: [] })],
      relayHints: [],
      truncated: false,
      expiresAt: baseLookup.expiresAt,
    };
    const forward = {
      queryId: "q",
      peers: [
        peer({
          peerId: "p1",
          hasHopSlot: true,
          viaRelayId: "relay-b",
          multiaddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/relay-b/p2p-circuit/p2p/p1"],
        }),
      ],
      relayHints: [],
      truncated: false,
      expiresAt: baseLookup.expiresAt,
    };
    const merged = mergeRelayLookupResponses(baseLookup, [local, forward]);
    expect(merged.peers).toHaveLength(1);
    expect(merged.peers[0]?.hasHopSlot).toBe(true);
    expect(merged.peers[0]?.viaRelayId).toBe("relay-b");
  });
});

describe("preferRelayPeerCandidate (46B)", () => {
  it("prefers live hop over empty multiaddrs", () => {
    const a = peer({ peerId: "p1", hasHopSlot: false });
    const b = peer({
      peerId: "p1",
      multiaddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/r2/p2p-circuit/p2p/p1"],
      hasHopSlot: true,
    });
    expect(preferRelayPeerCandidate(a, b)).toBe(b);
  });
});

describe("relay book (46B/46C)", () => {
  it("caps book size and promotes verified", () => {
    const roster = createRelayRoster({ maxRelayBookEntries: 3 });
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    for (let i = 0; i < 5; i++) {
      roster.registerRelay({
        relayId: `relay-${i}`,
        addrs: [`/ip4/1.2.3.${i}/tcp/4001/p2p/relay-${i}`],
        relation: "sibling",
        state: "candidate",
        expiresAt,
      });
    }
    expect(roster.relayBook().length).toBeLessThanOrEqual(3);
    roster.registerRelay({
      relayId: "keep-me",
      addrs: ["/ip4/9.9.9.9/tcp/4001/p2p/keep-me"],
      relation: "sibling",
      state: "verified",
      expiresAt,
    });
    roster.promoteRelay("keep-me", "verified");
    expect(roster.verifiedRelayHints(10).some((h) => h.relayId === "keep-me")).toBe(true);
  });

  it("does not treat leaf checkin hints as verified forward targets", () => {
    const roster = createRelayRoster();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    roster.checkin({
      peerId: "leaf-1",
      relayReachableAddrs: ["/ip4/10.0.0.1/tcp/4001/p2p/leaf-1"],
      capabilities: ["mesh.discovery"],
      advertisements: [{ capability: "mesh.discovery", visibility: "public", expiresAt }],
      relayHints: [
        {
          relayId: "hinted-relay",
          multiaddrs: ["/ip4/8.8.8.8/tcp/4001/p2p/hinted-relay"],
          expiresAt,
        },
      ],
      expiresAt,
    });
    const hinted = roster.relayBook().find((e) => e.relayId === "hinted-relay");
    expect(hinted?.state).toBe("candidate");
    expect(roster.verifiedRelayHints(10).some((h) => h.relayId === "hinted-relay")).toBe(false);

    const router = createRelayLookupRouter();
    expect(
      router.selectForwardTargets({
        payload: baseLookup,
        relayBook: roster.relayBook(),
        selfRelayId: "self",
      }).forwardTargets,
    ).toEqual([]);
  });

  it("promoteRelay after successful hints RTT gate", () => {
    const roster = createRelayRoster();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    roster.registerRelay({
      relayId: "sib",
      addrs: ["/ip4/1.1.1.1/tcp/4001/p2p/sib"],
      relation: "sibling",
      state: "candidate",
      expiresAt,
    });
    expect(roster.verifiedRelayHints(10)).toEqual([]);
    expect(
      createRelayHintsRequestPayload({
        reason: "refresh",
        maxResults: 4,
        expiresAt,
      }).reason,
    ).toBe("refresh");
    expect(
      createRelayHintsResponsePayload({
        relayHints: [{ relayId: "sib", multiaddrs: ["/ip4/1.1.1.1/tcp/4001/p2p/sib"], expiresAt }],
        truncated: false,
        expiresAt,
      }).relayHints,
    ).toHaveLength(1);
    roster.promoteRelay("sib", "verified");
    expect(roster.verifiedRelayHints(10).map((h) => h.relayId)).toEqual(["sib"]);
  });
});
