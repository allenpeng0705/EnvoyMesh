/**
 * Phase 48A — MCP Tool Consumer Adapter.
 *
 * Bridges EnvoyMesh's `mesh.mcp.*` tools to external MCP servers via the
 * official `@modelcontextprotocol/sdk` client (stdio + Streamable HTTP).
 *
 *   mesh.mcp.list_tools / mesh.mcp.call_tool
 *     → McpConsumerManager (lazy Client per server)
 *     → SDK Client.listTools / callTool
 *     → mapMcpContent → EnvoyMesh shapes
 *
 * Security:
 * - `McpConsumerConfig.url` (http) is SSRF-gated: loopback by default;
 *   remote hosts require `allowRemoteHttp: true`. Loopback may use `http:`;
 *   remote requires `https:`.
 * - `command`/`args` (stdio) are shape-validated only — subprocesses run with
 *   the owner's privileges. Do not accept consumer configs from untrusted sources.
 *
 * Design: docs/a2a-mcp-interop-design.md §4.2.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** Loopback host names that bypass the `allowRemoteHttp` gate. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

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
  /** http only: server URL (e.g. "https://example.com/mcp" or "http://127.0.0.1:8080/mcp"). */
  url?: string;
  /** http only: bearer token / API key sent in `Authorization` header. */
  bearerToken?: string;
  /** Environment variables for the subprocess (stdio) or extra headers (http). */
  env?: Record<string, string>;
  /** Per-request timeout in milliseconds. Default: 30000, max: 300000. */
  requestTimeoutMs?: number;
  /**
   * http only: allow non-loopback remote hosts. Default `false` —
   * only loopback URLs are accepted unless explicitly opted-in.
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
 * Minimal session surface used by the manager. Production connects a real
 * SDK Client; tests inject fakes via `createMcpConsumerManager` options.
 */
export interface McpServerSession {
  listTools(): Promise<{ tools: Array<{ name: string; description?: string }> }>;
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    content?: Array<Record<string, unknown>>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }>;
  close(): Promise<void>;
}

export type McpSessionFactory = (config: McpConsumerConfig) => Promise<McpServerSession>;

export interface McpConsumerManager {
  listMcpTools(serverName?: string): Promise<{ ok: boolean; tools?: McpToolListing[]; error?: string }>;
  callMcpTool(serverName: string, toolName: string, args?: Record<string, unknown>): Promise<McpCallResult>;
  /** Close cached MCP clients (best-effort). */
  dispose(): Promise<void>;
}

export interface CreateMcpConsumerManagerOptions {
  /** Override session creation (tests). Default: SDK Client connect. */
  sessionFactory?: McpSessionFactory;
}

// ---------------------------------------------------------------------------
// Content-type mapping
// ---------------------------------------------------------------------------

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
      out.push({
        type: "structured",
        data: { uri: item.uri, name: typeof item.name === "string" ? item.name : "" },
      });
    } else if (type === "resource" && item.resource && typeof item.resource === "object") {
      const res = item.resource as Record<string, unknown>;
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
  }
  return out;
}

