/**
 * Agent network chains runtime (Phase 40).
 *
 * Extracted from `node-service-impl.ts`. Owns the per-chain runtime
 * state (a `Map<chainId, ChainState>` plus a `Map<capability, bid
 * strategy>`) and exposes the simple RPCs as runtime functions.
 *
 * The complex RPCs (`chainPlan`, `chainLaunch`, `chainRebalance`,
 * `chainEvaluateBids`, etc.) are also exposed here as runtime
 * functions. They call back into the class via the `ChainContext`
 * for the orchestrator-dep builder and the award-and-accept
 * helper.
 */
import { randomUUID } from "node:crypto";
import { chainBudgetWarningLevel } from "./chain-auto-orchestrator.js";
import {
  chainStateSnapshot,
  counterBid,
  createChainState,
  launchChain,
  planChain,
  rebalanceChain,
  type ChainState,
} from "./chain-orchestrator.js";
import { CHAIN_GOAL_TEMPLATES, mergeChainDefaults } from "./chain-defaults.js";
import { chainCostsToCsv } from "./chain-cost-export.js";
import type {
  ChainGetStateParams,
  ChainGetStateResult,
  ChainListActiveResult,
  ChainListActiveParams,
  ChainCancelParams,
  ChainCancelResult,
  ChainSetBidStrategyParams,
  ChainSetBidStrategyResult,
  ChainGetBidStrategyParams,
  ChainGetBidStrategyResult,
  ChainListReportsParams,
  ChainListReportsResult,
  ChainGetReportParams,
  ChainGetReportResult,
  ChainPinReportParams,
  ChainPinReportResult,
  ChainGetDefaultsParams,
  ChainGetDefaultsResult,
  ChainSetDefaultsParams,
  ChainSetDefaultsResult,
  ChainExportCostsParams,
  ChainExportCostsResult,
  ChainListRecipesParams,
  ChainListRecipesResult,
  ChainSaveRecipeParams,
  ChainSaveRecipeResult,
  ChainDeleteRecipeParams,
  ChainDeleteRecipeResult,
  ChainPlanParams,
  ChainPlanResult,
  ChainLaunchParams,
  ChainLaunchResult,
  ChainEvaluateBidsParams,
  ChainEvaluateBidsResult,
  ChainCounterBidParams,
  ChainCounterBidResult,
  ChainRebalanceParams,
  ChainRebalanceResult,
} from "@envoymesh/api";

/* ---------- store ---------- */

export interface ChainBidStrategy {
  baseCostUsd: number;
  capabilityLocalEtaMs: number;
  reputationDiscount: number;
  etaSlackMs: number;
}

/* ---------- store ---------- */

export interface ChainRuntimeEntry {
  state: ChainState;
  bidStrategy: ChainBidStrategy;
}

const DEFAULT_BID_STRATEGY: ChainBidStrategy = {
  baseCostUsd: 1,
  capabilityLocalEtaMs: 60_000,
  reputationDiscount: 1,
  etaSlackMs: 60_000,
};

export class ChainStore {
  private readonly runtime = new Map<string, ChainRuntimeEntry>();
  private readonly bidStrategies = new Map<string, ChainBidStrategy>();

  /** Look up a runtime entry. Returns undefined if not present. */
  getRuntime(chainId: string): ChainRuntimeEntry | undefined {
    return this.runtime.get(chainId);
  }

  /** Overwrite the runtime entry for the given chainId. */
  setRuntime(chainId: string, entry: ChainRuntimeEntry): void {
    this.runtime.set(chainId, entry);
  }

  /** Update the bid strategy for an existing runtime entry. */
  setRuntimeBidStrategy(chainId: string, strategy: ChainBidStrategy): void {
    const entry = this.runtime.get(chainId);
    if (entry) entry.bidStrategy = strategy;
  }

  /**
   * Ensure a runtime entry exists for the given chainId. If absent,
   * a placeholder state is created with the given chain mandate id.
   */
  ensureRuntime(chainId: string, chainMandateId: string): ChainRuntimeEntry {
    const existing = this.runtime.get(chainId);
    if (existing) return existing;
    const entry: ChainRuntimeEntry = {
      state: createChainState({
        chainId,
        chainMandateId,
        // The rest of the placeholder fields are filled by chain-state's
        // createChainState helper; this branch only fires when the
        // chain is being planned for the first time.
      } as never),
      bidStrategy: { ...DEFAULT_BID_STRATEGY },
    };
    this.runtime.set(chainId, entry);
    return entry;
  }

