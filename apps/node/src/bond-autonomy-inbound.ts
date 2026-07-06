/**
 * Inbound bond.request — bond autonomy auto-accept (config-only on sponsor node).
 */
import type { LocalTaskStore, LocalTrustStore, NodeProfile } from "@envoymesh/local-store";
import { createAuditEvent } from "@envoymesh/local-store";
import {
  evaluateBondAutonomy,
  type BondAutonomyWorkerDeps,
} from "./bond-autonomy-worker.js";
import { resolveBondAutonomyPostureFromConfig, type BondAutonomyNodeConfig } from "@envoymesh/api";
import type { PersistedNodeConfig } from "./node-config-store.js";
import type { BondLevel } from "@envoymesh/bonds";
import { parseBondRequestPayload, type EnvoyEnvelope } from "@envoymesh/protocol";

export function bondAutonomyConfigFromPersisted(
  config: PersistedNodeConfig | undefined,
): BondAutonomyNodeConfig {
  return {
    enabled: config?.bondAutonomyEnabled ?? false,
    maxAutoBondsPerDay: config?.bondAutonomyMaxAutoBondsPerDay,
    requireReferralProof: config?.bondAutonomyRequireReferralProof,
    maxAutoBondTier: config?.bondAutonomyMaxAutoBondTier,
    minTrustOverlapScore: config?.bondAutonomyMinTrustOverlapScore,
    notifyOwnerOnAutoBond: config?.bondAutonomyNotifyOwnerOnAutoBond,
    sponsorProofToken: config?.bondAutonomySponsorProofToken,
  };
}

export type BondAutonomyInboundAutoAcceptResult =
  | { accepted: true; requesterOwnerId: string; requesterPeerId: string; displayName?: string }
  | { accepted: false; reason: string };

export async function tryBondAutonomyInboundAutoAccept(input: {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  profile: NodeProfile;
  trustStore: LocalTrustStore;
  taskStore: LocalTaskStore;
  config: PersistedNodeConfig | undefined;
  autonomousKillSwitch?: boolean;
  getDailyAutoBondCount: () => Promise<number>;
  incrementDailyAutoBondCount: () => Promise<void>;
  hasIntroCorrelation: (requesterOwnerId: string, responderOwnerId: string) => Promise<boolean>;
  getTrustOverlapScore: (requesterOwnerId: string, responderOwnerId: string) => Promise<number>;
}): Promise<BondAutonomyInboundAutoAcceptResult> {
  const autonomy = bondAutonomyConfigFromPersisted(input.config);
  if (!autonomy.enabled || input.autonomousKillSwitch) {
    return { accepted: false, reason: "bond autonomy disabled" };
  }

  const posturePolicy = resolveBondAutonomyPostureFromConfig(autonomy);
  if (!posturePolicy) {
    return { accepted: false, reason: "bond autonomy policy unavailable" };
  }

  let payload;
  try {
    payload = parseBondRequestPayload(input.envelope.payload);
  } catch {
    return { accepted: false, reason: "invalid bond.request payload" };
  }

  const deps: BondAutonomyWorkerDeps = {
    profile: input.profile,
    agentIdentity: null,
    posturePolicy,
    enabled: true,
    trustStore: input.trustStore,
    taskStore: input.taskStore,
    getDailyAutoBondCount: input.getDailyAutoBondCount,
    incrementDailyAutoBondCount: input.incrementDailyAutoBondCount,
    sendMeshEnvelope: async () => 0,
    hasIntroCorrelation: input.hasIntroCorrelation,
    getTrustOverlapScore: input.getTrustOverlapScore,
    sponsorProofToken: autonomy.sponsorProofToken,
  };

  const evalResult = await evaluateBondAutonomy(
    {
      requesterOwnerId: payload.requesterOwnerId,
      requesterDisplayName: payload.requesterDisplayName,
      requesterPeerId: input.remotePeerId,
      proofOfContext: payload.proofOfContext,
      introCorrelationId: payload.introCorrelationId,
      requestedLevel: payload.requestedLevel ?? "direct",
    },
    deps,
  );

  if (!evalResult.allowed) {
    return { accepted: false, reason: evalResult.reason };
  }

  const level = (payload.requestedLevel as Exclude<BondLevel, "self">) ?? "direct";
  await input.trustStore.setTrustRecord({
    peerOwnerId: payload.requesterOwnerId,
    displayName: payload.requesterDisplayName ?? payload.requesterOwnerId,
    level,
    note: payload.message ?? "bond-autonomy-auto-accept",
    now: new Date().toISOString(),
  });

  await input.incrementDailyAutoBondCount();

  await input.taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.verified",
      intent: "bond.request",
      messageId: input.envelope.messageId,
      remotePeerId: input.remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      outcome: "allow",
      summary: `bond.request auto-accepted via bond autonomy (${evalResult.reason}) from ${payload.requesterOwnerId}`,
      createdAt: input.envelope.createdAt,
    }),
  );

  return {
    accepted: true,
    requesterOwnerId: payload.requesterOwnerId,
    requesterPeerId: input.remotePeerId,
    displayName: payload.requesterDisplayName,
  };
}
