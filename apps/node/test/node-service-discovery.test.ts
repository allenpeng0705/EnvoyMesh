import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach, vi } from "vitest";
import type { PeerSearchResult } from "@envoymesh/api";
import {
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createMultiHopDiscoveryStore,
} from "@envoymesh/local-store";
import { NodeDiscoveryRuntime } from "../src/node-service-discovery.js";

describe("NodeDiscoveryRuntime", () => {
  let profileDir: string;

  afterEach(async () => {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("getMorningReport returns [] when task store is unavailable", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-discovery-runtime-"));
    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("no profile");
      },
      getMesh: () => undefined,
      requireMesh: () => {
        throw new Error("no mesh");
      },
      getReachableMesh: () => undefined,
      trustStore: createLocalTrustStore(profileDir),
      peerDirectoryStore: createLocalPeerDirectoryStore(profileDir),
      configStore: { load: async () => undefined } as never,
      taskStore: undefined,
      discoverySeedStore: undefined,
      contactOwnerKeyStore: null,
      multihopDiscoveryStore: createMultiHopDiscoveryStore(profileDir),
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => ({
        transportPeerId: "peer-1",
        recipientEnvelopePeerId: "envoy_peer",
        listenAddrs: [],
      }),
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => undefined,
    });

    await expect(runtime.getMorningReport({ limit: 5 })).resolves.toEqual([]);
  });

  it("getMultiHopDiscoverySession reads persisted session", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-discovery-runtime-"));
    const store = createMultiHopDiscoveryStore(profileDir);
    await store.upsertSession({
      correlationId: "corr-abc",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bondsQueried: 1,
      pendingForwardApprovals: 1,
      awaitingHop2ViaBonds: ["envoy:owner:bob"],
      matches: [],
    });
    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("no profile");
      },
      getMesh: () => undefined,
      requireMesh: () => {
        throw new Error("no mesh");
      },
      getReachableMesh: () => undefined,
      trustStore: createLocalTrustStore(profileDir),
      peerDirectoryStore: createLocalPeerDirectoryStore(profileDir),
      configStore: { load: async () => undefined } as never,
      taskStore: createLocalTaskStore(profileDir),
      discoverySeedStore: undefined,
      contactOwnerKeyStore: null,
      multihopDiscoveryStore: store,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => ({
        transportPeerId: "peer-1",
        recipientEnvelopePeerId: "envoy_peer",
        listenAddrs: [],
      }),
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => undefined,
    });

    const session = await runtime.getMultiHopDiscoverySession("corr-abc");
    expect(session?.correlationId).toBe("corr-abc");
    expect(session?.pendingForwardApprovals).toBe(1);
  });

  it("getMorningReport prepends geo city summary when profile allows city search", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-discovery-runtime-"));
    const mockPeers: PeerSearchResult[] = [
      {
        nodeId: "12D3KooWOne",
        ownerId: "envoy:owner:a",
        displayName: "A",
        interests: [],
        bio: "",
        trustLevel: "unknown",
      },
      {
        nodeId: "12D3KooWTwo",
        ownerId: "envoy:owner:b",
        displayName: "B",
        interests: [],
        bio: "",
        trustLevel: "unknown",
      },
      {
        nodeId: "12D3KooWThree",
        ownerId: "envoy:owner:c",
        displayName: "C",
        interests: [],
        bio: "",
        trustLevel: "unknown",
      },
    ];
    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("no profile");
      },
      getMesh: () => ({ peerId: "12D3KooWSelf" }) as never,
      requireMesh: () => ({ peerId: "12D3KooWSelf" }) as never,
      getReachableMesh: () => undefined,
      trustStore: createLocalTrustStore(profileDir),
      peerDirectoryStore: createLocalPeerDirectoryStore(profileDir),
      configStore: { load: async () => undefined } as never,
      taskStore: createLocalTaskStore(profileDir),
      discoverySeedStore: undefined,
      contactOwnerKeyStore: null,
      multihopDiscoveryStore: createMultiHopDiscoveryStore(profileDir),
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => ({
        transportPeerId: "peer-1",
        recipientEnvelopePeerId: "envoy_peer",
        listenAddrs: [],
      }),
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => undefined,
      loadHumanProfile: async () => ({
        version: "0.1",
        ownerId: "envoy:owner:me",
        displayName: "Me",
        username: "me01",
        profileVisibility: "public",
        discoveryLocation: { countryCode: "US", city: "Boston" },
        discoveryLocationPrecision: "city",
        signature: "sig",
      }),
    });
    vi.spyOn(runtime, "searchPeers").mockResolvedValue(mockPeers);

    const entries = await runtime.getMorningReport({ limit: 5 });
    expect(entries[0]?.reason).toBe("geo-city-summary");
    expect(entries[0]?.geoCitySummary).toEqual({ peerCount: 3, cityLabel: "Boston" });
    expect(runtime.searchPeers).toHaveBeenCalledWith({
      topics: ["geo:city:US-boston"],
      maxResults: 50,
    });
  });

  it("getMorningReport skips geo summary when location precision is hidden", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-discovery-runtime-"));
    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("no profile");
      },
      getMesh: () => ({ peerId: "12D3KooWSelf" }) as never,
      requireMesh: () => ({ peerId: "12D3KooWSelf" }) as never,
      getReachableMesh: () => undefined,
      trustStore: createLocalTrustStore(profileDir),
      peerDirectoryStore: createLocalPeerDirectoryStore(profileDir),
      configStore: { load: async () => undefined } as never,
      taskStore: createLocalTaskStore(profileDir),
      discoverySeedStore: undefined,
      contactOwnerKeyStore: null,
      multihopDiscoveryStore: createMultiHopDiscoveryStore(profileDir),
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => ({
        transportPeerId: "peer-1",
        recipientEnvelopePeerId: "envoy_peer",
        listenAddrs: [],
      }),
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => undefined,
      loadHumanProfile: async () => ({
        version: "0.1",
        ownerId: "envoy:owner:me",
        displayName: "Me",
        username: "me01",
        profileVisibility: "public",
        discoveryLocation: { countryCode: "US", city: "Boston" },
        discoveryLocationPrecision: "hidden",
        signature: "sig",
      }),
    });
    const searchSpy = vi.spyOn(runtime, "searchPeers").mockResolvedValue([]);

    const entries = await runtime.getMorningReport({ limit: 5 });
    expect(entries.some((entry) => entry.reason === "geo-city-summary")).toBe(false);
    expect(searchSpy).not.toHaveBeenCalled();
  });
});
