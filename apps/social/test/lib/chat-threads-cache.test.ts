/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@envoymesh/api";
import {
  readCachedThread,
  replaceChatThreadsCache,
  snapshotChatThreadsCache,
} from "../../src/lib/chat-threads-cache.js";
import {
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
});

describe("chat-pending-outbound-cache", () => {
  it("stores and clears pending rows per contact", () => {
    writePendingOutboundCache("envoy:owner:peer", [sampleMsg("pending-1")]);
    expect(readPendingOutboundCache("envoy:owner:peer")).toHaveLength(1);
    writePendingOutboundCache("envoy:owner:peer", []);
    expect(readPendingOutboundCache("envoy:owner:peer")).toHaveLength(0);
  });
});
