/**
 * Phase 43G — Sensitivity gate for chain worker awards.
 */

import type { BondLevel } from "@envoymesh/api";
import type { ChainMandate } from "@envoymesh/protocol";

export type SensitivityLevel = "public" | "friends" | "private";

const SENSITIVITY_RANK: Record<SensitivityLevel, number> = {
  public: 0,
  friends: 1,
  private: 2,
};

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
