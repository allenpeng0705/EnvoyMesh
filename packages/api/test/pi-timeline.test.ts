import { describe, expect, it } from "vitest";

import {
  createPiTimelineTurnAcc,
  emptyEhTimelineState,
  isPiTimelineChatId,
  piEventToTimelineItems,
  piEventToTimelineUpdates,
  piTimelineChatId,
  piUserPromptTimelineItem,
  reduceEhTimeline,
  sessionIdFromPiTimelineChatId,
  type EhTimelineUpdate,
} from "../src/index.js";

describe("piTimelineChatId", () => {
  it("builds __pi__:<sessionId>", () => {
    expect(piTimelineChatId("sess-1")).toBe("__pi__:sess-1");
    expect(piTimelineChatId("  sess-2  ")).toBe("__pi__:sess-2");
  });

  it("round-trips sessionId helpers", () => {
    const chatId = piTimelineChatId("abc");
    expect(isPiTimelineChatId(chatId)).toBe(true);
    expect(isPiTimelineChatId("__envoy_harness__:x")).toBe(false);
    expect(sessionIdFromPiTimelineChatId(chatId)).toBe("abc");
    expect(sessionIdFromPiTimelineChatId("nope")).toBeNull();
  });
});

describe("piEventToTimelineUpdates", () => {
  const receivedAt = "2026-09-11T08:00:00.000Z";

  it("seeds a user message item", () => {
    const acc = createPiTimelineTurnAcc(piTimelineChatId("s1"), "turn-1");
    const item = piUserPromptTimelineItem(acc, "refactor this", receivedAt);
    expect(item).toMatchObject({
      id: "turn:turn-1:user",
      chatId: "__pi__:s1",
      type: "message",
      role: "user",
      text: "refactor this",
    });
  });

  it("streams assistant text_delta then finalizes on message_end", () => {
    const acc = createPiTimelineTurnAcc("__pi__:s1", "t1");
    let state = emptyEhTimelineState(acc.chatId);

    const apply = (updates: EhTimelineUpdate[]) => {
      for (const u of updates) state = reduceEhTimeline(state, u);
    };

    apply(
      piEventToTimelineUpdates(
        {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello" },
        },
        acc,
        receivedAt,
      ),
    );
    apply(
      piEventToTimelineUpdates(
        {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: " world" },
        },
        acc,
        "2026-09-11T08:00:01.000Z",
      ),
    );
    apply(
      piEventToTimelineUpdates(
        {
          type: "message_end",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Hello world" }],
          },
        },
        acc,
        "2026-09-11T08:00:02.000Z",
      ),
    );

    const assistant = state.items.find(
      (i) => i.type === "message" && i.role === "assistant",
    );
    expect(assistant).toMatchObject({
      text: "Hello world",
      streaming: false,
    });
  });

  it("uses one replaceable activity-live slot for tools", () => {
    const acc = createPiTimelineTurnAcc("__pi__:s1", "t1");
    let state = emptyEhTimelineState(acc.chatId);
    for (const u of piEventToTimelineUpdates(
      { type: "tool_execution_start", toolName: "bash", toolCallId: "c1" },
      acc,
      "t1",
    )) {
      state = reduceEhTimeline(state, u);
    }
    for (const u of piEventToTimelineUpdates(
      { type: "tool_execution_start", toolName: "read", toolCallId: "c2" },
      acc,
      "t2",
    )) {
      state = reduceEhTimeline(state, u);
    }
    const activities = state.items.filter((i) => i.type === "activity");
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      id: "turn:t1:activity-live",
      summary: "read",
      status: "running",
    });
  });

  it("maps extension_ui_request to a pending approval", () => {
    const acc = createPiTimelineTurnAcc("__pi__:s1", "t1");
    const items = piEventToTimelineItems(
      {
        type: "extension_ui_request",
        id: "req-9",
        method: "confirm",
        title: "bash",
        message: "rm -rf /tmp/x",
        timeout: 30_000,
      },
      acc,
      receivedAt,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "approval",
      requestId: "req-9",
      status: "pending",
      toolName: "bash",
      timeoutMs: 30_000,
    });
  });

  it("settles with completion and removes live activity", () => {
    const acc = createPiTimelineTurnAcc("__pi__:s1", "t1");
    acc.streamingText = "Done.";
    let state = emptyEhTimelineState(acc.chatId);
    state = reduceEhTimeline(state, {
      type: "upsert",
      item: {
        id: "turn:t1:activity-live",
        chatId: acc.chatId,
        turnId: "t1",
        type: "activity",
        status: "running",
        summary: "bash",
        createdAt: receivedAt,
      },
    });
    for (const u of piEventToTimelineUpdates(
      { type: "agent_settled" },
      acc,
      receivedAt,
    )) {
      state = reduceEhTimeline(state, u);
    }
    expect(state.items.find((i) => i.id === "turn:t1:activity-live")).toBeUndefined();
    expect(state.items.find((i) => i.type === "completion")).toMatchObject({
      status: "completed",
    });
    expect(state.state?.state).toBe("completed");
  });

  it("skips thinking_delta noise", () => {
    const acc = createPiTimelineTurnAcc("__pi__:s1", "t1");
    const updates = piEventToTimelineUpdates(
      {
        type: "message_update",
        assistantMessageEvent: { type: "thinking_delta", delta: "hmm" },
      },
      acc,
      receivedAt,
    );
    expect(updates).toEqual([]);
  });
});
