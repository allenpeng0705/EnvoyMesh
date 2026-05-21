/**
 * Persists IPFS export records under Capacitor Directory.Data (with localStorage fallback for web dev).
 */
import type { PublishedExternalRecord } from "@envoymesh/api";

const REL_PATH = "envoymesh_profile/published-external.json";

interface PublishedExternalFile {
  version: "0.1";
  exports: Record<string, PublishedExternalRecord>;
}

export type MobilePublishedExternalExportFields = Pick<
  PublishedExternalRecord,
  "cid" | "ipfsInteropRecipe" | "kuboVersion" | "contentHash" | "cidHelia" | "heliaVersion"
>;

function _localStorageKey(profileDir: string): string {
  return `envoymesh_mobile_published_external:${profileDir}`;
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

function _emptyState(): PublishedExternalFile {
  return { version: "0.1", exports: {} };
}

async function _readState(profileDir: string): Promise<PublishedExternalFile> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({
      path: REL_PATH,
      directory: Directory.Data,
    });
    const text = new TextDecoder().decode(_base64ToUint8Array(result.data as string));
    const parsed = JSON.parse(text) as Partial<PublishedExternalFile>;
    if (parsed.version !== "0.1" || typeof parsed.exports !== "object" || parsed.exports === null) {
      return _emptyState();
    }
    return { version: "0.1", exports: parsed.exports };
  } catch {
    try {
      const raw =
        typeof localStorage !== "undefined"
          ? localStorage.getItem(_localStorageKey(profileDir))
          : null;
      if (!raw) return _emptyState();
      const parsed = JSON.parse(raw) as Partial<PublishedExternalFile>;
      if (parsed.version !== "0.1" || typeof parsed.exports !== "object" || parsed.exports === null) {
        return _emptyState();
      }
      return { version: "0.1", exports: parsed.exports };
    } catch {
      return _emptyState();
    }
  }
}

async function _writeState(profileDir: string, state: PublishedExternalFile): Promise<void> {
  const body = `${JSON.stringify(state, null, 2)}\n`;
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({
      path: REL_PATH,
      data: _uint8ArrayToBase64(new TextEncoder().encode(body)),
      directory: Directory.Data,
    });
    return;
  } catch {
    /* fall through to localStorage */
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(_localStorageKey(profileDir), body);
    }
  } catch {
    /* ignore */
  }
}

export async function loadMobilePublishedExternalMap(
  profileDir: string,
): Promise<Map<string, PublishedExternalRecord>> {
  const state = await _readState(profileDir);
  return new Map(Object.entries(state.exports));
}

export async function recordMobilePublishedExternalExport(
  profileDir: string,
  documentId: string,
  fields: MobilePublishedExternalExportFields,
): Promise<PublishedExternalRecord> {
  const state = await _readState(profileDir);
  const prev = state.exports[documentId];
  const record: PublishedExternalRecord = {
    exportRevision: (prev?.exportRevision ?? 0) + 1,
    exportedAt: new Date().toISOString(),
    ...fields,
  };
  state.exports[documentId] = record;
  await _writeState(profileDir, state);
  return record;
}
