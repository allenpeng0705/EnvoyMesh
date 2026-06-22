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
import type { OwnerAgentTurnResult } from "./owner-agent-loop.js";
import type { DocumentAcquisitionJob } from "./document-acquisition.js";
import type { CapabilityProviderJob } from "./capability-provider.js";
import type { SocialProxySession } from "./social-proxy-session.js";
import type { OwnerDidPresentation, DidServiceEndpoint } from "./owner-did-presentation.js";
import type { ResolveDidImportResult, ResolvedDidImport, ResolveDidExportResult } from "./did-import.js";
import type {
  CommerceReceiptRecord,
  ListCommerceReceiptsParams,
  RecordCommerceReceiptParams,
} from "./commerce-receipt.js";
export type { ResolveDidImportResult, ResolvedDidImport };
export type { CommerceReceiptRecord, ListCommerceReceiptsParams, RecordCommerceReceiptParams };
import type { RagIndexProgress, RagIndexStatus } from "./rag-index-status.js";
import type {
  ChainPlanParams,
  ChainPlanResult,
  ChainLaunchParams,
  ChainLaunchResult,
  ChainGetStateParams,
  ChainGetStateResult,
  ChainListActiveParams,
  ChainListActiveResult,
  ChainCancelParams,
  ChainCancelResult,
  ChainListReportsParams,
  ChainListReportsResult,
  ChainGetReportParams,
  ChainGetReportResult,
  ChainPinReportParams,
  ChainPinReportResult,
  ChainSetBidStrategyParams,
  ChainSetBidStrategyResult,
  ChainGetBidStrategyParams,
  ChainGetBidStrategyResult,
  ChainEvaluateBidsParams,
  ChainEvaluateBidsResult,
  ChainCounterBidParams,
  ChainCounterBidResult,
  ChainRebalanceParams,
  ChainRebalanceResult,
  ChainGetDefaultsParams,
  ChainGetDefaultsResult,
  ChainSetDefaultsParams,
  ChainSetDefaultsResult,
  ChainPreviewGoalParams,
  ChainPreviewGoalResult,
  ChainStartFromGoalParams,
  ChainStartFromGoalResult,
  ChainExportCostsParams,
  ChainExportCostsResult,
  ChainListRecipesParams,
  ChainListRecipesResult,
  ChainSaveRecipeParams,
  ChainSaveRecipeResult,
  ChainDeleteRecipeParams,
  ChainDeleteRecipeResult,
  ChainReportReceivedEvent,
} from "./ws-protocol.js";
import type { TransferStatus } from "./transfer-status.js";
import type {
  CompanyInviteRecord,
  CreateCompanyInviteParams,
  CreateCompanyInviteResult,
  ListCompanyInvitesResult,
  RevokeCompanyInviteResult,
} from "./company-invite.js";
import type {
  BridgeStatus,
  OpenClawStatus,
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
  PairWithHomeNodeParams,
  PairWithHomeNodeResult,
  PairThinClientParams,
  PairThinClientResult,
  UpdateMyListenAddrsParams,
  UpdateMyListenAddrsResult,
  ListAuthorizedDevicesResult,
  RevokeAuthorizedDeviceParams,
  RevokeAuthorizedDeviceResult,
  MergeAuthorizedDevicesParams,
  MergeAuthorizedDevicesResult,
  PruneRevokedDevicesResult,
  ListDeviceRevocationsResult,
  SendChatParams,
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

/** Cached bonded-peer profile (thumbnail bytes when received via profile.sync). */
export interface PeerProfileView {
  ownerId: string;
  profile: HumanProfile;
  cachedAt: string;
  thumbnailContentBase64?: string;
  thumbnailMimeType?: "image/jpeg" | "image/png" | "image/webp";
}

export interface CreateHumanProfileInput {
  displayName: string;
  username: string;
  bio?: string;
  gender?: string;
  hobbies?: string[];
  knowledge?: string[];
  profileVisibility?: "public" | "private";
  discoveryLocation?: import("@envoymesh/protocol").DiscoveryLocation;
  discoveryLocationPrecision?: import("@envoymesh/protocol").DiscoveryLocationPrecision;
  capabilities?: CapabilityUnion[];
}

export interface SetPublicProfileThumbnailParams {
  contentBase64: string;
  mimeType: import("./profile-media.js").ProfilePhotoMime;
}

export interface UpsertProfileGalleryPhotoParams {
  contentBase64: string;
  mimeType: import("./profile-media.js").ProfilePhotoMime;
  visibility: import("./profile-media.js").ProfileGalleryPhotoVisibility;
  label?: string;
  photoId?: string;
}

export interface UpdateProfileGalleryPhotoVisibilityParams {
  vaultRelativePath: string;
  visibility: import("./profile-media.js").ProfileGalleryPhotoVisibility;
}

export interface AgentIdentityDocument {
  content: string;
  updatedAt: string;
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
    /** Wire role persisted for Phase 13 actor disclosure (defaults to human when absent). */
    actorRole?: "human" | "agent" | "system";
    agentId?: string;
    agentVerified?: boolean;
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
    /** UI routing: bridge reminders and proactive OpenClaw replies → EnvoyAI chat. */
    deliveryChannel?: "ai" | "inbox" | "chat" | "agent";
    /** Origin of a locally delivered bridge message (diagnostics only). */
    deliverySource?: "bridge";
    /** EnvoyAI turn metadata for job chips / approvals after reload. */
    assistantTurn?: {
      domain?: string;
      intent?: string;
      jobId?: string;
      correlationId?: string;
      pendingApproval?: boolean;
      routeId?: string;
      modelUsed?: "openclaw" | "native";
      format?: string;
      blocks?: import("./owner-agent-types.js").StructuredBlock[];
    };
    /** Group chat: owners who have acked delivery. */
    deliveredToOwnerIds?: string[];
    /** Group chat: owners still awaiting delivery ack. */
    pendingRecipientOwnerIds?: string[];
  };
  signature: string;
}

/** Result of an outbound chat send (transport accepted the envelope). */
export interface SendChatResult {
  messageId: string;
  deliveryReceipt?: "sent" | "delivered";
  deliveredAt?: string;
  deliveredToOwnerIds?: string[];
  pendingRecipientOwnerIds?: string[];
}

/** Owner-created group chat room (membership synced via chat.room.sync). */
export interface ChatRoom {
  roomId: string;
  title: string;
  creatorOwnerId: string;
  memberOwnerIds: string[];
  revision: number;
  updatedAt: string;
}

export {
  chatRoomThreadKey,
  parseChatRoomThreadKey,
  isChatRoomThreadKey,
} from "./chat-room-thread.js";

export interface ChatRoomMessageEvent {
  roomId: string;
  message: ChatMessage;
}

// ============================================
// Agent Activity Types (Phase 13D — local store, not EMP)
// ============================================

export type AgentActivityDomain = "social" | "knowledge" | "home" | "research";

export type AgentActivityKind =
  | "task_started"
  | "task_progress"
  | "task_completed"
  | "task_failed"
  | "knowledge_answered"
  | "intro_sync"
  | "friend_autopilot_pass"
  | "social_proxy_transition"
  | "document_acq_stage"
  | "capability_provider_stage"
  | "share_proposed"
  | "approval_needed"
  | "report_received"
  | "commerce_receipt";

export interface AgentActivityEvidence {
  type: string;
  ref: string;
}

export interface AgentActivityRecord {
  activityId: string;
  correlationId?: string;
  taskId?: string;
  domain: AgentActivityDomain;
  kind: AgentActivityKind;
  summary: string;
  remoteOwnerId?: string;
  remoteAgentId?: string;
  remoteActorRole?: "agent" | "human";
  evidence?: AgentActivityEvidence[];
  requiresOwnerAction?: boolean;
  createdAt: string;
}

