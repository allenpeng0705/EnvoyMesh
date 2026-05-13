import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AiSettings, AnonymousDiscoveryMode, AutonomousPolicy, ContactAiPreferences, DiscoveryProfile, ModelProviderConfig, RelayConfig } from "@envoymesh/api";

const NODE_CONFIG_FILE = "node-config.json";

export interface PersistedNodeConfig {
  version: "0.1";
  profileDir: string;
  discoveryProfile: DiscoveryProfile;
  enableMdns?: boolean; // Optional, defaults to true if not set
  relayEnabled: boolean;
  relayServerEnabled: boolean;
  advertiseAddrs: string[];
  bootstrapPeers: string[];
  bootstrapPresets: string[];
  configuredRelays: RelayConfig[];
  modelProviders: ModelProviderConfig;
  chatAssistEnabled: boolean;
  updatedAt: string;
  /** Anonymous discovery mode. Default: "off". */
  anonymousDiscoveryMode?: AnonymousDiscoveryMode;
  /** EMP intent allowlist for anonymous requests. Defaults to ["discovery.request"]. */
  anonymousIntentAllowlist?: readonly string[];
  /** Sensitivity ceiling for anonymous auto-answer. Default: "public". */
  anonymousSensitivityCeiling?: "public" | "friends";
  /** Trusted anchor public keys for verifying official credentials. Maps anchorId → PEM public key. */
  trustAnchorPublicKeys?: Record<string, string>;
  /** Master kill switch for all autonomous actions. Default: false (autonomous actions allowed). */
  autonomousKillSwitch?: boolean;
  /** Per-domain autonomous policies. Default: empty (all autonomous actions require approval). */
  autonomousPolicies?: AutonomousPolicy[];
  /** AI Assistant settings — identity, online/offline behavior, defaults. */
  aiSettings?: AiSettings;
  /** Per-contact AI preferences. */
  contactAiPreferences: ContactAiPreferences[];
  /**
   * When true, inbound `device.pair.request` with a valid `pairingToken` matching the latest
   * `getPairingPayload` token can be auto-accepted. Default: false (undefined).
   */
  companionPairingAutoAcceptWithToken?: boolean;
  /**
   * Public WebSocket URL of the relay node for mobile pairing (Phase 10A relay bridge).
   * When set, the pairing QR encodes this URL so mobile can connect via the relay from any network.
   */
  relayPublicWsUrl?: string;
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
  if (!isValidModelProviders(file.modelProviders)) {
    return false;
  }
  if (typeof file.chatAssistEnabled !== "boolean") {
    return false;
  }
  return true;
}

function isValidModelProviders(value: unknown): value is ModelProviderConfig {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const cfg = value as Record<string, unknown>;
  const validModes = ["mock", "ollama", "litellm", "openai-compatible", "anthropic-compatible", "disabled"];
  if (typeof cfg.mode !== "string" || !validModes.includes(cfg.mode)) {
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

/**
 * Creates a stub config store for testing when no profile directory is available
 */
export function createStubNodeConfigStore(): NodeConfigStore {
  return {
    async load() {
      return undefined;
    },
    async save() {
      // no-op
    },
    async exists() {
      return false;
    },
  };
}
