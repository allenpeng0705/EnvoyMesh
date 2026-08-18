/**
 * Phase 41 / MAP — orchestrator-side verification loop tests (design §8.3).
 *
 * Covers:
 * - Inert when non-final partial / no adapter for the worker's runtime
 * - Rule pass writes a `rule` VerdictEntry on final partials
 * - Cross-agent escalation fires on partial/disputed + private-and-expensive
 * - Cross-agent escalation fires on `criticality: "high"`
 * - Same-runtime-only nodes skip escalation
 * - Verification budget miss downgrades to rule-only
 * - Escalation failure releases the verification reservation
 */

import { describe, expect, it } from "vitest";

import type {
  AgentRuntime,
  ChainMandate,
  ChainSubtask,
  ChainSubtaskAward,
  SignedAgentResult,
  TaskChainPartialPayload,
  Verdict,
  VerdictEntry,
} from "@envoymesh/protocol";
import type { AgentAdapter, ExecuteInput } from "@envoymesh/agent-adapter";

import {
  runChainVerificationLoop,
  shouldEscalateToCrossAgent,
  type ChainVerifyLoopDeps,
  type ChainVerifyLoopState,
} from "../src/chain-verify-loop.js";
import { createChainBudgetLedger, type ChainBudgetLedger } from "../src/chain-budget-ledger.js";
import type { ChainAuditSink } from "../src/chain-inbound-types.js";

const NOW = new Date("2026-06-18T00:00:00.000Z");
const NOW_ISO = NOW.toISOString();

function mandate(overrides: Partial<ChainMandate> = {}): ChainMandate {
  return {
    version: "0.1",
    chainMandateId: "chainmandate_test-1",
    chainId: "chain_test-1",
    issuerOwnerId: "envoy:owner:abc",
    orchestratorOwnerId: "envoy:owner:abc",
    maxChainCostUsd: 50,
    costCeilingUsd: 5,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: "2026-06-18T01:00:00.000Z",
    createdAt: NOW_ISO,
    signature: "test-signature",
    ...overrides,
  };
}

function subtask(overrides: Partial<ChainSubtask> = {}): ChainSubtask {
  return {
    version: "0.1",
    subtaskId: "subtask_a",
    chainId: "chain_test-1",
    chainMandateId: "chainmandate_test-1",
    depth: 1,
    requiredSkill: "research",
    objective: "Analyze the governance risks of the mesh.",
    requestedResult: "A short analysis",
    constraints: [],
    dependsOn: [],
    createdAt: NOW_ISO,
    ...overrides,
  };
}

function finalPartial(note = "Two runtimes should agree."): TaskChainPartialPayload {
  return {
    partial: {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "worker-1",
      seq: 1,
      isFinal: true,
      note,
      createdAt: NOW_ISO,
    },
  };
}

function makeState(opts?: {
  mandate?: ChainMandate;
  award?: ChainSubtaskAward;
}): { state: ChainVerifyLoopState; ledger: ChainBudgetLedger } {
  const m = opts?.mandate ?? mandate();
  const ledger = createChainBudgetLedger(m);
  const state: ChainVerifyLoopState = {
    chainId: m.chainId,
    chainMandate: m,
    subtasks: new Map([[subtask().subtaskId, subtask()]]),
    awards: new Map(opts?.award ? [[subtask().subtaskId, opts.award]] : []),
    ledger,
  };
  return { state, ledger };
}

function stubAdapter(
  runtime: AgentRuntime,
  verdicts: Verdict[] = [{ kind: "pass", score: 1, confidence: "high" }],
): AgentAdapter {
  return {
    runtime,
    describeSkills: () => [],
    buildManifest: async () => {
      throw new Error("not used in verify loop");
    },
    execute: async (input: ExecuteInput): Promise<SignedAgentResult> => ({
      skillId: "research",
      runtime,
      peerId: input.correlationId.split(":")[0] ?? "verify",
      correlationId: input.correlationId,
      content: [{ kind: "text", text: "Second runtime conclusion." }],
      citations: [],
      metrics: { durationMs: 1, costUsd: 0 },
      completedAt: NOW_ISO,
      signature: "stub",
    }),
    verify: async () => verdicts,
  };
}

