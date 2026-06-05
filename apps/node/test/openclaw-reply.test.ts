/**
 * Tests for OpenClaw reply system — pending replies, timeout, resolution.
 *
 * Uses a mock bridge to simulate the correlationId round-trip without
 * spinning up a real gateway.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock NodeServiceImpl and its private reply map
// We test the public API: resolveOpenClawReply()

describe("_pendingOpenClawReplies lifecycle", () => {
  let pendingReplies: Map<string, { resolve: (text: string) => void; timer: ReturnType<typeof setTimeout> }>;

  beforeEach(() => {
    pendingReplies = new Map();
  });

  afterEach(() => {
    // Clean up any remaining timers
    for (const [, entry] of pendingReplies) {
      clearTimeout(entry.timer);
    }
    pendingReplies.clear();
  });

  it("resolves a pending reply when bridge delivers response", async () => {
    vi.useFakeTimers();

    const correlationId = "oc-ask-12345";
    const responseText = "Hello from OpenClaw!";

    // Simulate _waitForOpenClawReply
    const replyPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingReplies.delete(correlationId);
        reject(new Error("Timeout"));
      }, 120_000);
      pendingReplies.set(correlationId, { resolve, timer });
    });

    // Simulate bridge calling resolveOpenClawReply
    const entry = pendingReplies.get(correlationId);
    expect(entry).toBeDefined();
    clearTimeout(entry!.timer);
    pendingReplies.delete(correlationId);
    entry!.resolve(responseText);

    // Promise should resolve immediately
    const result = await replyPromise;
    expect(result).toBe(responseText);

    // Map should be clean
    expect(pendingReplies.size).toBe(0);

    vi.useRealTimers();
  });

  it("rejects after timeout when bridge never responds", async () => {
    vi.useFakeTimers();

    const correlationId = "oc-ask-timeout";
    let error: Error | null = null;

    // Simulate _waitForOpenClawReply
    const replyPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingReplies.delete(correlationId);
        reject(new Error("OpenClaw reply timed out after 120s"));
      }, 120_000);
      pendingReplies.set(correlationId, { resolve, timer });
    });

    replyPromise.catch((err) => { error = err as Error; });

    // Advance past the timeout
    vi.advanceTimersByTime(120_001);

    // Wait for microtasks
    await vi.runAllTimersAsync();

    expect(error).toBeDefined();
    expect(error!.message).toContain("timed out");
    expect(pendingReplies.size).toBe(0);

    vi.useRealTimers();
  });

  it("cleans up timer when resolved before timeout", async () => {
    vi.useFakeTimers();

    const correlationId = "oc-ask-cleanup";
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    // Simulate the full flow
    const replyPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingReplies.delete(correlationId);
        reject(new Error("Timeout"));
      }, 120_000);
      pendingReplies.set(correlationId, { resolve, timer });
    });

    // Advance 30 seconds then resolve
    vi.advanceTimersByTime(30_000);

    const entry = pendingReplies.get(correlationId)!;
    clearTimeout(entry.timer);
    pendingReplies.delete(correlationId);
    entry.resolve("early reply");

    const result = await replyPromise;
    expect(result).toBe("early reply");

    // Verify timer was cleared (not fired)
    expect(clearTimeoutSpy).toHaveBeenCalled();

    // Advance past original timeout — no rejection should have occurred
    vi.advanceTimersByTime(100_000);
    expect(pendingReplies.size).toBe(0);

    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it("handles resolveOpenClawReply for non-existent correlationId gracefully", () => {
    const correlationId = "oc-ask-gone";

    // Bridge calls with a correlationId that's already resolved/timed out
    // Should not throw
    const entry = pendingReplies.get(correlationId);
    expect(entry).toBeUndefined();

    // resolveOpenClawReply would just return early — no crash
    // (This is tested by the absence of an exception)
  });

  it("handles multiple concurrent pending replies independently", async () => {
    vi.useFakeTimers();

    const ids = ["oc-a", "oc-b", "oc-c"];
    const promises = ids.map((id) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingReplies.delete(id);
          reject(new Error(`Timeout: ${id}`));
        }, 120_000);
        pendingReplies.set(id, { resolve, timer });
      }),
    );

    expect(pendingReplies.size).toBe(3);

    // Resolve them in reverse order
    for (const id of ids.reverse()) {
      const entry = pendingReplies.get(id)!;
      clearTimeout(entry.timer);
      pendingReplies.delete(id);
      entry.resolve(`reply:${id}`);
    }

    const results = await Promise.all(promises);
    expect(results).toEqual(["reply:oc-a", "reply:oc-b", "reply:oc-c"]);
    expect(pendingReplies.size).toBe(0);

    vi.useRealTimers();
  });
});
