import type { BondContext } from "./node-service-bond.js";
import type { OutboundMessagingContext } from "./node-service-outbound-messaging.js";
import { learnInboundDialHintsViaRuntime } from "./node-service-outbound-messaging.js";
import type { AgentPassesContext } from "./node-service-agent-passes.js";
import type { ContinuityContext } from "./node-service-continuity.js";
import type {
  FileShareContext,
  FileShareNetworkContext,
} from "./node-service-fileshare.js";
import type { CapabilityManifestContext } from "./node-service-manifest.js";
import type {
  ConnectionStatusContext,
  RecordNodeErrorAccess,
  SessionTokenAccess,
} from "./node-service-connection-status.js";
import type { NodeConfigContext } from "./node-service-config.js";
import type { CapabilityDiscoveryContext } from "./node-service-capability-discovery.js";
import type { AgentSetupContext } from "./node-service-agent-setup.js";
import type { StopNodeContext } from "./node-service-stop.js";
import type { StartNodeContext } from "./node-service-start.js";
import type { WireMeshEventsContext } from "./node-service-wire-mesh-events.js";
import type { SharePreviewContext } from "./node-service-handlers-share-preview.js";
import type { PairingKioskContext } from "./node-service-pairing-kiosk.js";
import type { PairDeviceContext } from "./node-service-handlers-pair-device.js";
import type { PairSharedIdentityContext } from "./node-service-handlers-pair-shared-identity.js";
import type { GetPairingPayloadContext } from "./node-service-handlers-pairing-payload.js";
import type { RunOwnerAgentTurnContext } from "./node-service-handlers-run-owner-agent-turn.js";
import type { ScriptedTutorState } from "./scripted-tutor.js";
import type { RunDocumentAgentTurnContext } from "./node-service-handlers-run-document-agent-turn.js";
import type {
  FriendAutopilotContext,
  SocialProxyContext,
} from "./node-service-friend-autopilot.js";
import type { RunSocialProxyPassContext } from "./node-service-handlers-run-social-proxy-pass.js";
import type {
  OpenInHerdrContext,
  TerminalGetHerdrExportHintContext,
} from "./node-service-handlers-herdr.js";
import type { TerminalExecContext } from "./node-service-handlers-terminal-exec.js";
import type { BondHandlerContext } from "./node-service-handlers-bond-intent.js";
import type { ChatRoomMessageContext } from "./node-service-handlers-chat-room-message.js";
import type { ChatMessageContext } from "./node-service-handlers-chat-message.js";
import type { RequestPeerProfileContext } from "./node-service-handlers-request-peer-profile.js";
import type { SmallProfileDelegationsContext } from "./node-service-handlers-small-profile-delegations.js";
import type { ValidatePairingTokenContext } from "./node-service-handlers-validate-pairing-token.js";
import type { PersistenceContext } from "./node-service-handlers-persistence.js";
import type { ChatRoomSyncContext } from "./node-service-handlers-chat-room-sync.js";
import type { MiscDelegationsContext } from "./node-service-handlers-misc-delegations.js";
import type { ChainContext } from "./node-service-chains.js";
import type { CallContext } from "./node-service-calls.js";
import type {
  OpenClawRuntimeDeps,
  OpenClawRuntimeState,
} from "./node-service-openclaw-runtime.js";
import type { MeshToolContext } from "./tool-registry.js";
import {
  beginOpenClawToolTracking,
  buildOpenClawTurnContextViaRuntime,
  endOpenClawToolTracking,
  ensureOpenClawReadyViaRuntime,
} from "./node-service-openclaw-runtime.js";
import { executeTool } from "./tool-registry.js";
import { isSafeVaultPath } from "./share-inbound.js";

export interface BondContextDeps {
  assertOnline: BondContext["assertOnline"];
  requireMesh: BondContext["requireMesh"];
  requireProfile: BondContext["requireProfile"];
  trustStore: BondContext["trustStore"];
  peerDirectoryStore: BondContext["peerDirectoryStore"];
  humanProfileStore: BondContext["humanProfileStore"];
  sessionTokenStore: BondContext["sessionTokenStore"];
  getPendingSocialIntroProposals: BondContext["getPendingSocialIntroProposals"];
  getPendingHelloRequests: BondContext["getPendingHelloRequests"];
  dialHintsForChat: BondContext["dialHintsForChat"];
  deliverCallEnvelope: BondContext["deliverCallEnvelope"];
  tagBondedContactReachability: BondContext["tagBondedContactReachability"];
  untagReachabilityForOwner: BondContext["untagReachabilityForOwner"];
  flushPendingRoomSyncs: BondContext["flushPendingRoomSyncs"];
  flushPendingRoomMessages: BondContext["flushPendingRoomMessages"];
  refreshBondPeerProfiles: BondContext["refreshBondPeerProfiles"];
  emit: BondContext["emit"];
}

export interface OutboundMessagingContextDeps {
  loadConfig: OutboundMessagingContext["loadConfig"];
  getReachableMesh: OutboundMessagingContext["getReachableMesh"];
  requireMesh: OutboundMessagingContext["requireMesh"];
  getDiscoverySeedStore: OutboundMessagingContext["getDiscoverySeedStore"];
  getProfileDir: OutboundMessagingContext["getProfileDir"];
  peerDirectoryStore: OutboundMessagingContext["peerDirectoryStore"];
  getTransportCache: OutboundMessagingContext["getTransportCache"];
  setTransportCache: OutboundMessagingContext["setTransportCache"];
  deleteTransportCache: OutboundMessagingContext["deleteTransportCache"];
  getPendingHelloRequesterPeerIds: OutboundMessagingContext["getPendingHelloRequesterPeerIds"];
  getInboundListenAddrMergeByPeer: OutboundMessagingContext["getInboundListenAddrMergeByPeer"];
  assertOnline: OutboundMessagingContext["assertOnline"];
  recordOwnerActivity: OutboundMessagingContext["recordOwnerActivity"];
  requireProfile: OutboundMessagingContext["requireProfile"];
  loadHumanProfile: OutboundMessagingContext["loadHumanProfile"];
  getTrustDisplayName: OutboundMessagingContext["getTrustDisplayName"];
  tagBondedContactReachability: OutboundMessagingContext["tagBondedContactReachability"];
  flushPendingRoomSyncs: OutboundMessagingContext["flushPendingRoomSyncs"];
  flushPendingRoomMessages: OutboundMessagingContext["flushPendingRoomMessages"];
  getBridgeAgentPeerId: OutboundMessagingContext["getBridgeAgentPeerId"];
  getSelfOwnerId: OutboundMessagingContext["getSelfOwnerId"];
  getBridgeChatHandler: OutboundMessagingContext["getBridgeChatHandler"];
  persistChatMessage: OutboundMessagingContext["persistChatMessage"];
  emitChatMessage: OutboundMessagingContext["emitChatMessage"];
  markOutboundChatDelivered: OutboundMessagingContext["markOutboundChatDelivered"];
  learnFromMessage: OutboundMessagingContext["learnFromMessage"];
  resolvePeerTransportForOwner: OutboundMessagingContext["resolvePeerTransportForOwner"];
  deliverChatEnvelope: OutboundMessagingContext["deliverChatEnvelope"];
  dialHintsForChat: OutboundMessagingContext["dialHintsForChat"];
}

export interface AgentPassesContextDeps {
  getBonds: AgentPassesContext["getBonds"];
  getProfileOwnerId: AgentPassesContext["getProfileOwnerId"];
  hasTaskStore: AgentPassesContext["hasTaskStore"];
  loadConfig: AgentPassesContext["loadConfig"];
  getAgentActivityStore: AgentPassesContext["getAgentActivityStore"];
  getContactTopicsFromLibrary: AgentPassesContext["getContactTopicsFromLibrary"];
  emit: AgentPassesContext["emit"];
}

export interface ContinuityContextDeps {
  store: ContinuityContext["store"];
  getDeviceId: ContinuityContext["getDeviceId"];
}

export interface FileShareContextDeps {
  getVaultDir: FileShareContext["getVaultDir"];
  getProfileDir: FileShareContext["getProfileDir"];
  getNodeConfig: FileShareContext["getNodeConfig"];
  getTaskStore: FileShareContext["getTaskStore"];
  getRagService: FileShareContext["getRagService"];
  recordOwnerActivity: FileShareContext["recordOwnerActivity"];
  appendAuditEvent: FileShareContext["appendAuditEvent"];
  emit: FileShareContext["emit"];
}

export interface FileShareNetworkContextDeps extends FileShareContextDeps {
  assertOnline: FileShareNetworkContext["assertOnline"];
  requireMesh: FileShareNetworkContext["requireMesh"];
  requireProfile: FileShareNetworkContext["requireProfile"];
  resolvePeerTransportForOwner: FileShareNetworkContext["resolvePeerTransportForOwner"];
  dialHintsForChat: FileShareNetworkContext["dialHintsForChat"];
  getBonds: FileShareNetworkContext["getBonds"];
  deliverCallEnvelope: FileShareNetworkContext["deliverCallEnvelope"];
  getTransferState: () => {
    correlationByRequestMsgId: Map<string, string>;
    pendingPushShareByRequestMsgId: Map<
      string,
      { relativePath: string; toPeerId: string; deliveryChannel?: "inbox" | "chat" | "agent" }
    >;
    pendingPullShareByRequestMsgId: Map<
      string,
      {
        peerRelativePath: string;
        targetOwnerId: string;
        toPeerId: string;
        sensitivity: "public" | "friends" | "private";
      }
    >;
  };
  upsertTransferStatus: FileShareNetworkContext["upsertTransferStatus"];
}

