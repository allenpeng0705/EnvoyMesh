import type { ChatMessage, ChatRoom, NodeProfile } from "@envoymesh/api";
import {
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
  type ChatRoomStoreLike,
  type ChatRoomPendingSyncStoreLike,
  type ChatRoomPendingMessageStoreLike,
  type TrustStoreLike,
} from "@envoymesh/api/chat-room-service";
import type { ChatRoomMessagePayload, ChatRoomSyncPayload, EnvoyEnvelope } from "@envoymesh/protocol";
import { buildSignedChatDeliveredEnvelope } from "@envoymesh/api/chat-delivered";
import {
  chatMessagePayloadDeviceFields,
  formatChatSenderDisplayName,
  verifyInboundChatDeviceAuthorization,
} from "@envoymesh/api";
import { verifyAuthorizedDeviceEnvelope, isDeviceRevoked } from "@envoymesh/mobile-identity";
import type { DeviceRevocationRecord } from "@envoymesh/protocol";
import { chatRoomThreadKey } from "@envoymesh/api";

export interface MobileChatRoomHost {
  assertOnline(): void;
  getProfile(): NodeProfile;
  getMeshPeerId(): string;
  trustStore: TrustStoreLike;
  chatRoomStore: ChatRoomStoreLike | null;
  pendingSyncStore?: ChatRoomPendingSyncStoreLike | null;
  pendingMessageStore?: ChatRoomPendingMessageStoreLike | null;
  deviceRevocations: DeviceRevocationRecord[];
  loadHumanDisplayName(): Promise<string | undefined>;
  resolvePeerTransportForOwner(targetOwnerId: string): Promise<{
    transportPeerId: string;
    recipientEnvelopePeerId?: string;
    listenAddrs?: string[];
  }>;
  deliverEnvelopeToOwner(
    targetOwnerId: string,
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    listenAddrs?: string[],
  ): Promise<{ delivered: boolean; deliveredAt?: string }>;
  persistChatMessage(threadKey: string, msg: ChatMessage): void;
  emitRoomUpdated(room: ChatRoom): void;
  emitRoomRemoved(roomId: string): void;
  emitRoomMessage(roomId: string, message: ChatMessage): void;
  markOutboundDelivered(threadKey: string, messageId: string, deliveredAt: string): void;
  recordGroupDeliveryProgress?(input: {
    threadKey: string;
    messageId: string;
    recipientOwnerId: string;
    deliveredAt: string;
    allRecipientOwnerIds: readonly string[];
  }): void;
  clearChatThread?(threadKey: string): void | Promise<void>;
  shareChatFileToMember?(
    targetOwnerId: string,
    input: {
      vaultRelativePath: string;
      sensitivity: "public" | "friends" | "private";
      chatRoomId: string;
      chatMessageId: string;
      chatAttachmentId: string;
    },
  ): Promise<void>;
}

export function buildMobileChatRoomDeps(host: MobileChatRoomHost): ChatRoomServiceDeps {
  return {
    getProfile: () => host.getProfile(),
    requireMeshPeerId: () => host.getMeshPeerId(),
    trustStore: host.trustStore,
    humanProfileStore: {
      loadHumanProfile: async () => {
        const displayName = await host.loadHumanDisplayName();
        return displayName ? { displayName } : undefined;
      },
    },
    chatRoomStore: host.chatRoomStore,
    pendingSyncStore: host.pendingSyncStore ?? null,
    pendingMessageStore: host.pendingMessageStore ?? null,
    resolvePeerTransportForOwner: (targetOwnerId) => host.resolvePeerTransportForOwner(targetOwnerId),
    deliverEnvelope: async (targetOwnerId, transportPeerId, envelope, _dialHints, listenAddrs) =>
      host.deliverEnvelopeToOwner(targetOwnerId, transportPeerId, envelope, listenAddrs),
    dialHintsForChat: async () => [],
    persistChatMessage: (threadKey, msg) => host.persistChatMessage(threadKey, msg),
    emitRoomUpdated: (room) => host.emitRoomUpdated(room),
    emitRoomRemoved: (roomId) => host.emitRoomRemoved(roomId),
    emitRoomMessage: (roomId, message) => host.emitRoomMessage(roomId, message),
    assertOnline: () => host.assertOnline(),
    formatSenderDisplayName: formatChatSenderDisplayName,
    verifyInboundSyncAuthor: async (envelope, payload) => {
      const result = verifyInboundChatDeviceAuthorization(
        envelope,
        {
          senderOwnerId: payload.updatedByOwnerId,
          deviceCertificate: payload.deviceCertificate,
          ownerPublicKeyPem: payload.ownerPublicKeyPem,
        },
        verifyAuthorizedDeviceEnvelope,
      );
      if (!result.ok) return result;
      if (
        payload.deviceCertificate &&
        payload.ownerPublicKeyPem &&
        isDeviceRevoked(payload.deviceCertificate, host.deviceRevocations, payload.ownerPublicKeyPem)
      ) {
        return { ok: false as const, reason: "device certificate revoked" };
      }
      return result;
    },
    verifyInboundDevice: async (envelope, payload) => {
      const result = verifyInboundChatDeviceAuthorization(
        envelope,
        payload,
        verifyAuthorizedDeviceEnvelope,
      );
      if (!result.ok) return result;
      if (
        payload.deviceCertificate &&
        payload.ownerPublicKeyPem &&
        isDeviceRevoked(payload.deviceCertificate, host.deviceRevocations, payload.ownerPublicKeyPem)
      ) {
        return { ok: false as const, reason: "device certificate revoked" };
      }
      return result;
    },
    markOutboundDelivered: (threadKey, messageId, deliveredAt) => {
      host.markOutboundDelivered(threadKey, messageId, deliveredAt);
    },
    recordGroupDeliveryProgress: host.recordGroupDeliveryProgress
      ? (input) => host.recordGroupDeliveryProgress!(input)
      : undefined,
    clearChatThread: host.clearChatThread ? (threadKey) => host.clearChatThread!(threadKey) : undefined,
    shareChatFileToMember: host.shareChatFileToMember
      ? (targetOwnerId, input) => host.shareChatFileToMember!(targetOwnerId, input)
      : undefined,
  };
}

