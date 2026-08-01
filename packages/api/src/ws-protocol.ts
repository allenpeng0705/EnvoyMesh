/**
 * WebSocket API Protocol for NodeService
 *
 * The social app connects to the node via WebSocket and sends commands
 * using this protocol. All messages are JSON.
 *
 * Message Flow:
 *
 * 1. Client -> Server: RPC request
 *    { id: "msg_123", method: "sendHello", params: { ... } }
 *
 *    Server -> Client: RPC response
 *    { id: "msg_123", result: { decision: "accept" } }
 *    or
 *    { id: "msg_123", error: { code: "NOT_IMPLEMENTED", message: "..." } }
 *
 * 2. Client -> Server: Subscribe to events
 *    { id: "sub_456", method: "on", params: { event: "hello:request" } }
 *
 *    Server -> Client: Event (no id, since it's a push)
 *    { event: "hello:request", data: { ... } }
 *
 *    Client -> Server: Unsubscribe
 *    { id: "sub_456", method: "off", params: { event: "hello:request" } }
 *
 * 3. Connection status (server pushes on connect)
 *    { event: "connected", data: { peerId: "...", multiaddrs: [...] } }
 */

import type { DeviceProfile, DeviceRevocationReason, DeviceRevocationRecord, FriendMatchingPreferencesPayload, ChainIterationWire } from "@envoymesh/protocol";
import type { AgentVisibilityConfig, A2aChatNotificationMode } from "./agent-visibility.js";
import type { ExtAgentDefinition } from "./ext-agent.js";
export type { ExtAgentDefinition, ExtAgentReachability } from "./ext-agent.js";
export { defaultExtAgentStartHint } from "./ext-agent.js";
import type { PiSettings } from "./pi-agent.js";
import type { AiBotDefinition } from "./ai-bot.js";
// Re-export so ws-protocol consumers (e.g. node-service.ts) can import PiStatus
// from here, matching how OpenClawStatus is co-located in this file.
export type {
  PiStatus,
  PiRuntimeState,
  PiPromptResult,
  PiModelOverride,
  PiSettings,
  GetPiStatusParams,
  GetPiStatusResult,
  RestartPiParams,
  RestartPiResult,
  SendToPiParams,
  SendToPiResult,
  PiToolProposal,
  PiProposalEvent,
  PiRespondToProposalParams,
  PiRespondToProposalResult,
} from "./pi-agent.js";

// ============================================
// Message Types
// ============================================

export type JsonRpcRequest = {
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  id: string;
  result?: unknown;
  error?: JsonRpcError;
};

export type JsonRpcError = {
  code: string;
  message: string;
};

export type JsonRpcEvent = {
  event: string;
  data: unknown;
};

// ============================================
// Protocol Constants
// ============================================

export const WS_PROTOCOL_VERSION = "envoy/ws-api/0.1.0";

export const WS_PORT = 3030;
export const WS_PATH = "/ws";
/** Desktop Social default — use IPv4 loopback (macOS resolves `localhost` to ::1). */
export const WS_LOOPBACK_URL = `ws://127.0.0.1:${WS_PORT}${WS_PATH}`;

// ============================================
// RPC Methods
// ============================================

export type RpcMethods =
  // Identity
  | "getProfile"
  | "getOwnerDidPresentation"
  | "resolveDidImport"
  | "cacheDidContactKey"
  | "getPeerReputationSummary"
  | "getHumanProfile"
  | "updateHumanProfile"
  | "setPublicProfileThumbnail"
  | "upsertProfileGalleryPhoto"
  | "removeProfileGalleryPhoto"
  | "updateProfileGalleryPhotoVisibility"
  | "getPeerProfile"
  | "listPeerProfiles"
  | "requestPeerProfile"
  | "syncProfileToBonds"
  | "refreshBondPeerProfiles"
  | "getAgentIdentity"
  | "updateAgentIdentity"
  // Bond Management
  | "sendHello"
  | "acceptHello"
  | "declineHello"
  | "blockPeer"
  | "unblockPeer"
  | "revokeBond"
  | "getBonds"
  | "listPendingSocialIntroProposals"
  | "approveSocialIntroCommitment"
  | "declineSocialIntroProposal"
  // Messaging
  | "sendChat"
  | "sendAgentChat"
  | "sendChatAttachment"
  | "readLibraryItemContent"
  | "listChatHistory"
  | "listChatRooms"
  | "createChatRoom"
  | "inviteToChatRoom"
  | "leaveChatRoom"
  | "removeMembersFromChatRoom"
  | "renameChatRoom"
  | "dismissChatRoom"
  | "sendChatRoomMessage"
  | "sendChatRoomAttachment"
  | "listAgentActivity"
  | "listCommerceReceipts"
  | "recordCommerceReceipt"
  | "listAuditEvents"
  | "listTaskJournalEntries"
  | "getCostSummary"
  | "runCostRollupRetention"
  | "listAgentCards"
  | "getAgentCard"
  | "requestAgentCard"
  | "refreshAgentNetworkWorkers"
  | "getTaskResult"
  | "listPendingApprovals"
  | "approvePendingApproval"
  | "rejectPendingApproval"
  | "deleteChatMessage"
  | "clearChatHistory"
  | "markRead"
  | "getChatDrafts"
  | "deleteChatDraft"
  // Search
  | "searchPeers"
  | "advertiseTopic"
  | "stopAdvertiseTopic"
  // Capability Manifest
  | "getCapabilityManifest"
  | "updateCapabilityManifest"
  // File Sharing
  | "shareFile"
  | "acceptShare"
  | "declineShare"
  | "listPendingShareOffers"
  | "listLibraryItems"
  | "listAllLocalFiles"
  | "readLocalFileContent"
  | "openLocalFile"
  | "setLibraryItemPublished"
  | "exportLibraryItemToIpfs"
  | "pinLibraryItemExternal"
  | "getIpfsEngineStatus"
  | "getRagIndexStatus"
  | "verifyLibraryItemIpfsGateway"
  | "importToLibrary"
  | "resolveLibraryItemPath"
  | "openLibraryItem"
  | "revealLibraryItemInFileManager"
  | "discoverPublishedLibrary"
  | "libraryRead"
  | "publishWebContentEntry"
  | "ensureDefaultWebSite"
  | "listWebContentSections"
  | "listFeedPosts"
  | "listFeedTimeline"
  | "listBlogPosts"
  | "deleteWebContentEntry"
  | "listFeedNotifications"
  | "dismissFeedNotification"
  | "dismissAllFeedNotifications"
  | "listContentEngageNotifications"
  | "dismissContentEngageNotifications"
  | "getContentEngagement"
  | "toggleContentStar"
  | "addContentComment"
  | "removeContentComment"
  | "listAgentShareProposals"
  | "dismissAgentShareProposal"
  | "submitAgentShareProposal"
  | "createNote"
  | "deleteVaultItem"
  // Connection Status
  | "getConnectionStatus"
  | "getPeerConnectionInfo"
  | "warmContactConnection"
  | "getChatDiagnostics"
  | "getConnectivityDiagnostics"
  | "getCircuitReservationStatus"
  | "getBootstrapPeers"
  | "runCapabilityDiscovery"
  | "discoverCapabilityTopic"
  | "getMorningReport"
  |   "requestMultiHopDiscovery"
  | "getMultiHopDiscoverySession"
  | "sendSyncStateUpdate"
  // AI / Knowledge Query
  | "knowledgeQuery"
  | "draftAuthorContent"
  | "runDocumentAgentTurn"
  | "runOwnerAgentTurn"
  | "listSocialProxySessions"
  | "runSocialProxyPass"
  | "cancelSocialProxySession"
  | "listAgentCircles"
  | "createAgentCircle"
  | "updateAgentCircle"
  | "deleteAgentCircle"
  | "chatRagSearch"
  | "discoverAndCluster"
  | "meshIntelligenceReport"
  | "proposeAgentCircles"
  | "startDocumentAcquisitionJob"
  | "getDocumentAcquisitionJob"
  | "listDocumentAcquisitionJobs"
  | "cancelDocumentAcquisitionJob"
  | "listActiveTransfers"
  | "getTransferStatus"
   // Agent Bridge
   | "getBridgeStatus"
   | "getOpenClawStatus"
   | "restartOpenClaw"
   | "probeExtAgent"
   // Phase 49 — Pi (built-in local coding agent)
   | "getPiStatus"
   | "restartPi"
   | "ensurePiTerminalSession"
   // ClawHub skills
   | "getOpenClawPlugins"
    | "searchOpenClawPlugins"
    | "getTrendingOpenClawPlugins"
    | "installOpenClawPlugin"
   | "uninstallOpenClawPlugin"
    | "saveClawhubToken"
    | "saveWebSearchEnabled"
    | "sendToOpenClaw"
    | "sendToPi"
    | "sendToAiBot"
    | "piRespondToProposal"
    | "sendToBridge"
    | "getPairedDiagnostics"
    | "saveSkillApiKeys"
   // OpenClaw extension/plugin management
   | "listOpenClawExtensionPlugins"
   | "inspectOpenClawExtensionPlugin"
   | "enableOpenClawExtensionPlugin"
   | "disableOpenClawExtensionPlugin"
   | "installOpenClawExtensionPlugin"
   | "uninstallOpenClawExtensionPlugin"
   | "updateOpenClawExtensionPlugin"
   | "getPairingPayload"
  | "createWanJoinInvite"
  | "applyWanJoinInvite"
  | "createCompanyInvite"
  | "listCompanyInvites"
  | "revokeCompanyInvite"
  | "redeemCompanyInvite"
  | "createFamilyProfile"
  | "updateFamilyProfile"
  | "deleteFamilyProfile"
  | "wipeFamilyProfile"
  | "listFamilyProfiles"
  | "generateFamilyInviteToken"
  | "sendFamilyMessage"
  | "listFamilyRooms"
  | "createFamilyRoom"
  | "sendFamilyRoomMessage"
  | "syncPairingKioskFromConfig"
  | "getPairingKioskStatus"
  | "importFleetManifest"
  | "listFleetManifests"
  | "revokeFleetManifest"
  | "createFleetManifest"
  | "pairDevice"
  | "pairSharedIdentity"
  | "pairWithHomeNode"
  | "pairThinClient"
  | "previewFamilyInvite"
  | "repairSessionProfile"
  | "updateMyListenAddrs"
  | "listAuthorizedDevices"
  | "revokeAuthorizedDevice"
  | "mergeAuthorizedDevices"
  | "pruneRevokedDevices"
  | "listDeviceRevocations"
  // Node Configuration
  | "getNodeConfig"
  | "updateNodeConfig"
   | "getSetupSponsorFriendConfig"
   | "getSetupSponsorFriendStatus"
  | "runSetupSponsorFriend"
  | "listRelays"
  | "addRelay"
  | "removeRelay"
  // Node Lifecycle
  | "initNode"
  | "getNodeStatus"
  | "startNode"
  | "stopNode"
  // P2P relay — forward a pre-signed envelope from a remote client
  | "forwardEnvelope"
  /** HTTP proxy from mobile Companion to HomeClaw Core on the home LAN (SSR-safe paths only). */
  | "homeclawCoreProxy"
  // HomeClaw Core WebSocket tunnel
  | "homeClawCoreWsOpen"
  | "homeClawCoreWsSend"
  | "homeClawCoreWsClose"
  // Terminals (Phase 30)
  | "listTerminalSessions"
  | "createTerminalSession"
  | "closeTerminalSession"
  | "renameTerminalSession"
  | "terminalAttach"
  | "terminalRunFromNaturalLanguage"
  | "terminalExecuteProposal"
  | "terminalSetAssistModelOverride"
  | "terminalGetAssistState"
  | "terminalExplainScrollback"
  | "terminalSuggestCommand"
  | "terminalObserveStep"
  | "terminalSetInlineSuggestEnabled"
  | "terminalOpenClawPlan"
  | "terminalRunPlanStep"
  | "terminalEnablePrepareMode"
  | "terminalWatchStep"
  | "terminalPinContextSession"
  | "terminalDetectFailure"
  | "terminalSuggestFixFromFailure"
  | "terminalStartGoalLoop"
  | "terminalAdvanceGoalLoop"
  | "terminalCancelGoalLoop"
  | "terminalClearResumeGoal"
  | "terminalSendContextToAssistant"
  | "terminalUpdatePlanProgress"
  | "terminalGetScrollbackPreview"
  | "terminalResumeGoalLoop"
  | "terminalEnableExecPane"
  | "terminalSetBackgroundWatch"
  | "terminalClearBackgroundWatch"
  | "openInHerdr"
  | "terminalGetHerdrExportHint"
  | "homeTerminalWsOpen"
  | "homeTerminalWsSend"
  | "terminalExec"
  | "homeTerminalWsClose"
  // Event subscription
  | "on"
  | "off"
  // Legacy snake_case variants (mobile app compat)
  | "home_claw_core_ws_open"
  | "home_claw_core_ws_send"
   | "home_claw_core_ws_close"
   // Phase 38 — Voice/Video Calls
   | "sendCallInvite"
   | "sendCallReinvite"
   | "acceptCallInvite"
   | "declineCallInvite"
   | "endCall"
   | "setCallMuted"
   | "sendIceCandidate"
   // Phase 31I — Push Notifications
   | "registerPushToken"
   | "unregisterPushToken"
  // Phase 40 — Agent Network Collaboration Layer
  | "chainPlan"
  | "chainLaunch"
  | "chainGetState"
  | "chainListActive"
  | "chainCancel"
  | "chainListReports"
  | "chainGetReport"
  | "chainPinReport"
  | "chainSetBidStrategy"
  | "chainGetBidStrategy"
  | "chainEvaluateBids"
  | "chainCounterBid"
  | "chainRebalance"
  | "chainGetDefaults"
  | "chainSetDefaults"
  | "chainPreviewGoal"
  | "chainStartFromGoal"
  | "chainResolveIteration"
  | "chainExportCosts"
  | "chainListRecipes"
  | "chainSaveRecipe"
  | "chainDeleteRecipe"
  // Phase 44C — Knowledge Base Plugins
  | "listKbPlugins"
  | "activateKbPlugin"
  | "deactivateKbPlugin"
  | "getKbPluginConfig"
  | "updateKbPluginConfig";

