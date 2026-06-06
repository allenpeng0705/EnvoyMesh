import type { NodeService, NodeServiceEvents } from "@envoymesh/api";
import type { NodeServiceClient } from "../hooks/useNodeService.js";

type EventHandler = (data: unknown) => void;

/**
 * In-process NodeServiceClient that calls NodeService methods directly.
 * No WebSocket, no JSON-RPC serialization — just JS function calls.
 *
 * Used by the Capacitor mobile app where the Social UI and node runtime
 * share a single WebView JavaScript thread.
 */
export class DirectCallClient implements NodeServiceClient {
  private readonly _ns: NodeService;
  private _connected = false;
  private _ready = false;

  /** Active unsubscribers keyed by event name */
  private readonly _cleanups = new Map<keyof NodeServiceEvents, () => void>();

  constructor(nodeService: NodeService) {
    this._ns = nodeService;
  }

  // -----------------------------------------------------------------------
  // Connection (in-process — always "connected" once the node is running)
  // -----------------------------------------------------------------------

  get isConnected(): boolean {
    return this._connected;
  }

  get isReady(): boolean {
    return this._ready;
  }

  get reconnectAttempts(): number {
    return 0; // No reconnection needed in-process
  }

  async connect(): Promise<void> {
    this._connected = true;
    this._ready = true;
  }

  disconnect(): void {
    this._connected = false;
    this._ready = false;
    // Clean up all event subscriptions
    for (const cleanup of this._cleanups.values()) {
      cleanup();
    }
    this._cleanups.clear();
  }

  async reconnect(): Promise<void> {
    this.disconnect();
    await this.connect();
  }

  // -----------------------------------------------------------------------
  // Identity
  // -----------------------------------------------------------------------

  async getProfile() {
    return this._ns.getProfile();
  }

  async getOwnerDidPresentation() {
    return this._ns.getOwnerDidPresentation();
  }

  async resolveDidImport(input: string) {
    return this._ns.resolveDidImport(input);
  }

  async cacheDidContactKey(params: { ownerId: string; publicKeyPem: string }) {
    return this._ns.cacheDidContactKey(params);
  }

  async getPeerReputationSummary(peerOwnerId: string) {
    return this._ns.getPeerReputationSummary(peerOwnerId);
  }

  async getHumanProfile() {
    return this._ns.getHumanProfile();
  }

  async updateHumanProfile(input: Parameters<NodeService["updateHumanProfile"]>[0]) {
    return this._ns.updateHumanProfile(input);
  }

  async setPublicProfileThumbnail(params: Parameters<NodeService["setPublicProfileThumbnail"]>[0]) {
    return this._ns.setPublicProfileThumbnail(params);
  }

  async upsertProfileGalleryPhoto(params: Parameters<NodeService["upsertProfileGalleryPhoto"]>[0]) {
    return this._ns.upsertProfileGalleryPhoto(params);
  }

  async removeProfileGalleryPhoto(params: Parameters<NodeService["removeProfileGalleryPhoto"]>[0]) {
    return this._ns.removeProfileGalleryPhoto(params);
  }

  async updateProfileGalleryPhotoVisibility(
    params: Parameters<NodeService["updateProfileGalleryPhotoVisibility"]>[0],
  ) {
    return this._ns.updateProfileGalleryPhotoVisibility(params);
  }

  async getPeerProfile(ownerId: string) {
    return this._ns.getPeerProfile(ownerId);
  }

  async listPeerProfiles() {
    return this._ns.listPeerProfiles();
  }

  async requestPeerProfile(ownerId: string) {
    return this._ns.requestPeerProfile(ownerId);
  }

  async syncProfileToBonds() {
    return this._ns.syncProfileToBonds();
  }

  async refreshBondPeerProfiles() {
    return this._ns.refreshBondPeerProfiles();
  }

  async getAgentIdentity() {
    return this._ns.getAgentIdentity();
  }

  async updateAgentIdentity(content: string) {
    return this._ns.updateAgentIdentity(content);
  }

