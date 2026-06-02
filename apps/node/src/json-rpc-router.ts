import type {
  NodeService,
  RpcMethods,
  HomeClawCoreProxyParams,
  ListLibraryItemsParams,
  DiscoverPublishedLibraryParams,
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
      return ns.sendChat(params.targetOwnerId as string, params.text as string);
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
    case "listAgentCards":
      return ns.listAgentCards();
    case "getAgentCard":
      return ns.getAgentCard(params.ownerId as string);
    case "requestAgentCard":
      return ns.requestAgentCard(params.targetOwnerId as string);
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
      return ns.warmContactConnection(params.peerOwnerId as string);
    case "getChatDiagnostics":
      return ns.getChatDiagnostics(params.peerOwnerId as string | undefined);
    case "getConnectivityDiagnostics":
      return ns.getConnectivityDiagnostics();
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
      return ns.runOwnerAgentTurn(params.message as string);
    case "listSocialProxySessions":
      return ns.listSocialProxySessions();
    case "runSocialProxyPass":
      return ns.runSocialProxyPass();
    case "cancelSocialProxySession":
      return ns.cancelSocialProxySession(params.sessionId as string);
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
    case "getPairingPayload":
      return ns.getPairingPayload();
    case "createWanJoinInvite":
      return ns.createWanJoinInvite({
        expiresInHours: params.expiresInHours as number | undefined,
        note: params.note as string | undefined,
      });
    case "applyWanJoinInvite":
      return ns.applyWanJoinInvite(String(params.token ?? ""));
    case "pairDevice":
      return ns.pairDevice(params as any);
    case "pairSharedIdentity":
      return ns.pairSharedIdentity(params as any);
    case "pairWithHomeNode":
      return ns.pairWithHomeNode(params as any);
    case "listAuthorizedDevices":
      return ns.listAuthorizedDevices();
    case "revokeAuthorizedDevice":
      return ns.revokeAuthorizedDevice(params as any);
    case "listDeviceRevocations":
      return ns.listDeviceRevocations();
    case "forwardEnvelope":
      return ns.forwardEnvelope(params.envelope as Record<string, unknown>, params.dialHints as string[] | undefined);
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