export interface SessionTokenContextDeps {
  sessionTokenStore: unknown;
}

export interface RecordNodeErrorContextDeps {
  getLastNodeError: RecordNodeErrorAccess["getLastNodeError"];
  setLastNodeError: RecordNodeErrorAccess["setLastNodeError"];
  getLastNodeErrorAt: RecordNodeErrorAccess["getLastNodeErrorAt"];
  setLastNodeErrorAt: RecordNodeErrorAccess["setLastNodeErrorAt"];
}

export interface ConnectionStatusContextDeps {
  getLastNodeError: ConnectionStatusContext["getLastNodeError"];
  getLastNodeErrorAt: ConnectionStatusContext["getLastNodeErrorAt"];
  getReachableMesh: ConnectionStatusContext["getReachableMesh"];
  getNodeStatus: ConnectionStatusContext["getNodeStatus"];
  getRelayBootstrapPeers: ConnectionStatusContext["getRelayBootstrapPeers"];
  hasTerminalManager: ConnectionStatusContext["hasTerminalManager"];
  getBridgeStatus: ConnectionStatusContext["getBridgeStatus"];
  getRelayBook: ConnectionStatusContext["getRelayBook"];
}

export interface NodeConfigContextDeps {
  getProfileDir: NodeConfigContext["getProfileDir"];
  loadNodeConfig: NodeConfigContext["loadNodeConfig"];
  saveNodeConfig: NodeConfigContext["saveNodeConfig"];
  getBridgeStatus: NodeConfigContext["getBridgeStatus"];
  getRelayPublicWsUrl: NodeConfigContext["getRelayPublicWsUrl"];
  loadBridgeConfigSkillApiKeys: NodeConfigContext["loadBridgeConfigSkillApiKeys"];
  loadBridgeConfigWebSearchEnabled: NodeConfigContext["loadBridgeConfigWebSearchEnabled"];
  loadBridgeExtAgentSettings: NodeConfigContext["loadBridgeExtAgentSettings"];
  getProfile: NodeConfigContext["getProfile"];
}

export interface CapabilityDiscoveryContextDeps {
  getMesh: CapabilityDiscoveryContext["getMesh"];
  getProfile: CapabilityDiscoveryContext["getProfile"];
  getTaskStore: CapabilityDiscoveryContext["getTaskStore"];
  getDiscoverySeedStore: CapabilityDiscoveryContext["getDiscoverySeedStore"];
  loadConfig: CapabilityDiscoveryContext["loadConfig"];
  getCapabilityDiscoveryTimer: CapabilityDiscoveryContext["getCapabilityDiscoveryTimer"];
  setCapabilityDiscoveryTimer: CapabilityDiscoveryContext["setCapabilityDiscoveryTimer"];
  syncPairingKioskFromConfig: CapabilityDiscoveryContext["syncPairingKioskFromConfig"];
  /** Load the owner's signed human profile (hobbies/knowledge/location). */
  loadHumanProfile: CapabilityDiscoveryContext["loadHumanProfile"];
  getProfileDir: CapabilityDiscoveryContext["getProfileDir"];
  mergeAdvertisedDiscoveryTopics?: CapabilityDiscoveryContext["mergeAdvertisedDiscoveryTopics"];
}

export interface AgentSetupContextDeps {
  saveConfig: AgentSetupContext["saveConfig"];
  loadConfig: AgentSetupContext["loadConfig"];
  getProfileDir: AgentSetupContext["getProfileDir"];
  getProfile: AgentSetupContext["getProfile"];
  setProfile: AgentSetupContext["setProfile"];
  getTaskStore: AgentSetupContext["getTaskStore"];
  setTaskStore: AgentSetupContext["setTaskStore"];
  getNodeStatus: AgentSetupContext["getNodeStatus"];
  getToolExecutionContext: AgentSetupContext["getToolExecutionContext"];
}

export interface StopNodeContextDeps {
  getNodeStatus: StopNodeContext["getNodeStatus"];
  setNodeStatus: StopNodeContext["setNodeStatus"];
  emit: StopNodeContext["emit"];
  clearProfileRequestInflight: StopNodeContext["clearProfileRequestInflight"];
  stopPairingKiosk: StopNodeContext["stopPairingKiosk"];
  getAndClearRelayClientSchedulerStop: StopNodeContext["getAndClearRelayClientSchedulerStop"];
  getAndClearCapabilityDiscoveryTimer: StopNodeContext["getAndClearCapabilityDiscoveryTimer"];
  getAndClearNodeStatsLoggingStop: StopNodeContext["getAndClearNodeStatsLoggingStop"];
  getAndClearBondWarmTimer: StopNodeContext["getAndClearBondWarmTimer"];
  getAndClearProfileRefreshStartupTimer: StopNodeContext["getAndClearProfileRefreshStartupTimer"];
  getAndClearChatRoomSyncFlushTimer: StopNodeContext["getAndClearChatRoomSyncFlushTimer"];
  getMesh: StopNodeContext["getMesh"];
  setMesh: StopNodeContext["setMesh"];
  clearExternalMesh: StopNodeContext["clearExternalMesh"];
  getAndClearAdvertiseInterestsTimer: StopNodeContext["getAndClearAdvertiseInterestsTimer"];
  getAndClearAdvertiseInterestsStartupTimeout: StopNodeContext["getAndClearAdvertiseInterestsStartupTimeout"];
  getAndClearEarlyRelayCheckinTimer: StopNodeContext["getAndClearEarlyRelayCheckinTimer"];
  getDeviceId: StopNodeContext["getDeviceId"];
}

export interface ManifestContextDeps {
  getProfileDir: CapabilityManifestContext["getProfileDir"];
  getCapabilityManifestStore: CapabilityManifestContext["getCapabilityManifestStore"];
  loadNodeConfig: CapabilityManifestContext["loadNodeConfig"];
  saveNodeConfig: CapabilityManifestContext["saveNodeConfig"];
}

export interface StartNodeContextDeps {
  getNodeStatus: StartNodeContext["getNodeStatus"];
  setNodeStatus: StartNodeContext["setNodeStatus"];
  emit: StartNodeContext["emit"];
  getProfile: StartNodeContext["getProfile"];
  setProfile: StartNodeContext["setProfile"];
  getTaskStore: StartNodeContext["getTaskStore"];
  setTaskStore: StartNodeContext["setTaskStore"];
  getRelayStateStore: StartNodeContext["getRelayStateStore"];
  setRelayStateStore: StartNodeContext["setRelayStateStore"];
  getDiscoverySeedStore: StartNodeContext["getDiscoverySeedStore"];
  setDiscoverySeedStore: StartNodeContext["setDiscoverySeedStore"];
  getTaskRuntimeStore: StartNodeContext["getTaskRuntimeStore"];
  setTaskRuntimeStore: StartNodeContext["setTaskRuntimeStore"];
  getInboundGuard: StartNodeContext["getInboundGuard"];
  setInboundGuard: StartNodeContext["setInboundGuard"];
  getTaskDispatcher: StartNodeContext["getTaskDispatcher"];
  setTaskDispatcher: StartNodeContext["setTaskDispatcher"];
  loadConfig: StartNodeContext["loadConfig"];
  getMesh: StartNodeContext["getMesh"];
  setMesh: StartNodeContext["setMesh"];
  wireMeshEvents: StartNodeContext["wireMeshEvents"];
  setRelayBootstrapPeers: StartNodeContext["setRelayBootstrapPeers"];
  setStopRelayClientScheduler: StartNodeContext["setStopRelayClientScheduler"];
  setRelayClientCycleDeps: StartNodeContext["setRelayClientCycleDeps"];
  setStopNodeStatsLogging: StartNodeContext["setStopNodeStatsLogging"];
  setCapabilityDiscoveryTimer: StartNodeContext["setCapabilityDiscoveryTimer"];
  setAdvertiseInterestsStartupTimeout: StartNodeContext["setAdvertiseInterestsStartupTimeout"];
  setLastNodeError: StartNodeContext["setLastNodeError"];
  setLastNodeErrorAt: StartNodeContext["setLastNodeErrorAt"];
  setNodeProcessStartedAtMs: StartNodeContext["setNodeProcessStartedAtMs"];
  startBondWarmInterval: StartNodeContext["startBondWarmInterval"];
  resyncBondedContactReachabilityTags: StartNodeContext["resyncBondedContactReachabilityTags"];
  refreshCapabilityIndex: StartNodeContext["refreshCapabilityIndex"];
  scheduleDeferredProfileRefresh: StartNodeContext["scheduleDeferredProfileRefresh"];
  advertiseInterestsIfPublic: StartNodeContext["advertiseInterestsIfPublic"];
  loadHumanProfile: StartNodeContext["loadHumanProfile"];
  loadPublishedLibraryFromDisk: StartNodeContext["loadPublishedLibraryFromDisk"];
  loadIntentHistoryFromDisk: StartNodeContext["loadIntentHistoryFromDisk"];
  recordNodeError: StartNodeContext["recordNodeError"];
  ensureAgentStores: StartNodeContext["ensureAgentStores"];
  runCapabilityDiscoveryCycle: StartNodeContext["runCapabilityDiscoveryCycle"];
  startCapabilityDiscoveryScheduler: StartNodeContext["startCapabilityDiscoveryScheduler"];
  setBootstrapPeerIds: StartNodeContext["setBootstrapPeerIds"];
}

