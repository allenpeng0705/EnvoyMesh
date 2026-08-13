import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listLinkedObsidianMarkdownFiles,
  resolveLinkedObsidianAbsolutePath,
  resolveLinkedObsidianRootByLabel,
} from "../src/linked-obsidian-files.js";
import {
  clearMcpRemoteCacheForTests,
  exportNotesToMcpViaRuntime,
  formatLinkedObsidianKnowledgeSection,
  importLinkedObsidianNotesViaRuntime,
  listExternalMcpKnowledgeViaRuntime,
  readMcpRemoteFileContent,
  searchLinkedObsidianKnowledge,
  seedMcpRemoteCacheForTests,
} from "../src/knowledge-hub.js";
import { notesImportsObsidianPathForLinked } from "@envoymesh/vault";

vi.mock("@envoymesh/rag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@envoymesh/rag")>();
  return {
    ...actual,
    searchExternalMcpKnowledge: vi.fn(),
    writeExternalMcpKnowledge: vi.fn(),
  };
});

import {
  searchExternalMcpKnowledge,
  writeExternalMcpKnowledge,
} from "@envoymesh/rag";

describe("linked-obsidian-files", () => {
  it("lists markdown under a vault root with browse paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "envoy-linked-obs-"));
    await mkdir(join(root, "folder"), { recursive: true });
    await writeFile(join(root, "folder", "hello.md"), "# Hello\n世界", "utf8");
    await writeFile(join(root, "skip.txt"), "nope", "utf8");

    const items = await listLinkedObsidianMarkdownFiles([root]);
    expect(items).toHaveLength(1);
    expect(items[0]!.source).toBe("linked-obsidian");
    expect(items[0]!.relativePath).toMatch(/^linked-obsidian\/.+\/folder\/hello\.md$/);
    expect(items[0]!.title).toBe("hello");

    const abs = await resolveLinkedObsidianAbsolutePath([root], items[0]!.relativePath);
    expect(abs).toBe(join(root, "folder", "hello.md"));
  });

  it("resolves root by label", async () => {
    const root = await mkdtemp(join(tmpdir(), "envoy-linked-label-"));
    const resolved = await resolveLinkedObsidianRootByLabel([root]);
    expect(resolved?.absRoot).toBe(root);
  });
});

describe("knowledge-hub import + search", () => {
  afterEach(() => {
    clearMcpRemoteCacheForTests();
  });

  it("imports linked notes into notes/imports/obsidian/", async () => {
    const linked = await mkdtemp(join(tmpdir(), "envoy-obs-src-"));
    const vault = await mkdtemp(join(tmpdir(), "envoy-obs-vault-"));
    await writeFile(join(linked, "alpha.md"), "Alpha body with unique-token-xyz", "utf8");

    const listed = await listLinkedObsidianMarkdownFiles([linked]);
    expect(listed).toHaveLength(1);

    const result = await importLinkedObsidianNotesViaRuntime(
      {
        getVaultDir: () => vault,
        getNodeConfig: async () => ({
          aiSettings: { knowledgeBase: { linkedObsidianVaultPaths: [linked] } },
        }),
        recordOwnerActivity: () => {},
      },
      { all: true },
    );

    expect(result.ok).toBe(true);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]!.to).toBe(
      notesImportsObsidianPathForLinked(listed[0]!.relativePath),
    );

    const hits = await searchLinkedObsidianKnowledge({
      absoluteRoots: [linked],
      query: "unique-token-xyz",
    });
    expect(hits.length).toBeGreaterThan(0);
    const section = formatLinkedObsidianKnowledgeSection(hits);
    expect(section).toContain("Linked Obsidian vault");
    expect(section).toContain("unique-token-xyz");
  });

  it("returns a reason when no linked vaults are configured", async () => {
    const vault = await mkdtemp(join(tmpdir(), "envoy-obs-empty-"));
    const result = await importLinkedObsidianNotesViaRuntime(
      {
        getVaultDir: () => vault,
        getNodeConfig: async () => ({ aiSettings: { knowledgeBase: {} } }),
        recordOwnerActivity: () => {},
      },
      { all: true },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_linked_vaults");
  });
});