function makeDeps(opts: {
  buildAdapter?: ChainVerifyLoopDeps["buildAdapter"];
  listRuntimes?: () => AgentRuntime[];
  resolveWorkerRuntime?: ChainVerifyLoopDeps["resolveWorkerRuntime"];
  crossVerifier?: ChainVerifyLoopDeps["crossVerifier"];
  criticality?: "normal" | "high";
  written?: VerdictEntry[];
  auditEvents?: unknown[];
}): ChainVerifyLoopDeps {
  const written = opts.written ?? [];
  const auditEvents = opts.auditEvents ?? [];
  const audit: ChainAuditSink = {
    record: (event) => {
      auditEvents.push(event);
    },
  };
  return {
    audit,
    orchestratorPeerId: "orch-1",
    signingKeyPem: undefined, // entries get the "unsigned" signature — fine for tests
    writeVerdictEntry: (chainId, entry) => {
      written.push(entry);
    },
    buildAdapter: opts.buildAdapter,
    listRuntimes: opts.listRuntimes,
    resolveWorkerRuntime: opts.resolveWorkerRuntime,
    crossVerifier: opts.crossVerifier,
    criticality: opts.criticality,
    now: () => NOW,
  };
}

describe("runChainVerificationLoop", () => {
  it("is inert for non-final partials", async () => {
    const written: VerdictEntry[] = [];
    const deps = makeDeps({
      buildAdapter: () => stubAdapter("openclaw"),
      listRuntimes: () => ["openclaw"],
      written,
    });
    const { state } = makeState();
    const payload: TaskChainPartialPayload = {
      partial: { ...finalPartial().partial, isFinal: false },
    };
    const result = await runChainVerificationLoop(deps, state, envelope(), payload);
    expect(result).toBeNull();
    expect(written).toHaveLength(0);
  });

  it("is inert when no adapter matches the worker's runtime", async () => {
    const written: VerdictEntry[] = [];
    const deps = makeDeps({
      buildAdapter: () => undefined,
      listRuntimes: () => ["openclaw"],
      written,
    });
    const { state } = makeState();
    const result = await runChainVerificationLoop(deps, state, envelope(), finalPartial());
    expect(result).toBeNull();
    expect(written).toHaveLength(0);
  });

  it("writes a rule VerdictEntry for a passing final partial", async () => {
    const written: VerdictEntry[] = [];
    const deps = makeDeps({
      buildAdapter: (runtime) => stubAdapter(runtime, [{ kind: "pass", score: 0.9, confidence: "high" }]),
      listRuntimes: () => ["openclaw"],
      written,
    });
    const { state } = makeState();
    const result = await runChainVerificationLoop(deps, state, envelope(), finalPartial());

    expect(result).not.toBeNull();
    expect(result!.verdict.kind).toBe("pass");
    expect(result!.escalated).toBeUndefined();
    expect(written).toHaveLength(1);
    expect(written[0].source).toBe("rule");
    expect(written[0].subtaskId).toBe("subtask_a");
    expect(written[0].workerPeerId).toBe("worker-1");
    expect(written[0].workerRuntime).toBe("openclaw");
    expect(written[0].skillId).toBe("research");
    expect(written[0].issuedBy).toBe("orch-1");
  });

  it("escalates to a second runtime on partial + private-and-expensive mandate", async () => {
    const written: VerdictEntry[] = [];
    let executedRuntimes: AgentRuntime[] = [];
    const deps = makeDeps({
      buildAdapter: (runtime) => {
        if (runtime === "openclaw") return stubAdapter("openclaw", [{ kind: "partial", score: 0.6, reason: "missing coverage" }]);
        if (runtime === "pi") {
          const pi = stubAdapter("pi", []);
          const origExecute = pi.execute.bind(pi);
          return {
            ...pi,
            execute: async (input) => {
              executedRuntimes.push("pi");
              return origExecute(input);
            },
          };
        }
        return undefined;
      },
      listRuntimes: () => ["openclaw", "pi"],
      resolveWorkerRuntime: () => "openclaw",
      crossVerifier: {
        verify: async () => ({ kind: "pass", score: 0.92, confidence: "high", notes: "two runtimes agreed" }),
      },
      written,
    });
    const { state } = makeState({
      mandate: mandate({ maxSensitivity: "private", maxChainCostUsd: 50 }),
      award: { version: "0.1", subtaskId: "subtask_a", chainId: "chain_test-1", workerPeerId: "worker-1", negotiationRound: 1, acceptedCostUsd: 2, deadlineAt: "2026-06-18T01:00:00.000Z", createdAt: NOW_ISO },
    });

    const result = await runChainVerificationLoop(deps, state, envelope(), finalPartial());

    expect(result).not.toBeNull();
    expect(result!.escalated).toBeDefined();
    expect(result!.escalated!.secondRuntime).toBe("pi");
    expect(result!.escalated!.crossVerdict.kind).toBe("pass");
    expect(executedRuntimes).toEqual(["pi"]);
    // rule + cross verdict entries
    expect(written).toHaveLength(2);
    expect(written.map((w) => w.source)).toEqual(["rule", "cross"]);
    // verification budget committed for the cross run
    const snap = state.ledger.snapshot();
    expect(snap.verificationCommittedUsd).toBe(2);
  });

  it("escalates on criticality: high even for a public chain", async () => {
    const written: VerdictEntry[] = [];
    const deps = makeDeps({
      buildAdapter: (runtime) =>
        stubAdapter(runtime, runtime === "openclaw" ? [{ kind: "disputed", needsHuman: true, signals: ["rule uncertain"] }] : []),
      listRuntimes: () => ["openclaw", "pi"],
      resolveWorkerRuntime: () => "openclaw",
      crossVerifier: {
        verify: async () => ({ kind: "partial", score: 0.6, reason: "partial agreement across runtimes" }),
      },
      criticality: "high",
      written,
    });
    const { state } = makeState(); // public mandate, small budget

    const result = await runChainVerificationLoop(deps, state, envelope(), finalPartial());

    expect(result!.escalated).toBeDefined();
    expect(written.map((w) => w.source)).toEqual(["rule", "cross"]);
  });

  it("skips escalation when no second runtime is available", async () => {
    const written: VerdictEntry[] = [];
    const deps = makeDeps({
      buildAdapter: (runtime) => stubAdapter(runtime, [{ kind: "disputed", needsHuman: true, signals: ["rule uncertain"] }]),
      listRuntimes: () => ["openclaw"],
      resolveWorkerRuntime: () => "openclaw",
      written,
    });
    const { state } = makeState({
      mandate: mandate({ maxSensitivity: "private", maxChainCostUsd: 50 }),
    });

    const result = await runChainVerificationLoop(deps, state, envelope(), finalPartial());

    expect(result!.escalated).toBeUndefined();
    expect(written).toHaveLength(1); // rule only
  });

  it("downgrades to rule-only when the verification budget is denied", async () => {
    const written: VerdictEntry[] = [];
    const deps = makeDeps({
      buildAdapter: (runtime) =>
        stubAdapter(runtime, [{ kind: "partial", score: 0.6, reason: "missing coverage" }]),
      listRuntimes: () => ["openclaw", "pi"],
      resolveWorkerRuntime: () => "openclaw",
      written,
    });
    // maxChainCostUsd=5, award already reserves 4 → no room for a verification reserve.
    const { state } = makeState({
      mandate: mandate({ maxSensitivity: "private", maxChainCostUsd: 5 }),
      award: { version: "0.1", subtaskId: "subtask_a", chainId: "chain_test-1", workerPeerId: "worker-1", negotiationRound: 1, acceptedCostUsd: 4, deadlineAt: "2026-06-18T01:00:00.000Z", createdAt: NOW_ISO },
    });
    await state.ledger.reserve("subtask_a", "worker-1", 4);
    await state.ledger.tryCommit("subtask_a");

    const result = await runChainVerificationLoop(deps, state, envelope(), finalPartial());

    expect(result!.escalated).toBeUndefined();
    expect(written).toHaveLength(1); // rule only
    const snap = state.ledger.snapshot();
    expect(snap.verificationCommittedUsd).toBe(0);
    expect(snap.verificationReservedUsd).toBe(0);
  });

  it("releases the verification reservation when the cross run throws", async () => {
    const written: VerdictEntry[] = [];
    const deps = makeDeps({
      buildAdapter: (runtime) => {
        if (runtime === "openclaw") return stubAdapter("openclaw", [{ kind: "disputed", needsHuman: true, signals: ["rule uncertain"] }]);
        if (runtime === "pi") {
          return {
            ...stubAdapter("pi", []),
            execute: async () => {
              throw new Error("second runtime crashed");
            },
          };
        }
        return undefined;
      },
      listRuntimes: () => ["openclaw", "pi"],
      resolveWorkerRuntime: () => "openclaw",
      written,
    });
    const { state } = makeState({
      mandate: mandate({ maxSensitivity: "private", maxChainCostUsd: 50 }),
      award: { version: "0.1", subtaskId: "subtask_a", chainId: "chain_test-1", workerPeerId: "worker-1", negotiationRound: 1, acceptedCostUsd: 2, deadlineAt: "2026-06-18T01:00:00.000Z", createdAt: NOW_ISO },
    });

    const result = await runChainVerificationLoop(deps, state, envelope(), finalPartial());

    expect(result!.escalated).toBeUndefined();
    expect(written).toHaveLength(1); // rule only; no cross entry
    const snap = state.ledger.snapshot();
    expect(snap.verificationReservedUsd).toBe(0);
    expect(snap.verificationCommittedUsd).toBe(0);
  });

  it("records audit events for rule + cross outcomes", async () => {
    const auditEvents: unknown[] = [];
    const deps = makeDeps({
      buildAdapter: (runtime) =>
        stubAdapter(runtime, [{ kind: "partial", score: 0.6, reason: "missing coverage" }]),
      listRuntimes: () => ["openclaw", "pi"],
      resolveWorkerRuntime: () => "openclaw",
      crossVerifier: {
        verify: async () => ({ kind: "pass", score: 0.9, confidence: "high" }),
      },
      auditEvents,
    });
    const { state } = makeState({
      mandate: mandate({ maxSensitivity: "private", maxChainCostUsd: 50 }),
    });

    await runChainVerificationLoop(deps, state, envelope(), finalPartial());

    const types = (auditEvents as Array<{ type: string }>).map((e) => e.type);
    expect(types).toContain("chain.verify_rule");
    expect(types).toContain("chain.verify_cross");
  });
});

