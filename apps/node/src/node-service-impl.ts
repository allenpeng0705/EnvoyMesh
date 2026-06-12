import type {
  AiSettings,
  BondRecord,
  BridgeStatus,
  PairingPayload,
  ChatMessage,
  ChatAttachment,
  ChatDiagnostics,
  ConnectivityDiagnostics,
  CapabilityTopicProviderHit,
  DiscoverCapabilityTopicParams,
  DiscoverCapabilityTopicResult,
  MorningReportEntry,
  ConnectionStatus,
  CreateHumanProfileInput,
  AgentIdentityDocument,
  HelloProfile,
  HelloRequest,
  HelloResponse,
  HumanProfile,
  ModelProviderConfig,
  NodeConfig,
  NodeProfile,
  NodeService,
  NodeServiceEvents,
  PeerConnectionInfo,
  PeerSearchResult,
  RelayConfig,
  SearchQuery,
  ChatRoom,
  SendChatResult,
  SendHelloOptions,
  SocialIntroProposal,
  NodeStatus,
  InitNodeOptions,
  NodeInitResult,
  HomeClawCoreProxyParams,
  HomeClawCoreProxyResult,
  LibraryItem,
  ListLibraryItemsParams,
  ListAllLocalFilesParams,
  ListAllLocalFilesResult,
  ReadLocalFileContentParams,
  OpenLocalFileParams,
  ShareOffer,
  PairDeviceParams,
  PairDeviceResult,
  PairSharedIdentityParams,
  PairSharedIdentityResult,
  ListAuthorizedDevicesResult,
  RevokeAuthorizedDeviceParams,
  RevokeAuthorizedDeviceResult,
  ListDeviceRevocationsResult,
  AgentShareProposal,
  SubmitAgentShareProposalParams,
  DiscoverPublishedLibraryParams,
  DiscoverPublishedLibraryPeerResult,
  PublishedLibraryFileHit,
  ExportLibraryItemToIpfsResult,
  PinLibraryItemExternalResult,
  CreateWanJoinInviteParams,
  CreateWanJoinInviteResult,
  ApplyWanJoinInviteResult,
  IpfsEngineStatus,
  VerifyLibraryItemIpfsGatewayParams,
  VerifyLibraryItemIpfsGatewayResult,
  ImportToLibraryParams,
  ImportToLibraryResult,
  RagIndexStatus,
  TransferStatus,
  SendChatAttachmentParams,
  SendChatAttachmentResult,
  SendChatRoomAttachmentParams,
  SendChatRoomAttachmentResult,
  ReadLibraryItemContentParams,
  ReadLibraryItemContentResult,
  AgentActivityRecord,
  ListAgentActivityParams,
  ListAuditEventsParams,
  ListTaskJournalParams,
  AuditEventSummary,
  TaskJournalSummary,
  PeerReputationSummary,
  CachedAgentCardSummary,
  PendingApprovalSummary,
  ApprovePendingApprovalResult,
  RequestMultiHopDiscoveryParams,
  RequestMultiHopDiscoveryResult,
  MultiHopDiscoveryMatch,
  MultiHopDiscoverySessionView,
  PeerProfileView,
} from "@envoymesh/api";
import type { DocumentAgentTurnResult, OwnerAgentTurnResult, CapabilityProviderJob, DocumentAcquisitionCandidate, DocumentAcquisitionJob, SocialProxySession } from "@envoymesh/api";
import {
  DEFAULT_RAG_INDEX_STATUS,
  runDocumentAgentTurn as runDocumentAgentTurnLoop,
  runOwnerAgentTurn as runOwnerAgentTurnLoop,
  matchAgentCapabilityRoutes,
  normalizeDocumentAutonomyPolicy,
  normalizeProfileMediaPolicy,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_LIBRARY_ITEM_PREVIEW_BYTES,
  pinCidToProvider,
  buildOwnerDidPresentation,
  parseDidLookupInput,
  didKeysMatch,
  buildCommerceReceiptFromTaskResult,
  mapCommerceReceiptToActivity,
  type CommerceReceiptRecord,
  type ListCommerceReceiptsParams,
  type RecordCommerceReceiptParams,
  deriveLocationDiscoveryTopics,
  profileCapabilityTags,
  profileCapabilityDiscoveryTopics,
  syncProfileTagsToManifestCapabilities,
} from "@envoymesh/api";
import { buildSignedChatDeliveredEnvelope } from "@envoymesh/api/chat-delivered";
import { resolveDidImportInput } from "@envoymesh/api/did-import";

import { randomUUID } from "node:crypto";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT,
  DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
  defaultBootstrapPresetsForDiscoveryProfile,
  normalizeBootstrapPresetsForContactsOnly,
  bondTrustRank,
  clampConnectivityTuningInput,
  DEFAULT_RELAY_CLIENT_CYCLE_INTERVAL_MS,
  resolveEnableMdns,
  resolveIdleTimerStretch,
  resolveLazyCapabilityDiscovery,
  stripModelThinking,
  MAX_PROFILE_GALLERY_PHOTOS,
  MAX_PROFILE_GALLERY_PHOTO_BYTES,
  MAX_PROFILE_THUMBNAIL_BYTES,
  type ProfileGalleryPhotoVisibility,
  type SetPublicProfileThumbnailParams,
  type UpsertProfileGalleryPhotoParams,
  type UpdateProfileGalleryPhotoVisibilityParams,
  buildVaultIndexOptionsFromKnowledgeBase,
  resolveAiKnowledgeBaseSettings,
  chatMessagePayloadDeviceFields,
  chatSenderActorFromEnvelope,
  applyAiIdentityForIdentity,
  shouldPushAgentActivity,
  shouldPostA2aChatLine,
  formatA2aChatSystemLine,
  resolveReportContactOwnerId,
  chatRoomThreadKey,
  ENVOY_AI_THREAD_KEY,
} from "@envoymesh/api";

import {
  createBondAcceptPayload,
  createBondRequestPayload,
  createChatMessagePayload,
  createHumanProfilePayload,
  ProfileGalleryPhotoSchema,
  ProfilePhotoRefSchema,
  createShareAcceptPayload,
  createShareRequestPayload,
  createUnsignedEnvelope,
  parseBondAcceptPayload,
  parseBondRequestPayload,
  parseChatMessagePayload,
  parseChatRoomSyncPayload,
  parseChatRoomMessagePayload,
  parseEnvelope,
  parseShareAcceptPayload,
  parseSharePreviewPayload,
  createDiscoveryRequestPayload,
  parseDiscoveryResponsePayload,
  createDiscoveryResponsePayload,
  createSyncStatePayload,
  createRendezvousRegisterPayload,
  createRendezvousQueryPayload,
  RendezvousResponsePayloadSchema,
  createKnowledgeQueryPayload,
  parseKnowledgeResponsePayload,
  createAgentCardRequestPayload,
  createHumanProfileFragmentPayload,
  createSocialIntroProposePayload,
  createSocialIntroOwnerReadyPayload,
  createSocialIntroSyncPayload,
  parseFriendMatchingPreferencesPayload,
  type HumanProfilePayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import {
  createDeviceCertificate,
  derivePeerId,
  encryptOwnerKeyForDevice,
  signHumanProfile,
  signUnsignedEnvelope,
  verifyFriendMatchingPreferences,
  createAgentCredential,
  generateAgentIdentity,
} from "@envoymesh/identity";
import {
  createAuditEvent,
  deriveCorrelationIdFromEnvelope,
  createLocalTaskStore,
  createLocalTrustStore,
  createLocalPeerDirectoryStore,
  createHumanProfileStore,
  createAgentIdentityStore,
  createLocalChatLogStore,
  createLocalChatRoomStore,
  createLocalChatRoomPendingSyncStore,
  createLocalChatRoomPendingMessageStore,
  type LocalChatRoomPendingSyncStore,
  type LocalChatRoomPendingMessageStore,
  createLocalAgentActivityStore,
  createChatDraftStore,
  createAutoReplyLimitStore,
  type AutoReplyLimitStore,
  createTaskRuntimeStateStore,
  createRelayStateStore,
  createCapabilityManifestStore,
  createSessionTokenStore,
  createDeviceAuthorizationStore,
  createAgentCardStore,
  createContactOwnerKeyStore,
  createCommerceReceiptStore,
  type CommerceReceiptStore,
  createReputationAnchorStore,
  createMultiHopDiscoveryStore,
  createLocalPeerReputationStore,
  type AgentCardStore,
  type ContactOwnerKeyStore,
  type ReputationAnchorStore,
  type MultiHopDiscoveryStore,
  type MultiHopDiscoverySession,
  type PeerReputationStore,
  loadOrCreateNodeProfile,
  type LocalTaskStore,
  type LocalTrustStore,
  type LocalPeerDirectoryStore,
  type LocalChatLogStore,
  type LocalChatRoomStore,
  type LocalAgentActivityStore,
  type ChatDraftStore,
  type HumanProfileStore,
  type AgentIdentityStore,
  type TaskRuntimeStateStore,
  type RelayStateStore,
  type CapabilityManifestStore,
  type SessionTokenStore,
  type DeviceAuthorizationStore,
  buildMorningReportDigest,
  createPeerProfileCacheStore,
  type PeerProfileCacheStore,
  type CachedPeerProfile,
  createSocialProxySessionStore,
  type SocialProxySessionStore,
  createDocumentAcquisitionJobStore,
  createCapabilityProviderJobStore,
  type DocumentAcquisitionJobStore,
  type CapabilityProviderJobStore,
} from "@envoymesh/local-store";
import { createNodeConfigStore, createStubNodeConfigStore, type PersistedNodeConfig } from "./node-config-store.js";
import { loadOrCreateLibp2pPrivateKey } from "./libp2p-key-loader.js";
import { createDiscoverySeedStore, type DiscoverySeedStore } from "./discovery-seed-store.js";
import { seedAddrsForDiscoveryProfile, peerDiscoverySourceFromMultiaddrs, shouldPersistPeerDiscoverySeeds } from "./peer-discovery-telemetry.js";
import { resolveBootstrapAddresses, looksLikeDomain } from "./bootstrap-resolver.js";
import { createInboundMessageGuard, type InboundMessageGuard } from "./inbound-guard.js";
import {
  verifyInboundChatDevice,
  formatChatSenderDisplayName,
  bindDeviceAuthorizationStore,
} from "./chat-device-auth.js";
import {
  createChatRoomImpl,
  dismissChatRoomImpl,
  handleInboundChatRoomMessageImpl,
  handleInboundChatRoomSyncImpl,
  inviteToChatRoomImpl,
  leaveChatRoomImpl,
  listChatRoomsImpl,
  removeMembersFromChatRoomImpl,
  renameChatRoomImpl,
  sendChatRoomMessageImpl,
  sendChatRoomAttachmentImpl,
  flushPendingRoomSyncsImpl,
  flushPendingRoomMessagesImpl,
  type ChatRoomServiceDeps,
} from "./chat-room-service.js";
import { createTaskDispatcher } from "./task-dispatcher.js";
import {
  parseTerminalAssistantCorrelationId,
  stripTerminalAssistantCorrelationPrefix,
} from "./terminal-assistant-command.js";
import { predictIntent } from "./intent-predictor.js";
import { buildVaultIndex, assertPathInsideVault } from "@envoymesh/vault";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ENVOY_MESSAGE_PROTOCOL,
  EnvoyMesh,
  filterBootstrapMultiaddrs,
  filterUsableOutboundPeerDialHints,
  ENVOY_CHAT_PROTOCOL,
  ENVOY_DATA_PROTOCOL,
  type EnvoyMeshOptions,
} from "@envoymesh/network";
import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { sendVaultFileViaDataTransfer } from "./node-file-share.js";
import { openPathWithDefaultApp, revealPathInFileManager } from "./vault-file-open.js";
import { TransferTracker } from "./transfer-tracker.js";
import { isSafeVaultPath } from "./share-inbound.js";
import {
  importProfilePhotoBytes,
  parseProfilePhotoMime,
  photoIdFromGalleryPath,
  profileGalleryVaultPath,
  profileThumbnailVaultPath,
} from "./profile-photo.js";
import {
  handleInboundProfileRequest,
  handleInboundProfileSync,
} from "./profile-sync-inbound.js";
import {
  buildSignedProfilePayloadEnvelope,
  sendProfileRequest,
  sendProfileResponse,
  sendProfileSyncToBonds,
  isLibp2pPeerId,
} from "./profile-sync-outbound.js";
import { probeNearbyPeerProfile } from "./nearby-profile-probe.js";
import { deliverChatEnvelopeWithRetry, type ChatDeliverResult } from "./chat-outbound-deliver.js";
import { pickBestLibp2pPeerDirectoryRecord } from "./peer-transport-resolve.js";
import {
  normalizeTransportPeerId,
  ownerIdFromProfileIntent,
} from "./peer-directory-learn.js";
import { createPublishedLibraryStore } from "./published-library-store.js";
import { createPublishedExternalStore } from "./published-external-store.js";
import { exportVaultDocumentToIpfs } from "./vault-ipfs-export-service.js";
import {
  getIpfsEngineStatus,
  normalizeIpfsExportEngineSelection,
  resolveIpfsExportEngineSelection,
} from "./ipfs-export-router.js";
import { verifyVaultDocumentIpfsGateway } from "./vault-ipfs-gateway-verify.js";
import { normalizeGatewayBaseUrl } from "./ipfs-gateway.js";
import { createAgentShareProposalStore } from "./agent-share-proposal-store.js";
import { PUBLISHED_LIB_CAPABILITY } from "./discovery-inbound.js";
import { loadBridgeIdentity, saveBridgeIdentity } from "./bridge/identity-store.js";
import type { BridgeIdentity } from "./bridge/pipe.js";

import { executeTool, type MeshToolContext } from "./tool-registry.js";
import {
  buildFriendAutopilotActivityRecord,
  runFriendAutopilotPass,
} from "./friend-autopilot-runner.js";
import { runSocialProxyPass, advanceSocialProxySession } from "./social-proxy-orchestrator.js";
import { AgentCircleStore } from "./agent-circle-store.js";
import { proposeCircles, circleFromProposal } from "./circle-proposer.js";
import type { AgentCircle } from "@envoymesh/api";
import {
  advanceDocumentAcquisitionJob,
  runDocumentAcquisitionWorkerTick,
  startDocumentAcquisitionJob as startDocumentAcquisitionJobWorker,
} from "./document-acquisition-worker.js";
import {
  advanceCapabilityProviderJob,
  runCapabilityProviderWorkerTick,
  startCapabilityProviderJob as startCapabilityProviderJobWorker,
} from "./capability-provider-worker.js";
import { executeCapabilityRouteStep } from "./capability-route-executor.js";
import { sendAgentTaskPropose } from "./agent-task-propose-send.js";
import {
  shouldRunScheduledFriendAutopilot,
  transitionDocumentAcquisitionJob,
  transitionCapabilityProviderJob,
  transitionSocialProxySession,
} from "@envoymesh/api";
import { buildOutboundDialHints } from "./outbound-dial-hints.js";
import { buildChatDiagnostics } from "./chat-diagnostics.js";
import { NodeDiscoveryRuntime } from "./node-service-discovery.js";
import { sendSyncStateUpdateViaMesh } from "./node-service-sync.js";
import {
  applyWanJoinInviteViaRuntime,
  createWanJoinInviteViaRuntime,
  getConnectivityDiagnosticsViaRuntime,
  type NodeWanRuntimeDeps,
} from "./node-service-wan.js";
import { startRelayClientScheduler, runRelayClientCycle } from "./relay-client-cycle.js";
import { buildAutoCapabilityTopics, runCapabilityDiscoveryCycle } from "./capability-discovery.js";
import { recordMeshActivity, resolveConnectivityRuntime, shouldRunPeriodicCapabilityFind, type ResolvedConnectivityRuntime } from "./connectivity-runtime.js";
import { startNodeStatsInterval } from "./node-stats-log.js";
import { handleInboundBondIntent } from "./bond-inbound.js";
import { handleInboundSocialIntroIntent } from "./social-intro-inbound.js";
import { handleInboundKnowledgeQuery } from "./knowledge-query-inbound.js";
import { askOwnerAgentPlanner, scanOwnerAgentOutbound } from "./owner-agent-planner-inbound.js";
import { loadAgentIdentitySection } from "./agent-identity-context.js";
import { resolveBundledSkillsDir } from "./bundled-paths.js";
import { spawnOpenClawGateway } from "./openclaw-gateway-spawn.js";
import { ensureOpenClawWorkspace, openClawGatewayStateDir, openClawWorkspaceDir } from "./openclaw-workspace.js";
import {
  buildAllLocalFilesList,
} from "./local-files.js";
import {
  assertPathInsideOpenClawWorkspace,
  listOpenClawWorkspaceFilesFromDir,
  readOpenClawWorkspaceFileFromDir,
  type WorkspaceFileItem,
} from "./openclaw-workspace-files.js";
import {
  buildEnvoyMeshRetrievedContext,
} from "./openclaw-turn-context.js";
import {
  buildOpenClawGatewayAgentSection,
  buildOpenClawGatewaySearchEnv,
  buildOpenClawGatewaySkillEntries,
  isOpenClawEnvoymeshWebhookReady,
  resolveActiveWebSearchProvider,
} from "./openclaw-gateway-config.js";
import { resolveAssistantAgentUrl } from "./bridge/config.js";
import { reclaimAssistantGatewayPort } from "./openclaw-gateway-port.js";
import { runInboundChatAssist } from "./inbound-chat-assist.js";
import { recordTaskJournalActivity, emitOwnerReport } from "./agent-activity-hooks.js";
import { recordCommerceReceiptFromTaskResult } from "./commerce-receipt-inbound.js";
import type { Report } from "@envoymesh/protocol";
import type { DispatcherDecision } from "./task-dispatcher.js";
import type { ApprovalQueue, DiscoveryForwardApprovalPayload } from "@envoymesh/api";
import { executeApprovedAction } from "@envoymesh/api";
import {
  buildForwardedDiscoveryPayload,
  queueDiscoveryForwardApproval,
} from "./discovery-forward.js";
import { executeHomeClawCoreProxy } from "./homeclaw-core-proxy.js";
import { chatLogRowsToViews, searchVaultKnowledgeBase } from "./ai-context.js";
import { createRagService, type RagService } from "./rag-service.js";

const MAX_FRIEND_MATCHING_PREFS_CHARS = 4096;

/** Intents allowed on the native / bridge agent credential for document + mesh tools. */
const NATIVE_AGENT_TOOL_SCOPE = [
  "chat.message",
  "knowledge.query",
  "discovery.request",
  "discovery.response",
  "share.request",
  "share.preview",
  "share.accept",
  "social.intro.sync",
  "social.intro.propose",
  "bond.request",
] as const;

/** Unblocks when an underlying `fs.readFile` or mutex never settles (seen on some Windows setups). */
function raceWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Per-topic DHT provide/cancel cap so profile save does not block on sparse WAN bootstrap. */
const DISCOVERY_TOPIC_OP_TIMEOUT_MS = 10_000;

/**
 * NodeServiceImpl implements the NodeService interface.
 *
 * Supports two modes:
 * 1. Traditional (mesh pre-created by index.ts): mesh is passed in constructor
 * 2. Envoy-managed: Envoy calls initNode/startNode/stopNode to manage lifecycle
 */
class NodeServiceImpl implements NodeService {
  private _mesh: EnvoyMesh | undefined;
  /** When libp2p is started by `index.ts` (CLI) with `createNodeService(undefined, …)`, this points at that stack for reachability tagging. */
  private _externalMesh?: EnvoyMesh;
  private _profile: NodeProfile | undefined;
  private readonly _trustStore: LocalTrustStore;
  private readonly _peerDirectoryStore: LocalPeerDirectoryStore;
  private readonly _humanProfileStore: HumanProfileStore;
  private readonly _agentIdentityStore: AgentIdentityStore | null;
  private readonly _chatLogStore: LocalChatLogStore | null;
  private readonly _chatRoomStore: LocalChatRoomStore | null;
  private readonly _chatRoomPendingSyncStore: LocalChatRoomPendingSyncStore | null;
  private readonly _chatRoomPendingMessageStore: LocalChatRoomPendingMessageStore | null;
  private readonly _groupDeliveryPending = new Map<
    string,
    { threadKey: string; pending: Set<string> }
  >();
  private _chatRoomSyncFlushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly _agentActivityStore: LocalAgentActivityStore | null;
  private readonly _agentCardStore: AgentCardStore | null;
  private readonly _chatDraftStore: ChatDraftStore | null;
  private readonly _autoReplyLimitStore: AutoReplyLimitStore | null;
  private readonly _capabilityManifestStore: CapabilityManifestStore | null;
  private readonly _configStore: ReturnType<typeof createNodeConfigStore>;
  private readonly _profileDir: string;
  /** Root directory for {@link listLibraryItems} (ENVOYMESH_VAULT or shared_vault). */
  private readonly _vaultDir: string;
  private _ragService: RagService | null = null;
  private _ragServiceInit: Promise<RagService | null> | null = null;
  private _agentShareProposalStore: ReturnType<typeof createAgentShareProposalStore> | undefined;
  private _agentGroupChatCounters: Map<string, { count: number; windowStart: number }> = new Map();

  // App-managed mode stores
  private _taskStore: LocalTaskStore | undefined;
  private _relayStateStore: RelayStateStore | undefined;
  private _discoverySeedStore: DiscoverySeedStore | undefined;
  private _taskRuntimeStore: TaskRuntimeStateStore | undefined;
  private _inboundGuard: InboundMessageGuard | undefined;
  private _taskDispatcher: ReturnType<typeof createTaskDispatcher> | undefined;

  private _nodeStatus: NodeStatus = "offline";
  private _bridgeStatus: BridgeStatus | null = null;
  private _bridgeChatHandler: ((envelope: EnvoyEnvelope, remotePeerId: string) => Promise<void>) | null = null;
  private _styleAdapter: import("./style-adapter.js").StyleAdapter | null = null;
  private _wsPort: number = 3030;
  private _wsPath: string = "/ws";
  private _relayPublicWsUrl: string | undefined;
  private _terminalManager: import("./terminal-manager.js").TerminalManager | null = null;
  private _terminalAgentAssist: import("./terminal-agent-assist.js").TerminalAgentAssist | null = null;

  /** Latest QR / `getPairingPayload` token for optional companion auto-pair (short TTL). */
  private _pairingToken: string | null = null;
  private _pairingTokenIssuedAt = 0;
  private static readonly _pairingTokenTtlMs = 10 * 60 * 1000;

  /** Persistent session token store for long-lived pairings (no QR re-scan). */
  private readonly _sessionTokenStore: SessionTokenStore | null;
  private readonly _deviceAuthorizationStore: DeviceAuthorizationStore | null;
  private readonly _contactOwnerKeyStore: ContactOwnerKeyStore | null;
  private readonly _peerProfileCacheStore: PeerProfileCacheStore | null;
  private readonly _commerceReceiptStore: CommerceReceiptStore | null;
  private readonly _reputationAnchorStore: ReputationAnchorStore | null;
  private readonly _multihopDiscoveryStore: MultiHopDiscoveryStore | null;
  private readonly _peerReputationStore: PeerReputationStore | null;
  private readonly _socialProxyStore: SocialProxySessionStore | null;
  private readonly _documentAcquisitionJobStore: DocumentAcquisitionJobStore | null;
  private readonly _capabilityProviderJobStore: CapabilityProviderJobStore | null;
  private readonly _circleStore: AgentCircleStore | null;
  private _approvalQueue: ApprovalQueue | null = null;

  /** Best-effort last failure for {@link getConnectionStatus} (cleared on successful {@link startNode}). */
  private _lastNodeError?: string;
  private _lastNodeErrorAt?: string;

  // Pending hello requests (messageId -> info) awaiting user acceptance
  private readonly _pendingHelloRequests = new Map<string, {
    remotePeerId: string;
    requesterOwnerId: string;
    requesterDisplayName: string;
    message: string;
    requestedLevel: string;
    createdAt: string;
  }>();

  /** Trust-mode intro proposes — memory-only inbox until approve / hello / decline */
  private readonly _pendingSocialIntroProposals = new Map<
    string,
    SocialIntroProposal & { ownerCommitmentRef?: string }
  >();

  /** Outbound push: our `share.request` message id → until we receive `share.preview`. */
  private readonly _pendingPushShareByRequestMsgId = new Map<
    string,
    { relativePath: string; toPeerId: string; deliveryChannel?: "inbox" | "chat" }
  >();
  /** Outbound pull: peer vault path requested via fileOrigin=responder until preview arrives. */
  private readonly _pendingPullShareByRequestMsgId = new Map<
    string,
    {
      peerRelativePath: string;
      targetOwnerId: string;
      toPeerId: string;
      sensitivity: "public" | "friends" | "private";
    }
  >();
  /** After inbound `share.preview`: preview message id → send file to peer (we are holder). */
  private readonly _pendingFileSendByPreviewMsgId = new Map<
    string,
    { relativePath: string; toPeerId: string; deliveryChannel?: "inbox" | "chat" }
  >();
  /** `share.accept` arrived before inbound `share.preview` linked the pending send. */
  private readonly _deferredShareAcceptByPreviewId = new Map<
    string,
    {
      envelope: EnvoyEnvelope;
      remotePeerId: string;
      taskStore: LocalTaskStore;
      vaultDir: string;
      inboundConnectionAddrs?: string[];
    }
  >();

  /** Serialize outbound chat streams per libp2p peer to avoid concurrent newStream races. */
  private readonly _chatSendChains = new Map<string, Promise<void>>();
  private static readonly _PROFILE_REQUEST_COOLDOWN_MS = 15_000;
  private static readonly _NEARBY_PROFILE_PROBE_COOLDOWN_MS = 30_000;
  private readonly _profileRequestInflight = new Map<
    string,
    Promise<{ ok: boolean; reason?: string }>
  >();
  private readonly _profileRequestLastAt = new Map<string, number>();
  private readonly _nearbyProfileProbeLastAt = new Map<string, number>();
  private readonly _nearbyProfileProbeInflight = new Set<string>();
  /** Keeps bonded contacts warm across NAT idle periods. */
  private _bondWarmTimer?: ReturnType<typeof setInterval>;
  /** In-memory owner → libp2p from recent inbound streams (until persisted in peer directory). */
  private readonly _lastLibp2pTransportByOwner = new Map<
    string,
    { peerId: string; listenAddrs?: string[] }
  >();
  /** Inbound push offers waiting for accept/decline — keyed by preview message id. */
  private readonly _pendingInboundShareOffers = new Map<string, ShareOffer>();
  /** Pending vault-relative rename on receive: key `senderPeerId + \\n + voucher source path`
   * (matches {@link DataTransferVoucher} `relativePath` from sender).
   */
  private readonly _pendingDataTransferSavePath = new Map<string, string>();
  /** Share / data-transfer correlation ids for progress tracking (ADB-D). */
  private readonly _transferTracker = new TransferTracker();
  private readonly _correlationByRequestMsgId = new Map<string, string>();
  private readonly _correlationByPreviewMsgId = new Map<string, string>();
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

  // Event listeners - stored for later emission
  private readonly listeners = new Map<keyof NodeServiceEvents, Set<(...args: any[]) => void>>();

  /**
   * Called by index.ts when hello:request is received from bond-inbound.ts.
   * This stores the pending request so acceptHello() can find it later.
   */
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
      console.log(`[node-service] stored pending hello request: messageId=${data.messageId}, from=${data.sender.ownerId}`);
    }
  }

  storePendingSocialIntroProposal(proposal: SocialIntroProposal): void {
    const { commitmentApproved: _ca, ...rest } = proposal;
    void _ca;
    if (this._pendingSocialIntroProposals.has(rest.messageId)) {
      return;
    }
    this._pendingSocialIntroProposals.set(rest.messageId, {
      ...rest,
      ownerCommitmentRef: undefined,
    });
    this.emit("social.intro:propose", { ...rest, commitmentApproved: false });
  }

  async listPendingSocialIntroProposals(): Promise<SocialIntroProposal[]> {
    return [...this._pendingSocialIntroProposals.values()].map((row) => {
      const { ownerCommitmentRef, ...pub } = row;
      return {
        ...pub,
        commitmentApproved: Boolean(ownerCommitmentRef),
      };
    });
  }

  async approveSocialIntroCommitment(messageId: string): Promise<{ ownerCommitmentRef: string }> {
    const row = this._pendingSocialIntroProposals.get(messageId);
    if (!row) {
      throw new Error(`No pending intro proposal for messageId=${messageId}`);
    }
    if (!row.ownerCommitmentRef) {
      row.ownerCommitmentRef = randomUUID();
    }
    const sent = await this._sendSocialIntroOwnerReady(row);
    if (!sent) {
      throw new Error("Failed to send social.intro.owner-ready (mesh unavailable or send failed)");
    }
    return { ownerCommitmentRef: row.ownerCommitmentRef };
  }

  async handleSocialProxyPeerOwnerReady(input: {
    introCorrelationId: string;
    ownerId: string;
    nonce: string;
    remotePeerId: string;
    receivedAt: string;
  }): Promise<SocialProxySession | undefined> {
    void input.nonce;
    if (!this._socialProxyStore) return undefined;
    const config = await this.getNodeConfig();
    if (!config.socialProxyEnabled) return undefined;

    const sessions = await this._socialProxyStore.list();
    const session = sessions.find(
      (s) => s.correlationId === input.introCorrelationId && s.candidateOwnerId === input.ownerId,
    );
    if (!session) {
      console.warn(
        `[social-proxy] social.intro.owner-ready: no session for correlationId=${input.introCorrelationId} candidateOwnerId=${input.ownerId}`,
      );
      if (this._taskStore) {
        await this._taskStore.appendAuditEvent(
          createAuditEvent({
            type: "message.verified",
            intent: "social.intro.owner-ready",
            correlationId: input.introCorrelationId,
            remotePeerId: input.remotePeerId,
            direction: "inbound",
            outcome: "record",
            summary: `social.intro.owner-ready: no matching social proxy session (candidateOwnerId=${input.ownerId})`,
            createdAt: input.receivedAt,
          }),
        );
      }
      return undefined;
    }

    let current = session;
    if (current.status === "awaiting_peer") {
      const peerReady = transitionSocialProxySession(current, "PEER_OWNER_READY");
      if (peerReady.changed) current = peerReady.session;
    }

    const localRef = randomUUID();
    if (current.introProposalMessageId) {
      const row = this._pendingSocialIntroProposals.get(current.introProposalMessageId);
      if (row) row.ownerCommitmentRef = localRef;
    }

    const withRef = {
      ...current,
      ownerCommitmentRef: localRef,
      updatedAt: new Date().toISOString(),
    };
    const { session: next } = transitionSocialProxySession(withRef, "OWNER_APPROVE_INTRO", {
      hasOwnerCommitmentRef: true,
    });
    await this._socialProxyStore.save(next);

    if (this._agentActivityStore) {
      const record: AgentActivityRecord = {
        activityId: randomUUID(),
        correlationId: next.correlationId,
        taskId: next.sessionId,
        domain: "social",
        kind: "social_proxy_transition",
        summary: `Social proxy: peer owner-ready → ${next.status}`,
        remoteOwnerId: input.ownerId,
        createdAt: new Date().toISOString(),
      };
      await this._agentActivityStore.append(record);
      await this._publishAgentActivity(record, input.ownerId);
    }

    void this.advanceSocialProxySession(next.sessionId);
    return next;
  }

  private async _sendSocialIntroOwnerReady(
    row: SocialIntroProposal & { ownerCommitmentRef?: string },
  ): Promise<boolean> {
    const mesh = this._reachableMesh();
    const profile = this._profile;
    if (!mesh || !profile) return false;

    try {
      const { transportPeerId } = await this._resolvePeerTransportForOwner(row.agentOwnerId);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const unsigned = createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: row.agentPeerId,
        recipientRole: "agent",
        intent: "social.intro.owner-ready",
        payload: createSocialIntroOwnerReadyPayload({
          introCorrelationId: row.introCorrelationId,
          ownerId: profile.owner.ownerId,
          nonce: randomUUID(),
          expiresAt,
        }),
        correlationId: row.introCorrelationId,
      });
      const signed = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
      const dialHints = await this._dialHintsForChat(transportPeerId, undefined);
      await mesh.send(transportPeerId, signed, { dialHints });

      if (this._taskStore) {
        await this._taskStore.appendAuditEvent(
          createAuditEvent({
            type: "message.sent",
            intent: signed.intent,
            messageId: signed.messageId,
            correlationId: row.introCorrelationId,
            remotePeerId: transportPeerId,
            direction: "outbound",
            outcome: "record",
            summary: "Sent social.intro.owner-ready after intro commitment approval.",
            createdAt: signed.createdAt,
          }),
        );
      }
      return true;
    } catch (err) {
      console.warn("[node-service] failed to send social.intro.owner-ready:", err);
      return false;
    }
  }

  async declineSocialIntroProposal(messageId: string): Promise<void> {
    this._pendingSocialIntroProposals.delete(messageId);
  }

  /**
   * CLI (`index.ts`) wires the same on-disk audit store as inbound handlers so
   * share/data-transfer paths can append audits before `startNode()` exists.
   */
  bindCliTaskStore(taskStore: LocalTaskStore): void {
    this._taskStore = taskStore;
  }

  /** Wire daemon approval queue (index.ts) for RPC + execute-on-approve. */
  bindApprovalQueue(queue: ApprovalQueue): void {
    this._approvalQueue = queue;
  }

  private _upsertTransferStatus(status: TransferStatus): TransferStatus {
    const saved = this._transferTracker.upsert(status);
    this.emit("share:progress", saved);
    return saved;
  }

  async listActiveTransfers(): Promise<TransferStatus[]> {
    return this._transferTracker.listActive();
  }

  async getTransferStatus(correlationId: string): Promise<TransferStatus | undefined> {
    return this._transferTracker.get(correlationId);
  }

  /** Called from data-transfer-inbound after verified inbound write. */
  notifyInboundTransferVerified(input: {
    remotePeerId: string;
    relativePath: string;
    totalBytes: number;
  }): void {
    for (const [shareId, pending] of this._inboundTransferByShareId.entries()) {
      if (pending.senderNodeId !== input.remotePeerId) continue;
      if (pending.savePath !== input.relativePath && pending.senderVaultRelativePath !== input.relativePath) {
        continue;
      }
      const correlationId = this._correlationByPreviewMsgId.get(shareId) ?? shareId;
      this._upsertTransferStatus({
        correlationId,
        phase: "verified",
        bytesTransferred: input.totalBytes,
        totalBytes: input.totalBytes,
        remotePeerId: input.remotePeerId,
        remotePeerOwnerId: pending.senderOwnerId,
        vaultRelativePath: input.relativePath,
        updatedAt: new Date().toISOString(),
      });
      this._inboundTransferByShareId.delete(shareId);
      if (pending.chatRoomId && pending.chatMessageId && pending.chatAttachmentId) {
        void this._applyRoomAttachmentVaultPath({
          roomId: pending.chatRoomId,
          messageId: pending.chatMessageId,
          attachmentId: pending.chatAttachmentId,
          vaultRelativePath: input.relativePath,
        });
      } else {
        void this._recordFileShareInChat({
          peerOwnerId: pending.senderOwnerId ?? pending.senderNodeId,
          outgoing: false,
          vaultRelativePath: input.relativePath,
          byteLength: input.totalBytes,
        });
      }
      return;
    }
    this._upsertTransferStatus({
      correlationId: `inbound:${input.remotePeerId}:${input.relativePath}`,
      phase: "verified",
      bytesTransferred: input.totalBytes,
      totalBytes: input.totalBytes,
      remotePeerId: input.remotePeerId,
      vaultRelativePath: input.relativePath,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Inbound `share.preview` on the original requester (push) — links preview id to pending send. */
  linkOutboundSharePreviewFromInbound(previewMessageId: string, inReplyToRequestMsgId: string): void {
    const pending = this._pendingPushShareByRequestMsgId.get(inReplyToRequestMsgId);
    if (!pending) {
      console.warn(
        `[share] preview ${previewMessageId.slice(0, 12)}…: no pending push send for request ${inReplyToRequestMsgId.slice(0, 12)}…`,
      );
      return;
    }
    this._pendingFileSendByPreviewMsgId.set(previewMessageId, {
      relativePath: pending.relativePath,
      toPeerId: pending.toPeerId,
      deliveryChannel: pending.deliveryChannel,
    });
    this._pendingPushShareByRequestMsgId.delete(inReplyToRequestMsgId);
    console.log(
      `[share] linked preview ${previewMessageId.slice(0, 12)}… → file send ${pending.relativePath} to ${pending.toPeerId.slice(0, 12)}…`,
    );
    const correlationId = this._correlationByRequestMsgId.get(inReplyToRequestMsgId);
    if (correlationId) {
      this._correlationByPreviewMsgId.set(previewMessageId, correlationId);
      this._correlationByRequestMsgId.delete(inReplyToRequestMsgId);
    }
    const deferred = this._deferredShareAcceptByPreviewId.get(previewMessageId);
    if (deferred) {
      this._deferredShareAcceptByPreviewId.delete(previewMessageId);
      void this.maybeSendShareFileForInboundAccept(deferred).catch((err) => {
        console.error(
          `[share] deferred file transfer failed for preview ${previewMessageId.slice(0, 12)}…:`,
          err instanceof Error ? err.message : err,
        );
      });
    }
  }

  /**
   * Inbound `share.preview` for outbound pull (`fileOrigin: responder`).
   * Records an inbox offer so {@link acceptShare} can complete the transfer.
   */
  recordInboundPullSharePreview(input: {
    previewMessageId: string;
    inReplyToRequestMsgId: string;
    senderPeerId: string;
    senderOwnerId?: string;
    previewText: string;
    sensitivity: "public" | "friends" | "private";
  }): boolean {
    const pending = this._pendingPullShareByRequestMsgId.get(input.inReplyToRequestMsgId);
    if (!pending) return false;
    this._pendingPullShareByRequestMsgId.delete(input.inReplyToRequestMsgId);
    void this.recordInboundPushShareOffer({
      shareId: input.previewMessageId,
      senderPeerId: input.senderPeerId,
      senderOwnerId: input.senderOwnerId ?? pending.targetOwnerId,
      previewText: input.previewText,
      sensitivity: input.sensitivity,
      relativePath: pending.peerRelativePath,
      deliveryChannel: "inbox",
    });
    const correlationId = this._correlationByRequestMsgId.get(input.inReplyToRequestMsgId);
    if (correlationId) {
      this._correlationByPreviewMsgId.set(input.previewMessageId, correlationId);
      this._correlationByRequestMsgId.delete(input.inReplyToRequestMsgId);
    }
    return true;
  }

  /** We hold the file (responder); after sending preview, wait for requester's `share.accept`. */
  registerResponderFileSendAfterPreview(
    previewMessageId: string,
    relativePath: string | undefined,
    requesterPeerId: string,
  ): void {
    const rel = relativePath?.replace(/^[\\/]+/, "") ?? "";
    if (!rel.trim()) return;
    this._pendingFileSendByPreviewMsgId.set(previewMessageId, {
      relativePath: rel,
      toPeerId: requesterPeerId,
    });
  }

  async recordInboundPushShareOffer(input: {
    shareId: string;
    senderPeerId: string;
    senderOwnerId?: string;
    previewText: string;
    sensitivity: "public" | "friends" | "private";
    relativePath: string;
    deliveryChannel?: "inbox" | "chat";
    chatRoomId?: string;
    chatMessageId?: string;
    chatAttachmentId?: string;
  }): Promise<void> {
    const records = await this._peerDirectoryStore.listPeerRecords();
    const rec = records.find((r) => r.peerId === input.senderPeerId);
    const senderOwnerId = input.senderOwnerId ?? rec?.ownerId;
    const trust = senderOwnerId
      ? await this._trustStore.getTrustRecord(senderOwnerId)
      : undefined;
    const displayName =
      trust?.displayName?.trim() ||
      (senderOwnerId
        ? senderOwnerId.replace(/^envoy:owner:/, "").slice(0, 10)
        : `${input.senderPeerId.slice(0, 12)}…`);
    const filename = basename(input.relativePath) || "file";
    const offer: ShareOffer = {
      shareId: input.shareId,
      senderNodeId: input.senderPeerId,
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
    if (input.deliveryChannel !== "chat") {
      this.emit("share:offered", offer);
    }
  }

  clearPendingShareStateForPreview(previewMessageId: string): void {
    this._pendingFileSendByPreviewMsgId.delete(previewMessageId);
    const offer = this._pendingInboundShareOffers.get(previewMessageId);
    if (offer?.senderVaultRelativePath) {
      this._pendingDataTransferSavePath.delete(
        `${offer.senderNodeId}\n${offer.senderVaultRelativePath.replace(/^[\\/]+/, "")}`,
      );
    }
    this._pendingInboundShareOffers.delete(previewMessageId);
  }

  /**
   * Map verified voucher path → local vault-relative path when the owner chose a different name/location.
   */
  resolveInboundDataTransferRelativePath(remotePeerId: string, voucherRelativePath: string): string {
    const norm = voucherRelativePath.replace(/^[\\/]+/, "");
    const o = this._pendingDataTransferSavePath.get(`${remotePeerId}\n${norm}`);
    return o ?? norm;
  }

  consumeInboundDataTransferSaveMapping(remotePeerId: string, voucherSourceRelativePath: string): void {
    const norm = voucherSourceRelativePath.replace(/^[\\/]+/, "");
    this._pendingDataTransferSavePath.delete(`${remotePeerId}\n${norm}`);
  }

  async maybeSendShareFileForInboundAccept(input: {
    envelope: EnvoyEnvelope;
    remotePeerId: string;
    taskStore: LocalTaskStore;
    vaultDir: string;
    /** Live circuit/LAN addr from the inbound `share.accept` stream — often the only routable hint cross-NAT. */
    inboundConnectionAddrs?: string[];
  }): Promise<void> {
    let payload: ReturnType<typeof parseShareAcceptPayload>;
    try {
      payload = parseShareAcceptPayload(input.envelope.payload);
    } catch {
      return;
    }
    if (!payload.accept) return;
    const previewId = payload.inReplyTo;
    const pending = this._pendingFileSendByPreviewMsgId.get(previewId);
    if (!pending) {
      console.warn(
        `[share] share.accept for preview ${previewId.slice(0, 12)}…: deferring until preview is linked`,
      );
      this._deferredShareAcceptByPreviewId.set(previewId, input);
      return;
    }
    if (pending.toPeerId !== input.remotePeerId) {
      console.warn(
        `[share] file send skipped: peer mismatch for preview=${previewId.slice(0, 12)}…`,
      );
      return;
    }
    const mesh = this._reachableMesh();
    const profile = this._profile;
    if (!mesh || !profile) return;

    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    const rec = peerRecords.find((r) => r.peerId === input.remotePeerId);
    const listenAddrs = this._mergeConnectionDialHints(rec?.listenAddrs, input.inboundConnectionAddrs);
    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(input.remotePeerId, listenAddrs),
        30_000,
        "_dialHintsForChat",
      );
    } catch (err) {
      console.error(
        `[share] dial hints failed for data transfer to ${input.remotePeerId.slice(0, 12)}…:`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }

    const correlationId =
      this._correlationByPreviewMsgId.get(previewId) ?? input.envelope.correlationId ?? previewId;
    this._upsertTransferStatus({
      correlationId,
      phase: "transferring",
      remotePeerId: input.remotePeerId,
      vaultRelativePath: pending.relativePath,
      updatedAt: new Date().toISOString(),
    });

    console.log(
      `[share] data transfer start: ${pending.relativePath} → ${input.remotePeerId.slice(0, 12)}… (${dialHints.length} dial hints)`,
    );
    const reachability = await mesh.ensurePeerReachable(input.remotePeerId, ENVOY_DATA_PROTOCOL, {
      dialHints,
      preferCircuitHints: dialHints.some((h) => h.includes("/p2p-circuit/")),
    });
    if (!reachability.connected) {
      console.warn(
        `[share] data channel not reachable for ${input.remotePeerId.slice(0, 12)}…; attempting transfer anyway`,
      );
    }
    await sendVaultFileViaDataTransfer({
      mesh,
      profile,
      taskStore: input.taskStore,
      vaultDir: input.vaultDir,
      relativePath: pending.relativePath,
      toPeerId: input.remotePeerId,
      dialHints,
      transferHooks: {
        correlationId,
        remotePeerOwnerId: rec?.ownerId,
        onUpdate: (status) => this._upsertTransferStatus(status as TransferStatus),
      },
    });
    this._pendingFileSendByPreviewMsgId.delete(previewId);
    this._deferredShareAcceptByPreviewId.delete(previewId);
    console.log(
      `[share] data transfer complete: ${pending.relativePath} → ${input.remotePeerId.slice(0, 12)}…`,
    );
    if (rec?.ownerId && pending.deliveryChannel !== "chat") {
      let byteLength = 0;
      try {
        const st = await stat(join(input.vaultDir, pending.relativePath));
        byteLength = st.size;
      } catch {
        /* ignore */
      }
      void this._recordFileShareInChat({
        peerOwnerId: rec.ownerId,
        outgoing: true,
        vaultRelativePath: pending.relativePath,
        byteLength,
      });
    }
  }

  /** Prefer live inbound connection addrs (circuit paths) ahead of stale peer-directory listen addrs. */
  private _mergeConnectionDialHints(
    peerListenAddrs: string[] | undefined,
    inboundConnectionAddrs: string[] | undefined,
  ): string[] | undefined {
    const extra = (inboundConnectionAddrs ?? []).map((a) => a.trim()).filter(Boolean);
    const stored = (peerListenAddrs ?? []).map((a) => a.trim()).filter(Boolean);
    if (extra.length === 0 && stored.length === 0) {
      return undefined;
    }
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const addr of [...extra, ...stored]) {
      if (seen.has(addr)) {
        continue;
      }
      seen.add(addr);
      merged.push(addr);
    }
    return merged;
  }

  constructor(
    mesh: EnvoyMesh | undefined,
    trustStore: LocalTrustStore,
    peerDirectoryStore: LocalPeerDirectoryStore,
    humanProfileStore: HumanProfileStore,
    profileDir: string | undefined,
    profile?: NodeProfile,
    vaultDir?: string,
  ) {
    this._mesh = mesh;
    this._trustStore = trustStore;
    this._peerDirectoryStore = peerDirectoryStore;
    this._humanProfileStore = humanProfileStore;
    this._agentIdentityStore =
      profileDir && profileDir !== "/tmp/unknown" ? createAgentIdentityStore(profileDir) : null;
    this._profileDir = profileDir ?? "/tmp/unknown";
    this._vaultDir = vaultDir ?? process.env.ENVOYMESH_VAULT ?? join(process.cwd(), "shared_vault");
    this._configStore = profileDir ? createNodeConfigStore(profileDir) : createStubNodeConfigStore();
    this._chatLogStore =
      profileDir && profileDir !== "/tmp/unknown" ? createLocalChatLogStore(profileDir) : null;
    this._chatRoomStore =
      profileDir && profileDir !== "/tmp/unknown" ? createLocalChatRoomStore(profileDir) : null;
    this._chatRoomPendingSyncStore =
      profileDir && profileDir !== "/tmp/unknown"
        ? createLocalChatRoomPendingSyncStore(profileDir)
        : null;
    this._chatRoomPendingMessageStore =
      profileDir && profileDir !== "/tmp/unknown"
        ? createLocalChatRoomPendingMessageStore(profileDir)
        : null;
    if (this._chatRoomPendingSyncStore || this._chatRoomPendingMessageStore) {
      this._chatRoomSyncFlushTimer = setInterval(() => {
        void this._flushPendingRoomSyncs();
        void this._flushPendingRoomMessages();
      }, 90_000);
    }
    this._agentActivityStore =
      profileDir && profileDir !== "/tmp/unknown" ? createLocalAgentActivityStore(profileDir) : null;
    this._agentCardStore =
      profileDir && profileDir !== "/tmp/unknown" ? createAgentCardStore(profileDir) : null;
    this._chatDraftStore =
      profileDir && profileDir !== "/tmp/unknown" ? createChatDraftStore(profileDir) : null;
    this._autoReplyLimitStore =
      profileDir && profileDir !== "/tmp/unknown" ? createAutoReplyLimitStore(profileDir) : null;
    this._capabilityManifestStore =
      profileDir && profileDir !== "/tmp/unknown" ? createCapabilityManifestStore(profileDir) : null;
    this._sessionTokenStore =
      profileDir && profileDir !== "/tmp/unknown" ? createSessionTokenStore(profileDir) : null;
    this._deviceAuthorizationStore =
      profileDir && profileDir !== "/tmp/unknown" ? createDeviceAuthorizationStore(profileDir) : null;
    bindDeviceAuthorizationStore(this._deviceAuthorizationStore);
    this._contactOwnerKeyStore =
      profileDir && profileDir !== "/tmp/unknown" ? createContactOwnerKeyStore(profileDir) : null;
    this._peerProfileCacheStore =
      profileDir && profileDir !== "/tmp/unknown" ? createPeerProfileCacheStore(profileDir) : null;
    this._commerceReceiptStore =
      profileDir && profileDir !== "/tmp/unknown" ? createCommerceReceiptStore(profileDir) : null;
    this._reputationAnchorStore =
      profileDir && profileDir !== "/tmp/unknown" ? createReputationAnchorStore(profileDir) : null;
    this._multihopDiscoveryStore =
      profileDir && profileDir !== "/tmp/unknown" ? createMultiHopDiscoveryStore(profileDir) : null;
    this._peerReputationStore =
      profileDir && profileDir !== "/tmp/unknown" ? createLocalPeerReputationStore(profileDir) : null;
    this._socialProxyStore =
      profileDir && profileDir !== "/tmp/unknown" ? createSocialProxySessionStore(profileDir) : null;
    this._circleStore =
      profileDir && profileDir !== "/tmp/unknown" ? new AgentCircleStore(profileDir) : null;
    this._documentAcquisitionJobStore =
      profileDir && profileDir !== "/tmp/unknown" ? createDocumentAcquisitionJobStore(profileDir) : null;
    this._capabilityProviderJobStore =
      profileDir && profileDir !== "/tmp/unknown" ? createCapabilityProviderJobStore(profileDir) : null;
    if (profileDir && profileDir !== "/tmp/unknown") {
      this._discoverySeedStore = createDiscoverySeedStore(profileDir);
    }
    if (profile !== undefined) {
      this._profile = profile;
    }
    if (mesh) {
      this._nodeStatus = "running";
    }
  }

  // ============================================
  // Internal helpers
  // ============================================

  private _requireMesh(): EnvoyMesh {
    // Support both CLI path (_mesh) and Tauri/mobile path (_externalMesh via bindExternalMesh)
    const mesh = this._mesh ?? this._externalMesh;
    if (!mesh) {
      throw new Error("Node is not running. Call startNode() first.");
    }
    return mesh;
  }

  /**
   * CLI path: the running `EnvoyMesh` from `index.ts` so bond/chat/block paths can set libp2p KEEP_ALIVE-style tags
   * (reconnect queue redials automatically after disconnect).
   */
  bindExternalMesh(mesh: EnvoyMesh): void {
    this._externalMesh = mesh;
    this._nodeStatus = "running";
    this.emit("node:status", { status: this._nodeStatus, peerId: mesh.peerId });
  }

  /** Re-apply contact reachability tags from the trust store (after cold start or mesh restart). */
  async resyncBondedContactReachabilityTags(): Promise<void> {
    await this._resyncBondedContactReachabilityTags();
  }

  private _reachableMesh(): EnvoyMesh | undefined {
    return this._mesh ?? this._externalMesh;
  }

  private async _tagBondedContactReachability(libp2pPeerId: string): Promise<void> {
    const mesh = this._reachableMesh();
    if (!mesh) return;
    try {
      await mesh.tagContactForPersistentReachability(libp2pPeerId);
    } catch (e) {
      console.warn(`[reachability] tag failed for ${libp2pPeerId.slice(0, 12)}…:`, e);
    }
  }

  private async _untagReachabilityForOwner(peerOwnerId: string): Promise<void> {
    const mesh = this._reachableMesh();
    if (!mesh) return;
    try {
      const rec = await this._peerDirectoryStore.getPeerByOwnerId(peerOwnerId);
      if (rec?.peerId) {
        await mesh.untagContactForPersistentReachability(rec.peerId);
      }
    } catch (e) {
      console.warn(`[reachability] untag failed for owner ${peerOwnerId}:`, e);
    }
  }

  private async _resyncBondedContactReachabilityTags(): Promise<void> {
    const mesh = this._reachableMesh();
    if (!mesh) return;
    try {
      const trust = await this._trustStore.listTrustRecords();
      for (const r of trust) {
        if (r.level === "blocked") continue;
        const dir = await this._peerDirectoryStore.getPeerByOwnerId(r.peerOwnerId);
        if (dir?.peerId) {
          await mesh.tagContactForPersistentReachability(dir.peerId);
        }
      }
    } catch (e) {
      console.warn(`[reachability] resync tags failed:`, e);
    }
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

  getOwnerDidPresentation() {
    const profile = this._requireProfile();
    return buildOwnerDidPresentation({
      ownerId: profile.owner.ownerId,
      publicKeyPem: profile.owner.publicKeyPem,
    });
  }

  /**
   * Export the owner's DID document as portable JSON. Auto-includes
   * service endpoints for the active relay and the agent (if known),
   * so the resulting document is self-contained for handoff.
   */
  exportDidDocument(input?: {
    services?: Array<{ id: string; type: string; serviceEndpoint: string; description?: string }>;
  }): string {
    const profile = this._requireProfile();
    const services: Array<{ id: string; type: string; serviceEndpoint: string; description?: string }> = [];
    if (input?.services) {
      for (const s of input.services) services.push(s);
    } else {
      // Auto-populate from runtime state
      const mesh = this._mesh ?? this._externalMesh;
      if (mesh) {
        const relay = this._relayPublicWsUrl;
        if (relay) {
          services.push({
            id: "#envoy-relay",
            type: "EnvoyMeshRelay",
            serviceEndpoint: relay,
            description: "WebSocket relay for inbound envelopes",
          });
        }
        if (mesh.peerId) {
          services.push({
            id: "#envoy-agent",
            type: "EnvoyMeshAgent",
            serviceEndpoint: `envoy_agent_${mesh.peerId.slice(-12)}`,
            description: "Local agent peer id (last 12 chars)",
          });
        }
      }
    }

    const inner = buildOwnerDidPresentation({
      ownerId: profile.owner.ownerId,
      publicKeyPem: profile.owner.publicKeyPem,
      services,
    });
    const envelope = {
      envelope: "envoymesh-did-export-v1" as const,
      exportedAt: new Date().toISOString(),
      did: inner.did,
      ownerId: profile.owner.ownerId,
      publicKeyPem: profile.owner.publicKeyPem,
      document: inner.document,
    };
    return JSON.stringify(envelope);
  }

  async resolveDidImport(input: string) {
    return resolveDidImportInput(input);
  }

  async resolveDidExport(input: string) {
    const { resolveDidExportInput } = await import("@envoymesh/api/did-import");
    return resolveDidExportInput(input);
  }

  async cacheDidContactKey(params: { ownerId: string; publicKeyPem: string }) {
    if (!this._contactOwnerKeyStore) {
      return { ok: false, reason: "contact owner key store unavailable" };
    }
    const ownerId = params.ownerId.trim();
    const publicKeyPem = params.publicKeyPem.trim();
    if (!ownerId || !publicKeyPem) {
      return { ok: false, reason: "ownerId and publicKeyPem are required" };
    }
    await this._contactOwnerKeyStore.upsert(ownerId, publicKeyPem);
    return { ok: true };
  }

  async getPeerReputationSummary(peerOwnerId: string): Promise<PeerReputationSummary> {
    const id = peerOwnerId.trim();
    const localRecord = this._peerReputationStore
      ? await this._peerReputationStore.getReputation(id)
      : undefined;
    const attestations = this._reputationAnchorStore
      ? await this._reputationAnchorStore.listAttestations(id)
      : [];

    return {
      peerOwnerId: id,
      local: localRecord
        ? {
            successfulTasks: localRecord.successfulTasks,
            failedTasks: localRecord.failedTasks,
            avgLatencyMs: localRecord.avgLatencyMs,
            abuseFlags: localRecord.abuseFlags,
            lastUpdated: localRecord.lastUpdated,
          }
        : undefined,
      attestations,
    };
  }

  async getHumanProfile(): Promise<HumanProfile | undefined> {
    const profile = await this._humanProfileStore.loadHumanProfile();
    return profile as HumanProfile | undefined;
  }

  async updateHumanProfile(input: CreateHumanProfileInput): Promise<HumanProfile> {
    this._assertOnline();
    const selfProfile = this._requireProfile();

    // Validate required fields
    if (!input.displayName || !input.displayName.trim()) {
      throw new Error("displayName is required");
    }
    if (!input.username || !/^[a-zA-Z0-9_]{3,30}$/.test(input.username)) {
      throw new Error("username must be 3-30 characters, letters, numbers, underscore only");
    }

    // Load existing profile
    const existing = await this._humanProfileStore.loadHumanProfile();

    // Merge updates
    const updatedPayload: Omit<HumanProfilePayload, "signature"> = {
      version: "0.1",
      ownerId: selfProfile.owner.ownerId,
      displayName: input.displayName.trim(),
      username: input.username.trim(),
      bio: input.bio ?? existing?.bio,
      gender: input.gender ?? existing?.gender,
      hobbies: input.hobbies ?? existing?.hobbies,
      knowledge: input.knowledge ?? existing?.knowledge,
      profileVisibility: input.profileVisibility ?? existing?.profileVisibility ?? "private",
      discoveryLocation: input.discoveryLocation ?? existing?.discoveryLocation,
      discoveryLocationPrecision:
        input.discoveryLocationPrecision ?? existing?.discoveryLocationPrecision ?? "hidden",
      capabilities: input.capabilities ?? existing?.capabilities,
      publicThumbnail: existing?.publicThumbnail,
      galleryPhotos: existing?.galleryPhotos,
      updatedAt: new Date().toISOString(),
    };

    const signedProfile = await this._signAndSaveHumanProfile(updatedPayload);

    const config = await this._configStore.load();
    const isPublicNetwork = config?.bootstrapPresets && config.bootstrapPresets.length > 0;
    const interests = [...(updatedPayload.hobbies ?? []), ...(updatedPayload.knowledge ?? [])];
    const username = updatedPayload.username;
    const locationTopics = deriveLocationDiscoveryTopics({
      location: updatedPayload.discoveryLocation,
      precision: updatedPayload.discoveryLocationPrecision,
    });
    const previousProfileCapabilityTags = profileCapabilityTags(existing?.capabilities);
    const capabilityTags = profileCapabilityTags(updatedPayload.capabilities);
    const capabilityTopics = profileCapabilityDiscoveryTopics(capabilityTags);
    await this._syncProfileCapabilitiesToManifest(
      previousProfileCapabilityTags,
      capabilityTags,
    );

    // DHT advertise/cancel can hang on sparse networks — never block the RPC response.
    void this._applyProfileDiscoveryAdvertising({
      profileVisibility: updatedPayload.profileVisibility,
      isPublicNetwork: Boolean(isPublicNetwork),
      interests,
      username,
      locationTopics,
      capabilityTopics,
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[node-service] profile discovery advertising failed: ${msg}`);
    });

    return signedProfile;
  }

  private async _applyProfileDiscoveryAdvertising(input: {
    profileVisibility: HumanProfilePayload["profileVisibility"];
    isPublicNetwork: boolean;
    interests: string[];
    username: string;
    locationTopics: string[];
    capabilityTopics: string[];
  }): Promise<void> {
    console.log(
      `[node-service] Checking DHT advertising: visibility=${input.profileVisibility}, isPublicNetwork=${input.isPublicNetwork}, interests=${JSON.stringify(input.interests)}, locationTopics=${JSON.stringify(input.locationTopics)}, capabilityTopics=${JSON.stringify(input.capabilityTopics)}`,
    );
    if (input.profileVisibility === "public" && input.isPublicNetwork) {
      await this._advertisePublicDiscoveryTopics({
        interests: input.interests,
        username: input.username,
        locationTopics: input.locationTopics,
        capabilityTopics: input.capabilityTopics,
      });
    } else {
      await this._cancelAutoAdvertisedDiscoveryTopics();
    }
  }

  private async _signAndSaveHumanProfile(
    payload: Omit<import("@envoymesh/protocol").HumanProfilePayload, "signature">,
  ): Promise<HumanProfile> {
    const selfProfile = this._requireProfile();
    const signedProfile = signHumanProfile(payload, selfProfile.owner.privateKeyPem);
    await raceWithTimeout(
      this._humanProfileStore.saveHumanProfile(signedProfile),
      15_000,
      "saveHumanProfile",
    );
    void this._broadcastProfileSyncToBonds(signedProfile).catch((err) => {
      console.warn("[profile.sync] broadcast failed:", err);
    });
    return signedProfile as HumanProfile;
  }

  private _mapCachedPeerProfile(row: CachedPeerProfile): PeerProfileView {
    return {
      ownerId: row.ownerId,
      profile: row.profile as HumanProfile,
      cachedAt: row.cachedAt,
      thumbnailContentBase64: row.thumbnail?.contentBase64,
      thumbnailMimeType: row.thumbnail?.mimeType,
    };
  }

  async getPeerProfile(ownerId: string): Promise<PeerProfileView | undefined> {
    if (!this._peerProfileCacheStore) return undefined;
    const row = await this._peerProfileCacheStore.get(ownerId);
    return row ? this._mapCachedPeerProfile(row) : undefined;
  }

  async listPeerProfiles(): Promise<PeerProfileView[]> {
    if (!this._peerProfileCacheStore) return [];
    const rows = await this._peerProfileCacheStore.list();
    return rows.map((r) => this._mapCachedPeerProfile(r));
  }

  async syncProfileToBonds(): Promise<void> {
    const hp = await this._humanProfileStore.loadHumanProfile();
    if (hp) await this._broadcastProfileSyncToBonds(hp);
  }

  async refreshBondPeerProfiles(): Promise<{ requested: number; failed: number }> {
    const hp = await this._humanProfileStore.loadHumanProfile();
    if (hp) {
      await this._broadcastProfileSyncToBonds(hp);
    }
    const bonds = await this.getBonds();
    let failed = 0;
    for (const bond of bonds) {
      const result = await this.requestPeerProfile(bond.peerOwnerId);
      if (!result.ok) failed += 1;
    }
    return { requested: bonds.length, failed };
  }

  async requestPeerProfile(ownerId: string): Promise<{ ok: boolean; reason?: string }> {
    const key = ownerId.trim();
    if (!key) {
      return { ok: false, reason: "owner id required" };
    }
    const inflight = this._profileRequestInflight.get(key);
    if (inflight) {
      return inflight;
    }
    const lastAt = this._profileRequestLastAt.get(key) ?? 0;
    if (Date.now() - lastAt < NodeServiceImpl._PROFILE_REQUEST_COOLDOWN_MS) {
      const cached = this._peerProfileCacheStore
        ? await this._peerProfileCacheStore.get(key)
        : undefined;
      if (cached) {
        return { ok: true };
      }
    }

    const run = this._requestPeerProfileOnce(key);
    this._profileRequestInflight.set(key, run);
    try {
      return await run;
    } finally {
      this._profileRequestInflight.delete(key);
      this._profileRequestLastAt.set(key, Date.now());
    }
  }

  private async _requestPeerProfileOnce(ownerId: string): Promise<{ ok: boolean; reason?: string }> {
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
    if (!this._contactOwnerKeyStore || !this._peerProfileCacheStore) {
      return { ok: false, reason: "profile cache not initialized" };
    }
    try {
      const resolved = await this._resolveLibp2pPeerForBondOwner(ownerId);
      if (!resolved) {
        return { ok: false, reason: "peer not in directory (no libp2p route)" };
      }
      const { transportPeerId, listenAddrs } = resolved;
      let envelopeRecipientPeerId: string | undefined;
      try {
        envelopeRecipientPeerId = (await this._resolvePeerTransportForOwner(ownerId)).recipientEnvelopePeerId;
      } catch {
        const records = await this._peerDirectoryStore.listPeerRecords();
        const rec = pickBestLibp2pPeerDirectoryRecord(records, ownerId);
        if (rec?.devicePublicKeyPem) {
          envelopeRecipientPeerId = derivePeerId(rec.devicePublicKeyPem);
        }
      }
      const reply = await sendProfileRequest({
        mesh,
        profile,
        transportPeerId,
        envelopeRecipientPeerId: envelopeRecipientPeerId ?? transportPeerId,
        listenAddrs,
        dialHintsFor: (peerId, addrs) => this._dialHintsForChat(peerId, addrs ?? listenAddrs),
      });
      const cached = await handleInboundProfileSync({
        envelope: reply,
        contactOwnerKeyStore: this._contactOwnerKeyStore,
        peerProfileCache: this._peerProfileCacheStore,
      });
      if (cached.handled) {
        this.emit("profile:updated", { ownerId: cached.ownerId });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  private async _probeNearbyPeerProfileAfterDiscovery(peerId: string, multiaddrs: string[]): Promise<void> {
    const mesh = this._mesh;
    const profile = this._profile;
    if (!mesh || !profile || !this._contactOwnerKeyStore || !this._peerProfileCacheStore) {
      return;
    }
    if (peerId === mesh.peerId) {
      return;
    }
    const lastAt = this._nearbyProfileProbeLastAt.get(peerId) ?? 0;
    if (Date.now() - lastAt < NodeServiceImpl._NEARBY_PROFILE_PROBE_COOLDOWN_MS) {
      return;
    }
    if (this._nearbyProfileProbeInflight.has(peerId)) {
      return;
    }
    this._nearbyProfileProbeInflight.add(peerId);
    try {
      const enriched = await probeNearbyPeerProfile({
        mesh,
        profile,
        contactOwnerKeyStore: this._contactOwnerKeyStore,
        peerProfileCache: this._peerProfileCacheStore,
        transportPeerId: peerId,
        listenAddrs: multiaddrs,
        dialHintsFor: (transportPeerId, addrs) => this._dialHintsForChat(transportPeerId, addrs ?? multiaddrs),
        selfPeerId: mesh.peerId,
        selfOwnerId: profile.owner.ownerId,
      });
      this._nearbyProfileProbeLastAt.set(peerId, Date.now());
      if (!enriched) {
        return;
      }
      this.emit("profile:updated", { ownerId: enriched.ownerId });
      this.emit("peer:discovered", enriched);
    } catch (err) {
      console.warn(`[node-service] nearby profile probe failed for ${peerId}:`, err);
    } finally {
      this._nearbyProfileProbeInflight.delete(peerId);
    }
  }

  private async _broadcastProfileSyncToBonds(humanProfile: HumanProfilePayload): Promise<void> {
    if (!humanProfile.publicThumbnail) return;
    const mesh = this._reachableMesh();
    if (!mesh) return;
    const profile = this._profile;
    if (!profile) return;
    const bonds = await this.getBonds();
    const bondOwnerIds = bonds.map((b) => b.peerOwnerId);
    if (bondOwnerIds.length === 0) return;
    try {
      await sendProfileSyncToBonds({
        mesh,
        profile,
        humanProfile,
        vaultDir: this._vaultDir,
        bondOwnerIds,
        resolveLibp2pPeer: async (ownerId) => {
          const resolved = await this._resolveLibp2pPeerForBondOwner(ownerId);
          if (!resolved) return undefined;
          return { peerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
        },
        dialHintsFor: (peerId, listenAddrs) => this._dialHintsForChat(peerId, listenAddrs),
      });
    } catch (err) {
      console.warn("[profile.sync] broadcast failed:", err);
    }
  }

  async handleInboundProfileIntent(
    envelope: EnvoyEnvelope,
    context?: {
      transportPeerId?: string;
      remoteAddr?: string;
      replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
    },
  ): Promise<boolean> {
    if (!this._contactOwnerKeyStore || !this._peerProfileCacheStore) return false;
    await this._rememberBondedPeerTransportFromInbound(envelope, context);
    if (
      envelope.intent !== "profile.sync" &&
      envelope.intent !== "profile.response" &&
      envelope.intent !== "profile.request"
    ) {
      return false;
    }
    if (envelope.intent === "profile.request") {
      const transportPeerId = context?.transportPeerId?.trim() ?? "";
      const result = await handleInboundProfileRequest({
        envelope,
        transportPeerId,
        contactOwnerKeyStore: this._contactOwnerKeyStore,
        loadLocalProfile: async () => this._humanProfileStore.loadHumanProfile(),
        sendProfileResponse: async (envelopeRecipientPeerId, local, replyTransportPeerId) => {
          const profile = this._requireProfile();
          const responseEnvelope = await buildSignedProfilePayloadEnvelope({
            profile,
            humanProfile: local,
            vaultDir: this._vaultDir,
            intent: "profile.response",
            recipientPeerId: envelopeRecipientPeerId,
          });
          if (context?.replyWithEnvelope) {
            try {
              await context.replyWithEnvelope(responseEnvelope);
              console.log(
                `[profile.response] replied on inbound stream to ${envelopeRecipientPeerId.slice(0, 16)}…`,
              );
              return;
            } catch (err) {
              console.warn(
                `[profile.response] inbound stream reply failed, dialing outbound:`,
                err instanceof Error ? err.message : err,
              );
            }
          }
          const mesh = this._requireMesh();
          const records = await this._peerDirectoryStore.listPeerRecords();
          const rec = records.find((row) => row.peerId === replyTransportPeerId);
          const listenAddrs = rec?.listenAddrs;
          await sendProfileResponse({
            mesh,
            profile,
            humanProfile: local,
            vaultDir: this._vaultDir,
            envelopeRecipientPeerId,
            transportPeerId: replyTransportPeerId,
            listenAddrs,
            dialHintsFor: (peerId, addrs) => this._dialHintsForChat(peerId, addrs ?? listenAddrs),
          });
        },
      });
      if (result.handled) {
        return true;
      }
      console.warn(`[profile.request] not handled: ${"reason" in result ? result.reason : "unknown"}`);
      return false;
    }
    const result = await handleInboundProfileSync({
      envelope,
      contactOwnerKeyStore: this._contactOwnerKeyStore,
      peerProfileCache: this._peerProfileCacheStore,
    });
    if (result.handled) {
      this.emit("profile:updated", { ownerId: result.ownerId });
      return true;
    }
    console.warn(`[${envelope.intent}] not handled: ${"reason" in result ? result.reason : "unknown"}`);
    return false;
  }

  private async _loadHumanProfileForPhotoUpdate(): Promise<{
    existing: import("@envoymesh/protocol").HumanProfilePayload;
    base: Omit<import("@envoymesh/protocol").HumanProfilePayload, "signature">;
  }> {
    this._assertOnline();
    const existing = await this._humanProfileStore.loadHumanProfile();
    if (!existing) {
      throw new Error("Create your profile before adding photos");
    }
    const { signature: _s, ...base } = existing;
    return { existing, base: { ...base, updatedAt: new Date().toISOString() } };
  }

  async setPublicProfileThumbnail(params: SetPublicProfileThumbnailParams): Promise<HumanProfile> {
    const mime = parseProfilePhotoMime(params.mimeType);
    const imported = await importProfilePhotoBytes({
      vaultDir: this._vaultDir,
      relativePath: profileThumbnailVaultPath(mime),
      contentBase64: params.contentBase64,
      mimeType: mime,
      maxBytes: MAX_PROFILE_THUMBNAIL_BYTES,
    });
    const publicThumbnail = ProfilePhotoRefSchema.parse(imported);
    const { base } = await this._loadHumanProfileForPhotoUpdate();
    return this._signAndSaveHumanProfile({ ...base, publicThumbnail });
  }

  async upsertProfileGalleryPhoto(params: UpsertProfileGalleryPhotoParams): Promise<HumanProfile> {
    const mime = parseProfilePhotoMime(params.mimeType);
    const visibility = params.visibility as ProfileGalleryPhotoVisibility;
    const { base, existing } = await this._loadHumanProfileForPhotoUpdate();
    const gallery = [...(existing.galleryPhotos ?? [])];
    const photoId = params.photoId?.trim() || undefined;
    const existingIdx = photoId
      ? gallery.findIndex((p) => p.photoId === photoId)
      : -1;
    if (gallery.length >= MAX_PROFILE_GALLERY_PHOTOS && existingIdx < 0) {
      throw new Error(`Gallery limit reached (max ${MAX_PROFILE_GALLERY_PHOTOS} photos)`);
    }
    const vaultRelativePath = profileGalleryVaultPath(mime, photoId);
    const imported = await importProfilePhotoBytes({
      vaultDir: this._vaultDir,
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
    if (existingIdx >= 0) {
      gallery[existingIdx] = entry;
    } else {
      gallery.push(entry);
    }
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

  async getAgentIdentity(): Promise<AgentIdentityDocument> {
    if (!this._agentIdentityStore) {
      throw new Error("Profile directory not initialized");
    }
    return this._agentIdentityStore.load();
  }

  async updateAgentIdentity(content: string): Promise<AgentIdentityDocument> {
    this._assertOnline();
    if (!this._agentIdentityStore) {
      throw new Error("Profile directory not initialized");
    }
    return this._agentIdentityStore.save(content);
  }

  /**
   * Advertise interests and username as DHT topics for peer discovery
   * Runs continuously in background with periodic retries (like system topics)
   */
  private _advertiseInterestsTimer?: ReturnType<typeof setInterval>;
  /** Topics auto-advertised from public profile (interests, username, geo) — cancelled when profile/network changes. */
  private _autoAdvertisedDiscoveryTopics: string[] = [];
  private _advertiseInterestsStartupTimeout?: ReturnType<typeof setTimeout>;
  private _stopRelayClientScheduler?: () => void;
  private _capabilityDiscoveryTimer?: ReturnType<typeof setTimeout>;
  private _stopNodeStatsLogging?: () => void;
  private _nodeProcessStartedAtMs = Date.now();
  private _relayBootstrapPeers: string[] = [];

  private async _cancelDiscoveryTopics(topics: string[]): Promise<void> {
    if (topics.length === 0) return;
    const mesh = this._mesh ?? this._externalMesh;
    if (!mesh) return;
    for (const topic of topics) {
      try {
        await raceWithTimeout(
          mesh.cancelCapabilityTopicReprovide(topic),
          DISCOVERY_TOPIC_OP_TIMEOUT_MS,
          `cancelCapabilityTopicReprovide(${topic})`,
        );
        console.log(`[node-service] Cancelled DHT topic: ${topic}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[node-service] Failed to cancel topic "${topic}": ${msg}`);
      }
    }
  }

  private async _cancelAutoAdvertisedDiscoveryTopics(): Promise<void> {
    const removed = [...this._autoAdvertisedDiscoveryTopics];
    this._autoAdvertisedDiscoveryTopics = [];
    if (this._advertiseInterestsTimer) {
      clearInterval(this._advertiseInterestsTimer);
      this._advertiseInterestsTimer = undefined;
    }
    await this._cancelDiscoveryTopics(removed);
  }

  private async _syncProfileCapabilitiesToManifest(
    previousProfileTags: string[],
    nextProfileTags: string[],
  ): Promise<void> {
    if (!this._capabilityManifestStore) {
      return;
    }
    if (previousProfileTags.length === 0 && nextProfileTags.length === 0) {
      return;
    }
    let manifest = await this._capabilityManifestStore.loadManifest();
    if (!manifest) {
      manifest = await this._capabilityManifestStore.createDefaultManifest();
    }
    const { capabilities, changed } = syncProfileTagsToManifestCapabilities({
      manifestCapabilities: manifest.capabilities,
      previousProfileTags,
      nextProfileTags,
    });
    if (!changed) {
      return;
    }
    await this._capabilityManifestStore.saveManifest({
      ...manifest,
      capabilities,
      updatedAt: new Date().toISOString(),
    });
  }

  private async _advertisePublicDiscoveryTopics(input: {
    interests: string[];
    username: string;
    locationTopics: string[];
    capabilityTopics?: string[];
  }): Promise<void> {
    const topicSet = new Set<string>();
    for (const interest of input.interests) {
      topicSet.add(interest.toLowerCase());
    }
    topicSet.add(`username:${input.username.toLowerCase()}`);
    for (const geo of input.locationTopics) {
      topicSet.add(geo);
    }
    for (const capability of input.capabilityTopics ?? []) {
      topicSet.add(capability);
    }
    const allTopics = [...topicSet];

    const removed = this._autoAdvertisedDiscoveryTopics.filter((topic) => !topicSet.has(topic));
    await this._cancelDiscoveryTopics(removed);
    this._autoAdvertisedDiscoveryTopics = allTopics;

    if (this._advertiseInterestsTimer) {
      clearInterval(this._advertiseInterestsTimer);
      this._advertiseInterestsTimer = undefined;
    }

    const advertisedTopics: string[] = [];
    let allSuccess = true;

    const advertiseOnce = async (topic: string): Promise<boolean> => {
      try {
        await raceWithTimeout(
          this._requireMesh().provideCapabilityTopic(topic),
          DISCOVERY_TOPIC_OP_TIMEOUT_MS,
          `provideCapabilityTopic(${topic})`,
        );
        console.log(`[node-service] Successfully advertised topic: ${topic}`);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[node-service] Failed to advertise topic "${topic}": ${msg}`);
        return false;
      }
    };

    for (const topic of allTopics) {
      const success = await advertiseOnce(topic);
      if (success) {
        advertisedTopics.push(topic);
      } else {
        allSuccess = false;
      }
    }

    this.emit("discovery:advertising-complete", { topics: advertisedTopics, success: allSuccess });

    this._advertiseInterestsTimer = setInterval(async () => {
      console.log(`[node-service] Periodic re-advertisement for ${allTopics.length} topics...`);
      let retrySuccess = true;
      for (const topic of allTopics) {
        const success = await advertiseOnce(topic);
        if (!success) retrySuccess = false;
      }
      if (retrySuccess) {
        console.log(`[node-service] All topics successfully advertised on retry`);
      }
    }, 5 * 60 * 1000);
  }

  /** @deprecated Use `_advertisePublicDiscoveryTopics` — kept as alias for tests. */
  private async _advertiseInterests(interests: string[], username: string): Promise<void> {
    return this._advertisePublicDiscoveryTopics({ interests, username, locationTopics: [] });
  }

  /**
   * Re-advertise interests on DHT and rendezvous servers (called on node start/restart)
   */
  private async _advertiseInterestsIfPublic(): Promise<void> {
    // Defensive: the 15s startup timeout may fire after stopNode() cleared the mesh
    if (!this._mesh) return;
    const config = await this._configStore.load();
    const profile = await this._humanProfileStore.loadHumanProfile();
    if (!config || !profile) return;

    const isPublicNetwork = config.bootstrapPresets && config.bootstrapPresets.length > 0;
    if (profile.profileVisibility === "public" && isPublicNetwork) {
      const interests = [...(profile.hobbies ?? []), ...(profile.knowledge ?? [])];
      const locationTopics = deriveLocationDiscoveryTopics({
        location: profile.discoveryLocation,
        precision: profile.discoveryLocationPrecision,
      });
      const capabilityTopics = profileCapabilityDiscoveryTopics(
        profileCapabilityTags(profile.capabilities),
      );

      // Advertise on DHT (with retry and exponential backoff)
      await this._advertisePublicDiscoveryTopics({
        interests,
        username: profile.username,
        locationTopics,
        capabilityTopics,
      });

      // Also register with rendezvous servers and relay peers as fallback
      // This runs in parallel with DHT advertising and uses relay-based discovery
      void this._registerWithRendezvousServers(interests, profile.username);
    } else {
      await this._cancelAutoAdvertisedDiscoveryTopics();
    }
  }

  /**
   * Register our capabilities with configured rendezvous servers and bootstrap relay peers
   * This is a fallback when DHT provide fails, using relay-based discovery instead
   */
  private async _registerWithRendezvousServers(interests: string[], username: string): Promise<void> {
    // Defensive: the 15s startup timeout may fire after stopNode() cleared the mesh
    const mesh = this._mesh;
    if (!mesh) return;
    const profileForRendezvous = this._profile;
    if (!profileForRendezvous) {
      return;
    }

    const config = await this._configStore.load();

    // Build capabilities list from interests (as tags)
    const capabilities = interests.map(interest => ({ tag: interest.toLowerCase() }));
    // Also add username as a special capability
    capabilities.push({ tag: `username:${username.toLowerCase()}` });

    // Collect all relay addresses to register with
    const relayAddrs: string[] = [];

    // Add configured relays (manually added via addRelay)
    if (config?.configuredRelays) {
      for (const relay of config.configuredRelays) {
        if (relay.enabled && relay.addr) {
          relayAddrs.push(relay.addr);
        }
      }
    }

    // Add bootstrap preset relays (like cn-relay) if they look like relay addresses
    if (config?.bootstrapPresets) {
      for (const preset of config.bootstrapPresets) {
        // cn-relay is a known relay preset
        if (preset === "cn-relay") {
          relayAddrs.push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
        }
      }
    }

    // Add manually configured bootstrap peers if they look like relays
    if (config?.bootstrapPeers) {
      for (const peer of config.bootstrapPeers) {
        // If it contains /p2p/ it's a full multiaddr with peer ID - likely a relay
        if (peer.includes("/p2p/") && !relayAddrs.includes(peer)) {
          relayAddrs.push(peer);
        }
      }
    }

    if (relayAddrs.length === 0) {
      console.log("[node-service] No relays configured for rendezvous registration");
      return;
    }

    console.log(`[node-service] Registering capabilities with ${relayAddrs.length} relay(s)`);

    // Retry configuration for relay registration
    const MAX_RETRIES = 3;
    const BASE_TIMEOUT_MS = 15000;

    for (const relayAddr of relayAddrs) {
      let success = false;
      let lastError: Error | undefined;

      for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
        try {
          console.log(`[node-service] Registering with rendezvous server: ${relayAddr} (attempt ${attempt + 1}/${MAX_RETRIES})`);

          const envelope = signUnsignedEnvelope(
            createUnsignedEnvelope({
              senderPeerId: mesh.peerId,
              senderPublicKey: profileForRendezvous.device.publicKeyPem,
              recipientPeerId: relayAddr,
              intent: "rendezvous.register",
              payload: createRendezvousRegisterPayload({
                peerId: mesh.peerId,
                multiaddr: mesh.multiaddrs[0] ?? `/p2p/${mesh.peerId}`,
                capabilities,
                ttlSeconds: 3600,
              }),
            }),
            profileForRendezvous.device.privateKeyPem,
          );

          // Send to relay and wait for response with retry
          const response = await mesh.sendExpectReply(relayAddr, envelope, {
            timeoutMs: BASE_TIMEOUT_MS * Math.pow(2, attempt)
          });
          console.log(`[node-service] Successfully registered with relay ${relayAddr}`);
          success = true;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(`[node-service] Failed to register with relay ${relayAddr} (attempt ${attempt + 1}/${MAX_RETRIES}):`, lastError.message);

          if (!success && attempt < MAX_RETRIES - 1) {
            // Wait before retry
            await new Promise((resolve) => setTimeout(resolve, BASE_TIMEOUT_MS * Math.pow(2, attempt)));
          }
        }
      }

      if (!success) {
        console.warn(`[node-service] All ${MAX_RETRIES} attempts failed for relay ${relayAddr}: ${lastError?.message}`);
      }
    }
  }

  // ============================================
  // Bond Management
  // ============================================

  async sendHello(
    targetOwnerId: string,
    profile: HelloProfile,
    message: string,
    options?: SendHelloOptions,
  ): Promise<HelloResponse> {
    this._assertOnline();
    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    let introCorrelationId: string | undefined;
    let ownerCommitmentRef: string | undefined;
    let pendingIntro: (SocialIntroProposal & { ownerCommitmentRef?: string }) | undefined;

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

    // Find the target peer's peerId — Trust-mode intros prefer candidatePeerId from the proposal row
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    let matchedRecord =
      peerRecords.find((r) => r.ownerId === targetOwnerId) ??
      peerRecords.find((r) => r.peerId === targetOwnerId);
    let targetPeerId = matchedRecord?.peerId;

    if (pendingIntro?.candidatePeerId) {
      targetPeerId = pendingIntro.candidatePeerId;
      matchedRecord =
        peerRecords.find((r) => r.ownerId === pendingIntro.candidateOwnerId) ??
        peerRecords.find((r) => r.peerId === pendingIntro.candidatePeerId);
    }

    // If not found in peer directory, maybe targetOwnerId IS a peerId (for DHT discovered peers)
    if (!targetPeerId) {
      // Check if it looks like a valid peerId
      if (targetOwnerId.startsWith("Qm") || targetOwnerId.startsWith("12D3")) {
        targetPeerId = targetOwnerId;
        console.log(`[node-service] Sending hello to DHT-discovered peer: ${targetPeerId}`);
      } else {
        throw new Error(`Peer not found for owner: ${targetOwnerId}`);
      }
    }

    console.log(`[node-service] sendHello to ${targetPeerId} (message: ${message})`);

    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
        senderPublicKey: selfProfile.device.publicKeyPem,
        recipientPeerId: targetPeerId,
        intent: "bond.request",
        payload: createBondRequestPayload({
          requesterOwnerId: selfProfile.owner.ownerId,
          requesterDisplayName: profile.displayName,
          message: `[HELLO] ${message}`,
          proofOfContext: `displayName:${profile.displayName}`,
          requestedLevel: "direct",
          introCorrelationId,
          ownerCommitmentRef,
        }),
      }),
      selfProfile.device.privateKeyPem,
    );

    try {
      const dialHints = await this._dialHintsForChat(targetPeerId, matchedRecord?.listenAddrs);
      console.log(`[node-service] sendHello dialHints count=${dialHints.length}`);
      await mesh.send(targetPeerId, envelope, { dialHints });
      console.log(`[node-service] Hello sent successfully to ${targetPeerId}`);

      if (options?.introProposalMessageId) {
        this._pendingSocialIntroProposals.delete(options.introProposalMessageId);
      }

      // Always record owner ↔ peerId after a successful bond.request (refresh if already present).
      try {
        await this._peerDirectoryStore.ensurePeerFromInboundChat({
          ownerId: targetOwnerId,
          peerId: targetPeerId,
          listenAddrs: matchedRecord?.listenAddrs ?? [],
        });
      } catch (err) {
        console.warn(`[peer-directory] sendHello ensurePeerFromInboundChat:`, err);
      }
      void this._tagBondedContactReachability(targetPeerId);
    } catch (err) {
      console.error(`[node-service] Failed to send hello to ${targetPeerId}:`, err);
      // Provide a more helpful error message
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("getComponents") || errorMsg.includes("connection failed") || errorMsg.includes("timeout")) {
        throw new Error(`Cannot reach peer ${targetPeerId.slice(0, 12)}... - peer may be behind NAT/firewall. Try configuring a relay server.`);
      }
      throw new Error(`Failed to send hello: ${errorMsg}`);
    }

    return {
      messageId: envelope.messageId,
      inReplyTo: "",
      decision: "accept", // Optimistic - actual response comes async via mesh
      timestamp: new Date().toISOString(),
    };
  }

  async acceptHello(messageId: string): Promise<void> {
    // Find the pending hello request
    const pending = this._pendingHelloRequests.get(messageId);
    if (!pending) {
      console.warn(`[node-service] acceptHello: no pending request found for messageId=${messageId}`);
      return;
    }

    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    // Store the bond in trust store (accept the connection)
    await this._trustStore.setTrustRecord({
      peerOwnerId: pending.requesterOwnerId,
      displayName: pending.requesterDisplayName,
      level: pending.requestedLevel as any ?? "direct",
      note: pending.message || undefined,
      now: new Date().toISOString(),
    });

    // Manual-approval hello never ran `emitBondEstablished` from bond-inbound, so index.ts did not
    // upsert peer-directory. Persist requester libp2p id so sendChat can resolve owner → peerId.
    try {
      const requesterDir = await this._peerDirectoryStore.getPeerByOwnerId(pending.requesterOwnerId);
      await this._peerDirectoryStore.ensurePeerFromInboundChat({
        ownerId: pending.requesterOwnerId,
        peerId: pending.remotePeerId,
        listenAddrs: requesterDir?.listenAddrs ?? [],
      });
    } catch (err) {
      console.warn(`[peer-directory] acceptHello ensurePeerFromInboundChat:`, err);
    }

    // Send bond.accept back to the requester
    const { createBondAcceptPayload, createUnsignedEnvelope } = await import("@envoymesh/protocol");
    const { signUnsignedEnvelope } = await import("@envoymesh/identity");
    const humanProfile = await this._humanProfileStore.loadHumanProfile();
    console.log(`[node-service] acceptHello: humanProfile loaded:`, humanProfile);
    const displayName = humanProfile?.displayName ?? selfProfile.owner.ownerId;
    console.log(`[node-service] acceptHello: using displayName="${displayName}" (humanProfile.displayName=${humanProfile?.displayName}, fallback=${selfProfile.owner.ownerId})`);

    console.log(`[node-service] Sending bond.accept to ${pending.requesterOwnerId} at peerId ${pending.remotePeerId}`);
    const acceptEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
        senderPublicKey: selfProfile.device.publicKeyPem,
        recipientPeerId: pending.remotePeerId,
        intent: "bond.accept",
        payload: createBondAcceptPayload({
          responderOwnerId: selfProfile.owner.ownerId,
          requesterOwnerId: pending.requesterOwnerId,
          message: `Hello from ${displayName}!`,
        }),
      }),
      selfProfile.device.privateKeyPem,
    );
    console.log(`[node-service] bond.accept envelope created: intent=${acceptEnvelope.intent}, recipientPeerId=${acceptEnvelope.recipientPeerId}, senderPeerId=${acceptEnvelope.senderPeerId}`);
    try {
      console.log(`[node-service] Attempting to send bond.accept to ${pending.remotePeerId} dialHints merged…`);
      const requesterDir = await this._peerDirectoryStore.getPeerByOwnerId(pending.requesterOwnerId);
      const acceptDialHints = await this._dialHintsForChat(pending.remotePeerId, requesterDir?.listenAddrs);
      console.log(`[node-service] bond.accept dialHints count=${acceptDialHints.length}`);
      await mesh.send(pending.remotePeerId, acceptEnvelope, {
        dialHints: acceptDialHints,
      });
      console.log(`[node-service] bond.accept sent successfully to ${pending.remotePeerId}`);
    } catch (sendError) {
      console.error(`[node-service] Failed to send bond.accept to ${pending.remotePeerId}: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
      // Don't throw - still update UI and clean up
    }

    // Emit bond:established event so the UI updates
    this.emit("bond:established", {
      peerOwnerId: pending.requesterOwnerId,
      displayName: pending.requesterDisplayName,
    });

    void this._flushPendingRoomSyncs();
    void this._flushPendingRoomMessages();

    void this.refreshBondPeerProfiles();
    void this._tagBondedContactReachability(pending.remotePeerId);

    // Remove from pending requests
    this._pendingHelloRequests.delete(messageId);

    console.log(`[node-service] Successfully accepted hello from ${pending.requesterOwnerId}`);
  }

  async declineHello(messageId: string, reason?: string): Promise<void> {
    // Find and remove the pending hello request
    const pending = this._pendingHelloRequests.get(messageId);
    if (pending) {
      console.log(`[node-service] Declining hello from ${pending.requesterOwnerId}: ${reason ?? "no reason"}`);
      this._pendingHelloRequests.delete(messageId);
    } else {
      console.warn(`[node-service] declineHello: no pending request found for messageId=${messageId}`);
    }
  }

  async blockPeer(peerOwnerId: string): Promise<void> {
    await this._trustStore.setTrustRecord({
      peerOwnerId,
      level: "blocked",
      now: new Date().toISOString(),
    });
    await this._untagReachabilityForOwner(peerOwnerId);
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
    await this._untagReachabilityForOwner(peerOwnerId);
    await this._trustStore.removeTrustRecord(peerOwnerId);
    if (this._sessionTokenStore) {
      await this._sessionTokenStore.removeTokensForOwner(peerOwnerId);
    }
    this.emit("bond:revoked", { peerOwnerId });
  }

  async getBonds(): Promise<BondRecord[]> {
    const trustRecords = await this._trustStore.listTrustRecords();
    const dirRecords = await this._peerDirectoryStore.listPeerRecords();
    const latestByOwner = new Map<string, { peerId: string; lastSeenAt: string }>();
    for (const r of dirRecords) {
      const libp2p = pickBestLibp2pPeerDirectoryRecord(dirRecords, r.ownerId);
      if (libp2p) {
        latestByOwner.set(r.ownerId, { peerId: libp2p.peerId, lastSeenAt: libp2p.lastSeenAt });
      }
    }
    for (const r of dirRecords) {
      if (latestByOwner.has(r.ownerId)) continue;
      const cur = latestByOwner.get(r.ownerId);
      if (!cur || r.lastSeenAt > cur.lastSeenAt) {
        latestByOwner.set(r.ownerId, { peerId: r.peerId, lastSeenAt: r.lastSeenAt });
      }
    }
    return trustRecords.map((record) => ({
      peerOwnerId: record.peerOwnerId,
      displayName: record.displayName,
      libp2pPeerId: latestByOwner.get(record.peerOwnerId)?.peerId,
      level: record.level,
      createdAt: record.createdAt,
      note: record.note,
    }));
  }

  // ============================================
  // Messaging
  // ============================================

  /**
   * Merge peer-directory listen addrs with discovery seeds and synthetic relay circuit paths.
   * Contacts from bond/hello often store empty listenAddrs; without `/p2p-circuit/...` hints, outbound
   * chat fails across NAT for one direction.
   */
  private async _dialHintsForChat(recipientPeerId: string, peerListenAddrs: string[] | undefined): Promise<string[]> {
    const config = await this._configStore.load();
    return buildOutboundDialHints({
      recipientPeerId,
      peerListenAddrs,
      discoverySeedStore: this._discoverySeedStore,
      config,
      profileDir: this._profileDir,
    });
  }

  private async _rememberBondedPeerTransportFromInbound(
    envelope: EnvoyEnvelope,
    context?: { transportPeerId?: string; remoteAddr?: string },
  ): Promise<void> {
    const transportPeerId = normalizeTransportPeerId(context?.transportPeerId);
    const ownerId = ownerIdFromProfileIntent(envelope);
    if (!transportPeerId || !ownerId) return;

    const listenAddrs = context?.remoteAddr?.trim() ? [context.remoteAddr.trim()] : [];
    this._lastLibp2pTransportByOwner.set(ownerId, { peerId: transportPeerId, listenAddrs });

    try {
      await this._peerDirectoryStore.ensurePeerFromInboundChat({
        ownerId,
        peerId: transportPeerId,
        listenAddrs,
      });
      if (envelope.senderPublicKey?.trim()) {
        await this._peerDirectoryStore.mergeInboundDeviceBinding({
          peerId: transportPeerId,
          devicePublicKeyPem: envelope.senderPublicKey,
          ownerId,
        });
      }
      console.log(
        `[peer-directory] learned ${ownerId.slice(0, 20)}… → libp2p ${transportPeerId.slice(0, 12)}… from ${envelope.intent}`,
      );
    } catch (err) {
      console.warn(`[peer-directory] learn from ${envelope.intent} failed:`, err);
    }
  }

  private async _resolveLibp2pPeerForBondOwner(
    ownerId: string,
  ): Promise<{ transportPeerId: string; listenAddrs?: string[] } | undefined> {
    const cached = this._lastLibp2pTransportByOwner.get(ownerId);
    if (cached && isLibp2pPeerId(cached.peerId)) {
      return { transportPeerId: cached.peerId, listenAddrs: cached.listenAddrs };
    }

    for (const pending of this._pendingHelloRequests.values()) {
      if (pending.requesterOwnerId === ownerId && isLibp2pPeerId(pending.remotePeerId)) {
        return { transportPeerId: pending.remotePeerId, listenAddrs: [] };
      }
    }

    try {
      const resolved = await this._resolvePeerTransportForOwner(ownerId);
      return { transportPeerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
    } catch {
      const records = await this._peerDirectoryStore.listPeerRecords();
      const libp2p = pickBestLibp2pPeerDirectoryRecord(records, ownerId);
      if (libp2p) {
        return { transportPeerId: libp2p.peerId, listenAddrs: libp2p.listenAddrs };
      }
      const mesh = this._reachableMesh();
      if (mesh) {
        for (const rec of records.filter((r) => r.ownerId === ownerId && isLibp2pPeerId(r.peerId))) {
          if (mesh.getPeerConnectionInfo(rec.peerId).connected) {
            return { transportPeerId: rec.peerId, listenAddrs: rec.listenAddrs };
          }
        }
      }
      console.warn(
        `[profile.sync] no libp2p route to ${ownerId.slice(0, 20)}…: Peer not found for owner (ask contact to message you once, or re-save their profile photo)`,
      );
      return undefined;
    }
  }

  private async _resolvePeerTransportForOwner(targetOwnerId: string): Promise<{
    transportPeerId: string;
    recipientEnvelopePeerId: string | undefined;
    listenAddrs: string[] | undefined;
  }> {
    const mesh = this._reachableMesh();
    const isConnected = mesh
      ? (peerId: string) => mesh.getPeerConnectionInfo(peerId).connected
      : undefined;

    const cachedTransport = this._lastLibp2pTransportByOwner.get(targetOwnerId);
    if (cachedTransport && isLibp2pPeerId(cachedTransport.peerId)) {
      const records = await raceWithTimeout(
        this._peerDirectoryStore.listPeerRecords(),
        25_000,
        "listPeerRecords",
      );
      const dirRow =
        records.find((r) => r.ownerId === targetOwnerId && r.peerId === cachedTransport.peerId) ??
        pickBestLibp2pPeerDirectoryRecord(records, targetOwnerId, { isConnected });
      const recipientEnvelopePeerId = dirRow?.devicePublicKeyPem
        ? derivePeerId(dirRow.devicePublicKeyPem)
        : targetOwnerId.startsWith("envoy_")
          ? targetOwnerId
          : undefined;
      return {
        transportPeerId: cachedTransport.peerId,
        recipientEnvelopePeerId,
        listenAddrs:
          cachedTransport.listenAddrs?.length ? cachedTransport.listenAddrs : dirRow?.listenAddrs,
      };
    }

    let targetPeer: Awaited<ReturnType<LocalPeerDirectoryStore["getPeerByOwnerId"]>>;
    try {
      targetPeer = await raceWithTimeout(
        this._peerDirectoryStore.getPeerByOwnerId(targetOwnerId),
        25_000,
        "getPeerByOwnerId",
      );
    } catch (err) {
      throw err;
    }
    if (!targetPeer) {
      const records = await raceWithTimeout(this._peerDirectoryStore.listPeerRecords(), 25_000, "listPeerRecords");
      targetPeer =
        pickBestLibp2pPeerDirectoryRecord(records, targetOwnerId, { isConnected }) ??
        records.find((r) => r.ownerId === targetOwnerId) ??
        records.find((r) => r.peerId === targetOwnerId) ??
        undefined;
    } else if (!isLibp2pPeerId(targetPeer.peerId)) {
      const records = await raceWithTimeout(this._peerDirectoryStore.listPeerRecords(), 25_000, "listPeerRecords");
      targetPeer =
        pickBestLibp2pPeerDirectoryRecord(records, targetOwnerId, { isConnected }) ?? targetPeer;
    }
    if (!targetPeer?.peerId) {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }
    const transportPeerId = targetPeer.peerId;
    if (!isLibp2pPeerId(transportPeerId)) {
      const mesh = this._reachableMesh();
      if (mesh) {
        const records = await this._peerDirectoryStore.listPeerRecords();
        for (const rec of records.filter((r) => r.ownerId === targetOwnerId && isLibp2pPeerId(r.peerId))) {
          const info = mesh.getPeerConnectionInfo(rec.peerId);
          if (info.connected) {
            const recipientEnvelopePeerId = rec.devicePublicKeyPem
              ? derivePeerId(rec.devicePublicKeyPem)
              : undefined;
            return {
              transportPeerId: rec.peerId,
              recipientEnvelopePeerId,
              listenAddrs: rec.listenAddrs,
            };
          }
        }
      }
      throw new Error(`Peer directory has Envoy envelope id for this owner (not libp2p).`);
    }
    const recipientEnvelopePeerId = targetPeer.devicePublicKeyPem
      ? derivePeerId(targetPeer.devicePublicKeyPem)
      : targetOwnerId.startsWith("envoy_")
        ? targetOwnerId
        : undefined;
    return {
      transportPeerId,
      recipientEnvelopePeerId,
      listenAddrs: targetPeer.listenAddrs,
    };
  }

  private _persistChatMessage(threadPeerOwnerId: string, msg: ChatMessage): void {
    if (!this._chatLogStore) return;
    void this._chatLogStore.append(threadPeerOwnerId, msg).catch((err) =>
      console.warn(`[chat-log] append failed for thread=${threadPeerOwnerId}:`, err),
    );
    void this._getRagService().then((rag) => {
      if (!rag) return;
      const view = chatLogRowsToViews([msg])[0];
      if (!view) return;
      return rag.indexChatMessage(threadPeerOwnerId, view);
    }).catch((err) => console.warn(`[rag] chat index failed:`, err));
  }

  /** Append one EnvoyAI row to the shared chat log and push to connected Social clients. */
  recordEnvoyAiChatMessage(msg: ChatMessage): void {
    this._persistChatMessage(ENVOY_AI_THREAD_KEY, msg);
    this.emit("chat:message", msg);
  }

  private async _loadEnvoyAiChatHistory(limit?: number): Promise<ChatMessage[]> {
    if (!this._chatLogStore) return [];
    const primary = await this._chatLogStore.listThread(ENVOY_AI_THREAD_KEY, limit);
    const legacyPeerId = this._bridgeStatus?.agentPeerId?.trim();
    if (!legacyPeerId || legacyPeerId === ENVOY_AI_THREAD_KEY) {
      return primary as ChatMessage[];
    }
    const legacy = await this._chatLogStore.listThread(legacyPeerId, limit);
    if (legacy.length === 0) {
      return primary as ChatMessage[];
    }
    const byId = new Map<string, ChatMessage>();
    for (const row of [...legacy, ...primary]) {
      byId.set(row.messageId, row as ChatMessage);
    }
    return [...byId.values()].sort(
      (a, b) =>
        new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime(),
    );
  }

  private async _persistEnvoyAiChatExchange(
    userText: string,
    turn: OwnerAgentTurnResult,
  ): Promise<void> {
    const profile = this._profile;
    const mesh = this._reachableMesh();
    if (!profile || !mesh || !this._chatLogStore) {
      return;
    }

    const trimmed = userText.trim();
    const answer = turn.answer.trim();
    if (!trimmed && !answer) {
      return;
    }

    let selfHuman: Awaited<ReturnType<HumanProfileStore["loadHumanProfile"]>> | null = null;
    try {
      selfHuman = await this._humanProfileStore.loadHumanProfile();
    } catch {
      /* ignore */
    }

    const ownerId = profile.owner.ownerId;
    const displayName = selfHuman?.displayName ?? ownerId;
    const timestamp = new Date().toISOString();
    const bridgeAgentPeerId = this._bridgeStatus?.agentPeerId?.trim() || ENVOY_AI_THREAD_KEY;
    const bridgeAgentId = this._bridgeStatus?.agentName?.trim();
    const assistantTurn: NonNullable<ChatMessage["metadata"]["assistantTurn"]> = {
      domain: turn.domain,
      intent: turn.intent,
      jobId: turn.jobId,
      correlationId: turn.correlationId,
      pendingApproval: turn.pendingApproval,
      routeId: turn.routeId,
      modelUsed: turn.modelUsed,
      format: turn.format,
      ...(turn.blocks?.length ? { blocks: turn.blocks } : {}),
    };

    if (trimmed) {
      this.recordEnvoyAiChatMessage({
        messageId: randomUUID(),
        sender: {
          nodeId: mesh.peerId,
          ownerId,
          displayName,
          actorRole: "human",
        },
        recipient: {
          nodeId: bridgeAgentPeerId,
          ownerId: ENVOY_AI_THREAD_KEY,
          displayName: bridgeAgentId ?? "EnvoyAI",
        },
        content: { text: trimmed },
        metadata: {
          timestamp,
          deliveryReceipt: "delivered",
          deliveryChannel: "ai",
        },
        signature: "",
      });
    }

    if (answer) {
      this.recordEnvoyAiChatMessage({
        messageId: randomUUID(),
        sender: {
          nodeId: bridgeAgentPeerId,
          ownerId: ENVOY_AI_THREAD_KEY,
          displayName: bridgeAgentId ?? "EnvoyAI",
          actorRole: "agent",
          agentVerified: true,
        },
        recipient: {
          nodeId: mesh.peerId,
          ownerId,
          displayName,
        },
        content: { text: answer },
        metadata: {
          timestamp,
          deliveryReceipt: "delivered",
          deliveryChannel: "ai",
          assistantTurn,
        },
        signature: "",
      });
    }
  }

  private _chatRoomDeps(): ChatRoomServiceDeps {
    const profile = () => this._requireProfile();
    return {
      getProfile: profile,
      requireMeshPeerId: () => this._requireMesh().peerId,
      trustStore: this._trustStore,
      humanProfileStore: this._humanProfileStore,
      chatRoomStore: this._chatRoomStore,
      pendingSyncStore: this._chatRoomPendingSyncStore,
      pendingMessageStore: this._chatRoomPendingMessageStore,
      resolvePeerTransportForOwner: (targetOwnerId) => this._resolvePeerTransportForOwner(targetOwnerId),
      deliverEnvelope: (targetOwnerId, transportPeerId, envelope, dialHints, listenAddrs) =>
        this._deliverChatEnvelope(transportPeerId, envelope, dialHints, listenAddrs).then((r) => {
          void targetOwnerId;
          return r;
        }),
      dialHintsForChat: (transportPeerId, listenAddrs) => this._dialHintsForChat(transportPeerId, listenAddrs),
      persistChatMessage: (threadKey, msg) => this._persistChatMessage(threadKey, msg),
      emitRoomUpdated: (room) => this.emit("chat:room-updated", room),
      emitRoomRemoved: (roomId) => this.emit("chat:room-removed", { roomId }),
      emitRoomMessage: (roomId, message) => this.emit("chat:room-message", { roomId, message }),
      assertOnline: () => this._assertOnline(),
      recordOwnerActivity: () => this.recordOwnerActivity(),
      formatSenderDisplayName: formatChatSenderDisplayName,
      verifyInboundDevice: (envelope, payload) => verifyInboundChatDevice(envelope, payload),
      verifyInboundSyncAuthor: (envelope, payload) =>
        verifyInboundChatDevice(envelope, {
          senderOwnerId: payload.updatedByOwnerId,
          deviceCertificate: payload.deviceCertificate,
          ownerPublicKeyPem: payload.ownerPublicKeyPem,
        }),
      markOutboundDelivered: (threadKey, messageId, deliveredAt) => {
        void this._markOutboundChatDelivered(threadKey, messageId, deliveredAt);
      },
      markOutboundFailed: (threadKey, messageId, recipientOwnerId, reason) => {
        void this._markOutboundChatFailed(threadKey, messageId, recipientOwnerId, reason);
      },
      recordGroupDeliveryProgress: (input) => {
        this._recordGroupDeliveryProgress(input);
      },
      clearChatThread: (threadKey) => {
        void this.clearChatHistory(threadKey);
      },
      shareChatFileToMember: (targetOwnerId, shareInput) =>
        this._shareFileInternal(targetOwnerId, {
          path: shareInput.vaultRelativePath,
          sensitivity: shareInput.sensitivity,
          deliveryChannel: "chat",
          chatRoomId: shareInput.chatRoomId,
          chatMessageId: shareInput.chatMessageId,
          chatAttachmentId: shareInput.chatAttachmentId,
        }).then(() => {}),
    };
  }

  private _recordGroupDeliveryProgress(input: {
    threadKey: string;
    messageId: string;
    recipientOwnerId: string;
    deliveredAt: string;
    allRecipientOwnerIds: readonly string[];
  }): void {
    const key = `${input.threadKey}:${input.messageId}`;
    let state = this._groupDeliveryPending.get(key);
    if (!state) {
      state = {
        threadKey: input.threadKey,
        pending: new Set(input.allRecipientOwnerIds),
      };
      this._groupDeliveryPending.set(key, state);
    }
    state.pending.delete(input.recipientOwnerId);
    if (this._chatLogStore) {
      void this._chatLogStore
        .updateGroupDeliveryProgress(input.threadKey, input.messageId, input.recipientOwnerId)
        .catch((err) => console.warn(`[chat-log] group delivery update failed:`, err));
    }
    this.emit("chat:delivered", {
      messageId: input.messageId,
      timestamp: input.deliveredAt,
      recipientOwnerId: input.recipientOwnerId,
    });
    if (state.pending.size === 0) {
      this._groupDeliveryPending.delete(key);
      void this._markOutboundChatDelivered(input.threadKey, input.messageId, input.deliveredAt);
    }
  }

  private async _flushPendingRoomSyncs(): Promise<void> {
    if (!this._chatRoomPendingSyncStore) return;
    try {
      await flushPendingRoomSyncsImpl(this._chatRoomDeps());
    } catch (err) {
      console.warn("[chat.room] pending sync flush failed:", err);
    }
  }

  private async _flushPendingRoomMessages(): Promise<void> {
    if (!this._chatRoomPendingMessageStore) return;
    try {
      await flushPendingRoomMessagesImpl(this._chatRoomDeps());
    } catch (err) {
      console.warn("[chat.room] pending message flush failed:", err);
    }
  }

  private _roomDeliveryAck(
    replyWithEnvelope: ((envelope: EnvoyEnvelope) => Promise<void>) | undefined,
  ): ChatRoomServiceDeps["replyWithDelivered"] {
    if (!replyWithEnvelope) return undefined;
    return async ({ messageId, senderEnvelopePeerId, correlationId }) => {
      const p = this._requireProfile();
      await replyWithEnvelope(
        buildSignedChatDeliveredEnvelope({
          profile: p,
          messageId,
          recipientOwnerId: p.owner.ownerId,
          envelopeRecipientPeerId: senderEnvelopePeerId,
          correlationId,
        }),
      );
    };
  }

  private async _getRagService(): Promise<RagService | null> {
    if (this._profileDir === "/tmp/unknown") return null;
    if (this._ragService) return this._ragService;
    if (!this._ragServiceInit) {
      this._ragServiceInit = (async () => {
        const config = await this.getNodeConfig();
        this._ragService = await createRagService({
          profileDir: this._profileDir,
          knowledgeBase: config.aiSettings?.knowledgeBase,
          modelProviders: config.modelProviders,
          chatLogStore: this._chatLogStore,
          onProgress: (progress) => {
            if (this.hasListeners("rag:reindex")) {
              this.emit("rag:reindex", progress);
            }
          },
        });
        if (this._vaultDir) {
          try {
            const vaultIndex = await buildVaultIndex(
              buildVaultIndexOptionsFromKnowledgeBase(this._vaultDir, config.aiSettings?.knowledgeBase),
            );
            await this._ragService.reindexVault({
              vaultIndex,
              knowledgeBase: config.aiSettings?.knowledgeBase,
            });
          } catch (error) {
            console.warn(`[rag] vault reindex on init failed:`, error);
          }
        }
        return this._ragService;
      })();
    }
    return this._ragServiceInit;
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
    const mesh = this._reachableMesh();
    const profile = this._profile;
    if (!mesh || !profile || !this._chatLogStore) {
      return;
    }

    let localPeerId: string;
    try {
      localPeerId = mesh.peerId;
    } catch {
      return;
    }

    let threadPeerOwnerId = input.peerOwnerId.trim();
    if (threadPeerOwnerId.startsWith("12D3") || threadPeerOwnerId.startsWith("Qm")) {
      const records = await this._peerDirectoryStore.listPeerRecords();
      const rec = records.find((r) => r.peerId === threadPeerOwnerId);
      if (!rec?.ownerId) {
        return;
      }
      threadPeerOwnerId = rec.ownerId;
    }
    if (!threadPeerOwnerId) {
      return;
    }

    const norm = input.vaultRelativePath.replace(/^[\\/]+/, "");
    const filename = basename(norm) || "file";
    const attachment: ChatAttachment = {
      id: randomUUID(),
      filename,
      mimeType: input.mimeType ?? mimeTypeForFilename(filename),
      sizeBytes: input.byteLength,
      sensitivity: input.sensitivity ?? "friends",
      vaultRelativePath: norm,
    };
    const text =
      input.textOverride ??
      (input.outgoing ? `Shared file ${filename}` : `Received file ${filename}`);

    const [selfHuman, peerTrust] = await Promise.all([
      this._humanProfileStore.loadHumanProfile(),
      this._trustStore.getTrustRecord(threadPeerOwnerId),
    ]);

    let peerTransportId = threadPeerOwnerId;
    try {
      const resolved = await this._resolvePeerTransportForOwner(threadPeerOwnerId);
      peerTransportId = resolved.transportPeerId;
    } catch {
      /* owner id only */
    }

    const timestamp = new Date().toISOString();
    const msg: ChatMessage = input.outgoing
      ? {
          messageId: randomUUID(),
          sender: {
            nodeId: localPeerId,
            ownerId: profile.owner.ownerId,
            displayName: selfHuman?.displayName ?? profile.owner.ownerId,
          },
          recipient: {
            nodeId: peerTransportId,
            ownerId: threadPeerOwnerId,
            displayName: peerTrust?.displayName ?? threadPeerOwnerId,
          },
          content: { text, attachments: [attachment] },
          metadata: { timestamp, deliveryReceipt: "sent" },
          signature: "local-file-share",
        }
      : {
          messageId: randomUUID(),
          sender: {
            nodeId: peerTransportId,
            ownerId: threadPeerOwnerId,
            displayName: peerTrust?.displayName ?? threadPeerOwnerId,
          },
          recipient: {
            nodeId: localPeerId,
            ownerId: profile.owner.ownerId,
            displayName: selfHuman?.displayName ?? profile.owner.ownerId,
          },
          content: { text, attachments: [attachment] },
          metadata: { timestamp },
          signature: "local-file-share",
        };

    this._persistChatMessage(threadPeerOwnerId, msg);
    this.emit("chat:message", msg);
  }

  private async _applyRoomAttachmentVaultPath(input: {
    roomId: string;
    messageId: string;
    attachmentId: string;
    vaultRelativePath: string;
  }): Promise<void> {
    if (!this._chatLogStore) return;
    const threadKey = chatRoomThreadKey(input.roomId.trim());
    const vaultPath = input.vaultRelativePath.replace(/^[\\/]+/, "");
    const updated = await this._chatLogStore.updateAttachmentVaultPath(
      threadKey,
      input.messageId,
      input.attachmentId,
      vaultPath,
    );
    if (!updated) return;
    const rows = await this._chatLogStore.listThread(threadKey, 5000);
    const msg = rows.find((m) => m.messageId === input.messageId);
    if (!msg) return;
    const full: ChatMessage = { ...msg, signature: msg.signature };
    this.emit("chat:room-message", { roomId: input.roomId.trim(), message: full });
  }

  private async _deliverChatEnvelope(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs?: string[],
  ): Promise<ChatDeliverResult> {
    return this._withChatSendLock(transportPeerId, async () => {
      const mesh = this._requireMesh();
      return deliverChatEnvelopeWithRetry({
        mesh,
        transportPeerId,
        envelope,
        dialHints,
        chatProtocol: ENVOY_CHAT_PROTOCOL,
        rebuildDialHints: () => this._dialHintsForChat(transportPeerId, listenAddrs),
      });
    });
  }

  private async _markOutboundChatDelivered(
    threadPeerOwnerId: string,
    messageId: string,
    deliveredAt: string,
  ): Promise<void> {
    if (this._chatLogStore) {
      await this._chatLogStore
        .updateDeliveryReceipt(threadPeerOwnerId, messageId, "delivered")
        .catch((err) => console.warn(`[chat-log] delivery update failed:`, err));
    }
    this.emit("chat:delivered", { messageId, timestamp: deliveredAt });
  }

  private async _markOutboundChatFailed(
    threadKey: string,
    messageId: string,
    recipientOwnerId: string,
    reason: string,
  ): Promise<void> {
    if (this._chatLogStore && !threadKey.startsWith("room:")) {
      // 1:1 thread — recipientOwnerId is the thread key. Room messages use
      // `room:<roomId>` and track per-recipient delivery in
      // deliveredToOwnerIds/pendingRecipientOwnerIds; for those we only
      // emit the event so the UI can update without needing a new field.
      await this._chatLogStore
        .updateDeliveryReceipt(threadKey, messageId, "failed")
        .catch((err) => console.warn(`[chat-log] failed-receipt update failed:`, err));
    }
    this.emit("chat:delivery-failed", { threadKey, messageId, recipientOwnerId, reason });
  }

  private async _withChatSendLock<T>(transportPeerId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this._chatSendChains.get(transportPeerId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prev.then(() => gate);
    this._chatSendChains.set(transportPeerId, chain);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this._chatSendChains.get(transportPeerId) === chain) {
        this._chatSendChains.delete(transportPeerId);
      }
    }
  }

  async sendChat(targetOwnerId: string, text: string): Promise<SendChatResult> {
    this._assertOnline();
    // Record owner activity when they send a message (keeps them "online" in automatic mode)
    this.recordOwnerActivity();
    recordMeshActivity();
    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    console.log(`[sendChat] targetOwnerId=${targetOwnerId}, text=${text}`);

    const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
      await this._resolvePeerTransportForOwner(targetOwnerId);

    const [selfHuman, recipientTrust] = await Promise.all([
      this._humanProfileStore.loadHumanProfile(),
      this._trustStore.getTrustRecord(targetOwnerId),
    ]);

    const dialHints = await raceWithTimeout(
      this._dialHintsForChat(transportPeerId, listenAddrs),
      30_000,
      "_dialHintsForChat",
    );

    console.log(
      `[sendChat] transportPeerId=${transportPeerId} envelopeRecipientPeerId=${recipientEnvelopePeerId ?? "(omitted)"} dialHints=${dialHints.length}`,
    );

    void this._tagBondedContactReachability(transportPeerId);

    const wireText = stripModelThinking(text);

    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
        senderPublicKey: selfProfile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: recipientEnvelopePeerId,
        recipientRole: "human",
        intent: "chat.message",
        payload: createChatMessagePayload({
          senderOwnerId: selfProfile.owner.ownerId,
          text: wireText,
          ...chatMessagePayloadDeviceFields({
            deviceCertificate: selfProfile.deviceCertificate,
            ownerPublicKeyPem: selfProfile.owner.publicKeyPem,
          }),
        }),
      }),
      selfProfile.device.privateKeyPem,
    );

    let deliverResult: ChatDeliverResult = { delivered: false };
    if (transportPeerId === mesh.peerId && this._bridgeChatHandler) {
      console.log(`[sendChat] self-send to ${targetOwnerId}, routing via bridge handler`);
      await this._bridgeChatHandler(envelope, mesh.peerId);
      deliverResult = { delivered: true, deliveredAt: new Date().toISOString() };
    } else {
      deliverResult = await this._deliverChatEnvelope(transportPeerId, envelope, dialHints, listenAddrs);
    }

    const deliveryReceipt = deliverResult.delivered ? ("delivered" as const) : ("sent" as const);
    const emittedMsg: ChatMessage = {
      messageId: envelope.messageId,
      sender: {
        nodeId: mesh.peerId,
        ownerId: selfProfile.owner.ownerId,
        displayName: selfHuman?.displayName ?? selfProfile.owner.ownerId,
        actorRole: "human",
      },
      recipient: {
        nodeId: transportPeerId,
        ownerId: targetOwnerId,
        displayName: recipientTrust?.displayName ?? targetOwnerId,
      },
      content: {
        text: wireText,
      },
      metadata: {
        timestamp: envelope.createdAt,
        deliveryReceipt,
      },
      signature: envelope.signature,
    };
    console.log(`[sendChat] Emitting chat:message locally:`, emittedMsg);
    this._persistChatMessage(targetOwnerId, emittedMsg);
    this.emit("chat:message", emittedMsg);
    if (deliverResult.delivered) {
      await this._markOutboundChatDelivered(
        targetOwnerId,
        envelope.messageId,
        deliverResult.deliveredAt ?? envelope.createdAt,
      );
    }
    this._styleAdapter?.learnFromMessage(true, wireText);
    return {
      messageId: envelope.messageId,
      deliveryReceipt,
      deliveredAt: deliverResult.deliveredAt,
    };
  }

  async sendAgentChat(targetOwnerId: string, text: string): Promise<SendChatResult> {
    this._assertOnline();
    recordMeshActivity();
    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity) {
      throw new Error("Agent identity is not available");
    }

    const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
      await this._resolvePeerTransportForOwner(targetOwnerId);

    const [selfHuman, recipientTrust, config] = await Promise.all([
      this._humanProfileStore.loadHumanProfile(),
      this._trustStore.getTrustRecord(targetOwnerId),
      this.getNodeConfig(),
    ]);

    let wireText = stripModelThinking(text);
    const aiIdentity = config.aiSettings?.identity;
    wireText = applyAiIdentityForIdentity(wireText, aiIdentity);
    console.log(`[sendAgentChat] targetOwnerId=${targetOwnerId}, text=${wireText.slice(0, 80)}`);

    const dialHints = await raceWithTimeout(
      this._dialHintsForChat(transportPeerId, listenAddrs),
      30_000,
      "_dialHintsForChat",
    );

    void this._tagBondedContactReachability(transportPeerId);

    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: agentIdentity.agentPeerId,
        senderPublicKey: agentIdentity.agentPublicKeyPem,
        senderRole: "agent",
        recipientPeerId: recipientEnvelopePeerId,
        recipientRole: "human",
        intent: "chat.message",
        payload: createChatMessagePayload({
          senderOwnerId: agentIdentity.ownerId,
          text: wireText,
        }),
        agentCredential: agentIdentity.agentCredential,
      }),
      agentIdentity.agentPrivateKeyPem,
    );

    let deliverResult: ChatDeliverResult = { delivered: false };
    if (transportPeerId === mesh.peerId && this._bridgeChatHandler) {
      await this._bridgeChatHandler(envelope, mesh.peerId);
      deliverResult = { delivered: true, deliveredAt: new Date().toISOString() };
    } else {
      deliverResult = await this._deliverChatEnvelope(transportPeerId, envelope, dialHints, listenAddrs);
    }

    const deliveryReceipt = deliverResult.delivered ? ("delivered" as const) : ("sent" as const);
    const emittedMsg: ChatMessage = {
      messageId: envelope.messageId,
      sender: {
        nodeId: agentIdentity.agentPeerId,
        ownerId: agentIdentity.ownerId,
        displayName: selfHuman?.displayName ?? agentIdentity.ownerId,
        actorRole: "agent",
        agentId: agentIdentity.agentCredential.agentId,
        agentVerified: true,
      },
      recipient: {
        nodeId: transportPeerId,
        ownerId: targetOwnerId,
        displayName: recipientTrust?.displayName ?? targetOwnerId,
      },
      content: { text: wireText },
      metadata: {
        timestamp: envelope.createdAt,
        deliveryReceipt,
      },
      signature: envelope.signature,
    };
    this._persistChatMessage(targetOwnerId, emittedMsg);
    this.emit("chat:message", emittedMsg);
    if (deliverResult.delivered) {
      await this._markOutboundChatDelivered(
        targetOwnerId,
        envelope.messageId,
        deliverResult.deliveredAt ?? envelope.createdAt,
      );
    }
    return {
      messageId: envelope.messageId,
      deliveryReceipt,
      deliveredAt: deliverResult.deliveredAt,
    };
  }

  async listAgentActivity(params?: ListAgentActivityParams): Promise<AgentActivityRecord[]> {
    if (!this._agentActivityStore) return [];
    return this._agentActivityStore.list(params);
  }

  async listCommerceReceipts(params?: ListCommerceReceiptsParams): Promise<CommerceReceiptRecord[]> {
    if (!this._commerceReceiptStore) return [];
    return this._commerceReceiptStore.list(params);
  }

  async recordCommerceReceipt(params: RecordCommerceReceiptParams): Promise<CommerceReceiptRecord> {
    this.recordOwnerActivity();
    if (!this._commerceReceiptStore || !this._agentActivityStore) {
      throw new Error("Commerce receipt store not initialized");
    }
    const taskId = params.taskId.trim();
    const counterpartyOwnerId = params.counterpartyOwnerId.trim();
    const documentId = params.documentId.trim();
    if (!taskId || !counterpartyOwnerId || !documentId) {
      throw new Error("taskId, counterpartyOwnerId, and documentId are required");
    }

    const index = await buildVaultIndex({ rootDir: this._vaultDir });
    const doc = index.documents.find((row) => row.documentId === documentId);
    if (!doc) {
      throw new Error(`Vault document not found: ${documentId}`);
    }

    const externalExports = await createPublishedExternalStore(this._profileDir).loadAll();
    const exportRecord = externalExports.get(documentId);
    const cid = params.cid?.trim() || exportRecord?.cid;

    const summary = params.summary?.trim() || `Delivered ${doc.title || doc.relativePath}`;
    const receipt = buildCommerceReceiptFromTaskResult({
      result: {
        taskId,
        mandateId: params.mandateId?.trim() || undefined,
        status: "completed",
        summary,
        artifacts: [],
        deliveryAttestation: {
          documentId: doc.documentId,
          relativePath: doc.relativePath,
          contentHash: doc.contentHash,
          cid,
          counterpartyOwnerId,
        },
        createdAt: new Date().toISOString(),
      },
      attestation: {
        documentId: doc.documentId,
        relativePath: doc.relativePath,
        contentHash: doc.contentHash,
        cid,
        counterpartyOwnerId,
      },
      receiptId: randomUUID(),
      direction: "outbound",
    });

    await this._commerceReceiptStore.append(receipt);
    const activity = mapCommerceReceiptToActivity(receipt, randomUUID());
    await this._agentActivityStore.append(activity);
    void this._publishAgentActivity(activity, counterpartyOwnerId);
    return receipt;
  }

  async listAuditEvents(params?: ListAuditEventsParams): Promise<AuditEventSummary[]> {
    if (!this._taskStore) return [];
    const limit = Math.max(1, Math.min(params?.limit ?? 100, 500));
    const rows = await this._taskStore.queryAuditEvents({
      correlationId: params?.correlationId,
      taskId: params?.taskId,
      since: params?.since,
      until: params?.until,
      limit,
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

  async listTaskJournalEntries(params?: ListTaskJournalParams): Promise<TaskJournalSummary[]> {
    if (!this._taskStore) return [];
    const limit = Math.max(1, Math.min(params?.limit ?? 100, 500));
    let rows = await this._taskStore.readTaskJournalEntries();
    if (params?.taskId) {
      rows = rows.filter((row) => row.taskId === params.taskId);
    }
    return rows
      .slice(-limit)
      .reverse()
      .map((row) => ({
        eventId: row.eventId,
        taskId: row.taskId,
        eventType: row.eventType,
        summary: row.summary,
        createdAt: row.createdAt,
        mandateId: row.mandateId,
      }));
  }

  async listAgentCards(): Promise<CachedAgentCardSummary[]> {
    if (!this._agentCardStore) return [];
    const rows = await this._agentCardStore.list();
    return rows.map((row) => ({
      ownerId: row.ownerId,
      displayName: row.card.displayName,
      capabilities: row.card.capabilities,
      cachedAt: row.cachedAt,
      sourceAgentPeerId: row.sourceAgentPeerId,
    }));
  }

  async getAgentCard(ownerId: string): Promise<CachedAgentCardSummary | undefined> {
    if (!this._agentCardStore) return undefined;
    const row = await this._agentCardStore.get(ownerId.trim());
    if (!row) return undefined;
    return {
      ownerId: row.ownerId,
      displayName: row.card.displayName,
      capabilities: row.card.capabilities,
      cachedAt: row.cachedAt,
      sourceAgentPeerId: row.sourceAgentPeerId,
    };
  }

  async requestAgentCard(targetOwnerId: string): Promise<{ ok: boolean; error?: string }> {
    this._assertOnline();
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity) {
      return { ok: false, error: "agent identity not available" };
    }
    const profile = this._requireProfile();
    const mesh = this._requireMesh();
    const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
      await this._resolvePeerTransportForOwner(targetOwnerId.trim());
    const dialHints = await raceWithTimeout(
      this._dialHintsForChat(transportPeerId, listenAddrs),
      30_000,
      "_dialHintsForChat",
    );
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: agentIdentity.agentPeerId,
        senderPublicKey: agentIdentity.agentPublicKeyPem,
        senderRole: "agent",
        recipientPeerId: recipientEnvelopePeerId,
        recipientRole: "agent",
        intent: "agent.card.request",
        payload: createAgentCardRequestPayload({
          requesterOwnerId: profile.owner.ownerId,
          requesterDeviceId: profile.device.deviceId,
        }),
        agentCredential: agentIdentity.agentCredential,
      }),
      agentIdentity.agentPrivateKeyPem,
    );
    await mesh.send(transportPeerId, envelope, { dialHints });
    return { ok: true };
  }

  async recordAgentCardCached(ownerId: string, card: import("@envoymesh/protocol").AgentCard): Promise<void> {
    if (!this._agentActivityStore) return;
    const record: AgentActivityRecord = {
      activityId: randomUUID(),
      domain: "research",
      kind: "task_progress",
      summary: `Learned agent card for ${card.displayName}`,
      remoteOwnerId: ownerId,
      remoteActorRole: "agent",
      createdAt: new Date().toISOString(),
    };
    await this._agentActivityStore.append(record);
    await this._publishAgentActivity(record, ownerId);
  }

  async recordInboundKnowledgeAnswered(params: {
    remoteOwnerId?: string;
    correlationId?: string;
    queryPreview: string;
  }): Promise<void> {
    if (!this._agentActivityStore) return;
    const record: AgentActivityRecord = {
      activityId: randomUUID(),
      correlationId: params.correlationId,
      domain: "knowledge",
      kind: "knowledge_answered",
      summary: `Answered inbound knowledge.query: ${params.queryPreview}`,
      remoteOwnerId: params.remoteOwnerId,
      remoteActorRole: "agent",
      createdAt: new Date().toISOString(),
    };
    await this._agentActivityStore.append(record);
    await this._publishAgentActivity(record, params.remoteOwnerId);
  }

  async runScheduledFriendAutopilot(): Promise<{ ok: boolean; error?: string }> {
    const config = await this.getNodeConfig();
    const intervalHours = config.friendAutopilotIntervalHours ?? 0;
    if (
      !shouldRunScheduledFriendAutopilot({
        friendAutopilotEnabled: config.friendAutopilotEnabled ?? false,
        trustModeEnabled: config.trustModeEnabled ?? false,
        intervalHours,
        lastRunAt: config.friendAutopilotLastRunAt,
      })
    ) {
      return { ok: false, error: "not due" };
    }

    const correlationId = randomUUID();
    const pass = await runFriendAutopilotPass({
      getContext: () => this.getToolExecutionContext(),
    });
    await this._recordFriendAutopilotPass({
      ok: pass.ok,
      error: pass.error,
      trigger: "scheduled",
      correlationId,
    });
    await this.updateNodeConfig({ friendAutopilotLastRunAt: new Date().toISOString() });
    return { ok: pass.ok, error: pass.error };
  }

  async listSocialProxySessions(): Promise<SocialProxySession[]> {
    if (!this._socialProxyStore) return [];
    return this._socialProxyStore.list();
  }

  async advanceSocialProxySession(sessionId: string): Promise<SocialProxySession | undefined> {
    if (!this._socialProxyStore) return undefined;
    const config = await this.getNodeConfig();
    return advanceSocialProxySession(this._socialProxyOrchestratorDeps(config), sessionId.trim());
  }

  async notifySocialProxyOwnerCommitment(
    sessionId: string,
    ownerCommitmentRef: string,
  ): Promise<SocialProxySession | undefined> {
    if (!this._socialProxyStore) return undefined;
    const session = await this._socialProxyStore.get(sessionId.trim());
    if (!session) {
      throw new Error(`Social proxy session not found: ${sessionId}`);
    }
    if (session.introProposalMessageId) {
      const row = this._pendingSocialIntroProposals.get(session.introProposalMessageId);
      if (row) {
        row.ownerCommitmentRef = ownerCommitmentRef;
      }
    }
    const withRef = {
      ...session,
      ownerCommitmentRef,
      updatedAt: new Date().toISOString(),
    };
    const { session: next } = transitionSocialProxySession(withRef, "OWNER_APPROVE_INTRO", {
      hasOwnerCommitmentRef: true,
    });
    await this._socialProxyStore.save(next);
    return next;
  }

  async runSocialProxyPass(input?: {
    targetOwnerId?: string;
    targetPeerId?: string;
    targetAgentPeerId?: string;
    focusSessionId?: string;
  }): Promise<{ ok: boolean; error?: string; correlationId?: string }> {
    const config = await this.getNodeConfig();
    if (!this._socialProxyStore) {
      return { ok: false, error: "social proxy store unavailable" };
    }
    const deps = this._socialProxyOrchestratorDeps(config);
    const result = await runSocialProxyPass({
      ...deps,
      focusSessionId: input?.focusSessionId,
      targetCandidate:
        input?.targetOwnerId && input?.targetPeerId
          ? {
              ownerId: input.targetOwnerId,
              peerId: input.targetPeerId,
              agentPeerId: input.targetAgentPeerId,
            }
          : undefined,
    });
    if (result.ok) {
      await this.updateNodeConfig({ socialProxyLastPassAt: new Date().toISOString() });
    }
    return result;
  }

  private _socialProxyOrchestratorDeps(config: NodeConfig) {
    return {
      getContext: () => this.getToolExecutionContext(),
      socialProxyEnabled: config.socialProxyEnabled ?? false,
      trustModeEnabled: config.trustModeEnabled ?? false,
      autonomousKillSwitch: config.autonomousKillSwitch ?? false,
      postureRef: config.socialProxyMandateId ?? "default-social-proxy",
      listSessions: () => this._socialProxyStore!.list(),
      saveSession: (session: SocialProxySession) => this._socialProxyStore!.save(session),
      recordActivity: async (input: {
        correlationId: string;
        summary: string;
        remoteOwnerId?: string;
        sessionId: string;
      }) => {
        if (!this._agentActivityStore) return;
        const record: AgentActivityRecord = {
          activityId: randomUUID(),
          correlationId: input.correlationId,
          taskId: input.sessionId,
          domain: "social",
          kind: "social_proxy_transition",
          summary: input.summary,
          remoteOwnerId: input.remoteOwnerId,
          createdAt: new Date().toISOString(),
        };
        await this._agentActivityStore.append(record);
        await this._publishAgentActivity(record, input.remoteOwnerId);
      },
      policy: {
        autoHello: true,
        helloRequiresApproval: false,
        maxNewIntrosPerDay: 5,
        autoChatWithPeerHumans: true,
      },
      proposeIntro: (session: SocialProxySession, candidate: { ownerId: string; peerId: string }) =>
        this._proposeSocialIntro(session, candidate),
      syncIntroWithCandidate: (
        session: SocialProxySession,
        candidate: { ownerId: string; peerId: string; agentPeerId?: string },
      ) => this._syncSocialIntro(session, candidate),
      sendHello: (session: SocialProxySession) => this._sendSocialProxyHello(session),
      sendAgentChat: async (session: SocialProxySession, text: string) => {
        if (!session.candidateOwnerId) return false;
        await this.sendAgentChat(session.candidateOwnerId, text);
        return true;
      },
    };
  }

  private async _syncSocialIntro(
    session: SocialProxySession,
    candidate: { ownerId: string; peerId: string; agentPeerId?: string },
  ): Promise<boolean> {
    const agentIdentity = await this._ensureAgentIdentity();
    const profile = this._profile;
    const mesh = this._reachableMesh();
    if (!agentIdentity || !profile || !mesh || !candidate.agentPeerId) return false;

    const { transportPeerId } = await this._resolvePeerTransportForOwner(candidate.ownerId);
    const unsigned = createUnsignedEnvelope({
      senderPeerId: agentIdentity.agentPeerId,
      senderPublicKey: agentIdentity.agentPublicKeyPem,
      senderRole: "agent",
      recipientPeerId: candidate.agentPeerId,
      recipientRole: "agent",
      intent: "social.intro.sync",
      payload: createSocialIntroSyncPayload({
        introCorrelationId: session.correlationId,
        ownerId: profile.owner.ownerId,
        counterpartyOwnerIdHint: candidate.ownerId,
        profileFragmentRefs: [],
        interest: "explore",
      }),
      agentCredential: agentIdentity.agentCredential,
      correlationId: session.correlationId,
    });
    const signed = signUnsignedEnvelope(unsigned, agentIdentity.agentPrivateKeyPem);
    const dialHints = await this._dialHintsForChat(transportPeerId, undefined);
    await mesh.send(transportPeerId, signed, { dialHints });
    return true;
  }

  private async _proposeSocialIntro(
    session: SocialProxySession,
    candidate: { ownerId: string; peerId: string },
  ): Promise<{ messageId: string; introCorrelationId: string } | null> {
    const agentIdentity = await this._ensureAgentIdentity();
    const profile = this._profile;
    const mesh = this._reachableMesh();
    if (!agentIdentity || !profile || !mesh) return null;

    const { transportPeerId, recipientEnvelopePeerId } = await this._resolvePeerTransportForOwner(
      candidate.ownerId,
    );
    if (!recipientEnvelopePeerId) return null;

    const fragment = createHumanProfileFragmentPayload({
      ownerId: profile.owner.ownerId,
      purpose: "trust-mode-intro",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      bio: "Social proxy introduction",
      signature: "local-fragment",
    });

    const unsigned = createUnsignedEnvelope({
      senderPeerId: agentIdentity.agentPeerId,
      senderPublicKey: agentIdentity.agentPublicKeyPem,
      senderRole: "agent",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "social.intro.propose",
      payload: createSocialIntroProposePayload({
        introCorrelationId: session.correlationId,
        candidateOwnerId: candidate.ownerId,
        candidatePeerId: recipientEnvelopePeerId,
        profileFragment: fragment,
        rationale: "Social proxy introduction",
      }),
      agentCredential: agentIdentity.agentCredential,
      correlationId: session.correlationId,
    });
    const signed = signUnsignedEnvelope(unsigned, agentIdentity.agentPrivateKeyPem);
    const dialHints = await this._dialHintsForChat(transportPeerId, undefined);
    await mesh.send(transportPeerId, signed, { dialHints });

    const receivedAt = new Date().toISOString();
    this._pendingSocialIntroProposals.set(signed.messageId, {
      messageId: signed.messageId,
      introCorrelationId: session.correlationId,
      candidateOwnerId: candidate.ownerId,
      candidatePeerId: candidate.peerId,
      agentPeerId: agentIdentity.agentPeerId,
      agentOwnerId: profile.owner.ownerId,
      rationale: "Social proxy introduction",
      receivedAt,
      ownerCommitmentRef: session.ownerCommitmentRef,
    });

    return { messageId: signed.messageId, introCorrelationId: session.correlationId };
  }

  private async _sendSocialProxyHello(session: SocialProxySession): Promise<boolean> {
    if (!session.candidateOwnerId || !session.introProposalMessageId) return false;
    const humanProfile = await this._humanProfileStore.loadHumanProfile();
    await this.sendHello(
      session.candidateOwnerId,
      {
        displayName: humanProfile?.displayName ?? this._requireProfile().owner.ownerId,
        bio: humanProfile?.bio,
        interests: [],
        whatShares: [],
      },
      "Social proxy hello",
      { introProposalMessageId: session.introProposalMessageId },
    );
    return true;
  }

  async cancelSocialProxySession(sessionId: string): Promise<void> {
    if (!this._socialProxyStore) return;
    const session = await this._socialProxyStore.get(sessionId.trim());
    if (!session) return;
    const { session: next } = transitionSocialProxySession(session, "KILL_SWITCH");
    await this._socialProxyStore.save(next);
  }

  // ----- Phase 23A — Agent Circle CRUD -----

  async listAgentCircles(): Promise<AgentCircle[]> {
    if (!this._circleStore) return [];
    return this._circleStore.listCircles();
  }

  async createAgentCircle(input: {
    label: string;
    memberOwnerIds: string[];
    topicTags?: string[];
  }): Promise<AgentCircle> {
    if (!this._circleStore) throw new Error("circle store unavailable");
    const now = new Date().toISOString();
    const circle: AgentCircle = {
      circleId: `circle-${Date.now()}`,
      label: input.label,
      status: "active",
      memberOwnerIds: input.memberOwnerIds,
      topicTags: input.topicTags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await this._circleStore.saveCircle(circle);
    return circle;
  }

  async updateAgentCircle(circleId: string, update: {
    label?: string;
    status?: AgentCircle["status"];
    memberOwnerIds?: string[];
    topicTags?: string[];
  }): Promise<AgentCircle> {
    if (!this._circleStore) throw new Error("circle store unavailable");
    const circles = await this._circleStore.listCircles();
    const circle = circles.find((c) => c.circleId === circleId);
    if (!circle) throw new Error(`Circle not found: ${circleId}`);
    if (update.label !== undefined) circle.label = update.label;
    if (update.status !== undefined) circle.status = update.status;
    if (update.memberOwnerIds !== undefined) circle.memberOwnerIds = update.memberOwnerIds;
    if (update.topicTags !== undefined) circle.topicTags = update.topicTags;
    circle.updatedAt = new Date().toISOString();
    await this._circleStore.saveCircle(circle);
    return circle;
  }

  async deleteAgentCircle(circleId: string): Promise<void> {
    if (!this._circleStore) return;
    await this._circleStore.deleteCircle(circleId);
  }

  async proposeAgentCircles(): Promise<AgentCircle[]> {
    if (!this._circleStore) return [];
    const bonds = await this.getBonds();
    const deps = {
      getBonds: async () => bonds.map((b) => ({ ...b })),
      getContactTopics: (ownerId: string) => this._getContactTopicsFromLibrary(ownerId),
      getContactCapabilities: async () => [] as string[],
    };
    const proposals = await proposeCircles(deps, { minMembers: 2 });
    const circles = proposals.map((p) => circleFromProposal(p, "proposed"));
    for (const c of circles) {
      await this._circleStore!.saveCircle(c);
    }
    return circles;
  }

  // ----- End Phase 23A -----

  // Phase 23C — Bond steward pass
  async runBondStewardPass(thresholdDays?: number): Promise<{ dormantBonds: Array<{ peerOwnerId: string; displayName?: string; dormantDays: number }>; summary: string }> {
    const { findDormantBonds } = await import("./bond-steward.js");
    const deps = {
      getBonds: async () => this.getBonds(),
      getLastInteractionAt: async () => null, // TODO: wire chat log store
    };
    return findDormantBonds(deps, thresholdDays ?? 90);
  }

  // Phase 23B — Connection suggester pass
  async runConnectionSuggesterPass(): Promise<Array<{ remoteOwnerId: string; remoteDisplayName: string; reason: string; relevanceScore: number }>> {
    const { matchPeerInterests } = await import("./connection-suggester.js");
    const { recordConnectionSuggestion } = await import("./agent-activity-hooks.js");
    if (!this._taskStore) return [];

    const config = await this._configStore.load();
    const ownerTopics: string[] = [];
    if (ownerTopics.length === 0) return [];

    const bonds = await this.getBonds();
    const results: Array<{ remoteOwnerId: string; remoteDisplayName: string; reason: string; relevanceScore: number }> = [];

    for (const bond of bonds) {
      const peerTopics: string[] = [];
      const peerCaps: string[] = []; // Capabilities from manifest (wired separately)
      const match = matchPeerInterests(ownerTopics, peerTopics, peerCaps);

      if (match.score > 0) {
        const suggestion = {
          remoteOwnerId: bond.peerOwnerId,
          remoteDisplayName: bond.displayName ?? bond.peerOwnerId,
          reason: `Matching interests: ${match.matchedTopics.join(", ")}`,
          relevanceScore: match.score,
        };
        results.push(suggestion);

        if (this._agentActivityStore) {
          await recordConnectionSuggestion(
            this._agentActivityStore,
            suggestion,
            this._profile?.owner.ownerId ?? "local-owner",
            (record) => this.emit?.("agent:activity", record),
          );
        }
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  // Phase 29 — OpenClaw Runtime
  private _openclawRuntime: import("../../../packages/openclaw-runtime/src/index.js").OpenClawRuntime | null = null;
  private _openclawGatewayChild: import("node:child_process").ChildProcess | null = null;
  private _openclawGatewayReady = false;
  private _openclawStartPromise: Promise<boolean> | null = null;
  private _assistantAgentUrl = "http://127.0.0.1:18789/webhook/envoymesh";
  private _assistantAgentSecret: string | undefined;
  private readonly _pendingOpenClawReplies = new Map<
    string,
    { resolve: (text: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private static readonly _openClawReplyTimeoutMs = 180_000;
  private static readonly _openClawRetrievedContextTimeoutMs = 25_000;
  private static readonly _openClawStartupProbeAttempts = 90;
  private _openclawActiveTurnTools: string[] | null = null;
  private _openClawAskInFlight = 0;
  private _openClawGatewayRouteRegistered = false;
  private _openClawLastProbeWarnAt = 0;
  private _openClawAskChain: Promise<unknown> = Promise.resolve();

  private _setOpenClawGatewayReady(ready: boolean): void {
    this._openclawGatewayReady = ready;
    if (!ready) {
      this._openClawGatewayRouteRegistered = false;
    }
  }

  private _assistantGatewayPort(): number {
    try {
      const u = new URL(this._assistantAgentUrl);
      if (u.port) return Number(u.port);
      return u.protocol === "https:" ? 443 : 80;
    } catch {
      return 18789;
    }
  }

  private async _withOpenClawAskLock<T>(fn: () => Promise<T>): Promise<T> {
    this._openClawAskInFlight += 1;
    try {
      const run = this._openClawAskChain.then(fn, fn);
      this._openClawAskChain = run.then(
        () => undefined,
        () => undefined,
      );
      return await run;
    } finally {
      this._openClawAskInFlight = Math.max(0, this._openClawAskInFlight - 1);
    }
  }

  private async _probeOpenClawWebhook(options?: { quiet?: boolean }): Promise<boolean> {
    try {
      const resp = await fetch(this._assistantAgentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(2000),
      });
      if (!isOpenClawEnvoymeshWebhookReady(resp.status)) {
        if (!options?.quiet) {
          const now = Date.now();
          if (now - this._openClawLastProbeWarnAt > 10_000) {
            this._openClawLastProbeWarnAt = now;
            console.warn(
              `[openclaw] webhook probe got ${resp.status} at ${this._assistantAgentUrl} — EnvoyMesh route not registered`,
            );
          }
        }
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private async _waitForOpenClawGatewayReady(): Promise<boolean> {
    for (let attempt = 0; attempt < NodeServiceImpl._openClawStartupProbeAttempts; attempt++) {
      if (await this._probeOpenClawWebhook({ quiet: true })) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }

  private _rejectAllPendingOpenClawReplies(reason: string): void {
    for (const [id, entry] of this._pendingOpenClawReplies) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
      this._pendingOpenClawReplies.delete(id);
    }
  }

  private _cancelOpenClawReply(correlationId: string, error: Error): void {
    const entry = this._pendingOpenClawReplies.get(correlationId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this._pendingOpenClawReplies.delete(correlationId);
    entry.reject(error);
  }

  /** Track mesh tools invoked during an OpenClaw H2A turn (via bridge execute-tool). */
  recordOpenClawToolCall(toolName: string): void {
    if (this._openclawActiveTurnTools && !this._openclawActiveTurnTools.includes(toolName)) {
      this._openclawActiveTurnTools.push(toolName);
    }
  }

  private _beginOpenClawToolTracking(): void {
    this._openclawActiveTurnTools = [];
  }

  private _endOpenClawToolTracking(): string[] {
    const tools = this._openclawActiveTurnTools ?? [];
    this._openclawActiveTurnTools = null;
    return tools;
  }

  /** True when the built-in OpenClaw gateway webhook is reachable. */
  isOpenClawReady(): boolean {
    return this._openclawGatewayReady && this._openclawGatewayChild != null && !this._openclawGatewayChild.killed;
  }

  private async _ensureOpenClawReady(): Promise<boolean> {
    if (this.isOpenClawReady()) return true;

    // Gateway process still starting — poll without spawning a duplicate.
    if (this._openclawGatewayChild && !this._openclawGatewayChild.killed) {
      if (await this._waitForOpenClawGatewayReady()) {
        this._setOpenClawGatewayReady(true);
        return true;
      }
      console.warn("[openclaw] Gateway process alive but webhook not responding");
      return false;
    }

    console.log("[openclaw] Gateway not ready — starting...");
    return await this.startOpenClaw();
  }

  /** Resolve a pending sync OpenClaw ask() by correlationId (called from bridge /bridge/send). */
  resolveOpenClawReply(correlationId: string, text: string): void {
    const entry = this._pendingOpenClawReplies.get(correlationId);
    if (!entry) {
      console.warn(`[openclaw] sync reply for unknown correlationId=${correlationId}`);
      return;
    }
    clearTimeout(entry.timer);
    this._pendingOpenClawReplies.delete(correlationId);
    console.log(`[openclaw] sync reply resolved cid=${correlationId} len=${text.length}`);
    entry.resolve(text);
  }

  private _waitForOpenClawReply(correlationId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const entry = this._pendingOpenClawReplies.get(correlationId);
        if (!entry) return;
        clearTimeout(entry.timer);
        this._pendingOpenClawReplies.delete(correlationId);
        entry.reject(new Error(`OpenClaw reply timed out after ${NodeServiceImpl._openClawReplyTimeoutMs / 1000}s`));
      }, NodeServiceImpl._openClawReplyTimeoutMs);
      this._pendingOpenClawReplies.set(correlationId, { resolve, reject, timer });
    });
  }

  private async _buildOpenClawTurnContext(): Promise<{
    ownerDisplayName?: string;
    bonds?: Array<{ name: string; level: string; dormantDays?: number }>;
    interests?: string[];
    capabilities?: string[];
    permissions?: { bondAutonomy: boolean; maxBondsPerDay: number; autoCircleContacts: boolean; maxSensitivity: string };
    model?: { provider: string; baseUrl?: string; model?: string };
  }> {
    const config = await this._configStore.load();
    const nodeConfig = await this.getNodeConfig();
    const bonds = await this.getBonds();
    let interests: string[] = [];
    let ownerDisplayName: string | undefined;
    try {
      const profile = await this._humanProfileStore?.loadHumanProfile();
      if (profile) {
        ownerDisplayName = profile.displayName?.trim() || undefined;
        interests = [...(profile.hobbies ?? []), ...(profile.knowledge ?? [])];
      }
    } catch { /* no profile yet */ }

    let capabilities: string[] | undefined;
    if (this._capabilityManifestStore) {
      const manifest = await this._capabilityManifestStore.loadManifest();
      capabilities = manifest?.capabilities;
    }

    const providers = nodeConfig.modelProviders;
    const model =
      providers?.mode && providers.mode !== "disabled"
        ? {
            provider: providers.mode,
            baseUrl: providers.endpoint,
            model: providers.modelName,
          }
        : { provider: "disabled" };

    return {
      ownerDisplayName,
      bonds: bonds.map((b) => ({
        name: b.displayName ?? b.peerOwnerId,
        level: b.level,
      })),
      interests,
      capabilities,
      permissions: {
        bondAutonomy: config?.bondAutonomyEnabled ?? false,
        maxBondsPerDay: 0,
        autoCircleContacts: false,
        maxSensitivity: "public",
      },
      model,
    };
  }

  private async _buildEnvoyMeshOpenClawPrompts(message: string): Promise<{
    policyPrompt: string;
    retrievedContext: string;
  }> {
    const turnContext = await this._buildOpenClawTurnContext();
    const owner = this._profile?.owner;
    const displayName = turnContext.ownerDisplayName ?? owner?.ownerId ?? "unknown";
    const webSearchEnabled = (await this._loadBridgeConfigWebSearchEnabled()) ?? true;
    const skillApiKeys = (await this._loadBridgeConfigSkillApiKeys()) ?? {};
    const webSearch = resolveActiveWebSearchProvider({ webSearchEnabled, skillApiKeys });
    const { buildAgentConfig, buildOpenClawSystemPrompt } = await import(
      "../../../packages/openclaw-runtime/src/tool-bridge.js"
    );
    const agentConfig = buildAgentConfig({
      owner: {
        ownerId: owner?.ownerId ?? "unknown",
        displayName,
        interests: turnContext.interests ?? [],
        capabilities: turnContext.capabilities ?? [],
      },
      permissions: turnContext.permissions ?? {
        bondAutonomy: false,
        maxBondsPerDay: 0,
        autoCircleContacts: false,
        maxSensitivity: "public",
      },
      bonds: (turnContext.bonds ?? []).map((b) => ({
        displayName: b.name,
        level: b.level,
        dormantDays: b.dormantDays,
      })),
      model: turnContext.model ?? { provider: "disabled" },
      webSearch,
    });
    const policyPrompt = buildOpenClawSystemPrompt(displayName, agentConfig);

    const nodeConfig = await this.getNodeConfig();
    const bonds = await this.getBonds();
    let retrievedContext = "";
    if (owner?.ownerId) {
      try {
        retrievedContext = await this._withOpenClawTimeout(
          buildEnvoyMeshRetrievedContext({
            message,
            ownerId: owner.ownerId,
            bonds: bonds.map((b) => ({
              peerOwnerId: b.peerOwnerId,
              displayName: b.displayName,
            })),
            chatLogStore: this._chatLogStore,
            trustStore: this._trustStore,
            humanProfileStore: this._humanProfileStore,
            agentIdentityStore: this._agentIdentityStore,
            vaultDir: this._vaultDir,
            ragService: await this._getRagService(),
            knowledgeBase: nodeConfig.aiSettings?.knowledgeBase,
          }),
          NodeServiceImpl._openClawRetrievedContextTimeoutMs,
          "",
        );
      } catch (err) {
        console.warn(
          "[openclaw] retrieved context build failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    return { policyPrompt, retrievedContext };
  }

  private async _withOpenClawTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((resolve) => {
          timer = setTimeout(() => {
            console.warn(`[openclaw] operation timed out after ${timeoutMs / 1000}s — continuing without full context`);
            resolve(fallback);
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async _askOpenClawViaWebhook(
    prompt: string,
    envoyContext?: { policyPrompt?: string; retrievedContext?: string },
  ): Promise<string> {
    const ownerId = this._profile?.owner?.ownerId;
    if (!ownerId) {
      throw new Error("Owner profile not loaded");
    }

    const correlationId = `oc-ask-${randomUUID()}`;
    console.log(`[openclaw] ask start cid=${correlationId} promptLen=${prompt.length}`);
    const replyPromise = this._waitForOpenClawReply(correlationId);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this._assistantAgentSecret) {
      headers.Authorization = `Bearer ${this._assistantAgentSecret}`;
    }

    let fromName = ownerId;
    try {
      const profile = await this._humanProfileStore?.loadHumanProfile();
      if (profile?.displayName?.trim()) fromName = profile.displayName.trim();
    } catch { /* use ownerId */ }

    const body = JSON.stringify({
      from: this._mesh?.peerId ?? "",
      fromOwnerId: ownerId,
      fromName,
      text: prompt,
      ...(envoyContext?.policyPrompt?.trim() ? { policyPrompt: envoyContext.policyPrompt.trim() } : {}),
      ...(envoyContext?.retrievedContext?.trim()
        ? { retrievedContext: envoyContext.retrievedContext.trim() }
        : {}),
      correlationId,
    });

    try {
      const [text] = await Promise.all([
        replyPromise,
        (async () => {
          const resp = await fetch(this._assistantAgentUrl, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(NodeServiceImpl._openClawReplyTimeoutMs),
          });

          if (!resp.ok) {
            const detail = await resp.text().catch(() => "");
            const err = new Error(
              `OpenClaw webhook returned ${resp.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
            );
            if (resp.status === 404) {
              this._setOpenClawGatewayReady(false);
            }
            throw err;
          }
        })(),
      ]);
      console.log(`[openclaw] ask complete cid=${correlationId} answerLen=${text.length}`);
      return text;
    } catch (err) {
      if (this._pendingOpenClawReplies.has(correlationId)) {
        this._cancelOpenClawReply(
          correlationId,
          err instanceof Error ? err : new Error(String(err)),
        );
        void replyPromise.catch(() => {});
      }
      throw err;
    }
  }

  async startOpenClaw(): Promise<boolean> {
    if (this.isOpenClawReady()) return true;
    if (this._openclawStartPromise) return this._openclawStartPromise;

    this._openclawStartPromise = this._startOpenClawInner().finally(() => {
      this._openclawStartPromise = null;
    });
    return this._openclawStartPromise;
  }

  private async _startOpenClawInner(): Promise<boolean> {
    if (this._openclawGatewayChild && !this._openclawGatewayChild.killed && this._openclawGatewayReady) {
      return true;
    }
    if (this._openclawGatewayChild && !this._openclawGatewayChild.killed) {
      try { this._openclawGatewayChild.kill("SIGTERM"); } catch { /* ignore */ }
      this._openclawGatewayChild = null;
      this._setOpenClawGatewayReady(false);
    }

    const { existsSync, mkdirSync, writeFileSync, readFileSync } = await import("node:fs");
    const { join, resolve } = await import("node:path");
    const nodeCwd = process.cwd();
    const bundledSkillsDir = resolveBundledSkillsDir(nodeCwd);

    // 1. Read built-in OpenClaw webhook URL (never fall back to agentUrl — that is Ext Agent).
    const profileDirAbs =
      this._profileDir && this._profileDir !== "/tmp/unknown"
        ? resolve(nodeCwd, this._profileDir)
        : null;
    const cfgPath = profileDirAbs
      ? join(profileDirAbs, "bridge-config.json")
      : join(nodeCwd, "data", "default", "bridge-config.json");
    const defaultAssistantUrl = "http://127.0.0.1:18789/webhook/envoymesh";
    let assistantUrl = defaultAssistantUrl;
    let bridgeSecret: string | undefined;
    let bridgeListenPort = 3031;
    if (existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
        assistantUrl = resolveAssistantAgentUrl(cfg);
        bridgeSecret = typeof cfg?.secret === "string" && cfg.secret.trim() ? cfg.secret.trim() : undefined;
        if (typeof cfg?.listenPort === "number") bridgeListenPort = cfg.listenPort;
      } catch { /* use default */ }
    }
    this._assistantAgentUrl = assistantUrl;
    this._assistantAgentSecret = bridgeSecret;
    const bridgeUrl = `http://127.0.0.1:${bridgeListenPort}/bridge/send`;

    // 3. Persistent gateway state + pre-seeded workspace (skip OpenClaw BOOTSTRAP onboarding)
    const gwStateDir = profileDirAbs
      ? openClawGatewayStateDir(profileDirAbs)
      : join((await import("node:os")).tmpdir(), `envoymesh-gateway-${process.pid}`);
    mkdirSync(gwStateDir, { recursive: true });
    const gwConfigPath = join(gwStateDir, "openclaw.json");

    let workspaceDir = gwStateDir;
    if (profileDirAbs) {
      const ownerId = this._profile?.owner?.ownerId ?? "unknown";
      let displayName: string | undefined;
      let interests: string[] = [];
      let capabilities: string[] = [];
      try {
        const profile = await this._humanProfileStore?.loadHumanProfile();
        if (profile) {
          displayName = profile.displayName?.trim() || undefined;
          interests = [...(profile.hobbies ?? []), ...(profile.knowledge ?? [])];
        }
      } catch { /* no profile */ }
      if (this._capabilityManifestStore) {
        try {
          const manifest = await this._capabilityManifestStore.loadManifest();
          capabilities = manifest?.capabilities ?? [];
        } catch { /* no manifest */ }
      }
      let agentIdentitySnippet: string | undefined;
      if (this._agentIdentityStore) {
        try {
          const doc = await this._agentIdentityStore.load();
          const trimmed = doc.content?.trim();
          if (trimmed) agentIdentitySnippet = trimmed.slice(0, 4000);
        } catch { /* no identity doc */ }
      }
      let bondCount = 0;
      try {
        bondCount = (await this.getBonds()).length;
      } catch { /* ignore */ }
      workspaceDir = ensureOpenClawWorkspace(profileDirAbs, {
        ownerId,
        displayName,
        interests,
        capabilities,
        agentIdentitySnippet,
        bondCount,
      }, {
        legacySkillsDir: bundledSkillsDir,
      });
    }
    workspaceDir = resolve(workspaceDir);
    const gwStateDirAbs = resolve(gwStateDir);
    const gwConfigPathAbs = resolve(gwConfigPath);

    // Read node model config to pass to the gateway
    let modelProvider: Record<string, unknown> = {};
    try {
      const nodeCfg = await this.getNodeConfig();
      if (nodeCfg?.modelProviders?.mode && nodeCfg.modelProviders.mode !== "disabled") {
        modelProvider = {
          provider: nodeCfg.modelProviders.mode,
          ...(nodeCfg.modelProviders.endpoint ? { baseUrl: nodeCfg.modelProviders.endpoint } : {}),
          ...(nodeCfg.modelProviders.apiKey ? { apiKey: nodeCfg.modelProviders.apiKey } : {}),
          ...(nodeCfg.modelProviders.modelName ? { model: nodeCfg.modelProviders.modelName } : {}),
        };
      }
    } catch { /* use defaults */ }

    // Read bridge config (skill keys + web search toggle)
    let skillApiKeys: Record<string, string> = {};
    let webSearchEnabled = true;
    let clawhubToken: string | undefined;
    try {
      const bridgeCfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
      if (bridgeCfg?.skillApiKeys && typeof bridgeCfg.skillApiKeys === "object") {
        skillApiKeys = bridgeCfg.skillApiKeys as Record<string, string>;
      }
      if (typeof bridgeCfg?.webSearchEnabled === "boolean") webSearchEnabled = bridgeCfg.webSearchEnabled;
      if (typeof bridgeCfg?.clawhubToken === "string" && bridgeCfg.clawhubToken.trim()) {
        clawhubToken = bridgeCfg.clawhubToken.trim();
      }
    } catch { /* use defaults */ }
    const skillEntries = buildOpenClawGatewaySkillEntries(skillApiKeys);
    const agentSection = buildOpenClawGatewayAgentSection({ webSearchEnabled, skillApiKeys });
    const gatewaySearchEnv = buildOpenClawGatewaySearchEnv(skillApiKeys);

    writeFileSync(gwConfigPathAbs, JSON.stringify({
      gateway: { auth: { mode: "none" } },
      agents: {
        defaults: {
          skipBootstrap: true,
          workspace: workspaceDir,
          ...(modelProvider.provider && modelProvider.model
            ? { model: `${modelProvider.provider as string}/${modelProvider.model as string}` }
            : {}),
        },
      },
      channels: {
        envoymesh: {
          enabled: true,
          bridgeUrl,
          webhookPath: "/webhook/envoymesh",
          dmPolicy: "open",
          allowedOwnerIds: ["*"],
        },
      },
      ...(Object.keys(skillEntries).length > 0 ? {
        skills: { entries: skillEntries },
      } : {}),
      tools: agentSection.tools,
      plugins: agentSection.plugins,
      ...(modelProvider.provider ? {
        models: {
          providers: {
            [modelProvider.provider as string]: {
              api: "openai-completions",
              ...(modelProvider.baseUrl ? { baseUrl: modelProvider.baseUrl } : {}),
              ...(modelProvider.apiKey ? { apiKey: modelProvider.apiKey } : {}),
              ...(modelProvider.model ? { models: [{ id: modelProvider.model, name: modelProvider.model, api: "openai-completions" }] } : {}),
            },
          },
        },
      } : {}),
    }, null, 2), "utf-8");

    // 4. Reclaim port if a stale gateway is listening without the EnvoyMesh webhook route.
    const gatewayPort = this._assistantGatewayPort();
    this._openClawGatewayRouteRegistered = false;
    this._openClawLastProbeWarnAt = 0;
    await reclaimAssistantGatewayPort({
      port: gatewayPort,
      webhookUrl: assistantUrl,
      excludePid: this._openclawGatewayChild?.pid ?? undefined,
      log: (message) => console.warn(message),
    });

    // 5. Spawn the OpenClaw gateway (bundled tsx tree, standalone binary, or dev pnpm).
    const child = spawnOpenClawGateway({
      nodeCwd,
      gatewayPort,
      gatewayEnv: {
        ...gatewaySearchEnv,
        OPENCLAW_STATE_DIR: gwStateDirAbs,
        OPENCLAW_CONFIG_PATH: gwConfigPathAbs,
        ENVOYMESH_BRIDGE_URL: bridgeUrl,
        ENVOYMESH_ALLOWED_OWNER_IDS: this._profile?.owner?.ownerId ?? "*",
        CLAWHUB_WORKDIR: workspaceDir,
        ...(clawhubToken ? { CLAWHUB_TOKEN: clawhubToken } : {}),
      },
    });
    child.stderr?.on("data", (d: Buffer) => {
      const t = d.toString();
      if (t.includes("Registered EnvoyMesh HTTP route")) {
        this._openClawGatewayRouteRegistered = true;
      }
      const trimmed = t.trim();
      if (trimmed) {
        for (const line of trimmed.split("\n")) {
          if (line) process.stderr.write(`[gateway] ${line}\n`);
        }
      }
    });
    child.on("exit", (code) => {
      if (code) console.warn(`[openclaw] gateway exited code ${code}`);
      this._openclawGatewayChild = null;
      this._setOpenClawGatewayReady(false);
      this._rejectAllPendingOpenClawReplies("OpenClaw gateway stopped");
    });
    this._openclawGatewayChild = child;
    this._setOpenClawGatewayReady(false);

    // 6. Wait for gateway webhook (route registers ~12s after spawn; 400 on empty POST means ready).
    let gatewayReady = false;
    if (child.exitCode == null) {
      gatewayReady = await this._waitForOpenClawGatewayReady();
    } else {
      console.warn(
        `[openclaw] Gateway process exited before webhook was ready (code ${child.exitCode}). ` +
          `If port ${gatewayPort} is already in use by another OpenClaw instance, stop it first.`,
      );
    }

    if (!gatewayReady) {
      console.warn(
        `[openclaw] Gateway not reachable after ${NodeServiceImpl._openClawStartupProbeAttempts}s at ${assistantUrl}. ` +
          `Check [gateway] logs for "Registered EnvoyMesh HTTP route".`,
      );
    }

    this._setOpenClawGatewayReady(gatewayReady);

    // 7. HTTP runtime: POST to built-in OpenClaw webhook, await sync reply via bridge correlationId.
    this._openclawRuntime = {
      isReady: () => this.isOpenClawReady(),
      ask: async (prompt: string, envoyContext?: { policyPrompt?: string; retrievedContext?: string }) => {
        return await this._askOpenClawViaWebhook(prompt, envoyContext);
      },
      stop: async () => {
        await this.stopOpenClaw();
      },
    } as any;

    console.log("[openclaw] Built-in OpenClaw gateway at", assistantUrl);
    console.log("[openclaw] Gateway config:", gwConfigPathAbs);
    if (modelProvider.provider) {
      console.log("[openclaw] Model config:", JSON.stringify(modelProvider));
    }
    return gatewayReady;
  }

  private _resolveOpenClawWorkspaceDir(): string {
    if (!this._profileDir || this._profileDir === "/tmp/unknown") {
      throw new Error("OpenClaw workspace unavailable — profile not loaded");
    }
    const ownerId = this._profile?.owner?.ownerId ?? "unknown";
    return ensureOpenClawWorkspace(this._profileDir, { ownerId }, {
      legacySkillsDir: resolveBundledSkillsDir(process.cwd()),
    });
  }

  private async _loadBridgeConfigClawhubToken(): Promise<string | undefined> {
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const cfgPath = join(process.cwd(), "data", "default", "bridge-config.json");
      const cfg = JSON.parse(await readFile(cfgPath, "utf-8"));
      const token = cfg?.clawhubToken;
      return typeof token === "string" && token.trim() ? token.trim() : undefined;
    } catch {
      return undefined;
    }
  }

  private async _execClawhub(args: string[], timeoutMs: number): Promise<string> {
    const { execFileSync } = await import("node:child_process");
    const bin = await this._clawhubBin();
    const workdir = this._resolveOpenClawWorkspaceDir();
    const token = await this._loadBridgeConfigClawhubToken();
    return execFileSync(bin, [...args, "--workdir", workdir], {
      encoding: "utf-8",
      timeout: timeoutMs,
      env: {
        ...process.env,
        CLAWHUB_WORKDIR: workdir,
        ...(token ? { CLAWHUB_TOKEN: token } : {}),
      },
    }).trim();
  }

  // --- ClawHub skill/plugin management ---

  private async _clawhubBin(): Promise<string> {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    const candidates = [
      join(homedir(), ".npm-global", "bin", "clawhub"),
      "/usr/local/bin/clawhub",
    ];
    const found = candidates.find((c) => existsSync(c));
    if (found) return found;
    // Try PATH as last resort
    try {
      const { execSync } = await import("node:child_process");
      const which = execSync("which clawhub 2>/dev/null", { encoding: "utf-8", timeout: 2000 }).trim();
      if (which && existsSync(which)) return which;
    } catch { /* not found */ }
    return "clawhub";
  }

  async getOpenClawPlugins(): Promise<string[]> {
    try {
      const out = await this._execClawhub(["list"], 5000);
      const lines = out.split("\n")
        .map(l => l.trim())
        .filter(l => l && !l.startsWith("Installed") && !l.startsWith("Skills") && !l.startsWith("Name") && !l.startsWith("No "));
      console.log("[clawhub] list raw:", JSON.stringify(out.slice(0, 200)), "lines:", lines.length);
      return lines.length ? lines : ["(no skills installed)"];
    } catch (err: any) {
      const msg = err.stderr?.toString() || err.message || "";
      console.warn("[clawhub] list failed:", msg);
      // If clawhub is not installed, return a helpful message instead of an error
      if (msg.includes("command not found") || msg.includes("not found")) {
        return ["__clawhub_missing__"];
      }
      return [msg.slice(0, 200)];
    }
  }

  async getTrendingOpenClawPlugins(): Promise<string[]> {
    try {
      const resp = await fetch("https://clawhub.ai/api/v1/skills?limit=20", {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as any;
      const items = data?.skills ?? data?.items ?? data ?? [];
      return (Array.isArray(items) ? items : []).slice(0, 20).map((s: any) => {
        const slug = s.slug ?? "";
        const name = s.name ?? slug;
        const desc = s.description ? ` — ${s.description.slice(0, 80)}` : "";
        const ownerHandle = typeof s.owner === "string" ? s.owner : s.owner?.handle ?? "";
        const url = ownerHandle && slug ? `https://clawhub.ai/${ownerHandle}/${slug}` : "";
        return JSON.stringify({ slug, name, desc: desc.trim(), url, owner: ownerHandle });
      });
    } catch (err: any) {
      return [`Error: ${err.message.slice(0, 200)}`];
    }
  }

  async searchOpenClawPlugins(query: string): Promise<string[]> {
    try {
      const resp = await fetch(`https://clawhub.ai/api/v1/search?q=${encodeURIComponent(query)}`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as any;
      console.log("[clawhub] search response keys:", Object.keys(data ?? {}).join(", "));
      const items = data?.skills ?? data?.items ?? data?.results ?? data ?? [];
      if (!Array.isArray(items)) {
        console.warn("[clawhub] search: items is not array, type:", typeof items);
        return [];
      }
      console.log("[clawhub] search: found", items.length, "results");
      return items.slice(0, 20).map((s: any) => {
        const slug = s.slug ?? "";
        const name = s.name ?? slug;
        const desc = s.description ? ` — ${s.description.slice(0, 80)}` : "";
        // owner may be a string or an object like { handle, displayName, image }
        const ownerHandle = typeof s.owner === "string" ? s.owner : s.owner?.handle ?? "";
        const url = ownerHandle && slug ? `https://clawhub.ai/${ownerHandle}/${slug}` : "";
        return JSON.stringify({ slug, name, desc: desc.trim(), url, owner: ownerHandle });
      });
    } catch (err: any) {
      console.warn("[clawhub] search failed:", err.message);
      return [`Error: ${err.message.slice(0, 200)}`];
    }
  }

  async installOpenClawPlugin(name: string): Promise<{ ok: boolean; message: string }> {
    const safe = /^[a-zA-Z0-9._-]+$/.test(name) ? name : null;
    if (!safe) return { ok: false, message: "Invalid plugin name" };
    try {
      const out = await this._execClawhub(["install", safe], 60000);
      await this.reloadOpenClawConfig();
      return { ok: true, message: out || "Installed" };
    } catch (err: any) {
      const msg = err.stderr?.toString() || err.message || "Install failed";
      if (msg.includes("command not found") || msg.includes("not found")) {
        return { ok: false, message: "clawhub CLI not installed. Run: npm i -g clawhub && clawhub login" };
      }
      return { ok: false, message: msg.slice(0, 300) };
    }
  }

  async uninstallOpenClawPlugin(name: string): Promise<{ ok: boolean; message: string }> {
    const safe = /^[a-zA-Z0-9._-]+$/.test(name) ? name : null;
    if (!safe) return { ok: false, message: "Invalid plugin name" };
    try {
      const out = await this._execClawhub(["uninstall", safe], 30000);
      await this.reloadOpenClawConfig();
      return { ok: true, message: out || "Uninstalled" };
    } catch (err: any) {
      const msg = err.stderr?.toString() || err.message || "Uninstall failed";
      return { ok: false, message: msg.slice(0, 300) };
    }
  }

  private async _loadBridgeConfigWebSearchEnabled(): Promise<boolean | undefined> {
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const cfgPath = join(process.cwd(), "data", "default", "bridge-config.json");
      const cfg = JSON.parse(await readFile(cfgPath, "utf-8"));
      return typeof cfg?.webSearchEnabled === "boolean" ? cfg.webSearchEnabled : undefined;
    } catch { return undefined; }
  }

  private async _loadBridgeConfigSkillApiKeys(): Promise<Record<string, string> | undefined> {
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const cfgPath = join(process.cwd(), "data", "default", "bridge-config.json");
      const cfg = JSON.parse(await readFile(cfgPath, "utf-8"));
      return cfg?.skillApiKeys;
    } catch { return undefined; }
  }

  async saveWebSearchEnabled(enabled: boolean): Promise<{ ok: boolean }> {
    try {
      const { readFileSync, writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const cfgPath = join(process.cwd(), "data", "default", "bridge-config.json");
      const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
      cfg.webSearchEnabled = enabled;
      writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
      await this.stopOpenClaw();
      await this.startOpenClaw();
      return { ok: true };
    } catch { return { ok: false }; }
  }

  async saveSkillApiKeys(keys: Record<string, string>): Promise<{ ok: boolean }> {
    try {
      const { readFileSync, writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");

      const bridgeCfgPath = join(process.cwd(), "data", "default", "bridge-config.json");
      const bridgeCfg = JSON.parse(readFileSync(bridgeCfgPath, "utf-8"));
      bridgeCfg.skillApiKeys = Object.keys(keys).length > 0 ? keys : undefined;
      writeFileSync(bridgeCfgPath, JSON.stringify(bridgeCfg, null, 2) + "\n", "utf-8");

      await this.stopOpenClaw();
      await this.startOpenClaw();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async saveClawhubToken(token: string): Promise<{ ok: boolean }> {
    try {
      const { readFileSync, writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const cfgPath = join(process.cwd(), "data", "default", "bridge-config.json");
      const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
      cfg.clawhubToken = token || undefined;
      writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
      return { ok: true };
    } catch (err: any) {
      return { ok: false };
    }
  }

  async stopOpenClaw(): Promise<void> {
    this._rejectAllPendingOpenClawReplies("OpenClaw stopped");
    this._setOpenClawGatewayReady(false);
    const proc = this._openclawGatewayChild;
    this._openclawGatewayChild = null;
    if (proc && !proc.killed) {
      try {
        proc.kill("SIGTERM");
        setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 3000);
      } catch { /* ignore */ }
    }
    this._openclawRuntime = null;
  }

  async askOpenClaw(prompt: string, _context?: {
    ownerDisplayName?: string;
    bonds?: Array<{ name: string; level: string; dormantDays?: number }>;
    interests?: string[];
    capabilities?: string[];
    permissions?: { bondAutonomy: boolean; maxBondsPerDay: number; autoCircleContacts: boolean; maxSensitivity: string };
    model?: { provider: string; baseUrl?: string; model?: string };
  }): Promise<string> {
    if (!(await this._ensureOpenClawReady())) {
      throw new Error("OpenClaw not available");
    }
    const { policyPrompt, retrievedContext } = await this._buildEnvoyMeshOpenClawPrompts(prompt);
    return this._withOpenClawAskLock(() =>
      this._askOpenClawViaWebhook(prompt, { policyPrompt, retrievedContext }),
    );
  }

  /**
   * Execute a tool called by OpenClaw via stdio.
   * Maps OpenClaw tool names to EnvoyMesh's ToolRegistry.
   */
  /**
   * Reload OpenClaw's model config when the user changes LLM settings.
   * Called from the settings save path.
   */
  /**
   * Send a chat message to OpenClaw via the bridge's webhook.
   * The response arrives asynchronously via /bridge/send → onSelfSendEnvelope.
   */
  async getPairedDiagnostics(): Promise<Record<string, unknown>> {
    return {
      paired: false,
      type: "desktop",
      ownerId: this._profile?.owner?.ownerId ?? null,
    };
  }

  async sendToOpenClaw(text: string): Promise<void> {
    const ownerId = this._profile?.owner?.ownerId ?? "";
    const now = new Date().toISOString();
    const messageId = crypto.randomUUID();

    // Persist the outbound message so it appears in the Social app chat history.
    const outboundMsg: ChatMessage = {
      messageId,
      sender: {
        nodeId: this._mesh?.peerId ?? "",
        ownerId,
        displayName: ownerId,
        actorRole: "human",
      },
      recipient: {
        nodeId: ENVOY_AI_THREAD_KEY,
        displayName: "EnvoyAI",
      },
      content: { text },
      metadata: {
        timestamp: now,
        deliveryReceipt: "sent",
        deliveryChannel: "ai",
      },
      signature: "",
    };
    this.recordEnvoyAiChatMessage(outboundMsg);

    let policyPrompt: string | undefined;
    let retrievedContext: string | undefined;
    try {
      const prompts = await this._buildEnvoyMeshOpenClawPrompts(text);
      policyPrompt = prompts.policyPrompt;
      retrievedContext = prompts.retrievedContext;
    } catch {
      /* best-effort context */
    }

    const body = JSON.stringify({
      from: this._mesh?.peerId ?? "",
      fromOwnerId: ownerId,
      fromName: ownerId,
      text,
      ...(policyPrompt?.trim() ? { policyPrompt: policyPrompt.trim() } : {}),
      ...(retrievedContext?.trim() ? { retrievedContext: retrievedContext.trim() } : {}),
    });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this._assistantAgentSecret) {
      headers.Authorization = `Bearer ${this._assistantAgentSecret}`;
    }

    await fetch(this._assistantAgentUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(300_000),
    });
  }

  async reloadOpenClawConfig(): Promise<void> {
    // The gateway needs the updated model config. Since our runtime
    // is HTTP-based (not stdio), restart the gateway with new config.
    console.log("[openclaw] Reloading config — restarting gateway...");
    await this.stopOpenClaw();
    await this.startOpenClaw();
  }

  async executeOpenClawTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    this.recordOpenClawToolCall(toolName);
    const context = await this._requireToolExecutionContext();
    const { executeTool } = await import("./tool-registry.js");
    const result = await executeTool(toolName, params, context);
    if (!result.ok) {
      throw new Error(result.error ?? `Tool ${toolName} failed`);
    }
    return result.result;
  }

  // Phase 28 — Mesh Intelligence Report
  async generateMeshIntelligenceReport(): Promise<string> {
    const { generateMeshIntelligenceReport } = await import("./mesh-intelligence.js");
    const config = await this._configStore.load();
    const bonds = await this.getBonds();
    const ownerTopics: string[] = [];
    const scores = new Map<string, number>();

    const report = await generateMeshIntelligenceReport(
      {
        scanBondedPeers: async () =>
          bonds.map((b) => ({
            ownerId: b.peerOwnerId,
            displayName: b.displayName ?? b.peerOwnerId,
            topics: [] as string[],
            capabilities: [],
            bondLevel: b.level,
          })),
        scanDiscovery: async (topics: string[], caps: string[]) => {
          try {
            const { generateDiscoveryClusters } = await import("./discovery-clusterer.js");
            const bonds = await this.getBonds();
            const clusters = await generateDiscoveryClusters(
              {
                broadcastDocumentDiscovery: async () => [],
                broadcastCapabilityDiscovery: async () => [],
                getBondedOwnerIds: async () => new Set(bonds.map((b) => b.peerOwnerId)),
              },
              { seedTopics: topics, seedCapabilities: caps, minClusterSize: 2, maxClusters: 3, maxHops: 1 },
            );
            const peers: Array<{ ownerId: string; displayName?: string; topics: string[]; capabilities: string[]; bondLevel?: string }> = [];
            for (const cluster of clusters) {
              for (const peer of cluster.peers) {
                peers.push({ ownerId: peer.ownerId, displayName: peer.displayName, topics: peer.topics, capabilities: peer.capabilities, bondLevel: "public" });
              }
            }
            return peers;
          } catch { return []; }
        },
        getReputationScores: async () => scores,
        findDormantBonds: async (thresholdDays: number) => {
          const { findDormantBonds } = await import("./bond-steward.js");
          const result = await findDormantBonds(
            { getBonds: async () => bonds, getLastInteractionAt: async () => { throw new Error("not implemented"); } },
            thresholdDays,
          );
          return result.dormantBonds.map((b) => ({
            ownerId: b.peerOwnerId,
            displayName: b.displayName,
            topics: [],
            capabilities: [],
          }));
        },
        findSecondDegreeConnections: async () => [],
        generateNarrative: async (prompt: string) => {
          try {
            return await this.knowledgeQuery(prompt);
          } catch {
            return "Unable to generate narrative — model not available.";
          }
        },
      },
      { ownerTopics, ownerCapabilities: [] },
    );

    return [
      `## ${report.title}`,
      `Generated: ${report.generatedAt}`,
      `Analyzed: ${report.peersAnalyzed} peers`,
      "",
      ...report.sections.map((s) => `### ${s.heading}\n${s.content}`),
    ].join("\n");
  }

  // Phase 27 — Proactive agent pass
  async runProactiveAgentPass(): Promise<Array<{ kind: string; summary: string; matchedTopic: string; peerCount: number }>> {
    const insights: Array<{ kind: string; summary: string; matchedTopic: string; peerCount: number }> = [];

    // Run mesh awareness
    try {
      const awarenessInsights = await this.runMeshAwarenessPass();
      for (const insight of awarenessInsights) {
        insights.push({ kind: "mesh_activity", summary: insight.summary, matchedTopic: insight.matchedTopic, peerCount: insight.peerCount });
      }
    } catch { /* mesh awareness optional */ }

    // Run connection suggestions
    try {
      const suggestions = await this.runConnectionSuggesterPass();
      for (const s of suggestions) {
        insights.push({
          kind: "connection_suggested",
          summary: `Suggested connection: ${s.remoteDisplayName} — ${s.reason}`,
          matchedTopic: s.reason,
          peerCount: 1,
        });
      }
    } catch { /* connection suggestions optional */ }

    // Check dormant bonds
    try {
      const config = await this._configStore.load();
      const { findDormantBonds } = await import("./bond-steward.js");
      const dormantResult = await findDormantBonds(
        {
          getBonds: async () => this.getBonds(),
          getLastInteractionAt: async () => { throw new Error("not implemented"); },
        },
        config?.dormantBondThresholdDays ?? 90,
      );
      if (dormantResult.dormantBonds.length > 0) {
        insights.push({
          kind: "dormant_bonds",
          summary: dormantResult.summary,
          matchedTopic: "social_graph_health",
          peerCount: dormantResult.dormantBonds.length,
        });
      }
    } catch { /* dormant bond check optional */ }

    return insights;
  }

  // Phase 23A+ — Discovery-driven clusterer
  async discoverAndCluster(
    seedTopics?: string[],
    seedCapabilities?: string[],
  ): Promise<string> {
    const { generateDiscoveryClusters, formatDiscoverySuggestions } = await import("./discovery-clusterer.js");
    const config = await this._configStore.load();
    const ownerTopics: string[] = seedTopics ?? [];
    if (ownerTopics.length === 0 && !seedCapabilities?.length) {
      return "No seed topics or capabilities provided. Tell me what you're interested in discovering.";
    }

    const bonds = await this.getBonds();
    const bondedPeers = bonds.map((b) => ({ ownerId: b.peerOwnerId, peerId: b.peerOwnerId }));
    const bondedIds = new Set(bonds.map((b) => b.peerOwnerId));
    const { signUnsignedEnvelope } = await import("@envoymesh/identity");

    const deps = {
      broadcastDocumentDiscovery: async (query: string, _maxHops?: number) => {
        const { broadcastDocumentDiscovery } = await import("./document-discovery-broadcast.js");
        const bdDeps = {
          sendToPeer: async () => 0, // stub — needs mesh connectivity for real broadcast
          getBondedPeers: async () => bondedPeers,
          getAllKnownPeers: async () => bondedPeers,
          signEnvelope: signUnsignedEnvelope as (unsigned: unknown, privateKeyPem: string) => unknown,
          profile: {
            owner: { ownerId: this._profile!.owner.ownerId },
            device: {
              deviceId: this._profile!.device.deviceId,
              peerId: (this._profile!.device as unknown as { peerId?: string }).peerId ?? this._profile!.device.deviceId,
              publicKeyPem: this._profile!.device.publicKeyPem,
              privateKeyPem: this._profile!.device.privateKeyPem,
            },
          },
        };
        const results = await broadcastDocumentDiscovery(bdDeps, {
          query,
          maxHops: _maxHops ?? 2,
          maxResults: 20,
          timeoutMs: 15000,
        });
        return results.map((r: any) => ({
          ownerId: r.ownerId,
          displayName: r.metadata?.title,
          topics: r.metadata?.topics ?? [],
          capabilities: [],
          isBonded: bondedIds.has(r.ownerId),
        }));
      },
      broadcastCapabilityDiscovery: async (caps: string[], _maxHops?: number) => {
        const { broadcastCapabilityDiscovery } = await import("./capability-discovery-broadcast.js");
        const bcdDeps = {
          sendToPeer: async () => 0,
          getBondedPeers: async () => bondedPeers,
          getAllKnownPeers: async () => bondedPeers,
          signEnvelope: signUnsignedEnvelope as (unsigned: unknown, privateKeyPem: string) => unknown,
          profile: {
            owner: { ownerId: this._profile!.owner.ownerId },
            device: {
              deviceId: this._profile!.device.deviceId,
              peerId: (this._profile!.device as unknown as { peerId?: string }).peerId ?? this._profile!.device.deviceId,
              publicKeyPem: this._profile!.device.publicKeyPem,
              privateKeyPem: this._profile!.device.privateKeyPem,
            },
          },
        };
        const results = await broadcastCapabilityDiscovery(bcdDeps, {
          capabilityTags: caps,
          maxHops: _maxHops ?? 2,
          maxResults: 20,
          timeoutMs: 15000,
        });
        return results.map((r: any) => ({
          ownerId: r.ownerId,
          topics: [],
          capabilities: caps,
          isBonded: bondedIds.has(r.ownerId),
        }));
      },
      getBondedOwnerIds: async () => bondedIds,
    };

    const clusters = await generateDiscoveryClusters(deps, {
      seedTopics: ownerTopics,
      seedCapabilities: seedCapabilities ?? [],
    });
    return formatDiscoverySuggestions(clusters);
  }

  // Phase 23D — Chat RAG search
  async chatRagSearch(query: string, opts?: { ownerId?: string; maxResults?: number }): Promise<Array<{ messageId: string; contactName: string; snippet: string; timestamp: string }>> {
    const { searchChatHistory, formatChatRagResults } = await import("./chat-rag-service.js");
    const deps = {
      getMessages: async (ownerId?: string) => {
        // TODO: wire to actual chat log store
        return [];
      },
    };
        // Chat log store not available in service impl — return stub
    return [];
  }

  // Phase 25A — Mesh awareness pass
  async runMeshAwarenessPass(): Promise<Array<{ kind: string; summary: string; matchedTopic: string; peerCount: number; createdAt: string }>> {
    const { generateMeshInsights } = await import("./mesh-awareness-worker.js");
    const localOwnerId = this._profile?.owner.ownerId ?? "";
    const bonds = await this.getBonds();
    const deps = {
      getOwnerInterestTopics: async () => this._getContactTopicsFromLibrary(localOwnerId),
      getBondedPeerTopics: async () => {
        const out: Array<{ ownerId: string; topics: string[] }> = [];
        for (const b of bonds) {
          const topics = await this._getContactTopicsFromLibrary(b.peerOwnerId);
          if (topics.length > 0) out.push({ ownerId: b.peerOwnerId, topics });
        }
        return out;
      },
    };
    const insights = await generateMeshInsights(deps);
    if (insights.length > 0) {
      for (const insight of insights) {
        this.emit?.("agent:awareness", insight);
      }
    }
    return insights;
  }

  // -------------------------------------------------------------------
  // Phase 23 — Published library (E2E test support + cross-node topic sharing)
  // -------------------------------------------------------------------
  // Per-owner published-library store, keyed by ownerId. The local owner
  // publishes via publishDocument(); bonded peers' libraries are recorded
  // via setPeerPublishedLibrary() (called by the test harness today, and
  // by the bond-handshake / agent.card sync in a follow-on). The circle
  // proposer and mesh-awareness worker read from this map.
  private readonly _publishedLibrary = new Map<string, Array<{
    title: string;
    topicTags: string[];
    sensitivity: string;
    publishedAt: string;
  }>>();

  // -------------------------------------------------------------------
  // Phase 25D — Intent history (predictIntent source)
  // -------------------------------------------------------------------
  // Sliding window of the owner's most recent intents. Capped at
  // INTENT_HISTORY_MAX entries to keep memory bounded. Persisted to
  // disk so predictions survive restarts.
  private static readonly INTENT_HISTORY_MAX = 50;
  private readonly _intentHistory: Array<{ intent: string; query: string; timestamp: string }> = [];

  private _intentHistoryFilePath(): string | null {
    const dir = this._profileDir;
    if (!dir) return null;
    return join(dir, "intent-history.json");
  }

  /** Record a recent intent event for prediction. */
  async recordIntent(intent: string, query: string): Promise<void> {
    this._intentHistory.push({ intent, query, timestamp: new Date().toISOString() });
    while (this._intentHistory.length > NodeServiceImpl.INTENT_HISTORY_MAX) {
      this._intentHistory.shift();
    }
    const path = this._intentHistoryFilePath();
    if (!path) return;
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        JSON.stringify({ version: "0.1", history: this._intentHistory }, null, 2),
        { mode: 0o600 },
      );
    } catch (err) {
      // Best-effort persistence: in-memory history is updated regardless,
      // so predictions work in-process. Log the error so disk issues
      // surface during dev, but don't fail the calling turn.
      console.warn("[intent-history] persist failed:", err instanceof Error ? err.message : err);
    }
  }

  /** Load intent history from disk (called at startup). */
  async loadIntentHistoryFromDisk(): Promise<void> {
    const path = this._intentHistoryFilePath();
    if (!path) return;
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as { history?: Array<{ intent: string; query: string; timestamp: string }> };
      if (Array.isArray(parsed.history)) {
        this._intentHistory.length = 0;
        for (const entry of parsed.history.slice(-NodeServiceImpl.INTENT_HISTORY_MAX)) {
          this._intentHistory.push(entry);
        }
      }
    } catch {
      // No persisted history yet
    }
  }

  private _publishedLibraryFilePath(): string | null {
    const dir = this._profileDir;
    if (!dir) return null;
    return join(dir, "published-library.json");
  }

  /** Persist the published library to disk. */
  private async _persistPublishedLibrary(): Promise<void> {
    const path = this._publishedLibraryFilePath();
    if (!path) return;
    const snapshot: Array<{ ownerId: string; entries: Array<{ title: string; topicTags: string[]; sensitivity: string; publishedAt: string }> }> = [];
    for (const [ownerId, entries] of this._publishedLibrary.entries()) {
      snapshot.push({ ownerId, entries });
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ version: "0.1", snapshot }, null, 2), { mode: 0o600 });
  }

  /** Restore the published library from disk (if present). */
  async loadPublishedLibraryFromDisk(): Promise<void> {
    const path = this._publishedLibraryFilePath();
    if (!path) return;
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as { snapshot?: Array<{ ownerId: string; entries: Array<{ title: string; topicTags: string[]; sensitivity: string; publishedAt: string }> }> };
      if (Array.isArray(parsed.snapshot)) {
        for (const { ownerId, entries } of parsed.snapshot) {
          this._publishedLibrary.set(ownerId, entries);
        }
      }
    } catch {
      // No persisted library yet — that's fine.
    }
  }

  async publishDocument(input: {
    title: string;
    topicTags: string[];
    sensitivity?: string;
  }): Promise<{ title: string; topicTags: string[]; sensitivity: string; publishedAt: string }> {
    const ownerId = this._profile?.owner.ownerId;
    if (!ownerId) throw new Error("owner profile not loaded");
    const entry = {
      title: input.title,
      topicTags: input.topicTags,
      sensitivity: input.sensitivity ?? "public",
      publishedAt: new Date().toISOString(),
    };
    const list = this._publishedLibrary.get(ownerId) ?? [];
    list.push(entry);
    this._publishedLibrary.set(ownerId, list);
    await this._persistPublishedLibrary();
    return entry;
  }

  /**
   * Record a bonded peer's published library (called by the test harness
   * or by agent.card sync). Idempotent: replaces any prior entries for
   * the same ownerId.
   */
  setPeerPublishedLibrary(
    ownerId: string,
    entries: Array<{ title: string; topicTags: string[]; sensitivity: string; publishedAt?: string }>,
  ): Promise<void> {
    // Preserve the original `publishedAt` for each entry when present;
    // only fall back to "now" for entries that don't carry one (which is
    // the case when the harness or sync layer pushes them in).
    this._publishedLibrary.set(
      ownerId,
      entries.map((e) => ({
        ...e,
        publishedAt: e.publishedAt ?? new Date().toISOString(),
      })),
    );
    // Surface persistence failures to the caller so they can retry or
    // surface the error. The in-memory state is updated regardless, but
    // the caller's await will reject if the write fails.
    return this._persistPublishedLibrary();
  }

  /**
   * Look up the topic tags for a given owner from the published library.
   * Returns [] for unknown owners.
   */
  private async _getContactTopicsFromLibrary(ownerId: string): Promise<string[]> {
    const entries = this._publishedLibrary.get(ownerId) ?? [];
    const tags = new Set<string>();
    for (const e of entries) {
      for (const t of e.topicTags) tags.add(t);
    }
    return Array.from(tags);
  }

  /**
   * Return the published-library entries for a given owner (or all owners).
   * Used by the test harness to share published-library data between
   * test nodes without going through a real mesh.
   */
  getPublishedLibraryEntries(ownerId?: string): Array<{
    title: string;
    topicTags: string[];
    sensitivity: string;
    publishedAt: string;
  }> {
    if (ownerId !== undefined) {
      return [...(this._publishedLibrary.get(ownerId) ?? [])];
    }
    const all: Array<{ title: string; topicTags: string[]; sensitivity: string; publishedAt: string }> = [];
    for (const list of this._publishedLibrary.values()) all.push(...list);
    return all;
  }

  // -------------------------------------------------------------------
  // Phase 25 — Cross-device continuity sessions
  // -------------------------------------------------------------------
  // Thin NodeService surface that delegates to the continuity-service
  // module. State is held in a per-profile JSON file so sessions
  // survive restarts. Real cross-device sync is wired via sync.state
  // (a follow-on).
  private _continuityFilePath(): string | null {
    const dir = this._profileDir;
    if (!dir) return null;
    return join(dir, "continuity-sessions.json");
  }

  private async _loadContinuitySessions(): Promise<Array<{
    sessionId: string;
    description: string;
    progress: string;
    currentStep: number;
    totalSteps: number;
    deviceType?: string;
    correlationId: string;
    originDevice: string;
    lastUpdatedAt: string;
    active: boolean;
  }>> {
    const path = this._continuityFilePath();
    if (!path) return [];
    let parsed: unknown;
    try {
      const raw = await readFile(path, "utf8");
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!parsed || typeof parsed !== "object") return [];
    const sessions = (parsed as { sessions?: unknown }).sessions;
    if (!Array.isArray(sessions)) return [];
    // Validate each entry has the required string fields. Drop malformed
    // entries rather than returning untyped data that could crash later.
    return sessions.filter(
      (s): s is {
        sessionId: string;
        description: string;
        progress: string;
        currentStep: number;
        totalSteps: number;
        deviceType?: string;
        correlationId: string;
        originDevice: string;
        lastUpdatedAt: string;
        active: boolean;
      } =>
        !!s &&
        typeof s === "object" &&
        typeof (s as Record<string, unknown>).sessionId === "string" &&
        typeof (s as Record<string, unknown>).description === "string",
    ) as Array<{
      sessionId: string;
      description: string;
      progress: string;
      currentStep: number;
      totalSteps: number;
      deviceType?: string;
      correlationId: string;
      originDevice: string;
      lastUpdatedAt: string;
      active: boolean;
    }>;
  }

  private async _saveContinuitySessions(
    sessions: Array<{
      sessionId: string;
      description: string;
      progress: string;
      currentStep: number;
      totalSteps: number;
      deviceType?: string;
      correlationId: string;
      originDevice: string;
      lastUpdatedAt: string;
      active: boolean;
    }>,
  ): Promise<void> {
    const path = this._continuityFilePath();
    if (!path) return;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ version: "0.1", sessions }, null, 2), { mode: 0o600 });
  }

  async startContinuitySession(
    description: string,
    opts?: { correlationId?: string; deviceType?: string },
  ): Promise<{
    sessionId: string;
    description: string;
    progress: string;
    currentStep: number;
    totalSteps: number;
    deviceType?: string;
    correlationId: string;
    originDevice: string;
    lastUpdatedAt: string;
    active: boolean;
  }> {
    const ownerId = this._profile?.owner.ownerId ?? "local-owner";
    const { startContinuitySession: csStart } = await import("./continuity-service.js");
    // Build the session with deviceType pre-applied so we save exactly once.
    // The continuity-service dep's saveSession writes the full list — passing
    // it the enriched session means a single read+write per start call, with
    // no race window between saves.
    const created = await csStart(
      {
        listSessions: () => this._loadContinuitySessions(),
        saveSession: async (s) => {
          const enriched = { ...s, deviceType: opts?.deviceType };
          const all = await this._loadContinuitySessions();
          const without = all.filter((x) => x.sessionId !== enriched.sessionId);
          await this._saveContinuitySessions([...without, enriched]);
        },
        getDeviceId: () => opts?.deviceType ?? ownerId,
      },
      description,
      opts?.correlationId,
    );
    // Defensive: if saveSession was somehow never invoked (it always is in
    // the current continuity-service), still return a value that includes
    // the deviceType. The session came from csStart which we just called.
    return { ...created, deviceType: opts?.deviceType };
  }

  async updateContinuitySession(
    sessionId: string,
    update: { progress?: string; currentStep?: number; totalSteps?: number; description?: string },
  ): Promise<{
    sessionId: string;
    description: string;
    progress: string;
    currentStep: number;
    totalSteps: number;
    deviceType?: string;
    correlationId: string;
    originDevice: string;
    lastUpdatedAt: string;
    active: boolean;
  } | null> {
    const { updateContinuitySession: csUpdate } = await import("./continuity-service.js");
    return csUpdate(
      {
        listSessions: () => this._loadContinuitySessions(),
        saveSession: async (s) => {
          const all = await this._loadContinuitySessions();
          const without = all.filter((x) => x.sessionId !== s.sessionId);
          await this._saveContinuitySessions([...without, s]);
        },
        getDeviceId: () => this._profile?.owner.ownerId ?? "local-owner",
      },
      sessionId,
      update,
    );
  }

  async completeContinuitySession(sessionId: string): Promise<void> {
    const { completeContinuitySession: csComplete } = await import("./continuity-service.js");
    await csComplete(
      {
        listSessions: () => this._loadContinuitySessions(),
        saveSession: async (s) => {
          const all = await this._loadContinuitySessions();
          const without = all.filter((x) => x.sessionId !== s.sessionId);
          await this._saveContinuitySessions([...without, s]);
        },
        getDeviceId: () => this._profile?.owner.ownerId ?? "local-owner",
      },
      sessionId,
    );
  }

  async getResumableSessions(): Promise<Array<{
    sessionId: string;
    description: string;
    progress: string;
    currentStep: number;
    totalSteps: number;
    deviceType?: string;
    correlationId: string;
    originDevice: string;
    lastUpdatedAt: string;
    active: boolean;
  }>> {
    const { getResumableSessions: csResumable } = await import("./continuity-service.js");
    return csResumable({
      listSessions: () => this._loadContinuitySessions(),
      saveSession: async () => {},
      getDeviceId: () => this._profile?.owner.ownerId ?? "local-owner",
    });
  }

  async startDocumentAcquisitionJob(params: {
    query: string;
    fileTitleHint?: string;
    pathHint?: string;
  }): Promise<{ jobId: string; correlationId: string }> {
    const config = await this.getNodeConfig();
    if (!this._documentAcquisitionJobStore) {
      throw new Error("document acquisition store unavailable");
    }
    if (!config.documentAcquisitionEnabled) {
      throw new Error("document acquisition disabled");
    }
    if (config.autonomousKillSwitch) {
      throw new Error("autonomous kill switch active");
    }
    const policy = {
      searchBondedOnly: true,
      maxNegotiationRounds: 5,
      maxActiveJobs: 3,
      jobTtlHours: 72,
    };
    const localManifestCapabilities = await this._localManifestCapabilities();
    const started = await startDocumentAcquisitionJobWorker(
      {
        postureRef: config.documentAcquisitionMandateId ?? "default-document-acquisition",
        policy,
        localManifestCapabilities,
        listJobs: (activeOnly) => this._documentAcquisitionJobStore!.list(activeOnly),
        saveJob: (job) => this._documentAcquisitionJobStore!.save(job),
        recordActivity: async (input) => {
          if (!this._agentActivityStore) return;
          const record: AgentActivityRecord = {
            activityId: randomUUID(),
            correlationId: input.correlationId,
            taskId: input.jobId,
            domain: "knowledge",
            kind: "document_acq_stage",
            summary: input.summary,
            createdAt: new Date().toISOString(),
          };
          await this._agentActivityStore.append(record);
          await this._publishAgentActivity(record);
        },
      },
      params,
    );
    await advanceDocumentAcquisitionJob(await this._documentAcquisitionWorkerDeps(config), started.jobId);
    return started;
  }

  async getDocumentAcquisitionJob(jobId: string): Promise<DocumentAcquisitionJob | undefined> {
    if (!this._documentAcquisitionJobStore) return undefined;
    return this._documentAcquisitionJobStore.get(jobId.trim());
  }

  async listDocumentAcquisitionJobs(activeOnly?: boolean): Promise<DocumentAcquisitionJob[]> {
    if (!this._documentAcquisitionJobStore) return [];
    return this._documentAcquisitionJobStore.list(activeOnly);
  }

  async cancelDocumentAcquisitionJob(jobId: string): Promise<void> {
    if (!this._documentAcquisitionJobStore) return;
    const job = await this._documentAcquisitionJobStore.get(jobId.trim());
    if (!job) return;
    const { job: next } = transitionDocumentAcquisitionJob(job, "KILL_SWITCH");
    await this._documentAcquisitionJobStore.save(next);
  }

  async runDocumentAcquisitionWorker(): Promise<number> {
    const config = await this.getNodeConfig();
    return runDocumentAcquisitionWorkerTick(await this._documentAcquisitionWorkerDeps(config));
  }

  async startCapabilityProviderJob(params: {
    goal: string;
    capabilityIds?: string[];
    targetOwnerId?: string;
  }): Promise<{ jobId: string; correlationId: string }> {
    const config = await this.getNodeConfig();
    if (!this._capabilityProviderJobStore) {
      throw new Error("capability provider store unavailable");
    }
    if (!config.capabilityProviderEnabled) {
      throw new Error("capability provider disabled");
    }
    if (config.autonomousKillSwitch) {
      throw new Error("autonomous kill switch active");
    }
    const started = await startCapabilityProviderJobWorker(
      {
        postureRef: config.capabilityProviderMandateId ?? "default-capability-provider",
        policy: { maxActiveJobs: 3, jobTtlHours: 72 },
        listJobs: (activeOnly) => this._capabilityProviderJobStore!.list(activeOnly),
        saveJob: (job) => this._capabilityProviderJobStore!.save(job),
        recordActivity: async (input) => {
          if (!this._agentActivityStore) return;
          const record: AgentActivityRecord = {
            activityId: randomUUID(),
            correlationId: input.correlationId,
            taskId: input.jobId,
            domain: "research",
            kind: "capability_provider_stage",
            summary: input.summary,
            createdAt: new Date().toISOString(),
          };
          await this._agentActivityStore.append(record);
          await this._publishAgentActivity(record);
        },
      },
      params,
    );
    await advanceCapabilityProviderJob(await this._capabilityProviderWorkerDeps(config), started.jobId);
    return started;
  }

  async getCapabilityProviderJob(jobId: string): Promise<CapabilityProviderJob | undefined> {
    if (!this._capabilityProviderJobStore) return undefined;
    return this._capabilityProviderJobStore.get(jobId.trim());
  }

  async listCapabilityProviderJobs(activeOnly?: boolean): Promise<CapabilityProviderJob[]> {
    if (!this._capabilityProviderJobStore) return [];
    return this._capabilityProviderJobStore.list(activeOnly);
  }

  async cancelCapabilityProviderJob(jobId: string): Promise<void> {
    if (!this._capabilityProviderJobStore) return;
    const job = await this._capabilityProviderJobStore.get(jobId.trim());
    if (!job) return;
    const { job: next } = transitionCapabilityProviderJob(job, "KILL_SWITCH");
    await this._capabilityProviderJobStore.save(next);
  }

  async runCapabilityProviderWorker(): Promise<number> {
    const config = await this.getNodeConfig();
    return runCapabilityProviderWorkerTick(await this._capabilityProviderWorkerDeps(config));
  }

  private async _localManifestCapabilities(): Promise<string[]> {
    const manifest = await this.getCapabilityManifest();
    return manifest?.capabilities ?? [];
  }

  private async _capabilityProviderWorkerDeps(config: NodeConfig) {
    return {
      capabilityProviderEnabled: config.capabilityProviderEnabled ?? false,
      autonomousKillSwitch: config.autonomousKillSwitch ?? false,
      postureRef: config.capabilityProviderMandateId ?? "default-capability-provider",
      policy: { maxActiveJobs: 3, jobTtlHours: 72 },
      localManifestCapabilities: await this._localManifestCapabilities(),
      listJobs: (activeOnly?: boolean) =>
        this._capabilityProviderJobStore?.list(activeOnly) ?? Promise.resolve([]),
      saveJob: (job: CapabilityProviderJob) => {
        if (!this._capabilityProviderJobStore) {
          throw new Error("capability provider store unavailable");
        }
        return this._capabilityProviderJobStore.save(job);
      },
      executeRouteStep: (
        job: CapabilityProviderJob,
        toolName: string,
        params: Record<string, unknown>,
      ) =>
        executeCapabilityRouteStep(
          { getToolContext: () => this.getToolExecutionContext() },
          job,
          toolName,
          params,
        ),
      resolveTargetOwnerId: async (goal: string, capabilityIds: string[]) => {
        const context = await this.getToolExecutionContext();
        if (!context?.listBondedAgentCapabilities) return undefined;
        const rows = await context.listBondedAgentCapabilities();
        const goalLower = goal.toLowerCase();
        for (const row of rows) {
          if (
            capabilityIds.length > 0 &&
            !capabilityIds.some((cap: string) =>
              row.capabilities.some((tag) => tag.toLowerCase() === cap.toLowerCase()),
            )
          ) {
            continue;
          }
          if (capabilityIds.length > 0 || goalLower.length > 2) {
            return row.ownerId;
          }
        }
        return rows[0]?.ownerId;
      },
      recordActivity: async (input: { correlationId: string; summary: string; jobId: string }) => {
        if (!this._agentActivityStore) return;
        const record: AgentActivityRecord = {
          activityId: randomUUID(),
          correlationId: input.correlationId,
          taskId: input.jobId,
          domain: "research",
          kind: "capability_provider_stage",
          summary: input.summary,
          createdAt: new Date().toISOString(),
        };
        await this._agentActivityStore.append(record);
        await this._publishAgentActivity(record);
      },
    };
  }

  private async _documentAcquisitionWorkerDeps(config: NodeConfig) {
    return {
      documentAcquisitionEnabled: config.documentAcquisitionEnabled ?? false,
      autonomousKillSwitch: config.autonomousKillSwitch ?? false,
      postureRef: config.documentAcquisitionMandateId ?? "default-document-acquisition",
      localManifestCapabilities: await this._localManifestCapabilities(),
      policy: {
        searchBondedOnly: true,
        maxNegotiationRounds: 5,
        maxActiveJobs: 3,
        jobTtlHours: 72,
      },
      listJobs: (activeOnly?: boolean) =>
        this._documentAcquisitionJobStore?.list(activeOnly) ?? Promise.resolve([]),
      saveJob: (job: DocumentAcquisitionJob) => {
        if (!this._documentAcquisitionJobStore) {
          throw new Error("document acquisition store unavailable");
        }
        return this._documentAcquisitionJobStore.save(job);
      },
      listLibraryItems: (query?: string) => this.listLibraryItems({ query }),
      searchLocalVault: async (query: string) => {
        const vaultIndex = await buildVaultIndex({ rootDir: this._vaultDir });
        const nodeConfig = await this.getNodeConfig();
        const rag = await this._getRagService();
        const hits = rag
          ? await rag.searchVaultKnowledgeBase({
              vaultIndex,
              query,
              knowledgeAccess: "personal",
              knowledgeBase: nodeConfig.aiSettings?.knowledgeBase,
              knowledgeScope: "owner",
            })
          : searchVaultKnowledgeBase({
              vaultIndex,
              query,
              knowledgeAccess: "personal",
              knowledgeBase: nodeConfig.aiSettings?.knowledgeBase,
              knowledgeScope: "owner",
            });
        const byDoc = new Map<string, { relativePath: string; title: string; ragScore: number }>();
        for (const hit of hits) {
          const existing = byDoc.get(hit.document.documentId);
          if (!existing || hit.score > existing.ragScore) {
            byDoc.set(hit.document.documentId, {
              relativePath: hit.document.relativePath,
              title: hit.document.title,
              ragScore: hit.score,
            });
          }
        }
        return [...byDoc.values()].sort((a, b) => b.ragScore - a.ragScore).slice(0, 8);
      },
      discoverPublishedLibrary: () => this.discoverPublishedLibrary(),
      listPendingShareOffers: () => this.listPendingShareOffers(),
      acceptShare: (shareId: string, savePath: string) => this.acceptShare(shareId, savePath),
      isTransferVerified: async (shareId: string) => {
        const status = await this.getTransferStatus(shareId);
        return status?.phase === "verified";
      },
      queryPeerKnowledge: async (ownerId: string, query: string) => {
        const context = await this.getToolExecutionContext();
        if (!context) return { ok: false };
        const result = await executeTool(
          "knowledge.query",
          { targetOwnerId: ownerId, query, requestedSensitivity: "friends" },
          context,
        );
        if (!result.ok) return { ok: false };
        const response = result.result;
        if (response && typeof response === "object" && "payload" in response) {
          try {
            const payload = parseKnowledgeResponsePayload((response as EnvoyEnvelope).payload);
            return {
              ok: true,
              answerText: payload.answer,
              suggestedRelativePath: payload.suggestedRelativePath,
            };
          } catch {
            /* fall through */
          }
        }
        const answerText =
          typeof result.result === "string"
            ? result.result
            : JSON.stringify(result.result ?? "");
        return { ok: true, answerText };
      },
      requestShareFromLibrary: async (job: DocumentAcquisitionJob, candidate: DocumentAcquisitionCandidate) => {
        if (!candidate.sourceRelativePath) return false;
        const sensitivity =
          candidate.sensitivity === "trusted" ? "friends" : candidate.sensitivity;
        try {
          await this.requestShareFromLibrary(candidate.sourceOwnerId, {
            relativePath: candidate.sourceRelativePath,
            sensitivity,
            correlationId: job.correlationId,
          });
          return true;
        } catch {
          return false;
        }
      },
      recordActivity: async (input: { correlationId: string; summary: string; jobId: string }) => {
        if (!this._agentActivityStore) return;
        const record: AgentActivityRecord = {
          activityId: randomUUID(),
          correlationId: input.correlationId,
          taskId: input.jobId,
          domain: "knowledge",
          kind: "document_acq_stage",
          summary: input.summary,
          createdAt: new Date().toISOString(),
        };
        await this._agentActivityStore.append(record);
        await this._publishAgentActivity(record);
      },
    };
  }

  private async _recordFriendAutopilotPass(input: {
    ok: boolean;
    error?: string;
    trigger: "manual" | "scheduled";
    correlationId?: string;
  }): Promise<void> {
    if (!this._agentActivityStore) return;
    const record = buildFriendAutopilotActivityRecord({
      correlationId: input.correlationId ?? randomUUID(),
      ok: input.ok,
      trigger: input.trigger,
      error: input.error,
    });
    await this._agentActivityStore.append(record);
    await this._publishAgentActivity(record);
  }

  async listPendingApprovals(): Promise<PendingApprovalSummary[]> {
    if (!this._approvalQueue) return [];
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

  async approvePendingApproval(itemId: string, notes?: string): Promise<ApprovePendingApprovalResult> {
    if (!this._approvalQueue) {
      return { ok: false, error: "approval queue not available" };
    }
    const approved = this._approvalQueue.approve(itemId.trim(), notes);
    if (!approved) {
      return { ok: false, error: "Item not found or not pending" };
    }
    const executed = await executeApprovedAction(approved, {
      sendAgentChat: (targetOwnerId, text) => this.sendAgentChat(targetOwnerId, text),
      forwardDiscovery: (payload) => this._discoveryRuntime().executeDiscoveryForward(payload),
    });
    if (!executed.ok) {
      return { ok: false, error: executed.reason };
    }
    return { ok: true, messageId: executed.messageId };
  }

  async rejectPendingApproval(itemId: string, notes?: string): Promise<{ ok: boolean; error?: string }> {
    if (!this._approvalQueue) {
      return { ok: false, error: "approval queue not available" };
    }
    const pending = this._approvalQueue.get(itemId.trim());
    const rejected = this._approvalQueue.reject(itemId.trim(), notes);
    if (!rejected) {
      return { ok: false, error: "Item not found or not pending" };
    }
    if (pending?.actionType === "discovery_forward" && this._taskStore) {
      const correlationId =
        typeof pending.context.metadata?.correlationId === "string"
          ? pending.context.metadata.correlationId
          : undefined;
      await this._taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "discovery.request",
          correlationId,
          direction: "inbound",
          outcome: "deny",
          summary: `discovery_forward approval declined (US-MH3) item=${itemId.trim()}`,
        }),
      );
    }
    return { ok: true };
  }

  private async _publishAgentActivity(
    record: AgentActivityRecord,
    contactOwnerId?: string,
  ): Promise<void> {
    const config = await this.getNodeConfig();
    if (shouldPushAgentActivity(record.kind, config.agentVisibility, record.domain)) {
      this.emit("agent:activity", record);
    }
    if (
      contactOwnerId &&
      shouldPostA2aChatLine(record.kind, config.a2aChatNotifications)
    ) {
      this._emitLocalSystemChatLine(
        contactOwnerId,
        formatA2aChatSystemLine({
          kind: record.kind,
          summary: record.summary,
          remoteOwnerId: record.remoteOwnerId,
          taskId: record.taskId,
        }),
      );
    }
  }

  private _emitLocalSystemChatLine(threadPeerOwnerId: string, text: string): void {
    const profile = this._profile;
    const mesh = this._mesh ?? this._externalMesh;
    if (!profile) return;
    const msg: ChatMessage = {
      messageId: `system-${randomUUID()}`,
      sender: {
        nodeId: mesh?.peerId ?? "local",
        ownerId: profile.owner.ownerId,
        displayName: "System",
        actorRole: "system",
      },
      recipient: {
        nodeId: "",
        ownerId: threadPeerOwnerId,
      },
      content: { text },
      metadata: {
        timestamp: new Date().toISOString(),
        deliveryReceipt: "delivered",
      },
      signature: "local-system",
    };
    this._persistChatMessage(threadPeerOwnerId, msg);
    this.emit("chat:message", msg);
  }

  /** Called from daemon inbound handler after A2A task journal append. */
  async recordInboundTaskActivity(
    decision: Extract<DispatcherDecision, { action: "handled" }>,
    envelope: EnvoyEnvelope,
  ): Promise<void> {
    if (!this._agentActivityStore) return;
    await recordTaskJournalActivity(
      this._agentActivityStore,
      decision,
      {
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        senderPeerId: envelope.senderPeerId,
        senderRole: envelope.senderRole,
      },
      (record) => {
        void this._publishAgentActivity(record, record.remoteOwnerId);
      },
    );
    if (this._commerceReceiptStore) {
      await recordCommerceReceiptFromTaskResult({
        envelope,
        receiptStore: this._commerceReceiptStore,
        activityStore: this._agentActivityStore,
        emit: (record) => {
          void this._publishAgentActivity(record, record.remoteOwnerId);
        },
      });
    }
  }

  /** Local-only owner report (Option A — no P2P envelope to human). */
  async emitLocalOwnerReport(
    report: import("@envoymesh/protocol").Report,
    opts?: { contactOwnerId?: string },
  ): Promise<AgentActivityRecord | null> {
    if (!this._agentActivityStore) return null;
    const localOwnerId = this._profile?.owner.ownerId ?? report.ownerId;
    const contactOwnerId = resolveReportContactOwnerId(
      report,
      localOwnerId,
      opts?.contactOwnerId,
    );
    return emitOwnerReport(this._agentActivityStore, report, localOwnerId, (record) => {
      void this._publishAgentActivity(record, contactOwnerId);
    });
  }

  async sendChatAttachment(params: SendChatAttachmentParams): Promise<SendChatAttachmentResult> {
    this._assertOnline();
    this.recordOwnerActivity();
    const bytes = Buffer.from(params.contentBase64, "base64");
    if (bytes.byteLength === 0) {
      throw new Error("Empty file");
    }
    if (bytes.byteLength > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new Error(`File exceeds ${MAX_CHAT_ATTACHMENT_BYTES} bytes`);
    }

    const attachmentId = randomUUID();
    const filename = sanitizeChatFilename(params.filename);
    const vaultRelativePath = `chat/out/${attachmentId}/${filename}`;
    const mimeType = params.mimeType?.trim() || mimeTypeForFilename(filename);
    const sensitivity = params.sensitivity ?? "friends";

    await this.importToLibrary({
      relativePath: vaultRelativePath,
      contentBase64: params.contentBase64,
      mimeType,
    });

    const { shareRequestMessageId } = await this._shareFileInternal(params.targetOwnerId, {
      path: vaultRelativePath,
      sensitivity,
      deliveryChannel: "chat",
    });

    void this._recordFileShareInChat({
      peerOwnerId: params.targetOwnerId,
      outgoing: true,
      vaultRelativePath,
      byteLength: bytes.byteLength,
      sensitivity,
      mimeType,
      textOverride: params.caption?.trim() || `Sent ${filename}`,
    });

    return { attachmentId, vaultRelativePath, shareRequestMessageId };
  }

  async sendChatRoomAttachment(
    params: SendChatRoomAttachmentParams,
  ): Promise<SendChatRoomAttachmentResult> {
    this._assertOnline();
    this.recordOwnerActivity();
    const bytes = Buffer.from(params.contentBase64, "base64");
    if (bytes.byteLength === 0) {
      throw new Error("Empty file");
    }
    if (bytes.byteLength > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new Error(`File exceeds ${MAX_CHAT_ATTACHMENT_BYTES} bytes`);
    }

    const attachmentId = randomUUID();
    const filename = sanitizeChatFilename(params.filename);
    const vaultRelativePath = `chat/out/${attachmentId}/${filename}`;
    const mimeType = params.mimeType?.trim() || mimeTypeForFilename(filename);
    const sensitivity = params.sensitivity ?? "friends";

    await this.importToLibrary({
      relativePath: vaultRelativePath,
      contentBase64: params.contentBase64,
      mimeType,
    });

    const caption = params.caption?.trim();
    const text = caption || `Sent ${filename}`;
    const result = await sendChatRoomAttachmentImpl(this._chatRoomDeps(), {
      roomId: params.roomId,
      text,
      attachment: {
        id: attachmentId,
        filename,
        mimeType,
        sizeBytes: bytes.byteLength,
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

  async readLibraryItemContent(
    params: ReadLibraryItemContentParams,
  ): Promise<ReadLibraryItemContentResult> {
    const maxBytes = Math.min(
      params.maxBytes ?? MAX_LIBRARY_ITEM_PREVIEW_BYTES,
      MAX_LIBRARY_ITEM_PREVIEW_BYTES,
    );
    const { absolutePath, vaultRelativePath } = await this.resolveLibraryItemPath(params.relativePath);
    const st = await stat(absolutePath);
    if (st.size > maxBytes) {
      throw new Error(`File too large for preview (${st.size} bytes, max ${maxBytes})`);
    }
    const content = await readFile(absolutePath);
    return {
      contentBase64: content.toString("base64"),
      mimeType: mimeTypeForFilename(basename(vaultRelativePath)),
      sizeBytes: st.size,
      truncated: false,
    };
  }

  async listChatHistory(peerOwnerId: string, limit?: number): Promise<ChatMessage[]> {
    if (!this._chatLogStore) return [];
    if (peerOwnerId.trim() === ENVOY_AI_THREAD_KEY) {
      return this._loadEnvoyAiChatHistory(limit);
    }
    const rows = await this._chatLogStore.listThread(peerOwnerId.trim(), limit);
    return rows as ChatMessage[];
  }

  async listChatRooms(): Promise<ChatRoom[]> {
    return listChatRoomsImpl(this._chatRoomDeps());
  }

  async createChatRoom(title: string, memberOwnerIds: string[]): Promise<ChatRoom> {
    return createChatRoomImpl(this._chatRoomDeps(), title, memberOwnerIds);
  }

  async inviteToChatRoom(roomId: string, memberOwnerIds: string[]): Promise<ChatRoom> {
    return inviteToChatRoomImpl(this._chatRoomDeps(), roomId, memberOwnerIds);
  }

  async leaveChatRoom(roomId: string): Promise<void> {
    return leaveChatRoomImpl(this._chatRoomDeps(), roomId);
  }

  async removeMembersFromChatRoom(roomId: string, memberOwnerIds: string[]): Promise<ChatRoom> {
    return removeMembersFromChatRoomImpl(this._chatRoomDeps(), roomId, memberOwnerIds);
  }

  async renameChatRoom(roomId: string, title: string): Promise<ChatRoom> {
    return renameChatRoomImpl(this._chatRoomDeps(), roomId, title);
  }

  async dismissChatRoom(roomId: string): Promise<void> {
    return dismissChatRoomImpl(this._chatRoomDeps(), roomId);
  }

  async sendChatRoomMessage(roomId: string, text: string): Promise<SendChatResult> {
    return sendChatRoomMessageImpl(this._chatRoomDeps(), roomId, text);
  }

  async handleInboundChatRoomSync(
    envelope: import("@envoymesh/protocol").EnvoyEnvelope,
    payload: import("@envoymesh/protocol").ChatRoomSyncPayload,
  ): Promise<void> {
    await handleInboundChatRoomSyncImpl(this._chatRoomDeps(), envelope, payload);
  }

  async handleInboundChatRoomMessage(
    envelope: EnvoyEnvelope,
    payload: import("@envoymesh/protocol").ChatRoomMessagePayload,
    remotePeerId: string,
    replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>,
  ): Promise<void> {
    await handleInboundChatRoomMessageImpl(
      this._chatRoomDeps(),
      envelope,
      payload,
      remotePeerId,
      this._roomDeliveryAck(replyWithEnvelope),
    );

    // Phase 27 — Agent group chat responder: check for @envoy mentions
    const senderRole = (envelope.senderRole as string) ?? "human";
    if (senderRole !== "agent") {
      void this._maybeRespondAsAgentInRoom(payload.roomId, envelope, payload, senderRole as "human" | "agent" | "system");
    }
  }

  private async _maybeRespondAsAgentInRoom(
    roomId: string,
    envelope: EnvoyEnvelope,
    payload: import("@envoymesh/protocol").ChatRoomMessagePayload,
    senderRole: "human" | "agent" | "system",
  ): Promise<void> {
    const text = payload.text ?? "";
    if (!text.includes("@envoy")) return;

    try {
      const { evaluateAgentGroupChatResponse } = await import("./agent-group-chat-responder.js");
      const decision = await evaluateAgentGroupChatResponse(
        {
          hasMention: (t: string) => t.includes("@envoy"),
          generateAnswer: async (prompt: string) => {
            if (await this._ensureOpenClawReady()) {
              this._beginOpenClawToolTracking();
              try {
                const context = await this._buildOpenClawTurnContext();
                return stripModelThinking(await this.askOpenClaw(prompt, context));
              } catch (err) {
                console.warn("[openclaw] @envoy request failed, falling back:", err instanceof Error ? err.message : String(err));
              } finally {
                this._endOpenClawToolTracking();
              }
            }
            const config = await this.getNodeConfig();
            if (!config?.modelProviders?.mode || config.modelProviders.mode === "disabled") {
              return "Agent is not configured. Enable model provider in Settings → AI.";
            }
            return this.knowledgeQuery(prompt);
          },
          sendAgentRoomMessage: async (rid: string, response: string) => {
            await this.sendChatRoomMessage(rid, response);
          },
          allowResponse: (roomId: string) => this._allowAgentGroupChatResponse(roomId),
        },
        {
          roomId,
          senderRole,
          text,
        },
      );

      if (decision.shouldRespond && decision.response) {
        await this.sendChatRoomMessage(roomId, `[Agent] ${decision.response}`);
      }
    } catch (err) {
      console.warn("[agent-group-chat] failed to evaluate:", err instanceof Error ? err.message : err);
    }
  }

  private _allowAgentGroupChatResponse(roomId: string): boolean {
    const MAX_RESPONSES_PER_HOUR = 3;
    const RATE_WINDOW_MS = 60 * 60 * 1000;
    const now = Date.now();
    const entry = this._agentGroupChatCounters.get(roomId);
    if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
      this._agentGroupChatCounters.set(roomId, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= MAX_RESPONSES_PER_HOUR) return false;
    entry.count++;
    return true;
  }

  async deleteChatMessage(peerOwnerId: string, messageId: string): Promise<{ ok: boolean }> {
    const thread = peerOwnerId.trim();
    const id = messageId.trim();
    if (!thread || !id || !this._chatLogStore) {
      return { ok: false };
    }
    const ok = await this._chatLogStore.deleteMessage(thread, id);
    if (ok && (await this._shouldPurgeChatRagOnDelete())) {
      const rag = await this._getRagService();
      await rag?.removeChatMessage(thread, id);
    }
    return { ok };
  }

  async clearChatHistory(peerOwnerId: string): Promise<{ deletedCount: number }> {
    const thread = peerOwnerId.trim();
    if (!thread || !this._chatLogStore) {
      return { deletedCount: 0 };
    }
    let deletedCount = await this._chatLogStore.clearThread(thread);
    if (thread === ENVOY_AI_THREAD_KEY) {
      const legacyPeerId = this._bridgeStatus?.agentPeerId?.trim();
      if (legacyPeerId && legacyPeerId !== ENVOY_AI_THREAD_KEY) {
        deletedCount += await this._chatLogStore.clearThread(legacyPeerId);
      }
    }
    if (deletedCount > 0 && (await this._shouldPurgeChatRagOnDelete())) {
      const rag = await this._getRagService();
      await rag?.clearChatThread(thread);
      if (thread === ENVOY_AI_THREAD_KEY) {
        const legacyPeerId = this._bridgeStatus?.agentPeerId?.trim();
        if (legacyPeerId && legacyPeerId !== ENVOY_AI_THREAD_KEY) {
          await rag?.clearChatThread(legacyPeerId);
        }
      }
    }
    return { deletedCount };
  }

  private async _shouldPurgeChatRagOnDelete(): Promise<boolean> {
    const config = await this.getNodeConfig();
    return resolveAiKnowledgeBaseSettings(config.aiSettings?.knowledgeBase).purgeChatRagOnDelete;
  }

  async markRead(_targetOwnerId: string, _upToMessageId?: string): Promise<void> {
    // Future: send read receipts
  }

  // ============================================
  // Search / Discovery (delegated to node-service-discovery.ts)
  // ============================================

  private _discoveryRuntimeCache?: NodeDiscoveryRuntime;

  private _discoveryRuntime(): NodeDiscoveryRuntime {
    if (!this._discoveryRuntimeCache) {
      this._discoveryRuntimeCache = new NodeDiscoveryRuntime({
        getProfile: () => this._profile,
        requireProfile: () => this._requireProfile(),
        getMesh: () => this._mesh,
        requireMesh: () => this._requireMesh(),
        getReachableMesh: () => this._reachableMesh(),
        trustStore: this._trustStore,
        peerDirectoryStore: this._peerDirectoryStore,
        configStore: this._configStore,
        taskStore: this._taskStore,
        discoverySeedStore: this._discoverySeedStore,
        contactOwnerKeyStore: this._contactOwnerKeyStore,
        multihopDiscoveryStore: this._multihopDiscoveryStore,
        peerProfileCacheStore: this._peerProfileCacheStore,
        getApprovalQueue: () => this._approvalQueue,
        resolvePeerTransportForOwner: (targetOwnerId) => this._resolvePeerTransportForOwner(targetOwnerId),
        dialHintsForChat: (recipientPeerId, peerListenAddrs) =>
          this._dialHintsForChat(recipientPeerId, peerListenAddrs),
        emitMultiHopUpdate: (session) => this.emit("discovery:multihop-update", session),
        warmLocalPeerProfiles: async (ownerIds) => {
          await Promise.allSettled(ownerIds.map((ownerId) => this.requestPeerProfile(ownerId)));
        },
        loadHumanProfile: () => this._humanProfileStore.loadHumanProfile(),
      });
    }
    return this._discoveryRuntimeCache;
  }

  async searchPeers(query: SearchQuery): Promise<PeerSearchResult[]> {
    return this._discoveryRuntime().searchPeers(query);
  }

  async discoverCapabilityTopic(params: DiscoverCapabilityTopicParams): Promise<DiscoverCapabilityTopicResult> {
    return this._discoveryRuntime().discoverCapabilityTopic(params);
  }

  async getMorningReport(params?: { limit?: number }): Promise<MorningReportEntry[]> {
    return this._discoveryRuntime().getMorningReport(params);
  }

  queueDiscoveryForwardFromInbound(input: {
    envelope: EnvoyEnvelope;
    requesterOwnerId: string;
    trustLevel: string;
    correlationId: string | undefined;
  }): string | undefined {
    return this._discoveryRuntime().queueDiscoveryForwardFromInbound(input);
  }

  async getMultiHopDiscoverySession(
    correlationId: string,
  ): Promise<MultiHopDiscoverySessionView | undefined> {
    return this._discoveryRuntime().getMultiHopDiscoverySession(correlationId);
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
    return this._discoveryRuntime().ingestInboundMultiHopDiscoveryResponse(params);
  }

  async requestMultiHopDiscovery(
    params: RequestMultiHopDiscoveryParams,
  ): Promise<RequestMultiHopDiscoveryResult> {
    return this._discoveryRuntime().requestMultiHopDiscovery(params);
  }

  async sendSyncStateUpdate(
    params: import("@envoymesh/api").SendSyncStateUpdateParams,
  ): Promise<import("@envoymesh/api").SendSyncStateUpdateResult> {
    return sendSyncStateUpdateViaMesh(
      {
        requireProfile: () => this._requireProfile(),
        requireMesh: () => this._requireMesh(),
        peerDirectoryStore: this._peerDirectoryStore,
      },
      params,
    );
  }

  async advertiseTopic(topic: string): Promise<void> {
    return this._discoveryRuntime().advertiseTopic(topic);
  }

  async stopAdvertiseTopic(topic: string): Promise<void> {
    return this._discoveryRuntime().stopAdvertiseTopic(topic);
  }

  async getConnectivityDiagnostics(): Promise<ConnectivityDiagnostics> {
    return getConnectivityDiagnosticsViaRuntime(this._wanRuntimeDeps());
  }

  private _wanRuntimeDeps(): NodeWanRuntimeDeps {
    return {
      recordOwnerActivity: () => this.recordOwnerActivity(),
      getNodeConfig: () => this.getNodeConfig(),
      loadPersistedConfig: () => this._configStore.load(),
      updateNodeConfig: (patch) => this.updateNodeConfig(patch),
      reachableMesh: () => this._reachableMesh(),
      getMesh: () => this._mesh,
      getExternalMesh: () => this._externalMesh,
      getNodeStatus: () => this._nodeStatus,
      getDiscoverySeedStore: () => this._discoverySeedStore ?? null,
      getTaskStore: () => this._taskStore ?? null,
    };
  }

  // ============================================
  // File Sharing
  // ============================================

  async listLibraryItems(params?: ListLibraryItemsParams): Promise<LibraryItem[]> {
    const index = await buildVaultIndex({ rootDir: this._vaultDir });
    const publishedIds = await createPublishedLibraryStore(this._profileDir).loadDocumentIds();
    const externalExports = await createPublishedExternalStore(this._profileDir).loadAll();
    const q = params?.query?.trim().toLowerCase();
    let docs = index.documents;
    if (q) {
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.relativePath.toLowerCase().includes(q),
      );
    }
    return docs.map((d) => ({
      documentId: d.documentId,
      relativePath: d.relativePath,
      title: d.title,
      extension: d.extension,
      byteLength: d.byteLength,
      contentHash: d.contentHash,
      updatedAt: d.updatedAt,
      published: publishedIds.has(d.documentId),
      publishedExternal: externalExports.get(d.documentId),
    }));
  }

  async listOpenClawWorkspaceFiles(params?: { query?: string }): Promise<WorkspaceFileItem[]> {
    return listOpenClawWorkspaceFilesFromDir(openClawWorkspaceDir(this._profileDir), params?.query);
  }

  async listAllLocalFiles(params?: ListAllLocalFilesParams): Promise<ListAllLocalFilesResult> {
    const [vaultItems, workspaceItems] = await Promise.all([
      this.listLibraryItems(params),
      this.listOpenClawWorkspaceFiles(params),
    ]);
    return buildAllLocalFilesList({ vaultItems, workspaceItems });
  }

  async readLocalFileContent(
    params: ReadLocalFileContentParams,
  ): Promise<ReadLibraryItemContentResult> {
    if (params.source === "workspace") {
      return this.readOpenClawWorkspaceFile({
        relativePath: params.relativePath,
        maxBytes: params.maxBytes,
      });
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

  async openLocalFile(params: OpenLocalFileParams): Promise<void> {
    if (params.source === "workspace") {
      const { absolutePath } = await this.resolveOpenClawWorkspacePath(params.relativePath);
      await openPathWithDefaultApp(absolutePath);
      return;
    }
    await this.openLibraryItem(params.relativePath);
  }

  async resolveOpenClawWorkspacePath(relativePath: string): Promise<{ absolutePath: string }> {
    const absolutePath = assertPathInsideOpenClawWorkspace(
      openClawWorkspaceDir(this._profileDir),
      relativePath,
    );
    return { absolutePath };
  }

  async readOpenClawWorkspaceFile(
    params: ReadLibraryItemContentParams,
  ): Promise<ReadLibraryItemContentResult> {
    return readOpenClawWorkspaceFileFromDir(openClawWorkspaceDir(this._profileDir), params);
  }

  async setLibraryItemPublished(documentId: string, published: boolean): Promise<void> {
    await createPublishedLibraryStore(this._profileDir).setPublished(documentId, published);
  }

  async exportLibraryItemToIpfs(documentId: string): Promise<ExportLibraryItemToIpfsResult> {
    this.recordOwnerActivity();
    if (!this._taskStore) {
      throw new Error("Task store not initialized — node is not fully wired");
    }
    const config = await this.getNodeConfig();
    const allowIpfs = config.externalPublish?.allowIpfs ?? false;
    const taskStore = this._taskStore;
    return exportVaultDocumentToIpfs({
      vaultDir: this._vaultDir,
      profileDir: this._profileDir,
      documentId,
      allowIpfs,
      externalPublish: config.externalPublish,
      appendAudit: (event) => taskStore.appendAuditEvent(event),
    });
  }

  async pinLibraryItemExternal(documentId: string): Promise<PinLibraryItemExternalResult> {
    this.recordOwnerActivity();
    const config = await this.getNodeConfig();
    if (!config.externalPublish?.allowIpfs) {
      return { ok: false, error: "IPFS export is disabled" };
    }
    if (!config.externalPublish.pinningEnabled) {
      return { ok: false, error: "External pinning is disabled in node settings" };
    }
    const store = createPublishedExternalStore(this._profileDir);
    const record = await store.get(documentId.trim());
    if (!record?.cid?.trim()) {
      return { ok: false, error: "Document has no exported CID — export to IPFS first" };
    }
    const outcome = await pinCidToProvider({
      cid: record.cid,
      name: documentId,
      provider: config.externalPublish.pinningProvider ?? "pinata",
    });
    if (!outcome.ok) {
      return { ok: false, error: outcome.error };
    }
    if (this._taskStore) {
      await this._taskStore.appendAuditEvent(
        createAuditEvent({
          type: "vault.ipfs_pin.completed",
          outcome: "record",
          summary: `Pinned CID via ${outcome.provider}`,
          createdAt: new Date().toISOString(),
        }),
      );
    }
    return { ok: true, cid: record.cid, provider: outcome.provider, pinId: outcome.pinId };
  }

  async getIpfsEngineStatus(): Promise<IpfsEngineStatus> {
    const config = await this.getNodeConfig();
    return getIpfsEngineStatus({
      profileDir: this._profileDir,
      selection: resolveIpfsExportEngineSelection({ externalPublish: config.externalPublish }),
    });
  }

  async getRagIndexStatus(): Promise<RagIndexStatus> {
    const rag = await this._getRagService();
    return rag?.getIndexStatus() ?? DEFAULT_RAG_INDEX_STATUS;
  }

  async verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult> {
    this.recordOwnerActivity();
    if (!this._taskStore) {
      throw new Error("Task store not initialized — node is not fully wired");
    }
    const config = await this.getNodeConfig();
    const taskStore = this._taskStore;
    return verifyVaultDocumentIpfsGateway({
      vaultDir: this._vaultDir,
      profileDir: this._profileDir,
      documentId: params.documentId,
      allowIpfs: config.externalPublish?.allowIpfs ?? false,
      gatewayAllowlist: config.externalPublish?.gatewayAllowlist,
      gatewayUrl: params.gatewayUrl,
      appendAudit: (event) => taskStore.appendAuditEvent(event),
    });
  }

  async importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult> {
    this.recordOwnerActivity();
    const norm = params.relativePath.trim().replace(/^[\\/]+/, "");
    if (!norm || norm.includes("..") || norm.includes("~")) {
      throw new Error("Invalid vault path");
    }
    const abs = resolve(this._vaultDir, norm);
    assertPathInsideVault(this._vaultDir, abs);
    const bytes = Buffer.from(params.contentBase64, "base64");
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, bytes, { mode: 0o600 });
    const index = await buildVaultIndex({ rootDir: this._vaultDir });
    const doc = index.documents.find((d) => d.relativePath === norm);
    if (!doc) {
      throw new Error(`Imported file not indexed: ${norm}`);
    }
    return {
      documentId: doc.documentId,
      relativePath: doc.relativePath,
      sizeBytes: doc.byteLength,
    };
  }

  async resolveLibraryItemPath(relativePath: string): Promise<{ vaultRelativePath: string; absolutePath: string }> {
    const norm = relativePath.trim().replace(/^[\\/]+/, "");
    if (!isSafeVaultPath(this._vaultDir, norm)) {
      throw new Error("Invalid vault path");
    }
    const absolutePath = resolve(this._vaultDir, norm);
    assertPathInsideVault(this._vaultDir, absolutePath);
    await stat(absolutePath).catch(() => {
      throw new Error("File not found in vault");
    });
    return { vaultRelativePath: norm, absolutePath };
  }

  async openLibraryItem(relativePath: string): Promise<void> {
    const { absolutePath } = await this.resolveLibraryItemPath(relativePath);
    await openPathWithDefaultApp(absolutePath);
  }

  async revealLibraryItemInFileManager(relativePath: string): Promise<void> {
    const { absolutePath } = await this.resolveLibraryItemPath(relativePath);
    await revealPathInFileManager(absolutePath);
  }

  async discoverPublishedLibrary(params?: DiscoverPublishedLibraryParams): Promise<DiscoverPublishedLibraryPeerResult[]> {
    this._assertOnline();
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();

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
        const { transportPeerId, recipientEnvelopePeerId, listenAddrs } = await this._resolvePeerTransportForOwner(
          bond.peerOwnerId,
        );
        const dialHints = await raceWithTimeout(
          this._dialHintsForChat(transportPeerId, listenAddrs),
          30_000,
          "_dialHintsForChat",
        );
        const unsigned = createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: recipientEnvelopePeerId,
          recipientRole: "human",
          intent: "discovery.request",
          payload: createDiscoveryRequestPayload({
            requesterOwnerId: profile.owner.ownerId,
            requestedTagHashes: [],
            requestedCapabilities: [PUBLISHED_LIB_CAPABILITY],
            maxResults,
            requestedSensitivity: "public",
            fileTitleQuery: params?.fileTitleQuery,
            requestedContentHashPrefixes: params?.contentHashPrefix ? [params.contentHashPrefix] : undefined,
          }),
          correlationId: randomUUID(),
        });
        const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
        const reply = await mesh.sendExpectReply(transportPeerId, envelope, { timeoutMs, dialHints });
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

  async listAgentShareProposals(): Promise<AgentShareProposal[]> {
    return this._getAgentShareProposalStore().list();
  }

  async dismissAgentShareProposal(proposalId: string): Promise<void> {
    await this._getAgentShareProposalStore().remove(proposalId);
  }

  async submitAgentShareProposal(params: SubmitAgentShareProposalParams): Promise<AgentShareProposal> {
    const proposal: AgentShareProposal = {
      proposalId: randomUUID(),
      createdAt: new Date().toISOString(),
      targetOwnerId: params.targetOwnerId.trim(),
      vaultRelativePath: params.vaultRelativePath.replace(/^[\\/]+/, ""),
      sensitivity: params.sensitivity,
      summary: params.summary?.trim() || undefined,
    };
    await this._getAgentShareProposalStore().upsert(proposal);
    this.emit("share:agent-proposed", proposal);
    return proposal;
  }

  private _getAgentShareProposalStore(): ReturnType<typeof createAgentShareProposalStore> {
    if (!this._agentShareProposalStore) {
      this._agentShareProposalStore = createAgentShareProposalStore(this._profileDir);
    }
    return this._agentShareProposalStore;
  }

  async listPendingShareOffers(): Promise<ShareOffer[]> {
    return [...this._pendingInboundShareOffers.values()];
  }

  async shareFile(
    targetOwnerId: string,
    file: {
      path: string;
      sensitivity: "public" | "friends" | "private";
      deliveryChannel?: "inbox" | "chat";
    },
  ): Promise<void> {
    await this._shareFileInternal(targetOwnerId, file);
  }

  /**
   * Request a file from a bonded peer's vault (pull share — `fileOrigin: responder`).
   */
  async requestShareFromLibrary(
    targetOwnerId: string,
    file: {
      relativePath: string;
      sensitivity: "public" | "friends" | "private";
      correlationId?: string;
    },
  ): Promise<{ shareRequestMessageId: string }> {
    return this._requestShareFromLibraryInternal(targetOwnerId, file);
  }

  private async _requestShareFromLibraryInternal(
    targetOwnerId: string,
    file: {
      relativePath: string;
      sensitivity: "public" | "friends" | "private";
      correlationId?: string;
    },
  ): Promise<{ shareRequestMessageId: string }> {
    this._assertOnline();
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
    if (!this._taskStore) {
      throw new Error("Task store not initialized — node is not fully wired");
    }

    const { transportPeerId, recipientEnvelopePeerId } =
      await this._resolvePeerTransportForOwner(targetOwnerId);
    const peerPath = file.relativePath.replace(/^[\\/]+/, "");
    const dialHints = await raceWithTimeout(
      this._dialHintsForChat(transportPeerId, undefined),
      30_000,
      "_dialHintsForChat",
    );

    const correlationId = file.correlationId ?? randomUUID();
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "share.request",
      payload: createShareRequestPayload({
        requestType: "file",
        relativePath: peerPath,
        requestedSensitivity: file.sensitivity,
        fileOrigin: "responder",
        deliveryChannel: "inbox",
        correlationId,
      }),
      correlationId,
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;
    this._pendingPullShareByRequestMsgId.set(envelope.messageId, {
      peerRelativePath: peerPath,
      targetOwnerId,
      toPeerId: transportPeerId,
      sensitivity: file.sensitivity,
    });
    this._correlationByRequestMsgId.set(envelope.messageId, correlationId);
    await mesh.send(transportPeerId, envelope as any, { dialHints });
    this._upsertTransferStatus({
      correlationId,
      phase: "negotiating",
      remotePeerOwnerId: targetOwnerId,
      remotePeerId: transportPeerId,
      vaultRelativePath: peerPath,
      updatedAt: new Date().toISOString(),
    });
    return { shareRequestMessageId: envelope.messageId };
  }

  private async _shareFileInternal(
    targetOwnerId: string,
    file: {
      path: string;
      sensitivity: "public" | "friends" | "private";
      deliveryChannel?: "inbox" | "chat";
      chatRoomId?: string;
      chatMessageId?: string;
      chatAttachmentId?: string;
    },
  ): Promise<{ shareRequestMessageId: string }> {
    this._assertOnline();
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
    if (!this._taskStore) {
      throw new Error("Task store not initialized — node is not fully wired");
    }

    let targetPeer: Awaited<ReturnType<LocalPeerDirectoryStore["getPeerByOwnerId"]>>;
    try {
      targetPeer = await raceWithTimeout(
        this._peerDirectoryStore.getPeerByOwnerId(targetOwnerId),
        25_000,
        "getPeerByOwnerId",
      );
    } catch (err) {
      throw err;
    }
    if (!targetPeer) {
      const records = await raceWithTimeout(
        this._peerDirectoryStore.listPeerRecords(),
        25_000,
        "listPeerRecords",
      );
      targetPeer =
        records.find((r) => r.ownerId === targetOwnerId) ??
        records.find((r) => r.peerId === targetOwnerId) ??
        undefined;
    }
    if (!targetPeer?.peerId) {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }
    const transportPeerId = targetPeer.peerId;
    if (transportPeerId.startsWith("envoy_")) {
      throw new Error(
        `Peer directory has Envoy envelope id for this owner (not libp2p).`,
      );
    }
    const recipientEnvelopePeerId = targetPeer.devicePublicKeyPem
      ? derivePeerId(targetPeer.devicePublicKeyPem)
      : targetOwnerId.startsWith("envoy_")
        ? targetOwnerId
        : undefined;

    const norm = file.path.replace(/^[\\/]+/, "");
    if (!isSafeVaultPath(this._vaultDir, norm)) {
      throw new Error("Invalid vault path");
    }
    await stat(join(this._vaultDir, norm)).catch(() => {
      throw new Error("File not found in vault");
    });

    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(transportPeerId, targetPeer.listenAddrs),
        30_000,
        "_dialHintsForChat",
      );
    } catch (err) {
      throw err;
    }

    const correlationId = randomUUID();
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "share.request",
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
      correlationId,
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;
    await mesh.send(transportPeerId, envelope as any, { dialHints });
    this._pendingPushShareByRequestMsgId.set(envelope.messageId, {
      relativePath: norm,
      toPeerId: transportPeerId,
      deliveryChannel: file.deliveryChannel ?? "inbox",
    });
    this._correlationByRequestMsgId.set(envelope.messageId, correlationId);
    this._upsertTransferStatus({
      correlationId,
      phase: "negotiating",
      remotePeerOwnerId: targetOwnerId,
      remotePeerId: transportPeerId,
      vaultRelativePath: norm,
      updatedAt: new Date().toISOString(),
    });
    return { shareRequestMessageId: envelope.messageId };
  }

  /** Auto-accept chat-channel file shares from bonded contacts (skip Inbox). */
  async maybeAutoAcceptChatShare(input: {
    shareId: string;
    senderOwnerId?: string;
    senderRelativePath: string;
    requiresApproval: boolean;
  }): Promise<void> {
    if (!input.senderOwnerId?.trim()) {
      return;
    }
    const trust = await this._trustStore.getTrustRecord(input.senderOwnerId);
    const level = trust?.level;
    if (!level || level === "blocked" || level === "public") {
      return;
    }
    if (input.requiresApproval) {
      return;
    }
    const savePath = chatInboundVaultPath(input.senderOwnerId, input.senderRelativePath);
    try {
      await this.acceptShare(input.shareId, savePath);
    } catch (err) {
      console.warn(
        `[chat-attachment] auto-accept failed for ${input.shareId.slice(0, 12)}…:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  async acceptShare(shareId: string, savePath: string): Promise<void> {
    this._assertOnline();
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
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
      if (!isSafeVaultPath(this._vaultDir, saveNorm)) {
        throw new Error("Invalid save path");
      }
      this._pendingDataTransferSavePath.set(`${offer.senderNodeId}\n${srcKey}`, saveNorm);
    }

    const records = await this._peerDirectoryStore.listPeerRecords();
    const rec = records.find((r) => r.peerId === offer.senderNodeId);
    const senderOwnerId = offer.senderOwnerId ?? rec?.ownerId;

    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(offer.senderNodeId, rec?.listenAddrs),
        30_000,
        "_dialHintsForChat",
      );
    } catch (err) {
      throw err;
    }
    const recipientEnvelopePeerId = rec?.devicePublicKeyPem
      ? derivePeerId(rec.devicePublicKeyPem)
      : undefined;

    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "share.accept",
      payload: createShareAcceptPayload({ inReplyTo: shareId, accept: true }),
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;
    await mesh.send(offer.senderNodeId, envelope as any, { dialHints });
    void this._tagBondedContactReachability(offer.senderNodeId);
    this._correlationByPreviewMsgId.set(shareId, shareId);
    this._inboundTransferByShareId.set(shareId, {
      senderNodeId: offer.senderNodeId,
      senderVaultRelativePath: srcKey,
      savePath: saveNorm || srcKey || offer.filename,
      senderOwnerId,
      chatRoomId: offer.chatRoomId,
      chatMessageId: offer.chatMessageId,
      chatAttachmentId: offer.chatAttachmentId,
    });
    this._upsertTransferStatus({
      correlationId: shareId,
      phase: "negotiating",
      remotePeerId: offer.senderNodeId,
      remotePeerOwnerId: senderOwnerId,
      vaultRelativePath: saveNorm || srcKey || offer.filename,
      updatedAt: new Date().toISOString(),
    });
    this._pendingInboundShareOffers.delete(shareId);
    const emitPath = saveNorm || srcKey || offer.filename;
    this.emit("share:accepted", { shareId, savePath: emitPath });
  }

  async declineShare(shareId: string): Promise<void> {
    this._assertOnline();
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
    const offer = this._pendingInboundShareOffers.get(shareId);
    if (!offer) {
      throw new Error(`No pending share offer for id=${shareId}`);
    }
    const records = await this._peerDirectoryStore.listPeerRecords();
    const rec = records.find((r) => r.peerId === offer.senderNodeId);
    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(offer.senderNodeId, rec?.listenAddrs),
        30_000,
        "_dialHintsForChat",
      );
    } catch (err) {
      throw err;
    }
    const recipientEnvelopePeerId = rec?.devicePublicKeyPem
      ? derivePeerId(rec.devicePublicKeyPem)
      : undefined;
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "share.accept",
      payload: createShareAcceptPayload({ inReplyTo: shareId, accept: false }),
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;
    await mesh.send(offer.senderNodeId, envelope as any, { dialHints });
    this._pendingInboundShareOffers.delete(shareId);
    this.emit("share:declined", { shareId });
  }

  // ============================================
  // Node Configuration
  // ============================================

  async getNodeConfig(): Promise<NodeConfig> {
    const config = await this._configStore.load();
    // Apply environment variable overrides for model providers
    const modelProviders: ModelProviderConfig = config?.modelProviders ? {
      ...config.modelProviders,
      mode: (process.env.ENVOY_MODEL_MODE as ModelProviderConfig["mode"]) ?? config.modelProviders.mode,
      endpoint: process.env.ENVOY_MODEL_ENDPOINT ?? config.modelProviders.endpoint,
      apiKey: process.env.ENVOY_MODEL_API_KEY ?? config.modelProviders.apiKey,
      modelName: process.env.ENVOY_MODEL_NAME ?? config.modelProviders.modelName,
    } : {
      mode: (process.env.ENVOY_MODEL_MODE as ModelProviderConfig["mode"]) ?? "disabled",
      endpoint: process.env.ENVOY_MODEL_ENDPOINT,
      apiKey: process.env.ENVOY_MODEL_API_KEY,
      modelName: process.env.ENVOY_MODEL_NAME,
    };

    if (config) {
      return {
        profileDir: config.profileDir,
        discoveryProfile: config.discoveryProfile,
        enableMdns: resolveEnableMdns(config.discoveryProfile, config.enableMdns),
        relayEnabled: config.relayEnabled,
        relayServerEnabled: config.relayServerEnabled,
        configuredRelays: config.configuredRelays,
        advertiseAddrs: config.advertiseAddrs,
        bootstrapPeers: config.bootstrapPeers,
        bootstrapPresets: config.bootstrapPresets,
        modelProviders,
        terminalAssistModelName: config.terminalAssistModelName,
        terminalCommandAllowPatterns: config.terminalCommandAllowPatterns,
        terminalCommandDenyPatterns: config.terminalCommandDenyPatterns,
        terminalCommandDestructivePatterns: config.terminalCommandDestructivePatterns,
        terminalAgentModeDefault: config.terminalAgentModeDefault,
        terminalAutoRunPolicy: config.terminalAutoRunPolicy,
        terminalInlineSuggestEnabled: config.terminalInlineSuggestEnabled,
        terminalXtermSlashIntercept: config.terminalXtermSlashIntercept,
        chatAssistEnabled: config.chatAssistEnabled ?? false,
        anonymousDiscoveryMode: config.anonymousDiscoveryMode ?? "off",
        anonymousIntentAllowlist: config.anonymousIntentAllowlist ?? ["discovery.request"],
        anonymousSensitivityCeiling: config.anonymousSensitivityCeiling ?? "public",
        trustAnchorPublicKeys: config.trustAnchorPublicKeys ?? {},
        autonomousKillSwitch: config.autonomousKillSwitch ?? false,
        autonomousPolicies: config.autonomousPolicies ?? [],
        aiSettings: config.aiSettings,
        contactAiPreferences: config.contactAiPreferences ?? [],
         bridgeStatus: this._bridgeStatus ?? undefined,
         skillApiKeys: await this._loadBridgeConfigSkillApiKeys(),
         webSearchEnabled: await this._loadBridgeConfigWebSearchEnabled(),
         companionPairingAutoAcceptWithToken: config.companionPairingAutoAcceptWithToken ?? false,
        relayPublicWsUrl: config.relayPublicWsUrl ?? this._relayPublicWsUrl,
        bridgeEnabled: config.bridgeEnabled ?? true,
        homeClawCoreBaseUrl: config.homeClawCoreBaseUrl,
        trustModeEnabled: config.trustModeEnabled ?? false,
        friendMatchingPreferencesText: config.friendMatchingPreferencesText,
        friendMatchingPreferencesSigned: config.friendMatchingPreferencesSigned,
        externalPublish: config.externalPublish
          ? {
              allowIpfs: config.externalPublish.allowIpfs ?? false,
              gatewayAllowlist: config.externalPublish.gatewayAllowlist ?? [],
              ipfsExportEngine: normalizeIpfsExportEngineSelection(
                config.externalPublish.ipfsExportEngine,
              ),
              pinningEnabled: config.externalPublish.pinningEnabled ?? false,
              pinningProvider: config.externalPublish.pinningProvider ?? "pinata",
            }
          : { allowIpfs: false },
        maxConnections: config.maxConnections,
        mdnsIntervalMs: config.mdnsIntervalMs,
        capabilityDiscoveryIntervalMs: config.capabilityDiscoveryIntervalMs,
        lazyCapabilityDiscovery: resolveLazyCapabilityDiscovery(config.discoveryProfile, {
          lazyCapabilityDiscovery: config.lazyCapabilityDiscovery,
        }),
        idleTimerStretch: resolveIdleTimerStretch(config.discoveryProfile, {
          idleTimerStretch: config.idleTimerStretch,
        }),
        agentVisibility: config.agentVisibility,
        a2aChatNotifications: config.a2aChatNotifications ?? "off",
        agentInteractionMode: config.agentInteractionMode ?? "structured_preferred",
        friendAutopilotEnabled: config.friendAutopilotEnabled ?? false,
        friendAutopilotIntervalHours: (config.friendAutopilotIntervalHours ?? 0) as 0 | 24 | 168,
        friendAutopilotLastRunAt: config.friendAutopilotLastRunAt,
        knowledgeSyndicationMaxSensitivity: config.knowledgeSyndicationMaxSensitivity,
        socialProxyEnabled: config.socialProxyEnabled ?? false,
        socialProxyMandateId: config.socialProxyMandateId,
        socialProxyLastPassAt: config.socialProxyLastPassAt,
        documentAcquisitionEnabled: config.documentAcquisitionEnabled ?? false,
        documentAcquisitionMandateId: config.documentAcquisitionMandateId,
        capabilityProviderEnabled: config.capabilityProviderEnabled ?? false,
        capabilityProviderMandateId: config.capabilityProviderMandateId,
      };
    }
    return {
      profileDir: this._profileDir,
      discoveryProfile: "lan-fast" as const,
      enableMdns: true,
      relayEnabled: true,
      relayServerEnabled: false,
      configuredRelays: [],
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: [],
      modelProviders,
      chatAssistEnabled: false,
      anonymousDiscoveryMode: "off",
      anonymousIntentAllowlist: ["discovery.request"],
      anonymousSensitivityCeiling: "public",
      trustAnchorPublicKeys: {},
      autonomousKillSwitch: false,
      autonomousPolicies: [],
      contactAiPreferences: [],
      bridgeStatus: this._bridgeStatus ?? undefined,
      companionPairingAutoAcceptWithToken: false,
      relayPublicWsUrl: this._relayPublicWsUrl,
      bridgeEnabled: true,
      homeClawCoreBaseUrl: undefined,
      trustModeEnabled: false,
      friendMatchingPreferencesText: undefined,
      externalPublish: { allowIpfs: false },
      lazyCapabilityDiscovery: false,
      idleTimerStretch: false,
      a2aChatNotifications: "off",
      agentInteractionMode: "structured_preferred",
      friendAutopilotEnabled: false,
    };
  }

  async runCapabilityDiscovery(params?: { find?: boolean }): Promise<void> {
    this._assertOnline();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
    const config = (await this._configStore.load())!;
    const discoveryProfile = config.discoveryProfile;
    const runtime = resolveConnectivityRuntime({
      profile: discoveryProfile,
      enableMdns: config.enableMdns,
      tuning: {
        maxConnections: config.maxConnections,
        mdnsIntervalMs: config.mdnsIntervalMs,
        capabilityDiscoveryIntervalMs: config.capabilityDiscoveryIntervalMs,
        lazyCapabilityDiscovery: config.lazyCapabilityDiscovery,
        idleTimerStretch: config.idleTimerStretch,
      },
    });
    if (!this._taskStore || !this._discoverySeedStore) {
      throw new Error("Node stores not initialized");
    }
    const topics = buildAutoCapabilityTopics(profile.deviceCertificate.capabilities);
    await runCapabilityDiscoveryCycle({
      mesh,
      profile: discoveryProfile,
      topics,
      taskStore: this._taskStore,
      discoverySeedStore: this._discoverySeedStore,
      enableDht: runtime.enableDht,
      options: {
        source: "on-demand",
        runFind: params?.find !== false,
      },
    });
    recordMeshActivity();
  }

  async updateNodeConfig(config: Partial<NodeConfig>): Promise<void> {
    let validatedSigned: import("@envoymesh/protocol").FriendMatchingPreferencesPayload | undefined;
    if (config.friendMatchingPreferencesSigned !== undefined) {
      const profile = this._profile;
      if (!profile) {
        throw new Error("friendMatchingPreferencesSigned: node profile not initialized");
      }
      const parsed = parseFriendMatchingPreferencesPayload(config.friendMatchingPreferencesSigned);
      const expMs = new Date(parsed.expiresAt).getTime();
      if (!Number.isFinite(expMs) || expMs <= Date.now()) {
        throw new Error("friendMatchingPreferencesSigned: expiresAt must be in the future");
      }
      if (parsed.ownerId !== profile.owner.ownerId) {
        throw new Error("friendMatchingPreferencesSigned: ownerId does not match local owner");
      }
      if (!verifyFriendMatchingPreferences(parsed, profile.owner.publicKeyPem)) {
        throw new Error("friendMatchingPreferencesSigned: invalid signature");
      }
      validatedSigned = parsed;
    }

    if (
      validatedSigned === undefined &&
      config.friendMatchingPreferencesText !== undefined &&
      config.friendMatchingPreferencesText.length > MAX_FRIEND_MATCHING_PREFS_CHARS
    ) {
      throw new Error(
        `friendMatchingPreferencesText exceeds ${MAX_FRIEND_MATCHING_PREFS_CHARS} characters (${config.friendMatchingPreferencesText.length})`,
      );
    }

    const current = (await this._configStore.load()) ?? {
      version: "0.1" as const,
      profileDir: this._profileDir,
      discoveryProfile: "lan-fast" as const,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [] as string[],
      bootstrapPeers: [] as string[],
      bootstrapPresets: [] as string[],
      configuredRelays: [],
      modelProviders: { mode: "disabled" as const },
      chatAssistEnabled: false,
      anonymousDiscoveryMode: "off",
      anonymousIntentAllowlist: ["discovery.request"],
      anonymousSensitivityCeiling: "public",
      autonomousKillSwitch: false,
      autonomousPolicies: [],
      contactAiPreferences: [],
      updatedAt: new Date().toISOString(),
    };

    const updated: PersistedNodeConfig = {
      ...current,
      ...(config.discoveryProfile && { discoveryProfile: config.discoveryProfile }),
      ...(config.enableMdns !== undefined && { enableMdns: config.enableMdns }),
      ...(config.relayEnabled !== undefined && { relayEnabled: config.relayEnabled }),
      ...(config.relayServerEnabled !== undefined && { relayServerEnabled: config.relayServerEnabled }),
      ...(config.advertiseAddrs !== undefined && { advertiseAddrs: config.advertiseAddrs }),
      ...(config.bootstrapPeers !== undefined && { bootstrapPeers: config.bootstrapPeers }),
      ...(config.bootstrapPresets !== undefined && { bootstrapPresets: config.bootstrapPresets }),
      ...(config.configuredRelays !== undefined && { configuredRelays: config.configuredRelays }),
      ...(config.modelProviders && { modelProviders: { ...current.modelProviders, ...config.modelProviders } }),
      ...(config.terminalAssistModelName !== undefined && {
        terminalAssistModelName: config.terminalAssistModelName,
      }),
      ...(config.terminalCommandAllowPatterns !== undefined && {
        terminalCommandAllowPatterns: config.terminalCommandAllowPatterns,
      }),
      ...(config.terminalCommandDenyPatterns !== undefined && {
        terminalCommandDenyPatterns: config.terminalCommandDenyPatterns,
      }),
      ...(config.terminalCommandDestructivePatterns !== undefined && {
        terminalCommandDestructivePatterns: config.terminalCommandDestructivePatterns,
      }),
      ...(config.terminalAgentModeDefault !== undefined && {
        terminalAgentModeDefault: config.terminalAgentModeDefault,
      }),
      ...(config.terminalAutoRunPolicy !== undefined && {
        terminalAutoRunPolicy: config.terminalAutoRunPolicy,
      }),
      ...(config.terminalInlineSuggestEnabled !== undefined && {
        terminalInlineSuggestEnabled: config.terminalInlineSuggestEnabled,
      }),
      ...(config.terminalXtermSlashIntercept !== undefined && {
        terminalXtermSlashIntercept: config.terminalXtermSlashIntercept,
      }),
      ...(config.chatAssistEnabled !== undefined && { chatAssistEnabled: config.chatAssistEnabled }),
      ...(config.anonymousDiscoveryMode !== undefined && { anonymousDiscoveryMode: config.anonymousDiscoveryMode }),
      ...(config.anonymousIntentAllowlist !== undefined && { anonymousIntentAllowlist: config.anonymousIntentAllowlist }),
      ...(config.anonymousSensitivityCeiling !== undefined && { anonymousSensitivityCeiling: config.anonymousSensitivityCeiling }),
      ...(config.trustAnchorPublicKeys !== undefined && { trustAnchorPublicKeys: config.trustAnchorPublicKeys }),
      ...(config.autonomousKillSwitch !== undefined && { autonomousKillSwitch: config.autonomousKillSwitch }),
      ...(config.autonomousPolicies !== undefined && { autonomousPolicies: config.autonomousPolicies }),
      ...(config.aiSettings !== undefined && { aiSettings: config.aiSettings }),
      ...(config.contactAiPreferences !== undefined && {
        contactAiPreferences: config.contactAiPreferences,
      }),
      ...(config.companionPairingAutoAcceptWithToken !== undefined && {
        companionPairingAutoAcceptWithToken: config.companionPairingAutoAcceptWithToken,
      }),
      ...(config.relayPublicWsUrl !== undefined && {
        relayPublicWsUrl: config.relayPublicWsUrl,
      }),
      ...(config.bridgeEnabled !== undefined && {
        bridgeEnabled: config.bridgeEnabled,
      }),
      ...(config.homeClawCoreBaseUrl !== undefined && {
        homeClawCoreBaseUrl: config.homeClawCoreBaseUrl,
      }),
      ...(config.agentVisibility !== undefined && { agentVisibility: config.agentVisibility }),
      ...(config.a2aChatNotifications !== undefined && {
        a2aChatNotifications: config.a2aChatNotifications,
      }),
      ...(config.agentInteractionMode !== undefined && {
        agentInteractionMode: config.agentInteractionMode,
      }),
      ...(config.trustModeEnabled !== undefined && { trustModeEnabled: config.trustModeEnabled }),
      ...(config.friendAutopilotEnabled !== undefined && {
        friendAutopilotEnabled: config.friendAutopilotEnabled,
      }),
      ...(config.friendAutopilotIntervalHours !== undefined && {
        friendAutopilotIntervalHours: config.friendAutopilotIntervalHours,
      }),
      ...(config.friendAutopilotLastRunAt !== undefined && {
        friendAutopilotLastRunAt: config.friendAutopilotLastRunAt,
      }),
      ...(Object.prototype.hasOwnProperty.call(config, "knowledgeSyndicationMaxSensitivity") && {
        knowledgeSyndicationMaxSensitivity:
          config.knowledgeSyndicationMaxSensitivity === null
            ? undefined
            : config.knowledgeSyndicationMaxSensitivity,
      }),
      ...(config.socialProxyEnabled !== undefined && {
        socialProxyEnabled: config.socialProxyEnabled,
      }),
      ...(config.socialProxyMandateId !== undefined && {
        socialProxyMandateId: config.socialProxyMandateId,
      }),
      ...(config.socialProxyLastPassAt !== undefined && {
        socialProxyLastPassAt: config.socialProxyLastPassAt,
      }),
      ...(config.documentAcquisitionEnabled !== undefined && {
        documentAcquisitionEnabled: config.documentAcquisitionEnabled,
      }),
      ...(config.documentAcquisitionMandateId !== undefined && {
        documentAcquisitionMandateId: config.documentAcquisitionMandateId,
      }),
      ...(config.capabilityProviderEnabled !== undefined && {
        capabilityProviderEnabled: config.capabilityProviderEnabled,
      }),
      ...(config.capabilityProviderMandateId !== undefined && {
        capabilityProviderMandateId: config.capabilityProviderMandateId,
      }),
      ...(config.externalPublish !== undefined && {
        externalPublish: {
          allowIpfs: config.externalPublish.allowIpfs ?? false,
          gatewayAllowlist: (config.externalPublish.gatewayAllowlist ?? [])
            .map((entry) => normalizeGatewayBaseUrl(entry))
            .filter(Boolean)
            .slice(0, 10),
          ipfsExportEngine: normalizeIpfsExportEngineSelection(
            config.externalPublish.ipfsExportEngine ??
              current.externalPublish?.ipfsExportEngine ??
              "kubo",
          ),
          pinningEnabled: config.externalPublish.pinningEnabled ?? false,
          pinningProvider:
            config.externalPublish.pinningProvider ??
            current.externalPublish?.pinningProvider ??
            "pinata",
        },
      }),
      ...(validatedSigned !== undefined && {
        friendMatchingPreferencesSigned: validatedSigned,
        friendMatchingPreferencesText: validatedSigned.text.trim(),
      }),
      ...(validatedSigned === undefined &&
        config.friendMatchingPreferencesText !== undefined && {
          friendMatchingPreferencesText:
            config.friendMatchingPreferencesText.trim().length === 0
              ? undefined
              : config.friendMatchingPreferencesText.trim(),
          /** Plain-text edits replace owner-signed prefs so UI and crypto-backed doc cannot drift. */
          friendMatchingPreferencesSigned: undefined,
        }),
      updatedAt: new Date().toISOString(),
    };

    if (config.relayPublicWsUrl !== undefined) {
      // empty string = explicitly disabled; any other value = explicit URL
      this._relayPublicWsUrl = config.relayPublicWsUrl;
    }

    if (updated.discoveryProfile === "contacts-only" || updated.discoveryProfile === "relay-only") {
      updated.bootstrapPresets = normalizeBootstrapPresetsForContactsOnly(updated.bootstrapPresets);
    }

    const tuningPatch = clampConnectivityTuningInput({
      maxConnections: config.maxConnections,
      mdnsIntervalMs: config.mdnsIntervalMs,
      capabilityDiscoveryIntervalMs: config.capabilityDiscoveryIntervalMs,
      lazyCapabilityDiscovery: config.lazyCapabilityDiscovery,
      idleTimerStretch: config.idleTimerStretch,
    });
    Object.assign(updated, tuningPatch);

    await this._configStore.save(updated);
    this.emit("node:status", {
      status: this._nodeStatus,
      peerId: this._mesh?.peerId,
    });
    // Emit config:updated so listeners can refresh cached config values
    this.emit("config:updated", {
      autonomousKillSwitch: updated.autonomousKillSwitch ?? false,
      autonomousPolicies: updated.autonomousPolicies ?? [],
      chatAssistEnabled: updated.chatAssistEnabled ?? false,
      modelProviders: updated.modelProviders,
      aiSettings: updated.aiSettings,
      contactAiPreferences: updated.contactAiPreferences ?? [],
    });
  }

  async listRelays(): Promise<RelayConfig[]> {
    const config = await this._configStore.load();
    return config?.configuredRelays ?? [];
  }

  async getChatDrafts(threadPeerOwnerId?: string): Promise<Array<{ draftId: string; threadPeerOwnerId: string; inReplyToMessageId: string; text: string; createdAt: string }>> {
    if (!this._chatDraftStore) return [];
    if (threadPeerOwnerId) {
      return this._chatDraftStore.listByThread(threadPeerOwnerId);
    }
    return this._chatDraftStore.listAll();
  }

  async deleteChatDraft(draftId: string): Promise<void> {
    if (!this._chatDraftStore) return;
    await this._chatDraftStore.delete(draftId);
  }

  // ============================================
  // Capability Manifest
  // ============================================

  async getCapabilityManifest(): Promise<import("@envoymesh/api").CapabilityManifest | undefined> {
    if (!this._capabilityManifestStore) return undefined;
    return this._capabilityManifestStore.loadManifest();
  }

  async updateCapabilityManifest(params: {
    visibility?: import("@envoymesh/api").ManifestVisibility;
    sensitivityCeiling?: "public" | "friends" | "private";
    keywords?: string[];
    capabilities?: string[];
    description?: string;
  }): Promise<import("@envoymesh/api").CapabilityManifest> {
    if (!this._capabilityManifestStore) {
      throw new Error("Capability manifest store not available");
    }
    const existing = await this._capabilityManifestStore.loadManifest();
    if (existing) {
      const updated: import("@envoymesh/local-store").CapabilityManifest = {
        ...existing,
        ...(params.visibility !== undefined && { visibility: params.visibility }),
        ...(params.sensitivityCeiling !== undefined && { sensitivityCeiling: params.sensitivityCeiling }),
        ...(params.keywords !== undefined && { keywords: params.keywords }),
        ...(params.capabilities !== undefined && { capabilities: params.capabilities }),
        ...(params.description !== undefined && { description: params.description }),
        updatedAt: new Date().toISOString(),
      };
      await this._capabilityManifestStore.saveManifest(updated);
      return updated as import("@envoymesh/api").CapabilityManifest;
    }
    return this._capabilityManifestStore.createDefaultManifest(params);
  }

  async addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig> {
    const config = (await this._configStore.load()) ?? {
      version: "0.1" as const,
      profileDir: this._profileDir,
      discoveryProfile: "lan-fast" as const,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [] as string[],
      bootstrapPeers: [] as string[],
      bootstrapPresets: [] as string[],
      configuredRelays: [],
      modelProviders: { mode: "disabled" as const },
      chatAssistEnabled: false,
      autonomousKillSwitch: false,
      autonomousPolicies: [],
      contactAiPreferences: [],
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
    console.log(`[node-service] initNode called: profileDir=${profileDir}, options=`, options);
    // Create profile directory structure
    const profile = await loadOrCreateNodeProfile(profileDir);

    // Write persisted config
    const config: PersistedNodeConfig = {
      version: "0.1",
      profileDir,
      discoveryProfile: options?.discoveryProfile ?? "lan-fast",
      relayEnabled: options?.relayEnabled ?? true,
      relayServerEnabled: options?.relayServerEnabled ?? false,
      advertiseAddrs: options?.advertiseAddrs ?? [],
      bootstrapPeers: options?.bootstrapPeers ?? [],
      bootstrapPresets:
        options?.bootstrapPresets ??
        [...defaultBootstrapPresetsForDiscoveryProfile(options?.discoveryProfile ?? "lan-fast")],
      configuredRelays: [],
      modelProviders: { mode: "disabled" },
      chatAssistEnabled: false,
      autonomousKillSwitch: false,
      autonomousPolicies: [],
      contactAiPreferences: [],
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

  /**
   * Load profile + task store from persisted config when missing (Envoy-managed path).
   * Safe to call when CLI already bound {@link bindCliTaskStore}.
   */
  private async _ensureAgentStores(): Promise<boolean> {
    const config = await this._configStore.load();
    if (!config?.profileDir) {
      return Boolean(this._profile && this._taskStore);
    }
    if (!this._profile) {
      this._profile = await loadOrCreateNodeProfile(config.profileDir);
    }
    if (!this._taskStore) {
      this._taskStore = createLocalTaskStore(config.profileDir);
    }
    return Boolean(this._profile && this._taskStore);
  }

  private async _requireToolExecutionContext(): Promise<MeshToolContext> {
    if (!(await this._ensureAgentStores())) {
      if (this._nodeStatus === "starting") {
        throw new Error("Node is still starting. Wait a moment and try again.");
      }
      if (this._nodeStatus === "offline") {
        throw new Error("Node is offline. Complete setup or start the node from Settings → Node.");
      }
      const config = await this._configStore.load();
      if (!config) {
        throw new Error("Node not set up. Finish Welcome setup or run the Envoy node app.");
      }
      throw new Error("Node not ready for Assistant. Start the node from Settings → Node.");
    }
    const context = await this.getToolExecutionContext();
    if (!context) {
      throw new Error("Could not initialize agent identity. Check Settings → Node.");
    }
    return context;
  }

  async startNode(): Promise<void> {
    if (this._nodeStatus === "running") {
      await this._ensureAgentStores();
      return;
    }

    if (this._nodeStatus === "starting") {
      throw new Error("Node is already starting");
    }

    try {
      const config = await this._configStore.load();
      if (!config) {
        throw new Error("No node config found. Call initNode() first.");
      }

      // Load stores before emitting "starting" so Assistant RPC cannot race an empty task store.
      this._profile = await loadOrCreateNodeProfile(config.profileDir);
      this._taskStore = createLocalTaskStore(config.profileDir);
      this._relayStateStore = createRelayStateStore(config.profileDir);
      this._discoverySeedStore = this._discoverySeedStore ?? createDiscoverySeedStore(config.profileDir);
      this._taskRuntimeStore = createTaskRuntimeStateStore(config.profileDir);
      this._inboundGuard = createInboundMessageGuard();
      this._taskDispatcher = createTaskDispatcher();

      // Phase 26: hydrate Phase 23/25/25D in-memory state from disk
      // (published library, intent history). Continuity sessions are loaded
      // lazily on each continuity method call (no in-memory cache needed).
      await this.loadPublishedLibraryFromDisk();
      await this.loadIntentHistoryFromDisk();

      this._nodeStatus = "starting";
      this.emit("node:status", { status: this._nodeStatus });

      // Compute effective bootstrap peers
      // Must resolve bootstrapPresets to actual multiaddresses for mesh connectivity
      const peerRecords = await this._peerDirectoryStore.listPeerRecords();
      const peerDirAddrCount = peerRecords.reduce((n, r) => n + r.listenAddrs.length, 0);
      const seedAddrs = seedAddrsForDiscoveryProfile(
        config.discoveryProfile,
        await this._discoverySeedStore.listSeedRecords(),
      );

      // Resolve bootstrap presets to actual multiaddresses
      const resolvedPresetAddrs: string[] = [];
      if (config.bootstrapPresets && config.bootstrapPresets.length > 0) {
        console.log(`[node-service] Resolving ${config.bootstrapPresets.length} bootstrap presets: ${config.bootstrapPresets.join(", ")}`);
        const resolvedResults = await resolveBootstrapAddresses(config.bootstrapPresets);
        for (const result of resolvedResults) {
          resolvedPresetAddrs.push(...result.resolved);
          if (result.resolved.length === 0) {
            console.warn(`[node-service] WARNING: Preset ${result.original} resolved to 0 addresses (using as-is)`);
          }
          console.log(`[node-service] Preset ${result.original} → ${result.resolved.length} addresses: ${result.resolved.join(", ")}`);
        }
      }

      const rawBootstrapAddrs = [...config.bootstrapPeers, ...resolvedPresetAddrs, ...seedAddrs].filter(
        (addr): addr is string =>
          typeof addr === "string" && addr.trim().length > 0 && addr.startsWith("/"),
      );
      const bootstrapPeers = filterBootstrapMultiaddrs([...new Set(rawBootstrapAddrs)]);
      if (rawBootstrapAddrs.length !== bootstrapPeers.length || peerDirAddrCount > 0) {
        console.log(
          `[node-service] bootstrap addrs: kept=${bootstrapPeers.length} filtered=${rawBootstrapAddrs.length - bootstrapPeers.length} peer-dir-skipped=${peerDirAddrCount} (contact listen addrs use dial hints only)`,
        );
      }

      console.log(`[node-service] Bootstrap peers resolved: ${bootstrapPeers.length} addresses`);
      for (const bp of bootstrapPeers) {
        console.log(`  - ${bp}`);
      }

      // Create EnvoyMesh
      // DHT is always enabled when using wan-default discovery profile (for topic-based peer discovery)
      // Bootstrap presets affect peer connectivity, not DHT availability
      console.log(`[node-service] DHT configuration: discoveryProfile=${config.discoveryProfile}, bootstrapPresets=${config.bootstrapPresets?.length ?? 0}`);
      const connectivityRuntime = resolveConnectivityRuntime({
        profile: config.discoveryProfile,
        enableMdns: resolveEnableMdns(config.discoveryProfile, config.enableMdns),
        tuning: {
          maxConnections: config.maxConnections,
          mdnsIntervalMs: config.mdnsIntervalMs,
          capabilityDiscoveryIntervalMs: config.capabilityDiscoveryIntervalMs,
          lazyCapabilityDiscovery: config.lazyCapabilityDiscovery,
          idleTimerStretch: config.idleTimerStretch,
        },
      });
      console.log(`[node-service] Creating EnvoyMesh with enableDht=${connectivityRuntime.enableDht}`);
      console.log(`[node-service] config object:`, JSON.stringify({
        discoveryProfile: config.discoveryProfile,
        relayEnabled: config.relayEnabled,
        relayServerEnabled: config.relayServerEnabled,
        bootstrapPeers: config.bootstrapPeers,
        bootstrapPresets: config.bootstrapPresets,
        maxConnections: connectivityRuntime.maxConnections,
        lazyCapabilityDiscovery: connectivityRuntime.lazyCapabilityDiscovery,
      }));

      const meshOptions: EnvoyMeshOptions = {
        listen: ["/ip4/0.0.0.0/tcp/0"],
        advertiseAddrs: config.advertiseAddrs,
        enableMdns: connectivityRuntime.enableMdns,
        mdnsIntervalMs: connectivityRuntime.mdnsIntervalMs,
        enableDht: connectivityRuntime.enableDht,
        dhtClientMode: true,
        bootstrapPeers,
        enableRelay: config.relayEnabled,
        enableRelayServer: config.relayServerEnabled,
        enableAutoNat: true,
        enableDcutr: true,
        ...(connectivityRuntime.maxConnections != null
          ? { maxConnections: connectivityRuntime.maxConnections }
          : {}),
        libp2pPrivateKey: await loadOrCreateLibp2pPrivateKey(
          join(config.profileDir, "libp2p-private.key"),
        ),
      };

      this._mesh = new EnvoyMesh(meshOptions);

      // Wire mesh events
      this._wireMeshEvents();

      // Start mesh
      await this._mesh.start();
      this._lastNodeError = undefined;
      this._lastNodeErrorAt = undefined;

      void this._resyncBondedContactReachabilityTags();

      this._relayBootstrapPeers = bootstrapPeers;
      if (config.relayEnabled && this._inboundGuard && this._discoverySeedStore) {
        this._stopRelayClientScheduler?.();
        const relayDeps = {
          mesh: this._mesh,
          profile: this._profile!,
          bootstrapPeers,
          inboundGuard: this._inboundGuard,
          discoverySeedStore: this._discoverySeedStore,
        };
        await runRelayClientCycle(relayDeps);
        this._stopRelayClientScheduler = startRelayClientScheduler({
          ...relayDeps,
          intervalMs: DEFAULT_RELAY_CLIENT_CYCLE_INTERVAL_MS,
        });
      }

      if (this._taskStore && this._discoverySeedStore) {
        void this._runCapabilityDiscoveryCycle("startup", { connectivityRuntime });
        this._startCapabilityDiscoveryScheduler(connectivityRuntime);
      }

      this._nodeProcessStartedAtMs = Date.now();
      this._stopNodeStatsLogging?.();
      this._stopNodeStatsLogging = startNodeStatsInterval(this._mesh, {
        processStartedAtMs: this._nodeProcessStartedAtMs,
      });

      this._nodeStatus = "running";
      this.emit("node:status", { status: this._nodeStatus, peerId: this._mesh.peerId });
      this.emit("node:online", { peerId: this._mesh.peerId, multiaddrs: this._mesh.multiaddrs.map(a => a.toString()) });
      void this.refreshBondPeerProfiles().catch((err) => {
        console.warn("[profile] refreshBondPeerProfiles after node:online failed:", err);
      });
      this._startBondWarmInterval();

      // Wait longer for DHT to connect to bootstrap peers and stabilize routing table
      // DHT provide operations require the routing table to be populated
      this._advertiseInterestsStartupTimeout = setTimeout(() => {
        void this._advertiseInterestsIfPublic();
      }, 15000);
    } catch (error) {
      console.error("[node-service] startNode failed:", error);
      this._recordNodeError("startNode", error);
      if (this._advertiseInterestsStartupTimeout) {
        clearTimeout(this._advertiseInterestsStartupTimeout);
        this._advertiseInterestsStartupTimeout = undefined;
      }
      this._nodeStatus = "offline";
      this.emit("node:status", { status: this._nodeStatus });
      throw error;
    }
  }

  private _wireMeshEvents(): void {
    const mesh = this._mesh!;
    const profile = this._profile!;
    const taskStore = this._taskStore!;

    mesh.onMessage(async ({ envelope, remotePeerId, remoteAddr, replyWithEnvelope }) => {
      const guardDecision = this._inboundGuard!.inspect(envelope);
      if (guardDecision.action === "reject") return;

      // Emit raw envelope for remote P2P clients (e.g. mobile app) with own identity
      try {
        this.emit("p2p:envelope", { envelope: envelope as unknown as Record<string, unknown>, remotePeerId });
      } catch (_) {
        // ignore emit errors (e.g. no listeners)
      }

      const { intent } = envelope;

      if (
        intent === "social.intro.sync" ||
        intent === "social.intro.propose" ||
        intent === "social.intro.owner-ready"
      ) {
        const receivedAt = Date.now();
        const correlationId = deriveCorrelationIdFromEnvelope(envelope);
        const nodeCfg = await this.getNodeConfig();
        const intro = await handleInboundSocialIntroIntent({
          envelope,
          profile,
          remotePeerId,
          receivedAt,
          correlationId,
          taskStore,
          trustStore: this._trustStore,
          peerDirectoryStore: this._peerDirectoryStore,
          trustModeEnabled: nodeCfg.trustModeEnabled ?? false,
          onSocialIntroPropose: (data) => {
            this.storePendingSocialIntroProposal({ ...data, commitmentApproved: false });
          },
          onSocialIntroOwnerReady: (data) => {
            void this.handleSocialProxyPeerOwnerReady(data);
          },
        });
        if (!intro.ok) {
          console.warn(`[rejected social.intro] ${envelope.intent}: ${intro.reason}`);
        }
        return;
      }

      if (intent === "share.preview") {
        try {
          const previewPayload = parseSharePreviewPayload(envelope.payload);
          if (previewPayload.isFileTransfer && !previewPayload.refused) {
            const recorded = this.recordInboundPullSharePreview({
              previewMessageId: envelope.messageId,
              inReplyToRequestMsgId: previewPayload.inReplyTo,
              senderPeerId: remotePeerId,
              previewText: previewPayload.previewText,
              sensitivity: previewPayload.sensitivity as "public" | "friends" | "private",
            });
            if (!recorded) {
              this.linkOutboundSharePreviewFromInbound(envelope.messageId, previewPayload.inReplyTo);
            }
          }
        } catch {
          /* ignore invalid preview */
        }
        return;
      }

      if (
        intent === "bond.request" ||
        intent === "bond.accept" ||
        intent === "bond.challenge" ||
        intent === "bond.challenge.response"
      ) {
        const receivedAt = Date.now();
        const correlationId = deriveCorrelationIdFromEnvelope(envelope);
        const bond = await handleInboundBondIntent(
          {
            envelope,
            profile,
            remotePeerId,
            receivedAt,
            correlationId,
            taskStore,
            trustStore: this._trustStore,
          },
          (helloData) => {
            this.storePendingHelloRequest(helloData);
            this.emit("hello:request", helloData);
          },
          async (bondData) => {
            this.emit("bond:established", bondData);
            void this._flushPendingRoomSyncs();
            void this._flushPendingRoomMessages();
            if (envelope.intent === "bond.request") {
              try {
                const payload = parseBondRequestPayload(envelope.payload);
                await this._peerDirectoryStore.ensurePeerFromInboundChat({
                  ownerId: payload.requesterOwnerId,
                  peerId: remotePeerId,
                  listenAddrs: remoteAddr?.trim()
                    ? filterUsableOutboundPeerDialHints([remoteAddr.trim()], remotePeerId)
                    : [],
                });
              } catch (err) {
                console.error(`[bond:established] failed to store peer in directory:`, err);
              }
            } else if (envelope.intent === "bond.accept") {
              try {
                const payload = parseBondAcceptPayload(envelope.payload);
                await this._peerDirectoryStore.ensurePeerFromInboundChat({
                  ownerId: payload.responderOwnerId,
                  peerId: remotePeerId,
                  listenAddrs: remoteAddr?.trim()
                    ? filterUsableOutboundPeerDialHints([remoteAddr.trim()], remotePeerId)
                    : [],
                });
              } catch (err) {
                console.error(`[bond:established] failed to store peer from bond.accept:`, err);
              }
            }
            void this._tagBondedContactReachability(remotePeerId);
          },
        );
        if (!bond.ok) {
          await taskStore.appendAuditEvent(
            createAuditEvent({
              type: "message.rejected",
              intent: envelope.intent,
              messageId: envelope.messageId,
              correlationId,
              remotePeerId,
              direction: "inbound",
              verificationStatus: "rejected",
              latencyMs: Date.now() - receivedAt,
              outcome: "deny",
              summary: `Rejected bond message: ${bond.reason}.`,
              createdAt: envelope.createdAt,
            }),
          );
          console.warn(`[rejected bond] ${envelope.intent}: ${bond.reason}`);
          return;
        }

        if (bond.bondAcceptToRequester) {
          const { requesterPeerId, requesterOwnerId } = bond.bondAcceptToRequester;
          const humanProfile = await this._humanProfileStore.loadHumanProfile();
          const displayName = humanProfile?.displayName ?? profile.owner.ownerId;
          const unsignedAccept = createUnsignedEnvelope({
            senderPeerId: derivePeerId(profile.device.publicKeyPem),
            senderPublicKey: profile.device.publicKeyPem,
            recipientPeerId: requesterPeerId,
            intent: "bond.accept",
            payload: createBondAcceptPayload({
              responderOwnerId: profile.owner.ownerId,
              requesterOwnerId,
              message: `Hello from ${displayName}!`,
            }),
            correlationId,
          });
          const signedAccept = signUnsignedEnvelope(unsignedAccept, profile.device.privateKeyPem);
          const requesterDir = await this._peerDirectoryStore.getPeerByOwnerId(requesterOwnerId);
          try {
            const autoHints = await buildOutboundDialHints({
              recipientPeerId: requesterPeerId,
              peerListenAddrs: requesterDir?.listenAddrs,
              discoverySeedStore: this._discoverySeedStore,
              config: await this._configStore.load(),
            });
            const latencyMs = await mesh.send(requesterPeerId, signedAccept, { dialHints: autoHints });
            await taskStore.appendAuditEvent(
              createAuditEvent({
                type: "message.sent",
                intent: signedAccept.intent,
                messageId: signedAccept.messageId,
                correlationId: signedAccept.correlationId,
                remotePeerId: requesterPeerId,
                direction: "outbound",
                latencyMs,
                protocol: ENVOY_MESSAGE_PROTOCOL,
                outcome: "record",
                summary: "Sent bond.accept to requester after auto-accept.",
                createdAt: signedAccept.createdAt,
              }),
            );
            void this._tagBondedContactReachability(requesterPeerId);
          } catch (err) {
            console.error(
              `[bond.request] auto-accept: failed to send bond.accept to requester ${requesterPeerId}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
        return;
      }

      if (intent === "chat.room.sync") {
        try {
          const payload = parseChatRoomSyncPayload(envelope.payload);
          await handleInboundChatRoomSyncImpl(this._chatRoomDeps(), envelope, payload);
        } catch {
          console.warn(`[chat.room.sync] invalid payload from ${remotePeerId}`);
        }
        return;
      }

      if (intent === "chat.room.message") {
        let roomPayload: ReturnType<typeof parseChatRoomMessagePayload>;
        try {
          roomPayload = parseChatRoomMessagePayload(envelope.payload);
          await handleInboundChatRoomMessageImpl(
            this._chatRoomDeps(),
            envelope,
            roomPayload,
            remotePeerId,
            this._roomDeliveryAck(replyWithEnvelope),
          );
        } catch {
          console.warn(`[chat.room.message] invalid payload from ${remotePeerId}`);
          return;
        }

        const selfOwnerId = this._profile?.owner.ownerId;
        if (
          selfOwnerId &&
          roomPayload.senderOwnerId !== selfOwnerId &&
          guardDecision.action === "allow" &&
          this._taskStore &&
          this._chatDraftStore &&
          this._profile
        ) {
          const receivedAt = Date.now();
          const correlationId = deriveCorrelationIdFromEnvelope(envelope);
          void this._configStore.load().then(async (config) => {
            if (!config || !this._taskStore || !this._chatDraftStore || !this._profile) {
              return;
            }
            const nodeConfig = await this.getNodeConfig();
            await runInboundChatAssist({
              envelope: guardDecision.envelope,
              senderOwnerId: roomPayload.senderOwnerId,
              chatText: roomPayload.text,
              remotePeerId,
              receivedAt,
              correlationId,
              config,
              modelProviders: nodeConfig.modelProviders,
              profile: this._profile,
              taskStore: this._taskStore,
              trustStore: this._trustStore,
              peerDirectoryStore: this._peerDirectoryStore,
              draftStore: this._chatDraftStore,
              chatLogStore: this._chatLogStore,
              humanProfileStore: this._humanProfileStore,
              agentIdentityStore: this._agentIdentityStore,
              vaultDir: this._vaultDir,
              styleAdapter: this._styleAdapter,
              sendChat: (targetOwnerId, text) => this.sendAgentChat(targetOwnerId, text),
              emitDraft: (threadPeerOwnerId, draft) => {
                this.emit("chat:draft", {
                  threadPeerOwnerId,
                  draft: { ...draft, threadPeerOwnerId },
                });
              },
              approvalQueue: this._approvalQueue,
              autoReplyLimitStore: this._autoReplyLimitStore,
              onAutoReplyPaused: (notification) => {
                this.emit("chat:auto-reply-paused", notification);
              },
              draftThreadKey: chatRoomThreadKey(roomPayload.roomId),
              disableAutoSend: true,
            });
          });
        }
        return;
      }

      if (intent === "chat.message") {
        let payload: ReturnType<typeof parseChatMessagePayload>;
        try {
          payload = parseChatMessagePayload(envelope.payload);
        } catch {
          console.warn(`[chat.message] invalid payload from ${remotePeerId}`);
          return;
        }

        const deviceAuth = await verifyInboundChatDevice(envelope, payload);
        if (!deviceAuth.ok) {
          console.warn(`[chat.message] rejected from ${remotePeerId}: ${deviceAuth.reason}`);
          return;
        }

        const senderTrust = await this._trustStore.getTrustRecord(payload.senderOwnerId);
        const selfHuman = await this._humanProfileStore.loadHumanProfile();
        void this._peerDirectoryStore
          .ensurePeerFromInboundChat({
            ownerId: payload.senderOwnerId,
            peerId: remotePeerId,
            listenAddrs: remoteAddr?.trim()
              ? filterUsableOutboundPeerDialHints([remoteAddr.trim()], remotePeerId)
              : [],
          })
          .catch((err) => console.warn(`[peer-directory] ensurePeerFromInboundChat failed:`, err));
        const incomingMsg: ChatMessage = {
          messageId: envelope.messageId,
          sender: {
            nodeId: remotePeerId,
            ownerId: payload.senderOwnerId,
            displayName: formatChatSenderDisplayName(
              senderTrust?.displayName ?? payload.senderOwnerId,
              payload,
            ),
            ...chatSenderActorFromEnvelope(
              envelope.senderRole,
              envelope.agentCredential,
              guardDecision.action === "allow",
            ),
          },
          recipient: {
            nodeId: mesh.peerId,
            ownerId: profile.owner.ownerId,
            displayName: selfHuman?.displayName ?? profile.owner.ownerId,
          },
          content: { text: stripModelThinking(payload.text) },
          metadata: { timestamp: envelope.createdAt, deliveryReceipt: "delivered" },
          signature: envelope.signature,
        };
        this._persistChatMessage(payload.senderOwnerId, incomingMsg);
        this.emit("chat:message", incomingMsg);
        if (replyWithEnvelope && envelope.senderPeerId?.trim()) {
          try {
            await replyWithEnvelope(
              buildSignedChatDeliveredEnvelope({
                profile,
                messageId: envelope.messageId,
                recipientOwnerId: profile.owner.ownerId,
                envelopeRecipientPeerId: envelope.senderPeerId,
                correlationId: envelope.correlationId,
              }),
            );
          } catch (err) {
            console.warn(`[chat.message] delivery ack failed:`, err);
          }
        }
        if (senderTrust && senderTrust.level !== "blocked") {
          void this._tagBondedContactReachability(remotePeerId);
        }
        if (
          this._taskStore &&
          this._chatDraftStore &&
          this._profile &&
          guardDecision.action === "allow"
        ) {
          const receivedAt = Date.now();
          const correlationId = deriveCorrelationIdFromEnvelope(envelope);
          void this._configStore.load().then(async (config) => {
            if (!config || !this._taskStore || !this._chatDraftStore || !this._profile) {
              return;
            }
            const nodeConfig = await this.getNodeConfig();
            await runInboundChatAssist({
              envelope: guardDecision.envelope,
              senderOwnerId: payload.senderOwnerId,
              chatText: payload.text,
              remotePeerId,
              receivedAt,
              correlationId,
              config,
              modelProviders: nodeConfig.modelProviders,
              profile: this._profile,
              taskStore: this._taskStore,
              trustStore: this._trustStore,
              peerDirectoryStore: this._peerDirectoryStore,
              draftStore: this._chatDraftStore,
              chatLogStore: this._chatLogStore,
              humanProfileStore: this._humanProfileStore,
              agentIdentityStore: this._agentIdentityStore,
              vaultDir: this._vaultDir,
              styleAdapter: this._styleAdapter,
              sendChat: (targetOwnerId, text) => this.sendAgentChat(targetOwnerId, text),
              emitDraft: (threadPeerOwnerId, draft) => {
                this.emit("chat:draft", {
                  threadPeerOwnerId,
                  draft: { ...draft, threadPeerOwnerId },
                });
              },
              approvalQueue: this._approvalQueue,
              autoReplyLimitStore: this._autoReplyLimitStore,
              onAutoReplyPaused: (notification) => {
                this.emit("chat:auto-reply-paused", notification);
              },
            });
          });
        }
      }
    });

    mesh.onPeerDiscovered(async ({ peerId, multiaddrs }) => {
      try {
        const config = await this._configStore.load();
        const discoveryProfile = config?.discoveryProfile ?? "wan-default";
        const source = peerDiscoverySourceFromMultiaddrs(multiaddrs);
        if (
          shouldPersistPeerDiscoverySeeds(discoveryProfile, source) &&
          multiaddrs.length > 0 &&
          this._discoverySeedStore
        ) {
          await this._discoverySeedStore.upsertMany(multiaddrs, "peer.discovery");
        }
        if (multiaddrs.length > 0) {
          await this._peerDirectoryStore.mergeListenAddrsForPeerId(peerId, multiaddrs);
        }
        // Note: Do NOT create peer directory records here from mDNS discovery.
        // mDNS only provides peerId + multiaddrs, not owner identity.
        // Peer directory records should only be created when we receive actual identity
        // info via system.signal, bond.request, or bond.accept handlers.
        // Creating a record here with ownerId=peerId would corrupt the directory because
        // later lookups by real ownerId wouldn't find the existing record.
        const mesh = this._mesh;
        const profile = this._profile;
        if (mesh && profile && peerId === mesh.peerId) {
          return;
        }
        const placeholder = {
          nodeId: peerId,
          ownerId: peerId,
          displayName: `Peer ${peerId.slice(0, 8)}`,
          username: undefined,
          bio: undefined,
          interests: [] as string[],
          profileVisibility: "public" as const,
        };
        this.emit("peer:discovered", placeholder);
        void this._probeNearbyPeerProfileAfterDiscovery(peerId, multiaddrs);
      } catch (err) {
        console.warn(`[node-service] Failed to process peer discovery for ${peerId}:`, err);
      }
    });
  }

  private async _runCapabilityDiscoveryCycle(
    source: "startup" | "periodic" | "on-demand",
    opts: { connectivityRuntime: ResolvedConnectivityRuntime; runFind?: boolean },
  ): Promise<void> {
    const mesh = this._mesh;
    const profile = this._profile;
    if (!mesh || !profile || !this._taskStore || !this._discoverySeedStore) {
      return;
    }
    const config = await this._configStore.load();
    if (!config) {
      return;
    }
    const { connectivityRuntime } = opts;
    const topics = buildAutoCapabilityTopics(profile.deviceCertificate.capabilities);
    await runCapabilityDiscoveryCycle({
      mesh,
      profile: config.discoveryProfile,
      topics,
      taskStore: this._taskStore,
      discoverySeedStore: this._discoverySeedStore,
      enableDht: connectivityRuntime.enableDht,
      options: {
        source,
        runFind:
          opts.runFind ??
          (source === "on-demand"
            ? true
            : shouldRunPeriodicCapabilityFind(connectivityRuntime)),
      },
    });
  }

  private _startCapabilityDiscoveryScheduler(connectivityRuntime: ResolvedConnectivityRuntime): void {
    if (this._capabilityDiscoveryTimer) {
      clearTimeout(this._capabilityDiscoveryTimer);
      this._capabilityDiscoveryTimer = undefined;
    }
    if (!connectivityRuntime.enableDht || !this._profile) {
      return;
    }
    const topics = buildAutoCapabilityTopics(this._profile.deviceCertificate.capabilities);
    if (topics.length === 0) {
      return;
    }

    const schedule = (): void => {
      const jitter = Math.floor(Math.random() * connectivityRuntime.capabilityDiscoveryJitterMs);
      this._capabilityDiscoveryTimer = setTimeout(() => {
        void this._runCapabilityDiscoveryCycle("periodic", { connectivityRuntime })
          .catch((err) => console.warn("[node-service] capability discovery cycle failed:", err))
          .finally(() => {
            if (this._mesh) {
              schedule();
            }
          });
      }, connectivityRuntime.capabilityDiscoveryIntervalMsEffective() + jitter);
    };
    schedule();
  }

  async stopNode(): Promise<void> {
    if (this._nodeStatus === "offline") {
      return;
    }

    this._nodeStatus = "stopping";
    this.emit("node:status", { status: this._nodeStatus });

    try {
      this._stopRelayClientScheduler?.();
      this._stopRelayClientScheduler = undefined;
      if (this._capabilityDiscoveryTimer) {
        clearTimeout(this._capabilityDiscoveryTimer);
        this._capabilityDiscoveryTimer = undefined;
      }
      this._stopNodeStatsLogging?.();
      this._stopNodeStatsLogging = undefined;
      if (this._bondWarmTimer) {
        clearInterval(this._bondWarmTimer);
        this._bondWarmTimer = undefined;
      }
      // Don't clear _relayBootstrapPeers — keep the last known relay list so
      // getPairingPayload() can still return useful fallback addresses if called
      // during a brief stop/start window (e.g. QR modal open during node restart).
      if (this._mesh) {
        await this._mesh.stop();
        this._mesh = undefined;
      }
      // Clear periodic re-advertisement timer
      if (this._advertiseInterestsTimer) {
        clearInterval(this._advertiseInterestsTimer);
        this._advertiseInterestsTimer = undefined;
      }
      // Clear startup timeout
      if (this._advertiseInterestsStartupTimeout) {
        clearTimeout(this._advertiseInterestsStartupTimeout);
        this._advertiseInterestsStartupTimeout = undefined;
      }
    } catch (error) {
      console.error("[node-service] Error stopping mesh:", error);
    }

    this._nodeStatus = "offline";
    this.emit("node:status", { status: this._nodeStatus });
    this.emit("node:offline", { peerId: this._profile?.device?.deviceId ?? "" });
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
    const diagnostics = {
      lastError: this._lastNodeError ?? undefined,
      lastErrorAt: this._lastNodeErrorAt ?? undefined,
    };
    const mesh = this._reachableMesh();
    if (!mesh || this._nodeStatus !== "running") {
      return {
        online: false,
        peerId: "",
        multiaddrs: [],
        connectedRelays: [],
        bondedPeers: 0,
        terminalsAvailable: Boolean(this._terminalManager),
        bootstrapPeers: this._relayBootstrapPeers,
        ...diagnostics,
      };
    }
    return {
      online: true,
      peerId: mesh.peerId,
      multiaddrs: mesh.multiaddrs,
      connectedRelays: mesh.getConnectionStats().circuitPeerIds,
      bondedPeers: 0,
      terminalsAvailable: Boolean(this._terminalManager),
      bootstrapPeers: this._relayBootstrapPeers,
      ...diagnostics,
    };
  }

  private _recordNodeError(context: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    this._lastNodeError = `${context}: ${msg}`;
    this._lastNodeErrorAt = new Date().toISOString();
  }

  setBridgeStatus(status: BridgeStatus): void {
    this._bridgeStatus = status;
    this.emit("bridge:status", status);
  }

  setBridgeChatHandler(handler: (envelope: EnvoyEnvelope, remotePeerId: string) => Promise<void>): void {
    this._bridgeChatHandler = handler;
  }

  setStyleAdapter(adapter: import("./style-adapter.js").StyleAdapter): void {
    this._styleAdapter = adapter;
  }

  /** Set the WebSocket server's listen port/path for pairing QR URL generation. */
  setWsListenAddress(port: number, path: string): void {
    this._wsPort = port;
    this._wsPath = path;
  }

  /** Wire Phase 30 terminal manager (desktop home node only). */
  setTerminalManager(manager: import("./terminal-manager.js").TerminalManager): void {
    this._terminalManager = manager;
  }

  /** Wire Phase 30I terminal agent assist (desktop home node only). */
  setTerminalAgentAssist(assist: import("./terminal-agent-assist.js").TerminalAgentAssist): void {
    this._terminalAgentAssist = assist;
  }

  emitTerminalSessionsUpdated(): void {
    if (!this._terminalManager) return;
    void this._emitTerminalSessionsUpdated();
  }

  private async _emitTerminalSessionsUpdated(): Promise<void> {
    if (!this._terminalManager) return;
    const sessions = await this.listTerminalSessions();
    this.emit("terminal:session-updated", { sessions });
  }

  private _maybeIngestTerminalAssistantReply(
    terminalSessionId: string | undefined,
    answer: string,
  ): void {
    const sessionId = terminalSessionId?.trim();
    if (!sessionId || !answer.trim()) return;
    const assist = this._terminalAgentAssist;
    const manager = this._terminalManager;
    if (!assist || !manager) return;
    const live = manager.listTerminalSessions().find((s) => s.sessionId === sessionId && s.state === "running");
    if (!live) return;
    void assist.ingestAssistantReply(sessionId, answer).then((proposal) => {
      if (proposal) {
        this.emit("terminal:assistant-proposal", { sessionId, proposal });
      }
    });
  }

  private _isOpenClawTurnInProgress(): boolean {
    return this._openClawAskInFlight > 0 || this._openclawActiveTurnTools !== null;
  }

  private async _enrichTerminalSessions(
    summaries: import("@envoymesh/api").TerminalSessionSummary[],
  ): Promise<import("@envoymesh/api").TerminalSessionSummary[]> {
    const { enrichTerminalSessionSummaries } = await import("./terminal-activity.js");
    const pendingApprovalCount = (await this.listPendingApprovals()).length;
    const manager = this._terminalManager!;
    return enrichTerminalSessionSummaries(
      summaries,
      (sessionId) => manager.getScrollbackTail(sessionId),
      {
        pendingApprovalCount,
        openClawTurnInProgress: this._isOpenClawTurnInProgress(),
      },
    );
  }

  private _requireTerminalManager(): import("./terminal-manager.js").TerminalManager {
    if (!this._terminalManager) {
      throw new Error("terminal.notAvailable");
    }
    return this._terminalManager;
  }

  private _requireTerminalAgentAssist(): import("./terminal-agent-assist.js").TerminalAgentAssist {
    if (!this._terminalAgentAssist) {
      throw new Error("terminal.agent.notAvailable");
    }
    return this._terminalAgentAssist;
  }

  listTerminalSessions(): Promise<import("@envoymesh/api").TerminalSessionSummary[]> {
    const summaries = this._requireTerminalManager().listTerminalSessions();
    return this._enrichTerminalSessions(summaries);
  }

  createTerminalSession(params?: import("@envoymesh/api").CreateTerminalSessionParams): Promise<import("@envoymesh/api").TerminalSessionSummary> {
    return this._requireTerminalManager().createTerminalSession(params);
  }

  closeTerminalSession(params: import("@envoymesh/api").CloseTerminalSessionParams): Promise<void> {
    return this._requireTerminalManager().closeTerminalSession(params);
  }

  renameTerminalSession(params: import("@envoymesh/api").RenameTerminalSessionParams): Promise<import("@envoymesh/api").TerminalSessionSummary> {
    return this._requireTerminalManager().renameTerminalSession(params);
  }

  terminalExec(params: { sessionId: string; command: string }): Promise<{ output: string }> {
    const mgr = this._requireTerminalManager();
    mgr.writeStdin(params.sessionId, Buffer.from(params.command + "\r", "utf8"));

    const maxWaitMs = 12_000;
    const pollIntervalMs = 200;
    const stableMs = 400;
    const startedAt = Date.now();
    let lastLen = mgr.getScrollback(params.sessionId).length;
    let stableSince = 0;

    return new Promise<{ output: string }>((resolve) => {
      const poll = () => {
        const currentBuf = mgr.getScrollback(params.sessionId);
        const elapsed = Date.now() - startedAt;
        if (currentBuf.length !== lastLen) {
          lastLen = currentBuf.length;
          stableSince = elapsed;
        }
        // Stabilised for 400 ms, or hit the 12 s ceiling.
        if (elapsed >= maxWaitMs || (elapsed - stableSince >= stableMs && elapsed > 800)) {
          // Return the last 128 KiB of the scrollback.
          const maxTail = 131_072;
          const tail = currentBuf.length > maxTail
            ? currentBuf.subarray(currentBuf.length - maxTail)
            : currentBuf;
          resolve({ output: tail.toString("utf8") });
          return;
        }
        setTimeout(poll, pollIntervalMs);
      };
      setTimeout(poll, pollIntervalMs);
    });
  }

  terminalAttach(params: import("@envoymesh/api").TerminalAttachParams): Promise<import("@envoymesh/api").TerminalAttachResult> {
    return Promise.resolve(this._requireTerminalManager().terminalAttach(params));
  }

  terminalRunFromNaturalLanguage(
    params: import("@envoymesh/api").TerminalRunFromNaturalLanguageParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal> {
    return this._requireTerminalAgentAssist().runFromNaturalLanguage(params);
  }

  terminalExecuteProposal(params: import("@envoymesh/api").TerminalExecuteProposalParams): Promise<void> {
    return this._requireTerminalAgentAssist().executeProposal(params);
  }

  terminalSetAssistModelOverride(
    params: import("@envoymesh/api").TerminalSetAssistModelOverrideParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._requireTerminalAgentAssist().setAssistModelOverride(params);
  }

  terminalGetAssistState(sessionId: string): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._requireTerminalAgentAssist().getAssistState(sessionId.trim());
  }

  terminalExplainScrollback(
    params: import("@envoymesh/api").TerminalExplainScrollbackParams,
  ): Promise<import("@envoymesh/api").TerminalExplainScrollbackResult> {
    return this._requireTerminalAgentAssist().explainScrollback(params);
  }

  terminalSuggestCommand(
    params: import("@envoymesh/api").TerminalSuggestCommandParams,
  ): Promise<import("@envoymesh/api").TerminalSuggestCommandResult> {
    return this._requireTerminalAgentAssist().suggestCommand(params);
  }

  terminalObserveStep(
    params: import("@envoymesh/api").TerminalObserveStepParams,
  ): Promise<import("@envoymesh/api").TerminalObserveStepResult> {
    return this._requireTerminalAgentAssist().observeStep(params);
  }

  terminalSetInlineSuggestEnabled(
    params: import("@envoymesh/api").TerminalSetInlineSuggestParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._requireTerminalAgentAssist().setInlineSuggestEnabled(params);
  }

  terminalOpenClawPlan(
    params: import("@envoymesh/api").TerminalOpenClawPlanParams,
  ): Promise<import("@envoymesh/api").TerminalOpenClawPlanResult> {
    return this._requireTerminalAgentAssist().openClawPlan(params);
  }

  terminalRunPlanStep(
    params: import("@envoymesh/api").TerminalRunPlanStepParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal> {
    return this._requireTerminalAgentAssist().runPlanStep(params);
  }

  terminalEnablePrepareMode(
    params: import("@envoymesh/api").TerminalEnablePrepareModeParams,
  ): Promise<import("@envoymesh/api").TerminalEnablePrepareModeResult> {
    return this._requireTerminalAgentAssist().enablePrepareMode(params);
  }

  terminalWatchStep(
    params: import("@envoymesh/api").TerminalWatchStepParams,
  ): Promise<import("@envoymesh/api").TerminalWatchStepResult> {
    return this._requireTerminalAgentAssist().watchStep(params);
  }

  terminalPinContextSession(
    params: import("@envoymesh/api").TerminalPinContextSessionParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._requireTerminalAgentAssist().pinContextSession(params);
  }

  terminalDetectFailure(
    params: import("@envoymesh/api").TerminalDetectFailureParams,
  ): Promise<import("@envoymesh/api").TerminalFailureDetection> {
    return this._requireTerminalAgentAssist().detectFailure(params);
  }

  terminalSuggestFixFromFailure(
    params: import("@envoymesh/api").TerminalSuggestFixParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal> {
    return this._requireTerminalAgentAssist().suggestFixFromFailure(params);
  }

  terminalStartGoalLoop(
    params: import("@envoymesh/api").TerminalStartGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult> {
    return this._requireTerminalAgentAssist().startGoalLoop(params);
  }

  terminalAdvanceGoalLoop(
    params: import("@envoymesh/api").TerminalAdvanceGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult> {
    return this._requireTerminalAgentAssist().advanceGoalLoop(params);
  }

  terminalCancelGoalLoop(
    params: import("@envoymesh/api").TerminalCancelGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._requireTerminalAgentAssist().cancelGoalLoop(params);
  }

  terminalClearResumeGoal(sessionId: string): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._requireTerminalAgentAssist().clearResumeGoal({ sessionId });
  }

  terminalSendContextToAssistant(
    params: import("@envoymesh/api").TerminalSendContextToAssistantParams,
  ): Promise<import("@envoymesh/api").TerminalSendContextToAssistantResult> {
    return this._requireTerminalAgentAssist().sendContextToAssistant(params);
  }

  terminalUpdatePlanProgress(
    params: import("@envoymesh/api").TerminalUpdatePlanProgressParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._requireTerminalAgentAssist().updatePlanProgress(params);
  }

  terminalGetScrollbackPreview(
    params: import("@envoymesh/api").TerminalGetScrollbackPreviewParams,
  ): Promise<import("@envoymesh/api").TerminalGetScrollbackPreviewResult> {
    return this._requireTerminalAgentAssist().getScrollbackPreview(params);
  }

  terminalResumeGoalLoop(
    params: import("@envoymesh/api").TerminalResumeGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult> {
    return this._requireTerminalAgentAssist().resumeGoalLoop(params);
  }

  terminalEnableExecPane(
    params: import("@envoymesh/api").TerminalEnableExecPaneParams,
  ): Promise<import("@envoymesh/api").TerminalEnableExecPaneResult> {
    return this._requireTerminalAgentAssist().enableExecPane(params);
  }

  terminalSetBackgroundWatch(
    params: import("@envoymesh/api").TerminalSetBackgroundWatchParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._requireTerminalAgentAssist().setBackgroundWatch(params);
  }

  terminalClearBackgroundWatch(
    params: import("@envoymesh/api").TerminalClearBackgroundWatchParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return this._requireTerminalAgentAssist().clearBackgroundWatch(params);
  }

  async openInHerdr(
    params?: import("@envoymesh/api").OpenInHerdrParams,
  ): Promise<import("@envoymesh/api").OpenInHerdrResult> {
    if (process.platform === "win32") {
      return { ok: false, reason: "herdr.unsupportedPlatform" };
    }
    let cwd: string;
    try {
      cwd = params?.cwd?.trim() || this._resolveOpenClawWorkspaceDir();
    } catch {
      return { ok: false, reason: "herdr.workspaceUnavailable" };
    }
    const { spawn } = await import("node:child_process");
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (result: import("@envoymesh/api").OpenInHerdrResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const child = spawn("herdr", [], {
        cwd,
        detached: true,
        stdio: "ignore",
      });
      child.once("error", () => finish({ ok: false, reason: "herdr.spawnFailed" }));
      child.unref();
      process.nextTick(() => {
        if (!settled) finish({ ok: true, cwd });
      });
    });
  }

  async terminalGetHerdrExportHint(
    params: import("@envoymesh/api").TerminalHerdrExportHintParams,
  ): Promise<import("@envoymesh/api").TerminalHerdrExportHintResult> {
    const sessionId = params.sessionId.trim();
    if (!sessionId) {
      throw new Error("terminal.sessionNotFound");
    }
    const manager = this._requireTerminalManager();
    const summary = manager.listTerminalSessions().find((s) => s.sessionId === sessionId);
    if (!summary) {
      throw new Error("terminal.sessionNotFound");
    }
    if (summary.state !== "running") {
      throw new Error("terminal.sessionNotRunning");
    }
    const scrollback = manager.getScrollbackTail(sessionId, 64 * 1024);
    const { writeHerdrExportFile } = await import("./herdr-export.js");
    return writeHerdrExportFile(this._profileDir, sessionId, summary.title, scrollback);
  }

  async lookupSessionToken(token: string): Promise<import("@envoymesh/local-store").SessionTokenRecord | undefined> {
    if (!this._sessionTokenStore) {
      return undefined;
    }
    return this._sessionTokenStore.getTokenByValue(token.trim());
  }

  async auditHomeRemoteRpc(input: {
    method: string;
    deviceId: string;
    ownerId?: string;
  }): Promise<void> {
    if (!this._taskStore) {
      return;
    }
    try {
      await this._taskStore.appendAuditEvent(
        createAuditEvent({
          type: "tool.called",
          intent: "chat.message",
          messageId: randomUUID(),
          remotePeerId: input.ownerId ?? "mobile",
          direction: "inbound",
          verificationStatus: "verified",
          latencyMs: 0,
          outcome: "record",
          summary: `homeRemote proxy remoteClient=mobile deviceId=${input.deviceId} method=${input.method}`,
        }),
      );
    } catch {
      //
    }
  }

  homeTerminalWsOpen(): Promise<import("@envoymesh/api").HomeTerminalWsRpcResult> {
    return Promise.resolve({
      ok: false,
      error: "homeTerminalWs tunnel requires direct WebSocket or relay proxy channel",
    });
  }

  homeTerminalWsSend(): Promise<import("@envoymesh/api").HomeTerminalWsRpcResult> {
    return Promise.resolve({
      ok: false,
      error: "homeTerminalWs tunnel requires direct WebSocket or relay proxy channel",
    });
  }

  homeTerminalWsClose(): Promise<import("@envoymesh/api").HomeTerminalWsRpcResult> {
    return Promise.resolve({ ok: true });
  }

  /**
   * Set the relay's public WebSocket URL for mobile pairing through relay proxy (Phase 10A).
   * When set, `getPairingPayload()` returns this URL as `wsUrl` instead of the LAN IP,
   * so mobile clients can pair from any network.
   */
  setRelayPublicWsUrl(url: string | undefined): void {
    // undefined = use auto-discovery; empty string = explicitly disabled; anything else = explicit URL
    this._relayPublicWsUrl = url;
  }

  /**
   * Resolve the relay's WebSocket URL — either the explicitly configured one
   * or the auto-discovered one (from a connected relay). Returns `undefined`
   * if no relay is reachable or relay is explicitly disabled (empty string).
   *
   * Used by the relay-tunnel-client to know where to dial OUT to.
   */
  async resolveRelayWsUrl(): Promise<string | undefined> {
    if (this._relayPublicWsUrl !== undefined) {
      return this._relayPublicWsUrl || undefined;
    }
    return this._autoDiscoverRelayWsUrl();
  }

  /**
   * Returns true if [token] matches either:
   * 1. The latest QR pairing token from [getPairingPayload] (10-min TTL), or
   * 2. A persisted session token (no TTL — for reconnections without QR re-scan).
   *
   * When a persisted token is matched, [lastUsedAt] is touched.
   */
  async validatePairingToken(token: string): Promise<boolean> {
    const t = token.trim();
    if (!t) {
      return false;
    }

    // 1. Check in-memory QR pairing token (10-min TTL)
    if (this._pairingToken && t === this._pairingToken) {
      if (Date.now() - this._pairingTokenIssuedAt <= NodeServiceImpl._pairingTokenTtlMs) {
        return true;
      }
    }

    // 2. Check persisted session token store (no TTL)
    if (this._sessionTokenStore) {
      const record = await this._sessionTokenStore.getTokenByValue(t);
      if (record) {
        // Touch lastUsedAt
        record.lastUsedAt = new Date().toISOString();
        await this._sessionTokenStore.setToken(record);
        return true;
      }
    }

    return false;
  }

  async getBridgeStatus(): Promise<BridgeStatus> {
    return this._bridgeStatus ?? { enabled: false, agentPeerId: "", agentUrl: "", listenPort: 0, agentName: "" };
  }

  /**
   * Get pairing payload for mobile-app QR pairing (Phase 10A.7).
   *
   * When a relay is discoverable, the QR points to the relay's client-proxy
   * WebSocket so mobile can pair from any network. Falls back to direct LAN IP
   * when no relay is known.
   */
  async getPairingPayload(): Promise<PairingPayload> {
    const bridgeStatus = await this.getBridgeStatus();
    const reachable = this._mesh ?? this._externalMesh;

    // Derive LAN IP from multiaddrs, e.g. /ip4/192.168.1.100/tcp/63641 → 192.168.1.100.
    // Skip 127.0.0.1 — it's unreachable from mobile devices on the same LAN.
    let lanIp = "localhost";
    const LOOPBACK_RE = /^127\./;
    if (reachable?.multiaddrs) {
      for (const addr of reachable.multiaddrs) {
        const match = addr.match(/\/ip4\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
        if (match && !LOOPBACK_RE.test(match[1])) {
          lanIp = match[1];
          break;
        }
      }
    }

    const wsPort = (this._wsPort ?? 3030);
    const wsPath = (this._wsPath ?? "/ws");
    const lanWsUrl = `ws://${lanIp}:${wsPort}${wsPath}`;

    // Resolve relay WebSocket URL:
    //   undefined (not configured) → auto-discover from relays / bootstrap peers
    //   "" (explicitly disabled)    → no relay proxy, direct LAN connection only
    //   "<url>" (explicit URL)      → use this URL for relay proxy
    const relayWsUrl = this._relayPublicWsUrl !== undefined
      ? (this._relayPublicWsUrl || undefined) // "" → undefined (disabled)
      : await this._autoDiscoverRelayWsUrl();

    this._pairingToken = randomUUID();
    this._pairingTokenIssuedAt = Date.now();

    // When a relay is reachable, the mobile connects through it (any-network).
    // Include `target` (home node peer ID) and `token` as query params so the
    // relay knows which node to proxy to.
    let wsUrl: string;
    if (relayWsUrl) {
      const params = new URLSearchParams();
      if (reachable?.peerId) params.set("target", reachable.peerId);
      params.set("token", this._pairingToken);
      wsUrl = `${relayWsUrl}?${params.toString()}`;
    } else {
      wsUrl = lanWsUrl;
    }

    const payload: PairingPayload = { wsUrl };
    // Expose the direct LAN URL separately so the mobile app can prefer it for
    // ongoing traffic (lowest latency, no relay) when reachable. The relay URL
    // remains the `wsUrl` for cold-start connectivity. Skip the placeholder
    // "localhost" value — it's never useful to a mobile device.
    if (lanIp && lanIp !== "localhost") {
      payload.lanWsUrl = lanWsUrl;
    }
    payload.token = this._pairingToken;

    // Include the relay's peer ID (not the home node's) so the mobile app can
    // use it for RPC probe params and reconstructed dial URLs.
    // Only set when auto-discovering — for explicit URLs we don't know the
    // relay's peer ID unless it's in configuredRelays.
    if (relayWsUrl && this._relayPublicWsUrl === undefined) {
      payload.relayPeerId = await this._autoDiscoverRelayPeerId();
    }

    if (relayWsUrl) {
      payload.relayWsUrl = relayWsUrl;
    }

    if (bridgeStatus.enabled) {
      payload.agentPeerId = bridgeStatus.agentPeerId;
      if (bridgeStatus.agentPublicKeyPem) {
        payload.agentPubKey = bridgeStatus.agentPublicKeyPem;
      }
      if (bridgeStatus.agentName?.trim()) {
        payload.agentName = bridgeStatus.agentName.trim();
      }
    }

    // Include home node peer ID — needed by mobile to route back after pairing
    if (reachable?.peerId) {
      payload.homeNodePeerId = reachable.peerId;
    }

    // Phase 11: Include owner identity for multi-device shared-identity pairing.
    // These are public info — safe for QR codes.
    const profile = this._profile;
    if (profile) {
      payload.ownerPublicKey = profile.owner.publicKeyPem;
      payload.ownerId = profile.owner.ownerId;
    }

    // Include ALL relay/bootstrap multiaddr URLs so EnvoyGo has the complete
    // fallback list immediately — before getPairingPayload() is called.
    // EnvoyGo will try them in order; the first reachable one succeeds.
    if (this._relayBootstrapPeers.length > 0) {
      payload.bootstrapPeers = [...this._relayBootstrapPeers];
    }

    return payload;
  }

  async createWanJoinInvite(params?: CreateWanJoinInviteParams): Promise<CreateWanJoinInviteResult> {
    return createWanJoinInviteViaRuntime(this._wanRuntimeDeps(), params);
  }

  async applyWanJoinInvite(token: string): Promise<ApplyWanJoinInviteResult> {
    return applyWanJoinInviteViaRuntime(this._wanRuntimeDeps(), token);
  }

  /**
   * Pair a mobile device after QR-code scan.
   *
   * Validates the short-lived QR pairing token, creates a persistent session
   * token for future reconnections, and sets up a "direct" trust record.
   */
  async pairDevice(params: PairDeviceParams): Promise<PairDeviceResult> {
    const { requesterOwnerId, requesterDeviceId, requesterDevicePublicKeyPem, pairingToken } = params;

    if (!requesterOwnerId || !requesterDeviceId || !requesterDevicePublicKeyPem || !pairingToken) {
      throw new Error("Missing required pairDevice params");
    }

    // Validate the QR pairing token
    const valid = await this.validatePairingToken(pairingToken);
    if (!valid) {
      throw new Error("Invalid or expired pairing token");
    }

    // Derive the requester's libp2p peer ID from their device public key
    const peerId = derivePeerId(requesterDevicePublicKeyPem);

    // Create trust record at "direct" level
    await this._trustStore.setTrustRecord({
      peerOwnerId: requesterOwnerId,
      level: "direct",
      displayName: "Companion",
      note: "pairDevice",
      now: new Date().toISOString(),
    });

    // Register in peer directory so dial hints work
    await this._peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: requesterOwnerId,
      peerId,
      listenAddrs: [],
    });

    // Generate persistent session token
    const sessionToken = randomUUID();
    const now = new Date().toISOString();
    if (this._sessionTokenStore) {
      await this._sessionTokenStore.setToken({
        token: sessionToken,
        ownerId: requesterOwnerId,
        deviceId: requesterDeviceId,
        displayName: "Companion",
        createdAt: now,
        lastUsedAt: now,
      });
    }

    const bridgeStatus = await this.getBridgeStatus();
    const result: PairDeviceResult = { sessionToken };
    if (bridgeStatus.enabled) {
      result.agentPeerId = bridgeStatus.agentPeerId;
      if (bridgeStatus.agentPublicKeyPem) {
        result.agentPubKey = bridgeStatus.agentPublicKeyPem;
      }
      if (bridgeStatus.agentName?.trim()) {
        result.agentName = bridgeStatus.agentName.trim();
      }
    }

    return result;
  }

  /**
   * Shared-identity pairing (Phase 11).
   *
   * Like pairDevice but additionally:
   * - Signs a DeviceCertificate authorizing the mobile device
   * - ECDH-encrypts the owner private key for secure transfer
   *
   * Called by the Capacitor mobile app when it wants to share the home node's
   * owner identity (same ownerId on both devices).
   */
  async pairSharedIdentity(params: PairSharedIdentityParams): Promise<PairSharedIdentityResult> {
    const { requesterOwnerId, requesterDeviceId, requesterDevicePublicKeyPem, keyExchangePublicKey, pairingToken } = params;

    if (!requesterOwnerId || !requesterDeviceId || !requesterDevicePublicKeyPem || !keyExchangePublicKey || !pairingToken) {
      throw new Error("Missing required pairSharedIdentity params");
    }

    // Verify the ownerId matches — shared identity means the mobile claims the same owner
    const profile = this._requireProfile();
    if (requesterOwnerId !== profile.owner.ownerId) {
      throw new Error(`ownerId mismatch — expected ${profile.owner.ownerId}, got ${requesterOwnerId}`);
    }

    // Validate the QR pairing token
    const valid = await this.validatePairingToken(pairingToken);
    if (!valid) {
      throw new Error("Invalid or expired pairing token");
    }

    // Sign a device certificate authorizing this mobile device
    const deviceCert = createDeviceCertificate({
      owner: {
        ownerId: profile.owner.ownerId,
        publicKeyPem: profile.owner.publicKeyPem,
        privateKeyPem: profile.owner.privateKeyPem,
      },
      device: {
        deviceId: requesterDeviceId,
        publicKeyPem: requesterDevicePublicKeyPem,
        privateKeyPem: "", // mobile keeps its private key; only public part is certified
      },
      deviceProfile: "satellite",
      capabilities: ["mesh.listen", "message.send", "device.sync"],
    });

    // ECDH-encrypt the owner private key for the mobile device
    const keyExchangePubKeyBytes = Buffer.from(keyExchangePublicKey, "base64url");
    const encrypted = await encryptOwnerKeyForDevice(
      profile.owner.privateKeyPem,
      keyExchangePubKeyBytes,
    );

    // Derive the mobile device's peer ID
    const peerId = derivePeerId(requesterDevicePublicKeyPem);

    // Create trust record at "direct" level (same as pairDevice)
    await this._trustStore.setTrustRecord({
      peerOwnerId: requesterOwnerId,
      level: "direct",
      displayName: "Mobile (shared identity)",
      note: "pairSharedIdentity",
      now: new Date().toISOString(),
    });

    // Register in peer directory
    await this._peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: requesterOwnerId,
      peerId,
      listenAddrs: [],
    });

    // Generate persistent session token
    const sessionToken = randomUUID();
    const now = new Date().toISOString();
    if (this._sessionTokenStore) {
      await this._sessionTokenStore.setToken({
        token: sessionToken,
        ownerId: requesterOwnerId,
        deviceId: requesterDeviceId,
        displayName: "Mobile (shared identity)",
        createdAt: now,
        lastUsedAt: now,
      });
    }

    if (this._deviceAuthorizationStore) {
      await this._deviceAuthorizationStore.registerAuthorizedDevice({
        deviceId: requesterDeviceId,
        devicePublicKeyPem: requesterDevicePublicKeyPem,
        certificateId: deviceCert.certificateId,
        deviceProfile: "satellite",
        displayName: "Mobile (shared identity)",
        pairedAt: now,
      });
    }

    const bridgeStatus = await this.getBridgeStatus();
    const result: PairSharedIdentityResult = {
      sessionToken,
      deviceCertificate: deviceCert as unknown as Record<string, unknown>,
      encryptedOwnerKey: encrypted.encryptedKey,
      ephemeralPublicKey: encrypted.ephemeralPublicKey,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      ownerPublicKey: profile.owner.publicKeyPem,
      ownerId: profile.owner.ownerId,
    };
    if (bridgeStatus.enabled) {
      result.agentPeerId = bridgeStatus.agentPeerId;
      if (bridgeStatus.agentPublicKeyPem) {
        result.agentPubKey = bridgeStatus.agentPublicKeyPem;
      }
      if (bridgeStatus.agentName?.trim()) {
        result.agentName = bridgeStatus.agentName.trim();
      }
    }

    return result;
  }

  async pairWithHomeNode(_params: import("@envoymesh/api").PairWithHomeNodeParams): Promise<import("@envoymesh/api").PairWithHomeNodeResult> {
    throw new Error("pairWithHomeNode is only supported on the mobile app");
  }

  async pairThinClient(params: import("@envoymesh/api").PairThinClientParams): Promise<import("@envoymesh/api").PairThinClientResult> {
    const pairingToken = params.pairingToken?.trim();
    if (!pairingToken) {
      throw new Error("pairingToken is required");
    }

    // Validate the QR pairing token.
    const valid = await this.validatePairingToken(pairingToken);
    if (!valid) {
      throw new Error("Invalid or expired pairing token");
    }

    // Generate a persistent session token.
    const sessionToken = randomUUID();
    const now = new Date().toISOString();
    const deviceName = params.deviceName?.trim() || "EnvoyGo";
    const platform = params.platform?.trim() || "flutter";
    // Stable deviceId so the same device always gets the same id.
    // SessionTokenStore.setToken deduplicates by deviceId.
    const deviceId = `thin-client:${deviceName.toLowerCase().replace(/\s+/g, "-")}:${platform}`;
    if (this._sessionTokenStore) {
      await this._sessionTokenStore.setToken({
        token: sessionToken,
        ownerId: this._profile?.owner.ownerId ?? "",
        deviceId,
        displayName: deviceName,
        createdAt: now,
        lastUsedAt: now,
      });
    }

    const ownerId = this._profile?.owner.ownerId ?? "";
    return { sessionToken, ownerId };
  }

  async listAuthorizedDevices(): Promise<ListAuthorizedDevicesResult> {
    if (!this._deviceAuthorizationStore) {
      return { devices: [] };
    }
    const devices = await this._deviceAuthorizationStore.listAuthorizedDevices();
    return { devices };
  }

  async revokeAuthorizedDevice(params: RevokeAuthorizedDeviceParams): Promise<RevokeAuthorizedDeviceResult> {
    const deviceId = params.deviceId?.trim();
    if (!deviceId) {
      throw new Error("deviceId is required");
    }
    if (!this._deviceAuthorizationStore) {
      throw new Error("Device authorization store is not available");
    }
    const profile = this._requireProfile();
    const revocation = await this._deviceAuthorizationStore.revokeDevice({
      owner: {
        ownerId: profile.owner.ownerId,
        publicKeyPem: profile.owner.publicKeyPem,
        privateKeyPem: profile.owner.privateKeyPem,
      },
      deviceId,
      reason: params.reason,
    });
    if (this._sessionTokenStore) {
      await this._sessionTokenStore.removeTokenByDeviceId(deviceId);
    }
    return { revocation };
  }

  async listDeviceRevocations(): Promise<ListDeviceRevocationsResult> {
    if (!this._deviceAuthorizationStore) {
      return { revocations: [] };
    }
    const revocations = await this._deviceAuthorizationStore.listRevocations();
    return { revocations };
  }

  async homeclawCoreProxy(params: HomeClawCoreProxyParams): Promise<HomeClawCoreProxyResult> {
    const cfg = await this.getNodeConfig();
    return executeHomeClawCoreProxy(params, cfg.homeClawCoreBaseUrl);
  }

  /**
   * Try to derive a relay WebSocket URL from configured relays or bootstrap peers.
   * Relays expose their client-proxy WebSocket on port 15432 (the HTTP info port).
   * Only returns a URL if the node is actually connected to that relay via libp2p —
   * otherwise the relay can't proxy to this node and the QR would point to a dead end.
   */
  /**
   * Returns true when [relayPeerId] has a direct, unlimited libp2p connection.
   *
   * This is the signal we need for client-proxy: the relay must be able to call
   * {@link EnvoyMesh.findOpenConnectionToPeer} (which requires {@code limits == null}
   * — i.e. a direct TCP connection, NOT a circuit-relay path) so it can open a
   * new stream and proxy the mobile client's WebSocket data.
   */
  private _hasDirectConnectionTo(relayPeerId: string): boolean {
    return this._reachableMesh()?.getPeerConnectionInfo(relayPeerId).direct === true;
  }

  private async _autoDiscoverRelayWsUrl(): Promise<string | undefined> {
    // 1. Check configured relays in persisted config — only when directly connected
    try {
      const config = await this._configStore.load();
      if (config?.configuredRelays?.length) {
        const r = config.configuredRelays.find(
          (r) => r.addr.includes("/ip4/") && this._hasDirectConnectionTo(NodeServiceImpl._deriveRelayPeerId(r.addr) ?? ""),
        );
        if (r) {
          const derived = NodeServiceImpl._deriveRelayWsUrl(r.addr);
          if (derived) return derived;
        }
      }
    } catch { /* no persisted config */ }

    // 2. Fall back to known community relay — only if directly connected
    const cnRelayPeerId = NodeServiceImpl._deriveRelayPeerId(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    if (cnRelayPeerId && this._hasDirectConnectionTo(cnRelayPeerId)) {
      return NodeServiceImpl._deriveRelayWsUrl(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    }

    return undefined;
  }

  /**
   * Auto-discover the relay's libp2p peer ID from configured relays or the
   * known community relay bootstrap address. Only returns a peer ID if the
   * node is actually connected to that relay.
   */
  private async _autoDiscoverRelayPeerId(): Promise<string | undefined> {
    try {
      const config = await this._configStore.load();
      if (config?.configuredRelays?.length) {
        const r = config.configuredRelays.find(
          (r) => r.addr.includes("/ip4/") && this._hasDirectConnectionTo(NodeServiceImpl._deriveRelayPeerId(r.addr) ?? ""),
        );
        if (r) {
          const derived = NodeServiceImpl._deriveRelayPeerId(r.addr);
          if (derived) return derived;
        }
      }
    } catch { /* no persisted config */ }
    const cnRelayPeerId = NodeServiceImpl._deriveRelayPeerId(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    if (cnRelayPeerId && this._hasDirectConnectionTo(cnRelayPeerId)) {
      return cnRelayPeerId;
    }
    return undefined;
  }

  /**
   * Derive the relay's WebSocket proxy URL from a libp2p multiaddr.
   * e.g. `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooW...` → `ws://47.93.11.212:15432/ws`
   */
  private static _deriveRelayWsUrl(relayAddr: string): string | undefined {
    // Match IPv4 from multiaddr like /ip4/X.X.X.X/tcp/N...
    const match = relayAddr.match(/\/ip4\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
    if (!match) return undefined;
    // Relay exposes client-proxy WebSocket on its HTTP info port (15432)
    return `ws://${match[1]}:${DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT}/ws`;
  }

  /**
   * Derive the relay's libp2p peer ID from a multiaddr.
   * e.g. `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooW...` → `12D3KooW...`
   */
  private static _deriveRelayPeerId(relayAddr: string): string | undefined {
    const match = relayAddr.match(/\/p2p\/([1-9A-HJ-NP-Za-km-z]+)/);
    return match?.[1];
  }

  /**
   * Forward a pre-signed EnvoyEnvelope from a remote client into the P2P mesh.
   * The client signs the envelope with its own keys; the node only validates
   * the envelope shape and forwards it.
   */
  async forwardEnvelope(envelopeJson: Record<string, unknown>, dialHints?: string[]): Promise<void> {
    this._assertOnline();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();

    // Parse the envelope to validate structure
    const envelope = parseEnvelope(envelopeJson);

    // Determine the transport target: use recipientPeerId if present,
    // otherwise fall back to trying to look up via the peer directory.
    let transportPeerId: string;
    if (envelope.recipientPeerId) {
      // For relay.lookup, relay.peers.request, etc., we dial the relay directly.
      // The caller can pass dialHints if the recipient is not in our peer directory.
      transportPeerId = envelope.recipientPeerId;
    } else {
      // For chat messages, look up via the peer directory
      const payload = envelope.payload as { senderOwnerId?: string };
      if (payload.senderOwnerId) {
        const dir = await this._peerDirectoryStore.getPeerByOwnerId(payload.senderOwnerId);
        if (dir) {
          transportPeerId = dir.peerId;
        } else {
          throw new Error(`Peer not found for forwarded envelope to ${payload.senderOwnerId}`);
        }
      } else {
        throw new Error("forwardEnvelope: envelope has no recipientPeerId and payload has no senderOwnerId");
      }
    }

    // Self-send or local agent: route via bridge handler
    // The bridge agent runs on this same node, identified by envoy_agent_* peer IDs.
    // Envelopes addressed to the bridge agent (e.g. device.pair.request from mobile
    // via relay proxy) must be delivered locally, not dialed via libp2p.
    if (this._bridgeChatHandler) {
      if (transportPeerId === mesh.peerId || transportPeerId.startsWith("envoy_agent_")) {
        console.log(`[forwardEnvelope] local delivery to ${transportPeerId.slice(0, 20)}… via bridge handler`);
        await this._bridgeChatHandler(envelope, mesh.peerId);
        return;
      }
    }

    if (transportPeerId.startsWith("envoy_")) {
      throw new Error(`forwardEnvelope: cannot dial envoy_ peer ID "${transportPeerId}" — need a libp2p peer ID`);
    }

    // Forward into the P2P mesh
    console.log(`[forwardEnvelope] intent=${envelope.intent} senderPeerId=${envelope.senderPeerId} transportPeerId=${transportPeerId}`);
    if (envelope.intent === "chat.message") {
      const hints =
        dialHints?.length ? dialHints : await this._dialHintsForChat(transportPeerId, undefined);
      await this._deliverChatEnvelope(transportPeerId, envelope, hints);
    } else {
      const hints = dialHints ?? [];
      const preferCircuits = hints.some((h) => h.includes("/p2p-circuit/"));
      await mesh.send(transportPeerId, envelope as any, {
        dialHints: hints,
        preferCircuitHints: preferCircuits,
      });
    }

    // Tag reachability for the transport peer
    void this._tagBondedContactReachability(transportPeerId);
  }

  async getPeerConnectionInfo(peerOwnerId: string): Promise<PeerConnectionInfo> {
    const mesh = this._reachableMesh();
    if (!mesh) {
      return { connected: false, direct: false };
    }

    try {
      const { transportPeerId } = await this._resolvePeerTransportForOwner(peerOwnerId);
      return mesh.getPeerConnectionInfo(transportPeerId);
    } catch {
      return { connected: false, direct: false };
    }
  }

  async warmContactConnection(peerOwnerId: string): Promise<PeerConnectionInfo> {
    this._assertOnline();
    const mesh = this._requireMesh();
    let transportPeerId: string;
    let listenAddrs: string[] | undefined;
    try {
      const resolved = await this._resolvePeerTransportForOwner(peerOwnerId);
      transportPeerId = resolved.transportPeerId;
      listenAddrs = resolved.listenAddrs;
    } catch {
      return { connected: false, direct: false };
    }

    void this._tagBondedContactReachability(transportPeerId);
    const existing = mesh.getPeerConnectionInfo(transportPeerId);
    if (existing.connected) {
      return existing;
    }

    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(transportPeerId, listenAddrs),
        30_000,
        "_dialHintsForChat",
      );
    } catch {
      return { connected: false, direct: false };
    }

    const result = await mesh.ensurePeerReachable(transportPeerId, ENVOY_CHAT_PROTOCOL, { dialHints });
    void this._flushPendingRoomSyncs();
    void this._flushPendingRoomMessages();
    return result;
  }

  private _startBondWarmInterval(): void {
    if (this._bondWarmTimer) {
      clearInterval(this._bondWarmTimer);
    }
    void this._warmAllBondedContacts();
    this._bondWarmTimer = setInterval(() => {
      void this._warmAllBondedContacts();
    }, 45_000);
  }

  private async _warmAllBondedContacts(): Promise<void> {
    if (this._nodeStatus !== "running") {
      return;
    }
    const bonds = await this.getBonds();
    for (const bond of bonds) {
      if (bond.level !== "direct" && bond.level !== "referred") {
        continue;
      }
      try {
        await this.warmContactConnection(bond.peerOwnerId);
      } catch {
        /* best-effort keepalive */
      }
    }
  }

  async getChatDiagnostics(peerOwnerId?: string): Promise<ChatDiagnostics> {
    const mesh = this._reachableMesh();
    const config = await this.getNodeConfig();
    return buildChatDiagnostics({
      mesh,
      nodeOnline: Boolean(mesh && this._nodeStatus === "running"),
      localPeerId: mesh?.peerId ?? "",
      profileDir: this._profileDir,
      config: await this._configStore.load(),
      relayEnabled: config.relayEnabled,
      relayClientSchedulerActive: Boolean(this._stopRelayClientScheduler),
      relayBootstrapPeers: this._relayBootstrapPeers,
      configStore: this._configStore,
      peerDirectoryStore: this._peerDirectoryStore,
      discoverySeedStore: this._discoverySeedStore,
      peerOwnerId,
    });
  }

  async knowledgeQuery(question: string): Promise<string> {
    console.log(`[knowledgeQuery] called with question: ${question.substring(0, 50)}...`);

    const mesh = this._reachableMesh();
    if (!mesh || !(await this._ensureAgentStores())) {
      throw new Error("Node not initialized");
    }
    const profile = this._profile;
    const taskStore = this._taskStore;
    if (!profile || !taskStore) {
      throw new Error("Node not initialized");
    }

    const kqPayload = createKnowledgeQueryPayload({ query: question });
    const unsignedEnvelope = createUnsignedEnvelope({
      senderPeerId: mesh.peerId,
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "agent",
      intent: "knowledge.query",
      payload: kqPayload,
    });
    const envelope = signUnsignedEnvelope(unsignedEnvelope, profile.device.privateKeyPem) as EnvoyEnvelope;

    const nodeConfig = await this.getNodeConfig();
    console.log(`[knowledgeQuery] nodeConfig.modelProviders.mode=${nodeConfig.modelProviders.mode}`);

    const vaultIndex = await buildVaultIndex({ rootDir: this._vaultDir });
    const ragService = await this._getRagService();

    const result = await handleInboundKnowledgeQuery({
      envelope,
      remotePeerId: mesh.peerId,
      receivedAt: Date.now(),
      correlationId: envelope.messageId,
      taskStore,
      trustStore: this._trustStore,
      peerDirectoryStore: this._peerDirectoryStore,
      profile,
      vaultIndex,
      modelProviders: nodeConfig.modelProviders,
      isLocalSelfQuery: true,
      ownerApproved: true, // Local owner queries are implicitly approved
      knowledgeBase: nodeConfig.aiSettings?.knowledgeBase,
      chatLogStore: this._chatLogStore,
      humanProfileStore: this._humanProfileStore,
      agentIdentityStore: this._agentIdentityStore,
      ragService,
    });

    if (!result.ok) {
      throw new Error(result.reason);
    }

    return result.responsePayload.answer;
  }

  async runDocumentAgentTurn(message: string): Promise<DocumentAgentTurnResult> {
    console.warn(
      "[EnvoyMesh] runDocumentAgentTurn is deprecated — use runOwnerAgentTurn from Assistant; RPC retained for one release.",
    );
    const turn = await this._runDocumentAgentTurnCore(message);
    await this.recordH2aOwnerTurn(message, turn);
    return turn;
  }

  private async _runDocumentAgentTurnCore(message: string): Promise<DocumentAgentTurnResult> {
    this.recordOwnerActivity();
    const context = await this._requireToolExecutionContext();
    const turn = await runDocumentAgentTurnLoop({
      message,
      listLibraryItems: (query) => this.listLibraryItems(query ? { query } : undefined),
      getBonds: () => this.getBonds(),
      executeTool: (toolName, params) => executeTool(toolName, params, context),
      knowledgeQuery: (question) => this.knowledgeQuery(question),
      discoverPublishedLibrary: (p) => this.discoverPublishedLibrary(p),
      sendChat: (targetOwnerId, text) => this.sendAgentChat(targetOwnerId, text),
    });
    return { ...turn, answer: stripModelThinking(turn.answer) };
  }

  async runOwnerAgentTurn(message: string): Promise<OwnerAgentTurnResult> {
    this.recordOwnerActivity();
    const terminalSessionId = parseTerminalAssistantCorrelationId(message);
    const agentMessage = terminalSessionId
      ? stripTerminalAssistantCorrelationPrefix(message)
      : message;

    // Built-in OpenClaw (EnvoyAI): session memory, tools, multi-round reasoning.
    if (await this._ensureOpenClawReady()) {
      this._beginOpenClawToolTracking();
      try {
        const context = await this._buildOpenClawTurnContext();
        const answer = stripModelThinking(await this.askOpenClaw(agentMessage, context));
        const result: OwnerAgentTurnResult = {
          answer,
          domain: "knowledge" as const,
          intent: "knowledge" as const,
          toolsUsed: this._endOpenClawToolTracking(),
          approvalItems: [],
          modelUsed: "openclaw",
        };
        await this._persistEnvoyAiChatExchange(message, result);
        this._maybeIngestTerminalAssistantReply(terminalSessionId, answer);
        return result;
      } catch (err) {
        this._endOpenClawToolTracking();
        console.warn("[openclaw] request failed, falling back to native planner:", err instanceof Error ? err.message : String(err));
      }
    } else {
      console.warn("[openclaw] Gateway unavailable — using native LLM planner for this turn");
    }

    const context = await this._requireToolExecutionContext();
    const config = await this._configStore.load();
    const nodeConfig = await this.getNodeConfig();
    const mesh = this._mesh;
    const agentIdentitySection = await loadAgentIdentitySection(this._agentIdentityStore);
    let localManifestCapabilities: string[] | undefined;
    if (this._capabilityManifestStore) {
      const manifest = await this._capabilityManifestStore.loadManifest();
      localManifestCapabilities = manifest?.capabilities;
    }

    const pendingBeforeIds = new Set((await this.listPendingApprovals()).map((p) => p.id));

    const turn = await runOwnerAgentTurnLoop({
      message: agentMessage,
      runDocumentTurn: () => this._runDocumentAgentTurnCore(agentMessage),
      executeTool: (toolName, params) => executeTool(toolName, params, context),
      matchRoutes: (goal) =>
        matchAgentCapabilityRoutes({
          goal,
          localManifestCapabilities,
          maxResults: 3,
        }),
      postureEnabled: {
        socialProxy: config?.socialProxyEnabled ?? false,
        documentAcquisition: config?.documentAcquisitionEnabled ?? false,
        capabilityProvider: config?.capabilityProviderEnabled ?? false,
        trustMode: config?.trustModeEnabled ?? false,
        autonomousKillSwitch: config?.autonomousKillSwitch ?? false,
      },
      agentIdentitySection,
      askPlanner: (prompt) =>
        askOwnerAgentPlanner({
          prompt,
          modelProviders: nodeConfig.modelProviders,
          requesterPeerId: mesh?.peerId ?? "local-owner",
          agentIdentityStore: this._agentIdentityStore,
        }),
      scanOutbound: scanOwnerAgentOutbound,
      startDocumentAcquisitionJob: (query) => this.startDocumentAcquisitionJob({ query }),
      startCapabilityProviderJob: (input) =>
        this.startCapabilityProviderJob({
          goal: input.goal,
          capabilityIds: input.capabilityIds,
        }),
      runSocialProxyPass: () => this.runSocialProxyPass(),
      discoverAndCluster: (seedTopics?: string[], seedCapabilities?: string[]) =>
        this.discoverAndCluster(seedTopics, seedCapabilities),
      // meshIntelligenceReport not in OwnerAgentTurnDeps — call directly
      chatRagSearch: (query: string, opts?: { ownerId?: string; maxResults?: number }) =>
        this.chatRagSearch(query, opts),
      predictIntent: (partial: string) => {
        // Phase 25D — predict owner intent from partial input using
        // the live in-process intent history (persisted across restarts).
        if (!config?.intentPredictionEnabled) return [];
        return predictIntent(
          this._intentHistory.slice(),
          partial,
          { maxPredictions: config?.prefetchMaxResults ?? 3 },
        );
      },
      runTaskNegotiation: async (objective: string, capabilityTags: string[]) => {
        // Phase 24A — Full A2A negotiation lifecycle
        const { runTaskNegotiationLoop } = await import("./task-negotiation-loop.js");
        const result = await runTaskNegotiationLoop(
          {
            discoverCapabilityProviders: async (tags: string[]) => {
              const matches = await matchAgentCapabilityRoutes({
                goal: objective,
                localManifestCapabilities,
                maxResults: 5,
              });
              const bonds = await this.getBonds();
              return matches.filter((m) => {
                // MatchedAgentCapabilityRoute doesn't carry ownerId/peerId directly;
                // derive from the route's metadata when present.
                const meta = m as unknown as { ownerId?: string; peerId?: string };
                const bond = meta.ownerId
                  ? bonds.find((b) => b.peerOwnerId === meta.ownerId)
                  : undefined;
                return bond != null;
              }).map((m) => {
                const meta = m as unknown as { ownerId?: string; peerId?: string; capabilities?: string[] };
                return {
                  ownerId: meta.ownerId ?? "(unknown)",
                  peerId: meta.peerId ?? meta.ownerId ?? "(unknown)",
                  capabilities: meta.capabilities ?? m.matchedCapabilityIds ?? [],
                  bondLevel: bonds.find((b) => b.peerOwnerId === meta.ownerId)?.level ?? "public",
                  reputationScore: 0.5,
                };
              });
            },
            sendTaskPropose: async (peerId, ownerId, objective, constraints) => {
              const { sendAgentTaskPropose } = await import("./agent-task-propose-send.js");
              const result = await sendAgentTaskPropose({
                profile: this._profile!,
                agentIdentity: agentIdentitySection as any,
                recipientPeerId: peerId,
                objective,
                taskId: constraints?.correlationId as string ?? randomUUID(),
              } as any);
              return result.ok ? peerId : null;
            },
          },
          {
            executeTool: (toolName, params) => executeTool(toolName, params, context),
            sendTaskResult: async (peerId, ownerId, taskId, result, corrId) => {
              if (!this._mesh) return false;
              try {
                const { createTaskResultPayload, createUnsignedEnvelope } = await import("@envoymesh/protocol");
                const unsigned = createUnsignedEnvelope({
                  senderPeerId: mesh!.peerId,
                  senderPublicKey: this._profile!.device.publicKeyPem,
                  senderRole: "agent",
                  recipientPeerId: peerId,
                  recipientRole: "agent",
                  intent: "task.result",
                  payload: createTaskResultPayload({
                    taskId,
                    summary: typeof result === "string" ? result : JSON.stringify(result ?? ""),
                    status: "completed",
                  }),
                  correlationId: corrId,
                  agentCredential: (agentIdentitySection as any)?.credential,
                });
                const { signUnsignedEnvelope } = await import("@envoymesh/identity");
                const signed = signUnsignedEnvelope(unsigned, this._profile!.device.privateKeyPem);
                await this._mesh.send(peerId, signed, {});
                return true;
              } catch { return false; }
            },
            sendTaskFeedback: async (peerId, ownerId, taskId, score, comment, corrId) => {
              if (!this._mesh) return false;
              try {
                const { createTaskFeedbackPayload, createUnsignedEnvelope } = await import("@envoymesh/protocol");
                const unsigned = createUnsignedEnvelope({
                  senderPeerId: mesh!.peerId,
                  senderPublicKey: this._profile!.device.publicKeyPem,
                  senderRole: "agent",
                  recipientPeerId: peerId,
                  recipientRole: "agent",
                  intent: "task.feedback",
                  payload: createTaskFeedbackPayload({
                    taskId,
                    outcome: (score >= 0.5 ? "success" : "failure") as "success" | "failure",
                    latencyMs: 0,
                    notes: comment,
                  }),
                  correlationId: corrId,
                  agentCredential: (agentIdentitySection as any)?.credential,
                });
                const { signUnsignedEnvelope } = await import("@envoymesh/identity");
                const signed = signUnsignedEnvelope(unsigned, this._profile!.device.privateKeyPem);
                await this._mesh.send(peerId, signed, {});
                return true;
              } catch { return false; }
            },
          },
          objective,
          capabilityTags,
        );
        return result;
      },
      // Phase 24B — multi-step agent chain
      runAgentChain: async (description: string, initialInput?: string) => {
        const { runAgentChain, decomposeTask } = await import("./agent-chain-orchestrator.js");
        const steps = decomposeTask(description);
        if (steps.length === 0) {
          return { ok: false, completedSteps: 0, totalSteps: 0, error: "no steps decomposed" };
        }
        // Local providers only — for now we use the capability manifest and
        // bonded peer routes. A future wire-protocol extension can read
        // remote provider cards.
        const findProviders = async (capabilityTag: string) => {
          const matches = await matchAgentCapabilityRoutes({
            goal: description,
            localManifestCapabilities,
            maxResults: 5,
          });
          return matches
            .filter((m) => (m.matchedCapabilityIds ?? []).includes(capabilityTag))
            .map((m) => {
              const meta = m as unknown as { ownerId?: string; peerId?: string };
              return {
                ownerId: meta.ownerId ?? "(unknown)",
                peerId: meta.peerId ?? meta.ownerId ?? "(unknown)",
                capabilities: m.matchedCapabilityIds ?? [],
                reputationScore: 0.5,
              };
            });
        };
        const executeStep = async (
          provider: { ownerId: string; peerId: string },
          step: { label: string; capabilityTag: string },
          input: string | undefined,
        ): Promise<string | null> => {
          // Local-only executor: the chain module can call this for the local
          // owner. Remote provider execution is a follow-on (requires A2A
          // task dispatch in the chain).
          if (provider.ownerId !== (this._profile?.owner.ownerId ?? "")) return null;
          // For the local owner, synthesize a deterministic echo so the chain
          // demonstrates the data flow. Real synthesis is a follow-on.
          return `${step.label}: ${input ?? ""}`.trim();
        };
        return runAgentChain({ findProviders, executeStep }, steps, initialInput);
      },
      // Phase 24D — service-mesh auto-accept gate
      evaluateServiceTask: async (task) => {
        const { evaluateServiceTask } = await import("./service-mesh-worker.js");
        const autoAcceptPolicy = {
          enabled: (config?.autonomousKillSwitch ?? true) === false,
          maxSensitivity: "friends" as const,
          maxConcurrentTasks: 3,
          allowedActions: ["read", "search", "summarize"],
        };
        return evaluateServiceTask(
          {
            hasCapability: (tag) => (localManifestCapabilities ?? []).includes(tag),
            getAutoAcceptPolicy: async () => autoAcceptPolicy,
            getActiveTaskCount: async () => {
              try {
                return (await this.listPendingApprovals()).length;
              } catch {
                return 0;
              }
            },
          },
          task,
        );
      },
      listAgentCircles: () => this.listAgentCircles(),
      createAgentCircle: (input: any) => this.createAgentCircle(input),
      updateAgentCircle: (circleId: string, update: any) => this.updateAgentCircle(circleId, update),
      deleteAgentCircle: (circleId: string) => this.deleteAgentCircle(circleId),
      proposeAgentCircles: () => this.proposeAgentCircles(),
      countPendingApprovals: async () => {
        const pending = await this.listPendingApprovals();
        return pending.length;
      },
      getBonds: () => this.getBonds(),
      auditPlannerRound: async (record) => {
        if (!this._taskStore) return;
        await this._taskStore.appendAuditEvent(
          createAuditEvent({
            type: "tool.called",
            messageId: randomUUID(),
            remotePeerId: "local",
            direction: "local",
            verificationStatus: "verified",
            latencyMs: 0,
            outcome: record.ok === false ? "deny" : "record",
            summary: record.toolName
              ? `owner agent planner round ${record.round}: ${record.toolName} — ${record.summary}`
              : `owner agent planner round ${record.round}: ${record.summary}`,
            createdAt: new Date().toISOString(),
          }),
        );
      },
    });

    let approvalItems: OwnerAgentTurnResult["approvalItems"];
    const pendingAfter = await this.listPendingApprovals();
    const newApprovalItems = pendingAfter.filter((p) => !pendingBeforeIds.has(p.id));
    if (turn.pendingApproval) {
      approvalItems = newApprovalItems.length > 0 ? newApprovalItems : pendingAfter.slice(-1);
    } else if (newApprovalItems.length > 0) {
      approvalItems = newApprovalItems;
    }

    await this.recordH2aOwnerAgentTurn(message, turn);
    // Phase 25D — record the intent for future predictions (only if a
    // domain/intent was returned by the turn).
    if (turn.intent) {
      void this.recordIntent(turn.intent, agentMessage);
    }
    const result = { ...turn, approvalItems, answer: stripModelThinking(turn.answer) };
    await this._persistEnvoyAiChatExchange(message, result);
    this._maybeIngestTerminalAssistantReply(terminalSessionId, result.answer);
    return result;
  }

  /** Local H2A turn — Activity row for Assistant lane (Phase 15C / 18). */
  async recordH2aOwnerAgentTurn(message: string, turn: OwnerAgentTurnResult): Promise<void> {
    if (!this._agentActivityStore) return;
    const preview = message.trim().slice(0, 80);
    let kind: AgentActivityRecord["kind"] = "task_progress";
    let domain: AgentActivityRecord["domain"] = "home";
    if (turn.domain === "knowledge" || turn.intent === "knowledge") {
      kind = "knowledge_answered";
      domain = "knowledge";
    } else if (turn.domain === "social") {
      domain = "social";
    } else if (turn.domain === "document") {
      domain = "home";
    } else if (turn.domain === "service") {
      domain = "research";
    }
    if (turn.pendingApproval) {
      kind = "approval_needed";
    }
    const jobHint = turn.jobId ? ` job=${turn.jobId}` : "";
    const routeHint = turn.routeId ? ` route=${turn.routeId}` : "";
    const record: AgentActivityRecord = {
      activityId: randomUUID(),
      domain,
      kind,
      summary:
        kind === "knowledge_answered"
          ? `H2A agent: ${preview}`
          : `H2A ${turn.domain}${jobHint}${routeHint}: ${preview}`,
      remoteActorRole: "agent",
      createdAt: new Date().toISOString(),
      correlationId: turn.correlationId,
      taskId: turn.jobId,
      evidence: turn.routeId ? [{ type: "route", ref: turn.routeId }] : undefined,
    };
    await this._agentActivityStore.append(record);
    await this._publishAgentActivity(record);
  }
  async recordH2aOwnerTurn(message: string, turn: DocumentAgentTurnResult): Promise<void> {
    if (!this._agentActivityStore) return;
    const preview = message.trim().slice(0, 80);
    let kind: AgentActivityRecord["kind"] = "task_progress";
    let domain: AgentActivityRecord["domain"] = "home";
    if (turn.intent === "knowledge") {
      kind = "knowledge_answered";
      domain = "knowledge";
    } else if (turn.intent === "share_propose") {
      kind = "share_proposed";
      domain = "home";
    }
    const record: AgentActivityRecord = {
      activityId: randomUUID(),
      domain,
      kind,
      summary:
        kind === "knowledge_answered"
          ? `H2A vault assist: ${preview}`
          : `H2A ${turn.intent}: ${preview}`,
      remoteActorRole: "agent",
      createdAt: new Date().toISOString(),
    };
    await this._agentActivityStore.append(record);
    await this._publishAgentActivity(record);
  }

  // ============================================
  // Agent tool execution context (mesh.library_*, etc.)
  // ============================================

  /**
   * Ensure persisted agent identity for tool signing (bridge file or lazy create).
   */
  private async _ensureAgentIdentity(): Promise<BridgeIdentity | null> {
    const profile = this._profile;
    if (!profile) return null;
    let identity = await loadBridgeIdentity(this._profileDir);
    if (identity) return identity;
    const agent = generateAgentIdentity(profile.owner.ownerId);
    identity = {
      agentPeerId: agent.agentPeerId,
      agentPublicKeyPem: agent.publicKeyPem,
      agentPrivateKeyPem: agent.privateKeyPem,
      ownerId: profile.owner.ownerId,
      agentCredential: createAgentCredential({
        owner: profile.owner,
        agent,
        scope: [...NATIVE_AGENT_TOOL_SCOPE],
      }),
    };
    await saveBridgeIdentity(this._profileDir, identity);
    return identity;
  }

  /**
   * Build {@link MeshToolContext} for native Envoy AI and optional bridge agents.
   */
  async getToolExecutionContext(): Promise<MeshToolContext | null> {
    if (!(await this._ensureAgentStores())) return null;
    const profile = this._profile;
    const taskStore = this._taskStore;
    if (!profile || !taskStore) return null;
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity) return null;
    const config = await this._configStore.load();
    let humanProfileSummary: { displayName?: string; bio?: string } | undefined;
    let humanProfileLocation:
      | {
          discoveryLocation?: import("@envoymesh/protocol").DiscoveryLocation;
          discoveryLocationPrecision?: import("@envoymesh/protocol").DiscoveryLocationPrecision;
        }
      | undefined;
    try {
      const hp = await this._humanProfileStore.loadHumanProfile();
      if (hp) {
        humanProfileSummary = { displayName: hp.displayName, bio: hp.bio };
        humanProfileLocation = {
          discoveryLocation: hp.discoveryLocation,
          discoveryLocationPrecision: hp.discoveryLocationPrecision,
        };
      }
    } catch { /* ignore */ }
    const documentAutonomy = normalizeDocumentAutonomyPolicy(config?.aiSettings?.documentAutonomy);
    const profileMedia = normalizeProfileMediaPolicy(config?.aiSettings?.profileMedia);
    return {
      trustStore: this._trustStore,
      peerDirectoryStore: this._peerDirectoryStore,
      taskStore,
      agentIdentity: {
        agentId: agentIdentity.agentCredential.agentId,
        agentPeerId: agentIdentity.agentPeerId,
        privateKeyPem: agentIdentity.agentPrivateKeyPem,
        publicKeyPem: agentIdentity.agentPublicKeyPem,
      },
      ownerIdentity: { ownerId: profile.owner.ownerId },
      agentCredential: agentIdentity.agentCredential,
      mesh: this._reachableMesh(),
      trustIntro: {
        trustModeEnabled: config?.trustModeEnabled ?? false,
        friendAutopilotEnabled: config?.friendAutopilotEnabled ?? false,
        friendMatchingPreferencesText: config?.friendMatchingPreferencesText,
        friendMatchingPreferencesSigned: config?.friendMatchingPreferencesSigned,
        humanProfileSummary,
        humanProfileLocation,
      },
      recordFriendAutopilotPass: (input) => this._recordFriendAutopilotPass(input),
      listLibraryItems: (query) => this.listLibraryItems(query ? { query } : undefined),
      readLibraryItemContent: (params) => this.readLibraryItemContent(params),
      listOpenClawWorkspaceFiles: (query) => this.listOpenClawWorkspaceFiles(query ? { query } : undefined),
      readOpenClawWorkspaceFile: (params) => this.readOpenClawWorkspaceFile(params),
      discoverPublishedLibrary: (p) =>
        this.discoverPublishedLibrary(p as DiscoverPublishedLibraryParams | undefined),
      exportLibraryItemToIpfs: (documentId) => this.exportLibraryItemToIpfs(documentId),
      verifyLibraryItemIpfsGateway: (p) => this.verifyLibraryItemIpfsGateway(p),
      setLibraryItemPublished: (documentId, published) => this.setLibraryItemPublished(documentId, published),
      submitAgentShareProposal: (params) => this.submitAgentShareProposal(params),
      getBonds: () => this.getBonds(),
      sendChat: (targetOwnerId, text) => this.sendAgentChat(targetOwnerId, text),
      listPendingApprovals: () => this.listPendingApprovals(),
      approvePendingApproval: (itemId, notes) => this.approvePendingApproval(itemId, notes),
      rejectPendingApproval: (itemId, notes) => this.rejectPendingApproval(itemId, notes),
      requestAgentCard: (targetOwnerId) => this.requestAgentCard(targetOwnerId),
      getAgentCard: (ownerId) => this.getAgentCard(ownerId),
      listAgentCards: () => this.listAgentCards(),
      getLocalCapabilityManifest: async () => {
        const manifest = await this.getCapabilityManifest();
        if (!manifest) return undefined;
        return { capabilities: manifest.capabilities, keywords: manifest.keywords };
      },
      listBondedAgentCapabilities: async () => {
        const cards = await this.listAgentCards();
        return cards.map((card) => ({
          ownerId: card.ownerId,
          capabilities: card.capabilities,
        }));
      },
      startCapabilityProviderJob: (params) => this.startCapabilityProviderJob(params),
      sendTaskPropose: async (params) => {
        const profile = this._profile;
        const mesh = this._reachableMesh();
        const agentIdentity = await this._ensureAgentIdentity();
        if (!profile || !agentIdentity || !mesh) {
          return { ok: false, error: "agent runtime unavailable" };
        }
        const result = await sendAgentTaskPropose({
          mesh,
          profile,
          agentPeerId: agentIdentity.agentPeerId,
          agentPublicKeyPem: agentIdentity.agentPublicKeyPem,
          agentPrivateKeyPem: agentIdentity.agentPrivateKeyPem,
          agentCredential: agentIdentity.agentCredential,
          peerDirectoryStore: this._peerDirectoryStore,
          targetOwnerId: params.targetOwnerId,
          objective: params.objective,
          correlationId: params.correlationId,
        });
        return result.ok
          ? { ok: true, result: { summary: result.summary, taskId: result.taskId } }
          : { ok: false, error: result.summary };
      },
      listActiveTransfers: () => this.listActiveTransfers(),
      getTransferStatus: (correlationId) => this.getTransferStatus(correlationId),
      listPendingShareOffers: () => this.listPendingShareOffers(),
      listAgentShareProposals: () => this.listAgentShareProposals(),
      documentAutonomy,
      profileMedia,
      loadHumanProfile: async () => {
        const hp = await this._humanProfileStore.loadHumanProfile();
        return hp ? (hp as HumanProfile) : undefined;
      },
      shareFile: (params) =>
        this.shareFile(params.targetOwnerId, {
          path: params.vaultRelativePath,
          sensitivity: params.sensitivity,
        }),
    };
  }

  /**
   * @deprecated Prefer {@link getToolExecutionContext} — alias for bridge-era callers.
   */
  async getMeshToolContext(): Promise<MeshToolContext | null> {
    return this.getToolExecutionContext();
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

  // ============================================
  // Activity Tracking
  // ============================================

  private lastActivityTimestamp: number = Date.now();
  private readonly activityTimeoutMs: number = 5 * 60 * 1000; // 5 minutes

  recordOwnerActivity(): void {
    this.lastActivityTimestamp = Date.now();
  }

  /**
   * Wipe all local user data: profile, config, published library, intent
   * history, continuity sessions. Stops the node first to release any
   * open file handles. Used by the "clear all data" privacy action.
   *
   * **Destructive** — cannot be undone. The caller is expected to
   * confirm with the user before invoking.
   */
  async clearAllUserData(): Promise<void> {
    // Best-effort: each step is independent. A failure on one store does
    // not block the others.
    const profileDir = this._profileDir;
    if (!profileDir) {
      // Nothing persisted yet — nothing to wipe.
      return;
    }

    // In-memory state
    this._publishedLibrary.clear();
    this._intentHistory.length = 0;
    // Continuity sessions managed by load/save pattern

    // On-disk state — overwrite each file with an empty/initial payload.
    const { unlink } = await import("node:fs/promises");
    const targets: Array<{ path: string; empty: string }> = [
      { path: join(profileDir, "node-config.json"), empty: JSON.stringify({ version: "0.1" }) },
      { path: join(profileDir, "published-library.json"), empty: JSON.stringify({ version: "0.1", snapshot: [] }) },
      { path: join(profileDir, "intent-history.json"), empty: JSON.stringify({ version: "0.1", history: [] }) },
      { path: join(profileDir, "continuity-sessions.json"), empty: JSON.stringify({ version: "0.1", sessions: [] }) },
      { path: join(profileDir, "profile.json"), empty: "" },
    ];
    for (const t of targets) {
      try {
        await writeFile(t.path, t.empty, { mode: 0o600 });
      } catch (err) {
        console.warn(`[clearAllUserData] could not reset ${t.path}:`, err);
      }
    }
    // Best-effort: remove files we don't recreate above (logs, audit).
    const removable = ["audit.jsonl", "task-journal.jsonl", "peer-directory.json"];
    for (const name of removable) {
      try {
        await unlink(join(profileDir, name));
      } catch {
        // Missing file is fine.
      }
    }
  }

  async isOwnerOnline(): Promise<boolean> {
    const config = await this._configStore.load();
    const aiSettings = config?.aiSettings;
    const status = aiSettings?.status;

    if (!status) return true; // Default to online if no status configured

    if (status.statusMode === "manual") {
      return status.isOnlineManual ?? true;
    }

    // Automatic mode: online if had activity within timeout
    return Date.now() - this.lastActivityTimestamp < this.activityTimeoutMs;
  }
}

function mimeTypeForFilename(filename: string): string {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    case "json":
      return "application/json";
    case "html":
      return "text/html";
    case "csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

function sanitizeChatFilename(name: string): string {
  const base = basename(name.trim()) || "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
}

function chatInboundVaultPath(senderOwnerId: string, senderRelativePath: string): string {
  const safeOwner =
    senderOwnerId.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "peer";
  const filename = sanitizeChatFilename(basename(senderRelativePath));
  return `chat/in/${safeOwner}/${filename}`;
}

/**
 * Creates a NodeService instance.
 */
export function createNodeService(
  mesh: EnvoyMesh | undefined,
  trustStore: LocalTrustStore,
  peerDirectoryStore: LocalPeerDirectoryStore,
  humanProfileStore: HumanProfileStore,
  profileDir: string,
  profile?: NodeProfile,
  vaultDir?: string,
): NodeService {
  return new NodeServiceImpl(
    mesh,
    trustStore,
    peerDirectoryStore,
    humanProfileStore,
    profileDir,
    profile,
    vaultDir,
  );
}

// Export the class for testing
export { NodeServiceImpl };
