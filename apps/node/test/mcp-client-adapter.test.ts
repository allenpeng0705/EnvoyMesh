/**
 * @vitest-environment node
 *
 * Phase 48A — MCP Client Adapter unit tests.
 *
 * Tests the content mapping (MCP SDK types → EnvoyMesh shapes) and
 * the manager behavior (no-op, list, call) without needing real MCP
 * servers or the OpenClaw runtime.
 */
import { describe, it, expect } from "vitest";
import {
  mapMcpContent,
  createNoOpMcpConsumerManager,
  createMcpConsumerManager,
  type McpConsumerConfig,
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

  it("maps embedded resource", () => {
    const result = mapMcpContent([
      { type: "resource", resource: { uri: "file:///bar.md", text: "# bar", mimeType: "text/markdown" } },
    ]);
    expect(result).toEqual([
      { type: "structured", data: { uri: "file:///bar.md", text: "# bar", mimeType: "text/markdown" } },
    ]);
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
  it("returns no-op manager for empty configs", () => {
    const mgr = createMcpConsumerManager([]);
    // Should behave like the no-op — lazy init never triggers
    expect(mgr).toBeDefined();
  });

  it("returns real manager for non-empty configs", () => {
    const configs: McpConsumerConfig[] = [
      { name: "test-server", transport: "stdio", command: "echo" },
    ];
    const mgr = createMcpConsumerManager(configs);
    expect(mgr).toBeDefined();
    // Don't call listMcpTools — that would try to import the openclaw
    // runtime which requires the full SDK. The manager is tested via
    // its factory behavior (returns non-undefined) not its runtime calls.
  });

  it("callMcpTool rejects unknown server name", async () => {
    const configs: McpConsumerConfig[] = [
      { name: "known-server", transport: "stdio", command: "echo" },
    ];
    const mgr = createMcpConsumerManager(configs);
    const result = await mgr.callMcpTool("unknown-server", "tool", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown MCP server: unknown-server");
    expect(result.error).toContain("known-server");
  });

  it("listMcpTools rejects unknown server name", async () => {
    const configs: McpConsumerConfig[] = [
      { name: "known-server", transport: "stdio", command: "echo" },
    ];
    const mgr = createMcpConsumerManager(configs);
    const result = await mgr.listMcpTools("unknown-server");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown MCP server: unknown-server");
  });
});
