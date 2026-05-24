import type {
  AiSettings,
  BondRecord,
  BridgeStatus,
  PairingPayload,
  ChatMessage,
  ChatDiagnostics,
  ConnectionStatus,
  CreateHumanProfileInput,
  HelloProfile,
  HelloRequest,
  HelloResponse,
  HumanProfile,
  ModelProviderConfig,
  NodeConfig,
  NodeProfile,
  NodeService,
  NodeServiceEvents,
  PeerConnectionInfo,
  PeerSearchResult,
  RelayConfig,
  SearchQuery,
  SendHelloOptions,
  SocialIntroProposal,
  NodeStatus,
  InitNodeOptions,
  NodeInitResult,
  HomeClawCoreProxyParams,
  HomeClawCoreProxyResult,
  LibraryItem,
  ListLibraryItemsParams,
  ShareOffer,
  PairDeviceParams,
  PairDeviceResult,
  PairSharedIdentityParams,
  PairSharedIdentityResult,
  AgentShareProposal,
  SubmitAgentShareProposalParams,
  DiscoverPublishedLibraryParams,
  DiscoverPublishedLibraryPeerResult,
  PublishedLibraryFileHit,
  ExportLibraryItemToIpfsResult,
  IpfsEngineStatus,
  VerifyLibraryItemIpfsGatewayParams,
  VerifyLibraryItemIpfsGatewayResult,
  ImportToLibraryParams,
  ImportToLibraryResult,
  TransferStatus,
} from "@envoymesh/api";
import type { DocumentAgentTurnResult } from "@envoymesh/api";
import { runDocumentAgentTurn as runDocumentAgentTurnLoop, normalizeDocumentAutonomyPolicy } from "@envoymesh/api";

import { randomUUID } from "node:crypto";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT,
  DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
  bondTrustRank,
} from "@envoymesh/api";

import {
  createBondAcceptPayload,
  createBondRequestPayload,
  createChatMessagePayload,
  createHumanProfilePayload,
  createShareAcceptPayload,
  createShareRequestPayload,
  createUnsignedEnvelope,
  parseBondAcceptPayload,
  parseBondRequestPayload,
  parseChatMessagePayload,
  parseEnvelope,
  parseShareAcceptPayload,
  createDiscoveryRequestPayload,
  parseDiscoveryResponsePayload,
  createRendezvousRegisterPayload,
  createRendezvousQueryPayload,
  RendezvousResponsePayloadSchema,
  createKnowledgeQueryPayload,
  parseFriendMatchingPreferencesPayload,
  type HumanProfilePayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import {
  createDeviceCertificate,
  derivePeerId,
  encryptOwnerKeyForDevice,
  signHumanProfile,
  signUnsignedEnvelope,
  verifyFriendMatchingPreferences,
  createAgentCredential,
  generateAgentIdentity,
} from "@envoymesh/identity";
import {
  createAuditEvent,
  deriveCorrelationIdFromEnvelope,
  createLocalTaskStore,
  createLocalTrustStore,
  createLocalPeerDirectoryStore,
  createHumanProfileStore,
  createLocalChatLogStore,
  createChatDraftStore,
  createTaskRuntimeStateStore,
  createRelayStateStore,
  createCapabilityManifestStore,
  createSessionTokenStore,
  loadOrCreateNodeProfile,
  type LocalTaskStore,
  type LocalTrustStore,
  type LocalPeerDirectoryStore,
  type LocalChatLogStore,
  type ChatDraftStore,
  type HumanProfileStore,
  type TaskRuntimeStateStore,
  type RelayStateStore,
  type CapabilityManifestStore,
  type SessionTokenStore,
} from "@envoymesh/local-store";
import { createNodeConfigStore, createStubNodeConfigStore, type PersistedNodeConfig } from "./node-config-store.js";
import { createDiscoverySeedStore, type DiscoverySeedStore } from "./discovery-seed-store.js";
import { resolveBootstrapAddresses, looksLikeDomain } from "./bootstrap-resolver.js";
import { createInboundMessageGuard, type InboundMessageGuard } from "./inbound-guard.js";
import { createTaskDispatcher } from "./task-dispatcher.js";
import { buildVaultIndex, assertPathInsideVault } from "@envoymesh/vault";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ENVOY_MESSAGE_PROTOCOL,
  EnvoyMesh,
  DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME,
  filterBootstrapMultiaddrs,
  filterUsableOutboundPeerDialHints,
  type EnvoyMeshOptions,
} from "@envoymesh/network";
import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { sendVaultFileViaDataTransfer } from "./node-file-share.js";
import { TransferTracker } from "./transfer-tracker.js";
import { isSafeVaultPath } from "./share-inbound.js";
import { createPublishedLibraryStore } from "./published-library-store.js";
import { createPublishedExternalStore } from "./published-external-store.js";
import { exportVaultDocumentToIpfs } from "./vault-ipfs-export-service.js";
import {
  getIpfsEngineStatus,
  normalizeIpfsExportEngineSelection,
  resolveIpfsExportEngineSelection,
} from "./ipfs-export-router.js";
import { verifyVaultDocumentIpfsGateway } from "./vault-ipfs-gateway-verify.js";
import { normalizeGatewayBaseUrl } from "./ipfs-gateway.js";
import { createAgentShareProposalStore } from "./agent-share-proposal-store.js";
import { PUBLISHED_LIB_CAPABILITY } from "./discovery-inbound.js";
import { loadBridgeIdentity, saveBridgeIdentity } from "./bridge/identity-store.js";
import type { BridgeIdentity } from "./bridge/pipe.js";
import type { MeshToolContext } from "./tool-registry.js";
import { executeTool } from "./tool-registry.js";
import { buildOutboundDialHints } from "./outbound-dial-hints.js";
import { buildChatDiagnostics } from "./chat-diagnostics.js";
import { startRelayClientScheduler } from "./relay-client-cycle.js";
import { startNodeStatsInterval } from "./node-stats-log.js";
import { handleInboundBondIntent } from "./bond-inbound.js";
import { handleInboundKnowledgeQuery } from "./knowledge-query-inbound.js";
import { executeHomeClawCoreProxy } from "./homeclaw-core-proxy.js";

const MAX_FRIEND_MATCHING_PREFS_CHARS = 4096;

/** Intents allowed on the native / bridge agent credential for document + mesh tools. */
const NATIVE_AGENT_TOOL_SCOPE = [
  "chat.message",
  "knowledge.query",
  "discovery.request",
  "discovery.response",
  "share.request",
  "share.preview",
  "share.accept",
] as const;

/** Unblocks when an underlying `fs.readFile` or mutex never settles (seen on some Windows setups). */
function raceWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * NodeServiceImpl implements the NodeService interface.
 *
 * Supports two modes:
 * 1. Traditional (mesh pre-created by index.ts): mesh is passed in constructor
 * 2. Envoy-managed: Envoy calls initNode/startNode/stopNode to manage lifecycle
 */
class NodeServiceImpl implements NodeService {
  private _mesh: EnvoyMesh | undefined;
  /** When libp2p is started by `index.ts` (CLI) with `createNodeService(undefined, …)`, this points at that stack for reachability tagging. */
  private _externalMesh?: EnvoyMesh;
  private _profile: NodeProfile | undefined;
  private readonly _trustStore: LocalTrustStore;
  private readonly _peerDirectoryStore: LocalPeerDirectoryStore;
  private readonly _humanProfileStore: HumanProfileStore;
  private readonly _chatLogStore: LocalChatLogStore | null;
  private readonly _chatDraftStore: ChatDraftStore | null;
  private readonly _capabilityManifestStore: CapabilityManifestStore | null;
  private readonly _configStore: ReturnType<typeof createNodeConfigStore>;
  private readonly _profileDir: string;
  /** Root directory for {@link listLibraryItems} (ENVOYMESH_VAULT or shared_vault). */
  private readonly _vaultDir: string;
  private _agentShareProposalStore: ReturnType<typeof createAgentShareProposalStore> | undefined;

  // App-managed mode stores
  private _taskStore: LocalTaskStore | undefined;
  private _relayStateStore: RelayStateStore | undefined;
  private _discoverySeedStore: DiscoverySeedStore | undefined;
  private _taskRuntimeStore: TaskRuntimeStateStore | undefined;
  private _inboundGuard: InboundMessageGuard | undefined;
  private _taskDispatcher: ReturnType<typeof createTaskDispatcher> | undefined;

  private _nodeStatus: NodeStatus = "offline";
  private _bridgeStatus: BridgeStatus | null = null;
  private _bridgeChatHandler: ((envelope: EnvoyEnvelope, remotePeerId: string) => Promise<void>) | null = null;
  private _styleAdapter: import("./style-adapter.js").StyleAdapter | null = null;
  private _wsPort: number = 3030;
  private _wsPath: string = "/ws";
  private _relayPublicWsUrl: string | undefined;

  /** Latest QR / `getPairingPayload` token for optional companion auto-pair (short TTL). */
  private _pairingToken: string | null = null;
  private _pairingTokenIssuedAt = 0;
  private static readonly _pairingTokenTtlMs = 10 * 60 * 1000;

  /** Persistent session token store for long-lived pairings (no QR re-scan). */
  private readonly _sessionTokenStore: SessionTokenStore | null;

  /** Best-effort last failure for {@link getConnectionStatus} (cleared on successful {@link startNode}). */
  private _lastNodeError?: string;
  private _lastNodeErrorAt?: string;

  // Pending hello requests (messageId -> info) awaiting user acceptance
  private readonly _pendingHelloRequests = new Map<string, {
    remotePeerId: string;
    requesterOwnerId: string;
    requesterDisplayName: string;
    message: string;
    requestedLevel: string;
    createdAt: string;
  }>();

  /** Trust-mode intro proposes — memory-only inbox until approve / hello / decline */
  private readonly _pendingSocialIntroProposals = new Map<
    string,
    SocialIntroProposal & { ownerCommitmentRef?: string }
  >();

  /** Outbound push: our `share.request` message id → until we receive `share.preview`. */
  private readonly _pendingPushShareByRequestMsgId = new Map<
    string,
    { relativePath: string; toPeerId: string }
  >();
  /** After inbound `share.preview`: preview message id → send file to peer (we are holder). */
  private readonly _pendingFileSendByPreviewMsgId = new Map<
    string,
    { relativePath: string; toPeerId: string }
  >();
  /** Inbound push offers waiting for accept/decline — keyed by preview message id. */
  private readonly _pendingInboundShareOffers = new Map<string, ShareOffer>();
  /** Pending vault-relative rename on receive: key `senderPeerId + \\n + voucher source path`
   * (matches {@link DataTransferVoucher} `relativePath` from sender).
   */
  private readonly _pendingDataTransferSavePath = new Map<string, string>();
  /** Share / data-transfer correlation ids for progress tracking (ADB-D). */
  private readonly _transferTracker = new TransferTracker();
  private readonly _correlationByRequestMsgId = new Map<string, string>();
  private readonly _correlationByPreviewMsgId = new Map<string, string>();
  /** Inbound accept waiting for bytes — keyed by preview/share id. */
  private readonly _inboundTransferByShareId = new Map<
    string,
    { senderNodeId: string; senderVaultRelativePath: string; savePath: string; senderOwnerId?: string }
  >();

  // Event listeners - stored for later emission
  private readonly listeners = new Map<keyof NodeServiceEvents, Set<(...args: any[]) => void>>();

  /**
   * Called by index.ts when hello:request is received from bond-inbound.ts.
   * This stores the pending request so acceptHello() can find it later.
   */
  storePendingHelloRequest(data: {
    messageId: string;
    sender: { nodeId: string; ownerId: string; displayName: string };
    message: string;
    timestamp: string;
  }): void {
    const existing = this._pendingHelloRequests.get(data.messageId);
    if (!existing) {
      this._pendingHelloRequests.set(data.messageId, {
        remotePeerId: data.sender.nodeId,
        requesterOwnerId: data.sender.ownerId,
        requesterDisplayName: data.sender.displayName ?? data.sender.ownerId,
        message: data.message,
        requestedLevel: "direct",
        createdAt: data.timestamp,
      });
      console.log(`[node-service] stored pending hello request: messageId=${data.messageId}, from=${data.sender.ownerId}`);
    }
  }

  storePendingSocialIntroProposal(proposal: SocialIntroProposal): void {
    const { commitmentApproved: _ca, ...rest } = proposal;
    void _ca;
    if (this._pendingSocialIntroProposals.has(rest.messageId)) {
      return;
    }
    this._pendingSocialIntroProposals.set(rest.messageId, {
      ...rest,
      ownerCommitmentRef: undefined,
    });
    this.emit("social.intro:propose", { ...rest, commitmentApproved: false });
  }

  async listPendingSocialIntroProposals(): Promise<SocialIntroProposal[]> {
    return [...this._pendingSocialIntroProposals.values()].map((row) => {
      const { ownerCommitmentRef, ...pub } = row;
      return {
        ...pub,
        commitmentApproved: Boolean(ownerCommitmentRef),
      };
    });
  }

  async approveSocialIntroCommitment(messageId: string): Promise<{ ownerCommitmentRef: string }> {
    const row = this._pendingSocialIntroProposals.get(messageId);
    if (!row) {
      throw new Error(`No pending intro proposal for messageId=${messageId}`);
    }
    if (!row.ownerCommitmentRef) {
      row.ownerCommitmentRef = randomUUID();
    }
    return { ownerCommitmentRef: row.ownerCommitmentRef };
  }

  async declineSocialIntroProposal(messageId: string): Promise<void> {
    this._pendingSocialIntroProposals.delete(messageId);
  }

  /**
   * CLI (`index.ts`) wires the same on-disk audit store as inbound handlers so
   * share/data-transfer paths can append audits before `startNode()` exists.
   */
  bindCliTaskStore(taskStore: LocalTaskStore): void {
    this._taskStore = taskStore;
  }

  private _upsertTransferStatus(status: TransferStatus): TransferStatus {
    const saved = this._transferTracker.upsert(status);
    this.emit("share:progress", saved);
    return saved;
  }

  async listActiveTransfers(): Promise<TransferStatus[]> {
    return this._transferTracker.listActive();
  }

  async getTransferStatus(correlationId: string): Promise<TransferStatus | undefined> {
    return this._transferTracker.get(correlationId);
  }

