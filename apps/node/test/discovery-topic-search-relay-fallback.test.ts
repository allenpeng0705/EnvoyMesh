import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NodeDiscoveryRuntime,
  mergeDhtAndRelayTopicResults,
  withTimeoutFallback,
} from "../src/node-service-discovery.js";
import type { PeerSearchResult } from "@envoymesh/api";
import type { RelayLookupResponsePayload } from "@envoymesh/protocol";

function makeStubRelayLookupResponses(): RelayLookupResponsePayload[] {
  return [
    {
      queryId: "q1",
      peers: [
        {
          peerId: "12D3KooWRelayLookupPeer1",
          ownerId: "envoy:owner:lookup1",
          multiaddrs: ["/ip4/95.217.77.95/tcp/4001/p2p/12D3KooWRelayLookupPeer1/p2p-circuit"],
          viaRelayId: "12D3KooWRelayHost",
          capabilities: ["mesh.discovery"],
          visibility: "public",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
      relayHints: [],
      truncated: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  ];
}

function makeMeshStub(overrides?: { providers?: unknown[]; throwDht?: boolean }) {
  return {
    findCapabilityTopicProviders: vi.fn(async () => {
      if (overrides?.throwDht) throw new Error("dht unreachable");
      return overrides?.providers ?? [];
    }),
  };
}

function makeTrustStore(trustRecords: Array<{ peerOwnerId: string; level: string; displayName?: string }>) {
  return {
    listTrustRecords: vi.fn(async () => trustRecords),
  };
}

function makePeerDirectoryStore(records: Array<{ peerId: string; ownerId: string }>) {
  return {
    listPeerRecords: vi.fn(async () => records),
  };
}

function makeConfigStore() {
  return {
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
}

describe("NodeDiscoveryRuntime — relay-roster topic search fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unions DHT providers with relay-roster hits", async () => {
    const mesh = makeMeshStub({
      providers: [
        {
          peerId: "12D3KooWDhtPeer1",
          multiaddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWDhtPeer1"],
        },
      ],
    });
    const trustStore = makeTrustStore([]);
    const peerDirectoryStore = makePeerDirectoryStore([
      { peerId: "12D3KooWDhtPeer1", ownerId: "envoy:owner:dht1" },
    ]);
    const configStore = makeConfigStore();
    const fallback = vi.fn(async () => [
      {
        nodeId: "12D3KooWRelayLookupPeer1",
        ownerId: "envoy:owner:lookup1",
        displayName: "Relay Hit",
        interests: ["music"],
        profileVisibility: "public" as const,
        discoverySource: "relay-roster-topic" as const,
      },
    ]);

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("not used");
      },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: trustStore as never,
      peerDirectoryStore: peerDirectoryStore as never,
      configStore: configStore as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => {
        throw new Error("not used");
      },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByTopic: fallback,
    });

    const results = await runtime.searchPeers({ topic: "music", maxResults: 10 });
    expect(fallback).toHaveBeenCalled();
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.nodeId)).toEqual([
      "12D3KooWDhtPeer1",
      "12D3KooWRelayLookupPeer1",
    ]);
    expect(results[0].discoverySource).toBe("dht-capability-topic");
    expect(results[1].discoverySource).toBe("relay-roster-topic");
  });

  it("dedupes peers that appear in both DHT and relay roster", async () => {
    const mesh = makeMeshStub({
      providers: [
        {
          peerId: "12D3KooWSharedPeer",
          multiaddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWSharedPeer"],
        },
      ],
    });
    const trustStore = makeTrustStore([]);
    const peerDirectoryStore = makePeerDirectoryStore([]);
    const configStore = makeConfigStore();
    const fallback = vi.fn(async () => [
      {
        nodeId: "12D3KooWSharedPeer",
        ownerId: "envoy:owner:shared",
        displayName: "Shared",
        interests: ["music"],
        profileVisibility: "public" as const,
        discoverySource: "relay-roster-topic" as const,
      },
    ]);

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("not used");
      },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: trustStore as never,
      peerDirectoryStore: peerDirectoryStore as never,
      configStore: configStore as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => {
        throw new Error("not used");
      },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByTopic: fallback,
    });

    const results = await runtime.searchPeers({ topic: "music", maxResults: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].discoverySource).toBe("dht-capability-topic");
  });

  it("falls back to relay-roster lookup when DHT returns 0", async () => {
    const mesh = makeMeshStub({ providers: [] });
    const trustStore = makeTrustStore([]);
    const peerDirectoryStore = makePeerDirectoryStore([]);
    const configStore = makeConfigStore();
    const fallback = vi.fn(async () => {
      return [
        {
          nodeId: "12D3KooWRelayLookupPeer1",
          ownerId: "envoy:owner:lookup1",
          displayName: "12D3KooWRel...",
          interests: ["music"],
          profileVisibility: "public" as const,
          discoverySource: "relay-roster-topic" as const,
        },
      ];
    });

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("not used");
      },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: trustStore as never,
      peerDirectoryStore: peerDirectoryStore as never,
      configStore: configStore as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => {
        throw new Error("not used");
      },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByTopic: fallback,
    });

    const results = await runtime.searchPeers({ topic: "music", maxResults: 10 });
    expect(fallback).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe("12D3KooWRelayLookupPeer1");
    expect(results[0].discoverySource).toBe("relay-roster-topic");
  });

  it("does NOT fall back when no fallback is wired (graceful degradation)", async () => {
    const mesh = makeMeshStub({ providers: [] });
    const trustStore = makeTrustStore([]);
    const peerDirectoryStore = makePeerDirectoryStore([]);
    const configStore = makeConfigStore();

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("not used");
      },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: trustStore as never,
      peerDirectoryStore: peerDirectoryStore as never,
      configStore: configStore as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => {
        throw new Error("not used");
      },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
    });

    const results = await runtime.searchPeers({ topic: "music", maxResults: 10 });
    expect(results).toHaveLength(0);
  });

  it("returns 0 results when both DHT and fallback fail", async () => {
    const mesh = makeMeshStub({ providers: [] });
    const trustStore = makeTrustStore([]);
    const peerDirectoryStore = makePeerDirectoryStore([]);
    const configStore = makeConfigStore();
    const fallback = vi.fn(async () => {
      throw new Error("relay lookup failed");
    });

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("not used");
      },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: trustStore as never,
      peerDirectoryStore: peerDirectoryStore as never,
      configStore: configStore as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => {
        throw new Error("not used");
      },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByTopic: fallback,
    });

    const results = await runtime.searchPeers({ topic: "music", maxResults: 10 });
    expect(fallback).toHaveBeenCalled();
    expect(results).toHaveLength(0);
  });

  it("interest-based search falls back when DHT returns 0", async () => {
    const mesh = makeMeshStub({ providers: [] });
    const trustStore = makeTrustStore([]);
    const peerDirectoryStore = makePeerDirectoryStore([]);
    const configStore = makeConfigStore();
    const fallback = vi.fn(async () => {
      return [
        {
          nodeId: "12D3KooWInterestHit",
          ownerId: "envoy:owner:ih1",
          displayName: "12D3KooWIn...",
          interests: ["music"],
          profileVisibility: "public" as const,
          discoverySource: "relay-roster-topic" as const,
        },
      ];
    });

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("not used");
      },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: trustStore as never,
      peerDirectoryStore: peerDirectoryStore as never,
      configStore: configStore as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => {
        throw new Error("not used");
      },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByTopic: fallback,
    });

    const results = await runtime.searchPeers({ interests: ["music"], maxResults: 10 });
    expect(fallback).toHaveBeenCalled();
    expect(results[0].discoverySource).toBe("relay-roster-topic");
  });

  it("reserves ~half of maxResults for relay so DHT noise cannot starve NAT peers (P3)", async () => {
    const dhtProviders = Array.from({ length: 8 }, (_, i) => ({
      peerId: `12D3KooWDhtPeer${i}`,
      multiaddrs: [`/ip4/1.2.3.${i}/tcp/4001/p2p/12D3KooWDhtPeer${i}`],
    }));
    const mesh = makeMeshStub({ providers: dhtProviders });
    const trustStore = makeTrustStore([]);
    const peerDirectoryStore = makePeerDirectoryStore(
      dhtProviders.map((p, i) => ({ peerId: p.peerId, ownerId: `envoy:owner:dht${i}` })),
    );
    const configStore = makeConfigStore();
    const fallback = vi.fn(async () =>
      Array.from({ length: 4 }, (_, i) => ({
        nodeId: `12D3KooWRelayPeer${i}`,
        ownerId: `envoy:owner:relay${i}`,
        displayName: `Relay ${i}`,
        interests: ["music"],
        profileVisibility: "public" as const,
        discoverySource: "relay-roster-topic" as const,
      })),
    );

    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("not used");
      },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: trustStore as never,
      peerDirectoryStore: peerDirectoryStore as never,
      configStore: configStore as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => {
        throw new Error("not used");
      },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByTopic: fallback,
    });

    const results = await runtime.searchPeers({ topic: "music", maxResults: 4 });
    expect(results).toHaveLength(4);
    const relayHits = results.filter((r) => r.discoverySource === "relay-roster-topic");
    const dhtHits = results.filter((r) => r.discoverySource === "dht-capability-topic");
    expect(relayHits.length).toBeGreaterThanOrEqual(2);
    expect(dhtHits.length).toBeLessThanOrEqual(2);
  });

  it("prefers DHT for maxResults=1 when both DHT and relay have hits", async () => {
    const mesh = makeMeshStub({
      providers: [
        {
          peerId: "12D3KooWDhtOnly",
          multiaddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWDhtOnly"],
        },
      ],
    });
    const fallback = vi.fn(async () => [
      {
        nodeId: "12D3KooWRelayOnly",
        ownerId: "envoy:owner:r",
        displayName: "Relay",
        interests: ["music"],
        profileVisibility: "public" as const,
        discoverySource: "relay-roster-topic" as const,
      },
    ]);
    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("not used");
      },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: makeTrustStore([]) as never,
      peerDirectoryStore: makePeerDirectoryStore([]) as never,
      configStore: makeConfigStore() as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => {
        throw new Error("not used");
      },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByTopic: fallback,
    });
    const results = await runtime.searchPeers({ topic: "music", maxResults: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].discoverySource).toBe("dht-capability-topic");
    expect(results[0].nodeId).toBe("12D3KooWDhtOnly");
  });

  it(
    "time-boxes relay union when DHT already has hits",
    async () => {
      const mesh = makeMeshStub({
        providers: [
          {
            peerId: "12D3KooWDhtFast",
            multiaddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWDhtFast"],
          },
        ],
      });
      // Never resolves — without the budget this would hang ~30s per relay target.
      const fallback = vi.fn(() => new Promise<PeerSearchResult[]>(() => {}));
      const runtime = new NodeDiscoveryRuntime({
        getProfile: () => undefined,
        requireProfile: () => {
          throw new Error("not used");
        },
        getMesh: () => mesh as never,
        requireMesh: () => mesh as never,
        getReachableMesh: () => mesh as never,
        trustStore: makeTrustStore([]) as never,
        peerDirectoryStore: makePeerDirectoryStore([]) as never,
        configStore: makeConfigStore() as never,
        getApprovalQueue: () => null,
        resolvePeerTransportForOwner: async () => {
          throw new Error("not used");
        },
        dialHintsForChat: async () => [],
        emitMultiHopUpdate: () => {},
        queryRelayLookupByTopic: fallback,
      });
      const started = Date.now();
      const results = await runtime.searchPeers({ topic: "music", maxResults: 10 });
      const elapsed = Date.now() - started;
      expect(results.some((r) => r.nodeId === "12D3KooWDhtFast")).toBe(true);
      expect(elapsed).toBeLessThan(8_000);
    },
    15_000,
  );
});

