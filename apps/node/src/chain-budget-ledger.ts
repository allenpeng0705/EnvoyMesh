/**
 * Phase 40 — Orchestrator-side ChainBudgetLedger.
 *
 * Tracks per-chain spend in-memory so a single orchestrator node cannot
 * over-commit its signed `maxChainCostUsd` across N parallel worker awards.
 *
 * **Why this lives in the orchestrator only:** workers never see peers, so
 * they cannot enforce an aggregate budget — only the orchestrator can. The
 * ledger is the canonical enforcement point; `chain-orchestrator.ts` calls
 * `reserve()` before sending a `task.chain.accept`, `tryCommit()` when the
 * worker confirms work has begun, `release()` on cancellation, and
 * `finalize()` when the chain publishes its `ChainReport`.
 *
 * **Concurrency:** `reserve/tryCommit/release/finalize` mutate shared state
 * (reserved, committed, spent). We use a per-chain mutex via a serial promise
 * queue so concurrent calls on the same chainId serialize naturally. Different
 * chains can run in parallel because they hold independent state.
 *
 * **Invariant:** `Σ workerAllocations.committedUsd + synthesisSpendUsd
 * ≤ maxChainCostUsd`. Enforced at every state transition; violations throw.
 *
 * See docs/agent_network.md §7.5 for the design rationale.
 */

import type { ChainMandate, ChainReport } from "@envoymesh/protocol";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ChainBudgetLedgerState {
  chainId: string;
  maxChainCostUsd: number;
  reservedUsd: number;
  committedUsd: number;
  synthesisSpendUsd: number;
  /**
   * Wall-clock sum of every worker's `acceptedCostUsd` (regardless of whether
   * the work completed). Equivalent to `committedUsd + released-back amount`.
   * Tracked separately so the UI can show "spent vs budget" without exposing
   * the reserve-vs-commit split.
   */
  totalAcceptedUsd: number;
  workerAllocations: Map<string, ChainBudgetWorkerAllocation>;
  /**
   * Phase 41 / MAP — verification budget (design §8.2). `maxChainCostUsd`
   * includes verification: a verifier spend that would exceed the ceiling is
   * denied and the orchestrator downgrades to rule-only verification.
   */
  verificationReservedUsd: number;
  verificationCommittedUsd: number;
  verificationAllocations: Map<string, ChainVerificationAllocation>;
}

export interface ChainBudgetWorkerAllocation {
  subtaskId: string;
  workerPeerId: string;
  /** Cost the orchestrator reserved at award time. */
  reservedUsd: number;
  /** Cost actually committed (== reserved when worker started work; 0 when released). */
  committedUsd: number;
  /** ISO datetime the award was sent. */
  awardedAt: string;
}

/** One verifier run's budget slot (cross-agent escalation, LLM verifier, …). */
export interface ChainVerificationAllocation {
  subtaskId: string;
  reservedUsd: number;
  committedUsd: number;
}

export type LedgerOpResult<T> = { ok: true; value: T } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Ledger interface
// ---------------------------------------------------------------------------

