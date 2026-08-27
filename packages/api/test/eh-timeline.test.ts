import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ehHistoryToTimelineItems,
  emptyEhTimelineState,
  legacyEhEventToTimelineItems,
  reduceEhTimeline,
  type EhLegacyTimelineEvent,
} from "../src/eh-timeline.js";

interface LifecycleFixture {
  chatId: string;
  receivedAt: string;
  events: EhLegacyTimelineEvent[];
}

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/eh-timeline-lifecycle.json", import.meta.url)),
    "utf8",
  ),
) as LifecycleFixture;

describe("Envoy Harness semantic timeline", () => {
  it("adapts and replays a complete legacy lifecycle deterministically", () => {
    let state = emptyEhTimelineState(fixture.chatId);
    const updates = fixture.events.flatMap((event) =>
      legacyEhEventToTimelineItems(event, fixture.receivedAt),
    );
    for (const item of updates) {
      state = reduceEhTimeline(state, { type: "upsert", item });
    }
    expect(state.items.map((item) => item.type)).toEqual([
      "message",
      "message",
      "activity",
      "changes",
      "completion",
    ]);
    expect(state.items.find((item) => item.type === "message" && item.role === "assistant"))
      .toMatchObject({ text: "Tests pass.", streaming: false });
    expect(state.items.find((item) => item.type === "changes"))
      .toMatchObject({ files: ["src/index.ts"] });

    const replayed = updates.reduce(
      (next, item) => reduceEhTimeline(next, { type: "upsert", item }),
      state,
    );
    expect(replayed.items).toEqual(state.items);
  });

  it("reuses one replaceable activity-live slot per turn", () => {
    let state = emptyEhTimelineState("chat-1");
    const at = (summary: string, ts: string) =>
      legacyEhEventToTimelineItems(
        {
          name: "eh:activity",
          payload: {
            turnId: "turn-1",
            chatId: "chat-1",
            kind: "tool_call",
            summary,
            toolName: "bash",
            ts,
          },
        },
        ts,
      )[0]!;
    state = reduceEhTimeline(state, { type: "upsert", item: at("ls", "t1") });
    state = reduceEhTimeline(state, { type: "upsert", item: at("bash foo", "t2") });
    const activities = state.items.filter((item) => item.type === "activity");
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      id: "turn:turn-1:activity-live",
      summary: "bash foo",
    });
  });

  it("ignores events scoped to another chat", () => {
    const item = legacyEhEventToTimelineItems(fixture.events[0]!, fixture.receivedAt)[0]!;
    const state = reduceEhTimeline(emptyEhTimelineState("chat-2"), {
      type: "upsert",
      item,
    });
    expect(state.items).toEqual([]);
  });

  it("rejects stale item versions", () => {
    const base = {
      id: "turn:1:assistant",
      chatId: "chat-1",
      turnId: "1",
      type: "message" as const,
      role: "assistant" as const,
      text: "new",
      createdAt: "2026-08-25T08:00:00.000Z",
      updatedAt: "2026-08-25T08:00:02.000Z",
    };
    const state = reduceEhTimeline(emptyEhTimelineState("chat-1"), {
      type: "upsert",
      item: base,
    });
    const stale = reduceEhTimeline(state, {
      type: "upsert",
      item: { ...base, text: "old", updatedAt: "2026-08-25T08:00:01.000Z" },
    });
    expect(stale.items[0]).toMatchObject({ text: "new" });
  });

  it("adapts persisted history without array-index reconstruction", () => {
    const items = ehHistoryToTimelineItems({
      chatId: "chat-1",
      sessionId: "session-1",
      cwd: "/project",
      turns: [
        { id: "eh-msg-7", role: "user", text: "hello" },
        { id: "eh-msg-9", role: "assistant", text: "world" },
      ],
    });
    expect(items.map((item) => item.id)).toEqual(["eh-msg-7", "eh-msg-9"]);
    expect(items.every((item) => item.chatId === "chat-1")).toBe(true);
  });
});
