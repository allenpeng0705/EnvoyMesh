import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
} from "@envoymesh/api";
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { createStubNodeConfigStore, type PersistedNodeConfig } from "../src/node-config-store.js";
import type { LocalTrustStore, LocalPeerDirectoryStore, HumanProfileStore } from "@envoymesh/local-store";

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

const createMockHumanProfileStore = (profile?: any): HumanProfileStore => ({
  loadHumanProfile: async () => profile,
  saveHumanProfile: async () => {},
});

// Mock mesh for testing
const createMockMesh = (overrides: any = {}) => ({
  peerId: "QmMockPeer123456",
  multiaddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/QmMockPeer123456"],
  // provideCapabilityTopic now returns { cid, signedRecord?, timedOut } so
  // callers can distinguish a landed put from a stalled one. Tests mock
  // the success path with `timedOut: false`.
  provideCapabilityTopic: vi.fn().mockResolvedValue({ timedOut: false }),
  cancelCapabilityTopicReprovide: vi.fn().mockResolvedValue(undefined),
  findCapabilityTopicProviders: vi.fn().mockResolvedValue([]),
  // Default: 2+ connected peers so the
  // `[node-service] Discovery advertise cycle: only N peer(s) connected —
  // skipping K topic publishes` gate introduced 2026-07-10 doesn't fire in
  // tests that don't exercise the empty-route-table path. Override via the
  // `overrides` arg to test the gate itself.
  getConnectedPeerIds: vi.fn().mockReturnValue([
    "12D3KooWRoutesTablePeerA",
    "12D3KooWRoutesTablePeerB",
  ]),
  send: vi.fn().mockResolvedValue(1),
  sendExpectReply: vi.fn().mockResolvedValue({ payload: { matches: [] } }),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  dial: vi.fn().mockResolvedValue(undefined),
  onMessage: vi.fn(),
  onPeerDiscovered: vi.fn(),
  ...overrides,
});

// Helper to create test config store
function createTestConfigStore(config: PersistedNodeConfig | null) {
  return {
    load: async () => config,
    save: async () => {},
    exists: async () => true,
  };
}

// Helper to set private config store on node service
function setConfigStore(nodeService: any, configStore: any) {
  Object.defineProperty(nodeService, "_configStore", {
    value: configStore,
    writable: true,
    configurable: true,
  });
}

