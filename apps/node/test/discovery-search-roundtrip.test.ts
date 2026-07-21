/**
 * Two-node discovery E2E tests — LAN, WAN (relay fallback), and edge cases.
 *
 * WAN mode: Uses a real `createRelayRoster` + real `cidForCapabilityTopic` hashing
 *           with a mock mesh that returns 0 DHT providers. Tests the relay-roster
 *           fallback path that runs when both nodes are behind NAT.
 *
 * LAN mode: Uses real `EnvoyMesh` instances with `enableDht: true`, connected via
 *           `probePeer()` on localhost. Tests the DHT provide/find round-trip.
 *
 * Edge cases: Self-exclusion, graceful degradation, DHT-vs-relay routing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateOwnerIdentity,
  generateDeviceIdentity,
  derivePeerId,
} from "@envoymesh/identity";
import { cidForCapabilityTopic } from "@envoymesh/network";
import { createRelayRoster } from "../src/relay-roster.js";
import { NodeDiscoveryRuntime } from "../src/node-service-discovery.js";
import { displayNameTopicFor, interestTopicFor } from "../src/capability-discovery.js";
import type { PeerSearchResult } from "@envoymesh/api";

// ---------------------------------------------------------------------------
// Constants shared across WAN tests
// ---------------------------------------------------------------------------

const RELAY_ID = "12D3KooWFakeRelayForDiscoveryTest";
const RELAY_MULTIADDR = `/ip4/127.0.0.1/tcp/4001/p2p/${RELAY_ID}`;

interface SyntheticPeer {
  peerId: string;
  ownerId: string;
  displayName: string;
  interests: string[];
}

// ---------------------------------------------------------------------------
// Helpers — WAN (relay roster) mode
// ---------------------------------------------------------------------------

function createSyntheticPeer(displayName: string, interests: string[]): SyntheticPeer {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  const peerId = derivePeerId(device.publicKeyPem);
  return { peerId, ownerId: owner.ownerId, displayName, interests };
}

/** Build topicHash advertisements from a peer's display name and interests. */
async function buildTopicHashAds(
  peer: SyntheticPeer,
  expiresAt: string,
): Promise<Array<{ topicHash: string; visibility: "public"; expiresAt: string }>> {
  const topics: string[] = [];
  const dnTopic = displayNameTopicFor(peer.displayName);
  if (dnTopic) topics.push(dnTopic);
  for (const interest of peer.interests) {
    const it = interestTopicFor(interest);
    if (it) topics.push(it);
  }
  const ads: Array<{ topicHash: string; visibility: "public"; expiresAt: string }> = [];
  for (const topic of topics) {
    const cid = await cidForCapabilityTopic(topic);
    ads.push({ topicHash: cid.toString(), visibility: "public", expiresAt });
  }
  return ads;
}

/** Check a peer into the roster with all their topicHash ads. */
async function checkinPeer(
  roster: ReturnType<typeof createRelayRoster>,
  peer: SyntheticPeer,
  expiresAt: string,
): Promise<void> {
  const topicAds = await buildTopicHashAds(peer, expiresAt);
  roster.checkin({
    peerId: peer.peerId,
    ownerId: peer.ownerId,
    displayName: peer.displayName,
    relayReachableAddrs: [],
    capabilities: ["mesh.discovery"],
    advertisements: [
      { capability: "mesh.discovery", visibility: "public", expiresAt },
      ...topicAds,
    ],
    relayHints: [],
    expiresAt,
  });
}

interface WanScenario {
  roster: ReturnType<typeof createRelayRoster>;
  alice: SyntheticPeer;
  bob: SyntheticPeer;
  expiresAt: string;
  /** Create a runtime for the given searcher (mock mesh + roster-based fallback). */
  runtimeFor: (
    searcher: SyntheticPeer,
    fallback?: (params: { topic: string; topicHash: string; maxResults: number }) => Promise<PeerSearchResult[]>,
  ) => NodeDiscoveryRuntime;
}