// ============================================
// Node Configuration Types
// ============================================

export interface RelayConfig {
  relayId: string;
  addr: string;
  level?: number;
  region?: string;
  enabled: boolean;
}

/** Params for RPC method `homeclawCoreProxy` — path is `/api/...` style including optional `?query`. */
export interface HomeClawCoreProxyParams {
  method: string;
  path: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
  /** Upstream fetch timeout (ms). Clamped 1s–4h. Default 175s. */
  timeoutMs?: number;
}

/** Packed HTTP response returned to Companion over JSON-RPC (`bodyBase64` when present). */
export interface HomeClawCoreProxyResult {
  status: number;
  headers: Record<string, string>;
  bodyBase64?: string;
  error?: string;
}

/** Policy for optional external distribution (IPFS gateways, etc.). */
export interface ExternalPublishConfig {
  /** Master gate for IPFS export RPC/CLI paths. Default false. */
  allowIpfs: boolean;
  /** Optional HTTP gateway host allowlist for future fetch helpers; empty = deny automated gateway use. */
  gatewayAllowlist?: string[];
  /** Active IPFS export engine. Default "kubo". Helia is in-process (desktop H6+, mobile H5+). */
  ipfsExportEngine?: "kubo" | "helia" | "kubo-with-helia-shadow";
  /** When true, allow explicit pin-to-provider RPC after export (requires provider JWT env). */
  pinningEnabled?: boolean;
  /** Pinning provider when enabled. Default `pinata`. */
  pinningProvider?: import("./ipfs-pinning.js").IpfsPinningProvider;
}

