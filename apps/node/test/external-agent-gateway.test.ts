import { describe, expect, it, beforeEach } from "vitest";
import {
  ExternalAgentGateway,
  createExternalAgentSession,
  createExternalAgentContext,
  buildListExternalSessionsTool,
  buildRevokeExternalAgentTool,
  buildListExternalAgentActionsTool,
  buildGetExternalAgentTool,
  DEFAULT_AGENT_CAPABILITIES,
  type ExternalAgentCapability,
} from "../src/external-agent-gateway.js";

describe("createExternalAgentSession", () => {
  it("creates a session with default capabilities", () => {
    const session = createExternalAgentSession(
      "agent-123",
      "peer-abc",
      "OpenClaw",
      "owner-456",
    );

    expect(session.agentId).toBe("agent-123");
    expect(session.agentPeerId).toBe("peer-abc");
    expect(session.agentName).toBe("OpenClaw");
    expect(session.authorizedBy).toBe("owner-456");
    expect(session.capabilities).toEqual(DEFAULT_AGENT_CAPABILITIES);
    expect(session.isRevoked).toBe(false);
  });

  it("creates session with custom capabilities", () => {
    const capabilities: ExternalAgentCapability[] = ["find_knowledge", "send_message"];
    const session = createExternalAgentSession(
      "agent-123",
      "peer-abc",
      "Custom Agent",
      "owner-456",
      capabilities,
    );

    expect(session.capabilities).toEqual(capabilities);
  });
});

describe("ExternalAgentGateway", () => {
  let gateway: ExternalAgentGateway;

  beforeEach(() => {
    gateway = new ExternalAgentGateway(100);
  });

  describe("registerAgent", () => {
    it("registers an agent", () => {
      const session = createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1");
      gateway.registerAgent(session);

      const retrieved = gateway.getAgent("agent-1");
      expect(retrieved).toBeDefined();
      expect(retrieved?.agentName).toBe("Test");
    });
  });

  describe("revokeAgent", () => {
    it("revokes an agent", () => {
      const session = createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1");
      gateway.registerAgent(session);

      const revoked = gateway.revokeAgent("agent-1");
      expect(revoked).toBe(true);
      expect(gateway.getAgent("agent-1")?.isRevoked).toBe(true);
      expect(gateway.getAgent("agent-1")?.revokedAt).toBeDefined();
    });

    it("returns false for non-existent agent", () => {
      const revoked = gateway.revokeAgent("non-existent");
      expect(revoked).toBe(false);
    });
  });

  describe("hasCapability", () => {
    it("returns true for agent with capability", () => {
      const session = createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1");
      gateway.registerAgent(session);

      expect(gateway.hasCapability("agent-1", "find_knowledge")).toBe(true);
    });

    it("returns false for agent without capability", () => {
      const session = createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1", ["find_knowledge"]);
      gateway.registerAgent(session);

      expect(gateway.hasCapability("agent-1", "send_message")).toBe(false);
    });

    it("returns false for revoked agent", () => {
      const session = createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1");
      gateway.registerAgent(session);
      gateway.revokeAgent("agent-1");

      expect(gateway.hasCapability("agent-1", "find_knowledge")).toBe(false);
    });

    it("returns false for non-existent agent", () => {
      expect(gateway.hasCapability("non-existent", "find_knowledge")).toBe(false);
    });
  });

  describe("isAuthorized", () => {
    it("returns true for active agent", () => {
      const session = createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1");
      gateway.registerAgent(session);

      expect(gateway.isAuthorized("agent-1")).toBe(true);
    });

    it("returns false for revoked agent", () => {
      const session = createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1");
      gateway.registerAgent(session);
      gateway.revokeAgent("agent-1");

      expect(gateway.isAuthorized("agent-1")).toBe(false);
    });

    it("returns false for non-existent agent", () => {
      expect(gateway.isAuthorized("non-existent")).toBe(false);
    });
  });

  describe("touchAgent", () => {
    it("updates last activity time", async () => {
      const session = createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1");
      gateway.registerAgent(session);
      const before = session.lastActivityAt;

      // Wait a millisecond to ensure different timestamp
      await new Promise((r) => setTimeout(r, 1));
      gateway.touchAgent("agent-1");
      expect(gateway.getAgent("agent-1")?.lastActivityAt).not.toBe(before);
    });
  });

  describe("logAction", () => {
    it("logs an action", () => {
      const action = gateway.logAction({
        agentId: "agent-1",
        toolName: "find_knowledge",
        params: { query: "test" },
        outcome: "success",
        requiresApproval: false,
        durationMs: 100,
      });

      expect(action.id).toBeDefined();
      expect(action.timestamp).toBeDefined();
      expect(action.outcome).toBe("success");
    });

    it("trims log when exceeding max entries", () => {
      const smallGateway = new ExternalAgentGateway(5);
      for (let i = 0; i < 10; i++) {
        smallGateway.logAction({
          agentId: `agent-${i}`,
          toolName: "test",
          params: {},
          outcome: "success",
          requiresApproval: false,
          durationMs: 10,
        });
      }

      const actions = smallGateway.getAllActions(100);
      expect(actions.length).toBe(5);
    });
  });

  describe("getAgentActions", () => {
    it("returns actions for specific agent", () => {
      gateway.logAction({
        agentId: "agent-1",
        toolName: "find_knowledge",
        params: {},
        outcome: "success",
        requiresApproval: false,
        durationMs: 10,
      });
      gateway.logAction({
        agentId: "agent-2",
        toolName: "send_message",
        params: {},
        outcome: "success",
        requiresApproval: false,
        durationMs: 10,
      });

      const actions = gateway.getAgentActions("agent-1");
      expect(actions).toHaveLength(1);
      expect(actions[0].agentId).toBe("agent-1");
    });
  });

  describe("listAgents", () => {
    it("lists active agents", () => {
      gateway.registerAgent(createExternalAgentSession("agent-1", "peer-1", "Agent 1", "owner-1"));
      gateway.registerAgent(createExternalAgentSession("agent-2", "peer-2", "Agent 2", "owner-1"));
      gateway.registerAgent(createExternalAgentSession("agent-3", "peer-3", "Agent 3", "owner-1"));

      const agents = gateway.listAgents();
      expect(agents).toHaveLength(3);
    });

    it("excludes revoked agents by default", () => {
      gateway.registerAgent(createExternalAgentSession("agent-1", "peer-1", "Agent 1", "owner-1"));
      gateway.registerAgent(createExternalAgentSession("agent-2", "peer-2", "Agent 2", "owner-1"));
      gateway.revokeAgent("agent-1");

      const agents = gateway.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].agentId).toBe("agent-2");
    });

    it("includes revoked when requested", () => {
      gateway.registerAgent(createExternalAgentSession("agent-1", "peer-1", "Agent 1", "owner-1"));
      gateway.registerAgent(createExternalAgentSession("agent-2", "peer-2", "Agent 2", "owner-1"));
      gateway.revokeAgent("agent-1");

      const agents = gateway.listAgents(true);
      expect(agents).toHaveLength(2);
    });
  });
});

