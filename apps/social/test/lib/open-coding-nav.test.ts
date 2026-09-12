/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  CODING_REVIEW_READONLY_KEY,
  OPEN_CODING_EVENT,
  clearCodingReviewReadonly,
  isCodingReviewReadonly,
  openCoding,
  takePendingCodingOpen,
} from "../../src/lib/open-coding-nav.js";

afterEach(() => {
  sessionStorage.clear();
  clearCodingReviewReadonly();
});

describe("openCoding", () => {
  it("dispatches open-coding and stores pending detail", () => {
    const events: CustomEvent[] = [];
    const onCoding = (ev: Event) => {
      events.push(ev as CustomEvent);
    };
    window.addEventListener(OPEN_CODING_EVENT, onCoding);
    try {
      openCoding({ harness: "pi", startNew: true, sessionId: "s1" });
      expect(events).toHaveLength(1);
      expect(events[0]?.detail).toEqual({
        harness: "pi",
        startNew: true,
        sessionId: "s1",
      });
      expect(takePendingCodingOpen()).toEqual({
        harness: "pi",
        startNew: true,
        sessionId: "s1",
      });
      expect(takePendingCodingOpen()).toBeNull();
    } finally {
      window.removeEventListener(OPEN_CODING_EVENT, onCoding);
    }
  });

  it("sets session review-only flag when reviewOnly is true", () => {
    openCoding({ chatId: "c1", reviewOnly: true });
    expect(sessionStorage.getItem(CODING_REVIEW_READONLY_KEY)).toBe("1");
    expect(isCodingReviewReadonly()).toBe(true);
    expect(takePendingCodingOpen()).toEqual({
      chatId: "c1",
      reviewOnly: true,
    });
  });
});
