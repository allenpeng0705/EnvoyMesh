import { describe, expect, it } from "vitest";
import { chatLocalTimelineTimestamp } from "../src/chat-local-timeline.js";

describe("chatLocalTimelineTimestamp", () => {
  const receivedAt = Date.parse("2026-08-31T12:00:00.000Z");

  it("keeps sender time when peer clock is behind or equal", () => {
    expect(chatLocalTimelineTimestamp("2026-08-31T11:59:50.000Z", receivedAt)).toBe(
      "2026-08-31T11:59:50.000Z",
    );
    expect(chatLocalTimelineTimestamp("2026-08-31T12:00:00.000Z", receivedAt)).toBe(
      "2026-08-31T12:00:00.000Z",
    );
  });

  it("clamps sender time when peer clock is ahead (AI reply ordering)", () => {
    // Peer claims 12:05; we received at 12:00 — without clamp, a 12:01 local
    // AI reply would sort *above* the inbound message.
    expect(chatLocalTimelineTimestamp("2026-08-31T12:05:00.000Z", receivedAt)).toBe(
      "2026-08-31T12:00:00.000Z",
    );
  });

  it("falls back to receive time when sender createdAt is missing/invalid", () => {
    expect(chatLocalTimelineTimestamp(undefined, receivedAt)).toBe("2026-08-31T12:00:00.000Z");
    expect(chatLocalTimelineTimestamp("not-a-date", receivedAt)).toBe("2026-08-31T12:00:00.000Z");
  });
});
