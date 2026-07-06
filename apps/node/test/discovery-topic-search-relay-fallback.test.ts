import { describe, it, expect, vi, beforeEach } from "vitest";
import { NodeDiscoveryRuntime } from "../src/node-service-discovery.js";
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

  it("returns DHT providers when local DHT has results", async () => {
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
    const fallback = vi.fn(async () => {
      throw new Error("fallback should not be called when DHT returns results");
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
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe("12D3KooWDhtPeer1");
    expect(results[0].discoverySource).toBe("dht-capability-topic");
    expect(fallback).not.toHaveBeenCalled();
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
    expect(fallback).toHaveBeenCalledTimes(1);
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
    expect(fallback).toHaveBeenCalledTimes(1);
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
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(results[0].discoverySource).toBe("relay-roster-topic");
  });
});