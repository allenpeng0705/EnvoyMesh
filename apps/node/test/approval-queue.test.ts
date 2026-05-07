import { describe, expect, it, beforeEach } from "vitest";
import {
  ApprovalQueue,
  createApprovalItem,
  shouldEscalate,
  buildListPendingTool,
  buildApproveTool,
  buildRejectTool,
  buildRejectAllTool,
  buildEscalateTool,
  buildListAllApprovalsTool,
  type EscalationReason,
} from "../src/approval-queue.js";

describe("createApprovalItem", () => {
  it("creates a basic approval item", () => {
    const item = createApprovalItem(
      "send_chat",
      "Send message to Alice",
      "Daily check-in message",
      "Hey Alice, how are you?",
    );

    expect(item.id).toBeDefined();
    expect(item.actionType).toBe("send_chat");
    expect(item.status).toBe("pending");
    expect(item.title).toBe("Send message to Alice");
    expect(item.draftContent).toBe("Hey Alice, how are you?");
    expect(item.priority).toBe("normal");
    expect(item.expiresAt).toBeDefined();
  });

  it("creates with custom priority", () => {
    const item = createApprovalItem(
      "send_chat",
      "Urgent message",
      "Time sensitive",
      "Help!",
      {},
      "urgent",
    );

    expect(item.priority).toBe("urgent");
  });

  it("includes context", () => {
    const item = createApprovalItem(
      "send_chat",
      "Message to Bob",
      "Follow up",
      "Hi Bob!",
      { contactOwnerId: "bob-123", contactDisplayName: "Bob" },
    );

    expect(item.context.contactOwnerId).toBe("bob-123");
    expect(item.context.contactDisplayName).toBe("Bob");
  });
});

describe("shouldEscalate", () => {
  it("returns low_confidence for low confidence items", () => {
    const item = createApprovalItem(
      "send_chat",
      "Test",
      "Test",
      "Test",
      { confidence: 0.5 },
    );

    expect(shouldEscalate(item)).toBe("low_confidence");
  });

  it("returns emotional_content for negative sentiment", () => {
    const item = createApprovalItem(
      "send_chat",
      "Test",
      "Test",
      "Test",
      { sentiment: "negative" as const },
    );

    expect(shouldEscalate(item)).toBe("emotional_content");
  });

  it("returns sensitive_topic for high sensitivity", () => {
    const item = createApprovalItem(
      "send_chat",
      "Test",
      "Test",
      "Test",
      { sensitivityLevel: 8 },
    );

    expect(shouldEscalate(item)).toBe("sensitive_topic");
  });

  it("returns null for normal items", () => {
    const item = createApprovalItem(
      "send_chat",
      "Test",
      "Test",
      "Test",
      { confidence: 0.9, sentiment: "neutral" as const, sensitivityLevel: 3 },
    );

    expect(shouldEscalate(item)).toBeNull();
  });
});

