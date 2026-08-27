/**
 * Phase 60E — bounded speculative execution policy.
 *
 * Design: docs/agent-network-next-generation-design.md §6–7
 * Checklist: docs/implementation-plan.md §Phase 60E
 *
 * Modes:
 * - immediate_dual — start two attempts together
 * - hedged — start second after primary exceeds p75×1.25 latency
 * - verify_only — one worker + independent verifier (not dual execution)
 */

import type { ChainTeamStrategyId } from "@envoymesh/api";

export type ChainSpeculationMode = "immediate_dual" | "hedged" | "verify_only" | "off";

export type ChainSpeculationGateFailure =
  | "not_critical"
  | "mandate_cap"
  | "budget"
  | "disclosure"
  | "insufficient_workers"
  | "side_effecting"
  | "strategy_disabled"
  | "owner_disabled";

export type ChainSpeculationDecision =
  | {
      ok: true;
      mode: Exclude<ChainSpeculationMode, "off">;
      maxAttempts: 2;
      hedgeAfterMs?: number;
    }
  | { ok: false; mode: "off"; reason: ChainSpeculationGateFailure };

export type ChainSpeculationGateInput = {
  strategyId: ChainTeamStrategyId;
  /** Strategy preset maxAttemptsPerStep. */
  maxAttemptsPerStep: number;
  /** Mandate parallel cap (defaults to 1 when unset). */
  maxParallelAttemptsPerStep?: number;
  /** Step or job criticality. */
  criticality?: "normal" | "high";
  /** Worst-case USD for all speculative attempts + verification. */
  worstCaseCostUsd: number;
  /** Remaining chain budget USD. */
  remainingBudgetUsd: number;
  /** Owner/disclosure allows every selected worker. */
  disclosureAllowed: boolean;
  /** Count of independent qualified workers/runtimes. */
  independentWorkerCount: number;
  /** Step uses non-idempotent side effects (file write, send, purchase…). */
  hasNonIdempotentSideEffects: boolean;
  /** Optional predicted p75 latency for hedge delay. */
  predictedP75LatencyMs?: number;
  /**
   * Phase 63 — owner opt-in for speculative execution. Defaults to
   * `false` (off). When `false`, the speculation gate returns
   * `mode: "off"` with `reason: "owner_disabled"` regardless of
   * the strategy preset's default mode.
   */
  speculationEnabled?: boolean;
};

/** Map strategy → default speculation mode when gates pass. */
export function speculationModeForStrategy(
  strategyId: ChainTeamStrategyId,
): ChainSpeculationMode {
  switch (strategyId) {
    case "highest-confidence":
    case "diverse-model":
      return "immediate_dual";
    case "fastest":
      return "hedged";
    case "balanced":
      return "verify_only";
    case "cheapest":
    case "privacy-local":
    default:
      return "off";
  }
}

export function evaluateChainSpeculation(
  input: ChainSpeculationGateInput,
): ChainSpeculationDecision {
  // Phase 63 — owner opt-in gate. Default off so single-worker is the
  // safe default; strategy preset modes are only honored when the
  // owner explicitly enables speculation in the New Team job dialog.
  if (input.speculationEnabled !== true) {
    return { ok: false, mode: "off", reason: "owner_disabled" };
  }
  const mode = speculationModeForStrategy(input.strategyId);
  if (mode === "off") {
    return { ok: false, mode: "off", reason: "strategy_disabled" };
  }

  const mandateCap = input.maxParallelAttemptsPerStep ?? 1;
  if (mandateCap < 2 && mode !== "verify_only") {
    return { ok: false, mode: "off", reason: "mandate_cap" };
  }
  if (input.maxAttemptsPerStep < 2 && mode !== "verify_only") {
    return { ok: false, mode: "off", reason: "strategy_disabled" };
  }

  // Balanced verify_only / dual modes for high criticality or strategy enablement.
  const strategyEnables =
    input.strategyId === "highest-confidence" ||
    input.strategyId === "diverse-model" ||
    input.strategyId === "fastest" ||
    (input.strategyId === "balanced" && input.criticality === "high");
  if (!strategyEnables && input.criticality !== "high") {
    return { ok: false, mode: "off", reason: "not_critical" };
  }

  if (input.hasNonIdempotentSideEffects) {
    return { ok: false, mode: "off", reason: "side_effecting" };
  }
  if (!input.disclosureAllowed) {
    return { ok: false, mode: "off", reason: "disclosure" };
  }
  if (input.independentWorkerCount < 2) {
    return { ok: false, mode: "off", reason: "insufficient_workers" };
  }
  if (input.worstCaseCostUsd > input.remainingBudgetUsd) {
    return { ok: false, mode: "off", reason: "budget" };
  }

  if (mode === "hedged") {
    const p75 = input.predictedP75LatencyMs ?? 30_000;
    return {
      ok: true,
      mode: "hedged",
      maxAttempts: 2,
      hedgeAfterMs: Math.max(1_000, Math.round(p75 * 1.25)),
    };
  }
  if (mode === "verify_only") {
    return { ok: true, mode: "verify_only", maxAttempts: 2 };
  }
  return { ok: true, mode: "immediate_dual", maxAttempts: 2 };
}

export type SpeculativeFinalSelectionInput = {
  finals: Array<{
    attemptId: string;
    acceptedCostUsd: number;
    finalizedAt: string;
    /** Deterministic structural fingerprint of the result. */
    outputFingerprint: string;
    verificationPassed: boolean;
  }>;
};

export type SpeculativeFinalSelection =
  | { selectedAttemptId: string; reason: "single_pass" | "equivalent_cheaper" | "equivalent_earlier" }
  | { selectedAttemptId?: undefined; reason: "disagree_needs_verify" | "none_pass" };

/**
 * Deterministic selection among speculative finals.
 * Never first-response-wins for disagreement.
 */
export function selectSpeculativeFinal(
  input: SpeculativeFinalSelectionInput,
): SpeculativeFinalSelection {
  const passed = input.finals.filter((f) => f.verificationPassed);
  if (passed.length === 0) return { reason: "none_pass" };
  if (passed.length === 1) {
    return { selectedAttemptId: passed[0]!.attemptId, reason: "single_pass" };
  }
  const fingerprints = new Set(passed.map((f) => f.outputFingerprint));
  if (fingerprints.size > 1) {
    return { reason: "disagree_needs_verify" };
  }
  // Equivalent structured outputs → lower cost, then earlier final.
  const ranked = [...passed].sort((a, b) => {
    if (a.acceptedCostUsd !== b.acceptedCostUsd) {
      return a.acceptedCostUsd - b.acceptedCostUsd;
    }
    return a.finalizedAt.localeCompare(b.finalizedAt);
  });
  const winner = ranked[0]!;
  const costTied = ranked.filter((f) => f.acceptedCostUsd === winner.acceptedCostUsd);
  if (costTied.length > 1) {
    return { selectedAttemptId: winner.attemptId, reason: "equivalent_earlier" };
  }
  return { selectedAttemptId: winner.attemptId, reason: "equivalent_cheaper" };
}

/** Fingerprint helper for structured note + artifact keys. */
export function fingerprintSpeculativeOutput(input: {
  note?: string;
  artifactKeys?: string[];
}): string {
  const note = (input.note ?? "").trim().replace(/\s+/g, " ").slice(0, 400);
  const arts = [...(input.artifactKeys ?? [])].sort().join(",");
  return `${note}|${arts}`;
}