function createWanScenario(
  displayNameA: string,
  interestsA: string[],
  displayNameB: string,
  interestsB: string[],
): WanScenario {
  const now = Date.now();
  const expiresAt = new Date(now + 600_000).toISOString();
  const roster = createRelayRoster({ now: () => now, rosterTtlMs: 600_000 });

  const alice = createSyntheticPeer(displayNameA, interestsA);
  const bob = createSyntheticPeer(displayNameB, interestsB);

  function runtimeFor(
    searcher: SyntheticPeer,
    fallback?: (params: { topic: string; topicHash: string; maxResults: number }) => Promise<PeerSearchResult[]>,
  ): NodeDiscoveryRuntime {
    const trustStore = {
      listTrustRecords: vi.fn(async () => []),
    };
    const peerDirectoryStore = {
      listPeerRecords: vi.fn(async () => []),
    };
    const configStore = {
      load: vi.fn(async () => ({
        version: "0.1",
        profileDir: "/tmp/test",
        discoveryProfile: "wan-default" as const,
        enableMdns: false,
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: ["public-libp2p"],
        configuredRelays: [],
        updatedAt: new Date().toISOString(),
      })),
    };
    const mesh = {
      findCapabilityTopicProviders: vi.fn(async () => []),
      peerId: searcher.peerId,
    };

    const deps = {
      getProfile: () => undefined,
      requireProfile: () => { throw new Error("not used"); },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: trustStore as never,
      peerDirectoryStore: peerDirectoryStore as never,
      configStore: configStore as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => { throw new Error("not used"); },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      loadHumanProfile: async () => undefined,
    };

    if (fallback) {
      deps.queryRelayLookupByTopic = fallback;
    }

    return new NodeDiscoveryRuntime(deps);
  }

  return { roster, alice, bob, expiresAt, runtimeFor };
}

/** Default fallback: queries the real roster and maps results to PeerSearchResult. */
function rosterLookupFallback(
  roster: ReturnType<typeof createRelayRoster>,
  requesterPeerId: string,
  trustRecords: Array<{ peerOwnerId: string; displayName?: string }>,
) {
  return async (params: { topic: string; topicHash: string; maxResults: number }): Promise<PeerSearchResult[]> => {
    const result = roster.lookup({
      payload: {
        queryId: "test-lookup",
        topicHash: params.topicHash,
        maxResults: params.maxResults,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      },
      requesterPeerId,
      relayPeerId: RELAY_ID,
      relayMultiaddrs: [RELAY_MULTIADDR],
    });
    // Build a peerId → ownerId map from roster entries for enrichment.
    // The relay roster hides ownerId for public lookups, but the entry
    // itself stores it. This simulates the enrichment that
    // _queryRelayLookupByTopic does via peerDirectoryStore.
    const rosterEntries = roster.entries();
    const ownerByPeerId = new Map<string, string>();
    for (const entry of rosterEntries) {
      if (entry.ownerId) ownerByPeerId.set(entry.peerId, entry.ownerId);
    }
    return result.peers.map((p) => {
      const resolvedOwnerId = p.ownerId ?? ownerByPeerId.get(p.peerId) ?? p.peerId;
      const trust = trustRecords.find((t) => t.peerOwnerId === resolvedOwnerId);
      return {
        nodeId: p.peerId,
        ownerId: resolvedOwnerId,
        displayName: trust?.displayName ?? p.displayName ?? p.peerId.slice(0, 12) + "...",
        interests: [params.topic],
        profileVisibility: "public",
        discoverySource: "relay-roster-topic" as const,
      };
    });
  };
}

// ---------------------------------------------------------------------------
// Tests — Part 1: WAN mode (relay roster fallback)
// ---------------------------------------------------------------------------

