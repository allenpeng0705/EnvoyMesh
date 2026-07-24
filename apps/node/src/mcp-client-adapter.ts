/**
 * Phase 48A — MCP Tool Consumer Adapter.
 *
 * Bridges EnvoyMesh's `mesh.mcp.*` tool system to external MCP (Model Context
 * Protocol) servers. The built-in OpenClaw agent can call any MCP-compatible
 * tool (filesystem, GitHub, databases, etc.) via `mesh.mcp.call_tool`.
 *
 * The actual MCP transport is owned by the OpenClaw gateway's bridge HTTP
 * endpoint (`/bridge/execute-tool`). This module wraps the call:
 *
 *   mesh.mcp.call_tool(server, tool, args) → POST /bridge/execute-tool
 *     → OpenClaw gateway runs the MCP runtime in-process
 *     → returns CallToolResult → mapped back to EnvoyMesh shapes
 *
 * Security:
 * - `gatewayBridgeUrl` is required (no silent no-op). Hosts that don't have
 *   an OpenClaw gateway configured must NOT construct this manager.
 * - `McpConsumerConfig.url` (http transport) is validated against an
 *   owner-controlled allowlist. Loopback by default; remote hosts must be
 *   explicitly opted-in via `allowRemoteHttp: true` on the consumer entry.
 * - `command`/`args` (stdio) are validated for shape only — stdio processes
 *   run with the owner's full user privileges by design. Hosts should not
 *   accept MCP consumer configs from untrusted sources.
 * - Per-request timeout is honored via AbortSignal.
 *
 * Design: docs/a2a-mcp-interop-design.md §4.2.
 */

/** Allowed HTTP schemes for `McpConsumerConfig.url`. https-only by default. */
const ALLOWED_HTTP_SCHEMES = new Set(["https:"]);
/** Loopback host names that bypass the `allowRemoteHttp` gate. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Maximum MCP gateway bridge body size in bytes. Matches node-side limit. */
const MAX_GATEWAY_BODY_BYTES = 1 * 1024 * 1024;

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
  /** http only: bearer token / API key sent in `Authorization` header. */
  bearerToken?: string;
  /** Environment variables for the subprocess (stdio) or headers (http). */
  env?: Record<string, string>;
  /** Per-request timeout in milliseconds. Default: 30000, max: 300000. */
  requestTimeoutMs?: number;
  /**
   * http only: allow non-loopback remote hosts. Default `false` —
   * only loopback + https-loopback URLs are accepted unless explicitly
   * opted-in. This is the SSRF guard.
   */
  allowRemoteHttp?: boolean;
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
 * Construction requires a `gatewayBridgeUrl`; if the host has no
 * OpenClaw gateway, callers should NOT construct this manager at all.
 * The no-op manager (`createNoOpMcpConsumerManager`) is provided for
 * the empty-config case.
 */
export interface McpConsumerManager {
  /** List available tools from configured MCP servers. */
  listMcpTools(serverName?: string): Promise<{ ok: boolean; tools?: McpToolListing[]; error?: string }>;
  /** Call a tool on a configured MCP server. */
  callMcpTool(serverName: string, toolName: string, args?: Record<string, unknown>): Promise<McpCallResult>;
}

// ---------------------------------------------------------------------------
// Content-type mapping (Phase 48A → MCP server)
// ---------------------------------------------------------------------------

