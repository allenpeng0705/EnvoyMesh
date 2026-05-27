import { describe, expect, it } from "vitest";
import { chatSenderActorFromEnvelope, formatChatActorBadge } from "../src/chat-actor.js";

describe("chatSenderActorFromEnvelope", () => {
  it("maps agent role with credential", () => {
    expect(
      chatSenderActorFromEnvelope("agent", { agentId: "agent_abc" }, true),
    ).toEqual({
      actorRole: "agent",
      agentId: "agent_abc",
      agentVerified: true,
    });
  });

  it("defaults human role", () => {
    expect(chatSenderActorFromEnvelope("human")).toEqual({ actorRole: "human" });
  });
});

describe("formatChatActorBadge", () => {
  it("labels verified peer agent", () => {
    expect(
      formatChatActorBadge({
        displayName: "Bob",
        actorRole: "agent",
        agentVerified: true,
        outgoing: false,
      }),
    ).toBe("Bob's agent");
  });

  it("labels outgoing agent", () => {
    expect(
      formatChatActorBadge({
        displayName: "Alice",
        actorRole: "agent",
        agentVerified: true,
        outgoing: true,
      }),
    ).toBe("Your agent");
  });
});