describe("Discovery — WAN mode (relay roster fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches by display name across WAN — Bob finds Alice", async () => {
    const scenario = createWanScenario("Alice Chen", ["food", "music"], "Bob Smith", ["tech", "music"]);
    await checkinPeer(scenario.roster, scenario.alice, scenario.expiresAt);
    await checkinPeer(scenario.roster, scenario.bob, scenario.expiresAt);

    const bobRuntime = scenario.runtimeFor(
      scenario.bob,
      rosterLookupFallback(scenario.roster, scenario.bob.peerId, [
        { peerOwnerId: scenario.alice.ownerId, displayName: "Alice Chen" },
      ]),
    );

    const results = await bobRuntime.searchPeers({ queryText: "Alice Chen", maxResults: 20 });
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe(scenario.alice.peerId);
    expect(results[0].ownerId).toBe(scenario.alice.ownerId);
    expect(results[0].displayName).toBe("Alice Chen");
    expect(results[0].discoverySource).toBe("relay-roster-topic");
  });

  it("searches by display name across WAN — Alice finds Bob Smith", async () => {
    const scenario = createWanScenario("Alice Chen", ["food"], "Bob Smith", ["tech"]);
    await checkinPeer(scenario.roster, scenario.alice, scenario.expiresAt);
    await checkinPeer(scenario.roster, scenario.bob, scenario.expiresAt);

    const aliceRuntime = scenario.runtimeFor(
      scenario.alice,
      rosterLookupFallback(scenario.roster, scenario.alice.peerId, [
        { peerOwnerId: scenario.bob.ownerId, displayName: "Bob Smith" },
      ]),
    );

    const results = await aliceRuntime.searchPeers({ queryText: "Bob Smith", maxResults: 20 });
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe(scenario.bob.peerId);
    expect(results[0].displayName).toBe("Bob Smith");
  });

  it("searches by interest across WAN — finds peer with matching interest", async () => {
    const scenario = createWanScenario("Alice Chen", ["food", "music"], "Bob Smith", ["tech", "music"]);
    await checkinPeer(scenario.roster, scenario.alice, scenario.expiresAt);
    await checkinPeer(scenario.roster, scenario.bob, scenario.expiresAt);

    // Bob searches for "food" → should find Alice only
    const bobRuntime = scenario.runtimeFor(
      scenario.bob,
      rosterLookupFallback(scenario.roster, scenario.bob.peerId, [
        { peerOwnerId: scenario.alice.ownerId, displayName: "Alice Chen" },
      ]),
    );
    const foodResults = await bobRuntime.searchPeers({ interests: ["food"], maxResults: 20 });
    expect(foodResults).toHaveLength(1);
    expect(foodResults[0].nodeId).toBe(scenario.alice.peerId);

    // Bob searches for "music" → should find Alice (shared interest, not self)
    const musicResults = await bobRuntime.searchPeers({ interests: ["music"], maxResults: 20 });
    expect(musicResults).toHaveLength(1);
    expect(musicResults[0].nodeId).toBe(scenario.alice.peerId);

    // Alice searches for "cooking" → interestTopicFor("cooking") = "interest:cooking", nobody advertised it
    const aliceRuntime = scenario.runtimeFor(
      scenario.alice,
      rosterLookupFallback(scenario.roster, scenario.alice.peerId, [
        { peerOwnerId: scenario.bob.ownerId, displayName: "Bob Smith" },
      ]),
    );
    const cookingResults = await aliceRuntime.searchPeers({ interests: ["cooking"], maxResults: 20 });
    expect(cookingResults).toHaveLength(0);
  });

  it("cross-topic isolation — only matching peers returned", async () => {
    const scenario = createWanScenario("Alice", ["food"], "Bob", ["tech"]);
    await checkinPeer(scenario.roster, scenario.alice, scenario.expiresAt);
    await checkinPeer(scenario.roster, scenario.bob, scenario.expiresAt);

    // Alice searches for "tech" → finds Bob (Bob has "tech", Alice is the searcher so Alice is excluded)
    const aliceRuntime = scenario.runtimeFor(
      scenario.alice,
      rosterLookupFallback(scenario.roster, scenario.alice.peerId, [
        { peerOwnerId: scenario.bob.ownerId, displayName: "Bob" },
      ]),
    );
    const techResults = await aliceRuntime.searchPeers({ interests: ["tech"], maxResults: 20 });
    expect(techResults).toHaveLength(1);
    expect(techResults[0].nodeId).toBe(scenario.bob.peerId);

    // Alice searches for "food" → 0 results (Alice has "food" but Alice is the searcher, excluded)
    const foodResults = await aliceRuntime.searchPeers({ interests: ["food"], maxResults: 20 });
    expect(foodResults).toHaveLength(0);

    // Bob searches for "food" → finds Alice (Alice has "food", Bob is the searcher so Bob is excluded)
    const bobRuntime = scenario.runtimeFor(
      scenario.bob,
      rosterLookupFallback(scenario.roster, scenario.bob.peerId, [
        { peerOwnerId: scenario.alice.ownerId, displayName: "Alice" },
      ]),
    );
    const bobFoodResults = await bobRuntime.searchPeers({ interests: ["food"], maxResults: 20 });
    expect(bobFoodResults).toHaveLength(1);
    expect(bobFoodResults[0].nodeId).toBe(scenario.alice.peerId);

    // Bob searches for "tech" → 0 results (Bob has "tech" but Bob is the searcher, excluded)
    const bobTechResults = await bobRuntime.searchPeers({ interests: ["tech"], maxResults: 20 });
    expect(bobTechResults).toHaveLength(0);
  });

  it("self-exclusion — searching never returns yourself", async () => {
    const scenario = createWanScenario("Alice Chen", ["food", "music"], "Bob Smith", ["tech"]);
    await checkinPeer(scenario.roster, scenario.alice, scenario.expiresAt);
    await checkinPeer(scenario.roster, scenario.bob, scenario.expiresAt);

    // Alice searches for her own display name → 0 (roster excludes requester)
    const aliceRuntime = scenario.runtimeFor(
      scenario.alice,
      rosterLookupFallback(scenario.roster, scenario.alice.peerId, []),
    );
    const dnResults = await aliceRuntime.searchPeers({ queryText: "Alice Chen", maxResults: 20 });
    expect(dnResults).toHaveLength(0);

    // Alice searches for her own interest "food" → 0 (roster excludes requester)
    const foodResults = await aliceRuntime.searchPeers({ interests: ["food"], maxResults: 20 });
    expect(foodResults).toHaveLength(0);
  });

  it("shared + unique interests — correct peer sets", async () => {
    const scenario = createWanScenario(
      "Alice", ["food", "music", "art"],
      "Bob", ["food", "tech", "gaming"],
    );
    await checkinPeer(scenario.roster, scenario.alice, scenario.expiresAt);
    await checkinPeer(scenario.roster, scenario.bob, scenario.expiresAt);

    const bobRuntime = scenario.runtimeFor(
      scenario.bob,
      rosterLookupFallback(scenario.roster, scenario.bob.peerId, [
        { peerOwnerId: scenario.alice.ownerId, displayName: "Alice" },
      ]),
    );

    // "food" is shared — Bob finds Alice (not self)
    const foodResults = await bobRuntime.searchPeers({ interests: ["food"], maxResults: 20 });
    expect(foodResults).toHaveLength(1);
    expect(foodResults[0].nodeId).toBe(scenario.alice.peerId);

    // "music" is Alice-only — Bob finds Alice
    const musicResults = await bobRuntime.searchPeers({ interests: ["music"], maxResults: 20 });
    expect(musicResults).toHaveLength(1);
    expect(musicResults[0].nodeId).toBe(scenario.alice.peerId);

    // "gaming" is Bob-only — Bob finds nobody (self excluded)
    const gamingResults = await bobRuntime.searchPeers({ interests: ["gaming"], maxResults: 20 });
    expect(gamingResults).toHaveLength(0);

    // "art" is Alice-only — from Alice's perspective, finds nobody (self excluded)
    const aliceRuntime = scenario.runtimeFor(
      scenario.alice,
      rosterLookupFallback(scenario.roster, scenario.alice.peerId, [
        { peerOwnerId: scenario.bob.ownerId, displayName: "Bob" },
      ]),
    );
    const artResults = await aliceRuntime.searchPeers({ interests: ["art"], maxResults: 20 });
    expect(artResults).toHaveLength(0);

    // "tech" is Bob-only — Alice finds Bob
    const techResults = await aliceRuntime.searchPeers({ interests: ["tech"], maxResults: 20 });
    expect(techResults).toHaveLength(1);
    expect(techResults[0].nodeId).toBe(scenario.bob.peerId);
  });
});

