import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const CONTACT_OWNER_KEYS_FILE = "contact-owner-keys.json";

export interface ContactOwnerKeyRecord {
  ownerId: string;
  ownerPublicKeyPem: string;
  updatedAt: string;
}

interface ContactOwnerKeyFile {
  version: "0.1";
  records: ContactOwnerKeyRecord[];
}

export interface ContactOwnerKeyStore {
  upsert(ownerId: string, ownerPublicKeyPem: string): Promise<void>;
  get(ownerId: string): Promise<ContactOwnerKeyRecord | undefined>;
  list(): Promise<ContactOwnerKeyRecord[]>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readFileJson(path: string): Promise<ContactOwnerKeyFile> {
  try {
    const raw = await readFile(path, "utf8");
    if (!raw.trim()) {
      return { version: "0.1", records: [] };
    }
    const parsed = JSON.parse(raw) as ContactOwnerKeyFile;
    if (parsed.version === "0.1" && Array.isArray(parsed.records)) {
      return parsed;
    }
    console.warn(
      `[contact-owner-key-store] invalid shape in ${basename(path)}, starting fresh`,
    );
  } catch (error) {
    if (isMissingFileError(error)) {
      return { version: "0.1", records: [] };
    }
    console.warn(
      `[contact-owner-key-store] failed to read ${basename(path)}, starting fresh: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { version: "0.1", records: [] };
}

export function createContactOwnerKeyStore(profileDir: string): ContactOwnerKeyStore {
  const path = join(profileDir, CONTACT_OWNER_KEYS_FILE);

  return {
    async upsert(ownerId, ownerPublicKeyPem) {
      const pem = ownerPublicKeyPem.trim();
      const id = ownerId.trim();
      if (!id || !pem) return;
      const file = await readFileJson(path);
      const now = new Date().toISOString();
      const existing = file.records.find((row) => row.ownerId === id);
      if (existing) {
        existing.ownerPublicKeyPem = pem;
        existing.updatedAt = now;
      } else {
        file.records.push({ ownerId: id, ownerPublicKeyPem: pem, updatedAt: now });
      }
      await mkdir(profileDir, { recursive: true });
      await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    },

    async get(ownerId) {
      const file = await readFileJson(path);
      return file.records.find((row) => row.ownerId === ownerId.trim());
    },

    async list() {
      const file = await readFileJson(path);
      return file.records;
    },
  };
}
