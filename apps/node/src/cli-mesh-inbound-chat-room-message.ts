// @ts-nocheck - runtime is loosely typed by design.

/**
 * chat.room.message arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm was a ~10-line block that:
 *   1. Parses the chat.room.message payload
 *   2. Calls nodeService.handleInboundChatRoomMessage
 *   3. Logs invalid payloads
 *
 * Now it is a 1-line call to this runtime.
 */

export interface ChatRoomMessageParams {
  envelope: unknown;
  remotePeerId: string;
  replyWithEnvelope?: (envelope: unknown) => Promise<void>;
}

export async function handleChatRoomMessageViaRuntime(
  ctx: any,
  params: ChatRoomMessageParams,
): Promise<void> {
  try {
    const payload = ctx.parseChatRoomMessagePayload(params.envelope.payload);
    await ctx.handleInboundChatRoomMessage(
      params.envelope,
      payload,
      params.remotePeerId,
      params.replyWithEnvelope,
    );
  } catch {
    ctx.logWarn(`[chat.room.message] invalid payload from ${params.remotePeerId}`);
  }
}