export interface NodeConfig {
  profileDir: string;
  /** False when `node-config.json` has not been written yet (first-run setup pending). */
  nodeInitialized?: boolean;
  discoveryProfile: DiscoveryProfile;
  enableMdns?: boolean; // mDNS for local discovery (default true)
  relayEnabled: boolean;
  relayServerEnabled: boolean;
  configuredRelays: RelayConfig[];
  advertiseAddrs: string[];
  bootstrapPeers: string[];
  bootstrapPresets: string[];
  /** Model provider configuration. Default: mock provider only. */
  modelProviders: ModelProviderConfig;
  /** Optional model name override for terminal assist (Phase 30I). Falls back to modelProviders.modelName. */
  terminalAssistModelName?: string;
  /** Regex patterns — matching commands are treated as safe (owner allowlist). */
  terminalCommandAllowPatterns?: readonly string[];
  /** Regex patterns — matching commands are treated as destructive (owner denylist). */
  terminalCommandDenyPatterns?: readonly string[];
  terminalCommandDestructivePatterns?: readonly string[];
  /** Default Agent mode when opening a terminal session. */
  terminalAgentModeDefault?: boolean;
  /** Auto-run policy for safe read-only proposals. Default: always-confirm. */
  terminalAutoRunPolicy?: import("./terminal-agent.js").TerminalAutoRunPolicy;
  /** Enable inline command suggestions in Manual mode by default. */
  terminalInlineSuggestEnabled?: boolean;
  /** Opt-in /envoy intercept in Manual xterm (Phase 31D). */
  terminalXtermSlashIntercept?: boolean;
  /** Enable LLM-assisted chat drafts. Default: false (disabled). */
  chatAssistEnabled: boolean;
  /**
   * Anonymous discovery mode — controls how the node responds to unknown/public peers.
   * Default: "off" (anonymous discovery disabled).
   */
  anonymousDiscoveryMode: AnonymousDiscoveryMode;
  /**
   * EMP intent allowlist for anonymous/public requests.
   * If undefined, only discovery.request is allowed anonymously.
   */
  anonymousIntentAllowlist?: readonly string[];
  /**
   * Sensitivity ceiling for anonymous auto-answer (public-auto-answer mode).
   * Default: "public".
   */
  anonymousSensitivityCeiling: "public" | "friends";
  /**
   * Trusted anchor public keys for verifying official credentials.
   * Maps anchorId → PEM-encoded public key.
   */
  trustAnchorPublicKeys: Record<string, string>;
  /**
   * Master kill switch: when true, all autonomous actions are paused.
   * The node will require explicit approval for any action it would otherwise take autonomously.
   */
  autonomousKillSwitch: boolean;
  /**
   * Per-domain autonomous policies defining what the node may do without prompting the owner.
   * Each policy applies to a domain and defines sensitivity ceilings for autonomous responses.
   */
  autonomousPolicies: AutonomousPolicy[];
  /**
   * AI Assistant settings — identity mode, online/offline behavior, and defaults.
   */
  aiSettings?: AiSettings;
  /**
   * Per-contact AI preferences — defines how AI behaves for each contact.
   */
  contactAiPreferences: ContactAiPreferences[];
  /** Agent bridge status — when an external agent (HomeClaw/OpenClaw) is bridged into the mesh. */
  bridgeStatus?: BridgeStatus;
  /** API keys for ClawHub skills. */
  skillApiKeys?: Record<string, string>;
  /** Whether built-in web search (DuckDuckGo) is enabled. Default: true. */
  webSearchEnabled?: boolean;
  /**
   * Whether the agent bridge is enabled (toggle in Settings UI).
   * When true, the bridge is active on next node start. Default: true (D1C revised — Ext Agent ships on with Pi).
   * Explicit `false` in persisted config stays off.
   */
  bridgeEnabled?: boolean;
  /** Active external agent id — persisted in bridge-config.json. */
  activeExtAgentId?: string;
  /** External agent definitions — persisted in bridge-config.json. */
  extAgents?: ExtAgentDefinition[];
  /** Bridge HTTP listen port — persisted in bridge-config.json. */
  bridgeListenPort?: number;
  /**
   * Whether the built-in OpenClaw agent (EnvoyAI) is enabled (toggle in Settings UI).
   * When false, the gateway child process is not spawned on next start and any running
   * gateway is stopped at config-changed time. Default: true (Phase 32, D1C).
   */
  openclawEnabled?: boolean;
  /**
   * Phase 49 — whether the built-in Pi local coding agent is enabled.
   * Default: true on full builds; false on Windows slim builds (where the
   * Pi sidecar is omitted). Pi is local-only — no mesh.* tool access.
   */
  piEnabled?: boolean;
  /** Phase 49 — Pi agent settings (model override, permission policy, allowlist). */
  piSettings?: PiSettings;
  /** Dynamic AI character bots (user-created, synced to all clients). */
  aiBots?: AiBotDefinition[];
  /**
   * Phase 51 — Family Network profiles on this home node.
   * Metadata only in non-owner config views (secrets stripped separately).
   */
  familyProfiles?: import("./family-profile.js").FamilyProfile[];
  /**
   * Phase 51 — caller's bound family profile id (session), when known.
   * Omitted for unrestricted local clients until they pair.
   */
  callerFamilyProfileId?: string;
  /**
   * Phase 51 — whether the caller session is the owner profile.
   */
  callerIsOwnerProfile?: boolean;
  /**
   * Phase 33 — max age (in ms) of a cached agent card before the auto-fetcher re-issues a
   * request. Default 24h.
   */
  agentCardAutoFetchMaxAgeMs?: number;
  /**
   * Phase 35C — opt-in LAN auto-bond. Default: false.
   */
  lanAutoBondEnabled?: boolean;
  /**
   * Phase 35C — shared fleet secret. When `lanAutoBondEnabled` is true and this
   * is set, nodes on the same LAN that carry the same value will auto-bond
   * without an approval prompt.
   */
  lanAutoBondFleetToken?: string;
  /**
   * Phase 35D — opt-in pairing-kiosk HTTP server. Default: false.
   */
  pairingKioskEnabled?: boolean;
  /** Phase 35D — bearer token for the kiosk's POST /pair. */
  pairingKioskAdminToken?: string;
  /**
   * Phase 40D — defaults applied to every new chain this node launches.
   * Per-chain mandates override these (so an owner can still set a single
   * chain to "never" even if their default is "auto").
   */
  chainDefaults?: ChainDefaultsConfig;
  /** Phase 35D — bind address. Default 127.0.0.1 (loopback). */
  pairingKioskBindAddress?: string;
  /** Phase 35D — bind port. Default 3737. */
  pairingKioskPort?: number;
  /** Phase 35D — when true, the kiosk can bind to a non-loopback address. Default false. */
  pairingKioskAllowLanBind?: boolean;
  /** Phase 35D — optional ISO 8601 expiry for the kiosk endpoint. */
  pairingKioskExpiresAt?: string;
  /**
   * When true, an inbound `device.pair.request` whose `pairingToken` matches the latest
   * token from `getPairingPayload` may be auto-accepted (direct trust + peer directory).
   * Default: false.
   */
  companionPairingAutoAcceptWithToken?: boolean;
  /**
   * Public WebSocket URL of the EnvoyMesh relay node (e.g. ws://relay.example.com:15432/ws).
   * When set, the pairing QR directs mobile clients to the relay instead of the LAN IP,
   * allowing pairing from any network. The relay proxies WebSocket ↔ libp2p to this node.
   */
  relayPublicWsUrl?: string;
  /**
   * Base URL for HomeClaw Core on the node's LAN (default `http://127.0.0.1:9000`).
   * Override when Core listens elsewhere. Used only by `homeclawCoreProxy`.
   */
  homeClawCoreBaseUrl?: string;
  /**
   * Trust mode (Phase 12): allow inbound/outbound agent-assisted intros (`social.intro.*`) when true.
   * Default false — intents are rejected at the node boundary when disabled.
   */
  trustModeEnabled?: boolean;
  /**
   * Human-authored brief for “what kind of friend I want” (matching criteria for the agent).
   * Max length enforced server-side (typically 4096 chars). Ignored when {@link friendMatchingPreferencesSigned} is set (signed doc supplies text).
   */
  friendMatchingPreferencesText?: string;
  /** Optional owner-signed matching preferences (Phase F); verified on `updateNodeConfig`. */
  friendMatchingPreferencesSigned?: FriendMatchingPreferencesPayload;
  /** Optional external distribution policy (IPFS export gate). Default: IPFS export disabled. */
  externalPublish?: ExternalPublishConfig;
  /**
   * Resource / connectivity duty-cycle mode (normal | optimized | smart | aggressive).
   * Default: optimized. Mesh-level options apply after node restart.
   */
  connectivityMode?: import("./connectivity-tuning.js").ConnectivityMode;
  /** libp2p connection cap (client nodes). Default 50. */
  maxConnections?: number;
  /** mDNS interval in ms. Default 10_000. */
  mdnsIntervalMs?: number;
  /** Background capability discovery cycle interval in ms. Default 90_000. */
  capabilityDiscoveryIntervalMs?: number;
  /** Skip periodic DHT capability find; Search triggers on-demand find. Default true for wan-default. */
  lazyCapabilityDiscovery?: boolean;
  /** Stretch relay/capability/bootstrap timers when idle. Default true for WAN profiles. */
  idleTimerStretch?: boolean;
  /** Per-domain Activity notify loudness (Phase 13E). Default: instant for all domains. */
  agentVisibility?: AgentVisibilityConfig;
  /** Local chat system lines on A2A milestones. Default: off. */
  a2aChatNotifications?: A2aChatNotificationMode;
  /** Prefer structured A2A over agent free-form chat (Phase 13C). */
  agentInteractionMode?: import("./node-service.js").AgentInteractionMode;
  /**
   * Phase 14A: agent may run Trust-mode intro discovery passes (`mesh.intro.run_autopilot`).
   * Requires {@link trustModeEnabled}. Default false.
   */
  friendAutopilotEnabled?: boolean;
  /**
   * Phase 14A — hours between scheduled autopilot passes (0 = manual tool only).
   */
  friendAutopilotIntervalHours?: import("./friend-autopilot.js").FriendAutopilotIntervalHours;
  /** ISO timestamp of last autopilot pass (persisted). */
  friendAutopilotLastRunAt?: string;
  /**
   * Phase 14B: ceiling for vault bytes returned to bonded peers via inbound `knowledge.query`.
   * Unset = bond policy only (no extra owner cap).
   */
  knowledgeSyndicationMaxSensitivity?: "public" | "friends" | "private";
  /** Phase 16B — standing social proxy posture (requires trustModeEnabled). */
  socialProxyEnabled?: boolean;
  socialProxyMandateId?: string;
  socialProxyLastPassAt?: string;
  /** Phase 16C — document acquisition orchestrator. */
  documentAcquisitionEnabled?: boolean;
  documentAcquisitionMandateId?: string;
  capabilityProviderEnabled?: boolean;
  capabilityProviderMandateId?: string;
  /**
   * Owner-attested Agent Network worker profile. Advertised on the agent card
   * when {@link capabilityProviderEnabled} is true. Used by peers to score
   * this node when selecting workers.
   */
  agentNetworkProfile?: import("@envoymesh/protocol").AgentNetworkProfile;
  /** Phase 19 — agent-driven inbound bond auto-accept. Default false. */
  bondAutonomyEnabled?: boolean;
  bondAutonomyMandateId?: string;
  bondAutonomyMaxAutoBondsPerDay?: number;
  bondAutonomyRequireReferralProof?: boolean;
  bondAutonomyMaxAutoBondTier?: "referred" | "direct";
  bondAutonomyMinTrustOverlapScore?: number;
  bondAutonomyNotifyOwnerOnAutoBond?: boolean;
  /**
   * When set, bond autonomy only auto-accepts inbound hellos whose
   * `proofOfContext` equals this token (matches installer `setupSponsorFriendProofOfContext`).
   */
  bondAutonomySponsorProofToken?: string;
  /** Zero-step first friend on first setup (installer / distributor). */
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
  setupSponsorFriendCompletedAt?: string;
  setupSponsorFriendLastError?: string;
  setupSponsorFriendAttempts?: number;
  /**
   * Phase 38 — WebRTC ICE servers (STUN/TURN) for voice/video calls.
   * When unset, the default set of public STUN servers is used.
   * Set to an empty array to use no ICE servers (Path 1 / LAN only).
   */
  /** Phase 38 — WebRTC ICE servers (STUN/TURN) for voice/video calls. */
  iceServers?: { urls: string; username?: string; credential?: string }[];
}

