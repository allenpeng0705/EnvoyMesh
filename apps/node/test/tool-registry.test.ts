import { describe, expect, it } from "vitest";
import {
  ToolRegistry,
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
      // 10 default tools + 2 additional = 12
      expect(tools).toHaveLength(12);
      expect(tools.map((t) => t.name).sort()).toEqual(
        [
          "bond.send_hello", "chat.send", "discovery.search", "knowledge.query",
          "mesh.get-external-agent", "mesh.list-external-agent-actions",
          "mesh.list-external-sessions", "mesh.revoke-external-agent",
          "share.send", "tool.1", "tool.2", "vault.search",
        ].sort(),
      );
    });

    it("default tools are pre-registered", () => {
      const registry = new ToolRegistry();
      const tools = registry.listTools();
      // Default tools: 6 core + 4 gateway management = 10
      expect(tools.length).toBe(10);
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
