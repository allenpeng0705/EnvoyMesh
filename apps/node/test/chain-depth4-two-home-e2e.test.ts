/**
 * Phase 65A exit — opt-in depth-4 Team job across ≥2 homes (libp2p).
 *
 * Uses a frozen plan with a depth-1 leaf + depth-4 rollup so we prove the
 * mandate gate (allowDepth4) without depending on LLM depth proposals.
 *
 * Gated: RUN_E2E=1
 *   RUN_E2E=1 npx vitest run apps/node/test/chain-depth4-two-home-e2e.test.ts
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  waitForPhase13,
  wireMockTeamJobEngine,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import {
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
    displayName: "Orch",
    membership: ["task.execute", "chain.orchestrate", "agent-network-worker"],
    profile: {
      modelFreshness: 5,
      spendPosture: "subscription",
      contextWindow: "128k",
      skills: ["task.execute"],
      throughputTokensPerSec: 20,
    },
  });
  const workerPeerId = await enableAgentNetworkWorker(worker, {
    displayName: "Worker",
    membership: ["task.execute", "research.web", "agent-network-worker"],
    profile: {
      modelFreshness: 9,
      spendPosture: "metered",
      contextWindow: "1M+",
      skills: ["research.web", "task.execute"],
      throughputTokensPerSec: 80,
    },
  });

  await bondAndExchangeCards(orch, worker, "Orch", "Worker");
  await orch.service.refreshAgentNetworkMembershipIndex();
  await orch.service.updateNodeConfig({
    chainDefaults: {
      awardMode: "direct",
      allowLlmDecompose: false,
      rebalancePolicy: "never",
      iterationMaxRounds: 1,
      extendMaxStepsPerRound: 0,
    },
  });

  return { orch, worker, workerPeerId };
}

function depth4Plan(workerPeerId: string) {
  const leafId = "subtask_65a_leaf";
  const rollupId = "subtask_65a_d4";
  return [
    {
      subtaskId: leafId,
      depth: 1,
      requiredSkill: "research.web",
      objective: "Gather leaf facts for the depth-4 rollup",
      requestedResult: "leaf notes",
      constraints: [],
      dependsOn: [] as string[],
      preferredWorkerPeerId: workerPeerId,
    },
    {
      subtaskId: rollupId,
      depth: 4,
      requiredSkill: "task.execute",
      objective: "Roll up nested results at mandate depth 4",
      requestedResult: "depth-4 summary",
      constraints: [],
      dependsOn: [leafId],
      preferredWorkerPeerId: workerPeerId,
    },
  ];
}

describe.sequential("E2E Phase 65A depth-4 two-home", () => {
  it("allowDepth4 keeps depth-4 rollup and completes across orch+worker homes", async () => {
    const { orch, workerPeerId } = await meshTwoHomes();
    const planned = depth4Plan(workerPeerId);

    const started = await orch.service.chainStartFromGoal({
      goal: "Nested depth-4 Team job across two homes",
      allowLlm: false,
      allowDepth4: true,
      plannedSubtasks: planned,
      maxChainCostUsd: 20,
      costCeilingUsd: 5,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;

    const chainId = started.chainId;
    const depths = started.subtasks.map((s) => s.depth).sort((a, b) => a - b);
    expect(depths).toEqual([1, 4]);

    await waitForPhase13(async () => {
      const report = await orch.service.chainGetReport({ chainId });
      return report.report != null;
    }, 120_000);

    const state = await orch.service.chainGetState({ chainId });
    expect(state.published).toBe(true);
    const liveDepths = (state.steps ?? [])
      .map((s) => {
        const runtime = (
          orch.service as unknown as {
            _chainStore: {
              getRuntime: (id: string) =>
                | { state: { subtasks: Map<string, { depth: number }> } }
                | undefined;
            };
          }
        )._chainStore.getRuntime(chainId);
        return runtime?.state.subtasks.get(s.subtaskId)?.depth;
      })
      .filter((d): d is number => typeof d === "number");
    expect(liveDepths).toContain(4);

    const report = await orch.service.chainGetReport({ chainId });
    expect(report.report?.chainId).toBe(chainId);
    expect(report.report?.executiveSummary?.length).toBeGreaterThan(0);
  }, 180_000);

  it("without allowDepth4, planned depth-4 is clamped before launch", async () => {
    const { orch, workerPeerId } = await meshTwoHomes();
    const planned = depth4Plan(workerPeerId);

    const started = await orch.service.chainStartFromGoal({
      goal: "Depth-4 without opt-in must clamp",
      allowLlm: false,
      allowDepth4: false,
      plannedSubtasks: planned,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.subtasks.every((s) => s.depth <= 2)).toBe(true);
    expect(started.subtasks.some((s) => s.depth === 4)).toBe(false);
  }, 90_000);
});
