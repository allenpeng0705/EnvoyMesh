import {
  analyzeConnectivityStageD,
  buildRelayManagerSnapshot,
  buildMorningReportDigest,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createAuditEvent,
  loadOrCreateNodeProfile,
  type ApprovalRequest,
  type AuditEvent,
  type TrustRecord,
} from "@envoymesh/local-store";
import {
  createDeviceCertificate,
  createProofOfIntent,
  derivePeerId,
  signMandate,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import { ENVOY_CHAT_PROTOCOL, ENVOY_MESSAGE_PROTOCOL, EnvoyMesh } from "@envoymesh/network";
import {
  createChatMessagePayload,
  createDevicePairApprovePayload,
  createDevicePairDeferredPayload,
  createDevicePairRequestPayload,
  createTaskNegotiatePayload,
  createTaskProposePayload,
  createUnsignedEnvelope,
  createUnsignedMandate,
  type Capability,
  type Mandate,
} from "@envoymesh/protocol";
import {
  buildVaultIndex,
  searchVault,
  type VaultIndex,
} from "@envoymesh/vault";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  DashboardConfig,
  DashboardSnapshot,
  LiveP2pSnapshot,
  ObservedPeerSummary,
  SetTrustRecordRequest,
  SendChatRequest,
  SendPairingRequest,
  SendTaskNegotiateRequest,
  SendTaskProposalRequest,
  OutboundSendResult,
  VaultSearchHit,
  VaultSummary,
} from "../shared/dashboard.js";

let lastTaskComposerMandate: { taskId: string; mandate: Mandate } | undefined;

export function createDashboardConfig(env: NodeJS.ProcessEnv = process.env): DashboardConfig {
  const workspaceRoot = findEnvoyMeshWorkspaceRoot(env);

  return {
    profileDir: resolvePathOrWorkspaceRelative(env.ENVOYMESH_PROFILE, "data/default", workspaceRoot),
    vaultDir: resolvePathOrWorkspaceRelative(env.ENVOYMESH_VAULT, "shared_vault", workspaceRoot),
  };
}

function resolvePathOrWorkspaceRelative(
  value: string | undefined,
  workspaceRelativeDefault: string,
  workspaceRoot: string,
): string {
  if (!value) {
    return join(workspaceRoot, workspaceRelativeDefault);
  }

  return resolve(value);
}

function findEnvoyMeshWorkspaceRoot(env: NodeJS.ProcessEnv): string {
  const explicit = env.ENVOYMESH_WORKSPACE;
  if (explicit) {
    return resolve(explicit);
  }

  const mainDirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  const searchRoots = [
    process.cwd(),
    resolve(join(mainDirname, "..", "..", "..")),
    resolve(join(mainDirname, "..", "..", "..", "..")),
  ];

  for (const start of searchRoots) {
    const root = walkUpForPackageRoot(start);
    if (root) {
      return root;
    }
  }

  return process.cwd();
}