/**
 * Domain in which the node operates autonomously on behalf of the owner.
 */
export type AutonomousDomain = "social" | "knowledge" | "home" | "research";

// ============================================
// Agent Bridge Types
// ============================================

export interface BridgeStatus {
  enabled: boolean;
  agentPeerId: string;
  agentUrl: string;
  listenPort: number;
  /** Human-readable name for the bridge agent (e.g. "HomeClaw", "OpenClaw"). */
  agentName: string;
  /** PEM public key of the bridge agent (`chat.message` signer), when bridge is enabled. */
  agentPublicKeyPem?: string;
  /** "envoyai" for the built-in OpenClaw assistant, "external" for a third-party HTTP agent. */
  agentType?: "envoyai" | "external";
  /** Selected external agent id (homeclaw, hermes, openhuman, …). */
  activeExtAgentId?: string;
  /** Configured external agents (merged with built-in presets on read). */
  extAgents?: ExtAgentDefinition[];
}

/**
 * Live status of the built-in OpenClaw gateway (EnvoyAI).
 * `enabled` reflects the persisted config flag; `running` reflects the
 * child process + webhook reachability. The two diverge briefly during
 * startup and when the flag is flipped (D2A: in-flight calls are rejected).
 */
export interface OpenClawStatus {
  enabled: boolean;
  running: boolean;
  /** Resolved webhook URL (e.g. http://127.0.0.1:18789/webhook/envoymesh). */
  url: string;
  /** Gateway child process PID, when running. */
  childPid?: number;
  /** ISO timestamp when the current child process was spawned. */
  startedAt?: string;
  /**
   * Last stop/failure reason (port in use, spawn failure, probe fail, etc).
   * Null when the runtime is healthy or has never been started.
   * Surfaced in the AI → AI Engine settings page so operators can see
   * *why* a "Stopped" badge is showing, not just that it is.
   */
  lastError?: string | null;
  /** ISO timestamp of `lastError`. Null when `lastError` is null. */
  lastErrorAt?: string | null;
  /**
   * Number of consecutive restart attempts since the last successful start.
   * 0 when running cleanly. Lets the UI show "restart attempts: 3" so the
   * operator can see the watchdog is in a fail loop and needs intervention.
   */
  consecutiveRestartFailures?: number;
}

/**
 * Pairing payload for QR-code mobile pairing (Phase 10A).
 *
 * Encoded as `envoy://pair?wsUrl=...&relayPeerId=...&agentPeerId=...`
 * Displayed as a QR code in the Social UI for the mobile app to scan.
 */
export interface PairingPayload {
  /** WebSocket URL the mobile app connects to. Either the home node's direct LAN WS URL, or the relay's public WS URL when relay-proxy is configured. */
  wsUrl: string;
  /**
   * Direct LAN WebSocket URL of the home node (e.g. `ws://192.168.x.x:3030/ws`).
   * When present, the mobile app will prefer this URL for ongoing traffic (lowest latency, no relay).
   * The relay URL is used as a fallback when the LAN is unreachable (e.g. mobile on cellular).
   */
  lanWsUrl?: string;
  /**
   * Home node's libp2p peer ID (optional).
   * When connecting through a relay, this is passed as the `target` query param so the relay knows which node to proxy to.
   */
  relayPeerId?: string;
  /**
   * Relay's public WebSocket URL (optional).
   * When present, the QR encodes this relay URL instead of the direct LAN wsUrl, so mobile can connect from any network.
   */
  relayWsUrl?: string;
  /**
   * Additional Envoy relay WebSocket base URLs (optional).
   * Compact QR field so EnvoyGo can try US/EU/… relays when the primary
   * `relayWsUrl` is unreachable. Does not include the built-in community relay.
   */
  relayWsUrls?: string[];
  /** Bridge agent peer ID (optional — present when bridge is enabled) */
  agentPeerId?: string;
  /** Bridge agent public key PEM (optional) */
  agentPubKey?: string;
  /** Bridge agent display name from bridge-config.json (optional) */
  agentName?: string;
  /** Pairing token for owner verification (optional) */
  token?: string;
  /** Owner's public key PEM (Phase 11 — for shared-identity pairing, public info safe for QR) */
  ownerPublicKey?: string;
  /** Owner ID e.g. envoy:owner:... (Phase 11 — for shared-identity pairing) */
  ownerId?: string;
  /** Home node's libp2p peer ID for mobile → home routing (bridge agent transport). */
  homeNodePeerId?: string;
  /**
   * Bootstrap peer multiaddrs the home node uses (optional).
   * When present, EnvoyGo tries these as last-resort fallback candidates
   * when the relay URL is unreachable. Useful when the operator has
   * configured additional relay or bootstrap peers that are WebSocket-accessible.
   */
  bootstrapPeers?: string[];
  /**
   * Bootstrap preset names for compact QR encoding (optional).
   * EnvoyGo resolves these to full multiaddr strings using the same
   * preset registry as the home node. E.g. "public-libp2p-am6".
   */
  bootstrapPresetNames?: string[];
}

/** Params decoded from an `envoy://pair` URI for mobile shared-identity pairing. */
export interface PairWithHomeNodeParams {
  wsUrl: string;
  /**
   * Direct LAN WebSocket URL of the home node (optional).
   * When present, the mobile uses this for ongoing traffic when reachable, falling back to `wsUrl` (relay) otherwise.
   */
  lanWsUrl?: string;
  token: string;
  ownerPublicKey: string;
  ownerId: string;
  agentPeerId?: string;
  agentPubKey?: string;
  relayPeerId?: string;
  homeNodePeerId?: string;
  agentName?: string;
}

/** Result of mobile {@link pairWithHomeNode} after QR pairing succeeds. */
export interface PairWithHomeNodeResult {
  sessionToken: string;
  deviceCertificate: Record<string, unknown>;
  ownerId: string;
}

/** Params for thin-client pairing (EnvoyGo Flutter app). */
export interface PairThinClientParams {
  /** Short-lived pairing token from the home node's QR code. */
  pairingToken: string;
  /** Human-readable device name (e.g. "iPhone 17", "Pixel 9"). */
  deviceName: string;
  /** Platform identifier: "ios", "android", "flutter", "web". */
  platform: string;
  /**
   * Phase 51 — stable client-generated device UUID. Preferred over
   * name-derived ids to avoid collisions across phones.
   */
  deviceId?: string;
  /**
   * Phase 51 — bind to an existing family profile id, or omit to create.
   */
  profileId?: string;
  /** Phase 51 — display name when creating a new family profile. */
  profileName?: string;
  /** Phase 51 — avatar color when creating a new family profile. */
  profileAvatarColor?: string;
}

/** Result of thin-client pairing. No device certificate needed. */
export interface PairThinClientResult {
  sessionToken: string;
  ownerId: string;
  /** Phase 51 — bound family profile. */
  profileId: string;
  /** Phase 51 — whether this session is the owner profile. */
  isOwnerProfile: boolean;
  /** Phase 51 — snapshot of active family profiles (names/avatars). */
  familyProfiles?: import("./family-profile.js").FamilyProfile[];
}

/**
 * Repair a thin-client session whose token lost `profileId` (legacy) or has
 * an immutable `boundFamilyProfileId` that disagrees with a corrupted
 * `profileId:"owner"`. Intentional owner QR pairs (no binding) still require
 * a fresh family invite — "I'm back" → Mom/Dad.
 */
export interface RepairSessionProfileParams {
  profileId: string;
}

export interface RepairSessionProfileResult {
  ok: true;
  profileId: string;
  isOwnerProfile: boolean;
}

/**
 * Defines what the node may do autonomously in a given domain without prompting the owner.
 */
export interface AutonomousPolicy {
  domain: AutonomousDomain;
  /** Maximum sensitivity of vault content the node may respond with autonomously. */
  maxSensitivity: "public" | "friends";
  /** Whether the node may autonomously answer queries in this domain. */
  autoAnswer: boolean;
  /** Whether the node may autonomously send chat messages in this domain. */
  autoSendChat: boolean;
}

/**
 * How the AI presents itself in responses (prompt tone; not shown as inline text in Social UI).
 * - invisible: Responds as if it were the human owner
 * - transparent: Openly an AI assistant (no inline prefix unless debug is on)
 * - defensive: Acts as gatekeeper when owner is unavailable
 */
export type AiIdentityMode = "invisible" | "transparent" | "defensive";

/**
 * AI Identity configuration — defines how the AI presents itself in responses.
 */
export interface AiIdentity {
  /** How the AI introduces itself. Default: "transparent" */
  mode: AiIdentityMode;
  /** Debug-only prefix string when {@link debugPrefixInMessageText} is true. Default: "[AI Agent]" */
  transparentPrefix?: string;
  /**
   * When true, embed {@link transparentPrefix} in chat.message text for logs/audit (hidden in Social UI).
   * Agent vs human is always carried by envelope `senderRole` / chat `actorRole`. Default: false.
   */
  debugPrefixInMessageText?: boolean;
}

/**
 * AI Assistant status — online/offline detection and global toggles.
 */
export interface AiAssistantStatus {
  /** When true, suggest drafts but never auto-send when online. Default: true */
  onlineAssistantEnabled: boolean;
  /** When true, allow auto-reply when detected offline. Default: false */
  offlineAgentEnabled: boolean;
  /** How to detect online/offline status. Default: "automatic" */
  statusMode: "automatic" | "manual";
  /** Current manual status override (only meaningful when statusMode is "manual"). */
  isOnlineManual?: boolean;
}

