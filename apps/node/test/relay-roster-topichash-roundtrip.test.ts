/**
 * Integration test for Option C (relay-roster topicHash fallback).
 *
 * Verifies the full cross-NAT discovery round-trip at the relay roster level:
 *   1. Terminal node A checks in with a topicHash advertisement for "music"
 *      (this is what `_advertiseInterestsIfPublic` → `setRelayClientAdvertisedTopics`
 *      → `runRelayCheckinCycle` produces on the wire).
 *   2. Tauri node B queries `relay.lookup` by the same topicHash (this is what
 *      `NodeDiscoveryRuntime.searchByTopic` does when DHT returns 0 providers).
 *   3. The roster returns A with a /p2p-circuit/ address that B can dial.
 *
 * This is the closest we can get to a live probe without rebuilding the
 * Tauri bundle and pointing two real nodes at each other.
 */
import { describe, expect, it } from "vitest";
import { cidForCapabilityTopic } from "@envoymesh/network";
import { createRelayRoster } from "../src/relay-roster.js";

const RELAY_ID = "12D3KooWFakeRelayForTest";
const RELAY_MULTIADDR = "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWFakeRelayForTest";
const TERMINAL_PEER_ID = "12D3KooWTerminalNode";
const TERMINAL_OWNER_ID = "envoy:owner:terminalnode_abc";
const TAURI_PEER_ID = "12D3KooWTauriApp";

