/**
 * Pending chat.room.sync deliveries — retried when peers come online.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatRoomSyncPayload } from "@envoymesh/protocol";

export const CHAT_ROOM_PENDING_SYNC_FILE = "chat-room-pending-sync.json";

export interface ChatRoomPendingSyncRecord {
  roomId: string;
  revision: number;
  targetOwnerId: string;
  syncPayload: ChatRoomSyncPayload;
  createdAt: string;
  /**
   * Number of delivery attempts so far. Optional for backward compatibility with
   * records written by older versions (treated as 0 on read).
   */
  attempts?: number;
  /** ISO timestamp of the most recent attempt. */
  lastAttemptAt?: string;
  /** Earliest ISO timestamp at which the next attempt is allowed. */
  nextAttemptAt?: string;
}

interface PendingSyncFile {
  version: "0.1";
  records: ChatRoomPendingSyncRecord[];
}

export interface LocalChatRoomPendingSyncStore {
  list(): Promise<ChatRoomPendingSyncRecord[]>;
  upsert(record: ChatRoomPendingSyncRecord): Promise<void>;
  remove(roomId: string, revision: number, targetOwnerId: string): Promise<void>;
  removeForRoom(roomId: string): Promise<void>;
  removeBelowRevision(roomId: string, revision: number): Promise<void>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readFileState(path: string): Promise<PendingSyncFile> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as PendingSyncFile;
    if (parsed.version !== "0.1" || !Array.isArray(parsed.records)) {
      return { version: "0.1", records: [] };
    }
    return parsed;
  } catch (error) {
    if (isMissingFileError(error)) {
      return { version: "0.1", records: [] };
    }
    throw error;
  }
}

async function writeFileState(path: string, file: PendingSyncFile): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

export function createLocalChatRoomPendingSyncStore(profileDir: string): LocalChatRoomPendingSyncStore {
  const path = join(profileDir, CHAT_ROOM_PENDING_SYNC_FILE);

  return {
    async list() {
      const file = await readFileState(path);
      return [...file.records];
    },

    async upsert(record) {
      const file = await readFileState(path);
      const idx = file.records.findIndex(
        (row) =>
          row.roomId === record.roomId &&
          row.revision === record.revision &&
          row.targetOwnerId === record.targetOwnerId,
      );
      if (idx >= 0) file.records[idx] = record;
      else file.records.push(record);
      await writeFileState(path, file);
    },

    async remove(roomId, revision, targetOwnerId) {
      const file = await readFileState(path);
      const next = file.records.filter(
        (row) =>
          !(row.roomId === roomId && row.revision === revision && row.targetOwnerId === targetOwnerId),
      );
      if (next.length === file.records.length) return;
      await writeFileState(path, { version: "0.1", records: next });
    },

    async removeForRoom(roomId) {
      const file = await readFileState(path);
      const next = file.records.filter((row) => row.roomId !== roomId);
      if (next.length === file.records.length) return;
      await writeFileState(path, { version: "0.1", records: next });
    },

    async removeBelowRevision(roomId, revision) {
      const file = await readFileState(path);
      const next = file.records.filter((row) => !(row.roomId === roomId && row.revision < revision));
      if (next.length === file.records.length) return;
      await writeFileState(path, { version: "0.1", records: next });
    },
  };
}
