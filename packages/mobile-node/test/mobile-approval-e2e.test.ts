/**
 * @vitest-environment jsdom
 * Mobile approval queue → approvePendingApproval → sendAgentChat.
 */
import { describe, expect, it, vi } from "vitest";
import { ApprovalQueue, createApprovalItem } from "@envoymesh/api";
import { MobileNode } from "../src/index.js";
import { createInMemoryDb, mobileStorageSchema } from "@envoymesh/mobile-storage";

describe("Mobile approval E2E (Phase 13A)", () => {
  it("approvePendingApproval sends agent chat for queued draft", async () => {
    const db = createInMemoryDb();
    for (const sql of mobileStorageSchema()) {
      await db.execute(sql);
    }
    const node = new MobileNode({ profileDir: "/mobile-approval-e2e", relayUrls: [], database: db });
    await node.initStandalone("/mobile-approval-e2e");

    const sendAgentChat = vi
      .spyOn(node, "sendAgentChat")
      .mockResolvedValue({ messageId: "msg-mobile-approved" });

    const queue = (node as unknown as { _approvalQueue: ApprovalQueue })._approvalQueue;
    const item = createApprovalItem(
      "send_chat",
      "Reply to Bob",
      "AI drafted a reply",
      "Thanks — I'll get back to you soon.",
      { contactOwnerId: "envoy:owner:bob", contactDisplayName: "Bob" },
    );
    queue.add(item);

    const result = await node.approvePendingApproval(item.id);
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("msg-mobile-approved");
    expect(sendAgentChat).toHaveBeenCalledWith("envoy:owner:bob", "Thanks — I'll get back to you soon.");
    expect((await node.listPendingApprovals()).length).toBe(0);
  });
});
