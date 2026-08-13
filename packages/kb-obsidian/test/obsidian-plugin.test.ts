/** @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createObsidianPlugin } from "../src/obsidian-plugin.js"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  loadLinkGraph,
  deleteLinkGraph,
} from "../src/wiki-links.js"

// ---------------------------------------------------------------------------
// Test vault files (simulated)
// ---------------------------------------------------------------------------

const VAULT_FILES = new Map<string, string>([
  [
    "notes/project-alpha.md",
    `---
title: Project Alpha
tags: [work, active]
published: true
date: 2024-06-15
---

# Project Alpha

This is the main project note.

See [[notes/project-beta]] and [[notes/private-diary]] for context.

Also related: [[notes/research]].
`,
  ],
  [
    "notes/project-beta.md",
    `---
title: Project Beta
tags: [work, active]
published: true
aliases: [P-Beta, Beta]
---

# Project Beta

Linked from [[notes/project-alpha]].

Research notes in [[notes/research]].
`,
  ],
  [
    "notes/private-diary.md",
    `---
title: Private Diary
published: false
tags: [personal]
---

# Private Diary

This is private.

See [[notes/project-alpha]].
`,
  ],
  [
    "notes/research.md",
    `---
title: Research Notes
category: reference
published: true
---

# Research

No wiki-links here, just content.
`,
  ],
  // Non-markdown file — should be ignored.
  [
    "notes/data.csv",
    `id,name
1,test
`,
  ],
])

function createReadVaultFile() {
  return async (relativePath: string): Promise<string | undefined> => {
    return VAULT_FILES.get(relativePath)
  }
}

describe("createObsidianPlugin", () => {
  it("has correct plugin metadata", () => {
    const plugin = createObsidianPlugin({ readVaultFile: createReadVaultFile() })
    expect(plugin.id).toBe("obsidian")
    expect(plugin.displayName).toBe("Obsidian")
    expect(plugin.version).toBe("1.0.0")
  })

  it("activates successfully with valid config", async () => {
    const plugin = createObsidianPlugin({ readVaultFile: createReadVaultFile() })
    const result = await plugin.activate({ profileDir: "/tmp/test-profile" })
    expect(result.ok).toBe(true)
  })

  it("rejects activation with path traversal in vaultDir", async () => {
    const plugin = createObsidianPlugin({ readVaultFile: createReadVaultFile() })
    const result = await plugin.activate({ vaultDir: "/foo/../etc/passwd" })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("invalid")
  })

  it("enriches metadata for markdown files", async () => {
    const plugin = createObsidianPlugin({ readVaultFile: createReadVaultFile() })
    await plugin.activate({})

    const documents = [
      {
        documentId: "doc-1",
        relativePath: "notes/project-alpha.md",
        title: "Project Alpha",
        extension: ".md",
        byteLength: 200,
      },
      {
        documentId: "doc-2",
        relativePath: "notes/research.md",
        title: "Research Notes",
        extension: ".md",
        byteLength: 100,
      },
      {
        documentId: "doc-3",
        relativePath: "notes/data.csv",
        title: "Data",
        extension: ".csv",
        byteLength: 20,
      },
    ]

    const meta = await plugin.enrichMetadata(documents)

    // doc-1 (project-alpha) should have frontmatter + links
    expect(meta.has("doc-1")).toBe(true)
    const entries1 = meta.get("doc-1")!
    expect(entries1.some(e => e.key === "frontmatter:tags")).toBe(true)
    expect(entries1.some(e => e.key === "frontmatter:date")).toBe(true)
    expect(entries1.some(e => e.key === "frontmatter:published")).toBe(true)
    expect(entries1.some(e => e.key === "links:outgoing")).toBe(true)

    // doc-2 (research) should have frontmatter but no links
    expect(meta.has("doc-2")).toBe(true)
    const entries2 = meta.get("doc-2")!
    expect(entries2.some(e => e.key === "frontmatter:category")).toBe(true)
    expect(entries2.some(e => e.key === "frontmatter:published")).toBe(true)

    // doc-3 (data.csv) should not be enriched (non-markdown)
    expect(meta.has("doc-3")).toBe(false)
  })

  it("produces correct link metadata", async () => {
    const plugin = createObsidianPlugin({ readVaultFile: createReadVaultFile() })
    await plugin.activate({})

    const documents = [
      {
        documentId: "doc-alpha",
        relativePath: "notes/project-alpha.md",
        title: "Project Alpha",
        extension: ".md",
        byteLength: 200,
      },
      {
        documentId: "doc-beta",
        relativePath: "notes/project-beta.md",
        title: "Project Beta",
        extension: ".md",
        byteLength: 150,
      },
      {
        documentId: "doc-diary",
        relativePath: "notes/private-diary.md",
        title: "Private Diary",
        extension: ".md",
        byteLength: 100,
      },
    ]

    const meta = await plugin.enrichMetadata(documents)

    // project-alpha has outgoing links (targets normalized to note titles)
    const alphaMeta = meta.get("doc-alpha")!
    const outgoing = alphaMeta.find(e => e.key === "links:outgoing")
    expect(outgoing).toBeDefined()
    const outgoingTargets = JSON.parse(outgoing!.value)
    // [[notes/project-beta]] → project-beta, [[notes/private-diary]] → private-diary
    // [[notes/research]] → research (but research note not in this document set → filtered out)
    expect(outgoingTargets).toContain("project-beta")
    expect(outgoingTargets).toContain("private-diary")
    expect(outgoingTargets).not.toContain("notes/research")

    // project-beta should have backlinks (from project-alpha, normalized)
    const betaMeta = meta.get("doc-beta")!
    const backlinks = betaMeta.find(e => e.key === "links:backlinks")
    expect(backlinks).toBeDefined()
    const backlinkSources = JSON.parse(backlinks!.value)
    expect(backlinkSources).toContain("project-alpha")
  })

  it("syncs published frontmatter via callback", async () => {
    const syncCalls: Array<{ documentId: string; published: boolean }> = []
    const onSensitivitySync = async (documentId: string, published: boolean) => {
      syncCalls.push({ documentId, published })
    }

    const plugin = createObsidianPlugin({
      readVaultFile: createReadVaultFile(),
      onSensitivitySync,
    })
    await plugin.activate({})

    const documents = [
      {
        documentId: "doc-1",
        relativePath: "notes/project-alpha.md",
        title: "Project Alpha",
        extension: ".md",
        byteLength: 200,
      },
      {
        documentId: "doc-2",
        relativePath: "notes/private-diary.md",
        title: "Private Diary",
        extension: ".md",
        byteLength: 100,
      },
    ]

    await plugin.enrichMetadata(documents)

    expect(syncCalls).toHaveLength(2)
    expect(syncCalls.find(c => c.documentId === "doc-1")!.published).toBe(true)
    expect(syncCalls.find(c => c.documentId === "doc-2")!.published).toBe(false)
  })

  it("continues on individual file read errors", async () => {
    let callCount = 0
    const faultyReader = async (relativePath: string): Promise<string | undefined> => {
      callCount++
      if (callCount === 1) throw new Error("disk error")
      return VAULT_FILES.get(relativePath)
    }

    const plugin = createObsidianPlugin({ readVaultFile: faultyReader })
    await plugin.activate({})

    const documents = [
      {
        documentId: "doc-1",
        relativePath: "notes/project-alpha.md",
        title: "Project Alpha",
        extension: ".md",
        byteLength: 200,
      },
      {
        documentId: "doc-2",
        relativePath: "notes/project-beta.md",
        title: "Project Beta",
        extension: ".md",
        byteLength: 150,
      },
    ]

    // Should not throw despite first read failing
    const meta = await plugin.enrichMetadata(documents)
    // doc-1 failed, doc-2 should still be enriched
    expect(meta.has("doc-2")).toBe(true)
  })
})

describe("plugin lifecycle with persisted graph", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "kb-obsidian-lifecycle-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("persists link graph on deactivate and deletes on cleanup", async () => {
    const plugin = createObsidianPlugin({ readVaultFile: createReadVaultFile() })
    await plugin.activate({ profileDir: tmpDir })

    const documents = [
      {
        documentId: "doc-1",
        relativePath: "notes/project-alpha.md",
        title: "Project Alpha",
        extension: ".md",
        byteLength: 200,
      },
      {
        documentId: "doc-2",
        relativePath: "notes/project-beta.md",
        title: "Project Beta",
        extension: ".md",
        byteLength: 150,
      },
    ]

    await plugin.enrichMetadata(documents)

    // Graph should now be on disk.
    const graph1 = await loadLinkGraph(tmpDir)
    expect(Object.keys(graph1).length).toBeGreaterThan(0)

    // Deactivate should delete the graph.
    await plugin.deactivate()
    const graph2 = await loadLinkGraph(tmpDir)
    expect(Object.keys(graph2).length).toBe(0)
  })

  it("rebuilds graph after deactivation and reactivation", async () => {
    const plugin = createObsidianPlugin({ readVaultFile: createReadVaultFile() })

    await plugin.activate({ profileDir: tmpDir })
    const meta1 = await plugin.enrichMetadata([
      {
        documentId: "doc-1",
        relativePath: "notes/project-alpha.md",
        title: "Project Alpha",
        extension: ".md",
        byteLength: 200,
      },
    ])
    await plugin.deactivate()

    // Reactivate
    await plugin.activate({ profileDir: tmpDir })
    const meta2 = await plugin.enrichMetadata([
      {
        documentId: "doc-1",
        relativePath: "notes/project-alpha.md",
        title: "Project Alpha",
        extension: ".md",
        byteLength: 200,
      },
    ])

    // Both should produce same results
    expect(meta1.get("doc-1")!.length).toBe(meta2.get("doc-1")!.length)
  })
})

describe("enrichMetadata edge cases", () => {
  it("returns empty map for empty document list", async () => {
    const plugin = createObsidianPlugin({ readVaultFile: createReadVaultFile() })
    await plugin.activate({})
    const meta = await plugin.enrichMetadata([])
    expect(meta.size).toBe(0)
  })

  it("returns empty map when no markdown files", async () => {
    const plugin = createObsidianPlugin({ readVaultFile: createReadVaultFile() })
    await plugin.activate({})
    const meta = await plugin.enrichMetadata([
      {
        documentId: "doc-csv",
        relativePath: "data.csv",
        title: "Data",
        extension: ".csv",
        byteLength: 20,
      },
    ])
    expect(meta.size).toBe(0)
  })

  it("handles markdown file with no frontmatter and no links", async () => {
    const reader = async (_relativePath: string) => "# Plain note\n\nNo frontmatter here.\n"
    const plugin = createObsidianPlugin({ readVaultFile: reader })
    await plugin.activate({})

    const meta = await plugin.enrichMetadata([
      {
        documentId: "doc-plain",
        relativePath: "plain.md",
        title: "Plain",
        extension: ".md",
        byteLength: 40,
      },
    ])

    // No frontmatter, no links → no metadata entries → not in map.
    expect(meta.has("doc-plain")).toBe(false)
  })
})
