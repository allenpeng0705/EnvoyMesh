/**
 * Phase 40D — multi-bid collection, counter-bid, rebalance, and pick-worker tests.
 *
 * These cover the three new orchestrator behaviors that landed in 40D:
 *
 *   - `evaluateBids({ pickWorkerPeerId })` honors an explicit owner choice
 *     instead of falling back to the cheapest/fastest policy.
 *   - `counterBid` clears all bids on a subtask, bumps the round counter,
 *     rebroadcasts the proposal via the existing sendChainPropose path,
 *     and refuses beyond round 3.
 *   - `rebalanceChain` raises `maxChainCostUsd` and re-runs evaluation for
 *     every not-yet-awarded subtask. Already-awarded subtasks are skipped.
 *
 * Tests use the same `makeDeps` factory as the main chain-orchestrator test
 * so the audit-log assertions remain consistent across the suite.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  counterBid,
  createChainState,
  evaluateBids,
  launchChain,
  planChain,
  rebalanceChain,
  type ChainOrchestratorHandlerDeps,
} from "../src/chain-orchestrator.js";
import { type ChainSubtask, type ChainSubtaskBid, type EnvoyEnvelope, type TaskChainReportPayload } from "@envoymesh/protocol";
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

function makeMandate(overrides: { maxChainCostUsd?: number; costCeilingUsd?: number } = {}) {
  return {
    version: "0.1" as const,
    chainMandateId: "chainmandate_40d",
    chainId: "chain_40d",
    issuerOwnerId: "envoy:owner:orchestrator",
    orchestratorOwnerId: "envoy:owner:orchestrator",
    maxChainCostUsd: overrides.maxChainCostUsd ?? 10,
    costCeilingUsd: overrides.costCeilingUsd ?? 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public" as const,
    deadlineAt: "2026-06-18T01:00:00.000Z",
    createdAt: "2026-06-18T00:00:00.000Z",
    signature: "stub",
  };
}

function makeDeps(
  overrides: Partial<ChainOrchestratorHandlerDeps> & { sendResult?: boolean } = {},
): ChainOrchestratorHandlerDeps & {
  sentEnvelopes: Array<{ recipientPeerId: string; envelope: EnvoyEnvelope; payload: unknown }>;
  auditEvents: Array<Record<string, unknown>>;
  storedReports: TaskChainReportPayload["report"][];
} {
  const sentEnvelopes: Array<{ recipientPeerId: string; envelope: EnvoyEnvelope; payload: unknown }> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const storedReports: TaskChainReportPayload["report"][] = [];
  const sendResult = overrides.sendResult ?? true;
  const deps: ChainOrchestratorHandlerDeps = {
    sendEnvelope: async (recipientPeerId, envelope, payload) => {
      sentEnvelopes.push({ recipientPeerId, envelope, payload });
      return sendResult;
    },
    findWorkers: overrides.findWorkers ?? (async () => []),
    now: overrides.now ?? (() => NOW),
    signingKeyPem: overrides.signingKeyPem ?? keyPair.privateKey,
    publicKeyPem: overrides.publicKeyPem ?? keyPair.publicKey,
    orchestratorPeerId: overrides.orchestratorPeerId ?? "12D3KooW-orchestrator",
    orchestratorOwnerId: overrides.orchestratorOwnerId ?? "envoy:owner:orchestrator",
    audit: overrides.audit ?? {
      record: (e) => {
        auditEvents.push(e as unknown as Record<string, unknown>);
      },
    },
    storeChainReport: async (r) => {
      storedReports.push(r);
    },
    llmDecompose: overrides.llmDecompose,
    llmMerge: overrides.llmMerge,
  };
  return { ...deps, sentEnvelopes, auditEvents, storedReports };
}

function makeBid(overrides: Partial<ChainSubtaskBid>): ChainSubtaskBid {
  return {
    version: "0.1",
    subtaskId: "subtask_a",
    chainId: "chain_40d",
    workerPeerId: "12D3KooW-worker-1",
    workerOwnerId: "envoy:owner:worker-1",
    proposedCostUsd: 2,
    proposedEtaAt: "2026-06-18T00:30:00.000Z",
    bidExpiresAt: "2026-06-18T01:00:00.000Z",
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

async function bootstrapSingleSubtask() {
  const state = createChainState(makeMandate());
  const deps = makeDeps();
  const plan = await planChain(deps, state, "build me a thing");
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error("plan failed");
  const subtask = plan.subtasks[0];
  // seed 3 bids
  state.bids.set(`${subtask.subtaskId}::12D3KooW-w1`, makeBid({ workerPeerId: "12D3KooW-w1", proposedCostUsd: 1.5 }));
  state.bids.set(`${subtask.subtaskId}::12D3KooW-w2`, makeBid({ workerPeerId: "12D3KooW-w2", proposedCostUsd: 2.5 }));
  state.bids.set(`${subtask.subtaskId}::12D3KooW-w3`, makeBid({ workerPeerId: "12D3KooW-w3", proposedCostUsd: 3.0 }));
  // Track the workers that were proposed to (so counterBid can re-propose).
  state.workersBySubtask.set(subtask.subtaskId, ["12D3KooW-w1", "12D3KooW-w2", "12D3KooW-w3"]);
  return { state, deps, subtask };
}

describe("evaluateBids — owner pick (40D)", () => {
  it("honors pickWorkerPeerId over the cheapest policy", async () => {
    const { state, deps, subtask } = await bootstrapSingleSubtask();
    // The cheapest bid is w1 ($1.50). The owner picks the most expensive w3 ($3.00).
    const result = await evaluateBids(deps, state, {
      subtaskId: subtask.subtaskId,
      pickWorkerPeerId: "12D3KooW-w3",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bid.workerPeerId).toBe("12D3KooW-w3");
    expect(result.bid.proposedCostUsd).toBe(3.0);
  });

  it("returns no_bids when the picked worker did not bid", async () => {
    const { state, deps, subtask } = await bootstrapSingleSubtask();
    const result = await evaluateBids(deps, state, {
      subtaskId: subtask.subtaskId,
      pickWorkerPeerId: "12D3KooW-unknown",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_bids");
  });

  it("still falls back to cheapest when pickWorkerPeerId is omitted", async () => {
    const { state, deps, subtask } = await bootstrapSingleSubtask();
    const result = await evaluateBids(deps, state, {
      subtaskId: subtask.subtaskId,
      policy: "cheapest",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bid.workerPeerId).toBe("12D3KooW-w1");
  });
});

describe("counterBid — reject and rebroadcast (40D)", () => {
  it("clears all bids for the subtask and bumps the round counter", async () => {
    const { state, deps, subtask } = await bootstrapSingleSubtask();
    expect(state.bids.size).toBe(3);

    const result = await counterBid(deps, state, {
      subtaskId: subtask.subtaskId,
      newCostCeilingUsd: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.clearedBids).toBe(3);
    expect(result.newRound).toBe(1);
    expect(state.bids.size).toBe(0);
    expect(state.negotiationRounds.get(subtask.subtaskId)).toBe(1);
    expect(subtask.costCeilingUsd).toBe(5);
  });

  it("rebroadcasts the proposal to the original worker set", async () => {
    const { state, deps, subtask } = await bootstrapSingleSubtask();
    deps.sentEnvelopes.length = 0;
    const result = await counterBid(deps, state, {
      subtaskId: subtask.subtaskId,
      newCostCeilingUsd: 4,
    });
    expect(result.ok).toBe(true);
    // Three proposals sent (one per worker).
    expect(deps.sentEnvelopes.length).toBe(3);
    const recipients = deps.sentEnvelopes.map((e) => e.recipientPeerId).sort();
    expect(recipients).toEqual(["12D3KooW-w1", "12D3KooW-w2", "12D3KooW-w3"]);
  });

  it("refuses invalid amounts", async () => {
    const { state, deps, subtask } = await bootstrapSingleSubtask();
    const result = await counterBid(deps, state, {
      subtaskId: subtask.subtaskId,
      newCostCeilingUsd: -1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("ceiling_too_low");
  });

  it("returns no_such_subtask for an unknown subtask", async () => {
    const { state, deps } = await bootstrapSingleSubtask();
    const result = await counterBid(deps, state, {
      subtaskId: "subtask_unknown",
      newCostCeilingUsd: 5,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_such_subtask");
  });

  it("refuses counter-bid beyond round 3", async () => {
    const { state, deps, subtask } = await bootstrapSingleSubtask();
    state.negotiationRounds.set(subtask.subtaskId, 3);
    const result = await counterBid(deps, state, {
      subtaskId: subtask.subtaskId,
      newCostCeilingUsd: 5,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("max_rounds_exceeded");
  });

  it("clears awards and re-broadcasts, but committed spend stays put", async () => {
    const { state, deps, subtask } = await bootstrapSingleSubtask();
    // Round 1: award w1 (cheapest). evaluateBids reserves + commits.
    const r1 = await evaluateBids(deps, state, { subtaskId: subtask.subtaskId, policy: "cheapest" });
    expect(r1.ok).toBe(true);
    const snapBefore = state.ledger.snapshot();
    expect(snapBefore.committedUsd).toBe(1.5);
    expect(state.awards.has(subtask.subtaskId)).toBe(true);

    // Counter-bid clears bids + the in-memory award, but committed spend
    // (real cost already incurred) stays put — the ledger invariant forbids
    // rolling back committed reservations.
    const r2 = await counterBid(deps, state, {
      subtaskId: subtask.subtaskId,
      newCostCeilingUsd: 5,
    });
    expect(r2.ok).toBe(true);
    const snapAfter = state.ledger.snapshot();
    expect(snapAfter.committedUsd).toBe(1.5);
    expect(state.awards.has(subtask.subtaskId)).toBe(false);
    expect(state.bids.size).toBe(0);
  });
});

describe("rebalanceChain — raise max + re-evaluate (40D)", () => {
  it("raises maxChainCostUsd and re-evaluates un-awarded subtasks", async () => {
    const { state, deps, subtask } = await bootstrapSingleSubtask();
    const previous = state.chainMandate.maxChainCostUsd;
    const result = await rebalanceChain(deps, state, { additionalBudgetUsd: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.previousMaxUsd).toBe(previous);
    expect(result.newMaxUsd).toBe(previous + 5);
    // The subtask had live bids → should have been awarded during re-evaluation.
    expect(result.reEvaluated.length).toBe(1);
    expect(result.reEvaluated[0].awarded).toBe(true);
    expect(result.reEvaluated[0].workerPeerId).toBe("12D3KooW-w1");
    expect(state.awards.has(subtask.subtaskId)).toBe(true);
  });

  it("skips already-awarded subtasks", async () => {
    const { state, deps, subtask } = await bootstrapSingleSubtask();
    // Round 1: award w1 (cheapest) so subtask is "already-awarded".
    const r1 = await evaluateBids(deps, state, { subtaskId: subtask.subtaskId, policy: "cheapest" });
    expect(r1.ok).toBe(true);

    const result = await rebalanceChain(deps, state, { additionalBudgetUsd: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No not-yet-awarded subtasks → nothing to re-evaluate.
    expect(result.reEvaluated.length).toBe(0);
  });

  it("re-evaluates multiple not-yet-awarded subtasks at once", async () => {
    const { state, deps, subtask: s1 } = await bootstrapSingleSubtask();
    // Add a second subtask with bids (not yet awarded).
    const s2: ChainSubtask = { ...s1, subtaskId: "subtask_b", objective: "another" };
    state.subtasks.set(s2.subtaskId, s2);
    state.bids.set(`${s2.subtaskId}::12D3KooW-w2`, makeBid({ subtaskId: s2.subtaskId, workerPeerId: "12D3KooW-w2", proposedCostUsd: 1 }));
    state.workersBySubtask.set(s2.subtaskId, ["12D3KooW-w2"]);

    const result = await rebalanceChain(deps, state, { additionalBudgetUsd: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reEvaluated.length).toBe(2);
    const awarded = result.reEvaluated.filter((r) => r.awarded).map((r) => r.subtaskId).sort();
    expect(awarded).toEqual([s1.subtaskId, s2.subtaskId].sort());
  });

  it("refuses invalid amounts", async () => {
    const { state, deps } = await bootstrapSingleSubtask();
    const result = await rebalanceChain(deps, state, { additionalBudgetUsd: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_amount");
  });

  it("refuses when the chain is cancelled", async () => {
    const { state, deps } = await bootstrapSingleSubtask();
    state.chainCancelled = true;
    const result = await rebalanceChain(deps, state, { additionalBudgetUsd: 5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("cancelled");
  });
});

describe("launchChain — workersBySubtask populated for later counter-bids", () => {
  it("records workers per subtask so counterBid can re-propose", async () => {
    const state = createChainState(makeMandate());
    const deps = makeDeps();
    const plan = await planChain(deps, state, "another goal");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const subtask = plan.subtasks[0];
    const result = await launchChain(deps, state, {
      [subtask.subtaskId]: ["12D3KooW-alpha", "12D3KooW-beta"],
    });
    expect(result.ok).toBe(true);
    expect(state.workersBySubtask.get(subtask.subtaskId)).toEqual(["12D3KooW-alpha", "12D3KooW-beta"]);
  });
});