export interface WireMeshEventsContextDeps {
  mesh: WireMeshEventsContext["mesh"];
  onMessage: WireMeshEventsContext["onMessage"];
  onPeerDiscovered: WireMeshEventsContext["onPeerDiscovered"];
  onPeerDisconnect: WireMeshEventsContext["onPeerDisconnect"];
  onPeerConnect: WireMeshEventsContext["onPeerConnect"];
}

export interface SharePreviewContextDeps {
  recordInboundPullSharePreview: SharePreviewContext["recordInboundPullSharePreview"];
  linkOutboundSharePreviewFromInbound: SharePreviewContext["linkOutboundSharePreviewFromInbound"];
}

export interface PairingKioskContextDeps {
  loadConfig: PairingKioskContext["loadConfig"];
  getKiosk: PairingKioskContext["getKiosk"];
  setKiosk: PairingKioskContext["setKiosk"];
  stopKiosk: PairingKioskContext["stopKiosk"];
  getTaskStore: PairingKioskContext["getTaskStore"];
  getCompanyInviteContext: PairingKioskContext["getCompanyInviteContext"];
}

export interface PairDeviceContextDeps {
  validatePairingToken: PairDeviceContext["validatePairingToken"];
  consumeCompanyInvite: PairDeviceContext["consumeCompanyInvite"];
  setTrustRecordDirect: (record: unknown) => Promise<unknown>;
  mergeInboundDeviceBinding: PairDeviceContext["mergeInboundDeviceBinding"];
  sessionTokenStore: unknown;
  getBridgeStatus: PairDeviceContext["getBridgeStatus"];
}

export interface PairSharedIdentityContextDeps {
  requireProfile: PairSharedIdentityContext["requireProfile"];
  validatePairingToken: PairSharedIdentityContext["validatePairingToken"];
  consumeCompanyInvite: PairSharedIdentityContext["consumeCompanyInvite"];
  setTrustRecordDirect: (record: unknown) => Promise<unknown>;
  mergeInboundDeviceBinding: PairSharedIdentityContext["mergeInboundDeviceBinding"];
  sessionTokenStore: unknown;
  deviceAuthorizationStore: unknown;
  getBridgeStatus: PairSharedIdentityContext["getBridgeStatus"];
}

export interface GetPairingPayloadContextDeps {
  getBridgeStatus: GetPairingPayloadContext["getBridgeStatus"];
  getReachableMesh: GetPairingPayloadContext["getReachableMesh"];
  getWsPort: GetPairingPayloadContext["getWsPort"];
  getWsPath: GetPairingPayloadContext["getWsPath"];
  getRelayPublicWsUrl: GetPairingPayloadContext["getRelayPublicWsUrl"];
  getRelayBootstrapPeers: GetPairingPayloadContext["getRelayBootstrapPeers"];
  getProfile: GetPairingPayloadContext["getProfile"];
  deriveRelayWsUrl: GetPairingPayloadContext["deriveRelayWsUrl"];
  autoDiscoverRelayWsUrl: GetPairingPayloadContext["autoDiscoverRelayWsUrl"];
  autoDiscoverRelayPeerId: GetPairingPayloadContext["autoDiscoverRelayPeerId"];
  setPairingToken: GetPairingPayloadContext["setPairingToken"];
}

export interface RunOwnerAgentTurnContextDeps {
  openClawState: OpenClawRuntimeState;
  getOpenClawRuntimeDeps: () => OpenClawRuntimeDeps;
  recordOwnerActivity: RunOwnerAgentTurnContext["recordOwnerActivity"];
  askOpenClaw: RunOwnerAgentTurnContext["askOpenClaw"];
  persistEnvoyAiChatExchange: RunOwnerAgentTurnContext["persistEnvoyAiChatExchange"];
  recordEnvoyAiHumanOutgoing: RunOwnerAgentTurnContext["recordEnvoyAiHumanOutgoing"];
  maybeIngestTerminalAssistantReply: RunOwnerAgentTurnContext["maybeIngestTerminalAssistantReply"];
  getRagService: RunOwnerAgentTurnContext["getRagService"];
  getTaskStore: RunOwnerAgentTurnContext["getTaskStore"];
  runDocumentAgentTurnCore: RunOwnerAgentTurnContext["runDocumentAgentTurnCore"];
  getApprovalQueue: RunOwnerAgentTurnContext["getApprovalQueue"];
  /** Scripted tutor state for onboarding fallback (bond/interest/model info). */
  getScriptedTutorState: () => Promise<ScriptedTutorState>;
}

export interface RunDocumentAgentTurnContextDeps {
  requireToolExecutionContext: () => Promise<MeshToolContext>;
  listLibraryItems: RunDocumentAgentTurnContext["listLibraryItems"];
  getBonds: RunDocumentAgentTurnContext["getBonds"];
  knowledgeQuery: RunDocumentAgentTurnContext["knowledgeQuery"];
  discoverPublishedLibrary: RunDocumentAgentTurnContext["discoverPublishedLibrary"];
  sendAgentChat: RunDocumentAgentTurnContext["sendAgentChat"];
  recordH2aOwnerTurn: RunDocumentAgentTurnContext["recordH2aOwnerTurn"];
  runDocumentAgentTurnCore: RunDocumentAgentTurnContext["runDocumentAgentTurnCore"];
}

export interface FriendAutopilotContextDeps {
  getNodeConfig: FriendAutopilotContext["getNodeConfig"];
  recordFriendAutopilotPass: FriendAutopilotContext["recordFriendAutopilotPass"];
  updateNodeConfig: FriendAutopilotContext["updateNodeConfig"];
  getToolExecutionContext: FriendAutopilotContext["getToolExecutionContext"];
}

export interface SocialProxyContextDeps {
  getSocialProxyStore: SocialProxyContext["getSocialProxyStore"];
  getNodeConfig: SocialProxyContext["getNodeConfig"];
  getSocialProxyOrchestratorDeps: SocialProxyContext["getSocialProxyOrchestratorDeps"];
  getPendingSocialIntroProposals: SocialProxyContext["getPendingSocialIntroProposals"];
}

export interface RunSocialProxyPassContextDeps {
  getNodeConfig: RunSocialProxyPassContext["getNodeConfig"];
  getSocialProxyOrchestratorDeps: RunSocialProxyPassContext["getSocialProxyOrchestratorDeps"];
  hasSocialProxyStore: RunSocialProxyPassContext["hasSocialProxyStore"];
  updateNodeConfig: RunSocialProxyPassContext["updateNodeConfig"];
}

export interface OpenInHerdrContextDeps {
  resolveOpenClawWorkspaceDir: OpenInHerdrContext["resolveOpenClawWorkspaceDir"];
}

export interface TerminalGetHerdrExportHintContextDeps {
  getProfileDir: TerminalGetHerdrExportHintContext["getProfileDir"];
  requireTerminalManager: TerminalGetHerdrExportHintContext["requireTerminalManager"];
}

export interface TerminalExecContextDeps {
  requireTerminalManager: TerminalExecContext["requireTerminalManager"];
}

export interface TerminalContextDeps {
  requireTerminalManager: () => unknown;
  requireTerminalAgentAssist: () => unknown;
}

export interface BondHandlerContextDeps {
  getTaskStore: BondHandlerContext["getTaskStore"];
  getProfile: BondHandlerContext["getProfile"];
  getTrustStore: BondHandlerContext["getTrustStore"];
  storePendingHelloRequest: BondHandlerContext["storePendingHelloRequest"];
  emit: BondHandlerContext["emit"];
  flushPendingRoomSyncs: BondHandlerContext["flushPendingRoomSyncs"];
  flushPendingRoomMessages: BondHandlerContext["flushPendingRoomMessages"];
  ensurePeerFromInboundChat: BondHandlerContext["ensurePeerFromInboundChat"];
  tagBondedContactReachability: BondHandlerContext["tagBondedContactReachability"];
  tryBondAutonomyAutoAccept?: BondHandlerContext["tryBondAutonomyAutoAccept"];
}

export interface ChatRoomMessageContextDeps {
  getTaskStore: ChatRoomMessageContext["getTaskStore"];
  getChatDraftStore: ChatRoomMessageContext["getChatDraftStore"];
  getProfile: ChatRoomMessageContext["getProfile"];
  getChatLogStore: ChatRoomMessageContext["getChatLogStore"];
  getHumanProfileStore: ChatRoomMessageContext["getHumanProfileStore"];
  getAgentIdentityStore: ChatRoomMessageContext["getAgentIdentityStore"];
  getTrustStore: ChatRoomMessageContext["getTrustStore"];
  getPeerDirectoryStore: ChatRoomMessageContext["getPeerDirectoryStore"];
  getStyleAdapter: ChatRoomMessageContext["getStyleAdapter"];
  getVaultDir: ChatRoomMessageContext["getVaultDir"];
  getConfigStore: ChatRoomMessageContext["getConfigStore"];
  getApprovalQueue: ChatRoomMessageContext["getApprovalQueue"];
  getAutoReplyLimitStore: ChatRoomMessageContext["getAutoReplyLimitStore"];
  getNodeConfig: ChatRoomMessageContext["getNodeConfig"];
  getChatRoomDeps: ChatRoomMessageContext["getChatRoomDeps"];
  sendAgentChat: ChatRoomMessageContext["sendAgentChat"];
  emit: ChatRoomMessageContext["emit"];
}

