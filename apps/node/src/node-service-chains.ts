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
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createChainBudgetLedger, type ChainBudgetLedgerState } from "./chain-budget-ledger.js";
import {
  ChainActiveJournal,
  type ChainJournalProjection,
} from "./chain-active-journal.js";
import { chainBudgetWarningLevel } from "./chain-auto-orchestrator.js";
import {
  buildChainLiveSteps,
  chainStateSnapshot,
  counterBid,
  createChainState,
  launchChain,
  planChain,
  rebalanceChain,
  type ChainState,
} from "./chain-orchestrator.js";
import {
  CHAIN_GOAL_TEMPLATES,
  estimateChainCostRange,
  mergeChainDefaults,
  resolveAssignmentModeDefault,
} from "./chain-defaults.js";
import { formatPlanWarningDiagnostics } from "./chain-plan-assign.js";
import { chainCostsToCsv } from "./chain-cost-export.js";
import { buildArtifactGraph } from "./chain-artifact-transfer.js";
import { classifySpeculativeFinalSelection } from "./chain-speculation.js";
import { isFailedWorkerFinalPartial } from "./chain-orchestrator.js";
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
  ChainDeleteReportParams,
  ChainDeleteReportResult,
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

type PersistedChainRuntime = {
  state: Record<string, any>;
  bidStrategy: ChainBidStrategy;
};

function serializeChainRuntime(entry: ChainRuntimeEntry): PersistedChainRuntime {
  const { state, bidStrategy } = entry;
  const ledger = state.ledger.snapshot();
  return {
    bidStrategy,
    state: {
      ...state,
      journalEvent: undefined,
      subtasks: [...state.subtasks], bids: [...state.bids], awards: [...state.awards],
      partials: [...state.partials], partialsByAttempt: [...state.partialsByAttempt],
      speculativeAwards: [...state.speculativeAwards],
      hedgeSchedule: [...state.hedgeSchedule],
      speculationLocked: [...state.speculationLocked],
      verifyOnlyBlockedSubtasks: [...state.verifyOnlyBlockedSubtasks],
      cancelledSubtasks: [...state.cancelledSubtasks],
      negotiationRounds: [...state.negotiationRounds], workersBySubtask: [...state.workersBySubtask],
      proposedSubtasks: [...state.proposedSubtasks], proposedAt: [...state.proposedAt],
      proposeRetryCount: [...state.proposeRetryCount], acceptResendCount: [...state.acceptResendCount],
      reassignCount: [...state.reassignCount], silentWorkerPeerIds: [...state.silentWorkerPeerIds],
      awardedAt: [...state.awardedAt], lastHeartbeatAt: [...state.lastHeartbeatAt],
      lastConfidence: [...state.lastConfidence], attempts: [...state.attempts],
      selectedAttemptBySubtask: [...state.selectedAttemptBySubtask],
      ledger: {
        ...ledger,
        workerAllocations: [...ledger.workerAllocations],
        verificationAllocations: [...ledger.verificationAllocations],
      },
    },
  };
}

function deserializeChainRuntime(row: PersistedChainRuntime | undefined): ChainRuntimeEntry | undefined {
  if (!row) return undefined;
  const raw = row.state;
  if (!raw?.chainMandate || typeof raw.chainId !== "string") return undefined;
  const map = <T>(value: unknown) => new Map<string, T>(Array.isArray(value) ? value as Array<[string, T]> : []);
  const set = (value: unknown) => new Set<string>(Array.isArray(value) ? value as string[] : []);
  const state = createChainState(raw.chainMandate, { awardMode: raw.awardMode, goal: raw.goal });
  Object.assign(state, raw);
  state.subtasks = map(raw.subtasks);
  state.bids = map(raw.bids);
  state.awards = map(raw.awards);
  state.partials = map(raw.partials);
  state.partialsByAttempt = map(raw.partialsByAttempt);
  state.speculativeAwards = map(raw.speculativeAwards);
  state.hedgeSchedule = map(raw.hedgeSchedule);
  state.speculationLocked = set(raw.speculationLocked);
  state.verifyOnlyBlockedSubtasks = set(raw.verifyOnlyBlockedSubtasks);
  state.cancelledSubtasks = set(raw.cancelledSubtasks);
  state.negotiationRounds = map(raw.negotiationRounds);
  state.workersBySubtask = map(raw.workersBySubtask);
  state.proposedSubtasks = set(raw.proposedSubtasks);
  state.proposedAt = map(raw.proposedAt);
  state.proposeRetryCount = map(raw.proposeRetryCount);
  state.acceptResendCount = map(raw.acceptResendCount);
  state.reassignCount = map(raw.reassignCount);
  state.silentWorkerPeerIds = set(raw.silentWorkerPeerIds);
  state.awardedAt = map(raw.awardedAt);
  state.lastHeartbeatAt = map(raw.lastHeartbeatAt);
  state.lastConfidence = map(raw.lastConfidence);
  state.attempts = map(raw.attempts);
  state.selectedAttemptBySubtask = map(raw.selectedAttemptBySubtask);
  state.ledger = createChainBudgetLedger(raw.chainMandate, {
    ...raw.ledger,
    workerAllocations: map(raw.ledger?.workerAllocations),
    verificationAllocations: map(raw.ledger?.verificationAllocations),
  } as ChainBudgetLedgerState);
  return { state, bidStrategy: row.bidStrategy ?? { ...DEFAULT_BID_STRATEGY } };
}

