import { describe, expect, it } from "vitest";
import { TransferTracker } from "../src/transfer-tracker.js";

describe("TransferTracker", () => {
  it("lists only negotiating and transferring as active", () => {
    const tracker = new TransferTracker();
    tracker.upsert({
      correlationId: "a",
      phase: "negotiating",
      updatedAt: new Date().toISOString(),
    });
    tracker.upsert({
      correlationId: "b",
      phase: "verified",
      updatedAt: new Date().toISOString(),
    });
    tracker.upsert({
      correlationId: "c",
      phase: "transferring",
      updatedAt: new Date().toISOString(),
    });
    const active = tracker.listActive();
    expect(active.map((t) => t.correlationId).sort()).toEqual(["a", "c"]);
  });

  it("evicts oldest terminal transfers when cap exceeded", () => {
    const tracker = new TransferTracker({ maxTerminalEntries: 2 });
    const old = new Date(Date.now() - 60_000).toISOString();
    const mid = new Date(Date.now() - 30_000).toISOString();
    const recent = new Date().toISOString();

    tracker.upsert({ correlationId: "old", phase: "verified", updatedAt: old });
    tracker.upsert({ correlationId: "mid", phase: "failed", updatedAt: mid });
    tracker.upsert({ correlationId: "recent", phase: "verified", updatedAt: recent });

    expect(tracker.get("old")).toBeUndefined();
    expect(tracker.get("mid")).toBeDefined();
    expect(tracker.get("recent")).toBeDefined();
  });

  it("evicts terminal transfers older than TTL", () => {
    const tracker = new TransferTracker({ terminalTtlMs: 1_000 });
    const stale = new Date(Date.now() - 5_000).toISOString();
    tracker.upsert({ correlationId: "stale", phase: "verified", updatedAt: stale });
    tracker.upsert({ correlationId: "fresh", phase: "negotiating", updatedAt: new Date().toISOString() });

    expect(tracker.get("stale")).toBeUndefined();
    expect(tracker.get("fresh")).toBeDefined();
  });
});