export interface ChatMessageContextDeps {
  getTaskStore: ChatMessageContext["getTaskStore"];
  getChatDraftStore: ChatMessageContext["getChatDraftStore"];
  getChatLogStore: ChatMessageContext["getChatLogStore"];
  getProfile: ChatMessageContext["getProfile"];
  getHumanProfileStore: ChatMessageContext["getHumanProfileStore"];
  getTrustStore: ChatMessageContext["getTrustStore"];
  getPeerDirectoryStore: ChatMessageContext["getPeerDirectoryStore"];
  getStyleAdapter: ChatMessageContext["getStyleAdapter"];
  getVaultDir: ChatMessageContext["getVaultDir"];
  getConfigStore: ChatMessageContext["getConfigStore"];
  getApprovalQueue: ChatMessageContext["getApprovalQueue"];
  getAutoReplyLimitStore: ChatMessageContext["getAutoReplyLimitStore"];
  getNodeConfig: ChatMessageContext["getNodeConfig"];
  getMesh: ChatMessageContext["getMesh"];
  persistChatMessage: ChatMessageContext["persistChatMessage"];
  reconcileInboundDirectChatMessage: ChatMessageContext["reconcileInboundDirectChatMessage"];
  emit: ChatMessageContext["emit"];
  sendAgentChat: ChatMessageContext["sendAgentChat"];
  tagBondedContactReachability: ChatMessageContext["tagBondedContactReachability"];
  isOwnerOnline: ChatMessageContext["isOwnerOnline"];
}

export interface RequestPeerProfileContextDeps {
  requireMesh: RequestPeerProfileContext["requireMesh"];
  requireProfile: RequestPeerProfileContext["requireProfile"];
  getContactOwnerKeyStore: RequestPeerProfileContext["getContactOwnerKeyStore"];
  getPeerProfileCacheStore: RequestPeerProfileContext["getPeerProfileCacheStore"];
  getPeerDirectoryStore: RequestPeerProfileContext["getPeerDirectoryStore"];
  resolvePeerTransportForOwner: RequestPeerProfileContext["resolvePeerTransportForOwner"];
  resolveLibp2pPeerForBondOwner: RequestPeerProfileContext["resolveLibp2pPeerForBondOwner"];
  dialHintsForChat: RequestPeerProfileContext["dialHintsForChat"];
  emit: RequestPeerProfileContext["emit"];
  profileRequestCooldownMs: RequestPeerProfileContext["getProfileRequestCooldownMs"] extends () => infer R ? R : never;
  getInFlightMap: RequestPeerProfileContext["getInFlightMap"];
  getLastAtMap: RequestPeerProfileContext["getLastAtMap"];
}

export interface SmallProfileDelegationsContextDeps {
  getContactOwnerKeyStore: SmallProfileDelegationsContext["getContactOwnerKeyStore"];
  getVaultDir: SmallProfileDelegationsContext["getVaultDir"];
  signAndSaveHumanProfile: SmallProfileDelegationsContext["signAndSaveHumanProfile"];
  loadHumanProfileForPhotoUpdate: SmallProfileDelegationsContext["loadHumanProfileForPhotoUpdate"];
  getAgentIdentityStore: SmallProfileDelegationsContext["getAgentIdentityStore"];
  assertOnline: SmallProfileDelegationsContext["assertOnline"];
}

export interface ValidatePairingTokenContextDeps {
  getInMemoryToken: ValidatePairingTokenContext["getInMemoryToken"];
  getInMemoryTokenIssuedAt: ValidatePairingTokenContext["getInMemoryTokenIssuedAt"];
  pairingTokenTtlMs: ValidatePairingTokenContext["getInMemoryTokenTtlMs"] extends () => infer R ? R : never;
  getSessionTokenStore: ValidatePairingTokenContext["getSessionTokenStore"];
  getTaskStore: ValidatePairingTokenContext["getTaskStore"];
}

export interface PersistenceContextDeps {
  recordIntent: PersistenceContext["recordIntent"];
  persistIntentHistory: PersistenceContext["persistIntentHistory"];
  loadIntentHistoryFromDisk: PersistenceContext["loadIntentHistoryFromDisk"];
  persistPublishedLibrary: PersistenceContext["persistPublishedLibrary"];
  loadPublishedLibraryFromDisk: PersistenceContext["loadPublishedLibraryFromDisk"];
  getContactTopicsFromLibrary: PersistenceContext["getContactTopicsFromLibrary"];
}

export interface ChatRoomSyncContextDeps {
  getChatRoomDeps: ChatRoomSyncContext["getChatRoomDeps"];
}

export interface MiscDelegationsContextDeps {
  getPendingSocialIntroProposals: MiscDelegationsContext["getPendingSocialIntroProposals"];
  resyncBondedContactReachabilityTags: MiscDelegationsContext["resyncBondedContactReachabilityTags"];
  loadHumanProfile: MiscDelegationsContext["loadHumanProfile"];
  broadcastProfileSyncToBonds: MiscDelegationsContext["broadcastProfileSyncToBonds"];
}

export interface ChainContextDeps {
  store: ChainContext["store"];
  hasTaskStore: ChainContext["hasTaskStore"];
  listChainReports: ChainContext["listChainReports"];
  getChainReport: ChainContext["getChainReport"];
  pinChainReport: ChainContext["pinChainReport"];
  getChainGoal: ChainContext["getChainGoal"];
  getChainCostEstimate: ChainContext["getChainCostEstimate"];
  snapshotToResult: ChainContext["snapshotToResult"];
  bidsBySubtask: ChainContext["bidsBySubtask"];
  getNodeConfig: ChainContext["getNodeConfig"];
  setNodeConfig: ChainContext["setNodeConfig"];
  listChainRecipes: ChainContext["listChainRecipes"];
  saveChainRecipe: ChainContext["saveChainRecipe"];
  deleteChainRecipe: ChainContext["deleteChainRecipe"];
  buildChainOrchestratorDeps: ChainContext["buildChainOrchestratorDeps"];
  evaluateAwardAndAccept: ChainContext["evaluateAwardAndAccept"];
  emitChainState: ChainContext["emitChainState"];
  startChainTracking: ChainContext["startChainTracking"];
  placeholderMandate: ChainContext["placeholderMandate"];
  findCapabilityProviders: ChainContext["findCapabilityProviders"];
  chainDiagnosticsForSubtasks: ChainContext["chainDiagnosticsForSubtasks"];
  runChainGoal: ChainContext["runChainGoal"];
}

export interface CallContextDeps {
  callManager: CallContext["callManager"];
  getProfile: CallContext["getProfile"];
  sendCallResponseEnvelope: CallContext["sendCallResponseEnvelope"];
  loadConfig: CallContext["loadConfig"];
}

export function buildBondContext(deps: BondContextDeps): BondContext {
  return {
    assertOnline: () => deps.assertOnline(),
    requireMesh: () => deps.requireMesh(),
    requireProfile: () => deps.requireProfile(),
    trustStore: deps.trustStore,
    peerDirectoryStore: deps.peerDirectoryStore,
    humanProfileStore: deps.humanProfileStore,
    sessionTokenStore: deps.sessionTokenStore,
    getPendingSocialIntroProposals: () => deps.getPendingSocialIntroProposals(),
    getPendingHelloRequests: () => deps.getPendingHelloRequests(),
    dialHintsForChat: (recipientPeerId, peerListenAddrs, addressFilter) =>
      deps.dialHintsForChat(recipientPeerId, peerListenAddrs, addressFilter),
    deliverCallEnvelope: (transportPeerId, envelope, dialHints, listenAddrs, preferCircuitHints) =>
      deps.deliverCallEnvelope(transportPeerId, envelope, dialHints, listenAddrs, preferCircuitHints),
    tagBondedContactReachability: (peerId) => {
      void deps.tagBondedContactReachability(peerId);
    },
    untagReachabilityForOwner: (ownerId) => deps.untagReachabilityForOwner(ownerId),
    flushPendingRoomSyncs: () => {
      void deps.flushPendingRoomSyncs();
    },
    flushPendingRoomMessages: () => {
      void deps.flushPendingRoomMessages();
    },
    refreshBondPeerProfiles: () => deps.refreshBondPeerProfiles(),
    emit: (event, data) => deps.emit(event, data as never),
  };
}

