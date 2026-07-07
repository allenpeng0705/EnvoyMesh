import "./ensure-node-version.js";
import "./dom-event-polyfill.js";
import { evaluateCapability } from "@envoymesh/bonds";
import { createAgentCardAutoFetcher } from "./agent-card-auto-fetcher.js";
import { matchPeerInterests } from "./connection-suggester.js";
import {
  auditEventForDispatcherDecision,
  buildRelayManagerSnapshot,
  createApprovalRequest,
  createAuditEvent,
  createHumanProfileStore,
  createAgentIdentityStore,
  createLocalChatLogStore,
  createChatDraftStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createLocalPeerReputationStore,
  createContactOwnerKeyStore,
  createRelayStateStore,
  createTaskRuntimeStateStore,
  createCapabilityManifestStore,
  createDeviceAuthorizationStore,
  createAgentCardStore,
  deriveCorrelationIdFromEnvelope,
  loadOrCreateNodeProfile,
  RELAY_MANAGER_SNAPSHOT_PROTOCOL,
  saveNodeProfile,
  serializeRelayManagerSnapshot,
  type PersistedRelayBookEntry,
  type PersistedRelaySummaryEntry,
  type RelayManagerRuntimeState,
  type ChatDraftStore,
  createAutoReplyLimitStore,
  AUDIT_QUERY_INDEX_FILE,
} from "@envoymesh/local-store";
import {
  createAgentCredential,
  createSignedDataTransferVoucher,
  deriveAgentId,
  derivePeerId,
  generateAgentIdentity,
  signHumanProfile,
  signUnsignedEnvelope,
  verifyAuthorizedDeviceEnvelope,
  verifyDeviceCertificate,
  verifyHumanProfile,
} from "@envoymesh/identity";
import {
  CapabilityRegistry,
  CLIENT_PROXY_PROTOCOL,
  ENVOY_CHAT_PROTOCOL,
  ENVOY_DATA_PROTOCOL,
  ENVOY_MESSAGE_PROTOCOL,
  EnvoyMesh,
  type EnvoyMeshOptions,
  filterBootstrapMultiaddrs,
  filterRelayControlTargets,
  filterUsableOutboundPeerDialHints,
  voucherJsonBytesFromObject,
  type P2pDebugEvent,
} from "@envoymesh/network";
import {
  createDiscoveryResponsePayload,
  createDevicePairApprovePayload,
  createDevicePairDeferredPayload,
  createRelayCheckinPayload,
  createRelayHintsResponsePayload,
  createRelayJoinResponsePayload,
  createRelayLookupPayload,
  createRelayLookupResponsePayload,
  createRelayRegisterResponsePayload,
  createRelaySummaryPayload,
  createTaskCancelPayload,
  createUnsignedDataTransferVoucher,
  parseDevicePairApprovePayload,
  parseDevicePairDeferredPayload,
  parseDevicePairRequestPayload,
  parseChatMessagePayload,
  parseChatRoomSyncPayload,
  parseChatRoomMessagePayload,
  parseRelayCheckinPayload,
  parseRelayHintsRequestPayload,
  parseRelayHintsResponsePayload,
  parseRelayJoinRequestPayload,
  parseRelayLookupPayload,
  parseRelayLookupResponsePayload,
  parseRelayPeersResponsePayload,
  parseRelayRegisterPayload,
  parseRelaySummaryPayload,
  createSystemPingPayload,
  createSystemSignalPayload,
  createKnowledgeResponsePayload,
  createAgentCardResponsePayload,
  createSharePreviewPayload,
  parseShareRequestPayload,
  parseSharePreviewPayload,
  parseShareAcceptPayload,
  createUnsignedEnvelope,
  createBondAcceptPayload,
  createHumanProfilePayload,

  parseSystemPingPayload,
  parseSystemSignalPayload,
  parseDiscoveryRequestPayload,
  parseDiscoveryResponsePayload,
  parseTaskCancelPayload,
  parseRendezvousRegisterPayload,
  parseRendezvousQueryPayload,
  createRendezvousResponsePayload,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
  type EnvoyEnvelope,
  type RelayHint,
  type RelayLookupPayload,
  type RelayLookupResponsePayload,
  type RelayPeerCandidate,
  type HumanProfilePayload,
} from "@envoymesh/protocol";
import { handleProfileIntentViaRuntime } from "./cli-mesh-inbound-profile-intent.js";
import { handleDevicePairDeferredViaRuntime } from "./cli-mesh-inbound-device-pair-deferred.js";
import { handleDevicePairApproveViaRuntime } from "./cli-mesh-inbound-device-pair-approve.js";
import { handleSystemSignalViaRuntime } from "./cli-mesh-inbound-system-signal.js";
import { handleDiscoveryViaRuntime } from "./cli-mesh-inbound-discovery.js";
import { handleBroadcastViaRuntime } from "./cli-mesh-inbound-broadcast.js";
import { handleRelayPeersViaRuntime } from "./cli-mesh-inbound-relay-peers.js";
import { handleOfficialCredentialViaRuntime } from "./cli-mesh-inbound-official-credential.js";
import { handleTaskFeedbackViaRuntime } from "./cli-mesh-inbound-task-feedback.js";
import { handleChatRoomSyncViaRuntime } from "./cli-mesh-inbound-chat-room-sync.js";
import { handleChatRoomMessageViaRuntime } from "./cli-mesh-inbound-chat-room-message.js";
import { handleAgentCardViaRuntime } from "./cli-mesh-inbound-agent-card.js";
import { handleSyncStateViaRuntime } from "./cli-mesh-inbound-sync-state.js";
import { handleShareAcceptViaRuntime } from "./cli-mesh-inbound-share-accept.js";
import { handleShareRequestViaRuntime } from "./cli-mesh-inbound-share-request.js";
import { handleKnowledgeQueryViaRuntime } from "./cli-mesh-inbound-knowledge-query.js";
import { handleCliSharePreviewViaRuntime } from "./cli-mesh-inbound-share-preview.js";
import { handleSystemPingViaRuntime } from "./cli-mesh-inbound-system-ping.js";
import { buildVaultIndex } from "@envoymesh/vault";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseNodeArgs, applyPersistedDiscoveryConfig, type NodeArgs } from "./args.js";
import { buildOutboundCliEnvelopes } from "./cli-actions.js";
import { deliverOutboundEnvelope, deliverOutboundExpectReply } from "./mesh-outbound-helper.js";
import { createInboundMessageGuard } from "./inbound-guard.js";
import { chatSenderActorFromEnvelope, resolveEmpSupportedCapabilities } from "@envoymesh/api";
import { buildSignedChatDeliveredEnvelope } from "@envoymesh/api/chat-delivered";
import { verifyInboundChatDevice, formatChatSenderDisplayName, bindDeviceAuthorizationStore } from "./chat-device-auth.js";
import { chatWireAttachmentsToContent } from "@envoymesh/api";
import { buildOutboundDialHints } from "./outbound-dial-hints.js";
import {
  dialableInboundRemoteAddrs,
  INBOUND_LISTEN_ADDR_MERGE_MIN_MS,
  mergeInboundPeerDialHintsIfDue,
} from "./inbound-dial-hint-learn.js";
import { loadOrCreateLibp2pPrivateKey } from "./libp2p-key-loader.js";
import { handleInboundBondIntent } from "./bond-inbound.js";
import { tryBondAutonomyInboundAutoAccept } from "./bond-autonomy-inbound.js";
import { createBondAutonomyDailyCounter } from "./bond-autonomy-daily-counter.js";
import { handleInboundSocialIntroIntent } from "./social-intro-inbound.js";
import { handleInboundDiscoveryIntent, handleInboundRelayPeersIntent, expandCircuitDialCandidates, processDiscoveryQueue } from "./discovery-inbound.js";
import { handleInboundSyncStateIntent } from "./sync-state-inbound.js";
import { handleInboundBroadcastRequest, handleInboundBroadcastResponse } from "./broadcast-inbound.js";
import { pushNotificationService } from "./push-notification.js";
import { applyLanAutoBondAccept, evaluateLanAutoBondReceipt } from "./node-service-lan-auto-bond.js";
import { handleInboundTaskFeedback, handleInboundOfficialCredential } from "./reputation-inbound.js";
import { handleInboundKnowledgeQuery } from "./knowledge-query-inbound.js";
import { handleDaemonAgentCardInbound } from "./daemon-agent-card-inbound.js";
import { handleDaemonTaskInbound } from "./daemon-task-inbound.js";
import { handleInboundShareRequest, handleInboundShareAccept, resolveSenderOwnerId } from "./share-inbound.js";
import { runInboundChatAssist } from "./inbound-chat-assist.js";
import { chatLogRowsToViews } from "./ai-context.js";
import { createRagService, type RagService } from "./rag-service.js";
import { ModeController, createDefaultModeConfig } from "./mode-controller.js";
import { FileSessionStore, SessionManager } from "./session-manager.js";
import { StyleAdapter } from "./style-adapter.js";
import { TriggerStore } from "./trigger-store.js";
import { ApprovalQueue } from "@envoymesh/api";
import { DigestGenerator, createDefaultDigestConfig, getDigestPeriodDates } from "./digest-generator.js";
import type { AutonomousDomain, AutonomousPolicy, AiSettings, ChatMessage, ContactAiPreferences } from "@envoymesh/api";
import { buildVaultIndexOptionsFromKnowledgeBase } from "@envoymesh/api";
import { deriveLocationDiscoveryTopics } from "@envoymesh/api";
import { stripModelThinking, applyAiIdentityForIdentity, ENVOY_AI_THREAD_KEY } from "@envoymesh/api";
import { resolveNodeArgsTargetsByOwnerId } from "./owner-targeting.js";
import { createTaskDispatcher, isA2ATaskIntent, type DispatcherDecision } from "./task-dispatcher.js";
import { installEnvoyDataTransferReceiver } from "./data-transfer-inbound.js";
import { createNodeService, NodeServiceImpl } from "./node-service-impl.js";
import { createNodeConfigStore } from "./node-config-store.js";
import { WsServer } from "./ws-server.js";
import { TerminalManager } from "./terminal-manager.js";
import { TerminalAgentAssist } from "./terminal-agent-assist.js";
import { TerminalWsServer } from "./terminal-ws-server.js";
import type { ModelProviderConfig } from "@envoymesh/api";
import { evaluateInboundEnvelopeRolePolicy } from "./role-policy.js";
import {
  BRIDGE_HTTP_PORT,
  OPENCLAW_GATEWAY_PORT,
  SOCIAL_WS_PORT,
  TERMINAL_WS_PORT,
  openClawGatewayWebhookUrl,
  socialWsLoopbackUrl,
  devServicePortsConfigured,
} from "./service-ports.js";
import { createBridge } from "./bridge/index.js";
import { executeTool as runRegistryTool, listAgentTools } from "./tool-registry.js";
import { loadBridgeIdentity, saveBridgeIdentity } from "./bridge/identity-store.js";
import type { BridgeConfig } from "./bridge/config.js";
import { BridgeConfigSchema, resolveAssistantAgentUrl, applyActiveExtAgent, bridgeConfigToStatusFields } from "./bridge/config.js";
import {
  ExternalAgentGateway,
  createExternalAgentSession,
  DEFAULT_AGENT_CAPABILITIES,
} from "./external-agent-gateway.js";
import { createDiscoverySeedStore } from "./discovery-seed-store.js";
import {
  peerDiscoverySourceFromMultiaddrs,
  shouldPersistPeerDiscoverySeeds,
  shouldRecordPeerDiscoveryAudit,
  seedAddrsForDiscoveryProfile,
} from "./peer-discovery-telemetry.js";
import { resolveBootstrapAddresses } from "./bootstrap-resolver.js";
import { raceStunServers } from "./stun.js";
import { upnpDiscoverAndMap, DEFAULT_LIBP2P_PORT } from "./upnp.js";
import {
  addRelayCandidates,
  createRelayClientState,
  createRelayRoster,
  noteRelayFailure,
  noteRelaySuccess,
} from "./relay-roster.js";
import { getRelayClientAdvertisedTopics } from "./relay-client-cycle.js";
import { createRelayLookupRouter } from "./relay-lookup-router.js";
import { logRelayReachableAddrsForCheckin, logRelayServerCheckinAccepted, logRelayServerLookupResponse, logClientRelayLookupResponse, describeMultiaddrReachability } from "./relay-checkin-log.js";
import {
  createInitialRelayHealthState,
  evaluateRelayHealth,
  isRelayClientNode,
  type RelayHealthSnapshot,
  type RelayHealthState,
} from "./relay-health.js";
import {
  LIBP2P_RESTART_MIN_INTERVAL_MS,
  RELAY_HEALTH_REPROBE_MIN_INTERVAL_MS,
  shouldRunThrottledRepair,
} from "./libp2p-repair-policy.js";
import {
  createInitialNodeHealthState,
  evaluateNodeHealth,
  type NodeHealthSnapshot,
  type NodeHealthState,
} from "./node-health.js";
import { createClientProxyHandler } from "./client-proxy-handler.js";
import { RelayTunnelClient } from "./relay-tunnel-client.js";
import { startNodeStatsInterval } from "./node-stats-log.js";
import { recordRelayCheckinCycle, recordRelayLookupResult } from "./relay-diagnostics-state.js";
import { runCapabilityDiscoveryCycle, buildProfileDiscoveryTopics } from "./capability-discovery.js";
import {
  resolveConnectivityRuntime,
  recordMeshActivity,
  shouldRunPeriodicCapabilityFind,
  type ResolvedConnectivityRuntime,
} from "./connectivity-runtime.js";

const args = parseNodeArgs(process.argv.slice(2));
const profile = await loadOrCreateNodeProfile(args.profileDir);
const taskDispatcher = createTaskDispatcher();
const taskStore = createLocalTaskStore(args.profileDir);
try {
  const auditIndexPath = join(args.profileDir, AUDIT_QUERY_INDEX_FILE);
  const auditIndexStat = await stat(auditIndexPath);
  const auditIndexMb = auditIndexStat.size / (1024 * 1024);
  if (auditIndexMb > 32) {
    await unlink(auditIndexPath);
    console.warn(
      `[audit] removed bloated ${AUDIT_QUERY_INDEX_FILE} (${auditIndexMb.toFixed(0)}MB) — ` +
        "wan-default inbound traffic was starving the Social WebSocket; index rebuilds on next query",
    );
  }
} catch {
  // missing index is fine
}
// Run cost-rollup retention once at startup (non-blocking): collapses daily
// rows older than 30 days into monthly rows and drops monthly rows older than
// a year. Follows the chain-reports-store precedent of caller-driven GC, but
// triggered here so the file stays bounded without manual RPC calls.
void taskStore.runCostRollupRetention().catch((err) => {
  console.warn("[cost-rollup] startup retention failed:", err);
});
const trustStore = createLocalTrustStore(args.profileDir);
const peerDirectoryStore = createLocalPeerDirectoryStore(args.profileDir);
const humanProfileStore = createHumanProfileStore(args.profileDir);
const agentIdentityStore = createAgentIdentityStore(args.profileDir);
const chatLogStore = createLocalChatLogStore(args.profileDir);
const chatDraftStore = createChatDraftStore(args.profileDir);
const autoReplyLimitStore = createAutoReplyLimitStore(args.profileDir);
const capabilityManifestStore = createCapabilityManifestStore(args.profileDir);
const reputationStore = createLocalPeerReputationStore(args.profileDir);
const contactOwnerKeyStore = createContactOwnerKeyStore(args.profileDir);
const nodeConfigStore = createNodeConfigStore(args.profileDir);
const bondAutonomyDailyCounter = createBondAutonomyDailyCounter(args.profileDir);
const deviceAuthorizationStore = createDeviceAuthorizationStore(args.profileDir);
const agentCardStore = createAgentCardStore(args.profileDir);
bindDeviceAuthorizationStore(deviceAuthorizationStore);
const persistedNodeConfig = await nodeConfigStore.load();
if (persistedNodeConfig) {
  applyPersistedDiscoveryConfig(args, persistedNodeConfig);
  console.log(
    `[connectivity] persisted profile=${persistedNodeConfig.discoveryProfile} presets=${persistedNodeConfig.bootstrapPresets.join(",") || "(none)"}`,
  );
}

const vaultDirForNode = process.env.ENVOYMESH_VAULT ?? join(process.cwd(), "shared_vault");

// Model provider configuration — loaded from persisted config after nodeService is created
let currentModelProviders: ModelProviderConfig = { mode: "mock" };
let currentChatAssistEnabled = false;
let currentAutonomousKillSwitch = false;
let currentAutonomousPolicies: readonly AutonomousPolicy[] = [];
let currentTrustModeEnabled = false;
let currentKnowledgeSyndicationMaxSensitivity:
  | import("@envoymesh/api").KnowledgeSyndicationSensitivity
  | undefined;
let currentAiSettings: AiSettings | undefined;
let currentContactAiPrefs: Map<
  string,
  {
    aiAccessLevel: "none" | "assistant_only" | "full";
    knowledgeAccess: "public" | "professional" | "personal";
    priority: "high" | "low";
    syndicationMaxSensitivity?: "public" | "friends" | "private";
  }
> = new Map();

// Start Social WS before bridge/vault/libp2p so the UI can connect immediately.
let wsServerForEvents: WsServer | null = null;
const approvalQueue = new ApprovalQueue();
const nodeService = createNodeService(
  undefined,
  trustStore,
  peerDirectoryStore,
  humanProfileStore,
  args.profileDir,
  profile,
  vaultDirForNode,
);
const modeController = new ModeController(createDefaultModeConfig(), taskStore);
const sessionManager = new SessionManager(new FileSessionStore(join(args.profileDir, "sessions")));
const styleAdapter = new StyleAdapter();
const triggerStore = new TriggerStore();
const digestGenerator = new DigestGenerator(
  createDefaultDigestConfig(join(args.profileDir, "digests")),
);
const wsServer = new WsServer(SOCIAL_WS_PORT, "/ws", {
  onConnectionChange: (connectedCount) => {
    if (connectedCount > 0) {
      modeController.markOwnerConnected();
    } else {
      modeController.markOwnerDisconnected();
    }
  },
});
wsServer.start(nodeService);
wsServerForEvents = wsServer;
if (nodeService instanceof NodeServiceImpl) {
  nodeService.setWsListenAddress(SOCIAL_WS_PORT, "/ws");
  nodeService.bindCliTaskStore(taskStore);
  nodeService.bindApprovalQueue(approvalQueue);
  const nodeConfig = await nodeService.getNodeConfig();
  currentModelProviders = nodeConfig.modelProviders;
  if (nodeConfig.relayPublicWsUrl) {
    nodeService.setRelayPublicWsUrl(nodeConfig.relayPublicWsUrl);
  }
  currentChatAssistEnabled =
    process.env.ENVOY_CHAT_ASSIST_ENABLED === "true" ? true : nodeConfig.chatAssistEnabled;
  currentAutonomousKillSwitch = nodeConfig.autonomousKillSwitch ?? false;
  currentAutonomousPolicies = nodeConfig.autonomousPolicies ?? [];
  currentTrustModeEnabled = nodeConfig.trustModeEnabled ?? false;
  currentKnowledgeSyndicationMaxSensitivity = nodeConfig.knowledgeSyndicationMaxSensitivity;
  currentAiSettings = nodeConfig.aiSettings;
  currentContactAiPrefs = new Map(
    (nodeConfig.contactAiPreferences ?? []).map((p: ContactAiPreferences) => [
      p.peerOwnerId,
      {
        aiAccessLevel: p.aiAccessLevel,
        knowledgeAccess: p.knowledgeAccess,
        priority: p.priority,
        syndicationMaxSensitivity: p.syndicationMaxSensitivity,
      },
    ]),
  );
  console.log(`[model] provider mode=${currentModelProviders.mode}`);
  console.log(`[chat] assist ${currentChatAssistEnabled ? "enabled" : "disabled"}`);
  console.log(
    `[autonomous] killSwitch=${currentAutonomousKillSwitch}, policies=${currentAutonomousPolicies.length}`,
  );
}
if (devServicePortsConfigured()) {
  console.log(
    `[node] Service ports (dev): ws=${SOCIAL_WS_PORT}, bridge=${BRIDGE_HTTP_PORT}, terminal=${TERMINAL_WS_PORT}, gateway=${OPENCLAW_GATEWAY_PORT}`,
  );
}

// Register deferred mesh start immediately — module init continues for ~2000 lines and
// the UI can finish setup before that completes.
if (!persistedNodeConfig && nodeService instanceof NodeServiceImpl) {
  nodeService.emit("node:status", { status: "offline" });
  nodeService.registerDeferredExternalMeshStart(async () => {
    await ensureCliMeshActivated(true);
  });
  console.log("[node] First-run setup pending — libp2p deferred until setup completes");
}

// External Agent Gateway — manages external agent sessions, capabilities, and action logging
const gateway = new ExternalAgentGateway();

// Bridge: load or generate agent identity for external agent pipe
let bridgeIdentity = await loadBridgeIdentity(args.profileDir);
if (!bridgeIdentity) {
  const agentId = generateAgentIdentity(profile.owner.ownerId);
  const agentCredential = createAgentCredential({
    owner: profile.owner,
    agent: agentId,
    scope: ["chat.message"],
  });
  bridgeIdentity = {
    agentPeerId: agentId.agentPeerId,
    agentPublicKeyPem: agentId.publicKeyPem,
    agentPrivateKeyPem: agentId.privateKeyPem,
    ownerId: profile.owner.ownerId,
    agentCredential,
  };
  await saveBridgeIdentity(args.profileDir, bridgeIdentity);
  console.log(`[bridge] generated agent identity: ${bridgeIdentity.agentPeerId}`);
} else {
  const expectedAgentId = deriveAgentId(bridgeIdentity.ownerId, bridgeIdentity.agentPublicKeyPem);
  if (
    bridgeIdentity.agentCredential.ownerId !== bridgeIdentity.ownerId ||
    bridgeIdentity.agentCredential.agentId !== expectedAgentId ||
    bridgeIdentity.agentCredential.agentPeerId !== bridgeIdentity.agentPeerId ||
    bridgeIdentity.agentCredential.agentPublicKeyPem !== bridgeIdentity.agentPublicKeyPem ||
    bridgeIdentity.agentCredential.ownerPublicKeyPem !== profile.owner.publicKeyPem
  ) {
    bridgeIdentity = {
      ...bridgeIdentity,
      agentCredential: createAgentCredential({
        owner: profile.owner,
        agent: {
          agentId: expectedAgentId,
          agentPeerId: bridgeIdentity.agentPeerId,
          publicKeyPem: bridgeIdentity.agentPublicKeyPem,
          privateKeyPem: bridgeIdentity.agentPrivateKeyPem,
        },
        scope: ["chat.message"],
      }),
    };
    await saveBridgeIdentity(args.profileDir, bridgeIdentity);
    console.log(`[bridge] refreshed agent credential: ${bridgeIdentity.agentPeerId}`);
  }
  console.log(`[bridge] loaded agent identity: ${bridgeIdentity.agentPeerId}`);
}