/**
 * Complete AI settings — stored in node config.
 */
export interface AiSettings {
  status: AiAssistantStatus;
  identity: AiIdentity;
  /** Default mode for new contacts (when no preference is set). Default: "manual" */
  defaultModeForNewContacts: "manual" | "assistant" | "auto";
  /** AI rules for trigger-action behavior. Default: empty */
  rules: AiRule[];
  /** Local vault + chat RAG settings for AI context. */
  knowledgeBase?: import("./ai-knowledge-base.js").AiKnowledgeBaseSettings;
  /** Document publish/share autonomy for Envoy AI (ADB-F). Default: proposals-only tier 0. */
  documentAutonomy?: import("./document-autonomy.js").DocumentAutonomyPolicy;
  /** Chat presentation (Phase 16D) — local only, not on wire. */
  disclosure?: import("./envoy-disclosure.js").EnvoyDisclosureSettings;
  /** Gallery photo sharing by Envoy AI (thumbnail is always public on profile). */
  profileMedia?: import("./profile-media.js").ProfileMediaPolicy;
  /** Per-contact auto-reply rate limits (hourly + daily caps). */
  autoReplyLimits?: import("./auto-reply-limits.js").AutoReplyLimits;
}

export type { ProfileMediaPolicy, ProfileGalleryPhotoVisibility } from "./profile-media.js";
export type {
  ProfilePhotoRef,
  ProfileGalleryPhoto,
  ProfilePhotoMime,
} from "./profile-media.js";

export type { DocumentAutonomyPolicy } from "./document-autonomy.js";

/**
 * AI Rule — defines trigger-action behavior for AI responses.
 */
export type AiRuleCategory = "availability" | "capability" | "catch_all";

export interface AiRuleTrigger {
  /** Keywords to match in the message (case-insensitive). */
  keywords?: string[];
  /** Match contact AI access level (only assistant_only and full can trigger rules). */
  contactAiAccessLevel?: Array<"assistant_only" | "full">;
  /** Regex pattern to match in message. */
  messageContains?: string;
  /** Match greeting messages (hi, hello, hey, etc.). */
  isGreeting?: boolean;
  /** Match complex queries (placeholder for future LLM confidence integration). */
  isComplex?: boolean;
}

export type AiRuleActionType = "draft" | "auto_send" | "gatekeep" | "defer";

export interface AiVaultQuery {
  path: string;
  /** Sensitivity ceiling for vault queries: public (anyone), friends (bonded), private (owner only) */
  maxSensitivity: "public" | "friends" | "private";
}

export interface AiRuleAction {
  type: AiRuleActionType;
  /** Response template with placeholders. */
  template?: string;
  /** Override AI identity mode for this rule. */
  aiIdentityOverride?: AiIdentityMode;
  /** Vault query for this action. */
  vaultQuery?: AiVaultQuery;
}

export interface AiRule {
  id: string;
  enabled: boolean;
  name: string;
  category: AiRuleCategory;
  priority: number;
  trigger: AiRuleTrigger;
  action: AiRuleAction;
}

/**
 * Per-contact AI preferences — stored in node config.
 * Defines how the AI behaves for each contact.
 */
export interface ContactAiPreferences {
  peerOwnerId: string;
  /** AI access level for this contact. Default: "none" */
  aiAccessLevel: "none" | "assistant_only" | "full";
  /** Knowledge access level for vault queries. Default: "public" */
  knowledgeAccess: "public" | "friends" | "private";
  /**
   * Phase 14B — optional per-contact inbound syndication cap (tighter than global ceiling).
   * Unset = use global `knowledgeSyndicationMaxSensitivity` only.
   */
  syndicationMaxSensitivity?: "public" | "friends" | "private";
  /** Priority — whether to alert human immediately or let AI handle. Default: "high" */
  priority: "high" | "low";
}

/** Model provider mode: mock (no external calls), ollama (local), litellm (local/cloud), openai-compatible (OpenAI Chat Completions API format), anthropic-compatible (Anthropic Messages API format), or disabled. */
export type ModelProviderMode = "mock" | "ollama" | "litellm" | "openai-compatible" | "anthropic-compatible" | "disabled";

export interface ModelProviderConfig {
  /** Provider mode. When "disabled", no model calls are made. Default: "mock". */
  mode: ModelProviderMode;
  /**
   * Optional curated preset id (e.g. "minimax-cn", "anthropic").
   * UI/OpenClaw metadata — transport still uses {@link mode}.
   */
  presetId?: string;
  /** Base URL for OpenAI-compatible `/chat/completions` (include `/v1`): Ollama `http://127.0.0.1:11434/v1`, LiteLLM `http://127.0.0.1:4000/v1`. Bare host roots are normalized at runtime. Anthropic mode uses API host without `/v1` (e.g. `https://api.anthropic.com`). */
  endpoint?: string;
  /** Model name for ollama (e.g. "llama3.1") or litellm (e.g. "gpt-4o-mini"). */
  modelName?: string;
  /** Optional API key for litellm, openai, and anthropic providers. */
  apiKey?: string;
  /** If true, cloud providers require explicit owner approval per request. Default: true. */
  requireApprovalForCloud?: boolean;
  /**
   * Mock-mode only: fixed completion text, or `__plan_assign_from_roster__` to
   * synthesize a Team-jobs plan+assign JSON from the Assigner prompt roster.
   */
  mockResponseText?: string;
}

/**
 * Phase 40D — defaults applied to every new chain this node launches.
 * Per-chain `ChainMandate.rebalancePolicy` etc. override these so the
 * owner can still set a single chain to "never" while their default is
 * "auto".
 */
export interface ChainDefaultsConfig {
  /**
   * Default rebalance policy. `"manual"` (current behavior), `"auto"`
   * (rebalance on stall / low confidence), or `"never"` (bar hidden).
   */
  rebalancePolicy?: "manual" | "auto" | "never";
  /** Default heartbeat gap (ms) before an in-flight subtask stalls. */
  stallTimeoutMs?: number;
  /** Default partial-confidence threshold for "low quality". */
  lowConfidenceThreshold?: number;
  /** Default cap on auto-rebalances per chain. */
  maxAutoRebalances?: number;
  /** Default USD added to the budget per auto-rebalance. */
  autoRebalanceIncrementUsd?: number;
  /** Allow LLM-driven decomposition by default for plans > 12 words. */
  allowLlmDecompose?: boolean;
  /**
   * How workers are chosen for new chains.
   * - `"direct"` (default): assign the first available bonded worker; skip
   *   competitive bidding and cost ranking. Best for early collaboration.
   * - `"competitive"`: collect bids, rank by cost/composite, optional counter-bids.
   */
  awardMode?: "direct" | "competitive";
  /**
   * When true, Social shows cost estimates, bid prices, and the rebalance bar.
   * Defaults to false for `direct`, true for `competitive` when unset.
   */
  showCostUi?: boolean;
  /**
   * Phase 47 — outer Team job refinement rounds (B). `1` = today's one-shot
   * plan→execute→publish. Cap is enforced in the Assigner loop.
   */
  iterationMaxRounds?: number;
  /**
   * Phase 47 — how the Assigner decides stop vs continue after a draft.
   * `"always_stop"` keeps multi-round off even when maxRounds > 1 (tests).
   */
  iterationJudgeMode?: "llm" | "always_stop" | "owner";
  /** Phase 47 — what prior-draft payload is fed into the next plan+assign. */
  iterationCarryMode?: "summary" | "full_draft" | "structured";
  /** Phase 47B — max appended steps per open round (A). Default 2. */
  extendMaxStepsPerRound?: number;
  /** Phase 47B — max depth for appended steps (1..3). Default 3. */
  extendMaxDepth?: number;
  /** Phase 47B — require at least one final partial in-round before extend. Default true. */
  extendOnlyAfterPartial?: boolean;
}

export type DiscoveryProfile = "lan-fast" | "wan-default" | "relay-only" | "contacts-only";

export type NodeStatus = "offline" | "starting" | "running" | "stopping";

// ============================================
// Init Result Types
// ============================================

export interface InitNodeOptions {
  discoveryProfile?: DiscoveryProfile;
  relayEnabled?: boolean;
  relayServerEnabled?: boolean;
  advertiseAddrs?: string[];
  bootstrapPeers?: string[];
  bootstrapPresets?: string[];
}

export interface NodeInitResult {
  profileDir: string;
  peerId: string;
  ownerId: string;
  deviceId: string;
}

// ============================================
// Method Parameters (TypeScript types)
// ============================================

export interface GetProfileParams {}

export interface InitNodeParams {
  profileDir: string;
  options?: InitNodeOptions;
}

export interface GetNodeStatusParams {}

export interface StartNodeParams {}

export interface StopNodeParams {}

export interface GetHumanProfileParams {}

export interface UpdateHumanProfileParams {
  displayName?: string;
  bio?: string;
  gender?: string;
  hobbies?: string[];
  knowledge?: string[];
  profileVisibility?: "public" | "private";
  capabilities?: Array<{ tag: string } | { type: string; params?: Record<string, unknown>; confidence?: number } | { descriptor: string }>;
}

export interface SendHelloParams {
  targetOwnerId: string;
  profile: {
    displayName: string;
    bio?: string;
    interests: string[];
    whatShares: string[];
    avatarUrl?: string;
  };
  message: string;
}

