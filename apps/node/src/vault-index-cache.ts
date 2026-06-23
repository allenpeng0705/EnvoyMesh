import { buildVaultIndex, type VaultIndex } from "@envoymesh/vault";

/** Reuse vault index across rapid inbound assists (avoids full disk scan per message). */
export const VAULT_INDEX_CACHE_TTL_MS = 45_000;

type CacheEntry = {
  at: number;
  index: VaultIndex;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<VaultIndex>>();

export async function getCachedVaultIndex(vaultDir: string): Promise<VaultIndex | null> {
  const key = vaultDir.trim();
  if (!key) {
    return null;
  }

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < VAULT_INDEX_CACHE_TTL_MS) {
    return hit.index;
  }

  const pending = inFlight.get(key);
  if (pending) {
    try {
      return await pending;
    } catch {
      return null;
    }
  }

  const build = buildVaultIndex({ rootDir: key })
    .then((index) => {
      cache.set(key, { at: Date.now(), index });
      return index;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, build);
  try {
    return await build;
  } catch {
    return null;
  }
}

/** Test helper */
export function resetVaultIndexCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