export interface ListAgentActivityParams {
  since?: string;
  until?: string;
  limit?: number;
  correlationId?: string;
  domain?: AgentActivityDomain;
  remoteOwnerId?: string;
}

/** Summary of a pending approval queue item (Phase 9H / 13). */
export interface PendingApprovalSummary {
  id: string;
  actionType: string;
  title: string;
  description: string;
  draftContent: string;
  contactOwnerId?: string;
  contactDisplayName?: string;
  priority: string;
  requestedAt: string;
}

export interface ApprovePendingApprovalResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

export type AgentInteractionMode = "chat_ok" | "structured_preferred";

export interface CachedAgentCardSummary {
  ownerId: string;
  displayName: string;
  capabilities: string[];
  cachedAt: string;
  sourceAgentPeerId?: string;
  /** Phase 34: rich card fields forwarded from the peer AgentCard. */
  nodeProfile?: import("@envoymesh/protocol").DeviceProfile;
  publicTopics?: string[];
  trustPolicySummary?: {
    acceptsDirectBondRequests?: boolean;
    acceptsReferralRequests?: boolean;
    requiresHumanApprovalForRawFiles?: boolean;
  };
  supportedProtocolVersions?: string[];
}

export interface AuditEventSummary {
  eventId: string;
  type: string;
  createdAt: string;
  intent?: string;
  taskId?: string;
  correlationId?: string;
  remotePeerId?: string;
  direction?: string;
  outcome: string;
  summary: string;
}

export interface ListAuditEventsParams {
  correlationId?: string;
  taskId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface TaskJournalSummary {
  eventId: string;
  taskId: string;
  eventType: string;
  summary: string;
  createdAt: string;
  mandateId?: string;
}

export interface ListTaskJournalParams {
  taskId?: string;
  limit?: number;
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
  /** Portable did:key when owner public key is known */
  did?: string;
  /** Where this hit came from (local bond, DHT topic, rendezvous, …) */
  discoverySource?: "local" | "dht-capability-topic" | "dht-peer-routing" | "rendezvous" | "did-lookup";
  trustLevel?: string;
  signedRecordValid?: boolean;
}

export interface SearchQuery {
  /** Bonded-contact DID or envoy:owner id lookup */
  did?: string;
  /** Direct peer ID lookup (e.g., "12D3KooWSHXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q") */
  peerId?: string;
  /** DHT topic-based discovery - peers advertising this topic will be found */
  topic?: string;
  /** Multiple DHT topics (merged, deduped) — used for geo + interest combined search */
  topics?: string[];
  /** Text search in display name/bio/interests (not used when peerId or topic is set) */
  queryText?: string;
  /** Username search - when query matches username pattern */
  username?: string;
  interests?: string[];
  maxResults?: number;
}

export interface ReputationAttestationSummary {
  attestationId: string;
  anchorId: string;
  anchorName: string;
  subjectOwnerId: string;
  claim: string;
  issuedAt: string;
  expiresAt?: string;
  anchorRef?: string;
}

export interface PeerReputationSummary {
  peerOwnerId: string;
  local?: {
    successfulTasks: number;
    failedTasks: number;
    avgLatencyMs: number;
    abuseFlags: string[];
    lastUpdated: string;
  };
  attestations: ReputationAttestationSummary[];
}

// ============================================
// File Sharing Types
// ============================================

export interface ShareOffer {
  shareId: string;
  senderNodeId: string;
  /** Owner id when known — routes post-transfer chat log to the bonded contact thread. */
  senderOwnerId?: string;
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
  /** Group chat: link completed transfer to an existing room message attachment. */
  chatRoomId?: string;
  chatMessageId?: string;
  chatAttachmentId?: string;
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

/** Vault or OpenClaw workspace — unified local file entry for Library UI and agent tools. */
export type LocalFileSource = "vault" | "workspace";

export interface LocalFileItem {
  source: LocalFileSource;
  relativePath: string;
  title: string;
  extension: string;
  byteLength: number;
  updatedAt: string;
  /** Present for vault files */
  documentId?: string;
  contentHash?: string;
  published?: boolean;
  publishedExternal?: PublishedExternalRecord;
}

export interface ListAllLocalFilesParams {
  /** Case-insensitive substring match on title or relative path */
  query?: string;
}

export interface ListAllLocalFilesResult {
  items: LocalFileItem[];
  vaultCount: number;
  workspaceCount: number;
}

export interface ReadLocalFileContentParams {
  source: LocalFileSource;
  relativePath: string;
  documentId?: string;
  maxBytes?: number;
}

export interface OpenLocalFileParams {
  source: LocalFileSource;
  relativePath: string;
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

export type PinLibraryItemExternalResult =
  | { ok: true; cid: string; provider: import("./ipfs-pinning.js").IpfsPinningProvider; pinId?: string }
  | { ok: false; error: string };

export interface CreateWanJoinInviteParams {
  /** Hours until invite expires (default 168 = 7 days). */
  expiresInHours?: number;
  note?: string;
}

export interface CreateWanJoinInviteResult {
  token: string;
  uri: string;
  invite: import("./wan-join-invite.js").WanJoinInviteV1;
}

export interface ApplyWanJoinInviteResult {
  ok: true;
  bootstrapPeersAdded: number;
  bootstrapPresetsAdded: number;
  seedsPersisted: number;
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

/** Max raw bytes for a chat attachment send (25 MiB). */
export const MAX_CHAT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Max bytes returned by {@link NodeService.readLibraryItemContent} for inline previews (5 MiB). */
export const MAX_LIBRARY_ITEM_PREVIEW_BYTES = 5 * 1024 * 1024;

export interface SendChatAttachmentParams {
  targetOwnerId: string;
  filename: string;
  contentBase64: string;
  mimeType?: string;
  caption?: string;
  sensitivity?: ChatAttachment["sensitivity"];
}

export interface SendChatAttachmentResult {
  attachmentId: string;
  vaultRelativePath: string;
  shareRequestMessageId: string;
}

export interface SendChatRoomAttachmentParams {
  roomId: string;
  filename: string;
  contentBase64: string;
  mimeType?: string;
  caption?: string;
  sensitivity?: ChatAttachment["sensitivity"];
}

export interface SendChatRoomAttachmentResult {
  messageId: string;
  attachmentId: string;
  vaultRelativePath: string;
  deliveryReceipt?: SendChatResult["deliveryReceipt"];
  deliveredToOwnerIds?: string[];
  pendingRecipientOwnerIds?: string[];
}

export interface ReadLibraryItemContentParams {
  relativePath: string;
  maxBytes?: number;
}

export interface ReadLibraryItemContentResult {
  contentBase64: string;
  mimeType: string;
  sizeBytes: number;
  truncated: boolean;
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
  /** True when this node can spawn local PTY sessions (desktop home node). */
  terminalsAvailable?: boolean;
  /** Paired mobile → home remote capabilities (Slice 2). */
  homeRemote?: import("./home-remote.js").HomeRemoteStatus;
  /** All relay/bootstrap WebSocket URLs the home node is configured to use.
   *  Mobile syncs these on every reconnect to keep fallback candidates current. */
  bootstrapPeers?: string[];
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

/** Options for {@link NodeService.warmContactConnection}. */
export interface WarmContactConnectionOptions {
  /** Close stale libp2p paths and force a fresh dial (use after send failure). Default false. */
  redial?: boolean;
  /** When true, only verify an existing libp2p path (no dial). Use for online UI polls. Default false. */
  verifyOnly?: boolean;
  /** When true, close relay and try direct LAN if hints exist (chat send). Default false. */
  upgradeRelayToDirect?: boolean;
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

export type WanConnectivityAxisState = "ok" | "degraded" | "fail" | "unknown" | "disabled";

export interface WanConnectivityAxis {
  state: WanConnectivityAxisState;
  explanation: string;
}

export interface ConnectivityStageDSnapshot {
  discoveryProfile: "lan-fast" | "wan-default" | "unknown";
  bootstrapPeerCount: number;
  discoveredPeerCount: number;
  relayDiscoveryCount: number;
  bootstrapProbeSuccessCount: number;
  bootstrapProbeFailureCount: number;
  reprobeOkCount: number;
  reprobeFailCount: number;
  warningCount: number;
  badge: "ok" | "warn" | "starting" | "unknown";
  badgeExplanation: string;
}

export interface ConnectivityDiagnostics {
  checkedAt: string;
  nodeOnline: boolean;
  stageD: ConnectivityStageDSnapshot;
  axes: {
    bootstrapReachability: WanConnectivityAxis;
    relayAvailability: WanConnectivityAxis;
    holePunch: WanConnectivityAxis;
    policyBlock: WanConnectivityAxis;
    features: {
      relay?: boolean;
      dcutr?: boolean;
      dht?: boolean;
      quic?: boolean;
    };
  };
  quicEnabled: boolean;
  hints: string[];
  /** Operator steps for live multi-machine sign-off (Phase 15B). */
  signOffChecklist: string[];
}

export interface MorningReportEntry {
  ownerId: string;
  peerId?: string;
  displayName?: string;
  trustLevel: string;
  score: number;
  reason: string;
  lastSeenAt?: string;
  discoveryMatchCount: number;
  hopDistance?: number;
  /** Phase 17C: location peer-count summary (not an individual peer row). */
  geoCitySummary?: {
    peerCount: number;
    cityLabel: string;
  };
}

export interface DiscoverCapabilityTopicParams {
  topic: string;
  maxResults?: number;
  /** When true, send policy-gated discovery.request to bonded providers only. */
  followUpDiscovery?: boolean;
  requestedCapabilities?: string[];
  /** Story D: max hops for follow-up discovery.request (default 2). */
  maxHops?: number;
}

export interface RequestMultiHopDiscoveryParams {
  requestedCapabilities?: string[];
  requestedTagHashes?: string[];
  fileTitleQuery?: string;
  maxHops?: number;
  maxBonds?: number;
}

export interface MultiHopDiscoveryMatch {
  ownerId: string;
  peerId: string;
  hopDistance: number;
  matchedCapabilities: string[];
  matchedTagHashes: string[];
  /** Direct bond used for hop-1 query, or referral for hop-2+. */
  viaOwnerId?: string;
  viaDisplayName?: string;
  referralOwnerId?: string;
  trustPath?: string;
}

export interface RequestMultiHopDiscoveryResult {
  matches: MultiHopDiscoveryMatch[];
  bondsQueried: number;
  correlationId: string;
  pendingForwardApprovals: number;
  aggregatedMatchCount: number;
}

export interface MultiHopDiscoverySessionView {
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  bondsQueried: number;
  pendingForwardApprovals: number;
  awaitingHop2ViaBonds?: string[];
  matches: MultiHopDiscoveryMatch[];
}

export interface CapabilityTopicProviderHit {
  peerId: string;
  multiaddrs: string[];
  ownerId?: string;
  displayName?: string;
  trustLevel?: string;
  signedRecordValid?: boolean;
  followUpMatchCount?: number;
  followUpError?: string;
  discoverySource: "dht-capability-topic";
}

export interface DiscoverCapabilityTopicResult {
  topic: string;
  providers: CapabilityTopicProviderHit[];
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
  /** Bonded peer profile cache updated (profile.sync / profile.response). */
  "profile:updated": { ownerId: string };

