import { randomUUID } from "node:crypto";
import type {
  ChatAttachment,
  ChatMessage,
  ChatRoom,
  SendChatResult,
} from "./node-service.js";
import type {
  ChatRoomAttachment,
  ChatRoomMessagePayload,
  ChatRoomSyncPayload,
  EnvoyEnvelope,
} from "@envoymesh/protocol";
import {
  createChatRoomMessagePayload,
  createChatRoomSyncPayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import { chatMessagePayloadDeviceFields, formatChatSenderDisplayName } from "./chat-device-auth.js";
import { chatSenderActorFromEnvelope } from "./chat-actor.js";
import { stripModelThinking } from "./model-thinking.js";
import type { NodeProfile } from "./node-service.js";

export interface ChatRoomRecord extends ChatRoom {}

export interface ChatRoomStoreLike {
  list(): Promise<ChatRoomRecord[]>;
  get(roomId: string): Promise<ChatRoomRecord | undefined>;
  upsert(room: ChatRoomRecord): Promise<void>;
  remove(roomId: string): Promise<boolean>;
}

export interface TrustStoreLike {
  getTrustRecord(ownerId: string): Promise<{ level: string; displayName?: string } | undefined>;
}

export interface HumanProfileStoreLike {
  loadHumanProfile(): Promise<{ displayName?: string } | undefined>;
}

export type ChatDeliverResult = { delivered: boolean; deliveredAt?: string };

function roomThreadKey(roomId: string): string {
  return `room:${roomId}`;
}

export interface ChatRoomPendingSyncStoreLike {
  list(): Promise<
    Array<{
      roomId: string;
      revision: number;
      targetOwnerId: string;
      syncPayload: ChatRoomSyncPayload;
      createdAt: string;
    }>
  >;
  upsert(record: {
    roomId: string;
    revision: number;
    targetOwnerId: string;
    syncPayload: ChatRoomSyncPayload;
    createdAt: string;
  }): Promise<void>;
  remove(roomId: string, revision: number, targetOwnerId: string): Promise<void>;
  removeForRoom(roomId: string): Promise<void>;
  removeBelowRevision(roomId: string, revision: number): Promise<void>;
}

export interface ChatRoomPendingMessageStoreLike {
  list(): Promise<
    Array<{
      messageId: string;
      roomId: string;
      targetOwnerId: string;
      envelopeCreatedAt: string;
      correlationId?: string;
      messagePayload: ChatRoomMessagePayload;
      createdAt: string;
    }>
  >;
  upsert(record: {
    messageId: string;
    roomId: string;
    targetOwnerId: string;
    envelopeCreatedAt: string;
    correlationId?: string;
    messagePayload: ChatRoomMessagePayload;
    createdAt: string;
  }): Promise<void>;
  remove(messageId: string, targetOwnerId: string): Promise<void>;
  removeForMessage(messageId: string): Promise<void>;
  removeForRoom(roomId: string): Promise<void>;
}

export interface ChatRoomServiceDeps {
  getProfile: () => NodeProfile;
  requireMeshPeerId: () => string;
  trustStore: TrustStoreLike;
  humanProfileStore: HumanProfileStoreLike;
  chatRoomStore: ChatRoomStoreLike | null;
  pendingSyncStore?: ChatRoomPendingSyncStoreLike | null;
  pendingMessageStore?: ChatRoomPendingMessageStoreLike | null;
  resolvePeerTransportForOwner: (targetOwnerId: string) => Promise<{
    transportPeerId: string;
    recipientEnvelopePeerId?: string;
    listenAddrs?: string[];
  }>;
  deliverEnvelope: (
    targetOwnerId: string,
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs?: string[],
  ) => Promise<ChatDeliverResult>;
  dialHintsForChat: (transportPeerId: string, listenAddrs?: string[]) => Promise<string[]>;
  persistChatMessage: (threadKey: string, msg: ChatMessage) => void;
  emitRoomUpdated: (room: ChatRoom) => void;
  emitRoomRemoved: (roomId: string) => void;
  emitRoomMessage: (roomId: string, message: ChatMessage) => void;
  assertOnline: () => void;
  recordOwnerActivity?: () => void;
  formatSenderDisplayName: (
    baseDisplayName: string,
    payload: Pick<ChatRoomMessagePayload, "senderOwnerId" | "deviceCertificate" | "ownerPublicKeyPem">,
  ) => string;
  verifyInboundDevice: (
    envelope: EnvoyEnvelope,
    payload: ChatRoomMessagePayload,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  verifyInboundSyncAuthor: (
    envelope: EnvoyEnvelope,
    payload: ChatRoomSyncPayload,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  replyWithDelivered?: (input: {
    messageId: string;
    senderEnvelopePeerId: string;
    correlationId?: string;
  }) => Promise<void>;
  markOutboundDelivered?: (threadKey: string, messageId: string, deliveredAt: string) => void;
  /** Update per-recipient group delivery progress (all acked → mark delivered). */
  recordGroupDeliveryProgress?: (input: {
    threadKey: string;
    messageId: string;
    recipientOwnerId: string;
    deliveredAt: string;
    allRecipientOwnerIds: readonly string[];
  }) => void;
  clearChatThread?: (threadKey: string) => void | Promise<void>;
  /** Push file bytes to one room member (chat-channel share linked to a room message). */
  shareChatFileToMember?: (
    targetOwnerId: string,
    input: {
      vaultRelativePath: string;
      sensitivity: ChatAttachment["sensitivity"];
      chatRoomId: string;
      chatMessageId: string;
      chatAttachmentId: string;
    },
  ) => Promise<void>;
}

async function assertDirectBond(deps: ChatRoomServiceDeps, ownerId: string): Promise<void> {
  const trust = await deps.trustStore.getTrustRecord(ownerId);
  if (!trust || trust.level !== "direct") {
    throw new Error(`Not a direct bond: ${ownerId}`);
  }
}

async function fanOutEnvelopeToOwners(
  deps: ChatRoomServiceDeps,
  memberOwnerIds: readonly string[],
  buildEnvelope: (recipientEnvelopePeerId: string | undefined) => EnvoyEnvelope,
): Promise<Array<{ ownerId: string; result: ChatDeliverResult }>> {
  const selfOwnerId = deps.getProfile().owner.ownerId;
  const results: Array<{ ownerId: string; result: ChatDeliverResult }> = [];
  for (const memberOwnerId of memberOwnerIds) {
    if (memberOwnerId === selfOwnerId) continue;
    try {
      const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
        await deps.resolvePeerTransportForOwner(memberOwnerId);
      const dialHints = await deps.dialHintsForChat(transportPeerId, listenAddrs);
      const envelope = buildEnvelope(recipientEnvelopePeerId);
      const result = await deps.deliverEnvelope(
        memberOwnerId,
        transportPeerId,
        envelope,
        dialHints,
        listenAddrs,
      );
      results.push({ ownerId: memberOwnerId, result });
    } catch (err) {
      console.warn(`[chat.room] fan-out to ${memberOwnerId} failed:`, err);
      results.push({ ownerId: memberOwnerId, result: { delivered: false } });
    }
  }
  return results;
}

async function removeRoomLocally(deps: ChatRoomServiceDeps, roomId: string): Promise<void> {
  if (!deps.chatRoomStore) return;
  const threadKey = roomThreadKey(roomId);
  await deps.chatRoomStore.remove(roomId);
  await deps.pendingSyncStore?.removeForRoom(roomId);
  await deps.pendingMessageStore?.removeForRoom(roomId);
  await deps.clearChatThread?.(threadKey);
  deps.emitRoomRemoved(roomId);
}

async function recordPendingSyncFailures(
  deps: ChatRoomServiceDeps,
  room: ChatRoomRecord,
  syncPayload: ChatRoomSyncPayload,
  deliveries: Array<{ ownerId: string; result: ChatDeliverResult }>,
): Promise<void> {
  if (!deps.pendingSyncStore) return;
  const createdAt = new Date().toISOString();
  for (const { ownerId, result } of deliveries) {
    if (result.delivered) {
      await deps.pendingSyncStore.remove(room.roomId, room.revision, ownerId);
      continue;
    }
    await deps.pendingSyncStore.upsert({
      roomId: room.roomId,
      revision: room.revision,
      targetOwnerId: ownerId,
      syncPayload,
      createdAt,
    });
  }
  await deps.pendingSyncStore.removeBelowRevision(room.roomId, room.revision);
}

async function recordPendingMessageFailures(
  deps: ChatRoomServiceDeps,
  input: {
    messageId: string;
    roomId: string;
    envelopeCreatedAt: string;
    correlationId?: string;
    messagePayload: ChatRoomMessagePayload;
    deliveries: Array<{ ownerId: string; result: ChatDeliverResult }>;
  },
): Promise<void> {
  if (!deps.pendingMessageStore) return;
  const createdAt = new Date().toISOString();
  for (const { ownerId, result } of input.deliveries) {
    if (result.delivered) {
      await deps.pendingMessageStore.remove(input.messageId, ownerId);
      continue;
    }
    await deps.pendingMessageStore.upsert({
      messageId: input.messageId,
      roomId: input.roomId,
      targetOwnerId: ownerId,
      envelopeCreatedAt: input.envelopeCreatedAt,
      correlationId: input.correlationId,
      messagePayload: input.messagePayload,
      createdAt,
    });
  }
}

function toChatRoom(record: ChatRoomRecord): ChatRoom {
  return { ...record };
}

async function assertRoomCreator(deps: ChatRoomServiceDeps, room: ChatRoomRecord): Promise<void> {
  const selfOwnerId = deps.getProfile().owner.ownerId;
  if (room.creatorOwnerId !== selfOwnerId) {
    throw new Error("Only the group creator can do this");
  }
  if (!room.memberOwnerIds.includes(selfOwnerId)) {
    throw new Error("You are not a member of this room");
  }
}

async function fanOutRoomSync(
  deps: ChatRoomServiceDeps,
  room: ChatRoomRecord,
  action: ChatRoomSyncPayload["action"],
  updatedByOwnerId: string,
  targetMemberOwnerIds: readonly string[],
  removedMemberOwnerIds?: readonly string[],
): Promise<void> {
  const profile = deps.getProfile();
  if (!profile.deviceCertificate) {
    throw new Error("Device certificate required for group chat sync");
  }
  const syncPayload = createChatRoomSyncPayload({
    roomId: room.roomId,
    title: room.title,
    creatorOwnerId: room.creatorOwnerId,
    updatedByOwnerId,
    memberOwnerIds: room.memberOwnerIds,
    revision: room.revision,
    updatedAt: room.updatedAt,
    action,
    removedMemberOwnerIds: removedMemberOwnerIds ? [...removedMemberOwnerIds] : undefined,
    ...chatMessagePayloadDeviceFields({
      deviceCertificate: profile.deviceCertificate,
      ownerPublicKeyPem: profile.owner.publicKeyPem,
    }),
  });
  const deliveries = await fanOutEnvelopeToOwners(deps, targetMemberOwnerIds, (recipientEnvelopePeerId) =>
    signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: recipientEnvelopePeerId,
        recipientRole: "human",
        intent: "chat.room.sync",
        payload: syncPayload,
      }),
      profile.device.privateKeyPem,
    ),
  );
  await recordPendingSyncFailures(deps, room, syncPayload, deliveries);
}

