import { describe, expect, it } from "vitest";

import { parseTerminalSlashCommand } from "../../src/lib/terminal-slash-commands.js";

describe("parseTerminalSlashCommand goal commands", () => {
  it("parses /goal with prompt", () => {
    expect(parseTerminalSlashCommand("/goal run tests until green")).toEqual({
      type: "goal",
      prompt: "run tests until green",
    });
  });

  it("parses goal stop aliases", () => {
    expect(parseTerminalSlashCommand("/goalstop")).toEqual({ type: "goal_stop" });
    expect(parseTerminalSlashCommand("/goal-stop")).toEqual({ type: "goal_stop" });
  });

  it("parses goal continue aliases", () => {
    expect(parseTerminalSlashCommand("/goalcontinue")).toEqual({ type: "goal_continue" });
    expect(parseTerminalSlashCommand("/goal-continue")).toEqual({ type: "goal_continue" });
  });
});
