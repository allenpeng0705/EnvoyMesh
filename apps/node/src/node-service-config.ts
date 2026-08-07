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
  isConnectivityMode,
  normalizeAiBotsList,
  resolveConnectivityPreset,
  resolveConnectivityTuning,
  resolveEnableMdns,
  resolveIdleTimerStretch,
  resolveLazyCapabilityDiscovery,
  type AiBotDefinition,
  type ConnectivityMode,
  type ExtAgentDefinition,
  type ModelProviderConfig,
  type NodeConfig,
} from "@envoymesh/api";
import { normalizeIpfsExportEngineSelection } from "./ipfs-export-router.js";

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
    const tuning = resolveConnectivityTuning({
      connectivityMode: config.connectivityMode,
      maxConnections: config.maxConnections,
      mdnsIntervalMs: config.mdnsIntervalMs,
      capabilityDiscoveryIntervalMs: config.capabilityDiscoveryIntervalMs,
      lazyCapabilityDiscovery: config.lazyCapabilityDiscovery,
      idleTimerStretch: config.idleTimerStretch,
    });
    return {
      profileDir: config.profileDir,
      nodeInitialized: true,
      discoveryProfile: config.discoveryProfile,
      enableMdns: resolveEnableMdns(config.discoveryProfile, config.enableMdns, tuning),
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
      piEnabled: config.piEnabled ?? true,
      piSettings: config.piSettings,
      aiBots: config.aiBots ?? [],
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
      connectivityMode: (tuning.connectivityMode ?? "optimized") as ConnectivityMode,
      connectivityModeExplicit: config.connectivityModeExplicit === true,
      connectivityModeAutoAppliedReason: config.connectivityModeAutoAppliedReason,
      maxConnections: tuning.maxConnections,
      mdnsIntervalMs: tuning.mdnsIntervalMs,
      capabilityDiscoveryIntervalMs: tuning.capabilityDiscoveryIntervalMs,
      lazyCapabilityDiscovery: resolveLazyCapabilityDiscovery(config.discoveryProfile, tuning),
      idleTimerStretch: resolveIdleTimerStretch(config.discoveryProfile, tuning),
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
      agentNetworkProfile: config.agentNetworkProfile,
      lanAutoBondEnabled: config.lanAutoBondEnabled ?? false,
      lanAutoBondFleetToken: config.lanAutoBondFleetToken,
      lanAutoBondAutoJoinAgentNetwork: config.lanAutoBondAutoJoinAgentNetwork,
      bondAutonomyEnabled: config.bondAutonomyEnabled ?? false,
      bondAutonomyMandateId: config.bondAutonomyMandateId,
      bondAutonomyMaxAutoBondsPerDay: config.bondAutonomyMaxAutoBondsPerDay,
      bondAutonomyRequireReferralProof: config.bondAutonomyRequireReferralProof,
      bondAutonomyMaxAutoBondTier: config.bondAutonomyMaxAutoBondTier,
      bondAutonomyMinTrustOverlapScore: config.bondAutonomyMinTrustOverlapScore,
      bondAutonomyNotifyOwnerOnAutoBond: config.bondAutonomyNotifyOwnerOnAutoBond,
      bondAutonomySponsorProofToken: config.bondAutonomySponsorProofToken,
      setupSponsorFriendEnabled: config.setupSponsorFriendEnabled ?? false,
      setupSponsorFriendContactUri: config.setupSponsorFriendContactUri,
      setupSponsorFriendOwnerId: config.setupSponsorFriendOwnerId,
      setupSponsorFriendPeerId: config.setupSponsorFriendPeerId,
      setupSponsorFriendJoinToken: config.setupSponsorFriendJoinToken,
      setupSponsorFriendDisplayName: config.setupSponsorFriendDisplayName,
      setupSponsorFriendHelloMessage: config.setupSponsorFriendHelloMessage,
      setupSponsorFriendProofOfContext: config.setupSponsorFriendProofOfContext,
      setupSponsorFriendMaxAttempts: config.setupSponsorFriendMaxAttempts,
      setupSponsorFriendRetryDelayMs: config.setupSponsorFriendRetryDelayMs,
      setupSponsorFriendCompletedAt: config.setupSponsorFriendCompletedAt,
      setupSponsorFriendLastError: config.setupSponsorFriendLastError,
      setupSponsorFriendAttempts: config.setupSponsorFriendAttempts,
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
    bridgeEnabled: true,
    openclawEnabled: true,
    piEnabled: true,
    piSettings: undefined,
    aiBots: [],
    activeExtAgentId: extAgentSettings.activeExtAgentId,
    extAgents: extAgentSettings.extAgents,
    bridgeListenPort: extAgentSettings.bridgeListenPort,
    homeClawCoreBaseUrl: undefined,
    trustModeEnabled: false,
    friendMatchingPreferencesText: undefined,
    externalPublish: { allowIpfs: false },
    connectivityMode: "optimized",
    maxConnections: 48,
    mdnsIntervalMs: 45_000,
    capabilityDiscoveryIntervalMs: 120_000,
    lazyCapabilityDiscovery: true,
    idleTimerStretch: true,
    a2aChatNotifications: "off",
    agentInteractionMode: "structured_preferred",
    friendAutopilotEnabled: false,
    friendAutopilotIntervalHours: 0,
    knowledgeSyndicationMaxSensitivity: undefined,
    socialProxyEnabled: false,
    documentAcquisitionEnabled: false,
    capabilityProviderEnabled: false,
    lanAutoBondEnabled: false,
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

  // When the resource mode changes, materialize preset knobs so restart picks them up
  // even if older override fields were previously saved. Operator-initiated mode
  // changes mark the choice as explicit so CGNAT auto-apply will not override it.
  if (isConnectivityMode(persistedPatch.connectivityMode)) {
    const preset = resolveConnectivityPreset(persistedPatch.connectivityMode);
    Object.assign(persistedPatch, {
      maxConnections: preset.maxConnections,
      mdnsIntervalMs: preset.mdnsIntervalMs,
      capabilityDiscoveryIntervalMs: preset.capabilityDiscoveryIntervalMs,
      lazyCapabilityDiscovery: preset.lazyCapabilityDiscovery,
      idleTimerStretch: preset.idleTimerStretch,
      connectivityModeExplicit: true,
      connectivityModeAutoAppliedReason: undefined,
    });
  }

  await ctx.saveNodeConfig({
    ...base,
    ...persistedPatch,
    // Normalize free-form bot personality/description so all clients share
    // a stable first-person character prompt.
    ...(Array.isArray(config.aiBots)
      ? { aiBots: normalizeAiBotsList(config.aiBots as AiBotDefinition[]) }
      : {}),
    // Only overwrite signed matching prefs when the patch explicitly set them.
    // Otherwise every unrelated update (e.g. aiBots) would clear the field.
    ...(config.friendMatchingPreferencesSigned !== undefined
      ? { friendMatchingPreferencesSigned: validatedSigned as never }
      : {}),
  } as never);
  // Best-effort audit event when the task store is wired (caller-side).
  void createAuditEvent;
}