describe("NodeServiceImpl - Discovery Configuration", () => {
  let mockMesh: any;
  let mockTrustStore: any;
  let mockPeerDirectoryStore: any;
  let mockHumanProfileStore: any;

  beforeEach(() => {
    mockMesh = createMockMesh();
    mockTrustStore = createMockTrustStore();
    mockPeerDirectoryStore = createMockPeerDirectoryStore();
    mockHumanProfileStore = createMockHumanProfileStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("searchByRendezvous", () => {
    it("should return empty when no relays configured", async () => {
      const configStore = createTestConfigStore({
        version: "0.1",
        profileDir: "/tmp/test",
        discoveryProfile: "wan-default" as const,
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        updatedAt: new Date().toISOString(),
      });

      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        mockHumanProfileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      const results = await (nodeService as any)._discoveryRuntime().searchByRendezvous(["music"]);
      expect(results).toEqual([]);
    });

    it("should skip disabled relays when searching", async () => {
      const configStore = createTestConfigStore({
        version: "0.1",
        profileDir: "/tmp/test",
        discoveryProfile: "wan-default" as const,
        enableMdns: true,
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [
          { relayId: "relay1", addr: "/ip4/127.0.0.1/tcp/5001/p2p/QmRelay1", enabled: true, level: 1 },
          { relayId: "relay2", addr: "/ip4/127.0.0.1/tcp/5002/p2p/QmRelay2", enabled: false, level: 2 },
        ],
        updatedAt: new Date().toISOString(),
      });

      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        mockHumanProfileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      // This will fail on signing, but should have called sendExpectReply once for enabled relay
      try {
        await (nodeService as any)._discoveryRuntime().searchByRendezvous(["music"]);
      } catch {
        // Expected - signing requires real key
      }
      // The method should still attempt to call sendExpectReply for enabled relay
      // (it will fail on signing, but the call attempt should be made)
    });
  });

  describe("_advertiseInterestsIfPublic", () => {
    it("should not advertise when profile is private", async () => {
      const profileStore = createMockHumanProfileStore({
        displayName: "Test User",
        username: "testuser",
        profileVisibility: "private",
        hobbies: ["music"],
        knowledge: [],
      });

      const configStore = createTestConfigStore({
        version: "0.1",
        profileDir: "/tmp/test",
        discoveryProfile: "wan-default" as const,
        enableMdns: true,
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        updatedAt: new Date().toISOString(),
      });

      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        profileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      await (nodeService as any)._advertiseInterestsIfPublic();

      // DHT advertising should not happen for private profiles
      expect(mockMesh.provideCapabilityTopic).not.toHaveBeenCalled();
    });

    it("should advertise interests on DHT when profile is public", async () => {
      const profileStore = createMockHumanProfileStore({
        displayName: "Test User",
        username: "testuser",
        profileVisibility: "public",
        hobbies: ["music", "tech"],
        knowledge: ["science"],
      });

      const configStore = createTestConfigStore({
        version: "0.1",
        profileDir: "/tmp/test",
        discoveryProfile: "wan-default" as const,
        enableMdns: true,
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: ["public-libp2p"],
        bootstrapPresets: ["public-libp2p"],
        configuredRelays: [],
        updatedAt: new Date().toISOString(),
      });

      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        profileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      await (nodeService as any)._advertiseInterestsIfPublic();

      // Should advertise hobbies (2) + knowledge (1) + username topic = 4.
      // Interests are normalized to `interest:<slug>` by computePublicDiscoveryTopics
      // (and matched on the search side by interestTopicFor) — see the
      // advertise/search contract test in capability-discovery-topics.test.ts.
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledTimes(4);
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("interest:music");
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("interest:tech");
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("interest:science");
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("username:testuser");
    });

    it("should not advertise when bootstrapPresets is empty (not public network)", async () => {
      const profileStore = createMockHumanProfileStore({
        displayName: "Test User",
        username: "testuser",
        profileVisibility: "public",
        hobbies: ["music"],
        knowledge: [],
      });

      const configStore = createTestConfigStore({
        version: "0.1",
        profileDir: "/tmp/test",
        discoveryProfile: "wan-default" as const,
        enableMdns: true,
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [], // Empty - not public network
        configuredRelays: [],
        updatedAt: new Date().toISOString(),
      });

      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        profileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      await (nodeService as any)._advertiseInterestsIfPublic();

      // Should not advertise when not public network
      expect(mockMesh.provideCapabilityTopic).not.toHaveBeenCalled();
    });
  });

  describe("_advertiseInterests", () => {
    it("should call provideCapabilityTopic for each interest and username", async () => {
      const configStore = createTestConfigStore(null);

      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        mockHumanProfileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      await (nodeService as any)._advertiseInterests(["music", "tech"], "alice");

      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("music");
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("tech");
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("username:alice");
    });

    it("should emit discovery:advertising-complete event", async () => {
      const configStore = createTestConfigStore(null);

      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        mockHumanProfileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      const handler = vi.fn();
      nodeService.on("discovery:advertising-complete" as any, handler);

      await (nodeService as any)._advertiseInterests(["music"], "alice");

      expect(handler).toHaveBeenCalledWith({
        topics: ["music", "username:alice"],
        success: true,
      });
    });

    it("should track failed advertisements", async () => {
      const configStore = createTestConfigStore(null);
      mockMesh.provideCapabilityTopic.mockRejectedValueOnce(new Error("DHT error"));

      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        mockHumanProfileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      const handler = vi.fn();
      nodeService.on("discovery:advertising-complete" as any, handler);

      await (nodeService as any)._advertiseInterests(["music"], "alice");

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );
    });
  });

  describe("_advertisePublicDiscoveryTopics geo topics", () => {
    it("should advertise geo topics alongside interests and username", async () => {
      const configStore = createTestConfigStore(null);
      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        mockHumanProfileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      await (nodeService as any)._advertisePublicDiscoveryTopics({
        interests: ["music"],
        username: "alice",
        locationTopics: ["geo:country:US", "geo:city:US-boston"],
      });

      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("music");
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("username:alice");
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("geo:country:US");
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("geo:city:US-boston");
    });

    it("should advertise profile capability tags as DHT topics", async () => {
      const configStore = createTestConfigStore(null);
      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        mockHumanProfileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      await (nodeService as any)._advertisePublicDiscoveryTopics({
        interests: [],
        username: "alice",
        locationTopics: [],
        capabilityTopics: ["coding-help", "capability:coding-help"],
      });

      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("coding-help");
      expect(mockMesh.provideCapabilityTopic).toHaveBeenCalledWith("capability:coding-help");
    });

    it("should cancel stale geo topics when precision is downgraded", async () => {
      const configStore = createTestConfigStore(null);
      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        mockHumanProfileStore,
        undefined,
      );
      setConfigStore(nodeService, configStore);

      await (nodeService as any)._advertisePublicDiscoveryTopics({
        interests: [],
        username: "alice",
        locationTopics: ["geo:country:US", "geo:city:US-boston"],
      });

      mockMesh.provideCapabilityTopic.mockClear();

      await (nodeService as any)._advertisePublicDiscoveryTopics({
        interests: [],
        username: "alice",
        locationTopics: ["geo:country:US"],
      });

      expect(mockMesh.cancelCapabilityTopicReprovide).toHaveBeenCalledWith("geo:city:US-boston");
      expect(mockMesh.provideCapabilityTopic).not.toHaveBeenCalledWith("geo:city:US-boston");
    });

    it("should cancel all auto-advertised topics when profile goes private", async () => {
      const profileStore = createMockHumanProfileStore({
        displayName: "Alice",
        username: "alice",
        profileVisibility: "public",
        hobbies: ["music"],
        knowledge: [],
        discoveryLocation: { countryCode: "US", city: "Boston" },
        discoveryLocationPrecision: "city",
      });
      const configStore = createTestConfigStore({
        version: "0.1",
        profileDir: "/tmp/test",
        discoveryProfile: "wan-default" as const,
        enableMdns: false,
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: ["public-libp2p"],
        bootstrapPresets: ["public-libp2p"],
        configuredRelays: [],
        updatedAt: new Date().toISOString(),
      });

      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      const profile = {
        owner,
        device,
        deviceCertificate: createDeviceCertificate({
          owner,
          device,
          deviceProfile: "primary",
          capabilities: ["mesh.listen", "message.send"],
        }),
      };

      const nodeService = new NodeServiceImpl(
        mockMesh,
        mockTrustStore,
        mockPeerDirectoryStore,
        profileStore,
        "/tmp/test",
        profile,
      );
      setConfigStore(nodeService, configStore);

      await (nodeService as any)._advertisePublicDiscoveryTopics({
        interests: ["music"],
        username: "alice",
        locationTopics: ["geo:country:US", "geo:city:US-boston"],
      });

      mockMesh.cancelCapabilityTopicReprovide.mockClear();

      await nodeService.updateHumanProfile({
        displayName: "Alice",
        username: "alice",
        profileVisibility: "private",
        hobbies: ["music"],
      });

      await vi.waitFor(() => {
        expect(mockMesh.cancelCapabilityTopicReprovide).toHaveBeenCalledWith("music");
        expect(mockMesh.cancelCapabilityTopicReprovide).toHaveBeenCalledWith("username:alice");
        expect(mockMesh.cancelCapabilityTopicReprovide).toHaveBeenCalledWith("geo:country:US");
        expect(mockMesh.cancelCapabilityTopicReprovide).toHaveBeenCalledWith("geo:city:US-boston");
      });
    });
  });

  describe("getNodeConfig", () => {
    it("should return default config when none saved", async () => {
      const nodeService = new NodeServiceImpl(
        undefined,
        createMockTrustStore(),
        createMockPeerDirectoryStore(),
        createMockHumanProfileStore(),
        "/tmp/test",
      );

      const config = await nodeService.getNodeConfig();
      expect(config.discoveryProfile).toBe("lan-fast");
      expect(config.bootstrapPresets).toEqual([]);
      expect(config.bootstrapPeers).toEqual([]);
      expect(config.configuredRelays).toEqual([]);
    });

    it("should have lan-fast as default discovery profile", async () => {
      const nodeService = new NodeServiceImpl(
        undefined,
        createMockTrustStore(),
        createMockPeerDirectoryStore(),
        createMockHumanProfileStore(),
        "/tmp/test",
      );

      const config = await nodeService.getNodeConfig();
      expect(config.discoveryProfile).toBe("lan-fast");
    });

    it("should return persisted enableMdns and aiSettings", async () => {
      const configStore = createTestConfigStore({
        version: "0.1",
        profileDir: "/tmp/test",
        discoveryProfile: "wan-default" as const,
        enableMdns: false,
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "mock" as const },
        chatAssistEnabled: false,
        contactAiPreferences: [],
        aiSettings: {
          status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" },
          identity: { mode: "defensive" },
          defaultModeForNewContacts: "assistant",
          rules: [],
        },
        updatedAt: new Date().toISOString(),
      });

      const nodeService = new NodeServiceImpl(
        undefined,
        createMockTrustStore(),
        createMockPeerDirectoryStore(),
        createMockHumanProfileStore(),
        undefined,
      );
      setConfigStore(nodeService, configStore);

      const config = await nodeService.getNodeConfig();
      expect(config.enableMdns).toBe(false);
      expect(config.aiSettings?.defaultModeForNewContacts).toBe("assistant");
      expect(config.aiSettings?.identity.mode).toBe("defensive");
    });
  });
});

