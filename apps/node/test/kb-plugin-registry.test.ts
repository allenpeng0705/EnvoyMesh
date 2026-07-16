/**
 * Phase 44C — Plugin registry tests.
 *
 * Tests the full plugin lifecycle:
 * - register, activate, deactivate, unregister
 * - per-plugin config persistence (disk I/O mocked)
 * - enrichMetadata with graceful degradation
 * - list filtering
 * - error states
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPluginRegistry, type PluginRegistry } from "../src/kb-plugin-registry.js";
import type { KnowledgeBasePlugin, KbPluginMetadataMap } from "@envoymesh/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  tmpDir = await mkdtemp(join(tmpdir(), "envoy-plugin-test-"));
});

function makeMockPlugin(overrides?: Partial<KnowledgeBasePlugin>): KnowledgeBasePlugin {
  return {
    id: overrides?.id ?? "test-plugin",
    displayName: overrides?.displayName ?? "Test Plugin",
    description: overrides?.description ?? "A test plugin",
    version: overrides?.version ?? "1.0.0",
    activate: overrides?.activate,
    deactivate: overrides?.deactivate,
    enrichMetadata: overrides?.enrichMetadata,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPluginRegistry", () => {
  it("creates a registry that starts with no plugins", () => {
    const registry = createPluginRegistry(tmpDir);
    expect(registry.listPlugins()).toEqual([]);
  });

  it("returns empty plugin list when no plugins registered", () => {
    const registry = createPluginRegistry(tmpDir);
    expect(registry.listPlugins(false)).toEqual([]);
    expect(registry.listPlugins(true)).toEqual([]);
  });
});

describe("registerPlugin", () => {
  it("registers a plugin and makes it visible in listPlugins", () => {
    const registry = createPluginRegistry(tmpDir);
    const plugin = makeMockPlugin();
    registry.registerPlugin(plugin);

    const list = registry.listPlugins();
    expect(list).toHaveLength(1);
    expect(list[0].pluginId).toBe("test-plugin");
    expect(list[0].displayName).toBe("Test Plugin");
    expect(list[0].status).toBe("registered");
    expect(list[0].version).toBe("1.0.0");
  });

  it("is idempotent — registering the same plugin twice is a no-op", () => {
    const registry = createPluginRegistry(tmpDir);
    const plugin = makeMockPlugin();
    registry.registerPlugin(plugin);
    registry.registerPlugin(plugin);

    expect(registry.listPlugins()).toHaveLength(1);
  });

  it("allows registering multiple plugins with different ids", () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ id: "plugin-a" }));
    registry.registerPlugin(makeMockPlugin({ id: "plugin-b" }));

    expect(registry.listPlugins()).toHaveLength(2);
    expect(registry.listPlugins().map((p) => p.pluginId)).toEqual(["plugin-a", "plugin-b"]);
  });

  it("getPluginInfo returns undefined for unknown plugin", () => {
    const registry = createPluginRegistry(tmpDir);
    expect(registry.getPluginInfo("no-such-plugin")).toBeUndefined();
  });

  it("getPluginInfo returns correct info for a registered plugin", () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ id: "mine", displayName: "My Plugin" }));

    const info = registry.getPluginInfo("mine");
    expect(info).toBeDefined();
    expect(info!.displayName).toBe("My Plugin");
    expect(info!.status).toBe("registered");
  });
});

describe("activatePlugin", () => {
  it("activates a registered plugin", async () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin());

    const result = await registry.activatePlugin("test-plugin");
    expect(result.ok).toBe(true);

    const info = registry.getPluginInfo("test-plugin")!;
    expect(info.status).toBe("active");
    expect(info.activatedAt).toBeDefined();
    expect(info.errorMessage).toBeUndefined();
  });

  it("returns error for unknown plugin", async () => {
    const registry = createPluginRegistry(tmpDir);
    const result = await registry.activatePlugin("no-such-plugin");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not registered");
  });

  it("calls plugin.activate() with empty config when no config provided", async () => {
    const activateFn = vi.fn().mockResolvedValue({ ok: true });
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ activate: activateFn }));

    await registry.activatePlugin("test-plugin");

    expect(activateFn).toHaveBeenCalledOnce();
    expect(activateFn).toHaveBeenCalledWith({});
  });

  it("passes merged config to plugin.activate()", async () => {
    const activateFn = vi.fn().mockResolvedValue({ ok: true });
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ activate: activateFn }));

    // First: set some initial config
    await registry.updatePluginConfig("test-plugin", { key1: "value1" });
    // Then: activate with additional config
    await registry.activatePlugin("test-plugin", { key2: "value2" });

    expect(activateFn).toHaveBeenCalledWith({ key1: "value1", key2: "value2" });
  });

  it("sets status to error when plugin.activate() rejects", async () => {
    const activateFn = vi.fn().mockResolvedValue({ ok: false, reason: "bad config" });
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ activate: activateFn }));

    const result = await registry.activatePlugin("test-plugin");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad config");

    const info = registry.getPluginInfo("test-plugin")!;
    expect(info.status).toBe("error");
    expect(info.errorMessage).toBe("bad config");
  });

  it("sets status to error when plugin.activate() throws", async () => {
    const activateFn = vi.fn().mockRejectedValue(new Error("disk full"));
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ activate: activateFn }));

    const result = await registry.activatePlugin("test-plugin");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("disk full");

    const info = registry.getPluginInfo("test-plugin")!;
    expect(info.status).toBe("error");
    expect(info.errorMessage).toBe("disk full");
  });
});

describe("deactivatePlugin", () => {
  it("deactivates an active plugin", async () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin());
    await registry.activatePlugin("test-plugin");

    const result = await registry.deactivatePlugin("test-plugin");
    expect(result.ok).toBe(true);

    const info = registry.getPluginInfo("test-plugin")!;
    expect(info.status).toBe("disabled");
  });

  it("returns ok for already-disabled plugin", async () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin());

    const result = await registry.deactivatePlugin("test-plugin");
    expect(result.ok).toBe(true);
  });

  it("returns error for unknown plugin", async () => {
    const registry = createPluginRegistry(tmpDir);
    const result = await registry.deactivatePlugin("no-such-plugin");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not registered");
  });

  it("calls plugin.deactivate() when present", async () => {
    const deactivateFn = vi.fn().mockResolvedValue(undefined);
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ deactivate: deactivateFn }));
    await registry.activatePlugin("test-plugin");

    await registry.deactivatePlugin("test-plugin");

    expect(deactivateFn).toHaveBeenCalledOnce();
  });

  it("does not propagate deactivate errors — logs but still deactivates", async () => {
    const deactivateFn = vi.fn().mockRejectedValue(new Error("cleanup failed"));
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ deactivate: deactivateFn }));
    await registry.activatePlugin("test-plugin");

    const result = await registry.deactivatePlugin("test-plugin");
    // Should succeed even though deactivate threw
    expect(result.ok).toBe(true);
    expect(registry.getPluginInfo("test-plugin")!.status).toBe("disabled");
  });
});

describe("unregisterPlugin", () => {
  it("removes a registered plugin", async () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin());

    await registry.unregisterPlugin("test-plugin");

    expect(registry.listPlugins()).toHaveLength(0);
    expect(registry.getPluginInfo("test-plugin")).toBeUndefined();
  });

  it("deactivates active plugin before unregistering", async () => {
    const deactivateFn = vi.fn().mockResolvedValue(undefined);
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ deactivate: deactivateFn }));
    await registry.activatePlugin("test-plugin");

    await registry.unregisterPlugin("test-plugin");

    expect(deactivateFn).toHaveBeenCalledOnce();
    expect(registry.listPlugins()).toHaveLength(0);
  });

  it("is a no-op for unknown plugin", async () => {
    const registry = createPluginRegistry(tmpDir);
    await registry.unregisterPlugin("no-such-plugin");
    expect(registry.listPlugins()).toHaveLength(0);
  });
});

describe("listPlugins", () => {
  it("returns all plugins by default", () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ id: "a" }));
    registry.registerPlugin(makeMockPlugin({ id: "b" }));

    expect(registry.listPlugins()).toHaveLength(2);
  });

  it("filters to active only when activeOnly=true", async () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ id: "a" }));
    registry.registerPlugin(makeMockPlugin({ id: "b" }));
    await registry.activatePlugin("a");

    expect(registry.listPlugins(false)).toHaveLength(2);
    expect(registry.listPlugins(true)).toHaveLength(1);
    expect(registry.listPlugins(true)[0].pluginId).toBe("a");
  });
});

describe("getPluginConfig / updatePluginConfig", () => {
  it("returns empty config for unregistered plugin", async () => {
    const registry = createPluginRegistry(tmpDir);
    const config = await registry.getPluginConfig("no-such-plugin");
    expect(config).toEqual({});
  });

  it("returns empty config when no config set", async () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin());

    const config = await registry.getPluginConfig("test-plugin");
    expect(config).toEqual({});
  });

  it("persists and reads config", async () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin());

    await registry.updatePluginConfig("test-plugin", { apiUrl: "http://localhost:8080", maxItems: 50 });

    const config = await registry.getPluginConfig("test-plugin");
    expect(config).toEqual({ apiUrl: "http://localhost:8080", maxItems: 50 });
  });

  it("merges partial config updates", async () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin());

    await registry.updatePluginConfig("test-plugin", { key1: "v1" });
    await registry.updatePluginConfig("test-plugin", { key2: "v2" });

    const config = await registry.getPluginConfig("test-plugin");
    expect(config).toEqual({ key1: "v1", key2: "v2" });
  });

  it("overwrites existing keys on merge", async () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin());

    await registry.updatePluginConfig("test-plugin", { key1: "v1" });
    await registry.updatePluginConfig("test-plugin", { key1: "v2" });

    expect(await registry.getPluginConfig("test-plugin")).toEqual({ key1: "v2" });
  });

  it("returns error for update on unregistered plugin", async () => {
    const registry = createPluginRegistry(tmpDir);
    const result = await registry.updatePluginConfig("no-such-plugin", { key: "val" });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not registered");
  });
});

describe("runEnrichMetadata", () => {
  it("returns empty map when no active plugins have enrichMetadata", async () => {
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin());
    await registry.activatePlugin("test-plugin");

    const docs = [{ documentId: "doc1", relativePath: "notes/test.md", title: "Test", extension: ".md", byteLength: 100 }];
    const result = await registry.runEnrichMetadata(docs);
    expect(result.size).toBe(0);
  });

  it("calls enrichMetadata on active plugins and returns results", async () => {
    const meta: KbPluginMetadataMap = new Map([
      ["doc1", [{ pluginId: "tagger", key: "tags", value: "important,review" }]],
    ]);
    const enrichFn = vi.fn().mockResolvedValue(meta);

    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ id: "tagger", enrichMetadata: enrichFn }));
    await registry.activatePlugin("tagger");

    const docs = [{ documentId: "doc1", relativePath: "notes/test.md", title: "Test", extension: ".md", byteLength: 100 }];
    const result = await registry.runEnrichMetadata(docs);

    expect(enrichFn).toHaveBeenCalledOnce();
    expect(result.size).toBe(1);
    expect(result.get("doc1")).toEqual([{ pluginId: "tagger", key: "tags", value: "important,review" }]);
  });

  it("merges metadata from multiple active plugins", async () => {
    const metaA: KbPluginMetadataMap = new Map([
      ["doc1", [{ pluginId: "a", key: "tags", value: "foo" }]],
    ]);
    const metaB: KbPluginMetadataMap = new Map([
      ["doc1", [{ pluginId: "b", key: "links", value: "[[bar]]" }]],
    ]);

    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ id: "a", enrichMetadata: vi.fn().mockResolvedValue(metaA) }));
    registry.registerPlugin(makeMockPlugin({ id: "b", enrichMetadata: vi.fn().mockResolvedValue(metaB) }));
    await registry.activatePlugin("a");
    await registry.activatePlugin("b");

    const docs = [{ documentId: "doc1", relativePath: "notes/test.md", title: "Test", extension: ".md", byteLength: 100 }];
    const result = await registry.runEnrichMetadata(docs);

    expect(result.get("doc1")).toHaveLength(2);
  });

  it("skips inactive plugins", async () => {
    const enrichFn = vi.fn().mockResolvedValue(new Map());
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ enrichMetadata: enrichFn }));
    // Don't activate — should be skipped.

    const docs = [{ documentId: "doc1", relativePath: "notes/test.md", title: "Test", extension: ".md", byteLength: 100 }];
    await registry.runEnrichMetadata(docs);

    expect(enrichFn).not.toHaveBeenCalled();
  });

  it("gracefully handles plugin enrichMetadata errors", async () => {
    const enrichFn = vi.fn().mockRejectedValue(new Error("plugin crashed"));

    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ id: "crasher", enrichMetadata: enrichFn }));
    await registry.activatePlugin("crasher");

    const docs = [{ documentId: "doc1", relativePath: "notes/test.md", title: "Test", extension: ".md", byteLength: 100 }];
    // Should not throw — graceful degradation.
    const result = await registry.runEnrichMetadata(docs);

    expect(result.size).toBe(0);
    // Plugin should be marked as error.
    expect(registry.getPluginInfo("crasher")!.status).toBe("error");
    expect(registry.getPluginInfo("crasher")!.errorMessage).toBe("plugin crashed");
  });

  it("continues with other plugins when one errors", async () => {
    const metaGood: KbPluginMetadataMap = new Map([
      ["doc1", [{ pluginId: "good", key: "ok", value: "yes" }]],
    ]);
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({
      id: "crasher",
      enrichMetadata: vi.fn().mockRejectedValue(new Error("boom")),
    }));
    registry.registerPlugin(makeMockPlugin({
      id: "good",
      enrichMetadata: vi.fn().mockResolvedValue(metaGood),
    }));
    await registry.activatePlugin("crasher");
    await registry.activatePlugin("good");

    const docs = [{ documentId: "doc1", relativePath: "notes/test.md", title: "Test", extension: ".md", byteLength: 100 }];
    const result = await registry.runEnrichMetadata(docs);

    // "good" plugin's results should still be present.
    expect(result.get("doc1")).toEqual([{ pluginId: "good", key: "ok", value: "yes" }]);
  });

  it("returns empty map for empty document list", async () => {
    const meta: KbPluginMetadataMap = new Map();
    const registry = createPluginRegistry(tmpDir);
    registry.registerPlugin(makeMockPlugin({ enrichMetadata: vi.fn().mockResolvedValue(meta) }));
    await registry.activatePlugin("test-plugin");

    const result = await registry.runEnrichMetadata([]);
    expect(result.size).toBe(0);
  });
});

describe("config persistence across registries", () => {
  it("persists config that survives registry recreation", async () => {
    const registry1 = createPluginRegistry(tmpDir);
    registry1.registerPlugin(makeMockPlugin());
    await registry1.updatePluginConfig("test-plugin", { token: "abc123" });

    // Create a new registry pointing at the same profileDir.
    const registry2 = createPluginRegistry(tmpDir);
    registry2.registerPlugin(makeMockPlugin());

    const config = await registry2.getPluginConfig("test-plugin");
    expect(config).toEqual({ token: "abc123" });
  });
});
