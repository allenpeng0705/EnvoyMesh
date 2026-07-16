/**
 * Phase 44D — Obsidian Knowledge Base Plugin.
 *
 * A `KnowledgeBasePlugin` implementation that:
 * 1. Parses YAML frontmatter from `.md` vault files
 * 2. Syncs `published: true/false` to the sensitivity override store
 * 3. Builds a wiki-link graph from `[[wiki-links]]` in note content
 * 4. Enriches vault document metadata with frontmatter data + link info
 *
 * Config (passed during `activate()`):
 * ```json
 * {
 *   "vaultDir": "/path/to/vault",
 *   "profileDir": "/path/to/profile",
 *   "autoSyncPublished": true
 * }
 * ```
 *
 * The plugin reads `.md` files from the vault, parses them, and writes:
 * - Sensitivity overrides (via callback, not direct store access — keeps
 *   the package dependency-free beyond `@envoymesh/api`)
 * - Link graph to `{profileDir}/plugins/obsidian/link-graph.json`
 */

import { readFile } from "node:fs/promises"
import { basename, extname, sep } from "node:path"
import type {
  KbPluginActivateResult,
  KbPluginMetadataEntry,
  KbPluginMetadataMap,
  KnowledgeBasePlugin,
} from "@envoymesh/api"
import {
  parseFrontmatter,
  frontmatterString,
  frontmatterStringArray,
  frontmatterBoolean,
  type ParsedFrontmatter,
} from "./frontmatter.js"
import {
  buildLinkGraph,
  loadLinkGraph,
  saveLinkGraph,
  deleteLinkGraph,
  resolveLinksForNote,
  getBacklinks,
  type LinkGraph,
} from "./wiki-links.js"
import {
  resolveLinksWithSensitivity,
  resolveBacklinksWithSensitivity,
  traverseLinks,
  type SensitivityLevel,
  type NoteSensitivityMap,
  type NoteSensitivityMap as SensitivityMap,
} from "./link-resolver.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback invoked when the plugin detects a `published` frontmatter field. */
export type SensitivitySyncCallback = (
  documentId: string,
  published: boolean,
) => Promise<void>;

/** Callback to read the vault directory content for a specific file. */
export type ReadVaultFileCallback = (
  relativePath: string,
) => Promise<string | undefined>;

export interface ObsidianPluginConfig {
  /** Absolute path to the vault root directory. */
  vaultDir?: string
  /** Absolute path to the profile directory (for link graph storage). */
  profileDir?: string
  /** When true, automatically sync `published` to sensitivity overrides. */
  autoSyncPublished?: boolean
}

// ---------------------------------------------------------------------------
// Note index (in-memory during activation)
// ---------------------------------------------------------------------------

