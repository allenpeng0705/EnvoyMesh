import { describe, expect, it, vi } from "vitest";
import { deliverStagedChatAttachmentPipeline } from "../src/chat-attachment-deliver.js";

describe("deliverStagedChatAttachmentPipeline", () => {
  it("emits stage events and succeeds when chat and share deliver", async () => {
    const events: string[] = [];
    const result = await deliverStagedChatAttachmentPipeline({
      targetOwnerId: "envoy:owner:peer",
      messageId: "msg-1",
      attachmentId: "att-1",
      onEvent: (event) => events.push(`${event.stage}:${event.status}`),
      deliverChat: async () => ({ delivered: true, deliveredAt: new Date().toISOString() }),
      deliverShare: async () => undefined,
    });

    expect(result).toEqual({ chatDelivered: true, shareDelivered: true });
    expect(events).toContain("chat:started");
    expect(events).toContain("chat:completed");
    expect(events).toContain("share:started");
    expect(events).toContain("share:completed");
    expect(events).toContain("data:completed");
  });

  it("stops after chat failure", async () => {
    const deliverShare = vi.fn(async () => undefined);
    const result = await deliverStagedChatAttachmentPipeline({
      targetOwnerId: "envoy:owner:peer",
      messageId: "msg-2",
      attachmentId: "att-2",
      deliverChat: async () => ({ delivered: false }),
      deliverShare,
    });

    expect(result).toEqual({ chatDelivered: false, shareDelivered: false });
    expect(deliverShare).not.toHaveBeenCalled();
  });

  it("retries share up to three times", async () => {
    let shareAttempts = 0;
    const result = await deliverStagedChatAttachmentPipeline({
      targetOwnerId: "envoy:owner:peer",
      messageId: "msg-3",
      attachmentId: "att-3",
      deliverChat: async () => ({ delivered: true }),
      deliverShare: async () => {
        shareAttempts += 1;
        if (shareAttempts < 2) {
          throw new Error("share failed");
        }
      },
    });

    expect(result).toEqual({ chatDelivered: true, shareDelivered: true });
    expect(shareAttempts).toBe(2);
  });
});
