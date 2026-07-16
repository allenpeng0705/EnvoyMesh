import type {
  NodeService,
  RpcMethods,
  SendChatParams,
  HomeClawCoreProxyParams,
  ListLibraryItemsParams,
  DiscoverPublishedLibraryParams,
  ChainPlanParams,
  ChainLaunchParams,
  ChainGetStateParams,
  ChainListActiveParams,
  ChainCancelParams,
  ChainListReportsParams,
  ChainGetReportParams,
  ChainPinReportParams,
  ChainSetBidStrategyParams,
  ChainGetBidStrategyParams,
  ChainEvaluateBidsParams,
  ChainCounterBidParams,
  ChainRebalanceParams,
  ChainGetDefaultsParams,
  ChainSetDefaultsParams,
  ChainPreviewGoalParams,
  ChainStartFromGoalParams,
  ChainExportCostsParams,
  ChainListRecipesParams,
  ChainSaveRecipeParams,
  ChainDeleteRecipeParams,
} from "@envoymesh/api";

/**
 * Route a JSON-RPC method call to the appropriate NodeService method.
 *
 * Extracted from {@link WsServer.routeToNodeService} so both WebSocket and
 * libp2p client-proxy transports can share the same routing logic.
 */
export async function routeRpcMethod(
  ns: NodeService,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (method as RpcMethods) {
    case "getProfile":
      return ns.getProfile();
    case "getOwnerDidPresentation":
      return ns.getOwnerDidPresentation();
    case "resolveDidImport":
      return ns.resolveDidImport(String(params.input ?? ""));
    case "cacheDidContactKey":
      return ns.cacheDidContactKey({
        ownerId: String(params.ownerId ?? ""),
        publicKeyPem: String(params.publicKeyPem ?? ""),
      });
    case "getPeerReputationSummary":
      return ns.getPeerReputationSummary(params.peerOwnerId as string);
    case "getHumanProfile":
      return ns.getHumanProfile();
    case "updateHumanProfile":
      return ns.updateHumanProfile(params as any);
    case "setPublicProfileThumbnail":
      return ns.setPublicProfileThumbnail({
        contentBase64: String(params.contentBase64 ?? ""),
        mimeType: params.mimeType as import("@envoymesh/api").SetPublicProfileThumbnailParams["mimeType"],
      });
    case "upsertProfileGalleryPhoto":
      return ns.upsertProfileGalleryPhoto({
        contentBase64: String(params.contentBase64 ?? ""),
        mimeType: params.mimeType as import("@envoymesh/api").UpsertProfileGalleryPhotoParams["mimeType"],
        visibility: params.visibility as import("@envoymesh/api").UpsertProfileGalleryPhotoParams["visibility"],
        label: params.label != null ? String(params.label) : undefined,
        photoId: params.photoId != null ? String(params.photoId) : undefined,
      });
    case "removeProfileGalleryPhoto":
      return ns.removeProfileGalleryPhoto({ vaultRelativePath: String(params.vaultRelativePath ?? "") });
    case "updateProfileGalleryPhotoVisibility":
      return ns.updateProfileGalleryPhotoVisibility({
        vaultRelativePath: String(params.vaultRelativePath ?? ""),
        visibility: params.visibility as import("@envoymesh/api").UpdateProfileGalleryPhotoVisibilityParams["visibility"],
      });
    case "getPeerProfile":
      return ns.getPeerProfile(String(params.ownerId ?? ""));
    case "listPeerProfiles":
      return ns.listPeerProfiles();
    case "requestPeerProfile":
      return ns.requestPeerProfile(String(params.ownerId ?? ""));
    case "syncProfileToBonds":
      return ns.syncProfileToBonds();
    case "refreshBondPeerProfiles":
      return ns.refreshBondPeerProfiles();
    case "getAgentIdentity":
      return ns.getAgentIdentity();
    case "updateAgentIdentity":
      return ns.updateAgentIdentity(params.content as string);
    case "sendHello":
      return ns.sendHello(
        params.targetOwnerId as string,
        params.profile as any,
        params.message as string,
        params.introProposalMessageId
          ? { introProposalMessageId: params.introProposalMessageId as string }
          : undefined,
      );
    case "acceptHello":
      return ns.acceptHello(params.messageId as string);
    case "declineHello":
      return ns.declineHello(params.messageId as string, params.reason as string | undefined);
    case "blockPeer":
      return ns.blockPeer(params.peerOwnerId as string);
    case "unblockPeer":
      return ns.unblockPeer(params.peerOwnerId as string);
    case "revokeBond":
      return ns.revokeBond(params.peerOwnerId as string);
    case "getBonds":
      return ns.getBonds();
    case "listPendingSocialIntroProposals":
      return ns.listPendingSocialIntroProposals();
    case "approveSocialIntroCommitment":
      return ns.approveSocialIntroCommitment(params.messageId as string);
    case "declineSocialIntroProposal":
      return ns.declineSocialIntroProposal(params.messageId as string);
    case "sendChat":
      return ns.sendChat(params.targetOwnerId as string, params.text as string, params.attachments as SendChatParams["attachments"]);
    // Phase 38/42 — Voice/Video Calls
    case "sendCallInvite":
      return ns.sendCallInvite(
        params.targetOwnerId as string,
        params.sdpOffer as string,
        params.iceServers as
          | { urls: string; username?: string; credential?: string }[]
          | undefined,
        params.callType as import("@envoymesh/api").CallMediaType | undefined,
      );
    case "sendCallReinvite":
      return ns.sendCallReinvite(
        params.callId as string,
        params.sdpOffer as string,
        params.iceServers as
          | { urls: string; username?: string; credential?: string }[]
          | undefined,
        params.reason as "path1_timeout" | "path1_failed" | undefined,
      );
    case "acceptCallInvite":
      return ns.acceptCallInvite(
        params.callId as string,
        params.sdpAnswer as string,
        params.iceServers as
          | { urls: string; username?: string; credential?: string }[]
          | undefined,
      );
    case "declineCallInvite":
      return ns.declineCallInvite(params.callId as string, (params.reason as string) ?? "declined");
    case "endCall":
      return ns.endCall(params.callId as string);
    case "setCallMuted":
      return ns.setCallMuted(params.callId as string, Boolean(params.muted));
    case "sendIceCandidate":
      return ns.sendIceCandidate(params.callId as string, params.candidate as {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
        usernameFragment?: string | null;
      });
    // Phase 31I — Push Notifications
    case "registerPushToken":
      ns.registerPushToken({
        platform: String(params.platform ?? "android"),
        token: String(params.token ?? ""),
        ownerId: String(params.ownerId ?? ""),
        deviceId: params.deviceId !== undefined ? String(params.deviceId) : undefined,
        tokenType: params.tokenType === "voip" ? "voip" : "alert",
      });
      return undefined;
    case "unregisterPushToken":
      return ns.unregisterPushToken(String(params.deviceId ?? ""));
    case "chainPlan":
      return ns.chainPlan(params as unknown as ChainPlanParams);
    case "chainLaunch":
      return ns.chainLaunch(params as unknown as ChainLaunchParams);
    case "chainGetState":
      return ns.chainGetState(params as unknown as ChainGetStateParams);
    case "chainListActive":
      return ns.chainListActive((params as unknown as ChainListActiveParams | undefined) ?? {});
    case "chainCancel":
      return ns.chainCancel(params as unknown as ChainCancelParams);
    case "chainListReports":
      return ns.chainListReports((params as unknown as ChainListReportsParams | undefined) ?? {});
    case "chainGetReport":
      return ns.chainGetReport(params as unknown as ChainGetReportParams);
    case "chainPinReport":
      return ns.chainPinReport(params as unknown as ChainPinReportParams);
    case "chainSetBidStrategy":
      return ns.chainSetBidStrategy(params as unknown as ChainSetBidStrategyParams);
    case "chainGetBidStrategy":
      return ns.chainGetBidStrategy(params as unknown as ChainGetBidStrategyParams);
    case "chainEvaluateBids":
      return ns.chainEvaluateBids(params as unknown as ChainEvaluateBidsParams);
    case "chainCounterBid":
      return ns.chainCounterBid(params as unknown as ChainCounterBidParams);
    case "chainRebalance":
      return ns.chainRebalance(params as unknown as ChainRebalanceParams);
    case "chainGetDefaults":
      return ns.chainGetDefaults((params as unknown as ChainGetDefaultsParams) ?? {});
    case "chainSetDefaults":
      return ns.chainSetDefaults(params as unknown as ChainSetDefaultsParams);
    case "chainPreviewGoal":
      return ns.chainPreviewGoal(params as unknown as ChainPreviewGoalParams);
    case "chainStartFromGoal":
      return ns.chainStartFromGoal(params as unknown as ChainStartFromGoalParams);
    case "chainExportCosts":
      return ns.chainExportCosts(params as unknown as ChainExportCostsParams);
    case "chainListRecipes":
      return ns.chainListRecipes((params as unknown as ChainListRecipesParams | undefined) ?? {});
    case "chainSaveRecipe":
      return ns.chainSaveRecipe(params as unknown as ChainSaveRecipeParams);
    case "chainDeleteRecipe":
      return ns.chainDeleteRecipe(params as unknown as ChainDeleteRecipeParams);
    case "sendAgentChat":
      return ns.sendAgentChat(params.targetOwnerId as string, params.text as string);
    case "sendChatAttachment":
      return ns.sendChatAttachment({
        targetOwnerId: params.targetOwnerId as string,
        filename: params.filename as string,
        contentBase64: params.contentBase64 as string,
        mimeType: params.mimeType as string | undefined,
        caption: params.caption as string | undefined,
        sensitivity: params.sensitivity as "public" | "friends" | "private" | undefined,
      });
    case "readLibraryItemContent":
      return ns.readLibraryItemContent({
        relativePath: params.relativePath as string,
        maxBytes: params.maxBytes as number | undefined,
      });
    case "listChatHistory":
      return ns.listChatHistory(params.peerOwnerId as string, params.limit as number | undefined);
    case "listChatRooms":
      return ns.listChatRooms();
    case "createChatRoom":
      return ns.createChatRoom(params.title as string, params.memberOwnerIds as string[]);
    case "inviteToChatRoom":
      return ns.inviteToChatRoom(params.roomId as string, params.memberOwnerIds as string[]);
    case "leaveChatRoom":
      return ns.leaveChatRoom(params.roomId as string);
    case "removeMembersFromChatRoom":
      return ns.removeMembersFromChatRoom(params.roomId as string, params.memberOwnerIds as string[]);
    case "renameChatRoom":
      return ns.renameChatRoom(params.roomId as string, params.title as string);
    case "dismissChatRoom":
      return ns.dismissChatRoom(params.roomId as string);
    case "sendChatRoomMessage":
      return ns.sendChatRoomMessage(params.roomId as string, params.text as string);
    case "sendChatRoomAttachment":
      return ns.sendChatRoomAttachment({
        roomId: params.roomId as string,
        filename: params.filename as string,
        contentBase64: params.contentBase64 as string,
        mimeType: params.mimeType as string | undefined,
        caption: params.caption as string | undefined,
        sensitivity: params.sensitivity as "public" | "friends" | "private" | undefined,
      });
    case "listAgentActivity":
      return ns.listAgentActivity({
        since: params.since as string | undefined,
        until: params.until as string | undefined,
        limit: params.limit as number | undefined,
        correlationId: params.correlationId as string | undefined,
        domain: params.domain as import("@envoymesh/api").AgentActivityDomain | undefined,
        remoteOwnerId: params.remoteOwnerId as string | undefined,
      });
    case "listCommerceReceipts":
      return ns.listCommerceReceipts({
        counterpartyOwnerId: params.counterpartyOwnerId as string | undefined,
        limit: params.limit as number | undefined,
      });
    case "recordCommerceReceipt":
      return ns.recordCommerceReceipt({
        taskId: String(params.taskId ?? ""),
        mandateId: params.mandateId as string | undefined,
        counterpartyOwnerId: String(params.counterpartyOwnerId ?? ""),
        documentId: String(params.documentId ?? ""),
        summary: params.summary as string | undefined,
        cid: params.cid as string | undefined,
      });
    case "listAuditEvents":
      return ns.listAuditEvents({
        correlationId: params.correlationId as string | undefined,
        taskId: params.taskId as string | undefined,
        since: params.since as string | undefined,
        until: params.until as string | undefined,
        limit: params.limit as number | undefined,
      });
    case "listTaskJournalEntries":
      return ns.listTaskJournalEntries({
        taskId: params.taskId as string | undefined,
        limit: params.limit as number | undefined,
      });
    case "getCostSummary":
      return ns.getCostSummary({
        since: params.since as string | undefined,
        until: params.until as string | undefined,
        providerId: params.providerId as string | undefined,
        taskType: params.taskType as string | undefined,
      });
    case "runCostRollupRetention":
      return ns.runCostRollupRetention();
    case "listAgentCards":
      return ns.listAgentCards();
    case "getAgentCard":
      return ns.getAgentCard(params.ownerId as string);
    case "requestAgentCard":
      return ns.requestAgentCard(params.targetOwnerId as string);
    case "getTaskResult":
      return ns.getTaskResult(params.taskId as string);
    case "listPendingApprovals":
      return ns.listPendingApprovals();
    case "approvePendingApproval":
      return ns.approvePendingApproval(params.itemId as string, params.notes as string | undefined);
    case "rejectPendingApproval":
      return ns.rejectPendingApproval(params.itemId as string, params.notes as string | undefined);
    case "deleteChatMessage":
      return ns.deleteChatMessage(params.peerOwnerId as string, params.messageId as string);
    case "clearChatHistory":
      return ns.clearChatHistory(params.peerOwnerId as string);
    case "markRead":
      return ns.markRead(params.targetOwnerId as string, params.upToMessageId as string | undefined);
    case "getChatDrafts":
      return ns.getChatDrafts(params.threadPeerOwnerId as string | undefined);
    case "deleteChatDraft":
      return ns.deleteChatDraft(params.draftId as string);
    case "searchPeers":
      return ns.searchPeers(params as any);
    case "shareFile":
      return ns.shareFile(params.targetOwnerId as string, params.file as any);
    case "acceptShare":
      return ns.acceptShare(params.shareId as string, params.savePath as string);
    case "declineShare":
      return ns.declineShare(params.shareId as string);
    case "listPendingShareOffers":
      return ns.listPendingShareOffers();
    case "listLibraryItems":
      return ns.listLibraryItems(params as ListLibraryItemsParams | undefined);
    case "listAllLocalFiles":
      return ns.listAllLocalFiles(params as import("@envoymesh/api").ListAllLocalFilesParams | undefined);
    case "readLocalFileContent":
      return ns.readLocalFileContent({
        source: params.source as import("@envoymesh/api").LocalFileSource,
        relativePath: params.relativePath as string,
        documentId: params.documentId as string | undefined,
        maxBytes: params.maxBytes as number | undefined,
      });
    case "openLocalFile":
      return ns.openLocalFile({
        source: params.source as import("@envoymesh/api").LocalFileSource,
        relativePath: params.relativePath as string,
      });
    case "setLibraryItemPublished":
      return ns.setLibraryItemPublished(params.documentId as string, params.published as boolean);
    case "exportLibraryItemToIpfs":
      return ns.exportLibraryItemToIpfs(params.documentId as string);
    case "pinLibraryItemExternal":
      return ns.pinLibraryItemExternal(params.documentId as string);
    case "getIpfsEngineStatus":
      return ns.getIpfsEngineStatus();
    case "getRagIndexStatus":
      return ns.getRagIndexStatus();
    case "verifyLibraryItemIpfsGateway":
      return ns.verifyLibraryItemIpfsGateway({
        documentId: params.documentId as string,
        gatewayUrl: params.gatewayUrl as string | undefined,
      });
    case "importToLibrary":
      return ns.importToLibrary({
        relativePath: params.relativePath as string,
        contentBase64: params.contentBase64 as string,
        mimeType: params.mimeType as string | undefined,
      });
    case "createNote":
      return ns.createNote({
        filename: params.filename as string,
        content: params.content as string,
        subfolder: params.subfolder as string | undefined,
        sensitivity: params.sensitivity as "public" | "friends" | "private" | undefined,
      });
    case "deleteVaultItem":
      return ns.deleteVaultItem({
        relativePath: params.relativePath as string,
      });
    case "resolveLibraryItemPath":
      return ns.resolveLibraryItemPath(params.relativePath as string);
    case "openLibraryItem":
      return ns.openLibraryItem(params.relativePath as string);
    case "revealLibraryItemInFileManager":
      return ns.revealLibraryItemInFileManager(params.relativePath as string);
    case "discoverPublishedLibrary":
      return ns.discoverPublishedLibrary(params as DiscoverPublishedLibraryParams | undefined);
    case "listAgentShareProposals":
      return ns.listAgentShareProposals();
    case "dismissAgentShareProposal":
      return ns.dismissAgentShareProposal(params.proposalId as string);
    case "submitAgentShareProposal":
      return ns.submitAgentShareProposal({
        targetOwnerId: params.targetOwnerId as string,
        vaultRelativePath: params.vaultRelativePath as string,
        sensitivity: params.sensitivity as "public" | "friends" | "private",
        summary: params.summary as string | undefined,
      });
    case "getConnectionStatus":
      return ns.getConnectionStatus();
    case "getPeerConnectionInfo":
      return ns.getPeerConnectionInfo(params.peerOwnerId as string);
    case "warmContactConnection":
      return ns.warmContactConnection(
        String(params.peerOwnerId ?? ""),
        {
          ...(params.redial === true ? { redial: true } : {}),
          ...(params.verifyOnly === true ? { verifyOnly: true } : {}),
          ...(params.upgradeRelayToDirect === true ? { upgradeRelayToDirect: true } : {}),
          ...(params.keepAlive === true ? { keepAlive: true } : {}),
          ...(params.verifyConnection === true ? { verifyConnection: true } : {}),
        },
      );
    case "getChatDiagnostics":
      return ns.getChatDiagnostics(params.peerOwnerId as string | undefined);
    case "getConnectivityDiagnostics":
      return ns.getConnectivityDiagnostics();
    case "getBootstrapPeers":
      return ns.getBootstrapPeers();
    case "runCapabilityDiscovery":
      return ns.runCapabilityDiscovery({
        find: params.find as boolean | undefined,
      });
    case "discoverCapabilityTopic":
      return ns.discoverCapabilityTopic(params as any);
    case "getMorningReport":
      return ns.getMorningReport({ limit: params.limit as number | undefined });
    case "requestMultiHopDiscovery":
      return ns.requestMultiHopDiscovery(params as unknown as import("@envoymesh/api").RequestMultiHopDiscoveryParams);
    case "getMultiHopDiscoverySession":
      return ns.getMultiHopDiscoverySession(params.correlationId as string);
    case "sendSyncStateUpdate":
      return ns.sendSyncStateUpdate(params as unknown as import("@envoymesh/api").SendSyncStateUpdateParams);
    case "getNodeConfig":
      return ns.getNodeConfig();
    case "updateNodeConfig":
      return ns.updateNodeConfig(params as any);
    case "getSetupSponsorFriendConfig":
      return ns.getSetupSponsorFriendConfig();
    case "getSetupSponsorFriendStatus":
      return ns.getSetupSponsorFriendStatus();
    case "runSetupSponsorFriend":
      return ns.runSetupSponsorFriend({
        forceBypassGuards: params.forceBypassGuards === true,
      });
    case "listRelays":
      return ns.listRelays();
    case "addRelay":
      return ns.addRelay(params.addr as string, params.level as number | undefined, params.region as string | undefined);
    case "removeRelay":
      return ns.removeRelay(params.relayId as string);
    case "initNode":
      return await ns.initNode(params.profileDir as string, params.options as any);
    case "getNodeStatus":
      return { status: ns.getNodeStatus() };
    case "startNode":
      await ns.startNode();
      return { success: true };
    case "stopNode":
      await ns.stopNode();
      return { success: true };
    case "advertiseTopic":
      await ns.advertiseTopic(params.topic as string);
      return { success: true };
    case "stopAdvertiseTopic":
      await ns.stopAdvertiseTopic(params.topic as string);
      return { success: true };
    case "knowledgeQuery":
      return ns.knowledgeQuery(params.question as string);
    case "runDocumentAgentTurn":
      return ns.runDocumentAgentTurn(params.message as string);
    case "runOwnerAgentTurn":
      return ns.runOwnerAgentTurn(
        params.message as string,
        typeof params.humanMessageId === "string"
          ? { humanMessageId: params.humanMessageId }
          : undefined,
      );
    case "listSocialProxySessions":
      return ns.listSocialProxySessions();
    case "runSocialProxyPass":
      return ns.runSocialProxyPass();
    case "cancelSocialProxySession":
      return ns.cancelSocialProxySession(params.sessionId as string);
    case "listAgentCircles":
      return ns.listAgentCircles();
    case "createAgentCircle":
      return ns.createAgentCircle({
        label: params.label as string,
        memberOwnerIds: params.memberOwnerIds as string[],
        topicTags: (params.topicTags as string[]) ?? [],
      });
    case "updateAgentCircle":
      return ns.updateAgentCircle(params.circleId as string, {
        label: params.label as string | undefined,
        memberOwnerIds: params.memberOwnerIds as string[] | undefined,
        topicTags: params.topicTags as string[] | undefined,
      });
    case "deleteAgentCircle":
      return ns.deleteAgentCircle(params.circleId as string);
    case "proposeAgentCircles":
      return ns.proposeAgentCircles();
    case "meshIntelligenceReport":
      return ns.generateMeshIntelligenceReport();
    case "discoverAndCluster":
      return ns.discoverAndCluster(params.seedTopics as string[] | undefined, params.seedCapabilities as string[] | undefined);
    case "chatRagSearch":
      return ns.chatRagSearch(params.query as string, {
        ownerId: params.ownerId as string | undefined,
        maxResults: params.maxResults as number | undefined,
      });
    case "startDocumentAcquisitionJob":
      return ns.startDocumentAcquisitionJob({
        query: params.query as string,
        fileTitleHint: params.fileTitleHint as string | undefined,
        pathHint: params.pathHint as string | undefined,
      });
    case "getDocumentAcquisitionJob":
      return ns.getDocumentAcquisitionJob(params.jobId as string);
    case "listDocumentAcquisitionJobs":
      return ns.listDocumentAcquisitionJobs(params.activeOnly as boolean | undefined);
    case "cancelDocumentAcquisitionJob":
      return ns.cancelDocumentAcquisitionJob(params.jobId as string);
    case "listActiveTransfers":
      return ns.listActiveTransfers();
    case "getTransferStatus":
      return ns.getTransferStatus(params.correlationId as string);
    case "getBridgeStatus":
      return ns.getBridgeStatus();
    case "getOpenClawStatus":
      return ns.getOpenClawStatus();
    case "getPairingPayload":
      return ns.getPairingPayload();
    case "createWanJoinInvite":
      return ns.createWanJoinInvite({
        expiresInHours: params.expiresInHours as number | undefined,
        note: params.note as string | undefined,
      });
    case "applyWanJoinInvite":
      return ns.applyWanJoinInvite(String(params.token ?? ""));
    case "createCompanyInvite":
      return ns.createCompanyInvite({
        expiresInHours: params.expiresInHours as number | undefined,
        note: params.note as string | undefined,
      });
    case "listCompanyInvites":
      return ns.listCompanyInvites();
    case "revokeCompanyInvite":
      return ns.revokeCompanyInvite(String(params.inviteId ?? ""));
    case "redeemCompanyInvite":
      return ns.redeemCompanyInvite({
        token: String(params.token ?? ""),
        wsUrl: params.wsUrl as string | undefined,
        ownerId: params.ownerId as string | undefined,
        helloMessage: params.helloMessage as string | undefined,
      });
    case "syncPairingKioskFromConfig":
      return ns.syncPairingKioskFromConfig();
    case "getPairingKioskStatus":
      return ns.getPairingKioskStatus();
    case "importFleetManifest":
      return ns.importFleetManifest(params as any);
    case "listFleetManifests":
      return ns.listFleetManifests();
    case "revokeFleetManifest":
      return ns.revokeFleetManifest(String(params.manifestId ?? ""));
    case "createFleetManifest":
      return ns.createFleetManifest(params as any);
    case "pairDevice":
      return ns.pairDevice(params as any);
    case "pairSharedIdentity":
      return ns.pairSharedIdentity(params as any);
    case "updateMyListenAddrs":
      return ns.updateMyListenAddrs(params as any);
    case "pairWithHomeNode":
      return ns.pairWithHomeNode(params as any);
    case "pairThinClient":
      return ns.pairThinClient(params as any);
    case "listAuthorizedDevices":
      return ns.listAuthorizedDevices();
    case "revokeAuthorizedDevice":
      return ns.revokeAuthorizedDevice(params as any);
    case "mergeAuthorizedDevices":
      return ns.mergeAuthorizedDevices(params as any);
    case "pruneRevokedDevices":
      return ns.pruneRevokedDevices();
    case "listDeviceRevocations":
      return ns.listDeviceRevocations();
    case "terminalExec":
      return ns.terminalExec(params as { sessionId: string; command: string });
    case "listTerminalSessions":
      return ns.listTerminalSessions();
    case "createTerminalSession":
      return ns.createTerminalSession({
        title: params.title as string | undefined,
        cwd: params.cwd as string | undefined,
        cols: params.cols as number | undefined,
        rows: params.rows as number | undefined,
      });
    case "closeTerminalSession":
      return ns.closeTerminalSession({ sessionId: String(params.sessionId ?? "") });
    case "renameTerminalSession":
      return ns.renameTerminalSession({
        sessionId: String(params.sessionId ?? ""),
        title: String(params.title ?? ""),
      });
    case "terminalAttach":
      return ns.terminalAttach({
        sessionId: String(params.sessionId ?? ""),
        cols: params.cols as number | undefined,
        rows: params.rows as number | undefined,
      });
    case "terminalRunFromNaturalLanguage":
      return ns.terminalRunFromNaturalLanguage({
        sessionId: String(params.sessionId ?? ""),
        prompt: String(params.prompt ?? ""),
      });
    case "terminalExecuteProposal":
      return ns.terminalExecuteProposal({
        sessionId: String(params.sessionId ?? ""),
        proposalId: String(params.proposalId ?? ""),
        confirmed: params.confirmed as boolean | undefined,
      });
    case "terminalSetAssistModelOverride":
      return ns.terminalSetAssistModelOverride({
        sessionId: String(params.sessionId ?? ""),
        modelName: params.modelName as string | undefined,
      });
    case "terminalGetAssistState":
      return ns.terminalGetAssistState(String(params.sessionId ?? ""));
    case "terminalExplainScrollback":
      return ns.terminalExplainScrollback({
        sessionId: String(params.sessionId ?? ""),
        topic: params.topic as string | undefined,
      });
    case "terminalSuggestCommand":
      return ns.terminalSuggestCommand({
        sessionId: String(params.sessionId ?? ""),
        partialInput: String(params.partialInput ?? ""),
      });
    case "terminalObserveStep":
      return ns.terminalObserveStep({
        sessionId: String(params.sessionId ?? ""),
        goal: params.goal as string | undefined,
        timeoutMs: params.timeoutMs as number | undefined,
        stableMs: params.stableMs as number | undefined,
      });
    case "terminalSetInlineSuggestEnabled":
      return ns.terminalSetInlineSuggestEnabled({
        sessionId: String(params.sessionId ?? ""),
        enabled: Boolean(params.enabled),
      });
    case "terminalOpenClawPlan":
      return ns.terminalOpenClawPlan({
        sessionId: String(params.sessionId ?? ""),
        prompt: String(params.prompt ?? ""),
      });
    case "terminalRunPlanStep":
      return ns.terminalRunPlanStep({
        sessionId: String(params.sessionId ?? ""),
        planId: String(params.planId ?? ""),
        stepIndex: Number(params.stepIndex ?? 0),
      });
    case "terminalEnablePrepareMode":
      return ns.terminalEnablePrepareMode({
        sessionId: String(params.sessionId ?? ""),
        enabled: Boolean(params.enabled),
      });
    case "terminalWatchStep":
      return ns.terminalWatchStep({
        sessionId: String(params.sessionId ?? ""),
        goal: String(params.goal ?? ""),
        lastScrollbackBytes: params.lastScrollbackBytes as number | undefined,
      });
    case "terminalPinContextSession":
      return ns.terminalPinContextSession({
        sessionId: String(params.sessionId ?? ""),
        contextSessionId: params.contextSessionId as string | undefined,
      });
    case "terminalDetectFailure":
      return ns.terminalDetectFailure({ sessionId: String(params.sessionId ?? "") });
    case "terminalSuggestFixFromFailure":
      return ns.terminalSuggestFixFromFailure({ sessionId: String(params.sessionId ?? "") });
    case "terminalStartGoalLoop":
      return ns.terminalStartGoalLoop({
        sessionId: String(params.sessionId ?? ""),
        goal: String(params.goal ?? ""),
        maxSteps: params.maxSteps as number | undefined,
      });
    case "terminalAdvanceGoalLoop":
      return ns.terminalAdvanceGoalLoop({ sessionId: String(params.sessionId ?? "") });
    case "terminalCancelGoalLoop":
      return ns.terminalCancelGoalLoop({ sessionId: String(params.sessionId ?? "") });
    case "terminalClearResumeGoal":
      return ns.terminalClearResumeGoal(String(params.sessionId ?? ""));
    case "terminalSendContextToAssistant":
      return ns.terminalSendContextToAssistant({
        sessionId: String(params.sessionId ?? ""),
        userPrompt: params.userPrompt as string | undefined,
        maxBytes: params.maxBytes as number | undefined,
      });
    case "terminalUpdatePlanProgress":
      return ns.terminalUpdatePlanProgress({
        sessionId: String(params.sessionId ?? ""),
        planId: String(params.planId ?? ""),
        completedStepIndex: params.completedStepIndex as number | undefined,
        skippedStepIndex: params.skippedStepIndex as number | undefined,
      });
    case "terminalGetScrollbackPreview":
      return ns.terminalGetScrollbackPreview({
        sessionId: String(params.sessionId ?? ""),
        maxBytes: params.maxBytes as number | undefined,
      });
    case "terminalResumeGoalLoop":
      return ns.terminalResumeGoalLoop({ sessionId: String(params.sessionId ?? "") });
    case "terminalEnableExecPane":
      return ns.terminalEnableExecPane({
        sessionId: String(params.sessionId ?? ""),
        enabled: Boolean(params.enabled),
      });
    case "terminalSetBackgroundWatch":
      return ns.terminalSetBackgroundWatch({
        sessionId: String(params.sessionId ?? ""),
        goal: String(params.goal ?? ""),
        stableMs: params.stableMs as number | undefined,
      });
    case "terminalClearBackgroundWatch":
      return ns.terminalClearBackgroundWatch({ sessionId: String(params.sessionId ?? "") });
    case "openInHerdr":
      return ns.openInHerdr({ cwd: params.cwd as string | undefined });
    case "terminalGetHerdrExportHint":
      return ns.terminalGetHerdrExportHint({ sessionId: String(params.sessionId ?? "") });
    case "homeTerminalWsOpen":
      return ns.homeTerminalWsOpen({ pathWithQuery: String(params.pathWithQuery ?? "") });
    case "homeTerminalWsSend":
      return ns.homeTerminalWsSend({
        dataBase64: String(params.dataBase64 ?? ""),
        ...(params.sessionId != null && String(params.sessionId).trim()
          ? { sessionId: String(params.sessionId).trim() }
          : {}),
      });
    case "homeTerminalWsClose":
      return ns.homeTerminalWsClose(
        params.sessionId != null && String(params.sessionId).trim()
          ? { sessionId: String(params.sessionId).trim() }
          : undefined,
      );
    case "forwardEnvelope":
      return ns.forwardEnvelope(params.envelope as Record<string, unknown>, params.dialHints as string[] | undefined);
    case "getOpenClawPlugins":
      return ns.getOpenClawPlugins();
    case "searchOpenClawPlugins":
      return ns.searchOpenClawPlugins(String(params.query ?? ""));
    case "getTrendingOpenClawPlugins":
      return ns.getTrendingOpenClawPlugins();
    case "installOpenClawPlugin":
      return ns.installOpenClawPlugin(String(params.name ?? ""));
    case "uninstallOpenClawPlugin":
      return ns.uninstallOpenClawPlugin(String(params.name ?? ""));
    case "saveClawhubToken":
      return ns.saveClawhubToken(String(params.token ?? ""));
    case "saveWebSearchEnabled":
      return ns.saveWebSearchEnabled(Boolean(params.enabled));
    case "sendToOpenClaw":
      return ns.sendToOpenClaw(String(params.text ?? ""));
    case "sendToBridge":
      return ns.sendToBridge(String(params.text ?? ""));
    case "getPairedDiagnostics":
      return ns.getPairedDiagnostics();
    case "saveSkillApiKeys":
      return ns.saveSkillApiKeys(params.keys as Record<string, string> ?? {});
    case "homeclawCoreProxy":
      return ns.homeclawCoreProxy(params as unknown as HomeClawCoreProxyParams);
    // HomeClaw Core WebSocket tunnel methods — only available via direct WebSocket.
    // The relay bridge uses a libp2p request-response stream which cannot push
    // homeclawCoreWs:rx events back to the client, so these are:
    //   - wsOpen → returns an error telling the client to use direct WS
    //   - wsSend → returns an error (no tunnel)
    //   - wsClose → succeeds (no-op, tunnel never opened)
    case "homeClawCoreWsOpen":
    case "home_claw_core_ws_open":
      return { ok: false, error: "Core WebSocket tunnel requires direct WebSocket connection to home node" };
    case "homeClawCoreWsSend":
    case "home_claw_core_ws_send":
      return { ok: false, error: "no active Core WebSocket tunnel (connect directly to home node)" };
    case "homeClawCoreWsClose":
    case "home_claw_core_ws_close":
      return { ok: true };
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}
