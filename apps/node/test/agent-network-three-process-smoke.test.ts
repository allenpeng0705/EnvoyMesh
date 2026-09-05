/**
 * Phase 60F — packaged three-process Agent Network smoke (libp2p).
 *
 * Complements the in-process lab matrix (`agent-network-lab-matrix.test.ts`):
 * this file boots three real Phase13 homes over loopback libp2p and asserts
 * Phase 60 wiring that the lab cannot prove:
 *   1. Worker leases cross the mesh and appear as lease-ready on the assigner.
 *   2. Preview ranks workers with `availabilitySource: "lease"`.
 *   3. Competitive evaluate awards a remote worker (assigner-side).
 *   4. With mock Team-job engines on worker homes, execute→report completes
 *      (same path as chain-three-home-smoke).
 *
 * Gated out of the default unit suite (`*smoke*` exclude). Run via:
 *   bash scripts/agent-network-three-process-smoke.sh
 *   RUN_E2E=1 npx vitest run apps/node/test/agent-network-three-process-smoke.test.ts
 *
 * Full operator notes: docs/agent-network-three-process-smoke.md
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  waitForPhase13,
  wireWorkerLeaseInboundHandler,
  wireMockTeamJobEngine,
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

describe.sequential("E2E Phase 60 three-process Agent Network smoke (libp2p)", () => {
  it("leases cross the mesh, preview prefers lease, and assigner awards", async () => {
    const orchestrator = await createPhase13TestNode();
    const workerB = await createPhase13TestNode();
    const workerC = await createPhase13TestNode();
    nodes.push(orchestrator, workerB, workerC);

    await wireHomeAsChainParticipant(orchestrator);
    await wireHomeAsChainParticipant(workerB);
    await wireHomeAsChainParticipant(workerC);
    wireMockTeamJobEngine(orchestrator);
    wireMockTeamJobEngine(workerB);
    wireMockTeamJobEngine(workerC);

    await enableAgentNetworkWorker(orchestrator, {
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
    await enableAgentNetworkWorker(workerB, {
      displayName: "Harness Worker",
      capabilities: ["task.execute", "research.web", "agent-network-worker"],
      profile: {
        modelFreshness: 8,
        spendPosture: "subscription",
        contextWindow: "256k",
        skills: ["research"],
        throughputTokensPerSec: 40,
      },
    });
    await enableAgentNetworkWorker(workerC, {
      displayName: "OpenClaw Worker",
      capabilities: ["task.execute", "research.web", "agent-network-worker"],
      profile: {
        modelFreshness: 7,
        spendPosture: "metered",
        contextWindow: "128k",
        skills: ["research"],
        throughputTokensPerSec: 30,
      },
    });

    // Competitive award matches Phase 43 three-home smoke (bids → evaluate → report).
    await orchestrator.service.updateNodeConfig({
      chainDefaults: {
        awardMode: "competitive",
        allowLlmDecompose: false,
        rebalancePolicy: "never",
      },
    });
    await bondAndExchangeCards(orchestrator, workerB, "Assigner", "Harness Worker");
    await bondAndExchangeCards(orchestrator, workerC, "Assigner", "OpenClaw Worker");
    await bondAndExchangeCards(workerB, workerC, "Harness Worker", "OpenClaw Worker");
    await orchestrator.service.refreshAgentNetworkMembershipIndex();

    // Assigner must accept inbound leases; workers publish.
    await startLeasePublisher(orchestrator);
    await startLeasePublisher(workerB);
    await startLeasePublisher(workerC);

    await waitForPhase13(async () => {
      const snap = await orchestrator.service.agentNetworkDiagnosticsSnapshot();
      const ready = snap.workers.filter((w) => w.leaseReady);
      return ready.length >= 2;
    }, 30_000);

    const diagnostics = await orchestrator.service.agentNetworkDiagnosticsSnapshot();
    expect(diagnostics.localFeatures).toContain("worker-lease-v1");
    expect(diagnostics.localFeatures).toContain("chain-attempt-v1");
    expect(diagnostics.workers.filter((w) => w.leaseReady).length).toBeGreaterThanOrEqual(2);

    const preview = await orchestrator.service.chainPreviewGoal({
      goal: "summarize the Q3 report",
      allowLlm: false,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.subtasks[0]?.workerCount).toBeGreaterThanOrEqual(2);

    const suggested = preview.suggestedWorkers ?? [];
    const leaseBacked = suggested.filter((w) => w.availabilitySource === "lease");
    expect(
      leaseBacked.length,
      `expected lease-backed preview workers, got ${JSON.stringify(
        suggested.map((w) => ({
          peerId: w.peerId?.slice(0, 16),
          availabilitySource: w.availabilitySource,
        })),
      )}`,
    ).toBeGreaterThanOrEqual(1);

    const started = await orchestrator.service.chainStartFromGoal({
      goal: "summarize the Q3 report",
      allowLlm: false,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;

    const chainId = started.chainId;
    const subtaskId = started.subtasks[0]?.subtaskId;
    expect(subtaskId).toBeTruthy();

    await waitForPhase13(async () => {
      const state = await orchestrator.service.chainGetState({ chainId });
      return state.bidCount >= 1;
    }, 30_000);

    const evaluated = await orchestrator.service.chainEvaluateBids({
      chainId,
      subtaskId: subtaskId!,
      policy: "composite",
    });
    expect(evaluated.awarded).toBe(true);

    await waitForPhase13(async () => {
      const state = await orchestrator.service.chainGetState({ chainId });
      return state.awardedCount > 0;
    }, 15_000);

    const awardedState = await orchestrator.service.chainGetState({ chainId });
    expect(awardedState.awardedCount).toBeGreaterThan(0);

    await waitForPhase13(async () => {
      const state = await orchestrator.service.chainGetState({ chainId });
      return state.published || state.partialCount > 0;
    }, 30_000);

    await waitForPhase13(async () => {
      const report = await orchestrator.service.chainGetReport({ chainId });
      return report.report != null;
    }, 30_000);

    const report = await orchestrator.service.chainGetReport({ chainId });
    expect(report.report?.chainId).toBe(chainId);
    expect(report.report?.executiveSummary?.length).toBeGreaterThan(0);
  }, 120_000);

  it("66B cold start: bond → Join+lease ensure → lease-visible → Team job starts", async () => {
    const orchestrator = await createPhase13TestNode();
    const workerB = await createPhase13TestNode();
    const workerC = await createPhase13TestNode();
    nodes.push(orchestrator, workerB, workerC);

    await wireHomeAsChainParticipant(orchestrator);
    await wireHomeAsChainParticipant(workerB);
    await wireHomeAsChainParticipant(workerC);
    wireMockTeamJobEngine(orchestrator);
    wireMockTeamJobEngine(workerB);
    wireMockTeamJobEngine(workerC);
    wireWorkerLeaseInboundHandler(orchestrator);
    wireWorkerLeaseInboundHandler(workerB);
    wireWorkerLeaseInboundHandler(workerC);

    await bondAndExchangeCards(orchestrator, workerB, "Assigner", "Worker B");
    await bondAndExchangeCards(orchestrator, workerC, "Assigner", "Worker C");

    const before = await orchestrator.service.agentNetworkDiagnosticsSnapshot();
    expect(before.workers.filter((w) => w.leaseReady).length).toBe(0);

    await enableAgentNetworkWorker(orchestrator, {
      displayName: "Assigner",
      capabilities: ["task.execute", "chain.orchestrate", "agent-network-worker"],
    });
    await enableAgentNetworkWorker(workerB, {
      displayName: "Worker B",
      capabilities: ["task.execute", "agent-network-worker"],
    });
    await enableAgentNetworkWorker(workerC, {
      displayName: "Worker C",
      capabilities: ["task.execute", "agent-network-worker"],
    });

    await orchestrator.service.ensureFleetWorkersJoinAndLease();
    await workerB.service.ensureFleetWorkersJoinAndLease();
    await workerC.service.ensureFleetWorkersJoinAndLease();
    await startLeasePublisher(orchestrator);
    await startLeasePublisher(workerB);
    await startLeasePublisher(workerC);
    await orchestrator.service.refreshAgentNetworkWorkers();

    await waitForPhase13(async () => {
      const snap = await orchestrator.service.agentNetworkDiagnosticsSnapshot();
      const ownerB = workerB.profile.owner.ownerId;
      const ownerC = workerC.profile.owner.ownerId;
      const rowB = snap.workers.find((w) => w.ownerId === ownerB);
      const rowC = snap.workers.find((w) => w.ownerId === ownerC);
      return rowB?.leaseReady === true && rowC?.leaseReady === true;
    }, 30_000);

    const snap = await orchestrator.service.agentNetworkDiagnosticsSnapshot();
    expect(snap.workers.filter((w) => w.leaseReady).length).toBeGreaterThanOrEqual(2);

    const started = await orchestrator.service.chainStartFromGoal({
      goal: "66B fleet cold start",
      allowLlm: false,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;

    await waitForPhase13(async () => {
      const state = await orchestrator.service.chainGetState({ chainId: started.chainId! });
      return state.bidCount >= 1;
    }, 30_000);
  }, 90_000);
});
