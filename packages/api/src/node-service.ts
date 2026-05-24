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
import type { DocumentAgentTurnResult } from "./document-agent-loop.js";
import type { TransferStatus } from "./transfer-status.js";
import type {
  BridgeStatus,
  NodeConfig,
  RelayConfig,
  NodeStatus,
  InitNodeOptions,
  NodeInitResult,
  ChatDraft,
  CapabilityManifest,
  UpdateCapabilityManifestParams,
  AutonomousPolicy,
  ModelProviderConfig,
  AiSettings,
  ContactAiPreferences,
  PairingPayload,
  HomeClawCoreProxyParams,
  HomeClawCoreProxyResult,
  PairDeviceParams,
  PairDeviceResult,
  PairSharedIdentityParams,
  PairSharedIdentityResult,
} from "./ws-protocol.js";

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

/** Inbound Trust-mode row + WS payload (`social.intro:propose`). */
export interface SocialIntroProposal {
  messageId: string;
  introCorrelationId: string;
  candidateOwnerId: string;
  candidatePeerId: string;
  agentPeerId: string;
  agentOwnerId: string;
  rationale?: string;
  receivedAt: string;
  /** True after {@link NodeService.approveSocialIntroCommitment}; opaque ref stays server-side until hello send. */
  commitmentApproved?: boolean;
}

/** Optional flags for {@link NodeService.sendHello} (Trust-mode bond linkage). */
export interface SendHelloOptions {
  /** Matches {@link SocialIntroProposal.messageId}; requires prior approveSocialIntroCommitment. */
  introProposalMessageId?: string;
}

// ============================================
// Bond Types
// ============================================

import type { BondLevel } from "./bond-trust-rank.js";

export type { BondLevel } from "./bond-trust-rank.js";

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
  /** Local vault-relative path — used to open or reveal the file in Library / chat. */
  vaultRelativePath?: string;
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
    deliveryReceipt?: "pending" | "sent" | "delivered" | "read" | "failed";
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
  /**
   * Sender vault-relative path for this file (push offers). Used with {@link NodeService.acceptShare}
   * when remapping the local save path (must match the voucher’s `relativePath` on receive).
   */
  senderVaultRelativePath?: string;
}

/** Query for {@link NodeService.listLibraryItems} */
export interface ListLibraryItemsParams {
  /** Case-insensitive substring match on title or relative path */
  query?: string;
}

/** One file in the local shared vault (all regular files listed; binary files have integrity hashes but no text chunks). */
export interface LibraryItem {
  documentId: string;
  relativePath: string;
  title: string;
  extension: string;
  byteLength: number;
  contentHash: string;
  updatedAt: string;
  /** True when the document is included in the published discovery manifest (see `setLibraryItemPublished`). */
  published: boolean;
  /** Latest Kubo-aligned IPFS export for this document, when present. */
  publishedExternal?: PublishedExternalRecord;
}

/** Persisted metadata from an explicit owner-approved IPFS export (canonical root CID). */
export interface PublishedExternalRecord {
  exportRevision: number;
  exportedAt: string;
  cid: string;
  ipfsInteropRecipe: string;
  kuboVersion: string;
  contentHash: string;
  /** Helia shadow export CID when engine runs in compare mode (H4). */
  cidHelia?: string;
  heliaVersion?: string;
}

export interface ExportLibraryItemToIpfsResult extends PublishedExternalRecord {
  documentId: string;
  relativePath: string;
}

/** Managed/bundled Kubo sidecar status (desktop). */
export interface IpfsEngineStatus {
  /** Primary export engine availability (Kubo or Helia depending on selection). */
  available: boolean;
  running: boolean;
  managed: boolean;
  kuboVersion?: string;
  errorHint?: string;
  /** In-process Helia engine (shadow mode / dual status). */
  helia?: {
    available: boolean;
    heliaVersion?: string;
    errorHint?: string;
  };
  /** Kubo sidecar / CLI when Helia is primary (secondary status). */
  kubo?: {
    available: boolean;
    kuboVersion?: string;
    errorHint?: string;
  };
}

export interface VerifyLibraryItemIpfsGatewayParams {
  documentId: string;
  /** Optional gateway base URL; must be in `externalPublish.gatewayAllowlist`. */
  gatewayUrl?: string;
}