export interface AcceptHelloParams {
  messageId: string;
}

export interface DeclineHelloParams {
  messageId: string;
  reason?: string;
}

export interface BlockPeerParams {
  peerOwnerId: string;
}

export interface UnblockPeerParams {
  peerOwnerId: string;
}

export interface RevokeBondParams {
  peerOwnerId: string;
}

export interface GetBondsParams {}

export interface SendChatParams {
  targetOwnerId: string;
  text: string;
  /** Phase 37 — optional attachments (audio, files) to include in the chat.message payload. */
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    sensitivity: "public" | "friends" | "private";
    vaultRelativePath?: string;
  }>;
}

export interface MarkReadParams {
  targetOwnerId: string;
  upToMessageId?: string;
}

export interface ChatDraft {
  draftId: string;
  threadPeerOwnerId: string;
  inReplyToMessageId: string;
  text: string;
  createdAt: string;
}

export interface GetChatDraftsParams {
  threadPeerOwnerId?: string;
}

export interface DeleteChatDraftParams {
  draftId: string;
}

// ====================================
// Capability Manifest Types
// ====================================

/**
 * Visibility level for the capability manifest:
 * - "contacts-only" — respond only to referred/direct trust peers
 * - "public-preview" — respond to public peers with safe preview only (no LLM)
 * - "public-auto-answer" — respond to public peers with auto-answer (requires LLM)
 */
export type ManifestVisibility = "contacts-only" | "public-preview" | "public-auto-answer";

/**
 * Anonymous discovery mode — controls how the node responds to unknown/public peers.
 * - "off" — anonymous discovery is disabled; public strangers are ignored
 * - "contacts-only" — only bonded contacts (referred/direct) can discover this node
 * - "public-preview" — public peers get safe preview responses only (no LLM call)
 * - "public-auto-answer" — public peers can trigger LLM-powered auto-answer within sensitivity ceiling
 *
 * This is a node-level override independent of the capability manifest visibility.
 */
export type AnonymousDiscoveryMode = "off" | "contacts-only" | "public-preview" | "public-auto-answer";

/**
 * Owner-approved capability manifest describing what the node is willing to do
 * for contact-scoped discovery matching.
 */
export interface CapabilityManifest {
  version: "0.1";
  /** Unique identifier for this manifest (changes when manifest is updated). */
  id: string;
  /** Semantic version string. */
  versionTag: string;
  /** Who can receive matches from this manifest. */
  visibility: ManifestVisibility;
  /**
   * Sensitivity ceiling for this manifest.
   * Requests above this ceiling are not answered even if capabilities match.
   */
  sensitivityCeiling: "public" | "friends" | "private";
  /**
   * Freeform keywords describing this node's capabilities.
   * Matched against keyword hashes in discovery requests.
   */
  keywords: string[];
  /**
   * Specific EMP capabilities this node exposes.
   * Used for discovery matching instead of device certificate capabilities.
   */
  capabilities: string[];
  /**
   * Owner-provided description of this node (shown in discovery).
   */
  description?: string;
  /**
   * Timestamp when the owner approved this manifest.
   */
  approvedAt: string;
  /** Timestamp of last update. */
  updatedAt: string;
}

export interface GetCapabilityManifestParams {}

export interface UpdateCapabilityManifestParams {
  visibility?: ManifestVisibility;
  sensitivityCeiling?: CapabilityManifest["sensitivityCeiling"];
  keywords?: string[];
  capabilities?: string[];
  description?: string;
}

export interface SearchPeersParams {
  interests?: string[];
  queryText?: string;
  maxResults?: number;
}

export interface ShareFileParams {
  targetOwnerId: string;
  path: string;
  sensitivity: "public" | "friends" | "private";
}

export interface AcceptShareParams {
  shareId: string;
  savePath: string;
}

export interface DeclineShareParams {
  shareId: string;
}

export interface GetConnectionStatusParams {}

export interface GetBootstrapPeersResult {
  bootstrapPeers: string[];
  /**
   * Short bootstrap preset names that can be encoded compactly in QR codes.
   * EnvoyGo resolves these to full multiaddr strings.
   */
  bootstrapPresetNames: string[];
}

export interface GetBridgeStatusParams {}

export interface GetOpenClawStatusParams {}

export interface GetOpenClawStatusResult {
  status: OpenClawStatus;
}

/** Soft-probe Ext Agent backend reachability (does not block switching). */
export interface ProbeExtAgentParams {
  /** When omitted, probes the currently active Ext Agent. */
  agentId?: string;
}

export interface GetPairingPayloadParams {}

export interface PairDeviceParams {
  requesterOwnerId: string;
  requesterDeviceId: string;
  requesterDevicePublicKeyPem: string;
  pairingToken: string;
}

export interface PairDeviceResult {
  sessionToken: string;
  agentPeerId?: string;
  agentPubKey?: string;
  agentName?: string;
}

// ============================================
// Shared-Identity Pairing (Phase 11)
// ============================================

export interface PairSharedIdentityParams {
  requesterOwnerId: string;
  requesterDeviceId: string;
  requesterDevicePublicKeyPem: string;
  /** P-256 ECDH public key (raw uncompressed, base64url) for key exchange — encrypts the owner private key */
  keyExchangePublicKey: string;
  pairingToken: string;
}

export interface PairSharedIdentityResult {
  sessionToken: string;
  /** Owner-signed device certificate authorizing the mobile device */
  deviceCertificate: Record<string, unknown>;
  /** Owner private key encrypted with AES-256-GCM (base64url) */
  encryptedOwnerKey: string;
  /** Ephemeral P-256 ECDH public key used for key exchange (raw uncompressed, base64url) */
  ephemeralPublicKey: string;
  /** AES-GCM IV/nonce (base64url) */
  iv: string;
  /** AES-GCM authentication tag (base64url) — included separately for Web Crypto API */
  authTag: string;
  /** Owner public key PEM (confirmation of the key encrypted above) */
  ownerPublicKey: string;
  /** Owner ID */
  ownerId: string;
  agentPeerId?: string;
  agentPubKey?: string;
  agentName?: string;
}

/** Mobile → Home: Share the mobile's reachable listen addresses (from UPnP). */
export interface UpdateMyListenAddrsParams {
  /** Mobile's libp2p peer ID */
  peerId: string;
  /** Reachable listen addresses (e.g. /ip4/X.X.X.X/tcp/4001 from UPnP) */
  listenAddrs: string[];
  /**
   * The mobile's owner identity (from pairing). When provided, the home node
   * stores the address on a record keyed by the real ownerId — not the placeholder
   * `ownerId = peerId` used by ensurePeerByPeerId stubs. This ensures
   * _resolvePeerTransportForOwner can find the address when the mobile first
   * connected via relay (which creates a separate record with the relay's peerId).
   */
  ownerId?: string;
}

export interface UpdateMyListenAddrsResult {
  ok: boolean;
}

export interface AuthorizedDeviceSummary {
  deviceId: string;
  certificateId: string;
  deviceProfile: DeviceProfile;
  displayName?: string;
  pairedAt: string;
  lastSeenAt?: string;
  revoked: boolean;
}

export interface ListAuthorizedDevicesResult {
  devices: AuthorizedDeviceSummary[];
}

export interface RevokeAuthorizedDeviceParams {
  deviceId: string;
  reason?: DeviceRevocationReason;
}

export interface RevokeAuthorizedDeviceResult {
  revocation: DeviceRevocationRecord;
}

export interface MergeAuthorizedDevicesParams {
  /**
   * `deviceId` of the canonical record to keep.
   * The other entries are revoked and removed from the authorized list.
   */
  keepDeviceId: string;
  /**
   * `deviceId`s of the duplicate entries to revoke as part of the merge.
   * Each one is treated as a "retired" revocation.
   */
  mergeDeviceIds: string[];
  /**
   * Optional reason recorded on each revocation record.
   * Defaults to "deduplicated".
   */
  reason?: DeviceRevocationReason;
}

export interface MergeAuthorizedDevicesResult {
  /** Revocation records produced for the merged-away duplicates. */
  revocations: DeviceRevocationRecord[];
}

export interface PruneRevokedDevicesResult {
  /** deviceIds that were removed from the authorized list. */
  prunedDeviceIds: string[];
}

export interface ListDeviceRevocationsResult {
  revocations: DeviceRevocationRecord[];
}

export interface GetPeerConnectionInfoParams {
  peerOwnerId: string;
}

export interface WarmContactConnectionParams {
  peerOwnerId: string;
  /** When true, close stale paths and force a fresh dial. Default false (probe / gentle reconnect). */
  redial?: boolean;
  verifyOnly?: boolean;
  upgradeRelayToDirect?: boolean;
  keepAlive?: boolean;
  verifyConnection?: boolean;
}

export interface GetChatDiagnosticsParams {
  peerOwnerId?: string;
}

export interface GetNodeConfigParams {}

