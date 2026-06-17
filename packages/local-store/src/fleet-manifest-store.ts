/**
 * Local persistence for `FleetManifestRecord`s.
 *
 * Mirrors `company-invite-store.ts`:
 * - JSON file under `profileDir`
 * - atomic write (`.tmp` + `rename`)
 * - serial `enqueueWrite` to avoid lost updates on concurrent writers
 * - file mode `0o600` (the issuer fingerprints inside are not secrets on
 *   their own, but combined with logs they can re-identify an owner, so we
 *   treat the file as sensitive anyway)
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const FLEET_MANIFESTS_FILE = "fleet-manifests.json";

export interface FleetManifestRecord {
  manifestId: string;
  issuerOwnerId: string;
  label?: string;
  issuerOwnerFingerprint: string;
  signatureFingerprint: string;
  issuedAt: string;
  expiresAt?: string;
  importedAt: string;
  lastReimportedAt?: string;
  revokedAt?: string;
  memberCount: number;
  preStagedOwnerIds: string[];
}

export interface LocalFleetManifestStore {
  saveManifest(record: FleetManifestRecord): Promise<FleetManifestRecord>;
  getManifest(manifestId: string): Promise<FleetManifestRecord | null>;
  listManifests(): Promise<FleetManifestRecord[]>;
  revokeManifest(manifestId: string, at: string): Promise<FleetManifestRecord | null>;
}

interface FleetManifestsFile {
  version: "0.1";
  manifests: FleetManifestRecord[];
}

export function createLocalFleetManifestStore(
  profileDir: string,
): LocalFleetManifestStore {
  const filePath = join(profileDir, FLEET_MANIFESTS_FILE);
  let writeChain: Promise<void> = Promise.resolve();

  async function loadFile(): Promise<FleetManifestsFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as FleetManifestsFile;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.manifests)) {
        return { version: "0.1", manifests: [] };
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: "0.1", manifests: [] };
      }
      throw error;
    }
  }

  async function writeFileAtomic(data: FleetManifestsFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, filePath);
  }

  function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const done = writeChain.then(task);
    writeChain = done.then(
      () => {},
      () => {},
    );
    return done;
  }

  return {
    async saveManifest(record) {
      return enqueueWrite(async () => {
        const file = await loadFile();
        const idx = file.manifests.findIndex(
          (m) => m.manifestId === record.manifestId,
        );
        if (idx === -1) {
          file.manifests.push(record);
        } else {
          file.manifests[idx] = record;
        }
        await writeFileAtomic(file);
        return record;
      });
    },

    async getManifest(manifestId) {
      const file = await loadFile();
      return file.manifests.find((m) => m.manifestId === manifestId) ?? null;
    },

    async listManifests() {
      const file = await loadFile();
      return [...file.manifests];
    },

    async revokeManifest(manifestId, at) {
      return enqueueWrite(async () => {
        const file = await loadFile();
        const idx = file.manifests.findIndex(
          (m) => m.manifestId === manifestId,
        );
        if (idx === -1) return null;
        if (!file.manifests[idx].revokedAt) {
          file.manifests[idx] = { ...file.manifests[idx], revokedAt: at };
        }
        await writeFileAtomic(file);
        return file.manifests[idx];
      });
    },
  };
}
