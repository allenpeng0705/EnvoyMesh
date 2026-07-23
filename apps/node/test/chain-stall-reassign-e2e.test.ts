/**
 * Stall → one re-assign E2E (libp2p).
 *
 * Orchestrator names a primary worker with a ranked backup. After award,
 * we age the award clock and run one production `trackChain` tick so
 * `reassignStalledSubtask` cancels the primary, rotates workers to the
 * backup, and caps at one reassign.
 *
 * Full backup re-award over the mesh is covered when connectivity holds
 * (see unit `reassignStalledSubtask` + three-home plan+assign for mesh
 * award paths). This E2E focuses on stall detection + reassign bookkeeping
 * on a real multi-home chain.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  buildChainOrchestrationContext,
  buildChainOrchestratorDeps,
} from "../src/node-service-chain-orchestration.js";
import { trackChain } from "../src/chain-orchestrator.js";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  waitForPhase13,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import {
  applySharedPlanAssignAi,
  bondAndExchangeCards,
  enableAgentNetworkWorker,
  getChainRuntime,
  wireHomeAsChainParticipant,
} from "./chain-plan-assign-e2e-helpers.js";

const nodes: Phase13TestNode[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

describe.sequential("E2E stall re-assign (libp2p)", () => {
  it("detects stall and reassigns once to the ranked backup", async () => {
    const orch = await createPhase13TestNode();
    const primary = await createPhase13TestNode();
    const backup = await createPhase13TestNode();
    nodes.push(orch, primary, backup);

    await wireHomeAsChainParticipant(orch);
    await wireHomeAsChainParticipant(primary);
    await wireHomeAsChainParticipant(backup);

    await enableAgentNetworkWorker(orch, {
      displayName: "Orch",
      capabilities: ["task.execute", "chain.orchestrate", "capability-provider"],
      profile: {
        modelFreshness: 5,
        spendPosture: "subscription",
        contextWindow: "128k",
        strengths: ["task.execute"],
        throughputTokensPerSec: 10,
      },
    });
    const primaryPeerId = await enableAgentNetworkWorker(primary, {
      displayName: "Primary",
      capabilities: ["task.execute", "coding", "capability-provider"],
      profile: {
        modelFreshness: 9,
        spendPosture: "subscription",
        contextWindow: "1M+",
        strengths: ["coding"],
        throughputTokensPerSec: 100,
      },
    });
    const backupPeerId = await enableAgentNetworkWorker(backup, {
      displayName: "Backup",
      capabilities: ["task.execute", "coding", "capability-provider"],
      profile: {
        modelFreshness: 4,
        spendPosture: "metered",
        contextWindow: "128k",
        strengths: ["coding"],
        throughputTokensPerSec: 20,
      },
    });

    await applySharedPlanAssignAi(orch, { stallTimeoutMs: 120_000 });
    await bondAndExchangeCards(orch, primary, "Orch", "Primary");
    await bondAndExchangeCards(orch, backup, "Orch", "Backup");
    await bondAndExchangeCards(primary, backup, "Primary", "Backup");
    await orch.service.refreshCapabilityIndex();

    const started = await orch.service.chainStartFromGoal({
      goal: "Research then draft a coded summary and merge into one final answer",
      allowLlm: true,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;
    const chainId = started.chainId;

    const codingStep = started.subtasks?.find((s) => s.requiredCapability === "coding");
    expect(codingStep?.preferredWorkerPeerId).toBe(primaryPeerId);
    expect(codingStep?.subtaskId).toBeTruthy();
    const subtaskId = codingStep!.subtaskId;

    await waitForPhase13(async () => {
      const rt = getChainRuntime(orch.service, chainId);
      if (!rt) return false;
      if (rt.state.awards.get(subtaskId)?.workerPeerId === primaryPeerId) return true;
      for (const [id, a] of rt.state.awards.entries()) {
        const workers = rt.state.workersBySubtask.get(id) ?? [];
        if (
          a.workerPeerId === primaryPeerId &&
          workers.includes(primaryPeerId) &&
          workers.includes(backupPeerId)
        ) {
          return true;
        }
      }
      return false;
    }, 45_000);

    const runtime = getChainRuntime(orch.service, chainId);
    expect(runtime).toBeTruthy();
    let targetSubtaskId = subtaskId;
    let targetAward = runtime!.state.awards.get(subtaskId);
    if (!targetAward || targetAward.workerPeerId !== primaryPeerId) {
      targetAward = undefined;
      for (const [id, a] of runtime!.state.awards.entries()) {
        const workers = runtime!.state.workersBySubtask.get(id) ?? [];
        if (
          a.workerPeerId === primaryPeerId &&
          workers.includes(primaryPeerId) &&
          workers.includes(backupPeerId)
        ) {
          targetSubtaskId = id;
          targetAward = a;
          break;
        }
      }
    }
    expect(targetAward).toBeTruthy();
    expect(targetAward!.workerPeerId).toBe(primaryPeerId);
    expect(runtime!.state.workersBySubtask.get(targetSubtaskId)?.[0]).toBe(primaryPeerId);
    expect(runtime!.state.workersBySubtask.get(targetSubtaskId)).toContain(backupPeerId);

    const tracker = orch.service as unknown as {
      _stopChainTracking: (id: string) => void;
    };
    tracker._stopChainTracking(chainId);

    runtime!.state.partials.delete(targetSubtaskId);
    runtime!.state.published = false;
    runtime!.state.chainMandate.stallTimeoutMs = 1;
    runtime!.state.awardedAt.set(
      targetSubtaskId,
      new Date(Date.now() - 60_000).toISOString(),
    );
    runtime!.state.lastHeartbeatAt.delete(targetSubtaskId);

    const orchDeps = await buildChainOrchestratorDeps(buildChainOrchestrationContext(orch.service));
    await trackChain(orchDeps, runtime!.state as never, { tickMs: 1, maxTicks: 1 });

    expect(runtime!.state.reassignCount.get(targetSubtaskId)).toBe(1);
    expect(runtime!.state.awards.has(targetSubtaskId)).toBe(false);
    expect(runtime!.state.workersBySubtask.get(targetSubtaskId)?.[0]).toBe(backupPeerId);

    // Cap: another stall tick must not reassign again.
    // Re-award locally so the stall path sees an award to attempt (and refuse).
    runtime!.state.awards.set(targetSubtaskId, {
      workerPeerId: backupPeerId,
    } as never);
    runtime!.state.awardedAt.set(targetSubtaskId, new Date(Date.now() - 60_000).toISOString());
    runtime!.state.lastHeartbeatAt.delete(targetSubtaskId);
    runtime!.state.partials.delete(targetSubtaskId);
    await trackChain(orchDeps, runtime!.state as never, { tickMs: 1, maxTicks: 1 });
    expect(runtime!.state.reassignCount.get(targetSubtaskId)).toBe(1);
  }, 120_000);
});
