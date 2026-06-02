/**
 * Shared helpers for Phase 13 E2E tests (NodeServiceImpl + EnvoyMesh).
 */
import {
  createAgentCredential,
  createDeviceCertificate,
  deriveDeviceId,
  derivePeerId,
  generateAgentIdentity,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createAgentCardStore,
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createTaskRuntimeStateStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createChatMessagePayload,
  createKnowledgeResponsePayload,
  createUnsignedEnvelope,
  parseKnowledgeQueryPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { ApprovalQueue, isA2ATaskIntent } from "@envoymesh/api";
import { EnvoyMesh } from "@envoymesh/network";
import type { ModelProviderConfig } from "@envoymesh/api";
import { buildVaultIndex } from "@envoymesh/vault";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBridgeIdentity, saveBridgeIdentity } from "../src/bridge/identity-store.js";
import type { BridgeIdentity } from "../src/bridge/pipe.js";
import { handleDaemonAgentCardInbound } from "../src/daemon-agent-card-inbound.js";
import { handleDaemonTaskInbound } from "../src/daemon-task-inbound.js";
import { createInboundMessageGuard } from "../src/inbound-guard.js";
import { handleInboundKnowledgeQuery } from "../src/knowledge-query-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

export const phase13Meshes: EnvoyMesh[] = [];
export const phase13ProfileDirs: string[] = [];

export interface Phase13TestNode {
  profileDir: string;
  vaultDir: string;
  profile: NodeProfile;
  mesh: EnvoyMesh;
  taskStore: ReturnType<typeof createLocalTaskStore>;
  taskRuntimeStore: ReturnType<typeof createTaskRuntimeStateStore>;
  trustStore: ReturnType<typeof createLocalTrustStore>;
  peerDirectory: ReturnType<typeof createLocalPeerDirectoryStore>;
  human: ReturnType<typeof createHumanProfileStore>;
  service: NodeServiceImpl;
}

export async function startPhase13Mesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({ listen: ["/ip4/127.0.0.1/tcp/0"], enableMdns: false });
  await mesh.start();
  phase13Meshes.push(mesh);
  return mesh;
}

export function phase13TestProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send", "task.execute"],
    }),
  };
}

export async function createPhase13TestNode(): Promise<Phase13TestNode> {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-phase13-"));
  phase13ProfileDirs.push(profileDir);
  const vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });

  const profile = phase13TestProfile();
  const mesh = await startPhase13Mesh();
  const taskStore = createLocalTaskStore(profileDir);
  const taskRuntimeStore = createTaskRuntimeStateStore(profileDir);
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  const service = new NodeServiceImpl(
    mesh,
    trustStore,
    peerDirectory,
    human,
    profileDir,
    profile,
    vaultDir,
  );
  service.bindCliTaskStore(taskStore);
  service.bindExternalMesh(mesh);
  return { profileDir, vaultDir, profile, mesh, taskStore, taskRuntimeStore, trustStore, peerDirectory, human, service };
}

export async function registerBondedPeer(
  local: Phase13TestNode,
  remote: Phase13TestNode,
  displayName: string,
): Promise<void> {
  await local.trustStore.setTrustRecord({
    peerOwnerId: remote.profile.owner.ownerId,
    level: "direct",
    displayName,
  });
  const peerDirectoryPath = join(local.profileDir, "peer-directory.json");
  let records: Array<{
    version: "0.1";
    ownerId: string;
    peerId: string;
    deviceId: string;
    devicePublicKeyPem: string;
    lastSeenAt: string;
    listenAddrs: string[];
  }> = [];
  try {
    const existing = JSON.parse(await readFile(peerDirectoryPath, "utf8")) as {
      records?: typeof records;
    };
    records = existing.records ?? [];
  } catch {
    records = [];
  }
  const nextRecord = {
    version: "0.1" as const,
    ownerId: remote.profile.owner.ownerId,
    peerId: remote.mesh.peerId,
    deviceId: deriveDeviceId(remote.profile.device.publicKeyPem),
    devicePublicKeyPem: remote.profile.device.publicKeyPem,
    lastSeenAt: new Date().toISOString(),
    listenAddrs: remote.mesh.multiaddrs.map(String),
  };
  const withoutOwner = records.filter((row) => row.ownerId !== remote.profile.owner.ownerId);
  await writeFile(
    peerDirectoryPath,
    JSON.stringify({ version: "0.1", records: [...withoutOwner, nextRecord] }, null, 2),
    { mode: 0o600 },
  );
}

