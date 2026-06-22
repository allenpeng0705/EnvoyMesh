/**
 * Phase 40 — Chain inbound router.
 *
 * A single dispatch function for every `task.chain.*` envelope that arrives
 * via the inbound dispatcher. The router performs:
 *
 * 1. **Schema validation** — uses the matching `TaskChain*PayloadSchema` from
 *    `@envoymesh/protocol`.
 * 2. **Role-policy gate** — `evaluateEnvelopeRolePolicy` from
 *    `@envoymesh/protocol`: all chain intents are `agent↔agent` except
 *    `task.chain.report`, which is `agent→human`.
 * 3. **Capability gate** — orchestrator-receive intents (`task.chain.bid`,
 *    `task.chain.partial`, `task.chain.merge`, worker-originated
 *    `task.chain.heartbeat`) require the local node to advertise
 *    `chain.orchestrate`. Worker-receive intents (`mandate`, `propose`,
 *    `accept`, `cancel`, orchestrator-originated `heartbeat`) only require
 *    the recipient role to be `agent`.
 * 4. **Handler dispatch** — calls the matching orchestrator or worker handler
 *    from `chain-orchestrator.ts` / `chain-worker.ts`. Handlers are injected
 *    via `ChainInboundDeps` for testability.
 *
 * All rejections produce a deterministic `{ ok: false, reason }` and an audit
 * event via `audit.record({ outcome: "deny" })`. The dispatcher in
 * `apps/node/src/index.ts` registers this router as the handler for all
 * 9 chain intents.
 *
 * See docs/agent_network.md §7.6.
 */

import {
  TaskChainAcceptPayloadSchema,
  TaskChainBidPayloadSchema,
  TaskChainCancelPayloadSchema,
  TaskChainHeartbeatPayloadSchema,
  TaskChainMandatePayloadSchema,
  TaskChainMergePayloadSchema,
  TaskChainPartialPayloadSchema,
  TaskChainProposePayloadSchema,
  TaskChainReportPayloadSchema,
  evaluateEnvelopeRolePolicy,
  type EnvoyEnvelope,
  type TaskChainAcceptPayload,
  type TaskChainBidPayload,
  type TaskChainCancelPayload,
  type TaskChainHeartbeatPayload,
  type TaskChainMandatePayload,
  type TaskChainMergePayload,
  type TaskChainPartialPayload,
  type TaskChainProposePayload,
  type TaskChainReportPayload,
} from "@envoymesh/protocol";

import type {
  ChainInboundDeps,
  ChainInboundRejectReason,
  ChainInboundDecision,
  InboundChainState,
} from "./chain-inbound-types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Intents delivered **to the orchestrator**. The recipient must advertise
 * `chain.orchestrate` and supply matching `InboundChainState`.
 */
const ORCHESTRATOR_RECEIVE_INTENTS = new Set<string>([
  "task.chain.bid",
  "task.chain.partial",
  "task.chain.merge",
]);

/**
 * Intents delivered **to workers**. The recipient must be an agent but does
 * not need `chain.orchestrate`.
 */
const WORKER_RECEIVE_INTENTS = new Set<string>([
  "task.chain.mandate",
  "task.chain.propose",
  "task.chain.accept",
  "task.chain.cancel",
]);

// ---------------------------------------------------------------------------
// Public dispatch entrypoint
// ---------------------------------------------------------------------------

export async function dispatchChainEnvelope(
  deps: ChainInboundDeps,
  envelope: EnvoyEnvelope,
  state?: InboundChainState,
): Promise<ChainInboundDecision> {
  const intent = envelope.intent;

  // Step 1 — schema validation (intents carry typed payloads)
  const parsed = parsePayloadByIntent(intent, envelope.payload);
  if (!parsed.ok) {
    await emitDeny(deps, envelope, parsed.reason);
    return parsed;
  }

  // Step 2 — role-policy gate (agent→agent, etc.)
  const policy = evaluateEnvelopeRolePolicy(intent, envelope.senderRole, envelope.recipientRole);
  if (!policy.ok) {
    const reason: ChainInboundRejectReason = "role_policy_denied";
    await emitDeny(deps, envelope, reason);
    return { ok: false, reason };
  }

  // Step 3 — capability gate (orchestrator vs. worker)
  const orchestratorReceive =
    ORCHESTRATOR_RECEIVE_INTENTS.has(intent) ||
    (intent === "task.chain.heartbeat" && state !== undefined);
  if (orchestratorReceive) {
    if (!deps.nodeCapabilities.includes("chain.orchestrate")) {
      const reason: ChainInboundRejectReason = "missing_orchestrator_capability";
      await emitDeny(deps, envelope, reason);
      return { ok: false, reason };
    }
    if (!state) {
      const reason: ChainInboundRejectReason = "handler_denied";
      await emitDeny(deps, envelope, reason);
      return { ok: false, reason };
    }
  } else if (WORKER_RECEIVE_INTENTS.has(intent)) {
    // Worker intents are agent↔agent per role policy (already enforced above).
  } else if (intent === "task.chain.heartbeat") {
    // Orchestrator-originated heartbeat to a worker — no chain.orchestrate required.
  } else if (intent !== "task.chain.report") {
    const reason: ChainInboundRejectReason = "unknown_chain_intent";
    await emitDeny(deps, envelope, reason);
    return { ok: false, reason };
  }

  // Step 4 — handler dispatch
  return await dispatchToHandler(deps, intent, envelope, parsed.payload, state);
}

