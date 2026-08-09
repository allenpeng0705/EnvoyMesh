/**
 * Phase 40 — chain-worker tests.
 *
 * Covers the worker-side handlers and outbound helpers:
 * - handleWorkerPropose: happy path computes a bid, sends task.chain.bid, records expiration
 * - handleWorkerPropose: cost-ceiling exceeded → declines, no envelope sent
 * - handleWorkerPropose: send failure → bid expiration dropped, deny audit
 * - handleWorkerCancel: removes pending bid expiration, audits subtask_cancelled
 * - checkBidExpiration: no_pending_bid / bid_expired / ok branches
 * - submitChainBid: signs and dispatches a properly-shaped envelope
 * - deliverChainPartial: signs and dispatches a partial envelope
 * - replayInFlightChainSubtasks: emits one final partial per in-flight subtask
 * - replayInFlightChainSubtasks: counts failures separately from successes
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  handleWorkerPropose,
  handleWorkerAccept,
  handleWorkerCancel,
  checkBidExpiration,
  acceptChainAward,
  submitChainBid,
  deliverChainPartial,
  replayInFlightChainSubtasks,
  type ChainWorkerHandlerDeps,
  type ChainWorkerSendDeps,
} from "../src/chain-worker.js";
import {
  ChainSubtaskAwardSchema,
  ChainSubtaskBidSchema,
  ChainSubtaskPartialSchema,
  ChainSubtaskSchema,
  TaskChainAcceptPayloadSchema,
  TaskChainBidPayloadSchema,
  TaskChainPartialPayloadSchema,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { generateKeyPairSync } from "node:crypto";

let workerKeyPair: { privateKey: string; publicKey: string };
let orchestratorKeyPair: { privateKey: string; publicKey: string };

beforeAll(() => {
  workerKeyPair = genKey();
  orchestratorKeyPair = genKey();
});
afterAll(() => {
  // Cleanup not required for in-memory test data
});

function genKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

const NOW = new Date("2026-06-18T00:00:00.000Z");

function makeSendDeps(): ChainWorkerSendDeps & {
  sentEnvelopes: Array<{ recipientPeerId: string; envelope: EnvoyEnvelope; payload: unknown }>;
} {
  const sentEnvelopes: Array<{ recipientPeerId: string; envelope: EnvoyEnvelope; payload: unknown }> = [];
  return {
    sentEnvelopes,
    sendEnvelope: async (recipientPeerId, envelope, payload) => {
      sentEnvelopes.push({ recipientPeerId, envelope, payload });
      return true;
    },
    now: () => NOW,
    signingKeyPem: workerKeyPair.privateKey,
    publicKeyPem: workerKeyPair.publicKey,
    workerPeerId: "12D3KooW-worker",
    workerOwnerId: "envoy:owner:worker",
  };
}

function makeHandlerDeps(overrides?: Partial<ChainWorkerHandlerDeps>): ChainWorkerHandlerDeps & {
  auditEvents: Array<Record<string, unknown>>;
  sendDeps: ReturnType<typeof makeSendDeps>;
} {
  const sendDeps = makeSendDeps();
  const auditEvents: Array<Record<string, unknown>> = [];
  const deps: ChainWorkerHandlerDeps = {
    ...sendDeps,
    audit: {
      record: (e) => {
        auditEvents.push(e as unknown as Record<string, unknown>);
      },
    },
    workerContext: {
      workerPeerId: "12D3KooW-worker",
      workerOwnerId: "envoy:owner:worker",
      baseCostUsd: 1,
      capabilityLocalEtaMs: 30_000,
    },
    pendingBidExpirations: new Map<string, string>(),
    ...overrides,
  };
  return { ...deps, auditEvents, sendDeps };
}

function subtask(overrides: Partial<{ deadlineAt: string; costCeilingUsd: number; depth: number }> = {}): ChainSubtask {
  return ChainSubtaskSchema.parse({
    version: "0.1",
    subtaskId: "subtask_test-1",
    chainId: "chain_test-1",
    chainMandateId: "chainmandate_test-1",
    depth: overrides.depth ?? 1,
    requiredSkill: "task.execute",
    objective: "summarize the Q3 report",
    requestedResult: "markdown summary",
    constraints: [],
    dependsOn: [],
    createdAt: NOW.toISOString(),
    deadlineAt: overrides.deadlineAt ?? "2026-06-18T01:00:00.000Z",
    costCeilingUsd: overrides.costCeilingUsd,
  });
}

function proposePayload(s: ChainSubtask) {
  return {
    subtask: s,
    chainMandate: {
      version: "0.1" as const,
      chainMandateId: s.chainMandateId,
      chainId: s.chainId,
      issuerOwnerId: "envoy:owner:orchestrator",
      orchestratorOwnerId: "envoy:owner:orchestrator",
      maxChainCostUsd: 10,
      costCeilingUsd: 3,
      maxWorkers: 3,
      allowDepth3: false,
      maxSensitivity: "public" as const,
      deadlineAt: s.deadlineAt!,
      createdAt: NOW.toISOString(),
      signature: "stub",
    },
  };
}

function orchestratorEnvelope(): EnvoyEnvelope {
  return {
    version: "0.1",
    messageId: "m_test-1",
    correlationId: "corr_1",
    createdAt: NOW.toISOString(),
    senderPeerId: "12D3KooW-orchestrator",
    senderPublicKey: orchestratorKeyPair.publicKey,
    senderRole: "agent",
    recipientPeerId: "12D3KooW-worker",
    recipientRole: "agent",
    intent: "task.chain.propose",
    payload: {},
    signature: "stub",
  };
}

describe("handleWorkerPropose", () => {
  it("happy path: computes a bid, sends task.chain.bid, records expiration", async () => {
    const deps = makeHandlerDeps();
    const s = subtask();
    const env = orchestratorEnvelope();
    const r = await handleWorkerPropose(deps, env, proposePayload(s));
    expect(r.ok).toBe(true);
    expect(deps.sendDeps.sentEnvelopes.length).toBe(1);
    const sent = deps.sendDeps.sentEnvelopes[0];
    expect(sent.recipientPeerId).toBe("12D3KooW-orchestrator");
    expect(sent.envelope.intent).toBe("task.chain.bid");
    // The payload parses as TaskChainBidPayload.
    const parsed = TaskChainBidPayloadSchema.parse(sent.payload);
    expect(parsed.bid.subtaskId).toBe("subtask_test-1");
    expect(parsed.bid.workerPeerId).toBe("12D3KooW-worker");
    // Expiration is recorded for stale-bid protection.
    expect(deps.pendingBidExpirations.get("subtask_test-1")).toBe(parsed.bid.bidExpiresAt);
    // Audit trail records the bid_sent event.
    expect(deps.auditEvents.some((e) => e.type === "chain.bid_sent")).toBe(true);
  });

  it("cost-ceiling exceeded: declines without sending an envelope", async () => {
    const deps = makeHandlerDeps();
    // Depth 3, cost ceiling 1 → bid would exceed.
    const s = subtask({ depth: 3, costCeilingUsd: 1 });
    const r = await handleWorkerPropose(deps, orchestratorEnvelope(), proposePayload(s));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("handler_denied");
    expect(deps.sendDeps.sentEnvelopes.length).toBe(0);
    expect(deps.auditEvents.some((e) => e.type === "chain.bid_declined")).toBe(true);
  });

  it("send failure: drops the pending expiration and records a deny audit", async () => {
    const deps = makeHandlerDeps();
    deps.sendEnvelope = async () => false;
    const r = await handleWorkerPropose(deps, orchestratorEnvelope(), proposePayload(subtask()));
    expect(r.ok).toBe(false);
    expect(deps.pendingBidExpirations.has("subtask_test-1")).toBe(false);
    expect(deps.auditEvents.some((e) => e.type === "chain.bid_send_failed")).toBe(true);
  });

  it("declines when Agent Network engine (OpenClaw) is not ready", async () => {
    const deps = makeHandlerDeps({ isAgentNetworkEngineReady: () => false });
    const r = await handleWorkerPropose(deps, orchestratorEnvelope(), proposePayload(subtask()));
    expect(r.ok).toBe(false);
    expect(deps.sendDeps.sentEnvelopes.length).toBe(0);
    expect(
      deps.auditEvents.some(
        (e) => e.type === "chain.bid_declined" && e.summary === "openclaw_unavailable",
      ),
    ).toBe(true);
  });
});

describe("handleWorkerCancel", () => {
  it("removes the pending bid expiration and records a subtask_cancelled audit", async () => {
    const deps = makeHandlerDeps();
    deps.pendingBidExpirations.set("subtask_test-1", "2026-06-18T01:00:00.000Z");
    const r = await handleWorkerCancel(deps, orchestratorEnvelope(), {
      chainId: "chain_test-1",
      subtaskId: "subtask_test-1",
      reason: "owner abort",
      cancelledBy: "owner",
      notifyWorkerPeerIds: [],
      createdAt: NOW.toISOString(),
    });
    expect(r.ok).toBe(true);
    expect(deps.pendingBidExpirations.has("subtask_test-1")).toBe(false);
    expect(deps.auditEvents.some((e) => e.type === "chain.subtask_cancelled")).toBe(true);
  });

  it("works without a subtaskId (chain-wide cancel)", async () => {
    const deps = makeHandlerDeps();
    const r = await handleWorkerCancel(deps, orchestratorEnvelope(), {
      chainId: "chain_test-1",
      reason: "policy",
      cancelledBy: "policy",
      notifyWorkerPeerIds: [],
      createdAt: NOW.toISOString(),
    });
    expect(r.ok).toBe(true);
    expect(deps.auditEvents.some((e) => e.type === "chain.cancelled")).toBe(true);
  });
});

describe("handleWorkerAccept", () => {
  it("accepts direct-assign when there is no prior bid but subtask snapshot is present", async () => {
    const deps = makeHandlerDeps();
    const subtask = ChainSubtaskSchema.parse({
      version: "0.1",
      subtaskId: "subtask_direct",
      chainId: "chain_direct",
      chainMandateId: "chainmandate_direct",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "do it",
      requestedResult: "out",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    const award = ChainSubtaskAwardSchema.parse({
      version: "0.1",
      subtaskId: "subtask_direct",
      chainId: "chain_direct",
      workerPeerId: "12D3KooW-worker",
      negotiationRound: 1,
      acceptedCostUsd: 0,
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    const payload = TaskChainAcceptPayloadSchema.parse({ award, subtask });
    const envelope = {
      version: "0.1" as const,
      messageId: "m1",
      createdAt: NOW.toISOString(),
      senderPeerId: "12D3KooW-orch",
      senderPublicKey: "pk",
      senderRole: "agent" as const,
      recipientRole: "agent" as const,
      intent: "task.chain.accept" as const,
      payload,
      signature: "s",
      correlationId: "chain_direct",
    };
    const r = await handleWorkerAccept(deps, envelope, payload);
    expect(r.ok).toBe(true);
    expect(deps.auditEvents.some((e) => e.type === "chain.award_accepted")).toBe(true);
  });

  it("still rejects accept with no pending bid when subtask snapshot is missing", async () => {
    const deps = makeHandlerDeps();
    const award = ChainSubtaskAwardSchema.parse({
      version: "0.1",
      subtaskId: "subtask_missing_bid",
      chainId: "chain_x",
      workerPeerId: "12D3KooW-worker",
      negotiationRound: 1,
      acceptedCostUsd: 0,
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    const payload = TaskChainAcceptPayloadSchema.parse({ award });
    const envelope = {
      version: "0.1" as const,
      messageId: "m2",
      createdAt: NOW.toISOString(),
      senderPeerId: "12D3KooW-orch",
      senderPublicKey: "pk",
      senderRole: "agent" as const,
      recipientRole: "agent" as const,
      intent: "task.chain.accept" as const,
      payload,
      signature: "s",
      correlationId: "chain_x",
    };
    const r = await handleWorkerAccept(deps, envelope, payload);
    expect(r.ok).toBe(false);
  });
});

describe("checkBidExpiration", () => {
  it("returns ok=false with no_pending_bid when the subtask is unknown", () => {
    const deps = makeHandlerDeps();
    const r = checkBidExpiration(deps, "subtask_missing", NOW.getTime());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no_pending_bid");
  });

  it("returns ok=false with bid_expired and removes the entry when expired", () => {
    const deps = makeHandlerDeps();
    deps.pendingBidExpirations.set("subtask_x", "2026-06-18T00:00:00.000Z");
    const r = checkBidExpiration(deps, "subtask_x", NOW.getTime() + 1000);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("bid_expired");
    expect(deps.pendingBidExpirations.has("subtask_x")).toBe(false);
  });

  it("returns ok=true when the bid is still valid", () => {
    const deps = makeHandlerDeps();
    deps.pendingBidExpirations.set(
      "subtask_x",
      new Date(NOW.getTime() + 60_000).toISOString(),
    );
    const r = checkBidExpiration(deps, "subtask_x", NOW.getTime());
    expect(r.ok).toBe(true);
  });
});

describe("acceptChainAward", () => {
  it("removes the pending bid expiration when called", () => {
    const deps = makeHandlerDeps();
    deps.pendingBidExpirations.set("subtask_x", "2099-01-01T00:00:00.000Z");
    expect(acceptChainAward(deps, "subtask_x")).toBe(true);
    expect(deps.pendingBidExpirations.has("subtask_x")).toBe(false);
  });

  it("returns false when the subtask had no pending bid", () => {
    const deps = makeHandlerDeps();
    expect(acceptChainAward(deps, "subtask_missing")).toBe(false);
  });
});

describe("submitChainBid", () => {
  it("signs and dispatches a properly-shaped envelope", async () => {
    const deps = makeSendDeps();
    const bid = ChainSubtaskBidSchema.parse({
      version: "0.1",
      subtaskId: "subtask_test-1",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-worker",
      workerOwnerId: "envoy:owner:worker",
      proposedCostUsd: 1.5,
      proposedEtaAt: "2026-06-18T00:05:00.000Z",
      bidExpiresAt: "2026-06-18T00:05:00.000Z",
      createdAt: NOW.toISOString(),
    });
    const propose = proposePayload(subtask());
    const ok = await submitChainBid(deps, "12D3KooW-orchestrator", bid, propose);
    expect(ok).toBe(true);
    expect(deps.sentEnvelopes.length).toBe(1);
    const sent = deps.sentEnvelopes[0];
    expect(sent.envelope.intent).toBe("task.chain.bid");
    expect(sent.envelope.senderPeerId).toBe("12D3KooW-worker");
    expect(sent.envelope.recipientPeerId).toBe("12D3KooW-orchestrator");
    expect(sent.envelope.signature.length).toBeGreaterThan(0);
  });
});

describe("deliverChainPartial", () => {
  it("signs and dispatches a partial envelope", async () => {
    const deps = makeSendDeps();
    const partial = TaskChainPartialPayloadSchema.parse({
      partial: ChainSubtaskPartialSchema.parse({
        version: "0.1",
        subtaskId: "subtask_test-1",
        chainId: "chain_test-1",
        workerPeerId: "12D3KooW-worker",
        seq: 1,
        isFinal: false,
        note: "first partial",
        createdAt: NOW.toISOString(),
      }),
    });
    const ok = await deliverChainPartial(deps, "12D3KooW-orchestrator", partial, "corr_1");
    expect(ok).toBe(true);
    expect(deps.sentEnvelopes.length).toBe(1);
    const sent = deps.sentEnvelopes[0];
    expect(sent.envelope.intent).toBe("task.chain.partial");
    expect(sent.envelope.correlationId).toBe("corr_1");
    expect(sent.envelope.signature.length).toBeGreaterThan(0);
  });
});

describe("replayInFlightChainSubtasks", () => {
  it("emits one final partial per in-flight subtask", async () => {
    const deps = makeSendDeps();
    const auditEvents: Array<Record<string, unknown>> = [];
    deps.audit = {
      record: (e) => {
        auditEvents.push(e as unknown as Record<string, unknown>);
      },
    };
    const a = subtask();
    const b = ChainSubtaskSchema.parse({
      ...a,
      subtaskId: "subtask_test-2",
    });
    const result = await replayInFlightChainSubtasks(deps, [
      { subtask: a, awardedAt: NOW.toISOString(), lastSeq: 2, orchestratorPeerId: "p1" },
      { subtask: b, awardedAt: NOW.toISOString(), lastSeq: 0, orchestratorPeerId: "p2" },
    ]);
    expect(result.replayed).toBe(2);
    expect(result.failed).toBe(0);
    expect(deps.sentEnvelopes.length).toBe(2);
    const seqs = deps.sentEnvelopes.map((e) => {
      const p = e.payload as TaskChainPartialPayload;
      return p.partial.seq;
    });
    expect(seqs).toEqual([3, 1]); // lastSeq+1
    expect(auditEvents.filter((e) => e.type === "chain.replay_partial_sent").length).toBe(2);
  });

  it("counts failures separately when sendEnvelope returns false", async () => {
    const deps = makeSendDeps();
    deps.audit = { record: () => undefined };
    deps.sendEnvelope = async () => false;
    const result = await replayInFlightChainSubtasks(deps, [
      { subtask: subtask(), awardedAt: NOW.toISOString(), lastSeq: 0, orchestratorPeerId: "p1" },
    ]);
    expect(result.replayed).toBe(0);
    expect(result.failed).toBe(1);
  });
});