export class ChainStore {
  private readonly runtime = new Map<string, ChainRuntimeEntry>();
  private readonly bidStrategies = new Map<string, ChainBidStrategy>();
  private filePath?: string;
  private persistTimer?: ReturnType<typeof setInterval>;
  private persistInFlight: Promise<void> = Promise.resolve();
  private journal?: ChainActiveJournal;
  private readonly journalProjections = new Map<string, ChainJournalProjection>();
  /** Phase 64A — remote Assigner ownership attached to checkpoints. */
  private readonly ownershipByChain = new Map<string, Record<string, unknown>>();

  /** Restore unfinished Team jobs and keep a crash-safe periodic snapshot. */
  async init(profileDir: string): Promise<void> {
    this.filePath = join(profileDir, "active-team-jobs.json");
    this.journal = new ChainActiveJournal(profileDir);
    let legacyRows: PersistedChainRuntime[] = [];
    try {
      legacyRows = JSON.parse(await readFile(this.filePath, "utf8")) as PersistedChainRuntime[];
    } catch {
      // The per-chain checkpoint is authoritative once migration has run.
    }
    const legacyById = new Map(
      legacyRows
        .filter((row) => typeof row.state?.chainId === "string")
        .map((row) => [row.state.chainId as string, row]),
    );
    const chainIds = new Set([...legacyById.keys(), ...await this.journal.listCheckpointChainIds()]);
    for (const chainId of chainIds) {
      await this.journal.initChain(chainId);
      const recovered = await this.journal.recover(chainId);
      const checkpointRuntime = recovered.checkpoint?.runtimeSnapshot as PersistedChainRuntime | undefined;
      const legacyRow = legacyById.get(chainId);
      // Checkpoint is authoritative once written; legacy file is a compatibility mirror only.
      const entry = deserializeChainRuntime(checkpointRuntime ?? legacyRow);
      if (!entry || entry.state.published || entry.state.chainCancelled) continue;
      const { state } = entry;
      this.journalProjections.set(chainId, recovered.projection);
      const ownershipRaw = recovered.checkpoint?.ownership;
      if (ownershipRaw && typeof ownershipRaw === "object") {
        this.ownershipByChain.set(chainId, ownershipRaw);
      }
      const recoveredAttempts = Object.values(recovered.projection.attempts);
      // Prefer runtimeSnapshot attempts/selection when present; projection fills gaps only.
      if (recoveredAttempts.length > 0 && state.attempts.size === 0) {
        state.attempts = new Map(recoveredAttempts.map((attempt) => [attempt.attemptId, attempt]));
        state.selectedAttemptBySubtask = new Map(Object.entries(recovered.projection.selectedAttemptBySubtask));
      } else if (recoveredAttempts.length > 0) {
        for (const attempt of recoveredAttempts) {
          if (!state.attempts.has(attempt.attemptId)) {
            state.attempts.set(attempt.attemptId, attempt);
          }
        }
      }
      this.bindJournal(state);
      this.runtime.set(chainId, entry);

      const alreadyMigrated = recovered.events.some(
        (event) => event.type === "migration.legacy_checkpoint_imported",
      );
      const needsLegacyImport = !checkpointRuntime && Boolean(legacyRow);
      if (state.attempts.size === 0 && !alreadyMigrated) {
        for (const award of state.awards.values()) {
          const attemptId = `attempt_migrated_${award.subtaskId}`;
          const attempt = {
            attemptId,
            chainId,
            subtaskId: award.subtaskId,
            workerPeerId: award.workerPeerId,
            role: "primary" as const,
            state: (state.partials.get(award.subtaskId)?.partial.isFinal
              ? "final_received"
              : "awarded") as "final_received" | "awarded",
            attemptNumber: 1,
            acceptedCostUsd: award.acceptedCostUsd,
            createdAt: award.createdAt,
            updatedAt: award.createdAt,
          };
          state.attempts.set(attemptId, attempt);
          state.selectedAttemptBySubtask.set(award.subtaskId, attemptId);
          // Journal each attempt so projection replay (not only the snapshot) owns identity.
          await this.journal.append(chainId, "attempt.awarded", { ...attempt });
        }
        if (state.attempts.size > 0) {
          await this.journal.append(chainId, "migration.attempts_imported", {
            attemptCount: state.attempts.size,
          });
        }
      } else if (state.attempts.size === 0 && alreadyMigrated) {
        // Prior migration journaled awards; rehydrate in memory only (no duplicate appends).
        for (const award of state.awards.values()) {
          const attemptId = `attempt_migrated_${award.subtaskId}`;
          state.attempts.set(attemptId, {
            attemptId,
            chainId,
            subtaskId: award.subtaskId,
            workerPeerId: award.workerPeerId,
            role: "primary",
            state: state.partials.get(award.subtaskId)?.partial.isFinal
              ? "final_received"
              : "awarded",
            attemptNumber: 1,
            acceptedCostUsd: award.acceptedCostUsd,
            createdAt: award.createdAt,
            updatedAt: award.createdAt,
          });
          state.selectedAttemptBySubtask.set(award.subtaskId, attemptId);
        }
      }
      if (needsLegacyImport && !alreadyMigrated) {
        await this.journal.append(chainId, "migration.legacy_checkpoint_imported", {
          source: "active-team-jobs.json",
        });
      }
      // Materialize checkpoint immediately after first legacy import so a crash
      // before the 1s persist timer cannot re-import or re-reserve.
      if (needsLegacyImport || !checkpointRuntime) {
        const after = await this.journal.recover(chainId);
        this.journalProjections.set(chainId, after.projection);
        await this.journal.writeCheckpoint(
          chainId,
          after.projection,
          after.lastSeq,
          new Date(),
          serializeChainRuntime(entry),
          this.ownershipByChain.get(chainId),
        );
      }
    }
    this.persistTimer = setInterval(() => {
      void this.persistNow().catch(() => undefined);
    }, 1_000);
    this.persistTimer.unref?.();
  }

