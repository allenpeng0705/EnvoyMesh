import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@envoymesh/api";
import {
  extractChatMessageText,
  isBridgeAgentChatMessage,
  isBridgeHeartbeatNoise,
  shouldShowBridgeMessageInAiChat,
} from "../../src/lib/bridge-chat-message.js";

const AGENT_PEER = "envoy_agent_test123";

function bridgeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    messageId: "bridge-1",
    sender: {
      nodeId: AGENT_PEER,
      ownerId: "envoy:owner:alice",
      displayName: "Agent",
      actorRole: "agent",
    },
    recipient: {
      nodeId: "12D3KooWTest",
      ownerId: "envoy:owner:alice",
    },
    content: { text: "💧 Time to drink water." },
    metadata: {
      timestamp: new Date().toISOString(),
      deliveryReceipt: "delivered",
      deliveryChannel: "ai",
      deliverySource: "bridge",
    },
    signature: "sig",
    ...overrides,
  };
}

describe("bridge-chat-message", () => {
  it("detects bridge agent by deliveryChannel or peer id", () => {
    expect(isBridgeAgentChatMessage(bridgeMsg(), AGENT_PEER)).toBe(true);
    expect(
      isBridgeAgentChatMessage(
        bridgeMsg({
          metadata: { timestamp: new Date().toISOString() },
          sender: { nodeId: AGENT_PEER, ownerId: AGENT_PEER, displayName: "" },
        }),
        AGENT_PEER,
      ),
    ).toBe(true);
    expect(
      isBridgeAgentChatMessage(
        {
          messageId: "x",
          sender: { nodeId: "12D3KooWStranger", ownerId: "envoy:owner:bob", displayName: "Bob" },
          recipient: { nodeId: "n", ownerId: "envoy:owner:alice" },
          content: { text: "hi" },
          metadata: { timestamp: new Date().toISOString() },
          signature: "sig",
        },
        AGENT_PEER,
      ),
    ).toBe(false);
  });

  it("extracts text from content, payload, or legacy text field", () => {
    expect(extractChatMessageText(bridgeMsg())).toBe("💧 Time to drink water.");
    expect(
      extractChatMessageText({
        content: { text: "" },
        payload: { text: "from payload" },
      }),
    ).toBe("from payload");
    expect(extractChatMessageText({ content: { text: "" }, text: "legacy" })).toBe("legacy");
  });

  it("treats heartbeat acks as noise", () => {
    expect(isBridgeHeartbeatNoise("🕸️")).toBe(true);
    expect(isBridgeHeartbeatNoise("🕸️ Heartbeat acknowledged. System nominal.")).toBe(true);
    expect(isBridgeHeartbeatNoise("💧 Hey Allen! Time to drink some water.")).toBe(false);
  });

  it("shows reminders in AI chat but not heartbeat noise", () => {
    expect(shouldShowBridgeMessageInAiChat(bridgeMsg(), AGENT_PEER)).toBe(true);
    expect(
      shouldShowBridgeMessageInAiChat(
        bridgeMsg({ content: { text: "🕸️ Heartbeat acknowledged. System nominal." } }),
        AGENT_PEER,
      ),
    ).toBe(false);
  });
});
