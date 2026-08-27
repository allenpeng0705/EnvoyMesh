import { beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createTaskChainReadyRequestPayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import {
  handleChainReadyRequestInbound,
  localAgentNetworkEngineReady,
  shouldSkipWorkerForEngineProbe,
} from "../src/chain-ready-probe.js";
import {
  createChainState,
  directAwardSubtask,
  expandWorkerTryOrder,
  type ChainOrchestratorHandlerDeps,
} from "../src/chain-orchestrator.js";
import { selectReadyWorkersForSubtask } from "../src/node-service-chain-orchestration.js";
import { WorkerLeaseStore } from "../src/worker-lease-store.js";
import { WorkerReliabilityStore } from "../src/worker-reliability-store.js";
import { createAgentWorkerLeasePayload } from "@envoymesh/protocol";
import type { ChainRankedWorker } from "../src/node-service-chains.js";
import type { EnvoyEnvelope } from "@envoymesh/protocol";

let keyPair: { privateKey: string; publicKey: string };

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  keyPair = {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
});

const NOW = new Date("2026-06-18T00:00:00.000Z");

function mandate() {
  return {
    version: "0.1" as const,
    chainMandateId: "chainmandate_test-1",
    chainId: "chain_test-1",
    issuerOwnerId: "envoy:owner:orchestrator",
    orchestratorOwnerId: "envoy:owner:orchestrator",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public" as const,
    deadlineAt: "2026-06-18T01:00:00.000Z",
    createdAt: NOW.toISOString(),
    signature: "stub",
  };
}

describe("localAgentNetworkEngineReady", () => {
  it("reports openclaw_unavailable when OpenClaw engine is selected and down", async () => {
    expect(
      await localAgentNetworkEngineReady({
        engine: "openclaw",
        isOpenClawReady: () => false,
        isExtAgentBridgeReady: () => true,
      }),
    ).toEqual({ ready: false, engine: "openclaw", reason: "openclaw_unavailable" });
  });

  it("does not require Ext when OpenClaw engine is selected", async () => {
    expect(
      await localAgentNetworkEngineReady({
        engine: "openclaw",
        isOpenClawReady: () => true,
        isExtAgentBridgeReady: () => false,
        probeExtAgent: async () => ({ reachable: false }),
      }),
    ).toEqual({ ready: true, engine: "openclaw" });
  });

  it("reports ext_bridge_down when Ext engine is selected and bridge is down", async () => {
    expect(
      await localAgentNetworkEngineReady({
        engine: "ext",
        isOpenClawReady: () => true,
        isExtAgentBridgeReady: () => false,
      }),
    ).toEqual({ ready: false, engine: "ext", reason: "ext_bridge_down" });
  });

  it("hellos Ext Agent when Ext engine is selected", async () => {
    expect(
      await localAgentNetworkEngineReady({
        engine: "ext",
        isOpenClawReady: () => false,
        isExtAgentBridgeReady: () => true,
        probeExtAgent: async () => ({ reachable: false }),
      }),
    ).toEqual({ ready: false, engine: "ext", reason: "ext_agent_unreachable" });
    expect(
      await localAgentNetworkEngineReady({
        engine: "ext",
        isOpenClawReady: () => false,
        isExtAgentBridgeReady: () => true,
        probeExtAgent: async () => ({ reachable: true }),
      }),
    ).toEqual({ ready: true, engine: "ext" });
  });

  it("reports Envoy Harness readiness independently of OpenClaw and Ext", async () => {
    expect(
      await localAgentNetworkEngineReady({
        engine: "envoy-harness",
        isOpenClawReady: () => false,
        isExtAgentBridgeReady: () => false,
        isEnvoyHarnessReady: () => true,
      }),
    ).toEqual({ ready: true, engine: "envoy-harness" });
  });
});

describe("handleChainReadyRequestInbound", () => {
  it("replies ready=false when OpenClaw is not ready", async () => {
    const requestPayload = createTaskChainReadyRequestPayload({
      probeId: "readyprobe_test",
      requestedAt: NOW.toISOString(),
    });
    const unsigned = createUnsignedEnvelope({
      senderPeerId: "envoy_agent_orch",
      senderPublicKey: keyPair.publicKey,
      senderRole: "agent",
      recipientPeerId: "envoy_agent_worker",
      recipientRole: "agent",
      intent: "task.chain.ready.request",
      payload: requestPayload,
      correlationId: requestPayload.probeId,
    });
    const envelope = signUnsignedEnvelope(unsigned, keyPair.privateKey);
    let reply: EnvoyEnvelope | undefined;
    const result = await handleChainReadyRequestInbound({
      envelope,
      replyWithEnvelope: async (e) => {
        reply = e;
      },
      agentPeerId: "envoy_agent_worker",
      agentPublicKeyPem: keyPair.publicKey,
      agentPrivateKeyPem: keyPair.privateKey,
      engine: "openclaw",
      isOpenClawReady: () => false,
      isExtAgentBridgeReady: () => false,
    });
    expect(result).toEqual({ ok: true, responded: true });
    expect(reply?.intent).toBe("task.chain.ready.response");
    expect(reply?.payload).toMatchObject({
      probeId: "readyprobe_test",
      ready: false,
      engine: "openclaw",
      reason: "openclaw_unavailable",
    });
  });
});

