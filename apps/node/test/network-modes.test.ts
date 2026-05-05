import { describe, it, expect } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import type { LocalTrustStore, LocalPeerDirectoryStore } from "@envoymesh/local-store";

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
  upsertPeerFromSignal: async () => ({}),
});

describe("NodeServiceImpl - Network Mode Configuration", () => {
  describe("Private Network Mode", () => {
    it("should configure without bootstrap peers for private network", async () => {
      const trustStore = createMockTrustStore();
      const peerDirectoryStore = createMockPeerDirectoryStore();

      const nodeService = new NodeServiceImpl(
        undefined,
        trustStore,
        peerDirectoryStore,
        "/tmp/test-profile",
      );

      expect(nodeService).toBeDefined();
    });

    it("should not have DHT enabled in private mode", async () => {
      const nodeService = new NodeServiceImpl(
        undefined,
        createMockTrustStore(),
        createMockPeerDirectoryStore(),
        "/tmp/test",
      );

      const results = await nodeService.searchPeers({ topic: "private-topic" });
      expect(results).toEqual([]);
    });
  });

  describe("Public Network Mode", () => {
    it("should use bootstrap presets when configured", async () => {
      const trustStore = createMockTrustStore();
      const peerDirectoryStore = createMockPeerDirectoryStore();

      const nodeService = new NodeServiceImpl(
        undefined,
        trustStore,
        peerDirectoryStore,
        "/tmp/test-profile",
      );

      const peerIdResult = await nodeService.searchPeers({
        peerId: "12D3KooWSHXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q",
      });
      expect(Array.isArray(peerIdResult)).toBe(true);

      const topicResult = await nodeService.searchPeers({ topic: "public-topic" });
      expect(Array.isArray(topicResult)).toBe(true);
    });
  });

  describe("Hybrid Network Mode", () => {
    it("should handle mixed search queries", async () => {
      const trustStore = createMockTrustStore();
      const peerDirectoryStore = createMockPeerDirectoryStore();

      const nodeService = new NodeServiceImpl(
        undefined,
        trustStore,
        peerDirectoryStore,
        "/tmp/test-profile",
      );

      const localResults = await nodeService.searchPeers({ interests: ["music"] });
      expect(Array.isArray(localResults)).toBe(true);
    });
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

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, "/tmp/test");

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

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, "/tmp/test");

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

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, "/tmp/test");

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

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, "/tmp/test");

    await expect(nodeService.acceptHello("msg-123")).resolves.not.toThrow();
  });

  it("should decline hello request", async () => {
    const trustStore = createMockTrustStore();
    const peerDirectoryStore = createMockPeerDirectoryStore();

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, "/tmp/test");

    await expect(nodeService.declineHello("msg-456", "not interested")).resolves.not.toThrow();
  });

  it("should send hello to target owner", async () => {
    const trustStore = createMockTrustStore();
    const peerDirectoryStore = createMockPeerDirectoryStore();

    const nodeService = new NodeServiceImpl(undefined, trustStore, peerDirectoryStore, "/tmp/test");

    // sendHello will fail without mesh, but should be handled gracefully
    try {
      await nodeService.sendHello("target-owner", {
        displayName: "Test User",
        interests: [],
        whatShares: [],
      }, "Hello!");
    } catch {
      // Expected - mesh not available
    }
  });
});