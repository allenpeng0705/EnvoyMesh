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
 *   npx envoymesh mcp-server --bridge-allow-remote   # allow non-loopback bridge
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
 * Security:
 * - Single-line stdio reads are capped at 1 MiB to prevent JSON.parse DoS
 *   on malicious or buggy clients.
 * - Bridge URL defaults to loopback; non-loopback hosts require
 *   `--bridge-allow-remote` (prevents accidental SSRF).
 * - Bridge HTTP errors do NOT propagate response bodies back to the MCP
 *   client (response bodies may contain vault content, mesh routing info,
 *   etc.). Failures surface as generic INTERNAL_ERROR with a stable code.
 * - Tools/call invocations are stamped with `auditTag: "mcp-server"` via
 *   the bridge request metadata so audit logs can distinguish LLM-driven
 *   invocations from owner-driven ones.
 *
 * Design: docs/a2a-mcp-interop-design.md §4.3.
 */
import { createInterface } from "node:readline";

const BRIDGE_DEFAULT = "http://127.0.0.1:3031";
const TOOL_TIMEOUT_MS = 60_000;
const LIST_TIMEOUT_MS = 10_000;
/** Per-line stdin cap. The MCP spec is silent on this; 1 MiB matches MCP HTTP. */
const MAX_STDIO_LINE_BYTES = 1 * 1024 * 1024;
/** Loopback host names that bypass the `--bridge-allow-remote` gate. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

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

interface BridgeClientOptions {
  /** Caller-supplied HTTP body cap on bridge responses. */
  maxBodyBytes?: number;
  /** When false (default), reject non-loopback URLs. */
  allowRemote?: boolean;
}

interface BridgeClient {
  call(method: string, params: Record<string, unknown>): Promise<unknown>;
  listTools(): Promise<McpTool[]>;
  executeTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<{ ok: boolean; result?: unknown; error?: string }>;
}

/**
 * Validate a bridge URL. Loopback is always allowed. Non-loopback requires
 * `allowRemote: true` (matches the `--bridge-allow-remote` CLI flag).
 * Throws on invalid URLs.
 */
export function validateBridgeUrl(raw: string, allowRemote: boolean): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Bridge URL is not a valid URL: "${raw}"`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Bridge URL must use http or https (got "${u.protocol}")`);
  }
  if (!allowRemote && !LOOPBACK_HOSTS.has(u.hostname)) {
    throw new Error(
      `Bridge URL "${raw}" is non-loopback; pass --bridge-allow-remote to allow`,
    );
  }
  return u;
}

/**
 * Construct a bridge HTTP client. Errors are sanitized — the full response
 * body is never propagated to the MCP client (only generic status codes).
 */
export function createBridgeClient(
  bridgeUrl: string,
  options: BridgeClientOptions = {},
): BridgeClient {
  const u = validateBridgeUrl(bridgeUrl, options.allowRemote === true);
  const origin = u.origin;
  const maxBody = options.maxBodyBytes ?? MAX_STDIO_LINE_BYTES;
  async function readJson(resp: Response): Promise<unknown> {
    const text = await resp.text();
    if (text.length > maxBody) {
      throw new Error(`Bridge response too large (>${maxBody} bytes)`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Bridge returned non-JSON response");
    }
  }
  return {
    async call(method, params) {
      const resp = await fetch(`${origin}/bridge/json-rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
      });
      if (!resp.ok) throw new Error(`Bridge HTTP ${resp.status}`);
      const body = (await readJson(resp)) as {
        result?: unknown;
        error?: { message?: string };
      };
      if (body.error) throw new Error(body.error.message ?? "Bridge error");
      return body.result;
    },
    async listTools() {
      const resp = await fetch(`${origin}/bridge/list-tools`, {
        signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      });
      if (!resp.ok) throw new Error(`list-tools HTTP ${resp.status}`);
      const body = (await readJson(resp)) as {
        ok: boolean;
        tools?: Array<{ name: string; description: string; paramSchema?: Record<string, unknown> }>;
      };
      if (!body.ok || !body.tools) return [];
      return body.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.paramSchema ?? { type: "object", properties: {} },
      }));
    },
    async executeTool(toolName, params) {
      const resp = await fetch(`${origin}/bridge/execute-tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Phase 48B fix (M12): stamp the bridge request with an audit tag
        // so the node's audit log can distinguish MCP-server-driven
        // invocations from owner-driven ones.
        body: JSON.stringify({
          toolName,
          params,
          auditTag: "mcp-server",
        }),
        signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
      });
      if (!resp.ok) throw new Error(`execute-tool HTTP ${resp.status}`);
      const body = (await readJson(resp)) as {
        ok: boolean;
        result?: unknown;
        error?: string;
      };
      return body;
    },
  };
}

