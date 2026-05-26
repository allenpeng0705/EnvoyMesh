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

  async getHumanProfile() {
    return this._ns.getHumanProfile();
  }

  async updateHumanProfile(input: Parameters<NodeService["updateHumanProfile"]>[0]) {
    return this._ns.updateHumanProfile(input);
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

  async sendChatAttachment(params: Parameters<NodeService["sendChatAttachment"]>[0]) {
    return this._ns.sendChatAttachment(params);
  }

  async readLibraryItemContent(params: Parameters<NodeService["readLibraryItemContent"]>[0]) {
    return this._ns.readLibraryItemContent(params);
  }

  async listChatHistory(peerOwnerId: string, limit?: number) {
    return this._ns.listChatHistory(peerOwnerId, limit);
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

  // -----------------------------------------------------------------------
  // Agent Bridge
  // -----------------------------------------------------------------------

  async getBridgeStatus() {
    return this._ns.getBridgeStatus();
  }

  async getPairingPayload() {
    return this._ns.getPairingPayload();
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

  // -----------------------------------------------------------------------
  // AI / Knowledge Query
  // -----------------------------------------------------------------------

  async knowledgeQuery(question: string) {
    return this._ns.knowledgeQuery(question);
  }

  async runDocumentAgentTurn(message: string) {
    return this._ns.runDocumentAgentTurn(message);
  }

  async listLibraryItems(params?: Parameters<NodeService["listLibraryItems"]>[0]) {
    return this._ns.listLibraryItems(params);
  }

  async setLibraryItemPublished(documentId: string, published: boolean) {
    return this._ns.setLibraryItemPublished(documentId, published);
  }

  async exportLibraryItemToIpfs(documentId: string) {
    return this._ns.exportLibraryItemToIpfs(documentId);
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