export function mobileReplyWithDelivered(
  host: MobileChatRoomHost,
  replyWithEnvelope: ((envelope: EnvoyEnvelope) => Promise<void>) | undefined,
): ChatRoomServiceDeps["replyWithDelivered"] {
  if (!replyWithEnvelope) return undefined;
  return async ({ messageId, senderEnvelopePeerId, correlationId }) => {
    const profile = host.getProfile();
    await replyWithEnvelope(
      buildSignedChatDeliveredEnvelope({
        profile,
        messageId,
        recipientOwnerId: profile.owner.ownerId,
        envelopeRecipientPeerId: senderEnvelopePeerId,
        correlationId,
      }),
    );
  };
}

export async function mobileListChatRooms(host: MobileChatRoomHost): Promise<ChatRoom[]> {
  return listChatRoomsImpl(buildMobileChatRoomDeps(host));
}

export async function mobileCreateChatRoom(
  host: MobileChatRoomHost,
  title: string,
  memberOwnerIds: string[],
): Promise<ChatRoom> {
  return createChatRoomImpl(buildMobileChatRoomDeps(host), title, memberOwnerIds);
}

export async function mobileInviteToChatRoom(
  host: MobileChatRoomHost,
  roomId: string,
  memberOwnerIds: string[],
): Promise<ChatRoom> {
  return inviteToChatRoomImpl(buildMobileChatRoomDeps(host), roomId, memberOwnerIds);
}

export async function mobileLeaveChatRoom(host: MobileChatRoomHost, roomId: string): Promise<void> {
  return leaveChatRoomImpl(buildMobileChatRoomDeps(host), roomId);
}

export async function mobileRemoveMembersFromChatRoom(
  host: MobileChatRoomHost,
  roomId: string,
  memberOwnerIds: string[],
): Promise<ChatRoom> {
  return removeMembersFromChatRoomImpl(buildMobileChatRoomDeps(host), roomId, memberOwnerIds);
}

export async function mobileRenameChatRoom(
  host: MobileChatRoomHost,
  roomId: string,
  title: string,
): Promise<ChatRoom> {
  return renameChatRoomImpl(buildMobileChatRoomDeps(host), roomId, title);
}

export async function mobileDismissChatRoom(host: MobileChatRoomHost, roomId: string): Promise<void> {
  return dismissChatRoomImpl(buildMobileChatRoomDeps(host), roomId);
}

export async function mobileSendChatRoomMessage(
  host: MobileChatRoomHost,
  roomId: string,
  text: string,
) {
  return sendChatRoomMessageImpl(buildMobileChatRoomDeps(host), roomId, text);
}

export async function mobileSendChatRoomAttachment(
  host: MobileChatRoomHost,
  input: import("@envoymesh/api/chat-room-service").SendChatRoomAttachmentInput,
) {
  return sendChatRoomAttachmentImpl(buildMobileChatRoomDeps(host), input);
}

export async function mobileFlushPendingRoomSyncs(host: MobileChatRoomHost): Promise<void> {
  return flushPendingRoomSyncsImpl(buildMobileChatRoomDeps(host));
}

export async function mobileFlushPendingRoomMessages(host: MobileChatRoomHost): Promise<void> {
  return flushPendingRoomMessagesImpl(buildMobileChatRoomDeps(host));
}

export async function mobileHandleInboundChatRoomSync(
  host: MobileChatRoomHost,
  envelope: EnvoyEnvelope,
  payload: ChatRoomSyncPayload,
): Promise<void> {
  return handleInboundChatRoomSyncImpl(buildMobileChatRoomDeps(host), envelope, payload);
}

export async function mobileHandleInboundChatRoomMessage(
  host: MobileChatRoomHost,
  envelope: EnvoyEnvelope,
  payload: ChatRoomMessagePayload,
  remotePeerId: string,
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>,
): Promise<void> {
  return handleInboundChatRoomMessageImpl(
    buildMobileChatRoomDeps(host),
    envelope,
    payload,
    remotePeerId,
    mobileReplyWithDelivered(host, replyWithEnvelope),
  );
}
