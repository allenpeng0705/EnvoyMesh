import type {
  AgentCard,
  DeviceCertificate,
  HumanProfilePayload,
  CapabilityUnion,
} from "@envoymesh/protocol";
import type {
  DeviceIdentity,
  OwnerIdentity,
} from "@envoymesh/identity";
import type { NodeConfig, RelayConfig, NodeStatus, InitNodeOptions, NodeInitResult, ChatDraft, CapabilityManifest, UpdateCapabilityManifestParams } from "./ws-protocol.js";

// ============================================
// Identity Types
// ============================================

export interface NodeProfile {
  owner: OwnerIdentity;
  device: DeviceIdentity;
  deviceCertificate: DeviceCertificate;
}

// ============================================
// Human Profile Types
// ============================================

export interface HumanProfile extends HumanProfilePayload {
  // HumanProfilePayload already has: ownerId, displayName, bio, gender, hobbies, knowledge, updatedAt, signature
}

export interface CreateHumanProfileInput {
  displayName: string;
  username: string;
  bio?: string;
  gender?: string;
  hobbies?: string[];
  knowledge?: string[];
  profileVisibility?: "public" | "private";
  capabilities?: CapabilityUnion[];
}

// ============================================
// Hello Protocol Types
// ============================================

export interface HelloProfile {
  displayName: string;
  bio?: string;
  interests: string[];
  whatShares: string[];
  avatarUrl?: string;
}

export interface HelloRequest {
  messageId: string;
  sender: {
    nodeId: string;
    ownerId: string;
    displayName: string;
  };
  profile: HelloProfile;
  message: string;
  timestamp: string;
}

export interface HelloResponse {
  messageId: string;
  inReplyTo: string;
  decision: "accept" | "decline" | "block";
  declineReason?: string;
  timestamp: string;
}

// ============================================
// Bond Types
// ============================================

export type BondLevel = "direct" | "referred" | "public" | "blocked";

export interface BondRecord {
  peerOwnerId: string;
  displayName?: string;
  /** Libp2p dial id from peer directory when known (e.g. `12D3Koo…`), for UI fallback when `displayName` is empty. */
  libp2pPeerId?: string;
  level: BondLevel;
  createdAt: string;
  note?: string;
}

// ============================================
// Chat Types
// ============================================

export interface ChatAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sensitivity: "public" | "friends" | "private";
}

export interface ChatMessage {
  messageId: string;
  inReplyTo?: string;
  sender: {
    nodeId: string;
    displayName: string;
    /** Envoy owner id (`envoy:owner:…`); `nodeId` remains the libp2p transport id when applicable. */
    ownerId?: string;
  };
  recipient: {
    nodeId: string;
    displayName?: string;
    ownerId?: string;
  };
  content: {
    text: string;
    attachments?: ChatAttachment[];
  };
  metadata: {
    timestamp: string;
    deliveryReceipt?: "sent" | "delivered" | "read";
  };
  signature: string;
}

// ============================================
// Search / Discovery Types
// ============================================

export type ProfileVisibility = "public" | "contacts" | "private";

export interface PeerSearchResult {
  nodeId: string;
  ownerId: string;
  displayName: string;
  username?: string;
  bio?: string;
  interests: string[];
  profileVisibility: ProfileVisibility;
}

export interface SearchQuery {
  /** Direct peer ID lookup (e.g., "12D3KooWSHXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q") */
  peerId?: string;
  /** DHT topic-based discovery - peers advertising this topic will be found */
  topic?: string;
  /** Text search in display name/bio/interests (not used when peerId or topic is set) */
  queryText?: string;
  /** Username search - when query matches username pattern */
  username?: string;
  interests?: string[];
  maxResults?: number;
}

// ============================================
// File Sharing Types
// ============================================

export interface ShareOffer {
  shareId: string;
  senderNodeId: string;
  senderDisplayName: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sensitivity: "public" | "friends" | "private";
  preview?: string;
  timestamp: string;
}

// ============================================
// Connection Status
// ============================================

export interface ConnectionStatus {
  online: boolean;
  peerId: string;
  multiaddrs: string[];
  connectedRelays: string[];
  bondedPeers: number;
}

/**
 * Connection info for a specific peer (direct P2P vs relay-mediated).
 */
export interface PeerConnectionInfo {
  connected: boolean;
  direct: boolean;
  /** If relay connection, the relay's peer ID */
  relayPeerId?: string;
}

// ============================================
// NodeService Interface
// ============================================

export interface NodeServiceEvents {
  // Connection events
  "hello:request": HelloRequest;
  "hello:response": HelloResponse;
  "bond:established": { peerOwnerId: string; displayName?: string };
  "bond:revoked": { peerOwnerId: string };
  "bond:blocked": { peerOwnerId: string };

  // Chat events
  "chat:message": ChatMessage;
  "chat:draft": { threadPeerOwnerId: string; draft: ChatDraft };
  "chat:delivered": { messageId: string; timestamp: string };
  "chat:read": { messageId: string; timestamp: string };

  // File sharing events
  "share:offered": ShareOffer;
  "share:accepted": { shareId: string; savePath: string };
  "share:declined": { shareId: string };

  // Peer discovery
  "peer:discovered": PeerSearchResult;
  "peer:lost": { nodeId: string };
  "discovery:advertising-complete": { topics: string[]; success: boolean };