export async function createChatRoomImpl(
  deps: ChatRoomServiceDeps,
  title: string,
  memberOwnerIds: string[],
): Promise<ChatRoom> {
  deps.assertOnline();
  deps.recordOwnerActivity?.();
  if (!deps.chatRoomStore) {
    throw new Error("Chat room store unavailable");
  }

  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Room title is required");
  }

  const profile = deps.getProfile();
  const selfOwnerId = profile.owner.ownerId;
  const uniqueMembers = [...new Set(memberOwnerIds.filter((id) => id !== selfOwnerId))];
  for (const memberOwnerId of uniqueMembers) {
    await assertDirectBond(deps, memberOwnerId);
  }

  const room: ChatRoomRecord = {
    roomId: randomUUID(),
    title: trimmedTitle,
    creatorOwnerId: selfOwnerId,
    memberOwnerIds: [selfOwnerId, ...uniqueMembers],
    revision: 1,
    updatedAt: new Date().toISOString(),
  };
  await deps.chatRoomStore.upsert(room);
  await fanOutRoomSync(deps, room, "create", selfOwnerId, uniqueMembers);
  deps.emitRoomUpdated(toChatRoom(room));
  return toChatRoom(room);
}

export async function inviteToChatRoomImpl(
  deps: ChatRoomServiceDeps,
  roomId: string,
  memberOwnerIds: string[],
): Promise<ChatRoom> {
  deps.assertOnline();
  if (!deps.chatRoomStore) {
    throw new Error("Chat room store unavailable");
  }

  const existing = await deps.chatRoomStore.get(roomId.trim());
  if (!existing) {
    throw new Error(`Unknown room: ${roomId}`);
  }

  await assertRoomCreator(deps, existing);

  const profile = deps.getProfile();
  const selfOwnerId = profile.owner.ownerId;
  if (!existing.memberOwnerIds.includes(selfOwnerId)) {
    throw new Error("You are not a member of this room");
  }

  const newMembers = [...new Set(memberOwnerIds.filter((id) => !existing.memberOwnerIds.includes(id)))];
  for (const memberOwnerId of newMembers) {
    await assertDirectBond(deps, memberOwnerId);
  }
  if (newMembers.length === 0) {
    return toChatRoom(existing);
  }

  const room: ChatRoomRecord = {
    ...existing,
    memberOwnerIds: [...existing.memberOwnerIds, ...newMembers],
    revision: existing.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  await deps.chatRoomStore.upsert(room);
  await fanOutRoomSync(deps, room, "invite", selfOwnerId, newMembers);
  deps.emitRoomUpdated(toChatRoom(room));
  return toChatRoom(room);
}

export async function leaveChatRoomImpl(deps: ChatRoomServiceDeps, roomId: string): Promise<void> {
  deps.assertOnline();
  if (!deps.chatRoomStore) {
    throw new Error("Chat room store unavailable");
  }

  const existing = await deps.chatRoomStore.get(roomId.trim());
  if (!existing) {
    throw new Error(`Unknown room: ${roomId}`);
  }

  const selfOwnerId = deps.getProfile().owner.ownerId;
  if (!existing.memberOwnerIds.includes(selfOwnerId)) {
    throw new Error("You are not a member of this room");
  }

  const remainingMembers = existing.memberOwnerIds.filter((id) => id !== selfOwnerId);
  if (existing.creatorOwnerId === selfOwnerId && remainingMembers.length > 0) {
    throw new Error("Group creator must dismiss the group instead of leaving while members remain");
  }
  if (remainingMembers.length > 0) {
    const room: ChatRoomRecord = {
      ...existing,
      memberOwnerIds: remainingMembers,
      revision: existing.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await fanOutRoomSync(deps, room, "leave", selfOwnerId, remainingMembers);
  }

  await removeRoomLocally(deps, existing.roomId);
}

export async function removeMembersFromChatRoomImpl(
  deps: ChatRoomServiceDeps,
  roomId: string,
  memberOwnerIds: string[],
): Promise<ChatRoom> {
  deps.assertOnline();
  if (!deps.chatRoomStore) {
    throw new Error("Chat room store unavailable");
  }

  const existing = await deps.chatRoomStore.get(roomId.trim());
  if (!existing) {
    throw new Error(`Unknown room: ${roomId}`);
  }

  await assertRoomCreator(deps, existing);

  const selfOwnerId = deps.getProfile().owner.ownerId;
  const toRemove = [
    ...new Set(
      memberOwnerIds.filter(
        (id) =>
          id !== selfOwnerId &&
          id !== existing.creatorOwnerId &&
          existing.memberOwnerIds.includes(id),
      ),
    ),
  ];
  if (toRemove.length === 0) {
    return toChatRoom(existing);
  }

  const room: ChatRoomRecord = {
    ...existing,
    memberOwnerIds: existing.memberOwnerIds.filter((id) => !toRemove.includes(id)),
    revision: existing.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  await deps.chatRoomStore.upsert(room);
  await fanOutRoomSync(deps, room, "remove", selfOwnerId, [...room.memberOwnerIds, ...toRemove], toRemove);
  deps.emitRoomUpdated(toChatRoom(room));
  return toChatRoom(room);
}

export async function renameChatRoomImpl(
  deps: ChatRoomServiceDeps,
  roomId: string,
  title: string,
): Promise<ChatRoom> {
  deps.assertOnline();
  if (!deps.chatRoomStore) {
    throw new Error("Chat room store unavailable");
  }

  const existing = await deps.chatRoomStore.get(roomId.trim());
  if (!existing) {
    throw new Error(`Unknown room: ${roomId}`);
  }

  await assertRoomCreator(deps, existing);

  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Room title is required");
  }
  if (trimmedTitle === existing.title) {
    return toChatRoom(existing);
  }

  const selfOwnerId = deps.getProfile().owner.ownerId;
  const room: ChatRoomRecord = {
    ...existing,
    title: trimmedTitle,
    revision: existing.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  await deps.chatRoomStore.upsert(room);
  await fanOutRoomSync(deps, room, "rename", selfOwnerId, room.memberOwnerIds);
  deps.emitRoomUpdated(toChatRoom(room));
  return toChatRoom(room);
}

export async function dismissChatRoomImpl(deps: ChatRoomServiceDeps, roomId: string): Promise<void> {
  deps.assertOnline();
  if (!deps.chatRoomStore) {
    throw new Error("Chat room store unavailable");
  }

  const existing = await deps.chatRoomStore.get(roomId.trim());
  if (!existing) {
    throw new Error(`Unknown room: ${roomId}`);
  }

  await assertRoomCreator(deps, existing);

  const selfOwnerId = deps.getProfile().owner.ownerId;
  const allMembers = [...existing.memberOwnerIds];
  const dismissedRoom: ChatRoomRecord = {
    ...existing,
    memberOwnerIds: [],
    revision: existing.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  await fanOutRoomSync(deps, dismissedRoom, "dismiss", selfOwnerId, allMembers);
  await removeRoomLocally(deps, existing.roomId);
}

export async function listChatRoomsImpl(deps: ChatRoomServiceDeps): Promise<ChatRoom[]> {
  if (!deps.chatRoomStore) return [];
  const rows = await deps.chatRoomStore.list();
  return rows.map(toChatRoom);
}

function aggregateGroupDeliveryResults(
  deliveries: Array<{ ownerId: string; result: ChatDeliverResult }>,
  recipientOwnerIds: readonly string[],
): SendChatResult & {
  deliveredToOwnerIds: string[];
  pendingRecipientOwnerIds: string[];
  deliveredAt?: string;
} {
  const deliveredToOwnerIds = deliveries
    .filter((d) => d.result.delivered)
    .map((d) => d.ownerId);
  const pendingRecipientOwnerIds = recipientOwnerIds.filter((id) => !deliveredToOwnerIds.includes(id));
  const acked = deliveries.find((d) => d.result.delivered && d.result.deliveredAt);
  const allDelivered =
    recipientOwnerIds.length > 0 && pendingRecipientOwnerIds.length === 0;
  if (allDelivered) {
    return {
      messageId: "",
      deliveryReceipt: "delivered",
      deliveredAt: acked?.result.deliveredAt ?? new Date().toISOString(),
      deliveredToOwnerIds,
      pendingRecipientOwnerIds,
    };
  }
  return {
    messageId: "",
    deliveryReceipt: "sent",
    deliveredToOwnerIds,
    pendingRecipientOwnerIds,
  };
}

export async function flushPendingRoomMessagesImpl(deps: ChatRoomServiceDeps): Promise<void> {
  if (!deps.pendingMessageStore || !deps.chatRoomStore) return;
  const pending = await deps.pendingMessageStore.list();
  if (pending.length === 0) return;

  const profile = deps.getProfile();
  const selfOwnerId = profile.owner.ownerId;

  for (const record of pending) {
    const room = await deps.chatRoomStore.get(record.roomId);
    if (!room || !room.memberOwnerIds.includes(selfOwnerId)) {
      await deps.pendingMessageStore.remove(record.messageId, record.targetOwnerId);
      continue;
    }
    if (!room.memberOwnerIds.includes(record.targetOwnerId)) {
      await deps.pendingMessageStore.remove(record.messageId, record.targetOwnerId);
      continue;
    }
    try {
      const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
        await deps.resolvePeerTransportForOwner(record.targetOwnerId);
      const dialHints = await deps.dialHintsForChat(transportPeerId, listenAddrs);
      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          messageId: record.messageId,
          correlationId: record.correlationId,
          createdAt: record.envelopeCreatedAt,
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: recipientEnvelopePeerId,
          recipientRole: "human",
          intent: "chat.room.message",
          payload: record.messagePayload,
        }),
        profile.device.privateKeyPem,
      );
      const result = await deps.deliverEnvelope(
        record.targetOwnerId,
        transportPeerId,
        envelope,
        dialHints,
        listenAddrs,
      );
      if (result.delivered) {
        await deps.pendingMessageStore.remove(record.messageId, record.targetOwnerId);
        const recipients = room.memberOwnerIds.filter((id) => id !== selfOwnerId);
        deps.recordGroupDeliveryProgress?.({
          threadKey: roomThreadKey(record.roomId),
          messageId: record.messageId,
          recipientOwnerId: record.targetOwnerId,
          deliveredAt: result.deliveredAt ?? new Date().toISOString(),
          allRecipientOwnerIds: recipients,
        });
      }
    } catch (err) {
      console.warn(`[chat.room] pending message retry to ${record.targetOwnerId} failed:`, err);
    }
  }
}

export async function flushPendingRoomSyncsImpl(deps: ChatRoomServiceDeps): Promise<void> {
  if (!deps.pendingSyncStore || !deps.chatRoomStore) return;
  const pending = await deps.pendingSyncStore.list();
  if (pending.length === 0) return;

  const profile = deps.getProfile();
  if (!profile.deviceCertificate) return;

  for (const record of pending) {
    const room = await deps.chatRoomStore.get(record.roomId);
    if (!room || room.revision > record.revision) {
      await deps.pendingSyncStore.remove(record.roomId, record.revision, record.targetOwnerId);
      continue;
    }
    try {
      const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
        await deps.resolvePeerTransportForOwner(record.targetOwnerId);
      const dialHints = await deps.dialHintsForChat(transportPeerId, listenAddrs);
      const envelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: recipientEnvelopePeerId,
          recipientRole: "human",
          intent: "chat.room.sync",
          payload: record.syncPayload,
        }),
        profile.device.privateKeyPem,
      );
      const result = await deps.deliverEnvelope(
        record.targetOwnerId,
        transportPeerId,
        envelope,
        dialHints,
        listenAddrs,
      );
      if (result.delivered) {
        await deps.pendingSyncStore.remove(record.roomId, record.revision, record.targetOwnerId);
      }
    } catch (err) {
      console.warn(`[chat.room] pending sync retry to ${record.targetOwnerId} failed:`, err);
    }
  }
}