export interface VerifyLibraryItemIpfsGatewayResult {
  documentId: string;
  relativePath: string;
  cid: string;
  gatewayUrl: string;
  contentHashMatches: boolean;
  fetchedBytes: number;
  expectedContentHash: string;
  fetchedContentHash: string;
}

/** Import a file into the local shared vault (desktop folder or mobile filesystem vault). */
export interface ImportToLibraryParams {
  /** Vault-relative path (e.g. `imports/photo.jpg`). */
  relativePath: string;
  /** Raw file bytes, base64-encoded. */
  contentBase64: string;
  mimeType?: string;
}

export interface ImportToLibraryResult {
  documentId: string;
  relativePath: string;
  sizeBytes: number;
}

// ----- Published library discovery (FS-D) -----

export interface DiscoverPublishedLibraryParams {
  /** Substring match on published title or vault path (evaluated by the responder). */
  fileTitleQuery?: string;
  /** Prefix match on base64url content hash (optional). */
  contentHashPrefix?: string;
  maxResultsPerPeer?: number;
  timeoutMsPerPeer?: number;
  /** When set, only these bonded peers are queried. */
  targetOwnerIds?: string[];
}

export interface PublishedLibraryFileHit {
  documentId: string;
  title: string;
  relativePath: string;
  contentHash: string;
  byteLength?: number;
  /** Kubo root CID when the peer included it in discovery metadata. */
  cid?: string;
}

export interface DiscoverPublishedLibraryPeerResult {
  peerOwnerId: string;
  displayName?: string;
  libp2pPeerId: string;
  bondLevel: BondLevel;
  bondRank: number;
  files: PublishedLibraryFileHit[];
  latencyMs: number;
  error?: string;
}

// ----- Agent-assisted flows (FS-E) -----

export interface AgentShareProposal {
  proposalId: string;
  createdAt: string;
  targetOwnerId: string;
  vaultRelativePath: string;
  sensitivity: "public" | "friends" | "private";
  summary?: string;
}

/** Parameters for {@link NodeService.submitAgentShareProposal} (persisted record adds id + timestamp). */
export interface SubmitAgentShareProposalParams {
  targetOwnerId: string;
  vaultRelativePath: string;
  sensitivity: "public" | "friends" | "private";
  summary?: string;
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
  /** Last transport / routing failure (best-effort; cleared on successful `startNode()`). */
  lastError?: string;
  /** ISO timestamp for {@link lastError}. */
  lastErrorAt?: string;
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

export interface ChatDiagnosticsContact {
  peerOwnerId: string;
  peerFound: boolean;
  transportPeerId?: string;
  storedListenAddrs: number;
  dialHintCount: number;
  sampleDialHints: string[];
  badPublicBootstrapHints: number;
  connection?: PeerConnectionInfo;
}

export interface ChatDiagnostics {
  checkedAt: string;
  nodeOnline: boolean;
  localPeerId: string;
  relayEnabled: boolean;
  relayClientSchedulerActive: boolean;
  relayControlTargets: string[];
  lastRelayCheckin?: {
    at: string;
    source: "node-service" | "cli";
    results: Array<{ target: string; ok: boolean; error?: string }>;
  };
  lastRelayLookup?: {
    at: string;
    source: "node-service" | "cli";
    ok: boolean;
    peerCount: number;
    circuitAddrsStored: number;
    error?: string;
  };
  connectionStats: {
    totalPeers: number;
    totalConnections: number;
    circuitPeers: number;
    circuitConnections: number;
  };
  discoverySeedCount: number;
  circuitSeedCount: number;
  contact?: ChatDiagnosticsContact;
  hints: string[];
}

// ============================================
// NodeService Interface
// ============================================

export interface NodeServiceEvents {
  // Connection events
  "hello:request": HelloRequest;
  "hello:response": HelloResponse;
  /** Agent-mediated intro propose surfaced to owner inbox (Trust mode). */
  "social.intro:propose": SocialIntroProposal;
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
  /** Agent suggested sharing a vault file — owner confirms via share or dismisses (FS-E). */
  "share:agent-proposed": AgentShareProposal;
  /** File transfer progress for UI and agent visibility (ADB-D). */
  "share:progress": TransferStatus;
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

