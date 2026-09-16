import { describe, expect, it } from "vitest";
import { classifyExtAgentInstallState } from "../src/probe.js";

describe("classifyExtAgentInstallState bundler agents", () => {
  it("does not mark Nova Ready just because npx is on PATH", async () => {
    const result = await classifyExtAgentInstallState(
      "nova",
      async (cmd) => (cmd === "npx" ? true : false),
    );
    expect(result.installState).toBe("not-installed");
    expect(result.installGuide?.command).toBe("Nova");
    expect(result.installGuide?.installCommand).toContain("@compass-ai/nova");
    expect(result.installGuide?.startHint).toMatch(/fetched from npm/i);
    expect(result.installGuide?.homepageUrl).toContain("compassap");
  });

  it("does not mark Qwen Code Ready just because npx is on PATH", async () => {
    const result = await classifyExtAgentInstallState(
      "qwen-code",
      async (cmd) => (cmd === "npx" ? true : false),
    );
    expect(result.installState).toBe("not-installed");
    expect(result.installGuide?.installCommand).toContain("@qwen-code/qwen-code");
    expect(result.installGuide?.startHint).toMatch(/first run/i);
  });

  it("points at Node.js downloads when npx is missing", async () => {
    const result = await classifyExtAgentInstallState(
      "nova",
      async () => false,
    );
    expect(result.installState).toBe("not-installed");
    expect(result.installGuide?.homepageUrl).toContain("nodejs.org");
    expect(result.installGuide?.startHint).toMatch(/Install Node\.js/i);
    expect(result.installGuide?.installCommand).toMatch(/Node\.js/i);
  });

  it("points at uv docs when uvx is missing", async () => {
    const result = await classifyExtAgentInstallState(
      "minion-code",
      async () => false,
    );
    expect(result.installState).toBe("not-installed");
    expect(result.installGuide?.homepageUrl).toContain("astral.sh/uv");
    expect(result.installGuide?.startHint).toMatch(/Install uv/i);
    expect(result.installGuide?.installCommand).toMatch(/uvx/i);
  });

  it("still marks Claude Code installed when claude is on PATH", async () => {
    const result = await classifyExtAgentInstallState(
      "claudecode",
      async (cmd) => (cmd === "claude" ? true : false),
    );
    expect(result.installState).toBe("installed");
  });

  it("marks Claude Code not-installed when claude is missing", async () => {
    const result = await classifyExtAgentInstallState(
      "claudecode",
      async () => false,
    );
    expect(result.installState).toBe("not-installed");
  });
});