  // Chat events
  "chat:message": ChatMessage;
  "chat:room-updated": ChatRoom;
  "chat:room-removed": { roomId: string };
  "chat:room-message": ChatRoomMessageEvent;
  "chat:draft": { threadPeerOwnerId: string; draft: ChatDraft };
  "chat:auto-reply-paused": import("./auto-reply-limits.js").AutoReplyPausedNotification;
  /** Owner Activity feed row (Phase 13D — local, not wire). */
  "agent:activity": AgentActivityRecord;
  "chat:delivered": { messageId: string; timestamp: string; recipientOwnerId?: string };
  "chat:read": { messageId: string; timestamp: string };
  /**
   * Emitted when an outbound chat message has given up trying to reach a
   * specific recipient (e.g. peer unreachable after max retries). UI can
   * surface this so the user knows which contacts are offline.
   */
  "chat:delivery-failed": {
    threadKey: string;
    messageId: string;
    recipientOwnerId: string;
    reason: string;
  };

  // File sharing events
  "share:offered": ShareOffer;
  /** Agent suggested sharing a vault file — owner confirms via share or dismisses (FS-E). */
  "share:agent-proposed": AgentShareProposal;
  /** File transfer progress for UI and agent visibility (ADB-D). */
  "share:progress": TransferStatus;
  /** Vault vector indexing progress for Settings AI tab. */
  "rag:reindex": RagIndexProgress;
  "share:accepted": { shareId: string; savePath: string };
  "share:declined": { shareId: string };

  // Peer discovery
  "peer:discovered": PeerSearchResult;
  "peer:lost": { nodeId: string };
  "discovery:advertising-complete": { topics: string[]; success: boolean };

  /** Multi-hop discovery aggregation updated (hop-2 forward responses merged). */
  "discovery:multihop-update": MultiHopDiscoverySessionView;

  /** yjs / CRDT delta from paired owner device (sync.state). */
  "crdt:sync": { scope: string; updateBase64: string; senderOwnerId: string; remotePeerId: string };

  // Connection state
  "node:online": { peerId: string; multiaddrs: string[] };
  "node:offline": { peerId: string };
  "node:status": { status: NodeStatus; peerId?: string };
  /** Mesh/libp2p is up — safe to warm contacts and send chat. */
  "node:ready": { timestamp: number };

  // Config events
  "config:updated": { autonomousKillSwitch: boolean; autonomousPolicies: readonly AutonomousPolicy[]; chatAssistEnabled: boolean; modelProviders: ModelProviderConfig; aiSettings?: AiSettings; contactAiPreferences: ContactAiPreferences[] };

  // Paired-mode bootstrap events (mobile only, but harmless for the desktop) —
  // emitted by the bootstrap that runs after a successful home pairing, refreshing
  // the UI to show the home's actual state.
  "home:config-updated": { config: import("./ws-protocol.js").NodeConfig };
  "home:bonds-updated": { bonds: BondRecord[] };
  "home:bootstrap-ok": {};
  "home:bootstrap-failed": { error: string };
  "home:agent-cards-updated": { cards: CachedAgentCardSummary[] };

  // Agent bridge events
  "bridge:status": BridgeStatus;

  // P2P relay events — raw inbound envelopes for remote clients with their own identity
  "p2p:envelope": { envelope: Record<string, unknown>; remotePeerId: string };
  // Phase 25A — mesh-awareness insight surfaced to UI.
  "agent:awareness": {
    kind: string;
    summary: string;
    matchedTopic: string;
    peerCount: number;
    createdAt: string;
  };

  /** Terminal session list changed (Phase 30). */
  "terminal:session-updated": { sessions: import("./terminal.js").TerminalSessionSummary[] };

  /** Background terminal watch fired after stable output (Phase 31D). */
  "terminal:watch-ready": import("./terminal-agent.js").TerminalWatchReadyEvent;

