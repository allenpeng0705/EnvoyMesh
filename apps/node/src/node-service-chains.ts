/**
 * Agent network chains runtime (Phase 40).
 *
 * Extracted from `node-service-impl.ts`. Owns the per-chain runtime
 * state (a `Map<chainId, ChainState>` plus a `Map<capability, bid
 * strategy>`) and exposes the simple RPCs as runtime functions.
 *
 * The complex RPCs (`chainPlan`, `chainLaunch`, `chainRebalance`,
 * `chainEvaluateBids`, etc.) still live on the class because they
 * pull in many other class helpers; they read the store directly
 * via the class-owned `ChainStore` field. Future commits can lift
 * them out too.
 */
import { chainBudgetWarningLevel } from "./chain-auto-orchestrator.js";
import { chainStateSnapshot, createChainState, type ChainState } from "./chain-orchestrator.js";
import { mergeChainDefaults } from "./chain-defaults.js";
import type {
  ChainGetStateParams,
  ChainGetStateResult,
  ChainListActiveResult,
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