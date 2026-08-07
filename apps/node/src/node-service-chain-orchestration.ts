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
  NodeProfile,
  NodeServiceEvents,
} from "@envoymesh/api";
import type { ChainReport, ChainSubtask, ChainSubtaskBid, EnvoyEnvelope, EnvoyIntent } from "@envoymesh/protocol";
import { ChainHandoffRequestPayloadSchema } from "@envoymesh/protocol";
import { createApprovalItem, isAgentNetworkMember, rankWorkersByScore, scoreAgentNetworkWorker } from "@envoymesh/api";
import { hasDirectPrivateLanDialHints, type EnvoyMesh } from "@envoymesh/network";
import {
  chainStateSnapshot,
  createChainState,
  evaluateBids,
  handleOrchestratorBid,
  handleOrchestratorHeartbeat,
  handleOrchestratorMerge,
  handleOrchestratorPartial,
  launchChain,
  planChain,
  sendChainAccept,
  sendChainHandoff,
  trackChain,
  type ChainOrchestratorHandlerDeps,
  type ChainState,
} from "./chain-orchestrator.js";
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
  resolveAwardMode,
  resolveShowCostUi,
} from "./chain-defaults.js";
import { AgentNetworkMembershipIndex } from "./capability-index.js";
import {
  extractChainIdFromEnvelope,
  sendChainEnvelopeOverMesh,
  type ChainTransportResolver,
} from "./chain-production.js";
import { dispatchChainEnvelope } from "./chain-inbound.js";
import type { ChainInboundDeps } from "./chain-inbound-types.js";
import { applyArbitration, createArbitrationStore, type ArbitrationStore } from "./chain-arbitration.js";
import { signCanonicalPayload } from "@envoymesh/identity";
import {
  handleWorkerAccept,
  handleWorkerCancel,
  handleWorkerHeartbeat,
  handleWorkerMandate,
  handleWorkerPropose,
  type ChainWorkerHandlerDeps,
} from "./chain-worker.js";
import { createOpenClawChainSubtaskExecutor, executeAcceptedSubtask } from "./chain-worker-executor.js";
import { requiresChainAwardApproval } from "./chain-sensitivity-gate.js";
import type { BridgeIdentity } from "./bridge/pipe.js";
import type { MeshToolContext } from "./tool-registry.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";
import { type ChainContext, type ChainRankedWorker, type ChainStore } from "./node-service-chains.js";

/* ---------- context ---------- */

export interface ChainSideState {
  pendingBidExpirations: Map<string, string>;
  trackAbort: Map<string, AbortController>;
  workerSubtasks: Map<
    string,
    {
      subtask: ChainSubtask;
      orchestratorPeerId: string;
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
  emit<K extends keyof NodeServiceEvents>(event: K, data: NodeServiceEvents[K]): void;
  /** Built-in OpenClaw readiness for Agent Network worker execution. */
  isOpenClawReady(): boolean;
  /** Ask Built-in OpenClaw (default AN worker engine). */
  askOpenClaw(prompt: string): Promise<string>;
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
    emit: (event, data) => host.emit(event, data),
    isOpenClawReady: () => Boolean(host.isOpenClawReady?.()),
    askOpenClaw: (prompt) => host.askOpenClaw(prompt),
  };
}

/* ---------- ChainContext factory ---------- */