function walkUpForPackageRoot(startDir: string): string | undefined {
  let current = resolve(startDir);

  for (let depth = 0; depth < 12; depth += 1) {
    const packagePath = join(current, "package.json");
    if (existsSync(packagePath)) {
      try {
        const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { name?: string };
        if (parsed.name === "envoy-mesh") {
          return current;
        }
      } catch {
        // ignore invalid package.json
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }

  return undefined;
}

export async function getDashboardSnapshot(config: DashboardConfig): Promise<DashboardSnapshot> {
  const profile = await loadOrCreateNodeProfile(config.profileDir);
  const taskStore = createLocalTaskStore(config.profileDir);
  const trustStore = createLocalTrustStore(config.profileDir);
  const [approvals, trustRecords, auditEvents, taskJournalEntries, vaultIndex] = await Promise.all([
    taskStore.readApprovalRequests(),
    trustStore.listTrustRecords(),
    taskStore.readAuditEvents(),
    taskStore.readTaskJournalEntries(),
    buildVaultIndexOrEmpty(config.vaultDir),
  ]);

  return {
    profile,
    approvals,
    trustRecords,
    auditEvents: auditEvents.slice(-50),
    chatAuditTrail: auditEvents.filter((event) => event.intent === "chat.message").slice(-40),
    pairingTimeline: summarizePairingTimeline(approvals, auditEvents).slice(-80),
    taskJournalEntries: taskJournalEntries.slice(-50),
    observedPeers: summarizeObservedPeers(auditEvents),
    liveP2p: summarizeLiveP2p(auditEvents),
    connectivityHealth: summarizeConnectivityHealth(auditEvents),
    relayManager: buildRelayManagerSnapshot({ profile, auditEvents }),
    morningReport: buildMorningReportDigest({
      trustRecords,
      peerDirectoryRecords: await createLocalPeerDirectoryStore(config.profileDir).listPeerRecords(),
      discoveryEvents: await taskStore.readDiscoveryEvents(),
      limit: 10,
    }),
    vault: summarizeVault(vaultIndex),
  };
}

function summarizePairingTimeline(approvals: ApprovalRequest[], auditEvents: AuditEvent[]) {
  const rows: Array<{
    requestId: string;
    status: "pending" | "approved" | "rejected" | "deferred" | "approved_remote";
    createdAt: string;
    summary: string;
    approvalId?: string;
    remotePeerId?: string;
  }> = [];

  for (const approval of approvals) {
    if (!approval.taskId.startsWith("pairing:")) {
      continue;
    }
    const requestId = approval.taskId.slice("pairing:".length);
    rows.push({
      requestId,
      status: approval.status,
      createdAt: approval.createdAt,
      summary: approval.reason.split("\nPAIRING_CONTEXT:")[0],
      approvalId: approval.approvalId,
    });
  }

  for (const event of auditEvents) {
    if (
      event.intent !== "device.pair.request" &&
      event.intent !== "device.pair.approve" &&
      event.intent !== "device.pair.deferred"
    ) {
      continue;
    }
    let requestId = "unknown";
    const match = event.summary.match(/request ([A-Za-z0-9:_-]+)/);
    if (match) {
      requestId = match[1];
    }
    rows.push({
      requestId,
      status:
        event.intent === "device.pair.deferred"
          ? "deferred"
          : event.intent === "device.pair.approve"
            ? "approved_remote"
            : "pending",
      createdAt: event.createdAt,
      summary: event.summary,
      remotePeerId: event.remotePeerId,
    });
  }

  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function exportPairingTimeline(config: DashboardConfig, outputPath: string): Promise<string> {
  const taskStore = createLocalTaskStore(config.profileDir);
  const [approvals, auditEvents] = await Promise.all([taskStore.readApprovalRequests(), taskStore.readAuditEvents()]);
  const timeline = summarizePairingTimeline(approvals, auditEvents);
  const resolvedOutput = resolve(outputPath);
  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, `${JSON.stringify(timeline, null, 2)}\n`, { mode: 0o600 });
  return resolvedOutput;
}

export function updateApprovalStatus(
  config: DashboardConfig,
  approvalId: string,
  status: ApprovalRequest["status"],
): Promise<ApprovalRequest> {
  if (!approvalId.trim()) {
    throw new Error("approvalId is required");
  }

  return handleApprovalStatusUpdate(config, approvalId, status);
}

async function handleApprovalStatusUpdate(
  config: DashboardConfig,
  approvalId: string,
  status: ApprovalRequest["status"],
): Promise<ApprovalRequest> {
  const taskStore = createLocalTaskStore(config.profileDir);
  const updated = await taskStore.updateApprovalRequestStatus(approvalId, status);

  if (!updated.taskId.startsWith("pairing:")) {
    return updated;
  }

  const context = parsePairingContext(updated.reason);
  if (!context) {
    return updated;
  }

  const profile = await loadOrCreateNodeProfile(config.profileDir);
  const intentPayload =
    status === "approved"
      ? createDevicePairApprovePayload({
          requestId: context.requestId,
          approvalId: updated.approvalId,
          deviceCertificate: createDeviceCertificate({
            owner: profile.owner,
            device: {
              deviceId: context.requesterDeviceId,
              publicKeyPem: context.requesterDevicePublicKeyPem,
              privateKeyPem: "",
            },
            deviceProfile: context.requestedDeviceProfile ?? "satellite",
            capabilities: normalizePairingCapabilities(context.requestedCapabilities),
          }),
        })
      : createDevicePairDeferredPayload({
          requestId: context.requestId,
          deferredByDeviceId: profile.device.deviceId,
          reason: `Owner ${status} pairing request ${context.requestId}.`,
        });

  const intent = status === "approved" ? "device.pair.approve" : "device.pair.deferred";
  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: context.requesterPeerId,
      intent,
      payload: intentPayload,
    }),
    profile.device.privateKeyPem,
  );

  try {
    const latencyMs = await sendSingleEnvelope(context.requesterPeerId, envelope);
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.sent",
        intent,
        messageId: envelope.messageId,
        remotePeerId: context.requesterPeerId,
        direction: "outbound",
        latencyMs,
        protocol: ENVOY_MESSAGE_PROTOCOL,
        outcome: "record",
        summary: `Sent ${intent} for pairing request ${context.requestId}.`,
        createdAt: envelope.createdAt,
      }),
    );
  } catch (error) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.rejected",
        intent,
        messageId: envelope.messageId,
        remotePeerId: context.requesterPeerId,
        direction: "outbound",
        verificationStatus: "rejected",
        outcome: "deny",
        summary: `Deferred pairing response delivery: ${error instanceof Error ? error.message : String(error)}`,
        createdAt: envelope.createdAt,
      }),
    );
    await taskStore.updateApprovalRequestStatus(updated.approvalId, "pending");
  }

  return updated;
}

