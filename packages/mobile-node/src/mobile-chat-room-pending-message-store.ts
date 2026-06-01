import type { ChatRoomMessagePayload } from "@envoymesh/protocol";
import { createPendingKvStore, type PendingKvStore } from "./pending-kv-store.js";

export interface MobileChatRoomPendingMessageRecord {
  messageId: string;
  roomId: string;
  targetOwnerId: string;
  envelopeCreatedAt: string;
  correlationId?: string;
  messagePayload: ChatRoomMessagePayload;
  createdAt: string;
}

export interface MobileChatRoomPendingMessageStore {
  list(): Promise<MobileChatRoomPendingMessageRecord[]>;
  upsert(record: MobileChatRoomPendingMessageRecord): Promise<void>;
  remove(messageId: string, targetOwnerId: string): Promise<void>;
  removeForMessage(messageId: string): Promise<void>;
  removeForRoom(roomId: string): Promise<void>;
}

const REL_PATH = "envoymesh_profile/chat-room-pending-message.json";

function wrap(store: PendingKvStore<MobileChatRoomPendingMessageRecord>): MobileChatRoomPendingMessageStore {
  return {
    async list() {
      return store.list();
    },
    async upsert(record) {
      // Upsert semantics: replace any existing record with the same
      // (messageId, targetOwnerId) key, then add the new one.
      const next = (await store.list()).filter(
        (r) => !(r.messageId === record.messageId && r.targetOwnerId === record.targetOwnerId),
      );
      next.push(record);
      await store.replaceAll(next);
    },
    remove(messageId, targetOwnerId) {
      return store.remove(
        (r) => r.messageId === messageId && r.targetOwnerId === targetOwnerId,
      );
    },
    removeForMessage(messageId) {
      return store.remove((r) => r.messageId === messageId);
    },
    removeForRoom(roomId) {
      return store.remove((r) => r.roomId === roomId);
    },
  };
}

export function createMobileChatRoomPendingMessageStore(
  profileDir: string,
): MobileChatRoomPendingMessageStore {
  return wrap(createPendingKvStore<MobileChatRoomPendingMessageRecord>(REL_PATH, profileDir));
}
