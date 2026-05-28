import type { HumanProfilePayload } from "@envoymesh/protocol";

type ProfilePhotoMime = "image/jpeg" | "image/png" | "image/webp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const PEER_PROFILE_CACHE_FILE = "peer-profile-cache.json";

export interface CachedPeerProfileThumbnail {
  contentBase64: string;
  mimeType: ProfilePhotoMime;
}

export interface CachedPeerProfile {
  ownerId: string;
  profile: HumanProfilePayload;
  cachedAt: string;
  thumbnail?: CachedPeerProfileThumbnail;
}

interface PeerProfileCacheFile {
  version: "0.1";
  records: CachedPeerProfile[];
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export interface PeerProfileCacheStore {
  get(ownerId: string): Promise<CachedPeerProfile | undefined>;
  list(): Promise<CachedPeerProfile[]>;
  upsert(
    profile: HumanProfilePayload,
    thumbnail?: CachedPeerProfileThumbnail,
  ): Promise<CachedPeerProfile>;
  remove(ownerId: string): Promise<void>;
}

export function createPeerProfileCacheStore(profileDir: string): PeerProfileCacheStore {
  const path = join(profileDir, PEER_PROFILE_CACHE_FILE);

  async function loadFile(): Promise<PeerProfileCacheFile> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as PeerProfileCacheFile;
    } catch (error) {
      if (isMissingFileError(error)) {
        return { version: "0.1", records: [] };
      }
      throw error;
    }
  }

  async function saveFile(file: PeerProfileCacheFile): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  }

  return {
    async get(ownerId: string): Promise<CachedPeerProfile | undefined> {
      const file = await loadFile();
      return file.records.find((r) => r.ownerId === ownerId);
    },

    async list(): Promise<CachedPeerProfile[]> {
      const file = await loadFile();
      return file.records;
    },

    async upsert(
      profile: HumanProfilePayload,
      thumbnail?: CachedPeerProfileThumbnail,
    ): Promise<CachedPeerProfile> {
      const file = await loadFile();
      const row: CachedPeerProfile = {
        ownerId: profile.ownerId,
        profile,
        cachedAt: new Date().toISOString(),
        thumbnail,
      };
      const idx = file.records.findIndex((r) => r.ownerId === profile.ownerId);
      if (idx >= 0) file.records[idx] = row;
      else file.records.push(row);
      await saveFile(file);
      return row;
    },

    async remove(ownerId: string): Promise<void> {
      const file = await loadFile();
      file.records = file.records.filter((r) => r.ownerId !== ownerId);
      await saveFile(file);
    },
  };
}
