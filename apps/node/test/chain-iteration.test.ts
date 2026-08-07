import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";

import type { NodeProfile } from "@envoymesh/local-store";
import {
  ChainSubtaskAwardSchema,
  ChainSubtaskPartialSchema,
  TaskChainPartialPayloadSchema,
} from "@envoymesh/protocol";

import {
  iterationReplanGoal,
  resolveIterationOwnerDecision,
  tryCompleteChainIfReady,
} from "../src/chain-auto-orchestrator.js";
import {
  appendExtendSteps,
  beginNextIterationRound,
  buildIterationPlanGoal,
  canExtendOpenRound,
  canStartNextRound,
  classifyIterationGap,
  createIterationState,
  fromIterationWireBlob,
  heuristicJudgeDecision,
  normalizeJudgeDecision,
  parseIterationJudge,
  sealOpenRound,
  suggestLocalExtendStep,
  toIterationWireBlob,
} from "../src/chain-iteration.js";
import {
  createChainState,
  type ChainOrchestratorHandlerDeps,
} from "../src/chain-orchestrator.js";
import { buildPlanAssignPrompt } from "../src/chain-plan-assign.js";
import { mergeChainDefaults } from "../src/chain-defaults.js";

const NOW = new Date("2026-07-23T00:00:00.000Z");

function mandate(overrides: { maxChainCostUsd?: number; deadlineAt?: string } = {}) {
  return {
    version: "0.1" as const,
    chainMandateId: "chainmandate_iter-1",
    chainId: "chain_iter-1",
    issuerOwnerId: "envoy:owner:orchestrator",
    orchestratorOwnerId: "envoy:owner:orchestrator",
    maxChainCostUsd: overrides.maxChainCostUsd ?? 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public" as const,
    deadlineAt: overrides.deadlineAt ?? "2099-01-01T00:00:00.000Z",
    createdAt: NOW.toISOString(),
    signature: "stub",
  };
}

function makeProfile(): NodeProfile {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  return {
    owner: {
      ownerId: "envoy:owner:test",
      publicKeyPem,
      privateKeyPem: "",
    },
    device: {
      deviceId: "envoy:device:test",
      publicKeyPem,
      privateKeyPem: "",
    },
  } as unknown as NodeProfile;
}

function makeDeps(): ChainOrchestratorHandlerDeps & {
  storedReports: unknown[];
  publishCount: number;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const storedReports: unknown[] = [];
  let publishCount = 0;
  const deps = {
    sendEnvelope: async () => true,
    findWorkers: async () => [],
    now: () => NOW,
    signingKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    orchestratorPeerId: "12D3KooW-orch",
    orchestratorOwnerId: "envoy:owner:orchestrator",
    audit: { record: () => undefined },
    storeChainReport: async (r: unknown) => {
      publishCount += 1;
      storedReports.push(r);
    },
    get storedReports() {
      return storedReports;
    },
    get publishCount() {
      return publishCount;
    },
  };
  return deps as ChainOrchestratorHandlerDeps & {
    storedReports: unknown[];
    publishCount: number;
  };
}

function seedFinalSubtask(state: ReturnType<typeof createChainState>, subtaskId: string): void {
  state.subtasks.set(subtaskId, {
    version: "0.1",
    subtaskId,
    chainId: state.chainId,
    chainMandateId: state.chainMandate.chainMandateId,
    depth: 1,
    requiredSkill: "task.execute",
    objective: "do work",
    requestedResult: "result",
    constraints: [],
    dependsOn: [],
    createdAt: NOW.toISOString(),
    deadlineAt: state.chainMandate.deadlineAt,
  });
  const award = ChainSubtaskAwardSchema.parse({
    version: "0.1",
    subtaskId,
    chainId: state.chainId,
    workerPeerId: "12D3KooW-worker",
    negotiationRound: 1,
    acceptedCostUsd: 0,
    deadlineAt: state.chainMandate.deadlineAt,
    createdAt: NOW.toISOString(),
  });
  state.awards.set(subtaskId, award);
  const partial = ChainSubtaskPartialSchema.parse({
    version: "0.1",
    subtaskId,
    chainId: state.chainId,
    workerPeerId: "12D3KooW-worker",
    seq: 1,
    isFinal: true,
    note: `result for ${subtaskId}`,
    createdAt: NOW.toISOString(),
  });
  state.partials.set(subtaskId, TaskChainPartialPayloadSchema.parse({ partial }));
}

