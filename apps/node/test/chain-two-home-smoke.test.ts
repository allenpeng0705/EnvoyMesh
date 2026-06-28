/**
 * Phase 43F — two-home libp2p chain smoke test.
 *
 * Orchestrator home (Alice) launches a chain; worker home (Bob) bids,
 * executes after accept, and the orchestrator publishes a report to disk.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
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
});

async function setupChainHomes(): Promise<{ orchestrator: Phase13TestNode; worker: Phase13TestNode }> {
  const orchestrator = await createPhase13TestNode();
  const worker = await createPhase13TestNode();
  nodes.push(orchestrator, worker);

  await registerBondedPeer(orchestrator, worker, "Worker");
  await registerBondedPeer(worker, orchestrator, "Orchestrator");

  const orchBridge = await ensureBridgeIdentity(orchestrator);
  const workerBridge = await ensureBridgeIdentity(worker);

  wireProductionAgentCardHandlers(orchestrator, orchBridge);
  wireProductionAgentCardHandlers(worker, workerBridge);
  wireNodeServiceInboundHandlers(orchestrator);
  wireNodeServiceInboundHandlers(worker);
  wireChainInboundHandler(orchestrator);
  wireChainInboundHandler(worker);

  orchestrator.service.bindCliTaskStore(orchestrator.taskStore);
  worker.service.bindCliTaskStore(worker.taskStore);

  await orchestrator.service.updateCapabilityManifest({
    capabilities: ["task.execute", "chain.orchestrate", "research.web"],
  });
  await worker.service.updateCapabilityManifest({
    capabilities: ["task.execute", "research.web"],
  });
  await worker.service.updateNodeConfig({ capabilityProviderEnabled: true });

  await orchestrator.human.saveHumanProfile({
    displayName: "Orchestrator",
    bio: "",
    hobbies: [],
    knowledge: [],
  });
  await worker.human.saveHumanProfile({
    displayName: "Worker",
    bio: "",
    hobbies: [],
    knowledge: [],
  });

  await orchestrator.mesh.dial(worker.mesh.multiaddrs[0]!);
  await worker.mesh.dial(orchestrator.mesh.multiaddrs[0]!);

  const requestedWorkerCard = await orchestrator.service.requestAgentCard(worker.profile.owner.ownerId);
  expect(requestedWorkerCard.ok).toBe(true);
  await waitForPhase13(async () => {
    const cards = await orchestrator.service.listAgentCards();
    return cards.some((row) => row.ownerId === worker.profile.owner.ownerId);
  }, 10_000);

  const requestedOrchCard = await worker.service.requestAgentCard(orchestrator.profile.owner.ownerId);
  expect(requestedOrchCard.ok).toBe(true);
  await waitForPhase13(async () => {
    const cards = await worker.service.listAgentCards();
    return cards.some((row) => row.ownerId === orchestrator.profile.owner.ownerId);
  }, 10_000);
  await orchestrator.service.refreshCapabilityIndex();

  return { orchestrator, worker };
}

describe.sequential("E2E two-home chain smoke (libp2p)", () => {
  it("orchestrator home + worker home complete a chain to a stored report", async () => {
    const { orchestrator, worker } = await setupChainHomes();

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
      return state.bidCount > 0;
    }, 15_000);

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

    const active = await orchestrator.service.chainListActive();
    const row = active.chains.find((c) => c.chainId === chainId);
    expect(row?.published).toBe(true);

    void worker;
  }, 90_000);
});
