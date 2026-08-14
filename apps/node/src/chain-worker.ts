/**
 * Phase 40 — Worker-side chain handlers (the inbound handler functions and
 * outbound helpers that this node uses when it is the worker in a chain).
 *
 * Inbound handlers (called by `chain-inbound.ts`):
 *   - `handleWorkerPropose` — orchestrator proposes a subtask. Worker computes
 *     a bid via `chain-bid-strategy.ts` and sends `task.chain.bid`.
 *   - `handleWorkerBid` — orchestrator echoes our bid (no-op for worker).
 *   - `handleWorkerCancel` — orchestrator (or owner) cancels; worker aborts
 *     any in-flight execution and releases any held partials.
 *
 * Outbound helpers:
 *   - `submitChainBid` — sign and send `task.chain.bid` to the orchestrator.
 *   - `deliverChainPartial` — send `task.chain.partial` mid-execution.
 *   - `deliverChainComplete` — send the terminal `task.result` (legacy intent)
 *     plus a `task.chain.partial` with `isFinal: true`.
 *
 * Crash-recovery replay:
 *   - `replayInFlightChainSubtasks` — on worker startup, scan the journal for
 *     subtasks that were `awarded` but never received a terminal result. For
 *     each, send a final `task.chain.partial` with `note: "replayed after
 *     crash"`. The orchestrator treats these as ambiguous and may re-issue or
 *     cancel depending on its own policy.
 *
 * **Stale-bid protection:** the worker tracks every `bidExpiresAt` for an
 * outstanding bid. If the orchestrator's `task.chain.accept` arrives after
 * `bidExpiresAt`, the worker emits a `chain.bid_expired` audit event and
 * declines the award (returning `{ ok: false }` from `handleWorkerBid`).
 *
 * See docs/agent_network.md §7.4.
 */

import {
  ChainSubtaskBidSchema,
  TaskChainAcceptPayloadSchema,
  TaskChainBidPayloadSchema,
  TaskChainPartialPayloadSchema,
  ChainSubtaskPartialSchema,
  type ChainSubtask,
  type ChainSubtaskBid,
  type EnvoyEnvelope,
  type TaskChainAcceptPayload,
  type TaskChainBidPayload,
  type TaskChainCancelPayload,
  type TaskChainHeartbeatPayload,
  type TaskChainMandatePayload,
  type TaskChainPartialPayload,
  type TaskChainProposePayload,
  type TaskChainStatusPayload,
} from "@envoymesh/protocol";
import { signCanonicalPayload } from "@envoymesh/identity";

import { computeChainBid, isChainBidExpired, type ChainBidWorkerContext } from "./chain-bid-strategy.js";
import type { ChainAuditSink, ChainInboundDecision } from "./chain-inbound-types.js";
import { chainLog, chainWarn, shortPeerId } from "./chain-debug.js";

// ---------------------------------------------------------------------------
// Outbound surface — what the worker needs from the runtime to send envelopes
// ---------------------------------------------------------------------------

export interface ChainWorkerSendDeps {
  /** Send a signed envelope to the recipient peer. Returns false on send failure. */
  sendEnvelope: (
    peerId: string,
    envelope: EnvoyEnvelope,
    payload: unknown,
  ) => Promise<boolean>;
  /** Current "now" — overridable in tests. */
  now?: () => Date;
  /** Local worker's signing key (PEM). */
  signingKeyPem: string;
  /** Local worker's public key (PEM, base64-encoded for envelope). */
  publicKeyPem: string;
  /** Local worker peer id (for envelope.senderPeerId). */
  workerPeerId: string;
  /** Local worker owner id. */
  workerOwnerId: string;
  /** Owner-signed agent credential for remote verification of envoy_agent_* envelopes. */
  agentCredential?: EnvoyEnvelope["agentCredential"];
}