// Bridge config — loaded from profile dir, defaults to disabled.
// The UI toggle in persisted config (bridgeEnabled) overrides bridge-config.json's enabled field,
// so users can turn the bridge on/off without editing the JSON file.
let bridgeConfig: BridgeConfig = BridgeConfigSchema.parse({});
try {
  const raw = await readFile(join(args.profileDir, "bridge-config.json"), "utf-8");
  bridgeConfig = applyActiveExtAgent(BridgeConfigSchema.parse(JSON.parse(raw)));
  console.log(`[bridge] loaded config: enabled=${bridgeConfig.enabled}, agent=${bridgeConfig.activeExtAgent ?? bridgeConfig.agentName}`);
} catch {
  bridgeConfig = applyActiveExtAgent(BridgeConfigSchema.parse({}));
}
bridgeConfig = {
  ...bridgeConfig,
  listenPort: BRIDGE_HTTP_PORT,
  assistantAgentUrl: openClawGatewayWebhookUrl(),
};
// Merge UI toggle from persisted config — bridgeEnabled: true overrides bridge-config.json.
// Default to false when no persisted config exists (D1C: built-in OpenClaw is the default agent;
// the Ext Agent bridge is opt-in).
let openclawEnabledForBridge = true;
{
  try {
    const persistedCfg = await nodeConfigStore.load();
    openclawEnabledForBridge = persistedCfg?.openclawEnabled ?? true;
    const uiEnabled = persistedCfg?.bridgeEnabled ?? false;
    if (uiEnabled && !bridgeConfig.enabled) {
      bridgeConfig = { ...bridgeConfig, enabled: true };
      console.log(`[bridge] UI toggle overrides: enabled=true (persisted=${persistedCfg?.bridgeEnabled ?? "none"})`);
    }
  } catch { /* ignore — persisted config may not exist yet */ }
}
/** Ext Agent UI + peer registration when bridge HTTP is explicitly enabled */
const bridgeHttpReady = bridgeConfig.enabled;
/** Built-in OpenClaw posts sync replies to POST /bridge/send — listener required even when Ext Agent is off */
const bridgeListenForOpenClaw = openclawEnabledForBridge;
/** Built-in OpenClaw lifecycle (gateway auth, bridge status, peer directory) */
const bridgeAgentLifecycleReady = bridgeHttpReady || bridgeListenForOpenClaw;
if (bridgeListenForOpenClaw && !bridgeConfig.enabled) {
  console.log(
    `[bridge] HTTP listener will start for built-in OpenClaw (POST /bridge/send on port ${BRIDGE_HTTP_PORT})`,
  );
}
const discoverySeedStore = createDiscoverySeedStore(args.profileDir);
const taskRuntimeStore = createTaskRuntimeStateStore(args.profileDir);
const resolvedArgs = await resolveNodeArgsTargetsByOwnerId(args, peerDirectoryStore);
const inboundGuard = createInboundMessageGuard();
let vaultIndex: Awaited<ReturnType<typeof buildVaultIndex>> | null = null;
let ragService: RagService | null = null;
let emitRagReindexProgress: ((progress: import("@envoymesh/api").RagIndexProgress) => void) | undefined;
try {
  vaultIndex = await buildVaultIndex({ rootDir: vaultDirForNode });
  console.log(`[vault] indexed ${vaultIndex.documents.length} document(s), ${vaultIndex.chunks.length} chunk(s)`);
} catch (err) {
  console.warn(`[vault] index build failed (vault may be missing or empty):`, err);
}

async function refreshRagService(): Promise<void> {
  try {
    try {
      vaultIndex = await buildVaultIndex(
        buildVaultIndexOptionsFromKnowledgeBase(vaultDirForNode, currentAiSettings?.knowledgeBase),
      );
    } catch (err) {
      console.warn(`[vault] index rebuild failed:`, err);
    }

    if (!ragService) {
      ragService = await createRagService({
        profileDir: args.profileDir,
        knowledgeBase: currentAiSettings?.knowledgeBase,
        modelProviders: currentModelProviders,
        chatLogStore,
        onProgress: (progress) => {
          emitRagReindexProgress?.(progress);
        },
      });
    } else {
      await ragService.refreshConfig({
        knowledgeBase: currentAiSettings?.knowledgeBase,
        modelProviders: currentModelProviders,
      });
    }
    if (vaultIndex) {
      void ragService
        .reindexVault({
          vaultIndex,
          knowledgeBase: currentAiSettings?.knowledgeBase,
        })
        .catch((err) => console.warn(`[rag] deferred vault reindex failed:`, err));
    }
  } catch (error) {
    console.warn(`[rag] service refresh failed:`, error);
  }
}

if (nodeService instanceof NodeServiceImpl) {
  emitRagReindexProgress = (progress) => {
    if (nodeService.hasListeners("rag:reindex")) {
      nodeService.emit("rag:reindex", progress);
    }
  };
  nodeService.setRelayBookProvider(() => relayRoster.relayBook());
  void refreshRagService();
}

function scheduleChatRagIndex(threadOwnerId: string, message: Parameters<typeof chatLogStore.append>[1]): void {
  if (!ragService) return;
  const view = chatLogRowsToViews([message])[0];
  if (!view) return;
  void ragService.indexChatMessage(threadOwnerId, view).catch((err) =>
    console.warn(`[rag] chat index failed:`, err),
  );
}

let friendAutopilotRunInFlight = false;
let socialProxyRunInFlight = false;
let documentAcquisitionRunInFlight = false;
let capabilityProviderRunInFlight = false;
let bondStewardRunInFlight = false;
let meshAwarenessRunInFlight = false;
let connectionSuggesterRunInFlight = false;
let proactiveAgentRunInFlight = false;
// Activity tracking for online/offline detection (inbound path)
// Note: node-service-impl.ts has its own activity tracking for outbound paths (sendChat).
// The index.ts version tracks activity from WebSocket messages (inbound).
// The node-service-impl.ts version tracks activity from API calls like sendChat (outbound).
let lastActivityTimestamp: number = Date.now();
const ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of inactivity = offline

/**
 * Determine if the owner is currently online based on:
 * - If statusMode is "manual": use the manual isOnlineManual setting
 * - If statusMode is "automatic": return true if activity within timeout
 */
function isOwnerOnline(): boolean {
  const status = currentAiSettings?.status;
  if (!status) return true; // Default to online if no status configured

  if (status.statusMode === "manual") {
    return status.isOnlineManual ?? true;
  }

  // Automatic mode: online if had activity within timeout
  return Date.now() - lastActivityTimestamp < ACTIVITY_TIMEOUT_MS;
}

/**
 * Record an owner activity event (any message from the owner's client)
 */
function recordOwnerActivity(): void {
  lastActivityTimestamp = Date.now();
  recordMeshActivity(lastActivityTimestamp);
  modeController.recordOwnerActivity();
}

/** Relay-aware dial hints for outbound message/chat to a libp2p transport peer id. */
async function dialHintsForTransportPeer(
  transportPeerId: string,
  extraListenAddrs: string[] = [],
): Promise<string[]> {
  const records = await peerDirectoryStore.listPeerRecords();
  const rec = records.find((r) => r.peerId === transportPeerId);
  const merged = [
    ...(rec?.listenAddrs ?? []),
    ...filterUsableOutboundPeerDialHints(extraListenAddrs, transportPeerId),
  ];
  const config = await nodeConfigStore.load();
  return buildOutboundDialHints({
    recipientPeerId: transportPeerId,
    peerListenAddrs: merged,
    discoverySeedStore,
    config: config ?? undefined,
    profileDir: args.profileDir,
    localListenAddrs: mesh?.multiaddrs,
  });
}

const peerDirCompact = await peerDirectoryStore.compactListenAddrs();
if (peerDirCompact.addrsRemoved > 0) {
  console.log(
    `[peer-directory] compacted ${peerDirCompact.addrsRemoved} stale listen addrs across ${peerDirCompact.recordsTouched} record(s)`,
  );
}
const peerDirPrune = await peerDirectoryStore.capPeerRecordCount();
if (peerDirPrune.recordsRemoved > 0) {
  console.log(`[peer-directory] pruned ${peerDirPrune.recordsRemoved} oldest peer record(s)`);
}
const peerDirectoryRecords = await peerDirectoryStore.listPeerRecords();
const peerDirectorySeedAddrs = peerDirectoryRecords.flatMap((record) => record.listenAddrs);
const persistedSeedAddrs = seedAddrsForDiscoveryProfile(
  args.discoveryProfile,
  await discoverySeedStore.listSeedRecords(),
);

// Resolve domain-based bootstrap addresses to multiaddrs
const resolvedBootstrapResults = await resolveBootstrapAddresses(args.bootstrapPeers);
const resolvedBootstrapPeers = resolvedBootstrapResults.flatMap((r) => r.resolved);

const rawBootstrapPeers = dedupeAddrs([...resolvedBootstrapPeers, ...persistedSeedAddrs]);
const effectiveBootstrapPeers = filterBootstrapMultiaddrs(rawBootstrapPeers);
if (rawBootstrapPeers.length !== effectiveBootstrapPeers.length || peerDirectorySeedAddrs.length > 0) {
  console.log(
    `[connectivity] bootstrap addrs: kept=${effectiveBootstrapPeers.length} filtered=${rawBootstrapPeers.length - effectiveBootstrapPeers.length} peer-dir-skipped=${peerDirectorySeedAddrs.length} (contact listen addrs use dial hints only)`,
  );
}
const libp2pPrivateKey = await loadOrCreateLibp2pPrivateKey(
  join(args.profileDir, "libp2p-private.key"),
);
const connectivityRuntime: ResolvedConnectivityRuntime = resolveConnectivityRuntime({
  profile: args.discoveryProfile,
  enableMdns: args.enableMdnsExplicit ? args.enableMdns : undefined,
  tuning: args.connectivityTuning,
});
args.enableMdns = connectivityRuntime.enableMdns;
args.enableDht = connectivityRuntime.enableDht;
const mesh = new EnvoyMesh({
  listen: args.listen,
  advertiseAddrs: args.advertiseAddrs,
  enableMdns: connectivityRuntime.enableMdns,
  mdnsIntervalMs: connectivityRuntime.mdnsIntervalMs,
  enableDht: connectivityRuntime.enableDht,
  dhtClientMode: args.dhtClientMode ?? true,
  bootstrapPeers: effectiveBootstrapPeers,
  enableRelay: args.enableRelay,
  enableRelayServer: args.enableRelayServer,
  enableAutoNat: args.enableAutoNat,
  enableDcutr: args.enableDcutr,
  enableQuic: args.enableQuic,
  enableP2pDebug: args.p2pDebug,
  enableRelayDebugSummary: args.relayDebugSummary,
  ...(connectivityRuntime.maxConnections != null ? { maxConnections: connectivityRuntime.maxConnections } : {}),
  libp2pPrivateKey,
  onP2pDebug: (event) => {
    void appendP2pTrace(event);
  },
});
console.log(`[node] DHT mode: ${args.dhtClientMode === false ? "SERVER" : "CLIENT"} (dhtClientMode=${args.dhtClientMode})`);
let rendezvousRegistry: CapabilityRegistry | undefined;
if (args.p2pDebug) {
  console.log(
    `[p2p-debug] relay periodic SUMMARY logs: ${args.relayDebugSummary ? "on" : "off"} (enable with --relay-debug-summary or ENVOYMESH_RELAY_DEBUG_SUMMARY=1)`,
  );
}

// Phase 33 — agent card auto-fetch on bond establishment. Constructed once after the mesh
// is built; called from the bond:established handler with the new peer's ownerId.
const agentCardAutoFetcher = createAgentCardAutoFetcher({
  mesh,
  bridgeIdentity,
  agentCardStore,
  trustStore,
  taskStore,
  resolvePeerTransport: async (targetOwnerId) => {
    const record = await peerDirectoryStore.getPeerByOwnerId(targetOwnerId);
    if (!record) {
      return { transportPeerId: undefined, recipientEnvelopePeerId: undefined };
    }
    const transportPeerId = record.peerId;
    const recipientEnvelopePeerId = record.devicePublicKeyPem
      ? derivePeerId(record.devicePublicKeyPem)
      : transportPeerId;
    return { transportPeerId, recipientEnvelopePeerId };
  },
  maxAgeMs: persistedNodeConfig?.agentCardAutoFetchMaxAgeMs,
});
const connectivityWarnings: string[] = [];
const bootstrapProbeResults: Array<{ peer: string; ok: boolean; latencyMs?: number; error?: string }> = [];
const MAX_BOOTSTRAP_PROBE_RESULTS = 512;
const BOOTSTRAP_REPROBE_INTERVAL_MS = 60_000;
const BOOTSTRAP_REPROBE_JITTER_MS = 15_000;
const RELAY_PEERS_QUERY_INTERVAL_MS = 30_000;
const RELAY_PEERS_QUERY_JITTER_MS = 7_500;
const RELAY_CHECKIN_INTERVAL_MS = 30_000;
const RELAY_LOOKUP_INTERVAL_MS = 30_000;
/** Client relay.lookup uses same-stream reply; allow slow paths. */
const RELAY_LOOKUP_REPLY_TIMEOUT_MS = 30_000;
const RELAY_SUMMARY_INTERVAL_MS = 60_000;
const RELAY_CONTROL_TTL_MS = 90_000;
/** Child relay relay.lookup forward: read reply on same stream (per-hop). */
const RELAY_FORWARD_LOOKUP_REPLY_MS = 12_000;
const RELAY_MANAGER_SNAPSHOT_INTERVAL_MS = 30_000;
const RELAY_HEALTH_INTERVAL_MS = 30_000;
const NODE_HEALTH_INTERVAL_MS = 30_000;
const EVENT_LOOP_LAG_SAMPLE_MS = 1_000;
const MAX_RECORDED_FATAL_ERRORS = 20;

// ============================================================================
// RATE LIMITING & ABUSE PREVENTION: Bounded structures to prevent exhaustion
// ============================================================================

// Per-peer inbound message rate limiting
const peerRegistrationCount = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window
const RATE_LIMIT_MAX_REGISTRATIONS = 30; // max inbound messages per peer per window
const MAX_RATE_LIMIT_ENTRIES = 10_000; // Prevent memory exhaustion

// Message deduplication to prevent replay attacks
const seenMessageIds = new Set<string>();
const MAX_SEEN_MESSAGE_IDS = 100_000;

// Maximum payload size to prevent memory exhaustion (1MB)
function checkInboundRateLimit(peerId: string): boolean {
  if (!peerId || typeof peerId !== "string") {
    return false;
  }

  if (peerRegistrationCount.size >= MAX_RATE_LIMIT_ENTRIES) {
    const now = Date.now();
    let oldest: string | null = null;
    let oldestExpiry = Infinity;
    for (const [id, entry] of peerRegistrationCount) {
      if (entry.resetAt < now && entry.resetAt < oldestExpiry) {
        oldest = id;
        oldestExpiry = entry.resetAt;
      }
    }
    if (oldest) {
      peerRegistrationCount.delete(oldest);
    }
  }

  const now = Date.now();
  const entry = peerRegistrationCount.get(peerId);

  if (!entry || entry.resetAt < now) {
    peerRegistrationCount.set(peerId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REGISTRATIONS) {
    return false;
  }

  entry.count++;
  return true;
}

function isMessageSeen(messageId: string): boolean {
  if (!messageId || typeof messageId !== "string") {
    return true; // Treat invalid IDs as "seen" to reject them
  }
  return seenMessageIds.has(messageId);
}

function markMessageSeen(messageId: string): void {
  if (!messageId || typeof messageId !== "string") {
    return;
  }

  if (seenMessageIds.size >= MAX_SEEN_MESSAGE_IDS) {
    const targetSize = Math.floor(MAX_SEEN_MESSAGE_IDS * 0.1);
    let removed = 0;
    for (const id of seenMessageIds) {
      if (removed >= targetSize) break;
      seenMessageIds.delete(id);
      removed++;
    }
  }
  seenMessageIds.add(messageId);
}

/** Throttle peer-directory listen-addr merges — each merge rewrites the whole JSON file. */
const lastListenAddrMergeByPeer = new Map<string, number>();
const LISTEN_ADDR_MERGE_MIN_MS = INBOUND_LISTEN_ADDR_MERGE_MIN_MS;

let bootstrapReprobeTimer: ReturnType<typeof setTimeout> | undefined;
let bootstrapReprobeCursor = 0;
let capabilityDiscoveryTimer: ReturnType<typeof setTimeout> | undefined;
let relayPeersQueryTimer: ReturnType<typeof setTimeout> | undefined;
let relayCheckinTimer: ReturnType<typeof setTimeout> | undefined;
let relayLookupTimer: ReturnType<typeof setTimeout> | undefined;
let relaySummaryTimer: ReturnType<typeof setTimeout> | undefined;
let relayManagerSnapshotTimer: ReturnType<typeof setTimeout> | undefined;
let relayHealthTimer: ReturnType<typeof setTimeout> | undefined;
let nodeHealthTimer: ReturnType<typeof setTimeout> | undefined;
let eventLoopLagTimer: ReturnType<typeof setInterval> | undefined;
let discoveryQueueTimer: ReturnType<typeof setTimeout> | undefined;
let stopNodeStatsLogging: (() => void) | undefined;
let rateLimitCleanupInterval: ReturnType<typeof setInterval> | undefined;
let rendezvousSweeper: ReturnType<typeof setInterval> | undefined;
let modeTransitionTimer: ReturnType<typeof setInterval> | undefined;
const processStartedAt = Date.now();
let meshStarted = false;
let relayTunnelClient: RelayTunnelClient | null = null;
let cliMeshActivationInFlight = false;
let cliMeshActivationPromise: Promise<void> | undefined;
let publicAddrPeriodicDiscoveryStarted = false;
let cliMeshReadyResolve: (() => void) | undefined;
const cliMeshReadyPromise = new Promise<void>((resolve) => {
  cliMeshReadyResolve = resolve;
});
let lastKnownLibp2pPeerId = "";
let lastEventLoopLagMs = 0;
const recentFatalErrors: Array<{ at: number; message: string }> = [];

if (args.discoveryProfile === "wan-default" && effectiveBootstrapPeers.length === 0) {
  connectivityWarnings.push(
    "wan-default selected without bootstrap peers; DHT/relay are enabled but discovery may be limited. Configure --bootstrap or ENVOYMESH_BOOTSTRAP_PEERS.",
  );
}

const startupHumanProfile = await humanProfileStore.loadHumanProfile().catch(() => undefined);
const startupGeoTopics = deriveLocationDiscoveryTopics({
  location: startupHumanProfile?.discoveryLocation ?? null,
  precision: startupHumanProfile?.discoveryLocationPrecision ?? null,
});
const autoCapabilityTopics = buildProfileDiscoveryTopics({
  capabilities: profile.deviceCertificate.capabilities,
  hobbies: startupHumanProfile?.hobbies,
  knowledge: startupHumanProfile?.knowledge,
  geoTopics: startupGeoTopics,
});
const observedRelayPeerIds = new Set<string>();
const relayStateStore = createRelayStateStore(args.profileDir);
const [persistedRelayBook, persistedSummaries] = await Promise.all([
  relayStateStore.loadRelayBook(),
  relayStateStore.loadRelaySummaries(),
]);
if (persistedRelayBook.length > 0 || persistedSummaries.length > 0) {
  console.log(
    `[relay-state] restored relay_book=${persistedRelayBook.length} summaries=${persistedSummaries.length}`,
  );
}
const relayRoster = createRelayRoster({
  persistedRelayBook,
  persistedSummaries: persistedSummaries.map((e) => ({
    relayId: e.relayId,
    summary: {
      relayId: e.relayId,
      level: e.level,
      region: e.region,
      childRelayCount: e.childRelayCount,
      livePeerCount: e.livePeerCount,
      topicBuckets: e.topicBuckets,
      expiresAt: new Date(e.expiresAt).toISOString(),
    },
    lastSeenAt: e.lastSeenAt,
    expiresAt: e.expiresAt,
  })),
});
const relayClientState = createRelayClientState(effectiveBootstrapPeers.map(relayHintFromAddr));
const relayLookupRouter = createRelayLookupRouter();
let relayHealthState: RelayHealthState = createInitialRelayHealthState();
let relayHealthSnapshot: RelayHealthSnapshot | undefined;
let nodeHealthState: NodeHealthState = createInitialNodeHealthState();
let nodeHealthSnapshot: NodeHealthSnapshot | undefined;
let libp2pRepairInProgress = false;
let lastLibp2pRestartAtMs = 0;
let lastRelayHealthReprobeAtMs = 0;

mesh.onPeerDiscovered(async (peer) => {
  const source = peerDiscoverySourceFromMultiaddrs(peer.multiaddrs);
  if (args.peerDiscoveryLog) {
    console.log(`[peer-discovery] peer=${peer.peerId} source=${source} addrs=${peer.multiaddrs.length}`);
  }
  if (
    shouldRecordPeerDiscoveryAudit(peer.peerId, source, { force: args.peerDiscoveryLog })
  ) {
    void taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        remotePeerId: peer.peerId,
        direction: "inbound",
        protocol: "peer.discovery",
        outcome: "record",
        summary: `discovery peer=${peer.peerId} source=${source} addrs=${peer.multiaddrs.length}`,
      }),
    );
  }
  // Seeds + peer-directory listen addrs: handleMeshPeerDiscovered (same as startNode path).
  if (nodeService instanceof NodeServiceImpl) {
    void nodeService.handleMeshPeerDiscovered(peer.peerId, peer.multiaddrs);
  }
});

// Bridge message handler — set to no-op until bridge is created below
let bridgeHandleMessage: (envelope: any, remotePeerId: string) => Promise<void> = async () => {};

type InboundMeshMessageParams = {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
  remoteAddr?: string;
};

