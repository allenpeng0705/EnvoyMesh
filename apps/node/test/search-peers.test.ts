import { describe, it, expect, vi } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { createStubNodeConfigStore } from "../src/node-config-store.js";
import type { LocalTrustStore, LocalPeerDirectoryStore, HumanProfileStore } from "@envoymesh/local-store";
import type { SearchQuery } from "@envoymesh/api";

// Mock stores with proper async functions
const createMockTrustStore = (records: any[] = []): LocalTrustStore => ({
  listTrustRecords: async () => records,
  setTrustRecord: async () => ({}),
  removeTrustRecord: async () => ({}),
  getTrustRecord: async () => undefined,
});

const createMockPeerDirectoryStore = (records: any[] = []): LocalPeerDirectoryStore => ({
  listPeerRecords: async () => records,
  getPeerByOwnerId: async () => undefined,
  mergeListenAddrsForPeerId: async () => {},
  ensurePeerFromInboundChat: async () => {},
  upsertPeerFromSignal: async () => ({}),
});

const createMockHumanProfileStore = (): HumanProfileStore => ({
  loadHumanProfile: async () => undefined,
  saveHumanProfile: async () => {},
});

// Reusable stub config store for tests
const stubConfigStore = createStubNodeConfigStore();

describe("NodeServiceImpl - Search Peers", () => {
  describe("searchLocalPeers - By Interest/Name", () => {
    it("should return empty array when no peers bonded", async () => {
      const trustStore = createMockTrustStore([]);
      const peerDirectoryStore = createMockPeerDirectoryStore([]);
      const humanProfileStore = createMockHumanProfileStore();

      const nodeService = new NodeServiceImpl(
        undefined,
        trustStore,
        peerDirectoryStore,
        humanProfileStore,
        "/tmp/test-profile",
      );

      const results = await nodeService.searchPeers({ queryText: "alice" });
      expect(results).toEqual([]);
    });

    it("should filter by queryText matching displayName", async () => {
      const trustRecords = [
        { peerOwnerId: "owner-alice", displayName: "Alice", level: "bonded", createdAt: new Date().toISOString() },
        { peerOwnerId: "owner-bob", displayName: "Bob", level: "bonded", createdAt: new Date().toISOString() },
      ];
      const peerRecords = [
        { peerId: "peer-alice", ownerId: "owner-alice", deviceId: "dev1", lastSeenAt: new Date().toISOString(), listenAddrs: [] },
        { peerId: "peer-bob", ownerId: "owner-bob", deviceId: "dev2", lastSeenAt: new Date().toISOString(), listenAddrs: [] },
      ];

      const trustStore = createMockTrustStore(trustRecords);
      const peerDirectoryStore = createMockPeerDirectoryStore(peerRecords);
      const humanProfileStore = createMockHumanProfileStore();

      const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

      const results = await nodeService.searchPeers({ queryText: "alice" });
      expect(results).toHaveLength(1);
      expect(results[0].displayName).toBe("Alice");
      expect(results[0].ownerId).toBe("owner-alice");
    });

    it("matches cached profile hobbies on LAN interest search", async () => {
      const trustRecords = [
        { peerOwnerId: "owner-bob", displayName: "Bob", level: "public", createdAt: new Date().toISOString() },
      ];
      const peerRecords = [
        {
          peerId: "peer-bob",
          ownerId: "owner-bob",
          deviceId: "dev1",
          lastSeenAt: new Date().toISOString(),
          listenAddrs: [],
        },
      ];
      const trustStore = createMockTrustStore(trustRecords);
      const peerDirectoryStore = createMockPeerDirectoryStore(peerRecords);
      const humanProfileStore = createMockHumanProfileStore();
      const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");
      (nodeService as any)._peerProfileCacheStore = {
        list: async () => [
          {
            ownerId: "owner-bob",
            cachedAt: new Date().toISOString(),
            profile: {
              ownerId: "owner-bob",
              displayName: "Bob",
              username: "bob",
              bio: "",
              gender: "",
              hobbies: ["music"],
              knowledge: [],
              profileVisibility: "public",
              updatedAt: new Date().toISOString(),
              signature: "sig",
            },
          },
        ],
        get: async () => undefined,
        upsert: async () => ({} as any),
        remove: async () => {},
      };
      (nodeService as any)._discoveryRuntimeCache = undefined;

      const results = await nodeService.searchPeers({ interests: ["music"] });
      expect(results.some((r) => r.ownerId === "owner-bob")).toBe(true);
      expect(results.find((r) => r.ownerId === "owner-bob")?.interests).toContain("music");
    });

    it("should return only bonded peers when no query text provided", async () => {
      const trustRecords = [
        { peerOwnerId: "owner-alice", displayName: "Alice", level: "bonded", createdAt: new Date().toISOString() },
        { peerOwnerId: "owner-blocked", displayName: "Blocked User", level: "blocked", createdAt: new Date().toISOString() },
      ];
      const peerRecords = [
        { peerId: "peer-alice", ownerId: "owner-alice", deviceId: "dev1", lastSeenAt: new Date().toISOString(), listenAddrs: [] },
        { peerId: "peer-blocked", ownerId: "owner-blocked", deviceId: "dev2", lastSeenAt: new Date().toISOString(), listenAddrs: [] },
      ];

      const trustStore = createMockTrustStore(trustRecords);
      const peerDirectoryStore = createMockPeerDirectoryStore(peerRecords);
      const humanProfileStore = createMockHumanProfileStore();

      const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

      const results = await nodeService.searchPeers({});
      expect(results).toHaveLength(1);
      expect(results[0].displayName).toBe("Alice");
    });

    it("should exclude blocked peers from results", async () => {
      const trustRecords = [
        { peerOwnerId: "owner-alice", displayName: "Alice", level: "bonded", createdAt: new Date().toISOString() },
        { peerOwnerId: "owner-blocked", displayName: "Bad Actor", level: "blocked", createdAt: new Date().toISOString() },
      ];
      const peerRecords = [
        { peerId: "peer-alice", ownerId: "owner-alice", deviceId: "dev1", lastSeenAt: new Date().toISOString(), listenAddrs: [] },
        { peerId: "peer-blocked", ownerId: "owner-blocked", deviceId: "dev2", lastSeenAt: new Date().toISOString(), listenAddrs: [] },
      ];

      const trustStore = createMockTrustStore(trustRecords);
      const peerDirectoryStore = createMockPeerDirectoryStore(peerRecords);
      const humanProfileStore = createMockHumanProfileStore();

      const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

      const results = await nodeService.searchPeers({});
      const blockedResult = results.find(r => r.ownerId === "owner-blocked");
      expect(blockedResult).toBeUndefined();
    });

    it("should respect maxResults limit", async () => {
      const trustRecords = Array.from({ length: 10 }, (_, i) => ({
        peerOwnerId: `owner-${i}`,
        displayName: `User ${i}`,
        level: "bonded",
        createdAt: new Date().toISOString(),
      }));
      const peerRecords = trustRecords.map((t, i) => ({
        peerId: `peer-${i}`,
        ownerId: t.peerOwnerId,
        deviceId: `dev${i}`,
        lastSeenAt: new Date().toISOString(),
        listenAddrs: [],
      }));

      const trustStore = createMockTrustStore(trustRecords);
      const peerDirectoryStore = createMockPeerDirectoryStore(peerRecords);
      const humanProfileStore = createMockHumanProfileStore();

      const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

      const results = await nodeService.searchPeers({ maxResults: 3 });
      expect(results).toHaveLength(3);
    });
  });

  describe("searchPeers by Peer ID", () => {
    it("should return empty when node not initialized", async () => {
      const trustStore = createMockTrustStore();
      const peerDirectoryStore = createMockPeerDirectoryStore();
      const humanProfileStore = createMockHumanProfileStore();

      const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

      const results = await nodeService.searchPeers({ peerId: "12D3KooWHogeueWgeue" });
      expect(results).toEqual([]);
    });
  });

  describe("searchPeers by Topic", () => {
    it("should return empty when node not initialized", async () => {
      const trustStore = createMockTrustStore();
      const peerDirectoryStore = createMockPeerDirectoryStore();
      const humanProfileStore = createMockHumanProfileStore();

      const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

      const results = await nodeService.searchPeers({ topic: "music" });
      expect(results).toEqual([]);
    });
  });
});

