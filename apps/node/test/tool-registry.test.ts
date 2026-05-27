import { describe, expect, it } from "vitest";
import { createLocalTaskStore } from "@envoymesh/local-store";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ToolRegistry,
  executeTool,
  listAgentTools,
  type ToolDefinition,
  type ToolParams,
  type ToolResult,
} from "../src/tool-registry.js";

describe("ToolRegistry", () => {
  describe("register and get", () => {
    it("registers and retrieves a tool", () => {
      const registry = new ToolRegistry();
      const toolDef: ToolDefinition = {
        name: "test.tool",
        description: "A test tool",
        paramSchema: { type: "object", properties: {} },
        sensitivityCeiling: "public",
        requiresApproval: false,
        isMeshTool: false,
      };

      registry.register(toolDef);
      const retrieved = registry.get("test.tool");

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("test.tool");
      expect(retrieved?.description).toBe("A test tool");
    });

    it("returns undefined for unknown tool", () => {
      const registry = new ToolRegistry();
      const retrieved = registry.get("nonexistent.tool");
      expect(retrieved).toBeUndefined();
    });

    it("has returns true for registered tool", () => {
      const registry = new ToolRegistry();
      const toolDef: ToolDefinition = {
        name: "has.test",
        description: "Test",
        paramSchema: { type: "object", properties: {} },
        sensitivityCeiling: "public",
        requiresApproval: false,
        isMeshTool: false,
      };

      registry.register(toolDef);
      expect(registry.has("has.test")).toBe(true);
    });

    it("has returns false for unknown tool", () => {
      const registry = new ToolRegistry();
      expect(registry.has("unknown.tool")).toBe(false);
    });
  });

  describe("listTools", () => {
    it("lists all registered tools including defaults", () => {
      const registry = new ToolRegistry();
      registry.register({
        name: "tool.1",
        description: "First tool",
        paramSchema: { type: "object", properties: {} },
        sensitivityCeiling: "public",
        requiresApproval: false,
        isMeshTool: false,
      });
      registry.register({
        name: "tool.2",
        description: "Second tool",
        paramSchema: { type: "object", properties: {} },
        sensitivityCeiling: "friends",
        requiresApproval: true,
        isMeshTool: true,
      });

      const tools = registry.listTools();
      // 45 default tools + 2 additional = 47
      expect(tools).toHaveLength(47);
      expect(tools.map((t) => t.name).sort()).toEqual(
        [
          "bond.send_hello", "chat.send", "discovery.search", "knowledge.query",
          "mesh.acknowledge-escalation", "mesh.add-trigger", "mesh.agent_card.request",
          "mesh.approve", "mesh.escalate", "mesh.get-contact-disclosure", "mesh.get-digest",
          "mesh.get-digest-config", "mesh.get-external-agent", "mesh.get_agent_card",
          "mesh.get-mode", "mesh.get-style", "mesh.library_discover", "mesh.library_export_ipfs",
          "mesh.library_list", "mesh.library_publish", "mesh.library_request_share", "mesh.library_verify_ipfs_gateway",
          "mesh.list-all-approvals",
          "mesh.list-external-agent-actions",
          "mesh.list-external-sessions", "mesh.list-pending", "mesh.list-sessions",
          "mesh.list-triggers", "mesh.reject", "mesh.reject-all", "mesh.remove-trigger",
          "mesh.revoke-external-agent", "mesh.session-summary", "mesh.set-contact-disclosure",
          "mesh.set-contact-mode", "mesh.set-digest-schedule", "mesh.set-mode",
          "mesh.set-style", "mesh.share_list_pending", "mesh.share_list_proposals", "mesh.share_propose",
          "mesh.transfer_status", "mesh.update-trigger", "share.send", "tool.1", "tool.2",
          "vault.search",
        ].sort(),
      );
    });

    it("default tools are pre-registered", () => {
      const registry = new ToolRegistry();
      const tools = registry.listTools();
      // Default tools: prior 43 + mesh.agent_card.request + mesh.get_agent_card = 45
      expect(tools.length).toBe(45);
    });
  });

  describe("default tools", () => {
    it("has default tools registered", () => {
      const registry = new ToolRegistry();
      const tools = registry.listTools();

      expect(tools.length).toBeGreaterThan(0);
    });

    it("has chat.send tool", () => {
      const registry = new ToolRegistry();
      const chatTool = registry.get("chat.send");

      expect(chatTool).toBeDefined();
      expect(chatTool?.intent).toBe("chat.message");
      expect(chatTool?.isMeshTool).toBe(true);
      expect(chatTool?.requiresApproval).toBe(true);
      expect(chatTool?.sensitivityCeiling).toBe("friends");
    });

    it("has knowledge.query tool", () => {
      const registry = new ToolRegistry();
      const knowledgeTool = registry.get("knowledge.query");

      expect(knowledgeTool).toBeDefined();
      expect(knowledgeTool?.intent).toBe("knowledge.query");
      expect(knowledgeTool?.isMeshTool).toBe(true);
      expect(knowledgeTool?.requiresApproval).toBe(false);
    });

    it("has discovery.search tool", () => {
      const registry = new ToolRegistry();
      const discoveryTool = registry.get("discovery.search");

      expect(discoveryTool).toBeDefined();
      expect(discoveryTool?.intent).toBe("discovery.request");
      expect(discoveryTool?.isMeshTool).toBe(true);
      expect(discoveryTool?.requiresApproval).toBe(false);
      expect(discoveryTool?.sensitivityCeiling).toBe("public");
    });

    it("has share.send tool", () => {
      const registry = new ToolRegistry();
      const shareTool = registry.get("share.send");

      expect(shareTool).toBeDefined();
      expect(shareTool?.intent).toBe("share.request");
      expect(shareTool?.isMeshTool).toBe(true);
      expect(shareTool?.requiresApproval).toBe(true);
      expect(shareTool?.sensitivityCeiling).toBe("trusted");
    });

    it("has bond.send_hello tool", () => {
      const registry = new ToolRegistry();
      const bondTool = registry.get("bond.send_hello");

      expect(bondTool).toBeDefined();
      expect(bondTool?.intent).toBe("bond.request");
      expect(bondTool?.isMeshTool).toBe(true);
      expect(bondTool?.requiresApproval).toBe(false);
      expect(bondTool?.sensitivityCeiling).toBe("public");
    });

    it("has vault.search tool", () => {
      const registry = new ToolRegistry();
      const vaultTool = registry.get("vault.search");

      expect(vaultTool).toBeDefined();
      expect(vaultTool?.intent).toBeUndefined();
      expect(vaultTool?.isMeshTool).toBe(false);
      expect(vaultTool?.requiresApproval).toBe(false);
      expect(vaultTool?.sensitivityCeiling).toBe("private");
    });

    it("has mesh.agent_card.request as mesh tool with agent.card.request intent", () => {
      const registry = new ToolRegistry();
      const tool = registry.get("mesh.agent_card.request");

      expect(tool).toBeDefined();
      expect(tool?.intent).toBe("agent.card.request");
      expect(tool?.isMeshTool).toBe(true);
    });

    it("has mesh.get_agent_card as local-only read tool", () => {
      const registry = new ToolRegistry();
      const tool = registry.get("mesh.get_agent_card");

      expect(tool).toBeDefined();
      expect(tool?.intent).toBeUndefined();
      expect(tool?.isMeshTool).toBe(false);
    });
  });
});