export interface ChainWorkerHandlerDeps extends ChainWorkerSendDeps {
  audit: ChainAuditSink;
  /** Bid-strategy context for this worker (capability tag → base cost, ETA). */
  workerContext: ChainBidWorkerContext;
  /**
   * In-memory cache of pending bid expirations: subtaskId → bidExpiresAt. On
   * `task.chain.accept` we look up the entry; if missing or expired, we
   * reject the award with `chain.bid_expired`.
   */
  pendingBidExpirations: Map<string, string>;
  /**
   * Agent Network worker engine readiness for **this node's** configured engine
   * (Built-in OpenClaw or Ext Agent). When false, decline propose/accept.
   * See docs/agent-network-engine.md.
   */
  isAgentNetworkEngineReady?: () => boolean;
  /** Audit reason when declining because the configured AN engine is down. */
  agentNetworkEngineDenyReason?: () => string;
  /** Optional: persist/display read-only job snapshots from the assigner. */
  onObservedStatus?: (orchestratorPeerId: string, payload: TaskChainStatusPayload) => void;
  /**
   * Phase 59E — whole-chain cancel (no subtaskId): GC local job input workspace.
   */
  onWholeChainCancelled?: (chainId: string) => void;
  /** Optional executor — runs the task body and emits partials. */
  executeSubtask?: (
    subtask: ChainSubtask,
    onPartial: (partial: TaskChainPartialPayload) => Promise<void>,
    opts?: { inputArtifacts?: import("@envoymesh/protocol").NamedArtifact[] },
  ) => Promise<{ ok: boolean; finalNote?: string }>;
}

function refuseIfEngineUnavailable(
  deps: ChainWorkerHandlerDeps,
  envelope: EnvoyEnvelope,
  intent: string,
): ChainInboundDecision | null {
  if (deps.isAgentNetworkEngineReady?.() !== false) return null;
  deps.audit.record({
    type: "chain.bid_declined",
    outcome: "deny",
    intent,
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId,
    summary: deps.agentNetworkEngineDenyReason?.() ?? "an_engine_unavailable",
  });
  return { ok: false, reason: "handler_denied" };
}

// ---------------------------------------------------------------------------
// 1. handleWorkerPropose — orchestrator → worker (subtask offer)
// ---------------------------------------------------------------------------

