import { describe, expect, it } from "vitest";

import {
  briefReportDeliverableRules,
  isBriefOrReportGoal,
  isSynthesizeSubtask,
  mergeSystemPromptForGoal,
  mergeUserPromptAddonForGoal,
  planPromptAddonForGoal,
} from "../src/chain-deliverable-policy.js";
import { buildOpenClawSubtaskPrompt } from "../src/chain-worker-executor.js";
import { buildDecomposePrompt } from "../src/chain-decomposer.js";
import { buildPlanAssignPrompt } from "../src/chain-plan-assign.js";
import { MERGE_SYSTEM_PROMPT, createLlmMerge } from "../src/chain-llm.js";

describe("chain-deliverable-policy", () => {
  it("detects brief/report and engineer-metaphor goals", () => {
    expect(isBriefOrReportGoal("Produce a short brief for software engineers")).toBe(true);
    expect(
      isBriefOrReportGoal(
        "Explain how quantum entanglement relates to classical coding metaphors for software engineers",
      ),
    ).toBe(true);
    expect(isBriefOrReportGoal("Translate this paragraph to French")).toBe(false);
  });

  it("detects synthesize subtasks", () => {
    expect(isSynthesizeSubtask({ requiredSkill: "summarize.text", objective: "Rewrite" })).toBe(true);
    expect(isSynthesizeSubtask({ requiredSkill: "research.web", objective: "Collect facts" })).toBe(
      false,
    );
  });

  it("augments merge prompts for brief goals", () => {
    const goal = "Produce a short brief for software engineers on entanglement";
    const sys = mergeSystemPromptForGoal(MERGE_SYSTEM_PROMPT, goal);
    expect(sys).toContain("TL;DR");
    expect(sys).toContain("600 words");
    expect(mergeUserPromptAddonForGoal(goal)).toContain("brief/report");
    expect(mergeSystemPromptForGoal(MERGE_SYSTEM_PROMPT, "Translate hello")).toBe(MERGE_SYSTEM_PROMPT);
  });

  it("injects plan guidance into decompose + plan-assign prompts", () => {
    const goal = "Produce a short brief for software engineers on {topic}";
    expect(buildDecomposePrompt(goal, {})).toContain("BRIEF/REPORT GOAL");
    expect(
      buildPlanAssignPrompt(goal, [
        {
          peerId: "peer_a",
          membership: ["task.execute"],
          isSelf: true,
        },
      ]),
    ).toContain('aggregation MUST be "llm_merge"');
    expect(planPromptAddonForGoal(goal)).toContain("BRIEF/REPORT GOAL");
    expect(briefReportDeliverableRules()).toContain("600 words");
  });

  it("adds brief constraints to synthesize worker prompts", () => {
    const prompt = buildOpenClawSubtaskPrompt({
      version: "0.1",
      subtaskId: "s1",
      chainId: "c1",
      chainMandateId: "m1",
      depth: 1,
      requiredSkill: "summarize",
      objective: "Synthesize the research into a short engineer brief",
      requestedResult: "markdown brief",
      constraints: [],
      dependsOn: [],
      createdAt: new Date().toISOString(),
    } as never);
    expect(prompt).toContain("Hard cap: 600 words");
    expect(prompt).toContain("No CQRS");
  });

  it("createLlmMerge includes deliverable rules in system prompt for brief goals", async () => {
    let seenSystem = "";
    const merge = createLlmMerge({
      complete: async ({ systemPrompt }) => {
        seenSystem = systemPrompt;
        return {
          text: JSON.stringify({ summary: "ok", sections: [], sources: [] }),
          usage: { promptTokens: 1, completionTokens: 1 },
        };
      },
    });
    await merge({
      goal: "Produce a short brief for software engineers",
      contributions: [
        {
          workerIndex: 1,
          partial: {
            version: "0.1",
            partial: {
              subtaskId: "s1",
              chainId: "c1",
              workerPeerId: "w1",
              seq: 1,
              isFinal: true,
              confidence: 0.9,
              artifactFragment: "draft",
              createdAt: new Date().toISOString(),
            },
          } as never,
        },
      ],
    });
    expect(seenSystem).toContain("TL;DR");
    expect(seenSystem).toContain("Assigner's final editor");
  });
});