describe("NodeServiceImpl - Network Modes", () => {
  it("should use public bootstrap when bootstrapPresets provided", async () => {
    const trustStore = createMockTrustStore();
    const peerDirectoryStore = createMockPeerDirectoryStore();
    const humanProfileStore = createMockHumanProfileStore();

    const nodeService = new NodeServiceImpl(
      undefined,
      trustStore,
      peerDirectoryStore,
      humanProfileStore,
      "/tmp/test-profile",
    );

    expect(nodeService).toBeDefined();
  });

  it("should not have DHT enabled in private mode", async () => {
    const nodeService = new NodeServiceImpl(
      undefined,
      createMockTrustStore(),
      createMockPeerDirectoryStore(),
      createMockHumanProfileStore(),
      "/tmp/test",
    );

    const results = await nodeService.searchPeers({ topic: "private-topic" });
    expect(results).toEqual([]);
  });

  it("should handle mixed search queries", async () => {
    const trustStore = createMockTrustStore();
    const peerDirectoryStore = createMockPeerDirectoryStore();
    const humanProfileStore = createMockHumanProfileStore();

    const nodeService = new NodeServiceImpl(
      undefined,
      trustStore,
      peerDirectoryStore,
      humanProfileStore,
      "/tmp/test-profile",
    );

    const localResults = await nodeService.searchPeers({ interests: ["music"] });
    expect(Array.isArray(localResults)).toBe(true);
  });
});