  // Config events
  "config:updated": { autonomousKillSwitch: boolean; autonomousPolicies: readonly AutonomousPolicy[]; chatAssistEnabled: boolean; modelProviders: ModelProviderConfig; aiSettings?: AiSettings; contactAiPreferences: ContactAiPreferences[] };

  // Agent bridge events
  "bridge:status": BridgeStatus;

  // P2P relay events — raw inbound envelopes for remote clients with their own identity
  "p2p:envelope": { envelope: Record<string, unknown>; remotePeerId: string };
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
  sendHello(
    targetOwnerId: string,
    profile: HelloProfile,
    message: string,
    options?: SendHelloOptions,
  ): Promise<HelloResponse>;

  /**
   * Accept a pending hello request
   */
  acceptHello(messageId: string): Promise<void>;

  /**
   * Trust mode — persist inbound {@link SocialIntroProposal} and notify listeners / WS clients.
   */
  storePendingSocialIntroProposal(proposal: SocialIntroProposal): void;

  /**
   * Pending intro proposes awaiting owner review (memory-only; survives until approve/decline/send).
   */
  listPendingSocialIntroProposals(): Promise<SocialIntroProposal[]>;

  /**
   * Owner approved bonding after reviewing an intro; generates opaque {@link ownerCommitmentRef} for the next hello.
   */
  approveSocialIntroCommitment(messageId: string): Promise<{ ownerCommitmentRef: string }>;

  declineSocialIntroProposal(messageId: string): Promise<void>;

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
   * Forward a pre-signed EnvoyEnvelope from a remote client (e.g. mobile app)
   * into the P2P mesh. The envelope must already be signed by the sender's key.
   * The node validates the envelope schema but does NOT re-sign or inspect payloads.
   *
   * Used by remote P2P clients that have their own Ed25519 identity but no
   * direct libp2p connection — the node acts as a P2P proxy.
   *
   * @param envelopeJson The signed EnvoyEnvelope JSON object
   * @param dialHints Optional multiaddrs to try when dialing the recipient
   */
  forwardEnvelope(envelopeJson: Record<string, unknown>, dialHints?: string[]): Promise<void>;

  /**
   * Forward a single HomeClaw Core HTTP request from the Companion app to Core on the home LAN.
   * Path must match an allowlisted prefix (SSR-safe); URLs are not accepted.
   */
  homeclawCoreProxy(params: HomeClawCoreProxyParams): Promise<HomeClawCoreProxyResult>;

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
   * Pending inbound file share offers (preview message id = {@link ShareOffer.shareId}).
   */
  listPendingShareOffers(): Promise<ShareOffer[]>;

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

  /**
   * List documents in the local shared vault (same files used for vault RAG indexing).
   */
  listLibraryItems(params?: ListLibraryItemsParams): Promise<LibraryItem[]>;

  /**
   * Mark a vault document as published for metadata-only `discovery.request` matches (no file bytes).
   */
  setLibraryItemPublished(documentId: string, published: boolean): Promise<void>;

  /**
   * Export a vault document to IPFS via Kubo `ipfs add` (interop recipe v1).
   * Requires `externalPublish.allowIpfs` in node config. Desktop only.
   */
  exportLibraryItemToIpfs(documentId: string): Promise<ExportLibraryItemToIpfsResult>;

  /** Kubo sidecar / managed daemon status (desktop IPFS export). */
  getIpfsEngineStatus(): Promise<IpfsEngineStatus>;

  /**
   * Fetch exported content from an allowlisted IPFS gateway and verify bytes match vault contentHash.
   * Requires `externalPublish.allowIpfs` and a non-empty gateway allowlist (desktop Kubo or mobile Helia).
   */
  verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult>;

  /**
   * Write bytes into the local shared vault at a relative path (import from file picker).
   */
  importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult>;

  /** Resolve a vault-relative path to an absolute path on this device (path safety enforced). */
  resolveLibraryItemPath(relativePath: string): Promise<{ vaultRelativePath: string; absolutePath: string }>;

  /** Open a vault file with the OS default application. Desktop node only. */
  openLibraryItem(relativePath: string): Promise<void>;

