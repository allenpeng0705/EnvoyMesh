import type {
  AiSettings,
  BondRecord,
  BridgeStatus,
  OpenClawStatus,
  PiStatus,
  PiPromptResult,
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
  WarmContactConnectionOptions,
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
  MergeAuthorizedDevicesParams,
  MergeAuthorizedDevicesResult,
  PruneRevokedDevicesResult,
  ListDeviceRevocationsResult,
  AgentShareProposal,
  SubmitAgentShareProposalParams,
  DiscoverPublishedLibraryParams,
  DiscoverPublishedLibraryPeerResult,
  LibraryReadParams,
  LibraryReadResult,
  PublishWebContentParams,
  PublishWebContentResult,
  FeedNotification,
  ContentEngageNotification,
  DismissContentEngageNotificationsParams,
  ContentEngagementSummary,
  GetContentEngagementParams,
  ToggleContentStarParams,
  AddContentCommentParams,
  RemoveContentCommentParams,
  PublishedLibraryFileHit,
  ExportLibraryItemToIpfsResult,
  PinLibraryItemExternalResult,
  CreateWanJoinInviteParams,
  CreateWanJoinInviteResult,
  ApplyWanJoinInviteResult,
  CreateCompanyInviteParams,
  CreateCompanyInviteResult,
  ListCompanyInvitesResult,
  RevokeCompanyInviteResult,
  RedeemCompanyInviteParams,
  RedeemCompanyInviteResult,
  CreateFleetManifestInput,
  CreateFleetManifestResult,
  ImportFleetManifestOutcome,
  ImportFleetManifestParams,
  ListFleetManifestsResult,
  RevokeFleetManifestResult,
  IpfsEngineStatus,
  VerifyLibraryItemIpfsGatewayParams,
  VerifyLibraryItemIpfsGatewayResult,
  ImportToLibraryParams,
  ImportToLibraryResult,
  ConvertLibraryItemToMarkdownParams,
  ConvertLibraryItemToMarkdownResult,
  SaveExternalMcpSearchAsNoteParams,
  SaveExternalMcpSearchAsNoteResult,
  CreateNoteParams,
  CreateNoteResult,
  DeleteVaultItemParams,
  KbPluginInfo,
  ListKbPluginsParams,
  ActivateKbPluginParams,
  DeactivateKbPluginParams,
  UpdateKbPluginConfigParams,
  RagIndexStatus,
  TransferStatus,
  SendChatParams,
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
  GetCostSummaryParams,
  CostSummary,
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
  CallSession,
  CallEvent,
  ExtAgentReachability,
  ExtAgentCommandCatalog,
  ProbeExtAgentParams,
  GetExtAgentCommandCatalogParams,
  SetExtAgentSessionModelParams,
  SetExtAgentSessionModelResult,
  ExtAgentProjectPathResult,
  GetExtAgentProjectPathParams,
  HomeFsInfo,
  ListHomeFsEntriesParams,
  ListHomeFsEntriesResult,
  DiscoverObsidianVaultsResult,
  OpenDesktopAppParams,
  OpenDesktopAppResult,
  SetExtAgentProjectPathParams,
  PreviewHomeFsFileParams,
  PreviewHomeFsFileResult,
} from "@envoymesh/api";
import { aiBotThreadKey, isAiBotThread, buildAiBotPrompt } from "@envoymesh/api";
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
  parseDidLookupInput,
  didKeysMatch,
  buildCommerceReceiptFromTaskResult,
  mapCommerceReceiptToActivity,
  type CommerceReceiptRecord,
  type ListCommerceReceiptsParams,
  type RecordCommerceReceiptParams,
  ensureDefaultAutonomousPoliciesForModel,
  hasUsableNonEnvoyLocalModelProvider,
  inferModelProviderPreset,
  resolveEffectiveModelProviders,
  scoreAgentNetworkWorker,
  mergeExtAgentPresets,
  resolveActiveExtAgent,
  normalizeAgentCardMembership,
  extAgentUsesProjectPath,
  normalizeAiSettings,
} from "@envoymesh/api";
import { resolveDidImportInput } from "@envoymesh/api/did-import";
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
  ChainProbeReachabilityParams,
  ChainProbeReachabilityResult,
  ChainStartFromGoalResult,
  ChainExportCostsParams,
  ChainExportCostsResult,
  ChainListRecipesParams,
  ChainListRecipesResult,
  ChainSaveRecipeParams,
  ChainSaveRecipeResult,
  ChainDeleteRecipeParams,
  ChainDeleteRecipeResult,
} from "@envoymesh/api";

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
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
  shouldPushAgentActivity,
  shouldPostA2aChatLine,
  formatA2aChatSystemLine,
  resolveReportContactOwnerId,
  chatRoomThreadKey,
  chatWireAttachmentsToContent,
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
  parseSharePreviewPayload,
  createDiscoveryRequestPayload,
  parseDiscoveryResponsePayload,
  createDiscoveryResponsePayload,
  createSyncStatePayload,
  createRendezvousRegisterPayload,
  createRendezvousQueryPayload,
  RendezvousResponsePayloadSchema,
  createKnowledgeQueryPayload,
  createLibraryReadPayload,
  parseKnowledgeResponsePayload,
  createAgentCardRequestPayload,
  createAgentNetworkProfile,
  createHumanProfileFragmentPayload,
  createSocialIntroProposePayload,
  createSocialIntroOwnerReadyPayload,
  createSocialIntroSyncPayload,
  parseFriendMatchingPreferencesPayload,
  type HumanProfilePayload,
  type EnvoyEnvelope,
  type UnsignedEnvoyEnvelope,
  type DevicePairRequestPayload,
  type AgentRuntime,
  type SkillDescriptor,
  type VerifyMode,
} from "@envoymesh/protocol";
import {
  createDeviceCertificate,
  derivePeerId,
  encryptOwnerKeyForDevice,
  signUnsignedEnvelope,
  verifyFriendMatchingPreferences,
  verifyInboundEnvelope,
  createAgentCredential,
  generateAgentIdentity,
} from "@envoymesh/identity";
import {
  createAuditEvent,
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
  createFamilyProfileStore,
  createFamilyRoomStore,
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
  type FamilyProfileStore,
  type FamilyRoomStore,
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
  type AuditEvent,
  type PeerDirectoryRecord,
} from "@envoymesh/local-store";
import {
  listFamilyProfilesViaRuntime,
  createFamilyProfileViaRuntime,
  updateFamilyProfileViaRuntime,
  wipeFamilyProfileViaRuntime,
  generateFamilyInviteTokenViaRuntime,
  toFamilyProfile,
} from "./node-service-family.js";
import {
  getRpcCaller,
  requireOwnerProfile,
  redactNodeConfigForCaller,
} from "./rpc-caller-context.js";
import {
  OWNER_FAMILY_PROFILE_ID,
  envoyAiThreadKeyForProfile,
  aiBotThreadKeyForProfile,
  bridgeThreadKeyForProfile,
  parseAiBotThreadKey,
  parseBridgeThreadKey,
  isEnvoyAiThreadKey,
  parseEnvoyAiProfileId,
  familyThreadKey,
  parseFamilyThreadKey,
  threadVisibleTo,
  isFamilyThreadKey,
  familyProfileMayUseExtAgent,
  familyProfileMayUseCoding,
  maskBridgeEnabledForExtAgentAccess,
} from "@envoymesh/api";
import { createNodeConfigStore, createStubNodeConfigStore, type PersistedNodeConfig } from "./node-config-store.js";
import {
  readEffectiveSignalOptIn,
  readEffectiveVerifyModeDefault,
} from "./node-config-loader.js";
import { startPairingKioskServer, type PairingKioskServerHandle } from "./pairing-kiosk-server.js";
import { loadOrCreateLibp2pPrivateKey } from "./libp2p-key-loader.js";
import { createDiscoverySeedStore, type DiscoverySeedStore } from "./discovery-seed-store.js";
import { isMeshReadyForSponsorBond } from "./mesh-readiness.js";
import { bondTrace } from "./bond-trace.js";
import { formatSkillResult, StructuredResultError } from "./skill-result-formatter.js";
import { seedAddrsForDiscoveryProfile, peerDiscoverySourceFromMultiaddrs, shouldPersistPeerDiscoverySeeds } from "./peer-discovery-telemetry.js";
import { resolveBootstrapAddresses, looksLikeDomain } from "./bootstrap-resolver.js";
import { createInboundMessageGuard, type InboundMessageGuard } from "./inbound-guard.js";
import { backfillBundledSponsorPeerAddresses, loadBundledSponsorFriendParsed, selectBundledSponsorBackfillAddrs } from "./bundled-sponsor-friend-loader.js";
import { buildModelProviders, routeModelRequest } from "@envoymesh/models";
import { bindDeviceAuthorizationStore } from "./chat-device-auth.js";
// Phase 8 / b3 — the real `askEnvoyHarness` runtime. The
// `loadEnvoyHarnessRuntimeConfig` is the env-var-driven
// readiness check; `createRealEnvoyHarnessRuntime` +
// `RealEnvoyHarnessRuntime` are the lazy-constructed
// stack (ModelAdapter + LocalCrossRuntimeSubmitter +
// EnvoyHarnessAdapter) that backs `askEnvoyHarness`.
import {
  createRealEnvoyHarnessRuntime,
  ENVOY_HARNESS_RUNTIME_SKILLS,
  loadEnvoyHarnessRuntimeConfig,
  shouldAskAcpTool,
  type RealEnvoyHarnessRuntime,
} from "./agent-runtime-envoy/index.js";
import { EnvoyHarnessPersistentAcpHost } from "./agent-runtime-envoy/persistent-acp-host.js";
import { parseEhuiInvokeRequest } from "./agent-runtime-envoy/ehui-invoke.js";
// Phase 8 / Step 3 — the B-class tool factories
// (sponsor_friend / list_peers / relay_status) and the
// deps builders (`createBClass*`) for the host. The
// factory closures capture `this` (NodeServiceImpl) via
// the deps and read the mesh + profile + audit state
// on each call. v0: production always passes bClassTools
// (Step 3 "always opt-in" policy).
import {
  buildRelayStatusTool,
  listPeersTool,
  sponsorFriendTool,
} from "@envoymesh/envoy-harness-adapter";
import {
  createPeerPoolStatusBackend,
  createPeersTool,
  aggregateVerdicts,
} from "@envoymesh/envoy-harness-peer";
import {
  createAgentSessionBackend,
  LocalMemoryStore,
  SessionStore,
  buildAgentSystemPrompt,
  createFilesystemSkillProvider,
  createSkillRegistry,
  createUserQuestionService,
  loadConfigStack,
  resolveAgentRuntimeConfig,
  systemPromptOptionsFromConfig,
  type ConfigLayer,
  type ProtocolSessionBackend,
} from "@envoymesh/envoy-harness";
import {
  createBClassPeerListDeps,
  createBClassRelayStatusDeps,
  createBClassSponsorFriendDeps,
} from "./agent-runtime-envoy/b-class-deps.js";
import {
  aggregateNodeManifest,
  type NodeManifest,
} from "./agent-adapter-manifest-aggregate.js";
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
  type ChatRoomServiceDeps,
} from "./chat-room-service.js";
import {
  buildChatRoomServiceDeps,
  buildRoomDeliveryAckViaRuntime,
  flushPendingRoomMessagesViaRuntime,
  flushPendingRoomSyncsViaRuntime,
  type ChatRoomFlushInput,
  type ChatRoomServiceDepsInput,
} from "./node-service-chat-room-glue.js";
import { buildServiceContextDeps, deriveRelayWsUrl } from "./node-service-impl-service-deps.js";
import { createTaskDispatcher } from "./task-dispatcher.js";
import { CallManager } from "./call-manager.js";
import { pushNotificationService } from "./push-notification.js";
import {
  parseTerminalAssistantCorrelationId,
  stripTerminalAssistantCorrelationPrefix,
} from "./terminal-assistant-command.js";
import { predictIntent } from "./intent-predictor.js";
import { buildVaultIndex, assertPathInsideVault } from "@envoymesh/vault";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ENVOY_MESSAGE_PROTOCOL,
  EnvoyMesh,
  filterBootstrapMultiaddrs,
  filterUsableOutboundPeerDialHints,
  ENVOY_CHAT_PROTOCOL,
  ENVOY_DATA_PROTOCOL,
  hasDirectTcpDialHints,
  hasDirectPrivateLanDialHints,
  isPrivateLanTcpDialHint,
  type EnvoyMeshOptions,
} from "@envoymesh/network";
import { basename, join } from "node:path";
import { openPathWithDefaultApp, revealPathInFileManager } from "./vault-file-open.js";
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
import { deliverCallEnvelopeWithRetry, deliverChatEnvelopeWithRetry, sendExpectReplyWithRetry, type ChatDeliverResult } from "./chat-outbound-deliver.js";
import { handleInboundAgentCardIntent } from "./agent-card-inbound.js";
import {
  AGENT_CARD_REFRESH_CONCURRENCY,
  AGENT_CARD_REFRESH_RELAY_MS,
  AGENT_CARD_REFRESH_WARM_MS,
  agentCardDialHintsBudgetMs,
  agentCardRefreshTimeoutMs,
  mapPoolSettled,
} from "./agent-card-refresh.js";
import { isOutboundPeerRecentlyVerified, markOutboundPeerVerified } from "./outbound-peer-freshness.js";
import { deliverOutboundEnvelope, dialHintsForTransportTarget } from "./mesh-outbound-helper.js";
import { withOutboundSendLock } from "./outbound-send-lock.js";
import { pickBestLibp2pPeerDirectoryRecord, pickConnectedTransportForOwner, pickLibp2pFromConnectedPeers, resolveRecipientEnvelopePeerId } from "./peer-transport-resolve.js";
import { webrtcCallTrace, webrtcCallWarn, shortCallId } from "./webrtc-call-trace.js";
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
import { BRIDGE_AGENT_SCOPE, bridgeAgentScopeNeedsRefresh } from "./bridge/agent-scope.js";
import {
  applyExtAgentSettingsPatch,
  extractExtAgentSettingsPatch,
  loadBridgeConfigFromProfile,
  shouldRebindAgentBridge,
} from "./bridge/bridge-config-store.js";
import { bridgeConfigToStatusFields } from "./bridge/config.js";
import { probeExtAgentReachability } from "./ext-agent-adapter/probe.js";
import { buildExtAgentCommandCatalog } from "./ext-agent-adapter/command-catalog.js";
import { getCachedClaudeCodeSlashCommands } from "./ext-agent-adapter/claudecode-backend.js";
import { buildEnvoyAiCommandCatalog } from "./envoy-ai-command-catalog.js";
import {
  defaultClaudeCodeModel,
  defaultHermesModel,
  defaultOpenHumanModel,
  listHermesModels,
  listOpenHumanModels,
  openHumanTransport,
} from "./ext-agent-adapter/backends.js";
import {
  getExtAgentSessionModel,
  setExtAgentSessionModel as writeExtAgentSessionModel,
  supportsExtAgentSessionModel,
} from "./ext-agent-adapter/session-model-store.js";
import {
  getExtAgentProjectPathCwd,
  syncExtAgentProjectPathsFromAgents,
} from "./ext-agent-adapter/project-path-store.js";
import {
  getHomeFsInfo as readHomeFsInfo,
  listHomeFsEntries as readHomeFsEntries,
  previewHomeFsFile as readHomeFsPreview,
  resolveHomeFsDirectory,
} from "./home-fs.js";
import { discoverObsidianVaults as scanObsidianVaults } from "./discover-obsidian-vaults.js";
import {
  isDesktopAppId,
  openDesktopApp as launchDesktopApp,
} from "./open-desktop-app.js";
import { runMmxMediaCommand as executeMmxMediaCommand } from "./mmx-media.js";
import { saveEnvoyUpload } from "./envoy-uploads.js";
import { buildAgentAttachmentContext } from "./agent-attachment-context.js";
import type { BridgeConfig } from "./bridge/config.js";
import { forwardToAgent, receiveFromAgent } from "./bridge/index.js";
import type { BridgeIdentity } from "./bridge/pipe.js";
import { OPENCLAW_SKILLS, PI_SKILLS, type AgentAdapter } from "@envoymesh/agent-adapter";
import {
  buildSignedCapabilityManifest,
  startManifestBroadcaster,
  type ManifestBroadcastMesh,
} from "./agent-adapter-broadcast.js";
import {
  coerceAgentNetworkWorkerEngine,
  type AgentNetworkWorkerEngine,
} from "./agent-network-worker-engine.js";
import { effectiveBridgeListenPort } from "./service-ports.js";

import { executeTool, type MeshToolContext } from "./tool-registry.js";
import { createMcpConsumerManager } from "./mcp-client-adapter.js";
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
import { buildOutboundDialHints, mergeDialablePeerListenAddrs, shouldPreferCircuitDialHints } from "./outbound-dial-hints.js";
import { buildChatDiagnostics } from "./chat-diagnostics.js";
import { NodeDiscoveryRuntime } from "./node-service-discovery.js";
import { sendSyncStateUpdateViaMesh } from "./node-service-sync.js";
import {
  applyWanJoinInviteViaRuntime,
  buildCompanyInviteInviteContext,
  buildWanRuntimeDeps,
  createWanJoinInviteViaRuntime,
  getCircuitReservationStatusViaRuntime,
  getConnectivityDiagnosticsViaRuntime,
  type NodeWanRuntimeDeps,
} from "./node-service-wan.js";
import { sendLanAutoBondRequest } from "./node-service-lan-auto-bond.js";
import { anLog, anWarn, shortId } from "./agent-network-debug.js";
import {
  LAN_DISCOVERY_SWEEP_FORCE_EVERY_N,
  LAN_DISCOVERY_SWEEP_INTERVAL_MS,
  shouldRunLanDiscoverySweep,
} from "./lan-discovery-sweep.js";
import {
  consumeCompanyInviteViaRuntime,
  createCompanyInviteViaRuntime,
  listCompanyInvitesViaRuntime,
  revokeCompanyInviteViaRuntime,
} from "./node-service-company-invite.js";
import {
  isActiveReviewPairingToken,
  resolveReviewPairing,
} from "./review-pairing.js";
import {
  createFleetManifestViaRuntime,
  importFleetManifestViaRuntime,
  listFleetManifestsViaRuntime,
  revokeFleetManifestViaRuntime,
} from "./node-service-fleet-manifest.js";
import { discoverAndClusterViaRuntime } from "./node-service-discovery-clusterer.js";
import {
  formatMeshIntelligenceReport,
  meshIntelligenceReportViaRuntime,
} from "./node-service-mesh-intelligence.js";
import { runProactiveAgentPassViaRuntime } from "./node-service-proactive-agent.js";
import {
  chatRagSearchViaRuntime,
  runConnectionSuggesterPassViaRuntime,
  runMeshAwarenessPassViaRuntime,
  type AgentPassesContext,
} from "./node-service-agent-passes.js";
import {
  buildIntentHistoryFilePath,
  buildPublishedLibraryFilePath,
  IntentHistoryStore,
  PublishedLibraryStore,
} from "./node-service-persistence.js";
import {
  buildContinuityFilePath,
  ContinuityStore,
  completeContinuitySessionViaRuntime,
  getResumableSessionsViaRuntime,
  startContinuitySessionViaRuntime,
  updateContinuitySessionViaRuntime,
  type ContinuityContext,
} from "./node-service-continuity.js";
import {
  ChainStore,
  chainCounterBidViaRuntime,
  chainDeleteRecipeViaRuntime,
  chainEvaluateBidsViaRuntime,
  chainExportCostsViaRuntime,
  chainGetBidStrategyViaRuntime,
  chainGetDefaultsViaRuntime,
  chainGetReportViaRuntime,
  chainGetStateViaRuntime,
  chainLaunchViaRuntime,
  chainListActiveViaRuntime,
  chainListObservedViaRuntime,
  chainListRecipesViaRuntime,
  chainListReportsViaRuntime,
  chainPinReportViaRuntime,
  chainDeleteReportViaRuntime,
  chainPlanViaRuntime,
  chainPreviewGoalViaRuntime,
  chainRebalanceViaRuntime,
  chainSaveRecipeViaRuntime,
  chainSetBidStrategyViaRuntime,
  chainSetDefaultsViaRuntime,
  chainStartFromGoalViaRuntime,
  type ChainContext,
} from "./node-service-chains.js";
import {
  acceptCallInviteViaRuntime,
  declineCallInviteViaRuntime,
  effectiveCallIceServersViaRuntime,
  endCallViaRuntime,
  getActiveCallViaRuntime,
  onCallEventViaRuntime,
  recordCallRejectedViaRuntime,
  sendCallInviteViaRuntime,
  sendCallReinviteViaRuntime,
  sendCallRejectToOwnerViaRuntime,
  sendCallResponseEnvelopeViaRuntime,
  sendIceCandidateViaRuntime,
  setCallMutedViaRuntime,
  buildFullCallContext,
  type FullCallContext,
} from "./node-service-calls.js";
import {
  acceptPendingHelloViaRuntime,
  blockPeerViaRuntime,
  declinePendingHelloViaRuntime,
  getBondsViaRuntime,
  revokeBondViaRuntime,
  sendHelloViaRuntime,
  unblockPeerViaRuntime,
  type BondContext,
} from "./node-service-bond.js";
import {
  deliverCallEnvelopeToTransportPeerViaRuntime,
  deliverCallEnvelopeViaRuntime,
  deliverChatEnvelopeViaRuntime,
  dialHintsForChatViaRuntime,
  getPeerConnectionInfoViaRuntime,
  raceWithTimeout,
  rememberBondedPeerTransportFromInboundViaRuntime,
  resolveLibp2pPeerForBondOwnerViaRuntime,
  resolvePeerTransportForOwnerViaRuntime,
  sendChatViaRuntime,
  sendAgentChatViaRuntime,
  warmContactConnectionTransportViaRuntime,
  type OutboundMessagingContext,
  type SendAgentChatContext,
} from "./node-service-outbound-messaging.js";
import { ensureContactPath } from "./peer-path.js";
import {
  getOpenClawPluginsViaRuntime,
  getTrendingOpenClawPluginsViaRuntime,
  installOpenClawPluginViaRuntime,
  loadBridgeConfigClawhubToken,
  loadBridgeConfigSkillApiKeys,
  loadBridgeConfigWebSearchEnabled,
  reloadOpenClawConfigViaRuntime,
  resolveOpenClawWorkspaceDirFromProfile,
  saveClawhubTokenViaRuntime,
  saveSkillApiKeysViaRuntime,
  saveWebSearchEnabledViaRuntime,
  searchOpenClawPluginsViaRuntime,
  uninstallOpenClawPluginViaRuntime,
  buildClawHubContext,
  type ClawHubContext,
} from "./node-service-clawhub.js";
import {
  buildOpenClawPluginContext,
  type OpenClawPluginContext,
  listOpenClawExtensionPluginsViaRuntime,
  inspectOpenClawExtensionPluginViaRuntime,
  enableOpenClawExtensionPluginViaRuntime,
  disableOpenClawExtensionPluginViaRuntime,
  installOpenClawExtensionPluginViaRuntime,
  uninstallOpenClawExtensionPluginViaRuntime,
  updateOpenClawExtensionPluginViaRuntime,
} from "./node-service-openclaw-plugins.js";
import {
  createNoteViaRuntime,
  deleteVaultItemViaRuntime,
  convertLibraryItemToMarkdownViaRuntime,
  collectVaultMarkdownIntoNotesViaRuntime,
  syncBlogPostsToKnowledgeViaRuntime,
  listAllLocalFilesViaRuntime,
  listLibraryItemsViaRuntime,
  listOpenClawWorkspaceFilesViaRuntime,
  openLocalFileViaRuntime,
  readLocalFileContentViaRuntime,
  readOpenClawWorkspaceFileViaRuntime,
  resolveOpenClawWorkspacePathViaRuntime,
  setLibraryItemPublishedViaRuntime,
  exportLibraryItemToIpfsViaRuntime,
  getIpfsEngineStatusViaRuntime,
  getRagIndexStatusViaRuntime,
  importToLibraryViaRuntime,
  listAgentShareProposalsViaRuntime,
  dismissAgentShareProposalViaRuntime,
  openLibraryItemViaRuntime,
  pinLibraryItemExternalViaRuntime,
  readLibraryItemContentViaRuntime,
  resolveLibraryItemPathViaRuntime,
  revealLibraryItemInFileManagerViaRuntime,
  submitAgentShareProposalViaRuntime,
  verifyLibraryItemIpfsGatewayViaRuntime,
  type FileShareContext,
  type FileShareNetworkContext,
  discoverPublishedLibraryViaRuntime,
  libraryReadViaRuntime,
  shareFileViaRuntime,
  requestShareFromLibraryViaRuntime,
} from "./node-service-fileshare.js";
import { needsRagReindexAfterMarkdownCollect } from "./vault-markdown-corpus.js";

import {
  createPluginRegistry,
  type PluginRegistry,
} from "./kb-plugin-registry.js";
import { createObsidianPlugin } from "@envoymesh/kb-obsidian";
import { createSensitivityOverrideStore } from "@envoymesh/local-store";
import { createMcpKnowledgePlugin } from "./mcp-knowledge-plugin.js";
import {
  getCapabilityManifestViaRuntime,
  updateCapabilityManifestViaRuntime,
  addRelayViaRuntime,
  removeRelayViaRuntime,
  type CapabilityManifestContext,
} from "./node-service-manifest.js";
import {
  getConnectionStatusViaRuntime,
  getBridgeStatusViaRuntime,
  getOpenClawStatusViaRuntime,
  lookupSessionTokenViaRuntime,
  recordNodeErrorViaRuntime,
  type ConnectionStatusContext,
  type RecordNodeErrorAccess,
  type SessionTokenAccess,
} from "./node-service-connection-status.js";
import {
  getNodeConfigViaRuntime,
  updateNodeConfigViaRuntime,
  type NodeConfigContext,
} from "./node-service-config.js";
import {
  resolveEffectiveSetupSponsorFriend,
  runSetupSponsorFriendOnService,
} from "./node-service-setup-sponsor-friend.js";
import {
  runCapabilityDiscoveryCycleViaRuntime,
  startCapabilityDiscoverySchedulerViaRuntime,
  type CapabilityDiscoveryContext,
} from "./node-service-capability-discovery.js";
import {
  initNodeViaRuntime,
  ensureAgentStoresViaRuntime,
  requireToolExecutionContextViaRuntime,
  type AgentSetupContext,
} from "./node-service-agent-setup.js";
import {
  stopNodeViaRuntime,
  type StopNodeContext,
} from "./node-service-stop.js";
import {
  startNodeViaRuntime,
  type StartNodeContext,
} from "./node-service-start.js";
import {
  wireMeshEventsViaRuntime,
  buildWireMeshInboundContext,
  type WireMeshEventsContext,
  type WireMeshInboundContext,
} from "./node-service-wire-mesh-events.js";
import {
  type SharePreviewContext,
} from "./node-service-handlers-share-preview.js";
import {
  syncPairingKioskFromConfigViaRuntime,
  stopPairingKioskViaRuntime,
  getPairingKioskStatusViaRuntime,
  type PairingKioskContext,
} from "./node-service-pairing-kiosk.js";
import {
  pairDeviceViaRuntime,
  type PairDeviceContext,
} from "./node-service-handlers-pair-device.js";
import {
  pairSharedIdentityViaRuntime,
  type PairSharedIdentityContext,
} from "./node-service-handlers-pair-shared-identity.js";
import {
  getPairingPayloadViaRuntime,
  type GetPairingPayloadContext,
} from "./node-service-handlers-pairing-payload.js";
import {
  runOwnerAgentTurnViaRuntime,
  type RunOwnerAgentTurnContext,
} from "./node-service-handlers-run-owner-agent-turn.js";
import {
  runDocumentAgentTurnViaRuntime,
  runDocumentAgentTurnCoreViaRuntime,
  type RunDocumentAgentTurnContext,
  type RunDocumentAgentTurnLoop,
} from "./node-service-handlers-run-document-agent-turn.js";
import {
  runScheduledFriendAutopilotViaRuntime,
  listSocialProxySessionsViaRuntime,
  advanceSocialProxySessionViaRuntime,
  notifySocialProxyOwnerCommitmentViaRuntime,
  type FriendAutopilotContext,
  type SocialProxyContext,
} from "./node-service-friend-autopilot.js";
import {
  runSocialProxyPassViaRuntime,
  type RunSocialProxyPassContext,
} from "./node-service-handlers-run-social-proxy-pass.js";
import {
  createWanJoinInviteViaPublicRuntime,
  applyWanJoinInviteViaPublicRuntime,
  createCompanyInviteViaPublicRuntime,
  listCompanyInvitesViaPublicRuntime,
  revokeCompanyInviteViaPublicRuntime,
  importFleetManifestViaPublicRuntime,
  listFleetManifestsViaPublicRuntime,
  revokeFleetManifestViaPublicRuntime,
  createFleetManifestViaPublicRuntime,
  buildFleetPublicDeps,
  type FleetPublicDeps,
} from "./node-service-handlers-fleet-manifest.js";
import {
  startDocumentAcquisitionJobViaPublicRuntime,
  getDocumentAcquisitionJobViaPublicRuntime,
  listDocumentAcquisitionJobsViaPublicRuntime,
  cancelDocumentAcquisitionJobViaPublicRuntime,
  runDocumentAcquisitionWorkerViaPublicRuntime,
  startCapabilityProviderJobViaPublicRuntime,
  getCapabilityProviderJobViaPublicRuntime,
  listCapabilityProviderJobsViaPublicRuntime,
  cancelCapabilityProviderJobViaPublicRuntime,
  runCapabilityProviderWorkerViaPublicRuntime,
  buildDocAcqCapProvDeps,
  type DocAcqCapProvDeps,
} from "./node-service-handlers-doc-acq-cap-prov.js";
import {
  listAgentActivityViaRuntime,
  listCommerceReceiptsViaRuntime,
  listAgentCardsViaRuntime,
  getAgentCardViaRuntime,
  listAgentCirclesViaRuntime,
  buildStoreAccessorDeps,
  type StoreAccessorDeps,
} from "./node-service-handlers-store-accessors.js";
import {
  terminalAttachViaRuntime,
  terminalRunFromNaturalLanguageViaRuntime,
  terminalExecuteProposalViaRuntime,
  terminalSetAssistModelOverrideViaRuntime,
  terminalGetAssistStateViaRuntime,
  terminalExplainScrollbackViaRuntime,
  terminalSuggestCommandViaRuntime,
  terminalObserveStepViaRuntime,
  terminalSetInlineSuggestEnabledViaRuntime,
  terminalOpenClawPlanViaRuntime,
  terminalRunPlanStepViaRuntime,
  terminalEnablePrepareModeViaRuntime,
  terminalWatchStepViaRuntime,
  terminalPinContextSessionViaRuntime,
  terminalDetectFailureViaRuntime,
  terminalSuggestFixFromFailureViaRuntime,
  terminalStartGoalLoopViaRuntime,
  terminalAdvanceGoalLoopViaRuntime,
  terminalCancelGoalLoopViaRuntime,
  terminalClearResumeGoalViaRuntime,
  terminalSendContextToAssistantViaRuntime,
  terminalUpdatePlanProgressViaRuntime,
  terminalGetScrollbackPreviewViaRuntime,
  terminalResumeGoalLoopViaRuntime,
  terminalEnableExecPaneViaRuntime,
} from "./node-service-handlers-terminal.js";
import {
  terminalExecViaRuntime,
  type TerminalExecContext,
} from "./node-service-handlers-terminal-exec.js";
import {
  openInHerdrViaRuntime,
  terminalGetHerdrExportHintViaRuntime,
  type OpenInHerdrContext,
  type TerminalGetHerdrExportHintContext,
} from "./node-service-handlers-herdr.js";
import {
  startRelayClientScheduler,
  runRelayClientCycle,
  setRelayClientAdvertisedTopics,
  replaceRelayClientAdvertisedTopics,
  queryRelayLookupWithDeps,
  resolveRelayClientControlTargets,
  type RelayClientCycleDeps,
} from "./relay-client-cycle.js";
import { publishWebContentEntry as publishWebContentEntryAuthor, ensureDefaultWebSite as ensureDefaultWebSiteAuthor, listWebContentSections as listWebContentSectionsAuthor, listFeedPosts as listFeedPostsAuthor, listBlogPosts as listBlogPostsAuthor, deleteWebContentEntry as deleteWebContentEntryAuthor, galleryPhotoWallStablePath, removeGalleryPhotoWallMirror, updateGalleryPhotoWallVisibility, publishProfilePortal } from "./web-content-author.js";
import { sendFeedNotifyToBonds, sendFeedNotifyToOwner, type FeedNotifyPublishMeta } from "./feed-notify-outbound.js";
import {
  enqueueFeedNotifyOutboxItem,
  listFeedNotifyOutboxForRecipient,
  loadFeedNotifyOutbox,
  removeFeedNotifyOutboxItem,
  compactFeedNotifyOutbox,
} from "./feed-notify-outbox.js";
import {
  enqueueFeedEngageOutboxItem,
  listFeedEngageOutboxForRecipient,
  loadFeedEngageOutbox,
  removeFeedEngageOutboxItem,
  compactFeedEngageOutbox,
} from "./feed-engage-outbox.js";
import { listFeedTimeline as listFeedTimelineMerged } from "./feed-timeline.js";
import { scheduleFeedBackfillForMissingPeers } from "./feed-backfill.js";
import { sendFeedEngageToOwner } from "./content-engage-outbound.js";
import {
  addContentCommentInStore,
  loadContentEngagement,
  removeContentCommentInStore,
  summarizeEngagement,
  toggleContentStarInStore,
} from "./content-engagement-store.js";
import {
  dismissFeedNotifyInboxItem,
  dismissAllFeedNotifyInboxItems,
  listFeedNotifyRecent,
} from "./feed-notify-store.js";
import {
  dismissContentEngageInbox,
  loadContentEngageInbox,
  surfaceForContentUrl,
} from "./content-engage-inbox-store.js";
import { handleInboundLibraryRead } from "./library-read-inbound.js";
import { recordMeshActivity, resolveConnectivityRuntime, type ResolvedConnectivityRuntime } from "./connectivity-runtime.js";
import { startNodeStatsInterval } from "./node-stats-log.js";
import { tryBondAutonomyInboundAutoAccept } from "./bond-autonomy-inbound.js";

import {
  resolveDidImportViaRuntime,
  resolveDidExportViaRuntime,
  acceptHelloViaRuntime,
  declineSocialIntroProposalViaRuntime,
  type MiscDelegationsContext,
} from "./node-service-handlers-misc-delegations.js";

import {
  _advertiseInterests,
  _advertiseInterestsIfPublic,
  _advertisePublicDiscoveryTopics,
  _probeNearbyPeerProfileAfterDiscovery,
  cacheDidContactKeyViaRuntime,
  exportDidDocumentViaRuntime,
  getAgentIdentityViaRuntime,
  getHumanProfileViaRuntime,
  getOwnerDidPresentationViaRuntime,
  getPeerProfileViaRuntime,
  getPeerReputationSummaryViaRuntime,
  getProfileViaRuntime,
  handleInboundProfileIntentViaRuntime,
  listPeerProfilesViaRuntime,
  refreshBondPeerProfilesViaRuntime,
  removeProfileGalleryPhotoViaRuntime,
  setPublicProfileThumbnailViaRuntime,
  syncProfileToBondsViaRuntime,
  updateAgentIdentityViaRuntime,
  updateHumanProfileViaRuntime,
  updateProfileGalleryPhotoVisibilityViaRuntime,
  upsertProfileGalleryPhotoViaRuntime,
  buildIdentityContext,
  type IdentityContext,
} from "./node-service-identity.js";

import {
  _appendChainAudit,
  _autoEvaluateSubtask,
  _bondLevelForWorkerOwner,
  _chainDiagnosticsForSubtasks,
  _emitChainReport,
  _emitChainState,
  cancelChainOwnerAction,
  reassignSubtaskOwnerAction,
  retryInputDeliveryOwnerAction,
  _chainTransportResolver,
  _evaluateAwardAndAccept,
  _executeApprovedChainAward,
  _queueChainAwardApproval,
  _rollbackSubtaskAward,
  _runChainGoal,
  _scheduleAutoEvaluate,
  _startChainTracking,
  _stopChainTracking,
  bidsBySubtask,
  buildChainContext,
  buildChainOrchestrationContext,
  buildChainInboundDeps,
  buildChainOrchestratorDeps,
  buildChainWorkerDeps,
  chainWorkerSubtasksToTeamJobs,
  ensureChainMandateLoaded,
  evaluateBidsAsync,
  findAgentNetworkWorkers,
  findAgentNetworkWorkersRanked,
  handleInboundChainEnvelope,
  listAllVerdictEntries,
  listAgentCardsIncludingLocal,
  placeholderMandate,
  refreshAgentNetworkMembershipIndex,
  sameLanFromListenAddrs,
  snapshotToResult,
  type ChainOrchestrationContext,
} from "./node-service-chain-orchestration.js";
import { handleInboundCapabilityManifest } from "./agent-adapter-manifest-inbound.js";
import { getLocalRuntimePassRate } from "./node-service-chain-orchestration.js";
import { handleInboundScoreboardRule } from "./scoreboard-rule-inbound.js";
import {
  startScoreboardRuleBroadcaster,
  type ScoreboardRuleBroadcastMesh,
} from "./scoreboard-rule-broadcast.js";
import { VerifierScoreboard } from "./verifier-scoreboard.js";

import {
  buildAgentPassesContext,
  buildAgentSetupContext,
  buildBondContext,
  buildBondHandlerContext,
  buildCapabilityDiscoveryContext,
  buildChatMessageContext,
  buildChatRoomMessageContext,
  buildChatRoomSyncContext,
  buildConnectionStatusContext,
  buildContinuityContext,
  buildFileShareContext,
  buildFileShareNetworkContext,
  buildFriendAutopilotContext,
  buildGetPairingPayloadContext,
  buildManifestContext,
  buildMiscDelegationsContext,
  buildNodeConfigContext,
  buildOpenInHerdrContext,
  buildOutboundMessagingContext,
  buildPairDeviceContext,
  buildPairSharedIdentityContext,
  buildPairingKioskContext,
  buildPersistenceContext,
  buildRecordNodeErrorContext,
  buildRequestPeerProfileContext,
  buildRunDocumentAgentTurnContext,
  buildRunOwnerAgentTurnContext,
  buildRunSocialProxyPassContext,
  buildSessionTokenContext,
  buildSharePreviewContext,
  buildSmallProfileDelegationsContext,
  buildSocialProxyContext,
  buildStartNodeContext,
  buildStopNodeContext,
  buildTerminalContext,
  buildTerminalExecContext,
  buildTerminalGetHerdrExportHintContext,
  buildValidatePairingTokenContext,
  buildWireMeshEventsContext,
  type ServiceContextDeps,
} from "./node-service-contexts.js";

import {
  type ChatRoomSyncContext,
} from "./node-service-handlers-chat-room-sync.js";

import {
  recordIntentViaRuntime,
  loadIntentHistoryFromDiskViaRuntime,
  persistPublishedLibraryViaRuntime,
  loadPublishedLibraryFromDiskViaRuntime,
  getContactTopicsFromLibraryViaRuntime,
  type PersistenceContext,
} from "./node-service-handlers-persistence.js";

import {
  validatePairingTokenViaRuntime,
  type ValidatePairingTokenContext,
} from "./node-service-handlers-validate-pairing-token.js";

import {
  type SmallProfileDelegationsContext,
} from "./node-service-handlers-small-profile-delegations.js";

import {
  requestPeerProfileViaRuntime,
  type RequestPeerProfileContext,
} from "./node-service-handlers-request-peer-profile.js";

import {
  type ChatMessageContext,
} from "./node-service-handlers-chat-message.js";

import {
  type ChatRoomMessageContext,
} from "./node-service-handlers-chat-room-message.js";

import {
  type BondHandlerContext,
} from "./node-service-handlers-bond-intent.js";
import { handleInboundKnowledgeQuery } from "./knowledge-query-inbound.js";
import { askOwnerAgentPlanner, scanOwnerAgentOutbound } from "./owner-agent-planner-inbound.js";
import { loadAgentIdentitySection } from "./agent-identity-context.js";
import {
  askOpenClawViaRuntime,
  beginOpenClawToolTracking,
  buildOpenClawTurnContextViaRuntime,
  createOpenClawRuntimeState,
  endOpenClawToolTracking,
  ensureOpenClawReadyViaRuntime,
  isOpenClawEnabledViaRuntime,
  isOpenClawReadyViaRuntime,
  loadEnvoyAiChatHistoryViaRuntime,
  persistEnvoyAiChatExchangeViaRuntime,
  recordEnvoyAiChatMessageViaRuntime,
  recordOpenClawToolCallViaRuntime,
  resolveOpenClawReply as resolveOpenClawReplyViaRuntime,
  hasOpenClawPendingReply as hasOpenClawPendingReplyViaRuntime,
  bindOpenClawPendingReplyPersistence as bindOpenClawPendingReplyPersistenceViaRuntime,
  loadAndReportOrphanedOpenClawPendingReplies as loadAndReportOrphanedOpenClawPendingRepliesViaRuntime,
  sendToOpenClawViaRuntime,
  startOpenClawViaRuntime,
  stopOpenClawViaRuntime,
  restartOpenClawViaRuntime,
  buildOpenClawRuntimeDeps,
  type OpenClawRuntimeDeps,
} from "./node-service-openclaw-runtime.js";
import {
  createPiRuntimeState,
  buildPiRuntimeDeps,
  startPiViaRuntime,
  stopPiViaRuntime,
  restartPiViaRuntime,
  ensurePiReadyViaRuntime,
  askPiViaRuntime,
  askPiForExtAgentViaRuntime,
  getPiStatusViaRuntime,
  isPiEnabledViaRuntime,
  isPiReadyViaRuntime,
  respondToUiRequestViaRuntime,
  type PiRuntimeStateMutable,
  type PiRuntimeDeps,
} from "./node-service-pi.js";
import { AcpPermissionBridge } from "./node-service-acp-ui.js";
import { AcpUserQuestionBridge } from "./node-service-eh-user-question.js";
import { EhPermissionBridge } from "./node-service-eh-permission.js";
import { buildEhPromptPayload, pathFromEhActivity } from "./agent-runtime-envoy/eh-prompt-attachments.js";
import { resolvePiCodingBackend } from "./pi-coding-backend.js";
import {
  ensurePiTerminalSession,
  resolvePiProjectDir,
} from "./pi-terminal-session.js";
import { ensureEnvoyTerminalSession } from "./envoy-terminal-session.js";
import {
  createEnvoyHarnessSessionStore,
  deleteEhChatTurnFromStore,
  loadEhChatHistoryFromStore,
  mergeSessionMapping,
  normalizeEhWorkspaceCwd,
  resolveEhSessionIdForCwd,
} from "./envoy-harness-workspace.js";
import { EhChatRuntime } from "./eh-chat-runtime.js";
import {
  assertEhChatCapacity,
  findEhChatByCwd,
  findEhChatById,
  migrateLegacyEhChats,
  removeEhChat,
  sortEhChats,
  summarizeEhChats,
  touchEhChat,
  upsertEhChatSessionId,
  updateEhChatCwd,
} from "./envoy-harness-chats.js";
import {
  cancelEnvoyLocalDownloadViaRuntime,
  checkEnvoyLocalEngineUpdateViaRuntime,
  createEnvoyLocalRuntimeState,
  declineEnvoyLocalAutoProvisionViaRuntime,
  deleteEnvoyLocalModelViaRuntime,
  disableEnvoyLocalViaRuntime,
  downloadEnvoyLocalModelViaRuntime,
  enableEnvoyLocalViaRuntime,
  getEnvoyLocalStatusViaRuntime,
  setEnvoyLocalDownloadRegionViaRuntime,
  listEnvoyLocalInstalledModelsViaRuntime,
  maybeDisableEnvoyLocalForExternalProvider,
  maybeStartEnvoyLocalOnBootViaRuntime,
  resetEnvoyLocalServerParamsViaRuntime,
  restartEnvoyLocalViaRuntime,
  searchEnvoyLocalModelsViaRuntime,
  setEnvoyLocalActiveModelViaRuntime,
  startEnvoyLocalViaRuntime,
  stopEnvoyLocalViaRuntime,
  haltEnvoyLocalChildViaRuntime,
  updateEnvoyLocalEngineViaRuntime,
  updateEnvoyLocalServerParamsViaRuntime,
  type EnvoyLocalRuntimeDeps,
  type EnvoyLocalRuntimeState,
} from "./envoy-local-runtime.js";
import {
  createEnvoyLocalEmbedRuntimeState,
  disableEnvoyLocalEmbedViaRuntime,
  enableEnvoyLocalEmbedViaRuntime,
  ensureEnvoyLocalEmbedRunningViaRuntime,
  getEnvoyLocalEmbedStatusViaRuntime,
  haltEnvoyLocalEmbedChildViaRuntime,
  healEnvoyLocalEmbedWedgeViaRuntime,
  listEnvoyLocalInstalledEmbedModelsViaRuntime,
  maybeStartEnvoyLocalEmbedOnBootViaRuntime,
  noteEnvoyLocalEmbedActivity,
  noteEnvoyLocalEmbedSuccess,
  setEnvoyLocalEmbedActiveModelViaRuntime,
  stopEnvoyLocalEmbedViaRuntime,
  type EnvoyLocalEmbedRuntimeDeps,
  type EnvoyLocalEmbedRuntimeState,
} from "./envoy-local-embed-runtime.js";
import { migrateEmbeddingSettings } from "@envoymesh/rag";
import {
  createVaultRagWatcher,
  type VaultRagWatcherHandle,
} from "./vault-rag-watcher.js";
import {
  acceptShareViaRuntime,
  buildTransferInboundContext,
  clearPendingShareStateForPreviewViaRuntime,
  consumeInboundDataTransferSaveMappingViaRuntime,
  createTransferStateBundle,
  declineShareViaRuntime,
  getTransferStatusViaRuntime,
  linkOutboundSharePreviewFromInboundViaRuntime,
  listActiveTransfersViaRuntime,
  listPendingShareOffersViaRuntime,
  maybeAutoAcceptChatShareViaRuntime,
  maybeSendShareFileForInboundAcceptViaRuntime,
  notifyInboundTransferVerifiedViaRuntime,
  reconcileInboundDirectChatMessageViaRuntime,
  recordInboundPullSharePreviewViaRuntime,
  recordInboundPushShareOfferViaRuntime,
  registerResponderFileSendAfterPreviewViaRuntime,
  resolveInboundDataTransferRelativePathViaRuntime,
  sanitizeChatFilename,
  type TransferInboundContext,
} from "./node-service-transfer-inbound.js";
import {
  handleMeshPeerDiscoveredViaRuntime,
  resyncBondedContactReachabilityTagsViaRuntime as resyncReachabilityTagsViaRuntime,
  scrubBondedContactDialStateViaRuntime,
  startBondWarmIntervalViaRuntime,
  tagBondedContactReachabilityViaRuntime,
  untagReachabilityForOwnerViaRuntime,
  buildReachabilityContext,
  type ReachabilityContext,
  NON_ENVOY_PEER_SUPPRESS_AFTER_FAILURES,
  NON_ENVOY_PEER_SUPPRESS_COOLDOWN_MS,
} from "./node-service-reachability.js";
import {
  chainStateSnapshot,
  counterBid,
  createChainState,
  evaluateBids,
  handleOrchestratorBid,
  handleOrchestratorHeartbeat,
  handleOrchestratorMerge,
  handleOrchestratorPartial,
  launchChain,
  planChain,
  rebalanceChain,
  sendChainAccept,
  trackChain,
  type ChainOrchestratorHandlerDeps,
  type ChainState,
} from "./chain-orchestrator.js";
import { AgentNetworkMembershipIndex } from "./capability-index.js";
import {
  extractChainIdFromEnvelope,
  sendChainEnvelopeOverMesh,
  type ChainTransportResolver,
} from "./chain-production.js";
import { dispatchChainEnvelope } from "./chain-inbound.js";
import type { ChainInboundDeps } from "./chain-inbound-types.js";
import {
  handleWorkerAccept,
  handleWorkerCancel,
  handleWorkerHeartbeat,
  handleWorkerMandate,
  handleWorkerPropose,
  type ChainWorkerHandlerDeps,
} from "./chain-worker.js";
import {
  evaluateAndAcceptBestBid,
  subtasksAwaitingAward,
  tryCompleteChainIfReady,
  chainBudgetWarningLevel,
} from "./chain-auto-orchestrator.js";
import {
  CHAIN_AUTO_EVALUATE_MS,
  CHAIN_GOAL_TEMPLATES,
  DEFAULT_CHAIN_DEFAULTS,
  estimateChainCostRange,
  mergeChainDefaults,
} from "./chain-defaults.js";
import { executeAcceptedSubtask } from "./chain-worker-executor.js";
import { chainCostsToCsv } from "./chain-cost-export.js";
import { requiresChainAwardApproval } from "./chain-sensitivity-gate.js";
import {
  buildAllLocalFilesList,
} from "./local-files.js";
import {
  assertPathInsideOpenClawWorkspace,
  listOpenClawWorkspaceFilesFromDir,
  readOpenClawWorkspaceFileFromDir,
  type WorkspaceFileItem,
} from "./openclaw-workspace-files.js";
import { runInboundChatAssist } from "./inbound-chat-assist.js";
import { recordTaskJournalActivity, emitOwnerReport } from "./agent-activity-hooks.js";
import { recordCommerceReceiptFromTaskResult } from "./commerce-receipt-inbound.js";
import type { Report } from "@envoymesh/protocol";
import type { DispatcherDecision } from "./task-dispatcher.js";
import type { ApprovalQueue, DiscoveryForwardApprovalPayload, ChainAwardApprovalPayload } from "@envoymesh/api";
import { createApprovalItem, executeApprovedAction } from "@envoymesh/api";
import {
  buildForwardedDiscoveryPayload,
  queueDiscoveryForwardApproval,
} from "./discovery-forward.js";
import { executeHomeClawCoreProxy } from "./homeclaw-core-proxy.js";
import { chatLogRowsToViews, searchVaultKnowledgeBase } from "./ai-context.js";
import { createRagService, type RagService } from "./rag-service.js";

const MAX_FRIEND_MATCHING_PREFS_CHARS = 4096;

/**
 * Phase 8 / v1.5 — the env-var that gates the
 * per-prompt cost cap. When set to `"1"`, the
 * `/cost:N` hint is honored (the per-prompt
 * cap wins over the per-skill default).
 * When unset (the default), the cost cap is
 * parsed + recorded on the decision but the
 * runtime uses the per-skill default — the
 * v0 behavior, preserved.
 *
 * **Why a single env var (Q9 of the v1.5
 * sub-plan, "keep it simple"):** the cost
 * feature is dormant in v1.5. The EH
 * runtime's cost tracking isn't mature
 * enough to enforce a per-call cap
 * reliably yet. The env var is the
 * simplest flag; a future chunk can
 * graduate to a persisted field when the
 * runtime has real cost tracking.
 */
const COST_CAP_ENABLED_ENV_VAR = "ENVOY_HARNESS_COST_CAP_ENABLED";

/**
 * Phase 8 / v1.5 — resolve the effective cost
 * cap for a single ask call.
 *
 * **Precedence** (Q7 of the v1.5 sub-plan):
 * 1. `perPromptCap` (parsed from `/cost:N`)
 *    when `COST_CAP_ENABLED_ENV_VAR === "1"`.
 * 2. `defaultCap` (the per-skill
 *    `costCeilingUsd` for `askEnvoyHarnessSkill`;
 *    the v0 default `1.0` for `askEnvoyHarness`).
 *
 * **Why a small helper (vs. inline in both
 * ask methods):** the precedence rule is
 * duplicated in 2 places (the free-form
 * ask + the per-skill ask). The helper
 * is 3 lines; inline would be 3 lines per
 * call site (6 total). The helper is
 * also easy to test in isolation.
 *
 * @param perPromptCap The cap parsed from the
 *   prompt (undefined when no hint).
 * @param defaultCap The per-skill / v0
 *   default to use when the flag is off or
 *   no hint is present.
 * @returns The effective cap to pass to the
 *   runtime.
 */
function readEffectiveCostCapUsd(
  perPromptCap: number | undefined,
  defaultCap: number,
): number {
  const costCapEnabled =
    process.env[COST_CAP_ENABLED_ENV_VAR] === "1";
  if (costCapEnabled && perPromptCap !== undefined) {
    return perPromptCap;
  }
  return defaultCap;
}

/**
 * Phase 42 — default `iceServers` injected into `call.invite` when the
 * caller did not provide a list and the home's `node-config.json` has none.
 * Three public STUN endpoints; TURN is user-configured (Phase 42H).
 */
const DEFAULT_ICE_SERVERS: { urls: string; username?: string; credential?: string }[] = [
  { urls: "stun:stun.miwifi.com:3478" },
  { urls: "stun:stun.nextcloud.com:3478" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

/** Intents allowed on the native / bridge agent credential for document + mesh tools. */
const NATIVE_AGENT_TOOL_SCOPE = BRIDGE_AGENT_SCOPE;

/**
 * Phase 34: project a stored `AgentCard` row (whatever its full shape) into
 * the minimal `CachedAgentCardSummary` the UI consumes. Only the rich optional
 * fields actually present on the source card are forwarded so the UI can
 * `if (card.nodeProfile)` rather than guess.
 */
function summarizeAgentCard(row: {
  ownerId: string;
  card: {
    displayName: string;
    membership?: string[];
    /** Legacy field — pre-membership rename on disk. */
    capabilities?: string[];
    nodeProfile?: CachedAgentCardSummary["nodeProfile"];
    publicTopics?: string[];
    trustPolicySummary?: CachedAgentCardSummary["trustPolicySummary"];
    supportedProtocolVersions?: string[];
    webContentRoot?: string;
    agentNetworkProfile?: CachedAgentCardSummary["agentNetworkProfile"] & {
      /** Legacy field — pre-skills rename on disk. */
      strengths?: string[];
    };
  };
  cachedAt: string;
  sourceAgentPeerId?: string;
}): CachedAgentCardSummary {
  const membership = normalizeAgentCardMembership(
    row.card.membership ?? row.card.capabilities,
  );
  const summary: CachedAgentCardSummary = {
    ownerId: row.ownerId,
    displayName: row.card.displayName,
    membership,
    cachedAt: row.cachedAt,
    sourceAgentPeerId: row.sourceAgentPeerId,
  };
  if (row.card.nodeProfile !== undefined) summary.nodeProfile = row.card.nodeProfile;
  if (row.card.publicTopics) summary.publicTopics = row.card.publicTopics;
  if (row.card.trustPolicySummary) summary.trustPolicySummary = row.card.trustPolicySummary;
  if (row.card.supportedProtocolVersions) {
    summary.supportedProtocolVersions = row.card.supportedProtocolVersions;
  }
  if (row.card.webContentRoot) {
    summary.webContentRoot = row.card.webContentRoot;
  }
  if (row.card.agentNetworkProfile) {
    const raw = row.card.agentNetworkProfile;
    summary.agentNetworkProfile = createAgentNetworkProfile({
      ...raw,
      skills: raw.skills ?? raw.strengths ?? [],
    });
  }
  return summary;
}

/** Per-topic DHT provide/cancel cap so profile save does not block on sparse WAN bootstrap. */

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
  private _deferredExternalMeshStart?: () => Promise<void>;
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
  /** Periodic prune of unbounded per-peer Maps to prevent memory leaks over multi-week runs. */
  private _memoryPruneTimer: ReturnType<typeof setInterval> | null = null;
  private readonly _agentActivityStore: LocalAgentActivityStore | null;
  private readonly _agentCardStore: AgentCardStore | null;
  private readonly _chatDraftStore: ChatDraftStore | null;
  private readonly _autoReplyLimitStore: AutoReplyLimitStore | null;
  private readonly _capabilityManifestStore: CapabilityManifestStore | null;
  private readonly _configStore: ReturnType<typeof createNodeConfigStore>;
  private readonly _profileDir: string;
  /** Lazily-built local verifier scoreboard (§9.2); undefined = not computed yet. */
  private _verifierScoreboard: VerifierScoreboard | undefined | null = undefined;
  /** Root directory for {@link listLibraryItems} (ENVOYMESH_VAULT or shared_vault). */
  private readonly _vaultDir: string;
  private _ragService: RagService | null = null;
  private _ragServiceInit: Promise<RagService | null> | null = null;
  
  private _agentGroupChatCounters: Map<string, { count: number; windowStart: number }> = new Map();

  // App-managed mode stores
  private _taskStore: LocalTaskStore | undefined;
  private _relayStateStore: RelayStateStore | undefined;
  private _discoverySeedStore: DiscoverySeedStore | undefined;
  private _taskRuntimeStore: TaskRuntimeStateStore | undefined;
  private _inboundGuard: InboundMessageGuard | undefined;
  private _taskDispatcher: ReturnType<typeof createTaskDispatcher> | undefined;

  /** Bootstrap peer IDs to exclude from discovery UI (set during start). */
  _bootstrapPeerIdSet: Set<string> = new Set();

  private _nodeStatus: NodeStatus = "offline";
  private _bridgeStatus: BridgeStatus | null = null;
  /** Cached node-owner AN worker engine (default OpenClaw). */
  private _agentNetworkWorkerEngine: AgentNetworkWorkerEngine = "openclaw";
  /** Cached `bridgeEnabled` for sync Ext AN readiness. */
  private _bridgeEnabledCached = true;
  /** True after a successful hydrate from disk (or getNodeConfig / update). */
  private _agentNetworkWorkerEngineHydrated = false;
  private _bridgeChatHandler: ((envelope: EnvoyEnvelope, remotePeerId: string) => Promise<void>) | null = null;
  /** Hot-apply Ext Agent URL without restarting the bridge HTTP server. */
  private _bridgeUpdateLiveConfig:
    | ((next: BridgeConfig | Partial<BridgeConfig>) => BridgeConfig)
    | null = null;
  /** Stop/recreate bridge HTTP when enable / listen port / secret change. */
  private _bridgeRebindHandler: ((reason: string) => Promise<void>) | null = null;
  /** Start/stop Hermes/OpenHuman local `/message` sidecars when Ext Agent changes. */
  private _extAgentSidecarSyncer:
    | ((cfg: {
        bridgeEnabled: boolean;
        activeExtAgentId?: string;
        bridgeListenPort: number;
        bridgeSecret?: string;
        forceRestart?: boolean;
      }) => Promise<void>)
    | null = null;
  private _relayBookProvider: (() => Array<{ relayId: string; region?: string; addrs: string[] }>) | null = null;
  private _styleAdapter: import("./style-adapter.js").StyleAdapter | null = null;
  private _wsPort: number = 3030;
  private _wsPath: string = "/ws";
  private _relayPublicWsUrl: string | undefined;
  private _terminalManager: import("./terminal-manager.js").TerminalManager | null = null;
  private _terminalAgentAssist: import("./terminal-agent-assist.js").TerminalAgentAssist | null = null;
  /**
   * TTL cache for the enriched terminal session list. The Social UI
   * triggers 3-4 parallel `listTerminalSessions()` calls when the user
   * opens the Terminals tab (one each from TerminalSidebar + TerminalPanel
   * effect dependencies), and each call walks every session's scrollback
   * + reads the approval queue. The cache deduplicates those calls into a
   * single underlying read, refreshed at most ~3 Hz.
   *
   * Invalidation: any terminal-manager `notifyChanged` event clears the
   * cache, so subsequent reads immediately observe the new state. The
   * TTL is a back-stop against missed invalidations from a future refactor.
   */
  private _terminalListCache:
    | { at: number; result: Promise<import("@envoymesh/api").TerminalSessionSummary[]> }
    | null = null;
  private static readonly _TERMINAL_LIST_CACHE_TTL_MS = 350;
  /**
   * TTL cache for the pending-approval count used by terminal activity
   * enrichment. The count is also re-read on every `listPendingApprovals`
   * call inside `_enrichTerminalSessions`, and that IPC re-read 4× per
   * tab open was a measurable cost. Caching the count for 1s cuts the
   * total to one read per second regardless of how many list calls
   * arrive, while staying invisible at human time scales.
   */
  private _pendingApprovalCountCache: { at: number; count: number } | null = null;
  private static readonly _PENDING_APPROVAL_COUNT_CACHE_TTL_MS = 1000;
  /** Phase 35D — handle to the pairing-kiosk HTTP server (when enabled). */
  private _pairingKiosk: PairingKioskServerHandle | null = null;
  /** Phase 38 — per-node call session manager (voice/video calls). */
  readonly callManager = new CallManager();
  /** Phase 40F — worker capability index for chain worker discovery. */
  private readonly _capabilityIndex = new AgentNetworkMembershipIndex();
  private _capabilityIndexReady: Promise<void> | null = null;
  /** Debounce timer for pushing our Agent Card after worker-profile edits. */
  private _announceLocalAgentCardTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly _ANNOUNCE_LOCAL_AGENT_CARD_DEBOUNCE_MS = 1_000;
  /** Bond autonomy daily counter — resets at midnight UTC to enforce maxAutoBondsPerDay. */
  private _bondAutonomyDailyCounter = { count: 0, date: "" };
  // ---------------------------------------------------------------
  // Chain runtime state — bundle of 6 Map fields used by the chains
  // orchestrator (see ./node-service-chains.ts). Grouped into a single
  // sub-object so the field list is easier to read.
  // ---------------------------------------------------------------
  private readonly _chainState = {
    pendingBidExpirations: new Map<string, string>(),
    trackAbort: new Map<string, AbortController>(),
    workerSubtasks: new Map<
      string,
      {
        subtask: import("@envoymesh/protocol").ChainSubtask;
        orchestratorPeerId: string;
      }
    >(),
    autoEvaluateTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    goals: new Map<string, string>(),
    costEstimates: new Map<string, { minUsd: number; maxUsd: number }>(),
    awardModes: new Map<string, "direct" | "competitive">(),
    showCostUi: new Map<string, boolean>(),
    assignmentModes: new Map<string, "skill" | "role">(),
    planWarnings: new Map(),
    pendingExtendSteps: new Map(),
    iterationObservers: new Map<string, string>(),
    observedChains: new Map(),
    lastStatusBroadcastAt: new Map<string, number>(),
    readyProbeCache: new Map(),
    remoteManifests: new Map(),
    inputGcDone: new Set<string>(),
  } as const;

  /** Latest QR / `getPairingPayload` token for optional companion auto-pair (short TTL). */
  private _pairingToken: string | null = null;
  private _pairingTokenIssuedAt = 0;
  private static readonly _pairingTokenTtlMs = 30 * 60 * 1000; // 30 minutes

  /** Persistent session token store for long-lived pairings (no QR re-scan). */
  private readonly _sessionTokenStore: SessionTokenStore | null;
  /** Phase 51 — local family profiles on this home node. */
  private readonly _familyProfileStore: FamilyProfileStore | null;
  /** Phase 51D — local family group rooms (never mesh-synced). */
  private readonly _familyRoomStore: FamilyRoomStore | null;
  private _familyOwnerMigrated = false;
  /** Phase 51 — FIFO of profileIds awaiting async Ext Agent replies. */
  private _pendingBridgeReplyProfiles: string[] = [];
  private _thinClientProfileOnlineCheck: ((profileId: string) => boolean) | null = null;
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
  private _pluginRegistry: import("./kb-plugin-registry.js").PluginRegistry | null = null;

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

  /** Outbound push/pull and preview-send state lives in {@link _transferState}. */
  /** Serialize outbound chat streams per libp2p peer to avoid concurrent newStream races. */
  private static readonly _PROFILE_REQUEST_COOLDOWN_MS = 15_000;
  private static readonly _NEARBY_PROFILE_PROBE_COOLDOWN_MS = 30_000;
  private readonly _profileRequestInflight = new Map<
    string,
    Promise<{ ok: boolean; reason?: string }>
  >();
  private readonly _profileRequestLastAt = new Map<string, number>();
  private readonly _nearbyProfileProbeLastAt = new Map<string, number>();
  private readonly _nearbyProfileProbeInflight = new Set<string>();
  /** Last peer:discovered payloads for Discover hydrate (WS reconnect / tab open). */
  private readonly _nearbyDiscoveredByPeerId = new Map<string, PeerSearchResult>();
  /** Consecutive failed profile-probe count per peer (for non-EnvoyMesh suppression). */
  private readonly _nonEnvoyPeerFailCount = new Map<string, number>();
  /** Timestamp of last failed probe per peer (for non-EnvoyMesh suppression). */
  private readonly _nonEnvoyPeerLastFailedAt = new Map<string, number>();
  /** Keeps bonded contacts warm across NAT idle periods. */
  private _bondWarmTimer?: ReturnType<typeof setInterval>;
  /** Per-contact last warm timestamp for cooldown throttling. */
  private readonly _lastBondWarmAt = new Map<string, number>();
  /** Defer startup profile refresh until mesh paths settle (avoids stale LAN dial storms). */
  private static readonly PROFILE_REFRESH_STARTUP_DELAY_MS = 90_000;
  private _profileRefreshStartupTimer?: ReturnType<typeof setTimeout>;
  /** In-memory owner → libp2p from recent inbound streams (until persisted in peer directory). */
  private readonly _lastLibp2pTransportByOwner = new Map<
    string,
    { peerId: string; listenAddrs?: string[] }
  >();
  private readonly _inboundListenAddrMergeByPeer = new Map<string, number>();
  // ---------------------------------------------------------------
  // Transfer / file-share state — maps + tracker (see node-service-transfer-inbound.ts).
  // ---------------------------------------------------------------
  private readonly _transferState = createTransferStateBundle();

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
      await this._deliverCallEnvelope(transportPeerId, signed, dialHints);

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
    return declineSocialIntroProposalViaRuntime(this._miscDelegationsContext(), messageId);
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
    // Track previously-seen pending item IDs so we can diff for NEW items
    // on each onChange — only push for items the user hasn't seen yet.
    const seenPendingIds = new Set<string>()
    // Seed with the current pending set so we don't push for items that
    // were already pending when the queue was bound (e.g. node restart).
    for (const item of queue.listPending()) {
      seenPendingIds.add(item.id)
    }
    // Hard-invalidate the pending-approval-count cache whenever the
    // queue mutates (add/approve/reject/remove/expireOldItems/
    // clearResolved). This is the fast-fresh path for the count cache
    // used by terminal activity enrichment — the 1s TTL becomes a
    // pure back-stop rather than the primary freshness guarantee.
    // Also: Phase 50 — push to EnvoyGo for newly-added pending items.
    queue.onChange(() => {
      this._pendingApprovalCountCache = null;
      // Diff for new pending items → push if owner is offline.
      const currentPending = queue.listPending()
      const targetOwnerId = this._profile?.owner?.ownerId
      if (!targetOwnerId) return
      for (const item of currentPending) {
        if (seenPendingIds.has(item.id)) continue
        seenPendingIds.add(item.id)
        // Skip items older than 60s — they were likely added during startup
        // or replay, not a real-time event the user needs a push for.
        const ageMs = Date.now() - new Date(item.requestedAt).getTime()
        if (ageMs > 60_000) continue
        // Best-effort push; skip only when EnvoyGo already has a live WS.
        if (this.isThinClientOnline(targetOwnerId)) continue
        const senderName = item.context?.contactDisplayName ?? "Unknown contact"
        void pushNotificationService
          .dispatchApprovalPush({
            targetOwnerId,
            title: "Approval needed",
            body: `${senderName}: ${item.title}`.slice(0, 120),
            itemId: item.id,
          })
          .catch(() => {})
      }
      // Prune seen set for items no longer pending (approved/rejected/expired).
      const currentIds = new Set(currentPending.map((i) => i.id))
      for (const id of seenPendingIds) {
        if (!currentIds.has(id)) seenPendingIds.delete(id)
      }
    });
  }

  async listActiveTransfers(): Promise<TransferStatus[]> {
    return listActiveTransfersViaRuntime(this._transferInboundContext());
  }

  async getTransferStatus(correlationId: string): Promise<TransferStatus | undefined> {
    return getTransferStatusViaRuntime(this._transferInboundContext(), correlationId);
  }

  /** After inbound 1:1 chat.message is persisted, apply deferred vault paths from early transfers. */
  async reconcileInboundDirectChatMessage(
    peerOwnerId: string,
    message: ChatMessage,
  ): Promise<ChatMessage> {
    return reconcileInboundDirectChatMessageViaRuntime(this._transferInboundContext(), peerOwnerId, message);
  }

  /** Called from data-transfer-inbound after verified inbound write. */
  notifyInboundTransferVerified(input: {
    remotePeerId: string;
    relativePath: string;
    totalBytes: number;
  }): void {
    notifyInboundTransferVerifiedViaRuntime(this._transferInboundContext(), input);
  }

  /** Inbound `share.preview` on the original requester (push) — links preview id to pending send. */
  linkOutboundSharePreviewFromInbound(previewMessageId: string, inReplyToRequestMsgId: string): void {
    linkOutboundSharePreviewFromInboundViaRuntime(
      this._transferInboundContext(),
      previewMessageId,
      inReplyToRequestMsgId,
    );
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
    return recordInboundPullSharePreviewViaRuntime(this._transferInboundContext(), input);
  }

  /** We hold the file (responder); after sending preview, wait for requester's `share.accept`. */
  registerResponderFileSendAfterPreview(
    previewMessageId: string,
    relativePath: string | undefined,
    requesterPeerId: string,
  ): void {
    registerResponderFileSendAfterPreviewViaRuntime(
      this._transferInboundContext(),
      previewMessageId,
      relativePath,
      requesterPeerId,
    );
  }

  async recordInboundPushShareOffer(input: {
    shareId: string;
    senderPeerId: string;
    senderOwnerId?: string;
    previewText: string;
    sensitivity: "public" | "friends" | "private";
    relativePath: string;
    deliveryChannel?: "inbox" | "chat" | "agent";
    chatRoomId?: string;
    chatMessageId?: string;
    chatAttachmentId?: string;
  }): Promise<void> {
    return recordInboundPushShareOfferViaRuntime(this._transferInboundContext(), input);
  }

  clearPendingShareStateForPreview(previewMessageId: string): void {
    clearPendingShareStateForPreviewViaRuntime(this._transferInboundContext(), previewMessageId);
  }

  /**
   * Map verified voucher path → local vault-relative path when the owner chose a different name/location.
   */
  resolveInboundDataTransferRelativePath(remotePeerId: string, voucherRelativePath: string): string {
    return resolveInboundDataTransferRelativePathViaRuntime(
      this._transferInboundContext(),
      remotePeerId,
      voucherRelativePath,
    );
  }

  consumeInboundDataTransferSaveMapping(remotePeerId: string, voucherSourceRelativePath: string): void {
    consumeInboundDataTransferSaveMappingViaRuntime(
      this._transferInboundContext(),
      remotePeerId,
      voucherSourceRelativePath,
    );
  }

  async maybeSendShareFileForInboundAccept(input: {
    envelope: EnvoyEnvelope;
    remotePeerId: string;
    taskStore: LocalTaskStore;
    vaultDir: string;
    /** Live circuit/LAN addr from the inbound `share.accept` stream — often the only routable hint cross-NAT. */
    inboundConnectionAddrs?: string[];
  }): Promise<void> {
    return maybeSendShareFileForInboundAcceptViaRuntime(this._transferInboundContext(), input);
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
    this._bindOpenClawPersistence();
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
    // Periodic prune of per-peer Maps that grow unbounded over multi-week
    // runs.  Each map tracks the last activity timestamp for a given peer;
    // entries older than 2× their cooldown period are dead weight.
    this._memoryPruneTimer = setInterval(() => {
      try {
        const now = Date.now();
        const profileCutoff = now - NodeServiceImpl._PROFILE_REQUEST_COOLDOWN_MS * 120; // ~30 days
        const probeCutoff = now - NodeServiceImpl._NEARBY_PROFILE_PROBE_COOLDOWN_MS * 120;
        const mergeCutoff = now - 2 * 60 * 60 * 1000; // 2 hours (dial-hint throttle)
        const nonEnvoyCutoff = now - NON_ENVOY_PEER_SUPPRESS_COOLDOWN_MS * 2; // 10 minutes
        let pruned = 0;
        for (const [k, v] of this._profileRequestLastAt) if (v < profileCutoff) { this._profileRequestLastAt.delete(k); pruned++; }
        for (const [k, v] of this._nearbyProfileProbeLastAt) if (v < probeCutoff) { this._nearbyProfileProbeLastAt.delete(k); pruned++; }
        for (const [k, v] of this._nonEnvoyPeerLastFailedAt) if (v < nonEnvoyCutoff) { this._nonEnvoyPeerLastFailedAt.delete(k); this._nonEnvoyPeerFailCount.delete(k); pruned++; }
        for (const k of this._lastLibp2pTransportByOwner.keys()) {
          // Owner entries don't have timestamps — limit by total count instead.
          // 1000 unique owners is generous for a personal node.
        }
        for (const [k, v] of this._inboundListenAddrMergeByPeer) if (v < mergeCutoff) { this._inboundListenAddrMergeByPeer.delete(k); pruned++; }
        // Cap _lastLibp2pTransportByOwner at 1000 entries (oldest evicted).
        if (this._lastLibp2pTransportByOwner.size > 1000) {
          const entries = [...this._lastLibp2pTransportByOwner.entries()];
          this._lastLibp2pTransportByOwner.clear();
          for (const entry of entries.slice(-1000)) this._lastLibp2pTransportByOwner.set(entry[0], entry[1]);
          pruned += entries.length - 1000;
        }
        if (pruned > 0) {
          console.log(`[node-service] Pruned ${pruned} stale per-peer cache entries`);
        }
      } catch (err) {
        console.error("[node-service] memory prune error:", err);
      }
    }, 60 * 60 * 1000); // 1 hour
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
    this._familyProfileStore =
      profileDir && profileDir !== "/tmp/unknown" ? createFamilyProfileStore(profileDir) : null;
    this._familyRoomStore =
      profileDir && profileDir !== "/tmp/unknown" ? createFamilyRoomStore(profileDir) : null;
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
      this._capabilityIndexReady = this._capabilityIndex.init(profileDir);
      // Also init push here so Tauri/embedded NodeServiceImpl paths work
      // even when index.ts bootstrap is not used.
      void pushNotificationService.init(profileDir).catch((err: unknown) => {
        console.warn("[node-service] push notification service init failed:", err);
      });
    }
    if (profile !== undefined) {
      this._profile = profile;
    }
    if (mesh) {
      this._nodeStatus = "running";
    }
    this._wireCallManagerRemoteSignals();
    // Phase 50 — unified push-notification listener.
    //
    // ONE subscriber catches chat events from EVERY source:
    // direct peer chat, group chat, EnvoyAI/OpenClaw replies, Ext Agent
    // (HomeClaw/Hermes/OpenHuman/Pi) replies. Sources just emit; this
    // listener decides whether to push.
    //
    // Skip-if-online = EnvoyGo recently active on authenticated WS
    // (`isThinClientOnline` → hasRecentlyActiveClientForOwner), NOT
    // owner presence / Desktop Social.
    //
    // Event names:
    //   "chat:message" — 1:1 / AI / Ext Agent
    //   "chat:room-message" — group rooms ({ roomId, message })
    //   "push:message" — push-only (e.g. direct Pi RPC); not forwarded to WS UI
    //   "pi:proposal" — Pi tool-action confirm
    const maybePushChat = (
      msg: ChatMessage,
      opts?: {
        threadType?: "direct" | "room" | "external" | "envoyai" | "bot" | "family"
        roomId?: string
        threadKey?: string
      },
    ) => {
      const homeOwnerId = this._profile?.owner?.ownerId
      if (!homeOwnerId) return
      // Don't push the user's OWN outgoing echoes (or system rows keyed as owner).
      if (msg.sender.ownerId && msg.sender.ownerId === homeOwnerId) {
        return
      }
      const preview = (msg.content?.text ?? "").trim()
      if (!preview) return

      const channel = msg.metadata?.deliveryChannel
      const source = msg.metadata?.deliverySource
      const senderId = msg.sender.ownerId ?? ""
      const recipientId = msg.recipient?.ownerId ?? ""
      const botKey =
        (isAiBotThread(senderId) && senderId) ||
        (isAiBotThread(recipientId) && recipientId) ||
        ""
      const botParsed = botKey ? parseAiBotThreadKey(botKey) : null
      const bridgeParsed =
        parseBridgeThreadKey(senderId) ?? parseBridgeThreadKey(recipientId)
      const envoyAiProfile =
        parseEnvoyAiProfileId(senderId) ?? parseEnvoyAiProfileId(recipientId)
      const familyParsed =
        parseFamilyThreadKey(senderId) ?? parseFamilyThreadKey(recipientId)

      let targetProfileId =
        botParsed?.profileId ||
        bridgeParsed?.profileId ||
        envoyAiProfile ||
        OWNER_FAMILY_PROFILE_ID

      if (familyParsed) {
        // Push only the other member (not the sender's own profile).
        const fromProfile =
          senderId === familyParsed.profileIdA || senderId === familyParsed.profileIdB
            ? senderId
            : null
        targetProfileId = fromProfile
          ? fromProfile === familyParsed.profileIdA
            ? familyParsed.profileIdB
            : familyParsed.profileIdA
          : familyParsed.profileIdA
      }

      // Skip push only when THIS profile's thin client is recently active.
      if (this.isProfileOnline(targetProfileId)) {
        console.log(
          `[push] skip-if-online profile=${targetProfileId} messageId=${msg.messageId}`,
        );
        return;
      }

      const isAiBot = Boolean(botKey)
      const isFamilyDm = Boolean(familyParsed)
      const isBridgeAgent =
        Boolean(bridgeParsed) ||
        (channel === "agent" && source === "bridge") ||
        senderId === "envoy:pi"
      const isBuiltinAi =
        !isAiBot &&
        !isFamilyDm &&
        (channel === "ai" || isEnvoyAiThreadKey(senderId) || isEnvoyAiThreadKey(recipientId))
      const threadType =
        opts?.threadType ??
        (isAiBot
          ? "bot"
          : isBridgeAgent
            ? "external"
            : isBuiltinAi
              ? "envoyai"
              : isFamilyDm
                ? "family"
                : undefined)
      const familyThreadKey = familyParsed
        ? `family:${familyParsed.profileIdA}:${familyParsed.profileIdB}`
        : undefined

      void pushNotificationService
        .dispatchChatPush({
          senderName: msg.sender.displayName ?? msg.sender.ownerId ?? "New message",
          messagePreview: preview.slice(0, 120),
          targetOwnerId: homeOwnerId,
          targetProfileId,
          messageId: msg.messageId,
          senderOwnerId: isAiBot
            ? botKey
            : isFamilyDm
              ? senderId
              : isBridgeAgent || isBuiltinAi
                ? undefined
                : senderId,
          threadType,
          roomId: opts?.roomId,
          threadKey: opts?.threadKey ?? familyThreadKey,
        })
        .catch(() => {})
    }

    this.on("chat:message", (msg: ChatMessage) => maybePushChat(msg))
    this.on("push:message", (msg: ChatMessage) => maybePushChat(msg))
    this.on(
      "chat:room-message",
      (event: { roomId?: string; message?: ChatMessage }) => {
        const msg = event?.message
        if (!msg || !event.roomId) return
        maybePushChat(msg, { threadType: "room", roomId: event.roomId })
      },
    )
    // Phase 50 — Pi tool-action request push (separate event type).
    // Fires when Pi asks the user to approve a tool call (file edit, bash).
    // The confirm-dialog is in-app; this wakes backgrounded devices.
    this.on("pi:proposal", (event: { proposal?: { uiRequestId: string; title: string; message: string } }) => {
      const proposal = event?.proposal
      if (!proposal) return
      const targetOwnerId = this._profile?.owner?.ownerId
      if (!targetOwnerId) return
      if (this.isProfileOnline(OWNER_FAMILY_PROFILE_ID)) return
      void pushNotificationService
        .dispatchChatPush({
          senderName: "Pi",
          messagePreview: `${proposal.title}: ${proposal.message}`.slice(0, 120),
          targetOwnerId,
          targetProfileId: OWNER_FAMILY_PROFILE_ID,
          messageId: `pi-proposal-${proposal.uiRequestId}`,
          type: "pi_proposal",
          threadType: "external",
        })
        .catch(() => {})
    })
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
   *
   * Parity with `startNode()` post-online hooks: bond warm, profile refresh, reachability tags.
   * Without these, `node:dev` never re-dialed LAN peers after restart and Social warmed contacts
   * while `_nodeStatus` was still offline (WS connected before mesh.start()).
   */
  bindExternalMesh(mesh: EnvoyMesh): void {
    this._externalMesh = mesh;
    this._nodeStatus = "running";
    this.emit("node:status", { status: this._nodeStatus, peerId: mesh.peerId });
    // Prefer sync online when cache was already hydrated (CLI / startNode
    // await hydrate before bind). Otherwise hydrate first so Team jobs don't
    // see the default OpenClaw engine after a restart with Ext configured.
    if (this._agentNetworkWorkerEngineHydrated) {
      this._finishBindExternalMeshOnline(mesh);
      return;
    }
    void this.hydrateAgentNetworkWorkerEngineFromDisk().then(() => {
      if (this._externalMesh !== mesh) return;
      this._finishBindExternalMeshOnline(mesh);
    });
  }

  private _finishBindExternalMeshOnline(mesh: EnvoyMesh): void {
    this.emit("node:online", {
      peerId: mesh.peerId,
      multiaddrs: (mesh.multiaddrs ?? []).map((a) => a.toString()),
    });
    this.emit("node:ready", { timestamp: Date.now() });
    void this.resyncBondedContactReachabilityTags();
    void this._scrubBondedContactDialState();
    this._startBondWarmInterval();
  }

  /**
   * CLI / Tauri path: wire relay.lookup deps used by `searchPeers` when DHT
   * is empty (mobile 5G, blocked public bootstrap DNS, etc.).
   *
   * `bindExternalMesh` alone is not enough — checkin runs in `index.ts`, but
   * topic/peer search goes through NodeService and needs these deps or it
   * logs `_relayClientCycleDeps not set` and returns no relay-roster hits.
   */
  bindExternalRelayClientCycle(deps: RelayClientCycleDeps): void {
    this._relayClientCycleDeps = deps;
    console.log(
      `[node-service] relay client cycle deps bound for searchPeers ` +
        `(bootstrapPeers=${deps.bootstrapPeers.length})`,
    );
  }

  /** CLI `index.ts` path: start the pre-built libp2p stack after first-run setup writes node-config.json. */
  registerDeferredExternalMeshStart(fn: () => Promise<void>): void {
    this._deferredExternalMeshStart = fn;
  }

  /** True when a deferred start is registered and the mesh has not yet come up. */
  hasDeferredMeshStart(): boolean {
    return typeof this._deferredExternalMeshStart === "function" && this._nodeStatus !== "running";
  }

  private _scheduleDeferredProfileRefresh(): void {
  }

  /** True when {@link startNode} created an internal mesh with {@link _wireMeshEvents} inbound handlers. */
  usesInternalMeshInboundHandlers(): boolean {
    return this._mesh != null;
  }

  /** Re-apply contact reachability tags from the trust store (after cold start or mesh restart). */
  async resyncBondedContactReachabilityTags(): Promise<void> {
    return resyncReachabilityTagsViaRuntime(this._reachabilityContext());
  }

  /** Drop stale ephemeral listen addrs from disk + libp2p peerstore for bonded contacts. */
  private async _scrubBondedContactDialState(): Promise<void> {
    return scrubBondedContactDialStateViaRuntime(this._reachabilityContext());
  }

  /**
   * CLI path (`index.ts`): mDNS / relay discovery learned a libp2p peer + dialable addrs.
   * Merge addrs into an existing peer-directory row and probe for bonded profile sync.
   * Pass `{ force: true }` from Discover refresh to bypass the probe cooldown.
   */
  async handleMeshPeerDiscovered(
    peerId: string,
    multiaddrs: string[],
    opts?: { force?: boolean },
  ): Promise<void> {
    return handleMeshPeerDiscoveredViaRuntime(this._reachabilityContext(), peerId, multiaddrs, opts);
  }

  private _reachableMesh(): EnvoyMesh | undefined {
    return this._mesh ?? this._externalMesh;
  }

  private async _tagBondedContactReachability(libp2pPeerId: string): Promise<void> {
    return tagBondedContactReachabilityViaRuntime(this._reachabilityContext(), libp2pPeerId);
  }

  private async _untagReachabilityForOwner(peerOwnerId: string): Promise<void> {
    return untagReachabilityForOwnerViaRuntime(this._reachabilityContext(), peerOwnerId);
  }

  private _reachabilityContext(): ReachabilityContext {
    return buildReachabilityContext(this);
  }

  /** True when the peer has failed ≥ N consecutive probes and is within suppression cooldown. */
  private _isNonEnvoyPeerSuppressed(peerId: string): boolean {
    const failCount = this._nonEnvoyPeerFailCount.get(peerId) ?? 0;
    if (failCount < NON_ENVOY_PEER_SUPPRESS_AFTER_FAILURES) return false;
    const lastFailed = this._nonEnvoyPeerLastFailedAt.get(peerId) ?? 0;
    return Date.now() - lastFailed < NON_ENVOY_PEER_SUPPRESS_COOLDOWN_MS;
  }

  /** Record a failed probe attempt (increments fail count, records timestamp). */
  private _markNonEnvoyPeerFailed(peerId: string): void {
    const count = (this._nonEnvoyPeerFailCount.get(peerId) ?? 0) + 1;
    this._nonEnvoyPeerFailCount.set(peerId, count);
    this._nonEnvoyPeerLastFailedAt.set(peerId, Date.now());
  }

  /** Reset fail count on successful probe. */
  private _resetNonEnvoyPeerFailCount(peerId: string): void {
    this._nonEnvoyPeerFailCount.delete(peerId);
    this._nonEnvoyPeerLastFailedAt.delete(peerId);
  }

  private _transferInboundContext(): TransferInboundContext {
    return buildTransferInboundContext({
      getTransferState: () => this._transferState,
      getChatLogStore: () => this._chatLogStore,
      peerDirectoryStore: this._peerDirectoryStore,
      trustStore: this._trustStore,
      getReachableMesh: () => this._reachableMesh(),
      getProfile: () => this._profile,
      dialHintsForChat: (recipientPeerId, peerListenAddrs) =>
        this._dialHintsForChat(recipientPeerId, peerListenAddrs),
      emit: (event, payload) => this.emit(event as keyof NodeServiceEvents, payload as never),
      recordFileShareInChat: (input) => this._recordFileShareInChat(input),
      assertOnline: () => this._assertOnline(),
      recordOwnerActivity: () => this.recordOwnerActivity(),
      requireProfile: () => this._requireProfile(),
      getVaultDir: () => this._vaultDir,
      getProfileDir: () => this._profileDir,
      deliverCallEnvelope: (transportPeerId, envelope, dialHints, listenAddrs) =>
        this._deliverCallEnvelope(transportPeerId, envelope, dialHints, listenAddrs),
      tagBondedContactReachability: (peerId) => {
        void this._tagBondedContactReachability(peerId);
      },
    });
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

  private _identityContext(): IdentityContext {
    return buildIdentityContext(this);
  }

  getProfile(): NodeProfile {
    return getProfileViaRuntime(this._identityContext());
  }

  getOwnerDidPresentation() {
    return getOwnerDidPresentationViaRuntime(this._identityContext());
  }

  exportDidDocument(input?: {
    services?: Array<{ id: string; type: string; serviceEndpoint: string; description?: string }>;
  }): string {
    return exportDidDocumentViaRuntime(this._identityContext(), input);
  }

  async resolveDidImport(input: string) {
    return resolveDidImportViaRuntime(null, input);
  }

  async resolveDidExport(input: string) {
    return resolveDidExportViaRuntime(null, input);
  }

  async cacheDidContactKey(params: { ownerId: string; publicKeyPem: string }) {
    return cacheDidContactKeyViaRuntime(this._identityContext(), params);
  }

  async getPeerReputationSummary(peerOwnerId: string): Promise<PeerReputationSummary> {
    return getPeerReputationSummaryViaRuntime(this._identityContext(), peerOwnerId);
  }

  async getHumanProfile(): Promise<HumanProfile | undefined> {
    return getHumanProfileViaRuntime(this._identityContext());
  }

  async updateHumanProfile(input: CreateHumanProfileInput): Promise<HumanProfile> {
    const profile = await updateHumanProfileViaRuntime(this._identityContext(), input);
    void this._republishProfilePortal(profile);
    return profile;
  }

  async getPeerProfile(ownerId: string): Promise<PeerProfileView | undefined> {
    return getPeerProfileViaRuntime(this._identityContext(), ownerId);
  }

  async listPeerProfiles(): Promise<PeerProfileView[]> {
    return listPeerProfilesViaRuntime(this._identityContext());
  }

  async syncProfileToBonds(): Promise<void> {
    return syncProfileToBondsViaRuntime(this._identityContext());
  }

  async refreshBondPeerProfiles(): Promise<{ requested: number; failed: number }> {
    return refreshBondPeerProfilesViaRuntime(this._identityContext());
  }

  async requestPeerProfile(ownerId: string): Promise<{ ok: boolean; reason?: string }> {
    return requestPeerProfileViaRuntime(this._requestPeerProfileContext(), ownerId);
  }

  private async _requestPeerProfileOnce(ownerId: string): Promise<{ ok: boolean; reason?: string }> {
    return requestPeerProfileViaRuntime(this._requestPeerProfileContext(), ownerId);
  }

  private async _probeNearbyPeerProfileAfterDiscovery(
    peerId: string,
    multiaddrs: string[],
    opts?: { force?: boolean },
  ): Promise<void> {
    return _probeNearbyPeerProfileAfterDiscovery(this._identityContext(), peerId, multiaddrs, opts);
  }

  /**
   * Phase 35C — fire a one-shot `device.pair.request` carrying the fleet
   * token to a freshly-discovered peer, when the local config opts in.
   * Idempotent on a short cooldown so a noisy mDNS loop doesn't loop us.
   *
   * Implementation note: the actual decision (enabled? token set? self?),
   * the audit emission, and the transport call all live in
   * `sendLanAutoBondRequest` (and `buildLanAutoBondRequest`) inside
   * `node-service-lan-auto-bond.ts`. This wrapper only adds the per-peer
   * cooldown + the dependency wiring.
   *
   * Public for tests / harnesses that simulate mDNS discovery without
   * enabling real multicast (Phase13 disables mDNS).
   */
  async maybeFireLanAutoBondForDiscoveredPeer(peerId: string): Promise<void> {
    return this._maybeFireLanAutoBond(peerId);
  }

  /**
   * After Office LAN / LAN auto-bond is enabled (or the fleet token changes),
   * try auto-bond against peers we already have a live connection to.
   * Discovery alone is not enough when the feature was off at first sighting.
   */
  private async _kickLanAutoBondForConnectedPeers(reason: string): Promise<void> {
    const mesh = this._mesh;
    if (!mesh || this._nodeStatus !== "running") return;
    const peers = mesh
      .getConnectedPeerIds()
      .filter((id) => id !== mesh.peerId && !this._bootstrapPeerIdSet.has(id));
    anLog("lan-auto-bond", "kick connected peers", { reason, count: peers.length });
    for (const peerId of peers) {
      void this._maybeFireLanAutoBond(peerId);
    }
  }

  /**
   * While Office LAN / lan-fast is on, periodically re-probe peer-store LAN
   * candidates. Needed because libp2p only emits peer:discovery once per peer;
   * later mDNS ads are silent and Discover/auto-bond would otherwise stall.
   */
  private _lanDiscoverySweepTimer?: ReturnType<typeof setInterval>;
  private _lanDiscoverySweepTick = 0;

  private _stopLanDiscoverySweep(): void {
    if (this._lanDiscoverySweepTimer) {
      clearInterval(this._lanDiscoverySweepTimer);
      this._lanDiscoverySweepTimer = undefined;
    }
    this._lanDiscoverySweepTick = 0;
  }

  private async _syncLanDiscoverySweep(reason: string): Promise<void> {
    let cfg: Awaited<ReturnType<typeof this._configStore.load>> | undefined;
    try {
      cfg = await this._configStore.load();
    } catch {
      cfg = undefined;
    }
    const want = shouldRunLanDiscoverySweep(cfg) && this._nodeStatus === "running" && Boolean(this._mesh);
    if (!want) {
      if (this._lanDiscoverySweepTimer) {
        anLog("lan-discovery", "sweep stopped", { reason });
      }
      this._stopLanDiscoverySweep();
      return;
    }
    if (this._lanDiscoverySweepTimer) return;
    anLog("lan-discovery", "sweep started", {
      reason,
      intervalMs: LAN_DISCOVERY_SWEEP_INTERVAL_MS,
      profile: cfg?.discoveryProfile,
      lanAutoBond: cfg?.lanAutoBondEnabled === true,
    });
    this._lanDiscoverySweepTimer = setInterval(() => {
      void this._lanDiscoverySweepOnce();
    }, LAN_DISCOVERY_SWEEP_INTERVAL_MS);
    // Immediate pass so Enable Office LAN does not wait for the first interval.
    void this._lanDiscoverySweepOnce();
  }

  private async _lanDiscoverySweepOnce(): Promise<void> {
    if (this._nodeStatus !== "running" || !this._mesh) return;
    this._lanDiscoverySweepTick += 1;
    const force = this._lanDiscoverySweepTick % LAN_DISCOVERY_SWEEP_FORCE_EVERY_N === 0;
    try {
      if (force) {
        const result = await this.refreshNearbyDiscovery();
        anLog("lan-discovery", "sweep force refresh", {
          tick: this._lanDiscoverySweepTick,
          ...result,
        });
      } else {
        const mesh = this._mesh;
        const selfId = mesh.peerId;
        const bootstrap = this._bootstrapPeerIdSet ?? new Set<string>();
        let peered = 0;
        for (const peerId of await mesh.listNearbyDiscoveryCandidatePeerIds()) {
          if (!peerId || peerId === selfId || bootstrap.has(peerId)) continue;
          let addrs: string[] = [];
          try {
            addrs = await mesh.getPeerStoreDialHints(peerId, {
              allowEphemeralPrivateLan: true,
            });
          } catch {
            addrs = [];
          }
          const lan = addrs.filter((a) => isPrivateLanTcpDialHint(a));
          if (lan.length === 0) continue;
          void this.handleMeshPeerDiscovered(peerId, lan);
          peered += 1;
        }
        anLog("lan-discovery", "sweep soft probe", {
          tick: this._lanDiscoverySweepTick,
          peered,
        });
      }
      void this._kickLanAutoBondForConnectedPeers("lan-sweep");
    } catch (err) {
      anWarn("lan-discovery", "sweep failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async _maybeFireLanAutoBond(peerId: string): Promise<void> {
    const profile = this._profile;
    const mesh = this._mesh;
    if (!profile || !mesh || !this._taskStore) return;
    if (peerId === mesh.peerId) return;
    // Opportunistic cleanup so the map doesn't grow forever on a chatty
    // mDNS network — drop entries that are well past the cooldown window.
    if (this._lanAutoBondLastFireAt.size > 64) {
      const cutoff = Date.now() - NodeServiceImpl._LAN_AUTO_BOND_COOLDOWN_MS * 10;
      for (const [k, v] of this._lanAutoBondLastFireAt) {
        if (v < cutoff) this._lanAutoBondLastFireAt.delete(k);
      }
    }
    const lastAt = this._lanAutoBondLastFireAt.get(peerId) ?? 0;
    if (Date.now() - lastAt < NodeServiceImpl._LAN_AUTO_BOND_COOLDOWN_MS) {
      anLog("lan-auto-bond", "fire skipped — cooldown", {
        peer: shortId(peerId),
        cooldownMs: NodeServiceImpl._LAN_AUTO_BOND_COOLDOWN_MS,
      });
      return;
    }

    // All gating (config check, token check, self check) happens inside
    // `sendLanAutoBondRequest`, which also handles audit logging and the
    // transport error path. We just feed it the deps.
    //
    // Only stamp the cooldown *after* the helper actually accepted the call.
    // Otherwise a config flip (off → no token) would block the next fire
    // for a full 60s even though no envelope was ever sent.
    anLog("lan-auto-bond", "fire attempt (mDNS/discovery)", { peer: shortId(peerId) });
    const result = await sendLanAutoBondRequest(
      {
        taskStore: this._taskStore,
        loadConfig: () => this._configStore.load(),
        sendPairRequest: ({ toPeerId, payload: pairPayload }) => this._sendDevicePairRequest(toPeerId, pairPayload),
        getLocalIdentity: () => ({
          ownerId: profile.owner.ownerId,
          deviceId: profile.device.deviceId,
          devicePublicKeyPem: profile.device.publicKeyPem,
        }),
        getOwnOwnerId: () => profile.owner.ownerId,
      },
      peerId,
    );
    if (result.ok) {
      this._lanAutoBondLastFireAt.set(peerId, Date.now());
      // Best-effort: once the peer accepts (or we already share a bond), pull
      // cards so Assigner soft pool updates without a Settings refresh.
      this._trackAgentNetworkRefresh(
        this.refreshAgentNetworkWorkers().catch((err) => {
          anWarn("lan-auto-bond", "refreshAgentNetworkWorkers after send failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      );
    }
  }

  /** Tracks the last fire time per peer id so a chatty mDNS loop can't loop us. */
  private _lanAutoBondLastFireAt: Map<string, number> = new Map();
  private static readonly _LAN_AUTO_BOND_COOLDOWN_MS = 60_000;

  /**
   * Send a signed `device.pair.request` to a peer. Used by the LAN auto-bond
   * hook and reachable for tests. Returns `{ ok, error }` — the caller is
   * responsible for any audit events on the failure path.
   */
  private async _sendDevicePairRequest(
    toPeerId: string,
    payload: DevicePairRequestPayload,
  ): Promise<{ ok: boolean; error?: string }> {
    const profile = this._profile;
    const mesh = this._mesh;
    if (!profile) return { ok: false, error: "node not initialized" };
    if (!mesh) return { ok: false, error: "mesh not started" };
    try {
      const { createUnsignedEnvelope } = await import("@envoymesh/protocol");
      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          recipientPeerId: toPeerId,
          intent: "device.pair.request",
          payload,
        }),
        profile.device.privateKeyPem,
      );
      const dialHints = await this._dialHintsForChat(toPeerId, undefined);
      await this._deliverCallEnvelope(toPeerId, envelope, dialHints);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
    return handleInboundProfileIntentViaRuntime(this._identityContext(), envelope, context);
  }

  async setPublicProfileThumbnail(params: SetPublicProfileThumbnailParams): Promise<HumanProfile> {
    const profile = await setPublicProfileThumbnailViaRuntime(this._identityContext(), params);
    void this._republishProfilePortal(profile);
    return profile;
  }

  async upsertProfileGalleryPhoto(params: UpsertProfileGalleryPhotoParams): Promise<HumanProfile> {
    const profile = await upsertProfileGalleryPhotoViaRuntime(this._identityContext(), params);
    const entry = params.photoId
      ? profile.galleryPhotos?.find((p) => p.photoId === params.photoId)
      : profile.galleryPhotos?.[profile.galleryPhotos.length - 1];
    if (entry) {
      try {
        await this._mirrorProfileGalleryPhotoToPhotoWall(entry);
      } catch (err) {
        console.warn(
          "[photowall] mirror profile gallery photo failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    void this._republishProfilePortal(profile);
    return profile;
  }

  /** Copy a profile gallery vault photo onto PhotoWall (`web/photos/wall/gallery-{id}.*`). */
  private async _mirrorProfileGalleryPhotoToPhotoWall(entry: {
    photoId: string;
    label?: string;
    visibility: ProfileGalleryPhotoVisibility;
    vaultRelativePath: string;
    mimeType: string;
  }): Promise<void> {
    const abs = join(this._vaultDir, entry.vaultRelativePath);
    const bytes = await readFile(abs);
    const mapped = await this._mapGalleryVisibilityToWeb(entry.visibility);
    const ext =
      entry.mimeType === "image/png"
        ? "png"
        : entry.mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const caption = entry.label?.trim() || undefined;
    await this.publishWebContentEntry({
      template: "photo",
      // Keep title generic so caption can appear as PhotoWall summary (must differ from title).
      title: "Photo",
      body: caption,
      visibility: mapped.visibility,
      contactIds: mapped.contactIds,
      contentBase64: bytes.toString("base64"),
      mimeType: entry.mimeType,
      fileName: basename(entry.vaultRelativePath),
      gallery: "wall",
      stablePath: galleryPhotoWallStablePath(entry.photoId, ext),
    });
  }

  private async _mapGalleryVisibilityToWeb(
    visibility: ProfileGalleryPhotoVisibility,
  ): Promise<{
    visibility: "public" | "bonded" | "contacts" | "private";
    contactIds?: string[];
  }> {
    if (visibility === "public") return { visibility: "public" };
    if (visibility === "referred") return { visibility: "bonded" };
    // Gallery "direct" = my contacts only → web contacts ACL of direct-bond owners.
    const bonds = await this.getBonds();
    const contactIds = bonds
      .filter((b) => b.level === "direct" && b.peerOwnerId)
      .map((b) => b.peerOwnerId!);
    return { visibility: "contacts", contactIds };
  }

  async removeProfileGalleryPhoto(params: { vaultRelativePath: string }): Promise<HumanProfile> {
    const before = await this.getHumanProfile();
    const removed = before?.galleryPhotos?.find(
      (p) => p.vaultRelativePath === params.vaultRelativePath.trim().replace(/^[\\/]+/, ""),
    );
    const profile = await removeProfileGalleryPhotoViaRuntime(this._identityContext(), params);
    if (removed) {
      try {
        await removeGalleryPhotoWallMirror(this._profileDir, profile.ownerId, removed.photoId);
      } catch (err) {
        console.warn(
          "[photowall] remove gallery mirror failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    void this._republishProfilePortal(profile);
    return profile;
  }


  async updateProfileGalleryPhotoVisibility(
    params: UpdateProfileGalleryPhotoVisibilityParams,
  ): Promise<HumanProfile> {
    const profile = await updateProfileGalleryPhotoVisibilityViaRuntime(
      this._identityContext(),
      params,
    );
    const entry = profile.galleryPhotos?.find(
      (p) => p.vaultRelativePath === params.vaultRelativePath.trim().replace(/^[\\/]+/, ""),
    );
    if (entry) {
      try {
        const mapped = await this._mapGalleryVisibilityToWeb(entry.visibility);
        const ok = await updateGalleryPhotoWallVisibility(
          this._profileDir,
          profile.ownerId,
          entry.photoId,
          mapped.visibility,
          mapped.contactIds,
        );
        if (!ok) {
          await this._mirrorProfileGalleryPhotoToPhotoWall(entry);
        }
      } catch (err) {
        console.warn(
          "[photowall] sync gallery visibility failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    void this._republishProfilePortal(profile);
    return profile;
  }

  /** Rebuild `web/index.html` portal from the current human profile (+ avatar bytes). */
  private async _republishProfilePortal(profile: HumanProfile): Promise<void> {
    try {
      let avatarBase64: string | undefined;
      let avatarMimeType: string | undefined;
      if (profile.publicThumbnail?.vaultRelativePath) {
        try {
          const abs = join(this._vaultDir, profile.publicThumbnail.vaultRelativePath);
          const bytes = await readFile(abs);
          avatarBase64 = bytes.toString("base64");
          avatarMimeType = profile.publicThumbnail.mimeType;
        } catch {
          /* avatar optional */
        }
      }
      await publishProfilePortal(this._profileDir, {
        ownerId: profile.ownerId,
        displayName: profile.displayName,
        username: profile.username,
        bio: profile.bio,
        hobbies: profile.hobbies,
        knowledge: profile.knowledge,
        capabilities: profile.capabilities,
        photos: (profile.galleryPhotos ?? []).map((p) => ({
          photoId: p.photoId,
          title: p.label,
          mimeType: p.mimeType,
        })),
        avatarBase64,
        avatarMimeType,
        visibility: profile.profileVisibility === "public" ? "public" : "bonded",
      });
    } catch (err) {
      console.warn(
        "[profile-portal] republish failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  async getAgentIdentity(): Promise<AgentIdentityDocument> {
    return getAgentIdentityViaRuntime(this._identityContext());
  }

  async updateAgentIdentity(content: string): Promise<AgentIdentityDocument> {
    return updateAgentIdentityViaRuntime(this._identityContext(), content);
  }

  private _advertiseInterestsTimer?: ReturnType<typeof setInterval>;
  /** Topics auto-advertised from public profile (interests, username, geo) — cancelled when profile/network changes. */
  private _autoAdvertisedDiscoveryTopics: string[] = [];
  private _advertiseInterestsStartupTimeout?: ReturnType<typeof setTimeout>;
  private _agentCardRefreshStartupTimeout?: ReturnType<typeof setTimeout>;
  private _stopRelayClientScheduler?: () => void;
  private _relayClientCycleDeps?: RelayClientCycleDeps;
  private _capabilityDiscoveryTimer?: ReturnType<typeof setTimeout>;
  private _stopNodeStatsLogging?: () => void;
  private _nodeProcessStartedAtMs = Date.now();
  private _relayBootstrapPeers: string[] = [];

  async _advertiseInterestsIfPublic(): Promise<void> {
    return _advertiseInterestsIfPublic(this._identityContext());
  }

  /**
   * Low-level DHT topic advertisement. Bridges the module-level
   * `_advertisePublicDiscoveryTopics` so internal callers (and tests) can
   * drive a real instance's IdentityContext without reconstructing it.
   * `interests` are advertised verbatim (no `interest:` normalization) —
   * production code routes raw hobbies/knowledge through
   * `computePublicDiscoveryTopics` first.
   */
  async _advertisePublicDiscoveryTopics(input: {
    interests: string[];
    username: string;
    displayName: string;
    locationTopics: string[];
    capabilityTopics?: string[];
  }): Promise<void> {
    return _advertisePublicDiscoveryTopics(this._identityContext(), input);
  }

  /** @deprecated bridge to `_advertisePublicDiscoveryTopics` — kept for legacy tests. */
  async _advertiseInterests(interests: string[], username: string, displayName: string = ""): Promise<void> {
    return _advertiseInterests(this._identityContext(), interests, username, displayName);
  }

  /**
   * Called by the identity runtime whenever the advertised discovery topic
   * set changes. Propagates the new set to the relay client cycle so the
   * next `relay.checkin` includes topicHash entries in its `advertisements[]`,
   * making the topic discoverable via `relay.lookup` (cross-NAT fallback).
   */
  private async _notifyAdvertisedDiscoveryTopics(topics: string[]): Promise<void> {
    // Empty list = clear all scopes (private profile). Non-empty = replace
    // the identity scope only so capability/publish topics are preserved
    // and removed interests actually shrink the roster.
    if (topics.length === 0) {
      setRelayClientAdvertisedTopics([]);
    } else {
      replaceRelayClientAdvertisedTopics("identity", topics);
    }
    this._kickEarlyRelayClientCheckin("identity-advertise");
  }

  private _mergeAdvertisedDiscoveryTopics(topics: string[]): void {
    // Capability/publish cycle: replace that scope (not unbounded union).
    replaceRelayClientAdvertisedTopics("capability", topics);
    // Same early checkin as identity — otherwise publish/capability tags
    // stay invisible to NAT peers until the ~30s periodic scheduler runs.
    this._kickEarlyRelayClientCheckin("capability-advertise");
  }

  /** Debounced early `relay.checkin` so bursty advertise updates don't storm the relay. */
  private _earlyRelayCheckinTimer: ReturnType<typeof setTimeout> | undefined;
  private _kickEarlyRelayClientCheckin(_reason: string): void {
    if (this._earlyRelayCheckinTimer) {
      clearTimeout(this._earlyRelayCheckinTimer);
    }
    this._earlyRelayCheckinTimer = setTimeout(() => {
      this._earlyRelayCheckinTimer = undefined;
      const deps = this._relayClientCycleDeps;
      if (!deps) return;
      void runRelayClientCycle(deps).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[relay-client] post-advertise checkin failed: ${msg}`);
      });
    }, 250);
  }

  private _serviceContextDeps(): ServiceContextDeps {
    return buildServiceContextDeps(this);
  }

  // ============================================
  // Bond Management (delegated to node-service-bond.ts)
  // ============================================

  private _bondContext(): BondContext {
    return buildBondContext(this._serviceContextDeps().bond);
  }

  /**
   * Gather the sponsor's known multiaddrs from the bundled config
   * (which is the source of truth for the sponsor's libp2p
   * reachability) and the local peer directory (which may have
   * fresher addresses from mDNS / DHT discovery). The smart
   * address-filter picker uses the union to decide whether to try
   * LAN first or skip it.
   *
   * One call to `loadBundledSponsorFriendParsed` does the bundled
   * parse (load + parseEnvoyContactUri + parseEnvoyJoinUri +
   * decodeWanJoinInviteV1) and returns both the multiaddrs AND the
   * parsed `link` so the peer-directory lookup doesn't need a
   * second parse.
   */
  private async _gatherSponsorMultiaddrs(): Promise<string[]> {
    // Best-effort: backfill the bundled multiaddrs into the peer
    // directory record so a future search/contact-list read has the
    // addresses even if the auto-bond never completes. The merge is
    // idempotent so a re-run is safe.
    const config = await this._configStore.load().catch(() => undefined);
    const lanFast = config?.discoveryProfile === "lan-fast";
    // Peer-directory backfill: strip RFC1918 on wan-default so other
    // dial paths (chat, etc.) are not poisoned by home-LAN addrs.
    await backfillBundledSponsorPeerAddresses(
      this._peerDirectoryStore,
      process.env.ENVOYMESH_NODE_BUNDLE_DIR,
      { includePrivateLan: lanFast },
    );
    const parsed = await loadBundledSponsorFriendParsed(
      process.env.ENVOYMESH_NODE_BUNDLE_DIR,
    );
    if (!parsed) return [];
    // Picker input: only include home-LAN / private-hop circuits on lan-fast.
    // On wan-default, stale RFC1918 circuits (e.g. 192.168.x relay hop from
    // the installer token) burn dial timeouts before the community circuit.
    const fromBundled = selectBundledSponsorBackfillAddrs(
      parsed.multiaddrs,
      parsed.bootstrapPeers ?? [],
      { includePrivateLan: lanFast },
    );
    if (fromBundled.length === 0) return fromBundled;
    const peerId = parsed.link.peerId;
    if (!peerId) return fromBundled;
    let record;
    try {
      record = await this._peerDirectoryStore.getPeerByPeerId(peerId);
    } catch {
      return fromBundled;
    }
    if (!record?.listenAddrs || record.listenAddrs.length === 0) {
      return fromBundled;
    }
    const fromDir = selectBundledSponsorBackfillAddrs(
      record.listenAddrs,
      [],
      { includePrivateLan: lanFast },
    );
    const seen = new Set(fromBundled);
    const merged = [...fromBundled];
    for (const addr of fromDir) {
      if (!seen.has(addr)) {
        seen.add(addr);
        merged.push(addr);
      }
    }
    return merged;
  }

  /**
   * Wait for the local bond context to fire `bond:established` for a
   * specific target ownerId. Returns when the matching event fires
   * (local accept-bond reply from the sponsor landed and the trust
   * store was updated); rejects on timeout.
   *
   * The local `sendHello` only proves the bytes left the local
   * libp2p stream. The actual bond is established when the sponsor
   * sends `bond.accept` back, which is what fires this event from
   * `node-service-bond.ts:271`. Without this gate, the
   * setup-sponsor-friend loop marks `setupSponsorFriendCompletedAt`
   * the instant the local send returns — silently masking relay
   * stream drops and NAT rebinds as "completed".
   */
  private _waitForBondEstablished(
    targetOwnerId: string,
    timeoutMs: number,
  ): Promise<{ peerOwnerId: string; displayName?: string }> {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const handler = (data: { peerOwnerId: string; displayName?: string }) => {
        if (data.peerOwnerId !== targetOwnerId) return;
        if (timer) clearTimeout(timer);
        unsubscribe();
        resolve(data);
      };
      const unsubscribe = this.on("bond:established", handler as never);
      timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`bond:established for ${targetOwnerId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Bond autonomy auto-accept callback for the wireMeshEventsViaRuntime path.
   * Mirrors the CLI path in index.ts which calls tryBondAutonomyInboundAutoAccept
   * directly. Without this, bond autonomy is completely broken on the
   * NodeService/embedded path (Tauri, mobile, etc.).
   */
  private async _tryBondAutonomyAutoAccept(payload: {
    envelope: any;
    requesterOwnerId: string;
    requesterDisplayName?: string;
    proofOfContext?: string;
    introCorrelationId?: string;
    requestedLevel?: string;
  }): Promise<
    | { accepted: true; requesterOwnerId: string; requesterPeerId: string; displayName?: string }
    | { accepted: false }
    | null
  > {
    if (!this._profile || !this._trustStore || !this._taskStore) return null;
    const cfg = await this._configStore.load();
    // Reset daily counter at midnight UTC.
    const today = new Date().toISOString().slice(0, 10);
    if (this._bondAutonomyDailyCounter.date !== today) {
      this._bondAutonomyDailyCounter = { count: 0, date: today };
    }
    return tryBondAutonomyInboundAutoAccept({
      envelope: payload.envelope,
      remotePeerId: "", // filled by tryBondAutonomyInboundAutoAccept from payload
      profile: this._profile,
      trustStore: this._trustStore,
      taskStore: this._taskStore,
      config: cfg,
      autonomousKillSwitch: cfg?.autonomousKillSwitch ?? false,
      getDailyAutoBondCount: () => Promise.resolve(this._bondAutonomyDailyCounter.count),
      incrementDailyAutoBondCount: async () => {
        this._bondAutonomyDailyCounter.count += 1;
      },
      hasIntroCorrelation: async (requester, responder) => {
        // TODO: check intro store for correlation between requester and responder
        return false;
      },
      getTrustOverlapScore: async () => 0,
    }).then((result) => {
      if (result.accepted) {
        return result;
      }
      return { accepted: false as const };
    });
  }

  async sendHello(
    targetOwnerId: string,
    profile: HelloProfile,
    message: string,
    options?: SendHelloOptions,
  ): Promise<HelloResponse> {
    return sendHelloViaRuntime(this._bondContext(), targetOwnerId, profile, message, options);
  }

  async acceptHello(messageId: string): Promise<void> {
    return acceptPendingHelloViaRuntime(this._bondContext(), messageId);
  }

  async declineHello(messageId: string, reason?: string): Promise<void> {
    return declinePendingHelloViaRuntime(this._bondContext(), messageId, reason);
  }

  async blockPeer(peerOwnerId: string): Promise<void> {
    return blockPeerViaRuntime(this._bondContext(), peerOwnerId);
  }

  async unblockPeer(peerOwnerId: string): Promise<void> {
    return unblockPeerViaRuntime(this._bondContext(), peerOwnerId);
  }

  async revokeBond(peerOwnerId: string): Promise<void> {
    return revokeBondViaRuntime(this._bondContext(), peerOwnerId);
  }

  async getBonds(): Promise<BondRecord[]> {
    return getBondsViaRuntime(this._bondContext());
  }

  // ============================================
  // Messaging (core transport delegated to node-service-outbound-messaging.ts)
  // ============================================

  private _outboundMessagingContext(): OutboundMessagingContext {
    return buildOutboundMessagingContext(this._serviceContextDeps().outboundMessaging);
  }

  private async _dialHintsForChat(
    recipientPeerId: string,
    peerListenAddrs: string[] | undefined,
    addressFilter?: "lan-paired" | "wan-public" | "all",
  ): Promise<string[]> {
    return dialHintsForChatViaRuntime(
      this._outboundMessagingContext(),
      recipientPeerId,
      peerListenAddrs,
      addressFilter,
    );
  }

  private async _rememberBondedPeerTransportFromInbound(
    envelope: EnvoyEnvelope,
    context?: { transportPeerId?: string; remoteAddr?: string },
  ): Promise<void> {
    return rememberBondedPeerTransportFromInboundViaRuntime(
      this._outboundMessagingContext(),
      envelope,
      context,
    );
  }

  private async _resolveLibp2pPeerForBondOwner(
    ownerId: string,
  ): Promise<{ transportPeerId: string; listenAddrs?: string[] } | undefined> {
    return resolveLibp2pPeerForBondOwnerViaRuntime(this._outboundMessagingContext(), ownerId);
  }

  private async _resolvePeerTransportForOwner(targetOwnerId: string): Promise<{
    transportPeerId: string;
    recipientEnvelopePeerId: string | undefined;
    listenAddrs: string[] | undefined;
  }> {
    return resolvePeerTransportForOwnerViaRuntime(this._outboundMessagingContext(), targetOwnerId);
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
    recordEnvoyAiChatMessageViaRuntime(this._openClawRuntimeDeps(), msg);
  }

  private async _loadEnvoyAiChatHistory(limit?: number): Promise<ChatMessage[]> {
    return loadEnvoyAiChatHistoryViaRuntime(this._openClawRuntimeDeps(), limit);
  }

  private async _persistEnvoyAiChatExchange(
    userText: string,
    turn: OwnerAgentTurnResult,
    humanMessageId?: string,
  ): Promise<void> {
    return persistEnvoyAiChatExchangeViaRuntime(
      this._openClawRuntimeDeps(),
      userText,
      turn,
      humanMessageId,
    );
  }

  private _chatRoomGlueInput(): ChatRoomServiceDepsInput {
    return {
      requireProfile: () => this._requireProfile(),
      requireMeshPeerId: () => this._requireMesh().peerId,
      trustStore: this._trustStore,
      humanProfileStore: this._humanProfileStore,
      chatRoomStore: this._chatRoomStore,
      pendingSyncStore: this._chatRoomPendingSyncStore,
      pendingMessageStore: this._chatRoomPendingMessageStore,
      resolvePeerTransportForOwner: (targetOwnerId) =>
        this._resolvePeerTransportForOwner(targetOwnerId),
      deliverChatEnvelope: (transportPeerId, envelope, dialHints, listenAddrs) =>
        this._deliverChatEnvelope(transportPeerId, envelope, dialHints, listenAddrs),
      dialHintsForChat: (transportPeerId, listenAddrs) =>
        this._dialHintsForChat(transportPeerId, listenAddrs),
      persistChatMessage: (threadKey, msg) => this._persistChatMessage(threadKey, msg),
      emit: (event, payload) => this.emit(event as keyof NodeServiceEvents, payload as never),
      assertOnline: () => this._assertOnline(),
      recordOwnerActivity: () => this.recordOwnerActivity(),
      getChatLogStore: () => this._chatLogStore,
      getGroupDeliveryPending: () => this._groupDeliveryPending,
      markOutboundChatDelivered: (threadKey, messageId, deliveredAt) =>
        this._markOutboundChatDelivered(threadKey, messageId, deliveredAt),
      markOutboundChatFailed: (threadKey, messageId, recipientOwnerId, reason) =>
        this._markOutboundChatFailed(threadKey, messageId, recipientOwnerId, reason),
      clearChatHistory: (threadKey) => this.clearChatHistory(threadKey).then(() => {}),
      shareChatFileToMember: (targetOwnerId, shareInput) =>
        shareFileViaRuntime(this._fileShareNetworkContext(), targetOwnerId, {
          path: shareInput.vaultRelativePath,
          sensitivity: shareInput.sensitivity,
          deliveryChannel: "chat",
          chatRoomId: shareInput.chatRoomId,
          chatMessageId: shareInput.chatMessageId,
          chatAttachmentId: shareInput.chatAttachmentId,
        }).then(() => {}),
    };
  }

  private _chatRoomDeps(): ChatRoomServiceDeps {
    return buildChatRoomServiceDeps(this._chatRoomGlueInput());
  }

  private _chatRoomFlushInput(): ChatRoomFlushInput {
    return {
      getPendingSyncStore: () => this._chatRoomPendingSyncStore,
      getPendingMessageStore: () => this._chatRoomPendingMessageStore,
      getChatRoomDeps: () => this._chatRoomDeps(),
    };
  }

  private async _flushPendingRoomSyncs(): Promise<void> {
    return flushPendingRoomSyncsViaRuntime(this._chatRoomFlushInput());
  }

  private async _flushPendingRoomMessages(): Promise<void> {
    return flushPendingRoomMessagesViaRuntime(this._chatRoomFlushInput());
  }

  private _roomDeliveryAck(
    replyWithEnvelope: ((envelope: EnvoyEnvelope) => Promise<void>) | undefined,
  ): ChatRoomServiceDeps["replyWithDelivered"] {
    return buildRoomDeliveryAckViaRuntime({ requireProfile: () => this._requireProfile() }, replyWithEnvelope);
  }

  private async _getRagService(): Promise<RagService | null> {
    if (this._profileDir === "/tmp/unknown") return null;
    if (this._ragService) return this._ragService;
    if (!this._ragServiceInit) {
      this._ragServiceInit = (async () => {
        const config = await this.getNodeConfig();
        const envoyLocalEmbed = await this._envoyLocalEmbedOverlay();
        this._ragService = await createRagService({
          profileDir: this._profileDir,
          knowledgeBase: config.aiSettings?.knowledgeBase,
          modelProviders: config.modelProviders,
          envoyLocalEmbed,
          chatLogStore: this._chatLogStore,
          ensureEmbedReady: async () => {
            await ensureEnvoyLocalEmbedRunningViaRuntime(
              this._envoyLocalEmbedState,
              this._envoyLocalEmbedRuntimeDeps(),
            );
          },
          onEmbedActivity: () => {
            noteEnvoyLocalEmbedActivity(
              this._envoyLocalEmbedState,
              this._envoyLocalEmbedRuntimeDeps(),
            );
          },
          onEmbedSuccess: () => {
            noteEnvoyLocalEmbedSuccess(this._envoyLocalEmbedState);
          },
          onEnvoyLocalEmbedTimeout: async () => {
            await healEnvoyLocalEmbedWedgeViaRuntime(
              this._envoyLocalEmbedState,
              this._envoyLocalEmbedRuntimeDeps(),
              "RAG embed timeout — restart before retry",
            );
          },
          onProgress: (progress) => {
            if (this.hasListeners("rag:reindex")) {
              this.emit("rag:reindex", progress);
            }
          },
        });
        if (this._vaultDir) {
          const releaseIdle = this._holdEnvoyLocalEmbedIdle();
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
          } finally {
            releaseIdle();
            noteEnvoyLocalEmbedActivity(
              this._envoyLocalEmbedState,
              this._envoyLocalEmbedRuntimeDeps(),
            );
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

  private async _deliverChatEnvelope(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs?: string[],
    options?: { expectDeliveryAck?: boolean },
  ): Promise<ChatDeliverResult> {
    return deliverChatEnvelopeViaRuntime(
      this._outboundMessagingContext(),
      transportPeerId,
      envelope,
      dialHints,
      listenAddrs,
      options,
    );
  }

  async deliverCallEnvelopeToTransportPeer(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
  ): Promise<void> {
    return deliverCallEnvelopeToTransportPeerViaRuntime(
      this._outboundMessagingContext(),
      transportPeerId,
      envelope,
    );
  }

  private async _deliverCallEnvelope(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs?: string[],
    preferCircuitHints?: boolean,
  ): Promise<ChatDeliverResult> {
    return deliverCallEnvelopeViaRuntime(
      this._outboundMessagingContext(),
      transportPeerId,
      envelope,
      dialHints,
      listenAddrs,
      preferCircuitHints,
    );
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


  async sendChat(targetOwnerId: string, text: string, attachments?: SendChatParams["attachments"]): Promise<SendChatResult> {
    return sendChatViaRuntime(this._outboundMessagingContext(), targetOwnerId, text, attachments);
  }

  async sendAgentChat(targetOwnerId: string, text: string): Promise<SendChatResult> {
    return sendAgentChatViaRuntime(this._sendAgentChatContext(), targetOwnerId, text);
  }

  private _sendAgentChatContext(): SendAgentChatContext {
    return {
      ...this._outboundMessagingContext(),
      ensureAgentIdentity: () => this._ensureAgentIdentity(),
      getNodeConfig: () => this.getNodeConfig(),
      getTrustRecord: (ownerId) => this._trustStore.getTrustRecord(ownerId),
    };
  }

  async listAgentActivity(params?: ListAgentActivityParams): Promise<AgentActivityRecord[]> {
    return listAgentActivityViaRuntime(this._storeAccessorDeps(), params);
  }

  async listCommerceReceipts(params?: ListCommerceReceiptsParams): Promise<CommerceReceiptRecord[]> {
    return listCommerceReceiptsViaRuntime(this._storeAccessorDeps(), params);
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

  async getCostSummary(params?: GetCostSummaryParams): Promise<CostSummary> {
    if (!this._taskStore) {
      return {
        totalCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        byProvider: [],
        byPeriod: [],
      };
    }
    return this._taskStore.summarizeModelCallCosts({
      since: params?.since,
      until: params?.until,
      providerId: params?.providerId,
      taskType: params?.taskType,
    });
  }

  async runCostRollupRetention(): Promise<{ collapsed: number; dropped: number }> {
    if (!this._taskStore) return { collapsed: 0, dropped: 0 };
    return this._taskStore.runCostRollupRetention();
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
    return listAgentCardsViaRuntime(this._storeAccessorDeps());
  }

  /**
   * Local agent as a Team-jobs worker when Join Agent Network is on.
   * Synthesized from live config — not from the peer card cache.
   */
  async getLocalAgentNetworkWorkerCard(): Promise<CachedAgentCardSummary | undefined> {
    const cfg = await this.getNodeConfig();
    if (cfg.capabilityProviderEnabled !== true) return undefined;
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity) return undefined;
    const profile = this._profile;
    if (!profile) return undefined;
    const { buildLocalAgentCard } = await import("./agent-card-inbound.js");
    const card = await buildLocalAgentCard({
      profile,
      humanProfileStore: this._humanProfileStore,
      profileDir: this._profileDir,
      capabilityProviderEnabled: true,
      agentNetworkProfile: cfg.agentNetworkProfile,
    });
    const summary: CachedAgentCardSummary = {
      ownerId: card.ownerId,
      displayName: card.displayName,
      membership: card.membership,
      cachedAt: new Date().toISOString(),
      sourceAgentPeerId: agentIdentity.agentPeerId,
    };
    if (card.nodeProfile !== undefined) summary.nodeProfile = card.nodeProfile;
    if (card.publicTopics) summary.publicTopics = card.publicTopics;
    if (card.webContentRoot) summary.webContentRoot = card.webContentRoot;
    if (card.agentNetworkProfile) summary.agentNetworkProfile = card.agentNetworkProfile;
    return summary;
  }

  async getAgentCard(ownerId: string): Promise<CachedAgentCardSummary | undefined> {
    return getAgentCardViaRuntime(this._storeAccessorDeps(), ownerId);
  }

  /**
   * Phase 34: latest cached `task.result` payload (with typed Artifacts) for a taskId.
   * Returns `undefined` if the home node has not received a `task.result` for the taskId.
   */
  async getTaskResult(
    taskId: string,
  ): Promise<import("@envoymesh/protocol").TaskResultPayload | undefined> {
    if (!this._taskStore) return undefined;
    return this._taskStore.getTaskResult(taskId);
  }

  async requestAgentCard(
    targetOwnerId: string,
    options?: { timeoutMs?: number },
  ): Promise<{ ok: boolean; error?: string }> {
    this._assertOnline();
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity) {
      return { ok: false, error: "agent identity not available" };
    }
    if (!this._agentCardStore) {
      return { ok: false, error: "agent card store unavailable" };
    }
    if (!this._taskStore) {
      return { ok: false, error: "task store unavailable" };
    }
    const profile = this._requireProfile();
    const mesh = this._requireMesh();
    const budgetMs = options?.timeoutMs ?? AGENT_CARD_REFRESH_RELAY_MS;
    const targetOwner = targetOwnerId.trim();
    const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
      await this._resolvePeerTransportForOwner(targetOwner);
    const startedAt = Date.now();
    const dialHints = await raceWithTimeout(
      this._dialHintsForChat(transportPeerId, listenAddrs),
      agentCardDialHintsBudgetMs(budgetMs),
      "_dialHintsForChat",
    );
    // Remaining budget for expect-reply so dial-hints + reply stay within
    // refreshAgentNetworkWorkers' outer raceWithTimeout(budgetMs).
    const replyTimeoutMs = Math.max(3_000, budgetMs - (Date.now() - startedAt));
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
    // Same-stream expect-reply (message protocol), matching profile.request.
    // Fire-and-forget never waited for agent.card.response, so Team jobs /
    // Agent capabilities stayed empty while chat remained Online-direct.
    try {
      const reply = await sendExpectReplyWithRetry({
        mesh,
        transportPeerId,
        envelope,
        dialHints,
        peerListenAddrs: listenAddrs,
        timeoutMs: replyTimeoutMs,
        rebuildDialHints: () => this._dialHintsForChat(transportPeerId, listenAddrs),
        preferCircuitHints: false,
      });
      if (reply.intent !== "agent.card.response") {
        return { ok: false, error: `expected agent.card.response, got ${reply.intent}` };
      }
      if (!verifyInboundEnvelope(reply)) {
        return { ok: false, error: "agent.card.response signature invalid" };
      }
      const cardResult = await handleInboundAgentCardIntent({
        envelope: reply,
        profile,
        remotePeerId: transportPeerId,
        receivedAt: Date.now(),
        correlationId: reply.correlationId,
        taskStore: this._taskStore,
        trustStore: this._trustStore,
        agentCardStore: this._agentCardStore,
        humanProfileStore: this._humanProfileStore,
        bridgeIdentity: agentIdentity,
        profileDir: this._profileDir,
      });
      if (!cardResult.ok) {
        return { ok: false, error: cardResult.reason };
      }
      if (cardResult.action !== "cached") {
        return { ok: false, error: "unexpected agent.card.response action" };
      }
      if (cardResult.ownerId !== targetOwner) {
        return { ok: false, error: "agent.card.response owner mismatch" };
      }
      await this.recordAgentCardCached(cardResult.ownerId, cardResult.card);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Push our current Agent Card to bonded peers (unsolicited `agent.card.response`).
   * Needed when Join Agent Network flips on: peers only learn `agent-network-worker`
   * from our card, and a pull-only refresh on our side does not update their cache.
   */
  async announceLocalAgentCardToBondedPeers(): Promise<{ announced: number; failed: number }> {
    this._assertOnline();
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity) return { announced: 0, failed: 0 };
    const profile = this._requireProfile();
    this._requireMesh();
    const cfg = await this.getNodeConfig();
    const { buildLocalAgentCard } = await import("./agent-card-inbound.js");
    const { createAgentCardResponsePayload } = await import("@envoymesh/protocol");
    const card = await buildLocalAgentCard({
      profile,
      humanProfileStore: this._humanProfileStore,
      profileDir: this._profileDir,
      capabilityProviderEnabled: cfg.capabilityProviderEnabled === true,
      agentNetworkProfile: cfg.agentNetworkProfile,
    });
    const payload = createAgentCardResponsePayload(card);
    let announced = 0;
    let failed = 0;
    const bonds = (await this.getBonds()).filter(
      (bond) => bond.level === "direct" || bond.level === "referred",
    );
    const outcomes = await mapPoolSettled(
      bonds,
      AGENT_CARD_REFRESH_CONCURRENCY,
      async (bond) => {
        try {
          let connected = false;
          try {
            connected = (await this.getPeerConnectionInfo(bond.peerOwnerId)).connected;
          } catch {
            /* offline */
          }
          if (!connected) {
            try {
              await raceWithTimeout(
                this.warmContactConnection(bond.peerOwnerId),
                AGENT_CARD_REFRESH_WARM_MS,
                `agentCardAnnounceWarm(${bond.peerOwnerId.slice(0, 16)}…)`,
              );
            } catch {
              /* still offline */
            }
          }
          const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
            await this._resolvePeerTransportForOwner(bond.peerOwnerId.trim());
          const timeoutMs = agentCardRefreshTimeoutMs(
            (await this.getPeerConnectionInfo(bond.peerOwnerId).catch(() => ({ connected: false })))
              .connected,
          );
          const dialHints = await raceWithTimeout(
            this._dialHintsForChat(transportPeerId, listenAddrs),
            agentCardDialHintsBudgetMs(timeoutMs),
            "_dialHintsForChat",
          );
          const envelope = signUnsignedEnvelope(
            createUnsignedEnvelope({
              senderPeerId: agentIdentity.agentPeerId,
              senderPublicKey: agentIdentity.agentPublicKeyPem,
              senderRole: "agent",
              recipientPeerId: recipientEnvelopePeerId,
              recipientRole: "agent",
              intent: "agent.card.response",
              payload,
              agentCredential: agentIdentity.agentCredential,
            }),
            agentIdentity.agentPrivateKeyPem,
          );
          const deliver = await raceWithTimeout(
            this._deliverCallEnvelope(
              transportPeerId,
              envelope,
              dialHints,
              listenAddrs,
              false,
            ),
            timeoutMs,
            `announceAgentCard(${bond.peerOwnerId.slice(0, 16)}…)`,
          );
          if (!deliver?.delivered) {
            anWarn("refresh", "announce card deliver failed", {
              owner: bond.peerOwnerId.slice(0, 24),
              transport: transportPeerId.slice(0, 16),
            });
            return false;
          }
          return true;
        } catch (err) {
          anWarn("refresh", "announce card error", {
            owner: bond.peerOwnerId.slice(0, 24),
            error: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120),
          });
          return false;
        }
      },
    );
    announced = outcomes.filter((ok) => ok).length;
    failed = outcomes.filter((ok) => !ok).length;
    return { announced, failed };
  }

  /**
   * Debounced push of our Agent Card to bonded peers. Used when the owner
   * edits worker profile (skills, etc.) so chip spam does not open N streams.
   * Join toggle still uses the fuller `refreshAgentNetworkWorkers` path.
   */
  private _scheduleAnnounceLocalAgentCard(reason: string): void {
    if (this._announceLocalAgentCardTimer) {
      clearTimeout(this._announceLocalAgentCardTimer);
      this._announceLocalAgentCardTimer = null;
    }
    this._announceLocalAgentCardTimer = setTimeout(() => {
      this._announceLocalAgentCardTimer = null;
      void this.announceLocalAgentCardToBondedPeers()
        .then((pushed) => {
          if (pushed.failed > 0) {
            console.warn(
              `[agent-network] announce after ${reason}: announced=${pushed.announced} failed=${pushed.failed}`,
            );
          }
        })
        .catch((err) => {
          console.warn(
            `[agent-network] announce after ${reason} failed:`,
            err instanceof Error ? err.message : err,
          );
        });
    }, NodeServiceImpl._ANNOUNCE_LOCAL_AGENT_CARD_DEBOUNCE_MS);
  }

  /**
   * Fetch agent cards from bonded peers, then rebuild the capability index so
   * Team jobs see freshly Join'd / LAN-bonded workers without a restart.
   *
   * Card replies are async: we refresh the index immediately (opt-out / local
   * state) and again after a short delay so newly cached cards enter the soft
   * pool without a second manual Refresh.
   *
   * Timing: warm offline peers briefly, then use a short timeout when already
   * connected and a longer relay budget otherwise. Requests run in parallel
   * (bounded concurrency) so a few slow peers don't serialize the whole RPC.
   *
   * When this node has Join Agent Network enabled, also push our card so peers
   * learn `agent-network-worker` without waiting for them to pull.
   */
  async refreshAgentNetworkWorkers(): Promise<{ requested: number; failed: number }> {
    let requested = 0;
    let failed = 0;
    anLog("refresh", "refreshAgentNetworkWorkers start");
    try {
      const cfg = await this.getNodeConfig();
      if (cfg.capabilityProviderEnabled === true) {
        try {
          const pushed = await this.announceLocalAgentCardToBondedPeers();
          anLog("refresh", "announce local card", {
            announced: pushed.announced,
            failed: pushed.failed,
          });
          if (pushed.failed > 0) {
            anWarn("refresh", "announceLocalAgentCard partial failure", {
              announced: pushed.announced,
              failed: pushed.failed,
            });
          }
        } catch (err) {
          anWarn("refresh", "announceLocalAgentCardToBondedPeers failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        anLog("refresh", "skip announce — Join Agent Network off");
      }
      const bonds = (await this.getBonds()).filter(
        (bond) => bond.level === "direct" || bond.level === "referred",
      );
      requested = bonds.length;
      anLog("refresh", "pull cards from bonded peers", { count: requested });
      const outcomes = await mapPoolSettled(
        bonds,
        AGENT_CARD_REFRESH_CONCURRENCY,
        async (bond) => {
          try {
            let connected = false;
            try {
              connected = (await this.getPeerConnectionInfo(bond.peerOwnerId)).connected;
            } catch {
              /* treat as offline */
            }
            if (!connected) {
              try {
                await raceWithTimeout(
                  this.warmContactConnection(bond.peerOwnerId),
                  AGENT_CARD_REFRESH_WARM_MS,
                  `agentCardWarm(${bond.peerOwnerId.slice(0, 16)}…)`,
                );
                connected = (await this.getPeerConnectionInfo(bond.peerOwnerId)).connected;
              } catch {
                /* still offline — use relay budget below */
              }
            }
            const timeoutMs = agentCardRefreshTimeoutMs(connected);
            const result = await raceWithTimeout(
              this.requestAgentCard(bond.peerOwnerId, { timeoutMs }),
              timeoutMs,
              `requestAgentCard(${bond.peerOwnerId.slice(0, 16)}…)`,
            );
            return Boolean(result?.ok);
          } catch {
            return false;
          }
        },
      );
      failed = outcomes.filter((ok) => !ok).length;
      anLog("refresh", "card pull done", { requested, failed, ok: requested - failed });
    } catch {
      /* bonds unavailable — still refresh local index */
      anWarn("refresh", "bond list / card pull failed — still refreshing index");
    }
    try {
      await this.refreshAgentNetworkMembershipIndex();
      const cards = await this.listAgentCards();
      this.emit("home:agent-cards-updated", { cards });
      anLog("refresh", "membership index refreshed", { cards: cards.length });
    } catch (err) {
      anWarn("refresh", "refreshAgentNetworkMembershipIndex failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    this._scheduleDeferredAgentNetworkIndexRefresh();
    return { requested, failed };
  }

  private _agentNetworkIndexRefreshTimers: ReturnType<typeof setTimeout>[] = [];
  /** In-flight Join/LAN refresh work — awaited in stopNode so tests don't rm() under us. */
  private _agentNetworkRefreshInflight: Promise<unknown> = Promise.resolve();

  private _trackAgentNetworkRefresh(work: Promise<unknown>): void {
    this._agentNetworkRefreshInflight = Promise.allSettled([
      this._agentNetworkRefreshInflight,
      work,
    ]).then(() => undefined);
  }

  private _scheduleDeferredAgentNetworkIndexRefresh(): void {
    for (const t of this._agentNetworkIndexRefreshTimers) clearTimeout(t);
    this._agentNetworkIndexRefreshTimers = [];
    // Card replies are async over the message protocol — re-index + emit a few
    // times so Social/Team jobs pick up agent-network-worker without a second click.
    for (const delayMs of [1_500, 4_000, 8_000]) {
      const timer = setTimeout(() => {
        this._agentNetworkIndexRefreshTimers = this._agentNetworkIndexRefreshTimers.filter(
          (t) => t !== timer,
        );
        void this.refreshAgentNetworkMembershipIndex()
          .then(async () => {
            try {
              const cards = await this.listAgentCards();
              this.emit("home:agent-cards-updated", { cards });
            } catch {
              /* ignore */
            }
          })
          .catch((err) => {
            console.warn("[agent-network] deferred refreshAgentNetworkMembershipIndex failed:", err);
          });
      }, delayMs);
      this._agentNetworkIndexRefreshTimers.push(timer);
    }
  }

  async recordAgentCardCached(ownerId: string, card: import("@envoymesh/protocol").AgentCard): Promise<void> {
    if (this._agentActivityStore) {
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
    // Notify Social so Workers status / Team job UIs update when cards land
    // after an async agent.card.response (not only after Refresh returns).
    try {
      const cards = await this.listAgentCards();
      this.emit("home:agent-cards-updated", { cards });
    } catch {
      /* ignore */
    }
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
    return runScheduledFriendAutopilotViaRuntime(this._friendAutopilotContext());
  }

  async listSocialProxySessions(): Promise<SocialProxySession[]> {
    return listSocialProxySessionsViaRuntime(this._socialProxyContext());
  }

  async advanceSocialProxySession(sessionId: string): Promise<SocialProxySession | undefined> {
    return advanceSocialProxySessionViaRuntime(this._socialProxyContext(), sessionId);
  }

  async notifySocialProxyOwnerCommitment(
    sessionId: string,
    ownerCommitmentRef: string,
  ): Promise<SocialProxySession | undefined> {
    return notifySocialProxyOwnerCommitmentViaRuntime(
      this._socialProxyContext(),
      sessionId,
      ownerCommitmentRef,
    );
  }

  async runSocialProxyPass(input?: {
    targetOwnerId?: string;
    targetPeerId?: string;
    targetAgentPeerId?: string;
    focusSessionId?: string;
  }): Promise<{ ok: boolean; error?: string; correlationId?: string }> {
    return runSocialProxyPassViaRuntime(this._runSocialProxyPassContext(), input) as Promise<{
      ok: boolean;
      error?: string;
      correlationId?: string;
    }>;
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
    await this._deliverCallEnvelope(transportPeerId, signed, dialHints);
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
    await this._deliverCallEnvelope(transportPeerId, signed, dialHints);

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
    return listAgentCirclesViaRuntime(this._storeAccessorDeps());
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
      getLastInteractionAt: async (peerOwnerId: string): Promise<string | null> => {
        // Read the most recent chat message timestamp for this peer from the
        // persisted chat log. Returns null when there's no history (which
        // `findDormantBonds` treats as "very old" → dormant).
        if (!this._chatLogStore) return null;
        try {
          const recent = await this._chatLogStore.listThread(peerOwnerId, 1);
          return recent.length > 0 ? recent[0].metadata.timestamp : null;
        } catch {
          return null;
        }
      },
    };
    return findDormantBonds(deps, thresholdDays ?? 90);
  }

  // Phase 23B — Connection suggester pass
  async runConnectionSuggesterPass(): Promise<Array<{ remoteOwnerId: string; remoteDisplayName: string; reason: string; relevanceScore: number }>> {
    return runConnectionSuggesterPassViaRuntime(this._agentPassesContext());
  }

  // Phase 23D — Chat RAG search
  async chatRagSearch(_query: string, _opts?: { ownerId?: string; maxResults?: number }): Promise<Array<{ messageId: string; contactName: string; snippet: string; timestamp: string }>> {
    return chatRagSearchViaRuntime(this._agentPassesContext(), _query, _opts);
  }

  // Phase 25A — Mesh awareness pass
  async runMeshAwarenessPass(): Promise<Array<{ kind: string; summary: string; matchedTopic: string; peerCount: number; createdAt: string }>> {
    return runMeshAwarenessPassViaRuntime(this._agentPassesContext());
  }

  private _agentPassesContext(): AgentPassesContext {
    return buildAgentPassesContext(this._serviceContextDeps().agentPasses);
  }

  // Phase 29 — OpenClaw Runtime
  private readonly _openClawState = createOpenClawRuntimeState();

  // Phase 49 — Pi Runtime (local coding agent; local-only, no mesh.* tools)
  private readonly _piState = createPiRuntimeState();

  /**
   * Phase G / 12b — ACP permission waiter. Mapped onto existing
   * `pi:proposal` / `piRespondToProposal` so EnvoyGo needs no changes.
   */
  private readonly _acpPermissionBridge = new AcpPermissionBridge(
    (_event, payload) => {
      this.emit("pi:proposal", {
        proposal: {
          uiRequestId: payload.requestId,
          title: payload.toolName,
          message: payload.description,
          timeoutMs: payload.timeoutMs,
          receivedAt: new Date().toISOString(),
        },
      });
    },
  );

  /** Per-chat ACP hosts + parallel in-flight turns. */
  private readonly _ehChatRuntime = new EhChatRuntime();

  /** Envoy Harness ask_user / plan-review / mode-switch waiter. */
  private readonly _ehUserQuestionBridge = new AcpUserQuestionBridge(
    (_event, payload) => {
      this.emit("eh:user_question", payload);
    },
  );

  /** EH tool permissions (`session/request_permission`) — not Pi `pi:proposal`. */
  private readonly _ehPermissionBridge = new EhPermissionBridge(
    (_event, payload) => {
      this.emit("eh:permission", payload);
    },
    {
      getCwd: () => this._envoyHarnessResolvedCwd(),
      // Attribute the permission prompt to the sidebar chat that owns the
      // in-flight turn (the ACP session id of the persistent host ↔ the
      // active turn's chatId). Multi-thread UI can then ignore prompts
      // from other chats.
      getChatIdForSession: (sessionId) =>
        this._ehChatRuntime.chatIdForSession(sessionId),
    },
  );

  // Phase 54 — Envoy Local (downloadable llama-server)
  private readonly _envoyLocalState: EnvoyLocalRuntimeState = createEnvoyLocalRuntimeState();
  private readonly _envoyLocalEmbedState: EnvoyLocalEmbedRuntimeState =
    createEnvoyLocalEmbedRuntimeState();
  /**
   * After first onEmbedReady (or skipped auto-provision), boot RAG may reindex
   * on config:updated without waiting forever for :18791.
   */
  embedBootRagReindexCompleted = false;
  /** >0 while reindex/connector sync holds embed idle-unload. */
  private _envoyLocalEmbedIdleHold = 0;
  private _vaultRagWatcher: VaultRagWatcherHandle | null = null;
  private _vaultRagWatchTimer: ReturnType<typeof setTimeout> | null = null;
  private _vaultRagWatchInflight: Promise<void> | null = null;

  private _holdEnvoyLocalEmbedIdle(): () => void {
    this._envoyLocalEmbedIdleHold += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this._envoyLocalEmbedIdleHold = Math.max(0, this._envoyLocalEmbedIdleHold - 1);
    };
  }

  /** Debounced incremental vault → vector reindex (no Obsidian/MCP connector sync). */
  scheduleVaultRagIncrementalReindex(reason = "watch"): void {
    if (this._vaultDir === "/tmp/unknown" || !this._vaultDir) return;
    if (this._vaultRagWatchTimer) clearTimeout(this._vaultRagWatchTimer);
    this._vaultRagWatchTimer = setTimeout(() => {
      this._vaultRagWatchTimer = null;
      void this._runVaultRagIncrementalReindex(reason);
    }, 500);
    this._vaultRagWatchTimer.unref?.();
  }

  private async _runVaultRagIncrementalReindex(reason: string): Promise<void> {
    if (this._vaultRagWatchInflight) {
      await this._vaultRagWatchInflight.catch(() => undefined);
    }
    const job = (async () => {
      const releaseIdle = this._holdEnvoyLocalEmbedIdle();
      try {
        const rag = await this._getRagService();
        if (!rag || !this._vaultDir) return;
        const config = await this.getNodeConfig();
        await rag.refreshConfig({
          knowledgeBase: config.aiSettings?.knowledgeBase,
          modelProviders: config.modelProviders,
          envoyLocalEmbed: await this._envoyLocalEmbedOverlay(),
        });
        const vaultIndex = await buildVaultIndex(
          buildVaultIndexOptionsFromKnowledgeBase(
            this._vaultDir,
            config.aiSettings?.knowledgeBase,
          ),
        );
        await rag.reindexVault({
          vaultIndex,
          knowledgeBase: config.aiSettings?.knowledgeBase,
          force: false,
        });
        console.info(`[rag] incremental vault reindex ok (${reason})`);
      } catch (err) {
        console.warn(
          `[rag] incremental vault reindex failed (${reason}):`,
          err instanceof Error ? err.message : err,
        );
      } finally {
        releaseIdle();
      }
    })();
    this._vaultRagWatchInflight = job;
    await job;
    if (this._vaultRagWatchInflight === job) this._vaultRagWatchInflight = null;
  }

  startVaultRagWatcher(): void {
    this.stopVaultRagWatcher();
    if (!this._vaultDir || this._vaultDir === "/tmp/unknown") return;
    this._vaultRagWatcher = createVaultRagWatcher({
      vaultDir: this._vaultDir,
      debounceMs: 3_000,
      onChange: (paths) => {
        const label =
          paths.length === 0
            ? "watch"
            : `watch:${paths.slice(0, 3).filter(Boolean).join(",")}`;
        this.scheduleVaultRagIncrementalReindex(label);
      },
    });
    console.info(`[rag] vault watcher started on ${this._vaultDir}`);
  }

  stopVaultRagWatcher(): void {
    if (this._vaultRagWatchTimer) {
      clearTimeout(this._vaultRagWatchTimer);
      this._vaultRagWatchTimer = null;
    }
    this._vaultRagWatcher?.stop();
    this._vaultRagWatcher = null;
  }

  private _bindOpenClawPersistence(): void {
    if (this._profileDir === "/tmp/unknown") {
      return;
    }
    const path = join(this._profileDir, "openclaw-pending-replies.json");
    bindOpenClawPendingReplyPersistenceViaRuntime(this._openClawState, path);
    // Surface any cids that were orphaned by the last restart.
    loadAndReportOrphanedOpenClawPendingRepliesViaRuntime(path);
  }

  private _openClawRuntimeDeps(): OpenClawRuntimeDeps {
    return buildOpenClawRuntimeDeps(this);
  }

  /** Track mesh tools invoked during an OpenClaw H2A turn (via bridge execute-tool). */
  recordOpenClawToolCall(toolName: string): void {
    recordOpenClawToolCallViaRuntime(this._openClawState, toolName);
  }

  /** True when the built-in OpenClaw gateway webhook is reachable. */
  isOpenClawReady(): boolean {
    return isOpenClawReadyViaRuntime(this._openClawState);
  }

  /**
   * Phase 8 / b3 — envoy-harness readiness probe (AN engine).
   *
   * Returns `true` when:
   * 1. `ENVOY_HARNESS_STUB_PHASE_8_STEP_1=1` is NOT set (the
   *    test escape hatch).
   * 2. The API key is available — from any of:
   *    - `ENVOY_HARNESS_API_KEY` (universal override)
   *    - The host's `ModelProviderConfig.apiKey` (DI from
   *      `_envoyHarnessHostApiKey` cache — see
   *      `_refreshEnvoyHarnessHostConfig()`)
   *    - The provider-specific env var
   *      (`DEEPSEEK_API_KEY` / `OPENAI_API_KEY` /
   *      `ANTHROPIC_API_KEY`)
   *
   * **Phase 8 / b3.live (model + API key inheritance):** the
   * config also considers the host's `ModelProviderConfig`.
   * The `_envoyHarnessHostModel` + `_envoyHarnessHostApiKey`
   * caches are populated by `_refreshEnvoyHarnessHostConfig()`
   * (fire-and-forget on every call; the first call returns
   * the default, subsequent calls reflect the host's config).
   * The host's model + API key take effect via the
   * `hostModel` + `hostApiKey` parameters to
   * `loadEnvoyHarnessRuntimeConfig`.
   *
   * **Why env-var presence, not a model call:** the model
   * call (`createProviderAdapter(...)`) is the real check
   * for whether the API key is valid. We do that check lazily
   * on the first `askEnvoyHarness` call. The env-var +
   * cache check is the readiness probe — it tells the
   * orchestrator "this engine is worth invoking" without
   * burning a model call.
   *
   * **What the chain worker does on `ready === false`:** the
   * dispatch in `node-service-chain-orchestration.ts` returns
   * `envoy_harness_unavailable` and the orchestrator retries
   * on a different node (or escalates). The operator sees a
   * clean failure, not a stack trace.
   */
  isEnvoyHarnessReady(): boolean {
    // Fire-and-forget refresh of the host model + API key
    // cache. The current cache values are used for the
    // readiness check (the first call uses the default;
    // subsequent calls reflect the most recent refresh).
    // The full async check happens in `askEnvoyHarness`.
    void this._refreshEnvoyHarnessHostConfig();
    return loadEnvoyHarnessRuntimeConfig({
      hostModel: this._envoyHarnessHostModel,
      hostApiKey: this._envoyHarnessHostApiKey,
      hostEndpoint: this._envoyHarnessHostEndpoint,
    }).ready;
  }

  /**
   * v1.16 — the live envoy-harness adapter for same-runtime
   * cross-verify. The chain-verify loop's `buildAdapter("envoy-harness")`
   * returns this (undefined until the runtime is constructed, i.e. until
   * `isEnvoyHarnessReady()` has been true and `askEnvoyHarness` ran).
   */
  getEnvoyHarnessAdapter(): import("@envoymesh/agent-adapter").AgentAdapter | undefined {
    return this._envoyHarnessRuntimeCache?.adapter;
  }

  /**
   * R2 — build (once) the standalone peer execution pool from the
   * persisted `envoyHarnessPeers` config. Fail-open: peers that can't
   * connect are skipped; the rest still form the pool.
   */
  private async _ensureEnvoyHarnessPeerPool(): Promise<void> {
    if (this._envoyHarnessPeerPool !== undefined) return;
    const peers = this._configStore?.peek()?.envoyHarnessPeers;
    if (peers === undefined || peers.length === 0) return;
    const { buildEnvoyHarnessPeerPool } = await import(
      "./agent-runtime-envoy/peer-pool.js"
    );
    this._envoyHarnessPeerPool = await buildEnvoyHarnessPeerPool(peers);
    if (this._envoyHarnessPeerPool.failed.length > 0) {
      console.warn(
        `[node-service] envoy-harness peer pool partial: connected ` +
          `${this._envoyHarnessPeerPool.connected.join(",")}, failed ` +
          `${this._envoyHarnessPeerPool.failed.length}`,
      );
    }
  }

  /** R2 — the peer management surface: connected peers + their models. */
  listEnvoyHarnessPeers(): ReadonlyArray<{
    id: string;
    model?: string;
    capabilities?: readonly string[];
  }> {
    return (
      this._envoyHarnessPeerPool?.registry
        .list()
        .map(({ id, model, capabilities }) => ({
          id,
          ...(model !== undefined ? { model } : {}),
          ...(capabilities !== undefined ? { capabilities } : {}),
        })) ?? []
    );
  }

  /** R2 — close the peer pool sockets (host teardown). Idempotent. */
  closeEnvoyHarnessPeerPool(): void {
    this._envoyHarnessPeerPool?.closeAll();
    this._envoyHarnessPeerPool = undefined;
  }

  /**
   * Phase 8 / b3 — sync ask via envoy-harness (AN engine).
   *
   * Replaces the Step 1 stub. Lazily constructs the
   * `RealEnvoyHarnessRuntime` on the first call (the model
   * adapter + cross-runtime submitter + adapter are built
   * once per process). Subsequent calls reuse the cached
   * runtime.
   *
   * **Error behavior:**
   * - `ready === false` (no API key): throws
   *   `envoy_harness_stub_phase_8_step_1` (matches the Step 1
   *   stub message — backwards-compatible error code for the
   *   orchestrator + tests).
   * - `ready === true` but model adapter construction fails
   *   (e.g. unknown provider): throws the original error from
   *   `createProviderAdapter`.
   * - The LLM call returns no text: throws
   *   `envoy_harness_empty: no text in result` (clean failure,
   *   matches the openclaw / ext engine behavior).
   *
   * **Cancellation:** the host's `abortSignal` is forwarded
   * to the agent (the `ask()` call's `signal` option is set
   * by the chain worker in `chain-worker-executor.ts`).
   */
  async askEnvoyHarness(
    prompt: string,
    opts?: { providerHint?: string; costCapUsd?: number },
  ): Promise<string> {
    const { turnId } = await this.startEnvoyHarnessTurn(prompt, opts);
    const active = this._ehChatRuntime.getTurn(turnId);
    if (active === undefined) {
      throw new Error("envoy_harness_turn_lost");
    }
    const result = await active.resultPromise;
    if (!result.ok) {
      if (result.cancelled === true) {
        throw new Error("envoy_harness_cancelled");
      }
      throw new Error(result.error ?? "envoy_harness_turn_failed");
    }
    return stripModelThinking(result.text ?? "");
  }

  async startEnvoyHarnessTurn(
    prompt: string,
    opts?: {
      providerHint?: string;
      costCapUsd?: number;
      attachments?: import("@envoymesh/api").AgentAttachmentRef[];
      chatId?: string;
    },
  ): Promise<{ turnId: string }> {
    await this._refreshEnvoyHarnessHostConfig();
    const config = loadEnvoyHarnessRuntimeConfig({
      hostModel: this._envoyHarnessHostModel,
      hostApiKey: this._envoyHarnessHostApiKey,
      hostEndpoint: this._envoyHarnessHostEndpoint,
    });
    if (!config.ready) {
      throw new Error("envoy_harness_stub_phase_8_step_1");
    }

    const trimmed = prompt.trim();
    if (trimmed.length === 0) {
      throw new Error("envoy_harness_empty_prompt");
    }

    const chat = await this._resolveEhChat(opts?.chatId ?? null);
    if (opts?.chatId?.trim() && !chat) {
      throw new Error(`envoy_harness_chat_not_found: ${opts.chatId}`);
    }
    if (chat && this._ehChatRuntime.hasTurnForChat(chat.id)) {
      throw new Error("envoy_harness_turn_busy");
    }

    await this._getOrInitEnvoyHarnessRuntime();
    const askOpts = {
      providerHint: opts?.providerHint,
      costCeilingUsd: readEffectiveCostCapUsd(opts?.costCapUsd, 1.0),
    };

    const cwd = chat?.cwd ?? (await this._envoyHarnessResolvedCwd());
    const payload = await buildEhPromptPayload(
      trimmed,
      opts?.attachments,
      cwd,
    );

    const turnId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    this.emit("eh:turn_started", {
      turnId,
      userPrompt: trimmed,
      startedAt,
      ...(chat ? { chatId: chat.id } : {}),
    });
    this.emit("eh:prompt_busy", {
      busy: true,
      ...(chat ? { chatId: chat.id } : {}),
    });

    const resultPromise = this._executeEhTurn(turnId, payload.text, askOpts, chat?.id, cwd);
    this._ehChatRuntime.registerTurn({
      turnId,
      chatId: chat?.id,
      cwd,
      userPrompt: trimmed,
      startedAt,
      streamingText: "",
      changedFiles: [],
      resultPromise,
    });

    void resultPromise.finally(() => {
      const removed = this._ehChatRuntime.removeTurn(turnId);
      if (!removed) return;
      this.emit("eh:prompt_busy", {
        busy: false,
        ...(removed.chatId ? { chatId: removed.chatId } : {}),
      });
      if (removed.sessionId) {
        this._ehPermissionBridge.clearForSession(removed.sessionId);
      }
      if (removed.chatId) {
        this._ehUserQuestionBridge.clearForChat(removed.chatId);
      }
    });

    return { turnId };
  }

  async getEnvoyHarnessTurnStatus(
    chatId?: string,
  ): Promise<import("@envoymesh/api").EhTurnStatus> {
    const active = chatId
      ? this._ehChatRuntime.getTurnForChat(chatId)
      : this._ehChatRuntime.listActiveTurns()[0];
    if (active === undefined) {
      return { busy: false };
    }
    return {
      busy: true,
      turnId: active.turnId,
      userPrompt: active.userPrompt,
      streamingText: active.streamingText,
      startedAt: active.startedAt,
      ...(active.chatId ? { chatId: active.chatId } : {}),
    };
  }

  /**
   * U6 — drive asks through the persistent ACP session so plan / memory /
   * transcript state is shared with the EHUI rails.
   */
  private async _executeEhTurn(
    turnId: string,
    prompt: string,
    _askOpts: { providerHint?: string; costCeilingUsd?: number; signal?: AbortSignal },
    chatId?: string,
    cwdOverride?: string,
  ): Promise<import("@envoymesh/api").EhTurnCompleteEvent> {
    const turnRecord = () => this._ehChatRuntime.getTurn(turnId);
    try {
      let host: EnvoyHarnessPersistentAcpHost;
      if (chatId) {
        const cwd = cwdOverride ?? (await this._resolveEhChat(chatId))?.cwd;
        if (!cwd) {
          throw new Error(`envoy_harness_chat_not_found: ${chatId}`);
        }
        const ensured = await this._ensureEhChatHost(chatId, cwd);
        host = ensured.host;
        const turn = turnRecord();
        if (turn) turn.sessionId = ensured.sessionId;
      } else {
        await this._ensureEnvoyHarnessPersistentAcpHost();
        host = this._envoyHarnessPersistentAcpHost!;
        if (!host) {
          throw new Error("envoy-harness persistent ACP host failed to start");
        }
        const turn = turnRecord();
        if (turn && host.sessionId) turn.sessionId = host.sessionId;
      }
      let streamingText = "";
      const text = await host.prompt(prompt, {
        ...(_askOpts.signal !== undefined ? { signal: _askOpts.signal } : {}),
        onActivity: (activity) => {
          const filePath = pathFromEhActivity(activity);
          const active = turnRecord();
          if (
            filePath !== undefined &&
            active &&
            !active.changedFiles.includes(filePath)
          ) {
            active.changedFiles.push(filePath);
          }
          this.emit("eh:activity", {
            kind: activity.kind,
            summary: activity.summary,
            ...(activity.toolName !== undefined
              ? { toolName: activity.toolName }
              : {}),
            ...(activity.ts !== undefined ? { ts: activity.ts } : {}),
            ...(active?.chatId ? { chatId: active.chatId } : {}),
          });
        },
        onToken: (token) => {
          if (token.role !== "assistant" || token.delta.length === 0) return;
          streamingText += token.delta;
          const active = turnRecord();
          if (active) active.streamingText = streamingText;
          this.emit("eh:turn_token", {
            turnId,
            delta: token.delta,
            streamingText,
            ...(active?.chatId ? { chatId: active.chatId } : {}),
          });
        },
      });
      const active = turnRecord();
      const changedFiles = active ? [...active.changedFiles] : [];
      const eventChatId = active?.chatId;
      const withChatId = <T extends object>(event: T): T =>
        eventChatId ? ({ ...event, chatId: eventChatId } as T) : event;

      const finishComplete = (
        complete: import("@envoymesh/api").EhTurnCompleteEvent,
      ): import("@envoymesh/api").EhTurnCompleteEvent => {
        const withFiles =
          changedFiles.length > 0
            ? { ...complete, changedFiles }
            : complete;
        this.emit("eh:turn_complete", withChatId(withFiles));
        if (changedFiles.length > 0) {
          this.emit("eh:files_changed", {
            turnId,
            files: changedFiles,
            ...(eventChatId ? { chatId: eventChatId } : {}),
          });
        }
        return withFiles;
      };

      if (text.stopReason === "cancelled") {
        return finishComplete({
          turnId,
          ok: false,
          cancelled: true,
          error: "envoy_harness_cancelled",
          stopReason: "cancelled",
        });
      }
      if (text.turnHints !== undefined) {
        this.emit("eh:turn_hints", {
          ...text.turnHints,
          ...(eventChatId ? { chatId: eventChatId } : {}),
        });
      }
      const assistantText = text.text;
      if (!assistantText || assistantText.trim().length === 0) {
        return finishComplete({
          turnId,
          ok: false,
          error: "envoy_harness_empty: no text in result",
        });
      }
      return finishComplete({
        turnId,
        ok: true,
        text: assistantText,
        stopReason: text.stopReason,
        ...(text.turnHints !== undefined ? { turnHints: text.turnHints } : {}),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const cancelled =
        msg === "envoy_harness_cancelled" ||
        msg.toLowerCase().includes("cancel");
      const active = turnRecord();
      const changedFiles = active ? [...active.changedFiles] : [];
      const complete: import("@envoymesh/api").EhTurnCompleteEvent = {
        turnId,
        ok: false,
        error: msg,
        ...(cancelled ? { cancelled: true } : {}),
        ...(changedFiles.length > 0 ? { changedFiles } : {}),
        ...(active?.chatId ? { chatId: active.chatId } : {}),
      };
      this.emit("eh:turn_complete", complete);
      if (changedFiles.length > 0) {
        this.emit("eh:files_changed", {
          turnId,
          files: changedFiles,
          ...(active?.chatId ? { chatId: active.chatId } : {}),
        });
      }
      return complete;
    }
  }

  /**
   * Phase 8 / v1.2 — ask the envoy-harness runtime
   * to run a specific skill. Returns the result
   * formatted as a chat-reply string.
   *
   * **Algorithm (Q5 + Q4 of the v1.2 sub-plan):**
   * 1. Check the runtime is ready (same path as
   *    `askEnvoyHarness`).
   * 2. Look up the skill in the manifest for the
   *    cost ceiling (`costCeilingUsd`). Default
   *    to `1.0` when the descriptor's cap is
   *    `undefined`.
   * 3. Lazy-construct the runtime (same path as
   *    `askEnvoyHarness`).
   * 4. Call `runtime.askSkill(message, { skillId,
   *    costCeilingUsd, deadlineMs: 60_000, ... })`
   *    to get the raw `SignedAgentResult`.
   * 5. Format the result via `formatSkillResult`
   *    (handles `text` / `file` / `image`; throws
   *    `StructuredResultError` for `structured`
   *    first blocks — Q2 + Q7 fall-through).
   *
   * **Throws:**
   * - `envoy_harness_stub_phase_8_step_1` when the
   *   runtime isn't ready (caller should fall
   *   through to v1.1 free-form LLM ask per Q7).
   * - `unknown envoy-harness skill: <id>` when the
   *   manifest doesn't have the skill (defensive;
   *   the router's `targetSkill` should be a real
   *   skill from the same manifest).
   * - `StructuredResultError` (re-thrown from the
   *   formatter) when the skill returns a
   *   `structured` first block (B-class; Q2).
   * - Network / timeout / model errors from
   *   `runtime.askSkill` (Q7).
   */
  async askEnvoyHarnessSkill(
    message: string,
    skillId: string,
    opts?: { providerHint?: string; costCapUsd?: number },
  ): Promise<string> {
    await this._refreshEnvoyHarnessHostConfig();
    const config = loadEnvoyHarnessRuntimeConfig({
      hostModel: this._envoyHarnessHostModel,
      hostApiKey: this._envoyHarnessHostApiKey,
      hostEndpoint: this._envoyHarnessHostEndpoint,
    });
    if (!config.ready) {
      throw new Error("envoy_harness_stub_phase_8_step_1");
    }
    // Look up the skill in the manifest for the
    // cost ceiling (Q5). Defensive: the router's
    // `targetSkill` came from the same manifest
    // projection, so this should always find a
    // match — but the runtime is async + the
    // manifest could change between read and use.
    const manifest = this.getNodeManifest();
    const skill = manifest.skills.find(
      (s) => s.runtime === "envoy-harness" && s.skillId === skillId,
    );
    if (!skill) {
      throw new Error(`unknown envoy-harness skill: ${skillId}`);
    }
    const runtime = await this._getOrInitEnvoyHarnessRuntime();
    // v1.5 — Q7 (cost) precedence:
    // per-prompt `/cost:N` (gated by the
    // env-var flag) > per-skill `costCeilingUsd`
    // > v0 default (1.0). The helper checks the
    // env-var flag + returns the effective value.
    const costCeilingUsd = readEffectiveCostCapUsd(
      opts?.costCapUsd,
      skill.costCeilingUsd ?? 1.0,
    );
    const result = await runtime.askSkill(message, {
      skillId,
      costCeilingUsd,
      deadlineMs: 60_000, // Q4 — generous headroom for code skills
      // v1.5 — thread the provider hint to the
      // runtime's audit log (dormant: the
      // adapter doesn't switch providers yet).
      providerHint: opts?.providerHint,
    });
    const formatted = formatSkillResult(result);
    // v1.3 (Q6) — silent fall-through: the formatter
    // returns `undefined` when there's no per-skill
    // formatter for the skillId (e.g. a non-B-class
    // structured block, or an unknown schemaRef). The
    // dispatch catches + falls back to v1.1 free-form
    // LLM ask. We throw `StructuredResultError` so
    // the existing dispatch `try/catch` handles it.
    if (formatted === undefined) {
      const first = result.content[0];
      const schemaRef =
        first !== undefined && first.kind === "structured"
          ? first.schemaRef
          : "(unknown)";
      throw new StructuredResultError(result.skillId, schemaRef);
    }
    return stripModelThinking(formatted);
  }

  /**
   * Phase 8 / b3 — lazy-init the real envoy-harness runtime.
   *
   * **Why lazy:** the runtime is per-process. The chain
   * worker is the only consumer (via the AN engine
   * dispatch). Constructing it eagerly at node bootstrap
   * would couple the bootstrap path to envoy-harness
   * readiness (we'd need to fail bootstrap if the API key
   * is missing). Lazy defers the construction to the first
   * `askEnvoyHarness` call, AFTER `isEnvoyHarnessReady()`
   * returns true.
   *
   * **The `agentIdentity`:** the runtime needs the node's
   * `agentPeerId` (for the worker's peerId stamp) and
   * `agentPrivateKeyPem` (for `defaultSignResult`). Both
   * come from `ensureAgentIdentity` — a method that
   * bootstraps the identity on first call and caches it.
   *
   * **The `askOpenClaw` closure:** the runtime's
   * `LocalRuntimeRegistry` needs the host's OpenClaw ask
   * path (for cross-runtime sub-agents on openclaw). We
   * close over `this.askOpenClaw` (the same method the
   * chain worker uses for the openclaw engine).
   *
   * **The `isOpenClawReady` closure:** the registry's
   * early-bail optimization (clean "openclaw_unavailable"
   * verdict instead of letting `askOpenClaw` throw). We
   * close over `this.isOpenClawReady` (the same method
   * the chain worker uses for the openclaw engine).
   *
   * **Why not `this._openClawState` directly:** the
   * runtime is a testable seam — the closure shape
   * `(prompt) => Promise<string>` matches the
   * `LocalRuntimeRegistry`'s DI contract. The
   * `askOpenClawViaRuntime` helper already wraps the
   * state, so the closure is the same shape.
   */
  private _envoyHarnessRuntimeCache: RealEnvoyHarnessRuntime | undefined;
  /** R2 — the cached peer execution pool (built once from config). */
  private _envoyHarnessPeerPool:
    | import("./agent-runtime-envoy/peer-pool.js").EnvoyHarnessPeerPool
    | undefined;
  /** U6 — focused chat's ACP host (EHUI + legacy single-chat paths). */
  private _envoyHarnessPersistentAcpHost: EnvoyHarnessPersistentAcpHost | undefined;
  private _envoyHarnessPersistentCwd: string | undefined;
  private _envoyHarnessPersistentConfigKey: string | undefined;

  /**
   * Phase 8 / b3.live — host's envoy-harness model + API key cache.
   *
   * The host's `ModelProviderConfig` (from `getNodeConfig()`)
   * is async to read; `isEnvoyHarnessReady` is sync. We
   * cache the resolved `<provider>:<model>` string + API
   * key in these fields, refreshed by
   * `_refreshEnvoyHarnessHostConfig()` (fire-and-forget
   * on every readiness check).
   *
   * **Why a cache, not async-everything:** the chain
   * dispatch's `isAgentNetworkEngineReady` callback is
   * sync (see `node-service-chain-orchestration.ts:1012`).
   * Making `isEnvoyHarnessReady` async would ripple
   * through 3 call sites. The cache pattern keeps the
   * sync interface; the first call returns the default
   * (env-only check), the async refresh populates the
   * cache for subsequent calls. The full check happens
   * in `askEnvoyHarness` (which is async).
   *
   * **Why two fields, not a single `{ model, apiKey }`
   * object:** the `hostApiKey` may be sensitive (it's
   * the user's Tauri-configured secret); keeping it
   * in a separate field makes the data flow obvious
   * (no struct hidden in a single cache slot).
   *
   * **Test escape hatch:** `setEnvoyHarnessHostModel(...)`
   * + `setEnvoyHarnessHostApiKey(...)` are public
   * setters for tests to pre-populate the cache
   * synchronously. The defaults are `undefined`
   * (no host model + no host API key; env-only check).
   */
  private _envoyHarnessHostModel: string | undefined = undefined;
  private _envoyHarnessHostApiKey: string | undefined = undefined;
  /** U4+ — the host's OpenAI/Anthropic-compatible endpoint (base URL). */
  private _envoyHarnessHostEndpoint: string | undefined = undefined;

  /**
   * Phase 8 / b3.live — public DI seam for tests.
   * Pre-populates the host model cache. Production code
   * never calls this; the cache is populated by
   * `_refreshEnvoyHarnessHostConfig()`.
   */
  setEnvoyHarnessHostModel(model: string | undefined): void {
    this._envoyHarnessHostModel = model;
  }

  /**
   * Phase 8 / b3.live — public DI seam for tests.
   * Pre-populates the host API key cache. Production
   * code never calls this; the cache is populated by
   * `_refreshEnvoyHarnessHostConfig()`. Used by the
   * live test to inject a `ModelProviderConfig.apiKey`
   * without needing a real `getNodeConfig()`.
   */
  setEnvoyHarnessHostApiKey(apiKey: string | undefined): void {
    this._envoyHarnessHostApiKey = apiKey;
  }

  /**
   * Phase 8 / b3.live — async refresh of the host's
   * envoy-harness model + API key. Reads `getNodeConfig()`,
   * resolves the `ModelProviderConfig` via
   * `resolveEnvoyHarnessHostConfig`, updates both caches.
   *
   * **Why fire-and-forget on every readiness check:**
   * the host's `modelProviders` is a hot-reloaded
   * setting (the user can change it from the Tauri
   * settings UI). The cache reflects the most recent
   * refresh; staleness is bounded by the call
   * frequency of `isEnvoyHarnessReady` + the
   * `getNodeConfig()` latency (typically <10ms).
   *
   * **Why not invalidate the cache on config change:**
   * `getNodeConfig` doesn't fire a "changed" event.
   * Polling on every readiness check is simpler and
   * good enough for the v0 polling frequency.
   * Future: hook into the config-change path.
   *
   * **API key source of truth:** the host's
   * `ModelProviderConfig.apiKey` is the source of
   * truth (the user enters it in the Tauri settings
   * UI). It is NOT mirrored to `process.env`; the
   * DI seam flows it through to the runtime. This
   * means the runtime uses the same key the user
   * configured, without env-var pollution.
   */
  private async _refreshEnvoyHarnessHostConfig(): Promise<
    {
      model: string | undefined;
      apiKey: string | undefined;
      endpoint: string | undefined;
    }
  > {
    try {
      const config = await this.getNodeConfig();
      const modelProviders = (config as { modelProviders?: unknown })
        ?.modelProviders as
        | import("@envoymesh/api").ModelProviderConfig
        | undefined;
      if (!modelProviders) {
        this._envoyHarnessHostModel = undefined;
        this._envoyHarnessHostApiKey = undefined;
        this._envoyHarnessHostEndpoint = undefined;
        return { model: undefined, apiKey: undefined, endpoint: undefined };
      }
      const { resolveEnvoyHarnessHostConfig } = await import(
        "./agent-runtime-envoy/index.js"
      );
      const resolved = resolveEnvoyHarnessHostConfig(modelProviders);
      // `undefined` from the helper means "not ready"
      // (unsupported mode / empty model name). In that
      // case we keep the API key empty (no point
      // caching a key for a model the runtime can't
      // use). The full readiness check happens in
      // `loadEnvoyHarnessRuntimeConfig`.
      this._envoyHarnessHostModel = resolved?.model;
      this._envoyHarnessHostApiKey = resolved?.apiKey;
      this._envoyHarnessHostEndpoint = resolved?.endpoint;
      return {
        model: this._envoyHarnessHostModel,
        apiKey: this._envoyHarnessHostApiKey,
        endpoint: this._envoyHarnessHostEndpoint,
      };
    } catch {
      // Config read failed (e.g. node-config not
      // yet loaded). Keep the cache as-is; the next
      // call will retry.
      return {
        model: this._envoyHarnessHostModel,
        apiKey: this._envoyHarnessHostApiKey,
        endpoint: this._envoyHarnessHostEndpoint,
      };
    }
  }

  private async _getOrInitEnvoyHarnessRuntime(): Promise<RealEnvoyHarnessRuntime> {
    if (this._envoyHarnessRuntimeCache) {
      return this._envoyHarnessRuntimeCache;
    }
    // R2 — build (once) the peer execution pool from the persisted config.
    await this._ensureEnvoyHarnessPeerPool();
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity?.agentPeerId || !agentIdentity.agentPrivateKeyPem) {
      // The bootstrap hasn't completed; the chain worker
      // is being invoked before the identity is ready.
      // This shouldn't happen in production (the chain
      // worker is built AFTER identity is ready), but the
      // safety net is a clean error.
      throw new Error(
        "agent identity unavailable for envoy-harness ask — " +
          "ensure the node has bootstrapped before invoking " +
          "the AN engine dispatch",
      );
    }
    // Phase 8 / b3.live — refresh the host model + API
    // key cache (sync interface, async refresh; falls
    // back to the current cache value if the refresh
    // is in flight or fails).
    await this._refreshEnvoyHarnessHostConfig();
    const config = loadEnvoyHarnessRuntimeConfig({
      hostModel: this._envoyHarnessHostModel,
      hostApiKey: this._envoyHarnessHostApiKey,
      hostEndpoint: this._envoyHarnessHostEndpoint,
    });
    // Re-check readiness in case the env changed between
    // the `isEnvoyHarnessReady` probe and this call
    // (defensive; the env doesn't usually change at
    // runtime).
    if (!config.ready) {
      throw new Error("envoy_harness_stub_phase_8_step_1");
    }
    const runtime = createRealEnvoyHarnessRuntime({
      workerPeerId: agentIdentity.agentPeerId,
      agentPrivateKeyPem: agentIdentity.agentPrivateKeyPem,
      config,
      // U4+ — the persisted project folder wins over the env default.
      cwd: await this._envoyHarnessResolvedCwd(),
      askOpenClaw: (p) => this.askOpenClaw(p),
      isOpenClawReady: () => this.isOpenClawReady(),
      // R2 — the execution pool from the persisted peer config (Pattern A).
      ...(this._envoyHarnessPeerPool !== undefined
        ? { innerSubmitter: this._envoyHarnessPeerPool.submitter }
        : {}),
      // Phase 8 / Step 3 — the 3 B-class tools
      // (sponsor_friend / list_peers / relay_status).
      // Built per-runtime (the deps are closures over
      // `this`, so each runtime gets fresh deps; the
      // runtime is cached in `_envoyHarnessRuntimeCache`
      // and rebuilt only on `isEnvoyHarnessReady` flip).
      // v0: always opt-in (production always passes
      // bClassTools). The factory's per-skill filter
      // (`getToolsForSkill`) decides which tool the
      // model sees.
      bClassTools: [
        sponsorFriendTool(createBClassSponsorFriendDeps(this)),
        listPeersTool(createBClassPeerListDeps(this)),
        buildRelayStatusTool(createBClassRelayStatusDeps(this)),
        // R3 follow-up — model-side peer-cluster discovery: when a
        // standalone peer pool is configured (Pattern A), the model can
        // read `peers` and route task.preferred_peer_id to a specific
        // peer/model. The per-skill filter exposes it under the
        // `peer-cluster` skill only.
        ...(this._envoyHarnessPeerPool !== undefined
          ? [
              createPeersTool(this._envoyHarnessPeerPool.registry),
            ]
          : []),
      ] as unknown as ReadonlyArray<import("@envoymesh/envoy-harness").Tool>,
    });
    this._envoyHarnessRuntimeCache = runtime;
    return runtime;
  }

  /**
   * Phase 8 / Step 4 — the local merged manifest for
   * this node.
   *
   * **What this returns:** a `NodeManifest` that
   * aggregates `describeSkills()` from every adapter
   * registered on this node (envoy-harness + OpenClaw),
   * tagged with the runtime that owns each skill. The
   * orchestrator's manifest picker reads this; the
   * per-adapter broadcast flow
   * (`agent-adapter-broadcast.ts`) stays unchanged.
   *
   * **Why a local view, not a wire format:** the wire
   * `CapabilityManifest` is per-runtime (one
   * `runtime: AgentRuntime` per manifest, broadcast on
   * the wire). The merged manifest is the host's
   * **local aggregate** of what those N manifests
   * would say, for the orchestrator to query without
   * iterating per-adapter.
   *
   * **Why sync:** v0 only calls `describeSkills()`
   * (sync). The orchestrator's routing decisions are
   * local lookups; sync keeps the call shape simple.
   * Future: async variant when `runtimeVersion` is
   * read from `buildManifest()` (which is async).
   *
   * **Why stubs (not real adapters):** the merged
   * manifest is for the **capability view**; we only
   * need `describeSkills()` + the runtime tag. The
   * real adapters carry runtime state (`askOpenClaw`
   * closure, `agentPeerId`, `apiKey`, etc.) that
   * the merged manifest doesn't need. Stubs throw on
   * `execute()` / `buildManifest()` to make accidental
   * side effects impossible.
   *
   * **SkillId collision policy:** the aggregator
   * throws `SkillIdCollisionError` if two runtimes
   * expose the same `skillId`. This is a bug in one of
   * the runtimes; we fail loud at the orchestrator's
   * read path, not silently.
   *
   * **Why the mesh peerId for the manifest's `peerId`:
   * the wire `CapabilityManifest.peerId` is the agent
   * peerId (the worker). For the local NodeManifest,
   * the orchestrator already knows which node it's
   * running on; the peerId is for self-description.
   * We use the mesh peerId (sync-available) as a
   * close-enough identifier. Future: read the real
   * agent peerId via async `_ensureAgentIdentity()`
   * when the aggregator becomes async.
   */
  getNodeManifest(): NodeManifest {
    const peerId = this._mesh?.peerId ?? "local-node";
    return aggregateNodeManifest({
      peerId,
      adapters: this._getNodeManifestStubs(),
    });
  }

  /**
   * Phase 8 / Step 4 — the adapter list passed to
   * `aggregateNodeManifest`. Production code returns
   * the default list (envoy-harness + OpenClaw stubs).
   * Tests inject via `setManifestStubsForTests()`.
   */
  private _manifestStubsForTests: AgentAdapter[] | undefined;

  /**
   * Phase 8 / Step 4 — public test seam. Production
   * never calls this; the default adapter list is
   * always the live catalog. Tests inject a custom
   * list to verify routing decisions without setting
   * up a real `NodeServiceImpl` runtime.
   */
  setManifestStubsForTests(stubs: AgentAdapter[] | undefined): void {
    this._manifestStubsForTests = stubs;
  }

  /**
   * Phase 8 / Step 4 — build the default adapter list
   * for the merged manifest. Stubs only; the real
   * adapters (with `askOpenClaw` / `apiKey` / `peerId`
   * state) are constructed on-demand at the
   * orchestrator's call site, not here.
   */
  private _getNodeManifestStubs(): AgentAdapter[] {
    if (this._manifestStubsForTests) {
      return this._manifestStubsForTests;
    }
    return [
      // Copy the readonly catalog to a mutable array
      // (matches what `EnvoyHarnessAdapter.describeSkills()`
      // and `OpenClawAdapter.describeSkills()` do). The
      // `AgentAdapter` interface requires `SkillDescriptor[]`
      // (mutable); the catalogs are `ReadonlyArray`.
      this._makeStubAdapter("envoy-harness", () => [...ENVOY_HARNESS_RUNTIME_SKILLS]),
      this._makeStubAdapter("openclaw", () => [...OPENCLAW_SKILLS]),
    ];
  }

  /**
   * Phase 8 / Step 4 — build a stateless `AgentAdapter`
   * stub. The aggregator only reads `runtime` and calls
   * `describeSkills()`. All other methods throw with a
   * clear error message so accidental side effects are
   * impossible to ignore.
   */
  private _makeStubAdapter(
    runtime: AgentRuntime,
    describeSkillsFn: () => SkillDescriptor[],
  ): AgentAdapter {
    return {
      runtime,
      describeSkills: describeSkillsFn,
      buildManifest: () => {
        throw new Error(
          `getNodeManifest: stub ${runtime} adapter's ` +
            `buildManifest() must not be called`,
        );
      },
      execute: () => {
        throw new Error(
          `getNodeManifest: stub ${runtime} adapter's ` +
            `execute() must not be called`,
        );
      },
      verify: () => {
        throw new Error(
          `getNodeManifest: stub ${runtime} adapter's ` +
            `verify() must not be called`,
        );
      },
    };
  }

  /** Node-owner choice: which engine runs Team-job steps on this node. */
  getAgentNetworkWorkerEngine(): AgentNetworkWorkerEngine {
    return this._agentNetworkWorkerEngine;
  }

  /** Ext Agent bridge has a URL and is enabled (sync gate for AN propose/accept). */
  isExtAgentBridgeReady(): boolean {
    if (this._bridgeEnabledCached === false) return false;
    const url = this._bridgeStatus?.agentUrl?.trim();
    return Boolean(url);
  }

  /**
   * Sync ask to the active Ext Agent for Team-job subtasks.
   * Requires a synchronous HTTP reply — async bridge replies are not accepted.
   */
  async askExtAgent(prompt: string): Promise<string> {
    const bridgeCfg = await loadBridgeConfigFromProfile(this._profileDir).catch(() => null);
    const snap = this._bridgeStatus;
    const agentUrl = (snap?.agentUrl ?? bridgeCfg?.agentUrl)?.trim();
    if (!agentUrl) {
      throw new Error("Ext Agent is not configured (no agent URL)");
    }
    if (this._bridgeEnabledCached === false || bridgeCfg?.enabled === false) {
      throw new Error("Ext Agent bridge is disabled");
    }
    const mesh = this._reachableMesh();
    const ownerId = this._profile?.owner?.ownerId ?? "";
    const reply = await forwardToAgent(
      {
        enabled: true,
        agentUrl,
        listenPort: bridgeCfg?.listenPort ?? 3031,
        agentName: snap?.agentName ?? bridgeCfg?.agentName ?? "Ext Agent",
        activeExtAgent:
          snap?.activeExtAgentId ?? bridgeCfg?.activeExtAgent ?? "pi",
        secret: bridgeCfg?.secret,
      },
      {
        senderPeerId: mesh?.peerId ?? "local-team-job",
        senderOwnerId: ownerId || "envoy:owner:local",
        senderDisplayName: "Team job",
        text: prompt,
        messageId: crypto.randomUUID(),
      },
    );
    const text = typeof reply === "string" ? reply.trim() : "";
    if (!text) {
      throw new Error(
        "Ext Agent returned no synchronous reply (Team jobs require a sync /message response)",
      );
    }
    return text;
  }

  private _refreshAgentNetworkWorkerEngineCache(cfg: {
    agentNetworkWorkerEngine?: unknown;
    bridgeEnabled?: boolean;
  }): void {
    this._agentNetworkWorkerEngine = coerceAgentNetworkWorkerEngine(
      cfg.agentNetworkWorkerEngine,
    );
    if (typeof cfg.bridgeEnabled === "boolean") {
      this._bridgeEnabledCached = cfg.bridgeEnabled;
    }
    this._agentNetworkWorkerEngineHydrated = true;
  }

  /**
   * Load AN worker engine + bridgeEnabled from disk into the sync caches.
   * Must run before the node accepts Team-job proposes (start / bindExternalMesh),
   * not only when a client later calls getNodeConfig.
   */
  async hydrateAgentNetworkWorkerEngineFromDisk(): Promise<void> {
    try {
      const persisted = await this._configStore.load();
      if (!persisted) {
        // No config yet — still mark hydrated so bindExternalMesh can go online
        // with defaults (openclaw / bridge on).
        this._agentNetworkWorkerEngineHydrated = true;
        return;
      }
      this._refreshAgentNetworkWorkerEngineCache({
        agentNetworkWorkerEngine: persisted.agentNetworkWorkerEngine,
        bridgeEnabled: persisted.bridgeEnabled,
      });
    } catch {
      this._agentNetworkWorkerEngineHydrated = true;
    }
  }

  private async _isOpenClawEnabled(): Promise<boolean> {
    return isOpenClawEnabledViaRuntime(this._openClawRuntimeDeps());
  }

  private async _ensureOpenClawReady(): Promise<boolean> {
    return ensureOpenClawReadyViaRuntime(this._openClawState, this._openClawRuntimeDeps());
  }

  /** Resolve a pending sync OpenClaw ask() by correlationId (called from bridge /bridge/send). */
  resolveOpenClawReply(correlationId: string, text: string): void {
    resolveOpenClawReplyViaRuntime(this._openClawState, correlationId, text);
  }

  /** Peek whether a pending sync OpenClaw ask() exists for a correlationId. */
  hasOpenClawPendingReply(correlationId: string): boolean {
    return hasOpenClawPendingReplyViaRuntime(this._openClawState, correlationId);
  }

  async startOpenClaw(): Promise<boolean> {
    return startOpenClawViaRuntime(this._openClawState, this._openClawRuntimeDeps());
  }

  // --- Phase 49: Pi (built-in local coding agent) ---

  private _piRuntimeDeps(): PiRuntimeDeps {
    return buildPiRuntimeDeps(this)
  }

  /** Boot hook (duck-typed from index.ts, mirrors startOpenClaw). */
  async startPi(): Promise<boolean> {
    return startPiViaRuntime(this._piState, this._piRuntimeDeps())
  }

  async stopPi(): Promise<void> {
    return stopPiViaRuntime(this._piState)
  }

  async restartPi(): Promise<PiStatus> {
    const cfg = await this._configStore.load().catch(() => undefined);
    if (resolvePiCodingBackend(cfg?.piSettings) === "envoy-harness") {
      // No Pi child to restart; refresh EH readiness.
      return this.getPiStatus();
    }
    await restartPiViaRuntime(this._piState, this._piRuntimeDeps());
    return this.getPiStatus();
  }

  async getPiStatus(): Promise<PiStatus> {
    const cfg = await this._configStore.load().catch(() => undefined);
    const codingBackend = resolvePiCodingBackend(cfg?.piSettings);
    if (codingBackend === "envoy-harness") {
      const enabled = cfg?.piEnabled !== false;
      if (!enabled) {
        return {
          enabled: false,
          state: "disabled",
          modelInherited: true,
          codingBackend,
        };
      }
      await this._refreshEnvoyHarnessHostConfig();
      const eh = loadEnvoyHarnessRuntimeConfig({
        hostModel: this._envoyHarnessHostModel,
        hostApiKey: this._envoyHarnessHostApiKey,
        hostEndpoint: this._envoyHarnessHostEndpoint,
      });
      return {
        enabled: true,
        state: eh.ready ? "ready" : "error",
        modelSpec: eh.model,
        modelInherited: true,
        error: eh.ready
          ? undefined
          : (eh.reason ?? "envoy-harness not ready"),
        codingBackend,
      };
    }
    const status = await getPiStatusViaRuntime(
      this._piState,
      this._piRuntimeDeps(),
    );
    return { ...status, codingBackend: "pi" };
  }

  /**
   * U4 — dedicated envoy-harness status for the Envoy Harness UI panel:
   * runtime readiness + model + the configured peer cluster counts.
   */
  async getEnvoyHarnessStatus(): Promise<
    import("@envoymesh/api").EnvoyHarnessStatus
  > {
    await this._refreshEnvoyHarnessHostConfig();
      const eh = loadEnvoyHarnessRuntimeConfig({
        hostModel: this._envoyHarnessHostModel,
        hostApiKey: this._envoyHarnessHostApiKey,
        hostEndpoint: this._envoyHarnessHostEndpoint,
      });
    const peers = this.listEnvoyHarnessPeers();
    const cwd = await this._envoyHarnessResolvedCwd();
    let sessionId: string | undefined;
    let messageCount: number | undefined;
    let autoRunPolicy:
      | "always-confirm"
      | "safe-only"
      | "off"
      | "never"
      | undefined;
    try {
      const cfg = await this._configStore.load().catch(() => undefined);
      autoRunPolicy =
        cfg?.envoyHarnessAutoRunPolicy ??
        "safe-only";
      const sessionStore = createEnvoyHarnessSessionStore(this._profileDir);
      const resolved = await resolveEhSessionIdForCwd({
        cwd,
        sessionByCwd: cfg?.envoyHarnessSessionByCwd,
        sessionStore,
      });
      if (resolved.sessionId !== undefined) {
        sessionId = resolved.sessionId;
        if (resolved.migratedFromDisk) {
          await this._persistEhSessionMapping(cwd, sessionId);
        }
        const history = await loadEhChatHistoryFromStore({
          sessionStore,
          sessionId,
          cwd,
        });
        messageCount = history.turns.length;
      }
    } catch {
      // Best-effort — status still useful without session metadata.
    }
    return {
      state: eh.ready ? "ready" : "error",
      ...(eh.model !== undefined ? { model: eh.model } : {}),
      cwd,
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(messageCount !== undefined ? { messageCount } : {}),
      ...(autoRunPolicy !== undefined ? { autoRunPolicy } : {}),
      ...(!eh.ready
        ? { error: eh.reason ?? "envoy-harness not ready" }
        : {}),
      peers: {
        connected: peers.length,
        failed: this._envoyHarnessPeerPool?.failed.length ?? 0,
      },
    };
  }

  /**
   * Change the Envoy Harness permission policy (Codex/Claude-style modes).
   * Rebuilds per-chat hosts on the next turn so the new policy applies.
   */
  async setEnvoyHarnessAutoRunPolicy(
    policy: string,
  ): Promise<import("@envoymesh/api").EnvoyHarnessStatus> {
    const normalized = policy.trim().toLowerCase();
    if (
      normalized !== "always-confirm" &&
      normalized !== "safe-only" &&
      normalized !== "off" &&
      normalized !== "never"
    ) {
      throw new Error(
        `invalid envoy-harness permission policy: ${policy} (use always-confirm | safe-only | off | never)`,
      );
    }
    await this.updateNodeConfig({
      envoyHarnessAutoRunPolicy: normalized,
    });
    // The change takes effect from the NEXT turn: idle per-chat hosts are
    // closed so they rebuild with the new policy, while hosts with an
    // in-flight turn are left running (the current turn keeps the policy
    // it started with). Nothing ongoing is interrupted. The runtime
    // itself does not depend on the policy — only the per-host
    // `shouldAskTool` closure does — so we never reset it here.
    this._ehChatRuntime.closeAll();
    return this.getEnvoyHarnessStatus();
  }

  /** The effective Envoy permission policy, for host staleness checks. */
  private async _envoyHarnessAutoRunPolicyKey(): Promise<string> {
    const cfg = await this._configStore.load().catch(() => undefined);
    return (
      cfg?.envoyHarnessAutoRunPolicy ??
      "safe-only"
    );
  }

  async getEnvoyHarnessChatHistory(
    chatId?: string,
  ): Promise<import("@envoymesh/api").EhChatHistory> {
    await this._refreshEnvoyHarnessHostConfig();
    const chat = await this._resolveEhChat(chatId ?? null);
    const cwd = chat?.cwd ?? (await this._envoyHarnessResolvedCwd());
    const normalized = normalizeEhWorkspaceCwd(cwd);
    const empty: import("@envoymesh/api").EhChatHistory = {
      ...(chat ? { chatId: chat.id } : {}),
      sessionId: "",
      cwd: normalized,
      turns: [],
    };
    const eh = loadEnvoyHarnessRuntimeConfig({
      hostModel: this._envoyHarnessHostModel,
      hostApiKey: this._envoyHarnessHostApiKey,
      hostEndpoint: this._envoyHarnessHostEndpoint,
    });
    if (!eh.ready) return empty;

    if (chat && chatId) {
      await this._activateEhChat(chat);
    }

    const cfg = await this._configStore.load().catch(() => undefined);
    const sessionStore = createEnvoyHarnessSessionStore(this._profileDir);
    const resolved = await resolveEhSessionIdForCwd({
      cwd,
      sessionByCwd: cfg?.envoyHarnessSessionByCwd,
      sessionStore,
    });
    if (resolved.sessionId === undefined || resolved.sessionId.length === 0) {
      return empty;
    }
    if (resolved.migratedFromDisk) {
      await this._persistEhSessionMapping(cwd, resolved.sessionId, chat?.id);
    }

    const history = await loadEhChatHistoryFromStore({
      sessionStore,
      sessionId: resolved.sessionId,
      cwd,
    });
    return { ...history, ...(chat ? { chatId: chat.id } : {}) };
  }

  async listEnvoyHarnessChats(): Promise<
    import("@envoymesh/api").EhChatWorkspaceSummary[]
  > {
    if (!(await this._callerMayUseCoding())) return [];
    const { chats, sessionByCwd } = await this._loadEhChatState();
    const sessionStore = createEnvoyHarnessSessionStore(this._profileDir);
    return summarizeEhChats({ chats, sessionStore, sessionByCwd });
  }

  async createEnvoyHarnessChat(opts: {
    cwd: string;
    title?: string;
  }): Promise<import("@envoymesh/api").EhChatWorkspaceSummary> {
    const abs = resolvePiProjectDir(opts.cwd);
    if (abs === null) {
      throw new Error(`envoy-harness project path is not a directory: ${opts.cwd}`);
    }
    const normalized = normalizeEhWorkspaceCwd(abs);
    const { chats } = await this._loadEhChatState();
    const existing = findEhChatByCwd(chats, normalized);
    if (existing) {
      await this._activateEhChat(existing);
      const listed = await this.listEnvoyHarnessChats();
      const summary = listed.find((c) => c.id === existing.id);
      if (summary) return summary;
      return {
        id: existing.id,
        cwd: existing.cwd,
        title: existing.title ?? normalized,
        lastUsedAt: existing.lastUsedAt,
      };
    }
    assertEhChatCapacity(chats);
    const now = new Date().toISOString();
    const chat: import("@envoymesh/api").EhChatWorkspace = {
      id: crypto.randomUUID(),
      cwd: normalized,
      title: opts.title?.trim() || undefined,
      createdAt: now,
      lastUsedAt: now,
    };
    const nextChats = sortEhChats([chat, ...chats]);
    await this.updateNodeConfig({
      envoyHarnessChats: nextChats,
      activeEnvoyHarnessChatId: chat.id,
      envoyHarnessCwd: normalized,
    });
    this._syncActiveEhHostAlias(undefined);
    const listed = await this.listEnvoyHarnessChats();
    const created = listed.find((c) => c.id === chat.id);
    if (!created) {
      return {
        id: chat.id,
        cwd: normalized,
        title: opts.title?.trim() || normalized,
        lastUsedAt: now,
      };
    }
    return created;
  }

  async openEnvoyHarnessChat(
    chatId: string,
  ): Promise<import("@envoymesh/api").EhChatHistory> {
    const id = chatId.trim();
    if (!id) {
      throw new Error("envoy_harness_chat_id_required");
    }
    const chat = await this._resolveEhChat(id);
    if (!chat) {
      throw new Error(`envoy_harness_chat_not_found: ${id}`);
    }
    return this.getEnvoyHarnessChatHistory(chat.id);
  }

  async removeEnvoyHarnessChat(chatId: string): Promise<{ removed: boolean }> {
    if (this._ehChatRuntime.hasTurnForChat(chatId)) {
      throw new Error("envoy_harness_turn_busy");
    }
    const { chats, activeId } = await this._loadEhChatState();
    if (!findEhChatById(chats, chatId)) {
      return { removed: false };
    }
    const nextChats = removeEhChat(chats, chatId);
    const nextActive =
      activeId === chatId ? sortEhChats(nextChats)[0]?.id : activeId;
    await this.updateNodeConfig({
      envoyHarnessChats: nextChats,
      activeEnvoyHarnessChatId: nextActive,
      ...(nextActive
        ? { envoyHarnessCwd: findEhChatById(nextChats, nextActive)?.cwd }
        : {}),
    });
    this._ehChatRuntime.removeHost(chatId);
    if (nextActive) {
      const nextChat = findEhChatById(nextChats, nextActive);
      if (nextChat) await this._activateEhChat(nextChat);
      else this._syncActiveEhHostAlias(undefined);
    } else {
      this._syncActiveEhHostAlias(undefined);
    }
    return { removed: true };
  }

  /**
   * Delete one UI turn (`eh-msg-N`) from the persisted harness session.
   * Drops the in-process ACP host so the next turn reloads from disk.
   */
  async deleteEnvoyHarnessChatTurn(opts: {
    turnId: string;
    chatId?: string;
  }): Promise<import("@envoymesh/api").EhChatHistory & { deleted: boolean }> {
    const turnId = opts.turnId.trim();
    if (!turnId) {
      throw new Error("envoy_harness_turn_id_required");
    }
    const chat = await this._resolveEhChat(opts.chatId ?? null);
    if (chat) {
      if (this._ehChatRuntime.hasTurnForChat(chat.id)) {
        throw new Error("envoy_harness_turn_busy");
      }
    } else if (this._ehChatRuntime.activeTurnCount() > 0) {
      throw new Error("envoy_harness_turn_busy");
    }
    const cwd = chat?.cwd ?? (await this._envoyHarnessResolvedCwd());
    const cfg = await this._configStore.load().catch(() => undefined);
    const sessionStore = createEnvoyHarnessSessionStore(this._profileDir);
    const resolved = await resolveEhSessionIdForCwd({
      cwd,
      sessionByCwd: cfg?.envoyHarnessSessionByCwd,
      sessionStore,
    });
    if (resolved.sessionId === undefined || resolved.sessionId.length === 0) {
      return {
        ...(chat ? { chatId: chat.id } : {}),
        sessionId: "",
        cwd: normalizeEhWorkspaceCwd(cwd),
        turns: [],
        deleted: false,
      };
    }
    const result = await deleteEhChatTurnFromStore({
      sessionStore,
      sessionId: resolved.sessionId,
      cwd,
      turnId,
    });
    // Drop live host so the next turn reloads the rewritten transcript.
    if (chat) {
      this._ehChatRuntime.removeHost(chat.id);
    } else {
      this._closeEnvoyHarnessPersistentAcpHost();
    }
    return {
      ...result.history,
      ...(chat ? { chatId: chat.id } : {}),
      deleted: result.deleted,
    };
  }

  /**
   * `/new` / `/clear` — fresh persisted session for the current chat workspace.
   */
  async resetEnvoyHarnessChat(
    chatId?: string,
  ): Promise<import("@envoymesh/api").EhChatHistory> {
    const chat = await this._resolveEhChat(chatId ?? null);
    if (chat && this._ehChatRuntime.hasTurnForChat(chat.id)) {
      throw new Error("envoy_harness_turn_busy");
    }
    const cwd = chat?.cwd ?? (await this._envoyHarnessResolvedCwd());
    const normalized = normalizeEhWorkspaceCwd(cwd);
    if (chat) {
      await this._activateEhChat(chat);
      this._ehChatRuntime.removeHost(chat.id);
    } else {
      this._closeEnvoyHarnessPersistentAcpHost();
    }
    const sessionStore = createEnvoyHarnessSessionStore(this._profileDir);
    const created = await sessionStore.create({
      cwd: normalized,
      startedAt: new Date().toISOString(),
      permissionMode: "workspace-write",
    });
    await this._persistEhSessionMapping(cwd, created.id, chat?.id);
    return {
      ...(chat ? { chatId: chat.id } : {}),
      sessionId: created.id,
      cwd: normalized,
      turns: [],
    };
  }

  private async _persistEhSessionMapping(
    cwd: string,
    sessionId: string,
    chatId?: string,
  ): Promise<void> {
    const cfg = await this._configStore.load().catch(() => undefined);
    const envoyHarnessSessionByCwd = mergeSessionMapping(
      cfg?.envoyHarnessSessionByCwd,
      cwd,
      sessionId,
    );
    let resolvedChatId = chatId;
    let envoyHarnessChats = cfg?.envoyHarnessChats;
    if (!resolvedChatId) {
      const { chats } = await this._loadEhChatState();
      resolvedChatId = findEhChatByCwd(chats, cwd)?.id;
      if (!envoyHarnessChats) envoyHarnessChats = chats;
    }
    if (resolvedChatId && envoyHarnessChats) {
      envoyHarnessChats = upsertEhChatSessionId(
        envoyHarnessChats,
        resolvedChatId,
        sessionId,
      );
    } else if (resolvedChatId) {
      const { chats } = await this._loadEhChatState();
      envoyHarnessChats = upsertEhChatSessionId(chats, resolvedChatId, sessionId);
    }
    await this.updateNodeConfig({
      envoyHarnessSessionByCwd,
      ...(envoyHarnessChats ? { envoyHarnessChats } : {}),
    });
  }

  /** The envoy-harness project folder: active chat → persisted config → env → cwd. */
  private async _envoyHarnessResolvedCwd(): Promise<string> {
    const chat = await this._resolveEhChat(undefined);
    if (chat) return chat.cwd;
    const cfg = await this._configStore.load().catch(() => undefined);
    const persisted = cfg?.envoyHarnessCwd?.trim();
    if (persisted && persisted.length > 0) return persisted;
    return process.env.ENVOY_HARNESS_CWD ?? process.cwd();
  }

  private async _loadEhChatState(): Promise<{
    chats: import("@envoymesh/api").EhChatWorkspace[];
    sessionByCwd: Record<string, string>;
    activeId: string | undefined;
  }> {
    const cfg = await this._configStore.load().catch(() => undefined);
    const chats = migrateLegacyEhChats({
      chats: cfg?.envoyHarnessChats,
      legacyCwd: cfg?.envoyHarnessCwd,
      sessionByCwd: cfg?.envoyHarnessSessionByCwd,
    });
    if (
      chats.length > 0 &&
      (cfg?.envoyHarnessChats === undefined || cfg.envoyHarnessChats.length === 0)
    ) {
      const migrated = sortEhChats(chats)[0];
      await this.updateNodeConfig({
        envoyHarnessChats: chats,
        activeEnvoyHarnessChatId: migrated?.id,
        ...(migrated ? { envoyHarnessCwd: migrated.cwd } : {}),
      });
    }

    let activeId = cfg?.activeEnvoyHarnessChatId?.trim();
    if (activeId && !findEhChatById(chats, activeId)) {
      activeId = sortEhChats(chats)[0]?.id;
      if (activeId) {
        const repaired = findEhChatById(chats, activeId);
        await this.updateNodeConfig({
          activeEnvoyHarnessChatId: activeId,
          ...(repaired ? { envoyHarnessCwd: repaired.cwd } : {}),
        });
      }
    } else if (!activeId && chats[0]) {
      activeId = chats[0].id;
    }

    return {
      chats,
      sessionByCwd: cfg?.envoyHarnessSessionByCwd ?? {},
      activeId,
    };
  }

  private async _resolveEhChat(
    chatId: string | null | undefined,
  ): Promise<import("@envoymesh/api").EhChatWorkspace | undefined> {
    const { chats, activeId } = await this._loadEhChatState();
    if (chatId) return findEhChatById(chats, chatId);
    if (activeId) {
      const active = findEhChatById(chats, activeId);
      if (active) return active;
    }
    return sortEhChats(chats)[0];
  }

  private _syncActiveEhHostAlias(
    chatId: string | undefined,
  ): void {
    if (!chatId) {
      this._envoyHarnessPersistentAcpHost = undefined;
      this._envoyHarnessPersistentCwd = undefined;
      this._envoyHarnessPersistentConfigKey = undefined;
      return;
    }
    const existing = this._ehChatRuntime.getHost(chatId);
    if (!existing) {
      this._envoyHarnessPersistentAcpHost = undefined;
      this._envoyHarnessPersistentCwd = undefined;
      this._envoyHarnessPersistentConfigKey = undefined;
      return;
    }
    this._envoyHarnessPersistentAcpHost = existing.host;
    this._envoyHarnessPersistentCwd = existing.cwd;
    this._envoyHarnessPersistentConfigKey = existing.configKey;
  }

  private async _activateEhChat(
    chat: import("@envoymesh/api").EhChatWorkspace,
  ): Promise<void> {
    const { chats } = await this._loadEhChatState();
    const nextChats = touchEhChat(chats, chat.id);
    await this.updateNodeConfig({
      activeEnvoyHarnessChatId: chat.id,
      envoyHarnessCwd: chat.cwd,
      envoyHarnessChats: nextChats,
    });
    this._syncActiveEhHostAlias(chat.id);
  }

  /**
   * U4+ — persist the envoy-harness project folder. Validates the path
   * is a directory, saves it to node config, resets the runtime cache so
   * the next ask runs in the new folder, and returns the new status.
   */
  async setEnvoyHarnessProjectPath(
    path: string,
  ): Promise<import("@envoymesh/api").EnvoyHarnessStatus> {
    const abs = resolvePiProjectDir(path);
    if (abs === null) {
      throw new Error(`envoy-harness project path is not a directory: ${path}`);
    }
    const chat = await this._resolveEhChat(undefined);
    if (chat) {
      const { chats } = await this._loadEhChatState();
      const other = findEhChatByCwd(chats, abs);
      if (other && other.id !== chat.id) {
        throw new Error(
          `envoy_harness_project_in_use: already open as "${other.title ?? abs}"`,
        );
      }
      const nextChats = updateEhChatCwd(chats, chat.id, abs);
      await this.updateNodeConfig({
        envoyHarnessCwd: abs,
        envoyHarnessChats: nextChats,
      });
    } else {
      await this.updateNodeConfig({ envoyHarnessCwd: abs });
    }
    // The runtime caches the cwd at construction; rebuild on next ask.
    this._envoyHarnessRuntimeCache = undefined;
    this._closeEnvoyHarnessPersistentAcpHost();
    return this.getEnvoyHarnessStatus();
  }

  private _closeEnvoyHarnessPersistentAcpHost(): void {
    this._envoyHarnessPersistentAcpHost?.close();
    this._envoyHarnessPersistentAcpHost = undefined;
    this._envoyHarnessPersistentCwd = undefined;
    this._envoyHarnessPersistentConfigKey = undefined;
  }

  private async _buildEnvoyHarnessAcpBackend(
    runtime: RealEnvoyHarnessRuntime,
    cwd: string,
    chatId?: string,
  ): Promise<ProtocolSessionBackend> {
    await runtime.ensureInternals();
    const cfg = await this._configStore.load().catch(() => undefined);
    // Envoy chat/terminal permission policy (Codex/Claude-style modes).
    // Default `safe-only`: read-only tools + safe bash auto-run, the
    // rest ask. `off`/`never` auto-allows everything.
    const autoRun =
      cfg?.envoyHarnessAutoRunPolicy ??
      "safe-only";
    const eh = loadEnvoyHarnessRuntimeConfig({
      hostModel: this._envoyHarnessHostModel,
      hostApiKey: this._envoyHarnessHostApiKey,
      hostEndpoint: this._envoyHarnessHostEndpoint,
    });
    const memoryStore = new LocalMemoryStore({
      memoryRoot: join(cwd, "memories"),
    });
    const sessionStore = new SessionStore({
      dir: join(this._profileDir, "envoy-harness", "sessions"),
    });
    let configLayer: ConfigLayer = {};
    try {
      configLayer = (await loadConfigStack({ cwd })).layer;
    } catch {
      configLayer = {};
    }
    const runtimeCfg = resolveAgentRuntimeConfig(cwd, configLayer);
    const skills = createSkillRegistry();
    skills.registerProvider(createFilesystemSkillProvider());
    const userQuestions = createUserQuestionService();
    userQuestions.registerProvider({
      name: "envoymesh-ui",
      ask: (req) => this._ehUserQuestionBridge.ask(req, chatId),
    });
    // Codex/Claude/DeepSeek parity: inject cwd + AGENTS.md + config
    // into the system prompt so chat asks treat the selected folder
    // as the project.
    const systemPrompt = await buildAgentSystemPrompt({
      cwd,
      ...systemPromptOptionsFromConfig(configLayer),
      permissionMode: runtimeCfg.permissionMode,
      askForApproval: runtimeCfg.askForApproval,
    });
    return createAgentSessionBackend({
      defaultCwd: cwd,
      memoryStore,
      sessionStore,
      shouldAskTool: (toolName, args) =>
        shouldAskAcpTool(toolName, autoRun, args),
      getConfig: () => ({
        version: "0.0.0",
        ...(eh.model !== undefined ? { model: eh.model } : {}),
        ...(eh.provider !== undefined ? { provider: eh.provider } : {}),
      }),
      createAgent: ({ sessionId, cwd: agentCwd, askHandler, session }) =>
        runtime.buildAgentForAcpSession({
          sessionId,
          cwd: agentCwd ?? cwd,
          askHandler,
          systemPrompt,
          permissionMode: runtimeCfg.permissionMode,
          approval: runtimeCfg.askForApproval,
          sandboxPolicy: runtimeCfg.sandboxPolicy,
          memoryStore,
          skills,
          userQuestions,
          ...(configLayer.shellEnvironmentPolicy !== undefined
            ? {
                shellEnvironmentPolicy: configLayer.shellEnvironmentPolicy,
              }
            : {}),
          ...(session !== undefined ? { session } : {}),
          shouldAskTool: (toolName, args) =>
            shouldAskAcpTool(toolName, autoRun, args),
        }),
      listPeers: () => this.listEnvoyHarnessPeers(),
      ...(this._envoyHarnessPeerPool !== undefined
        ? createPeerPoolStatusBackend(this._envoyHarnessPeerPool)
        : {}),
      teamJobs: () =>
        chainWorkerSubtasksToTeamJobs(
          this._chainOrchestrationContext().getChainSideState().workerSubtasks,
        ),
      scoreboardSummary: () => aggregateVerdicts(listAllVerdictEntries()),
    });
  }

  private async _ensureEhChatHost(
    chatId: string,
    cwd: string,
  ): Promise<{ host: EnvoyHarnessPersistentAcpHost; sessionId: string }> {
    const eh = loadEnvoyHarnessRuntimeConfig({
      hostModel: this._envoyHarnessHostModel,
      hostApiKey: this._envoyHarnessHostApiKey,
      hostEndpoint: this._envoyHarnessHostEndpoint,
    });
    const policyKey = await this._envoyHarnessAutoRunPolicyKey();
    const configKey = `${eh.model ?? ""}:${eh.apiKey ?? ""}:${eh.endpoint ?? ""}:${policyKey}`;
    const normalized = normalizeEhWorkspaceCwd(cwd);
    const existing = this._ehChatRuntime.getHost(chatId);
    if (
      existing &&
      existing.cwd === normalized &&
      existing.configKey === configKey
    ) {
      return { host: existing.host, sessionId: existing.sessionId };
    }
    if (existing && this._ehChatRuntime.hasTurnForChat(chatId)) {
      throw new Error("envoy_harness_turn_busy");
    }
    if (existing) {
      this._ehChatRuntime.removeHost(chatId);
    }

    const runtime = await this._getOrInitEnvoyHarnessRuntime();
    const backend = await this._buildEnvoyHarnessAcpBackend(
      runtime,
      normalized,
      chatId,
    );
    const cfg = await this._configStore.load().catch(() => undefined);
    const sessionStore = createEnvoyHarnessSessionStore(this._profileDir);
    const resolved = await resolveEhSessionIdForCwd({
      cwd: normalized,
      sessionByCwd: cfg?.envoyHarnessSessionByCwd,
      sessionStore,
    });
    const host = new EnvoyHarnessPersistentAcpHost();
    let started: { sessionId: string; resumed: boolean };
    try {
      started = await host.start({
        cwd: normalized,
        backend,
        permissionBridge: this._ehPermissionBridge,
        ...(resolved.sessionId !== undefined
          ? { resumeSessionId: resolved.sessionId }
          : {}),
      });
    } catch (err) {
      if (resolved.sessionId === undefined) throw err;
      await host.start({
        cwd: normalized,
        backend,
        permissionBridge: this._ehPermissionBridge,
      });
      started = { sessionId: host.sessionId!, resumed: false };
    }
    if (
      resolved.sessionId === undefined ||
      resolved.migratedFromDisk ||
      resolved.sessionId !== started.sessionId
    ) {
      await this._persistEhSessionMapping(normalized, started.sessionId, chatId);
    }
    this._ehChatRuntime.setHost(chatId, {
      host,
      cwd: normalized,
      configKey,
      sessionId: started.sessionId,
    });
    const active = await this._resolveEhChat(undefined);
    if (active?.id === chatId) {
      this._syncActiveEhHostAlias(chatId);
    }
    return { host, sessionId: started.sessionId };
  }

  private async _ensureEnvoyHarnessPersistentAcpHost(): Promise<void> {
    const activeChat = await this._resolveEhChat(undefined);
    const cwd = activeChat?.cwd ?? (await this._envoyHarnessResolvedCwd());
    if (activeChat) {
      await this._ensureEhChatHost(activeChat.id, cwd);
      return;
    }
    const eh = loadEnvoyHarnessRuntimeConfig({
      hostModel: this._envoyHarnessHostModel,
      hostApiKey: this._envoyHarnessHostApiKey,
      hostEndpoint: this._envoyHarnessHostEndpoint,
    });
    const policyKey = await this._envoyHarnessAutoRunPolicyKey();
    const configKey = `${eh.model ?? ""}:${eh.apiKey ?? ""}:${eh.endpoint ?? ""}:${policyKey}`;
    if (
      this._envoyHarnessPersistentAcpHost !== undefined &&
      this._envoyHarnessPersistentCwd === cwd &&
      this._envoyHarnessPersistentConfigKey === configKey
    ) {
      return;
    }
    this._closeEnvoyHarnessPersistentAcpHost();
    const runtime = await this._getOrInitEnvoyHarnessRuntime();
    const backend = await this._buildEnvoyHarnessAcpBackend(runtime, cwd);
    const cfg = await this._configStore.load().catch(() => undefined);
    const sessionStore = createEnvoyHarnessSessionStore(this._profileDir);
    const resolved = await resolveEhSessionIdForCwd({
      cwd,
      sessionByCwd: cfg?.envoyHarnessSessionByCwd,
      sessionStore,
    });
    const host = new EnvoyHarnessPersistentAcpHost();
    let started: { sessionId: string; resumed: boolean };
    try {
      started = await host.start({
        cwd,
        backend,
        permissionBridge: this._ehPermissionBridge,
        ...(resolved.sessionId !== undefined
          ? { resumeSessionId: resolved.sessionId }
          : {}),
      });
    } catch (err) {
      // A stale resume id (session JSONL deleted between the disk scan
      // and the load, or a corrupted file) must not brick the chat:
      // fall back to a fresh persisted session for the same project.
      if (resolved.sessionId === undefined) throw err;
      await host.start({
        cwd,
        backend,
        permissionBridge: this._ehPermissionBridge,
      });
      started = { sessionId: host.sessionId!, resumed: false };
    }
    if (
      resolved.sessionId === undefined ||
      resolved.migratedFromDisk ||
      resolved.sessionId !== started.sessionId
    ) {
      await this._persistEhSessionMapping(cwd, started.sessionId);
    }
    this._envoyHarnessPersistentAcpHost = host;
    this._envoyHarnessPersistentCwd = cwd;
    this._envoyHarnessPersistentConfigKey = configKey;
  }

  /**
   * U6 — EHUI panel data for Envoy Harness chat + terminal rails.
   * Mesh-native ops (cluster / peers / team / scoreboard) use node state;
   * session ops (plan / memory / git / sessions) use a persistent ACP child.
   */
  async invokeEnvoyHarnessEhui(
    request: import("@envoymesh/api").EhuiInvokeRequest,
  ): Promise<unknown> {
    await this._refreshEnvoyHarnessHostConfig();
    const eh = loadEnvoyHarnessRuntimeConfig({
      hostModel: this._envoyHarnessHostModel,
      hostApiKey: this._envoyHarnessHostApiKey,
      hostEndpoint: this._envoyHarnessHostEndpoint,
    });
    if (!eh.ready) {
      throw new Error(eh.reason ?? "envoy-harness not ready");
    }

    switch (request.op) {
      case "discoverySnapshot":
        return await this._envoyHarnessPeerTraceSnapshot();
      case "clusterStatus":
      case "listPeers":
      case "teamJobs":
      case "scoreboardSummary":
      case "plan":
      case "memory":
      case "gitDiff":
      case "gitStatus":
      case "listSessions":
        await this._ensureEnvoyHarnessPersistentAcpHost();
        const host = this._envoyHarnessPersistentAcpHost;
        if (host === undefined) {
          throw new Error("envoy-harness persistent ACP host failed to start");
        }
        const ds = host.getDataSource();
        if (request.op === "clusterStatus") {
          return await ds.clusterStatus();
        }
        if (request.op === "listPeers") {
          const cluster = await ds.clusterStatus();
          return cluster.peers.map((p) => ({
            id: p.id,
            ...(p.model !== undefined ? { model: p.model } : {}),
            ...(p.capabilities !== undefined
              ? { capabilities: p.capabilities }
              : {}),
            health: p.health,
          }));
        }
        if (request.op === "teamJobs") {
          return await ds.teamJobs();
        }
        if (request.op === "scoreboardSummary") {
          return await ds.scoreboardSummary();
        }
        if (request.op === "plan") {
          return await ds.plan(request.action, {
            ...(request.text !== undefined ? { text: request.text } : {}),
            ...(request.reason !== undefined ? { reason: request.reason } : {}),
          });
        }
        if (request.op === "memory") {
          return await ds.memory(request.memoryOp, {
            ...(request.name !== undefined ? { name: request.name } : {}),
            ...(request.body !== undefined ? { body: request.body } : {}),
          });
        }
        if (request.op === "gitDiff") {
          return await ds.gitDiff({
            ...(request.staged !== undefined ? { staged: request.staged } : {}),
            ...(request.stat !== undefined ? { stat: request.stat } : {}),
          });
        }
        if (request.op === "gitStatus") {
          return await ds.gitStatus();
        }
        return await ds.listSessions();
      default:
        throw new Error(`invalid EhuiInvokeRequest: unknown op ${(request as { op: string }).op}`);
    }
  }

  /** Peer-pool health rows for the EHUI Trace panel. */
  private async _envoyHarnessPeerTraceSnapshot(): Promise<
    import("@envoymesh/envoy-harness-client").ClientDiscoveryEvent[]
  > {
    await this._ensureEnvoyHarnessPeerPool();
    if (this._envoyHarnessPeerPool === undefined) {
      return [];
    }
    const backend = createPeerPoolStatusBackend(this._envoyHarnessPeerPool);
    const status = await backend.clusterStatus!();
    return status.peers.map((p) => ({
      type: p.health.ok ? ("peer.health" as const) : ("peer.failed" as const),
      peerId: p.id,
      ...(p.model !== undefined ? { model: p.model } : {}),
      ...(p.health.rttMs !== undefined ? { rttMs: p.health.rttMs } : {}),
      ...(p.health.error !== undefined ? { error: p.health.error } : {}),
      at: p.health.lastPingAt ?? new Date().toISOString(),
    }));
  }

  /** MAP — local Pi runtime readiness for the second-doctor cross-check. */
  isPiReady(): boolean {
    return isPiReadyViaRuntime(this._piState)
  }

  /** MAP — ask the local Pi runtime (second-doctor / cross-check run). */
  askPi(prompt: string): Promise<PiPromptResult> {
    return askPiViaRuntime(this._piState, this._piRuntimeDeps(), prompt)
  }

  // --- Phase 54: Envoy Local ---

  private _envoyLocalRuntimeDeps(): EnvoyLocalRuntimeDeps {
    return {
      getProfileDir: () => this._profileDir,
      loadEnvoyLocalConfig: async () => {
        const cfg = await this._configStore.load();
        return cfg?.envoyLocal;
      },
      saveEnvoyLocalConfig: async (patch) => {
        const existing = await this._configStore.load();
        const prev = existing?.envoyLocal ?? {};
        await this.updateNodeConfig({
          envoyLocal: { ...prev, ...patch },
        });
      },
      wireModelProviders: async (_endpoint, _modelName) => {
        // Envoy Local no longer overwrites Settings → AI modelProviders.
        // Cloud/Ollama stay persisted and win at inference time; Local is
        // only selected via resolveEffectiveModelProviders when no usable
        // cloud/Ollama provider is configured.
      },
      reloadOpenClaw: async () => {
        await this.reloadOpenClawConfig();
      },
      loadModelProviders: async () => {
        const cfg = await this._configStore.load();
        return cfg?.modelProviders;
      },
      clearEnvoyLocalModelProviders: async () => {
        const cfg = await this._configStore.load();
        const mp = cfg?.modelProviders;
        if (!mp) return;
        // Only clear a leftover envoy-local preset from older builds that
        // used to overwrite cloud settings.
        if (inferModelProviderPreset(mp).id !== "envoy-local") return;
        const fallback = cfg?.envoyLocal?.fallbackModelProviders;
        if (fallback && hasUsableNonEnvoyLocalModelProvider(fallback)) {
          await this.updateNodeConfig({ modelProviders: fallback });
          return;
        }
        await this.updateNodeConfig({
          modelProviders: { mode: "disabled", presetId: "disabled" },
        });
      },
      restoreFallbackModelProviders: async () => {
        const cfg = await this._configStore.load();
        const fallback = cfg?.envoyLocal?.fallbackModelProviders;
        if (!fallback || !hasUsableNonEnvoyLocalModelProvider(fallback)) return;
        await this.updateNodeConfig({
          modelProviders: fallback,
        });
      },
    };
  }

  /**
   * Cloud/Ollama from Settings when configured; otherwise Envoy Local when
   * the sidecar is enabled and ready — without mutating persisted
   * modelProviders. Cloud always wins over Local.
   */
  async getEffectiveModelProviders(): Promise<
    import("@envoymesh/api").ModelProviderConfig
  > {
    const cfg = await this._configStore.load();
    const st = await getEnvoyLocalStatusViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
    );
    return (
      resolveEffectiveModelProviders(cfg?.modelProviders, {
        preferLocal: Boolean(st.enabled && st.running),
        endpoint: st.endpoint,
        modelName: st.activeModelId,
      }) ??
      cfg?.modelProviders ?? { mode: "disabled", presetId: "disabled" }
    );
  }

  async getEnvoyLocalStatus() {
    return getEnvoyLocalStatusViaRuntime(this._envoyLocalState, this._envoyLocalRuntimeDeps());
  }

  async enableEnvoyLocal(params?: import("@envoymesh/api").EnableEnvoyLocalParams) {
    return enableEnvoyLocalViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
      params,
    );
  }

  async declineEnvoyLocalAutoProvision() {
    return declineEnvoyLocalAutoProvisionViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
    );
  }

  async disableEnvoyLocal() {
    return disableEnvoyLocalViaRuntime(this._envoyLocalState, this._envoyLocalRuntimeDeps());
  }

  async startEnvoyLocal() {
    return startEnvoyLocalViaRuntime(this._envoyLocalState, this._envoyLocalRuntimeDeps());
  }

  async stopEnvoyLocal() {
    return stopEnvoyLocalViaRuntime(this._envoyLocalState, this._envoyLocalRuntimeDeps());
  }

  async restartEnvoyLocal() {
    return restartEnvoyLocalViaRuntime(this._envoyLocalState, this._envoyLocalRuntimeDeps());
  }

  async cancelEnvoyLocalDownload() {
    return cancelEnvoyLocalDownloadViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
    );
  }

  async listEnvoyLocalInstalledModels() {
    return listEnvoyLocalInstalledModelsViaRuntime(this._envoyLocalRuntimeDeps());
  }

  async searchEnvoyLocalModels(
    params?: import("@envoymesh/api").SearchEnvoyLocalModelsParams,
  ) {
    return searchEnvoyLocalModelsViaRuntime(
      params?.query,
      this._envoyLocalRuntimeDeps(),
    );
  }

  async downloadEnvoyLocalModel(
    params: import("@envoymesh/api").DownloadEnvoyLocalModelParams,
  ) {
    return downloadEnvoyLocalModelViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
      params,
    );
  }

  async setEnvoyLocalDownloadRegion(
    params: import("@envoymesh/api").SetEnvoyLocalDownloadRegionParams,
  ) {
    return setEnvoyLocalDownloadRegionViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
      params,
    );
  }

  async setEnvoyLocalActiveModel(
    params: import("@envoymesh/api").SetEnvoyLocalActiveModelParams,
  ) {
    return setEnvoyLocalActiveModelViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
      params.modelId,
    );
  }

  async deleteEnvoyLocalModel(
    params: import("@envoymesh/api").DeleteEnvoyLocalModelParams,
  ) {
    return deleteEnvoyLocalModelViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
      params.modelId,
    );
  }

  async updateEnvoyLocalServerParams(
    params: import("@envoymesh/api").UpdateEnvoyLocalServerParamsParams,
  ) {
    return updateEnvoyLocalServerParamsViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
      params.serverParams,
    );
  }

  async resetEnvoyLocalServerParams() {
    return resetEnvoyLocalServerParamsViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
    );
  }

  async checkEnvoyLocalEngineUpdate() {
    return checkEnvoyLocalEngineUpdateViaRuntime(this._envoyLocalRuntimeDeps());
  }

  async updateEnvoyLocalEngine() {
    // Chat + embed share the same llama-server binary; stop embed before force reinstall.
    await haltEnvoyLocalEmbedChildViaRuntime(this._envoyLocalEmbedState);
    return updateEnvoyLocalEngineViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
    );
  }

  /** Boot hook (duck-typed from index.ts). */
  async maybeStartEnvoyLocalOnBoot(): Promise<void> {
    await maybeStartEnvoyLocalOnBootViaRuntime(
      this._envoyLocalState,
      this._envoyLocalRuntimeDeps(),
    );
  }

  /** Process shutdown — always kill the sidecar child. */
  async haltEnvoyLocalChild(): Promise<void> {
    await haltEnvoyLocalChildViaRuntime(this._envoyLocalState);
  }

  // --- Phase 57E: Envoy Local embed sidecar ---

  private _envoyLocalEmbedRuntimeDeps(): EnvoyLocalEmbedRuntimeDeps {
    return {
      getProfileDir: () => this._profileDir,
      loadEnvoyLocalEmbedConfig: async () => {
        const cfg = await this._configStore.load();
        return cfg?.envoyLocalEmbed;
      },
      saveEnvoyLocalEmbedConfig: async (patch) => {
        const existing = await this._configStore.load();
        const prev = existing?.envoyLocalEmbed ?? {};
        await this.updateNodeConfig({
          envoyLocalEmbed: { ...prev, ...patch },
        });
      },
      loadDownloadRegionPreference: async () => {
        const cfg = await this._configStore.load();
        return cfg?.envoyLocal?.downloadRegion;
      },
      shouldAutoProvisionEmbed: async () => {
        await this._ensureEmbeddingSettingsMigrated();
        const cfg = await this._configStore.load();
        const mode = cfg?.aiSettings?.knowledgeBase?.embedding?.mode;
        // Default / unset / legacy inherit → Envoy Local embed.
        return (
          mode == null ||
          mode === "envoy-local" ||
          (mode as string) === "inherit"
        );
      },
      preferredEmbedModelId: async () => {
        await this._ensureEmbeddingSettingsMigrated();
        const cfg = await this._configStore.load();
        return cfg?.aiSettings?.knowledgeBase?.embedding?.modelName;
      },
      isEmbedBusy: () => this._envoyLocalEmbedIdleHold > 0,
      onEmbedReady: async () => {
        // Boot refreshRagService often races ahead of :18791 (especially first
        // DMG/EXE download). Reindex once the sidecar answers /v1/models.
        try {
          await this.reindexRagKnowledge({ force: false });
        } catch (err) {
          console.warn(
            "[rag] reindex after embed ready failed:",
            err instanceof Error ? err.message : String(err),
          );
          throw err;
        } finally {
          this.embedBootRagReindexCompleted = true;
          noteEnvoyLocalEmbedActivity(
            this._envoyLocalEmbedState,
            this._envoyLocalEmbedRuntimeDeps(),
          );
        }
      },
    };
  }

  private async _envoyLocalEmbedOverlay(): Promise<{
    endpoint?: string;
    modelName?: string;
    running?: boolean;
  } | null> {
    try {
      const st = await getEnvoyLocalEmbedStatusViaRuntime(
        this._envoyLocalEmbedState,
        this._envoyLocalEmbedRuntimeDeps(),
      );
      return {
        endpoint: st.endpoint,
        modelName: st.activeModelId,
        running: st.running,
      };
    } catch {
      return null;
    }
  }

  private _embeddingMigrated = false;

  private async _ensureEmbeddingSettingsMigrated(): Promise<void> {
    if (this._embeddingMigrated) return;
    const cfg = await this._configStore.load();
    if (!cfg) {
      this._embeddingMigrated = true;
      return;
    }
    const emb = cfg.aiSettings?.knowledgeBase?.embedding;
    if (emb?.mode && emb.mode !== "inherit") {
      this._embeddingMigrated = true;
      return;
    }
    const migrated = migrateEmbeddingSettings(emb, cfg.modelProviders);
    if (!cfg.aiSettings) {
      this._embeddingMigrated = true;
      return;
    }
    await this._configStore.save({
      ...cfg,
      aiSettings: {
        ...cfg.aiSettings,
        knowledgeBase: {
          ...(cfg.aiSettings.knowledgeBase ?? {}),
          embedding: migrated,
        },
      },
    });
    this._embeddingMigrated = true;
  }

  async getEnvoyLocalEmbedStatus() {
    return getEnvoyLocalEmbedStatusViaRuntime(
      this._envoyLocalEmbedState,
      this._envoyLocalEmbedRuntimeDeps(),
    );
  }

  async enableEnvoyLocalEmbed(params?: import("@envoymesh/api").EnableEnvoyLocalEmbedParams) {
    return enableEnvoyLocalEmbedViaRuntime(
      this._envoyLocalEmbedState,
      this._envoyLocalEmbedRuntimeDeps(),
      params,
    );
  }

  async stopEnvoyLocalEmbed() {
    return stopEnvoyLocalEmbedViaRuntime(
      this._envoyLocalEmbedState,
      this._envoyLocalEmbedRuntimeDeps(),
    );
  }

  async disableEnvoyLocalEmbed() {
    return disableEnvoyLocalEmbedViaRuntime(
      this._envoyLocalEmbedState,
      this._envoyLocalEmbedRuntimeDeps(),
    );
  }

  async listEnvoyLocalInstalledEmbedModels() {
    return listEnvoyLocalInstalledEmbedModelsViaRuntime(
      this._envoyLocalEmbedRuntimeDeps(),
    );
  }

  async setEnvoyLocalEmbedActiveModel(
    params: import("@envoymesh/api").SetEnvoyLocalEmbedActiveModelParams,
  ) {
    const modelId = params.modelId?.trim() ?? "";
    const status = await setEnvoyLocalEmbedActiveModelViaRuntime(
      this._envoyLocalEmbedState,
      this._envoyLocalEmbedRuntimeDeps(),
      { modelId },
    );
    // Keep Knowledge Setup embedding.modelName aligned when using Envoy Local.
    try {
      await this._ensureEmbeddingSettingsMigrated();
      const cfg = await this._configStore.load();
      const kb = cfg?.aiSettings?.knowledgeBase;
      const emb = kb?.embedding;
      const mode = emb?.mode;
      if (
        mode == null ||
        mode === "envoy-local" ||
        (mode as string) === "inherit"
      ) {
        const activeId = status.activeModelId ?? modelId;
        const prevAi = normalizeAiSettings(cfg?.aiSettings);
        const prevKb = prevAi.knowledgeBase ?? {};
        const prevEmb = prevKb.embedding ?? emb;
        const nextAi: import("@envoymesh/api").AiSettings = {
          ...prevAi,
          status: prevAi.status,
          identity: prevAi.identity,
          knowledgeBase: {
            ...prevKb,
            embedding: {
              ...prevEmb,
              mode: "envoy-local",
              modelName: activeId,
              endpoint: prevEmb?.endpoint ?? status.endpoint,
              responseShape: prevEmb?.responseShape ?? "openai",
            },
          },
        };
        await this.updateNodeConfig({ aiSettings: nextAi });
      }
    } catch (err) {
      console.warn(
        "[envoy-local-embed] sync knowledge embedding.modelName failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
    return status;
  }

  async maybeStartEnvoyLocalEmbedOnBoot(): Promise<void> {
    await maybeStartEnvoyLocalEmbedOnBootViaRuntime(
      this._envoyLocalEmbedState,
      this._envoyLocalEmbedRuntimeDeps(),
    );
  }

  async haltEnvoyLocalEmbedChild(): Promise<void> {
    await haltEnvoyLocalEmbedChildViaRuntime(this._envoyLocalEmbedState);
  }

  /** One-shot prompt — used by the sendToPi JSON-RPC method. */
  async sendToPi(text: string): Promise<string> {
    return this._sendToPiInternal(text, { emitPushHint: true })
  }

  /**
   * Ext Agent adapter path (active Ext Agent = Pi). Bridge already emits
   * `chat:message` with the bridge agent peer id after the sidecar replies —
   * do NOT emit a parallel `push:message` with synthetic `envoy:pi` (that
   * created a fake Contacts thread on EnvoyGo and a wrong push deep-link).
   *
   * Uses askPiForExtAgentViaRuntime so tool approvals are auto-denied during
   * Ext Agent turns (otherwise Pi can hang waiting for a UI confirm that never
   * appears in the Ext Agent thread).
   */
  async sendToPiForExtAgent(text: string): Promise<string> {
    return askPiForExtAgentViaRuntime(this._piState, this._piRuntimeDeps(), text)
  }

  private async _sendToPiInternal(
    text: string,
    opts: { emitPushHint: boolean },
  ): Promise<string> {
    const cfg = await this._configStore.load().catch(() => undefined);
    if (resolvePiCodingBackend(cfg?.piSettings) === "envoy-harness") {
      const answer = await this.askEnvoyHarness(text);
      if (opts.emitPushHint && answer) {
        const bridgePeer = this._bridgeStatus?.agentPeerId?.trim();
        const bridgeName = this._bridgeStatus?.agentName?.trim();
        this.emit("push:message", {
          messageId: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          sender: {
            nodeId: bridgePeer || "pi",
            displayName: bridgeName || "Pi",
            ownerId: bridgePeer || "envoy:pi",
            actorRole: "agent" as const,
          },
          recipient: {
            nodeId: this._mesh?.peerId ?? "",
            ownerId: this._profile?.owner?.ownerId ?? "",
          },
          content: { text: answer },
          metadata: {
            timestamp: new Date().toISOString(),
            deliveryReceipt: "delivered" as const,
            deliveryChannel: "agent" as const,
            deliverySource: "bridge" as const,
          },
        } as ChatMessage);
      }
      return answer;
    }

    const result = await askPiViaRuntime(this._piState, this._piRuntimeDeps(), text)
    // Direct sendToPi RPC only: wake backgrounded devices. Ext Agent replies
    // are notified via the normal bridge `chat:message` → push listener.
    if (opts.emitPushHint && result.text) {
      const bridgePeer = this._bridgeStatus?.agentPeerId?.trim()
      const bridgeName = this._bridgeStatus?.agentName?.trim()
      this.emit("push:message", {
        messageId: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sender: {
          nodeId: bridgePeer || "pi",
          displayName: bridgeName || "Pi",
          // Prefer bridge agent peer so clients route to Ext Agent, not Contacts.
          ownerId: bridgePeer || "envoy:pi",
          actorRole: "agent" as const,
        },
        recipient: {
          nodeId: this._mesh?.peerId ?? "",
          ownerId: this._profile?.owner?.ownerId ?? "",
        },
        content: { text: result.text },
        metadata: {
          timestamp: new Date().toISOString(),
          deliveryReceipt: "delivered" as const,
          deliveryChannel: "agent" as const,
          deliverySource: "bridge" as const,
        },
      } as ChatMessage)
    }
    return result.text
  }

  /**
   * Dynamic AI bot — send a message to a character bot.
   * Looks up the bot definition from config.aiBots, prepends the bot's
   * systemPrompt to the user's text, calls the native LLM router, and
   * persists + emits the exchange under thread key `bot:<id>`.
   */
  /** Resolve the caller's family profile id (defaults to owner). */
  private _callerFamilyProfileId(): string {
    const fromSession = getRpcCaller()?.profileId?.trim();
    return fromSession || OWNER_FAMILY_PROFILE_ID;
  }

  /**
   * Owner-controlled Ext Agent chat gate (Phase 51 follow-up).
   * Owner always allowed; non-owner profiles require explicit
   * `extAgentEnabled: true` (default / omitted = off).
   */
  private async _callerMayUseExtAgent(): Promise<boolean> {
    const caller = getRpcCaller();
    if (caller?.isOwnerProfile) return true;
    const profileId = this._callerFamilyProfileId();
    return this.mayFamilyProfileUseExtAgent(
      profileId,
      profileId === OWNER_FAMILY_PROFILE_ID,
    );
  }

  /**
   * Profile-scoped Ext Agent allow check (no RPC ALS required).
   * Used by {@link getBridgeStatus} / send gates and by WS `bridge:status`
   * fan-out so denied family sessions never see `enabled: true`.
   */
  async mayFamilyProfileUseExtAgent(
    profileId: string,
    isOwnerProfile: boolean,
  ): Promise<boolean> {
    if (isOwnerProfile || profileId === OWNER_FAMILY_PROFILE_ID) return true;
    if (!this._familyProfileStore) return false;
    const record = await this._familyProfileStore.get(profileId);
    return familyProfileMayUseExtAgent(
      record ? toFamilyProfile(record) : { id: profileId, isOwner: false },
    );
  }

  /**
   * Owner-controlled Coding assistants gate (Pi + Envoy Harness chat).
   * Owner always allowed; non-owner profiles require explicit
   * `codingEnabled: true` (default / omitted = off).
   */
  async mayCallerUseCoding(): Promise<boolean> {
    return this._callerMayUseCoding();
  }

  private async _callerMayUseCoding(): Promise<boolean> {
    const caller = getRpcCaller();
    if (caller?.isOwnerProfile) return true;
    const profileId = this._callerFamilyProfileId();
    return this.mayFamilyProfileUseCoding(
      profileId,
      profileId === OWNER_FAMILY_PROFILE_ID,
    );
  }

  async mayFamilyProfileUseCoding(
    profileId: string,
    isOwnerProfile: boolean,
  ): Promise<boolean> {
    if (isOwnerProfile || profileId === OWNER_FAMILY_PROFILE_ID) return true;
    if (!this._familyProfileStore) return false;
    const record = await this._familyProfileStore.get(profileId);
    return familyProfileMayUseCoding(
      record ? toFamilyProfile(record) : { id: profileId, isOwner: false },
    );
  }

  private _codingDeniedError(): Error {
    return new Error(
      "Coding assistants are disabled for this family profile. Ask the home-node owner to enable them in Settings → Family.",
    );
  }

  /**
   * Session key used by Ext Agent `ask()` / bridge `fromOwnerId`.
   * Must stay in sync with {@link sendToBridge}'s `humanSenderOwnerId`.
   */
  private _bridgeAskSessionKey(): string {
    const ownerId = this._profile?.owner?.ownerId?.trim() ?? "";
    const profileId = this._callerFamilyProfileId();
    const isOwnerCaller =
      getRpcCaller()?.isOwnerProfile ?? profileId === OWNER_FAMILY_PROFILE_ID;
    return (isOwnerCaller ? ownerId : profileId).trim();
  }

  /**
   * Whether `/model` session override is honored for this agent right now.
   * OpenHuman only supports it on the OpenAI-compatible `/v1` transport.
   */
  private _extAgentSupportsSessionModel(agentId: string): boolean {
    if (!supportsExtAgentSessionModel(agentId)) return false;
    if (agentId === "openhuman") return openHumanTransport() === "v1";
    return true;
  }

  /** Display name for the current RPC caller (family profile or owner HumanProfile). */
  private async _callerFamilyDisplayName(): Promise<string> {
    const profileId = this._callerFamilyProfileId();
    try {
      const fp = await this._familyProfileStore?.get(profileId);
      if (fp?.name?.trim()) return fp.name.trim();
    } catch {
      /* fall through */
    }
    const caller = getRpcCaller();
    if (!caller || caller.isOwnerProfile || profileId === OWNER_FAMILY_PROFILE_ID) {
      try {
        const human = await this._humanProfileStore.loadHumanProfile();
        if (human?.displayName?.trim()) return human.displayName.trim();
      } catch {
        /* fall through */
      }
      return this._profile?.owner?.ownerId ?? profileId;
    }
    return profileId;
  }

  private _notePendingBridgeReply(profileId: string): void {
    this._pendingBridgeReplyProfiles.push(profileId.trim() || OWNER_FAMILY_PROFILE_ID);
    if (this._pendingBridgeReplyProfiles.length > 64) {
      this._pendingBridgeReplyProfiles.shift();
    }
  }

  private _consumePendingBridgeReplyProfile(): string {
    return this._pendingBridgeReplyProfiles.shift() ?? OWNER_FAMILY_PROFILE_ID;
  }

  private _recordBridgeReplyForProfile(
    profileId: string,
    bridgeAgentPeerId: string,
    text: string,
  ): void {
    const threadKey = bridgeThreadKeyForProfile(bridgeAgentPeerId, profileId);
    const meshPeerId = this._mesh?.peerId ?? "";
    const homeOwnerId = this._profile?.owner?.ownerId ?? "";
    const isOwner = profileId === OWNER_FAMILY_PROFILE_ID;
    const replyMsg: ChatMessage = {
      messageId: crypto.randomUUID(),
      sender: {
        nodeId: bridgeAgentPeerId,
        // agentPeerId — matches Social Ext Agent row selection (see handleBridgeSelfReply).
        ownerId: bridgeAgentPeerId,
        displayName: this._bridgeStatus?.agentName ?? "Ext Agent",
        actorRole: "agent",
      },
      recipient: {
        nodeId: meshPeerId,
        ownerId: isOwner ? homeOwnerId : profileId,
      },
      content: { text },
      metadata: {
        timestamp: new Date().toISOString(),
        deliveryReceipt: "delivered",
        deliveryChannel: "agent",
        deliverySource: "bridge",
      },
      signature: "",
    };
    this._persistChatMessage(threadKey, replyMsg);
    this.emit("chat:message", replyMsg);
  }

  /**
   * Phase 51 — Ext Agent async self-send reply. Routes into the profile
   * that most recently called `sendToBridge` (FIFO), defaulting to owner.
   *
   * Persist under `bridge:<agentId>:<profileId>` (profile-scoped history).
   * Emit with `sender.ownerId = agentId` so desktop Social — which selects the
   * Ext Agent row by `bridgeStatus.agentPeerId` — actually shows the reply.
   * (Using the bridge: thread key as sender.ownerId parked replies in a
   * thread the UI never opens.)
   */
  handleBridgeSelfReply(chatMsg: ChatMessage): void {
    const profileId = this._consumePendingBridgeReplyProfile();
    const agentId =
      this._bridgeStatus?.agentPeerId?.trim() ||
      chatMsg.sender?.ownerId?.trim() ||
      "";
    if (!agentId) {
      this.emit("chat:message", chatMsg);
      return;
    }
    const threadKey = bridgeThreadKeyForProfile(agentId, profileId);
    const homeOwnerId = this._profile?.owner?.ownerId ?? "";
    const isOwner = profileId === OWNER_FAMILY_PROFILE_ID;
    const forUi: ChatMessage = {
      ...chatMsg,
      sender: {
        ...chatMsg.sender,
        ownerId: agentId,
        displayName:
          this._bridgeStatus?.agentName?.trim() ||
          chatMsg.sender.displayName ||
          "Ext Agent",
      },
      recipient: {
        ...chatMsg.recipient,
        ownerId: isOwner ? homeOwnerId || chatMsg.recipient.ownerId : profileId,
      },
    };
    this._persistChatMessage(threadKey, forUi);
    this.emit("chat:message", forUi);
  }

  async sendToAiBot(botId: string, text: string): Promise<void> {
    const trimmedBotId = botId.trim()
    const trimmedText = text.trim()
    if (!trimmedBotId || !trimmedText) return

    const profileId = this._callerFamilyProfileId()
    await this._ensureFamilyOwnerMigrated()

    // Prefer per-profile bots; fall back to node-config.aiBots (owner migration).
    let bot: import("@envoymesh/api").AiBotDefinition | undefined
    if (this._familyProfileStore) {
      const profile = await this._familyProfileStore.get(profileId)
      const fromProfile = profile?.aiBots
      if (Array.isArray(fromProfile)) {
        bot = (fromProfile as import("@envoymesh/api").AiBotDefinition[]).find(
          (b) => b.id === trimmedBotId && b.enabled !== false,
        )
      }
    }
    if (!bot) {
      const cfg = await this._configStore.load()
      bot = cfg?.aiBots?.find((b) => b.id === trimmedBotId && b.enabled !== false)
    }
    if (!bot) {
      throw new Error(`Bot "${trimmedBotId}" not found or disabled`)
    }

    const cfg = await this._configStore.load()
    const threadKey = aiBotThreadKeyForProfile(trimmedBotId, profileId)
    const now = new Date().toISOString()
    const homeOwnerId = this._profile?.owner?.ownerId ?? ""
    const meshPeerId = this._mesh?.peerId ?? ""
    const messageId = crypto.randomUUID()

    // 1. Persist + emit the user's outbound message.
    const outboundMsg: ChatMessage = {
      messageId,
      sender: {
        nodeId: meshPeerId,
        ownerId: homeOwnerId,
        displayName: homeOwnerId,
        actorRole: "human",
      },
      recipient: {
        nodeId: meshPeerId,
        ownerId: threadKey,
        displayName: bot.name,
      },
      content: { text: trimmedText },
      metadata: {
        timestamp: now,
        deliveryReceipt: "delivered",
        deliveryChannel: "ai",
      },
      signature: "",
    }
    this._persistChatMessage(threadKey, outboundMsg)
    this.emit("chat:message", outboundMsg)

    // 2. Build the LLM prompt: character framing + history + user text.
    // Fetch recent history (last 20 turns) so the bot has memory.
    const MAX_HISTORY_TURNS = 20
    let conversationHistory = ""
    if (this._chatLogStore) {
      try {
        const history = await this._chatLogStore.listThread(threadKey, MAX_HISTORY_TURNS)
        // Exclude the message we just persisted (it's the current user turn).
        const priorHistory = history.filter((h) => h.messageId !== messageId)
        if (priorHistory.length > 0) {
          conversationHistory = priorHistory
            .map((h) => {
              const isUser = h.sender?.ownerId === homeOwnerId
              const speaker = isUser ? "Human" : bot!.name
              const text = h.content?.text ?? ""
              return `${speaker}: ${text}`
            })
            .join("\n\n")
          // Cap at 8000 chars to avoid exceeding the model's context window
          // (48K hard cap in the semantic firewall, but we want room for
          // the system prompt + current message + response).
          if (conversationHistory.length > 8000) {
            // Prefer cutting on a turn boundary so we don't orphan a half-line.
            const sliced = conversationHistory.slice(-8000)
            const boundary = sliced.indexOf("\n\n")
            conversationHistory =
              boundary >= 0 && boundary < sliced.length - 1
                ? sliced.slice(boundary + 2)
                : sliced
          }
        }
      } catch {
        // History read failed — proceed without memory.
      }
    }

    const prompt = buildAiBotPrompt({
      botName: bot.name,
      systemPrompt: bot.systemPrompt,
      conversationHistory: conversationHistory || undefined,
      userText: trimmedText,
    })

    try {
      // 3. Call the native LLM router (in-process, no gateway needed).
      const providers = buildModelProviders(
        await this.getEffectiveModelProviders(),
        true,
      )
      const result = await routeModelRequest(
        {
          taskType: bot.taskType ?? "ai_bot.chat",
          prompt,
          sensitivity: "public",
          ownerApproved: true,
          requesterPeerId: meshPeerId,
        },
        providers,
      )

      let answer = result.response?.text?.trim() ?? "(no response)"
      // Strip a leading "Luna:" / speaker label if the model echoed it.
      const labelPrefix = new RegExp(`^${bot.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i")
      answer = answer.replace(labelPrefix, "").trim() || answer

      // 4. Persist + emit the bot's reply.
      const aiTimestamp = new Date(Date.now() + 1).toISOString()
      const replyMsg: ChatMessage = {
        messageId: crypto.randomUUID(),
        sender: {
          nodeId: threadKey,
          ownerId: threadKey,
          displayName: bot.name,
          actorRole: "agent",
        },
        recipient: {
          nodeId: meshPeerId,
          ownerId: homeOwnerId,
        },
        content: { text: answer },
        metadata: {
          timestamp: aiTimestamp,
          deliveryReceipt: "delivered",
          deliveryChannel: "ai",
        },
        signature: "",
      }
      this._persistChatMessage(threadKey, replyMsg)
      this.emit("chat:message", replyMsg)
      // Push is handled by the unified chat:message → maybePushChat listener.
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.warn(`[ai-bot:${trimmedBotId}] LLM call failed:`, errMsg)
      // Emit an error reply so the user sees something.
      const errorMsg: ChatMessage = {
        messageId: crypto.randomUUID(),
        sender: {
          nodeId: threadKey,
          ownerId: threadKey,
          displayName: bot.name,
          actorRole: "agent",
        },
        recipient: { nodeId: meshPeerId, ownerId: homeOwnerId },
        content: { text: `(Error: ${errMsg})` },
        metadata: {
          timestamp: new Date(Date.now() + 1).toISOString(),
          deliveryReceipt: "delivered",
          deliveryChannel: "ai",
        },
        signature: "",
      }
      this._persistChatMessage(threadKey, errorMsg)
      this.emit("chat:message", errorMsg)
    }
  }

  /**
   * Pi interactive TUI for an explicitly chosen project folder.
   * Separate from the RPC PiRuntime used by Ext Agent chat (lazy-started).
   * Does not auto-start — callers must pass `projectPath`.
   */
  async ensurePiTerminalSession(
    params?: import("@envoymesh/api").EnsurePiTerminalParams,
  ): Promise<import("@envoymesh/api").EnsurePiTerminalResult> {
    const manager = this._terminalManager
    if (!manager) {
      return {
        ok: false,
        code: "no_manager",
        reason: "Terminals are not available on this node.",
      }
    }
    return ensurePiTerminalSession(
      manager,
      {
        loadConfig: async () => {
          const cfg = await this._configStore.load()
          return cfg ?? null
        },
        saveProjectPath: async (absolutePath: string) => {
          const cfg = await this._configStore.load()
          if (!cfg) return
          const prev = cfg.piSettings?.allowedPaths ?? []
          const next = [
            absolutePath,
            ...prev.filter((p) => p !== absolutePath),
          ].slice(0, 5)
          await this.updateNodeConfig({
            piSettings: { ...(cfg.piSettings ?? {}), allowedPaths: next },
          })
        },
      },
      params ?? {},
    )
  }

  /**
   * U4+ — the Envoy TUI terminal session (like Pi's). Spawns the
   * standalone `envoy-harness-tui` in a PTY for a chosen project folder.
   */
  async ensureEnvoyTerminalSession(
    params?: import("@envoymesh/api").EnsureEnvoyTerminalParams,
  ): Promise<import("@envoymesh/api").EnsureEnvoyTerminalResult> {
    const manager = this._terminalManager;
    if (!manager) {
      return {
        ok: false,
        code: "no_manager",
        reason: "Terminals are not available on this node.",
      };
    }
    return ensureEnvoyTerminalSession(
      manager,
      {
        loadConfig: async () => {
          const cfg = await this._configStore.load();
          return cfg ?? null;
        },
        saveProjectPath: async (absolutePath: string) => {
          // Keep the panel's project folder in sync (no runtime reset —
          // the TUI session owns its own cwd).
          await this.updateNodeConfig({ envoyHarnessCwd: absolutePath });
        },
        resolveRuntimeConfig: async () => {
          await this._refreshEnvoyHarnessHostConfig();
          const eh = loadEnvoyHarnessRuntimeConfig({
            hostModel: this._envoyHarnessHostModel,
            hostApiKey: this._envoyHarnessHostApiKey,
            hostEndpoint: this._envoyHarnessHostEndpoint,
          });
          return {
            provider: eh.provider,
            model: eh.model,
            ...(eh.apiKey !== undefined ? { apiKey: eh.apiKey } : {}),
            ...(eh.endpoint !== undefined ? { endpoint: eh.endpoint } : {}),
          };
        },
      },
      params ?? {},
    );
  }

  /**
   * Phase 49D — deliver the user's confirm/deny decision on a Pi tool-action
   * request back to the Pi child process. Emits the matching pi.tool.*
   * audit event. Used by the piRespondToProposal JSON-RPC method.
   */
  async piRespondToProposal(params: {
    uiRequestId: string
    confirmed: boolean
  }): Promise<{ uiRequestId: string; delivered: boolean }> {
    // Phase G / 12b — ACP permissions share this RPC (EnvoyGo unchanged).
    const acp = this._acpPermissionBridge.respond(
      params.uiRequestId,
      params.confirmed ? "allow" : "deny",
    );
    if (acp.delivered) {
      return { uiRequestId: params.uiRequestId, delivered: true };
    }
    const result = await respondToUiRequestViaRuntime(
      this._piState,
      this._piRuntimeDeps(),
      params.uiRequestId,
      params.confirmed,
    )
    return { uiRequestId: params.uiRequestId, delivered: result.delivered }
  }

  async ehRespondToUserQuestion(params: {
    requestId: string
    value: string
    optionIndex?: number
    cancelled?: boolean
  }): Promise<{ requestId: string; delivered: boolean }> {
    const result = this._ehUserQuestionBridge.respond(params.requestId, {
      value: params.value,
      ...(params.optionIndex !== undefined
        ? { optionIndex: params.optionIndex }
        : {}),
      ...(params.cancelled === true ? { cancelled: true } : {}),
    })
    return { requestId: params.requestId, delivered: result.delivered }
  }

  async ehRespondToPermission(params: {
    requestId: string
    allowed: boolean
  }): Promise<{ requestId: string; delivered: boolean }> {
    const result = this._ehPermissionBridge.respond(
      params.requestId,
      params.allowed ? "allow" : "deny",
    )
    return { requestId: params.requestId, delivered: result.delivered }
  }

  async cancelEnvoyHarnessTurn(
    chatId?: string,
  ): Promise<{ cancelled: boolean }> {
    const turn = chatId
      ? this._ehChatRuntime.getTurnForChat(chatId)
      : this._ehChatRuntime.listActiveTurns()[0];
    if (!turn) return { cancelled: false };
    const host = turn.chatId
      ? this._ehChatRuntime.getHost(turn.chatId)?.host
      : this._envoyHarnessPersistentAcpHost;
    if (!host) return { cancelled: false };
    await host.cancelActiveTurn();
    if (turn.sessionId) {
      this._ehPermissionBridge.clearForSession(turn.sessionId);
    }
    if (turn.chatId) {
      this._ehUserQuestionBridge.clearForChat(turn.chatId);
    }
    return { cancelled: true };
  }

  private _resolveOpenClawWorkspaceDir(): string {
    const ownerId = this._profile?.owner?.ownerId ?? "unknown";
    return resolveOpenClawWorkspaceDirFromProfile(this._profileDir, ownerId);
  }

  private _clawHubContext(): ClawHubContext {
    return buildClawHubContext(this);
  }

  // --- ClawHub skill/plugin management ---

  async getOpenClawPlugins(): Promise<string[]> {
    return getOpenClawPluginsViaRuntime(this._clawHubContext());
  }

  async getTrendingOpenClawPlugins(): Promise<string[]> {
    return getTrendingOpenClawPluginsViaRuntime(this._clawHubContext());
  }

  async searchOpenClawPlugins(query: string): Promise<string[]> {
    return searchOpenClawPluginsViaRuntime(this._clawHubContext(), query);
  }

  async installOpenClawPlugin(name: string): Promise<{ ok: boolean; message: string }> {
    return installOpenClawPluginViaRuntime(this._clawHubContext(), name);
  }

  async uninstallOpenClawPlugin(name: string): Promise<{ ok: boolean; message: string }> {
    return uninstallOpenClawPluginViaRuntime(this._clawHubContext(), name);
  }

  async saveWebSearchEnabled(enabled: boolean): Promise<{ ok: boolean }> {
    return saveWebSearchEnabledViaRuntime(this._clawHubContext(), enabled);
  }

  async saveSkillApiKeys(keys: Record<string, string>): Promise<{ ok: boolean }> {
    return saveSkillApiKeysViaRuntime(this._clawHubContext(), keys);
  }

  async saveClawhubToken(token: string): Promise<{ ok: boolean }> {
    return saveClawhubTokenViaRuntime(token);
  }

  private _openClawPluginContext(): OpenClawPluginContext {
    return buildOpenClawPluginContext(this);
  }

  /** Resolve the OpenClaw gateway tree directory (for plugin manifest scanning).
   *  In Tauri bundles this uses TAURI_RESOURCE_DIR; in dev mode it walks up
   *  from the node cwd to find packages/openclaw. */
  _resolveOpenClawDir(): string | null {
    const { resolveBundledOpenClawDir } = require("./bundled-paths.js") as typeof import("./bundled-paths.js");
    // The function needs nodeCwd for monorepo dev resolution, but in Tauri
    // bundles it only uses TAURI_RESOURCE_DIR. Use profileDir as a safe cwd.
    return resolveBundledOpenClawDir(this._profileDir);
  }

  // --- OpenClaw extension/plugin management ---

  async listOpenClawExtensionPlugins(): Promise<import("@envoymesh/api").OpenClawPluginInfo[]> {
    return listOpenClawExtensionPluginsViaRuntime(this._openClawPluginContext());
  }

  async inspectOpenClawExtensionPlugin(id: string): Promise<import("@envoymesh/api").OpenClawPluginDetail | null> {
    return inspectOpenClawExtensionPluginViaRuntime(this._openClawPluginContext(), id);
  }

  async enableOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }> {
    return enableOpenClawExtensionPluginViaRuntime(this._openClawPluginContext(), id);
  }

  async disableOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }> {
    return disableOpenClawExtensionPluginViaRuntime(this._openClawPluginContext(), id);
  }

  async installOpenClawExtensionPlugin(spec: string): Promise<{ ok: boolean; message: string }> {
    return installOpenClawExtensionPluginViaRuntime(this._openClawPluginContext(), spec);
  }

  async uninstallOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }> {
    return uninstallOpenClawExtensionPluginViaRuntime(this._openClawPluginContext(), id);
  }

  async updateOpenClawExtensionPlugin(id: string): Promise<{ ok: boolean; message: string }> {
    return updateOpenClawExtensionPluginViaRuntime(this._openClawPluginContext(), id);
  }

  async stopOpenClaw(): Promise<void> {
    return stopOpenClawViaRuntime(this._openClawState, this._openClawRuntimeDeps());
  }

  async askOpenClaw(prompt: string, _context?: {
    ownerDisplayName?: string;
    bonds?: Array<{ name: string; level: string; dormantDays?: number }>;
    interests?: string[];
    capabilities?: string[];
    permissions?: { bondAutonomy: boolean; maxBondsPerDay: number; autoCircleContacts: boolean; maxSensitivity: string };
    model?: { provider: string; baseUrl?: string; model?: string };
    retrievedContext?: {
      knowledgeAccess?: import("./ai-context.js").KnowledgeAccessLevel;
      knowledgeScope?: import("@envoymesh/api").AiKnowledgeBaseScope;
      contactThreadOwnerId?: string;
    };
  }): Promise<string> {
    return askOpenClawViaRuntime(this._openClawState, this._openClawRuntimeDeps(), prompt, _context);
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
    const threadKey = envoyAiThreadKeyForProfile(this._callerFamilyProfileId());
    return sendToOpenClawViaRuntime(
      this._openClawState,
      this._openClawRuntimeDeps(),
      text,
      threadKey,
    );
  }

  private _extAgentDeniedError(): Error {
    return new Error(
      "Ext Agent chat is disabled for this family profile. Ask the home-node owner to enable it in Settings → Family.",
    );
  }

  async sendToBridge(text: string): Promise<void> {
    if (!(await this._callerMayUseExtAgent())) {
      throw this._extAgentDeniedError();
    }
    const mesh = this._reachableMesh();
    const ownerId = this._profile?.owner?.ownerId ?? "";
    const meshPeerId = mesh?.peerId;
    if (!meshPeerId) {
      console.warn("[bridge] sendToBridge: mesh not ready (no peerId)");
      return;
    }
    const bridgeAgentPeerId = this._bridgeStatus?.agentPeerId?.trim();
    if (!bridgeAgentPeerId) {
      console.warn("[bridge] sendToBridge: no bridge agent configured");
      return;
    }

    const profileId = this._callerFamilyProfileId();
    const threadKey = bridgeThreadKeyForProfile(bridgeAgentPeerId, profileId);
    const isOwnerCaller =
      getRpcCaller()?.isOwnerProfile ?? profileId === OWNER_FAMILY_PROFILE_ID;
    const displayName = await this._callerFamilyDisplayName();
    const humanSenderOwnerId = isOwnerCaller ? ownerId : profileId;

    // Persist the outbound message so it appears in the Ext Agent thread on the home node.
    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const outboundMsg: ChatMessage = {
      messageId,
      sender: {
        nodeId: meshPeerId,
        ownerId: humanSenderOwnerId,
        displayName,
        actorRole: "human",
      },
      recipient: {
        nodeId: bridgeAgentPeerId,
        // Profile-scoped thread key so WS routing reaches the caller only.
        ownerId: threadKey,
        displayName: this._bridgeStatus?.agentName ?? "Ext Agent",
      },
      content: { text },
      metadata: {
        timestamp: now,
        deliveryReceipt: "sent",
        deliveryChannel: "agent",
        deliverySource: "bridge",
      },
      signature: "",
    };
    // Store under profile-scoped bridge thread (Phase 51).
    this._persistChatMessage(threadKey, outboundMsg);
    // Emit for WebSocket-connected clients (Social desktop/mobile)
    this.emit("chat:message", outboundMsg);

    // Forward to the external agent via HTTP. forwardToAgent calls receiveFromAgent
    // internally which delivers the reply back to the mobile via libp2p.
    const bridgeConfig = this._bridgeStatus;
    if (!bridgeConfig) return;

    try {
      const replyText = await forwardToAgent(
        {
          enabled: true,
          agentUrl: bridgeConfig.agentUrl,
          listenPort: 0,
          agentName: bridgeConfig.agentName,
        } as any,
        {
          senderPeerId: meshPeerId,
          senderOwnerId: humanSenderOwnerId,
          senderDisplayName: displayName,
          text,
        },
      );
      if (typeof replyText === "string" && replyText.trim()) {
        this._recordBridgeReplyForProfile(profileId, bridgeAgentPeerId, replyText.trim());
      } else {
        // Async reply will arrive via onSelfSendEnvelope → handleBridgeSelfReply.
        this._notePendingBridgeReply(profileId);
      }
    } catch (err) {
      console.error("[bridge] sendToBridge: forwardToAgent failed:", err instanceof Error ? err.message : String(err));
    }
  }

  async reloadOpenClawConfig(): Promise<void> {
    return reloadOpenClawConfigViaRuntime(this._clawHubContext());
  }

  async executeOpenClawTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    this.recordOpenClawToolCall(toolName);
    const context = await this._requireToolExecutionContext();
    const { executeTool } = await import("./tool-registry.js");
    const result = await executeTool(toolName, params, context);
    if (!result.ok) {
      if (result.approvalRequired) {
        throw new Error(
          result.approvalItemId
            ? `Tool ${toolName} requires owner approval (queued as ${result.approvalItemId})`
            : result.error ?? `Tool ${toolName} requires owner approval`,
        );
      }
      throw new Error(result.error ?? `Tool ${toolName} failed`);
    }
    return result.result;
  }

  // Phase 28 — Mesh Intelligence Report
  async generateMeshIntelligenceReport(): Promise<string> {
    const report = await meshIntelligenceReportViaRuntime(
      {
        getBonds: () => this.getBonds(),
        generateNarrative: (prompt) => this.knowledgeQuery(prompt),
      },
      {},
    );
    return formatMeshIntelligenceReport(report);
  }

  // Phase 27 — Proactive agent pass
  async runProactiveAgentPass(): Promise<Array<{ kind: string; summary: string; matchedTopic: string; peerCount: number }>> {
    return runProactiveAgentPassViaRuntime({
      runMeshAwareness: () => this.runMeshAwarenessPass(),
      runConnectionSuggester: () => this.runConnectionSuggesterPass(),
      getBonds: () => this.getBonds(),
      getDormantThresholdDays: async () => {
        const config = await this._configStore.load();
        return config?.dormantBondThresholdDays ?? 90;
      },
    });
  }

  // Phase 23A+ — Discovery-driven clusterer
  async discoverAndCluster(
    seedTopics?: string[],
    seedCapabilities?: string[],
  ): Promise<string> {
    const bonds = await this.getBonds();
    return discoverAndClusterViaRuntime(
      { profile: this._profile!, bonds },
      { seedTopics, seedCapabilities },
    );
  }

  // Phase 23D — Chat RAG search  (delegation lives near the connection
  // suggester / mesh awareness methods — see Phase 23B block above)

  // Phase 25A — Mesh awareness pass  (delegation lives near the
  // connection suggester block above)

  // -------------------------------------------------------------------
  // Phase 23 — Published library (E2E test support + cross-node topic sharing)
  // -------------------------------------------------------------------
  // Per-owner published-library store, keyed by ownerId. The local owner
  // publishes via publishDocument(); bonded peers' libraries are recorded
  // via setPeerPublishedLibrary() (called by the test harness today, and
  // by the bond-handshake / agent.card sync in a follow-on). The circle
  // proposer and mesh-awareness worker read from this map.
  private readonly _publishedLibraryStore = new PublishedLibraryStore({
    getFilePath: () => buildPublishedLibraryFilePath(this._profileDir),
  });

  // -------------------------------------------------------------------
  // Phase 25D — Intent history (predictIntent source)
  // -------------------------------------------------------------------
  // Sliding window of the owner's most recent intents. Capped at
  // INTENT_HISTORY_MAX entries to keep memory bounded. Persisted to
  // disk so predictions survive restarts.
  private static readonly INTENT_HISTORY_MAX = 50;
  private readonly _intentHistoryStore = new IntentHistoryStore({
    maxEntries: NodeServiceImpl.INTENT_HISTORY_MAX,
    getFilePath: () => buildIntentHistoryFilePath(this._profileDir),
  });
  private _intentHistoryFilePath(): string | null {
    return buildIntentHistoryFilePath(this._profileDir);
  }

  /** Record a recent intent event for prediction. */
  async recordIntent(intent: string, query: string): Promise<void> {
    return recordIntentViaRuntime(this._persistenceContext(), intent, query);
  }

  /** Load intent history from disk (called at startup). */
  async loadIntentHistoryFromDisk(): Promise<void> {
    return loadIntentHistoryFromDiskViaRuntime(this._persistenceContext());
  }

  private _publishedLibraryFilePath(): string | null {
    return buildPublishedLibraryFilePath(this._profileDir);
  }

  private async _persistPublishedLibrary(): Promise<void> {
    return persistPublishedLibraryViaRuntime(this._persistenceContext());
  }

  /** Restore the published library from disk (if present). */
  async loadPublishedLibraryFromDisk(): Promise<void> {
    return loadPublishedLibraryFromDiskViaRuntime(this._persistenceContext());
  }

  async publishDocument(input: {
    title: string;
    topicTags: string[];
    sensitivity?: string;
  }): Promise<{ title: string; topicTags: string[]; sensitivity: string; publishedAt: string }> {
    const ownerId = this._profile?.owner.ownerId;
    if (!ownerId) throw new Error("owner profile not loaded");
    const entry = this._publishedLibraryStore.publish(input);
    await this._publishedLibraryStore.persist();
    return entry;
  }

  /**
   * Record a bonded peer's published library (called by the test harness
   * or by agent.card sync). Idempotent: replaces any prior entries for
   * the same ownerId.
   */
  async setPeerPublishedLibrary(
    ownerId: string,
    entries: Array<{ title: string; topicTags: string[]; sensitivity: string; publishedAt?: string }>,
  ): Promise<void> {
    // Preserve the original `publishedAt` for each entry when present;
    // only fall back to "now" for entries that don't carry one (which is
    // the case when the harness or sync layer pushes them in).
    this._publishedLibraryStore.setForPeer(ownerId, entries);
    // Surface persistence failures to the caller so they can retry or
    // surface the error. The in-memory state is updated regardless, but
    // the caller's await will reject if the write fails.
    return this._publishedLibraryStore.persist();
  }

  /**
   * Look up the topic tags for a given owner from the published library.
   * Returns [] for unknown owners.
   */
  private async _getContactTopicsFromLibrary(ownerId: string): Promise<string[]> {
    return getContactTopicsFromLibraryViaRuntime(this._persistenceContext(), ownerId);
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
    return this._publishedLibraryStore.getEntries(ownerId);
  }

  // -------------------------------------------------------------------
  // Phase 25 — Cross-device continuity sessions
  // -------------------------------------------------------------------
  // Thin NodeService surface that delegates to the continuity-service
  // module via the runtime in node-service-continuity.ts. State is
  // held in a per-profile JSON file so sessions survive restarts.
  // Real cross-device sync is wired via sync.state (a follow-on).
  private readonly _continuityStore = new ContinuityStore({
    getFilePath: () => buildContinuityFilePath(this._profileDir),
  });

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
    return startContinuitySessionViaRuntime(this._continuityContext(), description, opts);
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
    return updateContinuitySessionViaRuntime(this._continuityContext(), sessionId, update);
  }

  async completeContinuitySession(sessionId: string): Promise<void> {
    await completeContinuitySessionViaRuntime(this._continuityContext(), sessionId);
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
    return getResumableSessionsViaRuntime(this._continuityContext());
  }

  private _continuityContext(): ContinuityContext {
    return buildContinuityContext(this._serviceContextDeps().continuity);
  }

  async startDocumentAcquisitionJob(params: {
    query: string;
    fileTitleHint?: string;
    pathHint?: string;
  }): Promise<{ jobId: string; correlationId: string }> {
    return startDocumentAcquisitionJobViaPublicRuntime(this._docAcqCapProvDeps(), params);
  }

  async getDocumentAcquisitionJob(jobId: string): Promise<DocumentAcquisitionJob | undefined> {
    return getDocumentAcquisitionJobViaPublicRuntime(this._docAcqCapProvDeps(), jobId);
  }

  async listDocumentAcquisitionJobs(activeOnly?: boolean): Promise<DocumentAcquisitionJob[]> {
    return listDocumentAcquisitionJobsViaPublicRuntime(this._docAcqCapProvDeps(), activeOnly);
  }

  async cancelDocumentAcquisitionJob(jobId: string): Promise<void> {
    return cancelDocumentAcquisitionJobViaPublicRuntime(this._docAcqCapProvDeps(), jobId);
  }

  async runDocumentAcquisitionWorker(): Promise<number> {
    return runDocumentAcquisitionWorkerViaPublicRuntime(this._docAcqCapProvDeps());
  }
  async startCapabilityProviderJob(params: {
    goal: string;
    capabilityIds?: string[];
    targetOwnerId?: string;
  }): Promise<{ jobId: string; correlationId: string }> {
    return startCapabilityProviderJobViaPublicRuntime(this._docAcqCapProvDeps(), params);
  }

  async getCapabilityProviderJob(jobId: string): Promise<CapabilityProviderJob | undefined> {
    return getCapabilityProviderJobViaPublicRuntime(this._docAcqCapProvDeps(), jobId);
  }

  async listCapabilityProviderJobs(activeOnly?: boolean): Promise<CapabilityProviderJob[]> {
    return listCapabilityProviderJobsViaPublicRuntime(this._docAcqCapProvDeps(), activeOnly);
  }

  async cancelCapabilityProviderJob(jobId: string): Promise<void> {
    return cancelCapabilityProviderJobViaPublicRuntime(this._docAcqCapProvDeps(), jobId);
  }

  async runCapabilityProviderWorker(): Promise<number> {
    return runCapabilityProviderWorkerViaPublicRuntime(this._docAcqCapProvDeps());
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
              row.membership.some((tag) => tag.toLowerCase() === cap.toLowerCase()),
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
              knowledgeAccess: "private",
              knowledgeBase: nodeConfig.aiSettings?.knowledgeBase,
              knowledgeScope: "owner",
            })
          : searchVaultKnowledgeBase({
              vaultIndex,
              query,
              knowledgeAccess: "private",
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
      awardChainWorker: (payload) => this._executeApprovedChainAward(payload),
      executeToolCall: async (toolName, params) => {
        const context = await this.getToolExecutionContext();
        if (!context) {
          return { ok: false, error: "tool execution context unavailable" };
        }
        const { executeTool } = await import("./tool-registry.js");
        const result = await executeTool(toolName, params, {
          ...context,
          approvalGranted: true,
        });
        if (!result.ok) {
          return { ok: false, error: result.error ?? `Tool ${toolName} failed` };
        }
        const messageId =
          result.result &&
          typeof result.result === "object" &&
          "messageId" in result.result &&
          typeof (result.result as { messageId?: unknown }).messageId === "string"
            ? (result.result as { messageId: string }).messageId
            : undefined;
        return { ok: true, messageId };
      },
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

    const wireAttachment = {
      id: attachmentId,
      filename,
      mimeType,
      sizeBytes: bytes.byteLength,
      sensitivity,
      vaultRelativePath,
    };

    let chatMessageId: string | undefined;
    if (params.chatText !== undefined) {
      const sendResult = await this.sendChat(params.targetOwnerId, params.chatText, [wireAttachment]);
      chatMessageId = sendResult.messageId;
    } else if (params.recordInChat !== false) {
      void this._recordFileShareInChat({
        peerOwnerId: params.targetOwnerId,
        outgoing: true,
        vaultRelativePath,
        byteLength: bytes.byteLength,
        sensitivity,
        mimeType,
        textOverride: params.caption?.trim() || `Sent ${filename}`,
      });
    }

    const { shareRequestMessageId } = await shareFileViaRuntime(this._fileShareNetworkContext(), params.targetOwnerId, {
      path: vaultRelativePath,
      sensitivity,
      deliveryChannel: "chat",
      chatMessageId,
      chatAttachmentId: attachmentId,
    });

    return { attachmentId, vaultRelativePath, shareRequestMessageId, messageId: chatMessageId };
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
    return readLibraryItemContentViaRuntime(this._fileShareContext(), params);
  }

  async listChatHistory(peerOwnerId: string, limit?: number): Promise<ChatMessage[]> {
    if (!this._chatLogStore) return [];
    const caller = getRpcCaller();
    const profileId = this._callerFamilyProfileId();
    const isOwner = !caller || caller.isOwnerProfile;
    // Normalize EnvoyAI thread keys — EnvoyGo sends "envoyai", the Social UI
    // and storage use ENVOY_AI_THREAD_KEY ("__envoy_ai__"). Accept both.
    // Phase 51: namespace by caller profile (`__envoy_ai__:<profileId>`).
    const normalizedKey = peerOwnerId.trim();
    if (
      normalizedKey === ENVOY_AI_THREAD_KEY ||
      normalizedKey === "envoyai" ||
      normalizedKey.startsWith(`${ENVOY_AI_THREAD_KEY}:`)
    ) {
      const threadKey = normalizedKey.startsWith(`${ENVOY_AI_THREAD_KEY}:`)
        ? normalizedKey
        : envoyAiThreadKeyForProfile(profileId);
      if (!threadVisibleTo(threadKey, profileId)) return [];
      return loadEnvoyAiChatHistoryViaRuntime(
        this._openClawRuntimeDeps(),
        limit,
        threadKey,
      );
    }
    // Ext Agent thread — EnvoyGo uses "external"; Social selects agentPeerId;
    // chat log is keyed by profile-scoped `bridge:<agentId>:<profileId>`.
    const bridgePeer = this._bridgeStatus?.agentPeerId?.trim();
    if (
      normalizedKey === "external" ||
      normalizedKey.startsWith("bridge:") ||
      (bridgePeer != null && normalizedKey === bridgePeer)
    ) {
      if (!bridgePeer) return [];
      const scoped = normalizedKey.startsWith("bridge:")
        ? normalizedKey
        : bridgeThreadKeyForProfile(bridgePeer, profileId);
      if (!threadVisibleTo(scoped, profileId)) return [];
      const scopedRows = (await this._chatLogStore.listThread(scoped, limit)) as ChatMessage[];
      // Also merge legacy unscoped key (agentPeerId) — outbound sendChat still
      // persists there; replies live under bridge: after Phase 51.
      const legacyRows = (await this._chatLogStore.listThread(bridgePeer, limit)) as ChatMessage[];
      if (scopedRows.length === 0) return legacyRows;
      if (legacyRows.length === 0) return scopedRows;
      const byId = new Map<string, ChatMessage>();
      for (const m of [...legacyRows, ...scopedRows]) {
        if (m.messageId) byId.set(m.messageId, m);
      }
      const merged = [...byId.values()].sort((a, b) => {
        const ta = Date.parse(a.metadata?.timestamp ?? "") || 0;
        const tb = Date.parse(b.metadata?.timestamp ?? "") || 0;
        return ta - tb;
      });
      return typeof limit === "number" && limit > 0 ? merged.slice(-limit) : merged;
    }
    // Family DM threads.
    if (isFamilyThreadKey(normalizedKey)) {
      if (!threadVisibleTo(normalizedKey, profileId)) return [];
      return (await this._chatLogStore.listThread(normalizedKey, limit)) as ChatMessage[];
    }
    // Family group rooms (`room:<id>`) — membership via family-rooms store.
    if (normalizedKey.startsWith("room:")) {
      const roomId = normalizedKey.slice("room:".length).trim();
      if (this._familyRoomStore && roomId) {
        const familyRoom = await this._familyRoomStore.get(roomId);
        if (familyRoom) {
          if (!familyRoom.memberProfileIds.includes(profileId)) return [];
          return (await this._chatLogStore.listThread(normalizedKey, limit)) as ChatMessage[];
        }
      }
      // Mesh rooms remain owner-only.
      if (!isOwner) return [];
      return (await this._chatLogStore.listThread(normalizedKey, limit)) as ChatMessage[];
    }
    // Bot threads: if client sends bare `bot:<id>`, append caller profile.
    if (normalizedKey.startsWith("bot:")) {
      const scoped =
        normalizedKey.slice(4).includes(":")
          ? normalizedKey
          : aiBotThreadKeyForProfile(normalizedKey.slice(4), profileId);
      if (!threadVisibleTo(scoped, profileId)) return [];
      const rows = await this._chatLogStore.listThread(scoped, limit);
      if (rows.length > 0 || profileId !== OWNER_FAMILY_PROFILE_ID) {
        return rows as ChatMessage[];
      }
      return (await this._chatLogStore.listThread(normalizedKey, limit)) as ChatMessage[];
    }
    // Mesh / other keys: owner profile only.
    if (!isOwner) return [];
    const rows = await this._chatLogStore.listThread(normalizedKey, limit);
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
              beginOpenClawToolTracking(this._openClawState);
              try {
                const context = await buildOpenClawTurnContextViaRuntime(this._openClawRuntimeDeps());
                return stripModelThinking(await this.askOpenClaw(prompt, context));
              } catch (err) {
                console.warn("[openclaw] @envoy request failed, falling back:", err instanceof Error ? err.message : String(err));
              } finally {
                endOpenClawToolTracking(this._openClawState);
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
    const bridgePeer = this._bridgeStatus?.agentPeerId?.trim();
    // EnvoyGo aliases → canonical store keys.
    if (thread === "envoyai") {
      deletedCount += await this._chatLogStore.clearThread(ENVOY_AI_THREAD_KEY);
    } else if (thread === "external" && bridgePeer) {
      deletedCount += await this._chatLogStore.clearThread(bridgePeer);
    }
    // Do NOT clear bridge peer when clearing EnvoyAI — Ext Agent owns that key.
    if (deletedCount > 0 && (await this._shouldPurgeChatRagOnDelete())) {
      const rag = await this._getRagService();
      await rag?.clearChatThread(thread);
      if (thread === "envoyai" || thread === ENVOY_AI_THREAD_KEY) {
        await rag?.clearChatThread(ENVOY_AI_THREAD_KEY);
      } else if (thread === "external" && bridgePeer) {
        await rag?.clearChatThread(bridgePeer);
      }
    }
    // EnvoyAI trash must also reset OpenClaw session trajectories — otherwise
    // Local (and cloud) keep stuffing multi-MB history into the next turn.
    if (thread === "envoyai" || thread === ENVOY_AI_THREAD_KEY) {
      try {
        const { resetOpenClawEnvoyAiSessions } = await import(
          "./openclaw-envoyai-session-reset.js"
        );
        const reset = await resetOpenClawEnvoyAiSessions(this._profileDir);
        if (reset.removedSessions > 0) {
          console.log(
            `[openclaw] EnvoyAI clear reset ${reset.removedSessions} session(s), ` +
              `${reset.removedFiles} file(s)`,
          );
        }
      } catch (err) {
        console.warn(
          "[openclaw] EnvoyAI session reset failed:",
          err instanceof Error ? err.message : String(err),
        );
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
        getMesh: () => this._mesh ?? this._externalMesh,
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
        queryRelayLookupByTopic: (params) => this._queryRelayLookupByTopic(params),
        queryRelayLookupByPeerId: (params) => this._queryRelayLookupByPeerId(params),
        // Bundled sponsor identity (displayName + ownerId + peerId) from
        // the DMG-shipped `bundled-sponsor-friend.json`. Used by
        // `searchLocalPeers` as a fallback name source when the local
        // trust store + peer profile cache have no displayName for the
        // matching owner — i.e. a fresh install where the sponsor hasn't
        // bonded yet. Without this, typing the bundled sponsor's name
        // returns empty in local-only discovery mode.
        getBundledSponsorIdentity: async () => {
          // Best-effort: backfill the bundled multiaddrs into the peer
          // directory so the contact list's dial hints are populated
          // for manual sends. Idempotent — does nothing on subsequent
          // calls. Catches errors so a peer-dir hiccup never breaks
          // the bundled identity read.
          await backfillBundledSponsorPeerAddresses(
            this._peerDirectoryStore,
            process.env.ENVOYMESH_NODE_BUNDLE_DIR,
            {
              includePrivateLan:
                (await this._configStore.load().catch(() => undefined))?.discoveryProfile ===
                "lan-fast",
            },
          );
          const parsed = await loadBundledSponsorFriendParsed(
            process.env.ENVOYMESH_NODE_BUNDLE_DIR,
          );
          if (!parsed) return undefined;
          const ownerId = parsed.link.ownerId;
          const peerId = parsed.link.peerId;
          if (!ownerId || !peerId) return undefined;
          // `displayName` lives in the bundled contactUri's `name=` query
          // param (parseEnvoyContactUri exposes it as `displayName`).
          const displayName = parsed.link.displayName;
          if (!displayName) return undefined;
          return { ownerId, peerId, displayName };
        },
      });
    }
    return this._discoveryRuntimeCache;
  }

  /**
   * Cross-NAT fallback for `searchPeers`: when the local DHT returns 0
   * providers, ask our bootstrap relays for the topicHash via `relay.lookup`.
   * The relay server's roster is indexed by topicHash (set during
   * `relay.checkin`), so this works without a direct DHT connection.
   */
  private async _queryRelayLookupByTopic(params: {
    topic: string;
    topicHash: string;
    maxResults: number;
  }): Promise<PeerSearchResult[]> {
    const deps = this._relayClientCycleDeps;
    const mesh = this._mesh ?? this._externalMesh;
    if (!deps) {
      console.warn(`[searchPeers] _queryRelayLookupByTopic: _relayClientCycleDeps not set`);
      return [];
    }
    if (!mesh) {
      console.warn(`[searchPeers] _queryRelayLookupByTopic: mesh not available`);
      return [];
    }
    const targets = resolveRelayClientControlTargets(deps);
    if (targets.length === 0) {
      console.warn(`[searchPeers] _queryRelayLookupByTopic: no relay control targets (bootstrapPeers=${deps.bootstrapPeers.length})`);
      return [];
    }
    try {
      console.log(`[searchPeers] _queryRelayLookupByTopic: querying ${targets.length} relay(s) for topicHash=${params.topicHash.slice(0, 20)}…`);
      const responses = await queryRelayLookupWithDeps(deps, targets, {
        topicHash: params.topicHash,
        maxResults: params.maxResults,
        visibilityScope: "public",
      });
      console.log(`[searchPeers] _queryRelayLookupByTopic: got ${responses.length} response(s), total peers=${responses.reduce((s, r) => s + r.peers.length, 0)}`);
      return this._mapRelayLookupPeersToSearchResults(responses, {
        interests: [params.topic],
        discoverySource: "relay-roster-topic",
      });
    } catch (err) {
      console.warn(
        `[searchPeers] queryRelayLookupByTopic failed:`,
        err instanceof Error ? err.message : err,
      );
      return [];
    }
  }

  /**
   * Exact peer lookup via `relay.lookup` `targetPeerId` against bootstrap relays.
   */
  private async _queryRelayLookupByPeerId(params: {
    peerId: string;
    maxResults: number;
  }): Promise<PeerSearchResult[]> {
    const deps = this._relayClientCycleDeps;
    const mesh = this._mesh ?? this._externalMesh;
    if (!deps || !mesh) return [];
    const targets = resolveRelayClientControlTargets(deps);
    if (targets.length === 0) return [];
    try {
      const responses = await queryRelayLookupWithDeps(deps, targets, {
        targetPeerId: params.peerId,
        capability: "mesh.discovery",
        maxResults: params.maxResults,
        visibilityScope: "public",
      });
      return this._mapRelayLookupPeersToSearchResults(responses, {
        interests: [],
        discoverySource: "relay-roster-peer",
        peerIdFilter: params.peerId,
      });
    } catch (err) {
      console.warn(
        `[searchPeers] queryRelayLookupByPeerId failed:`,
        err instanceof Error ? err.message : err,
      );
      return [];
    }
  }

  /**
   * Bonded Offline warm helper: exact-peerId `relay.lookup` stores fresh
   * `/p2p-circuit/` seeds (periodic mesh.discovery lookup often returns 0).
   */
  private async _refreshBondedRelayDialHints(transportPeerId: string): Promise<number> {
    const peerId = transportPeerId.trim();
    if (!peerId || peerId.startsWith("envoy_")) return 0;
    const deps = this._relayClientCycleDeps;
    if (!deps) return 0;
    const targets = resolveRelayClientControlTargets(deps);
    if (targets.length === 0) return 0;
    try {
      const responses = await queryRelayLookupWithDeps(deps, targets, {
        targetPeerId: peerId,
        capability: "mesh.discovery",
        maxResults: 4,
        visibilityScope: "public",
      });
      return responses.reduce(
        (sum, r) => sum + r.peers.reduce((n, p) => n + (p.multiaddrs?.length ?? 0), 0),
        0,
      );
    } catch (err) {
      console.warn(
        `[warmContact] refreshBondedRelayDialHints failed:`,
        err instanceof Error ? err.message : err,
      );
      return 0;
    }
  }

  private async _mapRelayLookupPeersToSearchResults(
    responses: Awaited<ReturnType<typeof queryRelayLookupWithDeps>>,
    opts: {
      interests: string[];
      discoverySource: "relay-roster-topic" | "relay-roster-peer";
      peerIdFilter?: string;
    },
  ): Promise<PeerSearchResult[]> {
    const results: PeerSearchResult[] = [];
    const trustRecords = await this._trustStore.listTrustRecords();
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    const trustByPeerId = new Map<string, (typeof trustRecords)[number]>();
    for (const record of trustRecords) {
      const peer = peerRecords.find((p) => p.ownerId === record.peerOwnerId);
      if (peer?.peerId) {
        trustByPeerId.set(peer.peerId, record);
      }
    }
    const seen = new Set<string>();
    for (const response of responses) {
      for (const candidate of response.peers) {
        if (opts.peerIdFilter && candidate.peerId !== opts.peerIdFilter) continue;
        // Skip undialable roster hits (legacy/partial responses).
        if (candidate.hasHopSlot === false) continue;
        if (seen.has(candidate.peerId)) continue;
        seen.add(candidate.peerId);
        const trust = trustByPeerId.get(candidate.peerId);
        const peerRecord = peerRecords.find((p) => p.peerId === candidate.peerId);
        results.push({
          nodeId: candidate.peerId,
          ownerId: candidate.ownerId ?? peerRecord?.ownerId ?? candidate.peerId,
          displayName: trust?.displayName ?? candidate.displayName ?? candidate.peerId.slice(0, 12) + "...",
          interests: opts.interests,
          profileVisibility: "public",
          discoverySource: opts.discoverySource,
          trustLevel: trust?.level,
          hasHopSlot: candidate.hasHopSlot,
        });
      }
    }
    if (this._peerProfileCacheStore) {
      for (const result of results) {
        if (!/^12[Dd]3\w{6,}\.\.\.$/.test(result.displayName) && result.displayName.length > 15) continue;
        try {
          const cached = await this._peerProfileCacheStore.get(result.ownerId);
          if (cached?.profile?.displayName) {
            result.displayName = cached.profile.displayName;
          }
        } catch { /* cache miss is fine */ }
      }
    }
    return results;
  }

  async searchPeers(query: SearchQuery): Promise<PeerSearchResult[]> {
    return this._discoveryRuntime().searchPeers(query);
  }

  /** Snapshot of identifiable People-on-this-network cards for UI hydrate. */
  async getNearbyDiscoveredPeers(): Promise<PeerSearchResult[]> {
    return [...this._nearbyDiscoveredByPeerId.values()].filter(
      (p) => p.profileStatus === "resolved" && Boolean(p.ownerId?.trim()),
    );
  }

  /**
   * Re-probe connected + peerstore LAN + bonded transport peers so Discover
   * can populate "People on this network" even if peer:discovered fired
   * before the UI subscribed (or mDNS has not reconnected yet).
   */
  async refreshNearbyDiscovery(): Promise<{
    peered: number;
    resolved: number;
    unreachable: number;
  }> {
    const mesh = this._reachableMesh();
    if (!mesh || this._nodeStatus !== "running") {
      return { peered: 0, resolved: 0, unreachable: 0 };
    }
    const selfId = mesh.peerId;
    const bootstrap = this._bootstrapPeerIdSet ?? new Set<string>();
    const peerIds = new Set<string>();
    const bondPeerIds = new Set<string>();
    try {
      for (const id of await mesh.listNearbyDiscoveryCandidatePeerIds()) {
        if (id) peerIds.add(id);
      }
    } catch {
      // LAN candidate listing failed — bonds below may still help.
    }
    try {
      const bonds = await this.getBonds();
      for (const bond of bonds) {
        if (!bond || bond.level === "blocked") continue;
        const resolved = await this._resolveLibp2pPeerForBondOwner(bond.peerOwnerId);
        const transportId = resolved?.transportPeerId?.trim();
        if (transportId) {
          peerIds.add(transportId);
          bondPeerIds.add(transportId);
        }
      }
    } catch {
      // Bonds are optional enrichment for refresh candidates.
    }

    let peered = 0;
    const tasks: Promise<void>[] = [];
    for (const peerId of peerIds) {
      if (!peerId || peerId === selfId) continue;
      if (bootstrap.has(peerId)) continue;
      let addrs: string[] = [];
      try {
        addrs = await mesh.getPeerStoreDialHints(peerId, {
          allowEphemeralPrivateLan: true,
        });
      } catch {
        addrs = [];
      }
      const lan = addrs.filter((a) => isPrivateLanTcpDialHint(a));
      // Non-bond strangers must look like same-LAN; bonded contacts may be
      // refreshed even over relay so Discover can show known people nearby.
      if (lan.length === 0 && !bondPeerIds.has(peerId)) continue;
      const dial = lan.length > 0 ? lan : addrs;
      tasks.push(this.handleMeshPeerDiscovered(peerId, dial, { force: true }));
      peered += 1;
    }
    await Promise.all(tasks);
    const snap = [...this._nearbyDiscoveredByPeerId.values()];
    const resolved = snap.filter(
      (p) => p.profileStatus === "resolved" && Boolean(p.ownerId?.trim()),
    ).length;
    const unreachable = snap.filter((p) => p.profileStatus === "unreachable").length;
    // Drop unreachable noise from the long-lived cache so Discover stays stable.
    for (const [id, peer] of this._nearbyDiscoveredByPeerId) {
      if (peer.profileStatus !== "resolved" || !peer.ownerId?.trim()) {
        this._nearbyDiscoveredByPeerId.delete(id);
      }
    }
    return { peered, resolved, unreachable };
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

  async getCircuitReservationStatus(): Promise<import("@envoymesh/api").CircuitReservationStatus> {
    return getCircuitReservationStatusViaRuntime(this._wanRuntimeDeps());
  }

  /**
   * Returns the full list of bootstrap peer addresses for DHT discovery and circuit relay.
   * Called by EnvoyGo after pairing to sync bootstrap peers for future reconnections.
   */
  async getBootstrapPeers(): Promise<{ bootstrapPeers: string[]; bootstrapPresetNames: string[] }> {
    // Resolve all bootstrap presets so EnvoyGo gets the complete list
    const presetsToResolve = [
      "public-libp2p",
      "public-libp2p-am6",
      "public-libp2p-am7",
      "cn-relay",
    ];
    const resolvedResults = await resolveBootstrapAddresses(presetsToResolve);
    const allPeers: string[] = [];
    for (const result of resolvedResults) {
      for (const addr of result.resolved) {
        allPeers.push(addr);
      }
    }
    return { bootstrapPeers: allPeers, bootstrapPresetNames: presetsToResolve };
  }

  private _wanRuntimeDeps(): NodeWanRuntimeDeps {
    return buildWanRuntimeDeps(this);
  }

  /**
   * Resolve the fields a freshly-minted company invite needs (Phase 35A).
   * Mirrors what `getPairingPayload` returns, minus the short-lived QR token.
   */
  private async _companyInviteInviteContext(): Promise<{
    ownerId: string;
    ownerPublicKey?: string;
    agentPeerId?: string;
    agentName?: string;
    wsUrl: string;
    lanWsUrl?: string;
    relayWsUrl?: string;
    relayWsUrls?: string[];
    homeNodePeerId?: string;
  }> {
    return buildCompanyInviteInviteContext(this);
  }

  // ============================================
  // File Sharing
  // ============================================

  private async _appendAuditEvent(event: AuditEvent): Promise<void> {
    if (!this._taskStore) return;
    await this._taskStore.appendAuditEvent(event);
  }

  private _fileShareContext(): FileShareContext {
    return buildFileShareContext(this._serviceContextDeps().fileShare);
  }

  private _sessionTokenContext(): SessionTokenAccess {
    return buildSessionTokenContext(this._serviceContextDeps().sessionToken);
  }

  private _recordNodeErrorContext(): RecordNodeErrorAccess {
    return buildRecordNodeErrorContext(this._serviceContextDeps().recordNodeError);
  }

    private _connectionStatusContext(): ConnectionStatusContext {
    return buildConnectionStatusContext(this._serviceContextDeps().connectionStatus);
  }

  private _nodeConfigContext(): NodeConfigContext {
    return buildNodeConfigContext(this._serviceContextDeps().nodeConfig);
  }

  private _capabilityDiscoveryContext(): CapabilityDiscoveryContext {
    return buildCapabilityDiscoveryContext(this._serviceContextDeps().capabilityDiscovery);
  }

  private _agentSetupContext(): AgentSetupContext {
    return buildAgentSetupContext(this._serviceContextDeps().agentSetup);
  }

  private _stopNodeContext(): StopNodeContext {
    return buildStopNodeContext(this._serviceContextDeps().stopNode);
  }

    private _manifestContext(): CapabilityManifestContext {
    return buildManifestContext(this._serviceContextDeps().manifest);
  }

    private _fileShareNetworkContext(): FileShareNetworkContext {
    return buildFileShareNetworkContext(this._serviceContextDeps().fileShareNetwork);
  }

  async listLibraryItems(params?: ListLibraryItemsParams): Promise<LibraryItem[]> {
    return listLibraryItemsViaRuntime(this._fileShareContext(), params);
  }

  async listOpenClawWorkspaceFiles(params?: { query?: string }): Promise<WorkspaceFileItem[]> {
    return listOpenClawWorkspaceFilesViaRuntime(this._fileShareContext(), params);
  }

  async listAllLocalFiles(params?: ListAllLocalFilesParams): Promise<ListAllLocalFilesResult> {
    return listAllLocalFilesViaRuntime(this._fileShareContext(), params);
  }

  async readLocalFileContent(
    params: ReadLocalFileContentParams,
  ): Promise<ReadLibraryItemContentResult> {
    return readLocalFileContentViaRuntime(
      this._fileShareContext(),
      (p) => this.readLibraryItemContent(p),
      (p) => this.readOpenClawWorkspaceFile(p),
      () => this.listLibraryItems(),
      params,
    );
  }

  async openLocalFile(params: OpenLocalFileParams): Promise<void> {
    return openLocalFileViaRuntime(this._fileShareContext(), (p) => this.openLibraryItem(p), params);
  }

  async resolveOpenClawWorkspacePath(relativePath: string): Promise<{ absolutePath: string }> {
    return resolveOpenClawWorkspacePathViaRuntime(this._fileShareContext(), relativePath);
  }

  async readOpenClawWorkspaceFile(
    params: ReadLibraryItemContentParams,
  ): Promise<ReadLibraryItemContentResult> {
    return readOpenClawWorkspaceFileViaRuntime(this._fileShareContext(), params);
  }

  async setLibraryItemPublished(documentId: string, published: boolean): Promise<void> {
    return setLibraryItemPublishedViaRuntime(this._fileShareContext(), documentId, published);
  }

  async exportLibraryItemToIpfs(documentId: string): Promise<ExportLibraryItemToIpfsResult> {
    return exportLibraryItemToIpfsViaRuntime(this._fileShareContext(), documentId);
  }

  async pinLibraryItemExternal(documentId: string): Promise<PinLibraryItemExternalResult> {
    return pinLibraryItemExternalViaRuntime(this._fileShareContext(), documentId);
  }

  async getIpfsEngineStatus(): Promise<IpfsEngineStatus> {
    return getIpfsEngineStatusViaRuntime(this._fileShareContext());
  }

  async getRagIndexStatus(): Promise<RagIndexStatus> {
    return getRagIndexStatusViaRuntime(this._fileShareContext());
  }

  async reindexRagKnowledge(params?: { force?: boolean }): Promise<RagIndexStatus> {
    const force = params?.force !== false;
    const config = await this.getNodeConfig();
    const rag = await this._getRagService();
    if (!rag) return { ...DEFAULT_RAG_INDEX_STATUS };

    const releaseIdle = this._holdEnvoyLocalEmbedIdle();
    try {
      // Keep Knowledge Browse in sync with Content → Blog (mirrors under notes/imports/blog/).
      try {
        const ownerId =
          this._profile?.owner?.ownerId?.trim() ||
          (await this.getHumanProfile())?.ownerId?.trim();
        await syncBlogPostsToKnowledgeViaRuntime(this._fileShareContext(), ownerId);
      } catch (err) {
        console.warn(
          "[knowledge] blog→notes sync before reindex failed:",
          err instanceof Error ? err.message : err,
        );
      }

      // Sync linked Obsidian + Notion/MCP into notes/ so Rebuild embeds the full knowledge set.
      try {
        const { syncKnowledgeConnectorsForRagViaRuntime } = await import("./knowledge-hub.js");
        rag.notifyProgress({
          phase: "materialize",
          processed: 0,
          total: 0,
          indexed: 0,
          skipped: 0,
          removed: 0,
          message: "Syncing Obsidian & Notion into knowledge notes…",
        });
        const synced = await syncKnowledgeConnectorsForRagViaRuntime(this._fileShareContext());
        console.info(
          `[rag] connector sync before reindex: obsidian=${synced.obsidianImported} mcp=${synced.mcpImported}` +
            (synced.mcpError ? ` mcpError=${synced.mcpError}` : ""),
        );
        rag.notifyProgress({
          phase: "materialize",
          processed: synced.obsidianImported + synced.mcpImported,
          total: synced.obsidianImported + synced.mcpImported,
          indexed: synced.obsidianImported + synced.mcpImported,
          skipped: synced.obsidianSkipped,
          removed: 0,
          message: `Synced Obsidian ${synced.obsidianImported}, Notion/MCP ${synced.mcpImported}`,
        });
      } catch (err) {
        console.warn(
          "[rag] connector sync before reindex failed:",
          err instanceof Error ? err.message : err,
        );
      }

      await rag.refreshConfig({
        knowledgeBase: config.aiSettings?.knowledgeBase,
        modelProviders: config.modelProviders,
        envoyLocalEmbed: await this._envoyLocalEmbedOverlay(),
      });

      let skipDocumentPaths: string[] = [];
      if (this._vaultDir) {
        // Markdown-first: materialize Office/PDF → notes/imports before embedding.
        try {
          const { materializePendingExtractableDocuments } = await import("./vault-markdown-corpus.js");
          rag.notifyProgress({
            phase: "materialize",
            processed: 0,
            total: 0,
            indexed: 0,
            skipped: 0,
            removed: 0,
            message: "Converting Office/PDF to Markdown notes…",
          });
          const pending = await materializePendingExtractableDocuments(this._vaultDir, {
            profileDir: this._profileDir,
            sensitivity: "private",
          });
          skipDocumentPaths = pending.coveredSources;
          if (pending.materialized.length > 0 || pending.failed.length > 0) {
            console.info(
              `[rag] materialize before reindex: created=${pending.materialized.length} existing=${pending.skippedExisting.length} failed=${pending.failed.length}`,
            );
          }
          rag.notifyProgress({
            phase: "materialize",
            processed: pending.materialized.length + pending.skippedExisting.length,
            total: pending.materialized.length + pending.skippedExisting.length + pending.failed.length,
            indexed: pending.materialized.length,
            skipped: pending.skippedExisting.length,
            removed: 0,
            message: `Converted ${pending.materialized.length} document(s) to Markdown`,
          });
        } catch (err) {
          console.warn(
            "[rag] materialize before reindex failed:",
            err instanceof Error ? err.message : err,
          );
        }

        try {
          const vaultIndex = await buildVaultIndex(
            buildVaultIndexOptionsFromKnowledgeBase(this._vaultDir, config.aiSettings?.knowledgeBase),
          );
          await rag.reindexVault({
            vaultIndex,
            knowledgeBase: config.aiSettings?.knowledgeBase,
            force,
            skipDocumentPaths,
          });
        } catch (error) {
          console.warn(`[rag] vault reindex failed:`, error);
          throw error;
        }
      }

      try {
        await rag.backfillChatHistory(this._chatLogStore);
      } catch (error) {
        console.warn(`[rag] chat backfill after reindex failed:`, error);
      }

      return rag.getIndexStatus();
    } finally {
      releaseIdle();
    }
  }

  async testRagEmbedding(): Promise<import("@envoymesh/api").RagEmbeddingProbeResult> {
    const config = await this.getNodeConfig();
    const rag = await this._getRagService();
    if (!rag) {
      return {
        ok: false,
        error: "RAG service is unavailable on this node",
        latencyMs: 0,
      };
    }
    await rag.refreshConfig({
      knowledgeBase: config.aiSettings?.knowledgeBase,
      modelProviders: config.modelProviders,
      envoyLocalEmbed: await this._envoyLocalEmbedOverlay(),
    });
    return rag.probeEmbedding();
  }

  async testChatModel(): Promise<import("@envoymesh/api").ChatModelProbeResult> {
    const started = Date.now();
    try {
      const localStatus = await this.getEnvoyLocalStatus();
      const effective = await this.getEffectiveModelProviders();
      const usingEnvoyLocal = effective.presetId === "envoy-local";

      if (
        localStatus.enabled &&
        localStatus.running &&
        (!localStatus.endpoint?.trim() || !localStatus.activeModelId?.trim())
      ) {
        return {
          ok: false,
          mode: "envoy-local",
          endpoint: localStatus.endpoint ?? undefined,
          modelName: localStatus.activeModelId ?? undefined,
          error: "Envoy Local is running but has no active model or endpoint",
          latencyMs: Date.now() - started,
        };
      }

      const providers = buildModelProviders(effective, true);
      if (providers.length === 0) {
        return {
          ok: false,
          mode: usingEnvoyLocal ? "envoy-local" : effective.mode,
          endpoint: effective.endpoint ?? localStatus.endpoint ?? undefined,
          modelName: effective.modelName ?? localStatus.activeModelId ?? undefined,
          error:
            localStatus.enabled && !localStatus.running
              ? "No chat model available — start Envoy Local or save a cloud/Ollama provider"
              : "No chat model provider is configured",
          latencyMs: Date.now() - started,
        };
      }

      const result = await routeModelRequest(
        {
          taskType: "settings.chat_model_probe",
          prompt: "Reply with exactly one word: pong",
          sensitivity: "public",
          ownerApproved: true,
        },
        providers,
      );
      const latencyMs = Date.now() - started;
      const base = {
        mode: usingEnvoyLocal ? "envoy-local" : effective.mode,
        endpoint: effective.endpoint,
        modelName: effective.modelName,
      };
      if (result.decision.action !== "allow") {
        const decision = result.decision;
        return {
          ok: false,
          ...base,
          providerId:
            "provider" in decision ? decision.provider.providerId : undefined,
          error: decision.reason || `model route ${decision.action}`,
          latencyMs,
        };
      }
      const text = result.response?.text?.trim() ?? "";
      if (!text) {
        return {
          ok: false,
          ...base,
          providerId: result.decision.provider.providerId,
          modelName: result.response?.modelName ?? base.modelName,
          error: "chat model returned an empty response",
          latencyMs,
        };
      }
      return {
        ok: true,
        providerId: result.decision.provider.providerId,
        modelName: result.response?.modelName ?? base.modelName ?? "unknown",
        mode: base.mode,
        endpoint: base.endpoint,
        replyPreview: text.length > 120 ? `${text.slice(0, 117)}…` : text,
        latencyMs,
      };
    } catch (error) {
      const config = await this.getNodeConfig().catch(() => null);
      const mp = config?.modelProviders;
      let localHint: { mode?: string; endpoint?: string; modelName?: string } = {};
      try {
        const st = await this.getEnvoyLocalStatus();
        if (st.enabled && st.running) {
          localHint = {
            mode: "envoy-local",
            endpoint: st.endpoint ?? undefined,
            modelName: st.activeModelId ?? undefined,
          };
        }
      } catch {
        // ignore
      }
      return {
        ok: false,
        mode: localHint.mode ?? mp?.mode,
        endpoint: localHint.endpoint ?? mp?.endpoint,
        modelName: localHint.modelName ?? mp?.modelName,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - started,
      };
    }
  }

  async saveExternalMcpSearchAsNote(
    params: SaveExternalMcpSearchAsNoteParams,
  ): Promise<SaveExternalMcpSearchAsNoteResult> {
    const query = params.query?.trim();
    if (!query) return { ok: false, reason: "query_required" };

    const config = await this.getNodeConfig();
    const kb = resolveAiKnowledgeBaseSettings(config.aiSettings?.knowledgeBase);
    if (kb.externalProvider !== "mcp") {
      return { ok: false, reason: "mcp_disabled" };
    }
    if (!kb.mcpWriteBackEnabled) {
      return { ok: false, reason: "write_back_disabled" };
    }

    const { searchExternalMcpKnowledge, formatMcpResultsAsNote } = await import("@envoymesh/rag");
    const { snippets, error } = await searchExternalMcpKnowledge({
      query,
      knowledgeBase: config.aiSettings?.knowledgeBase,
    });
    if (error) return { ok: false, reason: error, snippetCount: 0 };
    if (snippets.length === 0) return { ok: false, reason: "no_results", snippetCount: 0 };

    const formatted = formatMcpResultsAsNote(snippets, {
      attribution: {
        server: kb.mcpServerUrl ?? kb.externalMcpServer ?? "mcp",
        tool: kb.mcpSearchTool?.trim() || "memex_search",
        query,
        queriedAt: new Date().toISOString(),
      },
      sensitivity: params.sensitivity ?? "private",
      title: params.title,
      subfolder: "mcp",
    });

    const note = await this.createNote({
      filename: formatted.filename,
      content: formatted.content,
      subfolder: formatted.subfolder,
      sensitivity: params.sensitivity ?? "private",
    });
    return {
      ok: true,
      relativePath: note.relativePath,
      documentId: note.documentId,
      snippetCount: snippets.length,
    };
  }

  async listExternalMcpKnowledge(
    params?: import("@envoymesh/api").ListExternalMcpKnowledgeParams,
  ): Promise<import("@envoymesh/api").ListExternalMcpKnowledgeResult> {
    const { listExternalMcpKnowledgeViaRuntime } = await import("./knowledge-hub.js");
    return listExternalMcpKnowledgeViaRuntime(this._fileShareContext(), params);
  }

  async importLinkedObsidianNotes(
    params: import("@envoymesh/api").ImportLinkedObsidianNotesParams,
  ): Promise<import("@envoymesh/api").ImportLinkedObsidianNotesResult> {
    const { importLinkedObsidianNotesViaRuntime } = await import("./knowledge-hub.js");
    const result = await importLinkedObsidianNotesViaRuntime(this._fileShareContext(), params);
    if (result.imported.length > 0) {
      try {
        await this.reindexRagKnowledge({ force: false });
      } catch {
        /* best-effort reindex */
      }
    }
    return result;
  }

  async importExternalMcpKnowledge(
    params: import("@envoymesh/api").ImportExternalMcpKnowledgeParams,
  ): Promise<import("@envoymesh/api").ImportExternalMcpKnowledgeResult> {
    const { importExternalMcpKnowledgeViaRuntime } = await import("./knowledge-hub.js");
    const result = await importExternalMcpKnowledgeViaRuntime(
      this._fileShareContext(),
      params,
      async (args) =>
        this.createNote({
          filename: args.filename,
          content: args.content,
          subfolder: args.subfolder,
          sensitivity: args.sensitivity,
        }),
    );
    if (result.imported.length > 0) {
      try {
        await this.reindexRagKnowledge({ force: false });
      } catch {
        /* best-effort */
      }
    }
    return result;
  }

  async exportNotesToLinkedObsidian(
    params: import("@envoymesh/api").ExportNotesToLinkedObsidianParams,
  ): Promise<import("@envoymesh/api").ExportNotesToLinkedObsidianResult> {
    const { exportNotesToLinkedObsidianViaRuntime } = await import("./knowledge-hub.js");
    return exportNotesToLinkedObsidianViaRuntime(this._fileShareContext(), params);
  }

  async exportNotesToMcp(
    params: import("@envoymesh/api").ExportNotesToMcpParams,
  ): Promise<import("@envoymesh/api").ExportNotesToMcpResult> {
    const { exportNotesToMcpViaRuntime } = await import("./knowledge-hub.js");
    return exportNotesToMcpViaRuntime(this._fileShareContext(), params);
  }

  /** Keep in-memory RAG embedder/config aligned after Settings saves (Tauri / Social path). */
  private async _syncRagConfigFromNodeConfig(opts?: { reindexIfEmbedderChanged?: boolean }): Promise<void> {
    if (!this._ragService) return;
    const config = await this.getNodeConfig();
    const prevKey = this._ragService.getIndexStatus().embedderModelKey;
    await this._ragService.refreshConfig({
      knowledgeBase: config.aiSettings?.knowledgeBase,
      modelProviders: config.modelProviders,
      envoyLocalEmbed: await this._envoyLocalEmbedOverlay(),
    });
    const nextKey = this._ragService.getIndexStatus().embedderModelKey;
    if (
      opts?.reindexIfEmbedderChanged &&
      prevKey &&
      nextKey &&
      prevKey !== nextKey &&
      this._vaultDir
    ) {
      try {
        const vaultIndex = await buildVaultIndex(
          buildVaultIndexOptionsFromKnowledgeBase(this._vaultDir, config.aiSettings?.knowledgeBase),
        );
        await this._ragService.reindexVault({
          vaultIndex,
          knowledgeBase: config.aiSettings?.knowledgeBase,
          force: true,
        });
        void this._ragService.backfillChatHistory(this._chatLogStore).catch((error) => {
          console.warn(`[rag] chat backfill after embedder change failed:`, error);
        });
      } catch (error) {
        console.warn(`[rag] auto-reindex after embedder change failed:`, error);
      }
    }
  }

  async verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult> {
    return verifyLibraryItemIpfsGatewayViaRuntime(this._fileShareContext(), params);
  }

  async importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult> {
    return importToLibraryViaRuntime(this._fileShareContext(), params);
  }

  async convertLibraryItemToMarkdown(
    params: ConvertLibraryItemToMarkdownParams,
  ): Promise<ConvertLibraryItemToMarkdownResult> {
    return convertLibraryItemToMarkdownViaRuntime(this._fileShareContext(), params);
  }

  async createNote(params: CreateNoteParams): Promise<CreateNoteResult> {
    const result = await createNoteViaRuntime(this._fileShareContext(), params);
    if (params.alsoPublishAsBlog) {
      try {
        const title = titleFromNoteContent(params.content, params.filename);
        const body = stripLeadingMarkdownTitle(params.content);
        await this.publishWebContentEntry({
          template: "blog-post",
          title,
          body,
          visibility: "public",
        });
      } catch (err) {
        console.warn(
          "[knowledge] alsoPublishAsBlog failed after createNote:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    try {
      const { maybeAutoExportCreatedNoteViaRuntime } = await import("./knowledge-hub.js");
      await maybeAutoExportCreatedNoteViaRuntime(this._fileShareContext(), result.relativePath);
    } catch {
      // best-effort
    }
    this.scheduleVaultRagIncrementalReindex(`createNote:${result.relativePath}`);
    return result;
  }

  async deleteVaultItem(params: DeleteVaultItemParams): Promise<void> {
    await deleteVaultItemViaRuntime(this._fileShareContext(), params);
    this.scheduleVaultRagIncrementalReindex(`delete:${params.relativePath}`);
  }

  // ----- Phase 44C — Knowledge Base Plugins -----

  private _getOrCreatePluginRegistry(): PluginRegistry {
    if (!this._pluginRegistry) {
      const profileDir = this._serviceContextDeps().fileShare.getProfileDir();
      if (!profileDir) throw new Error("plugin registry requires a profile directory");
      const registry = createPluginRegistry(profileDir);

      // Phase 44D — register built-in Obsidian plugin.
      const vaultDir = this._serviceContextDeps().fileShare.getVaultDir();
      if (vaultDir) {
        const sensitivityStore = createSensitivityOverrideStore(profileDir);
        const publishedStore = createPublishedLibraryStore(profileDir);
        const obsidian = createObsidianPlugin({
          readVaultFile: async (relativePath: string) => {
            try {
              const absolutePath = join(vaultDir, relativePath);
              // Guard: must stay inside vault dir.
              const resolved = resolve(absolutePath);
              if (!resolved.startsWith(resolve(vaultDir))) return undefined;
              return await readFile(resolved, "utf8");
            } catch {
              return undefined;
            }
          },
          onSensitivitySync: async (documentId: string, published: boolean) => {
            // Keep Library Published toggle + RAG overrides aligned with frontmatter.
            await publishedStore.setPublished(documentId, published);
            if (published) {
              await sensitivityStore.set(documentId, "public");
            } else {
              await sensitivityStore.delete(documentId);
            }
          },
        });
        registry.registerPlugin(obsidian);
      }

      // Phase 44E — register MCP knowledge plugin.
      registry.registerPlugin(createMcpKnowledgePlugin());

      this._pluginRegistry = registry;
    }
    return this._pluginRegistry;
  }

  async listKbPlugins(
    params?: ListKbPluginsParams,
  ): Promise<KbPluginInfo[]> {
    return this._getOrCreatePluginRegistry().listPlugins(params?.activeOnly);
  }

  async activateKbPlugin(
    params: ActivateKbPluginParams,
  ): Promise<{ ok: boolean; reason?: string }> {
    const registry = this._getOrCreatePluginRegistry();
    const profileDir = this._serviceContextDeps().fileShare.getProfileDir();
    const vaultDir = this._serviceContextDeps().fileShare.getVaultDir();
    const config: Record<string, unknown> = {
      ...(params.config ?? {}),
      ...(profileDir ? { profileDir } : {}),
      ...(vaultDir ? { vaultDir } : {}),
      autoSyncPublished: true,
    };
    const result = await registry.activatePlugin(params.pluginId, config);
    if (result.ok && params.pluginId === "obsidian") {
      await this._syncObsidianMetadata();
    }
    return result;
  }

  /** Collect loose MD into notes/, then rebuild Obsidian frontmatter sync + link graph. */
  private async _syncObsidianMetadata(): Promise<void> {
    const vaultDir = this._serviceContextDeps().fileShare.getVaultDir();
    if (!vaultDir) return;
    try {
      const collected = await collectVaultMarkdownIntoNotesViaRuntime(this._fileShareContext());
      const index = await buildVaultIndex({ rootDir: vaultDir });
      await this._getOrCreatePluginRegistry().runEnrichMetadata(
        index.documents.map((d) => ({
          documentId: d.documentId,
          relativePath: d.relativePath,
          title: d.title,
          extension: d.extension,
          byteLength: d.byteLength,
        })),
      );
      // Path moves invalidate RAG relativePath keys — rebuild when anything moved.
      if (needsRagReindexAfterMarkdownCollect(collected.moved)) {
        try {
          await this.reindexRagKnowledge({ force: true });
        } catch (reindexErr) {
          console.warn(
            "[kb-plugin] RAG reindex after Obsidian markdown collect failed:",
            reindexErr instanceof Error ? reindexErr.message : String(reindexErr),
          );
        }
      }
    } catch (err) {
      console.warn(
        "[kb-plugin] Obsidian activate sync failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async deactivateKbPlugin(
    params: DeactivateKbPluginParams,
  ): Promise<{ ok: boolean; reason?: string }> {
    return this._getOrCreatePluginRegistry().deactivatePlugin(params.pluginId);
  }

  async getKbPluginConfig(
    pluginId: string,
  ): Promise<Record<string, unknown>> {
    return this._getOrCreatePluginRegistry().getPluginConfig(pluginId);
  }

  async updateKbPluginConfig(
    params: UpdateKbPluginConfigParams,
  ): Promise<{ ok: boolean; reason?: string }> {
    return this._getOrCreatePluginRegistry().updatePluginConfig(params.pluginId, params.config);
  }

  async resolveLibraryItemPath(relativePath: string): Promise<{ vaultRelativePath: string; absolutePath: string }> {
    return resolveLibraryItemPathViaRuntime(this._fileShareContext(), relativePath);
  }

  async openLibraryItem(relativePath: string): Promise<void> {
    return openLibraryItemViaRuntime(this._fileShareContext(), relativePath);
  }

  async revealLibraryItemInFileManager(relativePath: string): Promise<void> {
    return revealLibraryItemInFileManagerViaRuntime(this._fileShareContext(), relativePath);
  }

  async discoverPublishedLibrary(
    params?: DiscoverPublishedLibraryParams,
  ): Promise<DiscoverPublishedLibraryPeerResult[]> {
    return discoverPublishedLibraryViaRuntime(this._fileShareNetworkContext(), params);
  }

  async libraryRead(params: LibraryReadParams): Promise<LibraryReadResult> {
    const profile = this._profile;
    const profileDir = this._profileDir;
    // Owner preview / self-browse must not go through the mesh — remote policy
    // treats the owner as a stranger (no self trust record) and returns not_found
    // for bonded/private paths.
    if (
      profile &&
      profileDir &&
      profileDir !== "/tmp/unknown" &&
      params.targetOwnerId.trim() === profile.owner.ownerId.trim()
    ) {
      const started = Date.now();
      const senderPeerId = derivePeerId(profile.device.publicKeyPem);
      const unsigned = createUnsignedEnvelope({
        senderPeerId,
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: senderPeerId,
        recipientRole: "human",
        intent: "library.read",
        payload: createLibraryReadPayload({
          requesterOwnerId: profile.owner.ownerId,
          targetOwnerId: params.targetOwnerId,
          path: params.path,
          range: params.range,
          ifNoneMatch: params.ifNoneMatch,
        }),
        correlationId: randomUUID(),
      });
      const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
      if (!this._taskStore) {
        return {
          peerOwnerId: params.targetOwnerId,
          libp2pPeerId: "",
          status: "not_found",
          latencyMs: Date.now() - started,
          error: "task store not initialized",
        };
      }
      const result = await handleInboundLibraryRead({
        envelope,
        remotePeerId: senderPeerId,
        receivedAt: started,
        correlationId: envelope.correlationId,
        taskStore: this._taskStore,
        trustStore: this._trustStore,
        peerDirectoryStore: this._peerDirectoryStore,
        profile,
        profileDir,
        isLocalSelfRead: true,
      });
      const latencyMs = Date.now() - started;
      if (!result.ok) {
        return {
          peerOwnerId: params.targetOwnerId,
          libp2pPeerId: "",
          status: "not_found",
          latencyMs,
          error: result.reason,
        };
      }
      const resp = result.responsePayload;
      return {
        peerOwnerId: params.targetOwnerId,
        libp2pPeerId: "",
        status: resp.status,
        body: resp.body,
        contentType: resp.contentType,
        contentHash: resp.contentHash,
        byteLength: resp.byteLength,
        etag: resp.etag,
        range: resp.range,
        publicRedirection: resp.publicRedirection,
        latencyMs,
      };
    }
    return libraryReadViaRuntime(this._fileShareNetworkContext(), params);
  }

  async publishWebContentEntry(
    params: PublishWebContentParams,
  ): Promise<PublishWebContentResult> {
    if (this._profileDir === "/tmp/unknown") {
      throw new Error("publishWebContentEntry: node profile not initialized");
    }
    const ownerId =
      this._profile?.owner?.ownerId?.trim() ||
      (await this.getHumanProfile())?.ownerId?.trim();
    if (!ownerId) {
      throw new Error("publishWebContentEntry: owner identity required");
    }
    // Keep shells present so Blog / PhotoWall shortcuts never 404 after first publish.
    await this.ensureDefaultWebSite().catch((err) => {
      console.warn(
        "[web] ensureDefaultWebSite before publish failed:",
        err instanceof Error ? err.message : err,
      );
    });
    const result = await publishWebContentEntryAuthor(this._profileDir, {
      ...params,
      ownerId,
    });
    if (params.template === "blog-post" && this._vaultDir) {
      try {
        const webPath = join(this._profileDir, "web", result.path);
        const markdown = await readFile(webPath, "utf8");
        const { materializeBlogPostToNotes } = await import("./vault-markdown-corpus.js");
        await materializeBlogPostToNotes(this._vaultDir, {
          webRelativePath: result.path,
          title: result.title,
          markdown,
          profileDir: this._profileDir,
          sensitivity: "private",
        });
      } catch (err) {
        console.warn(
          "[knowledge] blog→notes materialize failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    void this._fanOutFeedNotifyAfterPublish(result, params).catch((err) =>
      console.warn(
        "[feed.notify] fan-out failed:",
        err instanceof Error ? err.message : err,
      ),
    );
    return result;
  }

  async ensureDefaultWebSite(): Promise<import("@envoymesh/api").EnsureDefaultWebSiteResult> {
    if (this._profileDir === "/tmp/unknown") {
      throw new Error("ensureDefaultWebSite: node profile not initialized");
    }
    const human = await this.getHumanProfile();
    const ownerId =
      this._profile?.owner?.ownerId?.trim() || human?.ownerId?.trim();
    if (!ownerId) {
      throw new Error("ensureDefaultWebSite: owner identity required");
    }
    const result = await ensureDefaultWebSiteAuthor(this._profileDir, {
      ownerId,
      displayName: human?.displayName,
      visibility: "bonded",
    });
    // Always refresh the HTML portal from the signed human profile so Profile
    // editing (bio, gallery, avatar) shows up even when index.html was seeded empty.
    if (human) {
      await this._republishProfilePortal(human);
    }
    return result;
  }

  async listWebContentSections(): Promise<import("@envoymesh/api").WebContentSectionSummary[]> {
    if (this._profileDir === "/tmp/unknown") return [];
    const human = await this.getHumanProfile();
    const ownerId =
      this._profile?.owner?.ownerId?.trim() || human?.ownerId?.trim();
    if (!ownerId) return [];
    return listWebContentSectionsAuthor(this._profileDir, ownerId);
  }

  async listFeedPosts(): Promise<import("@envoymesh/api").FeedPostSummary[]> {
    if (this._profileDir === "/tmp/unknown") return [];
    const human = await this.getHumanProfile();
    const ownerId =
      this._profile?.owner?.ownerId?.trim() || human?.ownerId?.trim();
    if (!ownerId) {
      throw new Error("listFeedPosts: owner identity not ready");
    }
    return listFeedPostsAuthor(this._profileDir, ownerId);
  }

  async listFeedTimeline(
    params?: import("@envoymesh/api").ListFeedTimelineParams,
  ): Promise<import("@envoymesh/api").ListFeedTimelineResult> {
    if (this._profileDir === "/tmp/unknown") {
      return { items: [], hasMore: false };
    }
    const human = await this.getHumanProfile();
    const ownerId =
      this._profile?.owner?.ownerId?.trim() || human?.ownerId?.trim();
    if (!ownerId) {
      throw new Error("listFeedTimeline: owner identity not ready");
    }
    const bonds = await this.getBonds();
    const page = await listFeedTimelineMerged({
      profileDir: this._profileDir,
      ownerId,
      bonds,
      params,
    });
    // Existing bonds: seed peer Feed if we have no local rows yet (push-only notify).
    scheduleFeedBackfillForMissingPeers({
      profileDir: this._profileDir,
      bondedOwnerIds: bonds
        .filter((b) => b.level === "direct" || b.level === "referred")
        .map((b) => b.peerOwnerId),
      libraryRead: (p) => this.libraryRead(p),
      emit: (item) => this.storeFeedNotification(item),
    });
    return page;
  }

  async listBlogPosts(): Promise<import("@envoymesh/api").BlogPostSummary[]> {
    if (this._profileDir === "/tmp/unknown") return [];
    const human = await this.getHumanProfile();
    const ownerId =
      this._profile?.owner?.ownerId?.trim() || human?.ownerId?.trim();
    if (!ownerId) return [];
    return listBlogPostsAuthor(this._profileDir, ownerId);
  }

  async deleteWebContentEntry(
    params: import("@envoymesh/api").DeleteWebContentParams,
  ): Promise<import("@envoymesh/api").DeleteWebContentResult> {
    if (this._profileDir === "/tmp/unknown") {
      throw new Error("deleteWebContentEntry: node profile not initialized");
    }
    const human = await this.getHumanProfile();
    const ownerId =
      params.ownerId?.trim() ||
      this._profile?.owner?.ownerId?.trim() ||
      human?.ownerId?.trim();
    return deleteWebContentEntryAuthor(this._profileDir, {
      ...params,
      ...(ownerId ? { ownerId } : {}),
    });
  }

  private async _fanOutFeedNotifyAfterPublish(
    result: PublishWebContentResult,
    params: PublishWebContentParams,
  ): Promise<void> {
    const mesh = this._reachableMesh();
    const profile = this._profile;
    if (!mesh || !profile) return;
    if (result.visibility === "private") return;

    const bonds = await this.getBonds();
    const peerProfiles = await this.listPeerProfiles().catch(() => []);
    const interestsByOwner = new Map<string, string[]>();
    for (const peer of peerProfiles) {
      const interests = [
        ...(peer.profile?.hobbies ?? []),
        ...(peer.profile?.knowledge ?? []),
      ];
      if (peer.ownerId) interestsByOwner.set(peer.ownerId, interests);
    }

    const meta: FeedNotifyPublishMeta = {
      publisherOwnerId: profile.owner.ownerId,
      publishedAt: result.publishedAt,
      title: result.title,
      url: result.url,
      kind:
        params.template === "blog-post"
          ? "article"
          : params.template === "note"
            ? "note"
            : params.template === "profile"
              ? "profile"
              : params.template === "photo"
                ? "photo"
                : params.template === "section"
                  ? "section"
                  : params.template === "feed-post"
                    ? "feed"
                    : "file",
      visibility: result.visibility,
      summary: params.body ? params.body.trim().slice(0, 280) : result.title,
      // Feed posts deliberately omit tags so interest filtering never hides Moments.
      tags: params.template === "feed-post" ? undefined : (result.tags ?? params.tags),
      contentHash: result.contentHash,
      listingUrl: result.listingUrl,
      contactIds: params.contactIds,
      imageUrls: result.imageUrls,
    };

    const deliver = await sendFeedNotifyToBonds({
      mesh,
      profile,
      meta,
      bonds: bonds.map((b) => ({ peerOwnerId: b.peerOwnerId, level: b.level })),
      recipientInterestsByOwnerId: interestsByOwner,
      resolveLibp2pPeer: async (bondOwnerId) => {
        const resolved = await this._resolveLibp2pPeerForBondOwner(bondOwnerId);
        if (!resolved) return undefined;
        return { peerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
      },
      dialHintsFor: (peerId, listenAddrs) => this._dialHintsForChat(peerId, listenAddrs),
      tagReachability: (peerId) => {
        void this._tagBondedContactReachability(peerId);
      },
    });

    // Clear prior outbox rows that succeeded this round (avoids warm flush re-send).
    for (const ownerId of deliver.sentOwnerIds) {
      try {
        await removeFeedNotifyOutboxItem(this._profileDir, ownerId, meta.url);
      } catch (err) {
        console.warn(
          `[feed.notify] outbox clear failed for ${ownerId.slice(0, 16)}…:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    for (const ownerId of deliver.missedOwnerIds) {
      try {
        await enqueueFeedNotifyOutboxItem(this._profileDir, {
          recipientOwnerId: ownerId,
          url: meta.url,
          meta,
        });
      } catch (err) {
        console.warn(
          `[feed.notify] outbox enqueue failed for ${ownerId.slice(0, 16)}…:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  /** Retry undelivered feed.notify for one bond (used by warm / online flush). */
  private async _flushFeedNotifyOutboxForOwner(ownerId: string): Promise<void> {
    if (this._profileDir === "/tmp/unknown") return;
    const mesh = this._reachableMesh();
    const profile = this._profile;
    if (!mesh || !profile) return;
    const trimmed = ownerId.trim();
    if (!trimmed) return;

    const pending = await listFeedNotifyOutboxForRecipient(this._profileDir, trimmed);
    if (pending.length === 0) return;

    for (const row of pending) {
      const result = await sendFeedNotifyToOwner({
        mesh,
        profile,
        meta: row.meta,
        recipientOwnerId: trimmed,
        resolveLibp2pPeer: async (bondOwnerId) => {
          const resolved = await this._resolveLibp2pPeerForBondOwner(bondOwnerId);
          if (!resolved) return undefined;
          return { peerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
        },
        dialHintsFor: (peerId, listenAddrs) => this._dialHintsForChat(peerId, listenAddrs),
        tagReachability: (peerId) => {
          void this._tagBondedContactReachability(peerId);
        },
      });
      if (result.ok) {
        await removeFeedNotifyOutboxItem(this._profileDir, trimmed, row.url);
      } else {
        console.warn(
          `[feed.notify] outbox flush miss ${trimmed.slice(0, 16)}… ${row.url.slice(0, 40)}: ${result.reason}`,
        );
      }
    }
  }

  /** Best-effort: deliver all pending outbox rows (peer may still be offline). */
  private async _flushFeedNotifyOutbox(): Promise<void> {
    if (this._profileDir === "/tmp/unknown") return;
    await compactFeedNotifyOutbox(this._profileDir);
    const rows = await loadFeedNotifyOutbox(this._profileDir);
    if (rows.length === 0) return;
    const owners = [...new Set(rows.map((r) => r.recipientOwnerId))];
    for (const ownerId of owners) {
      await this._flushFeedNotifyOutboxForOwner(ownerId);
    }
  }

  async listFeedNotifications(): Promise<FeedNotification[]> {
    if (this._profileDir === "/tmp/unknown") return [];
    // Newest slice for Inbox / Feed; full history is listFeedTimeline.
    return listFeedNotifyRecent(this._profileDir);
  }

  async dismissFeedNotification(id: string): Promise<void> {
    if (this._profileDir === "/tmp/unknown") return;
    await dismissFeedNotifyInboxItem(this._profileDir, id);
  }

  async dismissAllFeedNotifications(): Promise<void> {
    if (this._profileDir === "/tmp/unknown") return;
    await dismissAllFeedNotifyInboxItems(this._profileDir);
  }

  /** Persist inbound content engagement and emit WS/event (called from mesh inbound). */
  storeContentEngageNotification(item: ContentEngageNotification): void {
    this.emit("content:engage", item);
  }

  /** Notify UIs that engagement for a URL changed (e.g. author snapshot applied). No badge. */
  emitContentEngagementUpdated(url: string): void {
    const trimmed = url.trim();
    if (!trimmed) return;
    const surface = surfaceForContentUrl(trimmed) ?? "feed";
    this.emit("content:engage", {
      id: `snap:${trimmed}:${Date.now()}`,
      receivedAt: new Date().toISOString(),
      messageId: `snap:${trimmed}:${Date.now()}`,
      url: trimmed,
      surface,
      action: "snapshot",
      actorOwnerId: "",
      senderPeerId: "",
    });
  }

  async listContentEngageNotifications(): Promise<ContentEngageNotification[]> {
    if (this._profileDir === "/tmp/unknown") return [];
    return loadContentEngageInbox(this._profileDir);
  }

  async dismissContentEngageNotifications(
    params?: DismissContentEngageNotificationsParams,
  ): Promise<void> {
    if (this._profileDir === "/tmp/unknown") return;
    const surface = params?.surface ?? "all";
    await dismissContentEngageInbox(this._profileDir, surface);
  }

  /** Persist inbound feed.notify and emit WS/event (called from mesh inbound). */
  storeFeedNotification(item: FeedNotification): void {
    this.emit("feed:notify", item);
  }

  private _contentOwnerIdFromUrl(url: string): string | undefined {
    const m = /^envoy:\/\/(envoy:owner:[^/]+)\//.exec(url.trim());
    return m?.[1];
  }

  private async _requireBondForRemoteEngage(ownerId: string): Promise<void> {
    const trust = await this._trustStore.getTrustRecord(ownerId);
    const level = trust?.level ?? "public";
    if (level !== "direct" && level !== "referred") {
      throw new Error("Like/comment requires a referred or direct bond with the post author");
    }
  }

  private async _sendEngageToContentOwner(input: {
    url: string;
    action: "star" | "unstar" | "comment" | "uncomment" | "get";
    text?: string;
    commentId?: string;
    correlationId?: string;
  }): Promise<boolean> {
    const targetOwnerId = this._contentOwnerIdFromUrl(input.url);
    const profile = this._requireProfile();
    // Tauri/Social binds the mesh via _externalMesh — same as chat / feed.notify.
    const mesh = this._reachableMesh();
    if (!targetOwnerId || !mesh || targetOwnerId === profile.owner.ownerId) return false;
    const result = await sendFeedEngageToOwner({
      mesh,
      profile,
      action: input.action,
      url: input.url,
      text: input.text,
      commentId: input.commentId,
      actorOwnerId: profile.owner.ownerId,
      targetOwnerId,
      correlationId: input.correlationId,
      resolveLibp2pPeer: async (bondOwnerId) => {
        const resolved = await this._resolveLibp2pPeerForBondOwner(bondOwnerId);
        if (!resolved) return undefined;
        return { peerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
      },
      dialHintsFor: (peerId, listenAddrs) => this._dialHintsForChat(peerId, listenAddrs),
      tagReachability: (peerId) => {
        void this._tagBondedContactReachability(peerId);
      },
    });
    return result.sent;
  }

  /** Persist + retry later when author is unreachable (like feed.notify outbox). */
  private async _enqueueEngageOutbox(input: {
    targetOwnerId: string;
    url: string;
    action: "star" | "unstar" | "comment" | "uncomment";
    text?: string;
    commentId?: string;
  }): Promise<void> {
    const profile = this._profile;
    if (!profile || this._profileDir === "/tmp/unknown") return;
    try {
      await enqueueFeedEngageOutboxItem(this._profileDir, {
        targetOwnerId: input.targetOwnerId,
        url: input.url,
        action: input.action,
        actorOwnerId: profile.owner.ownerId,
        text: input.text,
        commentId: input.commentId,
      });
    } catch (err) {
      console.warn(
        "[feed.engage] outbox enqueue failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  private async _flushFeedEngageOutboxForOwner(ownerId: string): Promise<void> {
    if (this._profileDir === "/tmp/unknown") return;
    const mesh = this._reachableMesh();
    const profile = this._profile;
    if (!mesh || !profile) return;
    const trimmed = ownerId.trim();
    if (!trimmed) return;

    const pending = await listFeedEngageOutboxForRecipient(this._profileDir, trimmed);
    if (pending.length === 0) return;

    for (const row of pending) {
      const result = await sendFeedEngageToOwner({
        mesh,
        profile,
        action: row.action,
        url: row.url,
        text: row.text,
        commentId: row.commentId,
        actorOwnerId: row.actorOwnerId,
        targetOwnerId: trimmed,
        resolveLibp2pPeer: async (bondOwnerId) => {
          const resolved = await this._resolveLibp2pPeerForBondOwner(bondOwnerId);
          if (!resolved) return undefined;
          return { peerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
        },
        dialHintsFor: (peerId, listenAddrs) => this._dialHintsForChat(peerId, listenAddrs),
        tagReachability: (peerId) => {
          void this._tagBondedContactReachability(peerId);
        },
      });
      if (result.sent) {
        await removeFeedEngageOutboxItem(this._profileDir, row);
      } else {
        console.warn(
          `[feed.engage] outbox flush miss ${trimmed.slice(0, 16)}… ${row.action} ${row.url.slice(0, 40)}`,
        );
      }
    }
  }

  private async _flushFeedEngageOutbox(): Promise<void> {
    if (this._profileDir === "/tmp/unknown") return;
    await compactFeedEngageOutbox(this._profileDir);
    const rows = await loadFeedEngageOutbox(this._profileDir);
    if (rows.length === 0) return;
    const owners = [...new Set(rows.map((r) => r.targetOwnerId))];
    for (const ownerId of owners) {
      await this._flushFeedEngageOutboxForOwner(ownerId);
    }
  }

  async getContentEngagement(params: GetContentEngagementParams): Promise<ContentEngagementSummary> {
    const url = params.url?.trim() ?? "";
    if (!url) throw new Error("getContentEngagement: url required");
    if (this._profileDir === "/tmp/unknown") {
      return {
        url,
        starCount: 0,
        starredByMe: false,
        starOwnerIds: [],
        commentCount: 0,
        comments: [],
      };
    }
    const profile = this._requireProfile();
    const ownerId = this._contentOwnerIdFromUrl(url);
    if (ownerId && ownerId !== profile.owner.ownerId) {
      // Best-effort pull; fall back to local mirror (UI also refreshes on snapshot).
      await this._sendEngageToContentOwner({ url, action: "get" });
    }
    const record = await loadContentEngagement(this._profileDir, url);
    return summarizeEngagement(record, profile.owner.ownerId);
  }

  async toggleContentStar(params: ToggleContentStarParams): Promise<ContentEngagementSummary> {
    const url = params.url?.trim() ?? "";
    if (!url) throw new Error("toggleContentStar: url required");
    if (this._profileDir === "/tmp/unknown") {
      throw new Error("toggleContentStar: profile directory not configured");
    }
    const profile = this._requireProfile();
    const me = profile.owner.ownerId;
    const ownerId = this._contentOwnerIdFromUrl(url);
    if (ownerId && ownerId !== me) {
      await this._requireBondForRemoteEngage(ownerId);
    }
    const record = await toggleContentStarInStore(this._profileDir, url, me);
    const starred = record.stars.includes(me);
    if (ownerId && ownerId !== me) {
      const sent = await this._sendEngageToContentOwner({
        url,
        action: starred ? "star" : "unstar",
      });
      if (!sent) {
        // Keep local optimism; retry when the author is reachable again.
        await this._enqueueEngageOutbox({
          targetOwnerId: ownerId,
          url,
          action: starred ? "star" : "unstar",
        });
      }
    }
    return summarizeEngagement(await loadContentEngagement(this._profileDir, url), me);
  }

  async addContentComment(params: AddContentCommentParams): Promise<ContentEngagementSummary> {
    const url = params.url?.trim() ?? "";
    const text = params.text?.trim() ?? "";
    if (!url) throw new Error("addContentComment: url required");
    if (!text) throw new Error("addContentComment: text required");
    if (this._profileDir === "/tmp/unknown") {
      throw new Error("addContentComment: profile directory not configured");
    }
    const profile = this._requireProfile();
    const me = profile.owner.ownerId;
    const ownerId = this._contentOwnerIdFromUrl(url);
    if (ownerId && ownerId !== me) {
      await this._requireBondForRemoteEngage(ownerId);
    }
    const commentId = randomUUID();
    const record = await addContentCommentInStore(this._profileDir, url, me, text, commentId);
    if (ownerId && ownerId !== me) {
      const sent = await this._sendEngageToContentOwner({
        url,
        action: "comment",
        text,
        commentId,
      });
      if (!sent) {
        await this._enqueueEngageOutbox({
          targetOwnerId: ownerId,
          url,
          action: "comment",
          text,
          commentId,
        });
      }
    }
    return summarizeEngagement(record, me);
  }

  async removeContentComment(params: RemoveContentCommentParams): Promise<ContentEngagementSummary> {
    const url = params.url?.trim() ?? "";
    const commentId = params.commentId?.trim() ?? "";
    if (!url) throw new Error("removeContentComment: url required");
    if (!commentId) throw new Error("removeContentComment: commentId required");
    if (this._profileDir === "/tmp/unknown") {
      throw new Error("removeContentComment: profile directory not configured");
    }
    const profile = this._requireProfile();
    const me = profile.owner.ownerId;
    const postAuthorOwnerId = this._contentOwnerIdFromUrl(url);
    if (!postAuthorOwnerId) {
      throw new Error("removeContentComment: could not resolve post author from url");
    }
    // Enforce: comment author OR post author only (store checks both).
    const record = await removeContentCommentInStore(
      this._profileDir,
      url,
      me,
      commentId,
      postAuthorOwnerId,
    );
    if (postAuthorOwnerId !== me) {
      await this._requireBondForRemoteEngage(postAuthorOwnerId);
      const sent = await this._sendEngageToContentOwner({ url, action: "uncomment", commentId });
      if (!sent) {
        await this._enqueueEngageOutbox({
          targetOwnerId: postAuthorOwnerId,
          url,
          action: "uncomment",
          commentId,
        });
      }
    }
    return summarizeEngagement(record, me);
  }

  async listAgentShareProposals(): Promise<AgentShareProposal[]> {
    return listAgentShareProposalsViaRuntime(this._fileShareContext());
  }

  async dismissAgentShareProposal(proposalId: string): Promise<void> {
    return dismissAgentShareProposalViaRuntime(this._fileShareContext(), proposalId);
  }

  async submitAgentShareProposal(params: SubmitAgentShareProposalParams): Promise<AgentShareProposal> {
    return submitAgentShareProposalViaRuntime(this._fileShareContext(), params);
  }

  

  async listPendingShareOffers(): Promise<ShareOffer[]> {
    return listPendingShareOffersViaRuntime(this._transferInboundContext());
  }

  async shareFile(
    targetOwnerId: string,
    file: {
      path: string;
      sensitivity: "public" | "friends" | "private";
      deliveryChannel?: "inbox" | "chat" | "agent";
    },
  ): Promise<void> {
    await shareFileViaRuntime(this._fileShareNetworkContext(), targetOwnerId, file);
  }

  /**
   * Request a file from a bonded peer's vault (pull share - `fileOrigin: responder`).
   */
  async requestShareFromLibrary(
    targetOwnerId: string,
    file: {
      relativePath: string;
      sensitivity: "public" | "friends" | "private";
      correlationId?: string;
    },
  ): Promise<{ shareRequestMessageId: string }> {
    return requestShareFromLibraryViaRuntime(this._fileShareNetworkContext(), targetOwnerId, file);
  }

  /** Auto-accept chat-channel file shares from bonded contacts (skip Inbox). */
  async maybeAutoAcceptChatShare(input: {
    shareId: string;
    senderOwnerId?: string;
    senderRelativePath: string;
    requiresApproval: boolean;
  }): Promise<void> {
    return maybeAutoAcceptChatShareViaRuntime(
      this._transferInboundContext(),
      input,
      (shareId, savePath) => this.acceptShare(shareId, savePath),
    );
  }

  async acceptShare(shareId: string, savePath: string): Promise<void> {
    return acceptShareViaRuntime(this._transferInboundContext(), shareId, savePath);
  }

  async declineShare(shareId: string): Promise<void> {
    return declineShareViaRuntime(this._transferInboundContext(), shareId);
  }

  // ============================================
  // Node Configuration
  // ============================================

  async getNodeConfig(): Promise<NodeConfig> {
    await this._ensureFamilyOwnerMigrated();
    await this._ensureEmbeddingSettingsMigrated();
    const config = await getNodeConfigViaRuntime(this._nodeConfigContext());
    const profiles = this._familyProfileStore
      ? (await this._familyProfileStore.list()).map(toFamilyProfile)
      : [];
    const caller = getRpcCaller();
    const callerProfileId = caller?.profileId ?? OWNER_FAMILY_PROFILE_ID;
    const callerIsOwner =
      caller != null ? caller.isOwnerProfile : callerProfileId === OWNER_FAMILY_PROFILE_ID;
    // Phase 51 — each family profile only sees its own bots. Never fall through
    // to node-config.aiBots for Mom/Dad (that leaked owner bots like "Luna").
    let aiBots: import("@envoymesh/api").AiBotDefinition[] = [];
    if (this._familyProfileStore) {
      const profile = await this._familyProfileStore.get(callerProfileId);
      if (Array.isArray(profile?.aiBots)) {
        aiBots = profile.aiBots as import("@envoymesh/api").AiBotDefinition[];
      } else if (callerIsOwner && callerProfileId === OWNER_FAMILY_PROFILE_ID) {
        // Owner migration fallback before profile.aiBots is populated.
        aiBots = config.aiBots ?? [];
      }
    } else if (callerIsOwner) {
      aiBots = config.aiBots ?? [];
    }
    // Never expose other family members' (or the owner's) bot defs on a
    // non-owner session — EnvoyGo once synced those into Mom/Dad chat lists.
    const familyProfiles = callerIsOwner
      ? profiles
      : profiles.map((p) =>
          p.id === callerProfileId ? p : { ...p, aiBots: undefined },
        );
    const enriched: NodeConfig = {
      ...config,
      aiBots,
      familyProfiles,
      callerFamilyProfileId: caller?.profileId,
      callerIsOwnerProfile: caller ? caller.isOwnerProfile : true,
    };
    this._refreshAgentNetworkWorkerEngineCache({
      agentNetworkWorkerEngine: config.agentNetworkWorkerEngine,
      bridgeEnabled: config.bridgeEnabled,
    });
    return redactNodeConfigForCaller(enriched as unknown as Record<string, unknown>, caller) as unknown as NodeConfig;
  }


  async runCapabilityDiscovery(params?: { find?: boolean }): Promise<void> {
    this._assertOnline();
    const config = (await this._configStore.load())!;
    const discoveryProfile = config.discoveryProfile;
    const runtime = resolveConnectivityRuntime({
      profile: discoveryProfile,
      enableMdns: config.enableMdns,
      tuning: {
        connectivityMode: config.connectivityMode,
        maxConnections: config.maxConnections,
        mdnsIntervalMs: config.mdnsIntervalMs,
        capabilityDiscoveryIntervalMs: config.capabilityDiscoveryIntervalMs,
        lazyCapabilityDiscovery: config.lazyCapabilityDiscovery,
        idleTimerStretch: config.idleTimerStretch,
      },
    });
    // Delegate to the shared cycle so on-demand search also mirrors
    // capability/publish topics into the relay roster (and picks up
    // web-content publish tags the same way as the periodic scheduler).
    await runCapabilityDiscoveryCycleViaRuntime(
      this._capabilityDiscoveryContext(),
      "on-demand",
      {
        connectivityRuntime: runtime,
        runFind: params?.find !== false,
      },
    );
    recordMeshActivity();
  }

  async updateNodeConfig(config: Partial<NodeConfig>): Promise<void> {
    requireOwnerProfile("change node settings");
    const { nodePatch, extPatch } = extractExtAgentSettingsPatch(
      config as Record<string, unknown>,
    );
    const hasExtPatch = Object.keys(extPatch).length > 0;
    const hasNodePatch = Object.keys(nodePatch).length > 0;
    // Compare against live/disk state so Social/EnvoyGo resending listenPort
    // (unchanged) on Ext Agent switch does not force a full HTTP rebind.
    const snap = this.getBridgeStatusSnapshot();
    const diskBridge =
      hasExtPatch ||
      Object.prototype.hasOwnProperty.call(nodePatch, "bridgeEnabled")
        ? await loadBridgeConfigFromProfile(this._profileDir)
        : null;
    const rebindDecision = shouldRebindAgentBridge({
      nodePatch,
      extPatch,
      previous: {
        bridgeEnabled: snap?.enabled === true,
        listenPort: snap?.listenPort ?? diskBridge?.listenPort ?? 3031,
        secret: diskBridge?.secret,
      },
    });
    const needsBridgeRebind = rebindDecision.needed;

    if (hasExtPatch) {
      const bridgeCfg = await applyExtAgentSettingsPatch(this._profileDir, extPatch);
      if (!needsBridgeRebind) {
        // Ext Agent URL/name only — hot-swap without rebinding HTTP.
        this._refreshBridgeStatusFromConfig(bridgeCfg);
      }
    }
    if (hasNodePatch) {
      const joinToggled = Object.prototype.hasOwnProperty.call(nodePatch, "capabilityProviderEnabled");
      const profilePatched = Object.prototype.hasOwnProperty.call(nodePatch, "agentNetworkProfile");
      const lanPatched =
        Object.prototype.hasOwnProperty.call(nodePatch, "lanAutoBondEnabled") ||
        Object.prototype.hasOwnProperty.call(nodePatch, "lanAutoBondFleetToken") ||
        Object.prototype.hasOwnProperty.call(nodePatch, "lanAutoBondAutoJoinAgentNetwork");
      if (joinToggled || lanPatched || profilePatched) {
        anLog("config", "updateNodeConfig agent-network related", {
          joinToggled,
          joinValue:
            joinToggled
              ? (nodePatch as Partial<NodeConfig>).capabilityProviderEnabled === true
              : undefined,
          lanPatched,
          lanEnabled: (nodePatch as Partial<NodeConfig>).lanAutoBondEnabled,
          lanAutoJoin: (nodePatch as Partial<NodeConfig>).lanAutoBondAutoJoinAgentNetwork,
          profilePatched,
        });
      }
      await updateNodeConfigViaRuntime(this._nodeConfigContext(), nodePatch as Partial<NodeConfig>);
      try {
        const persisted = await this._configStore.load();
        if (persisted) {
          this._refreshAgentNetworkWorkerEngineCache({
            agentNetworkWorkerEngine: persisted.agentNetworkWorkerEngine,
            bridgeEnabled: persisted.bridgeEnabled,
          });
        } else if (
          Object.prototype.hasOwnProperty.call(nodePatch, "agentNetworkWorkerEngine") ||
          Object.prototype.hasOwnProperty.call(nodePatch, "bridgeEnabled")
        ) {
          this._refreshAgentNetworkWorkerEngineCache(nodePatch as Partial<NodeConfig>);
        }
        // Office LAN / LAN auto-bond often flips on after peers are already
        // connected. Discovery probe cooldown would otherwise delay bonding
        // until the next successful probe cycle — refresh LAN candidates and
        // kick connected peers now. Also start the periodic LAN sweep
        // (libp2p only emits peer:discovery once per peer).
        void this._syncLanDiscoverySweep("config-update");
        if (lanPatched && persisted?.lanAutoBondEnabled === true) {
          void this.refreshNearbyDiscovery()
            .then(() => this._kickLanAutoBondForConnectedPeers("config-enable-or-token"))
            .catch((err) => {
              anWarn("lan-discovery", "refresh on Office LAN enable failed", {
                error: err instanceof Error ? err.message : String(err),
              });
              void this._kickLanAutoBondForConnectedPeers("config-enable-or-token");
            });
        }
        if (
          Object.prototype.hasOwnProperty.call(nodePatch, "discoveryProfile") &&
          persisted?.discoveryProfile === "lan-fast"
        ) {
          anLog("lan-discovery", "lan-fast profile saved — restart node for faster mDNS interval", {
            note: "mdns interval is fixed at mesh create; sweep covers rediscovery without restart",
          });
        }
      } catch {
        /* keep previous cache */
      }
      // Phase 51B — keep owner profile aiBots in sync when node-config is updated.
      if (
        Array.isArray((nodePatch as Partial<NodeConfig>).aiBots) &&
        this._familyProfileStore
      ) {
        try {
          await this._ensureFamilyOwnerMigrated();
          await this._familyProfileStore.update({
            id: OWNER_FAMILY_PROFILE_ID,
            aiBots: (nodePatch as Partial<NodeConfig>).aiBots,
          });
        } catch (err) {
          console.warn("[family] sync aiBots to owner profile failed:", err);
        }
      }
      // Join Agent Network changes what our card advertises; refresh pulls peers'
      // cards and (when joining) pushes ours so both sides see agent-network-worker.
      if (joinToggled) {
        anLog("join", "Join Agent Network toggled — scheduling refresh", {
          enabled: (nodePatch as Partial<NodeConfig>).capabilityProviderEnabled === true,
        });
        this._trackAgentNetworkRefresh(
          this.refreshAgentNetworkWorkers().catch((err) => {
            anWarn("join", "refresh after Join toggle failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          }),
        );
      } else if (profilePatched) {
        // Worker profile (skills, freshness, …) is on the Agent Card — push so
        // bonded peers update without waiting for a manual Refresh on their side.
        try {
          const cfg = await this.getNodeConfig();
          if (cfg.capabilityProviderEnabled === true) {
            anLog("profile", "worker profile saved — schedule announce");
            this._scheduleAnnounceLocalAgentCard("worker-profile");
          }
        } catch (err) {
          anWarn("profile", "schedule announce after profile save failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    if (needsBridgeRebind) {
      try {
        await this._bridgeRebindHandler?.(rebindDecision.reasons.join("+") || "bridge");
      } catch (err) {
        console.warn(
          "[bridge] rebind failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    // Cloud / Ollama take priority at inference; Local may keep running as
    // offline fallback (maybeDisable is a no-op coexistence helper).
    if (Object.prototype.hasOwnProperty.call(nodePatch, "modelProviders")) {
      try {
        await maybeDisableEnvoyLocalForExternalProvider(
          this._envoyLocalState,
          this._envoyLocalRuntimeDeps(),
          (nodePatch as Partial<NodeConfig>).modelProviders,
        );
      } catch (err) {
        console.warn(
          "[envoy-local] auto-disable after model provider save failed:",
          err instanceof Error ? err.message : err,
        );
      }
      // Rewrite OpenClaw gateway model section so a newly saved cloud
      // provider wins immediately (even if Envoy Local is still running).
      void this.reloadOpenClawConfig().catch((err) => {
        console.warn(
          "[openclaw] reload after modelProviders save failed:",
          err instanceof Error ? err.message : err,
        );
      });
    }
    if (
      Object.prototype.hasOwnProperty.call(nodePatch, "modelProviders") ||
      Object.prototype.hasOwnProperty.call(nodePatch, "aiSettings")
    ) {
      void this._syncRagConfigFromNodeConfig({ reindexIfEmbedderChanged: true }).catch((err) => {
        console.warn(
          "[rag] sync after config save failed:",
          err instanceof Error ? err.message : err,
        );
      });
    }
    // Sync the runtime relay-public-WS-URL with the persisted config so
    // the user's preference takes effect immediately. `setRelayPublicWsUrl`
    // distinguishes three cases:
    //   - `undefined` (no key in patch) — leave runtime value untouched
    //   - `""` (empty string) — explicit "disabled" → clear runtime value
    //     so `getPairingPayload` falls back to LAN discovery
    //   - non-empty string — explicit URL → set runtime value
    if (Object.prototype.hasOwnProperty.call(config, "relayPublicWsUrl")) {
      this.setRelayPublicWsUrl(config.relayPublicWsUrl);
    }
    // Bidirectional sync: notify subscribers (mobile, Social UI,
    // another EnvoyGo device) that the node config changed so they
    // can re-render. Also emit `config:updated` so apps/node/src/index.ts
    // refreshes in-memory caches used by inbound chat-assist / knowledge.
    try {
      const full = await this.getNodeConfig();
      this.emit("config:updated", {
        autonomousKillSwitch: full.autonomousKillSwitch ?? false,
        autonomousPolicies: full.autonomousPolicies ?? [],
        chatAssistEnabled: full.chatAssistEnabled ?? false,
        modelProviders: full.modelProviders,
        aiSettings: full.aiSettings,
        contactAiPreferences: full.contactAiPreferences ?? [],
        trustModeEnabled: full.trustModeEnabled ?? false,
        knowledgeSyndicationMaxSensitivity: full.knowledgeSyndicationMaxSensitivity,
      });
      this.emit("home:config-updated", { config: full });
    } catch (err) {
      console.warn("[node-service] config update emit failed:", err);
    }
  }

  /**
   * Phase 8 / v1.4 — get the effective
   * signal opt-in flag (resolved from
   * persisted config + env var). The
   * Tauri UI calls this in the Settings
   * panel to show the current state of
   * the toggle.
   *
   * The read is sync (the in-memory
   * snapshot) but the method is async
   * because the Tauri UI's RPC layer is
   * uniformly async. The helper
   * (`readEffectiveSignalOptIn`) is the
   * source of truth for the resolution
   * order — the same function the signal
   * router uses (Q2 — persisted wins,
   * env var as fallback).
   */
  async getSignalOptIn(): Promise<"enabled" | "disabled"> {
    return readEffectiveSignalOptIn(this._configStore.peek());
  }

  /**
   * Phase 8 / v1.4 — set the persisted
   * signal opt-in flag. The Tauri UI
   * calls this when the owner toggles
   * the switch in the Settings panel.
   *
   * **Owner-only:** delegates to
   * `updateNodeConfig` which enforces
   * `requireOwnerProfile("change node
   * settings")`. A non-owner RPC caller
   * gets the same error.
   *
   * Returns the new effective state. The
   * returned value matches what the
   * signal router will use on the next
   * user prompt — the Tauri UI shows
   * what's actually effective.
   */
  async setSignalOptIn(
    value: "enabled" | "disabled",
  ): Promise<"enabled" | "disabled"> {
    await this.updateNodeConfig({ signalOptIn: value });
    return readEffectiveSignalOptIn(this._configStore.peek());
  }

  /**
   * Phase 8 / v1.4 — get the effective
   * verify-mode default for a given
   * worker runtime. The Tauri UI calls
   * this to populate the "Verification
   * mode" dropdown in the Settings
   * panel.
   */
  async getVerifyModeDefault(
    runtime: AgentRuntime,
  ): Promise<VerifyMode> {
    return readEffectiveVerifyModeDefault(
      this._configStore.peek(),
      runtime,
    );
  }

  /**
   * Phase 8 / v1.4 — set the persisted
   * verify-mode default. The Tauri UI
   * calls this when the owner picks a
   * value in the dropdown. Pass
   * `undefined` to clear the override
   * (the loop falls back to the
   * per-runtime default).
   *
   * **Owner-only:** delegates to
   * `updateNodeConfig` (same auth as the
   * other node-config writers).
   *
   * **Clear semantics:** the patch
   * `{ verifyModeDefault: undefined }` is
   * spread over the base config in
   * `updateNodeConfigViaRuntime`, which
   * overwrites the field to `undefined`.
   * `JSON.stringify` then omits the key,
   * so the on-disk file no longer has the
   * field. On reload, the helper falls
   * back to the per-runtime default — the
   * v0 behavior, restored.
   *
   * Returns the new effective state. The
   * Tauri UI can pass any runtime — the
   * per-node field is the same for all
   * runtimes (Q3 of the v1.4 sub-plan).
   * We return `value` directly because
   * for the set case the effective IS
   * `value` (persisted wins), and for the
   * clear case the effective is per-runtime
   * (signaled by `undefined`).
   */
  async setVerifyModeDefault(
    value: VerifyMode | undefined,
  ): Promise<VerifyMode | undefined> {
    await this.updateNodeConfig({ verifyModeDefault: value });
    return value;
  }

  async getSetupSponsorFriendConfig(): Promise<
    import("@envoymesh/api").ResolvedSetupSponsorFriend
  > {
    const persisted = await this._configStore.load();
    return resolveEffectiveSetupSponsorFriend({
      persisted: persisted ?? undefined,
      nodeBundleDir: process.env.ENVOYMESH_NODE_BUNDLE_DIR,
    });
  }

  /**
   * Full status the settings/discover UI consumes — resolved config plus the
   * last-attempt state plus a flag telling the UI whether the sponsor side
   * needs to set `bondAutonomy.sponsorProofToken` to match. Backs the
   * "Sponsor setup" tile in the discover view.
   */
  async getSetupSponsorFriendStatus(): Promise<
    import("@envoymesh/api").SetupSponsorFriendStatus
  > {
    const persisted = await this._configStore.load();
    const config = await resolveEffectiveSetupSponsorFriend({
      persisted: persisted ?? undefined,
      nodeBundleDir: process.env.ENVOYMESH_NODE_BUNDLE_DIR,
    });
    const state: import("@envoymesh/api").SetupSponsorFriendState = {
      completedAt: persisted?.setupSponsorFriendCompletedAt,
      lastAttemptAt: persisted?.setupSponsorFriendLastAttemptAt,
      lastError: persisted?.setupSponsorFriendLastError,
      lastErrorKind: persisted?.setupSponsorFriendLastErrorKind,
      attempts: persisted?.setupSponsorFriendAttempts,
      cooldownUntil: persisted?.setupSponsorFriendCooldownUntil,
      skipReason: persisted?.setupSponsorFriendSkipReason,
    };
    return {
      config,
      state,
      sponsorProofTokenRequired: Boolean(config.proofOfContext),
    };
  }

  async runSetupSponsorFriend(input?: { forceBypassGuards?: boolean }): Promise<
    import("@envoymesh/api").RunSetupSponsorFriendResult
  > {
    return runSetupSponsorFriendOnService(
      this,
      {
        loadNodeConfig: () => this._configStore.load(),
        saveNodeConfig: (config) => this._configStore.save(config),
        getProfileDir: () => this._profileDir,
        nodeBundleDir: process.env.ENVOYMESH_NODE_BUNDLE_DIR,
        assertOnline: () => this._assertOnline(),
        // Audit observability for skip reasons. Skips are not persisted
        // to node-config.json (per the test contract on line 507 of
        // setup-sponsor-friend-runtime.test.ts), so the audit log is
        // the only signal that lets the UI distinguish "we're waiting
        // for the network" from "we never started".
        appendAudit: (event) => this._appendAuditEvent(event),
        // Mesh-readiness probe: returns true only when the libp2p mesh
        // is set AND has registered listen addrs (event loop running).
        // The auto-trigger in NodeStateContext fires the moment
        // nodeStatus flips to "running", which can be tens of seconds
        // before the mesh's event loop is fully online. Without this
        // gate, the loop fires immediately, `searchPeers` returns []
        // with "Node not initialized" (silently), and `sendHello`
        // proceeds with `dialHints count=1` against a mesh that can't
        // route — burning all 12 attempts before the operator sees a
        // final state. The runtime uses the result to skip the spawn
        // entirely with a `mesh-not-ready` skip reason.
        probeMeshReady: async () => {
          const mesh = this._mesh ?? this._externalMesh;
          const config = await this._configStore.load().catch(() => undefined);
          const ready = isMeshReadyForSponsorBond(mesh, {
            discoveryProfile: config?.discoveryProfile,
            relayEnabled: config?.relayEnabled,
          });
          if (!mesh) {
            bondTrace(1, "FAIL", "no mesh instance");
            console.log(`[probeMeshReady] false — no mesh instance`);
          } else if (mesh.multiaddrs.length === 0) {
            bondTrace(1, "WAIT", "no listen addrs yet");
            console.log(`[probeMeshReady] false — no listen addrs yet`);
          } else if (!ready) {
            const lanFast = config?.discoveryProfile === "lan-fast";
            const relayEnabled = config?.relayEnabled !== false;
            if (relayEnabled && !lanFast) {
              bondTrace(1, "WAIT", "waiting for live relay reservation (wan-default)", {
                addrs: mesh.multiaddrs.length,
              });
              console.log(
                `[probeMeshReady] false — waiting for live relay reservation (wan-default)`,
              );
            } else {
              const relayPeers = mesh.getConnectedRelayPeerIds().length;
              const directPeers = mesh.getConnectedPeerIds().length;
              bondTrace(1, "WAIT", "no reservation and no connected peers yet", {
                relayPeers,
                directPeers,
                addrs: mesh.multiaddrs.length,
              });
              console.log(
                `[probeMeshReady] false — no relay reservation, no connected peers (relayPeers=${relayPeers}, directPeers=${directPeers}, addrs=${mesh.multiaddrs.length})`,
              );
            }
          } else {
            const live =
              typeof mesh.hasLiveRelayReservation === "function"
                ? mesh.hasLiveRelayReservation()
                : undefined;
            bondTrace(1, "PASS", "mesh ready for sponsor bond", {
              addrs: mesh.multiaddrs.length,
              liveReservation: live,
            });
            console.log(
              `[probeMeshReady] true — mesh ready for sponsor bond, addrs=${mesh.multiaddrs.length}`,
            );
          }
          return ready;
        },
        // Smart address-filter: gather the sponsor's known multiaddrs
        // from the bundled config (the sponsor's QR-code contactUri
        // carries the libp2p targetMultiaddrs inside its base64 join
        // token — same URI the local node would put on its own QR
        // code). Merge with any peer-directory records for the same
        // peerId/ownerId so fresh mDNS / DHT discoveries count too.
        // The smart picker (`pickAddressFilterForPeer` in
        // `outbound-dial-hints.ts`) decides per attempt whether to
        // try LAN first or skip it. Falls back to the local profile
        // default when the sponsor's addresses are unknown — no env
        // override needed; the runtime figures it out.
        // Smart address-filter: refresh sponsor multiaddrs each attempt
        // (mDNS / DHT may learn LAN after the first try).
        getPeerMultiaddrs: () => this._gatherSponsorMultiaddrs(),
        localDiscoveryProfile: (await this._configStore.load())?.discoveryProfile,
        // Wait-for-bond.established: subscribe to the node service's
        // EventEmitter and resolve the promise when an event for the
        // target ownerId fires. The local `sendHello` only proves the
        // bytes left this node's libp2p stream — it doesn't wait for
        // the sponsor's accept-bond reply. Without this gate, the
        // loop used to mark `setupSponsorFriendCompletedAt` the
        // instant the local send returned, masking relay stream
        // drops and NAT rebinds as silent success. 30s timeout →
        // falls through to the existing retry path with a
        // `sponsor-no-ack` classification so the UI can hint
        // differently from `network-unreachable`.
        waitForBondEstablished: (targetOwnerId, timeoutMs) =>
          this._waitForBondEstablished(targetOwnerId, timeoutMs),
      },
      { forceBypassGuards: input?.forceBypassGuards === true },
    );
  }


  private _refreshBridgeStatusFromConfig(bridgeCfg: BridgeConfig): void {
    const fields = bridgeConfigToStatusFields(bridgeCfg);
    const activeId = fields.activeExtAgentId?.trim();
    const prevActiveCwd = activeId
      ? getExtAgentProjectPathCwd(activeId)
      : undefined;
    syncExtAgentProjectPathsFromAgents(fields.extAgents);
    const nextActiveCwd =
      activeId && extAgentUsesProjectPath(activeId)
        ? getExtAgentProjectPathCwd(activeId)
        : undefined;
    const activeProjectPathChanged =
      (prevActiveCwd ?? "") !== (nextActiveCwd ?? "");
    const current = this._bridgeStatus;
    if (!current) return;
    // Env port overrides (node:dev:4030 → bridge :4031) beat a stale
    // listenPort in bridge-config.json so Ext Agent sidecars reply to
    // the live listener, not a dead :3031.
    const listenPort = effectiveBridgeListenPort(fields.listenPort);
    const liveCfg: BridgeConfig = { ...bridgeCfg, listenPort };
    // Push agentUrl/name into the running bridge so chat forwards immediately
    // (no node restart). Listen port / enabled / secret use in-process rebind.
    try {
      this._bridgeUpdateLiveConfig?.(liveCfg);
    } catch (err) {
      console.warn(
        "[bridge] live Ext Agent update failed:",
        err instanceof Error ? err.message : err,
      );
    }
    this.setBridgeStatus({
      ...current,
      agentUrl: fields.agentUrl,
      agentName: fields.agentName,
      listenPort,
      activeExtAgentId: fields.activeExtAgentId,
      extAgents: fields.extAgents,
    });
    // Settings / updateNodeConfig can change projectPath without going through
    // setExtAgentProjectPath — force-restart so coding agents + Hermes/OpenHuman
    // spawn cwd takes effect.
    void this._syncExtAgentSidecarFromStatus(liveCfg, {
      forceRestart: activeProjectPathChanged,
    });
  }

  private _syncExtAgentSidecarFromStatus(
    bridgeCfg?: BridgeConfig,
    opts?: { forceRestart?: boolean },
  ): void {
    const snap = this._bridgeStatus;
    if (!this._extAgentSidecarSyncer) return;
    void this._extAgentSidecarSyncer({
      bridgeEnabled: snap?.enabled === true,
      activeExtAgentId: bridgeCfg
        ? bridgeConfigToStatusFields(bridgeCfg).activeExtAgentId
        : snap?.activeExtAgentId,
      bridgeListenPort: effectiveBridgeListenPort(
        snap?.listenPort ?? bridgeCfg?.listenPort,
      ),
      bridgeSecret: bridgeCfg?.secret,
      ...(opts?.forceRestart ? { forceRestart: true } : {}),
    }).catch((err) => {
      console.warn(
        "[ext-agent] sidecar sync failed:",
        err instanceof Error ? err.message : err,
      );
    });
  }


  async listRelays(): Promise<RelayConfig[]> {
    const config = await this._configStore.load();
    return config?.configuredRelays ?? [];
  }

  async getChatDrafts(threadPeerOwnerId?: string): Promise<Array<{ draftId: string; threadPeerOwnerId: string; inReplyToMessageId: string; text: string; createdAt: string }>> {
    requireOwnerProfile("list chat drafts");
    if (!this._chatDraftStore) return [];
    if (threadPeerOwnerId) {
      return this._chatDraftStore.listByThread(threadPeerOwnerId);
    }
    return this._chatDraftStore.listAll();
  }

  async deleteChatDraft(draftId: string): Promise<void> {
    requireOwnerProfile("delete chat draft");
    if (!this._chatDraftStore) return;
    await this._chatDraftStore.delete(draftId);
  }

  // ============================================
  // Capability Manifest
  // ============================================

  async getCapabilityManifest(): Promise<import("@envoymesh/api").CapabilityManifest | undefined> {
    return getCapabilityManifestViaRuntime(this._manifestContext());
  }

  async updateCapabilityManifest(params: {
    visibility?: import("@envoymesh/api").ManifestVisibility;
    sensitivityCeiling?: "public" | "friends" | "private";
    keywords?: string[];
    capabilities?: string[];
    description?: string;
  }): Promise<import("@envoymesh/api").CapabilityManifest> {
    return updateCapabilityManifestViaRuntime(this._manifestContext(), params);
  }

  async addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig> {
    return addRelayViaRuntime(this._manifestContext(), addr, level, region);
  }

  async removeRelay(relayId: string): Promise<void> {
    await removeRelayViaRuntime(this._manifestContext(), relayId);
  }

  // ============================================
  // Node Lifecycle
  // ============================================

  async initNode(profileDir: string, options?: InitNodeOptions): Promise<NodeInitResult> {
    return initNodeViaRuntime(this._agentSetupContext(), profileDir, options);
  }

  getNodeStatus(): NodeStatus {
    if (this._nodeStatus !== "running" && (this._externalMesh || this._mesh)) {
      this._nodeStatus = "running";
    }
    return this._nodeStatus;
  }

  /**
   * Load profile + task store from persisted config when missing (Envoy-managed path).
   * Safe to call when CLI already bound {@link bindCliTaskStore}.
   */
  private async _ensureAgentStores(): Promise<boolean> {
    return ensureAgentStoresViaRuntime(this._agentSetupContext());
  }

  private async _requireToolExecutionContext(): Promise<MeshToolContext> {
    return requireToolExecutionContextViaRuntime(this._agentSetupContext());
  }

  async startNode(): Promise<void> {
    // Persist AN engine choice into sync caches before mesh comes up / handlers run.
    await this.hydrateAgentNetworkWorkerEngineFromDisk();
    if (this._deferredExternalMeshStart && this._nodeStatus !== "running") {
      await this._deferredExternalMeshStart();
      if (!this._mesh && !this._externalMesh) {
        throw new Error("Failed to start home node mesh after setup.");
      }
      void this.ensureDefaultWebSite().catch((err) => {
        console.warn(
          "[web] ensureDefaultWebSite after deferred start failed:",
          err instanceof Error ? err.message : err,
        );
      });
      this.startVaultRagWatcher();
      return;
    }
    await startNodeViaRuntime(this._startNodeContext());
    this.startVaultRagWatcher();
    void this.ensureDefaultWebSite().catch((err) => {
      console.warn(
        "[web] ensureDefaultWebSite after startNode failed:",
        err instanceof Error ? err.message : err,
      );
    });
  }

  private _startNodeContext(): StartNodeContext {
    return buildStartNodeContext(this._serviceContextDeps().startNode);
  }

  private _wireMeshEvents(): void {
    wireMeshEventsViaRuntime(this._wireMeshEventsContext());
  }

  private _wireMeshEventsContext(): WireMeshEventsContext {
    return buildWireMeshEventsContext(this._serviceContextDeps().wireMeshEvents);
  }

  private _meshInboundContext(): WireMeshInboundContext {
    return buildWireMeshInboundContext(this);
  }

  private _sharePreviewContext(): SharePreviewContext {
    return buildSharePreviewContext(this._serviceContextDeps().sharePreview);
  }

  private _pairingKioskContext(): PairingKioskContext {
    return buildPairingKioskContext(this._serviceContextDeps().pairingKiosk);
  }

  private _pairDeviceContext(): PairDeviceContext {
    return buildPairDeviceContext(this._serviceContextDeps().pairDevice);
  }

  private _pairSharedIdentityContext(): PairSharedIdentityContext {
    return buildPairSharedIdentityContext(this._serviceContextDeps().pairSharedIdentity);
  }

  private _getPairingPayloadContext(): GetPairingPayloadContext {
    return buildGetPairingPayloadContext(this._serviceContextDeps().getPairingPayload);
  }

  private _runOwnerAgentTurnContext(): RunOwnerAgentTurnContext {
    return buildRunOwnerAgentTurnContext(this._serviceContextDeps().runOwnerAgentTurn);
  }

  private _runDocumentAgentTurnContext(): RunDocumentAgentTurnContext {
    return buildRunDocumentAgentTurnContext(this._serviceContextDeps().runDocumentAgentTurn);
  }

  private _friendAutopilotContext(): FriendAutopilotContext {
    return buildFriendAutopilotContext(this._serviceContextDeps().friendAutopilot);
  }

  private _socialProxyContext(): SocialProxyContext {
    return buildSocialProxyContext(this._serviceContextDeps().socialProxy);
  }

  private _runSocialProxyPassContext(): RunSocialProxyPassContext {
    return buildRunSocialProxyPassContext(this._serviceContextDeps().runSocialProxyPass);
  }

  private _docAcqCapProvDeps(): DocAcqCapProvDeps {
    return buildDocAcqCapProvDeps({
      getNodeConfig: () => this.getNodeConfig(),
      hasDocumentAcquisitionJobStore: () => Boolean(this._documentAcquisitionJobStore),
      requireDocumentAcquisitionJobStore: () => {
        if (!this._documentAcquisitionJobStore) {
          throw new Error("document acquisition store unavailable");
        }
        return this._documentAcquisitionJobStore;
      },
      getLocalManifestCapabilities: () => this._localManifestCapabilities(),
      getDocumentAcquisitionWorkerDeps: (config) => this._documentAcquisitionWorkerDeps(config),
      hasCapabilityProviderJobStore: () => Boolean(this._capabilityProviderJobStore),
      requireCapabilityProviderJobStore: () => {
        if (!this._capabilityProviderJobStore) {
          throw new Error("capability provider store unavailable");
        }
        return this._capabilityProviderJobStore;
      },
      getCapabilityProviderWorkerDeps: (config) => this._capabilityProviderWorkerDeps(config),
      hasAgentActivityStore: () => Boolean(this._agentActivityStore),
      getAgentActivityStore: () => this._agentActivityStore,
      publishAgentActivity: (record) => this._publishAgentActivity(record),
    });
  }

  private _openInHerdrContext(): OpenInHerdrContext {
    return buildOpenInHerdrContext(this._serviceContextDeps().openInHerdr);
  }

  private _terminalGetHerdrExportHintContext(): TerminalGetHerdrExportHintContext {
    return buildTerminalGetHerdrExportHintContext(this._serviceContextDeps().terminalGetHerdrExportHint);
  }

    private _terminalExecContext(): TerminalExecContext {
    return buildTerminalExecContext(this._serviceContextDeps().terminalExec);
  }

    private _terminalContext(): any {
    return buildTerminalContext(this._serviceContextDeps().terminal);
  }

  private _storeAccessorDeps(): StoreAccessorDeps {
    return buildStoreAccessorDeps({
      getAgentActivityStore: () => this._agentActivityStore,
      getCommerceReceiptStore: () => this._commerceReceiptStore,
      getTaskStore: () => this._taskStore,
      getAgentCardStore: () => this._agentCardStore,
      getCircleStore: () => this._circleStore,
      summarizeAgentCard: (row) => summarizeAgentCard(row),
    });
  }

  private _fleetPublicDeps(): FleetPublicDeps {
    return buildFleetPublicDeps({
      hasTaskStore: () => Boolean(this._taskStore),
      requireTaskStore: () => {
        if (!this._taskStore) {
          throw new Error("Local task store is not initialised");
        }
        return this._taskStore;
      },
      getWanRuntimeDeps: () => this._wanRuntimeDeps(),
      getCompanyInviteInviteContext: () => this._companyInviteInviteContext(),
      getTrustStore: () => this._trustStore,
      getPeerDirectoryStore: () => this._peerDirectoryStore,
      getManifestStore: () => this._taskStore,
      getProfile: () => this._profile ?? null,
      appendAudit: (event) => this._taskStore!.appendAuditEvent(event),
      enableCapabilityProvider: async () => {
        // Route through updateNodeConfigViaRuntime so the capability flag is
        // merged with the current on-disk config instead of overwriting it
        // with a stale snapshot. The previous direct save() loaded the config,
        // flipped the flag, and wrote the whole thing back — if another save
        // landed between the load and the write (e.g. the user editing their
        // worker profile, or a sponsor-friend loop persisting attempt state),
        // those changes were silently clobbered. The merge path also benefits
        // from the config store's write serialization + in-memory cache.
        await updateNodeConfigViaRuntime(this._nodeConfigContext(), {
          capabilityProviderEnabled: true,
        } as Partial<NodeConfig>);
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _bondHandlerContext(): BondHandlerContext {
    return buildBondHandlerContext(this._serviceContextDeps().bondHandler);
  }

    private _chatRoomMessageContext(): ChatRoomMessageContext {
    return buildChatRoomMessageContext(this._serviceContextDeps().chatRoomMessage);
  }

    private _chatMessageContext(): ChatMessageContext {
    return buildChatMessageContext(this._serviceContextDeps().chatMessage);
  }

    private _requestPeerProfileContext(): RequestPeerProfileContext {
    return buildRequestPeerProfileContext(this._serviceContextDeps().requestPeerProfile);
  }

  private _smallProfileDelegationsContext(): SmallProfileDelegationsContext {
    return buildSmallProfileDelegationsContext(this._serviceContextDeps().smallProfileDelegations);
  }

  private _validatePairingTokenContext(): ValidatePairingTokenContext {
    return buildValidatePairingTokenContext(this._serviceContextDeps().validatePairingToken);
  }

  private _persistenceContext(): PersistenceContext {
    return buildPersistenceContext(this._serviceContextDeps().persistence);
  }

  private _chatRoomSyncContext(): ChatRoomSyncContext {
    return buildChatRoomSyncContext(this._serviceContextDeps().chatRoomSync);
  }

    private _miscDelegationsContext(): MiscDelegationsContext {
    return buildMiscDelegationsContext(this._serviceContextDeps().miscDelegations);
  }

  private async _runCapabilityDiscoveryCycle(
    source: "startup" | "periodic" | "on-demand",
    opts: { connectivityRuntime: ResolvedConnectivityRuntime; runFind?: boolean },
  ): Promise<void> {
    return runCapabilityDiscoveryCycleViaRuntime(this._capabilityDiscoveryContext(), source, opts);
  }

  private _startCapabilityDiscoveryScheduler(connectivityRuntime: ResolvedConnectivityRuntime): void {
    startCapabilityDiscoverySchedulerViaRuntime(this._capabilityDiscoveryContext(), connectivityRuntime);
    void this._syncLanDiscoverySweep("start-node");
  }

  async stopNode(): Promise<void> {
    this.stopVaultRagWatcher();
    this._stopLanDiscoverySweep();
    if (this._agentNetworkIndexRefreshTimers.length > 0) {
      for (const t of this._agentNetworkIndexRefreshTimers) clearTimeout(t);
      this._agentNetworkIndexRefreshTimers = [];
    }
    try {
      await this._agentNetworkRefreshInflight;
    } catch {
      /* ignore — tracked promises already catch */
    }
    this._agentNetworkRefreshInflight = Promise.resolve();
    return stopNodeViaRuntime(this._stopNodeContext());
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
    return getConnectionStatusViaRuntime(this._connectionStatusContext());
  }

  private _recordNodeError(context: string, err: unknown): void {
    recordNodeErrorViaRuntime(this._recordNodeErrorContext(), context, err);
  }

  setBridgeStatus(status: BridgeStatus): void {
    if (status.extAgents) {
      syncExtAgentProjectPathsFromAgents(status.extAgents);
    }
    this._bridgeStatus = status;
    this.emit("bridge:status", status);
  }

  setBridgeChatHandler(handler: (envelope: EnvoyEnvelope, remotePeerId: string) => Promise<void>): void {
    this._bridgeChatHandler = handler;
  }

  /** Wire hot Ext Agent switching into the running bridge (no node restart). */
  setBridgeLiveConfigUpdater(
    updater: (next: BridgeConfig | Partial<BridgeConfig>) => BridgeConfig,
  ): void {
    this._bridgeUpdateLiveConfig = updater;
  }

  /** Wire in-process bridge HTTP rebind (enable / listen port / secret). */
  setBridgeRebindHandler(handler: (reason: string) => Promise<void>): void {
    this._bridgeRebindHandler = handler;
  }

  /** Wire Hermes/OpenHuman local `/message` sidecar auto-start. */
  setExtAgentSidecarSyncer(
    syncer: (cfg: {
      bridgeEnabled: boolean;
      activeExtAgentId?: string;
      bridgeListenPort: number;
      bridgeSecret?: string;
      forceRestart?: boolean;
    }) => Promise<void>,
  ): void {
    this._extAgentSidecarSyncer = syncer;
  }

  /** Snapshot for rebind status merge (avoids wiping agentPeerId). */
  getBridgeStatusSnapshot(): BridgeStatus | null {
    return this._bridgeStatus;
  }

  /**
   * Wire the relay-book provider used by {@link getConnectionStatus} to keep the
   * Settings → Network Status panel populated even when no live libp2p circuit
   * connection is open at probe time. The provider returns the most recent
   * discovered/verified relay entries (region, addrs).
   */
  setRelayBookProvider(
    provider: () => Array<{ relayId: string; region?: string; addrs: string[] }>,
  ): void {
    this._relayBookProvider = provider;
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
    // Hard-invalidate the TTL caches on every terminal-manager mutation
    // (create/close/rename/respawn/exit) via the new setter. Even when
    // the constructor wired an `onSessionsChanged`, we wrap it so any
    // future subscriber chains automatically — both fire.
    manager.setOnSessionsChanged(() => {
      this._terminalListCache = null;
      this._pendingApprovalCountCache = null;
    });
    // Emit a fresh node:status so the frontend picks up terminalsAvailable=true.
    // The earlier node:online event fires before setTerminalManager(), so the
    // UI's initial connectionStatus snapshot may have terminalsAvailable=false.
    if (this._nodeStatus === "running") {
      this.emit("node:status", {
        status: this._nodeStatus,
        peerId: this._mesh?.peerId ?? this._externalMesh?.peerId ?? "",
      });
    }
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
    return this._openClawState.askInFlight > 0 || this._openClawState.activeTurnTools !== null;
  }

  private async _enrichTerminalSessions(
    summaries: import("@envoymesh/api").TerminalSessionSummary[],
  ): Promise<import("@envoymesh/api").TerminalSessionSummary[]> {
    const { enrichTerminalSessionSummaries } = await import("./terminal-activity.js");
    // Pending-approval count is read at most ~1 Hz. The 4× duplicate
    // reads that previously hit on every listTerminalSessions are now
    // coalesced — the activity-badge computation that uses this count
    // is insensitive to sub-second freshness (it's used as a binary
    // "is there work pending?" signal, not a precise tally). The
    // terminal event hook in setTerminalManager clears the cache on
    // every manager mutation for a faster-fresh path.
    const pendingApprovalCount = await this._getCachedPendingApprovalCount();
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

  /**
   * Read the pending-approval count with a 1s TTL cache. The count is
   * used by terminal activity enrichment, and on the previous cold path
   * `_enrichTerminalSessions` would re-call `listPendingApprovals` on
   * every one of N parallel listTerminalSessions calls. Cache is
   * cleared by the terminal-event hook in setTerminalManager as a fast
   * path for terminal-mutation freshness.
   */
  private async _getCachedPendingApprovalCount(): Promise<number> {
    const now = Date.now();
    const cached = this._pendingApprovalCountCache;
    if (
      cached &&
      now - cached.at < NodeServiceImpl._PENDING_APPROVAL_COUNT_CACHE_TTL_MS
    ) {
      return cached.count;
    }
    const items = await this.listPendingApprovals();
    const count = items.length;
    this._pendingApprovalCountCache = { at: now, count };
    return count;
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
    const now = Date.now();
    const cached = this._terminalListCache;
    if (
      cached &&
      now - cached.at < NodeServiceImpl._TERMINAL_LIST_CACHE_TTL_MS
    ) {
      return cached.result;
    }
    const summaries = this._requireTerminalManager().listTerminalSessions();
    const result = this._enrichTerminalSessions(summaries);
    this._terminalListCache = { at: now, result };
    return result;
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
    return terminalExecViaRuntime(this._terminalExecContext(), params);
  }


  terminalAttach(params: import("@envoymesh/api").TerminalAttachParams): Promise<import("@envoymesh/api").TerminalAttachResult> {
    return terminalAttachViaRuntime(this._terminalContext(), params);
  }

  terminalRunFromNaturalLanguage(
    params: import("@envoymesh/api").TerminalRunFromNaturalLanguageParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal> {
    return terminalRunFromNaturalLanguageViaRuntime(this._terminalContext(), params);
  }

  terminalExecuteProposal(params: import("@envoymesh/api").TerminalExecuteProposalParams): Promise<void> {
    return terminalExecuteProposalViaRuntime(this._terminalContext(), params);
  }

  terminalSetAssistModelOverride(
    params: import("@envoymesh/api").TerminalSetAssistModelOverrideParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return terminalSetAssistModelOverrideViaRuntime(this._terminalContext(), params);
  }

  terminalGetAssistState(sessionId: string): Promise<import("@envoymesh/api").TerminalAssistState> {
    return terminalGetAssistStateViaRuntime(this._terminalContext(), sessionId);
  }

  terminalExplainScrollback(
    params: import("@envoymesh/api").TerminalExplainScrollbackParams,
  ): Promise<import("@envoymesh/api").TerminalExplainScrollbackResult> {
    return terminalExplainScrollbackViaRuntime(this._terminalContext(), params);
  }

  terminalSuggestCommand(
    params: import("@envoymesh/api").TerminalSuggestCommandParams,
  ): Promise<import("@envoymesh/api").TerminalSuggestCommandResult> {
    return terminalSuggestCommandViaRuntime(this._terminalContext(), params);
  }

  terminalObserveStep(
    params: import("@envoymesh/api").TerminalObserveStepParams,
  ): Promise<import("@envoymesh/api").TerminalObserveStepResult> {
    return terminalObserveStepViaRuntime(this._terminalContext(), params);
  }

  terminalSetInlineSuggestEnabled(
    params: import("@envoymesh/api").TerminalSetInlineSuggestParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return terminalSetInlineSuggestEnabledViaRuntime(this._terminalContext(), params);
  }

  terminalOpenClawPlan(
    params: import("@envoymesh/api").TerminalOpenClawPlanParams,
  ): Promise<import("@envoymesh/api").TerminalOpenClawPlanResult> {
    return terminalOpenClawPlanViaRuntime(this._terminalContext(), params);
  }

  terminalRunPlanStep(
    params: import("@envoymesh/api").TerminalRunPlanStepParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal> {
    return terminalRunPlanStepViaRuntime(this._terminalContext(), params);
  }

  terminalEnablePrepareMode(
    params: import("@envoymesh/api").TerminalEnablePrepareModeParams,
  ): Promise<import("@envoymesh/api").TerminalEnablePrepareModeResult> {
    return terminalEnablePrepareModeViaRuntime(this._terminalContext(), params);
  }

  terminalWatchStep(
    params: import("@envoymesh/api").TerminalWatchStepParams,
  ): Promise<import("@envoymesh/api").TerminalWatchStepResult> {
    return terminalWatchStepViaRuntime(this._terminalContext(), params);
  }

  terminalPinContextSession(
    params: import("@envoymesh/api").TerminalPinContextSessionParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return terminalPinContextSessionViaRuntime(this._terminalContext(), params);
  }

  terminalDetectFailure(
    params: import("@envoymesh/api").TerminalDetectFailureParams,
  ): Promise<import("@envoymesh/api").TerminalFailureDetection> {
    return terminalDetectFailureViaRuntime(this._terminalContext(), params);
  }

  terminalSuggestFixFromFailure(
    params: import("@envoymesh/api").TerminalSuggestFixParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal> {
    return terminalSuggestFixFromFailureViaRuntime(this._terminalContext(), params);
  }

  terminalStartGoalLoop(
    params: import("@envoymesh/api").TerminalStartGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult> {
    return terminalStartGoalLoopViaRuntime(this._terminalContext(), params);
  }

  terminalAdvanceGoalLoop(
    params: import("@envoymesh/api").TerminalAdvanceGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult> {
    return terminalAdvanceGoalLoopViaRuntime(this._terminalContext(), params);
  }

  terminalCancelGoalLoop(
    params: import("@envoymesh/api").TerminalCancelGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return terminalCancelGoalLoopViaRuntime(this._terminalContext(), params);
  }

  terminalClearResumeGoal(sessionId: string): Promise<import("@envoymesh/api").TerminalAssistState> {
    return terminalClearResumeGoalViaRuntime(this._terminalContext(), sessionId);
  }

  terminalSendContextToAssistant(
    params: import("@envoymesh/api").TerminalSendContextToAssistantParams,
  ): Promise<import("@envoymesh/api").TerminalSendContextToAssistantResult> {
    return terminalSendContextToAssistantViaRuntime(this._terminalContext(), params);
  }

  terminalUpdatePlanProgress(
    params: import("@envoymesh/api").TerminalUpdatePlanProgressParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState> {
    return terminalUpdatePlanProgressViaRuntime(this._terminalContext(), params);
  }

  terminalGetScrollbackPreview(
    params: import("@envoymesh/api").TerminalGetScrollbackPreviewParams,
  ): Promise<import("@envoymesh/api").TerminalGetScrollbackPreviewResult> {
    return terminalGetScrollbackPreviewViaRuntime(this._terminalContext(), params);
  }

  terminalResumeGoalLoop(
    params: import("@envoymesh/api").TerminalResumeGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult> {
    return terminalResumeGoalLoopViaRuntime(this._terminalContext(), params);
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
    return openInHerdrViaRuntime(this._openInHerdrContext(), params);
  }

  async terminalGetHerdrExportHint(
    params: import("@envoymesh/api").TerminalHerdrExportHintParams,
  ): Promise<import("@envoymesh/api").TerminalHerdrExportHintResult> {
    return terminalGetHerdrExportHintViaRuntime(
      this._terminalGetHerdrExportHintContext(),
      params,
    ) as Promise<import("@envoymesh/api").TerminalHerdrExportHintResult>;
  }

  async lookupSessionToken(token: string): Promise<import("@envoymesh/local-store").SessionTokenRecord | undefined> {
    return lookupSessionTokenViaRuntime(this._sessionTokenContext(), token);
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
   * Phase 35D — start or reconfigure the pairing-kiosk HTTP server. Reads
   * the kiosk-related fields from the persisted config; the operator's
   * `updateNodeConfig` call already wrote them. The server is *off* by
   * default and the operator must opt in.
   */
  private async _syncPairingKioskFromConfig(): Promise<void> {
    return syncPairingKioskFromConfigViaRuntime(this._pairingKioskContext());
  }

  async stopPairingKiosk(): Promise<void> {
    return stopPairingKioskViaRuntime(this._pairingKioskContext());
  }

  /**
   * Phase 35D — status of the pairing-kiosk server. Surfaced in the UI as
   * a small "Kiosk: running at …" hint when the operator has it on.
   */
  private async _getPairingKioskStatus(): Promise<{
    enabled: boolean;
    running: boolean;
    address?: string;
    port?: number;
    bindLan: boolean;
    expiresAt?: string;
  }> {
    return (await getPairingKioskStatusViaRuntime(this._pairingKioskContext())) as never;
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
   * 1. The latest QR pairing token from [getPairingPayload] (30-min TTL, see
   *    `_pairingTokenTtlMs`), or
   * 2. A persisted session token (no TTL — for reconnections without QR re-scan), or
   * 3. A live, unrevoked, unexpired company invite (Phase 35A: Fleet Onboarding A).
   *
   * When a persisted token is matched, [lastUsedAt] is touched.
   */
  async validatePairingToken(token: string): Promise<boolean> {
    return validatePairingTokenViaRuntime(this._validatePairingTokenContext(), token);
  }

  /**
   * True when `token` is an active store-review pairing token (owner form or
   * the derived `family.<token>` form) within its TTL. Used by the client-proxy
   * to keep review tokens limited to the pre-auth pairing RPCs.
   */
  async isReviewPairingToken(token: string): Promise<boolean> {
    const review = resolveReviewPairing(
      await this._configStore.load().catch(() => null),
    );
    return isActiveReviewPairingToken(review, token);
  }

  /**
   * Store-review pairing tokens (Apple/Google) are deliberately shared with
   * untrusted reviewers. The legacy companion RPCs `pairDevice` and
   * `pairSharedIdentity` hand over the owner identity / owner key material —
   * review tokens must never drive them, even after the reviewer paired as a
   * family member (family sessions can otherwise reach these RPCs).
   */
  private async _assertReviewTokenNotAllowedForPairingOrThrow(
    pairingToken: string,
  ): Promise<void> {
    const review = resolveReviewPairing(
      await this._configStore.load().catch(() => null),
    );
    if (isActiveReviewPairingToken(review, pairingToken)) {
      throw new Error(
        "Store-review pairing tokens cannot be used for shared-identity or companion device pairing",
      );
    }
  }

  async getBridgeStatus(): Promise<BridgeStatus> {
    const status = getBridgeStatusViaRuntime(this._connectionStatusContext());
    return maskBridgeEnabledForExtAgentAccess(
      status,
      await this._callerMayUseExtAgent(),
    );
  }

  /**
   * Live status of the built-in OpenClaw gateway (EnvoyAI).
   * `enabled` reflects the persisted `openclawEnabled` flag; `running` reflects
   * the child process + webhook reachability. The two may diverge briefly
   * during startup. `openclawEnabled` is a boot-time flag — see
   * agent-network-config.md §4.2 — so the runtime "in-flight" semantics
   * are not part of this RPC.
   */
  async getOpenClawStatus(): Promise<OpenClawStatus> {
    return getOpenClawStatusViaRuntime({
      isOpenClawEnabled: () => this._isOpenClawEnabled(),
      isOpenClawReady: () => isOpenClawReadyViaRuntime(this._openClawState),
      getAssistantAgentUrl: () => this._openClawState.assistantAgentUrl,
      getOpenClawGatewayChild: () => this._openClawState.gatewayChild ?? undefined,
      getOpenClawError: () => ({
        lastError: this._openClawState.lastError,
        lastErrorAt: this._openClawState.lastErrorAt,
        consecutiveRestartFailures: this._openClawState.consecutiveRestartFailures,
      }),
    });
  }

  /**
   * Soft-probe Ext Agent backend reachability. Never blocks switching —
   * used by Social for post-switch hints and the Ext Agent chat banner.
   */
  async probeExtAgent(params?: ProbeExtAgentParams): Promise<ExtAgentReachability> {
    if (!(await this._callerMayUseExtAgent())) {
      const status = this.getBridgeStatusSnapshot();
      const agents = mergeExtAgentPresets(status?.extAgents);
      const requested = params?.agentId?.trim();
      const active =
        (requested ? agents.find((a) => a.id === requested) : undefined) ??
        resolveActiveExtAgent(agents, status?.activeExtAgentId) ??
        agents[0];
      const agentId = active?.id ?? requested ?? "pi";
      return {
        agentId,
        agentName: active?.name ?? agentId,
        builtIn: agentId === "pi",
        reachable: false,
        hint: "Ext Agent chat is disabled for this family profile.",
        checkedAt: new Date().toISOString(),
        installState: "unknown",
      };
    }
    const status = this.getBridgeStatusSnapshot() ?? (await this.getBridgeStatus());
    const agents = mergeExtAgentPresets(status.extAgents);
    const requested = params?.agentId?.trim();
    const active =
      (requested
        ? agents.find((a) => a.id === requested)
        : undefined) ??
      resolveActiveExtAgent(agents, status.activeExtAgentId) ??
      agents[0];
    const agentId = active?.id ?? requested ?? "pi";
    const agentName = active?.name ?? agentId;
    const agentUrl = active?.url ?? status.agentUrl ?? "";
    return probeExtAgentReachability({ agentId, agentName, agentUrl });
  }

  /**
   * Per-agent slash catalog for Ext Agent chat autocomplete.
   * Uses static baselines; claudecode overlays cached `system/init.slash_commands`.
   */
  async getExtAgentCommandCatalog(
    params?: GetExtAgentCommandCatalogParams,
  ): Promise<ExtAgentCommandCatalog> {
    if (!(await this._callerMayUseExtAgent())) {
      throw this._extAgentDeniedError();
    }
    const status = this.getBridgeStatusSnapshot() ?? (await this.getBridgeStatus());
    const agents = mergeExtAgentPresets(status.extAgents);
    const requested = params?.agentId?.trim();
    const active =
      (requested
        ? agents.find((a) => a.id === requested)
        : undefined) ??
      resolveActiveExtAgent(agents, status.activeExtAgentId) ??
      agents[0];
    const agentId = active?.id ?? requested ?? "pi";
    const agentName = active?.name ?? agentId;
    const sessionKey = this._bridgeAskSessionKey();
    const sessionModelOk = this._extAgentSupportsSessionModel(agentId);
    const sessionModel =
      sessionKey && sessionModelOk
        ? getExtAgentSessionModel(agentId, sessionKey)
        : undefined;

    let models: Array<{ id: string; label?: string }> | undefined;
    let defaultModel: string | undefined;
    if (agentId === "hermes") {
      defaultModel = defaultHermesModel();
      models = await listHermesModels();
    } else if (agentId === "openhuman") {
      defaultModel = defaultOpenHumanModel();
      models = sessionModelOk ? await listOpenHumanModels() : undefined;
    } else if (agentId === "claudecode") {
      defaultModel = defaultClaudeCodeModel();
      // Claude Code does not expose /v1/models; common aliases for autocomplete.
      models = [
        { id: "sonnet", label: "Sonnet (alias)" },
        { id: "opus", label: "Opus (alias)" },
        { id: "haiku", label: "Haiku (alias)" },
        { id: defaultModel },
      ];
    }

    return buildExtAgentCommandCatalog({
      agentId,
      agentName,
      dynamicSlashCommands:
        agentId === "claudecode" ? getCachedClaudeCodeSlashCommands() : undefined,
      models,
      sessionModel,
      defaultModel,
      supportsSessionModel: sessionModelOk,
    });
  }

  async setExtAgentSessionModel(
    params: SetExtAgentSessionModelParams,
  ): Promise<SetExtAgentSessionModelResult> {
    if (!(await this._callerMayUseExtAgent())) {
      throw this._extAgentDeniedError();
    }
    const status = this.getBridgeStatusSnapshot() ?? (await this.getBridgeStatus());
    const agents = mergeExtAgentPresets(status.extAgents);
    const requested = params.agentId?.trim();
    const active =
      (requested
        ? agents.find((a) => a.id === requested)
        : undefined) ??
      resolveActiveExtAgent(agents, status.activeExtAgentId) ??
      agents[0];
    const agentId = active?.id ?? requested ?? "pi";
    const supports = this._extAgentSupportsSessionModel(agentId);
    if (!supports) {
      return { agentId, supportsSessionModel: false };
    }
    const sessionKey = this._bridgeAskSessionKey();
    if (!sessionKey) {
      throw new Error("setExtAgentSessionModel: caller session identity is not ready");
    }
    const sessionModel = writeExtAgentSessionModel(agentId, sessionKey, params.model);
    return {
      agentId,
      supportsSessionModel: true,
      ...(sessionModel ? { sessionModel } : {}),
    };
  }

  async getHomeFsInfo(): Promise<HomeFsInfo> {
    requireOwnerProfile("browse home folders");
    return readHomeFsInfo();
  }

  async listHomeFsEntries(
    params?: ListHomeFsEntriesParams,
  ): Promise<ListHomeFsEntriesResult> {
    requireOwnerProfile("browse home folders");
    return readHomeFsEntries(params ?? {});
  }

  async discoverObsidianVaults(): Promise<DiscoverObsidianVaultsResult> {
    requireOwnerProfile("discover Obsidian vaults");
    return scanObsidianVaults();
  }

  async openDesktopApp(params: OpenDesktopAppParams): Promise<OpenDesktopAppResult> {
    requireOwnerProfile("open desktop app");
    if (!isDesktopAppId(params?.app)) {
      return { ok: false, error: "Unsupported app (allowed: obsidian, notion)" };
    }
    return launchDesktopApp(params.app);
  }

  async getExtAgentProjectPath(
    params?: GetExtAgentProjectPathParams,
  ): Promise<ExtAgentProjectPathResult> {
    requireOwnerProfile("read Ext Agent project folder");
    const status = this.getBridgeStatusSnapshot() ?? (await this.getBridgeStatus());
    const agents = mergeExtAgentPresets(status.extAgents);
    const requested = params?.agentId?.trim();
    const active =
      (requested
        ? agents.find((a) => a.id === requested)
        : undefined) ??
      resolveActiveExtAgent(agents, status.activeExtAgentId) ??
      agents[0];
    const agentId = active?.id ?? requested ?? "pi";
    const usesProjectPath = extAgentUsesProjectPath(agentId);
    if (!usesProjectPath) {
      return { agentId, usesProjectPath: false };
    }
    const projectPath =
      getExtAgentProjectPathCwd(agentId) ??
      resolveHomeFsDirectory(active?.projectPath) ??
      undefined;
    return {
      agentId,
      usesProjectPath: true,
      ...(projectPath ? { projectPath } : {}),
    };
  }

  async setExtAgentProjectPath(
    params: SetExtAgentProjectPathParams,
  ): Promise<ExtAgentProjectPathResult> {
    requireOwnerProfile("set Ext Agent project folder");
    const status = this.getBridgeStatusSnapshot() ?? (await this.getBridgeStatus());
    const agents = mergeExtAgentPresets(status.extAgents);
    const requested = params.agentId?.trim();
    const active =
      (requested
        ? agents.find((a) => a.id === requested)
        : undefined) ??
      resolveActiveExtAgent(agents, status.activeExtAgentId) ??
      agents[0];
    const agentId = active?.id ?? requested ?? "pi";
    if (!extAgentUsesProjectPath(agentId)) {
      return { agentId, usesProjectPath: false };
    }

    const raw = params.projectPath;
    let next: string | undefined;
    if (raw == null || String(raw).trim() === "") {
      next = undefined;
    } else {
      const resolved = resolveHomeFsDirectory(String(raw));
      if (!resolved) {
        throw new Error(`Project folder is missing or is not a directory: ${raw}`);
      }
      next = resolved;
    }

    const updated = agents.map((agent) => {
      if (agent.id !== agentId) return agent;
      if (next === undefined) {
        const { projectPath: _drop, ...rest } = agent;
        return rest;
      }
      return { ...agent, projectPath: next };
    });

    const bridgeCfg = await applyExtAgentSettingsPatch(this._profileDir, {
      extAgents: updated,
      activeExtAgentId: status.activeExtAgentId,
    });
    // Refresh compares previous store cwd → new config and force-restarts
    // when the active agent's projectPath changed (Settings and chat share this).
    this._refreshBridgeStatusFromConfig(bridgeCfg);

    return {
      agentId,
      usesProjectPath: true,
      ...(next ? { projectPath: next } : {}),
    };
  }

  async previewHomeFsFile(
    params: PreviewHomeFsFileParams,
  ): Promise<PreviewHomeFsFileResult> {
    requireOwnerProfile("preview home files");
    return readHomeFsPreview(params);
  }

  async runMmxMediaCommand(
    params: import("@envoymesh/api").RunMmxMediaCommandParams,
  ): Promise<import("@envoymesh/api").RunMmxMediaCommandResult> {
    requireOwnerProfile("run MiniMax media commands");
    return executeMmxMediaCommand(this._profileDir, params);
  }

  async revealHomeFsPath(
    params: import("@envoymesh/api").RevealHomeFsPathParams,
  ): Promise<import("@envoymesh/api").RevealHomeFsPathResult> {
    requireOwnerProfile("reveal home path");
    const raw = typeof params.path === "string" ? params.path.trim() : "";
    if (!raw) return { ok: false, error: "path required" };
    const abs = resolve(raw);
    if (!existsSync(abs)) {
      return { ok: false, error: `Path not found: ${abs}` };
    }
    try {
      await revealPathInFileManager(abs);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async uploadEnvoyAttachment(
    params: import("@envoymesh/api").UploadEnvoyAttachmentParams,
  ): Promise<import("@envoymesh/api").UploadEnvoyAttachmentResult> {
    requireOwnerProfile("upload agent attachment");
    return saveEnvoyUpload(this._profileDir, params);
  }

  async buildAgentAttachmentContext(
    params: import("@envoymesh/api").BuildAgentAttachmentContextParams,
  ): Promise<import("@envoymesh/api").BuildAgentAttachmentContextResult> {
    requireOwnerProfile("build agent attachment context");
    return buildAgentAttachmentContext(params.attachments ?? []);
  }

  /** EnvoyAI (OpenClaw) slash catalog for Social / EnvoyGo composers. */
  async getEnvoyAiCommandCatalog(): Promise<ExtAgentCommandCatalog> {
    return buildEnvoyAiCommandCatalog();
  }

  /**
   * Force-restart the built-in OpenClaw gateway. Used by the AI → AI
   * Engine "Restart now" button and by the chat view's offline banner so
   * the user can recover from a "Stopped" state without bouncing the
   * whole home node. Returns the post-restart status.
   */
  async restartOpenClaw(): Promise<OpenClawStatus> {
    return restartOpenClawViaRuntime(
      this._openClawState,
      this._openClawRuntimeDeps(),
    );
  }

  /**
   * Get pairing payload for mobile-app QR pairing (Phase 10A.7).
   *
   * When a relay is discoverable, the QR points to the relay's client-proxy
   * WebSocket so mobile can pair from any network. Falls back to direct LAN IP
   * when no relay is known.
   */
  async getPairingPayload(): Promise<PairingPayload> {
    return getPairingPayloadViaRuntime(this._getPairingPayloadContext());
  }

  async createWanJoinInvite(params?: CreateWanJoinInviteParams): Promise<CreateWanJoinInviteResult> {
    return createWanJoinInviteViaPublicRuntime(this._fleetPublicDeps(), params);
  }

  async applyWanJoinInvite(token: string): Promise<ApplyWanJoinInviteResult> {
    return applyWanJoinInviteViaPublicRuntime(this._fleetPublicDeps(), token);
  }

  async createCompanyInvite(
    params?: CreateCompanyInviteParams,
  ): Promise<CreateCompanyInviteResult> {
    requireOwnerProfile("create company invites");
    return createCompanyInviteViaPublicRuntime(this._fleetPublicDeps(), params);
  }

  async listCompanyInvites(): Promise<ListCompanyInvitesResult> {
    requireOwnerProfile("list company invites");
    return listCompanyInvitesViaPublicRuntime(this._fleetPublicDeps());
  }

  async revokeCompanyInvite(inviteId: string): Promise<RevokeCompanyInviteResult> {
    requireOwnerProfile("revoke company invites");
    return revokeCompanyInviteViaPublicRuntime(this._fleetPublicDeps(), inviteId);
  }

  async listFamilyProfiles(): Promise<import("@envoymesh/api").ListFamilyProfilesResult> {
    await this._ensureFamilyOwnerMigrated();
    return listFamilyProfilesViaRuntime(this._familyProfileStore);
  }

  async createFamilyProfile(
    params: import("@envoymesh/api").CreateFamilyProfileParams,
  ): Promise<import("@envoymesh/api").CreateFamilyProfileResult> {
    await this._ensureFamilyOwnerMigrated();
    const result = await createFamilyProfileViaRuntime(this._familyProfileStore, params);
    await this._refreshFamilyProfileActiveCache();
    try {
      const full = await this.getNodeConfig();
      this.emit("home:config-updated", { config: full });
    } catch {
      /* ignore */
    }
    return result;
  }

  async updateFamilyProfile(
    params: import("@envoymesh/api").UpdateFamilyProfileParams,
  ): Promise<import("@envoymesh/api").UpdateFamilyProfileResult> {
    await this._ensureFamilyOwnerMigrated();
    const before =
      typeof params.id === "string" && params.id.trim() && this._familyProfileStore
        ? await this._familyProfileStore.get(params.id.trim())
        : undefined;
    const result = await updateFamilyProfileViaRuntime(this._familyProfileStore, params);
    await this._refreshFamilyProfileActiveCache();
    // Kick live thin clients when owner deactivates a profile.
    if (
      before &&
      before.active !== false &&
      result.profile.active === false &&
      !result.profile.isOwner
    ) {
      try {
        this._disconnectClientsForProfile?.(result.profile.id);
      } catch {
        /* ignore */
      }
    }
    try {
      const full = await this.getNodeConfig();
      this.emit("home:config-updated", { config: full });
    } catch {
      /* ignore */
    }
    // Ext Agent allow/deny must refresh chat-row visibility on family devices
    // (they listen to bridge:status; home:config-updated alone is not enough
    // for older EnvoyGo builds that only hide on enabled=false).
    if (params.extAgentEnabled !== undefined) {
      try {
        const snap = this.getBridgeStatusSnapshot();
        if (snap) this.emit("bridge:status", snap);
      } catch {
        /* ignore */
      }
    }
    return result;
  }

  /**
   * Alias of {@link wipeFamilyProfile} — hard-delete without wipe orphaned
   * history; callers must erase profile-scoped data.
   */
  async deleteFamilyProfile(
    id: string,
  ): Promise<import("@envoymesh/api").DeleteFamilyProfileResult> {
    const wiped = await this.wipeFamilyProfile(id);
    return { ok: true, id: wiped.id };
  }

  async wipeFamilyProfile(
    id: string,
  ): Promise<import("@envoymesh/api").WipeFamilyProfileResult> {
    await this._ensureFamilyOwnerMigrated();
    const result = await wipeFamilyProfileViaRuntime(
      {
        profileStore: this._familyProfileStore,
        chatLogStore: this._chatLogStore,
        sessionTokenStore: this._sessionTokenStore,
        familyRoomStore: this._familyRoomStore,
        unregisterPushTokens: (profileId) =>
          pushNotificationService.unregisterPushTokensForProfile(profileId),
        disconnectClients: (profileId) =>
          this._disconnectClientsForProfile?.(profileId) ?? 0,
        clearRagThreads: async (threadKeys) => {
          if (threadKeys.length === 0) return;
          if (!(await this._shouldPurgeChatRagOnDelete())) return;
          const rag = await this._getRagService();
          if (!rag) return;
          for (const key of threadKeys) {
            try {
              await rag.clearChatThread(key);
            } catch {
              /* best-effort */
            }
          }
        },
      },
      id,
    );
    await this._refreshFamilyProfileActiveCache();
    try {
      const full = await this.getNodeConfig();
      this.emit("home:config-updated", { config: full });
    } catch {
      /* ignore */
    }
    return result;
  }

  async generateFamilyInviteToken(
    params?: import("@envoymesh/api").GenerateFamilyInviteTokenParams,
  ): Promise<import("@envoymesh/api").GenerateFamilyInviteTokenResult> {
    await this._ensureFamilyOwnerMigrated();
    return generateFamilyInviteTokenViaRuntime(
      {
        createInvite: async (inviteParams) =>
          createCompanyInviteViaPublicRuntime(this._fleetPublicDeps(), inviteParams),
        getReviewPairing: async () => {
          const config = await this._configStore.load().catch(() => null);
          return resolveReviewPairing(config ?? null);
        },
      },
      params,
    );
  }

  /**
   * Phase 51 follow-up — pre-auth list of selectable non-owner profiles
   * for EnvoyGo re-pair (gated by a valid family invite token).
   */
  async previewFamilyInvite(
    params: import("@envoymesh/api").PreviewFamilyInviteParams,
  ): Promise<import("@envoymesh/api").PreviewFamilyInviteResult> {
    const pairingToken = params.pairingToken?.trim() ?? "";
    if (!pairingToken) throw new Error("pairingToken is required");

    const valid = await this.validatePairingToken(pairingToken);
    if (!valid) throw new Error("Invalid or expired pairing token");

    const invite = this._taskStore
      ? await this._taskStore.findCompanyInviteByToken(pairingToken)
      : undefined;
    if (!invite || invite.kind !== "family") {
      throw new Error("Not a family invite token");
    }
    if (invite.revokedAt) throw new Error("Family invite token has been revoked");
    if (Date.parse(invite.expiresAt) <= Date.now()) {
      throw new Error("Family invite token has expired");
    }
    // Fail early when this QR was already consumed by a *different* device.
    // Same-device re-pair (idempotent) is still allowed. Re-pair on a new /
    // reset phone needs a freshly generated family invite QR from the owner.
    // Store-review tokens stay multi-device (Apple + Google can share one QR).
    const review = resolveReviewPairing(
      await this._configStore.load().catch(() => null),
    );
    const reviewReusable = isActiveReviewPairingToken(review, pairingToken);
    if (!reviewReusable && invite.usedAt && invite.usedByDeviceId) {
      const clientDeviceId = params.deviceId?.trim() ?? "";
      const deviceId =
        clientDeviceId.length >= 8
          ? `thin-client:${clientDeviceId}`
          : undefined;
      if (!deviceId || invite.usedByDeviceId !== deviceId) {
        throw new Error(
          "Family invite token was already used by another device. Ask the home owner to show a new family invite QR, then choose I'm back and select your profile.",
        );
      }
    }

    await this._ensureFamilyOwnerMigrated();
    if (!this._familyProfileStore) {
      return { profiles: [] };
    }
    const profiles = await this._familyProfileStore.list();
    return {
      profiles: profiles
        .filter((p) => !p.isOwner && p.active !== false)
        .map((p) => ({
          id: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          active: p.active !== false,
        })),
    };
  }

  /**
   * Phase 51C — local family DM. Never leaves the home node.
   */
  async sendFamilyMessage(
    params: import("@envoymesh/api").SendFamilyMessageParams,
  ): Promise<import("@envoymesh/api").SendFamilyMessageResult> {
    await this._ensureFamilyOwnerMigrated();
    if (!this._familyProfileStore) {
      throw new Error("Family profile store is not available");
    }
    const fromProfileId = this._callerFamilyProfileId();
    const toProfileId = params.toProfileId?.trim() ?? "";
    const text = params.text?.trim() ?? "";
    if (!toProfileId) throw new Error("toProfileId is required");
    if (!text) throw new Error("text is required");
    if (toProfileId === fromProfileId) {
      throw new Error(
        fromProfileId === OWNER_FAMILY_PROFILE_ID
          ? "Cannot send a family message to yourself — this session is bound as Owner. If this device should be Mom/Dad, unpair and re-pair with a family invite."
          : "Cannot send a family message to yourself",
      );
    }

    const [fromProfile, toProfile] = await Promise.all([
      this._familyProfileStore.get(fromProfileId),
      this._familyProfileStore.get(toProfileId),
    ]);
    if (!fromProfile || fromProfile.active === false) {
      throw new Error("Your family profile is not active");
    }
    if (!toProfile) {
      throw new Error(`Family profile not found: ${toProfileId}`);
    }
    // Deactivated recipients stay messageable so history remains reachable;
    // they appear offline and get push if a token is registered.

    const threadKey = familyThreadKey(fromProfileId, toProfileId);
    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const meshPeerId = this._mesh?.peerId ?? "";
    const msg: ChatMessage = {
      messageId,
      sender: {
        nodeId: meshPeerId,
        ownerId: fromProfileId,
        displayName: fromProfile.name,
        actorRole: "human",
      },
      recipient: {
        nodeId: meshPeerId,
        ownerId: threadKey,
        displayName: toProfile.name,
      },
      content: { text },
      metadata: {
        timestamp: now,
        deliveryReceipt: "delivered",
        deliveryChannel: "chat",
      },
      signature: "",
    };
    this._persistChatMessage(threadKey, msg);
    this.emit("chat:message", msg);

    // Presence hint for the sender.
    try {
      await this._familyProfileStore.update({
        id: fromProfileId,
        lastSeenAt: now,
      });
    } catch {
      /* best-effort */
    }

    return { messageId, threadKey };
  }

  private _toFamilyRoom(
    record: import("@envoymesh/local-store").FamilyRoomRecord,
  ): import("@envoymesh/api").FamilyRoom {
    return {
      roomId: record.roomId,
      title: record.title,
      creatorProfileId: record.creatorProfileId,
      memberProfileIds: record.memberProfileIds,
      revision: record.revision,
      updatedAt: record.updatedAt,
      active: record.active,
      kind: "family",
    };
  }

  async listFamilyRooms(): Promise<import("@envoymesh/api").ListFamilyRoomsResult> {
    await this._ensureFamilyOwnerMigrated();
    if (!this._familyRoomStore) return { rooms: [] };
    const profileId = this._callerFamilyProfileId();
    const rooms = await this._familyRoomStore.list();
    return {
      rooms: rooms
        .filter((r) => r.memberProfileIds.includes(profileId))
        .map((r) => this._toFamilyRoom(r)),
    };
  }

  async createFamilyRoom(
    params: import("@envoymesh/api").CreateFamilyRoomParams,
  ): Promise<import("@envoymesh/api").CreateFamilyRoomResult> {
    await this._ensureFamilyOwnerMigrated();
    if (!this._familyRoomStore || !this._familyProfileStore) {
      throw new Error("Family room store is not available");
    }
    const creatorProfileId = this._callerFamilyProfileId();
    const creator = await this._familyProfileStore.get(creatorProfileId);
    if (!creator || creator.active === false) {
      throw new Error("Your family profile is not active");
    }
    const title = params.title?.trim() ?? "";
    if (!title) throw new Error("title is required");
    const requested = Array.isArray(params.memberProfileIds)
      ? params.memberProfileIds.map((m) => m.trim()).filter(Boolean)
      : [];
    for (const id of requested) {
      if (id === creatorProfileId) continue;
      const p = await this._familyProfileStore.get(id);
      if (!p) throw new Error(`Family profile not found: ${id}`);
      if (p.active === false) {
        throw new Error(`Family profile is inactive: ${id}`);
      }
    }
    const room = await this._familyRoomStore.create({
      title,
      creatorProfileId,
      memberProfileIds: requested,
    });
    const wire = this._toFamilyRoom(room);
    for (const memberId of room.memberProfileIds) {
      this.emit("chat:family-room-updated", { room: wire, targetProfileId: memberId });
    }
    return { room: wire };
  }

  async sendFamilyRoomMessage(
    params: import("@envoymesh/api").SendFamilyRoomMessageParams,
  ): Promise<import("@envoymesh/api").SendFamilyRoomMessageResult> {
    await this._ensureFamilyOwnerMigrated();
    if (!this._familyRoomStore || !this._familyProfileStore) {
      throw new Error("Family room store is not available");
    }
    const roomId = params.roomId?.trim() ?? "";
    const text = params.text?.trim() ?? "";
    if (!roomId) throw new Error("roomId is required");
    if (!text) throw new Error("text is required");
    const profileId = this._callerFamilyProfileId();
    const profile = await this._familyProfileStore.get(profileId);
    if (!profile || profile.active === false) {
      throw new Error("Your family profile is not active");
    }
    const room = await this._familyRoomStore.get(roomId);
    if (!room || room.active === false) {
      throw new Error(`Family room not found: ${roomId}`);
    }
    if (!room.memberProfileIds.includes(profileId)) {
      throw new Error("You are not a member of this family room");
    }

    const threadKey = `room:${room.roomId}`;
    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const meshPeerId = this._mesh?.peerId ?? "";
    const msg: ChatMessage = {
      messageId,
      sender: {
        nodeId: meshPeerId,
        ownerId: profileId,
        displayName: profile.name,
        actorRole: "human",
      },
      recipient: {
        nodeId: meshPeerId,
        ownerId: threadKey,
        displayName: room.title,
      },
      content: { text },
      metadata: {
        timestamp: now,
        deliveryReceipt: "delivered",
        deliveryChannel: "chat",
      },
      signature: "",
    };
    this._persistChatMessage(threadKey, msg);
    for (const memberId of room.memberProfileIds) {
      this.emit("chat:family-room-message", {
        roomId: room.roomId,
        message: msg,
        targetProfileId: memberId,
        memberProfileIds: room.memberProfileIds,
      });
    }

    const homeOwnerId = this._profile?.owner?.ownerId;
    if (homeOwnerId) {
      for (const memberId of room.memberProfileIds) {
        if (memberId === profileId) continue;
        if (this.isProfileOnline(memberId)) continue;
        void pushNotificationService
          .dispatchChatPush({
            senderName: profile.name,
            messagePreview: text.slice(0, 120),
            targetOwnerId: homeOwnerId,
            targetProfileId: memberId,
            messageId,
            threadType: "room",
            // Bare room UUID (matches mesh push + EnvoyGo chatRoomId).
            roomId: room.roomId,
            roomKind: "family",
            threadKey,
            senderOwnerId: profileId,
          })
          .catch(() => {});
      }
    }

    try {
      await this._familyProfileStore.update({ id: profileId, lastSeenAt: now });
    } catch {
      /* best-effort */
    }

    return { messageId, threadKey };
  }

  /** Phase 51 — best-effort presence stamp for a family profile. */
  async touchFamilyProfileLastSeen(profileId: string): Promise<void> {
    if (!this._familyProfileStore) return;
    const id = profileId.trim() || OWNER_FAMILY_PROFILE_ID;
    try {
      await this._familyProfileStore.update({
        id,
        lastSeenAt: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
  }

  private async _ensureFamilyOwnerMigrated(): Promise<void> {
    if (this._familyOwnerMigrated || !this._familyProfileStore) return;
    const displayName =
      (await this._humanProfileStore.loadHumanProfile())?.displayName?.trim() ||
      this._profile?.owner.ownerId?.replace(/^envoy:owner:/, "").slice(0, 12) ||
      "Owner";
    await this._familyProfileStore.ensureOwnerProfile({ name: displayName });
    // Phase 51B — migrate node-config.aiBots → owner profile when empty.
    try {
      const owner = await this._familyProfileStore.getOwner();
      if (owner && (!Array.isArray(owner.aiBots) || owner.aiBots.length === 0)) {
        const cfg = await this._configStore.load();
        const bots = cfg?.aiBots;
        if (Array.isArray(bots) && bots.length > 0) {
          await this._familyProfileStore.update({
            id: owner.id,
            aiBots: bots,
          });
        }
      }
    } catch (err) {
      console.warn("[family] aiBots migration failed:", err);
    }
    this._familyOwnerMigrated = true;
    await this._refreshFamilyProfileActiveCache();
  }

  /** Resolve session profileId with owner backfill (Phase 51). */
  resolveSessionProfileId(profileId: string | undefined): string {
    const trimmed = profileId?.trim();
    return trimmed || OWNER_FAMILY_PROFILE_ID;
  }

  async redeemCompanyInvite(
    params: RedeemCompanyInviteParams,
  ): Promise<RedeemCompanyInviteResult> {
    const token = params.token?.trim();
    if (!token) {
      return { ok: false, reason: "missing-token" };
    }
    const targetOwnerId = params.ownerId?.trim();
    if (!targetOwnerId) {
      return { ok: false, reason: "missing-owner-id" };
    }

    // 1) Seed connectivity so this node can reach the issuer. The invite's
    //    wsUrl points at the issuer's home node; record it as a manual
    //    discovery seed so subsequent searchPeers/sendHello can dial it.
    const wsUrl = params.wsUrl?.trim();
    if (wsUrl && this._discoverySeedStore) {
      try {
        await this._discoverySeedStore.upsertMany([wsUrl], "manual-bootstrap");
      } catch (err) {
        console.warn("[redeemCompanyInvite] seed upsert failed:", err);
      }
    }

    // 2) Send a hello to the issuer's owner to establish the bond. Mirrors
    //    the working Setup Sponsor Friend flow.
    try {
      const humanProfile = await this._humanProfileStore.loadHumanProfile();
      const helloProfile = {
        displayName: humanProfile?.displayName ?? "Envoy User",
        bio: humanProfile?.bio ?? "",
        interests: [
          ...(humanProfile?.hobbies ?? []),
          ...(humanProfile?.knowledge ?? []),
        ],
        whatShares: [],
      };
      const helloMessage =
        params.helloMessage?.trim() || "Hi — I'd like to join your fleet.";
      const hello = await this.sendHello(targetOwnerId, helloProfile, helloMessage, {
        proofOfContext: token,
      });
      return {
        ok: true,
        ownerId: targetOwnerId,
        helloMessageId: hello.messageId,
      };
    } catch (err) {
      return {
        ok: false,
        ownerId: targetOwnerId,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async syncPairingKioskFromConfig(): Promise<void> {
    // Public RPC entry point — delegates to the private method which is
    // also called from `updateNodeConfig` and `startNode`.
    await this._syncPairingKioskFromConfig();
  }

  async getPairingKioskStatus(): Promise<import("@envoymesh/api").PairingKioskStatus> {
    return this._getPairingKioskStatus();
  }

  // -----------------------------------------------------------
  // Phase 35B — Fleet Manifest
  // -----------------------------------------------------------

  async importFleetManifest(
    params: ImportFleetManifestParams,
  ): Promise<ImportFleetManifestOutcome> {
    return importFleetManifestViaPublicRuntime(this._fleetPublicDeps(), params);
  }

  async listFleetManifests(): Promise<ListFleetManifestsResult> {
    return listFleetManifestsViaPublicRuntime(this._fleetPublicDeps());
  }

  async revokeFleetManifest(manifestId: string): Promise<RevokeFleetManifestResult> {
    return revokeFleetManifestViaPublicRuntime(this._fleetPublicDeps(), manifestId);
  }

  async createFleetManifest(
    input: CreateFleetManifestInput,
  ): Promise<CreateFleetManifestResult> {
    return createFleetManifestViaPublicRuntime(this._fleetPublicDeps(), input);
  }

  /**
   * Pair a mobile device after QR-code scan.
   *
   * Validates the short-lived QR pairing token, creates a persistent session
   * token for future reconnections, and sets up a "direct" trust record.
   */
  async pairDevice(params: PairDeviceParams): Promise<PairDeviceResult> {
    await this._assertReviewTokenNotAllowedForPairingOrThrow(params.pairingToken);
    return pairDeviceViaRuntime(this._pairDeviceContext(), params);
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
    await this._assertReviewTokenNotAllowedForPairingOrThrow(params.pairingToken);
    return pairSharedIdentityViaRuntime(
      this._pairSharedIdentityContext(),
      createDeviceCertificate as never,
      encryptOwnerKeyForDevice as never,
      params,
    );
  }

  /** Mobile → Home: Update the mobile's reachable listen addresses (from UPnP).
   *
   * When the mobile gets a UPnP-mapped port, it calls this to tell the home node
   * "you can reach me at /ip4/X.X.X.X/tcp/4001". The home node stores this in the
   * peer directory so it can dial the mobile directly instead of requiring relay.
   */
  async updateMyListenAddrs(params: import("@envoymesh/api").UpdateMyListenAddrsParams): Promise<import("@envoymesh/api").UpdateMyListenAddrsResult> {
    const { peerId, listenAddrs, ownerId } = params;
    if (!peerId || !listenAddrs?.length) {
      return { ok: false };
    }
    try {
      // If the mobile provides its ownerId, use ensurePeerFromInboundChat to create
      // a record keyed by the real ownerId — not the placeholder ownerId=peerId.
      // This ensures _resolvePeerTransportForOwner can find the address even when
      // the mobile first connected via relay (which creates a separate record with
      // the relay's peerId and empty addresses).
      if (ownerId?.trim()) {
        await this._peerDirectoryStore.ensurePeerFromInboundChat({
          ownerId: ownerId.trim(),
          peerId,
          listenAddrs,
        });
        return { ok: true };
      }
      // No ownerId provided — fall back to peerId-keyed stub.
      const existing = await this._peerDirectoryStore.getPeerByPeerId(peerId);
      if (existing) {
        await this._peerDirectoryStore.mergeListenAddrsForPeerId(peerId, listenAddrs);
      } else {
        await this._peerDirectoryStore.ensurePeerByPeerId({ peerId, listenAddrs });
      }
      return { ok: true };
    } catch (err) {
      console.warn(`[node-service] updateMyListenAddrs failed for ${peerId?.slice(0, 12)}:`, err);
      return { ok: false };
    }
  }

  async pairWithHomeNode(_params: import("@envoymesh/api").PairWithHomeNodeParams): Promise<import("@envoymesh/api").PairWithHomeNodeResult> {
    throw new Error("pairWithHomeNode is only supported on the mobile app");
  }

  /**
   * Phase 35A — atomically consume a company-invite token for the given
   * device. Emits a `message.rejected` audit when the consume fails so the
   * operator can see replay attempts in the audit log. Throws the same
   * error message the previous inline paths used, so RPC clients see
   * consistent errors.
   */
  private async _consumeCompanyInviteOrThrow(
    pairingToken: string,
    requesterOwnerId: string,
    requesterDeviceId: string,
  ): Promise<void> {
    if (!this._taskStore) return;
    const invite = await this._taskStore.findCompanyInviteByToken(pairingToken.trim());
    if (!invite) return;
    // Store-review token: leave the invite unconsumed so multiple reviewers
    // (and owner QR using the same tok) can pair during the review window.
    const review = resolveReviewPairing(
      await this._configStore.load().catch(() => null),
    );
    if (isActiveReviewPairingToken(review, pairingToken)) return;
    const consumed = await consumeCompanyInviteViaRuntime(
      this._taskStore,
      pairingToken,
      requesterDeviceId,
    );
    if (consumed) return;
    await this._taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.rejected",
        intent: "device.pair.request",
        outcome: "deny",
        summary: `Company-invite replay denied: inviteId=${invite.inviteId} requesterOwnerId=${requesterOwnerId} requesterDeviceId=${requesterDeviceId}`,
        remotePeerId: requesterOwnerId,
      }),
    );
    throw new Error("Company invite token is revoked, expired, or already used by another device");
  }

  async pairThinClient(params: import("@envoymesh/api").PairThinClientParams): Promise<import("@envoymesh/api").PairThinClientResult> {
    const pairingToken = params.pairingToken?.trim();
    if (!pairingToken) {
      throw new Error("pairingToken is required");
    }

    const valid = await this.validatePairingToken(pairingToken);
    if (!valid) {
      throw new Error("Invalid or expired pairing token");
    }

    await this._ensureFamilyOwnerMigrated();
    if (!this._familyProfileStore) {
      throw new Error("Family profile store is not available");
    }

    const deviceName = params.deviceName?.trim() || "EnvoyGo";
    const platform = params.platform?.trim() || "flutter";
    const clientDeviceId = params.deviceId?.trim();
    const deviceId =
      clientDeviceId && clientDeviceId.length >= 8
        ? `thin-client:${clientDeviceId}`
        : `thin-client:${deviceName.toLowerCase().replace(/\s+/g, "-")}:${platform}`;

    const invite = this._taskStore
      ? await this._taskStore.findCompanyInviteByToken(pairingToken)
      : undefined;
    const review = resolveReviewPairing(
      await this._configStore.load().catch(() => null),
    );
    const reviewReusable = isActiveReviewPairingToken(review, pairingToken);
    // Family-only review mode (Apple): ANY active review token — owner or the
    // derived family form — binds the scanner as a family member, never owner.
    const isFamilyInvite =
      invite?.kind === "family" || (review?.familyOnly === true && reviewReusable);

    if (isFamilyInvite && invite) {
      if (invite.revokedAt) throw new Error("Family invite token has been revoked");
      if (Date.parse(invite.expiresAt) <= Date.now()) {
        throw new Error("Family invite token has expired");
      }
      if (
        !reviewReusable &&
        invite.usedAt &&
        invite.usedByDeviceId &&
        invite.usedByDeviceId !== deviceId
      ) {
        throw new Error(
          "Family invite token was already used by another device. Ask the home owner to show a new family invite QR, then choose I'm back and select your profile.",
        );
      }
    }

    let profile = await this._familyProfileStore.getOwner();
    if (!profile) {
      profile = await this._familyProfileStore.ensureOwnerProfile({
        name: params.profileName?.trim() || "Owner",
        avatarColor: params.profileAvatarColor,
      });
    }

    if (isFamilyInvite) {
      const requestedId = params.profileId?.trim();
      if (requestedId) {
        const existing = await this._familyProfileStore.get(requestedId);
        if (!existing || !existing.active) {
          throw new Error(`Family profile not found: ${requestedId}`);
        }
        if (existing.isOwner) {
          throw new Error("Family invite cannot bind to the owner profile — use the normal pairing QR");
        }
        profile = existing;
      } else {
        // In family-only review mode the reviewer scans the "owner" QR shape
        // (envoy://pair) which may carry no family profile name — default to the
        // device name so the reviewer still lands as a family member.
        const name =
          params.profileName?.trim() ||
          (review?.familyOnly === true ? deviceName || "Reviewer" : "");
        if (!name) {
          throw new Error("profileName is required when creating a family profile");
        }
        profile = await this._familyProfileStore.create({
          name,
          avatarColor: params.profileAvatarColor,
          isOwner: false,
        });
      }
      await this._consumeCompanyInviteOrThrow(pairingToken, "family-member", deviceId);
    } else {
      // Normal owner pairing — consume company invite if present, then bind owner.
      await this._consumeCompanyInviteOrThrow(pairingToken, "thin-client", deviceId);
      const name = params.profileName?.trim();
      if (name && profile.isOwner && name !== profile.name) {
        profile = await this._familyProfileStore.update({
          id: profile.id,
          name,
          avatarColor: params.profileAvatarColor ?? profile.avatarColor,
        });
      }
    }

    const sessionToken = randomUUID();
    const now = new Date().toISOString();
    if (this._sessionTokenStore) {
      await this._sessionTokenStore.setToken({
        token: sessionToken,
        ownerId: this._profile?.owner.ownerId ?? "",
        deviceId,
        profileId: profile.id,
        // Family invite only — never set on owner QR so intentional owner
        // pairs cannot silently repair into Mom/Dad.
        boundFamilyProfileId: profile.isOwner === true ? undefined : profile.id,
        platform,
        displayName: deviceName,
        createdAt: now,
        lastUsedAt: now,
      });
    }

    const ownerId = this._profile?.owner.ownerId ?? "";
    const familyProfiles = (await this._familyProfileStore.list()).map(toFamilyProfile);
    try {
      const full = await this.getNodeConfig();
      this.emit("home:config-updated", { config: full });
    } catch {
      /* ignore */
    }

    return {
      sessionToken,
      ownerId,
      profileId: profile.id,
      isOwnerProfile: profile.isOwner === true,
      familyProfiles,
    };
  }

  /**
   * Persist profileId heal from `boundFamilyProfileId` (no RPC caller).
   * Used at WS connect when the in-memory session was already corrected.
   */
  async healSessionProfileFromBinding(
    record: import("@envoymesh/local-store").SessionTokenRecord,
    profileId: string,
  ): Promise<void> {
    if (!this._sessionTokenStore) return;
    const requested = profileId.trim();
    if (!requested || requested === OWNER_FAMILY_PROFILE_ID) return;
    const binding = record.boundFamilyProfileId?.trim();
    if (binding && binding !== requested) return;
    await this._sessionTokenStore.setToken({
      ...record,
      profileId: requested,
      boundFamilyProfileId: binding ?? requested,
      lastUsedAt: new Date().toISOString(),
    });
    console.log(
      `[node-service] healed session token for device ${record.deviceId}: owner → ${requested}`,
    );
  }

  /**
   * Re-bind a thin-client session to a family profile when the token was
   * missing profileId (legacy) or profileId was corrupted to `"owner"`.
   * Never escalates Mom→owner. Will not switch away from a different
   * immutable `boundFamilyProfileId`.
   */
  async repairSessionProfile(
    params: import("@envoymesh/api").RepairSessionProfileParams,
  ): Promise<import("@envoymesh/api").RepairSessionProfileResult> {
    const caller = getRpcCaller();
    if (!caller || caller.source !== "session" || !caller.deviceId) {
      throw new Error("repairSessionProfile requires an authenticated thin-client session");
    }
    const requested = params.profileId?.trim() ?? "";
    if (!requested) throw new Error("profileId is required");
    await this._ensureFamilyOwnerMigrated();
    if (!this._familyProfileStore || !this._sessionTokenStore) {
      throw new Error("Family / session stores are not available");
    }
    const profile = await this._familyProfileStore.get(requested);
    if (!profile || profile.active === false) {
      throw new Error(`Family profile not found: ${requested}`);
    }
    if (profile.isOwner) {
      throw new Error("Cannot repair session to the owner profile — use the normal pairing QR");
    }
    const current = caller.profileId?.trim() || OWNER_FAMILY_PROFILE_ID;
    if (current === requested) {
      return { ok: true, profileId: requested, isOwnerProfile: false };
    }
    if (current !== OWNER_FAMILY_PROFILE_ID) {
      throw new Error(
        `Session already bound to profile "${current}" — re-pair to switch profiles`,
      );
    }
    const tokens = await this._sessionTokenStore.listTokens();
    const record = tokens.find((t) => t.deviceId === caller.deviceId);
    if (!record) {
      throw new Error("No session token found for this device");
    }
    const storedProfileId = record.profileId?.trim();
    const binding = record.boundFamilyProfileId?.trim();
    if (storedProfileId === requested) {
      // Backfill binding on older family tokens so future owner-corruption
      // can still repair without a fresh invite.
      if (binding !== requested) {
        await this._sessionTokenStore.setToken({
          ...record,
          boundFamilyProfileId: requested,
          lastUsedAt: new Date().toISOString(),
        });
      }
      return { ok: true, profileId: requested, isOwnerProfile: false };
    }
    // Allow repair when:
    // 1) legacy token never stored profileId, or
    // 2) profileId is owner and either has no immutable binding (UI says
    //    Mom/Dad from local pairing intent — only family clients call this)
    //    or boundFamilyProfileId matches the requested profile.
    // Reject switching to a *different* family profile than the binding.
    const canRepair =
      !storedProfileId ||
      (storedProfileId === OWNER_FAMILY_PROFILE_ID &&
        (!binding || binding === requested));
    if (!canRepair) {
      throw new Error(
        binding && binding !== requested
          ? `Session is bound to family profile "${binding}" — re-pair to switch`
          : `Session already bound to profile "${storedProfileId}" — re-pair to switch`,
      );
    }
    await this._sessionTokenStore.setToken({
      ...record,
      profileId: requested,
      boundFamilyProfileId: requested,
      lastUsedAt: new Date().toISOString(),
    });
    console.log(
      `[node-service] repaired session for device ${caller.deviceId}: ${storedProfileId ?? "(missing profileId)"} → ${requested}`,
    );
    return { ok: true, profileId: requested, isOwnerProfile: false };
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

  async mergeAuthorizedDevices(
    params: MergeAuthorizedDevicesParams,
  ): Promise<MergeAuthorizedDevicesResult> {
    if (!this._deviceAuthorizationStore) {
      throw new Error("Device authorization store is not available");
    }
    const keepDeviceId = params.keepDeviceId?.trim();
    if (!keepDeviceId) {
      throw new Error("keepDeviceId is required");
    }
    const mergeDeviceIds = (params.mergeDeviceIds ?? [])
      .map((id) => id?.trim())
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (mergeDeviceIds.length === 0) {
      return { revocations: [] };
    }
    const profile = this._requireProfile();
    const revocations = await this._deviceAuthorizationStore.mergeAuthorizedDevices({
      owner: {
        ownerId: profile.owner.ownerId,
        publicKeyPem: profile.owner.publicKeyPem,
        privateKeyPem: profile.owner.privateKeyPem,
      },
      keepDeviceId,
      mergeDeviceIds,
      reason: params.reason,
    });
    // Drop any session tokens bound to the merged-away devices so
    // they cannot reconnect with the old keypair.
    if (this._sessionTokenStore) {
      for (const mergedId of mergeDeviceIds) {
        if (mergedId === keepDeviceId) continue;
        await this._sessionTokenStore.removeTokenByDeviceId(mergedId);
      }
    }
    // Audit the dedup so it shows up in the activity timeline.
    if (this._taskStore) {
      await this._taskStore.appendAuditEvent(
        createAuditEvent({
          type: "device.merge",
          intent: "device.merge",
          outcome: "record",
          summary: `Merged ${mergeDeviceIds.length} duplicate device record(s) into ${keepDeviceId.slice(0, 24)}…`,
          remotePeerId: keepDeviceId,
        }),
      );
    }
    return { revocations };
  }

  async pruneRevokedDevices(): Promise<PruneRevokedDevicesResult> {
    if (!this._deviceAuthorizationStore) {
      return { prunedDeviceIds: [] };
    }
    const prunedDeviceIds = await this._deviceAuthorizationStore.pruneRevokedDevices();
    // Drop any session tokens bound to the pruned devices.
    if (this._sessionTokenStore) {
      for (const deviceId of prunedDeviceIds) {
        await this._sessionTokenStore.removeTokenByDeviceId(deviceId);
      }
    }
    if (prunedDeviceIds.length > 0 && this._taskStore) {
      await this._taskStore.appendAuditEvent(
        createAuditEvent({
          type: "device.revoked",
          intent: "device.revoke",
          outcome: "record",
          summary: `Pruned ${prunedDeviceIds.length} revoked device record(s) from the authorized list`,
        }),
      );
    }
    return { prunedDeviceIds };
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
    return deriveRelayWsUrl(relayAddr);
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
      const hints =
        dialHints?.length ? dialHints : await this._dialHintsForChat(transportPeerId, undefined);
      await this._deliverCallEnvelope(transportPeerId, envelope, hints);
    }

    // Tag reachability for the transport peer
    void this._tagBondedContactReachability(transportPeerId);
  }

  async getPeerConnectionInfo(peerOwnerId: string): Promise<PeerConnectionInfo> {
    return getPeerConnectionInfoViaRuntime(this._outboundMessagingContext(), peerOwnerId);
  }

  async warmContactConnection(
    peerOwnerId: string,
    options?: WarmContactConnectionOptions,
  ): Promise<PeerConnectionInfo> {
    // PeerPath facade: dial concurrency + soft connection cap + policy inside warm.
    return ensureContactPath(this._outboundMessagingContext(), peerOwnerId, options);
  }

  private async _warmContactConnectionTransport(
    transportPeerId: string,
    listenAddrs: string[] | undefined,
    options?: WarmContactConnectionOptions,
  ): Promise<PeerConnectionInfo> {
    return warmContactConnectionTransportViaRuntime(
      this._outboundMessagingContext(),
      transportPeerId,
      listenAddrs,
      options,
    );
  }

  private _startBondWarmInterval(): void {
    startBondWarmIntervalViaRuntime(this._reachabilityContext());
    // Don't wait for the 45s first warm tick — catch up as soon as we go online.
    void this._flushFeedNotifyOutbox().catch((err) =>
      console.warn(
        "[feed.notify] outbox flush on online failed:",
        err instanceof Error ? err.message : err,
      ),
    );
    void this._flushFeedEngageOutbox().catch((err) =>
      console.warn(
        "[feed.engage] outbox flush on online failed:",
        err instanceof Error ? err.message : err,
      ),
    );
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
    const effectiveProviders = await this.getEffectiveModelProviders();
    console.log(
      `[knowledgeQuery] effective.modelProviders.mode=${effectiveProviders.mode} (saved=${nodeConfig.modelProviders.mode})`,
    );

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
      modelProviders: effectiveProviders,
      isLocalSelfQuery: true,
      ownerApproved: true, // Local owner queries are implicitly approved
      knowledgeBase: nodeConfig.aiSettings?.knowledgeBase,
      chatLogStore: this._chatLogStore,
      humanProfileStore: this._humanProfileStore,
      agentIdentityStore: this._agentIdentityStore,
      ragService,
      profileDir: this._profileDir,
    });

    if (!result.ok) {
      throw new Error(result.reason);
    }

    return result.responsePayload.answer;
  }

  async draftAuthorContent(
    params: import("@envoymesh/api").DraftAuthorContentParams,
  ): Promise<import("@envoymesh/api").DraftAuthorContentResult> {
    const mesh = this._reachableMesh();
    const taskStore = this._taskStore;
    if (!mesh || !taskStore) {
      return { ok: false, reason: "node_not_initialized" };
    }
    const nodeConfig = await this.getNodeConfig();
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
    const { generateAuthorContentDraft } = await import("./author-content-draft.js");
    return generateAuthorContentDraft({
      params: { ...params, profileContext },
      modelProviders: nodeConfig.modelProviders,
      taskStore,
      requesterPeerId: mesh.peerId,
    });
  }

  async runDocumentAgentTurn(message: string): Promise<DocumentAgentTurnResult> {
    return runDocumentAgentTurnViaRuntime(this._runDocumentAgentTurnContext(), message);
  }

  private async _runDocumentAgentTurnCore(
    message: string,
  ): Promise<DocumentAgentTurnResult> {
    return runDocumentAgentTurnCoreViaRuntime(
      this._runDocumentAgentTurnContext(),
      ((input) => runDocumentAgentTurnLoop(input as never)) as RunDocumentAgentTurnLoop,
      message,
    );
  }

  async runOwnerAgentTurn(
    message: string,
    options?: import("@envoymesh/api").RunOwnerAgentTurnOptions,
  ): Promise<OwnerAgentTurnResult> {
    return runOwnerAgentTurnViaRuntime(this._runOwnerAgentTurnContext(), message, options);
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
    if (identity) {
      if (bridgeAgentScopeNeedsRefresh(identity.agentCredential.scope)) {
        identity = {
          ...identity,
          agentCredential: createAgentCredential({
            owner: profile.owner,
            agent: {
              agentId: identity.agentCredential.agentId,
              agentPeerId: identity.agentPeerId,
              publicKeyPem: identity.agentPublicKeyPem,
              privateKeyPem: identity.agentPrivateKeyPem,
            },
            scope: [...BRIDGE_AGENT_SCOPE],
          }),
        };
        await saveBridgeIdentity(this._profileDir, identity);
        console.log(
          `[bridge] expanded agent credential scope for agent.card: ${identity.agentPeerId}`,
        );
      }
      return identity;
    }
    const agent = generateAgentIdentity(profile.owner.ownerId);
    identity = {
      agentPeerId: agent.agentPeerId,
      agentPublicKeyPem: agent.publicKeyPem,
      agentPrivateKeyPem: agent.privateKeyPem,
      ownerId: profile.owner.ownerId,
      agentCredential: createAgentCredential({
        owner: profile.owner,
        agent,
        scope: [...BRIDGE_AGENT_SCOPE],
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
      createNote: (params) => this.createNote(params),
      exportNotesToLinkedObsidian: (params) => this.exportNotesToLinkedObsidian(params),
      exportNotesToMcp: (params) => this.exportNotesToMcp(params),
      submitAgentShareProposal: (params) => this.submitAgentShareProposal(params),
      getBonds: () => this.getBonds(),
      sendChat: (targetOwnerId, text) => this.sendAgentChat(targetOwnerId, text),
      listPendingApprovals: () => this.listPendingApprovals(),
      approvePendingApproval: (itemId, notes) => this.approvePendingApproval(itemId, notes),
      rejectPendingApproval: (itemId, notes) => this.rejectPendingApproval(itemId, notes),
      enqueueToolApproval: async ({ toolName, params, reason }) => {
        if (!this._approvalQueue) {
          return { ok: false as const, error: "approval queue not available" };
        }
        const item = createApprovalItem(
          "tool_call",
          `Tool: ${toolName}`,
          reason,
          JSON.stringify({ toolName, params }),
          {
            contactOwnerId:
              typeof params.targetOwnerId === "string" ? params.targetOwnerId : undefined,
            metadata: { toolName, params },
          },
          "high",
        );
        this._approvalQueue.add(item);
        return { ok: true as const, itemId: item.id };
      },
      requestAgentCard: (targetOwnerId) => this.requestAgentCard(targetOwnerId),
      getAgentCard: (ownerId) => this.getAgentCard(ownerId),
      listAgentCards: () => this.listAgentCards(),
      listAgentNetworkWorkers: async (params) => {
        const capability = params?.requiredSkill?.trim() || "task.execute";
        const limit = Math.max(1, Math.min(50, params?.limit ?? 20));
        const chainDeps = this._chainOrchestrationContext();
        const ranked = await findAgentNetworkWorkersRanked(chainDeps, capability);
        const cards = await listAgentCardsIncludingLocal(chainDeps);
        const byPeer = new Map(cards.map((c) => [c.sourceAgentPeerId, c] as const));
        return ranked.slice(0, limit).map((r) => {
          const card = byPeer.get(r.peerId);
          return {
            peerId: r.peerId,
            ownerId: card?.ownerId,
            displayName: card?.displayName,
            score: r.score,
            summary: r.summary,
            profile: card?.agentNetworkProfile,
          };
        });
      },
      probeAgentNetworkPeer: async (params) => {
        const cards = await this.listAgentCards();
        let ownerId = params.ownerId?.trim();
        let peerId = params.peerId?.trim();
        if (!ownerId && peerId) {
          ownerId = cards.find((c) => c.sourceAgentPeerId === peerId)?.ownerId;
        }
        if (!ownerId) {
          return { ok: false, error: "ownerId or known peerId required" };
        }
        const refresh = params.refresh !== false;
        if (refresh) {
          const req = await this.requestAgentCard(ownerId);
          if (!req.ok) {
            return { ok: false, error: req.error ?? "agent.card.request failed", ownerId };
          }
        }
        const card = await this.getAgentCard(ownerId);
        if (!card) {
          return { ok: false, error: "card_not_cached", ownerId };
        }
        peerId = card.sourceAgentPeerId;
        let sameLan = false;
        try {
          const peer = await this._peerDirectoryStore.getPeerByOwnerId(card.ownerId);
          sameLan = hasDirectPrivateLanDialHints(peer?.listenAddrs ?? []);
        } catch {
          /* ignore */
        }
        const scored = scoreAgentNetworkWorker({
          requiredSkill: "task.execute",
          membership: card.membership ?? [],
          profile: card.agentNetworkProfile,
          displayName: card.displayName,
          sameLan,
        });
        return {
          ok: true,
          ownerId: card.ownerId,
          peerId,
          displayName: card.displayName,
          membership: card.membership,
          profile: card.agentNetworkProfile,
          score: scored.score,
          summary: scored.summary,
          sameLan,
        };
      },
      getLocalCapabilityManifest: async () => {
        const manifest = await this.getCapabilityManifest();
        if (!manifest) return undefined;
        return { capabilities: manifest.capabilities, keywords: manifest.keywords };
      },
      listBondedAgentCapabilities: async () => {
        const cards = await this.listAgentCards();
        return cards.map((card) => ({
          ownerId: card.ownerId,
          membership: card.membership,
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
      // Phase 48A — MCP Tool Consumer. Manager dials configured MCP servers
      // via @modelcontextprotocol/sdk (stdio / Streamable HTTP).
      mcpConsumerManager: config?.mcpConsumers?.length
        ? createMcpConsumerManager(config.mcpConsumers)
        : undefined,
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
    if (event === "peer:discovered") {
      const peer = data as PeerSearchResult;
      const nodeId = peer?.nodeId?.trim();
      if (nodeId) {
        const prev = this._nearbyDiscoveredByPeerId.get(nodeId);
        const incomingOk =
          peer.profileStatus === "resolved" && Boolean(peer.ownerId?.trim());
        const prevOk =
          prev?.profileStatus === "resolved" && Boolean(prev.ownerId?.trim());
        // Sticky Discover: never replace a good card with unreachable/empty
        // noise from a single failed re-probe (Refresh used to wipe peers).
        if (prevOk && !incomingOk) {
          return;
        }
        this._nearbyDiscoveredByPeerId.set(nodeId, peer);
      }
    } else if (event === "peer:lost") {
      const nodeId = (data as { nodeId?: string })?.nodeId?.trim();
      if (nodeId) this._nearbyDiscoveredByPeerId.delete(nodeId);
    }
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

  /**
   * Phase 50 fix — push skip-if-online must mean "EnvoyGo thin-client has an
   * authenticated WebSocket", NOT "owner presence" (`isOwnerOnline`).
   *
   * Desktop Social connects without a session token and records owner
   * activity on every RPC. Using `isOwnerOnline()` for push therefore
   * suppressed EnvoyGo alerts whenever Social was open (or when no AI
   * status was configured — that path defaults to online).
   *
   * Bound from `index.ts` to `WsServer.hasRecentlyActiveClientForOwner`
   * (connected + recent RPC). A zombie background WS alone must not
   * suppress chat pushes.
   */
  private _thinClientOnlineCheck: ((ownerId: string) => boolean) | null = null;
  private _disconnectClientsForProfile: ((profileId: string) => number) | null = null;

  /** Wire the thin-client WS presence check used by push skip-if-online. */
  bindThinClientOnlineCheck(check: (ownerId: string) => boolean): void {
    this._thinClientOnlineCheck = check;
  }

  /** Phase 51 — per-profile thin-client presence (Dad online ≠ Mom online). */
  bindThinClientProfileOnlineCheck(check: (profileId: string) => boolean): void {
    this._thinClientProfileOnlineCheck = check;
  }

  /**
   * Phase 51 — force-close thin-client WebSockets for a family profile
   * (deactivate / wipe). Bound from index.ts to WsServer.disconnectClientsForProfile.
   */
  bindDisconnectClientsForProfile(fn: (profileId: string) => number): void {
    this._disconnectClientsForProfile = fn;
  }

  /**
   * True when EnvoyGo is recently active on an authenticated WebSocket
   * (see `hasRecentlyActiveClientForOwner`). Unbound / unknown → false
   * so push still fires (phone may be killed or backgrounded).
   */
  isThinClientOnline(ownerId?: string): boolean {
    const id = (ownerId ?? this._profile?.owner?.ownerId ?? "").trim();
    if (!id || !this._thinClientOnlineCheck) return false;
    try {
      return this._thinClientOnlineCheck(id);
    } catch {
      return false;
    }
  }

  /** Phase 51 — true when a thin client for this family profile is recently active. */
  isProfileOnline(profileId?: string): boolean {
    const id = (profileId ?? OWNER_FAMILY_PROFILE_ID).trim() || OWNER_FAMILY_PROFILE_ID;
    // Deactivated profiles are never "online" for push skip (even if a zombie WS remains).
    if (this._familyProfileActiveCache.get(id) === false) return false;
    if (this._thinClientProfileOnlineCheck) {
      try {
        return this._thinClientProfileOnlineCheck(id);
      } catch {
        return false;
      }
    }
    // Fallback: owner profile uses the legacy owner-scoped check.
    if (id === OWNER_FAMILY_PROFILE_ID) {
      return this.isThinClientOnline();
    }
    return false;
  }

  private _familyProfileActiveCache = new Map<string, boolean>();

  private async _refreshFamilyProfileActiveCache(): Promise<void> {
    if (!this._familyProfileStore) return;
    try {
      const profiles = await this._familyProfileStore.list();
      this._familyProfileActiveCache.clear();
      for (const p of profiles) {
        this._familyProfileActiveCache.set(p.id, p.active !== false);
      }
    } catch {
      /* ignore */
    }
  }

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
  // ------------------------------------------------------------------
  // Phase 31I — Push Notifications
  // ------------------------------------------------------------------

  registerPushToken(params: {
    platform: string;
    token: string;
    ownerId: string;
    deviceId?: string;
    tokenType?: "alert" | "voip";
    profileId?: string;
  }): void {
    // Thin clients often omit ownerId; tokens belong to this home node's owner.
    const ownerId =
      (params.ownerId && params.ownerId.trim()) ||
      this._profile?.owner.ownerId ||
      "";
    if (!params.token?.trim()) {
      console.warn("[push] registerPushToken ignored — empty token");
      return;
    }
    if (!ownerId) {
      console.warn("[push] registerPushToken ignored — no ownerId (profile not loaded?)");
      return;
    }
    const profileId =
      (params.profileId && params.profileId.trim()) ||
      getRpcCaller()?.profileId?.trim() ||
      OWNER_FAMILY_PROFILE_ID;
    pushNotificationService.registerPushToken({
      ...params,
      ownerId,
      profileId,
      token: params.token.trim(),
    });
    const tokenType = params.tokenType === "voip" ? "voip" : "alert";
    console.log(
      `[push] registered ${tokenType} token platform=${params.platform} owner=${ownerId} profile=${profileId} token=${params.token.trim().slice(0, 12)}…`,
    );
  }

  unregisterPushToken(deviceId: string): boolean {
    return pushNotificationService.unregisterPushToken(deviceId);
  }

  // ------------------------------------------------------------------
  // Phase 40 — Agent Network Collaboration Layer (chains)
  //
  // The full orchestrator (chain-orchestrator.ts) owns the per-chain
  // state machine. For 40B.7 we expose the 11 RPCs as direct delegations
  // to the in-process runtime. The real orchestration is wired in 40B.8
  // (planner loop integration). 40B.7 wires only the RPC surface so the
  // UI can start calling it.
  // ------------------------------------------------------------------

  private readonly _chainStore = new ChainStore();

  async chainPlan(params: ChainPlanParams): Promise<ChainPlanResult> {
    void this.ensureChainMandateLoaded(params.chainMandateId);
    return chainPlanViaRuntime(this._chainContext(), {
      chainId: params.chainId,
      chainMandateId: params.chainMandateId,
      goal: params.goal,
      allowLlm: params.allowLlm ?? false,
    });
  }

  async chainLaunch(params: ChainLaunchParams): Promise<ChainLaunchResult> {
    const runtime = this._chainStore.getRuntime(params.chainId);
    if (!runtime) {
      return { chainId: params.chainId, proposed: 0, mandateBroadcastOk: false };
    }
    const deps = await this.buildChainOrchestratorDeps();
    const launch = await launchChain(deps, runtime.state, params.workersBySubtask);
    if (launch.ok) {
      this._startChainTracking(params.chainId);
      this._emitChainState(params.chainId);
    }
    return {
      chainId: params.chainId,
      proposed: launch.ok ? launch.proposed : 0,
      mandateBroadcastOk: launch.ok ? launch.mandateBroadcastOk : false,
    };
  }

  async chainGetState(params: ChainGetStateParams): Promise<ChainGetStateResult> {
    return chainGetStateViaRuntime(this._chainContext(), params);
  }

  async chainListActive(_params?: ChainListActiveParams): Promise<ChainListActiveResult> {
    return chainListActiveViaRuntime(this._chainContext());
  }

  async chainListObserved(
    params?: import("@envoymesh/api").ChainListObservedParams,
  ): Promise<import("@envoymesh/api").ChainListObservedResult> {
    return chainListObservedViaRuntime(this._chainContext(), params);
  }

  async chainCancel(params: ChainCancelParams): Promise<ChainCancelResult> {
    return cancelChainOwnerAction(this._chainOrchestrationContext(), params);
  }

  async chainReassignSubtask(
    params: import("@envoymesh/api").ChainReassignSubtaskParams,
  ): Promise<import("@envoymesh/api").ChainReassignSubtaskResult> {
    return reassignSubtaskOwnerAction(this._chainOrchestrationContext(), params);
  }

  async chainRetryInputDelivery(
    params: import("@envoymesh/api").ChainRetryInputDeliveryParams,
  ): Promise<import("@envoymesh/api").ChainRetryInputDeliveryResult> {
    return retryInputDeliveryOwnerAction(this._chainOrchestrationContext(), params);
  }

  async chainListReports(params?: ChainListReportsParams): Promise<ChainListReportsResult> {
    return chainListReportsViaRuntime(this._chainContext(), params);
  }

  async chainGetReport(params: ChainGetReportParams): Promise<ChainGetReportResult> {
    return chainGetReportViaRuntime(this._chainContext(), params);
  }

  async chainPinReport(params: ChainPinReportParams): Promise<ChainPinReportResult> {
    return chainPinReportViaRuntime(this._chainContext(), params);
  }

  async chainDeleteReport(params: ChainDeleteReportParams): Promise<ChainDeleteReportResult> {
    return chainDeleteReportViaRuntime(this._chainContext(), params);
  }

  async chainSetBidStrategy(params: ChainSetBidStrategyParams): Promise<ChainSetBidStrategyResult> {
    return chainSetBidStrategyViaRuntime(this._chainContext(), params);
  }

  async chainGetBidStrategy(params: ChainGetBidStrategyParams): Promise<ChainGetBidStrategyResult> {
    return chainGetBidStrategyViaRuntime(this._chainContext(), params);
  }

  async chainGetDefaults(_params: ChainGetDefaultsParams): Promise<ChainGetDefaultsResult> {
    return chainGetDefaultsViaRuntime(this._chainContext(), _params);
  }

  async chainSetDefaults(params: ChainSetDefaultsParams): Promise<ChainSetDefaultsResult> {
    return chainSetDefaultsViaRuntime(this._chainContext(), params);
  }

  async chainEvaluateBids(params: ChainEvaluateBidsParams): Promise<ChainEvaluateBidsResult> {
    return chainEvaluateBidsViaRuntime(this._chainContext(), params);
  }

  async chainCounterBid(params: ChainCounterBidParams): Promise<ChainCounterBidResult> {
    return chainCounterBidViaRuntime(this._chainContext(), params);
  }

  async chainRebalance(params: ChainRebalanceParams): Promise<ChainRebalanceResult> {
    return chainRebalanceViaRuntime(this._chainContext(), params);
  }

  private _chainOrchestrationContext(): ChainOrchestrationContext {
    return buildChainOrchestrationContext(this);
  }

  private _chainContext(): ChainContext {
    return buildChainContext(this._chainOrchestrationContext());
  }

  // --- private helpers (delegated to node-service-chain-orchestration.ts) ---

  private ensureChainMandateLoaded(mandateId: string): void {
    ensureChainMandateLoaded(this._chainOrchestrationContext(), mandateId);
  }

  private placeholderMandate(chainId: string, chainMandateId: string) {
    return placeholderMandate(chainId, chainMandateId);
  }

  private snapshotToResult(snap: ReturnType<typeof chainStateSnapshot>): ChainGetStateResult {
    return snapshotToResult(snap);
  }

  private bidsBySubtask(state: ChainState, now: Date = new Date()): NonNullable<ChainGetStateResult["bidsBySubtask"]> {
    return bidsBySubtask(state, now);
  }

  private async evaluateBidsAsync(state: ChainState, params: ChainEvaluateBidsParams): Promise<Awaited<ReturnType<typeof evaluateBids>>> {
    return evaluateBidsAsync(this._chainOrchestrationContext(), state, params);
  }

  async handleInboundChainEnvelope(envelope: EnvoyEnvelope): Promise<void> {
    return handleInboundChainEnvelope(this._chainOrchestrationContext(), envelope);
  }

  /** MAP — inbound `adapter.manifest` broadcast (owner-signed capability manifest). */
  async handleInboundCapabilityManifest(envelope: EnvoyEnvelope): Promise<boolean> {
    const contactStore = this._identityContext().getContactOwnerKeyStore();
    if (!contactStore) return false;
    const result = await handleInboundCapabilityManifest({
      envelope,
      store: this._chainOrchestrationContext().getChainSideState().remoteManifests,
      getOwnerPublicKey: async (ownerId) => {
        const row = await contactStore.get(ownerId);
        return row?.ownerPublicKeyPem;
      },
    });
    if (!result.handled) {
      console.warn(
        `[adapter.manifest] dropped from ${envelope.senderPeerId.slice(0, 16)}…: ${result.reason}`,
      );
    }
    return result.handled;
  }

  /**
   * MAP — start the periodic owner-signed manifest broadcast to bonded peers.
   * No-op (returns undefined) when the agent identity or profile is missing.
   * Callers should retain the returned `{ stop }` to shut the broadcaster down.
   */
  async startManifestBroadcaster(
    mesh: EnvoyMesh,
    opts?: { intervalMs?: number },
  ): Promise<{ stop: () => void } | undefined> {
    const profile = this.getProfile();
    const agentIdentity = await this._ensureAgentIdentity();
    if (!profile || !agentIdentity) {
      console.warn("[adapter.manifest] broadcaster skipped: agent identity/profile unavailable");
      return undefined;
    }
    const skills = await this._localManifestSkills();
    const runtime = skills === PI_SKILLS ? "pi" : "openclaw";
    const manifest = buildSignedCapabilityManifest({
      profile,
      agentPeerId: agentIdentity.agentPeerId,
      skills,
      runtime,
      runtimeVersion: "mesh-broadcast",
    });
    const identityCtx = this._identityContext();
    return startManifestBroadcaster({
      mesh: mesh as ManifestBroadcastMesh,
      manifest,
      agentPublicKeyPem: agentIdentity.agentPublicKeyPem,
      agentPrivateKeyPem: agentIdentity.agentPrivateKeyPem,
      bondOwnerIds: async () => {
        const bonds = await this.getBonds();
        return bonds
          .map((b) => b.peerOwnerId)
          .filter((id): id is string => Boolean(id));
      },
      resolveLibp2pPeer: async (ownerId) => {
        const resolved = await identityCtx.resolveLibp2pPeerForBondOwner(ownerId);
        if (!resolved) return undefined;
        return { peerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
      },
      dialHintsFor: (peerId, listenAddrs) => identityCtx.dialHintsForChat(peerId, listenAddrs),
      intervalMs: opts?.intervalMs,
      onError: (err) =>
        console.warn(
          "[adapter.manifest] broadcast cycle failed:",
          err instanceof Error ? err.message : err,
        ),
    });
  }

  /**
   * MAP §9.2 — inbound `scoreboard.rule` broadcast (federated verifier rules).
   * Verifies the signer owner against the contact key store, runs the local
   * validation gate, and on adoption appends an owner-signed `kept` row to
   * the local verifier scoreboard.
   */
  async handleInboundScoreboardRule(envelope: EnvoyEnvelope): Promise<boolean> {
    const contactStore = this._identityContext().getContactOwnerKeyStore();
    const scoreboard = await this._getVerifierScoreboard();
    const profile = this.getProfile();
    if (!contactStore || !scoreboard || !profile) return false;
    const result = await handleInboundScoreboardRule({
      envelope,
      getOwnerPublicKey: async (ownerId) => {
        const row = await contactStore.get(ownerId);
        return row?.ownerPublicKeyPem;
      },
      listRuntimes: () =>
        this._chainOrchestrationContext().isOpenClawReady()
          ? (["openclaw"] as AgentRuntime[])
          : [],
      getLocalPassRate: (runtime) => getLocalRuntimePassRate(runtime),
      scoreboard,
      ownerPrivateKeyPem: profile.owner.privateKeyPem,
    });
    if (!result.handled) {
      console.warn(
        `[scoreboard.rule] dropped from ${envelope.senderPeerId.slice(0, 16)}…: ${result.reason}`,
      );
    }
    return result.handled;
  }

  /**
   * MAP §9.2 — start the periodic federated-rule broadcast to bonded peers.
   * Cycles share the latest `kept` verifier-ruleset experiment per runtime
   * the node runs; cycles with nothing to share are skipped. No-op (returns
   * undefined) when the agent identity, profile, or scoreboard is unavailable.
   */
  async startScoreboardRuleBroadcaster(
    mesh: EnvoyMesh,
    opts?: { intervalMs?: number },
  ): Promise<{ stop: () => void } | undefined> {
    const profile = this.getProfile();
    const agentIdentity = await this._ensureAgentIdentity();
    const scoreboard = await this._getVerifierScoreboard();
    if (!profile || !agentIdentity || !scoreboard) {
      console.warn(
        "[scoreboard.rule] broadcaster skipped: agent identity/profile/scoreboard unavailable",
      );
      return undefined;
    }
    const identityCtx = this._identityContext();
    return startScoreboardRuleBroadcaster({
      mesh: mesh as ScoreboardRuleBroadcastMesh,
      scoreboard,
      runtimes: () =>
        this._chainOrchestrationContext().isOpenClawReady()
          ? (["openclaw"] as AgentRuntime[])
          : [],
      ownerPrivateKeyPem: profile.owner.privateKeyPem,
      signerOwnerId: profile.owner.ownerId,
      publisherPeerId: agentIdentity.agentPeerId,
      agentPublicKeyPem: agentIdentity.agentPublicKeyPem,
      agentPrivateKeyPem: agentIdentity.agentPrivateKeyPem,
      bondOwnerIds: async () => {
        const bonds = await this.getBonds();
        return bonds
          .map((b) => b.peerOwnerId)
          .filter((id): id is string => Boolean(id));
      },
      resolveLibp2pPeer: async (ownerId) => {
        const resolved = await identityCtx.resolveLibp2pPeerForBondOwner(ownerId);
        if (!resolved) return undefined;
        return { peerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
      },
      dialHintsFor: (peerId, listenAddrs) => identityCtx.dialHintsForChat(peerId, listenAddrs),
      intervalMs: opts?.intervalMs,
      onError: (err) =>
        console.warn(
          "[scoreboard.rule] broadcast cycle failed:",
          err instanceof Error ? err.message : err,
        ),
    });
  }

  /** Lazily build the local verifier scoreboard (§9.2), once a profile exists. */
  private async _getVerifierScoreboard(): Promise<VerifierScoreboard | null> {
    if (this._verifierScoreboard !== undefined) return this._verifierScoreboard;
    if (this._profileDir === "/tmp/unknown") return null;
    const profile = this.getProfile();
    if (!profile) return null;
    this._verifierScoreboard = new VerifierScoreboard({
      filePath: join(this._profileDir, "verifier-scoreboard.jsonl"),
      ownerPublicKeyPem: profile.owner.publicKeyPem,
    });
    return this._verifierScoreboard;
  }

  /** Skills for the node's own manifest, from the primary MAP runtime. */
  private async _localManifestSkills(): Promise<import("@envoymesh/protocol").SkillDescriptor[]> {
    if (this.getAgentNetworkWorkerEngine() === "ext") {
      try {
        const piStatus = await this.getPiStatus();
        if (piStatus.enabled) return PI_SKILLS;
      } catch {
        /* fall through to the canonical default */
      }
    }
    return OPENCLAW_SKILLS;
  }

  /** Same-stream reply for Assigner `task.chain.ready.request` (AN engine hello). */
  async handleInboundChainReadyRequest(
    envelope: EnvoyEnvelope,
    replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>,
  ): Promise<void> {
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity) {
      console.warn("[chain.ready] ignored: agent identity unavailable");
      return;
    }
    const { handleChainReadyRequestInbound } = await import("./chain-ready-probe.js");
    const result = await handleChainReadyRequestInbound({
      envelope,
      replyWithEnvelope,
      agentPeerId: agentIdentity.agentPeerId,
      agentPublicKeyPem: agentIdentity.agentPublicKeyPem,
      agentPrivateKeyPem: agentIdentity.agentPrivateKeyPem,
      agentCredential: agentIdentity.agentCredential,
      // Answer for THIS node's configured AN engine only (OpenClaw XOR Ext).
      engine: this.getAgentNetworkWorkerEngine(),
      isOpenClawReady: () => this.isOpenClawReady(),
      isExtAgentBridgeReady: () => this.isExtAgentBridgeReady(),
      probeExtAgent: async () => {
        const reach = await this.probeExtAgent();
        return { reachable: reach.reachable === true };
      },
    });
    if (!result.ok) {
      console.warn(`[chain.ready] request failed: ${result.reason}`);
    }
  }

  /** v2.2 — worker half of the libp2p `RemoteSubmitterTransport`. */
  async handleInboundHarnessSubmitRequest(
    envelope: EnvoyEnvelope,
    replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>,
  ): Promise<void> {
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity) {
      console.warn("[harness.submit] ignored: agent identity unavailable");
      return;
    }
    const { handleInboundHarnessSubmitRequest } = await import(
      "./harness-submit-inbound.js"
    );
    const result = await handleInboundHarnessSubmitRequest({
      envelope,
      replyWithEnvelope,
      agentPeerId: agentIdentity.agentPeerId,
      agentPublicKeyPem: agentIdentity.agentPublicKeyPem,
      agentPrivateKeyPem: agentIdentity.agentPrivateKeyPem,
      agentCredential: agentIdentity.agentCredential,
      getAdapter: () => this.getEnvoyHarnessAdapter(),
    });
    if (!result.ok) {
      console.warn(`[harness.submit] request failed: ${result.reason}`);
    }
  }

  /**
   * v2.2 — the mesh fabric's `RemoteSubmitterTransport`: a
   * `RemoteMeshSubmitter` targeting ANOTHER mesh node's envoy-harness
   * worker (Pattern B), instead of a standalone peer cluster. Returns
   * null when the mesh / agent identity is unavailable.
   */
  async createLibp2pRemoteSubmitterTransport(): Promise<
    import("@envoymesh/envoy-harness-adapter").RemoteSubmitterTransport | null
  > {
    const resolver = await _chainTransportResolver(
      this._chainOrchestrationContext(),
    );
    if (!resolver) return null;
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity) return null;
    const { createLibp2pRemoteSubmitterTransport } = await import(
      "./harness-submit-transport.js"
    );
    return createLibp2pRemoteSubmitterTransport({
      resolver,
      parentAgentPeerId: agentIdentity.agentPeerId,
      parentAgentPublicKeyPem: agentIdentity.agentPublicKeyPem,
      parentAgentPrivateKeyPem: agentIdentity.agentPrivateKeyPem,
      agentCredential: agentIdentity.agentCredential,
      executeLocally: (input) => {
        const adapter = this.getEnvoyHarnessAdapter();
        if (!adapter) {
          throw new Error("envoy_harness_unavailable");
        }
        return adapter.execute(input);
      },
    });
  }

  async refreshAgentNetworkMembershipIndex(): Promise<void> {
    return refreshAgentNetworkMembershipIndex(this._chainOrchestrationContext());
  }

  private async buildChainInboundDeps(): Promise<ChainInboundDeps> {
    return buildChainInboundDeps(this._chainOrchestrationContext());
  }

  private async buildChainWorkerDeps(): Promise<ChainWorkerHandlerDeps> {
    return buildChainWorkerDeps(this._chainOrchestrationContext());
  }

  private _startChainTracking(chainId: string): void {
    _startChainTracking(this._chainOrchestrationContext(), chainId);
  }

  private _stopChainTracking(chainId: string): void {
    _stopChainTracking(this._chainOrchestrationContext(), chainId);
  }

  private _emitChainReport(report: import("@envoymesh/protocol").ChainReport): void {
    _emitChainReport(this._chainOrchestrationContext(), report);
  }

  private async _bondLevelForWorkerOwner(workerOwnerId: string): Promise<import("@envoymesh/api").BondLevel> {
    return _bondLevelForWorkerOwner(this._chainOrchestrationContext(), workerOwnerId);
  }

  private async _rollbackSubtaskAward(state: ChainState, subtaskId: string): Promise<void> {
    return _rollbackSubtaskAward(state, subtaskId);
  }

  private async _queueChainAwardApproval(
    chainId: string,
    subtaskId: string,
    bid: import("@envoymesh/protocol").ChainSubtaskBid,
    reason: string,
  ): Promise<void> {
    return _queueChainAwardApproval(this._chainOrchestrationContext(), chainId, subtaskId, bid, reason);
  }

  private async _evaluateAwardAndAccept(
    chainId: string,
    subtaskId: string,
    opts?: {
      policy?: "composite" | "cheapest" | "fastest";
      pickWorkerPeerId?: string;
      skipSensitivityGate?: boolean;
    },
  ): Promise<Awaited<ReturnType<typeof evaluateBids>>> {
    return _evaluateAwardAndAccept(this._chainOrchestrationContext(), chainId, subtaskId, opts);
  }

  private async _executeApprovedChainAward(payload: ChainAwardApprovalPayload): Promise<{ ok: boolean; error?: string }> {
    return _executeApprovedChainAward(this._chainOrchestrationContext(), payload);
  }

  private _emitChainState(chainId: string): void {
    _emitChainState(this._chainOrchestrationContext(), chainId);
  }

  private _scheduleAutoEvaluate(chainId: string, subtaskId: string): void {
    _scheduleAutoEvaluate(this._chainOrchestrationContext(), chainId, subtaskId);
  }

  private async _autoEvaluateSubtask(chainId: string, subtaskId: string): Promise<void> {
    return _autoEvaluateSubtask(this._chainOrchestrationContext(), chainId, subtaskId);
  }

  private _chainDiagnosticsForSubtasks(
    subtasks: Array<{ subtaskId: string; requiredSkill: string }>,
    workersBySubtask: Record<string, string[]>,
    rankedBySubtask?: Record<string, Array<{ peerId: string; score: number; summary: string }>>,
  ): string[] {
    return _chainDiagnosticsForSubtasks(subtasks, workersBySubtask, rankedBySubtask);
  }

  private async _runChainGoal(input: {
    goal: string;
    chainId?: string;
    maxChainCostUsd?: number;
    costCeilingUsd?: number;
    allowLlm?: boolean;
    assignerPeerId?: string;
    criticality?: "normal" | "high";
    preferredWorkerPeerIds?: string[];
    plannedSubtasks?: Array<{
      subtaskId: string;
      depth: number;
      requiredSkill: string;
      objective: string;
      requestedResult?: string;
      constraints?: string[];
      dependsOn?: string[];
      costCeilingUsd?: number;
      deadlineAt?: string;
      preferredWorkerPeerId?: string;
      createdAt?: string;
    }>;
  }): Promise<{
    ok: boolean;
    chainId: string;
    chainMandateId: string;
    subtasks: Array<{ subtaskId: string; depth: number; requiredSkill: string; objective: string; preferredWorkerPeerId?: string }>;
    error?: string;
    assignerPeerId?: string;
    handedOff?: boolean;
  }> {
    return _runChainGoal(this._chainOrchestrationContext(), input);
  }

  private async _appendChainAudit(event: {
    type: import("@envoymesh/local-store").AuditEventType;
    outcome: "allow" | "deny" | "record";
    intent: string;
    remotePeerId?: string;
    correlationId?: string;
    summary?: string;
  }): Promise<void> {
    return _appendChainAudit(this._chainOrchestrationContext(), event);
  }

  private async buildChainOrchestratorDeps(): Promise<ChainOrchestratorHandlerDeps> {
    return buildChainOrchestratorDeps(this._chainOrchestrationContext());
  }

  private async findAgentNetworkWorkers(capability: string): Promise<string[]> {
    return findAgentNetworkWorkers(this._chainOrchestrationContext(), capability);
  }

  async chainPreviewGoal(params: ChainPreviewGoalParams): Promise<ChainPreviewGoalResult> {
    return chainPreviewGoalViaRuntime(this._chainContext(), params);
  }

  async chainStartFromGoal(params: ChainStartFromGoalParams): Promise<ChainStartFromGoalResult> {
    return chainStartFromGoalViaRuntime(this._chainContext(), params);
  }

  async chainProbeReachability(
    params: ChainProbeReachabilityParams,
  ): Promise<ChainProbeReachabilityResult> {
    const ownerIds = params.ownerIds ?? [];
    if (ownerIds.length === 0) return { rows: [] };

    // Map owner id → agent peer id via cached agent cards.
    const cards = await this.listAgentCards();
    const agentPeerIdByOwner = new Map<string, string | undefined>();
    for (const card of cards) {
      agentPeerIdByOwner.set(card.ownerId, card.sourceAgentPeerId);
    }

    // Live mesh connection snapshot — open libp2p connections + relay-routed subset.
    const mesh = this._reachableMesh();
    const readConnectedIds = (): Set<string> => {
      const stats = mesh?.getConnectionStats();
      return new Set(stats?.connectedPeerIds ?? mesh?.getConnectedPeerIds() ?? []);
    };
    const readCircuitIds = (): Set<string> => {
      const stats = mesh?.getConnectionStats();
      return new Set(stats?.circuitPeerIds ?? []);
    };
    let connectedIds = readConnectedIds();
    let circuitIds = readCircuitIds();

    // Index peer-directory records by owner so we can check every device's
    // libp2p peer id. Connectivity is a property of the NODE (libp2p host),
    // not the agent identity — `sourceAgentPeerId` is an `envoy_agent_*` id
    // that is never a libp2p PeerId, so comparing it directly against
    // `connectedIds` would always report offline (every contact filtered out).
    const recordsByOwner = new Map<string, PeerDirectoryRecord[]>();
    try {
      const allRecords = await this._peerDirectoryStore.listPeerRecords();
      for (const rec of allRecords) {
        const list = recordsByOwner.get(rec.ownerId);
        if (list) list.push(rec);
        else recordsByOwner.set(rec.ownerId, [rec]);
      }
    } catch {
      /* leave empty — every row reports offline + sameLan=false */
    }

    const isOwnerConnected = (ownerId: string): boolean => {
      const peerRecords = recordsByOwner.get(ownerId) ?? [];
      return peerRecords.some(
        (r) => isLibp2pPeerId(r.peerId) && connectedIds.has(r.peerId),
      );
    };

    // Team jobs polls this every 20s and previously only read the passive
    // connection snapshot. Unlike chat (which dials on open), that meant
    // bonded peers with no open session were always "offline" and hidden
    // from the contact list. Best-effort warm offline owners before the
    // final snapshot so the UI matches real reachability.
    if (mesh) {
      const offlineOwners = ownerIds.filter((id) => !isOwnerConnected(id)).slice(0, 8);
      if (offlineOwners.length > 0) {
        const warmOne = async (ownerId: string): Promise<void> => {
          try {
            await raceWithTimeout(
              this.warmContactConnection(ownerId),
              // Align with warm phase-1 (hints 5s + LAN 8s); do not wait full WAN.
              14_000,
              `chainProbeWarm(${ownerId.slice(0, 16)}…)`,
            );
          } catch {
            /* best-effort — leave offline */
          }
        };
        // Bound concurrency so a large bond list doesn't stampede dials.
        const concurrency = 3;
        for (let i = 0; i < offlineOwners.length; i += concurrency) {
          await Promise.all(offlineOwners.slice(i, i + concurrency).map(warmOne));
        }
        connectedIds = readConnectedIds();
        circuitIds = readCircuitIds();
      }
    }

    const rows = ownerIds.map((ownerId) => {
      const agentPeerId = agentPeerIdByOwner.get(ownerId);
      const peerRecords = recordsByOwner.get(ownerId) ?? [];
      // A contact is online when ANY of their devices' libp2p peer ids is
      // currently connected. Prefer the most-recently-seen connected record.
      const connectedRecord = peerRecords
        .filter((r) => isLibp2pPeerId(r.peerId) && connectedIds.has(r.peerId))
        .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0];
      const online = Boolean(connectedRecord);
      const viaRelay = online ? circuitIds.has(connectedRecord.peerId) : false;
      const sameLan = sameLanFromListenAddrs(
        connectedRecord?.listenAddrs ?? peerRecords[0]?.listenAddrs,
      );
      return { ownerId, agentPeerId, online, sameLan, viaRelay };
    });
    return { rows };
  }

  async chainResolveIteration(
    params: import("@envoymesh/api").ChainResolveIterationParams,
  ): Promise<import("@envoymesh/api").ChainResolveIterationResult> {
    const { _resolveIterationOwner } = await import("./node-service-chain-orchestration.js");
    return _resolveIterationOwner(this._chainOrchestrationContext(), params.chainId, params.decision);
  }

  async chainExportCosts(params: ChainExportCostsParams): Promise<ChainExportCostsResult> {
    return chainExportCostsViaRuntime(this._chainContext(), params);
  }

  async chainListRecipes(_params?: ChainListRecipesParams): Promise<ChainListRecipesResult> {
    return chainListRecipesViaRuntime(this._chainContext(), _params);
  }

  async chainSaveRecipe(params: ChainSaveRecipeParams): Promise<ChainSaveRecipeResult> {
    return chainSaveRecipeViaRuntime(this._chainContext(), params);
  }

  async chainDeleteRecipe(params: ChainDeleteRecipeParams): Promise<ChainDeleteRecipeResult> {
    return chainDeleteRecipeViaRuntime(this._chainContext(), params);
  }

  // ------------------------------------------------------------------
  // Phase 38 — Voice/Video Calls
  // ------------------------------------------------------------------

  getActiveCall(): CallSession | null {
    return getActiveCallViaRuntime(this._callContext());
  }

  onCallEvent(handler: (event: CallEvent) => void): () => void {
    return onCallEventViaRuntime(this._callContext(), handler);
  }

  async sendCallInvite(
    targetOwnerId: string,
    sdpOffer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
    callType: import("@envoymesh/api").CallMediaType = "audio",
  ): Promise<string | null> {
    return sendCallInviteViaRuntime(this._callContext(), targetOwnerId, sdpOffer, iceServers, callType);
  }

  async sendCallReinvite(
    callId: string,
    sdpOffer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
    reason: "path1_timeout" | "path1_failed" = "path1_timeout",
  ): Promise<boolean> {
    return sendCallReinviteViaRuntime(this._callContext(), callId, sdpOffer, iceServers, reason);
  }

  /**
   * Resolve the iceServers that ship in the `call.invite` payload.
   *
   * Order:
   * 1. Caller-supplied argument (including explicit `[]` = no STUN).
   * 2. `node-config.iceServers` from disk.
   * 3. Hard-coded public STUN defaults (non-Google; gathering is capped in UI).
   */
  private async _effectiveCallIceServers(
    callerSupplied?: { urls: string; username?: string; credential?: string }[],
  ): Promise<{ urls: string; username?: string; credential?: string }[]> {
    return effectiveCallIceServersViaRuntime(this._callContext(), callerSupplied);
  }

  private _recordCallRejected(callId: string, reason: string): void {
    recordCallRejectedViaRuntime(this._callContext(), callId, reason);
  }

  async acceptCallInvite(
    callId: string,
    sdpAnswer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
  ): Promise<boolean> {
    return acceptCallInviteViaRuntime(this._callContext(), callId, sdpAnswer, iceServers);
  }

  async declineCallInvite(callId: string, reason: string): Promise<boolean> {
    return declineCallInviteViaRuntime(
      this._callContext(),
      callId,
      reason as "busy" | "declined" | "no_answer" | "offline" | "error",
    );
  }

  async endCall(callId: string): Promise<boolean> {
    return endCallViaRuntime(this._callContext(), callId);
  }

  async setCallMuted(callId: string, muted: boolean): Promise<boolean> {
    return setCallMutedViaRuntime(this._callContext(), callId, muted);
  }

  async sendIceCandidate(
    callId: string,
    candidate: {
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;
      usernameFragment?: string | null;
    },
  ): Promise<boolean> {
    return sendIceCandidateViaRuntime(this._callContext(), callId, candidate);
  }

  /** Send call.reject to a remote owner without a local ringing session (busy path). */
  async sendCallRejectToOwner(
    callId: string,
    callerOwnerId: string,
    reason: import("@envoymesh/protocol").CallRejectPayload["reason"],
  ): Promise<void> {
    await sendCallRejectToOwnerViaRuntime(this._callContext(), callId, callerOwnerId, reason);
  }

  private _callContext(): FullCallContext {
    return buildFullCallContext(this);
  }

  private _wireCallManagerRemoteSignals(): void {
    this.callManager.setRemoteSignalHandler((req) => {
      void this.sendCallRejectToOwner(req.callId, req.peerOwnerId, req.reason);
    });
  }

  /**
   * Phase 42B — common helper that resolves the peer's owner ID → device
   * peer ID, stamps `recipientPeerId` on the **unsigned** envelope, then
   * signs and sends through `_deliverCallEnvelope` so retries + ack-skip
   * match the call path.
   *
   * CRITICAL: `recipientPeerId` must be set *before* signing. The
   * signature covers the canonical JSON of the unsigned envelope
   * (`envelopeForSigning` strips only `signature`; `canonicalJson` drops
   * `undefined`). If the field is stamped after signing — as it once was
   * here — the verifier recomputes canonical JSON *with* the field
   * present and the signature no longer matches, so the peer's
   * `InboundMessageGuard` silently drops every response envelope. This
   * mirrors `sendCallInvite`, which resolves the transport up front and
   * passes `recipientPeerId` into `createUnsignedEnvelope`.
   *
   * No-ops (silently) when the peer cannot be resolved — the call may
   * already have ended and the peer is gone. CallManager state has
   * already been updated before this helper runs.
   */
  private async _sendCallResponseEnvelope(
    peerOwnerId: string,
    unsigned: UnsignedEnvoyEnvelope,
    intent: string,
  ): Promise<boolean> {
    return sendCallResponseEnvelopeViaRuntime(this._callContext(), peerOwnerId, unsigned, intent);
  }

  async clearAllUserData(): Promise<void> {
    // Best-effort: each step is independent. A failure on one store does
    // not block the others.
    const profileDir = this._profileDir;
    if (!profileDir) {
      // Nothing persisted yet — nothing to wipe.
      return;
    }

    // In-memory state
    this._publishedLibraryStore.clear();
    this._intentHistoryStore.clear();
    this._continuityStore.clear();
    this._chainStore.clear();

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

  /**
   * Phase 50 — push skip-if-online check.
   * Uses the existing {@link _thinClientOnlineCheck} (wired from index.ts
   * via bindThinClientOnlineCheck) to determine if EnvoyGo has a recently
   * active authenticated WebSocket session. When true, the push is skipped
   * because the WS event already reached the device.
   *
   * Falls back to false (offline → push fires) when the check isn't wired
   * yet (early startup) or when no thin client is connected.
   */
  async isOwnerOnline(): Promise<boolean> {
    const ownerId = this._profile?.owner?.ownerId ?? "";
    if (!ownerId) return false;
    // Use the existing thin-client online check (hasRecentlyActiveClientForOwner).
    // This returns true only when an authenticated WS client (EnvoyGo) has
    // had recent activity — a backgrounded phone with a stale WS won't match.
    if (this._thinClientOnlineCheck) {
      return this._thinClientOnlineCheck(ownerId);
    }
    // No check wired yet → assume offline → push fires.
    return false;
  }
}

function titleFromNoteContent(content: string, filename: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  if (heading?.[1]?.trim()) return heading[1].trim().slice(0, 200);
  const stem = filename.replace(/\.md$/i, "").trim();
  return stem || "Untitled";
}

function stripLeadingMarkdownTitle(content: string): string {
  return content.replace(/^#\s+[^\n]+\n*/, "").trim();
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
    case "webm":
      return "audio/webm";
    case "m4a":
      return "audio/mp4";
    case "mp4":
      return "video/mp4";
    case "mp3":
      return "audio/mpeg";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
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