interface NoteEntry {
  /** Relative path from vault root (e.g. "notes/project.md"). */
  relativePath: string
  /** Filename without extension (used as wiki-link target). */
  title: string
  /** Parsed frontmatter. */
  frontmatter: ParsedFrontmatter
  /** Raw markdown content (full file). */
  rawContent: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface ObsidianPluginDeps {
  /** Called to read a vault file's content by relative path. */
  readVaultFile: ReadVaultFileCallback
  /** Called to set sensitivity based on `published` frontmatter. */
  onSensitivitySync?: SensitivitySyncCallback
}

/**
 * Create the Obsidian KB plugin.
 *
 * The plugin is stateless between calls — it rebuilds the note index
 * from the vault on each `enrichMetadata()` invocation. The link graph
 * is persisted to disk and incrementally updated.
 */
export function createObsidianPlugin(deps: ObsidianPluginDeps): KnowledgeBasePlugin {
  // Cached note index (rebuilt on each enrichMetadata call).
  let notes = new Map<string, NoteEntry>()
  let graph: LinkGraph = {}
  let profileDir: string | undefined

  // ---------------------------------------------------------------------------
  // Internal: rebuild note index from vault
  // ---------------------------------------------------------------------------

  async function rebuildNoteIndex(
    documents: Array<{
      documentId: string
      relativePath: string
      extension: string
    }>,
  ): Promise<void> {
    const newNotes = new Map<string, NoteEntry>()

    for (const doc of documents) {
      if (doc.extension !== ".md") continue

      try {
        const content = await deps.readVaultFile(doc.relativePath)
        if (!content) continue

        const frontmatter = parseFrontmatter(content)
        const title = basename(doc.relativePath, extname(doc.relativePath))

        newNotes.set(title, {
          relativePath: doc.relativePath,
          title,
          frontmatter,
          rawContent: content,
        })
      } catch {
        // Individual file errors are non-fatal.
      }
    }

    notes = newNotes
  }

  // ---------------------------------------------------------------------------
  // Internal: sync published → sensitivity
  // ---------------------------------------------------------------------------

  async function syncPublishedFrontmatter(): Promise<void> {
    if (!deps.onSensitivitySync) return

    for (const [, entry] of notes) {
      const published = frontmatterBoolean(entry.frontmatter.data, "published")
      if (published !== undefined) {
        try {
          await deps.onSensitivitySync(entry.relativePath, published)
        } catch {
          // Non-fatal — individual sync failures don't block other notes.
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: rebuild link graph
  // ---------------------------------------------------------------------------

  async function rebuildGraph(): Promise<void> {
    // Collect title → full markdown content for graph builder.
    const notesContent = new Map<string, string>()
    for (const [, entry] of notes) {
      notesContent.set(entry.title, entry.rawContent)
    }

    graph = buildLinkGraph(notesContent)

    // Persist to disk if we have a profile dir.
    if (profileDir) {
      await saveLinkGraph(profileDir, graph)
    }
  }

  // ---------------------------------------------------------------------------
  // Plugin implementation
  // ---------------------------------------------------------------------------

  const plugin: KnowledgeBasePlugin = {
    id: "obsidian",
    displayName: "Obsidian",
    description: "YAML frontmatter parsing, wiki-link graph, and published-note sensitivity sync",
    version: "1.0.0",

    async activate(config: Record<string, unknown>): Promise<KbPluginActivateResult> {
      const cfg = config as ObsidianPluginConfig

      if (cfg.vaultDir) {
        // Validate vaultDir doesn't escape expected bounds.
        if (cfg.vaultDir.includes("..") || cfg.vaultDir.includes(sep + "envoy" + sep)) {
          return { ok: false, reason: "vaultDir path is invalid" }
        }
      }

      profileDir = cfg.profileDir as string | undefined

      // Load existing link graph from disk (if available).
      if (profileDir) {
        graph = await loadLinkGraph(profileDir)
      }

      return { ok: true }
    },

    async deactivate(): Promise<void> {
      // Clean up persisted link graph.
      if (profileDir) {
        await deleteLinkGraph(profileDir)
      }
      notes.clear()
      graph = {}
    },

    async enrichMetadata(documents: Array<{
      documentId: string
      relativePath: string
      title: string
      extension: string
      byteLength: number
    }>): Promise<KbPluginMetadataMap> {
      const meta = new Map<string, KbPluginMetadataEntry[]>()

      // Only process .md files.
      const mdDocs = documents.filter((d) => d.extension === ".md")
      if (mdDocs.length === 0) return meta

      // Rebuild note index.
      await rebuildNoteIndex(mdDocs)

      // Sync published frontmatter → sensitivity overrides.
      await syncPublishedFrontmatter()

      // Rebuild link graph.
      await rebuildGraph()

      // Enrich each document with frontmatter metadata and link info.
      for (const doc of mdDocs) {
        const title = basename(doc.relativePath, extname(doc.relativePath))
        const note = notes.get(title)
        if (!note) continue

        const entries: KbPluginMetadataEntry[] = []

        // --- Frontmatter fields ---
        const fm = note.frontmatter.data

        const tags = frontmatterStringArray(fm, "tags")
        if (tags && tags.length > 0) {
          entries.push({
            pluginId: "obsidian",
            key: "frontmatter:tags",
            value: JSON.stringify(tags),
          })
        }

        const aliases = frontmatterStringArray(fm, "aliases")
        if (aliases && aliases.length > 0) {
          entries.push({
            pluginId: "obsidian",
            key: "frontmatter:aliases",
            value: JSON.stringify(aliases),
          })
        }

        const date = frontmatterString(fm, "date")
        if (date) {
          entries.push({
            pluginId: "obsidian",
            key: "frontmatter:date",
            value: date,
          })
        }

        const published = frontmatterBoolean(fm, "published")
        if (published !== undefined) {
          entries.push({
            pluginId: "obsidian",
            key: "frontmatter:published",
            value: String(published),
          })
        }

        const category = frontmatterString(fm, "category")
        if (category) {
          entries.push({
            pluginId: "obsidian",
            key: "frontmatter:category",
            value: category,
          })
        }

        // --- Link graph info ---
        const outgoing = resolveLinksForNote(title, graph)
        if (outgoing.length > 0) {
          entries.push({
            pluginId: "obsidian",
            key: "links:outgoing",
            value: JSON.stringify(outgoing),
          })
        }

        const backlinks = getBacklinks(title, graph)
        if (backlinks.length > 0) {
          entries.push({
            pluginId: "obsidian",
            key: "links:backlinks",
            value: JSON.stringify(backlinks),
          })
        }

        if (entries.length > 0) {
          meta.set(doc.documentId, entries)
        }
      }

      return meta
    },
  }

  return plugin
}

// ---------------------------------------------------------------------------
// Re-export traversal helpers for agent use
// ---------------------------------------------------------------------------

export {
  resolveLinksWithSensitivity,
  resolveBacklinksWithSensitivity,
  traverseLinks,
  type SensitivityLevel,
  type NoteSensitivityMap,
}

export type {
  LinkGraph,
}
