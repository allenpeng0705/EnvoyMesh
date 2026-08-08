import { describe, expect, it } from "vitest";
import {
  agentNetworkDomainSkillIds,
  agentNetworkHasRole,
  agentNetworkPrimaryRole,
  agentNetworkRankingSkillIds,
  agentNetworkRoleIds,
  agentNetworkSkillIds,
  coerceAgentNetworkRoles,
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

describe("AgentNetworkProfile roles", () => {
  it("defaults roles to empty and accepts primary role", () => {
    const empty = parseAgentNetworkProfile({ skills: [] });
    expect(empty.roles).toEqual([]);
    const withRole = createAgentNetworkProfile({
      roles: ["Programmer", "tester"],
    });
    expect(withRole.roles).toEqual(["programmer", "tester"]);
    expect(agentNetworkPrimaryRole(withRole.roles)).toBe("programmer");
    expect(agentNetworkHasRole(withRole.roles, "tester")).toBe(true);
    expect(agentNetworkHasRole(withRole.roles, "writer")).toBe(false);
  });

  it("accepts custom roles and rejects garbage", () => {
    expect(coerceAgentNetworkRoles(["custom:qa_lead", "not-a-role", "programmer"])).toEqual([
      "custom:qa_lead",
      "programmer",
    ]);
    expect(agentNetworkRoleIds(["PRODUCT_MANAGER"])).toEqual(["product_manager"]);
  });

  it("caps roles at 8 and dedupes", () => {
    const many = coerceAgentNetworkRoles([
      "programmer",
      "programmer",
      "tester",
      "writer",
      "researcher",
      "product_manager",
      "generalist",
      "custom:a",
      "custom:b",
      "custom:c",
    ]);
    expect(many).toHaveLength(8);
    expect(many[0]).toBe("programmer");
  });
});
