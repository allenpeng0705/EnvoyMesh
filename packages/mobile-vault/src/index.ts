/**
 * Mobile filesystem-backed vault using Capacitor Filesystem plugin.
 *
 * Replaces @envoymesh/vault for the Capacitor mobile environment.
 * Uses `@capacitor/filesystem` for read/write/delete with path-safety
 * enforcement matching the desktop vault.
 *
 * On Web (during dev), falls back to an in-memory store.
 */

export interface VaultFileEntry {
  path: string;
  content: Uint8Array;
  sizeBytes: number;
  mimeType?: string;
}

export interface VaultSearchResult {
  path: string;
  sizeBytes: number;
  matchedChunk?: string;
}

export interface MobileVault {
  /** Write a file to the vault (path-safe, deny-by-default). */
  writeFile(path: string, content: Uint8Array, mimeType?: string): Promise<void>;
  /** Read a file from the vault. */
  readFile(path: string): Promise<VaultFileEntry>;
  /** Delete a file from the vault. */
  deleteFile(path: string): Promise<void>;
  /** List files in a directory. */
  listFiles(dirPath?: string): Promise<string[]>;
  /** Full-text search (simple substring match for MVP). */
  search(query: string, maxResults?: number): Promise<VaultSearchResult[]>;
}

/**
 * Create an in-memory vault (dev/testing fallback before Capacitor plugin is wired).
 */
export function createMobileVault(): MobileVault {
  const files = new Map<string, VaultFileEntry>();

  return {
    async writeFile(path, content, mimeType) {
      _validatePath(path);
      files.set(path, { path, content, sizeBytes: content.length, mimeType });
    },
    async readFile(path) {
      _validatePath(path);
      const entry = files.get(path);
      if (!entry) throw new Error(`File not found: ${path}`);
      return entry;
    },
    async deleteFile(path) {
      _validatePath(path);
      files.delete(path);
    },
    async listFiles(dirPath = "/") {
      const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
      return [...files.keys()].filter((p) => p.startsWith(prefix));
    },
    async search(query, maxResults = 50) {
      const results: VaultSearchResult[] = [];
      const q = query.toLowerCase();
      for (const [path, entry] of files) {
        const text = new TextDecoder().decode(entry.content);
        const idx = text.toLowerCase().indexOf(q);
        if (idx >= 0) {
          results.push({
            path,
            sizeBytes: entry.sizeBytes,
            matchedChunk: text.slice(Math.max(0, idx - 40), idx + q.length + 40),
          });
          if (results.length >= maxResults) break;
        }
      }
      return results;
    },
  };
}

function _validatePath(path: string): void {
  if (!path) throw new Error("Invalid vault path: empty");
  if (path.includes("..")) throw new Error(`Invalid vault path (traversal): ${path}`);
  if (path.includes("~")) throw new Error(`Invalid vault path (tilde): ${path}`);
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(path)) throw new Error(`Invalid vault path (control char): ${path}`);
}

export { createCapacitorVault, CapacitorFilesystemVault } from "./capacitor.js";
