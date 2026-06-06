import { describe, expect, it, vi } from "vitest";

import {
  collectAssistContextRequests,
  formatAssistContextBlock,
  loadAssistContextSnippets,
  stripAssistContextMarkers,
} from "../src/terminal-assist-context.js";

describe("terminal-assist-context", () => {
  it("collects vault workspace and git markers", () => {
    expect(
      collectAssistContextRequests("fix @vault:docs/runbook.md using @git:diff and @workspace:AGENTS.md"),
    ).toEqual({
      vaultPaths: ["docs/runbook.md"],
      workspacePaths: ["AGENTS.md"],
      gitCommands: ["diff"],
    });
  });

  it("strips markers from prompt", () => {
    expect(stripAssistContextMarkers("@vault:a.md do thing @git:stat")).toBe("do thing");
  });

  it("loads snippets from readers", async () => {
    const snippets = await loadAssistContextSnippets({
      prompt: "@vault:notes.txt @git:last",
      cwd: "/repo",
      readers: {
        readVaultSnippet: vi.fn().mockResolvedValue("vault content"),
        runReadOnlyGit: vi.fn().mockResolvedValue("abc123 commit"),
      },
    });
    expect(snippets).toHaveLength(2);
    expect(formatAssistContextBlock(snippets)).toContain("@vault:notes.txt");
  });
});
