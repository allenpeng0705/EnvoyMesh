/**
 * Client-side archived Coding workspaces (History-as-list-power).
 * Keys: `eh:<chatId>` | `pi:<sessionId>` | `ext:<id>`
 */

const STORAGE_KEY = "envoymesh.codingArchived";

/** Fired when the archived set changes. */
export const CODING_ARCHIVED_CHANGED_EVENT =
  "envoymesh:coding-archived-changed";

export type CodingArchiveKind = "eh" | "pi" | "ext";

export function codingArchiveKey(
  kind: CodingArchiveKind,
  id: string,
): string {
  return `${kind}:${id.trim()}`;
}

function emitChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CODING_ARCHIVED_CHANGED_EVENT));
  }
}

export function loadCodingArchivedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<string>();
    for (const row of parsed) {
      const key = String(row ?? "").trim();
      if (key) out.add(key);
    }
    return out;
  } catch {
    return new Set();
  }
}

function saveCodingArchivedKeys(keys: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    /* private mode */
  }
  emitChanged();
}

export function isCodingArchived(key: string): boolean {
  return loadCodingArchivedKeys().has(key);
}

export function archiveCodingWorkspace(key: string): void {
  const k = key.trim();
  if (!k) return;
  const keys = loadCodingArchivedKeys();
  if (keys.has(k)) return;
  keys.add(k);
  saveCodingArchivedKeys(keys);
}

export function unarchiveCodingWorkspace(key: string): void {
  const k = key.trim();
  if (!k) return;
  const keys = loadCodingArchivedKeys();
  if (!keys.delete(k)) return;
  saveCodingArchivedKeys(keys);
}