describe("relay-roster topicHash round-trip (Option C end-to-end)", () => {
  it("indexes checkin topicHash advertisements and resolves them via lookup", async () => {
    const now = Date.parse("2026-07-06T04:00:00.000Z");
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 120_000 });

    // ── Step 1: terminal node check-in with topicHash for "music" ────────────
    const musicHash = (await cidForCapabilityTopic("music")).toString();
    roster.checkin({
      peerId: TERMINAL_PEER_ID,
      ownerId: TERMINAL_OWNER_ID,
      relayReachableAddrs: [],
      capabilities: ["mesh.discovery"],
      advertisements: [
        { capability: "mesh.discovery", visibility: "public", expiresAt: "2026-07-06T04:02:00.000Z" },
        // ← This is the Option C payload: a topicHash entry that the relay
        //   roster indexes so other nodes can find us by interest.
        { topicHash: musicHash, visibility: "public", expiresAt: "2026-07-06T04:02:00.000Z" },
      ],
      relayHints: [],
      expiresAt: "2026-07-06T04:02:00.000Z",
    });

    // ── Step 2: Tauri node looks up the same topicHash ───────────────────────
    const lookupResult = roster.lookup({
      requesterPeerId: TAURI_PEER_ID,
      relayPeerId: RELAY_ID,
      relayMultiaddrs: [RELAY_MULTIADDR],
      payload: {
        queryId: "tauri-search-music",
        topicHash: musicHash,
        maxResults: 32,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: "2026-07-06T04:02:00.000Z",
      },
    });

    // ── Step 3: terminal node is returned with a /p2p-circuit/ dial path ────
    expect(lookupResult.peers).toHaveLength(1);
    const hit = lookupResult.peers[0]!;
    expect(hit.peerId).toBe(TERMINAL_PEER_ID);
    // Public-visibility lookups deliberately omit ownerId (privacy by design
    // — the relay roster only leaks ownerId for bonded/capability scopes).
    expect(hit.ownerId).toBeUndefined();
    expect(hit.capabilities).toContain("mesh.discovery");
    // Circuit address: relayMultiaddr + /p2p-circuit/ + peerId
    expect(hit.multiaddrs).toEqual([`${RELAY_MULTIADDR}/p2p-circuit/p2p/${TERMINAL_PEER_ID}`]);
    expect(hit.visibility).toBe("public");
  });

  it("does NOT return a peer that advertised a different topic", async () => {
    const now = Date.parse("2026-07-06T04:00:00.000Z");
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 120_000 });

    const musicHash = (await cidForCapabilityTopic("music")).toString();
    const techHash = (await cidForCapabilityTopic("tech")).toString();

    // Terminal A advertises "music" only.
    roster.checkin({
      peerId: TERMINAL_PEER_ID,
      ownerId: TERMINAL_OWNER_ID,
      relayReachableAddrs: [],
      capabilities: ["mesh.discovery"],
      advertisements: [
        { topicHash: musicHash, visibility: "public", expiresAt: "2026-07-06T04:02:00.000Z" },
      ],
      relayHints: [],
      expiresAt: "2026-07-06T04:02:00.000Z",
    });

    // Searching for "tech" should return nothing.
    const techLookup = roster.lookup({
      requesterPeerId: TAURI_PEER_ID,
      relayPeerId: RELAY_ID,
      relayMultiaddrs: [RELAY_MULTIADDR],
      payload: {
        queryId: "tauri-search-tech",
        topicHash: techHash,
        maxResults: 32,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: "2026-07-06T04:02:00.000Z",
      },
    });
    expect(techLookup.peers).toHaveLength(0);

    // Searching for "music" should still find A.
    const musicLookup = roster.lookup({
      requesterPeerId: TAURI_PEER_ID,
      relayPeerId: RELAY_ID,
      relayMultiaddrs: [RELAY_MULTIADDR],
      payload: {
        queryId: "tauri-search-music",
        topicHash: musicHash,
        maxResults: 32,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: "2026-07-06T04:02:00.000Z",
      },
    });
    expect(musicLookup.peers).toHaveLength(1);
    expect(musicLookup.peers[0]!.peerId).toBe(TERMINAL_PEER_ID);
  });

  it("respects visibility scope on topicHash advertisements", async () => {
    const now = Date.parse("2026-07-06T04:00:00.000Z");
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 120_000 });

    const musicHash = (await cidForCapabilityTopic("music")).toString();

    // Terminal advertised "music" but as bonded-only (private to existing contacts).
    roster.checkin({
      peerId: TERMINAL_PEER_ID,
      ownerId: TERMINAL_OWNER_ID,
      relayReachableAddrs: [],
      capabilities: ["mesh.discovery"],
      advertisements: [
        { topicHash: musicHash, visibility: "bonded", expiresAt: "2026-07-06T04:02:00.000Z" },
      ],
      relayHints: [],
      expiresAt: "2026-07-06T04:02:00.000Z",
    });

    // Public lookup should not see the bonded advertisement.
    const publicLookup = roster.lookup({
      requesterPeerId: TAURI_PEER_ID,
      relayPeerId: RELAY_ID,
      relayMultiaddrs: [RELAY_MULTIADDR],
      payload: {
        queryId: "q-public",
        topicHash: musicHash,
        maxResults: 32,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: "2026-07-06T04:02:00.000Z",
      },
    });
    expect(publicLookup.peers).toHaveLength(0);

    // Bonded lookup should see it.
    const bondedLookup = roster.lookup({
      requesterPeerId: TAURI_PEER_ID,
      relayPeerId: RELAY_ID,
      relayMultiaddrs: [RELAY_MULTIADDR],
      payload: {
        queryId: "q-bonded",
        topicHash: musicHash,
        maxResults: 32,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "bonded",
        expiresAt: "2026-07-06T04:02:00.000Z",
      },
    });
    expect(bondedLookup.peers).toHaveLength(1);
    expect(bondedLookup.peers[0]!.peerId).toBe(TERMINAL_PEER_ID);
  });

  it("expires topicHash advertisements after the roster TTL", async () => {
    let now = Date.parse("2026-07-06T04:00:00.000Z");
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 60_000 });

    const musicHash = (await cidForCapabilityTopic("music")).toString();
    roster.checkin({
      peerId: TERMINAL_PEER_ID,
      ownerId: TERMINAL_OWNER_ID,
      relayReachableAddrs: [],
      capabilities: ["mesh.discovery"],
      advertisements: [
        { topicHash: musicHash, visibility: "public", expiresAt: "2026-07-06T04:02:00.000Z" },
      ],
      relayHints: [],
      expiresAt: "2026-07-06T04:02:00.000Z",
    });

    const lookup = (q: string) =>
      roster.lookup({
        requesterPeerId: TAURI_PEER_ID,
        relayPeerId: RELAY_ID,
        relayMultiaddrs: [RELAY_MULTIADDR],
        payload: {
          queryId: q,
          topicHash: musicHash,
          maxResults: 32,
          maxHops: 0,
          maxFanout: 2,
          visibilityScope: "public",
          expiresAt: "2026-07-06T04:02:00.000Z",
        },
      });

    expect(lookup("q-fresh").peers).toHaveLength(1);

    // Advance past roster TTL.
    now = Date.parse("2026-07-06T04:03:00.000Z");
    expect(lookup("q-expired").peers).toHaveLength(0);
  });
});
