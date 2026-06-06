import { describe, expect, it } from "vitest";

import { parseTerminalSlashCommand } from "../../src/lib/terminal-slash-commands.js";

describe("terminal slash commands", () => {
  it("parses /model default", () => {
    expect(parseTerminalSlashCommand("/model default")).toEqual({ type: "model_default" });
  });

  it("parses /explain with topic", () => {
    expect(parseTerminalSlashCommand("/explain deploy failure")).toEqual({
      type: "explain",
      topic: "deploy failure",
    });
  });

  it("parses /openclaw with prompt", () => {
    expect(parseTerminalSlashCommand("/openclaw deploy nginx")).toEqual({
      type: "openclaw",
      prompt: "deploy nginx",
    });
  });

  it("parses /step 2 as zero-based index 1", () => {
    expect(parseTerminalSlashCommand("/step 2")).toEqual({ type: "step", stepIndex: 1 });
  });

  it("falls through unknown slash to NL assist", () => {
    expect(parseTerminalSlashCommand("/usr/bin/foo")).toEqual({
      type: "nl",
      prompt: "/usr/bin/foo",
    });
  });
});