  /** EnvoyAI replied with a terminal command proposal for a correlated session (Phase 31D). */
  "terminal:assistant-proposal": import("./terminal-agent.js").TerminalAssistantProposalEvent;

  /** Home terminal PTY tunnel bytes (Phase 30E — mobile HomeRemote). */
  "homeTerminalWs:rx": { dataBase64: string };
  "homeTerminalWs:closed": Record<string, never>;

  /** Phase 43D — live chain state push for ChainsView. */
  "chain:state": ChainGetStateResult;

  /** Phase 43D — chain report ready for inline chat card. */
  "chain:report": ChainReportReceivedEvent;
}

export interface NodeService {
  // ----- Identity -----

  /**
   * Get current node's identity and profile
   */
  getProfile(): NodeProfile;

  /**
   * Portable W3C did:key presentation for the owner (read-only; envoy:owner id remains canonical).
   */
  getOwnerDidPresentation(): OwnerDidPresentation;

  /**
   * Resolve external `did:key` or JSON DID document to envoy owner id + PEM (no WAN gateway).
   */
  resolveDidImport(input: string): Promise<ResolveDidImportResult>;

  /**
   * Export the owner's DID document as portable JSON (with optional service
   * endpoints). The returned string is suitable for sharing, file export,
   * or handoff to another tool.
   */
  exportDidDocument(input?: { services?: DidServiceEndpoint[] }): string;

  /**
   * Resolve an envelope-wrapped DID export (output of exportDidDocument).
   * Validates the envelope, the DID/key/owner-id consistency, and the
   * service endpoints.
   */
  resolveDidExport(input: string): Promise<ResolveDidExportResult>;

  /**
   * Store a contact owner public key for bonded DID search lookup.
   */
  cacheDidContactKey(params: { ownerId: string; publicKeyPem: string }): Promise<{ ok: boolean; reason?: string }>;

  /**
   * Local reputation score + opt-in anchor attestations for a bonded peer.
   */
  getPeerReputationSummary(peerOwnerId: string): Promise<PeerReputationSummary>;

  /**
   * Get current node's human profile
   */
  getHumanProfile(): Promise<HumanProfile | undefined>;

  /**
   * Update human profile (signs with owner key)
   */
  updateHumanProfile(profile: CreateHumanProfileInput): Promise<HumanProfile>;

  /** Set the always-public profile thumbnail (stored in vault, referenced on signed profile). */
  setPublicProfileThumbnail(params: SetPublicProfileThumbnailParams): Promise<HumanProfile>;

  /** Add or replace a gallery photo with per-photo visibility. */
  upsertProfileGalleryPhoto(params: UpsertProfileGalleryPhotoParams): Promise<HumanProfile>;

  /** Remove a gallery photo from profile and vault index. */
  removeProfileGalleryPhoto(params: { vaultRelativePath: string }): Promise<HumanProfile>;

  /** Update visibility on an existing gallery photo. */
  updateProfileGalleryPhotoVisibility(params: UpdateProfileGalleryPhotoVisibilityParams): Promise<HumanProfile>;

  /** Cached signed profile for a bonded peer (includes inline thumbnail when synced). */
  getPeerProfile(ownerId: string): Promise<PeerProfileView | undefined>;

  /** List all cached peer profiles. */
  listPeerProfiles(): Promise<PeerProfileView[]>;

  /** Ask a bonded peer to send profile.sync (e.g. after bond established). */
  requestPeerProfile(ownerId: string): Promise<{ ok: boolean; reason?: string }>;

  /** Push local signed profile (and thumbnail bytes) to all bonded peers. */
  syncProfileToBonds(): Promise<void>;

  /** Re-sync local profile to bonds and request fresh profiles from each bond (e.g. after mesh online). */
  refreshBondPeerProfiles(): Promise<{ requested: number; failed: number }>;

  /**
   * Get owner-editable agent operating instructions (`agent-identity.md` in profile dir).
   */
  getAgentIdentity(): Promise<AgentIdentityDocument>;

  /**
   * Save agent operating instructions.
   */
  updateAgentIdentity(content: string): Promise<AgentIdentityDocument>;

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
  sendChat(targetOwnerId: string, text: string, attachments?: SendChatParams["attachments"]): Promise<SendChatResult>;

  /**
   * Send AI/agent chat with honest wire role (`senderRole=agent` + `agentCredential`).
   */
  sendAgentChat(targetOwnerId: string, text: string): Promise<SendChatResult>;

  /**
   * Send an image or file directly in a chat thread (P2P transfer, auto-accepted for direct bonds).
   */
  sendChatAttachment(params: SendChatAttachmentParams): Promise<SendChatAttachmentResult>;

  /**
   * Read vault file bytes for inline previews (images in chat). Size-capped.
   */
  readLibraryItemContent(params: ReadLibraryItemContentParams): Promise<ReadLibraryItemContentResult>;

  /**
   * Read a local file from the vault or OpenClaw workspace (for Library preview/open).
   */
  readLocalFileContent(params: ReadLocalFileContentParams): Promise<ReadLibraryItemContentResult>;

  /**
   * List all local files (vault + OpenClaw workspace) in one unified view.
   */
  listAllLocalFiles(params?: ListAllLocalFilesParams): Promise<ListAllLocalFilesResult>;

  /**
   * Open a local file with the OS default app or mobile viewer (full file; no preview size cap).
   */
  openLocalFile(params: OpenLocalFileParams): Promise<void>;

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

  /** List locally known group chat rooms. */
  listChatRooms(): Promise<ChatRoom[]>;

  /** Create a group room and invite bonded members (fan-out chat.room.sync). */
  createChatRoom(title: string, memberOwnerIds: string[]): Promise<ChatRoom>;

  /** Add bonded members to an existing room. */
  inviteToChatRoom(roomId: string, memberOwnerIds: string[]): Promise<ChatRoom>;

  /** Leave a group room (notifies remaining members via chat.room.sync). */
  leaveChatRoom(roomId: string): Promise<void>;

  /** Creator removes bonded members from a group room. */
  removeMembersFromChatRoom(roomId: string, memberOwnerIds: string[]): Promise<ChatRoom>;

  /** Creator renames a group room (fan-out chat.room.sync rename). */
  renameChatRoom(roomId: string, title: string): Promise<ChatRoom>;

  /** Creator dismisses the group for all members. */
  dismissChatRoom(roomId: string): Promise<void>;

  /** Send a message to all room members (fan-out chat.room.message). */
  sendChatRoomMessage(roomId: string, text: string): Promise<SendChatResult>;
  /** Send a file attachment to all room members (message + per-member file transfer). */
  sendChatRoomAttachment(params: SendChatRoomAttachmentParams): Promise<SendChatRoomAttachmentResult>;

  /**
   * Owner Activity timeline (`agent-activity.jsonl`).
   */
  listAgentActivity(params?: ListAgentActivityParams): Promise<AgentActivityRecord[]>;

  /** Story E receipt-only ledger (local JSON — no payment rail). */
  listCommerceReceipts(params?: ListCommerceReceiptsParams): Promise<CommerceReceiptRecord[]>;

  /** Record outbound delivery receipt for a vault document (links task + contentHash/CID). */
  recordCommerceReceipt(params: RecordCommerceReceiptParams): Promise<CommerceReceiptRecord>;

  /** Filtered audit trail for Activity drill-down (summaries only). */
  listAuditEvents(params?: ListAuditEventsParams): Promise<AuditEventSummary[]>;

  /** Task journal rows for Activity drill-down. */
  listTaskJournalEntries(params?: ListTaskJournalParams): Promise<TaskJournalSummary[]>;

