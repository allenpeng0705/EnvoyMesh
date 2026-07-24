/**
 * @vitest-environment node
 *
 * Phase 48A — MCP Client Adapter unit tests.
 *
 * Tests:
 * - Content mapping (MCP SDK types → EnvoyMesh shapes) including edge cases
 * - Reverse mapping (EnvoyMesh → MCP) for the bridge round-trip
 * - Config validation (SSRF guards, stdio shape, transport values)
 * - Manager behavior (no-op, list, call, unknown server, executor throwing)
 */
import { describe, it, expect, vi } from "vitest";
import {
  mapMcpContent,
  mappedContentToMcp,
  createNoOpMcpConsumerManager,
  createMcpConsumerManager,
  validateMcpConsumerConfigs,
  type McpConsumerConfig,
  type McpExecutor,
} from "../src/mcp-client-adapter.js";

describe("mapMcpContent", () => {
  it("maps TextContent", () => {
    const result = mapMcpContent([{ type: "text", text: "hello world" }]);
    expect(result).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("maps ImageContent", () => {
    const result = mapMcpContent([
      { type: "image", data: "iVBOR...", mimeType: "image/png" },
    ]);
    expect(result).toEqual([
      { type: "file", mimeType: "image/png", base64: "iVBOR...", filename: undefined },
    ]);
  });

  it("maps ImageContent with filename", () => {
    const result = mapMcpContent([
      { type: "image", data: "iVBOR...", mimeType: "image/png", filename: "screenshot.png" },
    ]);
    expect(result[0]).toMatchObject({ filename: "screenshot.png" });
  });

  it("maps AudioContent", () => {
    const result = mapMcpContent([
      { type: "audio", data: "UklGR...", mimeType: "audio/wav" },
    ]);
    expect(result).toEqual([
      { type: "file", mimeType: "audio/wav", base64: "UklGR..." },
    ]);
  });

  it("maps resource_link", () => {
    const result = mapMcpContent([
      { type: "resource_link", uri: "file:///foo.txt", name: "foo.txt" },
    ]);
    expect(result).toEqual([
      { type: "structured", data: { uri: "file:///foo.txt", name: "foo.txt" } },
    ]);
  });

  it("drops resource_link with empty uri (invalid per spec)", () => {
    const result = mapMcpContent([{ type: "resource_link", uri: "", name: "x" }]);
    expect(result).toHaveLength(0);
  });

  it("maps embedded resource", () => {
    const result = mapMcpContent([
      { type: "resource", resource: { uri: "file:///bar.md", text: "# bar", mimeType: "text/markdown" } },
    ]);
    expect(result).toEqual([
      { type: "structured", data: { uri: "file:///bar.md", text: "# bar", mimeType: "text/markdown" } },
    ]);
  });

  it("drops embedded resource with empty uri", () => {
    const result = mapMcpContent([
      { type: "resource", resource: { uri: "", text: "x" } },
    ]);
    expect(result).toHaveLength(0);
  });

  it("handles mixed content", () => {
    const result = mapMcpContent([
      { type: "text", text: "Result:" },
      { type: "image", data: "iVBOR", mimeType: "image/png" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe("text");
    expect(result[1]!.type).toBe("file");
  });

  it("silently skips unknown content types", () => {
    const result = mapMcpContent([
      { type: "video", data: "abc", mimeType: "video/mp4" },
      { type: "text", text: "ok" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("text");
  });

  it("returns empty array for empty input", () => {
    expect(mapMcpContent([])).toEqual([]);
  });

  it("handles text with missing text field", () => {
    const result = mapMcpContent([{ type: "text" }]);
    expect(result).toHaveLength(0);
  });

  it("handles image with missing data field", () => {
    const result = mapMcpContent([{ type: "image", mimeType: "image/png" }]);
    expect(result).toHaveLength(0);
  });

  it("skips non-object items", () => {
    const result = mapMcpContent([null as unknown as Record<string, unknown>, "string" as unknown as Record<string, unknown>]);
    expect(result).toHaveLength(0);
  });
});

describe("mappedContentToMcp (reverse)", () => {
  it("emits TextContent for text items", () => {
    const out = mappedContentToMcp([{ type: "text", text: "hi" }]);
    expect(out).toEqual([{ type: "text", text: "hi" }]);
  });

  it("emits ImageContent for image/* files", () => {
    const out = mappedContentToMcp([
      { type: "file", mimeType: "image/png", base64: "abc", filename: "x.png" },
    ]);
    expect(out).toEqual([{ type: "image", data: "abc", mimeType: "image/png", filename: "x.png" }]);
  });

  it("emits AudioContent for audio/* files", () => {
    const out = mappedContentToMcp([
      { type: "file", mimeType: "audio/ogg", base64: "abc" },
    ]);
    expect(out).toEqual([{ type: "audio", data: "abc", mimeType: "audio/ogg" }]);
  });

  it("falls back to embedded resource for non-image/audio files", () => {
    const out = mappedContentToMcp([
      { type: "file", mimeType: "application/pdf", base64: "abc", filename: "x.pdf" },
    ]);
    expect(out[0]).toMatchObject({
      type: "resource",
      resource: { uri: "file://x.pdf", mimeType: "application/pdf", blob: "abc" },
    });
  });

  it("emits TextContent with JSON for structured items", () => {
    const out = mappedContentToMcp([
      { type: "structured", data: { a: 1, b: "x" } },
    ]);
    expect(out).toEqual([{ type: "text", text: JSON.stringify({ a: 1, b: "x" }) }]);
  });
});

describe("validateMcpConsumerConfigs", () => {
  it("accepts a valid stdio entry", () => {
    const r = validateMcpConsumerConfigs([{ name: "fs", transport: "stdio", command: "npx" }]);
    expect(r.ok).toBe(true);
  });

  it("accepts a valid http entry with loopback URL", () => {
    const r = validateMcpConsumerConfigs([{ name: "remote", transport: "http", url: "https://localhost:8080/mcp" }]);
    expect(r.ok).toBe(true);
  });

  it("rejects remote http URL without allowRemoteHttp", () => {
    const r = validateMcpConsumerConfigs([{ name: "x", transport: "http", url: "https://example.com/mcp" }]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/remote host.*example\.com/);
  });

  it("accepts remote http URL with allowRemoteHttp: true", () => {
    const r = validateMcpConsumerConfigs([
      { name: "x", transport: "http", url: "https://example.com/mcp", allowRemoteHttp: true },
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejects non-https URL", () => {
    const r = validateMcpConsumerConfigs([
      { name: "x", transport: "http", url: "http://example.com/mcp", allowRemoteHttp: true },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/unsupported scheme/);
  });

  it("rejects missing name", () => {
    const r = validateMcpConsumerConfigs([{ transport: "stdio", command: "npx" }]);
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate names", () => {
    const r = validateMcpConsumerConfigs([
      { name: "dup", transport: "stdio", command: "npx" },
      { name: "dup", transport: "stdio", command: "npx" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/duplicate/);
  });

  it("rejects stdio without command", () => {
    const r = validateMcpConsumerConfigs([{ name: "x", transport: "stdio" }]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/command: required/);
  });

  it("rejects http without url", () => {
    const r = validateMcpConsumerConfigs([{ name: "x", transport: "http" }]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/url: required/);
  });

  it("rejects invalid timeout range", () => {
    const r1 = validateMcpConsumerConfigs([{ name: "x", transport: "stdio", command: "npx", requestTimeoutMs: 0 }]);
    expect(r1.ok).toBe(false);
    const r2 = validateMcpConsumerConfigs([{ name: "x", transport: "stdio", command: "npx", requestTimeoutMs: 1_000_000 }]);
    expect(r2.ok).toBe(false);
  });

  it("rejects allowRemoteHttp on stdio entries", () => {
    const r = validateMcpConsumerConfigs([
      { name: "x", transport: "stdio", command: "npx", allowRemoteHttp: true },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("createNoOpMcpConsumerManager", () => {
  const mgr = createNoOpMcpConsumerManager();

  it("listMcpTools returns error", async () => {
    const result = await mgr.listMcpTools();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No MCP consumers configured");
  });

  it("callMcpTool returns error", async () => {
    const result = await mgr.callMcpTool("test", "tool", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No MCP consumers configured");
  });
});

describe("createMcpConsumerManager", () => {
  const noopExecutor: McpExecutor = async () => undefined;

  it("returns no-op manager for empty configs", async () => {
    const mgr = createMcpConsumerManager([], noopExecutor);
    const r = await mgr.listMcpTools();
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No MCP consumers configured");
  });

  it("throws when no executor is supplied", () => {
    expect(() => createMcpConsumerManager(
      [{ name: "x", transport: "stdio", command: "echo" }],
      null as unknown as McpExecutor,
    )).toThrow(/executor/);
  });

  it("throws on invalid configs", () => {
    expect(() => createMcpConsumerManager(
      [{ transport: "stdio" }] as unknown as McpConsumerConfig[],
      noopExecutor,
    )).toThrow(/Invalid mcpConsumers/);
  });

  it("callMcpTool rejects unknown server name", async () => {
    const configs: McpConsumerConfig[] = [
      { name: "known-server", transport: "stdio", command: "echo" },
    ];
    const mgr = createMcpConsumerManager(configs, noopExecutor);
    const result = await mgr.callMcpTool("unknown-server", "tool", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown MCP server: unknown-server");
    expect(result.error).toContain("known-server");
  });

  it("listMcpTools rejects unknown server name", async () => {
    const configs: McpConsumerConfig[] = [
      { name: "known-server", transport: "stdio", command: "echo" },
    ];
    const mgr = createMcpConsumerManager(configs, noopExecutor);
    const result = await mgr.listMcpTools("unknown-server");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown MCP server: unknown-server");
  });

  it("listMcpTools invokes the executor and unwraps the result", async () => {
    const executor = vi.fn(async () => ({
      ok: true,
      result: {
        tools: [{ serverName: "fs", toolName: "read_file", description: "Read a file" }],
      },
    }));
    const mgr = createMcpConsumerManager(
      [{ name: "fs", transport: "stdio", command: "echo" }],
      executor,
    );
    const r = await mgr.listMcpTools();
    expect(r.ok).toBe(true);
    expect(r.tools?.length).toBe(1);
    expect(executor).toHaveBeenCalledWith("mesh.mcp.list_tools", { serverName: undefined });
  });

  it("callMcpTool maps executor result content back to EnvoyMesh shapes", async () => {
    const executor = vi.fn(async () => ({
      ok: true,
      result: {
        content: [
          { type: "text", text: "result text" },
          { type: "image", data: "img-base64", mimeType: "image/jpeg" },
        ],
        structuredContent: { confidence: 0.9 },
      },
    }));
    const mgr = createMcpConsumerManager(
      [{ name: "fs", transport: "stdio", command: "echo" }],
      executor,
    );
    const r = await mgr.callMcpTool("fs", "read_file", { path: "/tmp/x" });
    expect(r.ok).toBe(true);
    expect(r.content?.[0]).toMatchObject({ type: "text", text: "result text" });
    expect(r.content?.[1]).toMatchObject({ type: "file", mimeType: "image/jpeg", base64: "img-base64" });
    expect(r.structuredContent).toEqual({ confidence: 0.9 });
    expect(executor).toHaveBeenCalledWith("mesh.mcp.call_tool", {
      serverName: "fs",
      toolName: "read_file",
      arguments: { path: "/tmp/x" },
    });
  });

  it("callMcpTool surfaces executor errors without leaking internals", async () => {
    const executor = vi.fn(async () => { throw new Error("internal path /secret/foo"); });
    const mgr = createMcpConsumerManager(
      [{ name: "fs", transport: "stdio", command: "echo" }],
      executor,
    );
    const r = await mgr.callMcpTool("fs", "read_file", {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("MCP call_tool failed");
  });

  it("callMcpTool returns ok=false when executor returns ok:false", async () => {
    const executor = vi.fn(async () => ({ ok: false, error: "permission denied" }));
    const mgr = createMcpConsumerManager(
      [{ name: "fs", transport: "stdio", command: "echo" }],
      executor,
    );
    const r = await mgr.callMcpTool("fs", "read_file", {});
    expect(r.ok).toBe(false);
    expect(r.error).toBe("permission denied");
  });
});