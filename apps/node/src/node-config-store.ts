import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  defaultBootstrapPresetsForDiscoveryProfile,
  normalizeBootstrapPresetsForContactsOnly,
} from "@envoymesh/api";
import type {
  AiSettings,
  AnonymousDiscoveryMode,
  AutonomousPolicy,
  ConnectivityTuning,
  ContactAiPreferences,
  DiscoveryProfile,
  ExternalPublishConfig,
  ModelProviderConfig,
  RelayConfig,
} from "@envoymesh/api";
import type { FriendMatchingPreferencesPayload } from "@envoymesh/protocol";

const NODE_CONFIG_FILE = "node-config.json";
const warnedInvalidConfigPaths = new Set<string>();

const VALID_DISCOVERY_PROFILES = new Set<DiscoveryProfile>([
  "lan-fast",
  "wan-default",
  "relay-only",
  "contacts-only",
]);

function isValidDiscoveryProfile(value: unknown): value is DiscoveryProfile {
  return typeof value === "string" && VALID_DISCOVERY_PROFILES.has(value as DiscoveryProfile);
}

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
  /**
   * Whether the agent bridge is enabled. When true, the bridge is activated on next
   * node start. Default: false.
   */
  bridgeEnabled?: boolean;
  /** HomeClaw Core base URL on the node's LAN (`homeclawCoreProxy`). */
  homeClawCoreBaseUrl?: string;
  /** Trust mode — agent-assisted intros (`social.intro.*`). Default false. */
  trustModeEnabled?: boolean;
  /** Owner-authored friend matching criteria for the agent (bounded length). */
  friendMatchingPreferencesText?: string;
  /** Owner-signed matching preferences (optional Phase F). */
  friendMatchingPreferencesSigned?: FriendMatchingPreferencesPayload;
  /** External distribution policy (IPFS export gate). */
  externalPublish?: ExternalPublishConfig;
  /** libp2p connection cap (client nodes). Omitted uses network default (150). */
  maxConnections?: number;
  /** mDNS interval in ms. Default 10_000. */
  mdnsIntervalMs?: number;
  /** Background capability discovery cycle interval in ms. Default 90_000. */
  capabilityDiscoveryIntervalMs?: number;
  /** Skip periodic DHT capability find; Search triggers on-demand find. */
  lazyCapabilityDiscovery?: boolean;
  /** Stretch relay/capability/bootstrap timers when idle. */
  idleTimerStretch?: boolean;
  /** Per-domain Activity notify loudness (Phase 13E). */
  agentVisibility?: import("@envoymesh/api").AgentVisibilityConfig;
  /** Local chat system lines on A2A milestones. Default off. */
  a2aChatNotifications?: import("@envoymesh/api").A2aChatNotificationMode;
  agentInteractionMode?: import("@envoymesh/api").AgentInteractionMode;
  /** Phase 14A — Trust-mode friend autopilot (requires trustModeEnabled). */
  friendAutopilotEnabled?: boolean;
  friendAutopilotIntervalHours?: number;
  friendAutopilotLastRunAt?: string;
  /** Phase 14B — inbound peer knowledge.query syndication ceiling. */
  knowledgeSyndicationMaxSensitivity?: "public" | "friends" | "private";
  /** Phase 16B — social proxy posture. */
  socialProxyEnabled?: boolean;
  socialProxyMandateId?: string;
  socialProxyLastPassAt?: string;
  /** Phase 16C — document acquisition. */
  documentAcquisitionEnabled?: boolean;
  documentAcquisitionMandateId?: string;
  /** Phase 16D — capability provider (agent intent routing jobs). */
  capabilityProviderEnabled?: boolean;
  capabilityProviderMandateId?: string;
  /** Phase 19 — bond autonomy posture (agent-driven bond acceptance). */
  bondAutonomyEnabled?: boolean;
  bondAutonomyMandateId?: string;
}

export interface NodeConfigStore {
  load(): Promise<PersistedNodeConfig | undefined>;
  save(config: PersistedNodeConfig): Promise<void>;
  exists(): Promise<boolean>;
}

