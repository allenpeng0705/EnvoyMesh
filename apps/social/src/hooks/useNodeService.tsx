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
import { isChatRoomThreadKey, ENVOY_AI_THREAD_KEY, TERMINAL_ASSIST_RPC_TIMEOUT_MS } from "@envoymesh/api";
import { mergeGroupDeliveryAck } from "@envoymesh/api/group-chat-delivery";
import {
  mergeMessagesIntoThread,
  replaceChatThreadsCache,
  snapshotChatThreadsCache,
} from "../lib/chat-threads-cache.js";

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
  sendChat(targetOwnerId: string, text: string, attachments?: SendChatParams["attachments"]): Promise<SendChatResult>;
  sendAgentChat(targetOwnerId: string, text: string): Promise<SendChatResult>;
  sendChatAttachment(params: SendChatAttachmentParams): Promise<SendChatAttachmentResult>;
  readLibraryItemContent(params: ReadLibraryItemContentParams): Promise<ReadLibraryItemContentResult>;
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
  getAgentCard(ownerId: string): Promise<import("@envoymesh/api").CachedAgentCardSummary | undefined>;
  requestAgentCard(targetOwnerId: string): Promise<{ ok: boolean; error?: string }>;
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
  advertiseTopic(topic: string): Promise<void>;
  stopAdvertiseTopic(topic: string): Promise<void>;

  // Connection Status
  getConnectionStatus(): Promise<ConnectionStatus>;
  getPeerConnectionInfo(peerOwnerId: string): Promise<{ connected: boolean; direct: boolean; relayPeerId?: string }>;
  warmContactConnection(
    peerOwnerId: string,
    options?: { redial?: boolean; verifyOnly?: boolean; upgradeRelayToDirect?: boolean; keepAlive?: boolean; verifyConnection?: boolean },
  ): Promise<{ connected: boolean; direct: boolean; relayPeerId?: string }>;
  getChatDiagnostics(peerOwnerId?: string): Promise<ChatDiagnostics>;
  getConnectivityDiagnostics(): Promise<ConnectivityDiagnostics>;

  // Phase 40 — Agent Network Collaboration Layer
  chainPlan(params: ChainPlanParams): Promise<ChainPlanResult>;
  chainLaunch(params: ChainLaunchParams): Promise<ChainLaunchResult>;
  chainGetState(params: ChainGetStateParams): Promise<ChainGetStateResult>;
  chainListActive(params?: ChainListActiveParams): Promise<ChainListActiveResult>;
  chainCancel(params: ChainCancelParams): Promise<ChainCancelResult>;
  chainListReports(params?: ChainListReportsParams): Promise<ChainListReportsResult>;
  chainGetReport(params: ChainGetReportParams): Promise<ChainGetReportResult>;
  chainPinReport(params: ChainPinReportParams): Promise<ChainPinReportResult>;
  chainSetBidStrategy(params: ChainSetBidStrategyParams): Promise<ChainSetBidStrategyResult>;
  chainGetBidStrategy(params: ChainGetBidStrategyParams): Promise<ChainGetBidStrategyResult>;
  chainEvaluateBids(params: ChainEvaluateBidsParams): Promise<ChainEvaluateBidsResult>;
  chainCounterBid(params: ChainCounterBidParams): Promise<ChainCounterBidResult>;
  chainRebalance(params: ChainRebalanceParams): Promise<ChainRebalanceResult>;
  chainGetDefaults(params: ChainGetDefaultsParams): Promise<ChainGetDefaultsResult>;
  chainSetDefaults(params: ChainSetDefaultsParams): Promise<ChainSetDefaultsResult>;
  chainPreviewGoal(params: ChainPreviewGoalParams): Promise<ChainPreviewGoalResult>;
  chainStartFromGoal(params: ChainStartFromGoalParams): Promise<ChainStartFromGoalResult>;
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
  /** Force-restart the built-in OpenClaw gateway. */
  restartOpenClaw(): Promise<import("@envoymesh/api").OpenClawStatus>;
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
  getPairedDiagnostics?(): Promise<Record<string, unknown>>;

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
  verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult>;
  importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult>;
  createNote(params: CreateNoteParams): Promise<CreateNoteResult>;
  deleteVaultItem(params: DeleteVaultItemParams): Promise<void>;
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

