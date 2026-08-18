/**
 * Phase 40E — Cross-orchestrator handoff protocol.
 *
 * Three flows live here:
 *
 *   1. **requestHandoff** — owner or orchestrator-A requests that a
 *      sub-chain be handed off to orchestrator-B. Generates a
 *      `task.chain.handoff` envelope addressed to A.
 *
 *   2. **delegateHandoff** — orchestrator-A forwards the request to
 *      orchestrator-B as a `task.chain.delegate` envelope. B's
 *      `handleOrchestratorDelegate` accepts or rejects it.
 *
 *   3. **arbitrateOwnership** — both A and B record an arbitration
 *      ledger entry. The entry with the higher `seq` (or most recent
 *      `createdAt` on a tie) is the canonical "who owns what" record.
 *
 * The handoff flow reuses the existing `ChainBudgetLedger`: any
 * reserved-but-uncommitted budget for the handoff subtasks stays
 * on A's side (so A can re-bid the work if B rejects). Once A
 * receives a `delegated` response, it explicitly transfers the
 * reservations to B via `ledger.transfer()` (defined in
 * `chain-budget-ledger.ts`).
 *
 * @see docs/agent_network.md §8 (Cross-orchestrator handoff)
 */

import {
  type ChainHandoffRequest,
  type ChainHandoffRequestPayload,
  type ChainHandoffDelegate,
  type ChainHandoffDelegatePayload,
  type ChainHandoffStatus,
  type ChainArbitrationEntry,
  type ChainArbitrationPayload,
  ChainHandoffRequestPayloadSchema,
  ChainHandoffDelegatePayloadSchema,
  ChainArbitrationPayloadSchema,
  isHandoffLive,
  isHandoffTerminal,
} from "@envoymesh/protocol";

import type { ChainOrchestratorHandlerDeps, ChainState } from "./chain-orchestrator.js";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

/** Handoff request id format. */
export type HandoffRequestId = string & { readonly __brand: "HandoffRequestId" };

export function makeHandoffRequestId(chainId: string, seq: number): HandoffRequestId {
  return `handoff_${chainId}_${seq}` as HandoffRequestId;
}