export function setTrustRecord(
  config: DashboardConfig,
  request: SetTrustRecordRequest,
): Promise<TrustRecord> {
  if (!request.peerOwnerId.trim()) {
    throw new Error("peerOwnerId is required");
  }

  return createLocalTrustStore(config.profileDir).setTrustRecord(request);
}

export function removeTrustRecord(config: DashboardConfig, peerOwnerId: string): Promise<TrustRecord> {
  return createLocalTrustStore(config.profileDir).removeTrustRecord(peerOwnerId);
}

export async function searchSharedVault(
  config: DashboardConfig,
  query: string,
): Promise<VaultSearchHit[]> {
  if (!query.trim()) {
    return [];
  }

  const index = await buildVaultIndexOrEmpty(config.vaultDir);

  return searchVault(index, query, { limit: 10 }).map((result) => ({
    score: result.score,
    relativePath: result.document.relativePath,
    chunkIndex: result.chunk.index,
    matches: result.matches,
    preview: result.chunk.text.slice(0, 240),
  }));
}

export async function sendChatMessage(
  config: DashboardConfig,
  request: SendChatRequest,
): Promise<OutboundSendResult> {
  const profile = await loadOrCreateNodeProfile(config.profileDir);
  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: request.target,
      recipientRole: "human",
      intent: "chat.message",
      payload: createChatMessagePayload({
        senderOwnerId: profile.owner.ownerId,
        text: request.text,
      }),
      correlationId: request.correlationId,
    }),
    profile.device.privateKeyPem,
  );
  const latencyMs = await sendSingleEnvelope(request.target, envelope);
  await createLocalTaskStore(config.profileDir).appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: "chat.message",
      messageId: envelope.messageId,
      correlationId: envelope.correlationId,
      remotePeerId: request.target,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_CHAT_PROTOCOL,
      outcome: "record",
      summary: "Sent chat.message from desktop dashboard.",
      createdAt: envelope.createdAt,
    }),
  );
  return {
    messageId: envelope.messageId,
    intent: envelope.intent,
    target: request.target,
    latencyMs,
  };
}

export async function sendPairingRequest(
  config: DashboardConfig,
  request: SendPairingRequest,
): Promise<OutboundSendResult> {
  const profile = await loadOrCreateNodeProfile(config.profileDir);
  const payload = createDevicePairRequestPayload({
    requesterOwnerId: profile.owner.ownerId,
    requesterDeviceId: profile.device.deviceId,
    requesterDevicePublicKeyPem: profile.device.publicKeyPem,
    requestedDeviceProfile: request.requestedDeviceProfile,
    note: request.note,
  });
  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: request.target,
      intent: "device.pair.request",
      payload,
    }),
    profile.device.privateKeyPem,
  );
  const latencyMs = await sendSingleEnvelope(request.target, envelope);
  await createLocalTaskStore(config.profileDir).appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: "device.pair.request",
      messageId: envelope.messageId,
      remotePeerId: request.target,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: `Sent device.pair.request ${payload.requestId}.`,
      createdAt: envelope.createdAt,
    }),
  );
  return {
    messageId: envelope.messageId,
    intent: envelope.intent,
    target: request.target,
    latencyMs,
  };
}

