import { describe, expect, it } from "vitest";

import { ehEventMatchesChat } from "../../src/lib/eh-chat-event-scope.js";

describe("ehEventMatchesChat", () => {
  it("accepts legacy events without chatId", () => {
    expect(ehEventMatchesChat({}, "chat-a")).toBe(true);
  });

  it("matches the panel chat", () => {
    expect(ehEventMatchesChat({ chatId: "chat-a" }, "chat-a")).toBe(true);
  });

  it("rejects events from other chats", () => {
    expect(ehEventMatchesChat({ chatId: "chat-b" }, "chat-a")).toBe(false);
  });
});
