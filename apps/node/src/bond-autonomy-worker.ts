/**
 * Bond Autonomy Worker (Phase 19D)
 *
 * Evaluates inbound bond requests against the bond_autonomy posture policy.
 * When policy allows, auto-sends bond.accept with agent credential.
 */

import { randomUUID } from "node:crypto";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import type {
  AgentCredential,
  BondAutonomyPosturePolicy,
} from "@envoymesh/protocol";
import {
  createBondAcceptPayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import type { LocalTaskStore, LocalTrustStore, NodeProfile } from "@envoymesh/local-store";
import { createAuditEvent } from "@envoymesh/local-store";

export interface BondAutonomyWorkerDeps {
  /** Node profile (owner + device identity). */
  profile: NodeProfile;
  /** Agent identity key pair (used to sign bond.accept). */
  agentIdentity: {
    agentId: string;
    agentPeerId: string;
    publicKeyPem: string;
    privateKeyPem: string;
    credential: AgentCredential;
  } | null;
  /** Active bond autonomy posture policy (parsed from mandate). */
  posturePolicy: BondAutonomyPosturePolicy | null;
  /** Whether bond_autonomy posture is enabled and not kill-switched. */
  enabled: boolean;
  /** Trust store for checking existing bond levels. */
  trustStore: LocalTrustStore;
  /** Task store for audit events. */
  taskStore: LocalTaskStore;
  /** Daily auto-accepted bond counter store. Returns current count for today. */
  getDailyAutoBondCount: () => Promise<number>;
  /** Increment daily auto-accepted bond counter. */
  incrementDailyAutoBondCount: () => Promise<void>;
  /** Send a signed envelope over the mesh. Returns latencyMs or throws. */
  sendMeshEnvelope: (recipientPeerId: string, signedEnvelope: unknown) => Promise<number>;
  /** Check if a trust-mode intro correlation exists for this owner pair. */
  hasIntroCorrelation: (requesterOwnerId: string, responderOwnerId: string) => Promise<boolean>;
  /** Get trust-mode overlap score between two owners (0.0–1.0). */
  getTrustOverlapScore: (requesterOwnerId: string, responderOwnerId: string) => Promise<number>;
  /** When set, inbound proofOfContext must match exactly. */
  sponsorProofToken?: string;
}

export interface BondAutonomyEvalResult {
  /** Whether the bond request passes policy and should be auto-accepted. */
  allowed: boolean;
  /** Human-readable reason for decision. */
  reason: string;
}

/**
 * Evaluate whether an inbound bond request should be auto-accepted
 * under the active bond_autonomy posture policy.
 */
export async function evaluateBondAutonomy(
  input: {
    requesterOwnerId: string;
    requesterDisplayName?: string;
    requesterPeerId: string;
    proofOfContext?: string;
    introCorrelationId?: string;
    requestedLevel: string;
  },
  deps: BondAutonomyWorkerDeps,
): Promise<BondAutonomyEvalResult> {
  if (!deps.enabled || !deps.posturePolicy || !deps.agentIdentity) {
    return { allowed: false, reason: "bond_autonomy not enabled or no agent identity" };
  }

  const policy = deps.posturePolicy;

  if (deps.sponsorProofToken?.trim()) {
    const expected = deps.sponsorProofToken.trim();
    const actual = input.proofOfContext?.trim();
    if (!actual || actual !== expected) {
      return {
        allowed: false,
        reason: "sponsor proof token mismatch or missing",
      };
    }
  }

  // Check daily cap
  if (policy.maxAutoBondsPerDay > 0) {
    const dailyCount = await deps.getDailyAutoBondCount();
    if (dailyCount >= policy.maxAutoBondsPerDay) {
      return {
        allowed: false,
        reason: `daily auto-bond cap reached (${policy.maxAutoBondsPerDay})`,
      };
    }
  }

  // Check referral proof requirement
  if (policy.requireReferralProof) {
    const hasProof = input.proofOfContext || input.introCorrelationId;
    if (!hasProof) {
      return {
        allowed: false,
        reason: "referral proof required but not present",
      };
    }
    // Verify the intro correlation is valid
    if (input.introCorrelationId) {
      const hasIntro = await deps.hasIntroCorrelation(
        input.requesterOwnerId,
        deps.profile.owner.ownerId,
      );
      if (!hasIntro) {
        return {
          allowed: false,
          reason: "intro correlation not found for owner pair",
        };
      }
    }
  }

  // Check max bond tier
  const existingRecord = await deps.trustStore.getTrustRecord(input.requesterOwnerId);
  const currentLevel = existingRecord?.level ?? "public";

  // "direct" is the highest — always allowed if policy permits
  // "referred" — only if policy allows referred tier
  if (policy.maxAutoBondTier === "referred" && currentLevel === "direct") {
    return {
      allowed: false,
      reason: `existing bond tier (${currentLevel}) exceeds maxAutoBondTier (${policy.maxAutoBondTier})`,
    };
  }

  // Check trust overlap score
  if (policy.minTrustOverlapScore > 0) {
    const score = await deps.getTrustOverlapScore(
      input.requesterOwnerId,
      deps.profile.owner.ownerId,
    );
    if (score < policy.minTrustOverlapScore) {
      return {
        allowed: false,
        reason: `trust overlap score ${score.toFixed(2)} below minimum ${policy.minTrustOverlapScore}`,
      };
    }
  }

  return { allowed: true, reason: "bond_autonomy policy satisfied" };
}

/**
 * Send a bond.accept envelope signed with the agent's key and carrying
 * the bond_autonomy agentCredential.
 */
export async function sendAgentBondAccept(
  input: {
    requesterOwnerId: string;
    requesterPeerId: string;
    message?: string;
  },
  deps: BondAutonomyWorkerDeps,
): Promise<{ ok: boolean; error?: string; messageId: string }> {
  const messageId = randomUUID();

  if (!deps.agentIdentity) {
    return { ok: false, error: "no agent identity", messageId };
  }

  const { profile, agentIdentity } = deps;

  try {
    const payload = createBondAcceptPayload({
      requesterOwnerId: input.requesterOwnerId,
      responderOwnerId: profile.owner.ownerId,
      message: input.message ?? `Hello from ${profile.owner.ownerId}!`,
    });

    const unsignedEnvelope = createUnsignedEnvelope({
      senderPeerId: agentIdentity.agentPeerId,
      senderPublicKey: agentIdentity.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: input.requesterPeerId,
      recipientRole: "human",
      intent: "bond.accept",
      payload,
      agentCredential: agentIdentity.credential,
      postureRef: deps.posturePolicy ? "bond_autonomy" : undefined,
    });

    // Sign with agent's key
    const signedEnvelope = signUnsignedEnvelope(
      unsignedEnvelope,
      agentIdentity.privateKeyPem,
    );

    // Dispatch
    const latencyMs = await deps.sendMeshEnvelope(input.requesterPeerId, signedEnvelope);

    // Audit
    await deps.taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.sent",
        intent: "bond.accept",
        messageId: signedEnvelope.messageId,
        remotePeerId: input.requesterPeerId,
        direction: "outbound",
        latencyMs,
        outcome: "record",
        summary: `Agent bond.accept to ${input.requesterOwnerId} (bond_autonomy)`,
        createdAt: signedEnvelope.createdAt,
      }),
    );

    return { ok: true, messageId: signedEnvelope.messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error, messageId };
  }
}

