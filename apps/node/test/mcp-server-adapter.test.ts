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
  validateBridgeUrl,
  createBridgeClient,
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
    expect(result.content[1]!.type).toBe("image");
    expect(result.content[1]!.data).toBe("iVBOR");
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

describe("validateBridgeUrl", () => {
  it("accepts loopback http URL", () => {
    const u = validateBridgeUrl("http://127.0.0.1:3031", false);
    expect(u.hostname).toBe("127.0.0.1");
  });

  it("accepts loopback https URL", () => {
    const u = validateBridgeUrl("https://localhost:3031", false);
    expect(u.hostname).toBe("localhost");
  });

  it("rejects non-loopback host without allowRemote", () => {
    expect(() => validateBridgeUrl("http://example.com:3031", false))
      .toThrow(/non-loopback.*--bridge-allow-remote/);
  });

  it("accepts non-loopback host with allowRemote: true", () => {
    const u = validateBridgeUrl("https://bridge.example.com", true);
    expect(u.hostname).toBe("bridge.example.com");
  });

  it("rejects non-http/https schemes", () => {
    expect(() => validateBridgeUrl("ftp://127.0.0.1:3031", false))
      .toThrow(/http or https/);
  });

  it("rejects invalid URLs", () => {
    expect(() => validateBridgeUrl("not-a-url", false)).toThrow(/not a valid URL/);
  });
});

describe("parseArgs", () => {
  it("parses --bridge", () => {
    expect(parseArgs(["--bridge", "http://127.0.0.1:8080"])).toEqual({
      bridgeUrl: "http://127.0.0.1:8080",
      allowRemote: false,
    });
  });

  it("parses --bridge= form", () => {
    expect(parseArgs(["--bridge=http://localhost:9000"])).toEqual({
      bridgeUrl: "http://localhost:9000",
      allowRemote: false,
    });
  });

  it("parses --bridge-allow-remote", () => {
    expect(parseArgs(["--bridge", "http://x.example.com", "--bridge-allow-remote"])).toEqual({
      bridgeUrl: "http://x.example.com",
      allowRemote: true,
    });
  });

  it("parses --bridge-token", () => {
    expect(parseArgs(["--bridge-token", "s3cret"])).toEqual({
      bridgeUrl: "http://127.0.0.1:3031",
      allowRemote: false,
      bridgeToken: "s3cret",
    });
  });

  it("defaults to loopback bridge", () => {
    expect(parseArgs([])).toEqual({
      bridgeUrl: "http://127.0.0.1:3031",
      allowRemote: false,
    });
  });
});

describe("createBridgeClient", () => {
  it("throws on non-loopback URL without allowRemote", () => {
    expect(() => createBridgeClient("http://evil.example.com"))
      .toThrow(/non-loopback/);
  });

  it("accepts non-loopback when allowRemote: true", () => {
    const c = createBridgeClient("http://x.example.com", { allowRemote: true });
    expect(typeof c.call).toBe("function");
  });

  it("returns a client with call/listTools/executeTool methods", () => {
    const c = createBridgeClient("http://127.0.0.1:3031");
    expect(typeof c.call).toBe("function");
    expect(typeof c.listTools).toBe("function");
    expect(typeof c.executeTool).toBe("function");
  });
});

describe("mapToolResultToMcpContent (symmetric with 48A)", () => {
  it("re-shapes 48A consumer file output to MCP ImageContent/AudioContent", () => {
    const result = mapToolResultToMcpContent({
      content: [
        { type: "file", mimeType: "image/png", base64: "abc" },
        { type: "file", mimeType: "audio/ogg", base64: "def" },
        { type: "structured", data: { x: 1 } },
      ],
    }, false);
    expect(result.content[0]).toMatchObject({ type: "image", data: "abc", mimeType: "image/png" });
    expect(result.content[1]).toMatchObject({ type: "audio", data: "def", mimeType: "audio/ogg" });
    expect(result.content[2]).toMatchObject({ type: "text", text: JSON.stringify({ x: 1 }) });
  });

  it("handles null result safely", () => {
    const result = mapToolResultToMcpContent(null, false);
    expect(result.content[0]?.type).toBe("text");
  });

  it("handles malformed content array by ignoring non-object items", () => {
    const result = mapToolResultToMcpContent({
      content: [null, "string", 42, { type: "text", text: "ok" }],
    }, false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: "text", text: "ok" });
  });
});