async function handleInboundMeshMessage({
  envelope: inboundEnvelope,
  remotePeerId,
  replyWithEnvelope,
  remoteAddr,
}: InboundMeshMessageParams): Promise<void> {
  const receivedAt = Date.now();

  const guardDecision = inboundGuard.inspect(inboundEnvelope);

  if (guardDecision.action === "reject") {
    console.warn(
      `[rejected] ${inboundEnvelope.intent} from ${inboundEnvelope.senderPeerId} via libp2p peer ${remotePeerId}: ${guardDecision.reason}`,
    );
    return;
  }

  const envelope = guardDecision.envelope;
  if (remoteAddr?.trim()) {
    void mergeInboundPeerDialHintsIfDue({
      remotePeerId,
      remoteAddr,
      lastMergeByPeer: lastListenAddrMergeByPeer,
      peerDirectory: peerDirectoryStore,
      mesh,
    }).catch((err) => console.warn(`[peer-directory] inbound dial hint learn failed:`, err));
  }
  if (envelope.senderRole === "human" && envelope.senderPublicKey?.trim()) {
    void peerDirectoryStore
      .mergeInboundDeviceBinding({
        peerId: remotePeerId,
        devicePublicKeyPem: envelope.senderPublicKey,
      })
      .catch((err) => console.warn(`[peer-directory] mergeInboundDeviceBinding failed:`, err));
  }
  const correlationId = deriveCorrelationIdFromEnvelope(envelope);
  const rolePolicyDecision = evaluateInboundEnvelopeRolePolicy(envelope);
  if (!rolePolicyDecision.ok) {
    void taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.rejected",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "rejected",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `Rejected by role policy: ${rolePolicyDecision.reason}.`,
        createdAt: envelope.createdAt,
      }),
    );
    console.warn(`[rejected role policy] ${envelope.intent}: ${rolePolicyDecision.reason}`);
    return;
  }

  /** Rendezvous (public relay / discovery): requires same-stream reply for sendExpectReply clients */
  if (
    rendezvousRegistry &&
    (envelope.intent === "rendezvous.register" || envelope.intent === "rendezvous.query")
  ) {
    if (!replyWithEnvelope) {
      console.warn(`[node-rendezvous] ${envelope.intent}: no replyWithEnvelope; cannot ACK`);
      return;
    }
    const sendRendezvousResponse = async (matches: Parameters<typeof createRendezvousResponsePayload>[0]["matches"]) => {
      const responsePayload = createRendezvousResponsePayload({ matches });
      await replyWithEnvelope({
        version: "0.1",
        messageId: randomUUID(),
        createdAt: new Date().toISOString(),
        senderPeerId: mesh.peerId,
        senderPublicKey: RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
        senderRole: "agent",
        recipientPeerId: envelope.senderPeerId,
        recipientRole: "agent",
        intent: "rendezvous.response",
        signature: RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
        payload: responsePayload,
      } as EnvoyEnvelope);
    };

    try {
      if (envelope.intent === "rendezvous.register") {
        const regPayload = parseRendezvousRegisterPayload(envelope.payload);
        rendezvousRegistry.register(regPayload);
        await sendRendezvousResponse([]);
      } else {
        const q = parseRendezvousQueryPayload(envelope.payload);
        const matches = rendezvousRegistry.query(q);
        await sendRendezvousResponse(matches);
      }
    } catch (error) {
      console.error(`[node-rendezvous] ${envelope.intent} failed:`, error);
      try {
        await sendRendezvousResponse([]);
      } catch (replyErr) {
        console.error("[node-rendezvous] failed to ACK:", replyErr);
      }
    }
    return;
  }

  if (envelope.intent === "system.signal") {
    await handleSystemSignalViaRuntime(
      {
        parseSystemSignalPayload,
        verifyAuthorizedDeviceEnvelope,
        evaluateCapability,
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        logWarn: (msg: any) => console.warn(msg),
        log: (msg: any) => console.log(msg),
        upsertPeerFromSignal: (input: any) =>
          peerDirectoryStore.upsertPeerFromSignal(input),
      },
      { envelope, remotePeerId, receivedAt, correlationId },
    );
    return;
  }

  if (
    envelope.intent === "profile.sync" ||
    envelope.intent === "profile.response" ||
    envelope.intent === "profile.request"
  ) {
    const profileHandled = await handleProfileIntentViaRuntime(
      {
        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
      },
      { envelope, remotePeerId, remoteAddr, receivedAt, correlationId, replyWithEnvelope: replyWithEnvelope as any },
    );
    if (profileHandled) {
      return;
    }
  }

  if (envelope.intent === "system.ping") {
    await handleSystemPingViaRuntime(
      { taskStore, parseSystemPingPayload, createAuditEvent },
      {
        envelope: {
          messageId: envelope.messageId,
          senderPeerId: envelope.senderPeerId,
          createdAt: envelope.createdAt,
          intent: envelope.intent,
          payload: envelope.payload,
        },
        remotePeerId,
        correlationId,
        receivedAt,
      },
    );
    return;
  }

  if (envelope.intent === "agent.card.request" || envelope.intent === "agent.card.response") {
    await handleAgentCardViaRuntime(
      {
        handleDaemonAgentCardInbound,
        getProfile: () => profile,
        getTaskStore: () => taskStore,
        getTrustStore: () => trustStore,
        getAgentCardStore: () => agentCardStore,
        getHumanProfileStore: () => humanProfileStore,
        getBridgeIdentity: () => bridgeIdentity ?? null,
        getMesh: () => mesh,
        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
      },
      { envelope, remotePeerId, receivedAt, correlationId },
    );
  }

  if (envelope.intent === "knowledge.query") {
    await handleKnowledgeQueryViaRuntime(
      {
        getContactSyndicationMaxSensitivity: async () => {
          if (envelope.agentCredential?.ownerId) {
            return currentContactAiPrefs.get(envelope.agentCredential.ownerId)
              ?.syndicationMaxSensitivity;
          }
          const records = await peerDirectoryStore.listPeerRecords();
          const match =
            records.find((r) => r.peerId === envelope.senderPeerId) ??
            records.find((r) => r.peerId === remotePeerId);
          if (match?.ownerId) {
            return currentContactAiPrefs.get(match.ownerId)
              ?.syndicationMaxSensitivity;
          }
          return undefined;
        },
        handleInboundKnowledgeQuery: (input: any) =>
          handleInboundKnowledgeQuery(input),
        getTaskStore: () => taskStore,
        getTrustStore: () => trustStore,
        getPeerDirectoryStore: () => peerDirectoryStore,
        getVaultIndex: () => vaultIndex,
        getModelProviders: () => currentModelProviders,
        getChatLogStore: () => chatLogStore,
        getHumanProfileStore: () => humanProfileStore,
        getAgentIdentityStore: () => agentIdentityStore,
        getKnowledgeBase: () => currentAiSettings?.knowledgeBase,
        getRagService: () => ragService,
        getKnowledgeSyndicationMaxSensitivity: () =>
          currentKnowledgeSyndicationMaxSensitivity,
        appendAuditEvent: (event: any) => taskStore.appendAuditEvent(event),
        getProfile: () => profile,
        derivePeerId,
        createUnsignedEnvelope,
        createKnowledgeResponsePayload,
        signUnsignedEnvelope,
        getMesh: () => mesh,
        deliverOutboundEnvelope,
        logWarn: (msg: any) => console.warn(msg),
        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
        recordInboundKnowledgeAnswered: (input: any) => {
          if (nodeService instanceof NodeServiceImpl) {
            nodeService.recordInboundKnowledgeAnswered(input);
          }
        },
        getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
      },
      {
        envelope,
        remotePeerId,
        receivedAt,
        correlationId,
      },
    );
    return;
  }

  // ── share.preview (requester links preview id to outbound push send) ─────
  if (envelope.intent === "share.preview") {
    await handleCliSharePreviewViaRuntime(
      { nodeService, peerDirectoryStore, resolveSenderOwnerId },
      { envelope, remotePeerId },
    );
    return;
  }

  // ── share.request → responder sends signed share.preview ─────────────────
  if (envelope.intent === "share.request") {
    await handleShareRequestViaRuntime(
      {
        loadCapabilityManifest: () => capabilityManifestStore.loadManifest(),
        handleInboundShareRequest: (input: any) =>
          handleInboundShareRequest(input),
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        getProfile: () => profile,
        derivePeerId,
        createUnsignedEnvelope,
        createSharePreviewPayload,
        signUnsignedEnvelope,
        dialHintsForTransportPeer,
        deliverOutboundEnvelope,
        parseShareRequestPayload,
        resolveSenderOwnerId,
        logWarn: (msg: any) => console.warn(msg),
        getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
        getMesh: () => mesh,
        getTaskStore: () => taskStore,
        getTrustStore: () => trustStore,
        getPeerDirectoryStore: () => peerDirectoryStore,
        getVaultIndex: () => vaultIndex,
        getVaultDir: () => vaultDirForNode,
        getModelProviders: () => currentModelProviders,
      },
      {
        envelope,
        remotePeerId,
        remoteAddr,
        receivedAt,
        correlationId,
      },
    );
    return;
  }

  if (envelope.intent === "share.accept") {
    await handleShareAcceptViaRuntime(
      {
        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
        parseShareAcceptPayload,
        handleInboundShareAccept: (input: any) =>
          handleInboundShareAccept(input),
        getTaskStore: () => taskStore,
        getTrustStore: () => trustStore,
        getPeerDirectoryStore: () => peerDirectoryStore,
        getProfile: () => profile,
        getVaultIndex: () => vaultIndex,
        getVaultDir: () => vaultDirForNode,
        logWarn: (msg: any) => console.warn(msg),
        logError: (msg: any) => console.error(msg),
        log: (msg: any) => console.log(msg),
      },
      { envelope, remotePeerId, remoteAddr, receivedAt, correlationId },
    );
    return;
  }

  if (
    bridgeIdentity &&
    (envelope.intent === "discovery.response" || envelope.intent === "knowledge.response") &&
    envelope.recipientPeerId === bridgeIdentity.agentPeerId
  ) {
    void bridgeHandleMessage(envelope, remotePeerId);
    return;
  }

  if (envelope.intent === "sync.state") {
    await handleSyncStateViaRuntime(
      {
        handleInboundSyncStateIntent,
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        getProfile: () => profile,
        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
      },
      { envelope, remotePeerId, receivedAt, correlationId },
    );
    return;
  }

  if (envelope.intent === "discovery.request" || envelope.intent === "discovery.response") {
    await handleDiscoveryViaRuntime(
      {
        loadCapabilityManifest: () => capabilityManifestStore.loadManifest(),
        loadNodeConfig: () => nodeConfigStore.load(),
        loadHumanProfile: () =>
          humanProfileStore.loadHumanProfile().catch(() => undefined),
        handleInboundDiscoveryIntent: (input: any) =>
          handleInboundDiscoveryIntent(input),
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        appendDiscoveryEvent: (event: any) =>
          taskStore.appendDiscoveryEvent(event),
        logWarn: (msg: any) => console.warn(msg),
        getProfile: () => profile,
        getMesh: () => mesh,
        deliverOutboundEnvelope,
        createUnsignedEnvelope,
        createDiscoveryResponsePayload,
        signUnsignedEnvelope,
        derivePeerId,
        getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
      },
      { envelope, remotePeerId, receivedAt, correlationId, profileDir: args.profileDir, replyWithEnvelope: replyWithEnvelope as any },
    );
    return;
  }

  if (envelope.intent === "broadcast.request" || envelope.intent === "broadcast.response") {
    await handleBroadcastViaRuntime(
      {
        loadCapabilityManifest: () => capabilityManifestStore.loadManifest(),
        loadNodeConfig: () => nodeConfigStore.load(),
        handleInboundBroadcastRequest: (input: any) =>
          handleInboundBroadcastRequest(input),
        handleInboundBroadcastResponse: (input: any) =>
          handleInboundBroadcastResponse(input),
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        logWarn: (msg: any) => console.warn(msg),
        getProfile: () => profile,
        getMesh: () => mesh,
        deliverOutboundEnvelope,
        createUnsignedEnvelope,
        signUnsignedEnvelope,
        derivePeerId,
        getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
      },
      { envelope, remotePeerId, receivedAt, correlationId },
    );
    return;
  }

  if (
    envelope.intent === "relay.checkin" ||
    envelope.intent === "relay.lookup" ||
    envelope.intent === "relay.lookup.response" ||
    envelope.intent === "relay.hints.request" ||
    envelope.intent === "relay.hints.response" ||
    envelope.intent === "relay.join.request" ||
    envelope.intent === "relay.register" ||
    envelope.intent === "relay.summary"
  ) {
    await handleRelayControlEnvelope({
      envelope,
      remotePeerId,
      receivedAt,
      correlationId,
      replyWithEnvelope,
    });
    return;
  }

  if (envelope.intent === "relay.peers.request" || envelope.intent === "relay.peers.response") {
    await handleRelayPeersViaRuntime(
      {
        addObservedRelayPeerId: (id: string) =>
          observedRelayPeerIds.add(id),
        getConnectedRelayPeerIds: () => mesh.getConnectedRelayPeerIds(),
        getObservedRelayPeerIds: () => observedRelayPeerIds,
        dedupeAddrs,
        log: (msg: any) => console.log(msg),
        logWarn: (msg: any) => console.warn(msg),
        getProfile: () => profile,
        getMesh: () => mesh,
        getTaskStore: () => taskStore,
        relayDialMultiaddrsForCircuitRelay,
        handleInboundRelayPeersIntent,
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        parseRelayPeersResponsePayload,
        upsertManyDiscoverySeeds: (addrs: string[], src: string) =>
          discoverySeedStore.upsertMany(addrs, src as any),
        dial: (addr: string) => mesh.dial(addr),
        createUnsignedEnvelope,
        signUnsignedEnvelope,
        derivePeerId,
        deliverOutboundEnvelope,
        getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
      },
      { envelope, remotePeerId, receivedAt, correlationId, advertiseAddrs: args.advertiseAddrs },
    );
    return;
  }

  // task.feedback — signed reputation feedback from peers about task outcomes
  if (envelope.intent === "task.feedback") {
    await handleTaskFeedbackViaRuntime(
      {
        loadNodeConfig: () => nodeConfigStore.load(),
        handleInboundTaskFeedback,
        logWarn: (msg: any) => console.warn(msg),
      },
      { envelope, remotePeerId },
    );
    return;
  }

  // official.credential — verify signed credentials from trusted anchors
  if (envelope.intent === "official.credential") {
    await handleOfficialCredentialViaRuntime(
      {
        loadNodeConfig: () => nodeConfigStore.load(),
        handleInboundOfficialCredential,
        logWarn: (msg: any) => console.warn(msg),
      },
      { envelope },
    );
    return;
  }

  // Phase 38 — call.* intents (voice/video call signaling)
  if (envelope.intent.startsWith("call.")) {
    const { handleCallIntent } = await import("./call-inbound.js");
    const handled = await handleCallIntent(envelope, {
      callManager: (nodeService as NodeServiceImpl).callManager,
      trustStore,
      peerDirectoryStore,
      remotePeerId,
      sendResponseEnvelope: async (responseEnvelope) => {
        if (nodeService instanceof NodeServiceImpl) {
          await nodeService.deliverCallEnvelopeToTransportPeer(
            remotePeerId,
            responseEnvelope as EnvoyEnvelope,
          );
          return;
        }
        await deliverOutboundEnvelope(mesh, remotePeerId, responseEnvelope as EnvoyEnvelope);
      },
      sendBusyReject:
        nodeService instanceof NodeServiceImpl
          ? async ({ callId, callerOwnerId }) => {
              await nodeService.sendCallRejectToOwner(callId, callerOwnerId, "busy");
            }
          : undefined,
      // Phase 42I — VoIP push fires on the callee's home (this node) when the
      // phone has no authenticated WS session. See call-inbound.ts.
      calleeOwnerId: profile?.owner.ownerId,
      isDeviceOnline: (ownerId) => wsServerForEvents?.hasClientForOwner(ownerId) ?? false,
      dispatchIncomingCallPush: async ({ callId, callerOwnerId, callerName, calleeOwnerId }) => {
        try {
          await pushNotificationService.dispatchCallPush({
            callerName,
            targetOwnerId: calleeOwnerId,
            callId,
            callerOwnerId,
          });
        } catch {
          // Best-effort — push delivery must never break call signaling.
        }
      },
    });
    if (handled) return;
  }

  // Phase 40F — task.chain.* intents (agent network collaboration layer)
  if (envelope.intent.startsWith("task.chain.") && nodeService instanceof NodeServiceImpl) {
    await nodeService.handleInboundChainEnvelope(envelope);
    return;
  }

  if (envelope.intent === "chat.room.sync" && nodeService instanceof NodeServiceImpl) {
    await handleChatRoomSyncViaRuntime(
      {
        parseChatRoomSyncPayload,
        handleInboundChatRoomSync: (env: any, payload: any) =>
          (nodeService as NodeServiceImpl).handleInboundChatRoomSync(env, payload),
        logWarn: (msg: any) => console.warn(msg),
      },
      { envelope, remotePeerId },
    );
    return;
  }

  if (envelope.intent === "chat.room.message" && nodeService instanceof NodeServiceImpl) {
    await handleChatRoomMessageViaRuntime(
      {
        parseChatRoomMessagePayload,
        handleInboundChatRoomMessage: (env: any, payload: any, rid: string, rwen: any) =>
          (nodeService as NodeServiceImpl).handleInboundChatRoomMessage(env, payload, rid, rwen),
        logWarn: (msg: any) => console.warn(msg),
      },
      { envelope, remotePeerId, replyWithEnvelope: replyWithEnvelope as any },
    );
    return;
  }

  if (envelope.intent === "chat.message") {
    if (nodeService instanceof NodeServiceImpl && nodeService.usesInternalMeshInboundHandlers()) {
      return;
    }
    let payload: ReturnType<typeof parseChatMessagePayload>;
    try {
      payload = parseChatMessagePayload(envelope.payload);
    } catch (error) {
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: "Rejected chat.message: invalid payload",
          createdAt: envelope.createdAt,
        }),
      );
      console.warn(`[rejected chat.message] invalid payload from ${remotePeerId}`);
      return;
    }

    const deviceAuth = await verifyInboundChatDevice(envelope, payload);
    if (!deviceAuth.ok) {
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `Rejected chat.message: ${deviceAuth.reason}`,
          createdAt: envelope.createdAt,
        }),
      );
      console.warn(`[rejected chat.message] ${deviceAuth.reason} from ${remotePeerId}`);
      return;
    }

    const localDevicePeerId = derivePeerId(profile.device.publicKeyPem);
    if (envelope.senderPeerId === localDevicePeerId) {
      console.warn(
        `[chat.message] ignoring self-echo messageId=${envelope.messageId} via libp2p peer ${remotePeerId.slice(0, 12)}…`,
      );
      return;
    }
    const intendedRecipient = envelope.recipientPeerId?.trim();
    if (
      intendedRecipient &&
      intendedRecipient !== localDevicePeerId &&
      intendedRecipient !== bridgeIdentity?.agentPeerId
    ) {
      const senderTrustForAddress = await trustStore.getTrustRecord(payload.senderOwnerId);
      const bondedSender =
        senderTrustForAddress?.level === "direct" || senderTrustForAddress?.level === "referred";
      if (!bondedSender) {
        console.warn(
          `[chat.message] ignoring misaddressed message for ${intendedRecipient.slice(0, 16)}… messageId=${envelope.messageId}`,
        );
        return;
      }
      console.warn(
        `[chat.message] misaddressed recipient from bonded contact ${payload.senderOwnerId}; accepting messageId=${envelope.messageId}`,
      );
    }

    const senderTrustForReach = await trustStore.getTrustRecord(payload.senderOwnerId);
    if (senderTrustForReach && senderTrustForReach.level !== "blocked") {
      void mesh.tagContactForPersistentReachability(remotePeerId).catch((err) =>
        console.warn(`[reachability] inbound chat tag failed:`, err),
      );
    }
    void peerDirectoryStore
      .ensurePeerFromInboundChat({
        ownerId: payload.senderOwnerId,
        peerId: remotePeerId,
        listenAddrs: remoteAddr?.trim()
          ? dialableInboundRemoteAddrs(remoteAddr, remotePeerId)
          : [],
      })
      .then(() => {
        console.log(`[peer-directory] ensurePeerFromInboundChat ownerId=${payload.senderOwnerId} peerId=${remotePeerId?.slice(0,12)??'null'} called`);
      })
      .catch((err) => console.warn(`[peer-directory] ensurePeerFromInboundChat failed:`, err));
    if (payload.ownerPublicKeyPem?.trim()) {
      void contactOwnerKeyStore
        .upsert(payload.senderOwnerId, payload.ownerPublicKeyPem)
        .catch((err) => console.warn(`[contact-owner-key] upsert failed:`, err));
    }
    void taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "allow",
        summary: `chat.message from ${payload.senderOwnerId}: ${payload.text.slice(0, 120)}`,
        createdAt: envelope.createdAt,
      }),
    );
    console.log(`[chat.message] ${payload.senderOwnerId}: ${payload.text}`);

    if (replyWithEnvelope && envelope.senderPeerId?.trim()) {
      try {
        await replyWithEnvelope(
          buildSignedChatDeliveredEnvelope({
            profile,
            messageId: envelope.messageId,
            recipientOwnerId: profile.owner.ownerId,
            envelopeRecipientPeerId: envelope.senderPeerId,
            correlationId: envelope.correlationId,
          }),
        );
      } catch (err) {
        console.warn(`[chat.message] delivery ack failed:`, err);
      }
    }

    if (bridgeIdentity && envelope.recipientPeerId === bridgeIdentity.agentPeerId) {
      void bridgeHandleMessage(envelope, remotePeerId);
      return;
    }

    // Emit chat:message event to connected apps via WebSocket
    console.log(`[chat.message] wsServerForEvents is ${wsServerForEvents ? "set" : "null"}`);
    if (wsServerForEvents) {
      const [senderTrust, selfHuman] = await Promise.all([
        trustStore.getTrustRecord(payload.senderOwnerId),
        humanProfileStore.loadHumanProfile(),
      ]);
      const chatMsg = {
        messageId: envelope.messageId,
        sender: {
          nodeId: remotePeerId,
          ownerId: payload.senderOwnerId,
          displayName: formatChatSenderDisplayName(
            senderTrust?.displayName ?? payload.senderOwnerId,
            payload,
          ),
          ...chatSenderActorFromEnvelope(
            envelope.senderRole,
            envelope.agentCredential,
            true,
          ),
        },
        recipient: {
          nodeId: mesh.peerId,
          ownerId: profile.owner.ownerId,
          displayName: selfHuman?.displayName ?? profile.owner.ownerId,
        },
        content: {
          text: stripModelThinking(payload.text),
          ...(payload.attachments?.length
            ? { attachments: chatWireAttachmentsToContent(payload.attachments) }
            : {}),
        },
        metadata: {
          timestamp: envelope.createdAt,
          deliveryReceipt: "delivered" as const,
        },
        signature: envelope.signature,
      };
      void (async () => {
        await chatLogStore.append(payload.senderOwnerId, chatMsg).catch((err) =>
          console.warn(`[chat.message] chat log append failed:`, err),
        );
        let emitMsg: typeof chatMsg = chatMsg;
        if (nodeService instanceof NodeServiceImpl) {
          emitMsg = await nodeService.reconcileInboundDirectChatMessage(
            payload.senderOwnerId,
            chatMsg as ChatMessage,
          ) as typeof chatMsg;
        }
        scheduleChatRagIndex(payload.senderOwnerId, emitMsg);
        void sessionManager.recordMessage(
          payload.senderOwnerId,
          emitMsg.sender.displayName,
          payload.text,
          false,
        ).catch((err) => console.warn(`[chat.message] session record failed:`, err));
        const matchedTopicTriggers = triggerStore.checkTopicTriggers(payload.text);
        for (const trigger of matchedTopicTriggers) {
          console.log(`[trigger] topic trigger fired: ${trigger.name} (${trigger.id}) action=${trigger.action.type}`);
          triggerStore.recordFire(trigger.id);
          void taskStore.appendAuditEvent(
            createAuditEvent({
              type: "trigger.fired",
              intent: "chat.message",
              messageId: envelope.messageId,
              correlationId,
              remotePeerId,
              direction: "inbound",
              verificationStatus: "verified",
              latencyMs: Date.now() - receivedAt,
              outcome: "record",
              summary: `topic trigger: ${trigger.name} action=${trigger.action.type} proactive=true`,
              createdAt: new Date().toISOString(),
            }),
          );
          wsServerForEvents.emitEvent("trigger:fired", {
            triggerId: trigger.id,
            triggerName: trigger.name,
            triggerType: trigger.triggerType,
            action: trigger.action,
            contactOwnerId: payload.senderOwnerId,
            contactDisplayName: emitMsg.sender.displayName,
            messagePreview: payload.text.slice(0, 80),
          });
        }
        wsServerForEvents.emitEvent("chat:message", emitMsg);
        void pushNotificationService.dispatchChatPush({
          senderName: emitMsg.sender.displayName ?? payload.senderOwnerId,
          messagePreview: payload.text.slice(0, 120),
          targetOwnerId: emitMsg.recipient.ownerId,
          messageId: envelope.messageId,
          senderOwnerId: payload.senderOwnerId,
        }).catch(() => {});
      })();

      void (async () => {
        const storedConfig = await nodeConfigStore.load();
        if (!storedConfig) {
          return;
        }
        let chatText = payload.text;
        const hasAudioAttachment = payload.attachments?.some((a) => a.mimeType?.startsWith("audio/"));
        if (!chatText.trim() && hasAudioAttachment) {
          chatText = "[Audio message — no transcription available]";
        }
        const mergedConfig = {
          ...storedConfig,
          chatAssistEnabled: currentChatAssistEnabled,
          autonomousKillSwitch: currentAutonomousKillSwitch,
          autonomousPolicies: [...currentAutonomousPolicies],
          aiSettings: currentAiSettings ?? storedConfig.aiSettings,
          contactAiPreferences: Array.from(currentContactAiPrefs.entries()).map(
            ([peerOwnerId, prefs]) => ({ peerOwnerId, ...prefs }),
          ),
        };
        await runInboundChatAssist({
          envelope,
          senderOwnerId: payload.senderOwnerId,
          chatText,
          remotePeerId,
          receivedAt,
          correlationId,
          config: mergedConfig,
          modelProviders: currentModelProviders,
          profile,
          taskStore,
          trustStore,
          peerDirectoryStore,
          draftStore: chatDraftStore,
          chatLogStore,
          humanProfileStore,
          agentIdentityStore,
          vaultDir: vaultDirForNode,
          styleAdapter,
          sendChat: async (targetOwnerId, text) => {
            if (!(nodeService instanceof NodeServiceImpl)) {
              throw new Error("NodeServiceImpl required for auto-send");
            }
            return nodeService.sendAgentChat(targetOwnerId, text);
          },
          emitDraft: (threadPeerOwnerId, draft) => {
            wsServerForEvents?.emitEvent("chat:draft", {
              threadPeerOwnerId,
              draft: { ...draft, threadPeerOwnerId },
            });
          },
          isOwnerOnline,
          modeController,
          ragService,
          approvalQueue,
          autoReplyLimitStore,
          onAutoReplyPaused: (notification) => {
            wsServerForEvents?.emitEvent("chat:auto-reply-paused", notification);
          },
        });
      })().catch((err) => console.warn(`[chat-assist] failed:`, err));
    }
    return;
  }

  // Bridge: forward chat messages to external agent (if configured)
  // Non-chat intents are ignored by the bridge handler.
  void bridgeHandleMessage(envelope, remotePeerId);

  if (envelope.intent === "device.pair.request") {
    const payload = parseDevicePairRequestPayload(envelope.payload);
    const expectedRequester = derivePeerId(payload.requesterDevicePublicKeyPem);
    if (expectedRequester !== envelope.senderPeerId) {
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "device.pair.request",
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: "Rejected device.pair.request: sender does not match requester device key.",
          createdAt: envelope.createdAt,
        }),
      );
      return;
    }

    const persistedCfg = await nodeConfigStore.load();

    // Phase 35C — LAN auto-bond: when the envelope carries a `lanFleetToken`
    // matching our own configured token, accept the bond silently. This runs
    // *before* the existing `companionPairingAutoAcceptWithToken` path so a
    // fleet-onboarded pair-request can land even when the operator hasn't
    // enabled the QR-pair auto-accept lever.
    if (nodeService instanceof NodeServiceImpl) {
      const decision = await evaluateLanAutoBondReceipt(
        {
          taskStore,
          loadConfig: () => nodeConfigStore.load(),
          // `sendPairRequest` is only used by `sendLanAutoBondRequest` (the
          // outbound path); the receive path never calls it. The dummy
          // implementation keeps the helper testable on both sides.
          sendPairRequest: async () => ({ ok: true }),
          getLocalIdentity: () => ({
            ownerId: profile?.owner.ownerId ?? "",
            deviceId: profile?.device.deviceId ?? "",
            devicePublicKeyPem: profile?.device.publicKeyPem ?? "",
          }),
          getOwnOwnerId: () => profile?.owner.ownerId ?? "",
        },
        envelope,
      );
      if (decision.accept) {
        await applyLanAutoBondAccept(
          {
            taskStore,
            loadConfig: () => nodeConfigStore.load(),
            sendPairRequest: async () => ({ ok: true }),
            getLocalIdentity: () => ({
              ownerId: profile?.owner.ownerId ?? "",
              deviceId: profile?.device.deviceId ?? "",
              devicePublicKeyPem: profile?.device.publicKeyPem ?? "",
            }),
            getOwnOwnerId: () => profile?.owner.ownerId ?? "",
          },
          {
            requesterOwnerId: payload.requesterOwnerId,
            requesterDeviceId: payload.requesterDeviceId,
            requesterPeerId: remotePeerId,
            remoteAddr,
            fingerprint: decision.fingerprint ?? "",
            correlationId,
            messageId: envelope.messageId,
            trustStore,
            peerDirectory: peerDirectoryStore,
          },
        );
        return;
      }
      // If the envelope *did* carry a fleet token but we declined (disabled,
      // token-mismatch, …) emit a `message.rejected` audit so the operator
      // can see why nothing happened.
      if (decision.reason === "token-mismatch" || decision.reason === "disabled") {
        void taskStore.appendAuditEvent(
          createAuditEvent({
            type: "message.rejected",
            intent: "device.pair.request",
            outcome: "deny",
            summary: `lan-auto-bond rejected: ${decision.reason}${decision.fingerprint ? ` (fp=${decision.fingerprint})` : ""}`,
            correlationId,
            remotePeerId,
            direction: "inbound",
          }),
        );
      }
    }

    const allowAuto =
      persistedCfg?.companionPairingAutoAcceptWithToken === true &&
      Boolean(payload.pairingToken) &&
      nodeService instanceof NodeServiceImpl &&
      await nodeService.validatePairingToken(payload.pairingToken!);

    if (allowAuto) {
      await trustStore.setTrustRecord({
        peerOwnerId: payload.requesterOwnerId,
        level: "direct",
        displayName: "Companion",
        note: "device.pair.request auto-accepted (pairing token)",
      });
      await peerDirectoryStore.ensurePeerFromInboundChat({
        ownerId: payload.requesterOwnerId,
        peerId: remotePeerId,
        listenAddrs: remoteAddr?.trim() ? [remoteAddr.trim()] : [],
      });
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.verified",
          intent: "device.pair.request",
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "verified",
          latencyMs: Date.now() - receivedAt,
          outcome: "allow",
          summary: `Auto-accepted companion pairing (pairingToken) for ${payload.requesterOwnerId}.`,
          createdAt: envelope.createdAt,
        }),
      );
      return;
    }

    const context = Buffer.from(
      JSON.stringify({
        requestId: payload.requestId,
        requesterPeerId: envelope.senderPeerId,
        requesterOwnerId: payload.requesterOwnerId,
        requesterDeviceId: payload.requesterDeviceId,
        requesterDevicePublicKeyPem: payload.requesterDevicePublicKeyPem,
        requestedDeviceProfile: payload.requestedDeviceProfile,
        requestedCapabilities: payload.requestedCapabilities,
      }),
      "utf8",
    ).toString("base64url");

    await taskStore.appendApprovalRequest(
      createApprovalRequest({
        ownerId: profile.owner.ownerId,
        taskId: `pairing:${payload.requestId}`,
        requestedAction: "device.sync",
        reason: `Pairing request from ${payload.requesterOwnerId}/${payload.requesterDeviceId}. ${payload.note ?? ""}\nPAIRING_CONTEXT:${context}`,
        peerOwnerId: payload.requesterOwnerId,
        peerDeviceId: payload.requesterDeviceId,
      }),
    );
    void taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: "device.pair.request",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "allow",
        summary: `Queued pairing approval for request ${payload.requestId}.`,
        createdAt: envelope.createdAt,
      }),
    );

    if (profile.deviceCertificate.deviceProfile !== "primary") {
      const deferredEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          recipientPeerId: envelope.senderPeerId,
          intent: "device.pair.deferred",
          payload: createDevicePairDeferredPayload({
            requestId: payload.requestId,
            deferredByDeviceId: profile.device.deviceId,
            reason: "Primary device approval required; request deferred.",
          }),
          correlationId,
        }),
        profile.device.privateKeyPem,
      );
      await deliverOutboundEnvelope(mesh, remotePeerId, deferredEnvelope);
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: "device.pair.deferred",
          messageId: deferredEnvelope.messageId,
          correlationId: deferredEnvelope.correlationId,
          remotePeerId,
          direction: "outbound",
          protocol: ENVOY_MESSAGE_PROTOCOL,
          outcome: "record",
          summary: `Sent pairing defer notice for ${payload.requestId}.`,
          createdAt: deferredEnvelope.createdAt,
        }),
      );
    }
    return;
  }

  if (envelope.intent === "device.pair.approve") {
    await handleDevicePairApproveViaRuntime(
      {
        parseDevicePairApprovePayload,
        getProfile: () => profile,
        verifyDeviceCertificate,
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        log: (msg: any) => console.log(msg),
        saveNodeProfile: (profileDir: string, p: any) =>
          saveNodeProfile(profileDir, p),
      },
      { envelope, remotePeerId, receivedAt, correlationId, profileDir: args.profileDir },
    );
    return;
  }

  if (envelope.intent === "device.pair.deferred") {
    await handleDevicePairDeferredViaRuntime(
      {
        parseDevicePairDeferredPayload,
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
      },
      { envelope, remotePeerId, receivedAt, correlationId },
    );
    return;
  }

  if (
    envelope.intent === "social.intro.sync" ||
    envelope.intent === "social.intro.propose" ||
    envelope.intent === "social.intro.owner-ready"
  ) {
    const nodeCfg = await nodeService.getNodeConfig();
    const intro = await handleInboundSocialIntroIntent({
      envelope,
      profile,
      remotePeerId,
      receivedAt,
      correlationId,
      taskStore,
      trustStore,
      peerDirectoryStore,
      trustModeEnabled: nodeCfg.trustModeEnabled ?? false,
      onSocialIntroPropose: (data) => {
        if (nodeService instanceof NodeServiceImpl) {
          nodeService.storePendingSocialIntroProposal({
            ...data,
            commitmentApproved: false,
          });
        }
      },
      onSocialIntroOwnerReady: (data) => {
        if (nodeService instanceof NodeServiceImpl) {
          void nodeService.handleSocialProxyPeerOwnerReady(data);
        }
      },
    });
    if (!intro.ok) {
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `Rejected social intro message: ${intro.reason}.`,
          createdAt: envelope.createdAt,
        }),
      );
      console.warn(`[rejected social.intro] ${envelope.intent}: ${intro.reason}`);
    }
    return;
  }

  if (
    envelope.intent === "bond.request" ||
    envelope.intent === "bond.accept" ||
    envelope.intent === "bond.challenge" ||
    envelope.intent === "bond.challenge.response"
  ) {
    console.log(`[inbound] bond intent: ${envelope.intent} from=${remotePeerId}, messageId=${envelope.messageId}`);
    console.log(`[inbound] calling handleInboundBondIntent for ${envelope.intent}...`);
    const bond = await handleInboundBondIntent(
      {
        envelope,
        profile,
        remotePeerId,
        receivedAt,
        correlationId,
        taskStore,
        trustStore,
      },
      (helloData) => {
        // Store pending request in nodeService so acceptHello() can find it later
        nodeService.storePendingHelloRequest(helloData);
        // Emit hello:request via wsServer if available
        if (wsServerForEvents) {
          wsServerForEvents.emitEvent("hello:request", helloData);
        }
      },
      async (bondData) => {
        // Emit bond:established via wsServer if available
        console.log(`[bond:established callback] intent=${envelope.intent}, emitting bond:established for peerOwnerId=${bondData.peerOwnerId}`);
        if (wsServerForEvents) {
          console.log(`[bond:established callback] calling wsServer.emitEvent with peerOwnerId=${bondData.peerOwnerId}`);
          wsServerForEvents.emitEvent("bond:established", bondData);
        } else {
          console.log(`[bond:established callback] wsServerForEvents is null!`);
        }
        // Persist counterparty ownerId ↔ libp2p peerId for every bond event (new or refresh).
        if (envelope.intent === "bond.request") {
          try {
            const { parseBondRequestPayload } = await import("@envoymesh/protocol");
            const payload = parseBondRequestPayload(envelope.payload);
            await peerDirectoryStore.ensurePeerFromInboundChat({
              ownerId: payload.requesterOwnerId,
              peerId: remotePeerId,
              listenAddrs: dialableInboundRemoteAddrs(remoteAddr, remotePeerId),
            });
          } catch (err) {
            console.error(`[bond:established] failed to store peer in directory:`, err);
          }
        } else if (envelope.intent === "bond.accept") {
          try {
            const { parseBondAcceptPayload } = await import("@envoymesh/protocol");
            const payload = parseBondAcceptPayload(envelope.payload);
            await peerDirectoryStore.ensurePeerFromInboundChat({
              ownerId: payload.responderOwnerId,
              peerId: remotePeerId,
              listenAddrs: dialableInboundRemoteAddrs(remoteAddr, remotePeerId),
            });
          } catch (err) {
            console.error(`[bond:established] failed to store peer from bond.accept:`, err);
          }
        }
        // Phase 33 — auto-fetch the peer's agent card on bond establishment. Fire-and-forget
        // so the bond handler doesn't block on slow peers; the inbound agent-card-inbound
        // handler caches the response on arrival.
        void agentCardAutoFetcher
          .onBondEstablished({ peerOwnerId: bondData.peerOwnerId, remotePeerId })
          .catch((err) =>
            console.warn(`[bond:established] auto-fetch agent card failed:`, err),
          );
        void mesh.tagContactForPersistentReachability(remotePeerId).catch((err) =>
          console.warn(`[reachability] bond tag failed:`, err),
        );
      },
      envelope.intent === "bond.request"
        ? async (payload) => {
            const cfg = await nodeConfigStore.load();
            const result = await tryBondAutonomyInboundAutoAccept({
              envelope,
              remotePeerId,
              profile,
              trustStore,
              taskStore,
              config: cfg,
              autonomousKillSwitch: cfg?.autonomousKillSwitch ?? false,
              getDailyAutoBondCount: () => bondAutonomyDailyCounter.getCount(),
              incrementDailyAutoBondCount: () => bondAutonomyDailyCounter.increment(),
              hasIntroCorrelation: async (requesterOwnerId: string, _responderOwnerId: string) => {
                // Real implementation: a hello is referral-vouched when there's
                // a pending social-intro proposal whose candidate is this
                // requester and whose introCorrelationId matches the one
                // carried in the bond.request payload.
                try {
                  const proposals = await nodeService.listPendingSocialIntroProposals();
                  return proposals.some(
                    (p) =>
                      p.candidateOwnerId === requesterOwnerId &&
                      Boolean(p.introCorrelationId),
                  );
                } catch {
                  return false;
                }
              },
              getTrustOverlapScore: async (requesterOwnerId: string, responderOwnerId: string) => {
                // Real implementation: compute interest/capability overlap
                // between the owner's profile and the requester's cached
                // peer profile, reusing the connection-suggester matcher.
                try {
                  if (requesterOwnerId === responderOwnerId) return 1;
                  const ownerProfile = await nodeService.getHumanProfile();
                  const peerView = await nodeService.getPeerProfile(requesterOwnerId);
                  if (!ownerProfile || !peerView) return 0;
                  const ownerTopics = [
                    ...(ownerProfile.hobbies ?? []),
                    ...(ownerProfile.knowledge ?? []),
                  ];
                  const peerProfile = peerView.profile;
                  const peerTopics = [
                    ...(peerProfile.hobbies ?? []),
                    ...(peerProfile.knowledge ?? []),
                  ];
                  const peerCaps = (peerProfile.capabilities ?? []).map((c) =>
                    "tag" in c ? c.tag : "descriptor" in c ? c.descriptor : "",
                  );
                  const { score } = matchPeerInterests(ownerTopics, peerTopics, peerCaps);
                  return score;
                } catch {
                  return 0;
                }
              },
            });
            return result.accepted ? result : { accepted: false as const };
          }
        : undefined,
    );
    if (!bond.ok) {
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `Rejected bond message: ${bond.reason}.`,
          createdAt: envelope.createdAt,
        }),
      );
      console.warn(`[rejected bond] ${envelope.intent}: ${bond.reason}`);
      return;
    }

    if (bond.ok && bond.bondAcceptToRequester) {
      const { requesterPeerId, requesterOwnerId } = bond.bondAcceptToRequester;
      const humanProfile = await humanProfileStore.loadHumanProfile();
      const displayName = humanProfile?.displayName ?? profile.owner.ownerId;
      const unsignedAccept = createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        recipientPeerId: requesterPeerId,
        intent: "bond.accept",
        payload: createBondAcceptPayload({
          responderOwnerId: profile.owner.ownerId,
          requesterOwnerId,
          message: `Hello from ${displayName}!`,
        }),
        correlationId,
      });
      const signedAccept = signUnsignedEnvelope(unsignedAccept, profile.device.privateKeyPem);
      const requesterDir = await peerDirectoryStore.getPeerByOwnerId(requesterOwnerId);
      try {
        const dialHints = await buildOutboundDialHints({
          recipientPeerId: requesterPeerId,
          peerListenAddrs: requesterDir?.listenAddrs,
          discoverySeedStore,
          config: undefined,
          localListenAddrs: mesh.multiaddrs,
        });
        await deliverOutboundEnvelope(mesh, requesterPeerId, signedAccept, { dialHints });
        void taskStore.appendAuditEvent(
          createAuditEvent({
            type: "message.sent",
            intent: signedAccept.intent,
            messageId: signedAccept.messageId,
            correlationId: signedAccept.correlationId,
            remotePeerId: requesterPeerId,
            direction: "outbound",
            protocol: ENVOY_MESSAGE_PROTOCOL,
            outcome: "record",
            summary: "Sent bond.accept to requester after auto-accept.",
            createdAt: signedAccept.createdAt,
          }),
        );
        void mesh.tagContactForPersistentReachability(requesterPeerId).catch((err) =>
          console.warn(`[reachability] auto bond.accept tag failed:`, err),
        );
      } catch (err) {
        console.error(
          `[bond.request] auto-accept: failed to send bond.accept to requester ${requesterPeerId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return;
  }

  if (isA2ATaskIntent(envelope.intent)) {
    const taskResult = await handleDaemonTaskInbound({
      envelope,
      remotePeerId,
      receivedAt,
      correlationId,
      taskStore,
      taskRuntimeStore,
      taskDispatcher,
      nodeService: nodeService instanceof NodeServiceImpl ? nodeService : null,
      senderOwnerId: envelope.agentCredential?.ownerId,
    });
    if (taskResult.handled) {
      if (
        taskResult.taskDecision?.action === "handled" &&
        taskResult.taskDecision.intent === "task.cancel"
      ) {
        await relayTaskCancelIfNeeded({
          envelope,
          taskDecision: taskResult.taskDecision,
          mesh,
          profile,
          taskStore,
        });
      }
      if (taskResult.outcome === "handled" && taskResult.taskDecision?.action === "handled") {
        console.log(
          `[task ${taskResult.taskDecision.state}] ${taskResult.taskDecision.intent} task=${taskResult.taskDecision.taskId} event=${taskResult.taskDecision.journalEntry.eventId}`,
        );
      }
      if (taskResult.outcome === "rejected_dispatch" && taskResult.taskDecision?.action === "rejected") {
        console.warn(`[rejected task] ${taskResult.taskDecision.intent}: ${taskResult.taskDecision.reason}`);
      }
    }
    return;
  }

  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.verified",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "allow",
      summary: "Verified message without a specialized handler.",
      createdAt: envelope.createdAt,
    }),
  );
  console.log(`[verified message] ${envelope.intent} from ${envelope.senderPeerId}`);
}

/** Process one inbound libp2p message per event-loop turn so WS upgrade can interleave. */
const MESH_INBOUND_QUEUE_MAX = 128;
const meshInboundQueue: InboundMeshMessageParams[] = [];
let meshInboundDrainScheduled = false;

function scheduleMeshInboundDrain(): void {
  if (meshInboundDrainScheduled) {
    return;
  }
  meshInboundDrainScheduled = true;
  setImmediate(() => {
    meshInboundDrainScheduled = false;
    const params = meshInboundQueue.shift();
    if (!params) {
      return;
    }
    void handleInboundMeshMessage(params)
      .catch((err) => {
        console.warn(
          `[inbound] handler failed for ${params.envelope.intent} from ${params.remotePeerId.slice(0, 12)}…:`,
          err instanceof Error ? err.message : err,
        );
      })
      .finally(() => {
      if (meshInboundQueue.length > 0) {
        scheduleMeshInboundDrain();
      }
    });
  });
}

mesh.onMessage(async (params) => {
  const { envelope: inboundEnvelope, remotePeerId, replyWithEnvelope } = params;
  if (isMessageSeen(inboundEnvelope.messageId)) {
    return;
  }
  const isRateLimitExemptIntent =
    inboundEnvelope.intent === "profile.sync" ||
    inboundEnvelope.intent === "profile.request" ||
    inboundEnvelope.intent === "profile.response" ||
    inboundEnvelope.intent === "share.preview" ||
    inboundEnvelope.intent === "share.request" ||
    inboundEnvelope.intent === "share.accept" ||
    inboundEnvelope.intent === "chat.delivered";
  if (!isRateLimitExemptIntent && !checkInboundRateLimit(remotePeerId)) {
    return;
  }
  markMessageSeen(inboundEnvelope.messageId);
  // Same-stream replies must run before the inbound handler closes the libp2p stream.
  if (replyWithEnvelope) {
    await handleInboundMeshMessage(params);
    return;
  }
  if (meshInboundQueue.length >= MESH_INBOUND_QUEUE_MAX) {
    return;
  }
  meshInboundQueue.push(params);
  scheduleMeshInboundDrain();
});

// ── Public IP discovery ────────────────────────────────────────────────────────
// Priority: UPnP → STUN → autoNAT → relay-observed
// First valid result wins; we inject it into mesh so provideSelf() advertises
// it to DHT and the node becomes discoverable by mobile clients on the go.
async function discoverAndSetPublicAddr(mesh: EnvoyMesh, args: NodeArgs): Promise<void> {
  let discovered = false;

  // Method 1: UPnP (automatic port forwarding, if enabled and available).
  // UPnP runs first because it can give us a directly reachable address
  // without relying on STUN or relay. It also configures port forwarding
  // so external peers can dial us directly.
  if (args.enableUpnp) {
    // Get our actual libp2p listen port from getMultiaddrs.
    const listenAddrs = mesh.multiaddrs;
    let internalPort: number | null = null;
    for (const maStr of listenAddrs ?? []) {
      const tcpMatch = maStr.match(/\/tcp\/(\d+)/);
      if (tcpMatch) {
        internalPort = parseInt(tcpMatch[1], 10);
        break;
      }
    }
    if (internalPort != null) {
      console.log(`[node] UPnP: attempting to map external port ${DEFAULT_LIBP2P_PORT} -> internal ${internalPort}...`);
      const upnpResult = await upnpDiscoverAndMap(internalPort, DEFAULT_LIBP2P_PORT, 5000);
      if (upnpResult) {
        const multiaddr = `/ip4/${upnpResult.ip}/tcp/${upnpResult.port}`;
        mesh.setAdvertisedAddress(multiaddr);
        console.log(`[node] public addr discovered via UPnP: ${multiaddr}`);
        discovered = true;
      } else {
        console.log(`[node] UPnP: no gateway available or mapping failed`);
      }
    } else {
      console.log(`[node] UPnP: could not determine internal listen port`);
    }
  }

  // Method 2: STUN (parallel to all configured servers).
  if (args.stunServers.length > 0 && !discovered) {
    console.log(`[node] STUN: querying ${args.stunServers.length} server(s)...`);
    const result = await raceStunServers(args.stunServers, 3000);
    if (result) {
      const multiaddr = `/ip4/${result.ip}/tcp/${result.port}`;
      mesh.setAdvertisedAddress(multiaddr);
      console.log(`[node] public addr discovered via STUN: ${multiaddr}`);
      discovered = true;
    } else {
      console.log(`[node] STUN: all servers failed or timed out`);
    }
  }

  // Method 3: autoNAT (passive — subscribe to self:reachable events).
  // This fires when libp2p's autonat service determines our external address.
  if (args.enableAutoNat && !discovered) {
    console.log(`[node] autoNAT: subscribing to self:reachable events`);
    let unsub = () => {};
    const wrapper = (addr: string) => {
      if (discovered) { unsub(); return; }
      discovered = true;
      unsub();
      mesh.setAdvertisedAddress(addr);
      console.log(`[node] public addr discovered via autoNAT: ${addr}`);
    };
    unsub = mesh.onAutoNATReachable(wrapper);
  }

  // Method 4: relay-observed addr — wired via relay-tunnel-client.ts callback.
  // The callback calls mesh.setAdvertisedAddress() directly when it receives the
  // observed-addr frame from the relay.
  console.log(`[node] relay-observed addr: wired via relay-tunnel-client callback`);
}

let clientProxyHandlerRegistered = false;

async function registerClientProxyHandler(): Promise<void> {
  if (!(nodeService instanceof NodeServiceImpl) || !meshStarted || clientProxyHandlerRegistered) {
    return;
  }
  await mesh.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(nodeService));
  clientProxyHandlerRegistered = true;
  console.log(`[node] client-proxy protocol handler registered: ${CLIENT_PROXY_PROTOCOL}`);
}

async function startRelayTunnelIfConfigured(): Promise<void> {
  if (!(nodeService instanceof NodeServiceImpl) || !meshStarted || relayTunnelClient) {
    return;
  }
  try {
    const relayWsUrl = await nodeService.resolveRelayWsUrl();
    if (relayWsUrl) {
      relayTunnelClient = new RelayTunnelClient({
        relayWsUrl,
        homePeerId: mesh.peerId,
        localWsServerUrl: socialWsLoopbackUrl(),
        log: (msg) => console.log(msg),
        onObservedAddr: (addr) => {
          const ipMatch = addr.match(/^\/ip4\/([^\/]+)/);
          if (ipMatch) {
            const publicIp = ipMatch[1];
            const fixedAddr = `/ip4/${publicIp}/tcp/4001`;
            mesh.setAdvertisedAddress(fixedAddr);
            console.log(
              `[node] public addr discovered via relay: ${addr} -> advertising ${fixedAddr} (configure port forwarding: external 4001 -> internal libp2p port)`,
            );
          } else {
            mesh.setAdvertisedAddress(addr);
            console.log(`[node] public addr discovered via relay observed addr: ${addr}`);
          }
        },
      });
      relayTunnelClient.start();
      console.log(`[node] relay-tunnel: connecting to ${relayWsUrl} (peerId=${mesh.peerId.slice(0, 12)}…)`);
    } else {
      console.log(
        `[node] relay-tunnel: skipped (no relay reachable — set relayPublicWsUrl or ensure a configured relay is connected)`,
      );
    }
  } catch (err) {
    console.warn(`[node] relay-tunnel: failed to resolve relay URL: ${(err as Error).message}`);
  }
}

async function activateCliMesh(reloadDiscoveryFromConfig: boolean): Promise<void> {
  if (meshStarted) {
    return;
  }
  if (cliMeshActivationInFlight && cliMeshActivationPromise) {
    await cliMeshActivationPromise;
    return;
  }
  cliMeshActivationInFlight = true;
  cliMeshActivationPromise = (async () => {
    try {
      if (reloadDiscoveryFromConfig) {
        const config = await nodeConfigStore.load();
        if (!config) {
          throw new Error("No node config found. Complete setup first.");
        }
        applyPersistedDiscoveryConfig(args, config);
        const connectivityRuntime = resolveConnectivityRuntime({
          profile: args.discoveryProfile,
          enableMdns: args.enableMdnsExplicit ? args.enableMdns : undefined,
          tuning: args.connectivityTuning,
        });
        args.enableMdns = connectivityRuntime.enableMdns;
        args.enableDht = connectivityRuntime.enableDht;

        const resolvedBootstrapResults = await resolveBootstrapAddresses(args.bootstrapPeers);
        const resolvedBootstrapPeers = resolvedBootstrapResults.flatMap((r) => r.resolved);
        const persistedSeedAddrs = seedAddrsForDiscoveryProfile(
          args.discoveryProfile,
          await discoverySeedStore.listSeedRecords(),
        );
        const rawBootstrapPeers = dedupeAddrs([...resolvedBootstrapPeers, ...persistedSeedAddrs]);
        const effectivePeers = filterBootstrapMultiaddrs(rawBootstrapPeers);

        const meshOpts = (mesh as unknown as { options: EnvoyMeshOptions }).options;
        meshOpts.bootstrapPeers = effectivePeers;
        meshOpts.enableMdns = connectivityRuntime.enableMdns;
        meshOpts.mdnsIntervalMs = connectivityRuntime.mdnsIntervalMs;
        meshOpts.enableDht = connectivityRuntime.enableDht;
        meshOpts.enableRelay = args.enableRelay;
        meshOpts.enableRelayServer = args.enableRelayServer;
        if (connectivityRuntime.maxConnections != null) {
          meshOpts.maxConnections = connectivityRuntime.maxConnections;
        }
      }

      await mesh.start();
      meshStarted = true;
      lastKnownLibp2pPeerId = mesh.peerId;

      void discoverAndSetPublicAddr(mesh, args);
      if (!publicAddrPeriodicDiscoveryStarted) {
        publicAddrPeriodicDiscoveryStarted = true;
        setInterval(() => {
          void discoverAndSetPublicAddr(mesh, args);
        }, 10 * 60 * 1000);
      }

      if (args.enableDht) {
        let advertiseAttempt = 0;
        const advertise = () => {
          advertiseAttempt++;
          console.log(`[node] DHT self-advertisement attempt ${advertiseAttempt}...`);
          mesh.provideSelf().catch((err) => console.warn("[node] provideSelf failed:", err));
        };
        setTimeout(() => advertise(), 30000);
        setTimeout(() => advertise(), 60000);
        setTimeout(() => advertise(), 90000);

        // CLI path doesn't go through NodeServiceImpl.startNode, so call the
        // DHT advertising pipeline directly. This makes interest topics from
        // the human profile (hobbies, knowledge, username) discoverable via
        // `findCapabilityTopicProviders` on the public DHT.
        if (nodeService instanceof NodeServiceImpl) {
          // CLI path doesn't go through NodeServiceImpl.startNode, so call the
          // DHT advertising pipeline directly. This makes interest topics from
          // the human profile (hobbies, knowledge, username) discoverable via
          // `findCapabilityTopicProviders` on the public DHT.
          setTimeout(() => {
            void nodeService._advertiseInterestsIfPublic().catch((err) => {
              console.warn("[node] advertiseInterestsIfPublic failed:", err);
            });
          }, 5_000);
          // Re-advertise periodically (NodeService path also does this).
          setInterval(() => {
            void nodeService._advertiseInterestsIfPublic().catch((err) => {
              console.warn("[node] advertiseInterestsIfPublic (periodic) failed:", err);
            });
          }, 5 * 60 * 1000);
        }
      }

      if (nodeService instanceof NodeServiceImpl) {
        nodeService.bindExternalMesh(mesh);
      }

      if (args.enableRelayServer) {
        rendezvousRegistry = new CapabilityRegistry({ verbosity: "minimal", logPrefix: "[node-rendezvous]" });
        rendezvousSweeper = rendezvousRegistry.startSweeper();
        console.log("[node] Rendezvous capability registry enabled (--relay-server)");
      }

      if (args.bootstrapPeers.length > 0) {
        await discoverySeedStore.upsertMany(args.bootstrapPeers, "manual-bootstrap");
      }

      console.log("Envoy node started");

      stopNodeStatsLogging = startNodeStatsInterval(mesh, {
        processStartedAtMs: processStartedAt,
        relayRosterSize: () => relayRoster.entries().length,
      });

      await registerClientProxyHandler();
      await startRelayTunnelIfConfigured();
    } finally {
      cliMeshActivationInFlight = false;
    }
  })();
  await cliMeshActivationPromise;
}

async function ensureCliMeshActivated(reloadDiscoveryFromConfig: boolean): Promise<void> {
  await cliMeshReadyPromise;
  if (meshStarted) {
    return;
  }
  if (cliMeshActivationPromise) {
    await cliMeshActivationPromise;
    return;
  }
  await activateCliMesh(reloadDiscoveryFromConfig);
}

installEnvoyDataTransferReceiver({
  mesh,
  peerDirectoryStore,
  taskStore,
  vaultDir: vaultDirForNode,
  resolveInboundRelativePath:
    nodeService instanceof NodeServiceImpl
      ? (remotePeerId, voucherRelativePath) =>
          nodeService.resolveInboundDataTransferRelativePath(remotePeerId, voucherRelativePath)
      : undefined,
  onInboundVaultWriteCommitted:
    nodeService instanceof NodeServiceImpl
      ? (remotePeerId, voucherSourceRelativePath) =>
          nodeService.consumeInboundDataTransferSaveMapping(remotePeerId, voucherSourceRelativePath)
      : undefined,
  onInboundTransferVerified:
    nodeService instanceof NodeServiceImpl
      ? (input) => nodeService.notifyInboundTransferVerified(input)
      : undefined,
});

cliMeshReadyResolve?.();
cliMeshReadyResolve = undefined;

if (persistedNodeConfig) {
  await ensureCliMeshActivated(false);
} else {
  console.log("[node] Social WebSocket ready — complete setup in the UI to start the mesh");
}

// Periodic cleanup of expired rate limit entries
rateLimitCleanupInterval = setInterval(() => {
  try {
    const now = Date.now();
    let cleaned = 0;
    for (const [peerId, entry] of peerRegistrationCount.entries()) {
      if (entry.resetAt < now) {
        peerRegistrationCount.delete(peerId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[node] Rate limit cleanup: removed ${cleaned} expired entries`);
    }
  } catch (err) {
    console.error("[node] Rate limit cleanup error:", err);
  }
}, 60_000);