/** True when WebSocket/mobile transport is up (daemon may still be stopped). Separate from mesh "online". */
const TransportWsContext = createContext(false);

export function useTransportWsOpen(): boolean {
  return useContext(TransportWsContext);
}

/** Mobile shell only exposes cloud-friendly provider modes in Settings; desktop uses full. */
export type ModelProviderUiScope = "full" | "cloud-only";

/** How Social talks to NodeService — WebSocket desktop vs in-process Capacitor DirectCallClient. */
export type NodeClientTransport = "websocket" | "direct-call";

const ModelProviderUiScopeContext = createContext<ModelProviderUiScope>("full");
const NodeClientTransportContext = createContext<NodeClientTransport>("websocket");

export function useModelProviderUiScope(): ModelProviderUiScope {
  return useContext(ModelProviderUiScopeContext);
}

export function useNodeClientTransport(): NodeClientTransport {
  return useContext(NodeClientTransportContext);
}

/** True when running the Capacitor mobile app (DirectCallClient → MobileNode). */
export function useIsInProcessMobileNode(): boolean {
  return useNodeClientTransport() === "direct-call";
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
    async sendChat(targetOwnerId: string, text: string) {
      return wsClient.rpc("sendChat", { targetOwnerId, text }, { timeoutMs: 120_000 });
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
    async getAgentCard(ownerId: string) {
      return wsClient.rpc("getAgentCard", { ownerId }) as Promise<
        import("@envoymesh/api").CachedAgentCardSummary | undefined
      >;
    },
    async requestAgentCard(targetOwnerId: string) {
      return wsClient.rpc("requestAgentCard", { targetOwnerId }) as Promise<{ ok: boolean; error?: string }>;
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
    async runCapabilityDiscovery(params?: { find?: boolean }) {
      return wsClient.rpc("runCapabilityDiscovery", params ?? {});
    },
    async getNodeConfig() { return wsClient.rpc("getNodeConfig"); },
    async getConnectionStatus() { return wsClient.rpc("getConnectionStatus"); },
    async getPeerConnectionInfo(peerOwnerId: string) { return wsClient.rpc("getPeerConnectionInfo", { peerOwnerId }); },
    async warmContactConnection(peerOwnerId: string, options?: { redial?: boolean; verifyOnly?: boolean; upgradeRelayToDirect?: boolean; keepAlive?: boolean; verifyConnection?: boolean }) {
      return wsClient.rpc(
        "warmContactConnection",
        {
          peerOwnerId,
          ...(options?.redial ? { redial: true } : {}),
          ...(options?.verifyOnly ? { verifyOnly: true } : {}),
          ...(options?.upgradeRelayToDirect ? { upgradeRelayToDirect: true } : {}),
          ...(options?.keepAlive ? { keepAlive: true } : {}),
          ...(options?.verifyConnection ? { verifyConnection: true } : {}),
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
    // Phase 40 — chain RPCs
    async chainPlan(params: ChainPlanParams) {
      return wsClient.rpc("chainPlan", (params ?? {}) as unknown as Record<string, unknown>) as unknown as Promise<ChainPlanResult>;
    },
    async chainLaunch(params: ChainLaunchParams) {
      return wsClient.rpc("chainLaunch", params as unknown as Record<string, unknown>) as unknown as Promise<ChainLaunchResult>;
    },
    async chainGetState(params: ChainGetStateParams) {
      return wsClient.rpc("chainGetState", params as unknown as Record<string, unknown>) as unknown as Promise<ChainGetStateResult>;
    },
    async chainListActive(params?: ChainListActiveParams) {
      return wsClient.rpc("chainListActive", (params ?? {}) as unknown as Record<string, unknown>) as unknown as Promise<ChainListActiveResult>;
    },
    async chainCancel(params: ChainCancelParams) {
      return wsClient.rpc("chainCancel", params as unknown as Record<string, unknown>) as unknown as Promise<ChainCancelResult>;
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
      return wsClient.rpc("chainPreviewGoal", params as unknown as Record<string, unknown>) as unknown as Promise<ChainPreviewGoalResult>;
    },
    async chainStartFromGoal(params: ChainStartFromGoalParams) {
      return wsClient.rpc("chainStartFromGoal", params as unknown as Record<string, unknown>) as unknown as Promise<ChainStartFromGoalResult>;
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
    async restartOpenClaw() {
      // Force-restart is potentially slow (kill child + 250ms port-release
      // wait + 90s startup probe budget). Use the long-form RPC variant
      // with a 120s timeout so the button doesn't time out at the default
      // 30s while the gateway is still trying to come up.
      return wsClient.rpc("restartOpenClaw", {}, { timeoutMs: 120_000 }) as Promise<import("@envoymesh/api").OpenClawStatus>;
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
    async getPairedDiagnostics() {
      return wsClient.rpc("getPairedDiagnostics", {}) as Promise<Record<string, unknown>>;
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
    async createNote(params: CreateNoteParams) {
      return wsClient.rpc("createNote", params as unknown as Record<string, unknown>) as Promise<
        CreateNoteResult
      >;
    },
    async deleteVaultItem(params: DeleteVaultItemParams) {
      return wsClient.rpc("deleteVaultItem", params as unknown as Record<string, unknown>);
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

  const nodeClientTransport: NodeClientTransport = clientFactory ? "direct-call" : "websocket";

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
        <NodeClientTransportContext.Provider value={nodeClientTransport}>
          <ModelProviderUiScopeContext.Provider value={modelProviderUiScope}>
            <NodeServiceContext.Provider value={ctx}>
              {children}
            </NodeServiceContext.Provider>
          </ModelProviderUiScopeContext.Provider>
        </NodeClientTransportContext.Provider>
      </TransportWsContext.Provider>
    </DesktopConnectionPrefsContext.Provider>
  );
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
  const selfO = selfOwnerId.trim();
  const selfP = selfPeerId.trim();
  const sndO = msg.sender.ownerId?.trim();
  const sndN = msg.sender.nodeId?.trim();
  const rcvO = msg.recipient.ownerId?.trim();
  const rcvN = msg.recipient.nodeId?.trim();

  if (rcvO && isChatRoomThreadKey(rcvO)) {
    return rcvO;
  }
  if (rcvO === ENVOY_AI_THREAD_KEY || sndO === ENVOY_AI_THREAD_KEY) {
    return ENVOY_AI_THREAD_KEY;
  }

  // Use ownerId as primary routing key (ownerIds are distinct even when
  // both peers share the same node, e.g. bridge agent running on same node).
  if (sndO && sndO === selfO && rcvO && rcvO !== selfO) {
    return rcvO;
  }
  if (rcvO && rcvO === selfO && sndO && sndO !== selfO) {
    return sndO;
  }
  // Fallback: nodeId-based routing when ownerId is unavailable or matches both sides
  const sndNIsSelf = !!selfP && sndN === selfP;
  const rcvNIsSelf = !!selfP && rcvN === selfP;
  if (sndNIsSelf && !rcvNIsSelf) return rcvO ?? rcvN ?? null;
  if (rcvNIsSelf && !sndNIsSelf) return sndO ?? sndN ?? null;
  return null;
}

function messageIsOutgoing(msg: ChatMessage, selfOwnerId: string, selfPeerId: string): boolean {
  const selfO = selfOwnerId.trim();
  const selfP = selfPeerId.trim();
  const sndO = msg.sender.ownerId?.trim();
  const sndN = msg.sender.nodeId?.trim();
  return (sndO !== undefined && sndO === selfO) || (!!selfP && sndN === selfP);
}

function appendChatToThreads(
  prev: Record<string, ChatMessage[]>,
  msg: ChatMessage,
  self: { ownerId: string; peerId: string },
): Record<string, ChatMessage[]> | null {
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
  const [selfIds, setSelfIds] = useState<{ ownerId: string; peerId: string } | null>(null);
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
  }, [client, client.isConnected, selectedContactOwnerId, setThreads]);

  useEffect(() => {
    if (!selfIds?.ownerId) return;
    const self = selfIds;
    const flushed = pendingUntilSelfReady.current.splice(0);
    if (flushed.length === 0) return;
    setThreads((prev) => {
      let next = prev;
      for (const m of flushed) {
        const n = appendChatToThreads(next, m, self);
        if (n) next = n;
      }
      return next;
    });
  }, [selfIds]);

  const isOutgoing = (msg: ChatMessage) =>
    !!(selfIds?.ownerId && messageIsOutgoing(msg, selfIds.ownerId, selfIds.peerId));

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