import { describe, expect, it } from "vitest";

import { commandFromPlanStep, parseNumberedPlanSteps } from "../src/terminal-plan-parser.js";

describe("terminal-plan-parser", () => {
  it("parses numbered steps from OpenClaw-style text", () => {
    const text = [
      "Here is a plan:",
      "1. cd /var/log",
      "2. tail -n 50 syslog",
      "3. grep error app.log",
    ].join("\n");
    expect(parseNumberedPlanSteps(text)).toEqual([
      "cd /var/log",
      "tail -n 50 syslog",
      "grep error app.log",
    ]);
  });

  it("extracts command from backtick-wrapped step", () => {
    expect(commandFromPlanStep("`npm test`")).toBe("npm test");
  });

  it("passes through shell-like commands", () => {
    expect(commandFromPlanStep("git status")).toBe("git status");
  });
});
