import type { AiKnowledgeBaseSettings } from "@envoymesh/api";
import { resolveAiKnowledgeBaseSettings } from "@envoymesh/api";

export interface ExternalKnowledgeSnippet {
  title: string;
  source: string;
  text: string;
}

export interface SearchExternalKnowledgeInput {
  query: string;
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  limit?: number;
  fetchImplementation?: typeof fetch;
}

/**
 * Query an external MCP knowledge server via JSON-RPC `tools/call`.
 * Expects an MCP-compatible HTTP endpoint (Streamable HTTP or simple POST bridge).
 */
export async function searchExternalMcpKnowledge(
  input: SearchExternalKnowledgeInput,
): Promise<ExternalKnowledgeSnippet[]> {
  const kb = resolveAiKnowledgeBaseSettings(input.knowledgeBase);
  if (kb.externalProvider !== "mcp") {
    return [];
  }
  const url = kb.mcpServerUrl?.trim();
  if (!url) {
    return [];
  }

  const toolName = kb.mcpSearchTool?.trim() || "memex_search";
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const limit = input.limit ?? kb.vaultSnippetLimit;

  const response = await fetchImplementation(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(kb.mcpApiKey ? { authorization: `Bearer ${kb.mcpApiKey}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `rag-${Date.now()}`,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: {
          query: input.query,
          limit,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP knowledge search failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    result?: { content?: Array<{ type?: string; text?: string }> };
    error?: { message?: string };
  };
  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  const textBlocks =
    payload.result?.content
      ?.map((block) => block.text?.trim())
      .filter((text): text is string => Boolean(text)) ?? [];

  if (textBlocks.length === 0) {
    return [];
  }

  return parseMcpKnowledgeText(textBlocks.join("\n"), limit).map((entry, index) => ({
    title: entry.title,
    source: kb.externalMcpServer ?? toolName,
    text: entry.text,
    ...(index >= 0 ? {} : {}),
  }));
}

function parseMcpKnowledgeText(raw: string, limit: number): Array<{ title: string; text: string }> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.slice(0, limit).map((item, index) => normalizeSnippet(item, index));
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.results)) {
        return obj.results.slice(0, limit).map((item, index) => normalizeSnippet(item, index));
      }
      if (Array.isArray(obj.items)) {
        return obj.items.slice(0, limit).map((item, index) => normalizeSnippet(item, index));
      }
    }
  } catch {
    // fall through to plain text
  }

  return [{ title: "MCP result", text: raw.slice(0, 2000) }];
}

function normalizeSnippet(item: unknown, index: number): { title: string; text: string } {
  if (typeof item === "string") {
    return { title: `Result ${index + 1}`, text: item };
  }
  if (item && typeof item === "object") {
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? row.name ?? row.id ?? `Result ${index + 1}`);
    const text = String(row.text ?? row.content ?? row.summary ?? row.body ?? JSON.stringify(row));
    return { title, text: text.slice(0, 2000) };
  }
  return { title: `Result ${index + 1}`, text: String(item) };
}

export function formatExternalKnowledgeSection(snippets: ExternalKnowledgeSnippet[]): string {
  if (snippets.length === 0) return "";
  const lines = snippets.map((s) => `- ${s.title} (${s.source}): "${s.text.replace(/"/g, "'")}"`);
  return `## External knowledge base\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Phase 44E — MCP write-back: save results as a vault note
// ---------------------------------------------------------------------------

/**
 * Metadata about the MCP query that produced the results.
 */
export interface McpQueryAttribution {
  /** The MCP server URL (or display name). */
  server: string;
  /** The tool name used for the query. */
  tool: string;
  /** The search query string. */
  query: string;
  /** ISO 8601 timestamp when the query was executed. */
  queriedAt: string;
}

/**
 * Options for formatting MCP results as a vault note.
 */
export interface McpWriteBackOptions {
  /** Attribution metadata to embed in frontmatter. */
  attribution: McpQueryAttribution;
  /** Sensitivity level for the created note (default: "friends"). */
  sensitivity?: "public" | "friends" | "private";
  /** Optional subfolder within `notes/` (e.g. "mcp"). */
  subfolder?: string;
  /** Optional note title override (used in filename). */
  title?: string;
}

/**
 * Format MCP search results as a Markdown note with YAML frontmatter attribution.
 *
 * The generated note has:
 * - Frontmatter with `source: "mcp"`, `mcp-server`, `mcp-tool`, `mcp-query`,
 *   `mcp-queried-at`, `published`, and `tags`
 * - Body with a results section listing each snippet
 *
 * Returns `{ content, filename }` ready to pass to `createNote()`.
 */
export function formatMcpResultsAsNote(
  snippets: ExternalKnowledgeSnippet[],
  options: McpWriteBackOptions,
): { content: string; filename: string; subfolder: string } {
  const { attribution, sensitivity = "friends", subfolder = "mcp" } = options;
  const published = sensitivity === "public";

  // Sanitize title for use in filename.
  const rawTitle = options.title || `MCP ${attribution.query.slice(0, 40)}`;
  const safeTitle = rawTitle
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .toLowerCase();
  const filename = `${safeTitle}.md`;

  const frontmatterLines = [
    "---",
    `source: mcp`,
    `mcp-server: "${attribution.server.replace(/"/g, '\\"')}"`,
    `mcp-tool: "${attribution.tool.replace(/"/g, '\\"')}"`,
    `mcp-query: "${attribution.query.replace(/"/g, '\\"')}"`,
    `mcp-queried-at: "${attribution.queriedAt}"`,
    `published: ${published}`,
    `tags: [mcp, knowledge]`,
    `---`,
    "",
  ];

  const bodyLines = [
    `# ${options.title || rawTitle}`,
    "",
    `> Sourced from MCP server "${attribution.server}" via tool \`${attribution.tool}\` at ${attribution.queriedAt}.`,
    "",
    "## Results",
    "",
    ...snippets.map((s, i) =>
      `### ${i + 1}. ${s.title}\n\n${s.text}\n\n*Source: ${s.source}*\n`,
    ),
  ];

  return {
    content: frontmatterLines.join("\n") + bodyLines.join("\n"),
    filename,
    subfolder,
  };
}
