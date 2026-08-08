/**
 * Phase 40 — Chain orchestrator (the centerpiece of the runtime).
 *
 * Owns the per-chain state machine:
 *   planChain → launchChain → evaluateBids → trackChain (heartbeat) →
 *   synthesizeChain → publishChainReport
 *
 * **Multi-round negotiation:** `evaluateBids` supports up to 3 rounds
 * (`negotiationRound` ∈ {1, 2, 3}). On each round the orchestrator may:
 *   - award a single worker (default round-1 behavior)
 *   - reject all bids and re-propose (rare, reserved for failure recovery)
 *   - wait for owner review (round-3 with no acceptable bids)
 *
 * **Mandatory cancel-before-accept ordering:** every `handleOrchestratorAccept`
 * MUST check whether the chain (or specific subtask) has been cancelled
 * before sending `task.chain.accept` to a worker. Cancelling first means the
 * worker can safely ignore a late award without re-awarding the subtask.
 *
 * **Trust gating:** workers must be `direct` trust or above to bid on a chain
 * proposal; orchestrators must be `referred` trust or above to send
 * task.chain.mandate. The runtime trust gate is enforced in `chain-inbound.ts`
 * (via the role-policy table); this module assumes the inbound gate already
 * validated the trust tier.
 *
 * See docs/agent_network.md §7.2 for the full state machine and §7.5 for the
 * budget integration.
 */

import {
  CHAIN_ACCEPT_RESEND_CAP,
  CHAIN_ACCEPT_RESEND_WAIT_MS,
  CHAIN_BID_WAIT_MS,
  CHAIN_PROPOSE_RETRY_CAP,
} from "./chain-defaults.js";
import {
  ChainHandoffRequestPayloadSchema,
  ChainMandateSignedSchema,
  ChainSubtaskSchema,
  TaskChainAcceptPayloadSchema,
  TaskChainCancelPayloadSchema,
  TaskChainHeartbeatPayloadSchema,
  TaskChainMandatePayloadSchema,
  TaskChainMergePayloadSchema,
  TaskChainProposePayloadSchema,
  TaskChainReportPayloadSchema,
  TaskChainStatusPayloadSchema,
  UnsignedChainMandateSchema,
  type ChainHandoffRequestPayload,
  type ChainMandate,
  type ChainSubtask,
  type ChainSubtaskAward,
  type ChainSubtaskBid,
  type EnvoyEnvelope,
  type TaskChainAcceptPayload,
  type TaskChainBidPayload,
  type TaskChainCancelPayload,
  type TaskChainHeartbeatPayload,
  type TaskChainStatusPayload,
  type TaskChainMandatePayload,
  type TaskChainMergePayload,
  type TaskChainPartialPayload,
  type TaskChainProposePayload,
  type TaskChainReportPayload,
} from "@envoymesh/protocol";

import { signCanonicalPayload } from "@envoymesh/identity";

import {
  type ChainBudgetLedger,
  createChainBudgetLedger,
} from "./chain-budget-ledger.js";
import {
  synthesizeChainReport,
  type AggregationKind,
  type SynthesizeChainReportResult,
  type WorkerContribution,
} from "./chain-report-synthesizer.js";
import type { ChainAuditSink, ChainInboundDecision } from "./chain-inbound-types.js";
import { chainLog, shortPeerId } from "./chain-debug.js";

// ---------------------------------------------------------------------------
// Outbound send surface — what the orchestrator needs from the runtime
// ---------------------------------------------------------------------------

export interface ChainOrchestratorSendDeps {
  /**
   * Send a signed envelope to the recipient peer. Returns false on send failure.
   * The runtime should handle retries; the orchestrator does not retry itself.
   */
  sendEnvelope: (
    peerId: string,
    envelope: EnvoyEnvelope,
    payload: unknown,
  ) => Promise<boolean>;
  /** Resolve a capability tag to a list of worker peer ids. */
  findWorkers: (capability: string) => Promise<string[]>;
  /** Fetch the worker-claimed cost (in USD) for a single bid (already validated). */
  fetchWorkerCostHint?: (workerPeerId: string, capability: string) => number;
  /** Current "now" — overridable in tests. */
  now?: () => Date;
  /** Local orchestrator signing key (PEM). */
  signingKeyPem: string;
  /** Local orchestrator public key (PEM). */
  publicKeyPem: string;
  /** Local orchestrator peer id. */
  orchestratorPeerId: string;
  /** Local orchestrator owner id. */
  orchestratorOwnerId: string;
}

// ---------------------------------------------------------------------------
// Inbound handler deps — what the orchestrator needs from the runtime to
// dispatch inbound chain envelopes on its side (the orchestrator IS the
// recipient of task.chain.bid, task.chain.partial, task.chain.heartbeat).
// ---------------------------------------------------------------------------

