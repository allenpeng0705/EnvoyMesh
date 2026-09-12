import { describe, expect, it } from "vitest";
import {
  extTimelineChatId,
  isExtTimelineChatId,
  sessionIdFromExtTimelineChatId,
} from "../src/ext-timeline.js";

describe("extTimelineChatId", () => {
  it("builds __ext__:<sessionId>", () => {
    expect(extTimelineChatId("sess-1")).toBe("__ext__:sess-1");
    expect(extTimelineChatId("  sess-2  ")).toBe("__ext__:sess-2");
  });

  it("round-trips sessionId helpers", () => {
    const chatId = extTimelineChatId("abc");
    expect(isExtTimelineChatId(chatId)).toBe(true);
    expect(isExtTimelineChatId("__pi__:x")).toBe(false);
    expect(sessionIdFromExtTimelineChatId(chatId)).toBe("abc");
    expect(sessionIdFromExtTimelineChatId("nope")).toBeNull();
  });
});