export async function sendTaskProposal(
  config: DashboardConfig,
  request: SendTaskProposalRequest,
): Promise<OutboundSendResult> {
  const profile = await loadOrCreateNodeProfile(config.profileDir);
  const mandate = signMandate({
    owner: profile.owner,
    unsignedMandate: createUnsignedMandate({
      ownerId: profile.owner.ownerId,
      issuedToDeviceId: profile.device.deviceId,
      taskIntent: "dashboard.compose",
      objective: request.objective,
      mandateId: request.mandateId,
      closeOnFirstCompletedResult: request.closeOnFirstCompletedResult,
      collectCompletedResults: request.collectCompletedResults,
    }),
  });
  lastTaskComposerMandate = { taskId: request.taskId, mandate };
  const proofOfIntent = createProofOfIntent({
    mandate,
    taskId: request.taskId,
    requestIntent: "task.propose",
    device: profile.device,
  });
  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: request.target,
      intent: "task.propose",
      payload: createTaskProposePayload({
        taskId: request.taskId,
        mandateId: mandate.mandateId,
        proofOfIntent,
        objective: request.objective,
        requestedResult: request.requestedResult,
      }),
      correlationId: request.correlationId,
    }),
    profile.device.privateKeyPem,
  );
  const latencyMs = await sendSingleEnvelope(request.target, envelope);
  await createLocalTaskStore(config.profileDir).appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: "task.propose",
      messageId: envelope.messageId,
      correlationId: envelope.correlationId,
      remotePeerId: request.target,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: `Sent task.propose from desktop dashboard task=${request.taskId}.`,
      createdAt: envelope.createdAt,
    }),
  );
  return {
    messageId: envelope.messageId,
    intent: envelope.intent,
    target: request.target,
    latencyMs,
  };
}

export async function sendTaskNegotiate(
  config: DashboardConfig,
  request: SendTaskNegotiateRequest,
): Promise<OutboundSendResult> {
  if (!lastTaskComposerMandate || lastTaskComposerMandate.taskId !== request.taskId) {
    throw new Error(
      "Negotiation requires a task proposal sent from this dashboard session with the same task ID.",
    );
  }
  if (lastTaskComposerMandate.mandate.mandateId !== request.mandateId) {
    throw new Error("mandateId does not match the last task proposal mandate from this session.");
  }

  const profile = await loadOrCreateNodeProfile(config.profileDir);
  const proofOfIntent = createProofOfIntent({
    mandate: lastTaskComposerMandate.mandate,
    taskId: request.taskId,
    requestIntent: "task.negotiate",
    device: profile.device,
  });
  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: request.target,
      intent: "task.negotiate",
      payload: createTaskNegotiatePayload({
        taskId: request.taskId,
        mandateId: request.mandateId,
        proofOfIntent,
        message: request.message,
        proposedChanges: request.proposedChanges ?? [],
        negotiationId: request.negotiationId,
      }),
      correlationId: request.correlationId,
    }),
    profile.device.privateKeyPem,
  );
  const latencyMs = await sendSingleEnvelope(request.target, envelope);
  await createLocalTaskStore(config.profileDir).appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: "task.negotiate",
      messageId: envelope.messageId,
      correlationId: envelope.correlationId,
      remotePeerId: request.target,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_MESSAGE_PROTOCOL,
      outcome: "record",
      summary: `Sent task.negotiate from desktop dashboard task=${request.taskId}.`,
      createdAt: envelope.createdAt,
    }),
  );
  return {
    messageId: envelope.messageId,
    intent: envelope.intent,
    target: request.target,
    latencyMs,
  };
}

function normalizePairingCapabilities(input: string[] | undefined): Capability[] {
  const allowed = new Set<Capability>([
    "mesh.listen",
    "mesh.discovery",
    "mesh.relay",
    "ui.channel",
    "approval.prompt",
    "message.send",
    "message.store_encrypted",
    "vault.index",
    "vault.retrieve",
    "model.local",
    "model.cloud.request",
    "task.execute",
    "device.sync",
  ]);
  const filtered = (input ?? []).filter((candidate): candidate is Capability =>
    allowed.has(candidate as Capability),
  );
  return filtered.length > 0 ? filtered : ["ui.channel", "message.send"];
}

interface PairingApprovalContext {
  requestId: string;
  requesterPeerId: string;
  requesterOwnerId: string;
  requesterDeviceId: string;
  requesterDevicePublicKeyPem: string;
  requestedDeviceProfile?: "satellite" | "full";
  requestedCapabilities?: string[];
}

