/**
 * Inbound chat.room.message dispatcher (Step 39).
 *
 * Extracted from `_handleInboundMessage` in `node-service-impl.ts`.
 * Handles `chat.room.message` envelopes and dispatches them to
 * `handleInboundChatRoomMessageImpl`. Also kicks off
 * `runInboundChatAssist` for incoming messages from bonded peers.
 */
import {
  createUnsignedEnvelope,
  parseChatRoomMessagePayload,
} from "@envoymesh/protocol";
import { deriveCorrelationIdFromEnvelope } from "@envoymesh/local-store";
import { handleInboundChatRoomMessageImpl } from "./chat-room-service.js";
import { runInboundChatAssist } from "./inbound-chat-assist.js";
import { chatRoomThreadKey } from "@envoymesh/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ChatRoomMessageContext {
  getTaskStore(): any;
  getChatDraftStore(): any;
  getProfile(): any;
  getChatLogStore(): any;
  getHumanProfileStore(): any;
  getAgentIdentityStore(): any;
  getTrustStore(): any;
  getPeerDirectoryStore(): any;
  getStyleAdapter(): any;
  getVaultDir(): string;
  getConfigStore(): any;
  getApprovalQueue(): any;
  getAutoReplyLimitStore(): any;
  getNodeConfig(): Promise<any>;
  /** Build the chat-room deps snapshot used by the room-message handler. */
  getChatRoomDeps(): any;
  sendAgentChat(targetOwnerId: string, text: string): Promise<any>;
  emit(event: string, payload: unknown): void;
}

export interface ChatRoomMessageParams {
  envelope: any;
  remotePeerId: string;
  guardDecision: { action: string; envelope: any };
}

export async function handleChatRoomMessageViaRuntime(
  ctx: ChatRoomMessageContext,
  params: ChatRoomMessageParams,
): Promise<boolean> {
  const { envelope, remotePeerId, guardDecision } = params;
  let roomPayload: ReturnType<typeof parseChatRoomMessagePayload>;
  try {
    roomPayload = parseChatRoomMessagePayload(envelope.payload);
  } catch {
    console.warn(`[chat.room.message] invalid payload from ${remotePeerId}`);
    return true;
  }

  // The original code also called `this._roomDeliveryAck(replyWithEnvelope)`
  // before handleInboundChatRoomMessageImpl. We accept the
  // delivery-ack callback via the context (not in this slice — left to
  // the class to wire before calling the runtime).
  await handleInboundChatRoomMessageImpl(
    ctx.getChatRoomDeps(),
    envelope,
    roomPayload,
    remotePeerId,
    undefined, // deliveryAck — class-side hook
  );

  const selfOwnerId = ctx.getProfile()?.owner?.ownerId;
  if (
    selfOwnerId &&
    roomPayload.senderOwnerId !== selfOwnerId &&
    guardDecision.action === "allow" &&
    ctx.getTaskStore() &&
    ctx.getChatDraftStore() &&
    ctx.getProfile()
  ) {
    const receivedAt = Date.now();
    const correlationId = deriveCorrelationIdFromEnvelope(envelope);
    void ctx.getConfigStore().load().then(async (config: any) => {
      if (!config || !ctx.getTaskStore() || !ctx.getChatDraftStore() || !ctx.getProfile()) {
        return;
      }
      const nodeConfig = await ctx.getNodeConfig();
      await runInboundChatAssist({
        envelope: guardDecision.envelope,
        senderOwnerId: roomPayload.senderOwnerId,
        chatText: roomPayload.text,
        remotePeerId,
        receivedAt,
        correlationId,
        config,
        modelProviders: nodeConfig.modelProviders,
        profile: ctx.getProfile(),
        taskStore: ctx.getTaskStore(),
        trustStore: ctx.getTrustStore(),
        peerDirectoryStore: ctx.getPeerDirectoryStore(),
        draftStore: ctx.getChatDraftStore(),
        chatLogStore: ctx.getChatLogStore(),
        humanProfileStore: ctx.getHumanProfileStore(),
        agentIdentityStore: ctx.getAgentIdentityStore(),
        vaultDir: ctx.getVaultDir(),
        styleAdapter: ctx.getStyleAdapter(),
        sendChat: (targetOwnerId: string, text: string) =>
          ctx.sendAgentChat(targetOwnerId, text),
        emitDraft: (threadPeerOwnerId: string, draft: any) => {
          ctx.emit("chat:draft", {
            threadPeerOwnerId,
            draft: { ...draft, threadPeerOwnerId },
          });
        },
        approvalQueue: ctx.getApprovalQueue(),
        autoReplyLimitStore: ctx.getAutoReplyLimitStore(),
        onAutoReplyPaused: (notification: any) => {
          ctx.emit("chat:auto-reply-paused", notification);
        },
        draftThreadKey: chatRoomThreadKey(roomPayload.roomId),
        disableAutoSend: true,
      });
    });
  }
  return true;
}