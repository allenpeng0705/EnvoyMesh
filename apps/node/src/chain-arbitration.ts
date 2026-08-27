/**
 * Phase 40E — Cross-orchestrator arbitration.
 *
 * When two orchestrators both think they own the same subtask (a race
 * during a network partition, or a stale handoff response), they
 * exchange arbitration envelopes. The orchestrator with the
 * higher-`seq` entry wins; the loser accepts the new ownership and
 * releases any budget it had reserved locally.
 *
 * This module is the orchestrator-side handler:
 *   - `ArbitrationStore` — append-only per-chain ledger of entries.
 *   - `applyArbitration` — converge local state with a remote entry.
 *   - `releaseOwnership` — drop a subtask from the local awards map
 *     and release any reserved budget.
 *
 * Invariants:
 *   - The store is append-only; we never mutate entries in place.
 *   - `applyArbitration` is idempotent (re-applying the same payload
 *     is a no-op).
 *   - `releaseOwnership` is safe to call on a subtask we don't own
 *     (it's a no-op).
 *
 * @see docs/agent_network.md §8.3 (Arbitration)
 */

import type { AgentRuntime, ChainArbitrationEntry, VerdictEntry } from "@envoymesh/protocol";

import { isLocalEntryWinning } from "./chain-handoff.js";

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Per-chain arbitration ledger. Keyed by `subtaskId` (arbitration entries)
 * or `${subtaskId}::${workerRuntime}` (verdict entries, Phase 41).
 *
 * **Phase 41 (MAP):** the store now holds a union — `ChainArbitrationEntry`
 * (Phase 40E, handoff-dispute resolution, unchanged) plus `VerdictEntry`
 * (signed per-(subtask, runtime) verdicts, appended via
 * `recordVerdictEntry`). The existing `append-only` + `idempotent`
 * invariants apply to both halves (design §4.3). Consumers of
 * `ChainArbitrationEntry` narrow via `isChainArbitrationEntry`.
 */
export type ArbitrationEntry = ChainArbitrationEntry | VerdictEntry;
export type ArbitrationStore = Map<string, ArbitrationEntry>;

/** Narrowing guard: true when the entry is a Phase 40E ownership entry. */
export function isChainArbitrationEntry(
  e: ArbitrationEntry | undefined,
): e is ChainArbitrationEntry {
  return !!e && "currentOwnerPeerId" in e && "arbitrationId" in e;
}

/** Narrowing guard: true when the entry is a signed verdict (Phase 41). */
export function isVerdictEntry(e: ArbitrationEntry | undefined): e is VerdictEntry {
  return !!e && "workerPeerId" in e && "verdict" in e;
}

/** Verdict slot key — one slot per (subtask, runtime). */
export function verdictLedgerKey(subtaskId: string, workerRuntime: AgentRuntime): string {
  return `${subtaskId}::${workerRuntime}`;
}

/** Empty store helper. */
export function createArbitrationStore(): ArbitrationStore {
  return new Map();
}

/** Returns the current owner of a subtask, or `null` if unowned. */
export function getCurrentOwner(
  store: ArbitrationStore,
  subtaskId: string,
): ChainArbitrationEntry | null {
  const entry = store.get(subtaskId);
  return entry && isChainArbitrationEntry(entry) ? entry : null;
}

/** True when the local orchestrator currently owns this subtask. */
export function localOrchestratorOwns(
  store: ArbitrationStore,
  subtaskId: string,
  localPeerId: string,
): boolean {
  const entry = store.get(subtaskId);
  return isChainArbitrationEntry(entry) && entry.currentOwnerPeerId === localPeerId;
}