  /** Mark a chain or single subtask as cancelled. */
  cancel(chainId: string, subtaskId: string | undefined): string[] {
    const entry = this.runtime.get(chainId);
    if (!entry) return [];
    if (subtaskId) {
      entry.state.cancelledSubtasks.add(subtaskId);
      return [subtaskId];
    }
    entry.state.chainCancelled = true;
    return [...entry.state.subtasks.keys()];
  }

  /** Read or write a capability-scoped bid strategy. */
  getBidStrategy(capability: string): ChainBidStrategy {
    return this.bidStrategies.get(capability) ?? { ...DEFAULT_BID_STRATEGY };
  }

  setBidStrategy(capability: string, strategy: ChainBidStrategy): void {
    this.bidStrategies.set(capability, strategy);
  }

  /** Enumerate runtime entries for `chainListActive`. */
  listActive(): ChainRuntimeEntry[] {
    return [...this.runtime.values()];
  }

  /** Snapshot the chain-id list (used by code that still wants to iterate). */
  listIds(): string[] {
    return [...this.runtime.keys()];
  }

  /** Drop everything (clear-all-user-data path). */
  clear(): void {
    this.runtime.clear();
    this.bidStrategies.clear();
  }
}

/* ---------- high-level operations ---------- */

export interface ChainContext {
  store: ChainStore;
  /** Where to persist chain reports (class field). */
  hasTaskStore(): boolean;
  /** The task store's listChainReports / getChainReport / pinChainReport. */
  listChainReports(params?: ChainListReportsParams): Promise<Array<{ report: ChainListReportsResult["reports"][number] & { chainMandateId: string; orchestratorOwnerId: string; orchestratorPeerId: string; chainSummary: { subtaskCount: number; workerAllocations: unknown[]; synthesisCostUsd: number } } }>>;
  getChainReport(chainId: string): Promise<{ report: ChainGetReportResult["report"] & object } | null | void>;
  pinChainReport(chainId: string, pinned: boolean): Promise<void | unknown>;
  /** Class fields used to enrich the get-state result. */
  getChainGoal(chainId: string): unknown;
  getChainCostEstimate(chainId: string): unknown;
  /** Build the snapshot-to-result transform. */
  snapshotToResult(snap: ReturnType<typeof chainStateSnapshot>): ChainGetStateResult;
  /** Build the per-subtask bid map. */
  bidsBySubtask(state: ChainState): NonNullable<ChainGetStateResult["bidsBySubtask"]>;
  /** Chain config plumbing. */
  getNodeConfig(): Promise<unknown>;
  setNodeConfig(cfg: unknown): Promise<void>;
  /** Build the orchestrator dep bag (calls into mesh + LLM + audit). */
  buildChainOrchestratorDeps(): Promise<unknown>;
  /** Run the bid evaluation + accept pipeline for a single subtask. */
  evaluateAwardAndAccept(
    chainId: string,
    subtaskId: string,
    options: { policy?: string; pickWorkerPeerId?: string },
  ): Promise<
    | { ok: true; bid: { workerPeerId: string; proposedCostUsd: number }; round: number }
    | { ok: false; reason: string }
  >;
  /** Emit a `chain:state` event for the given chainId. */
  emitChainState(chainId: string): void;
  /** Start the heartbeat tracker for a launched chain. */
  startChainTracking(chainId: string): void;
  /** Recipe persistence (optional — the runtime returns the builtin list when absent).
   *  Types are intentionally loose: the class is the source of truth for the
   *  recipe row shape, and the runtime just passes rows through. */
  listChainRecipes?(): Promise<Array<{ id: string; label: string; goal: string; maxChainCostUsd?: number; costCeilingUsd?: number }>>;
  saveChainRecipe?(record: { id?: string; label: string; goal: string; maxChainCostUsd?: number; costCeilingUsd?: number }): Promise<{
    id: string;
    label: string;
    goal: string;
    maxChainCostUsd?: number;
    costCeilingUsd?: number;
  }>;
  deleteChainRecipe?(id: string): Promise<boolean>;
}

/* ---------- chainGetState ---------- */

