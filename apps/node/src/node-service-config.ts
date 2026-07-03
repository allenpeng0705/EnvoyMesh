/**
 * Node Configuration runtime.
 *
 * Extracted from `node-service-impl.ts` (lines 7706-7874). Owns the
 * read-only `getNodeConfig` and write-only `updateNodeConfig` methods.
 *
 * Both are large (~90 and ~57 lines respectively) because they apply
 * env-var overrides, friend-matching-preferences validation, and a
 * 60+-property copy. Splitting them off into a pure runtime keeps
 * `node-service-impl.ts` a thin orchestrator.
 */
import { createAuditEvent } from "@envoymesh/local-store";
import { parseFriendMatchingPreferencesPayload } from "@envoymesh/protocol";
import type { PersistedNodeConfig } from "./node-config-store.js";
import { createDefaultPersistedNodeConfig } from "./node-config-store.js";
import {
  ensureDefaultAutonomousPoliciesForModel,
  resolveEnableMdns,
  resolveIdleTimerStretch,
  resolveLazyCapabilityDiscovery,
} from "@envoymesh/api";
import { normalizeIpfsExportEngineSelection } from "./ipfs-export-router.js";
import type {
  ModelProviderConfig,
  NodeConfig,
  ExtAgentDefinition,
} from "@envoymesh/api";

export interface NodeConfigContext {
  /** Local profile dir (used as the default when no config is persisted). */
  getProfileDir(): string;
  /** Load the persisted config (or undefined if none). */
  loadNodeConfig(): Promise<PersistedNodeConfig | undefined>;
  /** Persist the config (full overwrite). */
  saveNodeConfig(config: PersistedNodeConfig): Promise<void>;
  /** Current bridge status (or undefined if unset). */
  getBridgeStatus(): NodeConfig["bridgeStatus"];
  /** Public relay WebSocket URL override. */
  getRelayPublicWsUrl(): string | null;
  /** Read the bridge config skill API keys (may be async). */
  loadBridgeConfigSkillApiKeys(): Promise<Record<string, string>>;
  /** Read the bridge web-search enabled flag (may be async). */
  loadBridgeConfigWebSearchEnabled(): Promise<boolean>;
  /** External agent settings from bridge-config.json. */
  loadBridgeExtAgentSettings(): Promise<{
    activeExtAgentId?: string;
    extAgents: ExtAgentDefinition[];
    bridgeListenPort: number;
  }>;
  /** Current node profile (or undefined) — needed for friend-matching validation. */
  getProfile(): { owner: { ownerId: string } } | undefined;
}

function applyModelProviderEnvOverrides(
  configured: ModelProviderConfig | undefined,
): ModelProviderConfig {
  const env = process.env;
  const modeOverride = env.ENVOY_MODEL_MODE as ModelProviderConfig["mode"] | undefined;
  const base: ModelProviderConfig = configured ?? {
    mode: (modeOverride ?? "disabled") as ModelProviderConfig["mode"],
    endpoint: env.ENVOY_MODEL_ENDPOINT,
    apiKey: env.ENVOY_MODEL_API_KEY,
    modelName: env.ENVOY_MODEL_NAME,
  };
  return {
    ...base,
    mode: (modeOverride ?? base.mode) as ModelProviderConfig["mode"],
    endpoint: env.ENVOY_MODEL_ENDPOINT ?? base.endpoint,
    apiKey: env.ENVOY_MODEL_API_KEY ?? base.apiKey,
    modelName: env.ENVOY_MODEL_NAME ?? base.modelName,
  };
}