export async function sendChatRoomMessageImpl(
  deps: ChatRoomServiceDeps,
  roomId: string,
  text: string,
): Promise<SendChatResult> {
  deps.assertOnline();
  deps.recordOwnerActivity?.();
  if (!deps.chatRoomStore) {
    throw new Error("Chat room store unavailable");
  }

  const room = await deps.chatRoomStore.get(roomId.trim());
  if (!room) {
    throw new Error(`Unknown room: ${roomId}`);
  }

  const profile = deps.getProfile();
  const selfOwnerId = profile.owner.ownerId;
  if (!room.memberOwnerIds.includes(selfOwnerId)) {
    throw new Error("You are not a member of this room");
  }

  const wireText = stripModelThinking(text);
  if (!wireText.trim()) {
    throw new Error("Message text is required");
  }

  const meshPeerId = deps.requireMeshPeerId();
  const selfHuman = await deps.humanProfileStore.loadHumanProfile();
  const messagePayload = createChatRoomMessagePayload({
    roomId: room.roomId,
    senderOwnerId: selfOwnerId,
    text: wireText,
    ...chatMessagePayloadDeviceFields({
      deviceCertificate: profile.deviceCertificate,
      ownerPublicKeyPem: profile.owner.publicKeyPem,
    }),
  });

  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientRole: "human",
      intent: "chat.room.message",
      payload: messagePayload,
    }),
    profile.device.privateKeyPem,
  );

  const recipients = room.memberOwnerIds.filter((id) => id !== selfOwnerId);
  const deliverResults = await fanOutEnvelopeToOwners(deps, recipients, (recipientEnvelopePeerId) =>
    signUnsignedEnvelope(
      createUnsignedEnvelope({
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        createdAt: envelope.createdAt,
        senderPeerId: envelope.senderPeerId,
        senderPublicKey: envelope.senderPublicKey,
        senderRole: "human",
        recipientPeerId: recipientEnvelopePeerId,
        recipientRole: "human",
        intent: "chat.room.message",
        payload: messagePayload,
      }),
      profile.device.privateKeyPem,
    ),
  );

  await recordPendingMessageFailures(deps, {
    messageId: envelope.messageId,
    roomId: room.roomId,
    envelopeCreatedAt: envelope.createdAt,
    correlationId: envelope.correlationId,
    messagePayload,
    deliveries: deliverResults,
  });

  const threadKey = roomThreadKey(room.roomId);
  const delivery = aggregateGroupDeliveryResults(deliverResults, recipients);
  const emittedMsg: ChatMessage = {
    messageId: envelope.messageId,
    sender: {
      nodeId: meshPeerId,
      ownerId: selfOwnerId,
      displayName: selfHuman?.displayName ?? selfOwnerId,
      actorRole: "human",
    },
    recipient: {
      nodeId: room.roomId,
      ownerId: threadKey,
      displayName: room.title,
    },
    content: { text: wireText },
    metadata: {
      timestamp: envelope.createdAt,
      deliveryReceipt: delivery.deliveryReceipt ?? "sent",
      deliveredToOwnerIds: delivery.deliveredToOwnerIds,
      pendingRecipientOwnerIds: delivery.pendingRecipientOwnerIds,
    },
    signature: envelope.signature,
  };

  deps.persistChatMessage(threadKey, emittedMsg);
  deps.emitRoomMessage(room.roomId, emittedMsg);

  for (const ownerId of delivery.deliveredToOwnerIds) {
    deps.recordGroupDeliveryProgress?.({
      threadKey,
      messageId: envelope.messageId,
      recipientOwnerId: ownerId,
      deliveredAt: delivery.deliveredAt ?? new Date().toISOString(),
      allRecipientOwnerIds: recipients,
    });
  }

  if (delivery.deliveryReceipt === "delivered" && delivery.deliveredAt) {
    deps.markOutboundDelivered?.(threadKey, envelope.messageId, delivery.deliveredAt);
  }

  return {
    messageId: envelope.messageId,
    deliveryReceipt: delivery.deliveryReceipt,
    deliveredAt: delivery.deliveredAt,
    deliveredToOwnerIds: delivery.deliveredToOwnerIds,
    pendingRecipientOwnerIds: delivery.pendingRecipientOwnerIds,
  };
}

