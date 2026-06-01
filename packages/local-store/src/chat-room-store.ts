/**
 * Local chat room registry (JSON) — membership synced via `chat.room.sync`.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const CHAT_ROOMS_FILE = "chat-rooms.json";

export interface ChatRoomRecord {
  roomId: string;
  title: string;
  creatorOwnerId: string;
  memberOwnerIds: string[];
  revision: number;
  updatedAt: string;
}

interface ChatRoomsFile {
  version: "0.1";
  rooms: ChatRoomRecord[];
}

export function chatRoomThreadKey(roomId: string): string {
  return `room:${roomId}`;
}

export function parseChatRoomThreadKey(threadKey: string): string | null {
  if (!threadKey.startsWith("room:")) return null;
  const roomId = threadKey.slice("room:".length).trim();
  return roomId.length > 0 ? roomId : null;
}

export function isChatRoomThreadKey(threadKey: string): boolean {
  return parseChatRoomThreadKey(threadKey) !== null;
}

export interface LocalChatRoomStore {
  list(): Promise<ChatRoomRecord[]>;
  get(roomId: string): Promise<ChatRoomRecord | undefined>;
  upsert(room: ChatRoomRecord): Promise<void>;
  remove(roomId: string): Promise<boolean>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readRoomsFile(path: string): Promise<ChatRoomsFile> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ChatRoomsFile;
    if (parsed.version !== "0.1" || !Array.isArray(parsed.rooms)) {
      return { version: "0.1", rooms: [] };
    }
    return parsed;
  } catch (error) {
    if (isMissingFileError(error)) {
      return { version: "0.1", rooms: [] };
    }
    throw error;
  }
}

async function writeRoomsFile(path: string, file: ChatRoomsFile): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

export function createLocalChatRoomStore(profileDir: string): LocalChatRoomStore {
  const path = join(profileDir, CHAT_ROOMS_FILE);

  return {
    async list() {
      const file = await readRoomsFile(path);
      return [...file.rooms].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async get(roomId) {
      const file = await readRoomsFile(path);
      return file.rooms.find((room) => room.roomId === roomId);
    },

    async upsert(room) {
      const file = await readRoomsFile(path);
      const idx = file.rooms.findIndex((row) => row.roomId === room.roomId);
      if (idx >= 0) {
        file.rooms[idx] = room;
      } else {
        file.rooms.push(room);
      }
      await writeRoomsFile(path, file);
    },

    async remove(roomId) {
      const file = await readRoomsFile(path);
      const next = file.rooms.filter((row) => row.roomId !== roomId);
      if (next.length === file.rooms.length) {
        return false;
      }
      await writeRoomsFile(path, { version: "0.1", rooms: next });
      return true;
    },
  };
}