describe("listAgentTools", () => {
  it("returns all available agent tools", () => {
    const tools = listAgentTools();

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === "chat.send")).toBe(true);
    expect(tools.some((t) => t.name === "knowledge.query")).toBe(true);
    expect(tools.some((t) => t.name === "discovery.search")).toBe(true);
    expect(tools.some((t) => t.name === "share.send")).toBe(true);
    expect(tools.some((t) => t.name === "bond.send_hello")).toBe(true);
    expect(tools.some((t) => t.name === "vault.search")).toBe(true);
    expect(tools.some((t) => t.name === "mesh.library_publish")).toBe(true);
    expect(tools.some((t) => t.name === "mesh.share_propose")).toBe(true);
  });

  it("each tool has required fields", () => {
    const tools = listAgentTools();

    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.paramSchema).toBe("object");
      expect(["public", "friends", "trusted", "private"]).toContain(tool.sensitivityCeiling);
      expect(typeof tool.requiresApproval).toBe("boolean");
      expect(typeof tool.isMeshTool).toBe("boolean");
    }
  });

  it("mesh tools have intent, local tools do not", () => {
    const tools = listAgentTools();

    for (const tool of tools) {
      if (tool.isMeshTool) {
        expect(tool.intent).toBeDefined();
        expect(typeof tool.intent).toBe("string");
      } else {
        expect(tool.intent).toBeUndefined();
      }
    }
  });

  it("excludes mesh.intro.* tools when trust mode off", () => {
    const tools = listAgentTools();
    expect(tools.some((t) => t.name.startsWith("mesh.intro."))).toBe(false);
  });

    it("includes mesh.intro.* tools when trustModeEnabled", () => {
    const tools = listAgentTools({ trustModeEnabled: true });
    expect(tools.some((t) => t.name === "mesh.intro.matching_context")).toBe(true);
    expect(tools.some((t) => t.name === "mesh.intro.sync")).toBe(true);
    expect(tools.some((t) => t.name === "mesh.intro.broadcast_search")).toBe(true);
    expect(tools.some((t) => t.name === "mesh.intro.run_autopilot")).toBe(true);
  });
});

