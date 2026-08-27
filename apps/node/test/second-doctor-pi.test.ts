/**
 * Second-doctor constraint — local Pi as the second runtime (design §8.3).
 *
 * The orchestrator-side verify loop escalates to a distinct runtime when the
 * rule verdict is `partial`/`disputed` on a critical chain. Production
 * (`buildChainOrchestratorDeps`) previously only registered `openclaw`, so an
 * OpenClaw worker had no second doctor. These tests drive the **real**
 * `buildChainOrchestratorDeps` wiring and prove:
 *
 * - `listRuntimes` exposes OpenClaw + the local Pi runtime (when ready).
 * - `buildAdapter("pi", …)` returns the real `PiAdapter` bridged to the local
 *   Pi runtime (`askPi`), with the same prompt surface the worker used.
 * - An OpenClaw worker on a `criticality: "high"` chain escalates to the
 *   **real** Pi second-doctor and writes a `cross` verdict.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import type {
  ChainMandate,
  ChainSubtask,
  EnvoyEnvelope,
  SignedAgentResult,
  TaskChainPartialPayload,
  Verdict,
  VerdictEntry,
} from "@envoymesh/protocol";
import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import type { AgentAdapter, ExecuteInput } from "@envoymesh/agent-adapter";
import type { NodeProfile } from "@envoymesh/api";

import {
  buildChainOrchestratorDeps,
  type ChainOrchestrationContext,
} from "../src/node-service-chain-orchestration.js";
import type { BridgeIdentity } from "../src/bridge/pipe.js";
import { mapChainSubtaskToExecuteInput } from "../src/chain-map.js";
import {
  createChainState,
  handleOrchestratorPartial,
  type ChainOrchestratorHandlerDeps,
  type ChainState,
} from "../src/chain-orchestrator.js";
import {
  getVerdictsFor,
  recordVerdictEntry,
  type ArbitrationStore,
} from "../src/chain-arbitration.js";
import type { ChainVerifyLoopDeps } from "../src/chain-verify-loop.js";
import type { ChainAuditSink } from "../src/chain-inbound-types.js";
import { WorkerLeaseStore } from "../src/worker-lease-store.js";
import { WorkerReliabilityStore } from "../src/worker-reliability-store.js";

const NOW = new Date("2026-08-18T00:00:00.000Z");
const NOW_ISO = NOW.toISOString();

let keyPair: { privateKey: string; publicKey: string };

beforeEach(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  keyPair = {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
});

function subtask(): ChainSubtask {
  return {
    version: "0.1",
    subtaskId: "subtask_a",
    chainId: "chain_e2e-1",
    chainMandateId: "chainmandate_e2e-1",
    depth: 1,
    requiredSkill: "research",
    objective: "Summarize the key risks of the mesh rollout.",
    requestedResult: "A short risk summary",
    constraints: ["Be concise."],
    dependsOn: [],
    createdAt: NOW_ISO,
  };
}

/** Stub for the worker runtime only — its rule verifier answers `verdicts`. */
function stubWorkerAdapter(runtime: "openclaw", verdicts: Verdict[]): AgentAdapter {
  return {
    runtime,
    describeSkills: () => [],
    buildManifest: async () => {
      throw new Error("not used in verify loop");
    },
    execute: async () => {
      throw new Error("worker adapter execute must not run in the verify loop");
    },
    verify: async () => verdicts,
  };
}

interface FakeContext {
  ctx: ChainOrchestrationContext;
  piPrompts: string[];
  openClawPrompts: string[];
}

