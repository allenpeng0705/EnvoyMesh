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
  iterationMaxRounds: 1,
  iterationJudgeMode: "llm",
  iterationCarryMode: "summary",
  extendMaxStepsPerRound: 2,
  extendMaxDepth: 3,
  extendOnlyAfterPartial: true,
};

/** Auto-evaluate bids after this delay when competitive mode (43C). */
export const CHAIN_AUTO_EVALUATE_MS = 30_000;

/** Direct mode: award as soon as the first worker responds. */
export const CHAIN_DIRECT_AUTO_EVALUATE_MS = 0;

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
