/**
 * Generic JSON-on-Filesystem pending-record store with localStorage fallback.
 *
 * Used by the mobile-node chat-room pending stores (message and sync). The
 * Capacitor Filesystem API is preferred; when it is unavailable (web dev
 * mode, plugin not wired), the store falls back to `localStorage` so the
 * social UI can still boot.
 *
 * Records are stored as `{ version, records: T[] }` and replaced atomically
 * on every write. The store is single-process and not crash-safe across
 * concurrent writers — callers should serialize via the orchestrator
 * (mobile-chat-room.ts) flush loop.
 */

const FILE_VERSION = "0.1" as const;

interface PendingFile<T> {
  version: typeof FILE_VERSION;
  records: T[];
}

function emptyFile<T>(): PendingFile<T> {
  return { version: FILE_VERSION, records: [] };
}

function localStorageKey(profileDir: string, relPath: string): string {
  return `envoymesh_mobile_pending:${profileDir}:${relPath}`;
}

async function readFile<T>(relPath: string, profileDir: string): Promise<PendingFile<T>> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({ path: relPath, directory: Directory.Data });
    const binary = atob(result.data as string);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<PendingFile<T>>;
    if (parsed.version !== FILE_VERSION || !Array.isArray(parsed.records)) return emptyFile();
    return { version: FILE_VERSION, records: parsed.records };
  } catch {
    try {
      const raw =
        typeof localStorage !== "undefined"
          ? localStorage.getItem(localStorageKey(profileDir, relPath))
          : null;
      if (!raw) return emptyFile();
      const parsed = JSON.parse(raw) as Partial<PendingFile<T>>;
      if (parsed.version !== FILE_VERSION || !Array.isArray(parsed.records)) return emptyFile();
      return { version: FILE_VERSION, records: parsed.records };
    } catch {
      return emptyFile();
    }
  }
}

async function writeFile<T>(relPath: string, profileDir: string, file: PendingFile<T>): Promise<void> {
  const body = `${JSON.stringify(file, null, 2)}\n`;
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const bytes = new TextEncoder().encode(body);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    await Filesystem.writeFile({ path: relPath, data: btoa(binary), directory: Directory.Data });
    return;
  } catch {
    /* fall through to localStorage */
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(localStorageKey(profileDir, relPath), body);
    }
  } catch {
    /* ignore */
  }
}

export interface PendingKvStore<T> {
  list(): Promise<T[]>;
  upsert(record: T): Promise<void>;
  /** Remove one record matching the predicate; no-op if not found. */
  remove(predicate: (record: T) => boolean): Promise<void>;
  /** Replace all records at once (atomic). */
  replaceAll(records: T[]): Promise<void>;
}

/**
 * Create a generic pending-record store.
 *
 * @param relPath  File path relative to the Capacitor Data directory
 * @param profileDir  Used as a localStorage key namespace (per profile)
 * @param keyFn  Returns a stable string key for a record (for debugging only —
 *               equality is determined by the caller's `predicate`)
 */
export function createPendingKvStore<T>(
  relPath: string,
  profileDir: string,
): PendingKvStore<T> {
  return {
    async list() {
      return [...(await readFile<T>(relPath, profileDir)).records];
    },
    async upsert(record) {
      const file = await readFile<T>(relPath, profileDir);
      file.records.push(record);
      await writeFile(relPath, profileDir, file);
    },
    async remove(predicate) {
      const file = await readFile<T>(relPath, profileDir);
      const next = file.records.filter((r) => !predicate(r));
      if (next.length === file.records.length) return;
      await writeFile(relPath, profileDir, { version: FILE_VERSION, records: next });
    },
    async replaceAll(records) {
      await writeFile(relPath, profileDir, { version: FILE_VERSION, records });
    },
  };
}
