import { describe, expect, it } from "vitest";
import { shouldSkipAgentChatAssist } from "../src/agent-interaction.js";

describe("shouldSkipAgentChatAssist", () => {
  it("skips verified peer agent chat when structured_preferred", () => {
    expect(
      shouldSkipAgentChatAssist({
        senderRole: "agent",
        agentInteractionMode: "structured_preferred",
        agentVerified: true,
      }),
    ).toBe(true);
  });

  it("does not skip human senders", () => {
    expect(
      shouldSkipAgentChatAssist({
        senderRole: "human",
        agentInteractionMode: "structured_preferred",
        agentVerified: true,
      }),
    ).toBe(false);
  });

  it("does not skip when chat_ok mode", () => {
    expect(
      shouldSkipAgentChatAssist({
        senderRole: "agent",
        agentInteractionMode: "chat_ok",
        agentVerified: true,
      }),
    ).toBe(false);
  });

  it("does not skip unverified agent senders", () => {
    expect(
      shouldSkipAgentChatAssist({
        senderRole: "agent",
        agentInteractionMode: "structured_preferred",
        agentVerified: false,
      }),
    ).toBe(false);
  });
});
