import { describe, expect, it } from "vitest";
import {
  REPUTATION_BLEND_WEIGHT,
  blendScoreWithReputation,
  buildPlanAssignPrompt,
  hasDependsOnCycle,
  materializePlanAssignSubtasks,
  materializePlanAssignWithMeta,
  parsePlanAssignResult,
  parsePlanAssignSteps,
  skillReputation,
} from "../src/chain-plan-assign.js";
import { synthesizePlanAssignFromRosterPrompt } from "@envoymesh/models";

describe("chain-plan-assign", () => {
  it("buildPlanAssignPrompt includes roster and hard rules", () => {
    const prompt = buildPlanAssignPrompt("(5*6+7*8-4*2)/3", [
      {
        peerId: "envoy_agent_mul",
        membership: ["task.execute", "agent-network-worker"],
        profile: { skills: ["*"], throughputTokensPerSec: 90 },
      },
      {
        peerId: "envoy_agent_add",
        membership: ["task.execute", "agent-network-worker"],
        profile: { skills: ["+"] },
      },
    ]);
    expect(prompt).toContain("eligibleWorkers");
    expect(prompt).toContain("envoy_agent_mul");
    expect(prompt).toContain("Every step MUST include assignedPeerId");
    expect(prompt).toContain("prefer that specialist over isSelf=true");
    expect(prompt).toContain("(5*6+7*8-4*2)/3");
  });

  it("overrides LLM self-bias when a specialty match exists", () => {
    const drafts = parsePlanAssignSteps(
      JSON.stringify({
        steps: [
          {
            objective: "Research entanglement",
            requiredSkill: "research",
            depth: 1,
            dependsOn: [],
            assignedPeerId: "envoy_agent_self",
            reason: "creator",
          },
          {
            objective: "Draft brief",
            requiredSkill: "writing",
            depth: 2,
            dependsOn: [0],
            assignedPeerId: "envoy_agent_self",
            reason: "creator",
          },
        ],
      }),
    );
    const subtasks = materializePlanAssignSubtasks({
      goal: "quantum brief",
      chainId: "chain_bias",
      chainMandateId: "chainmandate_bias",
      drafts: drafts!,
      roster: [
        {
          peerId: "envoy_agent_self",
          isSelf: true,
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["coding", "physics"] },
        },
        {
          peerId: "envoy_agent_xf",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["research", "writing", "summarization"] },
        },
      ],
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(subtasks[0]!.preferredWorkerPeerId).toBe("envoy_agent_xf");
    expect(subtasks[1]!.preferredWorkerPeerId).toBe("envoy_agent_xf");
  });

  it("overrides LLM self-bias when creator shares the same specialty", () => {
    const drafts = parsePlanAssignSteps(
      JSON.stringify({
        steps: [
          {
            objective: "Research entanglement",
            requiredSkill: "research",
            depth: 1,
            dependsOn: [],
            assignedPeerId: "envoy_agent_self",
            reason: "also research",
          },
        ],
      }),
    );
    const subtasks = materializePlanAssignSubtasks({
      goal: "shared specialty",
      chainId: "chain_tie",
      chainMandateId: "chainmandate_tie",
      drafts: drafts!,
      roster: [
        {
          peerId: "envoy_agent_self",
          isSelf: true,
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["research", "coding"] },
        },
        {
          peerId: "envoy_agent_xf",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["research", "writing"] },
        },
      ],
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(subtasks[0]!.preferredWorkerPeerId).toBe("envoy_agent_xf");
  });

  it("keeps creator when they are the only specialist", () => {
    const drafts = parsePlanAssignSteps(
      JSON.stringify({
        steps: [
          {
            objective: "Implement API",
            requiredSkill: "coding",
            depth: 1,
            dependsOn: [],
            assignedPeerId: "envoy_agent_self",
            reason: "coder",
          },
        ],
      }),
    );
    const subtasks = materializePlanAssignSubtasks({
      goal: "solo specialist",
      chainId: "chain_solo_spec",
      chainMandateId: "chainmandate_solo_spec",
      drafts: drafts!,
      roster: [
        {
          peerId: "envoy_agent_self",
          isSelf: true,
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["coding"] },
        },
        {
          peerId: "envoy_agent_xf",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["research"] },
        },
      ],
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(subtasks[0]!.preferredWorkerPeerId).toBe("envoy_agent_self");
  });

  it("parsePlanAssignSteps accepts object wrapper and fills missing assignees on materialize", () => {
    const drafts = parsePlanAssignSteps(
      JSON.stringify({
        steps: [
          {
            objective: "Compute 5*6",
            requiredSkill: "*",
            depth: 1,
            dependsOn: [],
            assignedPeerId: "envoy_agent_mul",
            reason: "mul specialist",
          },
          {
            objective: "Compute 7*8",
            requiredSkill: "*",
            depth: 1,
            dependsOn: [],
            // missing assignee — materialize must fill
            reason: "also mul",
          },
          {
            objective: "Add products then subtract 4*2 and divide by 3",
            requiredSkill: "/",
            depth: 2,
            dependsOn: [0, 1],
            assignedPeerId: "envoy_agent_div",
            reason: "div specialist",
          },
        ],
        aggregation: "llm_merge",
      }),
    );
    expect(drafts).not.toBeNull();
    expect(drafts!.length).toBe(3);

    const subtasks = materializePlanAssignSubtasks({
      goal: "(5*6+7*8-4*2)/3",
      chainId: "chain_test",
      chainMandateId: "chainmandate_test",
      drafts: drafts!,
      roster: [
        {
          peerId: "envoy_agent_mul",
          membership: ["task.execute"],
          profile: { skills: ["*"] },
        },
        {
          peerId: "envoy_agent_div",
          membership: ["task.execute"],
          profile: { skills: ["/"] },
        },
      ],
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(subtasks.every((s) => !!s.preferredWorkerPeerId)).toBe(true);
    expect(subtasks[0]!.preferredWorkerPeerId).toBe("envoy_agent_mul");
    expect(subtasks[1]!.preferredWorkerPeerId).toBeTruthy();
    expect(subtasks[2]!.dependsOn.length).toBe(2);
    expect(hasDependsOnCycle(subtasks)).toBe(false);
  });

  it("sole worker gets every step", () => {
    const drafts = parsePlanAssignSteps(
      JSON.stringify({
        steps: [
          { objective: "a", requiredSkill: "task.execute", depth: 1, dependsOn: [] },
          { objective: "b", requiredSkill: "task.execute", depth: 1, dependsOn: [0] },
        ],
      }),
    );
    const subtasks = materializePlanAssignSubtasks({
      goal: "solo",
      chainId: "chain_solo",
      chainMandateId: "chainmandate_solo",
      drafts: drafts!,
      roster: [{ peerId: "only", membership: ["task.execute", "agent-network-worker"] }],
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(subtasks.map((s) => s.preferredWorkerPeerId)).toEqual(["only", "only"]);
  });

  it("role mode prompt includes roles and substitute guidance", () => {
    const prompt = buildPlanAssignPrompt(
      "Ship a feature",
      [
        {
          peerId: "envoy_agent_dev",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["coding"], roles: ["programmer"] },
        },
      ],
      { assignmentMode: "role" },
    );
    expect(prompt).toContain("ASSIGNMENT MODE: role");
    expect(prompt).toContain("primaryRole");
    expect(prompt).toContain("programmer");
    expect(prompt).toContain("SUBSTITUTE GUIDANCE");
    expect(prompt).toContain("requiredRole");
  });

  it("skill mode prompt ignores role ranking policy", () => {
    const prompt = buildPlanAssignPrompt("Ship a feature", [
      {
        peerId: "envoy_agent_dev",
        membership: ["task.execute"],
        profile: { skills: ["coding"], roles: ["programmer"] },
      },
    ]);
    expect(prompt).toContain("ASSIGNMENT MODE: skill");
    expect(prompt).not.toContain("SUBSTITUTE GUIDANCE");
    expect(prompt).toContain('"roles"');
  });

  it("role mode materialize prefers exact role over LLM skill self-bias", () => {
    const parsed = parsePlanAssignResult(
      JSON.stringify({
        assignmentMode: "role",
        steps: [
          {
            objective: "Implement API",
            requiredRole: "programmer",
            requiredSkill: "coding",
            depth: 1,
            dependsOn: [],
            assignedPeerId: "envoy_agent_self",
            assignKind: "exact_role",
            reason: "creator",
          },
        ],
        warnings: [],
      }),
    );
    const { subtasks, warnings } = materializePlanAssignWithMeta({
      goal: "api",
      chainId: "chain_role",
      chainMandateId: "chainmandate_role",
      drafts: parsed!.steps,
      roster: [
        {
          peerId: "envoy_agent_self",
          isSelf: true,
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["coding"], roles: ["product_manager"] },
        },
        {
          peerId: "envoy_agent_dev",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["writing"], roles: ["programmer"] },
        },
      ],
      createdAt: "2026-08-08T00:00:00.000Z",
      assignmentMode: "role",
      warnings: parsed!.warnings,
    });
    expect(subtasks[0]!.preferredWorkerPeerId).toBe("envoy_agent_dev");
    expect(subtasks[0]!.requiredRole).toBe("programmer");
    expect(warnings.some((w) => w.code === "assignee_rewritten")).toBe(true);
  });

  it("exact-role rewrite clears stale LLM role_substitute assignKind", () => {
    const parsed = parsePlanAssignResult(
      JSON.stringify({
        assignmentMode: "role",
        steps: [
          {
            objective: "Implement API",
            requiredRole: "programmer",
            requiredSkill: "coding",
            depth: 1,
            dependsOn: [],
            assignedPeerId: "envoy_agent_self",
            assignKind: "role_substitute",
            reason: "no programmer claimed",
          },
        ],
        warnings: [
          {
            code: "role_substitute",
            role: "programmer",
            stepIndex: 0,
            usedPeerId: "envoy_agent_self",
            assignKind: "role_substitute",
            message: "Using PM as substitute",
          },
        ],
      }),
    );
    const { subtasks, warnings } = materializePlanAssignWithMeta({
      goal: "api",
      chainId: "chain_rewrite_kind",
      chainMandateId: "chainmandate_rewrite_kind",
      drafts: parsed!.steps,
      roster: [
        {
          peerId: "envoy_agent_self",
          isSelf: true,
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["coding"], roles: ["product_manager"] },
        },
        {
          peerId: "envoy_agent_dev",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["writing"], roles: ["programmer"] },
        },
      ],
      createdAt: "2026-08-08T00:00:00.000Z",
      assignmentMode: "role",
      warnings: parsed!.warnings,
    });
    expect(subtasks[0]!.preferredWorkerPeerId).toBe("envoy_agent_dev");
    expect(subtasks[0]!.constraints.some((c) => c.includes("(exact_role)"))).toBe(true);
    expect(subtasks[0]!.constraints.some((c) => c.includes("(role_substitute)"))).toBe(false);
    expect(warnings.some((w) => w.code === "assignee_rewritten" && w.assignKind === "exact_role")).toBe(
      true,
    );
    expect(warnings.some((w) => w.code === "role_substitute")).toBe(false);
  });

  it("mock role mode substitutes programmer for missing tester", () => {
    const prompt = buildPlanAssignPrompt(
      "Spec, code, test",
      [
        {
          peerId: "envoy_agent_pm",
          membership: ["task.execute"],
          profile: { skills: ["research"], roles: ["product_manager"] },
        },
        {
          peerId: "envoy_agent_dev",
          membership: ["task.execute"],
          profile: { skills: ["coding"], roles: ["programmer"] },
        },
      ],
      { assignmentMode: "role" },
    );
    const raw = synthesizePlanAssignFromRosterPrompt(prompt);
    expect(raw).toBeTruthy();
    const parsed = parsePlanAssignResult(raw!);
    expect(parsed?.assignmentMode).toBe("role");
    expect(parsed?.steps).toHaveLength(3);
    expect(parsed?.steps[2]?.requiredRole).toBe("tester");
    expect(parsed?.steps[2]?.assignedPeerId).toBe("envoy_agent_dev");
    expect(parsed?.steps[2]?.assignKind).toBe("role_substitute");
    expect(parsed?.warnings.some((w) => w.code === "role_substitute")).toBe(true);
  });
});

