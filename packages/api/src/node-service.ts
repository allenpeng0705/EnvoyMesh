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
import type {
  KbPluginMetadataEntry,
  KbPluginInfo,
  ListKbPluginsParams,
  ActivateKbPluginParams,
  DeactivateKbPluginParams,
  UpdateKbPluginConfigParams,
} from "./kb-plugin.js";
export type { KbPluginMetadataEntry };
export type {
  KbPluginInfo,
  ListKbPluginsParams,
  ActivateKbPluginParams,
  DeactivateKbPluginParams,
  UpdateKbPluginConfigParams,
} from "./kb-plugin.js";
import type {
  RagEmbeddingProbeResult,
  RagIndexProgress,
  RagIndexStatus,
} from "./rag-index-status.js";
import type { ChatModelProbeResult } from "./chat-model-probe.js";
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
  ChainDeleteReportParams,
  ChainDeleteReportResult,
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
  ChainProbeReachabilityParams,
  ChainProbeReachabilityResult,
  ChainResolveIterationParams,
  ChainResolveIterationResult,
  ChainExportCostsParams,
  ChainExportCostsResult,
  ChainListRecipesParams,
  ChainListRecipesResult,
  ChainSaveRecipeParams,
  ChainSaveRecipeResult,
  ChainDeleteRecipeParams,
  ChainDeleteRecipeResult,
  ChainReportReceivedEvent,
  ChainIterationProgressEvent,
} from "./ws-protocol.js";
import type { TransferStatus } from "./transfer-status.js";
import type {
  CompanyInviteRecord,
  CreateCompanyInviteParams,
  CreateCompanyInviteResult,
  ListCompanyInvitesResult,
  RevokeCompanyInviteResult,
  RedeemCompanyInviteParams,
  RedeemCompanyInviteResult,
} from "./company-invite.js";
import type {
  CreateFamilyProfileParams,
  CreateFamilyProfileResult,
  UpdateFamilyProfileParams,
  UpdateFamilyProfileResult,
  DeleteFamilyProfileResult,
  WipeFamilyProfileResult,
  GenerateFamilyInviteTokenParams,
  GenerateFamilyInviteTokenResult,
  ListFamilyProfilesResult,
  SendFamilyMessageParams,
  SendFamilyMessageResult,
  FamilyRoom,
  CreateFamilyRoomParams,
  CreateFamilyRoomResult,
  ListFamilyRoomsResult,
  SendFamilyRoomMessageParams,
  SendFamilyRoomMessageResult,
  FamilyProfile,
} from "./family-profile.js";
export type {
  FamilyProfile,
  CreateFamilyProfileParams,
  CreateFamilyProfileResult,
  UpdateFamilyProfileParams,
  UpdateFamilyProfileResult,
  DeleteFamilyProfileResult,
  WipeFamilyProfileResult,
  GenerateFamilyInviteTokenParams,
  GenerateFamilyInviteTokenResult,
  ListFamilyProfilesResult,
  SendFamilyMessageParams,
  SendFamilyMessageResult,
  FamilyRoom,
  CreateFamilyRoomParams,
  CreateFamilyRoomResult,
  ListFamilyRoomsResult,
  SendFamilyRoomMessageParams,
  SendFamilyRoomMessageResult,
} from "./family-profile.js";
import type {
  BridgeStatus,
  OpenClawStatus,
  PiStatus,
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
  ExtAgentReachability,
  ExtAgentCommandCatalog,
  ProbeExtAgentParams,
  GetExtAgentCommandCatalogParams,
  SetExtAgentSessionModelParams,
  SetExtAgentSessionModelResult,
  PairThinClientParams,
  PairThinClientResult,
  RepairSessionProfileParams,
  RepairSessionProfileResult,
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

/** Optional flags for {@link NodeService.runOwnerAgentTurn} (Assistant UI). */
export interface RunOwnerAgentTurnOptions {
  /** Client-assigned id for the human message (matches optimistic UI bubble). */
  humanMessageId?: string;
  /** Client locale (e.g. "en", "zh") — used by the scripted tutor fallback. */
  locale?: string;
}

/** Optional flags for {@link NodeService.sendHello} (Trust-mode bond linkage). */
export interface SendHelloOptions {
  /** Matches {@link SocialIntroProposal.messageId}; requires prior approveSocialIntroCommitment. */
  introProposalMessageId?: string;
  /** Override bond.request proofOfContext (e.g. installer sponsor token). */
  proofOfContext?: string;
  /** Known libp2p peer id when owner directory lookup is not seeded yet (e.g. setup sponsor friend). */
  targetPeerId?: string;
  /**
   * Override the dial-hint address filter for this call. Defaults to
   * `defaultAddressFilterForProfile(config)`. Pass `"all"` to keep
   * loopback / RFC1918 / CGNAT hints (e.g. same-Mac dev where the
   * relay-circuit path is broken and only loopback / LAN will reach
   * the recipient). Pass `"lan-paired"` to keep LAN only.
   */
  addressFilter?: DialableAddrMode;
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
      modelUsed?: "openclaw" | "native" | "scripted-tutor";
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
  membership: string[];
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
  /** Phase 45D — peer's web content root when advertised. */
  webContentRoot?: string;
  /** Agent Network worker profile when the peer opted in and advertised it. */
  agentNetworkProfile?: import("@envoymesh/protocol").AgentNetworkProfile;
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

/** Filters for the owner cost dashboard. */
export interface GetCostSummaryParams {
  /** ISO timestamp; only rows with period >= since are aggregated. */
  since?: string;
  /** ISO timestamp; only rows with period < until are aggregated. */
  until?: string;
  /** Restrict to a single providerId (e.g. "cloud.anthropic"). */
  providerId?: string;
  /** Restrict to a single taskType (e.g. "knowledge.query"). */
  taskType?: string;
}

/** Aggregated cost summary returned by getCostSummary. */
export interface CostSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byProvider: Array<{
    providerId: string;
    calls: number;
    costUsd: number;
  }>;
  byPeriod: Array<{
    period: string;
    granularity: "day" | "month";
    calls: number;
    costUsd: number;
  }>;
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
  discoverySource?:
    | "local"
    | "dht-capability-topic"
    | "dht-peer-routing"
    | "rendezvous"
    | "did-lookup"
    | "relay-roster-topic"
    | "relay-roster-peer"
    | "discovery-seed"
    | "mdns"
    | "bootstrap";
  trustLevel?: string;
  signedRecordValid?: boolean;
  /**
   * From relay.lookup: true when the responding relay holds a live circuit
   * reservation for this peer (hoppable). Absent when unknown / non-relay hit.
   */
  hasHopSlot?: boolean;
  /**
   * Nearby / mDNS pipeline status for People on this network.
   * - pending: heard on LAN, profile probe in flight
   * - resolved: Envoy profile identified (ownerId set)
   * - unreachable: heard on LAN but profile probe failed (firewall / non-Envoy)
   */
  profileStatus?: "pending" | "resolved" | "unreachable";
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
  /** Phase 44C — plugin-enriched metadata entries (e.g. frontmatter tags, wiki-links). */
  pluginMetadata?: KbPluginMetadataEntry[];
}

/** Vault or OpenClaw workspace — unified local file entry for Library UI and agent tools. */
export type LocalFileSource = "vault" | "workspace" | "linked-obsidian" | "mcp-remote";

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
  /** MCP remote card id (when source is mcp-remote). */
  externalId?: string;
  /** Short preview text for mcp-remote browse rows (not persisted). */
  snippetPreview?: string;
}