export function chainGetStateViaRuntime(
  ctx: ChainContext,
  params: ChainGetStateParams,
): ChainGetStateResult {
  const entry = ctx.store.getRuntime(params.chainId);
  if (!entry) {
    return {
      chainId: params.chainId,
      chainMandateId: "",
      subtaskCount: 0,
      bidCount: 0,
      awardedCount: 0,
      partialCount: 0,
      cancelledCount: 0,
      chainCancelled: false,
      published: false,
      budgetSpentUsd: 0,
      budgetMaxUsd: 0,
      budgetReservedUsd: 0,
      budgetSynthesisUsd: 0,
    };
  }
  const result = ctx.snapshotToResult(chainStateSnapshot(entry.state));
  result.bidsBySubtask = ctx.bidsBySubtask(entry.state);
  result.goal = ctx.getChainGoal(params.chainId) as never;
  result.estimatedCostRange = ctx.getChainCostEstimate(params.chainId) as never;
  result.budgetWarningLevel = chainBudgetWarningLevel(entry.state);
  return result;
}

/* ---------- chainListActive ---------- */

export function chainListActiveViaRuntime(
  ctx: ChainContext,
): ChainListActiveResult {
  return {
    chains: ctx.store.listActive().map((entry) => {
      const snap = ctx.snapshotToResult(chainStateSnapshot(entry.state));
      snap.bidsBySubtask = ctx.bidsBySubtask(entry.state);
      return snap;
    }),
  };
}

/* ---------- chainCancel ---------- */

export function chainCancelViaRuntime(
  ctx: ChainContext,
  params: ChainCancelParams,
): ChainCancelResult {
  return {
    chainId: params.chainId,
    cancelled: ctx.store.cancel(params.chainId, params.subtaskId),
  };
}

/* ---------- chainListReports / getReport / pinReport ---------- */

export async function chainListReportsViaRuntime(
  ctx: ChainContext,
  params?: ChainListReportsParams,
): Promise<ChainListReportsResult> {
  if (!ctx.hasTaskStore()) return { reports: [] };
  const rows = await ctx.listChainReports(params);
  return {
    reports: rows.map((row) => ({
      chainId: row.report.chainId,
      chainMandateId: row.report.chainMandateId,
      orchestratorOwnerId: row.report.orchestratorOwnerId,
      orchestratorPeerId: row.report.orchestratorPeerId,
      pinned: row.report.pinned ?? false,
      createdAt: row.report.createdAt,
      chainSummary: {
        subtaskCount: row.report.chainSummary.subtaskCount,
        workerCount: row.report.chainSummary.workerAllocations.length,
        synthesisCostUsd: row.report.chainSummary.synthesisCostUsd,
      },
    })),
  };
}

export async function chainGetReportViaRuntime(
  ctx: ChainContext,
  params: ChainGetReportParams,
): Promise<ChainGetReportResult> {
  if (!ctx.hasTaskStore()) return { report: null };
  const row = await ctx.getChainReport(params.chainId);
  return { report: row?.report ?? null };
}

export async function chainPinReportViaRuntime(
  ctx: ChainContext,
  params: ChainPinReportParams,
): Promise<ChainPinReportResult> {
  if (ctx.hasTaskStore()) {
    await ctx.pinChainReport(params.chainId, params.pinned);
  }
  return { chainId: params.chainId, pinned: params.pinned };
}

/* ---------- chainSetBidStrategy / chainGetBidStrategy ---------- */

export function chainSetBidStrategyViaRuntime(
  ctx: ChainContext,
  params: ChainSetBidStrategyParams,
): ChainSetBidStrategyResult {
  ctx.store.setBidStrategy(params.capability, {
    baseCostUsd: params.baseCostUsd,
    capabilityLocalEtaMs: params.capabilityLocalEtaMs,
    reputationDiscount: params.reputationDiscount ?? 1.0,
    etaSlackMs: params.etaSlackMs ?? 60_000,
  });
  return { capability: params.capability, baseCostUsd: params.baseCostUsd };
}

export function chainGetBidStrategyViaRuntime(
  ctx: ChainContext,
  params: ChainGetBidStrategyParams,
): ChainGetBidStrategyResult {
  return { capability: params.capability, ...ctx.store.getBidStrategy(params.capability) };
}

/* ---------- chainGetDefaults / chainSetDefaults ---------- */

export async function chainGetDefaultsViaRuntime(
  ctx: ChainContext,
  _params: ChainGetDefaultsParams,
): Promise<ChainGetDefaultsResult> {
  const cfg = (await ctx.getNodeConfig()) as { chainDefaults?: Parameters<typeof mergeChainDefaults>[0] } | null;
  return { defaults: mergeChainDefaults(cfg?.chainDefaults) };
}

