import { describe, expect, it } from "vitest";

import { EhChatRuntime } from "../src/eh-chat-runtime.js";

describe("EhChatRuntime", () => {
  it("tracks parallel turns per chat", () => {
    const rt = new EhChatRuntime();
    const p1 = Promise.resolve({ turnId: "t1", ok: true, text: "a" });
    const p2 = Promise.resolve({ turnId: "t2", ok: true, text: "b" });
    rt.registerTurn({
      turnId: "t1",
      chatId: "chat-a",
      cwd: "/a",
      userPrompt: "hello",
      startedAt: new Date().toISOString(),
      streamingText: "",
      changedFiles: [],
      resultPromise: p1,
    });
    rt.registerTurn({
      turnId: "t2",
      chatId: "chat-b",
      cwd: "/b",
      userPrompt: "hi",
      startedAt: new Date().toISOString(),
      streamingText: "",
      changedFiles: [],
      resultPromise: p2,
    });
    expect(rt.activeTurnCount()).toBe(2);
    expect(rt.hasTurnForChat("chat-a")).toBe(true);
    expect(rt.hasTurnForChat("chat-b")).toBe(true);
    expect(rt.getTurnForChat("chat-a")?.turnId).toBe("t1");
    rt.removeTurn("t1");
    expect(rt.hasTurnForChat("chat-a")).toBe(false);
    expect(rt.hasTurnForChat("chat-b")).toBe(true);
  });
});
