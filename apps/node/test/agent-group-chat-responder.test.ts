/**
 * Agent Group Chat Responder tests.
 */
import { describe, expect, it } from "vitest";
import { evaluateAgentGroupChatResponse } from "../src/agent-group-chat-responder.js";

describe("agent-group-chat-responder", () => {
  function makeDeps(answers?: string[]) {
    let callCount = 0;
    return {
      hasMention: (text: string) => text.includes("@envoy"),
      generateAnswer: async () => {
        const answer = answers?.[callCount++] ?? "Here is the summary you requested.";
        return answer;
      },
      sendAgentRoomMessage: async () => {},
      // Fresh per-test rate limiter so test order does not leak state.
      allowResponse: makeTestRateLimiter(),
    };
  }

  function makeTestRateLimiter(): (roomId: string) => boolean {
    const counters = new Map<string, { count: number; windowStart: number }>();
    const MAX = 3;
    const WINDOW_MS = 60 * 60 * 1000;
    return (roomId) => {
      const now = Date.now();
      const entry = counters.get(roomId);
      if (!entry || now - entry.windowStart > WINDOW_MS) {
        counters.set(roomId, { count: 1, windowStart: now });
        return true;
      }
      if (entry.count >= MAX) return false;
      entry.count++;
      return true;
    };
  }

  it("ignores messages from other agents (anti-loop)", async () => {
    const deps = makeDeps();
    const result = await evaluateAgentGroupChatResponse(deps, {
      roomId: "room-1",
      senderRole: "agent",
      text: "@envoy summarize this",
    });
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toContain("anti-loop");
  });

  it("ignores messages without @envoy mention", async () => {
    const deps = makeDeps();
    const result = await evaluateAgentGroupChatResponse(deps, {
      roomId: "room-1",
      senderRole: "human",
      text: "Hey everyone, what do you think about this?",
    });
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toContain("no @envoy mention");
  });

  it("responds to @envoy summarize", async () => {
    const deps = makeDeps(["Summary: The group decided to use Rust for the backend."]);
    const result = await evaluateAgentGroupChatResponse(deps, {
      roomId: "room-1",
      senderRole: "human",
      text: "@envoy summarize the last 20 messages",
      recentMessages: [
        { sender: "Alice", text: "I think we should use Rust" },
        { sender: "Bob", text: "Agreed, Rust is good for performance" },
      ],
    });
    expect(result.shouldRespond).toBe(true);
    expect(result.response).toContain("Summary");
  });

  it("responds to @envoy find", async () => {
    const deps = makeDeps(["Found 3 documents about WASM in the vault."]);
    const result = await evaluateAgentGroupChatResponse(deps, {
      roomId: "room-1",
      senderRole: "human",
      text: "@envoy find documents about WASM",
    });
    expect(result.shouldRespond).toBe(true);
    expect(result.response).toContain("Found");
  });

  it("responds to @envoy poll", async () => {
    const deps = makeDeps(["Poll: When should we launch?\nOptions:\n1. Next week\n2. Next month\n3. Need more info"]);
    const result = await evaluateAgentGroupChatResponse(deps, {
      roomId: "room-1",
      senderRole: "human",
      text: "@envoy poll when should we launch?",
    });
    expect(result.shouldRespond).toBe(true);
    expect(result.response).toContain("Poll");
  });

  it("enforces rate limit (max 3 per hour)", async () => {
    const deps = makeDeps(["r1", "r2", "r3", "r4"]);
    // First 3 should be allowed
    for (let i = 0; i < 3; i++) {
      const result = await evaluateAgentGroupChatResponse(deps, {
        roomId: "room-1",
        senderRole: "human",
        text: `@envoy test ${i}`,
      });
      expect(result.shouldRespond).toBe(true);
    }
    // 4th should be rate-limited
    const result = await evaluateAgentGroupChatResponse(deps, {
      roomId: "room-1",
      senderRole: "human",
      text: "@envoy test 4",
    });
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toContain("rate limit");
  });

  it("different rooms have independent rate limits", async () => {
    const deps = makeDeps(["r1", "r2", "r3", "r4"]);
    // Max out room-1
    for (let i = 0; i < 3; i++) {
      await evaluateAgentGroupChatResponse(deps, { roomId: "room-1", senderRole: "human", text: `@envoy a${i}` });
    }
    // Room-2 should still be allowed
    const result = await evaluateAgentGroupChatResponse(deps, {
      roomId: "room-2",
      senderRole: "human",
      text: "@envoy test",
    });
    expect(result.shouldRespond).toBe(true);
  });
});
