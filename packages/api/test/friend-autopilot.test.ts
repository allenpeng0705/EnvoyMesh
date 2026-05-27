import { describe, expect, it } from "vitest";
import { shouldRunScheduledFriendAutopilot } from "../src/friend-autopilot.js";

describe("shouldRunScheduledFriendAutopilot", () => {
  it("returns false when schedule interval is zero", () => {
    expect(
      shouldRunScheduledFriendAutopilot({
        friendAutopilotEnabled: true,
        trustModeEnabled: true,
        intervalHours: 0,
      }),
    ).toBe(false);
  });

  it("returns true on first run when enabled", () => {
    expect(
      shouldRunScheduledFriendAutopilot({
        friendAutopilotEnabled: true,
        trustModeEnabled: true,
        intervalHours: 24,
      }),
    ).toBe(true);
  });

  it("returns false before interval elapses", () => {
    const now = new Date("2026-05-20T12:00:00.000Z");
    const lastRunAt = "2026-05-20T06:00:00.000Z";
    expect(
      shouldRunScheduledFriendAutopilot({
        friendAutopilotEnabled: true,
        trustModeEnabled: true,
        intervalHours: 24,
        lastRunAt,
        now,
      }),
    ).toBe(false);
  });

  it("returns true after interval elapses", () => {
    const now = new Date("2026-05-21T07:00:00.000Z");
    const lastRunAt = "2026-05-20T06:00:00.000Z";
    expect(
      shouldRunScheduledFriendAutopilot({
        friendAutopilotEnabled: true,
        trustModeEnabled: true,
        intervalHours: 24,
        lastRunAt,
        now,
      }),
    ).toBe(true);
  });
});