/** Persist bridge agent identity (required for requestAgentCard / agent.card). */
export async function ensureBridgeIdentity(node: Phase13TestNode): Promise<BridgeIdentity> {
  const existing = await loadBridgeIdentity(node.profileDir);
  if (existing) return existing;
  const agent = generateAgentIdentity(node.profile.owner.ownerId);
  const identity: BridgeIdentity = {
    agentPeerId: agent.agentPeerId,
    agentPublicKeyPem: agent.publicKeyPem,
    agentPrivateKeyPem: agent.privateKeyPem,
    ownerId: node.profile.owner.ownerId,
    agentCredential: createAgentCredential({
      owner: node.profile.owner,
      agent,
      scope: [
        "message.send",
        "task.execute",
        "agent.card.request",
        "agent.card.response",
        "task.mandate",
        "task.propose",
        "task.negotiate",
        "task.accept",
        "task.result",
        "report.create",
      ],
    }),
  };
  await saveBridgeIdentity(node.profileDir, identity);
  return identity;
}

/** Mirror `apps/node/src/index.ts` agent.card inbound path on the test mesh. */
export function wireProductionAgentCardHandlers(
  node: Phase13TestNode,
  bridgeIdentity: BridgeIdentity,
): void {
  wireFullDaemonAgentCardHandlers(node, bridgeIdentity);
}

/** Daemon agent.card path with inbound guard (matches production `index.ts` wiring). */
export function wireFullDaemonAgentCardHandlers(
  node: Phase13TestNode,
  bridgeIdentity: BridgeIdentity,
  opts?: { inboundGuard?: ReturnType<typeof createInboundMessageGuard> },
): void {
  const agentCardStore = createAgentCardStore(node.profileDir);
  const guard = opts?.inboundGuard ?? createInboundMessageGuard();

  node.mesh.onMessage(async ({ envelope: inboundEnvelope, remotePeerId }) => {
    const guardDecision = guard.inspect(inboundEnvelope);
    if (guardDecision.action === "reject") return;
    const envelope = guardDecision.envelope;
    if (!verifyInboundEnvelope(envelope)) return;

    const result = await handleDaemonAgentCardInbound({
      envelope,
      profile: node.profile,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: envelope.correlationId,
      taskStore: node.taskStore,
      trustStore: node.trustStore,
      agentCardStore,
      humanProfileStore: node.human,
      bridgeIdentity,
      mesh: node.mesh,
      nodeService: node.service,
    });
    void result;
  });
}

export function wireNodeServiceInboundHandlers(
  node: Phase13TestNode,
  opts?: { approvalQueue?: ApprovalQueue },
): void {
  if (opts?.approvalQueue) {
    node.service.bindApprovalQueue(opts.approvalQueue);
  }
  const internal = node.service as NodeServiceImpl & {
    _inboundGuard?: ReturnType<typeof createInboundMessageGuard>;
    _wireMeshEvents?: () => void;
  };
  internal._inboundGuard = createInboundMessageGuard();
  internal._wireMeshEvents();
}

export async function deliverHumanChat(
  from: Phase13TestNode,
  to: Phase13TestNode,
  text: string,
  messageId?: string,
): Promise<void> {
  const envelope = signedHumanChatEnvelope(from, to.mesh, text, messageId);
  await from.mesh.sendChat(to.mesh.multiaddrs[0]!, envelope);
}