export function buildChainContext(deps: ChainOrchestrationContext): ChainContext {
  const taskStore = deps.getTaskStore();
  return {
    store: deps.getChainStore(),
    hasTaskStore: () => Boolean(taskStore),
    listChainReports: (params?: ChainListReportsParams) =>
      taskStore!.listChainReports(params) as never,
    getChainReport: (chainId) => taskStore!.getChainReport(chainId) as never,
    pinChainReport: (chainId, pinned) => taskStore!.pinChainReport(chainId, pinned),
    getChainGoal: (chainId) => deps.getChainSideState().goals.get(chainId),
    getChainCostEstimate: (chainId) => deps.getChainSideState().costEstimates.get(chainId),
    getChainAwardMode: (chainId) => deps.getChainSideState().awardModes.get(chainId),
    getChainShowCostUi: (chainId) => deps.getChainSideState().showCostUi.get(chainId),
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
    findAgentNetworkWorkersRanked: (capability, preferredWorkerPeerIds) =>
      findAgentNetworkWorkersRanked(deps, capability, preferredWorkerPeerIds) as never,
    chainDiagnosticsForSubtasks: (subtasks, workersBySubtask, rankedBySubtask) =>
      _chainDiagnosticsForSubtasks(subtasks as never, workersBySubtask as never, rankedBySubtask) as never,
    runChainGoal: (params) => _runChainGoal(deps, params) as never,
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
  const inboundDeps = await buildChainInboundDeps(deps);
  const decision = await dispatchChainEnvelope(inboundDeps, envelope, inboundState);
  if (!decision.ok) {
    console.warn(`[chain.inbound] rejected ${envelope.intent}: ${decision.reason}`);
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
  for (const card of cards) {
    const peerId = card.sourceAgentPeerId;
    if (!peerId) continue;
    // Private by default: only index peers that opted into Agent Network work.
    if (!isAgentNetworkMember(card.membership)) {
      index.removeWorker(peerId);
      continue;
    }
    seen.add(peerId);
    index.indexWorker({
      peerId,
      ownerId: card.ownerId,
      membership: card.membership,
      lastSeenAt: card.cachedAt,
      displayName: card.displayName,
    });
  }
  // Drop stale index rows whose cards no longer opt in (or were removed).
  for (const worker of index.listWorkers()) {
    if (!seen.has(worker.peerId)) {
      index.removeWorker(worker.peerId);
    }
  }
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
      });
      return handleWorkerPropose(workerDeps, envelope, payload);
    },
    handleWorkerMandate: (envelope, payload) => handleWorkerMandate(workerDeps, envelope, payload),
    handleWorkerAccept: async (envelope, payload) => {
      const result = await handleWorkerAccept(workerDeps, envelope, payload);
      if (result.ok) {
        let subtask = chainSide.workerSubtasks.get(payload.award.subtaskId)?.subtask;
        if (!subtask) {
          for (const rt of chainStore.listActive()) {
            subtask = rt.state.subtasks.get(payload.award.subtaskId);
            if (subtask) break;
          }
        }
        if (subtask) {
          void executeAcceptedSubtask(
            workerDeps,
            { getToolContext: () => deps.getToolExecutionContext() },
            envelope.senderPeerId,
            subtask,
          ).catch((err) => console.warn("[chain.worker] execute failed:", err));
        }
      }
      return result;
    },
    handleWorkerCancel: (envelope, payload) => handleWorkerCancel(workerDeps, envelope, payload),
    handleWorkerHeartbeat: (envelope, payload) => handleWorkerHeartbeat(workerDeps, envelope, payload),
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
    // Default AN worker engine = Built-in OpenClaw (docs/agent-network-engine.md).
    isAgentNetworkEngineReady: () => deps.isOpenClawReady(),
    executeSubtask: createOpenClawChainSubtaskExecutor({
      workerPeerId: agentIdentity.agentPeerId,
      isOpenClawReady: () => deps.isOpenClawReady(),
      askOpenClaw: (prompt) => deps.askOpenClaw(prompt),
    }),
  };
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
  const decomposer = createLlmDecomposer({
    providers,
    audit: { record: () => undefined },
    // Match Social `chainPreviewGoal` / `chainPlan` RPC budget (120s).
    timeoutMs: 120_000,
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
        };
      });
    },
  });
  return async (goal: string) => decomposer(goal);
}

async function buildLlmMergeAsync(
  deps: ChainOrchestrationContext,
): Promise<ChainOrchestratorHandlerDeps["llmMerge"] | undefined> {
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

  const { createLlmMergeAdapter } = await import("./chain-llm.js");
  const llmProvider = {
    complete: async (params: { systemPrompt: string; userPrompt: string; maxTokens?: number }) => {
      const result = await routeModelRequest(
        {
          taskType: "chain.merge",
          prompt: `${params.systemPrompt}\n\n${params.userPrompt}`,
          sensitivity: "public",
          ownerApproved: true,
        },
        providers,
      );
      if (result.decision.action === "deny" || !result.response) {
        throw new Error("LLM merge denied");
      }
      return {
        text: result.response.text,
        usage: {
          promptTokens: result.response.usage?.inputTokens ?? 0,
          completionTokens: result.response.usage?.outputTokens ?? 0,
        },
      };
    },
  };
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
    now: () => new Date(),
    signingKeyPem: agentIdentity.agentPrivateKeyPem,
    publicKeyPem: agentIdentity.agentPublicKeyPem,
    orchestratorPeerId: agentIdentity.agentPeerId,
    orchestratorOwnerId: profile.owner.ownerId,
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
  };
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

