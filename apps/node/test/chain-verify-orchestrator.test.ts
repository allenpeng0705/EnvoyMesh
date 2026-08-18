/**
 * Orchestrator-level "two-doctor" E2E (design §11, test-plan row
 * "Two-doctor cross-agent").
 *
 * Drives the real production seam — `handleOrchestratorPartial` in
 * `chain-orchestrator.ts` — with a `chainVerify` deps wired exactly like
 * `buildChainOrchestratorDeps` does: verdicts land in a real `ArbitrationStore`
 * via `recordVerdictEntry`, the worker's runtime is resolved through the same
 * `resolveWorkerRuntime` seam production uses (from wire manifests), and a
 * second, distinct runtime re-runs the step when the rule verdict is
 * `partial`/`disputed` on a `criticality: "high"` chain.
 *
 * - Rule verifier passes  → rule `pass`, no escalation, one `rule` entry
 * - Rule verdict disputed → escalate to a distinct runtime,
 *   `cross` entry + verification budget committed
 * - Non-critical cheap chain → `partial` stays rule-only (no escalation)
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
  VerdictEntry,
} from "@envoymesh/protocol";
import type { AgentAdapter, ExecuteInput } from "@envoymesh/agent-adapter";

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

const NOW = new Date("2026-08-18T00:00:00.000Z");
const NOW_ISO = NOW.toISOString();

let keyPair: { privateKey: string; publicKey: string };

beforeEach(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  keyPair = { privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(), publicKey: publicKey.export({ format: "pem", type: "spki" }).toString() };
});

function mandate(overrides: Partial<ChainMandate> = {}): ChainMandate {
  return {
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
    signature: "stub",
    ...overrides,
  };
}

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
    constraints: [],
    dependsOn: [],
    createdAt: NOW_ISO,
  };
}

function finalPartial(note = "Here is the risk summary the worker produced."): TaskChainPartialPayload {
  return {
    partial: {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_e2e-1",
      workerPeerId: "envoy_agent_worker",
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

/** Stub adapter whose rule verifier answers `verdicts`; the Pi seam also
 *  records that its `execute` ran (the second-doctor run). */
function stubAdapter(runtime: AgentRuntime, verdicts: Verdict[], executed: string[]): AgentAdapter {
  return {
    runtime,
    describeSkills: () => [],
    buildManifest: async () => {
      throw new Error("not used in verify loop");
    },
    execute: async (input: ExecuteInput): Promise<SignedAgentResult> => {
      executed.push(runtime);
      return {
        skillId: "research",
        runtime,
        peerId: "envoy_agent_orch",
        correlationId: input.correlationId,
        content: [{ kind: "text", text: "Second-doctor conclusion." }],
        citations: [],
        metrics: { durationMs: 1, costUsd: 0 },
        completedAt: NOW_ISO,
        signature: "stub",
      };
    },
    verify: async () => verdicts,
  };
}

interface E2EDeps {
  handler: ChainOrchestratorHandlerDeps;
  arbitrationStore: ArbitrationStore;
  auditEvents: unknown[];
  executedRuntimes: string[];
}