describe("expandWorkerTryOrder", () => {
  it("puts demoted preferred last among the shortlist then appends others", () => {
    expect(
      expandWorkerTryOrder(["w1", "w2", "w3"], "w1", new Set(["w1"])),
    ).toEqual(["w2", "w1", "w3"]);
  });
});

describe("shouldSkipWorkerForEngineProbe", () => {
  it("hard-skips explicit engine-down, soft-allows probe_timeout", () => {
    expect(shouldSkipWorkerForEngineProbe({ ready: true })).toBe(false);
    expect(
      shouldSkipWorkerForEngineProbe({ ready: false, reason: "openclaw_unavailable" }),
    ).toBe(true);
    expect(
      shouldSkipWorkerForEngineProbe({ ready: false, reason: "probe_timeout" }),
    ).toBe(false);
  });
});

describe("selectReadyWorkersForSubtask", () => {
  it("skips not-ready preferred and selects the next ready worker", async () => {
    const ranked: ChainRankedWorker[] = [
      { peerId: "w1", score: 10, summary: "a", sameLan: false, online: true, viaRelay: false },
      { peerId: "w2", score: 8, summary: "b", sameLan: true, online: true, viaRelay: false },
      { peerId: "w3", score: 1, summary: "c", sameLan: false, online: false, viaRelay: false },
    ];
    // Minimal context — probe override avoids mesh/identity.
    const deps = {
      getChainSideState: () => ({
        readyProbeCache: new Map(),
        workerLeases: new WorkerLeaseStore(),
        workerReliability: new WorkerReliabilityStore(),
        teamStrategies: new Map(),
      recovery: new Map(),
      orchestratorEpoch: "orch_test",
      workerEpoch: "worker_test",
      attemptReceipts: { upsert() {}, buildReports() { return []; }, listForChain() { return []; }, get() { return undefined; }, prune() { return 0; }, size() { return 0; }, clear() {} },
      recoveredPartialKeys: new Set(),
      }),
      getTaskStore: () => undefined,
    } as never;
    const result = await selectReadyWorkersForSubtask(deps, ranked, "w1", 2, {
      probeWorkerEngineReady: async (peerId) =>
        peerId === "w1"
          ? { ready: false, reason: "openclaw_unavailable" }
          : { ready: true },
    });
    expect(result.skipped).toEqual(["w1"]);
    expect(result.chosen).toEqual(["w2", "w3"]);
  });

  it("soft-allows preferred workers on probe_timeout", async () => {
    const ranked: ChainRankedWorker[] = [
      { peerId: "w1", score: 10, summary: "a", sameLan: false, online: true, viaRelay: false },
      { peerId: "w2", score: 8, summary: "b", sameLan: true, online: true, viaRelay: false },
    ];
    const deps = {
      getChainSideState: () => ({
        readyProbeCache: new Map(),
        workerLeases: new WorkerLeaseStore(),
        workerReliability: new WorkerReliabilityStore(),
        teamStrategies: new Map(),
      recovery: new Map(),
      orchestratorEpoch: "orch_test",
      workerEpoch: "worker_test",
      attemptReceipts: { upsert() {}, buildReports() { return []; }, listForChain() { return []; }, get() { return undefined; }, prune() { return 0; }, size() { return 0; }, clear() {} },
      recoveredPartialKeys: new Set(),
      }),
      getTaskStore: () => undefined,
    } as never;
    const result = await selectReadyWorkersForSubtask(deps, ranked, "w1", 2, {
      probeWorkerEngineReady: async (peerId) =>
        peerId === "w1"
          ? { ready: false, reason: "probe_timeout" }
          : { ready: true },
    });
    expect(result.skipped).toEqual([]);
    expect(result.chosen).toEqual(["w1", "w2"]);
  });

  it("accepts lease-ready workers without calling the legacy ready probe", async () => {
    const store = new WorkerLeaseStore();
    const now = Date.parse("2030-01-01T00:00:00.000Z");
    store.accept(
      createAgentWorkerLeasePayload({
        leaseId: "lease_w2",
        workerPeerId: "w2",
        ownerId: "envoy:owner:w2",
        issuedAt: new Date(now).toISOString(),
        notBefore: new Date(now).toISOString(),
        expiresAt: new Date(now + 30_000).toISOString(),
        sequence: 1,
        runtimes: [
          {
            runtime: "envoy-harness",
            ready: true,
            capacity: { maxConcurrent: 1, availableSlots: 1, queueDepth: 0 },
            skillIds: ["research"],
          },
        ],
        connectivity: { direct: true, relay: false },
        nonce: "0123456789abcdef",
      }),
      { now: new Date(now + 1_000) },
    );
    const ranked: ChainRankedWorker[] = [
      { peerId: "w1", score: 10, summary: "a", sameLan: false, online: true, viaRelay: false },
      {
        peerId: "w2",
        score: 8,
        summary: "b",
        sameLan: true,
        online: true,
        viaRelay: false,
        availabilitySource: "lease",
      },
    ];
    const probed: string[] = [];
    const deps = {
      getChainSideState: () => ({
        readyProbeCache: new Map(),
        workerLeases: store,
        workerReliability: new WorkerReliabilityStore(),
        teamStrategies: new Map(),
      recovery: new Map(),
      orchestratorEpoch: "orch_test",
      workerEpoch: "worker_test",
      attemptReceipts: { upsert() {}, buildReports() { return []; }, listForChain() { return []; }, get() { return undefined; }, prune() { return 0; }, size() { return 0; }, clear() {} },
      recoveredPartialKeys: new Set(),
      }),
      getTaskStore: () => undefined,
    } as never;
    const result = await selectReadyWorkersForSubtask(deps, ranked, undefined, 2, {
      probeWorkerEngineReady: async (peerId) => {
        probed.push(peerId);
        return { ready: false, reason: "openclaw_unavailable" };
      },
    });
    expect(result.chosen).toContain("w2");
    expect(probed).not.toContain("w2");
  });
});

