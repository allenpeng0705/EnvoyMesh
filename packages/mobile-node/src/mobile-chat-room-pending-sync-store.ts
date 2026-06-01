import type { ChatRoomSyncPayload } from "@envoymesh/protocol";

const REL_PATH = "envoymesh_profile/chat-room-pending-sync.json";

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

interface PendingFile {
  version: "0.1";
  records: MobileChatRoomPendingSyncRecord[];
}

function _localStorageKey(profileDir: string): string {
  return `envoymesh_mobile_chat_room_pending_sync:${profileDir}`;
}

function _empty(): PendingFile {
  return { version: "0.1", records: [] };
}

async function _read(profileDir: string): Promise<PendingFile> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({ path: REL_PATH, directory: Directory.Data });
    const binary = atob(result.data as string);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<PendingFile>;
    if (parsed.version !== "0.1" || !Array.isArray(parsed.records)) return _empty();
    return { version: "0.1", records: parsed.records };
  } catch {
    try {
      const raw =
        typeof localStorage !== "undefined" ? localStorage.getItem(_localStorageKey(profileDir)) : null;
      if (!raw) return _empty();
      const parsed = JSON.parse(raw) as Partial<PendingFile>;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.records)) return _empty();
      return { version: "0.1", records: parsed.records };
    } catch {
      return _empty();
    }
  }
}

async function _write(profileDir: string, file: PendingFile): Promise<void> {
  const body = `${JSON.stringify(file, null, 2)}\n`;
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const bytes = new TextEncoder().encode(body);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    await Filesystem.writeFile({
      path: REL_PATH,
      data: btoa(binary),
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

export function createMobileChatRoomPendingSyncStore(
  profileDir: string,
): MobileChatRoomPendingSyncStore {
  return {
    async list() {
      return [...(await _read(profileDir)).records];
    },
    async upsert(record) {
      const file = await _read(profileDir);
      const idx = file.records.findIndex(
        (row) =>
          row.roomId === record.roomId &&
          row.revision === record.revision &&
          row.targetOwnerId === record.targetOwnerId,
      );
      if (idx >= 0) file.records[idx] = record;
      else file.records.push(record);
      await _write(profileDir, file);
    },
    async remove(roomId, revision, targetOwnerId) {
      const file = await _read(profileDir);
      const next = file.records.filter(
        (row) => !(row.roomId === roomId && row.revision === revision && row.targetOwnerId === targetOwnerId),
      );
      if (next.length === file.records.length) return;
      await _write(profileDir, { version: "0.1", records: next });
    },
    async removeForRoom(roomId) {
      const file = await _read(profileDir);
      const next = file.records.filter((row) => row.roomId !== roomId);
      if (next.length === file.records.length) return;
      await _write(profileDir, { version: "0.1", records: next });
    },
    async removeBelowRevision(roomId, revision) {
      const file = await _read(profileDir);
      const next = file.records.filter((row) => !(row.roomId === roomId && row.revision < revision));
      if (next.length === file.records.length) return;
      await _write(profileDir, { version: "0.1", records: next });
    },
  };
}