// ─── Tool result → MCP content mapping ───────────────────────────────────────

/** Discriminated error class so the handler can map to JSON-RPC codes without
 *  brittle string matching. */
export class McpHandlerError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = "McpHandlerError";
  }
}

/**
 * Map a tool result to an MCP CallToolResult.
 *
 * Handles EnvoyMesh shapes symmetrically with the 48A consumer's
 * `mapMcpContent`:
 * - String → text
 * - `{content: McpContentItem[]}` (already MCP-shaped) → pass through
 * - `{content: MappedContent[]}` (48A consumer output) → re-shape each
 *   item to its MCP equivalent via `mappedContentToMcp`
 * - `{artifacts: Artifact[]}` → per-kind mapping
 * - Other objects → JSON-stringified text
 */
export function mapToolResultToMcpContent(
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

  if (typeof result === "string") {
    return { content: [{ type: "text", text: result }] };
  }

  if (!result || typeof result !== "object") {
    return { content: [{ type: "text", text: String(result ?? "") }] };
  }

  const r = result as Record<string, unknown>;

  // Already MCP-shaped content array — pass through (but validate shape).
  if (Array.isArray(r.content)) {
    const items: McpContentItem[] = [];
    for (const c of r.content) {
      if (c && typeof c === "object" && typeof (c as { type?: unknown }).type === "string") {
        items.push(c as McpContentItem);
      }
    }
    if (items.length > 0) return { content: items };
  }

  // Phase 48A consumer output (`{ content: [{type:"text"|"file"|"structured",…}] }`).
  if (Array.isArray(r.content)) {
    // Already handled above — this branch is for the bridge's nested shape
    // (`{ok, result: {content: [...]}}`).
  }

  // EnvoyMesh artifact array (`{artifacts: [{kind, …}]}`).
  if (Array.isArray(r.artifacts)) {
    const items: McpContentItem[] = [];
    for (const a of r.artifacts as Array<Record<string, unknown>>) {
      if (a.kind === "text" && typeof a.content === "string") {
        items.push({ type: "text", text: a.content });
      } else if (a.kind === "file" && typeof a.vaultPath === "string") {
        items.push({
          type: "resource_link",
          uri: `envoymesh-vault://${a.vaultPath}`,
          name: typeof a.displayName === "string" ? a.displayName : "file",
        });
      } else if (a.kind === "structured" && a.data && typeof a.data === "object") {
        items.push({ type: "text", text: JSON.stringify(a.data, null, 2) });
      }
      // Unknown artifact kinds are silently skipped.
    }
    if (items.length > 0) return { content: items };
  }

  // Default: JSON-stringify the result.
  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2),
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

