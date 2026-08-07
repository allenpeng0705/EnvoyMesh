import { describe, expect, it } from "vitest";
import {
  agentNetworkDomainSkillIds,
  agentNetworkRankingSkillIds,
  agentNetworkSkillIds,
  coerceAgentNetworkSkills,
  createAgentNetworkProfile,
  createOwnerDomainSkill,
  parseAgentNetworkProfile,
} from "../src/agent-network-profile.js";

describe("AgentNetworkProfile skills entries", () => {
  it("coerces legacy string skills to domain/owner entries", () => {
    const profile = parseAgentNetworkProfile({
      modelFreshness: 6,
      skills: ["Coding", "research"],
    });
    expect(profile.skills).toEqual([
      { id: "coding", kind: "domain", source: "owner" },
      { id: "research", kind: "domain", source: "owner" },
    ]);
  });

  it("preserves structured kind and source", () => {
    const profile = createAgentNetworkProfile({
      skills: [
        createOwnerDomainSkill("writing"),
        { id: "tavily", kind: "skill", source: "openclaw" },
        { id: "pi", kind: "skill", source: "ext" },
      ],
    });
    expect(profile.skills).toEqual([
      { id: "writing", kind: "domain", source: "owner" },
      { id: "tavily", kind: "skill", source: "openclaw" },
      { id: "pi", kind: "skill", source: "ext" },
    ]);
    expect(agentNetworkSkillIds(profile.skills)).toEqual(["writing", "tavily", "pi"]);
    expect(agentNetworkDomainSkillIds(profile.skills)).toEqual(["writing"]);
    expect(agentNetworkRankingSkillIds(profile.skills)).toEqual(["writing", "tavily"]);
  });

  it("coerces partial { id } objects to domain/owner entries", () => {
    const profile = parseAgentNetworkProfile({
      skills: [{ id: "Coding" }],
    });
    expect(profile.skills).toEqual([
      { id: "coding", kind: "domain", source: "owner" },
    ]);
  });

  it("dedupes by id preferring first occurrence", () => {
    expect(
      coerceAgentNetworkSkills([
        "coding",
        { id: "coding", kind: "skill", source: "openclaw" },
        "coding",
      ]),
    ).toEqual([{ id: "coding", kind: "domain", source: "owner" }]);
  });
});
