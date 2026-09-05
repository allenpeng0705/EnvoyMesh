/**
 * Phase 67B — eligibility for “Start team job with these bonded peers”
 * from contact/group chat (overflow only; never default chrome).
 */

import type { AgentNetworkDiagnosticsWorker, CachedAgentCardSummary } from "@envoymesh/api";
import { isTeamJobReady, type ChainBondHealth } from "./chain-bond-health.js";
import { isFleetLeaseOk, type FleetReadinessCandidate } from "./fleet-readiness.js";
import {
  collectFleetWorkerGaps,
  type FleetWorkerGap,
  type FleetWorkerGapCandidate,
} from "./fleet-worker-gaps.js";

export type ChatTeamJobPeerCandidate = FleetReadinessCandidate & {
  ownerId: string;
  displayName: string;
};

/** Strict chat gate: Join + fresh card + online + lease-ready when known. */
export function isChatScopedPeerReady(
  candidate: FleetReadinessCandidate,
  diagnosticsWorkers?: readonly AgentNetworkDiagnosticsWorker[],
): boolean {
  if (!isTeamJobReady(candidate.card, candidate.health)) return false;
  if (candidate.health.cardStatus !== "ready") return false;
  return isFleetLeaseOk(candidate, diagnosticsWorkers);
}

export type ChatTeamJobEligibility = {
  /** Local Join + engine OK and every scoped peer is ready. */
  eligible: boolean;
  /** Local preconditions failed (Join off / engine down). */
  localBlocked: boolean;
  preferredPeerIds: string[];
  gaps: FleetWorkerGap[];
};

export function evaluateChatTeamJobEligibility(input: {
  localJoin: boolean;
  engineReady: boolean | null;
  /** Bonded peers in this chat scope (never includes local You). */
  scopedPeers: ChatTeamJobPeerCandidate[];
  diagnosticsWorkers?: readonly AgentNetworkDiagnosticsWorker[];
}): ChatTeamJobEligibility {
  const diagnosticsWorkers = input.diagnosticsWorkers;
  const localBlocked =
    !input.localJoin || input.engineReady === false;

  const gapCandidates: FleetWorkerGapCandidate[] = input.scopedPeers.map((p) => ({
    ownerId: p.ownerId,
    displayName: p.displayName,
    card: p.card,
    health: p.health,
  }));
  const gaps = collectFleetWorkerGaps({
    candidates: gapCandidates,
    diagnosticsWorkers,
  });

  const preferredPeerIds = input.scopedPeers
    .filter((p) => isChatScopedPeerReady(p, diagnosticsWorkers))
    .map((p) => p.card?.sourceAgentPeerId)
    .filter((id): id is string => Boolean(id));

  const peersReady =
    input.scopedPeers.length > 0 &&
    gaps.length === 0 &&
    preferredPeerIds.length === input.scopedPeers.length;

  return {
    eligible: !localBlocked && peersReady,
    localBlocked,
    preferredPeerIds,
    gaps,
  };
}

/** Build a chat-scoped peer candidate from bond/card/health. */
export function toChatTeamJobPeerCandidate(input: {
  ownerId: string;
  displayName: string;
  card: CachedAgentCardSummary | undefined;
  health: ChainBondHealth;
}): ChatTeamJobPeerCandidate {
  return {
    ownerId: input.ownerId,
    displayName: input.displayName,
    card: input.card,
    health: input.health,
  };
}