describe("knowledge-hub MCP cache + export", () => {
  afterEach(() => {
    clearMcpRemoteCacheForTests();
    vi.mocked(searchExternalMcpKnowledge).mockReset();
    vi.mocked(writeExternalMcpKnowledge).mockReset();
  });

  it("keeps prior MCP cache entries when a later list fails empty", async () => {
    seedMcpRemoteCacheForTests([
      {
        path: "mcp-remote/id1/Card.md",
        title: "Card",
        text: "hello from notion",
        externalId: "id1",
      },
    ]);
    const before = await readMcpRemoteFileContent("mcp-remote/id1/Card.md", 50_000);
    expect(Buffer.from(before.contentBase64, "base64").toString("utf8")).toContain(
      "hello from notion",
    );

    vi.mocked(searchExternalMcpKnowledge).mockResolvedValue({
      snippets: [],
      error: "mcp_unreachable",
    });
    const listed = await listExternalMcpKnowledgeViaRuntime(
      {
        getVaultDir: () => null,
        getNodeConfig: async () => ({
          aiSettings: { knowledgeBase: { externalProvider: "mcp", mcpServerUrl: "http://x" } },
        }),
        recordOwnerActivity: () => {},
      },
      { query: "*" },
    );
    expect(listed.items).toHaveLength(0);
    expect(listed.error).toBe("mcp_unreachable");

    const after = await readMcpRemoteFileContent("mcp-remote/id1/Card.md", 50_000);
    expect(Buffer.from(after.contentBase64, "base64").toString("utf8")).toContain(
      "hello from notion",
    );
  });

  it("treats mcp_url_missing as a silent Browse skip (no error)", async () => {
    vi.mocked(searchExternalMcpKnowledge).mockResolvedValue({
      snippets: [],
      error: "mcp_url_missing",
    });
    const listed = await listExternalMcpKnowledgeViaRuntime(
      {
        getVaultDir: () => null,
        getNodeConfig: async () => ({
          aiSettings: { knowledgeBase: { externalProvider: "mcp" } },
        }),
        recordOwnerActivity: () => {},
      },
      { query: "*" },
    );
    expect(listed.items).toHaveLength(0);
    expect(listed.error).toBeUndefined();
  });

  it("continues MCP export after a mid-batch write failure", async () => {
    const vault = await mkdtemp(join(tmpdir(), "envoy-mcp-export-"));
    await writeFile(join(vault, "a.md"), "# A\n", "utf8");
    await writeFile(join(vault, "b.md"), "# B\n", "utf8");
    await writeFile(join(vault, "c.md"), "# C\n", "utf8");

    vi.mocked(writeExternalMcpKnowledge)
      .mockResolvedValueOnce({ ok: true, externalId: "ext-a" })
      .mockResolvedValueOnce({ ok: false, error: "write_denied" })
      .mockResolvedValueOnce({ ok: true, externalId: "ext-c" });

    const result = await exportNotesToMcpViaRuntime(
      {
        getVaultDir: () => vault,
        getNodeConfig: async () => ({
          aiSettings: {
            knowledgeBase: { externalProvider: "mcp", mcpServerUrl: "http://x" },
          },
        }),
        recordOwnerActivity: () => {},
      },
      { relativePaths: ["a.md", "b.md", "c.md"] },
    );

    expect(result.ok).toBe(true);
    expect(result.exported).toHaveLength(2);
    expect(result.exported.map((e) => e.relativePath)).toEqual(["a.md", "c.md"]);
    expect(result.reason).toMatch(/partial/);
  });

  it("syncKnowledgeConnectorsForRag pulls Obsidian + MCP into notes for embedding", async () => {
    const { syncKnowledgeConnectorsForRagViaRuntime } = await import("../src/knowledge-hub.js");
    const { readFile } = await import("node:fs/promises");

    const linked = await mkdtemp(join(tmpdir(), "envoy-sync-obs-"));
    const vault = await mkdtemp(join(tmpdir(), "envoy-sync-vault-"));
    await writeFile(join(linked, "note.md"), "Obsidian sync body", "utf8");

    vi.mocked(searchExternalMcpKnowledge).mockResolvedValue({
      snippets: [{ title: "Notion Card", source: "mcp", text: "Notion body for RAG" }],
    });

    const result = await syncKnowledgeConnectorsForRagViaRuntime({
      getVaultDir: () => vault,
      getNodeConfig: async () => ({
        aiSettings: {
          knowledgeBase: {
            linkedObsidianVaultPaths: [linked],
            externalProvider: "mcp",
            mcpServerUrl: "http://127.0.0.1:9",
          },
        },
      }),
      recordOwnerActivity: () => {},
    });

    expect(result.obsidianImported).toBe(1);
    expect(result.mcpImported).toBe(1);
    expect(result.mcpError).toBeUndefined();

    const listed = await listLinkedObsidianMarkdownFiles([linked]);
    const dest = notesImportsObsidianPathForLinked(listed[0]!.relativePath);
    await expect(readFile(join(vault, dest), "utf8")).resolves.toContain("Obsidian sync body");
    await expect(readFile(join(vault, "notes", "mcp"), "utf8").catch(() => "")).resolves.toBeDefined();
    const { readdir } = await import("node:fs/promises");
    const mcpFiles = await readdir(join(vault, "notes", "mcp"));
    expect(mcpFiles.some((f) => f.endsWith(".md"))).toBe(true);
    const mcpBody = await readFile(join(vault, "notes", "mcp", mcpFiles[0]!), "utf8");
    expect(mcpBody).toContain("Notion body for RAG");
    expect(mcpBody).toContain("mcp-external-id:");
  });
});
