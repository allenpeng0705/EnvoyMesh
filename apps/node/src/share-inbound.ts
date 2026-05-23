import { resolve } from "node:path";
import {
  createAuditEvent,
  createShareEvent,
  sensitivityAllowed,
  type LocalTaskStore,
  type LocalTrustStore,
  type LocalPeerDirectoryStore,
  type NodeProfile,
  type CapabilityManifest,
} from "@envoymesh/local-store";
import {
  createSharePreviewPayload,
  parseShareRequestPayload,
  parseShareAcceptPayload,
  type SharePreviewPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { evaluatePolicy } from "@envoymesh/bonds";
import { searchVaultWithAudit, type VaultIndex } from "@envoymesh/vault";
import type { ModelProviderConfig } from "@envoymesh/api";
import { ZodError } from "zod";

export type SharePreviewResult =
  | { ok: true; responsePayload: SharePreviewPayload }
  | { ok: false; reason: string };

export type ShareAcceptResult =
  | { ok: true; proceed: true }
  | { ok: false; reason: string };

/** Sensitivity levels that require owner approval before raw file transfer. */
const APPROVAL_REQUIRED_SENSITIVITIES = new Set(["private", "trusted"]);

async function resolveSenderOwnerId(
  senderPeerId: string,
  remotePeerId: string,
  peerDirectoryStore: LocalPeerDirectoryStore,
): Promise<string | undefined> {
  const records = await peerDirectoryStore.listPeerRecords();
  const match =
    records.find((r) => r.peerId === senderPeerId) ??
    records.find((r) => r.peerId === remotePeerId);
  return match?.ownerId;
}

/**
 * Handle an inbound `share.request` intent.
 *
 * Flow:
 * 1. Validate payload (Zod)
 * 2. Audit inbound message
 * 3. Policy check via evaluatePolicy (bond level gate)
 * 4. If knowledge request: generate safe preview text (no raw vault content)
 *    If file request: check vault path safety + sensitivity approval requirement
 * 5. Return share.preview response with safe previewText and requiresApproval flag
 *
 * The actual content (knowledge.response or /envoymesh/data/0.1.0) is NOT sent here.
 * It is sent only after share.accept is received and approval is granted.
 */
export async function handleInboundShareRequest(input: {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  profile: NodeProfile;
  vaultIndex: VaultIndex | null;
  /** Used to validate `file`+`responder` paths on this node */
  vaultDir: string;
  modelProviders: ModelProviderConfig;
  capabilityManifest?: CapabilityManifest;
}): Promise<SharePreviewResult> {
  const { envelope, remotePeerId, receivedAt, correlationId, taskStore, trustStore, peerDirectoryStore, profile, vaultIndex, vaultDir, modelProviders: _modelProviders, capabilityManifest } = input;

  let payload: ReturnType<typeof parseShareRequestPayload>;
  try {
    payload = parseShareRequestPayload(envelope.payload);
  } catch (error) {
    const reason =
      error instanceof ZodError
        ? error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
        : "invalid share.request payload";
    return { ok: false, reason };
  }

  if (payload.requestType === "file") {
    if (!payload.relativePath?.trim()) {
      return { ok: false, reason: "file share requires relativePath" };
    }
    if (payload.fileOrigin === "responder" && !isSafeVaultPath(vaultDir, payload.relativePath)) {
      return { ok: false, reason: "unsafe or invalid vault relativePath" };
    }
  }

  // 1. Audit inbound
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "share.request",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "record",
      summary: `share.request received: type=${payload.requestType}`,
      createdAt: envelope.createdAt,
    }),
  );

  // 2. Policy check: resolve sender's owner ID, look up bond level
  const senderOwnerId = await resolveSenderOwnerId(envelope.senderPeerId, remotePeerId, peerDirectoryStore);
  const bondLevel = senderOwnerId
    ? (await trustStore.getTrustRecord(senderOwnerId))?.level ?? "public"
    : "public";

  const policyDecision = evaluatePolicy({
    peerId: senderOwnerId ?? envelope.senderPeerId,
    bondLevel,
    intent: "knowledge.query", // share.request is scoped like knowledge.query for policy purposes
    requestedSensitivity: payload.requestedSensitivity,
  });

  if (policyDecision.action === "deny") {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "share.request",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `share.request denied: ${policyDecision.reason}`,
        createdAt: envelope.createdAt,
      }),
    );
    return { ok: false, reason: policyDecision.reason };
  }

  if (policyDecision.action === "approval_required") {
    // Will require approval — still send a preview but mark requiresApproval=true
    const maxSens = "public";
    const previewText = buildSafePreviewText(payload, maxSens);
    const requiresApproval = true;

    const responsePayload = createSharePreviewPayload({
      inReplyTo: envelope.messageId,
      previewText,
      sensitivity: maxSens,
      requiresApproval,
      contentHint: payload.requestType === "file" ? `file: ${payload.relativePath}` : "knowledge answer",
      isFileTransfer: payload.requestType === "file",
    });

    // Audit share.preview
    await taskStore.appendShareEvent(
      createShareEvent({
        direction: "outbound",
        intent: "share.preview",
        ownerId: profile.owner.ownerId,
        remotePeerId,
        correlationId,
        requestMessageId: envelope.messageId,
        requestType: payload.requestType,
        sensitivity: maxSens,
        requiresApproval,
        isFileTransfer: payload.requestType === "file",
        outcome: "record",
        summary: `share.preview sent: requiresApproval=${requiresApproval}`,
        createdAt: envelope.createdAt,
      }),
    );

    return { ok: true, responsePayload };
  }

  // action === "allow": generate safe preview
  const maxSens = policyDecision.action === "allow" ? policyDecision.maxSensitivity : "public";
  const allowedSensitivity = maxSens ?? "public";

  // If sensitivity requested exceeds manifest ceiling, cap it
  let effectiveSensitivity = payload.requestedSensitivity;
  if (capabilityManifest && !sensitivityAllowed(payload.requestedSensitivity, capabilityManifest.sensitivityCeiling)) {
    effectiveSensitivity = capabilityManifest.sensitivityCeiling;
  }

  const requiresApproval = APPROVAL_REQUIRED_SENSITIVITIES.has(effectiveSensitivity) ||
    (capabilityManifest && !sensitivityAllowed(effectiveSensitivity, capabilityManifest.sensitivityCeiling));

  // Build safe preview text — never exposes raw vault content
  const previewText = buildSafePreviewText(payload, effectiveSensitivity);

  const responsePayload = createSharePreviewPayload({
    inReplyTo: envelope.messageId,
    previewText,
    sensitivity: effectiveSensitivity ?? "public",
    requiresApproval,
    contentHint: payload.requestType === "file" ? `file: ${payload.relativePath}` : "knowledge answer",
    isFileTransfer: payload.requestType === "file",
  });

  await taskStore.appendShareEvent(
    createShareEvent({
      direction: "outbound",
      intent: "share.preview",
      ownerId: profile.owner.ownerId,
      remotePeerId,
      correlationId,
      requestMessageId: envelope.messageId,
      requestType: payload.requestType,
      sensitivity: effectiveSensitivity,
      requiresApproval,
      isFileTransfer: payload.requestType === "file",
      outcome: "record",
      summary: `share.preview sent: requiresApproval=${requiresApproval}`,
      createdAt: envelope.createdAt,
    }),
  );

  return { ok: true, responsePayload };
}

