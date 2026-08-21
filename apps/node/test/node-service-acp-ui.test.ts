/**
 * Phase G / 12b — hermetic ACP permission bridge tests.
 */

import { describe, expect, it, vi } from "vitest";

import { AcpPermissionBridge } from "../src/node-service-acp-ui.js";

describe("AcpPermissionBridge", () => {
  it("resolves allow when Social responds", async () => {
    const emitted: Array<{ requestId: string }> = [];
    const bridge = new AcpPermissionBridge((event, payload) => {
      expect(event).toBe("acp:permission");
      emitted.push(payload);
    });

    const pending = bridge.request({
      sessionId: "sess-1",
      toolName: "bash",
      description: "run ls",
      args: {},
    });

    expect(emitted).toHaveLength(1);
    const delivered = bridge.respond(emitted[0]!.requestId, "allow");
    expect(delivered).toEqual({ delivered: true });
    await expect(pending).resolves.toBe("allow");
  });

  it("auto-denies on timeout", async () => {
    vi.useFakeTimers();
    try {
      const bridge = new AcpPermissionBridge(() => {}, { timeoutMs: 100 });
      const pending = bridge.request({
        sessionId: "sess-1",
        toolName: "bash",
        description: "run ls",
        args: {},
      });
      await vi.advanceTimersByTimeAsync(150);
      await expect(pending).resolves.toBe("deny");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns delivered:false for unknown requestId", () => {
    const bridge = new AcpPermissionBridge(() => {});
    expect(bridge.respond("missing", "allow")).toEqual({ delivered: false });
  });
});
