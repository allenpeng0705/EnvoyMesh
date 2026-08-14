import { describe, expect, it } from "vitest";
import {
  formatExternalKnowledgeSection,
  searchExternalMcpKnowledge,
  formatMcpResultsAsNote,
  formatMcpSnippetAsNote,
  mcpRemoteBrowsePath,
  writeExternalMcpKnowledge,
  validateMcpServerUrl,
  type ExternalKnowledgeSnippet,
} from "../src/mcp-knowledge-client.js";

describe("mcp-knowledge-client", () => {
  it("returns empty when external provider is disabled", async () => {
    const hits = await searchExternalMcpKnowledge({
      query: "test",
      knowledgeBase: { externalProvider: "none" },
    });
    expect(hits).toEqual({ snippets: [] });
  });

  it("soft-fails when mcp url is missing", async () => {
    const hits = await searchExternalMcpKnowledge({
      query: "test",
      knowledgeBase: { externalProvider: "mcp" },
    });
    expect(hits.snippets).toEqual([]);
    expect(hits.error).toBe("mcp_url_missing");
  });

  it("rejects non-http mcp urls", async () => {
    expect(validateMcpServerUrl("file:///tmp/x")).toBe("mcp_url_protocol");
    const hits = await searchExternalMcpKnowledge({
      query: "test",
      knowledgeBase: {
        externalProvider: "mcp",
        mcpServerUrl: "ftp://example.com/mcp",
      },
    });
    expect(hits.error).toBe("mcp_url_protocol");
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
                text: JSON.stringify([{ title: "Card A", text: "EnvoyMesh deployment notes" }]),
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

    expect(hits.error).toBeUndefined();
    expect(hits.snippets[0]?.title).toBe("Card A");
    expect(formatExternalKnowledgeSection(hits.snippets)).toContain("External knowledge base");
  });

  it("soft-fails on http errors", async () => {
    const fetchImplementation = async () => ({ ok: false, status: 503 }) as Response;
    const hits = await searchExternalMcpKnowledge({
      query: "x",
      knowledgeBase: {
        externalProvider: "mcp",
        mcpServerUrl: "http://127.0.0.1:9999/mcp",
      },
      fetchImplementation,
    });
    expect(hits.snippets).toEqual([]);
    expect(hits.error).toBe("mcp_http_503");
  });

  it("soft-fails on timeout/abort", async () => {
    const fetchImplementation = async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    };
    const hits = await searchExternalMcpKnowledge({
      query: "x",
      knowledgeBase: {
        externalProvider: "mcp",
        mcpServerUrl: "http://127.0.0.1:9999/mcp",
        mcpTimeoutMs: 1000,
      },
      fetchImplementation: fetchImplementation as typeof fetch,
      timeoutMs: 1000,
    });
    expect(hits.snippets).toEqual([]);
    expect(hits.error).toMatch(/^mcp_timeout_/);
  });
});

