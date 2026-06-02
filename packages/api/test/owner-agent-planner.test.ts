import { describe, expect, it, vi } from "vitest";
import {
  buildOwnerAgentPlannerPrompt,
  parseOwnerAgentPlannerResponse,
  runOwnerAgentPlannerLoop,
} from "../src/owner-agent-planner.js";

describe("parseOwnerAgentPlannerResponse", () => {
  it("parses answer action", () => {
    const parsed = parseOwnerAgentPlannerResponse(
      '{"action":"answer","text":"Here is what I found.","domain":"document"}',
    );
    expect(parsed).toEqual({
      action: "answer",
      text: "Here is what I found.",
      domain: "document",
    });
  });

  it("parses tool action with params", () => {
    const parsed = parseOwnerAgentPlannerResponse(
      '```json\n{"action":"tool","toolName":"vault.search","params":{"query":"report"}}\n```',
    );
    expect(parsed).toEqual({
      action: "tool",
      toolName: "vault.search",
      params: { query: "report" },
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseOwnerAgentPlannerResponse("not json")).toBeNull();
  });
});

describe("buildOwnerAgentPlannerPrompt", () => {
  it("includes routes, tools, and owner message", () => {
    const prompt = buildOwnerAgentPlannerPrompt({
      message: "find hiking friends",
      tools: [
        {
          name: "mesh.intro.broadcast_search",
          kind: "mesh",
          domain: "social",
          description: "Broadcast intro search",
        },
      ],
      routes: [
        {
          routeId: "social.intro",
          label: "Intro",
          domain: "social",
          score: 6,
          matchedCapabilityIds: [],
          matchedKeywords: ["friends"],
          steps: [{ phase: "discover", description: "Find peers", intents: [] }],
        },
      ],
      history: [{ round: 1, summary: "vault.search ok: 0 hits" }],
    });
    expect(prompt).toContain("find hiking friends");
    expect(prompt).toContain("mesh.intro.broadcast_search");
    expect(prompt).toContain("social.intro");
    expect(prompt).toContain("Round 1:");
  });
});

describe("runOwnerAgentPlannerLoop", () => {
  it("returns planner answer after one tool round", async () => {
    const askPlanner = vi
      .fn()
      .mockResolvedValueOnce(
        '{"action":"tool","toolName":"vault.search","params":{"query":"quarterly"}}',
      )
      .mockResolvedValueOnce(
        '{"action":"answer","text":"No quarterly report in vault.","domain":"document"}',
      );
    const executeTool = vi.fn().mockResolvedValue({
      ok: true,
      toolName: "vault.search",
      correlationId: "c1",
      latencyMs: 1,
      result: [],
    });

    const result = await runOwnerAgentPlannerLoop({
      message: "find quarterly report",
      postureEnabled: {
        socialProxy: true,
        documentAcquisition: true,
        capabilityProvider: true,
        trustMode: true,
        autonomousKillSwitch: false,
      },
      matchedRoutes: [],
      askPlanner,
      executeTool,
    });

    expect(result?.answer).toBe("No quarterly report in vault.");
    expect(result?.domain).toBe("document");
    expect(result?.toolsUsed).toEqual(["vault.search"]);
    expect(executeTool).toHaveBeenCalledWith("vault.search", { query: "quarterly" });
  });

  it("returns null when askPlanner is unavailable", async () => {
    const result = await runOwnerAgentPlannerLoop({
      message: "hello",
      postureEnabled: {
        socialProxy: false,
        documentAcquisition: false,
        capabilityProvider: false,
        trustMode: false,
      },
      matchedRoutes: [],
      askPlanner: vi.fn().mockResolvedValue(null),
      executeTool: vi.fn(),
    });
    expect(result).toBeNull();
  });

  it("blocks outbound answer text that fails egress scan", async () => {
    const result = await runOwnerAgentPlannerLoop({
      message: "summarize",
      postureEnabled: {
        socialProxy: false,
        documentAcquisition: false,
        capabilityProvider: false,
        trustMode: false,
      },
      matchedRoutes: [],
      askPlanner: vi.fn().mockResolvedValue(
        '{"action":"answer","text":"secret leak","domain":"knowledge"}',
      ),
      executeTool: vi.fn(),
      scanOutbound: () => true,
    });
    expect(result?.intent).toBe("planner_blocked");
    expect(result?.answer).toContain("outbound safety");
  });

  it("calls auditPlannerRound after each tool round", async () => {
    const auditPlannerRound = vi.fn().mockResolvedValue(undefined);
    const askPlanner = vi
      .fn()
      .mockResolvedValueOnce('{"action":"tool","toolName":"vault.search","params":{"query":"x"}}')
      .mockResolvedValueOnce('{"action":"answer","text":"done","domain":"knowledge"}');
    const executeTool = vi.fn().mockResolvedValue({
      ok: true,
      toolName: "vault.search",
      correlationId: "c1",
      latencyMs: 1,
      result: [],
    });

    await runOwnerAgentPlannerLoop({
      message: "search vault",
      postureEnabled: {
        socialProxy: false,
        documentAcquisition: false,
        capabilityProvider: false,
        trustMode: false,
        autonomousKillSwitch: false,
      },
      matchedRoutes: [],
      askPlanner,
      executeTool,
      auditPlannerRound,
    });

    expect(auditPlannerRound).toHaveBeenCalledWith(
      expect.objectContaining({
        round: 1,
        toolName: "vault.search",
        ok: true,
      }),
    );
  });
});