export interface ChainBudgetLedger {
  /**
   * Reserve `amountUsd` against `maxChainCostUsd` for a single worker award.
   * Returns the reservation id (== subtaskId) on success. Fails (does NOT throw)
   * if the reservation would push reserved + committed + synthesisSpend past the
   * budget — caller must decide whether to surface the denial to the owner.
   *
   * All mutating methods are async because they serialize through a per-chain
   * promise queue. Sync reads (`snapshot`, `isFinalized`) bypass the queue.
   */
  reserve(
    subtaskId: string,
    workerPeerId: string,
    amountUsd: number,
  ): Promise<LedgerOpResult<string>>;
  /**
   * Promote a reservation to committed spend. Called when the worker
   * acknowledges the award (or the heartbeat loop confirms work has started).
   * Idempotent: a second call for the same subtaskId is a no-op.
   */
  tryCommit(subtaskId: string): Promise<LedgerOpResult<ChainBudgetWorkerAllocation>>;
  /**
   * Release a reservation back to free budget. Called on `task.chain.cancel`
   * or when a worker bid is rejected post-award. Idempotent.
   */
  release(
    subtaskId: string,
    reason: string,
  ): Promise<LedgerOpResult<ChainBudgetWorkerAllocation>>;
  /**
   * Pre-flight check: would `estimatedUsd` of synthesis cost fit in the
   * remaining budget (after reserved + committed + already-spent synthesis)?
   * If `estimatedUsd` is omitted, returns the headroom available.
   */
  synthesisBudgetPreFlight(
    estimatedUsd?: number,
  ): Promise<LedgerOpResult<{ headroomUsd: number }>>;
  /**
   * Record actual synthesis spend. Called once when the chain-report-synthesizer
   * finishes its LLM aggregation pass. Idempotent: a second call for the same
   * chainId is a no-op (returns the first recorded value).
   */
  recordSynthesisSpend(amountUsd: number): Promise<LedgerOpResult<number>>;
  /**
   * Phase 41 / MAP — reserve `amountUsd` for a verifier run (cross-agent
   * escalation, LLM verifier, …) against `maxChainCostUsd`. Verification is
   * budgeted like worker awards; a denial means the orchestrator downgrades
   * to rule-only verification (design §8.2). Fails (does NOT throw) when the
   * reservation would push aggregate spend past the ceiling.
   */
  reserveVerification(
    subtaskId: string,
    amountUsd: number,
  ): Promise<LedgerOpResult<number>>;
  /**
   * Promote a verification reservation to committed spend. Idempotent: a
   * second call for the same subtaskId is a no-op (returns the existing
   * committed amount).
   */
  tryCommitVerification(subtaskId: string): Promise<LedgerOpResult<number>>;
  /**
   * Release an un-committed verification reservation back to free budget.
   * Called when the escalation is skipped or the run never happened. Idempotent.
   */
  releaseVerification(
    subtaskId: string,
    reason: string,
  ): Promise<LedgerOpResult<number>>;
  /**
   * Finalize the chain on `ChainReport` publish. Locks in the final
   * `totalAcceptedUsd + synthesisSpendUsd` and returns a snapshot suitable for
   * the report's `chainSummary`. Throws if the invariant is violated.
   */
  finalize(report: ChainReport): Promise<LedgerOpResult<ChainBudgetLedgerState>>;
  /** Read-only snapshot of current state. */
  snapshot(): ChainBudgetLedgerState;
  /** True if the chain is finalized (no further reserve/tryCommit allowed). */
  isFinalized(): boolean;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createChainBudgetLedger(
  mandate: ChainMandate,
  restored?: ChainBudgetLedgerState,
): ChainBudgetLedger {
  const state: ChainBudgetLedgerState = restored ? {
    ...restored,
    workerAllocations: new Map(restored.workerAllocations),
    verificationAllocations: new Map(restored.verificationAllocations),
  } : {
    chainId: mandate.chainId,
    maxChainCostUsd: mandate.maxChainCostUsd,
    reservedUsd: 0,
    committedUsd: 0,
    synthesisSpendUsd: 0,
    totalAcceptedUsd: 0,
    workerAllocations: new Map(),
    verificationReservedUsd: 0,
    verificationCommittedUsd: 0,
    verificationAllocations: new Map(),
  };
  let finalized = false;

  // Per-chain serial queue. Different chains don't share this queue so they
  // can mutate independently.
  let opChain: Promise<unknown> = Promise.resolve();
  function enqueueOp<T>(op: () => Promise<T> | T): Promise<T> {
    const done = opChain.then(() => op());
    opChain = done.then(
      () => undefined,
      () => undefined,
    );
    return done as Promise<T>;
  }

  function committedTotal(): number {
    return state.committedUsd + state.synthesisSpendUsd + state.verificationCommittedUsd;
  }

  function checkInvariant(reason: string): void {
    const total = committedTotal();
    if (total > state.maxChainCostUsd) {
      throw new Error(
        `ChainBudgetLedger invariant violated for ${state.chainId}: ` +
          `committed=${total} > maxChainCostUsd=${state.maxChainCostUsd} (${reason})`,
      );
    }
  }

  function headroom(): number {
    return Math.max(
      0,
      state.maxChainCostUsd - committedTotal() - state.reservedUsd - state.verificationReservedUsd,
    );
  }

  return {
    reserve(subtaskId, workerPeerId, amountUsd) {
      return enqueueOp(() => {
        if (finalized) {
          return { ok: false, reason: "ledger finalized; no further reservations allowed" };
        }
        if (state.workerAllocations.has(subtaskId)) {
          return {
            ok: false,
            reason: `subtask ${subtaskId} already has a reservation`,
          };
        }
        if (amountUsd < 0) {
          return { ok: false, reason: "amountUsd must be >= 0" };
        }
        const projectedSpend =
          committedTotal() + state.reservedUsd + state.verificationReservedUsd + amountUsd;
        if (projectedSpend > state.maxChainCostUsd) {
          return {
            ok: false,
            reason:
              `reservation of ${amountUsd} would push aggregate spend past ` +
              `maxChainCostUsd=${state.maxChainCostUsd} (currently committed=${committedTotal()} ` +
              `reserved=${state.reservedUsd})`,
          };
        }
        state.reservedUsd += amountUsd;
        state.workerAllocations.set(subtaskId, {
          subtaskId,
          workerPeerId,
          reservedUsd: amountUsd,
          committedUsd: 0,
          awardedAt: new Date().toISOString(),
        });
        return { ok: true, value: subtaskId };
      });
    },

    tryCommit(subtaskId) {
      return enqueueOp(() => {
        if (finalized) {
          return { ok: false, reason: "ledger finalized" };
        }
        const alloc = state.workerAllocations.get(subtaskId);
        if (!alloc) {
          return { ok: false, reason: `no reservation for subtask ${subtaskId}` };
        }
        if (alloc.committedUsd > 0) {
          // Idempotent: already committed. Return the existing allocation.
          return { ok: true, value: alloc };
        }
        // Move from reserved → committed.
        state.reservedUsd -= alloc.reservedUsd;
        state.committedUsd += alloc.reservedUsd;
        state.totalAcceptedUsd += alloc.reservedUsd;
        const updated: ChainBudgetWorkerAllocation = {
          ...alloc,
          committedUsd: alloc.reservedUsd,
        };
        state.workerAllocations.set(subtaskId, updated);
        checkInvariant("tryCommit");
        return { ok: true, value: updated };
      });
    },

    release(subtaskId, reason) {
      return enqueueOp(() => {
        if (finalized) {
          return { ok: false, reason: "ledger finalized" };
        }
        const alloc = state.workerAllocations.get(subtaskId);
        if (!alloc) {
          // Idempotent: nothing to release.
          return {
            ok: true,
            value: {
              subtaskId,
              workerPeerId: "",
              reservedUsd: 0,
              committedUsd: 0,
              awardedAt: new Date().toISOString(),
            },
          };
        }
        // Only release the un-committed portion of the reservation.
        const uncommitted = alloc.reservedUsd - alloc.committedUsd;
        if (uncommitted > 0) {
          state.reservedUsd -= uncommitted;
        }
        state.workerAllocations.delete(subtaskId);
        checkInvariant(`release (${reason})`);
        // Return a synthetic allocation that records what was released for audit.
        return {
          ok: true,
          value: { ...alloc, reservedUsd: uncommitted, committedUsd: alloc.committedUsd },
        };
      });
    },

    synthesisBudgetPreFlight(estimatedUsd) {
      return enqueueOp(() => {
        if (typeof estimatedUsd === "number") {
          if (estimatedUsd < 0) {
            return { ok: false, reason: "estimatedUsd must be >= 0" };
          }
          // Projection must include reserved (un-committed) so we don't
          // over-promise the synthesis budget against in-flight awards.
          const projected =
            committedTotal() + state.reservedUsd + state.verificationReservedUsd + estimatedUsd;
          if (projected > state.maxChainCostUsd) {
            return {
              ok: false,
              reason:
                `synthesis would cost ${estimatedUsd}, exceeding remaining budget ` +
                `${headroom()} (maxChainCostUsd=${state.maxChainCostUsd}, ` +
                `committed=${committedTotal()}, reserved=${state.reservedUsd})`,
            };
          }
          return { ok: true, value: { headroomUsd: state.maxChainCostUsd - projected } };
        }
        return { ok: true, value: { headroomUsd: headroom() } };
      });
    },

    recordSynthesisSpend(amountUsd) {
      return enqueueOp(() => {
        if (finalized) {
          return { ok: false, reason: "ledger finalized" };
        }
        if (amountUsd < 0) {
          return { ok: false, reason: "amountUsd must be >= 0" };
        }
        if (state.synthesisSpendUsd > 0) {
          // Idempotent: return the first recorded value.
          return { ok: true, value: state.synthesisSpendUsd };
        }
        const projected = state.committedUsd + amountUsd;
        if (projected > state.maxChainCostUsd) {
          return {
            ok: false,
            reason:
              `synthesis spend ${amountUsd} would push committed=${projected} ` +
              `past maxChainCostUsd=${state.maxChainCostUsd}`,
          };
        }
        state.synthesisSpendUsd = amountUsd;
        checkInvariant("recordSynthesisSpend");
        return { ok: true, value: amountUsd };
      });
    },

    reserveVerification(subtaskId, amountUsd) {
      return enqueueOp(() => {
        if (finalized) {
          return { ok: false, reason: "ledger finalized; no further verification reservations allowed" };
        }
        if (state.verificationAllocations.has(subtaskId)) {
          return {
            ok: false,
            reason: `subtask ${subtaskId} already has a verification reservation`,
          };
        }
        if (amountUsd < 0) {
          return { ok: false, reason: "amountUsd must be >= 0" };
        }
        const projectedSpend = committedTotal() + state.reservedUsd + state.verificationReservedUsd + amountUsd;
        if (projectedSpend > state.maxChainCostUsd) {
          return {
            ok: false,
            reason:
              `verification reservation of ${amountUsd} would push aggregate spend past ` +
              `maxChainCostUsd=${state.maxChainCostUsd} (currently committed=${committedTotal()} ` +
              `reserved=${state.reservedUsd} verificationReserved=${state.verificationReservedUsd})`,
          };
        }
        state.verificationReservedUsd += amountUsd;
        state.verificationAllocations.set(subtaskId, {
          subtaskId,
          reservedUsd: amountUsd,
          committedUsd: 0,
        });
        return { ok: true, value: amountUsd };
      });
    },

    tryCommitVerification(subtaskId) {
      return enqueueOp(() => {
        if (finalized) {
          return { ok: false, reason: "ledger finalized" };
        }
        const alloc = state.verificationAllocations.get(subtaskId);
        if (!alloc) {
          return { ok: false, reason: `no verification reservation for subtask ${subtaskId}` };
        }
        if (alloc.committedUsd > 0) {
          // Idempotent: already committed. Return the existing amount.
          return { ok: true, value: alloc.committedUsd };
        }
        state.verificationReservedUsd -= alloc.reservedUsd;
        state.verificationCommittedUsd += alloc.reservedUsd;
        state.verificationAllocations.set(subtaskId, {
          ...alloc,
          committedUsd: alloc.reservedUsd,
        });
        checkInvariant("tryCommitVerification");
        return { ok: true, value: alloc.reservedUsd };
      });
    },

    releaseVerification(subtaskId, reason) {
      return enqueueOp(() => {
        if (finalized) {
          return { ok: false, reason: "ledger finalized" };
        }
        const alloc = state.verificationAllocations.get(subtaskId);
        if (!alloc) {
          // Idempotent: nothing to release.
          return { ok: true, value: 0 };
        }
        const uncommitted = alloc.reservedUsd - alloc.committedUsd;
        if (uncommitted > 0) {
          state.verificationReservedUsd -= uncommitted;
        }
        state.verificationAllocations.delete(subtaskId);
        checkInvariant(`releaseVerification (${reason})`);
        return { ok: true, value: uncommitted };
      });
    },

    finalize(report) {
      return enqueueOp(() => {
        if (finalized) {
          return { ok: false, reason: "ledger already finalized" };
        }
        // Verify the report's chainSummary matches the ledger's final state.
        const reportWorkerTotal = report.chainSummary.workerAllocations.reduce(
          (sum: number, a: { committedUsd: number }) => sum + a.committedUsd,
          0,
        );
        if (
          Math.abs(reportWorkerTotal - state.committedUsd) > 1e-6 ||
          Math.abs(report.chainSummary.synthesisCostUsd - state.synthesisSpendUsd) > 1e-6
        ) {
          return {
            ok: false,
            reason:
              `report chainSummary mismatch: workerAllocations=${reportWorkerTotal} ` +
              `(ledger ${state.committedUsd}), synthesisCostUsd=${report.chainSummary.synthesisCostUsd} ` +
              `(ledger ${state.synthesisSpendUsd})`,
          };
        }
        finalized = true;
        checkInvariant("finalize");
        return { ok: true, value: state };
      });
    },

    snapshot() {
      // Return a defensive shallow copy. Maps are intentionally shared because
      // they're never mutated after the snapshot.
      return {
        ...state,
        workerAllocations: new Map(state.workerAllocations),
        verificationAllocations: new Map(state.verificationAllocations),
      };
    },

    isFinalized() {
      return finalized;
    },
  };
}
