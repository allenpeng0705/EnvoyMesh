import type {
  BondRecord,
  ConnectionStatus,
  CreateHumanProfileInput,
  HelloProfile,
  HelloRequest,
  HelloResponse,
  HumanProfile,
  NodeConfig,
  NodeProfile,
  NodeService,
  NodeServiceEvents,
  PeerSearchResult,
  RelayConfig,
  SearchQuery,
} from "@envoymesh/api";
import type { NodeStatus, InitNodeOptions, NodeInitResult } from "@envoymesh/api";

import {
  createChatMessagePayload,
  createUnsignedEnvelope,
  parseChatMessagePayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import type { EnvoyMesh } from "@envoymesh/network";
import type { NodeArgs } from "./args.js";
import type { LocalTrustStore, LocalPeerDirectoryStore } from "@envoymesh/local-store";
import { createNodeConfigStore, type PersistedNodeConfig } from "./node-config-store.js";
import { loadOrCreateNodeProfile } from "@envoymesh/local-store";

/**
 * NodeServiceImpl implements the NodeService interface.
 *
 * Supports two modes:
 * 1. Traditional (mesh pre-created by index.ts): mesh is passed in constructor
 * 2. Envoy-managed: Envoy calls initNode/startNode/stopNode to manage lifecycle
 */
class NodeServiceImpl implements NodeService {
  private _mesh: EnvoyMesh | undefined;
  private readonly _args: NodeArgs;
  private _profile: NodeProfile | undefined;
  private readonly _trustStore: LocalTrustStore;
  private readonly _peerDirectoryStore: LocalPeerDirectoryStore;
  private readonly _configStore: ReturnType<typeof createNodeConfigStore>;

  private _nodeStatus: NodeStatus = "offline";

  // Event listeners - stored for later emission
  private readonly listeners = new Map<keyof NodeServiceEvents, Set<(...args: any[]) => void>>();

  constructor(
    mesh: EnvoyMesh | undefined,
    args: NodeArgs,
    profile: NodeProfile | undefined,
    trustStore: LocalTrustStore,
    peerDirectoryStore: LocalPeerDirectoryStore,
  ) {
    this._mesh = mesh;
    this._args = args;
    this._profile = profile;
    this._trustStore = trustStore;
    this._peerDirectoryStore = peerDirectoryStore;
    this._configStore = createNodeConfigStore(args.profileDir);
    if (mesh) {
      this._nodeStatus = "running";
    }
  }

  // ============================================
  // Internal helpers
  // ============================================

  private _requireMesh(): EnvoyMesh {
    if (!this._mesh) {
      throw new Error("Node is not running. Call startNode() first.");
    }
    return this._mesh;
  }

  private _requireProfile(): NodeProfile {
    if (!this._profile) {
      throw new Error("Node is not initialized. Call initNode() first.");
    }
    return this._profile;
  }

  private _assertOnline(): void {
    if (this._nodeStatus !== "running") {
      throw new Error(`Node is ${this._nodeStatus}. Start the node first.`);
    }
  }

  // ============================================
  // Identity
  // ============================================

  getProfile(): NodeProfile {
    return this._requireProfile();
  }

  async getHumanProfile(): Promise<HumanProfile | undefined> {
    return undefined;
  }

  async updateHumanProfile(_input: CreateHumanProfileInput): Promise<HumanProfile> {
    throw new Error("Not yet implemented");
  }

  // ============================================
  // Bond Management
  // ============================================

  async sendHello(targetOwnerId: string, profile: HelloProfile, message: string): Promise<HelloResponse> {
    this._assertOnline();
    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    // Find the target peer's peerId
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    const targetPeer = peerRecords.find((r) => r.ownerId === targetOwnerId);

    if (!targetPeer) {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }

    const messageId = `hello_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Send a bond.request via mesh
    const { createBondRequestPayload } = await import("@envoymesh/protocol");
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
        senderPublicKey: selfProfile.device.publicKeyPem,
        recipientPeerId: targetPeer.peerId,
        intent: "bond.request",
        payload: createBondRequestPayload({
          requesterOwnerId: selfProfile.owner.ownerId,
          requesterDisplayName: profile.displayName,
          message: `[HELLO] ${message}`,
          proofOfContext: `displayName:${profile.displayName}`,
          requestedLevel: "direct",
        }),
      }),
      selfProfile.device.privateKeyPem,
    );

    await mesh.send(targetPeer.peerId, envelope);

    return {
      messageId,
      inReplyTo: "",
      decision: "accept", // Optimistic - actual response comes async via mesh
      timestamp: new Date().toISOString(),
    };
  }

  async acceptHello(_messageId: string): Promise<void> {
    // In the current protocol, bond.request is auto-accepted/denied based on policy.
    // This method is a no-op stub. In a future protocol version with explicit accept/decline,
    // this would be called after the user approves the hello request.
  }

  async declineHello(_messageId: string, reason?: string): Promise<void> {
    // In the current protocol, bond.request is auto-accepted/denied based on policy.
    // This method is a no-op stub. In a future protocol version with explicit accept/decline,
    // this would send a bond.response to reject the request.
    console.log(`[node-service] declineHello called (stub): ${reason ?? "no reason"}`);
  }

  async blockPeer(peerOwnerId: string): Promise<void> {
    await this._trustStore.setTrustRecord({
      peerOwnerId,
      level: "blocked",
      now: new Date().toISOString(),
    });
  }

  async unblockPeer(peerOwnerId: string): Promise<void> {
    // Unblocking restores the peer to "public" level (no bond) rather than creating a new bond
    // If a bond exists, update it; otherwise do nothing (no automatic bonding)
    const existing = await this._trustStore.getTrustRecord(peerOwnerId);
    if (existing) {
      await this._trustStore.setTrustRecord({
        peerOwnerId,
        level: existing.level === "blocked" ? "public" : existing.level,
        now: new Date().toISOString(),
      });
    }
  }

  async revokeBond(peerOwnerId: string): Promise<void> {
    await this._trustStore.removeTrustRecord(peerOwnerId);
    this.emit("bond:revoked", { peerOwnerId });
  }

  async getBonds(): Promise<BondRecord[]> {
    const trustRecords = await this._trustStore.listTrustRecords();
    return trustRecords.map((record) => ({
      peerOwnerId: record.peerOwnerId,
      displayName: record.displayName,
      level: record.level,
      createdAt: record.createdAt,
      note: record.note,
    }));
  }

  // ============================================
  // Messaging
  // ============================================

  async sendChat(targetOwnerId: string, text: string): Promise<void> {
    this._assertOnline();
    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    // Look up peer's peerId by ownerId
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    const targetPeer = peerRecords.find((r) => r.ownerId === targetOwnerId);

    if (!targetPeer) {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }

    const recipientPeerId = targetPeer.peerId;
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
        senderPublicKey: selfProfile.device.publicKeyPem,
        recipientPeerId: recipientPeerId,
        intent: "chat.message",
        payload: createChatMessagePayload({
          senderOwnerId: selfProfile.owner.ownerId,
          text,
        }),
      }),
      selfProfile.device.privateKeyPem,
    );

    await mesh.sendChat(recipientPeerId, envelope);

    // Emit the sent message as a local event
    this.emit("chat:message", {
      messageId: envelope.messageId,
      sender: {
        nodeId: mesh.peerId,
        displayName: selfProfile.owner.ownerId,
      },
      recipient: {
        nodeId: recipientPeerId,
      },
      content: {
        text,
      },
      metadata: {
        timestamp: envelope.createdAt,
        deliveryReceipt: "sent",
      },
      signature: envelope.signature,
    });
  }

  async markRead(_targetOwnerId: string, _upToMessageId?: string): Promise<void> {
    // Future: send read receipts
  }

  // ============================================
  // Search / Discovery
  // ============================================

  async searchPeers(query: SearchQuery): Promise<PeerSearchResult[]> {
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    const maxResults = query.maxResults ?? 20;

    // Filter by ownerId (since PeerDirectoryRecord doesn't have displayName/bio/interests)
    let results = peerRecords.map((record) => ({
      nodeId: record.peerId,
      ownerId: record.ownerId,
      displayName: record.ownerId,
      interests: [] as string[],
      profileVisibility: "public" as const,
    }));

    // Filter by query text (ownerId match)
    if (query.queryText) {
      const lowerQuery = query.queryText.toLowerCase();
      results = results.filter((r) => r.ownerId.toLowerCase().includes(lowerQuery));
    }

    return results.slice(0, maxResults);
  }

  // ============================================
  // File Sharing
  // ============================================

  async shareFile(_targetOwnerId: string, _file: { path: string; sensitivity: "public" | "friends" | "private" }): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async acceptShare(_shareId: string, _savePath: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async declineShare(_shareId: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  // ============================================
  // Node Configuration
  // ============================================

  async getNodeConfig(): Promise<NodeConfig> {
    const config = await this._configStore.load();
    if (config) {
      return {
        profileDir: config.profileDir,
        discoveryProfile: config.discoveryProfile,
        relayEnabled: config.relayEnabled,
        relayServerEnabled: config.relayServerEnabled,
        configuredRelays: config.configuredRelays,
        advertiseAddrs: config.advertiseAddrs,
        bootstrapPeers: config.bootstrapPeers,
      };
    }
    return {
      profileDir: this._args.profileDir,
      discoveryProfile: this._args.discoveryProfile as "lan-fast" | "wan-default",
      relayEnabled: this._args.enableRelay,
      relayServerEnabled: this._args.enableRelayServer,
      configuredRelays: [],
      advertiseAddrs: this._args.advertiseAddrs,
      bootstrapPeers: this._args.bootstrapPeers,
    };
  }

  async updateNodeConfig(config: Partial<NodeConfig>): Promise<void> {
    const current = (await this._configStore.load()) ?? {
      version: "0.1" as const,
      profileDir: this._args.profileDir,
      discoveryProfile: this._args.discoveryProfile as "lan-fast" | "wan-default",
      relayEnabled: this._args.enableRelay,
      relayServerEnabled: this._args.enableRelayServer,
      advertiseAddrs: this._args.advertiseAddrs,
      bootstrapPeers: this._args.bootstrapPeers,
      bootstrapPresets: [],
      configuredRelays: [],
      updatedAt: new Date().toISOString(),
    };

    const updated: PersistedNodeConfig = {
      ...current,
      ...(config.discoveryProfile && { discoveryProfile: config.discoveryProfile }),
      ...(config.relayEnabled !== undefined && { relayEnabled: config.relayEnabled }),
      ...(config.relayServerEnabled !== undefined && { relayServerEnabled: config.relayServerEnabled }),
      ...(config.advertiseAddrs && { advertiseAddrs: config.advertiseAddrs }),
      ...(config.bootstrapPeers && { bootstrapPeers: config.bootstrapPeers }),
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(updated);
    this.emit("node:status", {
      status: this._nodeStatus,
      peerId: this._mesh?.peerId,
    });
  }

  async listRelays(): Promise<RelayConfig[]> {
    const config = await this._configStore.load();
    return config?.configuredRelays ?? [];
  }

  async addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig> {
    const config = (await this._configStore.load()) ?? {
      version: "0.1" as const,
      profileDir: this._args.profileDir,
      discoveryProfile: this._args.discoveryProfile as "lan-fast" | "wan-default",
      relayEnabled: this._args.enableRelay,
      relayServerEnabled: this._args.enableRelayServer,
      advertiseAddrs: this._args.advertiseAddrs,
      bootstrapPeers: this._args.bootstrapPeers,
      bootstrapPresets: [],
      configuredRelays: [],
      updatedAt: new Date().toISOString(),
    };

    const relayId = `relay_${Date.now()}`;
    const newRelay: RelayConfig = { relayId, addr, level, region, enabled: true };

    const updated: PersistedNodeConfig = {
      ...config,
      configuredRelays: [...config.configuredRelays, newRelay],
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(updated);
    return newRelay;
  }

  async removeRelay(relayId: string): Promise<void> {
    const config = await this._configStore.load();
    if (!config) {
      return;
    }

    const updated: PersistedNodeConfig = {
      ...config,
      configuredRelays: config.configuredRelays.filter((r) => r.relayId !== relayId),
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(updated);
  }

  // ============================================
  // Node Lifecycle
  // ============================================

  async initNode(profileDir: string, options?: InitNodeOptions): Promise<NodeInitResult> {
    // Create profile directory structure
    const profile = await loadOrCreateNodeProfile(profileDir);

    // Write persisted config
    const config: PersistedNodeConfig = {
      version: "0.1",
      profileDir,
      discoveryProfile: options?.discoveryProfile ?? "wan-default",
      relayEnabled: options?.relayEnabled ?? true,
      relayServerEnabled: options?.relayServerEnabled ?? false,
      advertiseAddrs: options?.advertiseAddrs ?? [],
      bootstrapPeers: options?.bootstrapPeers ?? [],
      bootstrapPresets: options?.bootstrapPresets ?? [],
      configuredRelays: [],
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(config);
    this._profile = profile;

    return {
      profileDir,
      peerId: derivePeerId(profile.device.publicKeyPem),
      ownerId: profile.owner.ownerId,
      deviceId: profile.device.deviceId,
    };
  }

  getNodeStatus(): NodeStatus {
    return this._nodeStatus;
  }

  async startNode(): Promise<void> {
    if (this._nodeStatus === "running") {
      // Already running, no-op
      return;
    }

    if (this._nodeStatus === "starting") {
      throw new Error("Node is already starting");
    }

    this._nodeStatus = "starting";
    this.emit("node:status", { status: this._nodeStatus });

    try {
      const config = await this._configStore.load();
      if (!config) {
        throw new Error("No node config found. Call initNode() first.");
      }

      // Load or create profile
      this._profile = await loadOrCreateNodeProfile(config.profileDir);

      // Create mesh from config - Note: this is a simplified version
      // In a full implementation, we would create the actual EnvoyMesh here
      // For now, this throws since EnvoyMesh requires many dependencies
      throw new Error("startNode: Full mesh creation not yet implemented in NodeService. Use CLI to start the node.");
    } catch (error) {
      this._nodeStatus = "offline";
      this.emit("node:status", { status: this._nodeStatus });
      throw error;
    }
  }

  async stopNode(): Promise<void> {
    if (this._nodeStatus === "offline") {
      return;
    }

    this._nodeStatus = "stopping";
    this.emit("node:status", { status: this._nodeStatus });

    try {
      if (this._mesh) {
        await this._mesh.stop();
        this._mesh = undefined;
      }
    } catch (error) {
      console.error("[node-service] Error stopping mesh:", error);
    }

    this._nodeStatus = "offline";
    this.emit("node:status", { status: this._nodeStatus });
  }

  // ============================================
  // Event Subscription
  // ============================================

  on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler as any);
    return () => {
      handlers?.delete(handler as any);
    };
  }

  hasListeners(event: keyof NodeServiceEvents): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  // ============================================
  // Connection Status
  // ============================================

  getConnectionStatus(): ConnectionStatus {
    if (!this._mesh || this._nodeStatus !== "running") {
      return {
        online: false,
        peerId: "",
        multiaddrs: [],
        connectedRelays: [],
        bondedPeers: 0,
      };
    }
    return {
      online: true,
      peerId: this._mesh.peerId,
      multiaddrs: this._mesh.multiaddrs,
      connectedRelays: [],
      bondedPeers: 0,
    };
  }

  // ============================================
  // Internal: Emit events to listeners
  // ============================================

  emit<K extends keyof NodeServiceEvents>(event: K, data: NodeServiceEvents[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }
}

/**
 * Creates a NodeService instance.
 */
export function createNodeService(
  mesh: EnvoyMesh | undefined,
  args: NodeArgs,
  profile: NodeProfile | undefined,
  trustStore: LocalTrustStore,
  peerDirectoryStore: LocalPeerDirectoryStore,
): NodeService {
  return new NodeServiceImpl(mesh, args, profile, trustStore, peerDirectoryStore);
}

// Export the class for testing
export { NodeServiceImpl };