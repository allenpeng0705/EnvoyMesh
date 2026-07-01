/**
 * Tests for task.feedback + chat.room.sync + chat.room.message runtimes.
 */
import { describe, expect, it, vi } from "vitest";
import { handleTaskFeedbackViaRuntime } from "../src/cli-mesh-inbound-task-feedback.js";
import { handleChatRoomSyncViaRuntime } from "../src/cli-mesh-inbound-chat-room-sync.js";
import { handleChatRoomMessageViaRuntime } from "../src/cli-mesh-inbound-chat-room-message.js";

describe("cli-mesh-inbound-task-feedback", () => {
  it("returns silently after persisting feedback", async () => {
    const ctx = {
      handleInboundTaskFeedback: vi.fn(async () => ({ ok: true })),
      getTaskStore: vi.fn(() => ({})),
      getReputationStore: vi.fn(() => ({})),
      getPeerDirectoryStore: vi.fn(() => ({})),
      logWarn: vi.fn(),
    };
    await handleTaskFeedbackViaRuntime(ctx, {
      envelope: { intent: "task.feedback" },
      remotePeerId: "rp",
    });
    expect(ctx.logWarn).not.toHaveBeenCalled();
  });

  it("warns when the handler rejects", async () => {
    const ctx = {
      handleInboundTaskFeedback: vi.fn(async () => ({
        ok: false,
        reason: "reputation_mismatch",
      })),
      getTaskStore: vi.fn(() => ({})),
      getReputationStore: vi.fn(() => ({})),
      getPeerDirectoryStore: vi.fn(() => ({})),
      logWarn: vi.fn(),
    };
    await handleTaskFeedbackViaRuntime(ctx, {
      envelope: { intent: "task.feedback" },
      remotePeerId: "rp",
    });
    expect(ctx.logWarn).toHaveBeenCalled();
  });
});

describe("cli-mesh-inbound-chat-room-sync", () => {
  it("forwards parsed payload to handler", async () => {
    const handleInboundChatRoomSync = vi.fn(async () => {});
    const ctx = {
      parseChatRoomSyncPayload: vi.fn(() => ({ events: [] })),
      handleInboundChatRoomSync,
    };
    await handleChatRoomSyncViaRuntime(ctx, {
      envelope: { payload: "raw" },
      remotePeerId: "rp",
    });
    expect(handleInboundChatRoomSync).toHaveBeenCalledWith(
      { payload: "raw" },
      { events: [] },
    );
  });

  it("warns on parse error (does not throw)", async () => {
    const ctx = {
      parseChatRoomSyncPayload: vi.fn(() => {
        throw new Error("bad");
      }),
      handleInboundChatRoomSync: vi.fn(async () => {}),
      logWarn: vi.fn(),
    };
    await expect(
      handleChatRoomSyncViaRuntime(ctx, {
        envelope: { payload: "bad" },
        remotePeerId: "rp",
      }),
    ).resolves.toBeUndefined();
    expect(ctx.logWarn).toHaveBeenCalled();
  });
});

describe("cli-mesh-inbound-chat-room-message", () => {
  it("forwards parsed payload + replyWithEnvelope to handler", async () => {
    const handleInboundChatRoomMessage = vi.fn(async () => {});
    const replyWithEnvelope = vi.fn(async () => {});
    const ctx = {
      parseChatRoomMessagePayload: vi.fn(() => ({ text: "hi" })),
      handleInboundChatRoomMessage,
    };
    await handleChatRoomMessageViaRuntime(ctx, {
      envelope: { payload: "raw" },
      remotePeerId: "rp",
      replyWithEnvelope,
    });
    expect(handleInboundChatRoomMessage).toHaveBeenCalledWith(
      { payload: "raw" },
      { text: "hi" },
      "rp",
      replyWithEnvelope,
    );
  });

  it("warns on parse error", async () => {
    const ctx = {
      parseChatRoomMessagePayload: vi.fn(() => {
        throw new Error("bad");
      }),
      handleInboundChatRoomMessage: vi.fn(async () => {}),
      logWarn: vi.fn(),
    };
    await expect(
      handleChatRoomMessageViaRuntime(ctx, {
        envelope: { payload: "bad" },
        remotePeerId: "rp",
      }),
    ).resolves.toBeUndefined();
    expect(ctx.logWarn).toHaveBeenCalled();
  });
});