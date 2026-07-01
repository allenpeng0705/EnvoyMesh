/**
 * Inbound chat.room.sync dispatcher (Step 42).
 *
 * Extracted from `_handleInboundMessage` in `node-service-impl.ts`.
 * Tiny cluster that parses the room-sync payload and calls
 * `handleInboundChatRoomSyncImpl`.
 */
import { parseChatRoomSyncPayload } from "@envoymesh/protocol";
import { handleInboundChatRoomSyncImpl } from "./chat-room-service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ChatRoomSyncContext {
  getChatRoomDeps(): any;
}

export interface ChatRoomSyncParams {
  envelope: any;
  remotePeerId: string;
}

export async function handleChatRoomSyncViaRuntime(
  ctx: ChatRoomSyncContext,
  params: ChatRoomSyncParams,
): Promise<boolean> {
  try {
    const payload = parseChatRoomSyncPayload(params.envelope.payload);
    await handleInboundChatRoomSyncImpl(ctx.getChatRoomDeps(), params.envelope, payload);
  } catch {
    console.warn(`[chat.room.sync] invalid payload from ${params.remotePeerId}`);
  }
  return true;
}