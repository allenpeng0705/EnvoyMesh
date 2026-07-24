/**
 * Phase 48A — MCP Tool Consumer Adapter.
 *
 * Bridges EnvoyMesh's `mesh.mcp.*` tool system to external MCP (Model Context
 * Protocol) servers. The built-in OpenClaw agent can call any MCP-compatible
 * tool (filesystem, GitHub, databases, etc.) via `mesh.mcp.call_tool`.
 *
 * Transport is handled by the existing OpenClaw MCP runtime at
 * `packages/openclaw/src/agents/agent-bundle-mcp-runtime.ts` — no new
 * transport code is needed. This module wraps it into EnvoyMesh tool shapes.
 *
 * Design: docs/a2a-mcp-interop-design.md §4.2.
 */

/** Configuration for a single MCP consumer server. */
export interface McpConsumerConfig {
  /** Unique name for this MCP server (used in tool calls as `serverName`). */
  name: string;
  /** Transport type: stdio (local subprocess) or http (Streamable HTTP). */
  transport: "stdio" | "http";
  /** stdio only: command to launch (e.g. "npx", "node"). */
  command?: string;
  /** stdio only: arguments for the command. */
  args?: string[];
  /** http only: server URL (e.g. "https://example.com/mcp"). */
  url?: string;
  /** Environment variables for the subprocess (stdio) or headers (http). */
  env?: Record<string, string>;
  /** Per-request timeout in milliseconds. Default: 30000. */
  requestTimeoutMs?: number;
}

/** A listed MCP tool descriptor (matches the shape returned to the agent). */
export interface McpToolListing {
  serverName: string;
  toolName: string;
  description: string;
}

/** A mapped content item from an MCP CallToolResult. */
export type MappedContent =
  | { type: "text"; text: string }
  | { type: "file"; mimeType: string; base64: string; filename?: string }
  | { type: "structured"; data: Record<string, unknown> };

/** Result of an MCP tool call, mapped to EnvoyMesh shapes. */
export interface McpCallResult {
  ok: boolean;
  content?: MappedContent[];
  structuredContent?: Record<string, unknown>;
  error?: string;
}

/**
 * Lazy MCP consumer manager. Wraps the OpenClaw session MCP runtime so
 * EnvoyMesh can call external MCP servers without coupling to the SDK directly.
 *
 * If no consumers are configured, `listMcpTools` and `callMcpTool` return
 * `{ ok: false, error: "No MCP consumers configured" }`.
 */
export interface McpConsumerManager {
  /** List available tools from configured MCP servers. */
  listMcpTools(serverName?: string): Promise<{ ok: boolean; tools?: McpToolListing[]; error?: string }>;
  /** Call a tool on a configured MCP server. */
  callMcpTool(serverName: string, toolName: string, args?: Record<string, unknown>): Promise<McpCallResult>;
}

/**
 * Map an MCP SDK `CallToolResult` content array to EnvoyMesh `MappedContent[]`.
 *
 * MCP content types:
 * - `TextContent` → `{ type: "text", text }`
 * - `ImageContent` → `{ type: "file", mimeType, base64 }`
 * - `AudioContent` → `{ type: "file", mimeType, base64 }`
 * - `resource_link` → `{ type: "structured", data: { uri, name } }`
 * - `resource` (embedded) → `{ type: "structured", data: { uri, text? } }`
 *
 * Additionally, the top-level `structuredContent` field (if present) is
 * extracted separately — it's validated against the tool's `outputSchema`
 * by the SDK and contains typed JSON output.
 */
export function mapMcpContent(
  rawContent: Array<Record<string, unknown>>,
): MappedContent[] {
  const out: MappedContent[] = [];
  for (const item of rawContent) {
    const type = item.type as string | undefined;
    if (type === "text" && typeof item.text === "string") {
      out.push({ type: "text", text: item.text });
    } else if (type === "image" && typeof item.data === "string" && typeof item.mimeType === "string") {
      out.push({
        type: "file",
        mimeType: item.mimeType,
        base64: item.data,
        filename: typeof item.filename === "string" ? item.filename : undefined,
      });
    } else if (type === "audio" && typeof item.data === "string" && typeof item.mimeType === "string") {
      out.push({
        type: "file",
        mimeType: item.mimeType,
        base64: item.data,
      });
    } else if (type === "resource_link" && typeof item.uri === "string") {
      out.push({
        type: "structured",
        data: { uri: item.uri, name: item.name ?? "" },
      });
    } else if (type === "resource" && item.resource && typeof item.resource === "object") {
      const res = item.resource as Record<string, unknown>;
      out.push({
        type: "structured",
        data: {
          uri: res.uri ?? "",
          text: res.text,
          mimeType: res.mimeType,
        },
      });
    }
    // Unknown content types are silently skipped (forward compatibility).
  }
  return out;
}

