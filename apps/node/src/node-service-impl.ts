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
import {
  createLocalTaskStore,
  createLocalTrustStore,
  createLocalPeerDirectoryStore,
  createTaskRuntimeStateStore,
  createRelayStateStore,
  loadOrCreateNodeProfile,
  type LocalTaskStore,
  type LocalTrustStore,
  type LocalPeerDirectoryStore,
  type TaskRuntimeStateStore,
  type RelayStateStore,
} from "@envoymesh/local-store";
import { createNodeConfigStore, type PersistedNodeConfig } from "./node-config-store.js";
import { createDiscoverySeedStore, type DiscoverySeedStore } from "./discovery-seed-store.js";
import { resolveBootstrapAddresses, looksLikeDomain } from "./bootstrap-resolver.js";
import { createInboundMessageGuard, type InboundMessageGuard } from "./inbound-guard.js";
import { createTaskDispatcher } from "./task-dispatcher.js";
import {
  EnvoyMesh,
  DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME,
  type EnvoyMeshOptions,
} from "@envoymesh/network";
import { join } from "node:path";

/**
 * NodeServiceImpl implements the NodeService interface.
 *
 * Supports two modes:
 * 1. Traditional (mesh pre-created by index.ts): mesh is passed in constructor
 * 2. Envoy-managed: Envoy calls initNode/startNode/stopNode to manage lifecycle
 */
class NodeServiceImpl implements NodeService {
  private _mesh: EnvoyMesh | undefined;
  private _profile: NodeProfile | undefined;
  private readonly _trustStore: LocalTrustStore;
  private readonly _peerDirectoryStore: LocalPeerDirectoryStore;
  private readonly _configStore: ReturnType<typeof createNodeConfigStore>;
  private readonly _profileDir: string;

  // App-managed mode stores
  private _taskStore: LocalTaskStore | undefined;
  private _relayStateStore: RelayStateStore | undefined;
  private _discoverySeedStore: DiscoverySeedStore | undefined;
  private _taskRuntimeStore: TaskRuntimeStateStore | undefined;
  private _inboundGuard: InboundMessageGuard | undefined;
  private _taskDispatcher: ReturnType<typeof createTaskDispatcher> | undefined;

  private _nodeStatus: NodeStatus = "offline";

  // Event listeners - stored for later emission
  private readonly listeners = new Map<keyof NodeServiceEvents, Set<(...args: any[]) => void>>();

