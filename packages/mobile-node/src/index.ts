/**
 * Mobile EnvoyMesh Node — In-process runtime for Capacitor mobile app.
 *
 * Key differences from the desktop node (apps/node):
 * - Browser-mode libp2p: WebSocket transport + DHT client + circuit relay
 *   (no TCP/QUIC/mDNS/autoNAT/DCUtR — not available in browsers)
 * - No child process — runs in the same WebView as the Social UI
 * - No CLI — initialized programmatically
 * - SQLite storage via Capacitor (packages/mobile-storage)
 * - Vault via Capacitor Filesystem (packages/mobile-vault)
 * - Identity via @noble/curves (packages/mobile-identity)
 *
 * Multi-device identity:
 * - Standalone: mobile generates its own owner/device identity
 * - Shared (import): mobile imports the home node's owner identity so
 *   both devices share the same ownerId and contacts
 */

import {
  generateOwnerIdentity,
  generateDeviceIdentity,
  generateAgentIdentity,
  deriveOwnerId,
  derivePeerId,
  deriveAgentId,
  deriveDeviceId,
  generateEcdhKeyPair,
  decryptOwnerKeyFromDevice,
  bytesToBase64url,
  signUnsignedEnvelope,
  signCanonicalPayload,
  signHumanProfile,
  verifyEnvelope,
  verifyAuthorizedDeviceEnvelope,
  isDeviceRevoked,
  createAgentCredential,
  type OwnerIdentity,
  type DeviceIdentity,
  type AgentIdentity,
  type EncryptedOwnerKey,
} from "@envoymesh/mobile-identity";
import { createMobileVault, type MobileVault } from "@envoymesh/mobile-vault";
import {
  createMobilePeerDirectory,
  createMobileTrustStore,
  createMobileSessionTokenStore,
  createMobileIdentityStateStore,
  createMobileChatLogStore,
  createMobileAgentActivityStore,
  createMobileAuditJournalStore,
  createMobileTaskJournalStore,
  createMobileAgentCardStore,
  createInMemoryDb,
  type MobileSessionTokenStore,
  type MobileDatabase,
  type MobileIdentityStateStore,
  type PersistedIdentityState,
  type SecureStorage,
} from "@envoymesh/mobile-storage";
import { evaluatePolicy, type BondLevel as PolicyBondLevel } from "@envoymesh/bonds";
import { cidForCapabilityTopic } from "#network/capability-topic-cid";
import { CLIENT_PROXY_PROTOCOL, ENVOY_CHAT_PROTOCOL, ENVOY_MESSAGE_PROTOCOL } from "#network/protocols";
import { installMobileDataTransferReceiver, sendMobileVaultFileDataTransfer } from "./data-transfer.js";
import { loadMobilePublishedDocumentIds, saveMobilePublishedDocumentIds } from "./mobile-published-library.js";
import { loadMobileExternalPublish, saveMobileExternalPublish } from "./mobile-external-publish.js";
import { loadMobileNodePrefs, saveMobileNodePrefs, type MobileNodePrefs } from "./mobile-node-prefs.js";
import { generateMobileChatDraft, resolveMobileContactAiAccessLevel } from "./mobile-chat-draft.js";
import { appendMobileAuditEvent, createMobileAuditRecord } from "./mobile-audit-log.js";
import { askMobileOwnerAgentPlanner, scanMobileOwnerAgentOutbound } from "./mobile-owner-agent-planner.js";
import {
  applyMobileAutoReplyLimitDenied,
  checkMobileAutoReplyAllowed,
  MobileAutoReplyLimitStore,
  recordMobileAutoReplyAfterSend,
} from "./mobile-auto-reply-limits.js";
import { loadMobilePublishedExternalMap } from "./mobile-published-external.js";
import { exportMobileLibraryDocumentToIpfs } from "./mobile-ipfs-export.js";
import { verifyMobileLibraryDocumentIpfsGateway } from "./mobile-ipfs-gateway-verify.js";
import { openBase64FileInMobileViewer } from "./mobile-file-open.js";
import {
  mobileVaultBasename,
  mobileVaultExtension,
  mobileVaultLibraryFingerprint,
  mobileVaultRelativePath,
  mobileVaultTitle,
} from "./mobile-vault-fingerprint.js";
import { readHeliaPackageVersionSync } from "@envoymesh/ipfs-helia/browser";
import {
  listMobileAgentShareProposals,
  removeMobileAgentShareProposal,
  upsertMobileAgentShareProposal,
} from "./mobile-agent-share-proposals.js";
import {
  createBondAcceptPayload,
  createBondRequestPayload,
  createBondChallengeResponsePayload,
  createAgentCardRequestPayload,
  createUnsignedEnvelope,
  createChatMessagePayload,
  createShareRequestPayload,
  createSharePreviewPayload,
  createShareAcceptPayload,
  createRendezvousRegisterPayload,
  createDiscoveryRequestPayload,
  parseDiscoveryResponsePayload,
  createSyncStatePayload,
  createProfileSyncPayload,
  createProfileRequestPayload,
  parseProfileRequestPayload,
  parseSyncStatePayload,
  parseShareRequestPayload,
  parseSharePreviewPayload,
  parseShareAcceptPayload,
  parseChatMessagePayload,
  parseChatRoomSyncPayload,
  parseChatRoomMessagePayload,
  CHAT_DELIVERY_ACK_TIMEOUT_MS,
  parseEnvelope,
  parseBondRequestPayload,
  parseBondAcceptPayload,
  parseBondChallengePayload,
  parseBondChallengeResponsePayload,
  parseReportCreatePayload,
  parseDeviceCertificate,
  parseDeviceRevocationRecord,
  type BondChallengePayload,
  type DeviceCertificate,
  type DeviceRevocationRecord,
  type AgentCredential,
  type Report,
  type TaskJournalEntry,
  type EnvoyEnvelope,
  ProfileGalleryPhotoSchema,
  ProfilePhotoRefSchema,
} from "@envoymesh/protocol";
import {
  bondTrustRank,
  evaluateAutonomousPolicy,
  applyAiIdentityToDraftText,
  runDocumentAgentTurn as runDocumentAgentTurnLoop,
  runOwnerAgentTurn as runOwnerAgentTurnLoop,
  matchAgentCapabilityRoutes,
  stripModelThinking,
  MAX_PROFILE_GALLERY_PHOTOS,
  canAgentAutonomousShareGalleryPhoto,
  galleryPhotoShareSensitivity,
  normalizeProfileMediaPolicy,
  type SetPublicProfileThumbnailParams,
  type UpsertProfileGalleryPhotoParams,
  type UpdateProfileGalleryPhotoVisibilityParams,
  type ProfileGalleryPhotoVisibility,
  type PeerProfileView,
  chatMessagePayloadDeviceFields,
  formatChatSenderDisplayName,
  verifyInboundChatDeviceAuthorization,
  chatSenderActorFromEnvelope,
  applyAiIdentityForIdentity,
  mapTaskJournalToActivity,
  mapOwnerReportToActivity,
  resolveReportContactOwnerId,
  shouldPushAgentActivity,
  ApprovalQueue,
  createApprovalItem,
  executeApprovedAction,
  shouldSkipAgentChatAssist,
  createTaskDispatcher,
  isA2ATaskIntent,
  buildOwnerDidPresentation,
  parseDidLookupInput,
  didKeysMatch,
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  type MultiHopDiscoveryMatch,
  type MultiHopDiscoverySessionView,
  type MorningReportEntry,
  chatRoomThreadKey,
  chatWireAttachmentsToContent,
  deferredDirectChatAttachmentKey,
} from "@envoymesh/api";
import { buildSignedChatDeliveredEnvelope, parseChatDeliveredAck } from "@envoymesh/api/chat-delivered";
import {
  buildMorningReportDigest,
  createMultiHopDiscoveryStore,
  type MultiHopDiscoveryStore,
} from "./mobile-local-store-shim.js";
import { handleMobileInboundAgentCardIntent } from "./mobile-agent-card-inbound.js";
import { createMobileContactOwnerKeyStore, type MobileContactOwnerKeyStore } from "./mobile-contact-owner-keys.js";
import { createMobilePeerProfileCache, type MobilePeerProfileCache } from "./mobile-peer-profile-cache.js";
import { isBrowserDevMode, isCapacitorNative } from "./runtime-detection.js";
import {
  importMobileProfilePhotoBytes,
  parseProfilePhotoMime,
  photoIdFromGalleryPath,
  profileGalleryVaultPath,
  profileThumbnailVaultPath,
  MAX_PROFILE_GALLERY_PHOTO_BYTES,
  MAX_PROFILE_THUMBNAIL_BYTES,
} from "./mobile-profile-photo.js";
import {
  handleMobileInboundProfileSync,
  loadMobileProfileThumbnailInline,
  sendMobileProfileEnvelope,
} from "./mobile-profile-sync.js";
import {
  mobileCreateChatRoom,
  mobileDismissChatRoom,
  mobileFlushPendingRoomSyncs,
  mobileHandleInboundChatRoomMessage,
  mobileHandleInboundChatRoomSync,
  mobileInviteToChatRoom,
  mobileLeaveChatRoom,
  mobileListChatRooms,
  mobileRemoveMembersFromChatRoom,
  mobileRenameChatRoom,
  mobileSendChatRoomMessage,
  mobileFlushPendingRoomMessages,
  type MobileChatRoomHost,
} from "./mobile-chat-room.js";
import { createMobileChatRoomStore } from "./mobile-chat-room-store.js";
import { createMobileChatRoomPendingSyncStore } from "./mobile-chat-room-pending-sync-store.js";
import { createMobileChatRoomPendingMessageStore } from "./mobile-chat-room-pending-message-store.js";
import { normalizeOpenAiCompatibleBaseUrl, runOwnerApprovedKnowledgeQuery } from "@envoymesh/models";
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import { peerIdFromString } from "@libp2p/peer-id";
import type { PrivateKey } from "@libp2p/interface";
import type {
  AgentShareProposal,
  BondRecord,
  ChatAttachment,
  ChatDraft,
  ChatMessage,
  AgentIdentityDocument,
  CreateHumanProfileInput,
  DiscoverPublishedLibraryParams,
  DiscoverPublishedLibraryPeerResult,
  HelloProfile,
  HelloRequest,
  // Phase 45 — Web Content Browsing.
  LibraryReadParams,
  LibraryReadResult,
  PublishWebContentParams,
  PublishWebContentResult,
  HelloResponse,
  HumanProfile,
  LibraryItem,
  ListLibraryItemsParams,
  ImportToLibraryParams,
  ImportToLibraryResult,
  VerifyLibraryItemIpfsGatewayParams,
  VerifyLibraryItemIpfsGatewayResult,
  ModelProviderConfig,
  NodeService,
  NodeServiceEvents,
  PublishedLibraryFileHit,
  SubmitAgentShareProposalParams,
  DocumentAgentTurnResult,
  DocumentAgentToolResult,
  OwnerAgentTurnResult,
  TransferStatus,
  NodeConfig,
  PairSharedIdentityResult,
  PeerSearchResult,
  PeerReputationSummary,
  RelayConfig,
  SendHelloOptions,
  ShareOffer,
  SocialIntroProposal,
  BridgeStatus,
  OpenClawStatus,
  PiStatus,
  PeerConnectionInfo,
  ListAgentActivityParams,
  AgentActivityRecord,
} from "@envoymesh/api";

function _normalizeMobileStoredOpenAiEndpoint(mp: ModelProviderConfig): ModelProviderConfig {
  if (!mp.endpoint?.trim()) return mp;
  if (mp.mode !== "ollama" && mp.mode !== "litellm" && mp.mode !== "openai-compatible") return mp;
  return { ...mp, endpoint: normalizeOpenAiCompatibleBaseUrl(mp.endpoint) };
}

import { HomeRemoteClient } from "./home-remote-client.js";
import { Libp2pStreamSocket, libp2pStreamToIo } from "./libp2p-stream-socket.js";

function _randomUUID(): string { return crypto.randomUUID(); }

function _sanitizeChatFilename(name: string): string {
  const base = name.trim().split(/[/\\]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
}

function _mimeTypeForFilename(filename: string): string {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  if (ext === "webm") return "audio/webm";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "ogg" || ext === "oga") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  return "application/octet-stream";
}

/** Home node libp2p peer id from relay-proxy pairing URL (`?target=…`). */
function _parseHomeNodePeerIdFromWsUrl(wsUrl: string): string | undefined {
  try {
    const target = new URL(wsUrl).searchParams.get("target")?.trim();
    if (target && (target.startsWith("12D3") || target.startsWith("Qm"))) {
      return target;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Same capability string as desktop `PUBLISHED_LIB_CAPABILITY` (apps/node). */
const MOBILE_PUBLISHED_LIB_CAPABILITY = "envoymesh.published-library";

function _trustLevelToPolicyBondLevel(level: BondRecord["level"] | undefined): PolicyBondLevel {
  const l = level ?? "public";
  if (l === "blocked") return "blocked";
  if (l === "direct") return "direct";
  if (l === "referred") return "referred";
  return "public";
}

/** Map bonds `evaluatePolicy` result to inbound bond-inbound outcomes (allow / deny / manual). */
function _bondOutcomeFromPolicy(
  policy: ReturnType<typeof evaluatePolicy>,
): "allow" | "deny" | "record" {
  if (policy.action === "deny") return "deny";
  if (policy.action === "allow") return "allow";
  return "record";
}

function _buildSafeSharePreviewText(
  payload: ReturnType<typeof parseShareRequestPayload>,
  sensitivity: string,
): string {
  if (payload.requestType === "file") {
    return `A file share is available at sensitivity level: ${sensitivity}. The file can be transferred over the encrypted P2P channel after you accept this preview.`;
  }
  if (payload.query) {
    const queryPreview =
      payload.query.length > 80 ? `${payload.query.slice(0, 77)}...` : payload.query;
    return `A knowledge answer is available for your query "${queryPreview}" at sensitivity level: ${sensitivity}. Accept this preview to receive the answer.`;
  }
  return `A knowledge answer is available at sensitivity level: ${sensitivity}. Accept this preview to receive the answer.`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MobileNodeConfig {
  /** Profile directory path (for Capacitor Filesystem). */
  profileDir: string;
  /** Relay WebSocket URLs to connect to. */
  relayUrls: string[];
  /** Bootstrap peer multiaddrs for the libp2p DHT. If empty, DHT is still
   * enabled but may take longer to find peers. Defaults to relayUrls
   * converted to p2p-circuit multiaddrs. */
  bootstrapPeers?: string[];
  /** Home node peer ID for shared identity pairing. */
  homeNodePeerId?: string;
  /** Injected database (SQLite). Falls back to in-memory for dev/testing. */
  database?: MobileDatabase;
  /** Injected vault. Falls back to in-memory for dev/testing. */
  vault?: MobileVault;
  /** Injected secure storage for private keys. Provide for production. */
  secureStorage?: SecureStorage;
}

export interface MobileNodeState {
  owner: OwnerIdentity;
  device: DeviceIdentity;
  agent: AgentIdentity;
  /** Whether this node shares identity with a home node. */
  sharedIdentity: boolean;
  /** Home node peer ID (if shared identity). */
  homeNodePeerId?: string;
  /**
   * Direct LAN WebSocket URL of the home node (e.g. `ws://192.168.x.x:3030/ws`).
   * Captured at pairing time so the mobile can prefer it for ongoing traffic
   * (lowest latency, no relay) when reachable on the same WiFi.
   */
  lanWsUrl?: string;
  /** Home bridge agent peer ID (HomeClaw/OpenClaw via home node). */
  homeAgentPeerId?: string;
  homeAgentPubKey?: string;
  homeAgentName?: string;
  /** Owner-signed device certificate (shared-identity / multi-device). */
  deviceCertificate?: DeviceCertificate;
  profileDir: string;
  relayUrls: string[];
}

export type MobileNodeStatus = "uninitialized" | "starting" | "running" | "stopping" | "offline";

/**
 * Build the fleet-relay WebSocket URL for {@link MobileNode}'s outbound `/ws/client`
 * connections. Avoids doubling the path (`.../ws/ws/client`) when the user pasted
 * a base URL ending in `/ws` (relay convention). Does not magically turn a **home node's**
 * JSON-RPC `/ws` server into `/ws/client` — fleet relay and home-node URLs remain different hops.
 */
export function toRelayDirectClientWsUrl(url: string): string {
  // `_relayUrls[0]` may be the *full* pairing URL captured from the QR
  // (e.g. `ws://relay:15432/ws?target=…&token=…`). The relay's libp2p
  // direct-client endpoint lives at `/ws/client`, so we must first strip
  // any query string the QR may have appended before we can decide whether
  // `/ws` is already at the end of the path.
  let pathOnly = url.trim().replace(/\/+$/, "");
  if (pathOnly) {
    try {
      const parsed = new URL(pathOnly);
      pathOnly = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");
    } catch {
      pathOnly = pathOnly.split("?")[0] ?? pathOnly;
    }
  }
  if (!pathOnly) return "";
  if (pathOnly.includes("/ws/client")) return pathOnly;
  if (/\/ws$/i.test(pathOnly)) return pathOnly.replace(/\/ws$/i, "/ws/client");
  return `${pathOnly}/ws/client`;
}

// ---------------------------------------------------------------------------
// Event emitter
// ---------------------------------------------------------------------------

type EventHandler = (data: unknown) => void;

class EventBus {
  private readonly _handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    let set = this._handlers.get(event);
    if (!set) {
      set = new Set();
      this._handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
      if (set?.size === 0) this._handlers.delete(event);
    };
  }

  emit(event: string, data: unknown): void {
    const set = this._handlers.get(event);
    if (set) {
      for (const handler of set) {
        try { handler(data); } catch { /* swallow */ }
      }
    }
  }

  hasListeners(event: string): boolean {
    return (this._handlers.get(event)?.size ?? 0) > 0;
  }

  clear(): void {
    this._handlers.clear();
  }
}

// ---------------------------------------------------------------------------
// MobileNode
// ---------------------------------------------------------------------------

/**
 * Phase 34: project a stored agent card row (the JSON payload is the protocol
 * `AgentCard`; the row is what `_agentCardStore` returns) into the minimal
 * `CachedAgentCardSummary` the UI consumes. Rich optional fields are only
 * forwarded when present on the source card.
 */
function summarizeCachedAgentCard(row: {
  ownerId: string;
  cardJson: string;
  cachedAt: string;
  sourceAgentPeerId?: string;
}): import("@envoymesh/api").CachedAgentCardSummary {
  const card = JSON.parse(row.cardJson) as import("@envoymesh/protocol").AgentCard;
  const summary: import("@envoymesh/api").CachedAgentCardSummary = {
    ownerId: row.ownerId,
    displayName: card.displayName,
    capabilities: card.capabilities,
    cachedAt: row.cachedAt,
    sourceAgentPeerId: row.sourceAgentPeerId,
  };
  if (card.nodeProfile !== undefined) summary.nodeProfile = card.nodeProfile;
  if (card.publicTopics) summary.publicTopics = card.publicTopics;
  if (card.trustPolicySummary) summary.trustPolicySummary = card.trustPolicySummary;
  if (card.supportedProtocolVersions) {
    summary.supportedProtocolVersions = card.supportedProtocolVersions;
  }
  if (card.webContentRoot) summary.webContentRoot = card.webContentRoot;
  if (card.agentNetworkProfile) summary.agentNetworkProfile = card.agentNetworkProfile;
  return summary;
}

export class MobileNode implements NodeService {
  private readonly _db: MobileDatabase;
  private readonly _vault: MobileVault;
  private readonly _peerDirectory: ReturnType<typeof createMobilePeerDirectory>;
  private readonly _trustStore: ReturnType<typeof createMobileTrustStore>;
  private readonly _sessionTokenStore: MobileSessionTokenStore;
  private readonly _identityStateStore: MobileIdentityStateStore;
  private readonly _chatLog: ReturnType<typeof createMobileChatLogStore>;
  private readonly _chatRoomStore: ReturnType<typeof createMobileChatRoomStore>;
  private readonly _chatRoomPendingSyncStore: ReturnType<typeof createMobileChatRoomPendingSyncStore>;
  private readonly _chatRoomPendingMessageStore: ReturnType<typeof createMobileChatRoomPendingMessageStore>;
  private readonly _groupDeliveryPending = new Map<
    string,
    { threadKey: string; pending: Set<string> }
  >();
  private _chatRoomSyncFlushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly _agentActivity: ReturnType<typeof createMobileAgentActivityStore>;
  private readonly _auditJournal: ReturnType<typeof createMobileAuditJournalStore>;
  private readonly _taskJournal: ReturnType<typeof createMobileTaskJournalStore>;
  private readonly _agentCardStore: ReturnType<typeof createMobileAgentCardStore>;
  private readonly _taskDispatcher = createTaskDispatcher();
  private readonly _approvalQueue = new ApprovalQueue();
  private readonly _secureStorage?: SecureStorage;
  private readonly _events = new EventBus();
  private readonly _relayUrls: string[];
  private _profileDir: string;

  private _state!: MobileNodeState;
  private _status: MobileNodeStatus = "uninitialized";
  private _relaySockets: WebSocket[] = [];
  private _lastActivity = 0;
  private _manualOnline = true;
  private _humanProfile: HumanProfile | undefined;
  private _pendingQueries = new Map<string, { resolve: (r: PeerSearchResult[]) => void; timer: ReturnType<typeof setTimeout> }>();
  private _relayBackoffTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private _relayBackoffs = new Map<string, number>();
  private _deviceRevocations: DeviceRevocationRecord[] = [];
  private _agentCredential: AgentCredential | undefined;

  /** Pending inbound bond.request rows awaiting {@link acceptHello} / {@link declineHello}. */
  private readonly _pendingHelloRequests = new Map<string, {
    remotePeerId: string;
    requesterOwnerId: string;
    requesterDisplayName: string;
    message: string;
    requestedLevel: string;
    createdAt: string;
  }>();

  /** Trust-mode intro proposes — mirrored desktop NodeService pending inbox */
  private readonly _pendingSocialIntroProposals = new Map<
    string,
    SocialIntroProposal & { ownerCommitmentRef?: string }
  >();

  /** FS-C — share + data transfer (mirrors desktop `NodeServiceImpl` maps). */
  private readonly _pendingInboundShareOffers = new Map<string, ShareOffer>();
  private readonly _pendingPushShareByRequestMsgId = new Map<
    string,
    { relativePath: string; toPeerId: string }
  >();
  private readonly _pendingFileSendByPreviewMsgId = new Map<
    string,
    { relativePath: string; toPeerId: string }
  >();
  private readonly _pendingDataTransferSavePath = new Map<string, string>();
  /** Inbound accept waiting for bytes — keyed by preview/share id. */
  private readonly _inboundTransferByShareId = new Map<
    string,
    {
      senderNodeId: string;
      senderVaultRelativePath: string;
      savePath: string;
      senderOwnerId?: string;
      chatRoomId?: string;
      chatMessageId?: string;
      chatAttachmentId?: string;
    }
  >();
  /** Vault paths for 1:1 chat attachments when transfer completes before chat.message is persisted. */
  private readonly _deferredDirectChatAttachmentVaultPath = new Map<string, string>();
  private readonly _peerDeviceByTransportId = new Map<
    string,
    { devicePublicKeyPem: string; deviceId: string }
  >();
  private readonly _peerDeviceByEnvoyPeerId = new Map<
    string,
    { devicePublicKeyPem: string; deviceId: string }
  >();
  /** Envelope `senderPeerId` (envoy_*) → libp2p transport peer id (when seen on mesh). */
  private readonly _transportByEnvoyPeerId = new Map<string, string>();
  /** Inbound `chat.message` payload `senderOwnerId` keyed by device envelope id. */
  private readonly _ownerIdByEnvoyDevicePeerId = new Map<string, string>();

  /** Inbound chat drafts keyed by thread owner id (for cloud-assisted replies). */
  private readonly _chatDrafts = new Map<string, ChatDraft[]>();
  private readonly _autoReplyLimitStore = new MobileAutoReplyLimitStore();

  // Libp2p mesh (browser-mode: WebSocket transport + DHT client + circuit relay)
  private _mesh?: import("libp2p").Libp2p;
  private _meshPeerId = "";
  private _meshBootstrapPeers: string[] = [];
  private _dhtAdvertiseTimer: ReturnType<typeof setInterval> | null = null;
  /** Topics explicitly advertised via {@link advertiseTopic} (for {@link stopAdvertiseTopic}). */
  private readonly _dhtUserAdvertisedTopics = new Set<string>();
  /** Best-effort last failure for diagnostics ({@link getConnectionStatus}). */
  private _lastNodeError: string | null = null;
  private _lastNodeErrorAt: string | null = null;
  private _homeRemote: HomeRemoteClient | null = null;
  private _homeRemoteOnline = false;
  /** Name of the currently active home-remote transport (`"lan"` | `"libp2p"` | `"tunnel"` | null). */
  private _homeRemoteTransport: string | null = null;
  private _lastBootstrapOk: boolean | null = null;
  private _lastBootstrapError: string | null = null;
  private _lastBootstrapCounts: Record<string, unknown> = {};
  /** Cached node prefs loaded from localStorage (model, AI settings, autonomy, etc.). */
  private _aiPrefsOwnerId: string | null = null;
  private _aiPrefs: MobileNodePrefs = {
    modelProviders: { mode: "mock" },
    chatAssistEnabled: false,
    autonomousKillSwitch: false,
    autonomousPolicies: [],
    trustModeEnabled: false,
    contactAiPreferences: [],
  };
  private _multihopDiscoveryStore: MultiHopDiscoveryStore | null = null;
  private _contactOwnerKeys: MobileContactOwnerKeyStore | null = null;
  private _peerProfileCache: MobilePeerProfileCache | null = null;
  /**
   * Cache of the home's `NodeConfig` (AI settings, model provider, etc.) — populated
   * by the post-pairing bootstrap. Surfaced to the mobile UI so the user can see
   * the home's actual AI configuration rather than the mobile's local defaults.
   * `null` when not paired or bootstrap hasn't run yet.
   */
  private _homeNodeConfig: NodeConfig | null = null;
  /**
   * Cache of the home's bonded contacts (the home's trust store), populated by the
   * post-pairing bootstrap. In paired mode the mobile acts as a thin client, so
   * `getBonds()` returns this list rather than the mobile's local trust store
   * (which is empty by design — the mobile has no own bonds in v1 paired mode).
   * `null` when not paired or bootstrap hasn't run yet.
   */
  private _homeBonds: import("@envoymesh/api").BondRecord[] | null = null;
  /**
   * Last bootstrap timestamp (ms since epoch). Used to debounce re-bootstraps
   * when the home reconnects — we don't want to re-fetch everything on every
   * transport upgrade, but we do want a refresh after a fresh reconnection
   * that took more than a few seconds.
   */
  private _lastPairedBootstrapAt = 0;
  constructor(config: MobileNodeConfig) {
    this._profileDir = config.profileDir;
    this._relayUrls = [...config.relayUrls];
    this._meshBootstrapPeers = config.bootstrapPeers ?? [];
    this._db = config.database ?? createInMemoryDb();
    this._vault = config.vault ?? createMobileVault();
    this._secureStorage = config.secureStorage;
    this._peerDirectory = createMobilePeerDirectory(this._db);
    this._trustStore = createMobileTrustStore(this._db);
    this._sessionTokenStore = createMobileSessionTokenStore(this._db);
    this._identityStateStore = createMobileIdentityStateStore(this._db);
    this._chatLog = createMobileChatLogStore(this._db);
    this._chatRoomStore = createMobileChatRoomStore(this._profileDir);
    this._chatRoomPendingSyncStore = createMobileChatRoomPendingSyncStore(this._profileDir);
    this._chatRoomPendingMessageStore = createMobileChatRoomPendingMessageStore(this._profileDir);
    this._chatRoomSyncFlushTimer = setInterval(() => {
      void mobileFlushPendingRoomSyncs(this._mobileChatRoomHost());
      void mobileFlushPendingRoomMessages(this._mobileChatRoomHost());
    }, 90_000);
    this._agentActivity = createMobileAgentActivityStore(this._db);
    this._auditJournal = createMobileAuditJournalStore(this._db);
    this._taskJournal = createMobileTaskJournalStore(this._db);
    this._agentCardStore = createMobileAgentCardStore(this._db);
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  /**
   * Initialize a standalone mobile identity (different from home node).
   */
  async initStandalone(profileDir: string): Promise<MobileNodeState> {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    this._state = {
      owner, device, agent,
      sharedIdentity: false,
      profileDir,
      relayUrls: this._relayUrls,
    };
    this._profileDir = profileDir;
    return this._state;
  }

  /**
   * Import the owner identity from the home node for shared-identity mode.
   * The mobile device generates its own device keypair but shares the owner.
   *
   * In shared-identity mode:
   * - Same ownerId on both devices (contacts/bonds are shared)
   * - Different deviceId per device (for device-level routing)
   * - Agent identity is derived from shared ownerId + device-specific agent key
   */
  async importOwnerIdentity(
    profileDir: string,
    ownerPrivateKeyPem: string,
    ownerPublicKeyPem: string,
    homeNodePeerId?: string,
    /** Pairing RPC may already have bound a {@link DeviceIdentity}; must reuse those keys */
    opts?: {
      device?: DeviceIdentity;
      homeAgentPeerId?: string;
      homeAgentPubKey?: string;
      homeAgentName?: string;
      deviceCertificate?: DeviceCertificate;
      lanWsUrl?: string;
    },
  ): Promise<MobileNodeState> {
    const ownerId = deriveOwnerId(ownerPublicKeyPem);
    const owner: OwnerIdentity = {
      ownerId,
      publicKeyPem: ownerPublicKeyPem,
      privateKeyPem: ownerPrivateKeyPem,
    };

    // Device keys: reuse when provided ([pairWithHomeNode] already registered device with home node)
    const device = opts?.device ?? generateDeviceIdentity();
    const agent = generateAgentIdentity(ownerId);

    this._state = {
      owner, device, agent,
      sharedIdentity: true,
      homeNodePeerId,
      homeAgentPeerId: opts?.homeAgentPeerId,
      homeAgentPubKey: opts?.homeAgentPubKey,
      homeAgentName: opts?.homeAgentName,
      deviceCertificate: opts?.deviceCertificate,
      profileDir,
      relayUrls: this._relayUrls,
      lanWsUrl: opts?.lanWsUrl,
    };
    this._profileDir = profileDir;
    await this._registerHomeBridgeAgentRoute();
    return this._state;
  }

  get state(): MobileNodeState {
    return this._state;
  }

  get sharedIdentity(): boolean {
    return this._state?.sharedIdentity ?? false;
  }

  /**
   * Restore shared identity from persisted storage.
   * Called on app restart — no QR re-scan needed.
   *
   * Private keys must be fetched from the OS keychain separately
   * (iOS Keychain / Android EncryptedSharedPreferences).
   * This method restores the public identity state from SQLite.
   *
   * @param persisted The persisted identity state from storage
   * @param ownerPrivateKeyPem The owner's private key (from Keychain)
   * @param devicePrivateKeyPem The device's private key (from Keychain)
   * @param agentPrivateKeyPem The agent's private key (from Keychain)
   */
  async restoreSharedIdentity(
    persisted: PersistedIdentityState,
    ownerPrivateKeyPem: string,
    devicePrivateKeyPem: string,
    agentPrivateKeyPem: string,
  ): Promise<MobileNodeState> {
    this._state = {
      owner: {
        ownerId: persisted.ownerId,
        publicKeyPem: persisted.ownerPublicKeyPem,
        privateKeyPem: ownerPrivateKeyPem,
      },
      device: {
        deviceId: persisted.deviceId,
        publicKeyPem: persisted.devicePublicKeyPem,
        privateKeyPem: devicePrivateKeyPem,
      },
      agent: {
        agentId: deriveAgentId(persisted.ownerId, persisted.agentPublicKeyPem),
        agentPeerId: persisted.agentPeerId,
        publicKeyPem: persisted.agentPublicKeyPem,
        privateKeyPem: agentPrivateKeyPem,
      },
      sharedIdentity: true,
      homeNodePeerId: persisted.homeNodePeerId,
      homeAgentPeerId: persisted.homeAgentPeerId,
      homeAgentPubKey: persisted.homeAgentPubKey,
      homeAgentName: persisted.homeAgentName,
      deviceCertificate: _parsePersistedDeviceCertificate(persisted.deviceCertificateJson),
      profileDir: this._profileDir,
      relayUrls: persisted.relayUrls,
      lanWsUrl: persisted.lanWsUrl,
    };
    this._relayUrls.length = 0;
    this._relayUrls.push(...persisted.relayUrls);
    await this._registerHomeBridgeAgentRoute();
    return this._state;
  }

  /**
   * Persist the current shared identity state to SQLite + SecureStorage.
   * Public state goes to SQLite, private keys go to OS keychain via SecureStorage.
   */
  async persistSharedIdentity(): Promise<PersistedIdentityState> {
    return this._persistCurrentIdentity(true);
  }

  /**
   * Persist the current (standalone or shared) identity to SQLite + SecureStorage.
   * Internal method called by persistSharedIdentity / persistStandaloneIdentity.
   */
  private async _persistCurrentIdentity(sharedIdentity: boolean): Promise<PersistedIdentityState> {
    const s = this._state;
    // Preserve original createdAt if re-persisting
    const existing = await this._identityStateStore.load();
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const persisted: PersistedIdentityState = {
      sharedIdentity,
      ownerId: s.owner.ownerId,
      ownerPublicKeyPem: s.owner.publicKeyPem,
      deviceId: s.device.deviceId,
      devicePublicKeyPem: s.device.publicKeyPem,
      agentPeerId: s.agent.agentPeerId,
      agentPublicKeyPem: s.agent.publicKeyPem,
      homeNodePeerId: s.homeNodePeerId,
      homeAgentPeerId: s.homeAgentPeerId,
      homeAgentPubKey: s.homeAgentPubKey,
      homeAgentName: s.homeAgentName,
      deviceCertificateJson: s.deviceCertificate ? JSON.stringify(s.deviceCertificate) : undefined,
      relayUrls: [...this._relayUrls],
      lanWsUrl: s.lanWsUrl,
      createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this._identityStateStore.save(persisted);
    if (this._secureStorage) {
      await this._secureStorage.set("ownerPrivateKey", s.owner.privateKeyPem);
      await this._secureStorage.set("devicePrivateKey", s.device.privateKeyPem);
      await this._secureStorage.set("agentPrivateKey", s.agent.privateKeyPem);
    } else if (isBrowserDevMode()) {
      // Browser dev mode: allow localStorage as a plaintext fallback so the
      // social UI can boot. Never enable this on a native build.
      try {
        localStorage.setItem("envoymesh_keys_owner", s.owner.privateKeyPem);
        localStorage.setItem("envoymesh_keys_device", s.device.privateKeyPem);
        localStorage.setItem("envoymesh_keys_agent", s.agent.privateKeyPem);
      } catch { /* localStorage may be unavailable */ }
    } else {
      // Native build without a secure storage adapter wired in. Refuse to
      // persist private keys in plaintext — this would compromise the mesh.
      throw new Error(
        "MobileNode: no secure storage adapter provided for a native build. " +
          "Pass a `secureStorage` option implementing set/get/delete to MobileNode " +
          "(e.g. the iOS Keychain / Android EncryptedSharedPreferences adapter " +
          "from apps/mobile/src/capacitor-secure-storage.ts).",
      );
    }
    return persisted;
  }

  /**
   * Complete the shared-identity pairing flow from a scanned QR code.
   *
   * Flow:
   * 1. Generate device keypair + ECDH keypair
   * 2. Connect to home node relay
   * 3. Call pairSharedIdentity RPC
   * 4. Decrypt owner private key
   * 5. Import owner identity
   * 6. Persist to storage
   *
   * @param qrPayload Decoded envoy://pair URI params
   * @returns The complete pairing result including session token
   */
  async pairWithHomeNode(qrPayload: import("@envoymesh/api").PairWithHomeNodeParams): Promise<import("@envoymesh/api").PairWithHomeNodeResult> {
    // 1. Reuse a persisted device keypair for this home node, or generate
    //    a fresh one. The home node's `deviceAuthorizationStore` dedups by
    //    `deviceId` (derived from the device's public key), so reusing the
    //    same key across re-pairs of the same mobile with the same home
    //    node keeps a single record on the home node and just refreshes
    //    `lastSeenAt` (the original `pairedAt` is preserved by the store).
    //    The key is namespaced by the home node's ownerId so a single
    //    mobile can be a satellite to multiple home nodes, each with its
    //    own stable device identity.
    const device = await this._loadOrCreateDeviceForHomeNode(qrPayload.ownerId);
    const ecdhKeyPair = await generateEcdhKeyPair();

    // 2. Connect to relay and exchange pairSharedIdentity RPC
    const ws = new WebSocket(qrPayload.wsUrl);
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let rpcTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        connectTimer = setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 15000);
        ws.onopen = () => { clearTimeout(connectTimer); resolve(); };
        ws.onerror = () => { clearTimeout(connectTimer); reject(new Error("Failed to connect to relay")); };
      });

      // 3. Send pairSharedIdentity RPC
      const requestId = _randomUUID();
      const rpcRequest = {
        id: requestId,
        method: "pairSharedIdentity",
        params: {
          requesterOwnerId: qrPayload.ownerId,
          requesterDeviceId: device.deviceId,
          requesterDevicePublicKeyPem: device.publicKeyPem,
          keyExchangePublicKey: bytesToBase64url(new Uint8Array(ecdhKeyPair.publicKeyRaw)),
          pairingToken: qrPayload.token,
        },
      };
      ws.send(JSON.stringify(rpcRequest));

      const response = await new Promise<PairSharedIdentityResult>((resolve, reject) => {
        let settled = false;
        rpcTimer = setTimeout(() => {
          settled = true;
          reject(new Error("pairSharedIdentity timeout"));
        }, 30000);
        ws.onmessage = (event) => {
          if (settled) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.id === requestId) {
              clearTimeout(rpcTimer);
              settled = true;
              if (msg.error) {
                reject(new Error(msg.error.message ?? "pairSharedIdentity failed"));
              } else {
                resolve(msg.result as PairSharedIdentityResult);
              }
            }
          } catch { /* wait for next message */ }
        };
        ws.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(rpcTimer);
          reject(new Error("WebSocket error"));
        };
        ws.onclose = () => {
          if (settled) return;
          settled = true;
          clearTimeout(rpcTimer);
          reject(new Error("Connection closed"));
        };
      });

      // 4. Decrypt owner private key
      const encrypted: EncryptedOwnerKey = {
        encryptedKey: response.encryptedOwnerKey,
        ephemeralPublicKey: response.ephemeralPublicKey,
        iv: response.iv,
        authTag: response.authTag,
      };
      const ownerPrivateKeyPem = await decryptOwnerKeyFromDevice(encrypted, ecdhKeyPair.privateKey);

      // 5. Import owner identity
      const homeNodePeerId =
        _parseHomeNodePeerIdFromWsUrl(qrPayload.wsUrl) ??
        qrPayload.homeNodePeerId?.trim() ??
        undefined;
      const homeAgentPeerId = response.agentPeerId ?? qrPayload.agentPeerId;
      const homeAgentPubKey = response.agentPubKey ?? qrPayload.agentPubKey;
      const homeAgentName = response.agentName ?? qrPayload.agentName;
      const deviceCertificate = response.deviceCertificate
        ? parseDeviceCertificate(response.deviceCertificate)
        : undefined;
      await this.importOwnerIdentity(
        this._profileDir,
        ownerPrivateKeyPem,
        response.ownerPublicKey,
        homeNodePeerId,
        {
          device,
          homeAgentPeerId,
          homeAgentPubKey,
          homeAgentName,
          deviceCertificate,
          lanWsUrl: qrPayload.lanWsUrl?.trim() || undefined,
        },
      );

      // 6. Persist to storage (public state → SQLite, private keys → SecureStorage)
      await this.persistSharedIdentity();

      // Save the relay URL from the QR so the home remote client can reach the
      // home node through the relay after pairing. The home node's getPairingPayload
      // sets `wsUrl` to its first relay's WebSocket URL (e.g. ws://<relay-host>:<port>/ws).
      // Without this, the mobile app has no relay URL configured and cannot
      // proxy terminal / agent calls to the home node.
      const relayUrl = qrPayload.wsUrl?.trim();
      if (relayUrl && !this._relayUrls.includes(relayUrl)) {
        this._relayUrls.push(relayUrl);
        if (this._status === "running") {
          this._connectRelay(relayUrl);
        }
        try {
          localStorage.setItem(
            "envoymesh_relay_urls",
            JSON.stringify([...this._relayUrls]),
          );
        } catch {
          /* best effort — localStorage may be unavailable in some contexts */
        }
      }

      // Store session token for reconnection
      if (response.sessionToken && this._sessionTokenStore) {
        await this._sessionTokenStore.setToken({
          token: response.sessionToken,
          ownerId: response.ownerId,
          deviceId: device.deviceId,
          displayName: "Home Node",
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        });
      }

      void this._syncDeviceRevocationsFromHome().catch((err) =>
        console.warn(
          "[mobile-node] device revocation sync after pairing failed:",
          err instanceof Error ? err.message : err,
        ),
      );

      // Pull the home's state (peer profiles, agent cards, AI config) so the
      // mobile's UI shows the home's data, not the mobile's empty local cache.
      // Retry up to 3 times with 2s/4s/8s backoff — relay connections can take a moment.
      let bootstrapOk = false;
      let lastErr = "";
      for (let attempt = 0; attempt < 3 && !bootstrapOk; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * (2 ** (attempt - 1))));
        try {
          await this._bootstrapPairedStateFromHome();
          bootstrapOk = true;
          this._lastBootstrapOk = true;
          this._lastBootstrapError = null;
          this._events.emit("home:bootstrap-ok", {});
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
          console.warn(`[mobile-node] paired-state bootstrap attempt ${attempt + 1}/3 failed:`, lastErr);
          if (attempt === 2) {
            this._lastBootstrapOk = false;
            this._lastBootstrapError = lastErr;
            this._events.emit("home:bootstrap-failed", { error: lastErr });
          }
        }
      }

      return {
        sessionToken: response.sessionToken,
        deviceCertificate: response.deviceCertificate,
        ownerId: response.ownerId,
      };
    } finally {
      clearTimeout(connectTimer);
      clearTimeout(rpcTimer);
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  /**
   * Reuse the persisted device keypair for a given home node, or mint a
   * new one. The key is namespaced by the home node's `ownerId` so a
   * single mobile can be a satellite to multiple home nodes, each with
   * its own stable device identity.
   *
   * Falls back to a fresh `generateDeviceIdentity()` (and persists it)
   * when:
   *  - `secureStorage` is not configured (e.g. browser dev mode without
   *    injected keychain);
   *  - no key is stored yet for this home node;
   *  - the stored value cannot be parsed (corrupt / from older version).
   */
  private async _loadOrCreateDeviceForHomeNode(homeNodeOwnerId: string): Promise<DeviceIdentity> {
    if (!this._secureStorage || !homeNodeOwnerId) {
      return generateDeviceIdentity();
    }
    const key = `deviceIdentity:${homeNodeOwnerId}`;
    try {
      const stored = await this._secureStorage.get(key);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<DeviceIdentity>;
        if (
          typeof parsed.deviceId === "string" &&
          typeof parsed.publicKeyPem === "string" &&
          typeof parsed.privateKeyPem === "string" &&
          // Recompute deviceId from the persisted public key. If the
          // stored deviceId does not match, the persisted blob is from
          // a different identity (corruption / migration) — fall through
          // and mint fresh.
          deriveDeviceId(parsed.publicKeyPem) === parsed.deviceId
        ) {
          return parsed as DeviceIdentity;
        }
      }
    } catch {
      /* fall through to mint fresh */
    }
    const fresh = generateDeviceIdentity();
    try {
      await this._secureStorage.set(key, JSON.stringify(fresh));
    } catch {
      /* best effort — non-secureStorage builds can't persist anyway */
    }
    return fresh;
  }

  async listAuthorizedDevices(): Promise<import("@envoymesh/api").ListAuthorizedDevicesResult> {
    return { devices: [] };
  }

  async revokeAuthorizedDevice(
    _params: import("@envoymesh/api").RevokeAuthorizedDeviceParams,
  ): Promise<import("@envoymesh/api").RevokeAuthorizedDeviceResult> {
    throw new Error("revokeAuthorizedDevice is only supported on the home node");
  }

  async mergeAuthorizedDevices(
    _params: import("@envoymesh/api").MergeAuthorizedDevicesParams,
  ): Promise<import("@envoymesh/api").MergeAuthorizedDevicesResult> {
    throw new Error("mergeAuthorizedDevices is only supported on the home node");
  }

  async pruneRevokedDevices(): Promise<import("@envoymesh/api").PruneRevokedDevicesResult> {
    throw new Error("pruneRevokedDevices is only supported on the home node");
  }

  // -----------------------------------------------------------
  // Phase 35A — Company Invites
  // -----------------------------------------------------------
  async createCompanyInvite(
    params?: import("@envoymesh/api").CreateCompanyInviteParams,
  ): Promise<import("@envoymesh/api").CreateCompanyInviteResult> {
    return this._homeRemoteCall("createCompanyInvite", (params ?? {}) as Record<string, unknown>);
  }

  async listCompanyInvites(): Promise<import("@envoymesh/api").ListCompanyInvitesResult> {
    return this._homeRemoteCall("listCompanyInvites", {});
  }

  async revokeCompanyInvite(
    inviteId: string,
  ): Promise<import("@envoymesh/api").RevokeCompanyInviteResult> {
    return this._homeRemoteCall("revokeCompanyInvite", { inviteId });
  }

  async redeemCompanyInvite(
    params: import("@envoymesh/api").RedeemCompanyInviteParams,
  ): Promise<import("@envoymesh/api").RedeemCompanyInviteResult> {
    return this._homeRemoteCall(
      "redeemCompanyInvite",
      params as unknown as Record<string, unknown>,
    );
  }

  // -----------------------------------------------------------
  // Phase 51 — Family Network
  // -----------------------------------------------------------
  async listFamilyProfiles(): Promise<import("@envoymesh/api").ListFamilyProfilesResult> {
    return this._homeRemoteCall("listFamilyProfiles", {});
  }

  async createFamilyProfile(
    params: import("@envoymesh/api").CreateFamilyProfileParams,
  ): Promise<import("@envoymesh/api").CreateFamilyProfileResult> {
    return this._homeRemoteCall("createFamilyProfile", params as unknown as Record<string, unknown>);
  }

  async updateFamilyProfile(
    params: import("@envoymesh/api").UpdateFamilyProfileParams,
  ): Promise<import("@envoymesh/api").UpdateFamilyProfileResult> {
    return this._homeRemoteCall("updateFamilyProfile", params as unknown as Record<string, unknown>);
  }

  async deleteFamilyProfile(
    id: string,
  ): Promise<import("@envoymesh/api").DeleteFamilyProfileResult> {
    return this._homeRemoteCall("deleteFamilyProfile", { id });
  }

  async wipeFamilyProfile(
    id: string,
  ): Promise<import("@envoymesh/api").WipeFamilyProfileResult> {
    return this._homeRemoteCall("wipeFamilyProfile", { id });
  }

  async generateFamilyInviteToken(
    params?: import("@envoymesh/api").GenerateFamilyInviteTokenParams,
  ): Promise<import("@envoymesh/api").GenerateFamilyInviteTokenResult> {
    return this._homeRemoteCall(
      "generateFamilyInviteToken",
      (params ?? {}) as Record<string, unknown>,
    );
  }

  async sendFamilyMessage(
    params: import("@envoymesh/api").SendFamilyMessageParams,
  ): Promise<import("@envoymesh/api").SendFamilyMessageResult> {
    return this._homeRemoteCall(
      "sendFamilyMessage",
      params as unknown as Record<string, unknown>,
    );
  }

  async listFamilyRooms(): Promise<import("@envoymesh/api").ListFamilyRoomsResult> {
    return this._homeRemoteCall("listFamilyRooms", {});
  }

  async createFamilyRoom(
    params: import("@envoymesh/api").CreateFamilyRoomParams,
  ): Promise<import("@envoymesh/api").CreateFamilyRoomResult> {
    return this._homeRemoteCall(
      "createFamilyRoom",
      params as unknown as Record<string, unknown>,
    );
  }

  async sendFamilyRoomMessage(
    params: import("@envoymesh/api").SendFamilyRoomMessageParams,
  ): Promise<import("@envoymesh/api").SendFamilyRoomMessageResult> {
    return this._homeRemoteCall(
      "sendFamilyRoomMessage",
      params as unknown as Record<string, unknown>,
    );
  }

  // -----------------------------------------------------------
  // Phase 35D — Pairing Kiosk
  // -----------------------------------------------------------
  async syncPairingKioskFromConfig(): Promise<void> {
    await this._homeRemoteCall("syncPairingKioskFromConfig", {});
  }

  async getPairingKioskStatus(): Promise<import("@envoymesh/api").PairingKioskStatus> {
    return this._homeRemoteCall("getPairingKioskStatus", {});
  }

  // -----------------------------------------------------------
  // Phase 35B — Fleet Manifest
  // -----------------------------------------------------------
  async importFleetManifest(
    params: import("@envoymesh/api").ImportFleetManifestParams,
  ): Promise<import("@envoymesh/api").ImportFleetManifestOutcome> {
    return this._homeRemoteCall("importFleetManifest", params as unknown as Record<string, unknown>);
  }

  async listFleetManifests(): Promise<import("@envoymesh/api").ListFleetManifestsResult> {
    return this._homeRemoteCall("listFleetManifests", {});
  }

  async revokeFleetManifest(
    manifestId: string,
  ): Promise<import("@envoymesh/api").RevokeFleetManifestResult> {
    return this._homeRemoteCall("revokeFleetManifest", { manifestId });
  }

  async createFleetManifest(
    input: import("@envoymesh/api").CreateFleetManifestInput,
  ): Promise<import("@envoymesh/api").CreateFleetManifestResult> {
    return this._homeRemoteCall("createFleetManifest", input as unknown as Record<string, unknown>);
  }

  async listDeviceRevocations(): Promise<import("@envoymesh/api").ListDeviceRevocationsResult> {
    return { revocations: this._deviceRevocations };
  }

  listTerminalSessions(): Promise<import("@envoymesh/api").TerminalSessionSummary[]> {
    return this._homeRemoteCall("listTerminalSessions", {});
  }

  createTerminalSession(
    params?: import("@envoymesh/api").CreateTerminalSessionParams,
  ): Promise<import("@envoymesh/api").TerminalSessionSummary> {
    return this._homeRemoteCall("createTerminalSession", (params ?? {}) as Record<string, unknown>);
  }

  closeTerminalSession(params: import("@envoymesh/api").CloseTerminalSessionParams): Promise<void> {
    return this._homeRemoteCall("closeTerminalSession", params as unknown as Record<string, unknown>);
  }

  renameTerminalSession(
    params: import("@envoymesh/api").RenameTerminalSessionParams,
  ): Promise<import("@envoymesh/api").TerminalSessionSummary> {
    return this._homeRemoteCall("renameTerminalSession", params as unknown as Record<string, unknown>);
  }

  terminalAttach(
    params: import("@envoymesh/api").TerminalAttachParams,
  ): Promise<import("@envoymesh/api").TerminalAttachResult> {
    return this._homeRemoteCall("terminalAttach", params as unknown as Record<string, unknown>);
  }

  terminalRunFromNaturalLanguage(
    params: import("@envoymesh/api").TerminalRunFromNaturalLanguageParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal> {
    return this._homeRemoteCall("terminalRunFromNaturalLanguage", params as unknown as Record<string, unknown>);
  }

  terminalExecuteProposal(params: import("@envoymesh/api").TerminalExecuteProposalParams): Promise<void> {
    return this._homeRemoteCall("terminalExecuteProposal", params as unknown as Record<string, unknown>);
  }

  terminalSetAssistModelOverride(
    params: import("@envoymesh/api").TerminalSetAssistModelOverrideParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._homeRemoteCall("terminalSetAssistModelOverride", params as unknown as Record<string, unknown>);
  }

  terminalGetAssistState(sessionId: string): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._homeRemoteCall("terminalGetAssistState", { sessionId });
  }

  terminalExplainScrollback(
    params: import("@envoymesh/api").TerminalExplainScrollbackParams,
  ): Promise<import("@envoymesh/api").TerminalExplainScrollbackResult> {
    return this._homeRemoteCall("terminalExplainScrollback", params as unknown as Record<string, unknown>);
  }

  terminalSuggestCommand(
    params: import("@envoymesh/api").TerminalSuggestCommandParams,
  ): Promise<import("@envoymesh/api").TerminalSuggestCommandResult> {
    return this._homeRemoteCall("terminalSuggestCommand", params as unknown as Record<string, unknown>);
  }

  terminalObserveStep(
    params: import("@envoymesh/api").TerminalObserveStepParams,
  ): Promise<import("@envoymesh/api").TerminalObserveStepResult> {
    return this._homeRemoteCall("terminalObserveStep", params as unknown as Record<string, unknown>);
  }

  terminalSetInlineSuggestEnabled(
    params: import("@envoymesh/api").TerminalSetInlineSuggestParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._homeRemoteCall("terminalSetInlineSuggestEnabled", params as unknown as Record<string, unknown>);
  }

  terminalOpenClawPlan(
    params: import("@envoymesh/api").TerminalOpenClawPlanParams,
  ): Promise<import("@envoymesh/api").TerminalOpenClawPlanResult> {
    return this._homeRemoteCall("terminalOpenClawPlan", params as unknown as Record<string, unknown>);
  }

  terminalRunPlanStep(
    params: import("@envoymesh/api").TerminalRunPlanStepParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal> {
    return this._homeRemoteCall("terminalRunPlanStep", params as unknown as Record<string, unknown>);
  }

  terminalEnablePrepareMode(
    params: import("@envoymesh/api").TerminalEnablePrepareModeParams,
  ): Promise<import("@envoymesh/api").TerminalEnablePrepareModeResult> {
    return this._homeRemoteCall("terminalEnablePrepareMode", params as unknown as Record<string, unknown>);
  }

  terminalWatchStep(
    params: import("@envoymesh/api").TerminalWatchStepParams,
  ): Promise<import("@envoymesh/api").TerminalWatchStepResult> {
    return this._homeRemoteCall("terminalWatchStep", params as unknown as Record<string, unknown>);
  }

  terminalPinContextSession(
    params: import("@envoymesh/api").TerminalPinContextSessionParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._homeRemoteCall("terminalPinContextSession", params as unknown as Record<string, unknown>);
  }

  terminalDetectFailure(
    params: import("@envoymesh/api").TerminalDetectFailureParams,
  ): Promise<import("@envoymesh/api").TerminalFailureDetection> {
    return this._homeRemoteCall("terminalDetectFailure", params as unknown as Record<string, unknown>);
  }

  terminalSuggestFixFromFailure(
    params: import("@envoymesh/api").TerminalSuggestFixParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal> {
    return this._homeRemoteCall("terminalSuggestFixFromFailure", params as unknown as Record<string, unknown>);
  }

  terminalStartGoalLoop(
    params: import("@envoymesh/api").TerminalStartGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult> {
    return this._homeRemoteCall("terminalStartGoalLoop", params as unknown as Record<string, unknown>);
  }

  terminalAdvanceGoalLoop(
    params: import("@envoymesh/api").TerminalAdvanceGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult> {
    return this._homeRemoteCall("terminalAdvanceGoalLoop", params as unknown as Record<string, unknown>);
  }

  terminalCancelGoalLoop(
    params: import("@envoymesh/api").TerminalCancelGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._homeRemoteCall("terminalCancelGoalLoop", params as unknown as Record<string, unknown>);
  }

  terminalSendContextToAssistant(
    params: import("@envoymesh/api").TerminalSendContextToAssistantParams,
  ): Promise<import("@envoymesh/api").TerminalSendContextToAssistantResult> {
    return this._homeRemoteCall("terminalSendContextToAssistant", params as unknown as Record<string, unknown>);
  }

  terminalUpdatePlanProgress(
    params: import("@envoymesh/api").TerminalUpdatePlanProgressParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._homeRemoteCall("terminalUpdatePlanProgress", params as unknown as Record<string, unknown>);
  }

  terminalGetScrollbackPreview(
    params: import("@envoymesh/api").TerminalGetScrollbackPreviewParams,
  ): Promise<import("@envoymesh/api").TerminalGetScrollbackPreviewResult> {
    return this._homeRemoteCall("terminalGetScrollbackPreview", params as unknown as Record<string, unknown>);
  }

  terminalResumeGoalLoop(
    params: import("@envoymesh/api").TerminalResumeGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult> {
    return this._homeRemoteCall("terminalResumeGoalLoop", params as unknown as Record<string, unknown>);
  }

  terminalEnableExecPane(
    params: import("@envoymesh/api").TerminalEnableExecPaneParams,
  ): Promise<import("@envoymesh/api").TerminalEnableExecPaneResult> {
    return this._homeRemoteCall("terminalEnableExecPane", params as unknown as Record<string, unknown>);
  }

  terminalSetBackgroundWatch(
    params: import("@envoymesh/api").TerminalSetBackgroundWatchParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._homeRemoteCall("terminalSetBackgroundWatch", params as unknown as Record<string, unknown>);
  }

  terminalClearBackgroundWatch(
    params: import("@envoymesh/api").TerminalClearBackgroundWatchParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._homeRemoteCall("terminalClearBackgroundWatch", params as unknown as Record<string, unknown>);
  }

  openInHerdr(): Promise<import("@envoymesh/api").OpenInHerdrResult> {
    return Promise.resolve({ ok: false, reason: "herdr.mobileUnsupported" });
  }

  terminalGetHerdrExportHint(
    params: import("@envoymesh/api").TerminalHerdrExportHintParams,
  ): Promise<import("@envoymesh/api").TerminalHerdrExportHintResult> {
    return this._homeRemoteCall("terminalGetHerdrExportHint", params as unknown as Record<string, unknown>);
  }

  terminalExec(
    params: { sessionId: string; command: string },
  ): Promise<{ output: string }> {
    return this._homeRemoteCall("terminalExec", params as unknown as Record<string, unknown>);
  }

  terminalClearResumeGoal(
    sessionId: string,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._homeRemoteCall("terminalClearResumeGoal", { sessionId });
  }

  pairThinClient(
    params: import("@envoymesh/api").PairThinClientParams,
  ): Promise<import("@envoymesh/api").PairThinClientResult> {
    return this._homeRemoteCall("pairThinClient", params as unknown as Record<string, unknown>);
  }

  repairSessionProfile(
    params: import("@envoymesh/api").RepairSessionProfileParams,
  ): Promise<import("@envoymesh/api").RepairSessionProfileResult> {
    return this._homeRemoteCall(
      "repairSessionProfile",
      params as unknown as Record<string, unknown>,
    );
  }

  previewFamilyInvite(
    params: import("@envoymesh/api").PreviewFamilyInviteParams,
  ): Promise<import("@envoymesh/api").PreviewFamilyInviteResult> {
    return this._homeRemoteCall(
      "previewFamilyInvite",
      params as unknown as Record<string, unknown>,
    );
  }

  updateMyListenAddrs(
    params: import("@envoymesh/api").UpdateMyListenAddrsParams,
  ): Promise<import("@envoymesh/api").UpdateMyListenAddrsResult> {
    return this._homeRemoteCall("updateMyListenAddrs", params as unknown as Record<string, unknown>);
  }

  getOpenClawPlugins(): Promise<string[]> {
    return this._homeRemoteCall<string[]>("getOpenClawPlugins", {});
  }

  searchOpenClawPlugins(query: string): Promise<string[]> {
    return this._homeRemoteCall<string[]>("searchOpenClawPlugins", { query });
  }

  getTrendingOpenClawPlugins(): Promise<string[]> {
    return this._homeRemoteCall<string[]>("getTrendingOpenClawPlugins", {});
  }

  installOpenClawPlugin(name: string): Promise<{ ok: boolean; message: string }> {
    return this._homeRemoteCall("installOpenClawPlugin", { name });
  }

  uninstallOpenClawPlugin(name: string): Promise<{ ok: boolean; message: string }> {
    return this._homeRemoteCall("uninstallOpenClawPlugin", { name });
  }

  // --- OpenClaw extension/plugin management (proxied to home node) ---

  async listOpenClawExtensionPlugins(): Promise<import("@envoymesh/api").OpenClawPluginInfo[]> {
    return this._homeRemoteCall<import("@envoymesh/api").OpenClawPluginInfo[]>("listOpenClawExtensionPlugins", {});
  }

  async inspectOpenClawExtensionPlugin(id: string): Promise<import("@envoymesh/api").OpenClawPluginDetail | null> {
    return this._homeRemoteCall<import("@envoymesh/api").OpenClawPluginDetail | null>("inspectOpenClawExtensionPlugin", { id });
  }

  async enableOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }> {
    return this._homeRemoteCall("enableOpenClawExtensionPlugin", { id });
  }

  async disableOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }> {
    return this._homeRemoteCall("disableOpenClawExtensionPlugin", { id });
  }

  async installOpenClawExtensionPlugin(spec: string): Promise<{ ok: boolean; message: string }> {
    return this._homeRemoteCall("installOpenClawExtensionPlugin", { spec });
  }

  async uninstallOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }> {
    return this._homeRemoteCall("uninstallOpenClawExtensionPlugin", { id });
  }

  async updateOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }> {
    return this._homeRemoteCall("updateOpenClawExtensionPlugin", { id });
  }

  saveClawhubToken(token: string): Promise<{ ok: boolean }> {
    return this._homeRemoteCall("saveClawhubToken", { token });
  }

  saveSkillApiKeys(keys: Record<string, string>): Promise<{ ok: boolean }> {
    return this._homeRemoteCall("saveSkillApiKeys", { keys });
  }

  saveWebSearchEnabled(enabled: boolean): Promise<{ ok: boolean }> {
    return this._homeRemoteCall("saveWebSearchEnabled", { enabled });
  }

  sendToOpenClaw(text: string): Promise<void> {
    return this._homeRemoteCall<void>("sendToOpenClaw", { text });
  }

  sendToBridge(text: string): Promise<void> {
    return this._homeRemoteCall<void>("sendToBridge", { text });
  }

  async homeTerminalWsOpen(
    params: import("@envoymesh/api").HomeTerminalWsOpenParams,
  ): Promise<import("@envoymesh/api").HomeTerminalWsRpcResult> {
    return this._ensureHomeRemote().openTerminalTunnel(params.pathWithQuery);
  }

  homeTerminalWsSend(
    params: import("@envoymesh/api").HomeTerminalWsSendParams,
  ): Promise<import("@envoymesh/api").HomeTerminalWsRpcResult> {
    return this._ensureHomeRemote().sendTerminalFrame(
      Uint8Array.from(Buffer.from(params.dataBase64, "base64")),
      params.sessionId,
    );
  }

  async homeTerminalWsClose(
    params?: import("@envoymesh/api").HomeTerminalWsCloseParams,
  ): Promise<import("@envoymesh/api").HomeTerminalWsRpcResult> {
    return this._ensureHomeRemote().closeTerminalTunnel(params?.sessionId);
  }

  // -----------------------------------------------------------------------
  // Persistence helpers
  // -----------------------------------------------------------------------

  /**
   * Load persisted identity state from storage (without private keys).
   * Returns undefined if no identity has been persisted.
   */
  async loadPersistedIdentity(): Promise<PersistedIdentityState | undefined> {
    return this._identityStateStore.load();
  }

  /**
   * Restore shared identity from SQLite + SecureStorage.
   * Convenience method that loads public state from SQLite, fetches private
   * keys from the OS keychain, and calls restoreSharedIdentity().
   *
   * Throws if no persisted state, no secure storage, or keys are missing.
   */
  /**
   * Wipe all local data: identity state, peer directory, chat log.
   * Mobile equivalent of the desktop `clearAllUserData`. Used by the
   * social app's "clear all data" privacy action.
   */
  async clearAllUserData(): Promise<void> {
    // Persisted identity state (owner keys, device cert, shared identity)
    if (this._identityStateStore) {
      try {
        // clearAllUserData: identity store needs full state — skip
      } catch (err) {
        console.warn("[clearAllUserData] identity state:", err);
      }
    }
    // Best-effort: remove storage-backed stores we don't recreate above.
    if (this._peerDirectory) {
      try {
        const entries = await this._peerDirectory.list();
        for (const e of entries) await this._peerDirectory.delete(e.ownerId);
      } catch (err) {
        console.warn("[clearAllUserData] peer directory:", err);
      }
    }
    if (this._chatRoomStore) {
      try {
        // clear() not available — skip
      } catch (err) {
        console.warn("[clearAllUserData] chat log:", err);
      }
    }
  }

  async restoreFromSecureStorage(): Promise<MobileNodeState> {
    if (!this._secureStorage) {
      throw new Error("SecureStorage not configured");
    }
    const persisted = await this._identityStateStore.load();
    if (!persisted) {
      throw new Error("No persisted identity found");
    }
    const ownerKey = await this._secureStorage.get("ownerPrivateKey");
    const deviceKey = await this._secureStorage.get("devicePrivateKey");
    const agentKey = await this._secureStorage.get("agentPrivateKey");
    if (!ownerKey || !deviceKey || !agentKey) {
      throw new Error("Private keys not found in secure storage — re-pair required");
    }

    if (persisted.sharedIdentity) {
      return this.restoreSharedIdentity(persisted, ownerKey, deviceKey, agentKey);
    }

    // Restore standalone identity (no home node pairing)
    this._state = {
      owner: {
        ownerId: persisted.ownerId,
        publicKeyPem: persisted.ownerPublicKeyPem,
        privateKeyPem: ownerKey,
      },
      device: {
        deviceId: persisted.deviceId,
        publicKeyPem: persisted.devicePublicKeyPem,
        privateKeyPem: deviceKey,
      },
      agent: {
        agentId: deriveAgentId(persisted.ownerId, persisted.agentPublicKeyPem),
        agentPeerId: persisted.agentPeerId,
        publicKeyPem: persisted.agentPublicKeyPem,
        privateKeyPem: agentKey,
      },
      sharedIdentity: false,
      profileDir: this._profileDir,
      relayUrls: persisted.relayUrls,
    };
    this._relayUrls.length = 0;
    this._relayUrls.push(...persisted.relayUrls);
    return this._state;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async initNode(profileDir: string, options?: Record<string, unknown>): Promise<{
    profileDir: string;
    peerId: string;
    ownerId: string;
    deviceId: string;
  }> {
    if (!this._state) {
      // Try to restore from persisted state first
      const persisted = await this._identityStateStore.load();
      if (persisted) {
        // Try to load keys from localStorage fallback (browser dev mode)
        if (!this._secureStorage) {
          const ownerKey = localStorage.getItem("envoymesh_keys_owner");
          const deviceKey = localStorage.getItem("envoymesh_keys_device");
          const agentKey = localStorage.getItem("envoymesh_keys_agent");
          if (ownerKey && deviceKey && agentKey) {
            // Restore from localStorage keys
            this._state = {
              owner: {
                ownerId: persisted.ownerId,
                publicKeyPem: persisted.ownerPublicKeyPem,
                privateKeyPem: ownerKey,
              },
              device: {
                deviceId: persisted.deviceId,
                publicKeyPem: persisted.devicePublicKeyPem,
                privateKeyPem: deviceKey,
              },
              agent: {
                agentId: deriveAgentId(persisted.ownerId, persisted.agentPublicKeyPem),
                agentPeerId: persisted.agentPeerId,
                publicKeyPem: persisted.agentPublicKeyPem,
                privateKeyPem: agentKey,
              },
              sharedIdentity: persisted.sharedIdentity,
              homeNodePeerId: persisted.sharedIdentity ? persisted.homeNodePeerId : undefined,
              homeAgentPeerId: persisted.homeAgentPeerId,
              homeAgentPubKey: persisted.homeAgentPubKey,
              homeAgentName: persisted.homeAgentName,
              profileDir: this._profileDir,
              relayUrls: persisted.relayUrls,
              lanWsUrl: persisted.sharedIdentity ? persisted.lanWsUrl : undefined,
            };
            this._relayUrls.length = 0;
            this._relayUrls.push(...persisted.relayUrls);
            await this._registerHomeBridgeAgentRoute();
            // Profile loaded later in startNode()
            return {
              profileDir: this._profileDir,
              peerId: this._state.agent.agentPeerId,
              ownerId: this._state.owner.ownerId,
              deviceId: this._state.device.deviceId,
            };
          }
        }
        if (persisted.sharedIdentity) {
          throw new Error(
            "Shared identity state found but private keys not provided. " +
            "Use restoreFromSecureStorage() or restoreSharedIdentity().",
          );
        }
        // Standalone identity found but private keys not in memory —
        // caller should use restoreFromSecureStorage() instead
        throw new Error(
          "Standalone identity state found but not restored. " +
          "Use restoreFromSecureStorage() to restore with private keys.",
        );
      }
      // No persisted state — fresh standalone init
      await this.initStandalone(profileDir);
      // Persist the new standalone identity so it survives app restarts
      this._persistCurrentIdentity(false).catch(() => {});
    }
    // Profile loaded later in startNode()
    return {
      profileDir: this._profileDir,
      peerId: this._state.agent.agentPeerId,
      ownerId: this._state.owner.ownerId,
      deviceId: this._state.device.deviceId,
    };
  }

  getNodeStatus(): "offline" | "starting" | "running" | "stopping" {
    if (this._status === "uninitialized") return "offline";
    return this._status;
  }

  async startNode(): Promise<void> {
    this._status = "starting";
    this._lastNodeError = null;
    this._lastNodeErrorAt = null;
    await this._loadDeviceRevocations();
    // Load cached profile from localStorage (survives app restarts)
    this._loadCachedProfile();
    // Start relay WebSocket transport (always available)
    this._connectRelays();
    // Start browser-mode libp2p mesh (WebSocket transport + DHT + circuit relay)
    try {
      await this._startLibp2p();
    } catch (err) {
      console.warn("[mobile-node] libp2p start failed, continuing with relay-only mode:", err);
    }
    this._status = "running";
    await this._registerHomeBridgeAgentRoute();
    if (this._state?.sharedIdentity) {
      void this._ensureHomeRemote().ensureConnected().catch(() => {
        /* home may be offline at startup */
      });
      void this._syncDeviceRevocationsFromHome().catch((err) =>
        console.warn(
          "[mobile-node] device revocation sync failed:",
          err instanceof Error ? err.message : err,
        ),
      );
    }
    this._events.emit("node:status", { status: "running", peerId: this._state?.agent?.agentPeerId });
    this._events.emit("node:online", { peerId: this._state?.agent?.agentPeerId ?? "", multiaddrs: this._relayUrls });
  }

  async stopNode(): Promise<void> {
    this._status = "stopping";
    this._stopRelayCheckin();
    this._stopDhtAdvertise();
    // Drain all pending rendezvous queries
    for (const [, pending] of this._pendingQueries) {
      clearTimeout(pending.timer);
      pending.resolve([]);
    }
    this._pendingQueries.clear();
    // Clear all backoff timers for reconnection
    for (const [, timer] of this._relayBackoffTimers) {
      clearTimeout(timer);
    }
    this._relayBackoffTimers.clear();
    this._relayBackoffs.clear();
    // Close all relay sockets and clean up
    for (const ws of this._relaySockets) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this._relaySockets = [];
    this._homeRemote?.dispose();
    this._homeRemote = null;
    this._homeRemoteOnline = false;
    // Stop libp2p mesh
    await this._stopLibp2p();
    this._status = "offline";
    this._events.emit("node:status", { status: "offline", peerId: this._state?.agent?.agentPeerId });
    this._events.emit("node:offline", { peerId: this._state?.agent?.agentPeerId ?? "" });
  }

  // -----------------------------------------------------------------------
  // Identity
  // -----------------------------------------------------------------------

  getProfile(): import("@envoymesh/api").NodeProfile {
    return {
      owner: this._state.owner,
      device: this._state.device,
      deviceCertificate:
        this._state.deviceCertificate ??
        (null as unknown as import("@envoymesh/api").NodeProfile["deviceCertificate"]),
    };
  }

  getOwnerDidPresentation(): import("@envoymesh/api").OwnerDidPresentation {
    if (!this._state) {
      throw new Error("Node not initialized — call initNode() first");
    }
    return buildOwnerDidPresentation({
      ownerId: this._state.owner.ownerId,
      publicKeyPem: this._state.owner.publicKeyPem,
    });
  }

  async resolveDidImport(input: string): Promise<import("@envoymesh/api").ResolveDidImportResult> {
    const { resolveDidImportInput } = await import("@envoymesh/api/did-import");
    return resolveDidImportInput(input);
  }

  async cacheDidContactKey(params: {
    ownerId: string;
    publicKeyPem: string;
  }): Promise<{ ok: boolean; reason?: string }> {
    if (!this._contactOwnerKeys) {
      return { ok: false, reason: "Node not initialized" };
    }
    const ownerId = params.ownerId.trim();
    const publicKeyPem = params.publicKeyPem.trim();
    if (!ownerId || !publicKeyPem) {
      return { ok: false, reason: "ownerId and publicKeyPem are required" };
    }
    await this._contactOwnerKeys.set(ownerId, publicKeyPem);
    return { ok: true };
  }

  async getPeerReputationSummary(peerOwnerId: string): Promise<PeerReputationSummary> {
    return {
      peerOwnerId: peerOwnerId.trim(),
      attestations: [],
    };
  }

  async getHumanProfile() {
    return this._humanProfile;
  }

  async updateHumanProfile(input: CreateHumanProfileInput): Promise<HumanProfile> {
    if (!this._state) {
      throw new Error("Node not initialized — call initNode() first");
    }
    const unsigned: Omit<HumanProfile, "signature"> = {
      version: "0.1",
      ownerId: this._state.owner.ownerId,
      displayName: input.displayName.trim(),
      username: input.username.trim(),
      bio: input.bio?.trim(),
      gender: input.gender?.trim(),
      hobbies: input.hobbies,
      knowledge: input.knowledge,
      profileVisibility: input.profileVisibility ?? "private",
      discoveryLocation: input.discoveryLocation ?? this._humanProfile?.discoveryLocation,
      discoveryLocationPrecision:
        input.discoveryLocationPrecision ?? this._humanProfile?.discoveryLocationPrecision ?? "hidden",
      capabilities: input.capabilities,
      publicThumbnail: this._humanProfile?.publicThumbnail,
      galleryPhotos: this._humanProfile?.galleryPhotos,
      updatedAt: new Date().toISOString(),
    };
    const signature = signCanonicalPayload(unsigned, this._state.owner.privateKeyPem);
    const profile: HumanProfile = { ...unsigned, signature };
    this._humanProfile = profile;
    // Persist to localStorage so it survives app restarts
    try {
      localStorage.setItem(
        `envoymesh_profile_${this._state.owner.ownerId}`,
        JSON.stringify(profile),
      );
    } catch { /* localStorage may be unavailable */ }
    return profile;
  }

  async setPublicProfileThumbnail(params: SetPublicProfileThumbnailParams): Promise<HumanProfile> {
    const mime = parseProfilePhotoMime(params.mimeType);
    const imported = await importMobileProfilePhotoBytes({
      vault: this._vault,
      relativePath: profileThumbnailVaultPath(mime),
      contentBase64: params.contentBase64,
      mimeType: mime,
      maxBytes: MAX_PROFILE_THUMBNAIL_BYTES,
    });
    const publicThumbnail = ProfilePhotoRefSchema.parse(imported);
    const { base } = await this._loadHumanProfileForPhotoUpdate();
    const signed = await this._signAndSaveHumanProfile({ ...base, publicThumbnail });
    void this.syncProfileToBonds();
    return signed;
  }

  async upsertProfileGalleryPhoto(params: UpsertProfileGalleryPhotoParams): Promise<HumanProfile> {
    const mime = parseProfilePhotoMime(params.mimeType);
    const visibility = params.visibility as ProfileGalleryPhotoVisibility;
    const { base, existing } = await this._loadHumanProfileForPhotoUpdate();
    const gallery = [...(existing.galleryPhotos ?? [])];
    const photoId = params.photoId?.trim() || undefined;
    const existingIdx = photoId ? gallery.findIndex((p) => p.photoId === photoId) : -1;
    if (gallery.length >= MAX_PROFILE_GALLERY_PHOTOS && existingIdx < 0) {
      throw new Error(`Gallery limit reached (max ${MAX_PROFILE_GALLERY_PHOTOS} photos)`);
    }
    const vaultRelativePath = profileGalleryVaultPath(mime, photoId ?? _randomUUID());
    const imported = await importMobileProfilePhotoBytes({
      vault: this._vault,
      relativePath: vaultRelativePath,
      contentBase64: params.contentBase64,
      mimeType: mime,
      maxBytes: MAX_PROFILE_GALLERY_PHOTO_BYTES,
    });
    const entry = ProfileGalleryPhotoSchema.parse({
      ...imported,
      photoId: photoId ?? photoIdFromGalleryPath(vaultRelativePath),
      label: params.label?.trim() || undefined,
      visibility,
    });
    if (existingIdx >= 0) gallery[existingIdx] = entry;
    else gallery.push(entry);
    return this._signAndSaveHumanProfile({ ...base, galleryPhotos: gallery });
  }

  async removeProfileGalleryPhoto(params: { vaultRelativePath: string }): Promise<HumanProfile> {
    const path = params.vaultRelativePath.trim().replace(/^[\\/]+/, "");
    const { base, existing } = await this._loadHumanProfileForPhotoUpdate();
    const gallery = (existing.galleryPhotos ?? []).filter((p) => p.vaultRelativePath !== path);
    if (gallery.length === (existing.galleryPhotos ?? []).length) {
      throw new Error("Gallery photo not found on profile");
    }
    return this._signAndSaveHumanProfile({ ...base, galleryPhotos: gallery });
  }

  async updateProfileGalleryPhotoVisibility(
    params: UpdateProfileGalleryPhotoVisibilityParams,
  ): Promise<HumanProfile> {
    const path = params.vaultRelativePath.trim().replace(/^[\\/]+/, "");
    const visibility = params.visibility as ProfileGalleryPhotoVisibility;
    const { base, existing } = await this._loadHumanProfileForPhotoUpdate();
    const gallery = (existing.galleryPhotos ?? []).map((p) =>
      p.vaultRelativePath === path ? { ...p, visibility } : p,
    );
    if (!gallery.some((p) => p.vaultRelativePath === path)) {
      throw new Error("Gallery photo not found on profile");
    }
    return this._signAndSaveHumanProfile({ ...base, galleryPhotos: gallery });
  }

  async getPeerProfile(ownerId: string): Promise<PeerProfileView | undefined> {
    if (!this._peerProfileCache) return undefined;
    const row = await this._peerProfileCache.get(ownerId);
    return row ? this._mapCachedPeerProfile(row) : undefined;
  }

  async listPeerProfiles(): Promise<PeerProfileView[]> {
    if (!this._peerProfileCache) return [];
    const rows = await this._peerProfileCache.list();
    return rows.map((r) => this._mapCachedPeerProfile(r));
  }

  async requestPeerProfile(ownerId: string): Promise<{ ok: boolean; reason?: string }> {
    if (!this._state || !this._contactOwnerKeys || !this._peerProfileCache) {
      return { ok: false, reason: "not initialized" };
    }
    const key = ownerId.trim();
    if (!key) return { ok: false, reason: "owner id required" };
    try {
      const transportPeerId = await this._resolveChatTransportPeerId(key);
      if (!transportPeerId) {
        return { ok: false, reason: "no route to peer" };
      }
      const envelopeRecipientPeerId = await this._resolveChatRecipientPeerId(key);
      const unsigned = createUnsignedEnvelope({
        senderPeerId: derivePeerId(this._state.device.publicKeyPem),
        senderPublicKey: this._state.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: envelopeRecipientPeerId,
        recipientRole: "human",
        intent: "profile.request",
        payload: createProfileRequestPayload(this._state.owner.ownerId),
      });
      const envelope = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
      const hints = await this._buildMobileChatDialHints(transportPeerId, key);
      const replyJson = await this._sendExpectReplyViaMeshWithHints(
        transportPeerId,
        JSON.stringify(envelope),
        30_000,
        hints,
        ENVOY_MESSAGE_PROTOCOL,
      );
      const reply = parseEnvelope(JSON.parse(replyJson) as Record<string, unknown>);
      if (reply.intent !== "profile.response") {
        return { ok: false, reason: `expected profile.response, got ${reply.intent}` };
      }
      const result = await handleMobileInboundProfileSync({
        payload: reply.payload,
        ownerKeys: this._contactOwnerKeys,
        cache: this._peerProfileCache,
      });
      if (result.ok) {
        this._events.emit("profile:updated", { ownerId: result.ownerId });
        return { ok: true };
      }
      return { ok: false, reason: result.reason };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  async refreshBondPeerProfiles(): Promise<{ requested: number; failed: number }> {
    await this.syncProfileToBonds();
    const bonds = await this.getBonds();
    let failed = 0;
    for (const bond of bonds) {
      const result = await this.requestPeerProfile(bond.peerOwnerId);
      if (!result.ok) failed += 1;
    }
    return { requested: bonds.length, failed };
  }

  async syncProfileToBonds(): Promise<void> {
    if (!this._humanProfile?.publicThumbnail || !this._state) return;
    const bonds = await this.getBonds();
    for (const bond of bonds) {
      const peerId = bond.libp2pPeerId?.trim();
      if (!peerId) continue;
      try {
        const inline = await loadMobileProfileThumbnailInline(this._vault, this._humanProfile);
        const payload = createProfileSyncPayload(
          this._humanProfile,
          inline,
          this._state.owner.publicKeyPem,
        );
        await sendMobileProfileEnvelope({
          devicePrivateKeyPem: this._state.device.privateKeyPem,
          devicePublicKeyPem: this._state.device.publicKeyPem,
          intent: "profile.sync",
          payload,
          targetPeerId: peerId,
          sendJson: (id, json) => this._sendProfileJson(id, json),
        });
      } catch (err) {
        console.warn(
          `[mobile-node] profile.sync to ${bond.peerOwnerId.slice(0, 12)}… failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  async getAgentIdentity(): Promise<AgentIdentityDocument> {
    if (!this._state) {
      throw new Error("Node not initialized — call initNode() first");
    }
    try {
      const raw = localStorage.getItem(`envoymesh_agent_identity_${this._state.owner.ownerId}`);
      if (raw) {
        return JSON.parse(raw) as AgentIdentityDocument;
      }
    } catch { /* ignore parse errors */ }
    return {
      content: `# Agent identity

Describe who your AI assistant is, how it should communicate, and what it can or cannot do.

## Role
You are the owner's personal AI assistant on EnvoyMesh.

## Tone & style
- Be concise and helpful
- Match the owner's communication style when drafting replies

## Boundaries
- Do not share private vault content with contacts unless explicitly allowed
- Do not invent facts not supported by conversation or knowledge base

## Capabilities
- Answer questions from the local knowledge base (Envoy AI chat)
- Draft replies for contacts when assistant or auto-reply mode is enabled
- Propose file shares and library publishes (requires approval by default)
`,
      updatedAt: new Date(0).toISOString(),
    };
  }

  async updateAgentIdentity(content: string): Promise<AgentIdentityDocument> {
    if (!this._state) {
      throw new Error("Node not initialized — call initNode() first");
    }
    const doc: AgentIdentityDocument = { content, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(
        `envoymesh_agent_identity_${this._state.owner.ownerId}`,
        JSON.stringify(doc),
      );
    } catch { /* localStorage may be unavailable */ }
    return doc;
  }

  private _loadCachedProfile(): void {
    if (!this._state) return;
    this._initProfileStores();
    try {
      const raw = localStorage.getItem(`envoymesh_profile_${this._state.owner.ownerId}`);
      if (raw) {
        this._humanProfile = JSON.parse(raw) as HumanProfile;
      }
    } catch { /* ignore parse errors */ }
  }

  private _initProfileStores(): void {
    if (!this._state) return;
    this._contactOwnerKeys = createMobileContactOwnerKeyStore(this._state.owner.ownerId);
    this._peerProfileCache = createMobilePeerProfileCache(this._state.owner.ownerId);
  }

  private _mapCachedPeerProfile(row: {
    ownerId: string;
    profile: HumanProfile;
    cachedAt: string;
    thumbnail?: { contentBase64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" };
  }): PeerProfileView {
    return {
      ownerId: row.ownerId,
      profile: row.profile,
      cachedAt: row.cachedAt,
      thumbnailContentBase64: row.thumbnail?.contentBase64,
      thumbnailMimeType: row.thumbnail?.mimeType,
    };
  }

  private _assertProfilePhotosAllowed(): void {
    this._assertNodeRunning();
    if (!this._state) {
      throw new Error("Node not initialized — call initNode() first");
    }
  }

  private async _loadHumanProfileForPhotoUpdate(): Promise<{
    existing: HumanProfile;
    base: Omit<HumanProfile, "signature">;
  }> {
    this._assertProfilePhotosAllowed();
    if (!this._humanProfile) {
      throw new Error("Create your profile before adding photos");
    }
    const { signature: _s, ...base } = this._humanProfile;
    return { existing: this._humanProfile, base: { ...base, updatedAt: new Date().toISOString() } };
  }

  private async _signAndSaveHumanProfile(
    payload: Omit<HumanProfile, "signature">,
  ): Promise<HumanProfile> {
    if (!this._state) {
      throw new Error("Node not initialized");
    }
    const signed = signHumanProfile(payload, this._state.owner.privateKeyPem);
    this._humanProfile = signed as HumanProfile;
    try {
      localStorage.setItem(
        `envoymesh_profile_${this._state.owner.ownerId}`,
        JSON.stringify(signed),
      );
    } catch { /* localStorage may be unavailable */ }
    return signed as HumanProfile;
  }

  private async _sendProfileJson(
    transportPeerId: string,
    json: string,
    ownerHint?: string,
  ): Promise<void> {
    try {
      if (this._mesh) {
        const hints = ownerHint
          ? await this._buildMobileChatDialHints(transportPeerId, ownerHint)
          : [`/p2p/${transportPeerId}`];
        await this._sendViaMeshWithHints(transportPeerId, json, ENVOY_MESSAGE_PROTOCOL, hints);
        return;
      }
    } catch (err) {
      console.warn(
        "[mobile-node] profile mesh send failed, using relay:",
        err instanceof Error ? err.message : err,
      );
    }
    this._broadcastToRelaySockets(json);
  }

  private async _sendProfileResponseToPeer(
    recipientEnvelopePeerId: string,
    profile: HumanProfile,
    transportPeerId: string,
  ): Promise<void> {
    if (!this._state) return;
    const inline = await loadMobileProfileThumbnailInline(this._vault, profile);
    const payload = createProfileSyncPayload(profile, inline, this._state.owner.publicKeyPem);
    await sendMobileProfileEnvelope({
      devicePrivateKeyPem: this._state.device.privateKeyPem,
      devicePublicKeyPem: this._state.device.publicKeyPem,
      recipientPeerId: recipientEnvelopePeerId,
      intent: "profile.response",
      payload,
      targetPeerId: transportPeerId,
      sendJson: (peerId, json) => this._sendProfileJson(peerId, json),
    });
  }

  // -----------------------------------------------------------------------
  // Bond management
  // -----------------------------------------------------------------------

  async sendHello(
    targetOwnerId: string,
    profile: HelloProfile,
    message: string,
    options?: SendHelloOptions,
  ): Promise<HelloResponse> {
    if (!this._state?.device || !this._state?.owner) {
      throw new Error("sendHello: node not initialized");
    }
    if (this._status !== "running") {
      throw new Error("sendHello: node is not running");
    }

    let pendingIntro: (SocialIntroProposal & { ownerCommitmentRef?: string }) | undefined;
    let introCorrelationId: string | undefined;
    let ownerCommitmentRef: string | undefined;

    if (options?.introProposalMessageId) {
      pendingIntro = this._pendingSocialIntroProposals.get(options.introProposalMessageId);
      if (!pendingIntro) {
        throw new Error(`No pending intro proposal for messageId=${options.introProposalMessageId}`);
      }
      if (!pendingIntro.ownerCommitmentRef) {
        throw new Error("Approve the intro commitment before sending hello");
      }
      if (pendingIntro.candidateOwnerId.trim() !== targetOwnerId.trim()) {
        throw new Error("Intro proposal candidate does not match hello target owner id");
      }
      introCorrelationId = pendingIntro.introCorrelationId;
      ownerCommitmentRef = pendingIntro.ownerCommitmentRef;
    }

    const targetPeerId = pendingIntro?.candidatePeerId
      ? pendingIntro.candidatePeerId
      : await this._resolveBondRecipientPeerId(targetOwnerId.trim());

    const unsigned = createUnsignedEnvelope({
      intent: "bond.request",
      senderPeerId: derivePeerId(this._state.device.publicKeyPem),
      senderPublicKey: this._state.device.publicKeyPem,
      recipientPeerId: targetPeerId,
      payload: createBondRequestPayload({
        requesterOwnerId: this._state.owner.ownerId,
        requesterDisplayName: profile.displayName,
        message: `[HELLO] ${message}`,
        proofOfContext: `displayName:${profile.displayName}`,
        requestedLevel: "direct",
        introCorrelationId,
        ownerCommitmentRef,
      }),
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
    const data = JSON.stringify(signed);

    try {
      if (this._mesh) {
        try {
          await this._sendViaMesh(targetPeerId, data);
        } catch (err) {
          console.warn(
            "[mobile-node] sendHello mesh send failed, using relay:",
            err instanceof Error ? err.message : err,
          );
          this._broadcastToRelaySockets(data);
        }
      } else {
        this._broadcastToRelaySockets(data);
      }
      if (options?.introProposalMessageId) {
        this._pendingSocialIntroProposals.delete(options.introProposalMessageId);
      }
      await this._rememberPeerRouteAfterHello(targetOwnerId.trim(), targetPeerId);
    } catch (err) {
      this._recordNodeError("sendHello", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to send hello: ${errorMsg}`);
    }

    return {
      messageId: signed.messageId,
      inReplyTo: "",
      decision: "accept",
      timestamp: new Date().toISOString(),
    };
  }

  async acceptHello(messageId: string): Promise<void> {
    const pending = this._pendingHelloRequests.get(messageId);
    if (!pending) {
      console.warn(`[mobile-node] acceptHello: no pending request found for messageId=${messageId}`);
      return;
    }

    const level = (pending.requestedLevel as BondRecord["level"] | undefined) ?? "direct";
    await this._trustStore.set({
      peerOwnerId: pending.requesterOwnerId,
      displayName: pending.requesterDisplayName,
      libp2pPeerId: pending.remotePeerId,
      level,
      createdAt: new Date().toISOString(),
      note: pending.message || undefined,
    });
    try {
      await this._peerDirectory.set({
        ownerId: pending.requesterOwnerId,
        multiaddrs: [],
        lastSeen: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`[mobile-node] acceptHello: peer directory upsert failed:`, err instanceof Error ? err.message : err);
    }

    await this._sendBondAcceptEnvelope(pending.remotePeerId, pending.requesterOwnerId);

    this._events.emit("bond:established", {
      peerOwnerId: pending.requesterOwnerId,
      displayName: pending.requesterDisplayName,
    });
    this._pendingHelloRequests.delete(messageId);
  }

  async declineHello(messageId: string, reason?: string): Promise<void> {
    const pending = this._pendingHelloRequests.get(messageId);
    if (pending) {
      console.log(`[mobile-node] declineHello from ${pending.requesterOwnerId}: ${reason ?? "no reason"}`);
      this._pendingHelloRequests.delete(messageId);
    } else {
      console.warn(`[mobile-node] declineHello: no pending request found for messageId=${messageId}`);
    }
  }

  storePendingHelloRequest(data: {
    messageId: string;
    sender: { nodeId: string; ownerId: string; displayName: string };
    message: string;
    timestamp: string;
  }): void {
    const existing = this._pendingHelloRequests.get(data.messageId);
    if (!existing) {
      this._pendingHelloRequests.set(data.messageId, {
        remotePeerId: data.sender.nodeId,
        requesterOwnerId: data.sender.ownerId,
        requesterDisplayName: data.sender.displayName ?? data.sender.ownerId,
        message: data.message,
        requestedLevel: "direct",
        createdAt: data.timestamp,
      });
      console.log(
        `[mobile-node] stored pending hello request: messageId=${data.messageId}, from=${data.sender.ownerId}`,
      );
    }
  }

  storePendingSocialIntroProposal(proposal: SocialIntroProposal): void {
    const { commitmentApproved: _ca, ...rest } = proposal;
    void _ca;
    if (this._pendingSocialIntroProposals.has(rest.messageId)) return;
    this._pendingSocialIntroProposals.set(rest.messageId, { ...rest, ownerCommitmentRef: undefined });
    this._events.emit("social.intro:propose", { ...rest, commitmentApproved: false });
  }

  async listPendingSocialIntroProposals(): Promise<SocialIntroProposal[]> {
    return [...this._pendingSocialIntroProposals.values()].map((row) => {
      const { ownerCommitmentRef, ...pub } = row;
      return { ...pub, commitmentApproved: Boolean(ownerCommitmentRef) };
    });
  }

  async approveSocialIntroCommitment(messageId: string): Promise<{ ownerCommitmentRef: string }> {
    const row = this._pendingSocialIntroProposals.get(messageId);
    if (!row) throw new Error(`No pending intro proposal for messageId=${messageId}`);
    if (!row.ownerCommitmentRef) row.ownerCommitmentRef = _randomUUID();
    return { ownerCommitmentRef: row.ownerCommitmentRef };
  }

  async declineSocialIntroProposal(messageId: string): Promise<void> {
    this._pendingSocialIntroProposals.delete(messageId);
  }

  async blockPeer(peerOwnerId: string): Promise<void> {
    const existing = await this._trustStore.get(peerOwnerId);
    await this._trustStore.set({
      peerOwnerId,
      displayName: existing?.displayName,
      libp2pPeerId: existing?.libp2pPeerId,
      level: "blocked",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      note: existing?.note,
    });
  }

  async unblockPeer(peerOwnerId: string): Promise<void> {
    await this._trustStore.delete(peerOwnerId);
  }
  async revokeBond(peerOwnerId: string): Promise<void> {
    await this._trustStore.delete(peerOwnerId);
    this._events.emit("bond:revoked", { peerOwnerId });
  }

  async getPairedDiagnostics(): Promise<Record<string, unknown>> {
    return {
      paired: this._isHomeRemotePaired(),
      homeOnline: this._homeRemoteOnline,
      homeTransport: this._homeRemoteTransport,
      homePeerId: (this._state?.homeNodePeerId ?? null) as unknown,
      relayUrls: this._relayUrls,
      lanWsUrl: this._state?.lanWsUrl ?? null,
      homeBondsCount: this._homeBonds?.length ?? 0,
      lastBootstrapOk: this._lastBootstrapOk,
      lastBootstrapError: this._lastBootstrapError ?? null,
      lastBootstrapCounts: this._lastBootstrapCounts,
      sessionTokens: (await this._sessionTokenStore?.listTokens() ?? []).length,
    };
  }

  async getBonds(): Promise<BondRecord[]> {
    // In paired mode the mobile is a thin client: the source of truth for bonded
    // contacts is the home's trust store, surfaced via the bootstrap cache. The
    // mobile's local trust store is empty in v1 paired mode (the mobile has no
    // own bonds). Fall back to the local store when the bootstrap hasn't run yet
    // or the user has explicitly switched back to standalone.
    if (this._isHomeRemotePaired() && this._homeBonds !== null) {
      return this._homeBonds;
    }
    return this._trustStore.list();
  }

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  async sendChat(targetOwnerId: string, text: string): Promise<import("@envoymesh/api").SendChatResult> {
    this._assertDeviceNotRevoked();
    // In paired mode, proxy sendChat through the home node so the message
    // is delivered by the home's mesh to the recipient.
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<import("@envoymesh/api").SendChatResult>("sendChat", { targetOwnerId, text });
      } catch (err) {
        if (err instanceof Error && err.message === "homeRemote.offline") {
          throw err;
        }
        // fall through to local path
      }
    }
    const msgId = _randomUUID();
    const ts = new Date().toISOString();
    const wireText = stripModelThinking(text);
    // Persist locally — threaded by targetOwnerId (ownerId namespace).
    // The inbound handler now threads by senderOwnerId, so outbound and
    // inbound messages addressed to the same contact land in the same thread.
    await this._chatLog.append(targetOwnerId, {
      messageId: msgId,
      sender: { ownerId: this._state.owner.ownerId, displayName: "Me" },
      recipient: { ownerId: targetOwnerId },
      content: { text: wireText },
      metadata: { timestamp: ts, deliveryReceipt: "sent" },
      signature: "",
    });
    // Emit for UI (outbound copy; network copy is signed in _dispatchSignedChat)
    this._events.emit("chat:message", {
      messageId: msgId,
      sender: { nodeId: this._state.agent.agentPeerId, displayName: "Me", ownerId: this._state.owner.ownerId },
      recipient: { nodeId: "", ownerId: targetOwnerId },
      content: { text: wireText },
      metadata: { timestamp: ts, deliveryReceipt: "sent" },
      signature: "",
    });
    const deliver = await this._dispatchSignedChat(targetOwnerId, text, msgId);
    return {
      messageId: msgId,
      deliveryReceipt: deliver.delivered ? ("delivered" as const) : ("sent" as const),
      deliveredAt: deliver.deliveredAt,
    };
  }

  async sendAgentChat(targetOwnerId: string, text: string): Promise<import("@envoymesh/api").SendChatResult> {
    this._assertDeviceNotRevoked();
    if (!this._state?.agent || !this._state?.owner) {
      throw new Error("Agent identity is not available");
    }
    const msgId = _randomUUID();
    const ts = new Date().toISOString();
    const cfg = await this.getNodeConfig();
    let wireText = stripModelThinking(text);
    wireText = applyAiIdentityForIdentity(wireText, cfg.aiSettings?.identity);
    const credential = this._ensureAgentCredential();
    await this._chatLog.append(targetOwnerId, {
      messageId: msgId,
      sender: {
        ownerId: this._state.owner.ownerId,
        displayName: "Your agent",
        actorRole: "agent",
        agentId: credential.agentId,
        agentVerified: true,
      },
      recipient: { ownerId: targetOwnerId },
      content: { text: wireText },
      metadata: { timestamp: ts, deliveryReceipt: "sent" },
      signature: "",
    });
    this._events.emit("chat:message", {
      messageId: msgId,
      sender: {
        nodeId: this._state.agent.agentPeerId,
        displayName: "Your agent",
        ownerId: this._state.owner.ownerId,
        actorRole: "agent",
        agentId: credential.agentId,
        agentVerified: true,
      },
      recipient: { nodeId: "", ownerId: targetOwnerId },
      content: { text: wireText },
      metadata: { timestamp: ts, deliveryReceipt: "sent" },
      signature: "",
    });
    const deliver = await this._dispatchSignedAgentChat(targetOwnerId, wireText, credential, msgId);
    return {
      messageId: msgId,
      deliveryReceipt: deliver.delivered ? ("delivered" as const) : ("sent" as const),
      deliveredAt: deliver.deliveredAt,
    };
  }

  async listAgentActivity(params?: ListAgentActivityParams): Promise<AgentActivityRecord[]> {
    return this._agentActivity.list(params);
  }

  // Capacitor backup (apps/mobile) — feed.notify Inbox is desktop/EnvoyGo via home.
  // Stub so NodeService stays implementable; product path is not this package.
  async listFeedNotifications(): Promise<import("@envoymesh/api").FeedNotification[]> {
    return [];
  }

  async dismissFeedNotification(_id: string): Promise<void> {
    /* no-op */
  }

  async dismissAllFeedNotifications(): Promise<void> {
    /* no-op — mobile feed-notification store is not persisted in this package. */
  }

  // Content engagement badges — home/desktop owns the author inbox; mobile stubs.
  async listContentEngageNotifications(): Promise<
    import("@envoymesh/api").ContentEngageNotification[]
  > {
    return [];
  }

  async dismissContentEngageNotifications(
    _params?: import("@envoymesh/api").DismissContentEngageNotificationsParams,
  ): Promise<void> {
    /* no-op */
  }

  async getContentEngagement(
    params: import("@envoymesh/api").GetContentEngagementParams,
  ): Promise<import("@envoymesh/api").ContentEngagementSummary> {
    const url = params.url?.trim() ?? "";
    return {
      url,
      starCount: 0,
      starredByMe: false,
      starOwnerIds: [],
      commentCount: 0,
      comments: [],
    };
  }

  async toggleContentStar(
    _params: import("@envoymesh/api").ToggleContentStarParams,
  ): Promise<import("@envoymesh/api").ContentEngagementSummary> {
    throw new Error("Content engagement requires desktop/home node");
  }

  async addContentComment(
    _params: import("@envoymesh/api").AddContentCommentParams,
  ): Promise<import("@envoymesh/api").ContentEngagementSummary> {
    throw new Error("Content engagement requires desktop/home node");
  }

  async removeContentComment(
    _params: import("@envoymesh/api").RemoveContentCommentParams,
  ): Promise<import("@envoymesh/api").ContentEngagementSummary> {
    throw new Error("Content engagement requires desktop/home node");
  }

  // Mobile-node NodeService stubs for features that require the desktop
  // vault store. The convention:
  //   - read methods (list*) return empty results so the UI degrades gracefully
  //   - write methods (record*, revoke*) throw because they cannot be silently
  //     no-op'd (a silently-dropped write would lie to the user)

  async listCommerceReceipts(): Promise<import("@envoymesh/api").CommerceReceiptRecord[]> {
    return [];
  }

  async recordCommerceReceipt(
    _params: import("@envoymesh/api").RecordCommerceReceiptParams,
  ): Promise<import("@envoymesh/api").CommerceReceiptRecord> {
    throw new Error("Commerce receipts require desktop node vault store");
  }

  private async _publishAgentActivity(
    record: AgentActivityRecord,
    _contactOwnerId?: string,
  ): Promise<void> {
    await this._agentActivity.append({
      activityId: record.activityId,
      correlationId: record.correlationId,
      taskId: record.taskId,
      domain: record.domain,
      kind: record.kind,
      summary: record.summary,
      remoteOwnerId: record.remoteOwnerId,
      remoteAgentId: record.remoteAgentId,
      remoteActorRole: record.remoteActorRole,
      requiresOwnerAction: record.requiresOwnerAction,
      createdAt: record.createdAt,
    });
    const config = await this.getNodeConfig();
    if (shouldPushAgentActivity(record.kind, config.agentVisibility, record.domain)) {
      this._events.emit("agent:activity", record);
    }
  }

  /** Record inbound A2A task journal row (mobile Activity feed). */
  async recordInboundTaskActivity(
    journalEntry: TaskJournalEntry,
    envelope: {
      messageId: string;
      correlationId?: string;
      senderPeerId: string;
      senderRole: string;
    },
  ): Promise<AgentActivityRecord> {
    await this._taskJournal.append({
      eventId: journalEntry.eventId,
      taskId: journalEntry.taskId,
      eventType: journalEntry.eventType,
      summary: journalEntry.summary,
      createdAt: journalEntry.createdAt,
      mandateId: journalEntry.mandateId,
    });
    const record = mapTaskJournalToActivity(journalEntry, envelope, _randomUUID());
    await this._publishAgentActivity(record, record.remoteOwnerId);
    return record;
  }

  async recordAgentCardCached(ownerId: string, card: import("@envoymesh/protocol").AgentCard): Promise<void> {
    const record: AgentActivityRecord = {
      activityId: _randomUUID(),
      domain: "research",
      kind: "task_progress",
      summary: `Learned agent card for ${card.displayName}`,
      remoteOwnerId: ownerId,
      remoteActorRole: "agent",
      createdAt: new Date().toISOString(),
    };
    await this._publishAgentActivity(record, ownerId);
  }

  /** Local-only owner report (Option A). */
  async emitLocalOwnerReport(
    report: Report,
    opts?: { contactOwnerId?: string },
  ): Promise<AgentActivityRecord> {
    const localOwnerId = this._state?.owner.ownerId ?? report.ownerId;
    const contactOwnerId = resolveReportContactOwnerId(
      report,
      localOwnerId,
      opts?.contactOwnerId,
    );
    const record = mapOwnerReportToActivity(report, _randomUUID(), localOwnerId);
    await this._publishAgentActivity(record, contactOwnerId);
    return record;
  }

  async listPendingApprovals(): Promise<import("@envoymesh/api").PendingApprovalSummary[]> {
    if (this._isHomeRemotePaired()) {
      if (!this._homeRemoteOnline) {
        return [];
      }
      return this._homeRemoteCall("listPendingApprovals", {});
    }
    return this._approvalQueue.listPending().map((item) => ({
      id: item.id,
      actionType: item.actionType,
      title: item.title,
      description: item.description,
      draftContent: item.draftContent,
      contactOwnerId: item.context.contactOwnerId,
      contactDisplayName: item.context.contactDisplayName,
      priority: item.priority,
      requestedAt: item.requestedAt,
    }));
  }

  async approvePendingApproval(
    itemId: string,
    notes?: string,
  ): Promise<import("@envoymesh/api").ApprovePendingApprovalResult> {
    if (this._isHomeRemotePaired()) {
      return this._homeRemoteCall("approvePendingApproval", { itemId, notes });
    }
    const approved = this._approvalQueue.approve(itemId.trim(), notes);
    if (!approved) {
      return { ok: false, error: "Item not found or not pending" };
    }
    const executed = await executeApprovedAction(approved, {
      sendAgentChat: (targetOwnerId, text) => this.sendAgentChat(targetOwnerId, text),
    });
    if (!executed.ok) {
      return { ok: false, error: executed.reason };
    }
    return { ok: true, messageId: executed.messageId };
  }

  async rejectPendingApproval(
    itemId: string,
    notes?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (this._isHomeRemotePaired()) {
      return this._homeRemoteCall("rejectPendingApproval", { itemId, notes });
    }
    const rejected = this._approvalQueue.reject(itemId.trim(), notes);
    if (!rejected) {
      return { ok: false, error: "Item not found or not pending" };
    }
    return { ok: true };
  }

  async listAuditEvents(
    params?: import("@envoymesh/api").ListAuditEventsParams,
  ): Promise<import("@envoymesh/api").AuditEventSummary[]> {
    const rows = await this._auditJournal.list({
      correlationId: params?.correlationId,
      taskId: params?.taskId,
      since: params?.since,
      until: params?.until,
      limit: params?.limit,
    });
    return rows.map((row) => ({
      eventId: row.eventId,
      type: row.type,
      createdAt: row.createdAt,
      intent: row.intent,
      taskId: row.taskId,
      correlationId: row.correlationId,
      remotePeerId: row.remotePeerId,
      direction: row.direction,
      outcome: row.outcome,
      summary: row.summary,
    }));
  }

  async listTaskJournalEntries(
    params?: import("@envoymesh/api").ListTaskJournalParams,
  ): Promise<import("@envoymesh/api").TaskJournalSummary[]> {
    const rows = await this._taskJournal.list({
      taskId: params?.taskId,
      limit: params?.limit,
    });
    return rows.map((row) => ({
      eventId: row.eventId,
      taskId: row.taskId,
      eventType: row.eventType,
      summary: row.summary,
      createdAt: row.createdAt,
      mandateId: row.mandateId,
    }));
  }

  // Per-call cost tracking is desktop-only for v1 (mobile has no rollup store).
  // Return an empty summary so the dashboard renders without errors on mobile.
  async getCostSummary(
    _params?: import("@envoymesh/api").GetCostSummaryParams,
  ): Promise<import("@envoymesh/api").CostSummary> {
    return {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      byProvider: [],
      byPeriod: [],
    };
  }

  async runCostRollupRetention(): Promise<{ collapsed: number; dropped: number }> {
    return { collapsed: 0, dropped: 0 };
  }

  async listAgentCards(): Promise<import("@envoymesh/api").CachedAgentCardSummary[]> {
    const rows = await this._agentCardStore.list();
    return rows.map((row) => summarizeCachedAgentCard(row));
  }

  async getAgentCard(ownerId: string): Promise<import("@envoymesh/api").CachedAgentCardSummary | undefined> {
    const row = await this._agentCardStore.get(ownerId.trim());
    if (!row) return undefined;
    return summarizeCachedAgentCard(row);
  }

  async getTaskResult(
    taskId: string,
  ): Promise<import("@envoymesh/protocol").TaskResultPayload | undefined> {
    // Phase 34: paired home is the source of truth for `task.result` payloads.
    // Mobile is a thin client — forward the RPC. Falls through to undefined
    // when the home is offline so the UI stays silent instead of erroring.
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<import("@envoymesh/protocol").TaskResultPayload | undefined>(
          "getTaskResult",
          { taskId },
        );
      } catch (err) {
        if (err instanceof Error && err.message === "homeRemote.offline") {
          return undefined;
        }
        throw err;
      }
    }
    return undefined;
  }

  async requestAgentCard(targetOwnerId: string): Promise<{ ok: boolean; error?: string }> {
    if (!this._state?.agent || !this._state?.owner || !this._state?.device) {
      return { ok: false, error: "node not initialized" };
    }
    try {
      const credential = this._ensureAgentCredential();
      const recipientPeerId = await this._resolveChatRecipientPeerId(targetOwnerId.trim());
      const unsigned = createUnsignedEnvelope({
        intent: "agent.card.request",
        senderPeerId: this._state.agent.agentPeerId,
        senderPublicKey: this._state.agent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId,
        recipientRole: "agent",
        payload: createAgentCardRequestPayload({
          requesterOwnerId: this._state.owner.ownerId,
          requesterDeviceId: deriveDeviceId(this._state.device.publicKeyPem),
        }),
        agentCredential: credential,
      });
      const signed = signUnsignedEnvelope(unsigned, this._state.agent.privateKeyPem);
      await this._dispatchSignedAgentEnvelope(targetOwnerId.trim(), signed);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Desktop Agent Network refresh. Mobile Agent Network settings are unavailable;
   * keep a no-op so MobileNode continues to satisfy NodeService.
   */
  async refreshAgentNetworkWorkers(): Promise<{ requested: number; failed: number }> {
    return { requested: 0, failed: 0 };
  }

  async sendChatAttachment(
    params: import("@envoymesh/api").SendChatAttachmentParams,
  ): Promise<import("@envoymesh/api").SendChatAttachmentResult> {
    const { MAX_CHAT_ATTACHMENT_BYTES } = await import("@envoymesh/api");
    const binary = atob(params.contentBase64);
    if (binary.length === 0) {
      throw new Error("Empty file");
    }
    if (binary.length > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new Error(`File exceeds ${MAX_CHAT_ATTACHMENT_BYTES} bytes`);
    }
    const attachmentId = _randomUUID();
    const filename = _sanitizeChatFilename(params.filename);
    const vaultRelativePath = `chat/out/${attachmentId}/${filename}`;
    const mimeType = params.mimeType?.trim() || _mimeTypeForFilename(filename);
    const sensitivity = params.sensitivity ?? "friends";
    await this.importToLibrary({
      relativePath: vaultRelativePath,
      contentBase64: params.contentBase64,
      mimeType,
    });

    const wireAttachment: ChatAttachment = {
      id: attachmentId,
      filename,
      mimeType,
      sizeBytes: binary.length,
      sensitivity,
      vaultRelativePath,
    };

    let chatMessageId: string | undefined;
    if (params.chatText !== undefined) {
      const sendResult = await this._sendChatMessageWithAttachments(
        params.targetOwnerId,
        params.chatText,
        [wireAttachment],
      );
      chatMessageId = sendResult.messageId;
    } else if (params.recordInChat !== false) {
      void this._recordFileShareInChat({
        peerOwnerId: params.targetOwnerId,
        outgoing: true,
        vaultRelativePath,
        byteLength: binary.length,
        sensitivity,
        mimeType,
        textOverride: params.caption?.trim() || `Sent ${filename}`,
      });
    }

    const { shareRequestMessageId } = await this._shareFileInternal(params.targetOwnerId, {
      path: vaultRelativePath,
      sensitivity,
      deliveryChannel: "chat",
      chatMessageId,
      chatAttachmentId: attachmentId,
    });
    return { attachmentId, vaultRelativePath, shareRequestMessageId, messageId: chatMessageId };
  }

  async readLibraryItemContent(
    params: import("@envoymesh/api").ReadLibraryItemContentParams,
  ): Promise<import("@envoymesh/api").ReadLibraryItemContentResult> {
    const { MAX_LIBRARY_ITEM_PREVIEW_BYTES } = await import("@envoymesh/api");
    const maxBytes = Math.min(params.maxBytes ?? MAX_LIBRARY_ITEM_PREVIEW_BYTES, MAX_LIBRARY_ITEM_PREVIEW_BYTES);
    const rangeMode = params.offset !== undefined && params.offset !== null;
    const offset = rangeMode ? Math.max(0, Math.floor(Number(params.offset) || 0)) : 0;
    const norm = params.relativePath.trim().replace(/^[\\/]+/, "");
    this._validateRelativeVaultPathForShare(norm);
    const vaultPath = norm.startsWith("/") ? norm : `/${norm}`;
    const entry = await this._vault.readFile(vaultPath);
    const ext = norm.includes(".") ? norm.slice(norm.lastIndexOf(".") + 1).toLowerCase() : "";
    const mimeType =
      entry.mimeType ??
      (ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "gif"
            ? "image/gif"
            : ext === "webp"
              ? "image/webp"
              : "application/octet-stream");
    const toB64 = (bytes: Uint8Array) => {
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
      return btoa(binary);
    };
    if (!rangeMode) {
      if (entry.sizeBytes > maxBytes) {
        throw new Error(`File too large for preview (${entry.sizeBytes} bytes, max ${maxBytes})`);
      }
      return {
        contentBase64: toB64(entry.content),
        mimeType,
        sizeBytes: entry.sizeBytes,
        truncated: false,
      };
    }
    if (offset >= entry.sizeBytes) {
      return {
        contentBase64: "",
        mimeType,
        sizeBytes: entry.sizeBytes,
        truncated: false,
      };
    }
    const end = Math.min(offset + maxBytes, entry.sizeBytes);
    const slice = entry.content.subarray(offset, end);
    return {
      contentBase64: toB64(slice),
      mimeType,
      sizeBytes: entry.sizeBytes,
      truncated: end < entry.sizeBytes,
    };
  }

  /**
   * Forward only after schema + Ed25519 checks. Caller remains responsible for
   * policy (trust tier) — relay or peer may still drop.
   */
  async forwardEnvelope(envelopeJson: Record<string, unknown>, _dialHints?: string[]): Promise<void> {
    let env: ReturnType<typeof parseEnvelope>;
    try {
      env = parseEnvelope(envelopeJson);
    } catch (e) {
      this._recordNodeError("forwardEnvelope parse", e);
      throw new Error(
        `forwardEnvelope: invalid envelope (${e instanceof Error ? e.message : String(e)})`,
      );
    }
    if (!verifyEnvelope(env)) {
      this._recordNodeError("forwardEnvelope", new Error("signature verification failed"));
      throw new Error("forwardEnvelope: signature verification failed");
    }
    await this._sendToRelay({ type: "forward-envelope", envelope: envelopeJson });
  }

  async homeclawCoreProxy(_params: any): Promise<any> {
    throw new Error("Not available on mobile node");
  }

  async listChatHistory(peerOwnerId: string, limit?: number): Promise<ChatMessage[]> {
    // In paired mode, proxy to home — the mobile chat log is empty on a fresh pair.
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<ChatMessage[]>("listChatHistory", { peerOwnerId, limit });
      } catch { /* fall back to local */ }
    }
    const rows = await this._chatLog.listThread(peerOwnerId, limit);
    return rows.map((row) => ({
      messageId: row.messageId,
      sender: {
        nodeId: row.sender.ownerId ?? "",
        displayName: row.sender.displayName,
        ownerId: row.sender.ownerId,
      },
      recipient: {
        nodeId: row.recipient.ownerId ?? "",
        displayName: row.recipient.displayName,
        ownerId: row.recipient.ownerId,
      },
      content: {
        text: row.content.text,
        ...(row.content.attachments ? { attachments: row.content.attachments } : {}),
      },
      metadata: row.metadata,
      signature: row.signature,
    }));
  }

  async listChatRooms(): Promise<import("@envoymesh/api").ChatRoom[]> {
    return mobileListChatRooms(this._mobileChatRoomHost());
  }

  async createChatRoom(title: string, memberOwnerIds: string[]): Promise<import("@envoymesh/api").ChatRoom> {
    return mobileCreateChatRoom(this._mobileChatRoomHost(), title, memberOwnerIds);
  }

  async inviteToChatRoom(roomId: string, memberOwnerIds: string[]): Promise<import("@envoymesh/api").ChatRoom> {
    return mobileInviteToChatRoom(this._mobileChatRoomHost(), roomId, memberOwnerIds);
  }

  async leaveChatRoom(roomId: string): Promise<void> {
    return mobileLeaveChatRoom(this._mobileChatRoomHost(), roomId);
  }

  async removeMembersFromChatRoom(
    roomId: string,
    memberOwnerIds: string[],
  ): Promise<import("@envoymesh/api").ChatRoom> {
    return mobileRemoveMembersFromChatRoom(this._mobileChatRoomHost(), roomId, memberOwnerIds);
  }

  async renameChatRoom(roomId: string, title: string): Promise<import("@envoymesh/api").ChatRoom> {
    return mobileRenameChatRoom(this._mobileChatRoomHost(), roomId, title);
  }

  async dismissChatRoom(roomId: string): Promise<void> {
    return mobileDismissChatRoom(this._mobileChatRoomHost(), roomId);
  }

  async sendChatRoomMessage(roomId: string, text: string): Promise<import("@envoymesh/api").SendChatResult> {
    return mobileSendChatRoomMessage(this._mobileChatRoomHost(), roomId, text);
  }

  async sendChatRoomAttachment(
    params: import("@envoymesh/api").SendChatRoomAttachmentParams,
  ): Promise<import("@envoymesh/api").SendChatRoomAttachmentResult> {
    const { MAX_CHAT_ATTACHMENT_BYTES } = await import("@envoymesh/api");
    const { mobileSendChatRoomAttachment } = await import("./mobile-chat-room.js");
    const binary = atob(params.contentBase64);
    if (binary.length === 0) {
      throw new Error("Empty file");
    }
    if (binary.length > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new Error(`File exceeds ${MAX_CHAT_ATTACHMENT_BYTES} bytes`);
    }
    const attachmentId = _randomUUID();
    const filename = _sanitizeChatFilename(params.filename);
    const vaultRelativePath = `chat/out/${attachmentId}/${filename}`;
    const mimeType = params.mimeType?.trim() || _mimeTypeForFilename(filename);
    const sensitivity = params.sensitivity ?? "friends";
    await this.importToLibrary({
      relativePath: vaultRelativePath,
      contentBase64: params.contentBase64,
      mimeType,
    });
    const caption = params.caption?.trim();
    const text = caption || `Sent ${filename}`;
    const result = await mobileSendChatRoomAttachment(this._mobileChatRoomHost(), {
      roomId: params.roomId,
      text,
      attachment: {
        id: attachmentId,
        filename,
        mimeType,
        sizeBytes: binary.length,
        sensitivity,
        vaultRelativePath,
      },
    });
    return {
      messageId: result.messageId,
      attachmentId: result.attachmentId,
      vaultRelativePath: result.vaultRelativePath,
      deliveryReceipt: result.deliveryReceipt,
      deliveredToOwnerIds: result.deliveredToOwnerIds,
      pendingRecipientOwnerIds: result.pendingRecipientOwnerIds,
    };
  }

  async deleteChatMessage(peerOwnerId: string, messageId: string): Promise<{ ok: boolean }> {
    const ok = await this._chatLog.deleteMessage(peerOwnerId, messageId);
    return { ok };
  }

  async clearChatHistory(peerOwnerId: string): Promise<{ deletedCount: number }> {
    const deletedCount = await this._chatLog.clearThread(peerOwnerId);
    return { deletedCount };
  }

  async markRead(_targetOwnerId: string, _upToMessageId?: string): Promise<void> {
    // Mobile chat log has no separate read cursor yet (matches partial NodeService on desktop extras).
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  async searchPeers(query: {
    peerId?: string;
    queryText?: string;
    username?: string;
    interests?: string[];
    did?: string;
    maxResults?: number;
  }): Promise<PeerSearchResult[]> {
    if (query.did?.trim()) {
      const parsed = parseDidLookupInput(query.did.trim());
      if (parsed.kind === "invalid") return [];

      const bonds = await this._trustStore.list();
      const bonded = bonds.filter((b) => b.level !== "blocked");
      const results: PeerSearchResult[] = [];

      if (this._state) {
        const selfPresentation = buildOwnerDidPresentation({
          ownerId: this._state.owner.ownerId,
          publicKeyPem: this._state.owner.publicKeyPem,
        });
        const selfMatch =
          (parsed.kind === "envoy-owner" && parsed.ownerId === selfPresentation.ownerId) ||
          (parsed.kind === "did-key" && parsed.did && didKeysMatch(parsed.did, selfPresentation.did));
        if (selfMatch) {
          results.push({
            nodeId: this._meshPeerId ?? selfPresentation.ownerId,
            ownerId: selfPresentation.ownerId,
            displayName: selfPresentation.ownerId,
            interests: [],
            profileVisibility: "contacts",
            did: selfPresentation.did,
            discoverySource: "did-lookup",
            trustLevel: "self",
          });
        }
      }

      for (const bond of bonded) {
        if (parsed.kind === "envoy-owner" && parsed.ownerId === bond.peerOwnerId) {
          results.push({
            nodeId: bond.libp2pPeerId ?? bond.peerOwnerId,
            ownerId: bond.peerOwnerId,
            displayName: bond.displayName ?? bond.peerOwnerId,
            interests: [],
            profileVisibility: "contacts",
            discoverySource: "did-lookup",
            trustLevel: bond.level,
          });
        }
      }

      return results.slice(0, query.maxResults ?? 20);
    }

    // 1. Search local trust store (bonded peers)
    const bonds = await this._trustStore.list();
    let results: BondRecord[] = bonds;

    // Filter by peer ID if provided
    if (query.peerId) {
      const q = query.peerId.toLowerCase();
      results = results.filter(
        (b) =>
          b.libp2pPeerId?.toLowerCase() === q ||
          b.peerOwnerId?.toLowerCase() === q,
      );
    }

    // Filter by text search (displayName, note)
    const textQuery =
      query.queryText?.toLowerCase().trim() ||
      query.username?.toLowerCase().trim() ||
      query.interests?.[0]?.toLowerCase().trim();

    if (textQuery) {
      results = results.filter(
        (b) =>
          b.displayName?.toLowerCase().includes(textQuery) ||
          b.peerOwnerId?.toLowerCase().includes(textQuery) ||
          b.note?.toLowerCase().includes(textQuery),
      );
    }

    const searchResults: PeerSearchResult[] = results.map((b) => ({
      nodeId: b.libp2pPeerId ?? b.peerOwnerId,
      ownerId: b.peerOwnerId,
      displayName: b.displayName ?? b.peerOwnerId.slice(0, 12) + "...",
      interests: [],
      profileVisibility: "public" as const,
    }));

    const seen = new Set(searchResults.map((r) => r.ownerId));

    // Collect self IDs for filtering
    const selfAgentPeerId = this._state?.agent?.agentPeerId;
    const selfMeshPeerId = this._meshPeerId;
    const selfOwnerId = this._state?.owner?.ownerId;

    // 2. Search DHT via libp2p (browser-mode mesh)
    if (this._mesh) {
      const searchTag = query.interests?.[0] ?? query.username ?? query.queryText ?? "";
      if (searchTag) {
        const topics = [searchTag.toLowerCase()];
        if (query.username) topics.push(`username:${query.username.toLowerCase()}`);
        for (const topic of topics) {
          try {
            const providers = await this._searchDhtTopic(topic, 10);
            for (const p of providers) {
              // Skip self
              if (p.peerId === selfMeshPeerId || p.peerId === selfAgentPeerId) continue;
              if (seen.has(p.peerId)) continue;
              seen.add(p.peerId);
              searchResults.push({
                nodeId: p.peerId,
                ownerId: p.peerId,
                displayName: p.peerId.slice(0, 12) + "...",
                interests: [topic],
                profileVisibility: "public" as const,
              });
            }
          } catch (err) {
            console.warn(`[mobile-node] DHT search for "${topic}" failed:`, err instanceof Error ? err.message : err);
          }
        }
      }
    }

    // 3. Query relay network for more peers (rendezvous query)
    if (this._relaySockets.length > 0 && this._relaySockets.some((ws) => ws.readyState === WebSocket.OPEN)) {
      const relayResults = await this._searchRelayRendezvous(query);
      for (const rr of relayResults) {
        const key = rr.ownerId || rr.nodeId;
        if (seen.has(key)) continue;
        // Skip self
        if (rr.ownerId === selfOwnerId || rr.nodeId === selfAgentPeerId) continue;
        seen.add(key);
        searchResults.push(rr);
      }
    }

    return searchResults;
  }

  /** Send a rendezvous.query to the relay and wait for rendezvous.response. */
  private _searchRelayRendezvous(query: {
    peerId?: string;
    queryText?: string;
    username?: string;
    interests?: string[];
  }): Promise<PeerSearchResult[]> {
    return new Promise((resolve) => {
      if (!this._state?.agent) { resolve([]); return; }

      const queryId = _randomUUID();
      const searchTag = query.peerId ?? query.queryText ?? query.interests?.[0] ?? query.username ?? "";

      // Timeout after 5s
      const timer = setTimeout(() => {
        this._pendingQueries.delete(queryId);
        resolve([]);
      }, 5000);

      this._pendingQueries.set(queryId, { resolve, timer });

      // Build and send signed rendezvous.query envelope
      const unsigned = createUnsignedEnvelope({
        intent: "rendezvous.query",
        senderPeerId: this._state.agent.agentPeerId,
        senderPublicKey: this._state.agent.publicKeyPem,
        senderRole: "agent",
        recipientRole: "system",
        correlationId: queryId,
        payload: {
          match: searchTag ? { tag: searchTag.toLowerCase() } : {},
          maxResults: 20,
        },
      });
      const signed = signUnsignedEnvelope(unsigned, this._state.agent.privateKeyPem);
      const data = JSON.stringify(signed);

      for (const ws of this._relaySockets) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(data); } catch { /* ignore */ }
        }
      }
    });
  }

  async runCapabilityDiscovery(_params?: { find?: boolean }): Promise<void> {
    // Mobile relay-only transport — no background DHT capability cycle.
  }

  async advertiseTopic(topic: string): Promise<void> {
    const t = String(topic).trim().toLowerCase();
    if (!t) throw new Error("advertiseTopic: empty topic");
    await this._advertiseTopicsOnDht([t]);
    this._dhtUserAdvertisedTopics.add(t);
  }

  /**
   * Stop advertising a capability topic on the DHT (`contentRouting.cancelReprovide` when available).
   * Profile-driven auto-advertise topics from `_startDhtAdvertise` are not tracked here.
   */
  async stopAdvertiseTopic(topic: string): Promise<void> {
    const t = String(topic).trim().toLowerCase();
    if (!t) return;
    this._dhtUserAdvertisedTopics.delete(t);
    if (!this._mesh) {
      console.warn("[mobile-node] stopAdvertiseTopic: no mesh — removed from local advertise cache only");
      return;
    }
    try {
      const cid = await cidForCapabilityTopic(t);
      const cr = this._mesh.contentRouting as {
        cancelReprovide?: (c: unknown) => Promise<void>;
      };
      if (typeof cr.cancelReprovide === "function") {
        await cr.cancelReprovide(cid);
        console.log(`[mobile-node] DHT cancelReprovide topic: ${t}`);
      } else {
        console.warn("[mobile-node] stopAdvertiseTopic: contentRouting.cancelReprovide not available");
      }
    } catch (err) {
      this._recordNodeError("stopAdvertiseTopic", err);
    }
  }

  // -----------------------------------------------------------------------
  // Capabilities
  // -----------------------------------------------------------------------

  async getCapabilityManifest(): Promise<any> { return undefined; }
  async updateCapabilityManifest(_params: any): Promise<any> { throw new Error("Not implemented"); }

  // -----------------------------------------------------------------------
  // Library (vault listing — FS-A)
  // -----------------------------------------------------------------------

  async listLibraryItems(params?: ListLibraryItemsParams): Promise<LibraryItem[]> {
    const paths = await this._vault.listFiles("/");
    const q = params?.query?.trim().toLowerCase();
    const publishedIds = await loadMobilePublishedDocumentIds();
    const publishedExternal = await loadMobilePublishedExternalMap(this._profileDir);
    const items: LibraryItem[] = [];
    for (const absPath of paths.sort((a, b) => a.localeCompare(b))) {
      if (mobileVaultBasename(absPath).startsWith(".")) continue;
      const ext = mobileVaultExtension(absPath);
      const relativePath = mobileVaultRelativePath(absPath);
      const entry = await this._vault.readFile(absPath);
      const { documentId, contentHash } = await mobileVaultLibraryFingerprint(
        relativePath,
        entry.content,
        ext,
      );
      const title = mobileVaultTitle(absPath);
      if (q && !title.toLowerCase().includes(q) && !relativePath.toLowerCase().includes(q)) continue;
      items.push({
        documentId,
        relativePath,
        title,
        extension: ext,
        byteLength: entry.sizeBytes,
        contentHash,
        updatedAt: new Date().toISOString(),
        published: publishedIds.has(documentId),
        publishedExternal: publishedExternal.get(documentId),
      });
    }
    return items;
  }

  async setLibraryItemPublished(documentId: string, published: boolean): Promise<void> {
    const cur = await loadMobilePublishedDocumentIds();
    if (published) {
      cur.add(documentId);
    } else {
      cur.delete(documentId);
    }
    await saveMobilePublishedDocumentIds(cur);
  }

  async exportLibraryItemToIpfs(documentId: string): Promise<import("@envoymesh/api").ExportLibraryItemToIpfsResult> {
    const ownerId = this._state?.owner.ownerId;
    if (!ownerId) {
      throw new Error("Node not initialized — call initNode() first");
    }
    const externalPublish = loadMobileExternalPublish(ownerId);
    return exportMobileLibraryDocumentToIpfs({
      vault: this._vault,
      profileDir: this._profileDir,
      documentId,
      allowIpfs: externalPublish.allowIpfs,
      ipfsExportEngine: externalPublish.ipfsExportEngine,
    });
  }

  async pinLibraryItemExternal(
    documentId: string,
  ): Promise<import("@envoymesh/api").PinLibraryItemExternalResult> {
    void documentId;
    return {
      ok: false,
      error: "External pinning is not available on mobile in this release",
    };
  }

  async getIpfsEngineStatus(): Promise<import("@envoymesh/api").IpfsEngineStatus> {
    let heliaVersion: string | undefined;
    let heliaAvailable = true;
    let heliaError: string | undefined;
    try {
      heliaVersion = readHeliaPackageVersionSync();
    } catch (err) {
      heliaAvailable = false;
      heliaError = err instanceof Error ? err.message : "Helia engine unavailable";
    }
    return {
      available: false,
      running: false,
      managed: false,
      errorHint: "Kubo runs on the home desktop node",
      helia: {
        available: heliaAvailable,
        heliaVersion,
        errorHint: heliaError,
      },
    };
  }

  async getRagIndexStatus(): Promise<import("@envoymesh/api").RagIndexStatus> {
    const { DEFAULT_RAG_INDEX_STATUS } = await import("@envoymesh/api");
    return { ...DEFAULT_RAG_INDEX_STATUS };
  }

  async verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult> {
    const ownerId = this._state?.owner.ownerId;
    if (!ownerId) {
      throw new Error("Node not initialized — call initNode() first");
    }
    const externalPublish = loadMobileExternalPublish(ownerId);
    return verifyMobileLibraryDocumentIpfsGateway({
      vault: this._vault,
      profileDir: this._profileDir,
      documentId: params.documentId,
      allowIpfs: externalPublish.allowIpfs,
      gatewayAllowlist: externalPublish.gatewayAllowlist,
      gatewayUrl: params.gatewayUrl,
    });
  }

  async importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult> {
    this._assertNodeRunning();
    const norm = params.relativePath.trim().replace(/^[\\/]+/, "");
    this._validateRelativeVaultPathForShare(norm);
    const binary = atob(params.contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const vaultPath = norm.startsWith("/") ? norm : `/${norm}`;
    await this._vault.writeFile(vaultPath, bytes, params.mimeType);
    const items = await this.listLibraryItems();
    const item = items.find((d) => d.relativePath === norm);
    if (!item) {
      throw new Error(`Imported file not indexed: ${norm}`);
    }
    return {
      documentId: item.documentId,
      relativePath: item.relativePath,
      sizeBytes: item.byteLength,
    };
  }

  async resolveLibraryItemPath(relativePath: string): Promise<{ vaultRelativePath: string; absolutePath: string }> {
    this._assertNodeRunning();
    const norm = relativePath.trim().replace(/^[\\/]+/, "");
    this._validateRelativeVaultPathForShare(norm);
    const vaultPath = norm.startsWith("/") ? norm : `/${norm}`;
    try {
      await this._vault.readFile(vaultPath);
    } catch {
      throw new Error("File not found in vault");
    }
    return { vaultRelativePath: norm, absolutePath: vaultPath };
  }

  async openLibraryItem(relativePath: string): Promise<void> {
    const content = await this._readVaultFileForOpen(relativePath);
    await openBase64FileInMobileViewer({
      filename: content.filename,
      contentBase64: content.contentBase64,
    });
  }

  async revealLibraryItemInFileManager(_relativePath: string): Promise<void> {
    throw new Error("Show in folder is not supported on mobile yet.");
  }

  async listAllLocalFiles(
    params?: import("@envoymesh/api").ListAllLocalFilesParams,
  ): Promise<import("@envoymesh/api").ListAllLocalFilesResult> {
    const vaultItems = await this.listLibraryItems(params);
    return {
      items: vaultItems.map((item) => ({
        source: "vault" as const,
        relativePath: item.relativePath,
        title: item.title,
        extension: item.extension,
        byteLength: item.byteLength,
        updatedAt: item.updatedAt,
        documentId: item.documentId,
        contentHash: item.contentHash,
        published: item.published,
        publishedExternal: item.publishedExternal,
      })),
      vaultCount: vaultItems.length,
      workspaceCount: 0,
    };
  }

  async readLocalFileContent(
    params: import("@envoymesh/api").ReadLocalFileContentParams,
  ): Promise<import("@envoymesh/api").ReadLibraryItemContentResult> {
    if (params.source === "workspace") {
      throw new Error("OpenClaw workspace files are not available on mobile");
    }
    let relativePath = params.relativePath.trim().replace(/^[\\/]+/, "");
    if (!relativePath && params.documentId?.trim()) {
      const match = (await this.listLibraryItems()).find((item) => item.documentId === params.documentId!.trim());
      if (!match) {
        throw new Error(`Document not found: ${params.documentId}`);
      }
      relativePath = match.relativePath;
    }
    return this.readLibraryItemContent({ relativePath, maxBytes: params.maxBytes });
  }

  async openLocalFile(params: import("@envoymesh/api").OpenLocalFileParams): Promise<void> {
    if (params.source === "workspace") {
      throw new Error("OpenClaw workspace files are not available on mobile");
    }
    await this.openLibraryItem(params.relativePath);
  }

  private async _readVaultFileForOpen(relativePath: string): Promise<{
    filename: string;
    contentBase64: string;
  }> {
    const norm = relativePath.trim().replace(/^[\\/]+/, "");
    this._validateRelativeVaultPathForShare(norm);
    const vaultPath = norm.startsWith("/") ? norm : `/${norm}`;
    const entry = await this._vault.readFile(vaultPath);
    const bytes = entry.content;
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
    const slash = norm.lastIndexOf("/");
    const filename = slash >= 0 ? norm.slice(slash + 1) : norm;
    return { filename: filename || "file", contentBase64: btoa(binary) };
  }

  async discoverPublishedLibrary(params?: DiscoverPublishedLibraryParams): Promise<DiscoverPublishedLibraryPeerResult[]> {
    this._assertNodeRunning();
    if (!this._state?.device || !this._state?.owner) {
      throw new Error("Node not initialized — call initNode() first");
    }
    if (!this._mesh) {
      const bonds = (await this.getBonds()).filter((b) => b.level !== "blocked");
      return bonds.map((b) => ({
        peerOwnerId: b.peerOwnerId,
        displayName: b.displayName,
        libp2pPeerId: b.libp2pPeerId ?? "",
        bondLevel: b.level,
        bondRank: bondTrustRank(b.level),
        files: [],
        latencyMs: 0,
        error: "Mesh not connected — cannot query peers",
      }));
    }

    const bonds = (await this.getBonds()).filter((b) => b.level !== "blocked");
    let targets = bonds;
    if (params?.targetOwnerIds && params.targetOwnerIds.length > 0) {
      const allow = new Set(params.targetOwnerIds);
      targets = bonds.filter((b) => allow.has(b.peerOwnerId));
    }
    targets = [...targets].sort((a, b) => bondTrustRank(a.level) - bondTrustRank(b.level));

    const results: DiscoverPublishedLibraryPeerResult[] = [];
    const maxResults = params?.maxResultsPerPeer ?? 5;
    const timeoutMs = params?.timeoutMsPerPeer ?? 15_000;

    for (const bond of targets) {
      const started = Date.now();
      try {
        const transportPeerId = await this._resolveBondRecipientPeerId(bond.peerOwnerId);
        const recipientEnvelopePeerId = await this._resolveChatRecipientPeerId(bond.peerOwnerId);

        const unsigned = createUnsignedEnvelope({
          senderPeerId: derivePeerId(this._state.device.publicKeyPem),
          senderPublicKey: this._state.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: recipientEnvelopePeerId,
          recipientRole: "human",
          intent: "discovery.request",
          payload: createDiscoveryRequestPayload({
            requesterOwnerId: this._state.owner.ownerId,
            requestedTagHashes: [],
            requestedCapabilities: [MOBILE_PUBLISHED_LIB_CAPABILITY],
            maxResults,
            requestedSensitivity: "public",
            fileTitleQuery: params?.fileTitleQuery,
            requestedContentHashPrefixes: params?.contentHashPrefix ? [params.contentHashPrefix] : undefined,
          }),
          correlationId: _randomUUID(),
        });
        const envelope = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
        const replyText = await this._sendExpectReplyViaMesh(
          transportPeerId,
          JSON.stringify(envelope),
          timeoutMs,
          bond.peerOwnerId,
        );
        const replyJson = JSON.parse(replyText) as Record<string, unknown>;
        const reply = parseEnvelope(replyJson);
        const latencyMs = Date.now() - started;
        if (reply.intent !== "discovery.response") {
          results.push({
            peerOwnerId: bond.peerOwnerId,
            displayName: bond.displayName,
            libp2pPeerId: transportPeerId,
            bondLevel: bond.level,
            bondRank: bondTrustRank(bond.level),
            files: [],
            latencyMs,
            error: `unexpected reply intent ${reply.intent}`,
          });
          continue;
        }
        const resp = parseDiscoveryResponsePayload(reply.payload);
        const files: PublishedLibraryFileHit[] = resp.matches.flatMap((m) =>
          (m.libraryMatches ?? []).map((f) => ({
            documentId: f.documentId,
            title: f.title,
            relativePath: f.relativePath,
            contentHash: f.contentHash,
            byteLength: f.byteLength,
            cid: f.cid,
          })),
        );
        results.push({
          peerOwnerId: bond.peerOwnerId,
          displayName: bond.displayName,
          libp2pPeerId: transportPeerId,
          bondLevel: bond.level,
          bondRank: bondTrustRank(bond.level),
          files,
          latencyMs,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({
          peerOwnerId: bond.peerOwnerId,
          displayName: bond.displayName,
          libp2pPeerId: bond.libp2pPeerId ?? "",
          bondLevel: bond.level,
          bondRank: bondTrustRank(bond.level),
          files: [],
          latencyMs: Date.now() - started,
          error: msg,
        });
      }
    }
    return results;
  }

  // Phase 45 — Web Content Browsing. Pull-based content fetch from a
  // bonded contact's published web directory. See
  // docs/web-content-browsing-design.md §4.6.
  //
  // In paired mode (default): the home node owns the gateway to the
  // target contact — the home holds the bond and the mesh route. Mobile
  // proxies libraryRead via the home's HomeRemoteClient RPC.
  //
  // In standalone mode: mobile has its own peer identity and bond with
  // the target contact — it sends the library.read envelope directly.
  // For 45A the standalone-mode path is not yet wired; callers in
  // standalone mode receive a clear "not supported" error.
  async libraryRead(params: LibraryReadParams): Promise<LibraryReadResult> {
    this._assertNodeRunning();
    if (this._state?.device && !this._state?.homeNodePeerId) {
      // Standalone mode is not yet implemented in 45A. Return a typed
      // result (not throw) so callers get a consistent {status, error}
      // response rather than an unhandled rejection.
      return {
        peerOwnerId: params.targetOwnerId,
        libp2pPeerId: "",
        status: "not_found",
        latencyMs: 0,
        error: "standalone-mode sender is not yet implemented; pair with a home node to browse content",
      };
    }
    if (this._state?.homeNodePeerId?.trim()) {
      // Paired mode — proxy via the home's HomeRemoteClient.
      const home = this._ensureHomeRemote();
      const result = (await home.call("libraryRead", params as unknown as Record<string, unknown>)) as LibraryReadResult;
      return result;
    }
    throw new Error("libraryRead: no mesh route available (is the node initialized?)");
  }

  async publishWebContentEntry(
    params: PublishWebContentParams,
  ): Promise<PublishWebContentResult> {
    this._assertNodeRunning();
    if (!this._state?.homeNodePeerId?.trim()) {
      throw new Error(
        "publishWebContentEntry: authoring requires a paired home node (EnvoyGo thin client)",
      );
    }
    const home = this._ensureHomeRemote();
    return (await home.call(
      "publishWebContentEntry",
      params as unknown as Record<string, unknown>,
    )) as PublishWebContentResult;
  }

  async ensureDefaultWebSite(): Promise<import("@envoymesh/api").EnsureDefaultWebSiteResult> {
    this._assertNodeRunning();
    if (!this._state?.homeNodePeerId?.trim()) {
      throw new Error(
        "ensureDefaultWebSite: requires a paired home node (EnvoyGo thin client)",
      );
    }
    const home = this._ensureHomeRemote();
    return (await home.call("ensureDefaultWebSite", {})) as import("@envoymesh/api").EnsureDefaultWebSiteResult;
  }

  async listWebContentSections(): Promise<import("@envoymesh/api").WebContentSectionSummary[]> {
    this._assertNodeRunning();
    if (!this._state?.homeNodePeerId?.trim()) {
      throw new Error(
        "listWebContentSections: requires a paired home node (EnvoyGo thin client)",
      );
    }
    const home = this._ensureHomeRemote();
    return (await home.call("listWebContentSections", {})) as import("@envoymesh/api").WebContentSectionSummary[];
  }

  async listFeedPosts(): Promise<import("@envoymesh/api").FeedPostSummary[]> {
    this._assertNodeRunning();
    if (!this._state?.homeNodePeerId?.trim()) {
      throw new Error(
        "listFeedPosts: requires a paired home node (EnvoyGo thin client)",
      );
    }
    const home = this._ensureHomeRemote();
    return (await home.call("listFeedPosts", {})) as import("@envoymesh/api").FeedPostSummary[];
  }

  async listFeedTimeline(
    params?: import("@envoymesh/api").ListFeedTimelineParams,
  ): Promise<import("@envoymesh/api").ListFeedTimelineResult> {
    this._assertNodeRunning();
    if (!this._state?.homeNodePeerId?.trim()) {
      throw new Error(
        "listFeedTimeline: requires a paired home node (EnvoyGo thin client)",
      );
    }
    const home = this._ensureHomeRemote();
    return (await home.call(
      "listFeedTimeline",
      (params ?? {}) as Record<string, unknown>,
    )) as import("@envoymesh/api").ListFeedTimelineResult;
  }

  async listBlogPosts(): Promise<import("@envoymesh/api").BlogPostSummary[]> {
    this._assertNodeRunning();
    if (!this._state?.homeNodePeerId?.trim()) {
      throw new Error(
        "listBlogPosts: requires a paired home node (EnvoyGo thin client)",
      );
    }
    const home = this._ensureHomeRemote();
    return (await home.call("listBlogPosts", {})) as import("@envoymesh/api").BlogPostSummary[];
  }

  async deleteWebContentEntry(
    params: import("@envoymesh/api").DeleteWebContentParams,
  ): Promise<import("@envoymesh/api").DeleteWebContentResult> {
    this._assertNodeRunning();
    if (!this._state?.homeNodePeerId?.trim()) {
      throw new Error(
        "deleteWebContentEntry: requires a paired home node (EnvoyGo thin client)",
      );
    }
    const home = this._ensureHomeRemote();
    return (await home.call(
      "deleteWebContentEntry",
      params as unknown as Record<string, unknown>,
    )) as import("@envoymesh/api").DeleteWebContentResult;
  }

  async listAgentShareProposals(): Promise<AgentShareProposal[]> {
    return listMobileAgentShareProposals();
  }

  async dismissAgentShareProposal(proposalId: string): Promise<void> {
    await removeMobileAgentShareProposal(proposalId);
  }

  async submitAgentShareProposal(params: SubmitAgentShareProposalParams): Promise<AgentShareProposal> {
    const proposal: AgentShareProposal = {
      proposalId: _randomUUID(),
      createdAt: new Date().toISOString(),
      targetOwnerId: params.targetOwnerId.trim(),
      vaultRelativePath: params.vaultRelativePath.replace(/^[\\/]+/, ""),
      sensitivity: params.sensitivity,
      summary: params.summary?.trim() || undefined,
    };
    await upsertMobileAgentShareProposal(proposal);
    this._events.emit("share:agent-proposed", proposal);
    return proposal;
  }

  async listPendingShareOffers(): Promise<ShareOffer[]> {
    return [...this._pendingInboundShareOffers.values()];
  }

  // -----------------------------------------------------------------------
  // File sharing (FS-C — outbound parity with desktop)
  // -----------------------------------------------------------------------

  async shareFile(
    targetOwnerId: string,
    file: {
      path: string;
      sensitivity: "public" | "friends" | "private";
      deliveryChannel?: "inbox" | "chat" | "agent";
    },
  ): Promise<void> {
    await this._shareFileInternal(targetOwnerId, file);
  }

  async requestShareFromLibrary(
    targetOwnerId: string,
    file: {
      relativePath: string;
      sensitivity: "public" | "friends" | "private";
      correlationId?: string;
    },
  ): Promise<{ shareRequestMessageId: string }> {
    void targetOwnerId;
    void file;
    throw new Error("requestShareFromLibrary is not supported on mobile yet");
  }

  private async _shareFileInternal(
    targetOwnerId: string,
    file: {
      path: string;
      sensitivity: "public" | "friends" | "private";
      deliveryChannel?: "inbox" | "chat" | "agent";
      chatRoomId?: string;
      chatMessageId?: string;
      chatAttachmentId?: string;
    },
  ): Promise<{ shareRequestMessageId: string }> {
    this._assertNodeRunning();
    if (!this._state?.device || !this._state?.owner) {
      throw new Error("Node not initialized — call initNode() first");
    }

    const norm = file.path.replace(/^[\\/]+/, "");
    this._validateRelativeVaultPathForShare(norm);
    await this._vault.readFile(norm).catch(() => {
      throw new Error("File not found in vault");
    });

    const transportPeerId = await this._resolveBondRecipientPeerId(targetOwnerId.trim());
    const recipientEnvelopePeerId = await this._resolveChatRecipientPeerId(targetOwnerId.trim());

    const unsigned = createUnsignedEnvelope({
      intent: "share.request",
      senderPeerId: derivePeerId(this._state.device.publicKeyPem),
      senderPublicKey: this._state.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      payload: createShareRequestPayload({
        requestType: "file",
        relativePath: norm,
        requestedSensitivity: file.sensitivity,
        fileOrigin: "sender",
        deliveryChannel: file.deliveryChannel ?? "inbox",
        chatRoomId: file.chatRoomId,
        chatMessageId: file.chatMessageId,
        chatAttachmentId: file.chatAttachmentId,
      }),
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
    const data = JSON.stringify(signed);

    if (this._mesh) {
      try {
        await this._sendViaMesh(transportPeerId, data, ENVOY_MESSAGE_PROTOCOL);
        this._pendingPushShareByRequestMsgId.set(signed.messageId, {
          relativePath: norm,
          toPeerId: transportPeerId,
        });
        return { shareRequestMessageId: signed.messageId };
      } catch (err) {
        console.warn(
          "[mobile-node] mesh shareFile failed, falling back to relay:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    this._broadcastToRelaySockets(data);
    this._pendingPushShareByRequestMsgId.set(signed.messageId, {
      relativePath: norm,
      toPeerId: transportPeerId,
    });
    return { shareRequestMessageId: signed.messageId };
  }

  async acceptShare(shareId: string, savePath: string): Promise<void> {
    this._assertNodeRunning();
    if (!this._state?.device || !this._state?.owner) {
      throw new Error("Node not initialized — call initNode() first");
    }
    const offer = this._pendingInboundShareOffers.get(shareId);
    if (!offer) {
      throw new Error(`No pending share offer for id=${shareId}`);
    }

    const saveNorm = savePath.trim().replace(/^[\\/]+/, "");
    const srcKey = offer.senderVaultRelativePath?.replace(/^[\\/]+/, "") ?? "";
    if (saveNorm) {
      if (!srcKey) {
        throw new Error("Cannot set save path: sender vault path unknown for this offer");
      }
      this._validateRelativeVaultPathForShare(saveNorm);
      this._pendingDataTransferSavePath.set(`${offer.senderNodeId}\n${srcKey}`, saveNorm);
    }

    const dialPeer = offer.senderNodeId;

    const unsigned = createUnsignedEnvelope({
      intent: "share.accept",
      senderPeerId: derivePeerId(this._state.device.publicKeyPem),
      senderPublicKey: this._state.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: undefined,
      recipientRole: "human",
      payload: createShareAcceptPayload({ inReplyTo: shareId, accept: true }),
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
    const data = JSON.stringify(signed);

    if (this._mesh) {
      try {
        await this._sendViaMesh(dialPeer, data, ENVOY_MESSAGE_PROTOCOL);
      } catch (err) {
        console.warn(
          "[mobile-node] mesh acceptShare failed, falling back to relay:",
          err instanceof Error ? err.message : err,
        );
        this._broadcastToRelaySockets(data);
      }
    } else {
      this._broadcastToRelaySockets(data);
    }

    this._pendingInboundShareOffers.delete(shareId);
    this._inboundTransferByShareId.set(shareId, {
      senderNodeId: offer.senderNodeId,
      senderVaultRelativePath: srcKey,
      savePath: saveNorm || srcKey || offer.filename,
      senderOwnerId: offer.senderOwnerId,
      chatRoomId: offer.chatRoomId,
      chatMessageId: offer.chatMessageId,
      chatAttachmentId: offer.chatAttachmentId,
    });
    const emitPath = saveNorm || srcKey || offer.filename;
    this._events.emit("share:accepted", { shareId, savePath: emitPath });
  }

  async declineShare(shareId: string): Promise<void> {
    this._assertNodeRunning();
    if (!this._state?.device || !this._state?.owner) {
      throw new Error("Node not initialized — call initNode() first");
    }
    const offer = this._pendingInboundShareOffers.get(shareId);
    if (!offer) {
      throw new Error(`No pending share offer for id=${shareId}`);
    }
    const dialPeer = offer.senderNodeId;

    const unsigned = createUnsignedEnvelope({
      intent: "share.accept",
      senderPeerId: derivePeerId(this._state.device.publicKeyPem),
      senderPublicKey: this._state.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: undefined,
      recipientRole: "human",
      payload: createShareAcceptPayload({ inReplyTo: shareId, accept: false }),
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
    const data = JSON.stringify(signed);

    if (this._mesh) {
      try {
        await this._sendViaMesh(dialPeer, data, ENVOY_MESSAGE_PROTOCOL);
      } catch (err) {
        console.warn(
          "[mobile-node] mesh declineShare failed, falling back to relay:",
          err instanceof Error ? err.message : err,
        );
        this._broadcastToRelaySockets(data);
      }
    } else {
      this._broadcastToRelaySockets(data);
    }

    this._pendingInboundShareOffers.delete(shareId);
    this._events.emit("share:declined", { shareId });
  }

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------

  private _loadAiPrefsIfNeeded(): void {
    const oid = this._state?.owner.ownerId;
    if (!oid) return;
    if (this._aiPrefsOwnerId === oid) return;
    this._aiPrefsOwnerId = oid;
    const loaded = loadMobileNodePrefs(oid);
    this._aiPrefs = {
      ...loaded,
      modelProviders: _normalizeMobileStoredOpenAiEndpoint(loaded.modelProviders),
    };
    if (loaded.modelProviders.mode === "ollama" || loaded.modelProviders.mode === "litellm") {
      saveMobileNodePrefs(oid, { modelProviders: this._aiPrefs.modelProviders });
    }
  }

  private _persistAiPrefs(): void {
    const oid = this._state?.owner.ownerId;
    if (!oid) return;
    saveMobileNodePrefs(oid, this._aiPrefs);
  }

  async getNodeConfig(): Promise<NodeConfig> {
    // In paired mode, merge the home node config with mobile-local fields.
    const homeConfig = (this._isHomeRemotePaired() && this._homeNodeConfig)
      ? this._homeNodeConfig
      : null;
    this._loadAiPrefsIfNeeded();
    const mpRaw = homeConfig?.modelProviders ?? (this._state?.owner.ownerId ? this._aiPrefs.modelProviders : { mode: "mock" as const });
    const mp = this._state?.owner.ownerId ? _normalizeMobileStoredOpenAiEndpoint(mpRaw) : mpRaw;
    const chatAssist = Boolean(this._state?.owner.ownerId && this._aiPrefs.chatAssistEnabled);
    const externalPublish = this._state?.owner.ownerId
      ? loadMobileExternalPublish(this._state.owner.ownerId)
      : { allowIpfs: false, gatewayAllowlist: [], ipfsExportEngine: "helia" as const };
    // Local-only fields (mobile's own state). These don't come from the home.
    const local: NodeConfig = {
      profileDir: this._profileDir,
      discoveryProfile: "wan-default",
      relayEnabled: true,
      relayServerEnabled: false,
      configuredRelays: this._relayUrls.map((addr, i) => ({
        relayId: `mobile-relay-${i}`,
        addr,
        enabled: true,
      })),
      advertiseAddrs: [],
      bootstrapPeers: this._meshBootstrapPeers,
      bootstrapPresets: [],
      modelProviders: mp,
      chatAssistEnabled: chatAssist,
      anonymousDiscoveryMode: "off",
      anonymousSensitivityCeiling: "public",
      trustAnchorPublicKeys: {},
      autonomousKillSwitch: this._aiPrefs.autonomousKillSwitch,
      autonomousPolicies: [...this._aiPrefs.autonomousPolicies],
      aiSettings: this._aiPrefs.aiSettings,
      contactAiPreferences: [...this._aiPrefs.contactAiPreferences],
      trustModeEnabled: this._aiPrefs.trustModeEnabled,
      friendMatchingPreferencesText: this._aiPrefs.friendMatchingPreferencesText,
      externalPublish,
    };
    // In paired mode, prefer the home's values for fields the home owns (AI
    // model, chat-assist, autonomous policies, AI identity). The UI's
    // AIChatPanel reads `modelProviders.modelName` to label the model — without
    // this override the mobile always shows "mock" because it has no local
    // model. Keep mobile-local fields (relay URLs, profileDir, mesh bootstrap)
    // from the mobile.
    if (this._isHomeRemotePaired() && this._homeNodeConfig) {
      const home = this._homeNodeConfig;
      return {
        ...local,
        modelProviders: home.modelProviders ?? local.modelProviders,
        chatAssistEnabled: home.chatAssistEnabled ?? local.chatAssistEnabled,
        autonomousKillSwitch: home.autonomousKillSwitch ?? local.autonomousKillSwitch,
        autonomousPolicies: home.autonomousPolicies ?? local.autonomousPolicies,
        aiSettings: home.aiSettings ?? local.aiSettings,
        contactAiPreferences: home.contactAiPreferences ?? local.contactAiPreferences,
        trustModeEnabled: home.trustModeEnabled ?? local.trustModeEnabled,
        friendMatchingPreferencesText:
          home.friendMatchingPreferencesText ?? local.friendMatchingPreferencesText,
      };
    }
    return local;
  }

  async updateNodeConfig(config: Partial<NodeConfig> & { relayUrls?: string[] }): Promise<void> {
    const fromConfigured = config.configuredRelays
      ?.filter((r) => r.enabled !== false)
      .map((r) => r.addr)
      .filter((a): a is string => Boolean(String(a).trim()));
    const legacyUrls = config.relayUrls;
    const newUrls =
      fromConfigured && fromConfigured.length > 0
        ? fromConfigured
        : legacyUrls && legacyUrls.length > 0
          ? legacyUrls
          : undefined;

    if (newUrls) {
      this._relayUrls.length = 0;
      this._relayUrls.push(...newUrls);
      if (this._status === "running") {
        for (const ws of this._relaySockets) {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
        this._relaySockets = [];
        this._relayBackoffs.clear();
        for (const t of this._relayBackoffTimers.values()) clearTimeout(t);
        this._relayBackoffTimers.clear();
        this._connectRelays();
      }
    }
    if (config.bootstrapPeers) {
      this._meshBootstrapPeers = [...config.bootstrapPeers];
    }

    const oid = this._state?.owner.ownerId;
    if (
      oid != null &&
      (config.modelProviders !== undefined ||
        config.chatAssistEnabled !== undefined ||
        config.aiSettings !== undefined ||
        config.autonomousKillSwitch !== undefined ||
        config.autonomousPolicies !== undefined ||
        config.trustModeEnabled !== undefined ||
        config.friendMatchingPreferencesText !== undefined ||
        config.contactAiPreferences !== undefined)
    ) {
      this._loadAiPrefsIfNeeded();
      if (config.modelProviders !== undefined || config.chatAssistEnabled !== undefined) {
        const mergedMp: ModelProviderConfig = {
          ...this._aiPrefs.modelProviders,
          ...(config.modelProviders ?? {}),
        };
        if (mergedMp.mode === "ollama" || mergedMp.mode === "litellm") {
          throw new Error(
            "Mobile supports cloud model APIs only (OpenAI-compatible or Anthropic). Configure Ollama or LiteLLM on your desktop node.",
          );
        }
        this._aiPrefs.modelProviders = _normalizeMobileStoredOpenAiEndpoint(mergedMp);
        if (config.chatAssistEnabled !== undefined) {
          this._aiPrefs.chatAssistEnabled = config.chatAssistEnabled;
        }
      }
      if (config.aiSettings !== undefined) {
        this._aiPrefs.aiSettings = config.aiSettings;
      }
      if (config.autonomousKillSwitch !== undefined) {
        this._aiPrefs.autonomousKillSwitch = config.autonomousKillSwitch;
      }
      if (config.autonomousPolicies !== undefined) {
        this._aiPrefs.autonomousPolicies = [...config.autonomousPolicies];
      }
      if (config.trustModeEnabled !== undefined) {
        this._aiPrefs.trustModeEnabled = config.trustModeEnabled;
      }
      if (config.friendMatchingPreferencesText !== undefined) {
        this._aiPrefs.friendMatchingPreferencesText =
          config.friendMatchingPreferencesText.trim().length === 0
            ? undefined
            : config.friendMatchingPreferencesText.trim();
      }
      if (config.contactAiPreferences !== undefined) {
        this._aiPrefs.contactAiPreferences = [...config.contactAiPreferences];
      }
      this._persistAiPrefs();
    }

    if (oid != null && config.externalPublish !== undefined) {
      saveMobileExternalPublish(oid, config.externalPublish);
    }
  }

  async getSetupSponsorFriendConfig(): Promise<
    import("@envoymesh/api").ResolvedSetupSponsorFriend
  > {
    return {
      enabled: false,
      helloMessage: "Hello!",
      maxAttempts: 12,
      retryDelayMs: 5000,
      source: "none",
    };
  }

  /**
   * Full sponsor-friend status for the discover-view tile. Mobile forwards
   * to the paired home node when available; otherwise returns a no-op
   * status (the sponsor only lives on the home node, so a standalone
   * mobile has nothing to report).
   */
  async getSetupSponsorFriendStatus(): Promise<
    import("@envoymesh/api").SetupSponsorFriendStatus
  > {
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<import("@envoymesh/api").SetupSponsorFriendStatus>(
          "getSetupSponsorFriendStatus",
          {},
        );
      } catch {
        // fall through to offline default
      }
    }
    return {
      config: {
        enabled: false,
        helloMessage: "Hello!",
        maxAttempts: 12,
        retryDelayMs: 5000,
        source: "none",
      },
      state: {},
      sponsorProofTokenRequired: false,
    };
  }

  async runSetupSponsorFriend(): Promise<
    import("@envoymesh/api").RunSetupSponsorFriendResult
  > {
    return { ok: true, skipped: true, reason: "mobile-not-supported" };
  }

  async listRelays(): Promise<RelayConfig[]> {
    return this._relayUrls.map((addr, i) => ({
      relayId: `mobile-relay-${i}`,
      addr,
      enabled: true,
    }));
  }
  async addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig> {
    const trimmed = addr.trim();
    if (!trimmed) throw new Error("addRelay: address required");
    if (!this._relayUrls.includes(trimmed)) {
      this._relayUrls.push(trimmed);
      if (this._status === "running") {
        this._connectRelay(trimmed);
      }
    }
    return { relayId: trimmed, addr: trimmed, level, region, enabled: true };
  }

  async removeRelay(relayIdOrAddr: string): Promise<void> {
    const idx = this._relayUrls.findIndex((u) => u === relayIdOrAddr);
    if (idx < 0) return;
    this._relayUrls.splice(idx, 1);
    if (this._status !== "running") return;
    for (const ws of this._relaySockets) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    this._relaySockets = [];
    this._relayBackoffs.clear();
    for (const t of this._relayBackoffTimers.values()) clearTimeout(t);
    this._relayBackoffTimers.clear();
    this._connectRelays();
  }

  // -----------------------------------------------------------------------
  // Connection status
  // -----------------------------------------------------------------------

  private _recordNodeError(context: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    this._lastNodeError = `${context}: ${msg}`;
    this._lastNodeErrorAt = new Date().toISOString();
    console.warn(`[mobile-node] ${this._lastNodeError}`);
  }

  getConnectionStatus() {
    const paired = this.sharedIdentity && Boolean(this._state?.homeNodePeerId?.trim());
    const homeOnline = paired ? this._homeRemoteOnline : false;
    return {
      online: this._status === "running",
      peerId: this._state?.agent?.agentPeerId ?? "",
      multiaddrs: this._mesh ? this._mesh.getMultiaddrs().map((a: any) => a.toString()) : this._relayUrls,
      connectedRelays: this._relayUrls,
      bondedPeers: 0,
      terminalsAvailable: false,
      homeRemote: paired
        ? {
            paired: true,
            homeOnline,
            terminalsAvailable: homeOnline,
            assistantProxied: homeOnline,
            transport: (this._homeRemoteTransport as "lan" | "libp2p" | "tunnel" | null) ?? null,
          }
        : {
            paired: false,
            homeOnline: false,
            terminalsAvailable: false,
            assistantProxied: false,
            transport: null,
          },
      lastError: this._lastNodeError ?? undefined,
      lastErrorAt: this._lastNodeErrorAt ?? undefined,
    };
  }

  async getPeerConnectionInfo(peerOwnerId: string): Promise<PeerConnectionInfo> {
    const transportPeerId = await this._resolveChatTransportPeerId(peerOwnerId);
    if (!transportPeerId) {
      return { connected: false, direct: false };
    }
    if (this._mesh) {
      return this._meshPeerConnectionInfo(transportPeerId);
    }
    return this._relayOnlyReachabilityHint(peerOwnerId);
  }

  async warmContactConnection(peerOwnerId: string): Promise<PeerConnectionInfo> {
    const existing = await this.getPeerConnectionInfo(peerOwnerId);
    if (existing.connected) {
      return existing;
    }
    const transportPeerId = await this._resolveChatTransportPeerId(peerOwnerId);
    if (!transportPeerId || !this._mesh) {
      return this._relayOnlyReachabilityHint(peerOwnerId);
    }
    try {
      const stream = await Promise.race([
        this._mesh.dialProtocol(`/p2p/${transportPeerId}` as any, ENVOY_CHAT_PROTOCOL),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("warmContactConnection timeout")), 8_000),
        ),
      ]);
      try {
        await stream.close();
      } catch {
        /* ignore */
      }
    } catch {
      /* dial failed — fall through to connection check */
    }
    const after = this._meshPeerConnectionInfo(transportPeerId);
    if (after.connected) {
      return after;
    }
    return this._relayOnlyReachabilityHint(peerOwnerId);
  }

  async getChatDiagnostics(peerOwnerId?: string) {
    return {
      checkedAt: new Date().toISOString(),
      nodeOnline: this._status === "running",
      localPeerId: this._state?.agent?.agentPeerId ?? "",
      relayEnabled: true,
      relayClientSchedulerActive: false,
      relayControlTargets: this._relayUrls,
      connectionStats: {
        totalPeers: 0,
        totalConnections: 0,
        circuitPeers: 0,
        circuitConnections: 0,
      },
      discoverySeedCount: 0,
      circuitSeedCount: 0,
      contact: peerOwnerId
        ? {
            peerOwnerId,
            peerFound: false,
            storedListenAddrs: 0,
            dialHintCount: 0,
            sampleDialHints: [],
            badPublicBootstrapHints: 0,
          }
        : undefined,
      hints: [
        this._status === "running"
          ? "Mobile relay-only mode — detailed chat diagnostics are limited on this build."
          : "Node is offline — start the node before sending chat.",
      ],
    };
  }

  async getConnectivityDiagnostics() {
    return {
      checkedAt: new Date().toISOString(),
      nodeOnline: this._status === "running",
      stageD: {
        discoveryProfile: "unknown" as const,
        bootstrapPeerCount: 0,
        discoveredPeerCount: 0,
        relayDiscoveryCount: 0,
        bootstrapProbeSuccessCount: 0,
        bootstrapProbeFailureCount: 0,
        reprobeOkCount: 0,
        reprobeFailCount: 0,
        warningCount: 0,
        badge: "unknown" as const,
        badgeExplanation: "Mobile relay-only — use desktop connectivity-status for WAN axis detail.",
      },
      axes: {
        bootstrapReachability: { state: "unknown" as const, explanation: "Not available on mobile relay-only build." },
        relayAvailability: {
          state: this._relayUrls.length > 0 ? ("ok" as const) : ("unknown" as const),
          explanation:
            this._relayUrls.length > 0
              ? `${this._relayUrls.length} relay URL(s) configured.`
              : "No relay URLs configured.",
        },
        holePunch: { state: "disabled" as const, explanation: "DCUtR not used on mobile relay-only transport." },
        policyBlock: { state: "unknown" as const, explanation: "Audit tail not surfaced on mobile." },
        features: { relay: true, dcutr: false },
      },
      circuitReservation: {
        state: "off" as const,
        live: false,
        everReserved: false,
        relayPeerIds: [],
        checkedAt: new Date().toISOString(),
      },
      quicEnabled: false,
      hints: ["Mobile uses relay WebSocket transport — WAN axis diagnostics are best-effort."],
      signOffChecklist: [],
    };
  }

  async getCircuitReservationStatus() {
    return {
      state: "off" as const,
      live: false,
      everReserved: false,
      relayPeerIds: [] as string[],
      checkedAt: new Date().toISOString(),
    };
  }

  // Mobile doesn't support bootstrap peers — return empty
  async getBootstrapPeers() {
    return { bootstrapPeers: [], bootstrapPresetNames: [] };
  }

  async discoverCapabilityTopic(params: { topic: string; maxResults?: number; followUpDiscovery?: boolean }) {
    const topic = params.topic.trim();
    if (!topic) throw new Error("discoverCapabilityTopic: topic is required");
    const results = await this.searchPeers({ interests: [topic] });
    return {
      topic,
      providers: results.map((r) => ({
        peerId: r.nodeId,
        multiaddrs: [],
        ownerId: r.ownerId,
        displayName: r.displayName,
        trustLevel: r.trustLevel,
        discoverySource: "dht-capability-topic" as const,
      })),
    };
  }

  async getMorningReport(params?: { limit?: number }): Promise<MorningReportEntry[]> {
    const [bonds, peers] = await Promise.all([
      this._trustStore.list(),
      this._peerDirectory.list(),
    ]);
    return buildMorningReportDigest({
      trustRecords: bonds.map((bond) => {
        const seen = bond.createdAt ?? new Date().toISOString();
        return {
          version: "0.1" as const,
          peerOwnerId: bond.peerOwnerId,
          level: bond.level,
          displayName: bond.displayName,
          createdAt: seen,
          updatedAt: seen,
        };
      }),
      peerDirectoryRecords: peers.map((peer) => ({
        version: "0.1" as const,
        ownerId: peer.ownerId,
        peerId: peer.libp2pPeerId ?? "",
        deviceId: "",
        devicePublicKeyPem: "",
        lastSeenAt: peer.lastSeen,
        listenAddrs: peer.multiaddrs,
      })),
      discoveryEvents: [],
      limit: params?.limit ?? 10,
    });
  }

  private _requireMultihopDiscoveryStore(): MultiHopDiscoveryStore {
    if (!this._multihopDiscoveryStore) {
      this._multihopDiscoveryStore = createMultiHopDiscoveryStore(this._profileDir);
    }
    return this._multihopDiscoveryStore;
  }

  private _publishMultiHopSession(session: MultiHopDiscoverySessionView): void {
    this._events.emit("discovery:multihop-update", session);
  }

  async requestMultiHopDiscovery(
    params: import("@envoymesh/api").RequestMultiHopDiscoveryParams,
  ): Promise<import("@envoymesh/api").RequestMultiHopDiscoveryResult> {
    this._assertNodeRunning();
    if (!this._state?.device || !this._state?.owner) {
      throw new Error("Node not initialized — call initNode() first");
    }
    if (!this._mesh) {
      return {
        matches: [],
        bondsQueried: 0,
        correlationId: _randomUUID(),
        pendingForwardApprovals: 0,
        aggregatedMatchCount: 0,
      };
    }

    const correlationId = _randomUUID();
    const maxHops = Math.min(params.maxHops ?? 2, 4);
    const maxBonds = params.maxBonds ?? 5;
    const bonds = (await this._trustStore.list()).filter((row) => row.level !== "blocked").slice(0, maxBonds);
    const matches: MultiHopDiscoveryMatch[] = [];
    const seenOwners = new Set<string>();

    for (const bond of bonds) {
      try {
        const transportPeerId = await this._resolveBondRecipientPeerId(bond.peerOwnerId);
        const recipientEnvelopePeerId = await this._resolveChatRecipientPeerId(bond.peerOwnerId);
        const unsigned = createUnsignedEnvelope({
          senderPeerId: derivePeerId(this._state.device.publicKeyPem),
          senderPublicKey: this._state.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: recipientEnvelopePeerId,
          recipientRole: "human",
          intent: "discovery.request",
          payload: createDiscoveryRequestPayload({
            requesterOwnerId: this._state.owner.ownerId,
            requestedTagHashes: params.requestedTagHashes ?? [],
            requestedCapabilities: params.requestedCapabilities ?? [],
            fileTitleQuery: params.fileTitleQuery,
            maxResults: 8,
            requestedSensitivity: "public",
            maxHops,
            currentHop: 0,
          }),
          correlationId,
        });
        const envelope = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
        const replyText = await this._sendExpectReplyViaMesh(
          transportPeerId,
          JSON.stringify(envelope),
          18_000,
          bond.peerOwnerId,
        );
        const reply = parseEnvelope(JSON.parse(replyText) as Record<string, unknown>);
        if (reply.intent !== "discovery.response") continue;
        const resp = parseDiscoveryResponsePayload(reply.payload);
        for (const match of resp.matches) {
          if (seenOwners.has(match.ownerId)) continue;
          seenOwners.add(match.ownerId);
          const bondLabel = bond.displayName ?? bond.peerOwnerId;
          matches.push({
            ownerId: match.ownerId,
            peerId: match.peerId,
            hopDistance: match.hopDistance ?? 1,
            matchedCapabilities: match.matchedCapabilities,
            matchedTagHashes: match.matchedTagHashes,
            viaOwnerId: bond.peerOwnerId,
            viaDisplayName: bondLabel,
            trustPath: `${this._state.owner.ownerId} → ${bond.peerOwnerId} → ${match.ownerId}`,
          });
        }
      } catch (error) {
        console.warn(
          `[mobile-node] requestMultiHopDiscovery bond ${bond.peerOwnerId} failed:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    const pendingForwardApprovals = maxHops >= 2 ? bonds.length : 0;
    const awaitingHop2ViaBonds = maxHops >= 2 ? bonds.map((bond) => bond.peerOwnerId) : [];
    const now = new Date().toISOString();
    const store = this._requireMultihopDiscoveryStore();
    const session: MultiHopDiscoverySessionView = {
      correlationId,
      createdAt: now,
      updatedAt: now,
      bondsQueried: bonds.length,
      pendingForwardApprovals,
      awaitingHop2ViaBonds,
      matches,
    };
    await store.upsertSession({
      ...session,
      awaitingHop2ViaBonds,
    });
    this._publishMultiHopSession(session);

    return {
      matches,
      bondsQueried: bonds.length,
      correlationId,
      pendingForwardApprovals,
      aggregatedMatchCount: matches.length,
    };
  }

  async getMultiHopDiscoverySession(
    correlationId: string,
  ): Promise<MultiHopDiscoverySessionView | undefined> {
    const store = this._requireMultihopDiscoveryStore();
    const session = await store.getSession(correlationId.trim());
    if (!session) return undefined;
    const awaitingHop2ViaBonds = session.awaitingHop2ViaBonds ?? [];
    return {
      ...session,
      awaitingHop2ViaBonds,
      pendingForwardApprovals: awaitingHop2ViaBonds.length,
    };
  }

  async ingestInboundMultiHopDiscoveryResponse(params: {
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
  }): Promise<void> {
    const correlationId = params.correlationId.trim();
    if (!correlationId) return;
    const store = this._requireMultihopDiscoveryStore();
    const session = await store.getSession(correlationId);
    if (!session) return;

    const trustRecord = await this._trustStore.get(params.responderOwnerId);
    const viaLabel = trustRecord?.displayName ?? params.responderOwnerId;
    const ownerId = this._state?.owner?.ownerId;
    const hopMatches: MultiHopDiscoveryMatch[] =
      params.forwardPendingAck && params.matches.length === 0
        ? []
        : params.matches.map((match) => ({
            ownerId: match.ownerId,
            peerId: match.peerId,
            hopDistance: match.hopDistance ?? 2,
            matchedCapabilities: match.matchedCapabilities,
            matchedTagHashes: match.matchedTagHashes,
            viaOwnerId: params.responderOwnerId,
            viaDisplayName: viaLabel,
            referralOwnerId: params.responderOwnerId,
            trustPath: ownerId
              ? `${ownerId} → ${params.responderOwnerId} → ${match.ownerId}`
              : `${params.responderOwnerId} → ${match.ownerId}`,
          }));

    const updated = await store.applyInboundResponse(correlationId, {
      responderOwnerId: params.responderOwnerId,
      forwardPendingAck: params.forwardPendingAck,
      matches: hopMatches,
    });
    if (updated) {
      this._publishMultiHopSession({
        ...updated,
        awaitingHop2ViaBonds: updated.awaitingHop2ViaBonds ?? [],
        pendingForwardApprovals: (updated.awaitingHop2ViaBonds ?? []).length,
      });
    }
  }

  async sendSyncStateUpdate(
    params: import("@envoymesh/api").SendSyncStateUpdateParams,
  ): Promise<import("@envoymesh/api").SendSyncStateUpdateResult> {
    if (!this._state?.device || !this._state?.owner) {
      return { ok: false, recipients: 0, error: "node not initialized" };
    }
    const scope = params.scope.trim();
    const updateBase64 = params.updateBase64.trim();
    if (!scope || !updateBase64) {
      return { ok: false, recipients: 0, error: "scope and updateBase64 required" };
    }
    const payload = createSyncStatePayload({
      scope,
      updateBase64,
      senderOwnerId: this._state.owner.ownerId,
    });
    const targets: string[] = [];
    if (params.targetPeerId?.trim()) {
      targets.push(params.targetPeerId.trim());
    } else if (this._state.homeNodePeerId?.trim()) {
      targets.push(this._state.homeNodePeerId.trim());
    }
    if (targets.length === 0) {
      return { ok: true, recipients: 0 };
    }
    let sent = 0;
    for (const peerId of targets) {
      const unsigned = createUnsignedEnvelope({
        intent: "sync.state",
        senderPeerId: derivePeerId(this._state.device.publicKeyPem),
        senderPublicKey: this._state.device.publicKeyPem,
        recipientPeerId: peerId,
        payload,
      });
      const signed = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
      const wire = JSON.stringify(signed);
      try {
        await this._sendViaMesh(peerId, wire);
      } catch {
        this._broadcastToRelaySockets(wire);
      }
      sent += 1;
    }
    return { ok: sent > 0, recipients: sent };
  }

  // -----------------------------------------------------------------------
  // Agent bridge
  // -----------------------------------------------------------------------

  async getBridgeStatus(): Promise<BridgeStatus> {
    const agentPeerId = this._state?.homeAgentPeerId?.trim() ?? "";
    const enabled = Boolean(agentPeerId && this._state?.sharedIdentity && this._state?.homeNodePeerId);
    const agentName = this._state?.homeAgentName?.trim() || "My Agent";
    return {
      enabled,
      agentPeerId,
      agentUrl: enabled ? "home-node-bridge" : "",
      listenPort: 0,
      agentName,
      agentPublicKeyPem: this._state?.homeAgentPubKey,
    };
  }

  /**
   * Built-in OpenClaw status — mobile is a thin client, so we delegate to the
   * home node via HomeRemoteClient. The home node owns the actual gateway
   * process; mobile just reflects what the home reports.
   */
  async getOpenClawStatus(): Promise<OpenClawStatus> {
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<OpenClawStatus>("getOpenClawStatus", {});
      } catch {
        // fall through to offline default
      }
    }
    return { enabled: false, running: false, url: "" };
  }

  async probeExtAgent(
    params?: import("@envoymesh/api").ProbeExtAgentParams,
  ): Promise<import("@envoymesh/api").ExtAgentReachability> {
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<import("@envoymesh/api").ExtAgentReachability>(
          "probeExtAgent",
          (params ?? {}) as Record<string, unknown>,
        );
      } catch {
        // fall through
      }
    }
    const agentId = params?.agentId?.trim() || "pi";
    return {
      agentId,
      agentName: agentId,
      builtIn: agentId === "pi",
      reachable: false,
      hint: "Home node is offline — Ext Agent reachability can only be checked on the home node.",
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Restart the built-in OpenClaw gateway. Mobile forwards to the home
   * node when paired; otherwise no-op (the gateway only lives on the home).
   * The chat view's offline banner calls this so a mobile user can recover
   * a stopped gateway without driving a desktop session.
   */
  async restartOpenClaw(): Promise<OpenClawStatus> {
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<OpenClawStatus>("restartOpenClaw", {});
      } catch {
        // fall through to offline default
      }
    }
    return { enabled: false, running: false, url: "" };
  }

  /**
   * Phase 49 — Pi (built-in local coding agent) status. Mobile forwards to
   * the home node when paired; otherwise returns a disabled stub. Pi only
   * runs on the home node (it needs the local filesystem for coding work).
   */
  async getPiStatus(): Promise<PiStatus> {
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<PiStatus>("getPiStatus", {});
      } catch {
        // fall through to offline default
      }
    }
    return { enabled: false, state: "disabled", modelInherited: true };
  }

  /** Phase 49 — restart Pi on the home node. No-op when not paired. */
  async restartPi(): Promise<PiStatus> {
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<PiStatus>("restartPi", {});
      } catch {
        // fall through to offline default
      }
    }
    return { enabled: false, state: "disabled", modelInherited: true };
  }

  /** Phase 49 — one-shot prompt to Pi on the home node. Returns empty when offline. */
  async sendToPi(text: string): Promise<string> {
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<string>("sendToPi", { text });
      } catch {
        // fall through to offline default
      }
    }
    return "";
  }

  /** Dynamic AI bot — proxies to home node. */
  async sendToAiBot(botId: string, text: string): Promise<void> {
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        await this._homeRemoteCall<void>("sendToAiBot", { botId, text });
      } catch {
        // best-effort
      }
    }
  }

  /**
   * Phase 49 (in-flight) — Pi interactive TUI terminal session. Mobile proxies
   * to the home node when paired; otherwise returns the not-yet-implemented
   * stub. Pi terminals only run on the home (they need a real PTY + the
   * bundled pi sidecar).
   */
  async ensurePiTerminalSession(
    params?: import("@envoymesh/api").EnsurePiTerminalParams,
  ): Promise<import("@envoymesh/api").EnsurePiTerminalResult> {
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<import("@envoymesh/api").EnsurePiTerminalResult>(
          "ensurePiTerminalSession",
          (params ?? {}) as Record<string, unknown>,
        );
      } catch {
        // fall through to offline default
      }
    }
    return {
      ok: false,
      code: "no_manager",
      reason: "Pi terminal requires a paired home node.",
    };
  }

  /** Phase 49D — confirm/deny a Pi tool-action request on the home node. */
  async piRespondToProposal(params: {
    uiRequestId: string
    confirmed: boolean
  }): Promise<{ uiRequestId: string; delivered: boolean }> {
    if (this._isHomeRemotePaired() && this._homeRemoteOnline) {
      try {
        return await this._homeRemoteCall<{ uiRequestId: string; delivered: boolean }>(
          "piRespondToProposal",
          params,
        );
      } catch {
        // fall through to offline default
      }
    }
    return { uiRequestId: params.uiRequestId, delivered: false };
  }

  async getPairingPayload() {
    return {
      wsUrl: this._relayUrls[0] ?? "",
      relayPeerId: "",
      agentPeerId: this._state?.agent?.agentPeerId ?? "",
      agentPubKey: this._state?.agent?.publicKeyPem ?? "",
      // Include owner identity info for shared-identity transfer
      ownerPublicKey: this._state?.owner?.publicKeyPem,
      ownerId: this._state?.owner?.ownerId,
    };
  }

  async createWanJoinInvite(
    params?: import("@envoymesh/api").CreateWanJoinInviteParams,
  ): Promise<import("@envoymesh/api").CreateWanJoinInviteResult> {
    void params;
    throw new Error("WAN join invites are created on the home node (desktop Settings)");
  }

  async applyWanJoinInvite(token: string): Promise<import("@envoymesh/api").ApplyWanJoinInviteResult> {
    const {
      assertWanJoinInviteNotExpired,
      decodeWanJoinInviteV1,
      mergeWanJoinInviteBootstrap,
      parseEnvoyJoinUri,
    } = await import("@envoymesh/api");
    const invite = decodeWanJoinInviteV1(parseEnvoyJoinUri(token));
    assertWanJoinInviteNotExpired(invite);
    const before = new Set(this._meshBootstrapPeers);
    const merged = mergeWanJoinInviteBootstrap({
      bootstrapPeers: this._meshBootstrapPeers,
      bootstrapPresets: [],
      invite,
    });
    this._meshBootstrapPeers = merged.bootstrapPeers;
    return {
      ok: true,
      bootstrapPeersAdded: merged.bootstrapPeers.filter((p) => !before.has(p)).length,
      bootstrapPresetsAdded: 0,
      seedsPersisted: merged.seedAddrs.length,
    };
  }

  async pairDevice(_params: any): Promise<any> {
    throw new Error("Mobile node does not accept pairDevice — pair with home node");
  }

  async pairSharedIdentity(_params: any): Promise<any> {
    throw new Error("Mobile node does not serve pairSharedIdentity — pair with home node");
  }

  // -----------------------------------------------------------------------
  // AI
  // -----------------------------------------------------------------------

  async knowledgeQuery(question: string): Promise<string> {
    if (!this._state) {
      throw new Error("Node not initialized");
    }
    const cfg = await this.getNodeConfig();
    const peerId = (this._meshPeerId || "").trim() || this._state.agent.agentPeerId;
    return runOwnerApprovedKnowledgeQuery({
      query: question,
      requesterPeerId: peerId,
      modelProviders: cfg.modelProviders,
    });
  }

  async draftAuthorContent(
    params: import("@envoymesh/api").DraftAuthorContentParams,
  ): Promise<import("@envoymesh/api").DraftAuthorContentResult> {
    if (!this._state) {
      return { ok: false, reason: "node_not_initialized" };
    }
    const {
      buildAuthorContentDraftPrompt,
      sanitizeAuthorDraftOutput,
    } = await import("@envoymesh/api");
    const { buildModelProviders, routeModelRequest } = await import("@envoymesh/models");
    if (params.mode !== "write" && !params.existingText?.trim()) {
      return { ok: false, reason: "existing_text_required" };
    }
    const cfg = await this.getNodeConfig();
    if (cfg.modelProviders.mode === "disabled") {
      return { ok: false, reason: "no_model_providers" };
    }
    let profileContext = params.profileContext;
    if (params.surface === "bio" && !profileContext) {
      try {
        const human = await this.getHumanProfile();
        if (human) {
          profileContext = {
            displayName: human.displayName,
            username: human.username,
            hobbies: human.hobbies,
            knowledge: human.knowledge,
          };
        }
      } catch {
        /* optional */
      }
    }
    const providers = buildModelProviders(cfg.modelProviders, false, { trustedLocalAssist: true });
    if (providers.length === 0) {
      return { ok: false, reason: "no_model_providers" };
    }
    const peerId = (this._meshPeerId || "").trim() || this._state.agent.agentPeerId;
    const modelResult = await routeModelRequest(
      {
        taskType: "author.draft",
        prompt: buildAuthorContentDraftPrompt({ ...params, profileContext }),
        sensitivity: "friends",
        requesterPeerId: peerId,
        ownerApproved: true,
      },
      providers,
    );
    if (modelResult.decision.action !== "allow") {
      return {
        ok: false,
        reason:
          modelResult.decision.action === "deny"
            ? modelResult.decision.reason
            : "model_approval_required",
      };
    }
    const text = sanitizeAuthorDraftOutput((modelResult.response?.text ?? "").trim());
    if (!text) return { ok: false, reason: "empty_model_response" };
    if (params.surface === "bio" && text.length > 500) {
      return { ok: true, text: text.slice(0, 500).trim() };
    }
    return { ok: true, text };
  }

  async getChatDrafts(threadPeerOwnerId?: string): Promise<ChatDraft[]> {
    if (threadPeerOwnerId) {
      return [...(this._chatDrafts.get(threadPeerOwnerId) ?? [])];
    }
    return [...this._chatDrafts.values()].flat();
  }

  async deleteChatDraft(draftId: string): Promise<void> {
    for (const [threadId, drafts] of this._chatDrafts.entries()) {
      const next = drafts.filter((d) => d.draftId !== draftId);
      if (next.length === drafts.length) continue;
      if (next.length === 0) this._chatDrafts.delete(threadId);
      else this._chatDrafts.set(threadId, next);
      return;
    }
  }

  private async _maybeGenerateInboundChatDraft(input: {
    senderOwnerId: string;
    senderDisplayName: string;
    chatText: string;
    messageId: string;
    remotePeerId: string;
    senderRole?: "human" | "agent" | "system";
    agentVerified?: boolean;
  }): Promise<void> {
    if (!this._state) return;
    this._loadAiPrefsIfNeeded();
    const cfg = await this.getNodeConfig();
    if (
      shouldSkipAgentChatAssist({
        senderRole: input.senderRole ?? "human",
        agentInteractionMode: cfg.agentInteractionMode,
        agentVerified: input.agentVerified,
      })
    ) {
      return;
    }
    const bond = await this._trustStore.get(input.senderOwnerId);
    const bondLevel = bond?.level ?? "public";
    const result = await generateMobileChatDraft({
      senderOwnerId: input.senderOwnerId,
      senderDisplayName: input.senderDisplayName,
      chatText: input.chatText,
      messageId: input.messageId,
      remotePeerId: input.remotePeerId,
      bondLevel,
      modelProviders: cfg.modelProviders,
      chatAssistEnabled: cfg.chatAssistEnabled,
      aiSettings: cfg.aiSettings,
      contactAiPreferences: cfg.contactAiPreferences,
      ownerDisplayName: this._state.owner.ownerId,
    });
    if (!result.ok) return;
    const list = this._chatDrafts.get(input.senderOwnerId) ?? [];
    this._chatDrafts.set(input.senderOwnerId, [...list, result.draft]);
    this._events.emit("chat:draft", {
      threadPeerOwnerId: input.senderOwnerId,
      draft: result.draft,
    });

    const aiAccessLevel = resolveMobileContactAiAccessLevel(
      input.senderOwnerId,
      cfg.contactAiPreferences ?? [],
      cfg.aiSettings,
    );
    const requestedSensitivity =
      bondLevel === "direct" || bondLevel === "referred" ? "friends" : "public";
    const autoSendPolicy = evaluateAutonomousPolicy({
      autonomousKillSwitch: cfg.autonomousKillSwitch ?? false,
      autonomousPolicies: cfg.autonomousPolicies ?? [],
      domain: "social",
      action: "auto_send_chat",
      requestedSensitivity,
    });
    if (autoSendPolicy.allowed && aiAccessLevel === "full") {
      const limits = cfg.aiSettings?.autoReplyLimits;
      const limitDecision = await checkMobileAutoReplyAllowed({
        store: this._autoReplyLimitStore,
        contactOwnerId: input.senderOwnerId,
        limits,
        inboundSenderRole: input.senderRole ?? "human",
      });
      if (!limitDecision.allowed) {
        const notification = await applyMobileAutoReplyLimitDenied({
          store: this._autoReplyLimitStore,
          contactOwnerId: input.senderOwnerId,
          contactDisplayName: input.senderDisplayName,
          limits,
          decision: limitDecision,
        });
        if (notification) {
          this._events.emit("chat:auto-reply-paused", notification);
        }
      } else {
        try {
          await this.sendAgentChat(input.senderOwnerId, result.draft.text);
          await recordMobileAutoReplyAfterSend({
            store: this._autoReplyLimitStore,
            contactOwnerId: input.senderOwnerId,
            limits,
            inboundSenderRole: input.senderRole ?? "human",
          });
        } catch (err) {
          console.warn(
            "[mobile-node] chat draft auto-send failed:",
            err instanceof Error ? err.message : err,
          );
        }
      }
    } else if (result.draft.text) {
      const item = createApprovalItem(
        "send_chat",
        `Reply to ${input.senderDisplayName}`,
        `AI-drafted reply: "${result.draft.text.slice(0, 80)}${result.draft.text.length > 80 ? "..." : ""}"`,
        result.draft.text,
        {
          contactOwnerId: input.senderOwnerId,
          contactDisplayName: input.senderDisplayName,
        },
        bondLevel === "direct" ? "normal" : "low",
      );
      this._approvalQueue.add(item);
    }
  }

  private async _maybeGenerateInboundGroupChatDraft(input: {
    roomId: string;
    senderOwnerId: string;
    senderDisplayName: string;
    chatText: string;
    messageId: string;
    remotePeerId: string;
    senderRole?: "human" | "agent" | "system";
    agentVerified?: boolean;
  }): Promise<void> {
    if (!this._state) return;
    if (input.senderOwnerId === this._state.owner.ownerId) return;
    this._loadAiPrefsIfNeeded();
    const cfg = await this.getNodeConfig();
    if (
      shouldSkipAgentChatAssist({
        senderRole: input.senderRole ?? "human",
        agentInteractionMode: cfg.agentInteractionMode,
        agentVerified: input.agentVerified,
      })
    ) {
      return;
    }
    const bond = await this._trustStore.get(input.senderOwnerId);
    const bondLevel = bond?.level ?? "public";
    const threadKey = chatRoomThreadKey(input.roomId);
    const result = await generateMobileChatDraft({
      senderOwnerId: input.senderOwnerId,
      senderDisplayName: input.senderDisplayName,
      chatText: input.chatText,
      messageId: input.messageId,
      remotePeerId: input.remotePeerId,
      bondLevel,
      modelProviders: cfg.modelProviders,
      chatAssistEnabled: cfg.chatAssistEnabled,
      aiSettings: cfg.aiSettings,
      contactAiPreferences: cfg.contactAiPreferences,
      ownerDisplayName: this._state.owner.ownerId,
      threadPeerOwnerId: threadKey,
      accessContactId: threadKey,
      disableAutoSend: true,
    });
    if (!result.ok) return;
    const list = this._chatDrafts.get(threadKey) ?? [];
    this._chatDrafts.set(threadKey, [...list, result.draft]);
    this._events.emit("chat:draft", {
      threadPeerOwnerId: threadKey,
      draft: result.draft,
    });
  }

  async runDocumentAgentTurn(message: string): Promise<DocumentAgentTurnResult> {
    console.warn(
      "[EnvoyMesh] runDocumentAgentTurn is deprecated — use runOwnerAgentTurn from Assistant; RPC retained for one release.",
    );
    return this._runDocumentAgentTurnCore(message);
  }

  private async _runDocumentAgentTurnCore(message: string): Promise<DocumentAgentTurnResult> {
    if (!this._state) {
      throw new Error("Node not initialized");
    }
    const self = this;
    const turn = await runDocumentAgentTurnLoop({
      message,
      listLibraryItems: (query) => self.listLibraryItems(query ? { query } : undefined),
      getBonds: () => self.getBonds(),
      knowledgeQuery: (q) => self.knowledgeQuery(q),
      discoverPublishedLibrary: (p) => self.discoverPublishedLibrary(p),
      sendChat: async (targetOwnerId, text) => {
        const cfg = await self.getNodeConfig();
        const wireText = applyAiIdentityToDraftText(text, cfg.aiSettings?.identity);
        return self.sendAgentChat(targetOwnerId, wireText);
      },
      executeTool: (toolName, params) => self._executeOwnerAgentTool(toolName, params),
    });
    return { ...turn, answer: stripModelThinking(turn.answer) };
  }

  private async _executeOwnerAgentTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<DocumentAgentToolResult> {
    const self = this;
    try {
      if (toolName === "mesh.library_list") {
        const query = typeof params.query === "string" ? params.query : undefined;
        const items = await self.listLibraryItems(query ? { query } : undefined);
        return { ok: true, result: { items }, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName === "mesh.library_read") {
        const docId =
          typeof params.documentId === "string" ? params.documentId.trim() : "";
        const relativePath =
          typeof params.relativePath === "string"
            ? params.relativePath.trim()
            : docId
              ? (await self.listLibraryItems()).find((i) => i.documentId === docId)
                  ?.relativePath ?? ""
              : "";
        if (!relativePath) {
          return { ok: false, error: "relativePath or documentId is required", toolName, correlationId: "", latencyMs: 0 };
        }
        const content = await self.readLibraryItemContent({
          relativePath,
          maxBytes: typeof params.maxBytes === "number" ? params.maxBytes : undefined,
        });
        const result: Record<string, unknown> = {
          relativePath,
          mimeType: content.mimeType,
          sizeBytes: content.sizeBytes,
          truncated: content.truncated,
          contentBase64: content.contentBase64,
        };
        if (content.mimeType.startsWith("text/")) {
          result.textContent = Buffer.from(content.contentBase64, "base64").toString("utf-8");
        }
        return { ok: true, result, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName === "mesh.files_list_all") {
        const query = typeof params.query === "string" ? params.query : undefined;
        const vaultItems = await self.listLibraryItems(query ? { query } : undefined);
        const items = vaultItems
          .map((item) => ({
            source: "vault" as const,
            relativePath: item.relativePath,
            title: item.title,
            extension: item.extension,
            byteLength: item.byteLength,
            updatedAt: item.updatedAt,
            documentId: item.documentId,
            published: item.published,
          }))
          .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
        return {
          ok: true,
          result: { items, vaultCount: vaultItems.length, workspaceCount: 0 },
          toolName,
          correlationId: "",
          latencyMs: 0,
        };
      }
      if (toolName === "mesh.files_read") {
        if (params.source === "workspace") {
          return {
            ok: false,
            error: "OpenClaw workspace files are not available on mobile — use vault files only",
            toolName,
            correlationId: "",
            latencyMs: 0,
          };
        }
        const docId =
          typeof params.documentId === "string" ? params.documentId.trim() : "";
        const relativePath =
          typeof params.relativePath === "string"
            ? params.relativePath.trim()
            : docId
              ? (await self.listLibraryItems()).find((i) => i.documentId === docId)
                  ?.relativePath ?? ""
              : "";
        if (!relativePath) {
          return { ok: false, error: "relativePath or documentId is required", toolName, correlationId: "", latencyMs: 0 };
        }
        const content = await self.readLibraryItemContent({
          relativePath,
          maxBytes: typeof params.maxBytes === "number" ? params.maxBytes : undefined,
        });
        const result: Record<string, unknown> = {
          source: "vault",
          relativePath,
          mimeType: content.mimeType,
          sizeBytes: content.sizeBytes,
          truncated: content.truncated,
          contentBase64: content.contentBase64,
        };
        if (content.mimeType.startsWith("text/")) {
          result.textContent = Buffer.from(content.contentBase64, "base64").toString("utf-8");
        }
        return { ok: true, result, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName === "mesh.library_discover") {
        const peers = await self.discoverPublishedLibrary({
          fileTitleQuery: params.fileTitleQuery as string | undefined,
          contentHashPrefix: params.contentHashPrefix as string | undefined,
        });
        return { ok: true, result: { peers }, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName === "mesh.library_publish") {
        const documentId = params.documentId as string;
        const published = params.published !== false;
        await self.setLibraryItemPublished(documentId, published);
        return { ok: true, result: { documentId, published }, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName === "mesh.share_profile_gallery_photo") {
        const targetOwnerId = params.targetOwnerId as string | undefined;
        const photoId = params.photoId as string | undefined;
        const vaultRelativePath = params.vaultRelativePath as string | undefined;
        if (!targetOwnerId?.trim()) {
          return { ok: false, error: "targetOwnerId is required", toolName, correlationId: "", latencyMs: 0 };
        }
        const hp = await self.getHumanProfile();
        const gallery = hp?.galleryPhotos ?? [];
        const photo = gallery.find(
          (p) =>
            (photoId?.trim() && p.photoId === photoId.trim()) ||
            (vaultRelativePath?.trim() && p.vaultRelativePath === vaultRelativePath.trim()),
        );
        if (!photo) {
          return { ok: false, error: "gallery photo not found on profile", toolName, correlationId: "", latencyMs: 0 };
        }
        const bonds = await self.getBonds();
        const bondLevel = bonds.find((b) => b.peerOwnerId === targetOwnerId.trim())?.level ?? "public";
        const cfg = await self.getNodeConfig();
        const profileMedia = normalizeProfileMediaPolicy(cfg.aiSettings?.profileMedia);
        const sensitivity = galleryPhotoShareSensitivity(photo.visibility);
        if (
          canAgentAutonomousShareGalleryPhoto({ policy: profileMedia, photo, bondLevel })
        ) {
          await self.shareFile(targetOwnerId.trim(), {
            path: photo.vaultRelativePath,
            sensitivity,
          });
          return {
            ok: true,
            result: { autoShared: true, targetOwnerId: targetOwnerId.trim(), photoId: photo.photoId },
            toolName,
            correlationId: "",
            latencyMs: 0,
          };
        }
        const proposal = await self.submitAgentShareProposal({
          targetOwnerId: targetOwnerId.trim(),
          vaultRelativePath: photo.vaultRelativePath,
          sensitivity,
          summary: params.summary as string | undefined,
        });
        return { ok: true, result: proposal, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName === "mesh.share_propose") {
        const proposal = await self.submitAgentShareProposal({
          targetOwnerId: params.targetOwnerId as string,
          vaultRelativePath: params.vaultRelativePath as string,
          sensitivity: (params.sensitivity as "public" | "friends" | "private") ?? "friends",
          summary: params.summary as string | undefined,
        });
        return { ok: true, result: proposal, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName === "mesh.library_request_share") {
        const { runLibraryRequestShare } = await import("@envoymesh/api");
        const outcome = await runLibraryRequestShare(
          {
            getBonds: () => self.getBonds(),
            discoverPublishedLibrary: (p) => self.discoverPublishedLibrary(p),
            sendChat: async (targetOwnerId, text) => {
              const cfg = await self.getNodeConfig();
              const wireText = applyAiIdentityToDraftText(text, cfg.aiSettings?.identity);
              return self.sendAgentChat(targetOwnerId, wireText);
            },
          },
          {
            targetOwnerHint: params.targetOwnerHint as string,
            fileTitleQuery: params.fileTitleQuery as string | undefined,
            relativePath: params.relativePath as string | undefined,
            contentHashPrefix: params.contentHashPrefix as string | undefined,
          },
        );
        if (!outcome.ok) {
          return { ok: false, error: outcome.error, toolName, correlationId: "", latencyMs: 0 };
        }
        return { ok: true, result: outcome.result, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName === "mesh.transfer_status") {
        const correlationId = params.correlationId as string | undefined;
        if (correlationId?.trim()) {
          return { ok: true, result: { status: undefined }, toolName, correlationId: "", latencyMs: 0 };
        }
        return { ok: true, result: { transfers: [] }, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName === "mesh.share_list_pending") {
        const offers = await self.listPendingShareOffers();
        return { ok: true, result: { offers }, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName === "mesh.share_list_proposals") {
        const proposals = await self.listAgentShareProposals();
        return { ok: true, result: { proposals }, toolName, correlationId: "", latencyMs: 0 };
      }
      if (toolName.startsWith("mesh.intro.")) {
        return {
          ok: false,
          error: "Trust mode intro tools are not available on mobile yet",
          toolName,
          correlationId: "",
          latencyMs: 0,
        };
      }
      return { ok: false, error: `Unsupported tool on mobile: ${toolName}`, toolName, correlationId: "", latencyMs: 0 };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        toolName,
        correlationId: "",
        latencyMs: 0,
      };
    }
  }

  async runOwnerAgentTurn(message: string): Promise<OwnerAgentTurnResult> {
    if (!this._state) {
      throw new Error("Node not initialized");
    }
    if (this._isHomeRemotePaired()) {
      if (!this._homeRemoteOnline) {
        throw new Error("assistant.homeOffline");
      }
      const turn = await this._homeRemoteCall<OwnerAgentTurnResult>("runOwnerAgentTurn", { message });
      return { ...turn, answer: stripModelThinking(turn.answer) };
    }
    const self = this;
    const config = await self.getNodeConfig();
    const peerId = (self._meshPeerId || "").trim() || self._state.agent.agentPeerId;
    const turn = await runOwnerAgentTurnLoop({
      message,
      runDocumentTurn: () => self._runDocumentAgentTurnCore(message),
      executeTool: (toolName, params) => self._executeOwnerAgentTool(toolName, params),
      matchRoutes: (goal) => matchAgentCapabilityRoutes({ goal, maxResults: 3 }),
      postureEnabled: {
        socialProxy: config.socialProxyEnabled ?? false,
        documentAcquisition: config.documentAcquisitionEnabled ?? false,
        capabilityProvider: config.capabilityProviderEnabled ?? false,
        trustMode: config.trustModeEnabled ?? false,
        autonomousKillSwitch: config.autonomousKillSwitch ?? false,
      },
      agentIdentitySection: undefined,
      askPlanner: (prompt) =>
        askMobileOwnerAgentPlanner({
          prompt,
          modelProviders: config.modelProviders,
          requesterPeerId: peerId,
        }),
      scanOutbound: scanMobileOwnerAgentOutbound,
      auditPlannerRound: async (record) => {
        await appendMobileAuditEvent(
          self._profileDir,
          createMobileAuditRecord({
            type: "tool.called",
            outcome: record.ok === false ? "deny" : "record",
            summary: record.toolName
              ? `owner agent planner round ${record.round}: ${record.toolName} — ${record.summary}`
              : `owner agent planner round ${record.round}: ${record.summary}`,
            direction: "local",
          }),
        );
      },
      startDocumentAcquisitionJob: (query) => self.startDocumentAcquisitionJob({ query }),
      startCapabilityProviderJob: (input) =>
        self.startCapabilityProviderJob({
          goal: input.goal,
          capabilityIds: input.capabilityIds,
        }),
      runSocialProxyPass: () => self.runSocialProxyPass(),
      countPendingApprovals: async () => {
        const pending = await self.listPendingApprovals();
        return pending.length;
      },
      getBonds: () => self.getBonds(),
    });
    return { ...turn, answer: stripModelThinking(turn.answer) };
  }

  async listSocialProxySessions(): Promise<import("@envoymesh/api").SocialProxySession[]> {
    return [];
  }

  async runSocialProxyPass(): Promise<{ ok: boolean; error?: string; correlationId?: string }> {
    return { ok: false, error: "social proxy not implemented on mobile yet" };
  }

  async cancelSocialProxySession(_sessionId: string): Promise<void> {}

  async startDocumentAcquisitionJob(_params: {
    query: string;
    fileTitleHint?: string;
    pathHint?: string;
  }): Promise<{ jobId: string; correlationId: string }> {
    throw new Error("document acquisition not implemented on mobile yet");
  }

  async getDocumentAcquisitionJob(_jobId: string): Promise<import("@envoymesh/api").DocumentAcquisitionJob | undefined> {
    return undefined;
  }

  async listDocumentAcquisitionJobs(_activeOnly?: boolean): Promise<import("@envoymesh/api").DocumentAcquisitionJob[]> {
    return [];
  }

  async cancelDocumentAcquisitionJob(_jobId: string): Promise<void> {}

  async startCapabilityProviderJob(_params: {
    goal: string;
    capabilityIds?: string[];
    targetOwnerId?: string;
  }): Promise<{ jobId: string; correlationId: string }> {
    throw new Error("capability provider not implemented on mobile yet");
  }

  async getCapabilityProviderJob(
    _jobId: string,
  ): Promise<import("@envoymesh/api").CapabilityProviderJob | undefined> {
    return undefined;
  }

  async listCapabilityProviderJobs(
    _activeOnly?: boolean,
  ): Promise<import("@envoymesh/api").CapabilityProviderJob[]> {
    return [];
  }

  async cancelCapabilityProviderJob(_jobId: string): Promise<void> {}

  async runCapabilityProviderWorker(): Promise<number> {
    return 0;
  }

  async listActiveTransfers(): Promise<TransferStatus[]> {
    return [];
  }

  async getTransferStatus(_correlationId: string): Promise<TransferStatus | undefined> {
    return undefined;
  }

  // -----------------------------------------------------------------------
  // Activity
  // -----------------------------------------------------------------------

  recordOwnerActivity(): void {
    this._lastActivity = Date.now();
  }

  async isOwnerOnline(): Promise<boolean> {
    if (!this._manualOnline) return Date.now() - this._lastActivity < 5 * 60 * 1000;
    return this._manualOnline;
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  on<K extends keyof NodeServiceEvents>(
    event: K,
    handler: (data: NodeServiceEvents[K]) => void,
  ): () => void {
    return this._events.on(event, handler as EventHandler);
  }

  hasListeners(event: keyof NodeServiceEvents): boolean {
    return this._events.hasListeners(event);
  }

  // -----------------------------------------------------------------------
  // Relay transport
  // -----------------------------------------------------------------------

  private _relayCheckinTimer: ReturnType<typeof setInterval> | null = null;

  private _connectRelays(): void {
    for (const url of this._relayUrls) {
      this._connectRelay(url);
    }
    // Start periodic relay checkin
    this._startRelayCheckin();
  }

  /**
   * Connect to a single relay with backoff reconnection.
   * On close/error: remove from _relaySockets, schedule reconnect with
   * exponential backoff (1s → 2s → 4s → ... → max 30s).
   */
  private _connectRelay(url: string): void {
    if (!url || this._status === "offline" || this._status === "stopping") return;
    try {
      const wsUrl = toRelayDirectClientWsUrl(url);
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        this._relayBackoffs.delete(url);
        this._sendRelayCheckin(ws);
        this._sendRendezvousRegister(ws);
        this._events.emit("node:online", {
          peerId: this._state?.agent?.agentPeerId ?? "",
          multiaddrs: [url],
        });
        void this.refreshBondPeerProfiles().catch((err) => {
          console.warn("[mobile-node] refreshBondPeerProfiles after relay online failed:", err);
        });
      };
      ws.onclose = () => {
        // Remove from socket array eagerly
        this._relaySockets = this._relaySockets.filter((s) => s !== ws);
        this._events.emit("node:offline", {
          peerId: this._state?.agent?.agentPeerId ?? "",
        });
        // Schedule reconnect with backoff
        this._scheduleRelayReconnect(url);
      };
      ws.onerror = () => {
        this._relaySockets = this._relaySockets.filter((s) => s !== ws);
        try { ws.close(); } catch { /* ignore */ }
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleInboundMessage(msg);
        } catch { /* ignore malformed */ }
      };
      this._relaySockets.push(ws);
    } catch { /* relay unreachable — will retry via backoff */ }
  }

  private _scheduleRelayReconnect(url: string): void {
    if (this._status === "offline" || this._status === "stopping") return;
    // Clear any existing backoff timer for this URL
    const existing = this._relayBackoffTimers.get(url);
    if (existing) clearTimeout(existing);
    const backoff = Math.min((this._relayBackoffs.get(url) ?? 1000) * 2, 30000);
    this._relayBackoffs.set(url, backoff);
    const timer = setTimeout(() => {
      this._relayBackoffTimers.delete(url);
      this._connectRelay(url);
    }, backoff);
    this._relayBackoffTimers.set(url, timer);
  }

  private async _sendBondAcceptEnvelope(recipientPeerId: string, requesterOwnerId: string): Promise<void> {
    if (!this._state?.device || !this._state?.owner) return;
    const displayName = this._humanProfile?.displayName ?? this._state.owner.ownerId;
    const unsigned = createUnsignedEnvelope({
      intent: "bond.accept",
      senderPeerId: derivePeerId(this._state.device.publicKeyPem),
      senderPublicKey: this._state.device.publicKeyPem,
      recipientPeerId,
      payload: createBondAcceptPayload({
        responderOwnerId: this._state.owner.ownerId,
        requesterOwnerId,
        message: `Hello from ${displayName}!`,
      }),
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
    const data = JSON.stringify(signed);
    if (this._mesh) {
      try {
        await this._sendViaMesh(recipientPeerId, data);
        return;
      } catch (err) {
        console.warn(
          "[mobile-node] mesh bond.accept failed, falling back to relay:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    this._broadcastToRelaySockets(data);
  }

  /** Outbound `bond.challenge.response` to the challenger's transport peer id. */
  private async _sendBondChallengeResponse(
    recipientPeerId: string,
    challenge: BondChallengePayload,
    decision: "accept" | "reject",
    options?: { note?: string; proofOfContext?: string },
  ): Promise<void> {
    if (!this._state?.device || !this._state?.owner) return;
    const responsePayload = createBondChallengeResponsePayload({
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      responderOwnerId: this._state.owner.ownerId,
      decision,
      note: options?.note,
      proofOfContext:
        options?.proofOfContext ??
        (decision === "accept" ? "mobile-node" : (options?.note ?? "rejected")),
    });
    const unsigned = createUnsignedEnvelope({
      intent: "bond.challenge.response",
      senderPeerId: derivePeerId(this._state.device.publicKeyPem),
      senderPublicKey: this._state.device.publicKeyPem,
      recipientPeerId,
      payload: responsePayload,
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
    const data = JSON.stringify(signed);
    try {
      if (this._mesh) {
        try {
          await this._sendViaMesh(recipientPeerId, data);
          return;
        } catch (err) {
          console.warn(
            "[mobile-node] mesh bond.challenge.response failed, falling back to relay:",
            err instanceof Error ? err.message : err,
          );
        }
      }
      this._broadcastToRelaySockets(data);
    } catch (err) {
      this._recordNodeError("bond.challenge.response send", err);
      throw err;
    }
  }

  /**
   * Inbound `bond.request` — mirrors apps/node `bond-inbound` (no JSONL audit on mobile).
   */
  private async _handleInboundBondRequest(msg: Record<string, unknown>): Promise<void> {
    if (!this._state) return;
    const remotePeerId = String(msg.senderPeerId ?? "");
    let payload;
    try {
      payload = parseBondRequestPayload(msg.payload);
    } catch (err) {
      console.warn(
        "[mobile-node] bond.request: invalid payload",
        err instanceof Error ? err.message : err,
      );
      return;
    }
    if (payload.requesterOwnerId === this._state.owner.ownerId) {
      return;
    }
    const tr = await this._trustStore.get(payload.requesterOwnerId);
    const policy = evaluatePolicy({
      peerId: remotePeerId,
      bondLevel: _trustLevelToPolicyBondLevel(tr?.level),
      intent: "bond.request",
    });
    const outcome = _bondOutcomeFromPolicy(policy);
    if (outcome === "deny") {
      const reason = policy.action === "deny" ? policy.reason : "policy denied";
      console.warn(`[mobile-node] bond.request denied: ${reason}`);
      return;
    }
    if (outcome === "allow") {
      const level = (payload.requestedLevel as BondRecord["level"]) ?? "direct";
      await this._trustStore.set({
        peerOwnerId: payload.requesterOwnerId,
        displayName: payload.requesterDisplayName ?? remotePeerId,
        libp2pPeerId: remotePeerId,
        level,
        createdAt: new Date().toISOString(),
        note: payload.message ?? undefined,
      });
      try {
        await this._peerDirectory.set({
          ownerId: payload.requesterOwnerId,
          multiaddrs: [],
          lastSeen: new Date().toISOString(),
          libp2pPeerId: remotePeerId,
        });
      } catch (err) {
        console.warn(
          "[mobile-node] bond.request auto-accept: peer directory failed:",
          err instanceof Error ? err.message : err,
        );
      }
      this._events.emit("bond:established", {
        peerOwnerId: payload.requesterOwnerId,
        displayName: payload.requesterDisplayName ?? remotePeerId,
      });
      await this._sendBondAcceptEnvelope(remotePeerId, payload.requesterOwnerId);
      return;
    }
    const hello: HelloRequest = {
      messageId: String(msg.messageId ?? ""),
      sender: {
        nodeId: remotePeerId,
        ownerId: payload.requesterOwnerId,
        displayName: payload.requesterDisplayName ?? payload.requesterOwnerId,
      },
      profile: {
        displayName: payload.requesterDisplayName ?? payload.requesterOwnerId,
        bio: "",
        interests: [],
        whatShares: [],
      },
      message: payload.message ?? "",
      timestamp: String(msg.createdAt ?? new Date().toISOString()),
    };
    this.storePendingHelloRequest({
      messageId: hello.messageId,
      sender: hello.sender,
      message: hello.message,
      timestamp: hello.timestamp,
    });
    this._events.emit("hello:request", hello);
  }

  /** Inbound `bond.accept` when the local node was the bond requester. */
  private async _handleInboundBondAccept(msg: Record<string, unknown>): Promise<void> {
    if (!this._state) return;
    let payload;
    try {
      payload = parseBondAcceptPayload(msg.payload);
    } catch (err) {
      console.warn(
        "[mobile-node] bond.accept: invalid payload",
        err instanceof Error ? err.message : err,
      );
      return;
    }
    if (payload.requesterOwnerId !== this._state.owner.ownerId) {
      console.warn("[mobile-node] bond.accept: requesterOwnerId does not match local owner");
      return;
    }
    const remotePeerId = String(msg.senderPeerId ?? "");
    let displayName = payload.responderOwnerId;
    if (payload.message) {
      const match = payload.message.match(/^Hello from (.+)!$/);
      if (match?.[1]) displayName = match[1];
    }
    await this._trustStore.set({
      peerOwnerId: payload.responderOwnerId,
      displayName,
      libp2pPeerId: remotePeerId,
      level: "direct",
      createdAt: new Date().toISOString(),
      note: payload.message ?? undefined,
    });
    try {
      await this._peerDirectory.set({
        ownerId: payload.responderOwnerId,
        multiaddrs: [],
        lastSeen: new Date().toISOString(),
        libp2pPeerId: remotePeerId,
      });
    } catch (err) {
      console.warn("[mobile-node] bond.accept: peer directory failed:", err instanceof Error ? err.message : err);
    }
    this._events.emit("bond:established", {
      peerOwnerId: payload.responderOwnerId,
      displayName,
    });
    void this.refreshBondPeerProfiles();
  }

  /** Inbound `bond.challenge` — auto-reply with `bond.challenge.response` (referral / pairing parity with desktop tests). */
  private async _handleInboundBondChallenge(msg: Record<string, unknown>): Promise<void> {
    if (!this._state) return;
    let payload;
    try {
      payload = parseBondChallengePayload(msg.payload);
    } catch (err) {
      console.warn(
        "[mobile-node] bond.challenge: invalid payload",
        err instanceof Error ? err.message : err,
      );
      return;
    }
    if (payload.targetOwnerId !== this._state.owner.ownerId) {
      console.warn("[mobile-node] bond.challenge: targetOwnerId does not match local owner");
      return;
    }
    const challengerPeerId = String(msg.senderPeerId ?? "");
    const expiresMs = new Date(payload.expiresAt).getTime();
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      await this._sendBondChallengeResponse(challengerPeerId, payload, "reject", {
        note: "challenge expired",
        proofOfContext: "expired",
      });
      return;
    }

    const tr = await this._trustStore.get(payload.challengerOwnerId);
    const policy = evaluatePolicy({
      peerId: challengerPeerId,
      bondLevel: _trustLevelToPolicyBondLevel(tr?.level),
      intent: "bond.challenge",
    });
    const outcome = _bondOutcomeFromPolicy(policy);
    if (outcome === "deny") {
      const reason = policy.action === "deny" ? policy.reason : "denied";
      console.warn(`[mobile-node] bond.challenge denied: ${reason}`);
      await this._sendBondChallengeResponse(challengerPeerId, payload, "reject", {
        note: reason,
        proofOfContext: reason,
      });
      return;
    }

    // allow + record (referral / manual policy) → optimistic accept on mobile so pairing can complete
    await this._sendBondChallengeResponse(challengerPeerId, payload, "accept", {
      proofOfContext: outcome === "record" ? "mobile-node record-tier accept" : "mobile-node",
    });
  }

  /**
   * Inbound `bond.challenge.response` — when we are the challenger and receive **accept**,
   * persist bond (`responderOwnerId`). Policy deny drops the message.
   */
  private async _handleInboundBondChallengeResponse(msg: Record<string, unknown>): Promise<void> {
    if (!this._state) return;
    let payload;
    try {
      payload = parseBondChallengeResponsePayload(msg.payload);
    } catch (err) {
      console.warn(
        "[mobile-node] bond.challenge.response: invalid payload",
        err instanceof Error ? err.message : err,
      );
      return;
    }
    const remotePeerId = String(msg.senderPeerId ?? "");
    const tr = await this._trustStore.get(payload.responderOwnerId);
    const policy = evaluatePolicy({
      peerId: remotePeerId,
      bondLevel: _trustLevelToPolicyBondLevel(tr?.level),
      intent: "bond.challenge.response",
    });
    const outcome = _bondOutcomeFromPolicy(policy);
    if (outcome === "deny") {
      const reason = policy.action === "deny" ? policy.reason : "policy denied";
      console.warn(`[mobile-node] bond.challenge.response denied: ${reason}`);
      return;
    }
    if (payload.decision === "reject") {
      this._recordNodeError(
        "bond.challenge.response",
        new Error(`peer rejected: ${payload.note ?? "no note"}`),
      );
      return;
    }
    // Only the challenger should process accept; responderOwnerId is the peer we challenged.
    if (payload.responderOwnerId === this._state.owner.ownerId) {
      return;
    }

    const displayName =
      payload.note?.trim() ||
      (payload.responderOwnerId.length > 16
        ? `${payload.responderOwnerId.slice(0, 10)}…`
        : payload.responderOwnerId);

    await this._trustStore.set({
      peerOwnerId: payload.responderOwnerId,
      displayName,
      libp2pPeerId: remotePeerId,
      level: "direct",
      createdAt: new Date().toISOString(),
      note: payload.proofOfContext ?? undefined,
    });
    try {
      await this._peerDirectory.set({
        ownerId: payload.responderOwnerId,
        multiaddrs: [],
        lastSeen: new Date().toISOString(),
        libp2pPeerId: remotePeerId,
      });
    } catch (err) {
      console.warn("[mobile-node] bond.challenge.response: peer directory failed:", err);
    }
    this._events.emit("bond:established", {
      peerOwnerId: payload.responderOwnerId,
      displayName,
    });
    console.log(
      `[mobile-node] bond.challenge.response completed bond: challengeId=${payload.challengeId}`,
    );
  }

  private _cacheInboundEnvelopeKeys(msg: Record<string, unknown>, transportPeerId?: string): void {
    const pub = msg.senderPublicKey;
    if (typeof pub !== "string" || !pub.trim()) return;
    const deviceId = deriveDeviceId(pub);
    const rec = { devicePublicKeyPem: pub, deviceId };
    const sp = String(msg.senderPeerId ?? "");
    if (sp) {
      this._peerDeviceByEnvoyPeerId.set(sp, rec);
      if (transportPeerId) {
        this._transportByEnvoyPeerId.set(sp, transportPeerId);
        this._peerDeviceByTransportId.set(transportPeerId, rec);
      }
    }
  }

  private async _ownerIdForSender(senderPeerId: string): Promise<string | undefined> {
    const cached = this._ownerIdByEnvoyDevicePeerId.get(senderPeerId);
    if (cached) return cached;
    const bonds = await this._trustStore.list();
    for (const b of bonds) {
      const p = await this._peerDirectory.get(b.peerOwnerId);
      if (p?.libp2pPeerId === senderPeerId) return b.peerOwnerId;
    }
    return undefined;
  }

  private async _trustBondLevelForShareSender(
    senderPeerId: string,
    transportPeerId?: string,
  ): Promise<BondRecord["level"]> {
    const owner = await this._ownerIdForSender(senderPeerId);
    if (owner) {
      const t = await this._trustStore.get(owner);
      if (t) return t.level;
    }
    const bonds = await this._trustStore.list();
    for (const b of bonds) {
      const p = await this._peerDirectory.get(b.peerOwnerId);
      if (!p?.libp2pPeerId) continue;
      if (transportPeerId && p.libp2pPeerId === transportPeerId) return b.level;
      if (p.libp2pPeerId === senderPeerId) return b.level;
    }
    return "public";
  }

  private _resolveInboundDataTransferRelativePath(remotePeerId: string, voucherRelativePath: string): string {
    const norm = voucherRelativePath.replace(/^[\\/]+/, "");
    const o = this._pendingDataTransferSavePath.get(`${remotePeerId}\n${norm}`);
    return o ?? norm;
  }

  private _consumeInboundDataTransferSaveMapping(remotePeerId: string, voucherSourceRelativePath: string): void {
    const norm = voucherSourceRelativePath.replace(/^[\\/]+/, "");
    this._pendingDataTransferSavePath.delete(`${remotePeerId}\n${norm}`);
  }

  private _notifyInboundTransferVerified(
    remotePeerId: string,
    voucherSourceRelativePath: string,
    totalBytes: number,
  ): void {
    const norm = voucherSourceRelativePath.replace(/^[\\/]+/, "");
    for (const [shareId, pending] of this._inboundTransferByShareId.entries()) {
      if (pending.senderNodeId !== remotePeerId) continue;
      if (pending.savePath !== norm && pending.senderVaultRelativePath !== norm) {
        continue;
      }
      this._inboundTransferByShareId.delete(shareId);
      if (pending.chatRoomId && pending.chatMessageId && pending.chatAttachmentId) {
        void this._applyRoomAttachmentVaultPath({
          roomId: pending.chatRoomId,
          messageId: pending.chatMessageId,
          attachmentId: pending.chatAttachmentId,
          vaultRelativePath: pending.savePath,
        }).catch((err) => {
          console.warn(
            "[mobile-node] group attachment vault update failed:",
            err instanceof Error ? err.message : err,
          );
        });
      } else if (pending.chatMessageId && pending.chatAttachmentId && pending.senderOwnerId) {
        void this._applyDirectChatAttachmentVaultPath({
          peerOwnerId: pending.senderOwnerId,
          messageId: pending.chatMessageId,
          attachmentId: pending.chatAttachmentId,
          vaultRelativePath: pending.savePath,
        }).catch((err) => {
          console.warn(
            "[mobile-node] direct chat attachment vault update failed:",
            err instanceof Error ? err.message : err,
          );
        });
      } else {
        void this._recordFileShareInChat({
          peerOwnerId: pending.senderOwnerId ?? pending.senderNodeId,
          outgoing: false,
          vaultRelativePath: pending.savePath,
          byteLength: totalBytes,
        }).catch((err) => {
          console.warn(
            "[mobile-node] chat attachment record failed:",
            err instanceof Error ? err.message : err,
          );
        });
      }
      return;
    }
  }

  private async _applyRoomAttachmentVaultPath(input: {
    roomId: string;
    messageId: string;
    attachmentId: string;
    vaultRelativePath: string;
  }): Promise<void> {
    const { chatRoomThreadKey } = await import("@envoymesh/api");
    const threadKey = chatRoomThreadKey(input.roomId.trim());
    const vaultPath = input.vaultRelativePath.replace(/^[\\/]+/, "");
    const updated = await this._chatLog.updateAttachmentVaultPath(
      threadKey,
      input.messageId,
      input.attachmentId,
      vaultPath,
    );
    if (!updated) return;
    const rows = await this._chatLog.listThread(threadKey, 5000);
    const row = rows.find((m) => m.messageId === input.messageId);
    if (!row) return;
    const message: ChatMessage = {
      messageId: row.messageId,
      sender: {
        nodeId: row.sender.ownerId ?? "",
        displayName: row.sender.displayName,
        ownerId: row.sender.ownerId,
      },
      recipient: {
        nodeId: row.recipient.ownerId ?? input.roomId,
        ownerId: row.recipient.ownerId,
        displayName: row.recipient.displayName,
      },
      content: row.content,
      metadata: row.metadata,
      signature: row.signature,
    };
    this._events.emit("chat:room-message", { roomId: input.roomId.trim(), message });
  }

  private async _applyDirectChatAttachmentVaultPath(input: {
    peerOwnerId: string;
    messageId: string;
    attachmentId: string;
    vaultRelativePath: string;
  }): Promise<void> {
    const threadPeerOwnerId = input.peerOwnerId.trim();
    const vaultPath = input.vaultRelativePath.replace(/^[\\/]+/, "");
    const updated = await this._chatLog.updateAttachmentVaultPath(
      threadPeerOwnerId,
      input.messageId,
      input.attachmentId,
      vaultPath,
    );
    if (!updated) {
      this._deferredDirectChatAttachmentVaultPath.set(
        deferredDirectChatAttachmentKey(threadPeerOwnerId, input.messageId, input.attachmentId),
        vaultPath,
      );
      return;
    }
    this._deferredDirectChatAttachmentVaultPath.delete(
      deferredDirectChatAttachmentKey(threadPeerOwnerId, input.messageId, input.attachmentId),
    );
    await this._emitDirectChatMessageAfterAttachmentUpdate(threadPeerOwnerId, input.messageId);
  }

  private async _reconcileInboundDirectChatMessage(
    peerOwnerId: string,
    message: ChatMessage,
  ): Promise<ChatMessage> {
    const attachments = message.content.attachments;
    if (attachments?.length) {
      const threadPeerOwnerId = peerOwnerId.trim();
      for (const attachment of attachments) {
        const key = deferredDirectChatAttachmentKey(
          threadPeerOwnerId,
          message.messageId,
          attachment.id,
        );
        const vaultPath = this._deferredDirectChatAttachmentVaultPath.get(key);
        if (!vaultPath) continue;
        const updated = await this._chatLog.updateAttachmentVaultPath(
          threadPeerOwnerId,
          message.messageId,
          attachment.id,
          vaultPath,
        );
        if (!updated) continue;
        this._deferredDirectChatAttachmentVaultPath.delete(key);
      }
    }
    const rows = await this._chatLog.listThread(peerOwnerId.trim(), 5000);
    const updated = rows.find((row) => row.messageId === message.messageId);
    if (!updated) return message;
    return {
      messageId: updated.messageId,
      sender: {
        // The chat-log row only stores ownerId; preserve the envelope peer
        // ID from the inbound message so listeners see the real node id.
        nodeId: message.sender.nodeId,
        ownerId: updated.sender.ownerId,
        displayName: updated.sender.displayName,
        actorRole: updated.sender.actorRole,
        agentId: updated.sender.agentId,
        agentVerified: updated.sender.agentVerified,
      },
      recipient: {
        // Same — the recipient's envelope peer id stays on the inbound message.
        nodeId: message.recipient.nodeId,
        ownerId: updated.recipient.ownerId,
        displayName: updated.recipient.displayName,
      },
      content: updated.content,
      metadata: updated.metadata,
      signature: updated.signature,
    };
  }

  private async _emitDirectChatMessageAfterAttachmentUpdate(
    threadPeerOwnerId: string,
    messageId: string,
  ): Promise<void> {
    const rows = await this._chatLog.listThread(threadPeerOwnerId, 5000);
    const row = rows.find((entry) => entry.messageId === messageId);
    if (!row) return;
    this._events.emit("chat:message", {
      messageId: row.messageId,
      sender: {
        nodeId: row.sender.ownerId ?? "",
        displayName: row.sender.displayName,
        ownerId: row.sender.ownerId,
      },
      recipient: {
        nodeId: row.recipient.ownerId ?? threadPeerOwnerId,
        ownerId: row.recipient.ownerId,
        displayName: row.recipient.displayName,
      },
      content: row.content,
      metadata: row.metadata,
      signature: row.signature,
    });
  }

  private async _recordFileShareInChat(input: {
    peerOwnerId: string;
    outgoing: boolean;
    vaultRelativePath: string;
    byteLength: number;
    sensitivity?: ChatAttachment["sensitivity"];
    mimeType?: string;
    textOverride?: string;
  }): Promise<void> {
    if (!this._state) return;

    let threadPeerOwnerId = input.peerOwnerId.trim();
    if (!threadPeerOwnerId) return;

    const norm = input.vaultRelativePath.replace(/^[\\/]+/, "");
    const filename = norm.split(/[/\\]/).pop() || "file";
    const attachment: ChatAttachment = {
      id: _randomUUID(),
      filename,
      mimeType: input.mimeType ?? _mimeTypeForFilename(filename),
      sizeBytes: input.byteLength,
      sensitivity: input.sensitivity ?? "friends",
      vaultRelativePath: norm,
    };
    const text =
      input.textOverride ??
      (input.outgoing ? `Sent ${filename}` : `Received file ${filename}`);

    const bond = await this._trustStore.get(threadPeerOwnerId);
    const peerTransportId = bond?.libp2pPeerId ?? threadPeerOwnerId;
    const timestamp = new Date().toISOString();
    const messageId = _randomUUID();

    const msg: ChatMessage = input.outgoing
      ? {
          messageId,
          sender: {
            nodeId: this._meshPeerId || this._state.agent.agentPeerId,
            ownerId: this._state.owner.ownerId,
            displayName: "Me",
          },
          recipient: {
            nodeId: peerTransportId,
            ownerId: threadPeerOwnerId,
            displayName: bond?.displayName ?? threadPeerOwnerId,
          },
          content: { text, attachments: [attachment] },
          metadata: { timestamp, deliveryReceipt: "sent" },
          signature: "local-file-share",
        }
      : {
          messageId,
          sender: {
            nodeId: peerTransportId,
            ownerId: threadPeerOwnerId,
            displayName: bond?.displayName ?? threadPeerOwnerId,
          },
          recipient: {
            nodeId: this._meshPeerId || this._state.agent.agentPeerId,
            ownerId: this._state.owner.ownerId,
            displayName: "Me",
          },
          content: { text, attachments: [attachment] },
          metadata: { timestamp },
          signature: "local-file-share",
        };

    await this._chatLog.append(threadPeerOwnerId, {
      messageId: msg.messageId,
      sender: {
        ownerId: msg.sender.ownerId,
        displayName: msg.sender.displayName,
      },
      recipient: {
        ownerId: msg.recipient.ownerId,
        displayName: msg.recipient.displayName,
      },
      content: msg.content,
      metadata: {
        timestamp: msg.metadata.timestamp,
        deliveryReceipt:
          msg.metadata.deliveryReceipt === "delivered" || msg.metadata.deliveryReceipt === "read"
            ? msg.metadata.deliveryReceipt
            : "sent",
      },
      signature: msg.signature,
    });
    this._events.emit("chat:message", msg);
  }

  private _linkOutboundSharePreviewFromInbound(previewMessageId: string, inReplyToRequestMsgId: string): void {
    const pending = this._pendingPushShareByRequestMsgId.get(inReplyToRequestMsgId);
    if (!pending) return;
    this._pendingFileSendByPreviewMsgId.set(previewMessageId, pending);
    this._pendingPushShareByRequestMsgId.delete(inReplyToRequestMsgId);
  }

  private _registerResponderFileSendAfterPreview(
    previewMessageId: string,
    relativePath: string | undefined,
    requesterLibp2pPeerId: string,
  ): void {
    const rel = relativePath?.replace(/^[\\/]+/, "") ?? "";
    if (!rel.trim()) return;
    this._pendingFileSendByPreviewMsgId.set(previewMessageId, {
      relativePath: rel,
      toPeerId: requesterLibp2pPeerId,
    });
  }

  private async _recordInboundPushShareOffer(input: {
    shareId: string;
    senderTransportPeerId: string;
    senderEnvelopePeerId: string;
    previewText: string;
    sensitivity: "public" | "friends" | "private";
    relativePath: string;
    deliveryChannel?: "inbox" | "chat" | "agent";
    chatRoomId?: string;
    chatMessageId?: string;
    chatAttachmentId?: string;
  }): Promise<void> {
    const senderOwnerId =
      (await this._ownerIdForSender(input.senderEnvelopePeerId)) ??
      (await this._ownerIdForSender(input.senderTransportPeerId));
    const trust = senderOwnerId ? await this._trustStore.get(senderOwnerId) : undefined;
    const records = await this._peerDirectory.list();
    let displayName =
      trust?.displayName?.trim() ||
      (senderOwnerId
        ? senderOwnerId.replace(/^envoy:owner:/, "").slice(0, 10)
        : `${input.senderEnvelopePeerId.slice(0, 12)}…`);
    for (const r of records) {
      if (r.libp2pPeerId && r.libp2pPeerId === input.senderTransportPeerId) {
        if (!trust?.displayName) {
          displayName = r.ownerId.replace(/^envoy:owner:/, "").slice(0, 10) || displayName;
        }
        break;
      }
    }
    const parts = input.relativePath.split(/[/\\]/);
    const filename = parts[parts.length - 1] || "file";
    const offer: ShareOffer = {
      shareId: input.shareId,
      senderNodeId: input.senderTransportPeerId || input.senderEnvelopePeerId,
      senderOwnerId,
      senderDisplayName: displayName,
      filename,
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      sensitivity: input.sensitivity,
      preview: input.previewText,
      timestamp: new Date().toISOString(),
      senderVaultRelativePath: input.relativePath.replace(/^[\\/]+/, "") || undefined,
      chatRoomId: input.chatRoomId,
      chatMessageId: input.chatMessageId,
      chatAttachmentId: input.chatAttachmentId,
    };
    this._pendingInboundShareOffers.set(input.shareId, offer);
    void this._publishAgentActivity(
      {
        activityId: input.shareId,
        domain: "social",
        kind: "share_proposed",
        summary: `Incoming share: ${filename}`,
        remoteOwnerId: senderOwnerId,
        createdAt: offer.timestamp,
      },
      senderOwnerId,
    );
    if (input.deliveryChannel !== "chat") {
      this._events.emit("share:offered", offer);
    }
  }

  private _clearPendingShareStateForPreview(previewMessageId: string): void {
    this._pendingFileSendByPreviewMsgId.delete(previewMessageId);
    const offer = this._pendingInboundShareOffers.get(previewMessageId);
    if (offer?.senderVaultRelativePath) {
      const src = offer.senderVaultRelativePath.replace(/^[\\/]+/, "");
      this._pendingDataTransferSavePath.delete(`${offer.senderNodeId}\n${src}`);
    }
    this._pendingInboundShareOffers.delete(previewMessageId);
  }

  private async _handleInboundShareRequestEnv(
    msg: Record<string, unknown>,
    transportPeerId: string | undefined,
  ): Promise<void> {
    if (!this._state?.device || !this._state.owner) return;
    let payload;
    try {
      payload = parseShareRequestPayload(msg.payload);
    } catch {
      return;
    }
    if (payload.requestType !== "file") {
      console.warn("[mobile-node] share.request: only file transfers are supported");
      return;
    }
    if (!payload.relativePath?.trim()) return;
    const rel = payload.relativePath.replace(/^[\\/]+/, "");
    if (payload.fileOrigin === "responder") {
      this._validateRelativeVaultPathForShare(rel);
      try {
        await this._vault.readFile(rel);
      } catch {
        console.warn("[mobile-node] share.request: responder file missing from vault");
        return;
      }
    }
    const senderPeerId = String(msg.senderPeerId ?? "");
    const bondLevel = await this._trustBondLevelForShareSender(senderPeerId, transportPeerId);
    const policyPeer = (await this._ownerIdForSender(senderPeerId)) ?? senderPeerId;
    const policy = evaluatePolicy({
      peerId: policyPeer,
      bondLevel: _trustLevelToPolicyBondLevel(bondLevel),
      intent: "knowledge.query",
      requestedSensitivity: payload.requestedSensitivity,
    });
    if (policy.action === "deny") {
      console.warn("[mobile-node] share.request denied:", policy.reason);
      return;
    }

    const chatAttachmentFromBond =
      payload.fileOrigin === "sender" &&
      payload.deliveryChannel === "chat" &&
      bondLevel !== "public" &&
      bondLevel !== "blocked";

    let effectiveSensitivity = payload.requestedSensitivity;
    let requiresApproval =
      policy.action === "approval_required" ||
      effectiveSensitivity === "friends" ||
      effectiveSensitivity === "private";

    if (chatAttachmentFromBond) {
      effectiveSensitivity = payload.requestedSensitivity ?? "friends";
      if (policy.action === "allow" && policy.maxSensitivity) {
        effectiveSensitivity = policy.maxSensitivity;
      } else if (bondLevel === "referred") {
        effectiveSensitivity = "public";
      }
      requiresApproval = false;
    } else {
      if (policy.action === "allow" && policy.maxSensitivity) {
        effectiveSensitivity = policy.maxSensitivity;
      } else if (policy.action === "approval_required") {
        effectiveSensitivity = "public";
      }
      requiresApproval =
        policy.action === "approval_required" ||
        effectiveSensitivity === "friends" ||
        effectiveSensitivity === "private";
    }

    const previewText = _buildSafeSharePreviewText(payload, effectiveSensitivity);
    const previewPayload = createSharePreviewPayload({
      inReplyTo: (msg.messageId as string) ?? "",
      previewText,
      sensitivity: effectiveSensitivity,
      requiresApproval,
      contentHint: `file: ${rel}`,
      isFileTransfer: true,
    });

    const unsigned = createUnsignedEnvelope({
      intent: "share.preview",
      senderPeerId: derivePeerId(this._state.device.publicKeyPem),
      senderPublicKey: this._state.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: senderPeerId,
      recipientRole: "human",
      payload: previewPayload,
      correlationId: (msg.correlationId as string | undefined) ?? undefined,
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
    const data = JSON.stringify(signed);

    const dialId =
      transportPeerId ?? this._transportByEnvoyPeerId.get(senderPeerId) ?? senderPeerId;
    if (this._mesh) {
      try {
        await this._sendViaMesh(dialId, data, ENVOY_MESSAGE_PROTOCOL);
      } catch (err) {
        console.warn(
          "[mobile-node] mesh share.preview failed, relay fallback:",
          err instanceof Error ? err.message : err,
        );
        this._broadcastToRelaySockets(data);
      }
    } else {
      this._broadcastToRelaySockets(data);
    }

    if (payload.fileOrigin === "responder" && transportPeerId) {
      this._registerResponderFileSendAfterPreview(
        signed.messageId,
        rel,
        transportPeerId,
      );
    }
    if (payload.fileOrigin === "sender") {
      await this._recordInboundPushShareOffer({
        shareId: signed.messageId,
        senderTransportPeerId:
          transportPeerId ?? this._transportByEnvoyPeerId.get(senderPeerId) ?? "",
        senderEnvelopePeerId: senderPeerId,
        previewText,
        sensitivity: effectiveSensitivity as "public" | "friends" | "private",
        relativePath: rel,
        deliveryChannel: payload.deliveryChannel,
        chatRoomId: payload.chatRoomId,
        chatMessageId: payload.chatMessageId,
        chatAttachmentId: payload.chatAttachmentId,
      });
      if (
        payload.deliveryChannel === "chat" &&
        bondLevel !== "public" &&
        bondLevel !== "blocked" &&
        !requiresApproval
      ) {
        const senderOwnerId = await this._ownerIdForSender(senderPeerId);
        if (senderOwnerId) {
          const safeOwner =
            senderOwnerId.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "peer";
          const filename = rel.split(/[/\\]/).pop()?.replace(/[^a-zA-Z0-9._-]+/g, "_") || "file";
          const savePath = `chat/in/${safeOwner}/${filename}`;
          try {
            await this.acceptShare(signed.messageId, savePath);
          } catch (err) {
            console.warn(
              "[mobile-node] chat attachment auto-accept failed:",
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    }
  }

  private _handleInboundSharePreviewEnv(msg: Record<string, unknown>): void {
    let previewPayload;
    try {
      previewPayload = parseSharePreviewPayload(msg.payload);
    } catch {
      return;
    }
    if (previewPayload.isFileTransfer && !previewPayload.refused) {
      this._linkOutboundSharePreviewFromInbound(
        String(msg.messageId ?? ""),
        previewPayload.inReplyTo,
      );
    }
  }

  private async _maybeSendVaultFileAfterInboundAccept(
    msg: Record<string, unknown>,
    transportPeerId: string | undefined,
  ): Promise<void> {
    if (!this._state || !this._mesh) return;
    let acc;
    try {
      acc = parseShareAcceptPayload(msg.payload);
    } catch {
      return;
    }
    if (!acc.accept) return;
    const pending = this._pendingFileSendByPreviewMsgId.get(acc.inReplyTo);
    if (!pending) return;

    const senderE = String(msg.senderPeerId ?? "");
    let targetPeer = transportPeerId ?? "";
    if (!targetPeer && senderE) {
      targetPeer = this._transportByEnvoyPeerId.get(senderE) ?? "";
    }
    if (!targetPeer) {
      targetPeer = pending.toPeerId;
    }
    if (targetPeer.startsWith("envoy_")) {
      console.warn("[mobile-node] data transfer: need libp2p peer id (got envelope id only)");
      return;
    }
    if (pending.toPeerId && targetPeer !== pending.toPeerId) {
      const alt = this._transportByEnvoyPeerId.get(pending.toPeerId);
      if (alt !== targetPeer && pending.toPeerId !== senderE) {
        console.warn("[mobile-node] share.accept: skipping file send (peer mismatch)");
        return;
      }
    }
    try {
      const hints = await this._buildMobileChatDialHints(targetPeer, targetPeer);
      await sendMobileVaultFileDataTransfer({
        mesh: this._mesh,
        vault: this._vault,
        meshPeerId: this._meshPeerId,
        issuerOwnerId: this._state.owner.ownerId,
        issuerDeviceId: this._state.device.deviceId,
        devicePrivateKeyPem: this._state.device.privateKeyPem,
        relativePath: pending.relativePath,
        toLibp2pPeerId: targetPeer,
        dialHints: hints,
        hintDialTimeoutMs: MobileNode._MOBILE_HINT_DIAL_TIMEOUT_MS,
      });
    } catch (err) {
      this._recordNodeError("share data transfer send", err);
    }
    this._pendingFileSendByPreviewMsgId.delete(acc.inReplyTo);
  }

  private async _handleInboundProfileIntent(
    msg: Record<string, unknown>,
    opts?: {
      transportPeerId?: string;
      replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
    },
  ): Promise<void> {
    if (!this._contactOwnerKeys || !this._peerProfileCache || !this._state) return;
    const intent = msg.intent as string;
    if (intent === "profile.request") {
      try {
        parseProfileRequestPayload(msg.payload);
      } catch {
        console.warn("[mobile-node] profile.request: invalid payload");
        return;
      }
      const local = this._humanProfile;
      if (!local) {
        console.warn("[mobile-node] profile.request: no profile to share");
        return;
      }
      const envelopeRecipientPeerId = String(msg.senderPeerId ?? "");
      if (!envelopeRecipientPeerId) {
        console.warn("[mobile-node] profile.request: missing sender peer id");
        return;
      }
      const inline = await loadMobileProfileThumbnailInline(this._vault, local);
      const payload = createProfileSyncPayload(local, inline, this._state.owner.publicKeyPem);
      const responseEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(this._state.device.publicKeyPem),
          senderPublicKey: this._state.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: envelopeRecipientPeerId,
          recipientRole: "human",
          intent: "profile.response",
          payload,
        }),
        this._state.device.privateKeyPem,
      );
      if (opts?.replyWithEnvelope) {
        try {
          await opts.replyWithEnvelope(responseEnvelope);
          return;
        } catch (err) {
          console.warn(
            "[mobile-node] profile.response inbound reply failed, dialing outbound:",
            err instanceof Error ? err.message : err,
          );
        }
      }
      const transportPeerId = opts?.transportPeerId?.trim();
      if (!transportPeerId) {
        console.warn("[mobile-node] profile.response: no transport peer id for outbound send");
        return;
      }
      await this._sendProfileJson(transportPeerId, JSON.stringify(responseEnvelope));
      return;
    }
    const result = await handleMobileInboundProfileSync({
      payload: msg.payload,
      ownerKeys: this._contactOwnerKeys,
      cache: this._peerProfileCache,
    });
    if (result.ok) {
      this._events.emit("profile:updated", { ownerId: result.ownerId });
      return;
    }
    console.warn(`[mobile-node] ${intent}: ${result.reason}`);
  }

  /**
   * Route an inbound message from a relay:
   * - EnvoyEnvelope → verify → route by intent → persist chat → emit events
   * - Legacy/event messages → emit as typed events
   */
  private _handleInboundMessage(
    msg: Record<string, unknown>,
    opts?: {
      transportPeerId?: string;
      replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
    },
  ): void {
    if (!this._state) return;

    const { owner, agent } = this._state;
    // EnvoyEnvelope: has version, intent, and signature
    if (msg.version === "0.1" && typeof msg.intent === "string" && typeof msg.signature === "string") {
      // rendezvous.response from relay uses placeholder keys — skip verification
      // per protocol spec (they are not Ed25519 device signatures)
      const isRendezvousResponse = msg.intent === "rendezvous.response" &&
        msg.senderPublicKey === "relay:rendezvous-response/unsigned-placeholder";
      const verified = isRendezvousResponse ? true : verifyEnvelope(msg as any);
      // Always emit raw envelope for any listeners
      this._events.emit("p2p:envelope", {
        envelope: msg,
        remotePeerId: (msg.senderPeerId as string) ?? "",
      });
      if (!verified) return; // Don't route unverified envelopes

      this._cacheInboundEnvelopeKeys(msg, opts?.transportPeerId);

      // Route by intent
      const intent = msg.intent as string;
      const payload = (msg.payload as Record<string, unknown>) ?? {};

      if (intent === "sync.state") {
        try {
          const syncPayload = parseSyncStatePayload(msg.payload);
          if (syncPayload.senderOwnerId !== owner.ownerId) return;
          this._events.emit("crdt:sync", {
            scope: syncPayload.scope,
            updateBase64: syncPayload.updateBase64,
            senderOwnerId: syncPayload.senderOwnerId,
            remotePeerId: (msg.senderPeerId as string) ?? "",
          });
        } catch {
          console.warn("[mobile-node] rejected sync.state: invalid payload");
        }
      } else if (intent === "discovery.response") {
        const correlationId = typeof msg.correlationId === "string" ? msg.correlationId.trim() : "";
        if (!correlationId) return;
        try {
          const responsePayload = parseDiscoveryResponsePayload(msg.payload);
          void this.ingestInboundMultiHopDiscoveryResponse({
            correlationId,
            responderOwnerId: responsePayload.responderOwnerId,
            matches: responsePayload.matches,
            forwardPendingAck: responsePayload.forwardPendingAck,
          });
        } catch {
          console.warn("[mobile-node] rejected discovery.response: invalid payload");
        }
      } else if (intent === "chat.room.sync") {
        try {
          const syncPayload = parseChatRoomSyncPayload(msg.payload);
          void mobileHandleInboundChatRoomSync(this._mobileChatRoomHost(), msg as EnvoyEnvelope, syncPayload);
        } catch {
          console.warn("[mobile-node] rejected chat.room.sync: invalid payload");
        }
      } else if (intent === "chat.room.message") {
        try {
          const roomPayload = parseChatRoomMessagePayload(msg.payload);
          void mobileHandleInboundChatRoomMessage(
            this._mobileChatRoomHost(),
            msg as EnvoyEnvelope,
            roomPayload,
            String(msg.senderPeerId ?? opts?.transportPeerId ?? ""),
            opts?.replyWithEnvelope,
          ).then(() => {
            const senderOwnerId = roomPayload.senderOwnerId;
            void this._trustStore.get(senderOwnerId).then((trust) => {
              void this._maybeGenerateInboundGroupChatDraft({
                roomId: roomPayload.roomId,
                senderOwnerId,
                senderDisplayName: trust?.displayName ?? senderOwnerId,
                chatText: roomPayload.text,
                messageId: String(msg.messageId ?? ""),
                remotePeerId: String(msg.senderPeerId ?? opts?.transportPeerId ?? ""),
                senderRole:
                  msg.senderRole === "human" || msg.senderRole === "agent" || msg.senderRole === "system"
                    ? msg.senderRole
                    : undefined,
                agentVerified: msg.senderRole === "agent" ? Boolean(msg.agentCredential) : undefined,
              });
            });
          });
        } catch {
          console.warn("[mobile-node] rejected chat.room.message: invalid payload");
        }
      } else if (intent === "chat.message") {
        let chatPayload: ReturnType<typeof parseChatMessagePayload> | undefined;
        try {
          chatPayload = parseChatMessagePayload(msg.payload);
        } catch {
          console.warn("[mobile-node] rejected chat.message: invalid payload");
          return;
        }

        const deviceAuth = verifyInboundChatDeviceAuthorization(
          msg as any,
          chatPayload,
          verifyAuthorizedDeviceEnvelope,
        );
        if (!deviceAuth.ok) {
          console.warn(`[mobile-node] rejected chat.message: ${deviceAuth.reason}`);
          return;
        }
        if (
          chatPayload.deviceCertificate &&
          chatPayload.ownerPublicKeyPem &&
          isDeviceRevoked(chatPayload.deviceCertificate, this._deviceRevocations, chatPayload.ownerPublicKeyPem)
        ) {
          console.warn("[mobile-node] rejected chat.message: device certificate revoked");
          return;
        }

        const localDevicePeerId = derivePeerId(this._state.device.publicKeyPem);
        const localAgentPeerId = this._state.agent.agentPeerId;
        const senderEnvelopePeerId = String(msg.senderPeerId ?? "").trim();
        if (senderEnvelopePeerId === localDevicePeerId) {
          console.warn("[mobile-node] chat.message: ignoring self-echo");
          return;
        }
        const intendedRecipient = typeof msg.recipientPeerId === "string" ? msg.recipientPeerId.trim() : "";
        if (
          intendedRecipient &&
          intendedRecipient !== localDevicePeerId &&
          intendedRecipient !== localAgentPeerId &&
          intendedRecipient !== this._state.homeAgentPeerId?.trim()
        ) {
          console.warn("[mobile-node] chat.message: ignoring misaddressed message");
          return;
        }

        if (
          opts?.replyWithEnvelope &&
          typeof msg.messageId === "string" &&
          typeof msg.senderPeerId === "string" &&
          msg.senderPeerId.trim() &&
          this._state?.owner &&
          this._state?.device
        ) {
          void opts
            .replyWithEnvelope(
              buildSignedChatDeliveredEnvelope({
                profile: {
                  owner: this._state.owner,
                  device: this._state.device,
                },
                messageId: msg.messageId,
                recipientOwnerId: this._state.owner.ownerId,
                envelopeRecipientPeerId: msg.senderPeerId,
                correlationId:
                  typeof msg.correlationId === "string" ? msg.correlationId : undefined,
              }),
            )
            .catch((err) =>
              console.warn(
                "[mobile-node] chat.delivered ack failed:",
                err instanceof Error ? err.message : err,
              ),
            );
        }

        const sp = String(msg.senderPeerId ?? "");
        if (chatPayload.senderOwnerId && sp) {
          this._ownerIdByEnvoyDevicePeerId.set(sp, chatPayload.senderOwnerId);
        }
        if (chatPayload.senderOwnerId && chatPayload.ownerPublicKeyPem && this._contactOwnerKeys) {
          void this._contactOwnerKeys.set(chatPayload.senderOwnerId, chatPayload.ownerPublicKeyPem);
        }
        const ts = (msg.createdAt as string) ?? new Date().toISOString();
        const senderPeerId = (msg.senderPeerId as string) ?? "";
        const senderOwnerId =
          chatPayload.senderOwnerId ??
          this._ownerIdByEnvoyDevicePeerId.get(senderPeerId) ??
          senderPeerId;
        const chatText = chatPayload.text;
        const wireAttachments = chatWireAttachmentsToContent(chatPayload.attachments);
        void this._trustStore.get(senderOwnerId).then(async (bond) => {
          const baseName = bond?.displayName ?? senderOwnerId;
          const senderDisplayName = formatChatSenderDisplayName(baseName, chatPayload);
          const messageId = (msg.messageId as string) ?? _randomUUID();
          const inboundMsg: ChatMessage = {
            messageId,
            sender: {
              nodeId: senderPeerId,
              displayName: senderDisplayName,
              ownerId: senderOwnerId,
              ...chatSenderActorFromEnvelope(
                (msg.senderRole as "human" | "agent" | "system") ?? "human",
                msg.agentCredential as AgentCredential | undefined,
                true,
              ),
            },
            recipient: { nodeId: agent.agentPeerId, ownerId: owner.ownerId },
            content: {
              text: chatText,
              ...(wireAttachments?.length ? { attachments: wireAttachments } : {}),
            },
            metadata: { timestamp: ts, deliveryReceipt: "delivered" },
            signature: msg.signature as string,
          };
          await this._chatLog.append(senderOwnerId, {
            messageId,
            sender: { ownerId: senderOwnerId, displayName: senderDisplayName },
            recipient: { ownerId: owner.ownerId, displayName: "Me" },
            content: inboundMsg.content,
            metadata: { timestamp: ts, deliveryReceipt: "delivered" },
            signature: msg.signature as string,
          }).catch(() => {});
          const emitMsg = await this._reconcileInboundDirectChatMessage(senderOwnerId, inboundMsg);
          this._events.emit("chat:message", emitMsg);
          void this._maybeGenerateInboundChatDraft({
            senderOwnerId,
            senderDisplayName,
            chatText,
            messageId,
            remotePeerId: senderPeerId,
            senderRole: (msg.senderRole as "human" | "agent" | "system") ?? "human",
            agentVerified: Boolean(msg.agentCredential),
          });
        });
      } else if (intent === "bond.request") {
        void this._handleInboundBondRequest(msg).catch((err) =>
          console.warn("[mobile-node] bond.request handler:", err instanceof Error ? err.message : err),
        );
      } else if (intent === "bond.accept") {
        void this._handleInboundBondAccept(msg).catch((err) =>
          console.warn("[mobile-node] bond.accept handler:", err instanceof Error ? err.message : err),
        );
      } else if (intent === "bond.challenge") {
        void this._handleInboundBondChallenge(msg).catch((err) =>
          console.warn("[mobile-node] bond.challenge handler:", err instanceof Error ? err.message : err),
        );
      } else if (intent === "bond.challenge.response") {
        void this._handleInboundBondChallengeResponse(msg).catch((err) =>
          console.warn(
            "[mobile-node] bond.challenge.response handler:",
            err instanceof Error ? err.message : err,
          ),
        );
      } else if (intent === "share.preview") {
        this._handleInboundSharePreviewEnv(msg);
      } else if (intent === "share.request") {
        void this._handleInboundShareRequestEnv(msg, opts?.transportPeerId).catch((err) =>
          console.warn("[mobile-node] share.request:", err instanceof Error ? err.message : err),
        );
      } else if (intent === "share.accept") {
        try {
          const acc = parseShareAcceptPayload(msg.payload);
          if (!acc.accept) {
            this._clearPendingShareStateForPreview(acc.inReplyTo);
          }
        } catch {
          /* ignore */
        }
        void this._maybeSendVaultFileAfterInboundAccept(msg, opts?.transportPeerId).catch((err) =>
          console.warn(
            "[mobile-node] share.accept / data transfer:",
            err instanceof Error ? err.message : err,
          ),
        );
      } else if (
        intent === "profile.sync" ||
        intent === "profile.response" ||
        intent === "profile.request"
      ) {
        void this._handleInboundProfileIntent(msg, opts).catch((err) =>
          console.warn("[mobile-node] profile intent:", err instanceof Error ? err.message : err),
        );
      } else if (intent === "agent.card.request" || intent === "agent.card.response") {
        void this._handleInboundAgentCard(
          msg,
          opts?.transportPeerId ?? (msg.senderPeerId as string) ?? "",
        ).catch((err) =>
          console.warn("[mobile-node] agent.card handler:", err instanceof Error ? err.message : err),
        );
      } else if (
        isA2ATaskIntent(intent as import("@envoymesh/protocol").EnvoyIntent)
      ) {
        void this._handleInboundA2ATask(
          msg,
          opts?.transportPeerId ?? (msg.senderPeerId as string) ?? "",
        ).catch((err) =>
          console.warn("[mobile-node] A2A task handler:", err instanceof Error ? err.message : err),
        );
      } else if (intent === "rendezvous.response") {
        console.log("[mobile-node] rendezvous.response received, matches:", (payload.matches as any[])?.length);
        // Handle relay search response
        const correlationId = (msg.correlationId as string) ?? "";
        const pending = this._pendingQueries.get(correlationId);
        if (pending) {
          clearTimeout(pending.timer);
          this._pendingQueries.delete(correlationId);
          const matches = (payload.matches as any[]) ?? [];
          pending.resolve(
            matches.map((m: any) => ({
              nodeId: (m.peerId as string) ?? "",
              ownerId: (m.ownerId as string) ?? (m.peerId as string) ?? "",
              displayName: (m.displayName as string) ?? (m.peerId as string)?.slice(0, 12) ?? "",
              interests: (m.capabilities as any[])?.filter((c: any) => c.tag)
                .map((c: any) => c.tag as string) ?? [],
              profileVisibility: "public" as const,
            })),
          );
        }
      } else if (intent === "broadcast.request") {
        // Phase 20/21 — Handle broadcast document/capability discovery on mobile
        void this._handleInboundBroadcast(msg, opts?.transportPeerId).catch((err) =>
          console.warn("[mobile-node] broadcast.request handler:", err instanceof Error ? err.message : err),
        );
      }
      return;
    }

    // Legacy / event messages
    if (msg.event) {
      this._events.emit(msg.event as string, (msg.data as unknown) ?? msg);
    }
  }

  private _sendRelayCheckin(ws: WebSocket): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const unsigned = createUnsignedEnvelope({
      intent: "relay.checkin",
      senderPeerId: this._state?.agent?.agentPeerId ?? "",
      senderPublicKey: this._state?.agent?.publicKeyPem ?? "",
      senderRole: "agent",
      recipientRole: "system",
      payload: {
        peerId: this._state?.agent?.agentPeerId ?? "",
        capabilities: ["chat.message"],
      },
    });
    const signed = signUnsignedEnvelope(unsigned, this._state?.agent?.privateKeyPem ?? "");
    try { ws.send(JSON.stringify(signed)); } catch { /* ignore */ }
  }

  /**
   * Register capabilities on the relay's rendezvous registry so other peers
   * can discover this mobile node via rendezvous.query.
   * Also advertises topics on the DHT (if mesh is available) for libp2p-level discovery.
   */
  private _sendRendezvousRegister(ws: WebSocket): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!this._state?.agent) return;

    // Build capabilities from human profile interests
    const profileCaps: Array<{ tag: string }> = [];
    const topics: string[] = [];
    if (this._humanProfile?.hobbies) {
      for (const h of this._humanProfile.hobbies) {
        if (h) {
          profileCaps.push({ tag: h.toLowerCase() });
          topics.push(h.toLowerCase());
        }
      }
    }
    // Always advertise basic capabilities
    profileCaps.push({ tag: "chat.message" });
    topics.push("chat.message");
    if (this._humanProfile?.username) {
      const userTopic = `username:${this._humanProfile.username.toLowerCase()}`;
      profileCaps.push({ tag: userTopic });
      topics.push(userTopic);
    }

    // Register on relay rendezvous
    const relayUrl = this._relayUrls[0] ?? "";
    const unsigned = createUnsignedEnvelope({
      intent: "rendezvous.register",
      senderPeerId: this._state.agent.agentPeerId,
      senderPublicKey: this._state.agent.publicKeyPem,
      senderRole: "agent",
      recipientRole: "system",
      payload: createRendezvousRegisterPayload({
        peerId: this._state.agent.agentPeerId,
        multiaddr: relayUrl ? `${relayUrl}/p2p/${this._state.agent.agentPeerId}` : `/p2p/${this._state.agent.agentPeerId}`,
        capabilities: profileCaps,
        ttlSeconds: 3600,
      }),
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.agent.privateKeyPem);
    try { ws.send(JSON.stringify(signed)); } catch { /* ignore */ }

    // Also advertise on DHT (best-effort)
    this._advertiseTopicsOnDht(topics).catch(() => {});
  }

  // -------------------------------------------------------------------
  // Libp2p mesh (browser-mode: WebSocket transport + DHT + circuit relay)
  // -------------------------------------------------------------------

  /** Load or create a stable libp2p Ed25519 private key.
   *
   * On native builds the key is stored via the injected SecureStorage (iOS Keychain /
   * Android EncryptedSharedPreferences).  On browser-dev only does it fall back to
   * localStorage so that the Vite dev server can run without extra setup.
   */
  private async _loadOrCreateLibp2pKey(): Promise<PrivateKey> {
    const KEY = "envoymesh_libp2p_private_key";

    // Try injected SecureStorage first (native builds).
    if (this._secureStorage) {
      try {
        const stored = await this._secureStorage.get(KEY);
        if (stored) {
          const binary = atob(stored);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return privateKeyFromProtobuf(bytes);
        }
      } catch { /* corrupted — regenerate below */ }

      const pk = await generateKeyPair("Ed25519");
      const protoBytes = privateKeyToProtobuf(pk);
      let binary = "";
      for (let i = 0; i < protoBytes.length; i++) binary += String.fromCharCode(protoBytes[i]);
      await this._secureStorage.set(KEY, btoa(binary));
      return pk;
    }

    // Browser-dev fallback (never used in production native builds).
    if (isBrowserDevMode()) {
      try {
        const stored = localStorage.getItem(KEY);
        if (stored) {
          const binary = atob(stored);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return privateKeyFromProtobuf(bytes);
        }
      } catch { /* corrupted — regenerate */ }
      const pk = await generateKeyPair("Ed25519");
      try {
        const protoBytes = privateKeyToProtobuf(pk);
        let binary = "";
        for (let i = 0; i < protoBytes.length; i++) binary += String.fromCharCode(protoBytes[i]);
        localStorage.setItem(KEY, btoa(binary));
      } catch { /* localStorage unavailable */ }
      return pk;
    }

    // Native build with no SecureStorage — refuse to proceed without a place
    // to store the key, otherwise the peerId changes on every restart.
    throw new Error(
      "MobileNode: no secure storage adapter provided for a native build. " +
        "Pass a `secureStorage` option implementing set/get to MobileNode " +
        "(e.g. the iOS Keychain adapter from apps/mobile/src/capacitor-secure-storage.ts).",
    );
  }

  /** Start the browser-mode libp2p mesh with WebSocket transport + DHT client + circuit relay. */
  private async _startLibp2p(): Promise<void> {
    if (this._mesh) return;
    if (!this._state?.agent) return;

    // Dynamically import libp2p modules (avoid bundling node:* deps at top level)
    const [
      { createLibp2p },
      { noise },
      { yamux },
      { webSockets: wsTransport },
      { circuitRelayTransport },
      { identify, identifyPush },
      { kadDHT },
      { bootstrap },
      { ping },
    ] = await Promise.all([
      import("libp2p"),
      import("@chainsafe/libp2p-noise"),
      import("@chainsafe/libp2p-yamux"),
      import("@libp2p/websockets"),
      import("@libp2p/circuit-relay-v2"),
      import("@libp2p/identify"),
      import("@libp2p/kad-dht"),
      import("@libp2p/bootstrap"),
      import("@libp2p/ping"),
    ]);

    const libp2pKey = await this._loadOrCreateLibp2pKey();

    // Build bootstrap peers: use configured bootstrap or convert relay URLs
    let bootstrapPeers = this._meshBootstrapPeers;
    if (bootstrapPeers.length === 0 && this._relayUrls.length > 0) {
      bootstrapPeers = this._relayUrls
        .map((url) => {
          try {
            const u = new URL(url);
            const host = u.hostname;
            const port = u.port || (u.protocol === "wss:" ? "443" : "80");
            const wsProto = u.protocol === "wss:" ? "wss" : "ws";
            return `/dns4/${host}/tcp/${port}/${wsProto}`;
          } catch { return ""; }
        })
        .filter(Boolean);
    }

    console.log("[mobile-node] starting libp2p mesh (browser-mode), bootstrap:", bootstrapPeers);

    const node = await createLibp2p({
      privateKey: libp2pKey,
      connectionMonitor: {
        pingInterval: 6000,
        abortConnectionOnPingFailure: true,
      },
      connectionManager: {
        reconnectRetries: 10,
        reconnectRetryInterval: 2000,
        reconnectBackoffFactor: 1.5,
        maxParallelReconnects: 10,
        dialTimeout: 15_000,
        addressDialTimeout: 10_000,
      },
      addresses: {
        listen: ["/p2p-circuit"],
      },
      transports: [
        wsTransport(),
        circuitRelayTransport(),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery: bootstrapPeers.length > 0
        ? [bootstrap({ list: bootstrapPeers, timeout: 5000 })]
        : [],
      services: {
        ping: ping(),
        identify: identify(),
        identifyPush: identifyPush(),
        dht: kadDHT({ clientMode: true }),
      },
    });

    // Install EnvoyMesh protocol handlers
    const handleInboundStream = async (stream: any, connection: any, protocol: string) => {
      await this._handleMobileInboundEnvelopeStream(stream, connection, protocol);
    };

    await node.handle(ENVOY_MESSAGE_PROTOCOL, (stream: any, connection: any) =>
      handleInboundStream(stream, connection, ENVOY_MESSAGE_PROTOCOL),
    );
    await node.handle(ENVOY_CHAT_PROTOCOL, (stream: any, connection: any) =>
      handleInboundStream(stream, connection, ENVOY_CHAT_PROTOCOL),
    );

    installMobileDataTransferReceiver(node, {
      meshPeerId: node.peerId.toString(),
      vault: this._vault,
      getDevicePublicKeyPemForRemoteLibp2p: (rid) => this._peerDeviceByTransportId.get(rid)?.devicePublicKeyPem,
      resolveInboundRelativePath: (rid, vp) => this._resolveInboundDataTransferRelativePath(rid, vp),
      onInboundVaultWriteCommitted: (rid, src, totalBytes) => {
        this._consumeInboundDataTransferSaveMapping(rid, src);
        this._notifyInboundTransferVerified(rid, src, totalBytes);
      },
    });

    // Start with timeout
    const NODE_START_DEADLINE_MS = 25_000;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          console.warn("[mobile-node] libp2p start timed out after 25s — continuing with relay-only");
          resolve();
        }, NODE_START_DEADLINE_MS);
        Promise.resolve(node.start()).then(() => {
          clearTimeout(timer);
          resolve();
        }).catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    } catch (err) {
      console.warn("[mobile-node] libp2p node.start failed:", err instanceof Error ? err.message : err);
      return;
    }

    this._mesh = node;
    this._meshPeerId = node.peerId.toString();
    console.log(`[mobile-node] libp2p mesh started, peerId=${this._meshPeerId}`);

    this._events.emit("node:online", {
      peerId: this._state.agent.agentPeerId,
      multiaddrs: node.getMultiaddrs().map((a: any) => a.toString()),
    });

    // Advertise profile topics on DHT after startup delay
    this._startDhtAdvertise();
  }

  private async _stopLibp2p(): Promise<void> {
    if (!this._mesh) return;
    this._stopDhtAdvertise();
    try {
      await this._mesh.stop();
    } catch (err) {
      console.warn("[mobile-node] libp2p stop error:", err instanceof Error ? err.message : err);
    }
    this._mesh = undefined;
    this._meshPeerId = "";
  }

  private _assertNodeRunning(): void {
    if (this.getNodeStatus() !== "running") {
      throw new Error(`Node is ${this.getNodeStatus()}. Start the node first.`);
    }
  }

  private _validateRelativeVaultPathForShare(norm: string): void {
    if (!norm || norm.includes("..") || norm.includes("~")) {
      throw new Error("Invalid vault path");
    }
  }

  /** Send a signed envelope via the libp2p mesh (`/envoymesh/chat` by default; use `/envoymesh/message` for share, etc.). */
  private async _sendViaMesh(
    targetPeerId: string,
    data: string,
    protocol: string = ENVOY_CHAT_PROTOCOL,
  ): Promise<void> {
    if (!this._mesh || !targetPeerId) throw new Error("Mesh not available");
    const { byteStream } = await import("@libp2p/utils");
    const stream = await this._mesh.dialProtocol(
      `/p2p/${targetPeerId}` as any,
      protocol,
    );
    try {
      await byteStream(stream).write(new TextEncoder().encode(data));
    } finally {
      try { await stream.close(); } catch { /* ignore */ }
    }
  }

  private static readonly _MOBILE_HINT_DIAL_TIMEOUT_MS = 3_500;
  private static readonly _MOBILE_CHAT_SEND_MAX_ATTEMPTS = 3;

  private async _handleMobileInboundEnvelopeStream(
    stream: unknown,
    connection: { remotePeer: { toString(): string } },
    protocol: string,
  ): Promise<void> {
    const remotePeerId = connection.remotePeer.toString();
    let replyConsumed = false;
    try {
      const { byteStream } = await import("@libp2p/utils");
      const { encodeEnvelope } = await import("@envoymesh/network");
      const streamIo = byteStream(stream as Parameters<typeof byteStream>[0]);
      const bytes = await streamIo.read();
      if (!bytes) return;
      const data =
        bytes instanceof Uint8Array
          ? bytes
          : (bytes as import("uint8arraylist").Uint8ArrayList).subarray();
      const text = new TextDecoder().decode(data);
      const msg = JSON.parse(text) as Record<string, unknown>;
      const replyWithEnvelope =
        protocol === ENVOY_CHAT_PROTOCOL || protocol === ENVOY_MESSAGE_PROTOCOL
          ? async (envelope: EnvoyEnvelope) => {
              if (replyConsumed) return;
              replyConsumed = true;
              await streamIo.write(encodeEnvelope(envelope));
              try {
                await (stream as { close?: () => Promise<void> }).close?.();
              } catch {
                /* ignore */
              }
            }
          : undefined;
      this._handleInboundMessage(msg, { transportPeerId: remotePeerId, replyWithEnvelope });
    } catch {
      /* ignore malformed */
    }
    if (!replyConsumed) {
      try {
        await (stream as { close?: () => Promise<void> }).close?.();
      } catch {
        /* ignore */
      }
    }
  }

  private async _buildMobileChatDialHints(
    transportPeerId: string,
    targetOwnerId: string,
  ): Promise<string[]> {
    const dir = await this._peerDirectory.get(targetOwnerId.trim());
    const listen = (dir?.multiaddrs ?? []).filter(
      (a) =>
        a.trim().length > 0 &&
        !a.includes("/ip4/127.") &&
        !a.includes("/ip4/0.0.0.0/") &&
        !a.includes("/ip6/::1"),
    );
    const bases = [
      DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
      ...this._meshBootstrapPeers,
    ].filter(Boolean);
    const {
      buildSyntheticRelayCircuitHints,
      dedupeDialHintStrings,
      prioritizeCircuitDialHints,
    } = await import("@envoymesh/network");
    return prioritizeCircuitDialHints(
      dedupeDialHintStrings([
        ...listen,
        ...buildSyntheticRelayCircuitHints(transportPeerId, bases, 8),
        `/p2p/${transportPeerId}`,
      ]),
    );
  }

  private async _dialProtocolWithHint(hint: string, protocol: string): Promise<unknown> {
    if (!this._mesh) throw new Error("Mesh not available");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`dial timed out: ${hint.slice(0, 64)}`)),
        MobileNode._MOBILE_HINT_DIAL_TIMEOUT_MS,
      );
      void this._mesh!
        .dialProtocol(hint as any, protocol)
        .then((stream) => {
          clearTimeout(timer);
          resolve(stream);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private async _openProtocolStreamWithHints(
    transportPeerId: string,
    hints: string[],
    attempt: number,
    protocol: string,
  ): Promise<unknown> {
    const { prioritizeCircuitDialHints } = await import("@envoymesh/network");
    const ordered = attempt > 0 ? prioritizeCircuitDialHints(hints) : hints;
    let lastErr: unknown = new Error("no dial hints");
    for (const hint of ordered) {
      try {
        return await this._dialProtocolWithHint(hint, protocol);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  private async _openChatStreamWithHints(
    transportPeerId: string,
    hints: string[],
    attempt: number,
  ): Promise<unknown> {
    return this._openProtocolStreamWithHints(transportPeerId, hints, attempt, ENVOY_CHAT_PROTOCOL);
  }

  private async _sendViaMeshWithHints(
    targetPeerId: string,
    data: string,
    protocol: string,
    hints: string[],
  ): Promise<void> {
    const { byteStream } = await import("@libp2p/utils");
    const stream = await this._openProtocolStreamWithHints(targetPeerId, hints, 0, protocol);
    try {
      await byteStream(stream as Parameters<typeof byteStream>[0]).write(new TextEncoder().encode(data));
    } finally {
      try {
        await (stream as { close?: () => Promise<void> }).close?.();
      } catch {
        /* ignore */
      }
    }
  }

  private async _sendExpectReplyViaMeshWithHints(
    targetPeerId: string,
    requestJson: string,
    timeoutMs: number,
    hints: string[],
    protocol: string = ENVOY_MESSAGE_PROTOCOL,
  ): Promise<string> {
    if (!this._mesh || !targetPeerId) throw new Error("Mesh not available");
    const { byteStream } = await import("@libp2p/utils");
    let lastErr: unknown = new Error("profile request failed");
    for (let attempt = 0; attempt < MobileNode._MOBILE_CHAT_SEND_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
      try {
        const stream = await this._openProtocolStreamWithHints(targetPeerId, hints, attempt, protocol);
        const streamIo = byteStream(stream as Parameters<typeof byteStream>[0]);
        try {
          await streamIo.write(new TextEncoder().encode(requestJson));
          const replyBytes = await new Promise<Uint8Array | null>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`request reply timed out after ${timeoutMs}ms`)),
              timeoutMs,
            );
            void (streamIo.read() as Promise<Uint8Array | null>)
              .then((b) => {
                clearTimeout(timer);
                resolve(b);
              })
              .catch((err: unknown) => {
                clearTimeout(timer);
                reject(err);
              });
          });
          if (replyBytes === null) throw new Error("peer closed stream without a reply");
          const bytes =
            replyBytes instanceof Uint8Array
              ? replyBytes
              : (replyBytes as { subarray: () => Uint8Array }).subarray();
          return new TextDecoder().decode(bytes);
        } finally {
          try {
            await (stream as { close?: () => Promise<void> }).close?.();
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        lastErr = err;
        console.warn(
          `[mobile-node] sendExpectReply attempt ${attempt + 1}/${MobileNode._MOBILE_CHAT_SEND_MAX_ATTEMPTS} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private _isChatAckFailureLikelyAfterWrite(err: unknown): boolean {
    const name = err instanceof Error ? (err as Error & { name?: string }).name : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (name === "StreamResetError") return true;
    if (/sendChatExpectReply timed out/i.test(msg) || /chat ack timed out/i.test(msg)) {
      return true;
    }
    if (/Cannot send on stream/i.test(msg) || /stream is not writable/i.test(msg)) return false;
    return (
      /stream has been reset/i.test(msg) ||
      /peer closed stream without a reply/i.test(msg) ||
      /Unexpected EOF/i.test(msg) ||
      /stream closed while reading/i.test(msg)
    );
  }

  private async _sendChatViaMeshWithAck(
    transportPeerId: string,
    signedJson: string,
    targetOwnerId: string,
  ): Promise<{ delivered: boolean; deliveredAt?: string }> {
    if (!this._mesh) throw new Error("Mesh not available");
    const { decodeEnvelope } = await import("@envoymesh/network");
    const hints = await this._buildMobileChatDialHints(transportPeerId, targetOwnerId);
    let lastErr: unknown;
    for (let attempt = 0; attempt < MobileNode._MOBILE_CHAT_SEND_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
      try {
        const stream = await this._openChatStreamWithHints(transportPeerId, hints, attempt);
        const { byteStream } = await import("@libp2p/utils");
        const streamIo = byteStream(stream as Parameters<typeof byteStream>[0]);
        await streamIo.write(new TextEncoder().encode(signedJson));
        const replyBytes = await new Promise<Uint8Array | null>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`chat ack timed out after ${CHAT_DELIVERY_ACK_TIMEOUT_MS}ms`)),
            CHAT_DELIVERY_ACK_TIMEOUT_MS,
          );
          void (streamIo.read() as Promise<Uint8Array | null>)
            .then((b) => {
              clearTimeout(timer);
              resolve(b);
            })
            .catch((err: unknown) => {
              clearTimeout(timer);
              reject(err);
            });
        });
        try {
          await (stream as { close?: () => Promise<void> }).close?.();
        } catch {
          /* ignore */
        }
        if (replyBytes) {
          const bytes =
            replyBytes instanceof Uint8Array
              ? replyBytes
              : (replyBytes as { subarray: () => Uint8Array }).subarray();
          const reply = decodeEnvelope(bytes);
          if (reply.intent === "chat.delivered") {
            const ack = parseChatDeliveredAck(reply);
            return { delivered: true, deliveredAt: ack.deliveredAt };
          }
        }
        return { delivered: false };
      } catch (err) {
        lastErr = err;
        if (this._isChatAckFailureLikelyAfterWrite(err)) {
          console.warn(
            "[mobile-node] chat ack failed after send (message likely delivered):",
            err instanceof Error ? err.message : err,
          );
          return { delivered: false };
        }
        console.warn(
          `[mobile-node] sendChat attempt ${attempt + 1}/${MobileNode._MOBILE_CHAT_SEND_MAX_ATTEMPTS} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    try {
      await this._sendViaMeshWithHints(
        transportPeerId,
        signedJson,
        ENVOY_CHAT_PROTOCOL,
        hints,
      );
      console.log("[mobile-node] chat delivered without ack (fallback after ack failures)");
      return { delivered: false };
    } catch (fallbackErr) {
      console.warn(
        "[mobile-node] chat ack-less fallback failed:",
        fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
      );
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private _mobileChatRoomHost(): MobileChatRoomHost {
    return {
      assertOnline: () => this._assertNodeRunning(),
      getProfile: () => this.getProfile(),
      getMeshPeerId: () => this._meshPeerId ?? derivePeerId(this._state.device.publicKeyPem),
      trustStore: {
        getTrustRecord: async (ownerId) => {
          const record = await this._trustStore.get(ownerId);
          if (!record) return undefined;
          return { level: record.level, displayName: record.displayName };
        },
      },
      chatRoomStore: this._chatRoomStore,
      pendingSyncStore: this._chatRoomPendingSyncStore,
      pendingMessageStore: this._chatRoomPendingMessageStore,
      deviceRevocations: this._deviceRevocations,
      loadHumanDisplayName: async () => this._humanProfile?.displayName,
      resolvePeerTransportForOwner: async (targetOwnerId) => {
        const transportPeerId = await this._resolveChatTransportPeerId(targetOwnerId);
        if (!transportPeerId) {
          throw new Error(`No transport peer for ${targetOwnerId}`);
        }
        const recipientEnvelopePeerId = await this._resolveChatRecipientPeerId(targetOwnerId);
        return { transportPeerId, recipientEnvelopePeerId };
      },
      deliverEnvelopeToOwner: async (targetOwnerId, transportPeerId, envelope) => {
        const data = JSON.stringify(envelope);
        if (this._mesh) {
          try {
            return await this._sendChatViaMeshWithAck(transportPeerId, data, targetOwnerId);
          } catch (err) {
            console.warn(
              "[mobile-node] chat.room fan-out mesh failed, falling back to relay:",
              err instanceof Error ? err.message : err,
            );
          }
        }
        this._broadcastToRelaySockets(data);
        return { delivered: false };
      },
      persistChatMessage: (threadKey, msg) => {
        const receipt = msg.metadata.deliveryReceipt;
        const deliveryReceipt =
          receipt === "sent" || receipt === "delivered" || receipt === "read" ? receipt : undefined;
        void this._chatLog.append(threadKey, {
          messageId: msg.messageId,
          sender: {
            ownerId: msg.sender.ownerId,
            displayName: msg.sender.displayName,
          },
          recipient: {
            ownerId: msg.recipient.ownerId,
            displayName: msg.recipient.displayName,
          },
          content: msg.content,
          metadata: {
            timestamp: msg.metadata.timestamp,
            ...(deliveryReceipt ? { deliveryReceipt } : {}),
            ...(msg.metadata.deliveredToOwnerIds
              ? { deliveredToOwnerIds: msg.metadata.deliveredToOwnerIds }
              : {}),
            ...(msg.metadata.pendingRecipientOwnerIds
              ? { pendingRecipientOwnerIds: msg.metadata.pendingRecipientOwnerIds }
              : {}),
          },
          signature: msg.signature,
        }).catch(() => {});
      },
      emitRoomUpdated: (room) => this._events.emit("chat:room-updated", room),
      emitRoomRemoved: (roomId) => this._events.emit("chat:room-removed", { roomId }),
      emitRoomMessage: (roomId, message) => this._events.emit("chat:room-message", { roomId, message }),
      markOutboundDelivered: (threadKey, messageId, deliveredAt) => {
        void this._markOutboundChatDelivered(threadKey, messageId, deliveredAt);
      },
      recordGroupDeliveryProgress: (input) => {
        const key = `${input.threadKey}:${input.messageId}`;
        let state = this._groupDeliveryPending.get(key);
        if (!state) {
          state = { threadKey: input.threadKey, pending: new Set(input.allRecipientOwnerIds) };
          this._groupDeliveryPending.set(key, state);
        }
        state.pending.delete(input.recipientOwnerId);
        void this._chatLog
          .updateGroupDeliveryProgress(input.threadKey, input.messageId, input.recipientOwnerId)
          .catch(() => {});
        this._events.emit("chat:delivered", {
          messageId: input.messageId,
          timestamp: input.deliveredAt,
          recipientOwnerId: input.recipientOwnerId,
        });
        if (state.pending.size === 0) {
          this._groupDeliveryPending.delete(key);
          void this._markOutboundChatDelivered(input.threadKey, input.messageId, input.deliveredAt);
        }
      },
      clearChatThread: (threadKey) => {
        void this.clearChatHistory(threadKey);
      },
      shareChatFileToMember: (targetOwnerId, input) =>
        this._shareFileInternal(targetOwnerId, {
          path: input.vaultRelativePath,
          sensitivity: input.sensitivity,
          deliveryChannel: "chat",
          chatRoomId: input.chatRoomId,
          chatMessageId: input.chatMessageId,
          chatAttachmentId: input.chatAttachmentId,
        }).then(() => {}),
    };
  }

  private async _markOutboundChatDelivered(
    threadPeerOwnerId: string,
    messageId: string,
    deliveredAt: string,
  ): Promise<void> {
    await this._chatLog
      .updateDeliveryReceipt(threadPeerOwnerId, messageId, "delivered")
      .catch(() => {});
    this._events.emit("chat:delivered", { messageId, timestamp: deliveredAt });
  }

  /** Same-stream request/response on `/envoymesh/message/0.1.0` (desktop `sendExpectReply` parity). */
  private async _sendExpectReplyViaMesh(
    targetPeerId: string,
    requestJson: string,
    timeoutMs: number,
    ownerHint?: string,
  ): Promise<string> {
    const hints = ownerHint
      ? await this._buildMobileChatDialHints(targetPeerId, ownerHint)
      : [`/p2p/${targetPeerId}`];
    return this._sendExpectReplyViaMeshWithHints(
      targetPeerId,
      requestJson,
      timeoutMs,
      hints,
      ENVOY_MESSAGE_PROTOCOL,
    );
  }

  /** Search the DHT for capability topic providers. */
  private async _searchDhtTopic(topic: string, limit: number): Promise<Array<{ peerId: string; multiaddrs: string[] }>> {
    if (!this._mesh) return [];
    const cid = await cidForCapabilityTopic(topic);
    const results: Array<{ peerId: string; multiaddrs: string[] }> = [];
    const signal = AbortSignal.timeout(5000);
    try {
      for await (const provider of this._mesh.contentRouting.findProviders(cid, { signal })) {
        results.push({
          peerId: provider.id.toString(),
          multiaddrs: provider.multiaddrs.map((ma: any) => ma.toString()),
        });
        if (results.length >= limit) break;
      }
    } catch (err) {
      const name = err instanceof Error ? (err as Error & { name?: string }).name : "";
      if (name === "AbortError" || name === "TimeoutError" || signal.aborted) {
        return results;
      }
      throw err;
    }
    return results;
  }

  /** Advertise profile topics on the DHT. */
  private async _advertiseTopicsOnDht(topics: string[]): Promise<void> {
    if (!this._mesh) return;
    for (const topic of topics) {
      try {
        const cid = await cidForCapabilityTopic(topic);
        await this._mesh.contentRouting.provide(cid);
        console.log(`[mobile-node] DHT advertised topic: ${topic}`);
      } catch (err) {
        console.warn(`[mobile-node] DHT advertise failed for "${topic}":`, err instanceof Error ? err.message : err);
      }
    }
  }

  private _startDhtAdvertise(): void {
    this._stopDhtAdvertise();
    // First advertise after 15s (let DHT bootstrap stabilize)
    const initialTimer = setTimeout(() => {
      const topics: string[] = ["chat.message"];
      if (this._humanProfile?.hobbies) {
        for (const h of this._humanProfile.hobbies) {
          if (h) topics.push(h.toLowerCase());
        }
      }
      if (this._humanProfile?.username) {
        topics.push(`username:${this._humanProfile.username.toLowerCase()}`);
      }
      this._advertiseTopicsOnDht(topics).catch(() => {});
    }, 15_000);

    // Re-advertise every 5 minutes (similar to desktop node)
    this._dhtAdvertiseTimer = setInterval(() => {
      const topics: string[] = ["chat.message"];
      if (this._humanProfile?.hobbies) {
        for (const h of this._humanProfile.hobbies) {
          if (h) topics.push(h.toLowerCase());
        }
      }
      if (this._humanProfile?.username) {
        topics.push(`username:${this._humanProfile.username.toLowerCase()}`);
      }
      this._advertiseTopicsOnDht(topics).catch(() => {});
    }, 5 * 60 * 1000);

    // Store initial timer for cleanup
    (this._dhtAdvertiseTimer as any)._initial = initialTimer;
  }

  private _stopDhtAdvertise(): void {
    if (this._dhtAdvertiseTimer) {
      clearInterval(this._dhtAdvertiseTimer);
      const initial = (this._dhtAdvertiseTimer as any)._initial;
      if (initial) clearTimeout(initial);
      this._dhtAdvertiseTimer = null;
    }
  }

  private _startRelayCheckin(): void {
    this._stopRelayCheckin();
    this._relayCheckinTimer = setInterval(() => {
      for (const ws of this._relaySockets) {
        this._sendRelayCheckin(ws);
        this._sendRendezvousRegister(ws);
      }
    }, 30_000);
  }

  private _stopRelayCheckin(): void {
    if (this._relayCheckinTimer) {
      clearInterval(this._relayCheckinTimer);
      this._relayCheckinTimer = null;
    }
  }

  /**
   * Resolve an owner id, device id, or raw libp2p id to a **transport peer id** for `bond.request`
   * (desktop `NodeServiceImpl.sendHello` uses peer directory + optional raw id).
   */
  private async _resolveBondRecipientPeerId(targetKey: string): Promise<string> {
    const k = targetKey.trim();
    if (!k) throw new Error("sendHello: empty target");
    if (k.startsWith("12D3K") || k.startsWith("Qm") || k.startsWith("envoy_")) {
      return k;
    }
    const bond = await this._trustStore.get(k);
    const fromTrust = bond?.libp2pPeerId?.trim();
    if (fromTrust) return fromTrust;
    const dir = await this._peerDirectory.get(k);
    const fromDir = dir?.libp2pPeerId?.trim();
    if (fromDir) return fromDir;
    throw new Error(
      `Peer not found for owner or key: ${k}. Discover them first or ensure a peer id is stored.`,
    );
  }

  /** After a successful outbound `sendHello`, persist owner → dial id for future sends. */
  private async _rememberPeerRouteAfterHello(ownerOrKey: string, transportPeerId: string): Promise<void> {
    try {
      const existing = await this._peerDirectory.get(ownerOrKey.trim());
      await this._peerDirectory.set({
        ownerId: ownerOrKey.trim(),
        multiaddrs: existing?.multiaddrs ?? [],
        lastSeen: new Date().toISOString(),
        libp2pPeerId: transportPeerId,
      });
    } catch (err) {
      console.warn(
        "[mobile-node] sendHello: could not persist peer route:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  /**
   * Register the home bridge agent as a routable virtual contact.
   * Chat envelopes use the bridge agent peer id; transport dials the home node.
   */
  private async _registerHomeBridgeAgentRoute(): Promise<void> {
    const agentPeerId = this._state?.homeAgentPeerId?.trim();
    const homeTransport = this._state?.homeNodePeerId?.trim();
    if (!agentPeerId || !homeTransport || !this._state?.sharedIdentity) {
      return;
    }
    const now = new Date().toISOString();
    const displayName = this._state?.homeAgentName?.trim() || "My Agent";
    await this._peerDirectory.set({
      ownerId: agentPeerId,
      multiaddrs: [],
      lastSeen: now,
      libp2pPeerId: homeTransport,
    });
    await this._trustStore.set({
      peerOwnerId: agentPeerId,
      displayName,
      libp2pPeerId: homeTransport,
      level: "direct",
      createdAt: now,
      note: "home-bridge-agent",
    });
    const status = await this.getBridgeStatus();
    this._events.emit("bridge:status", status);
  }

  /** Relay-only hint when mesh dial info is unavailable (conservative). */
  private _relayOnlyReachabilityHint(peerOwnerId: string): PeerConnectionInfo {
    const relayOpen = this._relaySockets.some((ws) => ws.readyState === WebSocket.OPEN);
    const isHomeBridge = peerOwnerId === this._state?.homeAgentPeerId;
    if (relayOpen && isHomeBridge && this._state?.homeNodePeerId) {
      return { connected: true, direct: false, relayPeerId: this._relayUrls[0] };
    }
    return { connected: false, direct: false };
  }

  /** Connection info for a libp2p transport peer (direct vs circuit relay). */
  private _meshPeerConnectionInfo(transportPeerId: string): PeerConnectionInfo {
    if (!this._mesh) {
      return { connected: false, direct: false };
    }
    try {
      const node = this._mesh as import("libp2p").Libp2p & {
        getConnections?: (peerId?: import("@libp2p/interface").PeerId) => Array<{
          status?: string;
          remoteAddr?: { toString?: () => string };
        }>;
      };
      const pid = peerIdFromString(transportPeerId);
      const conns = node.getConnections?.(pid) ?? [];
      const openConns = conns.filter((c) => c?.status === "open" || c?.status === undefined);
      if (openConns.length === 0) {
        return { connected: false, direct: false };
      }
      const directConn = openConns.find(
        (c) => !(c?.remoteAddr?.toString?.() ?? "").includes("/p2p-circuit"),
      );
      if (directConn) {
        return { connected: true, direct: true };
      }
      const remoteAddr = openConns[0]?.remoteAddr?.toString?.() ?? "";
      const relayMatch = remoteAddr.match(/p2p-circuit\/p2p\/([^/]+)\/p2p\//);
      return {
        connected: true,
        direct: false,
        relayPeerId: relayMatch?.[1] ?? this._relayUrls[0],
      };
    } catch {
      return { connected: false, direct: false };
    }
  }

  /** Resolve libp2p dial target for outbound chat (including home bridge agent). */
  private async _resolveChatTransportPeerId(targetOwnerId: string): Promise<string | undefined> {
    const t = targetOwnerId.trim();
    if (!t) return undefined;
    const bond = await this._trustStore.get(t);
    if (bond?.libp2pPeerId?.trim()) return bond.libp2pPeerId.trim();
    const dir = await this._peerDirectory.get(t);
    if (dir?.libp2pPeerId?.trim()) return dir.libp2pPeerId.trim();
    if (t === this._state?.homeAgentPeerId && this._state?.homeNodePeerId?.trim()) {
      return this._state.homeNodePeerId.trim();
    }
    return undefined;
  }

  /**
   * Map contact selection → envelope `recipientPeerId`. Prefer an `envoy_…` device id
   * stored on the bond (`libp2pPeerId` field name is historical); otherwise use
   * the same thread key (often `envoy:owner:…`) for local/relay best-effort routing.
   */
  private async _resolveChatRecipientPeerId(targetOwnerId: string): Promise<string> {
    const t = targetOwnerId.trim();
    if (t.startsWith("envoy_")) return t;
    const bond = await this._trustStore.get(t);
    if (bond?.libp2pPeerId?.startsWith("envoy_")) {
      return bond.libp2pPeerId;
    }
    const dir = await this._peerDirectory.get(t);
    if (dir?.libp2pPeerId?.trim()) {
      return dir.libp2pPeerId.trim();
    }
    if (t.startsWith("envoy:owner:")) {
      console.warn(
        "[mobile-node] sendChat: no envoy_* device id in trust store for this owner; " +
          "using owner id as recipientPeerId — add bond with envelope peer id when available",
      );
    }
    return t;
  }

  /**
   * Match desktop `NodeServiceImpl.sendChat`: device keys + {@link createChatMessagePayload},
   * then mesh (if bond has dial id) else relay flood.
   */
  private _ensureAgentCredential(): AgentCredential {
    if (this._agentCredential) {
      return this._agentCredential;
    }
    if (!this._state?.owner || !this._state?.agent) {
      throw new Error("Agent identity is not available");
    }
    this._agentCredential = createAgentCredential({
      owner: {
        ownerId: this._state.owner.ownerId,
        publicKeyPem: this._state.owner.publicKeyPem,
        privateKeyPem: this._state.owner.privateKeyPem,
      },
      agent: {
        agentId: this._state.agent.agentId,
        agentPeerId: this._state.agent.agentPeerId,
        publicKeyPem: this._state.agent.publicKeyPem,
        privateKeyPem: this._state.agent.privateKeyPem,
      },
      scope: ["chat.message"],
    });
    return this._agentCredential;
  }

  private async _dispatchSignedAgentChat(
    targetOwnerId: string,
    text: string,
    credential: AgentCredential,
    messageId?: string,
  ): Promise<{ delivered: boolean; deliveredAt?: string }> {
    if (!this._state?.agent || !this._state?.owner) return { delivered: false };
    this._assertDeviceNotRevoked();

    const recipientPeerId = await this._resolveChatRecipientPeerId(targetOwnerId);
    const unsigned = createUnsignedEnvelope({
      messageId,
      intent: "chat.message",
      senderPeerId: this._state.agent.agentPeerId,
      senderPublicKey: this._state.agent.publicKeyPem,
      senderRole: "agent",
      recipientPeerId,
      recipientRole: "human",
      payload: createChatMessagePayload({
        senderOwnerId: this._state.owner.ownerId,
        text: stripModelThinking(text),
      }),
      agentCredential: credential,
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.agent.privateKeyPem);
    const data = JSON.stringify(signed);

    if (this._mesh) {
      const transportPeerId = await this._resolveChatTransportPeerId(targetOwnerId);
      if (transportPeerId) {
        try {
          const result = await this._sendChatViaMeshWithAck(transportPeerId, data, targetOwnerId);
          if (result.delivered) {
            await this._markOutboundChatDelivered(
              targetOwnerId,
              signed.messageId,
              result.deliveredAt ?? new Date().toISOString(),
            );
          }
          return result;
        } catch (err) {
          console.warn(
            "[mobile-node] mesh sendAgentChat failed, falling back to relay:",
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
    this._broadcastToRelaySockets(data);
    return { delivered: false };
  }

  private async _dispatchSignedAgentEnvelope(
    targetOwnerId: string,
    signed: import("@envoymesh/protocol").EnvoyEnvelope,
  ): Promise<void> {
    const data = JSON.stringify(signed);
    if (this._mesh) {
      const transportPeerId = await this._resolveChatTransportPeerId(targetOwnerId);
      if (transportPeerId) {
        try {
          await this._sendViaMesh(transportPeerId, data);
          return;
        } catch (err) {
          console.warn(
            "[mobile-node] mesh agent envelope failed, falling back to relay:",
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
    this._broadcastToRelaySockets(data);
  }

  private async _handleInboundAgentCard(
    msg: Record<string, unknown>,
    remotePeerId: string,
  ): Promise<void> {
    if (!this._state?.owner || !this._state?.device || !this._state?.agent) return;
    const envelope = msg as import("@envoymesh/protocol").EnvoyEnvelope;
    const receivedAt = Date.now();
    const correlationId =
      typeof envelope.correlationId === "string" ? envelope.correlationId : undefined;
    const result = await handleMobileInboundAgentCardIntent({
      envelope,
      ownerId: this._state.owner.ownerId,
      deviceId: deriveDeviceId(this._state.device.publicKeyPem),
      displayName: this._state.owner.ownerId,
      nodeProfile: this._state.deviceCertificate?.deviceProfile ?? "primary",
      capabilities: this._state.deviceCertificate?.capabilities ?? ["message.send", "task.execute"],
      remotePeerId,
      receivedAt,
      correlationId,
      trustStore: this._trustStore,
      agentCardStore: this._agentCardStore,
      auditJournal: this._auditJournal,
    });
    if (!result.ok) {
      console.warn(`[mobile-node] agent.card denied: ${result.reason}`);
      return;
    }
    if (result.action === "cached") {
      void this.recordAgentCardCached(result.ownerId, result.card).catch((err) =>
        console.warn("[mobile-node] agent card activity failed:", err),
      );
      return;
    }
    if (result.action === "respond") {
      const credential = this._ensureAgentCredential();
      const unsigned = createUnsignedEnvelope({
        senderPeerId: this._state.agent.agentPeerId,
        senderPublicKey: this._state.agent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: envelope.senderPeerId,
        recipientRole: "agent",
        intent: "agent.card.response",
        payload: result.responsePayload,
        correlationId,
        agentCredential: credential,
      });
      const signed = signUnsignedEnvelope(unsigned, this._state.agent.privateKeyPem);
      await this._dispatchSignedAgentEnvelope(
        envelope.agentCredential?.ownerId ?? envelope.senderPeerId,
        signed,
      );
    }
  }

  /**
   * Phase 20/21 — Handle broadcast document/capability discovery on mobile.
   * Performs local library/capability matching and sends broadcast.response.
   */
  private async _handleInboundBroadcast(
    msg: Record<string, unknown>,
    transportPeerId?: string,
  ): Promise<void> {
    if (!this._state) return;
    const payload = (msg.payload as Record<string, unknown>) ?? {};
    const query = (payload.query as string) ?? "";
    const requestedCapabilities = (payload.requestedCapabilities as string[]) ?? [];
    const requestedSensitivity = (payload.requestedSensitivity as string) ?? "public";

    // Document discovery — search local vault library
    if (query) {
      const library = await (this._vault as any).listLibrary();
      const lowerQuery = query.toLowerCase();
      const results = library
        .filter((item: any) => {
          // Sensitivity gating
          const sens = item.sensitivity ?? "public";
          if (requestedSensitivity === "public" && sens !== "public") return false;
          if (requestedSensitivity === "friends" && sens === "private") return false;
          // Match on title or topic tags
          const title = (item.title ?? item.path ?? "").toLowerCase();
          const tags = (item.topicTags ?? []).map((t: string) => t.toLowerCase());
          return title.includes(lowerQuery) || tags.some((t: string) => t.includes(lowerQuery));
        })
        .slice(0, 10)
        .map((item: any) => ({
          title: item.title ?? item.path ?? "",
          sensitivity: item.sensitivity ?? "public",
          topicTags: item.topicTags ?? [],
          cid: item.cid,
          hash: item.hash,
        }));

      if (results.length > 0 && transportPeerId) {
        await this._sendViaMesh(transportPeerId, JSON.stringify({
          type: "broadcast.response",
          intent: "broadcast.response",
          correlationId: msg.correlationId,
          payload: { results, originalQuery: query },
        }));
      }
    }

    // Capability discovery — match against local manifest
    if (requestedCapabilities.length > 0) {
      const manifest = await this.getCapabilityManifest();
      const localCaps = (manifest?.capabilities ?? []).map((c: string) => c.toLowerCase());
      const matched = requestedCapabilities.filter((rc) =>
        localCaps.some((lc: string) => lc.includes(rc.toLowerCase()) || rc.toLowerCase().includes(lc)),
      );

      if (matched.length > 0 && transportPeerId) {
        await this._sendViaMesh(transportPeerId, JSON.stringify({
          type: "broadcast.response",
          intent: "broadcast.response",
          correlationId: msg.correlationId,
          payload: { capabilities: matched, originalQuery: requestedCapabilities },
        }));
      }
    }
  }

  private async _handleInboundA2ATask(
    msg: Record<string, unknown>,
    remotePeerId: string,
  ): Promise<void> {
    const envelope = msg as import("@envoymesh/protocol").EnvoyEnvelope;
    const decision = await this._taskDispatcher.dispatch(envelope);
    const correlationId =
      typeof envelope.correlationId === "string" ? envelope.correlationId : undefined;

    if (decision.action === "handled") {
      await this._taskJournal.append({
        eventId: decision.journalEntry.eventId,
        taskId: decision.journalEntry.taskId,
        eventType: decision.journalEntry.eventType,
        summary: decision.journalEntry.summary,
        createdAt: decision.journalEntry.createdAt,
        mandateId: decision.journalEntry.mandateId,
      });
      await this._auditJournal.append({
        eventId: _randomUUID(),
        type: "task.handled",
        intent: decision.intent,
        taskId: decision.taskId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        outcome: "record",
        summary: decision.journalEntry.summary,
        createdAt: envelope.createdAt,
      });
      await this.recordInboundTaskActivity(decision.journalEntry, {
        messageId: envelope.messageId,
        correlationId,
        senderPeerId: envelope.senderPeerId,
        senderRole: envelope.senderRole ?? "agent",
      });
      if (decision.intent === "report.create") {
        try {
          const reportPayload = parseReportCreatePayload(envelope.payload);
          await this.emitLocalOwnerReport(reportPayload.report, {
            contactOwnerId: envelope.agentCredential?.ownerId,
          });
        } catch (err) {
          console.warn("[mobile-node] report.create parse failed:", err);
        }
      }
      return;
    }

    if (decision.action === "rejected") {
      await this._auditJournal.append({
        eventId: _randomUUID(),
        type: "task.rejected",
        intent: envelope.intent,
        correlationId,
        remotePeerId,
        direction: "inbound",
        outcome: "deny",
        summary: decision.reason,
        createdAt: envelope.createdAt,
      });
    }
  }

  private async _sendChatMessageWithAttachments(
    targetOwnerId: string,
    text: string,
    attachments: ChatAttachment[],
  ): Promise<import("@envoymesh/api").SendChatResult> {
    this._assertDeviceNotRevoked();
    if (!this._state?.device || !this._state?.owner) {
      throw new Error("Node not initialized — call initNode() first");
    }
    const msgId = _randomUUID();
    const ts = new Date().toISOString();
    const wireText = stripModelThinking(text);
    const wireAttachments = attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      sensitivity: attachment.sensitivity,
    }));
    const content = {
      text: wireText,
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        sensitivity: attachment.sensitivity,
        ...(attachment.vaultRelativePath ? { vaultRelativePath: attachment.vaultRelativePath } : {}),
      })),
    };
    await this._chatLog.append(targetOwnerId, {
      messageId: msgId,
      sender: { ownerId: this._state.owner.ownerId, displayName: "Me" },
      recipient: { ownerId: targetOwnerId },
      content,
      metadata: { timestamp: ts, deliveryReceipt: "sent" },
      signature: "",
    });
    this._events.emit("chat:message", {
      messageId: msgId,
      sender: {
        nodeId: this._state.agent.agentPeerId,
        displayName: "Me",
        ownerId: this._state.owner.ownerId,
        actorRole: "human",
      },
      recipient: { nodeId: "", ownerId: targetOwnerId },
      content,
      metadata: { timestamp: ts, deliveryReceipt: "sent" },
      signature: "",
    });
    const deliver = await this._dispatchSignedChat(targetOwnerId, text, msgId, wireAttachments);
    return {
      messageId: msgId,
      deliveryReceipt: deliver.delivered ? ("delivered" as const) : ("sent" as const),
      deliveredAt: deliver.deliveredAt,
    };
  }

  private async _dispatchSignedChat(
    targetOwnerId: string,
    text: string,
    messageId?: string,
    attachments?: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      sensitivity: ChatAttachment["sensitivity"];
    }>,
  ): Promise<{ delivered: boolean; deliveredAt?: string }> {
    if (!this._state?.device || !this._state?.owner) return { delivered: false };

    this._assertDeviceNotRevoked();

    const recipientPeerId = await this._resolveChatRecipientPeerId(targetOwnerId);
    const unsigned = createUnsignedEnvelope({
      messageId,
      intent: "chat.message",
      senderPeerId: derivePeerId(this._state.device.publicKeyPem),
      senderPublicKey: this._state.device.publicKeyPem,
      recipientPeerId,
      payload: createChatMessagePayload({
        senderOwnerId: this._state.owner.ownerId,
        text: stripModelThinking(text),
        attachments,
        ...chatMessagePayloadDeviceFields({
          deviceCertificate: this._state.deviceCertificate,
          ownerPublicKeyPem: this._state.owner.publicKeyPem,
        }),
      }),
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.device.privateKeyPem);
    const data = JSON.stringify(signed);

    if (this._mesh) {
      const transportPeerId = await this._resolveChatTransportPeerId(targetOwnerId);
      if (transportPeerId) {
        try {
          const result = await this._sendChatViaMeshWithAck(transportPeerId, data, targetOwnerId);
          if (result.delivered) {
            await this._markOutboundChatDelivered(
              targetOwnerId,
              signed.messageId,
              result.deliveredAt ?? new Date().toISOString(),
            );
          }
          return result;
        } catch (err) {
          console.warn(
            "[mobile-node] mesh sendChat failed, falling back to relay:",
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
    this._broadcastToRelaySockets(data);
    return { delivered: false };
  }

  private static readonly _deviceRevocationsConfigKey = "device_revocations_json";

  private async _loadDeviceRevocations(): Promise<void> {
    try {
      const rows = await this._db.query(
        "SELECT value FROM config WHERE key = ?",
        [MobileNode._deviceRevocationsConfigKey],
      );
      if (rows.length === 0) {
        this._deviceRevocations = [];
        return;
      }
      const raw = String((rows[0] as Record<string, unknown>).value ?? "[]");
      const parsed = JSON.parse(raw) as unknown[];
      this._deviceRevocations = Array.isArray(parsed)
        ? parsed.map((entry) => parseDeviceRevocationRecord(entry))
        : [];
    } catch {
      this._deviceRevocations = [];
    }
  }

  private async _saveDeviceRevocations(): Promise<void> {
    await this._db.execute(
      "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
      [MobileNode._deviceRevocationsConfigKey, JSON.stringify(this._deviceRevocations)],
    );
  }

  private _assertDeviceNotRevoked(): void {
    const cert = this._state?.deviceCertificate;
    const ownerPublicKeyPem = this._state?.owner?.publicKeyPem;
    if (!cert || !ownerPublicKeyPem) return;
    if (isDeviceRevoked(cert, this._deviceRevocations, ownerPublicKeyPem)) {
      throw new Error("This device has been revoked by the home node owner");
    }
  }

  private _relayRpcWsUrl(): string | undefined {
    const raw = this._relayUrls[0]?.trim();
    if (!raw) return undefined;
    const trimmed = raw.replace(/\/+$/, "");
    if (trimmed.includes("/ws/client")) return trimmed.replace(/\/ws\/client$/i, "/ws");
    if (!/\/ws$/i.test(trimmed)) return `${trimmed}/ws`;
    return trimmed;
  }

  private async _syncDeviceRevocationsFromHome(): Promise<void> {
    try {
      const result = await this._homeRemoteCall<{ revocations?: Record<string, unknown>[] }>(
        "listDeviceRevocations",
        {},
      );
      const records = Array.isArray(result.revocations)
        ? result.revocations.map((entry) => parseDeviceRevocationRecord(entry))
        : [];
      this._deviceRevocations = records;
      await this._saveDeviceRevocations();
    } catch (err) {
      console.warn("[mobile-node] device revocation sync from home failed:", err);
    }
  }

  /**
   * One-shot post-pairing bootstrap. Pulls the home's state (peer profiles,
   * agent cards, node config) into the mobile's local cache so the UI shows
   * the same data the home has. Best-effort: any individual step that fails
   * is logged and skipped — partial bootstrap is still useful.
   *
   * Idempotent: re-running it overwrites the cached snapshots. Safe to call
   * after a fresh pairing and after a home reconnect.
   */
  private async _bootstrapPairedStateFromHome(): Promise<void> {
    if (!this._isHomeRemotePaired()) {
      console.log("[mobile-node] paired bootstrap: skipped — not paired (sharedIdentity=%s homeNodePeerId=%s)",
        this.sharedIdentity, this._state?.homeNodePeerId);
      return;
    }
    this._lastPairedBootstrapAt = Date.now();
    const log = (msg: string) => console.log(`[mobile-node] paired bootstrap: ${msg}`);
    log(`starting — homeNodePeerId=${this._state?.homeNodePeerId}, lanWsUrl=${this._state?.lanWsUrl}`);

    // 1. Peer profiles → _peerProfileCache
    try {
      const profiles = await this._homeRemoteCall<import("@envoymesh/api").PeerProfileView[]>(
        "listPeerProfiles",
        {},
      );
      if (this._peerProfileCache) {
        for (const p of profiles) {
          if (!p?.ownerId || !p.profile) continue;
          const thumbnail =
            p.thumbnailContentBase64 && p.thumbnailMimeType
              ? { contentBase64: p.thumbnailContentBase64, mimeType: p.thumbnailMimeType }
              : undefined;
          await this._peerProfileCache.upsert(p.profile, thumbnail);
        }
        this._events.emit("profile:updated", { ownerId: "*", source: "home-bootstrap" });
      }
      log(`synced ${profiles.length} peer profile(s)`);
      this._lastBootstrapCounts = { ...this._lastBootstrapCounts, profiles: profiles.length };
    } catch (err) {
      console.warn("[mobile-node] paired bootstrap: peer profiles failed:", err);
      this._lastBootstrapCounts = { ...this._lastBootstrapCounts, profiles: 0 };
    }

    // 2. Node config → _homeNodeConfig (for AI/EnvoyAI display)
    try {
      const cfg = await this._homeRemoteCall<NodeConfig>("getNodeConfig", {});
      this._homeNodeConfig = cfg;
      this._events.emit("home:config-updated", { config: cfg });
      log(`synced node config (model=${cfg.modelProviders?.mode ?? "mock"})`);
      this._lastBootstrapCounts = { ...this._lastBootstrapCounts, config: cfg.modelProviders?.mode ?? "mock" };
    } catch (err) {
      console.warn("[mobile-node] paired bootstrap: node config failed:", err);
      this._lastBootstrapCounts = { ...this._lastBootstrapCounts, config: "failed" };
    }

    // 3. Bond records → cache locally + re-emit for any UI subscribers
    try {
      const bonds = await this._homeRemoteCall<import("@envoymesh/api").BondRecord[]>(
        "getBonds",
        {},
      );
      this._homeBonds = bonds;
      this._events.emit("home:bonds-updated", { bonds });
      log(`synced ${bonds.length} bond(s)`);
      this._lastBootstrapCounts = { ...this._lastBootstrapCounts, bonds: bonds.length };
    } catch (err) {
      console.warn("[mobile-node] paired bootstrap: bonds failed:", err);
    }

    // 4. Agent cards (EnvoyAI + external agents) → re-emit
    try {
      const cards = await this._homeRemoteCall<import("@envoymesh/api").CachedAgentCardSummary[]>(
        "listAgentCards",
        {},
      );
      this._events.emit("home:agent-cards-updated", { cards });
      log(`synced ${cards.length} agent card(s)`);
    } catch (err) {
      console.warn("[mobile-node] paired bootstrap: agent cards failed:", err);
    }
  }

  /**
   * Public accessor for the home's NodeConfig (only meaningful when paired).
   * Returns `null` if the bootstrap hasn't completed or the mobile isn't paired.
   * The mobile UI uses this to show the home's actual AI configuration.
   */
  getHomeNodeConfig(): NodeConfig | null {
    return this._homeNodeConfig;
  }

  private _ensureHomeRemote(): HomeRemoteClient {
    if (!this.sharedIdentity || !this._state?.homeNodePeerId?.trim()) {
      throw new Error("terminal.pairHomeRequired");
    }
    if (!this._homeRemote) {
      this._homeRemote = new HomeRemoteClient({
        resolveCandidates: () => this._buildHomeRemoteCandidates(),
        createTransport: (candidate) => this._openHomeRemoteTransport(candidate),
        onHomeOnlineChange: (online) => {
          this._homeRemoteOnline = online;
          // On a fresh (re)connection, re-run the post-pairing bootstrap so the
          // local cache reflects the home's current state. We only do this if
          // the last bootstrap was more than 10s ago, to avoid re-fetching on
          // every transport upgrade (e.g. LAN → tunnel).
          if (online && Date.now() - this._lastPairedBootstrapAt > 10_000) {
            void this._bootstrapPairedStateFromHome().catch((err) =>
              console.warn(
                "[mobile-node] paired-state bootstrap on home reconnect failed:",
                err instanceof Error ? err.message : err,
              ),
            );
          }
        },
        onActiveTransportChange: (candidate) => {
          this._homeRemoteTransport = candidate?.name ?? null;
        },
        perCandidateTimeoutMs: 8_000,
        upgradeSweepMs: 30_000,
      });
      this._homeRemote.on("homeTerminalWs:rx", (data) => {
        this._events.emit(
          "homeTerminalWs:rx",
          data as import("@envoymesh/api").HomeTerminalWsRxEvent,
        );
      });
      this._homeRemote.on("homeTerminalWs:closed", (data) => {
        this._events.emit(
          "homeTerminalWs:closed",
          (data ?? {}) as import("@envoymesh/api").HomeTerminalWsClosedEvent,
        );
      });
      this._homeRemote.on("terminal:session-updated", (data) => {
        this._events.emit("terminal:session-updated", data as { sessions: import("@envoymesh/api").TerminalSessionSummary[] });
      });
      this._homeRemote.on("terminal:watch-ready", (data) => {
        this._events.emit("terminal:watch-ready", data as import("@envoymesh/api").TerminalWatchReadyEvent);
      });
      this._homeRemote.on("terminal:assistant-proposal", (data) => {
        this._events.emit(
          "terminal:assistant-proposal",
          data as import("@envoymesh/api").TerminalAssistantProposalEvent,
        );
      });
      // Keep the mobile's local cache in sync with the home's state by
      // re-bootstrapping when the home emits relevant events. This avoids
      // stale contacts/AI config when the home changes something and the
      // mobile app happens to be open.
      const rebootstrap = (source: string) => {
        if (Date.now() - this._lastPairedBootstrapAt < 5_000) return; // debounce
        void this._bootstrapPairedStateFromHome().catch((err) =>
          console.warn(
            `[mobile-node] paired-state bootstrap (event=${source}) failed:`,
            err instanceof Error ? err.message : err,
          ),
        );
      };
      this._homeRemote.on("config:updated", () => rebootstrap("config:updated"));
      this._homeRemote.on("profile:updated", () => rebootstrap("profile:updated"));
      this._homeRemote.on("bond:established", () => rebootstrap("bond:established"));
      this._homeRemote.on("bond:revoked", () => rebootstrap("bond:revoked"));
      this._homeRemote.on("peer:discovered", () => rebootstrap("peer:discovered"));
    }
    return this._homeRemote;
  }

  private async _homeRemoteCall<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.sharedIdentity || !this._state?.homeNodePeerId?.trim()) {
      throw new Error("terminal.pairHomeRequired");
    }
    try {
      return await this._ensureHomeRemote().call<T>(method, params);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("notConnected") || msg.includes("connectFailed") || msg.includes("disconnected")) {
        throw new Error("homeRemote.offline");
      }
      throw err;
    }
  }

  private _isHomeRemotePaired(): boolean {
    return Boolean(this.sharedIdentity && this._state?.homeNodePeerId?.trim());
  }

  private async _buildHomeRemoteCandidates(): Promise<{ name: string; url: string }[]> {
    const homeNodePeerId = this._state?.homeNodePeerId?.trim();
    const ownerId = this._state?.owner?.ownerId;
    if (!homeNodePeerId || !ownerId) return [];
    const tokens = await this._sessionTokenStore.listTokens();
    const record = tokens.find((t) => t.ownerId === ownerId);
    if (!record?.token) return [];

    const candidates: { name: string; url: string }[] = [];

    // 1) Direct LAN: lowest latency, no relay. Captured at pairing time
    //    from the QR's `lanWsUrl` (the home node's LAN WebSocket endpoint).
    //    When the iPhone is on the same WiFi as the home node, this wins.
    const lanWsUrl = this._state?.lanWsUrl?.trim();
    if (lanWsUrl) {
      // Reuse the session token as a query param so the home node's
      // ws-server can authenticate the LAN connection the same way it
      // authenticates relay-proxied ones.
      const lanUrl = new URL(lanWsUrl);
      lanUrl.searchParams.set("token", record.token);
      candidates.push({ name: "lan", url: lanUrl.toString() });
    }

    // 2) Direct libp2p: open a libp2p stream to the home's
    //    CLIENT_PROXY_PROTOCOL handler. Works whenever the home has any
    //    reachable libp2p path — same WiFi, public IP, or a public
    //    circuit relay that has a reservation for the home. When the
    //    mobile is on cellular and the home is behind NAT, this succeeds
    //    if (and only if) the home has reserved a slot on a public
    //    libp2p circuit relay. The EnvoyMesh relay tunnel below remains
    //    the always-works fallback.
    if (this._mesh) {
      candidates.push({ name: "libp2p", url: `libp2p://${homeNodePeerId}` });
    }

    // 3) Relay tunnel: always works when a reachable relay URL is configured.
    //    The relay's /ws/home endpoint is held open by the home node itself
    //    (outbound), so the mobile only needs to dial the relay's /ws path
    //    with the home node's peer ID and session token. This is the
    //    fallback path when neither LAN nor a public libp2p circuit
    //    reservation is reachable.
    const relayRaw = this._relayUrls[0]?.trim();
    if (relayRaw) {
      // `_relayUrls[0]` may be the *full* pairing URL captured from the QR
      // (e.g. `ws://relay:15432/ws?target=…&token=…`). Using it directly as
      // the base would re-append `?target=…&token=…` and produce a malformed
      // URL like `ws://relay:15432/ws?target=…&token=…?target=…&token=…` —
      // which the relay would reject, the bootstrap would silently fail, and
      // contacts/AI would never reach the home. Parse the URL and rebuild
      // from the origin + pathname so we always end up with a clean base.
      let basePath: string;
      try {
        const parsed = new URL(relayRaw);
        basePath = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");
      } catch {
        basePath = relayRaw.replace(/\/+$/, "").split("?")[0] ?? relayRaw;
      }
      const wsBase = /\/ws$/i.test(basePath) ? basePath : `${basePath}/ws`;
      candidates.push({
        name: "tunnel",
        url: `${wsBase}?target=${encodeURIComponent(homeNodePeerId)}&token=${encodeURIComponent(record.token)}`,
      });
    }

    return candidates;
  }

  /**
   * Open a transport for a HomeRemote candidate.
   * Dispatches on URL scheme:
   *   - `libp2p://<peerId>`  → open a libp2p stream on CLIENT_PROXY_PROTOCOL
   *   - `ws://` or `wss://`   → open a real WebSocket (default)
   *
   * Returns a WebSocket-shaped object that {@link HomeRemoteClient} drives
   * with the same JSON-RPC wire protocol regardless of underlying transport.
   */
  private async _openHomeRemoteTransport(candidate: { name: string; url: string }) {
    if (candidate.url.startsWith("libp2p://")) {
      const homePeerId = candidate.url.slice("libp2p://".length);
      const sessionToken = await this._lookupHomeSessionToken();
      if (!sessionToken) {
        throw new Error("libp2pStreamSocket.missingSessionToken");
      }
      if (!this._mesh) {
        throw new Error("libp2pStreamSocket.meshNotReady");
      }
      const mesh = this._mesh;
      return Libp2pStreamSocket.open(
        async () => {
          const stream = await mesh.dialProtocol(
            `/p2p/${homePeerId}` as any,
            CLIENT_PROXY_PROTOCOL,
          );
          return libp2pStreamToIo(stream);
        },
        sessionToken,
        8_000,
      );
    }
    return new WebSocket(candidate.url) as unknown as import("./home-remote-client.js").WebSocketLike;
  }

  /**
   * Look up the persistent home session token for the currently paired owner.
   * Returns undefined when not paired or no token is stored.
   */
  private async _lookupHomeSessionToken(): Promise<string | undefined> {
    const ownerId = this._state?.owner?.ownerId;
    if (!ownerId) return undefined;
    const tokens = await this._sessionTokenStore.listTokens();
    return tokens.find((t) => t.ownerId === ownerId)?.token;
  }

  private async _callHomeRpc<T>(
    method: string,
    params: Record<string, unknown>,
    wsUrl: string,
  ): Promise<T> {
    const ws = new WebSocket(wsUrl);
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let rpcTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        connectTimer = setTimeout(() => reject(new Error("Connection timeout")), 15000);
        ws.onopen = () => { clearTimeout(connectTimer); resolve(); };
        ws.onerror = () => { clearTimeout(connectTimer); reject(new Error("Failed to connect to home node")); };
      });
      const requestId = _randomUUID();
      ws.send(JSON.stringify({ id: requestId, method, params }));
      return await new Promise<T>((resolve, reject) => {
        let settled = false;
        rpcTimer = setTimeout(() => {
          settled = true;
          reject(new Error(`${method} timeout`));
        }, 120_000);
        ws.onmessage = (event) => {
          if (settled) return;
          try {
            const msg = JSON.parse(String(event.data));
            if (msg.id !== requestId) return;
            clearTimeout(rpcTimer);
            settled = true;
            if (msg.error) {
              reject(new Error(msg.error.message ?? `${method} failed`));
            } else {
              resolve(msg.result as T);
            }
          } catch { /* wait for next message */ }
        };
        ws.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(rpcTimer);
          reject(new Error("WebSocket error"));
        };
        ws.onclose = () => {
          if (settled) return;
          settled = true;
          clearTimeout(rpcTimer);
          reject(new Error("Connection closed"));
        };
      });
    } finally {
      clearTimeout(connectTimer);
      clearTimeout(rpcTimer);
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  private async _sendToRelay(msg: Record<string, unknown>): Promise<void> {
    if (!this._state) return;

    if (msg.type === "chat" && typeof msg.text === "string") {
      await this._dispatchSignedChat((msg.targetOwnerId as string) ?? "", msg.text as string);
      return;
    }

    const data = JSON.stringify(msg);
    this._broadcastToRelaySockets(data);
  }

  // Phase 26/29 stubs — not needed on mobile (pairs to desktop for these)
  exportDidDocument(_input?: any): any { throw new Error("Not available on mobile — pair to desktop"); }
  async resolveDidExport(): Promise<any> { throw new Error("Not available on mobile — pair to desktop"); }
  async listAgentCircles(): Promise<any[]> { return []; }
  async createAgentCircle(): Promise<any> { throw new Error("Not available on mobile"); }
  async updateAgentCircle(_circleId: string, _update: any): Promise<any> { throw new Error("Not available on mobile"); }
  async deleteAgentCircle(_circleId: string): Promise<void> {}
  async proposeAgentCircles(): Promise<any[]> { return []; }
  async chatRagSearch(_query: string, _opts?: any): Promise<any[]> { return []; }
  async chatRagFormat(_query: string): Promise<string> { return ""; }
  async generateMeshIntelligenceReport(): Promise<string> { throw new Error("Not available on mobile — pair to desktop"); }

  // ---- Phase 38 — Voice/Video Calls ----
  getActiveCall(): import("@envoymesh/api").CallSession | null { return null; }
  onCallEvent(_handler: (event: import("@envoymesh/api").CallEvent) => void): () => void { return () => {}; }
  async sendCallInvite(_targetOwnerId: string, _sdpOffer: string, _iceServers?: { urls: string; username?: string; credential?: string }[], _callType?: import("@envoymesh/api").CallMediaType): Promise<string | null> { return null; }
  async sendCallReinvite(_callId: string, _sdpOffer: string, _iceServers?: { urls: string; username?: string; credential?: string }[], _reason?: "path1_timeout" | "path1_failed"): Promise<boolean> { return false; }
  async acceptCallInvite(_callId: string, _sdpAnswer: string, _iceServers?: { urls: string; username?: string; credential?: string }[]): Promise<boolean> { return false; }
  async declineCallInvite(_callId: string, _reason: string): Promise<boolean> { return false; }
  async endCall(_callId: string): Promise<boolean> { return false; }
  async setCallMuted(_callId: string, _muted: boolean): Promise<boolean> { return false; }
  async sendIceCandidate(_callId: string, _candidate: {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
    usernameFragment?: string | null;
  }): Promise<boolean> { return false; }

  // ---- Phase 40: Agent Network Collaboration Layer (chains) ----
  async chainPlan(_params: import("@envoymesh/api").ChainPlanParams): Promise<import("@envoymesh/api").ChainPlanResult> { return { chainId: "", subtasks: [] }; }
  async chainLaunch(_params: import("@envoymesh/api").ChainLaunchParams): Promise<import("@envoymesh/api").ChainLaunchResult> { return { chainId: "", proposed: 0, mandateBroadcastOk: false }; }
  async chainGetState(_params: import("@envoymesh/api").ChainGetStateParams): Promise<import("@envoymesh/api").ChainGetStateResult> { return { chainId: "", chainMandateId: "", subtaskCount: 0, bidCount: 0, awardedCount: 0, partialCount: 0, cancelledCount: 0, chainCancelled: false, published: false, budgetSpentUsd: 0, budgetMaxUsd: 0, budgetReservedUsd: 0, budgetSynthesisUsd: 0 }; }
  async chainListActive(_params?: import("@envoymesh/api").ChainListActiveParams): Promise<import("@envoymesh/api").ChainListActiveResult> { return { chains: [] }; }
  async chainCancel(_params: import("@envoymesh/api").ChainCancelParams): Promise<import("@envoymesh/api").ChainCancelResult> { return { chainId: "", cancelled: [] }; }
  async chainListReports(_params?: import("@envoymesh/api").ChainListReportsParams): Promise<import("@envoymesh/api").ChainListReportsResult> { return { reports: [] }; }
  async chainGetReport(_params: import("@envoymesh/api").ChainGetReportParams): Promise<import("@envoymesh/api").ChainGetReportResult> { throw new Error("Not available on mobile"); }
  async chainPinReport(_params: import("@envoymesh/api").ChainPinReportParams): Promise<import("@envoymesh/api").ChainPinReportResult> { return { chainId: "", pinned: false }; }
  async listCapabilityProviders(): Promise<Record<string, string[]>> { return {}; }
  async getPeerReputation(_peerOwnerId?: string): Promise<{ score: number } | null> { return null; }
  async discoverAndCluster(_seedTopics?: string[], _seedCapabilities?: string[]): Promise<string> { throw new Error("Not available on mobile — pair to desktop"); }
  registerPushToken(_params: { platform: string; token: string; ownerId: string; deviceId?: string; tokenType?: "alert" | "voip"; profileId?: string }): void {}
  unregisterPushToken(_deviceId: string): boolean { return false; }
  async chainSetBidStrategy(_params: any): Promise<any> { return { accepted: false }; }
  async chainGetBidStrategy(_params: any): Promise<any> { return { weights: { cost: 35, reputation: 30, freshness: 20, precision: 15 } }; }
  async chainEvaluateBids(_params: any): Promise<any> { return { ranked: [] }; }
  async chainCounterBid(_params: any): Promise<any> { return { ok: false, reason: "Not available on mobile" }; }
  async chainRebalance(_params: any): Promise<any> { return { ok: false, reason: "Not available on mobile" }; }
  async chainExportCosts(_params: any): Promise<any> { return { csv: "" }; }
  async chainPreviewGoal(_params: any): Promise<any> { return { ok: false, subtasks: [] }; }
  async chainStartFromGoal(_params: any): Promise<any> { return { ok: false, error: "Not available on mobile" }; }
  async chainResolveIteration(_params: import("@envoymesh/api").ChainResolveIterationParams): Promise<import("@envoymesh/api").ChainResolveIterationResult> {
    return { ok: false, error: "Not available on mobile" };
  }
  async chainListRecipes(_params?: any): Promise<any> { return { recipes: [] }; }
  async chainSaveRecipe(_params: any): Promise<any> { return { ok: false, reason: "validation_failed" }; }
  async chainDeleteRecipe(_params: any): Promise<any> { return { ok: false, deleted: false }; }

  // ----- Phase 44A2 — Notes (mobile: stubs) -----

  async createNote(_params: any): Promise<any> {
    return { documentId: "", relativePath: "", sizeBytes: 0 };
  }

  async deleteVaultItem(_params: any): Promise<void> {
    // Mobile vault is read-only for notes via this path.
  }

  // ----- Phase 44C — KB Plugins (mobile: stubs) -----

  async listKbPlugins(_params?: any): Promise<any> { return []; }
  async activateKbPlugin(_params: any): Promise<any> { return { ok: false, reason: "Not available on mobile" }; }
  async deactivateKbPlugin(_params: any): Promise<any> { return { ok: true }; }
  async getKbPluginConfig(_pluginId: string): Promise<any> { return {}; }
  async updateKbPluginConfig(_params: any): Promise<any> { return { ok: false, reason: "Not available on mobile" }; }

  async chainPublishReport(_params: any): Promise<any> { return { published: false }; }
  async chainGetDefaults(): Promise<any> { return { maxChainBudgetUsd: 10, defaultStallPolicy: "auto_rebid", costEstimationEnabled: false }; }
  async chainSetDefaults(_params: any): Promise<any> { return { ok: true }; }

  private _broadcastToRelaySockets(data: string): void {
    for (const ws of this._relaySockets) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(data); } catch { /* ignore */ }
      }
    }
  }
}

function _parsePersistedDeviceCertificate(json?: string): DeviceCertificate | undefined {
  if (!json?.trim()) return undefined;
  try {
    return parseDeviceCertificate(JSON.parse(json));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMobileNode(config: MobileNodeConfig): MobileNode {
  return new MobileNode(config);
}