/**
 * Create a no-op MCP consumer manager for when no consumers are configured.
 * All operations return a clear error message.
 */
export function createNoOpMcpConsumerManager(): McpConsumerManager {
  const err = "No MCP consumers configured. Add 'mcpConsumers' to node-config.json to use MCP tools.";
  return {
    async listMcpTools() {
      return { ok: false, error: err };
    },
    async callMcpTool() {
      return { ok: false, error: err };
    },
  };
}

/**
 * Create an MCP consumer manager from EnvoyMesh config.
 *
 * This function is the primary export — it reads the `McpConsumerConfig[]`
 * from node config and returns either a real manager (if consumers exist)
 * or the no-op manager (if empty).
 *
 * The real manager lazily connects to MCP servers via the OpenClaw session
 * MCP runtime on first use. Transport resolution, backoff, and catalog
 * caching are all handled by the existing runtime.
 *
 * NOTE: The actual MCP tool call is forwarded to the OpenClaw gateway's
 * tool bridge, which runs the MCP runtime in-process. This avoids
 * cross-workspace TypeScript rootDir issues. If the gateway is
 * unavailable, tool calls return a clear error.
 */
export function createMcpConsumerManager(
  configs: McpConsumerConfig[],
  gatewayBridgeUrl?: string,
): McpConsumerManager {
  if (!configs || configs.length === 0) {
    return createNoOpMcpConsumerManager();
  }

  const knownServers = new Set(configs.map((c) => c.name));

  /**
   * Forward an MCP tool call to the OpenClaw gateway bridge.
   * The gateway runs the MCP runtime in-process and handles transport
   * lifecycle, backoff, and catalog caching.
   */
  async function forwardToGateway(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    if (!gatewayBridgeUrl) {
      return {
        ok: false,
        error: "MCP gateway bridge URL not configured. Ensure the OpenClaw gateway is running.",
      };
    }
    try {
      const resp = await fetch(`${gatewayBridgeUrl}/bridge/execute-tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName, params }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        return { ok: false, error: `Gateway returned ${resp.status}` };
      }
      const body = await resp.json() as { ok: boolean; result?: unknown; error?: string };
      return body;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Gateway unreachable: ${msg}` };
    }
  }

  return {
    async listMcpTools(serverName?: string): Promise<{ ok: boolean; tools?: McpToolListing[]; error?: string }> {
      if (serverName && !knownServers.has(serverName)) {
        return { ok: false, error: `Unknown MCP server: ${serverName}. Configured: ${[...knownServers].join(", ")}` };
      }
      const result = await forwardToGateway("mesh.mcp.list_tools", { serverName });
      if (!result.ok) return { ok: false, error: result.error };
      const tools = (result.result as { tools?: McpToolListing[] })?.tools ?? [];
      return { ok: true, tools };
    },

    async callMcpTool(
      srvName: string,
      toolName: string,
      args?: Record<string, unknown>,
    ): Promise<McpCallResult> {
      if (!knownServers.has(srvName)) {
        return { ok: false, error: `Unknown MCP server: ${srvName}. Configured: ${[...knownServers].join(", ")}` };
      }
      const result = await forwardToGateway("mesh.mcp.call_tool", {
        serverName: srvName,
        toolName,
        arguments: args ?? {},
      });
      if (!result.ok) return { ok: false, error: result.error };
      const mapped = mapMcpContent(
        ((result.result as { content?: Array<Record<string, unknown>> })?.content) ?? [],
      );
      const structuredContent =
        (result.result as { structuredContent?: Record<string, unknown> })?.structuredContent;
      return { ok: true, content: mapped, structuredContent };
    },
  };
}