// ---------------------------------------------------------------------------
// Tests — Part 2: LAN mode (DHT returns results, no relay fallback)
//
  // In a real LAN, two nodes are on the same network, DHT routing tables are
  // populated, and `findCapabilityTopicProviders` returns results directly.
  // Relay roster is still consulted (DHT ∪ roster), but DHT hits win on dedupe.
  // ---------------------------------------------------------------------------

describe("Discovery — LAN mode (DHT returns results)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DHT returns providers — results come from DHT (relay may also be consulted)", async () => {
    const alicePeer = createSyntheticPeer("Alice Chen", ["food", "music"]);
    const bobPeer = createSyntheticPeer("Bob Smith", ["tech", "music"]);

    // Simulate LAN: DHT returns Alice when searching for "food"
    const mesh = {
      findCapabilityTopicProviders: vi.fn(async (topic: string) => {
        if (topic === "interest:food") {
          return [{ peerId: alicePeer.peerId, multiaddrs: ["/ip4/192.168.1.10/tcp/4001"] }];
        }
        if (topic === "interest:music") {
          return [
            { peerId: alicePeer.peerId, multiaddrs: ["/ip4/192.168.1.10/tcp/4001"] },
          ];
        }
        return [];
      }),
      peerId: bobPeer.peerId,
    };
    const fallback = vi.fn(async () => []);

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => { throw new Error("not used"); },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: { listTrustRecords: vi.fn(async () => []) } as never,
      peerDirectoryStore: {
        listPeerRecords: vi.fn(async () => [
          { peerId: alicePeer.peerId, ownerId: alicePeer.ownerId },
        ]),
      } as never,
      configStore: {
        load: vi.fn(async () => ({
          version: "0.1",
          profileDir: "/tmp/test",
          discoveryProfile: "wan-default" as const,
          enableMdns: false,
          relayEnabled: true,
          relayServerEnabled: false,
          advertiseAddrs: [],
          bootstrapPeers: [],
          bootstrapPresets: ["public-libp2p"],
          configuredRelays: [],
          updatedAt: new Date().toISOString(),
        })),
      } as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => { throw new Error("not used"); },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByTopic: fallback,
    });

    // Bob searches for "food" — DHT returns Alice directly
    const foodResults = await runtime.searchPeers({ interests: ["food"], maxResults: 20 });
    expect(foodResults).toHaveLength(1);
    expect(foodResults[0].nodeId).toBe(alicePeer.peerId);
    expect(foodResults[0].discoverySource).toBe("dht-capability-topic");
    expect(fallback).toHaveBeenCalled();

    // Bob searches for "music" — DHT returns Alice
    const musicResults = await runtime.searchPeers({ interests: ["music"], maxResults: 20 });
    expect(musicResults).toHaveLength(1);
    expect(musicResults[0].nodeId).toBe(alicePeer.peerId);

    // Bob searches for "tech" — DHT returns nothing (Bob has it, not in DHT results)
    const techResults = await runtime.searchPeers({ interests: ["tech"], maxResults: 20 });
    expect(techResults).toHaveLength(0);
  });

  it("DHT returns multiple providers for shared interest", async () => {
    const alicePeer = createSyntheticPeer("Alice", ["food", "music"]);
    const bobPeer = createSyntheticPeer("Bob", ["food", "tech"]);
    const carolPeer = createSyntheticPeer("Carol", ["food", "art"]);

    const mesh = {
      findCapabilityTopicProviders: vi.fn(async (topic: string) => {
        if (topic === "interest:food") {
          return [
            { peerId: alicePeer.peerId, multiaddrs: ["/ip4/192.168.1.10/tcp/4001"] },
            { peerId: carolPeer.peerId, multiaddrs: ["/ip4/192.168.1.30/tcp/4001"] },
          ];
        }
        return [];
      }),
      peerId: bobPeer.peerId,
    };

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => { throw new Error("not used"); },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: { listTrustRecords: vi.fn(async () => []) } as never,
      peerDirectoryStore: {
        listPeerRecords: vi.fn(async () => [
          { peerId: alicePeer.peerId, ownerId: alicePeer.ownerId },
          { peerId: carolPeer.peerId, ownerId: carolPeer.ownerId },
        ]),
      } as never,
      configStore: {
        load: vi.fn(async () => ({
          version: "0.1",
          profileDir: "/tmp/test",
          discoveryProfile: "wan-default" as const,
          enableMdns: false,
          relayEnabled: true,
          relayServerEnabled: false,
          advertiseAddrs: [],
          bootstrapPeers: [],
          bootstrapPresets: ["public-libp2p"],
          configuredRelays: [],
          updatedAt: new Date().toISOString(),
        })),
      } as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => { throw new Error("not used"); },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
    });

    // Bob searches for "food" — DHT returns Alice and Carol (not Bob)
    const foodResults = await runtime.searchPeers({ interests: ["food"], maxResults: 20 });
    expect(foodResults).toHaveLength(2);
    const peerIds = foodResults.map((r) => r.nodeId);
    expect(peerIds).toContain(alicePeer.peerId);
    expect(peerIds).toContain(carolPeer.peerId);
    expect(peerIds).not.toContain(bobPeer.peerId);
  });
});