describe("formatMcpResultsAsNote", () => {
  const snippets: ExternalKnowledgeSnippet[] = [
    { title: "Card A", source: "memex", text: "Deployment notes for EnvoyMesh" },
    { title: "Card B", source: "memex", text: "Networking configuration guide" },
  ];

  const attribution = {
    server: "http://127.0.0.1:9999/mcp",
    tool: "memex_search",
    query: "deployment",
    queriedAt: "2024-06-15T10:30:00Z",
  };

  it("produces valid markdown with YAML frontmatter", () => {
    const result = formatMcpResultsAsNote(snippets, { attribution });

    expect(result.content).toContain("---");
    expect(result.content).toContain("source: mcp");
    expect(result.content).toContain('mcp-server: "http://127.0.0.1:9999/mcp"');
    expect(result.content).toContain('mcp-tool: "memex_search"');
    expect(result.content).toContain('mcp-query: "deployment"');
    expect(result.content).toContain('mcp-queried-at: "2024-06-15T10:30:00Z"');
    expect(result.content).toContain("tags: [mcp, knowledge]");
    expect(result.content).toContain("---");
    expect(result.content).toContain("## Results");
    expect(result.content).toContain("### 1. Card A");
    expect(result.content).toContain("Deployment notes for EnvoyMesh");
    expect(result.content).toContain("### 2. Card B");
    expect(result.content).toContain("Networking configuration guide");
    expect(result.subfolder).toBe("mcp");
  });

  it("embeds notion-url / page id / edited-at when present", () => {
    const rich: ExternalKnowledgeSnippet[] = [
      {
        title: "Page",
        source: "memex",
        text: "Body",
        url: "https://notion.so/abc",
        externalId: "page-123",
        editedAt: "2026-08-01T12:00:00.000Z",
      },
    ];
    const { content } = formatMcpResultsAsNote(rich, { attribution });
    expect(content).toContain('notion-url: "https://notion.so/abc"');
    expect(content).toContain('mcp-page-id: "page-123"');
    expect(content).toContain('mcp-edited-at: "2026-08-01T12:00:00.000Z"');
    expect(content).toContain("[Open source](https://notion.so/abc)");
  });

  it("defaults sensitivity to private (published: false)", () => {
    const { content } = formatMcpResultsAsNote(snippets, { attribution });
    expect(content).toContain("published: false");
  });

  it("uses published: true for public sensitivity", () => {
    const { content } = formatMcpResultsAsNote(snippets, {
      attribution,
      sensitivity: "public",
    });
    expect(content).toContain("published: true");
  });

  it("generates a safe filename from the query", () => {
    const { filename } = formatMcpResultsAsNote(snippets, { attribution });
    expect(filename).toBe("mcp-deployment.md");
    expect(filename).toMatch(/\.md$/);
  });

  it("uses custom title when provided", () => {
    const { filename, content } = formatMcpResultsAsNote(snippets, {
      attribution,
      title: "Custom Report Title",
    });
    expect(filename).toBe("custom-report-title.md");
    expect(content).toContain("# Custom Report Title");
  });

  it("sanitizes special characters from title", () => {
    const { filename } = formatMcpResultsAsNote(snippets, {
      attribution,
      title: "Test!@#$%^&*() Title",
    });
    expect(filename).toBe("test-title.md");
  });

  it("truncates long queries in filename", () => {
    const { filename } = formatMcpResultsAsNote(snippets, {
      attribution: { ...attribution, query: "a".repeat(100) },
    });
    // Max 60 chars + ".md"
    expect(filename.length).toBeLessThanOrEqual(64);
  });

  it("includes source attribution in body", () => {
    const { content } = formatMcpResultsAsNote(snippets, { attribution });
    expect(content).toContain("http://127.0.0.1:9999/mcp");
    expect(content).toContain("memex_search");
  });

  it("handles empty snippets", () => {
    const { content, filename } = formatMcpResultsAsNote([], { attribution });
    expect(filename).toBe("mcp-deployment.md");
    expect(content).toContain("# MCP deployment");
    expect(content).not.toContain("### 1.");
  });

  it("escapes double quotes in frontmatter values", () => {
    const { content } = formatMcpResultsAsNote(snippets, {
      attribution: { ...attribution, server: 'http://test"server.com' },
    });
    // Should have escaped quote
    expect(content).toContain('http://test\\"server.com');
    // Should not have unescaped quote inside frontmatter
    const fmMatch = content.match(/---\n([\s\S]*?)\n---/);
    const frontmatter = fmMatch?.[1] ?? "";
    // The server value should not contain an unescaped " breaking the YAML
    expect(frontmatter).toContain('\\"');
  });

  it("builds mcp-remote browse paths and formats a single snippet note", () => {
    expect(mcpRemoteBrowsePath("abc123", "Hello World")).toBe("mcp-remote/abc123-hello-world.md");
    const { filename, content } = formatMcpSnippetAsNote(snippets[0]!, { attribution });
    expect(filename.endsWith(".md")).toBe(true);
    expect(content).toContain(snippets[0]!.title);
  });

  it("soft-fails MCP write when url missing", async () => {
    const result = await writeExternalMcpKnowledge({
      knowledgeBase: { externalProvider: "mcp" },
      title: "T",
      content: "Body",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("mcp_url_missing");
  });
});
