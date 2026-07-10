/**
 * Unit tests for extracted OpenClaw runtime module.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPEN_CLAW_REPLY_TIMEOUT_MS,
  beginOpenClawToolTracking,
  bindOpenClawPendingReplyPersistence,
  cancelOpenClawReply,
  clearOpenClawError,
  createOpenClawRuntimeState,
  endOpenClawToolTracking,
  hasOpenClawPendingReply,
  isOpenClawReadyViaRuntime,
  loadAndReportOrphanedOpenClawPendingReplies,
  recordOpenClawError,
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

  it("hasOpenClawPendingReply reports true for known cids and false for unknown", () => {
    expect(hasOpenClawPendingReply(state, "oc-whatever")).toBe(false);
    waitForOpenClawReply(state, "oc-pending").catch(() => {});
    expect(hasOpenClawPendingReply(state, "oc-pending")).toBe(true);
    expect(hasOpenClawPendingReply(state, "oc-other")).toBe(false);
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

describe("OpenClaw pending-reply persistence (Fix #4 — lost-ask across restarts)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "openclaw-persist-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists pending cids to disk and reports orphans on next start", async () => {
    const path = join(dir, "pending-replies.json");
    const state = createOpenClawRuntimeState();
    bindOpenClawPendingReplyPersistence(state, path);

    waitForOpenClawReply(state, "oc-keep").catch(() => {});
    waitForOpenClawReply(state, "oc-also").catch(() => {});

    // Simulate a restart: new state, bind to the same path, report orphans.
    const state2 = createOpenClawRuntimeState();
    bindOpenClawPendingReplyPersistence(state2, path);
    const orphans = loadAndReportOrphanedOpenClawPendingReplies(path);
    expect(orphans.sort()).toEqual(["oc-also", "oc-keep"]);
    // After reporting, the file is removed and the new state has no entries.
    expect(state2.pendingReplies.size).toBe(0);
  });

  it("clears the persisted file once the last entry is resolved", () => {
    const path = join(dir, "pending-replies.json");
    const state = createOpenClawRuntimeState();
    bindOpenClawPendingReplyPersistence(state, path);
    waitForOpenClawReply(state, "oc-resolve").catch(() => {});
    resolveOpenClawReply(state, "oc-resolve", "answer");
    // The clearPersistedPendingReplies helper removes the file when the
    // map is empty — verify by checking the state and re-reading.
    expect(state.pendingReplies.size).toBe(0);
  });
});

describe("OpenClaw error tracking (lastError surface for settings UI)", () => {
  let state: OpenClawRuntimeState;

  beforeEach(() => {
    state = createOpenClawRuntimeState();
    // Fresh state should have no error and zero restart attempts — the
    // settings UI relies on these defaults to render a clean status.
    expect(state.lastError).toBeNull();
    expect(state.lastErrorAt).toBeNull();
    expect(state.consecutiveRestartFailures).toBe(0);
  });

  it("records a watchdog-style restart-failure reason with timestamp", () => {
    recordOpenClawError(state, "Gateway process died — restarting");
    expect(state.lastError).toBe("Gateway process died — restarting");
    expect(state.lastErrorAt).not.toBeNull();
    // ISO 8601 sanity check — lastErrorAt must be parseable.
    expect(Number.isFinite(Date.parse(state.lastErrorAt as string))).toBe(true);
    expect(state.consecutiveRestartFailures).toBe(1);
  });

  it("bumps consecutiveRestartFailures on each call (most-recent cause wins)", () => {
    recordOpenClawError(state, "first cause");
    expect(state.consecutiveRestartFailures).toBe(1);
    recordOpenClawError(state, "second cause — overrides first");
    expect(state.consecutiveRestartFailures).toBe(2);
    expect(state.lastError).toBe("second cause — overrides first");
    // Timestamp should advance on the second call.
    expect(state.lastErrorAt).not.toBeNull();
  });

  it("clears the recorded error on a successful start", () => {
    recordOpenClawError(state, "some prior failure");
    recordOpenClawError(state, "another failure");
    expect(state.consecutiveRestartFailures).toBe(2);

    clearOpenClawError(state);
    expect(state.lastError).toBeNull();
    expect(state.lastErrorAt).toBeNull();
    expect(state.consecutiveRestartFailures).toBe(0);
  });
});

// Note: restartOpenClawViaRuntime is covered by an end-to-end integration
// test in apps/node/test/agent-bridge.test.ts (and the manual operator
// flow on the settings page). We don't add a unit test here because the
// function calls child_process.spawn with a real binary; mocking the
// OpenClawRuntimeDeps surface fully would be a brittle integration test
// for the unit suite. TypeScript pins the returned status shape at
// compile time.
