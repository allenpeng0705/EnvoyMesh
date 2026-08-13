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
  /** Override default timeout (ms). Clamped 1s–30s. */
  timeoutMs?: number;
}

/** Soft-fail MCP search result (never throws for network/parse failures). */
export interface ExternalMcpSearchResult {
  snippets: ExternalKnowledgeSnippet[];
  /** Present when search was skipped or failed. */
  error?: string;
}

export const DEFAULT_MCP_KNOWLEDGE_TIMEOUT_MS = 8_000;
export const MAX_MCP_KNOWLEDGE_TIMEOUT_MS = 30_000;

/**
 * Query an external MCP knowledge server via JSON-RPC `tools/call`.
 * Expects an MCP-compatible HTTP endpoint (Streamable HTTP or simple POST bridge).
 *
 * Soft-fails: returns `{ snippets: [], error }` instead of throwing so prompt
 * paths stay resilient (Phase 57D).
 */
export async function searchExternalMcpKnowledge(
  input: SearchExternalKnowledgeInput,
): Promise<ExternalMcpSearchResult> {
  const kb = resolveAiKnowledgeBaseSettings(input.knowledgeBase);
  if (kb.externalProvider !== "mcp") {
    return { snippets: [] };
  }
  const url = kb.mcpServerUrl?.trim();
  if (!url) {
    return { snippets: [], error: "mcp_url_missing" };
  }

  const urlError = validateMcpServerUrl(url);
  if (urlError) {
    return { snippets: [], error: urlError };
  }

  const toolName = kb.mcpSearchTool?.trim() || "memex_search";
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const limit = input.limit ?? kb.vaultSnippetLimit;
  const timeoutMs = clampTimeoutMs(input.timeoutMs ?? kb.mcpTimeoutMs);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
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
      signal: controller.signal,
    });

    if (!response.ok) {
      return { snippets: [], error: `mcp_http_${response.status}` };
    }

    const payload = (await response.json()) as {
      result?: { content?: Array<{ type?: string; text?: string }> };
      error?: { message?: string };
    };
    if (payload.error?.message) {
      return { snippets: [], error: `mcp_rpc: ${payload.error.message}` };
    }

    const textBlocks =
      payload.result?.content
        ?.map((block) => block.text?.trim())
        .filter((text): text is string => Boolean(text)) ?? [];

    if (textBlocks.length === 0) {
      return { snippets: [] };
    }

    const snippets = parseMcpKnowledgeText(textBlocks.join("\n"), limit).map((entry) => ({
      title: entry.title,
      source: kb.externalMcpServer ?? toolName,
      text: entry.text,
    }));
    return { snippets };
  } catch (err) {
    if (isAbortError(err)) {
      return { snippets: [], error: `mcp_timeout_${timeoutMs}ms` };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { snippets: [], error: `mcp_fetch: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Allow only http(s) URLs; reject file/data/etc. */
export function validateMcpServerUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "mcp_url_invalid";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "mcp_url_protocol";
  }
  return undefined;
}

function clampTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MCP_KNOWLEDGE_TIMEOUT_MS;
  }
  return Math.min(MAX_MCP_KNOWLEDGE_TIMEOUT_MS, Math.max(1_000, Math.floor(value)));
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "AbortError" || name === "TimeoutError";
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
// Phase 44E / 57D — MCP write-back: save results as a vault note
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
  /** Sensitivity level for the created note (default: "private"). */
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
  const { attribution, sensitivity = "private", subfolder = "mcp" } = options;
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
    ...snippets.map(
      (s, i) => `### ${i + 1}. ${s.title}\n\n${s.text}\n\n*Source: ${s.source}*\n`,
    ),
  ];

  return {
    content: frontmatterLines.join("\n") + bodyLines.join("\n"),
    filename,
    subfolder,
  };
}

/** Format a single MCP card as a vault note under `notes/mcp/`. */
export function formatMcpSnippetAsNote(
  snippet: ExternalKnowledgeSnippet,
  options: McpWriteBackOptions,
): { content: string; filename: string; subfolder: string } {
  return formatMcpResultsAsNote([snippet], {
    ...options,
    title: options.title || snippet.title,
  });
}

export interface CallMcpToolInput {
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  toolName: string;
  args: Record<string, unknown>;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

export interface CallMcpToolResult {
  textBlocks: string[];
  error?: string;
}

/** Low-level MCP `tools/call` (soft-fail). */
export async function callMcpTool(input: CallMcpToolInput): Promise<CallMcpToolResult> {
  const kb = resolveAiKnowledgeBaseSettings(input.knowledgeBase);
  if (kb.externalProvider !== "mcp") {
    return { textBlocks: [], error: "mcp_disabled" };
  }
  const url = kb.mcpServerUrl?.trim();
  if (!url) {
    return { textBlocks: [], error: "mcp_url_missing" };
  }
  const urlError = validateMcpServerUrl(url);
  if (urlError) {
    return { textBlocks: [], error: urlError };
  }

  const fetchImplementation = input.fetchImplementation ?? fetch;
  const timeoutMs = clampTimeoutMs(input.timeoutMs ?? kb.mcpTimeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
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
          name: input.toolName,
          arguments: input.args,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { textBlocks: [], error: `mcp_http_${response.status}` };
    }

    const payload = (await response.json()) as {
      result?: { content?: Array<{ type?: string; text?: string }> };
      error?: { message?: string };
    };
    if (payload.error?.message) {
      return { textBlocks: [], error: `mcp_rpc: ${payload.error.message}` };
    }

    const textBlocks =
      payload.result?.content
        ?.map((block) => block.text?.trim())
        .filter((text): text is string => Boolean(text)) ?? [];
    return { textBlocks };
  } catch (err) {
    if (isAbortError(err)) {
      return { textBlocks: [], error: `mcp_timeout_${timeoutMs}ms` };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { textBlocks: [], error: `mcp_fetch: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Push a Markdown note to MCP write tool (default `memex_write`).
 * Soft-fails when the tool is missing or the server errors.
 */
export async function writeExternalMcpKnowledge(input: {
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  title: string;
  content: string;
  fetchImplementation?: typeof fetch;
  /** Override write tool name. Default: memex_write */
  writeTool?: string;
}): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const kb = resolveAiKnowledgeBaseSettings(input.knowledgeBase);
  const toolName = input.writeTool?.trim() || "memex_write";
  const result = await callMcpTool({
    knowledgeBase: kb,
    toolName,
    args: {
      title: input.title,
      content: input.content,
      body: input.content,
      text: input.content,
    },
    fetchImplementation: input.fetchImplementation,
  });
  if (result.error) {
    return { ok: false, error: result.error };
  }
  const joined = result.textBlocks.join("\n");
  let externalId: string | undefined;
  try {
    const parsed = JSON.parse(joined) as { id?: string };
    if (typeof parsed.id === "string") externalId = parsed.id;
  } catch {
    // plain-text ack is fine
  }
  return { ok: true, externalId };
}

/** Stable browse path for an MCP remote card. */
export function mcpRemoteBrowsePath(externalId: string, title: string): string {
  const safeId = externalId
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "card";
  const safeTitle = title
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase() || "note";
  return `mcp-remote/${safeId}-${safeTitle}.md`;
}
