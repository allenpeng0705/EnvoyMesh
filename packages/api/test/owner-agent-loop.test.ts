import { describe, expect, it, vi } from "vitest";
import {
  parseBondedServiceTask,
  pickOwnerAgentRoute,
  runOwnerAgentTurn,
  type OwnerAgentTurnDeps,
} from "../src/owner-agent-loop.js";

function baseDeps(overrides: Partial<OwnerAgentTurnDeps> = {}): OwnerAgentTurnDeps {
  return {
    message: "hello",
    runDocumentTurn: vi.fn().mockResolvedValue({
      answer: "Knowledge answer",
      intent: "knowledge",
      toolsUsed: [],
    }),
    executeTool: vi.fn().mockResolvedValue({
      ok: true,
      toolName: "mesh.intro.broadcast_search",
      correlationId: "c1",
      latencyMs: 1,
    }),
    matchRoutes: vi.fn().mockReturnValue([]),
    postureEnabled: {
      socialProxy: true,
      documentAcquisition: true,
      capabilityProvider: true,
      trustMode: true,
      autonomousKillSwitch: false,
    },
    ...overrides,
  };
}

describe("runOwnerAgentTurn", () => {
  it("delegates explicit document commands to document turn", async () => {
    const deps = baseDeps({
      message: "list my library files",
      runDocumentTurn: vi.fn().mockResolvedValue({
        answer: "Library list",
        intent: "list_library",
        toolsUsed: ["mesh.library_list"],
      }),
    });
    const result = await runOwnerAgentTurn(deps);
    expect(deps.runDocumentTurn).toHaveBeenCalled();
    expect(deps.matchRoutes).not.toHaveBeenCalled();
    expect(result.domain).toBe("document");
    expect(result.intent).toBe("list_library");
  });

  it("starts document acquisition job when hunt phrasing matches document route", async () => {
    const startDocumentAcquisitionJob = vi.fn().mockResolvedValue({
      jobId: "job-doc-1",
      correlationId: "corr-doc-1",
    });
    const deps = baseDeps({
      message: "find the quarterly report pdf on the mesh",
      matchRoutes: vi.fn().mockReturnValue([
        {
          routeId: "document.published-library",
          label: "Published library",
          domain: "document",
          score: 10,
          matchedCapabilityIds: [],
          matchedKeywords: ["document", "pdf"],
          steps: [{ phase: "discover", description: "Find peers", intents: ["discovery.request"] }],
        },
      ]),
      startDocumentAcquisitionJob,
    });

    const result = await runOwnerAgentTurn(deps);
    expect(startDocumentAcquisitionJob).toHaveBeenCalledWith(
      "find the quarterly report pdf on the mesh",
    );
    expect(result.domain).toBe("document");
    expect(result.jobId).toBe("job-doc-1");
    expect(result.toolsUsed).toContain("startDocumentAcquisitionJob");
  });

  it("runs social proxy pass for friend-making goals", async () => {
    const runSocialProxyPass = vi.fn().mockResolvedValue({ ok: true, correlationId: "sp-1" });
    const deps = baseDeps({
      message: "help me meet friends interested in hiking",
      matchRoutes: vi.fn().mockReturnValue([
        {
          routeId: "social.intro-bond",
          label: "Social intro",
          domain: "social",
          score: 15,
          matchedCapabilityIds: [],
          matchedKeywords: ["friend", "meet"],
          steps: [{ phase: "discover", description: "Broadcast search", intents: ["discovery.request"] }],
        },
      ]),
      runSocialProxyPass,
    });

    const result = await runOwnerAgentTurn(deps);
    expect(runSocialProxyPass).toHaveBeenCalled();
    expect(result.domain).toBe("social");
    expect(result.routeId).toBe("social.intro-bond");
    expect(result.answer).toContain("social proxy");
  });

  it("starts capability provider job for service routes", async () => {
    const startCapabilityProviderJob = vi.fn().mockResolvedValue({
      jobId: "job-cap-1",
      correlationId: "corr-cap-1",
    });
    const deps = baseDeps({
      message: "find someone who can help with rust programming",
      matchRoutes: vi.fn().mockReturnValue([
        {
          routeId: "service.task-negotiation",
          label: "Task service",
          domain: "service",
          score: 10,
          matchedCapabilityIds: [],
          matchedKeywords: ["service"],
          steps: [{ phase: "discover", description: "Find peer", intents: ["discovery.request"] }],
        },
      ]),
      startCapabilityProviderJob,
    });

    const result = await runOwnerAgentTurn(deps);
    expect(startCapabilityProviderJob).toHaveBeenCalled();
    expect(result.domain).toBe("service");
    expect(result.jobId).toBe("job-cap-1");
  });

  it("falls back to knowledge when no route matches", async () => {
    const deps = baseDeps({
      message: "what is envoymesh",
      matchRoutes: vi.fn().mockReturnValue([]),
    });
    const result = await runOwnerAgentTurn(deps);
    expect(deps.runDocumentTurn).toHaveBeenCalled();
    expect(result.domain).toBe("knowledge");
  });

  it("uses planner when no route matches and askPlanner is set", async () => {
    const askPlanner = vi
      .fn()
      .mockResolvedValue('{"action":"answer","text":"Planner reply","domain":"knowledge"}');
    const deps = baseDeps({
      message: "what is envoymesh",
      matchRoutes: vi.fn().mockReturnValue([]),
      askPlanner,
    });
    const result = await runOwnerAgentTurn(deps);
    expect(askPlanner).toHaveBeenCalled();
    expect(deps.runDocumentTurn).not.toHaveBeenCalled();
    expect(result.answer).toBe("Planner reply");
    expect(result.intent).toBe("planner_answer");
  });

  it("blocks jobs when autonomous kill switch is on", async () => {
    const deps = baseDeps({
      message: "help me make new friends",
      postureEnabled: {
        socialProxy: true,
        documentAcquisition: true,
        capabilityProvider: true,
        trustMode: true,
        autonomousKillSwitch: true,
      },
      matchRoutes: vi.fn().mockReturnValue([
        {
          routeId: "social.intro-bond",
          label: "Social intro",
          domain: "social",
          score: 15,
          matchedCapabilityIds: [],
          matchedKeywords: ["friend"],
          steps: [],
        },
      ]),
      runSocialProxyPass: vi.fn(),
    });
    const result = await runOwnerAgentTurn(deps);
    expect(deps.runSocialProxyPass).not.toHaveBeenCalled();
    expect(result.answer).toContain("kill switch");
  });

  it("prefers document route over social when document hunt phrasing matches", async () => {
    const startDocumentAcquisitionJob = vi.fn().mockResolvedValue({
      jobId: "job-doc-priority",
      correlationId: "corr-doc-priority",
    });
    const routes = [
      {
        routeId: "social.intro-bond",
        label: "Social intro",
        domain: "social" as const,
        score: 10,
        matchedCapabilityIds: [],
        matchedKeywords: ["connect"],
        steps: [],
      },
      {
        routeId: "document.published-library",
        label: "Published library",
        domain: "document" as const,
        score: 5,
        matchedCapabilityIds: [],
        matchedKeywords: ["document"],
        steps: [],
      },
    ];
    const picked = pickOwnerAgentRoute(
      "find the golden checklist document on the mesh",
      routes,
      {
        socialProxy: true,
        documentAcquisition: true,
        capabilityProvider: true,
        trustMode: true,
        autonomousKillSwitch: false,
      },
    );
    expect(picked?.routeId).toBe("document.published-library");

    const result = await runOwnerAgentTurn(
      baseDeps({
        message: "find the golden checklist document on the mesh",
        matchRoutes: vi.fn().mockReturnValue(routes),
        startDocumentAcquisitionJob,
      }),
    );
    expect(startDocumentAcquisitionJob).toHaveBeenCalled();
    expect(result.jobId).toBe("job-doc-priority");
    expect(result.domain).toBe("document");
  });
});

