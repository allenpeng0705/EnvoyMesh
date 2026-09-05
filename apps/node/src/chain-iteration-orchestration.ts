/**
 * Phase 47 — Iteration orchestration helpers extracted from
 * node-service-chain-orchestration.ts to reduce the god-module size.
 *
 * These functions are pure transformations over ChainState/ChainRuntimeEntry
 * and do not depend on the orchestration context — they can be tested
 * in isolation and imported without pulling in the full orchestration
 * dependency graph.
 */
import type { ChainGetStateResult, ChainIterationProgressEvent } from "@envoymesh/api";
import type { ChainState } from "./chain-orchestrator.js";
import type { ChainRuntimeEntry } from "./node-service-chains.js";

/**
 * Build the `iteration` snapshot for a chain state response.
 * Returns undefined if the chain has no iteration side-state.
 */
export function iterationSnapshotFromState(
  state: ChainState,
): NonNullable<ChainGetStateResult["iteration"]> | undefined {
  const it = state.iteration;
  if (!it) return undefined;
  return {
    round: it.round,
    maxRounds: it.maxRounds,
    extendsInRound: it.extendsInRound,
    maxExtendsInRound: it.maxExtendsInRound,
    waitingForOwner: it.waitingForOwner === true,
    pausedForLease: it.pausedForLease === true,
    stopReason: it.stopReason,
    drafts: it.drafts.map((d) => ({
      round: d.round,
      summary: d.summary,
      judgeDecision: d.judge?.decision,
      judgeReason: d.judge?.reason,
    })),
  };
}

/**
 * Populate `state.iteration` from the runtime's iteration side-state.
 * Called from the chain:state emit path. Mutates `state` in place.
 *
 * Note: `state` is the wire-snapshot type (ChainGetStateResult), not the
 * internal ChainState. The iteration field on the wire type has a simpler
 * shape than the internal ChainIterationState.
 */
export function populateIterationInState(
  runtime: ChainRuntimeEntry | undefined,
  state: { iteration?: NonNullable<ChainGetStateResult["iteration"]> },
): void {
  const it = runtime?.state.iteration;
  if (!it) return;
  state.iteration = iterationSnapshotFromInternal(it);
}

/**
 * Convert the internal ChainIterationState to the wire snapshot shape.
 */
function iterationSnapshotFromInternal(
  it: NonNullable<ChainState["iteration"]>,
): NonNullable<ChainGetStateResult["iteration"]> {
  return {
    round: it.round,
    maxRounds: it.maxRounds,
    extendsInRound: it.extendsInRound,
    maxExtendsInRound: it.maxExtendsInRound,
    waitingForOwner: it.waitingForOwner === true,
    pausedForLease: it.pausedForLease === true,
    stopReason: it.stopReason,
    drafts: it.drafts.map((d) => ({
      round: d.round,
      summary: d.summary,
      judgeDecision: d.judge?.decision,
      judgeReason: d.judge?.reason,
    })),
  };
}

/**
 * Build a Phase 47D iteration progress event from the runtime's
 * iteration side-state. The caller is responsible for emitting it
 * and appending the audit event.
 */
export function buildIterationProgressEvent(
  runtime: ChainRuntimeEntry | undefined,
  chainId: string,
  phase: ChainIterationProgressEvent["phase"],
  observerPeerId: string | undefined,
  extra?: {
    summary?: string;
    judgeDecision?: string;
    judgeReason?: string;
  },
): ChainIterationProgressEvent | undefined {
  const it = runtime?.state.iteration;
  if (!it) return undefined;
  return {
    chainId,
    phase,
    round: it.round,
    maxRounds: it.maxRounds,
    extendsInRound: it.extendsInRound,
    maxExtendsInRound: it.maxExtendsInRound,
    waitingForOwner: it.waitingForOwner === true,
    pausedForLease: it.pausedForLease === true,
    stopReason: it.stopReason,
    judgeDecision: extra?.judgeDecision ?? it.drafts.at(-1)?.judge?.decision,
    judgeReason: extra?.judgeReason ?? it.drafts.at(-1)?.judge?.reason,
    observerPeerId,
    summary: extra?.summary,
  };
}