/**
 * Handle an inbound `share.accept` intent.
 *
 * Flow:
 * 1. Validate payload
 * 2. Audit share.accept
 * 3. If requiresApproval was set on the preview, require an approval record before proceeding
 * 4. Return proceed=true (caller then sends knowledge.response or initiates data transfer)
 */
export async function handleInboundShareAccept(input: {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  profile: NodeProfile;
  vaultIndex: VaultIndex | null;
}): Promise<ShareAcceptResult> {
  const { envelope, remotePeerId, receivedAt, correlationId, taskStore, trustStore, peerDirectoryStore, profile, vaultIndex } = input;

  let payload: ReturnType<typeof parseShareAcceptPayload>;
  try {
    payload = parseShareAcceptPayload(envelope.payload);
  } catch (error) {
    const reason =
      error instanceof ZodError
        ? error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
        : "invalid share.accept payload";
    return { ok: false, reason };
  }

  const senderOwnerId = await resolveSenderOwnerId(envelope.senderPeerId, remotePeerId, peerDirectoryStore);

  await taskStore.appendShareEvent(
    createShareEvent({
      direction: "inbound",
      intent: "share.accept",
      ownerId: profile.owner.ownerId,
      remotePeerId,
      correlationId,
      requestMessageId: envelope.messageId,
      accepted: payload.accept,
      outcome: payload.accept ? "record" : "deny",
      summary: `share.accept received: accept=${payload.accept}`,
      createdAt: envelope.createdAt,
    }),
  );

  if (!payload.accept) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "share.accept",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: "share.accept: requester declined",
        createdAt: envelope.createdAt,
      }),
    );
    return { ok: false, reason: "requester declined the share" };
  }

  // Audit accepted share
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "share.accept",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "allow",
      summary: "share.accept: proceeding with content share",
      createdAt: envelope.createdAt,
    }),
  );

  return { ok: true, proceed: true };
}

/**
 * Build safe preview text for a share request.
 *
 * IMPORTANT: This must NEVER expose raw vault content, file paths, or sensitive details.
 * The preview is a generic description of what would be shared, not the content itself.
 */
function buildSafePreviewText(payload: ReturnType<typeof parseShareRequestPayload>, sensitivity: string): string {
  if (payload.requestType === "file") {
    return `A file share is available at sensitivity level: ${sensitivity}. The file can be transferred over the encrypted P2P channel after you accept this preview.`;
  }

  // Knowledge request — provide a generic preview without revealing vault content
  if (payload.query) {
    const queryPreview = payload.query.length > 80 ? `${payload.query.slice(0, 77)}...` : payload.query;
    return `A knowledge answer is available for your query "${queryPreview}" at sensitivity level: ${sensitivity}. Accept this preview to receive the answer.`;
  }

  return `A knowledge answer is available at sensitivity level: ${sensitivity}. Accept this preview to receive the answer.`;
}

/**
 * Check if a file path is safe for sharing (must be inside vault directory).
 */
export function isSafeVaultPath(vaultDir: string, relativePath: string): boolean {
  const path = relativePath.replace(/\\/g, "/");
  if (path.includes("..")) return false;
  if (path.startsWith("/")) return false;
  // Must be inside vault dir — resolved path must still start with vaultDir
  try {
    const fullPath = resolve(vaultDir, path);
    return fullPath.startsWith(vaultDir.replace(/[\/\\]+$/, ""));
  } catch {
    return false;
  }
}
