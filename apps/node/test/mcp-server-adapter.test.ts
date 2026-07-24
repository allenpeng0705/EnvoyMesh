/**
 * @vitest-environment node
 *
 * Phase 48B — MCP Server Adapter unit tests.
 *
 * Tests the tool result → MCP content mapping and the JSON-RPC
 * handler logic without needing a real stdio connection or a
 * running node bridge.
 */
import { describe, it, expect } from "vitest";
import {
  mapToolResultToMcpContent,
  parseArgs,
  handleRequest,
} from "../src/mcp-server-adapter.js";

describe("mapToolResultToMcpContent", () => {
  it("maps error result", () => {
    const result = mapToolResultToMcpContent(undefined, true, "Tool failed");
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: "text", text: "Tool failed" });
  });

  it("maps string result to text", () => {
    const result = mapToolResultToMcpContent("hello world", false);
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: "text", text: "hello world" });
  });

  it("passes through MCP-shaped content", () => {
    const mcpResult = { content: [{ type: "text", text: "ok" }] };
    const result = mapToolResultToMcpContent(mcpResult, false);
    expect(result.content).toEqual([{ type: "text", text: "ok" }]);
  });

  it("maps content array from Phase 48A consumer", () => {
    const consumerResult = {
      content: [
        { type: "text", text: "file: test.txt" },
        { type: "file", mimeType: "image/png", base64: "iVBOR" },
      ],
    };
    const result = mapToolResultToMcpContent(consumerResult, false);
    expect(result.content).toHaveLength(2);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[1]!.type).toBe("file");
  });

  it("maps artifacts array (text kind)", () => {
    const artifactResult = {
      artifacts: [{ kind: "text", content: "# Hello" }],
    };
    const result = mapToolResultToMcpContent(artifactResult, false);
    expect(result.content[0]).toEqual({ type: "text", text: "# Hello" });
  });

  it("maps artifacts array (file kind)", () => {
    const artifactResult = {
      artifacts: [{ kind: "file", vaultPath: "docs/readme.md", displayName: "readme.md" }],
    };
    const result = mapToolResultToMcpContent(artifactResult, false);
    expect(result.content[0]!.type).toBe("resource_link");
    expect(result.content[0]!.uri).toContain("vault://docs/readme.md");
  });

  it("maps artifacts array (structured kind)", () => {
    const artifactResult = {
      artifacts: [{ kind: "structured", data: { key: "value" } }],
    };
    const result = mapToolResultToMcpContent(artifactResult, false);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toContain('"key": "value"');
  });

  it("JSON-stringifies unknown object result", () => {
    const obj = { foo: 1, bar: "baz" };
    const result = mapToolResultToMcpContent(obj, false);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toContain('"foo": 1');
  });

  it("handles null/undefined result", () => {
    const result = mapToolResultToMcpContent(null, false);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toBe("");
  });
});

describe("parseArgs", () => {
  it("defaults bridge URL", () => {
    const result = parseArgs([]);
    expect(result.bridgeUrl).toBe("http://127.0.0.1:3031");
  });

  it("parses --bridge flag", () => {
    const result = parseArgs(["--bridge", "http://localhost:9999"]);
    expect(result.bridgeUrl).toBe("http://localhost:9999");
  });

  it("parses --bridge=value form", () => {
    const result = parseArgs(["--bridge=http://10.0.0.1:3031"]);
    expect(result.bridgeUrl).toBe("http://10.0.0.1:3031");
  });

  it("parses -b short flag", () => {
    const result = parseArgs(["-b", "http://relay:3031"]);
    expect(result.bridgeUrl).toBe("http://relay:3031");
  });
});

describe("handleRequest", () => {
  const bridgeUrl = "http://127.0.0.1:3031";

  it("returns initialize result", async () => {
    const result = await handleRequest(
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      bridgeUrl,
    );
    expect(result).toMatchObject({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "envoymesh", version: "0.1.0" },
    });
  });

  it("returns empty result for ping", async () => {
    const result = await handleRequest(
      { jsonrpc: "2.0", id: 2, method: "ping" },
      bridgeUrl,
    );
    expect(result).toEqual({});
  });

  it("returns empty resources/prompts", async () => {
    const resources = await handleRequest(
      { jsonrpc: "2.0", id: 3, method: "resources/list" },
      bridgeUrl,
    );
    expect(resources).toEqual({ resources: [] });

    const prompts = await handleRequest(
      { jsonrpc: "2.0", id: 4, method: "prompts/list" },
      bridgeUrl,
    );
    expect(prompts).toEqual({ prompts: [] });
  });

  it("throws on unknown method", async () => {
    await expect(
      handleRequest({ jsonrpc: "2.0", id: 5, method: "unknown/method" }, bridgeUrl),
    ).rejects.toThrow("Method not found");
  });

  it("throws on missing tool name", async () => {
    await expect(
      handleRequest(
        { jsonrpc: "2.0", id: 6, method: "tools/call", params: { arguments: {} } },
        bridgeUrl,
      ),
    ).rejects.toThrow("Missing required param: name");
  });
});
