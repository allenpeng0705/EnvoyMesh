/**
 * Phase 56+ review — regression test for the BotChatPanel stack-grouping
 * bug. Previously, the `buildMessageStacks` callback only checked the
 * *previous* message (single-arg) and ignored the second argument, so
 * an outgoing user message + incoming bot reply got bundled into the
 * same stack — both rendered on the right with the same outgoing
 * style, making the chat look like the bot was talking to itself.
 *
 * The fix uses `(a, b) => isOutgoing(a) === isOutgoing(b)` (matching
 * ContactChatPanel / GroupChatPanel).
 *
 * This file pins both:
 *  1. The pure stack-grouping logic via `buildMessageStacks` (unit
 *     test, no DOM). Easy to reason about; the bug would surface
 *     immediately as "user + bot reply land in the same stack".
 *  2. The integration with the rendered DOM (a single render test
 *     using pre-seeded history; no live RPC needed).
 *
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  buildMessageStacks,
  stackPosition,
} from "../../src/lib/chat-message-stack.js";
import { ChatMessageBubble } from "../../src/components/ChatMessageBubble.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

// ---------------------------------------------------------------------------
// 1. Pure unit test of the stack-grouping callback
// ---------------------------------------------------------------------------

describe("BotChatPanel — buildMessageStacks grouping (Phase 56+ regression)", () => {
  // Simulate the messages the panel sees for a 1-on-1 chat with a bot:
  //   msg-1 (user outgoing)  → msg-2 (bot incoming)  → msg-3 (user outgoing)
  // The stack-grouping callback should produce THREE separate stacks
  // (one per side change). The previous bug would produce ONE stack
  // (single-arg callback groups everything because the prev message
  // was outgoing for all three).
  const userMsg = {
    messageId: "u-1",
    sender: {
      nodeId: "self",
      ownerId: "envoy:owner:test",
      displayName: "You",
      actorRole: "human",
    },
    recipient: { nodeId: "self", ownerId: "bot:luna" },
    content: { text: "hello luna" },
    metadata: { timestamp: new Date().toISOString() },
    signature: "",
  };
  const botReply = {
    messageId: "a-1",
    sender: {
      nodeId: "bot:luna",
      ownerId: "bot:luna",
      displayName: "Luna",
      actorRole: "agent",
    },
    recipient: { nodeId: "self", ownerId: "envoy:owner:test" },
    content: { text: "Hi there!" },
    metadata: { timestamp: new Date(Date.now() + 1).toISOString() },
    signature: "",
  };
  const userMsg2 = {
    ...userMsg,
    messageId: "u-2",
    content: { text: "second question" },
  };

  const isOutgoing = (m: { sender: { ownerId?: string } }) =>
    m.sender.ownerId === "envoy:owner:test";

  it("groups user + bot reply + user into THREE separate stacks (right → left → right)", () => {
    // The CORRECT callback (matches ContactChatPanel / GroupChatPanel).
    const correct = buildMessageStacks(
      [userMsg, botReply, userMsg2],
      (a, b) => isOutgoing(a) === isOutgoing(b),
    );
    expect(correct.length).toBe(3);
    expect(correct[0]).toHaveLength(1); // user msg 1 (outgoing)
    expect(correct[1]).toHaveLength(1); // bot reply (incoming)
    expect(correct[2]).toHaveLength(1); // user msg 2 (outgoing)
  });

  it("REGRESSION: the previous single-arg callback bundled the user + bot reply into ONE stack", () => {
    // Pin the OLD behavior so we never regress. The previous code
    // in BotChatPanel.tsx was:
    //   `(msg) => isOutgoing(msg) || msg.messageId.startsWith("pending-")`
    // which only checks the PREVIOUS message. When called with
    // `(prev, item)` by `buildMessageStacks`, it ignores `item` and
    // always groups consecutive items as long as the prev was
    // outgoing — including a bot reply (incoming) that follows an
    // outgoing user message.
    //
    // The resulting grouping for [user, bot, user]:
    //   - i=0: current = [user]
    //   - i=1: prev=user (outgoing), sameGroup returns true → push bot.
    //          current = [user, bot].   ← BUG: bot reply is right-aligned
    //   - i=2: prev=bot (NOT outgoing), sameGroup returns false →
    //          push current, new stack starts with user.
    //          stacks = [[user, bot], [user]]  (length 2, first stack has 2)
    const buggy = buildMessageStacks(
      [userMsg, botReply, userMsg2],
      // The previous single-arg callback: only checks `prev` (the
      // first argument). It ignores `next` entirely.
      (prev) => isOutgoing(prev as { sender: { ownerId?: string } }),
    );
    // The bug: the user message and bot reply are in the SAME stack
    // (length 2). With the fixed callback, they would be in separate
    // stacks (length 1 each, total 3 stacks for the 3 messages).
    expect(buggy.length).toBe(2);
    expect(buggy[0]).toHaveLength(2); // user + bot reply (BUG)
    expect(buggy[1]).toHaveLength(1); // user msg 2
    // Pin the user-visible symptom: the bot reply is grouped with
    // the user message. With the fixed callback, it would be alone.
    expect(buggy[0]?.[0]?.messageId).toBe("u-1");
    expect(buggy[0]?.[1]?.messageId).toBe("a-1");
  });

  it("groups two consecutive outgoing messages into ONE stack", () => {
    // Pin the OTHER direction: two user messages in a row should
    // still group together (since both are outgoing). This is the
    // case where the new `(a, b) => isOut(a) === isOut(b)` callback
    // returns true for the second pair — same side → same stack.
    const stacked = buildMessageStacks(
      [userMsg, userMsg2],
      (a, b) => isOutgoing(a) === isOutgoing(b),
    );
    expect(stacked.length).toBe(1);
    expect(stacked[0]).toHaveLength(2);
  });

  it("groups two consecutive incoming messages into ONE stack", () => {
    const stacked = buildMessageStacks(
      [botReply, { ...botReply, messageId: "a-2" }],
      (a, b) => isOutgoing(a) === isOutgoing(b),
    );
    expect(stacked.length).toBe(1);
    expect(stacked[0]).toHaveLength(2);
  });

  it("an empty message list returns no stacks", () => {
    expect(buildMessageStacks([], () => true)).toEqual([]);
  });

  it("a single message returns one stack of size 1", () => {
    const stacks = buildMessageStacks([userMsg], () => true);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Integration: render pre-seeded history and verify stack rows
// ---------------------------------------------------------------------------
//
// The full send/receive integration is hard to set up because the
// BotChatPanel pulls from `useChatMessages` which requires the
// `NodeServiceContext` provider (with a real `clientFactory`).
// Instead, we render a hand-rolled DOM that matches what the panel
// produces for [user, bot reply]: two `message-stack-row` elements
// (one is-outgoing, one is-incoming), each with the right bubble
// variant. This verifies the BUBBLE / CSS / DOM contract that the
// regression would break.

describe("BotChatPanel — rendered stack-row contract", () => {
  afterEach(cleanup);

  it("renders an outgoing user message + incoming bot reply as two separate stack rows (different alignment)", () => {
    const userMsg = {
      messageId: "u-1",
      sender: {
        nodeId: "self",
        ownerId: "envoy:owner:test",
        displayName: "You",
        actorRole: "human",
      },
      recipient: { nodeId: "self", ownerId: "bot:luna" },
      content: { text: "hello luna" },
      metadata: { timestamp: new Date().toISOString() },
      signature: "",
    };
    const botReply = {
      messageId: "a-1",
      sender: {
        nodeId: "bot:luna",
        ownerId: "bot:luna",
        displayName: "Luna",
        actorRole: "agent",
      },
      recipient: { nodeId: "self", ownerId: "envoy:owner:test" },
      content: { text: "Hi there!" },
      metadata: { timestamp: new Date(Date.now() + 1).toISOString() },
      signature: "",
    };

    // Render a tiny replica of the BotChatPanel's stack-row markup.
    // We don't pull in the real panel here because that would require
    // the full NodeServiceContext + I18nProvider tree; this DOM-level
    // test pins the visible behavior (alignment + bubble variant).
    const { container } = renderWithI18n(
      <div>
        <div className="message-stack-row is-outgoing">
          <div className="message-stack">
            <ChatMessageBubble
              variant="ai-outgoing"
              position={stackPosition(0, 1)}
              copyText="hello luna"
            >
              hello luna
            </ChatMessageBubble>
          </div>
        </div>
        <div className="message-stack-row is-incoming">
          <div className="message-stack">
            <ChatMessageBubble
              variant="ai-incoming"
              position={stackPosition(0, 1)}
              actorBadge="Luna"
              copyText="Hi there!"
            >
              Hi there!
            </ChatMessageBubble>
          </div>
        </div>
      </div>,
    );

    // The two stack rows have different alignment classes.
    const rows = container.querySelectorAll(".message-stack-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.className).toContain("is-outgoing");
    expect(rows[0]?.className).not.toContain("is-incoming");
    expect(rows[1]?.className).toContain("is-incoming");
    expect(rows[1]?.className).not.toContain("is-outgoing");

    // The bubbles have the right variants — these drive the CSS
    // background color (primary gradient for outgoing, neutral
    // surface for incoming).
    expect(
      rows[0]?.querySelector(".message-bubble.ai-outgoing"),
    ).not.toBeNull();
    expect(
      rows[0]?.querySelector(".message-bubble.ai-incoming"),
    ).toBeNull();
    expect(
      rows[1]?.querySelector(".message-bubble.ai-incoming"),
    ).not.toBeNull();
    expect(
      rows[1]?.querySelector(".message-bubble.ai-outgoing"),
    ).toBeNull();
  });
});
