/**
 * ServiceContextDeps factory for `NodeServiceImpl`.
 *
 * Extracted from `node-service-impl.ts` (`_serviceContextDeps`).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT,
  type NodeServiceEvents,
} from "@envoymesh/api";
import type { BondContext } from "./node-service-bond.js";
import type { ServiceContextDeps } from "./node-service-contexts.js";
import {
  loadBridgeConfigSkillApiKeys,
  loadBridgeConfigWebSearchEnabled,
} from "./node-service-clawhub.js";
import { loadBridgeConfigFromProfile } from "./bridge/bridge-config-store.js";
import { bridgeConfigToStatusFields } from "./bridge/config.js";
import {
  _broadcastProfileSyncToBonds,
  _loadHumanProfileForPhotoUpdate,
  _signAndSaveHumanProfile,
} from "./node-service-identity.js";
import {
  buildChainOrchestratorDeps,
  bidsBySubtask,
  findAgentNetworkWorkers,
  findAgentNetworkWorkersRanked,
  placeholderMandate,
  snapshotToResult,
  _chainDiagnosticsForSubtasks,
  _emitChainState,
  _evaluateAwardAndAccept,
  _runChainGoal,
  _startChainTracking,
} from "./node-service-chain-orchestration.js";
import {
  persistEnvoyAiChatExchangeViaRuntime,
  recordEnvoyAiHumanOutgoingViaRuntime,
  buildOpenClawTurnContextViaRuntime,
  ensureOpenClawReadyViaRuntime,
} from "./node-service-openclaw-runtime.js";
import { upsertTransferStatusViaRuntime } from "./node-service-transfer-inbound.js";
import {
  handleInboundMessageViaRuntime,
  handlePeerDiscoveredViaRuntime,
} from "./node-service-wire-mesh-events.js";
import { sendCallResponseEnvelopeViaRuntime } from "./node-service-calls.js";
import { resolveReviewPairing } from "./review-pairing.js";

const PROFILE_REQUEST_COOLDOWN_MS = 15_000;
const PAIRING_TOKEN_TTL_MS = 30 * 60 * 1000;

async function resolveReviewPairingForHost(host: any) {
  try {
    const config = await host._configStore.load();
    return resolveReviewPairing(config ?? null);
  } catch {
    return resolveReviewPairing(null);
  }
}

export function deriveRelayWsUrl(relayAddr: string): string | undefined {
  const match = relayAddr.match(/\/ip4\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
  if (!match) return undefined;
  return `ws://${match[1]}:${DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT}/ws`;
}

export function buildServiceContextDeps(host: any): ServiceContextDeps {
  return {
      bond: {
            assertOnline: () => host._assertOnline(),
            requireMesh: () => host._requireMesh(),
            requireProfile: () => host._requireProfile(),
            trustStore: host._trustStore,
            peerDirectoryStore: host._peerDirectoryStore,
            humanProfileStore: host._humanProfileStore as BondContext["humanProfileStore"],
            sessionTokenStore: host._sessionTokenStore ?? undefined,
            getPendingSocialIntroProposals: () => host._pendingSocialIntroProposals,
            getPendingHelloRequests: () => host._pendingHelloRequests,
            dialHintsForChat: (recipientPeerId, peerListenAddrs, addressFilter) =>
              host._dialHintsForChat(recipientPeerId, peerListenAddrs, addressFilter),
            deliverCallEnvelope: (transportPeerId, envelope, dialHints, listenAddrs, preferCircuitHints) =>
              host._deliverCallEnvelope(transportPeerId, envelope, dialHints, listenAddrs, preferCircuitHints),
            tagBondedContactReachability: (peerId) => {
              void host._tagBondedContactReachability(peerId);
            },
            untagReachabilityForOwner: (ownerId) => host._untagReachabilityForOwner(ownerId),
            flushPendingRoomSyncs: () => {
              void host._flushPendingRoomSyncs();
            },
            flushPendingRoomMessages: () => {
              void host._flushPendingRoomMessages();
            },
            refreshBondPeerProfiles: () => host.refreshBondPeerProfiles(),
            emit: (event, data) => host.emit(event, data as never),
          },
      outboundMessaging: {
            loadConfig: () => host._configStore.load(),
            getReachableMesh: () => host._reachableMesh(),
            requireMesh: () => host._requireMesh(),
            getDiscoverySeedStore: () => host._discoverySeedStore,
            getProfileDir: () => host._profileDir,
            peerDirectoryStore: host._peerDirectoryStore,
            getTransportCache: () => host._lastLibp2pTransportByOwner,
            setTransportCache: (ownerId, entry) => {
              host._lastLibp2pTransportByOwner.set(ownerId, entry);
            },
            deleteTransportCache: (ownerId) => {
              host._lastLibp2pTransportByOwner.delete(ownerId);
            },
            getPendingHelloRequesterPeerIds: () => host._pendingHelloRequests.values(),
            getInboundListenAddrMergeByPeer: () => host._inboundListenAddrMergeByPeer,
            assertOnline: () => host._assertOnline(),
            recordOwnerActivity: () => host.recordOwnerActivity(),
            requireProfile: () => host._requireProfile(),
            loadHumanProfile: () => host._humanProfileStore.loadHumanProfile(),
            getTrustDisplayName: async (ownerId) =>
              (await host._trustStore.getTrustRecord(ownerId))?.displayName,
            tagBondedContactReachability: (peerId) => {
              void host._tagBondedContactReachability(peerId);
            },
            flushPendingRoomSyncs: () => {
              void host._flushPendingRoomSyncs();
            },
            flushPendingRoomMessages: () => {
              void host._flushPendingRoomMessages();
            },
            getBridgeAgentPeerId: () => host._bridgeStatus?.agentPeerId,
            getSelfOwnerId: () => host._profile?.owner.ownerId?.trim(),
            getBridgeChatHandler: () => host._bridgeChatHandler ?? undefined,
            persistChatMessage: (threadPeerOwnerId, msg) => host._persistChatMessage(threadPeerOwnerId, msg),
            emitChatMessage: (msg) => host.emit("chat:message", msg),
            markOutboundChatDelivered: (threadPeerOwnerId, messageId, deliveredAt) =>
              host._markOutboundChatDelivered(threadPeerOwnerId, messageId, deliveredAt),
            learnFromMessage: (outgoing, text) => {
              host._styleAdapter?.learnFromMessage(outgoing, text);
            },
            resolvePeerTransportForOwner: (targetOwnerId) => host._resolvePeerTransportForOwner(targetOwnerId),
            deliverChatEnvelope: (transportPeerId, envelope, dialHints, listenAddrs, options) =>
              host._deliverChatEnvelope(transportPeerId, envelope, dialHints, listenAddrs, options),
            dialHintsForChat: (recipientPeerId, peerListenAddrs) =>
              host._dialHintsForChat(recipientPeerId, peerListenAddrs),
            refreshBondedRelayDialHints: (transportPeerId) =>
              host._refreshBondedRelayDialHints(transportPeerId),
          },
      agentPasses: {
            getBonds: () => host.getBonds(),
            getProfileOwnerId: () => host._profile?.owner.ownerId ?? "local-owner",
            hasTaskStore: () => Boolean(host._taskStore),
            loadConfig: () => host._configStore.load(),
            getAgentActivityStore: () => host._agentActivityStore,
            getContactTopicsFromLibrary: (ownerId) => host._getContactTopicsFromLibrary(ownerId),
            emit: (event, data) => host.emit?.(event as never, data as never),
          },
      continuity: {
            store: host._continuityStore,
            getDeviceId: () => host._profile?.owner.ownerId ?? "local-owner",
          },
      fileShare: {
            getVaultDir: () => host._vaultDir,
            getProfileDir: () => host._profileDir,
            getNodeConfig: () => host.getNodeConfig(),
            getTaskStore: () => host._taskStore,
            getRagService: () => host._getRagService(),
            recordOwnerActivity: () => host.recordOwnerActivity(),
            appendAuditEvent: (event) => host._appendAuditEvent(event),
            emit: (event, payload) => host.emit?.(event as never, payload as never),
          },
      sessionToken: {
            sessionTokenStore: host._sessionTokenStore,
          },
      recordNodeError: {
            getLastNodeError: () => host._lastNodeError,
            setLastNodeError: (v) => {
              host._lastNodeError = v;
            },
            getLastNodeErrorAt: () => host._lastNodeErrorAt,
            setLastNodeErrorAt: (v) => {
              host._lastNodeErrorAt = v;
            },
          },
      connectionStatus: {
            getLastNodeError: () => host._lastNodeError,
            getLastNodeErrorAt: () => host._lastNodeErrorAt,
            getReachableMesh: () => host._reachableMesh() as never,
            getNodeStatus: () => host._nodeStatus,
            getRelayBootstrapPeers: () => host._relayBootstrapPeers,
            hasTerminalManager: () => Boolean(host._terminalManager),
            getBridgeStatus: () => host._bridgeStatus ?? undefined,
            getRelayBook: () => host._relayBookProvider?.() ?? [],
          },
      nodeConfig: {
            getProfileDir: () => host._profileDir,
            loadNodeConfig: () => host._configStore.load(),
            saveNodeConfig: (config) => host._configStore.save(config),
            getBridgeStatus: () => host._bridgeStatus ?? undefined,
            getRelayPublicWsUrl: () => host._relayPublicWsUrl ?? null,
            loadBridgeConfigSkillApiKeys: async () => (await loadBridgeConfigSkillApiKeys()) ?? ({} as Record<string, string>),
            loadBridgeConfigWebSearchEnabled: async () => Boolean(await loadBridgeConfigWebSearchEnabled()),
            loadBridgeExtAgentSettings: async () => {
              try {
                const cfg = await loadBridgeConfigFromProfile(host._profileDir);
                const fields = bridgeConfigToStatusFields(cfg);
                return {
                  activeExtAgentId: fields.activeExtAgentId,
                  extAgents: fields.extAgents,
                  bridgeListenPort: fields.listenPort,
                };
              } catch (err) {
                console.warn("[node-config] loadBridgeExtAgentSettings failed:", err);
                return {
                  activeExtAgentId: "homeclaw",
                  extAgents: [],
                  bridgeListenPort: 3031,
                };
              }
            },
            getProfile: () => host._profile,
          },
      capabilityDiscovery: {
            getMesh: () => host._mesh,
            getProfile: () => host._profile,
            getTaskStore: () => host._taskStore,
            getDiscoverySeedStore: () => host._discoverySeedStore,
            loadConfig: () => host._configStore.load(),
            getCapabilityDiscoveryTimer: () => host._capabilityDiscoveryTimer,
            setCapabilityDiscoveryTimer: (timer) => {
              host._capabilityDiscoveryTimer = timer;
            },
            syncPairingKioskFromConfig: () => host._syncPairingKioskFromConfig(),
            loadHumanProfile: () => host._humanProfileStore.loadHumanProfile(),
            getProfileDir: () => host._profileDir,
            mergeAdvertisedDiscoveryTopics: (topics) =>
              host._mergeAdvertisedDiscoveryTopics(topics),
          },
      agentSetup: {
            saveConfig: (config) => host._configStore.save(config),
            loadConfig: () => host._configStore.load(),
            getProfileDir: () => host._profileDir,
            getProfile: () => host._profile,
            setProfile: (p) => {
              host._profile = p;
            },
            getTaskStore: () => host._taskStore,
            setTaskStore: (s) => {
              host._taskStore = s as never;
            },
            getNodeStatus: () => host._nodeStatus,
            getToolExecutionContext: () => host.getToolExecutionContext(),
          },
      stopNode: {
            getNodeStatus: () => host._nodeStatus,
            setNodeStatus: (s) => {
              host._nodeStatus = s;
            },
            emit: (event, payload) => host.emit?.(event as never, payload as never),
            clearProfileRequestInflight: () => host._profileRequestInflight.clear(),
            stopPairingKiosk: () => host.stopPairingKiosk(),
            getAndClearRelayClientSchedulerStop: () => {
              const fn = host._stopRelayClientScheduler;
              host._stopRelayClientScheduler = undefined;
              return fn;
            },
            getAndClearCapabilityDiscoveryTimer: () => {
              const t = host._capabilityDiscoveryTimer;
              host._capabilityDiscoveryTimer = undefined;
              return t;
            },
            getAndClearNodeStatsLoggingStop: () => {
              const fn = host._stopNodeStatsLogging;
              host._stopNodeStatsLogging = undefined;
              return fn;
            },
            getAndClearBondWarmTimer: () => {
              const t = host._bondWarmTimer;
              host._bondWarmTimer = undefined;
              return t;
            },
            getAndClearProfileRefreshStartupTimer: () => {
              const t = host._profileRefreshStartupTimer;
              host._profileRefreshStartupTimer = undefined;
              return t;
            },
            getAndClearChatRoomSyncFlushTimer: () => {
              const t = host._chatRoomSyncFlushTimer;
              host._chatRoomSyncFlushTimer = null;
              return t;
            },
            getMesh: () => host._mesh as never,
            setMesh: (m) => {
              host._mesh = m as never;
            },
            clearExternalMesh: () => {
              host._externalMesh = undefined;
            },
            getAndClearAdvertiseInterestsTimer: () => {
              const t = host._advertiseInterestsTimer;
              host._advertiseInterestsTimer = undefined;
              return t;
            },
            getAndClearAdvertiseInterestsStartupTimeout: () => {
              const t = host._advertiseInterestsStartupTimeout;
              host._advertiseInterestsStartupTimeout = undefined;
              return t;
            },
            getAndClearAgentCardRefreshStartupTimeout: () => {
              const t = host._agentCardRefreshStartupTimeout;
              host._agentCardRefreshStartupTimeout = undefined;
              return t;
            },
            getAndClearEarlyRelayCheckinTimer: () => {
              const t = host._earlyRelayCheckinTimer;
              host._earlyRelayCheckinTimer = undefined;
              return t;
            },
            getDeviceId: () => host._profile?.device?.deviceId,
          },
      manifest: {
            getProfileDir: () => host._profileDir,
            getCapabilityManifestStore: () => host._capabilityManifestStore as never,
            loadNodeConfig: async () => (await host._configStore.load()) as never,
            saveNodeConfig: async (cfg) => {
              await host._configStore.save(cfg as never);
            },
          },
      fileShareNetwork: {
            getVaultDir: () => host._vaultDir,
            getProfileDir: () => host._profileDir,
            getNodeConfig: () => host.getNodeConfig() as never,
            getTaskStore: () => host._taskStore as never,
            getRagService: () => host._getRagService() as never,
            recordOwnerActivity: () => host.recordOwnerActivity(),
            appendAuditEvent: (event) => host._appendAuditEvent(event),
            emit: (event, payload) => host.emit?.(event as never, payload as never),
            assertOnline: () => host._assertOnline(),
            requireMesh: () => host._requireMesh() as never,
            requireProfile: () => host._requireProfile() as never,
            resolvePeerTransportForOwner: (ownerId) =>
              host._resolvePeerTransportForOwner(ownerId) as never,
            dialHintsForChat: (peerId, listenAddrs) =>
              host._dialHintsForChat(peerId, listenAddrs) as never,
            getBonds: () => host.getBonds() as never,
            deliverCallEnvelope: (targetPeerId, envelope, dialHints, listenAddrs) =>
              host._deliverCallEnvelope(
                targetPeerId,
                envelope as never,
                dialHints,
                listenAddrs,
              ) as never,
            getTransferState: () => host._transferState,
            upsertTransferStatus: (status) => {
              upsertTransferStatusViaRuntime(
                {
                  getTransferState: () => host._transferState,
                  emit: (event, payload) =>
                    host.emit(event as keyof NodeServiceEvents, payload as never),
                },
                status as never,
              );
            },
          },
      startNode: {
            getNodeStatus: () => host._nodeStatus,
            setNodeStatus: (s) => {
              host._nodeStatus = s;
            },
            emit: (event, payload) => host.emit?.(event as never, payload as never),
            getProfile: () => host._profile,
            setProfile: (p) => {
              host._profile = p;
            },
            getTaskStore: () => host._taskStore,
            setTaskStore: (s) => {
              host._taskStore = s;
            },
            getRelayStateStore: () => host._relayStateStore,
            setRelayStateStore: (s) => {
              host._relayStateStore = s;
            },
            getDiscoverySeedStore: () => host._discoverySeedStore,
            setDiscoverySeedStore: (s) => {
              host._discoverySeedStore = s;
            },
            getTaskRuntimeStore: () => host._taskRuntimeStore,
            setTaskRuntimeStore: (s) => {
              host._taskRuntimeStore = s;
            },
            getInboundGuard: () => host._inboundGuard,
            setInboundGuard: (g) => {
              host._inboundGuard = g;
            },
            getTaskDispatcher: () => host._taskDispatcher,
            setTaskDispatcher: (d) => {
              host._taskDispatcher = d;
            },
            loadConfig: async () => {
              const cfg = await host._configStore.load();
              // Keep sync AN engine caches aligned as soon as start loads config
              // (before mesh online / Team-job handlers).
              if (cfg) {
                await host.hydrateAgentNetworkWorkerEngineFromDisk();
              }
              return cfg;
            },
            getMesh: () => host._mesh,
            setMesh: (m) => {
              host._mesh = m as never;
            },
            wireMeshEvents: () => host._wireMeshEvents(),
            setRelayBootstrapPeers: (addrs) => {
              host._relayBootstrapPeers = addrs;
            },
            setStopRelayClientScheduler: (fn) => {
              host._stopRelayClientScheduler = fn;
            },
            setRelayClientCycleDeps: (deps) => {
              host._relayClientCycleDeps = deps;
            },
            setStopNodeStatsLogging: (fn) => {
              host._stopNodeStatsLogging = fn;
            },
            setCapabilityDiscoveryTimer: (t) => {
              host._capabilityDiscoveryTimer = t;
            },
            setAdvertiseInterestsStartupTimeout: (t) => {
              host._advertiseInterestsStartupTimeout = t;
            },
            setAgentCardRefreshStartupTimeout: (t) => {
              host._agentCardRefreshStartupTimeout = t;
            },
            setLastNodeError: (v) => {
              host._lastNodeError = v;
            },
            setLastNodeErrorAt: (v) => {
              host._lastNodeErrorAt = v;
            },
            setNodeProcessStartedAtMs: (ms) => {
              host._nodeProcessStartedAtMs = ms;
            },
            startBondWarmInterval: () => host._startBondWarmInterval(),
            resyncBondedContactReachabilityTags: () =>
              host.resyncBondedContactReachabilityTags(),
            refreshAgentNetworkMembershipIndex: () => host.refreshAgentNetworkMembershipIndex(),
            refreshAgentNetworkWorkers: () => host.refreshAgentNetworkWorkers(),
            scheduleDeferredProfileRefresh: (reason) =>
              host._scheduleDeferredProfileRefresh(reason),
            advertiseInterestsIfPublic: () => host._advertiseInterestsIfPublic(),
            loadHumanProfile: () => host._humanProfileStore.loadHumanProfile(),
            loadPublishedLibraryFromDisk: () => host.loadPublishedLibraryFromDisk(),
            loadIntentHistoryFromDisk: () => host.loadIntentHistoryFromDisk(),
            recordNodeError: (context, err) => host._recordNodeError(context, err),
            ensureAgentStores: () => host._ensureAgentStores(),
            runCapabilityDiscoveryCycle: (source, opts) =>
              host._runCapabilityDiscoveryCycle(source, opts),
            startCapabilityDiscoveryScheduler: (runtime) =>
              host._startCapabilityDiscoveryScheduler(runtime),
            setBootstrapPeerIds: (ids) => { host._bootstrapPeerIdSet = ids; },
          },
      wireMeshEvents: {
            mesh: host._mesh as never,
            onMessage: (params) => handleInboundMessageViaRuntime(host._meshInboundContext(), params),
            onPeerDiscovered: (params) =>
              handlePeerDiscoveredViaRuntime(
                { handleMeshPeerDiscovered: (peerId, multiaddrs) => host.handleMeshPeerDiscovered(peerId, multiaddrs) },
                params,
              ),
            onPeerDisconnect: (peerId) => host.emit("peer:lost", { nodeId: peerId }),
            onPeerConnect: (params) =>
              handlePeerDiscoveredViaRuntime(
                { handleMeshPeerDiscovered: (peerId, multiaddrs) => host.handleMeshPeerDiscovered(peerId, multiaddrs) },
                params,
              ),
          },
      sharePreview: {
            recordInboundPullSharePreview: (input) =>
              host.recordInboundPullSharePreview(input),
            linkOutboundSharePreviewFromInbound: (messageId, inReplyTo) =>
              host.linkOutboundSharePreviewFromInbound(messageId, inReplyTo),
          },
      pairingKiosk: {
            loadConfig: () => host._configStore.load(),
            getKiosk: () => host._pairingKiosk,
            setKiosk: (handle) => {
              host._pairingKiosk = handle;
            },
            stopKiosk: () => host.stopPairingKiosk(),
            getTaskStore: () => host._taskStore,
            getCompanyInviteContext: () => host._companyInviteInviteContext(),
          },
      pairDevice: {
            validatePairingToken: (token) => host.validatePairingToken(token),
            consumeCompanyInvite: (token, ownerId, deviceId) =>
              host._consumeCompanyInviteOrThrow(token, ownerId, deviceId),
            setTrustRecordDirect: (record) =>
              host._trustStore.setTrustRecord(record as never).then(() => undefined) as Promise<void>,
            mergeInboundDeviceBinding: (input) =>
              host._peerDirectoryStore.mergeInboundDeviceBinding(input),
            sessionTokenStore: host._sessionTokenStore,
            getBridgeStatus: () => host.getBridgeStatus(),
          },
      pairSharedIdentity: {
            requireProfile: () => host._requireProfile(),
            validatePairingToken: (token) => host.validatePairingToken(token),
            consumeCompanyInvite: (token, ownerId, deviceId) =>
              host._consumeCompanyInviteOrThrow(token, ownerId, deviceId),
            setTrustRecordDirect: (record) =>
              host._trustStore.setTrustRecord(record as never).then(() => undefined) as Promise<void>,
            mergeInboundDeviceBinding: (input) =>
              host._peerDirectoryStore.mergeInboundDeviceBinding(input),
            sessionTokenStore: host._sessionTokenStore,
            deviceAuthorizationStore: host._deviceAuthorizationStore,
            getBridgeStatus: () => host.getBridgeStatus(),
          },
      getPairingPayload: {
            getBridgeStatus: () => host.getBridgeStatus(),
            getReachableMesh: () => (host._mesh ?? host._externalMesh) as never,
            getWsPort: () => host._wsPort,
            getWsPath: () => host._wsPath,
            getRelayPublicWsUrl: () => host._relayPublicWsUrl,
            getRelayBootstrapPeers: () => host._relayBootstrapPeers,
            getConfiguredRelays: async () => {
              try {
                const config = await host._configStore.load();
                return config?.configuredRelays ?? [];
              } catch {
                return [];
              }
            },
            getReviewPairing: () => resolveReviewPairingForHost(host),
            getProfile: () => host._profile,
            deriveRelayWsUrl: (addr) => deriveRelayWsUrl(addr),
            autoDiscoverRelayWsUrl: () => host._autoDiscoverRelayWsUrl(),
            autoDiscoverRelayPeerId: () => host._autoDiscoverRelayPeerId(),
            setPairingToken: (token, issuedAt) => {
              host._pairingToken = token;
              host._pairingTokenIssuedAt = issuedAt;
            },
          },
      runOwnerAgentTurn: {
            openClawState: host._openClawState,
            getOpenClawRuntimeDeps: () => host._openClawRuntimeDeps(),
            recordOwnerActivity: () => host.recordOwnerActivity(),
            askOpenClaw: (msg, ctx) => host.askOpenClaw(msg, ctx as never),
            persistEnvoyAiChatExchange: (raw, turn, humanMsgId) =>
              persistEnvoyAiChatExchangeViaRuntime(host._openClawRuntimeDeps(), raw, turn, humanMsgId),
            recordEnvoyAiHumanOutgoing: (msg, humanMsgId) =>
              recordEnvoyAiHumanOutgoingViaRuntime(host._openClawRuntimeDeps(), msg, humanMsgId),
            maybeIngestTerminalAssistantReply: (sid, answer) =>
              host._maybeIngestTerminalAssistantReply(sid, answer),
            getRagService: () => host._getRagService() as never,
            getTaskStore: () => host._taskStore as never,
            runDocumentAgentTurnCore: (msg) => host._runDocumentAgentTurnCore(msg) as never,
            getApprovalQueue: () => host._approvalQueue as never,
            getScriptedTutorState: async () => {
              const profile = await host._humanProfileStore.loadHumanProfile();
              const bonds = await host.getBonds();
              const cfg = await host._configStore.load();
              return {
                bondCount: bonds.length,
                interestCount:
                  (profile?.hobbies?.length ?? 0) + (profile?.knowledge?.length ?? 0),
                hasModel: cfg?.modelProviders?.mode
                  ? cfg.modelProviders.mode !== "disabled"
                  : false,
              };
            },
          },
      runDocumentAgentTurn: {
            requireToolExecutionContext: () => host._requireToolExecutionContext(),
            listLibraryItems: (q) =>
              host.listLibraryItems(q ? { query: q.query } : undefined) as never,
            getBonds: () => host.getBonds() as never,
            knowledgeQuery: (question) => host.knowledgeQuery(question) as never,
            discoverPublishedLibrary: (p) =>
              host.discoverPublishedLibrary(p as never) as never,
            sendAgentChat: (targetOwnerId, text) =>
              host.sendAgentChat(targetOwnerId, text) as never,
            recordH2aOwnerTurn: (msg, turn) =>
              host.recordH2aOwnerTurn(msg, turn as never),
            runDocumentAgentTurnCore: (msg) => host._runDocumentAgentTurnCore(msg),
          },
      friendAutopilot: {
            getNodeConfig: () => host.getNodeConfig(),
            recordFriendAutopilotPass: (record) =>
              host._recordFriendAutopilotPass(record),
            updateNodeConfig: (cfg) => host.updateNodeConfig(cfg as never),
            getToolExecutionContext: () => host.getToolExecutionContext() as never,
          },
      socialProxy: {
            getSocialProxyStore: () => (host._socialProxyStore as never) ?? undefined,
            getNodeConfig: () => host.getNodeConfig(),
            getSocialProxyOrchestratorDeps: (config) =>
              host._socialProxyOrchestratorDeps(config) as never,
            getPendingSocialIntroProposals: () => host._pendingSocialIntroProposals as never,
          },
      runSocialProxyPass: {
            getNodeConfig: () => host.getNodeConfig(),
            getSocialProxyOrchestratorDeps: (config) =>
              host._socialProxyOrchestratorDeps(config) as never,
            hasSocialProxyStore: () => Boolean(host._socialProxyStore),
            updateNodeConfig: (cfg) => host.updateNodeConfig(cfg as never),
          },
      openInHerdr: {
            resolveOpenClawWorkspaceDir: () => host._resolveOpenClawWorkspaceDir(),
          },
      terminalGetHerdrExportHint: {
            getProfileDir: () => host._profileDir,
            requireTerminalManager: () => host._requireTerminalManager(),
          },
      terminalExec: {
            requireTerminalManager: () => host._requireTerminalManager(),
          },
      terminal: {
            requireTerminalManager: () => host._requireTerminalManager(),
            requireTerminalAgentAssist: () => host._requireTerminalAgentAssist(),
          },
      bondHandler: {
            getTaskStore: () => host._taskStore,
            getProfile: () => host._profile,
            getTrustStore: () => host._trustStore,
            storePendingHelloRequest: (data) => host.storePendingHelloRequest(data),
            emit: (event, payload) => host.emit?.(event as never, payload as never),
            flushPendingRoomSyncs: () => host._flushPendingRoomSyncs(),
            flushPendingRoomMessages: () => host._flushPendingRoomMessages(),
            ensurePeerFromInboundChat: (input) =>
              host._peerDirectoryStore.ensurePeerFromInboundChat(input),
            tagBondedContactReachability: (remotePeerId) =>
              host._tagBondedContactReachability(remotePeerId),
            tryBondAutonomyAutoAccept: host._tryBondAutonomyAutoAccept?.bind(host),
          },
      chatRoomMessage: {
            getTaskStore: () => host._taskStore,
            getChatDraftStore: () => host._chatDraftStore,
            getProfile: () => host._profile,
            getChatLogStore: () => host._chatLogStore,
            getHumanProfileStore: () => host._humanProfileStore,
            getAgentIdentityStore: () => host._agentIdentityStore,
            getTrustStore: () => host._trustStore,
            getPeerDirectoryStore: () => host._peerDirectoryStore,
            getStyleAdapter: () => host._styleAdapter,
            getVaultDir: () => host._vaultDir,
            getConfigStore: () => host._configStore,
            getApprovalQueue: () => host._approvalQueue,
            getAutoReplyLimitStore: () => host._autoReplyLimitStore,
            getNodeConfig: () => host.getNodeConfig(),
            getChatRoomDeps: () => host._chatRoomDeps(),
            sendAgentChat: (targetOwnerId, text) =>
              host.sendAgentChat(targetOwnerId, text) as never,
            emit: (event, payload) => host.emit?.(event as never, payload as never),
          },
      chatMessage: {
            getTaskStore: () => host._taskStore,
            getChatDraftStore: () => host._chatDraftStore,
            getChatLogStore: () => host._chatLogStore,
            getProfile: () => host._profile,
            getHumanProfileStore: () => host._humanProfileStore,
            getTrustStore: () => host._trustStore,
            getPeerDirectoryStore: () => host._peerDirectoryStore,
            getStyleAdapter: () => host._styleAdapter,
            getVaultDir: () => host._vaultDir,
            getConfigStore: () => host._configStore,
            getApprovalQueue: () => host._approvalQueue,
            getAutoReplyLimitStore: () => host._autoReplyLimitStore,
            getNodeConfig: () => host.getNodeConfig(),
            getMesh: () => host._mesh,
            persistChatMessage: (senderOwnerId, msg) =>
              host._persistChatMessage(senderOwnerId, msg),
            reconcileInboundDirectChatMessage: (senderOwnerId, msg) =>
              host.reconcileInboundDirectChatMessage(senderOwnerId, msg),
            emit: (event, payload) => host.emit?.(event as never, payload as never),
            sendAgentChat: (targetOwnerId, text) =>
              host.sendAgentChat(targetOwnerId, text) as never,
            tagBondedContactReachability: (remotePeerId) =>
              host._tagBondedContactReachability(remotePeerId),
            isOwnerOnline: () => host.isOwnerOnline(),
            askOpenClaw: (prompt, context) => host.askOpenClaw(prompt, context as never),
            buildOpenClawTurnContext: () =>
              buildOpenClawTurnContextViaRuntime(host._openClawRuntimeDeps()),
            ensureOpenClawReady: () =>
              ensureOpenClawReadyViaRuntime(host._openClawState, host._openClawRuntimeDeps()),
          },
      requestPeerProfile: {
            requireMesh: () => host._requireMesh() as never,
            requireProfile: () => host._requireProfile(),
            getContactOwnerKeyStore: () => host._contactOwnerKeyStore ?? undefined,
            getPeerProfileCacheStore: () => host._peerProfileCacheStore ?? undefined,
            getPeerDirectoryStore: () => host._peerDirectoryStore,
            resolvePeerTransportForOwner: (id) =>
              host._resolvePeerTransportForOwner(id) as Promise<{ recipientEnvelopePeerId: string }>,
            resolveLibp2pPeerForBondOwner: (id) =>
              host._resolveLibp2pPeerForBondOwner(id) as Promise<{ transportPeerId: string; listenAddrs: string[] } | undefined>,
            dialHintsForChat: (peerId, listenAddrs) =>
              host._dialHintsForChat(peerId, listenAddrs),
            emit: (event, payload) => host.emit?.(event as never, payload as never),
            profileRequestCooldownMs: PROFILE_REQUEST_COOLDOWN_MS,
            getInFlightMap: () => host._profileRequestInflight,
            getLastAtMap: () => host._profileRequestLastAt,
          },
      smallProfileDelegations: {
            getContactOwnerKeyStore: () => host._contactOwnerKeyStore ?? undefined,
            getVaultDir: () => host._vaultDir,
            signAndSaveHumanProfile: (update) =>
              _signAndSaveHumanProfile(host._identityContext(), update as never),
            loadHumanProfileForPhotoUpdate: () =>
              _loadHumanProfileForPhotoUpdate(host._identityContext()) as Promise<{ base: any; existing: any }>,
            getAgentIdentityStore: () => host._agentIdentityStore ?? undefined,
            assertOnline: () => host._assertOnline(),
          },
      validatePairingToken: {
            getReviewPairing: () => resolveReviewPairingForHost(host),
            getInMemoryToken: () => host._pairingToken ?? undefined,
            getInMemoryTokenIssuedAt: () => host._pairingTokenIssuedAt ?? undefined,
            pairingTokenTtlMs: PAIRING_TOKEN_TTL_MS,
            getSessionTokenStore: () => host._sessionTokenStore ?? undefined,
            getTaskStore: () => host._taskStore,
          },
      persistence: {
            recordIntent: (intent, query) => host._intentHistoryStore.record(intent, query) as never,
            persistIntentHistory: () => host._intentHistoryStore.persist() as never,
            loadIntentHistoryFromDisk: () => host._intentHistoryStore.loadFromDisk() as never,
            persistPublishedLibrary: () => host._publishedLibraryStore.persist() as never,
            loadPublishedLibraryFromDisk: () => host._publishedLibraryStore.loadFromDisk() as never,
            getContactTopicsFromLibrary: (ownerId) => host._publishedLibraryStore.getTopicsForContact(ownerId) as never,
          },
      chatRoomSync: {
            getChatRoomDeps: () => host._chatRoomDeps(),
          },
      miscDelegations: {
            getPendingSocialIntroProposals: () => host._pendingSocialIntroProposals as any,
            resyncBondedContactReachabilityTags: () =>
              host.resyncBondedContactReachabilityTags() as never,
            loadHumanProfile: () => host._humanProfileStore.loadHumanProfile() as never,
            broadcastProfileSyncToBonds: (profile) => _broadcastProfileSyncToBonds(host._identityContext(), profile) as never,
          },
      chain: {
        store: host._chainStore,
        hasTaskStore: () => Boolean(host._taskStore),
        listChainReports: (params) => host._taskStore!.listChainReports(params) as never,
        getChainReport: (chainId) => host._taskStore!.getChainReport(chainId) as never,
        pinChainReport: (chainId, pinned) => host._taskStore!.pinChainReport(chainId, pinned),
        deleteChainReport: (chainId) => host._taskStore!.deleteChainReport(chainId),
        getChainGoal: (chainId) => host._chainState.goals.get(chainId),
        getChainCostEstimate: (chainId) => host._chainState.costEstimates.get(chainId),
        getChainAwardMode: (chainId) => host._chainState.awardModes.get(chainId),
        getChainShowCostUi: (chainId) => host._chainState.showCostUi.get(chainId),
        snapshotToResult: (snap) => snapshotToResult(snap),
        bidsBySubtask: (state) => bidsBySubtask(state),
        getNodeConfig: () => host.getNodeConfig(),
        setNodeConfig: (cfg) => host.updateNodeConfig(cfg as never),
        listChainRecipes: host._taskStore
          ? () => host._taskStore!.listChainRecipes() as never
          : undefined,
        saveChainRecipe: host._taskStore
          ? (record) => host._taskStore!.saveChainRecipe(record as never) as never
          : undefined,
        deleteChainRecipe: host._taskStore
          ? (id) => host._taskStore!.deleteChainRecipe(id)
          : undefined,
        buildChainOrchestratorDeps: () => buildChainOrchestratorDeps(host._chainOrchestrationContext()) as never,
        evaluateAwardAndAccept: (chainId, subtaskId, options) =>
          _evaluateAwardAndAccept(host._chainOrchestrationContext(), chainId, subtaskId, options as never) as never,
        emitChainState: (chainId) => _emitChainState(host._chainOrchestrationContext(), chainId),
        startChainTracking: (chainId) => _startChainTracking(host._chainOrchestrationContext(), chainId),
        placeholderMandate: (chainId, chainMandateId) =>
          placeholderMandate(chainId, chainMandateId) as never,
        findAgentNetworkWorkers: (capability) =>
          findAgentNetworkWorkers(host._chainOrchestrationContext(), capability) as never,
        findAgentNetworkWorkersRanked: (capability, preferredWorkerPeerIds) =>
          findAgentNetworkWorkersRanked(host._chainOrchestrationContext(), capability, preferredWorkerPeerIds) as never,
        chainDiagnosticsForSubtasks: (subtasks, workersBySubtask, rankedBySubtask) =>
          _chainDiagnosticsForSubtasks(
            subtasks as never,
            workersBySubtask as never,
            rankedBySubtask,
          ) as never,
        runChainGoal: (params) => _runChainGoal(host._chainOrchestrationContext(), params) as never,
      },
      call: {
        callManager: host.callManager,
        getProfile: () => host._profile,
        sendCallResponseEnvelope: (peerOwnerId, unsigned, intent) =>
          sendCallResponseEnvelopeViaRuntime(host._callContext(), peerOwnerId, unsigned as never, intent),
        loadConfig: () => host._configStore.load(),
      },
  };
}
