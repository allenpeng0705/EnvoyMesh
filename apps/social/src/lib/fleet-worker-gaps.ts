/**
 * Phase 66A — one actionable gap per bonded worker for Fleet readiness.
 *
 * Priority: join_off → missing/stale card → lease_* → offline.
 * Uses card health + optional 60F diagnostics lease reasons.
 */

import type { AgentNetworkDiagnosticsWorker, CachedAgentCardSummary } from "@envoymesh/api";
import type { ChainBondHealth } from "./chain-bond-health.js";
import type { FleetReadinessAction } from "./fleet-readiness.js";

export type FleetWorkerGapReason =
  | "join_off"
  | "missing_card"
  | "stale_card"
  | "lease_expired"
  | "lease_unknown"
  | "lease_busy"
  | "lease_engine_down"
  | "lease_revoked"
  | "offline";

export type FleetWorkerGap = {
  peerOwnerId: string;
  displayName: string;
  reasonCode: FleetWorkerGapReason;
  action: FleetReadinessAction;
};

export type FleetWorkerGapCandidate = {
  isSelf?: boolean;
  ownerId: string;
  displayName: string;
  card?: CachedAgentCardSummary;
  health: ChainBondHealth;
};

function leaseReasonFromDiagnostics(
  worker: AgentNetworkDiagnosticsWorker | undefined,
): FleetWorkerGapReason | null {
  if (!worker) return null;
  if (worker.leaseReady) return null;
  const reasons = worker.exclusionReasons ?? [];
  for (const raw of reasons) {
    const r = raw.startsWith("lease_") ? raw.slice("lease_".length) : raw;
    if (r === "expired") return "lease_expired";
    if (r === "busy") return "lease_busy";
    if (r === "engine_down") return "lease_engine_down";
    if (r === "revoked") return "lease_revoked";
    if (r === "unknown" || r === "unreachable" || r === "legacy_ready") {
      // legacy_ready is selectable; treat as ok for gap purposes.
      if (r === "legacy_ready") return null;
      return "lease_unknown";
    }
  }
  if (!worker.leaseReady && reasons.length === 0) return "lease_unknown";
  return "lease_unknown";
}

function findDiagWorker(
  candidate: FleetWorkerGapCandidate,
  workers: readonly AgentNetworkDiagnosticsWorker[],
): AgentNetworkDiagnosticsWorker | undefined {
  const peerId = candidate.card?.sourceAgentPeerId;
  return workers.find(
    (w) =>
      (candidate.ownerId && w.ownerId === candidate.ownerId) ||
      (peerId && w.peerId === peerId),
  );
}

/**
 * Return at most one gap per non-self bonded peer that is not Team-job ready.
 * Peers that are ready (card + opt-in + online, and lease when known) are omitted.
 */
export function collectFleetWorkerGaps(input: {
  candidates: readonly FleetWorkerGapCandidate[];
  diagnosticsWorkers?: readonly AgentNetworkDiagnosticsWorker[];
}): FleetWorkerGap[] {
  const diag = input.diagnosticsWorkers ?? [];
  const out: FleetWorkerGap[] = [];

  for (const c of input.candidates) {
    if (c.isSelf) continue;
    if (c.health.cardStatus === "blocked" || c.health.status === "blocked") continue;

    const displayName = (c.displayName || c.ownerId).trim() || c.ownerId;
    const diagWorker = findDiagWorker(c, diag);

    if (!c.health.optIn) {
      out.push({
        peerOwnerId: c.ownerId,
        displayName,
        reasonCode: "join_off",
        action: "manageWorkers",
      });
      continue;
    }

    if (c.health.cardStatus === "missing" || !c.card) {
      out.push({
        peerOwnerId: c.ownerId,
        displayName,
        reasonCode: "missing_card",
        action: "refreshCards",
      });
      continue;
    }

    if (c.health.cardStatus === "stale") {
      out.push({
        peerOwnerId: c.ownerId,
        displayName,
        reasonCode: "stale_card",
        action: "refreshCards",
      });
      continue;
    }

    const leaseGap = leaseReasonFromDiagnostics(diagWorker);
    if (leaseGap) {
      out.push({
        peerOwnerId: c.ownerId,
        displayName,
        reasonCode: leaseGap,
        action: leaseGap === "lease_engine_down" ? "openSettingsAi" : "refreshCards",
      });
      continue;
    }

    if (c.health.onlineStatus === "offline") {
      out.push({
        peerOwnerId: c.ownerId,
        displayName,
        reasonCode: "offline",
        action: "retryProbe",
      });
      continue;
    }

    // online/unknown + fresh + opt-in + lease ok (or no diag) → no gap
  }

  return out;
}
