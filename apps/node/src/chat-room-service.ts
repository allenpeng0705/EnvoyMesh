/** Desktop node adapter — re-exports shared room logic from `@envoymesh/api`. */
export {
  createChatRoomImpl,
  dismissChatRoomImpl,
  handleInboundChatRoomMessageImpl,
  handleInboundChatRoomSyncImpl,
  inviteToChatRoomImpl,
  leaveChatRoomImpl,
  listChatRoomsImpl,
  removeMembersFromChatRoomImpl,
  renameChatRoomImpl,
  sendChatRoomMessageImpl,
  sendChatRoomAttachmentImpl,
  flushPendingRoomSyncsImpl,
  flushPendingRoomMessagesImpl,
  type ChatRoomServiceDeps,
} from "@envoymesh/api/chat-room-service";