describe("executeTool — IPFS library hooks", () => {
  it("mesh.library_export_ipfs requires approval", () => {
    const tool = listAgentTools().find((t) => t.name === "mesh.library_export_ipfs");
    expect(tool?.requiresApproval).toBe(true);
  });

  it("mesh.library_export_ipfs delegates to context hook", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-tool-ipfs-"));
    try {
      const taskStore = createLocalTaskStore(profileDir);
      const result = await executeTool(
        "mesh.library_export_ipfs",
        { documentId: "doc-1" },
        {
          trustStore: {} as never,
          peerDirectoryStore: {} as never,
          taskStore,
          agentIdentity: {} as never,
          ownerIdentity: { ownerId: "envoy:owner:test" },
          agentCredential: {} as never,
          exportLibraryItemToIpfs: async (documentId) => ({
            documentId,
            cid: "bafyfromtool",
            exportRevision: 1,
          }),
        },
      );
      expect(result.ok).toBe(true);
      expect((result.result as { cid?: string })?.cid).toBe("bafyfromtool");
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("mesh.library_export_ipfs requires documentId", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-tool-ipfs-"));
    try {
      const taskStore = createLocalTaskStore(profileDir);
      const result = await executeTool(
        "mesh.library_export_ipfs",
        {},
        {
          trustStore: {} as never,
          peerDirectoryStore: {} as never,
          taskStore,
          agentIdentity: {} as never,
          ownerIdentity: { ownerId: "envoy:owner:test" },
          agentCredential: {} as never,
          exportLibraryItemToIpfs: async () => ({ cid: "bafy" }),
        },
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/documentId is required/i);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("mesh.library_verify_ipfs_gateway delegates to context hook", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-tool-ipfs-"));
    try {
      const taskStore = createLocalTaskStore(profileDir);
      const result = await executeTool(
        "mesh.library_verify_ipfs_gateway",
        { documentId: "doc-1", gatewayUrl: "https://ipfs.io" },
        {
          trustStore: {} as never,
          peerDirectoryStore: {} as never,
          taskStore,
          agentIdentity: {} as never,
          ownerIdentity: { ownerId: "envoy:owner:test" },
          agentCredential: {} as never,
          verifyLibraryItemIpfsGateway: async (params) => ({
            documentId: params.documentId,
            contentHashMatches: true,
            gatewayUrl: "https://ipfs.io/ipfs/bafy",
            fetchedBytes: 12,
          }),
        },
      );
      expect(result.ok).toBe(true);
      expect((result.result as { fetchedBytes?: number })?.fetchedBytes).toBe(12);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("mesh.library_verify_ipfs_gateway requires configured hook", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-tool-ipfs-"));
    try {
      const taskStore = createLocalTaskStore(profileDir);
      const result = await executeTool(
        "mesh.library_verify_ipfs_gateway",
        { documentId: "doc-1" },
        {
          trustStore: {} as never,
          peerDirectoryStore: {} as never,
          taskStore,
          agentIdentity: {} as never,
          ownerIdentity: { ownerId: "envoy:owner:test" },
          agentCredential: {} as never,
        },
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/verifyLibraryItemIpfsGateway/);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });
});

describe("ToolDefinition interface", () => {
  it("can create tool with full definition", () => {
    const toolDef: ToolDefinition = {
      name: "custom.tool",
      description: "A custom tool",
      paramSchema: {
        type: "object",
        properties: {
          param1: { type: "string", description: "A parameter" },
        },
        required: ["param1"],
      },
      sensitivityCeiling: "trusted",
      requiresApproval: true,
      intent: "custom.intent",
      isMeshTool: true,
    };

    const registry = new ToolRegistry();
    registry.register(toolDef);
    const retrieved = registry.get("custom.tool");

    expect(retrieved).toBeDefined();
    expect(retrieved?.sensitivityCeiling).toBe("trusted");
    expect(retrieved?.requiresApproval).toBe(true);
    expect(retrieved?.intent).toBe("custom.intent");
    expect(retrieved?.isMeshTool).toBe(true);
    expect(retrieved?.paramSchema.properties).toHaveProperty("param1");
  });

  it("can create tool without intent (local tool)", () => {
    const toolDef: ToolDefinition = {
      name: "local.tool",
      description: "A local-only tool",
      paramSchema: { type: "object", properties: {} },
      sensitivityCeiling: "private",
      requiresApproval: false,
      intent: undefined,
      isMeshTool: false,
    };

    const registry = new ToolRegistry();
    registry.register(toolDef);
    const retrieved = registry.get("local.tool");

    expect(retrieved).toBeDefined();
    expect(retrieved?.intent).toBeUndefined();
    expect(retrieved?.isMeshTool).toBe(false);
  });
});
