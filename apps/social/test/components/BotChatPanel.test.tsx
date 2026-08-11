/**
 * Phase 56+ review — regression test for the BotChatPanel stack-grouping
 * bug. Previously, the `buildMessageStacks` callback only checked the
 * *previous* message (single-arg) and ignored the second argument, so
 * an outgoing user message + incoming bot reply got bundled into the
 * same stack — both rendered on the right with the same outgoing
 * style, making the chat look like the bot was talking to itself.
 *
 * The fix is `sameOutgoingGroup(a, b, isOut)` exported from
 * `BotChatPanel.tsx` — equivalent to `(a, b) => isOut(a) === isOut(b)`
 * (matching ContactChatPanel / GroupChatPanel).
 *
 * This file pins both:
 *  1. The exported `sameOutgoingGroup` (test the production code).
 *  2. The integration with the rendered DOM via `buildMessageStacks`
 *     (the actual algorithm in use).
 *  3. The rendered DOM contract (different alignment classes for
 *     outgoing vs incoming bubbles).
 *
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildMessageStacks,
  stackPosition,
} from "../../src/lib/chat-message-stack.js";
import { ChatMessageBubble } from "../../src/components/ChatMessageBubble.js";
import {
  BotChatPanel,
  sameOutgoingGroup,
} from "../../src/components/views/BotChatPanel.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BOT_CHAT_PANEL_SRC = resolve(
  __dirname,
  "../../src/components/views/BotChatPanel.tsx",
);

// ---------------------------------------------------------------------------
// 1. Pure unit test of the stack-grouping callback
// ---------------------------------------------------------------------------
//
// The production code is `sameOutgoingGroup(a, b, isOut)` exported
// from `BotChatPanel.tsx`. We test it directly so a regression to
// the buggy single-arg callback fails the test suite.

describe("BotChatPanel — sameOutgoingGroup (Phase 56+ regression)", () => {
  // Simulate the messages the panel sees for a 1-on-1 chat with a bot:
  //   msg-1 (user outgoing)  → msg-2 (bot incoming)  → msg-3 (user outgoing)
  // The stack-grouping callback should produce THREE separate stacks
  // (one per side change). The previous bug would produce ONE big
  // stack (single-arg callback grouped everything because the prev
  // message was outgoing for all three).
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

  it("returns true when both messages are outgoing (consecutive user msgs group)", () => {
    expect(sameOutgoingGroup(userMsg, userMsg2, isOutgoing as never)).toBe(true);
  });

  it("returns true when both messages are incoming (consecutive bot replies group)", () => {
    const bot2 = { ...botReply, messageId: "a-2" };
    expect(sameOutgoingGroup(botReply, bot2, isOutgoing as never)).toBe(true);
  });

  it("returns false when one is outgoing and the other is incoming (user + bot reply do NOT group)", () => {
    // This is the user-visible bug: previously this returned true
    // (single-arg callback) and the bot reply was rendered on the
    // right with the user's message. The fix returns false.
    expect(sameOutgoingGroup(userMsg, botReply, isOutgoing as never)).toBe(false);
  });

  it("REGRESSION GUARD: the previous single-arg callback bundled the user + bot reply into ONE stack", () => {
    // Pin the OLD behavior so we never regress. The previous code
    // in BotChatPanel.tsx was:
    //   `(msg) => isOutgoing(msg) || msg.messageId.startsWith("pending-")`
    // which only checks the PREVIOUS message. When called with
    // `(prev, item)` by `buildMessageStacks`, it ignores `item` and
    // always groups consecutive items as long as the prev was
    // outgoing — including a bot reply (incoming) that follows an
    // outgoing user message.
    //
    // The resulting grouping for [user, bot, user] with the buggy
    // callback: 2 stacks: [[user, bot], [user]]. The bot reply is
    // grouped with the user message. With the fixed callback: 3
    // stacks, one per side change.
    const buggyCallback = (prev: { sender: { ownerId?: string } }) =>
      isOutgoing(prev);
    // We assert the BUGGY behavior to document what the regression
    // looked like. If this assertion ever fails (e.g. because the
    // TS type forces a 2-arg callback), the test serves as a
    // historical record.
    const buggy = buildMessageStacks(
      [userMsg, botReply, userMsg2],
      buggyCallback as never,
    );
    expect(buggy.length).toBe(2);
    expect(buggy[0]).toHaveLength(2); // user + bot reply (BUG)
    expect(buggy[1]).toHaveLength(1); // user msg 2
  });

  it("integrates with buildMessageStacks: [user, bot, user] produces 3 separate stacks", () => {
    const stacks = buildMessageStacks(
      [userMsg, botReply, userMsg2],
      (a, b) => sameOutgoingGroup(a as never, b as never, isOutgoing as never),
    );
    expect(stacks.length).toBe(3);
    expect(stacks[0]).toHaveLength(1);
    expect(stacks[1]).toHaveLength(1);
    expect(stacks[2]).toHaveLength(1);
    // The middle stack must be the bot reply (the one that was
    // wrongly grouped with the user before the fix).
    expect(stacks[1]?.[0]?.messageId).toBe("a-1");
  });

  it("an empty message list returns no stacks", () => {
    expect(buildMessageStacks([], () => true)).toEqual([]);
  });

  it("a single message returns one stack of size 1", () => {
    const stacks = buildMessageStacks([userMsg], () => true);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]).toHaveLength(1);
  });

  // The previous tests exercise the algorithm via the named export.
  // This source-level guard fails when the production code stops
  // using `sameOutgoingGroup` (e.g. someone reverts to an inline
  // single-arg callback). Cheap, runs in <5ms.
  it("BotChatPanel uses sameOutgoingGroup — no inline single-arg callback that ignores `b`", () => {
    const src = readFileSync(BOT_CHAT_PANEL_SRC, "utf8");
    // The production code must call the named helper.
    expect(src).toMatch(/sameOutgoingGroup\(/);
    // Guard against the OLD bug returning. If someone reverts the
    // fix to `(a, b) => isOutgoing(a)` (ignoring `b`), this test
    // fails. Note: this regex also matches the JSDoc comment that
    // contains the literal string `(a, b) => isOut(a) === isOut(b)`;
    // the assertion below allows the comment but flags the actual
    // code (the comment is in a `*` block, the code is in a
    // `buildMessageStacks(` call).
    const inlineBuggyCallback = /\(\s*a\s*,\s*b\s*\)\s*=>\s*isOutgoing\(\s*a\s*\)/;
    // Strip JSDoc comments to avoid false positives.
    const srcWithoutComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(inlineBuggyCallback.test(srcWithoutComments)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. DOM contract: render a small replica and verify alignment classes
// ---------------------------------------------------------------------------
//
// The full send/receive integration is hard to set up because the
// BotChatPanel pulls from `useChatMessages` which requires the
// `NodeServiceContext` provider (with a real `clientFactory`). The
// unit tests above already pin the algorithm + the exported helper.
// This test pins the visible DOM contract: a stack row containing
// an `ai-outgoing` bubble has `is-outgoing`; a stack row containing
// an `ai-incoming` bubble has `is-incoming`. The CSS in chat.css
// (lines 1491-1499) keys off these classes to position the row on
// the right or left.

describe("BotChatPanel — rendered stack-row contract", () => {
  afterEach(cleanup);

  it("renders an outgoing user message + incoming bot reply as two separate stack rows (different alignment)", () => {
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
