import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateAgentNetworkSkills,
  extAgentLabelsFromDefinitions,
  listOpenClawSkillIds,
} from "../src/agent-network-skills-aggregate.js";
import { openClawWorkspaceSkillsDir } from "../src/openclaw-workspace.js";

describe("aggregateAgentNetworkSkills", () => {
  it("keeps owner skills and stamps OpenClaw / Ext provenance", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "an-skills-"));
    try {
      const skillsRoot = openClawWorkspaceSkillsDir(profileDir);
      await mkdir(join(skillsRoot, "tavily"), { recursive: true });
      await writeFile(join(skillsRoot, "tavily", "SKILL.md"), "# tavily\n", "utf8");
      await mkdir(join(skillsRoot, "empty"), { recursive: true });

      expect(listOpenClawSkillIds(profileDir)).toEqual(["tavily"]);

      const profile = aggregateAgentNetworkSkills({
        profile: {
          modelFreshness: 7,
          spendPosture: "subscription",
          contextWindow: "256k",
          skills: ["coding", "research"],
        },
        profileDir,
        extAgentLabels: ["pi"],
      });
      expect(profile.skills).toEqual([
        { id: "coding", kind: "domain", source: "owner" },
        { id: "research", kind: "domain", source: "owner" },
        { id: "tavily", kind: "skill", source: "openclaw" },
        { id: "pi", kind: "skill", source: "ext" },
      ]);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("does not invent skills when profileDir is missing", () => {
    const profile = aggregateAgentNetworkSkills({
      profile: { skills: ["writing"] },
    });
    expect(profile.skills).toEqual([
      { id: "writing", kind: "domain", source: "owner" },
    ]);
  });

  it("extAgentLabelsFromDefinitions keeps enabled ids and distinct names", () => {
    expect(
      extAgentLabelsFromDefinitions([
        { id: "pi", name: "Pi", enabled: true },
        { id: "hermes", name: "hermes", enabled: true },
        { id: "off", name: "Off Agent", enabled: false },
      ]),
    ).toEqual(["pi", "hermes"]);
  });
});
