/**
 * Agent network chain orchestration runtime (Phase 40).
 *
 * Extracted from `node-service-impl.ts` (~lines 8478–9306). Owns the
 * chain dep builders, inbound dispatch, capability-index refresh,
 * tracking/award pipeline, and the `ChainContext` factory used by
 * `node-service-chains.ts`.
 */
import { randomUUID } from "node:crypto";
import { buildModelProviders, routeModelRequest } from "@envoymesh/models";
import { createAuditEvent, type AuditEventType, type LocalPeerDirectoryStore, type LocalTaskStore } from "@envoymesh/local-store";
import type {
  ApprovalQueue,
  BondLevel,
  BondRecord,
  CachedAgentCardSummary,
  ChainAwardApprovalPayload,
  ChainDefaultsConfig,
  ChainEvaluateBidsParams,
  ChainGetStateResult,
  ChainListReportsParams,
  ChainResolveSpeculationParams,
  ChainResolveSpeculationResult,
  NodeProfile,
  NodeServiceEvents,
  PiPromptResult,
} from "@envoymesh/api";
import type { ChainReport, ChainSubtask, ChainSubtaskBid, EnvoyEnvelope, EnvoyIntent, AgentRuntime } from "@envoymesh/protocol";
import { ChainHandoffRequestPayloadSchema, ChainSubtaskSchema } from "@envoymesh/protocol";
import { createApprovalItem, isAgentNetworkMember, rankWorkersByScore, scoreAgentNetworkWorker, compareChainWorkerTies, evaluateChainWorkerHardGates, getChainTeamStrategyPreset, resolveChainTeamStrategy, scoreChainWorkerWithStrategy, type ChainAssignmentReasonCode, type ChainTeamStrategyId } from "@envoymesh/api";
import { hasDirectPrivateLanDialHints, type EnvoyMesh } from "@envoymesh/network";
import { anLog, shortId } from "./agent-network-debug.js";
import { resolveAssignerForChainGoal, previewSuggestedAssigner } from "./chain-assigner-select.js";
import {
  buildChainLiveSteps,
  buildInputArtifacts,
  chainStateSnapshot,
  chooseWorkersForSubtask,
  createChainState,
  evaluateBids,
  handleOrchestratorBid,
  handleOrchestratorHeartbeat,
  handleOrchestratorMerge,
  handleOrchestratorPartial,
  advanceReadySubtasks,
  broadcastChainStatus,
  launchChain,
  planChain,
  retryStaleAccepts,
  retryStaleProposals,
  sendChainAccept,
  sendChainCancel,
  sendChainHandoff,
  reassignStalledSubtask,
  trackChain,
  mergeProposeInputArtifacts,
  type ChainOrchestratorHandlerDeps,
  type ChainState,
  type EvaluateBidsResult,
} from "./chain-orchestrator.js";
import {
  copyChainInputInVault,
  deliverChainInputsOnAward,
  buildJobInputFileArtifacts,
  jobInputsReadyForAward,
  retryFailedChainInputDeliveries,
  gcChainInputWorkspace,
} from "./chain-input-delivery-runtime.js";
import {
  maybeScheduleSpeculationAfterAward,
  ownerPickSpeculativeAttempt,
  clearSpeculativeSibling,
  speculativeFinalsContext,
} from "./chain-speculation-wire.js";
import {
  autoResolveSpeculativeDisagreement,
  classifySpeculativeFinalSelection,
} from "./chain-speculation.js";
import { isChainRecovering } from "./chain-reconcile-recovery.js";
import { LEGACY_PROBE_SCORE_PENALTY } from "./worker-lease-store.js";
import { modelFamilyFor } from "./chain-verify-loop.js";
import { sendVaultFileViaDataTransfer } from "./node-file-share.js";
import {
  chainBudgetWarningLevel,
  iterationReplanGoal,
  markIterationRoundOpened,
  subtasksAwaitingAward,
  tryCompleteChainIfReady,
} from "./chain-auto-orchestrator.js";
import { createIterationState } from "./chain-iteration.js";
import {
  iterationSnapshotFromState,
  populateIterationInState,
  buildIterationProgressEvent,
} from "./chain-iteration-orchestration.js";
import {
  CHAIN_AUTO_EVALUATE_MS,
  CHAIN_DIRECT_AUTO_EVALUATE_MS,
  DEFAULT_CHAIN_DEFAULTS,
  estimateChainCostRange,
  mergeChainDefaults,
  resolveAssignmentModeDefault,
  resolveAwardMode,
  resolveShowCostUi,
} from "./chain-defaults.js";
import { AgentNetworkMembershipIndex } from "./capability-index.js";
import {
  localAgentNetworkEngineReady,
  probeChainWorkerReady,
  shouldSkipWorkerForEngineProbe,
  type ChainReadyProbeCacheEntry,
} from "./chain-ready-probe.js";
import {
  extractChainIdFromEnvelope,
  resolveChainTransportPeerId,
  sendChainEnvelopeOverMesh,
  type ChainTransportResolver,
} from "./chain-production.js";
import { dispatchChainEnvelope } from "./chain-inbound.js";
import type { ChainInboundDeps } from "./chain-inbound-types.js";
import { chainLog, chainWarn, shortPeerId } from "./chain-debug.js";
import {
  applyArbitration,
  createArbitrationStore,
  getLatestVerdictForSubtask,
  getVerdictsFor,
  isVerdictEntry,
  recordVerdictEntry,
  type ArbitrationStore,
} from "./chain-arbitration.js";
import { scoreFromVerdicts } from "./chain-reputation-3tuple.js";
import { getReputationBySkillForPeer } from "./chain-scoreboard.js";
import { signCanonicalPayload } from "@envoymesh/identity";
import {
  handleWorkerAccept,
  handleWorkerCancel,
  handleWorkerHeartbeat,
  handleWorkerMandate,
  handleWorkerPropose,
  handleWorkerStatus,
  type ChainWorkerHandlerDeps,
} from "./chain-worker.js";
import {
  coerceAgentNetworkWorkerEngine,
  type AgentNetworkWorkerEngine,
} from "./agent-network-worker-engine.js";
import {
  createEnvoyHarnessChainSubtaskExecutor,
  createExtAgentChainSubtaskExecutor,
  createOpenClawChainSubtaskExecutor,
  executeAcceptedSubtask,
} from "./chain-worker-executor.js";
import {
  buildSubtaskPromptForAdapter,
  createMapChainSubtaskExecutor,
  manifestFromAgentNetworkProfile,
} from "./chain-map.js";
import { isManifestFresh, pruneExpiredManifests } from "./agent-adapter-manifest-inbound.js";
import { OpenClawAdapter } from "@envoymesh/agent-adapter";
import type { AgentAdapter } from "@envoymesh/agent-adapter";
import { createPiAdapterFromHost, type PiMapHost } from "./pi-map-adapter.js";
import { requiresChainAwardApproval } from "./chain-sensitivity-gate.js";
import type { BridgeIdentity } from "./bridge/pipe.js";
import type { MeshToolContext } from "./tool-registry.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";
import { type ChainContext, type ChainRankedWorker, type ChainStore } from "./node-service-chains.js";

/* ---------- context ---------- */

export interface ChainPlanMeta {
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
}

export interface ChainSideState {
  pendingBidExpirations: Map<string, string>;
  trackAbort: Map<string, AbortController>;
  workerSubtasks: Map<
    string,
    {
      subtask: ChainSubtask;
      orchestratorPeerId: string;
      /** Phase 53 — parent artifacts from propose (typed handoff). */
      inputArtifacts?: import("@envoymesh/protocol").NamedArtifact[];
    }
  >;
  autoEvaluateTimers: Map<string, ReturnType<typeof setTimeout>>;
  goals: Map<string, string>;
  costEstimates: Map<string, { minUsd: number; maxUsd: number }>;
  /** Per-chain award mode (defaults to direct when absent). */
  awardModes: Map<string, "direct" | "competitive">;
  /** Per-chain cost UI visibility. */
  showCostUi: Map<string, boolean>;
  /**
   * @deprecated Prefer request-scoped `planChain(..., { assignmentMode })`.
   * Kept as a fallback for older call paths that have not been updated.
   */
  pendingAssignmentMode?: "skill" | "role";
  /** @deprecated Prefer returning warnings from `planChain` / start params. */
  lastPlanMeta?: ChainPlanMeta;
  /** Per-chain assignment mode + plan warnings for UI. */
  assignmentModes: Map<string, "skill" | "role">;
  planWarnings: Map<string, ChainPlanMeta["warnings"]>;
  /**
   * Phase 47B — queued Assigner extend steps for the next idle open-round tick.
   * Cleared after a successful append+launch (or rejected clear).
   */
  pendingExtendSteps: Map<string, import("./chain-iteration.js").ExtendStepInput[]>;
  /**
   * Phase 47D — peer that handed off this chain (trigger) and should observe
   * iteration progress via local WS when connected to this Assigner, or via
   * future wire observe. Stored for correlation / notify hooks.
   */
  iterationObservers: Map<string, string>;
  /**
   * Read-only snapshots of jobs where this node is a worker (from
   * `task.chain.status`). Keyed by chainId. Never grants manage/cancel.
   */
  observedChains: Map<string, ObservedChainSnapshot>;
  /** Debounce status fan-out per chain (ms epoch). */
  lastStatusBroadcastAt: Map<string, number>;
  /** Cached `task.chain.ready` probe results (worker peer id → ready). */
  readyProbeCache: Map<string, ChainReadyProbeCacheEntry>;
  /**
   * MAP — wire-received `adapter.manifest` broadcasts, keyed by the sender's
   * agent peerId. Populated by `handleInboundCapabilityManifest`; consumed by
   * `findAgentNetworkWorkersRanked` (preferred over card synthesis) and
   * `resolveWorkerPool`.
   */
  remoteManifests: Map<string, import("@envoymesh/protocol").SignedCapabilityManifest>;
  /**
   * Phase 60B — live signed worker leases (availability). Separate from the
   * capability index; Agent Card `lastSeenAt` must not drive engine readiness.
   */
  workerLeases: import("./worker-lease-store.js").WorkerLeaseStore;
  /**
   * Phase 60C — local calibrated reliability observations (Beta posterior).
   * Compatibility 3-tuple reputation remains elsewhere.
   */
  workerReliability: import("./worker-reliability-store.js").WorkerReliabilityStore;
  /** Phase 60C — resolved strategy snapshot per chain (replay-stable). */
  teamStrategies: Map<string, import("@envoymesh/api").ResolvedChainTeamStrategy>;
  /**
   * Phase 60D — restart reconciliation state per chain. While `phase ===
   * "recovering"`, watchdog / reassignment loops must not advance awards.
   */
  recovery: Map<string, import("./chain-reconcile-recovery.js").ChainRecoveryState>;
  /** Phase 60D — assigner process epoch (regenerated each process start). */
  orchestratorEpoch: string;
  /** Phase 60D — worker process epoch for reconcile responses. */
  workerEpoch: string;
  /** Phase 60D — local worker attempt receipts (mandate TTL + 24h). */
  attemptReceipts: import("./worker-attempt-receipt-store.js").WorkerAttemptReceiptStore;
  /** Phase 60D — dedup keys for recovered/ingested finals. */
  recoveredPartialKeys: Set<string>;
  /** Phase 61C — finals to re-advance after RECOVERING lifts. */
  recoveryAdvancePending: Set<string>;
  /** Phase 59E — chainIds whose job input workspace was already GC'd. */
  inputGcDone: Set<string>;
}

/** Worker-side read-only view of an assigner's team job. */
export interface ObservedChainSnapshot {
  chainId: string;
  goal?: string;
  phase:
    | "assigning"
    | "waitingWorkers"
    | "bidding"
    | "running"
    | "synthesizing"
    | "completed"
    | "cancelled";
  awardMode: "direct" | "competitive";
  subtaskCount: number;
  awardedCount: number;
  partialCount: number;
  finalPartialCount?: number;
  bidCount?: number;
  steps: Array<{
    subtaskId: string;
    objective?: string;
    state: "pending" | "offered" | "awarded" | "running" | "done" | "failed" | "cancelled";
    workerPeerId?: string;
  }>;
  orchestratorPeerId: string;
  updatedAt: string;
  readOnly: true;
}

/**
 * Phase 40E — per-chain arbitration ownership ledgers.
 *
 * Module-level (in-memory) registry keyed by chainId. The inbound arbitration
 * handler records remote ownership entries here so future local award
 * decisions can consult "who owns what" before committing budget. Lost
 * arbitration entries cause the local orchestrator to release reserved
 * budget via `releaseOwnership` (deeper follow-up); for now this establishes
 * the convergence record path.
 */
const chainArbitrationStores = new Map<string, ArbitrationStore>();

function getChainArbitrationStore(chainId: string): ArbitrationStore {
  let store = chainArbitrationStores.get(chainId);
  if (!store) {
    store = createArbitrationStore();
    chainArbitrationStores.set(chainId, store);
  }
  return store;
}

/**
 * Phase 8 / v1.13 — derive a peer's per-skill
 * reputation by aggregating verdicts across
 * all chain arbitration stores. Returns
 * `undefined` when the peer has no verdict
 * history yet — the Assigner blend treats
 * that as "unknown" and leaves the base
 * score untouched.
 *
 * **v1.13:** the v0
 * `deriveReputationBySkillForPeer` producer
 * is replaced with the v1.10 + v1.11
 * `getReputationBySkillForPeer` helper.
 * The consumer (the worker's
 * `reputationBySkill` field) is unchanged.
 * The v0 `chain-reputation-3tuple.ts`
 * module is left in place for other
 * callers (e.g. `getLocalRuntimePassRate`
 * still uses the v0 `scoreFromVerdicts`).
 */
function deriveRosterReputation(peerId: string): Record<string, number> | undefined {
  return getReputationBySkillForPeer(
    chainArbitrationStores.values(),
    peerId,
  );
}

/**
 * Federated-scoreboard input (design §9.2): the local verdict-history pass
 * rate for one runtime, aggregated across every chain's ArbitrationStore.
 * `null` when the node has no verdicts for the runtime at all — the pull
 * gate then holds `pending`, never adopting blind.
 */
export function getLocalRuntimePassRate(
  runtime: AgentRuntime,
): { n: number; passRate: number } | null {
  const verdicts: import("@envoymesh/protocol").VerdictEntry[] = [];
  for (const store of chainArbitrationStores.values()) {
    verdicts.push(...getVerdictsFor(store, { workerRuntime: runtime }));
  }
  if (verdicts.length === 0) return null;
  return { n: verdicts.length, passRate: scoreFromVerdicts(verdicts) };
}

/**
 * U4 — every signed verdict across every chain's arbitration store
 * (used by the dedicated UI's `scoreboard/summary`).
 */
export function listAllVerdictEntries(): import("@envoymesh/protocol").VerdictEntry[] {
  const verdicts: import("@envoymesh/protocol").VerdictEntry[] = [];
  for (const store of chainArbitrationStores.values()) {
    for (const entry of store.values()) {
      if (isVerdictEntry(entry)) verdicts.push(entry);
    }
  }
  return verdicts;
}

/**
 * U4 — the local chain worker's subtasks as the dedicated UI's
 * `team/jobs` shape (one job per chain, one agent per subtask).
 */
export function chainWorkerSubtasksToTeamJobs(
  workerSubtasks: Map<
    string,
    {
      subtask: import("@envoymesh/protocol").ChainSubtask;
      orchestratorPeerId: string;
    }
  >,
): import("@envoymesh/envoy-harness").ProtocolTeamJob[] {
  const byChain = new Map<
    string,
    import("@envoymesh/envoy-harness").ProtocolTeamJob
  >();
  for (const [subtaskId, { subtask }] of workerSubtasks) {
    let job = byChain.get(subtask.chainId);
    if (job === undefined) {
      job = {
        jobId: subtask.chainId,
        status: "running",
        createdAt: subtask.createdAt,
        agents: [],
      };
      byChain.set(subtask.chainId, job);
    }
    job.agents.push({
      id: subtaskId,
      host: "mesh-worker",
      status: "running",
    });
  }
  return [...byChain.values()];
}

export interface ChainOrchestrationContext {
  getChainStore(): ChainStore;
  getChainSideState(): ChainSideState;
  getTaskStore(): LocalTaskStore | undefined;
  getProfile(): NodeProfile | undefined;
  getApprovalQueue(): ApprovalQueue | null;
  getAgentNetworkMembershipIndex(): AgentNetworkMembershipIndex;
  getAgentNetworkMembershipIndexReady(): Promise<void> | null;
  getPeerDirectoryStore(): LocalPeerDirectoryStore;
  getReachableMesh(): EnvoyMesh | undefined;
  ensureAgentIdentity(): Promise<BridgeIdentity | null>;
  listAgentCards(): Promise<CachedAgentCardSummary[]>;
  /**
   * Local agent as a Team-jobs worker when Join Agent Network is on.
   * Not stored in the peer card cache — synthesized from live config + identity.
   */
  getLocalAgentNetworkWorkerCard(): Promise<CachedAgentCardSummary | undefined>;
  getLocalManifestCapabilities(): Promise<string[]>;
  getToolExecutionContext(): Promise<MeshToolContext | null>;
  getBonds(): Promise<BondRecord[]>;
  getNodeConfig(): Promise<unknown>;
  updateNodeConfig(cfg: unknown): Promise<void>;
  /**
   * Phase 8 / v1.4 — sync accessor for the
   * persisted node config. Used by
   * `runChainVerificationLoop` to resolve the
   * effective `verifyMode` default via
   * `readEffectiveVerifyModeDefault`. The
   * underlying store keeps an in-memory
   * snapshot that's always up-to-date after the
   * first `load()` or `save()` (see
   * `NodeConfigStore.peek()`), so the read is
   * sync with no disk I/O. Returns `undefined`
   * on cold start (no I/O yet) and the loop
   * falls back to the per-runtime default.
   */
  getPersistedNodeConfigSync?(): import("./node-config-store.js").PersistedNodeConfig | undefined;

