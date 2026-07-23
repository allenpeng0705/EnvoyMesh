/**
 * Agent Network membership gate for worker discovery.
 */
import { describe, expect, it } from "vitest";
import { AGENT_NETWORK_WORKER_CAPABILITY } from "@envoymesh/api";
import { CapabilityIndex } from "../src/capability-index.js";
import {
  findCapabilityProviders,
  findCapabilityProvidersRanked,
  sameLanFromListenAddrs,
  refreshCapabilityIndex,
  type ChainOrchestrationContext,
} from "../src/node-service-chain-orchestration.js";

function makeDeps(
  cards: Array<{
    ownerId: string;
    displayName: string;
    capabilities: string[];
    cachedAt: string;
    sourceAgentPeerId?: string;
    agentNetworkProfile?: {
      modelFreshness: number;
      spendPosture: "subscription" | "metered" | "unknown";
      contextWindow: "128k" | "256k" | "512k" | "1M+";
      strengths: string[];
    };
  }>,
  options?: {
    listenAddrsByOwnerId?: Record<string, string[]>;
    selfAgentPeerId?: string;
  },
): ChainOrchestrationContext {
  const index = new CapabilityIndex();
  const listenAddrsByOwnerId = options?.listenAddrsByOwnerId ?? {};
  return {
    getCapabilityIndex: () => index,
    getCapabilityIndexReady: () => null,
    listAgentCards: async () => cards,
    ensureAgentIdentity: async () =>
      options?.selfAgentPeerId
        ? { agentPeerId: options.selfAgentPeerId }
        : null,
    getPeerDirectoryStore: () => ({
      getPeerByOwnerId: async (ownerId: string) => {
        const listenAddrs = listenAddrsByOwnerId[ownerId];
        if (!listenAddrs) return undefined;
        return { ownerId, listenAddrs };
      },
    }),
  } as unknown as ChainOrchestrationContext;
}

describe("Agent Network worker discovery gate", () => {
  it("refreshCapabilityIndex skips private agents (no capability-provider)", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:private",
        displayName: "Private",
        capabilities: ["task.execute", "research.web"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_private",
      },
      {
        ownerId: "envoy:owner:worker",
        displayName: "Worker",
        capabilities: ["task.execute", AGENT_NETWORK_WORKER_CAPABILITY],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_worker",
      },
    ]);
    await refreshCapabilityIndex(deps);
    const index = deps.getCapabilityIndex();
    expect(index.workerCount).toBe(1);
    expect(index.findWorkers("task.execute")).toEqual(["envoy_agent_worker"]);
  });

  it("findCapabilityProviders ignores task.execute without Agent Network opt-in", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:solo",
        displayName: "Solo",
        capabilities: ["task.execute"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_solo",
      },
    ]);
    const peers = await findCapabilityProviders(deps, "task.execute");
    expect(peers).toEqual([]);
  });

  it("findCapabilityProviders returns opted-in workers", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:worker",
        displayName: "Worker",
        capabilities: ["task.execute", "capability-provider"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_worker",
      },
    ]);
    const peers = await findCapabilityProviders(deps, "task.execute");
    expect(peers).toEqual(["envoy_agent_worker"]);
  });

  it("findCapabilityProviders returns higher-scored peers first", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:weak",
        displayName: "Weak",
        capabilities: ["task.execute", "capability-provider"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_weak",
        agentNetworkProfile: {
          modelFreshness: 2,
          spendPosture: "metered",
          contextWindow: "128k",
          strengths: [],
        },
      },
      {
        ownerId: "envoy:owner:strong",
        displayName: "Strong",
        capabilities: ["task.execute", "capability-provider"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_strong",
        agentNetworkProfile: {
          modelFreshness: 9,
          spendPosture: "subscription",
          contextWindow: "1M+",
          strengths: ["task.execute"],
        },
      },
    ]);
    const peers = await findCapabilityProviders(deps, "task.execute");
    expect(peers[0]).toBe("envoy_agent_strong");
    expect(peers[1]).toBe("envoy_agent_weak");
  });

  it("findCapabilityProviders includes generalists even when a specialty tag has index hits", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:coder",
        displayName: "Coder",
        capabilities: ["task.execute", "coding", "capability-provider"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_coder",
      },
      {
        ownerId: "envoy:owner:general",
        displayName: "General",
        capabilities: ["task.execute", "capability-provider"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_general",
      },
    ]);
    await refreshCapabilityIndex(deps);
    const peers = await findCapabilityProviders(deps, "coding");
    expect(peers).toContain("envoy_agent_coder");
    expect(peers).toContain("envoy_agent_general");
    expect(peers[0]).toBe("envoy_agent_coder");
  });

  it("refreshCapabilityIndex removes a worker after opt-out", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:worker",
        displayName: "Worker",
        capabilities: ["task.execute", "capability-provider"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_worker",
      },
    ]);
    await refreshCapabilityIndex(deps);
    expect(deps.getCapabilityIndex().workerCount).toBe(1);

    (deps as { listAgentCards: () => Promise<unknown> }).listAgentCards = async () => [
      {
        ownerId: "envoy:owner:worker",
        displayName: "Worker",
        capabilities: ["task.execute"],
        cachedAt: "2026-07-22T01:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_worker",
      },
    ];
    await refreshCapabilityIndex(deps);
    expect(deps.getCapabilityIndex().workerCount).toBe(0);
  });

  it("sameLanFromListenAddrs detects RFC1918 direct TCP", () => {
    expect(
      sameLanFromListenAddrs([
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer",
        "/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWPeer",
      ]),
    ).toBe(true);
    expect(
      sameLanFromListenAddrs([
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer",
      ]),
    ).toBe(false);
    expect(sameLanFromListenAddrs(undefined)).toBe(false);
  });

  it("findCapabilityProvidersRanked prefers identical LAN twin over WAN", async () => {
    const identicalProfile = {
      modelFreshness: 5,
      spendPosture: "subscription" as const,
      contextWindow: "256k" as const,
      strengths: ["task.execute"],
    };
    const deps = makeDeps(
      [
        {
          ownerId: "envoy:owner:wan",
          displayName: "WanTwin",
          capabilities: ["task.execute", "capability-provider"],
          cachedAt: "2026-07-22T00:00:00.000Z",
          sourceAgentPeerId: "envoy_agent_wan",
          agentNetworkProfile: identicalProfile,
        },
        {
          ownerId: "envoy:owner:lan",
          displayName: "LanTwin",
          capabilities: ["task.execute", "capability-provider"],
          cachedAt: "2026-07-22T00:00:00.000Z",
          sourceAgentPeerId: "envoy_agent_lan",
          agentNetworkProfile: identicalProfile,
        },
      ],
      {
        listenAddrsByOwnerId: {
          "envoy:owner:lan": ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWLan"],
          "envoy:owner:wan": [
            "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWWan",
          ],
        },
      },
    );
    const ranked = await findCapabilityProvidersRanked(deps, "task.execute");
    expect(ranked.map((r) => r.peerId)).toEqual(["envoy_agent_lan", "envoy_agent_wan"]);
    expect(ranked[0]?.sameLan).toBe(true);
    expect(ranked[1]?.sameLan).toBe(false);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });
});
