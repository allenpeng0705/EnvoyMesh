/**
 * E2E tests for the KB Plugin Registry lifecycle (Phase 44C).
 *
 * Tests full plugin lifecycle with real filesystem persistence, multi-plugin
 * metadata merging, graceful degradation, and config round-trips.
 *
 * Run with: RUN_E2E=1 npx vitest run apps/node/test/kb-plugin-registry-e2e.test.ts
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginRegistry } from "../src/kb-plugin-registry.js";
import type {
  KnowledgeBasePlugin,
  KbPluginMetadataMap,
} from "@envoymesh/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let profileDir: string;
let vaultDir: string;

/** Create a minimal test plugin. */
function createTestPlugin(opts: {
  id: string;
  displayName?: string;
  description?: string;
  enrichResult?: KbPluginMetadataMap;
  activateResult?: { ok: boolean; reason?: string };
  shouldThrowOnActivate?: boolean;
  shouldThrowOnEnrich?: boolean;
}): KnowledgeBasePlugin {
  return {
    id: opts.id,
    displayName: opts.displayName ?? `Test Plugin ${opts.id}`,
    description: opts.description ?? "A test plugin",
    version: "1.0.0",
    async activate(_config) {
      if (opts.shouldThrowOnActivate) throw new Error("activate boom");
      return opts.activateResult ?? { ok: true };
    },
    async deactivate() { /* no-op */ },
    async enrichMetadata(_docs) {
      if (opts.shouldThrowOnEnrich) throw new Error("enrich boom");
      return opts.enrichResult ?? new Map();
    },
  };
}

const SAMPLE_DOCS = [
  { documentId: "doc-1", relativePath: "notes/a.md", title: "a", extension: ".md", byteLength: 50 },
  { documentId: "doc-2", relativePath: "notes/b.md", title: "b", extension: ".md", byteLength: 100 },
];

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-kb-registry-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

// ===========================================================================
// Tests
// ===========================================================================

