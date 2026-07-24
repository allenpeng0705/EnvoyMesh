import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadBundledNodeConfig } from "./bundled-node-config-loader.js";
import {
  defaultBootstrapPresetsForDiscoveryProfile,
  normalizeBootstrapPresetsForContactsOnly,
  ensureDefaultAutonomousPoliciesForModel,
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
  /**
   * Force a circuit-relay-v2 reservation on each configured relay at startup
   * so the local node stays inbound-reachable via /p2p-circuit/. Default true
   * when relayEnabled is true. Set false for ultra-low-memory nodes that
   * never expect to be dialed.
   */
  relayReservationEnabled?: boolean;
  advertiseAddrs: string[];
  bootstrapPeers: string[];
  bootstrapPresets: string[];
  configuredRelays: RelayConfig[];
  modelProviders: ModelProviderConfig;
  /** Optional model name override for terminal assist (Phase 30I). */
  terminalAssistModelName?: string;
  terminalCommandAllowPatterns?: readonly string[];
  terminalCommandDenyPatterns?: readonly string[];
  terminalCommandDestructivePatterns?: readonly string[];
  terminalAgentModeDefault?: boolean;
  terminalAutoRunPolicy?: import("@envoymesh/api").TerminalAutoRunPolicy;
  terminalInlineSuggestEnabled?: boolean;
  /** Opt-in: intercept /envoy in Manual xterm input (Phase 31D). */
  terminalXtermSlashIntercept?: boolean;
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
  /**
   * Owner-attested Agent Network profile (advertised when capability provider on).
   */
  agentNetworkProfile?: import("@envoymesh/protocol").AgentNetworkProfile;
  /** Phase 19 — bond autonomy posture (agent-driven bond acceptance). */
  bondAutonomyEnabled?: boolean;
  bondAutonomyMandateId?: string;
  bondAutonomyMaxAutoBondsPerDay?: number;
  bondAutonomyRequireReferralProof?: boolean;
  bondAutonomyMaxAutoBondTier?: "referred" | "direct";
  bondAutonomyMinTrustOverlapScore?: number;
  bondAutonomyNotifyOwnerOnAutoBond?: boolean;
  /** When set, only auto-accept when inbound proofOfContext matches. */
  bondAutonomySponsorProofToken?: string;
  /** Phase 23C — bond steward dormant threshold in days. */
  dormantBondThresholdDays?: number;
  /** Phase 23C — auto-nudge owner about dormant bonds. */
  autoNudgeDormantBonds?: boolean;
  /** Phase 25D — intent prediction enabled. */
  intentPredictionEnabled?: boolean;
  /** Phase 25D — max prefetch results for intent prediction. */
  prefetchMaxResults?: number;
  /** Phase 32 — whether the built-in OpenClaw agent (EnvoyAI) is enabled. */
  openclawEnabled?: boolean;
  /** Phase 33 — max age of a cached agent card before the auto-fetcher re-issues a request. Default 24h. */
  agentCardAutoFetchMaxAgeMs?: number;
  /**
   * Phase 35C — opt-in LAN auto-bond. When true, two home nodes on the same
   * network with matching `lanAutoBondFleetToken` automatically bond as
   * "direct" trust on first mDNS contact. **Default: false.** This is a fleet
   * onboarding lever for company LANs; it must never be enabled by default.
   */
  lanAutoBondEnabled?: boolean;
  /**
   * Phase 35C — shared fleet secret used to gate LAN auto-bond. A node will
   * only auto-bond with another node whose envelope carries the same value.
   * Empty/undefined = never auto-bond, even when `lanAutoBondEnabled` is true.
   */
  lanAutoBondFleetToken?: string;
  /**
   * Phase 35C — last time the LAN auto-bond loop ran (ISO 8601). Used for
   * backoff and audit dedup; the field is informational and not part of any
   * user-facing UI.
   */
  lanAutoBondLastRunAt?: string;
  /**
   * Phase 35D — opt-in pairing-kiosk HTTP server. Default: false (off).
   * When false, the home node does not start the kiosk endpoint regardless
   * of any other kiosk* setting.
   */
  pairingKioskEnabled?: boolean;
  /** Phase 35D — bearer token the kiosk's `POST /pair` checks. Required when enabled. */
  pairingKioskAdminToken?: string;
  /** Phase 35D — bind address. Default 127.0.0.1 (loopback). */
  pairingKioskBindAddress?: string;
  /** Phase 35D — bind port. Default 3737. */
  pairingKioskPort?: number;
  /**
   * Phase 35D — when true, the kiosk is allowed to bind to a non-loopback
   * address. The `kioskEnabled` flag must still be on. Default: false.
   */
  pairingKioskAllowLanBind?: boolean;
  /**
   * Phase 35D — optional ISO 8601 expiry for the kiosk. After this point the
   * endpoint starts returning HTTP 410 instead of serving the page.
   */
  pairingKioskExpiresAt?: string;
  /**
   * Phase 38 — WebRTC ICE servers (STUN/TURN) for voice/video calls.
   * When unset, the default set of public STUN servers is used.
   * Set to an empty array to use no ICE servers (Path 1 / LAN only).
   */
  iceServers?: { urls: string; username?: string; credential?: string }[];
  /** Phase 42 — enable LLM cost estimation in chainPlan. Default false (no LLM cost). */
  chainCostEstimationEnabled?: boolean;
  /** Zero-step first friend on first setup (distributor installer). */
  setupSponsorFriendEnabled?: boolean;
  setupSponsorFriendContactUri?: string;
  setupSponsorFriendOwnerId?: string;
  setupSponsorFriendPeerId?: string;
  setupSponsorFriendJoinToken?: string;
  setupSponsorFriendDisplayName?: string;
  setupSponsorFriendHelloMessage?: string;
  setupSponsorFriendProofOfContext?: string;
  setupSponsorFriendMaxAttempts?: number;
  setupSponsorFriendRetryDelayMs?: number;
  setupSponsorFriendCooldownMs?: number;
  setupSponsorFriendCompletedAt?: string;
  setupSponsorFriendLastError?: string;
  /** Classified failure kind for the last error — drives the UI hint.
   *  See `classifySponsorError` in `node-service-setup-sponsor-friend.ts`. */
  setupSponsorFriendLastErrorKind?:
    | "network-unreachable"
    | "proof-token-mismatch"
    | "profile-not-ready"
    | "mesh-not-ready"
    | "protocol-mismatch"
    | "sponsor-no-ack"
    | "other";
  setupSponsorFriendAttempts?: number;
  /** ISO timestamp until which auto-retry is paused. Set by the runtime
   *  when the loop exhausts `maxAttempts`. The tile shows a countdown
   *  and the auto-trigger gate is closed until this time. */
  setupSponsorFriendCooldownUntil?: string;
  /** Why a sponsor hello was skipped (not started, not auto-retrying).
   *  Mirrors `SetupSponsorFriendState.skipReason`. */
  setupSponsorFriendSkipReason?: string;
  /** ISO timestamp of the last attempt start (whether it succeeded or
   *  failed). Useful for the UI to show "last tried X minutes ago". */
  setupSponsorFriendLastAttemptAt?: string;

  /** Phase 48A — MCP Tool Consumer. Configures external MCP servers
   *  whose tools become callable via mesh.mcp.call_tool. */
  mcpConsumers?: Array<{
    name: string;
    transport: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    requestTimeoutMs?: number;
  }>;

  /** Phase 48C — A2A Agent Card Bridge. When enabled, publishes the
   *  node's Agent Card at /.well-known/agent-card.json in A2A v1.0
   *  format so external A2A clients can discover this agent.
   *  Phase 48D — also hosts the A2A JSON-RPC endpoint that lets
   *  external clients `message/send`, `tasks/get`, `tasks/cancel`. */
  a2aBridge?: {
    enabled: boolean;
    /** Public gateway URL where the A2A JSON-RPC endpoint is reachable
     *  (e.g. "https://relay.example.com:15432"). */
    gatewayUrl?: string;
    /** Bearer tokens → ownerId mappings. Each inbound A2A request
     *  must carry `Authorization: Bearer <token>` and the token is
     *  resolved to an EnvoyMesh ownerId. The owner's Bond tier +
     *  mandates + audit all use this ownerId. */
    bearerTokens?: Array<{
      token: string;
      ownerId: string;
      label?: string;
    }>;
    /** HTTP path that the JSON-RPC endpoint is mounted at on this
     *  node's local bridge HTTP server. Default `/a2a/jsonrpc`. */
    homeA2aPath?: string;
  };
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
    relayReservationEnabled: true,
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
          const normalized = withDefaultAutonomousPolicies(parsed);
          if (autonomousPoliciesChanged(parsed, normalized)) {
            await writeNodeConfigFile(path, normalized);
          }
          return normalized;
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
          // No profile-dir copy yet — try the bundled default from the
          // desktop app's resource dir. This is the path that turns a fresh
          // install into a working mesh on first launch (CN relay preset,
          // standard bootstrap presets, wan-default profile) instead of
          // leaving the user staring at "libp2p mesh offline until first-run
          // setup writes node-config.json" until they manually opt in via
          // Settings. The profile-dir copy is the source of truth once
          // written; we DON'T auto-write the bundled config to disk —
          // saving happens only on user-initiated save() (Settings → Network).
          // This keeps the bundled config a pure default the user can compare
          // against via git, rather than a copy that drifts.
          const bundled = await loadBundledNodeConfig(process.env.ENVOYMESH_NODE_BUNDLE_DIR);
          if (bundled) {
            // Override profileDir with the actual runtime profile dir —
            // the bundled file is canonical for the other fields, but the
            // user's actual profile dir is canonical for where state lives.
            return { ...bundled, profileDir, updatedAt: new Date().toISOString() };
          }
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
    relayReservationEnabled:
      typeof file.relayReservationEnabled === "boolean"
        ? file.relayReservationEnabled
        : defaults.relayReservationEnabled,
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
  merged.autonomousPolicies = ensureDefaultAutonomousPoliciesForModel(
    merged.autonomousPolicies,
    merged.modelProviders.mode,
  );
  if (!isValidNodeConfig(merged)) {
    return undefined;
  }
  return merged;
}

function withDefaultAutonomousPolicies(config: PersistedNodeConfig): PersistedNodeConfig {
  const autonomousPolicies = ensureDefaultAutonomousPoliciesForModel(
    config.autonomousPolicies,
    config.modelProviders.mode,
  );
  if (!autonomousPoliciesChanged(config, { ...config, autonomousPolicies })) {
    return config;
  }
  return { ...config, autonomousPolicies };
}

function autonomousPoliciesChanged(
  before: PersistedNodeConfig,
  after: PersistedNodeConfig,
): boolean {
  return JSON.stringify(before.autonomousPolicies ?? []) !== JSON.stringify(after.autonomousPolicies ?? []);
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

export function isValidNodeConfig(value: unknown): value is PersistedNodeConfig {
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
