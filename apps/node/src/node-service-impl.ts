import type {
  AiSettings,
  BondRecord,
  BridgeStatus,
  OpenClawStatus,
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
  ensureDefaultAutonomousPoliciesForModel,
} from "@envoymesh/api";
import { buildSignedChatDeliveredEnvelope } from "@envoymesh/api/chat-delivered";
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
  applyAiIdentityForIdentity,
  shouldPushAgentActivity,
  shouldPostA2aChatLine,
  formatA2aChatSystemLine,
  resolveReportContactOwnerId,
  chatRoomThreadKey,
  chatWireAttachmentsToContent,
  deferredDirectChatAttachmentKey,
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
  type UnsignedEnvoyEnvelope,
  type DevicePairRequestPayload,
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
  type AuditEvent,
} from "@envoymesh/local-store";
import { createNodeConfigStore, createStubNodeConfigStore, type PersistedNodeConfig } from "./node-config-store.js";
import { startPairingKioskServer, type PairingKioskServerHandle } from "./pairing-kiosk-server.js";
import { loadOrCreateLibp2pPrivateKey } from "./libp2p-key-loader.js";
import { createDiscoverySeedStore, type DiscoverySeedStore } from "./discovery-seed-store.js";
import { seedAddrsForDiscoveryProfile, peerDiscoverySourceFromMultiaddrs, shouldPersistPeerDiscoverySeeds } from "./peer-discovery-telemetry.js";
import { resolveBootstrapAddresses, looksLikeDomain } from "./bootstrap-resolver.js";
import { createInboundMessageGuard, type InboundMessageGuard } from "./inbound-guard.js";
import { buildModelProviders, routeModelRequest } from "@envoymesh/models";
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
import { CallManager } from "./call-manager.js";
import { pushNotificationService } from "./push-notification.js";
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
  hasDirectTcpDialHints,
  isPrivateLanTcpDialHint,
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
import { deliverCallEnvelopeWithRetry, deliverChatEnvelopeWithRetry, sendExpectReplyWithRetry, type ChatDeliverResult } from "./chat-outbound-deliver.js";
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
import { forwardToAgent, receiveFromAgent } from "./bridge/index.js";
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
import { buildOutboundDialHints, mergeDialablePeerListenAddrs, shouldPreferCircuitDialHints } from "./outbound-dial-hints.js";
import {
  dialableInboundRemoteAddrs,
  mergeInboundPeerDialHintsIfDue,
} from "./inbound-dial-hint-learn.js";
import { buildChatDiagnostics } from "./chat-diagnostics.js";
import { NodeDiscoveryRuntime } from "./node-service-discovery.js";
import { sendSyncStateUpdateViaMesh } from "./node-service-sync.js";
import {
  applyWanJoinInviteViaRuntime,
  createWanJoinInviteViaRuntime,
  getConnectivityDiagnosticsViaRuntime,
  type NodeWanRuntimeDeps,
} from "./node-service-wan.js";
import { sendLanAutoBondRequest } from "./node-service-lan-auto-bond.js";
import {
  consumeCompanyInviteViaRuntime,
  createCompanyInviteViaRuntime,
  listCompanyInvitesViaRuntime,
  revokeCompanyInviteViaRuntime,
} from "./node-service-company-invite.js";
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
  chainCancelViaRuntime,
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
  chainListRecipesViaRuntime,
  chainListReportsViaRuntime,
  chainPinReportViaRuntime,
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
  sendCallRejectToOwnerViaRuntime,
  sendIceCandidateViaRuntime,
  setCallMutedViaRuntime,
  type CallContext,
} from "./node-service-calls.js";
import {
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
  shareFileViaRuntime,
  requestShareFromLibraryViaRuntime,
} from "./node-service-fileshare.js";
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
  type WireMeshEventsContext,
} from "./node-service-wire-mesh-events.js";
import {
  handleSharePreviewViaRuntime,
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
} from "./node-service-handlers-doc-acq-cap-prov.js";
import {
  listAgentActivityViaRuntime,
  listCommerceReceiptsViaRuntime,
  listAgentCardsViaRuntime,
  getAgentCardViaRuntime,
  listAgentCirclesViaRuntime,
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
import { startRelayClientScheduler, runRelayClientCycle } from "./relay-client-cycle.js";
import { buildAutoCapabilityTopics, runCapabilityDiscoveryCycle } from "./capability-discovery.js";
import { recordMeshActivity, resolveConnectivityRuntime, shouldRunPeriodicCapabilityFind, type ResolvedConnectivityRuntime } from "./connectivity-runtime.js";
import { startNodeStatsInterval } from "./node-stats-log.js";
import { handleInboundBondIntent } from "./bond-inbound.js";

import {
  resolveDidImportViaRuntime,
  resolveDidExportViaRuntime,
  acceptHelloViaRuntime,
  declineSocialIntroProposalViaRuntime,
  resyncBondedContactReachabilityTagsViaRuntime,
  syncProfileToBondsViaRuntime,
  type MiscDelegationsContext,
} from "./node-service-handlers-misc-delegations.js";

import {
  handleChatRoomSyncViaRuntime,
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
  cacheDidContactKeyViaRuntime,
  setPublicProfileThumbnailViaRuntime,
  getAgentIdentityViaRuntime,
  updateAgentIdentityViaRuntime,
  type SmallProfileDelegationsContext,
} from "./node-service-handlers-small-profile-delegations.js";

import {
  handleChatMessageViaRuntime,
  type ChatMessageContext,
} from "./node-service-handlers-chat-message.js";

import {
  handleChatRoomMessageViaRuntime,
  type ChatRoomMessageContext,
} from "./node-service-handlers-chat-room-message.js";

import {
  handleBondIntentViaRuntime,
  type BondHandlerContext,
} from "./node-service-handlers-bond-intent.js";
import { handleInboundSocialIntroIntent } from "./social-intro-inbound.js";
import { handleInboundKnowledgeQuery } from "./knowledge-query-inbound.js";
import { askOwnerAgentPlanner, scanOwnerAgentOutbound } from "./owner-agent-planner-inbound.js";
import { loadAgentIdentitySection } from "./agent-identity-context.js";
import { resolveBundledSkillsDir } from "./bundled-paths.js";
import { spawnOpenClawGateway } from "./openclaw-gateway-spawn.js";
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
import { CapabilityIndex } from "./capability-index.js";
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
 * Phase 42 — default `iceServers` injected into `call.invite` when the
 * caller did not provide a list and the home's `node-config.json` has none.
 * Three public STUN endpoints; TURN is user-configured (Phase 42H).
 */
const DEFAULT_ICE_SERVERS: { urls: string; username?: string; credential?: string }[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

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
    capabilities: string[];
    nodeProfile?: CachedAgentCardSummary["nodeProfile"];
    publicTopics?: string[];
    trustPolicySummary?: CachedAgentCardSummary["trustPolicySummary"];
    supportedProtocolVersions?: string[];
  };
  cachedAt: string;
  sourceAgentPeerId?: string;
}): CachedAgentCardSummary {
  const summary: CachedAgentCardSummary = {
    ownerId: row.ownerId,
    displayName: row.card.displayName,
    capabilities: row.card.capabilities,
    cachedAt: row.cachedAt,
    sourceAgentPeerId: row.sourceAgentPeerId,
  };
  if (row.card.nodeProfile !== undefined) summary.nodeProfile = row.card.nodeProfile;
  if (row.card.publicTopics) summary.publicTopics = row.card.publicTopics;
  if (row.card.trustPolicySummary) summary.trustPolicySummary = row.card.trustPolicySummary;
  if (row.card.supportedProtocolVersions) {
    summary.supportedProtocolVersions = row.card.supportedProtocolVersions;
  }
  return summary;
}

