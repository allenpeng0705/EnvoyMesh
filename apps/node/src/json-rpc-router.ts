import type { NodeService, RpcMethods, HomeClawCoreProxyParams } from "@envoymesh/api";

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
    case "sendChat":
      return ns.sendChat(params.targetOwnerId as string, params.text as string);
    case "listChatHistory":
      return ns.listChatHistory(params.peerOwnerId as string, params.limit as number | undefined);
    case "markRead":
      return ns.markRead(params.targetOwnerId as string, params.upToMessageId as string | undefined);
    case "searchPeers":
      return ns.searchPeers(params as any);
    case "shareFile":
      return ns.shareFile(params.targetOwnerId as string, params as any);
    case "acceptShare":
      return ns.acceptShare(params.shareId as string, params.savePath as string);
    case "declineShare":
      return ns.declineShare(params.shareId as string);
    case "getConnectionStatus":
      return ns.getConnectionStatus();
    case "getPeerConnectionInfo":
      return ns.getPeerConnectionInfo(params.peerOwnerId as string);
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
    case "getBridgeStatus":
      return ns.getBridgeStatus();
    case "getPairingPayload":
      return ns.getPairingPayload();
    case "forwardEnvelope":
      return ns.forwardEnvelope(params.envelope as Record<string, unknown>, params.dialHints as string[] | undefined);
    case "homeclawCoreProxy":
      return ns.homeclawCoreProxy(params as unknown as HomeClawCoreProxyParams);
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}
