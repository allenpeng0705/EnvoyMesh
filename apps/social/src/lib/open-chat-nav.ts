/** Open Social → Chats with a peer thread selected. */

export const OPEN_CHAT_PEER_EVENT = "envoymesh:open-chat-peer";

export type OpenChatPeerDetail = {
  ownerId: string;
};

export function openChatWithPeer(ownerId: string): void {
  const id = ownerId.trim();
  if (!id) return;
  window.dispatchEvent(
    new CustomEvent<OpenChatPeerDetail>(OPEN_CHAT_PEER_EVENT, {
      detail: { ownerId: id },
    }),
  );
}