export function buildOutboundMessagingContext(deps: OutboundMessagingContextDeps): OutboundMessagingContext {
  return {
    loadConfig: () => deps.loadConfig(),
    getReachableMesh: () => deps.getReachableMesh(),
    requireMesh: () => deps.requireMesh(),
    getDiscoverySeedStore: () => deps.getDiscoverySeedStore(),
    getProfileDir: () => deps.getProfileDir(),
    peerDirectoryStore: deps.peerDirectoryStore,
    getTransportCache: () => deps.getTransportCache(),
    setTransportCache: (ownerId, entry) => {
      deps.setTransportCache(ownerId, entry);
    },
    deleteTransportCache: (ownerId) => {
      deps.deleteTransportCache(ownerId);
    },
    getPendingHelloRequesterPeerIds: () => deps.getPendingHelloRequesterPeerIds(),
    getInboundListenAddrMergeByPeer: () => deps.getInboundListenAddrMergeByPeer(),
    learnInboundDialHints: (transportPeerId, remoteAddr) =>
      learnInboundDialHintsViaRuntime(
        {
          getReachableMesh: () => deps.getReachableMesh(),
          peerDirectoryStore: deps.peerDirectoryStore,
          getInboundListenAddrMergeByPeer: () => deps.getInboundListenAddrMergeByPeer(),
        },
        transportPeerId,
        remoteAddr,
      ),
    assertOnline: () => deps.assertOnline(),
    recordOwnerActivity: () => deps.recordOwnerActivity(),
    requireProfile: () => deps.requireProfile(),
    loadHumanProfile: () => deps.loadHumanProfile(),
    getTrustDisplayName: async (ownerId) =>
      (await deps.getTrustDisplayName(ownerId)),
    tagBondedContactReachability: (peerId) => {
      void deps.tagBondedContactReachability(peerId);
    },
    flushPendingRoomSyncs: () => {
      void deps.flushPendingRoomSyncs();
    },
    flushPendingRoomMessages: () => {
      void deps.flushPendingRoomMessages();
    },
    getBridgeAgentPeerId: () => deps.getBridgeAgentPeerId(),
    getSelfOwnerId: () => deps.getSelfOwnerId(),
    getBridgeChatHandler: () => deps.getBridgeChatHandler(),
    persistChatMessage: (threadPeerOwnerId, msg) => deps.persistChatMessage(threadPeerOwnerId, msg),
    emitChatMessage: (msg) => deps.emitChatMessage(msg),
    markOutboundChatDelivered: (threadPeerOwnerId, messageId, deliveredAt) =>
      deps.markOutboundChatDelivered(threadPeerOwnerId, messageId, deliveredAt),
    learnFromMessage: (outgoing, text) => {
      deps.learnFromMessage(outgoing, text);
    },
    resolvePeerTransportForOwner: (targetOwnerId) => deps.resolvePeerTransportForOwner(targetOwnerId),
    deliverChatEnvelope: (transportPeerId, envelope, dialHints, listenAddrs, options) =>
      deps.deliverChatEnvelope(transportPeerId, envelope, dialHints, listenAddrs, options),
    dialHintsForChat: (recipientPeerId, peerListenAddrs) =>
      deps.dialHintsForChat(recipientPeerId, peerListenAddrs),
  };
}

export function buildAgentPassesContext(deps: AgentPassesContextDeps): AgentPassesContext {
  return {
    getBonds: () => deps.getBonds(),
    getProfileOwnerId: () => deps.getProfileOwnerId(),
    hasTaskStore: () => deps.hasTaskStore(),
    loadConfig: () => deps.loadConfig(),
    getAgentActivityStore: () => deps.getAgentActivityStore(),
    getContactTopicsFromLibrary: (ownerId) => deps.getContactTopicsFromLibrary(ownerId),
    emit: (event, data) => deps.emit?.(event as never, data as never),
  };
}

export function buildContinuityContext(deps: ContinuityContextDeps): ContinuityContext {
  return {
    store: deps.store,
    getDeviceId: () => deps.getDeviceId(),
  };
}

export function buildFileShareContext(deps: FileShareContextDeps): FileShareContext {
  return {
    getVaultDir: () => deps.getVaultDir(),
    getProfileDir: () => deps.getProfileDir(),
    getNodeConfig: () => deps.getNodeConfig(),
    getTaskStore: () => deps.getTaskStore(),
    getRagService: () => deps.getRagService(),
    recordOwnerActivity: () => deps.recordOwnerActivity(),
    appendAuditEvent: (event) => deps.appendAuditEvent!(event),
    emit: (event, payload) => deps.emit?.(event as never, payload as never),
  };
}

export function buildSessionTokenContext(deps: SessionTokenContextDeps): SessionTokenAccess {
  return {
    getSessionTokenStore: () => (deps.sessionTokenStore as never) ?? undefined,
  };
}

export function buildRecordNodeErrorContext(deps: RecordNodeErrorContextDeps): RecordNodeErrorAccess {
  return {
    getLastNodeError: () => deps.getLastNodeError(),
    setLastNodeError: (v) => {
      deps.setLastNodeError(v);
    },
    getLastNodeErrorAt: () => deps.getLastNodeErrorAt(),
    setLastNodeErrorAt: (v) => {
      deps.setLastNodeErrorAt(v);
    },
  };
}

export function buildConnectionStatusContext(deps: ConnectionStatusContextDeps): ConnectionStatusContext {
  return {
    getLastNodeError: () => deps.getLastNodeError(),
    getLastNodeErrorAt: () => deps.getLastNodeErrorAt(),
    getReachableMesh: () => deps.getReachableMesh() as never,
    getNodeStatus: () => deps.getNodeStatus(),
    getRelayBootstrapPeers: () => deps.getRelayBootstrapPeers(),
    hasTerminalManager: () => deps.hasTerminalManager(),
    getBridgeStatus: () => deps.getBridgeStatus?.(),
    getRelayBook: () => deps.getRelayBook?.() ?? [],
  };
}

export function buildNodeConfigContext(deps: NodeConfigContextDeps): NodeConfigContext {
  return {
    getProfileDir: () => deps.getProfileDir(),
    loadNodeConfig: () => deps.loadNodeConfig(),
    saveNodeConfig: (config) => deps.saveNodeConfig(config),
    getBridgeStatus: () => deps.getBridgeStatus(),
    getRelayPublicWsUrl: () => deps.getRelayPublicWsUrl(),
    loadBridgeConfigSkillApiKeys: async () => (await deps.loadBridgeConfigSkillApiKeys()) ?? ({} as Record<string, string>),
    loadBridgeConfigWebSearchEnabled: async () => Boolean(await deps.loadBridgeConfigWebSearchEnabled()),
    loadBridgeExtAgentSettings: () => deps.loadBridgeExtAgentSettings(),
    getProfile: () => deps.getProfile(),
  };
}

export function buildCapabilityDiscoveryContext(deps: CapabilityDiscoveryContextDeps): CapabilityDiscoveryContext {
  return {
    getMesh: () => deps.getMesh(),
    getProfile: () => deps.getProfile(),
    getTaskStore: () => deps.getTaskStore(),
    getDiscoverySeedStore: () => deps.getDiscoverySeedStore(),
    loadConfig: () => deps.loadConfig(),
    getCapabilityDiscoveryTimer: () => deps.getCapabilityDiscoveryTimer(),
    setCapabilityDiscoveryTimer: (timer) => {
      deps.setCapabilityDiscoveryTimer(timer);
    },
    syncPairingKioskFromConfig: () => deps.syncPairingKioskFromConfig(),
    loadHumanProfile: () => deps.loadHumanProfile(),
    getProfileDir: () => deps.getProfileDir(),
    mergeAdvertisedDiscoveryTopics: deps.mergeAdvertisedDiscoveryTopics
      ? (topics) => deps.mergeAdvertisedDiscoveryTopics!(topics)
      : undefined,
  };
}

export function buildAgentSetupContext(deps: AgentSetupContextDeps): AgentSetupContext {
  return {
    saveConfig: (config) => deps.saveConfig(config),
    loadConfig: () => deps.loadConfig(),
    getProfileDir: () => deps.getProfileDir(),
    getProfile: () => deps.getProfile(),
    setProfile: (p) => {
      deps.setProfile(p);
    },
    getTaskStore: () => deps.getTaskStore(),
    setTaskStore: (s) => {
      deps.setTaskStore(s);
    },
    getNodeStatus: () => deps.getNodeStatus(),
    getToolExecutionContext: () => deps.getToolExecutionContext(),
  };
}

export function buildStopNodeContext(deps: StopNodeContextDeps): StopNodeContext {
  return {
    getNodeStatus: () => deps.getNodeStatus(),
    setNodeStatus: (s) => {
      deps.setNodeStatus(s);
    },
    emit: (event, payload) => deps.emit?.(event as never, payload as never),
    clearProfileRequestInflight: () => deps.clearProfileRequestInflight(),
    stopPairingKiosk: () => deps.stopPairingKiosk(),
    getAndClearRelayClientSchedulerStop: () => deps.getAndClearRelayClientSchedulerStop(),
    getAndClearCapabilityDiscoveryTimer: () => deps.getAndClearCapabilityDiscoveryTimer(),
    getAndClearNodeStatsLoggingStop: () => deps.getAndClearNodeStatsLoggingStop(),
    getAndClearBondWarmTimer: () => deps.getAndClearBondWarmTimer(),
    getAndClearProfileRefreshStartupTimer: () => deps.getAndClearProfileRefreshStartupTimer(),
    getAndClearChatRoomSyncFlushTimer: () => deps.getAndClearChatRoomSyncFlushTimer(),
    getMesh: () => deps.getMesh() as never,
    setMesh: (m) => {
      deps.setMesh(m);
    },
    clearExternalMesh: () => {
      deps.clearExternalMesh();
    },
    getAndClearAdvertiseInterestsTimer: () => deps.getAndClearAdvertiseInterestsTimer(),
    getAndClearAdvertiseInterestsStartupTimeout: () => deps.getAndClearAdvertiseInterestsStartupTimeout(),
    getAndClearEarlyRelayCheckinTimer: () => deps.getAndClearEarlyRelayCheckinTimer(),
    getDeviceId: () => deps.getDeviceId(),
  };
}

