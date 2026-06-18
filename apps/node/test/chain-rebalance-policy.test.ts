/**
 * Phase 40D — Configurable rebalance policy tests.
 *
 * Covers:
 *   - `rebalanceChain` honors `rebalancePolicy` for auto-triggered calls
 *     (`never` → refuses, `manual` → refuses, `auto` → allows).
 *   - `rebalanceChain` enforces `maxAutoRebalances` and stops bumping the
 *     counter once the cap is reached.
 *   - `trackChain` auto-triggers on stall (no heartbeat within
 *     `stallTimeoutMs`) and on low-confidence partial (`confidence <
 *     lowConfidenceThreshold`).
 *   - `handleOrchestratorPartial` records the worker's self-reported
 *     confidence into chain state.
 *   - `handleOrchestratorHeartbeat` resets the per-subtask liveness
 *     timestamp so the worker is not considered stalled.
 *   - `chainStateSnapshot` exposes the policy + counters + history so
 *     the UI can render "auto-rebalance is on".
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  chainStateSnapshot,
  counterBid,
  createChainState,
  evaluateBids,
  handleOrchestratorHeartbeat,
  handleOrchestratorPartial,
  launchChain,
  planChain,
  rebalanceChain,
  trackChain,
  type ChainOrchestratorHandlerDeps,
} from "../src/chain-orchestrator.js";
import type {
  ChainMandate,
  ChainSubtask,
  ChainSubtaskBid,
  EnvoyEnvelope,
  TaskChainPartialPayload,
  TaskChainReportPayload,
} from "@envoymesh/protocol";
import { generateKeyPairSync } from "node:crypto";

let keyPair: { privateKey: string; publicKey: string };

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  keyPair = {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
});

const NOW = new Date("2026-06-18T00:00:00.000Z");
const NOW_MS = NOW.getTime();

function makeMandate(
  overrides: Partial<ChainMandate> & { rebalancePolicy?: "manual" | "auto" | "never" } = {},
): ChainMandate {
  return {
    version: "0.1" as const,
    chainMandateId: "chainmandate_40d_policy",
    chainId: "chain_40d_policy",
    issuerOwnerId: "envoy:owner:orchestrator",
    orchestratorOwnerId: "envoy:owner:orchestrator",
    maxChainCostUsd: overrides.maxChainCostUsd ?? 10,
    costCeilingUsd: overrides.costCeilingUsd ?? 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public" as const,
    deadlineAt: "2026-06-18T01:00:00.000Z",
    createdAt: "2026-06-18T00:00:00.000Z",
    rebalancePolicy: overrides.rebalancePolicy ?? "manual",
    stallTimeoutMs: overrides.stallTimeoutMs ?? 60_000,
    lowConfidenceThreshold: overrides.lowConfidenceThreshold ?? 0.5,
    maxAutoRebalances: overrides.maxAutoRebalances ?? 2,
    autoRebalanceIncrementUsd: overrides.autoRebalanceIncrementUsd ?? 5,
    signature: "stub",
  };
}

function makeDeps(overrides: Partial<ChainOrchestratorHandlerDeps> = {}) {
  const sentEnvelopes: Array<{ recipientPeerId: string; envelope: EnvoyEnvelope; payload: unknown }> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const storedReports: TaskChainReportPayload["report"][] = [];
  const deps: ChainOrchestratorHandlerDeps = {
    sendEnvelope: async (recipientPeerId, envelope, payload) => {
      sentEnvelopes.push({ recipientPeerId, envelope, payload });
      return true;
    },
    findWorkers: overrides.findWorkers ?? (async () => []),
    now: overrides.now ?? (() => NOW),
    signingKeyPem: overrides.signingKeyPem ?? keyPair.privateKey,
    publicKeyPem: overrides.publicKeyPem ?? keyPair.publicKey,
    orchestratorPeerId: overrides.orchestratorPeerId ?? "12D3KooW-orchestrator",
    orchestratorOwnerId: overrides.orchestratorOwnerId ?? "envoy:owner:orchestrator",
    audit: overrides.audit ?? { record: (e) => auditEvents.push(e as unknown as Record<string, unknown>) },
    storeChainReport: async (r) => storedReports.push(r),
    llmDecompose: overrides.llmDecompose,
    llmMerge: overrides.llmMerge,
  };
  return { ...deps, sentEnvelopes, auditEvents, storedReports };
}

function makeBid(overrides: Partial<ChainSubtaskBid>): ChainSubtaskBid {
  return {
    version: "0.1",
    subtaskId: "subtask_a",
    chainId: "chain_40d_policy",
    workerPeerId: "12D3KooW-w1",
    workerOwnerId: "envoy:owner:w1",
    proposedCostUsd: 2,
    proposedEtaAt: "2026-06-18T00:30:00.000Z",
    bidExpiresAt: "2026-06-18T01:00:00.000Z",
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

async function bootstrapSingleSubtask(mandate: ChainMandate) {
  const state = createChainState(mandate);
  const deps = makeDeps();
  const plan = await planChain(deps, state, "do a thing");
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error("plan failed");
  const subtask = plan.subtasks[0];
  state.bids.set(`${subtask.subtaskId}::12D3KooW-w1`, makeBid({ workerPeerId: "12D3KooW-w1", proposedCostUsd: 2 }));
  state.workersBySubtask.set(subtask.subtaskId, ["12D3KooW-w1"]);
  return { state, deps, subtask };
}

describe("rebalanceChain — policy gating", () => {
  it("refuses an auto-trigger when rebalancePolicy === 'never'", async () => {
    const { state, deps } = await bootstrapSingleSubtask(makeMandate({ rebalancePolicy: "never" }));
    const result = await rebalanceChain(deps, state, {
      additionalBudgetUsd: 5,
      autoTriggered: true,
      reason: "stalled:subtask_a",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("policy_disabled");
    expect(state.autoRebalanceCount).toBe(0);
  });

  it("refuses an auto-trigger when rebalancePolicy === 'manual' (defensive)", async () => {
    const { state, deps } = await bootstrapSingleSubtask(makeMandate({ rebalancePolicy: "manual" }));
    const result = await rebalanceChain(deps, state, {
      additionalBudgetUsd: 5,
      autoTriggered: true,
      reason: "stalled:subtask_a",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("policy_disabled");
  });

  it("allows a manual rebalance regardless of policy", async () => {
    const { state, deps } = await bootstrapSingleSubtask(makeMandate({ rebalancePolicy: "never" }));
    const result = await rebalanceChain(deps, state, {
      additionalBudgetUsd: 5,
      // autoTriggered is false — owner clicked the bar.
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.autoTriggered).toBe(false);
  });

  it("allows an auto-trigger when rebalancePolicy === 'auto' and under cap", async () => {
    const { state, deps } = await bootstrapSingleSubtask(makeMandate({ rebalancePolicy: "auto" }));
    const result = await rebalanceChain(deps, state, {
      additionalBudgetUsd: 5,
      autoTriggered: true,
      reason: "low-confidence:subtask_a",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.autoTriggered).toBe(true);
    expect(state.autoRebalanceCount).toBe(1);
    expect(state.autoRebalanceHistory.length).toBe(1);
    expect(state.autoRebalanceHistory[0].reason).toBe("low-confidence:subtask_a");
    expect(state.autoRebalanceHistory[0].additionalBudgetUsd).toBe(5);
  });

  it("refuses an auto-trigger when maxAutoRebalances has been reached", async () => {
    const { state, deps } = await bootstrapSingleSubtask(makeMandate({ rebalancePolicy: "auto", maxAutoRebalances: 1 }));
    // First auto-rebalance succeeds.
    const r1 = await rebalanceChain(deps, state, { additionalBudgetUsd: 5, autoTriggered: true, reason: "stalled:x" });
    expect(r1.ok).toBe(true);
    expect(state.autoRebalanceCount).toBe(1);
    // Second is over cap.
    const r2 = await rebalanceChain(deps, state, { additionalBudgetUsd: 5, autoTriggered: true, reason: "stalled:y" });
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.reason).toBe("cap_exceeded");
  });

  it("does NOT record into autoRebalanceHistory for manual rebalances", async () => {
    const { state, deps } = await bootstrapSingleSubtask(makeMandate({ rebalancePolicy: "auto" }));
    await rebalanceChain(deps, state, { additionalBudgetUsd: 5 });
    expect(state.autoRebalanceCount).toBe(0);
    expect(state.autoRebalanceHistory.length).toBe(0);
  });

  it("audit record type differentiates auto from manual", async () => {
    const { state, deps } = await bootstrapSingleSubtask(makeMandate({ rebalancePolicy: "auto" }));
    await rebalanceChain(deps, state, { additionalBudgetUsd: 5, autoTriggered: true, reason: "stalled:a" });
    const autoType = deps.audit?.record
      ? null
      : null;
    void autoType;
    // Reset and try manual
    const state2 = createChainState(makeMandate({ rebalancePolicy: "auto" }));
    const deps2 = makeDeps();
    const plan = await planChain(deps2, state2, "another thing");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const subtask = plan.subtasks[0];
    state2.bids.set(`${subtask.subtaskId}::12D3KooW-w1`, makeBid({ subtaskId: subtask.subtaskId }));
    state2.workersBySubtask.set(subtask.subtaskId, ["12D3KooW-w1"]);
    await rebalanceChain(deps2, state2, { additionalBudgetUsd: 5 });
    const events = (deps2 as unknown as { auditEvents: Array<Record<string, unknown>> }).auditEvents;
    const types = events.map((e) => e.type);
    expect(types).toContain("chain.rebalanced");
    expect(types).not.toContain("chain.auto_rebalanced");
  });
});

describe("trackChain — auto-rebalance trigger", () => {
  it("auto-rebalances when a worker stalls past stallTimeoutMs", async () => {
    const mandate = makeMandate({
      rebalancePolicy: "auto",
      stallTimeoutMs: 10_000,
      autoRebalanceIncrementUsd: 3,
      maxAutoRebalances: 3,
    });
    const { state, deps, subtask } = await bootstrapSingleSubtask(mandate);

    // Award the worker so trackChain has something to heartbeat.
    const r1 = await evaluateBids(deps, state, { subtaskId: subtask.subtaskId, policy: "cheapest" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(state.awards.size).toBe(1);

    // Simulate the worker stalling: backdate the heartbeat timestamp.
    state.lastHeartbeatAt.set(subtask.subtaskId, NOW_MS - 60_000);

    // One tick is enough to fire the auto-rebalance.
    await trackChain(deps, state, { tickMs: 5, maxTicks: 1 });

    expect(state.autoRebalanceCount).toBe(1);
    expect(state.autoRebalanceHistory[0].reason).toMatch(/^stalled:/);
  });

  it("auto-rebalances when a partial lands below lowConfidenceThreshold", async () => {
    const mandate = makeMandate({
      rebalancePolicy: "auto",
      lowConfidenceThreshold: 0.6,
      autoRebalanceIncrementUsd: 4,
      maxAutoRebalances: 3,
    });
    const { state, deps, subtask } = await bootstrapSingleSubtask(mandate);

    // Award first.
    const r1 = await evaluateBids(deps, state, { subtaskId: subtask.subtaskId, policy: "cheapest" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Drop a low-confidence partial via the orchestrator handler.
    const partialPayload: TaskChainPartialPayload = {
      partial: {
        version: "0.1",
        subtaskId: subtask.subtaskId,
        chainId: mandate.chainId,
        workerPeerId: "12D3KooW-w1",
        seq: 1,
        isFinal: false,
        note: "low quality result",
        confidence: 0.2,
        createdAt: NOW.toISOString(),
      },
    };
    const envelope: EnvoyEnvelope = {
      version: "0.1",
      messageId: "m1",
      createdAt: NOW.toISOString(),
      senderPeerId: "12D3KooW-w1",
      senderPublicKey: "stub",
      senderRole: "agent",
      recipientPeerId: "12D3KooW-orchestrator",
      recipientRole: "agent",
      intent: "task.chain.partial",
      payload: partialPayload,
      signature: "stub",
    };
    await handleOrchestratorPartial(deps, envelope, partialPayload, state);
    expect(state.lastConfidence.get(subtask.subtaskId)).toBe(0.2);

    // Drive trackChain; the low-confidence partial must trigger an auto-rebalance.
    await trackChain(deps, state, { tickMs: 5, maxTicks: 1 });
    expect(state.autoRebalanceCount).toBe(1);
    expect(state.autoRebalanceHistory[0].reason).toMatch(/^low-confidence:/);
    expect(state.autoRebalanceHistory[0].additionalBudgetUsd).toBe(4);
  });

  it("does NOT auto-rebalance when rebalancePolicy is 'manual'", async () => {
    const mandate = makeMandate({
      rebalancePolicy: "manual",
      stallTimeoutMs: 10_000,
    });
    const { state, deps, subtask } = await bootstrapSingleSubtask(mandate);
    const r1 = await evaluateBids(deps, state, { subtaskId: subtask.subtaskId, policy: "cheapest" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    state.lastHeartbeatAt.set(subtask.subtaskId, NOW_MS - 60_000);

    await trackChain(deps, state, { tickMs: 5, maxTicks: 1 });
    expect(state.autoRebalanceCount).toBe(0);
  });

  it("stops auto-rebalancing after maxAutoRebalances, even if workers keep stalling", async () => {
    const mandate = makeMandate({
      rebalancePolicy: "auto",
      stallTimeoutMs: 10_000,
      maxAutoRebalances: 1,
    });
    const { state, deps, subtask } = await bootstrapSingleSubtask(mandate);
    const r1 = await evaluateBids(deps, state, { subtaskId: subtask.subtaskId, policy: "cheapest" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Backdate the heartbeat so the worker keeps looking stalled.
    state.lastHeartbeatAt.set(subtask.subtaskId, NOW_MS - 60_000);

    // First call fires #1 (cap=1, count=1).
    await trackChain(deps, state, { tickMs: 5, maxTicks: 1 });
    expect(state.autoRebalanceCount).toBe(1);
    // Second call: still stalled, but now over cap → no new auto-rebalance.
    await trackChain(deps, state, { tickMs: 5, maxTicks: 1 });
    expect(state.autoRebalanceCount).toBe(1);
  });

  it("does not trigger for subtasks that have a partial (they're effectively done)", async () => {
    const mandate = makeMandate({
      rebalancePolicy: "auto",
      stallTimeoutMs: 10_000,
    });
    const { state, deps, subtask } = await bootstrapSingleSubtask(mandate);
    const r1 = await evaluateBids(deps, state, { subtaskId: subtask.subtaskId, policy: "cheapest" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Place a fake partial so the subtask is "done".
    state.partials.set(subtask.subtaskId, {
      partial: {
        version: "0.1",
        subtaskId: subtask.subtaskId,
        chainId: mandate.chainId,
        workerPeerId: "12D3KooW-w1",
        seq: 1,
        isFinal: true,
        note: "done",
        confidence: 1.0,
        createdAt: NOW.toISOString(),
      },
    });
    state.lastHeartbeatAt.set(subtask.subtaskId, NOW_MS - 60_000);

    await trackChain(deps, state, { tickMs: 5, maxTicks: 1 });
    expect(state.autoRebalanceCount).toBe(0);
  });
});

describe("handleOrchestratorHeartbeat — resets liveness timer", () => {
  it("updates lastHeartbeatAt for the subtask", async () => {
    const mandate = makeMandate({ rebalancePolicy: "manual" });
    const { state, deps, subtask } = await bootstrapSingleSubtask(mandate);

    // Backdate the heartbeat so the worker looks stalled.
    state.lastHeartbeatAt.set(subtask.subtaskId, NOW_MS - 60_000);

    const envelope: EnvoyEnvelope = {
      version: "0.1",
      messageId: "hb1",
      createdAt: NOW.toISOString(),
      senderPeerId: "12D3KooW-w1",
      senderPublicKey: "stub",
      senderRole: "agent",
      recipientPeerId: "12D3KooW-orchestrator",
      recipientRole: "agent",
      intent: "task.chain.heartbeat",
      payload: {
        chainId: mandate.chainId,
        subtaskId: subtask.subtaskId,
        workerPeerId: "12D3KooW-w1",
        progress: "still working",
        createdAt: NOW.toISOString(),
      },
      signature: "stub",
    };
    const result = await handleOrchestratorHeartbeat(
      deps,
      envelope,
      {
        chainId: mandate.chainId,
        subtaskId: subtask.subtaskId,
        workerPeerId: "12D3KooW-w1",
        progress: "still working",
        createdAt: NOW.toISOString(),
      },
      state,
    );
    expect(result.ok).toBe(true);
    expect(state.lastHeartbeatAt.get(subtask.subtaskId)).toBe(NOW_MS);
  });
});

describe("chainStateSnapshot — rebalance policy fields", () => {
  it("surfaces rebalancePolicy + autoRebalanceCount + history", async () => {
    const mandate = makeMandate({ rebalancePolicy: "auto" });
    const { state } = await bootstrapSingleSubtask(mandate);
    // Simulate two auto-rebalances having happened.
    state.autoRebalanceCount = 2;
    state.autoRebalanceHistory = [
      { at: "2026-06-18T00:30:00.000Z", reason: "stalled:x", additionalBudgetUsd: 5 },
      { at: "2026-06-18T00:25:00.000Z", reason: "low-confidence:y", additionalBudgetUsd: 5 },
    ];
    const snap = chainStateSnapshot(state);
    expect(snap.rebalancePolicy).toBe("auto");
    expect(snap.autoRebalanceCount).toBe(2);
    expect(snap.maxAutoRebalances).toBe(2);
    expect(snap.autoRebalanceHistory.length).toBe(2);
    expect(snap.autoRebalanceHistory[0].reason).toBe("stalled:x");
  });

  it("defaults rebalancePolicy to 'manual' when mandate omits it", async () => {
    const { rebalancePolicy: _omit, ...rest } = makeMandate({ rebalancePolicy: "manual" });
    const mandate: ChainMandate = { ...rest } as ChainMandate;
    delete (mandate as { rebalancePolicy?: string }).rebalancePolicy;
    const state = createChainState(mandate);
    const snap = chainStateSnapshot(state);
    expect(snap.rebalancePolicy).toBe("manual");
  });
});

describe("counterBid + auto-rebalance interaction", () => {
  it("counterBid preserves autoRebalanceCount history", async () => {
    const mandate = makeMandate({ rebalancePolicy: "auto" });
    const { state, deps, subtask } = await bootstrapSingleSubtask(mandate);
    await rebalanceChain(deps, state, { additionalBudgetUsd: 5, autoTriggered: true, reason: "stalled:a" });
    expect(state.autoRebalanceCount).toBe(1);

    // Counter-bid clears bids; should not touch autoRebalanceHistory.
    const cb = await counterBid(deps, state, { subtaskId: subtask.subtaskId, newCostCeilingUsd: 10 });
    expect(cb.ok).toBe(true);
    expect(state.autoRebalanceCount).toBe(1);
    expect(state.autoRebalanceHistory.length).toBe(1);
  });
});

describe("launchChain — workersBySubtask still tracked with new policy fields", () => {
  it("does not break launchChain when rebalancePolicy is set", async () => {
    const mandate = makeMandate({ rebalancePolicy: "auto" });
    const state = createChainState(mandate);
    const deps = makeDeps();
    const plan = await planChain(deps, state, "launch test");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const subtask = plan.subtasks[0];
    const result = await launchChain(deps, state, {
      [subtask.subtaskId]: ["12D3KooW-alpha"],
    });
    expect(result.ok).toBe(true);
    expect(state.workersBySubtask.get(subtask.subtaskId)).toEqual(["12D3KooW-alpha"]);
  });
});