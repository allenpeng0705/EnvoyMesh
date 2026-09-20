/**
 * Tool permission bridge — emits its configured event, resolves on respond/timeout.
 *
 * One bridge serves the EH dock and the Coding dock, so the legs below pin the *option* rather
 * than the class: the event name is what keeps a Coding prompt out of the EH dock, and it is the
 * only thing the two callers configure differently.
 */

import { describe, expect, it, vi } from "vitest";

import { ToolPermissionBridge } from "../src/tool-permission-bridge.js";

describe("ToolPermissionBridge", () => {
  it("emits eh:permission and resolves allow when UI responds", async () => {
    const emitted: Array<{ requestId: string; toolName: string }> = [];
    const bridge = new ToolPermissionBridge((event, payload) => {
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
      const bridge = new ToolPermissionBridge(() => {}, { timeoutMs: 100 });
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
    const bridge = new ToolPermissionBridge(() => {});
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
    const bridge = new ToolPermissionBridge(() => {});
    expect(bridge.respond("missing", "allow")).toEqual({ delivered: false });
  });

  it("emits the configured event name, so a Coding prompt never reaches the EH dock", async () => {
    const events: string[] = [];
    const bridge = new ToolPermissionBridge(
      (event) => {
        events.push(event);
      },
      { eventName: "coding:permission" },
    );
    bridge.request({
      sessionId: "coding-sess",
      toolName: "bash",
      description: "run",
      args: {},
    });
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events).toEqual(["coding:permission"]);
  });

  it("attributes the prompt to the chat owning the session", async () => {
    const emitted: Array<{ sessionId: string; chatId?: string }> = [];
    const bridge = new ToolPermissionBridge(
      (event, payload) => {
        emitted.push({ sessionId: payload.sessionId, chatId: payload.chatId });
      },
      {
        getChatIdForSession: (sessionId) =>
          sessionId === "sess-active" ? "chat-1" : undefined,
      },
    );
    bridge.request({
      sessionId: "sess-active",
      toolName: "bash",
      description: "run",
      args: {},
    });
    bridge.request({
      sessionId: "sess-other",
      toolName: "bash",
      description: "run",
      args: {},
    });
    await vi.waitFor(() => expect(emitted).toHaveLength(2));
    expect(emitted.find((e) => e.sessionId === "sess-active")?.chatId).toBe(
      "chat-1",
    );
    expect(emitted.find((e) => e.sessionId === "sess-other")?.chatId).toBeUndefined();
  });

  it("clearForSession denies only that session's pending request", async () => {
    const bridge = new ToolPermissionBridge(() => {}, { timeoutMs: 5000 });
    const a = bridge.request({
      sessionId: "sess-a",
      toolName: "bash",
      description: "a",
      args: {},
    });
    const b = bridge.request({
      sessionId: "sess-b",
      toolName: "bash",
      description: "b",
      args: {},
    });
    bridge.clearForSession("sess-a");
    await expect(a).resolves.toBe("deny");
    expect(bridge.size).toBe(1);
    bridge.clear();
    await expect(b).resolves.toBe("deny");
  });
});
