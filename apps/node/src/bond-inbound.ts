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

export type BondInboundResult =
  | { ok: true; bondAcceptToRequester?: { requesterPeerId: string; requesterOwnerId: string } }
  | { ok: false; reason: string };

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
 *
 * Note: `bond.accept` DOES mutate the trust store. The caller must supply a
 * non-nullish `trustStore` — otherwise the handler throws and the envelope is
 * rejected (we'd otherwise silently break bond symmetry).
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
  tryBondAutonomyAutoAccept?: (payload: {
    envelope: any;
    requesterOwnerId: string;
    requesterDisplayName?: string;
    proofOfContext?: string;
    introCorrelationId?: string;
    requestedLevel?: string;
  }) => Promise<
    | { accepted: true; requesterOwnerId: string; requesterPeerId: string; displayName?: string }
    | { accepted: false }
    | null
  >,
): Promise<BondInboundResult> {
  const { envelope, profile, remotePeerId, receivedAt, correlationId, taskStore, trustStore } = input;

  try {
    if (envelope.intent === "bond.request") {
      const payload = parseBondRequestPayload(envelope.payload);
      if (payload.requesterOwnerId === profile.owner.ownerId) {
        return { ok: false, reason: "bond.request requester cannot equal local owner" };
      }

      if (envelope.senderRole === "agent" && envelope.agentCredential) {
        const ref = payload.ownerCommitmentRef?.trim();
        if (!ref) {
          return { ok: false, reason: "bond.request from agent requires ownerCommitmentRef" };
        }
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
      } else if (outcome === "allow") {
        // Auto-accept: bond is allowed without user interaction
        console.log(`[bond.request] ${summary} - auto accepting`);

        // Store the bond in trust store
        await trustStore.setTrustRecord({
          peerOwnerId: payload.requesterOwnerId,
          displayName: payload.requesterDisplayName ?? envelope.senderPeerId,
          level: (payload.requestedLevel as Exclude<BondLevel, "self">) ?? "direct",
          note: payload.message ?? undefined,
          now: new Date().toISOString(),
        });

        // Emit bond:established to notify UI to refresh contacts
        if (emitBondEstablished) {
          emitBondEstablished({
            peerOwnerId: payload.requesterOwnerId,
            displayName: payload.requesterDisplayName ?? envelope.senderPeerId,
          });
        }

        // Mirror manual acceptHello: notify the requester with bond.accept so they record us as a contact
        return {
          ok: true,
          bondAcceptToRequester: {
            requesterPeerId: remotePeerId,
            requesterOwnerId: payload.requesterOwnerId,
          },
        };
      } else {
        // outcome === "record" - manual approval needed (unless bond autonomy accepts)
        if (tryBondAutonomyAutoAccept) {
          const auto = await tryBondAutonomyAutoAccept({
            envelope,
            requesterOwnerId: payload.requesterOwnerId,
            requesterDisplayName: payload.requesterDisplayName,
            proofOfContext: payload.proofOfContext,
            introCorrelationId: payload.introCorrelationId,
            requestedLevel: payload.requestedLevel,
          });
          if (auto && auto.accepted) {
            console.log(
              `[bond.request] bond autonomy auto-accepted from ${payload.requesterOwnerId}`,
            );
            if (emitBondEstablished) {
              emitBondEstablished({
                peerOwnerId: auto.requesterOwnerId,
                displayName: auto.displayName ?? payload.requesterDisplayName,
              });
            }
            return {
              ok: true,
              bondAcceptToRequester: {
                requesterPeerId: auto.requesterPeerId,
                requesterOwnerId: auto.requesterOwnerId,
              },
            };
          } else if (auto && !auto.accepted) {
            console.log(
              `[bond.request] bond autonomy REJECTED from ${payload.requesterOwnerId}: ${("reason" in auto ? (auto as { reason: string }).reason : "unknown")}`,
            );
          }
        }

        console.log(`[bond.request] ${summary} - manual approval required`);

        // Emit hello:request event for user to accept/decline
        if (emitHelloRequest) {
          emitHelloRequest({
            messageId: envelope.messageId,
            sender: {
              nodeId: remotePeerId,
              ownerId: payload.requesterOwnerId,
              displayName: payload.requesterDisplayName ?? payload.requesterOwnerId,
            },
            profile: {
              displayName: payload.requesterDisplayName ?? payload.requesterOwnerId,
              bio: "",
              interests: [],
              whatShares: [],
            },
            message: payload.message ?? "",
            timestamp: envelope.createdAt,
          });
        }
        // Do NOT store bond or emit bond:established yet - wait for user acceptance
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
      console.log(`[bond-inbound] handling bond.accept from ${remotePeerId}`);

      // bond.accept writes a trust record on the receiver's side (we are
      // bonding the sender). The handler MUST have a LocalTrustStore —
      // previously the embedded NodeService path passed
      // `trustStore: undefined as never`, which crashed silently with a
      // TypeError and made the bond asymmetric (sender trusted, but
      // receiver had no record). Fail loudly here rather than silently
      // dropping the envelope.
      if (!trustStore) {
        throw new Error(
          "bond.accept requires a LocalTrustStore — internal wiring bug in handleBondIntentViaRuntime",
        );
      }

      // Phase 19: bond_autonomy posture — agent bond.accept requires bond_autonomy credential
      if (envelope.senderRole === "agent") {
        const credential = envelope.agentCredential;
        if (!credential) {
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
              summary: "bond.accept from agent rejected: missing agentCredential (bond_autonomy required)",
              createdAt: envelope.createdAt,
            }),
          );
          return { ok: false, reason: "bond.accept from agent requires bond_autonomy agentCredential" };
        }
        if (!credential.scope.includes("emp.bond_autonomy")) {
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
              summary: `bond.accept from agent rejected: agentCredential scope missing emp.bond_autonomy (scopes: ${credential.scope.join(", ")})`,
              createdAt: envelope.createdAt,
            }),
          );
          return { ok: false, reason: "bond.accept from agent requires bond_autonomy scope in agentCredential" };
        }
        console.log(`[bond-inbound] bond.accept from agent: bond_autonomy credential verified (credentialId=${credential.credentialId})`);
      }

      let payload;
      try {
        payload = parseBondAcceptPayload(envelope.payload);
      } catch (parseErr) {
        const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
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
            summary: `bond.accept: malformed payload (${detail})`,
            createdAt: envelope.createdAt,
          }),
        );
        return { ok: false, reason: `invalid bond payload: bond.accept (${detail})` };
      }
      console.log(`[bond-inbound] bond.accept payload: responderOwnerId=${payload.responderOwnerId}, requesterOwnerId=${payload.requesterOwnerId}, message=${payload.message}`);

      if (payload.requesterOwnerId !== profile.owner.ownerId) {
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
            summary: `bond.accept: requesterOwnerId mismatch (got ${payload.requesterOwnerId})`,
            createdAt: envelope.createdAt,
          }),
        );
        return { ok: false, reason: "bond.accept requesterOwnerId does not match local owner" };
      }

      // Extract display name from the message (format: "Hello from {displayName}!")
      let displayName = payload.responderOwnerId;
      if (payload.message) {
        const match = payload.message.match(/^Hello from (.+)!$/);
        if (match && match[1]) {
          displayName = match[1];
          console.log(`[bond-inbound] extracted displayName="${displayName}" from message`);
        }
      }

      // Store the bond (the sender is accepting our bond request, so we are the requester)
      await trustStore.setTrustRecord({
        peerOwnerId: payload.responderOwnerId,
        displayName: displayName,
        level: "direct",
        note: payload.message ?? undefined,
        now: new Date().toISOString(),
      });

      await taskStore.appendAuditEvent(
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
          summary: `bond.accept responder=${payload.responderOwnerId} requester=${payload.requesterOwnerId}`,
          createdAt: envelope.createdAt,
        }),
      );

      // Emit bond:established to notify UI to refresh contacts
      if (emitBondEstablished) {
        emitBondEstablished({
          peerOwnerId: payload.responderOwnerId,
          displayName: displayName,
        });
      }

      return { ok: true };
    }

    return { ok: false, reason: "not a bond intent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bond.inbound] UNEXPECTED error processing bond intent: ${message}`, error instanceof Error ? error.stack : undefined);
    return { ok: false, reason: `invalid bond payload: ${message}` };
  }
}
