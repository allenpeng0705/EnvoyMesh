import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface RagVaultManifestEntry {
  relativePath: string;
  documentId: string;
  contentHash: string;
  chunkCount: number;
  tier: "public" | "private";
  modelKey: string;
  chunkSizeChars: number;
  chunkOverlapChars: number;
  indexedAt: string;
  /** Vault text extractor pipeline id; missing → treat as stale for reindex. */
  extractorId?: string;
}

export interface RagVaultManifest {
  version: "0.1";
  documents: Record<string, RagVaultManifestEntry>;
}

const MANIFEST_FILE = "rag-vault-manifest.json";

export function ragVaultManifestPath(profileDir: string): string {
  return join(profileDir, MANIFEST_FILE);
}

export function ragVaultManifestKey(tier: "public" | "private", relativePath: string): string {
  return `${tier}:${relativePath.replace(/\\/g, "/")}`;
}

export async function loadRagVaultManifest(profileDir: string): Promise<RagVaultManifest> {
  try {
    const raw = await readFile(ragVaultManifestPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as RagVaultManifest;
    if (parsed.version === "0.1" && parsed.documents && typeof parsed.documents === "object") {
      return parsed;
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      console.warn(`[rag] failed to load vault manifest: ${error}`);
    }
  }
  return { version: "0.1", documents: {} };
}

export async function saveRagVaultManifest(profileDir: string, manifest: RagVaultManifest): Promise<void> {
  const path = ragVaultManifestPath(profileDir);
  await mkdir(dirname(path), { recursive: true });
  const payload = `${JSON.stringify(manifest, null, 2)}\n`;
  const tmp = join(dirname(path), `.rag-vault-manifest.${randomUUID()}.tmp`);
  try {
    await writeFile(tmp, payload, { mode: 0o600 });
    if (process.platform === "win32") {
      try {
        await unlink(path);
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
      }
    }
    await rename(tmp, path);
  } catch (error) {
    try {
      await unlink(tmp);
    } catch {
      // best effort
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTFOUND";
  }
  return false;
}
