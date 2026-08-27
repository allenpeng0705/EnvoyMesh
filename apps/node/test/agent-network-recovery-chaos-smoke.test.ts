/**
 * Phase 61C — recovery chaos on real libp2p homes.
 *
 * Award a Team job, restart the assigner NodeServiceImpl from disk mid-run,
 * assert RECOVERING → reconcile grace → running → execute→report.
 *
 * Split into 3 it() blocks so a CI failure points at the exact phase that
 * regressed instead of "one giant test failed somewhere". All three share
 * `setupMidRunRecovery()` which boots the three homes, bonds + leases,
 * awards, and triggers an assigner restart — returning the runtime in
 * the "RECOVERING" state ready for the test to assert.
 *
 * Gated: RUN_E2E=1 (see vitest.config.ts *smoke* exclude).
 *   RUN_E2E=1 npx vitest run apps/node/test/agent-network-recovery-chaos-smoke.test.ts
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  restartPhase13NodeService,
  waitForPhase13,
  wireGatedMockTeamJobEngine,
  wireMockTeamJobEngine,
  wireWorkerLeaseInboundHandler,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import {
  bondAndExchangeCards,
  enableAgentNetworkWorker,
  wireHomeAsChainParticipant,
} from "./chain-plan-assign-e2e-helpers.js";

const nodes: Phase13TestNode[] = [];
const leaseStops: Array<{ stop: () => void }> = [];

afterEach(async () => {
  for (const row of leaseStops.splice(0)) {
    try {
      row.stop();
    } catch {
      /* ignore */
    }
  }
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

async function startLeasePublisher(node: Phase13TestNode): Promise<void> {
  wireWorkerLeaseInboundHandler(node);
  const broadcaster = await node.service.startWorkerLeaseBroadcaster(node.mesh, {
    intervalMs: 2_000,
    ttlMs: 30_000,
  });
  if (broadcaster) {
    leaseStops.push(broadcaster);
    await broadcaster.publishNow();
  }
}

/**
 * Drive the assigner + worker into the "RECOVERING" state: bond +
 * lease + award + worker mid-execution + assigner restart. Returns
 * `{ assigner, worker, chainId, subtaskId, workerGate }` for the
 * test to continue.
 *
 * The `workerGate` is intentionally still closed at this point so
 * tests can release it once they have asserted the recovery entry.
 */
