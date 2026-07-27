import { describe, expect, it, vi } from "vitest";
import { executeApprovedAction } from "../src/approval-executor.js";
import { createApprovalItem } from "../src/approval-queue.js";

describe("executeApprovedAction", () => {
  it("send_chat calls sendAgentChat with contact and draft", async () => {
    const sendAgentChat = vi.fn(async () => ({ messageId: "msg_1" }));
    const item = createApprovalItem(
      "send_chat",
      "Reply",
      "Draft",
      "Hello from agent",
      { contactOwnerId: "envoy:owner:peer", contactDisplayName: "Peer" },
    );
    const result = await executeApprovedAction(item, { sendAgentChat });
    expect(result).toEqual({ ok: true, actionType: "send_chat", messageId: "msg_1" });
    expect(sendAgentChat).toHaveBeenCalledWith("envoy:owner:peer", "Hello from agent");
  });

  it("send_chat rejects missing contactOwnerId", async () => {
    const item = createApprovalItem("send_chat", "Reply", "Draft", "Hi", {});
    const result = await executeApprovedAction(item, {
      sendAgentChat: vi.fn(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("contactOwnerId");
    }
  });

  it("discovery_forward delegates to forwardDiscovery", async () => {
    const forwardDiscovery = vi.fn(async () => ({ ok: true }));
    const item = createApprovalItem(
      "discovery_forward",
      "Forward",
      "Desc",
      JSON.stringify({
        requestMessageId: "m1",
        requesterOwnerId: "envoy:owner:a",
        excludeOwnerIds: [],
        requestedCapabilities: ["music"],
        requestedTagHashes: [],
        maxHops: 2,
        currentHop: 0,
      }),
    );
    const result = await executeApprovedAction(item, {
      sendAgentChat: vi.fn(),
      forwardDiscovery,
    });
    expect(result).toEqual({ ok: true, actionType: "discovery_forward" });
    expect(forwardDiscovery).toHaveBeenCalledOnce();
  });

  it("unknown action types are not executable", async () => {
    const item = createApprovalItem("share_knowledge", "Share", "Draft", "data", {});
    const result = await executeApprovedAction(item, {
      sendAgentChat: vi.fn(),
    });
    expect(result.ok).toBe(false);
  });

  it("tool_call re-executes via executeToolCall", async () => {
    const executeToolCall = vi.fn(async () => ({ ok: true, messageId: "m-tool" }));
    const item = createApprovalItem(
      "tool_call",
      "Tool: chat.send",
      "needs approval",
      JSON.stringify({
        toolName: "chat.send",
        params: { targetOwnerId: "envoy:owner:peer", text: "hi" },
      }),
    );
    const result = await executeApprovedAction(item, {
      sendAgentChat: vi.fn(),
      executeToolCall,
    });
    expect(result).toEqual({ ok: true, actionType: "tool_call", messageId: "m-tool" });
    expect(executeToolCall).toHaveBeenCalledWith("chat.send", {
      targetOwnerId: "envoy:owner:peer",
      text: "hi",
    });
  });
});