export async function deliverAgentChat(
  fromAgent: {
    agentPeerId: string;
    publicKeyPem: string;
    privateKeyPem: string;
    ownerId: string;
    credential: import("@envoymesh/protocol").AgentCredential;
  },
  fromMesh: EnvoyMesh,
  to: Phase13TestNode,
  text: string,
  messageId = "chat-agent-1",
): Promise<void> {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: fromAgent.agentPeerId,
    senderPublicKey: fromAgent.publicKeyPem,
    senderRole: "agent",
    recipientPeerId: to.mesh.peerId,
    recipientRole: "human",
    intent: "chat.message",
    payload: createChatMessagePayload({
      senderOwnerId: fromAgent.ownerId,
      text,
    }),
    agentCredential: fromAgent.credential,
    messageId,
    createdAt: new Date().toISOString(),
  });
  const signed = signUnsignedEnvelope(unsigned, fromAgent.privateKeyPem);
  await fromMesh.sendChat(to.mesh.multiaddrs[0]!, signed);
}

export function signedHumanChatEnvelope(
  sender: Phase13TestNode,
  recipientMesh: EnvoyMesh,
  text: string,
  messageId = "chat-human-1",
): EnvoyEnvelope {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(sender.profile.device.publicKeyPem),
    senderPublicKey: sender.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: recipientMesh.peerId,
    recipientRole: "human",
    intent: "chat.message",
    payload: createChatMessagePayload({
      senderOwnerId: sender.profile.owner.ownerId,
      text,
    }),
    messageId,
    createdAt: new Date().toISOString(),
  });
  return signUnsignedEnvelope(unsigned, sender.profile.device.privateKeyPem);
}

/** Production A2A task inbound path (runtime gate + Activity hooks). */
export async function simulateDaemonTaskInbound(
  receiver: Phase13TestNode,
  envelope: EnvoyEnvelope,
  remotePeerId: string,
): Promise<void> {
  await handleDaemonTaskInbound({
    envelope,
    remotePeerId,
    receivedAt: Date.now(),
    correlationId: envelope.correlationId,
    taskStore: receiver.taskStore,
    taskRuntimeStore: receiver.taskRuntimeStore,
    nodeService: receiver.service,
    senderOwnerId: envelope.agentCredential?.ownerId,
  });
}

/** Wire production task inbound handler on the test mesh. */
export function wireFullDaemonTaskInboundHandler(receiver: Phase13TestNode): void {
  receiver.mesh.onMessage(async ({ envelope, remotePeerId }) => {
    if (!isA2ATaskIntent(envelope.intent)) return;
    await simulateDaemonTaskInbound(receiver, envelope, remotePeerId);
  });
}

/** @deprecated Use wireFullDaemonTaskInboundHandler */
export function wireDaemonTaskInboundHandler(receiver: Phase13TestNode): void {
  wireFullDaemonTaskInboundHandler(receiver);
}

export async function waitForPhase13(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitForPhase13 timeout");
}

/** Dial every test node to every other (full mesh for small E2E clusters). */
export async function connectPhase13Peers(...nodes: Phase13TestNode[]): Promise<void> {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = 0; j < nodes.length; j += 1) {
      if (i === j) continue;
      const local = nodes[i]!;
      const remote = nodes[j]!;
      await local.mesh.probePeer(remote.mesh.multiaddrs[0]!);
    }
  }
}

/** Bond acquirer to each publisher and wire discovery/share handlers for acquisition E2E. */
export async function wirePhase13AcquisitionCluster(
  acquirer: Phase13TestNode,
  publishers: Array<{ node: Phase13TestNode; displayName: string }>,
): Promise<void> {
  for (const { node, displayName } of publishers) {
    await registerBondedPeer(acquirer, node, displayName);
    await registerBondedPeer(node, acquirer, "Acquirer");
    wireDiscoveryAndShareForAcquisition(node, acquirer);
  }
}

