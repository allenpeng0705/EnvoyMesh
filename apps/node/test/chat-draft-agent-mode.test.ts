import { describe, expect, it, vi } from "vitest";
import { generateAgentModeChatDraft } from "../src/chat-draft-agent-mode.js";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";

function chatEnvelope(text: string): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-a",
      senderPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      intent: "chat.message",
      payload: { senderOwnerId: "envoy:owner:bob", text },
      createdAt: "2026-04-27T10:00:00.000Z",
      messageId: "msg-agent-1",
    }),
    signature: "signature",
  };
}

describe("generateAgentModeChatDraft", () => {
  it("creates a draft via askOpenClaw when ready", async () => {
    const askOpenClaw = vi.fn().mockResolvedValue("Thanks Bob — I'll check and reply shortly.");
    const save = vi.fn().mockResolvedValue(undefined);
    const appendAuditEvent = vi.fn().mockResolvedValue(undefined);

    const result = await generateAgentModeChatDraft({
      envelope: chatEnvelope("Can you help?"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Can you help?",
      remotePeerId: "remote",
      receivedAt: Date.now(),
      correlationId: "corr",
      threadKey: "envoy:owner:bob",
      taskStore: { appendAuditEvent },
      draftStore: { save } as never,
      askOpenClaw,
      ensureOpenClawReady: async () => true,
      buildOpenClawTurnContext: async () => ({ ownerDisplayName: "Me" }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.text).toContain("Thanks Bob");
    expect(askOpenClaw).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
  });

  it("fails closed when OpenClaw is not ready", async () => {
    const result = await generateAgentModeChatDraft({
      envelope: chatEnvelope("Hi"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hi",
      remotePeerId: "remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      threadKey: "envoy:owner:bob",
      taskStore: { appendAuditEvent: vi.fn() },
      draftStore: { save: vi.fn() } as never,
      askOpenClaw: vi.fn(),
      ensureOpenClawReady: async () => false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/not available/i);
  });
});