  /**
   * v1.16 — optional per-call model override hint for the
   * orchestrator-level cross-verify (cross-model-on-same-runtime).
   * Forwarded into `chainVerify.verifierProviderHint` so the loop's
   * cross branch re-runs the subtask on the second adapter with a
   * different model (`ExecuteInput.verifierModel`). Format:
   * `<provider>:<model>` (e.g. `"anthropic:claude-instant"`).
   * Optional — absent = the v1.8 cross-runtime behavior.
   */
  verifierProviderHint?: string;
  /** Live envoy-harness adapter for the same-runtime cross-verify
   *  (v1.16). Absent → `buildAdapter("envoy-harness")` returns undefined. */
  getEnvoyHarnessAdapter?(): AgentAdapter | undefined;
  emit<K extends keyof NodeServiceEvents>(event: K, data: NodeServiceEvents[K]): void;
  /** Built-in OpenClaw readiness for Agent Network worker execution. */
  isOpenClawReady(): boolean;
  /** Ask Built-in OpenClaw (default AN worker engine). */
  askOpenClaw(prompt: string): Promise<string>;
  /** Local Pi runtime readiness for the MAP second-doctor cross-check. */
  isPiReady(): boolean;
  /** Ask the local Pi runtime (MAP cross-check / second-doctor run). */
  askPi(prompt: string): Promise<PiPromptResult>;
  /** Node-owner AN worker engine choice (`openclaw` | `ext` | `envoy-harness`). */
  getAgentNetworkWorkerEngine(): AgentNetworkWorkerEngine;
  /** Ext Agent bridge ready enough to accept Team-job work. */
  isExtAgentBridgeReady(): boolean;
  /** Sync ask via active Ext Agent (Team jobs — empty/async reply = error). */
  askExtAgent(prompt: string): Promise<string>;
  /**
   * Phase 8 — envoy-harness readiness for AN worker execution.
   * Reads the resolved host model configuration without spending a model call.
   */
  isEnvoyHarnessReady(): boolean;
  /**
   * Sync ask via the configured envoy-harness model adapter.
   */
  askEnvoyHarness(prompt: string): Promise<string>;
  /** Live Ext Agent reachability hello (HTTP/sidecar) for AN ready probes. */
  probeExtAgent(): Promise<{ reachable: boolean }>;
  /** Local vault root for job input byte delivery (Phase 59B). */
  getVaultDir(): string | undefined;
}

/** Peer card cache plus the local Join'd worker (creator is also a worker). */
export async function listAgentCardsIncludingLocal(
  deps: ChainOrchestrationContext,
): Promise<CachedAgentCardSummary[]> {
  const remote = await deps.listAgentCards();
  let local: CachedAgentCardSummary | undefined;
  try {
    local = await deps.getLocalAgentNetworkWorkerCard();
  } catch {
    local = undefined;
  }
  if (!local?.sourceAgentPeerId) return remote;
  const selfId = local.sourceAgentPeerId;
  return [local, ...remote.filter((c) => c.sourceAgentPeerId !== selfId)];
}

export function buildChainOrchestrationContext(host: any): ChainOrchestrationContext {
  return {
    getChainStore: () => host._chainStore,
    getChainSideState: () => host._chainState,
    getTaskStore: () => host._taskStore,
    getProfile: () => host._profile,
    getApprovalQueue: () => host._approvalQueue,
    getAgentNetworkMembershipIndex: () => host._capabilityIndex,
    getAgentNetworkMembershipIndexReady: () => host._capabilityIndexReady,
    getPeerDirectoryStore: () => host._peerDirectoryStore,
    getReachableMesh: () => host._reachableMesh(),
    ensureAgentIdentity: () => host._ensureAgentIdentity(),
    listAgentCards: () => host.listAgentCards(),
    getLocalAgentNetworkWorkerCard: () => host.getLocalAgentNetworkWorkerCard(),
    getLocalManifestCapabilities: () => host._localManifestCapabilities(),
    getToolExecutionContext: () => host.getToolExecutionContext(),
    getBonds: () => host.getBonds(),
    getNodeConfig: () => host.getNodeConfig(),
    updateNodeConfig: (cfg) => host.updateNodeConfig(cfg),
    // Phase 8 / v1.4 — sync accessor for the
    // persisted config. Used by the chain-verify
    // loop to resolve the effective `verifyMode`
    // default (per-node override or per-runtime
    // default). Reads from the in-memory snapshot
    // — no disk I/O.
    getPersistedNodeConfigSync: () => host._configStore?.peek(),
    // v1.16 — per-node verifier model override from the persisted config
    // (the host's Q1 config source).
    ...(host._configStore?.peek()?.verifierProviderHint !== undefined
      ? {
          verifierProviderHint:
            host._configStore.peek()?.verifierProviderHint,
        }
      : {}),
    getEnvoyHarnessAdapter: () => host.getEnvoyHarnessAdapter?.(),
    emit: (event, data) => host.emit(event, data),
    isOpenClawReady: () => Boolean(host.isOpenClawReady?.()),
    askOpenClaw: (prompt) => host.askOpenClaw(prompt),
    isPiReady: () => Boolean(host.isPiReady?.()),
    askPi: (prompt) => host.askPi(prompt),
    getAgentNetworkWorkerEngine: () =>
      coerceAgentNetworkWorkerEngine(host.getAgentNetworkWorkerEngine?.()),
    isExtAgentBridgeReady: () => Boolean(host.isExtAgentBridgeReady?.()),
    askExtAgent: (prompt) => host.askExtAgent(prompt),
    isEnvoyHarnessReady: () => Boolean(host.isEnvoyHarnessReady?.()),
    askEnvoyHarness: (prompt) => host.askEnvoyHarness(prompt),
    probeExtAgent: async () => {
      if (typeof host.probeExtAgent !== "function") {
        return { reachable: Boolean(host.isExtAgentBridgeReady?.()) };
      }
      const reach = await host.probeExtAgent();
      return { reachable: reach?.reachable === true };
    },
    getVaultDir: () =>
      typeof host._vaultDir === "string" && host._vaultDir.length > 0
        ? host._vaultDir
        : undefined,
  };
}

/* ---------- ChainContext factory ---------- */

export function buildChainContext(deps: ChainOrchestrationContext): ChainContext {
  const taskStore = deps.getTaskStore();
  return {
    store: deps.getChainStore(),
    getChainSideState: () => deps.getChainSideState(),
    hasTaskStore: () => Boolean(taskStore),
    listChainReports: (params?: ChainListReportsParams) =>
      taskStore!.listChainReports(params) as never,
    getChainReport: (chainId) => taskStore!.getChainReport(chainId) as never,
    pinChainReport: (chainId, pinned) => taskStore!.pinChainReport(chainId, pinned),
    deleteChainReport: (chainId) => taskStore!.deleteChainReport(chainId),
    getChainGoal: (chainId) => deps.getChainSideState().goals.get(chainId),
    getChainCostEstimate: (chainId) => deps.getChainSideState().costEstimates.get(chainId),
    getChainAwardMode: (chainId) => deps.getChainSideState().awardModes.get(chainId),
    getChainShowCostUi: (chainId) => deps.getChainSideState().showCostUi.get(chainId),
    listObservedChains: () => [...deps.getChainSideState().observedChains.values()],
    snapshotToResult: (snap) => snapshotToResult(snap),
    bidsBySubtask: (state) => bidsBySubtask(state),
    getNodeConfig: () => deps.getNodeConfig(),
    setNodeConfig: (cfg) => deps.updateNodeConfig(cfg),
    listChainRecipes: taskStore
      ? () => taskStore.listChainRecipes() as never
      : undefined,
    saveChainRecipe: taskStore
      ? (record) => taskStore.saveChainRecipe(record as never) as never
      : undefined,
    deleteChainRecipe: taskStore
      ? (id) => taskStore.deleteChainRecipe(id)
      : undefined,
    buildChainOrchestratorDeps: () => buildChainOrchestratorDeps(deps) as never,
    evaluateAwardAndAccept: (chainId, subtaskId, options) =>
      _evaluateAwardAndAccept(deps, chainId, subtaskId, options as never) as never,
    emitChainState: (chainId) => _emitChainState(deps, chainId),
    startChainTracking: (chainId) => _startChainTracking(deps, chainId),
    placeholderMandate: (chainId, chainMandateId) =>
      placeholderMandate(chainId, chainMandateId) as never,
    findAgentNetworkWorkers: (capability) => findAgentNetworkWorkers(deps, capability) as never,
    findAgentNetworkWorkersRanked: (capability, preferredWorkerPeerIds, opts) =>
      findAgentNetworkWorkersRanked(deps, capability, preferredWorkerPeerIds, opts) as never,
    chainDiagnosticsForSubtasks: (subtasks, workersBySubtask, rankedBySubtask) =>
      _chainDiagnosticsForSubtasks(subtasks as never, workersBySubtask as never, rankedBySubtask) as never,
    runChainGoal: (params) => _runChainGoal(deps, params) as never,
    previewSuggestedAssigner: (input) => previewSuggestedAssigner(deps, input) as never,
  };
}

/* ---------- mandate / snapshot helpers ---------- */

function ensureChainMandicate(_mandateId: string): void {
  // Stub: in 40B.10, this will load the mandate from the persistent store.
  return;
}

export function ensureChainMandateLoaded(_deps: ChainOrchestrationContext, mandateId: string): void {
  ensureChainMandicate(mandateId);
}

/**
 * Sign a chain mandate with the owner's Ed25519 private key, following the
 * project's canonical-JSON signing convention (same as `signMandate` in
 * `@envoymesh/identity`). The signature covers every field except `signature`
 * itself.
 *
 * Used in place of the previous `signature: "stub"` literal on locally-built
 * mandates so cross-node verification (`verifyCanonicalPayload`) succeeds.
 * Falls back to the legacy `"stub"` signature only when no owner key is
 * available (e.g. dev fixtures without a profile), preserving backward
 * compatibility with existing unit tests.
 */
export function signChainMandate<T extends Record<string, unknown>>(
  unsignedMandate: T,
  ownerPrivateKeyPem: string | undefined,
): T & { signature: string } {
  const signature = ownerPrivateKeyPem
    ? signCanonicalPayload(unsignedMandate, ownerPrivateKeyPem)
    : "stub";
  return { ...unsignedMandate, signature };
}

export function placeholderMandate(chainId: string, chainMandateId: string) {
  return {
    version: "0.1" as const,
    chainMandateId,
    chainId,
    issuerOwnerId: "envoy:owner:placeholder",
    orchestratorOwnerId: "envoy:owner:placeholder",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public" as const,
    deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    rebalancePolicy: "manual" as const,
    maxAutoRebalances: 2,
    autoRebalanceIncrementUsd: 5,
    signature: "stub",
  };
}

export function snapshotToResult(snap: ReturnType<typeof chainStateSnapshot>): ChainGetStateResult {
  return {
    chainId: snap.chainId,
    chainMandateId: snap.chainMandate.chainMandateId,
    subtaskCount: snap.subtaskCount,
    bidCount: snap.bidCount,
    awardedCount: snap.awardedCount,
    partialCount: snap.partialCount,
    cancelledCount: snap.cancelledCount,
    chainCancelled: snap.chainCancelled,
    published: snap.published,
    budgetSpentUsd: snap.budgetSpentUsd,
    budgetMaxUsd: snap.budgetMaxUsd,
    budgetReservedUsd: snap.budgetReservedUsd,
    budgetSynthesisUsd: snap.budgetSynthesisUsd,
    rebalancePolicy: snap.rebalancePolicy,
    autoRebalanceCount: snap.autoRebalanceCount,
    maxAutoRebalances: snap.maxAutoRebalances,
    autoRebalanceHistory: snap.autoRebalanceHistory,
  };
}

// iterationSnapshotFromState is now imported from chain-iteration-orchestration.ts

export function bidsBySubtask(
  state: ChainState,
  now: Date = new Date(),
): NonNullable<ChainGetStateResult["bidsBySubtask"]> {
  const groups = new Map<string, NonNullable<ChainGetStateResult["bidsBySubtask"]>[number]["bids"]>();
  for (const [key, bid] of state.bids.entries()) {
    if (Date.parse(bid.bidExpiresAt) <= now.getTime()) continue;
    const idx = key.indexOf("::");
    if (idx < 0) continue;
    const subtaskId = key.slice(0, idx);
    const list = groups.get(subtaskId) ?? [];
    list.push({
      bidKey: key,
      workerPeerId: bid.workerPeerId,
      workerOwnerId: bid.workerOwnerId,
      proposedCostUsd: bid.proposedCostUsd,
      proposedEtaAt: bid.proposedEtaAt,
      bidExpiresAt: bid.bidExpiresAt,
      rationale: bid.rationale,
    });
    groups.set(subtaskId, list);
  }
  return [...groups.entries()].map(([subtaskId, bids]) => ({ subtaskId, bids }));
}

export async function evaluateBidsAsync(
  deps: ChainOrchestrationContext,
  state: ChainState,
  params: ChainEvaluateBidsParams,
): Promise<Awaited<ReturnType<typeof evaluateBids>>> {
  const orchDeps = await buildChainOrchestratorDeps(deps);
  return await evaluateBids(orchDeps, state, {
    subtaskId: params.subtaskId,
    policy: params.policy,
    maxRounds: params.maxRounds,
    pickWorkerPeerId: params.pickWorkerPeerId,
  });
}

/* ---------- inbound + capability index ---------- */

export async function handleInboundChainEnvelope(
  deps: ChainOrchestrationContext,
  envelope: EnvoyEnvelope,
): Promise<void> {
  const chainId = extractChainIdFromEnvelope(envelope);
  const runtime = chainId ? deps.getChainStore().getRuntime(chainId) : undefined;
  const inboundState = runtime?.state;
  chainLog("inbound", "dispatch", {
    intent: envelope.intent,
    chainId: chainId ?? "(none)",
    from: shortPeerId(envelope.senderPeerId),
    hasRuntime: Boolean(runtime),
  });
  const inboundDeps = await buildChainInboundDeps(deps);
  const decision = await dispatchChainEnvelope(inboundDeps, envelope, inboundState);
  if (!decision.ok) {
    chainWarn("inbound", `rejected ${envelope.intent}: ${decision.reason}`, {
      chainId: chainId ?? "(none)",
      from: shortPeerId(envelope.senderPeerId),
    });
  } else {
    chainLog("inbound", `ok ${envelope.intent}`, {
      chainId: chainId ?? "(none)",
      from: shortPeerId(envelope.senderPeerId),
    });
  }
}

export async function refreshAgentNetworkMembershipIndex(deps: ChainOrchestrationContext): Promise<void> {
  const ready = deps.getAgentNetworkMembershipIndexReady();
  if (ready) {
    await ready;
  }
  const cards = await listAgentCardsIncludingLocal(deps);
  const index = deps.getAgentNetworkMembershipIndex();
  const seen = new Set<string>();
  let members = 0;
  let nonMembers = 0;
  for (const card of cards) {
    const peerId = card.sourceAgentPeerId;
    if (!peerId) continue;
    // Private by default: only index peers that opted into Agent Network work.
    if (!isAgentNetworkMember(card.membership)) {
      index.removeWorker(peerId);
      nonMembers += 1;
      continue;
    }
    seen.add(peerId);
    members += 1;
    index.indexWorker({
      peerId,
      ownerId: card.ownerId,
      membership: card.membership,
      lastSeenAt: card.cachedAt,
      displayName: card.displayName,
    });
  }
  // Drop stale index rows whose cards no longer opt in (or were removed).
  let staleRemoved = 0;
  for (const worker of index.listWorkers()) {
    if (!seen.has(worker.peerId)) {
      index.removeWorker(worker.peerId);
      staleRemoved += 1;
    }
  }
  anLog("index", "membership index rebuilt", {
    cards: cards.length,
    members,
    nonMembers,
    staleRemoved,
    indexed: index.listWorkers().length,
    sample: index.listWorkers().slice(0, 5).map((w) => ({
      peer: shortId(w.peerId),
      name: w.displayName,
    })),
  });
}

/* ---------- transport + dep builders ---------- */

export async function _chainTransportResolver(
  deps: ChainOrchestrationContext,
): Promise<ChainTransportResolver | null> {
  const mesh = deps.getReachableMesh();
  const profile = deps.getProfile();
  if (!mesh || !profile) return null;
  const agentIdentity = await deps.ensureAgentIdentity();
  const agentPeerToOwner = new Map<string, string>();
  for (const card of await listAgentCardsIncludingLocal(deps)) {
    if (card.sourceAgentPeerId) {
      agentPeerToOwner.set(card.sourceAgentPeerId, card.ownerId);
    }
  }
  return {
    mesh,
    peerDirectoryStore: deps.getPeerDirectoryStore(),
    localDevicePublicKeyPem: profile.device.publicKeyPem,
    localAgentPeerId: agentIdentity?.agentPeerId,
    agentPeerToOwner,
    deliverLocally: async (envelope) => {
      await handleInboundChainEnvelope(deps, envelope);
    },
    resolveDialHints: async (transportPeerId) => {
      try {
        const store = deps.getPeerDirectoryStore();
        const match =
          (await store.getPeerByPeerId?.(transportPeerId)) ??
          (await store.listPeerRecords()).find((r) => r.peerId === transportPeerId);
        return (match?.listenAddrs ?? []).filter((a) => a.trim().length > 0);
      } catch {
        return [];
      }
    },
  };
}