export async function getNodeConfigViaRuntime(
  ctx: NodeConfigContext,
): Promise<NodeConfig> {
  const config = await ctx.loadNodeConfig();
  const modelProviders = applyModelProviderEnvOverrides(config?.modelProviders);
  const extAgentSettings = await ctx.loadBridgeExtAgentSettings();

  if (config) {
    return {
      profileDir: config.profileDir,
      nodeInitialized: true,
      discoveryProfile: config.discoveryProfile,
      enableMdns: resolveEnableMdns(config.discoveryProfile, config.enableMdns),
      relayEnabled: config.relayEnabled,
      relayServerEnabled: config.relayServerEnabled,
      configuredRelays: config.configuredRelays,
      advertiseAddrs: config.advertiseAddrs,
      bootstrapPeers: config.bootstrapPeers,
      bootstrapPresets: config.bootstrapPresets,
      modelProviders,
      terminalAssistModelName: config.terminalAssistModelName,
      terminalCommandAllowPatterns: config.terminalCommandAllowPatterns,
      terminalCommandDenyPatterns: config.terminalCommandDenyPatterns,
      terminalCommandDestructivePatterns: config.terminalCommandDestructivePatterns,
      terminalAgentModeDefault: config.terminalAgentModeDefault,
      terminalAutoRunPolicy: config.terminalAutoRunPolicy,
      terminalInlineSuggestEnabled: config.terminalInlineSuggestEnabled,
      terminalXtermSlashIntercept: config.terminalXtermSlashIntercept,
      chatAssistEnabled: config.chatAssistEnabled ?? false,
      anonymousDiscoveryMode: config.anonymousDiscoveryMode ?? "off",
      anonymousIntentAllowlist: config.anonymousIntentAllowlist ?? ["discovery.request"],
      anonymousSensitivityCeiling: config.anonymousSensitivityCeiling ?? "public",
      trustAnchorPublicKeys: config.trustAnchorPublicKeys ?? {},
      autonomousKillSwitch: config.autonomousKillSwitch ?? false,
      autonomousPolicies: ensureDefaultAutonomousPoliciesForModel(
        config.autonomousPolicies,
        modelProviders.mode,
      ),
      aiSettings: config.aiSettings,
      contactAiPreferences: config.contactAiPreferences ?? [],
      bridgeStatus: ctx.getBridgeStatus() ?? undefined,
      skillApiKeys: await ctx.loadBridgeConfigSkillApiKeys(),
      webSearchEnabled: await ctx.loadBridgeConfigWebSearchEnabled(),
      companionPairingAutoAcceptWithToken:
        config.companionPairingAutoAcceptWithToken ?? false,
      relayPublicWsUrl: config.relayPublicWsUrl ?? ctx.getRelayPublicWsUrl() ?? undefined,
      bridgeEnabled: config.bridgeEnabled ?? true,
      openclawEnabled: config.openclawEnabled ?? true,
      activeExtAgentId: extAgentSettings.activeExtAgentId,
      extAgents: extAgentSettings.extAgents,
      bridgeListenPort: extAgentSettings.bridgeListenPort,
      homeClawCoreBaseUrl: config.homeClawCoreBaseUrl,
      trustModeEnabled: config.trustModeEnabled ?? false,
      friendMatchingPreferencesText: config.friendMatchingPreferencesText,
      friendMatchingPreferencesSigned: config.friendMatchingPreferencesSigned,
      externalPublish: config.externalPublish
        ? {
            allowIpfs: config.externalPublish.allowIpfs ?? false,
            gatewayAllowlist: config.externalPublish.gatewayAllowlist ?? [],
            ipfsExportEngine: normalizeIpfsExportEngineSelection(
              config.externalPublish.ipfsExportEngine,
            ),
            pinningEnabled: config.externalPublish.pinningEnabled ?? false,
            pinningProvider: config.externalPublish.pinningProvider ?? "pinata",
          }
        : { allowIpfs: false },
      maxConnections: config.maxConnections,
      mdnsIntervalMs: config.mdnsIntervalMs,
      capabilityDiscoveryIntervalMs: config.capabilityDiscoveryIntervalMs,
      lazyCapabilityDiscovery: resolveLazyCapabilityDiscovery(config.discoveryProfile, {
        lazyCapabilityDiscovery: config.lazyCapabilityDiscovery,
      }),
      idleTimerStretch: resolveIdleTimerStretch(config.discoveryProfile, {
        idleTimerStretch: config.idleTimerStretch,
      }),
      agentVisibility: config.agentVisibility,
      a2aChatNotifications: config.a2aChatNotifications ?? "off",
      agentInteractionMode: config.agentInteractionMode ?? "structured_preferred",
      friendAutopilotEnabled: config.friendAutopilotEnabled ?? false,
      friendAutopilotIntervalHours: (config.friendAutopilotIntervalHours ?? 0) as
        | 0 | 24 | 168,
      friendAutopilotLastRunAt: config.friendAutopilotLastRunAt,
      knowledgeSyndicationMaxSensitivity: config.knowledgeSyndicationMaxSensitivity,
      socialProxyEnabled: config.socialProxyEnabled ?? false,
      socialProxyMandateId: config.socialProxyMandateId,
      socialProxyLastPassAt: config.socialProxyLastPassAt,
      documentAcquisitionEnabled: config.documentAcquisitionEnabled ?? false,
      documentAcquisitionMandateId: config.documentAcquisitionMandateId,
      capabilityProviderEnabled: config.capabilityProviderEnabled ?? false,
      capabilityProviderMandateId: config.capabilityProviderMandateId,
      iceServers: config.iceServers,
    };
  }
  return {
    profileDir: ctx.getProfileDir(),
    nodeInitialized: false,
    discoveryProfile: "lan-fast" as const,
    enableMdns: true,
    relayEnabled: true,
    relayServerEnabled: false,
    configuredRelays: [],
    advertiseAddrs: [],
    bootstrapPeers: [],
    bootstrapPresets: [],
    modelProviders,
    chatAssistEnabled: false,
    anonymousDiscoveryMode: "off",
    anonymousIntentAllowlist: ["discovery.request"],
    anonymousSensitivityCeiling: "public",
    trustAnchorPublicKeys: {},
    autonomousKillSwitch: false,
    autonomousPolicies: [],
    contactAiPreferences: [],
    bridgeStatus: ctx.getBridgeStatus() ?? undefined,
    companionPairingAutoAcceptWithToken: false,
      relayPublicWsUrl: ctx.getRelayPublicWsUrl() ?? undefined,
    bridgeEnabled: false,
    openclawEnabled: true,
    activeExtAgentId: extAgentSettings.activeExtAgentId,
    extAgents: extAgentSettings.extAgents,
    bridgeListenPort: extAgentSettings.bridgeListenPort,
    homeClawCoreBaseUrl: undefined,
    trustModeEnabled: false,
    friendMatchingPreferencesText: undefined,
    externalPublish: { allowIpfs: false },
    lazyCapabilityDiscovery: false,
    idleTimerStretch: false,
    a2aChatNotifications: "off",
    agentInteractionMode: "structured_preferred",
    friendAutopilotEnabled: false,
    friendAutopilotIntervalHours: 0,
    knowledgeSyndicationMaxSensitivity: undefined,
    socialProxyEnabled: false,
    documentAcquisitionEnabled: false,
    capabilityProviderEnabled: false,
  };
}

