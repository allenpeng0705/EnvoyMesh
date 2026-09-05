/**
 * Phase 60D — assigner-side restart reconciliation.
 *
 * Design: docs/agent-network-next-generation-design.md §9.2
 *
 * After checkpoint+journal restore, chains enter RECOVERING: watchdog /
 * reassignment timers stay paused until peer reconcile completes or grace
 * expires. Recovered finals are deduped by (attemptId, partialSeq, contentHash).
 */

import type {
  ChainReconcileAttemptReport,
  TaskChainPartialPayload,
  TaskChainReconcileRequestPayload,
} from "@envoymesh/protocol";
import type { ChainAttemptState, ChainState } from "./chain-orchestrator.js";

/** Default grace before treating unanswered reconcile as unknown (ms). */
export const CHAIN_RECOVERY_GRACE_MS = 15_000;

/** Override recovery grace (ms) for tests / reclaim; falls back to default. */
export function resolveChainRecoveryGraceMs(explicit?: number): number {
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) {
    return explicit;
  }
  const raw = process.env.ENVOYMESH_CHAIN_RECOVERY_GRACE_MS?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return CHAIN_RECOVERY_GRACE_MS;
}
/** Short grace after worker reports `unknown` before reassignment (ms). */
export const CHAIN_RECOVERY_UNKNOWN_GRACE_MS = 5_000;

export type ChainRecoveryPhase =
  | "recovering"
  | "running"
  | "awaiting_owner"
  | "complete";

export type ChainRecoveryPeerStatus =
  | "pending"
  | "reconciled"
  | "timeout"
  | "unsupported";

export type ChainRecoveryState = {
  phase: ChainRecoveryPhase;
  orchestratorEpoch: string;
  startedAt: string;
  graceDeadlineAt: string;
  peers: Record<
    string,
    {
      status: ChainRecoveryPeerStatus;
      workerEpoch?: string;
      reconciledAt?: string;
      attemptIds: string[];
    }
  >;
  conflicts: Array<{
    attemptId: string;
    subtaskId: string;
    reason: string;
  }>;
};

export type ApplyReconcileReportResult = {
  ingestedFinals: string[];
  resumedRunning: string[];
  unknowns: string[];
  conflicts: Array<{ attemptId: string; subtaskId: string; reason: string }>;
};