export function buildManifestContext(deps: ManifestContextDeps): CapabilityManifestContext {
  return {
    getProfileDir: () => deps.getProfileDir(),
    getCapabilityManifestStore: () => deps.getCapabilityManifestStore() as never,
    loadNodeConfig: async () => (await deps.loadNodeConfig()) as never,
    saveNodeConfig: async (cfg) => {
      await deps.saveNodeConfig(cfg as never);
    },
  };
}

export function buildFileShareNetworkContext(deps: FileShareNetworkContextDeps): FileShareNetworkContext {
  return {
    ...buildFileShareContext(deps),
    assertOnline: () => deps.assertOnline(),
    requireMesh: () => deps.requireMesh() as never,
    requireProfile: () => deps.requireProfile() as never,
    resolvePeerTransportForOwner: (ownerId) =>
      deps.resolvePeerTransportForOwner(ownerId) as never,
    dialHintsForChat: (peerId, listenAddrs) =>
      deps.dialHintsForChat(peerId, listenAddrs) as never,
    getBonds: () => deps.getBonds() as never,
    deliverCallEnvelope: (targetPeerId, envelope, dialHints, listenAddrs) =>
      deps.deliverCallEnvelope(
        targetPeerId,
        envelope as never,
        dialHints,
        listenAddrs,
      ) as never,
    setPendingPushShare: (messageId, info) => {
      deps.getTransferState().pendingPushShareByRequestMsgId.set(messageId, {
        relativePath: info.relativePath,
        toPeerId: info.toPeerId,
        deliveryChannel: info.deliveryChannel as never,
      });
    },
    setPendingPullShare: (messageId, info) => {
      deps.getTransferState().pendingPullShareByRequestMsgId.set(messageId, {
        peerRelativePath: info.peerRelativePath,
        targetOwnerId: info.targetOwnerId,
        toPeerId: info.toPeerId,
        sensitivity: info.sensitivity as never,
      });
    },
    setCorrelationByRequestMsgId: (messageId, correlationId) => {
      deps.getTransferState().correlationByRequestMsgId.set(messageId, correlationId);
    },
    upsertTransferStatus: (status) => {
      deps.upsertTransferStatus(status as never);
    },
    isVaultPathSafe: (rel) => isSafeVaultPath(deps.getVaultDir()!, rel),
  };
}

export function buildStartNodeContext(deps: StartNodeContextDeps): StartNodeContext {
  return {
    getNodeStatus: () => deps.getNodeStatus(),
    setNodeStatus: (s) => {
      deps.setNodeStatus(s);
    },
    emit: (event, payload) => deps.emit?.(event as never, payload as never),
    getProfile: () => deps.getProfile(),
    setProfile: (p) => {
      deps.setProfile(p);
    },
    getTaskStore: () => deps.getTaskStore(),
    setTaskStore: (s) => {
      deps.setTaskStore(s);
    },
    getRelayStateStore: () => deps.getRelayStateStore(),
    setRelayStateStore: (s) => {
      deps.setRelayStateStore(s);
    },
    getDiscoverySeedStore: () => deps.getDiscoverySeedStore(),
    setDiscoverySeedStore: (s) => {
      deps.setDiscoverySeedStore(s);
    },
    getTaskRuntimeStore: () => deps.getTaskRuntimeStore(),
    setTaskRuntimeStore: (s) => {
      deps.setTaskRuntimeStore(s);
    },
    getInboundGuard: () => deps.getInboundGuard(),
    setInboundGuard: (g) => {
      deps.setInboundGuard(g);
    },
    getTaskDispatcher: () => deps.getTaskDispatcher(),
    setTaskDispatcher: (d) => {
      deps.setTaskDispatcher(d);
    },
    loadConfig: () => deps.loadConfig(),
    getMesh: () => deps.getMesh(),
    setMesh: (m) => {
      deps.setMesh(m as never);
    },
    wireMeshEvents: () => deps.wireMeshEvents(),
    setRelayBootstrapPeers: (addrs) => {
      deps.setRelayBootstrapPeers(addrs);
    },
    setStopRelayClientScheduler: (fn) => {
      deps.setStopRelayClientScheduler(fn);
    },
    setRelayClientCycleDeps: (deps_) => {
      deps.setRelayClientCycleDeps(deps_);
    },
    setStopNodeStatsLogging: (fn) => {
      deps.setStopNodeStatsLogging(fn);
    },
    setCapabilityDiscoveryTimer: (t) => {
      deps.setCapabilityDiscoveryTimer(t);
    },
    setAdvertiseInterestsStartupTimeout: (t) => {
      deps.setAdvertiseInterestsStartupTimeout(t);
    },
    setLastNodeError: (v) => {
      deps.setLastNodeError(v);
    },
    setLastNodeErrorAt: (v) => {
      deps.setLastNodeErrorAt(v);
    },
    setNodeProcessStartedAtMs: (ms) => {
      deps.setNodeProcessStartedAtMs(ms);
    },
    startBondWarmInterval: () => deps.startBondWarmInterval(),
    resyncBondedContactReachabilityTags: () =>
      deps.resyncBondedContactReachabilityTags(),
    refreshCapabilityIndex: () => deps.refreshCapabilityIndex(),
    scheduleDeferredProfileRefresh: (reason) =>
      deps.scheduleDeferredProfileRefresh(reason),
    advertiseInterestsIfPublic: () => deps.advertiseInterestsIfPublic(),
    loadHumanProfile: () => deps.loadHumanProfile(),
    loadPublishedLibraryFromDisk: () => deps.loadPublishedLibraryFromDisk(),
    loadIntentHistoryFromDisk: () => deps.loadIntentHistoryFromDisk(),
    recordNodeError: (context, err) => deps.recordNodeError(context, err),
    ensureAgentStores: () => deps.ensureAgentStores(),
    runCapabilityDiscoveryCycle: (source, opts) =>
      deps.runCapabilityDiscoveryCycle(source, opts),
    startCapabilityDiscoveryScheduler: (runtime) =>
      deps.startCapabilityDiscoveryScheduler(runtime),
    setBootstrapPeerIds: (ids) => { deps.setBootstrapPeerIds(ids); },
  };
}

export function buildWireMeshEventsContext(deps: WireMeshEventsContextDeps): WireMeshEventsContext {
  return {
    mesh: deps.mesh as never,
    onMessage: (params) => deps.onMessage(params),
    onPeerDiscovered: (params) => deps.onPeerDiscovered(params),
    onPeerDisconnect: (peerId) => deps.onPeerDisconnect(peerId),
    onPeerConnect: (params) => deps.onPeerConnect(params),
  };
}

export function buildSharePreviewContext(deps: SharePreviewContextDeps): SharePreviewContext {
  return {
    recordInboundPullSharePreview: (input) =>
      deps.recordInboundPullSharePreview(input),
    linkOutboundSharePreviewFromInbound: (messageId, inReplyTo) =>
      deps.linkOutboundSharePreviewFromInbound(messageId, inReplyTo),
  };
}

export function buildPairingKioskContext(deps: PairingKioskContextDeps): PairingKioskContext {
  return {
    loadConfig: () => deps.loadConfig(),
    getKiosk: () => deps.getKiosk(),
    setKiosk: (handle) => {
      deps.setKiosk(handle);
    },
    stopKiosk: () => deps.stopKiosk(),
    getTaskStore: () => deps.getTaskStore(),
    getCompanyInviteContext: () => deps.getCompanyInviteContext(),
  };
}

export function buildPairDeviceContext(deps: PairDeviceContextDeps): PairDeviceContext {
  return {
    validatePairingToken: (token) => deps.validatePairingToken(token),
    consumeCompanyInvite: (token, ownerId, deviceId) =>
      deps.consumeCompanyInvite(token, ownerId, deviceId),
    setTrustRecordDirect: (record) =>
      deps.setTrustRecordDirect(record as never).then(() => undefined) as Promise<void>,
    mergeInboundDeviceBinding: (input) =>
      deps.mergeInboundDeviceBinding(input),
    getSessionTokenStore: () => (deps.sessionTokenStore as never) ?? null,
    getBridgeStatus: () => deps.getBridgeStatus(),
  };
}

export function buildPairSharedIdentityContext(deps: PairSharedIdentityContextDeps): PairSharedIdentityContext {
  return {
    requireProfile: () => deps.requireProfile(),
    validatePairingToken: (token) => deps.validatePairingToken(token),
    consumeCompanyInvite: (token, ownerId, deviceId) =>
      deps.consumeCompanyInvite(token, ownerId, deviceId),
    setTrustRecordDirect: (record) =>
      deps.setTrustRecordDirect(record as never).then(() => undefined) as Promise<void>,
    mergeInboundDeviceBinding: (input) =>
      deps.mergeInboundDeviceBinding(input),
    getSessionTokenStore: () => (deps.sessionTokenStore as never) ?? null,
    getDeviceAuthorizationStore: () =>
      (deps.deviceAuthorizationStore as never) ?? null,
    getBridgeStatus: () => deps.getBridgeStatus(),
  };
}

