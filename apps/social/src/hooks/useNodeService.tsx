import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createWsClient } from "../ws-client.js";
import { DEFAULT_APP_SETTINGS, loadAppSettings } from "../lib/storage.js";
import type {
  AgentShareProposal,
  BondRecord,
  BridgeStatus,
  ChatDraft,
  ChatMessage,
  ChatRoom,
  ChatRoomMessageEvent,
  DiscoverPublishedLibraryParams,
  DiscoverPublishedLibraryPeerResult,
  PairingPayload,
  ConnectionStatus,
  ChatDiagnostics,
  ConnectivityDiagnostics,
  CircuitReservationStatus,
  MorningReportEntry,
  DiscoverCapabilityTopicResult,
  CreateHumanProfileInput,
  DiscoveryProfile,
  HelloProfile,
  HelloRequest,
  HelloResponse,
  HumanProfile,
  NodeProfile,
  NodeServiceEvents,
  NodeConfig,
  PeerSearchResult,
  RelayConfig,
  SearchQuery,
  SendChatResult,
  SendChatAttachmentParams,
  SendChatAttachmentResult,
  ReadLibraryItemContentParams,
  ReadLibraryItemContentResult,
  // Phase 45 — Web Content Browsing.
  LibraryReadParams,
  LibraryReadResult,
  SendHelloOptions,
  ShareOffer,
  SocialIntroProposal,
  SubmitAgentShareProposalParams,
  NodeStatus,
  LibraryItem,
  ListLibraryItemsParams,
  LocalFileItem,
  ListAllLocalFilesParams,
  ListAllLocalFilesResult,
  ReadLocalFileContentParams,
  OpenLocalFileParams,
  ExportLibraryItemToIpfsResult,
  VerifyLibraryItemIpfsGatewayParams,
  VerifyLibraryItemIpfsGatewayResult,
  ImportToLibraryParams,
  ImportToLibraryResult,
  CreateNoteParams,
  CreateNoteResult,
  DeleteVaultItemParams,
  KbPluginInfo,
  ListKbPluginsParams,
  ActivateKbPluginParams,
  DeactivateKbPluginParams,
  UpdateKbPluginConfigParams,
  IpfsEngineStatus,
  RagIndexStatus,
  SendChatParams,
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
  ChainExportCostsParams,
  ChainExportCostsResult,
  ChainListRecipesParams,
  ChainListRecipesResult,
  ChainSaveRecipeParams,
  ChainSaveRecipeResult,
  ChainDeleteRecipeParams,
  ChainDeleteRecipeResult,
} from "@envoymesh/api";
import { OWNER_FAMILY_PROFILE_ID, TERMINAL_ASSIST_RPC_TIMEOUT_MS, EH_ASK_WS_TIMEOUT_MS } from "@envoymesh/api";
import { mergeGroupDeliveryAck } from "@envoymesh/api/group-chat-delivery";
import {
  mergeMessagesIntoThread,
  replaceChatThreadsCache,
  snapshotChatThreadsCache,
} from "../lib/chat-threads-cache.js";
import {
  isChatMessageVisibleToProfile,
  isThreadVisibleToProfile,
  messageIsOutgoing,
  pruneThreadsForProfile,
  resolveChatThreadKey,
} from "../lib/chat-visibility.js";

type InitNodeOptions = {
  discoveryProfile?: DiscoveryProfile;
  relayEnabled?: boolean;
  relayServerEnabled?: boolean;
  advertiseAddrs?: string[];
  bootstrapPeers?: string[];
  bootstrapPresets?: string[];
};

type NodeInitResult = {
  profileDir: string;
  peerId: string;
  ownerId: string;
  deviceId: string;
};

export interface NodeServiceClient {
  // Connection
  connect(): Promise<void>;
  disconnect(): void;
  reconnect(): Promise<void>;
  isConnected: boolean;
  isReady: boolean;
  reconnectAttempts: number;
  getLastError?(): string | null;

  // Identity
  getProfile(): Promise<NodeProfile>;
  getOwnerDidPresentation(): Promise<import("@envoymesh/api").OwnerDidPresentation>;
  resolveDidImport(input: string): Promise<import("@envoymesh/api").ResolveDidImportResult>;
  cacheDidContactKey(params: { ownerId: string; publicKeyPem: string }): Promise<{ ok: boolean; reason?: string }>;
  getPeerReputationSummary(peerOwnerId: string): Promise<import("@envoymesh/api").PeerReputationSummary>;
  getHumanProfile(): Promise<HumanProfile | undefined>;
  updateHumanProfile(input: CreateHumanProfileInput): Promise<HumanProfile>;
  setPublicProfileThumbnail(
    params: import("@envoymesh/api").SetPublicProfileThumbnailParams,
  ): Promise<HumanProfile>;
  upsertProfileGalleryPhoto(
    params: import("@envoymesh/api").UpsertProfileGalleryPhotoParams,
  ): Promise<HumanProfile>;
  removeProfileGalleryPhoto(params: { vaultRelativePath: string }): Promise<HumanProfile>;
  updateProfileGalleryPhotoVisibility(
    params: import("@envoymesh/api").UpdateProfileGalleryPhotoVisibilityParams,
  ): Promise<HumanProfile>;
  getPeerProfile(ownerId: string): Promise<import("@envoymesh/api").PeerProfileView | undefined>;
  listPeerProfiles(): Promise<import("@envoymesh/api").PeerProfileView[]>;
  requestPeerProfile(ownerId: string): Promise<{ ok: boolean; reason?: string }>;
  syncProfileToBonds(): Promise<void>;
  refreshBondPeerProfiles(): Promise<{ requested: number; failed: number }>;
  getAgentIdentity(): Promise<import("@envoymesh/api").AgentIdentityDocument>;
  updateAgentIdentity(content: string): Promise<import("@envoymesh/api").AgentIdentityDocument>;

  // Bond Management
  sendHello(
    targetOwnerId: string,
    profile: HelloProfile,
    message: string,
    options?: SendHelloOptions,
  ): Promise<HelloResponse>;
  acceptHello(messageId: string): Promise<void>;
  declineHello(messageId: string, reason?: string): Promise<void>;
  blockPeer(peerOwnerId: string): Promise<void>;
  unblockPeer(peerOwnerId: string): Promise<void>;
  revokeBond(peerOwnerId: string): Promise<void>;
  getBonds(): Promise<BondRecord[]>;
  listPendingSocialIntroProposals(): Promise<SocialIntroProposal[]>;
  approveSocialIntroCommitment(messageId: string): Promise<{ ownerCommitmentRef: string }>;
  declineSocialIntroProposal(messageId: string): Promise<void>;

  // Messaging
  sendChat(
    targetOwnerId: string,
    text: string,
    attachments?: SendChatParams["attachments"],
    listingId?: string,
  ): Promise<SendChatResult>;
  sendAgentChat(targetOwnerId: string, text: string): Promise<SendChatResult>;
  sendChatAttachment(params: SendChatAttachmentParams): Promise<SendChatAttachmentResult>;
  readLibraryItemContent(params: ReadLibraryItemContentParams): Promise<ReadLibraryItemContentResult>;
  // Phase 45 — Web Content Browsing. See docs/web-content-browsing-design.md §4.6.
  libraryRead(params: LibraryReadParams): Promise<LibraryReadResult>;
  publishWebContentEntry(
    params: import("@envoymesh/api").PublishWebContentParams,
  ): Promise<import("@envoymesh/api").PublishWebContentResult>;
  ensureDefaultWebSite(): Promise<import("@envoymesh/api").EnsureDefaultWebSiteResult>;
  listWebContentSections(): Promise<import("@envoymesh/api").WebContentSectionSummary[]>;
  listFeedPosts(): Promise<import("@envoymesh/api").FeedPostSummary[]>;
  listFeedTimeline(
    params?: import("@envoymesh/api").ListFeedTimelineParams,
  ): Promise<import("@envoymesh/api").ListFeedTimelineResult>;
  listBlogPosts(): Promise<import("@envoymesh/api").BlogPostSummary[]>;
  deleteWebContentEntry(
    params: import("@envoymesh/api").DeleteWebContentParams,
  ): Promise<import("@envoymesh/api").DeleteWebContentResult>;
  listFeedNotifications(): Promise<import("@envoymesh/api").FeedNotification[]>;
  dismissFeedNotification(id: string): Promise<void>;
  dismissAllFeedNotifications(): Promise<void>;
  listContentEngageNotifications(): Promise<import("@envoymesh/api").ContentEngageNotification[]>;
  dismissContentEngageNotifications(
    params?: import("@envoymesh/api").DismissContentEngageNotificationsParams,
  ): Promise<void>;
  getContentEngagement(params: {
    url: string;
  }): Promise<import("@envoymesh/api").ContentEngagementSummary>;
  toggleContentStar(params: {
    url: string;
  }): Promise<import("@envoymesh/api").ContentEngagementSummary>;
  addContentComment(params: {
    url: string;
    text: string;
  }): Promise<import("@envoymesh/api").ContentEngagementSummary>;
  removeContentComment(params: {
    url: string;
    commentId: string;
  }): Promise<import("@envoymesh/api").ContentEngagementSummary>;
  listChatHistory(peerOwnerId: string, limit?: number): Promise<ChatMessage[]>;
  listChatRooms(): Promise<ChatRoom[]>;
  createChatRoom(title: string, memberOwnerIds: string[]): Promise<ChatRoom>;
  inviteToChatRoom(roomId: string, memberOwnerIds: string[]): Promise<ChatRoom>;
  leaveChatRoom(roomId: string): Promise<void>;
  removeMembersFromChatRoom(roomId: string, memberOwnerIds: string[]): Promise<ChatRoom>;
  renameChatRoom(roomId: string, title: string): Promise<ChatRoom>;
  dismissChatRoom(roomId: string): Promise<void>;
  sendChatRoomMessage(roomId: string, text: string): Promise<SendChatResult>;
  sendChatRoomAttachment(
    params: import("@envoymesh/api").SendChatRoomAttachmentParams,
  ): Promise<import("@envoymesh/api").SendChatRoomAttachmentResult>;
  listAgentActivity(params?: import("@envoymesh/api").ListAgentActivityParams): Promise<import("@envoymesh/api").AgentActivityRecord[]>;
  listCommerceReceipts(
    params?: import("@envoymesh/api").ListCommerceReceiptsParams,
  ): Promise<import("@envoymesh/api").CommerceReceiptRecord[]>;
  recordCommerceReceipt(
    params: import("@envoymesh/api").RecordCommerceReceiptParams,
  ): Promise<import("@envoymesh/api").CommerceReceiptRecord>;
  listAuditEvents(params?: import("@envoymesh/api").ListAuditEventsParams): Promise<import("@envoymesh/api").AuditEventSummary[]>;
  listTaskJournalEntries(params?: import("@envoymesh/api").ListTaskJournalParams): Promise<import("@envoymesh/api").TaskJournalSummary[]>;
  getCostSummary(params?: import("@envoymesh/api").GetCostSummaryParams): Promise<import("@envoymesh/api").CostSummary>;
  runCostRollupRetention(): Promise<{ collapsed: number; dropped: number }>;
  listAgentCards(): Promise<import("@envoymesh/api").CachedAgentCardSummary[]>;
  getLocalAgentNetworkWorkerCard(): Promise<import("@envoymesh/api").CachedAgentCardSummary | undefined>;
  getAgentCard(ownerId: string): Promise<import("@envoymesh/api").CachedAgentCardSummary | undefined>;
  requestAgentCard(targetOwnerId: string): Promise<{ ok: boolean; error?: string }>;
  refreshAgentNetworkWorkers(): Promise<{ requested: number; failed: number }>;
  ensureFleetWorkersJoinAndLease(
    params?: import("@envoymesh/api").EnsureFleetWorkersParams,
  ): Promise<import("@envoymesh/api").EnsureFleetWorkersResult>;
  getTaskResult(taskId: string): Promise<import("@envoymesh/api").TaskResultPayload | undefined>;
  listPendingApprovals(): Promise<import("@envoymesh/api").PendingApprovalSummary[]>;
  approvePendingApproval(itemId: string, notes?: string): Promise<import("@envoymesh/api").ApprovePendingApprovalResult>;
  rejectPendingApproval(itemId: string, notes?: string): Promise<{ ok: boolean; error?: string }>;
  deleteChatMessage(peerOwnerId: string, messageId: string): Promise<{ ok: boolean }>;
  clearChatHistory(peerOwnerId: string): Promise<{ deletedCount: number }>;
  getChatDrafts(threadPeerOwnerId?: string): Promise<ChatDraft[]>;
  deleteChatDraft(draftId: string): Promise<void>;

  // Search
  searchPeers(query: SearchQuery): Promise<PeerSearchResult[]>;
  getNearbyDiscoveredPeers(): Promise<PeerSearchResult[]>;
  refreshNearbyDiscovery(): Promise<{ peered: number; resolved: number; unreachable: number }>;
  advertiseTopic(topic: string): Promise<void>;
  stopAdvertiseTopic(topic: string): Promise<void>;

  // Connection Status
  getConnectionStatus(): Promise<ConnectionStatus>;
  getPeerConnectionInfo(peerOwnerId: string): Promise<{ connected: boolean; direct: boolean; relayPeerId?: string }>;
  warmContactConnection(
    peerOwnerId: string,
    options?: { redial?: boolean; verifyOnly?: boolean; upgradeRelayToDirect?: boolean; keepAlive?: boolean; verifyConnection?: boolean; force?: boolean },
  ): Promise<{ connected: boolean; direct: boolean; relayPeerId?: string }>;
  getChatDiagnostics(peerOwnerId?: string): Promise<ChatDiagnostics>;
  getConnectivityDiagnostics(): Promise<ConnectivityDiagnostics>;
  getCircuitReservationStatus(): Promise<CircuitReservationStatus>;

  // Phase 40 — Agent Network Collaboration Layer
  chainPlan(params: ChainPlanParams): Promise<ChainPlanResult>;
  chainLaunch(params: ChainLaunchParams): Promise<ChainLaunchResult>;
  chainGetState(params: ChainGetStateParams): Promise<ChainGetStateResult>;
  chainGetStepProvenance(
    params: import("@envoymesh/api").ChainGetStepProvenanceParams,
  ): Promise<import("@envoymesh/api").ChainGetStepProvenanceResult>;
  chainListActive(params?: ChainListActiveParams): Promise<ChainListActiveResult>;
  chainListObserved?(
    params?: import("@envoymesh/api").ChainListObservedParams,
  ): Promise<import("@envoymesh/api").ChainListObservedResult>;
  chainCancel(params: ChainCancelParams): Promise<ChainCancelResult>;
  chainReclaimAssigner?(
    params: import("@envoymesh/api").ChainReclaimAssignerParams,
  ): Promise<import("@envoymesh/api").ChainReclaimAssignerResult>;
  chainCancelDelegated?(
    params: import("@envoymesh/api").ChainCancelDelegatedParams,
  ): Promise<import("@envoymesh/api").ChainCancelDelegatedResult>;
  chainReassignSubtask?(
    params: import("@envoymesh/api").ChainReassignSubtaskParams,
  ): Promise<import("@envoymesh/api").ChainReassignSubtaskResult>;
  chainRetryInputDelivery?(
    params: import("@envoymesh/api").ChainRetryInputDeliveryParams,
  ): Promise<import("@envoymesh/api").ChainRetryInputDeliveryResult>;
  chainListReports(params?: ChainListReportsParams): Promise<ChainListReportsResult>;
  chainGetReport(params: ChainGetReportParams): Promise<ChainGetReportResult>;
  chainPinReport(params: ChainPinReportParams): Promise<ChainPinReportResult>;
  chainDeleteReport(params: ChainDeleteReportParams): Promise<ChainDeleteReportResult>;
  chainSetBidStrategy(params: ChainSetBidStrategyParams): Promise<ChainSetBidStrategyResult>;
  chainGetBidStrategy(params: ChainGetBidStrategyParams): Promise<ChainGetBidStrategyResult>;
  chainEvaluateBids(params: ChainEvaluateBidsParams): Promise<ChainEvaluateBidsResult>;
  chainCounterBid(params: ChainCounterBidParams): Promise<ChainCounterBidResult>;
  chainRebalance(params: ChainRebalanceParams): Promise<ChainRebalanceResult>;
  chainGetDefaults(params: ChainGetDefaultsParams): Promise<ChainGetDefaultsResult>;
  chainSetDefaults(params: ChainSetDefaultsParams): Promise<ChainSetDefaultsResult>;
  chainPreviewGoal(params: ChainPreviewGoalParams): Promise<ChainPreviewGoalResult>;
  agentNetworkDiagnosticsSnapshot(): Promise<
    import("@envoymesh/api").AgentNetworkDiagnosticsSnapshot
  >;
  agentNetworkSimulate(
    params: import("@envoymesh/api").AgentNetworkSimulationParams,
  ): Promise<import("@envoymesh/api").AgentNetworkSimulationResult>;
  agentNetworkExportDiagnostics(params: {
    simulationId?: string;
  }): Promise<{ json: string }>;
  chainStartFromGoal(params: ChainStartFromGoalParams): Promise<ChainStartFromGoalResult>;
  chainProbeReachability(params: ChainProbeReachabilityParams): Promise<ChainProbeReachabilityResult>;
  chainResolveIteration(params: import("@envoymesh/api").ChainResolveIterationParams): Promise<import("@envoymesh/api").ChainResolveIterationResult>;
  chainResolveSpeculation(params: import("@envoymesh/api").ChainResolveSpeculationParams): Promise<import("@envoymesh/api").ChainResolveSpeculationResult>;
  chainExportCosts(params: ChainExportCostsParams): Promise<ChainExportCostsResult>;
  chainListRecipes(params?: ChainListRecipesParams): Promise<ChainListRecipesResult>;
  chainSaveRecipe(params: ChainSaveRecipeParams): Promise<ChainSaveRecipeResult>;
  chainDeleteRecipe(params: ChainDeleteRecipeParams): Promise<ChainDeleteRecipeResult>;
  runCapabilityDiscovery(params?: { find?: boolean }): Promise<void>;
  discoverCapabilityTopic(params: {
    topic: string;
    maxResults?: number;
    followUpDiscovery?: boolean;
  }): Promise<DiscoverCapabilityTopicResult>;
  getMorningReport(params?: { limit?: number }): Promise<MorningReportEntry[]>;
  requestMultiHopDiscovery(
    params: import("@envoymesh/api").RequestMultiHopDiscoveryParams,
  ): Promise<import("@envoymesh/api").RequestMultiHopDiscoveryResult>;
  getMultiHopDiscoverySession(
    correlationId: string,
  ): Promise<import("@envoymesh/api").MultiHopDiscoverySessionView | undefined>;
  sendSyncStateUpdate(
    params: import("@envoymesh/api").SendSyncStateUpdateParams,
  ): Promise<import("@envoymesh/api").SendSyncStateUpdateResult>;