export interface ListAllLocalFilesParams {
  /** Case-insensitive substring match on title or relative path */
  query?: string;
  /**
   * When true (default), also list live MCP/Notion cards for Knowledge Browse.
   * Soft-fails when MCP is unset or unreachable.
   */
  includeMcpRemote?: boolean;
  /** Optional MCP list/search query (default: "*"). */
  mcpListQuery?: string;
}

export interface ListAllLocalFilesResult {
  items: LocalFileItem[];
  vaultCount: number;
  workspaceCount: number;
  linkedObsidianCount?: number;
  mcpRemoteCount?: number;
  /** Soft-fail reason when MCP remote list failed (Browse still returns vault/linked items). */
  mcpRemoteError?: string;
}

export interface ReadLocalFileContentParams {
  source: LocalFileSource;
  relativePath: string;
  documentId?: string;
  maxBytes?: number;
  offset?: number;
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

/**
 * Address filter mode for outbound WAN join invites / contact codes.
 *
 *   - `"wan-public"` (default) — strip RFC1918 + CGNAT + link-local so
 *     the invite doesn't ship LAN-only addresses that the recipient
 *     can't dial from another network. Use for any invite that may be
 *     sent cross-network (DMG-baked sponsor-friend, share-contact QR,
 *     public join link).
 *   - `"lan-paired"` — keep private addresses. Use only for explicit
 *     "the recipient is on this LAN" flows (mobile pairing kiosk, local
 *     home pairing).
 *   - `"all"` — historical behavior. Strips only loopback / unspecified.
 */
export type DialableAddrMode = "lan-paired" | "wan-public" | "all";

export interface CreateWanJoinInviteParams {
  /** Hours until invite expires (default 168 = 7 days, max 8760 = 1 year). */
  expiresInHours?: number;
  note?: string;
  /**
   * Omit accumulated bootstrap peer multiaddrs; keep presets + target dial paths only.
   * Produces a smaller token for contact links (full link copy, not QR payload).
   */
  compact?: boolean;
  /**
   * Which multiaddr classes to include for the target node. Default
   * `"wan-public"` because the most common use case is cross-network.
   * Set to `"lan-paired"` only for flows where the recipient is on the
   * same network as the sender (e.g. mobile pairing kiosk).
   */
  addressFilter?: DialableAddrMode;
  /**
   * When `addressFilter` is `"wan-public"` (default) and the mesh reports
   * no *live* circuit-relay reservation (`hasLiveRelayReservation()` /
   * `hasRelayReservation() === false`), minting throws unless this is true.
   * Use only for packaging/tests when you knowingly mint before reservation.
   */
  forceWithoutReservation?: boolean;
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
  /**
   * When an Office/PDF import is materialized to Markdown under `notes/imports/`,
   * the companion note path (Phase 57 item-4).
   */
  markdownRelativePath?: string;
}

/**
 * Convert an existing vault Office/PDF (etc.) into a Markdown note under `notes/imports/`.
 * Original bytes are retained. Phase 57 item-4 / 57E.
 */
export interface ConvertLibraryItemToMarkdownParams {
  /** Vault document id **or** vault-relative path of the original. */
  documentId?: string;
  relativePath?: string;
}

export interface ConvertLibraryItemToMarkdownResult {
  ok: boolean;
  markdownRelativePath?: string;
  documentId?: string;
  reason?: string;
}

/**
 * Phase 57D — run MCP search and (when write-back is enabled) save attributed note under `notes/mcp/`.
 */
export interface SaveExternalMcpSearchAsNoteParams {
  query: string;
  /** Optional note title override. */
  title?: string;
  sensitivity?: "public" | "friends" | "private";
}

export interface SaveExternalMcpSearchAsNoteResult {
  ok: boolean;
  relativePath?: string;
  documentId?: string;
  snippetCount?: number;
  reason?: string;
}

/** List live MCP/Notion cards for Knowledge Browse (no write-back required). */
export interface ListExternalMcpKnowledgeParams {
  query?: string;
  limit?: number;
}

export interface ListExternalMcpKnowledgeResult {
  items: LocalFileItem[];
  error?: string;
}

/** Copy linked Obsidian `.md` files into `notes/imports/obsidian/…`. */
export interface ImportLinkedObsidianNotesParams {
  /** Browse paths (`linked-obsidian/<label>/…`). Omit with `all: true`. */
  paths?: string[];
  /** Import every linked Obsidian markdown file. */
  all?: boolean;
}

export interface ImportLinkedObsidianNotesResult {
  ok: boolean;
  imported: Array<{ from: string; to: string; documentId?: string }>;
  skipped: number;
  reason?: string;
}

/** Save selected MCP remote cards (or a fresh search) into `notes/mcp/`. */
export interface ImportExternalMcpKnowledgeParams {
  /** Prefer importing these mcp-remote browse paths / external ids. */
  paths?: string[];
  externalIds?: string[];
  /** When set, run MCP search and import all hits (like saveExternalMcpSearchAsNote). */
  query?: string;
  title?: string;
  sensitivity?: "public" | "friends" | "private";
}

export interface ImportExternalMcpKnowledgeResult {
  ok: boolean;
  imported: Array<{ relativePath: string; documentId?: string; title: string }>;
  reason?: string;
}

/** Write vault notes into a linked Obsidian vault root (never deletes remote files). */
export interface ExportNotesToLinkedObsidianParams {
  relativePaths: string[];
  /** Vault label from browse path (`linked-obsidian/<label>/…`). First root if omitted. */
  targetRootLabel?: string;
}

export interface ExportNotesToLinkedObsidianResult {
  ok: boolean;
  exported: Array<{ from: string; to: string }>;
  reason?: string;
}

/** Push vault notes to MCP write tool (e.g. memex_write). */
export interface ExportNotesToMcpParams {
  relativePaths: string[];
}

export interface ExportNotesToMcpResult {
  ok: boolean;
  exported: Array<{ relativePath: string; externalId?: string }>;
  reason?: string;
}

/**
 * Create a new markdown note in the vault `notes/` folder (Phase 44A2).
 *
 * If `subfolder` is omitted the note is placed directly under `notes/`.
 * If a note with the same relative path already exists it is overwritten.
 */
export interface CreateNoteParams {
  /** File basename (e.g. `my-note.md`). Must end with `.md`. */
  filename: string;
  /** Markdown content (plain text — not base64). */
  content: string;
  /** Optional subfolder under `notes/` (e.g. `projects`). */
  subfolder?: string;
  /** Sensitivity for the note — written to per-item overrides (Phase 44A1). */
  sensitivity?: "public" | "friends" | "private";
  /**
   * When true, also publish the note as a public Blog post (Content → Blog).
   * Default false. Knowledge mirror under `notes/imports/blog/` stays private until Published.
   */
  alsoPublishAsBlog?: boolean;
}

export interface CreateNoteResult {
  documentId: string;
  /** Vault-relative path (e.g. `notes/my-note.md`). */
  relativePath: string;
  sizeBytes: number;
}

/**
 * Delete a vault item by its vault-relative path (Phase 44A2).
 * The file is removed from the local vault directory.
 */
export interface DeleteVaultItemParams {
  /** Vault-relative path of the item to delete. */
  relativePath: string;
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
  /**
   * When set, sends a `chat.message` with this text and the attachment metadata,
   * links the file share to that message, and skips the separate local file-share chat row.
   * Use for voice notes — pass `""` when there is no transcription.
   */
  chatText?: string;
  /** When false and `chatText` is omitted, skips `_recordFileShareInChat` (default true). */
  recordInChat?: boolean;
}

export interface SendChatAttachmentResult {
  attachmentId: string;
  vaultRelativePath: string;
  shareRequestMessageId: string;
  /** Present when `chatText` was provided — the outbound chat.message id. */
  messageId?: string;
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
  /**
   * Byte offset into the file. When set (including `0`), the home returns at most
   * `maxBytes` starting at this offset and sets `truncated` when more remains.
   * Required for relay home-tunnel paths where a single JSON-RPC frame must stay
   * under ~128–768 KiB (base64 expands ~4/3).
   */
  offset?: number;
}

export interface ReadLibraryItemContentResult {
  contentBase64: string;
  mimeType: string;
  /** Total file size in bytes (not the chunk length). */
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
  /** Per-contact discovery reply timeout (default 15s). */
  timeoutMsPerPeer?: number;
  /**
   * Wall-clock budget for the whole fan-out (default 25s).
   * When reached, remaining contacts are skipped and partial results are returned
   * so the Social WS RPC (often 30–60s) does not hard-fail.
   */
  overallTimeoutMs?: number;
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

// Phase 45 — Web Content Browsing.

export interface LibraryReadParams {
  /** Owner ID of the serving node (the `envoy:owner:...` from the URL). */
  targetOwnerId: string;
  /** URL path (leading slash stripped, percent-decoded). */
  path: string;
  /** Optional byte range for large-file chunking. */
  range?: { start: number; end: number };
  /**
   * Phase 45B — If-None-Match etag. When it matches, the server returns
   * `status: "not_modified"` so the Browser can keep its cached body.
   */
  ifNoneMatch?: string;
  /** Per-target timeout (default 30s). */
  timeoutMs?: number;
}

export interface LibraryReadResult {
  /** The serving node's owner ID. */
  peerOwnerId: string;
  /** libp2p peer ID we dialed. */
  libp2pPeerId: string;
  /** Wire status discriminator. */
  status: "ok" | "not_found" | "forbidden" | "too_large" | "not_modified" | "error";
  /** Body when status === "ok" (UTF-8 text or base64 binary). */
  body?: string;
  /** MIME type detected by the serving node. */
  contentType?: string;
  /** sha256 of the full resource (not just a range slice) — caller verifies. */
  contentHash?: string;
  /** Body byte length (for `ok`: this chunk; for `too_large`: full file size). */
  byteLength?: number;
  /** ETag (hash prefix) for cache revalidation. */
  etag?: string;
  /** Present when responding to a range request. */
  range?: { start: number; end: number; total: number };
  /** Alt path with public-tier content when forbidden. */
  publicRedirection?: string;
  /** Round-trip latency. */
  latencyMs: number;
  /** Set when the dial or reply failed (no peer error in `status`). */
  error?: string;
}

/** Phase 45D — templates supported by in-app authoring. */
export type PublishWebContentTemplate =
  | "blog-post"
  | "note"
  | "profile"
  | "photo"
  | "file"
  | "section"
  | "feed-post";

/** Phase 45D — visibility flags for published web items. */
export type PublishWebContentVisibility = "public" | "bonded" | "contacts" | "private";

/** Max images per Feed (Moments-style) post. */
export const MAX_FEED_POST_IMAGES = 9;

export interface PublishWebContentImage {
  contentBase64: string;
  mimeType: string;
  fileName?: string;
}

export interface PublishWebContentParams {
  template: PublishWebContentTemplate;
  title: string;
  /** Markdown body for text templates (H1 title is prepended by the server). */
  body?: string;
  visibility: PublishWebContentVisibility;
  contactIds?: string[];
  tags?: string[];
  /** Base64 file bytes for photo / file templates. */
  contentBase64?: string;
  /** MIME type for photo / file. */
  mimeType?: string;
  /** Original filename hint (extension). */
  fileName?: string;
  /** PhotoWall gallery folder (default `wall`). */
  gallery?: string;
  /**
   * When set, write/overwrite this path under `web/` instead of allocating a unique
   * slug path (used to mirror profile gallery photos onto PhotoWall).
   */
  stablePath?: string;
  /**
   * Custom section path slug (template `section` only). Defaults to slugified title.
   * Published at `{slug}/index.md` → `envoy://owner/{slug}/`.
   */
  sectionSlug?: string;
  /**
   * When true (default for `section`), add the section slug as a publish topic tag
   * so Discover / Bazaar topic search can find it.
   */
  advertiseTopic?: boolean;
  /**
   * Feed posts only — up to {@link MAX_FEED_POST_IMAGES} images embedded in the post.
   */
  images?: PublishWebContentImage[];
}

/** Own Feed (Friend Circle) post for the Content → Feed timeline. */
export interface FeedPostSummary {
  path: string;
  url: string;
  title: string;
  summary?: string;
  bodyPreview?: string;
  publishedAt: string;
  visibility: PublishWebContentVisibility;
  imageUrls: string[];
  publisherOwnerId: string;
}

/** Own Blog post for the Content → Blog list (`web/blog/posts/`). */
export interface BlogPostSummary {
  path: string;
  url: string;
  title: string;
  summary?: string;
  bodyPreview?: string;
  publishedAt: string;
  visibility: PublishWebContentVisibility;
  publisherOwnerId: string;
}

/** Delete a published web-content path under `web/` (manifest + files). */
export interface DeleteWebContentParams {
  /** Relative path under `web/` (e.g. `feeds/hello.md`). */
  path: string;
  /** When deleting a blog post, used to rebuild `blog/index.md` links. */
  ownerId?: string;
}

export interface DeleteWebContentResult {
  path: string;
  /** False when the path was already absent. */
  deleted: boolean;
}

export interface PublishWebContentResult {
  path: string;
  urlPath: string;
  contentHash: string;
  byteLength: number;
  title: string;
  visibility: PublishWebContentVisibility;
  publishedAt: string;
  url: string;
  listingUrl?: string;
  /** Effective tags on the published item (includes auto section topic tags). */
  tags?: string[];
  /** Feed Moments — absolute envoy:// image URLs. */
  imageUrls?: string[];
}

/** Phase 45 — seed default Profile + empty Blog / PhotoWall / Feeds shells (idempotent). */
export interface EnsureDefaultWebSiteResult {
  created: Array<"profile" | "blog" | "photowall" | "feeds">;
  urls: {
    profile: string;
    blog: string;
    photowall: string;
    feeds: string;
  };
}

/** Phase 45 Step 3 — custom site section (e.g. Market). */
export interface WebContentSectionSummary {
  title: string;
  slug: string;
  path: string;
  url: string;
  visibility: PublishWebContentVisibility;
  tags?: string[];
  updatedAt: string;
}

/** Phase 45E — inbound `feed.notify` row (Content → Feed badge + timeline). */
export interface FeedNotification {
  id: string;
  receivedAt: string;
  messageId: string;
  publisherOwnerId: string;
  publishedAt: string;
  title: string;
  url: string;
  kind: string;
  visibility: string;
  summary?: string;
  tags?: string[];
  contentHash?: string;
  listingUrl?: string;
  senderPeerId: string;
  /** Feed Moments image URLs (metadata only). */
  imageUrls?: string[];
  /** Present after Content/Feed open/dismiss — clears badge; timeline still lists. */
  readAt?: string;
}

/** Own Feed (Friend Circle) merged timeline row. */
export type FeedTimelineSource = "own" | "peer";

export interface FeedTimelineItem {
  source: FeedTimelineSource;
  key: string;
  publisherOwnerId: string;
  title: string;
  body?: string;
  url: string;
  path?: string;
  publishedAt: string;
  imageUrls: string[];
  visibility?: string;
}

export interface ListFeedTimelineParams {
  /** Exclusive cursor timestamp (ISO). Pair with beforeUrl when timestamps collide. */
  before?: string;
  beforeUrl?: string;
  /** Page size (default 20, max 50). */
  limit?: number;
}

export interface ListFeedTimelineResult {
  items: FeedTimelineItem[];
  hasMore: boolean;
  nextBefore?: string;
  nextBeforeUrl?: string;
}

/** Inbound star/comment on the owner's Feed or Blog post (Content nav badge). */
export type ContentEngageSurface = "feed" | "blog";

export interface ContentEngageNotification {
  id: string;
  receivedAt: string;
  messageId: string;
  url: string;
  surface: ContentEngageSurface;
  action: "star" | "comment" | "snapshot";
  actorOwnerId: string;
  text?: string;
  senderPeerId: string;
}

export interface DismissContentEngageNotificationsParams {
  /** Clear one surface, or all Content engagement badges. Default: all. */
  surface?: ContentEngageSurface | "all";
}

/** Feed/Blog star + comments summary for a content URL. */
export interface ContentEngagementComment {
  id: string;
  authorOwnerId: string;
  text: string;
  createdAt: string;
}

export interface ContentEngagementSummary {
  url: string;
  starCount: number;
  starredByMe: boolean;
  /** Owner IDs who starred, oldest-first (WeChat Moments-style name list). */
  starOwnerIds: string[];
  commentCount: number;
  comments: ContentEngagementComment[];
}

export interface GetContentEngagementParams {
  url: string;
}

export interface ToggleContentStarParams {
  url: string;
}

export interface AddContentCommentParams {
  url: string;
  text: string;
}

export interface RemoveContentCommentParams {
  url: string;
  commentId: string;
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
  /**
   * When connected, true if a chat stream probe succeeded within the freshness window (~45s).
   * False means libp2p reports open but the path has not been verified recently.
   */
  pathVerified?: boolean;
}

/** Options for {@link NodeService.warmContactConnection}. */
export interface WarmContactConnectionOptions {
  /** Close stale libp2p paths and force a fresh dial (use after send failure). Default false. */
  redial?: boolean;
  /** When true, only verify an existing libp2p path (no dial). Use for online UI polls. Default false. */
  verifyOnly?: boolean;
  /** When true, close relay and try direct LAN if hints exist (chat send). Default false. */
  upgradeRelayToDirect?: boolean;
  /** When already connected, probe the open libp2p path (ping / stream) without redialing. */
  keepAlive?: boolean;
  /** When connected, verify with a chat stream; redial if stale. Use on chat open. */
  verifyConnection?: boolean;
  /**
   * Skip the background warm cooldown (UI preload / bond-warm dedupe).
   * Use for explicit chat-open dials so a failed preload cannot block reconnect for 90s.
   */
  force?: boolean;
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
  /**
   * Live circuit-relay-v2 client reservation chip (inbound /p2p-circuit/
   * reachability). Distinct from axes.relayAvailability (checkin/lookup).
   */
  circuitReservation?: CircuitReservationStatus;
  quicEnabled: boolean;
  hints: string[];
  /** Operator steps for live multi-machine sign-off (Phase 15B). */
  signOffChecklist: string[];
}

/**
 * Thin circuit-relay reservation status for Settings / Discover soft-gates.
 * Prefer {@link NodeService.getCircuitReservationStatus} over polling full
 * {@link getConnectivityDiagnostics} every few seconds.
 */
export interface CircuitReservationStatus {
  state: "off" | "pending" | "reserved" | "failed";
  live: boolean;
  everReserved: boolean;
  relayPeerIds: string[];
  /** Preferred relays that currently hold a live slot (subset of relayPeerIds). */
  liveRelayPeerIds?: string[];
  lastError?: string;
  lastReservedAt?: string;
  /**
   * Consecutive failed re-warm cycles (resets to 0 on success). When sustained
   * (>4), the UI shows a "Relay unreachable" warning so operators know WAN
   * discovery and cross-NAT reachability are degraded. See
   * `docs/connectivity-internals-and-design.md` Part VIII (M2).
   */
  failureStreak?: number;
  checkedAt: string;
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
  /** Phase 45E — bonded peer published web content (open via library.read / Browser). */
  "feed:notify": FeedNotification;
  /** Inbound star/comment on the owner's Feed or Blog (Content nav badge). */
  "content:engage": ContentEngageNotification;
  "bond:established": { peerOwnerId: string; displayName?: string };
  "bond:revoked": { peerOwnerId: string };
  "bond:blocked": { peerOwnerId: string };
  /** Bonded peer profile cache updated (profile.sync / profile.response). */
  "profile:updated": { ownerId: string };

