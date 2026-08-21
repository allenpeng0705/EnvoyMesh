/**
 * Phase G / 12b — autoRunPolicy → per-tool ask mapping.
 */

import { describe, expect, it } from "vitest";

import { shouldAskAcpTool } from "../src/agent-runtime-envoy/acp-policy.js";

describe("shouldAskAcpTool", () => {
  it("off never asks", () => {
    expect(shouldAskAcpTool("bash", "off")).toBe(false);
    expect(shouldAskAcpTool("read_file", "off")).toBe(false);
  });

  it("safe-only asks only for non-safe tools", () => {
    expect(shouldAskAcpTool("read_file", "safe-only")).toBe(false);
    expect(shouldAskAcpTool("git", "safe-only")).toBe(false);
    expect(shouldAskAcpTool("bash", "safe-only")).toBe(true);
    expect(shouldAskAcpTool("write", "safe-only")).toBe(true);
  });

  it("always-confirm asks for every tool", () => {
    expect(shouldAskAcpTool("read_file", "always-confirm")).toBe(true);
    expect(shouldAskAcpTool("bash", "always-confirm")).toBe(true);
  });
});