export async function cleanupPhase13Node(node: Phase13TestNode): Promise<void> {
  await node.mesh.stop().catch(() => {});
  await rm(node.profileDir, { recursive: true, force: true }).catch(() => {});
  const meshIdx = phase13Meshes.indexOf(node.mesh);
  if (meshIdx >= 0) phase13Meshes.splice(meshIdx, 1);
  const dirIdx = phase13ProfileDirs.indexOf(node.profileDir);
  if (dirIdx >= 0) phase13ProfileDirs.splice(dirIdx, 1);
}

export async function cleanupPhase13Harness(): Promise<void> {
  await Promise.all(phase13Meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(
    phase13ProfileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true }).catch(() => {})),
  );
}

import { handleInboundSocialIntroIntent } from "../src/social-intro-inbound.js";
import { handleInboundDiscoveryIntent } from "../src/discovery-inbound.js";
import {
  createDiscoveryResponsePayload,
  createSharePreviewPayload,
  parseShareAcceptPayload,
  parseSharePreviewPayload,
  parseShareRequestPayload,
} from "@envoymesh/protocol";
import { handleInboundShareRequest } from "../src/share-inbound.js";
import { installEnvoyDataTransferReceiver } from "../src/data-transfer-inbound.js";

export async function ensureSocialProxyBridgeIdentity(node: Phase13TestNode): Promise<BridgeIdentity> {
  const existing = await loadBridgeIdentity(node.profileDir);
  if (existing) return existing;
  const agent = generateAgentIdentity(node.profile.owner.ownerId);
  const identity: BridgeIdentity = {
    agentPeerId: agent.agentPeerId,
    agentPublicKeyPem: agent.publicKeyPem,
    agentPrivateKeyPem: agent.privateKeyPem,
    ownerId: node.profile.owner.ownerId,
    agentCredential: createAgentCredential({
      owner: node.profile.owner,
      agent,
      scope: [
        "message.send",
        "chat.message",
        "discovery.request",
        "social.intro.sync",
        "social.intro.propose",
        "bond.request",
      ],
    }),
  };
  await saveBridgeIdentity(node.profileDir, identity);
  return identity;
}

export function wireSocialIntroHandlers(node: Phase13TestNode, trustModeEnabled = true): void {
  node.mesh.onMessage(async ({ envelope, remotePeerId }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (
      envelope.intent !== "social.intro.sync" &&
      envelope.intent !== "social.intro.propose" &&
      envelope.intent !== "social.intro.owner-ready"
    ) {
      return;
    }
    const intro = await handleInboundSocialIntroIntent({
      envelope,
      profile: node.profile,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: envelope.correlationId,
      taskStore: node.taskStore,
      trustStore: node.trustStore,
      peerDirectoryStore: node.peerDirectory,
      trustModeEnabled,
      onSocialIntroPropose: (data) => {
        const svc = node.service as NodeServiceImpl;
        svc.storePendingSocialIntroProposal({ ...data, commitmentApproved: false });
      },
      onSocialIntroOwnerReady: (data) => {
        void (node.service as NodeServiceImpl).handleSocialProxyPeerOwnerReady(data);
      },
    });
    void intro;
  });
}