  // -----------------------------------------------------------------------
  // Bond Management
  // -----------------------------------------------------------------------

  async sendHello(
    targetOwnerId: string,
    profile: Parameters<NodeService["sendHello"]>[1],
    message: string,
    options?: Parameters<NodeService["sendHello"]>[3],
  ) {
    if (options !== undefined) {
      return this._ns.sendHello(targetOwnerId, profile, message, options);
    }
    return this._ns.sendHello(targetOwnerId, profile, message);
  }

  async listPendingSocialIntroProposals() {
    return this._ns.listPendingSocialIntroProposals();
  }

  async approveSocialIntroCommitment(messageId: string) {
    return this._ns.approveSocialIntroCommitment(messageId);
  }

  async declineSocialIntroProposal(messageId: string) {
    return this._ns.declineSocialIntroProposal(messageId);
  }

  async acceptHello(messageId: string) {
    return this._ns.acceptHello(messageId);
  }

  async declineHello(messageId: string, reason?: string) {
    return this._ns.declineHello(messageId, reason);
  }

  async blockPeer(peerOwnerId: string) {
    return this._ns.blockPeer(peerOwnerId);
  }

  async revokeBond(peerOwnerId: string) {
    return this._ns.revokeBond(peerOwnerId);
  }

  async getBonds() {
    return this._ns.getBonds();
  }

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  async sendChat(targetOwnerId: string, text: string) {
    return this._ns.sendChat(targetOwnerId, text);
  }

  async sendAgentChat(targetOwnerId: string, text: string) {
    return this._ns.sendAgentChat(targetOwnerId, text);
  }

  async sendChatAttachment(params: Parameters<NodeService["sendChatAttachment"]>[0]) {
    return this._ns.sendChatAttachment(params);
  }

  async readLibraryItemContent(params: Parameters<NodeService["readLibraryItemContent"]>[0]) {
    return this._ns.readLibraryItemContent(params);
  }

  async listChatHistory(peerOwnerId: string, limit?: number) {
    return this._ns.listChatHistory(peerOwnerId, limit);
  }

  async listChatRooms() {
    return this._ns.listChatRooms();
  }

  async createChatRoom(title: string, memberOwnerIds: string[]) {
    return this._ns.createChatRoom(title, memberOwnerIds);
  }

  async inviteToChatRoom(roomId: string, memberOwnerIds: string[]) {
    return this._ns.inviteToChatRoom(roomId, memberOwnerIds);
  }

  async leaveChatRoom(roomId: string) {
    return this._ns.leaveChatRoom(roomId);
  }

  async removeMembersFromChatRoom(roomId: string, memberOwnerIds: string[]) {
    return this._ns.removeMembersFromChatRoom(roomId, memberOwnerIds);
  }

  async renameChatRoom(roomId: string, title: string) {
    return this._ns.renameChatRoom(roomId, title);
  }

  async dismissChatRoom(roomId: string) {
    return this._ns.dismissChatRoom(roomId);
  }

  async sendChatRoomMessage(roomId: string, text: string) {
    return this._ns.sendChatRoomMessage(roomId, text);
  }

  async sendChatRoomAttachment(params: Parameters<NodeService["sendChatRoomAttachment"]>[0]) {
    return this._ns.sendChatRoomAttachment(params);
  }

  async listAgentActivity(params?: Parameters<NodeService["listAgentActivity"]>[0]) {
    return this._ns.listAgentActivity(params);
  }

  async listCommerceReceipts(params?: Parameters<NodeService["listCommerceReceipts"]>[0]) {
    return this._ns.listCommerceReceipts(params);
  }

  async recordCommerceReceipt(params: Parameters<NodeService["recordCommerceReceipt"]>[0]) {
    return this._ns.recordCommerceReceipt(params);
  }

  async listAuditEvents(params?: Parameters<NodeService["listAuditEvents"]>[0]) {
    return this._ns.listAuditEvents(params);
  }

  async listTaskJournalEntries(params?: Parameters<NodeService["listTaskJournalEntries"]>[0]) {
    return this._ns.listTaskJournalEntries(params);
  }

