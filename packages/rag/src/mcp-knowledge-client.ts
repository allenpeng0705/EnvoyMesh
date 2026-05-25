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