  close(): void {
    if (this.persistTimer) clearInterval(this.persistTimer);
    this.persistTimer = undefined;
  }

  persistNow(): Promise<void> {
    const next = this.persistInFlight.then(() => this.writeSnapshot());
    this.persistInFlight = next.catch(() => undefined);
    return next;
  }

  private async writeSnapshot(): Promise<void> {
    if (!this.filePath) return;
    await this.journal?.flush();
    const activeEntries = [...this.runtime.values()]
      .filter(({ state }) => !state.published && !state.chainCancelled)
    const rows = activeEntries.map(serializeChainRuntime);
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(rows), { mode: 0o600 });
    await rename(tmp, this.filePath);
    if (this.journal) {
      for (const entry of activeEntries) {
        const { state } = entry;
        const recovered = await this.journal.recover(state.chainId);
        this.journalProjections.set(state.chainId, recovered.projection);
        await this.journal.writeCheckpoint(
          state.chainId,
          recovered.projection,
          recovered.lastSeq,
          new Date(),
          serializeChainRuntime(entry),
          this.ownershipByChain.get(state.chainId),
        );
      }
    }
  }

  /** Look up a runtime entry. Returns undefined if not present. */
  getRuntime(chainId: string): ChainRuntimeEntry | undefined {
    return this.runtime.get(chainId);
  }

  getJournalProjection(chainId: string): ChainJournalProjection | undefined {
    return this.journalProjections.get(chainId);
  }

  /** Phase 64A — attach remote Assigner ownership to the next checkpoint write. */
  setOwnership(chainId: string, ownership: Record<string, unknown>): void {
    this.ownershipByChain.set(chainId, ownership);
  }

  getOwnership(chainId: string): Record<string, unknown> | undefined {
    return this.ownershipByChain.get(chainId);
  }

  /** Overwrite the runtime entry for the given chainId. */
  setRuntime(chainId: string, entry: ChainRuntimeEntry): void {
    this.bindJournal(entry.state);
    this.runtime.set(chainId, entry);
    if (this.journal) {
      void this.journal.initChain(chainId).then(() =>
        this.journal?.append(chainId, "chain.runtime_created", {
          chainMandateId: entry.state.chainMandate.chainMandateId,
        }),
      ).catch(() => undefined);
    }
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
    this.bindJournal(entry.state);
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

  async flushJournal(chainId?: string): Promise<void> {
    await this.journal?.flush(chainId);
  }

  async readJournal(chainId: string) {
    await this.journal?.flush(chainId);
    return this.journal?.read(chainId) ?? [];
  }

  private bindJournal(state: ChainState): void {
    state.journalEvent = (type, data) => {
      void this.journal?.append(state.chainId, type, data).catch(() => undefined);
    };
  }
}

/* ---------- high-level operations ---------- */

/**
 * A ranked agent-network worker for a subtask. `online` / `viaRelay` come from
 * the live mesh connection snapshot so the team-job dialog can make offline
 * contacts non-selectable and the system pick can prefer reachable workers.
 * `manifest` (Phase 41 / MAP) is the worker's capability manifest when one is
 * available — synthesized from the card's owner-attested profile until wire
 * broadcast lands.
 */
export interface ChainRankedWorker {
  peerId: string;
  score: number;
  summary: string;
  sameLan: boolean;
  online: boolean;
  viaRelay: boolean;
  /**
   * Phase 60B — how readiness was decided. Lease wins; legacy ready-probe is
   * a penalized fallback for mixed-version peers.
   */
  availabilitySource?: "lease" | "legacy_probe" | "local" | "unknown";
  /** Phase 60C — deterministic strategy score components (0..1 each). */
  scoreComponents?: import("@envoymesh/api").ChainWorkerScoreComponents;
  /** Phase 60C — reliability lower confidence bound when known. */
  reliabilityLowerBound?: number;
  /** Phase 60C — observation sample count behind the reliability estimate. */
  reliabilitySampleCount?: number;
  /** Phase 61D — which hierarchy level produced the reliability estimate. */
  reliabilityFallbackLevel?:
    | "exact"
    | "peer_runtime_skill"
    | "peer_runtime"
    | "runtime_skill"
    | "prior";
  /** Phase 60C — stable exclusion reason when hard-gated out of selection. */
  exclusionReason?: import("@envoymesh/api").ChainWorkerExclusionReason;
  /** Phase 60C — assignment reason codes for provenance. */
  assignmentReasons?: import("@envoymesh/api").ChainAssignmentReasonCode[];
  manifest?: import("@envoymesh/protocol").CapabilityManifest;
}

