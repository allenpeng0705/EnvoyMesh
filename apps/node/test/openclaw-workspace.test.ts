import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureOpenClawWorkspace,
  importLegacySkillsIntoWorkspace,
  openClawGatewayStateDir,
  openClawWorkspaceDir,
  openClawWorkspaceSkillsDir,
} from "../src/openclaw-workspace.js";

describe("ensureOpenClawWorkspace", () => {
  it("seeds workspace without BOOTSTRAP.md and marks setup complete", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-oc-ws-"));
    const dir = ensureOpenClawWorkspace(profileDir, {
      ownerId: "envoy:owner:abc",
      displayName: "Alice",
      interests: ["rust"],
      capabilities: ["reviewer"],
      bondCount: 2,
    });

    expect(dir).toBe(openClawWorkspaceDir(profileDir));

    await expect(access(join(dir, "BOOTSTRAP.md"))).rejects.toThrow();

    const identity = await readFile(join(dir, "IDENTITY.md"), "utf-8");
    expect(identity).toContain("EnvoyAI");

    const user = await readFile(join(dir, "USER.md"), "utf-8");
    expect(user).toContain("Alice");
    expect(user).toContain("Bonds on mesh: 2");

    const state = JSON.parse(
      await readFile(join(dir, ".openclaw", "workspace-state.json"), "utf-8"),
    );
    expect(state.setupCompletedAt).toBeTruthy();
  });

  it("resolves persistent gateway state dir under profile", () => {
    expect(openClawGatewayStateDir("/data/default")).toBe("/data/default/openclaw-gateway");
    expect(openClawWorkspaceSkillsDir("/data/default")).toBe("/data/default/openclaw-workspace/skills");
  });

  it("imports legacy node skills into workspace skills dir once", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-oc-legacy-"));
    const legacyDir = join(profileDir, "legacy-skills");
    const tavilyDir = join(legacyDir, "tavily");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(tavilyDir, { recursive: true });
    await writeFile(join(tavilyDir, "SKILL.md"), "---\nname: tavily\n---\n", "utf-8");

    const workspaceDir = ensureOpenClawWorkspace(profileDir, {
      ownerId: "envoy:owner:legacy",
    }, { legacySkillsDir: legacyDir });

    const imported = importLegacySkillsIntoWorkspace({
      legacySkillsDir: legacyDir,
      workspaceDir,
    });
    expect(imported).toEqual([]);

    const skillMd = await readFile(join(workspaceDir, "skills", "tavily", "SKILL.md"), "utf-8");
    expect(skillMd).toContain("name: tavily");
  });
});
