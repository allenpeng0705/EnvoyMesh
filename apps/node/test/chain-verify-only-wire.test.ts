/**
 * Phase 61B — verify-only strategy blocks dependents until verifier passes.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import type {
  AgentRuntime,
  ChainMandate,
  ChainSubtask,
  EnvoyEnvelope,
  SignedAgentResult,
  TaskChainPartialPayload,
  Verdict,
} from "@envoymesh/protocol";
import type { AgentAdapter } from "@envoymesh/agent-adapter";

import {
  advanceReadySubtasks,
  createChainState,
  handleOrchestratorPartial,
  subtaskDependenciesSatisfied,
  type ChainOrchestratorHandlerDeps,
} from "../src/chain-orchestrator.js";
import {
  getLatestVerdictForSubtask,
  recordVerdictEntry,
  type ArbitrationStore,
} from "../src/chain-arbitration.js";
import type { ChainVerifyLoopDeps } from "../src/chain-verify-loop.js";
import { requiresVerifyOnlyForSubtask } from "../src/chain-speculation-wire.js";

const NOW = new Date("2030-06-01T00:00:00.000Z");
const NOW_ISO = NOW.toISOString();

let keyPair: { privateKey: string; publicKey: string };

beforeEach(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  keyPair = {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
});

function mandate(overrides: Partial<ChainMandate> = {}): ChainMandate {
  return {
    version: "0.1",
    chainMandateId: "chainmandate_verify_only",
    chainId: "chain_verify_only",
    issuerOwnerId: "envoy:owner:orch",
    orchestratorOwnerId: "envoy:owner:orch",
    maxChainCostUsd: 50,
    costCeilingUsd: 5,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: "2030-06-02T00:00:00.000Z",
    createdAt: NOW_ISO,
    signature: "stub",
    criticality: "high",
    teamStrategyId: "balanced",
    // Phase 63 — owner opt-in gate. Default is off; tests that exercise
    // speculation paths (verify_only, dual-award, hedged) must explicitly
    // enable it. `mandate()` is the base for all 3 tests in this file
    // so we enable here once.
    speculationEnabled: true,
    ...overrides,
  };
}

function subtask(id: string, dependsOn: string[] = []): ChainSubtask {
  return {
    version: "0.1",
    subtaskId: id,
    chainId: "chain_verify_only",
    chainMandateId: "chainmandate_verify_only",
    depth: dependsOn.length === 0 ? 1 : 2,
    requiredSkill: "research",
    objective: `Step ${id}`,
    requestedResult: "text",
    constraints: [],
    dependsOn,
    createdAt: NOW_ISO,
  };
}

function finalPartial(subtaskId: string, note = "done"): TaskChainPartialPayload {
  return {
    partial: {
      version: "0.1",
      subtaskId,
      chainId: "chain_verify_only",
      workerPeerId: "worker_a",
      seq: 1,
      isFinal: true,
      note,
      confidence: 0.9,
      createdAt: NOW_ISO,
    },
  };
}

function envelope(payload: TaskChainPartialPayload): EnvoyEnvelope {
  return {
    version: "0.1",
    messageId: "m1",
    correlationId: "chain_verify_only",
    createdAt: NOW_ISO,
    senderPeerId: "worker_a",
    senderPublicKey: "pub",
    senderRole: "agent",
    recipientPeerId: "orch_1",
    recipientRole: "agent",
    intent: "task.chain.partial",
    payload,
    signature: "sig",
  };
}

function makeVerifyAdapter(verdict: Verdict): AgentAdapter {
  return {
    runtime: "openclaw" as AgentRuntime,
    execute: async () => {
      throw new Error("execute not used in verify-only test");
    },
    verify: async () => [verdict],
  };
}

function makeDeps(
  store: ArbitrationStore,
  verdict: Verdict,
): ChainOrchestratorHandlerDeps {
  const chainVerify: ChainVerifyLoopDeps = {
    audit: { record: () => undefined },
    orchestratorPeerId: "orch_1",
    signingKeyPem: keyPair.privateKey,
    writeVerdictEntry: (_chainId, entry) => {
      recordVerdictEntry(store, entry);
    },
    getLatestVerdictForSubtask: (_chainId, subtaskId) =>
      getLatestVerdictForSubtask(store, subtaskId)?.verdict,
    listRuntimes: () => ["openclaw"],
    buildAdapter: () => makeVerifyAdapter(verdict),
  };
  return {
    sendEnvelope: async () => true,
    findWorkers: async () => ["worker_a", "worker_b"],
    now: () => NOW,
    signingKeyPem: keyPair.privateKey,
    publicKeyPem: keyPair.publicKey,
    orchestratorPeerId: "orch_1",
    orchestratorOwnerId: "envoy:owner:orch",
    audit: { record: () => undefined },
    chainVerify,
  };
}

function seedBalancedVerifyOnlyState() {
  const state = createChainState(mandate(), { awardMode: "direct" });
  state.subtasks.set("subtask_a", subtask("subtask_a"));
  state.subtasks.set("subtask_b", subtask("subtask_b", ["subtask_a"]));
  state.workersBySubtask.set("subtask_a", ["worker_a", "worker_b"]);
  state.workersBySubtask.set("subtask_b", ["worker_a", "worker_b"]);
  state.awards.set("subtask_a", {
    version: "0.1",
    subtaskId: "subtask_a",
    chainId: "chain_verify_only",
    workerPeerId: "worker_a",
    negotiationRound: 0,
    acceptedCostUsd: 2,
    deadlineAt: "2030-06-02T00:00:00.000Z",
    createdAt: NOW_ISO,
  });
  return state;
}

describe("verify-only wire (Phase 61B)", () => {
  it("requires verify_only for balanced + high criticality with 2+ workers", () => {
    const state = seedBalancedVerifyOnlyState();
    expect(requiresVerifyOnlyForSubtask(state, "subtask_a")).toBe(true);
  });

  it("blocks dependents when verifier returns disputed", async () => {
    const store: ArbitrationStore = new Map();
    const state = seedBalancedVerifyOnlyState();
    const deps = makeDeps(store, { kind: "disputed", needsHuman: true, signals: ["x"] });
    const partial = finalPartial("subtask_a");

    await handleOrchestratorPartial(deps, envelope(partial), partial, state);
    expect(state.verifyOnlyBlockedSubtasks.has("subtask_a")).toBe(true);
    expect(subtaskDependenciesSatisfied(state, state.subtasks.get("subtask_b")!)).toBe(false);

    const advanced = await advanceReadySubtasks(deps, state);
    expect(advanced.proposed).toBe(0);
  });

  it("unblocks dependents after pass verdict", async () => {
    const store: ArbitrationStore = new Map();
    const state = seedBalancedVerifyOnlyState();
    state.verifyOnlyBlockedSubtasks.add("subtask_a");
    state.partials.set("subtask_a", finalPartial("subtask_a"));
    const deps = makeDeps(store, { kind: "pass", score: 0.95 });
    const partial = finalPartial("subtask_a");

    await handleOrchestratorPartial(deps, envelope(partial), partial, state);
    expect(state.verifyOnlyBlockedSubtasks.has("subtask_a")).toBe(false);
    expect(subtaskDependenciesSatisfied(state, state.subtasks.get("subtask_b")!)).toBe(true);
  });
});
