/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { DirectCallClient, createDirectCallClient } from "../../src/lib/direct-call-client.js";
import type { NodeService, NodeServiceEvents } from "@envoymesh/api";
import type { NodeServiceClient } from "../../src/hooks/useNodeService.js";

// ---------------------------------------------------------------------------
// Mock NodeService for testing DirectCallClient
// ---------------------------------------------------------------------------

type EventHandler = (data: unknown) => void;

class MockNodeService implements Partial<NodeService> {
  private _listeners = new Map<string, Set<EventHandler>>();

  // Identity
  getProfile = vi.fn().mockResolvedValue({ owner: { ownerId: "owner-1" }, device: { deviceId: "device-1" } });
  getHumanProfile = vi.fn().mockResolvedValue({ displayName: "Alice" });
  updateHumanProfile = vi.fn().mockResolvedValue({ displayName: "Alice Updated" });

  // Bond management
  sendHello = vi.fn().mockResolvedValue({ messageId: "msg-1", inReplyTo: "", decision: "accept", timestamp: "2026-01-01T00:00:00.000Z" });
  acceptHello = vi.fn().mockResolvedValue(undefined);
  declineHello = vi.fn().mockResolvedValue(undefined);
  blockPeer = vi.fn().mockResolvedValue(undefined);
  revokeBond = vi.fn().mockResolvedValue(undefined);
  getBonds = vi.fn().mockResolvedValue([{ peerOwnerId: "peer-1", level: "public", createdAt: "2026-01-01T00:00:00.000Z" }]);

  // Messaging
  sendChat = vi.fn().mockResolvedValue(undefined);
  listChatHistory = vi.fn().mockResolvedValue([]);
  getChatDrafts = vi.fn().mockResolvedValue([]);
  deleteChatDraft = vi.fn().mockResolvedValue(undefined);

  // Search
  searchPeers = vi.fn().mockResolvedValue([]);
  runCapabilityDiscovery = vi.fn().mockResolvedValue(undefined);
  advertiseTopic = vi.fn().mockResolvedValue(undefined);
  stopAdvertiseTopic = vi.fn().mockResolvedValue(undefined);

  // Connection status
  getConnectionStatus = vi.fn().mockResolvedValue({ online: true, peerId: "peer-1", multiaddrs: [], connectedRelays: [], bondedPeers: 0 });
  getPeerConnectionInfo = vi.fn().mockResolvedValue({ connected: true, direct: true });

  // Agent bridge
  getBridgeStatus = vi.fn().mockResolvedValue({ enabled: true, agentPeerId: "agent-1" });
  getPairingPayload = vi.fn().mockResolvedValue({ wsUrl: "ws://localhost:9001", relayPeerId: "", agentPeerId: "agent-1", agentPubKey: "pk" });
  pairWithHomeNode = vi.fn().mockResolvedValue({ sessionToken: "tok", deviceCertificate: {}, ownerId: "envoy:owner:1" });
  listAuthorizedDevices = vi.fn().mockResolvedValue({ devices: [] });
  revokeAuthorizedDevice = vi.fn().mockResolvedValue({ revocation: {} });
  listDeviceRevocations = vi.fn().mockResolvedValue({ revocations: [] });

  // AI
  knowledgeQuery = vi.fn().mockResolvedValue("AI answer");

  // Node config
  getNodeConfig = vi.fn().mockResolvedValue({ relays: [] });
  updateNodeConfig = vi.fn().mockResolvedValue(undefined);
  listRelays = vi.fn().mockResolvedValue([]);
  addRelay = vi.fn().mockResolvedValue({ url: "ws://relay:9000" });
  removeRelay = vi.fn().mockResolvedValue(undefined);

  // Node lifecycle
  initNode = vi.fn().mockResolvedValue({ profileDir: "/tmp", peerId: "peer-1", ownerId: "owner-1", deviceId: "device-1" });
  getNodeStatus = vi.fn().mockReturnValue("running");
  startNode = vi.fn().mockResolvedValue(undefined);
  stopNode = vi.fn().mockResolvedValue(undefined);

  // Events
  on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void {
    let set = this._listeners.get(event as string);
    if (!set) {
      set = new Set();
      this._listeners.set(event as string, set);
    }
    const h = handler as EventHandler;
    set.add(h);
    return () => { set?.delete(h); };
  }

  /** Simulate an event for testing */
  emitEvent(event: string, data: unknown): void {
    const set = this._listeners.get(event);
    if (set) {
      for (const handler of set) {
        try { handler(data); } catch { /* ignore */ }
      }
    }
  }

