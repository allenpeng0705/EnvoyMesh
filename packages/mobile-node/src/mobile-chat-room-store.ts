/**
 * Chat room registry for mobile (Capacitor Filesystem + localStorage fallback).
 */
import type { ChatRoom } from "@envoymesh/api";

const REL_PATH = "envoymesh_profile/chat-rooms.json";

interface ChatRoomsFile {
  version: "0.1";
  rooms: ChatRoom[];
}

export interface MobileChatRoomStore {
  list(): Promise<ChatRoom[]>;
  get(roomId: string): Promise<ChatRoom | undefined>;
  upsert(room: ChatRoom): Promise<void>;
  remove(roomId: string): Promise<boolean>;
}

function _localStorageKey(profileDir: string): string {
  return `envoymesh_mobile_chat_rooms:${profileDir}`;
}

function _emptyState(): ChatRoomsFile {
  return { version: "0.1", rooms: [] };
}

function _uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function _base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function _readState(profileDir: string): Promise<ChatRoomsFile> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({
      path: REL_PATH,
      directory: Directory.Data,
    });
    const text = new TextDecoder().decode(_base64ToUint8Array(result.data as string));
    const parsed = JSON.parse(text) as Partial<ChatRoomsFile>;
    if (parsed.version !== "0.1" || !Array.isArray(parsed.rooms)) {
      return _emptyState();
    }
    return { version: "0.1", rooms: parsed.rooms };
  } catch {
    try {
      const raw =
        typeof localStorage !== "undefined" ? localStorage.getItem(_localStorageKey(profileDir)) : null;
      if (!raw) return _emptyState();
      const parsed = JSON.parse(raw) as Partial<ChatRoomsFile>;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.rooms)) {
        return _emptyState();
      }
      return { version: "0.1", rooms: parsed.rooms };
    } catch {
      return _emptyState();
    }
  }
}

async function _writeState(profileDir: string, file: ChatRoomsFile): Promise<void> {
  const body = `${JSON.stringify(file, null, 2)}\n`;
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({
      path: REL_PATH,
      data: _uint8ArrayToBase64(new TextEncoder().encode(body)),
      directory: Directory.Data,
    });
    return;
  } catch {
    /* fall through */
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(_localStorageKey(profileDir), body);
    }
  } catch {
    /* ignore */
  }
}

export function createMobileChatRoomStore(profileDir: string): MobileChatRoomStore {
  return {
    async list() {
      const file = await _readState(profileDir);
      return [...file.rooms].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async get(roomId) {
      const file = await _readState(profileDir);
      return file.rooms.find((room) => room.roomId === roomId);
    },

    async upsert(room) {
      const file = await _readState(profileDir);
      const idx = file.rooms.findIndex((row) => row.roomId === room.roomId);
      if (idx >= 0) file.rooms[idx] = room;
      else file.rooms.push(room);
      await _writeState(profileDir, file);
    },

    async remove(roomId) {
      const file = await _readState(profileDir);
      const next = file.rooms.filter((row) => row.roomId !== roomId);
      if (next.length === file.rooms.length) return false;
      await _writeState(profileDir, { version: "0.1", rooms: next });
      return true;
    },
  };
}
