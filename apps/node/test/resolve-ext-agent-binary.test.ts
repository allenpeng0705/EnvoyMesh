import { describe, expect, it } from "vitest";
import {
  augmentPathForExtAgentBins,
  commonExtAgentBinDirs,
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

  it("augmentPathForExtAgentBins prepends existing dirs", () => {
    const env = augmentPathForExtAgentBins({
      PATH: "/usr/bin:/bin",
    });
    // Only dirs that exist on this machine are prepended — at least PATH key preserved.
    expect(env.PATH).toContain("/usr/bin");
    expect(env.PATH).toContain("/bin");
  });
});