export async function buildChainInboundDeps(deps: ChainOrchestrationContext): Promise<ChainInboundDeps> {
  const orchDeps = await buildChainOrchestratorDeps(deps);
  const workerDeps = await buildChainWorkerDeps(deps);
  const nodeCapabilities = (await deps.getLocalManifestCapabilities()) as ChainInboundDeps["nodeCapabilities"];
  const chainStore = deps.getChainStore();
  const chainSide = deps.getChainSideState();
  return {
    audit: orchDeps.audit,
    nodeCapabilities,
    handleWorkerPropose: async (envelope, payload) => {
      chainSide.workerSubtasks.set(payload.subtask.subtaskId, {
        subtask: payload.subtask,
        orchestratorPeerId: envelope.senderPeerId,
        inputArtifacts: payload.inputArtifacts,
      });
      return handleWorkerPropose(workerDeps, envelope, payload);
    },
    handleWorkerMandate: (envelope, payload) => handleWorkerMandate(workerDeps, envelope, payload),
    handleWorkerAccept: async (envelope, payload) => {
      const result = await handleWorkerAccept(workerDeps, envelope, payload);
      if (result.ok) {
        const cached = chainSide.workerSubtasks.get(payload.award.subtaskId);
        let subtask = cached?.subtask;
        // Prefer accept payload when present — Phase 59 merges parent + job-input
        // file refs on accept; propose cache often has parents only.
        let inputArtifacts =
          payload.inputArtifacts && payload.inputArtifacts.length > 0
            ? payload.inputArtifacts
            : cached?.inputArtifacts;
        if (!subtask && payload.subtask) {
          subtask = payload.subtask;
          chainSide.workerSubtasks.set(payload.award.subtaskId, {
            subtask,
            orchestratorPeerId: envelope.senderPeerId,
            inputArtifacts,
          });
        } else if (subtask && payload.inputArtifacts && payload.inputArtifacts.length > 0) {
          chainSide.workerSubtasks.set(payload.award.subtaskId, {
            subtask,
            orchestratorPeerId: envelope.senderPeerId,
            inputArtifacts: payload.inputArtifacts,
          });
          inputArtifacts = payload.inputArtifacts;
        }
        if (!subtask) {
          for (const rt of chainStore.listActive()) {
            subtask = rt.state.subtasks.get(payload.award.subtaskId);
            if (subtask) break;
          }
        }
        if (subtask) {
          chainLog("worker", "executeAcceptedSubtask start", {
            chainId: subtask.chainId,
            subtaskId: subtask.subtaskId,
            skill: subtask.requiredSkill,
            orch: shortPeerId(envelope.senderPeerId),
            inputArtifacts: inputArtifacts?.length ?? 0,
          });
          void executeAcceptedSubtask(
            workerDeps,
            { getToolContext: () => deps.getToolExecutionContext() },
            envelope.senderPeerId,
            subtask,
            { inputArtifacts },
          )
            .then((r) => {
              chainLog("worker", "executeAcceptedSubtask done", {
                subtaskId: subtask.subtaskId,
                ok: r.ok,
                reason: r.reason,
              });
            })
            .catch((err) => chainWarn("worker", "execute failed", {
              subtaskId: subtask.subtaskId,
              error: err instanceof Error ? err.message : String(err),
            }));
        } else {
          chainWarn("worker", "award accepted but subtask cache miss", {
            subtaskId: payload.award.subtaskId,
          });
        }
      }
      return result;
    },
    handleWorkerCancel: (envelope, payload) => handleWorkerCancel(workerDeps, envelope, payload),
    handleWorkerHeartbeat: (envelope, payload) => handleWorkerHeartbeat(workerDeps, envelope, payload),
    handleWorkerStatus: (envelope, payload) => handleWorkerStatus(workerDeps, envelope, payload),
    handleOrchestratorBid: async (envelope, payload, state) => {
      const runtime = chainStore.getRuntime(state.chainId);
      if (!runtime) return { ok: false, reason: "handler_denied" as const };
      const result = await handleOrchestratorBid(orchDeps, envelope, payload, runtime.state);
      if (result.ok) {
        _emitChainState(deps, state.chainId);
        _scheduleAutoEvaluate(deps, state.chainId, payload.bid.subtaskId);
      }
      return result;
    },
    handleOrchestratorPartial: async (envelope, payload, state) => {
      const runtime = chainStore.getRuntime(state.chainId);
      if (!runtime) return { ok: false, reason: "handler_denied" as const };
      const result = await handleOrchestratorPartial(orchDeps, envelope, payload, runtime.state);
      if (result.ok) {
        _emitChainState(deps, state.chainId);
        const profile = deps.getProfile();
        if (profile) {
          void tryCompleteChainIfReady(orchDeps, runtime.state, profile, {
            onContinueRound: (s) => _continueIterationRound(deps, s),
            onMaybeExtend: (s) => _maybeExtendIterationRound(deps, s),
          }).then(async (done) => {
            if (done.published) {
              _emitChainState(deps, state.chainId);
              _emitChainIteration(deps, state.chainId, "stopped");
              const row = await deps.getTaskStore()?.getChainReport(state.chainId);
              if (row?.report) _emitChainReport(deps, row.report);
            } else if (done.awaitingOwner) {
              _emitChainState(deps, state.chainId);
              _emitChainIteration(deps, state.chainId, "awaiting_owner");
            } else if (done.continued) {
              _emitChainState(deps, state.chainId);
              _emitChainIteration(deps, state.chainId, "continued");
            } else if (done.extended) {
              _emitChainState(deps, state.chainId);
              _emitChainIteration(deps, state.chainId, "extend");
            }
          });
        }
      }
      return result;
    },
    handleOrchestratorMerge: (envelope, payload, state) => {
      const runtime = chainStore.getRuntime(state.chainId);
      if (!runtime) return Promise.resolve({ ok: false, reason: "handler_denied" as const });
      return handleOrchestratorMerge(orchDeps, envelope, payload, runtime.state);
    },
    handleOrchestratorHeartbeat: (envelope, payload, state) => {
      const runtime = chainStore.getRuntime(state.chainId);
      if (!runtime) return Promise.resolve({ ok: false, reason: "handler_denied" as const });
      return handleOrchestratorHeartbeat(orchDeps, envelope, payload, runtime.state);
    },
    handleOwnerReport: async (envelope, payload) => {
      const taskStore = deps.getTaskStore();
      if (!taskStore) {
        return { ok: false, reason: "handler_denied" as const };
      }
      await taskStore.recordChainReport(payload.report);
      _emitChainReport(deps, payload.report);
      // Worker may miss the final task.chain.status (completed). Treat an
      // inbound report as terminal so Team jobs UI leaves "Running".
      const observed = deps.getChainSideState().observedChains.get(payload.report.chainId);
      if (observed && observed.phase !== "completed" && observed.phase !== "cancelled") {
        const snap = {
          ...observed,
          phase: "completed" as const,
          updatedAt: payload.report.createdAt ?? new Date().toISOString(),
        };
        deps.getChainSideState().observedChains.set(payload.report.chainId, snap);
        deps.emit("chain:observed", snap);
      }
      void maybeGcChainInputWorkspace(deps, payload.report.chainId);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "chain.report_received",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId: envelope.correlationId,
          remotePeerId: envelope.senderPeerId,
          direction: "inbound",
          verificationStatus: "verified",
          outcome: "record",
          summary: `chain report received chainId=${payload.report.chainId}`,
          createdAt: envelope.createdAt,
        }),
      );
      return { ok: true };
    },

    // Phase 40E — Cross-orchestrator handoff / arbitration inbound handlers.
    // These make the 4 previously-unroutable intents reachable on the wire.
    // Full sub-chain execution orchestration (spawning the delegated sub-chain
    // locally, wiring the arbitration store into award decisions) is a deeper
    // follow-up; these handlers establish the audit + ownership-record path so
    // peers observe `chain.handoff.*` / `chain.arbitration.*` events instead
    // of silent `unknown_chain_intent` denials.
    handleHandoffRequest: async (envelope, payload) => {
      await orchDeps.audit.record({
        type: "chain.handoff.request_received",
        outcome: "record",
        intent: envelope.intent,
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId,
        summary: `chainId=${payload.chainId} newOrchestrator=${payload.newOrchestratorPeerId} subtasks=${payload.subtaskIds.length}${payload.goal ? " goal=yes" : ""}${payload.iterationMaxRounds ? ` iterationMaxRounds=${payload.iterationMaxRounds}` : ""}`,
      });
      // Whole-job Assigner handoff: we become Assigner and run plan+assign+merge.
      const goal = typeof payload.goal === "string" ? payload.goal.trim() : "";
      if (goal) {
        // Phase 47D — remember trigger so iteration progress events carry observerPeerId.
        deps.getChainSideState().iterationObservers.set(payload.chainId, envelope.senderPeerId);
        void _runChainGoal(deps, {
          goal,
          chainId: payload.chainId,
          maxChainCostUsd: payload.maxChainCostUsd,
          costCeilingUsd: payload.costCeilingUsd,
          allowLlm: payload.allowLlm,
          iterationMaxRounds: payload.iterationMaxRounds,
          iterationJudgeMode: payload.iterationJudgeMode,
          extendMaxStepsPerRound: payload.extendMaxStepsPerRound,
          iterationWire: payload.iterationState,
          preferredWorkerPeerIds: payload.preferredWorkerPeerIds,
          criticality: payload.criticality,
        }).then((result) => {
          void orchDeps.audit.record({
            type: result.ok ? "chain.launched" : "chain.mandate_broadcast",
            outcome: result.ok ? "allow" : "deny",
            intent: "task.chain.handoff",
            remotePeerId: envelope.senderPeerId,
            correlationId: payload.chainId,
            summary: result.ok
              ? `assigner_accepted chainId=${result.chainId} subtasks=${result.subtasks.length}`
              : `assigner_run_failed chainId=${payload.chainId} error=${result.error ?? "unknown"}`,
          });
          if (result.ok) {
            _emitChainIteration(deps, result.chainId, "round_started", {
              summary: "assigner_handoff_accepted",
            });
          }
        });
      }
      return { ok: true };
    },
    handleDelegate: async (envelope, payload) => {
      await orchDeps.audit.record({
        type: "chain.handoff.delegate_received",
        outcome: "record",
        intent: envelope.intent,
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId,
        summary: `chainId=${payload.chainId} subChainId=${payload.subChainId} subtasks=${payload.subtaskIds.length} cost=${payload.estimatedCostUsd}`,
      });
      return { ok: true };
    },
    handleRelay: async (envelope, payload) => {
      await orchDeps.audit.record({
        type: "chain.relay.received",
        outcome: "record",
        intent: envelope.intent,
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId,
        summary: `chainId=${payload.chainId} innerIntent=${payload.innerIntent} recipient=${payload.recipientPeerId} hops=${payload.viaRelays.length}`,
      });
      return { ok: true };
    },
    handleArbitration: async (envelope, payload) => {
      // Record the arbitration entry in the local ownership ledger so future
      // award decisions can consult it. `applyArbitration` is idempotent.
      const store = getChainArbitrationStore(payload.entry.chainId);
      applyArbitration(store, payload.entry);
      await orchDeps.audit.record({
        type: "chain.arbitration.converged",
        outcome: "record",
        intent: envelope.intent,
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId,
        summary: `chainId=${payload.entry.chainId} owner=${payload.entry.currentOwnerPeerId} seq=${payload.entry.seq} status=${payload.entry.status}`,
      });
      return { ok: true };
    },
  };
}

export async function buildChainWorkerDeps(deps: ChainOrchestrationContext): Promise<ChainWorkerHandlerDeps> {
  const agentIdentity = await deps.ensureAgentIdentity();
  const profile = deps.getProfile();
  if (!agentIdentity || !profile) {
    throw new Error("agent identity unavailable for chain worker deps");
  }
  const baseStrategy = {
    baseCostUsd: 1,
    capabilityLocalEtaMs: 60_000,
    reputationDiscount: 1,
    etaSlackMs: 60_000,
  };
  const transport = await _chainTransportResolver(deps);
  return {
    sendEnvelope: async (recipientPeerId, envelope, _payload) => {
      if (!transport) return false;
      return sendChainEnvelopeOverMesh(transport, recipientPeerId, envelope);
    },
    now: () => new Date(),
    signingKeyPem: agentIdentity.agentPrivateKeyPem,
    publicKeyPem: agentIdentity.agentPublicKeyPem,
    workerPeerId: agentIdentity.agentPeerId,
    workerOwnerId: profile.owner.ownerId,
    agentCredential: agentIdentity.agentCredential,
    audit: {
      record: (event) => {
        void _appendChainAudit(deps, {
          ...event,
          type: event.type as AuditEventType,
        });
      },
    },
    workerContext: {
      workerPeerId: agentIdentity.agentPeerId,
      workerOwnerId: profile.owner.ownerId,
      baseCostUsd: baseStrategy.baseCostUsd,
      capabilityLocalEtaMs: baseStrategy.capabilityLocalEtaMs,
    },
    pendingBidExpirations: deps.getChainSideState().pendingBidExpirations,
    // Node-owner AN engine (docs/agent-network-engine.md) — not chosen by Assigner.
    isAgentNetworkEngineReady: () => {
      const engine = deps.getAgentNetworkWorkerEngine();
      if (engine === "ext") return deps.isExtAgentBridgeReady();
      if (engine === "envoy-harness") return deps.isEnvoyHarnessReady();
      return deps.isOpenClawReady();
    },
    agentNetworkEngineDenyReason: () => {
      const engine = deps.getAgentNetworkWorkerEngine();
      if (engine === "ext") return "ext_agent_unavailable";
      if (engine === "envoy-harness") return "envoy_harness_unavailable";
      return "openclaw_unavailable";
    },
    recordAttemptReceipt: (input) => {
      deps.getChainSideState().attemptReceipts.upsert({
        chainId: input.chainId,
        attemptId: input.attemptId,
        subtaskId: input.subtaskId,
        state: input.state,
        lastPartialSeq: input.lastPartialSeq,
        finalPartial: input.finalPartial,
        mandateExpiresAt: input.mandateExpiresAt,
      });
    },
    attemptIdBySubtask: (() => {
      const side = deps.getChainSideState() as {
        attemptIdBySubtask?: Map<string, string>;
      };
      if (!side.attemptIdBySubtask) side.attemptIdBySubtask = new Map();
      return side.attemptIdBySubtask;
    })(),
    executeSubtask: async (subtask, onPartial, opts) => {
      const engine = deps.getAgentNetworkWorkerEngine();
      // Envoy Harness dispatch uses the live adapter built from the host's
      // configured model. Resolve it lazily after the readiness gate.
      if (engine === "envoy-harness") {
        return createEnvoyHarnessChainSubtaskExecutor({
          workerPeerId: agentIdentity.agentPeerId,
          isEnvoyHarnessReady: () => deps.isEnvoyHarnessReady(),
          // D1 — the live runtime's adapter (built on first ask; the
          // executor resolves it lazily after the readiness gate).
          adapter: () => deps.getEnvoyHarnessAdapter?.(),
        })(subtask, onPartial, opts);
      }
      const legacyExec =
        engine === "ext"
          ? createExtAgentChainSubtaskExecutor({
              workerPeerId: agentIdentity.agentPeerId,
              isExtAgentReady: () => deps.isExtAgentBridgeReady(),
              askExtAgent: (prompt) => deps.askExtAgent(prompt),
            })
          : createOpenClawChainSubtaskExecutor({
              workerPeerId: agentIdentity.agentPeerId,
              isOpenClawReady: () => deps.isOpenClawReady(),
              askOpenClaw: (prompt) => deps.askOpenClaw(prompt),
            });
      // The MAP adapter path only covers the OpenClaw engine today.
      if (engine !== "openclaw") {
        return legacyExec(subtask, onPartial, opts);
      }
      const mapMode = await resolveMapWorkerMode(deps);
      if (mapMode === "shadow") {
        // Sprint 1 shadow: legacy delivers the result, the adapter path runs
        // silently in parallel and audits the diff as `chain.map_shadow`.
        return runOpenClawMapShadow({
          deps,
          agentIdentity,
          legacyExec,
          subtask,
          onPartial,
          opts,
        });
      }
      if (mapMode === "primary") {
        // Sprint 2 primary: the adapter path is authoritative.
        return runOpenClawMapPrimary({ deps, agentIdentity, subtask, onPartial, opts });
      }
      return legacyExec(subtask, onPartial, opts);
    },
    onObservedStatus: (orchestratorPeerId, payload) => {
      const snap: ObservedChainSnapshot = {
        chainId: payload.chainId,
        goal: payload.goal,
        phase: payload.phase,
        awardMode: payload.awardMode,
        subtaskCount: payload.subtaskCount,
        awardedCount: payload.awardedCount,
        partialCount: payload.partialCount,
        finalPartialCount: payload.finalPartialCount,
        bidCount: payload.bidCount,
        steps: payload.steps.map((s) => ({
          subtaskId: s.subtaskId,
          objective: s.objective,
          state: s.state,
          workerPeerId: s.workerPeerId,
        })),
        orchestratorPeerId,
        updatedAt: payload.createdAt,
        readOnly: true,
      };
      deps.getChainSideState().observedChains.set(payload.chainId, snap);
      deps.emit("chain:observed", snap);
      if (payload.phase === "completed" || payload.phase === "cancelled") {
        void maybeGcChainInputWorkspace(deps, payload.chainId);
      }
    },
    onWholeChainCancelled: (chainId) => {
      void maybeGcChainInputWorkspace(deps, chainId);
    },
  };
}

/**
 * Sprint 1 MAP shadow-mode gate. Off by default; enable with
 * `ENVOYMESH_MAP_SHADOW=1`. While active, every OpenClaw subtask also runs
 * through the MAP adapter path (silently) and the diff is audited.
 */
export function isMapShadowEnabled(): boolean {
  return process.env.ENVOYMESH_MAP_SHADOW === "1";
}

export type MapWorkerMode = "off" | "shadow" | "primary";

/**
 * Resolve which worker-execution path to use for OpenClaw subtasks.
 *
 * Precedence (highest first):
 * 1. `ENVOYMESH_MAP_ROLLBACK=1` → `"off"` — live rollback, no restart needed.
 * 2. `ENVOYMESH_MAP_SHADOW=1` → `"shadow"` — Sprint 1 comparison mode.
 * 3. `settings.json` `useMAP === true` → `"primary"` — adapter path is
 *    authoritative (Sprint 2 opt-in).
 * 4. otherwise → `"off"`.
 */
export async function resolveMapWorkerMode(
  deps: ChainOrchestrationContext,
): Promise<MapWorkerMode> {
  if (process.env.ENVOYMESH_MAP_ROLLBACK === "1") return "off";
  if (isMapShadowEnabled()) return "shadow";
  try {
    const cfg = (await deps.getNodeConfig()) as { useMAP?: unknown } | null;
    return cfg?.useMAP === true ? "primary" : "off";
  } catch {
    return "off";
  }
}

/**
 * Sprint 2 primary path: run the subtask through the adapter-backed MAP
 * executor (which emits the same `task.chain.partial` stream). This is
 * authoritative — the legacy `{ isReady, ask }` engine is not consulted.
 * The `useMAP` setting (or its absence) is the rollback mechanism.
 */
export async function runOpenClawMapPrimary(input: {
  deps: ChainOrchestrationContext;
  agentIdentity: BridgeIdentity;
  subtask: import("@envoymesh/protocol").ChainSubtask;
  onPartial: (partial: import("@envoymesh/protocol").TaskChainPartialPayload) => Promise<void>;
  opts?: { inputArtifacts?: import("@envoymesh/protocol").NamedArtifact[] };
}): Promise<{ ok: boolean; finalNote?: string }> {
  const { deps, agentIdentity, subtask, onPartial, opts } = input;
  const adapter = new OpenClawAdapter({
    askViaRuntime: (prompt) => deps.askOpenClaw(prompt),
    isReady: () => deps.isOpenClawReady(),
    workerPeerId: agentIdentity.agentPeerId,
    // Preserve the legacy prompt surface (constraints / role / thread /
    // brief-report policy) that the adapter's default prompt would drop.
    buildPrompt: buildSubtaskPromptForAdapter(subtask),
    signResult: (unsigned) => ({
      ...unsigned,
      signature: signCanonicalPayload(unsigned, agentIdentity.agentPrivateKeyPem),
    }),
  });
  const mapExec = createMapChainSubtaskExecutor({
    workerPeerId: agentIdentity.agentPeerId,
    engineLabel: "OpenClaw (MAP)",
    unavailableCode: "openclaw_unavailable",
    isReady: () => deps.isOpenClawReady(),
    adapter,
    onShadowRecord: (rec) => {
      void _appendChainAudit(deps, {
        type: "chain.map_shadow",
        outcome: "record",
        intent: "task.chain.partial",
        correlationId: `${subtask.chainId}:${subtask.subtaskId}`,
        summary:
          `chainId=${subtask.chainId} subtaskId=${subtask.subtaskId} ` +
          `mode=primary ok=${rec.ok} overall=${rec.overall ?? "none"}`,
      });
    },
  });
  const result = await mapExec(subtask, onPartial, opts);
  chainLog("map.primary", `subtask=${subtask.subtaskId} ok=${result.ok}`, {
    chainId: subtask.chainId,
    finalNote: result.finalNote?.slice(0, 80),
  });
  return result;
}

/**
 * Run the legacy OpenClaw executor (delivers the real result) AND the MAP
 * adapter executor (silent shadow run), then compare. The shadow run uses a
 * no-op partial sink so the orchestrator's `task.chain.partial` stream is
 * unchanged; only audit events (`chain.map_shadow`) and chain logs carry the
 * comparison.
 */