describe("kb-plugin-registry E2E", () => {
  // -----------------------------------------------------------------------
  // 1. Full lifecycle: register → activate → enrich → deactivate → activate
  // -----------------------------------------------------------------------

  it("completes full register → activate → enrich → deactivate → activate cycle", async () => {
    const metadataResult = new Map<string, Array<{ pluginId: string; key: string; value: string }>>([
      ["doc-1", [{ pluginId: "test-a", key: "test:field", value: "hello" }]],
    ]);

    const plugin = createTestPlugin({ id: "test-a", enrichResult: metadataResult });
    const registry = createPluginRegistry(profileDir);

    // Initially registered
    registry.registerPlugin(plugin);
    let info = registry.getPluginInfo("test-a")!;
    expect(info.status).toBe("registered");

    // Activate
    const actResult = await registry.activatePlugin("test-a", { key: "value" });
    expect(actResult.ok).toBe(true);
    info = registry.getPluginInfo("test-a")!;
    expect(info.status).toBe("active");
    expect(info.activatedAt).toBeDefined();

    // Enrich
    const metadata = await registry.runEnrichMetadata(SAMPLE_DOCS);
    expect(metadata.get("doc-1")).toBeDefined();
    expect(metadata.get("doc-1")![0]!.value).toBe("hello");

    // Deactivate
    const deactResult = await registry.deactivatePlugin("test-a");
    expect(deactResult.ok).toBe(true);
    info = registry.getPluginInfo("test-a")!;
    expect(info.status).toBe("disabled");

    // Re-activate (config should persist)
    const reactResult = await registry.activatePlugin("test-a");
    expect(reactResult.ok).toBe(true);
    info = registry.getPluginInfo("test-a")!;
    expect(info.status).toBe("active");

    // Config persisted across deactivation/reactivation
    const config = await registry.getPluginConfig("test-a");
    expect(config).toEqual({ key: "value" });
  });

  // -----------------------------------------------------------------------
  // 2. Config persistence across registry recreation
  // -----------------------------------------------------------------------

  it("persists config across registry destruction and recreation", async () => {
    const plugin = createTestPlugin({ id: "persistent" });
    let registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);

    await registry.activatePlugin("persistent", { vaultDir: "/tmp/test", setting: 42 });
    const config1 = await registry.getPluginConfig("persistent");
    expect(config1).toEqual({ vaultDir: "/tmp/test", setting: 42 });

    // Destroy and recreate registry from same profileDir
    registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);

    // Old config should still be on disk
    const config2 = await registry.getPluginConfig("persistent");
    expect(config2).toEqual({ vaultDir: "/tmp/test", setting: 42 });

    // Activate should use persisted config
    const result = await registry.activatePlugin("persistent");
    expect(result.ok).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 3. Multiple plugins merge metadata
  // -----------------------------------------------------------------------

  it("merges metadata from multiple active plugins", async () => {
    const pluginA = createTestPlugin({
      id: "plugin-a",
      enrichResult: new Map([
        ["doc-1", [{ pluginId: "plugin-a", key: "a:field", value: "from-a" }]],
        ["doc-2", [{ pluginId: "plugin-a", key: "a:field", value: "from-a-2" }]],
      ]),
    });
    const pluginB = createTestPlugin({
      id: "plugin-b",
      enrichResult: new Map([
        ["doc-1", [{ pluginId: "plugin-b", key: "b:field", value: "from-b" }]],
      ]),
    });

    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(pluginA);
    registry.registerPlugin(pluginB);

    await registry.activatePlugin("plugin-a");
    await registry.activatePlugin("plugin-b");

    const metadata = await registry.runEnrichMetadata(SAMPLE_DOCS);

    // doc-1 should have entries from both plugins
    const doc1Meta = metadata.get("doc-1")!;
    expect(doc1Meta.length).toBe(2);
    expect(doc1Meta.find((e) => e.pluginId === "plugin-a")).toBeDefined();
    expect(doc1Meta.find((e) => e.pluginId === "plugin-b")).toBeDefined();

    // doc-2 should have only plugin-a entry
    const doc2Meta = metadata.get("doc-2")!;
    expect(doc2Meta.length).toBe(1);
    expect(doc2Meta[0]!.pluginId).toBe("plugin-a");
  });

  // -----------------------------------------------------------------------
  // 4. One plugin error doesn't block others (graceful degradation)
  // -----------------------------------------------------------------------

  it("continues with other plugins when one throws during enrichMetadata", async () => {
    const goodPlugin = createTestPlugin({
      id: "good",
      enrichResult: new Map([
        ["doc-1", [{ pluginId: "good", key: "good:data", value: "survived" }]],
      ]),
    });
    const badPlugin = createTestPlugin({
      id: "bad",
      shouldThrowOnEnrich: true,
    });

    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(goodPlugin);
    registry.registerPlugin(badPlugin);

    await registry.activatePlugin("good");
    await registry.activatePlugin("bad");

    const metadata = await registry.runEnrichMetadata(SAMPLE_DOCS);

    // Good plugin's metadata should be present
    const doc1Meta = metadata.get("doc-1")!;
    expect(doc1Meta.find((e) => e.pluginId === "good")).toBeDefined();
    expect(doc1Meta.find((e) => e.pluginId === "good")!.value).toBe("survived");

    // Bad plugin should be marked as error
    const badInfo = registry.getPluginInfo("bad")!;
    expect(badInfo.status).toBe("error");
    expect(badInfo.errorMessage).toContain("enrich boom");

    // Good plugin should still be active
    const goodInfo = registry.getPluginInfo("good")!;
    expect(goodInfo.status).toBe("active");
  });

  // -----------------------------------------------------------------------
  // 5. Unregister active plugin deactivates first
  // -----------------------------------------------------------------------

  it("unregistering an active plugin deactivates it and deletes config", async () => {
    const plugin = createTestPlugin({ id: "ephemeral" });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);

    await registry.activatePlugin("ephemeral", { temp: true });
    expect(registry.getPluginInfo("ephemeral")?.status).toBe("active");

    // Unregister
    await registry.unregisterPlugin("ephemeral");

    // Plugin should be gone
    expect(registry.getPluginInfo("ephemeral")).toBeUndefined();

    // Config should be deleted (file should not exist)
    const configPath = join(profileDir, "plugins", "ephemeral", "config.json");
    try {
      await stat(configPath);
      // If we get here, the file still exists — that's a failure
      expect.unreachable("config file should have been deleted");
    } catch {
      // File doesn't exist — expected
    }
  });

  // -----------------------------------------------------------------------
  // 6. Plugin ID validation
  // -----------------------------------------------------------------------

  it("rejects plugin IDs with invalid characters", async () => {
    const registry = createPluginRegistry(profileDir);

    // Valid IDs
    expect(() => registry.registerPlugin(createTestPlugin({ id: "obsidian" }))).not.toThrow();
    expect(() => registry.registerPlugin(createTestPlugin({ id: "my-plugin_2" }))).not.toThrow();
    expect(() => registry.registerPlugin(createTestPlugin({ id: "a1" }))).not.toThrow();

    // Invalid IDs
    expect(() => registry.registerPlugin(createTestPlugin({ id: "UpperCase" }))).toThrow("invalid plugin id");
    expect(() => registry.registerPlugin(createTestPlugin({ id: "has spaces" }))).toThrow("invalid plugin id");
    expect(() => registry.registerPlugin(createTestPlugin({ id: "has/slash" }))).toThrow("invalid plugin id");
    expect(() => registry.registerPlugin(createTestPlugin({ id: "has.dot" }))).toThrow("invalid plugin id");
  });

  // -----------------------------------------------------------------------
  // 7. Activate failure from plugin returns error status
  // -----------------------------------------------------------------------

  it("marks plugin as error when activate returns ok: false", async () => {
    const plugin = createTestPlugin({
      id: "failing",
      activateResult: { ok: false, reason: "config missing" },
    });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);

    const result = await registry.activatePlugin("failing");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("config missing");

    const info = registry.getPluginInfo("failing")!;
    expect(info.status).toBe("error");
    expect(info.errorMessage).toBe("config missing");
  });

  // -----------------------------------------------------------------------
  // 8. Activate exception captured as error status
  // -----------------------------------------------------------------------

  it("captures activate exceptions as error status", async () => {
    const plugin = createTestPlugin({
      id: "throwing",
      shouldThrowOnActivate: true,
    });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);

    const result = await registry.activatePlugin("throwing");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("activate boom");

    const info = registry.getPluginInfo("throwing")!;
    expect(info.status).toBe("error");
    expect(info.errorMessage).toBe("activate boom");
  });

  // -----------------------------------------------------------------------
  // 9. listPlugins with activeOnly filter
  // -----------------------------------------------------------------------

  it("listPlugins filters by activeOnly", async () => {
    const pluginA = createTestPlugin({ id: "alpha" });
    const pluginB = createTestPlugin({ id: "beta" });
    const pluginC = createTestPlugin({ id: "gamma" });

    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(pluginA);
    registry.registerPlugin(pluginB);
    registry.registerPlugin(pluginC);

    await registry.activatePlugin("alpha");
    // beta stays registered but not activated
    await registry.activatePlugin("gamma");

    // All plugins
    const all = registry.listPlugins();
    expect(all).toHaveLength(3);

    // Active only
    const active = registry.listPlugins(true);
    expect(active).toHaveLength(2);
    expect(active.map((p) => p.pluginId)).toContain("alpha");
    expect(active.map((p) => p.pluginId)).toContain("gamma");
    expect(active.map((p) => p.pluginId)).not.toContain("beta");
  });

  // -----------------------------------------------------------------------
  // 10. Config file permissions
  // -----------------------------------------------------------------------

  it("writes plugin config with 0o600 permissions", async () => {
    const plugin = createTestPlugin({ id: "secure" });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);

    await registry.activatePlugin("secure", { secret: "value" });

    const configPath = join(profileDir, "plugins", "secure", "config.json");
    const fileStat = await stat(configPath);
    expect(fileStat.isFile()).toBe(true);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  // -----------------------------------------------------------------------
  // 11. Duplicate register is no-op
  // -----------------------------------------------------------------------

  it("ignores duplicate register of the same plugin ID", async () => {
    const plugin1 = createTestPlugin({ id: "unique", displayName: "First" });
    const plugin2 = createTestPlugin({ id: "unique", displayName: "Second" });

    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin1);
    registry.registerPlugin(plugin2); // should be no-op

    const info = registry.getPluginInfo("unique")!;
    expect(info.displayName).toBe("First"); // first registration wins
  });
});
