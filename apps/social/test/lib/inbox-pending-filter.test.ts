import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@envoymesh/api";
import {
  isMeshOwnerId,
  isStrangerInboxCandidate,
} from "../../src/lib/inbox-pending-filter.js";

function msg(overrides: Partial<ChatMessage> & {
  sender?: Partial<ChatMessage["sender"]>;
  recipient?: Partial<NonNullable<ChatMessage["recipient"]>>;
}): ChatMessage {
  return {
    messageId: overrides.messageId ?? "m1",
    sender: {
      nodeId: "12D3KooSelf",
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      ...overrides.sender,
    },
    recipient: overrides.recipient
      ? {
          nodeId: "12D3KooOther",
          ownerId: "envoy:owner:bob",
          ...overrides.recipient,
        }
      : undefined,
    content: overrides.content ?? { text: "hi" },
    metadata: overrides.metadata ?? { timestamp: new Date().toISOString() },
    signature: "",
  };
}

describe("isMeshOwnerId", () => {
  it("accepts mesh owner ids only", () => {
    expect(isMeshOwnerId("envoy:owner:abc")).toBe(true);
    expect(isMeshOwnerId("owner")).toBe(false);
    expect(isMeshOwnerId("mom")).toBe(false);
    expect(isMeshOwnerId("family:dad:mom")).toBe(false);
  });
});

describe("isStrangerInboxCandidate", () => {
  const self = {
    selfOwnerId: "envoy:owner:alice",
    peerId: "12D3KooSelf",
    familyProfileIds: new Set(["owner", "mom", "dad"]),
  };

  it("rejects family DMs with sender profile id owner", () => {
    expect(
      isStrangerInboxCandidate(
        msg({
          sender: { ownerId: "owner", displayName: "Allen Peng", nodeId: "12D3KooSelf" },
          recipient: { ownerId: "family:mom:owner", displayName: "Mom" },
          metadata: {
            timestamp: new Date().toISOString(),
            deliveryReceipt: "delivered",
            deliveryChannel: "chat",
          },
        }),
        self,
      ),
    ).toBe(false);
  });

  it("rejects mom→dad family DMs even if they reach owner WS", () => {
    expect(
      isStrangerInboxCandidate(
        msg({
          sender: { ownerId: "mom", displayName: "Mom", nodeId: "thin-mom" },
          recipient: { ownerId: "family:dad:mom", displayName: "Dad" },
        }),
        self,
      ),
    ).toBe(false);
  });

  it("rejects bare family profile sender without family thread key", () => {
    expect(
      isStrangerInboxCandidate(
        msg({
          sender: { ownerId: "dad", displayName: "Dad", nodeId: "thin-dad" },
          recipient: { ownerId: "envoy:owner:alice" },
        }),
        self,
      ),
    ).toBe(false);
  });

  it("rejects family thread key on recipient alone", () => {
    expect(
      isStrangerInboxCandidate(
        msg({
          sender: { ownerId: "mom", displayName: "Mom", nodeId: "thin" },
          recipient: { ownerId: "family:mom:owner" },
        }),
        self,
      ),
    ).toBe(false);
  });

  it("accepts a true unbonded mesh stranger", () => {
    expect(
      isStrangerInboxCandidate(
        msg({
          sender: {
            ownerId: "envoy:owner:stranger",
            displayName: "Stranger",
            nodeId: "12D3KooStranger",
          },
          recipient: { ownerId: "envoy:owner:alice" },
        }),
        self,
        [],
      ),
    ).toBe(true);
  });

  it("rejects bonded senders", () => {
    expect(
      isStrangerInboxCandidate(
        msg({
          sender: {
            ownerId: "envoy:owner:friend",
            displayName: "Friend",
            nodeId: "12D3KooFriend",
          },
        }),
        self,
        [{ peerOwnerId: "envoy:owner:friend", displayName: "Friend" }],
      ),
    ).toBe(false);
  });

  it("rejects self mesh owner", () => {
    expect(
      isStrangerInboxCandidate(
        msg({
          sender: {
            ownerId: "envoy:owner:alice",
            displayName: "Allen Peng",
            nodeId: "other",
          },
        }),
        self,
      ),
    ).toBe(false);
  });
});
