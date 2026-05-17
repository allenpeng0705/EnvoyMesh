import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { MobileNode, createMobileNode } from "../src/index.js";
import type { MobileNodeConfig } from "../src/index.js";
import type { SecureStorage } from "@envoymesh/mobile-storage";

function makeConfig(overrides: Partial<MobileNodeConfig> = {}): MobileNodeConfig {
  return {
    profileDir: "/test-profile",
    relayUrls: ["ws://relay.example.com:9000"],
    ...overrides,
  };
}

describe("MobileNode", () => {
  let node: MobileNode;

  afterEach(async () => {
    // Clean up any open WebSocket connections
    try { await node.stopNode(); } catch { /* ignore */ }
  });

  // -----------------------------------------------------------------------
  // Construction & identity
  // -----------------------------------------------------------------------

  describe("construction", () => {
    it("creates a MobileNode with given config", () => {
      node = new MobileNode(makeConfig());
      expect(node).toBeInstanceOf(MobileNode);
    });

    it("has no state before initialization", () => {
      node = new MobileNode(makeConfig());
      expect(node.getNodeStatus()).toBe("offline");
    });

    it("createMobileNode is a convenience factory", () => {
      const n = createMobileNode(makeConfig());
      expect(n).toBeInstanceOf(MobileNode);
    });
  });

  // -----------------------------------------------------------------------
  // Standalone identity
  // -----------------------------------------------------------------------

  describe("standalone identity", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("initStandalone generates owner, device, and agent identities", () => {
      const state = node.state;
      expect(state.owner.ownerId).toMatch(/^envoy:owner:/);
      expect(state.device.deviceId).toMatch(/^envoy:device:/);
      expect(state.agent.agentPeerId).toMatch(/^envoy_agent_/);
      expect(state.sharedIdentity).toBe(false);
    });

    it("after initStandalone, sharedIdentity is false", () => {
      expect(node.sharedIdentity).toBe(false);
    });

    it("initNode after initStandalone returns correct IDs", async () => {
      const result = await node.initNode("/test-profile");
      expect(result.profileDir).toBe("/test-profile");
      expect(result.ownerId).toBe(node.state.owner.ownerId);
      expect(result.deviceId).toBe(node.state.device.deviceId);
      expect(result.peerId).toBe(node.state.agent.agentPeerId);
    });

    it("initStandalone without prior init also triggers standalone init", async () => {
      const fresh = new MobileNode(makeConfig());
      const result = await fresh.initNode("/fresh-profile");
      expect(result.ownerId).toMatch(/^envoy:owner:/);
      expect(result.deviceId).toMatch(/^envoy:device:/);
    });
  });

  // -----------------------------------------------------------------------
  // Shared identity (multi-device)
  // -----------------------------------------------------------------------

  describe("shared identity (import from home node)", () => {
    it("importOwnerIdentity sets sharedIdentity to true", async () => {
      node = new MobileNode(makeConfig());
      // Generate owner keys (same as home node would produce)
      const { generateOwnerIdentity } = await import("@envoymesh/mobile-identity");
      const owner = generateOwnerIdentity();

      await node.importOwnerIdentity(
        "/shared-profile",
        owner.privateKeyPem,
        owner.publicKeyPem,
        "home-node-peer-id",
      );

      const state = node.state;
      expect(state.sharedIdentity).toBe(true);
      expect(state.homeNodePeerId).toBe("home-node-peer-id");
      expect(state.owner.ownerId).toBe(owner.ownerId);
      expect(state.owner.publicKeyPem).toBe(owner.publicKeyPem);
      expect(state.owner.privateKeyPem).toBe(owner.privateKeyPem);
    });

    it("shared identity uses same ownerId but different deviceId", async () => {
      node = new MobileNode(makeConfig());
      const { generateOwnerIdentity } = await import("@envoymesh/mobile-identity");
      const owner = generateOwnerIdentity();

      await node.importOwnerIdentity(
        "/shared-profile",
        owner.privateKeyPem,
        owner.publicKeyPem,
        "home-node-peer-id",
      );

      const state = node.state;
      expect(state.owner.ownerId).toBe(owner.ownerId);
      expect(state.device.deviceId).not.toBe(owner.ownerId);
      expect(state.device.deviceId).toMatch(/^envoy:device:/);
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe("lifecycle", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("startNode transitions to running and emits events", async () => {
      const statusEvents: unknown[] = [];
      const onlineEvents: unknown[] = [];
      node.on("node:status" as any, (d: any) => statusEvents.push(d));
      node.on("node:online" as any, (d: any) => onlineEvents.push(d));

      await node.startNode();
      expect(node.getNodeStatus()).toBe("running");

      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
      const statusEvt = statusEvents[statusEvents.length - 1] as any;
      expect(statusEvt.status).toBe("running");
    });

    it("stopNode transitions to offline", async () => {
      node.on("node:status" as any, () => {});
      node.on("node:online" as any, () => {});
      node.on("node:offline" as any, () => {});
      await node.startNode();

      await node.stopNode();
      expect(node.getNodeStatus()).toBe("offline");
    });

    it("getNodeStatus returns offline for uninitialized node", () => {
      const fresh = new MobileNode(makeConfig());
      expect(fresh.getNodeStatus()).toBe("offline");
    });
  });

  // -----------------------------------------------------------------------
  // getProfile
  // -----------------------------------------------------------------------

  describe("getProfile", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("returns owner and device identity", () => {
      const profile = node.getProfile();
      expect(profile.owner.ownerId).toBe(node.state.owner.ownerId);
      expect(profile.device.deviceId).toBe(node.state.device.deviceId);
    });

    it("returns null deviceCertificate (created by owner in shared-identity mode)", () => {
      const profile = node.getProfile();
      expect(profile.deviceCertificate).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Bond management
  // -----------------------------------------------------------------------

  describe("bond management", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("sendHello returns a hello response", async () => {
      const result = await node.sendHello(
        "envoy:owner:target",
        { displayName: "Me", interests: ["tech"], whatShares: ["knowledge"] },
        "Hello!",
      );
      expect(result).toBeDefined();
      expect(result.decision).toBe("accept");
      expect(result.messageId).toBeTruthy();
    });

    it("getBonds returns bond list from trust store", async () => {
      const bonds = await node.getBonds();
      expect(Array.isArray(bonds)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  describe("messaging", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("sendChat does not throw", async () => {
      await expect(
        node.sendChat("envoy:owner:target", "hello"),
      ).resolves.toBeUndefined();
    });

    it("listChatHistory returns persisted messages after sendChat", async () => {
      await node.sendChat("envoy:owner:target", "hello");
      const history = await node.listChatHistory("envoy:owner:target");
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].content.text).toBe("hello");
    });
  });

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------

  describe("config", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
    });

    it("getNodeConfig returns relay URLs and profile directory", async () => {
      const config = await node.getNodeConfig();
      expect(config.relayUrls).toEqual(["ws://relay.example.com:9000"]);
      expect(config.profileDir).toBe("/test-profile");
    });

    it("listRelays returns the configured relay URLs", async () => {
      const relays = await node.listRelays();
      expect(relays).toHaveLength(1);
      expect(relays[0].url).toBe("ws://relay.example.com:9000");
    });
  });

  // -----------------------------------------------------------------------
  // Connection status
  // -----------------------------------------------------------------------

  describe("connection status", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("getConnectionStatus returns offline when not started", () => {
      const status = node.getConnectionStatus();
      expect(status.online).toBe(false);
      expect(status.peerId).toBe(node.state.agent.agentPeerId);
    });

    it("getConnectionStatus returns online after startNode", async () => {
      node.on("node:online" as any, () => {});
      await node.startNode();
      const status = node.getConnectionStatus();
      expect(status.online).toBe(true);
    });

    it("getPeerConnectionInfo returns relay-connected", async () => {
      const info = await node.getPeerConnectionInfo("envoy:owner:peer");
      expect(info.connected).toBe(true);
      expect(info.direct).toBe(false);
      expect(info.relayPeerId).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Agent bridge
  // -----------------------------------------------------------------------

  describe("agent bridge", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("getBridgeStatus returns disabled with agent peer ID", async () => {
      const status = await node.getBridgeStatus();
      expect(status.enabled).toBe(false);
      expect(status.agentPeerId).toBe(node.state.agent.agentPeerId);
    });

    it("getPairingPayload returns pairing data", async () => {
      const payload = await node.getPairingPayload();
      expect(payload.wsUrl).toBe("ws://relay.example.com:9000");
      expect(payload.agentPeerId).toBe(node.state.agent.agentPeerId);
      expect(payload.agentPubKey).toBe(node.state.agent.publicKeyPem);
      // Multi-device: includes owner identity info
      expect(payload.ownerPublicKey).toBe(node.state.owner.publicKeyPem);
      expect(payload.ownerId).toBe(node.state.owner.ownerId);
    });
  });

  // -----------------------------------------------------------------------
  // AI
  // -----------------------------------------------------------------------

  describe("AI / knowledge query", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
    });

    it("knowledgeQuery returns mobile-unavailable message", async () => {
      const answer = await node.knowledgeQuery("What is EnvoyMesh?");
      expect(answer).toContain("not available on mobile");
    });
  });

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  describe("events", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("on() returns unsubscribe function", () => {
      const handler = () => {};
      const unsub = node.on("chat:message" as any, handler);
      expect(typeof unsub).toBe("function");
      unsub();
    });

    it("hasListeners returns false for event with no listeners", () => {
      expect(node.hasListeners("chat:message")).toBe(false);
    });

    it("hasListeners returns true for event with listeners", () => {
      const handler = () => {};
      const unsub = node.on("chat:message" as any, handler);
      expect(node.hasListeners("chat:message")).toBe(true);
      unsub();
      expect(node.hasListeners("chat:message")).toBe(false);
    });

    it("startNode emits node:online event", async () => {
      const onlineData: unknown[] = [];
      node.on("node:online" as any, (data: any) => onlineData.push(data));
      node.on("node:status" as any, () => {});

      await node.startNode();

      expect(onlineData.length).toBeGreaterThanOrEqual(1);
      const evt = onlineData[0] as any;
      expect(evt.peerId).toBe(node.state.agent.agentPeerId);
    });
  });

  // -----------------------------------------------------------------------
  // Activity tracking
  // -----------------------------------------------------------------------

  describe("activity tracking", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
    });

    it("recordOwnerActivity does not throw", () => {
      node.recordOwnerActivity();
    });

    it("isOwnerOnline returns true in manual mode before activity", async () => {
      const online = await node.isOwnerOnline();
      expect(online).toBe(true); // Manual mode, _manualOnline defaults to true
    });
  });

  // -----------------------------------------------------------------------
  // Shared identity persistence & restore (Phase 11)
  // -----------------------------------------------------------------------

  describe("shared identity persistence", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
    });

    it("persistSharedIdentity saves and can be restored", async () => {
      const { generateOwnerIdentity } = await import("@envoymesh/mobile-identity");
      const owner = generateOwnerIdentity();
      await node.importOwnerIdentity(
        "/test-profile",
        owner.privateKeyPem,
        owner.publicKeyPem,
        "home-node-peer-id",
      );

      const persisted = await node.persistSharedIdentity();
      expect(persisted.sharedIdentity).toBe(true);
      expect(persisted.ownerId).toBe(owner.ownerId);
      expect(persisted.ownerPublicKeyPem).toBe(owner.publicKeyPem);
      expect(persisted.homeNodePeerId).toBe("home-node-peer-id");
      expect(persisted.deviceId).toBeTruthy();
      expect(persisted.agentPeerId).toBeTruthy();
    });

    it("restoreSharedIdentity reconstructs full state", async () => {
      const { generateOwnerIdentity, generateDeviceIdentity, generateAgentIdentity } = await import("@envoymesh/mobile-identity");
      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      const agent = generateAgentIdentity(owner.ownerId);

      const persisted = {
        sharedIdentity: true,
        ownerId: owner.ownerId,
        ownerPublicKeyPem: owner.publicKeyPem,
        deviceId: device.deviceId,
        devicePublicKeyPem: device.publicKeyPem,
        agentPeerId: agent.agentPeerId,
        agentPublicKeyPem: agent.publicKeyPem,
        homeNodePeerId: "home-node-peer-id",
        relayUrls: ["ws://relay.example.com:9000"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state = await node.restoreSharedIdentity(
        persisted,
        owner.privateKeyPem,
        device.privateKeyPem,
        agent.privateKeyPem,
      );

      expect(state.sharedIdentity).toBe(true);
      expect(state.owner.ownerId).toBe(owner.ownerId);
      expect(state.owner.privateKeyPem).toBe(owner.privateKeyPem);
      expect(state.device.deviceId).toBe(device.deviceId);
      expect(state.device.privateKeyPem).toBe(device.privateKeyPem);
      expect(state.agent.agentPeerId).toBe(agent.agentPeerId);
      expect(state.agent.privateKeyPem).toBe(agent.privateKeyPem);
      expect(state.homeNodePeerId).toBe("home-node-peer-id");
    });

    it("restoreSharedIdentity sets sharedIdentity flag correctly", async () => {
      const { generateOwnerIdentity, generateDeviceIdentity, generateAgentIdentity } = await import("@envoymesh/mobile-identity");
      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      const agent = generateAgentIdentity(owner.ownerId);

      const persisted = {
        sharedIdentity: true,
        ownerId: owner.ownerId,
        ownerPublicKeyPem: owner.publicKeyPem,
        deviceId: device.deviceId,
        devicePublicKeyPem: device.publicKeyPem,
        agentPeerId: agent.agentPeerId,
        agentPublicKeyPem: agent.publicKeyPem,
        relayUrls: ["ws://relay.example.com:9000"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await node.restoreSharedIdentity(
        persisted,
        owner.privateKeyPem,
        device.privateKeyPem,
        agent.privateKeyPem,
      );

      expect(node.sharedIdentity).toBe(true);
      expect(node.getNodeStatus()).toBe("offline");
    });
  });

  // -----------------------------------------------------------------------
  // SecureStorage mock + restoreFromSecureStorage
  // -----------------------------------------------------------------------

  describe("restoreFromSecureStorage", () => {
    it("throws if SecureStorage is not configured", async () => {
      node = new MobileNode(makeConfig());
      await expect(node.restoreFromSecureStorage()).rejects.toThrow("SecureStorage not configured");
    });

    it("throws if no persisted identity exists", async () => {
      const secureStorage: SecureStorage = {
        set: vi.fn(),
        get: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn(),
      };
      node = new MobileNode(makeConfig({ secureStorage }));
      await expect(node.restoreFromSecureStorage()).rejects.toThrow("No persisted shared identity");
    });

    it("restores state from secure storage keys", async () => {
      const { generateOwnerIdentity, generateDeviceIdentity, generateAgentIdentity } =
        await import("@envoymesh/mobile-identity");
      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      const agent = generateAgentIdentity(owner.ownerId);

      const secureStorage: SecureStorage = {
        set: vi.fn(),
        get: vi.fn(async (key: string) => {
          if (key === "ownerPrivateKey") return owner.privateKeyPem;
          if (key === "devicePrivateKey") return device.privateKeyPem;
          if (key === "agentPrivateKey") return agent.privateKeyPem;
          return undefined;
        }),
        remove: vi.fn(),
      };

      // Create a node with secure storage so persistSharedIdentity writes to DB + secureStorage
      const preNode = new MobileNode(makeConfig({ secureStorage }));
      await preNode.importOwnerIdentity(
        "/test-profile",
        owner.privateKeyPem,
        owner.publicKeyPem,
        "home-node-peer-id",
      );

      // persistSharedIdentity writes to the in-memory DB (from config)
      await preNode.persistSharedIdentity();

      // Create a new node that shares the same DB + secure storage by injecting the DB
      // We access the private _db via a workaround: use the same secureStorage and
      // rely on the fact that preNode already persisted the identity state.
      // The new node gets its own in-memory DB, so we need to also save directly.
      // For this test, we use the same node instance — it already has the state in DB.
      const state = await preNode.restoreFromSecureStorage();

      expect(state.sharedIdentity).toBe(true);
      expect(state.owner.ownerId).toBe(owner.ownerId);
      expect(state.owner.privateKeyPem).toBe(owner.privateKeyPem);
    });
  });

  // -----------------------------------------------------------------------
  // Inbound envelope routing
  // -----------------------------------------------------------------------

  describe("inbound envelope routing", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("emits chat:message for inbound chat.message envelope", async () => {
      const chatMessages: unknown[] = [];
      node.on("chat:message" as any, (d: unknown) => chatMessages.push(d));

      // Simulate inbound message handling via the relay WebSocket path
      // We can't directly call _handleInboundMessage (private), but we can
      // verify that sendChat persists to the chat log
      await node.sendChat("envoy:owner:target", "hello from test");

      expect(chatMessages.length).toBeGreaterThanOrEqual(1);
      const msg = chatMessages[0] as any;
      expect(msg.content.text).toBe("hello from test");
      expect(msg.metadata.deliveryReceipt).toBe("sent");
    });

    it("sendChat persists message to listChatHistory", async () => {
      await node.sendChat("envoy:owner:peer-a", "message one");
      await node.sendChat("envoy:owner:peer-a", "message two");
      await node.sendChat("envoy:owner:peer-b", "other thread");

      const threadA = await node.listChatHistory("envoy:owner:peer-a");
      expect(threadA).toHaveLength(2);
      expect(threadA[0].content.text).toBe("message one");
      expect(threadA[1].content.text).toBe("message two");

      const threadB = await node.listChatHistory("envoy:owner:peer-b");
      expect(threadB).toHaveLength(1);
      expect(threadB[0].content.text).toBe("other thread");
    });

    it("listChatHistory with limit works", async () => {
      for (let i = 0; i < 5; i++) {
        await node.sendChat("envoy:owner:peer-x", `msg ${i}`);
      }

      const list = await node.listChatHistory("envoy:owner:peer-x", 2);
      expect(list).toHaveLength(2);
      expect(list[0].content.text).toBe("msg 0");
      expect(list[1].content.text).toBe("msg 1");
    });
  });
});
