/**
 * Phase 65B — pause open awards when worker leases are dead.
 *
 * Long-running jobs must not silent-reassign forever after a worker's
 * availability lease expires/revokes. The Assigner marks `pausedForLease`
 * and skips stall reassignment until a live lease returns.
 */

import type { ChainState } from "./chain-orchestrator.js";
import type { WorkerAvailability, WorkerLeaseStore } from "./worker-lease-store.js";

const DEAD_LEASE_STATES = new Set<WorkerAvailability["state"]>([
  "expired",
  "revoked",
  "engine_down",
  "unreachable",
]);

/**
 * Open (non-final, non-sealed) awards whose worker lease is known-dead.
 * Returns empty when the lease store has never heard of the worker
 * (`unknown`) — that still allows legacy probe / LAN paths.
 */
export function openAwardsWithDeadLeases(
  state: ChainState,
  leaseStore: WorkerLeaseStore,
): Array<{ subtaskId: string; workerPeerId: string; leaseState: WorkerAvailability["state"] }> {
  const out: Array<{
    subtaskId: string;
    workerPeerId: string;
    leaseState: WorkerAvailability["state"];
  }> = [];
  for (const [subtaskId, award] of state.awards.entries()) {
    if (state.cancelledSubtasks.has(subtaskId)) continue;
    if (state.partials.get(subtaskId)?.partial.isFinal) continue;
    if (state.iteration) {
      const sealed = Object.values(state.iteration.sealedByRound).some((ids) =>
        ids.includes(subtaskId),
      );
      if (sealed) continue;
    }
    const avail = leaseStore.getAvailability(award.workerPeerId);
    if (DEAD_LEASE_STATES.has(avail.state)) {
      out.push({
        subtaskId,
        workerPeerId: award.workerPeerId,
        leaseState: avail.state,
      });
    }
  }
  return out;
}

/** Apply / clear the lease-pause bit on the iteration side-state. */
export function applyLeasePauseState(
  state: ChainState,
  dead: readonly { subtaskId: string }[],
): { changed: boolean; paused: boolean } {
  const it = state.iteration;
  if (!it) return { changed: false, paused: false };
  const shouldPause = dead.length > 0;
  if (it.pausedForLease === shouldPause) {
    return { changed: false, paused: shouldPause };
  }
  it.pausedForLease = shouldPause;
  if (shouldPause) it.stopReason = "lease_stale";
  else if (it.stopReason === "lease_stale") delete it.stopReason;
  return { changed: true, paused: shouldPause };
}
