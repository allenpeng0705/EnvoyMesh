import { describe, expect, it, vi } from "vitest";
import { ApprovalQueue, createApprovalItem } from "../src/approval-queue.js";

/**
 * ApprovalQueue exposes a small `onChange(cb)` registration so callers
 * that cache the pending-count (e.g. NodeServiceImpl's terminal activity
 * enrichment) can invalidate their cache the instant the queue mutates
 * — avoiding staleness in the activity-badge "blocked" indicator.
 *
 * These tests pin the contract:
 *  - `onChange` fires once per mutating method (add, update, remove,
 *    approve, reject, escalate, expireOldItems, clearResolved).
 *  - `onChange` does NOT fire on read-only methods (get, list*,
 *    pendingCount, listByContact).
 *  - `remove()` does NOT fire when the id is absent (no-op).
 *  - The unsubscribe function actually detaches the listener.
 *  - A throwing subscriber does not break other subscribers or the
 *    mutation itself.
 */
describe("ApprovalQueue onChange sink", () => {
  it("fires on add()", () => {
    const q = new ApprovalQueue();
    const cb = vi.fn();
    q.onChange(cb);
    q.add(createApprovalItem("send_chat", "t", "d", "x"));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("fires on update()", () => {
    const q = new ApprovalQueue();
    const item = createApprovalItem("send_chat", "t", "d", "x");
    q.add(item);
    const cb = vi.fn();
    q.onChange(cb);
    const updated = q.update(item.id, { title: "renamed" });
    expect(updated?.title).toBe("renamed");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire on update() when id is unknown (no-op)", () => {
    const q = new ApprovalQueue();
    const cb = vi.fn();
    q.onChange(cb);
    const result = q.update("nope", { title: "x" });
    expect(result).toBeUndefined();
    expect(cb).not.toHaveBeenCalled();
  });

  it("fires on remove(), but only when an id actually existed", () => {
    const q = new ApprovalQueue();
    const item = createApprovalItem("send_chat", "t", "d", "x");
    q.add(item);
    const cb = vi.fn();
    q.onChange(cb);

    // First remove: id exists → fires.
    expect(q.remove(item.id)).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);

    // Second remove: id gone → silent.
    expect(q.remove(item.id)).toBe(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("fires on approve(), reject(), escalate()", () => {
    const q = new ApprovalQueue();
    const approveItem = createApprovalItem("send_chat", "approve", "d", "x");
    const rejectItem = createApprovalItem("send_chat", "reject", "d", "x");
    const escalateItem = createApprovalItem("send_chat", "escalate", "d", "x");
    q.add(approveItem);
    q.add(rejectItem);
    q.add(escalateItem);

    const cb = vi.fn();
    q.onChange(cb);

    q.approve(approveItem.id, "ok");
    expect(cb).toHaveBeenCalledTimes(1);

    q.reject(rejectItem.id, "no");
    expect(cb).toHaveBeenCalledTimes(2);

    q.escalate(escalateItem.id, "low_confidence");
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("fires at least once per expireOldItems() call that moves any item", () => {
    const q = new ApprovalQueue();
    // Item that is already expired (expiresAt in the past).
    const expired = createApprovalItem("send_chat", "t", "d", "x");
    // Mutate via update to set past expiry — createApprovalItem uses
    // +7 days so we need a manual override.
    q.add(expired);
    q.update(expired.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    // adjust expiry; verify pending still
    expect(q.listPending().length).toBe(1);

    const cb = vi.fn();
    q.onChange(cb);

    const expiredIds = q.expireOldItems();
    expect(expiredIds.length).toBeGreaterThan(0);
    // update() fires for each mutated item, so we get ≥1 invocation.
    expect(cb).toHaveBeenCalled();
  });

  it("fires on clearResolved() only when items were actually removed", () => {
    const q = new ApprovalQueue();
    const a = createApprovalItem("send_chat", "t", "d", "x");
    q.add(a);
    q.reject(a.id); // status -> "rejected"
    const cb = vi.fn();
    q.onChange(cb);

    q.clearResolved();
    expect(cb).toHaveBeenCalled();

    cb.mockClear();
    // Nothing left to clear — should stay silent.
    q.clearResolved();
    expect(cb).not.toHaveBeenCalled();
  });

  it("does NOT fire on read-only methods", () => {
    const q = new ApprovalQueue();
    const item = createApprovalItem("send_chat", "t", "d", "x");
    q.add(item);
    const cb = vi.fn();
    q.onChange(cb);

    q.get(item.id);
    q.listPending();
    q.listAll();
    q.listByContact("anyone");
    q.pendingCount();

    expect(cb).not.toHaveBeenCalled();
  });

  it("unsubscribe detaches the listener", () => {
    const q = new ApprovalQueue();
    const cb = vi.fn();
    const unsub = q.onChange(cb);

    q.add(createApprovalItem("send_chat", "t", "d", "x"));
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();

    q.add(createApprovalItem("share_knowledge", "t", "d", "x"));
    expect(cb).toHaveBeenCalledTimes(1); // still 1 — listener detached
  });

  it("a throwing subscriber does not break other subscribers or the mutation", () => {
    const q = new ApprovalQueue();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = vi.fn();
    q.onChange(() => {
      throw new Error("oops");
    });
    q.onChange(good);

    // Should not throw, good cb should still run.
    q.add(createApprovalItem("send_chat", "t", "d", "x"));
    expect(good).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
  });
});