  // Chat events
  "chat:message": ChatMessage;
  /** Phase 50 — push-only event (e.g. Pi responses). Triggers the unified
   * push listener but is NOT forwarded to WS clients (unlike chat:message).
   * This prevents Pi responses from landing in the chat UI / Inbox. */
  "push:message": ChatMessage;
  "chat:room-updated": ChatRoom;
  "chat:room-removed": { roomId: string };
  "chat:room-message": ChatRoomMessageEvent;
  /**
   * Phase 51D — family room create/rename/membership. WS remaps to
   * profile-scoped `chat:room-updated` (never broadcast).
   */
  "chat:family-room-updated": {
    room: FamilyRoom;
    targetProfileId: string;
  };
  /**
   * Phase 51D — family room message. WS remaps to profile-scoped
   * `chat:room-message` (never broadcast).
   */
  "chat:family-room-message": {
    roomId: string;
    message: ChatMessage;
    targetProfileId: string;
    memberProfileIds: string[];
  };
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

  // Config events — emitted after updateNodeConfig so index.ts runtime caches stay fresh
  "config:updated": {
    autonomousKillSwitch: boolean;
    autonomousPolicies: readonly AutonomousPolicy[];
    chatAssistEnabled: boolean;
    modelProviders: ModelProviderConfig;
    aiSettings?: AiSettings;
    contactAiPreferences: ContactAiPreferences[];
    trustModeEnabled?: boolean;
    knowledgeSyndicationMaxSensitivity?: "public" | "friends" | "private";
  };

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

