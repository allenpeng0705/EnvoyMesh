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
    case "getHumanProfile":
      return ns.getHumanProfile();
    case "updateHumanProfile":
      return ns.updateHumanProfile(params as any);
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
    case "listChatHistory":
      return ns.listChatHistory(params.peerOwnerId as string, params.limit as number | undefined);
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
    case "getIpfsEngineStatus":
      return ns.getIpfsEngineStatus();
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
    case "listActiveTransfers":
      return ns.listActiveTransfers();
    case "getTransferStatus":
      return ns.getTransferStatus(params.correlationId as string);
    case "getBridgeStatus":
      return ns.getBridgeStatus();
    case "getPairingPayload":
      return ns.getPairingPayload();
    case "pairDevice":
      return ns.pairDevice(params as any);
    case "pairSharedIdentity":
      return ns.pairSharedIdentity(params as any);
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