/** Build the orchestrator handler deps with the production-shaped verify wiring. */
function makeE2EDeps(opts: {
  ruleVerdicts: Verdict[];
  crossVerdict?: Verdict;
  criticality?: "normal" | "high";
}): E2EDeps {
  const arbitrationStore: ArbitrationStore = new Map();
  const auditEvents: unknown[] = [];
  const executedRuntimes: string[] = [];
  const audit: ChainAuditSink = {
    record: (event) => {
      auditEvents.push(event);
    },
  };

  const chainVerify: ChainVerifyLoopDeps = {
    audit,
    orchestratorPeerId: "envoy_agent_orch",
    signingKeyPem: keyPair.privateKey,
    writeVerdictEntry: (chainId, entry) => {
      void chainId;
      // Production shape: `recordVerdictEntry` into the per-chain store.
      const next = recordVerdictEntry(arbitrationStore, entry);
      arbitrationStore.clear();
      for (const [k, v] of next) arbitrationStore.set(k, v);
    },
    buildAdapter: (runtime) => {
      if (runtime === "openclaw") {
        return stubAdapter("openclaw", opts.ruleVerdicts, executedRuntimes);
      }
      if (runtime === "pi") {
        return stubAdapter("pi", [], executedRuntimes);
      }
      return undefined;
    },
    listRuntimes: () => ["openclaw", "pi"] as AgentRuntime[],
    resolveWorkerRuntime: () => "openclaw",
    crossVerifier:
      opts.crossVerdict !== undefined
        ? { verify: async () => opts.crossVerdict! }
        : undefined,
    criticality: opts.criticality,
    now: () => NOW,
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
  return { handler, arbitrationStore, auditEvents, executedRuntimes };
}

function makeState(criticality: "normal" | "high", maxChainCostUsd = 50): ChainState {
  const state = createChainState(mandate({ criticality, maxChainCostUsd }));
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

async function runPartialThroughOrchestrator(deps: E2EDeps, state: ChainState) {
  const payload = finalPartial();
  await handleOrchestratorPartial(deps.handler, envelope(payload), payload, state);
  return getVerdictsFor(deps.arbitrationStore);
}

describe("orchestrator-level two-doctor E2E", () => {
  it("records a single rule verdict when the rule verifier passes (no escalation)", async () => {
    const deps = makeE2EDeps({
      ruleVerdicts: [{ kind: "pass", score: 0.95, confidence: "high" }],
      criticality: "high",
    });
    const state = makeState("high");

    const verdicts = await runPartialThroughOrchestrator(deps, state);

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.source).toBe("rule");
    expect(verdicts[0]!.verdict.kind).toBe("pass");
    expect(verdicts[0]!.workerRuntime).toBe("openclaw");
    // No second-doctor run, no verification spend.
    expect(deps.executedRuntimes).toEqual([]);
    expect(state.ledger.snapshot().verificationCommittedUsd).toBe(0);
  });

  it("escalates to a distinct runtime and writes rule + cross verdicts when doctors disagree", async () => {
    const deps = makeE2EDeps({
      ruleVerdicts: [{ kind: "disputed", needsHuman: true, signals: ["rule uncertain"] }],
      crossVerdict: { kind: "pass", score: 0.9, confidence: "high", notes: "second doctor disagrees with the first" },
      criticality: "high",
    });
    const state = makeState("high");

    const verdicts = await runPartialThroughOrchestrator(deps, state);

    // The `(subtask, runtime)` ledger slot holds the latest, authoritative
    // verdict — the cross entry replaces the rule entry (`recordVerdictEntry`
    // semantics), while the audit trail keeps both events.
    expect(verdicts.map((v) => v.source)).toEqual(["cross"]);
    expect(verdicts[0]!.verdict.kind).toBe("pass");
    // The second doctor is the Pi runtime — distinct from the worker's OpenClaw.
    expect(deps.executedRuntimes).toEqual(["pi"]);
    const snap = state.ledger.snapshot();
    expect(snap.verificationCommittedUsd).toBe(2);
    const auditTypes = deps.auditEvents.map((e) => (e as { type: string }).type);
    expect(auditTypes).toContain("chain.verify_rule");
    expect(auditTypes).toContain("chain.verify_cross");
  });

  it("does not escalate a partial on a cheap public chain without criticality", async () => {
    const deps = makeE2EDeps({
      ruleVerdicts: [{ kind: "partial", score: 0.6, reason: "missing coverage" }],
      criticality: "normal",
    });
    const state = makeState("normal", 5);

    const verdicts = await runPartialThroughOrchestrator(deps, state);

    expect(verdicts.map((v) => v.source)).toEqual(["rule"]);
    expect(deps.executedRuntimes).toEqual([]);
    expect(state.ledger.snapshot().verificationCommittedUsd).toBe(0);
  });
});