export interface ChainOrchestratorHandlerDeps extends ChainOrchestratorSendDeps {
  audit: ChainAuditSink;
  /** Persistent store used for chain reports (atomic JSONL). */
  storeChainReport: (report: TaskChainReportPayload["report"]) => Promise<void>;
  /** Optional LLM-driven decomposition (used by planChain when stepCount > 3). */
  llmDecompose?: (goal: string) => Promise<{ ok: true; steps: ChainSubtask[] } | { ok: false; reason: string }>;
  /** Optional LLM merge for `merge_structured` synthesis. */
  llmMerge?: (input: { contributions: WorkerContribution[] }) => Promise<
    { ok: true; mergedJson: Record<string, unknown>; costUsd: number } | { ok: false; reason: string }
  >;
  /** Default heartbeat interval in ms. Default 30_000. */
  heartbeatIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Per-chain state
// ---------------------------------------------------------------------------

export interface ChainState {
  chainId: string;
  chainMandate: ChainMandate;
  subtasks: Map<string, ChainSubtask>;
  /** Latest bid per (subtaskId, workerPeerId). */
  bids: Map<string, ChainSubtaskBid>;
  /** Worker peer id selected for each subtask. */
  awards: Map<string, ChainSubtaskAward>;
  /** Latest partial per (subtaskId, workerPeerId) (used for synthesis). */
  partials: Map<string, TaskChainPartialPayload>;
  /** Set of cancelled subtask ids (cancel MUST be sent before accept). */
  cancelledSubtasks: Set<string>;
  ledger: ChainBudgetLedger;
  /** Tracks how many rounds we've gone through for a subtask. */
  negotiationRounds: Map<string, number>;
  /**
   * Worker peer-ids targeted for each subtask. Populated by `launchChain` so
   * subsequent rebroadcasts (e.g. `counterBid`) know which workers to re-propose
   * to without the caller having to track this externally.
   */
  workersBySubtask: Map<string, string[]>;
  /**
   * Subtasks that have already been proposed on the wire. Dependents stay out
   * until parents produce a final partial (dependency-aware schedule).
   */
  proposedSubtasks: Set<string>;
  /** Epoch ms when each subtask was last proposed (bidding-phase watchdog). */
  proposedAt: Map<string, number>;
  /** Re-propose attempts while stuck with zero bids (capped). */
  proposeRetryCount: Map<string, number>;
  /** Accept re-send attempts while awarded but no partial arrived (capped). */
  acceptResendCount: Map<string, number>;
  /**
   * Stall re-assign attempts per subtask. Cap is 1 (one next-best peer).
   */
  reassignCount: Map<string, number>;
  /** True after a chain-wide cancel has been issued. */
  chainCancelled: boolean;
  /** Reports we've already published for this chain (only one is allowed). */
  published: boolean;
  /** Subtasks that have already been awarded; reused for crash recovery. */
  awardedAt: Map<string, string>;
  /**
   * Last heartbeat timestamp (ms since epoch) per subtask. Used by
   * `trackChain` to detect stalls. Populated when a heartbeat is sent
   * *or* when a partial arrives (the partial itself proves the worker is
   * alive). Subtasks without an entry are treated as "not yet started".
   */
  lastHeartbeatAt: Map<string, number>;
  /**
   * Confidence (0..1) of the latest partial per subtask. Used by
   * `trackChain` to detect low-quality work and trigger auto-rebalance
   * when `rebalancePolicy === "auto"`.
   */
  lastConfidence: Map<string, number>;
  /**
   * Number of auto-rebalances already triggered for this chain. Capped
   * by `chainMandate.maxAutoRebalances` so a runaway worker can't burn
   * the budget silently.
   */
  autoRebalanceCount: number;
  /**
   * ISO datetime + reason for each auto-rebalance, for the audit log.
   * Most-recent first.
   */
  autoRebalanceHistory: Array<{ at: string; reason: string; additionalBudgetUsd: number }>;
  /**
   * Phase 47 — Assigner-owned multi-round iteration (B). Absent or maxRounds≤1
   * preserves one-shot synthesize→publish.
   */
  iteration?: import("./chain-iteration.js").ChainIterationState;
}

// ---------------------------------------------------------------------------
// Factory + state accessors
// ---------------------------------------------------------------------------

export function createChainState(chainMandate: ChainMandate): ChainState {
  const ledger = createChainBudgetLedger(chainMandate);
  return {
    chainId: chainMandate.chainId,
    chainMandate,
    subtasks: new Map(),
    bids: new Map(),
    awards: new Map(),
    partials: new Map(),
    cancelledSubtasks: new Set(),
    ledger,
    negotiationRounds: new Map(),
    chainCancelled: false,
    published: false,
    awardedAt: new Map(),
    workersBySubtask: new Map(),
    proposedSubtasks: new Set(),
    proposedAt: new Map(),
    proposeRetryCount: new Map(),
    acceptResendCount: new Map(),
    reassignCount: new Map(),
    lastHeartbeatAt: new Map(),
    lastConfidence: new Map(),
    autoRebalanceCount: 0,
    autoRebalanceHistory: [],
  };
}

/** True when every dependsOn parent has a final partial (cancelled parents block). */
export function subtaskDependenciesSatisfied(state: ChainState, subtask: ChainSubtask): boolean {
  for (const dep of subtask.dependsOn) {
    if (state.cancelledSubtasks.has(dep)) return false;
    const partial = state.partials.get(dep);
    if (!partial?.partial.isFinal) return false;
  }
  return true;
}

const PARENT_CONTEXT_MAX = 800;

function artifactSnippet(artifact: unknown): string {
  if (!artifact || typeof artifact !== "object") return "";
  const a = artifact as { kind?: string; content?: string; data?: unknown; displayName?: string; vaultPath?: string };
  if (a.kind === "text" && typeof a.content === "string") {
    return a.content.slice(0, PARENT_CONTEXT_MAX);
  }
  if (a.kind === "structured" && a.data !== undefined) {
    return JSON.stringify(a.data).slice(0, PARENT_CONTEXT_MAX);
  }
  if (a.kind === "file") {
    return `[file ${a.displayName ?? a.vaultPath ?? "unknown"}]`;
  }
  return "";
}

/** Append prior-step notes/artifacts into constraints for a dependent propose. */
export function enrichSubtaskWithParentContext(state: ChainState, subtask: ChainSubtask): ChainSubtask {
  if (subtask.dependsOn.length === 0) return subtask;
  const extras: string[] = [];
  for (const dep of subtask.dependsOn) {
    const payload = state.partials.get(dep);
    if (!payload) continue;
    const note = payload.partial.note?.trim();
    const art = artifactSnippet(payload.partial.artifactFragment);
    const body = [note, art].filter(Boolean).join(" | ") || "(no artifact text)";
    extras.push(`prior[${dep}]: ${body}`.slice(0, PARENT_CONTEXT_MAX + 64));
  }
  if (extras.length === 0) return subtask;
  const constraints = [...subtask.constraints, ...extras].slice(0, 32);
  const enriched = { ...subtask, constraints };
  state.subtasks.set(subtask.subtaskId, enriched);
  return enriched;
}

/** Read-only view of the chain state, useful for the UI to render progress. */
export function chainStateSnapshot(state: ChainState): {
  chainId: string;
  chainMandate: ChainMandate;
  subtaskCount: number;
  bidCount: number;
  awardedCount: number;
  partialCount: number;
  cancelledCount: number;
  chainCancelled: boolean;
  published: boolean;
  budgetSpentUsd: number;
  budgetMaxUsd: number;
  budgetReservedUsd: number;
  budgetSynthesisUsd: number;
  /** Phase 40D — rebalance counters surfaced for the UI. */
  rebalancePolicy: "manual" | "auto" | "never";
  autoRebalanceCount: number;
  maxAutoRebalances: number;
  autoRebalanceHistory: Array<{ at: string; reason: string; additionalBudgetUsd: number }>;
} {
  const snap = state.ledger.snapshot();
  const m = state.chainMandate;
  return {
    chainId: state.chainId,
    chainMandate: state.chainMandate,
    subtaskCount: state.subtasks.size,
    bidCount: state.bids.size,
    awardedCount: state.awards.size,
    partialCount: state.partials.size,
    cancelledCount: state.cancelledSubtasks.size,
    chainCancelled: state.chainCancelled,
    published: state.published,
    budgetSpentUsd: snap.committedUsd + snap.synthesisSpendUsd,
    budgetMaxUsd: snap.maxChainCostUsd,
    budgetReservedUsd: snap.reservedUsd,
    budgetSynthesisUsd: snap.synthesisSpendUsd,
    rebalancePolicy: m.rebalancePolicy ?? "manual",
    autoRebalanceCount: state.autoRebalanceCount,
    maxAutoRebalances: m.maxAutoRebalances ?? 2,
    autoRebalanceHistory: [...state.autoRebalanceHistory],
  };
}

// ---------------------------------------------------------------------------
// 1. planChain — decompose a goal into subtasks
// ---------------------------------------------------------------------------

export type PlanChainResult =
  | { ok: true; subtasks: ChainSubtask[] }
  | { ok: false; reason: "no_goal" | "llm_decompose_unavailable" | "llm_decompose_failed" | "decompose_too_deep" };

const PLAN_KEYWORD_FALLBACK = "decompose";

/**
 * Decompose a natural-language goal into subtasks. Falls back to a single
 * subtask when the goal is short, or to a keyword-based decomposition when
 * the goal has 2-3 recognizable verbs.
 */
export async function planChain(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  goal: string,
  opts: { allowLlm?: boolean } = {},
): Promise<PlanChainResult> {
  if (!goal || goal.trim().length === 0) {
    return { ok: false, reason: "no_goal" };
  }

  // Prefer LLM plan+assign whenever available (short goals included).
  // On LLM failure, fall through to the single-subtask keyword path.
  const useLlm = opts.allowLlm !== false && deps.llmDecompose !== undefined;

  if (useLlm && deps.llmDecompose) {
    const r = await deps.llmDecompose(goal);
    if (r.ok) {
      if (r.steps.some((s) => s.depth < 1 || s.depth > 3)) {
        return { ok: false, reason: "decompose_too_deep" };
      }
      const steps = r.steps.map((s) =>
        ChainSubtaskSchema.parse({
          ...s,
          chainId: state.chainId,
          chainMandateId: state.chainMandate.chainMandateId,
          deadlineAt: s.deadlineAt ?? state.chainMandate.deadlineAt,
        }),
      );
      registerSubtasks(state, steps);
      return { ok: true, subtasks: steps };
    }
  }

  // Keyword fallback — produces a single subtask by default.
  const subtask = ChainSubtaskSchema.parse({
    version: "0.1",
    subtaskId: `subtask_${cryptoRandom()}`,
    chainId: state.chainId,
    chainMandateId: state.chainMandate.chainMandateId,
    depth: 1,
    requiredSkill: "task.execute",
    objective: goal,
    requestedResult: "result of the goal",
    constraints: [],
    dependsOn: [],
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    deadlineAt: state.chainMandate.deadlineAt,
  });
  registerSubtasks(state, [subtask]);
  return { ok: true, subtasks: [subtask] };
}

function registerSubtasks(state: ChainState, subtasks: ChainSubtask[]): void {
  for (const s of subtasks) {
    state.subtasks.set(s.subtaskId, s);
  }
}

// ---------------------------------------------------------------------------
// 2. launchChain — broadcast the chain mandate + propose each subtask
// ---------------------------------------------------------------------------

export type LaunchChainResult =
  | { ok: true; proposed: number; mandateBroadcastOk: boolean }
  | { ok: false; reason: "no_subtasks" | "send_failed" };

export async function launchChain(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  workersBySubtask: Record<string, string[]>,
): Promise<LaunchChainResult> {
  if (state.subtasks.size === 0) {
    return { ok: false, reason: "no_subtasks" };
  }

  // Broadcast the chain mandate to every worker we'll propose to.
  const allWorkerPeerIds = new Set<string>();
  for (const list of Object.values(workersBySubtask)) {
    for (const w of list) allWorkerPeerIds.add(w);
  }

  let mandateBroadcastOk = true;
  const mandateFails: string[] = [];
  for (const workerPeerId of allWorkerPeerIds) {
    const sent = await sendChainMandate(deps, workerPeerId, state.chainMandate);
    if (!sent) {
      mandateBroadcastOk = false;
      mandateFails.push(workerPeerId);
    }
  }
  deps.audit.record({
    type: "chain.mandate_broadcast",
    outcome: mandateBroadcastOk ? "allow" : "deny",
    intent: "task.chain.mandate",
    correlationId: state.chainId,
    summary: mandateBroadcastOk
      ? `workers=${allWorkerPeerIds.size}`
      : `workers=${allWorkerPeerIds.size} failed=${mandateFails.length} peers=${mandateFails.map((p) => p.slice(0, 14)).join(",")}`,
  });

  // Record the full worker map up front, but only propose dependency-ready
  // roots. Dependents wait for parent final partials (`advanceReadySubtasks`).
  // Named/direct assignees: propose to the primary only; extras are stall backups.
  let proposed = 0;
  const proposeFails: string[] = [];
  for (const [subtaskId, workerIds] of Object.entries(workersBySubtask)) {
    const subtask = state.subtasks.get(subtaskId);
    if (!subtask) continue;
    state.workersBySubtask.set(subtaskId, [...workerIds]);
    if (!subtaskDependenciesSatisfied(state, subtask)) continue;
    const toSend = enrichSubtaskWithParentContext(state, subtask);
    const targets =
      subtask.preferredWorkerPeerId && workerIds.includes(subtask.preferredWorkerPeerId)
        ? [subtask.preferredWorkerPeerId]
        : subtask.preferredWorkerPeerId
          ? workerIds.slice(0, 1)
          : workerIds;
    let proposedThis = 0;
    for (const workerPeerId of targets) {
      const ok = await sendChainPropose(deps, workerPeerId, toSend, state.chainMandate);
      if (ok) {
        proposed++;
        proposedThis++;
      } else {
        proposeFails.push(`${subtaskId.slice(0, 12)}→${workerPeerId.slice(0, 14)}`);
      }
    }
    // Only mark proposed when at least one send succeeded — otherwise
    // advanceReadySubtasks can retry later (e.g. after transient mesh failure).
    if (proposedThis > 0) {
      markSubtaskProposed(state, subtaskId, (deps.now ?? (() => new Date()))().getTime());
    }
  }
  deps.audit.record({
    type: "chain.launched",
    outcome: "allow",
    intent: "task.chain.propose",
    correlationId: state.chainId,
    summary:
      `proposed=${proposed} deferred=${state.subtasks.size - state.proposedSubtasks.size}` +
      (proposeFails.length > 0 ? ` proposeFails=${proposeFails.join(";")}` : ""),
  });
  chainLog("launch", "chain launched", {
    chainId: state.chainId,
    workers: allWorkerPeerIds.size,
    mandateOk: mandateBroadcastOk,
    mandateFails: mandateFails.map(shortPeerId),
    proposed,
    deferred: state.subtasks.size - state.proposedSubtasks.size,
    proposeFails,
  });
  return { ok: true, proposed, mandateBroadcastOk };
}

function markSubtaskProposed(state: ChainState, subtaskId: string, atMs: number): void {
  state.proposedSubtasks.add(subtaskId);
  state.proposedAt.set(subtaskId, atMs);
}

function subtaskHasAnyBid(state: ChainState, subtaskId: string): boolean {
  const prefix = `${subtaskId}::`;
  for (const key of state.bids.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

function primaryWorkerForSubtask(state: ChainState, subtaskId: string): string | undefined {
  const subtask = state.subtasks.get(subtaskId);
  const workers = state.workersBySubtask.get(subtaskId) ?? [];
  if (workers.length === 0) return undefined;
  if (subtask?.preferredWorkerPeerId && workers.includes(subtask.preferredWorkerPeerId)) {
    return subtask.preferredWorkerPeerId;
  }
  return workers[0];
}

/**
 * Bidding-phase recovery: when a propose was marked sent but no bid arrived
 * (mesh flake, worker OpenClaw down, preferred-only miss), re-propose — and
 * on later retries try the next listed worker. Without this, `proposedSubtasks`
 * permanently blocks `advanceReadySubtasks` and tracking sleeps forever while
 * `awards.size === 0`.
 */
export async function retryStaleProposals(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  opts?: { bidWaitMs?: number; nowMs?: number },
): Promise<{ retried: string[] }> {
  if (state.chainCancelled || state.published) {
    return { retried: [] };
  }
  const nowMs = opts?.nowMs ?? (deps.now ?? (() => new Date()))().getTime();
  const bidWaitMs = opts?.bidWaitMs ?? CHAIN_BID_WAIT_MS;
  const retried: string[] = [];

  for (const [subtaskId, subtask] of state.subtasks.entries()) {
    if (state.cancelledSubtasks.has(subtaskId)) continue;
    if (state.awards.has(subtaskId)) continue;
    if (!state.proposedSubtasks.has(subtaskId)) continue;
    if (subtaskHasAnyBid(state, subtaskId)) continue;

    const proposedAt = state.proposedAt.get(subtaskId);
    if (proposedAt == null) {
      // Legacy / in-flight state without timestamps — start the clock now.
      state.proposedAt.set(subtaskId, nowMs);
      continue;
    }
    if (nowMs - proposedAt < bidWaitMs) continue;

    const retries = state.proposeRetryCount.get(subtaskId) ?? 0;
    if (retries >= CHAIN_PROPOSE_RETRY_CAP) continue;

    const workers = state.workersBySubtask.get(subtaskId) ?? [];
    if (workers.length === 0) continue;
    const primary = primaryWorkerForSubtask(state, subtaskId) ?? workers[0]!;
    const target =
      retries === 0 ? primary : (workers.find((w) => w !== primary) ?? primary);

    await sendChainMandate(deps, target, state.chainMandate);
    const toSend = enrichSubtaskWithParentContext(state, subtask);
    const ok = await sendChainPropose(deps, target, toSend, state.chainMandate);
    state.proposeRetryCount.set(subtaskId, retries + 1);
    markSubtaskProposed(state, subtaskId, nowMs);
    if (target !== workers[0]) {
      state.workersBySubtask.set(subtaskId, [
        target,
        ...workers.filter((w) => w !== target),
      ]);
    }
    deps.audit.record({
      type: "chain.subtask_proposed",
      outcome: ok ? "allow" : "deny",
      intent: "task.chain.propose",
      correlationId: state.chainId,
      summary:
        `propose_retry attempt=${retries + 1} subtask=${subtaskId.slice(0, 12)}` +
        ` to=${target.slice(0, 14)} ok=${ok}`,
    });
    chainLog("launch", "propose retry", {
      chainId: state.chainId,
      subtaskId,
      attempt: retries + 1,
      target: shortPeerId(target),
      ok,
    });
    if (ok) retried.push(subtaskId);
  }
  return { retried };
}

/**
 * Post-award recovery: when accept was marked awarded in orchestrator state
 * but the worker never started (no partial), re-send `task.chain.accept`
 * with the subtask snapshot so execution can begin.
 */
export async function retryStaleAccepts(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  opts?: { waitMs?: number; nowMs?: number },
): Promise<{ resent: string[] }> {
  if (state.chainCancelled || state.published) {
    return { resent: [] };
  }
  const nowMs = opts?.nowMs ?? (deps.now ?? (() => new Date()))().getTime();
  const waitMs = opts?.waitMs ?? CHAIN_ACCEPT_RESEND_WAIT_MS;
  const resent: string[] = [];

  for (const [subtaskId, award] of state.awards.entries()) {
    if (state.cancelledSubtasks.has(subtaskId)) continue;
    if (state.partials.has(subtaskId)) continue;

    const awardedIso = state.awardedAt.get(subtaskId) ?? award.createdAt;
    const awardedMs = Date.parse(awardedIso);
    if (!Number.isFinite(awardedMs) || nowMs - awardedMs < waitMs) continue;

    const retries = state.acceptResendCount.get(subtaskId) ?? 0;
    if (retries >= CHAIN_ACCEPT_RESEND_CAP) continue;

    const subtask = state.subtasks.get(subtaskId);
    const ok = await sendChainAccept(deps, award.workerPeerId, award, subtask);
    state.acceptResendCount.set(subtaskId, retries + 1);
    // Bump awardedAt so the wait window resets between resends.
    state.awardedAt.set(subtaskId, (deps.now ?? (() => new Date()))().toISOString());
    deps.audit.record({
      type: "chain.awarded",
      outcome: ok ? "allow" : "deny",
      intent: "task.chain.accept",
      correlationId: state.chainId,
      summary:
        `accept_resend attempt=${retries + 1} subtask=${subtaskId.slice(0, 12)}` +
        ` to=${award.workerPeerId.slice(0, 14)} ok=${ok}`,
    });
    chainLog("orch", "accept resend", {
      chainId: state.chainId,
      subtaskId,
      attempt: retries + 1,
      worker: shortPeerId(award.workerPeerId),
      ok,
    });
    if (ok) resent.push(subtaskId);
  }
  return { resent };
}

/**
 * Propose any not-yet-proposed subtasks whose dependsOn parents all have
 * final partials. Injects parent notes/artifacts into constraints.
 */
export async function advanceReadySubtasks(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
): Promise<{ proposed: number; subtaskIds: string[] }> {
  if (state.chainCancelled || state.published) {
    return { proposed: 0, subtaskIds: [] };
  }
  let proposed = 0;
  const subtaskIds: string[] = [];
  for (const [subtaskId, subtask] of state.subtasks.entries()) {
    if (state.cancelledSubtasks.has(subtaskId)) continue;
    if (state.proposedSubtasks.has(subtaskId)) continue;
    if (!subtaskDependenciesSatisfied(state, subtask)) continue;
    const workers = state.workersBySubtask.get(subtaskId) ?? [];
    if (workers.length === 0) continue;
    const toSend = enrichSubtaskWithParentContext(state, subtask);
    const targets =
      subtask.preferredWorkerPeerId && workers.includes(subtask.preferredWorkerPeerId)
        ? [subtask.preferredWorkerPeerId]
        : subtask.preferredWorkerPeerId
          ? workers.slice(0, 1)
          : workers;
    let proposedThis = 0;
    for (const workerPeerId of targets) {
      const ok = await sendChainPropose(deps, workerPeerId, toSend, state.chainMandate);
      if (ok) {
        proposed++;
        proposedThis++;
      }
    }
    if (proposedThis === 0) continue;
    markSubtaskProposed(state, subtaskId, (deps.now ?? (() => new Date()))().getTime());
    subtaskIds.push(subtaskId);
  }
  if (subtaskIds.length > 0) {
    deps.audit.record({
      type: "chain.launched",
      outcome: "allow",
      intent: "task.chain.propose",
      correlationId: state.chainId,
      summary: `advanced=${subtaskIds.join(",")} proposed=${proposed}`,
    });
  }
  return { proposed, subtaskIds };
}

/**
 * Stall recovery: cancel the current award and propose to the next listed
 * worker. At most one re-assign per subtask.
 *
 * Also used when a worker returns a failed final partial (e.g. OpenClaw down)
 * so the Assigner can try a backup peer instead of treating the failure as done.
 */
export async function reassignStalledSubtask(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  subtaskId: string,
): Promise<
  | { ok: true; nextWorkerPeerId: string }
  | { ok: false; reason: "no_award" | "no_alternate" | "reassign_cap" | "cancelled" | "send_failed" }
> {
  if (state.chainCancelled || state.cancelledSubtasks.has(subtaskId)) {
    return { ok: false, reason: "cancelled" };
  }
  if ((state.reassignCount.get(subtaskId) ?? 0) >= 1) {
    return { ok: false, reason: "reassign_cap" };
  }
  const award = state.awards.get(subtaskId);
  if (!award) return { ok: false, reason: "no_award" };
  const workers = state.workersBySubtask.get(subtaskId) ?? [];
  const next = workers.find((w) => w !== award.workerPeerId);
  if (!next) return { ok: false, reason: "no_alternate" };

  const nowIso = (deps.now ?? (() => new Date()))().toISOString();
  await sendChainCancel(deps, award.workerPeerId, {
    chainId: state.chainId,
    subtaskId,
    reason: "stall_reassign",
    cancelledBy: "orchestrator",
    notifyWorkerPeerIds: [award.workerPeerId],
    createdAt: nowIso,
  });
  if (state.awards.has(subtaskId)) {
    await state.ledger.release(subtaskId, "stall re-assign");
  }
  state.awards.delete(subtaskId);
  state.awardedAt.delete(subtaskId);
  state.partials.delete(subtaskId);
  state.lastHeartbeatAt.delete(subtaskId);
  state.lastConfidence.delete(subtaskId);
  // Drop the stalled worker's bid so evaluate/direct paths prefer the next peer.
  state.bids.delete(`${subtaskId}::${award.workerPeerId}`);

  const subtask = state.subtasks.get(subtaskId);
  if (!subtask) return { ok: false, reason: "send_failed" };
  const toSend = enrichSubtaskWithParentContext(state, subtask);
  const ok = await sendChainPropose(deps, next, toSend, state.chainMandate);
  if (!ok) return { ok: false, reason: "send_failed" };

  state.workersBySubtask.set(subtaskId, [next, ...workers.filter((w) => w !== next && w !== award.workerPeerId)]);
  markSubtaskProposed(state, subtaskId, (deps.now ?? (() => new Date()))().getTime());
  state.reassignCount.set(subtaskId, (state.reassignCount.get(subtaskId) ?? 0) + 1);
  deps.audit.record({
    type: "chain.launched",
    outcome: "allow",
    intent: "task.chain.propose",
    correlationId: state.chainId,
    summary: `stall_reassign subtask=${subtaskId} from=${award.workerPeerId} to=${next}`,
  });
  return { ok: true, nextWorkerPeerId: next };
}

// ---------------------------------------------------------------------------
// 3. evaluateBids — multi-round selection (up to 3 rounds)
// ---------------------------------------------------------------------------

export interface EvaluateBidsInput {
  subtaskId: string;
  /** Bid-policy filter: first available, composite rank, cost, ETA, or legacy confidence alias. */
  policy?: "first" | "composite" | "cheapest" | "fastest" | "highest_confidence";
  /** Maximum rounds. Default 3. */
  maxRounds?: number;
  /**
   * Owner-picked worker. When set, the orchestrator skips the policy sort
   * and tries to award the matching bid (subject to budget and bid TTL).
   * The picked worker's `proposedCostUsd` is used for budget reservation
   * unless `reserveCostUsd` is set.
   */
  pickWorkerPeerId?: string;
  /**
   * When set, reserve this amount instead of the bid's proposed cost.
   * Used by direct-assign mode so cost never blocks collaboration.
   */
  reserveCostUsd?: number;
}

/**
 * Counter-bid: rebroadcast the subtask proposal with a new ceiling. Drops all
 * existing bids, bumps the round counter, and asks the orchestrator to
 * resend the `task.chain.propose` envelope. Existing awards (if any) are
 * released so the new round can reserve fresh budget.
 */
export interface CounterBidInput {
  subtaskId: string;
  /** New per-subtask cost ceiling in USD. Workers will see this on the next round. */
  newCostCeilingUsd: number;
  /** Optional: new deadline for the next round. Workers must complete by this time. */
  newDeadlineAt?: string;
}

export type CounterBidResult =
  | { ok: true; rebroadcastAt: string; clearedBids: number; newRound: number }
  | {
      ok: false;
      reason: "no_such_subtask" | "max_rounds_exceeded" | "cancelled" | "ceiling_too_low";
    };

export type EvaluateBidsResult =
  | { ok: true; award: ChainSubtaskAward; round: number; bid: ChainSubtaskBid }
  | { ok: false; reason: "no_bids" | "all_bids_expired" | "budget_exceeded" | "cancelled" | "max_rounds_exceeded" };

export async function evaluateBids(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  input: EvaluateBidsInput,
): Promise<EvaluateBidsResult> {
  if (state.cancelledSubtasks.has(input.subtaskId) || state.chainCancelled) {
    return { ok: false, reason: "cancelled" };
  }
  const subtask = state.subtasks.get(input.subtaskId);
  if (!subtask) return { ok: false, reason: "no_bids" };

  // Gather matching bids for this subtask.
  const matchingBids: ChainSubtaskBid[] = [];
  for (const [key, bid] of state.bids.entries()) {
    if (!key.startsWith(`${input.subtaskId}::`)) continue;
    matchingBids.push(bid);
  }
  if (matchingBids.length === 0) return { ok: false, reason: "no_bids" };

  // Drop bids that have expired (defense-in-depth; the worker also rejects).
  const now = (deps.now ?? (() => new Date()))().getTime();
  const liveBids = matchingBids.filter(
    (b) => Date.parse(b.bidExpiresAt) > now,
  );
  if (liveBids.length === 0) return { ok: false, reason: "all_bids_expired" };

  // Round counter for this subtask.
  const round = (state.negotiationRounds.get(input.subtaskId) ?? 0) + 1;
  const maxRounds = input.maxRounds ?? 3;
  if (round > maxRounds) return { ok: false, reason: "max_rounds_exceeded" };
  state.negotiationRounds.set(input.subtaskId, round);

  // Pick the chosen bid. If the owner explicitly picked a worker peer-id,
  // honor that choice (subject to the bid still being live and present).
  let chosen: ChainSubtaskBid | undefined;
  if (input.pickWorkerPeerId) {
    chosen = liveBids.find((b) => b.workerPeerId === input.pickWorkerPeerId);
    if (!chosen) {
      // Owner picked a worker that didn't bid (or whose bid expired). Don't
      // fall back to the policy default — that would silently override the
      // owner's intent. Roll back the round counter and report no_bids.
      state.negotiationRounds.set(input.subtaskId, round - 1);
      return { ok: false, reason: "no_bids" };
    }
  } else {
    const policy = input.policy ?? "composite";
    if (policy === "first") {
      // Arrival order already reflected in Map iteration / liveBids list order.
      chosen = liveBids[0];
    } else if (policy === "composite") {
      const { rankBids } = await import("./chain-bid-strategy.js");
      const ranked = rankBids(
        liveBids.map((bid) => ({ bid })),
        {
          costCeiling: subtask.costCeilingUsd ?? state.chainMandate.costCeilingUsd,
          requiredSkill: subtask.requiredSkill,
          now: deps.now?.() ?? new Date(),
        },
      );
      chosen = ranked[0]?.bid;
    } else {
      const sorted = [...liveBids].sort((a, b) => {
        if (policy === "fastest") {
          return Date.parse(a.proposedEtaAt) - Date.parse(b.proposedEtaAt);
        }
        return a.proposedCostUsd - b.proposedCostUsd;
      });
      chosen = sorted[0];
    }
  }
  if (!chosen) return { ok: false, reason: "no_bids" };

  // Re-evaluation / concurrent auto-eval may leave an award and/or an orphaned
  // ledger reservation. Always release before reserving again (release is
  // idempotent when nothing is held).
  if (state.awards.has(input.subtaskId)) {
    await state.ledger.release(input.subtaskId, "re-evaluation for new bid");
  } else {
    await state.ledger.release(input.subtaskId, "orphaned reservation cleanup");
  }

  // Reserve budget before sending accept. Direct mode may force $0.
  const reserveAmount =
    input.reserveCostUsd !== undefined ? input.reserveCostUsd : chosen.proposedCostUsd;
  const reserveResult = await state.ledger.reserve(
    input.subtaskId,
    chosen.workerPeerId,
    reserveAmount,
  );
  if (!reserveResult.ok) return { ok: false, reason: "budget_exceeded" };

  const award: ChainSubtaskAward = {
    version: "0.1",
    subtaskId: input.subtaskId,
    chainId: state.chainId,
    workerPeerId: chosen.workerPeerId,
    negotiationRound: round,
    acceptedCostUsd: reserveAmount,
    deadlineAt: subtask.deadlineAt ?? state.chainMandate.deadlineAt,
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
  };
  state.awards.set(input.subtaskId, award);
  state.awardedAt.set(input.subtaskId, award.createdAt);

  // Promote reservation → committed spend (the worker has now accepted the award).
  await state.ledger.tryCommit(input.subtaskId);

  return { ok: true, award, round, bid: chosen };
}

/**
 * Counter-bid: reject all current bids on a subtask and rebroadcast with a
 * new per-subtask cost ceiling. Bumps the round counter so the
 * `task.chain.propose` envelope re-sent by `launchChain` will be treated as
 * a new round by workers. Existing awards (if any) are released.
 */
export async function counterBid(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  input: CounterBidInput,
): Promise<CounterBidResult> {
  if (state.chainCancelled) return { ok: false, reason: "cancelled" };
  const subtask = state.subtasks.get(input.subtaskId);
  if (!subtask) return { ok: false, reason: "no_such_subtask" };

  if (input.newCostCeilingUsd < 0) return { ok: false, reason: "ceiling_too_low" };

  // Hard cap: 3 rounds per 40B spec. Reject beyond that.
  const currentRound = state.negotiationRounds.get(input.subtaskId) ?? 0;
  if (currentRound + 1 > 3) return { ok: false, reason: "max_rounds_exceeded" };

  // Clear all bids for this subtask.
  let cleared = 0;
  for (const key of [...state.bids.keys()]) {
    if (key.startsWith(`${input.subtaskId}::`)) {
      state.bids.delete(key);
      cleared++;
    }
  }

  // Release any prior award + reservation. The new round can re-reserve.
  if (state.awards.has(input.subtaskId)) {
    await state.ledger.release(input.subtaskId, "counter-bid: release prior award");
    state.awards.delete(input.subtaskId);
    state.awardedAt.delete(input.subtaskId);
  }

  // Update the subtask's cost ceiling so the rebroadcast proposal carries it.
  subtask.costCeilingUsd = input.newCostCeilingUsd;
  if (input.newDeadlineAt) {
    subtask.deadlineAt = input.newDeadlineAt;
  }

  // Bump the round counter — workers see this as a new round and may bid again.
  state.negotiationRounds.set(input.subtaskId, currentRound + 1);

  // Rebroadcast the proposal to the original worker set. `sendChainPropose`
// wraps every send through `deps.sendEnvelope`, so we just iterate the
// targeted workers.
  const workers = state.workersBySubtask.get(input.subtaskId) ?? [];
  for (const workerPeerId of workers) {
    await sendChainPropose(deps, workerPeerId, subtask, state.chainMandate);
  }

  deps.audit?.record({
    type: "chain.counter_bid",
    outcome: "allow",
    intent: "task.chain.propose",
    correlationId: state.chainId,
    summary: `subtask=${input.subtaskId} newCeilingUsd=${input.newCostCeilingUsd} clearedBids=${cleared} round=${currentRound + 1}`,
  });

  return {
    ok: true,
    rebroadcastAt: (deps.now ?? (() => new Date()))().toISOString(),
    clearedBids: cleared,
    newRound: currentRound + 1,
  };
}

/** List live bids for a subtask. Used by the ChainBidInbox UI. */
export async function listBids(
  state: ChainState,
  subtaskId: string,
  now: Date = new Date(),
): Promise<ChainSubtaskBid[]> {
  const live: ChainSubtaskBid[] = [];
  for (const [key, bid] of state.bids.entries()) {
    if (!key.startsWith(`${subtaskId}::`)) continue;
    if (Date.parse(bid.bidExpiresAt) > now.getTime()) {
      live.push(bid);
    }
  }
  return live;
}

/** List bids across all subtasks in a chain. */
export async function listAllBids(
  state: ChainState,
  now: Date = new Date(),
): Promise<Array<{ subtaskId: string; bids: ChainSubtaskBid[] }>> {
  const groups = new Map<string, ChainSubtaskBid[]>();
  for (const [key, bid] of state.bids.entries()) {
    if (Date.parse(bid.bidExpiresAt) <= now.getTime()) continue;
    const idx = key.indexOf("::");
    if (idx < 0) continue;
    const subtaskId = key.slice(0, idx);
    const list = groups.get(subtaskId) ?? [];
    list.push(bid);
    groups.set(subtaskId, list);
  }
  return [...groups.entries()].map(([subtaskId, bids]) => ({ subtaskId, bids }));
}

// ---------------------------------------------------------------------------
// 4b. rebalanceChain — owner raises the chain budget ceiling and triggers
//     re-evaluation for every not-yet-awarded subtask
// ---------------------------------------------------------------------------

export interface RebalanceChainInput {
  /** Dollar amount to add to the chain's `maxChainCostUsd`. Must be > 0. */
  additionalBudgetUsd: number;
  /**
   * When true, the call was initiated automatically by `trackChain`
   * (because a worker stalled or a partial landed below threshold).
   * Recorded on the audit log + chain state so the UI can show
   * "auto-rebalanced at 12:34:56" alongside manual rebalances.
   */
  autoTriggered?: boolean;
  /**
   * Free-text reason for the auto-rebalance. Required when `autoTriggered`
   * is true. Ignored otherwise.
   */
  reason?: string;
}

export type RebalanceChainResult =
  | {
      ok: true;
      chainId: string;
      previousMaxUsd: number;
      newMaxUsd: number;
      reEvaluated: Array<{
        subtaskId: string;
        awarded: boolean;
        workerPeerId?: string;
        reason?: string;
      }>;
      /** True when the rebalance was triggered automatically. */
      autoTriggered: boolean;
    }
  | {
      ok: false;
      reason: "cancelled" | "invalid_amount" | "already_finalized" | "policy_disabled" | "cap_exceeded";
    };

/**
 * Increase the chain's budget ceiling and re-run evaluation for every
 * subtask that has bids but no award. If a re-evaluation succeeds, the
 * worker is awarded and the new `acceptedCostUsd` is reserved against
 * the *new* max. Finalized chains cannot be rebalanced.
 *
 * This is the multi-agent analog of a human pressing "I can spend more"
 * after watching a partial — the chain shouldn't fail just because the
 * initial cost estimate was too low.
 */
export async function rebalanceChain(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  input: RebalanceChainInput,
): Promise<RebalanceChainResult> {
  if (state.chainCancelled) return { ok: false, reason: "cancelled" };
  if (state.ledger.isFinalized()) return { ok: false, reason: "already_finalized" };
  if (!Number.isFinite(input.additionalBudgetUsd) || input.additionalBudgetUsd <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  // Honor the chain's rebalance policy. Auto-rebalances only fire when
  // the policy is "auto". The owner can still call `rebalanceChain`
  // directly regardless of policy — manual always works.
  if (input.autoTriggered) {
    const policy = state.chainMandate.rebalancePolicy ?? "manual";
    if (policy === "never") {
      return { ok: false, reason: "policy_disabled" };
    }
    if (policy === "manual") {
      // Auto-trigger was requested but the chain is configured manual.
      // This is a config mismatch; refuse rather than silently rebalance.
      return { ok: false, reason: "policy_disabled" };
    }
    const cap = state.chainMandate.maxAutoRebalances ?? 2;
    if (state.autoRebalanceCount >= cap) {
      return { ok: false, reason: "cap_exceeded" };
    }
  }

  const previousMax = state.chainMandate.maxChainCostUsd;
  const newMax = previousMax + input.additionalBudgetUsd;
  state.chainMandate.maxChainCostUsd = newMax;

  const reEvaluated: Extract<RebalanceChainResult, { ok: true }>["reEvaluated"] = [];
  for (const [subtaskId, subtask] of state.subtasks.entries()) {
    // Skip subtasks that already have an award (re-evaluation of an
    // awarded subtask would be a *counter*-bid, not a rebalance).
    if (state.awards.has(subtaskId)) continue;

    const result = await evaluateBids(deps, state, {
      subtaskId,
      policy: "cheapest",
      // Don't bump the round counter — rebalance is not a negotiation move.
      maxRounds: 99,
    });
    if (result.ok) {
      reEvaluated.push({ subtaskId, awarded: true, workerPeerId: result.bid.workerPeerId });
    } else {
      reEvaluated.push({ subtaskId, awarded: false, reason: result.reason });
    }
    void subtask;
  }

  // Record into chain state so the UI can render "auto-rebalanced at …"
  if (input.autoTriggered) {
    state.autoRebalanceCount += 1;
    state.autoRebalanceHistory.unshift({
      at: (deps.now ?? (() => new Date()))().toISOString(),
      reason: input.reason ?? "auto",
      additionalBudgetUsd: input.additionalBudgetUsd,
    });
  }

  deps.audit?.record({
    type: input.autoTriggered ? "chain.auto_rebalanced" : "chain.rebalanced",
    outcome: "allow",
    intent: "task.chain.rebalance",
    correlationId: state.chainId,
    summary: input.autoTriggered
      ? `AUTO +$${input.additionalBudgetUsd.toFixed(2)} (${input.reason ?? "unspecified"}) ${previousMax}→${newMax}; reEvaluated=${reEvaluated.length}`
      : `+$${input.additionalBudgetUsd.toFixed(2)} ${previousMax}→${newMax}; reEvaluated=${reEvaluated.length}`,
  });

  return {
    ok: true,
    chainId: state.chainId,
    previousMaxUsd: previousMax,
    newMaxUsd: newMax,
    reEvaluated,
    autoTriggered: !!input.autoTriggered,
  };
}

// ---------------------------------------------------------------------------
// 4. trackChain — heartbeat loop, drives partial collection
// ---------------------------------------------------------------------------

export interface TrackChainResult {
  ok: boolean;
  /** Subtasks that have produced at least one partial. */
  inFlight: string[];
  /** Subtasks that have been cancelled. */
  cancelled: string[];
}

export async function trackChain(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  opts: { tickMs?: number; maxTicks?: number } = {},
): Promise<TrackChainResult> {
  const tickMs = opts.tickMs ?? 1000;
  const maxTicks = opts.maxTicks ?? 30;
  const inFlight = new Set<string>();
  const cancelled = new Set<string>();

  // Phase 40D — auto-rebalance tunables. Defaults are conservative; the
  // owner can override per-chain via the chain mandate.
  const policy = state.chainMandate.rebalancePolicy ?? "manual";
  const stallTimeoutMs = state.chainMandate.stallTimeoutMs ?? 60_000;
  const lowConfidenceThreshold = state.chainMandate.lowConfidenceThreshold ?? 0.5;
  const autoIncrementUsd = state.chainMandate.autoRebalanceIncrementUsd ?? 5;

  for (let t = 0; t < maxTicks; t++) {
    const now = (deps.now ?? (() => new Date()))().getTime();

    // Send heartbeats to all awarded workers. Note: we deliberately do
    // NOT update `lastHeartbeatAt` here — orchestrator→worker heartbeats
    // prove the orchestrator is alive, not the worker. The liveness
    // timestamp is only updated when the worker-originated heartbeat
    // arrives (handleOrchestratorHeartbeat) or a partial arrives.
    for (const [subtaskId, award] of state.awards.entries()) {
      if (state.cancelledSubtasks.has(subtaskId)) continue;
      // Phase 47: sealed rounds are finished — do not heartbeat / stall them.
      if (state.iteration) {
        const sealed = Object.values(state.iteration.sealedByRound).some((ids) =>
          ids.includes(subtaskId),
        );
        if (sealed) continue;
      }
      await sendChainHeartbeat(deps, award.workerPeerId, state.chainId, subtaskId, "in-progress");
      inFlight.add(subtaskId);
    }

    // Stall → one re-assign to next-best peer (independent of budget rebalance).
    // Clock starts at last worker heartbeat, else award time — never treat a
    // brand-new award with no timestamps as already stalled.
    {
      const stalledForReassign: string[] = [];
      for (const [subtaskId] of state.awards.entries()) {
        if (state.cancelledSubtasks.has(subtaskId)) continue;
        if (state.partials.has(subtaskId)) continue;
        if (state.iteration) {
          const sealed = Object.values(state.iteration.sealedByRound).some((ids) =>
            ids.includes(subtaskId),
          );
          if (sealed) continue;
        }
        const lastHb = state.lastHeartbeatAt.get(subtaskId);
        const awardedIso = state.awardedAt.get(subtaskId);
        const startedAt =
          lastHb ?? (awardedIso !== undefined ? Date.parse(awardedIso) : undefined);
        if (startedAt !== undefined && now - startedAt > stallTimeoutMs) {
          stalledForReassign.push(subtaskId);
        }
      }
      for (const subtaskId of stalledForReassign) {
        await reassignStalledSubtask(deps, state, subtaskId);
      }
    }

    // Phase 40D — auto-rebalance trigger. Only fires when:
    //   - policy === "auto"
    //   - some subtask is awarded but hasn't heartbeated within stallTimeoutMs
    //     OR a partial landed with confidence < threshold
    //   - we haven't blown through maxAutoRebalances yet
    if (policy === "auto") {
      const cap = state.chainMandate.maxAutoRebalances ?? 2;
      if (state.autoRebalanceCount < cap) {
        const stalledSubtasks: string[] = [];
        const lowQualitySubtasks: string[] = [];
        for (const [subtaskId, award] of state.awards.entries()) {
          if (state.cancelledSubtasks.has(subtaskId)) continue;
          const lastHb = state.lastHeartbeatAt.get(subtaskId);
          // Stall detection: a subtask with no partial AND a stale or
          // missing heartbeat is considered stalled. Subtasks that
          // already have a partial are skipped — they're effectively
          // done from the stall-detection perspective.
          if (!state.partials.has(subtaskId)) {
            if (lastHb === undefined || now - lastHb > stallTimeoutMs) {
              stalledSubtasks.push(subtaskId);
            }
          }
          // Low-confidence detection: a partial below threshold is still
          // a rebalance signal even though the subtask is "done" — we
          // may want to give the chain more budget so a backup worker
          // can take over.
          const conf = state.lastConfidence.get(subtaskId);
          if (conf !== undefined && conf < lowConfidenceThreshold) {
            lowQualitySubtasks.push(subtaskId);
          }
        }
        const reasons: string[] = [];
        if (stalledSubtasks.length > 0) {
          reasons.push(`stalled:${stalledSubtasks.join(",")}`);
        }
        if (lowQualitySubtasks.length > 0) {
          reasons.push(`low-confidence:${lowQualitySubtasks.join(",")}`);
        }
        if (reasons.length > 0) {
          const autoResult = await rebalanceChain(deps, state, {
            additionalBudgetUsd: autoIncrementUsd,
            autoTriggered: true,
            reason: reasons.join("|"),
          });
          if (!autoResult.ok) {
            // Cap reached or policy changed mid-flight — silently stop
            // trying; the next ticks will short-circuit on `cap`.
            if (autoResult.reason === "cap_exceeded" || autoResult.reason === "policy_disabled") {
              state.autoRebalanceCount = cap;
            }
          }
        }
      }
    }

    await new Promise((r) => setTimeout(r, tickMs));
    for (const id of state.cancelledSubtasks) cancelled.add(id);
  }
  return { ok: true, inFlight: [...inFlight], cancelled: [...cancelled] };
}

// ---------------------------------------------------------------------------
// 5. synthesizeChain — collect contributions + run the synthesizer
// ---------------------------------------------------------------------------

export type SynthesizeChainResult =
  | { ok: true; report: TaskChainReportPayload["report"] }
  | { ok: false; reason: SynthesizeChainReportResult extends { ok: false; reason: infer R } ? R : never };

export async function synthesizeChain(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  kind: AggregationKind,
  opts: { subtaskIds?: readonly string[] } = {},
): Promise<SynthesizeChainResult> {
  const allow = opts.subtaskIds !== undefined ? new Set(opts.subtaskIds) : null;
  const contributions: WorkerContribution[] = [];
  for (const [subtaskId, award] of state.awards.entries()) {
    if (allow && !allow.has(subtaskId)) continue;
    const partial = state.partials.get(subtaskId);
    if (!partial) continue;
    contributions.push({
      subtaskId,
      workerPeerId: award.workerPeerId,
      workerOwnerId: award.workerPeerId, // owner-id resolution belongs to a higher layer
      text: partial.partial.note ?? "(empty)",
      confidence: 0.5,
      award,
    });
  }

  const r = await synthesizeChainReport(state.ledger, {
    chainMandate: state.chainMandate,
    contributions,
    kind,
    llmMerge: deps.llmMerge,
    now: (deps.now ?? (() => new Date()))(),
  });
  if (!r.ok) {
    return { ok: false, reason: r.reason } as SynthesizeChainResult;
  }
  return { ok: true, report: r.report };
}

// ---------------------------------------------------------------------------
// 6. publishChainReport — finalize + send to owner
// ---------------------------------------------------------------------------

export async function publishChainReport(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  report: TaskChainReportPayload["report"],
  ownerPeerId: string,
): Promise<ChainInboundDecision> {
  if (state.published) {
    return { ok: false, reason: "handler_denied" };
  }
  // Finalize the budget ledger before publishing.
  const finalize = await state.ledger.finalize(report);
  if (!finalize.ok) {
    deps.audit.record({
      type: "chain.finalize_failed",
      outcome: "deny",
      intent: "task.chain.report",
      correlationId: state.chainId,
      summary: finalize.reason,
    });
    return { ok: false, reason: "handler_denied" };
  }

  await deps.storeChainReport(report);
  state.published = true;

  const payload = TaskChainReportPayloadSchema.parse({ report });
  const envelope = buildChainEnvelope({
    intent: "task.chain.report",
    senderPeerId: deps.orchestratorPeerId,
    senderPublicKey: deps.publicKeyPem,
    recipientPeerId: ownerPeerId,
    recipientRole: "human",
    payload,
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    correlationId: state.chainId,
    signingKeyPem: deps.signingKeyPem,
  });
  const sent = await deps.sendEnvelope(ownerPeerId, envelope, payload);
  deps.audit.record({
    type: sent ? "chain.report_published" : "chain.report_send_failed",
    outcome: sent ? "allow" : "deny",
    intent: "task.chain.report",
    correlationId: state.chainId,
    summary: `costUsd=${report.chainSummary.synthesisCostUsd}`,
  });
  // Local publish is complete once the ledger is finalized and the report is
  // stored. Owner delivery may still fail (offline / self-dial); callers treat
  // `state.published` / store as the source of truth for completion.
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Inbound handlers — called by chain-inbound.ts on the orchestrator side
// ---------------------------------------------------------------------------

export async function handleOrchestratorBid(
  deps: ChainOrchestratorHandlerDeps,
  envelope: EnvoyEnvelope,
  payload: TaskChainBidPayload,
  state: ChainState,
): Promise<ChainInboundDecision> {
  const bid = payload.bid;
  if (bid.chainId !== state.chainId) {
    return { ok: false, reason: "handler_denied" };
  }
  const now = (deps.now ?? (() => new Date()))().getTime();
  if (Date.parse(bid.bidExpiresAt) <= now) {
    deps.audit.record({
      type: "chain.bid_expired",
      outcome: "deny",
      intent: "task.chain.bid",
      remotePeerId: envelope.senderPeerId,
      correlationId: envelope.correlationId,
      summary: `subtask=${bid.subtaskId}`,
    });
    return { ok: false, reason: "handler_denied" };
  }
  state.bids.set(`${bid.subtaskId}::${bid.workerPeerId}`, bid);
  chainLog("orch", "bid received", {
    chainId: state.chainId,
    subtaskId: bid.subtaskId,
    worker: shortPeerId(bid.workerPeerId),
    costUsd: bid.proposedCostUsd,
  });
  deps.audit.record({
    type: "chain.bid_received",
    outcome: "allow",
    intent: "task.chain.bid",
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId,
    summary: `subtask=${bid.subtaskId} costUsd=${bid.proposedCostUsd}`,
  });
  return { ok: true };
}

export async function handleOrchestratorMandate(
  _deps: ChainOrchestratorHandlerDeps,
  _envelope: EnvoyEnvelope,
  _payload: TaskChainMandatePayload,
): Promise<ChainInboundDecision> {
  // Orchestrators don't usually receive mandates from other orchestrators in
  // Phase 40; this handler exists to satisfy the dispatcher contract.
  return { ok: true };
}

export async function handleOrchestratorAccept(
  _deps: ChainOrchestratorHandlerDeps,
  _envelope: EnvoyEnvelope,
  _payload: TaskChainAcceptPayload,
): Promise<ChainInboundDecision> {
  // The orchestrator never receives its own accept envelopes.
  return { ok: true };
}

export async function handleOrchestratorPartial(
  deps: ChainOrchestratorHandlerDeps,
  envelope: EnvoyEnvelope,
  payload: TaskChainPartialPayload,
  state: ChainState,
): Promise<ChainInboundDecision> {
  state.partials.set(payload.partial.subtaskId, payload);
  // Phase 40D — partials are the strongest liveness signal we have. Stamp
  // the heartbeat timestamp + record the confidence so the auto-rebalance
  // trigger can compare against `lowConfidenceThreshold`.
  state.lastHeartbeatAt.set(
    payload.partial.subtaskId,
    (deps.now ?? (() => new Date()))().getTime(),
  );
  if (typeof payload.partial.confidence === "number") {
    state.lastConfidence.set(payload.partial.subtaskId, payload.partial.confidence);
  }
  const notePreview = (payload.partial.note ?? "").replace(/\s+/g, " ").slice(0, 120);
  deps.audit.record({
    type: "chain.partial_received",
    outcome: "allow",
    intent: "task.chain.partial",
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId,
    summary:
      `subtask=${payload.partial.subtaskId} seq=${payload.partial.seq}` +
      ` isFinal=${payload.partial.isFinal}` +
      (typeof payload.partial.confidence === "number"
        ? ` confidence=${payload.partial.confidence}`
        : "") +
      (notePreview ? ` note=${notePreview}` : ""),
  });
  if (payload.partial.isFinal) {
    if (isFailedWorkerFinalPartial(payload)) {
      // Engine/worker failure — try backup peer before treating the step as done.
      const reassigned = await reassignStalledSubtask(deps, state, payload.partial.subtaskId);
      if (reassigned.ok) {
        deps.audit.record({
          type: "chain.launched",
          outcome: "allow",
          intent: "task.chain.propose",
          remotePeerId: envelope.senderPeerId,
          correlationId: envelope.correlationId,
          summary: `worker_failed_reassign subtask=${payload.partial.subtaskId} to=${reassigned.nextWorkerPeerId}`,
        });
        return { ok: true };
      }
      deps.audit.record({
        type: "chain.partial_received",
        outcome: "record",
        intent: "task.chain.partial",
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId,
        summary: `worker_failed_exhausted subtask=${payload.partial.subtaskId} reason=${reassigned.reason}`,
      });
      // No backup: keep Failed final so the report can surface it; do not
      // advance dependents as if the step succeeded.
      return { ok: true };
    }
    await advanceReadySubtasks(deps, state);
  }
  return { ok: true };
}

/**
 * Final partial that means the worker engine could not complete the step.
 * Must NOT treat ordinary LLM prose that happens to start with "Failed:" as an
 * engine failure — that false-positive was reassigning successful local work
 * to a silent backup peer and stalling team jobs.
 */
export function isFailedWorkerFinalPartial(payload: TaskChainPartialPayload): boolean {
  if (!payload.partial.isFinal) return false;
  const note = (payload.partial.note ?? "").trim();
  // Executor-owned failure markers only (see chain-worker-executor.ts).
  if (
    note.startsWith("AN_ENGINE_FAIL:") ||
    note.startsWith("Failed: Built-in OpenClaw") ||
    note.startsWith("Failed: OpenClaw ") ||
    note.startsWith("Failed: no Agent Network executor")
  ) {
    return true;
  }
  // Very low confidence + empty/near-empty body is still an engine miss.
  if (
    typeof payload.partial.confidence === "number" &&
    payload.partial.confidence < 0.3 &&
    note.length < 80
  ) {
    return true;
  }
  return false;
}

export async function handleOrchestratorHeartbeat(
  deps: ChainOrchestratorHandlerDeps,
  envelope: EnvoyEnvelope,
  payload: TaskChainHeartbeatPayload,
  state: ChainState,
): Promise<ChainInboundDecision> {
  // Phase 40D — worker-originated heartbeats also reset the liveness
  // timer. The orchestrator-side loop is the authoritative source, but
  // we don't want to wait up to `tickMs` to notice that a worker is
  // still alive.
  state.lastHeartbeatAt.set(
    payload.subtaskId,
    (deps.now ?? (() => new Date()))().getTime(),
  );
  void envelope;
  return { ok: true };
}

export async function handleOrchestratorMerge(
  deps: ChainOrchestratorHandlerDeps,
  envelope: EnvoyEnvelope,
  payload: TaskChainMergePayload,
  state: ChainState,
): Promise<ChainInboundDecision> {
  // Cancel-then-merge: any open reservations on the merged subtasks must be
  // released before the new merged subtask is added.
  for (const oldId of payload.mergingSubtaskIds) {
    if (state.awards.has(oldId)) {
      await state.ledger.release(oldId, `merge into ${payload.newSubtask.subtaskId}`);
    }
    state.cancelledSubtasks.add(oldId);
    state.subtasks.delete(oldId);
    state.bids.delete(`${oldId}::`);
    state.partials.delete(oldId);
  }
  state.subtasks.set(payload.newSubtask.subtaskId, payload.newSubtask);
  deps.audit.record({
    type: "chain.merge_published",
    outcome: "allow",
    intent: "task.chain.merge",
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId,
    summary: `merged=${payload.mergingSubtaskIds.length} into=${payload.newSubtask.subtaskId}`,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Outbound send helpers (signed)
// ---------------------------------------------------------------------------

async function sendChainMandate(
  deps: ChainOrchestratorSendDeps,
  recipientPeerId: string,
  mandate: ChainMandate,
): Promise<boolean> {
  const payload = TaskChainMandatePayloadSchema.parse({ chainMandate: mandate });
  const envelope = buildChainEnvelope({
    intent: "task.chain.mandate",
    senderPeerId: deps.orchestratorPeerId,
    senderPublicKey: deps.publicKeyPem,
    recipientPeerId,
    recipientRole: "agent",
    payload,
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    correlationId: mandate.chainId,
    signingKeyPem: deps.signingKeyPem,
  });
  return deps.sendEnvelope(recipientPeerId, envelope, payload);
}

export async function sendChainPropose(
  deps: ChainOrchestratorSendDeps,
  recipientPeerId: string,
  subtask: ChainSubtask,
  mandate: ChainMandate,
): Promise<boolean> {
  const payload = TaskChainProposePayloadSchema.parse({ subtask, chainMandate: mandate });
  const envelope = buildChainEnvelope({
    intent: "task.chain.propose",
    senderPeerId: deps.orchestratorPeerId,
    senderPublicKey: deps.publicKeyPem,
    recipientPeerId,
    recipientRole: "agent",
    payload,
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    correlationId: mandate.chainId,
    signingKeyPem: deps.signingKeyPem,
  });
  return deps.sendEnvelope(recipientPeerId, envelope, payload);
}

export async function sendChainAccept(
  deps: ChainOrchestratorSendDeps,
  recipientPeerId: string,
  award: ChainSubtaskAward,
  subtask?: ChainSubtask,
): Promise<boolean> {
  const payload = TaskChainAcceptPayloadSchema.parse({
    award,
    ...(subtask ? { subtask } : {}),
  });
  const envelope = buildChainEnvelope({
    intent: "task.chain.accept",
    senderPeerId: deps.orchestratorPeerId,
    senderPublicKey: deps.publicKeyPem,
    recipientPeerId,
    recipientRole: "agent",
    payload,
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    correlationId: award.chainId,
    signingKeyPem: deps.signingKeyPem,
  });
  return deps.sendEnvelope(recipientPeerId, envelope, payload);
}

export async function sendChainCancel(
  deps: ChainOrchestratorSendDeps,
  recipientPeerId: string,
  cancel: TaskChainCancelPayload,
): Promise<boolean> {
  const payload = TaskChainCancelPayloadSchema.parse(cancel);
  const envelope = buildChainEnvelope({
    intent: "task.chain.cancel",
    senderPeerId: deps.orchestratorPeerId,
    senderPublicKey: deps.publicKeyPem,
    recipientPeerId,
    recipientRole: "agent",
    payload,
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    correlationId: cancel.chainId,
    signingKeyPem: deps.signingKeyPem,
  });
  return deps.sendEnvelope(recipientPeerId, envelope, payload);
}

async function sendChainHeartbeat(
  deps: ChainOrchestratorSendDeps,
  recipientPeerId: string,
  chainId: string,
  subtaskId: string,
  progress: string,
): Promise<boolean> {
  const payload = TaskChainHeartbeatPayloadSchema.parse({
    chainId,
    subtaskId,
    workerPeerId: recipientPeerId,
    progress,
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
  });
  const envelope = buildChainEnvelope({
    intent: "task.chain.heartbeat",
    senderPeerId: deps.orchestratorPeerId,
    senderPublicKey: deps.publicKeyPem,
    recipientPeerId,
    recipientRole: "agent",
    payload,
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    correlationId: chainId,
    signingKeyPem: deps.signingKeyPem,
  });
  return deps.sendEnvelope(recipientPeerId, envelope, payload);
}

/** Build a read-only status snapshot for worker fan-out. */
export function buildChainStatusPayload(
  state: ChainState,
  opts?: {
    goal?: string;
    awardMode?: "direct" | "competitive";
    now?: () => Date;
  },
): TaskChainStatusPayload {
  const awardMode = opts?.awardMode === "competitive" ? "competitive" : "direct";
  const createdAt = (opts?.now ?? (() => new Date()))().toISOString();
  const steps = [...state.subtasks.values()].map((sub) => {
    let stepState: TaskChainStatusPayload["steps"][number]["state"] = "pending";
    if (state.cancelledSubtasks.has(sub.subtaskId) || state.chainCancelled) {
      stepState = "cancelled";
    } else if (state.awards.has(sub.subtaskId)) {
      const partial = state.partials.get(sub.subtaskId);
      const body = partial?.partial;
      if (body?.isFinal) {
        stepState = isFailedWorkerFinalPartial({
          partial: body,
        } as TaskChainPartialPayload)
          ? "failed"
          : "done";
      } else if (partial) {
        stepState = "running";
      } else {
        stepState = "awarded";
      }
    } else if (state.proposedSubtasks.has(sub.subtaskId)) {
      stepState = "offered";
    }
    return {
      subtaskId: sub.subtaskId,
      objective: sub.objective.slice(0, 500),
      state: stepState,
      workerPeerId: state.awards.get(sub.subtaskId)?.workerPeerId,
    };
  });
  let finalPartialCount = 0;
  for (const p of state.partials.values()) {
    if (p.partial?.isFinal) finalPartialCount += 1;
  }
  const bidCount = state.bids.size;
  let phase: TaskChainStatusPayload["phase"] = "assigning";
  if (state.chainCancelled) phase = "cancelled";
  else if (state.published) phase = "completed";
  else if (finalPartialCount >= state.subtasks.size && state.subtasks.size > 0) {
    phase = "synthesizing";
  } else if (state.awards.size === 0) {
    if (bidCount === 0 && state.subtasks.size > 0) {
      phase = "waitingWorkers";
    } else {
      phase = awardMode === "competitive" ? "bidding" : "assigning";
    }
  } else {
    phase = "running";
  }
  return TaskChainStatusPayloadSchema.parse({
    chainId: state.chainId,
    goal: opts?.goal,
    phase,
    awardMode,
    subtaskCount: state.subtasks.size,
    awardedCount: state.awards.size,
    partialCount: state.partials.size,
    finalPartialCount,
    bidCount,
    steps,
    readOnly: true,
    createdAt,
  });
}

/** Fan-out read-only status to every worker peer listed on the chain. */
export async function broadcastChainStatus(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  opts?: { goal?: string; awardMode?: "direct" | "competitive" },
): Promise<{ sent: number; failed: number }> {
  const payload = buildChainStatusPayload(state, {
    ...opts,
    now: deps.now,
  });
  const peers = new Set<string>();
  for (const list of state.workersBySubtask.values()) {
    for (const p of list) peers.add(p);
  }
  // Also include awarded / bidding workers in case the worker list was narrowed.
  for (const award of state.awards.values()) peers.add(award.workerPeerId);
  for (const bid of state.bids.values()) peers.add(bid.workerPeerId);
  let sent = 0;
  let failed = 0;
  for (const recipientPeerId of peers) {
    const envelope = buildChainEnvelope({
      intent: "task.chain.status",
      senderPeerId: deps.orchestratorPeerId,
      senderPublicKey: deps.publicKeyPem,
      recipientPeerId,
      recipientRole: "agent",
      payload,
      createdAt: payload.createdAt,
      correlationId: state.chainId,
      signingKeyPem: deps.signingKeyPem,
    });
    const ok = await deps.sendEnvelope(recipientPeerId, envelope, payload);
    if (ok) sent += 1;
    else failed += 1;
  }
  deps.audit.record({
    type: "chain.status_broadcast",
    outcome: failed === 0 ? "allow" : "record",
    intent: "task.chain.status",
    correlationId: state.chainId,
    summary: `phase=${payload.phase} peers=${peers.size} sent=${sent} failed=${failed}`,
  });
  return { sent, failed };
}

/** Send `task.chain.handoff` — whole-job Assigner handoff or subtask transfer request. */
export async function sendChainHandoff(
  deps: ChainOrchestratorSendDeps,
  recipientPeerId: string,
  handoff: ChainHandoffRequestPayload,
): Promise<boolean> {
  const payload = ChainHandoffRequestPayloadSchema.parse(handoff);
  const envelope = buildChainEnvelope({
    intent: "task.chain.handoff",
    senderPeerId: deps.orchestratorPeerId,
    senderPublicKey: deps.publicKeyPem,
    recipientPeerId,
    recipientRole: "agent",
    payload,
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    correlationId: payload.chainId,
    signingKeyPem: deps.signingKeyPem,
  });
  return deps.sendEnvelope(recipientPeerId, envelope, payload);
}

// ---------------------------------------------------------------------------
// Internal — envelope construction
// ---------------------------------------------------------------------------

interface BuildChainEnvelopeInput {
  intent:
    | "task.chain.mandate"
    | "task.chain.propose"
    | "task.chain.accept"
    | "task.chain.cancel"
    | "task.chain.heartbeat"
    | "task.chain.status"
    | "task.chain.merge"
    | "task.chain.report"
    | "task.chain.handoff"
    | "task.chain.delegate";
  senderPeerId: string;
  senderPublicKey: string;
  recipientPeerId: string;
  recipientRole: "human" | "agent" | "system";
  payload: unknown;
  createdAt: string;
  correlationId?: string;
  signingKeyPem: string;
}

function buildChainEnvelope(input: BuildChainEnvelopeInput): EnvoyEnvelope {
  const unsigned = {
    version: "0.1" as const,
    messageId: `m_${randomString()}`,
    createdAt: input.createdAt,
    senderPeerId: input.senderPeerId,
    senderPublicKey: input.senderPublicKey,
    senderRole: "agent" as const,
    recipientPeerId: input.recipientPeerId,
    recipientRole: input.recipientRole,
    intent: input.intent,
    payload: input.payload,
    correlationId: input.correlationId,
  };
  const signature = signCanonicalPayload(unsigned, input.signingKeyPem);
  return { ...(unsigned as object), signature } as EnvoyEnvelope;
}

function randomString(): string {
  return Math.random().toString(36).slice(2, 12);
}

function cryptoRandom(): string {
  // 32 bits is enough for an opaque suffix.
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
}

// Re-export so the test surface can import the same types.
export { ChainMandateSignedSchema, UnsignedChainMandateSchema };