  /** Reveal a vault file in Finder / Explorer / file manager. Desktop node only. */
  revealLibraryItemInFileManager(relativePath: string): Promise<void>;

  /**
   * Query bonded contacts for published library metadata (`libraryMatches` in `discovery.response`).
   * Peers are queried in trust order (direct first). Requires an online mesh route to each peer.
   */
  discoverPublishedLibrary(params?: DiscoverPublishedLibraryParams): Promise<DiscoverPublishedLibraryPeerResult[]>;

  // ----- Agent-assisted (FS-E placeholder) -----

  /**
   * Pending agent-proposed file shares awaiting owner action (FS-E — empty until wired to agent runtime).
   */
  listAgentShareProposals(): Promise<AgentShareProposal[]>;

  dismissAgentShareProposal(proposalId: string): Promise<void>;

  /**
   * Record an agent-proposed file share for owner review (bridge HTTP or future agent runtime).
   * Persists and emits `share:agent-proposed`.
   */
  submitAgentShareProposal(params: SubmitAgentShareProposalParams): Promise<AgentShareProposal>;

  /**
   * Active file transfers (negotiating or transferring). Completed transfers remain queryable by correlation id.
   */
  listActiveTransfers(): Promise<TransferStatus[]>;

  /** Lookup transfer status by correlation id from share / data-transfer flows. */
  getTransferStatus(correlationId: string): Promise<TransferStatus | undefined>;

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

  // ----- Agent Bridge -----

  /**
   * Get agent bridge status (external agent like HomeClaw/OpenClaw).
   * Returns default disabled status when bridge is not configured.
   */
  getBridgeStatus(): Promise<BridgeStatus>;

  /**
   * Get pairing payload for mobile-app QR pairing (Phase 10A).
   *
   * Returns the data needed to construct the `envoy://pair` URI:
   *   wsUrl, relayPeerId, agentPeerId, agentPubKey
   *
   * Used by the Social UI to display a pairing QR code that the
   * HomeClaw mobile app can scan.
   */
  getPairingPayload(): Promise<PairingPayload>;

  /**
   * Validate a QR pairing token and create a persistent session token.
   *
   * Called by the mobile app after scanning the QR code. On success, the mobile
   * app saves the returned sessionToken and uses it for future reconnections
   * without re-scanning.
   *
   * Also creates a trust record at "direct" level for the requester.
   */
  pairDevice(params: PairDeviceParams): Promise<PairDeviceResult>;

  /**
   * Shared-identity pairing (Phase 11).
   *
   * Like pairDevice but also:
   * - Signs a DeviceCertificate authorizing the mobile device
   * - ECDH-encrypts the owner private key for secure transfer
   *
   * Called by the Capacitor mobile app when pairing in shared-identity mode
   * (same ownerId as the home node).
   */
  pairSharedIdentity(params: PairSharedIdentityParams): Promise<PairSharedIdentityResult>;

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

  /**
   * Pre-dial a bonded contact so relay/P2P paths are warm before chat or file share.
   */
  warmContactConnection(peerOwnerId: string): Promise<PeerConnectionInfo>;

  /**
   * Operator diagnostics for cross-NAT chat: relay cycles, dial hints, and human-readable hints.
   * @param peerOwnerId Optional bonded contact owner id to inspect dial hints for.
   */
  getChatDiagnostics(peerOwnerId?: string): Promise<ChatDiagnostics>;

  // ----- AI / Knowledge Query -----

  /**
   * Query the AI model with a knowledge question.
   * Returns the AI's response text.
   */
  knowledgeQuery(question: string): Promise<string>;

  /**
   * Native Envoy AI turn: routes document intents to tools, falls back to vault knowledgeQuery.
   */
  runDocumentAgentTurn(message: string): Promise<DocumentAgentTurnResult>;

  // ----- Activity Tracking -----

  /**
   * Record owner activity (call when owner sends any message via WebSocket).
   * Used for online/offline detection.
   */
  recordOwnerActivity(): void;

  /**
   * Check if the owner is currently online based on:
   * - Manual mode: returns the manual isOnline setting
   * - Automatic mode: returns true if activity within timeout (5 min)
   */
  isOwnerOnline(): Promise<boolean>;
}