  /** Phase 49D — Pi wants to perform an action and is waiting for user confirmation. */
  "pi:proposal": import("./pi-agent.js").PiProposalEvent;

  /** Home terminal PTY tunnel bytes (Phase 30E — mobile HomeRemote). */
  "homeTerminalWs:rx": import("./home-remote.js").HomeTerminalWsRxEvent;
  "homeTerminalWs:closed": import("./home-remote.js").HomeTerminalWsClosedEvent;

  /** Phase 43D — live chain state push for ChainsView. */
  "chain:state": ChainGetStateResult;

  /** Phase 43D — chain report ready for inline chat card. */
  "chain:report": ChainReportReceivedEvent;

  /** Phase 47D — iteration progress (seal / judge / continue / ask_owner). */
  "chain:iteration": ChainIterationProgressEvent;

  /** Worker-side read-only team job snapshot (`task.chain.status`). */
  "chain:observed": import("./ws-protocol.js").ChainObservedStatus;
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

  /** Aggregated per-call model cost summary for the owner AI dashboard. */
  getCostSummary(params?: GetCostSummaryParams): Promise<CostSummary>;

  /** Run cost rollup retention (collapse old daily rows to monthly). Returns counts. */
  runCostRollupRetention(): Promise<{ collapsed: number; dropped: number }>;

