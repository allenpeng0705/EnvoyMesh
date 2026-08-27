/**
 * Phase 60E — dual-award wire path: launch speculative sibling, select finals,
 * cancel losers, retain late finals without overwrite.
 */
import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { ChainMandateSignedSchema, ChainSubtaskSchema } from "@envoymesh/protocol";
import {
  createChainState,
  directAwardSubtask,
  handleOrchestratorPartial,
  type ChainOrchestratorHandlerDeps,
} from "../src/chain-orchestrator.js";
import {
  maybeLaunchDueHedgedAwards,
} from "../src/chain-speculation-wire.js";
import { speculativeLedgerKey } from "../src/chain-speculation.js";

const NOW = new Date("2030-01-01T00:00:00.000Z");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function makeDeps() {
  const sent: Array<{ recipientPeerId: string; intent: string; payload: unknown }> = [];
  const deps: ChainOrchestratorHandlerDeps = {
    sendEnvelope: async (recipientPeerId, envelope, payload) => {
      sent.push({ recipientPeerId, intent: envelope.intent, payload });
      return true;
    },
    findWorkers: async () => ["worker_a", "worker_b"],
    now: () => NOW,
    signingKeyPem: privateKeyPem,
    publicKeyPem,
    orchestratorPeerId: "orch_1",
    orchestratorOwnerId: "envoy:owner:orch",
    audit: { record: () => undefined },
  };
  return { deps, sent };
}

function makeSpecState() {
  const mandate = ChainMandateSignedSchema.parse({
    version: "0.1",
    chainMandateId: "chainmandate_wire_1",
    chainId: "chain_wire_1",
    issuerOwnerId: "envoy:owner:orch",
    orchestratorOwnerId: "envoy:owner:orch",
    maxChainCostUsd: 20,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: "2030-01-02T00:00:00.000Z",
    createdAt: "2030-01-01T00:00:00.000Z",
    signature: "stub",
    criticality: "high",
    maxParallelAttemptsPerStep: 2,
    teamStrategyId: "highest-confidence",
    speculationEnabled: true,
  });
  const state = createChainState(mandate, { awardMode: "direct", goal: "speculate wire" });
  const subtask = ChainSubtaskSchema.parse({
    version: "0.1",
    subtaskId: "subtask_1",
    chainId: "chain_wire_1",
    chainMandateId: "chainmandate_wire_1",
    depth: 1,
    requiredSkill: "research",
    objective: "answer",
    requestedResult: "text",
    constraints: [],
    dependsOn: [],
    costCeilingUsd: 3,
    deadlineAt: "2030-01-02T00:00:00.000Z",
    createdAt: "2030-01-01T00:00:00.000Z",
    preferredWorkerPeerId: "worker_a",
  });
  state.subtasks.set("subtask_1", subtask);
  state.workersBySubtask.set("subtask_1", ["worker_a", "worker_b"]);
  state.proposedSubtasks.add("subtask_1");
  return state;
}

function finalPartial(workerPeerId: string, note: string, costHint?: number) {
  void costHint;
  return {
    partial: {
      version: "0.1" as const,
      subtaskId: "subtask_1",
      chainId: "chain_wire_1",
      workerPeerId,
      seq: 1,
      isFinal: true,
      note,
      confidence: 0.9,
      createdAt: NOW.toISOString(),
    },
  };
}

