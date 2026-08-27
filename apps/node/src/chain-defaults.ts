/**
 * Phase 43 — Smart defaults and goal templates for agent-network chains.
 */

import type { ChainDefaultsConfig } from "@envoymesh/api";

/** Production defaults: direct assign (no bidding/cost), LLM decompose when available. */
export const DEFAULT_CHAIN_DEFAULTS: ChainDefaultsConfig = {
  rebalancePolicy: "never",
  stallTimeoutMs: 120_000,
  lowConfidenceThreshold: 0.5,
  maxAutoRebalances: 2,
  autoRebalanceIncrementUsd: 5,
  allowLlmDecompose: true,
  awardMode: "direct",
  // showCostUi omitted — derived from awardMode in mergeChainDefaults
  /** Skill-based plan+assign (preserves historical Team job behavior). */
  assignmentMode: "skill",
  iterationMaxRounds: 1,
  iterationJudgeMode: "llm",
  iterationCarryMode: "summary",
  extendMaxStepsPerRound: 2,
  extendMaxDepth: 3,
  extendOnlyAfterPartial: true,
  teamStrategyId: "balanced",
  assignerSelection: "local",
};

/** Auto-evaluate bids after this delay when competitive mode (43C). */
export const CHAIN_AUTO_EVALUATE_MS = 30_000;

/** Direct mode: award as soon as the first worker responds. */
export const CHAIN_DIRECT_AUTO_EVALUATE_MS = 0;

/**
 * How long to wait for the first bid after a propose before re-proposing
 * (and trying a backup worker). Kept short so a silent preferred peer
 * (send ok / no bid) does not stall each Team job step for a full minute.
 * Cap separately from post-award stallTimeoutMs.
 */
export const CHAIN_BID_WAIT_MS = 15_000;

/**
 * Hard cap for a single Team-job mesh/local envelope send. A hung
 * `mesh.send` (half-dead Windows LAN path) otherwise holds the per-peer
 * outbound lock forever and freezes launch after `adopted_preview_plan`.
 */
export const CHAIN_MESH_SEND_TIMEOUT_MS = 20_000;

/** Max re-propose attempts per subtask while stuck with zero bids. */
export const CHAIN_PROPOSE_RETRY_CAP = 2;

/**
 * How long after award (with no partial) before re-sending task.chain.accept.
 * Covers mesh flakes where evaluateBids reserved state but the accept envelope
 * never reached the worker.
 */
export const CHAIN_ACCEPT_RESEND_WAIT_MS = 20_000;

/** Max accept re-sends per awarded subtask with zero partials. */
export const CHAIN_ACCEPT_RESEND_CAP = 3;

/**
 * Per-attempt expect-reply read budget for `task.chain.ready.request`.
 * Soft failures (stream closed / dial glitch) retry; hard engine-down skips.
 */
export const CHAIN_READY_PROBE_TIMEOUT_MS = 8_000;

/** Retry expect-reply once after a soft failure (stale stream / brief dial miss). */
export const CHAIN_READY_PROBE_MAX_ATTEMPTS = 2;

/**
 * Hard wall-clock cap for one probe (dial + prepare + attempts).
 * Without this, `prepareOutboundPeerConnection` can hang ranking for minutes.
 */
export const CHAIN_READY_PROBE_OVERALL_MS = 12_000;

/** Cache a definitive ready/not-ready probe result per worker for this long. */
export const CHAIN_READY_PROBE_CACHE_MS = 30_000;

/**
 * Short cache for soft failures so a 4-step plan does not re-dial the same
 * unreachable peer four times during selection.
 */
export const CHAIN_READY_PROBE_SOFT_CACHE_MS = 15_000;

export interface ChainGoalTemplate {
  id: string;
  label: string;
  goal: string;
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
}

export const CHAIN_GOAL_TEMPLATES: ChainGoalTemplate[] = [
  {
    id: "research",
    label: "Research a topic",
    goal: "Research the topic and summarize key findings with sources.",
    maxChainCostUsd: 15,
    costCeilingUsd: 5,
  },
  {
    id: "summarize",
    label: "Summarize documents",
    goal: "Summarize the provided material into a concise executive summary.",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
  },
  {
    id: "network",
    label: "Ask my network",
    goal: "Ask bonded contacts for their perspective and merge the best answers.",
    maxChainCostUsd: 20,
    costCeilingUsd: 5,
  },
];

export function estimateChainCostRange(input: {
  subtaskCount: number;
  workerCandidateCount: number;
  baseCostUsd?: number;
  maxChainCostUsd?: number;
}): { minUsd: number; maxUsd: number } {
  const base = input.baseCostUsd ?? 1;
  const subtasks = Math.max(1, input.subtaskCount);
  const workers = Math.max(1, input.workerCandidateCount);
  const minUsd = Math.round(base * subtasks * 100) / 100;
  const maxUsd = Math.min(
    input.maxChainCostUsd ?? minUsd * workers * 2,
    Math.round(base * subtasks * workers * 1.5 * 100) / 100,
  );
  return { minUsd, maxUsd: Math.max(minUsd, maxUsd) };
}

export function mergeChainDefaults(
  nodeDefaults?: ChainDefaultsConfig,
  mandateOverrides?: Partial<ChainDefaultsConfig>,
): ChainDefaultsConfig {
  const explicitShowCost =
    mandateOverrides?.showCostUi ?? nodeDefaults?.showCostUi;
  const merged: ChainDefaultsConfig = {
    ...DEFAULT_CHAIN_DEFAULTS,
    ...nodeDefaults,
    ...mandateOverrides,
  };
  merged.showCostUi =
    explicitShowCost ?? (resolveAwardMode(merged) === "competitive");
  return merged;
}

/** Resolve effective award mode (defaults to direct). */
export function resolveAwardMode(
  defaults?: ChainDefaultsConfig | null,
): "direct" | "competitive" {
  return defaults?.awardMode === "competitive" ? "competitive" : "direct";
}

export function resolveShowCostUi(defaults?: ChainDefaultsConfig | null): boolean {
  if (defaults?.showCostUi !== undefined) return defaults.showCostUi;
  return resolveAwardMode(defaults) === "competitive";
}

/** Resolve plan+assign mode (defaults to skill). */
export function resolveAssignmentModeDefault(
  defaults?: ChainDefaultsConfig | null,
): "skill" | "role" {
  return defaults?.assignmentMode === "role" ? "role" : "skill";
}

/** Phase 62C — resolve effective Assigner selection mode (defaults to local). */
export function resolveAssignerSelectionDefault(
  defaults?: ChainDefaultsConfig | null,
): "local" | "best_capable" {
  return defaults?.assignerSelection === "best_capable" ? "best_capable" : "local";
}