export function wireDiscoveryAndShareForAcquisition(
  publisher: Phase13TestNode,
  acquirer: Phase13TestNode,
): void {
  publisher.mesh.onMessage(async ({ envelope, remotePeerId, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope)) return;

    if (envelope.intent === "discovery.request") {
      const discovery = await handleInboundDiscoveryIntent({
        envelope,
        profile: publisher.profile,
        remotePeerId,
        receivedAt: Date.now(),
        correlationId: envelope.correlationId,
        taskStore: publisher.taskStore,
        trustStore: publisher.trustStore,
        anonymousDiscoveryMode: "off",
        vaultDir: publisher.vaultDir,
        profileDir: publisher.profileDir,
      });
      if (!discovery.ok || !discovery.responsePayload || !replyWithEnvelope) return;
      const unsignedResponse = createUnsignedEnvelope({
        senderPeerId: derivePeerId(publisher.profile.device.publicKeyPem),
        senderPublicKey: publisher.profile.device.publicKeyPem,
        recipientPeerId: envelope.senderPeerId,
        intent: "discovery.response",
        payload: createDiscoveryResponsePayload(discovery.responsePayload),
        correlationId: envelope.correlationId,
      });
      const signedResponse = signUnsignedEnvelope(unsignedResponse, publisher.profile.device.privateKeyPem);
      await replyWithEnvelope(signedResponse);
      return;
    }

    if (envelope.intent === "share.request") {
      const share = await handleInboundShareRequest({
        envelope,
        remotePeerId,
        receivedAt: Date.now(),
        correlationId: envelope.correlationId,
        taskStore: publisher.taskStore,
        trustStore: publisher.trustStore,
        peerDirectoryStore: publisher.peerDirectory,
        profile: publisher.profile,
        vaultIndex: null,
        vaultDir: publisher.vaultDir,
        modelProviders: { mode: "mock" },
      });
      if (!share.ok) return;

      const unsignedResponse = createUnsignedEnvelope({
        senderPeerId: derivePeerId(publisher.profile.device.publicKeyPem),
        senderPublicKey: publisher.profile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: envelope.senderPeerId,
        recipientRole: "human",
        intent: "share.preview",
        payload: createSharePreviewPayload(share.responsePayload),
        correlationId: envelope.correlationId,
      });
      const signedResponse = signUnsignedEnvelope(unsignedResponse, publisher.profile.device.privateKeyPem);
      await publisher.mesh.send(remotePeerId, signedResponse);

      let shareRequestPayload: ReturnType<typeof parseShareRequestPayload> | null = null;
      try {
        shareRequestPayload = parseShareRequestPayload(envelope.payload);
      } catch {
        shareRequestPayload = null;
      }
      if (shareRequestPayload?.requestType === "file" && shareRequestPayload.fileOrigin === "responder") {
        publisher.service.registerResponderFileSendAfterPreview(
          signedResponse.messageId,
          shareRequestPayload.relativePath,
          remotePeerId,
        );
      }
      return;
    }

    if (envelope.intent === "share.accept") {
      try {
        const acc = parseShareAcceptPayload(envelope.payload);
        if (!acc.accept) {
          publisher.service.clearPendingShareStateForPreview(acc.inReplyTo);
          return;
        }
      } catch {
        return;
      }
      await publisher.service.maybeSendShareFileForInboundAccept({
        envelope,
        remotePeerId,
        taskStore: publisher.taskStore,
        vaultDir: publisher.vaultDir,
      });
    }
  });

  acquirer.mesh.onMessage(async ({ envelope, remotePeerId }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent !== "share.preview") return;
    try {
      const preview = parseSharePreviewPayload(envelope.payload);
      if (!preview.isFileTransfer || preview.refused) return;
      const recorded = acquirer.service.recordInboundPullSharePreview({
        previewMessageId: envelope.messageId,
        inReplyToRequestMsgId: preview.inReplyTo,
        senderPeerId: remotePeerId,
        previewText: preview.previewText,
        sensitivity: preview.sensitivity as "public" | "friends" | "private",
      });
      if (!recorded) {
        acquirer.service.linkOutboundSharePreviewFromInbound(envelope.messageId, preview.inReplyTo);
      }
    } catch {
      /* ignore */
    }
  });

  installEnvoyDataTransferReceiver({
    mesh: acquirer.mesh,
    peerDirectoryStore: acquirer.peerDirectory,
    taskStore: acquirer.taskStore,
    vaultDir: acquirer.vaultDir,
    resolveInboundRelativePath: (remotePeerId, voucherRelativePath) =>
      acquirer.service.resolveInboundDataTransferRelativePath(remotePeerId, voucherRelativePath),
    onInboundVaultWriteCommitted: (remotePeerId, voucherSourceRelativePath) =>
      acquirer.service.consumeInboundDataTransferSaveMapping(remotePeerId, voucherSourceRelativePath),
    onInboundTransferVerified: (input) => acquirer.service.notifyInboundTransferVerified(input),
  });
}