function contentHashFromPartial(partial: TaskChainPartialPayload): string | undefined {
  const note = partial.partial.note ?? "";
  const arts =
    partial.partial.namedArtifacts?.map((a) => a.key).join(",") ??
    (partial.partial.artifactFragment ? "default" : "");
  const raw = `${partial.partial.seq}|${partial.partial.isFinal}|${note}|${arts}`;
  // Lightweight stable hash (FNV-1a 32-bit hex) — enough for local dedup.
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function partialDedupKey(
  attemptId: string,
  partial: TaskChainPartialPayload,
): string {
  const hash = contentHashFromPartial(partial) ?? "none";
  return `${attemptId}:${partial.partial.seq}:${hash}`;
}

export function createOrchestratorEpoch(now: Date = new Date()): string {
  return `orch_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createWorkerEpoch(now: Date = new Date()): string {
  return `worker_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Collect awarded/running attempts that need peer reconcile after restore. */
export function collectRecoveryTargets(state: ChainState): Array<{
  workerPeerId: string;
  attempt: ChainAttemptState;
}> {
  const out: Array<{ workerPeerId: string; attempt: ChainAttemptState }> = [];
  for (const attempt of state.attempts.values()) {
    if (
      attempt.state === "awarded" ||
      attempt.state === "running" ||
      attempt.state === "final_received"
    ) {
      out.push({ workerPeerId: attempt.workerPeerId, attempt });
    }
  }
  return out;
}

export function beginChainRecovery(input: {
  state: ChainState;
  orchestratorEpoch: string;
  now?: Date;
  graceMs?: number;
}): ChainRecoveryState {
  const now = input.now ?? new Date();
  const targets = collectRecoveryTargets(input.state);
  const peers: ChainRecoveryState["peers"] = {};
  for (const { workerPeerId, attempt } of targets) {
    const existing = peers[workerPeerId];
    if (existing) {
      existing.attemptIds.push(attempt.attemptId);
    } else {
      peers[workerPeerId] = {
        status: "pending",
        attemptIds: [attempt.attemptId],
      };
    }
  }
  const graceMs = resolveChainRecoveryGraceMs(input.graceMs);
  return {
    phase: Object.keys(peers).length === 0 ? "running" : "recovering",
    orchestratorEpoch: input.orchestratorEpoch,
    startedAt: now.toISOString(),
    graceDeadlineAt: new Date(now.getTime() + graceMs).toISOString(),
    peers,
    conflicts: [],
  };
}

export function buildReconcileRequest(input: {
  state: ChainState;
  orchestratorEpoch: string;
  workerPeerId: string;
  now?: Date;
  /** Phase 64A — optional remote Assigner ownership epoch. */
  ownershipEpoch?: string;
  /**
   * Phase 64B reclaim — empty knownAttempts so the worker returns all
   * receipts for this chainId (placeholder reclaim attempt ids won't match).
   */
  requestAllReceipts?: boolean;
}): TaskChainReconcileRequestPayload {
  const now = input.now ?? new Date();
  const knownAttempts = input.requestAllReceipts
    ? []
    : [...input.state.attempts.values()]
        .filter((a) => a.workerPeerId === input.workerPeerId)
        .filter(
          (a) =>
            a.state === "awarded" ||
            a.state === "running" ||
            a.state === "final_received" ||
            a.state === "selected",
        )
        .map((a) => ({
          attemptId: a.attemptId,
          subtaskId: a.subtaskId,
          lastKnownState: a.state,
          ...(typeof a.lastPartialSeq === "number"
            ? { lastPartialSeq: a.lastPartialSeq }
            : {}),
        }));
  return {
    chainId: input.state.chainId,
    orchestratorEpoch: input.orchestratorEpoch,
    ...(input.ownershipEpoch ? { ownershipEpoch: input.ownershipEpoch } : {}),
    knownAttempts,
    requestedAt: now.toISOString(),
  };
}

/**
 * Apply one worker's reconcile reports onto chain state.
 * Does not send wire messages; caller persists journal + emits events.
 */
export function applyReconcileReports(input: {
  state: ChainState;
  recovery: ChainRecoveryState;
  workerPeerId: string;
  workerEpoch: string;
  reports: ChainReconcileAttemptReport[];
  seenPartialKeys: Set<string>;
  now?: Date;
  /**
   * Phase 64B — when reclaiming on a creator home, seed missing attempts from
   * worker receipts instead of treating them as conflicts.
   */
  seedMissingAttempts?: boolean;
}): ApplyReconcileReportResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const result: ApplyReconcileReportResult = {
    ingestedFinals: [],
    resumedRunning: [],
    unknowns: [],
    conflicts: [],
  };

  for (const report of input.reports) {
    let attempt = input.state.attempts.get(report.attemptId);
    if (!attempt && input.seedMissingAttempts) {
      // Replace placeholder reclaim attempt for this subtask if present.
      for (const [id, existing] of input.state.attempts) {
        if (
          existing.subtaskId === report.subtaskId &&
          existing.workerPeerId === input.workerPeerId &&
          id.startsWith("attempt_reclaim_")
        ) {
          input.state.attempts.delete(id);
          if (input.state.selectedAttemptBySubtask.get(report.subtaskId) === id) {
            input.state.selectedAttemptBySubtask.delete(report.subtaskId);
          }
          break;
        }
      }
      attempt = {
        attemptId: report.attemptId,
        chainId: input.state.chainId,
        subtaskId: report.subtaskId,
        workerPeerId: input.workerPeerId,
        role: "primary",
        state: "awarded",
        attemptNumber: 1,
        acceptedCostUsd: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastReason: "reclaim_seeded_from_receipt",
      };
      input.state.attempts.set(attempt.attemptId, attempt);
      input.state.selectedAttemptBySubtask.set(report.subtaskId, attempt.attemptId);
      if (!input.state.awards.has(report.subtaskId)) {
        input.state.awards.set(report.subtaskId, {
          version: "0.1",
          subtaskId: report.subtaskId,
          chainId: input.state.chainId,
          workerPeerId: input.workerPeerId,
          negotiationRound: 1,
          acceptedCostUsd: 0,
          deadlineAt: input.state.chainMandate.deadlineAt,
          createdAt: nowIso,
          attemptId: report.attemptId,
        });
        input.state.awardedAt.set(report.subtaskId, nowIso);
        input.state.workersBySubtask.set(report.subtaskId, [input.workerPeerId]);
      } else {
        const award = input.state.awards.get(report.subtaskId)!;
        (award as { attemptId?: string }).attemptId = report.attemptId;
      }
    }
    if (!attempt) {
      // Unknown attempt id from worker — retain as conflict note only.
      result.conflicts.push({
        attemptId: report.attemptId,
        subtaskId: report.subtaskId,
        reason: "unknown_attempt_id",
      });
      continue;
    }
    if (attempt.workerPeerId !== input.workerPeerId) {
      result.conflicts.push({
        attemptId: report.attemptId,
        subtaskId: report.subtaskId,
        reason: "worker_peer_mismatch",
      });
      continue;
    }

    if (report.state === "unknown") {
      result.unknowns.push(report.attemptId);
      attempt.lastReason = "reconcile_unknown";
      attempt.updatedAt = nowIso;
      // Hold reassignment: extend grace and leave peer pending until unknown grace elapses.
      const unknownDeadline = new Date(
        now.getTime() + CHAIN_RECOVERY_UNKNOWN_GRACE_MS,
      ).toISOString();
      if (Date.parse(input.recovery.graceDeadlineAt) < Date.parse(unknownDeadline)) {
        input.recovery.graceDeadlineAt = unknownDeadline;
      }
      continue;
    }

    if (report.state === "cancelled") {
      attempt.state = "cancelled";
      attempt.updatedAt = nowIso;
      attempt.lastReason = "reconcile_cancelled";
      continue;
    }

    if (report.state === "final" && report.finalPartial) {
      const key = partialDedupKey(report.attemptId, report.finalPartial);
      if (input.seenPartialKeys.has(key)) {
        // Already ingested — skip duplicate spend/selection.
        continue;
      }
      const existing = input.state.partials.get(report.subtaskId);
      if (existing?.partial.isFinal) {
        const existingKey = attempt.attemptId
          ? partialDedupKey(attempt.attemptId, existing)
          : undefined;
        if (existingKey && existingKey !== key) {
          result.conflicts.push({
            attemptId: report.attemptId,
            subtaskId: report.subtaskId,
            reason: "conflicting_final",
          });
          input.recovery.conflicts.push({
            attemptId: report.attemptId,
            subtaskId: report.subtaskId,
            reason: "conflicting_final",
          });
          // Retain as separate attempt final_received; do not overwrite selected.
          attempt.state = "final_received";
          attempt.updatedAt = nowIso;
          if (typeof report.lastPartialSeq === "number") {
            attempt.lastPartialSeq = report.lastPartialSeq;
          }
          input.seenPartialKeys.add(key);
          result.ingestedFinals.push(report.attemptId);
          continue;
        }
      }
      input.state.partials.set(report.subtaskId, report.finalPartial);
      input.seenPartialKeys.add(key);
      attempt.state = "final_received";
      attempt.updatedAt = nowIso;
      if (typeof report.lastPartialSeq === "number") {
        attempt.lastPartialSeq = report.lastPartialSeq;
      }
      input.state.lastHeartbeatAt.set(report.subtaskId, now.getTime());
      result.ingestedFinals.push(report.attemptId);
      continue;
    }

    if (report.state === "running" || report.state === "accepted") {
      // Renew heartbeat; do not duplicate accept.
      attempt.state = report.state === "accepted" ? "awarded" : "running";
      attempt.updatedAt = nowIso;
      if (typeof report.lastPartialSeq === "number") {
        attempt.lastPartialSeq = report.lastPartialSeq;
      }
      input.state.lastHeartbeatAt.set(report.subtaskId, now.getTime());
      result.resumedRunning.push(report.attemptId);
    }
  }

  const peer = input.recovery.peers[input.workerPeerId];
  if (peer) {
    if (result.unknowns.length > 0) {
      // Stay pending through unknown grace so watchdog/reassign remains paused.
      peer.workerEpoch = input.workerEpoch;
    } else if (
      input.seedMissingAttempts &&
      result.ingestedFinals.length === 0 &&
      result.resumedRunning.length > 0
    ) {
      // Phase 64C reclaim: a mid-run "running" receipt is not enough to exit
      // recovery — keep the peer pending so grace / mid-pass can still pull a
      // later final from the worker receipt store.
      peer.workerEpoch = input.workerEpoch;
    } else {
      peer.status = "reconciled";
      peer.workerEpoch = input.workerEpoch;
      peer.reconciledAt = nowIso;
    }
  }

  return result;
}

/** Mark timed-out peers and decide whether recovery can exit. */
export function tickChainRecovery(input: {
  recovery: ChainRecoveryState;
  now?: Date;
}): { done: boolean; timedOutPeers: string[] } {
  const now = input.now ?? new Date();
  const deadline = Date.parse(input.recovery.graceDeadlineAt);
  const timedOutPeers: string[] = [];
  if (Number.isFinite(deadline) && now.getTime() >= deadline) {
    for (const [peerId, peer] of Object.entries(input.recovery.peers)) {
      if (peer.status === "pending") {
        peer.status = "timeout";
        timedOutPeers.push(peerId);
      }
    }
  }
  const pending = Object.values(input.recovery.peers).some((p) => p.status === "pending");
  if (!pending && input.recovery.phase === "recovering") {
    input.recovery.phase = "running";
  }
  return { done: !pending, timedOutPeers };
}

export function isChainRecovering(recovery: ChainRecoveryState | undefined): boolean {
  return recovery?.phase === "recovering";
}