export interface ChainContext {
  store: ChainStore;
  /** Side-state (award modes, pending assignment mode, plan warnings). */
  getChainSideState?(): {
    pendingAssignmentMode?: "skill" | "role";
    lastPlanMeta?: {
      warnings: Array<{
        code: string;
        role?: string;
        stepIndex?: number;
        usedPeerId?: string;
        assignKind?: string;
        message: string;
      }>;
      notes?: string;
      assignmentMode?: "skill" | "role";
    };
    assignmentModes: Map<string, "skill" | "role">;
    planWarnings: Map<
      string,
      Array<{
        code: string;
        role?: string;
        stepIndex?: number;
        usedPeerId?: string;
        assignKind?: string;
        message: string;
      }>
    >;
    /** Phase 60C — resolved Team strategy snapshot per chain. */
    teamStrategies: Map<string, import("@envoymesh/api").ResolvedChainTeamStrategy>;
    /** Phase 60D — restart reconciliation state per chain. */
    recovery: Map<
      string,
      {
        phase: "recovering" | "running" | "awaiting_owner" | "complete";
        orchestratorEpoch: string;
        startedAt: string;
        graceDeadlineAt: string;
        peers: Record<string, { status: string; workerEpoch?: string; reconciledAt?: string; attemptIds: string[] }>;
        conflicts: Array<{ attemptId: string; subtaskId: string; reason: string }>;
      }
    >;
  };
  /** Where to persist chain reports (class field). */
  hasTaskStore(): boolean;
  /** The task store's listChainReports / getChainReport / pinChainReport / deleteChainReport. */
  listChainReports(params?: ChainListReportsParams): Promise<Array<{ report: ChainListReportsResult["reports"][number] & { chainMandateId: string; orchestratorOwnerId: string; orchestratorPeerId: string; chainSummary: { subtaskCount: number; workerAllocations: unknown[]; synthesisCostUsd: number } } }>>;
  getChainReport(chainId: string): Promise<{ report: ChainGetReportResult["report"] & object } | null | void>;
  pinChainReport(chainId: string, pinned: boolean): Promise<void | unknown>;
  deleteChainReport(chainId: string): Promise<boolean>;
  /** Class fields used to enrich the get-state result. */
  getChainGoal(chainId: string): unknown;
  getChainCostEstimate(chainId: string): unknown;
  getChainAwardMode?(chainId: string): "direct" | "competitive" | undefined;
  getChainShowCostUi?(chainId: string): boolean | undefined;
  /** Worker-side read-only jobs (from task.chain.status). */
  listObservedChains?(): import("@envoymesh/api").ChainObservedStatus[];
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
    opts?: { strategyId?: import("@envoymesh/api").ChainTeamStrategyId },
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
    /** Phase 62C — override node default Assigner auto-selection. */
    assignerSelection?: import("@envoymesh/api").AssignerSelectionMode;
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
  assignmentMode?: "skill" | "role";
  plannedSubtasks?: Array<{
    subtaskId: string;
    depth: number;
    requiredSkill: string;
    requiredRole?: string;
    objective: string;
    requestedResult?: string;
    constraints?: string[];
    dependsOn?: string[];
    costCeilingUsd?: number;
    deadlineAt?: string;
    preferredWorkerPeerId?: string;
    createdAt?: string;
  }>;
  /** Preview warnings to persist when adopting `plannedSubtasks`. */
  planWarnings?: Array<{
    code: string;
    role?: string;
    stepIndex?: number;
    usedPeerId?: string;
    assignKind?: string;
    message: string;
  }>;
  /** Phase 59D — input delivery scope for this job. */
  inputDeliveryScope?: "referenced" | "all";
  /** Owner-flagged criticality hint (design §8.1 #1). Absent = `"normal"`. */
  criticality?: "normal" | "high";
  /** Phase 60C — Team strategy for this job. */
  teamStrategyId?: import("@envoymesh/api").ChainTeamStrategyId;
  /** Phase 63 — speculation overrides for this job. */
  speculationEnabled?: boolean;
  speculationOnDisagreement?: "auto" | "block";
  maxParallelAttemptsPerStep?: number;
  /** Phase 65A — opt-in deeper DAGs (forwarded into the chain mandate). */
  allowDepth3?: boolean;
  allowDepth4?: boolean;
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
  /** Phase 62C — preview suggested Assigner when capability mode is on. */
  previewSuggestedAssigner?(input: {
    assignerSelection?: import("@envoymesh/api").AssignerSelectionMode;
    nodeDefaults?: import("@envoymesh/api").ChainDefaultsConfig;
  }): Promise<{ peerId?: string; reason?: string; mode: import("@envoymesh/api").AssignerSelectionMode }>;
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
  result.steps = buildChainLiveSteps(entry.state);
  result.inputAttachments = entry.state.inputAttachments;
  result.inputDeliveries = entry.state.inputDeliveries;
  result.artifactDeliveries = entry.state.artifactDeliveries;
  result.inputDeliveryPolicy = entry.state.inputDeliveryPolicy;
  result.provenanceSummary = buildCompactProvenanceSummary(entry.state, ctx.store.getJournalProjection(params.chainId));
  result.speculationReview = buildSpeculationReviewPending(entry.state);
  const side = ctx.getChainSideState?.();
  result.assignmentMode = side?.assignmentModes.get(params.chainId);
  result.planWarnings = side?.planWarnings.get(params.chainId) as ChainGetStateResult["planWarnings"];
  result.teamStrategy = side?.teamStrategies.get(params.chainId);
  const recovery = side?.recovery.get(params.chainId);
  if (recovery) {
    result.recovery = {
      phase: recovery.phase,
      orchestratorEpoch: recovery.orchestratorEpoch,
      startedAt: recovery.startedAt,
      graceDeadlineAt: recovery.graceDeadlineAt,
      pendingPeers: Object.values(recovery.peers).filter((p) => p.status === "pending").length,
      conflictCount: recovery.conflicts.length,
    };
  }
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

function buildCompactProvenanceSummary(
  state: ChainState,
  projection?: ChainJournalProjection,
): NonNullable<ChainGetStateResult["provenanceSummary"]> {
  return [...state.subtasks.keys()].map((subtaskId) => {
    const attempts = [...state.attempts.values()].filter((attempt) => attempt.subtaskId === subtaskId);
    const selectedAttemptId = state.selectedAttemptBySubtask.get(subtaskId);
    const selected = selectedAttemptId ? state.attempts.get(selectedAttemptId) : undefined;
    const projected = selectedAttemptId ? projection?.attempts[selectedAttemptId] : undefined;
    return {
      subtaskId,
      ...(selectedAttemptId ? { selectedAttemptId } : {}),
      ...(selected?.workerPeerId ? { workerPeerId: selected.workerPeerId } : {}),
      attemptCount: attempts.length,
      ...(selected?.state ? { state: selected.state } : {}),
      ...(projected?.lastReason ? { lastReason: projected.lastReason } : {}),
    };
  });
}

function buildSpeculationReviewPending(
  state: ChainState,
): ChainGetStateResult["speculationReview"] {
  // Phase 63 — owner review banner only when the mandate opted into "block".
  if ((state.chainMandate.speculationOnDisagreement ?? "auto") !== "block") {
    return undefined;
  }
  const reviews: NonNullable<ChainGetStateResult["speculationReview"]> = [];
  for (const subtaskId of state.subtasks.keys()) {
    if (state.speculationLocked.has(subtaskId)) continue;
    const attempts = [...state.attempts.values()].filter((a) => a.subtaskId === subtaskId);
    const finals = attempts.filter((a) => a.state === "final_received");
    if (finals.length < 2) continue;
    const decision = classifySpeculativeFinalSelection(state, subtaskId, {
      verificationPassed: ({ partial }) => {
        if (!partial?.partial.isFinal) return false;
        return !isFailedWorkerFinalPartial(partial);
      },
    });
    if (decision.reason !== "disagree_needs_verify" && decision.reason !== "none_pass") {
      continue;
    }
    reviews.push({
      subtaskId,
      reason: decision.reason,
      attempts: finals.map((a) => ({
        attemptId: a.attemptId,
        workerPeerId: a.workerPeerId,
        ...(a.role ? { role: a.role } : {}),
      })),
    });
  }
  return reviews.length > 0 ? reviews : undefined;
}

export async function chainGetStepProvenanceViaRuntime(
  ctx: ChainContext,
  params: import("@envoymesh/api").ChainGetStepProvenanceParams,
): Promise<import("@envoymesh/api").ChainGetStepProvenanceResult> {
  const entry = ctx.store.getRuntime(params.chainId);
  const selectedAttemptId = entry?.state.selectedAttemptBySubtask.get(params.subtaskId);
  const attempts = [...(entry?.state.attempts.values() ?? [])]
    .filter((attempt) => attempt.subtaskId === params.subtaskId);
  const selected = selectedAttemptId ? entry?.state.attempts.get(selectedAttemptId) : undefined;
  const projected = selectedAttemptId
    ? ctx.store.getJournalProjection(params.chainId)?.attempts[selectedAttemptId]
    : undefined;
  const events = (await ctx.store.readJournal(params.chainId))
    .filter((event) => {
      if (event.data.subtaskId === params.subtaskId) return true;
      if (
        typeof event.data.attemptId === "string" &&
        entry?.state.attempts.get(event.data.attemptId)?.subtaskId === params.subtaskId
      ) {
        return true;
      }
      // Chain-level synthesis lineage still belongs in step provenance when
      // this subtask contributed a selected artifact.
      if (event.type === "synthesis.lineage" && Array.isArray(event.data.selectedArtifacts)) {
        return event.data.selectedArtifacts.some(
          (row) =>
            row !== null &&
            typeof row === "object" &&
            (row as { subtaskId?: unknown }).subtaskId === params.subtaskId,
        );
      }
      return false;
    })
    .map((event) => {
      const data = event.data;
      const strings = (value: unknown): string[] | undefined =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
      // Prefer this step's row inside a chain-level synthesis.lineage payload.
      let attemptId = typeof data.attemptId === "string" ? data.attemptId : undefined;
      let artifactIds = strings(data.artifactIds);
      let parentArtifactIds = strings(data.parentArtifactIds);
      if (event.type === "synthesis.lineage" && Array.isArray(data.selectedArtifacts)) {
        const row = data.selectedArtifacts.find(
          (item) =>
            item !== null &&
            typeof item === "object" &&
            (item as { subtaskId?: unknown }).subtaskId === params.subtaskId,
        ) as
          | {
              attemptId?: unknown;
              artifactKeys?: unknown;
              parentArtifactKeys?: unknown;
            }
          | undefined;
        if (typeof row?.attemptId === "string") attemptId = row.attemptId;
        artifactIds = strings(row?.artifactKeys) ?? artifactIds;
        parentArtifactIds = strings(row?.parentArtifactKeys) ?? parentArtifactIds;
      }
      return {
        eventId: event.eventId,
        seq: event.seq,
        at: event.at,
        type: event.type,
        ...(attemptId ? { attemptId } : {}),
        ...(typeof data.workerPeerId === "string" ? { workerPeerId: data.workerPeerId } : {}),
        ...(typeof data.runtime === "string" ? { runtime: data.runtime } : {}),
        ...(typeof data.model === "string" ? { model: data.model } : {}),
        ...(typeof data.transportPath === "string" ? { transportPath: data.transportPath } : {}),
        ...(typeof data.verifierRuntime === "string" ? { verifierRuntime: data.verifierRuntime } : {}),
        ...(typeof data.verifierModel === "string" ? { verifierModel: data.verifierModel } : {}),
        ...(typeof data.reason === "string" ? { reason: data.reason } : {}),
        ...(artifactIds ? { artifactIds } : {}),
        ...(parentArtifactIds ? { parentArtifactIds } : {}),
      };
    });
  return {
    chainId: params.chainId,
    subtaskId: params.subtaskId,
    selectedAttemptId,
    summary: {
      attemptCount: attempts.length,
      ...(selected?.workerPeerId ? { workerPeerId: selected.workerPeerId } : {}),
      ...(selected?.state ? { state: selected.state } : {}),
      ...(projected?.lastReason ? { lastReason: projected.lastReason } : {}),
    },
    events,
    ...(entry ? { artifactGraph: buildArtifactGraph(entry.state) } : {}),
  };
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
      snap.steps = buildChainLiveSteps(entry.state);
      snap.inputAttachments = entry.state.inputAttachments;
      snap.inputDeliveries = entry.state.inputDeliveries;
      snap.artifactDeliveries = entry.state.artifactDeliveries;
      snap.inputDeliveryPolicy = entry.state.inputDeliveryPolicy;
      snap.provenanceSummary = buildCompactProvenanceSummary(entry.state, ctx.store.getJournalProjection(chainId));
      const side = ctx.getChainSideState?.();
      snap.assignmentMode = side?.assignmentModes.get(chainId);
      snap.planWarnings = side?.planWarnings.get(chainId) as ChainGetStateResult["planWarnings"];
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

/** Read-only jobs where this node is a worker (synced via task.chain.status). */
export function chainListObservedViaRuntime(
  ctx: ChainContext,
  params?: import("@envoymesh/api").ChainListObservedParams,
): import("@envoymesh/api").ChainListObservedResult {
  const includeTerminal = params?.includeTerminal === true;
  const list = ctx.listObservedChains?.() ?? [];
  return {
    chains: list.filter((c) => {
      if (includeTerminal) return true;
      return c.phase !== "completed" && c.phase !== "cancelled";
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
    reports: rows.map((row) => {
      const persistedGoal =
        typeof (row.report as { goal?: unknown }).goal === "string"
          ? (row.report as { goal: string }).goal.trim()
          : "";
      const liveGoal = (() => {
        const g = ctx.getChainGoal(row.report.chainId);
        return typeof g === "string" ? g.trim() : "";
      })();
      const goal = persistedGoal || liveGoal || undefined;
      return {
        chainId: row.report.chainId,
        chainMandateId: row.report.chainMandateId,
        orchestratorOwnerId: row.report.orchestratorOwnerId,
        orchestratorPeerId: row.report.orchestratorPeerId,
        pinned: row.report.pinned ?? false,
        createdAt: row.report.createdAt,
        ...(goal ? { goal } : {}),
        chainSummary: {
          subtaskCount: row.report.chainSummary.subtaskCount,
          workerCount: row.report.chainSummary.workerAllocations.length,
          synthesisCostUsd: row.report.chainSummary.synthesisCostUsd,
        },
      };
    }),
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

export async function chainDeleteReportViaRuntime(
  ctx: ChainContext,
  params: ChainDeleteReportParams,
): Promise<ChainDeleteReportResult> {
  if (!ctx.hasTaskStore() || typeof ctx.deleteChainReport !== "function") {
    return { chainId: params.chainId, deleted: false };
  }
  const deleted = await ctx.deleteChainReport(params.chainId);
  if (deleted) {
    // Drop in-memory runtime so Team jobs does not resurrect a stale
    // Assigning/Running card after the report is gone.
    ctx.store.deleteRuntime(params.chainId);
  }
  return { chainId: params.chainId, deleted };
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
    (d.awardMode !== undefined && d.awardMode !== "direct" && d.awardMode !== "competitive") ||
    (d.assignmentMode !== undefined && d.assignmentMode !== "skill" && d.assignmentMode !== "role") ||
    (d.assignerSelection !== undefined &&
      d.assignerSelection !== "local" &&
      d.assignerSelection !== "best_capable") ||
    (d.speculationOnDisagreement !== undefined &&
      d.speculationOnDisagreement !== "auto" &&
      d.speculationOnDisagreement !== "block") ||
    (d.maxParallelAttemptsPerStep !== undefined &&
      (d.maxParallelAttemptsPerStep < 1 || d.maxParallelAttemptsPerStep > 2))
  ) {
    return { ok: false, defaults: d as never, reason: "validation_failed" };
  }
  await ctx.setNodeConfig({ chainDefaults: d });
  return { ok: true, defaults: d as never };
}

/* ---------- chainExportCosts / chainListRecipes / chainSaveRecipe / chainDeleteRecipe ---------- */

export type ResolvedChainRecipe = {
  id: string;
  label: string;
  goal: string;
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
  saved: boolean;
};

/** Phase 67A — resolve saved recipes first, then built-in CHAIN_GOAL_TEMPLATES. */
export async function resolveChainRecipeViaRuntime(
  ctx: ChainContext,
  templateId: string | undefined,
): Promise<ResolvedChainRecipe | undefined> {
  const id = templateId?.trim();
  if (!id) return undefined;
  if (ctx.listChainRecipes) {
    const saved = await ctx.listChainRecipes();
    const hit = saved.find((r) => r.id === id);
    if (hit) {
      return {
        id: hit.id,
        label: hit.label,
        goal: hit.goal,
        maxChainCostUsd: hit.maxChainCostUsd,
        costCeilingUsd: hit.costCeilingUsd,
        saved: true,
      };
    }
  }
  const builtin = CHAIN_GOAL_TEMPLATES.find((r: { id: string }) => r.id === id);
  if (!builtin) return undefined;
  return {
    id: builtin.id,
    label: builtin.label,
    goal: builtin.goal,
    maxChainCostUsd: builtin.maxChainCostUsd,
    costCeilingUsd: builtin.costCeilingUsd,
    saved: false,
  };
}

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
  const template = await resolveChainRecipeViaRuntime(ctx, params.templateId);
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
  const cfg = (await ctx.getNodeConfig()) as { chainDefaults?: Parameters<typeof mergeChainDefaults>[0] } | null;
  const mergedDefaults = mergeChainDefaults(cfg?.chainDefaults);
  const assignmentMode =
    params.assignmentMode === "role" || params.assignmentMode === "skill"
      ? params.assignmentMode
      : resolveAssignmentModeDefault(mergedDefaults);
  const teamStrategyId =
    params.teamStrategyId ??
    (mergedDefaults as { teamStrategyId?: import("@envoymesh/api").ChainTeamStrategyId }).teamStrategyId ??
    "balanced";
  const deps = (await ctx.buildChainOrchestratorDeps()) as Parameters<typeof planChain>[0];
  const plan = await planChain(deps, state, goal, {
    allowLlm: params.allowLlm ?? true,
    assignmentMode,
  });
  if (!plan.ok) {
    return { ok: false, subtasks: [], reason: (plan as { reason: string }).reason };
  }
  const planWarnings = (plan.planWarnings ?? []) as ChainPreviewGoalResult["planWarnings"];
  const workersBySubtask: Record<string, string[]> = {};
  const rankedBySubtask: Record<string, ChainRankedWorker[]> = {};
  let maxWorkers = 0;
  for (const subtask of plan.subtasks) {
    const ranked = ctx.findAgentNetworkWorkersRanked
      ? await ctx.findAgentNetworkWorkersRanked(subtask.requiredSkill, params.preferredWorkerPeerIds, {
          strategyId: teamStrategyId,
        })
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
      runtime?: import("@envoymesh/protocol").AgentRuntime;
      matchedSubtaskIds: Set<string>;
      assigned: boolean;
      availabilitySource?: ChainRankedWorker["availabilitySource"];
      scoreComponents?: ChainRankedWorker["scoreComponents"];
      reliabilityLowerBound?: number;
      reliabilitySampleCount?: number;
      reliabilityFallbackLevel?: ChainRankedWorker["reliabilityFallbackLevel"];
    }
  >();
  const bump = (
    w: ChainRankedWorker,
    subtaskId: string,
    assigned: boolean,
  ) => {
    const reliability =
      typeof w.reliabilityLowerBound === "number"
        ? {
            reliabilityLowerBound: w.reliabilityLowerBound,
            reliabilitySampleCount: w.reliabilitySampleCount,
            reliabilityFallbackLevel: w.reliabilityFallbackLevel,
          }
        : typeof w.scoreComponents?.reliability === "number"
          ? {
              reliabilityLowerBound: w.scoreComponents.reliability,
              reliabilitySampleCount: w.reliabilitySampleCount,
              reliabilityFallbackLevel: w.reliabilityFallbackLevel,
            }
          : {};
    const existing = suggestedMap.get(w.peerId);
    if (existing) {
      if (w.score > existing.score) {
        existing.score = w.score;
        existing.summary = w.summary;
        existing.sameLan = w.sameLan;
        existing.online = w.online;
        existing.viaRelay = w.viaRelay;
        existing.availabilitySource = w.availabilitySource;
        existing.scoreComponents = w.scoreComponents;
        existing.reliabilityLowerBound = reliability.reliabilityLowerBound;
        existing.reliabilitySampleCount = reliability.reliabilitySampleCount;
        existing.reliabilityFallbackLevel = reliability.reliabilityFallbackLevel;
      }
      existing.runtime = w.manifest?.runtime ?? existing.runtime;
      existing.matchedSubtaskIds.add(subtaskId);
      if (assigned) existing.assigned = true;
    } else {
      suggestedMap.set(w.peerId, {
        peerId: w.peerId,
        score: w.score,
        summary: w.summary,
        sameLan: w.sameLan,
        online: w.online === true,
        viaRelay: w.viaRelay === true,
        runtime: w.manifest?.runtime,
        matchedSubtaskIds: new Set([subtaskId]),
        assigned,
        availabilitySource: w.availabilitySource,
        scoreComponents: w.scoreComponents,
        ...reliability,
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
  const baseDiagnostics = ctx.chainDiagnosticsForSubtasks(
    plan.subtasks,
    workersBySubtask,
    rankedBySubtask,
  ) as string[];
  const warningDiagnostics = formatPlanWarningDiagnostics(planWarnings ?? []);
  const assignerMode =
    params.assignerSelection === "best_capable" || params.assignerSelection === "local"
      ? params.assignerSelection
      : mergedDefaults.assignerSelection === "best_capable"
        ? "best_capable"
        : "local";
  const assignerPreview = ctx.previewSuggestedAssigner
    ? await ctx.previewSuggestedAssigner({
        assignerSelection: assignerMode,
        nodeDefaults: mergedDefaults,
      })
    : { mode: assignerMode as import("@envoymesh/api").AssignerSelectionMode };
  const iterationMaxRounds =
    mergedDefaults.iterationMaxRounds ?? 1;
  const iterationPreviewHint =
    iterationMaxRounds > 1
      ? mergedDefaults.iterationJudgeMode === "owner"
        ? "Multi-round job: you may be asked to continue or stop after each draft."
        : "Multi-round job: the Assigner may refine the report across several rounds."
      : undefined;
  const assignerDiagnostics =
    assignerPreview.reason && assignerMode === "best_capable"
      ? [assignerPreview.reason]
      : [];
  return {
    ok: true,
    chainId,
    assignmentMode,
    planWarnings,
    subtasks: plan.subtasks.map((s) => ({
      subtaskId: s.subtaskId,
      depth: s.depth,
      requiredSkill: s.requiredSkill,
      requiredRole: (s as { requiredRole?: string }).requiredRole,
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
    teamStrategyId,
    suggestedAssignerPeerId: assignerPreview.peerId,
    suggestedAssignerReason: assignerPreview.reason,
    iterationPreviewHint,
    diagnostics: [...assignerDiagnostics, ...warningDiagnostics, ...(baseDiagnostics ?? [])],
  };
}

export async function chainStartFromGoalViaRuntime(
  ctx: ChainContext,
  params: ChainStartFromGoalParams,
): Promise<ChainStartFromGoalResult> {
  const template = await resolveChainRecipeViaRuntime(ctx, params.templateId);
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
      assignmentMode: params.assignmentMode,
      preferredWorkerPeerIds: params.preferredWorkerPeerIds,
      teamStrategyId: params.teamStrategyId,
      assignerSelection: params.assignerSelection,
    });
    if (!preview.ok || preview.subtasks.length === 0) {
      return {
        ok: false,
        error: preview.reason ?? "plan_failed",
        diagnostics: preview.diagnostics,
        assignmentMode: preview.assignmentMode,
        planWarnings: preview.planWarnings,
      };
    }
    const hasWorkers = preview.subtasks.some((s) => s.workerCount > 0);
    if (!hasWorkers) {
      return {
        ok: false,
        error: "no_workers",
        diagnostics: preview.diagnostics,
        estimatedCostRange: preview.estimatedCostRange,
        assignmentMode: preview.assignmentMode,
        planWarnings: preview.planWarnings,
      };
    }
    // Adopt preview plan so Start does not call planChain again.
    const reused = preview.subtasks.map((s) => ({
      subtaskId: s.subtaskId,
      depth: s.depth,
      requiredSkill: s.requiredSkill,
      requiredRole: s.requiredRole,
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
      assignmentMode: params.assignmentMode ?? preview.assignmentMode,
      iterationMaxRounds: params.iterationMaxRounds,
      iterationJudgeMode: params.iterationJudgeMode,
      extendMaxStepsPerRound: params.extendMaxStepsPerRound,
      iterationWire: params.iterationState,
      preferredWorkerPeerIds: params.preferredWorkerPeerIds,
      plannedSubtasks: reused,
      planWarnings: preview.planWarnings,
      inputDeliveryScope: params.inputDeliveryScope,
      criticality: params.criticality,
      teamStrategyId: params.teamStrategyId ?? preview.teamStrategyId,
      assignerSelection: params.assignerSelection,
      assignerPeerId: params.assignerPeerId?.trim() || undefined,
      speculationEnabled: params.speculationEnabled,
      speculationOnDisagreement: params.speculationOnDisagreement,
      maxParallelAttemptsPerStep: params.maxParallelAttemptsPerStep,
      allowDepth3: params.allowDepth3,
      allowDepth4: params.allowDepth4,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        diagnostics: preview.diagnostics,
        assignmentMode: preview.assignmentMode,
        planWarnings: preview.planWarnings,
      };
    }
    return {
      ok: true,
      chainId: result.chainId,
      chainMandateId: result.chainMandateId,
      assignmentMode: preview.assignmentMode,
      planWarnings: preview.planWarnings,
      subtasks: result.subtasks.map((s) => ({
        subtaskId: s.subtaskId,
        depth: s.depth ?? 0,
        requiredSkill: s.requiredSkill ?? "",
        requiredRole: (s as { requiredRole?: string }).requiredRole,
        objective: s.objective ?? "",
        preferredWorkerPeerId: s.preferredWorkerPeerId,
      })),
      estimatedCostRange: preview.estimatedCostRange,
      diagnostics: preview.diagnostics,
      assignerPeerId: (result as { assignerPeerId?: string }).assignerPeerId,
      handedOff: (result as { handedOff?: boolean }).handedOff,
    };
  }

  const result = await ctx.runChainGoal({
    goal,
    maxChainCostUsd: params.maxChainCostUsd ?? template?.maxChainCostUsd,
    costCeilingUsd: params.costCeilingUsd ?? template?.costCeilingUsd,
    allowLlm: params.allowLlm,
    assignmentMode: params.assignmentMode,
    assignerPeerId: remoteAssigner ? params.assignerPeerId!.trim() : undefined,
    iterationMaxRounds: params.iterationMaxRounds,
    iterationJudgeMode: params.iterationJudgeMode,
    extendMaxStepsPerRound: params.extendMaxStepsPerRound,
    iterationWire: params.iterationState,
    preferredWorkerPeerIds: params.preferredWorkerPeerIds,
    plannedSubtasks,
    planWarnings: params.planWarnings,
    inputDeliveryScope: params.inputDeliveryScope,
    criticality: params.criticality,
    teamStrategyId: params.teamStrategyId,
    assignerSelection: params.assignerSelection,
    speculationEnabled: params.speculationEnabled,
    speculationOnDisagreement: params.speculationOnDisagreement,
    maxParallelAttemptsPerStep: params.maxParallelAttemptsPerStep,
    allowDepth3: params.allowDepth3,
    allowDepth4: params.allowDepth4,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  const side = ctx.getChainSideState?.();
  const meta = result.chainId ? side?.planWarnings.get(result.chainId) : undefined;
  const mode =
    (result.chainId ? side?.assignmentModes.get(result.chainId) : undefined) ??
    params.assignmentMode;
  return {
    ok: true,
    chainId: result.chainId,
    chainMandateId: result.chainMandateId,
    assignmentMode: mode,
    planWarnings: (meta ?? params.planWarnings) as ChainStartFromGoalResult["planWarnings"],
    subtasks: result.subtasks.map((s) => ({
      subtaskId: s.subtaskId,
      depth: s.depth ?? 0,
      requiredSkill: s.requiredSkill ?? "",
      requiredRole: (s as { requiredRole?: string }).requiredRole,
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
