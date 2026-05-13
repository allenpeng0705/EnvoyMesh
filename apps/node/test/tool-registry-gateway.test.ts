import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tool-registry.js";

describe("tool-registry gateway tools", () => {
  const gatewayToolNames = [
    "mesh.list-external-sessions",
    "mesh.revoke-external-agent",
    "mesh.list-external-agent-actions",
    "mesh.get-external-agent",
  ];

  it("registers all 4 gateway management tools", () => {
    const registry = new ToolRegistry();
    for (const name of gatewayToolNames) {
      expect(registry.has(name)).toBe(true);
    }
  });

  it("gateway tools are local (not mesh)", () => {
    const registry = new ToolRegistry();
    for (const name of gatewayToolNames) {
      const tool = registry.get(name);
      expect(tool?.isMeshTool).toBe(false);
    }
  });

  it("mesh.list-external-sessions has correct metadata", () => {
    const registry = new ToolRegistry();
    const tool = registry.get("mesh.list-external-sessions");
    expect(tool).toBeDefined();
    expect(tool?.requiresApproval).toBe(false);
    expect(tool?.sensitivityCeiling).toBe("trusted");
    expect(tool?.paramSchema).toHaveProperty("properties");
    const props = tool?.paramSchema as { properties: Record<string, unknown> };
    expect(Object.keys(props.properties)).toContain("includeRevoked");
  });

  it("mesh.revoke-external-agent requires approval", () => {
    const registry = new ToolRegistry();
    const tool = registry.get("mesh.revoke-external-agent");
    expect(tool).toBeDefined();
    expect(tool?.requiresApproval).toBe(true);
    expect(tool?.sensitivityCeiling).toBe("trusted");
    const props = tool?.paramSchema as { required: string[] };
    expect(props.required).toContain("agentId");
  });

  it("mesh.list-external-agent-actions has optional agentId filter", () => {
    const registry = new ToolRegistry();
    const tool = registry.get("mesh.list-external-agent-actions");
    expect(tool).toBeDefined();
    expect(tool?.requiresApproval).toBe(false);
    const props = tool?.paramSchema as { properties: Record<string, unknown> };
    expect(Object.keys(props.properties)).toEqual(
      expect.arrayContaining(["agentId", "limit"]),
    );
  });

  it("mesh.get-external-agent requires agentId param", () => {
    const registry = new ToolRegistry();
    const tool = registry.get("mesh.get-external-agent");
    expect(tool).toBeDefined();
    expect(tool?.requiresApproval).toBe(false);
    const props = tool?.paramSchema as { required: string[] };
    expect(props.required).toContain("agentId");
  });

  it("listing tools includes gateway tools in correct order", () => {
    const registry = new ToolRegistry();
    const names = registry.listTools().map((t) => t.name);
    for (const gwName of gatewayToolNames) {
      expect(names).toContain(gwName);
    }
  });
});