startEventLoopLagMonitor();

const { loadPersistedAssistState } = await import("./terminal-assist-persist.js");
const initialAssistPersist = await loadPersistedAssistState(args.profileDir);
let terminalAgentAssist!: TerminalAgentAssist;
const terminalManager = new TerminalManager({
  profileDir: args.profileDir,
  taskStore,
  onSessionsChanged: () => {
    if (nodeService instanceof NodeServiceImpl) {
      nodeService.emitTerminalSessionsUpdated();
    }
    wsServerForEvents?.emitEvent("terminal:session-updated", {
      sessions: terminalManager.listSessionSummaries(),
    });
  },
  onSessionActivity: (sessionId) => {
    void terminalAgentAssist.onSessionActivity(sessionId).then((events) => {
      for (const event of events) {
        if (nodeService instanceof NodeServiceImpl) {
          nodeService.emit("terminal:watch-ready", event);
        }
        wsServerForEvents?.emitEvent("terminal:watch-ready", event);
      }
    });
  },
});
const { execFile } = await import("node:child_process");
const { promisify } = await import("node:util");
const execFileAsync = promisify(execFile);
terminalAgentAssist = new TerminalAgentAssist({
  manager: terminalManager,
  taskStore,
  profileDir: args.profileDir,
  initialPersistedSessions: initialAssistPersist.sessions,
  contextReaders:
    nodeService instanceof NodeServiceImpl
      ? {
          readVaultSnippet: async (relativePath, maxBytes) => {
            const result = await nodeService.readLibraryItemContent({ relativePath, maxBytes });
            return Buffer.from(result.contentBase64, "base64").toString("utf8");
          },
          readWorkspaceSnippet: async (relativePath, maxBytes) => {
            const result = await nodeService.readOpenClawWorkspaceFile({ relativePath, maxBytes });
            return Buffer.from(result.contentBase64, "base64").toString("utf8");
          },
          runReadOnlyGit: async (cwd, gitArgs, maxBytes) => {
            const { stdout } = await execFileAsync("git", gitArgs, {
              cwd,
              timeout: 5000,
              maxBuffer: maxBytes,
            });
            return stdout;
          },
        }
      : {},
  getModelProviders: async () => (await nodeService.getNodeConfig()).modelProviders,
  getAssistSettings: async () => {
    const cfg = await nodeService.getNodeConfig();
    return {
      terminalAssistModelName: cfg.terminalAssistModelName,
      chatModelName: cfg.modelProviders.modelName,
      terminalCommandAllowPatterns: cfg.terminalCommandAllowPatterns,
      terminalCommandDenyPatterns: cfg.terminalCommandDenyPatterns,
      terminalCommandDestructivePatterns: cfg.terminalCommandDestructivePatterns,
      terminalAgentModeDefault: cfg.terminalAgentModeDefault,
      terminalAutoRunPolicy: cfg.terminalAutoRunPolicy,
      terminalInlineSuggestEnabled: cfg.terminalInlineSuggestEnabled,
    };
  },
  askOpenClaw:
    nodeService instanceof NodeServiceImpl
      ? async (prompt: string) => {
          const { stripModelThinking } = await import("@envoymesh/api");
          try {
            return stripModelThinking(await nodeService.askOpenClaw(prompt));
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/OpenClaw not available/i.test(msg)) {
              throw new Error("terminal.agent.openclawUnavailable");
            }
            throw err instanceof Error ? err : new Error(msg);
          }
        }
      : undefined,
  sendToAssistant:
    nodeService instanceof NodeServiceImpl
      ? async (message: string, correlationId: string) => {
          const { stripModelThinking } = await import("@envoymesh/api");
          const result = await nodeService.runOwnerAgentTurn(
            `[correlationId=${correlationId}]\n${message}`,
          );
          return stripModelThinking(result.answer);
        }
      : undefined,
});
const terminalWsServer = new TerminalWsServer({
  port: TERMINAL_WS_PORT,
  pathPrefix: "/ws/terminal",
  manager: terminalManager,
});
terminalWsServer.start();
terminalManager.setTerminalWsListenAddress(TERMINAL_WS_PORT, "/ws/terminal");

