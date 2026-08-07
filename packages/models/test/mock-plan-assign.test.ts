/**
 * Unit tests for roster-aware mock plan+assign synthesizer.
 */
import { describe, expect, it } from "vitest";
import {
  PLAN_ASSIGN_FROM_ROSTER_TOKEN,
  synthesizePlanAssignFromRosterPrompt,
  createMockModelProvider,
  buildModelProviders,
} from "../src/index.js";

const SAMPLE_PROMPT = [
  "You are the Assigner...",
  "eligibleWorkers:",
  JSON.stringify(
    [
      {
        peerId: "envoy_agent_coder",
        displayName: "Coder",
        membership: ["task.execute", "agent-network-worker"],
        skills: ["coding"],
        modelFreshness: 9,
        throughputTokensPerSec: 80,
        isSelf: false,
      },
      {
        peerId: "envoy_agent_researcher",
        displayName: "Researcher",
        membership: ["task.execute", "agent-network-worker"],
        skills: ["research.web"],
        modelFreshness: 7,
        throughputTokensPerSec: 40,
        isSelf: false,
      },
    ],
    null,
    2,
  ),
  "",
  "Output the JSON object now.",
].join("\n");

describe("synthesizePlanAssignFromRosterPrompt", () => {
  it("assigns research / coding / merge steps with dependsOn DAG", () => {
    const raw = synthesizePlanAssignFromRosterPrompt(SAMPLE_PROMPT);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as {
      steps: Array<{ assignedPeerId: string; requiredSkill: string; dependsOn: number[] }>;
    };
    expect(parsed.steps).toHaveLength(3);
    expect(parsed.steps[0]!.requiredSkill).toBe("research.web");
    expect(parsed.steps[0]!.assignedPeerId).toBe("envoy_agent_researcher");
    expect(parsed.steps[1]!.requiredSkill).toBe("coding");
    expect(parsed.steps[1]!.assignedPeerId).toBe("envoy_agent_coder");
    expect(parsed.steps[2]!.dependsOn).toEqual([0, 1]);
  });

  it("returns null when roster is missing", () => {
    expect(synthesizePlanAssignFromRosterPrompt("no workers here")).toBeNull();
  });
});

describe("createMockModelProvider — plan_assign_from_roster", () => {
  it("synthesizes plan JSON when token is set", async () => {
    const provider = createMockModelProvider({
      responseText: PLAN_ASSIGN_FROM_ROSTER_TOKEN,
    });
    const res = await provider.complete({
      taskType: "chain.plan_assign",
      prompt: SAMPLE_PROMPT,
      sensitivity: "public",
    });
    const parsed = JSON.parse(res.text) as { steps: unknown[] };
    expect(parsed.steps.length).toBe(3);
  });
});

describe("buildModelProviders — mockResponseText", () => {
  it("passes mockResponseText into the mock provider", async () => {
    const providers = buildModelProviders(
      {
        mode: "mock",
        mockResponseText: PLAN_ASSIGN_FROM_ROSTER_TOKEN,
      },
      false,
    );
    expect(providers).toHaveLength(1);
    const res = await providers[0]!.complete({
      taskType: "chain.plan_assign",
      prompt: SAMPLE_PROMPT,
      sensitivity: "public",
    });
    expect(JSON.parse(res.text).steps).toHaveLength(3);
  });
});
