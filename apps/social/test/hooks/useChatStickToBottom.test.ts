import { describe, expect, it } from "vitest";
import {
  CHAT_STICK_BOTTOM_THRESHOLD_PX,
  isNearBottom,
} from "../../src/hooks/useChatStickToBottom.js";

describe("isNearBottom", () => {
  it("is true at the bottom", () => {
    expect(
      isNearBottom({ scrollHeight: 1000, scrollTop: 800, clientHeight: 200 }),
    ).toBe(true);
  });

  it("is true within threshold", () => {
    expect(
      isNearBottom({
        scrollHeight: 1000,
        scrollTop: 800 - CHAT_STICK_BOTTOM_THRESHOLD_PX,
        clientHeight: 200,
      }),
    ).toBe(true);
  });

  it("is false when scrolled up past threshold", () => {
    expect(
      isNearBottom({
        scrollHeight: 2000,
        scrollTop: 100,
        clientHeight: 400,
      }),
    ).toBe(false);
  });
});