function chatAttachmentSensitivity(
  sensitivity: ChatRoomAttachment["sensitivity"],
): ChatAttachment["sensitivity"] {
  return sensitivity === "trusted" ? "friends" : sensitivity;
}

function roomAttachmentsToChatContent(
  wire: ChatRoomAttachment[] | undefined,
  localVaultById?: Map<string, string>,
): ChatMessage["content"]["attachments"] {
  if (!wire?.length) return undefined;
  return wire.map((att) => ({
    id: att.id,
    filename: att.filename,
    mimeType: att.mimeType,
    sizeBytes: att.sizeBytes,
    sensitivity: chatAttachmentSensitivity(att.sensitivity),
    ...(localVaultById?.get(att.id) ? { vaultRelativePath: localVaultById.get(att.id) } : {}),
  }));
}

export interface SendChatRoomAttachmentInput {
  roomId: string;
  text: string;
  attachment: ChatAttachment;
}

export async function sendChatRoomAttachmentImpl(
  deps: ChatRoomServiceDeps,
  input: SendChatRoomAttachmentInput,
): Promise<SendChatResult & { attachmentId: string; vaultRelativePath: string }> {
  deps.assertOnline();
  deps.recordOwnerActivity?.();
  if (!deps.chatRoomStore) {
    throw new Error("Chat room store unavailable");
  }
  if (!deps.shareChatFileToMember) {
    throw new Error("Room file sharing is not available on this node");
  }

  const room = await deps.chatRoomStore.get(input.roomId.trim());
  if (!room) {
    throw new Error(`Unknown room: ${input.roomId}`);
  }

  const profile = deps.getProfile();
  const selfOwnerId = profile.owner.ownerId;
  if (!room.memberOwnerIds.includes(selfOwnerId)) {
    throw new Error("You are not a member of this room");
  }

  const wireText = stripModelThinking(input.text);
  if (!wireText.trim()) {
    throw new Error("Message text is required");
  }

  const wireAttachments: ChatRoomAttachment[] = [
    {
      id: input.attachment.id,
      filename: input.attachment.filename,
      mimeType: input.attachment.mimeType,
      sizeBytes: input.attachment.sizeBytes,
      sensitivity: input.attachment.sensitivity,
    },
  ];

  const meshPeerId = deps.requireMeshPeerId();
  const selfHuman = await deps.humanProfileStore.loadHumanProfile();
  const messagePayload = createChatRoomMessagePayload({
    roomId: room.roomId,
    senderOwnerId: selfOwnerId,
    text: wireText,
    attachments: wireAttachments,
    ...chatMessagePayloadDeviceFields({
      deviceCertificate: profile.deviceCertificate,
      ownerPublicKeyPem: profile.owner.publicKeyPem,
    }),
  });

  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientRole: "human",
      intent: "chat.room.message",
      payload: messagePayload,
    }),
    profile.device.privateKeyPem,
  );

  const recipients = room.memberOwnerIds.filter((id) => id !== selfOwnerId);
  const deliverResults = await fanOutEnvelopeToOwners(deps, recipients, (recipientEnvelopePeerId) =>
    signUnsignedEnvelope(
      createUnsignedEnvelope({
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        createdAt: envelope.createdAt,
        senderPeerId: envelope.senderPeerId,
        senderPublicKey: envelope.senderPublicKey,
        senderRole: "human",
        recipientPeerId: recipientEnvelopePeerId,
        recipientRole: "human",
        intent: "chat.room.message",
        payload: messagePayload,
      }),
      profile.device.privateKeyPem,
    ),
  );

  await recordPendingMessageFailures(deps, {
    messageId: envelope.messageId,
    roomId: room.roomId,
    envelopeCreatedAt: envelope.createdAt,
    correlationId: envelope.correlationId,
    messagePayload,
    deliveries: deliverResults,
  });

  const vaultPath = input.attachment.vaultRelativePath?.replace(/^[\\/]+/, "") ?? "";
  for (const memberOwnerId of recipients) {
    try {
      await deps.shareChatFileToMember(memberOwnerId, {
        vaultRelativePath: vaultPath,
        sensitivity: input.attachment.sensitivity,
        chatRoomId: room.roomId,
        chatMessageId: envelope.messageId,
        chatAttachmentId: input.attachment.id,
      });
    } catch (err) {
      console.warn(`[chat.room] attachment share to ${memberOwnerId} failed:`, err);
    }
  }

  const threadKey = roomThreadKey(room.roomId);
  const delivery = aggregateGroupDeliveryResults(deliverResults, recipients);
  const localVault = new Map([[input.attachment.id, vaultPath]]);
  const emittedMsg: ChatMessage = {
    messageId: envelope.messageId,
    sender: {
      nodeId: meshPeerId,
      ownerId: selfOwnerId,
      displayName: selfHuman?.displayName ?? selfOwnerId,
      actorRole: "human",
    },
    recipient: {
      nodeId: room.roomId,
      ownerId: threadKey,
      displayName: room.title,
    },
    content: {
      text: wireText,
      attachments: roomAttachmentsToChatContent(wireAttachments, localVault),
    },
    metadata: {
      timestamp: envelope.createdAt,
      deliveryReceipt: delivery.deliveryReceipt ?? "sent",
      deliveredToOwnerIds: delivery.deliveredToOwnerIds,
      pendingRecipientOwnerIds: delivery.pendingRecipientOwnerIds,
    },
    signature: envelope.signature,
  };

  deps.persistChatMessage(threadKey, emittedMsg);
  deps.emitRoomMessage(room.roomId, emittedMsg);

  for (const ownerId of delivery.deliveredToOwnerIds) {
    deps.recordGroupDeliveryProgress?.({
      threadKey,
      messageId: envelope.messageId,
      recipientOwnerId: ownerId,
      deliveredAt: delivery.deliveredAt ?? new Date().toISOString(),
      allRecipientOwnerIds: recipients,
    });
  }

  if (delivery.deliveryReceipt === "delivered" && delivery.deliveredAt) {
    deps.markOutboundDelivered?.(threadKey, envelope.messageId, delivery.deliveredAt);
  }

  return {
    messageId: envelope.messageId,
    attachmentId: input.attachment.id,
    vaultRelativePath: vaultPath,
    deliveryReceipt: delivery.deliveryReceipt,
    deliveredAt: delivery.deliveredAt,
    deliveredToOwnerIds: delivery.deliveredToOwnerIds,
    pendingRecipientOwnerIds: delivery.pendingRecipientOwnerIds,
  };
}

