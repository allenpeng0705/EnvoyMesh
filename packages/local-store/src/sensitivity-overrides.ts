/**
 * Per-item sensitivity overrides for vault documents.
 *
 * Stores a flat map of `{ documentId: sensitivity }` in
 * `{profileDir}/vault-sensitivity-overrides.json`. The Published toggle
 * in Library UI writes here; the RAG pipeline reads here during reindex to
 * embed sensitivity in vector metadata.
 *
 * Stored in profileDir (not vault root) to avoid polluting the vault index
 * with metadata files.
 *
 * Resolution chain: override (this store) → path heuristic → default public.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Knowledge-base sensitivity levels (3-tier). Protocol `trusted` maps to `friends`. */
export type VaultItemSensitivity = "public" | "friends" | "private";

/** Persistent on-disk envelope for sensitivity overrides. */
export interface SensitivityOverridesFile {
  version: 1;
  /** Map from documentId (e.g. `doc_abc123`) to sensitivity label. */
  overrides: Record<string, VaultItemSensitivity>;
}

/** Public API for reading/writing per-item sensitivity overrides. */
export interface SensitivityOverrideStore {
  /** Load all overrides. Returns empty map when file is missing or corrupt. */
  load(): Promise<Map<string, VaultItemSensitivity>>;
  /** Get a single document's sensitivity override. Returns undefined when not overridden. */
  get(documentId: string): Promise<VaultItemSensitivity | undefined>;
  /** Set (or update) the sensitivity for a document. Writes atomically. */
  set(documentId: string, sensitivity: VaultItemSensitivity): Promise<void>;
  /** Remove the override for a document (reverts to path-heuristic). Writes atomically. */
  delete(documentId: string): Promise<boolean>;
  /** Remove all overrides. Writes atomically. */
  clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a sensitivity override store backed by `{profileDir}/vault-sensitivity-overrides.json`.
 *
 * The file lives in the profile directory (not inside the vault root) to
 * avoid polluting the vault index with metadata files.
 */
export function createSensitivityOverrideStore(profileDir: string): SensitivityOverrideStore {
  const filePath = join(profileDir, "vault-sensitivity-overrides.json");

  async function loadFile(): Promise<SensitivityOverridesFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as SensitivityOverridesFile;
      if (parsed.version !== 1 || !parsed.overrides || typeof parsed.overrides !== "object") {
        return { version: 1, overrides: {} };
      }
      return parsed;
    } catch {
      return { version: 1, overrides: {} };
    }
  }

  async function writeFileAtomic(data: SensitivityOverridesFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp.${process.pid}`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, filePath);
  }

  return {
    async load(): Promise<Map<string, VaultItemSensitivity>> {
      const file = await loadFile();
      return new Map(Object.entries(file.overrides));
    },

    async get(documentId: string): Promise<VaultItemSensitivity | undefined> {
      const file = await loadFile();
      return file.overrides[documentId];
    },

    async set(documentId: string, sensitivity: VaultItemSensitivity): Promise<void> {
      const file = await loadFile();
      file.overrides[documentId] = sensitivity;
      await writeFileAtomic(file);
    },

    async delete(documentId: string): Promise<boolean> {
      const file = await loadFile();
      if (!(documentId in file.overrides)) return false;
      delete file.overrides[documentId];
      await writeFileAtomic(file);
      return true;
    },

    async clear(): Promise<void> {
      await writeFileAtomic({ version: 1, overrides: {} });
    },
  };
}
