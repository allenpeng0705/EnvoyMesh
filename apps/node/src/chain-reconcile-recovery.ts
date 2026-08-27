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
  const graceMs = input.graceMs ?? CHAIN_RECOVERY_GRACE_MS;
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
}): TaskChainReconcileRequestPayload {
  const now = input.now ?? new Date();
  const knownAttempts = [...input.state.attempts.values()]
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
    const attempt = input.state.attempts.get(report.attemptId);
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
