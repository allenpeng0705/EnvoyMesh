/**
 * Chat room service deps builder + group delivery progress.
 *
 * Extracted from `node-service-impl.ts` (`_chatRoomDeps`, `_recordGroupDeliveryProgress`).
 */
import type { ChatAttachment, ChatMessage, NodeProfile } from "@envoymesh/api";
import type {
  HumanProfileStore,
  LocalChatLogStore,
  LocalChatRoomPendingMessageStore,
  LocalChatRoomPendingSyncStore,
  LocalChatRoomStore,
  LocalTrustStore,
} from "@envoymesh/local-store";
import type { ChatDeliverResult } from "./chat-outbound-deliver.js";
import {
  flushPendingRoomMessagesImpl,
  flushPendingRoomSyncsImpl,
  type ChatRoomServiceDeps,
} from "./chat-room-service.js";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { buildSignedChatDeliveredEnvelope } from "@envoymesh/api/chat-delivered";
import {
  formatChatSenderDisplayName,
  verifyInboundChatDevice,
} from "./chat-device-auth.js";

export type GroupDeliveryState = {
  threadKey: string;
  pending: Set<string>;
};

export interface ChatRoomServiceDepsInput {
  requireProfile(): NodeProfile;
  requireMeshPeerId(): string;
  trustStore: LocalTrustStore;
  humanProfileStore: HumanProfileStore;
  chatRoomStore: LocalChatRoomStore | null | undefined;
  pendingSyncStore: LocalChatRoomPendingSyncStore | null | undefined;
  pendingMessageStore: LocalChatRoomPendingMessageStore | null | undefined;
  resolvePeerTransportForOwner(
    targetOwnerId: string,
  ): Promise<{
    transportPeerId: string;
    recipientEnvelopePeerId: string | undefined;
    listenAddrs: string[] | undefined;
  }>;
  deliverChatEnvelope(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs?: string[],
  ): Promise<ChatDeliverResult>;
  dialHintsForChat(
    transportPeerId: string,
    listenAddrs: string[] | undefined,
  ): Promise<string[]>;
  persistChatMessage(threadKey: string, msg: ChatMessage): void;
  emit(event: string, payload: unknown): void;
  assertOnline(): void;
  recordOwnerActivity(): void;
  getChatLogStore(): LocalChatLogStore | null | undefined;
  getGroupDeliveryPending(): Map<string, GroupDeliveryState>;
  markOutboundChatDelivered(
    threadKey: string,
    messageId: string,
    deliveredAt: string,
  ): Promise<void>;
  markOutboundChatFailed(
    threadKey: string,
    messageId: string,
    recipientOwnerId: string,
    reason: string,
  ): Promise<void>;
  clearChatHistory(threadKey: string): Promise<void>;
  shareChatFileToMember(
    targetOwnerId: string,
    shareInput: {
      vaultRelativePath: string;
      sensitivity: ChatAttachment["sensitivity"];
      chatRoomId: string;
      chatMessageId: string;
      chatAttachmentId: string;
    },
  ): Promise<void>;
}

export function recordGroupDeliveryProgressViaRuntime(
  input: ChatRoomServiceDepsInput,
  progress: {
    threadKey: string;
    messageId: string;
    recipientOwnerId: string;
    deliveredAt: string;
    allRecipientOwnerIds: readonly string[];
  },
): void {
  const key = `${progress.threadKey}:${progress.messageId}`;
  let state = input.getGroupDeliveryPending().get(key);
  if (!state) {
    state = {
      threadKey: progress.threadKey,
      pending: new Set(progress.allRecipientOwnerIds),
    };
    input.getGroupDeliveryPending().set(key, state);
  }
  state.pending.delete(progress.recipientOwnerId);
  const chatLogStore = input.getChatLogStore();
  if (chatLogStore) {
    void chatLogStore
      .updateGroupDeliveryProgress(
        progress.threadKey,
        progress.messageId,
        progress.recipientOwnerId,
      )
      .catch((err) => console.warn(`[chat-log] group delivery update failed:`, err));
  }
  input.emit("chat:delivered", {
    messageId: progress.messageId,
    timestamp: progress.deliveredAt,
    recipientOwnerId: progress.recipientOwnerId,
  });
  if (state.pending.size === 0) {
    input.getGroupDeliveryPending().delete(key);
    void input.markOutboundChatDelivered(
      progress.threadKey,
      progress.messageId,
      progress.deliveredAt,
    );
  }
}

