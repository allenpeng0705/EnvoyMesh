/**
 * Unit tests for extracted OpenClaw runtime module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPEN_CLAW_REPLY_TIMEOUT_MS,
  beginOpenClawToolTracking,
  cancelOpenClawReply,
  createOpenClawRuntimeState,
  endOpenClawToolTracking,
  isOpenClawReadyViaRuntime,
  recordOpenClawToolCallViaRuntime,
  rejectAllPendingOpenClawReplies,
  resolveOpenClawReply,
  stopOpenClawViaRuntime,
  waitForOpenClawReply,
  type OpenClawRuntimeState,
} from "../src/node-service-openclaw-runtime.js";

describe("OpenClaw runtime state helpers", () => {
  let state: OpenClawRuntimeState;

  beforeEach(() => {
    state = createOpenClawRuntimeState();
  });

  afterEach(() => {
    rejectAllPendingOpenClawReplies(state, "test cleanup");
    vi.useRealTimers();
  });

  it("creates default state with empty pending replies", () => {
    expect(state.pendingReplies.size).toBe(0);
    expect(state.gatewayReady).toBe(false);
    expect(state.assistantAgentUrl).toContain("18789");
  });

  it("resolves pending reply by correlation id", async () => {
    const p = waitForOpenClawReply(state, "oc-test-1");
    resolveOpenClawReply(state, "oc-test-1", "answer text");
    await expect(p).resolves.toBe("answer text");
    expect(state.pendingReplies.size).toBe(0);
  });

  it("rejects pending reply on cancel", async () => {
    const p = waitForOpenClawReply(state, "oc-test-2");
    cancelOpenClawReply(state, "oc-test-2", new Error("webhook 500"));
    await expect(p).rejects.toThrow("webhook 500");
  });

  it("rejects all pending replies on stop", async () => {
    const a = waitForOpenClawReply(state, "oc-a");
    const b = waitForOpenClawReply(state, "oc-b");
    a.catch(() => {});
    b.catch(() => {});
    rejectAllPendingOpenClawReplies(state, "OpenClaw stopped");
    await expect(a).rejects.toThrow("OpenClaw stopped");
    await expect(b).rejects.toThrow("OpenClaw stopped");
    expect(state.pendingReplies.size).toBe(0);
  });

  it("times out pending reply after OPEN_CLAW_REPLY_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    const p = waitForOpenClawReply(state, "oc-timeout");
    p.catch(() => {});
    vi.advanceTimersByTime(OPEN_CLAW_REPLY_TIMEOUT_MS + 1);
    await vi.runAllTimersAsync();
    expect(state.pendingReplies.size).toBe(0);
  });

  it("tracks tool calls during an active turn", () => {
    beginOpenClawToolTracking(state);
    recordOpenClawToolCallViaRuntime(state, "mesh.library_search");
    recordOpenClawToolCallViaRuntime(state, "mesh.library_search");
    recordOpenClawToolCallViaRuntime(state, "mesh.send_chat");
    const tools = endOpenClawToolTracking(state);
    expect(tools).toEqual(["mesh.library_search", "mesh.send_chat"]);
    expect(state.activeTurnTools).toBeNull();
  });
});

describe("isOpenClawReadyViaRuntime", () => {
  it("is false when gateway child is missing", () => {
    const state = createOpenClawRuntimeState();
    state.gatewayReady = true;
    expect(isOpenClawReadyViaRuntime(state)).toBe(false);
  });

  it("is true when child is alive and gatewayReady is set", () => {
    const state = createOpenClawRuntimeState();
    state.gatewayReady = true;
    state.gatewayChild = { killed: false } as never;
    expect(isOpenClawReadyViaRuntime(state)).toBe(true);
  });
});

describe("stopOpenClawViaRuntime", () => {
  it("clears pending replies and gateway state", async () => {
    const state = createOpenClawRuntimeState();
    state.gatewayReady = true;
    state.gatewayChild = { killed: false, kill: vi.fn() } as never;
    const pending = waitForOpenClawReply(state, "oc-stop");
    pending.catch(() => {});

    await stopOpenClawViaRuntime(state, {} as never);

    expect(state.gatewayReady).toBe(false);
    expect(state.gatewayChild).toBeNull();
    expect(state.pendingReplies.size).toBe(0);
    expect(state.runtime).toBeNull();
  });
});
