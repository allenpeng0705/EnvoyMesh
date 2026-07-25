/**
 * @vitest-environment node
 *
 * Phase 48D.5 — live MCP stdio integration.
 *
 * 1) Consumer (48A): real SDK Client → fixture MCP stdio server
 * 2) Server adapter (48B / Claude Desktop path): SDK Client →
 *    mcp-server-adapter.ts stdio → mock node bridge HTTP
 */
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMcpConsumerManager } from "../src/mcp-client-adapter.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(HERE, "../../..");
const ECHO_FIXTURE = join(HERE, "fixtures/mcp-echo-stdio-server.mjs");
const MCP_SERVER_ADAPTER = join(HERE, "../src/mcp-server-adapter.ts");
const TSX = join(WORKSPACE, "node_modules/.bin/tsx");

async function listen(): Promise<{ port: number; close: () => Promise<void>; url: string }> {
  const server = createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (req.method === "GET" && path === "/bridge/list-tools") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        tools: [
          {
            name: "mesh.ping",
            description: "Ping the mesh",
            paramSchema: { type: "object", properties: {} },
            requiresApproval: false,
            isMeshTool: true,
          },
        ],
      }));
      return;
    }
    if (req.method === "POST" && path === "/bridge/execute-tool") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        toolName?: string;
        params?: Record<string, unknown>;
        auditTag?: string;
      };
      expect(body.auditTag).toBe("mcp-server");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        result: `pong:${body.toolName ?? "?"}`,
      }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return {
    port: addr.port,
    url: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

describe("48D.5 live MCP stdio — consumer (48A)", () => {
  it("lists and calls tools over real stdio transport", async () => {
    const mgr = createMcpConsumerManager([
      {
        name: "echo-fixture",
        transport: "stdio",
        command: process.execPath,
        args: [ECHO_FIXTURE],
        requestTimeoutMs: 15_000,
      },
    ]);
    try {
      const listed = await mgr.listMcpTools("echo-fixture");
      expect(listed.ok).toBe(true);
      expect(listed.tools?.some((t) => t.toolName === "echo")).toBe(true);

      const called = await mgr.callMcpTool("echo-fixture", "echo", { text: "hello" });
      expect(called.ok).toBe(true);
      expect(called.content?.[0]).toMatchObject({ type: "text", text: "echo:hello" });
    } finally {
      await mgr.dispose();
    }
  }, 30_000);
});

describe("48D.5 live MCP stdio — server adapter (Claude Desktop path)", () => {
  let bridge: Awaited<ReturnType<typeof listen>>;

  beforeAll(async () => {
    bridge = await listen();
  });

  afterAll(async () => {
    await bridge.close();
  });

  it("SDK Client ↔ mcp-server-adapter stdio ↔ bridge HTTP", async () => {
    const transport = new StdioClientTransport({
      command: TSX,
      args: [MCP_SERVER_ADAPTER, "--bridge", bridge.url],
      cwd: WORKSPACE,
      stderr: "pipe",
    });
    const client = new Client({ name: "48d5-stdio-probe", version: "0.1.0" });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools?.some((t) => t.name === "mesh.ping")).toBe(true);

      const result = await client.callTool({ name: "mesh.ping", arguments: {} });
      const content = Array.isArray(result.content) ? result.content : [];
      expect(content[0]).toMatchObject({ type: "text", text: "pong:mesh.ping" });
    } finally {
      await client.close().catch(() => {});
    }
  }, 45_000);
});