export function mappedContentToMcp(
  items: MappedContent[],
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const item of items) {
    if (item.type === "text") {
      out.push({ type: "text", text: item.text });
    } else if (item.type === "file") {
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
  const isLoopback = LOOPBACK_HOSTS.has(u.hostname);
  if (u.protocol === "http:") {
    if (!isLoopback) {
      return `http: is only allowed for loopback hosts; use https: for remote`;
    }
  } else if (u.protocol !== "https:") {
    return `unsupported scheme "${u.protocol}"; only http (loopback) or https is allowed`;
  }
  if (!allowRemote && !isLoopback) {
    return `remote host "${u.hostname}" requires allowRemoteHttp: true`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Default SDK session factory
// ---------------------------------------------------------------------------

async function connectSdkSession(config: McpConsumerConfig): Promise<McpServerSession> {
  const timeoutMs = config.requestTimeoutMs ?? 30_000;
  const client = new Client({ name: "envoymesh-mcp-consumer", version: "0.1.0" });

  if (config.transport === "stdio") {
    const env = {
      ...getDefaultEnvironment(),
      ...(config.env ?? {}),
    };
    const transport = new StdioClientTransport({
      command: config.command!,
      args: config.args ?? [],
      env,
      stderr: "pipe",
    });
    await client.connect(transport);
  } else {
    const headers: Record<string, string> = { ...(config.env ?? {}) };
    if (config.bearerToken) {
      headers.Authorization = `Bearer ${config.bearerToken}`;
    }
    const transport = new StreamableHTTPClientTransport(new URL(config.url!), {
      requestInit: { headers },
    });
    await client.connect(transport);
  }

  return {
    async listTools() {
      const result = await client.listTools(undefined, { timeout: timeoutMs });
      return {
        tools: (result.tools ?? []).map((t) => ({
          name: t.name,
          description: typeof t.description === "string" ? t.description : undefined,
        })),
      };
    },
    async callTool(name, args) {
      const result = await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: timeoutMs },
      );
      const content = Array.isArray(result.content)
        ? (result.content as Array<Record<string, unknown>>)
        : [];
      const structured =
        result.structuredContent && typeof result.structuredContent === "object"
          ? (result.structuredContent as Record<string, unknown>)
          : undefined;
      return {
        content,
        ...(structured ? { structuredContent: structured } : {}),
        ...(result.isError === true ? { isError: true } : {}),
      };
    },
    async close() {
      try {
        await client.close();
      } catch {
        /* best-effort */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Manager factories
// ---------------------------------------------------------------------------

export function createNoOpMcpConsumerManager(): McpConsumerManager {
  const err = "No MCP consumers configured. Add 'mcpConsumers' to node-config.json to use MCP tools.";
  return {
    async listMcpTools() {
      return { ok: false, error: err };
    },
    async callMcpTool() {
      return { ok: false, error: err };
    },
    async dispose() {},
  };
}

/**
 * Create an MCP consumer manager that dials configured servers via the SDK.
 * Pass `sessionFactory` in tests to avoid spawning real processes.
 */
export function createMcpConsumerManager(
  configs: McpConsumerConfig[],
  options?: CreateMcpConsumerManagerOptions,
): McpConsumerManager {
  const validation = validateMcpConsumerConfigs(configs);
  if (!validation.ok) {
    throw new Error(`Invalid mcpConsumers config: ${validation.errors.join("; ")}`);
  }
  if (configs.length === 0) {
    return createNoOpMcpConsumerManager();
  }

  const byName = new Map(configs.map((c) => [c.name, c]));
  const sessions = new Map<string, Promise<McpServerSession>>();
  const factory = options?.sessionFactory ?? connectSdkSession;

  function getSession(name: string): Promise<McpServerSession> {
    let pending = sessions.get(name);
    if (!pending) {
      const cfg = byName.get(name)!;
      pending = factory(cfg).catch((err) => {
        sessions.delete(name);
        throw err;
      });
      sessions.set(name, pending);
    }
    return pending;
  }

  return {
    async listMcpTools(serverName?: string) {
      if (serverName && !byName.has(serverName)) {
        return {
          ok: false,
          error: `Unknown MCP server: ${serverName}. Configured: ${[...byName.keys()].join(", ")}`,
        };
      }
      const names = serverName ? [serverName] : [...byName.keys()];
      try {
        const tools: McpToolListing[] = [];
        for (const name of names) {
          const session = await getSession(name);
          const listed = await session.listTools();
          for (const t of listed.tools) {
            tools.push({
              serverName: name,
              toolName: t.name,
              description: t.description ?? "",
            });
          }
        }
        return { ok: true, tools };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `MCP list_tools failed: ${msg}` };
      }
    },

    async callMcpTool(srvName, toolName, args) {
      if (!byName.has(srvName)) {
        return {
          ok: false,
          error: `Unknown MCP server: ${srvName}. Configured: ${[...byName.keys()].join(", ")}`,
        };
      }
      try {
        const session = await getSession(srvName);
        const result = await session.callTool(toolName, args ?? {});
        if (result.isError) {
          const text = (result.content ?? [])
            .filter((c) => c.type === "text" && typeof c.text === "string")
            .map((c) => c.text as string)
            .join("\n");
          return { ok: false, error: text || "MCP call_tool returned error" };
        }
        return {
          ok: true,
          content: mapMcpContent(result.content ?? []),
          ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `MCP call_tool failed: ${msg}` };
      }
    },

    async dispose() {
      const closes = [...sessions.values()].map(async (p) => {
        try {
          const s = await p;
          await s.close();
        } catch {
          /* ignore */
        }
      });
      sessions.clear();
      await Promise.all(closes);
    },
  };
}
