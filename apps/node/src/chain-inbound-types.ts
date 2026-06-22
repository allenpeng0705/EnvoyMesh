/**
 * Phase 40 — Inbound types for the chain dispatcher.
 *
 * These types are split out from `chain-inbound.ts` so that the dispatcher
 * can be tested in isolation without pulling in the full orchestrator /
 * worker implementations. Concrete handlers live in `chain-orchestrator.ts`
 * and `chain-worker.ts`.
 */

import type {
  Capability,
  EnvoyEnvelope,
  TaskChainAcceptPayload,
  TaskChainBidPayload,
  TaskChainCancelPayload,
  TaskChainHeartbeatPayload,
  TaskChainMandatePayload,
  TaskChainMergePayload,
  TaskChainPartialPayload,
  TaskChainProposePayload,
  TaskChainReportPayload,
} from "@envoymesh/protocol";

/**
 * Minimal structural type for the bits of `ChainState` that the inbound
 * handlers touch. We deliberately do not import `ChainState` from
 * `chain-orchestrator.ts` here to avoid a circular dependency — the real
 * type lives there and handlers receive the actual instance at runtime.
 */
export interface InboundChainState {
  chainId: string;
  lastHeartbeatAt: Map<string, number>;
  lastConfidence: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Decision shape returned by the dispatcher
// ---------------------------------------------------------------------------

export type ChainInboundRejectReason =
  | "role_policy_denied"
  | "missing_orchestrator_capability"
  | "unknown_chain_intent"
  | "malformed_mandate_payload"
  | "malformed_propose_payload"
  | "malformed_bid_payload"
  | "malformed_accept_payload"
  | "malformed_partial_payload"
  | "malformed_merge_payload"
  | "malformed_cancel_payload"
  | "malformed_heartbeat_payload"
  | "malformed_report_payload"
  | "handler_exception"
  | "handler_denied";

export type ChainInboundDecision =
  | { ok: true; handlerResult?: unknown }
  | { ok: false; reason: ChainInboundRejectReason };

// ---------------------------------------------------------------------------
// Audit sink
// ---------------------------------------------------------------------------

export interface ChainAuditSink {
  record(event: {
    type: string;
    outcome: "allow" | "deny" | "record";
    intent: string;
    remotePeerId?: string;
    correlationId?: string;
    summary?: string;
  }): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Handler interface — what the dispatcher needs from the orchestrator / worker
// ---------------------------------------------------------------------------

export interface ChainInboundDeps {
  audit: ChainAuditSink;
  /**
   * This node's advertised capabilities (from Agent Card / device cert).
   * Used for the orchestrator-receive capability gate: intents that arrive
   * at the orchestrator (`task.chain.bid`, `task.chain.partial`, etc.)
   * require `chain.orchestrate`.
   */
  nodeCapabilities: Capability[];

  // Worker-side handlers (called when this node is acting as a worker agent)
  handleWorkerPropose: (
    envelope: EnvoyEnvelope,
    payload: TaskChainProposePayload,
  ) => Promise<ChainInboundDecision>;
  handleWorkerMandate: (
    envelope: EnvoyEnvelope,
    payload: TaskChainMandatePayload,
  ) => Promise<ChainInboundDecision>;
  handleWorkerAccept: (
    envelope: EnvoyEnvelope,
    payload: TaskChainAcceptPayload,
  ) => Promise<ChainInboundDecision>;
  handleWorkerCancel: (
    envelope: EnvoyEnvelope,
    payload: TaskChainCancelPayload,
  ) => Promise<ChainInboundDecision>;
  handleWorkerHeartbeat: (
    envelope: EnvoyEnvelope,
    payload: TaskChainHeartbeatPayload,
  ) => Promise<ChainInboundDecision>;

  // Orchestrator-side handlers (called when this node is the orchestrator agent)
  handleOrchestratorBid: (
    envelope: EnvoyEnvelope,
    payload: TaskChainBidPayload,
    state: InboundChainState,
  ) => Promise<ChainInboundDecision>;
  handleOrchestratorPartial: (
    envelope: EnvoyEnvelope,
    payload: TaskChainPartialPayload,
    state: InboundChainState,
  ) => Promise<ChainInboundDecision>;
  handleOrchestratorMerge: (
    envelope: EnvoyEnvelope,
    payload: TaskChainMergePayload,
    state: InboundChainState,
  ) => Promise<ChainInboundDecision>;
  handleOrchestratorHeartbeat: (
    envelope: EnvoyEnvelope,
    payload: TaskChainHeartbeatPayload,
    state: InboundChainState,
  ) => Promise<ChainInboundDecision>;

  // Owner-side handler (called when this node delivers a chain report to the owner)
  handleOwnerReport: (
    envelope: EnvoyEnvelope,
    payload: TaskChainReportPayload,
  ) => Promise<ChainInboundDecision>;
}