/**
 * Run a bond autonomy pass: evaluate all active bond requests against
 * posture policy and auto-accept those that pass.
 */
export async function runBondAutonomyPass(
  deps: BondAutonomyWorkerDeps,
  pendingBondRequests: Array<{
    requesterOwnerId: string;
    requesterDisplayName?: string;
    requesterPeerId: string;
    proofOfContext?: string;
    introCorrelationId?: string;
    requestedLevel: string;
    messageId: string;
  }>,
): Promise<{
  ok: boolean;
  accepted: number;
  rejected: number;
  correlationId: string;
}> {
  const correlationId = randomUUID();

  if (!deps.enabled || !deps.posturePolicy || !deps.agentIdentity) {
    return { ok: false, accepted: 0, rejected: pendingBondRequests.length, correlationId };
  }

  let accepted = 0;
  let rejected = 0;

  for (const request of pendingBondRequests) {
    const evalResult = await evaluateBondAutonomy(request, deps);

    if (evalResult.allowed) {
      const sendResult = await sendAgentBondAccept(
        {
          requesterOwnerId: request.requesterOwnerId,
          requesterPeerId: request.requesterPeerId,
        },
        deps,
      );

      if (sendResult.ok) {
        accepted++;
        // Store the bond
        await deps.trustStore.setTrustRecord({
          peerOwnerId: request.requesterOwnerId,
          displayName: request.requesterDisplayName ?? request.requesterOwnerId,
          level: "direct",
          note: `Auto-accepted by bond_autonomy posture`,
          now: new Date().toISOString(),
        });
        await deps.incrementDailyAutoBondCount();
      } else {
        rejected++;
      }
    } else {
      rejected++;
    }
  }

  return { ok: true, accepted, rejected, correlationId };
}