if (nodeService instanceof NodeServiceImpl) {
  nodeService.setTerminalManager(terminalManager);
  nodeService.setTerminalAgentAssist(terminalAgentAssist);
}

if (nodeService instanceof NodeServiceImpl && !meshStarted) {
  console.log("[node] client-proxy deferred until first-run setup completes");
}

await runNodeHealthCycle("startup");
scheduleNodeHealth();

// Start periodic checks (Phase 9D + 9G): every 30s
modeTransitionTimer = setInterval(() => {
  modeController.checkOfflineTransition();
  modeController.checkScheduleTransition();
  // Check time-based proactive triggers (Phase 9G)
  const now = new Date();
  const dueTimeTriggers = triggerStore.checkTimeTriggers(now);
  for (const trigger of dueTimeTriggers) {
    console.log(`[trigger] time trigger fired: ${trigger.name} (${trigger.id}) action=${trigger.action.type}`);
    triggerStore.recordFire(trigger.id);
    void taskStore.appendAuditEvent(
      createAuditEvent({
        type: "trigger.fired",
        intent: "chat.message",
        messageId: randomUUID(),
        remotePeerId: "local",
        direction: "local",
        verificationStatus: "verified",
        latencyMs: 0,
        outcome: "record",
        summary: `time trigger: ${trigger.name} action=${trigger.action.type} proactive=true`,
        createdAt: now.toISOString(),
      }),
    );
  }
  // Expire old approval items (Phase 9H)
  const expiredIds = approvalQueue.expireOldItems();
  if (expiredIds.length > 0) {
    console.log(`[approval] expired ${expiredIds.length} items`);
  }
  // Phase 14A — scheduled friend autopilot (legacy when social proxy off)
  if (nodeService instanceof NodeServiceImpl && !friendAutopilotRunInFlight) {
    friendAutopilotRunInFlight = true;
    void nodeService
      .getNodeConfig()
      .then((cfg) => {
        if (cfg.socialProxyEnabled) return { ok: false };
        return nodeService.runScheduledFriendAutopilot();
      })
      .then((result) => {
        if (result.ok) {
          console.log("[friend-autopilot] scheduled pass completed");
        }
      })
      .catch((err) => console.warn("[friend-autopilot] scheduled pass failed:", err))
      .finally(() => {
        friendAutopilotRunInFlight = false;
      });
  }
  // Phase 16B — social proxy pass
  if (nodeService instanceof NodeServiceImpl && !socialProxyRunInFlight) {
    socialProxyRunInFlight = true;
    void nodeService
      .getNodeConfig()
      .then((cfg) => (cfg.socialProxyEnabled ? nodeService.runSocialProxyPass() : { ok: false }))
      .then((result) => {
        if (result.ok) {
          console.log("[social-proxy] scheduled pass completed");
        }
      })
      .catch((err) => console.warn("[social-proxy] scheduled pass failed:", err))
      .finally(() => {
        socialProxyRunInFlight = false;
      });
  }
  // Phase 16C — document acquisition worker tick
  if (nodeService instanceof NodeServiceImpl && !documentAcquisitionRunInFlight) {
    documentAcquisitionRunInFlight = true;
    void nodeService
      .runDocumentAcquisitionWorker()
      .catch((err) => console.warn("[document-acquisition] worker tick failed:", err))
      .finally(() => {
        documentAcquisitionRunInFlight = false;
      });
  }
  // Phase 16E — capability provider route executor tick
  if (nodeService instanceof NodeServiceImpl && !capabilityProviderRunInFlight) {
    capabilityProviderRunInFlight = true;
    void nodeService
      .runCapabilityProviderWorker()
      .catch((err) => console.warn("[capability-provider] worker tick failed:", err))
      .finally(() => {
        capabilityProviderRunInFlight = false;
      });
  }
  // Phase 23C — bond steward pass (dormant bond detection)
  if (nodeService instanceof NodeServiceImpl && !bondStewardRunInFlight) {
    bondStewardRunInFlight = true;
    void nodeService
      .getNodeConfig()
      .then(() => nodeService.runBondStewardPass(90))
      .then((result) => {
        if (result.dormantBonds.length > 0) {
          console.log(`[bond-steward] ${result.summary}`);
        }
      })
      .catch((err) => console.warn("[bond-steward] pass failed:", err))
      .finally(() => { bondStewardRunInFlight = false; });
  }
  // Phase 25A — mesh awareness pass
  if (nodeService instanceof NodeServiceImpl && !meshAwarenessRunInFlight) {
    meshAwarenessRunInFlight = true;
    void nodeService
      .runMeshAwarenessPass()
      .then((insights) => {
        if (insights.length > 0) {
          console.log(`[mesh-awareness] ${insights.length} insight(s) generated`);
        }
      })
      .catch((err) => console.warn("[mesh-awareness] pass failed:", err))
      .finally(() => { meshAwarenessRunInFlight = false; });
  }
  // Phase 23B — connection suggestion pass
  if (nodeService instanceof NodeServiceImpl && !connectionSuggesterRunInFlight) {
    connectionSuggesterRunInFlight = true;
    void nodeService
      .runConnectionSuggesterPass()
      .then((suggestions) => {
        if (suggestions.length > 0) {
          const msg = suggestions.map((s) => `${s.remoteDisplayName} (${s.reason})`).join("; ");
          console.log(`[connection-suggester] ${suggestions.length} suggestion(s): ${msg}`);
        }
      })
      .catch((err) => console.warn("[connection-suggester] pass failed:", err))
      .finally(() => { connectionSuggesterRunInFlight = false; });
  }
  // Phase 27 — proactive agent: pre-compute summaries when clusters detected
  if (nodeService instanceof NodeServiceImpl && !proactiveAgentRunInFlight) {
    proactiveAgentRunInFlight = true;
    void nodeService
      .runProactiveAgentPass()
      .then((insights) => {
        if (insights.length > 0) {
          console.log(`[proactive-agent] ${insights.length} proactive insight(s) ready`);
        }
      })
      .catch((err) => console.warn("[proactive-agent] pass failed:", err))
      .finally(() => { proactiveAgentRunInFlight = false; });
  }
  // Check digest schedule (Phase 9J)
  const digestConfig = digestGenerator.getConfig();
  if (digestConfig.frequency !== "off") {
    const nextScheduled = digestGenerator.getNextScheduledTime();
    if (nextScheduled && now >= nextScheduled) {
      console.log(`[digest] generating ${digestConfig.frequency} digest`);
      const period = digestConfig.frequency as "daily" | "weekly";
      void sessionManager.listSessions().then(async (sessions) => {
        let a2aActivityCount = 0;
        let friendAutopilotPassCount = 0;
        if (nodeService instanceof NodeServiceImpl) {
          const { start } = getDigestPeriodDates(period);
          const rows = await nodeService.listAgentActivity({ since: start.toISOString(), limit: 5000 });
          a2aActivityCount = rows.length;
          friendAutopilotPassCount = rows.filter((r) => r.kind === "friend_autopilot_pass").length;
        }
        return digestGenerator.generateDigest(period, {
          contactActivity: sessions.map((s) => ({
            contactOwnerId: s.contactOwnerId,
            contactDisplayName: s.contactDisplayName,
            messageCount: s.messageCount,
            lastInteractionAt: s.lastInteraction,
            escalated: s.pendingEscalation !== null,
            pendingApproval: false,
          })),
          pendingApprovals: approvalQueue.listPending().map((item) => ({
            id: item.id,
            type: item.actionType,
            title: item.title,
            priority: item.priority,
            requestedAt: item.requestedAt,
          })),
          proactiveActions: [],
          a2aActivityCount,
          friendAutopilotPassCount,
        });
      }).then(async (digest) => {
        try {
          const path = await digestGenerator.saveDigest(digest);
          console.log(`[digest] saved to ${path}`);
          wsServerForEvents?.emitEvent("digest:ready", {
            digestId: digest.id,
            period: digest.period,
            startDate: digest.startDate,
            endDate: digest.endDate,
            totalActions: digest.totalActions,
            pendingCount: digest.pendingApprovals.length,
            summaryText: digest.summaryText,
            savedPath: path,
          });
        } catch (err) {
          console.warn(`[digest] save failed:`, err);
        }
      }).catch((err) => console.warn(`[digest] generation failed:`, err));
    }
  }
}, 30000);

// Wire NodeService events to WebSocket server
nodeService.on("hello:request", (data) => wsServer.emitEvent("hello:request", data));
nodeService.on("hello:response", (data) => wsServer.emitEvent("hello:response", data));
nodeService.on("social.intro:propose", (data) => wsServer.emitEvent("social.intro:propose", data));
nodeService.on("share:offered", (data) => wsServer.emitEvent("share:offered", data));
nodeService.on("share:accepted", (data) => wsServer.emitEvent("share:accepted", data));
nodeService.on("share:declined", (data) => wsServer.emitEvent("share:declined", data));
nodeService.on("chat:message", (data) => wsServer.emitEvent("chat:message", data));
nodeService.on("chat:room-updated", (data) => wsServer.emitEvent("chat:room-updated", data));
nodeService.on("chat:room-removed", (data) => wsServer.emitEvent("chat:room-removed", data));
nodeService.on("chat:room-message", (data) => wsServer.emitEvent("chat:room-message", data));
nodeService.on("chat:delivered", (data) => wsServer.emitEvent("chat:delivered", data));
nodeService.on("chat:draft", (data) => wsServer.emitEvent("chat:draft", data));
nodeService.on("agent:activity", (data) => wsServer.emitEvent("agent:activity", data));
nodeService.on("chain:state", (data) => wsServer.emitEvent("chain:state", data));
nodeService.on("chain:report", (data) => wsServer.emitEvent("chain:report", data));
nodeService.on("bond:established", (data) => {
  console.log(`[index.ts] nodeService bond:established event fired, peerOwnerId=${data.peerOwnerId}`);
  wsServer.emitEvent("bond:established", data);
  if (nodeService instanceof NodeServiceImpl) {
    void nodeService.refreshBondPeerProfiles().catch((err) => {
      console.warn("[profile] refreshBondPeerProfiles after bond:established failed:", err);
    });
  }
});
nodeService.on("config:updated", (data) => {
  console.log(`[index.ts] config:updated event fired`);
  currentAutonomousKillSwitch = data.autonomousKillSwitch;
  currentAutonomousPolicies = data.autonomousPolicies;
  currentChatAssistEnabled = data.chatAssistEnabled;
  currentModelProviders = data.modelProviders;
  currentAiSettings = data.aiSettings;
  currentContactAiPrefs = new Map(
    (data.contactAiPreferences ?? []).map((p: ContactAiPreferences) => [
      p.peerOwnerId,
      {
        aiAccessLevel: p.aiAccessLevel,
        knowledgeAccess: p.knowledgeAccess,
        priority: p.priority,
        syndicationMaxSensitivity: p.syndicationMaxSensitivity,
      },
    ]),
  );
  console.log(`[autonomous] killSwitch=${currentAutonomousKillSwitch}, policies=${currentAutonomousPolicies.length}`);
  console.log(`[chat] assist ${currentChatAssistEnabled ? "enabled" : "disabled"}`);
  console.log(`[model] provider mode=${currentModelProviders.mode}`);
  if (currentAiSettings) {
    console.log(`[ai] identity mode=${currentAiSettings.identity.mode}, onlineAssistant=${currentAiSettings.status.onlineAssistantEnabled}, offlineAgent=${currentAiSettings.status.offlineAgentEnabled}`);
  }
  console.log(`[ai] contact prefs: ${currentContactAiPrefs.size} contacts`);
  void refreshRagService();
});

// Bridge: P2P ↔ external agent HTTP pipe
function getRecipientPeerId(ownerOrPeerId: string): Promise<string | null> {
  // If it looks like a peer ID, use it directly
  if (ownerOrPeerId.startsWith("12D3") || ownerOrPeerId.startsWith("envoy_")) {
    console.log(`[bridge] getRecipientPeerId(${ownerOrPeerId.slice(0,12)}…) → peer ID, returning directly`);
    return Promise.resolve(ownerOrPeerId);
  }
  // Self-send: owner's own ID resolves to the mesh peer ID
  if (profile?.owner?.ownerId && ownerOrPeerId === profile.owner.ownerId) {
    console.log(`[bridge] getRecipientPeerId(${ownerOrPeerId}) → self-send (matches home node owner), returning mesh.peerId=${mesh.peerId.slice(0,12)}…`);
    return Promise.resolve(mesh.peerId);
  }
  // Otherwise look up by ownerId in the peer directory
  return peerDirectoryStore.getPeerByOwnerId(ownerOrPeerId).then((record) => {
    if (record) {
      console.log(`[bridge] getRecipientPeerId(${ownerOrPeerId}) → peer record found: peerId=${record.peerId.slice(0,12)}…`);
    } else {
      console.warn(`[bridge] getRecipientPeerId(${ownerOrPeerId}) → NOT FOUND in peer directory, returning null (will self-send)`);
    }
    return record?.peerId ?? null;
  });
}

/**
 * Resolve outbound dial hints for the bridge's chat reply to a recipient.
 *
 * Looks up the peer's recorded listen addrs in the peer directory and merges
 * them with synthetic relay-circuit paths so a NAT-traversed peer (e.g. a
 * paired mobile) can still be reached if the original libp2p connection has
 * dropped while the agent was thinking.
 */