describe("mergeDhtAndRelayTopicResults / withTimeoutFallback", () => {
  it("merge prefers DHT on maxResults=1", () => {
    const dht: PeerSearchResult[] = [
      {
        nodeId: "dht",
        ownerId: "o1",
        displayName: "D",
        interests: [],
        profileVisibility: "public",
        discoverySource: "dht-capability-topic",
      },
    ];
    const relay: PeerSearchResult[] = [
      {
        nodeId: "relay",
        ownerId: "o2",
        displayName: "R",
        interests: [],
        profileVisibility: "public",
        discoverySource: "relay-roster-topic",
      },
    ];
    expect(mergeDhtAndRelayTopicResults(dht, relay, 1).map((r) => r.nodeId)).toEqual(["dht"]);
    expect(mergeDhtAndRelayTopicResults([], relay, 1).map((r) => r.nodeId)).toEqual(["relay"]);
  });

  it("withTimeoutFallback returns fallback after timeout", async () => {
    vi.useFakeTimers();
    try {
      const slow = new Promise<string>(() => {});
      const pending = withTimeoutFallback(slow, 100, "fallback");
      await vi.advanceTimersByTimeAsync(150);
      await expect(pending).resolves.toBe("fallback");
    } finally {
      vi.useRealTimers();
    }
  });
});