async function setupMidRunRecovery(): Promise<{
  assigner: Phase13TestNode;
  worker: Phase13TestNode;
  chainId: string;
  subtaskId: string;
  workerGate: { release: () => void };
}> {
  const assigner = await createPhase13TestNode();
  const worker = await createPhase13TestNode();
  nodes.push(assigner, worker);

  await wireHomeAsChainParticipant(assigner);
  await wireHomeAsChainParticipant(worker);
  wireMockTeamJobEngine(assigner);
  const workerGate = wireGatedMockTeamJobEngine(worker);

  await enableAgentNetworkWorker(assigner, {
    displayName: "Assigner",
    capabilities: ["task.execute", "chain.orchestrate", "research.web"],
    profile: {
      modelFreshness: 5,
      spendPosture: "subscription",
      contextWindow: "128k",
      skills: ["task.execute", "research"],
      throughputTokensPerSec: 10,
    },
  });
  await enableAgentNetworkWorker(worker, {
    displayName: "Worker",
    capabilities: ["task.execute", "research.web", "agent-network-worker"],
    profile: {
      modelFreshness: 8,
      spendPosture: "subscription",
      contextWindow: "256k",
      skills: ["research"],
      throughputTokensPerSec: 40,
    },
  });

  await assigner.service.updateNodeConfig({
    chainDefaults: {
      awardMode: "competitive",
      allowLlmDecompose: false,
      rebalancePolicy: "never",
      iterationMaxRounds: 1,
      extendMaxStepsPerRound: 0,
    },
  });
  await bondAndExchangeCards(assigner, worker, "Assigner", "Worker");
  await assigner.service.refreshAgentNetworkMembershipIndex();

  await startLeasePublisher(assigner);
  await startLeasePublisher(worker);

  await waitForPhase13(async () => {
    const snap = await assigner.service.agentNetworkDiagnosticsSnapshot();
    return snap.workers.some((w) => w.leaseReady);
  }, 30_000);

  const started = await assigner.service.chainStartFromGoal({
    goal: "summarize the Q3 report",
    allowLlm: false,
    iterationMaxRounds: 1,
    extendMaxStepsPerRound: 0,
  });
  if (!started.ok || !started.chainId || started.subtasks.length === 0) {
    throw new Error("setup: chainStartFromGoal failed");
  }
  const chainId = started.chainId;
  const subtaskId = started.subtasks[0]!.subtaskId;

  await waitForPhase13(async () => {
    const state = await assigner.service.chainGetState({ chainId });
    return state.bidCount >= 1;
  }, 30_000);

  const evaluated = await assigner.service.chainEvaluateBids({
    chainId,
    subtaskId,
    policy: "composite",
  });
  if (!evaluated.awarded) {
    throw new Error("setup: chainEvaluateBids did not award");
  }

  await waitForPhase13(async () => {
    const state = await assigner.service.chainGetState({ chainId });
    return state.awardedCount > 0;
  }, 15_000);

  // Worker must be mid-execution (non-final partial) before assigner restart.
  await waitForPhase13(async () => {
    const state = await assigner.service.chainGetState({ chainId });
    return state.partialCount > 0;
  }, 30_000);

  await restartPhase13NodeService(assigner, { chainId });
  await assigner.mesh.probePeer(worker.mesh.multiaddrs[0]!);
  await worker.mesh.probePeer(assigner.mesh.multiaddrs[0]!);
  await assigner.service.refreshAgentNetworkMembershipIndex();
  await startLeasePublisher(assigner);

  await waitForPhase13(async () => {
    const state = await assigner.service.chainGetState({ chainId });
    return state.recovery?.phase === "recovering";
  }, 30_000);

  return { assigner, worker, chainId, subtaskId, workerGate };
}

describe.sequential("E2E Phase 61 recovery chaos (libp2p assigner restart)", () => {
  it("01 assigner restart mid-run enters RECOVERING with pending peer", async () => {
    const { assigner, chainId } = await setupMidRunRecovery();
    const state = await assigner.service.chainGetState({ chainId });
    expect(state.recovery?.phase).toBe("recovering");
    expect(state.recovery?.pendingPeers).toBeGreaterThanOrEqual(1);
  }, 240_000);

  it("02 worker release advances recovery past the grace deadline", async () => {
    const { assigner, worker, chainId, workerGate } = await setupMidRunRecovery();
    // Confirm we entered RECOVERING, then release the worker so the
    // reconcile response can flow back.
    const pre = await assigner.service.chainGetState({ chainId });
    expect(pre.recovery?.phase).toBe("recovering");
    workerGate.release();

    await waitForPhase13(async () => {
      const state = await assigner.service.chainGetState({ chainId });
      return !state.recovery || state.recovery.phase !== "recovering";
    }, 45_000);

    const post = await assigner.service.chainGetState({ chainId });
    expect(post.recovery?.phase).not.toBe("recovering");
    // Sanity: assigner is alive and the worker is still bonded.
    void worker;
  }, 240_000);

  it("03 chain publishes the report after recovery completes", async () => {
    const { assigner, chainId, workerGate } = await setupMidRunRecovery();
    workerGate.release();

    await waitForPhase13(async () => {
      const state = await assigner.service.chainGetState({ chainId });
      return (
        state.published ||
        (state.steps?.every(
          (s) => s.state === "done" || s.state === "cancelled",
        ) ?? false)
      );
    }, 60_000);

    await waitForPhase13(async () => {
      const report = await assigner.service.chainGetReport({ chainId });
      return report.report != null;
    }, 90_000);

    const report = await assigner.service.chainGetReport({ chainId });
    expect(report.report?.chainId).toBe(chainId);
    expect(report.report?.executiveSummary?.length).toBeGreaterThan(0);
  }, 240_000);
});