describe("buildListExternalSessionsTool", () => {
  it("lists all agents", async () => {
    const gateway = new ExternalAgentGateway();
    gateway.registerAgent(createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1"));
    const tool = buildListExternalSessionsTool(gateway);

    const result = await tool({});
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.agents[0].agentId).toBe("agent-1");
  });

  it("includes revoked when requested", async () => {
    const gateway = new ExternalAgentGateway();
    gateway.registerAgent(createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1"));
    gateway.revokeAgent("agent-1");
    const tool = buildListExternalSessionsTool(gateway);

    const result = await tool({ includeRevoked: true });
    expect(result.count).toBe(1);

    const resultWithout = await tool({ includeRevoked: false });
    expect(resultWithout.count).toBe(0);
  });
});

describe("buildRevokeExternalAgentTool", () => {
  it("revokes an agent", async () => {
    const gateway = new ExternalAgentGateway();
    gateway.registerAgent(createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1"));
    const tool = buildRevokeExternalAgentTool(gateway);

    const result = await tool({ agentId: "agent-1" });
    expect(result.ok).toBe(true);
    expect(gateway.isAuthorized("agent-1")).toBe(false);
  });

  it("returns error for missing agentId", async () => {
    const gateway = new ExternalAgentGateway();
    const tool = buildRevokeExternalAgentTool(gateway);

    const result = await tool({});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("agentId");
  });

  it("returns error for non-existent agent", async () => {
    const gateway = new ExternalAgentGateway();
    const tool = buildRevokeExternalAgentTool(gateway);

    const result = await tool({ agentId: "non-existent" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("buildListExternalAgentActionsTool", () => {
  it("lists all actions", async () => {
    const gateway = new ExternalAgentGateway();
    gateway.logAction({
      agentId: "agent-1",
      toolName: "test",
      params: {},
      outcome: "success",
      requiresApproval: false,
      durationMs: 10,
    });
    const tool = buildListExternalAgentActionsTool(gateway);

    const result = await tool({});
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
  });

  it("filters by agentId", async () => {
    const gateway = new ExternalAgentGateway();
    gateway.logAction({
      agentId: "agent-1",
      toolName: "test",
      params: {},
      outcome: "success",
      requiresApproval: false,
      durationMs: 10,
    });
    gateway.logAction({
      agentId: "agent-2",
      toolName: "test",
      params: {},
      outcome: "success",
      requiresApproval: false,
      durationMs: 10,
    });
    const tool = buildListExternalAgentActionsTool(gateway);

    const result = await tool({ agentId: "agent-1" });
    expect(result.count).toBe(1);
    expect(result.actions[0].agentId).toBe("agent-1");
  });
});

describe("buildGetExternalAgentTool", () => {
  it("returns agent details", async () => {
    const gateway = new ExternalAgentGateway();
    gateway.registerAgent(createExternalAgentSession("agent-1", "peer-1", "Test", "owner-1"));
    const tool = buildGetExternalAgentTool(gateway);

    const result = await tool({ agentId: "agent-1" });
    expect(result.ok).toBe(true);
    expect(result.agent?.agentId).toBe("agent-1");
  });

  it("returns error for missing agentId", async () => {
    const gateway = new ExternalAgentGateway();
    const tool = buildGetExternalAgentTool(gateway);

    const result = await tool({});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("agentId");
  });

  it("returns error for non-existent agent", async () => {
    const gateway = new ExternalAgentGateway();
    const tool = buildGetExternalAgentTool(gateway);

    const result = await tool({ agentId: "non-existent" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("createExternalAgentContext", () => {
  it("creates context", () => {
    const ctx = createExternalAgentContext("agent-1", "peer-1", ["find_knowledge"]);
    expect(ctx.agentId).toBe("agent-1");
    expect(ctx.agentPeerId).toBe("peer-1");
    expect(ctx.capabilities).toContain("find_knowledge");
  });
});