  // Agent Bridge
  getBridgeStatus(): Promise<BridgeStatus>;
  getOpenClawStatus(): Promise<import("@envoymesh/api").OpenClawStatus>;
  /** Soft-probe Ext Agent reachability (never blocks switching). */
  probeExtAgent(
    params?: import("@envoymesh/api").ProbeExtAgentParams,
  ): Promise<import("@envoymesh/api").ExtAgentReachability>;
  /** Slash catalog for Ext Agent chat autocomplete. */
  getExtAgentCommandCatalog(
    params?: import("@envoymesh/api").GetExtAgentCommandCatalogParams,
  ): Promise<import("@envoymesh/api").ExtAgentCommandCatalog>;
  /** Set/clear Ext Agent session model override (`/model`). */
  setExtAgentSessionModel(
    params: import("@envoymesh/api").SetExtAgentSessionModelParams,
  ): Promise<import("@envoymesh/api").SetExtAgentSessionModelResult>;
  getHomeFsInfo(): Promise<import("@envoymesh/api").HomeFsInfo>;
  listHomeFsEntries(
    params?: import("@envoymesh/api").ListHomeFsEntriesParams,
  ): Promise<import("@envoymesh/api").ListHomeFsEntriesResult>;
  discoverObsidianVaults(): Promise<
    import("@envoymesh/api").DiscoverObsidianVaultsResult
  >;
  openDesktopApp(
    params: import("@envoymesh/api").OpenDesktopAppParams,
  ): Promise<import("@envoymesh/api").OpenDesktopAppResult>;
  getExtAgentProjectPath(
    params?: import("@envoymesh/api").GetExtAgentProjectPathParams,
  ): Promise<import("@envoymesh/api").ExtAgentProjectPathResult>;
  setExtAgentProjectPath(
    params: import("@envoymesh/api").SetExtAgentProjectPathParams,
  ): Promise<import("@envoymesh/api").ExtAgentProjectPathResult>;
  previewHomeFsFile(
    params: import("@envoymesh/api").PreviewHomeFsFileParams,
  ): Promise<import("@envoymesh/api").PreviewHomeFsFileResult>;
  runMmxMediaCommand(
    params: import("@envoymesh/api").RunMmxMediaCommandParams,
  ): Promise<import("@envoymesh/api").RunMmxMediaCommandResult>;
  revealHomeFsPath(
    params: import("@envoymesh/api").RevealHomeFsPathParams,
  ): Promise<import("@envoymesh/api").RevealHomeFsPathResult>;
  uploadEnvoyAttachment(
    params: import("@envoymesh/api").UploadEnvoyAttachmentParams,
  ): Promise<import("@envoymesh/api").UploadEnvoyAttachmentResult>;
  buildAgentAttachmentContext(
    params: import("@envoymesh/api").BuildAgentAttachmentContextParams,
  ): Promise<import("@envoymesh/api").BuildAgentAttachmentContextResult>;
  /** EnvoyAI (OpenClaw) slash catalog. */
  getEnvoyAiCommandCatalog(): Promise<import("@envoymesh/api").ExtAgentCommandCatalog>;
  /** Force-restart the built-in OpenClaw gateway. */
  restartOpenClaw(): Promise<import("@envoymesh/api").OpenClawStatus>;
  // Phase 49 — Pi (built-in local coding agent). Local-only; no mesh.* tools.
  /** Returns Pi runtime status (enabled, state, pid, model, lastError). */
  getPiStatus(): Promise<import("@envoymesh/api").PiStatus>;
  /** Stop + start the Pi child process. May take up to ~15s (readiness probe). */
  restartPi(): Promise<import("@envoymesh/api").PiStatus>;
  // Phase 54 — Envoy Local (downloadable llama-server)
  getEnvoyLocalStatus(): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  enableEnvoyLocal(
    params?: import("@envoymesh/api").EnableEnvoyLocalParams,
  ): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  getEnvoyLocalEmbedStatus(): Promise<import("@envoymesh/api").EnvoyLocalEmbedStatus>;
  enableEnvoyLocalEmbed(
    params?: import("@envoymesh/api").EnableEnvoyLocalEmbedParams,
  ): Promise<import("@envoymesh/api").EnvoyLocalEmbedStatus>;
  stopEnvoyLocalEmbed(): Promise<import("@envoymesh/api").EnvoyLocalEmbedStatus>;
  disableEnvoyLocalEmbed(): Promise<import("@envoymesh/api").EnvoyLocalEmbedStatus>;
  listEnvoyLocalInstalledEmbedModels(): Promise<
    import("@envoymesh/api").EnvoyLocalInstalledModel[]
  >;
  setEnvoyLocalEmbedActiveModel(
    params: import("@envoymesh/api").SetEnvoyLocalEmbedActiveModelParams,
  ): Promise<import("@envoymesh/api").EnvoyLocalEmbedStatus>;
  declineEnvoyLocalAutoProvision(): Promise<
    import("@envoymesh/api").EnvoyLocalStatus
  >;
  disableEnvoyLocal(): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  startEnvoyLocal(): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  stopEnvoyLocal(): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  restartEnvoyLocal(): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  cancelEnvoyLocalDownload(): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  listEnvoyLocalInstalledModels(): Promise<
    import("@envoymesh/api").EnvoyLocalInstalledModel[]
  >;
  searchEnvoyLocalModels(
    params?: import("@envoymesh/api").SearchEnvoyLocalModelsParams,
  ): Promise<import("@envoymesh/api").SearchEnvoyLocalModelsResult>;
  downloadEnvoyLocalModel(
    params: import("@envoymesh/api").DownloadEnvoyLocalModelParams,
  ): Promise<import("@envoymesh/api").EnvoyLocalInstalledModel[]>;
  setEnvoyLocalDownloadRegion(
    params: import("@envoymesh/api").SetEnvoyLocalDownloadRegionParams,
  ): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  setEnvoyLocalActiveModel(
    params: import("@envoymesh/api").SetEnvoyLocalActiveModelParams,
  ): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  deleteEnvoyLocalModel(
    params: import("@envoymesh/api").DeleteEnvoyLocalModelParams,
  ): Promise<import("@envoymesh/api").EnvoyLocalInstalledModel[]>;
  updateEnvoyLocalServerParams(
    params: import("@envoymesh/api").UpdateEnvoyLocalServerParamsParams,
  ): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  resetEnvoyLocalServerParams(): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  checkEnvoyLocalEngineUpdate(): Promise<
    import("@envoymesh/api").EnvoyLocalEngineUpdateInfo
  >;
  updateEnvoyLocalEngine(): Promise<import("@envoymesh/api").EnvoyLocalStatus>;
  /** One-shot prompt — collects streamed text into a single response. */
  sendToPi(text: string): Promise<string>;
  // U4 — dedicated Envoy Harness UI surface.
  /** envoy-harness runtime status (ready/model/error + peer cluster counts). */
  getEnvoyHarnessStatus(): Promise<import("@envoymesh/api").EnvoyHarnessStatus>;
  /** One-shot prompt — blocks until turn completes (legacy / orchestration). */
  askEnvoyHarness(text: string): Promise<string>;
  /** Non-blocking turn start — progress via `eh:turn_*` events. */
  startEnvoyHarnessTurn(
    text: string,
    attachments?: import("@envoymesh/api").AgentAttachmentRef[],
    chatId?: string,
  ): Promise<{ turnId: string }>;
  getEnvoyHarnessTurnStatus(
    chatId?: string,
  ): Promise<import("@envoymesh/api").EhTurnStatus>;
  setEnvoyHarnessAutoRunPolicy(
    policy: string,
  ): Promise<import("@envoymesh/api").EnvoyHarnessStatus>;
  getEnvoyHarnessChatHistory(
    chatId?: string,
  ): Promise<import("@envoymesh/api").EhChatHistory>;
  listEnvoyHarnessChats(): Promise<
    import("@envoymesh/api").EhChatWorkspaceSummary[]
  >;
  createEnvoyHarnessChat(opts: {
    cwd: string;
    title?: string;
  }): Promise<import("@envoymesh/api").EhChatWorkspaceSummary>;
  openEnvoyHarnessChat(
    chatId: string,
  ): Promise<import("@envoymesh/api").EhChatHistory>;
  removeEnvoyHarnessChat(chatId: string): Promise<{ removed: boolean }>;
  deleteEnvoyHarnessChatTurn(opts: {
    turnId: string;
    chatId?: string;
  }): Promise<import("@envoymesh/api").EhChatHistory & { deleted: boolean }>;
  getEnvoyHarnessTurnReview(
    turnId: string,
  ): Promise<import("@envoymesh/api").EhTurnReview | null>;
  revertEnvoyHarnessTurn(
    turnId: string,
  ): Promise<import("@envoymesh/api").EhRevertTurnResult>;
  acceptEnvoyHarnessTurnReview(
    turnId: string,
    paths?: readonly string[],
  ): Promise<import("@envoymesh/api").EhAcceptTurnReviewResult>;
  revertEnvoyHarnessTurnFiles(
    turnId: string,
    paths: readonly string[],
  ): Promise<import("@envoymesh/api").EhRevertTurnResult>;
  openEnvoyHarnessFile(params: { path: string; chatId?: string }): Promise<void>;
  getEnvoyHarnessCommandCatalog(): Promise<import("@envoymesh/api").ExtAgentCommandCatalog>;
  recordEnvoyHarnessUxEvent(event: import("@envoymesh/api").EhUxTelemetryEvent): Promise<void>;
  resetEnvoyHarnessChat(
    chatId?: string,
  ): Promise<import("@envoymesh/api").EhChatHistory>;
  resumeEnvoyHarnessSession(opts: {
    sessionId: string;
    chatId?: string;
  }): Promise<import("@envoymesh/api").EhChatHistory>;
  ehRespondToPermission(params: {
    requestId: string;
    allowed: boolean;
  }): Promise<{ requestId: string; delivered: boolean }>;
  cancelEnvoyHarnessTurn(chatId?: string): Promise<{ cancelled: boolean }>;
  /** The configured envoy-harness peer cluster (id/model/capabilities). */
  listEnvoyHarnessPeers(): Promise<
    ReadonlyArray<{
      id: string;
      model?: string;
      capabilities?: readonly string[];
    }>
  >;
  /** Persist the envoy-harness project folder (validated, resets runtime). */
  setEnvoyHarnessProjectPath(
    path: string,
  ): Promise<import("@envoymesh/api").EnvoyHarnessStatus>;
  /** EHUI panel invoke for Envoy Harness rails. */
  invokeEnvoyHarnessEhui(
    request: import("@envoymesh/api").EhuiInvokeRequest,
  ): Promise<unknown>;
  /** Ensure the Envoy TUI terminal for a project folder (like Pi's). */
  ensureEnvoyTerminalSession(
    params?: import("@envoymesh/api").EnsureEnvoyTerminalParams,
  ): Promise<import("@envoymesh/api").EnsureEnvoyTerminalResult>;
  /** Ensure Pi interactive TUI for a project folder (lazy; may return needs_project). */
  ensurePiTerminalSession(
    params?: import("@envoymesh/api").EnsurePiTerminalParams,
  ): Promise<import("@envoymesh/api").EnsurePiTerminalResult>;
  /** Phase 49D — confirm/deny a Pi tool-action request. */
  piRespondToProposal(params: {
    uiRequestId: string
    confirmed: boolean
  }): Promise<{ uiRequestId: string; delivered: boolean }>;
  ehRespondToUserQuestion(
    params: import("@envoymesh/api").EhRespondToUserQuestionParams,
  ): Promise<import("@envoymesh/api").EhRespondToUserQuestionResult>;
  getPairingPayload(): Promise<PairingPayload>;
  createWanJoinInvite(
    params?: import("@envoymesh/api").CreateWanJoinInviteParams,
  ): Promise<import("@envoymesh/api").CreateWanJoinInviteResult>;
  applyWanJoinInvite(token: string): Promise<import("@envoymesh/api").ApplyWanJoinInviteResult>;
  createCompanyInvite(
    params?: import("@envoymesh/api").CreateCompanyInviteParams,
  ): Promise<import("@envoymesh/api").CreateCompanyInviteResult>;
  listCompanyInvites(): Promise<import("@envoymesh/api").ListCompanyInvitesResult>;
  revokeCompanyInvite(inviteId: string): Promise<import("@envoymesh/api").RevokeCompanyInviteResult>;
  redeemCompanyInvite(
    params: import("@envoymesh/api").RedeemCompanyInviteParams,
  ): Promise<import("@envoymesh/api").RedeemCompanyInviteResult>;
  /** Phase 51 — Family Network (owner desktop). */
  listFamilyProfiles(): Promise<import("@envoymesh/api").ListFamilyProfilesResult>;
  createFamilyProfile(
    params: import("@envoymesh/api").CreateFamilyProfileParams,
  ): Promise<import("@envoymesh/api").CreateFamilyProfileResult>;
  updateFamilyProfile(
    params: import("@envoymesh/api").UpdateFamilyProfileParams,
  ): Promise<import("@envoymesh/api").UpdateFamilyProfileResult>;
  deleteFamilyProfile(id: string): Promise<import("@envoymesh/api").DeleteFamilyProfileResult>;
  wipeFamilyProfile(id: string): Promise<import("@envoymesh/api").WipeFamilyProfileResult>;
  generateFamilyInviteToken(
    params?: import("@envoymesh/api").GenerateFamilyInviteTokenParams,
  ): Promise<import("@envoymesh/api").GenerateFamilyInviteTokenResult>;
  sendFamilyMessage(
    params: import("@envoymesh/api").SendFamilyMessageParams,
  ): Promise<import("@envoymesh/api").SendFamilyMessageResult>;
  listFamilyRooms(): Promise<import("@envoymesh/api").ListFamilyRoomsResult>;
  createFamilyRoom(
    params: import("@envoymesh/api").CreateFamilyRoomParams,
  ): Promise<import("@envoymesh/api").CreateFamilyRoomResult>;
  sendFamilyRoomMessage(
    params: import("@envoymesh/api").SendFamilyRoomMessageParams,
  ): Promise<import("@envoymesh/api").SendFamilyRoomMessageResult>;
  /**
   * EM-F1 — sliced read of a family-media attachment (bytes stay on the home
   * node; never the owner vault). Each slice is capped at 1 MiB by the node.
   */
  readFamilyAttachment(
    params: import("@envoymesh/api").FamilyAttachmentReadParams,
  ): Promise<import("@envoymesh/api").FamilyAttachmentReadResult>;
  /** Phase 63A — Envoy Market local shop. */
  shopGetProfile(): Promise<import("@envoymesh/api").ShopGetProfileResult>;
  shopUpdateProfile(
    params: import("@envoymesh/api").ShopUpdateProfileParams,
  ): Promise<import("@envoymesh/api").ShopUpdateProfileResult>;
  shopListListings(
    params?: import("@envoymesh/api").ShopListListingsParams,
  ): Promise<import("@envoymesh/api").ShopListListingsResult>;
  shopUpsertListing(
    params: import("@envoymesh/api").ShopUpsertListingParams,
  ): Promise<import("@envoymesh/api").ShopUpsertListingResult>;
  shopSetListingStatus(
    params: import("@envoymesh/api").ShopSetListingStatusParams,
  ): Promise<import("@envoymesh/api").ShopSetListingStatusResult>;
  shopDeleteListing(
    params: import("@envoymesh/api").ShopDeleteListingParams,
  ): Promise<import("@envoymesh/api").ShopDeleteListingResult>;
  shopDraftListing(
    params?: import("@envoymesh/api").ShopDraftListingParams,
  ): Promise<import("@envoymesh/api").ShopDraftListingResult>;
  shopSaveListingMedia(
    params: import("@envoymesh/api").ShopSaveListingMediaParams,
  ): Promise<import("@envoymesh/api").ShopSaveListingMediaResult>;
  shopGetListingMedia(
    params: import("@envoymesh/api").ShopGetListingMediaParams,
  ): Promise<import("@envoymesh/api").ShopGetListingMediaResult>;
  /** Phase 63B — browse peer MarketCache. */
  marketSearch(
    params?: import("@envoymesh/api").MarketSearchParams,
  ): Promise<import("@envoymesh/api").MarketSearchResult>;
  marketBrowseSuggestions(): Promise<import("@envoymesh/api").MarketBrowseSuggestionsResult>;
  marketClearSearchHistory(): Promise<{ ok: true }>;
  marketReportSeller(
    params: import("@envoymesh/api").MarketReportSellerParams,
  ): Promise<void>;
  marketSuggestSellerReply(
    params: import("@envoymesh/api").MarketSuggestSellerReplyParams,
  ): Promise<import("@envoymesh/api").MarketSuggestSellerReplyResult>;
  marketShareListing(
    params: import("@envoymesh/api").MarketShareListingParams,
  ): Promise<import("@envoymesh/api").MarketShareListingResult>;
  syncPairingKioskFromConfig(): Promise<void>;
  getPairingKioskStatus(): Promise<import("@envoymesh/api").PairingKioskStatus>;
  importFleetManifest(
    params: import("@envoymesh/api").ImportFleetManifestParams,
  ): Promise<import("@envoymesh/api").ImportFleetManifestOutcome>;
  listFleetManifests(): Promise<import("@envoymesh/api").ListFleetManifestsResult>;
  revokeFleetManifest(
    manifestId: string,
  ): Promise<import("@envoymesh/api").RevokeFleetManifestResult>;
  createFleetManifest(
    input: import("@envoymesh/api").CreateFleetManifestInput,
  ): Promise<import("@envoymesh/api").CreateFleetManifestResult>;
  pairWithHomeNode(params: import("@envoymesh/api").PairWithHomeNodeParams): Promise<import("@envoymesh/api").PairWithHomeNodeResult>;
  listAuthorizedDevices(): Promise<import("@envoymesh/api").ListAuthorizedDevicesResult>;
  revokeAuthorizedDevice(
    params: import("@envoymesh/api").RevokeAuthorizedDeviceParams,
  ): Promise<import("@envoymesh/api").RevokeAuthorizedDeviceResult>;
  mergeAuthorizedDevices(
    params: import("@envoymesh/api").MergeAuthorizedDevicesParams,
  ): Promise<import("@envoymesh/api").MergeAuthorizedDevicesResult>;
  pruneRevokedDevices(): Promise<import("@envoymesh/api").PruneRevokedDevicesResult>;
  listDeviceRevocations(): Promise<import("@envoymesh/api").ListDeviceRevocationsResult>;

