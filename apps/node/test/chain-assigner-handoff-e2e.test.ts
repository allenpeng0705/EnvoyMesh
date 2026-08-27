/**
 * Remote Assigner handoff E2E (libp2p).
 *
 * Trigger home starts a Team job with `assignerPeerId` pointing at another
 * Agent Network peer. That peer receives `task.chain.handoff` (goal), runs
 * plan+assign+merge locally, and publishes the chain report under the same
 * chainId.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  waitForPhase13,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import {
  applySharedPlanAssignAi,
  bondAndExchangeCards,
  enableAgentNetworkWorker,
  wireHomeAsChainParticipant,
} from "./chain-plan-assign-e2e-helpers.js";

const nodes: Phase13TestNode[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

describe.sequential("E2E remote Assigner handoff (libp2p)", () => {
  it("trigger hands off goal; Assigner plans and publishes report on same chainId", async () => {
    const trigger = await createPhase13TestNode();
    const assigner = await createPhase13TestNode();
    const worker = await createPhase13TestNode();
    nodes.push(trigger, assigner, worker);

    await wireHomeAsChainParticipant(trigger);
    await wireHomeAsChainParticipant(assigner);
    await wireHomeAsChainParticipant(worker);

    await enableAgentNetworkWorker(trigger, {
      displayName: "Trigger",
      membership: ["task.execute", "chain.orchestrate", "agent-network-worker"],
      profile: {
        modelFreshness: 5,
        spendPosture: "subscription",
        contextWindow: "128k",
        skills: ["task.execute"],
        throughputTokensPerSec: 20,
      },
    });
    const assignerPeerId = await enableAgentNetworkWorker(assigner, {
      displayName: "Assigner",
      membership: ["task.execute", "chain.orchestrate", "agent-network-worker"],
      profile: {
        modelFreshness: 8,
        spendPosture: "subscription",
        contextWindow: "512k",
        skills: ["task.execute"],
        throughputTokensPerSec: 50,
      },
    });
    await enableAgentNetworkWorker(worker, {
      displayName: "Worker",
      membership: ["task.execute", "coding", "research.web", "agent-network-worker"],
      profile: {
        modelFreshness: 9,
        spendPosture: "metered",
        contextWindow: "1M+",
        skills: ["coding", "research.web"],
        throughputTokensPerSec: 80,
      },
    });

    // Full mesh bonds so trigger can see Assigner as eligible, and Assigner
    // can see Worker (and Trigger) for the roster after handoff.
    await bondAndExchangeCards(trigger, assigner, "Trigger", "Assigner");
    await bondAndExchangeCards(assigner, worker, "Assigner", "Worker");
    await bondAndExchangeCards(trigger, worker, "Trigger", "Worker");

    await trigger.service.refreshAgentNetworkMembershipIndex();
    await assigner.service.refreshAgentNetworkMembershipIndex();

    const started = await trigger.service.chainStartFromGoal({
      goal: "Research then draft a coded summary and merge into one final answer",
      allowLlm: true,
      assignerPeerId,
      iterationMaxRounds: 2,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;
    expect(started.handedOff).toBe(true);
    expect(started.assignerPeerId).toBe(assignerPeerId);
    expect(started.subtasks ?? []).toHaveLength(0);

    const chainId = started.chainId;

    // Assigner eventually materializes subtasks for the handed-off chainId
    // and inherits iterationMaxRounds from the handoff payload (Phase 47D).
    await waitForPhase13(async () => {
      const state = await assigner.service.chainGetState({ chainId });
      return state.subtaskCount >= 1 && (state.iteration?.maxRounds ?? 0) >= 2;
    }, 45_000);

    const live = await assigner.service.chainGetState({ chainId });
    expect(live.iteration?.maxRounds).toBe(2);
    expect(live.iteration?.round).toBeGreaterThanOrEqual(1);

    await waitForPhase13(async () => {
      const report = await assigner.service.chainGetReport({ chainId });
      return report.report != null;
    }, 90_000);

    const report = await assigner.service.chainGetReport({ chainId });
    expect(report.report?.chainId).toBe(chainId);
    expect(report.report?.executiveSummary?.length).toBeGreaterThan(0);

    // Trigger kept the correlation goal; it does not own the runtime awards.
    const triggerState = await trigger.service.chainGetState({ chainId });
    expect(triggerState.subtaskCount).toBe(0);
  }, 180_000);

  it("mid-job iterationState rehydrates drafts/round on live Assigner handoff", async () => {
    const trigger = await createPhase13TestNode();
    const assigner = await createPhase13TestNode();
    const worker = await createPhase13TestNode();
    nodes.push(trigger, assigner, worker);

    await wireHomeAsChainParticipant(trigger);
    await wireHomeAsChainParticipant(assigner);
    await wireHomeAsChainParticipant(worker);

    await enableAgentNetworkWorker(trigger, {
      displayName: "Trigger",
      membership: ["task.execute", "chain.orchestrate", "agent-network-worker"],
      profile: {
        modelFreshness: 5,
        spendPosture: "subscription",
        contextWindow: "128k",
        skills: ["task.execute"],
        throughputTokensPerSec: 20,
      },
    });
    const assignerPeerId = await enableAgentNetworkWorker(assigner, {
      displayName: "Assigner",
      membership: ["task.execute", "chain.orchestrate", "agent-network-worker"],
      profile: {
        modelFreshness: 8,
        spendPosture: "subscription",
        contextWindow: "512k",
        skills: ["task.execute"],
        throughputTokensPerSec: 50,
      },
    });
    await enableAgentNetworkWorker(worker, {
      displayName: "Worker",
      membership: ["task.execute", "coding", "research.web", "agent-network-worker"],
      profile: {
        modelFreshness: 9,
        spendPosture: "metered",
        contextWindow: "1M+",
        skills: ["coding", "research.web"],
        throughputTokensPerSec: 80,
      },
    });

    await bondAndExchangeCards(trigger, assigner, "Trigger", "Assigner");
    await bondAndExchangeCards(assigner, worker, "Assigner", "Worker");
    await bondAndExchangeCards(trigger, worker, "Trigger", "Worker");
    await trigger.service.refreshAgentNetworkMembershipIndex();
    await assigner.service.refreshAgentNetworkMembershipIndex();

    const midJobBlob = {
      round: 2,
      maxRounds: 2,
      extendsInRound: 0,
      maxExtendsInRound: 0,
      extendMaxDepth: 3,
      extendOnlyAfterPartial: true,
      sealedByRound: { "1": ["subtask_prior_sealed_from_handoff"] },
      openRoundSubtaskIds: [] as string[],
      drafts: [
        {
          round: 1,
          summary: "MID_JOB_DRAFT_FROM_HANDOFF prior assigner sealed round 1",
          judgeDecision: "continue",
          judgeReason: "handed off mid-loop",
        },
      ],
      judgeMode: "always_stop" as const,
      carryMode: "summary" as const,
      goal: "Research then draft a coded summary and merge into one final answer",
      waitingForOwner: false,
    };

    const started = await trigger.service.chainStartFromGoal({
      goal: midJobBlob.goal,
      allowLlm: true,
      assignerPeerId,
      iterationMaxRounds: 2,
      iterationJudgeMode: "always_stop",
      extendMaxStepsPerRound: 0,
      iterationState: midJobBlob,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;
    expect(started.handedOff).toBe(true);
    const chainId = started.chainId;

    // Assigner rehydrates the prior draft before/while launching the open round.
    await waitForPhase13(async () => {
      const state = await assigner.service.chainGetState({ chainId });
      return (
        (state.iteration?.drafts?.some((d) => d.summary.includes("MID_JOB_DRAFT_FROM_HANDOFF")) ??
          false) &&
        state.iteration?.round === 2 &&
        state.iteration?.maxRounds === 2
      );
    }, 45_000);

    const live = await assigner.service.chainGetState({ chainId });
    expect(live.iteration?.drafts[0]?.summary).toContain("MID_JOB_DRAFT_FROM_HANDOFF");
    expect(live.iteration?.drafts[0]?.judgeDecision).toBe("continue");
    expect(live.iteration?.round).toBe(2);

    await waitForPhase13(async () => {
      const report = await assigner.service.chainGetReport({ chainId });
      return report.report != null;
    }, 90_000);

    const final = await assigner.service.chainGetState({ chainId });
    expect(final.published).toBe(true);
    // Prior handoff draft + round-2 seal draft.
    expect(final.iteration?.drafts.length).toBeGreaterThanOrEqual(2);
    expect(final.iteration?.drafts[0]?.summary).toContain("MID_JOB_DRAFT_FROM_HANDOFF");
  }, 180_000);

  it("best_capable auto-selects remote Assigner when creator model is weaker", async () => {
    const trigger = await createPhase13TestNode();
    const assigner = await createPhase13TestNode();
    const worker = await createPhase13TestNode();
    nodes.push(trigger, assigner, worker);

    await wireHomeAsChainParticipant(trigger);
    await wireHomeAsChainParticipant(assigner);
    await wireHomeAsChainParticipant(worker);

    await enableAgentNetworkWorker(trigger, {
      displayName: "Weak Creator",
      membership: ["task.execute", "chain.orchestrate", "agent-network-worker"],
      profile: {
        modelFreshness: 3,
        spendPosture: "unknown",
        contextWindow: "128k",
        skills: ["task.execute"],
        throughputTokensPerSec: 10,
      },
    });
    const assignerPeerId = await enableAgentNetworkWorker(assigner, {
      displayName: "Cloud Assigner",
      membership: ["task.execute", "chain.orchestrate", "agent-network-worker"],
      profile: {
        modelFreshness: 9,
        spendPosture: "subscription",
        contextWindow: "1M+",
        skills: ["task.execute"],
        throughputTokensPerSec: 80,
      },
    });
    await enableAgentNetworkWorker(worker, {
      displayName: "Worker",
      membership: ["task.execute", "coding", "research.web", "agent-network-worker"],
      profile: {
        modelFreshness: 7,
        spendPosture: "metered",
        contextWindow: "512k",
        skills: ["coding", "research.web"],
        throughputTokensPerSec: 60,
      },
    });

    await bondAndExchangeCards(trigger, assigner, "Weak Creator", "Cloud Assigner");
    await bondAndExchangeCards(assigner, worker, "Cloud Assigner", "Worker");
    await bondAndExchangeCards(trigger, worker, "Weak Creator", "Worker");
    await trigger.service.refreshAgentNetworkMembershipIndex();
    await assigner.service.refreshAgentNetworkMembershipIndex();

    const preview = await trigger.service.chainPreviewGoal({
      goal: "Research then write a summary report",
      allowLlm: true,
      assignerSelection: "best_capable",
    });
    expect(preview.ok).toBe(true);
    expect(preview.suggestedAssignerPeerId).toBe(assignerPeerId);

    const started = await trigger.service.chainStartFromGoal({
      goal: "Research then write a summary report",
      allowLlm: true,
      assignerSelection: "best_capable",
      extendMaxStepsPerRound: 0,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;
    expect(started.handedOff).toBe(true);
    expect(started.assignerPeerId).toBe(assignerPeerId);

    const chainId = started.chainId;
    // Prove remote Assigner accepted the handoff (full report is covered by the
    // explicit-assignerPeerId cases above; 62C only requires auto-select + send).
    await waitForPhase13(async () => {
      const state = await assigner.service.chainGetState({ chainId });
      return Boolean(state.chainMandateId) || state.subtaskCount >= 1 || state.published;
    }, 45_000);
  }, 120_000);
});
