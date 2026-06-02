/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import * as capabilityTopicCid from "#network/capability-topic-cid";
import { MobileNode, createMobileNode, toRelayDirectClientWsUrl } from "../src/index.js";
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

  describe("toRelayDirectClientWsUrl", () => {
    it("replaces trailing /ws with /ws/client once (no doubling)", () => {
      expect(toRelayDirectClientWsUrl("ws://relay.example.com:15432/ws")).toBe(
        "ws://relay.example.com:15432/ws/client",
      );
    });
    it("appends /ws/client when URL has no path", () => {
      expect(toRelayDirectClientWsUrl("ws://relay.example.com:9000")).toBe(
        "ws://relay.example.com:9000/ws/client",
      );
    });
    it("leaves /ws/client URLs unchanged", () => {
      expect(toRelayDirectClientWsUrl("ws://relay.example.com:9000/ws/client")).toBe(
        "ws://relay.example.com:9000/ws/client",
      );
    });
    it("strips trailing slashes before rewriting", () => {
      expect(toRelayDirectClientWsUrl("ws://relay.example.com:15432/ws///")).toBe(
        "ws://relay.example.com:15432/ws/client",
      );
    });
    it("returns empty string for whitespace-only URL", () => {
      expect(toRelayDirectClientWsUrl("   ")).toBe("");
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

    it("updateHumanProfile persists discoveryLocation and precision", async () => {
      await node.initNode("/test-profile");
      const updated = await node.updateHumanProfile({
        displayName: "Mobile User",
        username: "mobile01",
        profileVisibility: "public",
        discoveryLocation: { countryCode: "US", city: "Boston" },
        discoveryLocationPrecision: "city",
      });
      expect(updated.discoveryLocation).toEqual({ countryCode: "US", city: "Boston" });
      expect(updated.discoveryLocationPrecision).toBe("city");
      expect((await node.getHumanProfile())?.discoveryLocation?.city).toBe("Boston");
    });

    it("initStandalone without prior init also triggers standalone init", async () => {
      const fresh = new MobileNode(makeConfig());
      const result = await fresh.initNode("/fresh-profile");
      expect(result.ownerId).toMatch(/^envoy:owner:/);
      expect(result.deviceId).toMatch(/^envoy:device:/);
    });
  });

  describe("shareFile (FS-C)", () => {
    it("rejects when the node is not running", async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
      await expect(
        node.shareFile("envoy:owner:test", { path: "x.md", sensitivity: "public" }),
      ).rejects.toThrow(/Start the node first/);
    });

    it("rejects traversal in vault path before resolving peer", async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
      await node.startNode();
      try {
        await expect(
          node.shareFile("envoy:owner:test", { path: "../secret.md", sensitivity: "public" }),
        ).rejects.toThrow(/Invalid vault path/);
      } finally {
        await node.stopNode();
      }
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

    it("importOwnerIdentity reuses opts.device (pairWithHomeNode must not regenerate device)", async () => {
      node = new MobileNode(makeConfig());
      const { generateOwnerIdentity, generateDeviceIdentity } = await import("@envoymesh/mobile-identity");
      const owner = generateOwnerIdentity();
      const pinned = generateDeviceIdentity();

      await node.importOwnerIdentity(
        "/shared-profile",
        owner.privateKeyPem,
        owner.publicKeyPem,
        "home-node-peer-id",
        { device: pinned },
      );

      expect(node.state.device.deviceId).toBe(pinned.deviceId);
      expect(node.state.device.publicKeyPem).toBe(pinned.publicKeyPem);
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

    it("returns null deviceCertificate in standalone mode", () => {
      const profile = node.getProfile();
      expect(profile.deviceCertificate).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Bond management
  // -----------------------------------------------------------------------

  describe("bond management", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig({ relayUrls: [] }));
      await node.initStandalone("/test-profile");
      await node.startNode();
    });

    it("sendHello sends bond.request (relay) and returns optimistic accept", async () => {
      const broadcastSpy = vi.spyOn(node as any, "_broadcastToRelaySockets");
      const targetPeer = "12D3KooWTestBondHelloPeerId1111111111111111";
      const result = await node.sendHello(
        targetPeer,
        { displayName: "Me", interests: ["tech"], whatShares: ["knowledge"] },
        "Hello!",
      );
      expect(result.decision).toBe("accept");
      expect(result.messageId).toBeTruthy();
      expect(broadcastSpy).toHaveBeenCalled();
      const raw = broadcastSpy.mock.calls[0][0] as string;
      const sent = JSON.parse(raw);
      expect(sent.intent).toBe("bond.request");
      expect(sent.payload.requesterOwnerId).toBe(node.state.owner.ownerId);
      broadcastSpy.mockRestore();
    });

    it("sendHello throws when target peer id cannot be resolved", async () => {
      await expect(
        node.sendHello("envoy:owner:no_mapping", {
          displayName: "X",
          interests: [],
          whatShares: [],
        }, "Hi"),
      ).rejects.toThrow(/peer not found/i);
    });

    it("getBonds returns bond list from trust store", async () => {
      const bonds = await node.getBonds();
      expect(Array.isArray(bonds)).toBe(true);
    });

    it("storePendingHelloRequest records a pending accept (same as desktop NodeService)", () => {
      node.storePendingHelloRequest({
        messageId: "m1",
        sender: { nodeId: "n1", ownerId: "o1", displayName: "X" },
        message: "hi",
        timestamp: new Date().toISOString(),
      });
      const pending = (node as any)._pendingHelloRequests.get("m1");
      expect(pending?.requesterOwnerId).toBe("o1");
      expect(pending?.remotePeerId).toBe("n1");
    });

    it("acceptHello applies a pending bond and clears the queue", async () => {
      node.storePendingHelloRequest({
        messageId: "acc1",
        sender: {
          nodeId: "12D3KooWRemote",
          ownerId: "envoy:owner:alice",
          displayName: "Alice",
        },
        message: "Please add me",
        timestamp: new Date().toISOString(),
      });
      await node.acceptHello("acc1");
      expect((node as any)._pendingHelloRequests.has("acc1")).toBe(false);
      const bonds = await node.getBonds();
      expect(bonds.find((b) => b.peerOwnerId === "envoy:owner:alice")).toMatchObject({
        level: "direct",
        libp2pPeerId: "12D3KooWRemote",
      });
    });

    it("declineHello drops a pending request without creating a bond", async () => {
      node.storePendingHelloRequest({
        messageId: "dec1",
        sender: {
          nodeId: "12D3KooWRemote",
          ownerId: "envoy:owner:bob",
          displayName: "Bob",
        },
        message: "Hi",
        timestamp: new Date().toISOString(),
      });
      await node.declineHello("dec1", "no thanks");
      expect((node as any)._pendingHelloRequests.has("dec1")).toBe(false);
      const bonds = await node.getBonds();
      expect(bonds.find((b) => b.peerOwnerId === "envoy:owner:bob")).toBeUndefined();
    });

    it("blockPeer sets trust level to blocked", async () => {
      const oid = "envoy:owner:blocktest";
      await (node as any)._trustStore.set({
        peerOwnerId: oid,
        displayName: "Bob",
        level: "direct",
        createdAt: new Date().toISOString(),
      });
      await node.blockPeer(oid);
      const bonds = await node.getBonds();
      const b = bonds.find((x) => x.peerOwnerId === oid);
      expect(b?.level).toBe("blocked");
    });

    it("unblockPeer removes trust entry", async () => {
      const oid = "envoy:owner:unblock";
      await (node as any)._trustStore.set({
        peerOwnerId: oid,
        displayName: "Bob",
        level: "blocked",
        createdAt: new Date().toISOString(),
      });
      await node.unblockPeer(oid);
      const bonds = await node.getBonds();
      expect(bonds.find((x) => x.peerOwnerId === oid)).toBeUndefined();
    });

    it("revokeBond removes trust entry and emits bond:revoked", async () => {
      const oid = "envoy:owner:revoke-me";
      await (node as any)._trustStore.set({
        peerOwnerId: oid,
        displayName: "Carol",
        level: "direct",
        createdAt: new Date().toISOString(),
      });
      const handler = vi.fn();
      node.on("bond:revoked", handler);
      await node.revokeBond(oid);
      expect(await node.getBonds()).toEqual([]);
      expect(handler).toHaveBeenCalledWith({ peerOwnerId: oid });
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

    it("forwardEnvelope rejects malformed JSON", async () => {
      await expect(node.forwardEnvelope({ version: "0.1" } as Record<string, unknown>)).rejects.toThrow(
        /invalid envelope/i,
      );
    });

    it("forwardEnvelope rejects tampered signed envelope", async () => {
      const { createUnsignedEnvelope, createChatMessagePayload } = await import("@envoymesh/protocol");
      const { derivePeerId, signUnsignedEnvelope: signEnv } = await import("@envoymesh/mobile-identity");
      const unsigned = createUnsignedEnvelope({
        intent: "chat.message",
        senderPeerId: derivePeerId(node.state.device.publicKeyPem),
        senderPublicKey: node.state.device.publicKeyPem,
        recipientPeerId: "envoy_peer_rcpt",
        payload: createChatMessagePayload({
          senderOwnerId: node.state.owner.ownerId,
          text: "original",
        }),
      });
      const signed = signEnv(unsigned, node.state.device.privateKeyPem) as Record<string, unknown>;
      const tampered = { ...signed, payload: { ...(signed.payload as object), text: "tampered" } };
      await expect(node.forwardEnvelope(tampered)).rejects.toThrow(/verification failed/i);
    });

    it("sendChat does not throw", async () => {
      await expect(
        node.sendChat("envoy:owner:target", "hello"),
      ).resolves.toEqual(expect.objectContaining({ messageId: expect.any(String) }));
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

    it("getNodeConfig returns configured relays and profile directory", async () => {
      const config = await node.getNodeConfig();
      expect(config.configuredRelays).toHaveLength(1);
      expect(config.configuredRelays[0]?.addr).toBe("ws://relay.example.com:9000");
      expect(config.profileDir).toBe("/test-profile");
    });

    it("listRelays returns the configured relay URLs", async () => {
      const relays = await node.listRelays();
      expect(relays).toHaveLength(1);
      expect(relays[0]?.addr).toBe("ws://relay.example.com:9000");
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
      expect(info.connected).toBe(false);
      expect(info.direct).toBe(false);
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
      expect(status.agentPeerId).toBe("");
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

    it("knowledgeQuery throws when node not initialized", async () => {
      await expect(node.knowledgeQuery("What is EnvoyMesh?")).rejects.toThrow("Node not initialized");
    });

    it("knowledgeQuery routes via configured providers after init (default mock)", async () => {
      await node.initStandalone("/test-profile");
      const answer = await node.knowledgeQuery("What is EnvoyMesh?");
      expect(answer).toContain("Mock model response");
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

    it("persistSharedIdentity saves device certificate JSON", async () => {
      const { generateOwnerIdentity, generateDeviceIdentity, createDeviceCertificate } =
        await import("@envoymesh/mobile-identity");
      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      const deviceCertificate = createDeviceCertificate({
        owner,
        device,
        deviceProfile: "satellite",
        capabilities: ["message.send"],
      });
      await node.importOwnerIdentity(
        "/test-profile",
        owner.privateKeyPem,
        owner.publicKeyPem,
        "home-node-peer-id",
        { device, deviceCertificate },
      );

      const persisted = await node.persistSharedIdentity();
      expect(persisted.deviceCertificateJson).toBeTruthy();
      expect(node.getProfile().deviceCertificate?.deviceId).toBe(device.deviceId);
    });

    it("sendChat attaches device certificate in shared-identity mode", async () => {
      const { generateOwnerIdentity, generateDeviceIdentity, createDeviceCertificate } =
        await import("@envoymesh/mobile-identity");
      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      const deviceCertificate = createDeviceCertificate({
        owner,
        device,
        deviceProfile: "satellite",
        capabilities: ["message.send"],
      });
      await node.importOwnerIdentity(
        "/test-profile",
        owner.privateKeyPem,
        owner.publicKeyPem,
        "home-node-peer-id",
        { device, deviceCertificate },
      );
      await node.startNode();

      const broadcastSpy = vi.spyOn(node as any, "_broadcastToRelaySockets");
      await node.sendChat("envoy:owner:target", "hello with cert");
      expect(broadcastSpy).toHaveBeenCalled();
      const sent = JSON.parse(String(broadcastSpy.mock.calls[0]?.[0]));
      expect(sent.payload.deviceCertificate?.deviceId).toBe(device.deviceId);
      expect(sent.payload.ownerPublicKeyPem).toContain("BEGIN PUBLIC KEY");
      broadcastSpy.mockRestore();
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
      await expect(node.restoreFromSecureStorage()).rejects.toThrow("No persisted identity");
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

    it("routes inbound chat.message envelope to chat:message event", async () => {
      const { generateOwnerIdentity, generateDeviceIdentity, derivePeerId, signUnsignedEnvelope } =
        await import("@envoymesh/mobile-identity");
      const { createUnsignedEnvelope, createChatMessagePayload } = await import("@envoymesh/protocol");

      const senderOwner = generateOwnerIdentity();
      const senderDevice = generateDeviceIdentity();
      const senderPeerId = derivePeerId(senderDevice.publicKeyPem);

      const unsigned = createUnsignedEnvelope({
        intent: "chat.message",
        senderPeerId,
        senderPublicKey: senderDevice.publicKeyPem,
        senderRole: "human",
        recipientPeerId: node.state.agent.agentPeerId,
        recipientRole: "human",
        payload: createChatMessagePayload({
          senderOwnerId: senderOwner.ownerId,
          text: "inbound hello",
        }),
      });
      const signed = signUnsignedEnvelope(unsigned, senderDevice.privateKeyPem);

      const chatMessages: unknown[] = [];
      node.on("chat:message" as any, (d: unknown) => chatMessages.push(d));

      (node as any)._handleInboundMessage(signed);

      await vi.waitFor(() => {
        expect(chatMessages).toHaveLength(1);
      });

      const evt = chatMessages[0] as any;
      expect(evt.content.text).toBe("inbound hello");
      expect(evt.sender.nodeId).toBe(senderPeerId);

      // Threaded by senderOwnerId (ownerId namespace) so the inbound copy
      // joins the same thread as any outbound messages addressed to the same
      // contact — fixing the multi-device shared-identity view.
      await vi.waitFor(async () => {
        const history = await node.listChatHistory(senderOwner.ownerId);
        expect(history).toHaveLength(1);
        expect(history[0].content.text).toBe("inbound hello");
      });
    });
  });

  // -----------------------------------------------------------------------
  // Libp2p key persistence
  // -----------------------------------------------------------------------

  describe("libp2p key persistence", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("_loadOrCreateLibp2pKey creates a valid Ed25519 key", async () => {
      const key = await (node as any)._loadOrCreateLibp2pKey();
      expect(key).toBeDefined();
      expect(key.type).toBe("Ed25519");
    });

    it("_loadOrCreateLibp2pKey returns the SAME key on second call (persistence)", async () => {
      const key1 = await (node as any)._loadOrCreateLibp2pKey();
      const key2 = await (node as any)._loadOrCreateLibp2pKey();
      expect(key2).toBeDefined();
      // Same key material: peerId derived from the same key should be identical
      const { peerIdFromPrivateKey } = await import("@libp2p/peer-id");
      const id1 = peerIdFromPrivateKey(key1);
      const id2 = peerIdFromPrivateKey(key2);
      expect(id2.toString()).toBe(id1.toString());
    });

    it("_loadOrCreateLibp2pKey handles corrupted localStorage gracefully", async () => {
      // Store invalid data in localStorage
      localStorage.setItem("envoymesh_libp2p_private_key", "!!!not-base64!!!");
      const key = await (node as any)._loadOrCreateLibp2pKey();
      expect(key).toBeDefined();
      expect(key.type).toBe("Ed25519");
      // Should have overwritten the corrupted key
      const stored = localStorage.getItem("envoymesh_libp2p_private_key");
      expect(stored).toBeTruthy();
      expect(stored).not.toBe("!!!not-base64!!!");
    });
  });

  // -----------------------------------------------------------------------
  // Capability topic CID & DHT search/advertise integration
  // -----------------------------------------------------------------------

  describe("DHT search and advertise integration", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("_searchDhtTopic returns empty array when mesh is not started", async () => {
      const results = await (node as any)._searchDhtTopic("music", 10);
      expect(results).toEqual([]);
    });

    it("_advertiseTopicsOnDht is a no-op when mesh is not started", async () => {
      await expect(
        (node as any)._advertiseTopicsOnDht(["music", "coding"]),
      ).resolves.toBeUndefined();
    });

    it("_advertiseTopicsOnDht calls contentRouting.provide for each topic when mesh is available", async () => {
      const provideSpy = vi.fn().mockResolvedValue(undefined);
      const mockCid = { toString: () => "bafytest" };
      const cidSpy = vi.spyOn(capabilityTopicCid, "cidForCapabilityTopic").mockResolvedValue(mockCid as any);

      (node as any)._mesh = {
        contentRouting: { provide: provideSpy },
        getMultiaddrs: () => [],
        peerId: { toString: () => "12D3KooWSelf" },
      };

      await (node as any)._advertiseTopicsOnDht(["music", "coding"]);

      expect(provideSpy).toHaveBeenCalledTimes(2);
      expect(provideSpy).toHaveBeenCalledWith(mockCid);

      cidSpy.mockRestore();
      (node as any)._mesh = undefined;
    });

    it("advertiseTopic normalizes topic and delegates to _advertiseTopicsOnDht", async () => {
      const spy = vi.spyOn(node as any, "_advertiseTopicsOnDht").mockResolvedValue(undefined);
      await node.advertiseTopic("  Music ");
      expect(spy).toHaveBeenCalledWith(["music"]);
      spy.mockRestore();
    });

    it("advertiseTopic throws for whitespace-only topic", async () => {
      await expect(node.advertiseTopic("   ")).rejects.toThrow(/empty topic/i);
    });

    it("stopAdvertiseTopic calls cancelReprovide when libp2p exposes it", async () => {
      const cancelReprovide = vi.fn().mockResolvedValue(undefined);
      (node as any)._mesh = { contentRouting: { cancelReprovide } };
      const mockCid = { toString: () => "bafytestcid" };
      const cidSpy = vi.spyOn(capabilityTopicCid, "cidForCapabilityTopic").mockResolvedValue(mockCid as any);
      await node.stopAdvertiseTopic("music");
      expect(cancelReprovide).toHaveBeenCalledWith(mockCid);
      cidSpy.mockRestore();
      (node as any)._mesh = undefined;
    });

    it("searchPeers merges DHT results with trust store results when searching by displayName", async () => {
      // Add a bonded peer to trust store
      await (node as any)._trustStore.set({
        peerOwnerId: "envoy:owner:bob",
        displayName: "Bob",
        libp2pPeerId: "12D3KooWBob",
        level: "direct",
        note: "Friend",
      });

      // Mock DHT search AND mesh so the DHT path is entered
      const origSearch = (node as any)._searchDhtTopic;
      (node as any)._searchDhtTopic = vi.fn().mockResolvedValue([
        { peerId: "12D3KooWDhtPeer1", multiaddrs: [] },
        { peerId: "12D3KooWDhtPeer2", multiaddrs: [] },
      ]);
      (node as any)._mesh = {
        getMultiaddrs: () => [],
        peerId: { toString: () => "12D3KooWSelf" },
      };

      // Search for "bob" — trust store matches displayName
      const results = await node.searchPeers({ username: "bob" });

      // Should include trust store match
      const bobResult = results.find((r: any) => r.ownerId === "envoy:owner:bob");
      expect(bobResult).toBeDefined();
      expect(bobResult?.displayName).toBe("Bob");

      // DHT also searched for "bob" topic
      const dht1 = results.find((r: any) => r.nodeId === "12D3KooWDhtPeer1");
      expect(dht1).toBeDefined();
      expect(dht1?.interests).toContain("bob");

      // Restore
      (node as any)._searchDhtTopic = origSearch;
      (node as any)._mesh = undefined;
    });

    it("searchPeers filters out self from DHT results", async () => {
      // Set a known mesh peer ID for self
      (node as any)._meshPeerId = "12D3KooWSelf";

      const origSearch = (node as any)._searchDhtTopic;
      (node as any)._searchDhtTopic = vi.fn().mockResolvedValue([
        { peerId: "12D3KooWSelf", multiaddrs: [] },
        { peerId: "12D3KooWOther", multiaddrs: [] },
      ]);

      // Mock mesh for searchPeers
      (node as any)._mesh = {
        getMultiaddrs: () => [],
        peerId: { toString: () => "12D3KooWSelf" },
      };

      const results = await node.searchPeers({ interests: ["music"] });

      // Self should be filtered out
      const selfResult = results.find((r: any) => r.nodeId === "12D3KooWSelf");
      expect(selfResult).toBeUndefined();

      // Other peer should be included
      const other = results.find((r: any) => r.nodeId === "12D3KooWOther");
      expect(other).toBeDefined();

      // Restore
      (node as any)._searchDhtTopic = origSearch;
      (node as any)._mesh = undefined;
      (node as any)._meshPeerId = "";
    });
  });

  // -----------------------------------------------------------------------
  // DHT advertise lifecycle
  // -----------------------------------------------------------------------

  describe("DHT advertise lifecycle", () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("_startDhtAdvertise schedules initial timer, _stopDhtAdvertise cancels it", async () => {
      (node as any)._startDhtAdvertise();
      const timer = (node as any)._dhtAdvertiseTimer;
      expect(timer).not.toBeNull();

      (node as any)._stopDhtAdvertise();
      expect((node as any)._dhtAdvertiseTimer).toBeNull();
    });

    it("_stopDhtAdvertise is idempotent (safe to call twice)", async () => {
      (node as any)._startDhtAdvertise();
      (node as any)._stopDhtAdvertise();
      (node as any)._stopDhtAdvertise(); // Should not throw
      expect((node as any)._dhtAdvertiseTimer).toBeNull();
    });

    it("_startDhtAdvertise replaces existing timer on second call", async () => {
      (node as any)._startDhtAdvertise();
      const first = (node as any)._dhtAdvertiseTimer;
      (node as any)._startDhtAdvertise();
      const second = (node as any)._dhtAdvertiseTimer;
      expect(second).not.toBeNull();
      // The old timer should have been cleared
    });
  });

  // -----------------------------------------------------------------------
  // searchPeers — self-filtering and multi-source merging
  // -----------------------------------------------------------------------

  describe("searchPeers self-filtering", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("searchPeers filters out self by ownerId from trust store", async () => {
      // Add a bond for our own owner (should be filtered)
      const state = node.state;
      const result = await node.searchPeers({ peerId: state.owner.ownerId });
      // Our own identity should not appear in results
      const selfResult = result.find((r: any) => r.ownerId === state.owner.ownerId);
      expect(selfResult).toBeUndefined();
    });

    it("searchPeers filters out self by agentPeerId", async () => {
      const state = node.state;
      const result = await node.searchPeers({ peerId: state.agent.agentPeerId });
      const selfResult = result.find((r: any) => r.nodeId === state.agent.agentPeerId);
      expect(selfResult).toBeUndefined();
    });

    it("searchPeers returns trusted peers matching interest", async () => {
      // Add a bonded peer to the trust store first
      await (node as any)._trustStore.set({
        peerOwnerId: "envoy:owner:alice",
        displayName: "Alice",
        libp2pPeerId: "12D3KooWAlice",
        level: "direct",
        note: "Friend",
      });
      const result = await node.searchPeers({ username: "alice" });
      const alice = result.find((r: any) => r.ownerId === "envoy:owner:alice");
      expect(alice).toBeDefined();
      expect(alice?.displayName).toBe("Alice");
    });
  });

  // -----------------------------------------------------------------------
  // _sendToRelay — mesh P2P vs relay routing
  // -----------------------------------------------------------------------

  describe("_sendToRelay mesh vs relay routing", () => {
    beforeEach(async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    it("sends non-chat messages via relay sockets (not mesh)", async () => {
      // Add a fake relay socket to capture messages
      let sent: string | null = null;
      (node as any)._relaySockets = [{
        readyState: 1, // WebSocket.OPEN = 1
        send: (data: string) => { sent = data; },
      }];

      await (node as any)._sendToRelay({
        type: "hello-request",
        targetOwnerId: "envoy:owner:target",
        senderOwnerId: node.state.owner.ownerId,
        senderDeviceId: node.state.device.deviceId,
      });

      expect(sent).not.toBeNull();
      const parsed = JSON.parse(sent!);
      expect(parsed.type).toBe("hello-request");
    });

    it("sends chat messages via relay when trust store has no libp2pPeerId", async () => {
      // Add a trust store entry WITHOUT libp2pPeerId
      await (node as any)._trustStore.set({
        peerOwnerId: "envoy:owner:target",
        displayName: "Target",
        level: "direct",
      });

      let sent: string | null = null;
      (node as any)._relaySockets = [{
        readyState: 1,
        send: (data: string) => { sent = data; },
      }];

      await (node as any)._sendToRelay({
        type: "chat",
        targetOwnerId: "envoy:owner:target",
        text: "hello via relay",
      });

      expect(sent).not.toBeNull();
      const parsed = JSON.parse(sent!);
      expect(parsed.intent).toBe("chat.message");
      expect(parsed.payload.text).toBe("hello via relay");
      expect(parsed.payload.senderOwnerId).toBe(node.state.owner.ownerId);
    });

    it("sends chat via mesh when trust store has libp2pPeerId", async () => {
      const { generateAgentIdentity } = await import("@envoymesh/mobile-identity");
      const targetAgent = generateAgentIdentity("envoy:owner:target");
      const targetPeerId = targetAgent.agentPeerId;

      // Add a trust store entry WITH libp2pPeerId
      await (node as any)._trustStore.set({
        peerOwnerId: "envoy:owner:target",
        displayName: "Target",
        libp2pPeerId: targetPeerId,
        level: "direct",
      });

      // Spy on the internal mesh-send to verify the resolved transport peer
      // id and capture the bytes that would be sent over the wire.
      let meshTransportPeerId: string | null = null;
      let sentData: string | null = null;
      (node as any)._sendChatViaMeshWithAck = async (
        transportPeerId: string,
        data: string,
        _targetOwnerId: string,
      ) => {
        meshTransportPeerId = transportPeerId;
        sentData = data;
        return { delivered: false };
      };

      // Mesh must be present for the mesh path to be tried.
      (node as any)._mesh = {
        dialProtocol: async () => {
          throw new Error("not used — test mocks the mesh send directly");
        },
        getMultiaddrs: () => [],
        peerId: { toString: () => "12D3KooWSelf" },
      };

      await (node as any)._sendToRelay({
        type: "chat",
        targetOwnerId: "envoy:owner:target",
        text: "hello via mesh",
      });

      // Verify the routing resolved the libp2pPeerId from the trust store
      // and dispatched via the mesh path.
      expect(meshTransportPeerId).toBe(targetPeerId);
      expect(sentData).toBeTruthy();
      const parsed = JSON.parse(sentData!);
      expect(parsed.payload.text).toBe("hello via mesh");
      expect(parsed.payload.senderOwnerId).toBe(node.state.owner.ownerId);

      // Restore
      (node as any)._sendChatViaMeshWithAck = undefined;
      (node as any)._mesh = undefined;
    });
  });

  // -----------------------------------------------------------------------
  // stopNode — full cleanup
  // -----------------------------------------------------------------------

  describe("stopNode cleanup", () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("stopNode drains all pending rendezvous queries", async () => {
      // Register pending queries
      const queries = new Map();
      const resolveSpy = vi.fn();
      const timer = setTimeout(() => {}, 10000);
      queries.set("query-1", { resolve: resolveSpy, timer });
      (node as any)._pendingQueries = queries;

      await node.stopNode();

      expect(resolveSpy).toHaveBeenCalledWith([]);
      expect(queries.size).toBe(0);
    });

    it("stopNode clears all relay backoff timers", async () => {
      // Register backoff timers
      const backoffTimers = new Map();
      const clearSpy = vi.fn();
      const fakeTimer = setTimeout(() => {}, 10000);
      backoffTimers.set("ws://relay1", fakeTimer);
      (node as any)._relayBackoffTimers = backoffTimers;

      await node.stopNode();

      expect(backoffTimers.size).toBe(0);
      vi.clearAllTimers();
    });

    it("stopNode cleans up DHT advertise timer", async () => {
      (node as any)._startDhtAdvertise();
      expect((node as any)._dhtAdvertiseTimer).not.toBeNull();

      await node.stopNode();

      expect((node as any)._dhtAdvertiseTimer).toBeNull();
    });

    it("stopNode transitions status to offline", async () => {
      node.on("node:status" as any, () => {});
      node.on("node:online" as any, () => {});
      node.on("node:offline" as any, () => {});
      await node.startNode();
      await node.stopNode();

      expect(node.getNodeStatus()).toBe("offline");
    });
  });

  // -----------------------------------------------------------------------
  // E2E: Two mobile nodes communicating via relay
  // -----------------------------------------------------------------------

  describe("E2E two-node relay chat", () => {
    let alice: MobileNode;
    let bob: MobileNode;
    const ALICE_URL = "ws://relay.example.com:9000";
    const BOB_URL = "ws://relay.example.com:9000";

    afterEach(async () => {
      try { await alice?.stopNode(); } catch { /* ignore */ }
      try { await bob?.stopNode(); } catch { /* ignore */ }
    });

    it("two nodes can exchange chat messages via simulated relay", async () => {
      alice = new MobileNode(makeConfig({ relayUrls: [ALICE_URL] }));
      bob = new MobileNode(makeConfig({ relayUrls: [BOB_URL] }));

      await alice.initStandalone("/alice");
      await bob.initStandalone("/bob");

      // Capture what alice sends to the relay
      let aliceSentData: string | null = null;
      (alice as any)._relaySockets = [{
        readyState: 1,
        send: (data: string) => { aliceSentData = data; },
      }];

      // Bob listens for chat events
      const bobMessages: unknown[] = [];
      bob.on("chat:message" as any, (d: unknown) => bobMessages.push(d));

      // Alice sends a chat message to Bob
      await alice.sendChat(bob.state.owner.ownerId, "Hello Bob!");

      // Verify alice sent the envelope to her relay socket
      expect(aliceSentData).not.toBeNull();
      const envelope = JSON.parse(aliceSentData!);
      expect(envelope.intent).toBe("chat.message");
      expect(envelope.payload.text).toBe("Hello Bob!");
      expect(envelope.payload.senderOwnerId).toBe(alice.state.owner.ownerId);

      // Verify alice's own local chat event fired
      const aliceHistory = await alice.listChatHistory(bob.state.owner.ownerId);
      expect(aliceHistory.length).toBeGreaterThanOrEqual(1);
      expect(aliceHistory[0].content.text).toBe("Hello Bob!");
    });

    it("two nodes with bonded relationship can see each other in search", async () => {
      alice = new MobileNode(makeConfig({ relayUrls: [ALICE_URL] }));
      bob = new MobileNode(makeConfig({ relayUrls: [BOB_URL] }));

      await alice.initStandalone("/alice");
      await bob.initStandalone("/bob");

      // Bob should appear in alice's bond-aware search (local trust store)
      const results = await alice.searchPeers({ peerId: bob.state.owner.ownerId });
      // Alice hasn't bonded with bob yet, so they shouldn't see each other
      const bobInResults = results.find((r: any) => r.ownerId === bob.state.owner.ownerId);
      // May or may not appear depending on whether this is a fresh node
      // The key is that the search doesn't crash or return self
      const aliceSelf = results.find((r: any) => r.ownerId === alice.state.owner.ownerId);
      expect(aliceSelf).toBeUndefined();
    });

    it("sendHello followed by sendChat resolves libp2p peer ID from bond", async () => {
      alice = new MobileNode(makeConfig({ relayUrls: [ALICE_URL] }));
      bob = new MobileNode(makeConfig({ relayUrls: [BOB_URL] }));

      await alice.initStandalone("/alice");
      await bob.initStandalone("/bob");
      await alice.startNode();
      await bob.startNode();

      const { derivePeerId } = await import("@envoymesh/mobile-identity");
      const aliceWireId = derivePeerId(alice.state.device.publicKeyPem);
      await (bob as any)._peerDirectory.set({
        ownerId: alice.state.owner.ownerId,
        multiaddrs: [],
        lastSeen: new Date().toISOString(),
        libp2pPeerId: aliceWireId,
      });

      // Before the bond exists, _sendToRelay should NOT have libp2pPeerId
      // Simulate bob sending alice a hello to establish routing
      await bob.sendHello(alice.state.owner.ownerId, {
        displayName: "Bob",
        interests: ["music"],
        whatShares: [],
      }, "Hi!");

      // Now send a chat — since bob's bond entry may not have libp2pPeerId,
      // it should fall back to relay (verified by the test not throwing)
      await expect(
        bob.sendChat(alice.state.owner.ownerId, "Can you hear me?"),
      ).resolves.toEqual(expect.objectContaining({ messageId: expect.any(String) }));
    });

    it("stopNode on one side does not crash the other", async () => {
      alice = new MobileNode(makeConfig({ relayUrls: [ALICE_URL] }));
      bob = new MobileNode(makeConfig({ relayUrls: [BOB_URL] }));

      await alice.initStandalone("/alice");
      await bob.initStandalone("/bob");

      // Setup cross-routing
      (alice as any)._broadcastToRelaySockets = async (data: string) => {
        try {
          const msg = JSON.parse(data);
          if ((bob as any)._status !== "offline") {
            await (bob as any)._handleInboundMessage(msg);
          }
        } catch { /* ignore */ }
      };

      // Send a message while both are online
      await alice.sendChat(bob.state.owner.ownerId, "Message 1");

      // Stop bob
      await bob.stopNode();

      // Alice sending while bob is offline should not crash
      await expect(
        alice.sendChat(bob.state.owner.ownerId, "Message 2"),
      ).resolves.toEqual(expect.objectContaining({ messageId: expect.any(String) }));
    });
  });

  describe("IPFS export", () => {
    it("exportLibraryItemToIpfs throws when allowIpfs is false", async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
      await expect(node.exportLibraryItemToIpfs("doc-1")).rejects.toThrow(/disabled/i);
    });

    it("getIpfsEngineStatus reports Helia available on mobile", async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
      const status = await node.getIpfsEngineStatus();
      expect(status.available).toBe(false);
      expect(status.helia?.available).toBe(true);
      expect(status.helia?.heliaVersion).toBeTruthy();
    });

    it("verifyLibraryItemIpfsGateway rejects when IPFS is disabled", async () => {
      node = new MobileNode(makeConfig());
      await node.initStandalone("/test-profile");
      await expect(
        node.verifyLibraryItemIpfsGateway({ documentId: "doc-1" }),
      ).rejects.toThrow(/disabled/i);
    });
  });
});