/**
 * Wait until vector RAG has finished indexing the local vault (for E2E).
 */
export async function primeLocalVaultRagIndex(node: Phase13TestNode): Promise<void> {
  await waitForPhase13(async () => {
    const status = await node.service.getRagIndexStatus();
    return status.progress.phase === "done" && status.progress.indexed > 0;
  }, 20_000);
}

/**
 * Full inbound knowledge.query handler (vault RAG + mock model) for E2E tests.
 */
export async function wireInboundKnowledgeQueryReply(
  publisher: Phase13TestNode,
  modelProviders: ModelProviderConfig = { mode: "mock" },
): Promise<void> {
  publisher.mesh.onMessage(async ({ envelope, remotePeerId, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope) || envelope.intent !== "knowledge.query") return;
    const vaultIndex = await buildVaultIndex({ rootDir: publisher.vaultDir });
    const result = await handleInboundKnowledgeQuery({
      envelope,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: envelope.correlationId ?? `kq-${Date.now()}`,
      taskStore: publisher.taskStore,
      trustStore: publisher.trustStore,
      peerDirectoryStore: publisher.peerDirectory,
      profile: publisher.profile,
      vaultIndex,
      modelProviders,
    });
    if (!replyWithEnvelope) return;
    const refused = !result.ok || (result.responsePayload?.refused ?? false);
    const unsignedResponse = createUnsignedEnvelope({
      senderPeerId: derivePeerId(publisher.profile.device.publicKeyPem),
      senderPublicKey: publisher.profile.device.publicKeyPem,
      senderRole: envelope.recipientRole === "agent" ? "agent" : "human",
      recipientPeerId: envelope.senderPeerId,
      recipientRole: envelope.senderRole,
      intent: "knowledge.response",
      payload: createKnowledgeResponsePayload({
        inReplyTo: envelope.messageId,
        answer: refused
          ? `Sorry: ${result.responsePayload?.refusalReason ?? "error"}`
          : (result.ok ? (result.responsePayload?.answer ?? "No answer") : "Error"),
        sensitivity: "public",
        refused,
      }),
      correlationId: envelope.correlationId,
    });
    await replyWithEnvelope(
      signUnsignedEnvelope(unsignedResponse, publisher.profile.device.privateKeyPem),
    );
  });
}

/**
 * Deterministic knowledge.response for document-acquisition negotiation E2E
 * (path on first line, as structured acquisition queries expect).
 */
export function wireDocumentAcquisitionKnowledgeReply(
  publisher: Phase13TestNode,
  relativePath: string,
  matchSummary = "This published library item matches the acquisition request.",
): void {
  publisher.mesh.onMessage(async ({ envelope, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope) || envelope.intent !== "knowledge.query") return;
    if (!replyWithEnvelope) return;
    try {
      const payload = parseKnowledgeQueryPayload(envelope.payload);
      if (
        !payload.query.includes("Document acquisition") &&
        !payload.query.includes("metadata only")
      ) {
        return;
      }
    } catch {
      return;
    }
    const unsignedResponse = createUnsignedEnvelope({
      senderPeerId: derivePeerId(publisher.profile.device.publicKeyPem),
      senderPublicKey: publisher.profile.device.publicKeyPem,
      senderRole: envelope.recipientRole === "agent" ? "agent" : "human",
      recipientPeerId: envelope.senderPeerId,
      recipientRole: envelope.senderRole,
      intent: "knowledge.response",
      payload: createKnowledgeResponsePayload({
        inReplyTo: envelope.messageId,
        answer: `${relativePath}\n${matchSummary}`,
        suggestedRelativePath: relativePath,
        sensitivity: "friends",
        refused: false,
      }),
      correlationId: envelope.correlationId,
    });
    await replyWithEnvelope(
      signUnsignedEnvelope(unsignedResponse, publisher.profile.device.privateKeyPem),
    );
  });
}