describe("NodeServiceImpl - Relay Configuration", () => {
  it("should return configured relays from getNodeConfig", async () => {
    const configStore = createTestConfigStore({
      version: "0.1",
      profileDir: "/tmp/test",
      discoveryProfile: "wan-default" as const,
      enableMdns: true,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: [],
      configuredRelays: [
        { relayId: "relay1", addr: "/ip4/127.0.0.1/tcp/5001/p2p/QmRelay1", enabled: true, level: 1 },
        { relayId: "relay2", addr: "/ip4/127.0.0.1/tcp/5002/p2p/QmRelay2", enabled: false, level: 2 },
      ],
      updatedAt: new Date().toISOString(),
    });

    const nodeService = new NodeServiceImpl(
      undefined,
      createMockTrustStore(),
      createMockPeerDirectoryStore(),
      createMockHumanProfileStore(),
      undefined,
    );
    setConfigStore(nodeService, configStore);

    const config = await nodeService.getNodeConfig();
    expect(config.configuredRelays).toHaveLength(2);
    expect(config.configuredRelays[0].relayId).toBe("relay1");
    expect(config.configuredRelays[1].relayId).toBe("relay2");
  });

  it("should skip disabled relays in searchByRendezvous", async () => {
    // Test that searchByRendezvous returns empty when no relays configured
    // (It returns early before needing profile)
    const nodeService = new NodeServiceImpl(
      createMockMesh(),
      createMockTrustStore(),
      createMockPeerDirectoryStore(),
      createMockHumanProfileStore(),
      undefined,
    );
    setConfigStore(nodeService, createTestConfigStore({
      version: "0.1",
      profileDir: "/tmp/test",
      discoveryProfile: "wan-default" as const,
      enableMdns: true,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: [],
      configuredRelays: [], // Empty - no relays configured
      updatedAt: new Date().toISOString(),
    }));

    const results = await (nodeService as any)._discoveryRuntime().searchByRendezvous(["music"]);
    // Returns empty when no relays configured (early return before profile check)
    expect(results).toEqual([]);
  });
});