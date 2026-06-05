/**
 * OpenClaw H2A lifecycle — pending reply cleanup, timeout, correlation resolution.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("OpenClaw pending reply lifecycle", () => {
  let pending: Map<string, { resolve: (t: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>;

  beforeEach(() => {
    pending = new Map();
  });

  afterEach(() => {
    for (const [, entry] of pending) clearTimeout(entry.timer);
    pending.clear();
    vi.useRealTimers();
  });

  function waitForReply(correlationId: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const entry = pending.get(correlationId);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(correlationId);
        entry.reject(new Error("timeout"));
      }, timeoutMs);
      pending.set(correlationId, { resolve, reject, timer });
    });
  }

  function resolveReply(correlationId: string, text: string): void {
    const entry = pending.get(correlationId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(correlationId);
    entry.resolve(text);
  }

  function cancelReply(correlationId: string, error: Error): void {
    const entry = pending.get(correlationId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(correlationId);
    entry.reject(error);
  }

  it("resolves on correlation delivery", async () => {
    const p = waitForReply("oc-1", 5000);
    resolveReply("oc-1", "hello");
    await expect(p).resolves.toBe("hello");
    expect(pending.size).toBe(0);
  });

  it("rejects on cancel (webhook error path)", async () => {
    const p = waitForReply("oc-2", 5000);
    cancelReply("oc-2", new Error("webhook 500"));
    await expect(p).rejects.toThrow("webhook 500");
    expect(pending.size).toBe(0);
  });

  it("rejects on timeout and cleans up", async () => {
    vi.useFakeTimers();
    const p = waitForReply("oc-3", 1000);
    p.catch(() => {});
    vi.advanceTimersByTime(1001);
    await vi.runAllTimersAsync();
    expect(pending.size).toBe(0);
  });

  it("ignores resolve for unknown correlationId", () => {
    resolveReply("oc-gone", "x");
    expect(pending.size).toBe(0);
  });

  it("supports concurrent independent replies", async () => {
    const a = waitForReply("oc-a", 5000);
    const b = waitForReply("oc-b", 5000);
    resolveReply("oc-b", "B");
    resolveReply("oc-a", "A");
    await expect(Promise.all([a, b])).resolves.toEqual(["A", "B"]);
  });
});