/** Ranked workers with human-readable score summaries for diagnostics / UI. */
export async function findAgentNetworkWorkersRanked(
  deps: ChainOrchestrationContext,
  capability: string,
  preferredWorkerPeerIds?: readonly string[],
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

  const scored: ChainRankedWorker[] = peerList.map((peerId) => {
    const card = byPeer.get(peerId);
    const isSelf = selfPeerId !== undefined && peerId === selfPeerId;
    const sameLan = sameLanByPeer.get(peerId) === true || isSelf;
    const transportId = transportByAgentPeer.get(peerId);
    // Local agent is "online" for ranking only when Built-in OpenClaw (AN engine) is ready.
    const online =
      isSelf
        ? deps.isOpenClawReady?.() !== false
        : Boolean(transportId);
    const viaRelay = !isSelf && online && transportId ? circuitIds.has(transportId) : false;
    const result = scoreAgentNetworkWorker({
      requiredSkill: capability,
      membership: card?.membership ?? [],
      profile: card?.agentNetworkProfile,
      displayName: card?.displayName,
      sameLan,
    });
    return { peerId, score: result.score, summary: result.summary, sameLan, online, viaRelay };
  });
  const filtered =
    preferredWorkerPeerIds && preferredWorkerPeerIds.length > 0
      ? scored.filter((w) => preferredWorkerPeerIds.includes(w.peerId))
      : scored;
  // Online first, then specialty score. Local/"You" is not forced to the front —
  // ranking stays skill-honest for diagnostics, suggestedWorkers, and assign.
  return rankWorkersByScore(filtered).sort((a, b) => {
    const aOnline = a.online ? 1 : 0;
    const bOnline = b.online ? 1 : 0;
    if (aOnline !== bOnline) return bOnline - aOnline;
    if (b.score !== a.score) return b.score - a.score;
    return a.peerId.localeCompare(b.peerId);
  });
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
      if (rt.state.awards.size === 0) {
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      try {
        const orchDeps = await buildChainOrchestratorDeps(deps);
        await trackChain(orchDeps, rt.state, { tickMs: 30_000, maxTicks: 1 });
      } catch (err) {
        console.warn(`[chain.track] ${chainId} tick failed:`, err);
      }
      await new Promise((r) => setTimeout(r, 30_000));
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
): Promise<Awaited<ReturnType<typeof evaluateBids>>> {
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

  await sendChainAccept(orchDeps, result.bid.workerPeerId, result.award);
  orchDeps.audit.record({
    type: "chain.awarded",
    outcome: "allow",
    intent: "task.chain.accept",
    correlationId: chainId,
    summary: `subtask=${subtaskId} worker=${result.bid.workerPeerId} cost=${result.bid.proposedCostUsd}`,
  });
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
  populateIterationInState(runtime, state);
  deps.emit("chain:state", state);
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
  const result = await _evaluateAwardAndAccept(deps, chainId, subtaskId, { policy: "composite" });
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
    // Prefer the plan+assign assignee only when online; else best reachable.
    const preferred = subtask.preferredWorkerPeerId
      ? ranked.find((r) => r.peerId === subtask.preferredWorkerPeerId && r.online !== false)
      : undefined;
    const pick = preferred ?? byReachability[0];
    if (pick) {
      diagnostics.push(`Selected for \`${subtask.requiredSkill}\`: ${pick.summary}`);
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
    /** Phase 47 — override node `iterationMaxRounds`. */
    iterationMaxRounds?: number;
    /** Phase 47D — handoff / override judge mode. */
    iterationJudgeMode?: NonNullable<ChainDefaultsConfig["iterationJudgeMode"]>;
    extendMaxStepsPerRound?: number;
    /** Phase 47D — rehydrate mid-job iteration after Assigner handoff. */
    iterationWire?: import("./chain-iteration.js").IterationWireBlob;
    /** Restrict worker discovery to these agent peer IDs. Empty/absent = use all. */
    preferredWorkerPeerIds?: string[];
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
  const assignerPeerId = input.assignerPeerId?.trim();
  if (assignerPeerId) {
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
      });
    }
  }

  const chainId = input.chainId ?? `chain_${randomUUID()}`;
  const chainMandateId = `chainmandate_${randomUUID()}`;
  const ownerProfile = deps.getProfile();
  const orchestratorOwnerId = ownerProfile?.owner.ownerId ?? "envoy:owner:placeholder";
  const ownerPrivateKeyPem = ownerProfile?.owner.privateKeyPem;
  let nodeDefaults = DEFAULT_CHAIN_DEFAULTS;
  try {
    const cfg = await deps.getNodeConfig();
    nodeDefaults = mergeChainDefaults((cfg as { chainDefaults?: ChainDefaultsConfig })?.chainDefaults);
  } catch {
    /* use production defaults */
  }
  const awardMode = resolveAwardMode(nodeDefaults);
  const showCostUi = resolveShowCostUi(nodeDefaults);
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
    },
    ownerPrivateKeyPem,
  );
  const state = createChainState(mandate);
  const chainSide = deps.getChainSideState();
  chainSide.goals.set(chainId, input.goal);
  chainSide.awardModes.set(chainId, awardMode);
  chainSide.showCostUi.set(chainId, showCostUi);
  deps.getChainStore().setRuntime(chainId, {
    state,
    bidStrategy: {
      baseCostUsd: awardMode === "direct" ? 0 : 1,
      capabilityLocalEtaMs: 60_000,
      reputationDiscount: 1,
      etaSlackMs: 60_000,
    },
  });

  const plan = await planChain(await buildChainOrchestratorDeps(deps), state, input.goal, {
    allowLlm: input.allowLlm ?? nodeDefaults.allowLlmDecompose ?? false,
  });
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
  const workerCap = awardMode === "direct" ? 1 : 3;
  for (const subtask of plan.subtasks) {
    const ranked = await findAgentNetworkWorkersRanked(deps, subtask.requiredSkill, input.preferredWorkerPeerIds);
    rankedBySubtask[subtask.subtaskId] = ranked;
    const candidates = ranked.map((r) => r.peerId);
    // Named assignee from plan+assign wins (direct dispatch). Keep up to 2
    // backups in the worker list for stall re-assign (launch proposes primary only).
    const preferred = subtask.preferredWorkerPeerId;
    let chosen: string[];
    if (preferred && candidates.includes(preferred)) {
      chosen = [preferred, ...candidates.filter((c) => c !== preferred)].slice(0, Math.max(workerCap, 3));
    } else if (preferred && candidates.length === 0) {
      // Prefer still listed even if ranking missed (should be rare).
      chosen = [preferred];
    } else if (candidates.length === 1) {
      chosen = candidates;
    } else {
      chosen = candidates.slice(0, workerCap);
      // If preferred was invalid, still ensure every step gets someone.
      if (chosen.length === 0 && ranked.length > 0) chosen = [ranked[0]!.peerId];
    }
    workersBySubtask[subtask.subtaskId] = chosen;
    maxWorkers = Math.max(maxWorkers, candidates.length);
    totalWorkers += chosen.length > 0 ? 1 : 0;
  }
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
  const awardMode =
    deps.getChainSideState().awardModes.get(state.chainId) ?? resolveAwardMode(nodeDefaults);
  const workerCap = awardMode === "direct" ? 1 : 3;
  const replanGoal = iterationReplanGoal(state);
  const orchDeps = await buildChainOrchestratorDeps(deps);
  const plan = await planChain(orchDeps, state, replanGoal, {
    allowLlm: nodeDefaults.allowLlmDecompose ?? true,
  });
  if (!plan.ok || plan.subtasks.length === 0) {
    return { ok: false, error: `replan failed: ${!plan.ok ? (plan as { reason: string }).reason : "empty"}` };
  }

  const workersBySubtask: Record<string, string[]> = {};
  let totalWorkers = 0;
  for (const subtask of plan.subtasks) {
    const ranked = await findAgentNetworkWorkersRanked(deps, subtask.requiredSkill);
    const candidates = ranked.map((r) => r.peerId);
    const preferred = subtask.preferredWorkerPeerId;
    let chosen: string[];
    if (preferred && candidates.includes(preferred)) {
      chosen = [preferred, ...candidates.filter((c) => c !== preferred)].slice(0, Math.max(workerCap, 3));
    } else if (preferred && candidates.length === 0) {
      chosen = [preferred];
    } else {
      chosen = candidates.slice(0, workerCap);
      if (chosen.length === 0 && ranked.length > 0) chosen = [ranked[0]!.peerId];
    }
    workersBySubtask[subtask.subtaskId] = chosen;
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
  const workerCap = awardMode === "direct" ? 1 : 3;
  const workersBySubtask: Record<string, string[]> = {};
  let totalWorkers = 0;
  for (const subtask of appended.subtasks) {
    const ranked = await findAgentNetworkWorkersRanked(deps, subtask.requiredSkill);
    const candidates = ranked.map((r) => r.peerId);
    const preferred = subtask.preferredWorkerPeerId;
    let chosen: string[];
    if (preferred && candidates.includes(preferred)) {
      chosen = [preferred, ...candidates.filter((c) => c !== preferred)].slice(0, Math.max(workerCap, 3));
    } else if (preferred && candidates.length === 0) {
      chosen = [preferred];
    } else {
      chosen = candidates.slice(0, workerCap);
      if (chosen.length === 0 && ranked.length > 0) chosen = [ranked[0]!.peerId];
    }
    workersBySubtask[subtask.subtaskId] = chosen;
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
