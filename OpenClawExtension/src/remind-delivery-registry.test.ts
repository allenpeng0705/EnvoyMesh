import { afterEach, describe, expect, it } from "vitest";
import {
  clearPendingEnvoymeshReminders,
  registerPendingEnvoymeshReminder,
  takeDueEnvoymeshReminderForTarget,
} from "./remind-delivery-registry.js";

describe("envoymesh remind-delivery-registry", () => {
  afterEach(() => {
    clearPendingEnvoymeshReminders();
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
});
