/**
 * E2E tests for the Obsidian KB plugin (Phase 44D).
 *
 * Exercises the full pipeline: vault files → frontmatter parsing → wiki-link graph
 * → sensitivity-aware resolution → metadata enrichment — using real temp filesystem
 * directories (no mocks for file I/O).
 *
 * Run with: RUN_E2E=1 npx vitest run apps/node/test/kb-obsidian-e2e.test.ts
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createObsidianPlugin, type SensitivitySyncCallback } from "@envoymesh/kb-obsidian";
import {
  parseFrontmatter,
  frontmatterString,
  frontmatterBoolean,
  frontmatterStringArray,
} from "@envoymesh/kb-obsidian";
import {
  buildLinkGraph,
  loadLinkGraph,
  normalizeWikiTarget,
  parseWikiLinks,
  type LinkGraph,
} from "@envoymesh/kb-obsidian";
import {
  resolveLinksWithSensitivity,
  resolveBacklinksWithSensitivity,
  filterContentLinks,
  traverseLinks,
  isAccessible,
  type NoteSensitivityMap,
} from "@envoymesh/kb-obsidian";
import { createPluginRegistry } from "../src/kb-plugin-registry.js";
import { buildVaultIndex } from "@envoymesh/vault";
import type { KbPluginMetadataMap } from "@envoymesh/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let profileDir: string;
let vaultDir: string;

/** Write a set of .md notes to the vault's notes/ directory. */
async function writeNotes(notes: Map<string, string>): Promise<void> {
  for (const [filename, content] of notes) {
    const abs = join(vaultDir, "notes", filename);
    await mkdir(join(vaultDir, "notes"), { recursive: true });
    await writeFile(abs, content, "utf8");
  }
}

/** Read vault file from the real filesystem. */
async function readVaultFile(relativePath: string): Promise<string | undefined> {
  try {
    const abs = join(vaultDir, relativePath);
    return await readFile(abs, "utf8");
  } catch {
    return undefined;
  }
}