  /** Task journal rows for Activity drill-down. */
  listTaskJournalEntries(params?: ListTaskJournalParams): Promise<TaskJournalSummary[]>;

  /** Cached peer agent cards (Phase 13C). */
  listAgentCards(): Promise<CachedAgentCardSummary[]>;

  /**
   * Local agent as a Team-jobs worker when Join Agent Network is on.
   * Undefined when Join is off or agent identity is unavailable.
   */
  getLocalAgentNetworkWorkerCard(): Promise<CachedAgentCardSummary | undefined>;

  getAgentCard(ownerId: string): Promise<CachedAgentCardSummary | undefined>;

  /** Send agent.card.request to a bonded peer (response cached on reply). */
  requestAgentCard(
    targetOwnerId: string,
    options?: { timeoutMs?: number },
  ): Promise<{ ok: boolean; error?: string }>;

  /**
   * Re-request agent cards from bonded peers and rebuild the capability index
   * used by Team jobs / Assigner. Safe to call after Join Agent Network or
   * LAN Auto-Bond so workers show up without a manual restart.
   */
  refreshAgentNetworkWorkers(): Promise<{ requested: number; failed: number }>;

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
   * Thin circuit-relay reservation chip (live/pending/failed). Prefer this
   * for UI soft-gates that poll every few seconds — avoids re-reading audit
   * tails and full WAN axis diagnostics.
   */
  getCircuitReservationStatus(): Promise<CircuitReservationStatus>;

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
   * Force rebuild vault (+ chat backfill) vector indexes for the current embedding config.
   * Use after changing embedding model/provider, or when the index looks stale.
   */
  reindexRagKnowledge(params?: { force?: boolean }): Promise<RagIndexStatus>;

  /**
   * Probe the effective embedding provider with a single short embed call.
   * Confirms Knowledge → Setup embedding settings without rebuilding the index.
   */
  testRagEmbedding(): Promise<RagEmbeddingProbeResult>;

  /**
   * Probe the effective chat model provider with a short static completion.
   * Confirms Settings → AI model endpoint/key without opening a chat thread.
   */
  testChatModel(): Promise<ChatModelProbeResult>;

  /**
   * Phase 57D — MCP search → attributed Markdown note under `notes/mcp/`.
   * Requires `aiSettings.knowledgeBase.mcpWriteBackEnabled` and `externalProvider: "mcp"`.
   */
  saveExternalMcpSearchAsNote(
    params: SaveExternalMcpSearchAsNoteParams,
  ): Promise<SaveExternalMcpSearchAsNoteResult>;

  /** List live MCP/Notion knowledge cards for Browse (soft-fail). */
  listExternalMcpKnowledge(
    params?: ListExternalMcpKnowledgeParams,
  ): Promise<ListExternalMcpKnowledgeResult>;

  /** Import linked Obsidian notes into `notes/imports/obsidian/`. */
  importLinkedObsidianNotes(
    params: ImportLinkedObsidianNotesParams,
  ): Promise<ImportLinkedObsidianNotesResult>;

  /**
   * Import MCP remote cards / search hits into `notes/mcp/`.
   * Browse import does not require `mcpWriteBackEnabled` (Settings toggle still gates the legacy save button).
   */
  importExternalMcpKnowledge(
    params: ImportExternalMcpKnowledgeParams,
  ): Promise<ImportExternalMcpKnowledgeResult>;

  /** Export vault Markdown notes into a linked Obsidian vault. */
  exportNotesToLinkedObsidian(
    params: ExportNotesToLinkedObsidianParams,
  ): Promise<ExportNotesToLinkedObsidianResult>;

  /** Export vault Markdown notes via MCP write tool when available. */
  exportNotesToMcp(params: ExportNotesToMcpParams): Promise<ExportNotesToMcpResult>;

  /**
   * Fetch exported content from an allowlisted IPFS gateway and verify bytes match vault contentHash.
   * Requires `externalPublish.allowIpfs` and a non-empty gateway allowlist (desktop Kubo or mobile Helia).
   */
  verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult>;

  /**
   * Write bytes into the local shared vault at a relative path (import from file picker).
   * Office/PDF imports also materialize GFM under `notes/imports/` when extract succeeds.
   */
  importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult>;

  /**
   * Materialize anydoc/legacy extract of an existing vault document into `notes/imports/`.
   * Originals are retained (Phase 57 item-4 / 57E).
   */
  convertLibraryItemToMarkdown(
    params: ConvertLibraryItemToMarkdownParams,
  ): Promise<ConvertLibraryItemToMarkdownResult>;

  /**
   * Create or overwrite a markdown note in the vault `notes/` folder (Phase 44A2).
   */
  createNote(params: CreateNoteParams): Promise<CreateNoteResult>;

  /**
   * Delete a vault item by its vault-relative path (Phase 44A2).
   */
  deleteVaultItem(params: DeleteVaultItemParams): Promise<void>;

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

  /**
   * Phase 45 — Fetch raw content by URL path from a bonded contact's
   * published web directory. Pull-based analog of `discoverPublishedLibrary`:
   * discovery returns *what* a node has; `libraryRead` returns the *bytes*.
   *
   * The serving node enforces per-item visibility via the Bonds Engine.
   * A stranger (non-bonded) reader gets `status: "forbidden"` or
   * `status: "not_found"` depending on the item's visibility flag.
   *
   * Design: docs/web-content-browsing-design.md §4.4.
   */
  libraryRead(params: LibraryReadParams): Promise<LibraryReadResult>;

  /**
   * Phase 45D — Author and publish a web-content item under `web/`, upsert
   * `web-content.json`, and (for blog posts) regenerate `blog/index.md`.
   *
   * Design: docs/web-content-browsing-design.md §4.8, §9.2.
   */
  publishWebContentEntry(params: PublishWebContentParams): Promise<PublishWebContentResult>;

  /**
   * Phase 45 — ensure default Profile + empty Blog / PhotoWall exist.
   * Idempotent; safe to call on node start and when opening Browser.
   */
  ensureDefaultWebSite(): Promise<EnsureDefaultWebSiteResult>;

  /** Phase 45 Step 3 — list custom sections (kind `section`). */
  listWebContentSections(): Promise<WebContentSectionSummary[]>;

  /** Own Feed (Friend Circle) posts under `web/feeds/`, newest first. */
  listFeedPosts(): Promise<FeedPostSummary[]>;

