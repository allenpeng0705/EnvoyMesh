import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore } from "@envoymesh/local-store";
import {
  evaluateToolPolicy,
  LocalToolRegistry,
  VAULT_SEARCH_TOOL,
  PEER_LOOKUP_TOOL,
  TASK_SUMMARY_TOOL,
  type LocalToolDescriptor,
  type ToolImplementation,
} from "@envoymesh/models";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-tools-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("evaluateToolPolicy", () => {
  const publicTool: LocalToolDescriptor = {
    name: "test_tool",
    description: "A test tool",
    parameters: [],
    minSensitivity: "public",
    requiresApproval: false,
  };

  const friendsTool: LocalToolDescriptor = {
    name: "friends_tool",
    description: "A friends-level tool",
    parameters: [],
    minSensitivity: "friends",
    requiresApproval: false,
  };

  const approvalRequiredTool: LocalToolDescriptor = {
    name: "approval_tool",
    description: "An approval-required tool",
    parameters: [],
    minSensitivity: "public",
    requiresApproval: true,
  };

  it("allows caller with sufficient sensitivity", () => {
    const result = evaluateToolPolicy(publicTool, "public", false);
    expect(result.action).toBe("allow");
  });

  it("allows caller with higher sensitivity than tool requires", () => {
    const result = evaluateToolPolicy(publicTool, "private", false);
    expect(result.action).toBe("allow");
  });

  it("denies caller with insufficient sensitivity", () => {
    const result = evaluateToolPolicy(friendsTool, "public", false);
    expect(result.action).toBe("deny");
    expect(result.reason).toContain("requires sensitivity");
  });

  it("allows tool that requires approval when requireApproval=false", () => {
    const result = evaluateToolPolicy(approvalRequiredTool, "public", false);
    expect(result.action).toBe("allow");
  });

  it("returns approval_required when tool requires approval and requireApproval=true", () => {
    const result = evaluateToolPolicy(approvalRequiredTool, "public", true);
    expect(result.action).toBe("approval_required");
    expect(result.reason).toContain("owner approval");
  });
});