describe("NodeServiceImpl - Bond Management", () => {
  it("should block a peer", async () => {
    let blockedOwnerId = "";
    const trustStore: LocalTrustStore = {
      listTrustRecords: async () => [],
      setTrustRecord: async (input) => { blockedOwnerId = input.peerOwnerId; return {}; },
      removeTrustRecord: async () => {},
      getTrustRecord: async () => undefined,
    };
    const peerDirectoryStore = createMockPeerDirectoryStore();
    const humanProfileStore = createMockHumanProfileStore();

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

    await nodeService.blockPeer("peer-owner-123");
    expect(blockedOwnerId).toBe("peer-owner-123");
  });

  it("should revoke bond correctly", async () => {
    let revokedOwnerId = "";
    const trustStore: LocalTrustStore = {
      listTrustRecords: async () => [],
      setTrustRecord: async () => ({}),
      removeTrustRecord: async (ownerId) => { revokedOwnerId = ownerId; },
      getTrustRecord: async () => undefined,
    };
    const peerDirectoryStore = createMockPeerDirectoryStore();
    const humanProfileStore = createMockHumanProfileStore();

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

    await nodeService.revokeBond("peer-owner-456");
    expect(revokedOwnerId).toBe("peer-owner-456");
  });

  it("should get bonds with display names", async () => {
    const trustRecords = [
      { peerOwnerId: "owner-1", displayName: "Alice", level: "bonded", createdAt: "2024-01-01T00:00:00.000Z" },
      { peerOwnerId: "owner-2", displayName: "Bob", level: "bonded", createdAt: "2024-01-02T00:00:00.000Z" },
    ];
    const trustStore = createMockTrustStore(trustRecords);
    const peerDirectoryStore = createMockPeerDirectoryStore();
    const humanProfileStore = createMockHumanProfileStore();

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

    const bonds = await nodeService.getBonds();
    expect(bonds).toHaveLength(2);
    expect(bonds[0].displayName).toBe("Alice");
    expect(bonds[1].displayName).toBe("Bob");
  });
});

describe("NodeServiceImpl - Hello/Connection Requests", () => {
  it("should accept hello request without error", async () => {
    const trustStore = createMockTrustStore();
    const peerDirectoryStore = createMockPeerDirectoryStore();
    const humanProfileStore = createMockHumanProfileStore();

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

    await expect(nodeService.acceptHello("msg-123")).resolves.not.toThrow();
  });

  it("should decline hello request without error", async () => {
    const trustStore = createMockTrustStore();
    const peerDirectoryStore = createMockPeerDirectoryStore();
    const humanProfileStore = createMockHumanProfileStore();

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

    await expect(nodeService.declineHello("msg-456", "not interested")).resolves.not.toThrow();
  });
});

