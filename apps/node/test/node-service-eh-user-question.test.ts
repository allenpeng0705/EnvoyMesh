/**
 * Envoy Harness user-question bridge — emits eh:user_question, resolves
 * on respond/timeout, and scopes clears by chat.
 */

import { describe, expect, it, vi } from "vitest";

import { AcpUserQuestionBridge } from "../src/node-service-eh-user-question.js";

describe("AcpUserQuestionBridge", () => {
  it("emits eh:user_question with chatId and resolves the answer", async () => {
    const emitted: Array<{ requestId: string; prompt: string; chatId?: string }> = [];
    const bridge = new AcpUserQuestionBridge((event, payload) => {
      emitted.push({
        requestId: payload.requestId,
        prompt: payload.prompt,
        chatId: payload.chatId,
      });
    });
    const pending = bridge.ask(
      { prompt: "Approve this plan?", options: ["yes", "no"] },
      "chat-1",
    );
    await vi.waitFor(() => expect(emitted).toHaveLength(1));
    expect(emitted[0]).toMatchObject({
      prompt: "Approve this plan?",
      chatId: "chat-1",
    });
    const delivered = bridge.respond(emitted[0]!.requestId, {
      value: "yes",
      optionIndex: 0,
    });
    expect(delivered.delivered).toBe(true);
    await expect(pending).resolves.toMatchObject({
      value: "yes",
      optionIndex: 0,
      cancelled: false,
    });
  });

  it("auto-cancels on timeout", async () => {
    vi.useFakeTimers();
    try {
      const bridge = new AcpUserQuestionBridge(() => {}, { timeoutMs: 100 });
      const pending = bridge.ask({ prompt: "Continue?" });
      await vi.advanceTimersByTimeAsync(150);
      await expect(pending).resolves.toMatchObject({
        cancelled: true,
        cancelledReason: "timeout",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clearForChat cancels only that chat's pending question", async () => {
    const bridge = new AcpUserQuestionBridge(() => {}, { timeoutMs: 5000 });
    const a = bridge.ask({ prompt: "chat a?" }, "chat-a");
    const b = bridge.ask({ prompt: "chat b?" }, "chat-b");
    bridge.clearForChat("chat-a");
    await expect(a).resolves.toMatchObject({
      cancelled: true,
      cancelledReason: "aborted",
    });
    expect(bridge.size).toBe(1);
    bridge.clear();
    await expect(b).resolves.toMatchObject({ cancelled: true });
  });
});
