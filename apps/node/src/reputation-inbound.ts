import { verifyCanonicalPayload } from "@envoymesh/identity";
import {
  createAuditEvent,
  type LocalTaskStore,
  type LocalPeerDirectoryStore,
  type PeerReputationStore,
} from "@envoymesh/local-store";
import {
  parseTaskFeedbackPayload,
  parseOfficialCredentialPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";

export type TaskFeedbackInboundResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Resolve peer owner ID from peer ID using the peer directory.
 * Returns the owner ID if found, otherwise falls back to the peer ID.
 */
async function resolveOwnerIdFromPeerId(
  peerId: string,
  peerDirectoryStore: LocalPeerDirectoryStore,
): Promise<string> {
  const records = await peerDirectoryStore.listPeerRecords();
  const match = records.find((r) => r.peerId === peerId);
  return match?.ownerId ?? peerId;
}

export type OfficialCredentialInboundResult =
  | { ok: true; verifiedAnchorId?: string }
  | { ok: false; reason: string };

/**
 * Handle inbound `task.feedback` — updates the local reputation score for the target peer.
 * The feedback is about a peer's task performance (success/failure, latency, abuse flags).
 */
export async function handleInboundTaskFeedback(input: {
  envelope: EnvoyEnvelope;
  taskStore: LocalTaskStore;
  reputationStore: PeerReputationStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
}): Promise<TaskFeedbackInboundResult> {
  const { envelope, taskStore, reputationStore, peerDirectoryStore } = input;

  try {
    if (envelope.intent !== "task.feedback") {
      return { ok: false, reason: "not a task.feedback intent" };
    }

    const payload = parseTaskFeedbackPayload(envelope.payload);
    // Resolve sender's peer ID to owner ID for reputation tracking
    const senderOwnerId = await resolveOwnerIdFromPeerId(envelope.senderPeerId, peerDirectoryStore);

    await reputationStore.upsertReputation(senderOwnerId, {
      outcome: payload.outcome,
      latencyMs: payload.latencyMs,
      abuseFlag: payload.abuseFlags[0] ?? "none",
    });

    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId: undefined,
        remotePeerId: envelope.senderPeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: 0,
        outcome: "record",
        summary: `task.feedback: taskId=${payload.taskId} outcome=${payload.outcome} latencyMs=${payload.latencyMs} abuse=${payload.abuseFlags.join(",") || "none"}`,
        createdAt: envelope.createdAt,
      }),
    );

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `invalid task.feedback payload: ${message}` };
  }
}

/**
 * Handle inbound `official.credential` — verifies the credential signature against stored trust anchor keys.
 * Credentials expire and are not persisted; they are verified on receipt only.
 */
export async function handleInboundOfficialCredential(input: {
  envelope: EnvoyEnvelope;
  taskStore: LocalTaskStore;
  trustAnchorPublicKeys: Record<string, string>;
}): Promise<OfficialCredentialInboundResult> {
  const { envelope, taskStore, trustAnchorPublicKeys } = input;

  try {
    if (envelope.intent !== "official.credential") {
      return { ok: false, reason: "not an official.credential intent" };
    }

    const credential = parseOfficialCredentialPayload(envelope.payload);
    const anchorPublicKey = trustAnchorPublicKeys[credential.anchorId];

    if (!anchorPublicKey) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.verified",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId: undefined,
          remotePeerId: envelope.senderPeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: 0,
          outcome: "deny",
          summary: `official.credential: unknown anchorId=${credential.anchorId}`,
          createdAt: envelope.createdAt,
        }),
      );
      return { ok: false, reason: `unknown anchor: ${credential.anchorId}` };
    }

    // Check expiration
    if (new Date(credential.expiresAt) < new Date()) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.verified",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId: undefined,
          remotePeerId: envelope.senderPeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: 0,
          outcome: "deny",
          summary: `official.credential: expired anchor=${credential.anchorId} peerId=${credential.peerId}`,
          createdAt: envelope.createdAt,
        }),
      );
      return { ok: false, reason: "credential has expired" };
    }

    // Verify signature against anchor's public key
    const { signature, ...unsigned } = credential;
    const valid = verifyCanonicalPayload(unsigned, signature, anchorPublicKey);

    if (!valid) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.verified",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId: undefined,
          remotePeerId: envelope.senderPeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: 0,
          outcome: "deny",
          summary: `official.credential: invalid signature anchor=${credential.anchorId} peerId=${credential.peerId}`,
          createdAt: envelope.createdAt,
        }),
      );
      return { ok: false, reason: "invalid credential signature" };
    }

    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId: undefined,
        remotePeerId: envelope.senderPeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: 0,
        outcome: "record",
        summary: `official.credential: verified anchor=${credential.anchorId} peerId=${credential.peerId} caps=${credential.capabilities.join(",")}`,
        createdAt: envelope.createdAt,
      }),
    );

    return { ok: true, verifiedAnchorId: credential.anchorId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `invalid official.credential payload: ${message}` };
  }
}

/**
 * Get reputation score for a peer (used by discovery to rank results).
 */
export async function getPeerReputationScore(
  reputationStore: PeerReputationStore,
  peerOwnerId: string,
): Promise<number> {
  const record = await reputationStore.getReputation(peerOwnerId);
  return record?.score ?? 50; // default neutral score
}
