/**
 * WS RPC concurrency — mesh dials / sends serialize per client; reads run in parallel.
 */

/** Methods that may block on libp2p dials or long outbound work — one at a time per WS client. */
export const WS_SERIALIZED_RPC_METHODS = new Set<string>([
  "warmContactConnection",
  "sendChat",
  "sendChatAttachment",
  "sendAgentChat",
  "sendHello",
  "acceptHello",
  "sendChatRoomMessage",
  "sendChatRoomAttachment",
  "createChatRoom",
  "inviteToChatRoom",
  "shareFile",
  "acceptShare",
  "sendCallInvite",
  "sendCallReinvite",
  "acceptCallInvite",
  "forwardEnvelope",
  "requestPeerProfile",
  "refreshBondPeerProfiles",
  "syncProfileToBonds",
  "runSocialProxyPass",
  "runCapabilityDiscovery",
  "requestMultiHopDiscovery",
  "sendToOpenClaw",
  "sendToBridge",
  "startNode",
  "initNode",
  "meshIntelligenceReport",
  "discoverAndCluster",
  "discoverPublishedLibrary",
  "exportLibraryItemToIpfs",
  "startDocumentAcquisitionJob",
]);

export function isSerializedWsRpcMethod(method: string): boolean {
  return WS_SERIALIZED_RPC_METHODS.has(method);
}