export function createDefaultPersistedNodeConfig(profileDir: string): PersistedNodeConfig {
  return {
    version: "0.1",
    profileDir,
    discoveryProfile: "lan-fast",
    enableMdns: true,
    relayEnabled: true,
    relayServerEnabled: false,
    advertiseAddrs: [],
    bootstrapPeers: [],
    bootstrapPresets: [],
    configuredRelays: [],
    modelProviders: { mode: "disabled" },
    chatAssistEnabled: false,
    contactAiPreferences: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createNodeConfigStore(profileDir: string): NodeConfigStore {
  const path = join(profileDir, NODE_CONFIG_FILE);

  return {
    async load() {
      try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(stripJsonComments(raw)) as unknown;
        if (isValidNodeConfig(parsed)) {
          return parsed;
        }
        const reason = describeNodeConfigValidationFailure(parsed);
        const migrated = tryMigrateNodeConfig(parsed, profileDir);
        if (migrated) {
          console.warn(`[node-config] ${path} invalid (${reason}); migrated and repaired`);
          await writeNodeConfigFile(path, migrated);
          return migrated;
        }
        const salvaged = tryMigrateNodeConfig(
          { ...createDefaultPersistedNodeConfig(profileDir), ...(parsed as Record<string, unknown>) },
          profileDir,
        );
        if (salvaged) {
          console.warn(`[node-config] ${path} invalid (${reason}); repaired with defaults`);
          await writeNodeConfigFile(path, salvaged);
          return salvaged;
        }
        if (!warnedInvalidConfigPaths.has(path)) {
          console.warn(`[node-config] ${path} has invalid shape (${reason}), treating as uninitialized`);
          warnedInvalidConfigPaths.add(path);
        }
        return undefined;
      } catch (error) {
        if (isMissingFileError(error)) {
          return undefined;
        }
        console.warn(`[node-config] failed to read ${path}: ${error}`);
        return undefined;
      }
    },

    async save(config) {
      await writeNodeConfigFile(path, {
        ...config,
        profileDir,
        updatedAt: new Date().toISOString(),
      });
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

function tryMigrateNodeConfig(value: unknown, profileDir: string): PersistedNodeConfig | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const file = value as Record<string, unknown>;
  const defaults = createDefaultPersistedNodeConfig(profileDir);
  const merged: PersistedNodeConfig = {
    ...defaults,
    ...(file as Partial<PersistedNodeConfig>),
    version: "0.1",
    profileDir,
    discoveryProfile: isValidDiscoveryProfile(file.discoveryProfile)
        ? file.discoveryProfile
        : defaults.discoveryProfile,
    relayEnabled: typeof file.relayEnabled === "boolean" ? file.relayEnabled : defaults.relayEnabled,
    relayServerEnabled:
      typeof file.relayServerEnabled === "boolean" ? file.relayServerEnabled : defaults.relayServerEnabled,
    advertiseAddrs: Array.isArray(file.advertiseAddrs)
      ? file.advertiseAddrs.filter((a): a is string => typeof a === "string")
      : defaults.advertiseAddrs,
    bootstrapPeers: Array.isArray(file.bootstrapPeers)
      ? file.bootstrapPeers.filter((a): a is string => typeof a === "string")
      : defaults.bootstrapPeers,
    bootstrapPresets: Array.isArray(file.bootstrapPresets)
      ? file.bootstrapPresets.filter((a): a is string => typeof a === "string")
      : [...defaultBootstrapPresetsForDiscoveryProfile(
          isValidDiscoveryProfile(file.discoveryProfile) ? file.discoveryProfile : defaults.discoveryProfile,
        )],
    configuredRelays: Array.isArray(file.configuredRelays)
      ? (file.configuredRelays as RelayConfig[])
      : defaults.configuredRelays,
    modelProviders: isValidModelProviders(file.modelProviders)
      ? (file.modelProviders as ModelProviderConfig)
      : defaults.modelProviders,
    chatAssistEnabled:
      typeof file.chatAssistEnabled === "boolean" ? file.chatAssistEnabled : defaults.chatAssistEnabled,
    contactAiPreferences: Array.isArray(file.contactAiPreferences)
      ? (file.contactAiPreferences as ContactAiPreferences[])
      : defaults.contactAiPreferences,
    updatedAt: typeof file.updatedAt === "string" ? file.updatedAt : defaults.updatedAt,
  };
  if (merged.discoveryProfile === "contacts-only" || merged.discoveryProfile === "relay-only") {
    merged.bootstrapPresets = normalizeBootstrapPresetsForContactsOnly(merged.bootstrapPresets);
  }
  if (!isValidNodeConfig(merged)) {
    return undefined;
  }
  return merged;
}

export function describeNodeConfigValidationFailure(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return "not an object";
  }
  const file = value as Record<string, unknown>;
  if (file.version !== "0.1") {
    return `version=${String(file.version)} (expected "0.1")`;
  }
  if (typeof file.profileDir !== "string") {
    return "missing profileDir string";
  }
  if (!isValidDiscoveryProfile(file.discoveryProfile)) {
    return `discoveryProfile=${String(file.discoveryProfile)}`;
  }
  if (typeof file.relayEnabled !== "boolean") {
    return "missing relayEnabled boolean";
  }
  if (typeof file.relayServerEnabled !== "boolean") {
    return "missing relayServerEnabled boolean";
  }
  if (!Array.isArray(file.advertiseAddrs)) {
    return "missing advertiseAddrs array";
  }
  if (!Array.isArray(file.bootstrapPeers)) {
    return "missing bootstrapPeers array";
  }
  if (!Array.isArray(file.bootstrapPresets)) {
    return "missing bootstrapPresets array";
  }
  if (!Array.isArray(file.configuredRelays)) {
    return "missing configuredRelays array";
  }
  if (!isValidModelProviders(file.modelProviders)) {
    return `invalid modelProviders.mode=${String((file.modelProviders as Record<string, unknown> | undefined)?.mode)}`;
  }
  if (typeof file.chatAssistEnabled !== "boolean") {
    return "missing chatAssistEnabled boolean";
  }
  return "unknown validation failure";
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
  if (!isValidDiscoveryProfile(file.discoveryProfile)) {
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

/** Strip line and block comments so node-config.json can include JSONC-style guidance. */
export function stripJsonComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"') {
      out += ch;
      i += 1;
      while (i < text.length) {
        const current = text[i]!;
        out += current;
        if (current === "\\") {
          i += 1;
          if (i < text.length) {
            out += text[i]!;
            i += 1;
          }
          continue;
        }
        if (current === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length - 1 && !(text[i] === "*" && text[i + 1] === "/")) {
        i += 1;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

async function writeNodeConfigFile(path: string, config: PersistedNodeConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const payload = JSON.stringify(config, null, 2) + "\n";
  const tmp = join(dirname(path), `.node-config.${randomUUID()}.tmp`);
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
