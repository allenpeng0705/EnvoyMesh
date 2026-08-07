/**
 * Agent Network membership gate for worker discovery.
 */
import { describe, expect, it } from "vitest";
import { AGENT_NETWORK_WORKER_MEMBERSHIP } from "@envoymesh/api";
import { AgentNetworkMembershipIndex } from "../src/capability-index.js";
import {
  findAgentNetworkWorkers,
  findAgentNetworkWorkersRanked,
  sameLanFromListenAddrs,
  refreshAgentNetworkMembershipIndex,
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
      skills: string[];
    };
  }>,
  options?: {
    listenAddrsByOwnerId?: Record<string, string[]>;
    selfAgentPeerId?: string;
  },
): ChainOrchestrationContext {
  const index = new AgentNetworkMembershipIndex();
  const listenAddrsByOwnerId = options?.listenAddrsByOwnerId ?? {};
  return {
    getAgentNetworkMembershipIndex: () => index,
    getAgentNetworkMembershipIndexReady: () => null,
    getReachableMesh: () => undefined,
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
      listPeerRecords: async () => [],
    }),
  } as unknown as ChainOrchestrationContext;
}

describe("Agent Network worker discovery gate", () => {
  it("refreshAgentNetworkMembershipIndex skips private agents (no agent-network-worker)", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:private",
        displayName: "Private",
        membership: ["task.execute", "research.web"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_private",
      },
      {
        ownerId: "envoy:owner:worker",
        displayName: "Worker",
        membership: ["task.execute", AGENT_NETWORK_WORKER_MEMBERSHIP],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_worker",
      },
    ]);
    await refreshAgentNetworkMembershipIndex(deps);
    const index = deps.getAgentNetworkMembershipIndex();
    expect(index.workerCount).toBe(1);
    expect(index.findWorkers("task.execute")).toEqual(["envoy_agent_worker"]);
  });

  it("findAgentNetworkWorkers ignores task.execute without Agent Network opt-in", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:solo",
        displayName: "Solo",
        membership: ["task.execute"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_solo",
      },
    ]);
    const peers = await findAgentNetworkWorkers(deps, "task.execute");
    expect(peers).toEqual([]);
  });

  it("findAgentNetworkWorkers returns opted-in workers", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:worker",
        displayName: "Worker",
        membership: ["task.execute", "agent-network-worker"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_worker",
      },
    ]);
    const peers = await findAgentNetworkWorkers(deps, "task.execute");
    expect(peers).toEqual(["envoy_agent_worker"]);
  });

  it("findAgentNetworkWorkers returns higher-scored peers first", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:weak",
        displayName: "Weak",
        membership: ["task.execute", "agent-network-worker"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_weak",
        agentNetworkProfile: {
          modelFreshness: 2,
          spendPosture: "metered",
          contextWindow: "128k",
          skills: [],
        },
      },
      {
        ownerId: "envoy:owner:strong",
        displayName: "Strong",
        membership: ["task.execute", "agent-network-worker"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_strong",
        agentNetworkProfile: {
          modelFreshness: 9,
          spendPosture: "subscription",
          contextWindow: "1M+",
          skills: ["research"],
        },
      },
    ]);
    const peers = await findAgentNetworkWorkers(deps, "task.execute");
    expect(peers[0]).toBe("envoy_agent_strong");
    expect(peers[1]).toBe("envoy_agent_weak");
  });

  it("findAgentNetworkWorkers ranks specialists by skills, not mesh capability tags", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:coder",
        displayName: "Coder",
        membership: ["task.execute", "agent-network-worker"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_coder",
        agentNetworkProfile: {
          modelFreshness: 7,
          spendPosture: "subscription",
          contextWindow: "256k",
          skills: ["coding"],
        },
      },
      {
        ownerId: "envoy:owner:general",
        displayName: "General",
        // Specialty tag on mesh caps must NOT create a specialist ranking.
        membership: ["task.execute", "coding", "agent-network-worker"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_general",
        agentNetworkProfile: {
          modelFreshness: 7,
          spendPosture: "subscription",
          contextWindow: "256k",
          skills: [],
        },
      },
    ]);
    await refreshAgentNetworkMembershipIndex(deps);
    const peers = await findAgentNetworkWorkers(deps, "coding");
    expect(peers).toContain("envoy_agent_coder");
    expect(peers).toContain("envoy_agent_general");
    expect(peers[0]).toBe("envoy_agent_coder");
  });

  it("refreshAgentNetworkMembershipIndex removes a worker after opt-out", async () => {
    const deps = makeDeps([
      {
        ownerId: "envoy:owner:worker",
        displayName: "Worker",
        membership: ["task.execute", "agent-network-worker"],
        cachedAt: "2026-07-22T00:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_worker",
      },
    ]);
    await refreshAgentNetworkMembershipIndex(deps);
    expect(deps.getAgentNetworkMembershipIndex().workerCount).toBe(1);

    (deps as { listAgentCards: () => Promise<unknown> }).listAgentCards = async () => [
      {
        ownerId: "envoy:owner:worker",
        displayName: "Worker",
        membership: ["task.execute"],
        cachedAt: "2026-07-22T01:00:00.000Z",
        sourceAgentPeerId: "envoy_agent_worker",
      },
    ];
    await refreshAgentNetworkMembershipIndex(deps);
    expect(deps.getAgentNetworkMembershipIndex().workerCount).toBe(0);
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

  it("findAgentNetworkWorkersRanked prefers identical LAN twin over WAN", async () => {
    const identicalProfile = {
      modelFreshness: 5,
      spendPosture: "subscription" as const,
      contextWindow: "256k" as const,
      skills: ["task.execute"],
    };
    const deps = makeDeps(
      [
        {
          ownerId: "envoy:owner:wan",
          displayName: "WanTwin",
          membership: ["task.execute", "agent-network-worker"],
          cachedAt: "2026-07-22T00:00:00.000Z",
          sourceAgentPeerId: "envoy_agent_wan",
          agentNetworkProfile: identicalProfile,
        },
        {
          ownerId: "envoy:owner:lan",
          displayName: "LanTwin",
          membership: ["task.execute", "agent-network-worker"],
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
    const ranked = await findAgentNetworkWorkersRanked(deps, "task.execute");
    expect(ranked.map((r) => r.peerId)).toEqual(["envoy_agent_lan", "envoy_agent_wan"]);
    expect(ranked[0]?.sameLan).toBe(true);
    expect(ranked[1]?.sameLan).toBe(false);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });
});
