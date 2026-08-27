/**
 * Phase 60E — speculative attempt helpers for the chain orchestrator.
 */

import {
  evaluateChainSpeculation,
  fingerprintSpeculativeOutput,
  selectSpeculativeFinal,
  type ChainSpeculationDecision,
  type SpeculativeFinalSelection,
  type SpeculativeFinalSelectionInput,
} from "@envoymesh/api";
import type { ChainTeamStrategyId } from "@envoymesh/api";
import type { TaskChainPartialPayload } from "@envoymesh/protocol";
import type { ChainState, ChainAttemptState } from "./chain-orchestrator.js";
import { randomUUID } from "node:crypto";

export type SpeculativeFinalsContext = {
  /** When absent, finals with a stored final partial count as verified. */
  verificationPassed?: (input: {
    attempt: ChainAttemptState;
    partial?: TaskChainPartialPayload;
  }) => boolean;
};

function partialPayloadForAttempt(
  state: ChainState,
  subtaskId: string,
  attempt: ChainAttemptState,
): TaskChainPartialPayload | undefined {
  const byAttempt = state.partialsByAttempt.get(attempt.attemptId);
  if (byAttempt) return byAttempt;
  const legacy = state.partials.get(subtaskId);
  if (legacy?.partial.workerPeerId === attempt.workerPeerId) return legacy;
  return undefined;
}

/** Build selection input rows for one subtask (no state mutation). */
export function buildSpeculativeFinalsInput(
  state: ChainState,
  subtaskId: string,
  ctx?: SpeculativeFinalsContext,
): SpeculativeFinalSelectionInput["finals"] {
  const attempts = [...state.attempts.values()].filter((a) => a.subtaskId === subtaskId);
  return attempts
    .filter((a) => a.state === "final_received" || a.state === "selected")
    .map((attempt) => {
      const partial = partialPayloadForAttempt(state, subtaskId, attempt);
      const verificationPassed =
        ctx?.verificationPassed?.({ attempt, partial }) ??
        (partial?.partial.isFinal === true);
      return {
        attemptId: attempt.attemptId,
        acceptedCostUsd: attempt.acceptedCostUsd,
        finalizedAt: attempt.updatedAt,
        outputFingerprint: fingerprintSpeculativeOutput({
          note: partial?.partial.note,
          artifactKeys: partial?.partial.namedArtifacts?.map((x) => x.key),
        }),
        verificationPassed,
      };
    });
}

/** Classify speculative finals without mutating attempt selection state. */
export function classifySpeculativeFinalSelection(
  state: ChainState,
  subtaskId: string,
  ctx?: SpeculativeFinalsContext,
): SpeculativeFinalSelection {
  return selectSpeculativeFinal({
    finals: buildSpeculativeFinalsInput(state, subtaskId, ctx),
  });
}

/** Ledger allocation key for the speculative sibling (primary keeps bare subtaskId). */
export function speculativeLedgerKey(subtaskId: string): string {
  return `${subtaskId}::speculative`;
}

export function decideSpeculationForSubtask(input: {
  state: ChainState;
  strategyId: ChainTeamStrategyId;
  maxAttemptsPerStep: number;
  independentWorkerCount: number;
  disclosureAllowed: boolean;
  hasNonIdempotentSideEffects?: boolean;
  predictedP75LatencyMs?: number;
}): ChainSpeculationDecision {
  const snap = input.state.ledger.snapshot();
  const remaining =
    input.state.chainMandate.maxChainCostUsd -
    (snap.committedUsd + snap.reservedUsd + snap.synthesisSpendUsd);
  const costCeiling =
    input.state.chainMandate.costCeilingUsd ?? Math.min(3, remaining);
  return evaluateChainSpeculation({
    strategyId: input.strategyId,
    maxAttemptsPerStep: input.maxAttemptsPerStep,
    maxParallelAttemptsPerStep: input.state.chainMandate.maxParallelAttemptsPerStep,
    criticality: input.state.chainMandate.criticality,
    worstCaseCostUsd: costCeiling * 2,
    remainingBudgetUsd: Math.max(0, remaining),
    disclosureAllowed: input.disclosureAllowed,
    independentWorkerCount: input.independentWorkerCount,
    hasNonIdempotentSideEffects: input.hasNonIdempotentSideEffects === true,
    predictedP75LatencyMs: input.predictedP75LatencyMs,
    speculationEnabled: input.state.chainMandate.speculationEnabled,
  });
}