export function buildGetPairingPayloadContext(deps: GetPairingPayloadContextDeps): GetPairingPayloadContext {
  return {
    getBridgeStatus: () => deps.getBridgeStatus(),
    getReachableMesh: () => deps.getReachableMesh() as never,
    getWsPort: () => deps.getWsPort(),
    getWsPath: () => deps.getWsPath(),
    getRelayPublicWsUrl: () => deps.getRelayPublicWsUrl(),
    getRelayBootstrapPeers: () => deps.getRelayBootstrapPeers(),
    getProfile: () => deps.getProfile(),
    deriveRelayWsUrl: (addr) => deps.deriveRelayWsUrl(addr),
    autoDiscoverRelayWsUrl: () => deps.autoDiscoverRelayWsUrl(),
    autoDiscoverRelayPeerId: () => deps.autoDiscoverRelayPeerId(),
    setPairingToken: (token, issuedAt) => {
      deps.setPairingToken(token, issuedAt);
    },
  };
}

export function buildRunOwnerAgentTurnContext(deps: RunOwnerAgentTurnContextDeps): RunOwnerAgentTurnContext {
  return {
    recordOwnerActivity: () => deps.recordOwnerActivity(),
    ensureOpenClawReady: () => ensureOpenClawReadyViaRuntime(deps.openClawState, deps.getOpenClawRuntimeDeps()),
    beginOpenClawToolTracking: () => beginOpenClawToolTracking(deps.openClawState),
    endOpenClawToolTracking: () => endOpenClawToolTracking(deps.openClawState),
    buildOpenClawTurnContext: () => buildOpenClawTurnContextViaRuntime(deps.getOpenClawRuntimeDeps()),
    askOpenClaw: (msg, ctx) => deps.askOpenClaw(msg, ctx as never),
    persistEnvoyAiChatExchange: (raw, turn, humanMsgId) =>
      deps.persistEnvoyAiChatExchange(raw, turn, humanMsgId),
    recordEnvoyAiHumanOutgoing: (msg, humanMsgId) =>
      deps.recordEnvoyAiHumanOutgoing(msg, humanMsgId),
    maybeIngestTerminalAssistantReply: (sid, answer) =>
      deps.maybeIngestTerminalAssistantReply(sid, answer),
    getRagService: () => deps.getRagService() as never,
    getTaskStore: () => deps.getTaskStore() as never,
    runDocumentAgentTurnCore: (msg) => deps.runDocumentAgentTurnCore(msg) as never,
    getApprovalQueue: () => deps.getApprovalQueue() as never,
    getScriptedTutorState: () => deps.getScriptedTutorState(),
  };
}

export function buildRunDocumentAgentTurnContext(deps: RunDocumentAgentTurnContextDeps): RunDocumentAgentTurnContext {
  return {
    requireToolExecutionContext: () => deps.requireToolExecutionContext(),
    listLibraryItems: (q) =>
      deps.listLibraryItems(q ? { query: q.query } : undefined) as never,
    getBonds: () => deps.getBonds() as never,
    executeTool: (toolName, params) =>
      (async () => {
        const ctx = await deps.requireToolExecutionContext();
        return executeTool(toolName, params as never, ctx);
      })() as never,
    knowledgeQuery: (question) => deps.knowledgeQuery(question) as never,
    discoverPublishedLibrary: (p) =>
      deps.discoverPublishedLibrary(p as never) as never,
    sendAgentChat: (targetOwnerId, text) =>
      deps.sendAgentChat(targetOwnerId, text) as never,
    recordH2aOwnerTurn: (msg, turn) =>
      deps.recordH2aOwnerTurn(msg, turn as never),
    runDocumentAgentTurnCore: (msg) => deps.runDocumentAgentTurnCore(msg),
  };
}

export function buildFriendAutopilotContext(deps: FriendAutopilotContextDeps): FriendAutopilotContext {
  return {
    getNodeConfig: () => deps.getNodeConfig(),
    recordFriendAutopilotPass: (record) =>
      deps.recordFriendAutopilotPass(record),
    updateNodeConfig: (cfg) => deps.updateNodeConfig(cfg as never),
    getToolExecutionContext: () => deps.getToolExecutionContext() as never,
  };
}

export function buildSocialProxyContext(deps: SocialProxyContextDeps): SocialProxyContext {
  return {
    getSocialProxyStore: () => deps.getSocialProxyStore() ?? undefined,
    getNodeConfig: () => deps.getNodeConfig(),
    getSocialProxyOrchestratorDeps: (config) =>
      deps.getSocialProxyOrchestratorDeps(config) as never,
    getPendingSocialIntroProposals: () => deps.getPendingSocialIntroProposals() as never,
  };
}

export function buildRunSocialProxyPassContext(deps: RunSocialProxyPassContextDeps): RunSocialProxyPassContext {
  return {
    getNodeConfig: () => deps.getNodeConfig(),
    getSocialProxyOrchestratorDeps: (config) =>
      deps.getSocialProxyOrchestratorDeps(config) as never,
    hasSocialProxyStore: () => deps.hasSocialProxyStore(),
    updateNodeConfig: (cfg) => deps.updateNodeConfig(cfg as never),
  };
}

export function buildOpenInHerdrContext(deps: OpenInHerdrContextDeps): OpenInHerdrContext {
  return {
    resolveOpenClawWorkspaceDir: () => deps.resolveOpenClawWorkspaceDir(),
  };
}

export function buildTerminalGetHerdrExportHintContext(
  deps: TerminalGetHerdrExportHintContextDeps,
): TerminalGetHerdrExportHintContext {
  return {
    getProfileDir: () => deps.getProfileDir(),
    requireTerminalManager: () => deps.requireTerminalManager(),
  };
}

export function buildTerminalExecContext(deps: TerminalExecContextDeps): TerminalExecContext {
  return {
    requireTerminalManager: () => deps.requireTerminalManager(),
  };
}

export function buildTerminalContext(deps: TerminalContextDeps): any {
  return {
    requireTerminalManager: () => deps.requireTerminalManager(),
    requireTerminalAgentAssist: () => deps.requireTerminalAgentAssist(),
  };
}

export function buildBondHandlerContext(deps: BondHandlerContextDeps): BondHandlerContext {
  return {
    getTaskStore: () => deps.getTaskStore(),
    getProfile: () => deps.getProfile(),
    getTrustStore: () => deps.getTrustStore(),
    storePendingHelloRequest: (data) => deps.storePendingHelloRequest(data),
    emit: (event, payload) => deps.emit?.(event as never, payload as never),
    flushPendingRoomSyncs: () => deps.flushPendingRoomSyncs(),
    flushPendingRoomMessages: () => deps.flushPendingRoomMessages(),
    ensurePeerFromInboundChat: (input) =>
      deps.ensurePeerFromInboundChat(input),
    tagBondedContactReachability: (remotePeerId) =>
      deps.tagBondedContactReachability(remotePeerId),
    tryBondAutonomyAutoAccept: deps.tryBondAutonomyAutoAccept,
  };
}

export function buildChatRoomMessageContext(deps: ChatRoomMessageContextDeps): ChatRoomMessageContext {
  return {
    getTaskStore: () => deps.getTaskStore(),
    getChatDraftStore: () => deps.getChatDraftStore(),
    getProfile: () => deps.getProfile(),
    getChatLogStore: () => deps.getChatLogStore(),
    getHumanProfileStore: () => deps.getHumanProfileStore(),
    getAgentIdentityStore: () => deps.getAgentIdentityStore(),
    getTrustStore: () => deps.getTrustStore(),
    getPeerDirectoryStore: () => deps.getPeerDirectoryStore(),
    getStyleAdapter: () => deps.getStyleAdapter(),
    getVaultDir: () => deps.getVaultDir(),
    getConfigStore: () => deps.getConfigStore(),
    getApprovalQueue: () => deps.getApprovalQueue(),
    getAutoReplyLimitStore: () => deps.getAutoReplyLimitStore(),
    getNodeConfig: () => deps.getNodeConfig(),
    getChatRoomDeps: () => deps.getChatRoomDeps(),
    sendAgentChat: (targetOwnerId, text) =>
      deps.sendAgentChat(targetOwnerId, text) as never,
    emit: (event, payload) => deps.emit?.(event as never, payload as never),
  };
}

export function buildChatMessageContext(deps: ChatMessageContextDeps): ChatMessageContext {
  return {
    getTaskStore: () => deps.getTaskStore(),
    getChatDraftStore: () => deps.getChatDraftStore(),
    getChatLogStore: () => deps.getChatLogStore(),
    getProfile: () => deps.getProfile(),
    getHumanProfileStore: () => deps.getHumanProfileStore(),
    getTrustStore: () => deps.getTrustStore(),
    getPeerDirectoryStore: () => deps.getPeerDirectoryStore(),
    getStyleAdapter: () => deps.getStyleAdapter(),
    getVaultDir: () => deps.getVaultDir(),
    getConfigStore: () => deps.getConfigStore(),
    getApprovalQueue: () => deps.getApprovalQueue(),
    getAutoReplyLimitStore: () => deps.getAutoReplyLimitStore(),
    getNodeConfig: () => deps.getNodeConfig(),
    getMesh: () => deps.getMesh(),
    persistChatMessage: (senderOwnerId, msg) =>
      deps.persistChatMessage(senderOwnerId, msg),
    reconcileInboundDirectChatMessage: (senderOwnerId, msg) =>
      deps.reconcileInboundDirectChatMessage(senderOwnerId, msg),
    emit: (event, payload) => deps.emit?.(event as never, payload as never),
    sendAgentChat: (targetOwnerId, text) =>
      deps.sendAgentChat(targetOwnerId, text) as never,
    tagBondedContactReachability: (remotePeerId) =>
      deps.tagBondedContactReachability(remotePeerId),
    isOwnerOnline: () => deps.isOwnerOnline(),
  };
}

