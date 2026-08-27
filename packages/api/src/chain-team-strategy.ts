/**
 * Phase 60C — deterministic Team Job strategy presets and scoring.
 *
 * Design: docs/agent-network-next-generation-design.md §6
 * Presets are versioned so a mandate's resolved snapshot stays replay-stable
 * even if defaults change later.
 */

export const CHAIN_TEAM_STRATEGY_PRESET_VERSION = 1 as const;

export type ChainTeamStrategyId =
  | "balanced"
  | "fastest"
  | "cheapest"
  | "highest-confidence"
  | "privacy-local"
  | "diverse-model";

export type ChainTeamStrategyWeights = {
  skill: number;
  eta: number;
  cost: number;
  reliability: number;
  transport: number;
  modelDiversity: number;
};

export type ChainTeamStrategyConstraints = {
  localOnly?: boolean;
  directOnly?: boolean;
  maxAttemptsPerStep: number;
  requireIndependentVerifier?: boolean;
};

export type ChainTeamStrategyPreset = {
  id: ChainTeamStrategyId;
  version: typeof CHAIN_TEAM_STRATEGY_PRESET_VERSION;
  weights: ChainTeamStrategyWeights;
  constraints: ChainTeamStrategyConstraints;
};

/** Stable exclusion reason codes (not free-form model text). */
export type ChainWorkerExclusionReason =
  | "not_bonded"
  | "mandate_denied"
  | "sensitivity_exceeded"
  | "runtime_unavailable"
  | "lease_expired"
  | "lease_revoked"
  | "lease_busy"
  | "input_delivery_denied"
  | "budget_exceeded"
  | "local_only"
  | "direct_only"
  | "no_skill_match"
  | "model_family_collision";

export type ChainAssignmentReasonCode =
  | "skill_exact"
  | "role_match"
  | "same_lan"
  | "lease_ready"
  | "lowest_eta"
  | "lowest_cost"
  | "highest_reliability"
  | "model_diversity"
  | "privacy_local"
  | "owner_selected";

export type ChainWorkerScoreComponents = {
  skill: number;
  eta: number;
  cost: number;
  reliability: number;
  transport: number;
  modelDiversity: number;
};

export type ResolvedChainTeamStrategy = ChainTeamStrategyPreset & {
  /** ISO time when this snapshot was resolved into the mandate/chain. */
  resolvedAt: string;
};

const PRESETS: Record<ChainTeamStrategyId, ChainTeamStrategyPreset> = {
  balanced: {
    id: "balanced",
    version: CHAIN_TEAM_STRATEGY_PRESET_VERSION,
    weights: {
      skill: 0.35,
      eta: 0.15,
      cost: 0.15,
      reliability: 0.2,
      transport: 0.1,
      modelDiversity: 0.05,
    },
    constraints: { maxAttemptsPerStep: 1 },
  },
  fastest: {
    id: "fastest",
    version: CHAIN_TEAM_STRATEGY_PRESET_VERSION,
    weights: {
      skill: 0.15,
      eta: 0.4,
      cost: 0.05,
      reliability: 0.15,
      transport: 0.2,
      modelDiversity: 0.05,
    },
    constraints: { maxAttemptsPerStep: 2, directOnly: true },
  },
  cheapest: {
    id: "cheapest",
    version: CHAIN_TEAM_STRATEGY_PRESET_VERSION,
    weights: {
      skill: 0.2,
      eta: 0.1,
      cost: 0.45,
      reliability: 0.15,
      transport: 0.05,
      modelDiversity: 0.05,
    },
    constraints: { maxAttemptsPerStep: 1 },
  },
  "highest-confidence": {
    id: "highest-confidence",
    version: CHAIN_TEAM_STRATEGY_PRESET_VERSION,
    weights: {
      skill: 0.15,
      eta: 0.1,
      cost: 0.05,
      reliability: 0.5,
      transport: 0.1,
      modelDiversity: 0.1,
    },
    constraints: {
      maxAttemptsPerStep: 2,
      requireIndependentVerifier: true,
    },
  },
  "privacy-local": {
    id: "privacy-local",
    version: CHAIN_TEAM_STRATEGY_PRESET_VERSION,
    weights: {
      skill: 0.25,
      eta: 0.1,
      cost: 0.1,
      reliability: 0.2,
      transport: 0.3,
      modelDiversity: 0.05,
    },
    constraints: { localOnly: true, maxAttemptsPerStep: 1 },
  },
  "diverse-model": {
    id: "diverse-model",
    version: CHAIN_TEAM_STRATEGY_PRESET_VERSION,
    weights: {
      skill: 0.2,
      eta: 0.1,
      cost: 0.1,
      reliability: 0.2,
      transport: 0.1,
      modelDiversity: 0.3,
    },
    constraints: {
      maxAttemptsPerStep: 2,
      requireIndependentVerifier: true,
    },
  },
};