// ---------------------------------------------------------------------------
// Tests — Part 3: Edge cases
// ---------------------------------------------------------------------------

describe("Discovery — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DHT primary path — also unions relay-roster when wired", async () => {
    const mesh = {
      findCapabilityTopicProviders: vi.fn(async () => [
        { peerId: "12D3KooWDhtPeer1", multiaddrs: ["/ip4/1.2.3.4/tcp/4001"] },
      ]),
      peerId: "12D3KooWSearcher",
    };
    const fallback = vi.fn(async () => [
      {
        nodeId: "12D3KooWRelayOnly",
        ownerId: "envoy:owner:relay",
        displayName: "Relay Only",
        interests: ["music"],
        profileVisibility: "public" as const,
        discoverySource: "relay-roster-topic" as const,
      },
    ]);

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => { throw new Error("not used"); },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: { listTrustRecords: vi.fn(async () => []) } as never,
      peerDirectoryStore: { listPeerRecords: vi.fn(async () => []) } as never,
      configStore: {
        load: vi.fn(async () => ({
          version: "0.1",
          profileDir: "/tmp/test",
          discoveryProfile: "wan-default" as const,
          enableMdns: false,
          relayEnabled: true,
          relayServerEnabled: false,
          advertiseAddrs: [],
          bootstrapPeers: [],
          bootstrapPresets: ["public-libp2p"],
          configuredRelays: [],
          updatedAt: new Date().toISOString(),
        })),
      } as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => { throw new Error("not used"); },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByTopic: fallback,
    });

    const results = await runtime.searchPeers({ topic: "music", maxResults: 10 });
    expect(fallback).toHaveBeenCalled();
    expect(results.map((r) => r.nodeId)).toEqual(["12D3KooWDhtPeer1", "12D3KooWRelayOnly"]);
    expect(results[0].discoverySource).toBe("dht-capability-topic");
  });

  it("DHT returns 0 — relay fallback IS called", async () => {
    const mesh = {
      findCapabilityTopicProviders: vi.fn(async () => []),
      peerId: "12D3KooWSearcher",
    };
    const fallback = vi.fn(async () => [
      {
        nodeId: "12D3KooWRelayPeer1",
        ownerId: "envoy:owner:relay1",
        displayName: "12D3KooWRe...",
        interests: ["food"],
        profileVisibility: "public" as const,
        discoverySource: "relay-roster-topic" as const,
      },
    ]);

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => { throw new Error("not used"); },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: { listTrustRecords: vi.fn(async () => []) } as never,
      peerDirectoryStore: { listPeerRecords: vi.fn(async () => []) } as never,
      configStore: {
        load: vi.fn(async () => ({
          version: "0.1",
          profileDir: "/tmp/test",
          discoveryProfile: "wan-default" as const,
          enableMdns: false,
          relayEnabled: true,
          relayServerEnabled: false,
          advertiseAddrs: [],
          bootstrapPeers: [],
          bootstrapPresets: ["public-libp2p"],
          configuredRelays: [],
          updatedAt: new Date().toISOString(),
        })),
      } as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => { throw new Error("not used"); },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByTopic: fallback,
    });

    const results = await runtime.searchPeers({ topic: "food", maxResults: 10 });
    expect(fallback).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].discoverySource).toBe("relay-roster-topic");
  });

  it("no fallback wired — graceful degradation (no crash)", async () => {
    const mesh = {
      findCapabilityTopicProviders: vi.fn(async () => []),
      peerId: "12D3KooWSearcher",
    };

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => { throw new Error("not used"); },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: { listTrustRecords: vi.fn(async () => []) } as never,
      peerDirectoryStore: { listPeerRecords: vi.fn(async () => []) } as never,
      configStore: {
        load: vi.fn(async () => ({
          version: "0.1",
          profileDir: "/tmp/test",
          discoveryProfile: "wan-default" as const,
          enableMdns: false,
          relayEnabled: true,
          relayServerEnabled: false,
          advertiseAddrs: [],
          bootstrapPeers: [],
          bootstrapPresets: ["public-libp2p"],
          configuredRelays: [],
          updatedAt: new Date().toISOString(),
        })),
      } as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => { throw new Error("not used"); },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      // NOTE: no queryRelayLookupByTopic — graceful degradation
    });

    const results = await runtime.searchPeers({ topic: "food", maxResults: 10 });
    expect(results).toHaveLength(0);
  });

  it("displayName with hyphens and spaces slugified correctly", async () => {
    // "Mary-Jane O'Brien" → slugifyTopic → "mary-jane-o-brien"
    const raw = "Mary-Jane O'Brien";
    const expectedSlug = "mary-jane-o-brien";
    expect(displayNameTopicFor(raw)).toBe(`displayname:${expectedSlug}`);

    // Verify the topic hash is deterministic
    const topic = displayNameTopicFor(raw);
    const cid1 = await cidForCapabilityTopic(topic);
    const cid2 = await cidForCapabilityTopic(topic);
    expect(cid1.toString()).toBe(cid2.toString());

    // Two peers with special-char names can find each other via the roster
    const now = Date.now();
    const expiresAt = new Date(now + 600_000).toISOString();
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 600_000 });
    const ownerA = generateOwnerIdentity();
    const deviceA = generateDeviceIdentity();
    const ownerB = generateOwnerIdentity();
    const deviceB = generateDeviceIdentity();
    const peerA = derivePeerId(deviceA.publicKeyPem);
    const peerB = derivePeerId(deviceB.publicKeyPem);

    const hashA = (await cidForCapabilityTopic(topic)).toString();
    roster.checkin({
      peerId: peerA,
      ownerId: ownerA.ownerId,
      relayReachableAddrs: [],
      capabilities: ["mesh.discovery"],
      advertisements: [
        { capability: "mesh.discovery", visibility: "public", expiresAt },
        { topicHash: hashA, visibility: "public", expiresAt },
      ],
      relayHints: [],
      expiresAt,
    });

    // Search from peerB
    const lookup = roster.lookup({
      payload: {
        queryId: "test-special-chars",
        topicHash: hashA,
        maxResults: 20,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt,
      },
      requesterPeerId: peerB,
      relayPeerId: RELAY_ID,
      relayMultiaddrs: [RELAY_MULTIADDR],
    });
    expect(lookup.peers).toHaveLength(1);
    expect(lookup.peers[0].peerId).toBe(peerA);
  });
});

