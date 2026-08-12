/**
 * Inbound chat.message dispatcher (Step 40).
 *
 * Extracted from `_handleInboundMessage` in `node-service-impl.ts`.
 * Handles `chat.message` envelopes — verifies the sender's device,
 * records the delivery-ack, persists the chat message, kicks off
 * auto-assist for incoming messages, and emits `chat:message` events.
 */
import {
  verifyInboundChatDevice,
  formatChatSenderDisplayName,
} from "./chat-device-auth.js";
import { buildSignedChatDeliveredEnvelope } from "@envoymesh/api/chat-delivered";
import {
  ChatMessage,
  chatSenderActorFromEnvelope,
  chatWireAttachmentsToContent,
} from "@envoymesh/api";
import { parseChatMessagePayload } from "@envoymesh/protocol";
import { stripModelThinking } from "@envoymesh/api";
import { dialableInboundRemoteAddrs } from "./inbound-dial-hint-learn.js";
import { runInboundChatAssist } from "./inbound-chat-assist.js";
import { deriveCorrelationIdFromEnvelope } from "@envoymesh/local-store";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ChatMessageContext {
  getTaskStore(): any;
  getChatDraftStore(): any;
  getChatLogStore(): any;
  getProfile(): any;
  getHumanProfileStore(): any;
  getTrustStore(): any;
  getPeerDirectoryStore(): any;
  getStyleAdapter(): any;
  getVaultDir(): string;
  getConfigStore(): any;
  getApprovalQueue(): any;
  getAutoReplyLimitStore(): any;
  getNodeConfig(): Promise<any>;
  getMesh(): any;
  /** Persist a chat message directly (when no log store). */
  persistChatMessage(senderOwnerId: string, msg: any): void;
  /** Reconcile an inbound direct-chat message for UI display. */
  reconcileInboundDirectChatMessage(senderOwnerId: string, msg: any): Promise<any>;
  emit(event: string, payload: unknown): void;
  sendAgentChat(targetOwnerId: string, text: string): Promise<any>;
  tagBondedContactReachability(remotePeerId: string): Promise<void> | void;
  isOwnerOnline(): Promise<boolean>;
  /** Agent Mode: OpenClaw draft hooks (optional). */
  askOpenClaw?(prompt: string, context?: unknown): Promise<string>;
  buildOpenClawTurnContext?(): Promise<unknown>;
  ensureOpenClawReady?(): Promise<boolean>;
}

export interface ChatMessageParams {
  envelope: any;
  remotePeerId: string;
  remoteAddr: string;
  guardDecision: { action: string; envelope: any };
  replyWithEnvelope?: (envelope: any) => Promise<void>;
}

