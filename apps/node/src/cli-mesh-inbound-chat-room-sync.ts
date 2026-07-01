// @ts-nocheck - runtime is loosely typed by design.

/**
 * chat.room.sync arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm was a ~10-line block that:
 *   1. Parses the chat.room.sync payload
 *   2. Calls nodeService.handleInboundChatRoomSync
 *   3. Logs invalid payloads
 *
 * Now it is a 1-line call to this runtime.
 */

export interface ChatRoomSyncParams {
  envelope: unknown;
  remotePeerId: string;
}

export async function handleChatRoomSyncViaRuntime(
  ctx: any,
  params: ChatRoomSyncParams,
): Promise<void> {
  try {
    const payload = ctx.parseChatRoomSyncPayload(params.envelope.payload);
    await ctx.handleInboundChatRoomSync(params.envelope, payload);
  } catch {
    ctx.logWarn(`[chat.room.sync] invalid payload from ${params.remotePeerId}`);
  }
}