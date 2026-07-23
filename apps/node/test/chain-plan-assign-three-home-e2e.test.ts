/**
 * Multi-home Team jobs plan+assign E2E (libp2p).
 *
 * Same AI settings on every home (`mode: "mock"` + roster-aware plan token).
 * Workers differ by capability tags + agentNetworkProfile (strengths /
 * throughput). Asserts soft ranking, named assignees, multi-step plan, and
 * final chain report.
 */

import { afterEach, describe, expect, it } from "vitest";
import { PLAN_ASSIGN_FROM_ROSTER_TOKEN } from "@envoymesh/models";

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

const SHARED_AI = {
  mode: "mock" as const,
  mockResponseText: PLAN_ASSIGN_FROM_ROSTER_TOKEN,
};

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

async function applySharedAi(node: Phase13TestNode): Promise<void> {
  await node.service.updateNodeConfig({
    modelProviders: SHARED_AI,
    chainDefaults: {
      awardMode: "direct",
      allowLlmDecompose: true,
      rebalancePolicy: "never",
    },
  });
}

async function setupDifferentiatedWorker(
  orchestrator: Phase13TestNode,
  worker: Phase13TestNode,
  opts: {
    displayName: string;
    capabilities: string[];
    profile: {
      modelFreshness: number;
      spendPosture: "subscription" | "metered" | "payg";
      contextWindow: "128k" | "512k" | "1M+";
      strengths: string[];
      throughputTokensPerSec: number;
    };
  },
): Promise<string> {
  await registerBondedPeer(orchestrator, worker, opts.displayName);
  await registerBondedPeer(worker, orchestrator, "Orchestrator");

  const bridge = await ensureBridgeIdentity(worker);
  wireProductionAgentCardHandlers(worker, bridge);
  wireNodeServiceInboundHandlers(worker);
  wireChainInboundHandler(worker);
  worker.service.bindCliTaskStore(worker.taskStore);

  await applySharedAi(worker);
  await worker.service.updateCapabilityManifest({
    capabilities: opts.capabilities,
  });
  await worker.service.updateNodeConfig({
    capabilityProviderEnabled: true,
    agentNetworkProfile: opts.profile,
  });

  await worker.human.saveHumanProfile({
    displayName: opts.displayName,
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
    return cards.some(
      (row) =>
        row.ownerId === worker.profile.owner.ownerId &&
        row.agentNetworkProfile?.throughputTokensPerSec === opts.profile.throughputTokensPerSec,
    );
  }, 15_000);

  const orchCard = await worker.service.requestAgentCard(orchestrator.profile.owner.ownerId);
  expect(orchCard.ok).toBe(true);

  const cached = (await orchestrator.service.listAgentCards()).find(
    (c) => c.ownerId === worker.profile.owner.ownerId,
  );
  expect(cached?.sourceAgentPeerId).toBeTruthy();
  return cached!.sourceAgentPeerId!;
}

describe.sequential("E2E plan+assign three-home (shared AI, differentiated agents)", () => {
  it("ranks by profile, plans a DAG with named assignees, completes to report", async () => {
    const orchestrator = await createPhase13TestNode();
    const workerCoder = await createPhase13TestNode();
    const workerResearch = await createPhase13TestNode();
    nodes.push(orchestrator, workerCoder, workerResearch);

    const orchBridge = await ensureBridgeIdentity(orchestrator);
    wireProductionAgentCardHandlers(orchestrator, orchBridge);
    wireNodeServiceInboundHandlers(orchestrator);
    wireChainInboundHandler(orchestrator);
    orchestrator.service.bindCliTaskStore(orchestrator.taskStore);

    await applySharedAi(orchestrator);
    await orchestrator.service.updateCapabilityManifest({
      capabilities: ["task.execute", "chain.orchestrate", "capability-provider"],
    });
    await orchestrator.service.updateNodeConfig({
      capabilityProviderEnabled: true,
      agentNetworkProfile: {
        modelFreshness: 6,
        spendPosture: "subscription",
        contextWindow: "512k",
        strengths: ["task.execute"],
        throughputTokensPerSec: 30,
      },
    });
    await orchestrator.human.saveHumanProfile({
      displayName: "Orchestrator",
      bio: "",
      hobbies: [],
      knowledge: [],
    });

    const coderPeerId = await setupDifferentiatedWorker(orchestrator, workerCoder, {
      displayName: "Coder Home",
      capabilities: ["task.execute", "coding", "capability-provider"],
      profile: {
        modelFreshness: 9,
        spendPosture: "subscription",
        contextWindow: "1M+",
        strengths: ["coding"],
        throughputTokensPerSec: 90,
      },
    });
    const researchPeerId = await setupDifferentiatedWorker(orchestrator, workerResearch, {
      displayName: "Research Home",
      capabilities: ["task.execute", "research.web", "capability-provider"],
      profile: {
        modelFreshness: 8,
        spendPosture: "metered",
        contextWindow: "512k",
        strengths: ["research.web"],
        throughputTokensPerSec: 45,
      },
    });
    await orchestrator.service.refreshCapabilityIndex();

    const toolCtx = await (orchestrator.service as {
      getToolExecutionContext?: () => Promise<{
        listAgentNetworkWorkers?: (p?: {
          requiredCapability?: string;
        }) => Promise<Array<{ peerId: string; score: number }>>;
      } | null>;
    }).getToolExecutionContext?.();
    expect(toolCtx?.listAgentNetworkWorkers).toBeTypeOf("function");
    const codingRanked = await toolCtx!.listAgentNetworkWorkers!({
      requiredCapability: "coding",
    });
    expect(codingRanked.length).toBeGreaterThanOrEqual(2);
    expect(codingRanked[0]!.peerId).toBe(coderPeerId);

    const researchRanked = await toolCtx!.listAgentNetworkWorkers!({
      requiredCapability: "research.web",
    });
    expect(researchRanked[0]!.peerId).toBe(researchPeerId);

    const started = await orchestrator.service.chainStartFromGoal({
      goal: "Research the topic then draft a coded summary and merge into one final answer",
      allowLlm: true,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;

    const chainId = started.chainId;
    expect(started.subtasks?.length).toBe(3);

    const researchStep = started.subtasks?.find((s) => s.requiredCapability === "research.web");
    const codingStep = started.subtasks?.find((s) => s.requiredCapability === "coding");
    const mergeStep = started.subtasks?.find((s) =>
      s.objective.toLowerCase().includes("combine") || s.objective.toLowerCase().includes("merge"),
    );
    expect(researchStep?.preferredWorkerPeerId).toBe(researchPeerId);
    expect(codingStep?.preferredWorkerPeerId).toBe(coderPeerId);
    expect(mergeStep).toBeTruthy();

    await waitForPhase13(async () => {
      const state = await orchestrator.service.chainGetState({ chainId });
      return state.published || (state.partialCount ?? 0) >= 1 || (state.awardedCount ?? 0) >= 1;
    }, 45_000);

    await waitForPhase13(async () => {
      const report = await orchestrator.service.chainGetReport({ chainId });
      return report.report != null;
    }, 90_000);

    const report = await orchestrator.service.chainGetReport({ chainId });
    expect(report.report?.chainId).toBe(chainId);
    expect(report.report?.executiveSummary?.length).toBeGreaterThan(0);
  }, 180_000);
});