describe("ApprovalQueue", () => {
  let queue: ApprovalQueue;

  beforeEach(() => {
    queue = new ApprovalQueue();
  });

  describe("add/get/remove", () => {
    it("adds and retrieves item", () => {
      const item = createApprovalItem("send_chat", "Test", "Test", "Test");
      queue.add(item);

      const retrieved = queue.get(item.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe("Test");
    });

    it("removes item", () => {
      const item = createApprovalItem("send_chat", "Test", "Test", "Test");
      queue.add(item);

      const removed = queue.remove(item.id);
      expect(removed).toBe(true);
      expect(queue.get(item.id)).toBeUndefined();
    });

    it("updates item", () => {
      const item = createApprovalItem("send_chat", "Test", "Test", "Test");
      queue.add(item);

      queue.update(item.id, { title: "Updated" });
      expect(queue.get(item.id)?.title).toBe("Updated");
    });
  });

  describe("listPending", () => {
    it("returns pending items sorted by priority and date", () => {
      const item1 = createApprovalItem("send_chat", "Low priority", "Test", "Test", {}, "low");
      const item2 = createApprovalItem("send_chat", "Urgent", "Test", "Test", {}, "urgent");
      const item3 = createApprovalItem("send_chat", "Normal", "Test", "Test", {}, "normal");

      queue.add(item1);
      queue.add(item2);
      queue.add(item3);

      const pending = queue.listPending();
      expect(pending[0].title).toBe("Urgent");
      expect(pending[1].title).toBe("Normal");
      expect(pending[2].title).toBe("Low priority");
    });

    it("excludes non-pending items", () => {
      const item = createApprovalItem("send_chat", "Test", "Test", "Test");
      queue.add(item);
      queue.approve(item.id);

      expect(queue.listPending()).toHaveLength(0);
    });
  });

  describe("listByContact", () => {
    it("filters by contact owner ID", () => {
      const item1 = createApprovalItem("send_chat", "To Alice", "Test", "Test", { contactOwnerId: "alice" });
      const item2 = createApprovalItem("send_chat", "To Bob", "Test", "Test", { contactOwnerId: "bob" });
      queue.add(item1);
      queue.add(item2);

      const aliceItems = queue.listByContact("alice");
      expect(aliceItems).toHaveLength(1);
      expect(aliceItems[0].title).toBe("To Alice");
    });
  });

  describe("approve", () => {
    it("approves pending item", () => {
      const item = createApprovalItem("send_chat", "Test", "Test", "Test");
      queue.add(item);

      const approved = queue.approve(item.id);
      expect(approved?.status).toBe("approved");
      expect(approved?.resolution).toBe("approved");
      expect(approved?.resolvedBy).toBe("owner");
      expect(approved?.resolvedAt).toBeDefined();
    });

    it("returns undefined for non-existent item", () => {
      const result = queue.approve("non-existent");
      expect(result).toBeUndefined();
    });

    it("returns undefined for already resolved item", () => {
      const item = createApprovalItem("send_chat", "Test", "Test", "Test");
      queue.add(item);
      queue.approve(item.id);

      const result = queue.approve(item.id);
      expect(result).toBeUndefined();
    });
  });

  describe("reject", () => {
    it("rejects pending item", () => {
      const item = createApprovalItem("send_chat", "Test", "Test", "Test");
      queue.add(item);

      const rejected = queue.reject(item.id, "Not appropriate");
      expect(rejected?.status).toBe("rejected");
      expect(rejected?.notes).toBe("Not appropriate");
    });
  });

  describe("escalate", () => {
    it("escalates pending item", () => {
      const item = createApprovalItem("send_chat", "Test", "Test", "Test");
      queue.add(item);

      const escalated = queue.escalate(item.id, "low_confidence");
      expect(escalated?.status).toBe("escalated");
      expect(escalated?.priority).toBe("urgent");
    });

    it("sets high priority for non-emotional escalations", () => {
      const item = createApprovalItem("send_chat", "Test", "Test", "Test");
      queue.add(item);

      const escalated = queue.escalate(item.id, "high_cost");
      expect(escalated?.status).toBe("escalated");
      expect(escalated?.priority).toBe("high");
    });
  });

  describe("expireOldItems", () => {
    it("expires items past their expiry date", () => {
      const item = createApprovalItem("send_chat", "Test", "Test", "Test");
      item.expiresAt = new Date(Date.now() - 1000).toISOString(); // 1 second ago
      queue.add(item);

      const expired = queue.expireOldItems();
      expect(expired).toHaveLength(1);
      expect(queue.get(item.id)?.status).toBe("expired");
    });
  });

  describe("clearResolved", () => {
    it("removes rejected and expired items", () => {
      const item1 = createApprovalItem("send_chat", "Test1", "Test", "Test");
      const item2 = createApprovalItem("send_chat", "Test2", "Test", "Test");
      queue.add(item1);
      queue.add(item2);
      queue.reject(item1.id);
      item2.status = "expired";
      queue.update(item2.id, { status: "expired" });

      const count = queue.clearResolved();
      expect(count).toBe(2);
      expect(queue.listAll()).toHaveLength(0);
    });
  });

  describe("pendingCount", () => {
    it("returns count of pending items", () => {
      queue.add(createApprovalItem("send_chat", "Test1", "Test", "Test"));
      queue.add(createApprovalItem("send_chat", "Test2", "Test", "Test"));
      expect(queue.pendingCount()).toBe(2);

      const item = queue.listPending()[0];
      queue.approve(item.id);
      expect(queue.pendingCount()).toBe(1);
    });
  });
});

describe("buildListPendingTool", () => {
  it("lists pending items", async () => {
    const queue = new ApprovalQueue();
    queue.add(createApprovalItem("send_chat", "Test", "Test", "Test"));
    const tool = buildListPendingTool(queue);

    const result = await tool({});
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
  });

  it("filters by contact", async () => {
    const queue = new ApprovalQueue();
    queue.add(createApprovalItem("send_chat", "To Alice", "Test", "Test", { contactOwnerId: "alice" }));
    queue.add(createApprovalItem("send_chat", "To Bob", "Test", "Test", { contactOwnerId: "bob" }));
    const tool = buildListPendingTool(queue);

    const result = await tool({ contactOwnerId: "alice" });
    expect(result.count).toBe(1);
    expect(result.items[0].title).toBe("To Alice");
  });
});

describe("buildApproveTool", () => {
  it("approves item", async () => {
    const queue = new ApprovalQueue();
    const item = createApprovalItem("send_chat", "Test", "Test", "Test");
    queue.add(item);
    const tool = buildApproveTool(queue);

    const result = await tool({ itemId: item.id });
    expect(result.ok).toBe(true);
    expect(result.item?.status).toBe("approved");
  });

  it("returns error for missing itemId", async () => {
    const queue = new ApprovalQueue();
    const tool = buildApproveTool(queue);

    const result = await tool({});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("itemId");
  });

  it("returns error for non-existent item", async () => {
    const queue = new ApprovalQueue();
    const tool = buildApproveTool(queue);

    const result = await tool({ itemId: "non-existent" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("buildRejectTool", () => {
  it("rejects item", async () => {
    const queue = new ApprovalQueue();
    const item = createApprovalItem("send_chat", "Test", "Test", "Test");
    queue.add(item);
    const tool = buildRejectTool(queue);

    const result = await tool({ itemId: item.id, notes: "Not appropriate" });
    expect(result.ok).toBe(true);
    expect(result.item?.status).toBe("rejected");
    expect(result.item?.notes).toBe("Not appropriate");
  });
});

describe("buildRejectAllTool", () => {
  it("rejects all pending items", async () => {
    const queue = new ApprovalQueue();
    queue.add(createApprovalItem("send_chat", "Test1", "Test", "Test"));
    queue.add(createApprovalItem("send_chat", "Test2", "Test", "Test"));
    const tool = buildRejectAllTool(queue);

    const result = await tool({ notes: "Bulk reject" });
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(queue.pendingCount()).toBe(0);
  });
});

describe("buildEscalateTool", () => {
  it("escalates item", async () => {
    const queue = new ApprovalQueue();
    const item = createApprovalItem("send_chat", "Test", "Test", "Test");
    queue.add(item);
    const tool = buildEscalateTool(queue);

    const result = await tool({ itemId: item.id, reason: "low_confidence" });
    expect(result.ok).toBe(true);
    expect(result.item?.status).toBe("escalated");
  });

  it("returns error for invalid reason", async () => {
    const queue = new ApprovalQueue();
    const item = createApprovalItem("send_chat", "Test", "Test", "Test");
    queue.add(item);
    const tool = buildEscalateTool(queue);

    const result = await tool({ itemId: item.id, reason: "invalid" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("reason");
  });
});

describe("buildListAllApprovalsTool", () => {
  it("lists all items including resolved", async () => {
    const queue = new ApprovalQueue();
    const item1 = createApprovalItem("send_chat", "Test1", "Test", "Test");
    const item2 = createApprovalItem("send_chat", "Test2", "Test", "Test");
    queue.add(item1);
    queue.add(item2);
    queue.approve(item1.id);

    const tool = buildListAllApprovalsTool(queue);
    const result = await tool({});
    expect(result.count).toBe(2);
  });
});