export interface HandoffRequestRecord {
  requestId: HandoffRequestId;
  chainId: string;
  subtaskIds: string[];
  newOrchestratorPeerId: string;
  newOrchestratorOwnerId: string;
  rationale?: string;
  expiresAt: string;
  status: ChainHandoffStatus;
  /** Sub-chain id assigned by B on accept. Filled in only after `delegated`. */
  subChainId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DelegateRequestInput {
  chainId: string;
  subtaskIds: string[];
  newOrchestratorPeerId: string;
  newOrchestratorOwnerId: string;
  rationale?: string;
  expiresAt: string;
  /** Whole-job Assigner handoff goal (allows empty subtaskIds). */
  goal?: string;
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
  allowLlm?: boolean;
}

export interface DelegateRequestResult {
  ok: boolean;
  reason?: string;
  request?: HandoffRequestRecord;
}

export interface AcceptHandoffInput {
  chainId: string;
  handoffRequestId: string;
  subtaskIds: string[];
  subChainId: string;
  subChainMandate: unknown; // validated by the caller before send
  reportBackByAt: string;
  estimatedCostUsd: number;
}

export interface AcceptHandoffResult {
  ok: boolean;
  reason?: string;
  delegate?: ChainHandoffDelegate;
}

export interface ArbitrateInput {
  chainId: string;
  subtaskIds: string[];
  currentOwnerPeerId: string;
  currentOwnerOwnerId: string;
  previousOwnerPeerId?: string;
  status: ChainHandoffStatus;
  rationale?: string;
}

export interface ArbitrateResult {
  ok: boolean;
  reason?: string;
  entry?: ChainArbitrationEntry;
  converged: boolean;
}

// ---------------------------------------------------------------------------
// requestHandoff — owner / orchestrator-A creates the request
// ---------------------------------------------------------------------------

/**
 * Validates and records a handoff request. The actual sending of
 * `task.chain.handoff` happens in the orchestrator-runtime layer so
 * this function stays side-effect-free and easy to test.
 */
export function buildHandoffRequest(
  input: DelegateRequestInput,
  now: Date = new Date(),
): HandoffRequestRecord {
  const payload: ChainHandoffRequestPayload = ChainHandoffRequestPayloadSchema.parse({
    chainId: input.chainId,
    subtaskIds: input.subtaskIds,
    newOrchestratorPeerId: input.newOrchestratorPeerId,
    newOrchestratorOwnerId: input.newOrchestratorOwnerId,
    rationale: input.rationale,
    expiresAt: input.expiresAt,
    goal: input.goal,
    maxChainCostUsd: input.maxChainCostUsd,
    costCeilingUsd: input.costCeilingUsd,
    allowLlm: input.allowLlm,
    createdAt: now.toISOString(),
  });
  return {
    requestId: makeHandoffRequestId(payload.chainId, 1),
    chainId: payload.chainId,
    subtaskIds: payload.subtaskIds,
    newOrchestratorPeerId: payload.newOrchestratorPeerId,
    newOrchestratorOwnerId: payload.newOrchestratorOwnerId,
    rationale: payload.rationale,
    expiresAt: payload.expiresAt,
    status: "pending",
    createdAt: payload.createdAt,
    updatedAt: payload.createdAt,
  };
}

/** Pure validator: throws ZodError on bad input. */
export function parseHandoffRequest(input: unknown): ChainHandoffRequest {
  const payload = ChainHandoffRequestPayloadSchema.parse(input);
  const out: ChainHandoffRequest = {
    chainId: payload.chainId,
    subtaskIds: [...payload.subtaskIds],
    newOrchestratorPeerId: payload.newOrchestratorPeerId,
    newOrchestratorOwnerId: payload.newOrchestratorOwnerId,
    expiresAt: payload.expiresAt,
    createdAt: payload.createdAt,
  };
  if (payload.goal !== undefined) out.goal = payload.goal;
  if (payload.maxChainCostUsd !== undefined) out.maxChainCostUsd = payload.maxChainCostUsd;
  if (payload.costCeilingUsd !== undefined) out.costCeilingUsd = payload.costCeilingUsd;
  if (payload.allowLlm !== undefined) out.allowLlm = payload.allowLlm;
  if (payload.rationale !== undefined) out.rationale = payload.rationale;
  if (payload.iterationMaxRounds !== undefined) out.iterationMaxRounds = payload.iterationMaxRounds;
  if (payload.iterationJudgeMode !== undefined) out.iterationJudgeMode = payload.iterationJudgeMode;
  if (payload.extendMaxStepsPerRound !== undefined) {
    out.extendMaxStepsPerRound = payload.extendMaxStepsPerRound;
  }
  if (payload.iterationState !== undefined) out.iterationState = payload.iterationState;
  if (payload.criticality !== undefined) out.criticality = payload.criticality;
  return out;
}

// ---------------------------------------------------------------------------
// delegateHandoff — orchestrator-A → orchestrator-B
// ---------------------------------------------------------------------------

/**
 * Build the payload that orchestrator-A sends to orchestrator-B to
 * delegate the sub-chain. Side-effect-free.
 */
export function buildDelegatePayload(
  request: HandoffRequestRecord,
  accept: { subChainId: string; subChainMandate: unknown; reportBackByAt: string; estimatedCostUsd: number },
  now: Date = new Date(),
): ChainHandoffDelegatePayload {
  return ChainHandoffDelegatePayloadSchema.parse({
    chainId: request.chainId,
    subtaskIds: request.subtaskIds,
    handoffRequestId: request.requestId,
    subChainId: accept.subChainId,
    subChainMandate: accept.subChainMandate,
    reportBackByAt: accept.reportBackByAt,
    estimatedCostUsd: accept.estimatedCostUsd,
    createdAt: now.toISOString(),
  });
}

/** Parses an inbound `task.chain.delegate` envelope payload. */
export function parseDelegatePayload(input: unknown): ChainHandoffDelegate {
  const p = ChainHandoffDelegatePayloadSchema.parse(input);
  return {
    chainId: p.chainId,
    subtaskIds: [...p.subtaskIds],
    handoffRequestId: p.handoffRequestId,
    subChainId: p.subChainId,
    subChainMandate: p.subChainMandate,
    reportBackByAt: p.reportBackByAt,
    estimatedCostUsd: p.estimatedCostUsd,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// acceptHandoff — orchestrator-B accepts the delegation
// ---------------------------------------------------------------------------

/**
 * Called on orchestrator-B when it receives `task.chain.delegate`. The
 * function:
 *   1. Parses + validates the payload.
 *   2. Verifies the handoff has not expired.
 *   3. Updates the in-memory handoff record to `delegated`.
 *
 * The actual ledger transfer happens at the orchestrator-runtime
 * layer (which has access to the `ChainBudgetLedger`).
 */
export async function acceptHandoff(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  record: HandoffRequestRecord,
  input: AcceptHandoffInput,
  now: Date = new Date(),
): Promise<AcceptHandoffResult> {
  if (!isHandoffLive(record, now)) {
    record.status = "expired";
    record.updatedAt = now.toISOString();
    return { ok: false, reason: "expired" };
  }
  if (isHandoffTerminal(record.status)) {
    return { ok: false, reason: `not_pending:${record.status}` };
  }
  // Build the delegate payload to return to the caller. The caller
  // will sign + send it back to A as the ack.
  const delegate = buildDelegatePayload(
    record,
    {
      subChainId: input.subChainId,
      subChainMandate: input.subChainMandate,
      reportBackByAt: input.reportBackByAt,
      estimatedCostUsd: input.estimatedCostUsd,
    },
    now,
  );
  record.status = "delegated";
  record.subChainId = input.subChainId;
  record.updatedAt = now.toISOString();
  deps.audit?.record({
    type: "chain.handoff.delegated",
    outcome: "allow",
    intent: "task.chain.delegate",
    remotePeerId: record.newOrchestratorPeerId,
    summary: `chainId=${state.chainId} subChainId=${input.subChainId} subtasks=${record.subtaskIds.length}`,
  });
  return { ok: true, delegate };
}

// ---------------------------------------------------------------------------
// arbitrateOwnership — convergence on "who owns what"
// ---------------------------------------------------------------------------

/**
 * The arbitration entry's `seq` is monotonic per chain. We don't
 * maintain a persistent counter here; the caller is expected to track
 * the next seq. We just validate the entry passes the Zod schema.
 */
export function buildArbitrationEntry(
  chainId: string,
  seq: number,
  input: ArbitrateInput,
  now: Date = new Date(),
): ChainArbitrationEntry {
  return {
    chainId,
    arbitrationId: `arbitration_${chainId}_${seq}`,
    seq,
    subtaskIds: [...input.subtaskIds],
    currentOwnerPeerId: input.currentOwnerPeerId,
    currentOwnerOwnerId: input.currentOwnerOwnerId,
    status: input.status,
    createdAt: now.toISOString(),
    ...(input.previousOwnerPeerId !== undefined
      ? { previousOwnerPeerId: input.previousOwnerPeerId }
      : {}),
    ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
  };
}

export function buildArbitrationPayload(
  entry: ChainArbitrationEntry,
  convergeByAt: string,
  now: Date = new Date(),
): ChainArbitrationPayload {
  return ChainArbitrationPayloadSchema.parse({
    chainId: entry.chainId,
    entry,
    convergeByAt,
    createdAt: now.toISOString(),
  });
}

/**
 * Compares a local arbitration entry with a remote one. Returns
 * `true` when the local side has the higher-priority entry and is
 * therefore the canonical owner. The caller is responsible for
 * updating its own state on a loss.
 *
 * Ordering: `seq` is primary, `createdAt` is the tiebreaker. The
 * entry that wins is "more recent" in arbitration terms.
 */
export function isLocalEntryWinning(
  local: ChainArbitrationEntry,
  remote: ChainArbitrationEntry,
): boolean {
  if (local.seq !== remote.seq) return local.seq > remote.seq;
  return new Date(local.createdAt).getTime() >= new Date(remote.createdAt).getTime();
}

/**
 * Applies a remote arbitration payload to a local store. The store is
 * a Map keyed by `subtaskId` (one entry per subtask, so we know who
 * owns each one). The function is pure: it returns a new map.
 */
export function applyArbitrationPayload(
  localStore: Map<string, ChainArbitrationEntry>,
  payload: ChainArbitrationPayload,
): { store: Map<string, ChainArbitrationEntry>; converged: boolean } {
  const next = new Map(localStore);
  let converged = true;
  for (const subtaskId of payload.entry.subtaskIds) {
    const existing = next.get(subtaskId);
    if (!existing) {
      next.set(subtaskId, payload.entry);
      continue;
    }
    const localWins = isLocalEntryWinning(existing, payload.entry);
    if (!localWins) {
      next.set(subtaskId, payload.entry);
    } else {
      converged = false;
    }
  }
  return { store: next, converged };
}