export async function handleInboundChatRoomSyncImpl(
  deps: ChatRoomServiceDeps,
  envelope: EnvoyEnvelope,
  payload: ChatRoomSyncPayload,
): Promise<void> {
  if (!deps.chatRoomStore) return;

  const syncAuth = await deps.verifyInboundSyncAuthor(envelope, payload);
  if (!syncAuth.ok) {
    console.warn(`[chat.room.sync] rejected: ${syncAuth.reason}`);
    return;
  }
  if (!payload.deviceCertificate) {
    console.warn(`[chat.room.sync] rejected — missing device certificate`);
    return;
  }

  const selfOwnerId = deps.getProfile().owner.ownerId;

  if (payload.action === "dismiss") {
    if (payload.updatedByOwnerId !== payload.creatorOwnerId) {
      console.warn(`[chat.room.sync] ignored dismiss — only creator may dismiss`);
      return;
    }
    try {
      await assertDirectBond(deps, payload.updatedByOwnerId);
    } catch {
      console.warn(`[chat.room.sync] ignored dismiss — no direct bond with ${payload.updatedByOwnerId}`);
      return;
    }
    const existing = await deps.chatRoomStore.get(payload.roomId);
    if (existing && payload.revision <= existing.revision) {
      return;
    }
    if (existing) {
      await removeRoomLocally(deps, payload.roomId);
    }
    return;
  }

  if (!payload.memberOwnerIds.includes(selfOwnerId)) {
    const existing = await deps.chatRoomStore.get(payload.roomId);
    if (existing) {
      await removeRoomLocally(deps, payload.roomId);
    }
    return;
  }

  if (
    payload.action !== "leave" &&
    !payload.memberOwnerIds.includes(payload.updatedByOwnerId)
  ) {
    console.warn(`[chat.room.sync] ignored — updatedByOwnerId not in member list`);
    return;
  }

  if (
    (payload.action === "create" ||
      payload.action === "invite" ||
      payload.action === "remove" ||
      payload.action === "rename") &&
    payload.updatedByOwnerId !== payload.creatorOwnerId
  ) {
    console.warn(`[chat.room.sync] ignored ${payload.action} — only creator may perform this action`);
    return;
  }

  if (payload.action === "leave") {
    const existing = await deps.chatRoomStore.get(payload.roomId);
    if (existing && payload.revision <= existing.revision) {
      return;
    }
    try {
      await assertDirectBond(deps, payload.updatedByOwnerId);
    } catch {
      console.warn(`[chat.room.sync] ignored leave — no direct bond with ${payload.updatedByOwnerId}`);
      return;
    }
    const room: ChatRoomRecord = {
      roomId: payload.roomId,
      title: payload.title,
      creatorOwnerId: payload.creatorOwnerId,
      memberOwnerIds: payload.memberOwnerIds,
      revision: payload.revision,
      updatedAt: payload.updatedAt,
    };
    await deps.chatRoomStore.upsert(room);
    deps.emitRoomUpdated(toChatRoom(room));
    return;
  }

  try {
    await assertDirectBond(deps, payload.updatedByOwnerId);
  } catch {
    console.warn(`[chat.room.sync] ignored — no direct bond with ${payload.updatedByOwnerId}`);
    return;
  }

  const existing = await deps.chatRoomStore.get(payload.roomId);
  if (existing && payload.revision <= existing.revision) {
    return;
  }

  const room: ChatRoomRecord = {
    roomId: payload.roomId,
    title: payload.title,
    creatorOwnerId: payload.creatorOwnerId,
    memberOwnerIds: payload.memberOwnerIds,
    revision: payload.revision,
    updatedAt: payload.updatedAt,
  };
  await deps.chatRoomStore.upsert(room);
  deps.emitRoomUpdated(toChatRoom(room));
}

