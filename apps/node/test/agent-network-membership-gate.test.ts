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
import { WorkerLeaseStore } from "../src/worker-lease-store.js";
import { WorkerReliabilityStore } from "../src/worker-reliability-store.js";

function makeDeps(
  cards: Array<{
    ownerId: string;
    displayName: string;
    membership: string[];
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
    /** ownerId → libp2p peer id currently connected on the mesh. */
    connectedLibp2pByOwnerId?: Record<string, string>;
    selfAgentPeerId?: string;
    localWorkerCard?: (typeof cards)[number] | null;
    openClawReady?: boolean;
    /** MAP — wire-received `adapter.manifest` broadcasts, keyed by agent peer id. */
    remoteManifests?: Map<string, import("@envoymesh/protocol").SignedCapabilityManifest>;
  },
): ChainOrchestrationContext {
  const index = new AgentNetworkMembershipIndex();
  const listenAddrsByOwnerId = options?.listenAddrsByOwnerId ?? {};
  const connectedLibp2pByOwnerId = options?.connectedLibp2pByOwnerId ?? {};
  const connectedPeerIds = [...new Set(Object.values(connectedLibp2pByOwnerId))];
  return {
    getAgentNetworkMembershipIndex: () => index,
    getAgentNetworkMembershipIndexReady: () => null,
    getReachableMesh: () =>
      connectedPeerIds.length > 0
        ? {
            getConnectedPeerIds: () => connectedPeerIds,
            getConnectionStats: () => ({
              connectedPeerIds,
              circuitPeerIds: [],
            }),
          }
        : undefined,
    listAgentCards: async () => cards,
    getLocalAgentNetworkWorkerCard: async () =>
      options?.localWorkerCard === null
        ? undefined
        : options?.localWorkerCard ?? undefined,
    isOpenClawReady: () => options?.openClawReady !== false,
    askOpenClaw: async () => "",
    ensureAgentIdentity: async () =>
      options?.selfAgentPeerId
        ? { agentPeerId: options.selfAgentPeerId }
        : null,
    getChainSideState: () => ({
      readyProbeCache: new Map(),
      pendingBidExpirations: new Map(),
      trackAbort: new Map(),
      observedChains: new Map(),
      remoteManifests: options?.remoteManifests ?? new Map(),
      workerLeases: new WorkerLeaseStore(),
      workerReliability: new WorkerReliabilityStore(),
      teamStrategies: new Map(),
      recovery: new Map(),
      orchestratorEpoch: "orch_test",
      workerEpoch: "worker_test",
      attemptReceipts: {
        upsert() {},
        buildReports() {
          return [];
        },
        listForChain() {
          return [];
        },
        get() {
          return undefined;
        },
        prune() {
          return 0;
        },
        size() {
          return 0;
        },
        clear() {},
      },
      recoveredPartialKeys: new Set(),
    }),
    getAgentNetworkWorkerEngine: () => "openclaw",
    isExtAgentBridgeReady: () => false,
    getPeerDirectoryStore: () => ({
      getPeerByOwnerId: async (ownerId: string) => {
        const listenAddrs = listenAddrsByOwnerId[ownerId];
        if (!listenAddrs && !connectedLibp2pByOwnerId[ownerId]) return undefined;
        return {
          ownerId,
          peerId: connectedLibp2pByOwnerId[ownerId] ?? `12D3KooW${ownerId.slice(-8)}`,
          listenAddrs: listenAddrs ?? [],
        };
      },
      listPeerRecords: async () =>
        Object.entries(connectedLibp2pByOwnerId).map(([ownerId, peerId]) => ({
          ownerId,
          peerId,
          listenAddrs: listenAddrsByOwnerId[ownerId] ?? [],
        })),
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
        cachedAt: new Date().toISOString(),
        sourceAgentPeerId: "envoy_agent_private",
      },
      {
        ownerId: "envoy:owner:worker",
        displayName: "Worker",
        membership: ["task.execute", AGENT_NETWORK_WORKER_MEMBERSHIP],
        cachedAt: new Date().toISOString(),
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
        cachedAt: new Date().toISOString(),
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
        cachedAt: new Date().toISOString(),
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
        cachedAt: new Date().toISOString(),
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
        cachedAt: new Date().toISOString(),
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
        cachedAt: new Date().toISOString(),
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
        cachedAt: new Date().toISOString(),
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
        cachedAt: new Date().toISOString(),
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
        cachedAt: new Date().toISOString(),
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
          cachedAt: new Date().toISOString(),
          sourceAgentPeerId: "envoy_agent_wan",
          agentNetworkProfile: identicalProfile,
        },
        {
          ownerId: "envoy:owner:lan",
          displayName: "LanTwin",
          membership: ["task.execute", "agent-network-worker"],
          cachedAt: new Date().toISOString(),
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

  it("includes Join'd local agent as online same-LAN worker (score-ordered, not forced first)", async () => {
    const deps = makeDeps(
      [
        {
          ownerId: "envoy:owner:remote",
          displayName: "Remote",
          membership: ["task.execute", "agent-network-worker"],
          cachedAt: new Date().toISOString(),
          sourceAgentPeerId: "envoy_agent_remote",
          agentNetworkProfile: {
            modelFreshness: 9,
            spendPosture: "subscription",
            contextWindow: "1M+",
            skills: ["research"],
          },
        },
      ],
      {
        selfAgentPeerId: "envoy_agent_self",
        connectedLibp2pByOwnerId: {
          "envoy:owner:remote": "12D3KooWRemotePeerxxxxxxx",
        },
        localWorkerCard: {
          ownerId: "envoy:owner:self",
          displayName: "Me",
          membership: ["task.execute", "agent-network-worker"],
          cachedAt: new Date().toISOString(),
          sourceAgentPeerId: "envoy_agent_self",
          agentNetworkProfile: {
            modelFreshness: 3,
            spendPosture: "metered",
            contextWindow: "128k",
            skills: [],
          },
        },
      },
    );
    await refreshAgentNetworkMembershipIndex(deps);
    expect(deps.getAgentNetworkMembershipIndex().findWorkers("task.execute")).toContain(
      "envoy_agent_self",
    );
    const ranked = await findAgentNetworkWorkersRanked(deps, "research");
    const self = ranked.find((r) => r.peerId === "envoy_agent_self");
    expect(self?.online).toBe(true);
    expect(self?.sameLan).toBe(true);
    expect(ranked.map((r) => r.peerId)).toContain("envoy_agent_remote");
    // Research specialist outranks weak local generalist when both online.
    expect(ranked[0]?.peerId).toBe("envoy_agent_remote");
    expect(ranked[0]!.score).toBeGreaterThan(self!.score);
  });

  it("attaches a capability manifest to ranked workers that advertise skills", async () => {
    const deps = makeDeps(
      [
        {
          ownerId: "envoy:owner:remote",
          displayName: "Remote",
          membership: ["task.execute", "agent-network-worker"],
          cachedAt: new Date().toISOString(),
          sourceAgentPeerId: "envoy_agent_remote",
          agentNetworkProfile: {
            modelFreshness: 9,
            spendPosture: "subscription",
            contextWindow: "1M+",
            skills: ["research"],
          },
        },
        {
          ownerId: "envoy:owner:plain",
          displayName: "Plain",
          membership: ["task.execute", "agent-network-worker"],
          cachedAt: new Date().toISOString(),
          sourceAgentPeerId: "envoy_agent_plain",
        },
      ],
      {
        selfAgentPeerId: "envoy_agent_self",
        connectedLibp2pByOwnerId: {
          "envoy:owner:remote": "12D3KooWRemotePeerxxxxxxx",
          "envoy:owner:plain": "12D3KooWPlainPeerxxxxxxxx",
        },
      },
    );
    const ranked = await findAgentNetworkWorkersRanked(deps, "research");
    const remote = ranked.find((r) => r.peerId === "envoy_agent_remote");
    const plain = ranked.find((r) => r.peerId === "envoy_agent_plain");
    // Manifest-carrying entry: skills mapped from the owner-attested profile.
    expect(remote?.manifest).toBeDefined();
    expect(remote!.manifest!.peerId).toBe("envoy_agent_remote");
    expect(remote!.manifest!.ownerId).toBe("envoy:owner:remote");
    expect(remote!.manifest!.skills.map((s) => s.skillId)).toEqual(["research"]);
    // Peers with no advertised skills get no manifest.
    expect(plain?.manifest).toBeUndefined();
  });

  it("omits local agent when Join is off (no local worker card)", async () => {
    const deps = makeDeps(
      [
        {
          ownerId: "envoy:owner:remote",
          displayName: "Remote",
          membership: ["task.execute", "agent-network-worker"],
          cachedAt: new Date().toISOString(),
          sourceAgentPeerId: "envoy_agent_remote",
        },
      ],
      {
        selfAgentPeerId: "envoy_agent_self",
        localWorkerCard: null,
      },
    );
    const peers = await findAgentNetworkWorkers(deps, "task.execute");
    expect(peers).toEqual(["envoy_agent_remote"]);
  });

  it("marks local agent offline for ranking when OpenClaw is down", async () => {
    const deps = makeDeps([], {
      selfAgentPeerId: "envoy_agent_self",
      openClawReady: false,
      localWorkerCard: {
        ownerId: "envoy:owner:self",
        displayName: "Me",
        membership: ["task.execute", "agent-network-worker"],
        cachedAt: new Date().toISOString(),
        sourceAgentPeerId: "envoy_agent_self",
      },
    });
    const ranked = await findAgentNetworkWorkersRanked(deps, "task.execute");
    expect(ranked[0]?.peerId).toBe("envoy_agent_self");
    expect(ranked[0]?.online).toBe(false);
  });

  it("prefers a fresh wire-broadcast manifest over card synthesis", async () => {
    const wireManifests = new Map<string, import("@envoymesh/protocol").SignedCapabilityManifest>();
    wireManifests.set("envoy_agent_remote", {
      version: "0.1",
      runtime: "pi",
      runtimeVersion: "0.1.0",
      peerId: "envoy_agent_remote",
      ownerId: "envoy:owner:remote",
      skills: [
        {
          skillId: "research",
          description: "Attested Pi research skill",
          costCeilingUsd: 1.5,
          maxSensitivity: "friends",
          tags: [],
        },
      ],
      reputationBySkill: { research: 0.75 },
      issuedAt: new Date(Date.now() - 30_000).toISOString(), // fresh within the 300s TTL
      ttlSeconds: 300,
      signature: "owner-signed",
    });
    const deps = makeDeps(
      [
        {
          ownerId: "envoy:owner:remote",
          displayName: "Remote",
          membership: ["task.execute", "agent-network-worker"],
          cachedAt: new Date().toISOString(),
          sourceAgentPeerId: "envoy_agent_remote",
          agentNetworkProfile: {
            modelFreshness: 1,
            spendPosture: "subscription",
            contextWindow: "1M+",
            skills: ["research"],
          },
        },
      ],
      {
        selfAgentPeerId: "envoy_agent_self",
        connectedLibp2pByOwnerId: {
          "envoy:owner:remote": "12D3KooWRemotePeerxxxxxxx",
        },
        remoteManifests: wireManifests,
      },
    );
    const ranked = await findAgentNetworkWorkersRanked(deps, "research");
    const remote = ranked.find((r) => r.peerId === "envoy_agent_remote");
    // The wire broadcast wins over the card-synthesized manifest: Pi runtime,
    // the attested reputation, and the described skill.
    expect(remote!.manifest!.runtime).toBe("pi");
    expect(remote!.manifest!.reputationBySkill.research).toBe(0.75);
    expect(remote!.manifest!.skills[0].description).toBe("Attested Pi research skill");
  });
});