  /** Cached peer agent cards (Phase 13C). */
  listAgentCards(): Promise<CachedAgentCardSummary[]>;

  getAgentCard(ownerId: string): Promise<CachedAgentCardSummary | undefined>;

  /** Send agent.card.request to a bonded peer (response cached on reply). */
  requestAgentCard(targetOwnerId: string): Promise<{ ok: boolean; error?: string }>;

  /**
   * Latest cached `task.result` payload (with typed Artifacts) for a taskId.
   * Returns `undefined` if the home node has not received a `task.result` for
   * that taskId. Phase 34 — used by the Activity drill-down to render typed
   * Artifacts without re-parsing the wire envelope.
   */
  getTaskResult(taskId: string): Promise<import("@envoymesh/protocol").TaskResultPayload | undefined>;

  /** Pending AI actions awaiting owner approval. */
  listPendingApprovals(): Promise<PendingApprovalSummary[]>;

  /** Approve and execute a pending action (e.g. send_chat → sendAgentChat). */
  approvePendingApproval(itemId: string, notes?: string): Promise<ApprovePendingApprovalResult>;

  rejectPendingApproval(itemId: string, notes?: string): Promise<{ ok: boolean; error?: string }>;

  /** Delete one persisted chat message from a thread (local only). */
  deleteChatMessage(peerOwnerId: string, messageId: string): Promise<{ ok: boolean }>;

  /** Delete all persisted chat messages in a thread (local only). */
  clearChatHistory(peerOwnerId: string): Promise<{ deletedCount: number }>;

  /**
   * Mark messages as read
   */
  markRead(targetOwnerId: string, upToMessageId?: string): Promise<void>;

  /**
   * AI-generated draft replies awaiting human review (not sent until approved).
   */
  getChatDrafts(threadPeerOwnerId?: string): Promise<ChatDraft[]>;

  deleteChatDraft(draftId: string): Promise<void>;

  // ----- Search / Discovery -----

  /**
   * Search for peers by interests or text
   */
  searchPeers(query: SearchQuery): Promise<PeerSearchResult[]>;

  /**
   * Run DHT capability discovery on demand (used when lazy mode skips periodic find).
   */
  runCapabilityDiscovery(params?: { find?: boolean }): Promise<void>;

  /**
   * Query DHT capability topics and optionally follow up with policy-gated discovery.request.
   */
  discoverCapabilityTopic(params: DiscoverCapabilityTopicParams): Promise<DiscoverCapabilityTopicResult>;

  /**
   * Ranked discovery digest (morning report) from trust store + discovery events.
   */
  getMorningReport(params?: { limit?: number }): Promise<MorningReportEntry[]>;

  /** Story D (US-MH1): query direct bonds with hop-limited discovery.request. */
  requestMultiHopDiscovery(params: RequestMultiHopDiscoveryParams): Promise<RequestMultiHopDiscoveryResult>;

  /** Fetch aggregated hop-1/2 matches for a multi-hop session. */
  getMultiHopDiscoverySession(correlationId: string): Promise<MultiHopDiscoverySessionView | undefined>;

  /** Merge async hop-2 discovery.response into an active multi-hop session (originator only). */
  ingestInboundMultiHopDiscoveryResponse(params: {
    correlationId: string;
    responderOwnerId: string;
    matches: Array<{
      ownerId: string;
      peerId: string;
      hopDistance?: number;
      matchedCapabilities: string[];
      matchedTagHashes: string[];
    }>;
    forwardPendingAck?: boolean;
  }): Promise<void>;

  /** Push yjs CRDT delta to paired owner devices (sync.state). */
  sendSyncStateUpdate(params: import("./sync-state.js").SendSyncStateUpdateParams): Promise<import("./sync-state.js").SendSyncStateUpdateResult>;

  /**
   * WAN connectivity axis diagnostics (bootstrap / relay / punch / policy).
   */
  getConnectivityDiagnostics(): Promise<ConnectivityDiagnostics>;

  /**
   * Returns the full list of bootstrap peer addresses for DHT discovery and circuit relay.
   * Called by EnvoyGo after pairing to sync bootstrap peers for future reconnections.
   */
  getBootstrapPeers(): Promise<{ bootstrapPeers: string[] }>;

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
    file: {
      path: string;
      sensitivity: ChatAttachment["sensitivity"];
      deliveryChannel?: "inbox" | "chat" | "agent";
    },
  ): Promise<void>;

  /**
   * Pull a published library file from a bonded peer (`fileOrigin: responder`).
   */
  requestShareFromLibrary(
    targetOwnerId: string,
    file: {
      relativePath: string;
      sensitivity: ChatAttachment["sensitivity"];
      correlationId?: string;
    },
  ): Promise<{ shareRequestMessageId: string }>;

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

  /**
   * Pin an already-exported library CID via an external provider (Pinata JWT env).
   * Requires `externalPublish.allowIpfs` and `externalPublish.pinningEnabled`.
   */
  pinLibraryItemExternal(documentId: string): Promise<PinLibraryItemExternalResult>;

  /** Kubo sidecar / managed daemon status (desktop IPFS export). */
  getIpfsEngineStatus(): Promise<IpfsEngineStatus>;

  /** Vector RAG vault indexing status (incremental reindex progress). */
  getRagIndexStatus(): Promise<RagIndexStatus>;

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
   * Get the live status of the built-in OpenClaw agent (EnvoyAI).
   * `status.enabled` reflects the persisted `openclawEnabled` flag;
   * `status.running` reflects the child process + webhook reachability.
   * Phase 32 — mirrors `getBridgeStatus` for the in-process agent.
   */
  getOpenClawStatus(): Promise<OpenClawStatus>;

  // ClawHub skill marketplace
  getOpenClawPlugins(): Promise<string[]>;
  searchOpenClawPlugins(query: string): Promise<string[]>;
  getTrendingOpenClawPlugins(): Promise<string[]>;
  installOpenClawPlugin(name: string): Promise<{ ok: boolean; message: string }>;
  uninstallOpenClawPlugin(name: string): Promise<{ ok: boolean; message: string }>;
  saveClawhubToken(token: string): Promise<{ ok: boolean }>;
  saveSkillApiKeys(keys: Record<string, string>): Promise<{ ok: boolean }>;
  saveWebSearchEnabled(enabled: boolean): Promise<{ ok: boolean }>;
  sendToOpenClaw(text: string): Promise<void>;
  /** Send a message to the external HTTP bridge agent. */
  sendToBridge(text: string): Promise<void>;
  getPairedDiagnostics(): Promise<Record<string, unknown>>;

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
   * Create a WAN join-invite token + `envoy://join?token=…` URI (Phase 15B).
   * Encodes current bootstrap config and this node's dial hints for cold-start peers.
   */
  createWanJoinInvite(params?: CreateWanJoinInviteParams): Promise<CreateWanJoinInviteResult>;

  /**
   * Apply a WAN join-invite on a running node — merges bootstrap config and discovery seeds.
   */
  applyWanJoinInvite(token: string): Promise<ApplyWanJoinInviteResult>;

  /**
   * Mint a long-lived company invite (Phase 35A: Fleet Onboarding A).
   *
   * The returned `uri` is `envoy://invite?token=…`; the joiner pastes that
   * into their Social UI to complete a `pairDevice` handshake. Tokens are
   * persisted in `LocalCompanyInviteStore` with their `expiresAt` and are
   * auto-rejected once expired or revoked.
   */
  createCompanyInvite(
    params?: CreateCompanyInviteParams,
  ): Promise<CreateCompanyInviteResult>;