  /**
   * Own Feed merged timeline (own posts + bonded peer notifies), newest first, paged.
   * Prefer this over merging `listFeedPosts` + `listFeedNotifications` in the UI.
   */
  listFeedTimeline(params?: ListFeedTimelineParams): Promise<ListFeedTimelineResult>;

  /** Own Blog posts under `web/blog/posts/`, newest first. */
  listBlogPosts(): Promise<BlogPostSummary[]>;

  /**
   * Delete a published web-content item (manifest entry + file).
   * Feed posts also remove `feeds/media/{slug}/`.
   */
  deleteWebContentEntry(params: DeleteWebContentParams): Promise<DeleteWebContentResult>;

  /**
   * Phase 45E — list persisted inbound `feed.notify` rows for the Social Inbox.
   */
  listFeedNotifications(): Promise<FeedNotification[]>;

  /** Phase 45E — dismiss one feed notification by id. */
  dismissFeedNotification(id: string): Promise<void>;

  /**
   * Bulk-clear every feed notification. Used by the "open Inbox → clear badge"
   * UX so the unread feed-notification count drops to zero in one action.
   * Actionable requests (approvals, share offers, intros, hellos) are NOT
   * affected — they live in separate stores with their own accept/decline flows.
   */
  dismissAllFeedNotifications(): Promise<void>;

  /** Unread stars/comments on the owner's Feed/Blog posts (Content badges). */
  listContentEngageNotifications(): Promise<ContentEngageNotification[]>;

  /**
   * Clear Content engagement badges for a surface (`feed` / `blog`) or all.
   * Called when the user opens Content / Feed / Blog.
   */
  dismissContentEngageNotifications(
    params?: DismissContentEngageNotificationsParams,
  ): Promise<void>;

  /** Star/comment summary for a Feed or Blog content URL. */
  getContentEngagement(params: GetContentEngagementParams): Promise<ContentEngagementSummary>;

  /** Toggle the current owner's star on a Feed/Blog URL. */
  toggleContentStar(params: ToggleContentStarParams): Promise<ContentEngagementSummary>;

  /** Add a comment on a Feed/Blog URL. */
  addContentComment(params: AddContentCommentParams): Promise<ContentEngagementSummary>;

  /** Remove a comment (author or content owner). */
  removeContentComment(params: RemoveContentCommentParams): Promise<ContentEngagementSummary>;

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

  /** Resolved bundled + persisted setup sponsor friend config (read-only). */
  getSetupSponsorFriendConfig(): Promise<import("./setup-sponsor-friend.js").ResolvedSetupSponsorFriend>;
  /**
   * Full status the settings/discover UI consumes — resolved effective config
   * plus the last-attempt state from persisted config. The fresh-install UX
   * surfaces this so the user can see "we tried to add <sponsor> and here's
   * why it didn't work", not just the badge.
   */
  getSetupSponsorFriendStatus(): Promise<import("./setup-sponsor-friend.js").SetupSponsorFriendStatus>;

  /**
   * Run zero-step sponsor hello after first setup (idempotent). Manual
   * Retry button passes `forceBypassGuards: true` to skip the runtime's
   * cooldown + profile-readiness guards.
   */
  runSetupSponsorFriend(input?: {
    forceBypassGuards?: boolean;
  }): Promise<import("./setup-sponsor-friend.js").RunSetupSponsorFriendResult>;

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

  /**
   * Soft-probe whether the active (or requested) Ext Agent backend is reachable.
   * Does not block switching — used for in-chat banners and post-switch hints.
   */
  probeExtAgent(params?: ProbeExtAgentParams): Promise<ExtAgentReachability>;

  /**
   * Slash-command catalog for Ext Agent chat autocomplete (per active agent).
   * HomeClaw returns an empty command list with a limitation note.
   */
  getExtAgentCommandCatalog(
    params?: GetExtAgentCommandCatalogParams,
  ): Promise<ExtAgentCommandCatalog>;

  /**
   * Set or clear the Ext Agent session model override for the home owner
   * (used by `/model` in Ext Agent chat). Only hermes / openhuman / claudecode
   * honor the override today.
   */
  setExtAgentSessionModel(
    params: SetExtAgentSessionModelParams,
  ): Promise<SetExtAgentSessionModelResult>;

  /**
   * Home-node filesystem info for folder browsing (owner only).
   * Cross-platform: macOS / Linux / Windows.
   */
  getHomeFsInfo(): Promise<import("./ext-agent.js").HomeFsInfo>;

  /**
   * List files/dirs under a path on the home node (owner only).
   */
  listHomeFsEntries(
    params?: import("./ext-agent.js").ListHomeFsEntriesParams,
  ): Promise<import("./ext-agent.js").ListHomeFsEntriesResult>;

  /**
   * Discover Obsidian vault folders on the home node (owner only).
   * Reads Obsidian's vault registry and/or scans for `.obsidian` markers.
   */
  discoverObsidianVaults(): Promise<
    import("./ext-agent.js").DiscoverObsidianVaultsResult
  >;

  /**
   * Open Obsidian or Notion on the home node (owner only; allowlisted apps).
   * macOS / Windows / Linux.
   */
  openDesktopApp(
    params: import("./ext-agent.js").OpenDesktopAppParams,
  ): Promise<import("./ext-agent.js").OpenDesktopAppResult>;

  /**
   * Read the project folder for an Ext Agent (owner only).
   */
  getExtAgentProjectPath(
    params?: import("./ext-agent.js").GetExtAgentProjectPathParams,
  ): Promise<import("./ext-agent.js").ExtAgentProjectPathResult>;

  /**
   * Set or clear the project folder for an Ext Agent (owner only).
   * Ignored for agents that do not use projectPath.
   */
  setExtAgentProjectPath(
    params: import("./ext-agent.js").SetExtAgentProjectPathParams,
  ): Promise<import("./ext-agent.js").ExtAgentProjectPathResult>;

  /**
   * Preview a file on the home node for EnvoyGo Home files (owner only).
   * Returns HTML / text / base64 suitable for an embedded WebView.
   */
  previewHomeFsFile(
    params: import("./ext-agent.js").PreviewHomeFsFileParams,
  ): Promise<import("./ext-agent.js").PreviewHomeFsFileResult>;

  /**
   * Run MiniMax MMX-CLI media / status commands on the home node (owner only).
   * File outputs land under `{profileDir}/mmx-output/`.
   */
  runMmxMediaCommand(
    params: import("./ext-agent.js").RunMmxMediaCommandParams,
  ): Promise<import("./ext-agent.js").RunMmxMediaCommandResult>;

  /**
   * Reveal an absolute path on the home node in the OS file manager (owner only).
   * Used for MiniMax mmx-output review and similar home-local files.
   */
  revealHomeFsPath(
    params: import("./ext-agent.js").RevealHomeFsPathParams,
  ): Promise<import("./ext-agent.js").RevealHomeFsPathResult>;

  /**
   * Upload a client blob into `{profileDir}/envoy-uploads/` for agent chat
   * attachments (owner only). Used by EnvoyGo phone picks and browser file input.
   */
  uploadEnvoyAttachment(
    params: import("./ext-agent.js").UploadEnvoyAttachmentParams,
  ): Promise<import("./ext-agent.js").UploadEnvoyAttachmentResult>;