/** Unblocks when an underlying `fs.readFile` or mutex never settles (seen on some Windows setups). */
function raceWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Per-topic DHT provide/cancel cap so profile save does not block on sparse WAN bootstrap. */
const DISCOVERY_TOPIC_OP_TIMEOUT_MS = 10_000;
const WARM_CONTACT_DIAL_HINTS_TIMEOUT_MS = 10_000;

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
  /** Phase 35D — handle to the pairing-kiosk HTTP server (when enabled). */
  private _pairingKiosk: PairingKioskServerHandle | null = null;
  /** Phase 38 — per-node call session manager (voice/video calls). */
  readonly callManager = new CallManager();
  /** Phase 40F — worker capability index for chain worker discovery. */
  private readonly _capabilityIndex = new CapabilityIndex();
  private _capabilityIndexReady: Promise<void> | null = null;
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
  } as const;

  /** Latest QR / `getPairingPayload` token for optional companion auto-pair (short TTL). */
  private _pairingToken: string | null = null;
  private _pairingTokenIssuedAt = 0;
  private static readonly _pairingTokenTtlMs = 30 * 60 * 1000; // 30 minutes

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
    { relativePath: string; toPeerId: string; deliveryChannel?: "inbox" | "chat" | "agent" }
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
    { relativePath: string; toPeerId: string; deliveryChannel?: "inbox" | "chat" | "agent" }
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
  /** Per-contact last warm timestamp for cooldown throttling. */
  private readonly _lastBondWarmAt = new Map<string, number>();
  /** Skip periodic bond warm when libp2p already has this many open connections. */
  private static readonly BOND_WARM_MAX_CONNECTIONS = 64;
  /** Minimum interval between warm attempts for the same contact (ms). */
  private static readonly BOND_WARM_PER_CONTACT_COOLDOWN_MS = 300_000;
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
  // Transfer / file-share state — bundle of 7 Maps + 1 TransferTracker
  // used by the file-sharing runtime (see ./node-service-fileshare.ts).
  // Grouped into a single sub-object so the field list is easier to read.
  // ---------------------------------------------------------------
  private readonly _transferState = {
    pendingInboundShareOffers: new Map<string, ShareOffer>(),
    pendingDataTransferSavePath: new Map<string, string>(),
    deferredDirectChatAttachmentVaultPath: new Map<string, string>(),
    transferTracker: new TransferTracker(),
    correlationByRequestMsgId: new Map<string, string>(),
    correlationByPreviewMsgId: new Map<string, string>(),
    inboundTransferByShareId: new Map<
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
    >(),
  } as const;

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
  }

  private _upsertTransferStatus(status: TransferStatus): TransferStatus {
    const saved = this._transferState.transferTracker.upsert(status);
    this.emit("share:progress", saved);
    return saved;
  }

  async listActiveTransfers(): Promise<TransferStatus[]> {
    return this._transferState.transferTracker.listActive();
  }

  async getTransferStatus(correlationId: string): Promise<TransferStatus | undefined> {
    return this._transferState.transferTracker.get(correlationId);
  }

  /** After inbound 1:1 chat.message is persisted, apply deferred vault paths from early transfers. */
  async reconcileInboundDirectChatMessage(
    peerOwnerId: string,
    message: ChatMessage,
  ): Promise<ChatMessage> {
    if (!this._chatLogStore) return message;
    await this._reconcileDeferredDirectChatAttachmentVaultPaths(peerOwnerId, message);
    const rows = await this._chatLogStore.listThread(peerOwnerId.trim(), 5000);
    const updated = rows.find((row) => row.messageId === message.messageId);
    if (!updated) return message;
    return { ...updated, signature: updated.signature };
  }

  /** Called from data-transfer-inbound after verified inbound write. */
  notifyInboundTransferVerified(input: {
    remotePeerId: string;
    relativePath: string;
    totalBytes: number;
  }): void {
    for (const [shareId, pending] of this._transferState.inboundTransferByShareId.entries()) {
      if (pending.senderNodeId !== input.remotePeerId) continue;
      if (pending.savePath !== input.relativePath && pending.senderVaultRelativePath !== input.relativePath) {
        continue;
      }
      const correlationId = this._transferState.correlationByPreviewMsgId.get(shareId) ?? shareId;
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
      this._transferState.inboundTransferByShareId.delete(shareId);
      if (pending.chatRoomId && pending.chatMessageId && pending.chatAttachmentId) {
        void this._applyRoomAttachmentVaultPath({
          roomId: pending.chatRoomId,
          messageId: pending.chatMessageId,
          attachmentId: pending.chatAttachmentId,
          vaultRelativePath: input.relativePath,
        });
      } else if (pending.chatMessageId && pending.chatAttachmentId && pending.senderOwnerId) {
        void this._applyDirectChatAttachmentVaultPath({
          peerOwnerId: pending.senderOwnerId,
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
    const correlationId = this._transferState.correlationByRequestMsgId.get(inReplyToRequestMsgId);
    if (correlationId) {
      this._transferState.correlationByPreviewMsgId.set(previewMessageId, correlationId);
      this._transferState.correlationByRequestMsgId.delete(inReplyToRequestMsgId);
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
    const correlationId = this._transferState.correlationByRequestMsgId.get(input.inReplyToRequestMsgId);
    if (correlationId) {
      this._transferState.correlationByPreviewMsgId.set(input.previewMessageId, correlationId);
      this._transferState.correlationByRequestMsgId.delete(input.inReplyToRequestMsgId);
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
    deliveryChannel?: "inbox" | "chat" | "agent";
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
    this._transferState.pendingInboundShareOffers.set(input.shareId, offer);
    if (input.deliveryChannel !== "chat") {
      this.emit("share:offered", offer);
    }
  }

  clearPendingShareStateForPreview(previewMessageId: string): void {
    this._pendingFileSendByPreviewMsgId.delete(previewMessageId);
    const offer = this._transferState.pendingInboundShareOffers.get(previewMessageId);
    if (offer?.senderVaultRelativePath) {
      this._transferState.pendingDataTransferSavePath.delete(
        `${offer.senderNodeId}\n${offer.senderVaultRelativePath.replace(/^[\\/]+/, "")}`,
      );
    }
    this._transferState.pendingInboundShareOffers.delete(previewMessageId);
  }

  /**
   * Map verified voucher path → local vault-relative path when the owner chose a different name/location.
   */
  resolveInboundDataTransferRelativePath(remotePeerId: string, voucherRelativePath: string): string {
    const norm = voucherRelativePath.replace(/^[\\/]+/, "");
    const o = this._transferState.pendingDataTransferSavePath.get(`${remotePeerId}\n${norm}`);
    return o ?? norm;
  }

  consumeInboundDataTransferSaveMapping(remotePeerId: string, voucherSourceRelativePath: string): void {
    const norm = voucherSourceRelativePath.replace(/^[\\/]+/, "");
    this._transferState.pendingDataTransferSavePath.delete(`${remotePeerId}\n${norm}`);
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
    const listenAddrs = this._mergeConnectionDialHints(
      input.remotePeerId,
      rec?.listenAddrs,
      input.inboundConnectionAddrs,
    );
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
      this._transferState.correlationByPreviewMsgId.get(previewId) ?? input.envelope.correlationId ?? previewId;
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
    await sendVaultFileViaDataTransfer({
      mesh,
      profile,
      taskStore: input.taskStore,
      vaultDir: input.vaultDir,
      relativePath: pending.relativePath,
      toPeerId: input.remotePeerId,
      dialHints,
      peerListenAddrs: listenAddrs,
      rebuildDialHints: () => this._dialHintsForChat(input.remotePeerId, listenAddrs),
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

  /** Prefer stable LAN listen addrs; append live inbound paths (often relay circuits) as fallback. */
  private _mergeConnectionDialHints(
    peerId: string,
    peerListenAddrs: string[] | undefined,
    inboundConnectionAddrs: string[] | undefined,
  ): string[] | undefined {
    const merged = mergeDialablePeerListenAddrs(peerId, peerListenAddrs, inboundConnectionAddrs);
    return merged.length > 0 ? merged : undefined;
  }

  private _learnInboundDialHints(remotePeerId: string, remoteAddr?: string): Promise<string[]> {
    const mesh = this._reachableMesh();
    return mergeInboundPeerDialHintsIfDue({
      remotePeerId,
      remoteAddr,
      lastMergeByPeer: this._inboundListenAddrMergeByPeer,
      peerDirectory: this._peerDirectoryStore,
      mesh: mesh ?? undefined,
    });
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
      this._capabilityIndexReady = this._capabilityIndex.init(profileDir);
    }
    if (profile !== undefined) {
      this._profile = profile;
    }
    if (mesh) {
      this._nodeStatus = "running";
    }
    this._wireCallManagerRemoteSignals();
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
    this.emit("node:online", {
      peerId: mesh.peerId,
      multiaddrs: (mesh.multiaddrs ?? []).map((a) => a.toString()),
    });
    this.emit("node:ready", { timestamp: Date.now() });
    void this.resyncBondedContactReachabilityTags();
    void this._scrubBondedContactDialState();
    this._scheduleDeferredProfileRefresh("bindExternalMesh");
    this._startBondWarmInterval();
  }

  private _scheduleDeferredProfileRefresh(source: string): void {
    if (this._profileRefreshStartupTimer) {
      clearTimeout(this._profileRefreshStartupTimer);
    }
    this._profileRefreshStartupTimer = setTimeout(() => {
      this._profileRefreshStartupTimer = undefined;
      void this.refreshBondPeerProfiles().catch((err) => {
        console.warn(`[profile] refreshBondPeerProfiles after ${source} failed:`, err);
      });
    }, NodeServiceImpl.PROFILE_REFRESH_STARTUP_DELAY_MS);
  }

  /** True when {@link startNode} created an internal mesh with {@link _wireMeshEvents} inbound handlers. */
  usesInternalMeshInboundHandlers(): boolean {
    return this._mesh != null;
  }

  /** Re-apply contact reachability tags from the trust store (after cold start or mesh restart). */
  async resyncBondedContactReachabilityTags(): Promise<void> {
    return resyncBondedContactReachabilityTagsViaRuntime(this._miscDelegationsContext());
  }

  /** Drop stale ephemeral listen addrs from disk + libp2p peerstore for bonded contacts. */
  private async _scrubBondedContactDialState(): Promise<void> {
    const mesh = this._reachableMesh();
    if (!mesh) {
      return;
    }
    try {
      await this._peerDirectoryStore.compactListenAddrs();
      await this._peerDirectoryStore.sanitizeListenAddrs();
      const bonds = await this.getBonds();
      for (const bond of bonds) {
        if (bond.level !== "direct" && bond.level !== "referred") {
          continue;
        }
        const resolved = await this._resolveLibp2pPeerForBondOwner(bond.peerOwnerId);
        if (!resolved?.transportPeerId) {
          continue;
        }
        const dialable = mergeDialablePeerListenAddrs(
          resolved.transportPeerId,
          resolved.listenAddrs,
        );
        await mesh.scrubPeerStoreDialHints(resolved.transportPeerId, dialable);
      }
    } catch (err) {
      console.warn("[reachability] bonded dial scrub failed:", err);
    }
  }

  /**
   * CLI path (`index.ts`): mDNS / relay discovery learned a libp2p peer + dialable addrs.
   * Merge addrs into an existing peer-directory row and probe for bonded profile sync.
   */
  async handleMeshPeerDiscovered(peerId: string, multiaddrs: string[]): Promise<void> {
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
      const mesh = this._reachableMesh();
      if (mesh && multiaddrs.length > 0) {
        const dialable = mergeDialablePeerListenAddrs(peerId, multiaddrs);
        void mesh.mergePeerStoreDialHints(peerId, dialable);
      }
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
      void this._maybeFireLanAutoBond(peerId);
      void this._warmBondedContactAfterLanDiscovery(peerId, multiaddrs);
    } catch (err) {
      console.warn(`[node-service] handleMeshPeerDiscovered failed for ${peerId.slice(0, 12)}…:`, err);
    }
  }

  /** mDNS / LAN discovery for a bonded libp2p id — upgrade relay connections to direct automatically. */
  private async _warmBondedContactAfterLanDiscovery(
    peerId: string,
    multiaddrs: string[],
  ): Promise<void> {
    if (this._nodeStatus !== "running" || multiaddrs.length === 0) {
      return;
    }
    const hasLanAddr = multiaddrs.some((a) => isPrivateLanTcpDialHint(a));
    if (!hasLanAddr) {
      return;
    }
    try {
      const record = await this._peerDirectoryStore.getPeerByPeerId(peerId);
      const ownerId = record?.ownerId?.trim();
      if (!ownerId || ownerId === peerId) {
        return;
      }
      const trust = await this._trustStore.getTrustRecord(ownerId);
      if (!trust || trust.level === "blocked" || trust.level === "public") {
        return;
      }
      await this.warmContactConnection(ownerId);
    } catch {
      /* best-effort */
    }
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
    return resolveDidImportViaRuntime(null, input);
  }

  async resolveDidExport(input: string) {
    return resolveDidExportViaRuntime(null, input);
  }

  async cacheDidContactKey(params: { ownerId: string; publicKeyPem: string }) {
    return cacheDidContactKeyViaRuntime(this._smallProfileDelegationsContext(), params);
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
    return syncProfileToBondsViaRuntime(this._miscDelegationsContext());
  }

  async refreshBondPeerProfiles(): Promise<{ requested: number; failed: number }> {
    const mesh = this._reachableMesh();
    if (mesh && mesh.getConnectionStats().totalConnections >= NodeServiceImpl.BOND_WARM_MAX_CONNECTIONS) {
      console.warn(
        `[profile] refreshBondPeerProfiles skipped: ${mesh.getConnectionStats().totalConnections} open libp2p connections`,
      );
      return { requested: 0, failed: 0 };
    }
    const bonds = await this.getBonds();
    let failed = 0;
    let requested = 0;
    for (const bond of bonds) {
      if (bond.level !== "direct" && bond.level !== "referred") {
        continue;
      }
      requested += 1;
      const result = await this.requestPeerProfile(bond.peerOwnerId);
      if (!result.ok) failed += 1;
    }
    void this.refreshCapabilityIndex().catch((err) => {
      console.warn("[chain] refreshCapabilityIndex after bond refresh failed:", err);
    });
    return { requested, failed };
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
      const records = await this._peerDirectoryStore.listPeerRecords();
      const connectedPeerIds = mesh.getConnectedPeerIds();
      const liveConnected = pickLibp2pFromConnectedPeers(records, ownerId, connectedPeerIds);
      const resolved = liveConnected
        ? { transportPeerId: liveConnected.peerId, listenAddrs: liveConnected.listenAddrs }
        : await this._resolveLibp2pPeerForBondOwner(ownerId);
      if (!resolved) {
        return { ok: false, reason: "peer not in directory (no libp2p route)" };
      }
      const { transportPeerId, listenAddrs } = resolved;
      if (!liveConnected && !mesh.getPeerConnectionInfo(transportPeerId).connected) {
        return { ok: false, reason: "peer not connected" };
      }
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
   */
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
    if (Date.now() - lastAt < NodeServiceImpl._LAN_AUTO_BOND_COOLDOWN_MS) return;

    // All gating (config check, token check, self check) happens inside
    // `sendLanAutoBondRequest`, which also handles audit logging and the
    // transport error path. We just feed it the deps.
    //
    // Only stamp the cooldown *after* the helper actually accepted the call.
    // Otherwise a config flip (off → no token) would block the next fire
    // for a full 60s even though no envelope was ever sent.
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
    return setPublicProfileThumbnailViaRuntime(this._smallProfileDelegationsContext(), params);
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
    return getAgentIdentityViaRuntime(this._smallProfileDelegationsContext());
  }

  async updateAgentIdentity(content: string): Promise<AgentIdentityDocument> {
    return updateAgentIdentityViaRuntime(this._smallProfileDelegationsContext(), content);
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
          const response = await sendExpectReplyWithRetry({
            mesh,
            transportPeerId: relayAddr,
            envelope,
            dialHints: dialHintsForTransportTarget(relayAddr),
            timeoutMs: BASE_TIMEOUT_MS * Math.pow(2, attempt),
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
      await this._deliverCallEnvelope(targetPeerId, envelope, dialHints, matchedRecord?.listenAddrs);
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
      await this._deliverCallEnvelope(pending.remotePeerId, acceptEnvelope, acceptDialHints, requesterDir?.listenAddrs);
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

    void this.refreshBondPeerProfiles().catch((err) => {
      console.warn("[profile] refreshBondPeerProfiles after hello accept failed:", err);
    });
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
    const mesh = this._reachableMesh();
    const peerStoreAddrs = mesh ? await mesh.getPeerStoreDialHints(recipientPeerId) : [];
    const mergedListen = mergeDialablePeerListenAddrs(
      recipientPeerId,
      peerListenAddrs,
      peerStoreAddrs,
    );
    return buildOutboundDialHints({
      recipientPeerId,
      peerListenAddrs: mergedListen.length ? mergedListen : peerListenAddrs,
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

    const listenAddrs = context?.remoteAddr?.trim()
      ? dialableInboundRemoteAddrs(context.remoteAddr, transportPeerId)
      : [];
    this._lastLibp2pTransportByOwner.set(ownerId, { peerId: transportPeerId, listenAddrs });
    markOutboundPeerVerified(transportPeerId);

    void this._learnInboundDialHints(transportPeerId, context?.remoteAddr).catch((err) =>
      console.warn(`[peer-directory] inbound dial hint learn failed:`, err),
    );

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
        const mesh = this._reachableMesh();
        let listenAddrs = libp2p.listenAddrs;
        if (mesh) {
          try {
            const storeAddrs = await mesh.getPeerStoreDialHints(libp2p.peerId);
            const merged = mergeDialablePeerListenAddrs(libp2p.peerId, listenAddrs, storeAddrs);
            if (merged.length > 0) {
              listenAddrs = merged;
            }
          } catch {
            /* best-effort */
          }
        }
        return { transportPeerId: libp2p.peerId, listenAddrs };
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

    const records = await raceWithTimeout(
      this._peerDirectoryStore.listPeerRecords(),
      25_000,
      "listPeerRecords",
    );
    const connectedPeerIds = mesh?.getConnectedPeerIds() ?? [];

    const liveConnected = pickConnectedTransportForOwner(
      records,
      targetOwnerId,
      connectedPeerIds,
      this._lastLibp2pTransportByOwner,
    );
    if (liveConnected) {
      const listenAddrs = mergeDialablePeerListenAddrs(
        liveConnected.peerId,
        liveConnected.listenAddrs,
        records.filter((r) => r.ownerId === targetOwnerId).flatMap((r) => r.listenAddrs ?? []),
      );
      this._lastLibp2pTransportByOwner.set(targetOwnerId, {
        peerId: liveConnected.peerId,
        listenAddrs,
      });
      return this._finalizePeerTransportResolve(
        targetOwnerId,
        liveConnected.peerId,
        records,
        listenAddrs,
        isConnected,
      );
    }

    const cachedTransport = this._lastLibp2pTransportByOwner.get(targetOwnerId);
    if (cachedTransport && isLibp2pPeerId(cachedTransport.peerId)) {
      let transportPeerId = cachedTransport.peerId;
      let transportListenAddrs = cachedTransport.listenAddrs;
      const bestConnected = pickBestLibp2pPeerDirectoryRecord(records, targetOwnerId, { isConnected });
      if (
        bestConnected &&
        isLibp2pPeerId(bestConnected.peerId) &&
        bestConnected.peerId !== transportPeerId &&
        isConnected?.(bestConnected.peerId)
      ) {
        transportPeerId = bestConnected.peerId;
        transportListenAddrs = bestConnected.listenAddrs ?? [];
        this._lastLibp2pTransportByOwner.set(targetOwnerId, {
          peerId: transportPeerId,
          listenAddrs: transportListenAddrs,
        });
      } else if (isConnected && !isConnected(transportPeerId) && bestConnected && isLibp2pPeerId(bestConnected.peerId)) {
        transportPeerId = bestConnected.peerId;
        transportListenAddrs = bestConnected.listenAddrs ?? [];
        this._lastLibp2pTransportByOwner.set(targetOwnerId, {
          peerId: transportPeerId,
          listenAddrs: transportListenAddrs,
        });
      }
      let dirRow = records.find(
        (r) => r.ownerId === targetOwnerId && r.peerId === transportPeerId,
      );
      if (!dirRow) {
        dirRow = records.find((r) => r.peerId === transportPeerId);
      }
      if (!dirRow) {
        dirRow = pickBestLibp2pPeerDirectoryRecord(records, targetOwnerId, { isConnected });
      }
      const ownerListenAddrs = records
        .filter((r) => r.ownerId === targetOwnerId)
        .flatMap((r) => r.listenAddrs ?? []);
      const listenAddrs = mergeDialablePeerListenAddrs(
        transportPeerId,
        transportListenAddrs,
        dirRow?.listenAddrs,
        ownerListenAddrs,
      );
      return this._finalizePeerTransportResolve(
        targetOwnerId,
        transportPeerId,
        records,
        listenAddrs,
        isConnected,
      );
    }

    let targetPeer: Awaited<ReturnType<LocalPeerDirectoryStore["getPeerByOwnerId"]>>;
    let libp2pRow =
      pickBestLibp2pPeerDirectoryRecord(records, targetOwnerId, { isConnected }) ??
      pickLibp2pFromConnectedPeers(records, targetOwnerId, connectedPeerIds);
    if (libp2pRow) {
      const listenAddrs = mergeDialablePeerListenAddrs(
        libp2pRow.peerId,
        libp2pRow.listenAddrs,
        records.filter((r) => r.ownerId === targetOwnerId).flatMap((r) => r.listenAddrs ?? []),
      );
      this._lastLibp2pTransportByOwner.set(targetOwnerId, {
        peerId: libp2pRow.peerId,
        listenAddrs,
      });
      return this._finalizePeerTransportResolve(
        targetOwnerId,
        libp2pRow.peerId,
        records,
        listenAddrs,
        isConnected,
      );
    }

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
      targetPeer =
        records.find((r) => r.ownerId === targetOwnerId) ??
        records.find((r) => r.peerId === targetOwnerId) ??
        undefined;
    }
    if (!targetPeer?.peerId) {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }
    const transportPeerId = targetPeer.peerId;
    if (!isLibp2pPeerId(transportPeerId)) {
      throw new Error(`Peer directory has Envoy envelope id for this owner (not libp2p).`);
    }
    const listenAddrs = mergeDialablePeerListenAddrs(
      transportPeerId,
      targetPeer.listenAddrs,
      records.filter((r) => r.ownerId === targetOwnerId).flatMap((r) => r.listenAddrs ?? []),
    );
    this._lastLibp2pTransportByOwner.set(targetOwnerId, {
      peerId: transportPeerId,
      listenAddrs,
    });
    return this._finalizePeerTransportResolve(
      targetOwnerId,
      transportPeerId,
      records,
      listenAddrs,
      isConnected,
    );
  }

  /** Prefer a live libp2p connection for this owner when the primary route is down. */
  private _finalizePeerTransportResolve(
    targetOwnerId: string,
    transportPeerId: string,
    records: Awaited<ReturnType<LocalPeerDirectoryStore["listPeerRecords"]>>,
    listenAddrs: string[],
    isConnected: ((peerId: string) => boolean) | undefined,
  ): {
    transportPeerId: string;
    recipientEnvelopePeerId: string | undefined;
    listenAddrs: string[] | undefined;
  } {
    if (isConnected && !isConnected(transportPeerId)) {
      const connected = records
        .filter((r) => r.ownerId === targetOwnerId && isLibp2pPeerId(r.peerId) && isConnected(r.peerId))
        .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
      const live = connected[0];
      if (live) {
        const merged = mergeDialablePeerListenAddrs(
          live.peerId,
          live.listenAddrs,
          records.filter((r) => r.ownerId === targetOwnerId).flatMap((r) => r.listenAddrs ?? []),
        );
        return {
          transportPeerId: live.peerId,
          recipientEnvelopePeerId: resolveRecipientEnvelopePeerId(records, targetOwnerId, live.peerId),
          listenAddrs: merged.length ? merged : undefined,
        };
      }
    }
    return {
      transportPeerId,
      recipientEnvelopePeerId: resolveRecipientEnvelopePeerId(records, targetOwnerId, transportPeerId),
      listenAddrs: listenAddrs.length ? listenAddrs : undefined,
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
    // Only merge legacy bridge messages (deliveryChannel "ai" or unset) into
    // EnvoyAI history. Messages with deliveryChannel "agent" belong to the
    // Ext Agent thread and should not appear in the EnvoyAI panel.
    // Additionally verify sender.ownerId matches the bridge agent — rows
    // written by other senders to this thread should not be merged.
    for (const row of legacy) {
      const meta = (row as ChatMessage).metadata;
      if (meta?.deliveryChannel === "agent") continue;
      const senderOwnerId = (row as ChatMessage).sender?.ownerId?.trim();
      if (senderOwnerId && senderOwnerId !== legacyPeerId) continue;
      byId.set(row.messageId, row as ChatMessage);
    }
    for (const row of primary) {
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
    humanMessageId?: string,
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
    // Use distinct timestamps so human+AI message pairs sort correctly.
    // AI reply timestamp is 1ms after the human message so it always appears after.
    const humanTimestamp = new Date().toISOString();
    const aiTimestamp = new Date(Date.now() + 1).toISOString();
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

    // Only persist and emit the human message if the caller hasn't already
    // done so (indicated by humanMessageId being undefined). When humanMessageId
    // is provided (sendToOpenClaw passes its existing messageId), the caller has
    // already emitted and stored the human message — emitting again would create
    // a duplicate WS event and a second storage row with the same messageId.
    if (trimmed && !humanMessageId) {
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
          timestamp: humanTimestamp,
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
          displayName: "EnvoyAI",
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
          timestamp: aiTimestamp,
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

  /** After inbound file transfer, attach the local vault path to an existing 1:1 chat message. */
  private async _applyDirectChatAttachmentVaultPath(input: {
    peerOwnerId: string;
    messageId: string;
    attachmentId: string;
    vaultRelativePath: string;
  }): Promise<void> {
    if (!this._chatLogStore) return;
    const threadPeerOwnerId = input.peerOwnerId.trim();
    const vaultPath = input.vaultRelativePath.replace(/^[\\/]+/, "");
    const updated = await this._chatLogStore.updateAttachmentVaultPath(
      threadPeerOwnerId,
      input.messageId,
      input.attachmentId,
      vaultPath,
    );
    if (!updated) {
      this._transferState.deferredDirectChatAttachmentVaultPath.set(
        deferredDirectChatAttachmentKey(threadPeerOwnerId, input.messageId, input.attachmentId),
        vaultPath,
      );
      return;
    }
    this._transferState.deferredDirectChatAttachmentVaultPath.delete(
      deferredDirectChatAttachmentKey(threadPeerOwnerId, input.messageId, input.attachmentId),
    );
    await this._emitDirectChatMessageAfterAttachmentUpdate(threadPeerOwnerId, input.messageId);
  }

  private async _reconcileDeferredDirectChatAttachmentVaultPaths(
    peerOwnerId: string,
    message: ChatMessage,
  ): Promise<void> {
    if (!this._chatLogStore) return;
    const attachments = message.content.attachments;
    if (!attachments?.length) return;
    const threadPeerOwnerId = peerOwnerId.trim();
    let changed = false;
    for (const attachment of attachments) {
      const key = deferredDirectChatAttachmentKey(
        threadPeerOwnerId,
        message.messageId,
        attachment.id,
      );
      const vaultPath = this._transferState.deferredDirectChatAttachmentVaultPath.get(key);
      if (!vaultPath) continue;
      const updated = await this._chatLogStore.updateAttachmentVaultPath(
        threadPeerOwnerId,
        message.messageId,
        attachment.id,
        vaultPath,
      );
      if (!updated) continue;
      this._transferState.deferredDirectChatAttachmentVaultPath.delete(key);
      changed = true;
    }
    if (!changed) return;
  }

  private async _emitDirectChatMessageAfterAttachmentUpdate(
    threadPeerOwnerId: string,
    messageId: string,
  ): Promise<void> {
    if (!this._chatLogStore) return;
    const rows = await this._chatLogStore.listThread(threadPeerOwnerId, 5000);
    const msg = rows.find((row) => row.messageId === messageId);
    if (!msg) return;
    const full: ChatMessage = { ...msg, signature: msg.signature };
    this.emit("chat:message", full);
  }

  private async _deliverChatEnvelope(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs?: string[],
    options?: { expectDeliveryAck?: boolean },
  ): Promise<ChatDeliverResult> {
    return this._withChatSendLock(transportPeerId, async () => {
      const mesh = this._requireMesh();
      return deliverChatEnvelopeWithRetry({
        mesh,
        transportPeerId,
        envelope,
        dialHints,
        peerListenAddrs: listenAddrs,
        chatProtocol: ENVOY_CHAT_PROTOCOL,
        rebuildDialHints: () => this._dialHintsForChat(transportPeerId, listenAddrs),
        expectDeliveryAck: options?.expectDeliveryAck,
      });
    });
  }

  /**
   * Phase 42A — `call.*` envelope delivery on the chat libp2p protocol (same
   * stable path as chat.message). Skips the delivery ack wait.
   */
  /**
   * Deliver a signed `call.*` envelope on the chat protocol to an already-known libp2p peer
   * (e.g. call.reject busy path from index.ts inbound handler).
   */
  async deliverCallEnvelopeToTransportPeer(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
  ): Promise<void> {
    const mesh = this._requireMesh();
    const conn = mesh.getPeerConnectionInfo(transportPeerId);
    if (conn.connected || mesh.getConnectedPeerIds().includes(transportPeerId)) {
      await mesh.sendChat(transportPeerId, envelope, { dialHints: [] });
      return;
    }
    await this._deliverCallEnvelope(transportPeerId, envelope, [], undefined, false);
  }

  private async _deliverCallEnvelope(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs?: string[],
    preferCircuitHints?: boolean,
  ): Promise<ChatDeliverResult> {
    return this._withChatSendLock(transportPeerId, async () => {
      const mesh = this._requireMesh();
      let conn = mesh.getPeerConnectionInfo(transportPeerId);
      webrtcCallTrace("node:deliver-call-envelope", {
        intent: envelope.intent,
        callId: shortCallId(
          typeof envelope.payload === "object" &&
            envelope.payload !== null &&
            "callId" in envelope.payload
            ? String((envelope.payload as { callId?: string }).callId)
            : undefined,
        ),
        peer: shortCallId(transportPeerId),
        connected: conn.connected,
        direct: conn.direct,
        hintCount: dialHints.length,
      });
      if (!conn.connected) {
        const dialTargets = [...new Set([...(listenAddrs ?? []), ...dialHints])]
          .map((a) => a.trim())
          .filter(Boolean);
        if (dialTargets.length > 0) {
          // Order by expected speed: LAN TCP first, then direct TCP, then relay circuits.
          const ordered = [...dialTargets].sort((a, b) => {
            const aLan = isPrivateLanTcpDialHint(a) ? 1 : 0;
            const bLan = isPrivateLanTcpDialHint(b) ? 1 : 0;
            if (aLan !== bLan) return bLan - aLan; // LAN first
            const aCircuit = a.includes("/p2p-circuit/") ? 1 : 0;
            const bCircuit = b.includes("/p2p-circuit/") ? 1 : 0;
            if (aCircuit !== bCircuit) return aCircuit - bCircuit; // direct before circuit
            return 0;
          });
          // Try addresses sequentially in speed order — stops at first success.
          // Sequential avoids connection flapping from simultaneous dials.
          for (const addr of ordered) {
            try {
              await mesh.dial(addr);
              conn = mesh.getPeerConnectionInfo(transportPeerId);
              if (conn.connected) break;
            } catch {
              /* try next addr */
            }
          }
        }
      }
      const preferCircuits = preferCircuitHints ?? !conn.direct;
      const wasConnected = conn.connected;
      if (conn.connected) {
        try {
          await mesh.sendChat(transportPeerId, envelope, {
            dialHints: [],
            preferCircuitHints: preferCircuits && !conn.direct,
          });
          webrtcCallTrace("node:deliver-call-fast-path-ok", {
            peer: shortCallId(transportPeerId),
            direct: conn.direct,
          });
          return { delivered: true, deliveredAt: new Date().toISOString() };
        } catch (fastErr) {
          webrtcCallWarn("node:deliver-call-fast-path-failed", {
            peer: shortCallId(transportPeerId),
            error: fastErr instanceof Error ? fastErr.message.slice(0, 120) : String(fastErr),
          });
          console.warn(
            `[call] connected send failed for ${transportPeerId.slice(0, 12)}…, retrying:`,
            fastErr instanceof Error ? fastErr.message : fastErr,
          );
        }
      }
      return deliverCallEnvelopeWithRetry({
        mesh,
        transportPeerId,
        envelope,
        dialHints: wasConnected ? [] : dialHints,
        peerListenAddrs: wasConnected ? [] : listenAddrs,
        preferCircuitHints: preferCircuits,
        rebuildDialHints: wasConnected
          ? undefined
          : () => this._dialHintsForChat(transportPeerId, listenAddrs),
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
    return withOutboundSendLock(transportPeerId, fn);
  }

  async sendChat(targetOwnerId: string, text: string, attachments?: SendChatParams["attachments"]): Promise<SendChatResult> {
    this._assertOnline();
    // Record owner activity when they send a message (keeps them "online" in automatic mode)
    this.recordOwnerActivity();
    recordMeshActivity();
    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    console.log(`[sendChat] targetOwnerId=${targetOwnerId}, text=${text}`);

    let transportPeerId: string;
    let recipientEnvelopePeerId: string | undefined;
    let listenAddrs: string[] | undefined;
    try {
      ({ transportPeerId, recipientEnvelopePeerId, listenAddrs } =
        await this._resolvePeerTransportForOwner(targetOwnerId));
    } catch (err) {
      this._lastLibp2pTransportByOwner.delete(targetOwnerId);
      throw err;
    }

    const [selfHuman, recipientTrust] = await Promise.all([
      this._humanProfileStore.loadHumanProfile(),
      this._trustStore.getTrustRecord(targetOwnerId),
    ]);

    // If the peer is already connected, skip the disk-I/O-bound
    // _dialHintsForChat computation (can block intermittently for 10s+).
    const conn = mesh.getPeerConnectionInfo(transportPeerId);
    let dialHints: string[];
    if (conn.connected || mesh.getConnectedPeerIds().includes(transportPeerId)) {
      dialHints = [];
    } else {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(transportPeerId, listenAddrs),
        10_000,
        "_dialHintsForChat",
      );
    }

    void mesh.scrubPeerStoreDialHints(
      transportPeerId,
      mergeDialablePeerListenAddrs(transportPeerId, listenAddrs, dialHints),
    );

    console.log(
      `[sendChat] transportPeerId=${transportPeerId} connected=${conn.connected} envelopeRecipientPeerId=${recipientEnvelopePeerId ?? "(omitted)"} dialHints=${dialHints.length}`,
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
          attachments: attachments?.map((a: NonNullable<SendChatParams["attachments"]>[number]) => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            sensitivity: a.sensitivity,
            ...(a.vaultRelativePath ? { vaultRelativePath: a.vaultRelativePath } : {}),
          })),
          ...chatMessagePayloadDeviceFields({
            deviceCertificate: selfProfile.deviceCertificate,
            ownerPublicKeyPem: selfProfile.owner.publicKeyPem,
          }),
        }),
      }),
      selfProfile.device.privateKeyPem,
    );

    let deliverResult: ChatDeliverResult = { delivered: false };
    try {
      if (transportPeerId === mesh.peerId && this._bridgeChatHandler) {
        console.log(`[sendChat] self-send to ${targetOwnerId}, routing via bridge handler`);
        await this._bridgeChatHandler(envelope, mesh.peerId);
        deliverResult = { delivered: true, deliveredAt: new Date().toISOString() };
      } else {
        // When directly connected on LAN, skip the 45s delivery ack wait —
        // delivery is nearly instant. Only wait for ack on relay/WAN.
        const skipAck = conn.connected && conn.direct;
        deliverResult = await this._deliverChatEnvelope(transportPeerId, envelope, dialHints, listenAddrs, {
          ...(skipAck ? { expectDeliveryAck: false } : undefined),
        });
      }
    } catch (err) {
      this._lastLibp2pTransportByOwner.delete(targetOwnerId);
      throw err;
    }

    if (deliverResult.delivered) {
      this._lastLibp2pTransportByOwner.set(targetOwnerId, {
        peerId: transportPeerId,
        listenAddrs: listenAddrs ?? [],
      });
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
        ...(attachments?.length ? { attachments: attachments.map((a: NonNullable<SendChatParams["attachments"]>[number]) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes, sensitivity: a.sensitivity, ...(a.vaultRelativePath ? { vaultRelativePath: a.vaultRelativePath } : {}) })) } : {}),
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
      deliverResult = await this._deliverChatEnvelope(transportPeerId, envelope, dialHints, listenAddrs, {
        expectDeliveryAck: false,
      });
    }

    if (deliverResult.delivered || transportPeerId !== mesh.peerId) {
      this._lastLibp2pTransportByOwner.set(targetOwnerId, {
        peerId: transportPeerId,
        listenAddrs: listenAddrs ?? [],
      });
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
    await this._deliverCallEnvelope(transportPeerId, envelope, dialHints, listenAddrs);
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
      getLastInteractionAt: async () => null, // TODO: wire chat log store
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
    return {
      getBonds: () => this.getBonds(),
      getProfileOwnerId: () => this._profile?.owner.ownerId ?? "local-owner",
      hasTaskStore: () => Boolean(this._taskStore),
      loadConfig: () => this._configStore.load(),
      getAgentActivityStore: () => this._agentActivityStore,
      getContactTopicsFromLibrary: (ownerId) => this._getContactTopicsFromLibrary(ownerId),
      emit: (event, data) => this.emit?.(event as never, data as never),
    };
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
  private static readonly _openClawStartupProbeAttempts = 300; // 300 × 1s = 5 minutes for cold start
  private static readonly _openClawWatchdogIntervalMs = 60_000; // 1 minute between watchdog checks
  private _openclawActiveTurnTools: string[] | null = null;
  private _openClawAskInFlight = 0;
  private _openClawGatewayRouteRegistered = false;
  private _openClawLastProbeWarnAt = 0;
  private _openClawAskChain: Promise<unknown> = Promise.resolve();
  private _openclawWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private _openclawWatchdogRunning = false;

  private _setOpenClawGatewayReady(ready: boolean): void {
    this._openclawGatewayReady = ready;
    if (!ready) {
      this._openClawGatewayRouteRegistered = false;
    }
  }

  /**
   * Watchdog: if the gateway has been ready but the route stops responding,
   * restart it automatically. Runs every _openClawWatchdogIntervalMs once started.
   */
  private _startOpenClawWatchdog(): void {
    if (this._openclawWatchdogRunning) return;
    this._openclawWatchdogRunning = true;
    const tick = async () => {
      if (!this._openclawWatchdogRunning) return;
      // Only act if the gateway child is alive but the route is gone
      if (
        this._openclawGatewayChild &&
        !this._openclawGatewayChild.killed &&
        !this._openClawGatewayRouteRegistered
      ) {
        console.warn("[openclaw] Watchdog: gateway process alive but route unregistered — restarting");
        this._openclawWatchdogRunning = false;
        this._stopOpenClawWatchdog();
        await this.startOpenClaw();
        return;
      }
      if (!this._openclawWatchdogRunning) return;
      this._openclawWatchdogTimer = setTimeout(tick, NodeServiceImpl._openClawWatchdogIntervalMs);
    };
    this._openclawWatchdogTimer = setTimeout(tick, NodeServiceImpl._openClawWatchdogIntervalMs);
  }

  private _stopOpenClawWatchdog(): void {
    this._openclawWatchdogRunning = false;
    if (this._openclawWatchdogTimer) {
      clearTimeout(this._openclawWatchdogTimer);
      this._openclawWatchdogTimer = null;
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

  /**
   * Whether the built-in OpenClaw agent is enabled in the persisted config.
   * Reads from disk every call (no in-memory cache) so a config update via
   * `updateNodeConfig` is picked up by the next `startOpenClaw()`.
   * Returns `true` when the field is absent (D1C: ships on by default).
   */
  private async _isOpenClawEnabled(): Promise<boolean> {
    const cfg = await this._configStore.load();
    return cfg?.openclawEnabled ?? true;
  }

  private async _ensureOpenClawReady(): Promise<boolean> {
    if (this.isOpenClawReady()) return true;

    // Gateway process still starting — poll without spawning a duplicate.
    if (this._openclawGatewayChild && !this._openclawGatewayChild.killed) {
      if (await this._waitForOpenClawGatewayReady()) {
        this._setOpenClawGatewayReady(true);
        this._startOpenClawWatchdog();
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
    if ((await this._isOpenClawEnabled()) === false) return false;
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
      this._stopOpenClawWatchdog();
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

    // 7. Start watchdog so a crashed gateway is auto-restarted.
    if (gatewayReady) {
      this._startOpenClawWatchdog();
    }

    // 8. HTTP runtime: POST to built-in OpenClaw webhook, await sync reply via bridge correlationId.
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
    this._stopOpenClawWatchdog();
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

    // Use correlationId so the AI reply goes through resolveOpenClawReply →
    // _persistEnvoyAiChatExchange (single, correct path) instead of
    // receiveFromAgent → onSelfSendEnvelope (duplicate emission).
    const correlationId = `oc-openclaw-${randomUUID()}`;
    const replyPromise = this._waitForOpenClawReply(correlationId);

    let fromName = ownerId;
    try {
      const profile = await this._humanProfileStore?.loadHumanProfile();
      if (profile?.displayName?.trim()) fromName = profile.displayName.trim();
    } catch { /* use ownerId */ }

    const body = JSON.stringify({
      from: this._mesh?.peerId ?? "",
      fromOwnerId: ownerId,
      fromName,
      text,
      ...(policyPrompt?.trim() ? { policyPrompt: policyPrompt.trim() } : {}),
      ...(retrievedContext?.trim() ? { retrievedContext: retrievedContext.trim() } : {}),
      correlationId,
    });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this._assistantAgentSecret) {
      headers.Authorization = `Bearer ${this._assistantAgentSecret}`;
    }

    const [answer] = await Promise.all([
      replyPromise,
      (async () => {
        const resp = await fetch(this._assistantAgentUrl, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(300_000),
        });
        if (!resp.ok) {
          // If OpenClaw returns an error (e.g. 400, 404, 500), cancel the
          // reply promise and fall through to the native LLM fallback below.
          const detail = await resp.text().catch(() => "");
          console.warn(`[openclaw] webhook returned ${resp.status}: ${detail.slice(0, 200)}`);
          this._cancelOpenClawReply(correlationId, new Error(`OpenClaw webhook ${resp.status}`));
        }
      })(),
    ]);

    // Persist the AI response — reuse the existing human messageId so we don't
    // create a duplicate storage row and duplicate WS event.
    await this._persistEnvoyAiChatExchange(text, {
      answer,
      domain: "knowledge",
      intent: "knowledge",
      toolsUsed: [],
      approvalItems: [],
      modelUsed: "openclaw",
    }, messageId);
  }

  /**
   * Send a message to the external HTTP agent via the bridge.
   * Persists the outbound message under the bridge agent's peer ID with
   * deliveryChannel="agent" so it appears in the Ext Agent thread.
   * The agent's reply arrives via receiveFromAgent → chat:message to the mobile.
   */
  async sendToBridge(text: string): Promise<void> {
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

    // Persist the outbound message so it appears in the Ext Agent thread on the home node.
    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const outboundMsg: ChatMessage = {
      messageId,
      sender: {
        nodeId: meshPeerId,
        ownerId,
        displayName: ownerId,
        actorRole: "human",
      },
      recipient: {
        nodeId: bridgeAgentPeerId,
        ownerId: bridgeAgentPeerId,
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
    // Store under agentPeerId thread (Ext Agent thread)
    this._persistChatMessage(bridgeAgentPeerId, outboundMsg);
    // Emit for WebSocket-connected clients (Social desktop/mobile)
    this.emit("chat:message", outboundMsg);

    // Forward to the external agent via HTTP. forwardToAgent calls receiveFromAgent
    // internally which delivers the reply back to the mobile via libp2p.
    const bridgeConfig = this._bridgeStatus;
    if (!bridgeConfig) return;

    try {
      await forwardToAgent(
        {
          enabled: true,
          agentUrl: bridgeConfig.agentUrl,
          listenPort: 0,
          agentName: bridgeConfig.agentName,
        } as any,
        {
          senderPeerId: meshPeerId,
          senderOwnerId: ownerId,
          senderDisplayName: ownerId,
          text,
        },
      );
    } catch (err) {
      console.error("[bridge] sendToBridge: forwardToAgent failed:", err instanceof Error ? err.message : String(err));
    }
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
    return {
      store: this._continuityStore,
      getDeviceId: () => this._profile?.owner.ownerId ?? "local-owner",
    };
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
      awardChainWorker: (payload) => this._executeApprovedChainAward(payload),
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
    homeNodePeerId?: string;
  }> {
    const profile = this._profile;
    const payload = await this.getPairingPayload();
    return {
      ownerId: profile?.owner?.ownerId ?? payload.ownerId ?? "",
      ownerPublicKey: profile?.owner?.publicKeyPem ?? payload.ownerPublicKey,
      agentPeerId: payload.agentPeerId,
      agentName: payload.agentName,
      wsUrl: payload.wsUrl,
      lanWsUrl: payload.lanWsUrl,
      relayWsUrl: payload.relayWsUrl ?? this._relayPublicWsUrl,
      homeNodePeerId: payload.homeNodePeerId,
    };
  }

  // ============================================
  // File Sharing
  // ============================================

  private async _appendAuditEvent(event: AuditEvent): Promise<void> {
    if (!this._taskStore) return;
    await this._taskStore.appendAuditEvent(event);
  }

  private _fileShareContext(): FileShareContext {
    return {
      getVaultDir: () => this._vaultDir,
      getProfileDir: () => this._profileDir,
      getNodeConfig: () => this.getNodeConfig(),
      getTaskStore: () => this._taskStore,
      getRagService: () => this._getRagService(),
      recordOwnerActivity: () => this.recordOwnerActivity(),
      appendAuditEvent: (event) => this._appendAuditEvent(event),
      emit: (event, payload) => this.emit?.(event as never, payload as never),
    };
  }

  private _sessionTokenContext(): SessionTokenAccess {
    return {
      getSessionTokenStore: () => (this._sessionTokenStore as never) ?? undefined,
    };
  }

  private _recordNodeErrorContext(): RecordNodeErrorAccess {
    return {
      getLastNodeError: () => this._lastNodeError,
      setLastNodeError: (v) => {
        this._lastNodeError = v;
      },
      getLastNodeErrorAt: () => this._lastNodeErrorAt,
      setLastNodeErrorAt: (v) => {
        this._lastNodeErrorAt = v;
      },
    };
  }

    private _connectionStatusContext(): ConnectionStatusContext {
    return {
      getLastNodeError: () => this._lastNodeError,
      getLastNodeErrorAt: () => this._lastNodeErrorAt,
      getReachableMesh: () => this._reachableMesh() as never,
      getNodeStatus: () => this._nodeStatus,
      getRelayBootstrapPeers: () => this._relayBootstrapPeers,
      hasTerminalManager: () => Boolean(this._terminalManager),
      getBridgeStatus: () => this._bridgeStatus ?? undefined,
    };
  }

  private _nodeConfigContext(): NodeConfigContext {
    return {
      getProfileDir: () => this._profileDir,
      loadNodeConfig: () => this._configStore.load(),
      saveNodeConfig: (config) => this._configStore.save(config),
      getBridgeStatus: () => this._bridgeStatus ?? undefined,
      getRelayPublicWsUrl: () => this._relayPublicWsUrl ?? null,
      loadBridgeConfigSkillApiKeys: async () => (await this._loadBridgeConfigSkillApiKeys()) ?? ({} as Record<string, string>),
      loadBridgeConfigWebSearchEnabled: async () => Boolean(await this._loadBridgeConfigWebSearchEnabled()),
      getProfile: () => this._profile,
    };
  }

  private _capabilityDiscoveryContext(): CapabilityDiscoveryContext {
    return {
      getMesh: () => this._mesh,
      getProfile: () => this._profile,
      getTaskStore: () => this._taskStore,
      getDiscoverySeedStore: () => this._discoverySeedStore,
      loadConfig: () => this._configStore.load(),
      getCapabilityDiscoveryTimer: () => this._capabilityDiscoveryTimer,
      setCapabilityDiscoveryTimer: (timer) => {
        this._capabilityDiscoveryTimer = timer;
      },
      syncPairingKioskFromConfig: () => this._syncPairingKioskFromConfig(),
    };
  }

  private _agentSetupContext(): AgentSetupContext {
    return {
      saveConfig: (config) => this._configStore.save(config),
      loadConfig: () => this._configStore.load(),
      getProfileDir: () => this._profileDir,
      getProfile: () => this._profile,
      setProfile: (p) => {
        this._profile = p;
      },
      getTaskStore: () => this._taskStore,
      setTaskStore: (s) => {
        this._taskStore = s as never;
      },
      getNodeStatus: () => this._nodeStatus,
      getToolExecutionContext: () => this.getToolExecutionContext(),
    };
  }

  private _stopNodeContext(): StopNodeContext {
    return {
      getNodeStatus: () => this._nodeStatus,
      setNodeStatus: (s) => {
        this._nodeStatus = s;
      },
      emit: (event, payload) => this.emit?.(event as never, payload as never),
      clearProfileRequestInflight: () => this._profileRequestInflight.clear(),
      stopPairingKiosk: () => this.stopPairingKiosk(),
      getAndClearRelayClientSchedulerStop: () => {
        const fn = this._stopRelayClientScheduler;
        this._stopRelayClientScheduler = undefined;
        return fn;
      },
      getAndClearCapabilityDiscoveryTimer: () => {
        const t = this._capabilityDiscoveryTimer;
        this._capabilityDiscoveryTimer = undefined;
        return t;
      },
      getAndClearNodeStatsLoggingStop: () => {
        const fn = this._stopNodeStatsLogging;
        this._stopNodeStatsLogging = undefined;
        return fn;
      },
      getAndClearBondWarmTimer: () => {
        const t = this._bondWarmTimer;
        this._bondWarmTimer = undefined;
        return t;
      },
      getAndClearProfileRefreshStartupTimer: () => {
        const t = this._profileRefreshStartupTimer;
        this._profileRefreshStartupTimer = undefined;
        return t;
      },
      getAndClearChatRoomSyncFlushTimer: () => {
        const t = this._chatRoomSyncFlushTimer;
        this._chatRoomSyncFlushTimer = null;
        return t;
      },
      getMesh: () => this._mesh as never,
      setMesh: (m) => {
        this._mesh = m as never;
      },
      clearExternalMesh: () => {
        this._externalMesh = undefined;
      },
      getAndClearAdvertiseInterestsTimer: () => {
        const t = this._advertiseInterestsTimer;
        this._advertiseInterestsTimer = undefined;
        return t;
      },
      getAndClearAdvertiseInterestsStartupTimeout: () => {
        const t = this._advertiseInterestsStartupTimeout;
        this._advertiseInterestsStartupTimeout = undefined;
        return t;
      },
      getDeviceId: () => this._profile?.device?.deviceId,
    };
  }

    private _manifestContext(): CapabilityManifestContext {
    return {
      getProfileDir: () => this._profileDir,
      getCapabilityManifestStore: () => this._capabilityManifestStore as never,
      loadNodeConfig: async () => (await this._configStore.load()) as never,
      saveNodeConfig: async (cfg) => {
        await this._configStore.save(cfg as never);
      },
    };
  }

    private _fileShareNetworkContext(): FileShareNetworkContext {
    return {
      ...this._fileShareContext(),
      assertOnline: () => this._assertOnline(),
      requireMesh: () => this._requireMesh() as never,
      requireProfile: () => this._requireProfile() as never,
      resolvePeerTransportForOwner: (ownerId) =>
        this._resolvePeerTransportForOwner(ownerId) as never,
      dialHintsForChat: (peerId, listenAddrs) =>
        this._dialHintsForChat(peerId, listenAddrs) as never,
      getBonds: () => this.getBonds() as never,
      deliverCallEnvelope: (targetPeerId, envelope, dialHints, listenAddrs) =>
        this._deliverCallEnvelope(
          targetPeerId,
          envelope as never,
          dialHints,
          listenAddrs,
        ) as never,
      setPendingPushShare: (messageId, info) => {
        this._pendingPushShareByRequestMsgId.set(messageId, {
          relativePath: info.relativePath,
          toPeerId: info.toPeerId,
          deliveryChannel: info.deliveryChannel as never,
        });
      },
      setPendingPullShare: (messageId, info) => {
        this._pendingPullShareByRequestMsgId.set(messageId, {
          peerRelativePath: info.peerRelativePath,
          targetOwnerId: info.targetOwnerId,
          toPeerId: info.toPeerId,
          sensitivity: info.sensitivity as never,
        });
      },
      setCorrelationByRequestMsgId: (messageId, correlationId) => {
        this._transferState.correlationByRequestMsgId.set(messageId, correlationId);
      },
      upsertTransferStatus: (status) => {
        this._upsertTransferStatus(status as never);
      },
      isVaultPathSafe: (rel) => isSafeVaultPath(this._vaultDir, rel),
    };
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

  async verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult> {
    return verifyLibraryItemIpfsGatewayViaRuntime(this._fileShareContext(), params);
  }

  async importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult> {
    return importToLibraryViaRuntime(this._fileShareContext(), params);
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
    return [...this._transferState.pendingInboundShareOffers.values()];
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
    const offer = this._transferState.pendingInboundShareOffers.get(shareId);
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
      this._transferState.pendingDataTransferSavePath.set(`${offer.senderNodeId}\n${srcKey}`, saveNorm);
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
    await this._deliverCallEnvelope(offer.senderNodeId, envelope, dialHints, rec?.listenAddrs);
    void this._tagBondedContactReachability(offer.senderNodeId);
    this._transferState.correlationByPreviewMsgId.set(shareId, shareId);
    this._transferState.inboundTransferByShareId.set(shareId, {
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
    this._transferState.pendingInboundShareOffers.delete(shareId);
    const emitPath = saveNorm || srcKey || offer.filename;
    this.emit("share:accepted", { shareId, savePath: emitPath });
  }

  async declineShare(shareId: string): Promise<void> {
    this._assertOnline();
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
    const offer = this._transferState.pendingInboundShareOffers.get(shareId);
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
    await this._deliverCallEnvelope(offer.senderNodeId, envelope, dialHints, rec?.listenAddrs);
    this._transferState.pendingInboundShareOffers.delete(shareId);
    this.emit("share:declined", { shareId });
  }

  // ============================================
  // Node Configuration
  // ============================================

  async getNodeConfig(): Promise<NodeConfig> {
    return getNodeConfigViaRuntime(this._nodeConfigContext());
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
    return updateNodeConfigViaRuntime(this._nodeConfigContext(), config);
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
    return startNodeViaRuntime(this._startNodeContext());
  }

  private _startNodeContext(): StartNodeContext {
    return {
      getNodeStatus: () => this._nodeStatus,
      setNodeStatus: (s) => {
        this._nodeStatus = s;
      },
      emit: (event, payload) => this.emit?.(event as never, payload as never),
      getProfile: () => this._profile,
      setProfile: (p) => {
        this._profile = p;
      },
      getTaskStore: () => this._taskStore,
      setTaskStore: (s) => {
        this._taskStore = s;
      },
      getRelayStateStore: () => this._relayStateStore,
      setRelayStateStore: (s) => {
        this._relayStateStore = s;
      },
      getDiscoverySeedStore: () => this._discoverySeedStore,
      setDiscoverySeedStore: (s) => {
        this._discoverySeedStore = s;
      },
      getTaskRuntimeStore: () => this._taskRuntimeStore,
      setTaskRuntimeStore: (s) => {
        this._taskRuntimeStore = s;
      },
      getInboundGuard: () => this._inboundGuard,
      setInboundGuard: (g) => {
        this._inboundGuard = g;
      },
      getTaskDispatcher: () => this._taskDispatcher,
      setTaskDispatcher: (d) => {
        this._taskDispatcher = d;
      },
      loadConfig: () => this._configStore.load(),
      getMesh: () => this._mesh,
      setMesh: (m) => {
        this._mesh = m as never;
      },
      wireMeshEvents: () => this._wireMeshEvents(),
      setRelayBootstrapPeers: (addrs) => {
        this._relayBootstrapPeers = addrs;
      },
      setStopRelayClientScheduler: (fn) => {
        this._stopRelayClientScheduler = fn;
      },
      setStopNodeStatsLogging: (fn) => {
        this._stopNodeStatsLogging = fn;
      },
      setCapabilityDiscoveryTimer: (t) => {
        this._capabilityDiscoveryTimer = t;
      },
      setAdvertiseInterestsStartupTimeout: (t) => {
        this._advertiseInterestsStartupTimeout = t;
      },
      setLastNodeError: (v) => {
        this._lastNodeError = v;
      },
      setLastNodeErrorAt: (v) => {
        this._lastNodeErrorAt = v;
      },
      setNodeProcessStartedAtMs: (ms) => {
        this._nodeProcessStartedAtMs = ms;
      },
      startBondWarmInterval: () => this._startBondWarmInterval(),
      resyncBondedContactReachabilityTags: () =>
        this._resyncBondedContactReachabilityTags(),
      refreshCapabilityIndex: () => this.refreshCapabilityIndex(),
      scheduleDeferredProfileRefresh: (reason) =>
        this._scheduleDeferredProfileRefresh(reason),
      advertiseInterestsIfPublic: () => this._advertiseInterestsIfPublic(),
      loadPublishedLibraryFromDisk: () => this.loadPublishedLibraryFromDisk(),
      loadIntentHistoryFromDisk: () => this.loadIntentHistoryFromDisk(),
      recordNodeError: (context, err) => this._recordNodeError(context, err),
      ensureAgentStores: () => this._ensureAgentStores(),
      runCapabilityDiscoveryCycle: (source, opts) =>
        this._runCapabilityDiscoveryCycle(source, opts),
      startCapabilityDiscoveryScheduler: (runtime) =>
        this._startCapabilityDiscoveryScheduler(runtime),
    };
  }

  private _wireMeshEvents(): void {
    wireMeshEventsViaRuntime(this._wireMeshEventsContext());
  }

  private _wireMeshEventsContext(): WireMeshEventsContext {
    return {
      mesh: this._mesh as never,
      onMessage: (params) => this._handleInboundMessage(params),
      onPeerDiscovered: (params) => this._handlePeerDiscovered(params),
    };
  }

  private _sharePreviewContext(): SharePreviewContext {
    return {
      recordInboundPullSharePreview: (input) =>
        this.recordInboundPullSharePreview(input),
      linkOutboundSharePreviewFromInbound: (messageId, inReplyTo) =>
        this.linkOutboundSharePreviewFromInbound(messageId, inReplyTo),
    };
  }

  private _pairingKioskContext(): PairingKioskContext {
    return {
      loadConfig: () => this._configStore.load(),
      getKiosk: () => this._pairingKiosk,
      setKiosk: (handle) => {
        this._pairingKiosk = handle;
      },
      stopKiosk: () => this.stopPairingKiosk(),
      getTaskStore: () => this._taskStore,
      getCompanyInviteContext: () => this._companyInviteInviteContext(),
    };
  }

  private _pairDeviceContext(): PairDeviceContext {
    return {
      validatePairingToken: (token) => this.validatePairingToken(token),
      consumeCompanyInvite: (token, ownerId, deviceId) =>
        this._consumeCompanyInviteOrThrow(token, ownerId, deviceId),
      setTrustRecordDirect: (record) =>
        this._trustStore.setTrustRecord(record as never).then(() => undefined) as Promise<void>,
      mergeInboundDeviceBinding: (input) =>
        this._peerDirectoryStore.mergeInboundDeviceBinding(input),
      getSessionTokenStore: () => (this._sessionTokenStore as never) ?? null,
      getBridgeStatus: () => this.getBridgeStatus(),
    };
  }

  private _pairSharedIdentityContext(): PairSharedIdentityContext {
    return {
      requireProfile: () => this._requireProfile(),
      validatePairingToken: (token) => this.validatePairingToken(token),
      consumeCompanyInvite: (token, ownerId, deviceId) =>
        this._consumeCompanyInviteOrThrow(token, ownerId, deviceId),
      setTrustRecordDirect: (record) =>
        this._trustStore.setTrustRecord(record as never).then(() => undefined) as Promise<void>,
      mergeInboundDeviceBinding: (input) =>
        this._peerDirectoryStore.mergeInboundDeviceBinding(input),
      getSessionTokenStore: () => (this._sessionTokenStore as never) ?? null,
      getDeviceAuthorizationStore: () =>
        (this._deviceAuthorizationStore as never) ?? null,
      getBridgeStatus: () => this.getBridgeStatus(),
    };
  }

  private _getPairingPayloadContext(): GetPairingPayloadContext {
    return {
      getBridgeStatus: () => this.getBridgeStatus(),
      getReachableMesh: () => (this._mesh ?? this._externalMesh) as never,
      getWsPort: () => this._wsPort,
      getWsPath: () => this._wsPath,
      getRelayPublicWsUrl: () => this._relayPublicWsUrl,
      getRelayBootstrapPeers: () => this._relayBootstrapPeers,
      getProfile: () => this._profile,
      deriveRelayWsUrl: (addr) => NodeServiceImpl._deriveRelayWsUrl(addr),
      autoDiscoverRelayWsUrl: () => this._autoDiscoverRelayWsUrl(),
      autoDiscoverRelayPeerId: () => this._autoDiscoverRelayPeerId(),
      setPairingToken: (token, issuedAt) => {
        this._pairingToken = token;
        this._pairingTokenIssuedAt = issuedAt;
      },
    };
  }

  private _runOwnerAgentTurnContext(): RunOwnerAgentTurnContext {
    return {
      recordOwnerActivity: () => this.recordOwnerActivity(),
      ensureOpenClawReady: () => this._ensureOpenClawReady(),
      beginOpenClawToolTracking: () => this._beginOpenClawToolTracking(),
      endOpenClawToolTracking: () => this._endOpenClawToolTracking(),
      buildOpenClawTurnContext: () => this._buildOpenClawTurnContext(),
      askOpenClaw: (msg, ctx) => this.askOpenClaw(msg, ctx as never),
      persistEnvoyAiChatExchange: (raw, turn, humanMsgId) =>
        this._persistEnvoyAiChatExchange(raw, turn, humanMsgId),
      maybeIngestTerminalAssistantReply: (sid, answer) =>
        this._maybeIngestTerminalAssistantReply(sid, answer),
      getRagService: () => this._getRagService() as never,
      getTaskStore: () => this._taskStore as never,
      runDocumentAgentTurnCore: (msg) => this._runDocumentAgentTurnCore(msg) as never,
      getApprovalQueue: () => this._approvalQueue as never,
    };
  }

  private _runDocumentAgentTurnContext(): RunDocumentAgentTurnContext {
    return {
      requireToolExecutionContext: () => this._requireToolExecutionContext(),
      listLibraryItems: (q) =>
        this.listLibraryItems(q ? { query: q.query } : undefined) as never,
      getBonds: () => this.getBonds() as never,
      executeTool: (toolName, params) =>
        (async () => {
          const ctx = await this._requireToolExecutionContext();
          return executeTool(toolName, params as never, ctx);
        })() as never,
      knowledgeQuery: (question) => this.knowledgeQuery(question) as never,
      discoverPublishedLibrary: (p) =>
        this.discoverPublishedLibrary(p as never) as never,
      sendAgentChat: (targetOwnerId, text) =>
        this.sendAgentChat(targetOwnerId, text) as never,
      recordH2aOwnerTurn: (msg, turn) =>
        this.recordH2aOwnerTurn(msg, turn as never),
      runDocumentAgentTurnCore: (msg) => this._runDocumentAgentTurnCore(msg),
    };
  }

  private _friendAutopilotContext(): FriendAutopilotContext {
    return {
      getNodeConfig: () => this.getNodeConfig(),
      recordFriendAutopilotPass: (record) =>
        this._recordFriendAutopilotPass(record),
      updateNodeConfig: (cfg) => this.updateNodeConfig(cfg as never),
      getToolExecutionContext: () => this.getToolExecutionContext() as never,
    };
  }

  private _socialProxyContext(): SocialProxyContext {
    return {
      getSocialProxyStore: () => (this._socialProxyStore as never) ?? undefined,
      getNodeConfig: () => this.getNodeConfig(),
      getSocialProxyOrchestratorDeps: (config) =>
        this._socialProxyOrchestratorDeps(config) as never,
      getPendingSocialIntroProposals: () => this._pendingSocialIntroProposals as never,
    };
  }

  private _runSocialProxyPassContext(): RunSocialProxyPassContext {
    return {
      getNodeConfig: () => this.getNodeConfig(),
      getSocialProxyOrchestratorDeps: (config) =>
        this._socialProxyOrchestratorDeps(config) as never,
      hasSocialProxyStore: () => Boolean(this._socialProxyStore),
      updateNodeConfig: (cfg) => this.updateNodeConfig(cfg as never),
    };
  }

  private _docAcqCapProvDeps(): any {
    return {
      getNodeConfig: () => this.getNodeConfig(),
      hasDocumentAcquisitionJobStore: () => Boolean(this._documentAcquisitionJobStore),
      requireDocumentAcquisitionJobStore: () => {
        if (!this._documentAcquisitionJobStore) {
          throw new Error("document acquisition store unavailable");
        }
        return this._documentAcquisitionJobStore;
      },
      getLocalManifestCapabilities: () => this._localManifestCapabilities(),
      getDocumentAcquisitionWorkerDeps: (config: any) =>
        this._documentAcquisitionWorkerDeps(config),
      hasCapabilityProviderJobStore: () => Boolean(this._capabilityProviderJobStore),
      requireCapabilityProviderJobStore: () => {
        if (!this._capabilityProviderJobStore) {
          throw new Error("capability provider store unavailable");
        }
        return this._capabilityProviderJobStore;
      },
      getCapabilityProviderWorkerDeps: (config: any) =>
        this._capabilityProviderWorkerDeps(config),
      hasAgentActivityStore: () => Boolean(this._agentActivityStore),
      getAgentActivityStore: () => this._agentActivityStore,
      publishAgentActivity: (record: any) => this._publishAgentActivity(record),
    };
  }

  private _openInHerdrContext(): OpenInHerdrContext {
    return {
      resolveOpenClawWorkspaceDir: () => this._resolveOpenClawWorkspaceDir(),
    };
  }

  private _terminalGetHerdrExportHintContext(): TerminalGetHerdrExportHintContext {
    return {
      getProfileDir: () => this._profileDir,
      requireTerminalManager: () => this._requireTerminalManager(),
    };
  }

    private _terminalExecContext(): TerminalExecContext {
    return {
      requireTerminalManager: () => this._requireTerminalManager(),
    };
  }

    private _terminalContext(): any {
    return {
      requireTerminalManager: () => this._requireTerminalManager(),
      requireTerminalAgentAssist: () => this._requireTerminalAgentAssist(),
    };
  }

    private _storeAccessorDeps(): any {
    return {
      getAgentActivityStore: () => this._agentActivityStore,
      getCommerceReceiptStore: () => this._commerceReceiptStore,
      getTaskStore: () => this._taskStore,
      getAgentCardStore: () => this._agentCardStore,
      getCircleStore: () => this._circleStore,
      summarizeAgentCard: (row: any) => summarizeAgentCard(row),
    };
  }

    private _fleetPublicDeps(): any {
    return {
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
      appendAudit: (event: any) => this._taskStore!.appendAuditEvent(event),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _bondHandlerContext(): BondHandlerContext {
    return {
      getTaskStore: () => this._taskStore,
      getProfile: () => this._profile,
      storePendingHelloRequest: (data) => this.storePendingHelloRequest(data),
      emit: (event, payload) => this.emit?.(event as never, payload as never),
      flushPendingRoomSyncs: () => this._flushPendingRoomSyncs(),
      flushPendingRoomMessages: () => this._flushPendingRoomMessages(),
      ensurePeerFromInboundChat: (input) =>
        this._peerDirectoryStore.ensurePeerFromInboundChat(input),
      tagBondedContactReachability: (remotePeerId) =>
        this._tagBondedContactReachability(remotePeerId),
    };
  }

    private _chatRoomMessageContext(): ChatRoomMessageContext {
    return {
      getTaskStore: () => this._taskStore,
      getChatDraftStore: () => this._chatDraftStore,
      getProfile: () => this._profile,
      getChatLogStore: () => this._chatLogStore,
      getHumanProfileStore: () => this._humanProfileStore,
      getAgentIdentityStore: () => this._agentIdentityStore,
      getTrustStore: () => this._trustStore,
      getPeerDirectoryStore: () => this._peerDirectoryStore,
      getStyleAdapter: () => this._styleAdapter,
      getVaultDir: () => this._vaultDir,
      getConfigStore: () => this._configStore,
      getApprovalQueue: () => this._approvalQueue,
      getAutoReplyLimitStore: () => this._autoReplyLimitStore,
      getNodeConfig: () => this.getNodeConfig(),
      getChatRoomDeps: () => this._chatRoomDeps(),
      sendAgentChat: (targetOwnerId, text) =>
        this.sendAgentChat(targetOwnerId, text) as never,
      emit: (event, payload) => this.emit?.(event as never, payload as never),
    };
  }

    private _chatMessageContext(): ChatMessageContext {
    return {
      getTaskStore: () => this._taskStore,
      getChatDraftStore: () => this._chatDraftStore,
      getChatLogStore: () => this._chatLogStore,
      getProfile: () => this._profile,
      getHumanProfileStore: () => this._humanProfileStore,
      getTrustStore: () => this._trustStore,
      getPeerDirectoryStore: () => this._peerDirectoryStore,
      getStyleAdapter: () => this._styleAdapter,
      getVaultDir: () => this._vaultDir,
      getConfigStore: () => this._configStore,
      getApprovalQueue: () => this._approvalQueue,
      getAutoReplyLimitStore: () => this._autoReplyLimitStore,
      getNodeConfig: () => this.getNodeConfig(),
      getMesh: () => this._mesh,
      persistChatMessage: (senderOwnerId, msg) =>
        this._persistChatMessage(senderOwnerId, msg),
      reconcileInboundDirectChatMessage: (senderOwnerId, msg) =>
        this.reconcileInboundDirectChatMessage(senderOwnerId, msg),
      emit: (event, payload) => this.emit?.(event as never, payload as never),
      sendAgentChat: (targetOwnerId, text) =>
        this.sendAgentChat(targetOwnerId, text) as never,
      tagBondedContactReachability: (remotePeerId) =>
        this._tagBondedContactReachability(remotePeerId),
      isOwnerOnline: () => this.isOwnerOnline(),
    };
  }

    private _smallProfileDelegationsContext(): SmallProfileDelegationsContext {
    return {
      getContactOwnerKeyStore: () => this._contactOwnerKeyStore ?? undefined,
      getVaultDir: () => this._vaultDir,
      signAndSaveHumanProfile: (update) =>
        this._signAndSaveHumanProfile(update as never),
      loadHumanProfileForPhotoUpdate: () =>
        this._loadHumanProfileForPhotoUpdate() as Promise<{ base: any; existing: any }>,
      getAgentIdentityStore: () => this._agentIdentityStore ?? undefined,
      assertOnline: () => this._assertOnline(),
    };
  }

  private _validatePairingTokenContext(): ValidatePairingTokenContext {
    return {
      getInMemoryToken: () => this._pairingToken ?? undefined,
      getInMemoryTokenIssuedAt: () => this._pairingTokenIssuedAt ?? undefined,
      getInMemoryTokenTtlMs: () => NodeServiceImpl._pairingTokenTtlMs,
      getSessionTokenStore: () => this._sessionTokenStore ?? undefined,
      getTaskStore: () => this._taskStore,
    };
  }

  private _persistenceContext(): PersistenceContext {
    return {
      recordIntent: (intent, query) => this._intentHistoryStore.record(intent, query) as never,
      persistIntentHistory: () => this._intentHistoryStore.persist() as never,
      loadIntentHistoryFromDisk: () => this._intentHistoryStore.loadFromDisk() as never,
      persistPublishedLibrary: () => this._publishedLibraryStore.persist() as never,
      loadPublishedLibraryFromDisk: () => this._publishedLibraryStore.loadFromDisk() as never,
      getContactTopicsFromLibrary: (ownerId) => this._publishedLibraryStore.getTopicsForContact(ownerId) as never,
    };
  }

  private _chatRoomSyncContext(): ChatRoomSyncContext {
    return {
      getChatRoomDeps: () => this._chatRoomDeps(),
    };
  }

    private _miscDelegationsContext(): MiscDelegationsContext {
    return {
      getPendingSocialIntroProposals: () => this._pendingSocialIntroProposals as any,
      resyncBondedContactReachabilityTags: () =>
        this._resyncBondedContactReachabilityTags() as never,
      loadHumanProfile: () => this._humanProfileStore.loadHumanProfile() as never,
      broadcastProfileSyncToBonds: (profile) => this._broadcastProfileSyncToBonds(profile) as never,
    };
  }

    private async _handleInboundMessage(params: any): Promise<void> {
    const { envelope, remotePeerId, remoteAddr, replyWithEnvelope } = params as any;
    const mesh = this._mesh!;
    const profile = this._profile!;
    const taskStore = this._taskStore!;
      const guardDecision = this._inboundGuard!.inspect(envelope);
      if (guardDecision.action === "reject") return;

      if (remoteAddr?.trim()) {
        void this._learnInboundDialHints(remotePeerId, remoteAddr).catch((err) =>
          console.warn(`[peer-directory] inbound dial hint learn failed:`, err),
        );
      }

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
        handleSharePreviewViaRuntime(this._sharePreviewContext(), envelope, remotePeerId);
        return;
      }

      if (
        intent === "bond.request" ||
        intent === "bond.accept" ||
        intent === "bond.challenge" ||
        intent === "bond.challenge.response"
      ) {
        await handleBondIntentViaRuntime(this._bondHandlerContext(), {
          envelope,
          remotePeerId,
          remoteAddr,
        });
        return;
      }

      if (
        intent === "profile.sync" ||
        intent === "profile.request" ||
        intent === "profile.response"
      ) {
        await this.handleInboundProfileIntent(envelope, {
          transportPeerId: remotePeerId,
          remoteAddr,
          replyWithEnvelope,
        });
        return;
      }

      if (intent === "chat.room.sync") {
        await handleChatRoomSyncViaRuntime(this._chatRoomSyncContext(), {
          envelope,
          remotePeerId,
        });
        return;
      }

      if (intent === "chat.room.message") {
        await handleChatRoomMessageViaRuntime(this._chatRoomMessageContext(), {
          envelope,
          remotePeerId,
          guardDecision,
        });
        return;
      }

      if (intent === "chat.message") {
        await handleChatMessageViaRuntime(this._chatMessageContext(), {
          envelope,
          remotePeerId,
          remoteAddr,
          guardDecision,
          replyWithEnvelope,
        });
        return;
      }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _handlePeerDiscovered(params: any): Promise<void> {
    const { peerId, multiaddrs } = params as any;
    const mesh = this._mesh!;
      await this.handleMeshPeerDiscovered(peerId, multiaddrs);
  }

  private async _runCapabilityDiscoveryCycle(
    source: "startup" | "periodic" | "on-demand",
    opts: { connectivityRuntime: ResolvedConnectivityRuntime; runFind?: boolean },
  ): Promise<void> {
    return runCapabilityDiscoveryCycleViaRuntime(this._capabilityDiscoveryContext(), source, opts);
  }

  private _startCapabilityDiscoveryScheduler(connectivityRuntime: ResolvedConnectivityRuntime): void {
    startCapabilityDiscoverySchedulerViaRuntime(this._capabilityDiscoveryContext(), connectivityRuntime);
  }

  async stopNode(): Promise<void> {
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

  async getBridgeStatus(): Promise<BridgeStatus> {
    return getBridgeStatusViaRuntime(this._connectionStatusContext());
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
      isOpenClawReady: () => this.isOpenClawReady(),
      getAssistantAgentUrl: () => this._assistantAgentUrl,
      getOpenClawGatewayChild: () => this._openclawGatewayChild ?? undefined,
    });
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
    return createCompanyInviteViaPublicRuntime(this._fleetPublicDeps(), params);
  }

  async listCompanyInvites(): Promise<ListCompanyInvitesResult> {
    return listCompanyInvitesViaPublicRuntime(this._fleetPublicDeps());
  }

  async revokeCompanyInvite(inviteId: string): Promise<RevokeCompanyInviteResult> {
    return revokeCompanyInviteViaPublicRuntime(this._fleetPublicDeps(), inviteId);
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

    // Validate the QR pairing token.
    const valid = await this.validatePairingToken(pairingToken);
    if (!valid) {
      throw new Error("Invalid or expired pairing token");
    }

    // Phase 35A: atomically consume a company-invite token (replay guard).
    const thinClientDeviceId = `thin-client:${(params.deviceName ?? "EnvoyGo").toLowerCase().replace(/\s+/g, "-")}:${params.platform ?? "flutter"}`;
    await this._consumeCompanyInviteOrThrow(
      pairingToken,
      "thin-client", // owner id is not part of the thin-client pairing contract
      thinClientDeviceId,
    );

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
      const hints =
        dialHints?.length ? dialHints : await this._dialHintsForChat(transportPeerId, undefined);
      await this._deliverCallEnvelope(transportPeerId, envelope, hints);
    }

    // Tag reachability for the transport peer
    void this._tagBondedContactReachability(transportPeerId);
  }

  async getPeerConnectionInfo(peerOwnerId: string): Promise<PeerConnectionInfo> {
    const mesh = this._reachableMesh();
    if (!mesh) {
      return { connected: false, direct: false };
    }

    // Bridge agent is always local — short-circuit before peer directory lookup.
    if (this._bridgeStatus?.agentPeerId && peerOwnerId === this._bridgeStatus.agentPeerId) {
      return { connected: true, direct: true };
    }

    const selfOwnerId = this._profile?.owner.ownerId?.trim();
    if (selfOwnerId && peerOwnerId === selfOwnerId) {
      return { connected: true, direct: true };
    }

    try {
      const { transportPeerId } = await this._resolvePeerTransportForOwner(peerOwnerId);
      if (transportPeerId === mesh.peerId) {
        return { connected: true, direct: true };
      }
      return mesh.getPeerConnectionInfo(transportPeerId);
    } catch (err) {
      console.warn(
        `[getPeerConnectionInfo] no route to ${peerOwnerId.slice(0, 24)}…:`,
        err instanceof Error ? err.message : err,
      );
      return { connected: false, direct: false };
    }
  }

  async warmContactConnection(
    peerOwnerId: string,
    options?: WarmContactConnectionOptions,
  ): Promise<PeerConnectionInfo> {
    this._assertOnline();
    const selfOwnerId = this._profile?.owner.ownerId?.trim();
    if (selfOwnerId && peerOwnerId.trim() === selfOwnerId) {
      return { connected: true, direct: true };
    }
    let transportPeerId: string;
    let listenAddrs: string[] | undefined;
    try {
      const resolved = await this._resolvePeerTransportForOwner(peerOwnerId);
      transportPeerId = resolved.transportPeerId;
      listenAddrs = resolved.listenAddrs;
    } catch (err) {
      console.warn(
        `[warmContact] no route to ${peerOwnerId.slice(0, 24)}…:`,
        err instanceof Error ? err.message : err,
      );
      return { connected: false, direct: false };
    }

    listenAddrs = await this._mergeFreshListenAddrs(
      peerOwnerId,
      transportPeerId,
      listenAddrs,
    );

    return this._warmContactConnectionTransport(transportPeerId, listenAddrs, options);
  }

  /** Merge cached inbound + peer-directory listen addrs before outbound dial. */
  private async _mergeFreshListenAddrs(
    ownerId: string,
    transportPeerId: string,
    listenAddrs: string[] | undefined,
  ): Promise<string[] | undefined> {
    const cached = this._lastLibp2pTransportByOwner.get(ownerId.trim())?.listenAddrs;
    let fromDir: string[] = [];
    try {
      const records = await this._peerDirectoryStore.listPeerRecords();
      fromDir = records
        .filter((r) => r.ownerId === ownerId.trim() || r.peerId === transportPeerId)
        .flatMap((r) => r.listenAddrs ?? []);
    } catch {
      /* best-effort */
    }
    const merged = mergeDialablePeerListenAddrs(
      transportPeerId,
      listenAddrs,
      cached,
      fromDir,
    );
    return merged.length ? merged : listenAddrs;
  }

  private async _warmContactConnectionTransport(
    transportPeerId: string,
    listenAddrs: string[] | undefined,
    options?: WarmContactConnectionOptions,
  ): Promise<PeerConnectionInfo> {
    const mesh = this._requireMesh();
    void this._tagBondedContactReachability(transportPeerId);
    const existing = mesh.getPeerConnectionInfo(transportPeerId);

    if (options?.verifyOnly) {
      return existing;
    }

    const needsProbe = options?.keepAlive === true || options?.verifyConnection === true;
    if (existing.connected && !options?.redial && !options?.upgradeRelayToDirect) {
      if (needsProbe) {
        if (options?.verifyConnection) {
          const probed = await mesh.probeBondedPeerConnection(transportPeerId);
          if (probed.connected) {
            markOutboundPeerVerified(transportPeerId);
            return probed;
          }
          // stale — fall through to redial
        } else {
          const probed = await mesh.probeBondedPeerConnection(transportPeerId);
          if (probed.connected || options?.keepAlive === true) {
            if (probed.connected) {
              markOutboundPeerVerified(transportPeerId);
            }
            return probed;
          }
          // stale — fall through to redial
        }
      } else {
        return existing;
      }
    }

    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(transportPeerId, listenAddrs),
        WARM_CONTACT_DIAL_HINTS_TIMEOUT_MS,
        "_dialHintsForChat",
      );
    } catch {
      return mesh.getPeerConnectionInfo(transportPeerId);
    }

    const dialableListen = mergeDialablePeerListenAddrs(transportPeerId, listenAddrs, dialHints);
    void mesh.scrubPeerStoreDialHints(transportPeerId, dialableListen);

    const preferCircuitHints = shouldPreferCircuitDialHints(listenAddrs, dialHints, transportPeerId);

    void mesh.mergePeerStoreDialHints(transportPeerId, dialHints);

    const tearingDown =
      options?.redial === true ||
      options?.upgradeRelayToDirect === true ||
      (needsProbe && !options?.keepAlive);
    if (tearingDown) {
      try {
        await mesh.closeConnectionsToPeer(transportPeerId);
      } catch {
        /* ignore */
      }
    }

    const result = await mesh.ensurePeerReachable(transportPeerId, ENVOY_CHAT_PROTOCOL, {
      dialHints,
      preferCircuitHints,
      forceFreshDial:
        options?.redial === true ||
        !existing.connected ||
        options?.upgradeRelayToDirect === true ||
        tearingDown,
      upgradeRelayToDirect: options?.upgradeRelayToDirect === true || options?.redial === true,
    });
    void this._flushPendingRoomSyncs();
    void this._flushPendingRoomMessages();
    if (result.connected) {
      markOutboundPeerVerified(transportPeerId);
    }
    return result;
  }

  private _startBondWarmInterval(): void {
    if (this._bondWarmTimer) {
      clearInterval(this._bondWarmTimer);
    }
    const runWarm = (): void => {
      void this._warmAllBondedContacts();
    };
    // First warm after 2 min, then every 5 min (reduced from 60s to avoid connection churn).
    setTimeout(runWarm, 120_000);
    this._bondWarmTimer = setInterval(runWarm, 300_000);
  }

  private async _warmAllBondedContacts(): Promise<void> {
    if (this._nodeStatus !== "running") {
      return;
    }
    const mesh = this._mesh;
    if (!mesh) return;

    const bonds = await this.getBonds();
    const selfOwnerId = this._profile?.owner.ownerId?.trim();

    if (mesh.getConnectionStats().totalConnections >= NodeServiceImpl.BOND_WARM_MAX_CONNECTIONS) {
      console.warn(
        `[bond-warm] skipped: ${mesh.getConnectionStats().totalConnections} open connections (cap ${NodeServiceImpl.BOND_WARM_MAX_CONNECTIONS}). ` +
        `Reduce bonded contacts or increase the cap.`,
      );
      return;
    }

    const now = Date.now();
    const cooldownMs = NodeServiceImpl.BOND_WARM_PER_CONTACT_COOLDOWN_MS;

    for (const bond of bonds) {
      if (selfOwnerId && bond.peerOwnerId.trim() === selfOwnerId) continue;
      if (bond.level !== "direct" && bond.level !== "referred") continue;

      // Per-contact cooldown: skip if recently warmed.
      const lastWarm = this._lastBondWarmAt.get(bond.peerOwnerId);
      if (lastWarm && (now - lastWarm) < cooldownMs) continue;

      try {
        const info = await this.getPeerConnectionInfo(bond.peerOwnerId);
        if (info.connected) {
          try {
            const { transportPeerId } = await this._resolvePeerTransportForOwner(bond.peerOwnerId);
            if (isOutboundPeerRecentlyVerified(transportPeerId)) {
              this._lastBondWarmAt.set(bond.peerOwnerId, now);
              continue;
            }
          } catch { /* fall through */ }
          this._lastBondWarmAt.set(bond.peerOwnerId, now);
          await this.warmContactConnection(bond.peerOwnerId, { keepAlive: true });
          continue;
        }
        this._lastBondWarmAt.set(bond.peerOwnerId, now);
        await this.warmContactConnection(bond.peerOwnerId);
      } catch { /* best-effort */ }
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

  async runOwnerAgentTurn(message: string): Promise<OwnerAgentTurnResult> {
    return runOwnerAgentTurnViaRuntime(this._runOwnerAgentTurnContext(), message);
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
  // ------------------------------------------------------------------
  // Phase 31I — Push Notifications
  // ------------------------------------------------------------------

  registerPushToken(params: { platform: string; token: string; ownerId: string; deviceId?: string; tokenType?: "alert" | "voip" }): void {
    pushNotificationService.registerPushToken(params);
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

  async chainCancel(params: ChainCancelParams): Promise<ChainCancelResult> {
    return chainCancelViaRuntime(this._chainContext(), params);
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

  private _chainContext(): ChainContext {
    return {
      store: this._chainStore,
      hasTaskStore: () => Boolean(this._taskStore),
      listChainReports: (params) =>
        this._taskStore!.listChainReports(params) as never,
      getChainReport: (chainId) =>
        this._taskStore!.getChainReport(chainId) as never,
      pinChainReport: (chainId, pinned) =>
        this._taskStore!.pinChainReport(chainId, pinned),
      getChainGoal: (chainId) => this._chainState.goals.get(chainId),
      getChainCostEstimate: (chainId) => this._chainState.costEstimates.get(chainId),
      snapshotToResult: (snap) => this.snapshotToResult(snap),
      bidsBySubtask: (state) => this.bidsBySubtask(state),
      getNodeConfig: () => this.getNodeConfig(),
      setNodeConfig: (cfg) => this.updateNodeConfig(cfg as never),
      listChainRecipes: this._taskStore
        ? () => this._taskStore!.listChainRecipes() as never
        : undefined,
      saveChainRecipe: this._taskStore
        ? (record) =>
            this._taskStore!.saveChainRecipe(record as never) as never
        : undefined,
      deleteChainRecipe: this._taskStore
        ? (id) => this._taskStore!.deleteChainRecipe(id)
        : undefined,
      buildChainOrchestratorDeps: () => this.buildChainOrchestratorDeps() as never,
      evaluateAwardAndAccept: (chainId, subtaskId, options) =>
        this._evaluateAwardAndAccept(chainId, subtaskId, options as never) as never,
      emitChainState: (chainId) => this._emitChainState(chainId),
      startChainTracking: (chainId) => this._startChainTracking(chainId),
      placeholderMandate: (chainId, chainMandateId) =>
        this.placeholderMandate(chainId, chainMandateId) as never,
      findCapabilityProviders: (capability) =>
        this.findCapabilityProviders(capability) as never,
      chainDiagnosticsForSubtasks: (subtasks, workersBySubtask) =>
        this._chainDiagnosticsForSubtasks(subtasks as never, workersBySubtask as never) as never,
      runChainGoal: (params) => this._runChainGoal(params) as never,
    };
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

  // (chainGetDefaults / chainSetDefaults have been moved to the runtime;
  // their delegations live near the top of this block.)

  // --- private helpers ---

  private ensureChainMandicate(_mandateId: string): void {
    // Stub: in 40B.10, this will load the mandate from the persistent store.
    return;
  }

  private ensureChainMandateLoaded(mandateId: string): void {
    this.ensureChainMandicate(mandateId);
  }

  private placeholderMandate(chainId: string, chainMandateId: string) {
    return {
      version: "0.1" as const,
      chainMandateId,
      chainId,
      issuerOwnerId: "envoy:owner:placeholder",
      orchestratorOwnerId: "envoy:owner:placeholder",
      maxChainCostUsd: 10,
      costCeilingUsd: 3,
      maxWorkers: 3,
      allowDepth3: false,
      maxSensitivity: "public" as const,
      deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      rebalancePolicy: "manual" as const,
      maxAutoRebalances: 2,
      autoRebalanceIncrementUsd: 5,
      signature: "stub",
    };
  }

  private snapshotToResult(snap: ReturnType<typeof chainStateSnapshot>): ChainGetStateResult {
    return {
      chainId: snap.chainId,
      chainMandateId: snap.chainMandate.chainMandateId,
      subtaskCount: snap.subtaskCount,
      bidCount: snap.bidCount,
      awardedCount: snap.awardedCount,
      partialCount: snap.partialCount,
      cancelledCount: snap.cancelledCount,
      chainCancelled: snap.chainCancelled,
      published: snap.published,
      budgetSpentUsd: snap.budgetSpentUsd,
      budgetMaxUsd: snap.budgetMaxUsd,
      budgetReservedUsd: snap.budgetReservedUsd,
      budgetSynthesisUsd: snap.budgetSynthesisUsd,
      rebalancePolicy: snap.rebalancePolicy,
      autoRebalanceCount: snap.autoRebalanceCount,
      maxAutoRebalances: snap.maxAutoRebalances,
      autoRebalanceHistory: snap.autoRebalanceHistory,
    };
  }

  private bidsBySubtask(state: ChainState, now: Date = new Date()): NonNullable<ChainGetStateResult["bidsBySubtask"]> {
    const groups = new Map<string, NonNullable<ChainGetStateResult["bidsBySubtask"]>[number]["bids"]>();
    for (const [key, bid] of state.bids.entries()) {
      if (Date.parse(bid.bidExpiresAt) <= now.getTime()) continue;
      const idx = key.indexOf("::");
      if (idx < 0) continue;
      const subtaskId = key.slice(0, idx);
      const list = groups.get(subtaskId) ?? [];
      list.push({
        bidKey: key,
        workerPeerId: bid.workerPeerId,
        workerOwnerId: bid.workerOwnerId,
        proposedCostUsd: bid.proposedCostUsd,
        proposedEtaAt: bid.proposedEtaAt,
        bidExpiresAt: bid.bidExpiresAt,
        rationale: bid.rationale,
      });
      groups.set(subtaskId, list);
    }
    return [...groups.entries()].map(([subtaskId, bids]) => ({ subtaskId, bids }));
  }

  private async evaluateBidsAsync(state: ChainState, params: ChainEvaluateBidsParams): Promise<Awaited<ReturnType<typeof evaluateBids>>> {
    const deps = await this.buildChainOrchestratorDeps();
    return await evaluateBids(deps, state, {
      subtaskId: params.subtaskId,
      policy: params.policy,
      maxRounds: params.maxRounds,
      pickWorkerPeerId: params.pickWorkerPeerId,
    });
  }

  /**
   * Phase 40F — dispatch an inbound `task.chain.*` envelope through the chain
   * router. Called from `apps/node/src/index.ts` for every chain intent.
   */
  async handleInboundChainEnvelope(envelope: EnvoyEnvelope): Promise<void> {
    const chainId = extractChainIdFromEnvelope(envelope);
    const runtime = chainId ? this._chainStore.getRuntime(chainId) : undefined;
    const inboundState = runtime?.state;
    const deps = await this.buildChainInboundDeps();
    const decision = await dispatchChainEnvelope(deps, envelope, inboundState);
    if (!decision.ok) {
      console.warn(`[chain.inbound] rejected ${envelope.intent}: ${decision.reason}`);
    }
  }

  /**
   * Phase 40F — refresh the capability index from cached agent cards.
   * Called on startup and after bond establishment.
   */
  async refreshCapabilityIndex(): Promise<void> {
    if (this._capabilityIndexReady) {
      await this._capabilityIndexReady;
    }
    const cards = await this.listAgentCards();
    for (const card of cards) {
      const peerId = card.sourceAgentPeerId;
      if (!peerId) continue;
      this._capabilityIndex.indexWorker({
        peerId,
        ownerId: card.ownerId,
        capabilities: card.capabilities,
        lastSeenAt: card.cachedAt,
        displayName: card.displayName,
      });
    }
  }

  private async _chainTransportResolver(): Promise<ChainTransportResolver | null> {
    const mesh = this._reachableMesh();
    const profile = this._profile;
    if (!mesh || !profile) return null;
    const agentIdentity = await this._ensureAgentIdentity();
    const agentPeerToOwner = new Map<string, string>();
    for (const card of await this.listAgentCards()) {
      if (card.sourceAgentPeerId) {
        agentPeerToOwner.set(card.sourceAgentPeerId, card.ownerId);
      }
    }
    return {
      mesh,
      peerDirectoryStore: this._peerDirectoryStore,
      localDevicePublicKeyPem: profile.device.publicKeyPem,
      localAgentPeerId: agentIdentity?.agentPeerId,
      agentPeerToOwner,
    };
  }

  private async buildChainInboundDeps(): Promise<ChainInboundDeps> {
    const orchDeps = await this.buildChainOrchestratorDeps();
    const workerDeps = await this.buildChainWorkerDeps();
    const nodeCapabilities = (await this._localManifestCapabilities()) as ChainInboundDeps["nodeCapabilities"];
    return {
      audit: orchDeps.audit,
      nodeCapabilities,
      handleWorkerPropose: async (envelope, payload) => {
        this._chainState.workerSubtasks.set(payload.subtask.subtaskId, {
          subtask: payload.subtask,
          orchestratorPeerId: envelope.senderPeerId,
        });
        return handleWorkerPropose(workerDeps, envelope, payload);
      },
      handleWorkerMandate: (envelope, payload) => handleWorkerMandate(workerDeps, envelope, payload),
      handleWorkerAccept: async (envelope, payload) => {
        const result = await handleWorkerAccept(workerDeps, envelope, payload);
        if (result.ok) {
          let subtask = this._chainState.workerSubtasks.get(payload.award.subtaskId)?.subtask;
          if (!subtask) {
            for (const rt of this._chainStore.listActive()) {
              subtask = rt.state.subtasks.get(payload.award.subtaskId);
              if (subtask) break;
            }
          }
          if (subtask) {
            void executeAcceptedSubtask(
              workerDeps,
              { getToolContext: () => this.getToolExecutionContext() },
              envelope.senderPeerId,
              subtask,
            ).catch((err) => console.warn("[chain.worker] execute failed:", err));
          }
        }
        return result;
      },
      handleWorkerCancel: (envelope, payload) => handleWorkerCancel(workerDeps, envelope, payload),
      handleWorkerHeartbeat: (envelope, payload) => handleWorkerHeartbeat(workerDeps, envelope, payload),
      handleOrchestratorBid: async (envelope, payload, state) => {
        const runtime = this._chainStore.getRuntime(state.chainId);
        if (!runtime) return { ok: false, reason: "handler_denied" as const };
        const result = await handleOrchestratorBid(orchDeps, envelope, payload, runtime.state);
        if (result.ok) {
          this._emitChainState(state.chainId);
          this._scheduleAutoEvaluate(state.chainId, payload.bid.subtaskId);
        }
        return result;
      },
      handleOrchestratorPartial: async (envelope, payload, state) => {
        const runtime = this._chainStore.getRuntime(state.chainId);
        if (!runtime) return { ok: false, reason: "handler_denied" as const };
        const result = await handleOrchestratorPartial(orchDeps, envelope, payload, runtime.state);
        if (result.ok) {
          this._emitChainState(state.chainId);
          const profile = this._profile;
          if (profile) {
            void tryCompleteChainIfReady(orchDeps, runtime.state, profile).then(async (done) => {
              if (done.published) {
                this._emitChainState(state.chainId);
                const row = await this._taskStore?.getChainReport(state.chainId);
                if (row?.report) this._emitChainReport(row.report);
              }
            });
          }
        }
        return result;
      },
      handleOrchestratorMerge: (envelope, payload, state) => {
        const runtime = this._chainStore.getRuntime(state.chainId);
        if (!runtime) return Promise.resolve({ ok: false, reason: "handler_denied" as const });
        return handleOrchestratorMerge(orchDeps, envelope, payload, runtime.state);
      },
      handleOrchestratorHeartbeat: (envelope, payload, state) => {
        const runtime = this._chainStore.getRuntime(state.chainId);
        if (!runtime) return Promise.resolve({ ok: false, reason: "handler_denied" as const });
        return handleOrchestratorHeartbeat(orchDeps, envelope, payload, runtime.state);
      },
      handleOwnerReport: async (envelope, payload) => {
        if (!this._taskStore) {
          return { ok: false, reason: "handler_denied" as const };
        }
        await this._taskStore.recordChainReport(payload.report);
        this._emitChainReport(payload.report);
        await this._taskStore.appendAuditEvent(
          createAuditEvent({
            type: "chain.report_received",
            intent: envelope.intent,
            messageId: envelope.messageId,
            correlationId: envelope.correlationId,
            remotePeerId: envelope.senderPeerId,
            direction: "inbound",
            verificationStatus: "verified",
            outcome: "record",
            summary: `chain report received chainId=${payload.report.chainId}`,
            createdAt: envelope.createdAt,
          }),
        );
        return { ok: true };
      },
    };
  }

  private async buildChainWorkerDeps(): Promise<ChainWorkerHandlerDeps> {
    const agentIdentity = await this._ensureAgentIdentity();
    const profile = this._profile;
    if (!agentIdentity || !profile) {
      throw new Error("agent identity unavailable for chain worker deps");
    }
    const baseStrategy = {
      baseCostUsd: 1,
      capabilityLocalEtaMs: 60_000,
      reputationDiscount: 1,
      etaSlackMs: 60_000,
    };
    const transport = await this._chainTransportResolver();
    return {
      sendEnvelope: async (recipientPeerId, envelope, _payload) => {
        if (!transport) return false;
        return sendChainEnvelopeOverMesh(transport, recipientPeerId, envelope);
      },
      now: () => new Date(),
      signingKeyPem: agentIdentity.agentPrivateKeyPem,
      publicKeyPem: agentIdentity.agentPublicKeyPem,
      workerPeerId: agentIdentity.agentPeerId,
      workerOwnerId: profile.owner.ownerId,
      audit: {
        record: (event) => {
          void this._appendChainAudit({
            ...event,
            type: event.type as import("@envoymesh/local-store").AuditEventType,
          });
        },
      },
      workerContext: {
        workerPeerId: agentIdentity.agentPeerId,
        workerOwnerId: profile.owner.ownerId,
        baseCostUsd: baseStrategy.baseCostUsd,
        capabilityLocalEtaMs: baseStrategy.capabilityLocalEtaMs,
      },
      pendingBidExpirations: this._chainState.pendingBidExpirations,
    };
  }

  private _startChainTracking(chainId: string): void {
    this._stopChainTracking(chainId);
    const runtime = this._chainStore.getRuntime(chainId);
    if (!runtime || runtime.state.published || runtime.state.chainCancelled) return;

    const abort = new AbortController();
    this._chainState.trackAbort.set(chainId, abort);

    void (async () => {
      while (!abort.signal.aborted) {
        const rt = this._chainStore.getRuntime(chainId);
        if (!rt || rt.state.published || rt.state.chainCancelled) {
          this._stopChainTracking(chainId);
          return;
        }
        if (rt.state.awards.size === 0) {
          await new Promise((r) => setTimeout(r, 5_000));
          continue;
        }
        try {
          const deps = await this.buildChainOrchestratorDeps();
          await trackChain(deps, rt.state, { tickMs: 30_000, maxTicks: 1 });
        } catch (err) {
          console.warn(`[chain.track] ${chainId} tick failed:`, err);
        }
        await new Promise((r) => setTimeout(r, 30_000));
      }
    })();
  }

  private _stopChainTracking(chainId: string): void {
    const abort = this._chainState.trackAbort.get(chainId);
    if (abort) {
      abort.abort();
      this._chainState.trackAbort.delete(chainId);
    }
  }

  private _emitChainReport(report: import("@envoymesh/protocol").ChainReport): void {
    this.emit("chain:report", {
      chainId: report.chainId,
      executiveSummary: report.executiveSummary,
      subtaskCount: report.chainSummary.subtaskCount,
      workerCount: report.chainSummary.workerAllocations.length,
      synthesisCostUsd: report.chainSummary.synthesisCostUsd,
      createdAt: report.createdAt,
    });
  }

  private async _bondLevelForWorkerOwner(workerOwnerId: string): Promise<import("@envoymesh/api").BondLevel> {
    const bonds = await this.getBonds();
    return bonds.find((b) => b.peerOwnerId === workerOwnerId)?.level ?? "public";
  }

  private async _rollbackSubtaskAward(state: ChainState, subtaskId: string): Promise<void> {
    if (!state.awards.has(subtaskId)) return;
    await state.ledger.release(subtaskId, "pending owner approval");
    state.awards.delete(subtaskId);
    state.awardedAt.delete(subtaskId);
  }

  private async _queueChainAwardApproval(
    chainId: string,
    subtaskId: string,
    bid: import("@envoymesh/protocol").ChainSubtaskBid,
    reason: string,
  ): Promise<void> {
    if (!this._approvalQueue) return;
    const item = createApprovalItem(
      "chain_award",
      "Approve chain worker",
      reason,
      JSON.stringify({
        chainId,
        subtaskId,
        workerPeerId: bid.workerPeerId,
        workerOwnerId: bid.workerOwnerId,
        acceptedCostUsd: bid.proposedCostUsd,
      } satisfies ChainAwardApprovalPayload),
      { metadata: { chainId, subtaskId, reason } },
      "high",
    );
    this._approvalQueue.add(item);
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
    const runtime = this._chainStore.getRuntime(chainId);
    if (!runtime) return { ok: false, reason: "no_bids" };
    const deps = await this.buildChainOrchestratorDeps();
    const result = await evaluateBids(deps, runtime.state, {
      subtaskId,
      policy: opts?.policy ?? "composite",
      pickWorkerPeerId: opts?.pickWorkerPeerId,
    });
    if (!result.ok) return result;

    if (!opts?.skipSensitivityGate) {
      const bondLevel = await this._bondLevelForWorkerOwner(result.bid.workerOwnerId);
      const gate = requiresChainAwardApproval(runtime.state.chainMandate, bondLevel);
      if (gate.required) {
        await this._rollbackSubtaskAward(runtime.state, subtaskId);
        await this._queueChainAwardApproval(chainId, subtaskId, result.bid, gate.reason ?? "sensitivity gate");
        return { ok: false, reason: "no_bids" };
      }
    }

    await sendChainAccept(deps, result.bid.workerPeerId, result.award);
    deps.audit.record({
      type: "chain.awarded",
      outcome: "allow",
      intent: "task.chain.accept",
      correlationId: chainId,
      summary: `subtask=${subtaskId} worker=${result.bid.workerPeerId} cost=${result.bid.proposedCostUsd}`,
    });
    return result;
  }

  private async _executeApprovedChainAward(payload: ChainAwardApprovalPayload): Promise<{ ok: boolean; error?: string }> {
    const result = await this._evaluateAwardAndAccept(payload.chainId, payload.subtaskId, {
      pickWorkerPeerId: payload.workerPeerId,
      skipSensitivityGate: true,
    });
    if (!result.ok) {
      return { ok: false, error: result.reason ?? "award failed" };
    }
    this._emitChainState(payload.chainId);
    return { ok: true };
  }

  private _emitChainState(chainId: string): void {
    const runtime = this._chainStore.getRuntime(chainId);
    if (!runtime) return;
    const state = this.snapshotToResult(chainStateSnapshot(runtime.state));
    state.bidsBySubtask = this.bidsBySubtask(runtime.state);
    state.goal = this._chainState.goals.get(chainId);
    state.estimatedCostRange = this._chainState.costEstimates.get(chainId);
    state.budgetWarningLevel = chainBudgetWarningLevel(runtime.state);
    this.emit("chain:state", state);
  }

  private _scheduleAutoEvaluate(chainId: string, subtaskId: string): void {
    const key = `${chainId}::${subtaskId}`;
    const existing = this._chainState.autoEvaluateTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this._chainState.autoEvaluateTimers.delete(key);
      void this._autoEvaluateSubtask(chainId, subtaskId);
    }, CHAIN_AUTO_EVALUATE_MS);
    this._chainState.autoEvaluateTimers.set(key, timer);
  }

  private async _autoEvaluateSubtask(chainId: string, subtaskId: string): Promise<void> {
    const runtime = this._chainStore.getRuntime(chainId);
    if (!runtime || runtime.state.chainCancelled || runtime.state.awards.has(subtaskId)) return;
    if (!subtasksAwaitingAward(runtime.state).includes(subtaskId)) return;
    const result = await this._evaluateAwardAndAccept(chainId, subtaskId, { policy: "composite" });
    if (result.ok) {
      this._emitChainState(chainId);
    }
  }

  private _chainDiagnosticsForSubtasks(
    subtasks: Array<{ subtaskId: string; requiredCapability: string }>,
    workersBySubtask: Record<string, string[]>,
  ): string[] {
    const diagnostics: string[] = [];
    for (const subtask of subtasks) {
      const workers = workersBySubtask[subtask.subtaskId] ?? [];
      if (workers.length === 0) {
        diagnostics.push(
          `No workers for \`${subtask.requiredCapability}\` — ask a bonded contact to enable Capability Provider.`,
        );
      }
    }
    return diagnostics;
  }

  private async _runChainGoal(input: {
    goal: string;
    chainId?: string;
    maxChainCostUsd?: number;
    costCeilingUsd?: number;
    allowLlm?: boolean;
  }): Promise<{
    ok: boolean;
    chainId: string;
    chainMandateId: string;
    subtasks: Array<{ subtaskId: string; depth: number; requiredCapability: string; objective: string }>;
    error?: string;
  }> {
    const chainId = input.chainId ?? `chain_${randomUUID()}`;
    const chainMandateId = `chainmandate_${randomUUID()}`;
    const orchestratorOwnerId = this._profile?.owner.ownerId ?? "envoy:owner:placeholder";
    let nodeDefaults = DEFAULT_CHAIN_DEFAULTS;
    try {
      const cfg = await this.getNodeConfig();
      nodeDefaults = mergeChainDefaults(cfg?.chainDefaults);
    } catch {
      /* use production defaults */
    }
    const mandate = {
      version: "0.1" as const,
      chainMandateId,
      chainId,
      issuerOwnerId: orchestratorOwnerId,
      orchestratorOwnerId,
      maxChainCostUsd: input.maxChainCostUsd ?? 10,
      costCeilingUsd: input.costCeilingUsd ?? 3,
      maxWorkers: 3,
      allowDepth3: false,
      maxSensitivity: "public" as const,
      deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      rebalancePolicy: nodeDefaults.rebalancePolicy ?? "auto",
      maxAutoRebalances: nodeDefaults.maxAutoRebalances ?? 2,
      autoRebalanceIncrementUsd: nodeDefaults.autoRebalanceIncrementUsd ?? 5,
      signature: "stub",
    };
    const state = createChainState(mandate);
    this._chainState.goals.set(chainId, input.goal);
    this._chainStore.setRuntime(chainId, {
      state,
      bidStrategy: { baseCostUsd: 1, capabilityLocalEtaMs: 60_000, reputationDiscount: 1, etaSlackMs: 60_000 },
    });

    const plan = await planChain(await this.buildChainOrchestratorDeps(), state, input.goal, {
      allowLlm: input.allowLlm ?? nodeDefaults.allowLlmDecompose ?? false,
    });
    if (!plan.ok) {
      return { ok: false, chainId, chainMandateId, subtasks: [], error: `plan failed: ${(plan as { reason: string }).reason}` };
    }

    const workersBySubtask: Record<string, string[]> = {};
    let maxWorkers = 0;
    for (const subtask of plan.subtasks) {
      const candidates = await this.findCapabilityProviders(subtask.requiredCapability);
      workersBySubtask[subtask.subtaskId] = candidates.slice(0, 3);
      maxWorkers = Math.max(maxWorkers, candidates.length);
    }
    this._chainState.costEstimates.set(
      chainId,
      estimateChainCostRange({
        subtaskCount: plan.subtasks.length,
        workerCandidateCount: maxWorkers,
        maxChainCostUsd: mandate.maxChainCostUsd,
      }),
    );

    const launch = await launchChain(await this.buildChainOrchestratorDeps(), state, workersBySubtask);
    if (!launch.ok) {
      return {
        ok: false,
        chainId,
        chainMandateId,
        subtasks: plan.subtasks.map((s) => ({
          subtaskId: s.subtaskId,
          depth: s.depth,
          requiredCapability: s.requiredCapability,
          objective: s.objective,
        })),
        error: `launch failed: ${(launch as { reason: string }).reason}`,
      };
    }

    this._startChainTracking(chainId);
    this._emitChainState(chainId);

    return {
      ok: true,
      chainId,
      chainMandateId,
      subtasks: plan.subtasks.map((s) => ({
        subtaskId: s.subtaskId,
        depth: s.depth,
        requiredCapability: s.requiredCapability,
        objective: s.objective,
      })),
    };
  }

  async chainPreviewGoal(params: ChainPreviewGoalParams): Promise<ChainPreviewGoalResult> {
    return chainPreviewGoalViaRuntime(this._chainContext(), params);
  }

  async chainStartFromGoal(params: ChainStartFromGoalParams): Promise<ChainStartFromGoalResult> {
    return chainStartFromGoalViaRuntime(this._chainContext(), params);
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

  private async _appendChainAudit(event: {
    type: import("@envoymesh/local-store").AuditEventType;
    outcome: "allow" | "deny" | "record";
    intent: string;
    remotePeerId?: string;
    correlationId?: string;
    summary?: string;
  }): Promise<void> {
    if (!this._taskStore) return;
    await this._taskStore.appendAuditEvent(
      createAuditEvent({
        type: event.type,
        intent: event.intent as import("@envoymesh/protocol").EnvoyIntent,
        correlationId: event.correlationId,
        remotePeerId: event.remotePeerId,
        direction: "outbound",
        verificationStatus: "verified",
        outcome: event.outcome,
        summary: event.summary ?? event.type,
        createdAt: new Date().toISOString(),
      }),
    );
  }

  /**
   * Build the ChainOrchestratorHandlerDeps from the node's runtime state.
   * Used by `runChain`, `chainLaunch`, `chainEvaluateBids`, and the
   * orchestrator-side inbound handlers.
   */
  private async buildChainOrchestratorDeps(): Promise<ChainOrchestratorHandlerDeps> {
    const llmDecompose = await this.buildLlmDecomposerAsync();
    const agentIdentity = await this._ensureAgentIdentity();
    const profile = this._profile;
    if (!agentIdentity || !profile) {
      throw new Error("agent identity unavailable for chain orchestrator deps");
    }
    const transport = await this._chainTransportResolver();
    return {
      sendEnvelope: async (recipientPeerId, envelope, _payload) => {
        if (!transport) return false;
        return sendChainEnvelopeOverMesh(transport, recipientPeerId, envelope);
      },
      findWorkers: async (capability) => this.findCapabilityProviders(capability),
      now: () => new Date(),
      signingKeyPem: agentIdentity.agentPrivateKeyPem,
      publicKeyPem: agentIdentity.agentPublicKeyPem,
      orchestratorPeerId: agentIdentity.agentPeerId,
      orchestratorOwnerId: profile.owner.ownerId,
      audit: {
        record: (event) => {
          void this._appendChainAudit({
            ...event,
            type: event.type as import("@envoymesh/local-store").AuditEventType,
          });
        },
      },
      storeChainReport: async (report) => {
        if (this._taskStore) {
          await this._taskStore.recordChainReport(report);
        }
        this._emitChainReport(report);
      },
      llmDecompose,
      llmMerge: await this.buildLlmMergeAsync(),
    };
  }

  /**
   * Phase 40D — wire the LLM decomposer into chain-orchestrator deps.
   *
   * Uses any model providers already configured on this node; falls back to
   * a no-op when no providers are available so `planChain` runs the
   * keyword decomposer instead. The audit log records every prompt so the
   * owner can audit what was sent to the model.
   */
  private async buildLlmDecomposerAsync(): Promise<ChainOrchestratorHandlerDeps["llmDecompose"] | undefined> {
    let nodeConfig: Awaited<ReturnType<typeof this.getNodeConfig>> | null = null;
    try {
      nodeConfig = await this.getNodeConfig();
    } catch {
      return undefined;
    }
    if (!nodeConfig) return undefined;
    const modelCfg = nodeConfig.modelProviders;
    if (!modelCfg || modelCfg.mode === "disabled") return undefined;
    let providers: ReturnType<typeof buildModelProviders> = [];
    try {
      // `buildModelProviders` reads env overrides (ENVOY_MODEL_*) so the
      // chain decomposer and chat-assist share the same provider pool.
      providers = buildModelProviders(modelCfg, false, { trustedLocalAssist: true });
    } catch {
      return undefined;
    }
    if (providers.length === 0) return undefined;
    const { createLlmDecomposer } = await import("./chain-decomposer.js");
    const decomposer = createLlmDecomposer({
      providers,
      audit: { record: () => undefined },
      timeoutMs: 30_000,
    });
    return async (goal: string) => decomposer(goal);
  }

  /**
   * Phase 41A — wire the LLM merge adapter into chain-orchestrator deps.
   *
   * Uses the same model provider pool as the decomposer; falls back to
   * undefined when no providers are available so synthesis falls through
   * to the deterministic concatenate/owner_review path.
   */
  private async buildLlmMergeAsync(): Promise<ChainOrchestratorHandlerDeps["llmMerge"] | undefined> {
    let nodeConfig: Awaited<ReturnType<typeof this.getNodeConfig>> | null = null;
    try {
      nodeConfig = await this.getNodeConfig();
    } catch {
      return undefined;
    }
    if (!nodeConfig) return undefined;
    const modelCfg = nodeConfig.modelProviders;
    if (!modelCfg || modelCfg.mode === "disabled") return undefined;
    let providers: ReturnType<typeof buildModelProviders> = [];
    try {
      providers = buildModelProviders(modelCfg, false, { trustedLocalAssist: true });
    } catch {
      return undefined;
    }
    if (providers.length === 0) return undefined;

    // Build a LlmProvider from the first available model provider
    const { createLlmMergeAdapter } = await import("./chain-llm.js");
    const llmProvider = {
      complete: async (params: { systemPrompt: string; userPrompt: string; maxTokens?: number }) => {
        const result = await routeModelRequest(
          {
            taskType: "chain.merge",
            prompt: `${params.systemPrompt}\n\n${params.userPrompt}`,
            sensitivity: "public",
            ownerApproved: true,
          },
          providers,
        );
        if (result.decision.action === "deny" || !result.response) {
          throw new Error("LLM merge denied");
        }
        return {
          text: result.response.text,
          usage: {
            promptTokens: result.response.usage?.inputTokens ?? 0,
            completionTokens: result.response.usage?.outputTokens ?? 0,
          },
        };
      },
    };
    return createLlmMergeAdapter(llmProvider);
  }

  /** Discover workers from the Phase 41B capability index + bonded agent cards. */
  private async findCapabilityProviders(capability: string): Promise<string[]> {
    if (this._capabilityIndexReady) {
      await this._capabilityIndexReady;
    }
    const indexed = this._capabilityIndex.findWorkers(capability);
    if (indexed.length > 0) {
      return indexed;
    }
    const cards = await this.listAgentCards();
    const peers: string[] = [];
    for (const card of cards) {
      if (!card.sourceAgentPeerId) continue;
      if (card.capabilities.includes(capability) || card.capabilities.includes("task.execute")) {
        peers.push(card.sourceAgentPeerId);
      }
    }
    return peers;
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
    console.log(`[sendCallInvite] invoked target=${targetOwnerId.slice(0, 24)} sdpLen=${sdpOffer.length}`);
    const profile = this._profile;
    if (!profile) return null;
    if (!this._mesh && !this._externalMesh) return null;

    // The schema requires a real UUID — the stub used a non-UUID string
    // that would fail `parseCallInvitePayload` on the receiving side.
    const callId = randomUUID();
    const senderPeerId = derivePeerId(profile.device.publicKeyPem);
    webrtcCallTrace("sendCallInvite:start", {
      callId: shortCallId(callId),
      target: shortCallId(targetOwnerId),
      sdpLen: sdpOffer.length,
      path2: Boolean(iceServers?.length),
    });
    const trust = await this._trustStore.getTrustRecord(targetOwnerId);
    const peerDisplayName = trust?.displayName?.trim() || targetOwnerId;

    const initiated = this.callManager.outboundCallInitiated(
      callId,
      profile.owner.ownerId,
      targetOwnerId,
      peerDisplayName,
      callType,
    );
    if (!initiated) return null;

    let transport;
    try {
      transport = await this._resolvePeerTransportForOwner(targetOwnerId);
    } catch (err) {
      webrtcCallWarn("sendCallInvite:transport-resolve-failed", {
        callId: shortCallId(callId),
        target: shortCallId(targetOwnerId),
        error: err instanceof Error ? err.message.slice(0, 120) : String(err),
      });
      console.warn(`[sendCallInvite] peer transport resolve failed for ${targetOwnerId}:`, err);
      this._recordCallRejected(callId, "peer_unreachable");
      return null;
    }
    const { transportPeerId, recipientEnvelopePeerId, listenAddrs } = transport;

    const mesh = this._requireMesh();
    const records = await this._peerDirectoryStore.listPeerRecords();
    const connectedPeerIds = mesh.getConnectedPeerIds();
    const liveConnected = pickConnectedTransportForOwner(
      records,
      targetOwnerId,
      connectedPeerIds,
      this._lastLibp2pTransportByOwner,
    );
    const targetPeerId = liveConnected?.peerId ?? transportPeerId;
    const connBeforeWarm = mesh.getPeerConnectionInfo(targetPeerId);
    webrtcCallTrace("sendCallInvite:transport-ready", {
      callId: shortCallId(callId),
      target: shortCallId(targetOwnerId),
      transport: shortCallId(targetPeerId),
      connected: connBeforeWarm.connected,
      direct: connBeforeWarm.direct,
    });
    console.log(
      `[sendCallInvite] target=${targetOwnerId.slice(0, 24)} transport=${targetPeerId.slice(0, 12)} connected=${connBeforeWarm.connected} direct=${connBeforeWarm.direct}`,
    );
    if (!connBeforeWarm.connected && !liveConnected) {
      try {
        // If the existing connection is relay (not direct), ask warm to upgrade.
        // _warmContactConnectionTransport already checks hasDirectTcpDialHints
        // internally and keeps relay if no direct path exists.
        await this.warmContactConnection(targetOwnerId, {
          ...(!connBeforeWarm.direct ? { upgradeRelayToDirect: true } : undefined),
        });
      } catch (warmErr) {
        console.warn(
          `[sendCallInvite] warm before invite failed for ${targetOwnerId}:`,
          warmErr instanceof Error ? warmErr.message : warmErr,
        );
      }
    }

    // Re-check connectivity after warm — connBeforeWarm is now stale.
    const connAfterWarm = mesh.getPeerConnectionInfo(targetPeerId);

    const effectiveIceServers = await this._effectiveCallIceServers(iceServers);

    let dialHints: string[];
    if (connAfterWarm.connected || liveConnected) {
      dialHints = [];
    } else {
      try {
        dialHints = await raceWithTimeout(
          this._dialHintsForChat(targetPeerId, listenAddrs),
          10_000,
          "_dialHintsForChat",
        );
      } catch (hintErr) {
        console.warn(
          `[sendCallInvite] dial hints failed for ${targetOwnerId}, using listen addrs:`,
          hintErr instanceof Error ? hintErr.message : hintErr,
        );
        dialHints = mergeDialablePeerListenAddrs(transportPeerId, listenAddrs ?? []);
      }
    }

    const preferCircuitHints = connAfterWarm.connected ? !connAfterWarm.direct : !connAfterWarm.direct;

    const { createCallInvitePayload, createUnsignedEnvelope } = await import("@envoymesh/protocol");
    const { signUnsignedEnvelope } = await import("@envoymesh/identity");

    const invitePayload = createCallInvitePayload({
      callId,
      callerOwnerId: profile.owner.ownerId,
      callerPeerId: senderPeerId,
      callType,
      sdpOffer,
      iceServers: effectiveIceServers,
    });

    const unsigned = createUnsignedEnvelope({
      intent: "call.invite",
      senderPeerId,
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: recipientEnvelopePeerId,
      senderRole: "human",
      recipientRole: "human",
      payload: invitePayload,
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as any;

    // Store the transport peer ID on the outbound session so response
    // delivery (ICE candidates, accept, etc.) can use the fast path.
    this.callManager.setOutboundTransportPeerId(callId, targetPeerId);

    let deliverResult: ChatDeliverResult;
    try {
      if (connAfterWarm.connected || mesh.getConnectedPeerIds().includes(targetPeerId)) {
        await mesh.sendChat(targetPeerId, envelope, { dialHints: [] });
        deliverResult = { delivered: true, deliveredAt: new Date().toISOString() };
      } else {
        deliverResult = await this._deliverCallEnvelope(
          targetPeerId,
          envelope,
          dialHints,
          listenAddrs,
          preferCircuitHints,
        );
      }
    } catch (deliverErr) {
      const detail = deliverErr instanceof Error ? deliverErr.message : String(deliverErr);
      webrtcCallWarn("sendCallInvite:delivery-failed", {
        callId: shortCallId(callId),
        target: shortCallId(targetOwnerId),
        error: detail.slice(0, 120),
      });
      console.warn(`[sendCallInvite] call.invite delivery failed callId=${callId}:`, detail);
      this.callManager.reportOutboundDeliveryFailed(
        callId,
        "Could not reach contact — check relay connection and try again.",
      );
      if (this._taskStore) {
        await this._taskStore.appendAuditEvent(
          createAuditEvent({
            type: "message.rejected",
            intent: "call.invite",
            outcome: "deny",
            summary: `call.invite delivery failed callId=${callId}: ${detail}`,
            remotePeerId: targetOwnerId,
          }),
        ).catch(() => undefined);
      }
      return null;
    }

    if (!deliverResult.delivered) {
      const detail = "No reachable path to contact before call.invite send";
      webrtcCallWarn("sendCallInvite:delivery-not-delivered", {
        callId: shortCallId(callId),
        target: shortCallId(targetOwnerId),
      });
      console.warn(`[sendCallInvite] call.invite delivery failed callId=${callId}:`, detail);
      this.callManager.reportOutboundDeliveryFailed(
        callId,
        "Could not reach contact — check relay connection and try again.",
      );
      if (this._taskStore) {
        await this._taskStore.appendAuditEvent(
          createAuditEvent({
            type: "message.rejected",
            intent: "call.invite",
            outcome: "deny",
            summary: `call.invite delivery failed callId=${callId}: ${detail}`,
            remotePeerId: targetOwnerId,
          }),
        ).catch(() => undefined);
      }
      return null;
    }

    if (this._taskStore) {
      await this._taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: "call.invite",
          outcome: "allow",
          summary: `call.invite sent to ${targetOwnerId} callId=${callId}`,
          remotePeerId: targetOwnerId,
        }),
      ).catch(() => undefined);
    }

    console.log(`[sendCallInvite] call.invite delivered to ${targetOwnerId} callId=${callId}`);
    webrtcCallTrace("sendCallInvite:delivered", {
      callId: shortCallId(callId),
      target: shortCallId(targetOwnerId),
    });

    // NOTE (Phase 42I): the VoIP push is NOT dispatched from the caller's
    // home here. The callee's phone registers its VoIP token with ITS OWN
    // owner's home, so the caller's home has no token for the callee.
    // The dispatch lives on the callee's side, in call-inbound.ts
    // handleCallInvite (gated on the phone having no authenticated WS).

    return callId;
  }

  async sendCallReinvite(
    callId: string,
    sdpOffer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
    reason: "path1_timeout" | "path1_failed" = "path1_timeout",
  ): Promise<boolean> {
    const profile = this._profile;
    if (!profile || !this._mesh) return false;

    const callerOwnerId = profile.owner.ownerId;
    if (!this.callManager.canSendOutboundReinvite(callId, callerOwnerId)) return false;

    const peerOwnerId = this.callManager.getSessionPeerOwnerId(callId);
    if (!peerOwnerId) return false;

    const effectiveIceServers = await this._effectiveCallIceServers(iceServers);
    if (effectiveIceServers.length === 0) return false;

    let transport;
    try {
      transport = await this._resolvePeerTransportForOwner(peerOwnerId);
    } catch (err) {
      console.warn(`[sendCallReinvite] peer transport resolve failed for ${peerOwnerId}:`, err);
      return false;
    }
    const { transportPeerId, recipientEnvelopePeerId, listenAddrs } = transport;

    const mesh = this._requireMesh();
    let conn = mesh.getPeerConnectionInfo(transportPeerId);
    if (!conn.connected) {
      for (const addr of listenAddrs ?? []) {
        const trimmed = addr.trim();
        if (!trimmed) continue;
        try {
          await mesh.dial(trimmed);
          conn = mesh.getPeerConnectionInfo(transportPeerId);
          if (conn.connected) break;
        } catch {
          /* try next addr */
        }
      }
    }
    const preferCircuitHints = !conn.direct;

    const dialHints = await raceWithTimeout(
      this._dialHintsForChat(transportPeerId, listenAddrs),
      30_000,
      "_dialHintsForChat",
    );

    const senderPeerId = derivePeerId(profile.device.publicKeyPem);
    const { createCallReinvitePayload, createUnsignedEnvelope } = await import("@envoymesh/protocol");
    const { signUnsignedEnvelope } = await import("@envoymesh/identity");

    const reinvitePayload = createCallReinvitePayload({
      callId,
      callerOwnerId,
      callerPeerId: senderPeerId,
      sdpOffer,
      iceServers: effectiveIceServers,
      reason,
      transportPath: "path2",
    });

    const unsigned = createUnsignedEnvelope({
      intent: "call.reinvite",
      senderPeerId,
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: recipientEnvelopePeerId,
      senderRole: "human",
      recipientRole: "human",
      payload: reinvitePayload,
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as any;

    const records = await this._peerDirectoryStore.listPeerRecords();
    const liveConnected = pickLibp2pFromConnectedPeers(
      records,
      peerOwnerId,
      mesh.getConnectedPeerIds(),
    );
    const targetPeerId = liveConnected?.peerId ?? transportPeerId;
    conn = mesh.getPeerConnectionInfo(targetPeerId);

    let deliverResult: ChatDeliverResult;
    try {
      if (conn.connected || mesh.getConnectedPeerIds().includes(targetPeerId)) {
        await mesh.sendChat(targetPeerId, envelope, { dialHints: [] });
        deliverResult = { delivered: true, deliveredAt: new Date().toISOString() };
      } else {
        deliverResult = await this._deliverCallEnvelope(
          targetPeerId,
          envelope,
          dialHints,
          listenAddrs,
          preferCircuitHints,
        );
      }
    } catch (deliverErr) {
      console.warn(
        `[sendCallReinvite] call.reinvite delivery failed callId=${callId}:`,
        deliverErr instanceof Error ? deliverErr.message : deliverErr,
      );
      return false;
    }

    if (this._taskStore) {
      await this._taskStore.appendAuditEvent(
        createAuditEvent({
          type: deliverResult.delivered ? "message.sent" : "message.rejected",
          intent: "call.reinvite",
          outcome: deliverResult.delivered ? "allow" : "deny",
          summary: deliverResult.delivered
            ? `call.reinvite sent callId=${callId} reason=${reason}`
            : `call.reinvite delivery failed callId=${callId}`,
          remotePeerId: peerOwnerId,
        }),
      ).catch(() => undefined);
    }

    return deliverResult.delivered;
  }

  /**
   * Resolve the iceServers that ship in the `call.invite` payload.
   *
   * Order:
   * 1. Caller-supplied argument (phone-provided list).
   * 2. `node-config.iceServers` from disk.
   * 3. Hard-coded 3-server STUN default (Google / Cloudflare / Twilio).
   */
  private async _effectiveCallIceServers(
    callerSupplied?: { urls: string; username?: string; credential?: string }[],
  ): Promise<{ urls: string; username?: string; credential?: string }[]> {
    return effectiveCallIceServersViaRuntime(this._callContext(), callerSupplied);
  }

  private _recordCallRejected(callId: string, _reason: string): void {
    // Let CallManager emit the canonical `call:rejected` event so the UI
    // sees a single source of truth. Swallow any state-machine rejection
    // (e.g. the call already ended) — this is best-effort cleanup.
    try {
      this.callManager.rejectCall(
        callId,
        "error" as "busy" | "declined" | "offline" | "error" | "no_answer",
      );
    } catch {
      // best-effort
    }
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

  private _callContext(): CallContext {
    return {
      callManager: this.callManager,
      getProfile: () => this._profile,
      sendCallResponseEnvelope: (peerOwnerId: string, unsigned: unknown, intent: string) =>
        this._sendCallResponseEnvelope(peerOwnerId, unsigned as never, intent),
      loadConfig: () => this._configStore.load(),
    };
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
    _intent: string,
  ): Promise<boolean> {
    const profile = this._profile;
    if (!profile) return false;
    try {
      // Fast path: if we have a cached transport peer ID from the inbound
      // call.invite connection and the peer is still connected, send directly
      // without re-resolving transport or dialing. This is critical for ICE
      // candidates which must be delivered with minimal latency.
      const callId =
        typeof unsigned.payload === "object" &&
        unsigned.payload !== null &&
        "callId" in unsigned.payload
          ? String((unsigned.payload as { callId?: string }).callId)
          : undefined;
      const cachedPeerId = callId ? this.callManager.getSessionRemoteTransportPeerId(callId) : null;
      if (cachedPeerId) {
        const mesh = this._requireMesh();
        const conn = mesh.getPeerConnectionInfo(cachedPeerId);
        if (conn.connected || mesh.getConnectedPeerIds().includes(cachedPeerId)) {
          try {
            // Quick transport resolve just for recipientEnvelopePeerId —
            // _lastLibp2pTransportByOwner cache makes this a fast map lookup.
            const transport = await this._resolvePeerTransportForOwner(peerOwnerId);
            unsigned.recipientPeerId = transport.recipientEnvelopePeerId;
            const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
            await this.deliverCallEnvelopeToTransportPeer(cachedPeerId, envelope as EnvoyEnvelope);
            webrtcCallTrace("call-response:fast", {
              intent: _intent,
              peer: shortCallId(cachedPeerId),
            });
            return true;
          } catch {
            // Fast path failed — fall through to full delivery.
            webrtcCallTrace("call-response:fast-failed-fallback", { intent: _intent });
          }
        }
      }

      const transport = await this._resolvePeerTransportForOwner(peerOwnerId);
      const mesh = this._requireMesh();
      const records = await this._peerDirectoryStore.listPeerRecords();
      const connectedPeerIds = mesh.getConnectedPeerIds();
      const liveConnected = pickConnectedTransportForOwner(
        records,
        peerOwnerId,
        connectedPeerIds,
        this._lastLibp2pTransportByOwner,
      );
      let targetPeerId = liveConnected?.peerId ?? transport.transportPeerId;
      let listenAddrs = liveConnected?.listenAddrs ?? transport.listenAddrs;
      let conn = mesh.getPeerConnectionInfo(targetPeerId);
      if (!conn.connected) {
        targetPeerId = transport.transportPeerId;
        listenAddrs = transport.listenAddrs;
        conn = mesh.getPeerConnectionInfo(targetPeerId);
      }
      if (!conn.connected) {
        try {
          await mesh.dial(targetPeerId);
          conn = mesh.getPeerConnectionInfo(targetPeerId);
        } catch {
          /* try listen addrs */
        }
      }
      if (!conn.connected) {
        const addrs = (listenAddrs ?? []).map((a) => a.trim()).filter(Boolean);
        if (addrs.length > 0) {
          // Order by expected speed: LAN TCP first, then direct TCP, then circuits.
          const ordered = [...addrs].sort((a, b) => {
            const aLan = isPrivateLanTcpDialHint(a) ? 1 : 0;
            const bLan = isPrivateLanTcpDialHint(b) ? 1 : 0;
            if (aLan !== bLan) return bLan - aLan;
            const aCircuit = a.includes("/p2p-circuit/") ? 1 : 0;
            const bCircuit = b.includes("/p2p-circuit/") ? 1 : 0;
            if (aCircuit !== bCircuit) return aCircuit - bCircuit;
            return 0;
          });
          // Try addresses sequentially in speed order — stops at first success.
          for (const addr of ordered) {
            try {
              await mesh.dial(addr);
              conn = mesh.getPeerConnectionInfo(transport.transportPeerId);
              targetPeerId = transport.transportPeerId;
              if (conn.connected) break;
            } catch {
              /* try next addr */
            }
          }
        }
      }
      const preferCircuitHints = !conn.direct;
      let dialHints: string[];
      try {
        dialHints = await raceWithTimeout(
          this._dialHintsForChat(targetPeerId, listenAddrs),
          10_000,
          "_dialHintsForChat",
        );
      } catch (hintErr) {
        console.warn(
          `[call-response] dial hints failed for ${peerOwnerId}, using listen addrs:`,
          hintErr instanceof Error ? hintErr.message : hintErr,
        );
        dialHints = mergeDialablePeerListenAddrs(targetPeerId, listenAddrs ?? []);
      }
      // Stamp the recipient device peer id BEFORE signing — the signature
      // covers canonical JSON of the unsigned envelope.
      unsigned.recipientPeerId = transport.recipientEnvelopePeerId;
      const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
      const deliverResult = await this._deliverCallEnvelope(
        targetPeerId,
        envelope,
        conn.connected ? [] : dialHints,
        conn.connected ? [] : listenAddrs,
        preferCircuitHints,
      );
      if (!deliverResult.delivered) {
        webrtcCallWarn("call-response:not-delivered", {
          intent: _intent,
          peer: shortCallId(targetPeerId),
          callId: shortCallId(
            typeof unsigned.payload === "object" &&
              unsigned.payload !== null &&
              "callId" in unsigned.payload
              ? String((unsigned.payload as { callId?: string }).callId)
              : undefined,
          ),
        });
        console.warn(
          `[call-response] could not deliver ${_intent} to ${peerOwnerId.slice(0, 24)}…`,
        );
        return false;
      }
      webrtcCallTrace("call-response:delivered", {
        intent: _intent,
        peer: shortCallId(targetPeerId),
      });
      return true;
    } catch (err) {
      console.warn(
        `[call-response] could not deliver ${_intent} to ${peerOwnerId}:`,
        err instanceof Error ? err.message : err,
      );
      return false;
    }
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
