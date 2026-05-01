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

/**
 * NodeServiceImpl implements the NodeService interface.
 *
 * This is a STUB implementation - the actual implementation will wire up
 * to the mesh's libp2p/relay infrastructure in a follow-up.
 *
 * The interface (NodeService) is the important part - it defines the contract
 * between the application layer and the transport layer.
 */
class NodeServiceImpl implements NodeService {
  private readonly mesh: EnvoyMesh;
  private readonly _args: NodeArgs;
  private readonly _profile: NodeProfile;
  private readonly _trustStore: LocalTrustStore;
  private readonly _peerDirectoryStore: LocalPeerDirectoryStore;

  // Event listeners - stored for later emission
  private readonly listeners = new Map<keyof NodeServiceEvents, Set<(...args: any[]) => void>>();

  constructor(
    mesh: EnvoyMesh,
    args: NodeArgs,
    profile: NodeProfile,
    trustStore: LocalTrustStore,
    peerDirectoryStore: LocalPeerDirectoryStore,
  ) {
    this.mesh = mesh;
    this._args = args;
    this._profile = profile;
    this._trustStore = trustStore;
    this._peerDirectoryStore = peerDirectoryStore;
  }

  // ============================================
  // Identity
  // ============================================

  getProfile(): NodeProfile {
    return this._profile;
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
        senderPeerId: derivePeerId(this._profile.device.publicKeyPem),
        senderPublicKey: this._profile.device.publicKeyPem,
        recipientPeerId: targetPeer.peerId,
        intent: "bond.request",
        payload: createBondRequestPayload({
          requesterOwnerId: this._profile.owner.ownerId,
          requesterDisplayName: profile.displayName,
          message: `[HELLO] ${message}`,
          proofOfContext: `displayName:${profile.displayName}`,
          requestedLevel: "direct",
        }),
      }),
      this._profile.device.privateKeyPem,
    );

    await this.mesh.send(targetPeer.peerId, envelope);

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
    // Look up peer's peerId by ownerId
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    const targetPeer = peerRecords.find((r) => r.ownerId === targetOwnerId);

    if (!targetPeer) {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }

    const recipientPeerId = targetPeer.peerId;
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(this._profile.device.publicKeyPem),
        senderPublicKey: this._profile.device.publicKeyPem,
        recipientPeerId: recipientPeerId,
        intent: "chat.message",
        payload: createChatMessagePayload({
          senderOwnerId: this._profile.owner.ownerId,
          text,
        }),
      }),
      this._profile.device.privateKeyPem,
    );

    await this.mesh.sendChat(recipientPeerId, envelope);

    // Emit the sent message as a local event
    this.emit("chat:message", {
      messageId: envelope.messageId,
      sender: {
        nodeId: this.mesh.peerId,
        displayName: this._profile.owner.ownerId,
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

  async updateNodeConfig(_config: Partial<NodeConfig>): Promise<void> {
    throw new Error("Not yet implemented - runtime config updates require node restart");
  }

  async listRelays(): Promise<RelayConfig[]> {
    return [];
  }

  async addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig> {
    return {
      relayId: `relay_${Date.now()}`,
      addr,
      level,
      region,
      enabled: true,
    };
  }

  async removeRelay(_relayId: string): Promise<void> {
    // Future: remove from configured relays
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
    // Note: actual implementation would check if libp2p node has started
    return {
      online: true,
      peerId: this.mesh.peerId,
      multiaddrs: this.mesh.multiaddrs,
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
  mesh: EnvoyMesh,
  args: NodeArgs,
  profile: NodeProfile,
  trustStore: LocalTrustStore,
  peerDirectoryStore: LocalPeerDirectoryStore,
): NodeService {
  return new NodeServiceImpl(mesh, args, profile, trustStore, peerDirectoryStore);
}

// Export the class for testing
export { NodeServiceImpl };