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
 *    `task.chain.heartbeat`) require a live orch runtime for that chainId
 *    (preferred), or else a static EMP `chain.orchestrate` tag when no
 *    runtime is present. Handoff intents always require `chain.orchestrate`.
 *    Worker-receive intents (`mandate`, `propose`, `accept`, `cancel`,
 *    orchestrator-originated `heartbeat`) only require recipient role `agent`.
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
  TaskChainStatusPayloadSchema,
  ChainHandoffRequestPayloadSchema,
  ChainHandoffDelegatePayloadSchema,
  ChainRelayRouteSchema,
  ChainArbitrationPayloadSchema,
  TaskChainOwnershipPayloadSchema,
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
  type TaskChainStatusPayload,
  type ChainHandoffRequestPayload,
  type ChainHandoffDelegatePayload,
  type ChainRelayRoute,
  type ChainArbitrationPayload,
  type TaskChainOwnershipPayload,
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
 * Intents delivered **to the orchestrator**. Prefer a live orch runtime
 * (`InboundChainState`); without one, require EMP `chain.orchestrate`.
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
  "task.chain.status",
  // Phase 64A — creator receives Assigner ownership notify without chain.orchestrate.
  "task.chain.ownership",
]);

/**
 * Phase 40E — Cross-orchestrator / cross-home intents. All are `agent↔agent`
 * (enforced by the role-policy table) and require `chain.orchestrate` on the
 * recipient, since both sides are acting as orchestrators.
 */
const HANDOFF_INTENTS = new Set<string>([
  "task.chain.handoff",
  "task.chain.delegate",
  "task.chain.relay",
  "task.chain.arbitration",
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
    // Live orchestrator runtime for this chainId proves we are the orch —
    // do not also require a static EMP `chain.orchestrate` tag. Home nodes
    // that launch Team jobs often omit it from capability-manifest.json;
    // after local loopback delivery, bids would otherwise be denied here.
    if (!state) {
      if (!deps.nodeCapabilities.includes("chain.orchestrate")) {
        const reason: ChainInboundRejectReason = "missing_orchestrator_capability";
        await emitDeny(deps, envelope, reason);
        return { ok: false, reason };
      }
      const reason: ChainInboundRejectReason = "handler_denied";
      await emitDeny(deps, envelope, reason);
      return { ok: false, reason };
    }
  } else if (WORKER_RECEIVE_INTENTS.has(intent)) {
    // Worker intents are agent↔agent per role policy (already enforced above).
  } else if (HANDOFF_INTENTS.has(intent)) {
    // Phase 40E — orchestrator↔orchestrator intents. Require chain.orchestrate.
    if (!deps.nodeCapabilities.includes("chain.orchestrate")) {
      const reason: ChainInboundRejectReason = "missing_orchestrator_capability";
      await emitDeny(deps, envelope, reason);
      return { ok: false, reason };
    }
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
    case "task.chain.status":
      return wrap(TaskChainStatusPayloadSchema, payload, "malformed_status_payload");
    case "task.chain.ownership":
      return wrap(TaskChainOwnershipPayloadSchema, payload, "malformed_ownership_payload");
    case "task.chain.report":
      return wrap(TaskChainReportPayloadSchema, payload, "malformed_report_payload");
    case "task.chain.handoff":
      return wrap(ChainHandoffRequestPayloadSchema, payload, "malformed_handoff_payload");
    case "task.chain.delegate":
      return wrap(ChainHandoffDelegatePayloadSchema, payload, "malformed_delegate_payload");
    case "task.chain.relay":
      return wrap(ChainRelayRouteSchema, payload, "malformed_relay_payload");
    case "task.chain.arbitration":
      return wrap(ChainArbitrationPayloadSchema, payload, "malformed_arbitration_payload");
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
  | TaskChainStatusPayload
  | TaskChainReportPayload
  | ChainHandoffRequestPayload
  | ChainHandoffDelegatePayload
  | ChainRelayRoute
  | ChainArbitrationPayload
  | TaskChainOwnershipPayload;

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
      case "task.chain.status":
        return await deps.handleWorkerStatus(envelope, payload as TaskChainStatusPayload);
      case "task.chain.ownership":
        if (!deps.handleOwnershipNotify) {
          return { ok: false, reason: "no_ownership_handler" };
        }
        return await deps.handleOwnershipNotify(
          envelope,
          payload as TaskChainOwnershipPayload,
        );
      case "task.chain.report":
        return await deps.handleOwnerReport(envelope, payload as TaskChainReportPayload);
      case "task.chain.handoff":
        if (!deps.handleHandoffRequest) {
          return { ok: false, reason: "no_handoff_handler" };
        }
        return await deps.handleHandoffRequest(
          envelope,
          payload as ChainHandoffRequestPayload,
        );
      case "task.chain.delegate":
        if (!deps.handleDelegate) {
          return { ok: false, reason: "no_handoff_handler" };
        }
        return await deps.handleDelegate(envelope, payload as ChainHandoffDelegatePayload);
      case "task.chain.relay":
        if (!deps.handleRelay) {
          return { ok: false, reason: "no_handoff_handler" };
        }
        return await deps.handleRelay(envelope, payload as ChainRelayRoute);
      case "task.chain.arbitration":
        if (!deps.handleArbitration) {
          return { ok: false, reason: "no_handoff_handler" };
        }
        return await deps.handleArbitration(envelope, payload as ChainArbitrationPayload);
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

export { ORCHESTRATOR_RECEIVE_INTENTS, WORKER_RECEIVE_INTENTS, HANDOFF_INTENTS };