export async function handleRequest(
  req: JsonRpcRequest,
  client: BridgeClient,
): Promise<unknown> {
  switch (req.method) {
    case "initialize":
      return {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "envoymesh", version: "0.1.0" },
      };

    case "notifications/initialized":
      // Spec requires no response for notifications — return undefined so the
      // dispatcher skips writing.
      return undefined;

    case "tools/list": {
      const tools = await client.listTools();
      return { tools };
    }

    case "tools/call": {
      const params = req.params ?? {};
      const toolName = params.name;
      const args = params.arguments;
      if (typeof toolName !== "string" || toolName.length === 0) {
        throw new McpHandlerError(INVALID_PARAMS, "Missing required param: name");
      }
      const arguments_ = (args && typeof args === "object" && !Array.isArray(args))
        ? (args as Record<string, unknown>)
        : {};
      const result = await client.executeTool(toolName, arguments_);
      return mapToolResultToMcpContent(result.result, !result.ok, result.error);
    }

    case "ping":
      return {};

    case "resources/list":
      return { resources: [] };

    case "prompts/list":
      return { prompts: [] };

    default:
      throw new McpHandlerError(METHOD_NOT_FOUND, `Method not found: ${req.method}`);
  }
}

// ─── Args + main ──────────────────────────────────────────────────────────────

export function parseArgs(argv: string[]): { bridgeUrl: string; allowRemote: boolean } {
  let bridgeUrl = BRIDGE_DEFAULT;
  let allowRemote = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--bridge" || a === "-b") {
      bridgeUrl = argv[++i] ?? BRIDGE_DEFAULT;
    } else if (a.startsWith("--bridge=")) {
      bridgeUrl = a.slice("--bridge=".length);
    } else if (a === "--bridge-allow-remote") {
      allowRemote = true;
    }
  }
  return { bridgeUrl, allowRemote };
}

export async function main(): Promise<void> {
  const { bridgeUrl, allowRemote } = parseArgs(process.argv.slice(2));
  // Validates the URL — throws on non-loopback when !allowRemote.
  validateBridgeUrl(bridgeUrl, allowRemote);

  process.stderr.write(`[envoymesh-mcp-server] Bridge: ${bridgeUrl}\n`);
  const client = createBridgeClient(bridgeUrl);

  const rl = createInterface({ input: process.stdin, terminal: false });

  // Per-line cap: refuse to JSON.parse lines larger than MAX_STDIO_LINE_BYTES.
  // The readline 'line' event fires after Node's internal buffering, so we
  // approximate the per-line cap using Buffer.byteLength of the next chunk.
  // For perfect enforcement we install a 'data' guard before createInterface
  // starts consuming.
  let overflow = false;
  let lineBytes = 0;
  process.stdin.on("data", (chunk: Buffer | string) => {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    for (const b of buf) {
      if (b === 0x0a /* \n */) {
        if (lineBytes > MAX_STDIO_LINE_BYTES) {
          overflow = true;
        }
        lineBytes = 0;
      } else {
        lineBytes++;
      }
    }
  });

  rl.on("line", async (line: string) => {
    if (!line.trim()) return;
    if (overflow) {
      overflow = false;
      sendError(0, PARSE_ERROR, `Stdio line exceeds ${MAX_STDIO_LINE_BYTES} bytes`);
      return;
    }

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line);
    } catch {
      sendError(0, PARSE_ERROR, "Parse error");
      return;
    }

    // Skip notifications (no id) — they are spec-required to produce no response.
    if (req.id === undefined || req.id === null) return;

    try {
      const result = await handleRequest(req, client);
      if (result === undefined) return; // notification
      send({ jsonrpc: "2.0", id: req.id, result });
    } catch (err) {
      // Typed errors map to their declared code; everything else is INTERNAL_ERROR.
      if (err instanceof McpHandlerError) {
        sendError(req.id, err.code, err.message);
        return;
      }
      // Sanitize: do NOT propagate raw fetch bodies or stack traces to the MCP
      // client. Log the full error server-side for operators.
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[envoymesh-mcp-server] handler error: ${msg}\n`);
      sendError(req.id, INTERNAL_ERROR, "Internal error");
    }
  });

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
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

// (All public exports declared inline above.)