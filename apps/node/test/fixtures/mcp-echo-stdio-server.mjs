#!/usr/bin/env node
/**
 * Minimal MCP stdio echo server for Phase 48D.5 live consumer tests.
 * Speaks the same protocol Claude Desktop / the SDK Client use over stdio.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "envoymesh-echo-fixture", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      description: "Echo text back",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const text = String(req.params.arguments?.text ?? "");
  return {
    content: [{ type: "text", text: `echo:${text}` }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
