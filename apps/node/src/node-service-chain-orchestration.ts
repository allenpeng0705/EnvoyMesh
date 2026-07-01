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
import { createApprovalItem } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
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
  trackChain,
  type ChainOrchestratorHandlerDeps,
  type ChainState,
} from "./chain-orchestrator.js";
import {
  chainBudgetWarningLevel,
  subtasksAwaitingAward,
  tryCompleteChainIfReady,
} from "./chain-auto-orchestrator.js";
import {
  CHAIN_AUTO_EVALUATE_MS,
  DEFAULT_CHAIN_DEFAULTS,
  estimateChainCostRange,
  mergeChainDefaults,
} from "./chain-defaults.js";
import { CapabilityIndex } from "./capability-index.js";
import {
  extractChainIdFromEnvelope,
  sendChainEnvelopeOverMesh,
  type ChainTransportResolver,
} from "./chain-production.js";
import { dispatchChainEnvelope } from "./chain-inbound.js";
import type { ChainInboundDeps } from "./chain-inbound-types.js";
import {
  handleWorkerAccept,
  handleWorkerCancel,
  handleWorkerHeartbeat,
  handleWorkerMandate,
  handleWorkerPropose,
  type ChainWorkerHandlerDeps,
} from "./chain-worker.js";
import { executeAcceptedSubtask } from "./chain-worker-executor.js";
import { requiresChainAwardApproval } from "./chain-sensitivity-gate.js";
import type { BridgeIdentity } from "./bridge/pipe.js";
import type { MeshToolContext } from "./tool-registry.js";
import { type ChainContext, type ChainStore } from "./node-service-chains.js";

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
}

export interface ChainOrchestrationContext {
  getChainStore(): ChainStore;
  getChainSideState(): ChainSideState;
  getTaskStore(): LocalTaskStore | undefined;
  getProfile(): NodeProfile | undefined;
  getApprovalQueue(): ApprovalQueue | null;
  getCapabilityIndex(): CapabilityIndex;
  getCapabilityIndexReady(): Promise<void> | null;
  getPeerDirectoryStore(): LocalPeerDirectoryStore;
  getReachableMesh(): EnvoyMesh | undefined;
  ensureAgentIdentity(): Promise<BridgeIdentity | null>;
  listAgentCards(): Promise<CachedAgentCardSummary[]>;
  getLocalManifestCapabilities(): Promise<string[]>;
  getToolExecutionContext(): Promise<MeshToolContext | null>;
  getBonds(): Promise<BondRecord[]>;
  getNodeConfig(): Promise<unknown>;
  updateNodeConfig(cfg: unknown): Promise<void>;
  emit<K extends keyof NodeServiceEvents>(event: K, data: NodeServiceEvents[K]): void;
}