export async function handleChatMessageViaRuntime(
  ctx: ChatMessageContext,
  params: ChatMessageParams,
): Promise<boolean> {
  const { envelope, remotePeerId, remoteAddr, guardDecision } = params;
  let payload: ReturnType<typeof parseChatMessagePayload>;
  try {
    payload = parseChatMessagePayload(envelope.payload);
  } catch {
    console.warn(`[chat.message] invalid payload from ${remotePeerId}`);
    return true;
  }

  const deviceAuth = await verifyInboundChatDevice(envelope, payload);
  if (!deviceAuth.ok) {
    console.warn(`[chat.message] rejected from ${remotePeerId}: ${deviceAuth.reason}`);
    return true;
  }

  const profile = ctx.getProfile();
  const senderTrust = await ctx.getTrustStore().getTrustRecord(payload.senderOwnerId);
  if (params.replyWithEnvelope && envelope.senderPeerId?.trim()) {
    try {
      await params.replyWithEnvelope(
        buildSignedChatDeliveredEnvelope({
          profile,
          messageId: envelope.messageId,
          recipientOwnerId: profile.owner.ownerId,
          envelopeRecipientPeerId: envelope.senderPeerId,
          correlationId: envelope.correlationId,
        }),
      );
    } catch (err) {
      console.warn(`[chat.message] delivery ack failed:`, err);
    }
  }
  const selfHuman = await ctx.getHumanProfileStore().loadHumanProfile();
  void ctx
    .getPeerDirectoryStore()
    .ensurePeerFromInboundChat({
      ownerId: payload.senderOwnerId,
      peerId: remotePeerId,
      listenAddrs: dialableInboundRemoteAddrs(remoteAddr, remotePeerId),
    })
    .catch((err: unknown) =>
      console.warn(`[peer-directory] ensurePeerFromInboundChat failed:`, err),
    );
  const incomingMsg: ChatMessage = {
    messageId: envelope.messageId,
    sender: {
      nodeId: remotePeerId,
      ownerId: payload.senderOwnerId,
      displayName: formatChatSenderDisplayName(
        senderTrust?.displayName ?? payload.senderOwnerId,
        payload,
      ),
      ...chatSenderActorFromEnvelope(
        envelope.senderRole,
        envelope.agentCredential,
        guardDecision.action === "allow",
      ),
    },
    recipient: {
      nodeId: ctx.getMesh()?.peerId ?? "",
      ownerId: profile.owner.ownerId,
      displayName: selfHuman?.displayName ?? profile.owner.ownerId,
    },
    content: {
      text: stripModelThinking(payload.text),
      ...(payload.attachments?.length
        ? { attachments: chatWireAttachmentsToContent(payload.attachments) }
        : {}),
    },
    metadata: { timestamp: envelope.createdAt, deliveryReceipt: "delivered" },
    signature: envelope.signature,
  } as unknown as ChatMessage;
  void (async () => {
    if (ctx.getChatLogStore()) {
      await ctx.getChatLogStore().append(payload.senderOwnerId, incomingMsg);
    } else {
      ctx.persistChatMessage(payload.senderOwnerId, incomingMsg);
    }
    const emitMsg = await ctx.reconcileInboundDirectChatMessage(
      payload.senderOwnerId,
      incomingMsg,
    );
    ctx.emit("chat:message", emitMsg);
    // Phase 50 — push dispatch is handled by the UNIFIED chat:message listener
    // on NodeServiceImpl (constructor), which catches messages from ALL
    // sources (direct, group, EnvoyAI, Ext Agent, Pi) in one place. No
    // per-source push call needed here.
  })();
  if (senderTrust && senderTrust.level !== "blocked") {
    void ctx.tagBondedContactReachability(remotePeerId);
  }
  if (
    ctx.getTaskStore() &&
    ctx.getChatDraftStore() &&
    ctx.getProfile() &&
    guardDecision.action === "allow"
  ) {
    const receivedAt = Date.now();
    const correlationId = deriveCorrelationIdFromEnvelope(envelope);
    void ctx.getConfigStore().load().then(async (config: any) => {
      if (
        !config ||
        !ctx.getTaskStore() ||
        !ctx.getChatDraftStore() ||
        !ctx.getProfile()
      ) {
        return;
      }
      const nodeConfig = await ctx.getNodeConfig();
      await runInboundChatAssist({
        envelope: guardDecision.envelope,
        senderOwnerId: payload.senderOwnerId,
        chatText: payload.text,
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
        agentIdentityStore: undefined,
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
        isOwnerOnline: () => ctx.isOwnerOnline(),
        approvalQueue: ctx.getApprovalQueue(),
        autoReplyLimitStore: ctx.getAutoReplyLimitStore(),
        onAutoReplyPaused: (notification: any) => {
          ctx.emit("chat:auto-reply-paused", notification);
        },
        askOpenClaw: ctx.askOpenClaw
          ? (prompt, context) => ctx.askOpenClaw!(prompt, context)
          : undefined,
        buildOpenClawTurnContext: ctx.buildOpenClawTurnContext
          ? () => ctx.buildOpenClawTurnContext!()
          : undefined,
        ensureOpenClawReady: ctx.ensureOpenClawReady
          ? () => ctx.ensureOpenClawReady!()
          : undefined,
      });
    });
  }
  return true;
}