describe("parseBondedServiceTask", () => {
  it("parses ask X to Y phrasing", () => {
    expect(parseBondedServiceTask("ask Bob to review the contract")).toEqual({
      targetHint: "Bob",
      objective: "review the contract",
    });
  });

  it("parses propose task to phrasing", () => {
    expect(parseBondedServiceTask("propose task to Alice: deploy staging")).toEqual({
      targetHint: "Alice",
      objective: "deploy staging",
    });
  });
});

describe("runOwnerAgentTurn service task.propose", () => {
  it("sends mesh.task.propose when bonded contact is named", async () => {
    const executeTool = vi.fn().mockResolvedValue({
      ok: true,
      toolName: "mesh.task.propose",
      correlationId: "corr-task-1",
      latencyMs: 1,
      result: { taskId: "task-99", summary: "proposed" },
    });
    const deps = baseDeps({
      message: "ask Bob to help with rust refactoring",
      matchRoutes: vi.fn().mockReturnValue([]),
      getBonds: vi.fn().mockResolvedValue([
        { peerOwnerId: "envoy:owner:bob", displayName: "Bob", level: "direct" },
      ]),
      executeTool,
    });

    const result = await runOwnerAgentTurn(deps);
    expect(executeTool).toHaveBeenCalledWith("mesh.task.propose", {
      targetOwnerId: "envoy:owner:bob",
      objective: "help with rust refactoring",
    });
    expect(result.intent).toBe("task.propose");
    expect(result.domain).toBe("service");
    expect(result.toolsUsed).toContain("mesh.task.propose");
    expect(result.answer).toContain("task.propose");
  });
});
