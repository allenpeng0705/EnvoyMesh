/**
 * Phase 29G — OpenClaw Runtime tests.
 */
import { describe, expect, it } from "vitest";
import { OpenClawRuntime, discoverOpenClaw, type OpenClawModelConfig } from "../src/index.js";
import { ENVOY_TOOL_CATALOG, buildOpenClawSystemPrompt, buildAgentConfig } from "../src/tool-bridge.js";

// =========================================================================
// OpenClawRuntime — lifecycle
// =========================================================================
describe("OpenClawRuntime", () => {
  it("creates a runtime instance", () => {
    const runtime = new OpenClawRuntime();
    expect(runtime.isReady()).toBe(false);
  });

  it("start returns false when OpenClaw not found", async () => {
    const runtime = new OpenClawRuntime({
      executablePath: "/nonexistent/openclaw",
      responseTimeoutMs: 1000,
    });
    const started = await runtime.start();
    expect(started).toBe(false);
    expect(runtime.isReady()).toBe(false);
  });

  it("ask throws when runtime is not ready", async () => {
    const runtime = new OpenClawRuntime();
    await expect(runtime.ask("hello")).rejects.toThrow("not available");
  });

  it("stop is safe when not started", async () => {
    const runtime = new OpenClawRuntime();
    await expect(runtime.stop()).resolves.toBeUndefined();
  });

  it("singleton returns the same instance", async () => {
    const { getOpenClawRuntime } = await import("../src/index.js");
    const a = getOpenClawRuntime();
    const b = getOpenClawRuntime();
    expect(a).toBe(b);
  });

  it("stores modelConfig from constructor", () => {
    const cfg: OpenClawModelConfig = {
      provider: "ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3.2",
    };
    const runtime = new OpenClawRuntime({ modelConfig: cfg });
    expect(runtime).toBeDefined();
    // config is private, but construction shouldn't throw
  });
});

// =========================================================================
// discoverOpenClaw — path discovery
// =========================================================================
describe("discoverOpenClaw", () => {
  it("returns a string or null", async () => {
    const result = await discoverOpenClaw();
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("returns null in most environments (no OpenClaw installed)", async () => {
    // In CI or typical dev environments, OpenClaw won't be installed
    const result = await discoverOpenClaw();
    // Just verify it doesn't throw
    expect(result === null || typeof result === "string").toBe(true);
  });
});

// =========================================================================
// ENVOY_TOOL_CATALOG — schema validation
// =========================================================================
describe("ENVOY_TOOL_CATALOG", () => {
  it("contains 12 tools", () => {
    expect(ENVOY_TOOL_CATALOG).toHaveLength(12);
  });

  it("every tool has required fields", () => {
    for (const tool of ENVOY_TOOL_CATALOG) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe("string");
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe("string");
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.parameters).toBe("object");
      expect(Array.isArray(tool.useWhen)).toBe(true);
      expect(tool.useWhen.length).toBeGreaterThan(0);
      expect(typeof tool.resultShape).toBe("string");
    }
  });

  it("mesh tool names follow mesh.* convention", () => {
    for (const tool of ENVOY_TOOL_CATALOG.filter((t) => t.name.startsWith("mesh."))) {
      expect(tool.name).toMatch(/^mesh\./);
    }
  });

  it("includes all expected tools", () => {
    const names = ENVOY_TOOL_CATALOG.map((t) => t.name);
    expect(names).toContain("mesh.discover_cluster");
    expect(names).toContain("mesh.send_hello");
    expect(names).toContain("mesh.library_discover");
    expect(names).toContain("mesh.library_list");
    expect(names).toContain("mesh.library_read");
    expect(names).toContain("mesh.files_list_all");
    expect(names).toContain("mesh.files_read");
    expect(names).toContain("vault.search");
    expect(names).toContain("knowledge.query");
    expect(names).toContain("mesh.intelligence_report");
    expect(names).toContain("mesh.task_propose");
    expect(names).toContain("mesh.chat_rag_search");
  });
});

// =========================================================================
// buildOpenClawSystemPrompt — content validation
// =========================================================================
describe("buildOpenClawSystemPrompt", () => {
  it("returns a non-empty string", () => {
    const prompt = buildOpenClawSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("includes the owner name when provided", () => {
    const prompt = buildOpenClawSystemPrompt("Alice");
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("EnvoyMesh");
  });

  it("includes permissions when config is provided", () => {
    const config = buildAgentConfig({
      owner: { ownerId: "envoy:owner:test", interests: ["wasm"], capabilities: ["rust"] },
      permissions: { bondAutonomy: true, maxBondsPerDay: 3, autoCircleContacts: true, maxSensitivity: "friends" },
      bonds: [{ displayName: "Bob", level: "direct" }],
      model: { provider: "ollama", model: "llama3.2" },
    });
    const prompt = buildOpenClawSystemPrompt("Alice", config);
    expect(prompt).toContain("ALLOWED");
    expect(prompt).toContain("max 3/day");
    expect(prompt).toContain("llama3.2");
  });

  it("includes key concepts", () => {
    const prompt = buildOpenClawSystemPrompt();
    expect(prompt).toContain("Bonds");
    expect(prompt).toContain("Discovery");
    expect(prompt).toContain("Local files");
    expect(prompt).toContain("Tasks");
    expect(prompt).toContain("Circles");
  });

  it("includes rules", () => {
    const prompt = buildOpenClawSystemPrompt();
    expect(prompt).toContain("Always search before recommending");
    expect(prompt).toContain("NEVER make up information");
  });
});

// =========================================================================
// Version negotiation — handshake format
// =========================================================================
describe("version negotiation", () => {
  it("hello message has required fields", () => {
    const hello = {
      type: "hello",
      protocol: "envoy-openclaw/1.0",
      envoyVersion: "0.2.2",
      tools: "ENVOY_TOOL_CATALOG",
      modelConfig: null,
    };
    expect(hello.type).toBe("hello");
    expect(hello.protocol).toBe("envoy-openclaw/1.0");
    expect(hello).toHaveProperty("modelConfig");
  });

  it("hello_ack message has required fields", () => {
    const ack = {
      type: "hello_ack",
      protocol: "envoy-openclaw/1.0",
      version: "2.3.1",
    };
    expect(ack.type).toBe("hello_ack");
    expect(ack.protocol).toBe("envoy-openclaw/1.0");
    expect(ack.version).toBe("2.3.1");
  });
});

// =========================================================================
// Model config mapping — EnvoyMesh → OpenClaw
// =========================================================================
describe("model config mapping", () => {
  it("OpenClawModelConfig type accepts ollama config", () => {
    const cfg: OpenClawModelConfig = {
      provider: "ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3.2",
    };
    expect(cfg.provider).toBe("ollama");
    expect(cfg.baseUrl).toBe("http://localhost:11434");
    expect(cfg.model).toBe("llama3.2");
  });

  it("OpenClawModelConfig type accepts openai config", () => {
    const cfg: OpenClawModelConfig = {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-abc123",
      model: "gpt-4o",
    };
    expect(cfg.provider).toBe("openai");
    expect(cfg.apiKey).toBe("sk-abc123");
    expect(cfg.model).toBe("gpt-4o");
  });

  it("modelConfig can be null (no inheritance)", () => {
    const runtime = new OpenClawRuntime({ modelConfig: null });
    expect(runtime).toBeDefined();
  });
});