function parsePairingContext(reason: string): PairingApprovalContext | undefined {
  const marker = "PAIRING_CONTEXT:";
  const index = reason.indexOf(marker);
  if (index < 0) {
    return undefined;
  }
  const encoded = reason.slice(index + marker.length).trim();
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PairingApprovalContext;
  } catch {
    return undefined;
  }
}

async function buildVaultIndexOrEmpty(vaultDir: string): Promise<VaultIndex> {
  if (!existsSync(vaultDir)) {
    return {
      rootDir: vaultDir,
      documents: [],
      chunks: [],
    };
  }

  return buildVaultIndex({ rootDir: vaultDir });
}

function summarizeVault(index: VaultIndex): VaultSummary {
  return {
    rootDir: index.rootDir,
    documentCount: index.documents.length,
    chunkCount: index.chunks.length,
    documents: index.documents.slice(0, 20).map((document) => ({
      documentId: document.documentId,
      relativePath: document.relativePath,
      title: document.title,
      byteLength: document.byteLength,
      updatedAt: document.updatedAt,
      chunkCount: index.chunks.filter((chunk) => chunk.documentId === document.documentId).length,
    })),
  };
}

function summarizeObservedPeers(events: AuditEvent[]): ObservedPeerSummary[] {
  const byPeer = new Map<string, { messageCount: number; lastSeenAt: string }>();

  for (const event of events) {
    if (!event.remotePeerId) {
      continue;
    }

    const current = byPeer.get(event.remotePeerId);
    byPeer.set(event.remotePeerId, {
      messageCount: (current?.messageCount ?? 0) + 1,
      lastSeenAt: maxIsoDate(current?.lastSeenAt, event.createdAt),
    });
  }

  return [...byPeer.entries()]
    .map(([peerId, summary]) => ({ peerId, ...summary }))
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
    .slice(0, 20);
}

function maxIsoDate(left: string | undefined, right: string): string {
  if (!left) {
    return right;
  }

  return left.localeCompare(right) > 0 ? left : right;
}

function summarizeLiveP2p(events: AuditEvent[]): LiveP2pSnapshot {
  const traces = events
    .filter((event) => event.type === "p2p.trace")
    .slice(-40)
    .map((event) => ({
      eventId: event.eventId,
      createdAt: event.createdAt,
      summary: event.summary,
      direction: event.direction,
      protocol: event.protocol,
      remotePeerId: event.remotePeerId,
      latencyMs: event.latencyMs,
    }));

  const protocolCounts = new Map<string, number>();
  let inboundCount = 0;
  let outboundCount = 0;
  const peerIds = new Set<string>();

  for (const trace of traces) {
    if (trace.protocol) {
      protocolCounts.set(trace.protocol, (protocolCounts.get(trace.protocol) ?? 0) + 1);
    }
    if (trace.direction === "inbound") {
      inboundCount += 1;
    } else if (trace.direction === "outbound") {
      outboundCount += 1;
    }
    if (trace.remotePeerId) {
      peerIds.add(trace.remotePeerId);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    peerCount: peerIds.size,
    inboundCount,
    outboundCount,
    protocolCounts: [...protocolCounts.entries()]
      .map(([protocol, count]) => ({ protocol, count }))
      .sort((left, right) => right.count - left.count),
    traces: traces.reverse(),
  };
}

function summarizeConnectivityHealth(events: AuditEvent[]) {
  const analysis = analyzeConnectivityStageD(events);
  return {
    discoveryProfile: analysis.discoveryProfile,
    bootstrapPeerCount: analysis.bootstrapPeerCount,
    discoveredPeerCount: analysis.discoveredPeerCount,
    relayDiscoveryCount: analysis.relayDiscoveryCount,
    bootstrapProbeSuccessCount: analysis.bootstrapProbeSuccessCount,
    bootstrapProbeFailureCount: analysis.bootstrapProbeFailureCount,
    warningCount: analysis.warningCount,
    warnings: analysis.warnings,
    lastCheckpointAt: analysis.lastCheckpointAt,
    stageDBadge: analysis.badge,
    stageDExplanation: analysis.badgeExplanation,
  };
}

async function sendSingleEnvelope(target: string, envelope: Parameters<EnvoyMesh["send"]>[1]): Promise<number> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/0.0.0.0/tcp/0"],
    enableMdns: false,
  });
  await mesh.start();
  try {
    return envelope.intent === "chat.message"
      ? await mesh.sendChat(target, envelope)
      : await mesh.send(target, envelope);
  } finally {
    await mesh.stop();
  }
}