describe("chain-iteration helpers", () => {
  it("sealOpenRound freezes open ids and clears the open set", () => {
    const state = createChainState(mandate());
    state.iteration = createIterationState({
      goal: "goal",
      maxRounds: 2,
      openRoundSubtaskIds: ["a", "b"],
    });
    sealOpenRound(state);
    expect(state.iteration.sealedByRound[1]).toEqual(["a", "b"]);
    expect(state.iteration.openRoundSubtaskIds).toEqual([]);
  });

  it("canStartNextRound respects maxRounds and budget", () => {
    const state = createChainState(mandate({ maxChainCostUsd: 0.1 }));
    state.iteration = createIterationState({
      goal: "goal",
      maxRounds: 2,
      openRoundSubtaskIds: ["a"],
    });
    const tight = canStartNextRound(state);
    expect(tight.ok).toBe(false);
    if (!tight.ok) expect(tight.reason).toBe("budget");

    const rich = createChainState(mandate({ maxChainCostUsd: 20 }));
    rich.iteration = createIterationState({
      goal: "goal",
      maxRounds: 2,
      openRoundSubtaskIds: ["a"],
    });
    expect(canStartNextRound(rich)).toEqual({ ok: true });
    rich.iteration.round = 2;
    expect(canStartNextRound(rich)).toEqual({ ok: false, reason: "max_rounds" });
  });

  it("normalizeJudgeDecision maps post-seal extend", () => {
    expect(
      normalizeJudgeDecision("extend", { sealed: true, canContinue: true }),
    ).toBe("continue");
    expect(
      normalizeJudgeDecision("extend", { sealed: true, canContinue: false }),
    ).toBe("stop");
  });

  it("normalizeJudgeDecision forces stop when continue budget is exhausted", () => {
    expect(
      normalizeJudgeDecision("continue", { sealed: true, canContinue: false }),
    ).toBe("stop");
    expect(
      normalizeJudgeDecision("ask_owner", { sealed: true, canContinue: false }),
    ).toBe("stop");
    expect(
      normalizeJudgeDecision("ask_owner", { sealed: true, canContinue: true }),
    ).toBe("ask_owner");
  });

  it("parseIterationJudge reads JSON decisions", () => {
    const parsed = parseIterationJudge('{"decision":"continue","reason":"needs more depth"}');
    expect(parsed).toEqual({
      decision: "continue",
      reason: "needs more depth",
      suggestedExtendObjectives: undefined,
    });
  });

  it("buildIterationPlanGoal embeds prior draft", () => {
    const it = createIterationState({ goal: "Write a report", maxRounds: 3, openRoundSubtaskIds: [] });
    it.drafts.push({ round: 1, summary: "Draft one text", judge: { decision: "continue", reason: "thin" } });
    it.round = 2;
    const goal = buildIterationPlanGoal("Write a report", it);
    expect(goal).toContain("iterationRound 2/3");
    expect(goal).toContain("Draft one text");
    expect(goal).toContain("Critique: thin");
  });

  it("buildPlanAssignPrompt includes iteration block for round>1", () => {
    const prompt = buildPlanAssignPrompt(
      "goal",
      [{ peerId: "p1", membership: ["task.execute"] }],
      {
        iteration: {
          round: 2,
          maxRounds: 3,
          priorDraft: "earlier draft",
          critique: "missing cite",
        },
      },
    );
    expect(prompt).toContain("iterationRound: 2/3");
    expect(prompt).toContain("earlier draft");
    expect(prompt).toContain("missing cite");
  });

  it("mergeChainDefaults includes iteration defaults", () => {
    const d = mergeChainDefaults({});
    expect(d.iterationMaxRounds).toBe(1);
    expect(d.extendMaxStepsPerRound).toBe(2);
    expect(d.extendMaxDepth).toBe(3);
    expect(d.iterationJudgeMode).toBe("llm");
  });
});

