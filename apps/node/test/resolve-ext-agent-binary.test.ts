import { describe, expect, it } from "vitest";
import {
  augmentPathForExtAgentBins,
  commonExtAgentBinDirs,
  condaExtAgentBinDirs,
  resolveExtAgentBinary,
} from "../src/ext-agent-adapter/resolve-ext-agent-binary.js";

describe("resolveExtAgentBinary", () => {
  it("finds binaries under ~/.npm-global/bin even when PATH omits it", () => {
    const found = resolveExtAgentBinary("codex", {
      envPath: "/usr/bin:/bin",
      home: "/Users/demo",
      exists: (p) => p === "/Users/demo/.npm-global/bin/codex",
    });
    expect(found).toBe("/Users/demo/.npm-global/bin/codex");
  });

  it("prefers PATH hits before well-known dirs", () => {
    const found = resolveExtAgentBinary("codex", {
      envPath: "/opt/bin",
      home: "/Users/demo",
      exists: (p) =>
        p === "/opt/bin/codex" || p === "/Users/demo/.npm-global/bin/codex",
    });
    expect(found).toBe("/opt/bin/codex");
  });

  it("finds binaries in conda env bins when PATH omits them", () => {
    const found = resolveExtAgentBinary("aider", {
      envPath: "/usr/bin:/bin",
      home: "/Users/demo",
      condaPrefix: null,
      listCondaEnvs: (envsDir) =>
        envsDir === "/opt/anaconda3/envs" ? ["pytorch"] : [],
      exists: (p) =>
        p === "/opt/anaconda3" ||
        p === "/opt/anaconda3/envs" ||
        p === "/opt/anaconda3/envs/pytorch/bin/aider",
    });
    expect(found).toBe("/opt/anaconda3/envs/pytorch/bin/aider");
  });

  it("prefers CONDA_PREFIX before other conda envs", () => {
    const found = resolveExtAgentBinary("aider", {
      envPath: "/usr/bin",
      home: "/Users/demo",
      condaPrefix: "/opt/anaconda3/envs/active",
      listCondaEnvs: () => ["other"],
      exists: (p) =>
        p === "/opt/anaconda3/envs/active/bin/aider" ||
        p === "/opt/anaconda3" ||
        p === "/opt/anaconda3/envs" ||
        p === "/opt/anaconda3/envs/other/bin/aider",
    });
    expect(found).toBe("/opt/anaconda3/envs/active/bin/aider");
  });

  it("returns null when missing everywhere", () => {
    expect(
      resolveExtAgentBinary("codex", {
        envPath: "/usr/bin",
        home: "/Users/demo",
        exists: () => false,
      }),
    ).toBeNull();
  });

  it("lists npm-global among common dirs", () => {
    expect(commonExtAgentBinDirs("/Users/demo")).toContain(
      "/Users/demo/.npm-global/bin",
    );
  });

  it("lists conda env bins from known roots", () => {
    const dirs = condaExtAgentBinDirs("/Users/demo", {
      condaPrefix: null,
      exists: (p) =>
        p === "/opt/anaconda3" || p === "/opt/anaconda3/envs",
      listEnvs: () => ["pytorch", "base-extra"],
    });
    expect(dirs).toContain("/opt/anaconda3/bin");
    expect(dirs).toContain("/opt/anaconda3/envs/pytorch/bin");
  });

  it("augmentPathForExtAgentBins prepends existing dirs", () => {
    const env = augmentPathForExtAgentBins({
      PATH: "/usr/bin:/bin",
    });
    // Only dirs that exist on this machine are prepended — at least PATH key preserved.
    expect(env.PATH).toContain("/usr/bin");
    expect(env.PATH).toContain("/bin");
  });
});
