import { describe, expect, it } from "vitest";
import {
  evaluateToolCallFirewall,
  MAX_TOOL_ARG_STRING_CHARS,
  type ToolCallFirewallTool,
} from "../src/tool-call-firewall.js";

function chatSendTool(): ToolCallFirewallTool {
  return {
    name: "chat.send",
    paramSchema: {
      type: "object",
      properties: {
        targetOwnerId: { type: "string" },
        text: { type: "string" },
      },
      required: ["targetOwnerId", "text"],
    },
    sensitivityCeiling: "friends",
    requiresApproval: true,
  };
}

function knowledgeQueryTool(): ToolCallFirewallTool {
  return {
    name: "knowledge.query",
    paramSchema: {
      type: "object",
      properties: {
        targetOwnerId: { type: "string" },
        query: { type: "string" },
        requestedSensitivity: {
          type: "string",
          enum: ["public", "friends", "trusted", "private"],
        },
      },
      required: ["targetOwnerId", "query"],
    },
    sensitivityCeiling: "friends",
    requiresApproval: false,
  };
}

describe("evaluateToolCallFirewall", () => {
  it("allows valid args when approval is granted for requiresApproval tools", () => {
    const result = evaluateToolCallFirewall({
      tool: chatSendTool(),
      params: { targetOwnerId: "envoy:owner:abc", text: "hello" },
      approvalGranted: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.text).toBe("hello");
    }
  });

  it("requires approval before side effects when flag is set", () => {
    const result = evaluateToolCallFirewall({
      tool: chatSendTool(),
      params: { targetOwnerId: "envoy:owner:abc", text: "hello" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.action).toBe("approval_required");
      expect(result.reason).toContain("requires owner approval");
      if (result.action === "approval_required") {
        expect(result.params.text).toBe("hello");
      }
    }
  });

  it("denies missing required parameters", () => {
    const result = evaluateToolCallFirewall({
      tool: chatSendTool(),
      params: { targetOwnerId: "envoy:owner:abc" },
      approvalGranted: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.action).toBe("deny");
      expect(result.reason).toContain("missing required parameter: text");
    }
  });

  it("denies empty string for required string parameters", () => {
    const result = evaluateToolCallFirewall({
      tool: chatSendTool(),
      params: { targetOwnerId: "envoy:owner:abc", text: "   " },
      approvalGranted: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("required parameter is empty: text");
    }
  });

  it("denies wrong types", () => {
    const result = evaluateToolCallFirewall({
      tool: chatSendTool(),
      params: { targetOwnerId: "envoy:owner:abc", text: 42 },
      approvalGranted: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("text must be a string");
    }
  });

  it("denies control characters in string args", () => {
    const result = evaluateToolCallFirewall({
      tool: chatSendTool(),
      params: { targetOwnerId: "envoy:owner:abc", text: "bad\x00payload" },
      approvalGranted: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("control characters");
    }
  });

  it("denies control characters in nested object args", () => {
    const result = evaluateToolCallFirewall({
      tool: {
        name: "mesh.mcp.call_tool",
        paramSchema: {
          type: "object",
          properties: {
            serverName: { type: "string" },
            toolName: { type: "string" },
            arguments: { type: "object" },
          },
          required: ["serverName", "toolName"],
        },
        sensitivityCeiling: "public",
        requiresApproval: false,
      },
      params: {
        serverName: "local",
        toolName: "read",
        arguments: { path: "ok", note: "evil\x01" },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("control characters");
    }
  });

  it("denies path traversal in path-like args", () => {
    const result = evaluateToolCallFirewall({
      tool: {
        name: "share.send",
        paramSchema: {
          type: "object",
          properties: {
            targetOwnerId: { type: "string" },
            path: { type: "string" },
          },
          required: ["targetOwnerId", "path"],
        },
        sensitivityCeiling: "trusted",
        requiresApproval: true,
      },
      params: { targetOwnerId: "envoy:owner:abc", path: "../../etc/passwd" },
      approvalGranted: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("path traversal");
    }
  });

  it("denies URL-encoded path traversal", () => {
    const result = evaluateToolCallFirewall({
      tool: {
        name: "share.send",
        paramSchema: {
          type: "object",
          properties: {
            targetOwnerId: { type: "string" },
            path: { type: "string" },
          },
          required: ["targetOwnerId", "path"],
        },
        sensitivityCeiling: "trusted",
        requiresApproval: true,
      },
      params: { targetOwnerId: "envoy:owner:abc", path: "%2e%2e/%2e%2e/etc/passwd" },
      approvalGranted: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("path traversal");
    }
  });

  it("strips undeclared properties from allowed params", () => {
    const result = evaluateToolCallFirewall({
      tool: chatSendTool(),
      params: {
        targetOwnerId: "envoy:owner:abc",
        text: "hello",
        extrudeSecrets: "should-be-removed",
      },
      approvalGranted: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params).toEqual({
        targetOwnerId: "envoy:owner:abc",
        text: "hello",
      });
      expect(result.params).not.toHaveProperty("extrudeSecrets");
    }
  });

  it("denies requestedSensitivity above tool ceiling", () => {
    const result = evaluateToolCallFirewall({
      tool: knowledgeQueryTool(),
      params: {
        targetOwnerId: "envoy:owner:abc",
        query: "secrets",
        requestedSensitivity: "private",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("exceeds tool ceiling");
    }
  });

  it("allows requestedSensitivity within ceiling", () => {
    const result = evaluateToolCallFirewall({
      tool: knowledgeQueryTool(),
      params: {
        targetOwnerId: "envoy:owner:abc",
        query: "hello",
        requestedSensitivity: "friends",
      },
    });
    expect(result.ok).toBe(true);
  });

  it("clamps oversized numeric knobs", () => {
    const result = evaluateToolCallFirewall({
      tool: {
        name: "vault.search",
        paramSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
        sensitivityCeiling: "public",
        requiresApproval: false,
      },
      params: { query: "x", limit: 9999 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.limit).toBe(100);
      expect(result.rewrites.some((r) => r.includes("limit"))).toBe(true);
    }
  });

  it("denies oversized string args", () => {
    const result = evaluateToolCallFirewall({
      tool: chatSendTool(),
      params: {
        targetOwnerId: "envoy:owner:abc",
        text: "x".repeat(MAX_TOOL_ARG_STRING_CHARS + 1),
      },
      approvalGranted: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("max length");
    }
  });

  it("skips approval gate for approval-meta tools", () => {
    const result = evaluateToolCallFirewall({
      tool: {
        name: "mesh.approve",
        paramSchema: {
          type: "object",
          properties: { itemId: { type: "string" } },
          required: ["itemId"],
        },
        sensitivityCeiling: "private",
        requiresApproval: true,
      },
      params: { itemId: "item-1" },
    });
    expect(result.ok).toBe(true);
  });
});
