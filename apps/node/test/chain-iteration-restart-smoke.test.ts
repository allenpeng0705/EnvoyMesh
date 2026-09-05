/**
 * Phase 65B exit — long-running iteration survives Assigner restart.
 *
 * Round-1 owner hold → persist + restart Assigner NodeService → iteration
 * side-state (maxRounds / drafts / waitingForOwner) restored → Continue →
 * round 2 → single publish.
 *
 * Gated: RUN_E2E=1
 *   RUN_E2E=1 npx vitest run apps/node/test/chain-iteration-restart-smoke.test.ts
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  restartPhase13NodeService,
  waitForPhase13,
  wireMockTeamJobEngine,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import {
  applySharedPlanAssignAi,
  bondAndExchangeCards,
  enableAgentNetworkWorker,
  wireHomeAsChainParticipant,
} from "./chain-plan-assign-e2e-helpers.js";

const nodes: Phase13TestNode[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

async function meshTwoHomes() {
  const orch = await createPhase13TestNode();
  const worker = await createPhase13TestNode();
  nodes.push(orch, worker);

  await wireHomeAsChainParticipant(orch);
  await wireHomeAsChainParticipant(worker);
  wireMockTeamJobEngine(orch);
  wireMockTeamJobEngine(worker);

  await enableAgentNetworkWorker(orch, {
    displayName: "Assigner",
    membership: ["task.execute", "chain.orchestrate", "agent-network-worker"],
    profile: {
      modelFreshness: 5,
      spendPosture: "subscription",
      contextWindow: "128k",
      skills: ["task.execute"],
      throughputTokensPerSec: 20,
    },
  });
  await enableAgentNetworkWorker(worker, {
    displayName: "Worker",
    membership: ["task.execute", "coding", "research.web", "agent-network-worker"],
    profile: {
      modelFreshness: 9,
      spendPosture: "metered",
      contextWindow: "1M+",
      skills: ["coding", "research.web"],
      throughputTokensPerSec: 80,
    },
  });

  await bondAndExchangeCards(orch, worker, "Assigner", "Worker");
  await orch.service.refreshAgentNetworkMembershipIndex();
  await applySharedPlanAssignAi(orch, {
    iterationMaxRounds: 2,
    iterationJudgeMode: "owner",
    extendMaxStepsPerRound: 0,
  });

  return { orch, worker };
}

describe.sequential("E2E Phase 65B iteration survives Assigner restart", () => {
  it("restores multi-round iteration after Assigner restart and finishes round 2", async () => {
    const { orch } = await meshTwoHomes();

    const started = await orch.service.chainStartFromGoal({
      goal: "Research then draft a coded summary and merge into one final answer",
      allowLlm: true,
      iterationMaxRounds: 2,
      iterationJudgeMode: "owner",
      extendMaxStepsPerRound: 0,
      maxChainCostUsd: 50,
      costCeilingUsd: 10,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;
    const chainId = started.chainId;

    await waitForPhase13(async () => {
      const state = await orch.service.chainGetState({ chainId });
      return state.iteration?.waitingForOwner === true;
    }, 90_000);

    const held = await orch.service.chainGetState({ chainId });
    expect(held.published).toBe(false);
    expect(held.iteration?.maxRounds).toBe(2);
    expect(held.iteration?.drafts.length).toBeGreaterThanOrEqual(1);
    const draftsBefore = held.iteration!.drafts.length;

    // Phase 65B — durable checkpoint then Assigner process swap (Wave 0).
    await restartPhase13NodeService(orch, { chainId });
    wireMockTeamJobEngine(orch);
    await applySharedPlanAssignAi(orch, {
      iterationMaxRounds: 2,
      iterationJudgeMode: "owner",
      extendMaxStepsPerRound: 0,
    });
    await orch.service.refreshAgentNetworkMembershipIndex();

    const restored = await orch.service.chainGetState({ chainId });
    expect(restored.iteration?.maxRounds).toBe(2);
    expect(restored.iteration?.waitingForOwner).toBe(true);
    expect(restored.iteration?.drafts.length).toBe(draftsBefore);
    expect(restored.published).toBe(false);

    const cont = await orch.service.chainResolveIteration({
      chainId,
      decision: "continue",
    });
    expect(cont.ok).toBe(true);
    expect(cont.continued).toBe(true);

    await waitForPhase13(async () => {
      const report = await orch.service.chainGetReport({ chainId });
      return report.report != null;
    }, 120_000);

    const final = await orch.service.chainGetState({ chainId });
    expect(final.published).toBe(true);
    expect(final.iteration?.waitingForOwner).not.toBe(true);
    expect(final.iteration?.drafts.length).toBe(2);
    expect(final.iteration?.round).toBe(2);
    expect(final.iteration?.maxRounds).toBe(2);

    const report = await orch.service.chainGetReport({ chainId });
    expect(report.report?.chainId).toBe(chainId);
    expect(report.report?.executiveSummary?.length).toBeGreaterThan(0);
  }, 300_000);
});