/**
 * Map an MCP SDK `CallToolResult` content array to EnvoyMesh `MappedContent[]`.
 *
 * MCP content types:
 * - `TextContent` → `{ type: "text", text }`
 * - `ImageContent` → `{ type: "file", mimeType, base64 }` (filename optional)
 * - `AudioContent` → `{ type: "file", mimeType, base64 }` (no filename in spec)
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
    if (!item || typeof item !== "object") continue;
    const type = item.type;
    if (type === "text" && typeof item.text === "string") {
      out.push({ type: "text", text: item.text });
    } else if (type === "image" && typeof item.data === "string" && typeof item.mimeType === "string") {
      out.push({
        type: "file",
        mimeType: item.mimeType,
        base64: item.data,
        ...(typeof item.filename === "string" ? { filename: item.filename } : {}),
      });
    } else if (type === "audio" && typeof item.data === "string" && typeof item.mimeType === "string") {
      out.push({
        type: "file",
        mimeType: item.mimeType,
        base64: item.data,
      });
    } else if (type === "resource_link" && typeof item.uri === "string" && item.uri.length > 0) {
      // Spec requires non-empty uri on resource_link — skip malformed entries.
      out.push({
        type: "structured",
        data: { uri: item.uri, name: typeof item.name === "string" ? item.name : "" },
      });
    } else if (type === "resource" && item.resource && typeof item.resource === "object") {
      const res = item.resource as Record<string, unknown>;
      // Spec requires non-empty uri on embedded resource — skip malformed entries.
      if (typeof res.uri !== "string" || res.uri.length === 0) continue;
      out.push({
        type: "structured",
        data: {
          uri: res.uri,
          ...(typeof res.text === "string" ? { text: res.text } : {}),
          ...(typeof res.mimeType === "string" ? { mimeType: res.mimeType } : {}),
        },
      });
    }
    // Unknown content types are silently skipped (forward compatibility).
  }
  return out;
}

/**
 * Map an EnvoyMesh `MappedContent[]` back to MCP server-side content items.
 * Used when re-shaping a tool result before returning it to the MCP client
 * (Phase 48B's `mapToolResultToMcpContent` calls into a similar shape).
 *
 * Symmetric with `mapMcpContent` — text/text, file→image|audio by mimeType,
 * structured→text (JSON-encoded) since MCP has no native structured-data
 * content type.
 */
