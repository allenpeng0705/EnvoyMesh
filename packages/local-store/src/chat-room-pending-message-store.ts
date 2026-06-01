/**
 * Pending chat.room.message deliveries — retried when peers come online.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatRoomMessagePayload } from "@envoymesh/protocol";

export const CHAT_ROOM_PENDING_MESSAGE_FILE = "chat-room-pending-message.json";

export interface ChatRoomPendingMessageRecord {
  messageId: string;
  roomId: string;
  targetOwnerId: string;
  envelopeCreatedAt: string;
  correlationId?: string;
  messagePayload: ChatRoomMessagePayload;
  createdAt: string;
}

interface PendingMessageFile {
  version: "0.1";
  records: ChatRoomPendingMessageRecord[];
}

export interface LocalChatRoomPendingMessageStore {
  list(): Promise<ChatRoomPendingMessageRecord[]>;
  upsert(record: ChatRoomPendingMessageRecord): Promise<void>;
  remove(messageId: string, targetOwnerId: string): Promise<void>;
  removeForMessage(messageId: string): Promise<void>;
  removeForRoom(roomId: string): Promise<void>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readFileState(path: string): Promise<PendingMessageFile> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as PendingMessageFile;
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

async function writeFileState(path: string, file: PendingMessageFile): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

export function createLocalChatRoomPendingMessageStore(
  profileDir: string,
): LocalChatRoomPendingMessageStore {
  const path = join(profileDir, CHAT_ROOM_PENDING_MESSAGE_FILE);

  return {
    async list() {
      const file = await readFileState(path);
      return [...file.records];
    },

    async upsert(record) {
      const file = await readFileState(path);
      const idx = file.records.findIndex(
        (row) => row.messageId === record.messageId && row.targetOwnerId === record.targetOwnerId,
      );
      if (idx >= 0) file.records[idx] = record;
      else file.records.push(record);
      await writeFileState(path, file);
    },

    async remove(messageId, targetOwnerId) {
      const file = await readFileState(path);
      const next = file.records.filter(
        (row) => !(row.messageId === messageId && row.targetOwnerId === targetOwnerId),
      );
      if (next.length === file.records.length) return;
      await writeFileState(path, { version: "0.1", records: next });
    },

    async removeForMessage(messageId) {
      const file = await readFileState(path);
      const next = file.records.filter((row) => row.messageId !== messageId);
      if (next.length === file.records.length) return;
      await writeFileState(path, { version: "0.1", records: next });
    },

    async removeForRoom(roomId) {
      const file = await readFileState(path);
      const next = file.records.filter((row) => row.roomId !== roomId);
      if (next.length === file.records.length) return;
      await writeFileState(path, { version: "0.1", records: next });
    },
  };
}