export interface ChatRoomFlushInput {
  getPendingSyncStore(): LocalChatRoomPendingSyncStore | null | undefined;
  getPendingMessageStore(): LocalChatRoomPendingMessageStore | null | undefined;
  getChatRoomDeps(): ChatRoomServiceDeps;
}

export async function flushPendingRoomSyncsViaRuntime(input: ChatRoomFlushInput): Promise<void> {
  if (!input.getPendingSyncStore()) return;
  try {
    await flushPendingRoomSyncsImpl(input.getChatRoomDeps());
  } catch (err) {
    console.warn("[chat.room] pending sync flush failed:", err);
  }
}

export async function flushPendingRoomMessagesViaRuntime(
  input: ChatRoomFlushInput,
): Promise<void> {
  if (!input.getPendingMessageStore()) return;
  try {
    await flushPendingRoomMessagesImpl(input.getChatRoomDeps());
  } catch (err) {
    console.warn("[chat.room] pending message flush failed:", err);
  }
}

export interface RoomDeliveryAckInput {
  requireProfile(): NodeProfile;
}

export function buildRoomDeliveryAckViaRuntime(
  input: RoomDeliveryAckInput,
  replyWithEnvelope: ((envelope: EnvoyEnvelope) => Promise<void>) | undefined,
): ChatRoomServiceDeps["replyWithDelivered"] {
  if (!replyWithEnvelope) return undefined;
  return async ({ messageId, senderEnvelopePeerId, correlationId }) => {
    const p = input.requireProfile();
    await replyWithEnvelope(
      buildSignedChatDeliveredEnvelope({
        profile: p,
        messageId,
        recipientOwnerId: p.owner.ownerId,
        envelopeRecipientPeerId: senderEnvelopePeerId,
        correlationId,
      }),
    );
  };
}

export function buildChatRoomServiceDeps(input: ChatRoomServiceDepsInput): ChatRoomServiceDeps {
  return {
    getProfile: () => input.requireProfile(),
    requireMeshPeerId: () => input.requireMeshPeerId(),
    trustStore: input.trustStore,
    humanProfileStore: input.humanProfileStore,
    chatRoomStore: input.chatRoomStore ?? null,
    pendingSyncStore: input.pendingSyncStore ?? null,
    pendingMessageStore: input.pendingMessageStore ?? null,
    resolvePeerTransportForOwner: (targetOwnerId) =>
      input.resolvePeerTransportForOwner(targetOwnerId),
    deliverEnvelope: (targetOwnerId, transportPeerId, envelope, dialHints, listenAddrs) =>
      input.deliverChatEnvelope(transportPeerId, envelope, dialHints, listenAddrs).then((r) => {
        void targetOwnerId;
        return r;
      }),
    dialHintsForChat: (transportPeerId, listenAddrs) =>
      input.dialHintsForChat(transportPeerId, listenAddrs),
    persistChatMessage: (threadKey, msg) => input.persistChatMessage(threadKey, msg),
    emitRoomUpdated: (room) => input.emit("chat:room-updated", room),
    emitRoomRemoved: (roomId) => input.emit("chat:room-removed", { roomId }),
    emitRoomMessage: (roomId, message) => input.emit("chat:room-message", { roomId, message }),
    assertOnline: () => input.assertOnline(),
    recordOwnerActivity: () => input.recordOwnerActivity(),
    formatSenderDisplayName: formatChatSenderDisplayName,
    verifyInboundDevice: (envelope, payload) => verifyInboundChatDevice(envelope, payload),
    verifyInboundSyncAuthor: (envelope, payload) =>
      verifyInboundChatDevice(envelope, {
        senderOwnerId: payload.updatedByOwnerId,
        deviceCertificate: payload.deviceCertificate,
        ownerPublicKeyPem: payload.ownerPublicKeyPem,
      }),
    markOutboundDelivered: (threadKey, messageId, deliveredAt) => {
      void input.markOutboundChatDelivered(threadKey, messageId, deliveredAt);
    },
    markOutboundFailed: (threadKey, messageId, recipientOwnerId, reason) => {
      void input.markOutboundChatFailed(threadKey, messageId, recipientOwnerId, reason);
    },
    recordGroupDeliveryProgress: (progress) =>
      recordGroupDeliveryProgressViaRuntime(input, progress),
    clearChatThread: (threadKey) => {
      void input.clearChatHistory(threadKey);
    },
    shareChatFileToMember: (targetOwnerId, shareInput) =>
      input.shareChatFileToMember(targetOwnerId, shareInput),
  };
}