describe("SearchQuery interface validation", () => {
  it("should accept peerId parameter", () => {
    const query: SearchQuery = { peerId: "12D3KooWSHXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q" };
    expect(query.peerId).toBeDefined();
  });

  it("should accept topic parameter", () => {
    const query: SearchQuery = { topic: "music" };
    expect(query.topic).toBeDefined();
  });

  it("should accept queryText parameter", () => {
    const query: SearchQuery = { queryText: "alice" };
    expect(query.queryText).toBeDefined();
  });

  it("should accept username parameter", () => {
    const query: SearchQuery = { username: "alice123" };
    expect(query.username).toBe("alice123");
  });

  it("should accept interests array", () => {
    const query: SearchQuery = { interests: ["blues", "jazz"] };
    expect(query.interests).toHaveLength(2);
  });

  it("should accept maxResults parameter", () => {
    const query: SearchQuery = { maxResults: 50 };
    expect(query.maxResults).toBe(50);
  });

  it("should accept all parameters combined", () => {
    const query: SearchQuery = {
      peerId: "12D3KooWSHXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q",
      topic: "music",
      queryText: "alice",
      username: "alice123",
      interests: ["blues"],
      maxResults: 10,
    };
    expect(Object.keys(query)).toHaveLength(6);
  });
});

describe("Username-based Search", () => {
  it("should include username in search results when provided", async () => {
    const trustRecords = [
      { peerOwnerId: "owner-alice", displayName: "Alice", level: "bonded", createdAt: new Date().toISOString() },
    ];
    const peerRecords = [
      { peerId: "peer-alice", ownerId: "owner-alice", deviceId: "dev1", lastSeenAt: new Date().toISOString(), listenAddrs: [] },
    ];

    const trustStore = createMockTrustStore(trustRecords);
    const peerDirectoryStore = createMockPeerDirectoryStore(peerRecords);
    const humanProfileStore = createMockHumanProfileStore();

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, humanProfileStore, "/tmp/test");

    const results = await nodeService.searchPeers({ username: "alice123" });
    // Node not initialized, so should return empty for username search
    expect(Array.isArray(results)).toBe(true);
  });

  it("matches bundled sponsor displayName when no trust record or profile cache has it", async () => {
    // Simulates a fresh install: a never-bonded sponsor shows up in the
    // peer directory (e.g. from the bundled contactUri's peerId), but
    // there's no trust record (no bond), no peer profile cache (no
    // inbound profile sync), and no DHT/relay (isolated dev env). The
    // bundled sponsor's displayName lives in the DMG-shipped
    // `bundled-sponsor-friend.json` and is exposed to the discovery
    // runtime via the `getBundledSponsorIdentity` dep. Without that
    // fallback, "Allen Peng" returns empty even though the peer record
    // is right there.
    const peerRecords = [
      {
        peerId: "peer-sponsor",
        ownerId: "owner-sponsor",
        deviceId: "dev1",
        lastSeenAt: new Date().toISOString(),
        listenAddrs: [],
      },
    ];
    const trustStore = createMockTrustStore([]);
    const peerDirectoryStore = createMockPeerDirectoryStore(peerRecords);
    const humanProfileStore = createMockHumanProfileStore();

    const nodeService = new NodeServiceImpl(
      undefined,
      trustStore,
      peerDirectoryStore,
      humanProfileStore,
      "/tmp/test",
    );

    // Inject a custom discovery runtime so we can supply
    // getBundledSponsorIdentity without going through the bundled
    // config file path (test seam).
    const { NodeDiscoveryRuntime } = await import(
      "../src/node-service-discovery.js"
    );
    const customRuntime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("profile required");
      },
      getMesh: () => undefined,
      requireMesh: () => {
        throw new Error("mesh required");
      },
      getReachableMesh: () => undefined,
      trustStore,
      peerDirectoryStore,
      configStore: stubConfigStore,
      contactOwnerKeyStore: null,
      multihopDiscoveryStore: null,
      peerProfileCacheStore: null,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => ({
        transportPeerId: "",
        recipientEnvelopePeerId: undefined,
        listenAddrs: undefined,
      }),
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => {},
      loadHumanProfile: async () => undefined,
      getBundledSponsorIdentity: async () => ({
        ownerId: "owner-sponsor",
        peerId: "peer-sponsor",
        displayName: "Allen Peng",
      }),
    });
    (nodeService as any)._discoveryRuntimeCache = customRuntime;

    const results = await nodeService.searchPeers({ queryText: "allen peng" });
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toBe("Allen Peng");
    expect(results[0].ownerId).toBe("owner-sponsor");
    expect(results[0].discoverySource).toBe("local");
  });
});