export interface UpdateNodeConfigParams {
  discoveryProfile?: DiscoveryProfile;
  relayEnabled?: boolean;
  relayServerEnabled?: boolean;
  advertiseAddrs?: string[];
  bootstrapPeers?: string[];
  enableMdns?: boolean;
  chatAssistEnabled?: boolean;
  anonymousDiscoveryMode?: AnonymousDiscoveryMode;
  anonymousIntentAllowlist?: readonly string[];
  anonymousSensitivityCeiling?: "public" | "friends";
  trustAnchorPublicKeys?: Record<string, string>;
  autonomousKillSwitch?: boolean;
  autonomousPolicies?: AutonomousPolicy[];
  aiSettings?: AiSettings;
  /** Per-contact AI preferences. Update individual contacts via updateContactAiPrefs(). */
  contactAiPreferences?: ContactAiPreferences[];
  /** When true, allow `device.pair.request` auto-accept when `pairingToken` matches QR/RPC token. */
  companionPairingAutoAcceptWithToken?: boolean;
  /** Public WebSocket URL of the relay node for mobile pairing through relay proxy. */
  relayPublicWsUrl?: string;
  /** Enable/disable the agent bridge (takes effect on next node start). Default: true (D1C revised). */
  bridgeEnabled?: boolean;
  /** Enable/disable the built-in OpenClaw agent (EnvoyAI). Default: true (Phase 32, D1C). */
  openclawEnabled?: boolean;
  /** Phase 49 — enable/disable the built-in Pi local coding agent. */
  piEnabled?: boolean;
  /** Phase 49 — Pi agent settings (model override, permission policy, allowlist). */
  piSettings?: PiSettings;
  /** Dynamic AI character bots (user-created, synced to all clients). */
  aiBots?: AiBotDefinition[];
  /** Phase 33 — max age (in ms) of a cached agent card before the auto-fetcher re-issues a request. Default 24h. */
  agentCardAutoFetchMaxAgeMs?: number;
  /** Enable Trust-mode intros (`social.intro.*` gate). Default false. */
  trustModeEnabled?: boolean;
  /** Owner criteria text for friend matching (bounded length). */
  friendMatchingPreferencesText?: string;
  /** Phase 14A — allow agent Trust-mode autopilot tool. Requires trustModeEnabled. */
  friendAutopilotEnabled?: boolean;
  /** Phase 14A — scheduled autopilot interval hours (0 = manual only). */
  friendAutopilotIntervalHours?: 0 | 24 | 168;
  /** Phase 14B — cap inbound peer knowledge.query vault syndication. Pass null to clear. */
  knowledgeSyndicationMaxSensitivity?: "public" | "friends" | "private" | null;
  /** Owner-signed preferences (validated server-side). When set, overrides plain text from signature payload. */
  friendMatchingPreferencesSigned?: FriendMatchingPreferencesPayload;
  maxConnections?: number;
  /** Resource / connectivity duty-cycle mode. */
  connectivityMode?: import("./connectivity-tuning.js").ConnectivityMode;
  /** Optional model name for terminal assist LLM calls. */
  terminalAssistModelName?: string;
  terminalCommandAllowPatterns?: readonly string[];
  terminalCommandDenyPatterns?: readonly string[];
  /** Owner-extended destructive regex patterns (in addition to built-in list). */
  terminalCommandDestructivePatterns?: readonly string[];
  terminalAgentModeDefault?: boolean;
  terminalAutoRunPolicy?: import("./terminal-agent.js").TerminalAutoRunPolicy;
  terminalInlineSuggestEnabled?: boolean;
  terminalXtermSlashIntercept?: boolean;
  /** Phase 38 — WebRTC ICE servers (STUN/TURN) for voice/video calls. */
  iceServers?: { urls: string; username?: string; credential?: string }[];
  mdnsIntervalMs?: number;
  capabilityDiscoveryIntervalMs?: number;
  lazyCapabilityDiscovery?: boolean;
  idleTimerStretch?: boolean;
  /** Phase 42 — Cost estimation */
  chainCostEstimationEnabled?: boolean;
  /** Phase 19 — bond autonomy auto-accept inbound hellos. */
  bondAutonomyEnabled?: boolean;
  bondAutonomyMandateId?: string;
  bondAutonomyMaxAutoBondsPerDay?: number;
  bondAutonomyRequireReferralProof?: boolean;
  bondAutonomyMaxAutoBondTier?: "referred" | "direct";
  bondAutonomyMinTrustOverlapScore?: number;
  bondAutonomyNotifyOwnerOnAutoBond?: boolean;
  bondAutonomySponsorProofToken?: string;
  /** Zero-step first friend on first setup. */
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
}

export interface RunCapabilityDiscoveryParams {
  /** When true, run DHT find even if lazy mode would skip periodic find. Default true. */
  find?: boolean;
}

export interface ListRelaysParams {}

export interface AddRelayParams {
  addr: string;
  level?: number;
  region?: string;
}

export interface RemoveRelayParams {
  relayId: string;
}

export interface OnParams {
  event: string;
}

export interface OffParams {
  event: string;
}

// ============================================
// Request/Response Examples
// ============================================

/*
Example: Send Hello

Client -> Server:
{
  "id": "req_abc123",
  "method": "sendHello",
  "params": {
    "targetOwnerId": "envoy:owner:xyz789",
    "profile": {
      "displayName": "Alice",
      "interests": ["blues", "jazz"],
      "whatShares": ["music"]
    },
    "message": "Hi! We share music taste."
  }
}

Server -> Client:
{
  "id": "req_abc123",
  "result": {
    "messageId": "hello_xyz",
    "inReplyTo": "req_abc123",
    "decision": "accept",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}


Example: Subscribe to hello:request

Client -> Server:
{
  "id": "sub_def456",
  "method": "on",
  "params": {
    "event": "hello:request"
  }
}

Server -> Client (when hello arrives):
{
  "event": "hello:request",
  "data": {
    "messageId": "hello_xyz",
    "sender": {
      "nodeId": "QmPeerId",
      "ownerId": "envoy:owner:xyz789",
      "displayName": "Bob"
    },
    "profile": {
      "displayName": "Bob",
      "interests": ["rock"]
    },
    "message": "Hey there!",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}


Example: Search Peers

Client -> Server:
{
  "id": "req_ghi789",
  "method": "searchPeers",
  "params": {
    "interests": ["blues"],
    "maxResults": 10
  }
}

Server -> Client:
{
  "id": "req_ghi789",
  "result": [
    {
      "nodeId": "QmAlice",
      "ownerId": "envoy:owner:alice123",
      "displayName": "Alice",
      "interests": ["blues", "jazz"],
      "profileVisibility": "public"
    }
  ]
}
*/

// ============================================
// Phase 40 — Chain RPC types
// ============================================

export interface ChainPlanParams {
  chainId: string;
  chainMandateId: string;
  goal: string;
  /** When true, use the LLM decomposer for multi-step goals. */
  allowLlm?: boolean;
  /** Optional caller peerId for ownership auditing. */
  ownerPeerId?: string;
}

export interface ChainPlanResult {
  chainId: string;
  /** Estimated total cost across all subtasks (Phase 42). */
  estimatedTotalCostUsd?: number;
  subtasks: Array<{
    subtaskId: string;
    depth: number;
    requiredCapability: string;
    objective: string;
    /** Per-subtask cost ceiling from the mandate or LLM estimate. */
    costCeilingUsd?: number;
  }>;
}

export interface ChainLaunchParams {
  chainId: string;
  /** Mapping subtaskId → worker peer ids to propose to. */
  workersBySubtask: Record<string, string[]>;
}

export interface ChainLaunchResult {
  chainId: string;
  proposed: number;
  mandateBroadcastOk: boolean;
}

export interface ChainGetStateParams {
  chainId: string;
}

export interface ChainGetStateResult {
  chainId: string;
  chainMandateId: string;
  subtaskCount: number;
  bidCount: number;
  awardedCount: number;
  partialCount: number;
  cancelledCount: number;
  chainCancelled: boolean;
  published: boolean;
  budgetSpentUsd: number;
  budgetMaxUsd: number;
  budgetReservedUsd: number;
  budgetSynthesisUsd: number;
  /** Phase 43 — natural-language goal (when known). */
  goal?: string;
  /** Phase 43 — estimated cost range shown before launch. */
  estimatedCostRange?: { minUsd: number; maxUsd: number };
  /**
   * Award mode for this chain (`direct` = first available worker, no cost race).
   * Surfaced so the UI can hide bidding/cost chrome when appropriate.
   */
  awardMode?: "direct" | "competitive";
  /** When false, Social hides cost estimates / bid prices for this chain. */
  showCostUi?: boolean;
  /** Phase 43G — budget burn warning level. */
  budgetWarningLevel?: "ok" | "warn" | "exceeded";
  /**
   * Phase 40D — rebalance policy for this chain. Surfaced so the UI can
   * render the rebalance bar in "manual" / "auto" / "never" modes
   * without re-fetching the mandate.
   */
  rebalancePolicy?: "manual" | "auto" | "never";
  /**
   * Phase 40D — how many auto-rebalances have fired for this chain so far.
   * Only meaningful when `rebalancePolicy === "auto"`.
   */
  autoRebalanceCount?: number;
  /**
   * Phase 40D — hard cap on auto-rebalances per chain (from
   * `ChainMandate.maxAutoRebalances`).
   */
  maxAutoRebalances?: number;
  /**
   * Phase 40D — most-recent-first history of auto-rebalances. Surfaced so
   * the owner can see *why* the chain kept raising its own budget.
   */
  autoRebalanceHistory?: Array<{ at: string; reason: string; additionalBudgetUsd: number }>;
  /**
   * Phase 40D — live bids grouped by subtask. Surfaced to the ChainBidInbox
   * UI so the owner can pick a worker or counter-bid before evaluation.
   * Only includes bids whose `bidExpiresAt` is in the future.
   */
  bidsBySubtask?: Array<{
    subtaskId: string;
    bids: Array<{
      bidKey: string;
      workerPeerId: string;
      workerOwnerId: string;
      proposedCostUsd: number;
      proposedEtaAt: string;
      bidExpiresAt: string;
      /** Phase 43E — worker bid rationale. */
      rationale?: string;
    }>;
  }>;
  /** Phase 47 — live iteration progress for Team jobs UI. */
  iteration?: {
    round: number;
    maxRounds: number;
    extendsInRound: number;
    maxExtendsInRound: number;
    waitingForOwner?: boolean;
    stopReason?: string;
    drafts: Array<{
      round: number;
      summary: string;
      judgeDecision?: string;
      judgeReason?: string;
    }>;
  };
}

