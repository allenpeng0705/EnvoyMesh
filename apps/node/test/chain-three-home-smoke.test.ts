/**
 * Phase 43 — three-home libp2p agent-network chain smoke test.
 *
 * Orchestrator home (Alice) + two worker homes (Bob, Carol). Both workers
 * bid on the same subtask; the orchestrator awards one, executes, and
 * publishes a chain report.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  ensureBridgeIdentity,
  registerBondedPeer,
  waitForPhase13,
  wireChainInboundHandler,
  wireNodeServiceInboundHandlers,
  wireProductionAgentCardHandlers,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";

const nodes: Phase13TestNode[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

async function setupWorkerHome(
  orchestrator: Phase13TestNode,
  worker: Phase13TestNode,
  displayName: string,
): Promise<void> {
  await registerBondedPeer(orchestrator, worker, displayName);
  await registerBondedPeer(worker, orchestrator, "Orchestrator");

  const bridge = await ensureBridgeIdentity(worker);
  wireProductionAgentCardHandlers(worker, bridge);
  wireNodeServiceInboundHandlers(worker);
  wireChainInboundHandler(worker);
  worker.service.bindCliTaskStore(worker.taskStore);

  await worker.service.updateCapabilityManifest({
    capabilities: ["task.execute", "research.web"],
  });
  await worker.service.updateNodeConfig({ capabilityProviderEnabled: true });

  await worker.human.saveHumanProfile({
    displayName,
    bio: "",
    hobbies: [],
    knowledge: [],
  });

  await orchestrator.mesh.probePeer(worker.mesh.multiaddrs[0]!);
  await worker.mesh.probePeer(orchestrator.mesh.multiaddrs[0]!);

  const card = await orchestrator.service.requestAgentCard(worker.profile.owner.ownerId);
  expect(card.ok).toBe(true);
  await waitForPhase13(async () => {
    const cards = await orchestrator.service.listAgentCards();
    return cards.some((row) => row.ownerId === worker.profile.owner.ownerId);
  }, 10_000);

  const orchCard = await worker.service.requestAgentCard(orchestrator.profile.owner.ownerId);
  expect(orchCard.ok).toBe(true);
  await waitForPhase13(async () => {
    const cards = await worker.service.listAgentCards();
    return cards.some((row) => row.ownerId === orchestrator.profile.owner.ownerId);
  }, 10_000);
}

async function setupThreeChainHomes(): Promise<{
  orchestrator: Phase13TestNode;
  workerB: Phase13TestNode;
  workerC: Phase13TestNode;
}> {
  const orchestrator = await createPhase13TestNode();
  const workerB = await createPhase13TestNode();
  const workerC = await createPhase13TestNode();
  nodes.push(orchestrator, workerB, workerC);

  const orchBridge = await ensureBridgeIdentity(orchestrator);
  wireProductionAgentCardHandlers(orchestrator, orchBridge);
  wireNodeServiceInboundHandlers(orchestrator);
  wireChainInboundHandler(orchestrator);
  orchestrator.service.bindCliTaskStore(orchestrator.taskStore);

  await orchestrator.service.updateCapabilityManifest({
    capabilities: ["task.execute", "chain.orchestrate", "research.web"],
  });
  await orchestrator.human.saveHumanProfile({
    displayName: "Orchestrator",
    bio: "",
    hobbies: [],
    knowledge: [],
  });

  await setupWorkerHome(orchestrator, workerB, "Worker B");
  await setupWorkerHome(orchestrator, workerC, "Worker C");
  await orchestrator.service.refreshAgentNetworkMembershipIndex();

  return { orchestrator, workerB, workerC };
}

describe.sequential("E2E three-home chain smoke (libp2p)", () => {
  it("orchestrator + two worker homes: both bid, chain completes to report", async () => {
    const { orchestrator, workerB, workerC } = await setupThreeChainHomes();

    const preview = await orchestrator.service.chainPreviewGoal({
      goal: "summarize the Q3 report",
      allowLlm: false,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.subtasks[0]?.workerCount).toBeGreaterThanOrEqual(2);

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
      return state.bidCount >= 2;
    }, 20_000);

    const evaluated = await orchestrator.service.chainEvaluateBids({
      chainId,
      subtaskId: subtaskId!,
      policy: "composite",
    });
    expect(evaluated.awarded).toBe(true);

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

    void workerB;
    void workerC;
  }, 120_000);
});