describe("LocalToolRegistry", () => {
  it("registers and lists tools", () => {
    const registry = new LocalToolRegistry();
    const impl: ToolImplementation = async () => ({ ok: true });

    registry.register(VAULT_SEARCH_TOOL, impl);
    registry.register(PEER_LOOKUP_TOOL, impl);

    const descriptors = registry.listDescriptors();
    expect(descriptors.length).toBe(2);
    expect(descriptors.some((t) => t.name === "vault_search")).toBe(true);
    expect(descriptors.some((t) => t.name === "peer_lookup")).toBe(true);
  });

  it("returns undefined for unknown tool", () => {
    const registry = new LocalToolRegistry();
    expect(registry.getDescriptor("nonexistent")).toBeUndefined();
  });

  it("hasTool returns false for unknown tool", () => {
    const registry = new LocalToolRegistry();
    expect(registry.hasTool("nonexistent")).toBe(false);
  });

  it("hasTool returns true for registered tool", () => {
    const registry = new LocalToolRegistry();
    registry.register(VAULT_SEARCH_TOOL, async () => ({}));
    expect(registry.hasTool("vault_search")).toBe(true);
  });

  it("calls an allowed tool successfully", async () => {
    const registry = new LocalToolRegistry();
    registry.register(VAULT_SEARCH_TOOL, async (params) => ({
      query: params.query,
      count: 0,
    }));

    const result = await registry.callTool(
      {
        toolName: "vault_search",
        parameters: { query: "test" },
        callerSensitivity: "public",
      },
      false,
    );

    expect(result.ok).toBe(true);
    expect(result.toolName).toBe("vault_search");
    expect(result.output).toEqual({ query: "test", count: 0 });
    expect(result.policyDecision.action).toBe("allow");
    expect(result.auditEvent.outcome).toBe("allow");
  });

  it("denies unknown tool", async () => {
    const registry = new LocalToolRegistry();

    const result = await registry.callTool(
      {
        toolName: "unknown_tool",
        parameters: {},
        callerSensitivity: "public",
      },
      false,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("unknown tool");
    expect(result.policyDecision.action).toBe("deny");
    expect(result.auditEvent.outcome).toBe("deny");
  });

  it("denies tool when caller sensitivity is insufficient", async () => {
    const registry = new LocalToolRegistry();
    const friendsTool: LocalToolDescriptor = {
      name: "friends_only",
      description: "Requires friends",
      parameters: [],
      minSensitivity: "friends",
      requiresApproval: false,
    };
    registry.register(friendsTool, async () => ({}));

    const result = await registry.callTool(
      {
        toolName: "friends_only",
        parameters: {},
        callerSensitivity: "public", // tool requires friends
      },
      false,
    );

    expect(result.ok).toBe(false);
    expect(result.policyDecision.action).toBe("deny");
    expect(result.auditEvent.outcome).toBe("deny");
  });

  it("returns approval_required when tool requires approval", async () => {
    const registry = new LocalToolRegistry();
    const approvalTool: LocalToolDescriptor = {
      name: "approval_test",
      description: "Test approval",
      parameters: [],
      minSensitivity: "public",
      requiresApproval: true,
    };
    registry.register(approvalTool, async () => ({}));

    const result = await registry.callTool(
      {
        toolName: "approval_test",
        parameters: {},
        callerSensitivity: "public",
      },
      true, // requireApproval = true
    );

    expect(result.ok).toBe(false);
    expect(result.policyDecision.action).toBe("approval_required");
    expect(result.auditEvent.outcome).toBe("approval_required");
  });

  it("allows tool that requires approval when requireApproval=false", async () => {
    const registry = new LocalToolRegistry();
    const approvalTool: LocalToolDescriptor = {
      name: "approval_test2",
      description: "Test approval",
      parameters: [],
      minSensitivity: "public",
      requiresApproval: true,
    };
    registry.register(approvalTool, async () => ({ ok: true }));

    const result = await registry.callTool(
      {
        toolName: "approval_test2",
        parameters: {},
        callerSensitivity: "public",
      },
      false, // requireApproval = false
    );

    expect(result.ok).toBe(true);
    expect(result.policyDecision.action).toBe("allow");
  });

  it("catches and returns tool implementation errors", async () => {
    const registry = new LocalToolRegistry();
    registry.register(VAULT_SEARCH_TOOL, async () => {
      throw new Error("tool internal error");
    });

    const result = await registry.callTool(
      {
        toolName: "vault_search",
        parameters: { query: "test" },
        callerSensitivity: "public",
      },
      false,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("tool internal error");
    expect(result.policyDecision.action).toBe("allow"); // policy passed
  });

  it("audit event has correct structure", async () => {
    const registry = new LocalToolRegistry();
    registry.register(TASK_SUMMARY_TOOL, async () => ({ totalTasks: 0 }));

    const result = await registry.callTool(
      {
        toolName: "task_summary",
        parameters: {},
        callerSensitivity: "public",
        requesterPeerId: "peer-test",
        requesterOwnerId: "envoy:owner:test",
        correlationId: "corr-123",
      },
      false,
    );

    expect(result.auditEvent.version).toBe("0.1");
    expect(result.auditEvent.eventId).toBeDefined();
    expect(result.auditEvent.toolName).toBe("task_summary");
    expect(result.auditEvent.requesterPeerId).toBe("peer-test");
    expect(result.auditEvent.requesterOwnerId).toBe("envoy:owner:test");
    expect(result.auditEvent.correlationId).toBe("corr-123");
    expect(result.auditEvent.parameters).toEqual({});
  });

  it("standard tool descriptors have correct sensitivity requirements", () => {
    // vault_search requires public
    expect(VAULT_SEARCH_TOOL.minSensitivity).toBe("public");
    expect(VAULT_SEARCH_TOOL.requiresApproval).toBe(false);

    // peer_lookup requires public
    expect(PEER_LOOKUP_TOOL.minSensitivity).toBe("public");
    expect(PEER_LOOKUP_TOOL.requiresApproval).toBe(false);

    // task_summary requires public
    expect(TASK_SUMMARY_TOOL.minSensitivity).toBe("public");
    expect(TASK_SUMMARY_TOOL.requiresApproval).toBe(false);
  });
});
