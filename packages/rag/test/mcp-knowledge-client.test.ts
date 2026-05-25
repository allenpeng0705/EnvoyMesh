import { describe, expect, it } from "vitest";
import { formatExternalKnowledgeSection, searchExternalMcpKnowledge } from "../src/mcp-knowledge-client.js";

describe("mcp-knowledge-client", () => {
  it("returns empty when external provider is disabled", async () => {
    const hits = await searchExternalMcpKnowledge({
      query: "test",
      knowledgeBase: { externalProvider: "none" },
    });
    expect(hits).toEqual([]);
  });

  it("parses MCP tools/call JSON content", async () => {
    const fetchImplementation = async () =>
      ({
        ok: true,
        json: async () => ({
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify([
                  { title: "Card A", text: "EnvoyMesh deployment notes" },
                ]),
              },
            ],
          },
        }),
      }) as Response;

    const hits = await searchExternalMcpKnowledge({
      query: "deployment",
      knowledgeBase: {
        externalProvider: "mcp",
        mcpServerUrl: "http://127.0.0.1:9999/mcp",
      },
      fetchImplementation,
    });

    expect(hits[0]?.title).toBe("Card A");
    expect(formatExternalKnowledgeSection(hits)).toContain("External knowledge base");
  });
});
