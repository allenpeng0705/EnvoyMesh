#!/usr/bin/env node
/**
 * Phase 48B — MCP Server Adapter (stdio bridge).
 *
 * Exposes EnvoyMesh's mesh.* tools to MCP clients (Claude Desktop, Cursor,
 * Windsurf, etc.) via stdio JSON-RPC 2.0. The adapter is a thin bridge:
 * it forwards tools/list and tools/call to the running node's bridge HTTP
 * endpoint (POST /bridge/execute-tool), translating between MCP and
 * EnvoyMesh tool shapes.
 *
 * Usage:
 *   npx envoymesh mcp-server                          # connects to default bridge
 *   npx envoymesh mcp-server --bridge http://127.0.0.1:3031  # custom bridge URL
 *
 * Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "envoymesh": {
 *         "command": "npx",
 *         "args": ["envoymesh", "mcp-server"]
 *       }
 *     }
 *   }
 *
 * Design: docs/a2a-mcp-interop-design.md §4.3.
 */
import { createInterface } from "node:readline";

const BRIDGE_DEFAULT = "http://127.0.0.1:3031";
const TOOL_TIMEOUT_MS = 60_000;

// ─── MCP types (inline — avoids importing the SDK from apps/node) ────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

interface McpContentItem {
  type: "text" | "image" | "audio" | "resource_link" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
  name?: string;
  resource?: Record<string, unknown>;
}

interface McpCallToolResult {
  content: McpContentItem[];
  isError?: boolean;
}

// ─── Bridge client ────────────────────────────────────────────────────────────

async function bridgeCall(
  bridgeUrl: string,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const resp = await fetch(`${bridgeUrl}/bridge/json-rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Bridge HTTP ${resp.status}: ${await resp.text().catch(() => "unknown")}`);
  }
  const body = await resp.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? "Bridge error");
  return body.result;
}

async function bridgeListTools(bridgeUrl: string): Promise<McpTool[]> {
  // The node's bridge already serves tool listing via GET /bridge/list-tools
  const resp = await fetch(`${bridgeUrl}/bridge/list-tools`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`list-tools HTTP ${resp.status}`);
  const body = await resp.json() as { ok: boolean; tools?: Array<{ name: string; description: string; paramSchema?: Record<string, unknown> }> };
  if (!body.ok || !body.tools) return [];
  return body.tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.paramSchema ?? { type: "object", properties: {} },
  }));
}

async function bridgeExecuteTool(
  bridgeUrl: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const resp = await fetch(`${bridgeUrl}/bridge/execute-tool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName, params }),
    signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`execute-tool HTTP ${resp.status}`);
  const body = await resp.json() as { ok: boolean; result?: unknown; error?: string };
  return body;
}

// ─── Tool result → MCP content mapping ───────────────────────────────────────

function mapToolResultToMcpContent(
  result: unknown,
  isError: boolean,
  errorText?: string,
): McpCallToolResult {
  if (isError) {
    return {
      content: [{ type: "text", text: errorText ?? "Tool execution failed" }],
      isError: true,
    };
  }

  // If result is a string, wrap as text
  if (typeof result === "string") {
    return { content: [{ type: "text", text: result }] };
  }

  // If result has content[] (already MCP-shaped), pass through
  if (result && typeof result === "object" && Array.isArray((result as { content?: unknown[] }).content)) {
    return result as McpCallToolResult;
  }

  // If result has typed artifacts
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    // Check for content array from MCP consumer (Phase 48A)
    if (Array.isArray(r.content)) {
      return { content: r.content as McpContentItem[] };
    }
    // Check for artifacts array
    if (Array.isArray(r.artifacts)) {
      const items: McpContentItem[] = [];
      for (const a of r.artifacts as Array<Record<string, unknown>>) {
        if (a.kind === "text" && typeof a.content === "string") {
          items.push({ type: "text", text: a.content });
        } else if (a.kind === "file") {
          items.push({ type: "resource_link", uri: `vault://${a.vaultPath ?? ""}`, name: String(a.displayName ?? "file") });
        } else if (a.kind === "structured") {
          items.push({ type: "text", text: JSON.stringify(a.data ?? {}, null, 2) });
        }
      }
      if (items.length > 0) return { content: items };
    }
  }

  // Default: JSON-stringify the result
  return {
    content: [{
      type: "text",
      text: result && typeof result === "object" ? JSON.stringify(result, null, 2) : String(result ?? ""),
    }],
  };
}

// ─── MCP JSON-RPC server (stdio) ─────────────────────────────────────────────

function send(msg: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function sendError(id: string | number, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

// MCP error codes
const PARSE_ERROR = -32700;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

async function handleRequest(req: JsonRpcRequest, bridgeUrl: string): Promise<unknown> {
  switch (req.method) {
    case "initialize":
      return {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "envoymesh", version: "0.1.0" },
      };

    case "tools/list": {
      const tools = await bridgeListTools(bridgeUrl);
      return { tools };
    }

    case "tools/call": {
      const params = req.params ?? {};
      const toolName = params.name as string;
      const arguments_ = (params.arguments ?? {}) as Record<string, unknown>;
      if (!toolName || typeof toolName !== "string") {
        throw new Error("Missing required param: name");
      }
      const result = await bridgeExecuteTool(bridgeUrl, toolName, arguments_);
      return mapToolResultToMcpContent(result.result, !result.ok, result.error);
    }

    case "ping":
      return {};

    case "resources/list":
      return { resources: [] };

    case "prompts/list":
      return { prompts: [] };

    default:
      throw new Error(`Method not found: ${req.method}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { bridgeUrl: string } {
  let bridgeUrl = BRIDGE_DEFAULT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--bridge" || a === "-b") {
      bridgeUrl = argv[++i] ?? BRIDGE_DEFAULT;
    } else if (a.startsWith("--bridge=")) {
      bridgeUrl = a.slice("--bridge=".length);
    }
  }
  return { bridgeUrl };
}

async function main(): Promise<void> {
  const { bridgeUrl } = parseArgs(process.argv.slice(2));

  // Log to stderr only — stdout is reserved for MCP protocol.
  process.stderr.write(`[envoymesh-mcp-server] Bridge: ${bridgeUrl}\n`);

  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on("line", async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed);
    } catch {
      sendError(0, PARSE_ERROR, "Parse error");
      return;
    }

    // Skip notifications (no id)
    if (req.id === undefined || req.id === null) return;

    try {
      const result = await handleRequest(req, bridgeUrl);
      send({ jsonrpc: "2.0", id: req.id, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Method not found")) {
        sendError(req.id, METHOD_NOT_FOUND, msg);
      } else if (msg.includes("Missing required param")) {
        sendError(req.id, INVALID_PARAMS, msg);
      } else {
        sendError(req.id, INTERNAL_ERROR, msg);
      }
    }
  });

  // Clean shutdown
  const shutdown = (): void => {
    process.stderr.write("[envoymesh-mcp-server] Shutting down\n");
    rl.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  rl.on("close", shutdown);
}

// Run if invoked directly
const isMain = process.argv[1]?.endsWith("mcp-server-adapter.ts") ||
  process.argv[1]?.endsWith("mcp-server-adapter.js") ||
  process.argv[1]?.endsWith("mcp-server");

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[envoymesh-mcp-server] Fatal: ${err}\n`);
    process.exit(1);
  });
}

export { main, parseArgs, mapToolResultToMcpContent, handleRequest };
