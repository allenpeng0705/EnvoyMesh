import type {
  BondRecord,
  ConnectionStatus,
  CreateHumanProfileInput,
  HelloProfile,
  HelloResponse,
  HumanProfile,
  NodeProfile,
  NodeService,
  NodeServiceEvents,
  PeerSearchResult,
  SearchQuery,
} from "@envoymesh/api";

import type { EnvoyMesh } from "@envoymesh/network";
import type { NodeArgs } from "./args.js";

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

  // Event listeners - stored for later emission
  private readonly listeners = new Map<keyof NodeServiceEvents, Set<(...args: any[]) => void>>();

  constructor(mesh: EnvoyMesh, args: NodeArgs, profile: NodeProfile) {
    this.mesh = mesh;
    this._args = args;
    this._profile = profile;
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

  async sendHello(_targetOwnerId: string, _profile: HelloProfile, _message: string): Promise<HelloResponse> {
    throw new Error("Not yet implemented");
  }

  async acceptHello(_messageId: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async declineHello(_messageId: string, _reason?: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async blockPeer(_peerOwnerId: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async unblockPeer(_peerOwnerId: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async revokeBond(_peerOwnerId: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async getBonds(): Promise<BondRecord[]> {
    return [];
  }

  // ============================================
  // Messaging
  // ============================================

  async sendChat(_targetOwnerId: string, _text: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async markRead(_targetOwnerId: string, _upToMessageId?: string): Promise<void> {
    // Future: send read receipts
  }

  // ============================================
  // Search / Discovery
  // ============================================

  async searchPeers(_query: SearchQuery): Promise<PeerSearchResult[]> {
    return [];
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
): NodeService {
  return new NodeServiceImpl(mesh, args, profile);
}

// Export the class for testing
export { NodeServiceImpl };