export async function runOpenClawMapShadow(input: {
  deps: ChainOrchestrationContext;
  agentIdentity: BridgeIdentity;
  legacyExec: NonNullable<ChainWorkerHandlerDeps["executeSubtask"]>;
  subtask: import("@envoymesh/protocol").ChainSubtask;
  onPartial: (partial: import("@envoymesh/protocol").TaskChainPartialPayload) => Promise<void>;
  opts?: { inputArtifacts?: import("@envoymesh/protocol").NamedArtifact[] };
}): Promise<{ ok: boolean; finalNote?: string }> {
  const { deps, agentIdentity, legacyExec, subtask, onPartial, opts } = input;
  const adapter = new OpenClawAdapter({
    askViaRuntime: (prompt) => deps.askOpenClaw(prompt),
    isReady: () => deps.isOpenClawReady(),
    workerPeerId: agentIdentity.agentPeerId,
    // Shadow runs must see the same prompt surface as legacy so the diff is
    // apples-to-apples (constraints / role / thread / brief-report policy).
    buildPrompt: buildSubtaskPromptForAdapter(subtask),
    signResult: (unsigned) => ({
      ...unsigned,
      signature: signCanonicalPayload(unsigned, agentIdentity.agentPrivateKeyPem),
    }),
  });
  const mapExec = createMapChainSubtaskExecutor({
    workerPeerId: agentIdentity.agentPeerId,
    engineLabel: "OpenClaw (MAP shadow)",
    unavailableCode: "openclaw_unavailable",
    isReady: () => deps.isOpenClawReady(),
    adapter,
    onShadowRecord: (rec) => {
      void _appendChainAudit(deps, {
        type: "chain.map_shadow",
        outcome: "record",
        intent: "task.chain.partial",
        correlationId: `${subtask.chainId}:${subtask.subtaskId}`,
        summary:
          `chainId=${subtask.chainId} subtaskId=${subtask.subtaskId} ` +
          `ok=${rec.ok} overall=${rec.overall ?? "none"} verdicts=${rec.verdicts.length}`,
      });
    },
  });

  // Shadow run first (silent — no partials leak to the orchestrator).
  const shadow = await mapExec(subtask, async () => undefined, opts);
  // Deliver the real result via the legacy path (behavior unchanged).
  const delivered = await legacyExec(subtask, onPartial, opts);

  chainLog("map.shadow", `subtask=${subtask.subtaskId} legacy=${delivered.ok ? "ok" : "fail"} map=${shadow.ok ? "ok" : "fail"}`, {
    chainId: subtask.chainId,
    legacyNote: delivered.finalNote?.slice(0, 80),
    mapNote: shadow.finalNote?.slice(0, 80),
  });
  return delivered;
}

async function buildLlmDecomposerAsync(
  deps: ChainOrchestrationContext,
): Promise<ChainOrchestratorHandlerDeps["llmDecompose"] | undefined> {
  let nodeConfig: Awaited<ReturnType<ChainOrchestrationContext["getNodeConfig"]>> | null = null;
  try {
    nodeConfig = await deps.getNodeConfig();
  } catch {
    return undefined;
  }
  if (!nodeConfig) return undefined;
  const modelCfg = (nodeConfig as { modelProviders?: { mode?: string } }).modelProviders;
  if (!modelCfg || modelCfg.mode === "disabled") return undefined;
  let providers: ReturnType<typeof buildModelProviders> = [];
  try {
    providers = buildModelProviders(modelCfg as never, false, { trustedLocalAssist: true });
  } catch {
    return undefined;
  }
  if (providers.length === 0) return undefined;
  const { createLlmDecomposer } = await import("./chain-decomposer.js");
  const { mergeChainDefaults, resolveAssignmentModeDefault } = await import("./chain-defaults.js");
  const decomposer = createLlmDecomposer({
    providers,
    audit: { record: () => undefined },
    // Match Social `chainPreviewGoal` / `chainPlan` RPC budget (120s).
    timeoutMs: 120_000,
    getAssignmentMode: async () => {
      // Fallback only — planChain passes call-time mode into llmDecompose.
      try {
        const cfg = await deps.getNodeConfig();
        return resolveAssignmentModeDefault(
          mergeChainDefaults((cfg as { chainDefaults?: import("@envoymesh/api").ChainDefaultsConfig }).chainDefaults),
        );
      } catch {
        return "skill";
      }
    },
    getRoster: async () => {
      const ranked = await findAgentNetworkWorkersRanked(deps, "task.execute");
      const cards = await listAgentCardsIncludingLocal(deps);
      const byPeer = new Map(
        cards.filter((c) => c.sourceAgentPeerId).map((c) => [c.sourceAgentPeerId!, c] as const),
      );
      let selfPeerId: string | undefined;
      try {
        const agent = await deps.ensureAgentIdentity();
        selfPeerId = agent?.agentPeerId;
      } catch {
        /* ignore */
      }
      return ranked.map((r) => {
        const card = byPeer.get(r.peerId);
        const isSelf = selfPeerId !== undefined && r.peerId === selfPeerId;
        return {
          peerId: r.peerId,
          displayName: card?.displayName,
          ownerId: card?.ownerId,
          membership: card?.membership ?? [],
          profile: card?.agentNetworkProfile,
          isSelf,
          sameLan: r.sameLan === true || isSelf,
          scoreSummary: r.summary,
          reputationBySkill: deriveRosterReputation(r.peerId),
        };
      });
    },
  });
  return async (goal: string) => decomposer(goal);
}

async function buildLlmMergeAsync(
  deps: ChainOrchestrationContext,
): Promise<ChainOrchestratorHandlerDeps["llmMerge"] | undefined> {
  const { createLlmMergeAdapter } = await import("./chain-llm.js");

  let providers: ReturnType<typeof buildModelProviders> = [];
  try {
    const nodeConfig = await deps.getNodeConfig();
    const modelCfg = (nodeConfig as { modelProviders?: { mode?: string } } | null)?.modelProviders;
    if (modelCfg && modelCfg.mode !== "disabled") {
      providers = buildModelProviders(modelCfg as never, false, { trustedLocalAssist: true });
    }
  } catch {
    providers = [];
  }

  const llmProvider = {
    complete: async (params: { systemPrompt: string; userPrompt: string; maxTokens?: number }) => {
      if (providers.length > 0) {
        const result = await routeModelRequest(
          {
            taskType: "chain.merge",
            prompt: `${params.systemPrompt}\n\n${params.userPrompt}`,
            sensitivity: "public",
            ownerApproved: true,
          },
          providers,
        );
        if (result.decision.action !== "deny" && result.response) {
          return {
            text: result.response.text,
            usage: {
              promptTokens: result.response.usage?.inputTokens ?? 0,
              completionTokens: result.response.usage?.outputTokens ?? 0,
            },
          };
        }
      }
      // Fallback: Built-in OpenClaw (common when Assigner uses AN OpenClaw).
      if (deps.isOpenClawReady()) {
        const text = await deps.askOpenClaw(
          `${params.systemPrompt}\n\n${params.userPrompt}`,
        );
        if (text?.trim()) {
          return {
            text,
            usage: { promptTokens: 0, completionTokens: 0 },
          };
        }
      }
      throw new Error("LLM merge unavailable");
    },
  };

  // Always wire the adapter: providers / OpenClaw may become ready mid-session.
  // synthesizeChain falls back to concatenate when complete() fails.
  return createLlmMergeAdapter(llmProvider);
}

export async function buildChainOrchestratorDeps(
  deps: ChainOrchestrationContext,
): Promise<ChainOrchestratorHandlerDeps> {
  const llmDecompose = await buildLlmDecomposerAsync(deps);
  const agentIdentity = await deps.ensureAgentIdentity();
  const profile = deps.getProfile();
  if (!agentIdentity || !profile) {
    throw new Error("agent identity unavailable for chain orchestrator deps");
  }
  const transport = await _chainTransportResolver(deps);
  return {
    sendEnvelope: async (recipientPeerId, envelope, _payload) => {
      if (!transport) return false;
      return sendChainEnvelopeOverMesh(transport, recipientPeerId, envelope);
    },
    findWorkers: async (capability) => findAgentNetworkWorkers(deps, capability),
    findWorkersWithManifests: async (capability) =>
      (await findAgentNetworkWorkersRanked(deps, capability)).map((w) => ({
        peerId: w.peerId,
        manifest: w.manifest,
      })),
    now: () => new Date(),
    signingKeyPem: agentIdentity.agentPrivateKeyPem,
    publicKeyPem: agentIdentity.agentPublicKeyPem,
    orchestratorPeerId: agentIdentity.agentPeerId,
    orchestratorOwnerId: profile.owner.ownerId,
    agentCredential: agentIdentity.agentCredential,
    probeWorkerEngineReady: async (workerPeerId) => {
      // Phase 60B — a fresh signed lease is sufficient; skip the legacy probe.
      const leaseAvail = deps.getChainSideState().workerLeases.getAvailability(workerPeerId);
      if (leaseAvail.state === "ready" && leaseAvail.source === "lease") {
        return { ready: true, reason: "lease_ready" };
      }
      if (
        leaseAvail.state === "expired" ||
        leaseAvail.state === "revoked" ||
        leaseAvail.state === "busy" ||
        leaseAvail.state === "engine_down"
      ) {
        return { ready: false, reason: `lease_${leaseAvail.state}` };
      }
      if (!transport) return { ready: false, reason: "no_transport" };
      return probeChainWorkerReady({
        transport,
        workerPeerId,
        orchestratorPeerId: agentIdentity.agentPeerId,
        orchestratorPublicKeyPem: agentIdentity.agentPublicKeyPem,
        orchestratorPrivateKeyPem: agentIdentity.agentPrivateKeyPem,
        agentCredential: agentIdentity.agentCredential,
        cache: deps.getChainSideState().readyProbeCache,
        localReady: () =>
          localAgentNetworkEngineReady({
            engine: deps.getAgentNetworkWorkerEngine(),
            isOpenClawReady: () => deps.isOpenClawReady(),
            isExtAgentBridgeReady: () => deps.isExtAgentBridgeReady(),
            // Self-probe: Ext AN engine → hello Ext Agent; OpenClaw → gateway only.
            probeExtAgent:
              deps.getAgentNetworkWorkerEngine() === "ext"
                ? () => deps.probeExtAgent()
                : undefined,
          }),
      });
    },
    audit: {
      record: (event) => {
        void _appendChainAudit(deps, {
          ...event,
          type: event.type as AuditEventType,
        });
      },
    },
    storeChainReport: async (report) => {
      const taskStore = deps.getTaskStore();
      if (taskStore) {
        await taskStore.recordChainReport(report);
      }
      _emitChainReport(deps, report);
    },
    llmDecompose,
    llmMerge: await buildLlmMergeAsync(deps),
    onAwardAccepted: async (state, subtaskId, workerPeerId) => {
      const vaultDir = deps.getVaultDir();
      const mesh = deps.getReachableMesh();
      const taskStore = deps.getTaskStore();
      if (!vaultDir) return;
      const isSelf = workerPeerId === agentIdentity.agentPeerId;
      // Local You only needs vault copy; remote push needs mesh + task store.
      if (!isSelf && (!mesh || !taskStore || !profile)) return;
      const transportPeerId =
        !isSelf && transport
          ? await resolveChainTransportPeerId(transport, workerPeerId)
          : null;
      await deliverChainInputsOnAward({
        state,
        subtaskId,
        workerPeerId,
        orchestratorPeerId: agentIdentity.agentPeerId,
        transportPeerId: transportPeerId ?? undefined,
        copyLocal: async ({ sourceRelativePath, deliveredRelativePath }) =>
          copyChainInputInVault({ vaultDir, sourceRelativePath, deliveredRelativePath }),
        pushFile:
          mesh && taskStore && profile
            ? async ({
                sourceRelativePath,
                voucherRelativePath,
                toPeerId,
                chainId,
                expiresAt,
              }) => {
                const dialHints = transport?.resolveDialHints
                  ? await transport.resolveDialHints(toPeerId)
                  : [];
                return sendVaultFileViaDataTransfer({
                  mesh,
                  profile,
                  taskStore,
                  vaultDir,
                  relativePath: sourceRelativePath,
                  voucherRelativePath,
                  expiresAt,
                  toPeerId,
                  dialHints,
                  rebuildDialHints: transport?.resolveDialHints
                    ? () => transport.resolveDialHints!(toPeerId)
                    : undefined,
                  transferHooks: {
                    correlationId: chainId,
                    onUpdate: () => {
                      /* TransferTracker optional for 59B; state.inputDeliveries is source of truth */
                    },
                  },
                });
              }
            : undefined,
        onUpdate: () => _emitChainState(deps, state.chainId),
      });
    },
    // Phase 41 / MAP — orchestrator-side verification loop (design §8.3).
    // Additive: when no adapter matches the worker's runtime (or a runtime
    // is not ready), the loop records nothing and never changes the
    // deliverable flow. Escalation to a second runtime requires a distinct
    // runtime in `listRuntimes` (today: OpenClaw + local Pi, so either can
    // cross-check the other).
    chainVerify: {
      audit: {
        record: (event) => {
          void _appendChainAudit(deps, {
            ...event,
            type: event.type as AuditEventType,
          });
        },
      },
      orchestratorPeerId: agentIdentity.agentPeerId,
      signingKeyPem: agentIdentity.agentPrivateKeyPem,
      // Phase 8 / v1.4 — sync accessor for the
      // persisted config. The loop uses this
      // (via `readEffectiveVerifyModeDefault`)
      // to resolve the per-node
      // `verifyModeDefault` override. When
      // unset, the loop falls back to
      // `defaultVerifyModeForWorker(workerRuntime)`
      // (Q3 of the v1.4 sub-plan).
      getNodeConfig: () => deps.getPersistedNodeConfigSync?.(),
      // v1.16 — cross-model-on-same-runtime hint (optional; absent
      // keeps the v1.8 cross-runtime behavior).
      ...(deps.verifierProviderHint !== undefined
        ? { verifierProviderHint: deps.verifierProviderHint }
        : {}),
      getLatestVerdictForSubtask: (chainId, subtaskId) =>
        getLatestVerdictForSubtask(getChainArbitrationStore(chainId), subtaskId)?.verdict,
      getVerdictForWorker: (chainId, subtaskId, workerPeerId) => {
        const entries = getVerdictsFor(getChainArbitrationStore(chainId), { workerPeerId }).filter(
          (entry) => entry.subtaskId === subtaskId,
        );
        return entries.at(-1)?.verdict;
      },
      writeVerdictEntry: (chainId, entry) => {
        const store = getChainArbitrationStore(chainId);
        chainArbitrationStores.set(chainId, recordVerdictEntry(store, entry));
        // Phase 60C — local calibrated reliability observation.
        try {
          const quality =
            entry.verdict.kind === "pass" ||
            entry.verdict.kind === "partial" ||
            entry.verdict.kind === "fail" ||
            entry.verdict.kind === "disputed"
              ? entry.verdict.kind
              : "censored";
          if (quality !== "censored") {
            const score =
              (entry.verdict.kind === "pass" || entry.verdict.kind === "partial") &&
              typeof entry.verdict.score === "number"
                ? entry.verdict.score
                : undefined;
            const lease = deps.getChainSideState().workerLeases.getLease(entry.workerPeerId);
            const connectivityClass =
              lease?.connectivity?.relay && !lease.connectivity.direct
                ? ("relay" as const)
                : lease?.connectivity?.direct
                  ? ("wan_direct" as const)
                  : ("wan_direct" as const);
            deps.getChainSideState().workerReliability.record({
              workerPeerId: entry.workerPeerId,
              runtime: entry.workerRuntime,
              // Record worker model family (not the verifier's model).
              modelFamily: modelFamilyFor(entry.workerRuntime),
              skillId: entry.skillId,
              connectivityClass,
              quality,
              ...(score !== undefined ? { score } : {}),
              at: entry.issuedAt,
            });
          }
        } catch {
          /* reliability is best-effort */
        }
      },
      resolveWorkerRuntime: (workerPeerId) =>
        deps.getChainSideState().remoteManifests.get(workerPeerId)?.runtime,
      listRuntimes: () => {
        const runtimes: AgentRuntime[] = [];
        if (deps.isOpenClawReady()) runtimes.push("openclaw");
        if (deps.isPiReady()) runtimes.push("pi");
        // v1.16 — cross-model-on-same-runtime: when the node's own
        // envoy-harness runtime is ready, it joins the verify pool so a
        // worker on envoy-harness can be cross-verified by envoy-harness
        // with a different model.
        if (deps.isEnvoyHarnessReady()) runtimes.push("envoy-harness");
        return runtimes;
      },
      buildAdapter: (runtime, subtask) => {
        if (runtime === "envoy-harness") {
          if (!deps.isEnvoyHarnessReady()) return undefined;
          // The live runtime's adapter (per-call `verifierModel` override
          // honored by the runtime's buildAgent wrapper).
          return deps.getEnvoyHarnessAdapter?.();
        }
        if (runtime === "openclaw") {
          if (!deps.isOpenClawReady()) return undefined;
          return new OpenClawAdapter({
            askViaRuntime: (prompt) => deps.askOpenClaw(prompt),
            isReady: () => deps.isOpenClawReady(),
            workerPeerId: agentIdentity.agentPeerId,
            // Same prompt surface the worker used (constraints / role / thread /
            // brief-report policy) so the cross run answers the same mandate.
            buildPrompt: buildSubtaskPromptForAdapter(subtask),
            signResult: (unsigned) => ({
              ...unsigned,
              signature: signCanonicalPayload(unsigned, agentIdentity.agentPrivateKeyPem),
            }),
          });
        }
        if (runtime === "pi") {
          if (!deps.isPiReady()) return undefined;
          const piHost: PiMapHost = {
            prompt: (prompt) => deps.askPi(prompt),
            isReady: () => deps.isPiReady(),
            workerPeerId: agentIdentity.agentPeerId,
            // Same prompt surface the worker used so the cross run answers the
            // same mandate (constraints / role / thread / brief-report policy).
            buildPrompt: buildSubtaskPromptForAdapter(subtask),
            signResult: (unsigned) => ({
              ...unsigned,
              signature: signCanonicalPayload(unsigned, agentIdentity.agentPrivateKeyPem),
            }),
          };
          return createPiAdapterFromHost(piHost);
        }
        return undefined;
      },
    },
    isRecovering: (chainId) =>
      isChainRecovering(deps.getChainSideState().recovery?.get(chainId)),
    markRecoveryFinalPending: (chainId, subtaskId) => {
      deps.getChainSideState().recoveryAdvancePending.add(`${chainId}:${subtaskId}`);
    },
  };
}

function recoveryAdvanceKey(chainId: string, subtaskId: string): string {
  return `${chainId}:${subtaskId}`;
}