  /** Called from data-transfer-inbound after verified inbound write. */
  notifyInboundTransferVerified(input: {
    remotePeerId: string;
    relativePath: string;
    totalBytes: number;
  }): void {
    for (const [shareId, pending] of this._inboundTransferByShareId.entries()) {
      if (pending.senderNodeId !== input.remotePeerId) continue;
      if (pending.savePath !== input.relativePath && pending.senderVaultRelativePath !== input.relativePath) {
        continue;
      }
      const correlationId = this._correlationByPreviewMsgId.get(shareId) ?? shareId;
      this._upsertTransferStatus({
        correlationId,
        phase: "verified",
        bytesTransferred: input.totalBytes,
        totalBytes: input.totalBytes,
        remotePeerId: input.remotePeerId,
        remotePeerOwnerId: pending.senderOwnerId,
        vaultRelativePath: input.relativePath,
        updatedAt: new Date().toISOString(),
      });
      this._inboundTransferByShareId.delete(shareId);
      return;
    }
    this._upsertTransferStatus({
      correlationId: `inbound:${input.remotePeerId}:${input.relativePath}`,
      phase: "verified",
      bytesTransferred: input.totalBytes,
      totalBytes: input.totalBytes,
      remotePeerId: input.remotePeerId,
      vaultRelativePath: input.relativePath,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Inbound `share.preview` on the original requester (push) — links preview id to pending send. */
  linkOutboundSharePreviewFromInbound(previewMessageId: string, inReplyToRequestMsgId: string): void {
    const pending = this._pendingPushShareByRequestMsgId.get(inReplyToRequestMsgId);
    if (!pending) {
      console.warn(
        `[share] preview ${previewMessageId.slice(0, 12)}…: no pending push send for request ${inReplyToRequestMsgId.slice(0, 12)}…`,
      );
      return;
    }
    this._pendingFileSendByPreviewMsgId.set(previewMessageId, pending);
    this._pendingPushShareByRequestMsgId.delete(inReplyToRequestMsgId);
    console.log(
      `[share] linked preview ${previewMessageId.slice(0, 12)}… → file send ${pending.relativePath} to ${pending.toPeerId.slice(0, 12)}…`,
    );
    const correlationId = this._correlationByRequestMsgId.get(inReplyToRequestMsgId);
    if (correlationId) {
      this._correlationByPreviewMsgId.set(previewMessageId, correlationId);
      this._correlationByRequestMsgId.delete(inReplyToRequestMsgId);
    }
  }

  /** We hold the file (responder); after sending preview, wait for requester's `share.accept`. */
  registerResponderFileSendAfterPreview(
    previewMessageId: string,
    relativePath: string | undefined,
    requesterPeerId: string,
  ): void {
    const rel = relativePath?.replace(/^[\\/]+/, "") ?? "";
    if (!rel.trim()) return;
    this._pendingFileSendByPreviewMsgId.set(previewMessageId, {
      relativePath: rel,
      toPeerId: requesterPeerId,
    });
  }

  async recordInboundPushShareOffer(input: {
    shareId: string;
    senderPeerId: string;
    previewText: string;
    sensitivity: "public" | "friends" | "private";
    relativePath: string;
  }): Promise<void> {
    const records = await this._peerDirectoryStore.listPeerRecords();
    const rec = records.find((r) => r.peerId === input.senderPeerId);
    const displayName = rec?.ownerId
      ? rec.ownerId.replace(/^envoy:owner:/, "").slice(0, 10)
      : `${input.senderPeerId.slice(0, 12)}…`;
    const filename = basename(input.relativePath) || "file";
    const offer: ShareOffer = {
      shareId: input.shareId,
      senderNodeId: input.senderPeerId,
      senderDisplayName: displayName,
      filename,
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      sensitivity: input.sensitivity,
      preview: input.previewText,
      timestamp: new Date().toISOString(),
      senderVaultRelativePath: input.relativePath.replace(/^[\\/]+/, "") || undefined,
    };
    this._pendingInboundShareOffers.set(input.shareId, offer);
    this.emit("share:offered", offer);
  }

  clearPendingShareStateForPreview(previewMessageId: string): void {
    this._pendingFileSendByPreviewMsgId.delete(previewMessageId);
    const offer = this._pendingInboundShareOffers.get(previewMessageId);
    if (offer?.senderVaultRelativePath) {
      this._pendingDataTransferSavePath.delete(
        `${offer.senderNodeId}\n${offer.senderVaultRelativePath.replace(/^[\\/]+/, "")}`,
      );
    }
    this._pendingInboundShareOffers.delete(previewMessageId);
  }

  /**
   * Map verified voucher path → local vault-relative path when the owner chose a different name/location.
   */
  resolveInboundDataTransferRelativePath(remotePeerId: string, voucherRelativePath: string): string {
    const norm = voucherRelativePath.replace(/^[\\/]+/, "");
    const o = this._pendingDataTransferSavePath.get(`${remotePeerId}\n${norm}`);
    return o ?? norm;
  }

  consumeInboundDataTransferSaveMapping(remotePeerId: string, voucherSourceRelativePath: string): void {
    const norm = voucherSourceRelativePath.replace(/^[\\/]+/, "");
    this._pendingDataTransferSavePath.delete(`${remotePeerId}\n${norm}`);
  }

  async maybeSendShareFileForInboundAccept(input: {
    envelope: EnvoyEnvelope;
    remotePeerId: string;
    taskStore: LocalTaskStore;
    vaultDir: string;
  }): Promise<void> {
    let payload: ReturnType<typeof parseShareAcceptPayload>;
    try {
      payload = parseShareAcceptPayload(input.envelope.payload);
    } catch {
      return;
    }
    if (!payload.accept) return;
    const previewId = payload.inReplyTo;
    const pending = this._pendingFileSendByPreviewMsgId.get(previewId);
    if (!pending) {
      console.warn(
        `[share] share.accept for preview ${previewId.slice(0, 12)}…: no pending file send (preview not linked?)`,
      );
      return;
    }
    if (pending.toPeerId !== input.remotePeerId) {
      console.warn(
        `[share] file send skipped: peer mismatch for preview=${previewId.slice(0, 12)}…`,
      );
      return;
    }
    const mesh = this._reachableMesh();
    const profile = this._profile;
    if (!mesh || !profile) return;

    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    const rec = peerRecords.find((r) => r.peerId === input.remotePeerId);
    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(input.remotePeerId, rec?.listenAddrs),
        30_000,
        "_dialHintsForChat",
      );
    } catch (err) {
      console.error(
        `[share] dial hints failed for data transfer to ${input.remotePeerId.slice(0, 12)}…:`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }

    const correlationId =
      this._correlationByPreviewMsgId.get(previewId) ?? input.envelope.correlationId ?? previewId;
    this._upsertTransferStatus({
      correlationId,
      phase: "transferring",
      remotePeerId: input.remotePeerId,
      vaultRelativePath: pending.relativePath,
      updatedAt: new Date().toISOString(),
    });

    console.log(
      `[share] data transfer start: ${pending.relativePath} → ${input.remotePeerId.slice(0, 12)}… (${dialHints.length} dial hints)`,
    );
    await sendVaultFileViaDataTransfer({
      mesh,
      profile,
      taskStore: input.taskStore,
      vaultDir: input.vaultDir,
      relativePath: pending.relativePath,
      toPeerId: input.remotePeerId,
      dialHints,
      transferHooks: {
        correlationId,
        remotePeerOwnerId: rec?.ownerId,
        onUpdate: (status) => this._upsertTransferStatus(status as TransferStatus),
      },
    });
    this._pendingFileSendByPreviewMsgId.delete(previewId);
    console.log(
      `[share] data transfer complete: ${pending.relativePath} → ${input.remotePeerId.slice(0, 12)}…`,
    );
  }

  constructor(
    mesh: EnvoyMesh | undefined,
    trustStore: LocalTrustStore,
    peerDirectoryStore: LocalPeerDirectoryStore,
    humanProfileStore: HumanProfileStore,
    profileDir: string | undefined,
    profile?: NodeProfile,
    vaultDir?: string,
  ) {
    this._mesh = mesh;
    this._trustStore = trustStore;
    this._peerDirectoryStore = peerDirectoryStore;
    this._humanProfileStore = humanProfileStore;
    this._profileDir = profileDir ?? "/tmp/unknown";
    this._vaultDir = vaultDir ?? process.env.ENVOYMESH_VAULT ?? join(process.cwd(), "shared_vault");
    this._configStore = profileDir ? createNodeConfigStore(profileDir) : createStubNodeConfigStore();
    this._chatLogStore =
      profileDir && profileDir !== "/tmp/unknown" ? createLocalChatLogStore(profileDir) : null;
    this._chatDraftStore =
      profileDir && profileDir !== "/tmp/unknown" ? createChatDraftStore(profileDir) : null;
    this._capabilityManifestStore =
      profileDir && profileDir !== "/tmp/unknown" ? createCapabilityManifestStore(profileDir) : null;
    this._sessionTokenStore =
      profileDir && profileDir !== "/tmp/unknown" ? createSessionTokenStore(profileDir) : null;
    if (profileDir && profileDir !== "/tmp/unknown") {
      this._discoverySeedStore = createDiscoverySeedStore(profileDir);
    }
    if (profile !== undefined) {
      this._profile = profile;
    }
    if (mesh) {
      this._nodeStatus = "running";
    }
  }

  // ============================================
  // Internal helpers
  // ============================================

  private _requireMesh(): EnvoyMesh {
    // Support both CLI path (_mesh) and Tauri/mobile path (_externalMesh via bindExternalMesh)
    const mesh = this._mesh ?? this._externalMesh;
    if (!mesh) {
      throw new Error("Node is not running. Call startNode() first.");
    }
    return mesh;
  }

  /**
   * CLI path: the running `EnvoyMesh` from `index.ts` so bond/chat/block paths can set libp2p KEEP_ALIVE-style tags
   * (reconnect queue redials automatically after disconnect).
   */
  bindExternalMesh(mesh: EnvoyMesh): void {
    this._externalMesh = mesh;
    this._nodeStatus = "running";
    this.emit("node:status", { status: this._nodeStatus, peerId: mesh.peerId });
  }

  /** Re-apply contact reachability tags from the trust store (after cold start or mesh restart). */
  async resyncBondedContactReachabilityTags(): Promise<void> {
    await this._resyncBondedContactReachabilityTags();
  }

  private _reachableMesh(): EnvoyMesh | undefined {
    return this._mesh ?? this._externalMesh;
  }

  private async _tagBondedContactReachability(libp2pPeerId: string): Promise<void> {
    const mesh = this._reachableMesh();
    if (!mesh) return;
    try {
      await mesh.tagContactForPersistentReachability(libp2pPeerId);
    } catch (e) {
      console.warn(`[reachability] tag failed for ${libp2pPeerId.slice(0, 12)}…:`, e);
    }
  }

  private async _untagReachabilityForOwner(peerOwnerId: string): Promise<void> {
    const mesh = this._reachableMesh();
    if (!mesh) return;
    try {
      const rec = await this._peerDirectoryStore.getPeerByOwnerId(peerOwnerId);
      if (rec?.peerId) {
        await mesh.untagContactForPersistentReachability(rec.peerId);
      }
    } catch (e) {
      console.warn(`[reachability] untag failed for owner ${peerOwnerId}:`, e);
    }
  }

  private async _resyncBondedContactReachabilityTags(): Promise<void> {
    const mesh = this._reachableMesh();
    if (!mesh) return;
    try {
      const trust = await this._trustStore.listTrustRecords();
      for (const r of trust) {
        if (r.level === "blocked") continue;
        const dir = await this._peerDirectoryStore.getPeerByOwnerId(r.peerOwnerId);
        if (dir?.peerId) {
          await mesh.tagContactForPersistentReachability(dir.peerId);
        }
      }
    } catch (e) {
      console.warn(`[reachability] resync tags failed:`, e);
    }
  }

  private _requireProfile(): NodeProfile {
    if (!this._profile) {
      throw new Error("Node is not initialized. Call initNode() first.");
    }
    return this._profile;
  }

  private _assertOnline(): void {
    if (this._nodeStatus !== "running") {
      throw new Error(`Node is ${this._nodeStatus}. Start the node first.`);
    }
  }

  // ============================================
  // Identity
  // ============================================

  getProfile(): NodeProfile {
    return this._requireProfile();
  }

  async getHumanProfile(): Promise<HumanProfile | undefined> {
    const profile = await this._humanProfileStore.loadHumanProfile();
    return profile as HumanProfile | undefined;
  }

  async updateHumanProfile(input: CreateHumanProfileInput): Promise<HumanProfile> {
    this._assertOnline();
    const selfProfile = this._requireProfile();

    // Validate required fields
    if (!input.displayName || !input.displayName.trim()) {
      throw new Error("displayName is required");
    }
    if (!input.username || !/^[a-zA-Z0-9_]{3,30}$/.test(input.username)) {
      throw new Error("username must be 3-30 characters, letters, numbers, underscore only");
    }

    // Load existing profile
    const existing = await this._humanProfileStore.loadHumanProfile();

    // Merge updates
    const updatedPayload: Omit<HumanProfilePayload, "signature"> = {
      version: "0.1",
      ownerId: selfProfile.owner.ownerId,
      displayName: input.displayName.trim(),
      username: input.username.trim(),
      bio: input.bio ?? existing?.bio,
      gender: input.gender ?? existing?.gender,
      hobbies: input.hobbies ?? existing?.hobbies,
      knowledge: input.knowledge ?? existing?.knowledge,
      profileVisibility: input.profileVisibility ?? existing?.profileVisibility ?? "private",
      capabilities: input.capabilities ?? existing?.capabilities,
      updatedAt: new Date().toISOString(),
    };

    // Sign the profile
    const signedProfile = signHumanProfile(updatedPayload, selfProfile.device.privateKeyPem);

    // Save
    await this._humanProfileStore.saveHumanProfile(signedProfile);

    // Handle DHT advertising based on visibility (run in background with timeout)
    const config = await this._configStore.load();
    const isPublicNetwork = config?.bootstrapPresets && config.bootstrapPresets.length > 0;
    const interests = [...(updatedPayload.hobbies ?? []), ...(updatedPayload.knowledge ?? [])];
    const username = updatedPayload.username;

    // If profile is public AND we're on public network, advertise interests as DHT topics
    // Run DHT operations in background to avoid blocking the response
    console.log(`[node-service] Checking DHT advertising: visibility=${updatedPayload.profileVisibility}, isPublicNetwork=${isPublicNetwork}, interests=${JSON.stringify(interests)}`);
    if (updatedPayload.profileVisibility === "public" && isPublicNetwork) {
      void this._advertiseInterests(interests, username);
    }

    return signedProfile as HumanProfile;
  }

  /**
   * Advertise interests and username as DHT topics for peer discovery
   * Runs continuously in background with periodic retries (like system topics)
   */
  private _advertiseInterestsTimer?: ReturnType<typeof setInterval>;
  private _advertiseInterestsStartupTimeout?: ReturnType<typeof setTimeout>;
  private _stopRelayClientScheduler?: () => void;
  private _stopNodeStatsLogging?: () => void;
  private _nodeProcessStartedAtMs = Date.now();
  private _relayBootstrapPeers: string[] = [];

  private async _advertiseInterests(interests: string[], username: string): Promise<void> {
    // Stop any existing advertising timer
    if (this._advertiseInterestsTimer) {
      clearInterval(this._advertiseInterestsTimer);
    }

    const advertisedTopics: string[] = [];
    let allSuccess = true;

    /**
     * Attempt to advertise a single topic (no retry - just one attempt)
     */
    const advertiseOnce = async (topic: string): Promise<boolean> => {
      try {
        await this._mesh!.provideCapabilityTopic(topic);
        console.log(`[node-service] Successfully advertised topic: ${topic}`);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[node-service] Failed to advertise topic "${topic}": ${msg}`);
        return false;
      }
    };

    // Advertise all interests once (initial attempt)
    for (const interest of interests) {
      const topic = interest.toLowerCase();
      const success = await advertiseOnce(topic);
      if (success) {
        advertisedTopics.push(topic);
      } else {
        allSuccess = false;
      }
    }

    // Advertise username as a special DHT topic for username-based discovery
    const usernameTopic = `username:${username.toLowerCase()}`;
    const usernameSuccess = await advertiseOnce(usernameTopic);
    if (usernameSuccess) {
      advertisedTopics.push(usernameTopic);
      console.log(`[node-service] Advertised username: ${usernameTopic}`);
    } else {
      allSuccess = false;
    }

    // Emit initial result
    this.emit("discovery:advertising-complete", { topics: advertisedTopics, success: allSuccess });

    // Set up periodic retry - keep trying every 5 minutes like system topics do
    // This ensures we eventually advertise successfully even with poor DHT connectivity
    this._advertiseInterestsTimer = setInterval(async () => {
      console.log(`[node-service] Periodic re-advertisement for ${interests.length + 1} topics...`);
      let retrySuccess = true;

      for (const interest of interests) {
        const topic = interest.toLowerCase();
        const success = await advertiseOnce(topic);
        if (!success) retrySuccess = false;
      }

      const usernameSuccess = await advertiseOnce(usernameTopic);
      if (!usernameSuccess) retrySuccess = false;

      if (retrySuccess) {
        console.log(`[node-service] All topics successfully advertised on retry`);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Re-advertise interests on DHT and rendezvous servers (called on node start/restart)
   */
  private async _advertiseInterestsIfPublic(): Promise<void> {
    // Defensive: the 15s startup timeout may fire after stopNode() cleared the mesh
    if (!this._mesh) return;
    const config = await this._configStore.load();
    const profile = await this._humanProfileStore.loadHumanProfile();
    if (!config || !profile) return;

    const isPublicNetwork = config.bootstrapPresets && config.bootstrapPresets.length > 0;
    if (profile.profileVisibility === "public" && isPublicNetwork) {
      const interests = [...(profile.hobbies ?? []), ...(profile.knowledge ?? [])];

      // Advertise on DHT (with retry and exponential backoff)
      await this._advertiseInterests(interests, profile.username);

      // Also register with rendezvous servers and relay peers as fallback
      // This runs in parallel with DHT advertising and uses relay-based discovery
      void this._registerWithRendezvousServers(interests, profile.username);
    }
  }

  /**
   * Register our capabilities with configured rendezvous servers and bootstrap relay peers
   * This is a fallback when DHT provide fails, using relay-based discovery instead
   */
  private async _registerWithRendezvousServers(interests: string[], username: string): Promise<void> {
    // Defensive: the 15s startup timeout may fire after stopNode() cleared the mesh
    const mesh = this._mesh;
    if (!mesh) return;
    const profileForRendezvous = this._profile;
    if (!profileForRendezvous) {
      return;
    }

    const config = await this._configStore.load();

    // Build capabilities list from interests (as tags)
    const capabilities = interests.map(interest => ({ tag: interest.toLowerCase() }));
    // Also add username as a special capability
    capabilities.push({ tag: `username:${username.toLowerCase()}` });

    // Collect all relay addresses to register with
    const relayAddrs: string[] = [];

    // Add configured relays (manually added via addRelay)
    if (config?.configuredRelays) {
      for (const relay of config.configuredRelays) {
        if (relay.enabled && relay.addr) {
          relayAddrs.push(relay.addr);
        }
      }
    }

    // Add bootstrap preset relays (like cn-relay) if they look like relay addresses
    if (config?.bootstrapPresets) {
      for (const preset of config.bootstrapPresets) {
        // cn-relay is a known relay preset
        if (preset === "cn-relay") {
          relayAddrs.push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
        }
      }
    }

    // Add manually configured bootstrap peers if they look like relays
    if (config?.bootstrapPeers) {
      for (const peer of config.bootstrapPeers) {
        // If it contains /p2p/ it's a full multiaddr with peer ID - likely a relay
        if (peer.includes("/p2p/") && !relayAddrs.includes(peer)) {
          relayAddrs.push(peer);
        }
      }
    }

    if (relayAddrs.length === 0) {
      console.log("[node-service] No relays configured for rendezvous registration");
      return;
    }

    console.log(`[node-service] Registering capabilities with ${relayAddrs.length} relay(s)`);

    // Retry configuration for relay registration
    const MAX_RETRIES = 3;
    const BASE_TIMEOUT_MS = 15000;

    for (const relayAddr of relayAddrs) {
      let success = false;
      let lastError: Error | undefined;

      for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
        try {
          console.log(`[node-service] Registering with rendezvous server: ${relayAddr} (attempt ${attempt + 1}/${MAX_RETRIES})`);

          const envelope = signUnsignedEnvelope(
            createUnsignedEnvelope({
              senderPeerId: mesh.peerId,
              senderPublicKey: profileForRendezvous.device.publicKeyPem,
              recipientPeerId: relayAddr,
              intent: "rendezvous.register",
              payload: createRendezvousRegisterPayload({
                peerId: mesh.peerId,
                multiaddr: mesh.multiaddrs[0] ?? `/p2p/${mesh.peerId}`,
                capabilities,
                ttlSeconds: 3600,
              }),
            }),
            profileForRendezvous.device.privateKeyPem,
          );

          // Send to relay and wait for response with retry
          const response = await mesh.sendExpectReply(relayAddr, envelope, {
            timeoutMs: BASE_TIMEOUT_MS * Math.pow(2, attempt)
          });
          console.log(`[node-service] Successfully registered with relay ${relayAddr}`);
          success = true;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(`[node-service] Failed to register with relay ${relayAddr} (attempt ${attempt + 1}/${MAX_RETRIES}):`, lastError.message);

          if (!success && attempt < MAX_RETRIES - 1) {
            // Wait before retry
            await new Promise((resolve) => setTimeout(resolve, BASE_TIMEOUT_MS * Math.pow(2, attempt)));
          }
        }
      }

      if (!success) {
        console.warn(`[node-service] All ${MAX_RETRIES} attempts failed for relay ${relayAddr}: ${lastError?.message}`);
      }
    }
  }

  // ============================================
  // Bond Management
  // ============================================

  async sendHello(
    targetOwnerId: string,
    profile: HelloProfile,
    message: string,
    options?: SendHelloOptions,
  ): Promise<HelloResponse> {
    this._assertOnline();
    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    let introCorrelationId: string | undefined;
    let ownerCommitmentRef: string | undefined;
    let pendingIntro: (SocialIntroProposal & { ownerCommitmentRef?: string }) | undefined;

    if (options?.introProposalMessageId) {
      pendingIntro = this._pendingSocialIntroProposals.get(options.introProposalMessageId);
      if (!pendingIntro) {
        throw new Error(`No pending intro proposal for messageId=${options.introProposalMessageId}`);
      }
      if (!pendingIntro.ownerCommitmentRef) {
        throw new Error("Approve the intro commitment before sending hello");
      }
      if (pendingIntro.candidateOwnerId.trim() !== targetOwnerId.trim()) {
        throw new Error("Intro proposal candidate does not match hello target owner id");
      }
      introCorrelationId = pendingIntro.introCorrelationId;
      ownerCommitmentRef = pendingIntro.ownerCommitmentRef;
    }

    // Find the target peer's peerId — Trust-mode intros prefer candidatePeerId from the proposal row
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    let matchedRecord =
      peerRecords.find((r) => r.ownerId === targetOwnerId) ??
      peerRecords.find((r) => r.peerId === targetOwnerId);
    let targetPeerId = matchedRecord?.peerId;

    if (pendingIntro?.candidatePeerId) {
      targetPeerId = pendingIntro.candidatePeerId;
      matchedRecord =
        peerRecords.find((r) => r.ownerId === pendingIntro.candidateOwnerId) ??
        peerRecords.find((r) => r.peerId === pendingIntro.candidatePeerId);
    }

    // If not found in peer directory, maybe targetOwnerId IS a peerId (for DHT discovered peers)
    if (!targetPeerId) {
      // Check if it looks like a valid peerId
      if (targetOwnerId.startsWith("Qm") || targetOwnerId.startsWith("12D3")) {
        targetPeerId = targetOwnerId;
        console.log(`[node-service] Sending hello to DHT-discovered peer: ${targetPeerId}`);
      } else {
        throw new Error(`Peer not found for owner: ${targetOwnerId}`);
      }
    }

    console.log(`[node-service] sendHello to ${targetPeerId} (message: ${message})`);

    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
        senderPublicKey: selfProfile.device.publicKeyPem,
        recipientPeerId: targetPeerId,
        intent: "bond.request",
        payload: createBondRequestPayload({
          requesterOwnerId: selfProfile.owner.ownerId,
          requesterDisplayName: profile.displayName,
          message: `[HELLO] ${message}`,
          proofOfContext: `displayName:${profile.displayName}`,
          requestedLevel: "direct",
          introCorrelationId,
          ownerCommitmentRef,
        }),
      }),
      selfProfile.device.privateKeyPem,
    );

    try {
      const dialHints = await this._dialHintsForChat(targetPeerId, matchedRecord?.listenAddrs);
      console.log(`[node-service] sendHello dialHints count=${dialHints.length}`);
      await mesh.send(targetPeerId, envelope, { dialHints });
      console.log(`[node-service] Hello sent successfully to ${targetPeerId}`);

      if (options?.introProposalMessageId) {
        this._pendingSocialIntroProposals.delete(options.introProposalMessageId);
      }

      // Always record owner ↔ peerId after a successful bond.request (refresh if already present).
      try {
        await this._peerDirectoryStore.ensurePeerFromInboundChat({
          ownerId: targetOwnerId,
          peerId: targetPeerId,
          listenAddrs: matchedRecord?.listenAddrs ?? [],
        });
      } catch (err) {
        console.warn(`[peer-directory] sendHello ensurePeerFromInboundChat:`, err);
      }
      void this._tagBondedContactReachability(targetPeerId);
    } catch (err) {
      console.error(`[node-service] Failed to send hello to ${targetPeerId}:`, err);
      // Provide a more helpful error message
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("getComponents") || errorMsg.includes("connection failed") || errorMsg.includes("timeout")) {
        throw new Error(`Cannot reach peer ${targetPeerId.slice(0, 12)}... - peer may be behind NAT/firewall. Try configuring a relay server.`);
      }
      throw new Error(`Failed to send hello: ${errorMsg}`);
    }

    return {
      messageId: envelope.messageId,
      inReplyTo: "",
      decision: "accept", // Optimistic - actual response comes async via mesh
      timestamp: new Date().toISOString(),
    };
  }

  async acceptHello(messageId: string): Promise<void> {
    // Find the pending hello request
    const pending = this._pendingHelloRequests.get(messageId);
    if (!pending) {
      console.warn(`[node-service] acceptHello: no pending request found for messageId=${messageId}`);
      return;
    }

    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    // Store the bond in trust store (accept the connection)
    await this._trustStore.setTrustRecord({
      peerOwnerId: pending.requesterOwnerId,
      displayName: pending.requesterDisplayName,
      level: pending.requestedLevel as any ?? "direct",
      note: pending.message || undefined,
      now: new Date().toISOString(),
    });

    // Manual-approval hello never ran `emitBondEstablished` from bond-inbound, so index.ts did not
    // upsert peer-directory. Persist requester libp2p id so sendChat can resolve owner → peerId.
    try {
      await this._peerDirectoryStore.ensurePeerFromInboundChat({
        ownerId: pending.requesterOwnerId,
        peerId: pending.remotePeerId,
        listenAddrs: [],
      });
    } catch (err) {
      console.warn(`[peer-directory] acceptHello ensurePeerFromInboundChat:`, err);
    }

    // Send bond.accept back to the requester
    const { createBondAcceptPayload, createUnsignedEnvelope } = await import("@envoymesh/protocol");
    const { signUnsignedEnvelope } = await import("@envoymesh/identity");
    const humanProfile = await this._humanProfileStore.loadHumanProfile();
    console.log(`[node-service] acceptHello: humanProfile loaded:`, humanProfile);
    const displayName = humanProfile?.displayName ?? selfProfile.owner.ownerId;
    console.log(`[node-service] acceptHello: using displayName="${displayName}" (humanProfile.displayName=${humanProfile?.displayName}, fallback=${selfProfile.owner.ownerId})`);

    console.log(`[node-service] Sending bond.accept to ${pending.requesterOwnerId} at peerId ${pending.remotePeerId}`);
    const acceptEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
        senderPublicKey: selfProfile.device.publicKeyPem,
        recipientPeerId: pending.remotePeerId,
        intent: "bond.accept",
        payload: createBondAcceptPayload({
          responderOwnerId: selfProfile.owner.ownerId,
          requesterOwnerId: pending.requesterOwnerId,
          message: `Hello from ${displayName}!`,
        }),
      }),
      selfProfile.device.privateKeyPem,
    );
    console.log(`[node-service] bond.accept envelope created: intent=${acceptEnvelope.intent}, recipientPeerId=${acceptEnvelope.recipientPeerId}, senderPeerId=${acceptEnvelope.senderPeerId}`);
    try {
      console.log(`[node-service] Attempting to send bond.accept to ${pending.remotePeerId} dialHints merged…`);
      const requesterDir = await this._peerDirectoryStore.getPeerByOwnerId(pending.requesterOwnerId);
      const acceptDialHints = await this._dialHintsForChat(pending.remotePeerId, requesterDir?.listenAddrs);
      console.log(`[node-service] bond.accept dialHints count=${acceptDialHints.length}`);
      await mesh.send(pending.remotePeerId, acceptEnvelope, {
        dialHints: acceptDialHints,
      });
      console.log(`[node-service] bond.accept sent successfully to ${pending.remotePeerId}`);
    } catch (sendError) {
      console.error(`[node-service] Failed to send bond.accept to ${pending.remotePeerId}: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
      // Don't throw - still update UI and clean up
    }

    // Emit bond:established event so the UI updates
    this.emit("bond:established", {
      peerOwnerId: pending.requesterOwnerId,
      displayName: pending.requesterDisplayName,
    });

    void this._tagBondedContactReachability(pending.remotePeerId);

    // Remove from pending requests
    this._pendingHelloRequests.delete(messageId);

    console.log(`[node-service] Successfully accepted hello from ${pending.requesterOwnerId}`);
  }

  async declineHello(messageId: string, reason?: string): Promise<void> {
    // Find and remove the pending hello request
    const pending = this._pendingHelloRequests.get(messageId);
    if (pending) {
      console.log(`[node-service] Declining hello from ${pending.requesterOwnerId}: ${reason ?? "no reason"}`);
      this._pendingHelloRequests.delete(messageId);
    } else {
      console.warn(`[node-service] declineHello: no pending request found for messageId=${messageId}`);
    }
  }

  async blockPeer(peerOwnerId: string): Promise<void> {
    await this._trustStore.setTrustRecord({
      peerOwnerId,
      level: "blocked",
      now: new Date().toISOString(),
    });
    await this._untagReachabilityForOwner(peerOwnerId);
  }

  async unblockPeer(peerOwnerId: string): Promise<void> {
    // Unblocking restores the peer to "public" level (no bond) rather than creating a new bond
    // If a bond exists, update it; otherwise do nothing (no automatic bonding)
    const existing = await this._trustStore.getTrustRecord(peerOwnerId);
    if (existing) {
      await this._trustStore.setTrustRecord({
        peerOwnerId,
        level: existing.level === "blocked" ? "public" : existing.level,
        now: new Date().toISOString(),
      });
    }
  }

  async revokeBond(peerOwnerId: string): Promise<void> {
    await this._untagReachabilityForOwner(peerOwnerId);
    await this._trustStore.removeTrustRecord(peerOwnerId);
    if (this._sessionTokenStore) {
      await this._sessionTokenStore.removeTokensForOwner(peerOwnerId);
    }
    this.emit("bond:revoked", { peerOwnerId });
  }

  async getBonds(): Promise<BondRecord[]> {
    const trustRecords = await this._trustStore.listTrustRecords();
    const dirRecords = await this._peerDirectoryStore.listPeerRecords();
    const latestByOwner = new Map<string, { peerId: string; lastSeenAt: string }>();
    for (const r of dirRecords) {
      const cur = latestByOwner.get(r.ownerId);
      if (!cur || r.lastSeenAt > cur.lastSeenAt) {
        latestByOwner.set(r.ownerId, { peerId: r.peerId, lastSeenAt: r.lastSeenAt });
      }
    }
    return trustRecords.map((record) => ({
      peerOwnerId: record.peerOwnerId,
      displayName: record.displayName,
      libp2pPeerId: latestByOwner.get(record.peerOwnerId)?.peerId,
      level: record.level,
      createdAt: record.createdAt,
      note: record.note,
    }));
  }

  // ============================================
  // Messaging
  // ============================================

  /**
   * Merge peer-directory listen addrs with discovery seeds and synthetic relay circuit paths.
   * Contacts from bond/hello often store empty listenAddrs; without `/p2p-circuit/...` hints, outbound
   * chat fails across NAT for one direction.
   */
  private async _dialHintsForChat(recipientPeerId: string, peerListenAddrs: string[] | undefined): Promise<string[]> {
    const config = await this._configStore.load();
    return buildOutboundDialHints({
      recipientPeerId,
      peerListenAddrs,
      discoverySeedStore: this._discoverySeedStore,
      config,
      profileDir: this._profileDir,
    });
  }

  private async _resolvePeerTransportForOwner(targetOwnerId: string): Promise<{
    transportPeerId: string;
    recipientEnvelopePeerId: string | undefined;
    listenAddrs: string[] | undefined;
  }> {
    let targetPeer: Awaited<ReturnType<LocalPeerDirectoryStore["getPeerByOwnerId"]>>;
    try {
      targetPeer = await raceWithTimeout(
        this._peerDirectoryStore.getPeerByOwnerId(targetOwnerId),
        25_000,
        "getPeerByOwnerId",
      );
    } catch (err) {
      throw err;
    }
    if (!targetPeer) {
      const records = await raceWithTimeout(this._peerDirectoryStore.listPeerRecords(), 25_000, "listPeerRecords");
      targetPeer =
        records.find((r) => r.ownerId === targetOwnerId) ??
        records.find((r) => r.peerId === targetOwnerId) ??
        undefined;
    }
    if (!targetPeer?.peerId) {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }
    const transportPeerId = targetPeer.peerId;
    if (transportPeerId.startsWith("envoy_")) {
      throw new Error(`Peer directory has Envoy envelope id for this owner (not libp2p).`);
    }
    const recipientEnvelopePeerId = targetPeer.devicePublicKeyPem
      ? derivePeerId(targetPeer.devicePublicKeyPem)
      : targetOwnerId.startsWith("envoy_")
        ? targetOwnerId
        : undefined;
    return {
      transportPeerId,
      recipientEnvelopePeerId,
      listenAddrs: targetPeer.listenAddrs,
    };
  }

  private _persistChatMessage(threadPeerOwnerId: string, msg: ChatMessage): void {
    if (!this._chatLogStore) return;
    void this._chatLogStore.append(threadPeerOwnerId, msg).catch((err) =>
      console.warn(`[chat-log] append failed for thread=${threadPeerOwnerId}:`, err),
    );
  }

  async sendChat(targetOwnerId: string, text: string): Promise<void> {
    this._assertOnline();
    // Record owner activity when they send a message (keeps them "online" in automatic mode)
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    console.log(`[sendChat] targetOwnerId=${targetOwnerId}, text=${text}`);

    const t0 = Date.now();
    console.log("[sendChat] step=peer-lookup-start");

    let targetPeer: Awaited<ReturnType<LocalPeerDirectoryStore["getPeerByOwnerId"]>>;
    try {
      targetPeer = await raceWithTimeout(
        this._peerDirectoryStore.getPeerByOwnerId(targetOwnerId),
        25_000,
        "getPeerByOwnerId",
      );
    } catch (err) {
      console.log(`[sendChat] peer-lookup-failed after ${Date.now() - t0}ms`, err);
      throw err;
    }
    if (!targetPeer) {
      const records = await raceWithTimeout(
        this._peerDirectoryStore.listPeerRecords(),
        25_000,
        "listPeerRecords",
      );
      targetPeer =
        records.find((r) => r.ownerId === targetOwnerId) ??
        records.find((r) => r.peerId === targetOwnerId);
    }
    console.log(
      `[sendChat] step=peer-lookup-done ms=${Date.now() - t0} found=${targetPeer ? "yes" : "no"}`,
    );

    if (!targetPeer) {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }

    const transportPeerId = targetPeer.peerId;
    if (transportPeerId.startsWith("envoy_")) {
      throw new Error(
        `Peer directory has Envoy envelope id for this owner (not libp2p). Delete peer-directory row or have the contact send again after update.`,
      );
    }
    /** Envelope field: recipient's Envoy device peer id — never the libp2p transport id. */
    const recipientEnvelopePeerId = targetPeer.devicePublicKeyPem
      ? derivePeerId(targetPeer.devicePublicKeyPem)
      : targetOwnerId.startsWith("envoy_")
        ? targetOwnerId
        : undefined;

    const [selfHuman, recipientTrust] = await Promise.all([
      this._humanProfileStore.loadHumanProfile(),
      this._trustStore.getTrustRecord(targetOwnerId),
    ]);

    const t1 = Date.now();
    console.log("[sendChat] step=dial-hints-start");
    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(transportPeerId, targetPeer.listenAddrs),
        30_000,
        "_dialHintsForChat",
      );
    } catch (err) {
      console.log(`[sendChat] dial-hints-failed after ${Date.now() - t1}ms`, err);
      throw err;
    }
    console.log(`[sendChat] step=dial-hints-done ms=${Date.now() - t1} n=${dialHints.length}`);

    console.log(
      `[sendChat] transportPeerId=${transportPeerId} envelopeRecipientPeerId=${recipientEnvelopePeerId ?? "(omitted)"} storedListenAddrs=${(targetPeer.listenAddrs ?? []).length} dialHints=${dialHints.length}`,
    );
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
        senderPublicKey: selfProfile.device.publicKeyPem,
        recipientPeerId: recipientEnvelopePeerId,
        intent: "chat.message",
        payload: createChatMessagePayload({
          senderOwnerId: selfProfile.owner.ownerId,
          text,
        }),
      }),
      selfProfile.device.privateKeyPem,
    );

    if (transportPeerId === mesh.peerId && this._bridgeChatHandler) {
      // Self-send: route through bridge handler directly (no P2P dial)
      console.log(`[sendChat] self-send to ${targetOwnerId}, routing via bridge handler`);
      await this._bridgeChatHandler(envelope, mesh.peerId);
    } else {
      await mesh.sendChat(transportPeerId, envelope, {
        dialHints,
      });
    }
    void this._tagBondedContactReachability(transportPeerId);

    const emittedMsg = {
      messageId: envelope.messageId,
      sender: {
        nodeId: mesh.peerId,
        ownerId: selfProfile.owner.ownerId,
        displayName: selfHuman?.displayName ?? selfProfile.owner.ownerId,
      },
      recipient: {
        nodeId: transportPeerId,
        ownerId: targetOwnerId,
        displayName: recipientTrust?.displayName ?? targetOwnerId,
      },
      content: {
        text,
      },
      metadata: {
        timestamp: envelope.createdAt,
        deliveryReceipt: "sent" as const,
      },
      signature: envelope.signature,
    };
    console.log(`[sendChat] Emitting chat:message locally:`, emittedMsg);
    this._persistChatMessage(targetOwnerId, emittedMsg);
    this.emit("chat:message", emittedMsg);
    // Learn owner writing style from sent messages (Phase 9F)
    this._styleAdapter?.learnFromMessage(true, text);
  }

  async listChatHistory(peerOwnerId: string, limit?: number): Promise<ChatMessage[]> {
    if (!this._chatLogStore) return [];
    const rows = await this._chatLogStore.listThread(peerOwnerId.trim(), limit);
    return rows as ChatMessage[];
  }

  async markRead(_targetOwnerId: string, _upToMessageId?: string): Promise<void> {
    // Future: send read receipts
  }

  // ============================================
  // Search / Discovery
  // ============================================

  async searchPeers(query: SearchQuery): Promise<PeerSearchResult[]> {
    const maxResults = query.maxResults ?? 20;

    // 1. Direct peer ID lookup via DHT (if peerId is specified)
    if (query.peerId) {
      return this.searchByPeerId(query.peerId, maxResults);
    }

    // 2. Determine search mode based on network configuration
    const config = await this._configStore.load();
    const isPublicNetwork = config?.bootstrapPresets && config.bootstrapPresets.length > 0;
    const isPrivateRelay = config?.relayEnabled && config?.configuredRelays && config.configuredRelays.length > 0;

    const results: PeerSearchResult[] = [];

    // 3. Username-based discovery: search DHT for username:xxx topic
    if (isPublicNetwork && query.username) {
      const usernameResults = await this.searchByTopic(`username:${query.username.toLowerCase()}`, maxResults);
      for (const r of usernameResults) {
        if (!results.some((existing) => existing.nodeId === r.nodeId)) {
          results.push({ ...r, username: query.username });
        }
      }
    }

    // 4. Public libp2p network: search by interest as DHT topic
    if (isPublicNetwork && query.interests && query.interests.length > 0) {
      for (const interest of query.interests) {
        const topicResults = await this.searchByTopic(interest.toLowerCase(), maxResults);
        for (const r of topicResults) {
          if (!results.some((existing) => existing.nodeId === r.nodeId)) {
            results.push(r);
          }
        }
      }
    }

    // 5. Hybrid mode by default when public network is enabled: also search locally for better discovery
    // Even without configured relays, local search helps find peers that haven't advertised yet
    if (isPublicNetwork && query.interests && query.interests.length > 0) {
      const localResults = await this.searchLocalPeers(query, maxResults);
      for (const r of localResults) {
        if (!results.some((existing) => existing.nodeId === r.nodeId)) {
          results.push(r);
        }
      }
    }

    // 6. Private relay network: search via rendezvous servers
    if (isPrivateRelay && query.interests && query.interests.length > 0) {
      const rendezvousResults = await this.searchByRendezvous(query.interests);
      for (const r of rendezvousResults) {
        if (!results.some((existing) => existing.nodeId === r.nodeId)) {
          results.push(r);
        }
      }
    }

    // 7. If neither public network nor relays configured, do local search only
    if (!isPublicNetwork && !isPrivateRelay) {
      return this.searchLocalPeers(query, maxResults);
    }

    // Filter out self from results (don't show yourself in search results)
    // Check against both ownerId AND peerId since DHT discovery returns peer IDs
    const selfOwnerId = this._profile?.owner.ownerId;
    const selfPeerId = this._mesh?.peerId;
    const filteredResults = results.filter((r) =>
      r.nodeId !== selfOwnerId && r.nodeId !== selfPeerId
    );

    return filteredResults.slice(0, maxResults);
  }

  private async searchByPeerId(peerId: string, maxResults: number): Promise<PeerSearchResult[]> {
    const mesh = this._mesh;
    if (!mesh) {
      console.warn("[searchPeers] Node not initialized");
      return [];
    }

    try {
      // Try to find the peer via DHT first (if enabled)
      const node = (mesh as any).node;
      if (node?.peerRouting) {
        const peer = await node.peerRouting.findPeer(peerId, { timeout: 10000 });
        return [{
          nodeId: peer.id.toString(),
          ownerId: peer.id.toString(),
          displayName: peer.id.toString().slice(0, 12) + "...",
          interests: [],
          profileVisibility: "public",
        }];
      }
      // Direct dial attempt
      await mesh.dial(`/p2p/${peerId}`);
      return [{
        nodeId: peerId,
        ownerId: peerId,
        displayName: peerId.slice(0, 12) + "...",
        interests: [],
        profileVisibility: "public",
      }];
    } catch (err) {
      console.log(`[searchPeers] Peer ${peerId} not found via DHT or direct dial:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  private async searchByTopic(topic: string, maxResults: number): Promise<PeerSearchResult[]> {
    const mesh = this._mesh;
    if (!mesh) {
      console.warn("[searchPeers] Node not initialized for topic search");
      return [];
    }

    console.log(`[searchPeers] Searching DHT for topic: "${topic}" (limit: ${maxResults})`);
    try {
      const providers = await mesh.findCapabilityTopicProviders(topic, { limit: maxResults });
      console.log(`[searchPeers] Found ${providers.length} providers for topic "${topic}"`);
      return providers.map((provider: { peerId: string }) => ({
        nodeId: provider.peerId,
        ownerId: provider.peerId,
        displayName: provider.peerId.slice(0, 12) + "...",
        interests: [],
        profileVisibility: "public" as const,
      }));
    } catch (err) {
      console.log(`[searchPeers] Topic "${topic}" query failed:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  private async searchLocalPeers(query: SearchQuery, maxResults: number): Promise<PeerSearchResult[]> {
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    const trustRecords = await this._trustStore.listTrustRecords();

    // Build a map of ownerId -> displayName from trust records
    const displayNameByOwner = new Map<string, string>();
    for (const record of trustRecords) {
      if (record.displayName) {
        displayNameByOwner.set(record.peerOwnerId, record.displayName);
      }
    }

    // Get bonded peers (trust level exists and is not "blocked")
    const bondedOwnerIds = new Set<string>();
    for (const record of trustRecords) {
      if (record.level !== "blocked") {
        bondedOwnerIds.add(record.peerOwnerId);
      }
    }

    let results: PeerSearchResult[] = [];

    // Build results from peer records
    for (const record of peerRecords) {
      // Skip if not bonded (unless text search covers it)
      // Include all records if they match query text
      const displayName = displayNameByOwner.get(record.ownerId) ?? record.ownerId;
      const isBonded = bondedOwnerIds.has(record.ownerId);

      const result: PeerSearchResult = {
        nodeId: record.peerId,
        ownerId: record.ownerId,
        displayName,
        interests: [],
        profileVisibility: "public",
      };

      // Filter: if query text is provided, match against ownerId or displayName
      if (query.queryText) {
        const lowerQuery = query.queryText.toLowerCase();
        const matches = result.ownerId.toLowerCase().includes(lowerQuery) ||
          result.displayName.toLowerCase().includes(lowerQuery);
        if (!matches) continue;
        results.push(result);
      } else if (isBonded) {
        // No query text - show only bonded peers
        results.push(result);
      }
    }

    // Also search by interests (text match on any interest)
    if (query.interests && query.interests.length > 0) {
      const interestMatches = peerRecords.filter((record) => {
        const displayName = displayNameByOwner.get(record.ownerId) ?? "";
        // Note: peerRecords don't have interests field, so we just match by ownerId/displayName
        const lowerInterests = query.interests!.map((i) => i.toLowerCase());
        return lowerInterests.some((interest) =>
          record.ownerId.toLowerCase().includes(interest) ||
          displayName.toLowerCase().includes(interest),
        );
      });
      for (const record of interestMatches) {
        const displayName = displayNameByOwner.get(record.ownerId) ?? record.ownerId;
        if (!results.some((r) => r.nodeId === record.peerId)) {
          results.push({
            nodeId: record.peerId,
            ownerId: record.ownerId,
            displayName,
            interests: [],
            profileVisibility: "public",
          });
        }
      }
    }

    return results.slice(0, maxResults);
  }

  /**
   * Search for peers via rendezvous servers (relay-based discovery)
   */
  private async searchByRendezvous(interests: string[]): Promise<PeerSearchResult[]> {
    const config = await this._configStore.load();
    if (!config?.configuredRelays || config.configuredRelays.length === 0) {
      return [];
    }

    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();
    const results: PeerSearchResult[] = [];

    for (const relay of config.configuredRelays) {
      if (!relay.enabled) continue;

      try {
        console.log(`[node-service] Searching rendezvous server ${relay.addr} for interests: ${interests.join(", ")}`);

        // Build query for each interest (as tag matches)
        const queryPayload = {
          match: interests.map(interest => ({ tag: interest.toLowerCase() })) as any,
        };

        const envelope = signUnsignedEnvelope(
          createUnsignedEnvelope({
            senderPeerId: mesh.peerId,
            senderPublicKey: selfProfile.device.publicKeyPem,
            recipientPeerId: relay.addr,
            intent: "rendezvous.query",
            payload: queryPayload,
          }),
          selfProfile.device.privateKeyPem,
        );

        const response = await mesh.sendExpectReply(relay.addr, envelope, { timeoutMs: 15000 });
        const responsePayload = RendezvousResponsePayloadSchema.parse(response.payload);

        console.log(`[node-service] Rendezvous query returned ${responsePayload.matches.length} matches from ${relay.addr}`);

        for (const match of responsePayload.matches) {
          results.push({
            nodeId: match.peerId,
            ownerId: match.peerId,
            displayName: match.peerId.slice(0, 12) + "...",
            interests: match.capabilities?.map((c: any) => "tag" in c ? c.tag : "") .filter(Boolean) ?? [],
            profileVisibility: "public",
          });
        }
      } catch (err) {
        console.warn(`[node-service] Rendezvous query failed for ${relay.addr}:`, err);
      }
    }

    return results;
  }

  async advertiseTopic(topic: string): Promise<void> {
    const mesh = this._mesh;
    if (!mesh) {
      throw new Error("Node not initialized");
    }
    try {
      console.log(`[node-service] Advertising topic: "${topic}" on DHT`);
      await mesh.provideCapabilityTopic(topic);
      console.log(`[node-service] Successfully advertised topic: ${topic}`);
    } catch (err) {
      console.error(`[node-service] Failed to advertise topic ${topic}:`, err);
      throw err;
    }
  }

  async stopAdvertiseTopic(topic: string): Promise<void> {
    const mesh = this._mesh;
    if (!mesh) {
      throw new Error("Node not initialized");
    }
    try {
      await mesh.cancelCapabilityTopicReprovide(topic);
      console.log(`[node-service] Stopped advertising topic: ${topic}`);
    } catch (err) {
      console.error(`[node-service] Failed to stop advertising topic ${topic}:`, err);
      throw err;
    }
  }

  // ============================================
  // File Sharing
  // ============================================

  async listLibraryItems(params?: ListLibraryItemsParams): Promise<LibraryItem[]> {
    const index = await buildVaultIndex({ rootDir: this._vaultDir });
    const publishedIds = await createPublishedLibraryStore(this._profileDir).loadDocumentIds();
    const externalExports = await createPublishedExternalStore(this._profileDir).loadAll();
    const q = params?.query?.trim().toLowerCase();
    let docs = index.documents;
    if (q) {
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.relativePath.toLowerCase().includes(q),
      );
    }
    return docs.map((d) => ({
      documentId: d.documentId,
      relativePath: d.relativePath,
      title: d.title,
      extension: d.extension,
      byteLength: d.byteLength,
      contentHash: d.contentHash,
      updatedAt: d.updatedAt,
      published: publishedIds.has(d.documentId),
      publishedExternal: externalExports.get(d.documentId),
    }));
  }

  async setLibraryItemPublished(documentId: string, published: boolean): Promise<void> {
    await createPublishedLibraryStore(this._profileDir).setPublished(documentId, published);
  }

  async exportLibraryItemToIpfs(documentId: string): Promise<ExportLibraryItemToIpfsResult> {
    this.recordOwnerActivity();
    if (!this._taskStore) {
      throw new Error("Task store not initialized — node is not fully wired");
    }
    const config = await this.getNodeConfig();
    const allowIpfs = config.externalPublish?.allowIpfs ?? false;
    const taskStore = this._taskStore;
    return exportVaultDocumentToIpfs({
      vaultDir: this._vaultDir,
      profileDir: this._profileDir,
      documentId,
      allowIpfs,
      externalPublish: config.externalPublish,
      appendAudit: (event) => taskStore.appendAuditEvent(event),
    });
  }

  async getIpfsEngineStatus(): Promise<IpfsEngineStatus> {
    const config = await this.getNodeConfig();
    return getIpfsEngineStatus({
      profileDir: this._profileDir,
      selection: resolveIpfsExportEngineSelection({ externalPublish: config.externalPublish }),
    });
  }

  async verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult> {
    this.recordOwnerActivity();
    if (!this._taskStore) {
      throw new Error("Task store not initialized — node is not fully wired");
    }
    const config = await this.getNodeConfig();
    const taskStore = this._taskStore;
    return verifyVaultDocumentIpfsGateway({
      vaultDir: this._vaultDir,
      profileDir: this._profileDir,
      documentId: params.documentId,
      allowIpfs: config.externalPublish?.allowIpfs ?? false,
      gatewayAllowlist: config.externalPublish?.gatewayAllowlist,
      gatewayUrl: params.gatewayUrl,
      appendAudit: (event) => taskStore.appendAuditEvent(event),
    });
  }

  async importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult> {
    this.recordOwnerActivity();
    const norm = params.relativePath.trim().replace(/^[\\/]+/, "");
    if (!norm || norm.includes("..") || norm.includes("~")) {
      throw new Error("Invalid vault path");
    }
    const abs = resolve(this._vaultDir, norm);
    assertPathInsideVault(this._vaultDir, abs);
    const bytes = Buffer.from(params.contentBase64, "base64");
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, bytes, { mode: 0o600 });
    const index = await buildVaultIndex({ rootDir: this._vaultDir });
    const doc = index.documents.find((d) => d.relativePath === norm);
    if (!doc) {
      throw new Error(`Imported file not indexed: ${norm}`);
    }
    return {
      documentId: doc.documentId,
      relativePath: doc.relativePath,
      sizeBytes: doc.byteLength,
    };
  }

  async discoverPublishedLibrary(params?: DiscoverPublishedLibraryParams): Promise<DiscoverPublishedLibraryPeerResult[]> {
    this._assertOnline();
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();

    const bonds = (await this.getBonds()).filter((b) => b.level !== "blocked");
    let targets = bonds;
    if (params?.targetOwnerIds && params.targetOwnerIds.length > 0) {
      const allow = new Set(params.targetOwnerIds);
      targets = bonds.filter((b) => allow.has(b.peerOwnerId));
    }
    targets = [...targets].sort((a, b) => bondTrustRank(a.level) - bondTrustRank(b.level));

    const results: DiscoverPublishedLibraryPeerResult[] = [];
    const maxResults = params?.maxResultsPerPeer ?? 5;
    const timeoutMs = params?.timeoutMsPerPeer ?? 15_000;

    for (const bond of targets) {
      const started = Date.now();
      try {
        const { transportPeerId, recipientEnvelopePeerId, listenAddrs } = await this._resolvePeerTransportForOwner(
          bond.peerOwnerId,
        );
        const dialHints = await raceWithTimeout(
          this._dialHintsForChat(transportPeerId, listenAddrs),
          30_000,
          "_dialHintsForChat",
        );
        const unsigned = createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: recipientEnvelopePeerId,
          recipientRole: "human",
          intent: "discovery.request",
          payload: createDiscoveryRequestPayload({
            requesterOwnerId: profile.owner.ownerId,
            requestedTagHashes: [],
            requestedCapabilities: [PUBLISHED_LIB_CAPABILITY],
            maxResults,
            requestedSensitivity: "public",
            fileTitleQuery: params?.fileTitleQuery,
            requestedContentHashPrefixes: params?.contentHashPrefix ? [params.contentHashPrefix] : undefined,
          }),
          correlationId: randomUUID(),
        });
        const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
        const reply = await mesh.sendExpectReply(transportPeerId, envelope, { timeoutMs, dialHints });
        const latencyMs = Date.now() - started;
        if (reply.intent !== "discovery.response") {
          results.push({
            peerOwnerId: bond.peerOwnerId,
            displayName: bond.displayName,
            libp2pPeerId: transportPeerId,
            bondLevel: bond.level,
            bondRank: bondTrustRank(bond.level),
            files: [],
            latencyMs,
            error: `unexpected reply intent ${reply.intent}`,
          });
          continue;
        }
        const resp = parseDiscoveryResponsePayload(reply.payload);
        const files: PublishedLibraryFileHit[] = resp.matches.flatMap((m) =>
          (m.libraryMatches ?? []).map((f) => ({
            documentId: f.documentId,
            title: f.title,
            relativePath: f.relativePath,
            contentHash: f.contentHash,
            byteLength: f.byteLength,
            cid: f.cid,
          })),
        );
        results.push({
          peerOwnerId: bond.peerOwnerId,
          displayName: bond.displayName,
          libp2pPeerId: transportPeerId,
          bondLevel: bond.level,
          bondRank: bondTrustRank(bond.level),
          files,
          latencyMs,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({
          peerOwnerId: bond.peerOwnerId,
          displayName: bond.displayName,
          libp2pPeerId: bond.libp2pPeerId ?? "",
          bondLevel: bond.level,
          bondRank: bondTrustRank(bond.level),
          files: [],
          latencyMs: Date.now() - started,
          error: msg,
        });
      }
    }
    return results;
  }

  async listAgentShareProposals(): Promise<AgentShareProposal[]> {
    return this._getAgentShareProposalStore().list();
  }

  async dismissAgentShareProposal(proposalId: string): Promise<void> {
    await this._getAgentShareProposalStore().remove(proposalId);
  }

  async submitAgentShareProposal(params: SubmitAgentShareProposalParams): Promise<AgentShareProposal> {
    const proposal: AgentShareProposal = {
      proposalId: randomUUID(),
      createdAt: new Date().toISOString(),
      targetOwnerId: params.targetOwnerId.trim(),
      vaultRelativePath: params.vaultRelativePath.replace(/^[\\/]+/, ""),
      sensitivity: params.sensitivity,
      summary: params.summary?.trim() || undefined,
    };
    await this._getAgentShareProposalStore().upsert(proposal);
    this.emit("share:agent-proposed", proposal);
    return proposal;
  }

  private _getAgentShareProposalStore(): ReturnType<typeof createAgentShareProposalStore> {
    if (!this._agentShareProposalStore) {
      this._agentShareProposalStore = createAgentShareProposalStore(this._profileDir);
    }
    return this._agentShareProposalStore;
  }

  async listPendingShareOffers(): Promise<ShareOffer[]> {
    return [...this._pendingInboundShareOffers.values()];
  }

  async shareFile(
    targetOwnerId: string,
    file: { path: string; sensitivity: "public" | "friends" | "private" },
  ): Promise<void> {
    this._assertOnline();
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
    if (!this._taskStore) {
      throw new Error("Task store not initialized — node is not fully wired");
    }

    let targetPeer: Awaited<ReturnType<LocalPeerDirectoryStore["getPeerByOwnerId"]>>;
    try {
      targetPeer = await raceWithTimeout(
        this._peerDirectoryStore.getPeerByOwnerId(targetOwnerId),
        25_000,
        "getPeerByOwnerId",
      );
    } catch (err) {
      throw err;
    }
    if (!targetPeer) {
      const records = await raceWithTimeout(
        this._peerDirectoryStore.listPeerRecords(),
        25_000,
        "listPeerRecords",
      );
      targetPeer =
        records.find((r) => r.ownerId === targetOwnerId) ??
        records.find((r) => r.peerId === targetOwnerId) ??
        undefined;
    }
    if (!targetPeer?.peerId) {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }
    const transportPeerId = targetPeer.peerId;
    if (transportPeerId.startsWith("envoy_")) {
      throw new Error(
        `Peer directory has Envoy envelope id for this owner (not libp2p).`,
      );
    }
    const recipientEnvelopePeerId = targetPeer.devicePublicKeyPem
      ? derivePeerId(targetPeer.devicePublicKeyPem)
      : targetOwnerId.startsWith("envoy_")
        ? targetOwnerId
        : undefined;

    const norm = file.path.replace(/^[\\/]+/, "");
    if (!isSafeVaultPath(this._vaultDir, norm)) {
      throw new Error("Invalid vault path");
    }
    await stat(join(this._vaultDir, norm)).catch(() => {
      throw new Error("File not found in vault");
    });

    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(transportPeerId, targetPeer.listenAddrs),
        30_000,
        "_dialHintsForChat",
      );
    } catch (err) {
      throw err;
    }

    const correlationId = randomUUID();
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "share.request",
      payload: createShareRequestPayload({
        requestType: "file",
        relativePath: norm,
        requestedSensitivity: file.sensitivity,
        fileOrigin: "sender",
      }),
      correlationId,
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;
    await mesh.send(transportPeerId, envelope as any, { dialHints });
    this._pendingPushShareByRequestMsgId.set(envelope.messageId, {
      relativePath: norm,
      toPeerId: transportPeerId,
    });
    this._correlationByRequestMsgId.set(envelope.messageId, correlationId);
    this._upsertTransferStatus({
      correlationId,
      phase: "negotiating",
      remotePeerOwnerId: targetOwnerId,
      remotePeerId: transportPeerId,
      vaultRelativePath: norm,
      updatedAt: new Date().toISOString(),
    });
  }

  async acceptShare(shareId: string, savePath: string): Promise<void> {
    this._assertOnline();
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
    const offer = this._pendingInboundShareOffers.get(shareId);
    if (!offer) {
      throw new Error(`No pending share offer for id=${shareId}`);
    }

    const saveNorm = savePath.trim().replace(/^[\\/]+/, "");
    const srcKey = offer.senderVaultRelativePath?.replace(/^[\\/]+/, "") ?? "";
    if (saveNorm) {
      if (!srcKey) {
        throw new Error("Cannot set save path: sender vault path unknown for this offer");
      }
      if (!isSafeVaultPath(this._vaultDir, saveNorm)) {
        throw new Error("Invalid save path");
      }
      this._pendingDataTransferSavePath.set(`${offer.senderNodeId}\n${srcKey}`, saveNorm);
    }

    const records = await this._peerDirectoryStore.listPeerRecords();
    const rec = records.find((r) => r.peerId === offer.senderNodeId);

    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(offer.senderNodeId, rec?.listenAddrs),
        30_000,
        "_dialHintsForChat",
      );
    } catch (err) {
      throw err;
    }
    const recipientEnvelopePeerId = rec?.devicePublicKeyPem
      ? derivePeerId(rec.devicePublicKeyPem)
      : undefined;

    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "share.accept",
      payload: createShareAcceptPayload({ inReplyTo: shareId, accept: true }),
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;
    await mesh.send(offer.senderNodeId, envelope as any, { dialHints });
    void this._tagBondedContactReachability(offer.senderNodeId);
    this._correlationByPreviewMsgId.set(shareId, shareId);
    this._inboundTransferByShareId.set(shareId, {
      senderNodeId: offer.senderNodeId,
      senderVaultRelativePath: srcKey,
      savePath: saveNorm || srcKey || offer.filename,
      senderOwnerId: rec?.ownerId,
    });
    this._upsertTransferStatus({
      correlationId: shareId,
      phase: "negotiating",
      remotePeerId: offer.senderNodeId,
      remotePeerOwnerId: rec?.ownerId,
      vaultRelativePath: saveNorm || srcKey || offer.filename,
      updatedAt: new Date().toISOString(),
    });
    this._pendingInboundShareOffers.delete(shareId);
    const emitPath = saveNorm || srcKey || offer.filename;
    this.emit("share:accepted", { shareId, savePath: emitPath });
  }

  async declineShare(shareId: string): Promise<void> {
    this._assertOnline();
    this.recordOwnerActivity();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
    const offer = this._pendingInboundShareOffers.get(shareId);
    if (!offer) {
      throw new Error(`No pending share offer for id=${shareId}`);
    }
    const records = await this._peerDirectoryStore.listPeerRecords();
    const rec = records.find((r) => r.peerId === offer.senderNodeId);
    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        this._dialHintsForChat(offer.senderNodeId, rec?.listenAddrs),
        30_000,
        "_dialHintsForChat",
      );
    } catch (err) {
      throw err;
    }
    const recipientEnvelopePeerId = rec?.devicePublicKeyPem
      ? derivePeerId(rec.devicePublicKeyPem)
      : undefined;
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "share.accept",
      payload: createShareAcceptPayload({ inReplyTo: shareId, accept: false }),
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;
    await mesh.send(offer.senderNodeId, envelope as any, { dialHints });
    this._pendingInboundShareOffers.delete(shareId);
    this.emit("share:declined", { shareId });
  }

  // ============================================
  // Node Configuration
  // ============================================

  async getNodeConfig(): Promise<NodeConfig> {
    const config = await this._configStore.load();
    // Apply environment variable overrides for model providers
    const modelProviders: ModelProviderConfig = config?.modelProviders ? {
      ...config.modelProviders,
      mode: (process.env.ENVOY_MODEL_MODE as ModelProviderConfig["mode"]) ?? config.modelProviders.mode,
      endpoint: process.env.ENVOY_MODEL_ENDPOINT ?? config.modelProviders.endpoint,
      apiKey: process.env.ENVOY_MODEL_API_KEY ?? config.modelProviders.apiKey,
      modelName: process.env.ENVOY_MODEL_NAME ?? config.modelProviders.modelName,
    } : {
      mode: (process.env.ENVOY_MODEL_MODE as ModelProviderConfig["mode"]) ?? "mock",
      endpoint: process.env.ENVOY_MODEL_ENDPOINT,
      apiKey: process.env.ENVOY_MODEL_API_KEY,
      modelName: process.env.ENVOY_MODEL_NAME,
    };

    if (config) {
      return {
        profileDir: config.profileDir,
        discoveryProfile: config.discoveryProfile,
        relayEnabled: config.relayEnabled,
        relayServerEnabled: config.relayServerEnabled,
        configuredRelays: config.configuredRelays,
        advertiseAddrs: config.advertiseAddrs,
        bootstrapPeers: config.bootstrapPeers,
        bootstrapPresets: config.bootstrapPresets,
        modelProviders,
        chatAssistEnabled: config.chatAssistEnabled ?? false,
        anonymousDiscoveryMode: config.anonymousDiscoveryMode ?? "off",
        anonymousIntentAllowlist: config.anonymousIntentAllowlist ?? ["discovery.request"],
        anonymousSensitivityCeiling: config.anonymousSensitivityCeiling ?? "public",
        trustAnchorPublicKeys: config.trustAnchorPublicKeys ?? {},
        autonomousKillSwitch: config.autonomousKillSwitch ?? false,
        autonomousPolicies: config.autonomousPolicies ?? [],
        contactAiPreferences: config.contactAiPreferences ?? [],
        bridgeStatus: this._bridgeStatus ?? undefined,
        companionPairingAutoAcceptWithToken: config.companionPairingAutoAcceptWithToken ?? false,
        relayPublicWsUrl: config.relayPublicWsUrl ?? this._relayPublicWsUrl,
        bridgeEnabled: config.bridgeEnabled ?? true,
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
            }
          : { allowIpfs: false },
      };
    }
    return {
      profileDir: this._profileDir,
      discoveryProfile: "wan-default" as const,
      relayEnabled: true,
      relayServerEnabled: false,
      configuredRelays: [],
      advertiseAddrs: [],
      bootstrapPeers: [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
      bootstrapPresets: [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS],
      modelProviders,
      chatAssistEnabled: false,
      anonymousDiscoveryMode: "off",
      anonymousIntentAllowlist: ["discovery.request"],
      anonymousSensitivityCeiling: "public",
      trustAnchorPublicKeys: {},
      autonomousKillSwitch: false,
      autonomousPolicies: [],
      contactAiPreferences: [],
      bridgeStatus: this._bridgeStatus ?? undefined,
      companionPairingAutoAcceptWithToken: false,
      relayPublicWsUrl: this._relayPublicWsUrl,
      bridgeEnabled: true,
      homeClawCoreBaseUrl: undefined,
      trustModeEnabled: false,
      friendMatchingPreferencesText: undefined,
      externalPublish: { allowIpfs: false },
    };
  }

  async updateNodeConfig(config: Partial<NodeConfig>): Promise<void> {
    let validatedSigned: import("@envoymesh/protocol").FriendMatchingPreferencesPayload | undefined;
    if (config.friendMatchingPreferencesSigned !== undefined) {
      const profile = this._profile;
      if (!profile) {
        throw new Error("friendMatchingPreferencesSigned: node profile not initialized");
      }
      const parsed = parseFriendMatchingPreferencesPayload(config.friendMatchingPreferencesSigned);
      const expMs = new Date(parsed.expiresAt).getTime();
      if (!Number.isFinite(expMs) || expMs <= Date.now()) {
        throw new Error("friendMatchingPreferencesSigned: expiresAt must be in the future");
      }
      if (parsed.ownerId !== profile.owner.ownerId) {
        throw new Error("friendMatchingPreferencesSigned: ownerId does not match local owner");
      }
      if (!verifyFriendMatchingPreferences(parsed, profile.owner.publicKeyPem)) {
        throw new Error("friendMatchingPreferencesSigned: invalid signature");
      }
      validatedSigned = parsed;
    }

    if (
      validatedSigned === undefined &&
      config.friendMatchingPreferencesText !== undefined &&
      config.friendMatchingPreferencesText.length > MAX_FRIEND_MATCHING_PREFS_CHARS
    ) {
      throw new Error(
        `friendMatchingPreferencesText exceeds ${MAX_FRIEND_MATCHING_PREFS_CHARS} characters (${config.friendMatchingPreferencesText.length})`,
      );
    }

    const current = (await this._configStore.load()) ?? {
      version: "0.1" as const,
      profileDir: this._profileDir,
      discoveryProfile: "wan-default" as const,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [] as string[],
      bootstrapPeers: [] as string[],
      bootstrapPresets: [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS] as string[],
      configuredRelays: [],
      modelProviders: { mode: "mock" as const },
      chatAssistEnabled: false,
      anonymousDiscoveryMode: "off",
      anonymousIntentAllowlist: ["discovery.request"],
      anonymousSensitivityCeiling: "public",
      autonomousKillSwitch: false,
      autonomousPolicies: [],
      contactAiPreferences: [],
      updatedAt: new Date().toISOString(),
    };

    const updated: PersistedNodeConfig = {
      ...current,
      ...(config.discoveryProfile && { discoveryProfile: config.discoveryProfile }),
      ...(config.enableMdns !== undefined && { enableMdns: config.enableMdns }),
      ...(config.relayEnabled !== undefined && { relayEnabled: config.relayEnabled }),
      ...(config.relayServerEnabled !== undefined && { relayServerEnabled: config.relayServerEnabled }),
      ...(config.advertiseAddrs !== undefined && { advertiseAddrs: config.advertiseAddrs }),
      ...(config.bootstrapPeers !== undefined && { bootstrapPeers: config.bootstrapPeers }),
      ...(config.bootstrapPresets !== undefined && { bootstrapPresets: config.bootstrapPresets }),
      ...(config.configuredRelays !== undefined && { configuredRelays: config.configuredRelays }),
      ...(config.modelProviders && { modelProviders: { ...current.modelProviders, ...config.modelProviders } }),
      ...(config.chatAssistEnabled !== undefined && { chatAssistEnabled: config.chatAssistEnabled }),
      ...(config.anonymousDiscoveryMode !== undefined && { anonymousDiscoveryMode: config.anonymousDiscoveryMode }),
      ...(config.anonymousIntentAllowlist !== undefined && { anonymousIntentAllowlist: config.anonymousIntentAllowlist }),
      ...(config.anonymousSensitivityCeiling !== undefined && { anonymousSensitivityCeiling: config.anonymousSensitivityCeiling }),
      ...(config.trustAnchorPublicKeys !== undefined && { trustAnchorPublicKeys: config.trustAnchorPublicKeys }),
      ...(config.autonomousKillSwitch !== undefined && { autonomousKillSwitch: config.autonomousKillSwitch }),
      ...(config.autonomousPolicies !== undefined && { autonomousPolicies: config.autonomousPolicies }),
      ...(config.aiSettings !== undefined && { aiSettings: config.aiSettings }),
      ...(config.contactAiPreferences !== undefined && {
        contactAiPreferences: config.contactAiPreferences,
      }),
      ...(config.companionPairingAutoAcceptWithToken !== undefined && {
        companionPairingAutoAcceptWithToken: config.companionPairingAutoAcceptWithToken,
      }),
      ...(config.relayPublicWsUrl !== undefined && {
        relayPublicWsUrl: config.relayPublicWsUrl,
      }),
      ...(config.bridgeEnabled !== undefined && {
        bridgeEnabled: config.bridgeEnabled,
      }),
      ...(config.homeClawCoreBaseUrl !== undefined && {
        homeClawCoreBaseUrl: config.homeClawCoreBaseUrl,
      }),
      ...(config.trustModeEnabled !== undefined && { trustModeEnabled: config.trustModeEnabled }),
      ...(config.externalPublish !== undefined && {
        externalPublish: {
          allowIpfs: config.externalPublish.allowIpfs ?? false,
          gatewayAllowlist: (config.externalPublish.gatewayAllowlist ?? [])
            .map((entry) => normalizeGatewayBaseUrl(entry))
            .filter(Boolean)
            .slice(0, 10),
          ipfsExportEngine: normalizeIpfsExportEngineSelection(
            config.externalPublish.ipfsExportEngine ??
              current.externalPublish?.ipfsExportEngine ??
              "kubo",
          ),
        },
      }),
      ...(validatedSigned !== undefined && {
        friendMatchingPreferencesSigned: validatedSigned,
        friendMatchingPreferencesText: validatedSigned.text.trim(),
      }),
      ...(validatedSigned === undefined &&
        config.friendMatchingPreferencesText !== undefined && {
          friendMatchingPreferencesText:
            config.friendMatchingPreferencesText.trim().length === 0
              ? undefined
              : config.friendMatchingPreferencesText.trim(),
          /** Plain-text edits replace owner-signed prefs so UI and crypto-backed doc cannot drift. */
          friendMatchingPreferencesSigned: undefined,
        }),
      updatedAt: new Date().toISOString(),
    };

    if (config.relayPublicWsUrl !== undefined) {
      // empty string = explicitly disabled; any other value = explicit URL
      this._relayPublicWsUrl = config.relayPublicWsUrl;
    }

    await this._configStore.save(updated);
    this.emit("node:status", {
      status: this._nodeStatus,
      peerId: this._mesh?.peerId,
    });
    // Emit config:updated so listeners can refresh cached config values
    this.emit("config:updated", {
      autonomousKillSwitch: updated.autonomousKillSwitch ?? false,
      autonomousPolicies: updated.autonomousPolicies ?? [],
      chatAssistEnabled: updated.chatAssistEnabled ?? false,
      modelProviders: updated.modelProviders,
      aiSettings: updated.aiSettings,
      contactAiPreferences: updated.contactAiPreferences ?? [],
    });
  }

  async listRelays(): Promise<RelayConfig[]> {
    const config = await this._configStore.load();
    return config?.configuredRelays ?? [];
  }

  async getChatDrafts(threadPeerOwnerId?: string): Promise<Array<{ draftId: string; threadPeerOwnerId: string; inReplyToMessageId: string; text: string; createdAt: string }>> {
    if (!this._chatDraftStore) return [];
    if (threadPeerOwnerId) {
      return this._chatDraftStore.listByThread(threadPeerOwnerId);
    }
    return this._chatDraftStore.listAll();
  }

  async deleteChatDraft(draftId: string): Promise<void> {
    if (!this._chatDraftStore) return;
    await this._chatDraftStore.delete(draftId);
  }

  // ============================================
  // Capability Manifest
  // ============================================

  async getCapabilityManifest(): Promise<import("@envoymesh/api").CapabilityManifest | undefined> {
    if (!this._capabilityManifestStore) return undefined;
    return this._capabilityManifestStore.loadManifest();
  }

  async updateCapabilityManifest(params: {
    visibility?: import("@envoymesh/api").ManifestVisibility;
    sensitivityCeiling?: "public" | "friends" | "private";
    keywords?: string[];
    capabilities?: string[];
    description?: string;
  }): Promise<import("@envoymesh/api").CapabilityManifest> {
    if (!this._capabilityManifestStore) {
      throw new Error("Capability manifest store not available");
    }
    const existing = await this._capabilityManifestStore.loadManifest();
    if (existing) {
      const updated: import("@envoymesh/local-store").CapabilityManifest = {
        ...existing,
        ...(params.visibility !== undefined && { visibility: params.visibility }),
        ...(params.sensitivityCeiling !== undefined && { sensitivityCeiling: params.sensitivityCeiling }),
        ...(params.keywords !== undefined && { keywords: params.keywords }),
        ...(params.capabilities !== undefined && { capabilities: params.capabilities }),
        ...(params.description !== undefined && { description: params.description }),
        updatedAt: new Date().toISOString(),
      };
      await this._capabilityManifestStore.saveManifest(updated);
      return updated as import("@envoymesh/api").CapabilityManifest;
    }
    return this._capabilityManifestStore.createDefaultManifest(params);
  }

  async addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig> {
    const config = (await this._configStore.load()) ?? {
      version: "0.1" as const,
      profileDir: this._profileDir,
      discoveryProfile: "wan-default" as const,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [] as string[],
      bootstrapPeers: [] as string[],
      bootstrapPresets: [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS] as string[],
      configuredRelays: [],
      modelProviders: { mode: "mock" as const },
      chatAssistEnabled: false,
      autonomousKillSwitch: false,
      autonomousPolicies: [],
      contactAiPreferences: [],
      updatedAt: new Date().toISOString(),
    };

    const relayId = `relay_${Date.now()}`;
    const newRelay: RelayConfig = { relayId, addr, level, region, enabled: true };

    // If address looks like a domain, try to resolve it to a multiaddr with peer ID
    let resolvedAddr = addr;
    if (looksLikeDomain(addr)) {
      console.log(`[node-service] Resolving relay domain: ${addr}`);
      const results = await resolveBootstrapAddresses([addr]);
      if (results.length > 0 && results[0].resolved.length > 0) {
        resolvedAddr = results[0].resolved[0];
        console.log(`[node-service] Resolved ${addr} to ${resolvedAddr}`);
      }
    }

    const updated: PersistedNodeConfig = {
      ...config,
      configuredRelays: [...config.configuredRelays, { ...newRelay, addr: resolvedAddr }],
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(updated);
    return { ...newRelay, addr: resolvedAddr };
  }

  async removeRelay(relayId: string): Promise<void> {
    const config = await this._configStore.load();
    if (!config) {
      return;
    }

    const updated: PersistedNodeConfig = {
      ...config,
      configuredRelays: config.configuredRelays.filter((r) => r.relayId !== relayId),
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(updated);
  }

  // ============================================
  // Node Lifecycle
  // ============================================

  async initNode(profileDir: string, options?: InitNodeOptions): Promise<NodeInitResult> {
    console.log(`[node-service] initNode called: profileDir=${profileDir}, options=`, options);
    // Create profile directory structure
    const profile = await loadOrCreateNodeProfile(profileDir);

    // Write persisted config
    const config: PersistedNodeConfig = {
      version: "0.1",
      profileDir,
      discoveryProfile: options?.discoveryProfile ?? "wan-default",
      relayEnabled: options?.relayEnabled ?? true,
      relayServerEnabled: options?.relayServerEnabled ?? false,
      advertiseAddrs: options?.advertiseAddrs ?? [],
      bootstrapPeers: options?.bootstrapPeers ?? [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
      bootstrapPresets: options?.bootstrapPresets ?? [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS],
      configuredRelays: [],
      modelProviders: { mode: "mock" },
      chatAssistEnabled: false,
      autonomousKillSwitch: false,
      autonomousPolicies: [],
      contactAiPreferences: [],
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(config);
    this._profile = profile;

    return {
      profileDir,
      peerId: derivePeerId(profile.device.publicKeyPem),
      ownerId: profile.owner.ownerId,
      deviceId: profile.device.deviceId,
    };
  }

  getNodeStatus(): NodeStatus {
    return this._nodeStatus;
  }

  async startNode(): Promise<void> {
    if (this._nodeStatus === "running") {
      return;
    }

    if (this._nodeStatus === "starting") {
      throw new Error("Node is already starting");
    }

    this._nodeStatus = "starting";
    this.emit("node:status", { status: this._nodeStatus });

    try {
      const config = await this._configStore.load();
      if (!config) {
        throw new Error("No node config found. Call initNode() first.");
      }

      // Load or create profile
      this._profile = await loadOrCreateNodeProfile(config.profileDir);

      // Create app-managed stores
      this._taskStore = createLocalTaskStore(config.profileDir);
      this._relayStateStore = createRelayStateStore(config.profileDir);
      this._discoverySeedStore = this._discoverySeedStore ?? createDiscoverySeedStore(config.profileDir);
      this._taskRuntimeStore = createTaskRuntimeStateStore(config.profileDir);
      this._inboundGuard = createInboundMessageGuard();
      this._taskDispatcher = createTaskDispatcher();

      // Compute effective bootstrap peers
      // Must resolve bootstrapPresets to actual multiaddresses for mesh connectivity
      const peerRecords = await this._peerDirectoryStore.listPeerRecords();
      const peerDirAddrCount = peerRecords.reduce((n, r) => n + r.listenAddrs.length, 0);
      const seedAddrs = await this._discoverySeedStore.listSeedAddrs();

      // Resolve bootstrap presets to actual multiaddresses
      const resolvedPresetAddrs: string[] = [];
      if (config.bootstrapPresets && config.bootstrapPresets.length > 0) {
        console.log(`[node-service] Resolving ${config.bootstrapPresets.length} bootstrap presets: ${config.bootstrapPresets.join(", ")}`);
        const resolvedResults = await resolveBootstrapAddresses(config.bootstrapPresets);
        for (const result of resolvedResults) {
          resolvedPresetAddrs.push(...result.resolved);
          if (result.resolved.length === 0) {
            console.warn(`[node-service] WARNING: Preset ${result.original} resolved to 0 addresses (using as-is)`);
          }
          console.log(`[node-service] Preset ${result.original} → ${result.resolved.length} addresses: ${result.resolved.join(", ")}`);
        }
      }

      const rawBootstrapAddrs = [...config.bootstrapPeers, ...resolvedPresetAddrs, ...seedAddrs].filter(
        (addr): addr is string =>
          typeof addr === "string" && addr.trim().length > 0 && addr.startsWith("/"),
      );
      const bootstrapPeers = filterBootstrapMultiaddrs([...new Set(rawBootstrapAddrs)]);
      if (rawBootstrapAddrs.length !== bootstrapPeers.length || peerDirAddrCount > 0) {
        console.log(
          `[node-service] bootstrap addrs: kept=${bootstrapPeers.length} filtered=${rawBootstrapAddrs.length - bootstrapPeers.length} peer-dir-skipped=${peerDirAddrCount} (contact listen addrs use dial hints only)`,
        );
      }

      console.log(`[node-service] Bootstrap peers resolved: ${bootstrapPeers.length} addresses`);
      for (const bp of bootstrapPeers) {
        console.log(`  - ${bp}`);
      }

      // Create EnvoyMesh
      // DHT is always enabled when using wan-default discovery profile (for topic-based peer discovery)
      // Bootstrap presets affect peer connectivity, not DHT availability
      console.log(`[node-service] DHT configuration: discoveryProfile=${config.discoveryProfile}, bootstrapPresets=${config.bootstrapPresets?.length ?? 0}`);
      console.log(`[node-service] Creating EnvoyMesh with enableDht=true`);
      console.log(`[node-service] config object:`, JSON.stringify({
        discoveryProfile: config.discoveryProfile,
        relayEnabled: config.relayEnabled,
        relayServerEnabled: config.relayServerEnabled,
        bootstrapPeers: config.bootstrapPeers,
        bootstrapPresets: config.bootstrapPresets,
      }));

      const meshOptions: EnvoyMeshOptions = {
        listen: ["/ip4/0.0.0.0/tcp/0"],
        advertiseAddrs: config.advertiseAddrs,
        enableMdns: config.enableMdns ?? true, // mDNS for local discovery (default true, can be disabled for testing)
        enableDht: true, // Always enable DHT for topic-based discovery
        dhtClientMode: true,
        bootstrapPeers,
        enableRelay: config.relayEnabled,
        enableRelayServer: config.relayServerEnabled,
        enableAutoNat: true,
        enableDcutr: true,
        libp2pPrivateKeyPath: join(config.profileDir, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME),
      };

      this._mesh = new EnvoyMesh(meshOptions);

      // Wire mesh events
      this._wireMeshEvents();

      // Start mesh
      await this._mesh.start();
      this._lastNodeError = undefined;
      this._lastNodeErrorAt = undefined;

      void this._resyncBondedContactReachabilityTags();

      this._relayBootstrapPeers = bootstrapPeers;
      if (config.relayEnabled && this._inboundGuard && this._discoverySeedStore) {
        this._stopRelayClientScheduler?.();
        this._stopRelayClientScheduler = startRelayClientScheduler({
          mesh: this._mesh,
          profile: this._profile!,
          bootstrapPeers,
          inboundGuard: this._inboundGuard,
          discoverySeedStore: this._discoverySeedStore,
        });
      }

      this._nodeProcessStartedAtMs = Date.now();
      this._stopNodeStatsLogging?.();
      this._stopNodeStatsLogging = startNodeStatsInterval(this._mesh, {
        processStartedAtMs: this._nodeProcessStartedAtMs,
      });

      this._nodeStatus = "running";
      this.emit("node:status", { status: this._nodeStatus, peerId: this._mesh.peerId });
      this.emit("node:online", { peerId: this._mesh.peerId, multiaddrs: this._mesh.multiaddrs.map(a => a.toString()) });

      // Wait longer for DHT to connect to bootstrap peers and stabilize routing table
      // DHT provide operations require the routing table to be populated
      this._advertiseInterestsStartupTimeout = setTimeout(() => {
        void this._advertiseInterestsIfPublic();
      }, 15000);
    } catch (error) {
      console.error("[node-service] startNode failed:", error);
      this._recordNodeError("startNode", error);
      if (this._advertiseInterestsStartupTimeout) {
        clearTimeout(this._advertiseInterestsStartupTimeout);
        this._advertiseInterestsStartupTimeout = undefined;
      }
      this._nodeStatus = "offline";
      this.emit("node:status", { status: this._nodeStatus });
      throw error;
    }
  }

  private _wireMeshEvents(): void {
    const mesh = this._mesh!;
    const profile = this._profile!;
    const taskStore = this._taskStore!;

    mesh.onMessage(async ({ envelope, remotePeerId, remoteAddr }) => {
      const guardDecision = this._inboundGuard!.inspect(envelope);
      if (guardDecision.action === "reject") return;

      // Emit raw envelope for remote P2P clients (e.g. mobile app) with own identity
      try {
        this.emit("p2p:envelope", { envelope: envelope as unknown as Record<string, unknown>, remotePeerId });
      } catch (_) {
        // ignore emit errors (e.g. no listeners)
      }

      const { intent } = envelope;

      if (
        intent === "bond.request" ||
        intent === "bond.accept" ||
        intent === "bond.challenge" ||
        intent === "bond.challenge.response"
      ) {
        const receivedAt = Date.now();
        const correlationId = deriveCorrelationIdFromEnvelope(envelope);
        const bond = await handleInboundBondIntent(
          {
            envelope,
            profile,
            remotePeerId,
            receivedAt,
            correlationId,
            taskStore,
            trustStore: this._trustStore,
          },
          (helloData) => {
            this.storePendingHelloRequest(helloData);
            this.emit("hello:request", helloData);
          },
          async (bondData) => {
            this.emit("bond:established", bondData);
            if (envelope.intent === "bond.request") {
              try {
                const payload = parseBondRequestPayload(envelope.payload);
                await this._peerDirectoryStore.ensurePeerFromInboundChat({
                  ownerId: payload.requesterOwnerId,
                  peerId: remotePeerId,
                  listenAddrs: remoteAddr?.trim()
                    ? filterUsableOutboundPeerDialHints([remoteAddr.trim()], remotePeerId)
                    : [],
                });
              } catch (err) {
                console.error(`[bond:established] failed to store peer in directory:`, err);
              }
            } else if (envelope.intent === "bond.accept") {
              try {
                const payload = parseBondAcceptPayload(envelope.payload);
                await this._peerDirectoryStore.ensurePeerFromInboundChat({
                  ownerId: payload.responderOwnerId,
                  peerId: remotePeerId,
                  listenAddrs: remoteAddr?.trim()
                    ? filterUsableOutboundPeerDialHints([remoteAddr.trim()], remotePeerId)
                    : [],
                });
              } catch (err) {
                console.error(`[bond:established] failed to store peer from bond.accept:`, err);
              }
            }
            void this._tagBondedContactReachability(remotePeerId);
          },
        );
        if (!bond.ok) {
          await taskStore.appendAuditEvent(
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

        if (bond.bondAcceptToRequester) {
          const { requesterPeerId, requesterOwnerId } = bond.bondAcceptToRequester;
          const humanProfile = await this._humanProfileStore.loadHumanProfile();
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
          const requesterDir = await this._peerDirectoryStore.getPeerByOwnerId(requesterOwnerId);
          try {
            const autoHints = await buildOutboundDialHints({
              recipientPeerId: requesterPeerId,
              peerListenAddrs: requesterDir?.listenAddrs,
              discoverySeedStore: this._discoverySeedStore,
              config: await this._configStore.load(),
            });
            const latencyMs = await mesh.send(requesterPeerId, signedAccept, { dialHints: autoHints });
            await taskStore.appendAuditEvent(
              createAuditEvent({
                type: "message.sent",
                intent: signedAccept.intent,
                messageId: signedAccept.messageId,
                correlationId: signedAccept.correlationId,
                remotePeerId: requesterPeerId,
                direction: "outbound",
                latencyMs,
                protocol: ENVOY_MESSAGE_PROTOCOL,
                outcome: "record",
                summary: "Sent bond.accept to requester after auto-accept.",
                createdAt: signedAccept.createdAt,
              }),
            );
            void this._tagBondedContactReachability(requesterPeerId);
          } catch (err) {
            console.error(
              `[bond.request] auto-accept: failed to send bond.accept to requester ${requesterPeerId}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
        return;
      }

      if (intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        const senderTrust = await this._trustStore.getTrustRecord(payload.senderOwnerId);
        const selfHuman = await this._humanProfileStore.loadHumanProfile();
        const incomingMsg: ChatMessage = {
          messageId: envelope.messageId,
          sender: {
            nodeId: remotePeerId,
            ownerId: payload.senderOwnerId,
            displayName: senderTrust?.displayName ?? payload.senderOwnerId,
          },
          recipient: {
            nodeId: mesh.peerId,
            ownerId: profile.owner.ownerId,
            displayName: selfHuman?.displayName ?? profile.owner.ownerId,
          },
          content: { text: payload.text },
          metadata: { timestamp: envelope.createdAt, deliveryReceipt: "delivered" },
          signature: envelope.signature,
        };
        this._persistChatMessage(payload.senderOwnerId, incomingMsg);
        this.emit("chat:message", incomingMsg);
        if (senderTrust && senderTrust.level !== "blocked") {
          void this._tagBondedContactReachability(remotePeerId);
        }
      }
    });

    mesh.onPeerDiscovered(async ({ peerId, multiaddrs }) => {
      try {
        // Note: Do NOT create peer directory records here from mDNS discovery.
        // mDNS only provides peerId + multiaddrs, not owner identity.
        // Peer directory records should only be created when we receive actual identity
        // info via system.signal, bond.request, or bond.accept handlers.
        // Creating a record here with ownerId=peerId would corrupt the directory because
        // later lookups by real ownerId wouldn't find the existing record.
        this.emit("peer:discovered", {
          nodeId: peerId,
          ownerId: peerId,
          displayName: `Peer ${peerId.slice(0, 8)}`,
          username: undefined,
          bio: undefined,
          interests: [],
          profileVisibility: "public" as const,
        });
      } catch (err) {
        console.warn(`[node-service] Failed to process peer discovery for ${peerId}:`, err);
      }
    });
  }

  async stopNode(): Promise<void> {
    if (this._nodeStatus === "offline") {
      return;
    }

    this._nodeStatus = "stopping";
    this.emit("node:status", { status: this._nodeStatus });

    try {
      this._stopRelayClientScheduler?.();
      this._stopRelayClientScheduler = undefined;
      this._stopNodeStatsLogging?.();
      this._stopNodeStatsLogging = undefined;
      this._relayBootstrapPeers = [];
      if (this._mesh) {
        await this._mesh.stop();
        this._mesh = undefined;
      }
      // Clear periodic re-advertisement timer
      if (this._advertiseInterestsTimer) {
        clearInterval(this._advertiseInterestsTimer);
        this._advertiseInterestsTimer = undefined;
      }
      // Clear startup timeout
      if (this._advertiseInterestsStartupTimeout) {
        clearTimeout(this._advertiseInterestsStartupTimeout);
        this._advertiseInterestsStartupTimeout = undefined;
      }
    } catch (error) {
      console.error("[node-service] Error stopping mesh:", error);
    }

    this._nodeStatus = "offline";
    this.emit("node:status", { status: this._nodeStatus });
    this.emit("node:offline", { peerId: this._profile?.device?.deviceId ?? "" });
  }

  // ============================================
  // Event Subscription
  // ============================================

  on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler as any);
    return () => {
      handlers?.delete(handler as any);
    };
  }

  hasListeners(event: keyof NodeServiceEvents): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  // ============================================
  // Connection Status
  // ============================================

  getConnectionStatus(): ConnectionStatus {
    const diagnostics = {
      lastError: this._lastNodeError ?? undefined,
      lastErrorAt: this._lastNodeErrorAt ?? undefined,
    };
    const mesh = this._reachableMesh();
    if (!mesh || this._nodeStatus !== "running") {
      return {
        online: false,
        peerId: "",
        multiaddrs: [],
        connectedRelays: [],
        bondedPeers: 0,
        ...diagnostics,
      };
    }
    return {
      online: true,
      peerId: mesh.peerId,
      multiaddrs: mesh.multiaddrs,
      connectedRelays: mesh.getConnectionStats().circuitPeerIds,
      bondedPeers: 0,
      ...diagnostics,
    };
  }

  private _recordNodeError(context: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    this._lastNodeError = `${context}: ${msg}`;
    this._lastNodeErrorAt = new Date().toISOString();
  }

  setBridgeStatus(status: BridgeStatus): void {
    this._bridgeStatus = status;
    this.emit("bridge:status", status);
  }

  setBridgeChatHandler(handler: (envelope: EnvoyEnvelope, remotePeerId: string) => Promise<void>): void {
    this._bridgeChatHandler = handler;
  }

  setStyleAdapter(adapter: import("./style-adapter.js").StyleAdapter): void {
    this._styleAdapter = adapter;
  }

  /** Set the WebSocket server's listen port/path for pairing QR URL generation. */
  setWsListenAddress(port: number, path: string): void {
    this._wsPort = port;
    this._wsPath = path;
  }

  /**
   * Set the relay's public WebSocket URL for mobile pairing through relay proxy (Phase 10A).
   * When set, `getPairingPayload()` returns this URL as `wsUrl` instead of the LAN IP,
   * so mobile clients can pair from any network.
   */
  setRelayPublicWsUrl(url: string | undefined): void {
    // undefined = use auto-discovery; empty string = explicitly disabled; anything else = explicit URL
    this._relayPublicWsUrl = url;
  }

  /**
   * Returns true if [token] matches either:
   * 1. The latest QR pairing token from [getPairingPayload] (10-min TTL), or
   * 2. A persisted session token (no TTL — for reconnections without QR re-scan).
   *
   * When a persisted token is matched, [lastUsedAt] is touched.
   */
  async validatePairingToken(token: string): Promise<boolean> {
    const t = token.trim();
    if (!t) {
      return false;
    }

    // 1. Check in-memory QR pairing token (10-min TTL)
    if (this._pairingToken && t === this._pairingToken) {
      if (Date.now() - this._pairingTokenIssuedAt <= NodeServiceImpl._pairingTokenTtlMs) {
        return true;
      }
    }

    // 2. Check persisted session token store (no TTL)
    if (this._sessionTokenStore) {
      const record = await this._sessionTokenStore.getTokenByValue(t);
      if (record) {
        // Touch lastUsedAt
        record.lastUsedAt = new Date().toISOString();
        await this._sessionTokenStore.setToken(record);
        return true;
      }
    }

    return false;
  }

  async getBridgeStatus(): Promise<BridgeStatus> {
    return this._bridgeStatus ?? { enabled: false, agentPeerId: "", agentUrl: "", listenPort: 0, agentName: "" };
  }

  /**
   * Get pairing payload for mobile-app QR pairing (Phase 10A.7).
   *
   * When a relay is discoverable, the QR points to the relay's client-proxy
   * WebSocket so mobile can pair from any network. Falls back to direct LAN IP
   * when no relay is known.
   */
  async getPairingPayload(): Promise<PairingPayload> {
    const bridgeStatus = await this.getBridgeStatus();
    const reachable = this._mesh ?? this._externalMesh;

    // Derive LAN IP from multiaddrs, e.g. /ip4/192.168.1.100/tcp/63641 → 192.168.1.100.
    // Skip 127.0.0.1 — it's unreachable from mobile devices on the same LAN.
    let lanIp = "localhost";
    const LOOPBACK_RE = /^127\./;
    if (reachable?.multiaddrs) {
      for (const addr of reachable.multiaddrs) {
        const match = addr.match(/\/ip4\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
        if (match && !LOOPBACK_RE.test(match[1])) {
          lanIp = match[1];
          break;
        }
      }
    }

    const wsPort = (this._wsPort ?? 3030);
    const wsPath = (this._wsPath ?? "/ws");
    const lanWsUrl = `ws://${lanIp}:${wsPort}${wsPath}`;

    // Resolve relay WebSocket URL:
    //   undefined (not configured) → auto-discover from relays / bootstrap peers
    //   "" (explicitly disabled)    → no relay proxy, direct LAN connection only
    //   "<url>" (explicit URL)      → use this URL for relay proxy
    const relayWsUrl = this._relayPublicWsUrl !== undefined
      ? (this._relayPublicWsUrl || undefined) // "" → undefined (disabled)
      : await this._autoDiscoverRelayWsUrl();

    this._pairingToken = randomUUID();
    this._pairingTokenIssuedAt = Date.now();

    // When a relay is reachable, the mobile connects through it (any-network).
    // Include `target` (home node peer ID) and `token` as query params so the
    // relay knows which node to proxy to.
    let wsUrl: string;
    if (relayWsUrl) {
      const params = new URLSearchParams();
      if (reachable?.peerId) params.set("target", reachable.peerId);
      params.set("token", this._pairingToken);
      wsUrl = `${relayWsUrl}?${params.toString()}`;
    } else {
      wsUrl = lanWsUrl;
    }

    const payload: PairingPayload = { wsUrl };
    payload.token = this._pairingToken;

    // Include the relay's peer ID (not the home node's) so the mobile app can
    // use it for RPC probe params and reconstructed dial URLs.
    // Only set when auto-discovering — for explicit URLs we don't know the
    // relay's peer ID unless it's in configuredRelays.
    if (relayWsUrl && this._relayPublicWsUrl === undefined) {
      payload.relayPeerId = await this._autoDiscoverRelayPeerId();
    }

    if (relayWsUrl) {
      payload.relayWsUrl = relayWsUrl;
    }

    if (bridgeStatus.enabled) {
      payload.agentPeerId = bridgeStatus.agentPeerId;
      if (bridgeStatus.agentPublicKeyPem) {
        payload.agentPubKey = bridgeStatus.agentPublicKeyPem;
      }
    }

    // Phase 11: Include owner identity for multi-device shared-identity pairing.
    // These are public info — safe for QR codes.
    const profile = this._profile;
    if (profile) {
      payload.ownerPublicKey = profile.owner.publicKeyPem;
      payload.ownerId = profile.owner.ownerId;
    }

    return payload;
  }

  /**
   * Pair a mobile device after QR-code scan.
   *
   * Validates the short-lived QR pairing token, creates a persistent session
   * token for future reconnections, and sets up a "direct" trust record.
   */
  async pairDevice(params: PairDeviceParams): Promise<PairDeviceResult> {
    const { requesterOwnerId, requesterDeviceId, requesterDevicePublicKeyPem, pairingToken } = params;

    if (!requesterOwnerId || !requesterDeviceId || !requesterDevicePublicKeyPem || !pairingToken) {
      throw new Error("Missing required pairDevice params");
    }

    // Validate the QR pairing token
    const valid = await this.validatePairingToken(pairingToken);
    if (!valid) {
      throw new Error("Invalid or expired pairing token");
    }

    // Derive the requester's libp2p peer ID from their device public key
    const peerId = derivePeerId(requesterDevicePublicKeyPem);

    // Create trust record at "direct" level
    await this._trustStore.setTrustRecord({
      peerOwnerId: requesterOwnerId,
      level: "direct",
      displayName: "Companion",
      note: "pairDevice",
      now: new Date().toISOString(),
    });

    // Register in peer directory so dial hints work
    await this._peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: requesterOwnerId,
      peerId,
      listenAddrs: [],
    });

    // Generate persistent session token
    const sessionToken = randomUUID();
    const now = new Date().toISOString();
    if (this._sessionTokenStore) {
      await this._sessionTokenStore.setToken({
        token: sessionToken,
        ownerId: requesterOwnerId,
        deviceId: requesterDeviceId,
        displayName: "Companion",
        createdAt: now,
        lastUsedAt: now,
      });
    }

    const bridgeStatus = await this.getBridgeStatus();
    const result: PairDeviceResult = { sessionToken };
    if (bridgeStatus.enabled) {
      result.agentPeerId = bridgeStatus.agentPeerId;
      if (bridgeStatus.agentPublicKeyPem) {
        result.agentPubKey = bridgeStatus.agentPublicKeyPem;
      }
    }

    return result;
  }

  /**
   * Shared-identity pairing (Phase 11).
   *
   * Like pairDevice but additionally:
   * - Signs a DeviceCertificate authorizing the mobile device
   * - ECDH-encrypts the owner private key for secure transfer
   *
   * Called by the Capacitor mobile app when it wants to share the home node's
   * owner identity (same ownerId on both devices).
   */
  async pairSharedIdentity(params: PairSharedIdentityParams): Promise<PairSharedIdentityResult> {
    const { requesterOwnerId, requesterDeviceId, requesterDevicePublicKeyPem, keyExchangePublicKey, pairingToken } = params;

    if (!requesterOwnerId || !requesterDeviceId || !requesterDevicePublicKeyPem || !keyExchangePublicKey || !pairingToken) {
      throw new Error("Missing required pairSharedIdentity params");
    }

    // Verify the ownerId matches — shared identity means the mobile claims the same owner
    const profile = this._requireProfile();
    if (requesterOwnerId !== profile.owner.ownerId) {
      throw new Error(`ownerId mismatch — expected ${profile.owner.ownerId}, got ${requesterOwnerId}`);
    }

    // Validate the QR pairing token
    const valid = await this.validatePairingToken(pairingToken);
    if (!valid) {
      throw new Error("Invalid or expired pairing token");
    }

    // Sign a device certificate authorizing this mobile device
    const deviceCert = createDeviceCertificate({
      owner: {
        ownerId: profile.owner.ownerId,
        publicKeyPem: profile.owner.publicKeyPem,
        privateKeyPem: profile.owner.privateKeyPem,
      },
      device: {
        deviceId: requesterDeviceId,
        publicKeyPem: requesterDevicePublicKeyPem,
        privateKeyPem: "", // mobile keeps its private key; only public part is certified
      },
      deviceProfile: "satellite",
      capabilities: ["mesh.listen", "message.send", "device.sync"],
    });

    // ECDH-encrypt the owner private key for the mobile device
    const keyExchangePubKeyBytes = Buffer.from(keyExchangePublicKey, "base64url");
    const encrypted = await encryptOwnerKeyForDevice(
      profile.owner.privateKeyPem,
      keyExchangePubKeyBytes,
    );

    // Derive the mobile device's peer ID
    const peerId = derivePeerId(requesterDevicePublicKeyPem);

    // Create trust record at "direct" level (same as pairDevice)
    await this._trustStore.setTrustRecord({
      peerOwnerId: requesterOwnerId,
      level: "direct",
      displayName: "Mobile (shared identity)",
      note: "pairSharedIdentity",
      now: new Date().toISOString(),
    });

    // Register in peer directory
    await this._peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: requesterOwnerId,
      peerId,
      listenAddrs: [],
    });

    // Generate persistent session token
    const sessionToken = randomUUID();
    const now = new Date().toISOString();
    if (this._sessionTokenStore) {
      await this._sessionTokenStore.setToken({
        token: sessionToken,
        ownerId: requesterOwnerId,
        deviceId: requesterDeviceId,
        displayName: "Mobile (shared identity)",
        createdAt: now,
        lastUsedAt: now,
      });
    }

    const bridgeStatus = await this.getBridgeStatus();
    const result: PairSharedIdentityResult = {
      sessionToken,
      deviceCertificate: deviceCert as unknown as Record<string, unknown>,
      encryptedOwnerKey: encrypted.encryptedKey,
      ephemeralPublicKey: encrypted.ephemeralPublicKey,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      ownerPublicKey: profile.owner.publicKeyPem,
      ownerId: profile.owner.ownerId,
    };
    if (bridgeStatus.enabled) {
      result.agentPeerId = bridgeStatus.agentPeerId;
      if (bridgeStatus.agentPublicKeyPem) {
        result.agentPubKey = bridgeStatus.agentPublicKeyPem;
      }
    }

    return result;
  }

  async homeclawCoreProxy(params: HomeClawCoreProxyParams): Promise<HomeClawCoreProxyResult> {
    const cfg = await this.getNodeConfig();
    return executeHomeClawCoreProxy(params, cfg.homeClawCoreBaseUrl);
  }

  /**
   * Try to derive a relay WebSocket URL from configured relays or bootstrap peers.
   * Relays expose their client-proxy WebSocket on port 15432 (the HTTP info port).
   * Only returns a URL if the node is actually connected to that relay via libp2p —
   * otherwise the relay can't proxy to this node and the QR would point to a dead end.
   */
  /**
   * Returns true when [relayPeerId] has a direct, unlimited libp2p connection.
   *
   * This is the signal we need for client-proxy: the relay must be able to call
   * {@link EnvoyMesh.findOpenConnectionToPeer} (which requires {@code limits == null}
   * — i.e. a direct TCP connection, NOT a circuit-relay path) so it can open a
   * new stream and proxy the mobile client's WebSocket data.
   */
  private _hasDirectConnectionTo(relayPeerId: string): boolean {
    return this._reachableMesh()?.getPeerConnectionInfo(relayPeerId).direct === true;
  }

  private async _autoDiscoverRelayWsUrl(): Promise<string | undefined> {
    // 1. Check configured relays in persisted config — only when directly connected
    try {
      const config = await this._configStore.load();
      if (config?.configuredRelays?.length) {
        const r = config.configuredRelays.find(
          (r) => r.addr.includes("/ip4/") && this._hasDirectConnectionTo(NodeServiceImpl._deriveRelayPeerId(r.addr) ?? ""),
        );
        if (r) {
          const derived = NodeServiceImpl._deriveRelayWsUrl(r.addr);
          if (derived) return derived;
        }
      }
    } catch { /* no persisted config */ }

    // 2. Fall back to known community relay — only if directly connected
    const cnRelayPeerId = NodeServiceImpl._deriveRelayPeerId(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    if (cnRelayPeerId && this._hasDirectConnectionTo(cnRelayPeerId)) {
      return NodeServiceImpl._deriveRelayWsUrl(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    }

    return undefined;
  }

  /**
   * Auto-discover the relay's libp2p peer ID from configured relays or the
   * known community relay bootstrap address. Only returns a peer ID if the
   * node is actually connected to that relay.
   */
  private async _autoDiscoverRelayPeerId(): Promise<string | undefined> {
    try {
      const config = await this._configStore.load();
      if (config?.configuredRelays?.length) {
        const r = config.configuredRelays.find(
          (r) => r.addr.includes("/ip4/") && this._hasDirectConnectionTo(NodeServiceImpl._deriveRelayPeerId(r.addr) ?? ""),
        );
        if (r) {
          const derived = NodeServiceImpl._deriveRelayPeerId(r.addr);
          if (derived) return derived;
        }
      }
    } catch { /* no persisted config */ }
    const cnRelayPeerId = NodeServiceImpl._deriveRelayPeerId(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    if (cnRelayPeerId && this._hasDirectConnectionTo(cnRelayPeerId)) {
      return cnRelayPeerId;
    }
    return undefined;
  }

  /**
   * Derive the relay's WebSocket proxy URL from a libp2p multiaddr.
   * e.g. `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooW...` → `ws://47.93.11.212:15432/ws`
   */
  private static _deriveRelayWsUrl(relayAddr: string): string | undefined {
    // Match IPv4 from multiaddr like /ip4/X.X.X.X/tcp/N...
    const match = relayAddr.match(/\/ip4\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
    if (!match) return undefined;
    // Relay exposes client-proxy WebSocket on its HTTP info port (15432)
    return `ws://${match[1]}:${DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT}/ws`;
  }

  /**
   * Derive the relay's libp2p peer ID from a multiaddr.
   * e.g. `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooW...` → `12D3KooW...`
   */
  private static _deriveRelayPeerId(relayAddr: string): string | undefined {
    const match = relayAddr.match(/\/p2p\/([1-9A-HJ-NP-Za-km-z]+)/);
    return match?.[1];
  }

  /**
   * Forward a pre-signed EnvoyEnvelope from a remote client into the P2P mesh.
   * The client signs the envelope with its own keys; the node only validates
   * the envelope shape and forwards it.
   */
  async forwardEnvelope(envelopeJson: Record<string, unknown>, dialHints?: string[]): Promise<void> {
    this._assertOnline();
    const mesh = this._requireMesh();
    const profile = this._requireProfile();

    // Parse the envelope to validate structure
    const envelope = parseEnvelope(envelopeJson);

    // Determine the transport target: use recipientPeerId if present,
    // otherwise fall back to trying to look up via the peer directory.
    let transportPeerId: string;
    if (envelope.recipientPeerId) {
      // For relay.lookup, relay.peers.request, etc., we dial the relay directly.
      // The caller can pass dialHints if the recipient is not in our peer directory.
      transportPeerId = envelope.recipientPeerId;
    } else {
      // For chat messages, look up via the peer directory
      const payload = envelope.payload as { senderOwnerId?: string };
      if (payload.senderOwnerId) {
        const dir = await this._peerDirectoryStore.getPeerByOwnerId(payload.senderOwnerId);
        if (dir) {
          transportPeerId = dir.peerId;
        } else {
          throw new Error(`Peer not found for forwarded envelope to ${payload.senderOwnerId}`);
        }
      } else {
        throw new Error("forwardEnvelope: envelope has no recipientPeerId and payload has no senderOwnerId");
      }
    }

    // Self-send or local agent: route via bridge handler
    // The bridge agent runs on this same node, identified by envoy_agent_* peer IDs.
    // Envelopes addressed to the bridge agent (e.g. device.pair.request from mobile
    // via relay proxy) must be delivered locally, not dialed via libp2p.
    if (this._bridgeChatHandler) {
      if (transportPeerId === mesh.peerId || transportPeerId.startsWith("envoy_agent_")) {
        console.log(`[forwardEnvelope] local delivery to ${transportPeerId.slice(0, 20)}… via bridge handler`);
        await this._bridgeChatHandler(envelope, mesh.peerId);
        return;
      }
    }

    if (transportPeerId.startsWith("envoy_")) {
      throw new Error(`forwardEnvelope: cannot dial envoy_ peer ID "${transportPeerId}" — need a libp2p peer ID`);
    }

    // Forward into the P2P mesh
    console.log(`[forwardEnvelope] intent=${envelope.intent} senderPeerId=${envelope.senderPeerId} transportPeerId=${transportPeerId}`);
    if (envelope.intent === "chat.message") {
      await mesh.sendChat(transportPeerId, envelope as any, { dialHints: dialHints ?? [] });
    } else {
      await mesh.send(transportPeerId, envelope as any, { dialHints: dialHints ?? [] });
    }

    // Tag reachability for the transport peer
    void this._tagBondedContactReachability(transportPeerId);
  }

  async getPeerConnectionInfo(peerOwnerId: string): Promise<PeerConnectionInfo> {
    const mesh = this._reachableMesh();
    if (!mesh) {
      return { connected: false, direct: false };
    }

    // Look up the libp2p peer ID from the peer directory
    const peerRecord = await this._peerDirectoryStore.getPeerByOwnerId(peerOwnerId);
    if (!peerRecord?.peerId) {
      return { connected: false, direct: false };
    }

    return mesh.getPeerConnectionInfo(peerRecord.peerId);
  }

  async getChatDiagnostics(peerOwnerId?: string): Promise<ChatDiagnostics> {
    const mesh = this._reachableMesh();
    const config = await this.getNodeConfig();
    return buildChatDiagnostics({
      mesh,
      nodeOnline: Boolean(mesh && this._nodeStatus === "running"),
      localPeerId: mesh?.peerId ?? "",
      profileDir: this._profileDir,
      config: await this._configStore.load(),
      relayEnabled: config.relayEnabled,
      relayClientSchedulerActive: Boolean(this._stopRelayClientScheduler),
      relayBootstrapPeers: this._relayBootstrapPeers,
      configStore: this._configStore,
      peerDirectoryStore: this._peerDirectoryStore,
      discoverySeedStore: this._discoverySeedStore,
      peerOwnerId,
    });
  }

  async knowledgeQuery(question: string): Promise<string> {
    console.log(`[knowledgeQuery] called with question: ${question.substring(0, 50)}...`);
    if (!this._mesh || !this._profile) {
      throw new Error("Node not initialized");
    }

    if (!this._taskStore) {
      throw new Error("Task store not initialized");
    }

    const kqPayload = createKnowledgeQueryPayload({ query: question });
    const unsignedEnvelope = createUnsignedEnvelope({
      senderPeerId: this._mesh.peerId,
      senderPublicKey: this._profile.device.publicKeyPem,
      senderRole: "agent",
      intent: "knowledge.query",
      payload: kqPayload,
    });
    const envelope = signUnsignedEnvelope(unsignedEnvelope, this._profile.device.privateKeyPem) as EnvoyEnvelope;

    const nodeConfig = await this.getNodeConfig();
    console.log(`[knowledgeQuery] nodeConfig.modelProviders.mode=${nodeConfig.modelProviders.mode}`);

    const result = await handleInboundKnowledgeQuery({
      envelope,
      remotePeerId: this._mesh.peerId,
      receivedAt: Date.now(),
      correlationId: envelope.messageId,
      taskStore: this._taskStore,
      trustStore: this._trustStore,
      peerDirectoryStore: this._peerDirectoryStore,
      profile: this._profile,
      vaultIndex: null,
      modelProviders: nodeConfig.modelProviders,
      isLocalSelfQuery: true,
      ownerApproved: true, // Local owner queries are implicitly approved
    });

    if (!result.ok) {
      throw new Error(result.reason);
    }

    return result.responsePayload.answer;
  }

  async runDocumentAgentTurn(message: string): Promise<DocumentAgentTurnResult> {
    this.recordOwnerActivity();
    const context = await this.getToolExecutionContext();
    if (!context) {
      throw new Error("Node not initialized");
    }
    return runDocumentAgentTurnLoop({
      message,
      listLibraryItems: (query) => this.listLibraryItems(query ? { query } : undefined),
      getBonds: () => this.getBonds(),
      executeTool: (toolName, params) => executeTool(toolName, params, context),
      knowledgeQuery: (question) => this.knowledgeQuery(question),
      discoverPublishedLibrary: (p) => this.discoverPublishedLibrary(p),
      sendChat: (targetOwnerId, text) => this.sendChat(targetOwnerId, text),
    });
  }

  // ============================================
  // Agent tool execution context (mesh.library_*, etc.)
  // ============================================

  /**
   * Ensure persisted agent identity for tool signing (bridge file or lazy create).
   */
  private async _ensureAgentIdentity(): Promise<BridgeIdentity | null> {
    const profile = this._profile;
    if (!profile) return null;
    let identity = await loadBridgeIdentity(this._profileDir);
    if (identity) return identity;
    const agent = generateAgentIdentity(profile.owner.ownerId);
    identity = {
      agentPeerId: agent.agentPeerId,
      agentPublicKeyPem: agent.publicKeyPem,
      agentPrivateKeyPem: agent.privateKeyPem,
      ownerId: profile.owner.ownerId,
      agentCredential: createAgentCredential({
        owner: profile.owner,
        agent,
        scope: [...NATIVE_AGENT_TOOL_SCOPE],
      }),
    };
    await saveBridgeIdentity(this._profileDir, identity);
    return identity;
  }

  /**
   * Build {@link MeshToolContext} for native Envoy AI and optional bridge agents.
   */
  async getToolExecutionContext(): Promise<MeshToolContext | null> {
    if (!this._taskStore) return null;
    const profile = this._profile;
    if (!profile) return null;
    const agentIdentity = await this._ensureAgentIdentity();
    if (!agentIdentity) return null;
    const config = await this._configStore.load();
    let humanProfileSummary: { displayName?: string; bio?: string } | undefined;
    try {
      const hp = await this._humanProfileStore.loadHumanProfile();
      if (hp) humanProfileSummary = { displayName: hp.displayName, bio: hp.bio };
    } catch { /* ignore */ }
    const documentAutonomy = normalizeDocumentAutonomyPolicy(config?.aiSettings?.documentAutonomy);
    return {
      trustStore: this._trustStore,
      peerDirectoryStore: this._peerDirectoryStore,
      taskStore: this._taskStore,
      agentIdentity: {
        agentId: agentIdentity.agentCredential.agentId,
        agentPeerId: agentIdentity.agentPeerId,
        privateKeyPem: agentIdentity.agentPrivateKeyPem,
        publicKeyPem: agentIdentity.agentPublicKeyPem,
      },
      ownerIdentity: { ownerId: profile.owner.ownerId },
      agentCredential: agentIdentity.agentCredential,
      mesh: this._mesh,
      trustIntro: {
        trustModeEnabled: config?.trustModeEnabled ?? false,
        friendMatchingPreferencesText: config?.friendMatchingPreferencesText,
        humanProfileSummary,
      },
      listLibraryItems: () => this.listLibraryItems(),
      discoverPublishedLibrary: (p) =>
        this.discoverPublishedLibrary(p as DiscoverPublishedLibraryParams | undefined),
      exportLibraryItemToIpfs: (documentId) => this.exportLibraryItemToIpfs(documentId),
      verifyLibraryItemIpfsGateway: (p) => this.verifyLibraryItemIpfsGateway(p),
      setLibraryItemPublished: (documentId, published) => this.setLibraryItemPublished(documentId, published),
      submitAgentShareProposal: (params) => this.submitAgentShareProposal(params),
      getBonds: () => this.getBonds(),
      sendChat: (targetOwnerId, text) => this.sendChat(targetOwnerId, text),
      listActiveTransfers: () => this.listActiveTransfers(),
      getTransferStatus: (correlationId) => this.getTransferStatus(correlationId),
      listPendingShareOffers: () => this.listPendingShareOffers(),
      listAgentShareProposals: () => this.listAgentShareProposals(),
      documentAutonomy,
      shareFile: (params) =>
        this.shareFile(params.targetOwnerId, {
          path: params.vaultRelativePath,
          sensitivity: params.sensitivity,
        }),
    };
  }

  /**
   * @deprecated Prefer {@link getToolExecutionContext} — alias for bridge-era callers.
   */
  async getMeshToolContext(): Promise<MeshToolContext | null> {
    return this.getToolExecutionContext();
  }

  // ============================================
  // Internal: Emit events to listeners
  // ============================================

  emit<K extends keyof NodeServiceEvents>(event: K, data: NodeServiceEvents[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }

  // ============================================
  // Activity Tracking
  // ============================================

  private lastActivityTimestamp: number = Date.now();
  private readonly activityTimeoutMs: number = 5 * 60 * 1000; // 5 minutes

  recordOwnerActivity(): void {
    this.lastActivityTimestamp = Date.now();
    void this.logOwnerActivityRecorded();
  }

  private async logOwnerActivityRecorded(): Promise<void> {
    const online = await this.isOwnerOnline();
    console.log(`[activity] owner activity recorded, isOnline=${online}`);
  }

  async isOwnerOnline(): Promise<boolean> {
    const config = await this._configStore.load();
    const aiSettings = config?.aiSettings;
    const status = aiSettings?.status;

    if (!status) return true; // Default to online if no status configured

    if (status.statusMode === "manual") {
      return status.isOnlineManual ?? true;
    }

    // Automatic mode: online if had activity within timeout
    return Date.now() - this.lastActivityTimestamp < this.activityTimeoutMs;
  }
}

/**
 * Creates a NodeService instance.
 */
export function createNodeService(
  mesh: EnvoyMesh | undefined,
  trustStore: LocalTrustStore,
  peerDirectoryStore: LocalPeerDirectoryStore,
  humanProfileStore: HumanProfileStore,
  profileDir: string,
  profile?: NodeProfile,
  vaultDir?: string,
): NodeService {
  return new NodeServiceImpl(
    mesh,
    trustStore,
    peerDirectoryStore,
    humanProfileStore,
    profileDir,
    profile,
    vaultDir,
  );
}

// Export the class for testing
export { NodeServiceImpl };