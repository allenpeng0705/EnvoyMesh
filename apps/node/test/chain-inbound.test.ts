/**
 * Phase 40 — chain-inbound dispatcher tests.
 *
 * Covers the 4-stage dispatch pipeline:
 *   parsePayloadByIntent → evaluateEnvelopeRolePolicy → capability gate → handler
 *
 * - happy path: each of the 9 intents dispatches to its matching handler
 * - role policy gate: agent→human for task.chain.report, agent→agent for the rest
 * - capability gate: orchestrator-only intents rejected when node lacks `chain.orchestrate`
 * - capability gate: worker intents rejected when recipient role is `human`
 * - schema gate: malformed payload → handler is never called, deny audit emitted
 * - unknown chain intent → handler is never called, deny audit emitted
 * - handler exceptions are caught and recorded as `chain.handler_exception`
 * - successful dispatch invokes the matching handler with the parsed payload
 */

import { describe, expect, it, vi } from "vitest";

import { dispatchChainEnvelope } from "../src/chain-inbound.js";
import type {
  ChainAuditSink,
  ChainInboundDeps,
  ChainInboundDecision,
  InboundChainState,
} from "../src/chain-inbound-types.js";
import type {
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
import {
  CapabilitySchema,
  ChainMandateSignedSchema,
  type ChainState,
  ChainReportSchema,
  ChainSubtaskAwardSchema,
  ChainSubtaskBidSchema,
  ChainSubtaskPartialSchema,
  ChainSubtaskSchema,
  TaskChainAcceptPayloadSchema,
  TaskChainBidPayloadSchema,
  TaskChainCancelPayloadSchema,
  TaskChainHeartbeatPayloadSchema,
  TaskChainMandatePayloadSchema,
  TaskChainMergePayloadSchema,
  TaskChainPartialPayloadSchema,
  TaskChainProposePayloadSchema,
  TaskChainReportPayloadSchema,
  UnsignedChainMandateSchema,
  createChainId,
  createChainMandateId,
  createChainSubtaskId,
} from "@envoymesh/protocol";
import { signCanonicalPayload } from "@envoymesh/identity";
import { generateKeyPairSync } from "node:crypto";

const NOW = "2026-06-18T00:00:00.000Z";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();

function sign<T extends Record<string, unknown>>(unsigned: T): T & { signature: string } {
  return { ...unsigned, signature: signCanonicalPayload(unsigned, privatePem) };
}

function mandatePayload(): TaskChainMandatePayload {
  const unsigned = UnsignedChainMandateSchema.parse({
    version: "0.1",
    chainMandateId: createChainMandateId(),
    chainId: createChainId(),
    issuerOwnerId: "envoy:owner:orchestrator",
    orchestratorOwnerId: "envoy:owner:orchestrator",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: "2026-06-18T01:00:00.000Z",
    createdAt: NOW,
  });
  return TaskChainMandatePayloadSchema.parse({
    chainMandate: sign(unsigned),
  });
}

function subtaskPayload(): TaskChainProposePayload {
  return TaskChainProposePayloadSchema.parse({
    subtask: ChainSubtaskSchema.parse({
      version: "0.1",
      subtaskId: createChainSubtaskId(),
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredCapability: "task.execute",
      objective: "summarize the Q3 report",
      requestedResult: "markdown summary",
      constraints: [],
      dependsOn: [],
      createdAt: NOW,
    }),
    chainMandate: ChainMandateSignedSchema.parse({
      version: "0.1",
      chainMandateId: "chainmandate_test-1",
      chainId: "chain_test-1",
      issuerOwnerId: "envoy:owner:orchestrator",
      orchestratorOwnerId: "envoy:owner:orchestrator",
      maxChainCostUsd: 10,
      costCeilingUsd: 3,
      maxWorkers: 3,
      allowDepth3: false,
      maxSensitivity: "public",
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW,
      signature: "stub",
    }),
  });
}

function bidPayload(): TaskChainBidPayload {
  return TaskChainBidPayloadSchema.parse({
    bid: ChainSubtaskBidSchema.parse({
      version: "0.1",
      subtaskId: "subtask_test-1",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-worker",
      workerOwnerId: "envoy:owner:worker",
      proposedCostUsd: 1.5,
      proposedEtaAt: "2026-06-18T00:05:00.000Z",
      bidExpiresAt: "2026-06-18T00:05:00.000Z",
      createdAt: NOW,
    }),
  });
}

function acceptPayload(): TaskChainAcceptPayload {
  return TaskChainAcceptPayloadSchema.parse({
    award: ChainSubtaskAwardSchema.parse({
      version: "0.1",
      subtaskId: "subtask_test-1",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-worker",
      workerOwnerId: "envoy:owner:worker",
      acceptedCostUsd: 1.5,
      negotiationRound: 1,
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW,
    }),
  });
}

function partialPayload(): TaskChainPartialPayload {
  return TaskChainPartialPayloadSchema.parse({
    partial: ChainSubtaskPartialSchema.parse({
      version: "0.1",
      subtaskId: "subtask_test-1",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-worker",
      seq: 1,
      isFinal: false,
      note: "first partial result",
      createdAt: NOW,
    }),
  });
}

function cancelPayload(): TaskChainCancelPayload {
  return TaskChainCancelPayloadSchema.parse({
    chainId: "chain_test-1",
    subtaskId: "subtask_test-1",
    reason: "owner abort",
    cancelledBy: "owner",
    notifyWorkerPeerIds: [],
    createdAt: NOW,
  });
}

function mergePayload(): TaskChainMergePayload {
  return TaskChainMergePayloadSchema.parse({
    chainId: "chain_test-1",
    mergingSubtaskIds: ["subtask_a", "subtask_b"],
    newSubtask: ChainSubtaskSchema.parse({
      version: "0.1",
      subtaskId: createChainSubtaskId(),
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 2,
      requiredCapability: "task.execute",
      objective: "merged subtask",
      requestedResult: "merged result",
      constraints: [],
      dependsOn: ["subtask_a", "subtask_b"],
      createdAt: NOW,
    }),
    awardedWorkerPeerId: "12D3KooW-worker",
    mergeCostUsd: 1,
    createdAt: NOW,
  });
}

function heartbeatPayload(): TaskChainHeartbeatPayload {
  return TaskChainHeartbeatPayloadSchema.parse({
    chainId: "chain_test-1",
    subtaskId: "subtask_test-1",
    workerPeerId: "12D3KooW-worker",
    progress: "50%",
    createdAt: NOW,
  });
}

function reportPayload(): TaskChainReportPayload {
  return TaskChainReportPayloadSchema.parse({
    report: ChainReportSchema.parse({
      version: "0.1",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      orchestratorOwnerId: "envoy:owner:orchestrator",
      orchestratorPeerId: "12D3KooW-orchestrator",
      pinned: false,
      chainSummary: {
        durationMs: 1000,
        subtaskCount: 1,
        workerCount: 1,
        workerAllocations: [
          {
            subtaskId: "subtask_test-1",
            workerPeerId: "12D3KooW-worker",
            committedUsd: 1.5,
          },
        ],
        synthesisCostUsd: 0,
      },
      executiveSummary: "Done.",
      sections: [],
      recipientRoles: ["human"],
      createdAt: NOW,
    }),
  });
}

function envelope(intent: string, payload: unknown, opts?: { recipientRole?: "human" | "agent" | "system" }): EnvoyEnvelope {
  return {
    version: "0.1",
    messageId: `m_${Math.random().toString(36).slice(2)}`,
    correlationId: "corr_1",
    createdAt: NOW,
    senderPeerId: "12D3KooW-sender",
    senderPublicKey: publicPem,
    senderRole: "agent",
    recipientPeerId: "12D3KooW-us",
    recipientRole: opts?.recipientRole ?? "agent",
    intent: intent as EnvoyEnvelope["intent"],
    payload,
    signature: "sig-stub",
  };
}

function makeAudit(): { sink: ChainAuditSink; events: unknown[] } {
  const events: unknown[] = [];
  return {
    sink: {
      record: (e) => {
        events.push(e);
      },
    },
    events,
  };
}

function makeInboundState(): InboundChainState {
  return {
    chainId: "chain_test",
    lastHeartbeatAt: new Map(),
    lastConfidence: new Map(),
  };
}

function makeDeps(
  audit: ChainAuditSink,
  opts: {
    nodeCapabilities?: CapabilitySchema[];
    workerPropose?: (envelope: EnvoyEnvelope, payload: TaskChainProposePayload, state: ChainState) => Promise<ChainInboundDecision>;
    workerBid?: (envelope: EnvoyEnvelope, payload: TaskChainBidPayload, state: ChainState) => Promise<ChainInboundDecision>;
    workerCancel?: (envelope: EnvoyEnvelope, payload: TaskChainCancelPayload, state: ChainState) => Promise<ChainInboundDecision>;
    orchestratorMandate?: (envelope: EnvoyEnvelope, payload: TaskChainMandatePayload, state: ChainState) => Promise<ChainInboundDecision>;
    orchestratorAccept?: (envelope: EnvoyEnvelope, payload: TaskChainAcceptPayload, state: ChainState) => Promise<ChainInboundDecision>;
    orchestratorPartial?: (envelope: EnvoyEnvelope, payload: TaskChainPartialPayload, state: ChainState) => Promise<ChainInboundDecision>;
    orchestratorMerge?: (envelope: EnvoyEnvelope, payload: TaskChainMergePayload, state: ChainState) => Promise<ChainInboundDecision>;
    orchestratorHeartbeat?: (envelope: EnvoyEnvelope, payload: TaskChainHeartbeatPayload, state: ChainState) => Promise<ChainInboundDecision>;
    ownerReport?: (envelope: EnvoyEnvelope, payload: TaskChainReportPayload) => Promise<ChainInboundDecision>;
  } = {},
): ChainInboundDeps {
  // Loose `okHandler` so it can be reused for any handler regardless of
  // the inbound-state arg shape. Each handler in `ChainInboundDeps`
  // receives different arguments but we always return the same trivial
  // success decision in tests that don't care.
  const okHandler = (..._args: unknown[]): Promise<ChainInboundDecision> =>
    Promise.resolve({ ok: true, handlerResult: "ok" });
  const denyHandler = (reason = "handler_denied"): Promise<ChainInboundDecision> =>
    Promise.resolve({ ok: false, reason: reason as ChainInboundDecision & { ok: false }["reason"] });
  return {
    audit,
    nodeCapabilities: opts.nodeCapabilities ?? ["chain.orchestrate"],
    handleWorkerPropose: opts.workerPropose ?? okHandler,
    handleWorkerBid: opts.workerBid ?? okHandler,
    handleWorkerCancel: opts.workerCancel ?? okHandler,
    handleOrchestratorMandate: opts.orchestratorMandate ?? okHandler,
    handleOrchestratorAccept: opts.orchestratorAccept ?? okHandler,
    handleOrchestratorPartial: opts.orchestratorPartial ?? okHandler,
    handleOrchestratorMerge: opts.orchestratorMerge ?? okHandler,
    handleOrchestratorHeartbeat: opts.orchestratorHeartbeat ?? okHandler,
    handleOwnerReport: opts.ownerReport ?? okHandler,
  };
}

describe("dispatchChainEnvelope", () => {
  it("task.chain.mandate dispatches to handleOrchestratorMandate", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { orchestratorMandate: handler }),
      envelope("task.chain.mandate", mandatePayload()),
    );
    expect(r.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("task.chain.propose dispatches to handleWorkerPropose", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { workerPropose: handler }),
      envelope("task.chain.propose", subtaskPayload()),
    );
    expect(r.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("task.chain.bid dispatches to handleWorkerBid", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { workerBid: handler }),
      envelope("task.chain.bid", bidPayload()),
    );
    expect(r.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("task.chain.accept dispatches to handleOrchestratorAccept", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { orchestratorAccept: handler }),
      envelope("task.chain.accept", acceptPayload()),
    );
    expect(r.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("task.chain.partial dispatches to handleOrchestratorPartial", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { orchestratorPartial: handler }),
      envelope("task.chain.partial", partialPayload()),
    );
    expect(r.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("task.chain.merge dispatches to handleOrchestratorMerge", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { orchestratorMerge: handler }),
      envelope("task.chain.merge", mergePayload()),
    );
    expect(r.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("task.chain.cancel dispatches to handleWorkerCancel", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { workerCancel: handler }),
      envelope("task.chain.cancel", cancelPayload()),
    );
    expect(r.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("task.chain.heartbeat dispatches to handleOrchestratorHeartbeat", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const state = makeInboundState();
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { orchestratorHeartbeat: handler }),
      envelope("task.chain.heartbeat", heartbeatPayload()),
      state,
    );
    expect(r.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("task.chain.report dispatches to handleOwnerReport", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { ownerReport: handler }),
      envelope("task.chain.report", reportPayload(), { recipientRole: "human" }),
    );
    expect(r.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("role-policy gate: task.chain.report accepts agent→human", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { ownerReport: handler }),
      envelope("task.chain.report", reportPayload(), { recipientRole: "human" }),
    );
    expect(r.ok).toBe(true);
  });

  it("role-policy gate: task.chain.propose rejects agent→human (must be agent→agent)", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { workerPropose: handler }),
      envelope("task.chain.propose", subtaskPayload(), { recipientRole: "human" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("role_policy_denied");
    expect(handler).not.toHaveBeenCalled();
    expect(audit.events.some((e) => (e as { outcome?: string }).outcome === "deny")).toBe(true);
  });

  it("capability gate: task.chain.mandate rejected when node lacks chain.orchestrate", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { nodeCapabilities: ["task.execute"], orchestratorMandate: handler }),
      envelope("task.chain.mandate", mandatePayload()),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_orchestrator_capability");
    expect(handler).not.toHaveBeenCalled();
  });

  it("role-policy gate enforces agent→agent for worker intents (recipientRole=human rejected)", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { workerBid: handler }),
      envelope("task.chain.bid", bidPayload(), { recipientRole: "human" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("role_policy_denied");
    expect(handler).not.toHaveBeenCalled();
  });

  it("schema gate: malformed payload is rejected without calling the handler", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { workerBid: handler }),
      envelope("task.chain.bid", { wrong: "shape" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("malformed_bid_payload");
    expect(handler).not.toHaveBeenCalled();
    expect(audit.events.length).toBeGreaterThan(0);
  });

  it("unknown chain intent is rejected with unknown_chain_intent", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: true as const });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, {}),
      envelope("task.chain.bogus", {}),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown_chain_intent");
  });

  it("handler exception is caught and recorded as chain.handler_exception", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { workerBid: handler }),
      envelope("task.chain.bid", bidPayload()),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("handler_exception");
    expect(
      audit.events.some((e) => (e as { type?: string }).type === "chain.handler_exception"),
    ).toBe(true);
  });

  it("handler returning ok=false propagates the denial", async () => {
    const audit = makeAudit();
    const handler = vi.fn().mockResolvedValue({ ok: false as const, reason: "handler_denied" });
    const r = await dispatchChainEnvelope(
      makeDeps(audit.sink, { workerBid: handler }),
      envelope("task.chain.bid", bidPayload()),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("handler_denied");
  });
});