// ---------------------------------------------------------------------------
// Internal — payload parsing
// ---------------------------------------------------------------------------

function parsePayloadByIntent(
  intent: string,
  payload: unknown,
):
  | { ok: true; payload: ChainPayloadUnion }
  | { ok: false; reason: ChainInboundRejectReason } {
  switch (intent) {
    case "task.chain.mandate":
      return wrap(TaskChainMandatePayloadSchema, payload, "malformed_mandate_payload");
    case "task.chain.propose":
      return wrap(TaskChainProposePayloadSchema, payload, "malformed_propose_payload");
    case "task.chain.bid":
      return wrap(TaskChainBidPayloadSchema, payload, "malformed_bid_payload");
    case "task.chain.accept":
      return wrap(TaskChainAcceptPayloadSchema, payload, "malformed_accept_payload");
    case "task.chain.partial":
      return wrap(TaskChainPartialPayloadSchema, payload, "malformed_partial_payload");
    case "task.chain.merge":
      return wrap(TaskChainMergePayloadSchema, payload, "malformed_merge_payload");
    case "task.chain.cancel":
      return wrap(TaskChainCancelPayloadSchema, payload, "malformed_cancel_payload");
    case "task.chain.heartbeat":
      return wrap(TaskChainHeartbeatPayloadSchema, payload, "malformed_heartbeat_payload");
    case "task.chain.report":
      return wrap(TaskChainReportPayloadSchema, payload, "malformed_report_payload");
    default:
      return { ok: false, reason: "unknown_chain_intent" };
  }
}

function wrap<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  payload: unknown,
  rejectReason: ChainInboundRejectReason,
): { ok: true; payload: T } | { ok: false; reason: ChainInboundRejectReason } {
  const r = schema.safeParse(payload);
  if (!r.success) {
    return { ok: false, reason: rejectReason };
  }
  return { ok: true, payload: r.data };
}

type ChainPayloadUnion =
  | TaskChainMandatePayload
  | TaskChainProposePayload
  | TaskChainBidPayload
  | TaskChainAcceptPayload
  | TaskChainPartialPayload
  | TaskChainMergePayload
  | TaskChainCancelPayload
  | TaskChainHeartbeatPayload
  | TaskChainReportPayload;

// ---------------------------------------------------------------------------
// Internal — handler dispatch
// ---------------------------------------------------------------------------

async function dispatchToHandler(
  deps: ChainInboundDeps,
  intent: string,
  envelope: EnvoyEnvelope,
  payload: ChainPayloadUnion,
  state?: InboundChainState,
): Promise<ChainInboundDecision> {
  try {
    switch (intent) {
      case "task.chain.propose":
        return await deps.handleWorkerPropose(envelope, payload as TaskChainProposePayload);
      case "task.chain.mandate":
        return await deps.handleWorkerMandate(envelope, payload as TaskChainMandatePayload);
      case "task.chain.bid":
        return await deps.handleOrchestratorBid(
          envelope,
          payload as TaskChainBidPayload,
          state!,
        );
      case "task.chain.accept":
        return await deps.handleWorkerAccept(envelope, payload as TaskChainAcceptPayload);
      case "task.chain.partial":
        return await deps.handleOrchestratorPartial(
          envelope,
          payload as TaskChainPartialPayload,
          state!,
        );
      case "task.chain.cancel":
        return await deps.handleWorkerCancel(envelope, payload as TaskChainCancelPayload);
      case "task.chain.merge":
        return await deps.handleOrchestratorMerge(
          envelope,
          payload as TaskChainMergePayload,
          state!,
        );
      case "task.chain.heartbeat":
        if (state) {
          return await deps.handleOrchestratorHeartbeat(
            envelope,
            payload as TaskChainHeartbeatPayload,
            state,
          );
        }
        return await deps.handleWorkerHeartbeat(
          envelope,
          payload as TaskChainHeartbeatPayload,
        );
      case "task.chain.report":
        return await deps.handleOwnerReport(envelope, payload as TaskChainReportPayload);
      default:
        return { ok: false, reason: "unknown_chain_intent" };
    }
  } catch (err) {
    deps.audit.record({
      type: "chain.handler_exception",
      outcome: "deny",
      intent,
      remotePeerId: envelope.senderPeerId,
      correlationId: envelope.correlationId,
      summary: `chain handler threw: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { ok: false, reason: "handler_exception" };
  }
}

// ---------------------------------------------------------------------------
// Internal — audit emission
// ---------------------------------------------------------------------------

async function emitDeny(
  deps: ChainInboundDeps,
  envelope: EnvoyEnvelope,
  reason: ChainInboundRejectReason,
): Promise<void> {
  await deps.audit.record({
    type: "chain.inbound_denied",
    outcome: "deny",
    intent: envelope.intent,
    remotePeerId: envelope.senderPeerId,
    correlationId: envelope.correlationId,
    summary: reason,
  });
}

// ---------------------------------------------------------------------------
// Re-exports for callers
// ---------------------------------------------------------------------------

export { ORCHESTRATOR_RECEIVE_INTENTS, WORKER_RECEIVE_INTENTS };