export interface ChainListActiveParams {
  /** When set, only return chains whose `createdAt` is >= this ISO timestamp. */
  sinceMs?: number;
}

export interface ChainListActiveResult {
  chains: ChainGetStateResult[];
}

export interface ChainCancelParams {
  chainId: string;
  reason: string;
  cancelledBy: "owner" | "orchestrator" | "policy";
  /** Optional: cancel only a single subtask rather than the entire chain. */
  subtaskId?: string;
}

export interface ChainCancelResult {
  chainId: string;
  cancelled: string[]; // subtaskIds that were cancelled
}

export interface ChainListReportsParams {
  sinceMs?: number;
  limit?: number;
  pinnedOnly?: boolean;
}

export interface ChainListReportsResult {
  reports: Array<{
    chainId: string;
    chainMandateId: string;
    orchestratorOwnerId: string;
    orchestratorPeerId: string;
    pinned: boolean;
    createdAt: string;
    chainSummary: {
      subtaskCount: number;
      workerCount: number;
      synthesisCostUsd: number;
    };
  }>;
}

export interface ChainGetReportParams {
  chainId: string;
}

export interface ChainGetReportResult {
  report: unknown | null;
}

export interface ChainPinReportParams {
  chainId: string;
  pinned: boolean;
}

export interface ChainPinReportResult {
  chainId: string;
  pinned: boolean;
}

export interface ChainSetBidStrategyParams {
  /** Capability tag this policy applies to. "*" matches all capabilities. */
  capability: string;
  /** Base cost in USD per subtask of depth 1. */
  baseCostUsd: number;
  /** Capability-local ETA in ms. */
  capabilityLocalEtaMs: number;
  /** Optional reputation-derived discount (1.0 = no discount). */
  reputationDiscount?: number;
  /** Optional ETA slack in ms (default 60_000). */
  etaSlackMs?: number;
}

export interface ChainSetBidStrategyResult {
  capability: string;
  baseCostUsd: number;
}

export interface ChainGetBidStrategyParams {
  capability: string;
}

export interface ChainGetBidStrategyResult {
  capability: string;
  baseCostUsd: number;
  capabilityLocalEtaMs: number;
  reputationDiscount: number;
  etaSlackMs: number;
}

export interface ChainEvaluateBidsParams {
  chainId: string;
  subtaskId: string;
  policy?: "composite" | "cheapest" | "fastest" | "highest_confidence";
  maxRounds?: number;
  /** Phase 40D — owner-picked worker. Skips the policy sort. */
  pickWorkerPeerId?: string;
}

export interface ChainEvaluateBidsResult {
  chainId: string;
  subtaskId: string;
  awarded: boolean;
  workerPeerId?: string;
  round?: number;
  acceptedCostUsd?: number;
  reason?:
    | "no_bids"
    | "all_bids_expired"
    | "budget_exceeded"
    | "cancelled"
    | "max_rounds_exceeded";
}

/** Phase 40D — counter-bid. Reject all current bids and rebroadcast with a new cost ceiling. */
export interface ChainCounterBidParams {
  chainId: string;
  subtaskId: string;
  newCostCeilingUsd: number;
  newDeadlineAt?: string;
}

export interface ChainCounterBidResult {
  chainId: string;
  subtaskId: string;
  ok: boolean;
  reason?: "no_such_subtask" | "max_rounds_exceeded" | "cancelled" | "ceiling_too_low";
  rebroadcastAt?: string;
  clearedBids?: number;
  newRound?: number;
}

/** Phase 40D — rebalance: add budget to a chain and re-evaluate un-awarded subtasks. */
export interface ChainRebalanceParams {
  chainId: string;
  additionalBudgetUsd: number;
}

export interface ChainRebalanceResult {
  chainId: string;
  ok: boolean;
  reason?: "cancelled" | "invalid_amount" | "already_finalized" | "policy_disabled" | "cap_exceeded";
  previousMaxUsd?: number;
  newMaxUsd?: number;
  reEvaluated?: Array<{
    subtaskId: string;
    awarded: boolean;
    workerPeerId?: string;
    reason?: string;
  }>;
  /** True when the rebalance was triggered automatically (trackChain). */
  autoTriggered?: boolean;
}

/** Phase 40D — read the node's chain defaults. */
export interface ChainGetDefaultsParams {
  /** No args — defaults are read from the local NodeConfig. */
}
export interface ChainGetDefaultsResult {
  defaults: ChainDefaultsConfig;
}

/** Phase 40D — overwrite the node's chain defaults. */
export interface ChainSetDefaultsParams {
  defaults: ChainDefaultsConfig;
}
export interface ChainSetDefaultsResult {
  ok: boolean;
  defaults: ChainDefaultsConfig;
  reason?: "validation_failed";
}

/** Phase 43B — preview a chain plan without launching. */
export interface ChainPreviewGoalParams {
  goal: string;
  templateId?: string;
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
  allowLlm?: boolean;
}

export interface ChainPreviewGoalResult {
  ok: boolean;
  chainId?: string;
  subtasks: Array<{
    subtaskId: string;
    depth: number;
    requiredCapability: string;
    objective: string;
    workerCount: number;
  }>;
  estimatedCostRange?: { minUsd: number; maxUsd: number };
  diagnostics?: string[];
  reason?: string;
}

/** Phase 43B — one-click chain launch from a natural-language goal. */
export interface ChainStartFromGoalParams {
  goal: string;
  templateId?: string;
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
  allowLlm?: boolean;
  /** Optional remote Assigner peer id (default = local agent). */
  assignerPeerId?: string;
  /** Phase 47 — override node default `iterationMaxRounds` for this job. */
  iterationMaxRounds?: number;
  /** Phase 47 — override node default judge mode for this job. */
  iterationJudgeMode?: "llm" | "always_stop" | "owner";
  /** Phase 47 — override extend cap for this job. */
  extendMaxStepsPerRound?: number;
  /**
   * Phase 47D — mid-job iteration blob for Assigner handoff rehydrate.
   * When set with `assignerPeerId`, carried on `task.chain.handoff.iterationState`.
   */
  iterationState?: ChainIterationWire;
}

export interface ChainResolveIterationParams {
  chainId: string;
  /** Owner choice after ask_owner hold. */
  decision: "stop" | "continue";
}

export interface ChainResolveIterationResult {
  ok: boolean;
  published?: boolean;
  continued?: boolean;
  error?: string;
}

export interface ChainStartFromGoalResult {
  ok: boolean;
  chainId?: string;
  chainMandateId?: string;
  subtasks?: Array<{
    subtaskId: string;
    depth: number;
    requiredCapability: string;
    objective: string;
    preferredWorkerPeerId?: string;
  }>;
  estimatedCostRange?: { minUsd: number; maxUsd: number };
  diagnostics?: string[];
  error?: string;
  /** Set when Assigner role was handed off via A2A. */
  assignerPeerId?: string;
  handedOff?: boolean;
}

/** Phase 43H — export chain cost breakdown as CSV. */
export interface ChainExportCostsParams {
  chainId: string;
}

export interface ChainExportCostsResult {
  chainId: string;
  csv: string;
}

/** Phase 43H — built-in goal templates for quick starts. */
export interface ChainListRecipesParams {
  /** No args. */
}

export interface ChainListRecipesResult {
  recipes: Array<{
    id: string;
    label: string;
    goal: string;
    maxChainCostUsd?: number;
    costCeilingUsd?: number;
    /** True when persisted by the owner (vs built-in template). */
    saved?: boolean;
  }>;
}

/** Phase 43H — save a chain goal recipe. */
export interface ChainSaveRecipeParams {
  id?: string;
  label: string;
  goal: string;
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
}

export interface ChainSaveRecipeResult {
  ok: boolean;
  recipe?: ChainListRecipesResult["recipes"][number];
  reason?: "validation_failed";
}

export interface ChainDeleteRecipeParams {
  id: string;
}

export interface ChainDeleteRecipeResult {
  ok: boolean;
  deleted: boolean;
}

/** Phase 43D — push when a chain report is stored for the owner. */
export interface ChainReportReceivedEvent {
  chainId: string;
  executiveSummary?: string;
  subtaskCount?: number;
  workerCount?: number;
  synthesisCostUsd?: number;
  createdAt?: string;
}
/** Phase 47D — focused iteration progress for Team jobs UIs (beyond chain:state). */
export interface ChainIterationProgressEvent {
  chainId: string;
  phase:
    | "round_started"
    | "extend"
    | "sealed"
    | "judge"
    | "awaiting_owner"
    | "continued"
    | "stopped"
    | "progress";
  round: number;
  maxRounds: number;
  extendsInRound: number;
  maxExtendsInRound: number;
  waitingForOwner?: boolean;
  stopReason?: string;
  judgeDecision?: string;
  judgeReason?: string;
  /** Peer that handed off this job (trigger), when known. */
  observerPeerId?: string;
  summary?: string;
}
