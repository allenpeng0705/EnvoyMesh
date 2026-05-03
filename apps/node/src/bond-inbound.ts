import { evaluatePolicy, type BondLevel } from "@envoymesh/bonds";
import {
  createAuditEvent,
  type LocalTaskStore,
  type LocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  parseBondAcceptPayload,
  parseBondChallengePayload,
  parseBondChallengeResponsePayload,
  parseBondRequestPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";

export type BondInboundResult = { ok: true } | { ok: false; reason: string };

/**
 * Event types for bond inbound events
 */
export type BondInboundEvents = {
  "hello:request": (data: {
    messageId: string;
    sender: { nodeId: string; ownerId: string; displayName: string };
    profile: { displayName: string; bio: string; interests: string[]; whatShares: string[] };
    message: string;
    timestamp: string;
  }) => void;
  "bond:established": (data: { peerOwnerId: string; displayName?: string }) => void;
};

async function trustBondLevel(
  trustStore: LocalTrustStore,
  peerOwnerId: string,
): Promise<BondLevel> {
  const record = await trustStore.getTrustRecord(peerOwnerId);
  return record?.level ?? "public";
}

function policySummaryText(
  decision: ReturnType<typeof evaluatePolicy>,
): { summary: string; outcome: "allow" | "deny" | "record" } {
  if (decision.action === "deny") {
    return { summary: `policy deny: ${decision.reason}`, outcome: "deny" };
  }
  if (decision.action === "allow") {
    return {
      summary: `policy allow (maxSensitivity ${decision.maxSensitivity})`,
      outcome: "allow",
    };
  }
  if (decision.action === "challenge") {
    return {
      summary: `policy challenge: ${decision.challengeType}`,
      outcome: "record",
    };
  }
  return {
    summary: `policy approval_required: ${decision.reason}`,
    outcome: "record",
  };
}

/**
 * Inbound `bond.*` handling: validate EMP payload, run [`evaluatePolicy`](@envoymesh/bonds), write audit.
 * Does not mutate trust store (owner / CLI approves bonds separately).
 *
 * @param emitHelloRequest - optional callback to emit hello:request event after bond request is accepted
 * @param emitBondEstablished - optional callback to emit bond:established event after bond is stored
 */
export async function handleInboundBondIntent(
  input: {
    envelope: EnvoyEnvelope;
    profile: NodeProfile;
    remotePeerId: string;
    receivedAt: number;
    correlationId: string | undefined;
    taskStore: LocalTaskStore;
    trustStore: LocalTrustStore;
  },
  emitHelloRequest?: BondInboundEvents["hello:request"],
  emitBondEstablished?: BondInboundEvents["bond:established"],
): Promise<BondInboundResult> {
  const { envelope, profile, remotePeerId, receivedAt, correlationId, taskStore, trustStore } = input;

  try {
    console.log(`[bond-inbound] handling intent=${envelope.intent} from=${remotePeerId}`);
    if (envelope.intent === "bond.request") {
      const payload = parseBondRequestPayload(envelope.payload);
      if (payload.requesterOwnerId === profile.owner.ownerId) {
        return { ok: false, reason: "bond.request requester cannot equal local owner" };
      }

      const bondLevel = await trustBondLevel(trustStore, payload.requesterOwnerId);
      const policy = evaluatePolicy({
        peerId: envelope.senderPeerId,
        bondLevel,
        intent: "bond.request",
      });
      const { summary, outcome } = policySummaryText(policy);

      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: outcome === "deny" ? "message.rejected" : "message.verified",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: outcome === "deny" ? "rejected" : "verified",
          latencyMs: Date.now() - receivedAt,
          outcome,
          summary: `bond.request from ${payload.requesterOwnerId}: ${summary}. proofOfContext=${payload.proofOfContext ? "yes" : "no"}`,
          createdAt: envelope.createdAt,
        }),
      );

      if (outcome === "deny") {
        console.warn(`[bond.request] denied: ${summary}`);
      } else {
        console.log(`[bond.request] ${summary}`);

        // Emit hello:request event if callback provided
        if (emitHelloRequest && outcome === "record") {
          emitHelloRequest({
            messageId: envelope.messageId,
            sender: {
              nodeId: remotePeerId,
              ownerId: payload.requesterOwnerId,
              displayName: payload.requesterDisplayName ?? remotePeerId,
            },
            profile: {
              displayName: payload.requesterDisplayName ?? remotePeerId,
              bio: "",
              interests: [],
              whatShares: [],
            },
            message: payload.message ?? "",
            timestamp: envelope.createdAt,
          });
        }

        // Emit bond:established event so the UI updates
        // Note: "self" level should not occur for other peers, so we cast to Exclude
        await trustStore.setTrustRecord({
          peerOwnerId: payload.requesterOwnerId,
          displayName: payload.requesterDisplayName ?? remotePeerId,
          level: (payload.requestedLevel as Exclude<BondLevel, "self">) ?? "direct",
          note: payload.message ?? undefined,
          now: new Date().toISOString(),
        });

        // Emit bond:established to notify UI to refresh contacts
        if (emitBondEstablished) {
          emitBondEstablished({
            peerOwnerId: payload.requesterOwnerId,
            displayName: payload.requesterDisplayName ?? remotePeerId,
          });
        }
      }
      return { ok: true };
    }

    if (envelope.intent === "bond.challenge") {
      const payload = parseBondChallengePayload(envelope.payload);
      if (payload.targetOwnerId !== profile.owner.ownerId) {
        return { ok: false, reason: "bond.challenge targetOwnerId does not match local owner" };
      }

      const bondLevel = await trustBondLevel(trustStore, payload.challengerOwnerId);
      const policy = evaluatePolicy({
        peerId: envelope.senderPeerId,
        bondLevel,
        intent: "bond.challenge",
      });
      const { summary, outcome } = policySummaryText(policy);

      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: outcome === "deny" ? "message.rejected" : "message.verified",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: outcome === "deny" ? "rejected" : "verified",
          latencyMs: Date.now() - receivedAt,
          outcome,
          summary: `bond.challenge ${payload.challengeId}: ${summary}`,
          createdAt: envelope.createdAt,
        }),
      );

      if (outcome === "deny") {
        console.warn(`[bond.challenge] denied: ${summary}`);
      } else {
        console.log(`[bond.challenge] ${summary}`);
      }
      return { ok: true };
    }

    if (envelope.intent === "bond.challenge.response") {
      const payload = parseBondChallengeResponsePayload(envelope.payload);
      const bondLevel = await trustBondLevel(trustStore, payload.responderOwnerId);
      const policy = evaluatePolicy({
        peerId: envelope.senderPeerId,
        bondLevel,
        intent: "bond.challenge.response",
      });
      const { summary, outcome } = policySummaryText(policy);

      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: outcome === "deny" ? "message.rejected" : "message.verified",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: outcome === "deny" ? "rejected" : "verified",
          latencyMs: Date.now() - receivedAt,
          outcome,
          summary: `bond.challenge.response ${payload.challengeId} decision=${payload.decision}: ${summary}`,
          createdAt: envelope.createdAt,
        }),
      );

      if (outcome === "deny") {
        console.warn(`[bond.challenge.response] denied: ${summary}`);
      } else {
        console.log(`[bond.challenge.response] ${summary}`);
      }
      return { ok: true };
    }

    if (envelope.intent === "bond.accept") {
      console.log(`[bond-inbound] received bond.accept from ${remotePeerId}`);
      const payload = parseBondAcceptPayload(envelope.payload);
      console.log(`[bond-inbound] bond.accept payload:`, payload);

      // Store the bond (the sender is accepting our bond request, so we are the requester)
      await trustStore.setTrustRecord({
        peerOwnerId: payload.responderOwnerId,
        displayName: payload.responderOwnerId, // Will be updated with actual display name from UI
        level: "direct",
        note: payload.message ?? undefined,
        now: new Date().toISOString(),
      });

      console.log(`[bond-inbound] stored trust record for ${payload.responderOwnerId}, emitting bond:established`);

      // Emit bond:established to notify UI to refresh contacts
      if (emitBondEstablished) {
        emitBondEstablished({
          peerOwnerId: payload.responderOwnerId,
          displayName: payload.responderOwnerId,
        });
      }

      return { ok: true };
    }

    return { ok: false, reason: "not a bond intent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `invalid bond payload: ${message}` };
  }
}