/** Phase 61C — re-run final processing for partials retained during RECOVERING. */
export async function flushRecoveryAdvancePending(
  ctx: ChainOrchestrationContext,
  chainId: string,
): Promise<void> {
  const side = ctx.getChainSideState();
  if (isChainRecovering(side.recovery.get(chainId))) return;
  const runtime = ctx.getChainStore().getRuntime(chainId);
  if (!runtime || runtime.state.published || runtime.state.chainCancelled) return;

  const pending = [...side.recoveryAdvancePending].filter((k) => k.startsWith(`${chainId}:`));
  if (pending.length === 0) return;

  const orchDeps = await buildChainOrchestratorDeps(ctx);
  let flushed = false;
  for (const key of pending) {
    const subtaskId = key.slice(chainId.length + 1);
    const partial = runtime.state.partials.get(subtaskId);
    if (!partial?.partial.isFinal) {
      side.recoveryAdvancePending.delete(key);
      continue;
    }
    side.recoveryAdvancePending.delete(key);
    const envelope = {
      version: "0.1",
      messageId: `recovery-advance-${subtaskId}`,
      correlationId: chainId,
      createdAt: partial.partial.createdAt,
      senderPeerId: partial.partial.workerPeerId,
      senderPublicKey: "",
      senderRole: "agent",
      recipientRole: "agent",
      intent: "task.chain.partial",
      payload: partial,
      signature: "recovery-advance",
    } as import("@envoymesh/protocol").EnvoyEnvelope;
    await handleOrchestratorPartial(orchDeps, envelope, partial, runtime.state);
    flushed = true;
  }
  if (flushed) {
    const profile = ctx.getProfile();
    if (profile) {
      await tryCompleteChainIfReady(orchDeps, runtime.state, profile, {
        onContinueRound: (s) => _continueIterationRound(ctx, s),
        onMaybeExtend: (s) => _maybeExtendIterationRound(ctx, s),
      });
    }
  }
  _emitChainState(ctx, chainId);
}

/** True when peer directory listen addrs include a direct RFC1918 TCP path. */
export function sameLanFromListenAddrs(listenAddrs: readonly string[] | undefined): boolean {
  if (!listenAddrs?.length) return false;
  return hasDirectPrivateLanDialHints(listenAddrs);
}

/** Resolve same-LAN soft signal per agent peer id (self always true). */
export async function buildSameLanByPeerId(
  deps: ChainOrchestrationContext,
  peerIds: readonly string[],
  cardsByPeer: Map<string, CachedAgentCardSummary | undefined>,
): Promise<Map<string, boolean>> {
  let selfPeerId: string | undefined;
  try {
    selfPeerId = (await deps.ensureAgentIdentity())?.agentPeerId;
  } catch {
    /* ignore */
  }
  let store: ReturnType<ChainOrchestrationContext["getPeerDirectoryStore"]> | undefined;
  try {
    store = deps.getPeerDirectoryStore?.();
  } catch {
    store = undefined;
  }
  const out = new Map<string, boolean>();
  for (const peerId of peerIds) {
    if (selfPeerId && peerId === selfPeerId) {
      out.set(peerId, true);
      continue;
    }
    const ownerId = cardsByPeer.get(peerId)?.ownerId;
    if (!ownerId || !store) {
      out.set(peerId, false);
      continue;
    }
    try {
      const peer = await store.getPeerByOwnerId(ownerId);
      out.set(peerId, sameLanFromListenAddrs(peer?.listenAddrs));
    } catch {
      out.set(peerId, false);
    }
  }
  return out;
}

export async function findAgentNetworkWorkers(deps: ChainOrchestrationContext, capability: string): Promise<string[]> {
  const ranked = await findAgentNetworkWorkersRanked(deps, capability);
  return ranked.map((r) => r.peerId);
}

/**
 * Selection-time engine hello: walk ranked candidates, probe each, keep only
 * workers whose Agent Network engine is ready. Caps probes so a large roster
 * cannot stall launch. Prefer online mesh peers first (same as launch ranking).
 */
export async function selectReadyWorkersForSubtask(
  deps: ChainOrchestrationContext,
  ranked: readonly ChainRankedWorker[],
  preferredWorkerPeerId: string | undefined,
  workerCap: number,
  opts?: {
    maxProbes?: number;
    correlationId?: string;
    /** Test override — production uses buildChainOrchestratorDeps probe. */
    probeWorkerEngineReady?: (
      workerPeerId: string,
    ) => Promise<{ ready: boolean; reason?: string }>;
  },
): Promise<{ chosen: string[]; probed: number; skipped: string[] }> {
  const cap = Math.max(1, workerCap);
  const maxProbes = opts?.maxProbes ?? Math.max(cap + 2, 6);
  const candidates = [
    ...ranked.filter((r) => r.online).map((r) => r.peerId),
    ...ranked.filter((r) => !r.online).map((r) => r.peerId),
  ];
  // Preferred leads even if ranking missed them (sticky assignee).
  const ordered = chooseWorkersForSubtask(preferredWorkerPeerId, candidates, candidates.length);
  const tryOrder =
    ordered.length > 0
      ? ordered
      : ranked.length > 0
        ? [ranked[0]!.peerId]
        : [];

  const probeFn =
    opts?.probeWorkerEngineReady ??
    (await buildChainOrchestratorDeps(deps)).probeWorkerEngineReady;
  const chosen: string[] = [];
  const skipped: string[] = [];
  let probed = 0;
  const leaseStore = deps.getChainSideState().workerLeases;

  for (const peerId of tryOrder) {
    if (chosen.length >= cap) break;
    // Phase 60B — fresh lease is sufficient; skip the legacy ready probe.
    const leaseAvail = leaseStore.getAvailability(peerId);
    if (leaseAvail.state === "ready" && leaseAvail.source === "lease") {
      chosen.push(peerId);
      continue;
    }
    if (probed >= maxProbes) break;
    probed += 1;
    if (!probeFn) {
      chosen.push(peerId);
      continue;
    }
    const probe = await probeFn(peerId);
    if (probe.ready) {
      chosen.push(peerId);
      continue;
    }
    // Soft failures (timeout / old peer / dial) — keep preferred workers in
    // the shortlist; silent-worker reassign covers a truly dead engine later.
    if (!shouldSkipWorkerForEngineProbe(probe)) {
      chosen.push(peerId);
      void _appendChainAudit(deps, {
        type: "chain.launched",
        outcome: "record",
        intent: "task.chain.ready.request",
        correlationId: opts?.correlationId,
        remotePeerId: peerId,
        summary:
          `ready_probe_soft_allow worker=${peerId.slice(0, 14)}` +
          ` reason=${probe.reason ?? "unknown"}` +
          ` availabilitySource=legacy_probe`,
      }).catch(() => {
        /* best-effort audit */
      });
      continue;
    }
    skipped.push(peerId);
    void _appendChainAudit(deps, {
      type: "chain.launched",
      outcome: "deny",
      intent: "task.chain.ready.request",
      correlationId: opts?.correlationId,
      remotePeerId: peerId,
      summary:
        `ready_probe_skip_select worker=${peerId.slice(0, 14)}` +
        ` reason=${probe.reason ?? "not_ready"}`,
    }).catch(() => {
      /* best-effort audit */
    });
  }

  // Sticky preferred leads only when that peer passed the ready probe.
  if (
    preferredWorkerPeerId &&
    chosen.includes(preferredWorkerPeerId) &&
    chosen[0] !== preferredWorkerPeerId
  ) {
    chosen.splice(
      0,
      chosen.length,
      preferredWorkerPeerId,
      ...chosen.filter((id) => id !== preferredWorkerPeerId),
    );
  }

  return { chosen, probed, skipped };
}

/** Ranked workers with human-readable score summaries for diagnostics / UI. */
export async function findAgentNetworkWorkersRanked(
  deps: ChainOrchestrationContext,
  capability: string,
  preferredWorkerPeerIds?: readonly string[],
  opts?: { strategyId?: ChainTeamStrategyId },
): Promise<ChainRankedWorker[]> {
  const ready = deps.getAgentNetworkMembershipIndexReady();
  if (ready) {
    await ready;
  }
  const cards = await listAgentCardsIncludingLocal(deps);
  const byPeer = new Map<string, (typeof cards)[number]>();
  for (const card of cards) {
    if (card.sourceAgentPeerId) byPeer.set(card.sourceAgentPeerId, card);
  }

  let selfPeerId: string | undefined;
  try {
    selfPeerId = (await deps.ensureAgentIdentity())?.agentPeerId;
  } catch {
    /* ignore */
  }

  // Soft pool: all Agent Network workers that can execute.
  // Specialty hints match against agentNetworkProfile.skills at score time —
  // never filter or boost via mesh capability tags (those are membership only).
  const peers = new Set<string>();
  const index = deps.getAgentNetworkMembershipIndex();
  for (const worker of index.listWorkers()) {
    if (isAgentNetworkMember(worker.membership)) peers.add(worker.peerId);
  }
  for (const peerId of index.findWorkers("task.execute")) {
    const worker = index.getWorker(peerId);
    if (worker && isAgentNetworkMember(worker.membership)) peers.add(peerId);
  }

  for (const card of cards) {
    if (!card.sourceAgentPeerId) continue;
    if (!isAgentNetworkMember(card.membership)) continue;
    if (
      card.membership.includes("task.execute") ||
      card.membership.length > 0
    ) {
      peers.add(card.sourceAgentPeerId);
    }
  }

  if (peers.size === 0) return [];
  const peerList = [...peers];
  const sameLanByPeer = await buildSameLanByPeerId(deps, peerList, byPeer);

  // Live mesh connection snapshot — online workers can actually receive a
  // task.execute handoff; offline ones cannot until they reconnect. Used both
  // for the system pick (prefer reachable) and the UI (offline = non-selectable).
  const mesh = deps.getReachableMesh();
  const connStats = mesh?.getConnectionStats();
  const connectedIds = new Set(connStats?.connectedPeerIds ?? mesh?.getConnectedPeerIds() ?? []);
  const circuitIds = new Set(connStats?.circuitPeerIds ?? []);

  // Resolve each agent peer id → owner → libp2p peer id via the peer directory.
  // `connectedIds` holds libp2p PeerIds, but `peerId` in the soft pool is an
  // `envoy_agent_*` identity — comparing them directly always reports offline.
  const transportByAgentPeer = new Map<string, string>();
  try {
    const store = deps.getPeerDirectoryStore?.();
    if (store) {
      const allRecords = await store.listPeerRecords();
      const connectedLibp2pByOwner = new Map<string, string>();
      for (const rec of allRecords) {
        if (isLibp2pPeerId(rec.peerId) && connectedIds.has(rec.peerId)) {
          connectedLibp2pByOwner.set(rec.ownerId, rec.peerId);
        }
      }
      for (const peerId of peerList) {
        const ownerId = byPeer.get(peerId)?.ownerId;
        const transport = ownerId ? connectedLibp2pByOwner.get(ownerId) : undefined;
        if (transport) transportByAgentPeer.set(peerId, transport);
      }
    }
  } catch {
    /* store unavailable — leave all offline */
  }

  // MAP hardening — drop expired wire manifests so the store stays bounded
  // and stale capability claims never influence ranking.
  try {
    pruneExpiredManifests(deps.getChainSideState().remoteManifests);
  } catch {
    /* store unavailable — leave stale entries; per-read freshness still guards */
  }
  try {
    deps.getChainSideState().workerLeases.prune();
  } catch {
    /* store unavailable */
  }

  const strategyId: ChainTeamStrategyId = opts?.strategyId ?? "balanced";
  const strategy = getChainTeamStrategyPreset(strategyId);
  const reliability = deps.getChainSideState().workerReliability;

  // Precompute model families so diversity is relative to the ranked pool.
  const modelFamilyByPeer = new Map<string, string>();
  for (const peerId of peerList) {
    const leasePayload = deps.getChainSideState().workerLeases.getLease(peerId);
    const card = byPeer.get(peerId);
    const wireManifest = deps.getChainSideState().remoteManifests.get(peerId);
    const manifest = wireManifest && isManifestFresh(wireManifest)
      ? wireManifest
      : manifestFromAgentNetworkProfile(
          card?.agentNetworkProfile,
          peerId,
          card?.ownerId ?? "",
        );
    const runtime = (manifest?.runtime ?? "openclaw") as AgentRuntime;
    const fromLease = leasePayload?.runtimes.find(
      (r) => typeof r.modelFamily === "string" && r.modelFamily.length > 0,
    )?.modelFamily;
    modelFamilyByPeer.set(peerId, fromLease ?? modelFamilyFor(runtime));
  }
  const familyCounts = new Map<string, number>();
  for (const fam of modelFamilyByPeer.values()) {
    familyCounts.set(fam, (familyCounts.get(fam) ?? 0) + 1);
  }

  const scored: ChainRankedWorker[] = peerList.map((peerId) => {
    const card = byPeer.get(peerId);
    const isSelf = selfPeerId !== undefined && peerId === selfPeerId;
    const sameLan = sameLanByPeer.get(peerId) === true || isSelf;
    const transportId = transportByAgentPeer.get(peerId);
    const leaseAvail = deps.getChainSideState().workerLeases.getAvailability(peerId);
    const leasePayload = deps.getChainSideState().workerLeases.getLease(peerId);
    const cachedReady = deps.getChainSideState().readyProbeCache.get(peerId);

    let online: boolean;
    let availabilitySource: ChainRankedWorker["availabilitySource"];
    if (isSelf) {
      online =
        deps.getAgentNetworkWorkerEngine() === "ext"
          ? deps.isExtAgentBridgeReady()
          : deps.getAgentNetworkWorkerEngine() === "envoy-harness"
            ? deps.isEnvoyHarnessReady()
            : deps.isOpenClawReady() !== false;
      availabilitySource = "local";
    } else if (leaseAvail.state === "ready" && leaseAvail.source === "lease") {
      online = true;
      availabilitySource = "lease";
    } else if (
      leaseAvail.state === "expired" ||
      leaseAvail.state === "revoked" ||
      leaseAvail.state === "busy" ||
      leaseAvail.state === "engine_down"
    ) {
      // A known-bad lease stops new awards; do not treat card freshness as ready.
      online = false;
      availabilitySource = "unknown";
    } else if (cachedReady) {
      online = Boolean(transportId) && cachedReady.ready;
      availabilitySource = "legacy_probe";
    } else {
      // Mixed-version peers without leases: mesh reachability only (penalized).
      // Agent Card lastSeenAt is intentionally not consulted here.
      online = Boolean(transportId);
      availabilitySource = "unknown";
    }

    const viaRelay = !isSelf && online && transportId ? circuitIds.has(transportId) : false;
    // MAP: prefer a fresh wire-broadcast manifest over the card synthesis
    // (the broadcast carries the owner-signed runtime/skills/reputation).
    const wireManifest = deps.getChainSideState().remoteManifests.get(peerId);
    const manifest = wireManifest && isManifestFresh(wireManifest)
      ? wireManifest
      : manifestFromAgentNetworkProfile(
          card?.agentNetworkProfile,
          peerId,
          card?.ownerId ?? "",
        );

    const gate = evaluateChainWorkerHardGates({
      strategy,
      isSelf,
      sameLan,
      viaRelay,
      availabilitySource,
      leaseState:
        leaseAvail.state === "ready" ||
        leaseAvail.state === "expired" ||
        leaseAvail.state === "revoked" ||
        leaseAvail.state === "busy"
          ? leaseAvail.state
          : "unknown",
    });

    const legacy = scoreAgentNetworkWorker({
      requiredSkill: capability,
      membership: card?.membership ?? [],
      profile: card?.agentNetworkProfile,
      displayName: card?.displayName,
      sameLan,
    });
    const runtime = (manifest?.runtime ?? "openclaw") as AgentRuntime;
    const modelFamily = modelFamilyByPeer.get(peerId) ?? "unknown";
    const connectivityClass = isSelf
      ? "self" as const
      : sameLan
        ? "lan_direct" as const
        : viaRelay
          ? "relay" as const
          : "wan_direct" as const;
    const reliabilityProj = reliability.project({
      workerPeerId: peerId,
      runtime,
      modelFamily,
      skillId: capability,
      connectivityClass,
    });
    const familyCount = familyCounts.get(modelFamily) ?? 1;
    const strategyScored = scoreChainWorkerWithStrategy({
      strategy,
      components: {
        skill: Math.min(1, Math.max(0, legacy.breakdown.skill)),
        eta: clampLatencyComponent(reliabilityProj.latencyEwmaMs, leasePayload?.runtimes[0]?.capacity.availableSlots),
        cost: legacy.breakdown.spendPosture,
        reliability:
          strategyId === "highest-confidence"
            ? reliabilityProj.lowerBound
            : reliabilityProj.mean,
        transport: sameLan ? 1 : viaRelay ? 0.35 : online ? 0.7 : 0.1,
        modelDiversity: 1 / familyCount,
      },
    });
    const score =
      availabilitySource === "legacy_probe"
        ? Math.max(0, strategyScored.score - LEGACY_PROBE_SCORE_PENALTY / 100)
        : strategyScored.score;
    const assignmentReasons: ChainAssignmentReasonCode[] = [];
    if (legacy.breakdown.skill >= 0.9) assignmentReasons.push("skill_exact");
    if (sameLan) assignmentReasons.push("same_lan");
    if (availabilitySource === "lease") assignmentReasons.push("lease_ready");
    if (isSelf) assignmentReasons.push("privacy_local");

    return {
      peerId,
      score,
      summary: legacy.summary,
      sameLan,
      online: gate.ok ? online : false,
      viaRelay,
      availabilitySource,
      scoreComponents: strategyScored.components,
      reliabilityLowerBound: reliabilityProj.lowerBound,
      reliabilitySampleCount: reliabilityProj.sampleCount,
      reliabilityFallbackLevel: reliabilityProj.fallbackLevel,
      ...(gate.ok ? {} : { exclusionReason: gate.reason }),
      ...(assignmentReasons.length > 0 ? { assignmentReasons } : {}),
      manifest,
      ...(leasePayload ? { leaseSequence: leasePayload.sequence } : {}),
    } as ChainRankedWorker & { leaseSequence?: number };
  });
  const filtered =
    preferredWorkerPeerIds && preferredWorkerPeerIds.length > 0
      ? scored.filter((w) => preferredWorkerPeerIds.includes(w.peerId))
      : scored;
  // Online first, then lease-backed readiness, then strategy score + lease sequence.
  return rankWorkersByScore(filtered).sort((a, b) => {
    const aOnline = a.online ? 1 : 0;
    const bOnline = b.online ? 1 : 0;
    if (aOnline !== bOnline) return bOnline - aOnline;
    const aLease = a.availabilitySource === "lease" ? 1 : 0;
    const bLease = b.availabilitySource === "lease" ? 1 : 0;
    if (aLease !== bLease) return bLease - aLease;
    const aLegacy = a.availabilitySource === "legacy_probe" ? 1 : 0;
    const bLegacy = b.availabilitySource === "legacy_probe" ? 1 : 0;
    if (aLegacy !== bLegacy) return bLegacy - aLegacy;
    return compareChainWorkerTies(
      {
        score: a.score,
        peerId: a.peerId,
        leaseSequence: (a as { leaseSequence?: number }).leaseSequence,
      },
      {
        score: b.score,
        peerId: b.peerId,
        leaseSequence: (b as { leaseSequence?: number }).leaseSequence,
      },
    );
  });
}

