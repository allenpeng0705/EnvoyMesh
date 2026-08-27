/**
 * Phase 43 — auto-orchestrator, defaults, and cost export unit tests.
 */

import { describe, expect, it } from "vitest";

import { createChainSubtaskId } from "@envoymesh/protocol";

import {
  allActiveSubtasksHaveFinalPartials,
  chainBudgetWarningLevel,
  hasUnawardedActiveSubtasks,
  subtasksAwaitingAward,
} from "../src/chain-auto-orchestrator.js";
import { estimateChainCostRange, mergeChainDefaults } from "../src/chain-defaults.js";
import { chainCostsToCsv } from "../src/chain-cost-export.js";
import { createChainState } from "../src/chain-orchestrator.js";

function sampleState() {
  const mandate = {
    version: "0.1" as const,
    chainMandateId: "cm_1",
    chainId: "chain_1",
    issuerOwnerId: "owner_a",
    orchestratorOwnerId: "owner_a",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public" as const,
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    createdAt: new Date().toISOString(),
    rebalancePolicy: "auto" as const,
    maxAutoRebalances: 2,
    autoRebalanceIncrementUsd: 5,
    signature: "stub",
  };
  const state = createChainState(mandate);
  const subtaskId = createChainSubtaskId("chain_1", 1);
  state.subtasks.set(subtaskId, {
    version: "0.1",
    subtaskId,
    chainId: "chain_1",
    depth: 1,
    requiredSkill: "research.web",
    objective: "Research topic",
    costCeilingUsd: 3,
    createdAt: new Date().toISOString(),
  });
  return { state, subtaskId, mandate };
}

describe("chain-defaults", () => {
  it("mergeChainDefaults applies never rebalance by default (direct award mode)", () => {
    const d = mergeChainDefaults({});
    expect(d.rebalancePolicy).toBe("never");
  });

  it("estimateChainCostRange returns min <= max", () => {
    const r = estimateChainCostRange({ subtaskCount: 2, workerCandidateCount: 3, maxChainCostUsd: 15 });
    expect(r.minUsd).toBeLessThanOrEqual(r.maxUsd);
  });
});

describe("chain-auto-orchestrator", () => {
  it("subtasksAwaitingAward lists subtasks with bids but no award", () => {
    const { state, subtaskId } = sampleState();
    state.bids.set(`${subtaskId}::worker_1`, {
      version: "0.1",
      subtaskId,
      chainId: "chain_1",
      workerPeerId: "worker_1",
      workerOwnerId: "owner_b",
      proposedCostUsd: 2,
      proposedEtaAt: new Date(Date.now() + 60_000).toISOString(),
      bidExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    expect(subtasksAwaitingAward(state)).toEqual([subtaskId]);
  });

  it("allActiveSubtasksHaveFinalPartials is false until final partial", () => {
    const { state, subtaskId } = sampleState();
    expect(allActiveSubtasksHaveFinalPartials(state)).toBe(false);
    state.partials.set(subtaskId, {
      partial: {
        version: "0.1",
        subtaskId,
        chainId: "chain_1",
        workerPeerId: "worker_1",
        seq: 1,
        isFinal: true,
        note: "done",
        createdAt: new Date().toISOString(),
      },
    });
    expect(allActiveSubtasksHaveFinalPartials(state)).toBe(true);
  });

  it("hasUnawardedActiveSubtasks blocks completion when extend adds unawarded steps", () => {
    const { state, subtaskId } = sampleState();
    const extra = createChainSubtaskId("chain_1", 2);
    state.subtasks.set(extra, {
      version: "0.1",
      subtaskId: extra,
      chainId: "chain_1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "Extra step",
      costCeilingUsd: 3,
      createdAt: new Date().toISOString(),
    });
    state.awards.set(subtaskId, {
      version: "0.1",
      subtaskId,
      chainId: "chain_1",
      workerPeerId: "worker_1",
      acceptedCostUsd: 1,
      acceptedAt: new Date().toISOString(),
    });
    state.partials.set(subtaskId, {
      partial: {
        version: "0.1",
        subtaskId,
        chainId: "chain_1",
        workerPeerId: "worker_1",
        seq: 1,
        isFinal: true,
        note: "done",
        createdAt: new Date().toISOString(),
      },
    });
    expect(hasUnawardedActiveSubtasks(state)).toBe(true);
    expect(allActiveSubtasksHaveFinalPartials(state)).toBe(false);
  });

  it("chainBudgetWarningLevel warns at 80% spend", async () => {
    const { state, subtaskId } = sampleState();
    await state.ledger.reserve(subtaskId, "worker_1", 8);
    expect(chainBudgetWarningLevel(state)).toBe("warn");
  });
});

describe("chain-cost-export", () => {
  it("exports CSV with chain id and budget columns", () => {
    const { state } = sampleState();
    const csv = chainCostsToCsv(state);
    expect(csv).toContain("chain_1");
    expect(csv).toContain("budgetMaxUsd");
  });
});
