/**
 * P0/P1/P3 roster behaviour: targetPeerId visibility under public scope,
 * reservation freshness extension, and hasHopSlot preference ordering.
 */
import { describe, expect, it } from "vitest";
import { createRelayRoster, visibilityFor } from "../src/relay-roster.js";

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

  it("marks hasHopSlot and sorts live reservations first", () => {
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

  it("keeps checkin-fresh peers after reservationFreshUntil lapses (hasHopSlot false)", () => {
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
    expect(result.peers[0]?.hasHopSlot).toBe(false);
    expect(result.peers[0]?.multiaddrs).toEqual([]);
  });
});