  /** List all company invites (active + consumed + revoked + expired). */
  listCompanyInvites(): Promise<ListCompanyInvitesResult>;

  /**
   * Revoke a company invite. Idempotent — revoking a consumed or already-revoked
   * invite returns the latest record unchanged.
   */
  revokeCompanyInvite(inviteId: string): Promise<RevokeCompanyInviteResult>;

  /**
   * Phase 35D — re-sync the pairing-kiosk HTTP server with the latest
   * persisted config. Idempotent: off when `pairingKioskEnabled === false`,
   * otherwise restarts the server with the current token/bind/port.
   */
  syncPairingKioskFromConfig(): Promise<void>;

  /**
   * Phase 35D — return the kiosk's current running state. Useful for the
   * Settings → Devices tab to show a "Kiosk running at http://…" hint.
   */
  getPairingKioskStatus(): Promise<import("./kiosk-status.js").PairingKioskStatus>;

  /**
   * Phase 35B — Fleet Manifest Import. The operator uploads a signed manifest
   * and the runtime walks the roster, pre-staging a `TrustRecord` (and a
   * `PeerDirectory` entry) for every member.
   *
   * Re-importing the same `manifestId` is idempotent: previously applied
   * members are reported as `skipped: [{ reason: "already-imported" }]`.
   *
   * Verifies:
   * - signature is over `fleetManifestForSigning(manifest)` using
   *   `manifest.issuerOwnerPublicKeyPem`
   * - `deriveOwnerId(issuerOwnerPublicKeyPem) === manifest.issuerOwnerId`
   * - `manifest.expiresAt` (if set) is in the future
   */
  importFleetManifest(
    params: import("./fleet-manifest.js").ImportFleetManifestParams,
  ): Promise<import("./fleet-manifest.js").ImportFleetManifestOutcome>;

  /**
   * Phase 35B — list every imported manifest (active + revoked). The output
   * never includes the issuer's PEM or the manifest's signature — only the
   * fingerprints.
   */
  listFleetManifests(): Promise<import("./fleet-manifest.js").ListFleetManifestsResult>;

  /**
   * Phase 35B — drop the trust records this manifest pre-staged. The manifest
   * itself is kept (marked revoked) so the audit log still has a record of who
   * was on the roster. Idempotent: revoking an already-revoked manifest is a
   * no-op.
   */
  revokeFleetManifest(manifestId: string): Promise<import("./fleet-manifest.js").RevokeFleetManifestResult>;

  /**
   * Phase 35B — sign a `FleetManifest` with the local owner's key. Convenience
   * helper so the operator doesn't have to maintain a separate signing tool.
   * Returns a `FleetManifest` ready to be passed to `importFleetManifest` on
   * each member's node.
   */
  createFleetManifest(
    input: import("./fleet-manifest.js").CreateFleetManifestInput,
  ): Promise<import("./fleet-manifest.js").CreateFleetManifestResult>;

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

  /**
   * Mobile-only: scan/paste `envoy://pair` URI and import shared owner identity from home node.
   * Desktop nodes reject this call.
   */
  pairWithHomeNode(params: PairWithHomeNodeParams): Promise<PairWithHomeNodeResult>;

  /**
   * Thin-client pairing (EnvoyGo Flutter app).
   * Lightweight pairing that does not require identity keys or device certificates.
   * The client presents a short-lived pairing token from the home node's QR code.
   * Returns a persistent session token for subsequent WS connections.
   */
  pairThinClient(params: PairThinClientParams): Promise<PairThinClientResult>;

  /**
   * Mobile → Home: Share the mobile's reachable listen addresses (from UPnP).
   * Allows home to dial the mobile directly instead of requiring relay.
   */
  updateMyListenAddrs(params: UpdateMyListenAddrsParams): Promise<UpdateMyListenAddrsResult>;

  /** List owner-authorized satellite devices (shared-identity pairing). */
  listAuthorizedDevices(): Promise<ListAuthorizedDevicesResult>;

  /** Revoke a previously authorized device certificate. */
  revokeAuthorizedDevice(params: RevokeAuthorizedDeviceParams): Promise<RevokeAuthorizedDeviceResult>;

  /**
   * Merge duplicate authorized-device records: keep one as canonical and
   * revoke the rest. Used to clean up historical duplicates created
   * before the mobile app reused a stable device keypair.
   */
  mergeAuthorizedDevices(params: MergeAuthorizedDevicesParams): Promise<MergeAuthorizedDevicesResult>;

  /**
   * Drop every authorized-device entry that has a matching revocation
   * record. The revocation records are kept for audit history; only
   * the entries in the authorized list are removed.
   */
  pruneRevokedDevices(): Promise<PruneRevokedDevicesResult>;

  /** List signed device revocation records for this owner. */
  listDeviceRevocations(): Promise<ListDeviceRevocationsResult>;

  // ----- Terminals (Phase 30) -----

