/**
 * Phase 40 — chain-orchestrator tests.
 *
 * Covers the centerpiece state machine:
 *   planChain → launchChain → evaluateBids → trackChain → synthesizeChain → publishChainReport
 *
 * - createChainState initializes the per-chain ledger and empty maps
 * - planChain: no_goal returns ok=false; short goal returns 1 subtask;
 *   LLM-decomposed long goal returns N subtasks
 * - launchChain: no_subtasks returns ok=false; otherwise broadcasts mandate
 *   + proposes each subtask to the matching workers
 * - evaluateBids: cancelled returns ok=false; no_bids returns ok=false;
 *   cheapest policy sorts ascending by cost; reserves budget before awarding;
 *   budget_exceeded when reservation fails; max_rounds_exceeded after 3 rounds
 * - Mandatory cancel-before-accept ordering: when a subtask is in
 *   cancelledSubtasks, evaluateBids returns ok=false with reason "cancelled"
 *   even though bids exist
 * - synthesizeChain: collects contributions from partials, calls the
 *   synthesizer, returns the report
 * - publishChainReport: refuses to publish twice; finalizes the ledger; sends
 *   task.chain.report to the owner
 * - handleOrchestratorMerge: cancel-then-merge ordering — releases budget,
 *   removes the old subtasks, registers the new merged subtask
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  advanceReadySubtasks,
  chainStateSnapshot,
  createChainState,
  evaluateBids,
  handleOrchestratorMerge,
  handleOrchestratorPartial,
  launchChain,
  planChain,
  publishChainReport,
  reassignStalledSubtask,
  retryStaleProposals,
  retryStaleAccepts,
  resolveProposeTargets,
  buildChainStatusPayload,
  buildChainLiveSteps,
  sendChainAccept,
  sendChainPropose,
  synthesizeChain,
  trackChain,
  type ChainOrchestratorHandlerDeps,
} from "../src/chain-orchestrator.js";
import {
  CHAIN_ACCEPT_RESEND_CAP,
  CHAIN_ACCEPT_RESEND_WAIT_MS,
  CHAIN_BID_WAIT_MS,
} from "../src/chain-defaults.js";
import { TaskChainPartialPayloadSchema, type ChainSubtaskBid, type EnvoyEnvelope, type TaskChainPartialPayload, type TaskChainReportPayload } from "@envoymesh/protocol";
import { ChainSubtaskBidSchema, ChainSubtaskPartialSchema } from "@envoymesh/protocol";
import { generateKeyPairSync } from "node:crypto";
import { signCanonicalPayload } from "@envoymesh/identity";

let keyPair: { privateKey: string; publicKey: string };

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  keyPair = {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
});

const NOW = new Date("2026-06-18T00:00:00.000Z");

function makeDeps(
  overrides: Partial<ChainOrchestratorHandlerDeps> & {
    sendResult?: boolean;
  } = {},
): ChainOrchestratorHandlerDeps & {
  sentEnvelopes: Array<{ recipientPeerId: string; envelope: EnvoyEnvelope; payload: unknown }>;
  auditEvents: Array<Record<string, unknown>>;
  storedReports: TaskChainReportPayload["report"][];
} {
  const sentEnvelopes: Array<{ recipientPeerId: string; envelope: EnvoyEnvelope; payload: unknown }> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const storedReports: TaskChainReportPayload["report"][] = [];
  const sendResult = overrides.sendResult ?? true;
  const deps: ChainOrchestratorHandlerDeps = {
    sendEnvelope: async (recipientPeerId, envelope, payload) => {
      sentEnvelopes.push({ recipientPeerId, envelope, payload });
      return sendResult;
    },
    findWorkers: overrides.findWorkers ?? (async () => []),
    now: overrides.now ?? (() => NOW),
    signingKeyPem: overrides.signingKeyPem ?? keyPair.privateKey,
    publicKeyPem: overrides.publicKeyPem ?? keyPair.publicKey,
    orchestratorPeerId: overrides.orchestratorPeerId ?? "12D3KooW-orchestrator",
    orchestratorOwnerId: overrides.orchestratorOwnerId ?? "envoy:owner:orchestrator",
    audit: overrides.audit ?? {
      record: (e) => {
        auditEvents.push(e as unknown as Record<string, unknown>);
      },
    },
    storeChainReport: async (r) => {
      storedReports.push(r);
    },
    llmDecompose: overrides.llmDecompose,
    llmMerge: overrides.llmMerge,
  };
  return { ...deps, sentEnvelopes, auditEvents, storedReports };
}

function mandate(overrides: { maxChainCostUsd?: number; stallTimeoutMs?: number } = {}) {
  return {
    version: "0.1" as const,
    chainMandateId: "chainmandate_test-1",
    chainId: "chain_test-1",
    issuerOwnerId: "envoy:owner:orchestrator",
    orchestratorOwnerId: "envoy:owner:orchestrator",
    maxChainCostUsd: overrides.maxChainCostUsd ?? 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public" as const,
    deadlineAt: "2026-06-18T01:00:00.000Z",
    createdAt: NOW.toISOString(),
    signature: "stub",
    ...(overrides.stallTimeoutMs !== undefined
      ? { stallTimeoutMs: overrides.stallTimeoutMs }
      : {}),
  };
}

function bid(subtaskId: string, cost: number, expiresAtMs?: number): ChainSubtaskBid {
  return ChainSubtaskBidSchema.parse({
    version: "0.1",
    subtaskId,
    chainId: "chain_test-1",
    workerPeerId: `12D3KooW-w-${subtaskId}-${cost}`,
    workerOwnerId: "envoy:owner:worker",
    proposedCostUsd: cost,
    proposedEtaAt: new Date(NOW.getTime() + 60_000).toISOString(),
    bidExpiresAt: new Date(expiresAtMs ?? NOW.getTime() + 60_000).toISOString(),
    createdAt: NOW.toISOString(),
  });
}

describe("createChainState", () => {
  it("initializes ledger and empty maps", () => {
    const s = createChainState(mandate());
    expect(s.chainId).toBe("chain_test-1");
    expect(s.subtasks.size).toBe(0);
    expect(s.bids.size).toBe(0);
    expect(s.awards.size).toBe(0);
    expect(s.partials.size).toBe(0);
    expect(s.chainCancelled).toBe(false);
    expect(s.published).toBe(false);
    expect(s.ledger.snapshot().maxChainCostUsd).toBe(10);
  });

  it("chainStateSnapshot reads the per-chain aggregates", () => {
    const s = createChainState(mandate());
    const snap = chainStateSnapshot(s);
    expect(snap.budgetMaxUsd).toBe(10);
    expect(snap.budgetSpentUsd).toBe(0);
  });
});

describe("planChain", () => {
  it("returns no_goal for empty input", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    const r = await planChain(deps, state, "");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no_goal");
  });

  it("returns one subtask for a short keyword goal", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    const r = await planChain(deps, state, "summarize Q3 results");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtasks.length).toBe(1);
    expect(state.subtasks.size).toBe(1);
  });

  it("uses LLM decomposer for a long goal when allowed", async () => {
    const llmDecompose = vi.fn().mockResolvedValue({
      ok: true,
      steps: [
        {
          version: "0.1" as const,
          subtaskId: "subtask_a",
          chainId: "chain_test-1",
          chainMandateId: "chainmandate_test-1",
          depth: 1,
          requiredSkill: "task.execute",
          objective: "step one",
          requestedResult: "r1",
          constraints: [],
          dependsOn: [],
          createdAt: NOW.toISOString(),
        },
        {
          version: "0.1" as const,
          subtaskId: "subtask_b",
          chainId: "chain_test-1",
          chainMandateId: "chainmandate_test-1",
          depth: 2,
          requiredSkill: "task.execute",
          objective: "step two",
          requestedResult: "r2",
          constraints: [],
          dependsOn: ["subtask_a"],
          createdAt: NOW.toISOString(),
        },
      ],
    });
    const deps = makeDeps({ llmDecompose });
    const state = createChainState(mandate());
    const longGoal = "please help me analyze the entire business impact of Q3 across multiple dimensions and produce a detailed multi-step report";
    const r = await planChain(deps, state, longGoal, { allowLlm: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtasks.length).toBe(2);
    expect(llmDecompose).toHaveBeenCalledTimes(1);
  });

  it("falls back to a single keyword subtask when the LLM refuses", async () => {
    const llmDecompose = vi.fn().mockResolvedValue({ ok: false, reason: "rate-limited" });
    const deps = makeDeps({ llmDecompose });
    const state = createChainState(mandate());
    const r = await planChain(deps, state, "a really long goal that exceeds the threshold for the keyword fallback path", { allowLlm: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtasks.length).toBe(1);
    expect(llmDecompose).toHaveBeenCalledTimes(1);
  });

  it("passes request-scoped assignmentMode into llmDecompose", async () => {
    const llmDecompose = vi.fn().mockResolvedValue({
      ok: true,
      steps: [
        {
          version: "0.1" as const,
          subtaskId: "subtask_a",
          chainId: "chain_test-1",
          chainMandateId: "chainmandate_test-1",
          depth: 1,
          requiredSkill: "task.execute",
          objective: "step one",
          requestedResult: "r1",
          constraints: [],
          dependsOn: [],
          createdAt: NOW.toISOString(),
        },
      ],
      planWarnings: [{ code: "role_substitute", message: "used programmer", assignKind: "role_substitute" }],
      assignmentMode: "role",
    });
    const deps = makeDeps({ llmDecompose });
    const state = createChainState(mandate());
    const r = await planChain(deps, state, "role plan goal", {
      allowLlm: true,
      assignmentMode: "role",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(llmDecompose).toHaveBeenCalledWith("role plan goal", { assignmentMode: "role" });
    expect(r.assignmentMode).toBe("role");
    expect(r.planWarnings?.[0]?.code).toBe("role_substitute");
  });

  it("emits no_llm_role_planning when role mode falls back to keyword path", async () => {
    const llmDecompose = vi.fn().mockResolvedValue({ ok: false, reason: "rate-limited" });
    const deps = makeDeps({ llmDecompose });
    const state = createChainState(mandate());
    const r = await planChain(deps, state, "role fallback goal", {
      allowLlm: true,
      assignmentMode: "role",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtasks.length).toBe(1);
    expect(r.planWarnings?.some((w) => w.code === "no_llm_role_planning")).toBe(true);
    expect(r.assignmentMode).toBe("role");
  });
});

describe("launchChain", () => {
  it("returns no_subtasks when there are none", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    const r = await launchChain(deps, state, {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no_subtasks");
  });

  it("broadcasts the mandate and proposes each subtask", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "step one",
      requestedResult: "r1",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    const r = await launchChain(deps, state, {
      subtask_a: ["12D3KooW-w1", "12D3KooW-w2"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 2 mandates + 2 proposes = 4 envelopes.
    expect(deps.sentEnvelopes.length).toBe(4);
    expect(deps.auditEvents.some((e) => e.type === "chain.launched")).toBe(true);
  });

  it("does not mark proposed when every propose send fails", async () => {
    const deps = makeDeps({ sendResult: false });
    const state = createChainState(mandate());
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "step one",
      requestedResult: "r1",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    const r = await launchChain(deps, state, {
      subtask_a: ["12D3KooW-w1"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposed).toBe(0);
    expect(state.proposedSubtasks.has("subtask_a")).toBe(false);
    // advanceReadySubtasks can retry later
    const advanced = await advanceReadySubtasks(
      { ...deps, sendEnvelope: async (recipientPeerId, envelope, payload) => {
        deps.sentEnvelopes.push({ recipientPeerId, envelope, payload });
        return true;
      } },
      state,
    );
    expect(advanced.proposed).toBe(1);
    expect(state.proposedSubtasks.has("subtask_a")).toBe(true);
  });

  it("buildChainStatusPayload uses waitingWorkers then assigning/bidding by mode", () => {
    const state = createChainState(mandate());
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "step one",
      requestedResult: "r1",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    state.proposedSubtasks.add("subtask_a");
    const waiting = buildChainStatusPayload(state, { awardMode: "direct", goal: "g" });
    expect(waiting.phase).toBe("waitingWorkers");
    expect(waiting.bidCount).toBe(0);
    expect(waiting.readOnly).toBe(true);
    expect(waiting.steps[0]?.state).toBe("offered");

    state.bids.set("subtask_a::12D3KooW-w1", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      workerOwnerId: "envoy:owner:w1",
      proposedCostUsd: 0,
      proposedEtaAt: new Date(NOW.getTime() + 60_000).toISOString(),
      bidExpiresAt: new Date(NOW.getTime() + 120_000).toISOString(),
      capability: "task.execute",
      createdAt: NOW.toISOString(),
    });
    const direct = buildChainStatusPayload(state, { awardMode: "direct", goal: "g" });
    expect(direct.phase).toBe("assigning");
    expect(direct.bidCount).toBe(1);
    const competitive = buildChainStatusPayload(state, { awardMode: "competitive" });
    expect(competitive.phase).toBe("bidding");
  });

  it("buildChainLiveSteps includes deps waitingOn and produced keys", () => {
    const state = createChainState(mandate());
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "research",
      requestedResult: "r1",
      constraints: [],
      dependsOn: [],
      produces: ["summary"],
      createdAt: NOW.toISOString(),
    });
    state.subtasks.set("subtask_b", {
      version: "0.1",
      subtaskId: "subtask_b",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 2,
      requiredSkill: "task.execute",
      objective: "write",
      requestedResult: "r2",
      constraints: [],
      dependsOn: ["subtask_a"],
      expects: [{ key: "summary", fromSubtaskId: "subtask_a" }],
      createdAt: NOW.toISOString(),
    });
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      negotiationRound: 1,
      acceptedCostUsd: 0,
      deadlineAt: new Date(NOW.getTime() + 3600_000).toISOString(),
      createdAt: NOW.toISOString(),
    });
    state.partials.set("subtask_a", {
      version: "0.1",
      chainId: "chain_test-1",
      partial: {
        version: "0.1",
        subtaskId: "subtask_a",
        chainId: "chain_test-1",
        workerPeerId: "12D3KooW-w1",
        sequence: 1,
        isFinal: true,
        confidence: 0.9,
        note: "done",
        artifact: { kind: "text", content: "parent" },
        namedArtifacts: [
          {
            key: "summary",
            artifact: { kind: "text", content: "ok" },
          },
        ],
        createdAt: NOW.toISOString(),
      },
    } as TaskChainPartialPayload);

    const steps = buildChainLiveSteps(state);
    expect(steps).toHaveLength(2);
    const a = steps.find((s) => s.subtaskId === "subtask_a");
    const b = steps.find((s) => s.subtaskId === "subtask_b");
    expect(a?.state).toBe("done");
    expect(a?.produced?.[0]?.key).toBe("summary");
    expect(b?.state).toBe("pending");
    expect(b?.dependsOn).toEqual(["subtask_a"]);
    expect(b?.waitingOn?.[0]).toMatchObject({
      fromSubtaskId: "subtask_a",
      key: "summary",
      kind: "text",
    });
  });

  it("retryStaleAccepts re-sends accept with subtask when no partial arrives", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    const subtask = {
      version: "0.1" as const,
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "step one",
      requestedResult: "r1",
      constraints: [] as string[],
      dependsOn: [] as string[],
      createdAt: NOW.toISOString(),
    };
    state.subtasks.set("subtask_a", subtask);
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      negotiationRound: 1,
      acceptedCostUsd: 0,
      deadlineAt: new Date(NOW.getTime() + 3600_000).toISOString(),
      createdAt: NOW.toISOString(),
    });
    state.awardedAt.set("subtask_a", NOW.toISOString());

    const early = await retryStaleAccepts(deps, state, {
      waitMs: CHAIN_ACCEPT_RESEND_WAIT_MS,
      nowMs: NOW.getTime() + 1_000,
    });
    expect(early.resent).toEqual([]);

    const first = await retryStaleAccepts(deps, state, {
      waitMs: CHAIN_ACCEPT_RESEND_WAIT_MS,
      nowMs: NOW.getTime() + CHAIN_ACCEPT_RESEND_WAIT_MS + 1,
    });
    expect(first.resent).toEqual(["subtask_a"]);
    const accepts = deps.sentEnvelopes.filter((e) => e.envelope.intent === "task.chain.accept");
    expect(accepts).toHaveLength(1);
    expect((accepts[0]!.payload as { subtask?: { subtaskId: string } }).subtask?.subtaskId).toBe(
      "subtask_a",
    );
  });

  it("retryStaleAccepts reassigns after accept-resend cap with no partial", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate(), { awardMode: "direct" });
    state.subtasks.set("subtask_a", {
      version: "0.1" as const,
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "step one",
      requestedResult: "r1",
      constraints: [] as string[],
      dependsOn: [] as string[],
      preferredWorkerPeerId: "12D3KooW-w1",
      createdAt: NOW.toISOString(),
    });
    state.workersBySubtask.set("subtask_a", ["12D3KooW-w1", "12D3KooW-w2"]);
    state.proposedSubtasks.add("subtask_a");
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      negotiationRound: 1,
      acceptedCostUsd: 0,
      deadlineAt: new Date(NOW.getTime() + 3600_000).toISOString(),
      createdAt: NOW.toISOString(),
    });
    state.awardedAt.set("subtask_a", NOW.toISOString());
    state.acceptResendCount.set("subtask_a", CHAIN_ACCEPT_RESEND_CAP);

    const afterCap = await retryStaleAccepts(deps, state, {
      waitMs: CHAIN_ACCEPT_RESEND_WAIT_MS,
      nowMs: NOW.getTime() + CHAIN_ACCEPT_RESEND_WAIT_MS + 1,
    });
    expect(afterCap.reassigned).toEqual(["subtask_a"]);
    expect(state.awards.get("subtask_a")?.workerPeerId).toBe("12D3KooW-w2");
    expect(state.silentWorkerPeerIds.has("12D3KooW-w1")).toBe(true);
    expect(
      deps.auditEvents.some(
        (e) => typeof e.summary === "string" && e.summary.includes("silent_accept_reassign"),
      ),
    ).toBe(true);
  });

  it("resolveProposeTargets demotes silent preferred workers", () => {
    expect(
      resolveProposeTargets(["12D3KooW-w1", "12D3KooW-w2"], "12D3KooW-w1", {
        demotePeerIds: new Set(["12D3KooW-w1"]),
      }),
    ).toEqual(["12D3KooW-w2", "12D3KooW-w1"]);
    expect(
      resolveProposeTargets(["12D3KooW-w1", "12D3KooW-w2"], "12D3KooW-w1"),
    ).toEqual(["12D3KooW-w1", "12D3KooW-w2"]);
  });

  it("advanceReadySubtasks skips silent preferred worker in direct mode", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate(), { awardMode: "direct" });
    state.silentWorkerPeerIds.add("12D3KooW-w1");
    state.subtasks.set("subtask_b", {
      version: "0.1" as const,
      subtaskId: "subtask_b",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 2,
      requiredSkill: "task.execute",
      objective: "step two",
      requestedResult: "r2",
      constraints: [] as string[],
      dependsOn: ["subtask_a"],
      preferredWorkerPeerId: "12D3KooW-w1",
      createdAt: NOW.toISOString(),
    });
    state.workersBySubtask.set("subtask_b", ["12D3KooW-w1", "12D3KooW-w2"]);
    state.partials.set("subtask_a", {
      version: "0.1",
      chainId: "chain_test-1",
      partial: {
        version: "0.1",
        subtaskId: "subtask_a",
        chainId: "chain_test-1",
        workerPeerId: "12D3KooW-w2",
        sequence: 1,
        isFinal: true,
        confidence: 0.9,
        note: "done",
        artifact: { kind: "text", content: "parent" },
        createdAt: NOW.toISOString(),
      },
    } as TaskChainPartialPayload);

    const advanced = await advanceReadySubtasks(deps, state);
    expect(advanced.proposed).toBe(1);
    expect(state.awards.get("subtask_b")?.workerPeerId).toBe("12D3KooW-w2");
  });

  it("launchChain in competitive mode proposes preferred worker and one backup together", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate()); // default competitive
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "step one",
      requestedResult: "r1",
      constraints: [],
      dependsOn: [],
      preferredWorkerPeerId: "12D3KooW-w1",
      createdAt: NOW.toISOString(),
    });
    await launchChain(deps, state, {
      subtask_a: ["12D3KooW-w1", "12D3KooW-w2"],
    });
    const proposes = deps.sentEnvelopes.filter((e) => e.envelope.intent === "task.chain.propose");
    expect(proposes.map((e) => e.recipientPeerId)).toEqual(["12D3KooW-w1", "12D3KooW-w2"]);
  });

  it("launchChain in direct mode awards preferred worker without waiting for a bid", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate(), { awardMode: "direct" });
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "step one",
      requestedResult: "r1",
      constraints: [],
      dependsOn: [],
      preferredWorkerPeerId: "12D3KooW-w1",
      createdAt: NOW.toISOString(),
    });
    await launchChain(deps, state, {
      subtask_a: ["12D3KooW-w1", "12D3KooW-w2"],
    });
    expect(state.awards.get("subtask_a")?.workerPeerId).toBe("12D3KooW-w1");
    const accepts = deps.sentEnvelopes.filter((e) => e.envelope.intent === "task.chain.accept");
    expect(accepts).toHaveLength(1);
    expect(accepts[0]!.recipientPeerId).toBe("12D3KooW-w1");
    expect((accepts[0]!.payload as { subtask?: { subtaskId: string } }).subtask?.subtaskId).toBe(
      "subtask_a",
    );
    const proposes = deps.sentEnvelopes.filter((e) => e.envelope.intent === "task.chain.propose");
    expect(proposes).toHaveLength(0);
  });

  it("direct launch fails over to backup when preferred accept send fails", async () => {
    const deps = makeDeps();
    deps.sendEnvelope = async (recipientPeerId, envelope, payload) => {
      deps.sentEnvelopes.push({ recipientPeerId, envelope, payload });
      if (
        envelope.intent === "task.chain.accept" &&
        recipientPeerId === "12D3KooW-w1"
      ) {
        return false;
      }
      return true;
    };
    const state = createChainState(mandate(), { awardMode: "direct" });
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "step one",
      requestedResult: "r1",
      constraints: [],
      dependsOn: [],
      preferredWorkerPeerId: "12D3KooW-w1",
      createdAt: NOW.toISOString(),
    });
    await launchChain(deps, state, {
      subtask_a: ["12D3KooW-w1", "12D3KooW-w2"],
    });
    expect(state.awards.get("subtask_a")?.workerPeerId).toBe("12D3KooW-w2");
  });

  it("retryStaleProposals tries backup first after bid wait (not the silent preferred again)", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate()); // competitive
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "step one",
      requestedResult: "r1",
      constraints: [],
      dependsOn: [],
      preferredWorkerPeerId: "12D3KooW-w1",
      createdAt: NOW.toISOString(),
    });
    // Simulate legacy preferred-only propose (no backup fan-out on launch).
    state.workersBySubtask.set("subtask_a", ["12D3KooW-w1", "12D3KooW-w2"]);
    state.proposedSubtasks.add("subtask_a");
    state.proposedAt.set("subtask_a", NOW.getTime());

    // Too early — no retry.
    const early = await retryStaleProposals(deps, state, {
      bidWaitMs: CHAIN_BID_WAIT_MS,
      nowMs: NOW.getTime() + 1_000,
    });
    expect(early.retried).toEqual([]);

    // First retry: backup worker (skip re-proposing silent preferred).
    const first = await retryStaleProposals(deps, state, {
      bidWaitMs: CHAIN_BID_WAIT_MS,
      nowMs: NOW.getTime() + CHAIN_BID_WAIT_MS + 1,
    });
    expect(first.retried).toEqual(["subtask_a"]);
    const proposesAfterFirst = deps.sentEnvelopes.filter(
      (e) => e.envelope.intent === "task.chain.propose",
    );
    expect(proposesAfterFirst.length).toBe(1);
    expect(proposesAfterFirst[0]!.recipientPeerId).toBe("12D3KooW-w2");
    expect(
      deps.auditEvents.some(
        (e) => e.type === "chain.subtask_proposed" && String(e.summary).includes("propose_retry"),
      ),
    ).toBe(true);

    // Second retry: back to preferred.
    const second = await retryStaleProposals(deps, state, {
      bidWaitMs: CHAIN_BID_WAIT_MS,
      nowMs: NOW.getTime() + 2 * CHAIN_BID_WAIT_MS + 2,
    });
    expect(second.retried).toEqual(["subtask_a"]);
    const proposesAfterSecond = deps.sentEnvelopes.filter(
      (e) => e.envelope.intent === "task.chain.propose",
    );
    expect(proposesAfterSecond.length).toBe(2);
    expect(proposesAfterSecond[1]!.recipientPeerId).toBe("12D3KooW-w1");

    // Cap — no more retries.
    const capped = await retryStaleProposals(deps, state, {
      bidWaitMs: CHAIN_BID_WAIT_MS,
      nowMs: NOW.getTime() + 3 * CHAIN_BID_WAIT_MS + 3,
    });
    expect(capped.retried).toEqual([]);
  });

  it("defers dependents until parents finish, then advances with parent context", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "research",
      requestedResult: "notes",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    state.subtasks.set("subtask_b", {
      version: "0.1",
      subtaskId: "subtask_b",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "write",
      requestedResult: "draft",
      constraints: [],
      dependsOn: ["subtask_a"],
      createdAt: NOW.toISOString(),
    });
    const launch = await launchChain(deps, state, {
      subtask_a: ["12D3KooW-w1"],
      subtask_b: ["12D3KooW-w2"],
    });
    expect(launch.ok).toBe(true);
    // 2 mandates + 1 propose (root only)
    expect(deps.sentEnvelopes.filter((e) => e.envelope.intent === "task.chain.propose").length).toBe(1);
    expect(state.proposedSubtasks.has("subtask_a")).toBe(true);
    expect(state.proposedSubtasks.has("subtask_b")).toBe(false);

    const partial = TaskChainPartialPayloadSchema.parse({
      partial: ChainSubtaskPartialSchema.parse({
        version: "0.1",
        subtaskId: "subtask_a",
        chainId: "chain_test-1",
        workerPeerId: "12D3KooW-w1",
        seq: 1,
        isFinal: true,
        note: "found X",
        artifactFragment: { kind: "text", content: "research blob" },
        createdAt: NOW.toISOString(),
      }),
    });
    await handleOrchestratorPartial(
      deps,
      {
        version: "0.1",
        messageId: "m1",
        createdAt: NOW.toISOString(),
        senderPeerId: "12D3KooW-w1",
        senderPublicKey: "pk",
        senderRole: "agent",
        recipientRole: "agent",
        intent: "task.chain.partial",
        payload: partial,
        signature: "s",
        correlationId: "chain_test-1",
      },
      partial,
      state,
    );
    expect(state.proposedSubtasks.has("subtask_b")).toBe(true);
    const bPropose = deps.sentEnvelopes.find(
      (e) =>
        e.envelope.intent === "task.chain.propose" &&
        (e.payload as { subtask?: { subtaskId?: string } }).subtask?.subtaskId === "subtask_b",
    );
    expect(bPropose).toBeTruthy();
    const constraints = (bPropose!.payload as { subtask: { constraints: string[] } }).subtask.constraints;
    expect(constraints.some((c) => c.includes("prior[subtask_a]") && c.includes("research blob"))).toBe(true);
  });
});

describe("reassignStalledSubtask", () => {
  it("cancels the stalled worker and proposes to the next backup once", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
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
    state.workersBySubtask.set("subtask_a", ["12D3KooW-w1", "12D3KooW-w2"]);
    state.proposedSubtasks.add("subtask_a");
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      acceptedCostUsd: 0,
      negotiationRound: 1,
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    const first = await reassignStalledSubtask(deps, state, "subtask_a");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.nextWorkerPeerId).toBe("12D3KooW-w2");
    expect(state.awards.has("subtask_a")).toBe(false);
    expect(deps.sentEnvelopes.some((e) => e.envelope.intent === "task.chain.cancel")).toBe(true);
    expect(
      deps.sentEnvelopes.some(
        (e) => e.envelope.intent === "task.chain.propose" && e.recipientPeerId === "12D3KooW-w2",
      ),
    ).toBe(true);

    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w2",
      acceptedCostUsd: 0,
      negotiationRound: 1,
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    const second = await reassignStalledSubtask(deps, state, "subtask_a");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("reassign_cap");
  });

  it("direct mode reassigns with accept instead of propose", async () => {
    const deps = makeDeps();
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
    state.workersBySubtask.set("subtask_a", ["12D3KooW-w1", "12D3KooW-w2"]);
    state.proposedSubtasks.add("subtask_a");
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      acceptedCostUsd: 0,
      negotiationRound: 1,
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    const first = await reassignStalledSubtask(deps, state, "subtask_a");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.nextWorkerPeerId).toBe("12D3KooW-w2");
    expect(state.awards.get("subtask_a")?.workerPeerId).toBe("12D3KooW-w2");
    expect(deps.sentEnvelopes.some((e) => e.envelope.intent === "task.chain.cancel")).toBe(true);
    expect(
      deps.sentEnvelopes.some(
        (e) => e.envelope.intent === "task.chain.accept" && e.recipientPeerId === "12D3KooW-w2",
      ),
    ).toBe(true);
    expect(
      deps.sentEnvelopes.some(
        (e) => e.envelope.intent === "task.chain.propose" && e.recipientPeerId === "12D3KooW-w2",
      ),
    ).toBe(false);
  });
});

describe("handleOrchestratorPartial worker failure", () => {
  it("reassigns to backup when final partial is an engine failure marker", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
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
    state.workersBySubtask.set("subtask_a", ["12D3KooW-w1", "12D3KooW-w2"]);
    state.proposedSubtasks.add("subtask_a");
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      acceptedCostUsd: 0,
      negotiationRound: 1,
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    const partial = TaskChainPartialPayloadSchema.parse({
      partial: ChainSubtaskPartialSchema.parse({
        version: "0.1",
        subtaskId: "subtask_a",
        chainId: "chain_test-1",
        workerPeerId: "12D3KooW-w1",
        seq: 1,
        isFinal: true,
        note: "AN_ENGINE_FAIL: Built-in OpenClaw is not running on this node",
        confidence: 0.1,
        createdAt: NOW.toISOString(),
      }),
    });
    await handleOrchestratorPartial(
      deps,
      {
        version: "0.1",
        messageId: "m1",
        createdAt: NOW.toISOString(),
        senderPeerId: "12D3KooW-w1",
        senderPublicKey: "pk",
        senderRole: "agent",
        recipientRole: "agent",
        intent: "task.chain.partial",
        payload: partial,
        signature: "s",
        correlationId: "chain_test-1",
      },
      partial,
      state,
    );
    expect(state.awards.has("subtask_a")).toBe(false);
    expect(state.partials.has("subtask_a")).toBe(false);
    expect(state.reassignCount.get("subtask_a")).toBe(1);
    expect(state.workersBySubtask.get("subtask_a")?.[0]).toBe("12D3KooW-w2");
  });

  it("does not reassign when LLM prose starts with Failed:", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
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
      createdAt: NOW.toISOString(),
    });
    state.workersBySubtask.set("subtask_a", ["12D3KooW-w1", "12D3KooW-w2"]);
    state.proposedSubtasks.add("subtask_a");
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      acceptedCostUsd: 0,
      negotiationRound: 1,
      deadlineAt: "2026-06-18T01:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    const partial = TaskChainPartialPayloadSchema.parse({
      partial: ChainSubtaskPartialSchema.parse({
        version: "0.1",
        subtaskId: "subtask_a",
        chainId: "chain_test-1",
        workerPeerId: "12D3KooW-w1",
        seq: 1,
        isFinal: true,
        note: "Failed: to locate primary sources — here is a best-effort summary instead.",
        confidence: 0.85,
        createdAt: NOW.toISOString(),
      }),
    });
    await handleOrchestratorPartial(
      deps,
      {
        version: "0.1",
        messageId: "m1",
        createdAt: NOW.toISOString(),
        senderPeerId: "12D3KooW-w1",
        senderPublicKey: "pk",
        senderRole: "agent",
        recipientRole: "agent",
        intent: "task.chain.partial",
        payload: partial,
        signature: "s",
        correlationId: "chain_test-1",
      },
      partial,
      state,
    );
    expect(state.awards.has("subtask_a")).toBe(true);
    expect(state.partials.has("subtask_a")).toBe(true);
    expect(state.reassignCount.get("subtask_a") ?? 0).toBe(0);
  });
});

describe("evaluateBids", () => {
  it("returns cancelled when the subtask is cancelled (cancel-before-accept)", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
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
      createdAt: NOW.toISOString(),
    });
    state.bids.set("subtask_a::12D3KooW-w1", bid("subtask_a", 1));
    state.cancelledSubtasks.add("subtask_a");
    const r = await evaluateBids(deps, state, { subtaskId: "subtask_a" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("cancelled");
    // No award was created.
    expect(state.awards.size).toBe(0);
  });

  it("returns no_bids when no matching bids exist", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
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
      createdAt: NOW.toISOString(),
    });
    const r = await evaluateBids(deps, state, { subtaskId: "subtask_a" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no_bids");
  });

  it("returns all_bids_expired when every bid is past its expiration", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
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
      createdAt: NOW.toISOString(),
    });
    state.bids.set("subtask_a::12D3KooW-w1", bid("subtask_a", 1, NOW.getTime() - 1000));
    const r = await evaluateBids(deps, state, { subtaskId: "subtask_a" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("all_bids_expired");
  });

  it("happy path: cheapest policy selects the lowest-cost bid and reserves budget", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate({ maxChainCostUsd: 10 }));
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
      createdAt: NOW.toISOString(),
    });
    state.bids.set("subtask_a::expensive", bid("subtask_a", 3));
    state.bids.set("subtask_a::cheap", bid("subtask_a", 1));
    const r = await evaluateBids(deps, state, { subtaskId: "subtask_a", policy: "cheapest" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bid.workerPeerId).toBe("12D3KooW-w-subtask_a-1");
    expect(r.round).toBe(1);
    expect(r.award.acceptedCostUsd).toBe(1);
    // The reservation is committed (tryCommit was called).
    expect(state.ledger.snapshot().committedUsd).toBe(1);
  });

  it("max_rounds_exceeded after 3 evaluations on the same subtask", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate({ maxChainCostUsd: 30 }));
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
      createdAt: NOW.toISOString(),
    });
    // First three rounds succeed; the fourth returns max_rounds_exceeded.
    for (let i = 1; i <= 3; i++) {
      state.bids.set(`subtask_a::w-${i}-${i}`, bid("subtask_a", i));
      const r = await evaluateBids(deps, state, { subtaskId: "subtask_a" });
      // Diagnostic: surface the round that fails.
      if (!r.ok) throw new Error(`round ${i} failed: ${JSON.stringify(r)}`);
      expect(r.ok).toBe(true);
    }
    const r = await evaluateBids(deps, state, { subtaskId: "subtask_a" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("max_rounds_exceeded");
  });

  it("budget_exceeded when reservation would push aggregate past the cap", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate({ maxChainCostUsd: 2 }));
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
      createdAt: NOW.toISOString(),
    });
    state.bids.set("subtask_a::expensive", bid("subtask_a", 5));
    const r = await evaluateBids(deps, state, { subtaskId: "subtask_a" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("budget_exceeded");
  });
});

describe("trackChain", () => {
  it("sends heartbeats for each awarded subtask", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      negotiationRound: 1,
      acceptedCostUsd: 1,
      deadlineAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
    });
    state.awards.set("subtask_b", {
      version: "0.1",
      subtaskId: "subtask_b",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w2",
      negotiationRound: 1,
      acceptedCostUsd: 1,
      deadlineAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
    });
    const r = await trackChain(deps, state, { tickMs: 1, maxTicks: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inFlight.length).toBe(2);
    // Heartbeat envelopes: 2 awards × 1 tick = 2 envelopes
    const heartbeats = deps.sentEnvelopes.filter((e) => e.envelope.intent === "task.chain.heartbeat");
    expect(heartbeats.length).toBe(2);
  });

  it("Phase 47 — skips heartbeats and stall reassign for sealed subtask ids", async () => {
    const deps = makeDeps({
      now: () => new Date("2026-06-18T00:05:00.000Z"),
    });
    const state = createChainState({
      ...mandate({ stallTimeoutMs: 1_000 }),
    });
    const { createIterationState } = await import("../src/chain-iteration.js");
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 2,
      openRoundSubtaskIds: ["subtask_open"],
    });
    state.iteration.sealedByRound[1] = ["subtask_sealed"];

    for (const id of ["subtask_sealed", "subtask_open"] as const) {
      state.awards.set(id, {
        version: "0.1",
        subtaskId: id,
        chainId: "chain_test-1",
        workerPeerId: id === "subtask_sealed" ? "12D3KooW-sealed" : "12D3KooW-open",
        negotiationRound: 1,
        acceptedCostUsd: 1,
        deadlineAt: NOW.toISOString(),
        createdAt: NOW.toISOString(),
      });
      // Age both awards past stall timeout; sealed must still be ignored.
      state.awardedAt.set(id, "2026-06-18T00:00:00.000Z");
      state.workersBySubtask.set(id, [
        id === "subtask_sealed" ? "12D3KooW-sealed" : "12D3KooW-open",
        "12D3KooW-backup",
      ]);
    }

    const r = await trackChain(deps, state, { tickMs: 1, maxTicks: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Only the open (unsealed) award is in-flight / heartbeated.
    expect(r.inFlight).toEqual(["subtask_open"]);
    const heartbeats = deps.sentEnvelopes.filter((e) => e.envelope.intent === "task.chain.heartbeat");
    expect(heartbeats).toHaveLength(1);
    expect(heartbeats[0]!.recipientPeerId).toBe("12D3KooW-open");
    // Sealed id must not be reassigned even though stalled.
    expect(state.reassignCount.get("subtask_sealed") ?? 0).toBe(0);
  });
});

describe("synthesizeChain", () => {
  it("returns no_contributions when no subtasks have produced partials", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    const r = await synthesizeChain(deps, state, "concatenate");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect((r as { reason: string }).reason).toBe("no_contributions");
  });

  it("happy path: collects partials and returns a report", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      negotiationRound: 1,
      acceptedCostUsd: 1,
      deadlineAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
    });
    state.partials.set(
      "subtask_a",
      TaskChainPartialPayloadSchema.parse({
        partial: ChainSubtaskPartialSchema.parse({
          version: "0.1",
          subtaskId: "subtask_a",
          chainId: "chain_test-1",
          workerPeerId: "12D3KooW-w1",
          seq: 1,
          isFinal: true,
          note: "first partial",
          createdAt: NOW.toISOString(),
        }),
      }),
    );
    const r = await synthesizeChain(deps, state, "concatenate");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.chainSummary.subtaskCount).toBe(1);
  });
});

describe("publishChainReport", () => {
  it("sends the report to the owner and finalizes the ledger", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    // Set up ledger state so finalize() can verify the report matches.
    await state.ledger.reserve("subtask_a", "12D3KooW-w1", 1);
    await state.ledger.tryCommit("subtask_a");
    const report = {
      version: "0.1" as const,
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      orchestratorOwnerId: "envoy:owner:orchestrator",
      orchestratorPeerId: "12D3KooW-orchestrator",
      pinned: false,
      chainSummary: {
        durationMs: 0,
        subtaskCount: 1,
        workerCount: 1,
        workerAllocations: [
          { subtaskId: "subtask_a", workerPeerId: "12D3KooW-w1", committedUsd: 1 },
        ],
        synthesisCostUsd: 0,
      },
      executiveSummary: "Done.",
      sections: [],
      recipientRoles: ["human"] as ("human" | "agent" | "system")[],
      createdAt: NOW.toISOString(),
    };
    const r = await publishChainReport(deps, state, report, "owner_peer");
    expect(r.ok).toBe(true);
    expect(state.published).toBe(true);
    expect(deps.storedReports.length).toBe(1);
    expect(deps.sentEnvelopes.length).toBe(1);
    expect(deps.sentEnvelopes[0].envelope.intent).toBe("task.chain.report");
    expect(state.ledger.isFinalized()).toBe(true);
  });

  it("refuses to publish a second time", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    await state.ledger.reserve("subtask_a", "12D3KooW-w1", 1);
    await state.ledger.tryCommit("subtask_a");
    const report = {
      version: "0.1" as const,
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      orchestratorOwnerId: "envoy:owner:orchestrator",
      orchestratorPeerId: "12D3KooW-orchestrator",
      pinned: false,
      chainSummary: {
        durationMs: 0,
        subtaskCount: 1,
        workerCount: 1,
        workerAllocations: [
          { subtaskId: "subtask_a", workerPeerId: "12D3KooW-w1", committedUsd: 1 },
        ],
        synthesisCostUsd: 0,
      },
      executiveSummary: "Done.",
      sections: [],
      recipientRoles: ["human"] as ("human" | "agent" | "system")[],
      createdAt: NOW.toISOString(),
    };
    expect((await publishChainReport(deps, state, report, "owner_peer")).ok).toBe(true);
    const second = await publishChainReport(deps, state, report, "owner_peer");
    expect(second.ok).toBe(false);
  });

  it("returns handler_denied when the report's numbers do not match the ledger", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    // Do NOT reserve anything — report claims 1 USD committed but ledger has 0.
    const report = {
      version: "0.1" as const,
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      orchestratorOwnerId: "envoy:owner:orchestrator",
      orchestratorPeerId: "12D3KooW-orchestrator",
      pinned: false,
      chainSummary: {
        durationMs: 0,
        subtaskCount: 1,
        workerCount: 1,
        workerAllocations: [
          { subtaskId: "subtask_a", workerPeerId: "12D3KooW-w1", committedUsd: 1 },
        ],
        synthesisCostUsd: 0,
      },
      executiveSummary: "Done.",
      sections: [],
      recipientRoles: ["human"] as ("human" | "agent" | "system")[],
      createdAt: NOW.toISOString(),
    };
    const r = await publishChainReport(deps, state, report, "owner_peer");
    expect(r.ok).toBe(false);
    expect(state.published).toBe(false);
  });
});

describe("handleOrchestratorMerge", () => {
  it("cancel-then-merge: releases budget, removes old subtasks, adds the merged one", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    state.subtasks.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "a",
      requestedResult: "r",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    state.subtasks.set("subtask_b", {
      version: "0.1",
      subtaskId: "subtask_b",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "b",
      requestedResult: "r",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    await state.ledger.reserve("subtask_a", "12D3KooW-w1", 1);
    await state.ledger.tryCommit("subtask_a");
    state.awards.set("subtask_a", {
      version: "0.1",
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      negotiationRound: 1,
      acceptedCostUsd: 1,
      deadlineAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
    });
    const mergedSubtask = {
      version: "0.1" as const,
      subtaskId: "subtask_merged",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 2,
      requiredSkill: "task.execute",
      objective: "merged",
      requestedResult: "r",
      constraints: [],
      dependsOn: ["subtask_a", "subtask_b"],
      createdAt: NOW.toISOString(),
    };
    const envelope = {
      version: "0.1" as const,
      messageId: "m",
      createdAt: NOW.toISOString(),
      senderPeerId: "12D3KooW-sender",
      senderPublicKey: keyPair.publicKey,
      senderRole: "agent" as const,
      recipientPeerId: "12D3KooW-us",
      recipientRole: "agent" as const,
      intent: "task.chain.merge" as const,
      payload: {
        chainId: "chain_test-1",
        mergingSubtaskIds: ["subtask_a", "subtask_b"],
        newSubtask: mergedSubtask,
        awardedWorkerPeerId: "12D3KooW-w1",
        mergeCostUsd: 1,
        createdAt: NOW.toISOString(),
      },
      signature: "stub",
    };
    void signCanonicalPayload;
    const r = await handleOrchestratorMerge(
      deps,
      envelope as EnvoyEnvelope,
      envelope.payload as never,
      state,
    );
    expect(r.ok).toBe(true);
    // Old subtasks are gone.
    expect(state.subtasks.has("subtask_a")).toBe(false);
    expect(state.subtasks.has("subtask_b")).toBe(false);
    expect(state.subtasks.has("subtask_merged")).toBe(true);
    // Cancelled tracking was added.
    expect(state.cancelledSubtasks.has("subtask_a")).toBe(true);
    expect(state.cancelledSubtasks.has("subtask_b")).toBe(true);
  });
});

describe("sendChainAccept / sendChainPropose", () => {
  it("sendChainPropose signs and dispatches a task.chain.propose envelope", async () => {
    const deps = makeDeps();
    const subtask = {
      version: "0.1" as const,
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "x",
      requestedResult: "r",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    };
    const ok = await sendChainPropose(deps, "12D3KooW-w1", subtask, mandate());
    expect(ok).toBe(true);
    expect(deps.sentEnvelopes.length).toBe(1);
    expect(deps.sentEnvelopes[0].envelope.intent).toBe("task.chain.propose");
    expect(deps.sentEnvelopes[0].envelope.signature.length).toBeGreaterThan(0);
  });

  it("sendChainAccept signs and dispatches a task.chain.accept envelope", async () => {
    const deps = makeDeps();
    const award = {
      version: "0.1" as const,
      subtaskId: "subtask_a",
      chainId: "chain_test-1",
      workerPeerId: "12D3KooW-w1",
      negotiationRound: 1,
      acceptedCostUsd: 1,
      deadlineAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
    };
    const ok = await sendChainAccept(deps, "12D3KooW-w1", award);
    expect(ok).toBe(true);
    expect(deps.sentEnvelopes[0].envelope.intent).toBe("task.chain.accept");
  });
});