  listTerminalSessions(): Promise<import("@envoymesh/api").TerminalSessionSummary[]>;
  createTerminalSession(params?: import("@envoymesh/api").CreateTerminalSessionParams): Promise<import("@envoymesh/api").TerminalSessionSummary>;
  closeTerminalSession(params: import("@envoymesh/api").CloseTerminalSessionParams): Promise<void>;
  renameTerminalSession(params: import("@envoymesh/api").RenameTerminalSessionParams): Promise<import("@envoymesh/api").TerminalSessionSummary>;
  terminalAttach(params: import("@envoymesh/api").TerminalAttachParams): Promise<import("@envoymesh/api").TerminalAttachResult>;
  terminalRunFromNaturalLanguage(
    params: import("@envoymesh/api").TerminalRunFromNaturalLanguageParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal>;
  terminalExecuteProposal(params: import("@envoymesh/api").TerminalExecuteProposalParams): Promise<void>;
  terminalSetAssistModelOverride(
    params: import("@envoymesh/api").TerminalSetAssistModelOverrideParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState>;
  terminalGetAssistState(sessionId: string): Promise<import("@envoymesh/api").TerminalAssistState>;
  terminalExplainScrollback(
    params: import("@envoymesh/api").TerminalExplainScrollbackParams,
  ): Promise<import("@envoymesh/api").TerminalExplainScrollbackResult>;
  terminalSuggestCommand(
    params: import("@envoymesh/api").TerminalSuggestCommandParams,
  ): Promise<import("@envoymesh/api").TerminalSuggestCommandResult>;
  terminalObserveStep(
    params: import("@envoymesh/api").TerminalObserveStepParams,
  ): Promise<import("@envoymesh/api").TerminalObserveStepResult>;
  terminalSetInlineSuggestEnabled(
    params: import("@envoymesh/api").TerminalSetInlineSuggestParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState>;
  terminalOpenClawPlan(
    params: import("@envoymesh/api").TerminalOpenClawPlanParams,
  ): Promise<import("@envoymesh/api").TerminalOpenClawPlanResult>;
  terminalRunPlanStep(
    params: import("@envoymesh/api").TerminalRunPlanStepParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal>;
  terminalEnablePrepareMode(
    params: import("@envoymesh/api").TerminalEnablePrepareModeParams,
  ): Promise<import("@envoymesh/api").TerminalEnablePrepareModeResult>;
  terminalWatchStep(
    params: import("@envoymesh/api").TerminalWatchStepParams,
  ): Promise<import("@envoymesh/api").TerminalWatchStepResult>;
  terminalPinContextSession(
    params: import("@envoymesh/api").TerminalPinContextSessionParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState>;
  terminalDetectFailure(
    params: import("@envoymesh/api").TerminalDetectFailureParams,
  ): Promise<import("@envoymesh/api").TerminalFailureDetection>;
  terminalSuggestFixFromFailure(
    params: import("@envoymesh/api").TerminalSuggestFixParams,
  ): Promise<import("@envoymesh/api").TerminalCommandProposal>;
  terminalStartGoalLoop(
    params: import("@envoymesh/api").TerminalStartGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult>;
  terminalAdvanceGoalLoop(
    params: import("@envoymesh/api").TerminalAdvanceGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult>;
  terminalCancelGoalLoop(
    params: import("@envoymesh/api").TerminalCancelGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState>;
  terminalClearResumeGoal(sessionId: string): Promise<import("@envoymesh/api").TerminalAssistState>;
  terminalSendContextToAssistant(
    params: import("@envoymesh/api").TerminalSendContextToAssistantParams,
  ): Promise<import("@envoymesh/api").TerminalSendContextToAssistantResult>;
  terminalUpdatePlanProgress(
    params: import("@envoymesh/api").TerminalUpdatePlanProgressParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState>;
  terminalGetScrollbackPreview(
    params: import("@envoymesh/api").TerminalGetScrollbackPreviewParams,
  ): Promise<import("@envoymesh/api").TerminalGetScrollbackPreviewResult>;
  terminalResumeGoalLoop(
    params: import("@envoymesh/api").TerminalResumeGoalLoopParams,
  ): Promise<import("@envoymesh/api").TerminalGoalLoopStepResult>;
  terminalEnableExecPane(
    params: import("@envoymesh/api").TerminalEnableExecPaneParams,
  ): Promise<import("@envoymesh/api").TerminalEnableExecPaneResult>;
  terminalSetBackgroundWatch(
    params: import("@envoymesh/api").TerminalSetBackgroundWatchParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState>;
  terminalClearBackgroundWatch(
    params: import("@envoymesh/api").TerminalClearBackgroundWatchParams,
  ): Promise<import("@envoymesh/api").TerminalAssistState>;
  openInHerdr(params?: import("@envoymesh/api").OpenInHerdrParams): Promise<import("@envoymesh/api").OpenInHerdrResult>;
  terminalGetHerdrExportHint(
    params: import("@envoymesh/api").TerminalHerdrExportHintParams,
  ): Promise<import("@envoymesh/api").TerminalHerdrExportHintResult>;
  homeTerminalWsOpen(params: import("@envoymesh/api").HomeTerminalWsOpenParams): Promise<import("@envoymesh/api").HomeTerminalWsRpcResult>;
  homeTerminalWsSend(params: import("@envoymesh/api").HomeTerminalWsSendParams): Promise<import("@envoymesh/api").HomeTerminalWsRpcResult>;
  homeTerminalWsClose(params?: import("@envoymesh/api").HomeTerminalWsCloseParams): Promise<import("@envoymesh/api").HomeTerminalWsRpcResult>;

  // AI / Knowledge Query
  knowledgeQuery(question: string): Promise<string>;
  draftAuthorContent(
    params: import("@envoymesh/api").DraftAuthorContentParams,
  ): Promise<import("@envoymesh/api").DraftAuthorContentResult>;
  runDocumentAgentTurn(message: string): Promise<import("@envoymesh/api").DocumentAgentTurnResult>;
  runOwnerAgentTurn(
    message: string,
    options?: import("@envoymesh/api").RunOwnerAgentTurnOptions,
  ): Promise<import("@envoymesh/api").OwnerAgentTurnResult>;

  // Phase 23A — AI-curated circles
  listAgentCircles(): Promise<import("@envoymesh/api").AgentCircle[]>;
  createAgentCircle(input: {
    label: string;
    memberOwnerIds: string[];
    topicTags: string[];
  }): Promise<import("@envoymesh/api").AgentCircle>;
  updateAgentCircle(
    circleId: string,
    update: { label?: string; memberOwnerIds?: string[]; topicTags?: string[]; status?: "proposed" | "active" | "declined" | "removed" },
  ): Promise<import("@envoymesh/api").AgentCircle>;
  deleteAgentCircle(circleId: string): Promise<void>;
  proposeAgentCircles(): Promise<import("@envoymesh/api").AgentCircle[]>;

  // Phase 27B — Mesh intelligence report
  generateMeshIntelligenceReport(): Promise<string>;

  // OpenClaw skill/plugin management
  getOpenClawPlugins?(): Promise<string[]>;
  searchOpenClawPlugins?(query: string): Promise<string[]>;
  getTrendingOpenClawPlugins?(): Promise<string[]>;
  installOpenClawPlugin?(name: string): Promise<{ ok: boolean; message: string }>;
  uninstallOpenClawPlugin?(name: string): Promise<{ ok: boolean; message: string }>;
  saveClawhubToken?(token: string): Promise<{ ok: boolean }>;
  saveSkillApiKeys(keys: Record<string, string>): Promise<{ ok: boolean }>;
  saveWebSearchEnabled?(enabled: boolean): Promise<{ ok: boolean }>;
  sendToOpenClaw?(text: string): Promise<void>;
  sendToAiBot?(botId: string, text: string): Promise<void>;
  getPairedDiagnostics?(): Promise<Record<string, unknown>>;

  // OpenClaw extension/plugin management
  listOpenClawExtensionPlugins?(): Promise<import("@envoymesh/api").OpenClawPluginInfo[]>;
  inspectOpenClawExtensionPlugin?(id: string): Promise<import("@envoymesh/api").OpenClawPluginDetail | null>;
  enableOpenClawExtensionPlugin?(id: string): Promise<{ ok: boolean; message: string }>;
  disableOpenClawExtensionPlugin?(id: string): Promise<{ ok: boolean; message: string }>;
  installOpenClawExtensionPlugin?(spec: string): Promise<{ ok: boolean; message: string }>;
  uninstallOpenClawExtensionPlugin?(id: string): Promise<{ ok: boolean; message: string }>;
  updateOpenClawExtensionPlugin?(id: string): Promise<{ ok: boolean; message: string }>;

  // Phase 9-style data wipe
  clearAllUserData(): Promise<void>;

  // Shared vault library
  listLibraryItems(params?: ListLibraryItemsParams): Promise<LibraryItem[]>;
  listAllLocalFiles(params?: ListAllLocalFilesParams): Promise<ListAllLocalFilesResult>;
  readLocalFileContent(params: ReadLocalFileContentParams): Promise<ReadLibraryItemContentResult>;
  openLocalFile(params: OpenLocalFileParams): Promise<void>;
  setLibraryItemPublished(documentId: string, published: boolean): Promise<void>;
  exportLibraryItemToIpfs(documentId: string): Promise<ExportLibraryItemToIpfsResult>;
  pinLibraryItemExternal(documentId: string): Promise<import("@envoymesh/api").PinLibraryItemExternalResult>;
  getIpfsEngineStatus(): Promise<IpfsEngineStatus>;
  getRagIndexStatus(): Promise<RagIndexStatus>;
  reindexRagKnowledge(params?: { force?: boolean }): Promise<RagIndexStatus>;
  testRagEmbedding(): Promise<import("@envoymesh/api").RagEmbeddingProbeResult>;
  testChatModel(): Promise<import("@envoymesh/api").ChatModelProbeResult>;
  verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult>;
  importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult>;
  convertLibraryItemToMarkdown(
    params: import("@envoymesh/api").ConvertLibraryItemToMarkdownParams,
  ): Promise<import("@envoymesh/api").ConvertLibraryItemToMarkdownResult>;
  saveExternalMcpSearchAsNote(
    params: import("@envoymesh/api").SaveExternalMcpSearchAsNoteParams,
  ): Promise<import("@envoymesh/api").SaveExternalMcpSearchAsNoteResult>;
  listExternalMcpKnowledge(
    params?: import("@envoymesh/api").ListExternalMcpKnowledgeParams,
  ): Promise<import("@envoymesh/api").ListExternalMcpKnowledgeResult>;
  importLinkedObsidianNotes(
    params: import("@envoymesh/api").ImportLinkedObsidianNotesParams,
  ): Promise<import("@envoymesh/api").ImportLinkedObsidianNotesResult>;
  importExternalMcpKnowledge(
    params: import("@envoymesh/api").ImportExternalMcpKnowledgeParams,
  ): Promise<import("@envoymesh/api").ImportExternalMcpKnowledgeResult>;
  exportNotesToLinkedObsidian(
    params: import("@envoymesh/api").ExportNotesToLinkedObsidianParams,
  ): Promise<import("@envoymesh/api").ExportNotesToLinkedObsidianResult>;
  exportNotesToMcp(
    params: import("@envoymesh/api").ExportNotesToMcpParams,
  ): Promise<import("@envoymesh/api").ExportNotesToMcpResult>;
  createNote(params: CreateNoteParams): Promise<CreateNoteResult>;
  deleteVaultItem(params: DeleteVaultItemParams): Promise<void>;
  listKbPlugins(params?: ListKbPluginsParams): Promise<KbPluginInfo[]>;
  activateKbPlugin(params: ActivateKbPluginParams): Promise<{ ok: boolean; reason?: string }>;
  deactivateKbPlugin(params: DeactivateKbPluginParams): Promise<{ ok: boolean; reason?: string }>;
  getKbPluginConfig(pluginId: string): Promise<Record<string, unknown>>;
  updateKbPluginConfig(params: UpdateKbPluginConfigParams): Promise<{ ok: boolean; reason?: string }>;
  resolveLibraryItemPath(relativePath: string): Promise<{ vaultRelativePath: string; absolutePath: string }>;
  openLibraryItem(relativePath: string): Promise<void>;
  revealLibraryItemInFileManager(relativePath: string): Promise<void>;
  discoverPublishedLibrary(params?: DiscoverPublishedLibraryParams): Promise<DiscoverPublishedLibraryPeerResult[]>;
  listAgentShareProposals(): Promise<AgentShareProposal[]>;
  dismissAgentShareProposal(proposalId: string): Promise<void>;
  submitAgentShareProposal(
    params: SubmitAgentShareProposalParams,
  ): Promise<AgentShareProposal>;
  listPendingShareOffers(): Promise<ShareOffer[]>;
  shareFile(
    targetOwnerId: string,
    file: {
      path: string;
      sensitivity: "public" | "friends" | "private";
      deliveryChannel?: "inbox" | "chat";
    },
  ): Promise<void>;
  acceptShare(shareId: string, savePath: string): Promise<void>;
  declineShare(shareId: string): Promise<void>;

  // Node Configuration
  getNodeConfig(): Promise<NodeConfig>;
  updateNodeConfig(config: Partial<NodeConfig>): Promise<void>;
  getSetupSponsorFriendConfig(): Promise<import("@envoymesh/api").ResolvedSetupSponsorFriend>;
  getSetupSponsorFriendStatus(): Promise<import("@envoymesh/api").SetupSponsorFriendStatus>;
  runSetupSponsorFriend(input?: {
    forceBypassGuards?: boolean;
  }): Promise<import("@envoymesh/api").RunSetupSponsorFriendResult>;
  listRelays(): Promise<RelayConfig[]>;
  addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig>;
  removeRelay(relayId: string): Promise<void>;

  // Node Lifecycle
  initNode(profileDir: string, options?: InitNodeOptions): Promise<NodeInitResult>;
  getNodeStatus(): Promise<{ status: NodeStatus }>;
  startNode(): Promise<void>;
  stopNode(): Promise<void>;
  waitForConnection(timeoutMs?: number): Promise<void>;

  // Events
  on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void;

  // Phase 38 — Voice/Video Calls
  getActiveCall(): import("@envoymesh/api").CallSession | null;
  onCallEvent(handler: (event: import("@envoymesh/api").CallEvent) => void): () => void;
  sendCallInvite(
    targetOwnerId: string,
    sdpOffer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
    callType?: import("@envoymesh/api").CallMediaType,
  ): Promise<string | null>;
  sendCallReinvite(
    callId: string,
    sdpOffer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
    reason?: "path1_timeout" | "path1_failed",
  ): Promise<boolean>;
  acceptCallInvite(
    callId: string,
    sdpAnswer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
  ): Promise<boolean>;
  declineCallInvite(callId: string, reason: string): Promise<boolean>;
  endCall(callId: string): Promise<boolean>;
  setCallMuted(callId: string, muted: boolean): Promise<boolean>;
  sendIceCandidate(
    callId: string,
    candidate: {
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;
      usernameFragment?: string | null;
    },
  ): Promise<boolean>;
}

const NodeServiceContext = createContext<NodeServiceClient | null>(null);

type TerminalSessionsContextValue = {
  sessions: import("@envoymesh/api").TerminalSessionSummary[];
  refresh: () => Promise<void>;
};

const TerminalSessionsContext = createContext<TerminalSessionsContextValue | null>(null);

/** True when WebSocket/mobile transport is up (daemon may still be stopped). Separate from mesh "online". */
const TransportWsContext = createContext(false);

export function useTransportWsOpen(): boolean {
  return useContext(TransportWsContext);
}

/** Mobile shell only exposes cloud-friendly provider modes in Settings; desktop uses full. */
export type ModelProviderUiScope = "full" | "cloud-only";

const ModelProviderUiScopeContext = createContext<ModelProviderUiScope>("full");

export function useModelProviderUiScope(): ModelProviderUiScope {
  return useContext(ModelProviderUiScopeContext);
}

type WsClientType = ReturnType<typeof createWsClient>;

export interface DesktopConnectionPrefs {
  wsUrl: string;
  autoConnect: boolean;
}

const DesktopConnectionPrefsContext = createContext<{
  updatePrefs: (patch: Partial<DesktopConnectionPrefs>) => void;
} | null>(null);

/** Sync App-tab connection settings into the WebSocket client (desktop only). */
export function useDesktopConnectionPrefsSync() {
  return useContext(DesktopConnectionPrefsContext);
}

/** Build a NodeServiceClient that talks to a local WsServer via WebSocket (desktop). */
function createWsNodeServiceClient(
  wsUrl: string,
  connectCb: (connected: boolean) => void,
  readyCb: (ready: boolean) => void,
  autoConnect: boolean,
): { client: NodeServiceClient; wsClient: WsClientType } {
  const wsClient = createWsClient(wsUrl);
  wsClient.setAutoReconnectEnabled(autoConnect);
  let connected = false;
  let readyReceived = false;

  // Subscribe to persistent connection status changes (handles reconnects)
  wsClient.onStatusChange((status) => {
    const isConnected = status === 'connected';
    connected = isConnected;
    connectCb(isConnected);
    if (!isConnected) {
      readyReceived = false;
      readyCb(false);
    }
  });

  const client: NodeServiceClient = {
    get isConnected() { return connected; },
    get isReady() { return readyReceived; },
    get reconnectAttempts() { return wsClient.getReconnectAttempts(); },

    async connect() {
      await wsClient.connect();
      connectCb(wsClient.isConnected());
    },

    disconnect() {
      wsClient.disconnect();
      // Status callback handles connectCb/readyCb via onStatusChange
    },

    async reconnect() {
      await wsClient.reconnectTo();
    },

    async getProfile() { return wsClient.rpc("getProfile"); },
    async getOwnerDidPresentation() { return wsClient.rpc("getOwnerDidPresentation"); },
    async resolveDidImport(input: string) {
      return wsClient.rpc("resolveDidImport", { input }) as Promise<import("@envoymesh/api").ResolveDidImportResult>;
    },
    async cacheDidContactKey(params: { ownerId: string; publicKeyPem: string }) {
      return wsClient.rpc("cacheDidContactKey", params) as Promise<{ ok: boolean; reason?: string }>;
    },
    async getPeerReputationSummary(peerOwnerId: string) {
      return wsClient.rpc("getPeerReputationSummary", { peerOwnerId }) as Promise<
        import("@envoymesh/api").PeerReputationSummary
      >;
    },
    async getHumanProfile() { return wsClient.rpc("getHumanProfile"); },
    async updateHumanProfile(input: CreateHumanProfileInput) { return wsClient.rpc("updateHumanProfile", input as unknown as Record<string, unknown>); },
    async setPublicProfileThumbnail(params) {
      return wsClient.rpc("setPublicProfileThumbnail", params as unknown as Record<string, unknown>);
    },
    async upsertProfileGalleryPhoto(params) {
      return wsClient.rpc("upsertProfileGalleryPhoto", params as unknown as Record<string, unknown>);
    },
    async removeProfileGalleryPhoto(params) {
      return wsClient.rpc("removeProfileGalleryPhoto", params);
    },
    async updateProfileGalleryPhotoVisibility(params) {
      return wsClient.rpc("updateProfileGalleryPhotoVisibility", params as unknown as Record<string, unknown>);
    },
    async getPeerProfile(ownerId: string) {
      return wsClient.rpc("getPeerProfile", { ownerId }) as Promise<
        import("@envoymesh/api").PeerProfileView | undefined
      >;
    },
    async listPeerProfiles() {
      return wsClient.rpc("listPeerProfiles") as Promise<import("@envoymesh/api").PeerProfileView[]>;
    },
    async requestPeerProfile(ownerId: string) {
      return wsClient.rpc("requestPeerProfile", { ownerId }) as Promise<{ ok: boolean; reason?: string }>;
    },
    async syncProfileToBonds() {
      await wsClient.rpc("syncProfileToBonds");
    },
    async refreshBondPeerProfiles() {
      return wsClient.rpc("refreshBondPeerProfiles") as Promise<{ requested: number; failed: number }>;
    },
    async getAgentIdentity() { return wsClient.rpc("getAgentIdentity"); },
    async updateAgentIdentity(content: string) { return wsClient.rpc("updateAgentIdentity", { content }); },
    async sendHello(targetOwnerId: string, profile: HelloProfile, message: string, options?: SendHelloOptions) {
      // sendHello does a real libp2p dial + envelope delivery (same as
      // sendChat), which routinely exceeds the WS RPC default 30s budget.
      // Bump to 120s to match sendChat / sendAgentChat — otherwise peers on
      // WAN / behind NAT trip the default timeout and the user only sees a
      // silent `console.error` (InboxView / SearchView catch and swallow).
      return wsClient.rpc("sendHello", {
        targetOwnerId,
        profile,
        message,
        ...(options?.introProposalMessageId
          ? { introProposalMessageId: options.introProposalMessageId }
          : {}),
      }, { timeoutMs: 120_000 });
    },
    async acceptHello(messageId: string) {
      // Same dial budget rationale as sendHello — acceptHello sends a
      // bond.accept envelope back to the requester over libp2p.
      return wsClient.rpc("acceptHello", { messageId }, { timeoutMs: 120_000 });
    },
    async declineHello(messageId: string, reason?: string) {
      return wsClient.rpc("declineHello", { messageId, reason }, { timeoutMs: 30_000 });
    },
    async listPendingSocialIntroProposals() {
      return wsClient.rpc("listPendingSocialIntroProposals") as Promise<SocialIntroProposal[]>;
    },
    async approveSocialIntroCommitment(messageId: string) {
      return wsClient.rpc("approveSocialIntroCommitment", { messageId }) as Promise<{ ownerCommitmentRef: string }>;
    },
    async declineSocialIntroProposal(messageId: string) {
      return wsClient.rpc("declineSocialIntroProposal", { messageId });
    },
    async blockPeer(peerOwnerId: string) { return wsClient.rpc("blockPeer", { peerOwnerId }); },
    async unblockPeer(peerOwnerId: string) { return wsClient.rpc("unblockPeer", { peerOwnerId }); },
    async revokeBond(peerOwnerId: string) { return wsClient.rpc("revokeBond", { peerOwnerId }); },
    async getBonds() { return wsClient.rpc("getBonds"); },
    async sendChat(
      targetOwnerId: string,
      text: string,
      attachments?: SendChatParams["attachments"],
      listingId?: string,
    ) {
      return wsClient.rpc(
        "sendChat",
        {
          targetOwnerId,
          text,
          ...(attachments ? { attachments } : {}),
          ...(listingId ? { listingId } : {}),
        },
        { timeoutMs: 120_000 },
      );
    },
    async sendAgentChat(targetOwnerId: string, text: string) {
      return wsClient.rpc("sendAgentChat", { targetOwnerId, text }, { timeoutMs: 120_000 });
    },
    async sendChatAttachment(params: SendChatAttachmentParams) {
      return wsClient.rpc("sendChatAttachment", params as unknown as Record<string, unknown>, {
        timeoutMs: 300_000,
      }) as Promise<SendChatAttachmentResult>;
    },
    async readLibraryItemContent(params: ReadLibraryItemContentParams) {
      return wsClient.rpc("readLibraryItemContent", params as unknown as Record<string, unknown>) as Promise<
        ReadLibraryItemContentResult
      >;
    },
    // Phase 45 — Web Content Browsing. See docs/web-content-browsing-design.md §4.6.
    async libraryRead(params: LibraryReadParams) {
      return wsClient.rpc("libraryRead", params as unknown as Record<string, unknown>) as Promise<
        LibraryReadResult
      >;
    },
    async publishWebContentEntry(params: import("@envoymesh/api").PublishWebContentParams) {
      return wsClient.rpc(
        "publishWebContentEntry",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").PublishWebContentResult>;
    },
    async ensureDefaultWebSite() {
      return wsClient.rpc("ensureDefaultWebSite") as Promise<
        import("@envoymesh/api").EnsureDefaultWebSiteResult
      >;
    },
    async listWebContentSections() {
      return wsClient.rpc("listWebContentSections") as Promise<
        import("@envoymesh/api").WebContentSectionSummary[]
      >;
    },
    async listFeedPosts() {
      return wsClient.rpc("listFeedPosts") as Promise<import("@envoymesh/api").FeedPostSummary[]>;
    },
    async listFeedTimeline(params?: import("@envoymesh/api").ListFeedTimelineParams) {
      return wsClient.rpc(
        "listFeedTimeline",
        (params ?? {}) as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ListFeedTimelineResult>;
    },
    async listBlogPosts() {
      return wsClient.rpc("listBlogPosts") as Promise<import("@envoymesh/api").BlogPostSummary[]>;
    },
    async deleteWebContentEntry(params: import("@envoymesh/api").DeleteWebContentParams) {
      return wsClient.rpc(
        "deleteWebContentEntry",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").DeleteWebContentResult>;
    },
    async listFeedNotifications() {
      return wsClient.rpc("listFeedNotifications") as Promise<import("@envoymesh/api").FeedNotification[]>;
    },
    async dismissFeedNotification(id: string) {
      return wsClient.rpc("dismissFeedNotification", { id });
    },
    async dismissAllFeedNotifications() {
      return wsClient.rpc("dismissAllFeedNotifications", {});
    },
    async listContentEngageNotifications() {
      return wsClient.rpc("listContentEngageNotifications") as Promise<
        import("@envoymesh/api").ContentEngageNotification[]
      >;
    },
    async dismissContentEngageNotifications(params) {
      return wsClient.rpc(
        "dismissContentEngageNotifications",
        (params ?? {}) as Record<string, unknown>,
      );
    },
    async getContentEngagement(params) {
      return wsClient.rpc(
        "getContentEngagement",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ContentEngagementSummary>;
    },
    async toggleContentStar(params) {
      return wsClient.rpc(
        "toggleContentStar",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ContentEngagementSummary>;
    },
    async addContentComment(params) {
      return wsClient.rpc(
        "addContentComment",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ContentEngagementSummary>;
    },
    async removeContentComment(params) {
      return wsClient.rpc(
        "removeContentComment",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ContentEngagementSummary>;
    },
    async listChatHistory(peerOwnerId: string, limit?: number) { return wsClient.rpc("listChatHistory", { peerOwnerId, limit }) as Promise<ChatMessage[]>; },
    async listChatRooms() { return wsClient.rpc("listChatRooms", {}) as Promise<ChatRoom[]>; },
    async createChatRoom(title: string, memberOwnerIds: string[]) {
      return wsClient.rpc("createChatRoom", { title, memberOwnerIds }) as Promise<ChatRoom>;
    },
    async inviteToChatRoom(roomId: string, memberOwnerIds: string[]) {
      return wsClient.rpc("inviteToChatRoom", { roomId, memberOwnerIds }) as Promise<ChatRoom>;
    },
    async leaveChatRoom(roomId: string) {
      return wsClient.rpc("leaveChatRoom", { roomId }) as Promise<void>;
    },
    async removeMembersFromChatRoom(roomId: string, memberOwnerIds: string[]) {
      return wsClient.rpc("removeMembersFromChatRoom", { roomId, memberOwnerIds }) as Promise<ChatRoom>;
    },
    async renameChatRoom(roomId: string, title: string) {
      return wsClient.rpc("renameChatRoom", { roomId, title }) as Promise<ChatRoom>;
    },
    async dismissChatRoom(roomId: string) {
      return wsClient.rpc("dismissChatRoom", { roomId }) as Promise<void>;
    },
    async sendChatRoomMessage(roomId: string, text: string) {
      return wsClient.rpc("sendChatRoomMessage", { roomId, text }) as Promise<SendChatResult>;
    },
    async sendChatRoomAttachment(params: import("@envoymesh/api").SendChatRoomAttachmentParams) {
      return wsClient.rpc("sendChatRoomAttachment", params as unknown as Record<string, unknown>);
    },
    async listAgentActivity(params?: import("@envoymesh/api").ListAgentActivityParams) {
      return wsClient.rpc("listAgentActivity", (params ?? {}) as Record<string, unknown>) as Promise<
        import("@envoymesh/api").AgentActivityRecord[]
      >;
    },
    async listCommerceReceipts(params?: import("@envoymesh/api").ListCommerceReceiptsParams) {
      return wsClient.rpc("listCommerceReceipts", (params ?? {}) as Record<string, unknown>) as Promise<
        import("@envoymesh/api").CommerceReceiptRecord[]
      >;
    },
    async recordCommerceReceipt(params: import("@envoymesh/api").RecordCommerceReceiptParams) {
      return wsClient.rpc("recordCommerceReceipt", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").CommerceReceiptRecord
      >;
    },
    async listAuditEvents(params?: import("@envoymesh/api").ListAuditEventsParams) {
      return wsClient.rpc("listAuditEvents", (params ?? {}) as Record<string, unknown>) as Promise<
        import("@envoymesh/api").AuditEventSummary[]
      >;
    },
    async listTaskJournalEntries(params?: import("@envoymesh/api").ListTaskJournalParams) {
      return wsClient.rpc("listTaskJournalEntries", (params ?? {}) as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TaskJournalSummary[]
      >;
    },
    async getCostSummary(params?: import("@envoymesh/api").GetCostSummaryParams) {
      return wsClient.rpc("getCostSummary", (params ?? {}) as Record<string, unknown>) as Promise<
        import("@envoymesh/api").CostSummary
      >;
    },
    async runCostRollupRetention() {
      return wsClient.rpc("runCostRollupRetention") as Promise<{ collapsed: number; dropped: number }>;
    },
    async listAgentCards() {
      return wsClient.rpc("listAgentCards") as Promise<import("@envoymesh/api").CachedAgentCardSummary[]>;
    },
    async getLocalAgentNetworkWorkerCard() {
      return wsClient.rpc("getLocalAgentNetworkWorkerCard") as Promise<
        import("@envoymesh/api").CachedAgentCardSummary | undefined
      >;
    },
    async getAgentCard(ownerId: string) {
      return wsClient.rpc("getAgentCard", { ownerId }) as Promise<
        import("@envoymesh/api").CachedAgentCardSummary | undefined
      >;
    },
    async requestAgentCard(targetOwnerId: string) {
      return wsClient.rpc("requestAgentCard", { targetOwnerId }) as Promise<{ ok: boolean; error?: string }>;
    },
    async refreshAgentNetworkWorkers() {
      return wsClient.rpc("refreshAgentNetworkWorkers") as Promise<{ requested: number; failed: number }>;
    },
    async ensureFleetWorkersJoinAndLease(params) {
      return wsClient.rpc("ensureFleetWorkersJoinAndLease", params ?? {}) as Promise<
        import("@envoymesh/api").EnsureFleetWorkersResult
      >;
    },
    async getTaskResult(taskId: string) {
      return wsClient.rpc("getTaskResult", { taskId }) as Promise<
        import("@envoymesh/api").TaskResultPayload | undefined
      >;
    },
    async listPendingApprovals() {
      return wsClient.rpc("listPendingApprovals") as Promise<import("@envoymesh/api").PendingApprovalSummary[]>;
    },
    async approvePendingApproval(itemId: string, notes?: string) {
      return wsClient.rpc("approvePendingApproval", { itemId, notes }) as Promise<
        import("@envoymesh/api").ApprovePendingApprovalResult
      >;
    },
    async rejectPendingApproval(itemId: string, notes?: string) {
      return wsClient.rpc("rejectPendingApproval", { itemId, notes }) as Promise<{ ok: boolean; error?: string }>;
    },
    async deleteChatMessage(peerOwnerId: string, messageId: string) { return wsClient.rpc("deleteChatMessage", { peerOwnerId, messageId }) as Promise<{ ok: boolean }>; },
    async clearChatHistory(peerOwnerId: string) { return wsClient.rpc("clearChatHistory", { peerOwnerId }) as Promise<{ deletedCount: number }>; },
    async getChatDrafts(threadPeerOwnerId?: string) {
      return wsClient.rpc("getChatDrafts", threadPeerOwnerId ? { threadPeerOwnerId } : {}) as Promise<ChatDraft[]>;
    },
    async deleteChatDraft(draftId: string) { return wsClient.rpc("deleteChatDraft", { draftId }); },
    async searchPeers(query: SearchQuery) { return wsClient.rpc("searchPeers", query as unknown as Record<string, unknown>); },
    async getNearbyDiscoveredPeers() {
      return wsClient.rpc("getNearbyDiscoveredPeers", {}) as Promise<import("@envoymesh/api").PeerSearchResult[]>;
    },
    async refreshNearbyDiscovery() {
      return wsClient.rpc("refreshNearbyDiscovery", {}) as Promise<{
        peered: number;
        resolved: number;
        unreachable: number;
      }>;
    },
    async runCapabilityDiscovery(params?: { find?: boolean }) {
      return wsClient.rpc("runCapabilityDiscovery", params ?? {});
    },
    async getNodeConfig() { return wsClient.rpc("getNodeConfig"); },
    async getConnectionStatus() { return wsClient.rpc("getConnectionStatus"); },
    async getPeerConnectionInfo(peerOwnerId: string) { return wsClient.rpc("getPeerConnectionInfo", { peerOwnerId }); },
    async warmContactConnection(peerOwnerId: string, options?: { redial?: boolean; verifyOnly?: boolean; upgradeRelayToDirect?: boolean; keepAlive?: boolean; verifyConnection?: boolean; force?: boolean }) {
      return wsClient.rpc(
        "warmContactConnection",
        {
          peerOwnerId,
          ...(options?.redial ? { redial: true } : {}),
          ...(options?.verifyOnly ? { verifyOnly: true } : {}),
          ...(options?.upgradeRelayToDirect ? { upgradeRelayToDirect: true } : {}),
          ...(options?.keepAlive ? { keepAlive: true } : {}),
          ...(options?.verifyConnection ? { verifyConnection: true } : {}),
          ...(options?.force ? { force: true } : {}),
        },
        { timeoutMs: 90_000 },
      );
    },
    async getChatDiagnostics(peerOwnerId?: string) {
      return wsClient.rpc("getChatDiagnostics", peerOwnerId ? { peerOwnerId } : {});
    },
    async getConnectivityDiagnostics() {
      return wsClient.rpc("getConnectivityDiagnostics", {}) as Promise<ConnectivityDiagnostics>;
    },
    async getCircuitReservationStatus() {
      return wsClient.rpc("getCircuitReservationStatus", {}) as Promise<CircuitReservationStatus>;
    },
    // Phase 40 — chain RPCs
    async chainPlan(params: ChainPlanParams) {
      // LLM plan+assign often exceeds the default 30s RPC budget.
      return wsClient.rpc("chainPlan", (params ?? {}) as unknown as Record<string, unknown>, {
        timeoutMs: 120_000,
      }) as unknown as Promise<ChainPlanResult>;
    },
    async chainLaunch(params: ChainLaunchParams) {
      return wsClient.rpc("chainLaunch", params as unknown as Record<string, unknown>) as unknown as Promise<ChainLaunchResult>;
    },
    async chainGetState(params: ChainGetStateParams) {
      return wsClient.rpc("chainGetState", params as unknown as Record<string, unknown>) as unknown as Promise<ChainGetStateResult>;
    },
    async chainGetStepProvenance(params: import("@envoymesh/api").ChainGetStepProvenanceParams) {
      return wsClient.rpc(
        "chainGetStepProvenance",
        params as unknown as Record<string, unknown>,
      ) as unknown as Promise<import("@envoymesh/api").ChainGetStepProvenanceResult>;
    },
    async chainListActive(params?: ChainListActiveParams) {
      return wsClient.rpc("chainListActive", (params ?? {}) as unknown as Record<string, unknown>) as unknown as Promise<ChainListActiveResult>;
    },
    async chainListObserved(params?: import("@envoymesh/api").ChainListObservedParams) {
      return wsClient.rpc(
        "chainListObserved",
        (params ?? {}) as unknown as Record<string, unknown>,
      ) as unknown as Promise<import("@envoymesh/api").ChainListObservedResult>;
    },
    async chainCancel(params: ChainCancelParams) {
      return wsClient.rpc("chainCancel", params as unknown as Record<string, unknown>) as unknown as Promise<ChainCancelResult>;
    },
    async chainReclaimAssigner(params: import("@envoymesh/api").ChainReclaimAssignerParams) {
      return wsClient.rpc(
        "chainReclaimAssigner",
        params as unknown as Record<string, unknown>,
      ) as unknown as Promise<import("@envoymesh/api").ChainReclaimAssignerResult>;
    },
    async chainCancelDelegated(params: import("@envoymesh/api").ChainCancelDelegatedParams) {
      return wsClient.rpc(
        "chainCancelDelegated",
        params as unknown as Record<string, unknown>,
      ) as unknown as Promise<import("@envoymesh/api").ChainCancelDelegatedResult>;
    },
    async chainReassignSubtask(params: import("@envoymesh/api").ChainReassignSubtaskParams) {
      return wsClient.rpc("chainReassignSubtask", params as unknown as Record<string, unknown>) as unknown as Promise<
        import("@envoymesh/api").ChainReassignSubtaskResult
      >;
    },
    async chainRetryInputDelivery(params: import("@envoymesh/api").ChainRetryInputDeliveryParams) {
      return wsClient.rpc("chainRetryInputDelivery", params as unknown as Record<string, unknown>) as unknown as Promise<
        import("@envoymesh/api").ChainRetryInputDeliveryResult
      >;
    },
    async chainListReports(params?: ChainListReportsParams) {
      return wsClient.rpc("chainListReports", (params ?? {}) as unknown as Record<string, unknown>) as unknown as Promise<ChainListReportsResult>;
    },
    async chainGetReport(params: ChainGetReportParams) {
      return wsClient.rpc("chainGetReport", params as unknown as Record<string, unknown>) as unknown as Promise<ChainGetReportResult>;
    },
    async chainPinReport(params: ChainPinReportParams) {
      return wsClient.rpc("chainPinReport", params as unknown as Record<string, unknown>) as unknown as Promise<ChainPinReportResult>;
    },
    async chainDeleteReport(params: ChainDeleteReportParams) {
      return wsClient.rpc("chainDeleteReport", params as unknown as Record<string, unknown>) as unknown as Promise<ChainDeleteReportResult>;
    },
    async chainSetBidStrategy(params: ChainSetBidStrategyParams) {
      return wsClient.rpc("chainSetBidStrategy", params as unknown as Record<string, unknown>) as unknown as Promise<ChainSetBidStrategyResult>;
    },
    async chainGetBidStrategy(params: ChainGetBidStrategyParams) {
      return wsClient.rpc("chainGetBidStrategy", params as unknown as Record<string, unknown>) as unknown as Promise<ChainGetBidStrategyResult>;
    },
    async chainEvaluateBids(params: ChainEvaluateBidsParams) {
      return wsClient.rpc("chainEvaluateBids", params as unknown as Record<string, unknown>) as unknown as Promise<ChainEvaluateBidsResult>;
    },
    async chainCounterBid(params: ChainCounterBidParams) {
      return wsClient.rpc("chainCounterBid", params as unknown as Record<string, unknown>) as unknown as Promise<ChainCounterBidResult>;
    },
    async chainRebalance(params: ChainRebalanceParams) {
      return wsClient.rpc("chainRebalance", params as unknown as Record<string, unknown>) as unknown as Promise<ChainRebalanceResult>;
    },
    async chainGetDefaults(params: ChainGetDefaultsParams) {
      return wsClient.rpc("chainGetDefaults", params as unknown as Record<string, unknown>) as unknown as Promise<ChainGetDefaultsResult>;
    },
    async chainSetDefaults(params: ChainSetDefaultsParams) {
      return wsClient.rpc("chainSetDefaults", params as unknown as Record<string, unknown>) as unknown as Promise<ChainSetDefaultsResult>;
    },
    async chainPreviewGoal(params: ChainPreviewGoalParams) {
      // Preview runs modelProviders plan+assign; MiniMax/OpenAI often need >30s.
      return wsClient.rpc("chainPreviewGoal", params as unknown as Record<string, unknown>, {
        timeoutMs: 120_000,
      }) as unknown as Promise<ChainPreviewGoalResult>;
    },
    async agentNetworkDiagnosticsSnapshot() {
      return wsClient.rpc("agentNetworkDiagnosticsSnapshot", {}) as Promise<
        import("@envoymesh/api").AgentNetworkDiagnosticsSnapshot
      >;
    },
    async agentNetworkSimulate(params: import("@envoymesh/api").AgentNetworkSimulationParams) {
      return wsClient.rpc("agentNetworkSimulate", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").AgentNetworkSimulationResult
      >;
    },
    async agentNetworkExportDiagnostics(params: { simulationId?: string }) {
      return wsClient.rpc(
        "agentNetworkExportDiagnostics",
        (params ?? {}) as unknown as Record<string, unknown>,
      ) as Promise<{ json: string }>;
    },
    async chainStartFromGoal(params: ChainStartFromGoalParams) {
      return wsClient.rpc("chainStartFromGoal", params as unknown as Record<string, unknown>, {
        timeoutMs: 180_000,
      }) as unknown as Promise<ChainStartFromGoalResult>;
    },
    async chainProbeReachability(params: ChainProbeReachabilityParams) {
      return wsClient.rpc("chainProbeReachability", params as unknown as Record<string, unknown>) as unknown as Promise<ChainProbeReachabilityResult>;
    },
    async chainResolveIteration(params: import("@envoymesh/api").ChainResolveIterationParams) {
      return wsClient.rpc("chainResolveIteration", params as unknown as Record<string, unknown>) as unknown as Promise<
        import("@envoymesh/api").ChainResolveIterationResult
      >;
    },
    async chainResolveSpeculation(params: import("@envoymesh/api").ChainResolveSpeculationParams) {
      return wsClient.rpc("chainResolveSpeculation", params as unknown as Record<string, unknown>) as unknown as Promise<
        import("@envoymesh/api").ChainResolveSpeculationResult
      >;
    },
    async chainExportCosts(params: ChainExportCostsParams) {
      return wsClient.rpc("chainExportCosts", params as unknown as Record<string, unknown>) as unknown as Promise<ChainExportCostsResult>;
    },
    async chainListRecipes(params?: ChainListRecipesParams) {
      return wsClient.rpc("chainListRecipes", (params ?? {}) as unknown as Record<string, unknown>) as unknown as Promise<ChainListRecipesResult>;
    },
    async chainSaveRecipe(params: ChainSaveRecipeParams) {
      return wsClient.rpc("chainSaveRecipe", params as unknown as Record<string, unknown>) as unknown as Promise<ChainSaveRecipeResult>;
    },
    async chainDeleteRecipe(params: ChainDeleteRecipeParams) {
      return wsClient.rpc("chainDeleteRecipe", params as unknown as Record<string, unknown>) as unknown as Promise<ChainDeleteRecipeResult>;
    },
    async discoverCapabilityTopic(params: {
      topic: string;
      maxResults?: number;
      followUpDiscovery?: boolean;
    }) {
      return wsClient.rpc("discoverCapabilityTopic", params as unknown as Record<string, unknown>) as Promise<
        DiscoverCapabilityTopicResult
      >;
    },
    async getMorningReport(params?: { limit?: number }) {
      return wsClient.rpc("getMorningReport", params ?? {}) as Promise<MorningReportEntry[]>;
    },
    async requestMultiHopDiscovery(params) {
      return wsClient.rpc("requestMultiHopDiscovery", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").RequestMultiHopDiscoveryResult
      >;
    },
    async getMultiHopDiscoverySession(correlationId: string) {
      return wsClient.rpc("getMultiHopDiscoverySession", { correlationId }) as Promise<
        import("@envoymesh/api").MultiHopDiscoverySessionView | undefined
      >;
    },
    async sendSyncStateUpdate(params) {
      return wsClient.rpc("sendSyncStateUpdate", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").SendSyncStateUpdateResult
      >;
    },
    // Phase 38 — Voice/Video Calls
    getActiveCall() { return null; }, // call state flows via onCallEvent push events
    onCallEvent(handler: (event: import("@envoymesh/api").CallEvent) => void) {
      const callEventTypes = [
        "call:incoming",
        "call:reinvite",
        "call:answered",
        "call:rejected",
        "call:ended",
        "call:remote-mute",
        "call:ice-candidate",
        "call:error",
      ] as const;
      const unsubs = callEventTypes.map((eventType) =>
        wsClient.on(eventType, (data) => {
          handler({ type: eventType, ...(data as object) } as import("@envoymesh/api").CallEvent);
        }),
      );
      return () => {
        for (const unsub of unsubs) unsub();
      };
    },
    async sendCallInvite(
      targetOwnerId: string,
      sdpOffer: string,
      iceServers?: { urls: string; username?: string; credential?: string }[],
      callType?: import("@envoymesh/api").CallMediaType,
    ) {
      return wsClient.rpc("sendCallInvite", {
        targetOwnerId,
        sdpOffer,
        iceServers,
        callType,
      }) as Promise<string | null>;
    },
    async sendCallReinvite(
      callId: string,
      sdpOffer: string,
      iceServers?: { urls: string; username?: string; credential?: string }[],
      reason?: "path1_timeout" | "path1_failed",
    ) {
      return wsClient.rpc("sendCallReinvite", {
        callId,
        sdpOffer,
        iceServers,
        reason,
      }) as Promise<boolean>;
    },
    async acceptCallInvite(
      callId: string,
      sdpAnswer: string,
      iceServers?: { urls: string; username?: string; credential?: string }[],
    ) {
      return wsClient.rpc("acceptCallInvite", {
        callId,
        sdpAnswer,
        iceServers,
      }) as Promise<boolean>;
    },
    async declineCallInvite(callId: string, reason: string) {
      return wsClient.rpc("declineCallInvite", { callId, reason }) as Promise<boolean>;
    },
    async endCall(callId: string) {
      return wsClient.rpc("endCall", { callId }) as Promise<boolean>;
    },
    async setCallMuted(callId: string, muted: boolean) {
      return wsClient.rpc("setCallMuted", { callId, muted }) as Promise<boolean>;
    },
    async sendIceCandidate(
      callId: string,
      candidate: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
        usernameFragment?: string | null;
      },
    ) {
      return wsClient.rpc("sendIceCandidate", { callId, candidate }) as Promise<boolean>;
    },

    async getBridgeStatus() { return wsClient.rpc("getBridgeStatus"); },
    async getOpenClawStatus() {
      return wsClient.rpc("getOpenClawStatus") as Promise<import("@envoymesh/api").OpenClawStatus>;
    },
    async probeExtAgent(params?: import("@envoymesh/api").ProbeExtAgentParams) {
      return wsClient.rpc(
        "probeExtAgent",
        (params ?? {}) as Record<string, unknown>,
        { timeoutMs: 5_000 },
      ) as Promise<import("@envoymesh/api").ExtAgentReachability>;
    },
    async getExtAgentCommandCatalog(
      params?: import("@envoymesh/api").GetExtAgentCommandCatalogParams,
    ) {
      return wsClient.rpc(
        "getExtAgentCommandCatalog",
        (params ?? {}) as Record<string, unknown>,
        { timeoutMs: 5_000 },
      ) as Promise<import("@envoymesh/api").ExtAgentCommandCatalog>;
    },
    async setExtAgentSessionModel(
      params: import("@envoymesh/api").SetExtAgentSessionModelParams,
    ) {
      return wsClient.rpc(
        "setExtAgentSessionModel",
        params as Record<string, unknown>,
        { timeoutMs: 5_000 },
      ) as Promise<import("@envoymesh/api").SetExtAgentSessionModelResult>;
    },
    async getHomeFsInfo() {
      return wsClient.rpc("getHomeFsInfo", {}, { timeoutMs: 10_000 }) as Promise<
        import("@envoymesh/api").HomeFsInfo
      >;
    },
    async listHomeFsEntries(
      params?: import("@envoymesh/api").ListHomeFsEntriesParams,
    ) {
      return wsClient.rpc(
        "listHomeFsEntries",
        (params ?? {}) as Record<string, unknown>,
        { timeoutMs: 15_000 },
      ) as Promise<import("@envoymesh/api").ListHomeFsEntriesResult>;
    },
    async discoverObsidianVaults() {
      return wsClient.rpc("discoverObsidianVaults", {}, { timeoutMs: 30_000 }) as Promise<
        import("@envoymesh/api").DiscoverObsidianVaultsResult
      >;
    },
    async openDesktopApp(params: import("@envoymesh/api").OpenDesktopAppParams) {
      return wsClient.rpc(
        "openDesktopApp",
        params as unknown as Record<string, unknown>,
        { timeoutMs: 15_000 },
      ) as Promise<import("@envoymesh/api").OpenDesktopAppResult>;
    },
    async getExtAgentProjectPath(
      params?: import("@envoymesh/api").GetExtAgentProjectPathParams,
    ) {
      return wsClient.rpc(
        "getExtAgentProjectPath",
        (params ?? {}) as Record<string, unknown>,
        { timeoutMs: 5_000 },
      ) as Promise<import("@envoymesh/api").ExtAgentProjectPathResult>;
    },
    async setExtAgentProjectPath(
      params: import("@envoymesh/api").SetExtAgentProjectPathParams,
    ) {
      return wsClient.rpc(
        "setExtAgentProjectPath",
        params as Record<string, unknown>,
        { timeoutMs: 10_000 },
      ) as Promise<import("@envoymesh/api").ExtAgentProjectPathResult>;
    },
    async previewHomeFsFile(
      params: import("@envoymesh/api").PreviewHomeFsFileParams,
    ) {
      return wsClient.rpc(
        "previewHomeFsFile",
        { path: params.path } as Record<string, unknown>,
        { timeoutMs: 30_000 },
      ) as Promise<import("@envoymesh/api").PreviewHomeFsFileResult>;
    },
    async runMmxMediaCommand(
      params: import("@envoymesh/api").RunMmxMediaCommandParams,
    ) {
      return wsClient.rpc(
        "runMmxMediaCommand",
        params as unknown as Record<string, unknown>,
        { timeoutMs: 920_000 },
      ) as Promise<import("@envoymesh/api").RunMmxMediaCommandResult>;
    },
    async revealHomeFsPath(
      params: import("@envoymesh/api").RevealHomeFsPathParams,
    ) {
      return wsClient.rpc(
        "revealHomeFsPath",
        { path: params.path } as Record<string, unknown>,
        { timeoutMs: 15_000 },
      ) as Promise<import("@envoymesh/api").RevealHomeFsPathResult>;
    },
    async uploadEnvoyAttachment(
      params: import("@envoymesh/api").UploadEnvoyAttachmentParams,
    ) {
      return wsClient.rpc(
        "uploadEnvoyAttachment",
        params as unknown as Record<string, unknown>,
        { timeoutMs: 120_000 },
      ) as Promise<import("@envoymesh/api").UploadEnvoyAttachmentResult>;
    },
    async buildAgentAttachmentContext(
      params: import("@envoymesh/api").BuildAgentAttachmentContextParams,
    ) {
      return wsClient.rpc(
        "buildAgentAttachmentContext",
        params as unknown as Record<string, unknown>,
        { timeoutMs: 60_000 },
      ) as Promise<import("@envoymesh/api").BuildAgentAttachmentContextResult>;
    },
    async getEnvoyAiCommandCatalog() {
      return wsClient.rpc("getEnvoyAiCommandCatalog", {}, { timeoutMs: 5_000 }) as Promise<
        import("@envoymesh/api").ExtAgentCommandCatalog
      >;
    },
    async restartOpenClaw() {
      // Force-restart is potentially slow (kill child + 250ms port-release
      // wait + 90s startup probe budget). Use the long-form RPC variant
      // with a 120s timeout so the button doesn't time out at the default
      // 30s while the gateway is still trying to come up.
      return wsClient.rpc("restartOpenClaw", {}, { timeoutMs: 120_000 }) as Promise<import("@envoymesh/api").OpenClawStatus>;
    },
    async getPiStatus() {
      return wsClient.rpc("getPiStatus") as Promise<import("@envoymesh/api").PiStatus>;
    },
    async restartPi() {
      // Restart = stop + spawn + readiness probe. Budget 30s (longer than
      // the 15s readiness deadline, shorter than OpenClaw's 120s since Pi
      // has no port-conflict machinery).
      return wsClient.rpc("restartPi", {}, { timeoutMs: 30_000 }) as Promise<import("@envoymesh/api").PiStatus>;
    },
    async getEnvoyLocalStatus() {
      return wsClient.rpc("getEnvoyLocalStatus") as Promise<
        import("@envoymesh/api").EnvoyLocalStatus
      >;
    },
    async getEnvoyLocalEmbedStatus() {
      return wsClient.rpc("getEnvoyLocalEmbedStatus") as Promise<
        import("@envoymesh/api").EnvoyLocalEmbedStatus
      >;
    },
    async enableEnvoyLocalEmbed(
      params?: import("@envoymesh/api").EnableEnvoyLocalEmbedParams,
    ) {
      // Detached on the node; poll getEnvoyLocalEmbedStatus for progress.
      return wsClient.rpc(
        "enableEnvoyLocalEmbed",
        (params ?? {}) as Record<string, unknown>,
        { timeoutMs: 60_000 },
      ) as Promise<import("@envoymesh/api").EnvoyLocalEmbedStatus>;
    },
    async stopEnvoyLocalEmbed() {
      return wsClient.rpc("stopEnvoyLocalEmbed", {}, { timeoutMs: 30_000 }) as Promise<
        import("@envoymesh/api").EnvoyLocalEmbedStatus
      >;
    },
    async disableEnvoyLocalEmbed() {
      return wsClient.rpc("disableEnvoyLocalEmbed", {}, { timeoutMs: 30_000 }) as Promise<
        import("@envoymesh/api").EnvoyLocalEmbedStatus
      >;
    },
    async listEnvoyLocalInstalledEmbedModels() {
      return wsClient.rpc("listEnvoyLocalInstalledEmbedModels") as Promise<
        import("@envoymesh/api").EnvoyLocalInstalledModel[]
      >;
    },
    async setEnvoyLocalEmbedActiveModel(
      params: import("@envoymesh/api").SetEnvoyLocalEmbedActiveModelParams,
    ) {
      return wsClient.rpc(
        "setEnvoyLocalEmbedActiveModel",
        { modelId: params.modelId },
        { timeoutMs: 120_000 },
      ) as Promise<import("@envoymesh/api").EnvoyLocalEmbedStatus>;
    },
    async enableEnvoyLocal(params?: import("@envoymesh/api").EnableEnvoyLocalParams) {
      // Job is detached on the node; poll getEnvoyLocalStatus for progress.
      return wsClient.rpc(
        "enableEnvoyLocal",
        (params ?? {}) as Record<string, unknown>,
        { timeoutMs: 60_000 },
      ) as Promise<import("@envoymesh/api").EnvoyLocalStatus>;
    },
    async declineEnvoyLocalAutoProvision() {
      return wsClient.rpc("declineEnvoyLocalAutoProvision") as Promise<
        import("@envoymesh/api").EnvoyLocalStatus
      >;
    },
    async disableEnvoyLocal() {
      return wsClient.rpc("disableEnvoyLocal", {}, { timeoutMs: 30_000 }) as Promise<
        import("@envoymesh/api").EnvoyLocalStatus
      >;
    },
    async startEnvoyLocal() {
      // Detached start (large models); poll getEnvoyLocalStatus.
      return wsClient.rpc("startEnvoyLocal", {}, { timeoutMs: 60_000 }) as Promise<
        import("@envoymesh/api").EnvoyLocalStatus
      >;
    },
    async stopEnvoyLocal() {
      return wsClient.rpc("stopEnvoyLocal", {}, { timeoutMs: 30_000 }) as Promise<
        import("@envoymesh/api").EnvoyLocalStatus
      >;
    },
    async restartEnvoyLocal() {
      return wsClient.rpc("restartEnvoyLocal", {}, { timeoutMs: 90_000 }) as Promise<
        import("@envoymesh/api").EnvoyLocalStatus
      >;
    },
    async cancelEnvoyLocalDownload() {
      return wsClient.rpc("cancelEnvoyLocalDownload") as Promise<
        import("@envoymesh/api").EnvoyLocalStatus
      >;
    },
    async listEnvoyLocalInstalledModels() {
      return wsClient.rpc("listEnvoyLocalInstalledModels") as Promise<
        import("@envoymesh/api").EnvoyLocalInstalledModel[]
      >;
    },
    async searchEnvoyLocalModels(
      params?: import("@envoymesh/api").SearchEnvoyLocalModelsParams,
    ) {
      return wsClient.rpc(
        "searchEnvoyLocalModels",
        (params ?? {}) as Record<string, unknown>,
        { timeoutMs: 45_000 },
      ) as Promise<import("@envoymesh/api").SearchEnvoyLocalModelsResult>;
    },
    async downloadEnvoyLocalModel(
      params: import("@envoymesh/api").DownloadEnvoyLocalModelParams,
    ) {
      // Detached download — poll getEnvoyLocalStatus until idle.
      return wsClient.rpc(
        "downloadEnvoyLocalModel",
        params as unknown as Record<string, unknown>,
        { timeoutMs: 60_000 },
      ) as Promise<import("@envoymesh/api").EnvoyLocalInstalledModel[]>;
    },
    async setEnvoyLocalDownloadRegion(
      params: import("@envoymesh/api").SetEnvoyLocalDownloadRegionParams,
    ) {
      return wsClient.rpc(
        "setEnvoyLocalDownloadRegion",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").EnvoyLocalStatus>;
    },
    async setEnvoyLocalActiveModel(
      params: import("@envoymesh/api").SetEnvoyLocalActiveModelParams,
    ) {
      return wsClient.rpc(
        "setEnvoyLocalActiveModel",
        params as unknown as Record<string, unknown>,
        { timeoutMs: 120_000 },
      ) as Promise<import("@envoymesh/api").EnvoyLocalStatus>;
    },
    async deleteEnvoyLocalModel(
      params: import("@envoymesh/api").DeleteEnvoyLocalModelParams,
    ) {
      return wsClient.rpc(
        "deleteEnvoyLocalModel",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").EnvoyLocalInstalledModel[]>;
    },
    async updateEnvoyLocalServerParams(
      params: import("@envoymesh/api").UpdateEnvoyLocalServerParamsParams,
    ) {
      return wsClient.rpc(
        "updateEnvoyLocalServerParams",
        params as unknown as Record<string, unknown>,
        { timeoutMs: 120_000 },
      ) as Promise<import("@envoymesh/api").EnvoyLocalStatus>;
    },
    async resetEnvoyLocalServerParams() {
      return wsClient.rpc("resetEnvoyLocalServerParams", {}, { timeoutMs: 120_000 }) as Promise<
        import("@envoymesh/api").EnvoyLocalStatus
      >;
    },
    async checkEnvoyLocalEngineUpdate() {
      return wsClient.rpc("checkEnvoyLocalEngineUpdate") as Promise<
        import("@envoymesh/api").EnvoyLocalEngineUpdateInfo
      >;
    },
    async updateEnvoyLocalEngine() {
      // Detached engine fetch — poll getEnvoyLocalStatus until idle.
      return wsClient.rpc("updateEnvoyLocalEngine", {}, { timeoutMs: 60_000 }) as Promise<
        import("@envoymesh/api").EnvoyLocalStatus
      >;
    },
    async sendToPi(text: string) {
      // One Pi turn = LLM round-trip + any tool calls. Match the terminal
      // assist budget (120s) since a coding task can be long-running.
      return wsClient.rpc("sendToPi", { text }, { timeoutMs: 120_000 }) as Promise<string>;
    },
    async getEnvoyHarnessStatus() {
      return wsClient.rpc("getEnvoyHarnessStatus") as Promise<
        import("@envoymesh/api").EnvoyHarnessStatus
      >;
    },
    async askEnvoyHarness(text: string) {
      // Legacy blocking path — orchestration callers. Chat uses startEnvoyHarnessTurn.
      return wsClient.rpc(
        "askEnvoyHarness",
        { text },
        { timeoutMs: EH_ASK_WS_TIMEOUT_MS },
      ) as Promise<string>;
    },
    async startEnvoyHarnessTurn(
      text: string,
      attachments?: import("@envoymesh/api").AgentAttachmentRef[],
      chatId?: string,
    ) {
      return wsClient.rpc(
        "startEnvoyHarnessTurn",
        {
          text,
          ...(attachments !== undefined && attachments.length > 0 ? { attachments } : {}),
          ...(chatId ? { chatId } : {}),
        },
        { timeoutMs: 30_000 },
      ) as Promise<{ turnId: string }>;
    },
    async getEnvoyHarnessTurnStatus(chatId?: string) {
      return wsClient.rpc(
        "getEnvoyHarnessTurnStatus",
        chatId ? { chatId } : {},
        { timeoutMs: 10_000 },
      ) as Promise<import("@envoymesh/api").EhTurnStatus>;
    },
    async setEnvoyHarnessAutoRunPolicy(policy: string) {
      return wsClient.rpc(
        "setEnvoyHarnessAutoRunPolicy",
        { policy },
        { timeoutMs: 30_000 },
      ) as Promise<import("@envoymesh/api").EnvoyHarnessStatus>;
    },
    async getEnvoyHarnessChatHistory(chatId?: string) {
      return wsClient.rpc(
        "getEnvoyHarnessChatHistory",
        chatId ? { chatId } : {},
        { timeoutMs: 30_000 },
      ) as Promise<import("@envoymesh/api").EhChatHistory>;
    },
    async listEnvoyHarnessChats() {
      return wsClient.rpc("listEnvoyHarnessChats", {}, { timeoutMs: 15_000 }) as Promise<
        import("@envoymesh/api").EhChatWorkspaceSummary[]
      >;
    },
    async createEnvoyHarnessChat(opts: { cwd: string; title?: string }) {
      return wsClient.rpc("createEnvoyHarnessChat", opts, { timeoutMs: 30_000 }) as Promise<
        import("@envoymesh/api").EhChatWorkspaceSummary
      >;
    },
    async openEnvoyHarnessChat(chatId: string) {
      return wsClient.rpc("openEnvoyHarnessChat", { chatId }, { timeoutMs: 30_000 }) as Promise<
        import("@envoymesh/api").EhChatHistory
      >;
    },
    async removeEnvoyHarnessChat(chatId: string) {
      return wsClient.rpc("removeEnvoyHarnessChat", { chatId }, { timeoutMs: 15_000 }) as Promise<{
        removed: boolean;
      }>;
    },
    async deleteEnvoyHarnessChatTurn(opts: { turnId: string; chatId?: string }) {
      return wsClient.rpc("deleteEnvoyHarnessChatTurn", opts, { timeoutMs: 30_000 }) as Promise<
        import("@envoymesh/api").EhChatHistory & { deleted: boolean }
      >;
    },
    async getEnvoyHarnessTurnReview(turnId: string) {
      return wsClient.rpc("getEnvoyHarnessTurnReview", { turnId }, { timeoutMs: 30_000 }) as Promise<
        import("@envoymesh/api").EhTurnReview | null
      >;
    },
    async revertEnvoyHarnessTurn(turnId: string) {
      return wsClient.rpc("revertEnvoyHarnessTurn", { turnId }, { timeoutMs: 30_000 }) as Promise<
        import("@envoymesh/api").EhRevertTurnResult
      >;
    },
    async acceptEnvoyHarnessTurnReview(turnId: string, paths?: readonly string[]) {
      return wsClient.rpc(
        "acceptEnvoyHarnessTurnReview",
        { turnId, ...(paths ? { paths } : {}) },
        { timeoutMs: 30_000 },
      ) as Promise<import("@envoymesh/api").EhAcceptTurnReviewResult>;
    },
    async revertEnvoyHarnessTurnFiles(turnId: string, paths: readonly string[]) {
      return wsClient.rpc(
        "revertEnvoyHarnessTurnFiles",
        { turnId, paths },
        { timeoutMs: 30_000 },
      ) as Promise<import("@envoymesh/api").EhRevertTurnResult>;
    },
    async openEnvoyHarnessFile(params: { path: string; chatId?: string }) {
      await wsClient.rpc("openEnvoyHarnessFile", params, { timeoutMs: 30_000 });
    },
    async getEnvoyHarnessCommandCatalog() {
      return wsClient.rpc("getEnvoyHarnessCommandCatalog", {}, { timeoutMs: 5_000 }) as Promise<
        import("@envoymesh/api").ExtAgentCommandCatalog
      >;
    },
    async recordEnvoyHarnessUxEvent(event) {
      await wsClient.rpc("recordEnvoyHarnessUxEvent", { ...event }, { timeoutMs: 5_000 });
    },
    async resetEnvoyHarnessChat(chatId?: string) {
      return wsClient.rpc(
        "resetEnvoyHarnessChat",
        chatId ? { chatId } : {},
        { timeoutMs: 30_000 },
      ) as Promise<import("@envoymesh/api").EhChatHistory>;
    },
    async resumeEnvoyHarnessSession(opts: {
      sessionId: string;
      chatId?: string;
    }) {
      return wsClient.rpc(
        "resumeEnvoyHarnessSession",
        {
          sessionId: opts.sessionId,
          ...(opts.chatId ? { chatId: opts.chatId } : {}),
        },
        { timeoutMs: 30_000 },
      ) as Promise<import("@envoymesh/api").EhChatHistory>;
    },
    async ehRespondToPermission(params: { requestId: string; allowed: boolean }) {
      return wsClient.rpc("ehRespondToPermission", params) as Promise<{
        requestId: string;
        delivered: boolean;
      }>;
    },
    async cancelEnvoyHarnessTurn(chatId?: string) {
      return wsClient.rpc(
        "cancelEnvoyHarnessTurn",
        chatId ? { chatId } : {},
      ) as Promise<{
        cancelled: boolean;
      }>;
    },
    async listEnvoyHarnessPeers() {
      return wsClient.rpc("listEnvoyHarnessPeers") as Promise<
        ReadonlyArray<{
          id: string;
          model?: string;
          capabilities?: readonly string[];
        }>
      >;
    },
    async setEnvoyHarnessProjectPath(path: string) {
      return wsClient.rpc(
        "setEnvoyHarnessProjectPath",
        { path },
        { timeoutMs: 30_000 },
      ) as Promise<import("@envoymesh/api").EnvoyHarnessStatus>;
    },
    async invokeEnvoyHarnessEhui(
      request: import("@envoymesh/api").EhuiInvokeRequest,
    ) {
      return wsClient.rpc(
        "invokeEnvoyHarnessEhui",
        { request },
        { timeoutMs: 30_000 },
      ) as Promise<unknown>;
    },
    async ensureEnvoyTerminalSession(
      params?: import("@envoymesh/api").EnsureEnvoyTerminalParams,
    ) {
      return wsClient.rpc(
        "ensureEnvoyTerminalSession",
        { ...(params ?? {}) },
        { timeoutMs: 30_000 },
      ) as Promise<import("@envoymesh/api").EnsureEnvoyTerminalResult>;
    },
    async ensurePiTerminalSession(
      params?: import("@envoymesh/api").EnsurePiTerminalParams,
    ) {
      return wsClient.rpc(
        "ensurePiTerminalSession",
        (params ?? {}) as Record<string, unknown>,
        { timeoutMs: 30_000 },
      ) as Promise<import("@envoymesh/api").EnsurePiTerminalResult>;
    },
    async piRespondToProposal(params: { uiRequestId: string; confirmed: boolean }) {
      return wsClient.rpc("piRespondToProposal", params) as Promise<{
        uiRequestId: string;
        delivered: boolean;
      }>;
    },
    async ehRespondToUserQuestion(
      params: import("@envoymesh/api").EhRespondToUserQuestionParams,
    ) {
      return wsClient.rpc(
        "ehRespondToUserQuestion",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").EhRespondToUserQuestionResult>;
    },
    async getPairingPayload() { return wsClient.rpc("getPairingPayload"); },
    async createWanJoinInvite(params?: import("@envoymesh/api").CreateWanJoinInviteParams) {
      return wsClient.rpc("createWanJoinInvite", (params ?? {}) as Record<string, unknown>) as Promise<
        import("@envoymesh/api").CreateWanJoinInviteResult
      >;
    },
    async applyWanJoinInvite(token: string) {
      return wsClient.rpc("applyWanJoinInvite", { token }) as Promise<
        import("@envoymesh/api").ApplyWanJoinInviteResult
      >;
    },
    async createCompanyInvite(params?: import("@envoymesh/api").CreateCompanyInviteParams) {
      return wsClient.rpc("createCompanyInvite", (params ?? {}) as Record<string, unknown>) as Promise<
        import("@envoymesh/api").CreateCompanyInviteResult
      >;
    },
    async listCompanyInvites() {
      return wsClient.rpc("listCompanyInvites") as Promise<
        import("@envoymesh/api").ListCompanyInvitesResult
      >;
    },
    async revokeCompanyInvite(inviteId: string) {
      return wsClient.rpc("revokeCompanyInvite", { inviteId }) as Promise<
        import("@envoymesh/api").RevokeCompanyInviteResult
      >;
    },
    async redeemCompanyInvite(
      params: import("@envoymesh/api").RedeemCompanyInviteParams,
    ) {
      return wsClient.rpc(
        "redeemCompanyInvite",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").RedeemCompanyInviteResult>;
    },
    async listFamilyProfiles() {
      return wsClient.rpc("listFamilyProfiles") as Promise<
        import("@envoymesh/api").ListFamilyProfilesResult
      >;
    },
    async createFamilyProfile(
      params: import("@envoymesh/api").CreateFamilyProfileParams,
    ) {
      return wsClient.rpc(
        "createFamilyProfile",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").CreateFamilyProfileResult>;
    },
    async updateFamilyProfile(
      params: import("@envoymesh/api").UpdateFamilyProfileParams,
    ) {
      return wsClient.rpc(
        "updateFamilyProfile",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").UpdateFamilyProfileResult>;
    },
    async deleteFamilyProfile(id: string) {
      return wsClient.rpc("deleteFamilyProfile", { id }) as Promise<
        import("@envoymesh/api").DeleteFamilyProfileResult
      >;
    },
    async wipeFamilyProfile(id: string) {
      return wsClient.rpc("wipeFamilyProfile", { id }) as Promise<
        import("@envoymesh/api").WipeFamilyProfileResult
      >;
    },
    async generateFamilyInviteToken(
      params?: import("@envoymesh/api").GenerateFamilyInviteTokenParams,
    ) {
      return wsClient.rpc(
        "generateFamilyInviteToken",
        (params ?? {}) as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").GenerateFamilyInviteTokenResult>;
    },
    async sendFamilyMessage(
      params: import("@envoymesh/api").SendFamilyMessageParams,
    ) {
      return wsClient.rpc(
        "sendFamilyMessage",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").SendFamilyMessageResult>;
    },
    async listFamilyRooms() {
      return wsClient.rpc("listFamilyRooms") as Promise<
        import("@envoymesh/api").ListFamilyRoomsResult
      >;
    },
    async createFamilyRoom(
      params: import("@envoymesh/api").CreateFamilyRoomParams,
    ) {
      return wsClient.rpc(
        "createFamilyRoom",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").CreateFamilyRoomResult>;
    },
    async sendFamilyRoomMessage(
      params: import("@envoymesh/api").SendFamilyRoomMessageParams,
    ) {
      return wsClient.rpc(
        "sendFamilyRoomMessage",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").SendFamilyRoomMessageResult>;
    },
    async readFamilyAttachment(
      params: import("@envoymesh/api").FamilyAttachmentReadParams,
    ) {
      return wsClient.rpc(
        "readFamilyAttachment",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").FamilyAttachmentReadResult>;
    },
    async shopGetProfile() {
      return wsClient.rpc("shopGetProfile") as Promise<
        import("@envoymesh/api").ShopGetProfileResult
      >;
    },
    async shopUpdateProfile(params: import("@envoymesh/api").ShopUpdateProfileParams) {
      return wsClient.rpc(
        "shopUpdateProfile",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ShopUpdateProfileResult>;
    },
    async shopListListings(params?: import("@envoymesh/api").ShopListListingsParams) {
      return wsClient.rpc(
        "shopListListings",
        (params ?? {}) as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ShopListListingsResult>;
    },
    async shopUpsertListing(params: import("@envoymesh/api").ShopUpsertListingParams) {
      return wsClient.rpc(
        "shopUpsertListing",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ShopUpsertListingResult>;
    },
    async shopSetListingStatus(params: import("@envoymesh/api").ShopSetListingStatusParams) {
      return wsClient.rpc(
        "shopSetListingStatus",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ShopSetListingStatusResult>;
    },
    async shopDeleteListing(params: import("@envoymesh/api").ShopDeleteListingParams) {
      return wsClient.rpc(
        "shopDeleteListing",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ShopDeleteListingResult>;
    },
    async shopDraftListing(params?: import("@envoymesh/api").ShopDraftListingParams) {
      return wsClient.rpc(
        "shopDraftListing",
        (params ?? {}) as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ShopDraftListingResult>;
    },
    async shopSaveListingMedia(params: import("@envoymesh/api").ShopSaveListingMediaParams) {
      return wsClient.rpc(
        "shopSaveListingMedia",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ShopSaveListingMediaResult>;
    },
    async shopGetListingMedia(params: import("@envoymesh/api").ShopGetListingMediaParams) {
      return wsClient.rpc(
        "shopGetListingMedia",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ShopGetListingMediaResult>;
    },
    async marketSearch(params?: import("@envoymesh/api").MarketSearchParams) {
      return wsClient.rpc(
        "marketSearch",
        (params ?? {}) as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").MarketSearchResult>;
    },
    async marketBrowseSuggestions() {
      return wsClient.rpc("marketBrowseSuggestions") as Promise<
        import("@envoymesh/api").MarketBrowseSuggestionsResult
      >;
    },
    async marketClearSearchHistory() {
      return wsClient.rpc("marketClearSearchHistory") as Promise<{ ok: true }>;
    },
    async marketReportSeller(params: import("@envoymesh/api").MarketReportSellerParams) {
      return wsClient.rpc(
        "marketReportSeller",
        params as unknown as Record<string, unknown>,
      ) as Promise<void>;
    },
    async marketSuggestSellerReply(
      params: import("@envoymesh/api").MarketSuggestSellerReplyParams,
    ) {
      return wsClient.rpc(
        "marketSuggestSellerReply",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").MarketSuggestSellerReplyResult>;
    },
    async marketShareListing(params: import("@envoymesh/api").MarketShareListingParams) {
      return wsClient.rpc(
        "marketShareListing",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").MarketShareListingResult>;
    },
    async syncPairingKioskFromConfig() {
      return wsClient.rpc("syncPairingKioskFromConfig") as Promise<void>;
    },
    async getPairingKioskStatus() {
      return wsClient.rpc("getPairingKioskStatus") as Promise<
        import("@envoymesh/api").PairingKioskStatus
      >;
    },
    async importFleetManifest(params: import("@envoymesh/api").ImportFleetManifestParams) {
      return wsClient.rpc("importFleetManifest", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").ImportFleetManifestOutcome
      >;
    },
    async listFleetManifests() {
      return wsClient.rpc("listFleetManifests") as Promise<
        import("@envoymesh/api").ListFleetManifestsResult
      >;
    },
    async revokeFleetManifest(manifestId: string) {
      return wsClient.rpc("revokeFleetManifest", { manifestId }) as Promise<
        import("@envoymesh/api").RevokeFleetManifestResult
      >;
    },
    async createFleetManifest(input: import("@envoymesh/api").CreateFleetManifestInput) {
      return wsClient.rpc("createFleetManifest", input as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").CreateFleetManifestResult
      >;
    },
    async pairWithHomeNode(params: import("@envoymesh/api").PairWithHomeNodeParams) {
      return wsClient.rpc("pairWithHomeNode", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").PairWithHomeNodeResult
      >;
    },
    async listAuthorizedDevices() {
      return wsClient.rpc("listAuthorizedDevices", {}) as Promise<
        import("@envoymesh/api").ListAuthorizedDevicesResult
      >;
    },
    async revokeAuthorizedDevice(params: import("@envoymesh/api").RevokeAuthorizedDeviceParams) {
      return wsClient.rpc("revokeAuthorizedDevice", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").RevokeAuthorizedDeviceResult
      >;
    },
    async mergeAuthorizedDevices(params: import("@envoymesh/api").MergeAuthorizedDevicesParams) {
      return wsClient.rpc("mergeAuthorizedDevices", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").MergeAuthorizedDevicesResult
      >;
    },
    async pruneRevokedDevices() {
      return wsClient.rpc("pruneRevokedDevices", {}) as Promise<
        import("@envoymesh/api").PruneRevokedDevicesResult
      >;
    },
    async listDeviceRevocations() {
      return wsClient.rpc("listDeviceRevocations", {}) as Promise<
        import("@envoymesh/api").ListDeviceRevocationsResult
      >;
    },
    async listTerminalSessions() {
      return wsClient.rpc("listTerminalSessions", {}) as Promise<import("@envoymesh/api").TerminalSessionSummary[]>;
    },
    async createTerminalSession(params?: import("@envoymesh/api").CreateTerminalSessionParams) {
      return wsClient.rpc("createTerminalSession", (params ?? {}) as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalSessionSummary
      >;
    },
    async closeTerminalSession(params: import("@envoymesh/api").CloseTerminalSessionParams) {
      return wsClient.rpc("closeTerminalSession", params as unknown as Record<string, unknown>);
    },
    async renameTerminalSession(params: import("@envoymesh/api").RenameTerminalSessionParams) {
      return wsClient.rpc("renameTerminalSession", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalSessionSummary
      >;
    },
    async terminalAttach(params: import("@envoymesh/api").TerminalAttachParams) {
      return wsClient.rpc("terminalAttach", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalAttachResult
      >;
    },
    async terminalRunFromNaturalLanguage(params: import("@envoymesh/api").TerminalRunFromNaturalLanguageParams) {
      return wsClient.rpc("terminalRunFromNaturalLanguage", params as unknown as Record<string, unknown>, {
        timeoutMs: TERMINAL_ASSIST_RPC_TIMEOUT_MS,
      }) as Promise<import("@envoymesh/api").TerminalCommandProposal>;
    },
    async terminalExecuteProposal(params: import("@envoymesh/api").TerminalExecuteProposalParams) {
      return wsClient.rpc("terminalExecuteProposal", params as unknown as Record<string, unknown>);
    },
    async terminalSetAssistModelOverride(params: import("@envoymesh/api").TerminalSetAssistModelOverrideParams) {
      return wsClient.rpc("terminalSetAssistModelOverride", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalAssistState
      >;
    },
    async terminalGetAssistState(sessionId: string) {
      return wsClient.rpc("terminalGetAssistState", { sessionId }) as Promise<
        import("@envoymesh/api").TerminalAssistState
      >;
    },
    async terminalExplainScrollback(params: import("@envoymesh/api").TerminalExplainScrollbackParams) {
      return wsClient.rpc("terminalExplainScrollback", params as unknown as Record<string, unknown>, {
        timeoutMs: TERMINAL_ASSIST_RPC_TIMEOUT_MS,
      }) as Promise<import("@envoymesh/api").TerminalExplainScrollbackResult>;
    },
    async terminalSuggestCommand(params: import("@envoymesh/api").TerminalSuggestCommandParams) {
      return wsClient.rpc("terminalSuggestCommand", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalSuggestCommandResult
      >;
    },
    async terminalObserveStep(params: import("@envoymesh/api").TerminalObserveStepParams) {
      return wsClient.rpc("terminalObserveStep", params as unknown as Record<string, unknown>, {
        timeoutMs: TERMINAL_ASSIST_RPC_TIMEOUT_MS,
      }) as Promise<import("@envoymesh/api").TerminalObserveStepResult>;
    },
    async terminalSetInlineSuggestEnabled(params: import("@envoymesh/api").TerminalSetInlineSuggestParams) {
      return wsClient.rpc("terminalSetInlineSuggestEnabled", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalAssistState
      >;
    },
    async terminalOpenClawPlan(params: import("@envoymesh/api").TerminalOpenClawPlanParams) {
      return wsClient.rpc("terminalOpenClawPlan", params as unknown as Record<string, unknown>, {
        timeoutMs: TERMINAL_ASSIST_RPC_TIMEOUT_MS,
      }) as Promise<import("@envoymesh/api").TerminalOpenClawPlanResult>;
    },
    async terminalRunPlanStep(params: import("@envoymesh/api").TerminalRunPlanStepParams) {
      return wsClient.rpc("terminalRunPlanStep", params as unknown as Record<string, unknown>, {
        timeoutMs: TERMINAL_ASSIST_RPC_TIMEOUT_MS,
      }) as Promise<import("@envoymesh/api").TerminalCommandProposal>;
    },
    async terminalEnablePrepareMode(params: import("@envoymesh/api").TerminalEnablePrepareModeParams) {
      return wsClient.rpc("terminalEnablePrepareMode", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalEnablePrepareModeResult
      >;
    },
    async terminalWatchStep(params: import("@envoymesh/api").TerminalWatchStepParams) {
      return wsClient.rpc("terminalWatchStep", params as unknown as Record<string, unknown>, {
        timeoutMs: TERMINAL_ASSIST_RPC_TIMEOUT_MS,
      }) as Promise<import("@envoymesh/api").TerminalWatchStepResult>;
    },
    async terminalPinContextSession(params: import("@envoymesh/api").TerminalPinContextSessionParams) {
      return wsClient.rpc("terminalPinContextSession", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalAssistState
      >;
    },
    async terminalDetectFailure(params: import("@envoymesh/api").TerminalDetectFailureParams) {
      return wsClient.rpc("terminalDetectFailure", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalFailureDetection
      >;
    },
    async terminalSuggestFixFromFailure(params: import("@envoymesh/api").TerminalSuggestFixParams) {
      return wsClient.rpc("terminalSuggestFixFromFailure", params as unknown as Record<string, unknown>, {
        timeoutMs: TERMINAL_ASSIST_RPC_TIMEOUT_MS,
      }) as Promise<import("@envoymesh/api").TerminalCommandProposal>;
    },
    async terminalStartGoalLoop(params: import("@envoymesh/api").TerminalStartGoalLoopParams) {
      return wsClient.rpc("terminalStartGoalLoop", params as unknown as Record<string, unknown>, {
        timeoutMs: TERMINAL_ASSIST_RPC_TIMEOUT_MS,
      }) as Promise<import("@envoymesh/api").TerminalGoalLoopStepResult>;
    },
    async terminalAdvanceGoalLoop(params: import("@envoymesh/api").TerminalAdvanceGoalLoopParams) {
      return wsClient.rpc("terminalAdvanceGoalLoop", params as unknown as Record<string, unknown>, {
        timeoutMs: TERMINAL_ASSIST_RPC_TIMEOUT_MS,
      }) as Promise<import("@envoymesh/api").TerminalGoalLoopStepResult>;
    },
    async terminalCancelGoalLoop(params: import("@envoymesh/api").TerminalCancelGoalLoopParams) {
      return wsClient.rpc("terminalCancelGoalLoop", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalAssistState
      >;
    },
    async terminalClearResumeGoal(sessionId: string) {
      return wsClient.rpc("terminalClearResumeGoal", { sessionId }) as Promise<
        import("@envoymesh/api").TerminalAssistState
      >;
    },
    async terminalSendContextToAssistant(params: import("@envoymesh/api").TerminalSendContextToAssistantParams) {
      return wsClient.rpc("terminalSendContextToAssistant", params as unknown as Record<string, unknown>, {
        timeoutMs: 180_000,
      }) as Promise<import("@envoymesh/api").TerminalSendContextToAssistantResult>;
    },
    async terminalUpdatePlanProgress(params: import("@envoymesh/api").TerminalUpdatePlanProgressParams) {
      return wsClient.rpc("terminalUpdatePlanProgress", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalAssistState
      >;
    },
    async terminalGetScrollbackPreview(params: import("@envoymesh/api").TerminalGetScrollbackPreviewParams) {
      return wsClient.rpc("terminalGetScrollbackPreview", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalGetScrollbackPreviewResult
      >;
    },
    async terminalResumeGoalLoop(params: import("@envoymesh/api").TerminalResumeGoalLoopParams) {
      return wsClient.rpc("terminalResumeGoalLoop", params as unknown as Record<string, unknown>, {
        timeoutMs: TERMINAL_ASSIST_RPC_TIMEOUT_MS,
      }) as Promise<import("@envoymesh/api").TerminalGoalLoopStepResult>;
    },
    async terminalEnableExecPane(params: import("@envoymesh/api").TerminalEnableExecPaneParams) {
      return wsClient.rpc("terminalEnableExecPane", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalEnableExecPaneResult
      >;
    },
    async terminalSetBackgroundWatch(params: import("@envoymesh/api").TerminalSetBackgroundWatchParams) {
      return wsClient.rpc("terminalSetBackgroundWatch", params as unknown as Record<string, unknown>, {
        timeoutMs: 120_000,
      }) as Promise<import("@envoymesh/api").TerminalAssistState>;
    },
    async terminalClearBackgroundWatch(params: import("@envoymesh/api").TerminalClearBackgroundWatchParams) {
      return wsClient.rpc("terminalClearBackgroundWatch", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalAssistState
      >;
    },
    async openInHerdr(params?: import("@envoymesh/api").OpenInHerdrParams) {
      return wsClient.rpc("openInHerdr", (params ?? {}) as Record<string, unknown>) as Promise<
        import("@envoymesh/api").OpenInHerdrResult
      >;
    },
    async terminalGetHerdrExportHint(params: import("@envoymesh/api").TerminalHerdrExportHintParams) {
      return wsClient.rpc("terminalGetHerdrExportHint", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").TerminalHerdrExportHintResult
      >;
    },
    async homeTerminalWsOpen(params: import("@envoymesh/api").HomeTerminalWsOpenParams) {
      return wsClient.rpc("homeTerminalWsOpen", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").HomeTerminalWsRpcResult
      >;
    },
    async homeTerminalWsSend(params: import("@envoymesh/api").HomeTerminalWsSendParams) {
      return wsClient.rpc("homeTerminalWsSend", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").HomeTerminalWsRpcResult
      >;
    },
    async homeTerminalWsClose(params?: import("@envoymesh/api").HomeTerminalWsCloseParams) {
      return wsClient.rpc("homeTerminalWsClose", (params ?? {}) as Record<string, unknown>) as Promise<
        import("@envoymesh/api").HomeTerminalWsRpcResult
      >;
    },
    async knowledgeQuery(question: string) { return wsClient.rpc("knowledgeQuery", { question }) as Promise<string>; },
    async draftAuthorContent(params) {
      return wsClient.rpc("draftAuthorContent", params as unknown as Record<string, unknown>) as Promise<
        import("@envoymesh/api").DraftAuthorContentResult
      >;
    },
    async runDocumentAgentTurn(message: string) {
      return wsClient.rpc("runDocumentAgentTurn", { message }) as Promise<import("@envoymesh/api").DocumentAgentTurnResult>;
    },
    async runOwnerAgentTurn(message: string, options?: import("@envoymesh/api").RunOwnerAgentTurnOptions) {
      return wsClient.rpc(
        "runOwnerAgentTurn",
        { message, humanMessageId: options?.humanMessageId },
        { timeoutMs: 300_000 },
      ) as Promise<import("@envoymesh/api").OwnerAgentTurnResult>;
    },
    async listAgentCircles() {
      return wsClient.rpc("listAgentCircles", {}) as Promise<import("@envoymesh/api").AgentCircle[]>;
    },
    async createAgentCircle(input: {
      label: string;
      memberOwnerIds: string[];
      topicTags: string[];
    }) {
      return wsClient.rpc("createAgentCircle", input as Record<string, unknown>) as Promise<import("@envoymesh/api").AgentCircle>;
    },
    async updateAgentCircle(
      circleId: string,
      update: { label?: string; memberOwnerIds?: string[]; topicTags?: string[]; status?: "proposed" | "active" | "declined" | "removed" },
    ) {
      return wsClient.rpc("updateAgentCircle", { circleId, update } as Record<string, unknown>) as Promise<import("@envoymesh/api").AgentCircle>;
    },
    async deleteAgentCircle(circleId: string) {
      return wsClient.rpc("deleteAgentCircle", { circleId });
    },
    async proposeAgentCircles() {
      return wsClient.rpc("proposeAgentCircles", {}) as Promise<import("@envoymesh/api").AgentCircle[]>;
    },
    async generateMeshIntelligenceReport() {
      return wsClient.rpc("generateMeshIntelligenceReport", {}) as Promise<string>;
    },
    async getOpenClawPlugins() {
      return wsClient.rpc("getOpenClawPlugins", {}) as Promise<string[]>;
    },
    async searchOpenClawPlugins(query: string) {
      return wsClient.rpc("searchOpenClawPlugins", { query }) as Promise<string[]>;
    },
    async getTrendingOpenClawPlugins() {
      return wsClient.rpc("getTrendingOpenClawPlugins", {}) as Promise<string[]>;
    },
    async installOpenClawPlugin(name: string) {
      return wsClient.rpc("installOpenClawPlugin", { name }) as Promise<{ ok: boolean; message: string }>;
    },
    async uninstallOpenClawPlugin(name: string) {
      return wsClient.rpc("uninstallOpenClawPlugin", { name }) as Promise<{ ok: boolean; message: string }>;
    },
    async saveClawhubToken(token: string) {
      return wsClient.rpc("saveClawhubToken", { token }) as Promise<{ ok: boolean }>;
    },
    async saveSkillApiKeys(keys: Record<string, string>) {
      return wsClient.rpc("saveSkillApiKeys", { keys }) as Promise<{ ok: boolean }>;
    },
    async saveWebSearchEnabled(enabled: boolean) {
      return wsClient.rpc("saveWebSearchEnabled", { enabled }) as Promise<{ ok: boolean }>;
    },
    async sendToOpenClaw(text: string) {
      return wsClient.rpc("sendToOpenClaw", { text }) as Promise<void>;
    },
    async sendToAiBot(botId: string, text: string) {
      return wsClient.rpc("sendToAiBot", { botId, text }) as Promise<void>;
    },
    async getPairedDiagnostics() {
      return wsClient.rpc("getPairedDiagnostics", {}) as Promise<Record<string, unknown>>;
    },
    // OpenClaw extension/plugin management
    async listOpenClawExtensionPlugins() {
      return wsClient.rpc("listOpenClawExtensionPlugins", {}) as Promise<import("@envoymesh/api").OpenClawPluginInfo[]>;
    },
    async inspectOpenClawExtensionPlugin(id: string) {
      return wsClient.rpc("inspectOpenClawExtensionPlugin", { id }) as Promise<import("@envoymesh/api").OpenClawPluginDetail | null>;
    },
    async enableOpenClawExtensionPlugin(id: string) {
      return wsClient.rpc("enableOpenClawExtensionPlugin", { id }) as Promise<{ ok: boolean; message: string }>;
    },
    async disableOpenClawExtensionPlugin(id: string) {
      return wsClient.rpc("disableOpenClawExtensionPlugin", { id }) as Promise<{ ok: boolean; message: string }>;
    },
    async installOpenClawExtensionPlugin(spec: string) {
      return wsClient.rpc("installOpenClawExtensionPlugin", { spec }) as Promise<{ ok: boolean; message: string }>;
    },
    async uninstallOpenClawExtensionPlugin(id: string) {
      return wsClient.rpc("uninstallOpenClawExtensionPlugin", { id }) as Promise<{ ok: boolean; message: string }>;
    },
    async updateOpenClawExtensionPlugin(id: string) {
      return wsClient.rpc("updateOpenClawExtensionPlugin", { id }) as Promise<{ ok: boolean; message: string }>;
    },
    async clearAllUserData() {
      await wsClient.rpc("clearAllUserData", {});
    },
    async listLibraryItems(params?: ListLibraryItemsParams) {
      return wsClient.rpc("listLibraryItems", (params ?? {}) as Record<string, unknown>) as Promise<LibraryItem[]>;
    },
    async listAllLocalFiles(params?: ListAllLocalFilesParams) {
      return wsClient.rpc("listAllLocalFiles", (params ?? {}) as Record<string, unknown>) as Promise<
        ListAllLocalFilesResult
      >;
    },
    async readLocalFileContent(params: ReadLocalFileContentParams) {
      return wsClient.rpc("readLocalFileContent", params as unknown as Record<string, unknown>) as Promise<
        ReadLibraryItemContentResult
      >;
    },
    async openLocalFile(params: OpenLocalFileParams) {
      return wsClient.rpc("openLocalFile", params as unknown as Record<string, unknown>);
    },
    async setLibraryItemPublished(documentId: string, published: boolean) {
      return wsClient.rpc("setLibraryItemPublished", { documentId, published });
    },
    async exportLibraryItemToIpfs(documentId: string) {
      return wsClient.rpc("exportLibraryItemToIpfs", { documentId }) as Promise<ExportLibraryItemToIpfsResult>;
    },
    async pinLibraryItemExternal(documentId: string) {
      return wsClient.rpc("pinLibraryItemExternal", { documentId }) as Promise<
        import("@envoymesh/api").PinLibraryItemExternalResult
      >;
    },
    async getIpfsEngineStatus() {
      return wsClient.rpc("getIpfsEngineStatus", {}) as Promise<IpfsEngineStatus>;
    },
    async getRagIndexStatus() {
      return wsClient.rpc("getRagIndexStatus", {}) as Promise<RagIndexStatus>;
    },
    async reindexRagKnowledge(params?: { force?: boolean }) {
      // Large vaults take many minutes on CPU embed; default 30s RPC cuts off Rebuild.
      return wsClient.rpc("reindexRagKnowledge", (params ?? {}) as Record<string, unknown>, {
        timeoutMs: 45 * 60_000,
      }) as Promise<RagIndexStatus>;
    },
    async testRagEmbedding() {
      return wsClient.rpc("testRagEmbedding", {}) as Promise<
        import("@envoymesh/api").RagEmbeddingProbeResult
      >;
    },
    async testChatModel() {
      return wsClient.rpc("testChatModel", {}) as Promise<
        import("@envoymesh/api").ChatModelProbeResult
      >;
    },
    async verifyLibraryItemIpfsGateway(params: VerifyLibraryItemIpfsGatewayParams) {
      return wsClient.rpc("verifyLibraryItemIpfsGateway", params as unknown as Record<string, unknown>) as Promise<
        VerifyLibraryItemIpfsGatewayResult
      >;
    },
    async importToLibrary(params: ImportToLibraryParams) {
      return wsClient.rpc("importToLibrary", params as unknown as Record<string, unknown>) as Promise<
        ImportToLibraryResult
      >;
    },
    async convertLibraryItemToMarkdown(
      params: import("@envoymesh/api").ConvertLibraryItemToMarkdownParams,
    ) {
      return wsClient.rpc(
        "convertLibraryItemToMarkdown",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ConvertLibraryItemToMarkdownResult>;
    },
    async saveExternalMcpSearchAsNote(
      params: import("@envoymesh/api").SaveExternalMcpSearchAsNoteParams,
    ) {
      return wsClient.rpc(
        "saveExternalMcpSearchAsNote",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").SaveExternalMcpSearchAsNoteResult>;
    },
    async listExternalMcpKnowledge(
      params?: import("@envoymesh/api").ListExternalMcpKnowledgeParams,
    ) {
      return wsClient.rpc(
        "listExternalMcpKnowledge",
        (params ?? {}) as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ListExternalMcpKnowledgeResult>;
    },
    async importLinkedObsidianNotes(
      params: import("@envoymesh/api").ImportLinkedObsidianNotesParams,
    ) {
      return wsClient.rpc(
        "importLinkedObsidianNotes",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ImportLinkedObsidianNotesResult>;
    },
    async importExternalMcpKnowledge(
      params: import("@envoymesh/api").ImportExternalMcpKnowledgeParams,
    ) {
      return wsClient.rpc(
        "importExternalMcpKnowledge",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ImportExternalMcpKnowledgeResult>;
    },
    async exportNotesToLinkedObsidian(
      params: import("@envoymesh/api").ExportNotesToLinkedObsidianParams,
    ) {
      return wsClient.rpc(
        "exportNotesToLinkedObsidian",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ExportNotesToLinkedObsidianResult>;
    },
    async exportNotesToMcp(params: import("@envoymesh/api").ExportNotesToMcpParams) {
      return wsClient.rpc(
        "exportNotesToMcp",
        params as unknown as Record<string, unknown>,
      ) as Promise<import("@envoymesh/api").ExportNotesToMcpResult>;
    },
    async createNote(params: CreateNoteParams) {
      return wsClient.rpc("createNote", params as unknown as Record<string, unknown>) as Promise<
        CreateNoteResult
      >;
    },
    async deleteVaultItem(params: DeleteVaultItemParams) {
      return wsClient.rpc("deleteVaultItem", params as unknown as Record<string, unknown>);
    },
    async listKbPlugins(params?: ListKbPluginsParams) {
      return wsClient.rpc("listKbPlugins", (params ?? {}) as unknown as Record<string, unknown>) as Promise<
        KbPluginInfo[]
      >;
    },
    async activateKbPlugin(params: ActivateKbPluginParams) {
      return wsClient.rpc("activateKbPlugin", params as unknown as Record<string, unknown>) as Promise<{
        ok: boolean;
        reason?: string;
      }>;
    },
    async deactivateKbPlugin(params: DeactivateKbPluginParams) {
      return wsClient.rpc("deactivateKbPlugin", params as unknown as Record<string, unknown>) as Promise<{
        ok: boolean;
        reason?: string;
      }>;
    },
    async getKbPluginConfig(pluginId: string) {
      return wsClient.rpc("getKbPluginConfig", { pluginId }) as Promise<Record<string, unknown>>;
    },
    async updateKbPluginConfig(params: UpdateKbPluginConfigParams) {
      return wsClient.rpc("updateKbPluginConfig", params as unknown as Record<string, unknown>) as Promise<{
        ok: boolean;
        reason?: string;
      }>;
    },
    async resolveLibraryItemPath(relativePath: string) {
      return wsClient.rpc("resolveLibraryItemPath", { relativePath }) as Promise<{
        vaultRelativePath: string;
        absolutePath: string;
      }>;
    },
    async openLibraryItem(relativePath: string) {
      return wsClient.rpc("openLibraryItem", { relativePath });
    },
    async revealLibraryItemInFileManager(relativePath: string) {
      return wsClient.rpc("revealLibraryItemInFileManager", { relativePath });
    },
    async discoverPublishedLibrary(params?: DiscoverPublishedLibraryParams) {
      return wsClient.rpc(
        "discoverPublishedLibrary",
        (params ?? {}) as Record<string, unknown>,
        { timeoutMs: 60_000 },
      ) as Promise<DiscoverPublishedLibraryPeerResult[]>;
    },
    async listAgentShareProposals() {
      return wsClient.rpc("listAgentShareProposals") as Promise<AgentShareProposal[]>;
    },
    async dismissAgentShareProposal(proposalId: string) {
      return wsClient.rpc("dismissAgentShareProposal", { proposalId });
    },
    async submitAgentShareProposal(params: SubmitAgentShareProposalParams) {
      return wsClient.rpc("submitAgentShareProposal", params as unknown as Record<string, unknown>) as Promise<
        AgentShareProposal
      >;
    },
    async listPendingShareOffers() {
      return wsClient.rpc("listPendingShareOffers") as Promise<ShareOffer[]>;
    },
    async shareFile(targetOwnerId: string, file: { path: string; sensitivity: "public" | "friends" | "private" }) {
      return wsClient.rpc("shareFile", { targetOwnerId, file } as Record<string, unknown>);
    },
    async acceptShare(shareId: string, savePath: string) {
      return wsClient.rpc("acceptShare", { shareId, savePath });
    },
    async declineShare(shareId: string) {
      return wsClient.rpc("declineShare", { shareId });
    },
    async advertiseTopic(topic: string) { return wsClient.rpc("advertiseTopic", { topic }); },
    async stopAdvertiseTopic(topic: string) { return wsClient.rpc("stopAdvertiseTopic", { topic }); },
    async updateNodeConfig(config: Partial<NodeConfig>) { return wsClient.rpc("updateNodeConfig", config); },
    async getSetupSponsorFriendConfig() {
      return wsClient.rpc("getSetupSponsorFriendConfig") as Promise<
        import("@envoymesh/api").ResolvedSetupSponsorFriend
      >;
    },
    async getSetupSponsorFriendStatus() {
      return wsClient.rpc("getSetupSponsorFriendStatus") as Promise<
        import("@envoymesh/api").SetupSponsorFriendStatus
      >;
    },
    async runSetupSponsorFriend(input?: { forceBypassGuards?: boolean }) {
      // The runtime is fire-and-forget: the RPC kicks off the retry loop
      // in the background and returns immediately with
      // `{ ok: true, running: true }`. The runtime's worst case is well
      // over the default 30s RPC timeout (12 attempts × 30s+ each), so
      // waiting for the loop synchronously would either need a much
      // longer timeout or risk surfacing a misleading "timed out" error
      // before the runtime classifies any failure. The UI's polling of
      // getSetupSponsorFriendStatus surfaces the final result.
      //
      // 60s still gives the synchronous "skipped" paths (already-completed,
      // sponsor-is-self, disabled-or-incomplete) plenty of time to return
      // and gives the self-check + first-attempt kickoff a comfortable
      // budget.
      return wsClient.rpc("runSetupSponsorFriend", input, {
        timeoutMs: 60_000,
      }) as Promise<
        import("@envoymesh/api").RunSetupSponsorFriendResult
      >;
    },
    async listRelays() { return wsClient.rpc("listRelays"); },
    async addRelay(addr: string, level?: number, region?: string) { return wsClient.rpc("addRelay", { addr, level, region }); },
    async removeRelay(relayId: string) { return wsClient.rpc("removeRelay", { relayId }); },
    async initNode(profileDir: string, options?: InitNodeOptions) { return wsClient.rpc("initNode", { profileDir, options }); },
    async getNodeStatus() { return wsClient.rpc("getNodeStatus"); },
    async startNode() { return wsClient.rpc("startNode"); },
    async stopNode() { return wsClient.rpc("stopNode"); },
    async waitForConnection(timeoutMs?: number) { return wsClient.waitForConnection(timeoutMs); },

    // Bypass generic variance: WsClient uses string/unknown, NodeServiceClient uses K/NodeServiceEvents[K]
    on(event: any, handler: any): any {
      return wsClient.on(event, handler);
    },
  };

  return { client, wsClient };
}

export function NodeServiceProvider({
  children,
  clientFactory,
  modelProviderUiScope = "full",
}: {
  children: ReactNode;
  /** Provide a custom client factory for in-process/mobile usage. Defaults to WebSocket. */
  clientFactory?: () => NodeServiceClient;
  /** Capacitor/mobile: hide local engines (Ollama/LiteLLM) in Settings — cloud APIs only. */
  modelProviderUiScope?: ModelProviderUiScope;
}) {
  const [client, setClient] = useState<NodeServiceClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const wsClientRef = useRef<WsClientType | null>(null);
  const [connectionPrefs, setConnectionPrefs] = useState<DesktopConnectionPrefs>(() => {
    const settings = loadAppSettings();
    return {
      wsUrl: settings.wsUrl.trim() || DEFAULT_APP_SETTINGS.wsUrl,
      autoConnect: settings.autoConnect,
    };
  });

  const updateConnectionPrefs = useCallback((patch: Partial<DesktopConnectionPrefs>) => {
    setConnectionPrefs((prev) => ({
      wsUrl: patch.wsUrl?.trim() || prev.wsUrl,
      autoConnect: patch.autoConnect ?? prev.autoConnect,
    }));
  }, []);

  useEffect(() => {
    let active = true;

    if (clientFactory) {
      const nodeService = clientFactory();
      setClient(nodeService);
      void nodeService
        .connect()
        .then(() => {
          if (!active) return;
          setConnected(true);
          setReady(true);
        })
        .catch((err) => {
          if (!active) return;
          console.error("[NodeServiceProvider] connect failed:", err);
          setConnected(false);
        });
      return () => {
        active = false;
        nodeService.disconnect();
      };
    }

    const { client: nodeService, wsClient } = createWsNodeServiceClient(
      connectionPrefs.wsUrl,
      (open) => {
        if (active) setConnected(open);
      },
      (isReady) => {
        if (active) setReady(isReady);
      },
      connectionPrefs.autoConnect,
    );
    wsClientRef.current = wsClient;

    const unsubStatus = wsClient.onStatusChange(() => {
      if (!active) return;
      setLastError(wsClient.getLastError());
      setConnected(wsClient.isConnected());
    });

    if (connectionPrefs.autoConnect) {
      void nodeService
        .connect()
        .then(() => {
          if (!active) return;
          setConnected(wsClient.isConnected());
          setLastError(wsClient.getLastError());
        })
        .catch((err) => {
          if (!active) return;
          console.error("[NodeServiceProvider] WebSocket connect failed:", err);
          setConnected(false);
          setLastError(err instanceof Error ? err.message : String(err));
        });
    } else {
      setConnected(false);
      setReady(false);
    }

    const unsubReady = wsClient.on("node:ready", () => {
      if (active) setReady(true);
    });
    const unsubOnline = wsClient.on("node:online", () => {
      if (active) setReady(true);
    });
    const unsubNodeStatus = wsClient.on("node:status", (data: unknown) => {
      if (!active) return;
      const status = (data as { status?: string } | undefined)?.status;
      if (status === "running") {
        setReady(true);
      } else if (status === "offline") {
        setReady(false);
      }
    });

    const reconnectInterval = setInterval(() => {
      if (!active) return;
      setReconnectAttempts(wsClient.getReconnectAttempts());
      setLastError(wsClient.getLastError());
      setConnected(wsClient.isConnected());
    }, 1000);

    setClient(nodeService);

    return () => {
      active = false;
      clearInterval(reconnectInterval);
      unsubStatus();
      unsubReady();
      unsubOnline();
      unsubNodeStatus();
      wsClientRef.current = null;
      nodeService.disconnect();
      setConnected(false);
      setReady(false);
    };
  }, [clientFactory, connectionPrefs.wsUrl]);

  const prevAutoConnectRef = useRef(connectionPrefs.autoConnect);
  useEffect(() => {
    if (clientFactory) return;
    const wsClient = wsClientRef.current;
    if (!wsClient) return;
    if (prevAutoConnectRef.current === connectionPrefs.autoConnect) return;
    prevAutoConnectRef.current = connectionPrefs.autoConnect;

    wsClient.setAutoReconnectEnabled(connectionPrefs.autoConnect);
    if (connectionPrefs.autoConnect) {
      void wsClient.reconnectTo();
    } else {
      wsClient.closeConnection();
      setConnected(false);
      setReady(false);
    }
  }, [clientFactory, connectionPrefs.autoConnect]);

  // Proxy delegates all calls to the real client while overriding connection-tracked
  // getters. Necessary because class instances (DirectCallClient) store methods on
  // the prototype — { ...client } would lose them.
  // Memoized so hooks depending on nodeService don't re-run on every render.
  const ctx = useMemo(() => {
    if (!client) return null;
    return new Proxy(client, {
      get(target, prop, receiver) {
        if (prop === "isConnected") return connected;
        if (prop === "isReady") return ready;
        if (prop === "reconnectAttempts") return reconnectAttempts;
        if (prop === "getLastError") return () => lastError;
        return Reflect.get(target, prop, receiver);
      },
    }) as NodeServiceClient;
  }, [client, connected, ready, reconnectAttempts, lastError]);

  if (!client) {
    return (
      <div className="app">
        <div className="envoy-splash" role="status" aria-live="polite" aria-busy="true">
          <div className="envoy-splash__backdrop" aria-hidden />
          <div className="envoy-splash__card">
            <div className="envoy-splash__mesh" aria-hidden />
            <div className="loading-spinner envoy-splash__spinner" />
            <h2 className="envoy-splash__title">Starting EnvoyMesh…</h2>
            <p className="envoy-splash__detail">Loading the app. Your home node may still be starting.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DesktopConnectionPrefsContext.Provider value={{ updatePrefs: updateConnectionPrefs }}>
      <TransportWsContext.Provider value={connected}>
        <ModelProviderUiScopeContext.Provider value={modelProviderUiScope}>
          <NodeServiceContext.Provider value={ctx}>
            <TerminalSessionsProvider>{children}</TerminalSessionsProvider>
          </NodeServiceContext.Provider>
        </ModelProviderUiScopeContext.Provider>
      </TransportWsContext.Provider>
    </DesktopConnectionPrefsContext.Provider>
  );
}

function TerminalSessionsProvider({ children }: { children: ReactNode }) {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [sessions, setSessions] = useState<import("@envoymesh/api").TerminalSessionSummary[]>([]);
  const cleanedStaleRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!wsOpen || !client.isConnected) return;
    try {
      const list = await client.listTerminalSessions();
      setSessions(list);
      if (!cleanedStaleRef.current) {
        cleanedStaleRef.current = true;
        const stale = list.filter((s) => s.state !== "running");
        if (stale.length > 0) {
          for (const row of stale) {
            try {
              await client.closeTerminalSession({ sessionId: row.sessionId });
            } catch {
              /* session may already be gone */
            }
          }
          const next = await client.listTerminalSessions();
          setSessions(next);
        }
      }
    } catch {
      // Owner-only / terminals unavailable — keep last snapshot.
    }
  }, [client, wsOpen]);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) {
      setSessions([]);
      cleanedStaleRef.current = false;
      return;
    }
    void refresh();
    const unsub = client.on("terminal:session-updated", (data) => {
      const payload = data as { sessions?: import("@envoymesh/api").TerminalSessionSummary[] };
      if (Array.isArray(payload?.sessions)) {
        setSessions(payload.sessions);
        return;
      }
      void refresh();
    });
    return unsub;
  }, [client, wsOpen, refresh]);

  const value = useMemo(
    () => ({ sessions, refresh }),
    [sessions, refresh],
  );

  return (
    <TerminalSessionsContext.Provider value={value}>{children}</TerminalSessionsContext.Provider>
  );
}

export function useTerminalSessions(): TerminalSessionsContextValue {
  const ctx = useContext(TerminalSessionsContext);
  if (!ctx) {
    throw new Error("useTerminalSessions must be used within NodeServiceProvider");
  }
  return ctx;
}

export function useNodeService(): NodeServiceClient {
  const ctx = useContext(NodeServiceContext);
  if (!ctx) {
    throw new Error("useNodeService must be used within NodeServiceProvider");
  }
  return ctx;
}

export function useConnectionStatus() {
  const client = useNodeService();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  useEffect(() => {
    client.on("node:online", (data) => {
      setStatus(data as ConnectionStatus);
    });
  }, [client]);

  return status;
}

/**
 * Phase 34: track the latest snapshot of cached peer AgentCards. The store is
 * updated by the home node (or by the mobile node's paired bootstrap) and
 * re-emitted as `home:agent-cards-updated` so this hook just keeps the latest
 * list in state.
 */
export function useAgentCards() {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [cards, setCards] = useState<import("@envoymesh/api").CachedAgentCardSummary[]>([]);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;

    const refresh = () =>
      client.listAgentCards()
        .then((list) => setCards(Array.isArray(list) ? list : []))
        .catch(console.error);

    // Initial load
    refresh();

    // Listen for paired-mode pushes from the home node.
    const unsubHomeCards = client.on("home:agent-cards-updated", refresh);

    return () => {
      unsubHomeCards();
    };
  }, [client, wsOpen]);

  return cards;
}

export function useBonds() {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [bonds, setBonds] = useState<BondRecord[]>([]);
  // Track our own ownerId so we can drop the self-bond (a satellite paired in
  // shared-identity mode lands in our trust store as `peerOwnerId === self`).
  const [selfOwnerId, setSelfOwnerId] = useState<string>("");

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;
    let cancelled = false;
    client.getProfile()
      .then((prof) => { if (!cancelled) setSelfOwnerId(prof?.owner?.ownerId ?? ""); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [client, wsOpen]);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;

    const refresh = () =>
      client.getBonds()
        .then((all) => {
          // Filter out the self-bond created by shared-identity pairing.
          const so = selfOwnerId.trim();
          setBonds(so ? all.filter((b) => b.peerOwnerId !== so) : all);
        })
        .catch(console.error);

    // Initial load
    refresh();

    // Listen for changes
    const unsubEstablished = client.on("bond:established", refresh);
    const unsubRevoked = client.on("bond:revoked", refresh);
    // In paired mode, the bootstrap fetches the home's bonds and emits
    // `home:bonds-updated`. The hook must re-fetch to surface them.
    const unsubHomeBonds = client.on("home:bonds-updated", refresh);

    return () => {
      unsubEstablished();
      unsubRevoked();
      unsubHomeBonds();
    };
  }, [client, wsOpen, selfOwnerId]);

  return bonds;
}

export function useSocialIntroProposals() {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [proposals, setProposals] = useState<SocialIntroProposal[]>([]);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;

    void client.listPendingSocialIntroProposals().then(setProposals).catch(console.error);

    const unsub = client.on("social.intro:propose", (data) => {
      setProposals((prev) => {
        if (prev.some((p) => p.messageId === data.messageId)) return prev;
        return [...prev, data];
      });
    });

    return unsub;
  }, [client, wsOpen]);

  const approveCommitment = async (messageId: string) => {
    await client.approveSocialIntroCommitment(messageId);
    const fresh = await client.listPendingSocialIntroProposals();
    setProposals(fresh);
  };

  const decline = async (messageId: string) => {
    await client.declineSocialIntroProposal(messageId);
    setProposals((prev) => prev.filter((p) => p.messageId !== messageId));
  };

  return { proposals, approveCommitment, decline };
}

export function useFeedNotifications() {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [items, setItems] = useState<import("@envoymesh/api").FeedNotification[]>([]);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;

    void client.listFeedNotifications().then(setItems).catch(console.error);

    const unsub = client.on("feed:notify", (data) => {
      setItems((prev) => {
        if (prev.some((p) => p.messageId === data.messageId || p.id === data.id)) return prev;
        return [data, ...prev];
      });
    });

    return unsub;
  }, [client, wsOpen]);

  const unread = items.filter((p) => !p.readAt?.trim());

  const dismiss = async (id: string) => {
    await client.dismissFeedNotification(id);
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, readAt } : p)));
  };

  /**
   * Mark all feed notifications read when Content → Feed opens — clears the badge
   * without deleting rows that the Feed timeline still needs.
   */
  const dismissAll = async () => {
    await client.dismissAllFeedNotifications();
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((p) => (p.readAt ? p : { ...p, readAt })));
  };

  return { items, unread, dismiss, dismissAll };
}

/**
 * Unread stars/comments on the owner's Feed/Blog posts.
 * Powers Content / Feed / Blog nav badges; clear when those surfaces open.
 */
export function useContentEngageNotifications() {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [items, setItems] = useState<import("@envoymesh/api").ContentEngageNotification[]>([]);
  const loadGen = useRef(0);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;

    const gen = ++loadGen.current;
    void client.listContentEngageNotifications()
      .then((rows) => {
        if (gen !== loadGen.current) return;
        setItems(rows);
      })
      .catch(console.error);

    const unsub = client.on("content:engage", (data) => {
      // Snapshot updates refresh Moments bars only — not Content badges.
      if (data.action === "snapshot") return;
      setItems((prev) => {
        if (prev.some((p) => p.messageId === data.messageId || p.id === data.id)) return prev;
        return [data, ...prev];
      });
    });

    return unsub;
  }, [client, wsOpen]);

  const dismiss = useCallback(
    async (surface: import("@envoymesh/api").ContentEngageSurface | "all" = "all") => {
      // Invalidate any in-flight list so it cannot restore cleared badges.
      loadGen.current += 1;
      await client.dismissContentEngageNotifications({ surface });
      setItems((prev) => (surface === "all" ? [] : prev.filter((p) => p.surface !== surface)));
    },
    [client],
  );

  const feedCount = items.filter((i) => i.surface === "feed").length;
  const blogCount = items.filter((i) => i.surface === "blog").length;

  return { items, feedCount, blogCount, totalCount: items.length, dismiss };
}

export function useHelloRequests() {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [requests, setRequests] = useState<HelloRequest[]>([]);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;

    const unsub = client.on("hello:request", (data) => {
      setRequests((prev) => [...prev, data as HelloRequest]);
    });

    return unsub;
  }, [client, wsOpen]);

  const accept = async (messageId: string) => {
    await client.acceptHello(messageId);
    setRequests((prev) => prev.filter((r) => r.messageId !== messageId));
  };

  const decline = async (messageId: string, reason?: string) => {
    await client.declineHello(messageId, reason);
    setRequests((prev) => prev.filter((r) => r.messageId !== messageId));
  };

  return { requests, accept, decline };
}

export function usePendingApprovals() {
  const client = useNodeService();
  const [items, setItems] = useState<import("@envoymesh/api").PendingApprovalSummary[]>([]);

  useEffect(() => {
    if (!client.isConnected) return;

    void client.listPendingApprovals().then(setItems).catch(console.error);

    const unsubDraft = client.on("chat:draft", () => {
      void client.listPendingApprovals().then(setItems).catch(console.error);
    });

    return unsubDraft;
  }, [client]);

  const approve = async (itemId: string, notes?: string) => {
    const result = await client.approvePendingApproval(itemId, notes);
    const fresh = await client.listPendingApprovals();
    setItems(fresh);
    return result;
  };

  const reject = async (itemId: string, notes?: string) => {
    await client.rejectPendingApproval(itemId, notes);
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  return { items, approve, reject };
}

export function useShareOffers() {
  const client = useNodeService();
  const [offers, setOffers] = useState<ShareOffer[]>([]);

  useEffect(() => {
    if (!client.isConnected) return;

    void client.listPendingShareOffers().then(setOffers).catch(console.error);

    const unsubOffered = client.on("share:offered", () => {
      void client.listPendingShareOffers().then(setOffers).catch(console.error);
    });
    const unsubAccepted = client.on("share:accepted", () => {
      void client.listPendingShareOffers().then(setOffers).catch(console.error);
    });
    const unsubDeclined = client.on("share:declined", () => {
      void client.listPendingShareOffers().then(setOffers).catch(console.error);
    });

    return () => {
      unsubOffered();
      unsubAccepted();
      unsubDeclined();
    };
  }, [client]);

  const accept = async (shareId: string, savePath = "") => {
    await client.acceptShare(shareId, savePath);
    const fresh = await client.listPendingShareOffers();
    setOffers(fresh);
  };

  const decline = async (shareId: string) => {
    await client.declineShare(shareId);
    const fresh = await client.listPendingShareOffers();
    setOffers(fresh);
  };

  return { offers, accept, decline };
}

export function useAgentShareProposals() {
  const client = useNodeService();
  const [proposals, setProposals] = useState<AgentShareProposal[]>([]);

  useEffect(() => {
    if (!client.isConnected) return;

    void client.listAgentShareProposals().then(setProposals).catch(console.error);

    const unsub = client.on("share:agent-proposed", (data) => {
      setProposals((prev) => {
        const p = data as AgentShareProposal;
        if (prev.some((x) => x.proposalId === p.proposalId)) return prev;
        return [...prev, p];
      });
    });

    return unsub;
  }, [client]);

  const dismiss = async (proposalId: string) => {
    await client.dismissAgentShareProposal(proposalId);
    setProposals((prev) => prev.filter((p) => p.proposalId !== proposalId));
  };

  return { proposals, dismiss };
}

/** Thread key = contact's owner id (bonds use `peerOwnerId`). */
function partnerOwnerIdForChat(
  msg: ChatMessage,
  selfOwnerId: string,
  selfPeerId: string,
): string | null {
  return resolveChatThreadKey(msg, selfOwnerId, selfPeerId);
}

function appendChatToThreads(
  prev: Record<string, ChatMessage[]>,
  msg: ChatMessage,
  self: { ownerId: string; peerId: string; familyProfileId?: string },
): Record<string, ChatMessage[]> | null {
  const familyProfileId = self.familyProfileId ?? OWNER_FAMILY_PROFILE_ID;
  if (
    !isChatMessageVisibleToProfile(msg, {
      familyProfileId,
      selfOwnerId: self.ownerId,
      selfPeerId: self.peerId,
    })
  ) {
    return null;
  }
  const key = partnerOwnerIdForChat(msg, self.ownerId, self.peerId);
  if (!key) {
    console.warn("[useChatMessages] could not route chat to a thread (missing owner match)", msg.messageId);
    return null;
  }
  const list = prev[key] ?? [];
  const existingIdx = list.findIndex((m) => m.messageId === msg.messageId);
  if (existingIdx >= 0) {
    const nextList = [...list];
    nextList[existingIdx] = msg;
    return { ...prev, [key]: nextList };
  }
  const ts = (m: ChatMessage) => {
    const raw = m.metadata?.timestamp;
    const n = typeof raw === "string" ? new Date(raw).getTime() : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  const nextList = [...list, msg].sort((a, b) => ts(a) - ts(b));
  return { ...prev, [key]: nextList };
}

export function useChatMessages(selectedContactOwnerId: string | null) {
  const client = useNodeService();
  const [threads, setThreadsState] = useState<Record<string, ChatMessage[]>>(() => ({
    ...snapshotChatThreadsCache(),
  }));
  const setThreads = useCallback(
    (action: Record<string, ChatMessage[]> | ((prev: Record<string, ChatMessage[]>) => Record<string, ChatMessage[]>)) => {
      setThreadsState((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        replaceChatThreadsCache(next);
        return next;
      });
    },
    [],
  );
  const [selfIds, setSelfIds] = useState<{
    ownerId: string;
    peerId: string;
    familyProfileId: string;
  } | null>(null);
  const pendingUntilSelfReady = useRef<ChatMessage[]>([]);
  const selfIdsRef = useRef(selfIds);

  selfIdsRef.current = selfIds;

  useEffect(() => {
    if (!client.isConnected) return;
    let cancelled = false;
    // Load owner id first — chat history only needs ownerId for routing; do not block on
    // getConnectionStatus (mesh may report offline while local chat log is still readable).
    void client
      .getProfile()
      .then((prof) => {
        if (cancelled) return;
        const ownerId = prof?.owner?.ownerId ?? "";
        setSelfIds((prev) => ({
          ownerId: ownerId || prev?.ownerId || "",
          peerId: prev?.peerId ?? "",
          familyProfileId: prev?.familyProfileId ?? OWNER_FAMILY_PROFILE_ID,
        }));
      })
      .catch(console.error);
    void client
      .getConnectionStatus()
      .then((cs) => {
        if (cancelled) return;
        setSelfIds((prev) => ({
          ownerId: prev?.ownerId ?? "",
          peerId: cs?.peerId ?? "",
          familyProfileId: prev?.familyProfileId ?? OWNER_FAMILY_PROFILE_ID,
        }));
      })
      .catch(console.error);
    void client
      .getNodeConfig()
      .then((cfg) => {
        if (cancelled) return;
        const familyProfileId =
          (cfg as { callerFamilyProfileId?: string } | null)?.callerFamilyProfileId?.trim() ||
          OWNER_FAMILY_PROFILE_ID;
        setSelfIds((prev) => ({
          ownerId: prev?.ownerId ?? "",
          peerId: prev?.peerId ?? "",
          familyProfileId,
        }));
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [client, client.isConnected]);

  useEffect(() => {
    if (!client.isConnected) return;

    const unsubMessage = client.on("chat:message", (data) => {
      const msg = data as ChatMessage;
      const self = selfIdsRef.current;
      if (!self?.ownerId) {
        pendingUntilSelfReady.current.push(msg);
        return;
      }
      setThreads((prev) => appendChatToThreads(prev, msg, self) ?? prev);
    });

    const unsubRoomMessage = client.on("chat:room-message", (data) => {
      const { message } = data as ChatRoomMessageEvent;
      const self = selfIdsRef.current;
      if (!self?.ownerId) {
        pendingUntilSelfReady.current.push(message);
        return;
      }
      setThreads((prev) => appendChatToThreads(prev, message, self) ?? prev);
    });

    const unsubDelivered = client.on("chat:delivered", (data) => {
      const { messageId, recipientOwnerId } = data as {
        messageId: string;
        recipientOwnerId?: string;
      };
      if (!messageId) return;
      setThreads((prev) => {
        let changed = false;
        const next: Record<string, ChatMessage[]> = {};
        for (const [threadId, list] of Object.entries(prev)) {
          const updated = list.map((m) => {
            if (m.messageId !== messageId) return m;
            if (m.metadata.deliveryReceipt === "delivered") return m;
            changed = true;
            if (!recipientOwnerId) {
              return {
                ...m,
                metadata: { ...m.metadata, deliveryReceipt: "delivered" as const },
              };
            }
            return {
              ...m,
              metadata: mergeGroupDeliveryAck(m.metadata, recipientOwnerId),
            };
          });
          next[threadId] = updated;
        }
        return changed ? next : prev;
      });
    });

    return () => {
      unsubMessage();
      unsubRoomMessage();
      unsubDelivered();
    };
  }, [client, client.isConnected]);

  useEffect(() => {
    if (!client.isConnected || !selectedContactOwnerId) return;
    const familyProfileId =
      selfIdsRef.current?.familyProfileId ?? OWNER_FAMILY_PROFILE_ID;
    // Never request / merge history for threads this profile cannot see
    // (e.g. family:dad:mom on owner Social).
    if (!isThreadVisibleToProfile(selectedContactOwnerId, familyProfileId)) {
      return;
    }
    let cancelled = false;
    const threadKey = selectedContactOwnerId;
    const loadHistory = async (attempt: number) => {
      try {
        const history = await client.listChatHistory(threadKey);
        if (cancelled || !Array.isArray(history)) return;
        setThreads((prev) => mergeMessagesIntoThread(prev, threadKey, history));
      } catch (err) {
        if (cancelled) return;
        if (attempt === 0) {
          // Reachability warm/redial may still be occupying the node RPC queue — retry once.
          window.setTimeout(() => {
            if (!cancelled) void loadHistory(1);
          }, 1_500);
          return;
        }
        console.error("[useChatMessages] listChatHistory failed:", err);
      }
    };
    void loadHistory(0);
    return () => {
      cancelled = true;
    };
  }, [
    client,
    client.isConnected,
    selectedContactOwnerId,
    setThreads,
    selfIds?.familyProfileId,
  ]);

  useEffect(() => {
    if (!selfIds?.ownerId) return;
    const self = selfIds;
    const flushed = pendingUntilSelfReady.current.splice(0);
    setThreads((prev) => {
      // Drop any cached Dad↔Mom / other-profile threads left from older bugs.
      let next = pruneThreadsForProfile(
        prev,
        self.familyProfileId || OWNER_FAMILY_PROFILE_ID,
      );
      for (const m of flushed) {
        const n = appendChatToThreads(next, m, self);
        if (n) next = n;
      }
      return next;
    });
  }, [selfIds, setThreads]);

  const isOutgoing = (msg: ChatMessage) =>
    !!(
      selfIds?.ownerId &&
      messageIsOutgoing(
        msg,
        selfIds.ownerId,
        selfIds.peerId,
        selfIds.familyProfileId,
      )
    );

  const removeMessage = useCallback(
    async (messageId: string) => {
      if (!selectedContactOwnerId) return false;
      try {
        const result = await client.deleteChatMessage(selectedContactOwnerId, messageId);
        if (result.ok) {
          setThreads((prev) => ({
            ...prev,
            [selectedContactOwnerId]: (prev[selectedContactOwnerId] ?? []).filter(
              (m) => m.messageId !== messageId,
            ),
          }));
        }
        return result.ok;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    [client, selectedContactOwnerId],
  );

  const clearThread = useCallback(async () => {
    if (!selectedContactOwnerId) return 0;
    try {
      const result = await client.clearChatHistory(selectedContactOwnerId);
      if (result.deletedCount > 0) {
        setThreads((prev) => ({ ...prev, [selectedContactOwnerId]: [] }));
      }
      return result.deletedCount;
    } catch (error) {
      console.error(error);
      return 0;
    }
  }, [client, selectedContactOwnerId]);

  return {
    messages: selectedContactOwnerId ? threads[selectedContactOwnerId] ?? [] : [],
    isOutgoing,
    removeMessage,
    clearThread,
  };
}