  listTerminalSessions(): Promise<import("./terminal.js").TerminalSessionSummary[]>;
  createTerminalSession(params?: import("./terminal.js").CreateTerminalSessionParams): Promise<import("./terminal.js").TerminalSessionSummary>;
  closeTerminalSession(params: import("./terminal.js").CloseTerminalSessionParams): Promise<void>;
  terminalExec(params: { sessionId: string; command: string }): Promise<{ output: string }>;
  renameTerminalSession(params: import("./terminal.js").RenameTerminalSessionParams): Promise<import("./terminal.js").TerminalSessionSummary>;
  terminalAttach(params: import("./terminal.js").TerminalAttachParams): Promise<import("./terminal.js").TerminalAttachResult>;
  terminalRunFromNaturalLanguage(
    params: import("./terminal-agent.js").TerminalRunFromNaturalLanguageParams,
  ): Promise<import("./terminal-agent.js").TerminalCommandProposal>;
  terminalExecuteProposal(params: import("./terminal-agent.js").TerminalExecuteProposalParams): Promise<void>;
  terminalSetAssistModelOverride(
    params: import("./terminal-agent.js").TerminalSetAssistModelOverrideParams,
  ): Promise<import("./terminal-agent.js").TerminalAssistState>;
  terminalSetInlineSuggestEnabled(
    params: import("./terminal-agent.js").TerminalSetInlineSuggestParams,
  ): Promise<import("./terminal-agent.js").TerminalAssistState>;
  terminalGetAssistState(sessionId: string): Promise<import("./terminal-agent.js").TerminalAssistState>;
  terminalExplainScrollback(
    params: import("./terminal-agent.js").TerminalExplainScrollbackParams,
  ): Promise<import("./terminal-agent.js").TerminalExplainScrollbackResult>;
  terminalSuggestCommand(
    params: import("./terminal-agent.js").TerminalSuggestCommandParams,
  ): Promise<import("./terminal-agent.js").TerminalSuggestCommandResult>;
  terminalObserveStep(
    params: import("./terminal-agent.js").TerminalObserveStepParams,
  ): Promise<import("./terminal-agent.js").TerminalObserveStepResult>;
  terminalOpenClawPlan(
    params: import("./terminal-agent.js").TerminalOpenClawPlanParams,
  ): Promise<import("./terminal-agent.js").TerminalOpenClawPlanResult>;
  terminalRunPlanStep(
    params: import("./terminal-agent.js").TerminalRunPlanStepParams,
  ): Promise<import("./terminal-agent.js").TerminalCommandProposal>;
  terminalEnablePrepareMode(
    params: import("./terminal-agent.js").TerminalEnablePrepareModeParams,
  ): Promise<import("./terminal-agent.js").TerminalEnablePrepareModeResult>;
  terminalWatchStep(
    params: import("./terminal-agent.js").TerminalWatchStepParams,
  ): Promise<import("./terminal-agent.js").TerminalWatchStepResult>;
  terminalPinContextSession(
    params: import("./terminal-agent.js").TerminalPinContextSessionParams,
  ): Promise<import("./terminal-agent.js").TerminalAssistState>;
  terminalDetectFailure(
    params: import("./terminal-agent.js").TerminalDetectFailureParams,
  ): Promise<import("./terminal-agent.js").TerminalFailureDetection>;
  terminalSuggestFixFromFailure(
    params: import("./terminal-agent.js").TerminalSuggestFixParams,
  ): Promise<import("./terminal-agent.js").TerminalCommandProposal>;
  terminalStartGoalLoop(
    params: import("./terminal-agent.js").TerminalStartGoalLoopParams,
  ): Promise<import("./terminal-agent.js").TerminalGoalLoopStepResult>;
  terminalAdvanceGoalLoop(
    params: import("./terminal-agent.js").TerminalAdvanceGoalLoopParams,
  ): Promise<import("./terminal-agent.js").TerminalGoalLoopStepResult>;
  terminalCancelGoalLoop(
    params: import("./terminal-agent.js").TerminalCancelGoalLoopParams,
  ): Promise<import("./terminal-agent.js").TerminalAssistState>;
  terminalClearResumeGoal(sessionId: string): Promise<import("./terminal-agent.js").TerminalAssistState>;
  terminalSendContextToAssistant(
    params: import("./terminal-agent.js").TerminalSendContextToAssistantParams,
  ): Promise<import("./terminal-agent.js").TerminalSendContextToAssistantResult>;
  terminalUpdatePlanProgress(
    params: import("./terminal-agent.js").TerminalUpdatePlanProgressParams,
  ): Promise<import("./terminal-agent.js").TerminalAssistState>;
  terminalGetScrollbackPreview(
    params: import("./terminal-agent.js").TerminalGetScrollbackPreviewParams,
  ): Promise<import("./terminal-agent.js").TerminalGetScrollbackPreviewResult>;
  terminalResumeGoalLoop(
    params: import("./terminal-agent.js").TerminalResumeGoalLoopParams,
  ): Promise<import("./terminal-agent.js").TerminalGoalLoopStepResult>;
  terminalEnableExecPane(
    params: import("./terminal-agent.js").TerminalEnableExecPaneParams,
  ): Promise<import("./terminal-agent.js").TerminalEnableExecPaneResult>;
  terminalSetBackgroundWatch(
    params: import("./terminal-agent.js").TerminalSetBackgroundWatchParams,
  ): Promise<import("./terminal-agent.js").TerminalAssistState>;
  terminalClearBackgroundWatch(
    params: import("./terminal-agent.js").TerminalClearBackgroundWatchParams,
  ): Promise<import("./terminal-agent.js").TerminalAssistState>;
  openInHerdr(params?: import("./terminal.js").OpenInHerdrParams): Promise<import("./terminal.js").OpenInHerdrResult>;
  terminalGetHerdrExportHint(
    params: import("./terminal.js").TerminalHerdrExportHintParams,
  ): Promise<import("./terminal.js").TerminalHerdrExportHintResult>;
  homeTerminalWsOpen(params: import("./home-remote.js").HomeTerminalWsOpenParams): Promise<import("./home-remote.js").HomeTerminalWsRpcResult>;
  homeTerminalWsSend(params: import("./home-remote.js").HomeTerminalWsSendParams): Promise<import("./home-remote.js").HomeTerminalWsRpcResult>;
  homeTerminalWsClose(): Promise<import("./home-remote.js").HomeTerminalWsRpcResult>;

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
   * By default probes existing connections without tearing them down; pass `{ redial: true }`
   * to close stale paths and force a fresh dial (e.g. after a send failure).
   */
  warmContactConnection(
    peerOwnerId: string,
    options?: WarmContactConnectionOptions,
  ): Promise<PeerConnectionInfo>;

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
   * Native Envoy AI document turn (heuristic tool routing).
   *
   * @deprecated Use {@link NodeService.runOwnerAgentTurn} from the Assistant UI.
   * RPC retained for one release; internal `_runDocumentAgentTurnCore` still powers owner-agent fallback.
   */
  runDocumentAgentTurn(message: string): Promise<DocumentAgentTurnResult>;
  /** Phase 18 — native owner agent orchestration (Assistant primary backend). */
  runOwnerAgentTurn(message: string): Promise<OwnerAgentTurnResult>;

  // ----- Phase 16 — EnvoyAI postures -----

  listSocialProxySessions(): Promise<SocialProxySession[]>;
  runSocialProxyPass(): Promise<{ ok: boolean; error?: string; correlationId?: string }>;
  cancelSocialProxySession(sessionId: string): Promise<void>;

  // ----- Phase 23A — Agent Circles -----
  listAgentCircles(): Promise<import("./agent-circle.js").AgentCircle[]>;
  createAgentCircle(input: {
    label: string;
    memberOwnerIds: string[];
    topicTags?: string[];
  }): Promise<import("./agent-circle.js").AgentCircle>;
  updateAgentCircle(circleId: string, update: {
    label?: string;
    status?: import("./agent-circle.js").AgentCircle["status"];
    memberOwnerIds?: string[];
    topicTags?: string[];
  }): Promise<import("./agent-circle.js").AgentCircle>;
  deleteAgentCircle(circleId: string): Promise<void>;
  proposeAgentCircles(): Promise<import("./agent-circle.js").AgentCircle[]>;
  chatRagSearch(query: string, opts?: { ownerId?: string; maxResults?: number }): Promise<Array<{ messageId: string; contactName: string; snippet: string; timestamp: string }>>;
  discoverAndCluster(seedTopics?: string[], seedCapabilities?: string[]): Promise<string>;
  generateMeshIntelligenceReport(): Promise<string>;

  startDocumentAcquisitionJob(params: {
    query: string;
    fileTitleHint?: string;
    pathHint?: string;
  }): Promise<{ jobId: string; correlationId: string }>;
  getDocumentAcquisitionJob(jobId: string): Promise<DocumentAcquisitionJob | undefined>;
  listDocumentAcquisitionJobs(activeOnly?: boolean): Promise<DocumentAcquisitionJob[]>;
  cancelDocumentAcquisitionJob(jobId: string): Promise<void>;

  startCapabilityProviderJob(params: {
    goal: string;
    capabilityIds?: string[];
    targetOwnerId?: string;
  }): Promise<{ jobId: string; correlationId: string }>;
  getCapabilityProviderJob(jobId: string): Promise<CapabilityProviderJob | undefined>;
  listCapabilityProviderJobs(activeOnly?: boolean): Promise<CapabilityProviderJob[]>;
  cancelCapabilityProviderJob(jobId: string): Promise<void>;
  runCapabilityProviderWorker(): Promise<number>;

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

  /**
   * Wipe all local user data: profile, config, published library,
   * intent history, continuity sessions, audit log, task journal,
   * peer directory. The caller is expected to confirm with the user
   * before invoking — this is destructive and cannot be undone.
   */
  clearAllUserData(): Promise<void>;

  // ----- Phase 38 — Voice/Video Calls -----

  /** Get the active call session, if any. */
  getActiveCall(): CallSession | null;

  /** Subscribe to call events. Returns unsubscribe function. */
  onCallEvent(handler: (event: CallEvent) => void): () => void;

  /**
   * Initiate a voice call to a bonded peer. Returns callId or null if busy.
   *
   * Phase 42A — `sdpOffer` is the SDP offer produced by the caller's
   * `RTCPeerConnection.createOffer()`. The home embeds it into the
   * `call.invite` payload. `iceServers` is optional; when omitted the
   * home injects a 3-server STUN default (Google / Cloudflare / Twilio).
   */
  sendCallInvite(
    targetOwnerId: string,
    sdpOffer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
  ): Promise<string | null>;

