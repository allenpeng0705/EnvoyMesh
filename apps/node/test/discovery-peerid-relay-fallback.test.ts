import { describe, it, expect, vi, beforeEach } from "vitest";
import { NodeDiscoveryRuntime } from "../src/node-service-discovery.js";

function makeTrustStore() {
  return { listTrustRecords: vi.fn(async () => []) };
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

describe("NodeDiscoveryRuntime — peerId relay/seed fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makePeerIdRuntime(overrides: {
    mesh?: Record<string, unknown>;
    discoverySeedStore?: { listSeedAddrs: () => Promise<string[]> };
    queryRelayLookupByPeerId?: ReturnType<typeof vi.fn>;
    peerRecords?: Array<{ peerId: string; ownerId: string; listenAddrs?: string[] }>;
  }) {
    const mesh = overrides.mesh ?? {
      dial: vi.fn(async () => {
        throw new Error("dial failed");
      }),
    };
    return new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("not used");
      },
      getMesh: () => mesh as never,
      requireMesh: () => mesh as never,
      getReachableMesh: () => mesh as never,
      trustStore: makeTrustStore() as never,
      peerDirectoryStore: {
        listPeerRecords: vi.fn(async () => overrides.peerRecords ?? []),
      } as never,
      configStore: makeConfigStore() as never,
      discoverySeedStore: overrides.discoverySeedStore as never,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => {
        throw new Error("not used");
      },
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      queryRelayLookupByPeerId: overrides.queryRelayLookupByPeerId as never,
    });
  }

  it("returns discovery-seed hit when DHT/dial fail but seed has circuit addr", async () => {
    const peerId = "12D3KooWSeedPeerxxxxxxxxxxxx";
    const runtime = makePeerIdRuntime({
      discoverySeedStore: {
        listSeedAddrs: async () => [
          `/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${peerId}`,
        ],
      },
      queryRelayLookupByPeerId: vi.fn(async () => {
        throw new Error("should not reach relay lookup when seed hits");
      }),
    });

    const results = await runtime.searchPeers({ peerId, maxResults: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]?.discoverySource).toBe("discovery-seed");
    expect(results[0]?.nodeId).toBe(peerId);
  });

  it("falls back to relay.lookup by targetPeerId when DHT/dial/seed miss", async () => {
    const peerId = "12D3KooWRelayPeerxxxxxxxxxxxx";
    const lookup = vi.fn(async () => [
      {
        nodeId: peerId,
        ownerId: "envoy:owner:rp",
        displayName: "Relay Peer",
        interests: [],
        profileVisibility: "public" as const,
        discoverySource: "relay-roster-peer" as const,
      },
    ]);
    const runtime = makePeerIdRuntime({
      discoverySeedStore: { listSeedAddrs: async () => [] },
      queryRelayLookupByPeerId: lookup,
    });

    const results = await runtime.searchPeers({ peerId, maxResults: 5 });
    expect(lookup).toHaveBeenCalledWith({ peerId, maxResults: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]?.discoverySource).toBe("relay-roster-peer");
  });

  it("ignores peer-directory listenAddrs that are unrelated p2p-circuit hints", async () => {
    const peerId = "12D3KooWTargetPeerxxxxxxxxxx";
    const lookup = vi.fn(async () => [
      {
        nodeId: peerId,
        ownerId: "envoy:owner:t",
        displayName: "Target",
        interests: [],
        profileVisibility: "public" as const,
        discoverySource: "relay-roster-peer" as const,
      },
    ]);
    const runtime = makePeerIdRuntime({
      discoverySeedStore: { listSeedAddrs: async () => [] },
      peerRecords: [
        {
          peerId,
          ownerId: "envoy:owner:t",
          // Circuit path for a *different* peer — must not count as a hit.
          listenAddrs: [
            "/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWOtherPeerxxxxx",
          ],
        },
      ],
      queryRelayLookupByPeerId: lookup,
    });

    const results = await runtime.searchPeers({ peerId, maxResults: 5 });
    expect(lookup).toHaveBeenCalled();
    expect(results[0]?.discoverySource).toBe("relay-roster-peer");
  });

  it("accepts peer-directory listenAddrs that include /p2p/<peerId>", async () => {
    const peerId = "12D3KooWDirPeerxxxxxxxxxxxxxx";
    const runtime = makePeerIdRuntime({
      discoverySeedStore: { listSeedAddrs: async () => [] },
      peerRecords: [
        {
          peerId,
          ownerId: "envoy:owner:d",
          listenAddrs: [
            `/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${peerId}`,
          ],
        },
      ],
      queryRelayLookupByPeerId: vi.fn(async () => {
        throw new Error("should not reach relay");
      }),
    });

    const results = await runtime.searchPeers({ peerId, maxResults: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]?.discoverySource).toBe("discovery-seed");
  });
});
