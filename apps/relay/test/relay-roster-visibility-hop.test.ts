/**
 * P0/P1/P3 roster behaviour: targetPeerId visibility under public scope,
 * reservation freshness extension, and hasHopSlot preference ordering.
 */
import { describe, expect, it } from "vitest";
import type { RelayCheckinPayload, RelayLookupPayload } from "@envoymesh/protocol";
import { createRelayRoster, visibilityFor } from "../src/relay-roster.js";

type RelayCheckinAdvertisement = RelayCheckinPayload["advertisements"][number];

const RELAY = "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWFakeRelay";

describe("relay roster — targetPeerId visibility (P0)", () => {
  it("returns peer for public targetPeerId lookup when only mesh.discovery capability is set", () => {
    const now = Date.parse("2026-07-20T10:00:00.000Z");
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 35 * 60_000 });
    roster.checkin({
      peerId: "12D3KooWTarget",
      ownerId: "envoy:owner:target",
      relayReachableAddrs: [],
      capabilities: ["mesh.discovery"],
      // No advertisements[] — the bug case that previously defaulted to bonded.
      advertisements: [],
      relayHints: [],
      expiresAt: "2026-07-20T10:25:00.000Z",
    });

    const hit = roster.lookup({
      requesterPeerId: "12D3KooWSeeker",
      relayPeerId: "12D3KooWFakeRelay",
      relayMultiaddrs: [RELAY],
      payload: {
        queryId: "by-peer",
        targetPeerId: "12D3KooWTarget",
        maxResults: 8,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: "2026-07-20T10:25:00.000Z",
      },
    });

    expect(hit.peers).toHaveLength(1);
    expect(hit.peers[0]?.peerId).toBe("12D3KooWTarget");
    expect(hit.peers[0]?.visibility).toBe("public");
  });

  it("visibilityFor treats exact peer lookup as public when mesh.discovery is present", () => {
    const entry = {
      peerId: "p1",
      capabilities: ["mesh.discovery"],
      advertisements: [] as Array<{ visibility: "public" | "bonded"; capability?: string }>,
      relayReachableAddrs: [],
      firstSeenAt: 0,
      lastSeenAt: 0,
      expiresAt: 1,
      reservationFreshUntil: 1,
      relayHints: [],
    };
    expect(
      visibilityFor(entry, {
        queryId: "q",
        targetPeerId: "p1",
        maxResults: 1,
        maxHops: 0,
        maxFanout: 1,
        visibilityScope: "public",
        expiresAt: new Date().toISOString(),
      }),
    ).toBe("public");
  });
});

