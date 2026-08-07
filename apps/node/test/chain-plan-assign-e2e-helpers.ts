/**
 * Shared helpers for Team jobs / plan+assign multi-home E2Es.
 */
import { expect } from "vitest";
import type { ModelProviderConfig } from "@envoymesh/api";
import { PLAN_ASSIGN_FROM_ROSTER_TOKEN } from "@envoymesh/models";
import {
  ensureBridgeIdentity,
  registerBondedPeer,
  waitForPhase13,
  wireChainInboundHandler,
  wireNodeServiceInboundHandlers,
  wireProductionAgentCardHandlers,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";

export const SHARED_PLAN_ASSIGN_AI: ModelProviderConfig = {
  mode: "mock",
  mockResponseText: PLAN_ASSIGN_FROM_ROSTER_TOKEN,
};

export async function applyPlanAssignAi(
  node: Phase13TestNode,
  modelProviders: ModelProviderConfig,
  extras?: {
    stallTimeoutMs?: number;
    iterationMaxRounds?: number;
    iterationJudgeMode?: "llm" | "always_stop" | "owner";
    extendMaxStepsPerRound?: number;
  },
): Promise<void> {
  await node.service.updateNodeConfig({
    modelProviders,
    chainDefaults: {
      awardMode: "direct",
      allowLlmDecompose: true,
      rebalancePolicy: "never",
      ...(extras?.stallTimeoutMs !== undefined ? { stallTimeoutMs: extras.stallTimeoutMs } : {}),
      ...(extras?.iterationMaxRounds !== undefined
        ? { iterationMaxRounds: extras.iterationMaxRounds }
        : {}),
      ...(extras?.iterationJudgeMode !== undefined
        ? { iterationJudgeMode: extras.iterationJudgeMode }
        : {}),
      ...(extras?.extendMaxStepsPerRound !== undefined
        ? { extendMaxStepsPerRound: extras.extendMaxStepsPerRound }
        : {}),
    },
  });
}

/** Mock roster AI — default for deterministic plan+assign E2Es. */
export async function applySharedPlanAssignAi(
  node: Phase13TestNode,
  extras?: {
    stallTimeoutMs?: number;
    iterationMaxRounds?: number;
    iterationJudgeMode?: "llm" | "always_stop" | "owner";
    extendMaxStepsPerRound?: number;
  },
): Promise<void> {
  await applyPlanAssignAi(node, SHARED_PLAN_ASSIGN_AI, extras);
}

export async function wireHomeAsChainParticipant(node: Phase13TestNode): Promise<void> {
  const bridge = await ensureBridgeIdentity(node);
  wireProductionAgentCardHandlers(node, bridge);
  wireNodeServiceInboundHandlers(node);
  wireChainInboundHandler(node);
  node.service.bindCliTaskStore(node.taskStore);
}

export async function bondAndExchangeCards(
  a: Phase13TestNode,
  b: Phase13TestNode,
  aName: string,
  bName: string,
): Promise<void> {
  await registerBondedPeer(a, b, bName);
  await registerBondedPeer(b, a, aName);
  await a.mesh.probePeer(b.mesh.multiaddrs[0]!);
  await b.mesh.probePeer(a.mesh.multiaddrs[0]!);
  expect((await a.service.requestAgentCard(b.profile.owner.ownerId)).ok).toBe(true);
  expect((await b.service.requestAgentCard(a.profile.owner.ownerId)).ok).toBe(true);
  await waitForPhase13(async () => {
    const cards = await a.service.listAgentCards();
    return cards.some((c) => c.ownerId === b.profile.owner.ownerId);
  }, 15_000);
  await waitForPhase13(async () => {
    const cards = await b.service.listAgentCards();
    return cards.some((c) => c.ownerId === a.profile.owner.ownerId);
  }, 15_000);
}

export async function enableAgentNetworkWorker(
  node: Phase13TestNode,
  opts: {
    displayName: string;
    capabilities: string[];
    profile?: {
      modelFreshness: number;
      spendPosture: "subscription" | "metered" | "payg";
      contextWindow: "128k" | "512k" | "1M+";
      skills: string[];
      throughputTokensPerSec: number;
    };
    /** Defaults to roster mock AI. Pass live providers for Assigner homes. */
    modelProviders?: ModelProviderConfig;
  },
): Promise<string> {
  await applyPlanAssignAi(node, opts.modelProviders ?? SHARED_PLAN_ASSIGN_AI);
  await node.service.updateCapabilityManifest({ capabilities: opts.capabilities });
  await node.service.updateNodeConfig({
    capabilityProviderEnabled: true,
    ...(opts.profile ? { agentNetworkProfile: opts.profile } : {}),
  });
  await node.human.saveHumanProfile({
    displayName: opts.displayName,
    bio: "",
    hobbies: [],
    knowledge: [],
  });
  const agent = await ensureBridgeIdentity(node);
  return agent.agentPeerId;
}

/** Access private chain runtime for stall / reassign E2Es. */
export function getChainRuntime(
  service: Phase13TestNode["service"],
  chainId: string,
): {
  state: {
    awards: Map<string, { workerPeerId: string }>;
    awardedAt: Map<string, string>;
    lastHeartbeatAt: Map<string, number>;
    workersBySubtask: Map<string, string[]>;
    reassignCount: Map<string, number>;
    partials: Map<string, unknown>;
    published?: boolean;
    bids: Map<string, unknown>;
    chainMandate: { stallTimeoutMs?: number };
    subtasks: Map<string, { preferredWorkerPeerId?: string }>;
  };
} | undefined {
  const store = (service as unknown as { _chainStore: { getRuntime: (id: string) => unknown } })
    ._chainStore;
  return store.getRuntime(chainId) as ReturnType<typeof getChainRuntime>;
}