export function listChainTeamStrategyPresets(): ChainTeamStrategyPreset[] {
  return Object.values(PRESETS).map((p) => structuredClone(p));
}

export function getChainTeamStrategyPreset(
  id: ChainTeamStrategyId,
): ChainTeamStrategyPreset {
  return structuredClone(PRESETS[id]);
}

export function resolveChainTeamStrategy(
  id: ChainTeamStrategyId,
  now: Date = new Date(),
): ResolvedChainTeamStrategy {
  return {
    ...getChainTeamStrategyPreset(id),
    resolvedAt: now.toISOString(),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeWeights(weights: ChainTeamStrategyWeights): ChainTeamStrategyWeights {
  const sum =
    weights.skill +
    weights.eta +
    weights.cost +
    weights.reliability +
    weights.transport +
    weights.modelDiversity;
  if (!(sum > 0)) return weights;
  return {
    skill: weights.skill / sum,
    eta: weights.eta / sum,
    cost: weights.cost / sum,
    reliability: weights.reliability / sum,
    transport: weights.transport / sum,
    modelDiversity: weights.modelDiversity / sum,
  };
}

export function scoreChainWorkerWithStrategy(input: {
  strategy: Pick<ChainTeamStrategyPreset, "weights">;
  components: ChainWorkerScoreComponents;
}): { score: number; components: ChainWorkerScoreComponents } {
  const weights = normalizeWeights(input.strategy.weights);
  const components: ChainWorkerScoreComponents = {
    skill: clamp01(input.components.skill),
    eta: clamp01(input.components.eta),
    cost: clamp01(input.components.cost),
    reliability: clamp01(input.components.reliability),
    transport: clamp01(input.components.transport),
    modelDiversity: clamp01(input.components.modelDiversity),
  };
  const score =
    weights.skill * components.skill +
    weights.eta * components.eta +
    weights.cost * components.cost +
    weights.reliability * components.reliability +
    weights.transport * components.transport +
    weights.modelDiversity * components.modelDiversity;
  return { score, components };
}

/**
 * Hard-gate evaluation before scoring. A failing gate excludes the worker
 * regardless of strategy weights.
 */
export function evaluateChainWorkerHardGates(input: {
  strategy: Pick<ChainTeamStrategyPreset, "constraints">;
  isSelf: boolean;
  sameOwnerLocal?: boolean;
  sameLan: boolean;
  viaRelay: boolean;
  availabilitySource?: "lease" | "legacy_probe" | "local" | "unknown";
  leaseState?: "ready" | "expired" | "revoked" | "busy" | "unknown";
}): { ok: true } | { ok: false; reason: ChainWorkerExclusionReason } {
  const { constraints } = input.strategy;
  if (constraints.localOnly && !(input.isSelf || input.sameOwnerLocal === true)) {
    return { ok: false, reason: "local_only" };
  }
  if (constraints.directOnly && input.viaRelay) {
    return { ok: false, reason: "direct_only" };
  }
  if (input.leaseState === "expired") return { ok: false, reason: "lease_expired" };
  if (input.leaseState === "revoked") return { ok: false, reason: "lease_revoked" };
  if (input.leaseState === "busy") return { ok: false, reason: "lease_busy" };
  return { ok: true };
}

/** Deterministic tie-break: higher lease sequence, then peerId lexical. */
export function compareChainWorkerTies(a: {
  score: number;
  leaseSequence?: number;
  peerId: string;
}, b: {
  score: number;
  leaseSequence?: number;
  peerId: string;
}): number {
  if (b.score !== a.score) return b.score - a.score;
  const aSeq = a.leaseSequence ?? -1;
  const bSeq = b.leaseSequence ?? -1;
  if (bSeq !== aSeq) return bSeq - aSeq;
  return a.peerId.localeCompare(b.peerId);
}
