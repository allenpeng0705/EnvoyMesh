/**
 * Phase G / 12b — autoRunPolicy → per-tool ask mapping.
 */

import { describe, expect, it } from "vitest";

import {
  isAcpSafeBashCommand,
  shouldAskAcpTool,
} from "../src/agent-runtime-envoy/acp-policy.js";

describe("shouldAskAcpTool", () => {
  it("off never asks", () => {
    expect(shouldAskAcpTool("bash", "off")).toBe(false);
    expect(shouldAskAcpTool("read_file", "off")).toBe(false);
    expect(shouldAskAcpTool("bash", "never")).toBe(false);
  });

  it("safe-only asks only for non-safe tools", () => {
    expect(shouldAskAcpTool("read_file", "safe-only")).toBe(false);
    expect(shouldAskAcpTool("git", "safe-only")).toBe(false);
    expect(shouldAskAcpTool("bash", "safe-only")).toBe(true); // no args → unclassifiable
    expect(shouldAskAcpTool("write", "safe-only")).toBe(true);
  });

  it("safe-only auto-allows read-only bash commands (Codex-style)", () => {
    expect(
      shouldAskAcpTool("bash", "safe-only", {
        command: "ls -la /Users/me/proj",
      }),
    ).toBe(false);
    expect(
      shouldAskAcpTool("bash", "safe-only", {
        command: "cat src/index.ts",
      }),
    ).toBe(false);
    expect(
      shouldAskAcpTool("bash", "safe-only", {
        command: "git status --short",
      }),
    ).toBe(false);
    // Unsafe / compound / redirecting commands still ask.
    expect(
      shouldAskAcpTool("bash", "safe-only", {
        command: "rm -rf /tmp/x",
      }),
    ).toBe(true);
    expect(
      shouldAskAcpTool("bash", "safe-only", {
        command: "ls | grep x",
      }),
    ).toBe(true);
    expect(
      shouldAskAcpTool("bash", "safe-only", {
        command: "echo hi > file.txt",
      }),
    ).toBe(true);
  });

  it("classifies read-only bash commands", () => {
    expect(isAcpSafeBashCommand("ls -la")).toBe(true);
    expect(isAcpSafeBashCommand("git diff --stat")).toBe(true);
    expect(isAcpSafeBashCommand("cat package.json")).toBe(true);
    expect(isAcpSafeBashCommand("ls && rm -rf /")).toBe(false);
    expect(isAcpSafeBashCommand("curl http://x")).toBe(false);
    expect(isAcpSafeBashCommand("")).toBe(false);
  });

  it("always-confirm asks for every tool", () => {
    expect(shouldAskAcpTool("read_file", "always-confirm")).toBe(true);
    expect(shouldAskAcpTool("bash", "always-confirm")).toBe(true);
  });
});
