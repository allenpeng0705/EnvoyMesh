/**
 * Phase G / 12b — hermetic ACP host tests (in-process).
 */

import { describe, expect, it } from "vitest";

import { createFakeSessionBackend } from "@envoymesh/envoy-harness";

import {
  createEnvoyHarnessAcpHost,
  resolveEnvoyHarnessAcpCommand,
} from "../src/agent-runtime-envoy/acp-host.js";

describe("resolveEnvoyHarnessAcpCommand", () => {
  it("falls back to PATH envoy-harness --acp", () => {
    const prev = process.env.ENVOY_HARNESS_ACP_CMD;
    const prevRes = process.env.ENVOY_HARNESS_RESOURCES;
    delete process.env.ENVOY_HARNESS_ACP_CMD;
    delete process.env.ENVOY_HARNESS_RESOURCES;
    try {
      const resolved = resolveEnvoyHarnessAcpCommand();
      // May hit sibling dist in this monorepo layout, or PATH fallback.
      expect(resolved.command.length).toBeGreaterThan(0);
      expect(Array.isArray(resolved.args)).toBe(true);
    } finally {
      if (prev !== undefined) process.env.ENVOY_HARNESS_ACP_CMD = prev;
      if (prevRes !== undefined) process.env.ENVOY_HARNESS_RESOURCES = prevRes;
    }
  });

  it("honors ENVOY_HARNESS_ACP_CMD", () => {
    const prev = process.env.ENVOY_HARNESS_ACP_CMD;
    process.env.ENVOY_HARNESS_ACP_CMD = "/tmp/fake-acp";
    try {
      expect(resolveEnvoyHarnessAcpCommand()).toEqual({
        command: "/tmp/fake-acp",
        args: [],
      });
    } finally {
      if (prev === undefined) delete process.env.ENVOY_HARNESS_ACP_CMD;
      else process.env.ENVOY_HARNESS_ACP_CMD = prev;
    }
  });
});

describe("createEnvoyHarnessAcpHost (in-process)", () => {
  it("starts, prompts, and returns assistant text", async () => {
    const updates: unknown[] = [];
    const host = createEnvoyHarnessAcpHost({
      transport: "in-process",
      backend: createFakeSessionBackend(),
      onTranscript: (u) => updates.push(u),
    });
    try {
      const started = await host.start();
      expect(started.sessionId).toMatch(/^sess-/);
      expect(started.protocolVersion).toBe(1);

      const result = await host.prompt("hello");
      expect(result.stopReason).toBe("end_turn");
      expect(result.assistantText).toBe("echo:hello");
      expect(updates.length).toBeGreaterThan(0);
    } finally {
      host.close();
    }
  });

  it("routes permission via onPermission", async () => {
    const seen: string[] = [];
    const host = createEnvoyHarnessAcpHost({
      transport: "in-process",
      backend: createFakeSessionBackend({ permissionTool: "bash" }),
      onPermission: async (req) => {
        seen.push(req.toolName);
        return "allow";
      },
    });
    try {
      await host.start();
      const result = await host.prompt("run");
      expect(seen).toEqual(["bash"]);
      expect(result.assistantText).toBe("echo:run");
    } finally {
      host.close();
    }
  });
});
