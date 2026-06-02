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
  ExportLibraryItemToIpfsResult,
  VerifyLibraryItemIpfsGatewayParams,
  VerifyLibraryItemIpfsGatewayResult,
  ImportToLibraryParams,
  ImportToLibraryResult,
  IpfsEngineStatus,
  RagIndexStatus,
} from "@envoymesh/api";
import { isChatRoomThreadKey } from "@envoymesh/api";
import { mergeGroupDeliveryAck } from "@envoymesh/api/group-chat-delivery";

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
  revokeBond(peerOwnerId: string): Promise<void>;
  getBonds(): Promise<BondRecord[]>;
  listPendingSocialIntroProposals(): Promise<SocialIntroProposal[]>;
  approveSocialIntroCommitment(messageId: string): Promise<{ ownerCommitmentRef: string }>;
  declineSocialIntroProposal(messageId: string): Promise<void>;

  // Messaging
  sendChat(targetOwnerId: string, text: string): Promise<SendChatResult>;
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
  listAgentActivity(params?: import("@envoymesh/api").ListAgentActivityParams): Promise<import("@envoymesh/api").AgentActivityRecord[]>;
  listCommerceReceipts(
    params?: import("@envoymesh/api").ListCommerceReceiptsParams,
  ): Promise<import("@envoymesh/api").CommerceReceiptRecord[]>;
  recordCommerceReceipt(
    params: import("@envoymesh/api").RecordCommerceReceiptParams,
  ): Promise<import("@envoymesh/api").CommerceReceiptRecord>;
  listAuditEvents(params?: import("@envoymesh/api").ListAuditEventsParams): Promise<import("@envoymesh/api").AuditEventSummary[]>;
  listTaskJournalEntries(params?: import("@envoymesh/api").ListTaskJournalParams): Promise<import("@envoymesh/api").TaskJournalSummary[]>;
  listAgentCards(): Promise<import("@envoymesh/api").CachedAgentCardSummary[]>;
  getAgentCard(ownerId: string): Promise<import("@envoymesh/api").CachedAgentCardSummary | undefined>;
  requestAgentCard(targetOwnerId: string): Promise<{ ok: boolean; error?: string }>;
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
  warmContactConnection(peerOwnerId: string): Promise<{ connected: boolean; direct: boolean; relayPeerId?: string }>;
  getChatDiagnostics(peerOwnerId?: string): Promise<ChatDiagnostics>;
  getConnectivityDiagnostics(): Promise<ConnectivityDiagnostics>;
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
  getPairingPayload(): Promise<PairingPayload>;
  createWanJoinInvite(
    params?: import("@envoymesh/api").CreateWanJoinInviteParams,
  ): Promise<import("@envoymesh/api").CreateWanJoinInviteResult>;
  applyWanJoinInvite(token: string): Promise<import("@envoymesh/api").ApplyWanJoinInviteResult>;
  pairWithHomeNode(params: import("@envoymesh/api").PairWithHomeNodeParams): Promise<import("@envoymesh/api").PairWithHomeNodeResult>;
  listAuthorizedDevices(): Promise<import("@envoymesh/api").ListAuthorizedDevicesResult>;
  revokeAuthorizedDevice(
    params: import("@envoymesh/api").RevokeAuthorizedDeviceParams,
  ): Promise<import("@envoymesh/api").RevokeAuthorizedDeviceResult>;
  listDeviceRevocations(): Promise<import("@envoymesh/api").ListDeviceRevocationsResult>;

  // AI / Knowledge Query
  knowledgeQuery(question: string): Promise<string>;
  runDocumentAgentTurn(message: string): Promise<import("@envoymesh/api").DocumentAgentTurnResult>;

  // Shared vault library
  listLibraryItems(params?: ListLibraryItemsParams): Promise<LibraryItem[]>;
  setLibraryItemPublished(documentId: string, published: boolean): Promise<void>;
  exportLibraryItemToIpfs(documentId: string): Promise<ExportLibraryItemToIpfsResult>;
  pinLibraryItemExternal(documentId: string): Promise<import("@envoymesh/api").PinLibraryItemExternalResult>;
  getIpfsEngineStatus(): Promise<IpfsEngineStatus>;
  getRagIndexStatus(): Promise<RagIndexStatus>;
  verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult>;
  importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult>;
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
      return wsClient.rpc("sendHello", {
        targetOwnerId,
        profile,
        message,
        ...(options?.introProposalMessageId
          ? { introProposalMessageId: options.introProposalMessageId }
          : {}),
      });
    },
    async acceptHello(messageId: string) { return wsClient.rpc("acceptHello", { messageId }); },
    async declineHello(messageId: string, reason?: string) { return wsClient.rpc("declineHello", { messageId, reason }); },
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
    async warmContactConnection(peerOwnerId: string) { return wsClient.rpc("warmContactConnection", { peerOwnerId }); },
    async getChatDiagnostics(peerOwnerId?: string) {
      return wsClient.rpc("getChatDiagnostics", peerOwnerId ? { peerOwnerId } : {});
    },
    async getConnectivityDiagnostics() {
      return wsClient.rpc("getConnectivityDiagnostics", {}) as Promise<ConnectivityDiagnostics>;
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
    async getBridgeStatus() { return wsClient.rpc("getBridgeStatus"); },
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
    async listDeviceRevocations() {
      return wsClient.rpc("listDeviceRevocations", {}) as Promise<
        import("@envoymesh/api").ListDeviceRevocationsResult
      >;
    },
    async knowledgeQuery(question: string) { return wsClient.rpc("knowledgeQuery", { question }) as Promise<string>; },
    async runDocumentAgentTurn(message: string) {
      return wsClient.rpc("runDocumentAgentTurn", { message }) as Promise<import("@envoymesh/api").DocumentAgentTurnResult>;
    },
    async listLibraryItems(params?: ListLibraryItemsParams) {
      return wsClient.rpc("listLibraryItems", (params ?? {}) as Record<string, unknown>) as Promise<LibraryItem[]>;
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
        <div className="loading">
          <div className="loading-content">
            <div className="loading-spinner" />
            <h2>Starting Envoy Social</h2>
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

export function useBonds() {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [bonds, setBonds] = useState<BondRecord[]>([]);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;

    // Initial load
    client.getBonds().then(setBonds).catch(console.error);

    // Listen for changes
    const unsubEstablished = client.on("bond:established", () => {
      client.getBonds().then(setBonds).catch(console.error);
    });
    const unsubRevoked = client.on("bond:revoked", () => {
      client.getBonds().then(setBonds).catch(console.error);
    });

    return () => {
      unsubEstablished();
      unsubRevoked();
    };
  }, [client, wsOpen]);

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
  if (list.some((m) => m.messageId === msg.messageId)) {
    return prev;
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
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [selfIds, setSelfIds] = useState<{ ownerId: string; peerId: string } | null>(null);
  const pendingUntilSelfReady = useRef<ChatMessage[]>([]);
  const selfIdsRef = useRef(selfIds);

  selfIdsRef.current = selfIds;

  useEffect(() => {
    if (!client.isConnected) return;
    let cancelled = false;
    void Promise.all([client.getProfile(), client.getConnectionStatus()])
      .then(([prof, cs]) => {
        if (cancelled) return;
        setSelfIds({
          ownerId: prof?.owner?.ownerId ?? "",
          peerId: cs?.peerId ?? "",
        });
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
    if (!client.isConnected || !selectedContactOwnerId || !selfIds?.ownerId) return;
    let cancelled = false;
    void client
      .listChatHistory(selectedContactOwnerId)
      .then((history) => {
        if (cancelled || !Array.isArray(history) || history.length === 0) return;
        const self = selfIdsRef.current;
        if (!self?.ownerId) return;
        setThreads((prev) => {
          let next = prev;
          for (const msg of history) {
            const n = appendChatToThreads(next, msg, self);
            if (n) next = n;
          }
          return next;
        });
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [client, client.isConnected, selectedContactOwnerId, selfIds?.ownerId]);

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