import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@envoymesh/api";
import {
  isChatMessageVisibleToProfile,
  isThreadVisibleToProfile,
  pruneThreadsForProfile,
  resolveChatThreadKey,
} from "../../src/lib/chat-visibility.js";

function familyMsg(from: string, threadKey: string): ChatMessage {
  return {
    messageId: "m1",
    sender: {
      nodeId: "n1",
      ownerId: from,
      displayName: from,
      actorRole: "human",
    },
    recipient: {
      nodeId: "n1",
      ownerId: threadKey,
      displayName: "peer",
    },
    content: { text: "hi" },
    metadata: {
      timestamp: new Date().toISOString(),
      deliveryChannel: "chat",
      deliveryReceipt: "delivered",
    },
    signature: "",
  };
}

describe("chat visibility (owner Social)", () => {
  it("resolves family thread key from recipient", () => {
    expect(
      resolveChatThreadKey(
        familyMsg("mom", "family:dad:mom"),
        "envoy:owner:alice",
        "12D3",
      ),
    ).toBe("family:dad:mom");
  });

  it("owner cannot see dad↔mom threads", () => {
    expect(isThreadVisibleToProfile("family:dad:mom", "owner")).toBe(false);
    expect(
      isChatMessageVisibleToProfile(familyMsg("mom", "family:dad:mom"), {
        familyProfileId: "owner",
        selfOwnerId: "envoy:owner:alice",
      }),
    ).toBe(false);
  });

  it("owner (as a family member) sees only threads involving itself", () => {
    // Owner ↔ Mom / Dad — yes
    expect(isThreadVisibleToProfile("family:mom:owner", "owner")).toBe(true);
    expect(isThreadVisibleToProfile("family:dad:owner", "owner")).toBe(true);
    expect(
      isChatMessageVisibleToProfile(familyMsg("mom", "family:mom:owner"), {
        familyProfileId: "owner",
        selfOwnerId: "envoy:owner:alice",
      }),
    ).toBe(true);
    // Other members talking to each other — proxied by home, hidden on Social
    expect(isThreadVisibleToProfile("family:dad:mom", "owner")).toBe(false);
  });

  it("mom can see dad↔mom but not owner↔dad if not a member", () => {
    expect(isThreadVisibleToProfile("family:dad:mom", "mom")).toBe(true);
    expect(isThreadVisibleToProfile("family:dad:owner", "mom")).toBe(false);
  });

  it("prunes other-profile threads from the cache", () => {
    const pruned = pruneThreadsForProfile(
      {
        "family:dad:mom": [{ messageId: "x" }],
        "family:mom:owner": [{ messageId: "y" }],
        "envoy:owner:friend": [{ messageId: "z" }],
      },
      "owner",
    );
    expect(Object.keys(pruned).sort()).toEqual([
      "envoy:owner:friend",
      "family:mom:owner",
    ]);
  });

  it("allows mesh stranger threads for owner", () => {
    const msg: ChatMessage = {
      messageId: "s1",
      sender: {
        nodeId: "peer",
        ownerId: "envoy:owner:stranger",
        displayName: "Stranger",
      },
      recipient: {
        nodeId: "home",
        ownerId: "envoy:owner:alice",
      },
      content: { text: "hello" },
      metadata: { timestamp: new Date().toISOString() },
      signature: "",
    };
    expect(
      isChatMessageVisibleToProfile(msg, {
        familyProfileId: "owner",
        selfOwnerId: "envoy:owner:alice",
        selfPeerId: "home",
      }),
    ).toBe(true);
  });
});
