import { describe, expect, it, vi } from "vitest";
import {
  buildOwnerAgentPlannerPrompt,
  cleanPlannerText,
  parseOwnerAgentPlannerResponse,
  parseStructuredBlocks,
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
      format: undefined,
      blocks: undefined,
    });
  });

  it("parses answer with format=plain", () => {
    const parsed = parseOwnerAgentPlannerResponse(
      '{"action":"answer","text":"Hi!","format":"plain"}',
    );
    expect(parsed).toMatchObject({ action: "answer", text: "Hi!", format: "plain" });
  });

  it("parses answer with format=markdown", () => {
    const parsed = parseOwnerAgentPlannerResponse(
      '{"action":"answer","text":"# Hello","format":"markdown"}',
    );
    expect(parsed).toMatchObject({ action: "answer", format: "markdown" });
  });

  it("parses answer with format=structured and valid blocks", () => {
    const parsed = parseOwnerAgentPlannerResponse(
      JSON.stringify({
        action: "answer",
        text: "Here are your files:",
        format: "structured",
        blocks: [
          { type: "list", items: ["a.pdf", "b.md"] },
          { type: "status", tone: "info", text: "2 items" },
        ],
      }),
    );
    expect(parsed?.format).toBe("structured");
    expect(parsed?.blocks).toHaveLength(2);
  });

  it("falls back to markdown when structured has no valid blocks", () => {
    const parsed = parseOwnerAgentPlannerResponse(
      '{"action":"answer","text":"x","format":"structured","blocks":[]}',
    );
    expect(parsed?.format).toBe("markdown");
    expect(parsed?.blocks).toBeUndefined();
  });

  it("ignores unknown block types", () => {
    const parsed = parseStructuredBlocks([{ type: "bogus", text: "x" }]);
    expect(parsed).toBeUndefined();
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

describe("cleanPlannerText", () => {
  it("converts bullet markers to hyphen+space", () => {
    expect(cleanPlannerText("• first\n* second\n+ third")).toBe("- first\n- second\n- third");
  });

  it("ensures numbered lists have a trailing space", () => {
    expect(cleanPlannerText("1.first\n2.second")).toBe("1. first\n2. second");
  });

  it("inserts a blank line before a list", () => {
    expect(cleanPlannerText("Here is the list:\n- one\n- two")).toBe(
      "Here is the list:\n\n- one\n- two",
    );
  });

  it("unescapes literal \\n and \\t", () => {
    expect(cleanPlannerText("line1\\nline2\\tindented")).toBe("line1\nline2\tindented");
  });

  it("collapses 3+ blank lines to one", () => {
    expect(cleanPlannerText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("trims trailing whitespace per line", () => {
    expect(cleanPlannerText("hello   \nworld")).toBe("hello\nworld");
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