  // Connection state
  "node:online": { peerId: string; multiaddrs: string[] };
  "node:offline": { peerId: string };
  "node:status": { status: NodeStatus; peerId?: string };
}

export interface NodeService {
  // ----- Identity -----

  /**
   * Get current node's identity and profile
   */
  getProfile(): NodeProfile;

  /**
   * Get current node's human profile
   */
  getHumanProfile(): Promise<HumanProfile | undefined>;

  /**
   * Update human profile (signs with owner key)
   */
  updateHumanProfile(profile: CreateHumanProfileInput): Promise<HumanProfile>;

  // ----- Bond Management -----

  /**
   * Send a hello request to establish connection
   */
  sendHello(targetOwnerId: string, profile: HelloProfile, message: string): Promise<HelloResponse>;

  /**
   * Accept a pending hello request
   */
  acceptHello(messageId: string): Promise<void>;

  /**
   * Store pending hello request from inbound bond.inbound.
   * Called by index.ts to enable acceptHello to find the pending request later.
   */
  storePendingHelloRequest(data: {
    messageId: string;
    sender: { nodeId: string; ownerId: string; displayName: string };
    message: string;
    timestamp: string;
  }): void;

  /**
   * Decline a pending hello request
   */
  declineHello(messageId: string, reason?: string): Promise<void>;

  /**
   * Block a peer (permanent - they cannot send hello requests)
   */
  blockPeer(peerOwnerId: string): Promise<void>;

  /**
   * Unblock a peer
   */
  unblockPeer(peerOwnerId: string): Promise<void>;

  /**
   * Revoke (remove) a bond
   */
  revokeBond(peerOwnerId: string): Promise<void>;

  /**
   * Get all bonds (trusted contacts)
   */
  getBonds(): Promise<BondRecord[]>;

  // ----- Messaging -----

  /**
   * Send a chat message to a bonded peer
   */
  sendChat(targetOwnerId: string, text: string): Promise<void>;

  /**
   * Human chat transcripts persisted under the profile (`chat-messages.jsonl`).
   */
  listChatHistory(peerOwnerId: string, limit?: number): Promise<ChatMessage[]>;

  /**
   * Mark messages as read
   */
  markRead(targetOwnerId: string, upToMessageId?: string): Promise<void>;

  // ----- Search / Discovery -----

  /**
   * Search for peers by interests or text
   */
  searchPeers(query: SearchQuery): Promise<PeerSearchResult[]>;

  /**
   * Advertise a topic on the DHT so other peers can discover you
   * @param topic The topic string to advertise (e.g., "music", "tech")
   */
  advertiseTopic(topic: string): Promise<void>;

  /**
   * Stop advertising a topic on the DHT
   * @param topic The topic string to stop advertising
   */
  stopAdvertiseTopic(topic: string): Promise<void>;

  // ----- Capability Manifest -----

  /**
   * Get the current capability manifest.
   * Returns undefined if no manifest has been created yet.
   */
  getCapabilityManifest(): Promise<CapabilityManifest | undefined>;

  /**
   * Update the capability manifest.
   * Creates a default manifest if none exists.
   */
  updateCapabilityManifest(params: UpdateCapabilityManifestParams): Promise<CapabilityManifest>;

  // ----- File Sharing -----

  /**
   * Offer a file to a peer
   */
  shareFile(
    targetOwnerId: string,
    file: { path: string; sensitivity: ChatAttachment["sensitivity"] },
  ): Promise<void>;

  /**
   * Accept incoming file share
   */
  acceptShare(shareId: string, savePath: string): Promise<void>;

  /**
   * Decline incoming file share
   */
  declineShare(shareId: string): Promise<void>;

  // ----- Node Configuration -----

  /**
   * Get current node configuration
   */
  getNodeConfig(): Promise<NodeConfig>;

  /**
   * Update node configuration
   */
  updateNodeConfig(config: Partial<NodeConfig>): Promise<void>;

  /**
   * List configured relays
   */
  listRelays(): Promise<RelayConfig[]>;

  /**
   * Add a relay
   */
  addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig>;

  /**
   * Remove a relay
   */
  removeRelay(relayId: string): Promise<void>;

  // ----- Node Lifecycle -----

  /**
   * Initialize a new node (first-run setup)
   */
  initNode(profileDir: string, options?: InitNodeOptions): Promise<NodeInitResult>;

  /**
   * Get current node status
   */
  getNodeStatus(): NodeStatus;

  /**
   * Start the node with saved configuration
   */
  startNode(): Promise<void>;

  /**
   * Stop the running node
   */
  stopNode(): Promise<void>;

  // ----- Event Subscription -----

  /**
   * Subscribe to events. Returns unsubscribe function.
   */
  on<K extends keyof NodeServiceEvents>(
    event: K,
    handler: (data: NodeServiceEvents[K]) => void,
  ): () => void;

  /**
   * Check if any listeners for a given event
   */
  hasListeners(event: keyof NodeServiceEvents): boolean;

  // ----- Connection Status -----

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus;

  /**
   * Get connection info for a specific peer (direct P2P vs relay-mediated).
   * Use this to show connection type indicator in UI.
   * @param peerOwnerId The owner's peer ID (e.g., envoy:owner:...)
   */
  getPeerConnectionInfo(peerOwnerId: string): Promise<PeerConnectionInfo>;
}