describe("reputation-aware scoring (Sprint 2 MAP)", () => {
  it("blendScoreWithReputation leaves the base score untouched when reputation is absent", () => {
    expect(blendScoreWithReputation(3, undefined)).toBe(3);
    expect(blendScoreWithReputation(0, undefined)).toBe(0);
  });

  it("blendScoreWithReputation adds a soft addend, clamped to [0, 1]", () => {
    expect(blendScoreWithReputation(3, 1)).toBe(3 + REPUTATION_BLEND_WEIGHT);
    expect(blendScoreWithReputation(3, 0)).toBe(3);
    expect(blendScoreWithReputation(3, 1.5)).toBe(3 + REPUTATION_BLEND_WEIGHT);
    expect(blendScoreWithReputation(3, -0.5)).toBe(3);
  });

  it("tier ordering is preserved: a zero-reputation specialist still beats a full-reputation executor", () => {
    const specialist = blendScoreWithReputation(3, 0); // 3.0
    const executor = blendScoreWithReputation(1, 1); // 1.2
    expect(specialist).toBeGreaterThan(executor);
  });

  it("skillReputation matches the exact skill key, clamped", () => {
    const entry = { membership: [], reputationBySkill: { summarization: 0.9, research: 1.5 } };
    expect(skillReputation(entry, "summarization")).toBe(0.9);
    expect(skillReputation(entry, "RESEARCH")).toBe(1); // clamped
    expect(skillReputation(entry, "coding")).toBeUndefined();
    expect(skillReputation({ membership: [] }, "coding")).toBeUndefined();
  });

  it("reputation breaks ties between same-skill specialists", () => {
    const drafts = parsePlanAssignSteps(
      JSON.stringify({
        steps: [
          {
            objective: "Summarize the Q3 report",
            requiredSkill: "summarization",
            depth: 1,
            dependsOn: [],
          },
        ],
      }),
    );
    const subtasks = materializePlanAssignSubtasks({
      goal: "summarize",
      chainId: "chain_rep",
      chainMandateId: "chainmandate_rep",
      drafts: drafts!,
      roster: [
        {
          peerId: "envoy_agent_a",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["summarization"] },
          reputationBySkill: { summarization: 0.2 },
        },
        {
          peerId: "envoy_agent_b",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["summarization"] },
          reputationBySkill: { summarization: 0.9 },
        },
      ],
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(subtasks[0]!.preferredWorkerPeerId).toBe("envoy_agent_b");
  });

  it("reputation never overrides the skill tier", () => {
    const drafts = parsePlanAssignSteps(
      JSON.stringify({
        steps: [
          {
            objective: "Summarize the Q3 report",
            requiredSkill: "summarization",
            depth: 1,
            dependsOn: [],
          },
        ],
      }),
    );
    const subtasks = materializePlanAssignSubtasks({
      goal: "summarize",
      chainId: "chain_rep_tier",
      chainMandateId: "chainmandate_rep_tier",
      drafts: drafts!,
      roster: [
        {
          peerId: "envoy_agent_specialist",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["summarization"] },
          reputationBySkill: { summarization: 0 },
        },
        {
          peerId: "envoy_agent_general",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["coding"] },
          reputationBySkill: { coding: 1 },
        },
      ],
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(subtasks[0]!.preferredWorkerPeerId).toBe("envoy_agent_specialist");
  });

  it("buildPlanAssignPrompt surfaces reputationBySkill in the roster", () => {
    const prompt = buildPlanAssignPrompt("summarize the quarter", [
      {
        peerId: "envoy_agent_a",
        membership: ["task.execute"],
        reputationBySkill: { summarization: 0.9 },
      },
    ]);
    expect(prompt).toContain('"reputationBySkill"');
    expect(prompt).toContain("0.9");
  });
});