  constructor(
    mesh: EnvoyMesh | undefined,
    trustStore: LocalTrustStore,
    peerDirectoryStore: LocalPeerDirectoryStore,
    profileDir: string,
    profile?: NodeProfile,
  ) {
    this._mesh = mesh;
    this._trustStore = trustStore;
    this._peerDirectoryStore = peerDirectoryStore;
    this._profileDir = profileDir;
    this._configStore = createNodeConfigStore(profileDir);
    if (mesh) {
      this._nodeStatus = "running";
      this._profile = profile;
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
        bootstrapPresets: config.bootstrapPresets,
      };
    }
    return {
      profileDir: this._profileDir,
      discoveryProfile: "wan-default" as const,
      relayEnabled: false,
      relayServerEnabled: false,
      configuredRelays: [],
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: [],
    };
  }

  async updateNodeConfig(config: Partial<NodeConfig>): Promise<void> {
    const current = (await this._configStore.load()) ?? {
      version: "0.1" as const,
      profileDir: this._profileDir,
      discoveryProfile: "wan-default" as const,
      relayEnabled: false,
      relayServerEnabled: false,
      advertiseAddrs: [] as string[],
      bootstrapPeers: [] as string[],
      bootstrapPresets: [] as string[],
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
      ...(config.bootstrapPresets && { bootstrapPresets: config.bootstrapPresets }),
      ...(config.configuredRelays && { configuredRelays: config.configuredRelays }),
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
      profileDir: this._profileDir,
      discoveryProfile: "wan-default" as const,
      relayEnabled: false,
      relayServerEnabled: false,
      advertiseAddrs: [] as string[],
      bootstrapPeers: [] as string[],
      bootstrapPresets: [] as string[],
      configuredRelays: [],
      updatedAt: new Date().toISOString(),
    };

    const relayId = `relay_${Date.now()}`;
    const newRelay: RelayConfig = { relayId, addr, level, region, enabled: true };

    // If address looks like a domain, try to resolve it to a multiaddr with peer ID
    let resolvedAddr = addr;
    if (looksLikeDomain(addr)) {
      console.log(`[node-service] Resolving relay domain: ${addr}`);
      const results = await resolveBootstrapAddresses([addr]);
      if (results.length > 0 && results[0].resolved.length > 0) {
        resolvedAddr = results[0].resolved[0];
        console.log(`[node-service] Resolved ${addr} to ${resolvedAddr}`);
      }
    }

    const updated: PersistedNodeConfig = {
      ...config,
      configuredRelays: [...config.configuredRelays, { ...newRelay, addr: resolvedAddr }],
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(updated);
    return { ...newRelay, addr: resolvedAddr };
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

      // Create app-managed stores
      this._taskStore = createLocalTaskStore(config.profileDir);
      this._relayStateStore = createRelayStateStore(config.profileDir);
      this._discoverySeedStore = createDiscoverySeedStore(config.profileDir);
      this._taskRuntimeStore = createTaskRuntimeStateStore(config.profileDir);
      this._inboundGuard = createInboundMessageGuard();
      this._taskDispatcher = createTaskDispatcher();

      // Compute effective bootstrap peers
      const peerRecords = await this._peerDirectoryStore.listPeerRecords();
      const peerDirAddrs = peerRecords.flatMap((r) => r.listenAddrs);
      const seedAddrs = await this._discoverySeedStore.listSeedAddrs();
      const bootstrapPeers = [...new Set([...config.bootstrapPeers, ...peerDirAddrs, ...seedAddrs])];

      // Create EnvoyMesh
      // DHT is enabled when using public network (bootstrapPresets) or when discoveryProfile is wan-default
      const usePublicNetwork = config.bootstrapPresets && config.bootstrapPresets.length > 0;
      this._mesh = new EnvoyMesh({
        listen: ["/ip4/0.0.0.0/tcp/0"],
        enableMdns: config.discoveryProfile === "lan-fast",
        enableDht: usePublicNetwork || config.discoveryProfile === "wan-default",
        dhtClientMode: true,
        bootstrapPeers,
        enableRelay: config.relayEnabled,
        enableRelayServer: config.relayServerEnabled,
        enableAutoNat: true,
        enableDcutr: true,
        libp2pPrivateKeyPath: join(config.profileDir, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME),
      } as EnvoyMeshOptions);

      // Wire mesh events
      this._wireMeshEvents();

      // Start mesh
      await this._mesh.start();

      this._nodeStatus = "running";
      this.emit("node:status", { status: this._nodeStatus, peerId: this._mesh.peerId });
    } catch (error) {
      this._nodeStatus = "offline";
      this.emit("node:status", { status: this._nodeStatus });
      throw error;
    }
  }

  private _wireMeshEvents(): void {
    const mesh = this._mesh!;
    const profile = this._profile!;

    mesh.onMessage(async ({ envelope, remotePeerId }) => {
      const guardDecision = this._inboundGuard!.inspect(envelope);
      if (guardDecision.action === "reject") return;

      const { intent } = envelope;

      if (intent === "bond.request") {
        // Store discovered peer
        const existing = await this._peerDirectoryStore.getPeerByOwnerId(remotePeerId);
        if (!existing) {
          await this._peerDirectoryStore.upsertPeerFromSignal({
            peerId: remotePeerId,
            payload: envelope.payload as any,
          });
        }

        // Emit hello:request event for the app to show notification
        const { parseBondRequestPayload } = await import("@envoymesh/protocol");
        const payload = parseBondRequestPayload(envelope.payload);
        this.emit("hello:request", {
          messageId: envelope.messageId,
          sender: {
            nodeId: remotePeerId,
            ownerId: payload.requesterOwnerId,
            displayName: payload.requesterDisplayName ?? remotePeerId,
          },
          profile: {
            displayName: payload.requesterDisplayName ?? remotePeerId,
            bio: "",
            interests: [],
            whatShares: [],
          },
          message: payload.message ?? "",
          timestamp: envelope.createdAt,
        });
      } else if (intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        this.emit("chat:message", {
          messageId: envelope.messageId,
          sender: { nodeId: remotePeerId, displayName: payload.senderOwnerId },
          recipient: { nodeId: profile.owner.ownerId },
          content: { text: payload.text },
          metadata: { timestamp: envelope.createdAt, deliveryReceipt: "delivered" },
          signature: envelope.signature,
        });
      }
    });

    mesh.onPeerDiscovered(async ({ peerId, multiaddrs }) => {
      const existing = await this._peerDirectoryStore.getPeerByOwnerId(peerId);
      if (!existing) {
        await this._peerDirectoryStore.upsertPeerFromSignal({
          peerId,
          payload: { type: "system.signal", version: "1.0", senderPublicKey: "", signal: "peer.discovered" } as any,
        });
      }
    });
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
  trustStore: LocalTrustStore,
  peerDirectoryStore: LocalPeerDirectoryStore,
  profileDir: string,
  profile?: NodeProfile,
): NodeService {
  return new NodeServiceImpl(mesh, trustStore, peerDirectoryStore, profileDir, profile);
}

// Export the class for testing
export { NodeServiceImpl };