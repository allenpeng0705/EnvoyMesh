import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveBundledOpenClawDir,
  resolveBundledSkillsDir,
  resolveStandaloneOpenClawBinary,
} from "../src/bundled-paths.js";

describe("bundled-paths", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("resolveBundledSkillsDir prefers ENVOYMESH_BUNDLED_SKILLS_DIR", () => {
    process.env.ENVOYMESH_BUNDLED_SKILLS_DIR = "/custom/skills";
    expect(resolveBundledSkillsDir("/apps/node")).toBe("/custom/skills");
  });

  it("resolveBundledSkillsDir defaults to nodeCwd/skills", () => {
    delete process.env.ENVOYMESH_BUNDLED_SKILLS_DIR;
    expect(resolveBundledSkillsDir("/apps/node")).toBe("/apps/node/skills");
  });

  it("resolveBundledOpenClawDir uses ENVOYMESH_OPENCLAW_DIR when tree exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "envoymesh-oc-"));
    await writeFile(join(root, "openclaw.mjs"), "#!/usr/bin/env node\n", "utf-8");
    process.env.ENVOYMESH_OPENCLAW_DIR = root;
    expect(resolveBundledOpenClawDir("/any/cwd")).toBe(root);
  });

  it("resolveBundledOpenClawDir finds monorepo packages/openclaw", async () => {
    delete process.env.ENVOYMESH_OPENCLAW_DIR;
    delete process.env.TAURI_RESOURCE_DIR;
    const repo = await mkdtemp(join(tmpdir(), "envoymesh-repo-"));
    const nodeCwd = join(repo, "apps", "node");
    const ocDir = join(repo, "packages", "openclaw");
    await mkdir(nodeCwd, { recursive: true });
    await mkdir(ocDir, { recursive: true });
    await writeFile(join(ocDir, "openclaw.mjs"), "#!/usr/bin/env node\n", "utf-8");
    expect(resolveBundledOpenClawDir(nodeCwd)).toBe(ocDir);
  });

  it("resolveStandaloneOpenClawBinary finds binary under TAURI_RESOURCE_DIR", async () => {
    delete process.env.ENVOYMESH_OPENCLAW_DIR;
    const resources = await mkdtemp(join(tmpdir(), "envoymesh-res-"));
    const binDir = join(resources, "openclaw");
    await mkdir(binDir, { recursive: true });
    await writeFile(join(binDir, "openclaw"), "bin", "utf-8");
    process.env.TAURI_RESOURCE_DIR = resources;
    expect(resolveStandaloneOpenClawBinary("/apps/node/dist")).toBe(join(binDir, "openclaw"));
  });
});
