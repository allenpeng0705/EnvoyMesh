import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@envoymesh/api";
import { ENVOY_AI_THREAD_KEY } from "@envoymesh/api";
import { chatMessageToAiMessage, isEnvoyAiChatMessage } from "../../src/lib/envoy-ai-chat.js";

const SELF = "envoy:owner:alice";

function row(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    messageId: "m-1",
    sender: {
      nodeId: "envoy_agent_x",
      ownerId: ENVOY_AI_THREAD_KEY,
      displayName: "EnvoyAI",
      actorRole: "agent",
    },
    recipient: {
      nodeId: "12D3KooWTest",
      ownerId: SELF,
    },
    content: { text: "Reminder: drink water" },
    metadata: {
      timestamp: "2026-06-05T13:00:00.000Z",
      deliveryChannel: "ai",
    },
    signature: "",
    ...overrides,
  };
}

describe("envoy-ai-chat", () => {
  it("recognizes EnvoyAI thread rows", () => {
    expect(isEnvoyAiChatMessage(row(), SELF)).toBe(true);
    expect(
      isEnvoyAiChatMessage(
        row({
          sender: { nodeId: "12D3KooWTest", ownerId: SELF, displayName: "Alice" },
          recipient: { nodeId: "agent", ownerId: ENVOY_AI_THREAD_KEY },
        }),
        SELF,
      ),
    ).toBe(true);
  });

  it("excludes character-bot rows from EnvoyAI panel", () => {
    expect(
      isEnvoyAiChatMessage(
        row({
          sender: {
            nodeId: "bot:librarian",
            ownerId: "bot:librarian",
            displayName: "Luna",
            actorRole: "agent",
          },
          metadata: {
            timestamp: "2026-06-05T13:00:00.000Z",
            deliveryChannel: "ai",
          },
        }),
        SELF,
      ),
    ).toBe(false);
  });

  it("maps user and assistant rows", () => {
    const user = chatMessageToAiMessage(
      row({
        messageId: "u-1",
        sender: { nodeId: "12D3KooWTest", ownerId: SELF, displayName: "Alice" },
        recipient: { nodeId: "agent", ownerId: ENVOY_AI_THREAD_KEY },
        content: { text: "hello" },
      }),
      SELF,
    );
    expect(user?.role).toBe("user");
    expect(user?.text).toBe("hello");

    const ai = chatMessageToAiMessage(row(), SELF);
    expect(ai?.role).toBe("ai");
    expect(ai?.text).toBe("Reminder: drink water");
  });
});
