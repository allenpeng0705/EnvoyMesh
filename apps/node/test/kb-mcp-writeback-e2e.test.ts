/**
 * E2E tests for MCP write-back pipeline (Phase 44E).
 *
 * Tests the full flow: formatMcpResultsAsNote → createNote → vault index →
 * plugin metadata enrichment, with real temp filesystem.
 *
 * Run with: RUN_E2E=1 npx vitest run apps/node/test/kb-mcp-writeback-e2e.test.ts
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, exists } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { formatMcpResultsAsNote, type ExternalKnowledgeSnippet } from "@envoymesh/rag";
import { createObsidianPlugin } from "@envoymesh/kb-obsidian";
import { createPluginRegistry } from "../src/kb-plugin-registry.js";
import { buildVaultIndex } from "@envoymesh/vault";
import type { KbPluginMetadataMap } from "@envoymesh/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let profileDir: string;
let vaultDir: string;

const SAMPLE_SNIPPETS: ExternalKnowledgeSnippet[] = [
  {
    title: "EnvoyMesh Deployment Guide",
    source: "memex_search",
    text: "To deploy EnvoyMesh, first install the dependencies with npm install. Then configure the vault directory and start the node. The deployment uses libp2p for P2P networking.",
  },
  {
    title: "Network Configuration",
    source: "memex_search",
    text: "The relay node handles connectivity and routing. Configure relay addresses in the node config. TCP and QUIC transports are supported.",
  },
];

const ATTRIBUTION = {
  server: "http://127.0.0.1:9999/mcp",
  tool: "memex_search",
  query: "deployment guide",
  queriedAt: "2026-07-13T10:30:00Z",
};

async function readVaultFile(relativePath: string): Promise<string | undefined> {
  try {
    const abs = join(vaultDir, relativePath);
    return await readFile(abs, "utf8");
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-kb-mcp-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

// ===========================================================================
// Tests
// ===========================================================================

describe("kb-mcp-writeback E2E", () => {
  // -----------------------------------------------------------------------
  // 1. MCP results written as vault note
  // -----------------------------------------------------------------------

  it("writes MCP results as a .md file in the vault notes/mcp/ directory", async () => {
    const result = formatMcpResultsAsNote(SAMPLE_SNIPPETS, { attribution: ATTRIBUTION });

    expect(result.filename).toMatch(/\.md$/);
    expect(result.subfolder).toBe("mcp");

    // Write to vault
    const notesDir = join(vaultDir, "notes", "mcp");
    await mkdir(notesDir, { recursive: true });
    const filePath = join(notesDir, result.filename);
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(filePath, result.content, { mode: 0o600 }),
    );

    // Verify file exists
    const fileStat = await stat(filePath);
    expect(fileStat.isFile()).toBe(true);

    // Verify it appears in vault index
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const found = index.documents.find(
      (d) => d.relativePath === `notes/mcp/${result.filename}`,
    );
    expect(found).toBeDefined();
    expect(found!.extension).toBe(".md");
  });

  // -----------------------------------------------------------------------
  // 2. MCP note has correct frontmatter
  // -----------------------------------------------------------------------

  it("produces a note with valid YAML frontmatter for MCP attribution", async () => {
    const result = formatMcpResultsAsNote(SAMPLE_SNIPPETS, { attribution: ATTRIBUTION });

    // Parse frontmatter from generated content
    const { parseFrontmatter } = await import("@envoymesh/kb-obsidian");
    const parsed = parseFrontmatter(result.content);

    expect(parsed.data["source"]).toBe("mcp");
    expect(parsed.data["mcp-server"]).toBe(ATTRIBUTION.server);
    expect(parsed.data["mcp-tool"]).toBe(ATTRIBUTION.tool);
    expect(parsed.data["mcp-query"]).toBe(ATTRIBUTION.query);
    expect(parsed.data["mcp-queried-at"]).toBe(ATTRIBUTION.queriedAt);
    expect(parsed.data["published"]).toBe(false); // friends default → not published
    expect(parsed.data["tags"]).toEqual(["mcp", "knowledge"]);

    // Content body should contain snippet titles
    expect(parsed.content).toContain("EnvoyMesh Deployment Guide");
    expect(parsed.content).toContain("Network Configuration");
  });

  // -----------------------------------------------------------------------
  // 3. Public MCP note sets published: true
  // -----------------------------------------------------------------------

  it("sets published: true when sensitivity is 'public'", async () => {
    const result = formatMcpResultsAsNote(SAMPLE_SNIPPETS, {
      attribution: ATTRIBUTION,
      sensitivity: "public",
    });

    const { parseFrontmatter } = await import("@envoymesh/kb-obsidian");
    const parsed = parseFrontmatter(result.content);
    expect(parsed.data["published"]).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 4. Filename sanitization
  // -----------------------------------------------------------------------

  it("sanitizes query into valid filename", async () => {
    // Special characters
    const result1 = formatMcpResultsAsNote(SAMPLE_SNIPPETS, {
      attribution: { ...ATTRIBUTION, query: "What is TLS/SSL? (2024)" },
    });
    expect(result1.filename).toMatch(/^[a-z0-9-]+\.md$/);
    expect(result1.filename).not.toContain("/");
    expect(result1.filename).not.toContain("?");

    // Length truncation (long query)
    const longQuery = "A".repeat(100);
    const result2 = formatMcpResultsAsNote(SAMPLE_SNIPPETS, {
      attribution: { ...ATTRIBUTION, query: longQuery },
    });
    expect(basename(result2.filename, ".md").length).toBeLessThanOrEqual(60);

    // Custom title override
    const result3 = formatMcpResultsAsNote(SAMPLE_SNIPPETS, {
      attribution: ATTRIBUTION,
      title: "My Custom Deployment Note",
    });
    expect(result3.filename).toBe("my-custom-deployment-note.md");
  });

  // -----------------------------------------------------------------------
  // 5. Empty MCP results produce valid note
  // -----------------------------------------------------------------------

  it("produces valid markdown even with zero snippets", async () => {
    const result = formatMcpResultsAsNote([], { attribution: ATTRIBUTION });

    expect(result.filename).toMatch(/\.md$/);
    expect(result.content).toContain("---");
    expect(result.content).toContain("source: mcp");

    const { parseFrontmatter } = await import("@envoymesh/kb-obsidian");
    const parsed = parseFrontmatter(result.content);
    expect(parsed.data["source"]).toBe("mcp");
  });

  // -----------------------------------------------------------------------
  // 6. Custom subfolder respected
  // -----------------------------------------------------------------------

  it("uses custom subfolder in output", async () => {
    const result = formatMcpResultsAsNote(SAMPLE_SNIPPETS, {
      attribution: ATTRIBUTION,
      subfolder: "research/papers",
    });
    expect(result.subfolder).toBe("research/papers");
  });

  // -----------------------------------------------------------------------
  // 7. MCP note enriched by Obsidian plugin after vault index
  // -----------------------------------------------------------------------

  it("MCP note is enriched by Obsidian plugin after being written to vault", async () => {
    // Format and write the MCP note to vault
    const formatted = formatMcpResultsAsNote(SAMPLE_SNIPPETS, {
      attribution: ATTRIBUTION,
      sensitivity: "public",
    });
    const notesDir = join(vaultDir, "notes", "mcp");
    await mkdir(notesDir, { recursive: true });
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(join(notesDir, formatted.filename), formatted.content, { mode: 0o600 }),
    );

    // Set up Obsidian plugin + registry
    const plugin = createObsidianPlugin({ readVaultFile });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);
    await registry.activatePlugin("obsidian", { profileDir });

    // Build vault index and enrich
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const docs = index.documents
      .filter((d) => d.extension === ".md")
      .map((d) => ({
        documentId: d.documentId,
        relativePath: d.relativePath,
        title: d.title,
        extension: d.extension,
        byteLength: d.byteLength,
      }));

    const metadata: KbPluginMetadataMap = await registry.runEnrichMetadata(docs);

    // Find the MCP note's metadata
    const mcpDoc = docs.find((d) => d.relativePath === `notes/mcp/${formatted.filename}`);
    expect(mcpDoc).toBeDefined();

    const mcpMeta = metadata.get(mcpDoc!.documentId);
    expect(mcpMeta).toBeDefined();

    // Should have frontmatter fields from MCP note's YAML
    const metaMap = Object.fromEntries(mcpMeta!.map((e) => [e.key, e.value]));
    expect(metaMap["frontmatter:tags"]).toBeDefined();
    expect(JSON.parse(metaMap["frontmatter:tags"])).toContain("mcp");
    expect(metaMap["frontmatter:published"]).toBe("true"); // public → published
  });

  // -----------------------------------------------------------------------
  // 8. Double-quote escaping in frontmatter values
  // -----------------------------------------------------------------------

  it("escapes double quotes in MCP attribution frontmatter values", async () => {
    const result = formatMcpResultsAsNote(SAMPLE_SNIPPETS, {
      attribution: {
        ...ATTRIBUTION,
        server: 'http://example.com/mcp "test"',
        query: 'What is "TLS"?',
      },
    });

    const { parseFrontmatter } = await import("@envoymesh/kb-obsidian");
    const parsed = parseFrontmatter(result.content);
    // The values should contain the double quotes (properly escaped in YAML)
    expect(String(parsed.data["mcp-server"])).toContain("test");
    expect(String(parsed.data["mcp-query"])).toContain("TLS");
  });
});