describe("chain speculation wire path", () => {
  it("dual-awards speculative sibling, selects cheaper equivalent, cancels loser", async () => {
    const { deps, sent } = makeDeps();
    const state = makeSpecState();

    const awarded = await directAwardSubtask(deps, state, "subtask_1", "worker_a");
    expect(awarded.ok).toBe(true);
    expect(state.speculativeAwards.get("subtask_1")?.workerPeerId).toBe("worker_b");
    expect(state.ledger.snapshot().workerAllocations.has(speculativeLedgerKey("subtask_1"))).toBe(
      true,
    );
    const accepts = sent.filter((s) => s.intent === "task.chain.accept");
    expect(accepts.length).toBeGreaterThanOrEqual(2);

    // Primary finals first — wait for sibling.
    const envA = {
      senderPeerId: "worker_a",
      correlationId: "chain_wire_1",
    } as Parameters<typeof handleOrchestratorPartial>[1];
    await handleOrchestratorPartial(deps, envA, finalPartial("worker_a", "same answer"), state);
    expect(state.speculationLocked.has("subtask_1")).toBe(false);

    // Speculative cheaper attempt (acceptedCostUsd from dual award).
    const speculative = [...state.attempts.values()].find((a) => a.role === "speculative")!;
    speculative.acceptedCostUsd = 1;
    const primary = [...state.attempts.values()].find((a) => a.role === "primary")!;
    primary.acceptedCostUsd = 3;

    const envB = {
      senderPeerId: "worker_b",
      correlationId: "chain_wire_1",
    } as Parameters<typeof handleOrchestratorPartial>[1];
    await handleOrchestratorPartial(deps, envB, finalPartial("worker_b", "same answer"), state);

    expect(state.speculationLocked.has("subtask_1")).toBe(true);
    expect(state.selectedAttemptBySubtask.get("subtask_1")).toBe(speculative.attemptId);
    expect(state.partials.get("subtask_1")?.partial.workerPeerId).toBe("worker_b");
    expect(state.awards.get("subtask_1")?.workerPeerId).toBe("worker_b");
    const cancels = sent.filter((s) => s.intent === "task.chain.cancel");
    expect(cancels.some((c) => c.recipientPeerId === "worker_a")).toBe(true);
  });

  it("retains late finals without replacing the selected artifact", async () => {
    const { deps } = makeDeps();
    const state = makeSpecState();
    await directAwardSubtask(deps, state, "subtask_1", "worker_a");

    const speculative = [...state.attempts.values()].find((a) => a.role === "speculative")!;
    speculative.acceptedCostUsd = 1;
    const primary = [...state.attempts.values()].find((a) => a.role === "primary")!;
    primary.acceptedCostUsd = 3;

    const envA = { senderPeerId: "worker_a", correlationId: "c" } as Parameters<
      typeof handleOrchestratorPartial
    >[1];
    const envB = { senderPeerId: "worker_b", correlationId: "c" } as Parameters<
      typeof handleOrchestratorPartial
    >[1];
    await handleOrchestratorPartial(deps, envA, finalPartial("worker_a", "same answer"), state);
    await handleOrchestratorPartial(deps, envB, finalPartial("worker_b", "same answer"), state);
    expect(state.partials.get("subtask_1")?.partial.workerPeerId).toBe("worker_b");

    await handleOrchestratorPartial(
      deps,
      envA,
      {
        partial: {
          ...finalPartial("worker_a", "LATE DIFFERENT ANSWER").partial,
          seq: 2,
          note: "LATE DIFFERENT ANSWER",
        },
      },
      state,
    );
    expect(state.partials.get("subtask_1")?.partial.note).toBe("same answer");
    expect(state.partials.get("subtask_1")?.partial.workerPeerId).toBe("worker_b");
    const late = state.partialsByAttempt.get(primary.attemptId);
    expect(late?.partial.note).toBe("LATE DIFFERENT ANSWER");
  });

  it("times out waiting_sibling and selects the available final", async () => {
    let nowMs = Date.parse("2030-01-01T00:00:00.000Z");
    const sent: Array<{ recipientPeerId: string; intent: string }> = [];
    const deps: ChainOrchestratorHandlerDeps = {
      sendEnvelope: async (recipientPeerId, envelope) => {
        sent.push({ recipientPeerId, intent: envelope.intent });
        return true;
      },
      findWorkers: async () => ["worker_a", "worker_b"],
      now: () => new Date(nowMs),
      signingKeyPem: privateKeyPem,
      publicKeyPem,
      orchestratorPeerId: "orch_1",
      orchestratorOwnerId: "envoy:owner:orch",
      audit: { record: () => undefined },
    };
    const state = makeSpecState();
    state.chainMandate = {
      ...state.chainMandate,
      stallTimeoutMs: 5_000,
    };
    await directAwardSubtask(deps, state, "subtask_1", "worker_a");
    expect(state.speculativeAwards.has("subtask_1")).toBe(true);

    const envA = {
      senderPeerId: "worker_a",
      correlationId: "chain_wire_1",
    } as Parameters<typeof handleOrchestratorPartial>[1];
    await handleOrchestratorPartial(deps, envA, finalPartial("worker_a", "solo answer"), state);
    expect(state.speculationLocked.has("subtask_1")).toBe(false);

    nowMs += 6_000;
    await handleOrchestratorPartial(deps, envA, finalPartial("worker_a", "solo answer"), state);
    expect(state.speculationLocked.has("subtask_1")).toBe(true);
    expect(state.speculativeAwards.has("subtask_1")).toBe(false);
    expect(sent.some((s) => s.intent === "task.chain.cancel" && s.recipientPeerId === "worker_b")).toBe(
      true,
    );
  });

  it("disagree_needs_verify does not lock or cancel losers", async () => {
    const { deps } = makeDeps();
    const state = makeSpecState();
    // Phase 63 — when the owner opts in to "block" on disagreement, the
    // wire path returns the disagreement reason and the chain pauses.
    // (Default is "auto", which would auto-pick and lock instead.)
    state.chainMandate = {
      ...state.chainMandate,
      speculationOnDisagreement: "block",
    };
    await directAwardSubtask(deps, state, "subtask_1", "worker_a");

    const envA = { senderPeerId: "worker_a", correlationId: "c" } as Parameters<
      typeof handleOrchestratorPartial
    >[1];
    const envB = { senderPeerId: "worker_b", correlationId: "c" } as Parameters<
      typeof handleOrchestratorPartial
    >[1];
    await handleOrchestratorPartial(deps, envA, finalPartial("worker_a", "answer A"), state);
    await handleOrchestratorPartial(deps, envB, finalPartial("worker_b", "answer B"), state);

    expect(state.speculationLocked.has("subtask_1")).toBe(false);
    expect(state.speculativeAwards.has("subtask_1")).toBe(true);
    const finals = [...state.attempts.values()].filter(
      (a) => a.subtaskId === "subtask_1" && a.state === "final_received",
    );
    expect(finals.length).toBe(2);
  });

  it("stall reassign clears speculative sibling award", async () => {
    const { deps, sent } = makeDeps();
    const state = makeSpecState();
    await directAwardSubtask(deps, state, "subtask_1", "worker_a");
    expect(state.speculativeAwards.has("subtask_1")).toBe(true);

    // Prevent dual-award relaunch on the replacement worker.
    state.chainMandate = {
      ...state.chainMandate,
      maxParallelAttemptsPerStep: 1,
    };
    state.workersBySubtask.set("subtask_1", ["worker_a", "worker_b", "worker_c"]);
    const { reassignStalledSubtask } = await import("../src/chain-orchestrator.js");
    const result = await reassignStalledSubtask(deps, state, "subtask_1");
    expect(result.ok).toBe(true);
    expect(state.speculativeAwards.has("subtask_1")).toBe(false);
    expect(
      sent.some((s) => s.intent === "task.chain.cancel" && s.recipientPeerId === "worker_b"),
    ).toBe(true);
  });

  it("hedged strategy schedules sibling after delay, not at award time", async () => {
    let nowMs = Date.parse("2030-01-01T00:00:00.000Z");
    const { deps, sent } = makeDeps();
    deps.now = () => new Date(nowMs);

    const mandate = ChainMandateSignedSchema.parse({
      version: "0.1",
      chainMandateId: "chainmandate_hedge_1",
      chainId: "chain_hedge_1",
      issuerOwnerId: "envoy:owner:orch",
      orchestratorOwnerId: "envoy:owner:orch",
      maxChainCostUsd: 20,
      costCeilingUsd: 3,
      maxWorkers: 3,
      allowDepth3: false,
      maxSensitivity: "public",
      deadlineAt: "2030-01-02T00:00:00.000Z",
      createdAt: "2030-01-01T00:00:00.000Z",
      signature: "stub",
      criticality: "high",
      maxParallelAttemptsPerStep: 2,
      teamStrategyId: "fastest",
      speculationEnabled: true,
    });
    const state = createChainState(mandate, { awardMode: "direct", goal: "hedge wire" });
    const subtask = ChainSubtaskSchema.parse({
      version: "0.1",
      subtaskId: "subtask_1",
      chainId: "chain_hedge_1",
      chainMandateId: "chainmandate_hedge_1",
      depth: 1,
      requiredSkill: "research",
      objective: "answer",
      requestedResult: "text",
      constraints: [],
      dependsOn: [],
      costCeilingUsd: 3,
      deadlineAt: "2030-01-02T00:00:00.000Z",
      createdAt: "2030-01-01T00:00:00.000Z",
      preferredWorkerPeerId: "worker_a",
    });
    state.subtasks.set("subtask_1", subtask);
    state.workersBySubtask.set("subtask_1", ["worker_a", "worker_b"]);
    state.proposedSubtasks.add("subtask_1");

    const awarded = await directAwardSubtask(deps, state, "subtask_1", "worker_a");
    expect(awarded.ok).toBe(true);
    expect(state.speculativeAwards.has("subtask_1")).toBe(false);
    expect(state.hedgeSchedule.has("subtask_1")).toBe(true);
    const hedgeRow = state.hedgeSchedule.get("subtask_1")!;
    expect(hedgeRow.hedgeAfterMs).toBe(37_500);

    const acceptsBefore = sent.filter((s) => s.intent === "task.chain.accept").length;
    expect(acceptsBefore).toBe(1);

    nowMs += 10_000;
    const early = await maybeLaunchDueHedgedAwards(deps, state);
    expect(early.every((r) => !r.launched)).toBe(true);
    expect(state.speculativeAwards.has("subtask_1")).toBe(false);

    nowMs += 30_000;
    const launched = await maybeLaunchDueHedgedAwards(deps, state);
    expect(launched.some((r) => r.launched)).toBe(true);
    expect(state.speculativeAwards.get("subtask_1")?.workerPeerId).toBe("worker_b");
    expect(sent.filter((s) => s.intent === "task.chain.accept").length).toBe(2);
  });

  it("auto mode disagree picks cheaper verified final and locks", async () => {
    const { deps } = makeDeps();
    const state = makeSpecState();
    state.chainMandate = {
      ...state.chainMandate,
      speculationOnDisagreement: "auto",
    };
    await directAwardSubtask(deps, state, "subtask_1", "worker_a");

    const speculative = [...state.attempts.values()].find((a) => a.role === "speculative")!;
    speculative.acceptedCostUsd = 1;
    const primary = [...state.attempts.values()].find((a) => a.role === "primary")!;
    primary.acceptedCostUsd = 5;

    const envA = { senderPeerId: "worker_a", correlationId: "c" } as Parameters<
      typeof handleOrchestratorPartial
    >[1];
    const envB = { senderPeerId: "worker_b", correlationId: "c" } as Parameters<
      typeof handleOrchestratorPartial
    >[1];
    await handleOrchestratorPartial(deps, envA, finalPartial("worker_a", "answer A"), state);
    await handleOrchestratorPartial(deps, envB, finalPartial("worker_b", "answer B"), state);

    expect(state.speculationLocked.has("subtask_1")).toBe(true);
    expect(state.selectedAttemptBySubtask.get("subtask_1")).toBe(speculative.attemptId);
    expect(state.partials.get("subtask_1")?.partial.workerPeerId).toBe("worker_b");
  });

  it("auto mode none_pass reassigns the step on the wire", async () => {
    const { deps, sent } = makeDeps();
    const state = makeSpecState();
    state.chainMandate = {
      ...state.chainMandate,
      speculationOnDisagreement: "auto",
    };
    deps.chainVerify = {
      getVerdictForWorker: (_chainId, _subtaskId, _workerPeerId) => {
        const finals = [...state.attempts.values()].filter(
          (attempt) =>
            attempt.subtaskId === "subtask_1" &&
            (attempt.state === "final_received" || attempt.state === "selected"),
        );
        if (finals.length < 2) return undefined;
        return { kind: "fail", score: 0 };
      },
    };
    await directAwardSubtask(deps, state, "subtask_1", "worker_a");

    const envA = { senderPeerId: "worker_a", correlationId: "c" } as Parameters<
      typeof handleOrchestratorPartial
    >[1];
    const envB = { senderPeerId: "worker_b", correlationId: "c" } as Parameters<
      typeof handleOrchestratorPartial
    >[1];
    await handleOrchestratorPartial(deps, envA, finalPartial("worker_a", "answer A"), state);
    await handleOrchestratorPartial(deps, envB, finalPartial("worker_b", "answer B"), state);

    expect(state.speculationLocked.has("subtask_1")).toBe(false);
    expect(state.awards.get("subtask_1")?.workerPeerId).toBe("worker_b");
    expect(state.awards.get("subtask_1")?.workerPeerId).not.toBe("worker_a");
    expect(
      sent.some((s) => s.intent === "task.chain.cancel" && s.recipientPeerId === "worker_a"),
    ).toBe(true);
  });
});
