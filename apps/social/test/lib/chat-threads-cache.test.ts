/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@envoymesh/api";
import {
  mergeMessagesIntoThread,
  readCachedThread,
  replaceChatThreadsCache,
  snapshotChatThreadsCache,
} from "../../src/lib/chat-threads-cache.js";
import {
  markPendingOutboundFailed,
  markStalePendingOutboundFailed,
  readPendingOutboundCache,
  writePendingOutboundCache,
} from "../../src/lib/chat-pending-outbound-cache.js";

const sampleMsg = (id: string): ChatMessage => ({
  messageId: id,
  sender: { nodeId: "n1", ownerId: "envoy:owner:self", displayName: "Me" },
  recipient: { nodeId: "n2", ownerId: "envoy:owner:peer", displayName: "Peer" },
  content: { text: "hi" },
  metadata: { timestamp: new Date().toISOString() },
  signature: "",
});

describe("chat-threads-cache", () => {
  it("retains threads across replace/snapshot cycles", () => {
    replaceChatThreadsCache({ "envoy:owner:peer": [sampleMsg("a")] });
    expect(readCachedThread("envoy:owner:peer")).toHaveLength(1);
    const snap = snapshotChatThreadsCache();
    replaceChatThreadsCache({ ...snap, "envoy:owner:other": [sampleMsg("b")] });
    expect(readCachedThread("envoy:owner:peer")).toHaveLength(1);
    expect(readCachedThread("envoy:owner:other")).toHaveLength(1);
    replaceChatThreadsCache({});
  });

  it("mergeMessagesIntoThread dedupes and sorts by timestamp", () => {
    const older = {
      ...sampleMsg("a"),
      metadata: { timestamp: "2026-01-01T10:00:00.000Z" },
    };
    const newer = {
      ...sampleMsg("b"),
      metadata: { timestamp: "2026-01-02T10:00:00.000Z" },
    };
    const merged = mergeMessagesIntoThread({}, "envoy:owner:peer", [newer, older, newer]);
    expect(merged["envoy:owner:peer"]).toHaveLength(2);
    expect(merged["envoy:owner:peer"]?.[0]?.messageId).toBe("a");
    expect(merged["envoy:owner:peer"]?.[1]?.messageId).toBe("b");
  });
});

describe("chat-pending-outbound-cache", () => {
  it("stores and clears pending rows per contact", () => {
    writePendingOutboundCache("envoy:owner:peer", [sampleMsg("pending-1")]);
    expect(readPendingOutboundCache("envoy:owner:peer")).toHaveLength(1);
    writePendingOutboundCache("envoy:owner:peer", []);
    expect(readPendingOutboundCache("envoy:owner:peer")).toHaveLength(0);
  });

  it("marks all pending rows failed", () => {
    const pending: ChatMessage = {
      ...sampleMsg("pending-1"),
      metadata: { timestamp: new Date().toISOString(), deliveryReceipt: "pending" },
    };
    const sent: ChatMessage = {
      ...sampleMsg("sent-1"),
      metadata: { timestamp: new Date().toISOString(), deliveryReceipt: "sent" },
    };
    const next = markPendingOutboundFailed([pending, sent]);
    expect(next[0]?.metadata.deliveryReceipt).toBe("failed");
    expect(next[1]?.metadata.deliveryReceipt).toBe("sent");
  });

  it("ages out only stale pending rows", () => {
    const stale: ChatMessage = {
      ...sampleMsg("pending-old"),
      metadata: {
        timestamp: new Date(Date.now() - 120_000).toISOString(),
        deliveryReceipt: "pending",
      },
    };
    const fresh: ChatMessage = {
      ...sampleMsg("pending-new"),
      metadata: {
        timestamp: new Date().toISOString(),
        deliveryReceipt: "pending",
      },
    };
    const next = markStalePendingOutboundFailed([stale, fresh], Date.now(), 90_000);
    expect(next[0]?.metadata.deliveryReceipt).toBe("failed");
    expect(next[1]?.metadata.deliveryReceipt).toBe("pending");
  });
});