export async function chainSetDefaultsViaRuntime(
  ctx: ChainContext,
  params: ChainSetDefaultsParams,
): Promise<ChainSetDefaultsResult> {
  const d = params.defaults ?? ({} as Parameters<typeof mergeChainDefaults>[0]);
  // Mirror the Zod-style validation the class used to do inline so the
  // runtime can refuse malformed payloads without round-tripping.
  if (
    (d.stallTimeoutMs !== undefined && d.stallTimeoutMs <= 0) ||
    (d.lowConfidenceThreshold !== undefined &&
      (d.lowConfidenceThreshold < 0 || d.lowConfidenceThreshold > 1)) ||
    (d.maxAutoRebalances !== undefined && d.maxAutoRebalances < 0) ||
    (d.autoRebalanceIncrementUsd !== undefined && d.autoRebalanceIncrementUsd < 0) ||
    (d.rebalancePolicy !== undefined &&
      d.rebalancePolicy !== "manual" &&
      d.rebalancePolicy !== "auto" &&
      d.rebalancePolicy !== "never")
  ) {
    return { ok: false, defaults: d as never, reason: "validation_failed" };
  }
  await ctx.setNodeConfig({ chainDefaults: d });
  return { ok: true, defaults: d as never };
}

/* ---------- chainExportCosts / chainListRecipes / chainSaveRecipe / chainDeleteRecipe ---------- */

export function chainExportCostsViaRuntime(
  ctx: ChainContext,
  params: ChainExportCostsParams,
): ChainExportCostsResult {
  const entry = ctx.store.getRuntime(params.chainId);
  if (!entry) {
    return {
      chainId: params.chainId,
      csv: `chainId,status\n"${params.chainId}","not_found"\n`,
    };
  }
  return { chainId: params.chainId, csv: chainCostsToCsv(entry.state) };
}

export async function chainListRecipesViaRuntime(
  ctx: ChainContext,
  _params?: ChainListRecipesParams,
): Promise<ChainListRecipesResult> {
  const builtin = CHAIN_GOAL_TEMPLATES.map(
    ({ id, label, goal, maxChainCostUsd, costCeilingUsd }) => ({
      id,
      label,
      goal,
      maxChainCostUsd,
      costCeilingUsd,
      saved: false as const,
    }),
  );
  if (!ctx.listChainRecipes) return { recipes: builtin };
  const saved = (await ctx.listChainRecipes()).map(
    (r) => ({
      id: r.id,
      label: r.label,
      goal: r.goal,
      maxChainCostUsd: r.maxChainCostUsd,
      costCeilingUsd: r.costCeilingUsd,
      saved: true as const,
    }),
  );
  return { recipes: [...saved, ...builtin] };
}

export async function chainSaveRecipeViaRuntime(
  ctx: ChainContext,
  params: ChainSaveRecipeParams,
): Promise<ChainSaveRecipeResult> {
  const label = params.label.trim();
  const goal = params.goal.trim();
  if (!label || !goal) {
    return { ok: false, reason: "validation_failed" };
  }
  if (!ctx.hasTaskStore() || !ctx.saveChainRecipe) {
    return { ok: false, reason: "validation_failed" };
  }
  const record = await ctx.saveChainRecipe({
    id: params.id ?? `recipe_${randomUUID()}`,
    label,
    goal,
    maxChainCostUsd: params.maxChainCostUsd,
    costCeilingUsd: params.costCeilingUsd,
  });
  return {
    ok: true,
    recipe: {
      id: record.id,
      label: record.label,
      goal: record.goal,
      maxChainCostUsd: record.maxChainCostUsd,
      costCeilingUsd: record.costCeilingUsd,
      saved: true,
    },
  };
}

export async function chainDeleteRecipeViaRuntime(
  ctx: ChainContext,
  params: ChainDeleteRecipeParams,
): Promise<ChainDeleteRecipeResult> {
  if (!ctx.hasTaskStore() || !ctx.deleteChainRecipe) return { ok: false, deleted: false };
  const deleted = await ctx.deleteChainRecipe(params.id);
  return { ok: deleted, deleted };
}

/* ---------- chainPlan / chainLaunch / chainEvaluateBids / chainCounterBid / chainRebalance ---------- */

export async function chainPlanViaRuntime(
  ctx: ChainContext,
  params: ChainPlanParams,
): Promise<ChainPlanResult> {
  if (!ctx.store.getRuntime(params.chainId)) {
    ctx.store.ensureRuntime(params.chainId, params.chainMandateId);
  }
  const deps = (await ctx.buildChainOrchestratorDeps()) as Parameters<typeof planChain>[0];
  const entry = ctx.store.getRuntime(params.chainId);
  if (!entry) return { chainId: params.chainId, subtasks: [] };
  const plan = await planChain(deps, entry.state, params.goal, {
    allowLlm: params.allowLlm ?? false,
  });
  if (!plan.ok) {
    return { chainId: params.chainId, subtasks: [] };
  }
  return {
    chainId: params.chainId,
    subtasks: plan.subtasks.map((s) => ({
      subtaskId: s.subtaskId,
      depth: s.depth,
      requiredCapability: s.requiredCapability,
      objective: s.objective,
    })),
  };
}