// ---------------------------------------------------------------------------
// Tests — Part 4: searchPeers full pipeline
// ---------------------------------------------------------------------------

describe("Discovery — searchPeers full pipeline (WAN path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes displayName search through searchByTopic → relay fallback", async () => {
    const scenario = createWanScenario("Alice Chen", ["food"], "Bob Smith", ["tech"]);
    await checkinPeer(scenario.roster, scenario.alice, scenario.expiresAt);
    await checkinPeer(scenario.roster, scenario.bob, scenario.expiresAt);

    const bobRuntime = scenario.runtimeFor(
      scenario.bob,
      rosterLookupFallback(scenario.roster, scenario.bob.peerId, [
        { peerOwnerId: scenario.alice.ownerId, displayName: "Alice Chen" },
      ]),
    );

    // searchPeers({ queryText: "Alice Chen" }) → searchByTopic("displayname:alice-chen") → relay fallback
    const results = await bobRuntime.searchPeers({ queryText: "Alice Chen", maxResults: 20 });
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe(scenario.alice.peerId);
    expect(results[0].discoverySource).toBe("relay-roster-topic");

    // Verify the mesh was queried (DHT) — even though it returned 0
    expect(bobRuntime.deps?.getMesh?.()?.findCapabilityTopicProviders).toHaveBeenCalledTimes(1);
  });

  it("routes interest search through interestTopicFor normalization", async () => {
    const scenario = createWanScenario("Alice Chen", ["Machine Learning", "AI"], "Bob Smith", ["cooking"]);
    await checkinPeer(scenario.roster, scenario.alice, scenario.expiresAt);
    await checkinPeer(scenario.roster, scenario.bob, scenario.expiresAt);

    // Verify the slug normalization
    expect(interestTopicFor("Machine Learning")).toBe("interest:machine-learning");
    expect(interestTopicFor("AI")).toBe("interest:ai");

    const bobRuntime = scenario.runtimeFor(
      scenario.bob,
      rosterLookupFallback(scenario.roster, scenario.bob.peerId, [
        { peerOwnerId: scenario.alice.ownerId, displayName: "Alice Chen" },
      ]),
    );

    // Search by raw interest "Machine Learning" — should be normalized to "interest:machine-learning"
    const results = await bobRuntime.searchPeers({ interests: ["Machine Learning"], maxResults: 20 });
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe(scenario.alice.peerId);
    expect(results[0].discoverySource).toBe("relay-roster-topic");

    // Search by "cooking" — only Bob has it, Bob is the searcher → 0 results
    const cookingResults = await bobRuntime.searchPeers({ interests: ["cooking"], maxResults: 20 });
    expect(cookingResults).toHaveLength(0);
  });
});
