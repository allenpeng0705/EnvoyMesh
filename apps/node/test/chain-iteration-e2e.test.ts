/**
 * Phase 47 — Team job iteration E2E (libp2p).
 *
 * Deterministic paths (mock roster AI, no live LLM judge):
 *   1. always_stop + maxRounds=2 → one draft, one publish (loop gated off)
 *   2. owner judge → ask_owner hold → Accept publishes once
 *   3. owner judge → Continue → round 2 mesh → two drafts, one publish
 *
 * Run: RUN_E2E=1 npx vitest run apps/node/test/chain-iteration-e2e.test.ts
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

async function meshTwoHomes() {
  const orch = await createPhase13TestNode();
  const worker = await createPhase13TestNode();
  nodes.push(orch, worker);

  await wireHomeAsChainParticipant(orch);
  await wireHomeAsChainParticipant(worker);

  await enableAgentNetworkWorker(orch, {
    displayName: "Orch",
    capabilities: ["task.execute", "chain.orchestrate", "capability-provider"],
    profile: {
      modelFreshness: 5,
      spendPosture: "subscription",
      contextWindow: "128k",
      strengths: ["task.execute"],
      throughputTokensPerSec: 20,
    },
  });
  await enableAgentNetworkWorker(worker, {
    displayName: "Worker",
    capabilities: ["task.execute", "coding", "research.web", "capability-provider"],
    profile: {
      modelFreshness: 9,
      spendPosture: "metered",
      contextWindow: "1M+",
      strengths: ["coding", "research.web"],
      throughputTokensPerSec: 80,
    },
  });

  await bondAndExchangeCards(orch, worker, "Orch", "Worker");
  await orch.service.refreshCapabilityIndex();
  return { orch, worker };
}

describe.sequential("E2E Team job iteration (libp2p)", () => {
  it("always_stop + maxRounds=2 publishes once with a single draft", async () => {
    const { orch } = await meshTwoHomes();
    await applySharedPlanAssignAi(orch, {
      extendMaxStepsPerRound: 0,
    });

    const started = await orch.service.chainStartFromGoal({
      goal: "Research then draft a coded summary and merge into one final answer",
      allowLlm: true,
      iterationMaxRounds: 2,
      iterationJudgeMode: "always_stop",
      extendMaxStepsPerRound: 0,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;
    const chainId = started.chainId;

    await waitForPhase13(async () => {
      const report = await orch.service.chainGetReport({ chainId });
      return report.report != null;
    }, 90_000);

    const state = await orch.service.chainGetState({ chainId });
    expect(state.published).toBe(true);
    expect(state.iteration?.maxRounds).toBe(2);
    expect(state.iteration?.drafts.length).toBe(1);
    expect(state.iteration?.waitingForOwner).not.toBe(true);

    const report = await orch.service.chainGetReport({ chainId });
    expect(report.report?.chainId).toBe(chainId);
    expect(report.report?.executiveSummary?.length).toBeGreaterThan(0);
  }, 180_000);

  it("owner judge: ask_owner hold then Accept publishes once", async () => {
    const { orch } = await meshTwoHomes();
    await applySharedPlanAssignAi(orch, {
      extendMaxStepsPerRound: 0,
    });

    const started = await orch.service.chainStartFromGoal({
      goal: "Research then draft a coded summary and merge into one final answer",
      allowLlm: true,
      iterationMaxRounds: 2,
      iterationJudgeMode: "owner",
      extendMaxStepsPerRound: 0,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;
    const chainId = started.chainId;

    await waitForPhase13(async () => {
      const state = await orch.service.chainGetState({ chainId });
      return state.iteration?.waitingForOwner === true;
    }, 90_000);

    const held = await orch.service.chainGetState({ chainId });
    expect(held.published).toBe(false);
    expect(held.iteration?.drafts.length).toBeGreaterThanOrEqual(1);

    const resolved = await orch.service.chainResolveIteration({
      chainId,
      decision: "stop",
    });
    expect(resolved).toMatchObject({ ok: true });
    expect(resolved.published ?? resolved.ok).toBe(true);

    await waitForPhase13(async () => {
      const report = await orch.service.chainGetReport({ chainId });
      return report.report != null;
    }, 30_000);

    const final = await orch.service.chainGetState({ chainId });
    expect(final.published).toBe(true);
    expect(final.iteration?.waitingForOwner).not.toBe(true);
    expect(final.iteration?.stopReason).toBe("owner_stop");
  }, 180_000);

  it("owner judge: Continue → round 2 → two drafts and one publish", async () => {
    const { orch } = await meshTwoHomes();
    await applySharedPlanAssignAi(orch, {
      extendMaxStepsPerRound: 0,
    });

    const started = await orch.service.chainStartFromGoal({
      goal: "Research then draft a coded summary and merge into one final answer",
      allowLlm: true,
      iterationMaxRounds: 2,
      iterationJudgeMode: "owner",
      extendMaxStepsPerRound: 0,
      maxChainCostUsd: 50,
      costCeilingUsd: 10,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;
    const chainId = started.chainId;

    await waitForPhase13(async () => {
      const state = await orch.service.chainGetState({ chainId });
      return state.iteration?.waitingForOwner === true;
    }, 90_000);

    const held = await orch.service.chainGetState({ chainId });
    expect(held.iteration?.drafts.length).toBe(1);

    const cont = await orch.service.chainResolveIteration({
      chainId,
      decision: "continue",
    });
    expect(cont.ok).toBe(true);
    expect(cont.continued).toBe(true);
    expect(cont.published).not.toBe(true);

    // Round 2: replan → award → partials → seal → auto-stop (maxRounds) → publish.
    await waitForPhase13(async () => {
      const report = await orch.service.chainGetReport({ chainId });
      return report.report != null;
    }, 120_000);

    const state = await orch.service.chainGetState({ chainId });
    expect(state.published).toBe(true);
    expect(state.iteration?.waitingForOwner).not.toBe(true);
    expect(state.iteration?.drafts.length).toBe(2);
    expect(state.iteration?.round).toBe(2);

    const report = await orch.service.chainGetReport({ chainId });
    expect(report.report?.chainId).toBe(chainId);
    const headings = (report.report?.sections ?? []).map((s) => s.heading);
    expect(headings).toContain("Draft 1");
    expect(headings).toContain("Final (round 2)");
  }, 240_000);
});
