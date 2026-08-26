import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@envoymesh/api";
import { messageIsOutgoing } from "../../src/lib/chat-visibility.js";

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "sender" | "recipient">): ChatMessage {
  return {
    messageId: "m1",
    content: { text: "hi", attachments: [] },
    metadata: { timestamp: new Date().toISOString() },
    ...partial,
  } as ChatMessage;
}

describe("messageIsOutgoing", () => {
  it("treats family room messages from mom profile as outgoing on mom Social", () => {
    const roomMsg = msg({
      sender: { ownerId: "mom", nodeId: "home-node", displayName: "Mom" } as ChatMessage["sender"],
      recipient: { ownerId: "room:family-trip" } as ChatMessage["recipient"],
    });
    expect(
      messageIsOutgoing(roomMsg, "envoy:owner:abc", "peer-self", "mom"),
    ).toBe(true);
    expect(
      messageIsOutgoing(roomMsg, "envoy:owner:abc", "peer-self", "owner"),
    ).toBe(false);
  });

  it("treats mesh room messages from mesh owner as outgoing on owner Social", () => {
    const roomMsg = msg({
      sender: { ownerId: "envoy:owner:abc", nodeId: "peer-self", displayName: "You" } as ChatMessage["sender"],
      recipient: { ownerId: "room:project-alpha" } as ChatMessage["recipient"],
    });
    expect(
      messageIsOutgoing(roomMsg, "envoy:owner:abc", "peer-self", "owner"),
    ).toBe(true);
  });
});
