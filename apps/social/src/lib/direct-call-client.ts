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
  async unblockPeer(peerOwnerId: string) {
    return this._ns.unblockPeer(peerOwnerId);
  }

  async revokeBond(peerOwnerId: string) {
    return this._ns.revokeBond(peerOwnerId);
  }

  async getBonds() {
    return this._ns.getBonds();
  }

  // Phase 38/42 — Voice/Video Calls
  async sendCallInvite(
    targetOwnerId: string,
    sdpOffer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
    callType?: import("@envoymesh/api").CallMediaType,
  ): Promise<string | null> {
    return this._ns.sendCallInvite(targetOwnerId, sdpOffer, iceServers, callType);
  }

  async sendCallReinvite(
    callId: string,
    sdpOffer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
    reason?: "path1_timeout" | "path1_failed",
  ): Promise<boolean> {
    return this._ns.sendCallReinvite(callId, sdpOffer, iceServers, reason);
  }

  async acceptCallInvite(
    callId: string,
    sdpAnswer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
  ): Promise<boolean> {
    return this._ns.acceptCallInvite(callId, sdpAnswer, iceServers);
  }

  async declineCallInvite(callId: string, reason: string): Promise<boolean> {
    return this._ns.declineCallInvite(callId, reason);
  }

  async endCall(callId: string): Promise<boolean> {
    return this._ns.endCall(callId);
  }

  async setCallMuted(callId: string, muted: boolean): Promise<boolean> {
    return this._ns.setCallMuted(callId, muted);
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
    return this._ns.sendIceCandidate(callId, candidate);
  }

  // Phase 31I — Push Notifications
  registerPushToken(params: {
    platform: string;
    token: string;
    ownerId: string;
    deviceId?: string;
    /** Phase 42I — "alert" (default) or "voip" (iOS CallKit). */
    tokenType?: "alert" | "voip";
  }): void {
    return this._ns.registerPushToken(params);
  }

  unregisterPushToken(deviceId: string): boolean {
    return this._ns.unregisterPushToken(deviceId);
  }

  // ----- Phase 40: Agent Network Collaboration Layer (chains) -----
  chainPlan(params: Parameters<NodeService["chainPlan"]>[0]): ReturnType<NodeService["chainPlan"]> {
    return this._ns.chainPlan(params);
  }
  chainLaunch(params: Parameters<NodeService["chainLaunch"]>[0]): ReturnType<NodeService["chainLaunch"]> {
    return this._ns.chainLaunch(params);
  }
  chainGetState(params: Parameters<NodeService["chainGetState"]>[0]): ReturnType<NodeService["chainGetState"]> {
    return this._ns.chainGetState(params);
  }
  chainListActive(params?: Parameters<NodeService["chainListActive"]>[0]): ReturnType<NodeService["chainListActive"]> {
    return this._ns.chainListActive(params ?? {});
  }
  chainCancel(params: Parameters<NodeService["chainCancel"]>[0]): ReturnType<NodeService["chainCancel"]> {
    return this._ns.chainCancel(params);
  }
  chainListReports(params?: Parameters<NodeService["chainListReports"]>[0]): ReturnType<NodeService["chainListReports"]> {
    return this._ns.chainListReports(params ?? {});
  }
  chainGetReport(params: Parameters<NodeService["chainGetReport"]>[0]): ReturnType<NodeService["chainGetReport"]> {
    return this._ns.chainGetReport(params);
  }
  chainPinReport(params: Parameters<NodeService["chainPinReport"]>[0]): ReturnType<NodeService["chainPinReport"]> {
    return this._ns.chainPinReport(params);
  }
  chainSetBidStrategy(params: Parameters<NodeService["chainSetBidStrategy"]>[0]): ReturnType<NodeService["chainSetBidStrategy"]> {
    return this._ns.chainSetBidStrategy(params);
  }
  chainGetBidStrategy(params: Parameters<NodeService["chainGetBidStrategy"]>[0]): ReturnType<NodeService["chainGetBidStrategy"]> {
    return this._ns.chainGetBidStrategy(params);
  }
  chainEvaluateBids(params: Parameters<NodeService["chainEvaluateBids"]>[0]): ReturnType<NodeService["chainEvaluateBids"]> {
    return this._ns.chainEvaluateBids(params);
  }
  chainCounterBid(params: Parameters<NodeService["chainCounterBid"]>[0]): ReturnType<NodeService["chainCounterBid"]> {
    return this._ns.chainCounterBid(params);
  }
  chainRebalance(params: Parameters<NodeService["chainRebalance"]>[0]): ReturnType<NodeService["chainRebalance"]> {
    return this._ns.chainRebalance(params);
  }
  chainGetDefaults(params: Parameters<NodeService["chainGetDefaults"]>[0]): ReturnType<NodeService["chainGetDefaults"]> {
    return this._ns.chainGetDefaults(params);
  }
  chainSetDefaults(params: Parameters<NodeService["chainSetDefaults"]>[0]): ReturnType<NodeService["chainSetDefaults"]> {
    return this._ns.chainSetDefaults(params);
  }
  chainPreviewGoal(params: Parameters<NodeService["chainPreviewGoal"]>[0]): ReturnType<NodeService["chainPreviewGoal"]> {
    return this._ns.chainPreviewGoal(params);
  }
  chainStartFromGoal(params: Parameters<NodeService["chainStartFromGoal"]>[0]): ReturnType<NodeService["chainStartFromGoal"]> {
    return this._ns.chainStartFromGoal(params);
  }
  chainExportCosts(params: Parameters<NodeService["chainExportCosts"]>[0]): ReturnType<NodeService["chainExportCosts"]> {
    return this._ns.chainExportCosts(params);
  }
  chainListRecipes(params?: Parameters<NodeService["chainListRecipes"]>[0]): ReturnType<NodeService["chainListRecipes"]> {
    return this._ns.chainListRecipes(params);
  }
  chainSaveRecipe(params: Parameters<NodeService["chainSaveRecipe"]>[0]): ReturnType<NodeService["chainSaveRecipe"]> {
    return this._ns.chainSaveRecipe(params);
  }
  chainDeleteRecipe(params: Parameters<NodeService["chainDeleteRecipe"]>[0]): ReturnType<NodeService["chainDeleteRecipe"]> {
    return this._ns.chainDeleteRecipe(params);
  }

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  async sendChat(targetOwnerId: string, text: string, attachments?: Parameters<typeof this._ns.sendChat>[2]) {
    return this._ns.sendChat(targetOwnerId, text, attachments as any);
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

  async getCostSummary(params?: Parameters<NodeService["getCostSummary"]>[0]) {
    return this._ns.getCostSummary(params);
  }

  async runCostRollupRetention() {
    return this._ns.runCostRollupRetention();
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

  async getTaskResult(taskId: string) {
    return this._ns.getTaskResult(taskId);
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

  async warmContactConnection(
    peerOwnerId: string,
    options?: { redial?: boolean; verifyOnly?: boolean; upgradeRelayToDirect?: boolean; keepAlive?: boolean; verifyConnection?: boolean },
  ) {
    return this._ns.warmContactConnection(peerOwnerId, options);
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

  // Phase 38 — Voice/Video Calls
  getActiveCall() {
    return this._ns.getActiveCall();
  }

  onCallEvent(handler: (event: import("@envoymesh/api").CallEvent) => void): () => void {
    return this._ns.onCallEvent(handler);
  }

  async getOpenClawStatus() {
    return this._ns.getOpenClawStatus();
  }

  async restartOpenClaw() {
    return this._ns.restartOpenClaw();
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
  async getPairedDiagnostics() { return this._ns.getPairedDiagnostics(); }

  async getPairingPayload() {
    return this._ns.getPairingPayload();
  }

  async createWanJoinInvite(params?: Parameters<NodeService["createWanJoinInvite"]>[0]) {
    return this._ns.createWanJoinInvite(params);
  }

  async applyWanJoinInvite(token: string) {
    return this._ns.applyWanJoinInvite(token);
  }

  async createCompanyInvite(
    params?: Parameters<NodeService["createCompanyInvite"]>[0],
  ) {
    return this._ns.createCompanyInvite(params);
  }

  async listCompanyInvites() {
    return this._ns.listCompanyInvites();
  }

  async revokeCompanyInvite(inviteId: string) {
    return this._ns.revokeCompanyInvite(inviteId);
  }

  async redeemCompanyInvite(params: import("@envoymesh/api").RedeemCompanyInviteParams) {
    return this._ns.redeemCompanyInvite(params);
  }

  async syncPairingKioskFromConfig() {
    return this._ns.syncPairingKioskFromConfig();
  }

  async getPairingKioskStatus() {
    return this._ns.getPairingKioskStatus();
  }

  async importFleetManifest(
    params: Parameters<NodeService["importFleetManifest"]>[0],
  ) {
    return this._ns.importFleetManifest(params);
  }

  async listFleetManifests() {
    return this._ns.listFleetManifests();
  }

  async revokeFleetManifest(manifestId: string) {
    return this._ns.revokeFleetManifest(manifestId);
  }

  async createFleetManifest(
    input: Parameters<NodeService["createFleetManifest"]>[0],
  ) {
    return this._ns.createFleetManifest(input);
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

  async mergeAuthorizedDevices(params: Parameters<NodeService["mergeAuthorizedDevices"]>[0]) {
    return this._ns.mergeAuthorizedDevices(params);
  }

  async pruneRevokedDevices() {
    return this._ns.pruneRevokedDevices();
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

  async terminalRunFromNaturalLanguage(params: import("@envoymesh/api").TerminalRunFromNaturalLanguageParams) {
    return this._ns.terminalRunFromNaturalLanguage(params);
  }

  async terminalExecuteProposal(params: import("@envoymesh/api").TerminalExecuteProposalParams) {
    return this._ns.terminalExecuteProposal(params);
  }

  async terminalSetAssistModelOverride(params: import("@envoymesh/api").TerminalSetAssistModelOverrideParams) {
    return this._ns.terminalSetAssistModelOverride(params);
  }

  async terminalGetAssistState(sessionId: string) {
    return this._ns.terminalGetAssistState(sessionId);
  }

  async terminalExplainScrollback(params: import("@envoymesh/api").TerminalExplainScrollbackParams) {
    return this._ns.terminalExplainScrollback(params);
  }

  async terminalSuggestCommand(params: import("@envoymesh/api").TerminalSuggestCommandParams) {
    return this._ns.terminalSuggestCommand(params);
  }

  async terminalObserveStep(params: import("@envoymesh/api").TerminalObserveStepParams) {
    return this._ns.terminalObserveStep(params);
  }

  async terminalSetInlineSuggestEnabled(params: import("@envoymesh/api").TerminalSetInlineSuggestParams) {
    return this._ns.terminalSetInlineSuggestEnabled(params);
  }

  async terminalOpenClawPlan(params: import("@envoymesh/api").TerminalOpenClawPlanParams) {
    return this._ns.terminalOpenClawPlan(params);
  }

  async terminalRunPlanStep(params: import("@envoymesh/api").TerminalRunPlanStepParams) {
    return this._ns.terminalRunPlanStep(params);
  }

  async terminalEnablePrepareMode(params: import("@envoymesh/api").TerminalEnablePrepareModeParams) {
    return this._ns.terminalEnablePrepareMode(params);
  }

  async terminalWatchStep(params: import("@envoymesh/api").TerminalWatchStepParams) {
    return this._ns.terminalWatchStep(params);
  }

  async terminalPinContextSession(params: import("@envoymesh/api").TerminalPinContextSessionParams) {
    return this._ns.terminalPinContextSession(params);
  }

  async terminalDetectFailure(params: import("@envoymesh/api").TerminalDetectFailureParams) {
    return this._ns.terminalDetectFailure(params);
  }

  async terminalSuggestFixFromFailure(params: import("@envoymesh/api").TerminalSuggestFixParams) {
    return this._ns.terminalSuggestFixFromFailure(params);
  }

  async terminalStartGoalLoop(params: import("@envoymesh/api").TerminalStartGoalLoopParams) {
    return this._ns.terminalStartGoalLoop(params);
  }

  async terminalAdvanceGoalLoop(params: import("@envoymesh/api").TerminalAdvanceGoalLoopParams) {
    return this._ns.terminalAdvanceGoalLoop(params);
  }

  async terminalCancelGoalLoop(params: import("@envoymesh/api").TerminalCancelGoalLoopParams) {
    return this._ns.terminalCancelGoalLoop(params);
  }
  async terminalClearResumeGoal(sessionId: string) {
    return this._ns.terminalClearResumeGoal(sessionId);
  }

  async terminalSendContextToAssistant(params: import("@envoymesh/api").TerminalSendContextToAssistantParams) {
    return this._ns.terminalSendContextToAssistant(params);
  }

  async terminalUpdatePlanProgress(params: import("@envoymesh/api").TerminalUpdatePlanProgressParams) {
    return this._ns.terminalUpdatePlanProgress(params);
  }

  async terminalGetScrollbackPreview(params: import("@envoymesh/api").TerminalGetScrollbackPreviewParams) {
    return this._ns.terminalGetScrollbackPreview(params);
  }

  async terminalResumeGoalLoop(params: import("@envoymesh/api").TerminalResumeGoalLoopParams) {
    return this._ns.terminalResumeGoalLoop(params);
  }

  async terminalEnableExecPane(params: import("@envoymesh/api").TerminalEnableExecPaneParams) {
    return this._ns.terminalEnableExecPane(params);
  }

  async terminalSetBackgroundWatch(params: import("@envoymesh/api").TerminalSetBackgroundWatchParams) {
    return this._ns.terminalSetBackgroundWatch(params);
  }

  async terminalClearBackgroundWatch(params: import("@envoymesh/api").TerminalClearBackgroundWatchParams) {
    return this._ns.terminalClearBackgroundWatch(params);
  }

  async openInHerdr(params?: import("@envoymesh/api").OpenInHerdrParams) {
    return this._ns.openInHerdr(params);
  }

  async terminalGetHerdrExportHint(params: import("@envoymesh/api").TerminalHerdrExportHintParams) {
    return this._ns.terminalGetHerdrExportHint(params);
  }

  async homeTerminalWsOpen(params: import("@envoymesh/api").HomeTerminalWsOpenParams) {
    return this._ns.homeTerminalWsOpen(params);
  }

  async homeTerminalWsSend(params: import("@envoymesh/api").HomeTerminalWsSendParams) {
    return this._ns.homeTerminalWsSend(params);
  }

  async homeTerminalWsClose(params?: import("@envoymesh/api").HomeTerminalWsCloseParams) {
    return this._ns.homeTerminalWsClose(params);
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

  async runOwnerAgentTurn(
    message: string,
    options?: Parameters<NodeService["runOwnerAgentTurn"]>[1],
  ) {
    return this._ns.runOwnerAgentTurn(message, options);
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

  async createNote(params: Parameters<NodeService["createNote"]>[0]) {
    return this._ns.createNote(params);
  }

  async deleteVaultItem(params: Parameters<NodeService["deleteVaultItem"]>[0]) {
    return this._ns.deleteVaultItem(params);
  }

  async listKbPlugins(params?: Parameters<NodeService["listKbPlugins"]>[0]) {
    return this._ns.listKbPlugins(params);
  }

  async activateKbPlugin(params: Parameters<NodeService["activateKbPlugin"]>[0]) {
    return this._ns.activateKbPlugin(params);
  }

  async deactivateKbPlugin(params: Parameters<NodeService["deactivateKbPlugin"]>[0]) {
    return this._ns.deactivateKbPlugin(params);
  }

  async getKbPluginConfig(pluginId: string) {
    return this._ns.getKbPluginConfig(pluginId);
  }

  async updateKbPluginConfig(params: Parameters<NodeService["updateKbPluginConfig"]>[0]) {
    return this._ns.updateKbPluginConfig(params);
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

  async getSetupSponsorFriendConfig() {
    return this._ns.getSetupSponsorFriendConfig();
  }

  async getSetupSponsorFriendStatus() {
    return this._ns.getSetupSponsorFriendStatus();
  }

  async runSetupSponsorFriend(input?: { forceBypassGuards?: boolean }) {
    return this._ns.runSetupSponsorFriend(input);
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