/**
 * Document-acquisition reply using only `suggestedRelativePath` (no path in answer text).
 */
export function wireDocumentAcquisitionKnowledgeSuggestedPathOnly(
  publisher: Phase13TestNode,
  relativePath: string,
  matchSummary = "This published library item matches the acquisition request.",
): void {
  publisher.mesh.onMessage(async ({ envelope, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope) || envelope.intent !== "knowledge.query") return;
    if (!replyWithEnvelope) return;
    try {
      const payload = parseKnowledgeQueryPayload(envelope.payload);
      if (
        !payload.query.includes("Document acquisition") &&
        !payload.query.includes("metadata only")
      ) {
        return;
      }
    } catch {
      return;
    }
    const unsignedResponse = createUnsignedEnvelope({
      senderPeerId: derivePeerId(publisher.profile.device.publicKeyPem),
      senderPublicKey: publisher.profile.device.publicKeyPem,
      senderRole: envelope.recipientRole === "agent" ? "agent" : "human",
      recipientPeerId: envelope.senderPeerId,
      recipientRole: envelope.senderRole,
      intent: "knowledge.response",
      payload: createKnowledgeResponsePayload({
        inReplyTo: envelope.messageId,
        answer: matchSummary,
        suggestedRelativePath: relativePath,
        sensitivity: "friends",
        refused: false,
      }),
      correlationId: envelope.correlationId,
    });
    await replyWithEnvelope(
      signUnsignedEnvelope(unsignedResponse, publisher.profile.device.privateKeyPem),
    );
  });
}

/**
 * Always refuse document-acquisition knowledge.query negotiation rounds.
 */
export function wireDocumentAcquisitionKnowledgeRefusal(publisher: Phase13TestNode): void {
  publisher.mesh.onMessage(async ({ envelope, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope) || envelope.intent !== "knowledge.query") return;
    if (!replyWithEnvelope) return;
    try {
      const payload = parseKnowledgeQueryPayload(envelope.payload);
      if (
        !payload.query.includes("Document acquisition") &&
        !payload.query.includes("metadata only")
      ) {
        return;
      }
    } catch {
      return;
    }
    const unsignedResponse = createUnsignedEnvelope({
      senderPeerId: derivePeerId(publisher.profile.device.publicKeyPem),
      senderPublicKey: publisher.profile.device.publicKeyPem,
      senderRole: envelope.recipientRole === "agent" ? "agent" : "human",
      recipientPeerId: envelope.senderPeerId,
      recipientRole: envelope.senderRole,
      intent: "knowledge.response",
      payload: createKnowledgeResponsePayload({
        inReplyTo: envelope.messageId,
        answer: "no match",
        sensitivity: "friends",
        refused: false,
      }),
      correlationId: envelope.correlationId,
    });
    await replyWithEnvelope(
      signUnsignedEnvelope(unsignedResponse, publisher.profile.device.privateKeyPem),
    );
  });
}

export function chatAssistApprovalConfig(ownerId: string, peerOwnerId: string) {
  return {
    chatAssistEnabled: true,
    autonomousKillSwitch: true,
    autonomousPolicies: [
      { domain: "social" as const, maxSensitivity: "friends" as const, autoAnswer: true, autoSendChat: true },
    ],
    contactAiPreferences: [{ peerOwnerId, aiAccessLevel: "full" as const }],
    modelProviders: { mode: "mock" as const },
    aiSettings: {
      status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" as const },
      identity: { mode: "transparent" as const },
      defaultModeForNewContacts: "manual" as const,
      rules: [
        {
          id: "greet",
          enabled: true,
          name: "Greet",
          category: "availability" as const,
          priority: 1,
          trigger: { isGreeting: true },
          action: { type: "draft" as const, template: "Hi there, thanks for your message!" },
        },
      ],
    },
  };
}