describe("appendExtendSteps (47B)", () => {
  it("appends one dependent step under cap", () => {
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_parent");
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 1,
      openRoundSubtaskIds: ["subtask_parent"],
      maxExtendsInRound: 2,
    });
    const r = appendExtendSteps(state, [
      {
        objective: "Add a citation",
        dependsOn: ["subtask_parent"],
        preferredWorkerPeerId: "12D3KooW-worker",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtasks).toHaveLength(1);
    expect(state.iteration!.extendsInRound).toBe(1);
    expect(state.iteration!.openRoundSubtaskIds).toContain(r.subtasks[0]!.subtaskId);
    expect(state.subtasks.get("subtask_parent")?.objective).toBe("do work"); // immutable parent
  });

  it("rejects over-cap append", () => {
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_parent");
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 1,
      openRoundSubtaskIds: ["subtask_parent"],
      maxExtendsInRound: 1,
    });
    expect(
      appendExtendSteps(state, [
        { objective: "first", dependsOn: ["subtask_parent"] },
      ]).ok,
    ).toBe(true);
    // Parent still final; new child not final — gate blocks until child finishes.
    // Seed the child final so we can attempt a second extend against the cap.
    const childId = state.iteration!.openRoundSubtaskIds.find((id) => id !== "subtask_parent")!;
    seedFinalSubtask(state, childId);
    const over = appendExtendSteps(state, [
      { objective: "second", dependsOn: ["subtask_parent"] },
    ]);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe("cap_exceeded");
  });

  it("rejects extend after seal and sealed dependsOn", () => {
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_a");
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 1,
      openRoundSubtaskIds: ["subtask_a"],
      maxExtendsInRound: 2,
    });
    sealOpenRound(state);
    expect(canExtendOpenRound(state).ok).toBe(false);
    expect(appendExtendSteps(state, [{ objective: "x", dependsOn: ["subtask_a"] }]).ok).toBe(
      false,
    );

    // Re-open a fresh round id; sealed parent must not be a dependOn target.
    seedFinalSubtask(state, "subtask_b");
    state.iteration.openRoundSubtaskIds = ["subtask_b"];
    state.iteration.sealedByRound[1] = ["subtask_a"];
    const bad = appendExtendSteps(state, [
      { objective: "use sealed", dependsOn: ["subtask_a"] },
    ]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("depends_on_sealed");
  });
});

describe("tryCompleteChainIfReady iteration", () => {
  it("maxRounds=1 publishes once (one-shot)", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate());
    seedFinalSubtask(state, "subtask_oneshot");
    const r = await tryCompleteChainIfReady(deps, state, makeProfile());
    expect(r.published).toBe(true);
    expect(deps.publishCount).toBe(1);
    expect(state.published).toBe(true);
  });

  it("maxRounds=2 continue then stop yields two drafts and one publish", async () => {
    const deps = makeDeps();
    const auditTypes: string[] = [];
    const origRecord = deps.audit.record;
    deps.audit.record = (event) => {
      auditTypes.push(String((event as { type?: string }).type));
      return origRecord(event);
    };
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_r1");
    state.iteration = createIterationState({
      goal: "Write a report",
      maxRounds: 2,
      openRoundSubtaskIds: ["subtask_r1"],
      judgeMode: "llm",
    });

    let continued = 0;
    const first = await tryCompleteChainIfReady(deps, state, makeProfile(), {
      judge: async () => JSON.stringify({ decision: "continue", reason: "need round 2" }),
      onContinueRound: async (s) => {
        continued += 1;
        seedFinalSubtask(s, "subtask_r2");
        s.iteration!.round = 2;
        s.iteration!.openRoundSubtaskIds = ["subtask_r2"];
        return { ok: true };
      },
    });
    expect(first.continued).toBe(true);
    expect(first.published).toBe(false);
    expect(deps.publishCount).toBe(0);
    expect(continued).toBe(1);
    expect(state.iteration!.drafts).toHaveLength(1);
    expect(state.iteration!.sealedByRound[1]).toEqual(["subtask_r1"]);

    const second = await tryCompleteChainIfReady(deps, state, makeProfile(), {
      judge: async () => JSON.stringify({ decision: "stop", reason: "good enough" }),
      onContinueRound: async () => ({ ok: true }),
    });
    expect(second.published).toBe(true);
    expect(deps.publishCount).toBe(1);
    expect(state.iteration!.drafts).toHaveLength(2);
    expect(state.iteration!.stopReason).toBe("judge_stop");
    expect(iterationReplanGoal(state)).toContain("Write a report");

    const report = deps.storedReports[0] as {
      sections?: Array<{ heading?: string; bodyMarkdown?: string }>;
    };
    const headings = (report.sections ?? []).map((s) => s.heading);
    expect(headings).toContain("Draft 1");
    expect(headings).toContain("Final (round 2)");
    expect(auditTypes).toContain("chain.iteration.sealed");
    expect(auditTypes).toContain("chain.iteration.judge");
    expect(auditTypes).toContain("chain.iteration.round_started");
    expect(auditTypes).toContain("chain.iteration.stopped");
  });

  it("scoped synthesize ignores sealed-round awards when completing open round", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_sealed");
    seedFinalSubtask(state, "subtask_open");
    state.partials.get("subtask_sealed")!.partial.note = "SEALED_ONLY";
    state.partials.get("subtask_open")!.partial.note = "OPEN_ONLY";
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 2,
      openRoundSubtaskIds: ["subtask_open"],
      judgeMode: "always_stop",
    });
    state.iteration.sealedByRound[1] = ["subtask_sealed"];
    state.iteration.round = 2;

    const r = await tryCompleteChainIfReady(deps, state, makeProfile());
    expect(r.published).toBe(true);
    const report = deps.storedReports[0] as { executiveSummary?: string };
    expect(report.executiveSummary).toContain("OPEN_ONLY");
    expect(report.executiveSummary).not.toContain("SEALED_ONLY");
  });

  it("extend then publish: one append under cap, then synthesize", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_base");
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 1,
      openRoundSubtaskIds: ["subtask_base"],
      maxExtendsInRound: 2,
      judgeMode: "always_stop",
    });

    let extended = 0;
    const first = await tryCompleteChainIfReady(deps, state, makeProfile(), {
      onMaybeExtend: async (s) => {
        extended += 1;
        const r = appendExtendSteps(s, [
          { objective: "tighten conclusion", dependsOn: ["subtask_base"] },
        ]);
        if (!r.ok) return { ok: false, extended: false, error: r.reason };
        seedFinalSubtask(s, r.subtasks[0]!.subtaskId);
        return { ok: true, extended: true };
      },
    });
    expect(first.extended).toBe(true);
    expect(first.published).toBe(false);
    expect(extended).toBe(1);
    expect(deps.publishCount).toBe(0);
    expect(state.iteration!.extendsInRound).toBe(1);

    // Cap remaining; decline further extend → publish (maxRounds=1 one-shot after extend).
    const second = await tryCompleteChainIfReady(deps, state, makeProfile(), {
      onMaybeExtend: async () => ({ ok: true, extended: false }),
    });
    expect(second.published).toBe(true);
    expect(deps.publishCount).toBe(1);
  });
});

