import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DiscoveryProfile, RelayConfig } from "@envoymesh/api";

const NODE_CONFIG_FILE = "node-config.json";

export interface PersistedNodeConfig {
  version: "0.1";
  profileDir: string;
  discoveryProfile: DiscoveryProfile;
  relayEnabled: boolean;
  relayServerEnabled: boolean;
  advertiseAddrs: string[];
  bootstrapPeers: string[];
  bootstrapPresets: string[];
  configuredRelays: RelayConfig[];
  updatedAt: string;
}

export interface NodeConfigStore {
  load(): Promise<PersistedNodeConfig | undefined>;
  save(config: PersistedNodeConfig): Promise<void>;
  exists(): Promise<boolean>;
}

export function createNodeConfigStore(profileDir: string): NodeConfigStore {
  const path = join(profileDir, NODE_CONFIG_FILE);

  return {
    async load() {
      try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (!isValidNodeConfig(parsed)) {
          console.warn(`[node-config] ${path} has invalid shape, treating as uninitialized`);
          return undefined;
        }
        return parsed;
      } catch (error) {
        if (isMissingFileError(error)) {
          return undefined;
        }
        console.warn(`[node-config] failed to read ${path}: ${error}`);
        return undefined;
      }
    },

    async save(config) {
      await mkdir(dirname(path), { recursive: true });
      // Ensure profileDir is set correctly
      const toSave: PersistedNodeConfig = {
        ...config,
        profileDir,
        updatedAt: new Date().toISOString(),
      };
      await writeFile(path, JSON.stringify(toSave, null, 2) + "\n", { mode: 0o600 });
    },

    async exists() {
      try {
        await readFile(path, "utf8");
        return true;
      } catch {
        return false;
      }
    },
  };
}

function isValidNodeConfig(value: unknown): value is PersistedNodeConfig {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const file = value as Record<string, unknown>;
  if (file.version !== "0.1") {
    return false;
  }
  if (typeof file.profileDir !== "string") {
    return false;
  }
  if (file.discoveryProfile !== "lan-fast" && file.discoveryProfile !== "wan-default") {
    return false;
  }
  if (typeof file.relayEnabled !== "boolean") {
    return false;
  }
  if (typeof file.relayServerEnabled !== "boolean") {
    return false;
  }
  if (!Array.isArray(file.advertiseAddrs)) {
    return false;
  }
  if (!Array.isArray(file.bootstrapPeers)) {
    return false;
  }
  if (!Array.isArray(file.bootstrapPresets)) {
    return false;
  }
  if (!Array.isArray(file.configuredRelays)) {
    return false;
  }
  return true;
}

function isMissingFileError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTFOUND";
  }
  return false;
}