async function getRecipientDialHints(recipientPeerId: string): Promise<string[] | undefined> {
  if (!recipientPeerId?.trim()) return undefined;
  // Look up the peer's recorded listen addrs in the directory (skip self).
  let peerListenAddrs: string[] | undefined;
  if (recipientPeerId !== mesh.peerId) {
    const records = await peerDirectoryStore.listPeerRecords();
    const match = records.find((r) => r.peerId === recipientPeerId);
    peerListenAddrs = match?.listenAddrs;
  }
  try {
    return await buildOutboundDialHints({
      recipientPeerId,
      peerListenAddrs,
      discoverySeedStore,
      config: persistedNodeConfig,
      profileDir: args.profileDir,
      localListenAddrs: mesh.multiaddrs,
    });
  } catch (err) {
    console.warn(
      `[bridge] buildOutboundDialHints failed for ${recipientPeerId.slice(0, 20)}…:`,
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

const bridge = createBridge({
  config: bridgeConfig,
  listenForOpenClaw: bridgeListenForOpenClaw,
  identity: bridgeIdentity,
  mesh,
  getRecipientPeerId,
  getRecipientDialHints,
  gateway,
  submitAgentShareProposal: (params) => nodeService.submitAgentShareProposal(params),
  getAiIdentity: () => currentAiSettings?.identity,
  listTools: () => listAgentTools({ trustModeEnabled: currentTrustModeEnabled }),
  executeTool: async (toolName, params) => {
    if (!(nodeService instanceof NodeServiceImpl)) {
      throw new Error("NodeService not ready");
    }
    nodeService.recordOpenClawToolCall(toolName);
    const ctx = await nodeService.getToolExecutionContext();
    if (!ctx) {
      throw new Error("Tool execution context unavailable");
    }
    return runRegistryTool(toolName, params, ctx);
  },
  resolveOpenClawReply: (correlationId, text) => {
    if (nodeService instanceof NodeServiceImpl) {
      nodeService.resolveOpenClawReply(correlationId, text);
    }
  },
  hasOpenClawPendingReply: (correlationId) => {
    if (nodeService instanceof NodeServiceImpl) {
      return nodeService.hasOpenClawPendingReply(correlationId);
    }
    return false;
  },
  onSelfSendEnvelope: async (envelope, _remotePeerId) => {
    // Deliver bridge agent reply locally — emit chat:message + persist to log
    const payload = parseChatMessagePayload(envelope.payload);
    if (!payload) { console.warn(`[bridge] onSelfSendEnvelope: failed to parse payload`); return; }
    if (!wsServerForEvents) { console.warn(`[bridge] onSelfSendEnvelope: wsServerForEvents not ready`); return; }
    let selfHuman = null;
    try { selfHuman = await humanProfileStore.loadHumanProfile(); } catch { /* ignore */ }
    const chatMsg = {
      messageId: envelope.messageId,
      sender: {
        nodeId: bridgeIdentity.agentPeerId,
        ownerId: bridgeIdentity.agentPeerId,
        displayName: bridgeConfig.agentName ?? "EnvoyAI",
        actorRole: "agent" as const,
        agentId: bridgeIdentity.agentCredential.agentId,
        agentVerified: true,
      },
      recipient: {
        nodeId: mesh.peerId,
        ownerId: profile.owner.ownerId,
        displayName: selfHuman?.displayName ?? profile.owner.ownerId,
      },
      content: { text: stripModelThinking(payload.text) },
      metadata: {
        timestamp: envelope.createdAt,
        deliveryReceipt: "delivered" as const,
        deliveryChannel: "agent" as const,
        deliverySource: "bridge" as const,
      },
      signature: envelope.signature,
    };
    void chatLogStore.append(bridgeIdentity.agentPeerId, chatMsg).catch((err) =>
      console.warn(`[bridge] chat log append failed:`, err),
    );
    if (nodeService instanceof NodeServiceImpl) {
      nodeService.emit("chat:message", chatMsg);
    } else {
      wsServerForEvents.emitEvent("chat:message", chatMsg);
    }
  },
});
bridgeHandleMessage = bridge._handleMessage;

// Wire bridge chat handler into NodeServiceImpl so sendChat can short-circuit self-dial
if (nodeService instanceof NodeServiceImpl) {
  nodeService.setBridgeChatHandler(bridge._handleMessage);
  nodeService.setStyleAdapter(styleAdapter);
  void nodeService.startOpenClaw().then((started) => {
    if (started && nodeService.isOpenClawReady()) {
      console.log("[openclaw] Built-in agent ready (EnvoyAI)");
    } else if (started) {
      console.warn("[openclaw] Gateway spawned but webhook not reachable yet — EnvoyAI will retry on first message");
    } else {
      console.log("[openclaw] Gateway not started — EnvoyAI will use native LLM fallback (or disabled by config)");
    }
  }).catch((err) => {
    console.warn("[openclaw] Init failed:", err instanceof Error ? err.message : String(err));
  });
}

// Register built-in bridge agent for OpenClaw sync replies + optional Ext Agent UI.
// `bridgeAgentLifecycleReady`: gateway auth + agent peer id (Tauri OpenClaw-only OR dev full bridge).
// `bridgeHttpReady`: Ext Agent bridge toggle / Settings UI only.
if (nodeService instanceof NodeServiceImpl && bridgeAgentLifecycleReady) {
  // Determine agent type: built-in EnvoyAI vs external HTTP agent.
  // resolveAssistantAgentUrl uses assistantAgentUrl if set, or agentUrl if it
  // routes to /webhook/envoymesh, else defaults to the built-in webhook.
  const assistantUrl = resolveAssistantAgentUrl(bridgeConfig);
  const agentType: "envoyai" | "external" =
    assistantUrl.includes("/webhook/envoymesh") ? "envoyai" : "external";
  const bridgeFields = bridgeConfigToStatusFields(bridgeConfig);
  nodeService.setBridgeStatus({
    enabled: bridgeHttpReady,
    agentPeerId: bridge.agentPeerId,
    agentUrl: bridgeFields.agentUrl,
    listenPort: bridgeFields.listenPort,
    agentName: bridgeFields.agentName,
    agentPublicKeyPem: bridgeIdentity.agentPublicKeyPem,
    agentType,
    activeExtAgentId: bridgeFields.activeExtAgentId,
    extAgents: bridgeFields.extAgents,
  });
  if (meshStarted) {
  // Register bridge agent as a virtual peer so sendChat can resolve it.
  // ownerId = bridge agent peer ID (lookup key for sendChat)
  // peerId = home node's libp2p ID (transport)
  peerDirectoryStore.ensurePeerFromInboundChat({
    ownerId: bridge.agentPeerId,
    peerId: mesh.peerId,
    listenAddrs: mesh.multiaddrs,
  }).catch((err: Error) => {
    console.warn(`[bridge] failed to register agent in peer directory: ${err.message}`);
  });
  console.log(`[bridge] agent peer ${bridge.agentPeerId} registered`);
  }

  // Register bridge agent in the external agent gateway for session management
  gateway.registerAgent(
    createExternalAgentSession(
      bridgeIdentity.agentCredential.agentId,
      bridgeIdentity.agentPeerId,
      bridgeConfig.agentName ?? "",
      bridgeIdentity.ownerId,
      DEFAULT_AGENT_CAPABILITIES,
    ),
  );
  console.log(`[gateway] registered agent: ${bridgeIdentity.agentCredential.agentId} (${bridgeConfig.agentName || "unnamed"})`);
}

if (args.configPath) {
  console.log(`Config file: ${args.configPath}`);
}
console.log(`Owner ID: ${profile.owner.ownerId}`);
console.log(`Device ID: ${profile.device.deviceId}`);
if (meshStarted) {
console.log(`libp2p Peer ID: ${mesh.peerId}`);
console.log(`libp2p private key loaded (stable Peer ID across restarts)`);
console.log(`Configured --listen: ${args.listen.join(", ")}`);
if (args.listen.some((addr) => addr.includes("/ip4/0.0.0.0/") || addr.includes("/ip6/::/"))) {
  console.log(
    "Note: libp2p reports concrete interface addresses below, not 0.0.0.0. WAN clients still dial your public IP/DNS on the same TCP port (cloud NAT maps it to this host).",
  );
}
console.log("Listening on (libp2p getMultiaddrs):");
for (const addr of mesh.multiaddrs) {
  console.log(`  ${addr}`);
}
if (args.enableRelayServer) {
  const circuitBases = relayDialMultiaddrsForCircuitRelay(mesh, args.advertiseAddrs);
  const advertiseSource =
    args.advertiseAddrs.length > 0
      ? `from ${args.advertiseAddrs.length} advertised base(s) (--advertise-addr, YAML discovery.advertiseAddrs, ENVOYMESH_ADVERTISE_ADDRS)`
      : "fallback: libp2p getMultiaddrs only (non-loopback); no --advertise-addr / advertiseAddrs / env";
  console.log(`Relay circuit bases for relay.lookup / relay.peers (${advertiseSource}):`);
  if (circuitBases.length === 0) {
    console.warn(
      "  (none usable after filtering loopback — set --advertise-addr / discovery.advertiseAddrs / ENVOYMESH_ADVERTISE_ADDRS with a reachable base)",
    );
  } else {
    for (const b of circuitBases) {
      console.log(`  ${b}`);
    }
  }
}
if (args.enableRelayServer && args.discoveryProfile === "wan-default" && args.advertiseAddrs.length === 0) {
  console.warn(
    "[connectivity warning] relay-server on wan-default without advertised bases: relay.lookup /p2p-circuit/ paths use getMultiaddrs only. Clients outside this machine's subnets (e.g. home Windows → cloud VM private 172.x) may not dial those addresses. Set --advertise-addr, YAML discovery.advertiseAddrs, or ENVOYMESH_ADVERTISE_ADDRS (comma-separated). Port must match what clients use; open the security group / firewall.",
  );
}
} else {
  console.log("[node] libp2p mesh offline until first-run setup writes node-config.json");
}

void taskStore.appendAuditEvent(
  createAuditEvent({
    type: "p2p.trace",
    direction: "outbound",
    protocol: "connectivity.profile",
    outcome: "record",
    summary: `connectivity profile=${args.discoveryProfile} mdns=${args.enableMdns} dht=${args.enableDht} relay=${args.enableRelay} autonat=${args.enableAutoNat} dcutr=${args.enableDcutr} bootstrap=${effectiveBootstrapPeers.length} seeds(peer-dir=${peerDirectorySeedAddrs.length}, persisted=${persistedSeedAddrs.length})`,
  }),
);
for (const warning of connectivityWarnings) {
  console.warn(`[connectivity warning] ${warning}`);
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "p2p.trace",
      direction: "outbound",
      protocol: "connectivity.warning",
      outcome: "record",
      summary: warning,
    }),
  );
}
if (meshStarted) {
if (args.discoveryProfile === "wan-default" && effectiveBootstrapPeers.length > 0) {
  console.log(
    `[connectivity] probing ${effectiveBootstrapPeers.length} bootstrap peer(s) for wan-default…`,
  );
  const orderedBootstrapPeers = rotatePeers(effectiveBootstrapPeers);
  // Probe all peers in parallel so one unreachable peer doesn't delay the rest.
  // Each probe has a built-in 15s dialTimeout, so total wait is bounded to ~15s.
  await Promise.allSettled(
    orderedBootstrapPeers.map(async (peer) => {
      try {
        const latencyMs = await mesh.probePeer(peer);
        pushBootstrapProbeResult({ peer, ok: true, latencyMs });
        await discoverySeedStore.upsertSuccess(peer, "bootstrap-probe");
        void taskStore.appendAuditEvent(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "connectivity.bootstrap.ok",
            remotePeerId: peer,
            latencyMs,
            outcome: "record",
            summary: `bootstrap probe ok peer=${peer} latencyMs=${latencyMs}`,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pushBootstrapProbeResult({ peer, ok: false, error: message });
        void taskStore.appendAuditEvent(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "connectivity.bootstrap.fail",
            remotePeerId: peer,
            outcome: "record",
            summary: `bootstrap probe failed peer=${peer} error=${message}`,
          }),
        );
      }
    }),
  );
  const succeeded = bootstrapProbeResults.some((item) => item.ok);
  console.log(`[connectivity] bootstrap probe results: ${bootstrapProbeResults.map((r) => `${r.peer.split("/").pop()?.slice(0, 8)}…(${r.ok ? "ok" : "fail"})`).join(", ")}`);
  if (!succeeded && args.connectivityStrict) {
    throw new Error(
      "connectivity-strict enabled: all bootstrap probes failed in wan-default profile.",
    );
  }
  scheduleBootstrapReprobe(effectiveBootstrapPeers);
}
if (args.enableDht && autoCapabilityTopics.length > 0) {
  // Fire-and-forget: DHT startup cycle can take 30s+ when behind NAT (per-topic
  // provide timeouts). Don't block the relay-checkin / relay-lookup startup
  // sequences — relay-roster advertisements are more important than local DHT
  // provides in WAN/NAT environments.
  void runLocalCapabilityDiscoveryCycle("startup")
    .catch((error) => {
      reportRelayBackgroundError("capability.discovery.startup", error);
    })
    .finally(() => {
      scheduleCapabilityDiscovery();
    });
}
if (args.enableRelay && effectiveBootstrapPeers.length > 0) {
  try {
    await runRelayCheckinCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.checkin.startup", error);
  }
  scheduleRelayCheckin();
  try {
    await runRelayLookupCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.lookup.startup", error);
  }
  scheduleRelayLookup();
}
if (args.enableRelayServer && effectiveBootstrapPeers.length > 0) {
  try {
    await runRelaySummaryCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.summary.startup", error);
  }
  scheduleRelaySummary();
}
if (args.autoRelayPeersQuery && args.enableRelay && effectiveBootstrapPeers.length > 0) {
  try {
    await runRelayPeersQueryCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.peers.query.startup", error);
  }
  scheduleRelayPeersQuery(effectiveBootstrapPeers);
}
if (args.enableRelay || args.enableRelayServer) {
  try {
    await runRelayHealthCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.health.startup", error);
  }
  scheduleRelayHealth();
  try {
    await runRelayManagerSnapshotCycle("startup");
  } catch (error) {
    reportRelayBackgroundError("relay.manager.snapshot.startup", error);
  }
  scheduleRelayManagerSnapshot();
}
}

// ─── Discovery Queue Processor (Phase 8I: low-priority queue for anonymous discovery) ───

const DISCOVERY_QUEUE_INTERVAL_MS = 5_000; // Process queue every 5 seconds

async function runDiscoveryQueueCycle(): Promise<void> {
  const meshInterface = {
    send: async (peerId: string, envelope: ReturnType<typeof createUnsignedEnvelope>) => {
      await deliverOutboundEnvelope(mesh, peerId, envelope as Parameters<typeof mesh.send>[1]);
      return 0;
    },
  };
  const processed = await processDiscoveryQueue(meshInterface);
  if (processed.length > 0) {
    console.log(`[discovery-queue] processed ${processed.length} queued request(s)`);
  }
}

function scheduleDiscoveryQueue(): void {
  discoveryQueueTimer = setTimeout(() => {
    void runDiscoveryQueueCycle()
      .catch((error) => {
        console.error("[discovery-queue] error:", error);
      })
      .finally(() => scheduleDiscoveryQueue());
  }, DISCOVERY_QUEUE_INTERVAL_MS);
}

scheduleDiscoveryQueue();

setTimeout(() => {
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "p2p.trace",
      direction: "outbound",
      protocol: "connectivity.health",
      outcome: "record",
      summary: "connectivity health checkpoint: if no peers discovered yet, verify bootstrap peers/firewall/subnet and retry signal.",
    }),
  );
}, 15_000);

if (resolvedArgs.pingTarget) {
  const unsignedEnvelope = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    senderRole: "system",
    recipientPeerId: resolvedArgs.pingTarget,
    intent: "system.ping",
    payload: createSystemPingPayload(args.pingMessage ?? "hello from EnvoyMesh"),
    correlationId: resolvedArgs.correlationId,
  });
  const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, profile.device.privateKeyPem);

  await deliverOutboundEnvelope(mesh, resolvedArgs.pingTarget, signedEnvelope);
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: signedEnvelope.intent,
      messageId: signedEnvelope.messageId,
      correlationId: signedEnvelope.correlationId,
      remotePeerId: resolvedArgs.pingTarget,
      direction: "outbound",
      protocol: ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: "Sent system.ping.",
      createdAt: signedEnvelope.createdAt,
    }),
  );
  console.log(`[sent ping] target ${resolvedArgs.pingTarget}`);
}

if (resolvedArgs.signalTarget) {
  const nodeConfigForSignal = await nodeConfigStore.load();
  const unsignedEnvelope = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    senderRole: "system",
    recipientPeerId: resolvedArgs.signalTarget,
    intent: "system.signal",
    payload: createSystemSignalPayload({
      deviceCertificate: profile.deviceCertificate,
      ownerPublicKeyPem: profile.owner.publicKeyPem,
      listenAddrs: mesh.multiaddrs,
      supportedCapabilities: resolveEmpSupportedCapabilities({
        socialProxyEnabled: nodeConfigForSignal?.socialProxyEnabled,
        documentAcquisitionEnabled: nodeConfigForSignal?.documentAcquisitionEnabled,
        capabilityProviderEnabled: nodeConfigForSignal?.capabilityProviderEnabled,
      }),
    }),
    correlationId: resolvedArgs.correlationId,
  });
  const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, profile.device.privateKeyPem);

  await deliverOutboundEnvelope(mesh, resolvedArgs.signalTarget, signedEnvelope);
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: signedEnvelope.intent,
      messageId: signedEnvelope.messageId,
      correlationId: signedEnvelope.correlationId,
      remotePeerId: resolvedArgs.signalTarget,
      direction: "outbound",
      protocol: ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: "Sent system.signal.",
      createdAt: signedEnvelope.createdAt,
    }),
  );
  console.log(`[sent signal] target ${resolvedArgs.signalTarget}`);
}

if (resolvedArgs.relayPeersQueryTarget) {
  const unsignedEnvelope = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    senderRole: "system",
    recipientPeerId: resolvedArgs.relayPeersQueryTarget,
    intent: "relay.peers.request",
    payload: {},
    correlationId: resolvedArgs.correlationId,
  });
  const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, profile.device.privateKeyPem);

  await deliverOutboundEnvelope(mesh, resolvedArgs.relayPeersQueryTarget, signedEnvelope);
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: signedEnvelope.intent,
      messageId: signedEnvelope.messageId,
      correlationId: signedEnvelope.correlationId,
      remotePeerId: resolvedArgs.relayPeersQueryTarget,
      direction: "outbound",
      protocol: ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: "Sent relay.peers.request.",
      createdAt: signedEnvelope.createdAt,
    }),
  );
  console.log(`[sent relay.peers.request] target ${resolvedArgs.relayPeersQueryTarget}`);
}

for (const outbound of buildOutboundCliEnvelopes(resolvedArgs, profile)) {
  const isChat = outbound.envelope.intent === "chat.message";
  const latencyMs = isChat
    ? await mesh.sendChat(outbound.target, outbound.envelope)
    : (await deliverOutboundEnvelope(mesh, outbound.target, outbound.envelope), 0);
  if (isChat) {
    void mesh.tagContactForPersistentReachability(outbound.target).catch((err) =>
      console.warn(`[reachability] CLI outbound chat tag failed:`, err),
    );
  }
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: outbound.envelope.intent,
      messageId: outbound.envelope.messageId,
      correlationId: outbound.envelope.correlationId,
      remotePeerId: outbound.target,
      direction: "outbound",
      latencyMs,
      protocol: isChat ? ENVOY_CHAT_PROTOCOL : ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: `Sent ${outbound.label}.`,
      createdAt: outbound.envelope.createdAt,
    }),
  );
  console.log(`[sent ${outbound.label}] target ${outbound.target}`);
}

if (resolvedArgs.dataSendTarget && resolvedArgs.dataRelativePath) {
  const relativePath = resolvedArgs.dataRelativePath.replace(/\\/g, "/");
  const filePath = join(vaultDirForNode, relativePath);
  const content = await readFile(filePath);
  const hash = createHash("sha256").update(content).digest("base64url");
  const unsignedVoucher = createUnsignedDataTransferVoucher({
    issuerPeerId: mesh.peerId,
    issuerOwnerId: profile.owner.ownerId,
    issuerDeviceId: profile.device.deviceId,
    relativePath,
    totalBytes: content.byteLength,
    contentHash: hash,
  });
  const voucher = createSignedDataTransferVoucher({
    unsigned: unsignedVoucher,
    devicePrivateKeyPem: profile.device.privateKeyPem,
  });
  const voucherUtf8 = voucherJsonBytesFromObject(voucher);
  const chunkSize = 64 * 1024;
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < content.length; offset += chunkSize) {
    chunks.push(content.subarray(offset, Math.min(offset + chunkSize, content.length)));
  }
  const latencyMs = await mesh.sendDataTransfer(resolvedArgs.dataSendTarget, voucherUtf8, chunks);
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: "sync.state",
      remotePeerId: resolvedArgs.dataSendTarget,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_DATA_PROTOCOL,
      outcome: "record",
      summary: `Sent data transfer ${relativePath} (${content.byteLength} bytes).`,
      createdAt: new Date().toISOString(),
    }),
  );
  console.log(`[sent data transfer] target ${resolvedArgs.dataSendTarget} path ${relativePath}`);
}

if (resolvedArgs.humanProfileUpdate) {
  const humanProfileStore = createHumanProfileStore(args.profileDir);
  const existingProfile = await humanProfileStore.loadHumanProfile();
  const hasUpdates =
    resolvedArgs.humanProfileDisplayName !== undefined ||
    resolvedArgs.humanProfileBio !== undefined ||
    resolvedArgs.humanProfileGender !== undefined ||
    resolvedArgs.humanProfileHobbies.length > 0 ||
    resolvedArgs.humanProfileKnowledge.length > 0;

  if (!hasUpdates) {
    console.log("[human-profile] --human-profile-update requires at least one --human-profile-* flag");
  } else {
    const displayName = resolvedArgs.humanProfileDisplayName ?? existingProfile?.displayName;
    const username = resolvedArgs.humanProfileUsername ?? existingProfile?.username;
    if (!displayName || !username) {
      console.error("[human-profile] Both displayName and username are required");
      process.exit(1);
    }

    const unsignedPayload = createHumanProfilePayload({
      ownerId: profile.owner.ownerId,
      displayName,
      username,
      bio: resolvedArgs.humanProfileBio ?? existingProfile?.bio,
      gender: resolvedArgs.humanProfileGender ?? existingProfile?.gender,
      hobbies: resolvedArgs.humanProfileHobbies.length > 0 ? resolvedArgs.humanProfileHobbies : existingProfile?.hobbies,
      knowledge: resolvedArgs.humanProfileKnowledge.length > 0 ? resolvedArgs.humanProfileKnowledge : existingProfile?.knowledge,
      ownerPrivateKeyPem: profile.owner.privateKeyPem,
    });

    const signedProfile = signHumanProfile(unsignedPayload, profile.owner.privateKeyPem);

    await humanProfileStore.saveHumanProfile(signedProfile);
    console.log(`[human-profile] updated and saved to ${args.profileDir}/human-profile.json`);
  }
}

console.log("Press Ctrl+C to stop.");

let shutdownInProgress = false;

async function shutdown(): Promise<void> {
  if (shutdownInProgress) {
    return;
  }
  shutdownInProgress = true;
  try {
    await bridge.stop();
    if (nodeService instanceof NodeServiceImpl) {
      try {
        await nodeService.stopOpenClaw?.();
      } catch {
        /* ok */
      }
      nodeService.setBridgeStatus({ enabled: false, agentPeerId: "", agentUrl: "", listenPort: 0, agentName: "" });
    }
    relayTunnelClient?.stop();
    relayTunnelClient = null;
    terminalWsServer.stop();
    await wsServer.stop();
  if (bootstrapReprobeTimer) {
    clearTimeout(bootstrapReprobeTimer);
    bootstrapReprobeTimer = undefined;
  }
  if (capabilityDiscoveryTimer) {
    clearTimeout(capabilityDiscoveryTimer);
    capabilityDiscoveryTimer = undefined;
  }
  if (relayPeersQueryTimer) {
    clearTimeout(relayPeersQueryTimer);
    relayPeersQueryTimer = undefined;
  }
  if (relayCheckinTimer) {
    clearTimeout(relayCheckinTimer);
    relayCheckinTimer = undefined;
  }
  if (relayLookupTimer) {
    clearTimeout(relayLookupTimer);
    relayLookupTimer = undefined;
  }
  if (relaySummaryTimer) {
    clearTimeout(relaySummaryTimer);
    relaySummaryTimer = undefined;
  }
  if (relayManagerSnapshotTimer) {
    clearTimeout(relayManagerSnapshotTimer);
    relayManagerSnapshotTimer = undefined;
  }
  if (relayHealthTimer) {
    clearTimeout(relayHealthTimer);
    relayHealthTimer = undefined;
  }
  if (nodeHealthTimer) {
    clearTimeout(nodeHealthTimer);
    nodeHealthTimer = undefined;
  }
  if (eventLoopLagTimer) {
    clearInterval(eventLoopLagTimer);
    eventLoopLagTimer = undefined;
  }
  stopNodeStatsLogging?.();
  stopNodeStatsLogging = undefined;
  if (rateLimitCleanupInterval) {
    clearInterval(rateLimitCleanupInterval);
    rateLimitCleanupInterval = undefined;
  }
  if (rendezvousSweeper) {
    clearInterval(rendezvousSweeper);
    rendezvousSweeper = undefined;
  }
  if (modeTransitionTimer) {
    clearInterval(modeTransitionTimer);
    modeTransitionTimer = undefined;
  }
  const { shutdownKuboIpfsEngine } = await import("./kubo-ipfs-engine.js");
  await shutdownKuboIpfsEngine();
  if (meshStarted) {
    await mesh.stop();
    meshStarted = false;
  }
  } catch (err) {
    console.error("[node] shutdown error:", err);
  }
}

function requestProcessExit(exitCode: number): void {
  void shutdown().finally(() => {
    process.exit(exitCode);
  });
}

async function runLocalCapabilityDiscoveryCycle(
  source: "startup" | "periodic" | "on-demand",
  opts?: { runFind?: boolean },
): Promise<void> {
  await runCapabilityDiscoveryCycle({
    mesh,
    profile: args.discoveryProfile,
    topics: autoCapabilityTopics,
    taskStore,
    discoverySeedStore,
    enableDht: args.enableDht,
    options: {
      source,
      runFind:
        opts?.runFind ??
        (source === "on-demand"
          ? true
          : source === "startup"
            ? shouldRunPeriodicCapabilityFind(connectivityRuntime)
            : shouldRunPeriodicCapabilityFind(connectivityRuntime)),
    },
  });
}