describe("Phase 47C heuristics + ask_owner", () => {
  it("classifies local vs global gaps", () => {
    expect(classifyIterationGap("add a citation and polish")).toBe("local");
    expect(classifyIterationGap("wrong approach — need to restructure")).toBe("global");
    expect(
      classifyIterationGap(
        "solid thorough multi-paragraph result with plenty of detail across several sentences and sections",
      ),
    ).toBe("unknown");
  });

  it("suggestLocalExtendStep prefers thin open-round notes under extend caps", () => {
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_thin");
    state.partials.get("subtask_thin")!.partial.note = "thin";
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 1,
      openRoundSubtaskIds: ["subtask_thin"],
      maxExtendsInRound: 2,
    });
    const step = suggestLocalExtendStep(state);
    expect(step?.dependsOn).toEqual(["subtask_thin"]);
    expect(step?.objective).toMatch(/Expand/);
  });

  it("heuristicJudgeDecision continues on global gap when budget remains", () => {
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_a");
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 2,
      openRoundSubtaskIds: ["subtask_a"],
    });
    sealOpenRound(state);
    const r = heuristicJudgeDecision(state, "fundamentally wrong approach — redesign");
    expect(r.decision).toBe("continue");
  });

  it("ask_owner holds without publish; owner stop publishes once", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_a");
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 2,
      openRoundSubtaskIds: ["subtask_a"],
      judgeMode: "owner",
    });

    const held = await tryCompleteChainIfReady(deps, state, makeProfile());
    expect(held.awaitingOwner).toBe(true);
    expect(held.published).toBe(false);
    expect(deps.publishCount).toBe(0);
    expect(state.iteration!.waitingForOwner).toBe(true);

    const resolved = await resolveIterationOwnerDecision(
      deps,
      state,
      makeProfile(),
      "stop",
    );
    expect(resolved.ok).toBe(true);
    expect(resolved.published).toBe(true);
    expect(deps.publishCount).toBe(1);
    expect(state.iteration!.waitingForOwner).toBe(false);
  });

  it("toIterationWireBlob / fromIterationWireBlob round-trips sealed drafts", () => {
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 3,
      openRoundSubtaskIds: ["subtask_open"],
      maxExtendsInRound: 2,
      judgeMode: "owner",
    });
    state.iteration.round = 2;
    state.iteration.extendsInRound = 1;
    state.iteration.sealedByRound[1] = ["subtask_old"];
    state.iteration.drafts.push({
      round: 1,
      summary: "first draft",
      judge: { decision: "continue", reason: "need more" },
    });
    state.iteration.waitingForOwner = true;

    const wire = toIterationWireBlob(state.iteration);
    const back = fromIterationWireBlob(wire);
    expect(back.round).toBe(2);
    expect(back.maxRounds).toBe(3);
    expect(back.extendsInRound).toBe(1);
    expect(back.sealedByRound[1]).toEqual(["subtask_old"]);
    expect(back.openRoundSubtaskIds).toEqual(["subtask_open"]);
    expect(back.drafts).toHaveLength(1);
    expect(back.drafts[0]!.summary).toBe("first draft");
    expect(back.drafts[0]!.judge?.decision).toBe("continue");
    expect(back.judgeMode).toBe("owner");
    expect(back.waitingForOwner).toBe(true);
    expect(back.goal).toBe("g");
  });

  it("caps extend depth at extendMaxDepth (requested deeper depth is clamped)", () => {
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_parent");
    state.subtasks.get("subtask_parent")!.depth = 2;
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 1,
      openRoundSubtaskIds: ["subtask_parent"],
      maxExtendsInRound: 2,
      extendMaxDepth: 2,
    });
    const r = appendExtendSteps(state, [
      { objective: "deeper request", dependsOn: ["subtask_parent"], depth: 99 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtasks[0]!.depth).toBe(2);
  });

  it("extendOnlyAfterPartial blocks before any final partial", () => {
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    state.subtasks.set("subtask_running", {
      version: "0.1",
      subtaskId: "subtask_running",
      chainId: state.chainId,
      chainMandateId: state.chainMandate.chainMandateId,
      depth: 1,
      requiredSkill: "task.execute",
      objective: "still running",
      requestedResult: "result",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
      deadlineAt: state.chainMandate.deadlineAt,
    });
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 1,
      openRoundSubtaskIds: ["subtask_running"],
      maxExtendsInRound: 2,
      extendOnlyAfterPartial: true,
    });
    const r = appendExtendSteps(state, [
      { objective: "too early", dependsOn: ["subtask_running"] },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["no_final_partial", "depends_on_incomplete"]).toContain(r.reason);
  });

  it("owner judge maxRounds=2: continue then auto-stop publishes two drafts", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_r1");
    state.iteration = createIterationState({
      goal: "Write a report",
      maxRounds: 2,
      openRoundSubtaskIds: ["subtask_r1"],
      judgeMode: "owner",
    });

    const first = await tryCompleteChainIfReady(deps, state, makeProfile());
    expect(first.awaitingOwner).toBe(true);
    expect(state.iteration!.drafts).toHaveLength(1);

    const cont = await resolveIterationOwnerDecision(deps, state, makeProfile(), "continue", {
      onContinueRound: async (s) => {
        seedFinalSubtask(s, "subtask_r2");
        s.iteration!.round = 2;
        s.iteration!.openRoundSubtaskIds = ["subtask_r2"];
        return { ok: true };
      },
    });
    expect(cont.continued).toBe(true);

    const second = await tryCompleteChainIfReady(deps, state, makeProfile());
    expect(second.published).toBe(true);
    expect(state.iteration!.drafts).toHaveLength(2);
    expect(state.iteration!.waitingForOwner).not.toBe(true);
    expect(state.iteration!.stopReason).toBe("judge_stop");
  });

  it("ask_owner continue launches next round without publishing", async () => {
    const deps = makeDeps();
    const state = createChainState(mandate({ maxChainCostUsd: 50 }));
    seedFinalSubtask(state, "subtask_a");
    state.iteration = createIterationState({
      goal: "g",
      maxRounds: 2,
      openRoundSubtaskIds: ["subtask_a"],
      judgeMode: "owner",
    });

    const held = await tryCompleteChainIfReady(deps, state, makeProfile());
    expect(held.awaitingOwner).toBe(true);
    expect(deps.publishCount).toBe(0);

    let continued = 0;
    const resolved = await resolveIterationOwnerDecision(
      deps,
      state,
      makeProfile(),
      "continue",
      {
        onContinueRound: async (s) => {
          continued += 1;
          seedFinalSubtask(s, "subtask_b");
          beginNextIterationRound(s, ["subtask_b"]);
          return { ok: true };
        },
      },
    );
    expect(resolved.ok).toBe(true);
    expect(resolved.continued).toBe(true);
    expect(resolved.published).toBeUndefined();
    expect(deps.publishCount).toBe(0);
    expect(continued).toBe(1);
    expect(state.iteration!.waitingForOwner).toBe(false);
    expect(state.iteration!.round).toBe(2);
  });
});