export function buildRequestPeerProfileContext(deps: RequestPeerProfileContextDeps): RequestPeerProfileContext {
  return {
    requireMesh: () => deps.requireMesh() as never,
    requireProfile: () => deps.requireProfile(),
    getContactOwnerKeyStore: () => deps.getContactOwnerKeyStore(),
    getPeerProfileCacheStore: () => deps.getPeerProfileCacheStore(),
    getPeerDirectoryStore: () => deps.getPeerDirectoryStore(),
    resolvePeerTransportForOwner: (id) =>
      deps.resolvePeerTransportForOwner(id) as Promise<{ recipientEnvelopePeerId: string }>,
    resolveLibp2pPeerForBondOwner: (id) =>
      deps.resolveLibp2pPeerForBondOwner(id) as Promise<{ transportPeerId: string; listenAddrs: string[] } | undefined>,
    dialHintsForChat: (peerId, listenAddrs) =>
      deps.dialHintsForChat(peerId, listenAddrs),
    emit: (event, payload) => deps.emit?.(event as never, payload as never),
    getProfileRequestCooldownMs: () => deps.profileRequestCooldownMs,
    getInFlightMap: () => deps.getInFlightMap(),
    getLastAtMap: () => deps.getLastAtMap(),
  };
}

export function buildSmallProfileDelegationsContext(
  deps: SmallProfileDelegationsContextDeps,
): SmallProfileDelegationsContext {
  return {
    getContactOwnerKeyStore: () => deps.getContactOwnerKeyStore(),
    getVaultDir: () => deps.getVaultDir(),
    signAndSaveHumanProfile: (update) =>
      deps.signAndSaveHumanProfile(update as never),
    loadHumanProfileForPhotoUpdate: () =>
      deps.loadHumanProfileForPhotoUpdate() as Promise<{ base: any; existing: any }>,
    getAgentIdentityStore: () => deps.getAgentIdentityStore(),
    assertOnline: () => deps.assertOnline(),
  };
}

export function buildValidatePairingTokenContext(deps: ValidatePairingTokenContextDeps): ValidatePairingTokenContext {
  return {
    getInMemoryToken: () => deps.getInMemoryToken(),
    getInMemoryTokenIssuedAt: () => deps.getInMemoryTokenIssuedAt(),
    getInMemoryTokenTtlMs: () => deps.pairingTokenTtlMs,
    getSessionTokenStore: () => deps.getSessionTokenStore(),
    getTaskStore: () => deps.getTaskStore(),
  };
}

export function buildPersistenceContext(deps: PersistenceContextDeps): PersistenceContext {
  return {
    recordIntent: (intent, query) => deps.recordIntent(intent, query) as never,
    persistIntentHistory: () => deps.persistIntentHistory() as never,
    loadIntentHistoryFromDisk: () => deps.loadIntentHistoryFromDisk() as never,
    persistPublishedLibrary: () => deps.persistPublishedLibrary() as never,
    loadPublishedLibraryFromDisk: () => deps.loadPublishedLibraryFromDisk() as never,
    getContactTopicsFromLibrary: (ownerId) => deps.getContactTopicsFromLibrary(ownerId) as never,
  };
}

export function buildChatRoomSyncContext(deps: ChatRoomSyncContextDeps): ChatRoomSyncContext {
  return {
    getChatRoomDeps: () => deps.getChatRoomDeps(),
  };
}

export function buildMiscDelegationsContext(deps: MiscDelegationsContextDeps): MiscDelegationsContext {
  return {
    getPendingSocialIntroProposals: () => deps.getPendingSocialIntroProposals() as any,
    resyncBondedContactReachabilityTags: () =>
      deps.resyncBondedContactReachabilityTags() as never,
    loadHumanProfile: () => deps.loadHumanProfile() as never,
    broadcastProfileSyncToBonds: (profile) => deps.broadcastProfileSyncToBonds(profile) as never,
  };
}

export function buildChainContext(deps: ChainContextDeps): ChainContext {
  return {
    store: deps.store,
    hasTaskStore: () => deps.hasTaskStore(),
    listChainReports: (params) =>
      deps.listChainReports(params) as never,
    getChainReport: (chainId) =>
      deps.getChainReport(chainId) as never,
    pinChainReport: (chainId, pinned) =>
      deps.pinChainReport(chainId, pinned),
    getChainGoal: (chainId) => deps.getChainGoal(chainId),
    getChainCostEstimate: (chainId) => deps.getChainCostEstimate(chainId),
    snapshotToResult: (snap) => deps.snapshotToResult(snap),
    bidsBySubtask: (state) => deps.bidsBySubtask(state),
    getNodeConfig: () => deps.getNodeConfig(),
    setNodeConfig: (cfg) => deps.setNodeConfig(cfg as never),
    listChainRecipes: deps.listChainRecipes
      ? () => deps.listChainRecipes!() as never
      : undefined,
    saveChainRecipe: deps.saveChainRecipe
      ? (record) =>
          deps.saveChainRecipe!(record as never) as never
      : undefined,
    deleteChainRecipe: deps.deleteChainRecipe
      ? (id) => deps.deleteChainRecipe!(id)
      : undefined,
    buildChainOrchestratorDeps: () => deps.buildChainOrchestratorDeps() as never,
    evaluateAwardAndAccept: (chainId, subtaskId, options) =>
      deps.evaluateAwardAndAccept(chainId, subtaskId, options as never) as never,
    emitChainState: (chainId) => deps.emitChainState(chainId),
    startChainTracking: (chainId) => deps.startChainTracking(chainId),
    placeholderMandate: (chainId, chainMandateId) =>
      deps.placeholderMandate(chainId, chainMandateId) as never,
    findCapabilityProviders: (capability) =>
      deps.findCapabilityProviders(capability) as never,
    chainDiagnosticsForSubtasks: (subtasks, workersBySubtask) =>
      deps.chainDiagnosticsForSubtasks(subtasks as never, workersBySubtask as never) as never,
    runChainGoal: (params) => deps.runChainGoal(params) as never,
  };
}

export function buildCallContext(deps: CallContextDeps): CallContext {
  return {
    callManager: deps.callManager,
    getProfile: () => deps.getProfile(),
    sendCallResponseEnvelope: (peerOwnerId: string, unsigned: unknown, intent: string) =>
      deps.sendCallResponseEnvelope(peerOwnerId, unsigned as never, intent),
    loadConfig: () => deps.loadConfig(),
  };
}

export interface ServiceContextDeps {
  bond: BondContextDeps;
  outboundMessaging: OutboundMessagingContextDeps;
  agentPasses: AgentPassesContextDeps;
  continuity: ContinuityContextDeps;
  fileShare: FileShareContextDeps;
  sessionToken: SessionTokenContextDeps;
  recordNodeError: RecordNodeErrorContextDeps;
  connectionStatus: ConnectionStatusContextDeps;
  nodeConfig: NodeConfigContextDeps;
  capabilityDiscovery: CapabilityDiscoveryContextDeps;
  agentSetup: AgentSetupContextDeps;
  stopNode: StopNodeContextDeps;
  manifest: ManifestContextDeps;
  fileShareNetwork: FileShareNetworkContextDeps;
  startNode: StartNodeContextDeps;
  wireMeshEvents: WireMeshEventsContextDeps;
  sharePreview: SharePreviewContextDeps;
  pairingKiosk: PairingKioskContextDeps;
  pairDevice: PairDeviceContextDeps;
  pairSharedIdentity: PairSharedIdentityContextDeps;
  getPairingPayload: GetPairingPayloadContextDeps;
  runOwnerAgentTurn: RunOwnerAgentTurnContextDeps;
  runDocumentAgentTurn: RunDocumentAgentTurnContextDeps;
  friendAutopilot: FriendAutopilotContextDeps;
  socialProxy: SocialProxyContextDeps;
  runSocialProxyPass: RunSocialProxyPassContextDeps;
  openInHerdr: OpenInHerdrContextDeps;
  terminalGetHerdrExportHint: TerminalGetHerdrExportHintContextDeps;
  terminalExec: TerminalExecContextDeps;
  terminal: TerminalContextDeps;
  bondHandler: BondHandlerContextDeps;
  chatRoomMessage: ChatRoomMessageContextDeps;
  chatMessage: ChatMessageContextDeps;
  requestPeerProfile: RequestPeerProfileContextDeps;
  smallProfileDelegations: SmallProfileDelegationsContextDeps;
  validatePairingToken: ValidatePairingTokenContextDeps;
  persistence: PersistenceContextDeps;
  chatRoomSync: ChatRoomSyncContextDeps;
  miscDelegations: MiscDelegationsContextDeps;
  chain: ChainContextDeps;
  call: CallContextDeps;
}
