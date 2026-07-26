import { describe, expect, it } from "vitest";
import { formatMomentsTime } from "../../src/lib/moments-time.js";

describe("formatMomentsTime", () => {
  const now = new Date("2026-07-26T15:30:00").getTime();

  it("shows just now / minutes / same-day hours", () => {
    expect(formatMomentsTime(new Date(now - 20_000).toISOString(), "en", now)).toBe("Just now");
    expect(formatMomentsTime(new Date(now - 5 * 60_000).toISOString(), "en", now)).toBe(
      "5 minutes ago",
    );
    expect(formatMomentsTime(new Date(now - 3 * 3600_000).toISOString(), "en", now)).toBe(
      "3 hours ago",
    );
  });

  it("shows yesterday with clock time", () => {
    const yesterday = new Date("2026-07-25T09:05:00").toISOString();
    expect(formatMomentsTime(yesterday, "en", now)).toBe("Yesterday 09:05");
  });

  it("shows N days ago within a week", () => {
    const threeDays = new Date("2026-07-23T12:00:00").toISOString();
    expect(formatMomentsTime(threeDays, "en", now)).toBe("3 days ago");
  });

  it("uses Chinese labels for zh locale", () => {
    expect(formatMomentsTime(new Date(now - 20_000).toISOString(), "zh-CN", now)).toBe("刚刚");
    expect(formatMomentsTime(new Date(now - 5 * 60_000).toISOString(), "zh-CN", now)).toBe(
      "5分钟前",
    );
    expect(formatMomentsTime(new Date("2026-07-25T09:05:00").toISOString(), "zh-CN", now)).toBe(
      "昨天 09:05",
    );
  });

  it("falls back to calendar date for older posts", () => {
    expect(formatMomentsTime(new Date("2026-03-03T10:00:00").toISOString(), "zh-CN", now)).toBe(
      "3月3日",
    );
    expect(formatMomentsTime(new Date("2024-03-03T10:00:00").toISOString(), "zh-CN", now)).toBe(
      "2024年3月3日",
    );
  });
});