  /**
   * Path 1 → Path 2 fallback: send an updated SDP offer with STUN/TURN
   * for an in-progress outbound call (same callId).
   */
  sendCallReinvite(
    callId: string,
    sdpOffer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
    reason?: "path1_timeout" | "path1_failed",
  ): Promise<boolean>;

  /**
   * Accept an incoming call. Returns true if the call was accepted.
   *
   * Phase 42A — `sdpAnswer` is the SDP answer produced by the callee's
   * `RTCPeerConnection.createAnswer()`. The home embeds it into the
   * `call.accept` payload. `iceServers` is optional.
   */
  acceptCallInvite(
    callId: string,
    sdpAnswer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
  ): Promise<boolean>;

  /** Decline/reject an incoming call. */
  declineCallInvite(callId: string, reason: string): Promise<boolean>;

  /** End a call (hangup). */
  endCall(callId: string): Promise<boolean>;

  /** Mute/unmute the local audio track for a call. */
  setCallMuted(callId: string, muted: boolean): Promise<boolean>;

  /** Send a trickle ICE candidate to the remote peer for an active call. */
  sendIceCandidate(
    callId: string,
    candidate: {
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;
      usernameFragment?: string | null;
    },
  ): Promise<boolean>;

  // ----- Phase 31I — Push Notifications -----

  registerPushToken(params: {
    platform: string;
    token: string;
    ownerId: string;
    deviceId?: string;
    /** Phase 42I — defaults to "alert" for back-compat with older EnvoyGo builds. */
    tokenType?: "alert" | "voip";
  }): void;
  unregisterPushToken(deviceId: string): boolean;

  // ----- Phase 40: Agent Network Collaboration Layer (chains) -----

  /**
   * Decompose a goal into subtasks and register them with the orchestrator
   * state. Returns the resulting subtasks without launching proposals yet.
   */
  chainPlan(params: ChainPlanParams): Promise<ChainPlanResult>;

  /**
   * Broadcast the chain mandate + propose each subtask to the matching workers.
   */
  chainLaunch(params: ChainLaunchParams): Promise<ChainLaunchResult>;

  /** Snapshot the orchestrator's view of a chain (subtask counts, budget, etc.). */
  chainGetState(params: ChainGetStateParams): Promise<ChainGetStateResult>;

  /** List in-flight chains (newest first). */
  chainListActive(params?: ChainListActiveParams): Promise<ChainListActiveResult>;

  /** Cancel a chain or a single subtask within a chain. */
  chainCancel(params: ChainCancelParams): Promise<ChainCancelResult>;

  /** List published chain reports (newest first). */
  chainListReports(params?: ChainListReportsParams): Promise<ChainListReportsResult>;

  /** Fetch a single chain report by chainId. */
  chainGetReport(params: ChainGetReportParams): Promise<ChainGetReportResult>;

  /** Pin or unpin a chain report (pinned reports are exempt from 90-day GC). */
  chainPinReport(params: ChainPinReportParams): Promise<ChainPinReportResult>;

  /** Set the worker's bid strategy for a capability tag. */
  chainSetBidStrategy(params: ChainSetBidStrategyParams): Promise<ChainSetBidStrategyResult>;

  /** Read the worker's bid strategy for a capability tag. */
  chainGetBidStrategy(params: ChainGetBidStrategyParams): Promise<ChainGetBidStrategyResult>;

  /** Run a single round of bid evaluation for a subtask. */
  chainEvaluateBids(params: ChainEvaluateBidsParams): Promise<ChainEvaluateBidsResult>;

  /**
   * Phase 40D — counter-bid: reject all current bids on a subtask and
   * rebroadcast the proposal with a new cost ceiling.
   */
  chainCounterBid(params: ChainCounterBidParams): Promise<ChainCounterBidResult>;

  /**
   * Phase 40D — rebalance: add budget to a chain's `maxChainCostUsd` and
   * re-run evaluation for every not-yet-awarded subtask. Allows the owner
   * to recover from an under-budget initial estimate without cancelling.
   */
  chainRebalance(params: ChainRebalanceParams): Promise<ChainRebalanceResult>;

  /**
   * Phase 40D — read the node's default chain policy (auto / manual / never,
   * thresholds, etc.). Used by the Settings UI to surface the current
   * toggle state.
   */
  chainGetDefaults(params: ChainGetDefaultsParams): Promise<ChainGetDefaultsResult>;

  /**
   * Phase 40D — overwrite the node's default chain policy. The new value
   * becomes the default for every chain launched from this node going
   * forward (per-chain `ChainMandate` fields still take precedence).
   */
  chainSetDefaults(params: ChainSetDefaultsParams): Promise<ChainSetDefaultsResult>;

  /** Phase 43B — preview a chain plan and worker availability without launching. */
  chainPreviewGoal(params: ChainPreviewGoalParams): Promise<ChainPreviewGoalResult>;

  /** Phase 43B — launch a chain from a natural-language goal with smart defaults. */
  chainStartFromGoal(params: ChainStartFromGoalParams): Promise<ChainStartFromGoalResult>;

  /** Phase 43H — export chain cost breakdown as CSV. */
  chainExportCosts(params: ChainExportCostsParams): Promise<ChainExportCostsResult>;

  /** Phase 43H — list built-in chain goal templates. */
  chainListRecipes(params?: ChainListRecipesParams): Promise<ChainListRecipesResult>;

  /** Phase 43H — save an owner-defined chain recipe. */
  chainSaveRecipe(params: ChainSaveRecipeParams): Promise<ChainSaveRecipeResult>;

  /** Phase 43H — delete a saved chain recipe. */
  chainDeleteRecipe(params: ChainDeleteRecipeParams): Promise<ChainDeleteRecipeResult>;
}

// --------------------------------------------------------------------------
// Phase 38 — Call types
// --------------------------------------------------------------------------

export type CallSessionStatus = "ringing" | "active" | "ended";

export interface CallSession {
  callId: string;
  peerOwnerId: string;
  callType: "audio";
  status: CallSessionStatus;
  startedAt?: string;
  muted: boolean;
}

export type CallEvent =
  | {
      type: "call:incoming";
      callId: string;
      peerOwnerId: string;
      peerDisplayName: string;
      callType: "audio";
      sdpOffer?: string;
      /** Phase 42 — ICE servers the callee should use for the RTCPeerConnection. */
      iceServers?: { urls: string; username?: string; credential?: string }[];
    }
  | {
      type: "call:answered";
      callId: string;
      /** Present when the remote party accepted — caller applies this as the remote answer SDP. */
      sdpAnswer?: string;
      iceServers?: { urls: string; username?: string; credential?: string }[];
    }
  | {
      type: "call:reinvite";
      callId: string;
      peerOwnerId: string;
      sdpOffer: string;
      iceServers: { urls: string; username?: string; credential?: string }[];
      reason: "path1_timeout" | "path1_failed";
      transportPath: "path2";
    }
  | { type: "call:rejected"; callId: string; reason: "busy" | "declined" | "offline" | "error" | "no_answer" }
  | {
      type: "call:ice-candidate";
      callId: string;
      candidate: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
        usernameFragment?: string | null;
      };
      fromOwnerId: string;
    }
  | { type: "call:remote-mute"; callId: string; muted: boolean }
  | { type: "call:ended"; callId: string; reason: "normal" | "error" | "no_answer" }
  | { type: "call:error"; callId: string; error: string };