import { describe, expect, it } from "vitest";
import {
  buildPlanAssignPrompt,
  hasDependsOnCycle,
  materializePlanAssignSubtasks,
  parsePlanAssignSteps,
} from "../src/chain-plan-assign.js";

describe("chain-plan-assign", () => {
  it("buildPlanAssignPrompt includes roster and hard rules", () => {
    const prompt = buildPlanAssignPrompt("(5*6+7*8-4*2)/3", [
      {
        peerId: "envoy_agent_mul",
        capabilities: ["task.execute", "capability-provider"],
        profile: { strengths: ["*"], throughputTokensPerSec: 90 },
      },
      {
        peerId: "envoy_agent_add",
        capabilities: ["task.execute", "capability-provider"],
        profile: { strengths: ["+"] },
      },
    ]);
    expect(prompt).toContain("eligibleWorkers");
    expect(prompt).toContain("envoy_agent_mul");
    expect(prompt).toContain("Every step MUST include assignedPeerId");
    expect(prompt).toContain("(5*6+7*8-4*2)/3");
  });

  it("parsePlanAssignSteps accepts object wrapper and fills missing assignees on materialize", () => {
    const drafts = parsePlanAssignSteps(
      JSON.stringify({
        steps: [
          {
            objective: "Compute 5*6",
            requiredCapability: "*",
            depth: 1,
            dependsOn: [],
            assignedPeerId: "envoy_agent_mul",
            reason: "mul specialist",
          },
          {
            objective: "Compute 7*8",
            requiredCapability: "*",
            depth: 1,
            dependsOn: [],
            // missing assignee — materialize must fill
            reason: "also mul",
          },
          {
            objective: "Add products then subtract 4*2 and divide by 3",
            requiredCapability: "/",
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
          capabilities: ["task.execute"],
          profile: { strengths: ["*"] },
        },
        {
          peerId: "envoy_agent_div",
          capabilities: ["task.execute"],
          profile: { strengths: ["/"] },
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
          { objective: "a", requiredCapability: "task.execute", depth: 1, dependsOn: [] },
          { objective: "b", requiredCapability: "task.execute", depth: 1, dependsOn: [0] },
        ],
      }),
    );
    const subtasks = materializePlanAssignSubtasks({
      goal: "solo",
      chainId: "chain_solo",
      chainMandateId: "chainmandate_solo",
      drafts: drafts!,
      roster: [{ peerId: "only", capabilities: ["task.execute", "capability-provider"] }],
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(subtasks.map((s) => s.preferredWorkerPeerId)).toEqual(["only", "only"]);
  });
});