function scheduleCapabilityDiscovery(): void {
  if (!args.enableDht || autoCapabilityTopics.length === 0) {
    return;
  }
  const jitter = Math.floor(Math.random() * connectivityRuntime.capabilityDiscoveryJitterMs);
  capabilityDiscoveryTimer = setTimeout(() => {
    void runLocalCapabilityDiscoveryCycle("periodic")
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        void taskStore.appendAuditEvent(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "discovery.capability.cycle.fail",
            outcome: "record",
            summary: `capability discovery cycle failed: ${message}`,
          }),
        );
      })
      .finally(() => {
        scheduleCapabilityDiscovery();
      });
  }, connectivityRuntime.capabilityDiscoveryIntervalMsEffective() + jitter);
}

function scheduleRelayPeersQuery(peers: string[]): void {
  if (!args.autoRelayPeersQuery || !args.enableRelay || peers.length === 0) {
    return;
  }
  const jitter = Math.floor(Math.random() * RELAY_PEERS_QUERY_JITTER_MS);
  relayPeersQueryTimer = setTimeout(() => {
    void runRelayPeersQueryCycle("periodic")
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        void taskStore.appendAuditEvent(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "relay.peers.query.fail",
            outcome: "record",
            summary: `relay peers query cycle failed error=${message}`,
          }),
        );
      })
      .finally(() => scheduleRelayPeersQuery(peers));
  }, RELAY_PEERS_QUERY_INTERVAL_MS + jitter);
}

async function runRelayPeersQueryCycle(source: "startup" | "periodic"): Promise<void> {
  const targets = dedupeAddrs(effectiveBootstrapPeers);
  for (const target of targets) {
    const signedEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "system",
        recipientPeerId: target.startsWith("/") ? undefined : target,
        intent: "relay.peers.request",
        payload: {},
      }),
      profile.device.privateKeyPem,
    );

    try {
      await deliverOutboundEnvelope(mesh, target, signedEnvelope);
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "relay.peers.query.ok",
          remotePeerId: target,
          outcome: "record",
          summary: `relay peers query ok source=${source} target=${target}`,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "relay.peers.query.fail",
          remotePeerId: target,
          outcome: "record",
          summary: `relay peers query failed source=${source} target=${target} error=${message}`,
        }),
      );
    }
  }
}

function scheduleRelayCheckin(): void {
  if (!args.enableRelay || effectiveBootstrapPeers.length === 0) {
    return;
  }
  relayCheckinTimer = setTimeout(() => {
    void runRelayCheckinCycle("periodic")
      .catch((error) => {
        reportRelayBackgroundError("relay.checkin.periodic", error);
      })
      .finally(() => scheduleRelayCheckin());
  }, connectivityRuntime.relayCycleIntervalMs());
}

async function runRelayCheckinCycle(source: "startup" | "periodic"): Promise<void> {
  const targets = relayControlTargets();
  const expiresAt = expiresAtFromNow(RELAY_CONTROL_TTL_MS);
  const capabilities = relayCheckinCapabilities(profile.deviceCertificate.capabilities);
  const checkinResults: Array<{ target: string; ok: boolean; error?: string }> = [];
  if (targets.length > 0) {
    logRelayReachableAddrsForCheckin({
      prefix: "[relay-checkin]",
      source,
      peerId: mesh.peerId,
      ownerId: profile.owner.ownerId,
      addrs: mesh.multiaddrs,
    });
  }
  // Compute topicHash advertisements for the topics this node currently
  // publishes via DHT, so the relay server's roster can answer cross-NAT
  // relay.lookup queries by topic (fallback for `searchPeers`).
  const advertisedTopics = getRelayClientAdvertisedTopics();
  const { cidForCapabilityTopic } = await import("@envoymesh/network");
  const topicHashes = await Promise.all(
    advertisedTopics.map((topic) =>
      cidForCapabilityTopic(topic).then((cid) => cid.toString()).catch(() => null),
    ),
  );
  const topicAds = advertisedTopics
    .map((topic, idx) =>
      topicHashes[idx] ? { topicHash: topicHashes[idx]!, visibility: "public" as const, expiresAt } : null,
    )
    .filter((ad): ad is { topicHash: string; visibility: "public"; expiresAt: string } => ad !== null);
  if (topicAds.length > 0) {
    console.log(
      `[relay-checkin] including ${topicAds.length} topicHash advertisement(s) for relay roster (sample: ${topicAds[0].topicHash.slice(0, 12)}…)`,
    );
  }
  for (const target of targets) {
    const payload = createRelayCheckinPayload({
      peerId: mesh.peerId,
      ownerId: profile.owner.ownerId,
      relayReachableAddrs: mesh.multiaddrs,
      capabilities,
      advertisements: [
        ...capabilities.map((capability) => ({
          capability,
          visibility: (capability === "mesh.discovery" ? "public" : "bonded") as
            | "public"
            | "bonded"
            | "private"
            | "capability",
          expiresAt,
        })),
        ...topicAds,
      ],
      relayHints: relayClientState.activeRelays,
      expiresAt,
    });
    const signedEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "system",
        recipientPeerId: target.startsWith("/") ? undefined : target,
        intent: "relay.checkin",
        payload,
      }),
      profile.device.privateKeyPem,
    );
    try {
      await deliverOutboundEnvelope(mesh, target, signedEnvelope);
      noteRelaySuccess(relayClientState, relayHintFromAddr(target));
      await tagRelayOk(mesh, target);
      await appendRelayTrace("relay.checkin.ok", target, `relay checkin ok source=${source} target=${target}`);
      checkinResults.push({ target, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      noteRelayFailure(relayClientState, relayHintFromAddr(target));
      await appendRelayTrace("relay.checkin.fail", target, `relay checkin failed source=${source} target=${target} error=${message}`);
      checkinResults.push({ target, ok: false, error: message });
    }
  }
  if (targets.length > 0) {
    recordRelayCheckinCycle({ source: "cli", targets, results: checkinResults });
  }
}

function relayCheckinCapabilities(capabilities: readonly string[]): string[] {
  return [...new Set(["mesh.discovery", ...capabilities])];
}

async function tagRelayOk(mesh: EnvoyMesh, target: string): Promise<void> {
  if (!target.startsWith("/")) return;
  const m = target.match(/\/p2p\/([^/]+)/);
  const relayId = m?.[1];
  if (!relayId || relayId.startsWith("envoy_")) return;
  try {
    await mesh.tagRelayForPersistentReachability(relayId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[relay-checkin] tagRelayForPersistentReachability failed target=${relayId} error=${msg}`);
  }
}

function scheduleRelayLookup(): void {
  if (!args.enableRelay || effectiveBootstrapPeers.length === 0) {
    return;
  }
  relayLookupTimer = setTimeout(() => {
    void runRelayLookupCycle("periodic")
      .catch((error) => {
        reportRelayBackgroundError("relay.lookup.periodic", error);
      })
      .finally(() => scheduleRelayLookup());
  }, connectivityRuntime.relayCycleIntervalMs());
}

function scheduleRelaySummary(): void {
  if (!args.enableRelayServer || effectiveBootstrapPeers.length === 0) {
    return;
  }
  relaySummaryTimer = setTimeout(() => {
    void runRelaySummaryCycle("periodic")
      .catch((error) => {
        reportRelayBackgroundError("relay.summary.periodic", error);
      })
      .finally(() => scheduleRelaySummary());
  }, RELAY_SUMMARY_INTERVAL_MS);
}

function scheduleRelayManagerSnapshot(): void {
  if (!args.enableRelay && !args.enableRelayServer) {
    return;
  }
  relayManagerSnapshotTimer = setTimeout(() => {
    void runRelayManagerSnapshotCycle("periodic")
      .catch((error) => {
        reportRelayBackgroundError("relay.manager.snapshot.periodic", error);
      })
      .finally(() => scheduleRelayManagerSnapshot());
  }, RELAY_MANAGER_SNAPSHOT_INTERVAL_MS);
}

function scheduleRelayHealth(): void {
  if (!args.enableRelay && !args.enableRelayServer) {
    return;
  }
  relayHealthTimer = setTimeout(() => {
    void runRelayHealthCycle("periodic")
      .catch((error) => {
        reportRelayBackgroundError("relay.health.periodic", error);
      })
      .finally(() => scheduleRelayHealth());
  }, RELAY_HEALTH_INTERVAL_MS);
}

function startEventLoopLagMonitor(): void {
  let expectedAt = Date.now() + EVENT_LOOP_LAG_SAMPLE_MS;
  eventLoopLagTimer = setInterval(() => {
    const now = Date.now();
    lastEventLoopLagMs = Math.max(0, now - expectedAt);
    expectedAt = now + EVENT_LOOP_LAG_SAMPLE_MS;
  }, EVENT_LOOP_LAG_SAMPLE_MS);
}

function scheduleNodeHealth(): void {
  nodeHealthTimer = setTimeout(() => {
    void runNodeHealthCycle("periodic")
      .catch((error) => {
        recordNodeFatalError("node.health.periodic", error);
        console.error("[node-health] periodic check failed:", error);
      })
      .finally(() => scheduleNodeHealth());
  }, NODE_HEALTH_INTERVAL_MS);
}

async function runNodeHealthCycle(source: "startup" | "periodic"): Promise<void> {
  const result = evaluateNodeHealth({
    startedAtMs: processStartedAt,
    meshStarted,
    listenAddrs: meshStarted ? mesh.multiaddrs : [],
    relayPeerCount: meshStarted ? mesh.getConnectedRelayPeerIds().length : 0,
    eventLoopLagMs: lastEventLoopLagMs,
    rssBytes: process.memoryUsage().rss,
    recentFatalErrors,
    previous: nodeHealthState,
    relayClientOnly: isRelayClientNode({ relayServerEnabled: args.enableRelayServer }),
  });
  nodeHealthState = result.state;
  nodeHealthSnapshot = result.snapshot;

  await appendNodeHealthTrace(
    nodeHealthProtocol(result.snapshot.status),
    `node health ${result.snapshot.status} source=${source} actions=${result.snapshot.actions.join(",")} reasons=${result.snapshot.reasons.join(";") || "-"}`,
  );

  if (result.snapshot.actions.includes("exit-for-supervisor")) {
    await exitForNodeSupervisor(result.snapshot.reasons.join(";") || "node health critical");
    return;
  }

  if (result.snapshot.actions.includes("restart-libp2p")) {
    await restartLibp2pForNodeHealth(result.snapshot.reasons.join(";") || "node health requested restart");
  }
}

async function restartLibp2pForNodeHealth(reason: string): Promise<void> {
  if (libp2pRepairInProgress) {
    await appendNodeHealthTrace("node.health.repair", "node health libp2p restart already in progress");
    return;
  }
  const nowMs = Date.now();
  if (!shouldRunThrottledRepair(nowMs, lastLibp2pRestartAtMs, LIBP2P_RESTART_MIN_INTERVAL_MS)) {
    await appendNodeHealthTrace(
      "node.health.repair",
      `node health libp2p restart skipped (cooldown ${LIBP2P_RESTART_MIN_INTERVAL_MS}ms)`,
    );
    return;
  }
  libp2pRepairInProgress = true;
  try {
    console.warn(`[node-health] restarting libp2p: ${reason}`);
    meshStarted = false;
    await mesh.stop();
    await mesh.start();
    meshStarted = true;
    lastKnownLibp2pPeerId = mesh.peerId;
    lastLibp2pRestartAtMs = Date.now();
    await appendNodeHealthTrace("node.health.repair", "node health libp2p restart completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isRelayClientNode({ relayServerEnabled: args.enableRelayServer })) {
      await appendNodeHealthTrace(
        "node.health.fail",
        `node health libp2p restart failed (relay client; staying up) error=${message}`,
      );
      console.error(`[node-health] libp2p restart failed (relay client; staying up): ${message}`);
      return;
    }
    await appendNodeHealthTrace(
      "node.health.critical",
      `node health libp2p restart failed; exiting for supervisor error=${message}`,
    );
    await exitForNodeSupervisor("node health libp2p restart failed");
  } finally {
    libp2pRepairInProgress = false;
  }
}

async function exitForNodeSupervisor(reason: string): Promise<void> {
  console.error(`[node-health] critical; exiting for supervisor restart: ${reason}`);
  await shutdown();
  process.exit(2);
}

async function appendNodeHealthTrace(protocol: string, summary: string): Promise<void> {
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "p2p.trace",
      direction: "outbound",
      protocol,
      remotePeerId: lastKnownLibp2pPeerId || derivePeerId(profile.device.publicKeyPem),
      outcome: "record",
      summary,
    }),
  );
}

function nodeHealthProtocol(status: NodeHealthSnapshot["status"]): string {
  switch (status) {
    case "healthy":
      return "node.health.ok";
    case "degraded":
      return "node.health.warn";
    case "unhealthy":
      return "node.health.fail";
    case "critical":
      return "node.health.critical";
  }
}

async function runRelayHealthCycle(source: "startup" | "periodic"): Promise<void> {
  const result = evaluateRelayHealth({
    relayEnabled: args.enableRelay,
    relayServerEnabled: args.enableRelayServer,
    listenAddrs: mesh.multiaddrs,
    bootstrapProbeResults,
    relayBook: relayRoster.relayBook(),
    rosterEntries: relayRoster.entries(),
    summaries: relayRoster.summaries(),
    routing: relayLookupRouter.metrics(),
    previous: relayHealthState,
    rssBytes: process.memoryUsage().rss,
  });
  relayHealthState = result.state;
  relayHealthSnapshot = result.snapshot;

  const protocol = relayHealthProtocol(result.snapshot.status);
  await appendRelayTrace(
    protocol,
    mesh.peerId,
    `relay health ${result.snapshot.status} source=${source} actions=${result.snapshot.actions.join(",")} reasons=${result.snapshot.reasons.join(";") || "-"}`,
  );

  if (result.snapshot.actions.includes("reprobe-neighbors")) {
    const nowMs = Date.now();
    if (shouldRunThrottledRepair(nowMs, lastRelayHealthReprobeAtMs, RELAY_HEALTH_REPROBE_MIN_INTERVAL_MS)) {
      lastRelayHealthReprobeAtMs = nowMs;
      await runRelayHealthReprobe();
    } else {
      await appendRelayTrace(
        "relay.health.repair",
        mesh.peerId,
        `relay health reprobe skipped (cooldown ${RELAY_HEALTH_REPROBE_MIN_INTERVAL_MS}ms)`,
      );
    }
  }
  if (result.snapshot.actions.includes("refresh-relay-summary")) {
    await runRelaySummaryCycle("periodic");
  }
  if (result.snapshot.actions.includes("exit-for-supervisor")) {
    await appendRelayTrace("relay.health.critical", mesh.peerId, "relay health critical; exiting for external supervisor restart");
    await mesh.stop();
    process.exit(2);
  }
  if (result.snapshot.actions.includes("restart-libp2p")) {
    await appendRelayTrace(
      "relay.health.repair",
      mesh.peerId,
      "relay health requested libp2p restart; attempting bounded local repair",
    );
    await restartLibp2pForRelayHealth(result.snapshot.reasons.join(";") || "relay health requested restart");
  }
}

async function restartLibp2pForRelayHealth(reason: string): Promise<void> {
  const relayPeerId = mesh.peerId;
  if (libp2pRepairInProgress) {
    await appendRelayTrace("relay.health.repair", relayPeerId, "relay health libp2p restart already in progress");
    return;
  }
  const nowMs = Date.now();
  if (!shouldRunThrottledRepair(nowMs, lastLibp2pRestartAtMs, LIBP2P_RESTART_MIN_INTERVAL_MS)) {
    await appendRelayTrace(
      "relay.health.repair",
      relayPeerId,
      `relay health libp2p restart skipped (cooldown ${LIBP2P_RESTART_MIN_INTERVAL_MS}ms)`,
    );
    return;
  }
  libp2pRepairInProgress = true;
  try {
    console.warn(`[relay-health] restarting libp2p: ${reason}`);
    meshStarted = false;
    await mesh.stop();
    await mesh.start();
    meshStarted = true;
    lastKnownLibp2pPeerId = mesh.peerId;
    lastLibp2pRestartAtMs = Date.now();
    await appendRelayTrace("relay.health.repair", relayPeerId, "relay health libp2p restart completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isRelayClientNode({ relayServerEnabled: args.enableRelayServer })) {
      await appendRelayTrace(
        "relay.health.fail",
        relayPeerId,
        `relay health libp2p restart failed (relay client; staying up) error=${message}`,
      );
      console.error(`[relay-health] libp2p restart failed (relay client; staying up): ${message}`);
      return;
    }
    await appendRelayTrace(
      "relay.health.critical",
      relayPeerId,
      `relay health libp2p restart failed; exiting for supervisor error=${message}`,
    );
    try {
      await mesh.stop();
    } catch {
      // Process is about to exit for the external supervisor.
    }
    process.exit(2);
  } finally {
    libp2pRepairInProgress = false;
  }
}

async function runRelayHealthReprobe(): Promise<void> {
  const targets = [...new Set([...effectiveBootstrapPeers, ...relayControlTargets()])].slice(0, 8);
  for (const target of targets) {
    try {
      const latencyMs = await mesh.probePeer(target);
      pushBootstrapProbeResult({ peer: target, ok: true, latencyMs });
      await appendRelayTrace("relay.health.repair", target, `relay health reprobe ok target=${target}`, latencyMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushBootstrapProbeResult({ peer: target, ok: false, error: message });
      await appendRelayTrace("relay.health.repair", target, `relay health reprobe failed target=${target} error=${message}`);
    }
  }
}

function relayHealthProtocol(status: RelayHealthSnapshot["status"]): string {
  switch (status) {
    case "healthy":
      return "relay.health.ok";
    case "degraded":
      return "relay.health.warn";
    case "unhealthy":
      return "relay.health.fail";
    case "critical":
      return "relay.health.critical";
  }
}

async function runRelayManagerSnapshotCycle(source: "startup" | "periodic"): Promise<void> {
  const auditEvents = await taskStore.readAuditEvents();
  const snapshot = buildRelayManagerSnapshot({
    auditEvents,
    runtime: buildRelayManagerRuntimeState(),
  });
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "p2p.trace",
      direction: "outbound",
      protocol: RELAY_MANAGER_SNAPSHOT_PROTOCOL,
      outcome: "record",
      summary: serializeRelayManagerSnapshot(snapshot),
    }),
  );
  // Persist relay book and summaries so they survive restarts
  const currentRelayBook = relayRoster.relayBook();
  const currentSummaries = relayRoster.summaries();
  if (currentRelayBook.length > 0 || currentSummaries.length > 0) {
    await Promise.all([
      relayStateStore.saveRelayBook(currentRelayBook),
      relayStateStore.saveRelaySummaries(currentSummaries.map((e) => ({
        relayId: e.relayId,
        level: e.summary.level,
        region: e.summary.region,
        livePeerCount: e.summary.livePeerCount,
        childRelayCount: e.summary.childRelayCount,
        topicBuckets: e.summary.topicBuckets,
        lastSeenAt: e.lastSeenAt,
        expiresAt: e.expiresAt,
      }))),
    ]);
    await appendRelayTrace(
      "relay.state.persist.ok",
      mesh.peerId,
      `persisted relay_book=${currentRelayBook.length} summaries=${currentSummaries.length}`,
    );
  }
  await appendRelayTrace(
    "relay.manager.snapshot.ok",
    mesh.peerId,
    `relay manager snapshot ok source=${source} roster=${snapshot.roster.total} relays=${snapshot.relayBook.total} summaries=${snapshot.summaries.total}`,
  );
}

async function runRelaySummaryCycle(source: "startup" | "periodic"): Promise<void> {
  const targets = relayControlTargets();
  const payload = createRelaySummaryPayload(
    relayRoster.summary({
      relayId: mesh.peerId,
      level: args.enableRelayServer ? 2 : 3,
      expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
    }),
  );
  for (const target of targets) {
    const signedEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "system",
        recipientPeerId: target.startsWith("/") ? undefined : target,
        intent: "relay.summary",
        payload,
      }),
      profile.device.privateKeyPem,
    );
    try {
      await deliverOutboundEnvelope(mesh, target, signedEnvelope);
      await appendRelayTrace("relay.summary.ok", target, `relay summary ok source=${source} target=${target}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await appendRelayTrace("relay.summary.fail", target, `relay summary failed source=${source} target=${target} error=${message}`);
    }
  }
}

async function runRelayLookupCycle(source: "startup" | "periodic"): Promise<void> {
  const targets = relayControlTargets();
  let bestLookup:
    | { ok: true; peerCount: number; circuitAddrsStored: number }
    | { ok: false; error: string }
    | undefined;

  for (const target of targets) {
    const payload = createRelayLookupPayload({
      queryId: `relay_lookup_${randomUUID()}`,
      capability: "mesh.discovery",
      maxResults: 32,
      maxHops: 0,
      maxFanout: 2,
      visibilityScope: "public",
      expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
    });
    const signedEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "system",
        recipientPeerId: target.startsWith("/") ? undefined : target,
        intent: "relay.lookup",
        payload,
      }),
      profile.device.privateKeyPem,
    );
    try {
      const startedAt = Date.now();
      const reply = await deliverOutboundExpectReply(mesh, target, signedEnvelope, {
        timeoutMs: RELAY_LOOKUP_REPLY_TIMEOUT_MS,
      });
      const latencyMs = Date.now() - startedAt;
      const guardDecision = inboundGuard.inspect(reply);
      if (guardDecision.action === "reject") {
        noteRelayFailure(relayClientState, relayHintFromAddr(target));
        await appendRelayTrace(
          "relay.lookup.fail",
          target,
          `relay lookup reply rejected source=${source} target=${target} reason=${guardDecision.reason}`,
        );
        bestLookup = { ok: false, error: guardDecision.reason ?? "rejected" };
        continue;
      }
      const env = guardDecision.envelope;
      if (env.intent !== "relay.lookup.response") {
        noteRelayFailure(relayClientState, relayHintFromAddr(target));
        await appendRelayTrace(
          "relay.lookup.fail",
          target,
          `relay lookup unexpected intent source=${source} target=${target} intent=${env.intent}`,
        );
        bestLookup = { ok: false, error: `unexpected intent ${env.intent}` };
        continue;
      }
      const responsePayload = parseRelayLookupResponsePayload(env.payload);
      await processRelayLookupResponse(responsePayload);
      noteRelaySuccess(relayClientState, relayHintFromAddr(target));
      await appendRelayTrace("relay.lookup.ok", target, `relay lookup ok source=${source} target=${target}`, latencyMs);
      const flat = dedupeAddrs(responsePayload.peers.flatMap((peer) => peer.multiaddrs));
      bestLookup = {
        ok: true,
        peerCount: responsePayload.peers.length,
        circuitAddrsStored: flat.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await deliverOutboundEnvelope(mesh, target, signedEnvelope);
        noteRelaySuccess(relayClientState, relayHintFromAddr(target));
        await appendRelayTrace(
          "relay.lookup.ok",
          target,
          `relay lookup ok (legacy send after expectReply: ${message}) source=${source} target=${target}`,
        );
        bestLookup = { ok: true, peerCount: 0, circuitAddrsStored: 0 };
      } catch (fallbackError) {
        const fb = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        noteRelayFailure(relayClientState, relayHintFromAddr(target));
        await appendRelayTrace(
          "relay.lookup.fail",
          target,
          `relay lookup failed source=${source} target=${target} expectReply=${message} legacySend=${fb}`,
        );
        bestLookup = { ok: false, error: `${message}; legacySend=${fb}` };
      }
    }
  }

  if (bestLookup) {
    recordRelayLookupResult({
      source: "cli",
      targets,
      ok: bestLookup.ok,
      peerCount: bestLookup.ok ? bestLookup.peerCount : 0,
      circuitAddrsStored: bestLookup.ok ? bestLookup.circuitAddrsStored : 0,
      error: bestLookup.ok ? undefined : bestLookup.error,
    });
  }
}