/**
 * Phase 63 — orchestrator auto-resolve when speculation is on and
 * the two attempts return disagreeing / failing finals. Picks the
 * cheaper verified attempt (deterministic, no LLM) for
 * `disagree_needs_verify`; reassigns the step for `none_pass`.
 *
 * Guarantees: with `chainMandate.speculationOnDisagreement === "auto"`
 * the chain never blocks on a speculation disagreement — the
 * orchestrator always advances (or fails the step after the
 * `reassign_cap` budget is exhausted).
 */
export type AutoResolveResult =
  | {
      ok: true;
      action: "auto_pick" | "auto_reassign";
      selectedAttemptId?: string;
      nextWorkerPeerId?: string;
      reason: string;
    }
  | { ok: false; reason: string };

export function autoResolveSpeculativeDisagreement(input: {
  state: ChainState;
  subtaskId: string;
  selectionReason: "disagree_needs_verify" | "none_pass";
  now?: Date;
}): AutoResolveResult {
  const now = input.now ?? new Date();
  const attempts = [...input.state.attempts.values()].filter(
    (a) => a.subtaskId === input.subtaskId,
  );
  if (input.selectionReason === "none_pass") {
    // Both attempts failed verification — do not auto-pick. Caller is
    // expected to invoke `reassignStalledSubtask` from the wire
    // path; the return value here only documents the decision.
    return {
      ok: true,
      action: "auto_reassign",
      reason: "auto_reassign_none_pass",
    };
  }
  // disagree_needs_verify: deterministic pick — cheaper verified attempt.
  const passed = attempts.filter((a) => a.state === "final_received");
  if (passed.length === 0) {
    return { ok: false, reason: "no_verified_finals" };
  }
  // Tie-break: cheaper cost, then earlier final.
  const ranked = [...passed].sort((a, b) => {
    if (a.acceptedCostUsd !== b.acceptedCostUsd) {
      return a.acceptedCostUsd - b.acceptedCostUsd;
    }
    return a.updatedAt.localeCompare(b.updatedAt);
  });
  const winner = ranked[0]!;
  input.state.journalEvent?.("speculation.auto_pick", {
    subtaskId: input.subtaskId,
    selectedAttemptId: winner.attemptId,
    reason: "auto_pick_disagree_cheaper",
    resolvedAt: now.toISOString(),
  });
  return {
    ok: true,
    action: "auto_pick",
    selectedAttemptId: winner.attemptId,
    reason: "auto_pick_disagree_cheaper",
  };
}

/** Create a speculative sibling attempt (does not replace the primary award). */
export function createSpeculativeAttempt(
  state: ChainState,
  input: {
    subtaskId: string;
    workerPeerId: string;
    acceptedCostUsd: number;
    now?: Date;
  },
): ChainAttemptState {
  const now = input.now ?? new Date();
  const previous = [...state.attempts.values()].filter((a) => a.subtaskId === input.subtaskId);
  const attempt: ChainAttemptState = {
    attemptId: `attempt_${randomUUID()}`,
    chainId: state.chainId,
    subtaskId: input.subtaskId,
    workerPeerId: input.workerPeerId,
    role: "speculative",
    state: "awarded",
    attemptNumber: previous.length + 1,
    acceptedCostUsd: input.acceptedCostUsd,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  state.attempts.set(attempt.attemptId, attempt);
  state.journalEvent?.("attempt.awarded", { ...attempt });
  return attempt;
}

export function selectAmongSpeculativeFinals(
  state: ChainState,
  subtaskId: string,
  ctx?: SpeculativeFinalsContext,
): {
  selectedAttemptId?: string;
  reason: string;
} {
  const attempts = [...state.attempts.values()].filter((a) => a.subtaskId === subtaskId);
  const decision = classifySpeculativeFinalSelection(state, subtaskId, ctx);
  if (decision.selectedAttemptId) {
    for (const a of attempts) {
      if (a.attemptId === decision.selectedAttemptId) {
        a.state = "selected";
        state.selectedAttemptBySubtask.set(subtaskId, a.attemptId);
      } else if (a.state === "final_received") {
        a.state = "rejected";
        a.lastReason = "speculative_not_selected";
      }
    }
  }
  return {
    selectedAttemptId: decision.selectedAttemptId,
    reason: decision.reason,
  };
}
