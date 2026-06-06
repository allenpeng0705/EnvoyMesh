import { describe, expect, it } from "vitest";

import {
  parseAssistantTerminalCommand,
  parseTerminalAssistantCorrelationId,
  stripTerminalAssistantCorrelationPrefix,
} from "../src/terminal-assistant-command.js";

describe("parseAssistantTerminalCommand", () => {
  it("parses fenced terminal block (first line only)", () => {
    const result = parseAssistantTerminalCommand(
      "Try this:\n```terminal\nnpm test\nnpm run lint\n```",
    );
    expect(result?.command).toBe("npm test");
    expect(result?.rationale).toContain("terminal block");
  });

  it("parses TERMINAL_CMD line", () => {
    const result = parseAssistantTerminalCommand("TERMINAL_CMD: git status");
    expect(result?.command).toBe("git status");
  });

  it("returns undefined when no command marker", () => {
    expect(parseAssistantTerminalCommand("Just some advice without a command.")).toBeUndefined();
  });
});

describe("terminal assistant correlation prefix", () => {
  it("parses and strips correlationId prefix", () => {
    const message = "[correlationId=abc-123]\nWhy did npm fail?";
    expect(parseTerminalAssistantCorrelationId(message)).toBe("abc-123");
    expect(stripTerminalAssistantCorrelationPrefix(message)).toBe("Why did npm fail?");
  });
});
