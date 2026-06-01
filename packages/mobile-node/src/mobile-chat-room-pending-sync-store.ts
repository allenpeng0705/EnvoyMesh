import type { ChatRoomSyncPayload } from "@envoymesh/protocol";
import { createPendingKvStore, type PendingKvStore } from "./pending-kv-store.js";

export interface MobileChatRoomPendingSyncRecord {
  roomId: string;
  revision: number;
  targetOwnerId: string;
  syncPayload: ChatRoomSyncPayload;
  createdAt: string;
}

export interface MobileChatRoomPendingSyncStore {
  list(): Promise<MobileChatRoomPendingSyncRecord[]>;
  upsert(record: MobileChatRoomPendingSyncRecord): Promise<void>;
  remove(roomId: string, revision: number, targetOwnerId: string): Promise<void>;
  removeForRoom(roomId: string): Promise<void>;
  removeBelowRevision(roomId: string, revision: number): Promise<void>;
}

const REL_PATH = "envoymesh_profile/chat-room-pending-sync.json";

function wrap(store: PendingKvStore<MobileChatRoomPendingSyncRecord>): MobileChatRoomPendingSyncStore {
  return {
    async list() {
      return store.list();
    },
    async upsert(record) {
      const next = (await store.list()).filter(
        (r) =>
          !(
            r.roomId === record.roomId &&
            r.revision === record.revision &&
            r.targetOwnerId === record.targetOwnerId
          ),
      );
      next.push(record);
      await store.replaceAll(next);
    },
    remove(roomId, revision, targetOwnerId) {
      return store.remove(
        (r) => r.roomId === roomId && r.revision === revision && r.targetOwnerId === targetOwnerId,
      );
    },
    removeForRoom(roomId) {
      return store.remove((r) => r.roomId === roomId);
    },
    removeBelowRevision(roomId, revision) {
      return store.remove((r) => r.roomId === roomId && r.revision < revision);
    },
  };
}

export function createMobileChatRoomPendingSyncStore(
  profileDir: string,
): MobileChatRoomPendingSyncStore {
  return wrap(createPendingKvStore<MobileChatRoomPendingSyncRecord>(REL_PATH, profileDir));
}