export async function chainLaunchViaRuntime(
  ctx: ChainContext,
  params: ChainLaunchParams,
): Promise<ChainLaunchResult> {
  const entry = ctx.store.getRuntime(params.chainId);
  if (!entry) {
    return { chainId: params.chainId, proposed: 0, mandateBroadcastOk: false };
  }
  const deps = (await ctx.buildChainOrchestratorDeps()) as Parameters<typeof launchChain>[0];
  const result = await launchChain(deps, entry.state, params.workersBySubtask);
  if (result.ok) {
    ctx.startChainTracking(params.chainId);
    ctx.emitChainState(params.chainId);
    return {
      chainId: params.chainId,
      proposed: result.proposed,
      mandateBroadcastOk: result.mandateBroadcastOk,
    };
  }
  // Result is {ok: false, reason} — synthesise the API shape.
  return {
    chainId: params.chainId,
    proposed: 0,
    mandateBroadcastOk: false,
  };
}

export async function chainEvaluateBidsViaRuntime(
  ctx: ChainContext,
  params: ChainEvaluateBidsParams,
): Promise<ChainEvaluateBidsResult> {
  const entry = ctx.store.getRuntime(params.chainId);
  if (!entry) {
    return { chainId: params.chainId, subtaskId: params.subtaskId, awarded: false };
  }
  const policy =
    params.policy === "highest_confidence" ? "composite" : params.policy;
  const result = await ctx.evaluateAwardAndAccept(params.chainId, params.subtaskId, {
    policy,
    pickWorkerPeerId: params.pickWorkerPeerId,
  });
  if (result.ok) {
    ctx.emitChainState(params.chainId);
    return {
      chainId: params.chainId,
      subtaskId: params.subtaskId,
      awarded: true,
      workerPeerId: result.bid.workerPeerId,
      round: result.round,
      acceptedCostUsd: result.bid.proposedCostUsd,
    };
  }
  return {
    chainId: params.chainId,
    subtaskId: params.subtaskId,
    awarded: false,
    reason: result.reason as ChainEvaluateBidsResult["reason"],
  };
}

export async function chainCounterBidViaRuntime(
  ctx: ChainContext,
  params: ChainCounterBidParams,
): Promise<ChainCounterBidResult> {
  const entry = ctx.store.getRuntime(params.chainId);
  if (!entry) {
    return { chainId: params.chainId, subtaskId: params.subtaskId, ok: false, reason: "no_such_subtask" };
  }
  const deps = (await ctx.buildChainOrchestratorDeps()) as Parameters<typeof counterBid>[0];
  const result = await counterBid(deps, entry.state, {
    subtaskId: params.subtaskId,
    newCostCeilingUsd: params.newCostCeilingUsd,
    newDeadlineAt: params.newDeadlineAt,
  });
  if (result.ok) {
    return {
      chainId: params.chainId,
      subtaskId: params.subtaskId,
      ok: true,
      rebroadcastAt: result.rebroadcastAt,
      clearedBids: result.clearedBids,
      newRound: result.newRound,
    };
  }
  return {
    chainId: params.chainId,
    subtaskId: params.subtaskId,
    ok: false,
    reason: result.reason as ChainCounterBidResult["reason"],
  };
}

export async function chainRebalanceViaRuntime(
  ctx: ChainContext,
  params: ChainRebalanceParams,
): Promise<ChainRebalanceResult> {
  const entry = ctx.store.getRuntime(params.chainId);
  if (!entry) {
    return { chainId: params.chainId, ok: false, reason: "cancelled" };
  }
  const deps = (await ctx.buildChainOrchestratorDeps()) as Parameters<typeof rebalanceChain>[0];
  const result = await rebalanceChain(deps, entry.state, {
    additionalBudgetUsd: params.additionalBudgetUsd,
  });
  if (result.ok) {
    return {
      chainId: params.chainId,
      ok: true,
      previousMaxUsd: result.previousMaxUsd,
      newMaxUsd: result.newMaxUsd,
      reEvaluated: result.reEvaluated,
      autoTriggered: result.autoTriggered,
    };
  }
  return { chainId: params.chainId, ok: false, reason: result.reason as ChainRebalanceResult["reason"] };
}