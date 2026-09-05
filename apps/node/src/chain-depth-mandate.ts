/**
 * Phase 65A — mandate-bounded Team-job depth.
 *
 * Protocol hard cap is {@link CHAIN_MAX_DEPTH} (4). Effective depth is opt-in:
 *   - default → 2
 *   - `allowDepth3` → 3
 *   - `allowDepth4` → 4 (implies depth-3 permission)
 *
 * Sub-chain mandates (task.chain.delegate) must not exceed the parent's
 * depth flags, cost ceilings, or deadline.
 */

import { CHAIN_MAX_DEPTH } from "@envoymesh/protocol";

export type ChainDepthMandateFlags = {
  allowDepth3?: boolean;
  allowDepth4?: boolean;
};

export type ChainBudgetDeadlineMandate = ChainDepthMandateFlags & {
  maxChainCostUsd: number;
  costCeilingUsd: number;
  deadlineAt: string;
};

/** Default max depth when neither flag is set (orchestrator → workers). */
export const CHAIN_DEFAULT_MAX_DEPTH = 2;

/**
 * Resolve the highest depth a chain may schedule under its mandate.
 * Caps at {@link CHAIN_MAX_DEPTH}.
 */
export function resolveAllowedChainDepth(mandate: ChainDepthMandateFlags): number {
  if (mandate.allowDepth4) return Math.min(4, CHAIN_MAX_DEPTH);
  if (mandate.allowDepth3) return Math.min(3, CHAIN_MAX_DEPTH);
  return Math.min(CHAIN_DEFAULT_MAX_DEPTH, CHAIN_MAX_DEPTH);
}

/**
 * Clamp a planner-proposed depth into the mandate-allowed range (and ≥1).
 */
export function clampChainDepth(
  proposed: number,
  mandate: ChainDepthMandateFlags,
): number {
  const max = resolveAllowedChainDepth(mandate);
  const n = Math.floor(Number(proposed));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(max, n));
}

/**
 * True when a subtask depth is within the mandate budget.
 */
export function isChainDepthAllowed(
  depth: number,
  mandate: ChainDepthMandateFlags,
): boolean {
  if (!Number.isFinite(depth) || depth < 1) return false;
  if (depth > CHAIN_MAX_DEPTH) return false;
  return depth <= resolveAllowedChainDepth(mandate);
}

export type VerifySubChainMandateResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "depth_exceeds_parent"
        | "cost_exceeds_parent"
        | "estimate_exceeds_sub_budget"
        | "deadline_after_parent";
    };

/**
 * Sub-orchestrator mandate must stay inside the parent mandate envelope
 * (depth flags, USD ceilings, deadline). Used by `task.chain.delegate`.
 */
export function verifySubChainMandate(input: {
  parent: ChainBudgetDeadlineMandate;
  child: ChainBudgetDeadlineMandate;
  estimatedCostUsd?: number;
}): VerifySubChainMandateResult {
  const parentMax = resolveAllowedChainDepth(input.parent);
  const childMax = resolveAllowedChainDepth(input.child);
  if (childMax > parentMax) return { ok: false, reason: "depth_exceeds_parent" };
  if (input.child.maxChainCostUsd > input.parent.maxChainCostUsd) {
    return { ok: false, reason: "cost_exceeds_parent" };
  }
  if (input.child.costCeilingUsd > input.parent.costCeilingUsd) {
    return { ok: false, reason: "cost_exceeds_parent" };
  }
  if (
    typeof input.estimatedCostUsd === "number" &&
    input.estimatedCostUsd > input.child.maxChainCostUsd
  ) {
    return { ok: false, reason: "estimate_exceeds_sub_budget" };
  }
  const parentDl = Date.parse(input.parent.deadlineAt);
  const childDl = Date.parse(input.child.deadlineAt);
  if (Number.isFinite(parentDl) && Number.isFinite(childDl) && childDl > parentDl) {
    return { ok: false, reason: "deadline_after_parent" };
  }
  return { ok: true };
}

/**
 * Inbound self-check for a sub-mandate without a parent (B receiving
 * `task.chain.delegate`): estimate must fit the sub-budget.
 */
export function verifySubChainSelfConsistency(input: {
  child: { maxChainCostUsd: number };
  estimatedCostUsd: number;
}): { ok: true } | { ok: false; reason: "estimate_exceeds_sub_budget" } {
  if (input.estimatedCostUsd > input.child.maxChainCostUsd) {
    return { ok: false, reason: "estimate_exceeds_sub_budget" };
  }
  return { ok: true };
}
