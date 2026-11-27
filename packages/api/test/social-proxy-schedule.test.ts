import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOCIAL_PROXY_INTERVAL_HOURS,
  shouldRunScheduledSocialProxyPass,
} from "../src/social-proxy-schedule.js";

describe("shouldRunScheduledSocialProxyPass", () => {
  const base = {
    socialProxyEnabled: true,
    trustModeEnabled: true,
    autonomousKillSwitch: false,
    intervalHours: 1 as const,
  };

  it("runs when never passed before", () => {
    expect(shouldRunScheduledSocialProxyPass(base)).toBe(true);
  });

  it("skips when disabled, no trust mode, or kill switch", () => {
    expect(shouldRunScheduledSocialProxyPass({ ...base, socialProxyEnabled: false })).toBe(false);
    expect(shouldRunScheduledSocialProxyPass({ ...base, trustModeEnabled: false })).toBe(false);
    expect(shouldRunScheduledSocialProxyPass({ ...base, autonomousKillSwitch: true })).toBe(false);
  });

  it("skips when interval is 0", () => {
    expect(shouldRunScheduledSocialProxyPass({ ...base, intervalHours: 0 })).toBe(false);
  });

  it("skips until interval elapsed; uses default interval when omitted", () => {
    const now = new Date("2026-11-26T12:00:00.000Z");
    expect(
      shouldRunScheduledSocialProxyPass({
        ...base,
        lastPassAt: "2026-11-26T11:30:00.000Z",
        now,
      }),
    ).toBe(false);
    expect(
      shouldRunScheduledSocialProxyPass({
        ...base,
        lastPassAt: "2026-11-26T10:00:00.000Z",
        now,
      }),
    ).toBe(true);
    expect(DEFAULT_SOCIAL_PROXY_INTERVAL_HOURS).toBe(1);
    expect(
      shouldRunScheduledSocialProxyPass({
        socialProxyEnabled: true,
        trustModeEnabled: true,
        lastPassAt: "2026-11-26T11:30:00.000Z",
        now,
      }),
    ).toBe(false);
  });
});