/** Build a vault index and return the .md document descriptors. */
async function getMdDocuments(): Promise<Array<{
  documentId: string;
  relativePath: string;
  title: string;
  extension: string;
  byteLength: number;
}>> {
  const index = await buildVaultIndex({ rootDir: vaultDir });
  return index.documents
    .filter((d) => d.extension === ".md")
    .map((d) => ({
      documentId: d.documentId,
      relativePath: d.relativePath,
      title: d.title,
      extension: d.extension,
      byteLength: d.byteLength,
    }));
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-kb-obsidian-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

// ===========================================================================
// Tests
// ===========================================================================

describe("kb-obsidian E2E", () => {
  // -----------------------------------------------------------------------
  // 1. Full enrichMetadata pipeline
  // -----------------------------------------------------------------------

  it("enriches metadata with frontmatter fields, outgoing links, and backlinks", async () => {
    const notes = new Map<string, string>([
      ["alpha.md", `---
tags: [react, typescript]
aliases: [Component A, First Note]
date: "2026-07-13"
category: programming
published: true
---
See [[beta]] and [[gamma]] for details.
`],
      ["beta.md", `---
tags: [rust]
published: false
---
This links to [[alpha]].
`],
      ["gamma.md", `---
tags: [devops]
category: infrastructure
---
No outgoing links here.
`],
    ]);
    await writeNotes(notes);

    const sensitivityCalls: Array<{ docId: string; published: boolean }> = [];
    const plugin = createObsidianPlugin({
      readVaultFile,
      onSensitivitySync: async (docId, published) => {
        sensitivityCalls.push({ docId, published });
      },
    });

    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);
    await registry.activatePlugin("obsidian", { profileDir });
    const docs = await getMdDocuments();
    const metadata: KbPluginMetadataMap = await registry.runEnrichMetadata(docs);

    // --- alpha ---
    const alphaDoc = docs.find((d) => d.title === "alpha");
    expect(alphaDoc).toBeDefined();
    const alphaMeta = metadata.get(alphaDoc!.documentId)!;
    const metaMap = Object.fromEntries(
      alphaMeta.map((e) => [e.key, e.value]),
    );

    expect(JSON.parse(metaMap["frontmatter:tags"])).toEqual(["react", "typescript"]);
    expect(JSON.parse(metaMap["frontmatter:aliases"])).toEqual(["Component A", "First Note"]);
    expect(metaMap["frontmatter:date"]).toBe("2026-07-13");
    expect(metaMap["frontmatter:category"]).toBe("programming");
    expect(metaMap["frontmatter:published"]).toBe("true");
    expect(JSON.parse(metaMap["links:outgoing"])).toContain("beta");
    expect(JSON.parse(metaMap["links:outgoing"])).toContain("gamma");

    // --- beta (has backlink from alpha) ---
    const betaDoc = docs.find((d) => d.title === "beta");
    const betaMeta = metadata.get(betaDoc!.documentId)!;
    const betaMap = Object.fromEntries(betaMeta.map((e) => [e.key, e.value]));
    expect(JSON.parse(betaMap["links:backlinks"])).toContain("alpha");

    // --- gamma (has backlink from alpha, no outgoing) ---
    const gammaDoc = docs.find((d) => d.title === "gamma");
    const gammaMeta = metadata.get(gammaDoc!.documentId)!;
    const gammaMap = Object.fromEntries(gammaMeta.map((e) => [e.key, e.value]));
    expect(JSON.parse(gammaMap["links:backlinks"])).toContain("alpha");
    expect(gammaMap["links:outgoing"]).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 2. Published frontmatter syncs to sensitivity store
  // -----------------------------------------------------------------------

  it("syncs published frontmatter to onSensitivitySync callback", async () => {
    const notes = new Map<string, string>([
      ["published-note.md", `---
published: true
---
Content here.
`],
      ["unpublished-note.md", `---
published: false
---
Private content.
`],
      ["no-published.md", `---
tags: [general]
---
No published field.
`],
    ]);
    await writeNotes(notes);

    const syncCalls: Array<[string, boolean]> = [];
    const plugin = createObsidianPlugin({
      readVaultFile,
      onSensitivitySync: async (docId, published) => {
        syncCalls.push([docId, published]);
      },
    });

    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);
    await registry.activatePlugin("obsidian", { profileDir });
    const docs = await getMdDocuments();
    await registry.runEnrichMetadata(docs);

    // published=true should trigger sync
    const publishedCall = syncCalls.find(
      ([path]) => path.includes("published-note"),
    );
    expect(publishedCall).toBeDefined();
    expect(publishedCall![1]).toBe(true);

    // published=false should trigger sync
    const unpublishedCall = syncCalls.find(
      ([path]) => path.includes("unpublished-note"),
    );
    expect(unpublishedCall).toBeDefined();
    expect(unpublishedCall![1]).toBe(false);

    // no published field → no sync call
    const noPublishedCall = syncCalls.find(
      ([path]) => path.includes("no-published"),
    );
    expect(noPublishedCall).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 3. Link graph built and persisted
  // -----------------------------------------------------------------------

  it("persists link graph to disk and survives deactivate/reactivate", async () => {
    const notes = new Map<string, string>([
      ["alpha.md", "Links to [[beta]] and [[gamma]]."],
      ["beta.md", "Links to [[alpha]]."],
      ["gamma.md", "No outgoing links."],
    ]);
    await writeNotes(notes);

    const plugin = createObsidianPlugin({ readVaultFile });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);

    // Activate + enrich → graph persisted
    await registry.activatePlugin("obsidian", { profileDir });
    const docs1 = await getMdDocuments();
    await registry.runEnrichMetadata(docs1);

    // Verify graph file exists on disk
    const graph1 = await loadLinkGraph(profileDir);
    expect(Object.keys(graph1)).toHaveLength(3);
    expect(graph1["alpha"]!.outgoing).toContain("beta");
    expect(graph1["alpha"]!.outgoing).toContain("gamma");
    expect(graph1["beta"]!.incoming).toContain("alpha");

    // Deactivate → graph deleted
    await registry.deactivatePlugin("obsidian");
    const graphDeleted = await loadLinkGraph(profileDir);
    expect(Object.keys(graphDeleted)).toHaveLength(0);

    // Reactivate → rebuilds from vault files
    await registry.activatePlugin("obsidian", { profileDir });
    const docs2 = await getMdDocuments();
    await registry.runEnrichMetadata(docs2);
    const graph2 = await loadLinkGraph(profileDir);
    expect(Object.keys(graph2)).toHaveLength(3);
    expect(graph2["alpha"]!.outgoing).toContain("beta");
  });

  // -----------------------------------------------------------------------
  // 4. Embed syntax excluded from link graph
  // -----------------------------------------------------------------------

  it("excludes ![[embed]] syntax from link graph", async () => {
    const notes = new Map<string, string>([
      ["main.md", "See [[real-link]] for reference.\n\n![[embedded-image]]\n"],
      ["real-link.md", "Content here."],
      ["embedded-image.md", "This should NOT be linked from main.md."],
    ]);
    await writeNotes(notes);

    const plugin = createObsidianPlugin({ readVaultFile });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);
    await registry.activatePlugin("obsidian", { profileDir });
    const docs = await getMdDocuments();
    const metadata = await registry.runEnrichMetadata(docs);

    // main.md should have outgoing link to "real-link" only
    const mainDoc = docs.find((d) => d.title === "main");
    const mainMeta = metadata.get(mainDoc!.documentId)!;
    const outgoing = mainMeta.find((e) => e.key === "links:outgoing");
    expect(outgoing).toBeDefined();
    expect(JSON.parse(outgoing!.value)).toContain("real-link");
    expect(JSON.parse(outgoing!.value)).not.toContain("embedded-image");

    // embedded-image should have no backlinks
    const embedDoc = docs.find((d) => d.title === "embedded-image");
    const embedMeta = metadata.get(embedDoc!.documentId);
    expect(embedMeta).toBeUndefined(); // no metadata if no backlinks and no frontmatter
  });

  // -----------------------------------------------------------------------
  // 5. Path-qualified links normalized
  // -----------------------------------------------------------------------

  it("normalizes folder/Note links in wiki-link graph", async () => {
    const notes = new Map<string, string>([
      ["index.md", `---
tags: [index]
---
See [[projects/beta]] and [[notes/gamma]].
`],
      ["beta.md", `---
category: project
---
This is beta. Links to [[index]].
`],
      ["gamma.md", "This is gamma."],
    ]);
    await writeNotes(notes);

    const plugin = createObsidianPlugin({ readVaultFile });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);
    await registry.activatePlugin("obsidian", { profileDir });
    const docs = await getMdDocuments();
    const metadata = await registry.runEnrichMetadata(docs);

    // index.md should link to "beta" (normalized from "projects/beta")
    const indexDoc = docs.find((d) => d.title === "index");
    const indexMeta = metadata.get(indexDoc!.documentId)!;
    const outgoing = indexMeta.find((e) => e.key === "links:outgoing");
    expect(outgoing).toBeDefined();
    const targets = JSON.parse(outgoing!.value) as string[];
    expect(targets).toContain("beta");
    expect(targets).toContain("gamma");

    // beta should have backlink from "index"
    const betaDoc = docs.find((d) => d.title === "beta");
    const betaMeta = metadata.get(betaDoc!.documentId)!;
    const backlinks = betaMeta.find((e) => e.key === "links:backlinks");
    expect(backlinks).toBeDefined();
    expect(JSON.parse(backlinks!.value)).toContain("index");
  });

  // -----------------------------------------------------------------------
  // 6. Vault file read failure is graceful
  // -----------------------------------------------------------------------

  it("handles file read failure gracefully — other notes still enriched", async () => {
    const notes = new Map<string, string>([
      ["good-note.md", `---
tags: [good]
---
This note is fine. Links to [[broken]].
`],
      // broken-note.md is NOT written — will fail on read
    ]);
    await writeNotes(notes);

    let readCount = 0;
    const selectiveReader = async (path: string): Promise<string | undefined> => {
      readCount++;
      if (path.includes("broken-note")) return undefined;
      return readVaultFile(path);
    };

    const plugin = createObsidianPlugin({ readVaultFile: selectiveReader });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);
    await registry.activatePlugin("obsidian", { profileDir });
    const docs = await getMdDocuments();
    const metadata = await registry.runEnrichMetadata(docs);

    // good-note should still be enriched (no crash)
    const goodDoc = docs.find((d) => d.title === "good-note");
    const goodMeta = metadata.get(goodDoc!.documentId)!;
    const tags = goodMeta.find((e) => e.key === "frontmatter:tags");
    expect(tags).toBeDefined();
    expect(JSON.parse(tags!.value)).toEqual(["good"]);

    // outgoing link to "broken" should NOT appear (target not in graph)
    const outgoing = goodMeta.find((e) => e.key === "links:outgoing");
    expect(outgoing).toBeUndefined(); // broken note not in graph → no resolved links
  });

  // -----------------------------------------------------------------------
  // 7. Empty vault returns empty metadata
  // -----------------------------------------------------------------------

  it("returns empty metadata when vault has no .md files", async () => {
    const plugin = createObsidianPlugin({ readVaultFile });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);
    await registry.activatePlugin("obsidian", { profileDir });
    const docs = await getMdDocuments(); // empty vault → 0 docs
    const metadata = await registry.runEnrichMetadata(docs);
    expect(metadata.size).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 8. Sensitivity-aware link resolution
  // -----------------------------------------------------------------------

  it("resolves links respecting sensitivity levels", async () => {
    const notes = new Map<string, string>([
      ["public-note.md", "Links to [[friends-note]] and [[private-note]]."],
      ["friends-note.md", "Links to [[private-note]]."],
      ["private-note.md", "Standalone."],
    ]);
    await writeNotes(notes);

    // Build graph directly from file contents
    const notesContent = new Map<string, string>();
    for (const [name, content] of notes) {
      notesContent.set(name.replace(".md", ""), content);
    }
    const graph = buildLinkGraph(notesContent);

    const sensitivity: NoteSensitivityMap = new Map([
      ["public-note", "public"],
      ["friends-note", "friends"],
      ["private-note", "private"],
    ]);

    // Public viewer: only sees links to public targets (no public targets here)
    const publicLinks = resolveLinksWithSensitivity("public-note", graph, sensitivity, "public");
    expect(publicLinks).toEqual([]); // friends-note is friends, private-note is private

    // Friends viewer: sees public + friends
    const friendsLinks = resolveLinksWithSensitivity("public-note", graph, sensitivity, "friends");
    expect(friendsLinks).toEqual(["friends-note"]); // private-note still hidden

    // Private (owner) viewer: sees all
    const privateLinks = resolveLinksWithSensitivity("public-note", graph, sensitivity, "private");
    expect(privateLinks).toContain("friends-note");
    expect(privateLinks).toContain("private-note");

    // Backlinks: friends-note has backlink from public-note (visible to all)
    const friendsBacklinks = resolveBacklinksWithSensitivity("friends-note", graph, sensitivity, "public");
    expect(friendsBacklinks).toContain("public-note");

    // Backlinks: private-note has backlinks from public-note (visible) and friends-note (not visible to public)
    const privateBacklinks = resolveBacklinksWithSensitivity("private-note", graph, sensitivity, "public");
    expect(privateBacklinks).toEqual(["public-note"]); // only public-note source is public

    const privateBacklinksOwner = resolveBacklinksWithSensitivity("private-note", graph, sensitivity, "private");
    expect(privateBacklinksOwner).toContain("public-note");
    expect(privateBacklinksOwner).toContain("friends-note");
  });

  // -----------------------------------------------------------------------
  // 9. filterContentLinks strips private wiki-links
  // -----------------------------------------------------------------------

  it("strips private wiki-links but preserves accessible ones", async () => {
    const notesContent = new Map<string, string>([
      ["index", `Check out [[PublicArticle]] for info, and [[PrivateJournal|my diary]] for thoughts.`],
      ["PublicArticle", "Public content."],
      ["PrivateJournal", "Private content."],
    ]);
    const graph = buildLinkGraph(notesContent);

    const sensitivity: NoteSensitivityMap = new Map([
      ["PublicArticle", "public"],
      ["PrivateJournal", "private"],
    ]);

    const markdown = notesContent.get("index")!;
    const filtered = filterContentLinks(markdown, graph, sensitivity, "public");

    // Public link preserved, private link stripped to alias text
    expect(filtered).toContain("[[PublicArticle]]");
    expect(filtered).toContain("my diary");
    expect(filtered).not.toContain("[[PrivateJournal");
  });

  // -----------------------------------------------------------------------
  // 10. BFS traversal respects maxDepth
  // -----------------------------------------------------------------------

  it("BFS traversal respects maxDepth and sensitivity bounds", async () => {
    // Chain: A → B → C → D
    const notesContent = new Map<string, string>([
      ["A", "See [[B]]."],
      ["B", "See [[C]]."],
      ["C", "See [[D]]."],
      ["D", "End of chain."],
    ]);
    const graph = buildLinkGraph(notesContent);

    const sensitivity: NoteSensitivityMap = new Map([
      ["A", "public"],
      ["B", "public"],
      ["C", "friends"],
      ["D", "private"],
    ]);

    // Public viewer, maxDepth=2: reaches A, B but not C (friends) or D (private)
    const publicReach = traverseLinks("A", graph, sensitivity, "public", 2);
    expect(publicReach).toEqual(new Set(["A", "B"]));

    // Friends viewer, maxDepth=2: reaches A, B, C but not D (depth 3 + private)
    const friendsReach = traverseLinks("A", graph, sensitivity, "friends", 2);
    expect(friendsReach).toEqual(new Set(["A", "B", "C"]));

    // Private viewer, maxDepth=1: reaches A, B only (depth cutoff)
    const privateReach = traverseLinks("A", graph, sensitivity, "private", 1);
    expect(privateReach).toEqual(new Set(["A", "B"]));

    // Private viewer, maxDepth=10: reaches all
    const allReach = traverseLinks("A", graph, sensitivity, "private", 10);
    expect(allReach).toEqual(new Set(["A", "B", "C", "D"]));
  });

  // -----------------------------------------------------------------------
  // 11. Frontmatter edge cases (real filesystem round-trip)
  // -----------------------------------------------------------------------

  it("handles frontmatter edge cases: missing, malformed, multiline arrays", async () => {
    const notes = new Map<string, string>([
      ["no-frontmatter.md", "Just plain content, no frontmatter.\n"],
      ["malformed.md", `---
title: no closing delimiter
This is treated as plain content.
`],
      ["multiline-tags.md", `---
tags:
  - rust
  - webassembly
  - systems
date: "2026-07-13"
count: 42
active: true
---
Body content here.
`],
    ]);
    await writeNotes(notes);

    const plugin = createObsidianPlugin({ readVaultFile });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);
    await registry.activatePlugin("obsidian", { profileDir });
    const docs = await getMdDocuments();
    const metadata = await registry.runEnrichMetadata(docs);

    // no-frontmatter: no metadata entries (no frontmatter fields to enrich)
    const noFm = docs.find((d) => d.title === "no-frontmatter");
    const noFmMeta = metadata.get(noFm!.documentId);
    expect(noFmMeta).toBeUndefined();

    // malformed: frontmatter parsing returns empty (no closing ---)
    const malformed = docs.find((d) => d.title === "malformed");
    const malformedMeta = metadata.get(malformed!.documentId);
    expect(malformedMeta).toBeUndefined();

    // multiline-tags: all fields parsed correctly
    const multi = docs.find((d) => d.title === "multiline-tags");
    const multiMeta = metadata.get(multi!.documentId)!;
    const metaMap = Object.fromEntries(multiMeta.map((e) => [e.key, e.value]));
    expect(JSON.parse(metaMap["frontmatter:tags"])).toEqual(["rust", "webassembly", "systems"]);
    expect(metaMap["frontmatter:date"]).toBe("2026-07-13");
    // count and active are number/boolean — not extracted by current enrichMetadata
    // (which only extracts tags, aliases, date, published, category)
  });

  // -----------------------------------------------------------------------
  // 12. Activate with path traversal rejected
  // -----------------------------------------------------------------------

  it("rejects activation with path-traversal vaultDir", async () => {
    const plugin = createObsidianPlugin({ readVaultFile });
    const registry = createPluginRegistry(profileDir);
    registry.registerPlugin(plugin);

    const result = await registry.activatePlugin("obsidian", {
      vaultDir: "../../etc/passwd",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("invalid");
    }

    // Plugin should be in error state
    const info = registry.getPluginInfo("obsidian");
    expect(info?.status).toBe("error");
  });

  // -----------------------------------------------------------------------
  // 13. Heading anchors stripped from wiki-link targets
  // -----------------------------------------------------------------------

  it("normalizes wiki-link targets with heading and block anchors", async () => {
    expect(normalizeWikiTarget("notes/project#Heading")).toBe("project");
    expect(normalizeWikiTarget("project#^block-id")).toBe("project");
    expect(normalizeWikiTarget("folder/note.md#Section")).toBe("note");
    expect(normalizeWikiTarget("simple")).toBe("simple");
    expect(normalizeWikiTarget("path/to/deep/note")).toBe("note");
  });

  // -----------------------------------------------------------------------
  // 14. parseWikiLinks correctly handles embed vs link
  // -----------------------------------------------------------------------

  it("parseWikiLinks skips embed syntax but captures regular links", () => {
    const markdown = `Check [[RegularLink]] and ![[EmbeddedImage]].

Also [[LinkWithAlias|Display Text]] here.

Multiple embeds: ![[img1]] ![[img2]]
`;
    const links = parseWikiLinks(markdown);

    expect(links).toHaveLength(2);
    expect(links[0]!.target).toBe("RegularLink");
    expect(links[0]!.alias).toBeUndefined();
    expect(links[1]!.target).toBe("LinkWithAlias");
    expect(links[1]!.alias).toBe("Display Text");
  });

  // -----------------------------------------------------------------------
  // 15. Sensitivity accessibility ordering
  // -----------------------------------------------------------------------

  it("enforces correct sensitivity accessibility ordering", () => {
    // public accessible to everyone
    expect(isAccessible("public", "public")).toBe(true);
    expect(isAccessible("public", "friends")).toBe(true);
    expect(isAccessible("public", "private")).toBe(true);

    // friends not accessible to public
    expect(isAccessible("friends", "public")).toBe(false);
    expect(isAccessible("friends", "friends")).toBe(true);
    expect(isAccessible("friends", "private")).toBe(true);

    // private only accessible to private
    expect(isAccessible("private", "public")).toBe(false);
    expect(isAccessible("private", "friends")).toBe(false);
    expect(isAccessible("private", "private")).toBe(true);
  });
});
