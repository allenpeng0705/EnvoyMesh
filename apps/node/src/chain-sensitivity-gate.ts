/**
 * Phase 43G — Sensitivity gate for chain worker awards.
 *
 * Two independent gates:
 * 1. Bond trust (`bondMaxSensitivity` / `requiresChainAwardApproval`).
 * 2. Reputation (Phase 41 / MAP — `requiresReputationApproval`): progressive
 *    trust keyed off the worker's verdict history. A brand-new peer can take
 *    `public` work immediately; it must earn ≥60% pass rate for `friends` and
 *    ≥85% with ≥10 verdicts for `private`.
 */

import type { BondLevel } from "@envoymesh/api";
import type { ChainMandate } from "@envoymesh/protocol";

export type SensitivityLevel = "public" | "friends" | "private";

const SENSITIVITY_RANK: Record<SensitivityLevel, number> = {
  public: 0,
  friends: 1,
  private: 2,
};

/**
 * Minimum reputation pass rate for each sensitivity tier (design §7.4).
 * `public` never gates on reputation.
 */
export const MIN_REP_FOR_SENSITIVITY: Record<SensitivityLevel, number> = {
  public: 0,
  friends: 0.6,
  private: 0.85,
};

/** Minimum verdict count before a worker may take `private`-sensitivity work. */
export const MIN_VERDICTS_FOR_PRIVATE = 10;

/** Max data sensitivity a bond level may handle without owner approval. */
export function bondMaxSensitivity(level: BondLevel): SensitivityLevel | null {
  switch (level) {
    case "direct":
      return "private";
    case "referred":
      return "friends";
    case "public":
      return "public";
    case "blocked":
      return null;
    default:
      return "public";
  }
}

export function requiresChainAwardApproval(
  mandate: ChainMandate,
  workerBondLevel: BondLevel,
): { required: boolean; reason?: string } {
  const mandateRank = SENSITIVITY_RANK[mandate.maxSensitivity as SensitivityLevel] ?? 0;
  const bondMax = bondMaxSensitivity(workerBondLevel);
  if (!bondMax) {
    return { required: true, reason: "worker bond is blocked" };
  }
  const bondRank = SENSITIVITY_RANK[bondMax];
  if (mandateRank > bondRank) {
    return {
      required: true,
      reason: `chain sensitivity (${mandate.maxSensitivity}) exceeds bond trust (${workerBondLevel} → max ${bondMax})`,
    };
  }
  return { required: false };
}

/**
 * Reputation-as-gate (Phase 41, design §7.4). `workerRuntime` is only used to
 * make the reason string precise; `workerReputation` and `workerVerdictCount`
 * are the (peer, runtime, skill)-scoped values from the 3-tuple book.
 */
export function requiresReputationApproval(
  mandate: ChainMandate,
  workerRuntime: string,
  workerReputation: number,
  workerVerdictCount: number,
): { required: boolean; reason?: string } {
  const sensitivity = (mandate.maxSensitivity as SensitivityLevel) ?? "public";
  if (sensitivity === "public") {
    return { required: false };
  }
  if (sensitivity === "private" && workerVerdictCount < MIN_VERDICTS_FOR_PRIVATE) {
    return {
      required: true,
      reason: `worker has only ${workerVerdictCount} verdicts; need ≥${MIN_VERDICTS_FOR_PRIVATE} for private-sensitivity work`,
    };
  }
  const minRep = MIN_REP_FOR_SENSITIVITY[sensitivity];
  if (workerReputation < minRep) {
    return {
      required: true,
      reason: `worker ${workerRuntime} reputation ${workerReputation.toFixed(2)} < required ${minRep} for ${sensitivity}`,
    };
  }
  return { required: false };
}