export async function handleWorkerPropose(
  deps: ChainWorkerHandlerDeps,
  envelope: EnvoyEnvelope,
  payload: TaskChainProposePayload,
): Promise<ChainInboundDecision> {
  const engineBlock = refuseIfEngineUnavailable(deps, envelope, "task.chain.propose");
  if (engineBlock) {
    chainWarn("worker", "propose declined — AN engine unavailable", {
      subtaskId: payload.subtask.subtaskId,
      skill: payload.subtask.requiredSkill,
      from: shortPeerId(envelope.senderPeerId),
    });
    return engineBlock;
  }

  const subtask = payload.subtask;
  chainLog("worker", "propose received", {
    chainId: subtask.chainId,
    subtaskId: subtask.subtaskId,
    skill: subtask.requiredSkill,
    preferred: shortPeerId(subtask.preferredWorkerPeerId),
    from: shortPeerId(envelope.senderPeerId),
  });
  const now = (deps.now ?? (() => new Date()))();

  // Compute bid via the worker-context strategy.
  const bidResult = computeChainBid({
    subtask,
    worker: deps.workerContext,
    now,
  });
  if (!bidResult.ok) {
    chainWarn("worker", "bid declined", {
      subtaskId: subtask.subtaskId,
      reason: bidResult.reason,
    });
    deps.audit.record({
      type: "chain.bid_declined",
      outcome: "deny",
      intent: "task.chain.bid",
      remotePeerId: envelope.senderPeerId,
      correlationId: envelope.correlationId,
      summary: bidResult.reason,
    });
    return { ok: false, reason: "handler_denied" };
  }

  // Track expiration so we can reject stale accepts.
  deps.pendingBidExpirations.set(subtask.subtaskId, bidResult.bid.bidExpiresAt);

  // Send the bid envelope.
  const sent = await submitChainBid(deps, envelope.senderPeerId, bidResult.bid, payload);
  if (!sent) {
    deps.pendingBidExpirations.delete(subtask.subtaskId);
    chainWarn("worker", "bid send failed", {
      subtaskId: subtask.subtaskId,
      orch: shortPeerId(envelope.senderPeerId),
    });
    deps.audit.record({
      type: "chain.bid_send_failed",
      outcome: "deny",
      intent: "task.chain.bid",
      remotePeerId: envelope.senderPeerId,
      correlationId: envelope.correlationId,
      summary: "send returned false",
    });
    return { ok: false, reason: "handler_denied" };
  }

  chainLog("worker", "bid sent", {
    subtaskId: subtask.subtaskId,
    costUsd: bidResult.bid.proposedCostUsd,
    orch: shortPeerId(envelope.senderPeerId),
  });
  deps.audit.record({
    type: "chain.bid_sent",
    outcome: "allow",
    intent: "task.chain.bid",
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId,
    summary: `bid costUsd=${bidResult.bid.proposedCostUsd} expiresAt=${bidResult.bid.bidExpiresAt}`,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 2. handleWorkerMandate — orchestrator broadcasts chain constraints
// ---------------------------------------------------------------------------

export async function handleWorkerMandate(
  deps: ChainWorkerHandlerDeps,
  envelope: EnvoyEnvelope,
  payload: TaskChainMandatePayload,
): Promise<ChainInboundDecision> {
  deps.audit.record({
    type: "chain.mandate_received",
    outcome: "record",
    intent: "task.chain.mandate",
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId,
    summary: `chainId=${payload.chainMandate.chainId}`,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. handleWorkerAccept — orchestrator awards a subtask to this worker
// ---------------------------------------------------------------------------

export async function handleWorkerAccept(
  deps: ChainWorkerHandlerDeps,
  envelope: EnvoyEnvelope,
  payload: TaskChainAcceptPayload,
): Promise<ChainInboundDecision> {
  const engineBlock = refuseIfEngineUnavailable(deps, envelope, "task.chain.accept");
  if (engineBlock) return engineBlock;

  const subtaskId = payload.award.subtaskId;
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const check = checkBidExpiration(deps, subtaskId, nowMs);
  if (!check.ok) {
    // Direct-assign: orchestrator awards a pre-selected worker with a subtask
    // snapshot and no prior bid. Still reject truly expired bids.
    const directAssignOk = check.reason === "no_pending_bid" && Boolean(payload.subtask);
    if (!directAssignOk) {
      deps.audit.record({
        type: "chain.bid_expired",
        outcome: "deny",
        intent: "task.chain.accept",
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId,
        summary: check.reason,
      });
      return { ok: false, reason: "handler_denied" };
    }
  }
  acceptChainAward(deps, subtaskId);
  chainLog("worker", "award accepted", {
    subtaskId,
    costUsd: payload.award.acceptedCostUsd,
    from: shortPeerId(envelope.senderPeerId),
  });
  deps.audit.record({
    type: "chain.award_accepted",
    outcome: "allow",
    intent: "task.chain.accept",
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId,
    summary: `subtask=${subtaskId} costUsd=${payload.award.acceptedCostUsd}`,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 4. handleWorkerHeartbeat — orchestrator liveness ping (no-op ack)
// ---------------------------------------------------------------------------

export async function handleWorkerHeartbeat(
  deps: ChainWorkerHandlerDeps,
  envelope: EnvoyEnvelope,
  payload: TaskChainHeartbeatPayload,
): Promise<ChainInboundDecision> {
  void payload;
  deps.audit.record({
    type: "chain.heartbeat_received",
    outcome: "record",
    intent: "task.chain.heartbeat",
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId,
    summary: `subtask=${payload.subtaskId}`,
  });
  return { ok: true };
}

/**
 * Read-only job snapshot from the assigner. Persistence/UI is handled by the
 * runtime via `onObservedStatus` when wired; this handler only audits.
 */
export async function handleWorkerStatus(
  deps: ChainWorkerHandlerDeps,
  envelope: EnvoyEnvelope,
  payload: TaskChainStatusPayload,
): Promise<ChainInboundDecision> {
  deps.audit.record({
    type: "chain.status_received",
    outcome: "record",
    intent: "task.chain.status",
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId ?? payload.chainId,
    summary:
      `phase=${payload.phase} awarded=${payload.awardedCount}/${payload.subtaskCount}` +
      ` partial=${payload.partialCount} mode=${payload.awardMode}`,
  });
  if (typeof deps.onObservedStatus === "function") {
    try {
      deps.onObservedStatus(envelope.senderPeerId, payload);
    } catch {
      /* best-effort UI hook */
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 5. handleWorkerCancel — orchestrator (or owner) cancels a subtask
// ---------------------------------------------------------------------------

export async function handleWorkerCancel(
  deps: ChainWorkerHandlerDeps,
  envelope: EnvoyEnvelope,
  payload: TaskChainCancelPayload,
): Promise<ChainInboundDecision> {
  // Drop any pending bid for this subtask.
  if (payload.subtaskId) {
    deps.pendingBidExpirations.delete(payload.subtaskId);
  }

  deps.audit.record({
    type: payload.subtaskId ? "chain.subtask_cancelled" : "chain.cancelled",
    outcome: "record",
    intent: "task.chain.cancel",
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId,
    summary: payload.reason,
  });
  if (!payload.subtaskId) {
    try {
      deps.onWholeChainCancelled?.(payload.chainId);
    } catch (err) {
      console.warn(`[chain.input] worker GC on cancel failed for ${payload.chainId}:`, err);
    }
  }
  // The worker-runtime hook for actual task abort is the `executeSubtask`
  // contract — callers wire their executor to honor this by tracking
  // cancelled subtaskIds externally.
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 4. submitChainBid — outbound helper
// ---------------------------------------------------------------------------

export async function submitChainBid(
  deps: ChainWorkerSendDeps,
  recipientPeerId: string,
  bid: ChainSubtaskBid,
  propose: TaskChainProposePayload,
): Promise<boolean> {
  const payload = TaskChainBidPayloadSchema.parse({ bid });
  const now = (deps.now ?? (() => new Date()))();
  const envelope = buildChainEnvelope({
    intent: "task.chain.bid",
    senderPeerId: deps.workerPeerId,
    senderPublicKey: deps.publicKeyPem,
    recipientPeerId,
    recipientRole: "agent",
    payload,
    createdAt: now.toISOString(),
    correlationId: undefined,
    signingKeyPem: deps.signingKeyPem,
    agentCredential: deps.agentCredential,
  });
  return deps.sendEnvelope(recipientPeerId, envelope, payload);
}

// ---------------------------------------------------------------------------
// 5. deliverChainPartial — outbound helper (mid-execution progress)
// ---------------------------------------------------------------------------

export async function deliverChainPartial(
  deps: ChainWorkerSendDeps,
  recipientPeerId: string,
  partial: TaskChainPartialPayload,
  correlationId?: string,
): Promise<boolean> {
  // `partial` is already a `TaskChainPartialPayload`. Re-validate for
  // defense-in-depth (zero-cost when the input is already valid).
  const payload = TaskChainPartialPayloadSchema.parse(partial);
  const now = (deps.now ?? (() => new Date()))();
  const envelope = buildChainEnvelope({
    intent: "task.chain.partial",
    senderPeerId: deps.workerPeerId,
    senderPublicKey: deps.publicKeyPem,
    recipientPeerId,
    recipientRole: "agent",
    payload,
    createdAt: now.toISOString(),
    correlationId,
    signingKeyPem: deps.signingKeyPem,
    agentCredential: deps.agentCredential,
  });
  return deps.sendEnvelope(recipientPeerId, envelope, payload);
}

// ---------------------------------------------------------------------------
// 6. checkBidExpiration — call before honoring a task.chain.accept
// ---------------------------------------------------------------------------

export function checkBidExpiration(
  deps: { pendingBidExpirations: Map<string, string> },
  subtaskId: string,
  nowMs: number,
): { ok: true } | { ok: false; reason: "no_pending_bid" | "bid_expired"; expiresAt?: string } {
  const expiresAt = deps.pendingBidExpirations.get(subtaskId);
  if (!expiresAt) return { ok: false, reason: "no_pending_bid" };
  if (isChainBidExpired(expiresAt, nowMs)) {
    deps.pendingBidExpirations.delete(subtaskId);
    return { ok: false, reason: "bid_expired", expiresAt };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 7. acceptChainAward — promote pending bid → committed (called after accept)
// ---------------------------------------------------------------------------

export function acceptChainAward(
  deps: { pendingBidExpirations: Map<string, string> },
  subtaskId: string,
): boolean {
  return deps.pendingBidExpirations.delete(subtaskId);
}

// ---------------------------------------------------------------------------
// 8. replayInFlightChainSubtasks — crash-recovery replay
// ---------------------------------------------------------------------------

export interface ReplaySubtaskInput {
  subtask: ChainSubtask;
  awardedAt: string;
  /** Last partial seq the worker emitted (0 if none). */
  lastSeq: number;
  /** Orchestrator peer id (recipient of the replay partial). */
  orchestratorPeerId: string;
}

export async function replayInFlightChainSubtasks(
  deps: ChainWorkerSendDeps & { audit: ChainAuditSink },
  inFlight: ReplaySubtaskInput[],
): Promise<{ replayed: number; failed: number }> {
  let replayed = 0;
  let failed = 0;
  const now = (deps.now ?? (() => new Date()))();

  for (const entry of inFlight) {
    const partial = TaskChainPartialPayloadSchema.parse({
      partial: ChainSubtaskPartialSchema.parse({
        version: "0.1",
        subtaskId: entry.subtask.subtaskId,
        chainId: entry.subtask.chainId,
        workerPeerId: deps.workerPeerId,
        seq: entry.lastSeq + 1,
        isFinal: true,
        note: `replayed after crash; awardedAt=${entry.awardedAt}`,
        createdAt: now.toISOString(),
      }),
    });
    void partial; // validate eagerly; deliverChainPartial will re-parse
    const sent = await deliverChainPartial(deps, entry.orchestratorPeerId, partial);
    if (sent) {
      replayed++;
      deps.audit.record({
        type: "chain.replay_partial_sent",
        outcome: "record",
        intent: "task.chain.partial",
        remotePeerId: entry.orchestratorPeerId,
        correlationId: entry.subtask.chainId,
        summary: `subtask=${entry.subtask.subtaskId} seq=${entry.lastSeq + 1}`,
      });
    } else {
      failed++;
      deps.audit.record({
        type: "chain.replay_partial_failed",
        outcome: "deny",
        intent: "task.chain.partial",
        remotePeerId: entry.orchestratorPeerId,
        correlationId: entry.subtask.chainId,
        summary: `subtask=${entry.subtask.subtaskId}`,
      });
    }
  }
  return { replayed, failed };
}

// ---------------------------------------------------------------------------
// Internal — envelope construction
// ---------------------------------------------------------------------------

interface BuildChainEnvelopeInput {
  intent:
    | "task.chain.bid"
    | "task.chain.partial"
    | "task.chain.cancel"
    | "task.chain.heartbeat"
    | "task.chain.report";
  senderPeerId: string;
  senderPublicKey: string;
  recipientPeerId: string;
  recipientRole: "human" | "agent" | "system";
  payload: unknown;
  createdAt: string;
  correlationId?: string;
  signingKeyPem: string;
  agentCredential?: EnvoyEnvelope["agentCredential"];
}

function buildChainEnvelope(input: BuildChainEnvelopeInput): EnvoyEnvelope {
  if (!input.agentCredential) {
    chainWarn("envelope", "missing agentCredential — remote peers will reject as invalid signature", {
      intent: input.intent,
      sender: shortPeerId(input.senderPeerId),
    });
  }
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
    ...(input.agentCredential ? { agentCredential: input.agentCredential } : {}),
  };
  const signature = signCanonicalPayload(unsigned, input.signingKeyPem);
  return { ...(unsigned as object), signature } as EnvoyEnvelope;
}

function randomString(): string {
  return Math.random().toString(36).slice(2, 12);
}

// Re-export schemas/types callers may need
export { ChainSubtaskBidSchema };