/** Returns all subtasks owned by `localPeerId`. */
export function listOwnedSubtasks(
  store: ArbitrationStore,
  localPeerId: string,
): string[] {
  const out: string[] = [];
  for (const [subtaskId, entry] of store.entries()) {
    if (isChainArbitrationEntry(entry) && entry.currentOwnerPeerId === localPeerId) {
      out.push(subtaskId);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verdict ledger (Phase 41 / MAP — Sprint 2)
// ---------------------------------------------------------------------------

/**
 * Append a signed verdict to the store. Idempotent: re-applying the same
 * signed entry is a no-op. A genuinely new verdict for the same
 * (subtask, runtime) slot replaces the old one (re-verification).
 *
 * **Who writes (Sprint 3):** the authoritative writer is the orchestrator's
 * verification flow (rule/LLM/cross verifiers when it re-verifies a worker's
 * result — design §7.1 rejects self-reported reputation, so the worker's own
 * advisory `adapter.verify` must NOT record entries). Until that flow lands,
 * readers (`getVerdictsFor` → the 3-tuple book) return empty by design.
 */
export function recordVerdictEntry(
  store: ArbitrationStore,
  entry: VerdictEntry,
): ArbitrationStore {
  const key = verdictLedgerKey(entry.subtaskId, entry.workerRuntime);
  const existing = store.get(key);
  if (existing && isVerdictEntry(existing) && existing.signature === entry.signature) {
    return store;
  }
  const next = new Map(store);
  next.set(key, entry);
  return next;
}

/**
 * Read verdicts from the store, filtered by the optional criteria and sorted
 * by `issuedAt` (oldest first). Verdict entries are the Phase 41 half of the
 * store; arbitration entries are skipped.
 */
export function getVerdictsFor(
  store: ArbitrationStore,
  criteria?: {
    workerPeerId?: string;
    workerRuntime?: AgentRuntime;
    skillId?: string;
  },
): VerdictEntry[] {
  const out: VerdictEntry[] = [];
  for (const entry of store.values()) {
    if (!isVerdictEntry(entry)) continue;
    if (criteria?.workerPeerId !== undefined && entry.workerPeerId !== criteria.workerPeerId) continue;
    if (criteria?.workerRuntime !== undefined && entry.workerRuntime !== criteria.workerRuntime) continue;
    if (criteria?.skillId !== undefined && entry.skillId !== criteria.skillId) continue;
    out.push(entry);
  }
  return out.sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
}

/** Latest verdict entry for a subtask (by `issuedAt`). */
export function getLatestVerdictForSubtask(
  store: ArbitrationStore,
  subtaskId: string,
): VerdictEntry | undefined {
  let latest: VerdictEntry | undefined;
  for (const entry of store.values()) {
    if (!isVerdictEntry(entry)) continue;
    if (entry.subtaskId !== subtaskId) continue;
    if (!latest || entry.issuedAt.localeCompare(latest.issuedAt) > 0) {
      latest = entry;
    }
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Convergence
// ---------------------------------------------------------------------------

export interface ApplyArbitrationResult {
  /** The new (post-converge) store. */
  store: ArbitrationStore;
  /** True when the local side already had the higher-priority entry. */
  converged: boolean;
  /** Subtask IDs whose owner changed as a result of this apply. */
  changedSubtaskIds: string[];
}

/**
 * Applies a remote arbitration entry to the local store. Returns a
 * new store; the input is not mutated.
 *
 * Convergence rules:
 *   - If the local entry is missing, the remote entry wins.
 *   - If the local and remote entries have the same arbitrationId,
 *     the apply is a no-op (idempotent).
 *   - If the remote entry has a higher seq (or same seq, more recent
 *     `createdAt`), the remote wins; otherwise the local wins and
 *     `converged` is `false`.
 */
export function applyArbitration(
  store: ArbitrationStore,
  remote: ChainArbitrationEntry,
): ApplyArbitrationResult {
  const next = new Map(store);
  const changed: string[] = [];
  let converged = true;
  for (const subtaskId of remote.subtaskIds) {
    const existing = next.get(subtaskId);
    if (!existing) {
      next.set(subtaskId, remote);
      changed.push(subtaskId);
      continue;
    }
    if (!isChainArbitrationEntry(existing)) continue; // verdict slots live under a different key
    if (existing.arbitrationId === remote.arbitrationId) {
      // Same entry — idempotent.
      continue;
    }
    const localWins = isLocalEntryWinning(existing, remote);
    if (localWins) {
      converged = false;
    } else {
      next.set(subtaskId, remote);
      changed.push(subtaskId);
    }
  }
  return { store: next, converged, changedSubtaskIds: changed };
}

/**
 * Records a local arbitration entry. Used when the local orchestrator
 * initiates a handoff or arbitration. Returns the updated store.
 */
export function recordLocalEntry(
  store: ArbitrationStore,
  entry: ChainArbitrationEntry,
): ArbitrationStore {
  const next = new Map(store);
  for (const subtaskId of entry.subtaskIds) {
    next.set(subtaskId, entry);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Loss recovery
// ---------------------------------------------------------------------------

export interface ReleaseOwnershipResult {
  /** Subtask IDs the local orchestrator no longer owns. */
  releasedSubtaskIds: string[];
  /** New awards map (mutated copy). */
  newAwards: Map<string, unknown>;
}

/**
 * Releases ownership of the given subtasks locally. Caller is
 * responsible for:
 *   - Releasing budget reservations in `ChainBudgetLedger`.
 *   - Cancelling the in-flight subtask (send `task.chain.cancel` to
 *     the worker).
 *
 * The function does NOT send any envelopes; it just updates the
 * orchestrator's local awards map. Pure function.
 */
export function releaseOwnership<A>(
  store: ArbitrationStore,
  awards: Map<string, A>,
  localPeerId: string,
  subtaskIds: string[],
): ReleaseOwnershipResult {
  const released: string[] = [];
  const newAwards = new Map(awards);
  for (const subtaskId of subtaskIds) {
    const entry = store.get(subtaskId);
    if (!isChainArbitrationEntry(entry)) continue;
    if (entry.currentOwnerPeerId !== localPeerId) continue;
    // Caller is expected to also remove from the store. Here we just
    // note that ownership was released.
    released.push(subtaskId);
    newAwards.delete(subtaskId);
  }
  return { releasedSubtaskIds: released, newAwards };
}

/**
 * Convenience: returns the subtask IDs in `subtaskIds` that the
 * local orchestrator no longer owns after applying `remote`. The
 * caller is expected to call `releaseOwnership` with these IDs to
 * drop the local awards and free budget.
 */
export function findLostSubtasks(
  store: ArbitrationStore,
  remote: ChainArbitrationEntry,
  localPeerId: string,
): string[] {
  const lost: string[] = [];
  for (const subtaskId of remote.subtaskIds) {
    const localEntry = store.get(subtaskId);
    if (!isChainArbitrationEntry(localEntry)) continue;
    if (localEntry.currentOwnerPeerId === localPeerId) {
      // We had it, but the remote entry might steal it.
      if (isLocalEntryWinning(localEntry, remote)) continue;
      lost.push(subtaskId);
    }
  }
  return lost;
}