export function buildChainOrchestrationContext(host: any): ChainOrchestrationContext {
  return {
    getChainStore: () => host._chainStore,
    getChainSideState: () => host._chainState,
    getTaskStore: () => host._taskStore,
    getProfile: () => host._profile,
    getApprovalQueue: () => host._approvalQueue,
    getCapabilityIndex: () => host._capabilityIndex,
    getCapabilityIndexReady: () => host._capabilityIndexReady,
    getPeerDirectoryStore: () => host._peerDirectoryStore,
    getReachableMesh: () => host._reachableMesh(),
    ensureAgentIdentity: () => host._ensureAgentIdentity(),
    listAgentCards: () => host.listAgentCards(),
    getLocalManifestCapabilities: () => host._localManifestCapabilities(),
    getToolExecutionContext: () => host.getToolExecutionContext(),
    getBonds: () => host.getBonds(),
    getNodeConfig: () => host.getNodeConfig(),
    updateNodeConfig: (cfg) => host.updateNodeConfig(cfg),
    emit: (event, data) => host.emit(event, data),
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
    findCapabilityProviders: (capability) => findCapabilityProviders(deps, capability) as never,
    chainDiagnosticsForSubtasks: (subtasks, workersBySubtask) =>
      _chainDiagnosticsForSubtasks(subtasks as never, workersBySubtask as never) as never,
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

export async function refreshCapabilityIndex(deps: ChainOrchestrationContext): Promise<void> {
  const ready = deps.getCapabilityIndexReady();
  if (ready) {
    await ready;
  }
  const cards = await deps.listAgentCards();
  const index = deps.getCapabilityIndex();
  for (const card of cards) {
    const peerId = card.sourceAgentPeerId;
    if (!peerId) continue;
    index.indexWorker({
      peerId,
      ownerId: card.ownerId,
      capabilities: card.capabilities,
      lastSeenAt: card.cachedAt,
      displayName: card.displayName,
    });
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
  for (const card of await deps.listAgentCards()) {
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
          void tryCompleteChainIfReady(orchDeps, runtime.state, profile).then(async (done) => {
            if (done.published) {
              _emitChainState(deps, state.chainId);
              const row = await deps.getTaskStore()?.getChainReport(state.chainId);
              if (row?.report) _emitChainReport(deps, row.report);
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
    timeoutMs: 30_000,
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
    findWorkers: async (capability) => findCapabilityProviders(deps, capability),
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

export async function findCapabilityProviders(deps: ChainOrchestrationContext, capability: string): Promise<string[]> {
  const ready = deps.getCapabilityIndexReady();
  if (ready) {
    await ready;
  }
  const indexed = deps.getCapabilityIndex().findWorkers(capability);
  if (indexed.length > 0) {
    return indexed;
  }
  const cards = await deps.listAgentCards();
  const peers: string[] = [];
  for (const card of cards) {
    if (!card.sourceAgentPeerId) continue;
    if (card.capabilities.includes(capability) || card.capabilities.includes("task.execute")) {
      peers.push(card.sourceAgentPeerId);
    }
  }
  return peers;
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
    policy?: "composite" | "cheapest" | "fastest";
    pickWorkerPeerId?: string;
    skipSensitivityGate?: boolean;
  },
): Promise<Awaited<ReturnType<typeof evaluateBids>>> {
  const runtime = deps.getChainStore().getRuntime(chainId);
  if (!runtime) return { ok: false, reason: "no_bids" };
  const orchDeps = await buildChainOrchestratorDeps(deps);
  const result = await evaluateBids(orchDeps, runtime.state, {
    subtaskId,
    policy: opts?.policy ?? "composite",
    pickWorkerPeerId: opts?.pickWorkerPeerId,
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
  state.budgetWarningLevel = chainBudgetWarningLevel(runtime.state);
  deps.emit("chain:state", state);
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
  const timer = setTimeout(() => {
    timers.delete(key);
    void _autoEvaluateSubtask(deps, chainId, subtaskId);
  }, CHAIN_AUTO_EVALUATE_MS);
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
  subtasks: Array<{ subtaskId: string; requiredCapability: string }>,
  workersBySubtask: Record<string, string[]>,
): string[] {
  const diagnostics: string[] = [];
  for (const subtask of subtasks) {
    const workers = workersBySubtask[subtask.subtaskId] ?? [];
    if (workers.length === 0) {
      diagnostics.push(
        `No workers for \`${subtask.requiredCapability}\` — ask a bonded contact to enable Capability Provider.`,
      );
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
  },
): Promise<{
  ok: boolean;
  chainId: string;
  chainMandateId: string;
  subtasks: Array<{ subtaskId: string; depth: number; requiredCapability: string; objective: string }>;
  error?: string;
}> {
  const chainId = input.chainId ?? `chain_${randomUUID()}`;
  const chainMandateId = `chainmandate_${randomUUID()}`;
  const orchestratorOwnerId = deps.getProfile()?.owner.ownerId ?? "envoy:owner:placeholder";
  let nodeDefaults = DEFAULT_CHAIN_DEFAULTS;
  try {
    const cfg = await deps.getNodeConfig();
    nodeDefaults = mergeChainDefaults((cfg as { chainDefaults?: ChainDefaultsConfig })?.chainDefaults);
  } catch {
    /* use production defaults */
  }
  const mandate = {
    version: "0.1" as const,
    chainMandateId,
    chainId,
    issuerOwnerId: orchestratorOwnerId,
    orchestratorOwnerId,
    maxChainCostUsd: input.maxChainCostUsd ?? 10,
    costCeilingUsd: input.costCeilingUsd ?? 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public" as const,
    deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    rebalancePolicy: nodeDefaults.rebalancePolicy ?? "auto",
    maxAutoRebalances: nodeDefaults.maxAutoRebalances ?? 2,
    autoRebalanceIncrementUsd: nodeDefaults.autoRebalanceIncrementUsd ?? 5,
    signature: "stub",
  };
  const state = createChainState(mandate);
  const chainSide = deps.getChainSideState();
  chainSide.goals.set(chainId, input.goal);
  deps.getChainStore().setRuntime(chainId, {
    state,
    bidStrategy: { baseCostUsd: 1, capabilityLocalEtaMs: 60_000, reputationDiscount: 1, etaSlackMs: 60_000 },
  });

  const plan = await planChain(await buildChainOrchestratorDeps(deps), state, input.goal, {
    allowLlm: input.allowLlm ?? nodeDefaults.allowLlmDecompose ?? false,
  });
  if (!plan.ok) {
    return { ok: false, chainId, chainMandateId, subtasks: [], error: `plan failed: ${(plan as { reason: string }).reason}` };
  }

  const workersBySubtask: Record<string, string[]> = {};
  let maxWorkers = 0;
  for (const subtask of plan.subtasks) {
    const candidates = await findCapabilityProviders(deps, subtask.requiredCapability);
    workersBySubtask[subtask.subtaskId] = candidates.slice(0, 3);
    maxWorkers = Math.max(maxWorkers, candidates.length);
  }
  chainSide.costEstimates.set(
    chainId,
    estimateChainCostRange({
      subtaskCount: plan.subtasks.length,
      workerCandidateCount: maxWorkers,
      maxChainCostUsd: mandate.maxChainCostUsd,
    }),
  );

  const launch = await launchChain(await buildChainOrchestratorDeps(deps), state, workersBySubtask);
  if (!launch.ok) {
    return {
      ok: false,
      chainId,
      chainMandateId,
      subtasks: plan.subtasks.map((s) => ({
        subtaskId: s.subtaskId,
        depth: s.depth,
        requiredCapability: s.requiredCapability,
        objective: s.objective,
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
      requiredCapability: s.requiredCapability,
      objective: s.objective,
    })),
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
