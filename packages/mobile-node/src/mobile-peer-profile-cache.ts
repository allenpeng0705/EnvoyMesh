import type { HumanProfilePayload } from "@envoymesh/protocol";

export interface CachedPeerProfileThumbnail {
  contentBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export interface CachedPeerProfile {
  ownerId: string;
  profile: HumanProfilePayload;
  cachedAt: string;
  thumbnail?: CachedPeerProfileThumbnail;
}

export interface MobilePeerProfileCache {
  get(ownerId: string): Promise<CachedPeerProfile | undefined>;
  list(): Promise<CachedPeerProfile[]>;
  upsert(
    profile: HumanProfilePayload,
    thumbnail?: CachedPeerProfile["thumbnail"],
  ): Promise<CachedPeerProfile>;
}

export function createMobilePeerProfileCache(scopeOwnerId: string): MobilePeerProfileCache {
  const storageKey = `envoymesh_peer_profile_cache_${scopeOwnerId}`;

  function load(): { version: "0.1"; records: CachedPeerProfile[] } {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { version: "0.1", records: [] };
      return JSON.parse(raw) as { version: "0.1"; records: CachedPeerProfile[] };
    } catch {
      return { version: "0.1", records: [] };
    }
  }

  function save(file: { version: "0.1"; records: CachedPeerProfile[] }): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(file));
    } catch { /* ignore */ }
  }

  return {
    async get(ownerId: string) {
      return load().records.find((r) => r.ownerId === ownerId);
    },
    async list() {
      return load().records;
    },
    async upsert(profile, thumbnail) {
      const file = load();
      const row: CachedPeerProfile = {
        ownerId: profile.ownerId,
        profile,
        cachedAt: new Date().toISOString(),
        thumbnail,
      };
      const idx = file.records.findIndex((r) => r.ownerId === profile.ownerId);
      if (idx >= 0) file.records[idx] = row;
      else file.records.push(row);
      save(file);
      return row;
    },
  };
}