  /**
   * Build a shared text context block from home absolute paths for EnvoyAI /
   * Ext Agent turns (owner only).
   */
  buildAgentAttachmentContext(
    params: import("./ext-agent.js").BuildAgentAttachmentContextParams,
  ): Promise<import("./ext-agent.js").BuildAgentAttachmentContextResult>;

  /**
   * Slash-command catalog for EnvoyAI (built-in OpenClaw) chat autocomplete.
   * EnvoyMesh-owned verbs + hybrid expand prompts for mesh tools.
   */
  getEnvoyAiCommandCatalog(): Promise<ExtAgentCommandCatalog>;

  /**
   * Force-restart the built-in OpenClaw gateway (kills the child, waits for
   * the webhook port to be released, spawns a fresh gateway). Returns the
   * resulting status so the caller can refresh its UI without a follow-up
   * poll. Bound to the AI → AI Engine "Restart now" button and the chat
   * view's offline banner — gives the user a path to recover from a
   * "Stopped" state without bouncing the whole home node.
   */
  restartOpenClaw(): Promise<OpenClawStatus>;

  // --- Phase 49: Pi (built-in local coding agent) ---
  // Local-only; no mesh.* tool access. Reuses the existing TerminalCommandProposal
  // confirm flow for file/bash tool calls (Phase 30). See docs/pi-integration-design.md.
  /** Returns Pi runtime status (enabled, state, pid, model, lastError). */
  getPiStatus(): Promise<PiStatus>;
  /** Stop + start the Pi child process. Returns the new status. */
  restartPi(): Promise<PiStatus>;

  // --- Phase 54: Envoy Local (downloadable llama-server; never packaged) ---
  getEnvoyLocalStatus(): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  enableEnvoyLocal(
    params?: import("./envoy-local.js").EnableEnvoyLocalParams,
  ): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  /** Persist dismissal of the auto-provision consent dialog. */
  declineEnvoyLocalAutoProvision(): Promise<
    import("./envoy-local.js").EnvoyLocalStatus
  >;
  disableEnvoyLocal(): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  /**
   * Start llama-server when runtime + model are already installed (no download).
   * Wires Settings → AI to Envoy Local and saves the previous cloud/Ollama
   * provider as a Stop fallback when present.
   */
  startEnvoyLocal(): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  /**
   * Stop llama-server and restore the saved cloud/Ollama provider.
   * No-op when no usable fallback exists (keeps Envoy Local running).
   */
  stopEnvoyLocal(): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  restartEnvoyLocal(): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  cancelEnvoyLocalDownload(): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  listEnvoyLocalInstalledModels(): Promise<
    import("./envoy-local.js").EnvoyLocalInstalledModel[]
  >;
  searchEnvoyLocalModels(
    params?: import("./envoy-local.js").SearchEnvoyLocalModelsParams,
  ): Promise<import("./envoy-local.js").SearchEnvoyLocalModelsResult>;
  downloadEnvoyLocalModel(
    params: import("./envoy-local.js").DownloadEnvoyLocalModelParams,
  ): Promise<import("./envoy-local.js").EnvoyLocalInstalledModel[]>;
  setEnvoyLocalDownloadRegion(
    params: import("./envoy-local.js").SetEnvoyLocalDownloadRegionParams,
  ): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  setEnvoyLocalActiveModel(
    params: import("./envoy-local.js").SetEnvoyLocalActiveModelParams,
  ): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  deleteEnvoyLocalModel(
    params: import("./envoy-local.js").DeleteEnvoyLocalModelParams,
  ): Promise<import("./envoy-local.js").EnvoyLocalInstalledModel[]>;
  updateEnvoyLocalServerParams(
    params: import("./envoy-local.js").UpdateEnvoyLocalServerParamsParams,
  ): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  resetEnvoyLocalServerParams(): Promise<import("./envoy-local.js").EnvoyLocalStatus>;
  checkEnvoyLocalEngineUpdate(): Promise<
    import("./envoy-local.js").EnvoyLocalEngineUpdateInfo
  >;
  updateEnvoyLocalEngine(): Promise<import("./envoy-local.js").EnvoyLocalStatus>;

  // --- Phase 57E: Envoy Local embed sidecar (independent of chat) ---
  getEnvoyLocalEmbedStatus(): Promise<import("./envoy-local.js").EnvoyLocalEmbedStatus>;
  enableEnvoyLocalEmbed(
    params?: import("./envoy-local.js").EnableEnvoyLocalEmbedParams,
  ): Promise<import("./envoy-local.js").EnvoyLocalEmbedStatus>;
  stopEnvoyLocalEmbed(): Promise<import("./envoy-local.js").EnvoyLocalEmbedStatus>;
  disableEnvoyLocalEmbed(): Promise<import("./envoy-local.js").EnvoyLocalEmbedStatus>;

  /** One-shot prompt — used by the sendToPi JSON-RPC method. Returns the text. */
  sendToPi(text: string): Promise<string>;
  /** Dynamic AI bot — send a message to a character bot, get a reply. */
  sendToAiBot(botId: string, text: string): Promise<void>;
  /**
   * Start or focus a Pi interactive TUI for an explicitly chosen project folder.
   * Requires `projectPath` to spawn — no boot auto-start. Up to
   * {@link MAX_PI_TERMINAL_SESSIONS} concurrent Pi sessions (one per folder).
   */
  ensurePiTerminalSession(
    params?: import("./pi-agent.js").EnsurePiTerminalParams,
  ): Promise<import("./pi-agent.js").EnsurePiTerminalResult>;
  /**
   * Phase 49D — deliver the user's confirm/deny decision on a Pi tool-action
   * request. Pi executes its own tools; this only unblocks the agent.
   */
  piRespondToProposal(params: {
    uiRequestId: string
    confirmed: boolean
  }): Promise<{ uiRequestId: string; delivered: boolean }>;

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

