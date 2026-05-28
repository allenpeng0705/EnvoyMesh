export interface MobileContactOwnerKeyStore {
  get(ownerId: string): Promise<{ ownerPublicKeyPem: string } | undefined>;
  set(ownerId: string, ownerPublicKeyPem: string): Promise<void>;
}

export function createMobileContactOwnerKeyStore(scopeOwnerId: string): MobileContactOwnerKeyStore {
  const storageKey = `envoymesh_contact_owner_keys_${scopeOwnerId}`;

  function load(): Record<string, string> {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  function save(map: Record<string, string>): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(map));
    } catch { /* ignore */ }
  }

  return {
    async get(ownerId: string) {
      const pem = load()[ownerId];
      return pem ? { ownerPublicKeyPem: pem } : undefined;
    },
    async set(ownerId: string, ownerPublicKeyPem: string) {
      const map = load();
      map[ownerId] = ownerPublicKeyPem;
      save(map);
    },
  };
}