export async function handleInboundChatRoomMessageImpl(
  deps: ChatRoomServiceDeps,
  envelope: EnvoyEnvelope,
  payload: ChatRoomMessagePayload,
  remotePeerId: string,
  replyWithDeliveredOverride?: ChatRoomServiceDeps["replyWithDelivered"],
): Promise<void> {
  if (!deps.chatRoomStore) return;

  const deviceAuth = await deps.verifyInboundDevice(envelope, payload);
  if (!deviceAuth.ok) {
    console.warn(`[chat.room.message] rejected from ${remotePeerId}: ${deviceAuth.reason}`);
    return;
  }

  const selfOwnerId = deps.getProfile().owner.ownerId;
  const room = await deps.chatRoomStore.get(payload.roomId);
  if (!room || !room.memberOwnerIds.includes(selfOwnerId)) {
    console.warn(`[chat.room.message] ignored — unknown room or not a member`);
    return;
  }
  if (!room.memberOwnerIds.includes(payload.senderOwnerId)) {
    console.warn(`[chat.room.message] ignored — sender not in room`);
    return;
  }

  await assertDirectBond(deps, payload.senderOwnerId);

  const ack = replyWithDeliveredOverride ?? deps.replyWithDelivered;
  if (ack && envelope.senderPeerId?.trim()) {
    try {
      await ack({
        messageId: envelope.messageId,
        senderEnvelopePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId,
      });
    } catch (err) {
      console.warn(`[chat.room.message] delivery ack failed:`, err);
    }
  }

  const senderTrust = await deps.trustStore.getTrustRecord(payload.senderOwnerId);
  const incomingMsg: ChatMessage = {
    messageId: envelope.messageId,
    sender: {
      nodeId: remotePeerId,
      ownerId: payload.senderOwnerId,
      displayName: deps.formatSenderDisplayName(
        senderTrust?.displayName ?? payload.senderOwnerId,
        payload,
      ),
      ...chatSenderActorFromEnvelope(envelope.senderRole, envelope.agentCredential, true),
    },
    recipient: {
      nodeId: room.roomId,
      ownerId: roomThreadKey(room.roomId),
      displayName: room.title,
    },
    content: {
      text: stripModelThinking(payload.text),
      attachments: roomAttachmentsToChatContent(payload.attachments),
    },
    metadata: { timestamp: envelope.createdAt, deliveryReceipt: "delivered" },
    signature: envelope.signature,
  };

  deps.persistChatMessage(roomThreadKey(room.roomId), incomingMsg);
  deps.emitRoomMessage(room.roomId, incomingMsg);
}