  async listAgentCards() {
    return this._ns.listAgentCards();
  }

  async getAgentCard(ownerId: string) {
    return this._ns.getAgentCard(ownerId);
  }

  async requestAgentCard(targetOwnerId: string) {
    return this._ns.requestAgentCard(targetOwnerId);
  }

  async listPendingApprovals() {
    return this._ns.listPendingApprovals();
  }

  async approvePendingApproval(itemId: string, notes?: string) {
    return this._ns.approvePendingApproval(itemId, notes);
  }

  async rejectPendingApproval(itemId: string, notes?: string) {
    return this._ns.rejectPendingApproval(itemId, notes);
  }

  async deleteChatMessage(peerOwnerId: string, messageId: string) {
    return this._ns.deleteChatMessage(peerOwnerId, messageId);
  }

  async clearChatHistory(peerOwnerId: string) {
    return this._ns.clearChatHistory(peerOwnerId);
  }

  async getChatDrafts(threadPeerOwnerId?: string) {
    return this._ns.getChatDrafts(threadPeerOwnerId);
  }

  async deleteChatDraft(draftId: string) {
    return this._ns.deleteChatDraft(draftId);
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  async searchPeers(query: Parameters<NodeService["searchPeers"]>[0]) {
    return this._ns.searchPeers(query);
  }

  async runCapabilityDiscovery(params?: Parameters<NodeService["runCapabilityDiscovery"]>[0]) {
    return this._ns.runCapabilityDiscovery(params);
  }

  async advertiseTopic(topic: string) {
    return this._ns.advertiseTopic(topic);
  }

  async stopAdvertiseTopic(topic: string) {
    return this._ns.stopAdvertiseTopic(topic);
  }

  // -----------------------------------------------------------------------
  // Connection Status
  // -----------------------------------------------------------------------

  async getConnectionStatus() {
    return this._ns.getConnectionStatus();
  }

  async getPeerConnectionInfo(peerOwnerId: string) {
    return this._ns.getPeerConnectionInfo(peerOwnerId);
  }

  async warmContactConnection(peerOwnerId: string) {
    return this._ns.warmContactConnection(peerOwnerId);
  }

  async getChatDiagnostics(peerOwnerId?: string) {
    return this._ns.getChatDiagnostics(peerOwnerId);
  }

  async getConnectivityDiagnostics() {
    return this._ns.getConnectivityDiagnostics();
  }

  async discoverCapabilityTopic(params: Parameters<NodeService["discoverCapabilityTopic"]>[0]) {
    return this._ns.discoverCapabilityTopic(params);
  }

  async getMorningReport(params?: Parameters<NodeService["getMorningReport"]>[0]) {
    return this._ns.getMorningReport(params);
  }

  async requestMultiHopDiscovery(params: Parameters<NodeService["requestMultiHopDiscovery"]>[0]) {
    return this._ns.requestMultiHopDiscovery(params);
  }

  async getMultiHopDiscoverySession(correlationId: string) {
    return this._ns.getMultiHopDiscoverySession(correlationId);
  }

  async sendSyncStateUpdate(params: Parameters<NodeService["sendSyncStateUpdate"]>[0]) {
    return this._ns.sendSyncStateUpdate(params);
  }

  // -----------------------------------------------------------------------
  // Agent Bridge
  // -----------------------------------------------------------------------

  async getBridgeStatus() {
    return this._ns.getBridgeStatus();
  }

  async getOpenClawPlugins() { return this._ns.getOpenClawPlugins(); }
  async searchOpenClawPlugins(query: string) { return this._ns.searchOpenClawPlugins(query); }
  async getTrendingOpenClawPlugins() { return this._ns.getTrendingOpenClawPlugins(); }
  async installOpenClawPlugin(name: string) { return this._ns.installOpenClawPlugin(name); }
  async uninstallOpenClawPlugin(name: string) { return this._ns.uninstallOpenClawPlugin(name); }
  async saveClawhubToken(token: string) { return this._ns.saveClawhubToken(token); }
  async saveSkillApiKeys(keys: Record<string, string>) { return this._ns.saveSkillApiKeys(keys); }
  async saveWebSearchEnabled(enabled: boolean) { return this._ns.saveWebSearchEnabled(enabled); }
  async sendToOpenClaw(text: string) { return this._ns.sendToOpenClaw(text); }

  async getPairingPayload() {
    return this._ns.getPairingPayload();
  }

  async createWanJoinInvite(params?: Parameters<NodeService["createWanJoinInvite"]>[0]) {
    return this._ns.createWanJoinInvite(params);
  }

  async applyWanJoinInvite(token: string) {
    return this._ns.applyWanJoinInvite(token);
  }

  async pairWithHomeNode(params: Parameters<NodeService["pairWithHomeNode"]>[0]) {
    return this._ns.pairWithHomeNode(params);
  }

  async listAuthorizedDevices() {
    return this._ns.listAuthorizedDevices();
  }

  async revokeAuthorizedDevice(params: Parameters<NodeService["revokeAuthorizedDevice"]>[0]) {
    return this._ns.revokeAuthorizedDevice(params);
  }

  async listDeviceRevocations() {
    return this._ns.listDeviceRevocations();
  }

  async listTerminalSessions() {
    return this._ns.listTerminalSessions();
  }

  async createTerminalSession(params?: import("@envoymesh/api").CreateTerminalSessionParams) {
    return this._ns.createTerminalSession(params);
  }

  async closeTerminalSession(params: import("@envoymesh/api").CloseTerminalSessionParams) {
    return this._ns.closeTerminalSession(params);
  }

  async renameTerminalSession(params: import("@envoymesh/api").RenameTerminalSessionParams) {
    return this._ns.renameTerminalSession(params);
  }

  async terminalAttach(params: import("@envoymesh/api").TerminalAttachParams) {
    return this._ns.terminalAttach(params);
  }

  // -----------------------------------------------------------------------
  // AI / Knowledge Query
  // -----------------------------------------------------------------------

  async knowledgeQuery(question: string) {
    return this._ns.knowledgeQuery(question);
  }

  async runDocumentAgentTurn(message: string) {
    return this._ns.runDocumentAgentTurn(message);
  }

  async runOwnerAgentTurn(message: string) {
    return this._ns.runOwnerAgentTurn(message);
  }

  // Phase 23A — AI-curated circles
  async listAgentCircles() {
    return this._ns.listAgentCircles();
  }
  async createAgentCircle(input: {
    label: string;
    memberOwnerIds: string[];
    topicTags: string[];
  }) {
    return this._ns.createAgentCircle(input);
  }
  async updateAgentCircle(
    circleId: string,
    update: { label?: string; memberOwnerIds?: string[]; topicTags?: string[]; status?: "proposed" | "active" | "declined" | "removed" },
  ) {
    return this._ns.updateAgentCircle(circleId, update);
  }
  async deleteAgentCircle(circleId: string) {
    return this._ns.deleteAgentCircle(circleId);
  }
  async proposeAgentCircles() {
    return this._ns.proposeAgentCircles();
  }

  // Phase 27B — Mesh intelligence report
  async generateMeshIntelligenceReport() {
    return this._ns.generateMeshIntelligenceReport();
  }

  // Privacy — wipe all local data
  async clearAllUserData() {
    return this._ns.clearAllUserData();
  }

  async listLibraryItems(params?: Parameters<NodeService["listLibraryItems"]>[0]) {
    return this._ns.listLibraryItems(params);
  }

  async listAllLocalFiles(params?: Parameters<NodeService["listAllLocalFiles"]>[0]) {
    return this._ns.listAllLocalFiles(params);
  }

  async readLocalFileContent(params: Parameters<NodeService["readLocalFileContent"]>[0]) {
    return this._ns.readLocalFileContent(params);
  }

  async openLocalFile(params: Parameters<NodeService["openLocalFile"]>[0]) {
    return this._ns.openLocalFile(params);
  }

  async setLibraryItemPublished(documentId: string, published: boolean) {
    return this._ns.setLibraryItemPublished(documentId, published);
  }

  async exportLibraryItemToIpfs(documentId: string) {
    return this._ns.exportLibraryItemToIpfs(documentId);
  }

  async pinLibraryItemExternal(documentId: string) {
    return this._ns.pinLibraryItemExternal(documentId);
  }

  async getIpfsEngineStatus() {
    return this._ns.getIpfsEngineStatus();
  }

  async getRagIndexStatus() {
    return this._ns.getRagIndexStatus();
  }

  async verifyLibraryItemIpfsGateway(params: Parameters<NodeService["verifyLibraryItemIpfsGateway"]>[0]) {
    return this._ns.verifyLibraryItemIpfsGateway(params);
  }

  async importToLibrary(params: Parameters<NodeService["importToLibrary"]>[0]) {
    return this._ns.importToLibrary(params);
  }

  async resolveLibraryItemPath(relativePath: string) {
    return this._ns.resolveLibraryItemPath(relativePath);
  }

  async openLibraryItem(relativePath: string) {
    return this._ns.openLibraryItem(relativePath);
  }

  async revealLibraryItemInFileManager(relativePath: string) {
    return this._ns.revealLibraryItemInFileManager(relativePath);
  }

  async discoverPublishedLibrary(params?: Parameters<NodeService["discoverPublishedLibrary"]>[0]) {
    return this._ns.discoverPublishedLibrary(params);
  }

  async listAgentShareProposals() {
    return this._ns.listAgentShareProposals();
  }

  async dismissAgentShareProposal(proposalId: string) {
    return this._ns.dismissAgentShareProposal(proposalId);
  }

  async submitAgentShareProposal(params: Parameters<NodeService["submitAgentShareProposal"]>[0]) {
    return this._ns.submitAgentShareProposal(params);
  }

  async listPendingShareOffers() {
    return this._ns.listPendingShareOffers();
  }

  async shareFile(targetOwnerId: string, file: Parameters<NodeService["shareFile"]>[1]) {
    return this._ns.shareFile(targetOwnerId, file);
  }

  async acceptShare(shareId: string, savePath: string) {
    return this._ns.acceptShare(shareId, savePath);
  }

  async declineShare(shareId: string) {
    return this._ns.declineShare(shareId);
  }

  // -----------------------------------------------------------------------
  // Node Configuration
  // -----------------------------------------------------------------------

  async getNodeConfig() {
    return this._ns.getNodeConfig();
  }

  async updateNodeConfig(config: Parameters<NodeService["updateNodeConfig"]>[0]) {
    return this._ns.updateNodeConfig(config);
  }

  async listRelays() {
    return this._ns.listRelays();
  }

  async addRelay(addr: string, level?: number, region?: string) {
    return this._ns.addRelay(addr, level, region);
  }

  async removeRelay(relayId: string) {
    return this._ns.removeRelay(relayId);
  }

  // -----------------------------------------------------------------------
  // Node Lifecycle
  // -----------------------------------------------------------------------

  async initNode(profileDir: string, options?: Parameters<NodeService["initNode"]>[1]) {
    return this._ns.initNode(profileDir, options);
  }

  async getNodeStatus() {
    return { status: this._ns.getNodeStatus() };
  }

  async startNode() {
    await this._ns.startNode();
  }

  async stopNode() {
    await this._ns.stopNode();
  }

  async waitForConnection(_timeoutMs?: number) {
    // In-process — node is always available
    return;
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  on<K extends keyof NodeServiceEvents>(
    event: K,
    handler: (data: NodeServiceEvents[K]) => void,
  ): () => void {
    const unsub = this._ns.on(event, handler);
    // Also track in case of reconnect
    this._cleanups.set(event, unsub);
    return unsub;
  }
}

/**
 * Create a DirectCallClient bound to the given NodeService instance.
 */
export function createDirectCallClient(nodeService: NodeService): NodeServiceClient {
  return new DirectCallClient(nodeService);
}
