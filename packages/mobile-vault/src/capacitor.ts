/**
 * Capacitor Filesystem adapter implementing the MobileVault interface.
 *
 * Wraps @capacitor/filesystem to provide real file I/O on iOS and Android.
 * Only usable within the Capacitor runtime context. The base implementation
 * lives in `apps/mobile/src/bootstrap.ts` and the adapter is exported here so
 * the path-safety validator stays in lockstep with the package's contract.
 *
 * Path-safety rules (enforced in `_validatePath`):
 * - non-empty
 * - no `..` traversal
 * - no `~` (shell expansion)
 * - no leading `/` (must be relative to the vault root)
 * - no control characters
 */

import type { MobileVault, VaultFileEntry, VaultSearchResult } from "./index.js";

const DEFAULT_BASE_PATH = "envoymesh_vault";

function _validatePath(path: string): void {
  if (!path) throw new Error("Invalid vault path: empty");
  if (path.includes("..")) throw new Error(`Invalid vault path (traversal): ${path}`);
  if (path.includes("~")) throw new Error(`Invalid vault path (tilde): ${path}`);
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(path)) throw new Error(`Invalid vault path (control char): ${path}`);
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

export class CapacitorFilesystemVault implements MobileVault {
  private _basePath: string;

  constructor(basePath: string = DEFAULT_BASE_PATH) {
    this._basePath = basePath;
  }

  async writeFile(path: string, content: Uint8Array, _mimeType?: string): Promise<void> {
    _validatePath(path);
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({
      path: `${this._basePath}/${path}`,
      data: _uint8ArrayToBase64(content),
      directory: Directory.Data,
    });
  }

  async readFile(path: string): Promise<VaultFileEntry> {
    _validatePath(path);
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({
      path: `${this._basePath}/${path}`,
      directory: Directory.Data,
    });
    const content = _base64ToUint8Array(result.data as string);
    return { path, content, sizeBytes: content.length };
  }

  async deleteFile(path: string): Promise<void> {
    _validatePath(path);
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.deleteFile({
      path: `${this._basePath}/${path}`,
      directory: Directory.Data,
    });
  }

  async listFiles(dirPath = "/"): Promise<string[]> {
    _validatePath(dirPath);
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    try {
      const result = await Filesystem.readdir({
        path: `${this._basePath}${dirPath === "/" ? "" : dirPath}`,
        directory: Directory.Data,
      });
      return result.files.map((f: { name: string }) => f.name);
    } catch {
      return [];
    }
  }

  async search(query: string, maxResults = 50): Promise<VaultSearchResult[]> {
    const files = await this.listFiles();
    const results: VaultSearchResult[] = [];
    const q = query.toLowerCase();
    for (const fileName of files) {
      try {
        const entry = await this.readFile(fileName);
        const text = new TextDecoder().decode(entry.content);
        const idx = text.toLowerCase().indexOf(q);
        if (idx >= 0) {
          results.push({
            path: fileName,
            sizeBytes: entry.sizeBytes,
            matchedChunk: text.slice(Math.max(0, idx - 40), idx + q.length + 40),
          });
          if (results.length >= maxResults) break;
        }
      } catch { /* skip unreadable */ }
    }
    return results;
  }
}

/**
 * Convenience factory mirroring the in-memory `createMobileVault` factory.
 */
export function createCapacitorVault(basePath?: string): MobileVault {
  return new CapacitorFilesystemVault(basePath);
}