describe("shouldEscalateToCrossAgent", () => {
  it("does not escalate a passing verdict", () => {
    expect(
      shouldEscalateToCrossAgent({ kind: "pass", score: 0.9, confidence: "high" }, {
        mandate: mandate({ maxSensitivity: "private", maxChainCostUsd: 50 }),
      }),
    ).toBe(false);
  });

  it("escalates partial on a private-and-expensive chain", () => {
    expect(
      shouldEscalateToCrossAgent({ kind: "partial", score: 0.6, reason: "uncertain" }, {
        mandate: mandate({ maxSensitivity: "private", maxChainCostUsd: 50 }),
      }),
    ).toBe(true);
  });

  it("does not escalate partial on a cheap public chain without criticality", () => {
    expect(
      shouldEscalateToCrossAgent({ kind: "partial", score: 0.6, reason: "uncertain" }, {
        mandate: mandate({ maxSensitivity: "public", maxChainCostUsd: 5 }),
      }),
    ).toBe(false);
  });

  it("escalates on criticality high regardless of sensitivity", () => {
    expect(
      shouldEscalateToCrossAgent({ kind: "disputed", needsHuman: true, signals: ["uncertain"] }, {
        mandate: mandate({ maxSensitivity: "public", maxChainCostUsd: 5 }),
        criticality: "high",
      }),
    ).toBe(true);
  });
});

function envelope() {
  return {
    version: "0.1" as const,
    messageId: "m1",
    correlationId: "corr-1",
    createdAt: NOW_ISO,
    senderPeerId: "worker-1",
    senderPublicKey: "pub",
    senderRole: "agent" as const,
    recipientPeerId: "orch-1",
    recipientRole: "agent" as const,
    intent: "task.chain.partial" as const,
    payload: {},
    signature: "sig",
  };
}