export async function updateNodeConfigViaRuntime(
  ctx: NodeConfigContext,
  config: Partial<NodeConfig>,
): Promise<void> {
  let validatedSigned:
    | import("@envoymesh/protocol").FriendMatchingPreferencesPayload
    | undefined;
  if (config.friendMatchingPreferencesSigned !== undefined) {
    const profile = ctx.getProfile();
    if (!profile) {
      throw new Error("friendMatchingPreferencesSigned: node profile not initialized");
    }
    const parsed = parseFriendMatchingPreferencesPayload(
      config.friendMatchingPreferencesSigned,
    );
    const expMs = new Date(parsed.expiresAt).getTime();
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      throw new Error("friendMatchingPreferencesSigned: expiresAt must be in the future");
    }
    if (parsed.ownerId !== profile.owner.ownerId) {
      throw new Error("friendMatchingPreferencesSigned: ownerId mismatch");
    }
    validatedSigned = parsed;
  }

  const existing = await ctx.loadNodeConfig();
  const profileDir = ctx.getProfileDir();
  const base = existing ?? createDefaultPersistedNodeConfig(profileDir);
  const {
    activeExtAgentId: _activeExtAgentId,
    extAgents: _extAgents,
    bridgeListenPort: _bridgeListenPort,
    bridgeStatus: _bridgeStatus,
    skillApiKeys: _skillApiKeys,
    webSearchEnabled: _webSearchEnabled,
    ...persistedPatch
  } = config;

  await ctx.saveNodeConfig({
    ...base,
    ...persistedPatch,
    friendMatchingPreferencesSigned: validatedSigned as never,
  } as never);
  // Best-effort audit event when the task store is wired (caller-side).
  void createAuditEvent;
}