  /** Reset all spy calls */
  reset() {
    vi.clearAllMocks();
    this._listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DirectCallClient", () => {
  let mockNode: MockNodeService;
  let client: NodeServiceClient;

  beforeEach(() => {
    mockNode = new MockNodeService();
    client = new DirectCallClient(mockNode as unknown as NodeService);
  });

  describe("connection", () => {
    it("is not connected before connect()", () => {
      const fresh = new DirectCallClient(mockNode as unknown as NodeService);
      expect(fresh.isConnected).toBe(false);
      expect(fresh.isReady).toBe(false);
    });

    it("is connected and ready after connect()", async () => {
      await client.connect();
      expect(client.isConnected).toBe(true);
      expect(client.isReady).toBe(true);
    });

    it("is disconnected after disconnect()", async () => {
      await client.connect();
      client.disconnect();
      expect(client.isConnected).toBe(false);
      expect(client.isReady).toBe(false);
    });

    it("reconnect calls disconnect then connect", async () => {
      await client.connect();
      const spy = vi.spyOn(client, "disconnect");
      const connectSpy = vi.spyOn(client, "connect");
      await client.reconnect();
      expect(spy).toHaveBeenCalled();
      expect(connectSpy).toHaveBeenCalled();
      expect(client.isConnected).toBe(true);
    });

    it("reconnectAttempts is always 0 (no network reconnection)", () => {
      expect(client.reconnectAttempts).toBe(0);
    });
  });

  describe("identity", () => {
    it("getProfile delegates to NodeService", async () => {
      await client.connect();
      const result = await client.getProfile();
      expect(mockNode.getProfile).toHaveBeenCalled();
      expect(result).toEqual({ owner: { ownerId: "owner-1" }, device: { deviceId: "device-1" } });
    });

    it("getHumanProfile delegates to NodeService", async () => {
      await client.connect();
      const result = await client.getHumanProfile();
      expect(mockNode.getHumanProfile).toHaveBeenCalled();
      expect(result).toEqual({ displayName: "Alice" });
    });

    it("updateHumanProfile delegates to NodeService", async () => {
      await client.connect();
      const result = await client.updateHumanProfile({ displayName: "Bob" } as any);
      expect(mockNode.updateHumanProfile).toHaveBeenCalled();
      expect(result).toEqual({ displayName: "Alice Updated" });
    });
  });

  describe("bond management", () => {
    it("sendHello delegates to NodeService", async () => {
      await client.connect();
      const result = await client.sendHello("target-owner", { displayName: "Me" } as any, "Hello!");
      expect(mockNode.sendHello).toHaveBeenCalledWith("target-owner", { displayName: "Me" }, "Hello!");
      expect(result?.messageId).toBe("msg-1");
    });

    it("acceptHello delegates to NodeService", async () => {
      await client.connect();
      await client.acceptHello("msg-1");
      expect(mockNode.acceptHello).toHaveBeenCalledWith("msg-1");
    });

    it("declineHello delegates to NodeService", async () => {
      await client.connect();
      await client.declineHello("msg-1", "not interested");
      expect(mockNode.declineHello).toHaveBeenCalledWith("msg-1", "not interested");
    });

    it("blockPeer delegates to NodeService", async () => {
      await client.connect();
      await client.blockPeer("bad-peer");
      expect(mockNode.blockPeer).toHaveBeenCalledWith("bad-peer");
    });

    it("revokeBond delegates to NodeService", async () => {
      await client.connect();
      await client.revokeBond("peer-1");
      expect(mockNode.revokeBond).toHaveBeenCalledWith("peer-1");
    });

    it("getBonds delegates to NodeService", async () => {
      await client.connect();
      const bonds = await client.getBonds();
      expect(mockNode.getBonds).toHaveBeenCalled();
      expect(bonds).toHaveLength(1);
    });
  });

  describe("messaging", () => {
    it("sendChat delegates to NodeService", async () => {
      await client.connect();
      await client.sendChat("target", "hello");
      // `attachments` is an optional 3rd arg (added with audio-message support);
      // omitting it still works — NodeService just receives `undefined`.
      expect(mockNode.sendChat).toHaveBeenCalledWith("target", "hello", undefined);
    });

    it("listChatHistory delegates to NodeService", async () => {
      await client.connect();
      const history = await client.listChatHistory("peer-1", 50);
      expect(mockNode.listChatHistory).toHaveBeenCalledWith("peer-1", 50);
      expect(history).toEqual([]);
    });
  });

  describe("search", () => {
    it("searchPeers delegates to NodeService", async () => {
      await client.connect();
      await client.searchPeers({ query: "test" } as any);
      expect(mockNode.searchPeers).toHaveBeenCalledWith({ query: "test" });
    });

    it("advertiseTopic delegates to NodeService", async () => {
      await client.connect();
      await client.advertiseTopic("music");
      expect(mockNode.advertiseTopic).toHaveBeenCalledWith("music");
    });

    it("stopAdvertiseTopic delegates to NodeService", async () => {
      await client.connect();
      await client.stopAdvertiseTopic("music");
      expect(mockNode.stopAdvertiseTopic).toHaveBeenCalledWith("music");
    });
  });

  describe("connection status", () => {
    it("getConnectionStatus delegates to NodeService", async () => {
      await client.connect();
      const status = await client.getConnectionStatus();
      expect(mockNode.getConnectionStatus).toHaveBeenCalled();
      expect(status.online).toBe(true);
    });

    it("getPeerConnectionInfo delegates to NodeService", async () => {
      await client.connect();
      const info = await client.getPeerConnectionInfo("peer-1");
      expect(mockNode.getPeerConnectionInfo).toHaveBeenCalledWith("peer-1");
      expect(info.connected).toBe(true);
    });
  });

  describe("agent bridge", () => {
    it("getBridgeStatus delegates to NodeService", async () => {
      await client.connect();
      const status = await client.getBridgeStatus();
      expect(mockNode.getBridgeStatus).toHaveBeenCalled();
      expect(status.agentPeerId).toBe("agent-1");
    });

    it("getPairingPayload delegates to NodeService", async () => {
      await client.connect();
      const payload = await client.getPairingPayload();
      expect(mockNode.getPairingPayload).toHaveBeenCalled();
      expect(payload.wsUrl).toBe("ws://localhost:9001");
    });
  });

  describe("AI", () => {
    it("knowledgeQuery delegates to NodeService", async () => {
      await client.connect();
      const answer = await client.knowledgeQuery("What is EnvoyMesh?");
      expect(mockNode.knowledgeQuery).toHaveBeenCalledWith("What is EnvoyMesh?");
      expect(answer).toBe("AI answer");
    });
  });

  describe("node config", () => {
    it("getNodeConfig delegates to NodeService", async () => {
      await client.connect();
      await client.getNodeConfig();
      expect(mockNode.getNodeConfig).toHaveBeenCalled();
    });

    it("updateNodeConfig delegates to NodeService", async () => {
      await client.connect();
      await client.updateNodeConfig({ relays: [] } as any);
      expect(mockNode.updateNodeConfig).toHaveBeenCalledWith({ relays: [] });
    });

    it("listRelays delegates to NodeService", async () => {
      await client.connect();
      await client.listRelays();
      expect(mockNode.listRelays).toHaveBeenCalled();
    });

    it("addRelay delegates to NodeService", async () => {
      await client.connect();
      await client.addRelay("ws://relay:9000", 1, "us-east");
      expect(mockNode.addRelay).toHaveBeenCalledWith("ws://relay:9000", 1, "us-east");
    });

    it("removeRelay delegates to NodeService", async () => {
      await client.connect();
      await client.removeRelay("relay-1");
      expect(mockNode.removeRelay).toHaveBeenCalledWith("relay-1");
    });
  });

  describe("node lifecycle", () => {
    it("initNode delegates to NodeService", async () => {
      await client.connect();
      const result = await client.initNode("/tmp/profile", { relayEnabled: true });
      expect(mockNode.initNode).toHaveBeenCalledWith("/tmp/profile", { relayEnabled: true });
      expect(result.peerId).toBe("peer-1");
    });

    it("getNodeStatus wraps NodeService.getNodeStatus", async () => {
      await client.connect();
      const result = await client.getNodeStatus();
      expect(mockNode.getNodeStatus).toHaveBeenCalled();
      expect(result.status).toBe("running");
    });

    it("startNode delegates to NodeService", async () => {
      await client.connect();
      await client.startNode();
      expect(mockNode.startNode).toHaveBeenCalled();
    });

    it("stopNode delegates to NodeService", async () => {
      await client.connect();
      await client.stopNode();
      expect(mockNode.stopNode).toHaveBeenCalled();
    });

    it("waitForConnection resolves immediately (in-process)", async () => {
      await client.connect();
      await expect(client.waitForConnection(5000)).resolves.toBeUndefined();
    });
  });

  describe("events", () => {
    it("on() subscribes to NodeService events", () => {
      const handler = vi.fn();
      client.on("chat:message", handler as any);

      mockNode.emitEvent("chat:message", { text: "hello" });
      expect(handler).toHaveBeenCalledWith({ text: "hello" });
    });

    it("on() returns an unsubscribe function", () => {
      const handler = vi.fn();
      const unsub = client.on("chat:message", handler as any);

      mockNode.emitEvent("chat:message", { text: "first" });
      expect(handler).toHaveBeenCalledTimes(1);

      unsub();
      mockNode.emitEvent("chat:message", { text: "second" });
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });

    it("disconnect() unsubscribes all event handlers", async () => {
      await client.connect();
      const handler = vi.fn();
      client.on("chat:message", handler as any);

      client.disconnect();

      mockNode.emitEvent("chat:message", { text: "hello" });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("factory function", () => {
    it("createDirectCallClient returns a NodeServiceClient", () => {
      const c = createDirectCallClient(mockNode as unknown as NodeService);
      expect(c).toBeInstanceOf(DirectCallClient);
      expect(typeof c.connect).toBe("function");
      expect(typeof c.getProfile).toBe("function");
    });
  });
});