/** Fake host whose Pi runtime records prompts and answers with a tool trace. */
function makeContext(opts: { openClawReady?: boolean; piReady?: boolean }): FakeContext {
  const piPrompts: string[] = [];
  const openClawPrompts: string[] = [];
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  const profile = { owner, device, deviceCertificate: undefined as never } as unknown as NodeProfile;
  const identity = {
    agentPeerId: "envoy_agent_orch",
    agentPublicKeyPem: keyPair.publicKey,
    agentPrivateKeyPem: keyPair.privateKey,
    ownerId: owner.ownerId,
    agentCredential: undefined as never,
  } as unknown as BridgeIdentity;

  const ctx = {
    getChainStore: () => undefined as never,
    getChainSideState: () => ({
      remoteManifests: new Map(),
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
    getProfile: () => profile,
    getApprovalQueue: () => null,
    getAgentNetworkMembershipIndex: () => undefined as never,
    getAgentNetworkMembershipIndexReady: () => null,
    getPeerDirectoryStore: () => undefined as never,
    getReachableMesh: () => undefined,
    ensureAgentIdentity: async () => identity,
    listAgentCards: async () => [],
    getLocalAgentNetworkWorkerCard: async () => undefined,
    getLocalManifestCapabilities: async () => [],
    getToolExecutionContext: async () => null,
    getBonds: async () => [],
    getNodeConfig: async () => ({}),
    updateNodeConfig: async () => undefined,
    emit: () => undefined,
    isOpenClawReady: () => opts.openClawReady !== false,
    askOpenClaw: async (prompt: string) => {
      openClawPrompts.push(prompt);
      return "OpenClaw summary.";
    },
    getAgentNetworkWorkerEngine: () => "openclaw" as const,
    isExtAgentBridgeReady: () => false,
    isEnvoyHarnessReady: () => false,
    askExtAgent: async () => "",
    probeExtAgent: async () => ({ reachable: false }),
    getVaultDir: () => undefined,
    isPiReady: () => opts.piReady === true,
    askPi: async (prompt: string) => {
      piPrompts.push(prompt);
      return {
        text: "Pi conclusion: the rollout risk is moderate.",
        toolCallCount: 2,
        cancelled: false,
        toolTrace: [
          { tool: "read", args: { path: "docs/implementation-plan.md" } },
          { tool: "grep", args: { pattern: "TODO" } },
        ],
      };
    },
  } as unknown as ChainOrchestrationContext;
  return { ctx, piPrompts, openClawPrompts };
}

describe("second-doctor constraint — production chainVerify wiring", () => {
  it("exposes openclaw + pi when both runtimes are ready", async () => {
    const { ctx } = makeContext({ openClawReady: true, piReady: true });
    const orchDeps = await buildChainOrchestratorDeps(ctx);
    const verify = orchDeps.chainVerify!;

    expect(verify.listRuntimes!()).toEqual(["openclaw", "pi"]);
    expect(verify.buildAdapter!("openclaw", subtask())?.runtime).toBe("openclaw");
    expect(verify.buildAdapter!("pi", subtask())?.runtime).toBe("pi");
  });

  it("excludes pi when the local Pi runtime is not ready", async () => {
    const { ctx } = makeContext({ openClawReady: true, piReady: false });
    const orchDeps = await buildChainOrchestratorDeps(ctx);
    const verify = orchDeps.chainVerify!;

    expect(verify.listRuntimes!()).toEqual(["openclaw"]);
    expect(verify.buildAdapter!("pi", subtask())).toBeUndefined();
    expect(verify.buildAdapter!("openclaw", subtask())?.runtime).toBe("openclaw");
  });

  it("excludes openclaw when OpenClaw is not ready (pi alone remains)", async () => {
    const { ctx } = makeContext({ openClawReady: false, piReady: true });
    const orchDeps = await buildChainOrchestratorDeps(ctx);
    const verify = orchDeps.chainVerify!;

    expect(verify.listRuntimes!()).toEqual(["pi"]);
    expect(verify.buildAdapter!("openclaw", subtask())).toBeUndefined();
    expect(verify.buildAdapter!("pi", subtask())?.runtime).toBe("pi");
  });

  it("routes the Pi second-doctor run through the local Pi runtime with the worker's prompt surface", async () => {
    const { ctx, piPrompts } = makeContext({ openClawReady: true, piReady: true });
    const orchDeps = await buildChainOrchestratorDeps(ctx);
    const adapter = orchDeps.chainVerify!.buildAdapter!("pi", subtask());

    const { input } = mapChainSubtaskToExecuteInput({ subtask: subtask() });
    const result = await adapter.execute(input);
    const verdicts = await adapter.verify({ result, objective: subtask().objective });

    // The real PiAdapter bridged to `askPi` — one local Pi prompt, carrying the
    // same mandate surface the OpenClaw worker used.
    expect(piPrompts).toHaveLength(1);
    expect(piPrompts[0]).toContain(subtask().objective);
    expect(piPrompts[0]).toContain("Be concise.");
    // The tool trace from `PiPromptResult.toolTrace` rides in the structured
    // block so the behavioral verifier audits it.
    expect(JSON.stringify(result.content)).toContain("envoymesh://pi/run/v1");
    expect(verdicts.map((v) => v.kind)).toEqual(["pass"]);
  });
});

describe("second-doctor constraint — OpenClaw worker escalates to the real Pi", () => {
  function finalPartial(): TaskChainPartialPayload {
    return {
      partial: {
        version: "0.1",
        subtaskId: "subtask_a",
        chainId: "chain_e2e-1",
        workerPeerId: "envoy_agent_worker",
        seq: 1,
        isFinal: true,
        note: "Here is the risk summary the worker produced.",
        confidence: 0.9,
        createdAt: NOW_ISO,
      },
    };
  }

  function envelope(payload: TaskChainPartialPayload): EnvoyEnvelope {
    return {
      version: "0.1",
      messageId: "m1",
      correlationId: "chain_e2e-1",
      createdAt: NOW_ISO,
      senderPeerId: "envoy_agent_worker",
      senderPublicKey: "pub",
      senderRole: "agent",
      recipientPeerId: "envoy_agent_orch",
      recipientRole: "agent",
      intent: "task.chain.partial",
      payload,
      signature: "sig",
    } as unknown as EnvoyEnvelope;
  }

  function makeState(criticality: "normal" | "high"): ChainState {
    const mandate: ChainMandate = {
      version: "0.1",
      chainMandateId: "chainmandate_e2e-1",
      chainId: "chain_e2e-1",
      issuerOwnerId: "envoy:owner:orch",
      orchestratorOwnerId: "envoy:owner:orch",
      maxChainCostUsd: 50,
      costCeilingUsd: 5,
      maxWorkers: 3,
      allowDepth3: false,
      maxSensitivity: "public",
      deadlineAt: "2026-08-18T01:00:00.000Z",
      createdAt: NOW_ISO,
      criticality,
      signature: "stub",
    };
    const state = createChainState(mandate);
    state.subtasks.set(subtask().subtaskId, subtask());
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_e2e-1",
      workerPeerId: "envoy_agent_worker",
      negotiationRound: 1,
      acceptedCostUsd: 2,
      deadlineAt: NOW_ISO,
      createdAt: NOW_ISO,
    });
    return state;
  }

  it("writes a cross verdict from the local Pi when the OpenClaw rule verdict is disputed", async () => {
    const { ctx, piPrompts } = makeContext({ openClawReady: true, piReady: true });
    const orchDeps = await buildChainOrchestratorDeps(ctx);
    const productionVerify = orchDeps.chainVerify!;

    const arbitrationStore: ArbitrationStore = new Map();
    const auditEvents: unknown[] = [];
    const audit: ChainAuditSink = {
      record: (event) => {
        auditEvents.push(event);
      },
    };

    // Production wiring throughout — only the worker-runtime rule verifier is
    // stubbed so it reports `disputed`; the second doctor is the real Pi
    // adapter the production `buildAdapter` constructs.
    const chainVerify: ChainVerifyLoopDeps = {
      ...productionVerify,
      audit,
      writeVerdictEntry: (chainId, entry: VerdictEntry) => {
        void chainId;
        const next = recordVerdictEntry(arbitrationStore, entry);
        arbitrationStore.clear();
        for (const [k, v] of next) arbitrationStore.set(k, v);
      },
      buildAdapter: (runtime, sub) =>
        runtime === "openclaw"
          ? stubWorkerAdapter("openclaw", [
              { kind: "disputed", needsHuman: true, signals: ["rule uncertain"] },
            ])
          : productionVerify.buildAdapter?.(runtime, sub),
    };

    const handler: ChainOrchestratorHandlerDeps = {
      sendEnvelope: async () => true,
      findWorkers: async () => [],
      now: () => NOW,
      signingKeyPem: keyPair.privateKey,
      publicKeyPem: keyPair.publicKey,
      orchestratorPeerId: "envoy_agent_orch",
      orchestratorOwnerId: "envoy:owner:orch",
      audit,
      storeChainReport: async () => undefined,
      chainVerify,
    };
    const state = makeState("high");

    const payload = finalPartial();
    await handleOrchestratorPartial(handler, envelope(payload), payload, state);

    // The second doctor is the real Pi runtime — it actually ran.
    expect(piPrompts).toHaveLength(1);
    expect(piPrompts[0]).toContain(subtask().objective);
    const verdicts = getVerdictsFor(arbitrationStore);
    expect(verdicts.map((v) => v.source)).toEqual(["cross"]);
    expect(state.ledger.snapshot().verificationCommittedUsd).toBe(2);
    const auditTypes = auditEvents.map((e) => (e as { type: string }).type);
    expect(auditTypes).toContain("chain.verify_rule");
    expect(auditTypes).toContain("chain.verify_cross");
  });

  it("does not reach Pi on a non-critical chain", async () => {
    const { ctx, piPrompts } = makeContext({ openClawReady: true, piReady: true });
    const orchDeps = await buildChainOrchestratorDeps(ctx);
    const productionVerify = orchDeps.chainVerify!;

    const arbitrationStore: ArbitrationStore = new Map();
    const auditEvents: unknown[] = [];
    const chainVerify: ChainVerifyLoopDeps = {
      ...productionVerify,
      audit: { record: (event) => void auditEvents.push(event) },
      writeVerdictEntry: (chainId, entry: VerdictEntry) => {
        void chainId;
        const next = recordVerdictEntry(arbitrationStore, entry);
        arbitrationStore.clear();
        for (const [k, v] of next) arbitrationStore.set(k, v);
      },
      buildAdapter: (runtime, sub) =>
        runtime === "openclaw"
          ? stubWorkerAdapter("openclaw", [
              { kind: "partial", score: 0.6, reason: "missing coverage" },
            ])
          : productionVerify.buildAdapter?.(runtime, sub),
    };
    const handler: ChainOrchestratorHandlerDeps = {
      sendEnvelope: async () => true,
      findWorkers: async () => [],
      now: () => NOW,
      signingKeyPem: keyPair.privateKey,
      publicKeyPem: keyPair.publicKey,
      orchestratorPeerId: "envoy_agent_orch",
      orchestratorOwnerId: "envoy:owner:orch",
      audit: { record: (event) => void auditEvents.push(event) },
      storeChainReport: async () => undefined,
      chainVerify,
    };
    const state = makeState("normal");

    const payload = finalPartial();
    await handleOrchestratorPartial(handler, envelope(payload), payload, state);

    expect(piPrompts).toHaveLength(0);
    expect(getVerdictsFor(arbitrationStore).map((v) => v.source)).toEqual(["rule"]);
    expect(state.ledger.snapshot().verificationCommittedUsd).toBe(0);
  });
});
