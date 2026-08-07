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
import { CHAIN_GOAL_TEMPLATES, estimateChainCostRange, mergeChainDefaults } from "./chain-defaults.js";
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
  ChainPreviewGoalParams,
  ChainPreviewGoalResult,
  ChainStartFromGoalParams,
  ChainStartFromGoalResult,
  ChainResolveIterationParams,
  ChainResolveIterationResult,
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

  /** Drop a runtime entry (e.g. aborted before launch when no workers). */
  deleteRuntime(chainId: string): void {
    this.runtime.delete(chainId);
    this.bidStrategies.delete(chainId);
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

/**
 * A ranked agent-network worker for a subtask. `online` / `viaRelay` come from
 * the live mesh connection snapshot so the team-job dialog can make offline
 * contacts non-selectable and the system pick can prefer reachable workers.
 */
export interface ChainRankedWorker {
  peerId: string;
  score: number;
  summary: string;
  sameLan: boolean;
  online: boolean;
  viaRelay: boolean;
}

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
  getChainAwardMode?(chainId: string): "direct" | "competitive" | undefined;
  getChainShowCostUi?(chainId: string): boolean | undefined;
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
  /** Build a placeholder mandate for a new chain (chainPlan / chainPreviewGoal). */
  placeholderMandate(chainId: string, chainMandateId: string): unknown;
  /** Find capability providers (peer ids) for a given capability, best score first. */
  findAgentNetworkWorkers(capability: string): Promise<string[]>;
  /** Ranked workers with score summaries (for diagnostics / UI). */
  findAgentNetworkWorkersRanked?(
    capability: string,
    preferredWorkerPeerIds?: readonly string[],
  ): Promise<ChainRankedWorker[]>;
  /** Compute diagnostics for a set of subtasks + candidate workers. */
  chainDiagnosticsForSubtasks(
    subtasks: Array<{ subtaskId: string; requiredSkill: string }>,
    workersBySubtask: Record<string, string[]>,
    rankedBySubtask?: Record<string, ChainRankedWorker[]>,
  ): unknown;
  /** Run a chain from a free-form goal. */
  runChainGoal(params: {
    goal: string;
    maxChainCostUsd?: number;
    costCeilingUsd?: number;
    allowLlm?: boolean;
    assignerPeerId?: string;
    iterationMaxRounds?: number;
    iterationJudgeMode?: "llm" | "always_stop" | "owner";
    extendMaxStepsPerRound?: number;
    /** Phase 47D mid-job rehydrate blob (same shape as handoff `iterationState`). */
    iterationWire?: {
      round: number;
      maxRounds: number;
      extendsInRound: number;
      maxExtendsInRound: number;
      extendMaxDepth: number;
      extendOnlyAfterPartial: boolean;
      sealedByRound: Record<string, string[]>;
      openRoundSubtaskIds: string[];
      drafts: Array<{
        round: number;
        summary: string;
        judgeDecision?: string;
        judgeReason?: string;
      }>;
      judgeMode: "llm" | "always_stop" | "owner";
      carryMode: "summary" | "full_draft" | "structured";
      goal: string;
      waitingForOwner?: boolean;
      stopReason?: string;
    };
  /** Restrict worker discovery to these agent peer IDs. Empty/absent = use all. */
  preferredWorkerPeerIds?: string[];
  /**
   * Adopt a previewed plan instead of calling `planChain` again.
   * Subtask ids / dependsOn / preferred assignees are preserved; chainId and
   * chainMandateId are rewritten onto the live mandate.
   */
  plannedSubtasks?: Array<{
    subtaskId: string;
    depth: number;
    requiredSkill: string;
    objective: string;
    requestedResult?: string;
    constraints?: string[];
    dependsOn?: string[];
    costCeilingUsd?: number;
    deadlineAt?: string;
    preferredWorkerPeerId?: string;
    createdAt?: string;
  }>;
}): Promise<
  | {
      ok: true;
      chainId: string;
      chainMandateId: string;
      subtasks: Array<{
        subtaskId: string;
        depth?: number;
        requiredSkill?: string;
        objective?: string;
        preferredWorkerPeerId?: string;
      }>;
      assignerPeerId?: string;
      handedOff?: boolean;
    }
  | { ok: false; error: string }
>;
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
  result.awardMode = ctx.getChainAwardMode?.(params.chainId) ?? "direct";
  result.showCostUi = ctx.getChainShowCostUi?.(params.chainId) ?? false;
  result.budgetWarningLevel = chainBudgetWarningLevel(entry.state);
  const it = entry.state.iteration;
  if (it) {
    result.iteration = {
      round: it.round,
      maxRounds: it.maxRounds,
      extendsInRound: it.extendsInRound,
      maxExtendsInRound: it.maxExtendsInRound,
      waitingForOwner: it.waitingForOwner === true,
      stopReason: it.stopReason,
      drafts: it.drafts.map((d) => ({
        round: d.round,
        summary: d.summary,
        judgeDecision: d.judge?.decision,
        judgeReason: d.judge?.reason,
      })),
    };
  }
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
      const chainId = snap.chainId;
      snap.goal = ctx.getChainGoal(chainId) as never;
      snap.estimatedCostRange = ctx.getChainCostEstimate(chainId) as never;
      snap.awardMode = ctx.getChainAwardMode?.(chainId) ?? "direct";
      snap.showCostUi = ctx.getChainShowCostUi?.(chainId) ?? false;
      snap.budgetWarningLevel = chainBudgetWarningLevel(entry.state);
      const it = entry.state.iteration;
      if (it) {
        snap.iteration = {
          round: it.round,
          maxRounds: it.maxRounds,
          extendsInRound: it.extendsInRound,
          maxExtendsInRound: it.maxExtendsInRound,
          waitingForOwner: it.waitingForOwner === true,
          stopReason: it.stopReason,
          drafts: it.drafts.map((d) => ({
            round: d.round,
            summary: d.summary,
            judgeDecision: d.judge?.decision,
            judgeReason: d.judge?.reason,
          })),
        };
      }
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
      d.rebalancePolicy !== "never") ||
    (d.awardMode !== undefined && d.awardMode !== "direct" && d.awardMode !== "competitive")
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
    ({ id, label, goal, maxChainCostUsd, costCeilingUsd }: { id: string; label: string; goal: string; maxChainCostUsd?: number; costCeilingUsd?: number }) => ({
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
      requiredSkill: s.requiredSkill,
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


export async function chainPreviewGoalViaRuntime(
  ctx: ChainContext,
  params: ChainPreviewGoalParams,
): Promise<ChainPreviewGoalResult> {
  const template = params.templateId
    ? CHAIN_GOAL_TEMPLATES.find((r: { id: string }) => r.id === params.templateId)
    : undefined;
  const goal = params.goal.trim() || template?.goal || "";
  if (!goal) {
    return { ok: false, subtasks: [], reason: "no_goal" };
  }
  const chainId = `chain_preview_${randomUUID()}`;
  const chainMandateId = `chainmandate_${randomUUID()}`;
  const mandate = {
    ...(ctx.placeholderMandate(chainId, chainMandateId) as Record<string, unknown>),
    maxChainCostUsd: params.maxChainCostUsd ?? template?.maxChainCostUsd ?? 10,
    costCeilingUsd: params.costCeilingUsd ?? template?.costCeilingUsd ?? 3,
  };
  const state = createChainState(mandate as Parameters<typeof createChainState>[0]);
  const deps = (await ctx.buildChainOrchestratorDeps()) as Parameters<typeof planChain>[0];
  const plan = await planChain(deps, state, goal, { allowLlm: params.allowLlm ?? true });
  if (!plan.ok) {
    return { ok: false, subtasks: [], reason: (plan as { reason: string }).reason };
  }
  const workersBySubtask: Record<string, string[]> = {};
  const rankedBySubtask: Record<string, ChainRankedWorker[]> = {};
  let maxWorkers = 0;
  for (const subtask of plan.subtasks) {
    const ranked = ctx.findAgentNetworkWorkersRanked
      ? await ctx.findAgentNetworkWorkersRanked(subtask.requiredSkill, params.preferredWorkerPeerIds)
      : (await ctx.findAgentNetworkWorkers(subtask.requiredSkill)).map((peerId) => ({
          peerId,
          score: 0,
          summary: peerId,
          sameLan: false,
          online: false,
          viaRelay: false,
        }));
    rankedBySubtask[subtask.subtaskId] = ranked;
    workersBySubtask[subtask.subtaskId] = ranked.map((r) => r.peerId);
    maxWorkers = Math.max(maxWorkers, ranked.length);
  }
  const estimatedCostRange = estimateChainCostRange({
    subtaskCount: plan.subtasks.length,
    workerCandidateCount: maxWorkers,
    maxChainCostUsd: mandate.maxChainCostUsd as number,
  });
  // System-recommended worker pool: prefer plan+assign assignees, then fill
  // with other ranked workers (best score / online). Cap to a UI-friendly N.
  const suggestedMap = new Map<
    string,
    {
      peerId: string;
      score: number;
      summary: string;
      sameLan: boolean;
      online: boolean;
      viaRelay: boolean;
      matchedSubtaskIds: Set<string>;
      assigned: boolean;
    }
  >();
  const bump = (
    w: {
      peerId: string;
      score: number;
      summary: string;
      sameLan: boolean;
      online: boolean;
      viaRelay: boolean;
    },
    subtaskId: string,
    assigned: boolean,
  ) => {
    const existing = suggestedMap.get(w.peerId);
    if (existing) {
      if (w.score > existing.score) {
        existing.score = w.score;
        existing.summary = w.summary;
        existing.sameLan = w.sameLan;
        existing.online = w.online;
        existing.viaRelay = w.viaRelay;
      }
      existing.matchedSubtaskIds.add(subtaskId);
      if (assigned) existing.assigned = true;
    } else {
      suggestedMap.set(w.peerId, {
        peerId: w.peerId,
        score: w.score,
        summary: w.summary,
        sameLan: w.sameLan,
        online: w.online,
        viaRelay: w.viaRelay,
        matchedSubtaskIds: new Set([subtaskId]),
        assigned,
      });
    }
  };
  for (const subtask of plan.subtasks) {
    const ranked = rankedBySubtask[subtask.subtaskId] ?? [];
    const preferredId = subtask.preferredWorkerPeerId;
    if (preferredId) {
      const preferred = ranked.find((r) => r.peerId === preferredId);
      if (preferred) bump(preferred, subtask.subtaskId, true);
    }
    for (const w of ranked) bump(w, subtask.subtaskId, false);
  }
  // Rank: plan assignees first, then online, then score.
  const suggestedWorkers = [...suggestedMap.values()]
    .sort((a, b) => {
      const aAssigned = a.assigned ? 1 : 0;
      const bAssigned = b.assigned ? 1 : 0;
      if (aAssigned !== bAssigned) return bAssigned - aAssigned;
      const aOnline = a.online ? 1 : 0;
      const bOnline = b.online ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      if (b.score !== a.score) return b.score - a.score;
      return a.peerId.localeCompare(b.peerId);
    })
    .slice(0, 8)
    .map(({ assigned: _assigned, ...w }) => ({
      ...w,
      matchedSubtaskIds: [...w.matchedSubtaskIds],
    }));
  return {
    ok: true,
    chainId,
    subtasks: plan.subtasks.map((s) => ({
      subtaskId: s.subtaskId,
      depth: s.depth,
      requiredSkill: s.requiredSkill,
      objective: s.objective,
      workerCount: (workersBySubtask[s.subtaskId] ?? []).length,
      preferredWorkerPeerId: s.preferredWorkerPeerId,
      requestedResult: s.requestedResult,
      constraints: s.constraints,
      dependsOn: s.dependsOn,
      costCeilingUsd: s.costCeilingUsd,
      deadlineAt: s.deadlineAt,
      createdAt: s.createdAt,
    })),
    estimatedCostRange,
    suggestedWorkers,
    diagnostics: ctx.chainDiagnosticsForSubtasks(
      plan.subtasks,
      workersBySubtask,
      rankedBySubtask,
    ) as never,
  };
}

export async function chainStartFromGoalViaRuntime(
  ctx: ChainContext,
  params: ChainStartFromGoalParams,
): Promise<ChainStartFromGoalResult> {
  const template = params.templateId
    ? CHAIN_GOAL_TEMPLATES.find((r: { id: string }) => r.id === params.templateId)
    : undefined;
  const goal = params.goal.trim() || template?.goal || "";
  if (!goal) {
    return { ok: false, error: "no_goal" };
  }
  const remoteAssigner = Boolean(params.assignerPeerId?.trim());
  const plannedSubtasks =
    params.plannedSubtasks && params.plannedSubtasks.length > 0
      ? params.plannedSubtasks
      : undefined;

  // When the UI already previewed, reuse that plan (no second LLM decompose).
  // Without a frozen plan, runChainGoal plans once — do not preview first.
  if (!remoteAssigner && !plannedSubtasks) {
    const preview = await chainPreviewGoalViaRuntime(ctx, {
      goal,
      templateId: params.templateId,
      maxChainCostUsd: params.maxChainCostUsd ?? template?.maxChainCostUsd,
      costCeilingUsd: params.costCeilingUsd ?? template?.costCeilingUsd,
      allowLlm: params.allowLlm,
      preferredWorkerPeerIds: params.preferredWorkerPeerIds,
    });
    if (!preview.ok || preview.subtasks.length === 0) {
      return {
        ok: false,
        error: preview.reason ?? "plan_failed",
        diagnostics: preview.diagnostics,
      };
    }
    const hasWorkers = preview.subtasks.some((s) => s.workerCount > 0);
    if (!hasWorkers) {
      return {
        ok: false,
        error: "no_workers",
        diagnostics: preview.diagnostics,
        estimatedCostRange: preview.estimatedCostRange,
      };
    }
    // Adopt preview plan so Start does not call planChain again.
    const reused = preview.subtasks.map((s) => ({
      subtaskId: s.subtaskId,
      depth: s.depth,
      requiredSkill: s.requiredSkill,
      objective: s.objective,
      requestedResult: s.requestedResult,
      constraints: s.constraints,
      dependsOn: s.dependsOn,
      costCeilingUsd: s.costCeilingUsd,
      deadlineAt: s.deadlineAt,
      preferredWorkerPeerId: s.preferredWorkerPeerId,
      createdAt: s.createdAt,
    }));
    const result = await ctx.runChainGoal({
      goal,
      maxChainCostUsd: params.maxChainCostUsd ?? template?.maxChainCostUsd,
      costCeilingUsd: params.costCeilingUsd ?? template?.costCeilingUsd,
      allowLlm: params.allowLlm,
      iterationMaxRounds: params.iterationMaxRounds,
      iterationJudgeMode: params.iterationJudgeMode,
      extendMaxStepsPerRound: params.extendMaxStepsPerRound,
      iterationWire: params.iterationState,
      preferredWorkerPeerIds: params.preferredWorkerPeerIds,
      plannedSubtasks: reused,
    });
    if (!result.ok) {
      return { ok: false, error: result.error, diagnostics: preview.diagnostics };
    }
    return {
      ok: true,
      chainId: result.chainId,
      chainMandateId: result.chainMandateId,
      subtasks: result.subtasks.map((s) => ({
        subtaskId: s.subtaskId,
        depth: s.depth ?? 0,
        requiredSkill: s.requiredSkill ?? "",
        objective: s.objective ?? "",
        preferredWorkerPeerId: s.preferredWorkerPeerId,
      })),
      estimatedCostRange: preview.estimatedCostRange,
      diagnostics: preview.diagnostics,
    };
  }

  const result = await ctx.runChainGoal({
    goal,
    maxChainCostUsd: params.maxChainCostUsd ?? template?.maxChainCostUsd,
    costCeilingUsd: params.costCeilingUsd ?? template?.costCeilingUsd,
    allowLlm: params.allowLlm,
    assignerPeerId: remoteAssigner ? params.assignerPeerId!.trim() : undefined,
    iterationMaxRounds: params.iterationMaxRounds,
    iterationJudgeMode: params.iterationJudgeMode,
    extendMaxStepsPerRound: params.extendMaxStepsPerRound,
    iterationWire: params.iterationState,
    preferredWorkerPeerIds: params.preferredWorkerPeerIds,
    plannedSubtasks,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return {
    ok: true,
    chainId: result.chainId,
    chainMandateId: result.chainMandateId,
    subtasks: result.subtasks.map((s) => ({
      subtaskId: s.subtaskId,
      depth: s.depth ?? 0,
      requiredSkill: s.requiredSkill ?? "",
      objective: s.objective ?? "",
      preferredWorkerPeerId: s.preferredWorkerPeerId,
    })),
    assignerPeerId: (result as { assignerPeerId?: string }).assignerPeerId,
    handedOff: (result as { handedOff?: boolean }).handedOff,
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