function clampLatencyComponent(
  latencyEwmaMs: number | undefined,
  availableSlots: number | undefined,
): number {
  const slotBoost = typeof availableSlots === "number" && availableSlots > 0 ? 0.15 : 0;
  if (latencyEwmaMs === undefined || !(latencyEwmaMs > 0)) return 0.5 + slotBoost;
  // Lower latency → higher component. Soft ceiling ~120s.
  const raw = 1 - Math.min(1, latencyEwmaMs / 120_000);
  return Math.max(0, Math.min(1, raw + slotBoost));
}

/* ---------- tracking + state emission ---------- */

export function _startChainTracking(deps: ChainOrchestrationContext, chainId: string): void {
  _stopChainTracking(deps, chainId);
  const runtime = deps.getChainStore().getRuntime(chainId);
  if (!runtime || runtime.state.published || runtime.state.chainCancelled) return;

  const abort = new AbortController();
  deps.getChainSideState().trackAbort.set(chainId, abort);

  void (async () => {
    while (!abort.signal.aborted) {
      const rt = deps.getChainStore().getRuntime(chainId);
      if (!rt || rt.state.published || rt.state.chainCancelled) {
        _stopChainTracking(deps, chainId);
        return;
      }
      const recovery = deps.getChainSideState().recovery?.get(chainId);
      if (recovery?.phase === "recovering") {
        // Phase 60D — pause watchdog / reassignment until reconcile or grace.
        const { tickChainRecovery } = await import("./chain-reconcile-recovery.js");
        tickChainRecovery({ recovery });
        await new Promise((r) => setTimeout(r, 2_000));
        continue;
      }
      try {
        const orchDeps = await buildChainOrchestratorDeps(deps);
        await flushRecoveryAdvancePending(deps, chainId);
        // Always advance dependents + recover silent proposes/accepts.
        const advanced = await advanceReadySubtasks(orchDeps, rt.state);
        const proposed = await retryStaleProposals(orchDeps, rt.state);
        const accepted = await retryStaleAccepts(orchDeps, rt.state);
        if (
          advanced.proposed > 0 ||
          proposed.retried.length > 0 ||
          accepted.resent.length > 0 ||
          accepted.reassigned.length > 0
        ) {
          _emitChainState(deps, chainId);
        }
        if (rt.state.awards.size > 0) {
          await trackChain(orchDeps, rt.state, { tickMs: 30_000, maxTicks: 1 });
        }
        const latestRt = deps.getChainStore().getRuntime(chainId);
        const profile = deps.getProfile();
        if (latestRt && profile && !latestRt.state.published && !latestRt.state.chainCancelled) {
          const completed = await tryCompleteChainIfReady(orchDeps, latestRt.state, profile, {
            onContinueRound: (s) => _continueIterationRound(deps, s),
            onMaybeExtend: (s) => _maybeExtendIterationRound(deps, s),
          });
          if (completed.published) {
            _emitChainState(deps, chainId);
            _stopChainTracking(deps, chainId);
            return;
          }
        }
      } catch (err) {
        console.warn(`[chain.track] ${chainId} tick failed:`, err);
      }
      // Faster while waiting for first ACK / first execution; slower once running.
      const latest = deps.getChainStore().getRuntime(chainId);
      const waitMs =
        !latest ||
        latest.state.awards.size === 0 ||
        [...latest.state.awards.keys()].some((id) => !latest.state.partials.has(id))
          ? 5_000
          : 30_000;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  })();
}

export function _stopChainTracking(deps: ChainOrchestrationContext, chainId: string): void {
  const abort = deps.getChainSideState().trackAbort.get(chainId);
  if (abort) {
    abort.abort();
    deps.getChainSideState().trackAbort.delete(chainId);
  }
}

export function _emitChainReport(deps: ChainOrchestrationContext, report: ChainReport): void {
  deps.emit("chain:report", {
    chainId: report.chainId,
    executiveSummary: report.executiveSummary,
    subtaskCount: report.chainSummary.subtaskCount,
    workerCount: report.chainSummary.workerAllocations.length,
    synthesisCostUsd: report.chainSummary.synthesisCostUsd,
    createdAt: report.createdAt,
  });
}

/* ---------- award pipeline ---------- */

export async function _bondLevelForWorkerOwner(
  deps: ChainOrchestrationContext,
  workerOwnerId: string,
): Promise<BondLevel> {
  const bonds = await deps.getBonds();
  return bonds.find((b) => b.peerOwnerId === workerOwnerId)?.level ?? "public";
}

export async function _rollbackSubtaskAward(state: ChainState, subtaskId: string): Promise<void> {
  if (!state.awards.has(subtaskId)) return;
  await state.ledger.release(subtaskId, "pending owner approval");
  state.awards.delete(subtaskId);
  state.awardedAt.delete(subtaskId);
}

export async function _queueChainAwardApproval(
  deps: ChainOrchestrationContext,
  chainId: string,
  subtaskId: string,
  bid: ChainSubtaskBid,
  reason: string,
): Promise<void> {
  const queue = deps.getApprovalQueue();
  if (!queue) return;
  const item = createApprovalItem(
    "chain_award",
    "Approve chain worker",
    reason,
    JSON.stringify({
      chainId,
      subtaskId,
      workerPeerId: bid.workerPeerId,
      workerOwnerId: bid.workerOwnerId,
      acceptedCostUsd: bid.proposedCostUsd,
    } satisfies ChainAwardApprovalPayload),
    { metadata: { chainId, subtaskId, reason } },
    "high",
  );
  queue.add(item);
}

export async function _evaluateAwardAndAccept(
  deps: ChainOrchestrationContext,
  chainId: string,
  subtaskId: string,
  opts?: {
    policy?: "first" | "composite" | "cheapest" | "fastest";
    pickWorkerPeerId?: string;
    skipSensitivityGate?: boolean;
  },
): Promise<EvaluateBidsResult> {
  const runtime = deps.getChainStore().getRuntime(chainId);
  if (!runtime) return { ok: false, reason: "no_bids" };
  const awardMode = deps.getChainSideState().awardModes.get(chainId) ?? "direct";
  const orchDeps = await buildChainOrchestratorDeps(deps);
  const result = await evaluateBids(orchDeps, runtime.state, {
    subtaskId,
    policy: opts?.policy ?? (awardMode === "direct" ? "first" : "composite"),
    pickWorkerPeerId: opts?.pickWorkerPeerId,
    reserveCostUsd: awardMode === "direct" ? 0 : undefined,
  });
  if (!result.ok) return result;

  if (!opts?.skipSensitivityGate) {
    const bondLevel = await _bondLevelForWorkerOwner(deps, result.bid.workerOwnerId);
    const gate = requiresChainAwardApproval(runtime.state.chainMandate, bondLevel);
    if (gate.required) {
      await _rollbackSubtaskAward(runtime.state, subtaskId);
      await _queueChainAwardApproval(deps, chainId, subtaskId, result.bid, gate.reason ?? "sensitivity gate");
      return { ok: false, reason: "no_bids" };
    }
  }

  const subtask = runtime.state.subtasks.get(subtaskId);

  // Phase 59C — deliver before accept; stall award if required inputs fail.
  if (orchDeps.onAwardAccepted) {
    try {
      await orchDeps.onAwardAccepted(runtime.state, subtaskId, result.bid.workerPeerId);
    } catch (err) {
      console.warn(`[chain.input] onAwardAccepted failed for ${chainId}/${subtaskId}:`, err);
    }
  }
  const inputsReady = jobInputsReadyForAward(
    runtime.state,
    subtaskId,
    result.bid.workerPeerId,
  );
  if (!inputsReady.ok) {
    await _rollbackSubtaskAward(runtime.state, subtaskId);
    orchDeps.audit.record({
      type: "chain.awarded",
      outcome: "deny",
      intent: "task.chain.accept",
      correlationId: chainId,
      summary:
        `input_delivery_block subtask=${subtaskId} worker=${result.bid.workerPeerId}` +
        ` reason=${inputsReady.reason}`,
    });
    _emitChainState(deps, chainId);
    return { ok: false, reason: inputsReady.reason };
  }

  const parentArts =
    subtask && subtask.dependsOn.length > 0
      ? buildInputArtifacts(runtime.state, subtask)
      : undefined;
  const jobArts = buildJobInputFileArtifacts(
    runtime.state,
    subtaskId,
    result.bid.workerPeerId,
  ) as import("@envoymesh/protocol").NamedArtifact[];
  const inputArtifacts = mergeProposeInputArtifacts(parentArts, jobArts);
  let acceptOk = await sendChainAccept(
    orchDeps,
    result.bid.workerPeerId,
    result.award,
    subtask,
    inputArtifacts,
  );
  if (!acceptOk) {
    // Critical: evaluateBids already reserved/awarded in state — retry once so
    // the worker can start; otherwise jobs stall with awards but no execution.
    // Further recovery is handled by retryStaleAccepts in the tracking loop.
    acceptOk = await sendChainAccept(
      orchDeps,
      result.bid.workerPeerId,
      result.award,
      subtask,
      inputArtifacts,
    );
  }
  orchDeps.audit.record({
    type: "chain.awarded",
    outcome: acceptOk ? "allow" : "deny",
    intent: "task.chain.accept",
    correlationId: chainId,
    summary:
      `subtask=${subtaskId} worker=${result.bid.workerPeerId} cost=${result.bid.proposedCostUsd}` +
      (acceptOk ? "" : " accept_send_failed"),
  });
  if (acceptOk) {
    await maybeScheduleSpeculationAfterAward(orchDeps, runtime.state, result.award).catch((err) => {
      console.warn(`[chain.speculation] speculation schedule failed for ${chainId}/${subtaskId}:`, err);
    });
  }
  return result;
}

export async function _executeApprovedChainAward(
  deps: ChainOrchestrationContext,
  payload: ChainAwardApprovalPayload,
): Promise<{ ok: boolean; error?: string }> {
  const result = await _evaluateAwardAndAccept(deps, payload.chainId, payload.subtaskId, {
    pickWorkerPeerId: payload.workerPeerId,
    skipSensitivityGate: true,
  });
  if (!result.ok) {
    return { ok: false, error: result.reason ?? "award failed" };
  }
  _emitChainState(deps, payload.chainId);
  return { ok: true };
}

const CHAIN_STATUS_BROADCAST_MIN_INTERVAL_MS = 2_000;

/** Collect root + transitive dependents for owner cancel-by-subtask. */
export function collectSubtaskCancelClosure(
  state: ChainState,
  rootSubtaskId: string,
): string[] {
  const out = new Set<string>([rootSubtaskId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const sub of state.subtasks.values()) {
      if (out.has(sub.subtaskId)) continue;
      if ((sub.dependsOn ?? []).some((d) => out.has(d))) {
        out.add(sub.subtaskId);
        grew = true;
      }
    }
  }
  return [...out];
}

/**
 * Phase 58C — owner cancel (whole chain or subtask + dependents), notify
 * awarded workers, emit live state.
 */
export async function cancelChainOwnerAction(
  deps: ChainOrchestrationContext,
  params: import("@envoymesh/api").ChainCancelParams,
): Promise<import("@envoymesh/api").ChainCancelResult> {
  const runtime = deps.getChainStore().getRuntime(params.chainId);
  if (!runtime) {
    return { chainId: params.chainId, cancelled: [] };
  }
  const state = runtime.state;
  let cancelled: string[];
  if (params.subtaskId) {
    cancelled = collectSubtaskCancelClosure(state, params.subtaskId);
    for (const id of cancelled) state.cancelledSubtasks.add(id);
  } else {
    state.chainCancelled = true;
    cancelled = [...state.subtasks.keys()];
  }

  try {
    const orchDeps = await buildChainOrchestratorDeps(deps);
    const nowIso = new Date().toISOString();
    // Release budget for every cancelled award (subtask or whole-chain).
    for (const id of cancelled) {
      if (!state.awards.has(id)) continue;
      try {
        await state.ledger.release(id, "owner cancel");
      } catch (err) {
        console.warn(`[chain.cancel] ledger release failed for ${id}:`, err);
      }
    }

    if (params.subtaskId) {
      // Notify each awarded cancelled step with its own subtaskId so workers
      // abort the correct work (dependents must not receive only the root id).
      for (const id of cancelled) {
        const award = state.awards.get(id);
        if (!award?.workerPeerId) continue;
        await sendChainCancel(orchDeps, award.workerPeerId, {
          chainId: params.chainId,
          subtaskId: id,
          reason: params.reason.slice(0, 2000),
          cancelledBy: params.cancelledBy,
          notifyWorkerPeerIds: [award.workerPeerId],
          createdAt: nowIso,
        });
      }
    } else {
      // Whole-chain: one cancel per involved peer (no subtaskId) so workers
      // drop all pending bids / in-flight work for the chain.
      const peers = new Set<string>();
      for (const award of state.awards.values()) {
        if (award.workerPeerId) peers.add(award.workerPeerId);
      }
      for (const workers of state.workersBySubtask.values()) {
        for (const w of workers) peers.add(w);
      }
      for (const peer of peers) {
        await sendChainCancel(orchDeps, peer, {
          chainId: params.chainId,
          reason: params.reason.slice(0, 2000),
          cancelledBy: params.cancelledBy,
          notifyWorkerPeerIds: [peer],
          createdAt: nowIso,
        });
      }
    }
  } catch (err) {
    console.warn(`[chain.cancel] notify failed for ${params.chainId}:`, err);
  }
  _emitChainState(deps, params.chainId);
  return { chainId: params.chainId, cancelled };
}

/** Phase 60.1 — owner resolves speculative disagreement (pick final or reassign). */
export async function resolveSpeculationOwnerAction(
  deps: ChainOrchestrationContext,
  params: ChainResolveSpeculationParams,
): Promise<ChainResolveSpeculationResult> {
  const runtime = deps.getChainStore().getRuntime(params.chainId);
  if (!runtime) {
    return { ok: false, reason: "chain_not_found" };
  }
  const orchDeps = await buildChainOrchestratorDeps(deps);
  if (params.action === "pick") {
    if (!params.attemptId?.trim()) {
      return { ok: false, reason: "attempt_required" };
    }
    const picked = await ownerPickSpeculativeAttempt(
      orchDeps,
      runtime.state,
      params.subtaskId,
      params.attemptId,
    );
    if (!picked.ok) {
      return { ok: false, reason: picked.reason };
    }
    await advanceReadySubtasks(orchDeps, runtime.state);
    _emitChainState(deps, params.chainId);
    return { ok: true };
  }
  if (params.action === "auto") {
    // Phase 63 — owner (or mobile) defers to orchestrator. The auto
    // resolver is the same code the wire path uses when
    // `chainMandate.speculationOnDisagreement === "auto"`.
    const finalsCtx = speculativeFinalsContext(orchDeps, runtime.state, params.subtaskId);
    const classified = classifySpeculativeFinalSelection(
      runtime.state,
      params.subtaskId,
      finalsCtx,
    );
    if (classified.selectedAttemptId) {
      const picked = await ownerPickSpeculativeAttempt(
        orchDeps,
        runtime.state,
        params.subtaskId,
        classified.selectedAttemptId,
      );
      if (!picked.ok) {
        return { ok: false, reason: picked.reason };
      }
      await advanceReadySubtasks(orchDeps, runtime.state);
      _emitChainState(deps, params.chainId);
      return { ok: true, reason: "auto_picked" };
    }
    const selectionReason: "disagree_needs_verify" | "none_pass" =
      classified.reason === "none_pass" ? "none_pass" : "disagree_needs_verify";
    const auto = autoResolveSpeculativeDisagreement({
      state: runtime.state,
      subtaskId: params.subtaskId,
      selectionReason,
    });
    if (auto.ok && auto.action === "auto_pick" && auto.selectedAttemptId) {
      const picked = await ownerPickSpeculativeAttempt(
        orchDeps,
        runtime.state,
        params.subtaskId,
        auto.selectedAttemptId,
      );
      if (!picked.ok) {
        return { ok: false, reason: picked.reason };
      }
      await advanceReadySubtasks(orchDeps, runtime.state);
      _emitChainState(deps, params.chainId);
      return { ok: true, reason: "auto_picked" };
    }
    if (auto.ok && auto.action === "auto_reassign") {
      await clearSpeculativeSibling(orchDeps, runtime.state, params.subtaskId, "auto_reassign");
      const reassigned = await reassignSubtaskOwnerAction(deps, {
        chainId: params.chainId,
        subtaskId: params.subtaskId,
      });
      if (!reassigned.ok) {
        return { ok: false, reason: reassigned.error ?? "reassign_failed" };
      }
      _emitChainState(deps, params.chainId);
      return { ok: true, nextWorkerPeerId: reassigned.nextWorkerPeerId, reason: "auto_reassigned" };
    }
    return { ok: false, reason: auto.reason };
  }
  await clearSpeculativeSibling(orchDeps, runtime.state, params.subtaskId, "owner_reassign");
  const reassigned = await reassignSubtaskOwnerAction(deps, {
    chainId: params.chainId,
    subtaskId: params.subtaskId,
  });
  if (!reassigned.ok) {
    return { ok: false, reason: reassigned.error ?? "reassign_failed" };
  }
  return { ok: true, nextWorkerPeerId: reassigned.nextWorkerPeerId };
}

/** Phase 58C — owner-forced stall reassign for one step. */
export async function reassignSubtaskOwnerAction(
  deps: ChainOrchestrationContext,
  params: import("@envoymesh/api").ChainReassignSubtaskParams,
): Promise<import("@envoymesh/api").ChainReassignSubtaskResult> {
  const runtime = deps.getChainStore().getRuntime(params.chainId);
  if (!runtime) {
    return {
      ok: false,
      chainId: params.chainId,
      subtaskId: params.subtaskId,
      error: "chain_not_found",
    };
  }
  try {
    const orchDeps = await buildChainOrchestratorDeps(deps);
    const result = await reassignStalledSubtask(orchDeps, runtime.state, params.subtaskId);
    _emitChainState(deps, params.chainId);
    if (!result.ok) {
      return {
        ok: false,
        chainId: params.chainId,
        subtaskId: params.subtaskId,
        error: result.reason,
      };
    }
    return {
      ok: true,
      chainId: params.chainId,
      subtaskId: params.subtaskId,
      nextWorkerPeerId: result.nextWorkerPeerId,
    };
  } catch (err) {
    return {
      ok: false,
      chainId: params.chainId,
      subtaskId: params.subtaskId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Phase 59D — retry failed/stuck job input deliveries, then advance ready steps. */
export async function retryInputDeliveryOwnerAction(
  deps: ChainOrchestrationContext,
  params: import("@envoymesh/api").ChainRetryInputDeliveryParams,
): Promise<import("@envoymesh/api").ChainRetryInputDeliveryResult> {
  const runtime = deps.getChainStore().getRuntime(params.chainId);
  if (!runtime) {
    return {
      ok: false,
      chainId: params.chainId,
      retried: 0,
      verified: 0,
      failed: 0,
      error: "chain_not_found",
    };
  }
  try {
    const orchDeps = await buildChainOrchestratorDeps(deps);
    const vaultDir = deps.getVaultDir();
    const mesh = deps.getReachableMesh();
    const taskStore = deps.getTaskStore();
    const profile = deps.getProfile();
    const transport = await _chainTransportResolver(deps);
    const counts = await retryFailedChainInputDeliveries({
      state: runtime.state,
      workerPeerId: params.workerPeerId,
      sourceRelativePath: params.sourceRelativePath,
      orchestratorPeerId: orchDeps.orchestratorPeerId,
      resolveTransportPeerId: transport
        ? async (workerPeerId) =>
            (await resolveChainTransportPeerId(transport, workerPeerId)) ?? undefined
        : undefined,
      copyLocal:
        vaultDir
          ? ({ sourceRelativePath, deliveredRelativePath }) =>
              copyChainInputInVault({ vaultDir, sourceRelativePath, deliveredRelativePath })
          : undefined,
      pushFile:
        vaultDir && mesh && taskStore && profile
          ? async ({
              sourceRelativePath,
              voucherRelativePath,
              toPeerId,
              chainId,
              expiresAt,
            }) => {
              const dialHints = transport?.resolveDialHints
                ? await transport.resolveDialHints(toPeerId)
                : [];
              return sendVaultFileViaDataTransfer({
                mesh,
                profile,
                taskStore,
                vaultDir,
                relativePath: sourceRelativePath,
                voucherRelativePath,
                expiresAt,
                toPeerId,
                dialHints,
                rebuildDialHints: transport?.resolveDialHints
                  ? () => transport.resolveDialHints!(toPeerId)
                  : undefined,
                transferHooks: {
                  correlationId: chainId,
                  onUpdate: () => {
                    /* state.inputDeliveries is source of truth */
                  },
                },
              });
            }
          : undefined,
      onUpdate: () => _emitChainState(deps, params.chainId),
    });
    try {
      await advanceReadySubtasks(orchDeps, runtime.state);
    } catch (err) {
      console.warn(`[chain.input] advance after retry failed for ${params.chainId}:`, err);
    }
    // Competitive (and any rolled-back award): deliveries may now be verified while
    // the subtask still has bids and no award — re-run award+accept.
    if (counts.verified > 0) {
      for (const subtaskId of subtasksAwaitingAward(runtime.state)) {
        try {
          await _evaluateAwardAndAccept(deps, params.chainId, subtaskId);
        } catch (err) {
          console.warn(
            `[chain.input] re-award after retry failed for ${params.chainId}/${subtaskId}:`,
            err,
          );
        }
      }
    }
    _emitChainState(deps, params.chainId);
    return {
      ok: true,
      chainId: params.chainId,
      retried: counts.retried,
      verified: counts.verified,
      failed: counts.failed,
    };
  } catch (err) {
    return {
      ok: false,
      chainId: params.chainId,
      retried: 0,
      verified: 0,
      failed: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Phase 59E — GC job input workspace once per chain when terminal. */
export async function maybeGcChainInputWorkspace(
  deps: ChainOrchestrationContext,
  chainId: string,
  opts?: { policy?: import("@envoymesh/api").ChainInputDeliveryPolicy; force?: boolean },
): Promise<void> {
  const side = deps.getChainSideState();
  if (!opts?.force && side.inputGcDone.has(chainId)) return;
  const vaultDir = deps.getVaultDir();
  if (!vaultDir) return;
  const runtime = deps.getChainStore().getRuntime(chainId);
  const policy =
    opts?.policy ??
    runtime?.state.inputDeliveryPolicy ??
    undefined;
  const result = await gcChainInputWorkspace({ vaultDir, chainId, policy });
  if (result.ok) {
    side.inputGcDone.add(chainId);
    if (result.removed) {
      void _appendChainAudit(deps, {
        type: "chain.cancelled",
        outcome: "record",
        intent: "task.chain.cancel",
        correlationId: chainId,
        summary: `input_workspace_gc path=${result.relativePath}`,
      });
    }
  } else {
    console.warn(`[chain.input] GC failed for ${chainId}: ${result.reason}`);
  }
}

export function _emitChainState(deps: ChainOrchestrationContext, chainId: string): void {
  const runtime = deps.getChainStore().getRuntime(chainId);
  if (!runtime) return;
  const chainSide = deps.getChainSideState();
  const state = snapshotToResult(chainStateSnapshot(runtime.state));
  state.bidsBySubtask = bidsBySubtask(runtime.state);
  state.goal = chainSide.goals.get(chainId);
  state.estimatedCostRange = chainSide.costEstimates.get(chainId);
  state.awardMode = chainSide.awardModes.get(chainId) ?? "direct";
  state.showCostUi = chainSide.showCostUi.get(chainId) ?? false;
  state.budgetWarningLevel = chainBudgetWarningLevel(runtime.state);
  state.steps = buildChainLiveSteps(runtime.state);
  state.inputAttachments = runtime.state.inputAttachments;
  state.inputDeliveries = runtime.state.inputDeliveries;
  state.inputDeliveryPolicy = runtime.state.inputDeliveryPolicy;
  populateIterationInState(runtime, state);
  deps.emit("chain:state", state);
  // Fan-out read-only status to joined workers (debounced).
  const now = Date.now();
  const last = chainSide.lastStatusBroadcastAt.get(chainId) ?? 0;
  const terminal = runtime.state.published || runtime.state.chainCancelled;
  if (terminal || now - last >= CHAIN_STATUS_BROADCAST_MIN_INTERVAL_MS) {
    chainSide.lastStatusBroadcastAt.set(chainId, now);
    void (async () => {
      try {
        const orchDeps = await buildChainOrchestratorDeps(deps);
        await broadcastChainStatus(orchDeps, runtime.state, {
          goal: chainSide.goals.get(chainId),
          awardMode: chainSide.awardModes.get(chainId) ?? "direct",
        });
      } catch (err) {
        console.warn(`[chain.status] broadcast failed for ${chainId}:`, err);
      }
    })();
  }
  if (terminal) {
    void maybeGcChainInputWorkspace(deps, chainId);
  }
}

/** Phase 47D — focused iteration progress for Social / remote Assigner UIs. */
export function _emitChainIteration(
  deps: ChainOrchestrationContext,
  chainId: string,
  phase: import("@envoymesh/api").ChainIterationProgressEvent["phase"],
  extra?: {
    summary?: string;
    judgeDecision?: string;
    judgeReason?: string;
  },
): void {
  const runtime = deps.getChainStore().getRuntime(chainId);
  const observerPeerId = deps.getChainSideState().iterationObservers.get(chainId);
  const event = buildIterationProgressEvent(runtime, chainId, phase, observerPeerId, extra);
  if (!event) return;
  deps.emit("chain:iteration", event);
  void _appendChainAudit(deps, {
    type: "chain.iteration.progress",
    outcome: "record",
    intent: "task.chain.merge",
    correlationId: chainId,
    remotePeerId: observerPeerId,
    summary: `phase=${phase} round=${event.round}/${event.maxRounds}${extra?.summary ? ` ${extra.summary}` : ""}`,
  });
}

/* ---------- auto-evaluate + goal runner ---------- */

export function _scheduleAutoEvaluate(
  deps: ChainOrchestrationContext,
  chainId: string,
  subtaskId: string,
): void {
  const key = `${chainId}::${subtaskId}`;
  const timers = deps.getChainSideState().autoEvaluateTimers;
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  const awardMode = deps.getChainSideState().awardModes.get(chainId) ?? "direct";
  const delayMs =
    awardMode === "direct" ? CHAIN_DIRECT_AUTO_EVALUATE_MS : CHAIN_AUTO_EVALUATE_MS;
  const timer = setTimeout(() => {
    timers.delete(key);
    void _autoEvaluateSubtask(deps, chainId, subtaskId);
  }, delayMs);
  timers.set(key, timer);
}

export async function _autoEvaluateSubtask(
  deps: ChainOrchestrationContext,
  chainId: string,
  subtaskId: string,
): Promise<void> {
  const runtime = deps.getChainStore().getRuntime(chainId);
  if (!runtime || runtime.state.chainCancelled || runtime.state.awards.has(subtaskId)) return;
  if (!subtasksAwaitingAward(runtime.state).includes(subtaskId)) return;
  // Respect award mode: direct → first ACK wins; competitive → composite rank.
  const result = await _evaluateAwardAndAccept(deps, chainId, subtaskId);
  if (result.ok) {
    _emitChainState(deps, chainId);
  }
}

export function _chainDiagnosticsForSubtasks(
  subtasks: Array<{
    subtaskId: string;
    requiredSkill: string;
    preferredWorkerPeerId?: string;
  }>,
  workersBySubtask: Record<string, string[]>,
  rankedBySubtask?: Record<string, Array<{ peerId: string; score: number; summary: string; online?: boolean }>>,
): string[] {
  const diagnostics: string[] = [];
  for (const subtask of subtasks) {
    const workers = workersBySubtask[subtask.subtaskId] ?? [];
    if (workers.length === 0) {
      diagnostics.push(
        `No workers for \`${subtask.requiredSkill}\` — ask a bonded contact to enable Join Agent Network (Capability Provider) in Settings → AI.`,
      );
      continue;
    }
    const ranked = rankedBySubtask?.[subtask.subtaskId] ?? [];
    if (ranked.length === 0) continue;
    const byReachability = [...ranked].sort((a, b) => {
      const aOnline = a.online ? 1 : 0;
      const bOnline = b.online ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      if (b.score !== a.score) return b.score - a.score;
      return a.peerId.localeCompare(b.peerId);
    });
    // Always surface the plan+assign assignee when present (even if offline),
    // so diagnostics match preferredWorkerPeerId. Note offline so owners know
    // launch may need another reachable worker.
    const preferred = subtask.preferredWorkerPeerId
      ? ranked.find((r) => r.peerId === subtask.preferredWorkerPeerId)
      : undefined;
    const pick = preferred ?? byReachability[0];
    if (pick) {
      const offlineNote = preferred && preferred.online === false ? " (offline)" : "";
      diagnostics.push(`Selected for \`${subtask.requiredSkill}\`: ${pick.summary}${offlineNote}`);
    }
  }
  return diagnostics;
}

export async function _runChainGoal(
  deps: ChainOrchestrationContext,
  input: {
    goal: string;
    chainId?: string;
    maxChainCostUsd?: number;
    costCeilingUsd?: number;
    allowLlm?: boolean;
    /** When set and not local, hand off Assigner role via `task.chain.handoff`. */
    assignerPeerId?: string;
    /** Phase 62C — override node default Assigner auto-selection. */
    assignerSelection?: import("@envoymesh/api").AssignerSelectionMode;
    /** Phase 47 — override node `iterationMaxRounds`. */
    iterationMaxRounds?: number;
    /** Phase 47D — handoff / override judge mode. */
    iterationJudgeMode?: NonNullable<ChainDefaultsConfig["iterationJudgeMode"]>;
    extendMaxStepsPerRound?: number;
    /** Phase 47D — rehydrate mid-job iteration after Assigner handoff. */
    iterationWire?: import("./chain-iteration.js").IterationWireBlob;
    /** Restrict worker discovery to these agent peer IDs. Empty/absent = use all. */
    preferredWorkerPeerIds?: string[];
    /** Skill vs role plan+assign mode for this job. */
    assignmentMode?: "skill" | "role";
    /**
     * Adopt a previewed plan instead of calling `planChain` again.
     * Rewrites chainId / chainMandateId onto the live mandate.
     */
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
    /** Preview warnings — preferred over process-global lastPlanMeta. */
    planWarnings?: ChainPlanMeta["warnings"];
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
  },
): Promise<{
  ok: boolean;
  chainId: string;
  chainMandateId: string;
  subtasks: Array<{
    subtaskId: string;
    depth: number;
    requiredSkill: string;
    requiredRole?: string;
    objective: string;
    preferredWorkerPeerId?: string;
  }>;
  error?: string;
  assignerPeerId?: string;
  handedOff?: boolean;
}> {
  let nodeDefaults = DEFAULT_CHAIN_DEFAULTS;
  try {
    const cfg = await deps.getNodeConfig();
    nodeDefaults = mergeChainDefaults((cfg as { chainDefaults?: ChainDefaultsConfig })?.chainDefaults);
  } catch {
    /* use production defaults */
  }

  const assignerResolution = await resolveAssignerForChainGoal(deps, {
    explicitAssignerPeerId: input.assignerPeerId,
    assignerSelection: input.assignerSelection,
    nodeDefaults,
  });

  if (assignerResolution.auditSummary && assignerResolution.mode === "best_capable") {
    await _appendChainAudit(deps, {
      type: "chain.assigner_selected",
      outcome: "record",
      intent: assignerResolution.handoff ? "task.chain.handoff" : "task.chain.mandate",
      correlationId: input.chainId,
      remotePeerId: assignerResolution.assignerPeerId,
      summary: assignerResolution.auditSummary,
    });
  }

  const assignerPeerId = assignerResolution.assignerPeerId?.trim();
  if (assignerPeerId && assignerResolution.handoff) {
    const agent = await deps.ensureAgentIdentity();
    if (agent && assignerPeerId !== agent.agentPeerId) {
      return _handoffChainGoalToAssigner(deps, {
        goal: input.goal,
        chainId: input.chainId,
        maxChainCostUsd: input.maxChainCostUsd,
        costCeilingUsd: input.costCeilingUsd,
        allowLlm: input.allowLlm,
        assignerPeerId,
        iterationMaxRounds: input.iterationMaxRounds,
        iterationJudgeMode: input.iterationJudgeMode,
        extendMaxStepsPerRound: input.extendMaxStepsPerRound,
        iterationWire: input.iterationWire,
        preferredWorkerPeerIds: input.preferredWorkerPeerIds,
        criticality: input.criticality,
      });
    }
  }

  const chainId = input.chainId ?? `chain_${randomUUID()}`;
  const chainMandateId = `chainmandate_${randomUUID()}`;
  const ownerProfile = deps.getProfile();
  const orchestratorOwnerId = ownerProfile?.owner.ownerId ?? "envoy:owner:placeholder";
  const ownerPrivateKeyPem = ownerProfile?.owner.privateKeyPem;
  const awardMode = resolveAwardMode(nodeDefaults);
  const showCostUi = resolveShowCostUi(nodeDefaults);
  const assignmentMode =
    input.assignmentMode === "role" || input.assignmentMode === "skill"
      ? input.assignmentMode
      : resolveAssignmentModeDefault(nodeDefaults);
  const teamStrategyId: ChainTeamStrategyId =
    input.teamStrategyId ??
    (nodeDefaults as { teamStrategyId?: ChainTeamStrategyId }).teamStrategyId ??
    "balanced";
  const teamStrategy = resolveChainTeamStrategy(teamStrategyId);
  const mandate = signChainMandate(
    {
      version: "0.1" as const,
      chainMandateId,
      chainId,
      issuerOwnerId: orchestratorOwnerId,
      orchestratorOwnerId,
      maxChainCostUsd: input.maxChainCostUsd ?? 10,
      costCeilingUsd: input.costCeilingUsd ?? 3,
      maxWorkers: awardMode === "direct" ? 1 : 3,
      allowDepth3: false,
      maxSensitivity: "public" as const,
      deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      rebalancePolicy: awardMode === "direct" ? "never" : (nodeDefaults.rebalancePolicy ?? "never"),
      maxAutoRebalances: nodeDefaults.maxAutoRebalances ?? 2,
      autoRebalanceIncrementUsd: nodeDefaults.autoRebalanceIncrementUsd ?? 5,
      criticality: input.criticality,
      teamStrategyId,
      ...(input.speculationEnabled === true ||
      nodeDefaults.speculationEnabled === true
        ? {
            speculationEnabled: true,
            speculationOnDisagreement:
              input.speculationOnDisagreement ??
              nodeDefaults.speculationOnDisagreement ??
              "auto",
            maxParallelAttemptsPerStep:
              input.maxParallelAttemptsPerStep ??
              nodeDefaults.maxParallelAttemptsPerStep ??
              2,
          }
        : {}),
    },
    ownerPrivateKeyPem,
  );
  const state = createChainState(mandate, {
    awardMode,
    goal: input.goal,
    inputDeliveryScope: input.inputDeliveryScope,
  });
  const chainSide = deps.getChainSideState();
  chainSide.goals.set(chainId, input.goal);
  chainSide.awardModes.set(chainId, awardMode);
  chainSide.showCostUi.set(chainId, showCostUi);
  chainSide.assignmentModes.set(chainId, assignmentMode);
  chainSide.teamStrategies.set(chainId, teamStrategy);
  if (input.planWarnings?.length) {
    chainSide.planWarnings.set(chainId, input.planWarnings);
  }
  deps.getChainStore().setRuntime(chainId, {
    state,
    bidStrategy: {
      baseCostUsd: awardMode === "direct" ? 0 : 1,
      capabilityLocalEtaMs: 60_000,
      reputationDiscount: 1,
      etaSlackMs: 60_000,
    },
  });

  let plan:
    | {
        ok: true;
        subtasks: ChainSubtask[];
        planWarnings?: ChainPlanMeta["warnings"];
        assignmentMode?: "skill" | "role";
      }
    | { ok: false; reason: string };
  if (input.plannedSubtasks && input.plannedSubtasks.length > 0) {
    const nowIso = new Date().toISOString();
    try {
      const steps = input.plannedSubtasks.map((s) =>
        ChainSubtaskSchema.parse({
          version: "0.1" as const,
          subtaskId: s.subtaskId,
          chainId,
          chainMandateId,
          depth: Math.min(3, Math.max(1, Math.floor(s.depth) || 1)),
          requiredSkill: s.requiredSkill,
          ...(s.requiredRole ? { requiredRole: s.requiredRole } : {}),
          objective: s.objective,
          requestedResult: (s.requestedResult?.trim() || "result of the goal").slice(0, 1000),
          constraints: s.constraints ?? [],
          dependsOn: s.dependsOn ?? [],
          costCeilingUsd: s.costCeilingUsd,
          deadlineAt: s.deadlineAt ?? mandate.deadlineAt,
          preferredWorkerPeerId: s.preferredWorkerPeerId,
          createdAt: s.createdAt ?? nowIso,
        }),
      );
      for (const step of steps) state.subtasks.set(step.subtaskId, step);
      plan = { ok: true, subtasks: steps };
      void _appendChainAudit(deps, {
        type: "chain.launched",
        outcome: "record",
        intent: "task.chain.propose",
        correlationId: chainId,
        summary: `adopted_preview_plan steps=${steps.length}`,
      });
    } catch (err) {
      plan = {
        ok: false,
        reason: err instanceof Error ? err.message : "invalid_planned_subtasks",
      };
    }
  } else {
    plan = await planChain(await buildChainOrchestratorDeps(deps), state, input.goal, {
      allowLlm: input.allowLlm ?? nodeDefaults.allowLlmDecompose ?? false,
      assignmentMode,
    });
    if (plan.ok && plan.planWarnings?.length) {
      chainSide.planWarnings.set(chainId, plan.planWarnings as ChainPlanMeta["warnings"]);
    }
  }
  if (!plan.ok) {
    return { ok: false, chainId, chainMandateId, subtasks: [], error: `plan failed: ${(plan as { reason: string }).reason}` };
  }

  const maxRounds = Math.max(
    1,
    Math.floor(input.iterationMaxRounds ?? nodeDefaults.iterationMaxRounds ?? 1),
  );
  const maxExtends = Math.max(
    0,
    Math.floor(input.extendMaxStepsPerRound ?? nodeDefaults.extendMaxStepsPerRound ?? 2),
  );
  if (input.iterationWire) {
    const { fromIterationWireBlob } = await import("./chain-iteration.js");
    state.iteration = fromIterationWireBlob(input.iterationWire);
    // Prefer knobs from this handoff when present.
    if (input.iterationMaxRounds != null) {
      state.iteration.maxRounds = Math.max(1, Math.min(10, Math.floor(input.iterationMaxRounds)));
    }
    if (input.iterationJudgeMode) state.iteration.judgeMode = input.iterationJudgeMode;
    if (input.extendMaxStepsPerRound != null) {
      state.iteration.maxExtendsInRound = Math.max(0, Math.floor(input.extendMaxStepsPerRound));
    }
    // Open-round IDs from a fresh plan replace an empty wire list.
    if (state.iteration.openRoundSubtaskIds.length === 0) {
      state.iteration.openRoundSubtaskIds = plan.subtasks.map((s) => s.subtaskId);
    }
    void _appendChainAudit(deps, {
      type: "chain.iteration.round_started",
      outcome: "record",
      intent: "task.chain.propose",
      correlationId: chainId,
      summary: `rehydrated round=${state.iteration.round}/${state.iteration.maxRounds}`,
    });
  } else if (maxRounds > 1 || maxExtends > 0) {
    state.iteration = createIterationState({
      goal: input.goal,
      maxRounds,
      openRoundSubtaskIds: plan.subtasks.map((s) => s.subtaskId),
      maxExtendsInRound: maxExtends,
      extendMaxDepth: nodeDefaults.extendMaxDepth ?? 3,
      extendOnlyAfterPartial: nodeDefaults.extendOnlyAfterPartial !== false,
      judgeMode: input.iterationJudgeMode ?? nodeDefaults.iterationJudgeMode ?? "llm",
      carryMode: nodeDefaults.iterationCarryMode ?? "summary",
    });
    if (maxRounds > 1) {
      void _appendChainAudit(deps, {
        type: "chain.iteration.round_started",
        outcome: "record",
        intent: "task.chain.propose",
        correlationId: chainId,
        summary: `round=1/${maxRounds}`,
      });
    }
  }

  const workersBySubtask: Record<string, string[]> = {};
  const rankedBySubtask: Record<string, Array<{ peerId: string; score: number; summary: string }>> = {};
  let maxWorkers = 0;
  let totalWorkers = 0;
  // Direct keeps a backup so a silent preferred peer can failover quickly.
  const workerCap = awardMode === "direct" ? 2 : 3;
  void _appendChainAudit(deps, {
    type: "chain.launched",
    outcome: "record",
    intent: "task.chain.propose",
    correlationId: chainId,
    summary: `worker_rank_start steps=${plan.subtasks.length}`,
  });
  for (const subtask of plan.subtasks) {
    const ranked = await findAgentNetworkWorkersRanked(deps, subtask.requiredSkill, input.preferredWorkerPeerIds);
    rankedBySubtask[subtask.subtaskId] = ranked;
    const preferred = subtask.preferredWorkerPeerId;
    // Engine hello at select time — skip peers whose configured AN engine is down.
    const { chosen } = await selectReadyWorkersForSubtask(
      deps,
      ranked,
      preferred,
      workerCap,
      { correlationId: chainId },
    );
    workersBySubtask[subtask.subtaskId] = chosen;
    // Prefer the first ready worker. Rewrite sticky preferred when it failed hello.
    if (chosen[0] && (!preferred || !chosen.includes(preferred))) {
      subtask.preferredWorkerPeerId = chosen[0];
    }
    maxWorkers = Math.max(maxWorkers, ranked.length);
    totalWorkers += chosen.length > 0 ? 1 : 0;
  }
  void _appendChainAudit(deps, {
    type: "chain.launched",
    outcome: "record",
    intent: "task.chain.propose",
    correlationId: chainId,
    summary: `worker_rank_done filled=${totalWorkers}/${plan.subtasks.length} mode=${awardMode}`,
  });
  if (plan.subtasks.length > 0 && totalWorkers === 0) {
    // Solo / no capability providers — do not create a zombie "Bidding…" chain.
    deps.getChainStore().deleteRuntime(chainId);
    chainSide.goals.delete(chainId);
    chainSide.costEstimates.delete(chainId);
    chainSide.awardModes.delete(chainId);
    chainSide.showCostUi.delete(chainId);
    return {
      ok: false,
      chainId,
      chainMandateId,
      subtasks: plan.subtasks.map((s) => ({
        subtaskId: s.subtaskId,
        depth: s.depth,
        requiredSkill: s.requiredSkill,
        objective: s.objective,
        preferredWorkerPeerId: s.preferredWorkerPeerId,
      })),
      error: "no_workers",
    };
  }
  if (showCostUi) {
    chainSide.costEstimates.set(
      chainId,
      estimateChainCostRange({
        subtaskCount: plan.subtasks.length,
        workerCandidateCount: maxWorkers,
        maxChainCostUsd: mandate.maxChainCostUsd,
      }),
    );
  }

  const launch = await launchChain(await buildChainOrchestratorDeps(deps), state, workersBySubtask);
  if (!launch.ok) {
    return {
      ok: false,
      chainId,
      chainMandateId,
      subtasks: plan.subtasks.map((s) => ({
        subtaskId: s.subtaskId,
        depth: s.depth,
        requiredSkill: s.requiredSkill,
        objective: s.objective,
        preferredWorkerPeerId: s.preferredWorkerPeerId,
      })),
      error: `launch failed: ${(launch as { reason: string }).reason}`,
    };
  }

  _startChainTracking(deps, chainId);
  _emitChainState(deps, chainId);

  return {
    ok: true,
    chainId,
    chainMandateId,
    subtasks: plan.subtasks.map((s) => ({
      subtaskId: s.subtaskId,
      depth: s.depth,
      requiredSkill: s.requiredSkill,
      objective: s.objective,
      preferredWorkerPeerId: s.preferredWorkerPeerId,
    })),
  };
}

/** Phase 47A — plan+launch the next outer iteration round on the same chainId. */
export async function _continueIterationRound(
  deps: ChainOrchestrationContext,
  state: ChainState,
): Promise<{ ok: boolean; error?: string }> {
  const it = state.iteration;
  if (!it) return { ok: false, error: "no_iteration" };

  let nodeDefaults = DEFAULT_CHAIN_DEFAULTS;
  try {
    const cfg = await deps.getNodeConfig();
    nodeDefaults = mergeChainDefaults((cfg as { chainDefaults?: ChainDefaultsConfig })?.chainDefaults);
  } catch {
    /* defaults */
  }
  const side = deps.getChainSideState();
  const awardMode = side.awardModes.get(state.chainId) ?? resolveAwardMode(nodeDefaults);
  const assignmentMode = side.assignmentModes.get(state.chainId) ?? resolveAssignmentModeDefault(nodeDefaults);
  // Direct keeps a backup so a silent preferred peer can failover quickly.
  const workerCap = awardMode === "direct" ? 2 : 3;
  const replanGoal = iterationReplanGoal(state);
  const orchDeps = await buildChainOrchestratorDeps(deps);
  const plan = await planChain(orchDeps, state, replanGoal, {
    allowLlm: nodeDefaults.allowLlmDecompose ?? true,
    assignmentMode,
  });
  if (!plan.ok || plan.subtasks.length === 0) {
    return { ok: false, error: `replan failed: ${!plan.ok ? (plan as { reason: string }).reason : "empty"}` };
  }
  if (plan.planWarnings?.length) {
    side.planWarnings.set(state.chainId, plan.planWarnings as ChainPlanMeta["warnings"]);
  }

  const workersBySubtask: Record<string, string[]> = {};
  let totalWorkers = 0;
  for (const subtask of plan.subtasks) {
    const ranked = await findAgentNetworkWorkersRanked(deps, subtask.requiredSkill);
    const preferred = subtask.preferredWorkerPeerId;
    const { chosen } = await selectReadyWorkersForSubtask(
      deps,
      ranked,
      preferred,
      workerCap,
      { correlationId: state.chainId },
    );
    workersBySubtask[subtask.subtaskId] = chosen;
    if (chosen[0] && (!preferred || !chosen.includes(preferred))) {
      subtask.preferredWorkerPeerId = chosen[0];
    }
    totalWorkers += chosen.length > 0 ? 1 : 0;
  }
  if (totalWorkers === 0) {
    return { ok: false, error: "no_workers" };
  }

  const launch = await launchChain(orchDeps, state, workersBySubtask);
  if (!launch.ok) {
    return { ok: false, error: `launch failed: ${(launch as { reason: string }).reason}` };
  }

  markIterationRoundOpened(
    state,
    plan.subtasks.map((s) => s.subtaskId),
  );
  _startChainTracking(deps, state.chainId);
  return { ok: true };
}

/** Phase 47B — drain pending extend steps, or auto-suggest one local extend (47C). */
export async function _maybeExtendIterationRound(
  deps: ChainOrchestrationContext,
  state: ChainState,
): Promise<{ ok: boolean; extended: boolean; error?: string }> {
  const side = deps.getChainSideState();
  let pending = side.pendingExtendSteps.get(state.chainId);
  if (!pending || pending.length === 0) {
    const { suggestLocalExtendStep } = await import("./chain-iteration.js");
    const suggestion = suggestLocalExtendStep(state);
    if (!suggestion) return { ok: true, extended: false };
    pending = [suggestion];
  } else {
    side.pendingExtendSteps.delete(state.chainId);
  }
  return _extendIterationRound(deps, state, pending);
}

/** Phase 47B — append capped dependent steps and launch them. */
export async function _extendIterationRound(
  deps: ChainOrchestrationContext,
  state: ChainState,
  steps: import("./chain-iteration.js").ExtendStepInput[],
): Promise<{ ok: boolean; extended: boolean; error?: string }> {
  const { appendExtendSteps } = await import("./chain-iteration.js");
  const appended = appendExtendSteps(state, steps);
  if (!appended.ok) {
    return { ok: false, extended: false, error: appended.reason };
  }

  let nodeDefaults = DEFAULT_CHAIN_DEFAULTS;
  try {
    const cfg = await deps.getNodeConfig();
    nodeDefaults = mergeChainDefaults((cfg as { chainDefaults?: ChainDefaultsConfig })?.chainDefaults);
  } catch {
    /* defaults */
  }
  const awardMode =
    deps.getChainSideState().awardModes.get(state.chainId) ?? resolveAwardMode(nodeDefaults);
  // Direct keeps a backup so a silent preferred peer can failover quickly.
  const workerCap = awardMode === "direct" ? 2 : 3;
  const workersBySubtask: Record<string, string[]> = {};
  let totalWorkers = 0;
  for (const subtask of appended.subtasks) {
    const ranked = await findAgentNetworkWorkersRanked(deps, subtask.requiredSkill);
    const preferred = subtask.preferredWorkerPeerId;
    const { chosen } = await selectReadyWorkersForSubtask(
      deps,
      ranked,
      preferred,
      workerCap,
      { correlationId: state.chainId },
    );
    workersBySubtask[subtask.subtaskId] = chosen;
    if (chosen[0] && (!preferred || !chosen.includes(preferred))) {
      subtask.preferredWorkerPeerId = chosen[0];
    }
    totalWorkers += chosen.length > 0 ? 1 : 0;
  }
  if (totalWorkers === 0) {
    // Roll back appended IDs so the round can still synthesize.
    for (const s of appended.subtasks) {
      state.subtasks.delete(s.subtaskId);
      const it = state.iteration;
      if (it) {
        it.openRoundSubtaskIds = it.openRoundSubtaskIds.filter((id) => id !== s.subtaskId);
        it.extendsInRound = Math.max(0, it.extendsInRound - 1);
      }
    }
    return { ok: false, extended: false, error: "no_workers" };
  }

  const orchDeps = await buildChainOrchestratorDeps(deps);
  const launch = await launchChain(orchDeps, state, workersBySubtask);
  if (!launch.ok) {
    return { ok: false, extended: false, error: `launch failed: ${(launch as { reason: string }).reason}` };
  }
  _startChainTracking(deps, state.chainId);
  return { ok: true, extended: true };
}

/** Phase 47C — owner resolves ask_owner hold. */
export async function _resolveIterationOwner(
  deps: ChainOrchestrationContext,
  chainId: string,
  decision: "stop" | "continue",
): Promise<{ ok: boolean; published?: boolean; continued?: boolean; error?: string }> {
  const runtime = deps.getChainStore().getRuntime(chainId);
  if (!runtime) return { ok: false, error: "chain_not_found" };
  const profile = deps.getProfile();
  if (!profile) return { ok: false, error: "no_profile" };
  const { resolveIterationOwnerDecision } = await import("./chain-auto-orchestrator.js");
  const orchDeps = await buildChainOrchestratorDeps(deps);
  const result = await resolveIterationOwnerDecision(orchDeps, runtime.state, profile, decision, {
    onContinueRound: (s) => _continueIterationRound(deps, s),
  });
  _emitChainState(deps, chainId);
  if (result.published) {
    const row = await deps.getTaskStore()?.getChainReport(chainId);
    if (row?.report) _emitChainReport(deps, row.report);
  }
  return result;
}

/** Hand whole-job Assigner role to a remote eligible peer via A2A handoff. */
export async function _handoffChainGoalToAssigner(
  deps: ChainOrchestrationContext,
  input: {
    goal: string;
    chainId?: string;
    maxChainCostUsd?: number;
    costCeilingUsd?: number;
    allowLlm?: boolean;
    assignerPeerId: string;
    iterationMaxRounds?: number;
    iterationJudgeMode?: NonNullable<ChainDefaultsConfig["iterationJudgeMode"]>;
    extendMaxStepsPerRound?: number;
    iterationWire?: import("./chain-iteration.js").IterationWireBlob;
    /** Restrict worker discovery to these agent peer IDs. Empty/absent = use all. */
    preferredWorkerPeerIds?: string[];
    /** Owner-flagged criticality hint (design §8.1 #1). Absent = `"normal"`. */
    criticality?: "normal" | "high";
  },
): Promise<{
  ok: boolean;
  chainId: string;
  chainMandateId: string;
  subtasks: Array<{
    subtaskId: string;
    depth: number;
    requiredSkill: string;
    objective: string;
    preferredWorkerPeerId?: string;
  }>;
  error?: string;
  assignerPeerId?: string;
  handedOff?: boolean;
}> {
  const chainId = input.chainId ?? `chain_${randomUUID()}`;
  const eligible = await findAgentNetworkWorkers(deps, "task.execute");
  if (!eligible.includes(input.assignerPeerId)) {
    return {
      ok: false,
      chainId,
      chainMandateId: "",
      subtasks: [],
      error: "assigner_not_eligible",
      assignerPeerId: input.assignerPeerId,
    };
  }
  const cards = await deps.listAgentCards();
  const card = cards.find((c) => c.sourceAgentPeerId === input.assignerPeerId);
  if (!card?.ownerId) {
    return {
      ok: false,
      chainId,
      chainMandateId: "",
      subtasks: [],
      error: "assigner_unknown",
      assignerPeerId: input.assignerPeerId,
    };
  }

  let nodeDefaults = DEFAULT_CHAIN_DEFAULTS;
  try {
    const cfg = await deps.getNodeConfig();
    nodeDefaults = mergeChainDefaults((cfg as { chainDefaults?: ChainDefaultsConfig })?.chainDefaults);
  } catch {
    /* defaults */
  }
  const iterationMaxRounds = Math.max(
    1,
    Math.floor(input.iterationMaxRounds ?? nodeDefaults.iterationMaxRounds ?? 1),
  );
  const extendMaxStepsPerRound = Math.max(
    0,
    Math.floor(input.extendMaxStepsPerRound ?? nodeDefaults.extendMaxStepsPerRound ?? 2),
  );
  const iterationJudgeMode =
    input.iterationJudgeMode ?? nodeDefaults.iterationJudgeMode ?? "llm";

  const now = new Date();
  const payload = ChainHandoffRequestPayloadSchema.parse({
    chainId,
    subtaskIds: [],
    newOrchestratorPeerId: input.assignerPeerId,
    newOrchestratorOwnerId: card.ownerId,
    goal: input.goal,
    maxChainCostUsd: input.maxChainCostUsd,
    costCeilingUsd: input.costCeilingUsd,
    allowLlm: input.allowLlm,
    rationale: "assigner_handoff",
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    createdAt: now.toISOString(),
    iterationMaxRounds,
    iterationJudgeMode,
    extendMaxStepsPerRound,
    iterationState: input.iterationWire,
    preferredWorkerPeerIds: input.preferredWorkerPeerIds,
    criticality: input.criticality,
  });

  const orchDeps = await buildChainOrchestratorDeps(deps);
  const sent = await sendChainHandoff(orchDeps, input.assignerPeerId, payload);
  deps.getChainSideState().goals.set(chainId, input.goal);
  orchDeps.audit.record({
    type: sent ? "chain.handoff.request_received" : "chain.mandate_broadcast",
    outcome: sent ? "allow" : "deny",
    intent: "task.chain.handoff",
    remotePeerId: input.assignerPeerId,
    correlationId: chainId,
    summary: sent
      ? `assigner_handoff_sent to=${input.assignerPeerId} iterationMaxRounds=${iterationMaxRounds}`
      : `assigner_handoff_send_failed to=${input.assignerPeerId}`,
  });

  if (!sent) {
    return {
      ok: false,
      chainId,
      chainMandateId: "",
      subtasks: [],
      error: "handoff_send_failed",
      assignerPeerId: input.assignerPeerId,
    };
  }

  return {
    ok: true,
    chainId,
    chainMandateId: "",
    subtasks: [],
    assignerPeerId: input.assignerPeerId,
    handedOff: true,
  };
}

/* ---------- audit ---------- */

export async function _appendChainAudit(
  deps: ChainOrchestrationContext,
  event: {
    type: AuditEventType;
    outcome: "allow" | "deny" | "record";
    intent: string;
    remotePeerId?: string;
    correlationId?: string;
    summary?: string;
  },
): Promise<void> {
  const taskStore = deps.getTaskStore();
  if (!taskStore) return;
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: event.type,
      intent: event.intent as EnvoyIntent,
      correlationId: event.correlationId,
      remotePeerId: event.remotePeerId,
      direction: "outbound",
      verificationStatus: "verified",
      outcome: event.outcome,
      summary: event.summary ?? event.type,
      createdAt: new Date().toISOString(),
    }),
  );
}
