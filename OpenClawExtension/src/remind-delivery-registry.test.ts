import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingEnvoymeshReminders,
  countMissedEnvoymeshReminders,
  enableReminderPersistence,
  flushReminderPersistenceForTests,
  registerPendingEnvoymeshReminder,
  resetReminderRegistryForTests,
  takeDueEnvoymeshReminderForTarget,
  takeEnvoymeshReminderForTargetUnchecked,
} from "./remind-delivery-registry.js";

describe("envoymesh remind-delivery-registry", () => {
  beforeEach(() => {
    resetReminderRegistryForTests();
  });
  afterEach(() => {
    resetReminderRegistryForTests();
  });

  it("returns due reminder content for matching owner target", () => {
    registerPendingEnvoymeshReminder({
      jobId: "job-1",
      content: "drink water",
      to: "envoymesh:envoy:owner:test",
      fireAtMs: Date.now() - 1_000,
    });

    const due = takeDueEnvoymeshReminderForTarget("envoy:owner:test");
    expect(due?.content).toBe("drink water");
    expect(takeDueEnvoymeshReminderForTarget("envoy:owner:test")).toBeUndefined();
  });

  it("does not return early-scheduled reminders (more than 30s in the future)", () => {
    registerPendingEnvoymeshReminder({
      jobId: "job-early",
      content: "too early",
      to: "envoy:owner:test",
      fireAtMs: Date.now() + 5 * 60_000,
    });
    expect(takeDueEnvoymeshReminderForTarget("envoy:owner:test")).toBeUndefined();
  });

  it("drops and counts reminders past the late-fire window (was silent in pre-fix)", () => {
    registerPendingEnvoymeshReminder({
      jobId: "job-late",
      content: "long overdue",
      to: "envoy:owner:test",
      fireAtMs: Date.now() - 31 * 60_000, // 31 minutes ago
    });
    expect(countMissedEnvoymeshReminders()).toBe(1);
    expect(takeDueEnvoymeshReminderForTarget("envoy:owner:test")).toBeUndefined();
    expect(countMissedEnvoymeshReminders()).toBe(0);
  });

  it("takeEnvoymeshReminderForTargetUnchecked returns a future reminder as a fallback", () => {
    registerPendingEnvoymeshReminder({
      jobId: "job-future",
      content: "scheduled",
      to: "envoy:owner:test",
      fireAtMs: Date.now() + 5 * 60_000,
    });
    expect(takeDueEnvoymeshReminderForTarget("envoy:owner:test")).toBeUndefined();
    const fallback = takeEnvoymeshReminderForTargetUnchecked("envoy:owner:test");
    expect(fallback?.content).toBe("scheduled");
  });

  it("persists reminders to disk and reloads on enable", async () => {
    const dir = mkdtempSync(join(tmpdir(), "envoymesh-remind-"));
    const path = join(dir, "reminders.json");
    try {
      registerPendingEnvoymeshReminder({
        jobId: "persist-1",
        content: "persist me",
        to: "envoy:owner:test",
        fireAtMs: Date.now() + 1_000,
      });
      await enableReminderPersistence({ path, load: false });
      // Force a persist
      clearPendingEnvoymeshReminders();
      registerPendingEnvoymeshReminder({
        jobId: "persist-1",
        content: "persist me",
        to: "envoy:owner:test",
        fireAtMs: Date.now() + 1_000,
      });
      await flushReminderPersistenceForTests();
      // Wipe the in-memory map
      clearPendingEnvoymeshReminders();
      expect(takeDueEnvoymeshReminderForTarget("envoy:owner:test")).toBeUndefined();

      // Now re-enable persistence with load: true — should reload the entry.
      await enableReminderPersistence({ path, load: true });
      const due = takeDueEnvoymeshReminderForTarget("envoy:owner:test");
      expect(due?.content).toBe("persist me");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
