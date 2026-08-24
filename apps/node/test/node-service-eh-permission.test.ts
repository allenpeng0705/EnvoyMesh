/**
 * EH tool permission bridge — emits eh:permission, resolves on respond/timeout.
 */

import { describe, expect, it, vi } from "vitest";

import { EhPermissionBridge } from "../src/node-service-eh-permission.js";

describe("EhPermissionBridge", () => {
  it("emits eh:permission and resolves allow when UI responds", async () => {
    const emitted: Array<{ requestId: string; toolName: string }> = [];
    const bridge = new EhPermissionBridge((event, payload) => {
      expect(event).toBe("eh:permission");
      emitted.push({ requestId: payload.requestId, toolName: payload.toolName });
    });

    const pending = bridge.request({
      sessionId: "sess-eh",
      toolName: "bash",
      description: "run tests",
      args: { command: "npm test" },
    });

    await vi.waitFor(() => expect(emitted).toHaveLength(1));
    const delivered = bridge.respond(emitted[0]!.requestId, "allow");
    expect(delivered).toEqual({ delivered: true });
    await expect(pending).resolves.toBe("allow");
  });

  it("auto-denies on timeout", async () => {
    vi.useFakeTimers();
    try {
      const bridge = new EhPermissionBridge(() => {}, { timeoutMs: 100 });
      const pending = bridge.request({
        sessionId: "sess-eh",
        toolName: "write",
        description: "write file",
        args: {},
      });
      await vi.advanceTimersByTimeAsync(150);
      await expect(pending).resolves.toBe("deny");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clear() denies all pending requests", async () => {
    const bridge = new EhPermissionBridge(() => {});
    const pending = bridge.request({
      sessionId: "sess-eh",
      toolName: "edit",
      description: "edit file",
      args: {},
    });
    bridge.clear();
    await expect(pending).resolves.toBe("deny");
    expect(bridge.size).toBe(0);
  });

  it("returns delivered:false for unknown requestId", () => {
    const bridge = new EhPermissionBridge(() => {});
    expect(bridge.respond("missing", "allow")).toEqual({ delivered: false });
  });
});