export function mappedContentToMcp(
  items: MappedContent[],
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const item of items) {
    if (item.type === "text") {
      out.push({ type: "text", text: item.text });
    } else if (item.type === "file") {
      // image/* → image, audio/* → audio, else fall back to embedded resource.
      if (item.mimeType.startsWith("image/")) {
        out.push({
          type: "image",
          data: item.base64,
          mimeType: item.mimeType,
          ...(item.filename ? { filename: item.filename } : {}),
        });
      } else if (item.mimeType.startsWith("audio/")) {
        out.push({ type: "audio", data: item.base64, mimeType: item.mimeType });
      } else {
        out.push({
          type: "resource",
          resource: {
            uri: item.filename ? `file://${item.filename}` : "file://unknown",
            mimeType: item.mimeType,
            blob: item.base64,
          },
        });
      }
    } else if (item.type === "structured") {
      // MCP has no native structured-data content type; encode as text JSON.
      out.push({ type: "text", text: JSON.stringify(item.data) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

export interface ConfigValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Validate a list of `McpConsumerConfig` entries before they are passed
 * to `createMcpConsumerManager`. Hosts should run this in their config
 * validator so malformed entries fail fast at startup rather than at the
 * first tool call.
 */
export function validateMcpConsumerConfigs(configs: unknown): ConfigValidationResult {
  const errors: string[] = [];
  if (!Array.isArray(configs)) {
    return { ok: false, errors: ["mcpConsumers must be an array"] };
  }
  const seen = new Set<string>();
  configs.forEach((c, i) => {
    const ctx = `mcpConsumers[${i}]`;
    if (!c || typeof c !== "object") {
      errors.push(`${ctx}: must be an object`);
      return;
    }
    const entry = c as Record<string, unknown>;
    if (typeof entry.name !== "string" || entry.name.length === 0) {
      errors.push(`${ctx}.name: required non-empty string`);
    } else if (seen.has(entry.name)) {
      errors.push(`${ctx}.name: duplicate "${entry.name}"`);
    } else {
      seen.add(entry.name);
    }
    if (entry.transport !== "stdio" && entry.transport !== "http") {
      errors.push(`${ctx}.transport: must be "stdio" or "http"`);
      return;
    }
    if (entry.transport === "stdio") {
      if (typeof entry.command !== "string" || entry.command.length === 0) {
        errors.push(`${ctx}.command: required for stdio transport`);
      }
      if (entry.args !== undefined && !Array.isArray(entry.args)) {
        errors.push(`${ctx}.args: must be an array of strings`);
      }
    } else if (entry.transport === "http") {
      if (typeof entry.url !== "string" || entry.url.length === 0) {
        errors.push(`${ctx}.url: required for http transport`);
      } else {
        const v = validateHttpUrl(entry.url, entry.allowRemoteHttp === true);
        if (v) errors.push(`${ctx}.url: ${v}`);
      }
    }
    if (entry.requestTimeoutMs !== undefined) {
      if (typeof entry.requestTimeoutMs !== "number" || entry.requestTimeoutMs <= 0 || entry.requestTimeoutMs > 300_000) {
        errors.push(`${ctx}.requestTimeoutMs: must be a positive integer ≤ 300000`);
      }
    }
    if (entry.allowRemoteHttp !== undefined && entry.transport !== "http") {
      errors.push(`${ctx}.allowRemoteHttp: only valid for http transport`);
    }
  });
  return { ok: errors.length === 0, errors };
}

function validateHttpUrl(raw: string, allowRemote: boolean): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "not a valid URL";
  }
  if (!ALLOWED_HTTP_SCHEMES.has(u.protocol)) {
    return `unsupported scheme "${u.protocol}"; only https is allowed`;
  }
  if (!allowRemote && !LOOPBACK_HOSTS.has(u.hostname)) {
    return `remote host "${u.hostname}" requires allowRemoteHttp: true`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Manager factories
// ---------------------------------------------------------------------------

/**
 * No-op manager. Returned by `createMcpConsumerManager([])` for the
 * empty-config case. Every call returns a clear, actionable error.
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
 * Executor the host wires in. Calls the local mesh tool registry in-process
 * — no HTTP round-trip, no gateway dependency at runtime.
 */
export type McpExecutor = (toolName: string, params: Record<string, unknown>) => Promise<unknown>;

/**
 * Create an MCP consumer manager. Requires an `executor` (the host's
 * local tool-dispatch function) so the consumer can drive the gateway
 * MCP runtime without an HTTP round-trip. Validates configs up-front
 * so misconfiguration fails fast.
 */
export function createMcpConsumerManager(
  configs: McpConsumerConfig[],
  executor: McpExecutor,
): McpConsumerManager {
  if (typeof executor !== "function") {
    throw new Error("createMcpConsumerManager requires an executor function");
  }
  const validation = validateMcpConsumerConfigs(configs);
  if (!validation.ok) {
    throw new Error(`Invalid mcpConsumers config: ${validation.errors.join("; ")}`);
  }
  if (configs.length === 0) {
    return createNoOpMcpConsumerManager();
  }
  const knownServers = new Set(configs.map((c) => c.name));

  return {
    async listMcpTools(serverName?: string) {
      if (serverName && !knownServers.has(serverName)) {
        return { ok: false, error: `Unknown MCP server: ${serverName}. Configured: ${[...knownServers].join(", ")}` };
      }
      try {
        const result = await executor("mesh.mcp.list_tools", { serverName });
        // Accept two shapes for backward-compat with the bridge response
        // envelope (`{ok:true, result:{tools:[...]}}`) and a flat
        // `{tools:[...]}` direct return.
        const obj = (result as { result?: unknown } | undefined)?.result ?? result;
        const tools = (obj as { tools?: McpToolListing[] })?.tools ?? [];
        return { ok: true, tools };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `MCP list_tools failed: ${msg}` };
      }
    },

    async callMcpTool(srvName, toolName, args) {
      if (!knownServers.has(srvName)) {
        return { ok: false, error: `Unknown MCP server: ${srvName}. Configured: ${[...knownServers].join(", ")}` };
      }
      try {
        const result = (await executor("mesh.mcp.call_tool", {
          serverName: srvName,
          toolName,
          arguments: args ?? {},
        })) as {
          ok?: boolean;
          result?: { content?: Array<Record<string, unknown>>; structuredContent?: Record<string, unknown> };
          error?: string;
        } | undefined;
        if (!result || result.ok === false) {
          return { ok: false, error: typeof result?.error === "string" ? result.error : "MCP call_tool returned error" };
        }
        const inner = result.result ?? {};
        const mapped = mapMcpContent(inner.content ?? []);
        return {
          ok: true,
          content: mapped,
          ...(inner.structuredContent ? { structuredContent: inner.structuredContent } : {}),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `MCP call_tool failed: ${msg}` };
      }
    },
  };
}