async function handleRelayControlEnvelope(input: {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
}): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId, replyWithEnvelope } = input;
  try {
    if (envelope.intent === "relay.checkin") {
      const payload = parseRelayCheckinPayload(envelope.payload);
      const { entry, addrChanged, reconnect } = relayRoster.checkin(payload, remotePeerId);
      const checkinNote =
        addrChanged && reconnect
          ? `relay.checkin accepted peer=${payload.peerId} addr_changed reconnect`
          : addrChanged
            ? `relay.checkin accepted peer=${payload.peerId} addr_changed`
            : reconnect
              ? `relay.checkin accepted peer=${payload.peerId} reconnect`
              : `relay.checkin accepted peer=${payload.peerId}`;
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, checkinNote);
      if (addrChanged) {
        await appendRelayTrace(
          "relay.checkin.addr_changed",
          payload.peerId,
          `peer=${payload.peerId} new_addrs=${entry.relayReachableAddrs.length}`,
        );
      }
      if (reconnect) {
        await appendRelayTrace(
          "relay.checkin.reconnect",
          payload.peerId,
          `peer=${payload.peerId} returned_after_offline`,
        );
      }
      if (args.enableRelayServer) {
        logRelayServerCheckinAccepted({
          remoteLibp2pPeerId: remotePeerId,
          payload,
          rosterSize: relayRoster.entries().length,
          addrChanged,
          reconnect,
        });
      }
      return;
    }

    if (envelope.intent === "relay.lookup") {
      const payload = parseRelayLookupPayload(envelope.payload);
      if (!relayLookupRouter.markSeen(payload.queryId)) {
        await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.lookup duplicate dropped query=${payload.queryId}`);
        await sendRelayControlResponse(
          envelope,
          remotePeerId,
          "relay.lookup.response",
          createRelayLookupResponsePayload({
            queryId: payload.queryId,
            peers: [],
            relayHints: [],
            truncated: false,
            expiresAt: payload.expiresAt,
          }),
          correlationId,
          replyWithEnvelope,
        );
        return;
      }
      const circuitBases = relayDialMultiaddrsForCircuitRelay(mesh, args.advertiseAddrs);
      const localResponse = relayRoster.lookup({
        payload,
        requesterPeerId: remotePeerId,
        relayMultiaddrs: circuitBases,
        relayPeerId: mesh.peerId,
      });
      const routeDecision = relayLookupRouter.selectForwardTargets({
        payload,
        relayBook: relayRoster.relayBook(),
        summaries: relayRoster.summaries(),
        selfRelayId: mesh.peerId,
      });
      const forwardedResponses =
        localResponse.peers.length < payload.maxResults
          ? await forwardRelayLookup({
              request: envelope,
              payload,
              targets: routeDecision.forwardTargets,
              correlationId,
            })
          : [];
      const responsePayload = createRelayLookupResponsePayload(
        mergeRelayLookupResponses(payload, [localResponse, ...forwardedResponses.map((item) => item.payload)]),
      );
      await sendRelayControlResponse(
        envelope,
        remotePeerId,
        "relay.lookup.response",
        responsePayload,
        correlationId,
        replyWithEnvelope,
      );
      if (args.enableRelayServer && localResponse.peers.length === 0) {
        const others = relayRoster.entries().filter((e) => e.peerId !== remotePeerId);
        if (others.length > 0) {
          console.warn(
            `[relay-server] relay.lookup query=${payload.queryId} returned 0 local peers but roster has ${others.length} other entr(y/ies); requester=${remotePeerId}. Check lookup visibility, capability filter, or relay.lookup stream errors on clients.`,
          );
        }
      }
      if (args.enableRelayServer) {
        logRelayServerLookupResponse({
          requesterLibp2pPeerId: remotePeerId,
          queryId: responsePayload.queryId,
          peersReturned: responsePayload.peers.length,
          circuitBases,
          peerMultiaddrs: responsePayload.peers.flatMap((p) => p.multiaddrs),
        });
      }
      await appendRelayInboundAudit(
        envelope,
        remotePeerId,
        receivedAt,
        correlationId,
        `relay.lookup returned peers=${responsePayload.peers.length} hints=${responsePayload.relayHints.length} forwards=${routeDecision.forwardTargets.length}`,
      );
      return;
    }

    if (envelope.intent === "relay.lookup.response") {
      const payload = parseRelayLookupResponsePayload(envelope.payload);
      await processRelayLookupResponse(payload);
      await appendRelayInboundAudit(
        envelope,
        remotePeerId,
        receivedAt,
        correlationId,
        `relay.lookup.response peers=${payload.peers.length}`,
      );
      return;
    }

    if (envelope.intent === "relay.hints.request") {
      const payload = parseRelayHintsRequestPayload(envelope.payload);
      const responsePayload = createRelayHintsResponsePayload({
        relayHints: relayRoster.relayHints(payload.maxResults),
        truncated: false,
        expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
      });
      await sendRelayControlResponse(
        envelope,
        remotePeerId,
        "relay.hints.response",
        responsePayload,
        correlationId,
        replyWithEnvelope,
      );
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.hints.request reason=${payload.reason}`);
      return;
    }

    if (envelope.intent === "relay.hints.response") {
      const payload = parseRelayHintsResponsePayload(envelope.payload);
      addRelayCandidates(relayClientState, payload.relayHints);
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.hints.response hints=${payload.relayHints.length}`);
      return;
    }

    if (envelope.intent === "relay.join.request") {
      const payload = parseRelayJoinRequestPayload(envelope.payload);
      relayRoster.registerRelay({
        relayId: payload.relay.relayId,
        addrs: payload.relay.publicAddrs,
        relation: "candidate",
        state: "verified",
        level: payload.relay.level,
        region: payload.relay.region,
        expiresAt: payload.relay.expiresAt,
      });
      const responsePayload = createRelayJoinResponsePayload({
        accepted: true,
        acceptedLevel: payload.desiredLevel ?? payload.relay.level,
        parents: relayRoster.relayHints(2),
        siblings: relayRoster.relayHints(4),
        childLimit: 20,
        expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
      });
      await sendRelayControlResponse(
        envelope,
        remotePeerId,
        "relay.join.response",
        responsePayload,
        correlationId,
        replyWithEnvelope,
      );
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.join.request accepted relay=${payload.relay.relayId}`);
      return;
    }

    if (envelope.intent === "relay.register") {
      const payload = parseRelayRegisterPayload(envelope.payload);
      relayRoster.registerRelay({
        relayId: payload.relay.relayId,
        addrs: payload.relay.publicAddrs,
        relation: payload.requestedRelation,
        state: "verified",
        level: payload.relay.level,
        region: payload.relay.region,
        expiresAt: payload.relay.expiresAt,
      });
      const responsePayload = createRelayRegisterResponsePayload({
        accepted: true,
        relation: payload.requestedRelation,
        state: "verified",
        expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
      });
      await sendRelayControlResponse(
        envelope,
        remotePeerId,
        "relay.register.response",
        responsePayload,
        correlationId,
        replyWithEnvelope,
      );
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.register accepted relay=${payload.relay.relayId}`);
      return;
    }

    if (envelope.intent === "relay.summary") {
      const payload = parseRelaySummaryPayload(envelope.payload);
      relayRoster.registerSummary(payload);
      relayRoster.registerRelay({
        relayId: payload.relayId,
        addrs: [],
        relation: "sibling",
        state: "verified",
        level: payload.level,
        region: payload.region,
        expiresAt: payload.expiresAt,
      });
      await appendRelayInboundAudit(envelope, remotePeerId, receivedAt, correlationId, `relay.summary relay=${payload.relayId} peers=${payload.livePeerCount}`);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.rejected",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "rejected",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `Rejected ${envelope.intent}: ${message}`,
        createdAt: envelope.createdAt,
      }),
    );
  }
}

async function forwardRelayLookup(input: {
  request: EnvoyEnvelope;
  payload: RelayLookupPayload;
  targets: RelayHint[];
  correlationId: string | undefined;
}): Promise<Array<{ payload: RelayLookupResponsePayload; remotePeerId: string }>> {
  const { payload, targets, correlationId } = input;
  if (payload.maxHops <= 0 || targets.length === 0) {
    return [];
  }

  const out: Array<{ payload: RelayLookupResponsePayload; remotePeerId: string }> = [];
  for (const target of targets) {
    const targetAddress = relayTargetAddress(target);
    if (!targetAddress) {
      continue;
    }
    const forwardedPayload = createRelayLookupPayload({
      ...payload,
      maxHops: payload.maxHops - 1,
    });
    const signedEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "system",
        recipientPeerId: targetAddress.startsWith("/") ? undefined : target.relayId,
        intent: "relay.lookup",
        payload: forwardedPayload,
        correlationId,
      }),
      profile.device.privateKeyPem,
    );
    const remote = target.relayId || targetAddress;
    try {
      relayLookupRouter.recordForwardedLookup();
      const startedAt = Date.now();
      const reply = await deliverOutboundExpectReply(mesh, targetAddress, signedEnvelope, {
        timeoutMs: RELAY_FORWARD_LOOKUP_REPLY_MS,
      });
      const latencyMs = Date.now() - startedAt;
      const guardDecision = inboundGuard.inspect(reply);
      if (guardDecision.action === "reject") {
        relayLookupRouter.recordFailedForward();
        if (target.relayId) {
          relayLookupRouter.recordNegative(payload, target.relayId);
        }
        await appendRelayTrace(
          "relay.lookup.forward.fail",
          remote,
          `relay lookup forward rejected reply: ${guardDecision.reason}`,
        );
        continue;
      }
      const env = guardDecision.envelope;
      if (env.intent !== "relay.lookup.response") {
        relayLookupRouter.recordFailedForward();
        await appendRelayTrace(
          "relay.lookup.forward.fail",
          remote,
          `relay lookup forward unexpected intent ${env.intent}`,
        );
        continue;
      }
      const responsePayload = parseRelayLookupResponsePayload(env.payload);
      out.push({ payload: responsePayload, remotePeerId: remote });
      await appendRelayTrace(
        "relay.lookup.forward.ok",
        remote,
        `relay lookup forward ok target=${remote} nextHops=${forwardedPayload.maxHops}`,
        latencyMs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      relayLookupRouter.recordFailedForward();
      if (target.relayId) {
        relayLookupRouter.recordNegative(payload, target.relayId);
      }
      await appendRelayTrace(
        "relay.lookup.forward.fail",
        remote,
        `relay lookup forward failed target=${remote} error=${message}`,
      );
    }
  }
  relayLookupRouter.recordCollectedForwardResponse(out.length);
  for (const response of out) {
    if (response.payload.peers.length === 0) {
      relayLookupRouter.recordNegative(payload, response.remotePeerId);
    }
  }
  return out;
}

function mergeRelayLookupResponses(payload: RelayLookupPayload, responses: RelayLookupResponsePayload[]): RelayLookupResponsePayload {
  const peers = new Map<string, RelayPeerCandidate>();
  const hints = new Map<string, RelayHint>();
  let truncated = false;
  for (const response of responses) {
    truncated = truncated || response.truncated;
    for (const peer of response.peers) {
      const key = peer.peerId || peer.multiaddrs.join(",");
      if (!peers.has(key)) {
        peers.set(key, peer);
      }
    }
    for (const hint of response.relayHints) {
      const key = hint.relayId || hint.multiaddrs.join(",");
      if (key && !hints.has(key)) {
        hints.set(key, {
          ...hint,
          multiaddrs: dedupeAddrs(hint.multiaddrs),
        });
      }
    }
  }
  const cappedPeers = [...peers.values()].slice(0, payload.maxResults);
  return {
    queryId: payload.queryId,
    peers: cappedPeers,
    relayHints: [...hints.values()].slice(0, payload.maxResults),
    truncated: truncated || peers.size > cappedPeers.length,
    expiresAt: payload.expiresAt,
  };
}

async function processRelayLookupResponse(payload: RelayLookupResponsePayload): Promise<void> {
  const flat = dedupeAddrs(payload.peers.flatMap((peer) => peer.multiaddrs));
  logClientRelayLookupResponse({
    queryId: payload.queryId,
    peerCount: payload.peers.length,
    multiaddrs: flat,
  });
  addRelayCandidates(relayClientState, payload.relayHints);
  const relayedAddrs = flat;
  if (relayedAddrs.length > 0) {
    await discoverySeedStore.upsertMany(relayedAddrs, "relay-peers");
  }
  for (const addr of relayedAddrs) {
    const candidates = expandCircuitDialCandidates(addr, effectiveBootstrapPeers);
    let dialOk = false;
    for (const cand of candidates) {
      try {
        console.log(`[relay-discovery] probe [${describeMultiaddrReachability(cand)}] ${cand}`);
        const latencyMs = await mesh.probePeer(cand);
        await appendRelayTrace("relay.lookup.dial.ok", cand, `relay lookup candidate dial ok addr=${cand}`, latencyMs);
        dialOk = true;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await appendRelayTrace(
          "relay.lookup.dial.fail",
          cand,
          `relay lookup candidate dial failed addr=${cand} error=${message}`,
        );
      }
    }
  }
}

async function sendRelayControlResponse(
  request: EnvoyEnvelope,
  libp2pRecipientPeerId: string,
  intent: "relay.lookup.response" | "relay.hints.response" | "relay.join.response" | "relay.register.response",
  payload: unknown,
  correlationId: string | undefined,
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>,
): Promise<void> {
  const signedEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "system",
      recipientPeerId: request.senderPeerId,
      intent,
      payload,
      correlationId,
    }),
    profile.device.privateKeyPem,
  );
  if (replyWithEnvelope) {
    try {
      await replyWithEnvelope(signedEnvelope);
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(
        `[relay-server] same-stream control reply failed (${detail}); falling back to mesh.send to requester`,
      );
    }
  }
  await deliverOutboundEnvelope(mesh, libp2pRecipientPeerId, signedEnvelope);
}

async function appendRelayInboundAudit(
  envelope: EnvoyEnvelope,
  remotePeerId: string,
  receivedAt: number,
  correlationId: string | undefined,
  summary: string,
): Promise<void> {
  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.verified",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "allow",
      summary,
      createdAt: envelope.createdAt,
    }),
  );
}

process.on("SIGINT", () => {
  console.log("[node] SIGINT received — shutting down...");
  requestProcessExit(0);
});

process.on("SIGTERM", () => {
  console.log("[node] SIGTERM received — shutting down...");
  requestProcessExit(0);
});

// ============================================================================
// CRASH PREVENTION: Global error handlers record failures for the health watchdog
// ============================================================================

function recordNodeFatalError(label: string, reason: unknown): void {
  const message = reason instanceof Error ? reason.message : String(reason);
  recentFatalErrors.push({ at: Date.now(), message: `${label}: ${message}` });
  if (recentFatalErrors.length > MAX_RECORDED_FATAL_ERRORS) {
    recentFatalErrors.splice(0, recentFatalErrors.length - MAX_RECORDED_FATAL_ERRORS);
  }
}

process.on("uncaughtException", (error: Error) => {
  recordNodeFatalError("uncaughtException", error);
  console.error("[node] UNCAUGHT EXCEPTION — recorded for health watchdog:", error.message, error.stack);
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  recordNodeFatalError("unhandledRejection", reason);
  console.error("[node] UNHANDLED REJECTION — recorded for health watchdog:", msg);
});

async function relayTaskCancelIfNeeded(input: {
  envelope: EnvoyEnvelope;
  taskDecision: DispatcherDecision;
  mesh: EnvoyMesh;
  profile: Awaited<ReturnType<typeof loadOrCreateNodeProfile>>;
  taskStore: ReturnType<typeof createLocalTaskStore>;
}): Promise<void> {
  const { envelope, taskDecision, mesh, profile, taskStore } = input;
  if (taskDecision.intent !== "task.cancel") {
    return;
  }

  try {
    const cancelPayload = parseTaskCancelPayload(envelope.payload);
    const hops = cancelPayload.relayRemainingHops ?? 0;
    let forwards = cancelPayload.forwardToPeerIds ?? [];

    // Auto-populate forwardToPeerIds from task journal if not already set
    if (forwards.length === 0 && hops > 0) {
      forwards = await getTaskParticipantsForCancel(taskStore, cancelPayload.taskId, profile);
    }

    if (forwards.length === 0 || hops <= 0) {
      return;
    }

    const nextHops = hops - 1;
    const nextPayload = createTaskCancelPayload({
      taskId: cancelPayload.taskId,
      mandateId: cancelPayload.mandateId,
      reason: cancelPayload.reason,
      cancelledBy: cancelPayload.cancelledBy,
      forwardToPeerIds: nextHops > 0 ? forwards : undefined,
      relayRemainingHops: nextHops > 0 ? nextHops : undefined,
    });

    for (const targetPeer of forwards) {
      const signed = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          recipientPeerId: targetPeer,
          intent: "task.cancel",
          payload: nextPayload,
          correlationId: envelope.correlationId,
        }),
        profile.device.privateKeyPem,
      );
      await deliverOutboundEnvelope(mesh, targetPeer, signed);
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: "task.cancel",
          messageId: signed.messageId,
          correlationId: signed.correlationId,
          remotePeerId: targetPeer,
          direction: "outbound",
          protocol: ENVOY_MESSAGE_PROTOCOL,
          outcome: "record",
          summary: `Relayed task.cancel (hops remaining after send: ${nextHops}).`,
          createdAt: signed.createdAt,
        }),
      );
    }
  } catch {
    // ignore malformed cancel relay metadata
  }
}

/**
 * Look up task participants from journal entries to auto-populate forwardToPeerIds
 * for task cancellation relay. Excludes our own peer ID.
 */
async function getTaskParticipantsForCancel(
  taskStore: ReturnType<typeof createLocalTaskStore>,
  taskId: string,
  profile: Awaited<ReturnType<typeof loadOrCreateNodeProfile>>,
): Promise<string[]> {
  const ourPeerId = derivePeerId(profile.device.publicKeyPem);
  const allEntries = await taskStore.readTaskJournalEntries();
  const participantSet = new Set<string>();

  for (const entry of allEntries) {
    if (entry.taskId === taskId && entry.peerOwnerId && entry.peerOwnerId !== ourPeerId) {
      participantSet.add(entry.peerOwnerId);
    }
  }

  return Array.from(participantSet);
}

async function appendP2pTrace(event: P2pDebugEvent): Promise<void> {
  const summaryParts = [`p2p ${event.kind}`];
  if ("protocol" in event && event.protocol) {
    summaryParts.push(`protocol=${event.protocol}`);
  }
  if ("direction" in event && event.direction) {
    summaryParts.push(`direction=${event.direction}`);
  }

  void taskStore.appendAuditEvent(
    createAuditEvent({
      type: "p2p.trace",
      remotePeerId: "remotePeerId" in event ? event.remotePeerId : undefined,
      protocol: "protocol" in event ? event.protocol : undefined,
      direction: "direction" in event ? event.direction : undefined,
      outcome: "record",
      summary: summaryParts.join(" "),
    }),
  );
}

function rotatePeers(peers: string[]): string[] {
  if (peers.length <= 1) {
    return peers;
  }
  const offset = Date.now() % peers.length;
  return peers.slice(offset).concat(peers.slice(0, offset));
}

function dedupeAddrs(addrs: string[]): string[] {
  return [...new Set(addrs.map((addr) => addr.trim()).filter(Boolean))];
}

function appendRelayP2pComponentIfMissing(addr: string, relayPeerId: string): string {
  const a = addr.trim();
  if (!a) return "";
  if (/\/p2p\/[^/]+$/.test(a)) return a;
  const base = a.replace(/\/$/, "");
  return `${base}/p2p/${relayPeerId}`;
}

function isLoopbackListenMultiaddr(addr: string): boolean {
  return (
    addr.includes("/ip4/127.0.0.1/") ||
    addr.includes("/ip6/::1/") ||
    addr.includes("/ip4/0.0.0.0/")
  );
}

/** Base multiaddrs relay clients must dial for /p2p-circuit/... paths in relay.lookup / relay.peers (public or same-LAN). */
function relayDialMultiaddrsForCircuitRelay(mesh: EnvoyMesh, advertiseAddrs: string[]): string[] {
  const relayPeerId = mesh.peerId;
  const rawBases = advertiseAddrs.length > 0 ? advertiseAddrs : mesh.multiaddrs;
  return dedupeAddrs(
    rawBases
      .map((base) => appendRelayP2pComponentIfMissing(base, relayPeerId))
      .filter((addr) => addr.length > 0 && !isLoopbackListenMultiaddr(addr)),
  );
}

function relayControlTargets(): string[] {
  return filterRelayControlTargets(
    dedupeAddrs([
      ...relayClientState.activeRelays.flatMap((relay) => relay.multiaddrs),
      ...effectiveBootstrapPeers,
    ]),
  );
}

function buildRelayManagerRuntimeState(): RelayManagerRuntimeState {
  return {
    enabled: args.enableRelay,
    relayServerEnabled: args.enableRelayServer,
    peerId: mesh.peerId,
    listenAddrs: mesh.multiaddrs,
    uptimeMs: Date.now() - processStartedAt,
    rosterEntries: relayRoster.entries().map((entry) => ({
      peerId: entry.peerId,
      ownerId: entry.ownerId,
      capabilities: entry.capabilities,
      advertisements: entry.advertisements,
      lastSeenAt: entry.lastSeenAt,
      expiresAt: entry.expiresAt,
      reservationFreshUntil: entry.reservationFreshUntil,
    })),
    relayBook: relayRoster.relayBook(),
    summaries: relayRoster.summaries().map((entry) => ({
      relayId: entry.relayId,
      level: entry.summary.level,
      region: entry.summary.region,
      livePeerCount: entry.summary.livePeerCount,
      childRelayCount: entry.summary.childRelayCount,
      topicBuckets: entry.summary.topicBuckets,
      lastSeenAt: entry.lastSeenAt,
      expiresAt: entry.expiresAt,
    })),
    routing: relayLookupRouter.metrics(),
    health: relayHealthSnapshot,
  };
}

function relayHintFromAddr(addr: string): RelayHint {
  return {
    relayId: relayIdFromAddr(addr),
    multiaddrs: [addr],
  };
}

function relayTargetAddress(hint: RelayHint): string | undefined {
  return hint.multiaddrs[0] ?? hint.relayId;
}

function relayIdFromAddr(addr: string): string {
  const match = addr.match(/\/p2p\/([^/]+)$/);
  return match?.[1] ?? addr;
}

function expiresAtFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

/** Log and audit background relay failures without throwing (keeps timers alive; avoids unhandledRejection). */
function reportRelayBackgroundError(cycle: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[relay-cycle] ${cycle} failed: ${message}`);
  void taskStore
    .appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol: "relay.cycle.fail",
        outcome: "record",
        summary: `cycle=${cycle} error=${message}`,
      }),
    )
    .catch((auditError) => {
      console.error(`[relay-cycle] could not append relay.cycle.fail audit: ${auditError}`);
    });
}

async function appendRelayTrace(
  protocol: string,
  remotePeerId: string,
  summary: string,
  latencyMs?: number,
): Promise<void> {
  try {
    void taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol,
        remotePeerId,
        latencyMs,
        outcome: "record",
        summary,
      }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[relay-trace] append failed protocol=${protocol} remotePeerId=${remotePeerId} error=${detail}`);
  }
}

function pushBootstrapProbeResult(entry: {
  peer: string;
  ok: boolean;
  latencyMs?: number;
  error?: string;
}): void {
  bootstrapProbeResults.push(entry);
  if (bootstrapProbeResults.length > MAX_BOOTSTRAP_PROBE_RESULTS) {
    bootstrapProbeResults.splice(0, bootstrapProbeResults.length - MAX_BOOTSTRAP_PROBE_RESULTS);
  }
}

function scheduleBootstrapReprobe(peers: string[]): void {
  if (peers.length === 0) {
    return;
  }
  const jitterMs = Math.floor(Math.random() * BOOTSTRAP_REPROBE_JITTER_MS);
  bootstrapReprobeTimer = setTimeout(() => {
    void runBootstrapReprobe(peers);
  }, connectivityRuntime.bootstrapReprobeIntervalMs() + jitterMs);
}

async function runBootstrapReprobe(peers: string[]): Promise<void> {
  if (peers.length === 0) {
    return;
  }

  const peer = peers[bootstrapReprobeCursor % peers.length];
  bootstrapReprobeCursor = (bootstrapReprobeCursor + 1) % peers.length;

  try {
    const latencyMs = await mesh.probePeer(peer);
    pushBootstrapProbeResult({ peer, ok: true, latencyMs });
    await discoverySeedStore.upsertSuccess(peer, "bootstrap-probe");
    void taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol: "connectivity.reprobe.ok",
        remotePeerId: peer,
        latencyMs,
        outcome: "record",
        summary: `bootstrap reprobe ok peer=${peer} latencyMs=${latencyMs}`,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushBootstrapProbeResult({ peer, ok: false, error: message });
    void taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol: "connectivity.reprobe.fail",
        remotePeerId: peer,
        outcome: "record",
        summary: `bootstrap reprobe failed peer=${peer} error=${message}`,
      }),
    );
  } finally {
    scheduleBootstrapReprobe(peers);
  }
}