describe("directAwardSubtask ready probe", () => {
  it("skips workers whose engine hello fails and demotes them", async () => {
    const sent: string[] = [];
    const auditEvents: Array<Record<string, unknown>> = [];
    const deps: ChainOrchestratorHandlerDeps = {
      sendEnvelope: async (peerId) => {
        sent.push(peerId);
        return true;
      },
      findWorkers: async () => ["12D3KooW-w1", "12D3KooW-w2"],
      signingKeyPem: keyPair.privateKey,
      publicKeyPem: keyPair.publicKey,
      orchestratorPeerId: "12D3KooW-orch",
      orchestratorOwnerId: "owner_test",
      now: () => NOW,
      probeWorkerEngineReady: async (peerId) =>
        peerId === "12D3KooW-w1"
          ? { ready: false, reason: "openclaw_unavailable" }
          : { ready: true },
      audit: { record: (e) => auditEvents.push(e as Record<string, unknown>) },
      storeChainReport: async () => {},
    };
    const state = createChainState(mandate(), { awardMode: "direct" });
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "x",
      requestedResult: "r",
      constraints: [],
      dependsOn: [],
      preferredWorkerPeerId: "12D3KooW-w1",
      createdAt: NOW.toISOString(),
    });

    const fail = await directAwardSubtask(deps, state, "subtask_a", "12D3KooW-w1");
    expect(fail).toEqual({ ok: false, reason: "engine_not_ready" });
    expect(state.silentWorkerPeerIds.has("12D3KooW-w1")).toBe(true);
    expect(sent).toEqual([]);

    const ok = await directAwardSubtask(deps, state, "subtask_a", "12D3KooW-w2");
    expect(ok.ok).toBe(true);
    expect(sent).toContain("12D3KooW-w2");
    expect(
      auditEvents.some(
        (e) => typeof e.summary === "string" && e.summary.includes("ready_probe_fail"),
      ),
    ).toBe(true);
  });

  it("still awards on probe_timeout (soft failure)", async () => {
    const sent: string[] = [];
    const deps: ChainOrchestratorHandlerDeps = {
      sendEnvelope: async (peerId) => {
        sent.push(peerId);
        return true;
      },
      findWorkers: async () => ["12D3KooW-w1"],
      signingKeyPem: keyPair.privateKey,
      publicKeyPem: keyPair.publicKey,
      orchestratorPeerId: "12D3KooW-orch",
      orchestratorOwnerId: "owner_test",
      now: () => NOW,
      probeWorkerEngineReady: async () => ({ ready: false, reason: "probe_timeout" }),
      audit: { record: () => {} },
      storeChainReport: async () => {},
    };
    const state = createChainState(mandate(), { awardMode: "direct" });
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "x",
      requestedResult: "r",
      constraints: [],
      dependsOn: [],
      preferredWorkerPeerId: "12D3KooW-w1",
      createdAt: NOW.toISOString(),
    });
    const ok = await directAwardSubtask(deps, state, "subtask_a", "12D3KooW-w1");
    expect(ok.ok).toBe(true);
    expect(sent).toContain("12D3KooW-w1");
    expect(state.silentWorkerPeerIds.has("12D3KooW-w1")).toBe(false);
  });
});