describe("relay roster — reservation hop slot (P1/P3)", () => {
  it("extends reservationFreshUntil from live reservation expire", () => {
    const now = Date.parse("2026-07-20T10:00:00.000Z");
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 35 * 60_000 });
    const reservationExpireAtMs = now + 30 * 60_000;
    const { entry } = roster.checkin(
      {
        peerId: "12D3KooWHop",
        relayReachableAddrs: [],
        capabilities: ["mesh.discovery"],
        advertisements: [{ capability: "mesh.discovery", visibility: "public" }],
        relayHints: [],
        expiresAt: "2026-07-20T10:05:00.000Z", // short checkin TTL
      },
      undefined,
      { reservationExpireAtMs },
    );
    expect(entry.reservationFreshUntil).toBe(reservationExpireAtMs);
  });

  it("includes checkin-only peers but ranks live-hop first", () => {
    const now = Date.parse("2026-07-20T10:00:00.000Z");
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 35 * 60_000 });
    for (const peerId of ["peer-stale", "peer-live"]) {
      roster.checkin({
        peerId,
        relayReachableAddrs: [],
        capabilities: ["mesh.discovery"],
        advertisements: [{ capability: "mesh.discovery", visibility: "public" }],
        relayHints: [],
        expiresAt: "2026-07-20T10:25:00.000Z",
      });
    }

    const live = new Set(["peer-live"]);
    const result = roster.lookup({
      requesterPeerId: "seeker",
      relayPeerId: "12D3KooWFakeRelay",
      relayMultiaddrs: [RELAY],
      hasLiveReservation: (id) => live.has(id),
      payload: {
        queryId: "cap",
        capability: "mesh.discovery",
        maxResults: 10,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: "2026-07-20T10:25:00.000Z",
      },
    });

    expect(result.peers.map((p) => p.peerId)).toEqual(["peer-live", "peer-stale"]);
    expect(result.peers[0]?.hasHopSlot).toBe(true);
    expect(result.peers[0]?.multiaddrs.length).toBeGreaterThan(0);
    expect(result.peers[1]?.hasHopSlot).toBe(false);
    expect(result.peers[1]?.multiaddrs).toEqual([]);
  });

  it("returns checkin peers after reservationFreshUntil lapses (hasHopSlot false)", () => {
    let now = Date.parse("2026-07-20T10:00:00.000Z");
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 35 * 60_000 });
    roster.checkin(
      {
        peerId: "peer-a",
        relayReachableAddrs: [],
        capabilities: ["mesh.discovery"],
        advertisements: [{ capability: "mesh.discovery", visibility: "public" }],
        relayHints: [],
        expiresAt: "2026-07-20T10:25:00.000Z",
      },
      undefined,
      { reservationExpireAtMs: now + 60_000 },
    );

    now = Date.parse("2026-07-20T10:02:00.000Z"); // past reservationFreshUntil, still within expiresAt
    const result = roster.lookup({
      requesterPeerId: "seeker",
      relayPeerId: "12D3KooWFakeRelay",
      relayMultiaddrs: [RELAY],
      payload: {
        queryId: "still-here",
        capability: "mesh.discovery",
        maxResults: 10,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: "2026-07-20T10:25:00.000Z",
      },
    });
    expect(result.peers).toHaveLength(1);
    expect(result.peers[0]?.peerId).toBe("peer-a");
    expect(result.peers[0]?.hasHopSlot).toBe(false);
    expect(result.peers[0]?.multiaddrs).toEqual([]);
  });

  it("topicHash lookup includes checkin-only peers with empty multiaddrs", () => {
    const now = Date.parse("2026-07-20T10:00:00.000Z");
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 35 * 60_000 });
    const topicHash = "bafkreiaddp4djc6xvvfnmjaw7zeogkl2loi2q6cmve3aceo2374tcjxiwm";
    roster.checkin({
      peerId: "peer-food",
      displayName: "Emily",
      relayReachableAddrs: [],
      capabilities: ["mesh.discovery"],
      advertisements: [{ topicHash, visibility: "public" }],
      relayHints: [],
      expiresAt: "2026-07-20T10:25:00.000Z",
    });

    const result = roster.lookup({
      requesterPeerId: "seeker",
      relayPeerId: "12D3KooWFakeRelay",
      relayMultiaddrs: [RELAY],
      hasLiveReservation: () => false,
      payload: {
        queryId: "food",
        topicHash,
        maxResults: 10,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: "2026-07-20T10:25:00.000Z",
      },
    });

    expect(result.peers).toHaveLength(1);
    expect(result.peers[0]?.peerId).toBe("peer-food");
    expect(result.peers[0]?.displayName).toBe("Emily");
    expect(result.peers[0]?.hasHopSlot).toBe(false);
    expect(result.peers[0]?.multiaddrs).toEqual([]);
  });
});

describe("relay roster — broaden-listing privacy gate", () => {
  const now = Date.parse("2026-07-20T10:00:00.000Z");
  const topicHash = "bafkreiaddp4djc6xvvfnmjaw7zeogkl2loi2q6cmve3aceo2374tcjxiwm";

  function rosterWith(ads: RelayCheckinAdvertisement[]) {
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 35 * 60_000 });
    roster.checkin({
      peerId: "peer-quiet",
      ownerId: "envoy:owner:quiet",
      displayName: "Quiet",
      relayReachableAddrs: [],
      capabilities: ["mesh.discovery"],
      advertisements: ads,
      relayHints: [],
      expiresAt: "2026-07-20T10:25:00.000Z",
    });
    return roster;
  }

  function broadLookup(
    roster: ReturnType<typeof createRelayRoster>,
    payload: Partial<RelayLookupPayload> & { queryId: string },
  ) {
    return roster.lookup({
      requesterPeerId: "seeker",
      relayPeerId: "12D3KooWFakeRelay",
      relayMultiaddrs: [RELAY],
      hasLiveReservation: () => false,
      payload: {
        maxResults: 10,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: "2026-07-20T10:25:00.000Z",
        ...payload,
      },
    });
  }

  it("excludes a checkin-only peer that only carries the capability token", () => {
    const result = broadLookup(rosterWith([]), {
      queryId: "broad",
      capability: "mesh.discovery",
    });
    expect(result.peers).toHaveLength(0);
  });

  it("excludes a checkin-only peer whose advertisement is capability-scoped (non-public profile)", () => {
    const result = broadLookup(
      rosterWith([{ capability: "mesh.discovery", visibility: "capability" }]),
      { queryId: "broad", capability: "mesh.discovery" },
    );
    expect(result.peers).toHaveLength(0);
  });

  it("still resolves such a peer by exact peerId (people who know the ID)", () => {
    const result = broadLookup(rosterWith([]), {
      queryId: "by-id",
      targetPeerId: "peer-quiet",
      capability: "mesh.discovery",
    });
    expect(result.peers.map((p) => p.peerId)).toEqual(["peer-quiet"]);
  });

  it("still lists it by explicit topicHash advertisement", () => {
    const result = broadLookup(rosterWith([{ topicHash, visibility: "public" }]), {
      queryId: "by-topic",
      topicHash,
    });
    expect(result.peers.map((p) => p.peerId)).toEqual(["peer-quiet"]);
  });
});