  // OpenClaw extension/plugin management
  listOpenClawExtensionPlugins(): Promise<import("./openclaw-plugin.js").OpenClawPluginInfo[]>;
  inspectOpenClawExtensionPlugin(id: string): Promise<import("./openclaw-plugin.js").OpenClawPluginDetail | null>;
  enableOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }>;
  disableOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }>;
  installOpenClawExtensionPlugin(spec: string): Promise<{ ok: boolean; message: string }>;
  uninstallOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }>;
  updateOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }>;
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
   * Phase 35A joiner side — redeem a company/kiosk invite parsed from an
   * `envoy://invite?token=…` URI. Applies the issuer's connection info
   * (bootstrap peers / wsUrl) locally so this node can reach the issuer,
   * then sends a hello to the issuer's owner to establish the bond.
   *
   * Called from the Social UI when a joiner pastes an invite into the
   * Discover paste box. Mirrors the working Setup Sponsor Friend flow
   * (`applyWanJoinInvite` → `searchPeers` → `sendHello`).
   */
  redeemCompanyInvite(params: RedeemCompanyInviteParams): Promise<RedeemCompanyInviteResult>;

  /**
   * Phase 51 — list family profiles on this home node.
   */
  listFamilyProfiles(): Promise<ListFamilyProfilesResult>;

  /**
   * Phase 51 — create a family profile (owner-only for admin create;
   * family-invite pairing may also create non-owner profiles).
   */
  createFamilyProfile(params: CreateFamilyProfileParams): Promise<CreateFamilyProfileResult>;

  /** Phase 51 — update a family profile (owner can edit any; members edit self later). */
  updateFamilyProfile(params: UpdateFamilyProfileParams): Promise<UpdateFamilyProfileResult>;

  /** Phase 51 — delete a non-owner family profile (owner-only). Alias of wipeFamilyProfile. */
  deleteFamilyProfile(id: string): Promise<DeleteFamilyProfileResult>;

  /**
   * Phase 51 — wipe a non-owner profile and erase profile-scoped local data
   * (AI/family threads, rooms membership, sessions, push). Disconnects live
   * thin clients. Owner-only.
   */
  wipeFamilyProfile(id: string): Promise<WipeFamilyProfileResult>;

  /**
   * Phase 51 — mint a single-use family invite token for EnvoyGo pairing.
   * Owner-only. Reuses company-invite store with `kind: "family"`.
   */
  generateFamilyInviteToken(
    params?: GenerateFamilyInviteTokenParams,
  ): Promise<GenerateFamilyInviteTokenResult>;

  /**
   * Phase 51 follow-up — list selectable non-owner profiles for a valid
   * family invite token (no session auth; used by EnvoyGo re-pair UI).
   */
  previewFamilyInvite(
    params: import("./family-profile.js").PreviewFamilyInviteParams,
  ): Promise<import("./family-profile.js").PreviewFamilyInviteResult>;

  /**
   * Phase 51C — send a local family DM to another profile on this home node.
   * Never leaves the node. Thread key: `family:<sortedA>:<sortedB>`.
   */
  sendFamilyMessage(params: SendFamilyMessageParams): Promise<SendFamilyMessageResult>;

  /** Phase 51D — list family group rooms visible to the caller profile. */
  listFamilyRooms(): Promise<ListFamilyRoomsResult>;

  /** Phase 51D — create a family-only group room (no mesh sync). */
  createFamilyRoom(params: CreateFamilyRoomParams): Promise<CreateFamilyRoomResult>;

  /** Phase 51D — send a message in a family group room. */
  sendFamilyRoomMessage(
    params: SendFamilyRoomMessageParams,
  ): Promise<SendFamilyRoomMessageResult>;

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
   * Re-bind this thin-client session to a non-owner family profile when the
   * session token was missing profileId (legacy) or has boundFamilyProfileId
   * disagreeing with a corrupted profileId:"owner". Intentional owner QR
   * pairs still require a fresh family invite.
   */
  repairSessionProfile(
    params: RepairSessionProfileParams,
  ): Promise<RepairSessionProfileResult>;

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
  homeTerminalWsClose(params?: import("./home-remote.js").HomeTerminalWsCloseParams): Promise<import("./home-remote.js").HomeTerminalWsRpcResult>;

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
   * Draft site/Feed content (bio / blog / section / caption / feed) for owner review.
   * Does not publish and does not write into AI Chat history.
   */
  draftAuthorContent(
    params: import("./author-content-draft.js").DraftAuthorContentParams,
  ): Promise<import("./author-content-draft.js").DraftAuthorContentResult>;

  /**
   * Native Envoy AI document turn (heuristic tool routing).
   *
   * @deprecated Use {@link NodeService.runOwnerAgentTurn} from the Assistant UI.
   * RPC retained for one release; internal `_runDocumentAgentTurnCore` still powers owner-agent fallback.
   */
  runDocumentAgentTurn(message: string): Promise<DocumentAgentTurnResult>;
  /** Phase 18 — native owner agent orchestration (Assistant primary backend). */
  runOwnerAgentTurn(
    message: string,
    options?: RunOwnerAgentTurnOptions,
  ): Promise<OwnerAgentTurnResult>;

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
    callType?: CallMediaType,
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
    /** Phase 51 — family profile this device is bound to (defaults to owner). */
    profileId?: string;
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
  /** Read-only jobs where this node is a worker (synced via task.chain.status). */
  chainListObserved?(
    params?: import("./ws-protocol.js").ChainListObservedParams,
  ): Promise<import("./ws-protocol.js").ChainListObservedResult>;

  /** Cancel a chain or a single subtask within a chain. */
  chainCancel(params: ChainCancelParams): Promise<ChainCancelResult>;

  /** List published chain reports (newest first). */
  chainListReports(params?: ChainListReportsParams): Promise<ChainListReportsResult>;

  /** Fetch a single chain report by chainId. */
  chainGetReport(params: ChainGetReportParams): Promise<ChainGetReportResult>;

  /** Pin or unpin a chain report (pinned reports are exempt from 90-day GC). */
  chainPinReport(params: ChainPinReportParams): Promise<ChainPinReportResult>;

  /** Permanently delete a persisted chain report from this node. */
  chainDeleteReport(params: ChainDeleteReportParams): Promise<ChainDeleteReportResult>;

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

  /**
   * Phase 43B+ — batch reachability probe for chain worker candidates.
   *
   * For each bonded owner id, returns whether their agent peer is online
   * (open libp2p connection), same-LAN, and relay-routed. The team-job dialog
   * merges this with card-freshness health to make offline contacts
   * non-selectable — team jobs can only run on currently-reachable workers.
   */
  chainProbeReachability(params: ChainProbeReachabilityParams): Promise<ChainProbeReachabilityResult>;

  /** Phase 47C — owner resolves iteration ask_owner hold (stop/publish or continue). */
  chainResolveIteration(params: ChainResolveIterationParams): Promise<ChainResolveIterationResult>;

  /** Phase 43H — export chain cost breakdown as CSV. */
  chainExportCosts(params: ChainExportCostsParams): Promise<ChainExportCostsResult>;

  /** Phase 43H — list built-in chain goal templates. */
  chainListRecipes(params?: ChainListRecipesParams): Promise<ChainListRecipesResult>;

  /** Phase 43H — save an owner-defined chain recipe. */
  chainSaveRecipe(params: ChainSaveRecipeParams): Promise<ChainSaveRecipeResult>;

  /** Phase 43H — delete a saved chain recipe. */
  chainDeleteRecipe(params: ChainDeleteRecipeParams): Promise<ChainDeleteRecipeResult>;

  // ----- Phase 44C — Knowledge Base Plugins -----

  /**
   * List registered KB plugins. Optionally filter to active only.
   */
  listKbPlugins(params?: ListKbPluginsParams): Promise<KbPluginInfo[]>;

  /**
   * Activate a registered KB plugin (calls plugin.activate(), merges config).
   */
  activateKbPlugin(params: ActivateKbPluginParams): Promise<{ ok: boolean; reason?: string }>;

  /**
   * Deactivate an active KB plugin (calls plugin.deactivate()).
   */
  deactivateKbPlugin(params: DeactivateKbPluginParams): Promise<{ ok: boolean; reason?: string }>;

  /**
   * Read a plugin's persisted config.
   */
  getKbPluginConfig(pluginId: string): Promise<Record<string, unknown>>;

  /**
   * Merge partial config into a plugin's persisted config.
   */
  updateKbPluginConfig(params: UpdateKbPluginConfigParams): Promise<{ ok: boolean; reason?: string }>;
}

// --------------------------------------------------------------------------
// Phase 38 — Call types
// --------------------------------------------------------------------------

export type CallSessionStatus = "ringing" | "active" | "ended";

export type CallMediaType = "audio" | "video";

export interface CallSession {
  callId: string;
  peerOwnerId: string;
  callType: CallMediaType;
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
      callType: CallMediaType;
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